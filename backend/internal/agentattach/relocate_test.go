// ============================================================================
// agentattach — 跨会话附件物化的单测(2026-07-31 线上审计 §五 排期项)。
//
// 覆盖两层:
//   1. classifyAttachmentPath 纯逻辑 —— 「本地 / 外来 / 非法」三分,与权限层 pathWithin 同构;
//   2. EnsureLocal 引擎 —— 归属校验、幂等(不重复拷贝)、超限预拦、配额译文、失败不静默。
// 用 stub Executor(嵌 agent.Executor 接口,只实现用到的三个方法)+ stub deps,
// 不需要 DB 与 agent 容器。
// ============================================================================

package agentattach

import (
	"context"
	"errors"
	"strings"
	"testing"

	"scholar-backend/internal/agent"
)

const (
	testWorkRoot = "/home/bun/sessions"
	testSelf     = "sess-B"
	testOther    = "sess-A"
	testSelfDir  = testWorkRoot + "/" + testSelf
)

func TestClassifyAttachmentPath(t *testing.T) {
	cases := []struct {
		name     string
		in       string
		wantKind attachKind
		wantSess string
		wantRel  string
	}{
		{"本会话 cwd 内", testSelfDir + "/uploads/x.docx", attachLocal, "", ""},
		{"本会话 cwd 根", testSelfDir + "/a.pdf", attachLocal, "", ""},
		{"相对路径视为相对 cwd", "uploads/x.docx", attachLocal, "", ""},
		{"沙箱 /work 别名", "/work/uploads/x.docx", attachLocal, "", ""},
		// 线上原样:prism 一项目多对话,A 对话上传、B 对话发送
		{"别的会话 cwd", testWorkRoot + "/" + testOther + "/uploads/x.docx", attachForeign, testOther, "uploads/x.docx"},
		{"别的会话 cwd 根", testWorkRoot + "/" + testOther + "/x.docx", attachForeign, testOther, "x.docx"},
		{"会话根外的绝对路径", "/etc/passwd", attachAlien, "", ""},
		{"会话根本身", testWorkRoot, attachAlien, "", ""},
		{"会话根下无相对部分", testWorkRoot + "/" + testOther, attachAlien, "", ""},
		{"相对路径逃逸", "../sess-A/uploads/x.docx", attachAlien, "", ""},
		{"空", "", attachAlien, "", ""},
		// .. 折算后落回本会话 → 本地(与 pathWithin 的 Clean 先行同构)
		{"折算后回到本会话", testSelfDir + "/uploads/../a.pdf", attachLocal, "", ""},
		// .. 折算后跑到别的会话 → 外来(不是「非法」,物化即可)
		{"折算后落到别的会话", testSelfDir + "/../" + testOther + "/uploads/x.docx", attachForeign, testOther, "uploads/x.docx"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			kind, sess, rel := classifyAttachmentPath(tc.in, testSelf, testSelfDir)
			if kind != tc.wantKind || sess != tc.wantSess || rel != tc.wantRel {
				t.Fatalf("classify(%q) = (%v,%q,%q); want (%v,%q,%q)",
					tc.in, kind, sess, rel, tc.wantKind, tc.wantSess, tc.wantRel)
			}
		})
	}
}

func TestDisplayAttachmentName(t *testing.T) {
	if got := displayAttachmentName("3f6b1c2a-9d4e-4a1b-8c7d-0e1f2a3b4c5d-中文文献.docx"); got != "中文文献.docx" {
		t.Fatalf("UUID 前缀应被剥离, got %q", got)
	}
	if got := displayAttachmentName("plain.docx"); got != "plain.docx" {
		t.Fatalf("无前缀名应原样返回, got %q", got)
	}
}

// ─── stub ────────────────────────────────────────────────────────────────

type stubExec struct {
	agent.Executor                              // 未实现的方法一旦被调用会 panic —— 正是我们想要的「意料外调用」暴露方式
	files          map[string]map[string][]byte // sessionID → relPath → bytes
	listCalls      int
	readCalls      int
	putCalls       int
	putErr         error
}

func (s *stubExec) ListWorkspaceFiles(_ context.Context, sessionID, relDir string) (*agent.WorkspaceTree, error) {
	s.listCalls++
	sess, ok := s.files[sessionID]
	if !ok {
		return nil, agent.ErrSessionNotFound
	}
	tree := &agent.WorkspaceTree{State: "ok", Path: relDir}
	for rel, b := range sess {
		dir, name := splitRel(rel)
		if dir != relDir {
			continue
		}
		tree.Entries = append(tree.Entries, agent.WorkspaceTreeEntry{Name: name, Path: rel, Size: int64(len(b))})
	}
	if len(tree.Entries) == 0 {
		tree.State = "missing"
	}
	return tree, nil
}

func (s *stubExec) ReadWorkspaceFileRaw(_ context.Context, sessionID, relPath string) (*agent.WorkspaceRawFile, error) {
	s.readCalls++
	sess, ok := s.files[sessionID]
	if !ok {
		return nil, agent.ErrSessionNotFound
	}
	b, ok := sess[relPath]
	if !ok {
		return &agent.WorkspaceRawFile{State: "missing", Path: relPath}, nil
	}
	return &agent.WorkspaceRawFile{State: "ok", Path: relPath, Size: int64(len(b)), Bytes: b}, nil
}

func (s *stubExec) PutWorkspaceFile(_ context.Context, sessionID, relPath string, content []byte) error {
	s.putCalls++
	if s.putErr != nil {
		return s.putErr
	}
	if s.files[sessionID] == nil {
		s.files[sessionID] = map[string][]byte{}
	}
	s.files[sessionID][relPath] = content
	return nil
}

func splitRel(rel string) (dir, name string) {
	if i := strings.LastIndex(rel, "/"); i >= 0 {
		return rel[:i], rel[i+1:]
	}
	return "", rel
}

type stubDeps struct {
	exec    *stubExec
	ownedBy map[string]bool // sessionID → 归属本 user/feature
}

func (d stubDeps) client() agent.Executor                { return d.exec }
func (d stubDeps) owns(_ uint, sid string) (bool, error) { return d.ownedBy[sid], nil }
func (d stubDeps) key() string                           { return "prism" }

func newFixture(putErr error) (*Relocator, *stubExec) {
	ex := &stubExec{
		files: map[string]map[string][]byte{
			testOther: {"uploads/uuid-中文文献.docx": []byte("docx-bytes")},
			testSelf:  {},
		},
		putErr: putErr,
	}
	return &Relocator{deps: stubDeps{exec: ex, ownedBy: map[string]bool{testOther: true, testSelf: true}}}, ex
}

// ─── EnsureLocal ─────────────────────────────────────────────────────────

func TestEnsureLocalPassesThroughLocalPaths(t *testing.T) {
	r, ex := newFixture(nil)
	in := []string{testSelfDir + "/uploads/a.pdf", "b.md", "/work/c.txt"}
	out, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, in)
	if err != nil {
		t.Fatalf("本地附件不该报错: %v", err)
	}
	for i := range in {
		if out[i] != in[i] {
			t.Fatalf("本地路径不该被改写: %q → %q", in[i], out[i])
		}
	}
	// 常态零开销硬要求:全部本地时不得有任何 agent HTTP 调用。
	if ex.listCalls+ex.readCalls+ex.putCalls != 0 {
		t.Fatalf("本地路径不该触发 agent 调用, got list=%d read=%d put=%d", ex.listCalls, ex.readCalls, ex.putCalls)
	}
}

func TestEnsureLocalMaterializesForeignAttachment(t *testing.T) {
	r, ex := newFixture(nil)
	src := testWorkRoot + "/" + testOther + "/uploads/uuid-中文文献.docx"
	out, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{src})
	if err != nil {
		t.Fatalf("跨会话附件应被物化: %v", err)
	}
	want := testSelfDir + "/uploads/uuid-中文文献.docx"
	if out[0] != want {
		t.Fatalf("路径应改写到本会话 cwd: got %q want %q", out[0], want)
	}
	if string(ex.files[testSelf]["uploads/uuid-中文文献.docx"]) != "docx-bytes" {
		t.Fatal("字节应被完整拷进本会话")
	}
	// 改写后的路径必须过得了权限层的同构判据(否则等于没修)
	if kind, _, _ := classifyAttachmentPath(out[0], testSelf, testSelfDir); kind != attachLocal {
		t.Fatal("改写后的路径必须落在本会话 cwd 内")
	}
}

func TestEnsureLocalIsIdempotent(t *testing.T) {
	r, ex := newFixture(nil)
	src := testWorkRoot + "/" + testOther + "/uploads/uuid-中文文献.docx"

	if _, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{src}); err != nil {
		t.Fatalf("首轮物化失败: %v", err)
	}
	firstPuts, firstReads := ex.putCalls, ex.readCalls

	// 第二轮(用户在同一对话里再次发送同一批附件):同名同大小 → 不得重复拷贝。
	if _, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{src}); err != nil {
		t.Fatalf("二轮失败: %v", err)
	}
	if ex.putCalls != firstPuts || ex.readCalls != firstReads {
		t.Fatalf("同一附件不得重复拷贝: put %d→%d read %d→%d", firstPuts, ex.putCalls, firstReads, ex.readCalls)
	}

	// 同一条消息里重复引用同一附件 → 批内也只拷一次。
	if _, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{src, src, src}); err != nil {
		t.Fatalf("批内重复引用失败: %v", err)
	}
	if ex.putCalls != firstPuts {
		t.Fatalf("批内重复引用不得重复拷贝, put=%d", ex.putCalls)
	}
}

func TestEnsureLocalRejectsForeignOwner(t *testing.T) {
	r, ex := newFixture(nil)
	r.deps = stubDeps{exec: ex, ownedBy: map[string]bool{testSelf: true}} // sess-A 不归本账号
	src := testWorkRoot + "/" + testOther + "/uploads/uuid-中文文献.docx"
	_, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{src})
	if err == nil {
		t.Fatal("越权引用他人会话文件必须拒绝")
	}
	if ex.readCalls != 0 || ex.putCalls != 0 {
		t.Fatal("归属校验必须先于任何字节读取")
	}
	assertUserFacing(t, err, "不属于当前账号")
}

func TestEnsureLocalRejectsOversizeBeforeReading(t *testing.T) {
	r, ex := newFixture(nil)
	ex.files[testOther]["uploads/uuid-big.pdf"] = make([]byte, maxRelocateBytes+1)
	src := testWorkRoot + "/" + testOther + "/uploads/uuid-big.pdf"
	_, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{src})
	if err == nil {
		t.Fatal("超过读取上限的附件必须明确报错,而不是让模型说打不开")
	}
	if ex.readCalls != 0 {
		t.Fatal("超限应在目录清单阶段拦下,不该付出传输成本")
	}
	assertUserFacing(t, err, "请在当前对话直接上传")
}

func TestEnsureLocalReportsMissingSourceSession(t *testing.T) {
	r, _ := newFixture(nil)
	src := testWorkRoot + "/sess-GONE/uploads/uuid-x.docx"
	r.deps = stubDeps{
		exec:    r.deps.(stubDeps).exec,
		ownedBy: map[string]bool{testSelf: true, "sess-GONE": true},
	}
	_, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{src})
	if err == nil {
		t.Fatal("源会话已清理时必须明确报错")
	}
	assertUserFacing(t, err, "重新上传")
}

func TestEnsureLocalMapsQuotaError(t *testing.T) {
	r, _ := newFixture(agent.ErrSessionQuotaExceeded)
	src := testWorkRoot + "/" + testOther + "/uploads/uuid-中文文献.docx"
	_, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{src})
	if err == nil {
		t.Fatal("配额满必须报错")
	}
	assertUserFacing(t, err, "文件空间已满")
}

func TestEnsureLocalRejectsAlienPath(t *testing.T) {
	r, _ := newFixture(nil)
	_, err := r.EnsureLocal(context.Background(), 7, testSelf, testSelfDir, []string{"/etc/passwd"})
	if err == nil {
		t.Fatal("会话根外的绝对路径必须拒绝")
	}
	assertUserFacing(t, err, "无法识别")
}

// assertUserFacing 锁住 friendly-error-messages 铁律:错误文案是给用户看的中文可执行指引,
// 不得夹带上游 err 文本(agentattach: / dial tcp / status 之类)。
func assertUserFacing(t *testing.T, err error, want string) {
	t.Helper()
	var ae *AttachmentError
	if !errors.As(err, &ae) {
		t.Fatalf("应返回 *AttachmentError, got %T", err)
	}
	msg := ae.UserMessage()
	if !strings.Contains(msg, want) {
		t.Fatalf("用户文案应包含 %q, got %q", want, msg)
	}
	for _, leak := range []string{"agentattach:", "agent:", "dial tcp", "status "} {
		if strings.Contains(msg, leak) {
			t.Fatalf("用户文案泄漏内部细节 %q: %q", leak, msg)
		}
	}
}
