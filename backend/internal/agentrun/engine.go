package agentrun

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/agentbridge"
	"scholar-backend/internal/common/safego"
)

// ── 旋钮(运行期读 env,与仓库既有姿态一致:改 env 重启即生效,且单测可覆盖)────────
//
// 🔴 全局默认 1 而不是 2:全容器只有 **2 个 turn 槽**(agent/src/server/admission.ts:13)。
//
//	设 2 就意味着两个 Run 可以把槽占满,交互用户(真人在等)会被挤到 busy。
//	Run 是后台长任务,**天然应该给前台让路** —— 这不是保守,是优先级。
func maxActiveRuns() int {
	if v, err := strconv.Atoi(os.Getenv("AGENTRUN_MAX_ACTIVE")); err == nil && v > 0 {
		return v
	}
	return 1
}

// 每个 Run 认领一步后持有的租约。到期未续 = worker 被认为已死,reconciler 回收。
// 比单步预期耗时长若干倍:误判成"死了"会导致同一步被跑两遍(烧两份钱)。
func stepLease() time.Duration {
	if v, err := strconv.Atoi(os.Getenv("AGENTRUN_STEP_LEASE_SEC")); err == nil && v > 0 {
		return time.Duration(v) * time.Second
	}
	return 15 * time.Minute
}

// 单步最多被认领几次(含分页重排队)。超过即 DLQ。
func defaultMaxRetry() int {
	if v, err := strconv.Atoi(os.Getenv("AGENTRUN_STEP_MAX_ATTEMPT")); err == nil && v > 0 {
		return v
	}
	return 8
}

// 调度轮询间隔。
func tickInterval() time.Duration {
	if v, err := strconv.Atoi(os.Getenv("AGENTRUN_TICK_SEC")); err == nil && v > 0 {
		return time.Duration(v) * time.Second
	}
	return 5 * time.Second
}

// 总开关。**默认关闭(opt-in)** —— 必须显式 AGENTRUN_ENABLED=on 才启。
//
// 🔴 2026-08-02 审计裁决:默认开会在部署当天变成一个可被任意登录用户触发的洞。
//
//	当时的实况是:路由已挂 userProtected、Run 每步走 ServerSideChatStreaming 而
//	**本包零配额接线**、ws_serverside.go 在 ctx 无 llmusage.Call 时把用量兜底记成
//	feature=peer_review 且 user_id 为零值。也就是说任何人 curl 一次就能起
//	5 步 × 最多 8 次认领 × 每步若干轮的上游消耗,**不扣他的额度、账还记到审稿头上**。
//	而 Run 目前对用户 100% 不可见(前端零消费、run_state 帧无生产方)⇒
//	开着是「承担全部风险、收获零价值」。
//
//	打开前的三个前置(缺一不可,别只看第一条):
//	  ① 本包接上配额(CreateRun 前查、每步计入),并在 ctx 注入 llmusage.Call 保证归属正确;
//	  ② 前端有 Run 进度卡 —— 否则用户看不到自己在等什么;
//	  ③ 采完 P0 指标基线,否则 Run 的用量会污染基线。
func engineEnabled() bool {
	return strings.EqualFold(os.Getenv("AGENTRUN_ENABLED"), "on")
}

// ── 依赖(窄接口,便于单测替身)─────────────────────────────────────────────────

// StepExecutor 执行一步。生产实现 = FeatureBridge.ServerSideChatStreaming(**不新建执行路径**)。
type StepExecutor interface {
	// RunStep 把 prompt 发给指定会话跑一轮,返回模型正文。
	RunStep(ctx context.Context, sessionID, prompt string, maxRounds int) (string, error)
	// SessionBusy 该会话此刻是否有实时轮在跑(用户正在对话)。Run 必须避开。
	SessionBusy(sessionID string) bool
	// FeatureKey 本执行器服务的剖面。
	FeatureKey() string
	// WithUser 返回绑定了用户归属的执行器。**每步执行前必须调** ——
	// 不绑,用量会被 ws_serverside 兜底记成 peer_review 且 user_id 为空(永久追不回)。
	WithUser(userID uint64) StepExecutor
}

// SlotProbe 读执行器容器的并发槽快照(agent 的 GET /api/admission)。
type SlotProbe interface {
	Snapshot(ctx context.Context) (inUse, max int, err error)
}

// TemplateSource 按 feature 找模板(生产实现读 FeatureSpec.RunTemplates)。
type TemplateSource interface {
	Templates(featureKey string) []RunTemplate
}

// ── 引擎 ─────────────────────────────────────────────────────────────────────

type Engine struct {
	repo  *Repo
	execs map[string]StepExecutor // featureKey → 执行器
	tpls  TemplateSource
	slots SlotProbe
	id    string // executor_id,进 step 行便于追谁在跑
}

func NewEngine(repo *Repo, tpls TemplateSource, slots SlotProbe, id string) *Engine {
	if id == "" {
		id = "runengine-" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return &Engine{repo: repo, execs: map[string]StepExecutor{}, tpls: tpls, slots: slots, id: id}
}

func (e *Engine) Register(x StepExecutor) {
	if x != nil {
		e.execs[x.FeatureKey()] = x
	}
}

// Start 起调度循环 + 租约回收。照抄 agentbridge.StartJournalReaper 的 ticker 形态。
func (e *Engine) Start(ctx context.Context) {
	if !engineEnabled() {
		slog.Info("agentrun: engine disabled by AGENTRUN_ENABLED=off")
		return
	}
	safego.Go("agentrun-scheduler", func() {
		t := time.NewTicker(tickInterval())
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				e.tick(ctx)
			}
		}
	})
	safego.Go("agentrun-reconciler", func() {
		t := time.NewTicker(2 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				rctx, cancel := context.WithTimeout(ctx, 30*time.Second)
				n, err := e.repo.ReconcileLeases(rctx)
				cancel()
				if err != nil {
					slog.Warn("agentrun: reconcile leases failed", "err", err)
				} else if n > 0 {
					slog.Info("agentrun: requeued expired steps", "count", n)
				}
			}
		}
	})
}

// yieldToInteractive —— **让路闸**。
//
// 🔴 为什么建在这里而不是在 agent 的 admission.ts 再加一道:
//
//	ServerSideChat 去抢的是**同一批已经不够的槽**;在执行器侧加第二个闸只会自锁
//	(Run 拿不到槽 → 一直重试 → 把槽的竞争变得更糟)。这里是**会排队的那一侧**,
//	发现槽紧张就干脆不认领,step 留在 pending,下个 tick 再看。
//
// 判据是 `inUse >= max-1`:**始终给交互用户留一个槽**。max=2 时 Run 只在完全空闲时才动。
// 探针失败按"槽紧张"处理(保守):探不到就不抢,宁可 Run 慢,不可真人卡住。
func (e *Engine) yieldToInteractive(ctx context.Context) bool {
	if e.slots == nil {
		return false
	}
	inUse, max, err := e.slots.Snapshot(ctx)
	if err != nil {
		slog.Debug("agentrun: slot probe failed, yielding", "err", err)
		return true
	}
	if max <= 0 {
		return true
	}
	return inUse >= max-1
}

// tick 推进一轮:挑一个可推进的 Run,认领并执行它的下一步。
// **一次 tick 至多推进一个 Run 的一步** —— 串行是刻意的(见 model.go 边界 2)。
func (e *Engine) tick(ctx context.Context) {
	if !engineEnabled() {
		return
	}
	active, err := e.repo.ActiveRunCount(ctx)
	if err != nil {
		slog.Warn("agentrun: count active runs failed", "err", err)
		return
	}
	if int(active) == 0 {
		return
	}
	if e.yieldToInteractive(ctx) {
		return // 槽紧张 → 把最后一个槽让给真人
	}

	runs, err := e.claimableRuns(ctx)
	if err != nil || len(runs) == 0 {
		return
	}
	// 取第一个能推进的:全局并发已由 maxActiveRuns 在**创建**时把关,这里只按序推进。
	for _, run := range runs {
		if e.advance(ctx, run) {
			return // 本 tick 已推进一步,收工
		}
	}
}

func (e *Engine) claimableRuns(ctx context.Context) ([]AgentRun, error) {
	out := []AgentRun{}
	err := e.repo.db.WithContext(ctx).
		Where("status IN ?", []string{StatusPlanning, StatusRunning}).
		Order("created_at ASC").Limit(16).Find(&out).Error
	return out, err
}

// advance 推进一个 Run 一步。返回是否真的执行了一步。
func (e *Engine) advance(ctx context.Context, run AgentRun) bool {
	exec, ok := e.execs[run.FeatureKey]
	if !ok {
		return false // 该 feature 没注册执行器 —— 不动它,也不判失败(可能只是本进程没装配)
	}
	// 避开该会话自己的实时轮:用户正在对话时,Run 不去插队(会撞 busy 且打断用户)。
	if exec.SessionBusy(run.AgentSessionID) {
		return false
	}

	tpl, ok := FindTemplate(e.tpls.Templates(run.FeatureKey), run.TemplateKey)
	if !ok {
		_ = e.repo.SetRunStatus(ctx, run.ID, StatusFailed, "template not found: "+run.TemplateKey)
		return false
	}

	step, err := e.repo.ClaimNextStep(ctx, run.ID, e.id, stepLease(), defaultMaxRetry())
	if err != nil {
		if err == ErrNoStepClaimed {
			e.settleIfFinished(ctx, run)
			return false
		}
		slog.Warn("agentrun: claim step failed", "run_id", run.ID, "err", err)
		return false
	}

	def, ok := findStepDef(tpl, step.StepKey)
	if !ok {
		_ = e.repo.FailStep(ctx, step.ID, "step not in template: "+step.StepKey)
		return false
	}

	if run.Status == StatusPlanning {
		_ = e.repo.SetRunStatus(ctx, run.ID, StatusRunning, "")
	}

	e.execStep(ctx, run, tpl, def, step, exec)
	return true
}

// execStep 真正跑一步:发 prompt、续租、按结果收口或重排队。
func (e *Engine) execStep(
	ctx context.Context, run AgentRun, tpl RunTemplate, def StepDef,
	step *agentbridge.SagaStepRow, exec StepExecutor,
) {
	// 执行期周期续租:一步可能跑好几分钟,不续租会被 reconciler 判成"worker 死了"而重排队,
	// 于是同一步并发跑两份。租约的一半续一次,留足容错。
	renewCtx, stopRenew := context.WithCancel(ctx)
	defer stopRenew()
	safego.Go("agentrun-lease-renew", func() {
		t := time.NewTicker(stepLease() / 2)
		defer t.Stop()
		for {
			select {
			case <-renewCtx.Done():
				return
			case <-t.C:
				if err := e.repo.RenewLease(renewCtx, step.ID, e.id, stepLease()); err != nil {
					slog.Debug("agentrun: renew lease failed", "step_id", step.ID, "err", err)
				}
			}
		}
	})

	prompt := BuildStepPrompt(run, tpl, def, step.Attempt)
	// 绑定用户归属再跑 —— 见 StepExecutor.WithUser 的注释。
	text, err := exec.WithUser(run.UserID).RunStep(ctx, run.AgentSessionID, prompt, def.MaxRounds)
	if err != nil {
		// 分页信号:轮尽不是失败,是"这一步还没做完,下次接着做"。
		// 🔴 这是整个 Run 形态的核心收益 —— 今天 round_cap 是**终结错误**,用户白等;
		//    这里它变成一次重排队,产物已落盘,下一次认领接着推进。
		if isStepIncomplete(err) {
			_ = e.repo.RequeueStep(ctx, step.ID, "step_incomplete: 轮尽分页,下次继续")
			slog.Info("agentrun: step paged out, requeued",
				"run_id", run.ID, "step", def.Key, "attempt", step.Attempt)
			return
		}
		_ = e.repo.RequeueStep(ctx, step.ID, truncate(err.Error(), 500))
		slog.Warn("agentrun: step failed, requeued",
			"run_id", run.ID, "step", def.Key, "attempt", step.Attempt, "err", err)
		return
	}

	_ = e.repo.CompleteStep(ctx, step.ID, nil, OutputRef{
		Chars: len([]rune(text)),
		Note:  truncate(firstLine(text), 200),
	})
	slog.Info("agentrun: step done", "run_id", run.ID, "step", def.Key, "chars", len([]rune(text)))
	e.settleIfFinished(ctx, run)
}

// settleIfFinished 全部步收口后把 Run 判终态。
func (e *Engine) settleIfFinished(ctx context.Context, run AgentRun) {
	steps, err := e.repo.ListSteps(ctx, run.ID)
	if err != nil || len(steps) == 0 {
		return
	}
	anyFailed, allSettled := false, true
	for _, s := range steps {
		switch s.Status {
		case StepDone:
		case StepFailed:
			anyFailed = true
		default:
			allSettled = false
		}
	}
	if !allSettled {
		return
	}
	if anyFailed {
		_ = e.repo.SetRunStatus(ctx, run.ID, StatusFailed, "one or more steps failed")
		return
	}
	_ = e.repo.SetRunStatus(ctx, run.ID, StatusDone, "")
	slog.Info("agentrun: run done", "run_id", run.ID, "steps", len(steps))
}

// ── 创建 ─────────────────────────────────────────────────────────────────────

var (
	ErrEngineDisabled = fmt.Errorf("agentrun: engine disabled")
	ErrTooManyRuns    = fmt.Errorf("agentrun: too many active runs")
	ErrUserHasRun     = fmt.Errorf("agentrun: user already has an active run")
	ErrNoTemplate     = fmt.Errorf("agentrun: template not found")
)

// CreateRun 建 Run 并展开 Step 行。**两道并发闸都在这里**,不在调度期 ——
// 创建期拒绝能给用户一个明确答复;调度期拒绝只会让 Run 静默不动、用户以为卡了。
func (e *Engine) CreateRun(
	ctx context.Context, userID uint64, featureKey, sessionID, templateKey, title, request string,
) (*AgentRun, error) {
	if !engineEnabled() {
		return nil, ErrEngineDisabled
	}
	tpl, ok := FindTemplate(e.tpls.Templates(featureKey), templateKey)
	if !ok {
		return nil, ErrNoTemplate
	}
	if err := tpl.Validate(); err != nil {
		return nil, err
	}
	if n, err := e.repo.ActiveRunCountForUser(ctx, userID); err == nil && n >= 1 {
		return nil, ErrUserHasRun
	}
	if n, err := e.repo.ActiveRunCount(ctx); err == nil && int(n) >= maxActiveRuns() {
		return nil, ErrTooManyRuns
	}
	run := &AgentRun{
		UserID: userID, FeatureKey: featureKey, AgentSessionID: sessionID,
		TemplateKey: templateKey, Status: StatusPlanning,
		Title: truncate(title, 200), Request: request,
	}
	if err := e.repo.CreateRun(ctx, run); err != nil {
		return nil, err
	}
	if err := e.repo.SeedSteps(ctx, run.ID, featureKey, tpl); err != nil {
		_ = e.repo.SetRunStatus(ctx, run.ID, StatusFailed, "seed steps failed: "+err.Error())
		return nil, err
	}
	return run, nil
}

// ── 辅助 ─────────────────────────────────────────────────────────────────────

func findStepDef(tpl RunTemplate, key string) (StepDef, bool) {
	for _, s := range tpl.Steps {
		if s.Key == key {
			return s, true
		}
	}
	return StepDef{}, false
}

// isStepIncomplete 识别执行器的分页信号(turnLoop 在 maxRounds 在场时发 code="step_incomplete")。
func isStepIncomplete(err error) bool {
	return err != nil && strings.Contains(err.Error(), "step_incomplete")
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

// ── SlotProbe 的生产实现 ──────────────────────────────────────────────────────

// HTTPSlotProbe 读 agent 的 GET /api/admission。
type HTTPSlotProbe struct {
	BaseURL string
	Token   string
	Client  *http.Client
}

func (p *HTTPSlotProbe) Snapshot(ctx context.Context) (int, int, error) {
	if p == nil || p.BaseURL == "" {
		return 0, 0, fmt.Errorf("agentrun: slot probe not configured")
	}
	cli := p.Client
	if cli == nil {
		cli = &http.Client{Timeout: 3 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(p.BaseURL, "/")+"/api/admission", nil)
	if err != nil {
		return 0, 0, err
	}
	if p.Token != "" {
		req.Header.Set("Authorization", "Bearer "+p.Token)
	}
	resp, err := cli.Do(req)
	if err != nil {
		return 0, 0, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return 0, 0, fmt.Errorf("agentrun: admission probe status %d", resp.StatusCode)
	}
	var body struct {
		Turns struct {
			InUse int `json:"inUse"`
			Max   int `json:"max"`
		} `json:"turns"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return 0, 0, err
	}
	return body.Turns.InUse, body.Turns.Max, nil
}
