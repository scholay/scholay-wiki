package agentrun

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"
)

// ── 纯逻辑单测(不碰 DB)。DB 相关的原子认领 / 串行 / 租约回收由 repo_sqlite_test.go 覆盖。

func TestIsTerminal(t *testing.T) {
	for _, s := range []string{StatusDone, StatusFailed, StatusCanceled} {
		if !IsTerminal(s) {
			t.Fatalf("%s should be terminal", s)
		}
	}
	for _, s := range []string{StatusPlanning, StatusRunning, StatusAwaitingUser} {
		if IsTerminal(s) {
			t.Fatalf("%s should NOT be terminal", s)
		}
	}
}

func TestSagaIDPrefixIsStable(t *testing.T) {
	// 🔴 前缀是跨组件契约:ReconcileLeases 用 `run:%` 只回收 Run 引擎的步。
	// 改了前缀会让 reconciler 要么回收不到自己的步(Run 永久卡死),
	// 要么回收别的编排的步(破坏 peerreview 自己的状态机)。
	if got := SagaIDFor(42); got != "run:42" {
		t.Fatalf("saga id = %q, want run:42", got)
	}
	if !strings.HasPrefix(SagaIDFor(1), "run:") {
		t.Fatal("saga id must keep the run: prefix (ReconcileLeases filters on it)")
	}
}

func TestTemplateValidate(t *testing.T) {
	ok := RunTemplate{Key: "deep", Steps: []StepDef{{Key: "a"}, {Key: "b"}}}
	if err := ok.Validate(); err != nil {
		t.Fatalf("valid template rejected: %v", err)
	}
	// 重复 step_key 会在 uk_saga_step 上撞唯一键 —— 必须在注册期就拒绝,不能拖到用户请求里。
	dup := RunTemplate{Key: "deep", Steps: []StepDef{{Key: "a"}, {Key: "a"}}}
	if err := dup.Validate(); !errors.Is(err, ErrStepDupKey) {
		t.Fatalf("duplicate step key must be rejected, got %v", err)
	}
	if err := (RunTemplate{Key: "x"}).Validate(); !errors.Is(err, ErrTemplateNoSteps) {
		t.Fatal("empty steps must be rejected")
	}
	if err := (RunTemplate{Steps: []StepDef{{Key: "a"}}}).Validate(); !errors.Is(err, ErrTemplateNoKey) {
		t.Fatal("empty template key must be rejected")
	}
}

func TestFindTemplateDoesNotFallBack(t *testing.T) {
	// 🔴 找不到就是找不到 —— 绝不"用第一个兜底"。
	// 兜底会让一个拼错的 template_key 静默跑成**另一种形态**,用户拿到他没要的东西。
	list := []RunTemplate{{Key: "a"}, {Key: "b"}}
	if _, ok := FindTemplate(list, "zzz"); ok {
		t.Fatal("FindTemplate must not fall back to any template")
	}
}

type fakeProbe struct {
	inUse, max int
	err        error
}

func (f fakeProbe) Snapshot(context.Context) (int, int, error) { return f.inUse, f.max, f.err }

func TestYieldToInteractive(t *testing.T) {
	cases := []struct {
		name      string
		probe     SlotProbe
		wantYield bool
		why       string
	}{
		{"满槽必须让路", fakeProbe{inUse: 2, max: 2}, true, ""},
		{"只剩最后一个槽也要让 —— 那个槽留给真人", fakeProbe{inUse: 1, max: 2}, true,
			"inUse >= max-1 是刻意的:Run 是后台任务,不该和等在屏幕前的用户抢最后一个槽"},
		{"完全空闲才动", fakeProbe{inUse: 0, max: 2}, false, ""},
		{"探针失败按槽紧张处理(保守)", fakeProbe{err: errors.New("boom")}, true,
			"探不到就不抢:宁可 Run 慢,不可真人卡住"},
		{"max<=0 视为不可用", fakeProbe{inUse: 0, max: 0}, true, ""},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			e := NewEngine(nil, nil, c.probe, "test")
			if got := e.yieldToInteractive(context.Background()); got != c.wantYield {
				t.Fatalf("yield = %v, want %v. %s", got, c.wantYield, c.why)
			}
		})
	}
}

func TestIsStepIncompleteMatchesExecutorCode(t *testing.T) {
	// 🔴 跨包契约:agent 侧 turnLoop 在 maxRounds 在场时发 code="step_incomplete"。
	// 这个判据认不出它,每一步的正常分页都会被当成失败重排队 → attempt 耗尽 → Run 判死,
	// 而日志看起来像"模型总是失败"。agent 侧由 src/turn/stepPaging.test.ts 对咬。
	if !isStepIncomplete(errors.New(`agent error code=step_incomplete msg=...`)) {
		t.Fatal("must recognise the executor's step_incomplete signal")
	}
	if isStepIncomplete(errors.New("code=round_cap")) {
		t.Fatal("round_cap is a terminal error, NOT paging — must not be treated as incomplete")
	}
	if isStepIncomplete(nil) {
		t.Fatal("nil error is not incomplete")
	}
}

func TestBuildStepPromptCarriesOriginalRequest(t *testing.T) {
	run := AgentRun{Request: "帮我做一篇关于肠道菌群与抑郁的系统综述"}
	tpl := RunTemplate{Title: "深度研究", Steps: []StepDef{{Key: "search", Brief: "检索"}, {Key: "write", Brief: "成文"}}}
	p := BuildStepPrompt(run, tpl, tpl.Steps[0], 1)

	// ① 原始诉求必须在 —— Step 是独立 turn,看不到上一步的对话历史。
	if !strings.Contains(p, run.Request) {
		t.Fatal("step prompt must carry the user's original request (steps do not share conversation history)")
	}
	// ② 产物路径必须明确且与判据同源。
	if !strings.Contains(p, StepArtifactPath("search")) {
		t.Fatal("step prompt must name the artifact path")
	}
	// ③ 首次不该出现"续做"字样(否则模型会去 Read 一个不存在的文件)。
	if strings.Contains(p, "续做") {
		t.Fatal("attempt=1 must not be described as a retry")
	}
}

func TestBuildStepPromptRetryTellsItToContinue(t *testing.T) {
	run := AgentRun{Request: "x"}
	tpl := RunTemplate{Title: "T", Steps: []StepDef{{Key: "s", Brief: "b"}}}
	p := BuildStepPrompt(run, tpl, tpl.Steps[0], 3)
	// 🔴 重试必须明说是续做 —— 不说的话重试 = 从零重做,把上一次的成果覆盖掉,
	// 而分页语义恰恰是"接着做"。
	if !strings.Contains(p, "续做") || !strings.Contains(p, "不要从头重来") {
		t.Fatal("retry prompt must tell the model to continue from the existing artifact, not restart")
	}
}

func TestStepArtifactPathIsSingleSource(t *testing.T) {
	// prompt 与判据必须用同一份路径:模型写到 A、引擎去 B 找 = 判据永远不达标。
	if StepArtifactPath("k") != "run/steps/k.md" {
		t.Fatalf("unexpected artifact path %q", StepArtifactPath("k"))
	}
}

// 并发安全:Register 与调度可能同时发生在 bootstrap 期。
func TestRegisterIsNilSafe(t *testing.T) {
	e := NewEngine(nil, nil, nil, "")
	var wg sync.WaitGroup
	wg.Add(1)
	go func() { defer wg.Done(); e.Register(nil) }()
	wg.Wait()
	if len(e.execs) != 0 {
		t.Fatal("nil executor must not be registered")
	}
}

func TestEngineIDDefaults(t *testing.T) {
	e := NewEngine(nil, nil, nil, "")
	if e.id == "" {
		t.Fatal("executor id must default to something traceable")
	}
	_ = time.Now()
}

// 2026-08-02 审计回归:默认必须**关闭**(opt-in)。
func TestEngineIsOptInByDefault(t *testing.T) {
	t.Setenv("AGENTRUN_ENABLED", "")
	if engineEnabled() {
		t.Fatal("Run 引擎默认必须关闭 —— 默认开会在部署当天变成任意登录用户可触发的洞:\n" +
			"本包零配额接线 + ws_serverside 把用量兜底记成 peer_review/user_id 空,\n" +
			"而 Run 对用户 100% 不可见 ⇒ 承担全部风险、收获零价值")
	}
	t.Setenv("AGENTRUN_ENABLED", "on")
	if !engineEnabled() {
		t.Fatal("显式 on 必须能打开")
	}
	t.Setenv("AGENTRUN_ENABLED", "off")
	if engineEnabled() {
		t.Fatal("显式 off 必须关闭")
	}
}

// 用量归属必须显式绑定用户 —— 不绑会记成 peer_review 且 user_id 为空(永久追不回)。
type spyExec struct {
	boundUser uint64
	called    bool
}

func (s *spyExec) FeatureKey() string             { return "claw" }
func (s *spyExec) SessionBusy(string) bool        { return false }
func (s *spyExec) WithUser(u uint64) StepExecutor { s.boundUser = u; return s }
func (s *spyExec) RunStep(_ context.Context, _, _ string, _ int) (string, error) {
	s.called = true
	return "ok", nil
}

func TestStepExecutorInterfaceRequiresWithUser(t *testing.T) {
	// 编译期即保证:任何 StepExecutor 实现都必须提供 WithUser。
	var _ StepExecutor = (*spyExec)(nil)
	s := &spyExec{}
	got := s.WithUser(42)
	if s.boundUser != 42 || got == nil {
		t.Fatal("WithUser 必须绑定用户并返回可用执行器")
	}
}
