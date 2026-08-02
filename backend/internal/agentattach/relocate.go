// ============================================================================
// agentattach — 跨会话附件「按需物化到当前会话 cwd」(2026-07-31 线上审计 §五 排期项)
//
// 线上症状:4 个重度用户 / 10 轮 / 31 次权限拒绝。用户在 prism 的 A 对话上传 4 个 .docx,
// 切到 B 对话后发送,附件路径仍是 /home/bun/sessions/<A>/uploads/x.docx;而这一轮跑在 B 的
// workDir 下 —— agentbridge 的权限层按**本会话 cwd 前缀**比对 (ws.go pathWithin),必然全拒。
// 模型于是对用户说「技术层面上我无法打开它们」,而该轮 status 仍是 complete,前端不会告诉
// 用户 AI 根本没读到文件 —— 用户只看到 AI 在道歉。
//
// 治本方向(**不放宽权限边界**):投递时把外来附件**物化进当前轮的会话 cwd**,让路径永远同源。
// 权限层一行不用改,AI 也永远读得到。同类先例:reference.go 的 materializePaper 把用户文献库
// 物化进会话 cwd。
//
// 三条硬约束(审计原文):
//   ① 幂等 —— 同一附件多次引用不重复拷贝。落点名带上传期 UUID 前缀(upload.go storedName),
//      「同名 + 同大小」即同一份;探测走目录清单(ListWorkspaceFiles),不读字节。
//   ② 尊重会话工作区配额 —— 写入走 PutWorkspaceFile,agent 侧 assertSessionQuota 三道帽
//      (单文件 64MB / 会话 1GB / 2000 文件)照常生效,413 → ErrSessionQuotaExceeded → 用户文案。
//   ③ 失败必须用户可见 —— 全批次「要么全部成功、要么明确报错」。EnsureLocal 返回 error 时
//      调用方**不得转发该轮**,而要回一帧带用户可读 message 的 error 帧。绝不静默 complete,
//      也绝不用兜底话术糊弄。
//
// ⚠️ 安全:srcSessionID 是从**用户可控**的 attachments[].path 里解析出来的。物化前必须
// OwnsSession 校验源会话归属同一 (user, feature),否则这里就是一条跨租户读取的口子。
//
// ── 与 agentbridge 的契约(本包不能反向被 import:agentattach → agentbridge 是单向依赖)──
// agentbridge 侧需要三处配合(属并行代理的文件面,本批次不改):
//
//	1) spec.go 声明接缝(鸭子类型,无需 import 本包):
//	     type AttachmentRelocator interface {
//	         EnsureLocal(ctx context.Context, userID uint, sessionID, sessionWorkDir string,
//	                     paths []string) ([]string, error)
//	     }
//	     // FeatureSpec 加一个字段 AttachmentRelocator(nil = 不启用,行为等同今天)
//	2) hub.go handleUserMessage:位置是**配额校验(PreUserMessage)通过之后、foldUserAttachments
//	   之前** —— 配额先行才不会为一条注定被拒的消息白拷几十 MB;fold 之前才来得及改写路径。
//	   取出 attachments[].path,用 workDir = path.Join(agentSessionWorkdirRoot(), h.sessionID)
//	   (与 decidePermission 传给 pathWithin 的**同一个字符串**,这点是硬要求:两者一旦不同源
//	   就会重现「批了却打不开」)调 EnsureLocal,把返回的新路径写回帧上的 attachments[].path,再 fold。
//	   出错 → 不转发本轮(不 beginTurn、不计额度),sendSelf 一帧:
//	     {type:"error", code:"attachment_unavailable", message:<用户文案>, retryable:false}
//	   用户文案取法(无需 import 本包):
//	     if ue, ok := err.(interface{ UserMessage() string }); ok { msg = ue.UserMessage() }
//	3) bootstrap.go 每个带附件的 feature 一行:spec.AttachmentRelocator = agentattach.NewRelocator(feature)
//
// EnsureLocal 是同步的(在转发前跑),全部附件都已在本会话时**零 HTTP 调用**直接返回 —— 常态
// 路径无额外开销;只有真的跨会话才付拷贝成本,且拷完即幂等,后续轮次只剩两次目录清单。
// ============================================================================

package agentattach

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path"
	"regexp"
	"strings"
	"time"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/agentbridge"
)

const (
	// relocateDir —— 跨会话附件在本会话 cwd 里的固定落点(单层目录)。
	// 固定落点而非「原样保留源相对路径」是刻意的安全收窄:srcRel 来自用户可控路径,
	// 原样映射等于给了一个「往本会话任意相对路径写文件」的原语(可覆盖 prism 的
	// document.md / references.bib 等工作区文件)。收到 uploads/ 一层后,写入面只剩
	// 「附件专用目录 + 上传期 UUID 前缀名」。prism 的上传本就落这里(bootstrap WithSubdir)。
	relocateDir = "uploads"

	// maxRelocateBytes —— 单个附件可跨会话物化的大小上限,对齐 agent 端 workspace.ts 的
	// RAW_CAP(20MB):超过它 ReadWorkspaceFileRaw 会回 state=too_large、拿不到字节。
	// 上传上限是 30MB,故 20~30MB 的附件跨对话复用**做不到** —— 提前按大小拦下并给出
	// 「请在当前对话直接上传」的可执行指引,而不是让它走到读字节再失败。
	maxRelocateBytes = 20 * 1024 * 1024

	// maxRelocateBatch —— 单轮最多物化多少个外来附件,与 hub 的 maxWsAttachments 同口径。
	maxRelocateBatch = 10

	// relocateTimeout —— 整批物化的硬超时(同步跑在转发前,不能无界拖住一轮)。
	relocateTimeout = 60 * time.Second

	// sandboxWorkAlias —— bwrap 沙箱把本会话 cwd bind 到 /work。与 agentbridge/ws.go 的
	// 同名常量、agent/src/sandbox/confine.ts 的入站翻译是同一条规则:/work/... 已经等价于
	// 本会话 cwd,权限层会放行,故这里视为「已在本会话」,不物化、不改写。
	sandboxWorkAlias = "/work"
)

// AttachmentError —— 附件不可用的**终局**错误(不可自愈,调用方应据此拒绝本轮)。
//
// msg 是面向用户的可执行文案:按 friendly-error-messages 铁律,**绝不含上游 err 文本**;
// 上游原因只进 slog(newAttachError 落一条 Warn)与 Unwrap(供 errors.Is/As)。
type AttachmentError struct {
	msg   string
	cause error
}

func (e *AttachmentError) Error() string       { return e.msg }
func (e *AttachmentError) UserMessage() string { return e.msg }
func (e *AttachmentError) Unwrap() error       { return e.cause }

// newAttachError 造终局错误,并在 cause 非 nil 时就地记一条 Warn —— 用户文案里丢掉的
// 上游细节必须在日志里留底,否则线上排查只剩一句中文。
func newAttachError(msg string, cause error, attrs ...any) *AttachmentError {
	if cause != nil {
		slog.Warn("agentattach relocate: 附件物化失败", append([]any{"user_message", msg, "err", cause}, attrs...)...)
	}
	return &AttachmentError{msg: msg, cause: cause}
}

// relocateDeps —— Relocator 依赖的最小面。生产由 FeatureBridge 满足;拆出接口是为了让
// 物化引擎(幂等 / 配额 / 归属)能在没有 DB 与 agent 容器的情况下被单测覆盖。
type relocateDeps interface {
	client() agent.Executor
	owns(userID uint, sessionID string) (bool, error)
	key() string
}

type featureDeps struct{ f *agentbridge.FeatureBridge }

// client 每次现取(而不是构造时缓存):Bridge.SetExecutorRouting 可能在 bootstrap 里
// 晚于本对象装配,缓存会绑到错误的执行后端。
func (d featureDeps) client() agent.Executor                { return d.f.AgentClient() }
func (d featureDeps) owns(u uint, sid string) (bool, error) { return d.f.OwnsSession(u, sid) }
func (d featureDeps) key() string                           { return d.f.Spec().Key }

// Relocator —— 跨会话附件物化器。每个带附件的 feature 一个(与 Uploader/Referencer 同装配点)。
type Relocator struct{ deps relocateDeps }

// NewRelocator 造一个绑定到该 feature 的物化器。
func NewRelocator(feature *agentbridge.FeatureBridge) *Relocator {
	if feature == nil {
		return nil
	}
	return &Relocator{deps: featureDeps{f: feature}}
}

// EnsureLocal 把 paths 里**不属于本会话 cwd**的附件物化进本会话,返回等长、逐项改写后的路径。
//
//   - sessionID:本轮所在会话(agent HTTP 调用的 key)
//   - sessionWorkDir:本会话 cwd 绝对路径。调用方必须传**它自己拿去做权限比对的那一个字符串**
//     (agentbridge: path.Join(agentSessionWorkdirRoot(), sessionID)),否则物化出来的路径可能
//     仍过不了权限层 —— 这正是本次要修的病。
//
// 全部本地 → 原样返回,零 HTTP 调用。任一附件无法物化 → 返回 *AttachmentError,调用方
// **不得转发本轮**,应把 UserMessage() 回给用户(要么成功要么明确报错,不留「AI 道歉但轮次
// complete」的静默断层)。
func (r *Relocator) EnsureLocal(ctx context.Context, userID uint, sessionID, sessionWorkDir string, paths []string) ([]string, error) {
	if r == nil || r.deps == nil {
		// 装配缺失是编码错误,不能退化成「静默放行」—— 那等于把今天的病留在原地。
		return nil, newAttachError("附件功能暂不可用,请刷新页面后重试", errors.New("agentattach: relocator not wired"))
	}
	out := append([]string(nil), paths...)
	if len(paths) == 0 {
		return out, nil
	}
	if sessionID == "" || sessionWorkDir == "" {
		return nil, newAttachError("会话尚未就绪,请刷新页面后重试",
			fmt.Errorf("agentattach: empty sessionID=%q workDir=%q", sessionID, sessionWorkDir))
	}

	type job struct {
		idx        int
		srcSession string
		srcRel     string
	}
	var jobs []job
	for i, p := range paths {
		kind, srcSession, srcRel := classifyAttachmentPath(p, sessionID, sessionWorkDir)
		switch kind {
		case attachLocal:
			continue
		case attachForeign:
			jobs = append(jobs, job{idx: i, srcSession: srcSession, srcRel: srcRel})
		default:
			return nil, newAttachError("附件路径无法识别,请重新上传后再发送",
				fmt.Errorf("agentattach: unrecognized attachment path %q", p),
				"feature", r.deps.key(), "session_id", sessionID)
		}
	}
	if len(jobs) == 0 {
		return out, nil // 常态:附件本就在本会话 cwd,零开销
	}
	if len(jobs) > maxRelocateBatch {
		return nil, newAttachError(fmt.Sprintf("一次最多复用 %d 个历史对话的附件,请减少后重试", maxRelocateBatch),
			fmt.Errorf("agentattach: %d foreign attachments exceed batch cap", len(jobs)),
			"feature", r.deps.key(), "session_id", sessionID)
	}

	ctx, cancel := context.WithTimeout(ctx, relocateTimeout)
	defer cancel()

	st := &relocateState{
		client: r.deps.client(),
		owned:  map[string]bool{},
		dirs:   map[string]map[string]int64{},
		done:   map[string]string{},
	}
	for _, j := range jobs {
		abs, err := r.relocateOne(ctx, st, userID, sessionID, sessionWorkDir, j.srcSession, j.srcRel)
		if err != nil {
			return nil, err
		}
		out[j.idx] = abs
	}
	return out, nil
}

// relocateState —— 一批物化过程内的缓存:会话归属判定、目录清单、已物化项。
type relocateState struct {
	client agent.Executor
	owned  map[string]bool             // srcSessionID → 是否属于本 (user, feature)
	dirs   map[string]map[string]int64 // "<sessionID>|<relDir>" → name → size(目录只列一次)
	done   map[string]string           // "<srcSessionID>/<srcRel>" → 本会话绝对路径(批内去重)
}

func (r *Relocator) relocateOne(ctx context.Context, st *relocateState, userID uint, sessionID, sessionWorkDir, srcSession, srcRel string) (string, error) {
	if abs, ok := st.done[srcSession+"/"+srcRel]; ok {
		return abs, nil // 同一附件在一条消息里被引用多次 → 只拷一次
	}

	// ① 归属:srcSession 来自用户可控路径,必须属于同一 (user, feature)。
	//    否则本函数就是一条「把别人会话里的文件拷进自己 cwd」的跨租户读取原语。
	ownedSrc, cached := st.owned[srcSession]
	if !cached {
		o, err := r.deps.owns(userID, srcSession)
		if err != nil {
			return "", newAttachError("附件校验失败,请稍后重试", err,
				"feature", r.deps.key(), "src_session", srcSession)
		}
		st.owned[srcSession] = o
		ownedSrc = o
	}
	if !ownedSrc {
		slog.Warn("agentattach relocate: 拒绝引用不属于本账号的会话文件",
			"feature", r.deps.key(), "user_id", userID, "session_id", sessionID,
			"src_session", srcSession, "src_rel", srcRel)
		return "", newAttachError("该附件不属于当前账号,请重新上传后再发送", nil)
	}

	name := path.Base(srcRel)
	if name == "" || name == "." || name == ".." || strings.ContainsAny(name, `/\`) {
		return "", newAttachError("附件名无法识别,请重新上传后再发送",
			fmt.Errorf("agentattach: bad attachment basename %q", srcRel))
	}
	display := displayAttachmentName(name)
	dstRel := relocateDir + "/" + name
	dstAbs := path.Join(path.Clean(sessionWorkDir), dstRel)

	// ② 源文件大小:走目录清单拿,不读字节 —— 超限时能在付出传输成本**之前**就明确报错。
	srcSize, found, err := st.sizeOf(ctx, srcSession, path.Dir(srcRel), name)
	if err != nil {
		return "", newAttachError("读取附件失败,请稍后重试", err,
			"feature", r.deps.key(), "src_session", srcSession, "src_rel", srcRel)
	}
	if !found {
		return "", newAttachError(
			fmt.Sprintf("附件「%s」所在的历史对话已被清理,请在当前对话重新上传", display), nil)
	}
	if srcSize > maxRelocateBytes {
		return "", newAttachError(
			fmt.Sprintf("附件「%s」超过 %dMB,无法跨对话复用,请在当前对话直接上传",
				display, maxRelocateBytes/1024/1024), nil)
	}

	// ③ 幂等:本会话已有同名同大小 → 直接复用(名字带上传期 UUID 前缀,同名即同一份)。
	if dstSize, dstFound, derr := st.sizeOf(ctx, sessionID, relocateDir, name); derr == nil && dstFound && dstSize == srcSize {
		st.done[srcSession+"/"+srcRel] = dstAbs
		return dstAbs, nil
	} else if derr != nil {
		return "", newAttachError("读取会话文件失败,请稍后重试", derr,
			"feature", r.deps.key(), "session_id", sessionID)
	}

	// ④ 拷贝:源读原始字节 → 写进本会话 cwd(PutWorkspaceFile 保留相对路径、按需建目录,
	//    且走 agent 端 assertSessionQuota,配额帽照常生效)。
	raw, err := st.client.ReadWorkspaceFileRaw(ctx, srcSession, srcRel)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			return "", newAttachError(
				fmt.Sprintf("附件「%s」所在的历史对话已被清理,请在当前对话重新上传", display), err)
		}
		return "", newAttachError("读取附件失败,请稍后重试", err,
			"feature", r.deps.key(), "src_session", srcSession, "src_rel", srcRel)
	}
	if raw == nil || raw.State != "ok" {
		state := ""
		if raw != nil {
			state = raw.State
		}
		return "", newAttachError(
			fmt.Sprintf("附件「%s」已无法读取,请在当前对话重新上传", display),
			fmt.Errorf("agentattach: source read state=%q", state),
			"feature", r.deps.key(), "src_session", srcSession, "src_rel", srcRel)
	}
	if err := st.client.PutWorkspaceFile(ctx, sessionID, dstRel, raw.Bytes); err != nil {
		if errors.Is(err, agent.ErrSessionQuotaExceeded) {
			// 与 upload.go 同款文案口径:配额是用户可自救的稳定状态,不走 infra 脱敏。
			return "", newAttachError("当前会话的文件空间已满, 请删除部分历史文件、新开会话后再上传", err)
		}
		return "", newAttachError("附件写入当前对话失败,请稍后重试", err,
			"feature", r.deps.key(), "session_id", sessionID, "dst_rel", dstRel)
	}

	st.remember(sessionID, relocateDir, name, int64(len(raw.Bytes)))
	st.done[srcSession+"/"+srcRel] = dstAbs
	slog.Info("agentattach relocate: 跨会话附件已物化进当前对话",
		"feature", r.deps.key(), "user_id", userID, "session_id", sessionID,
		"src_session", srcSession, "src_rel", srcRel, "dst_rel", dstRel, "bytes", len(raw.Bytes))
	return dstAbs, nil
}

// sizeOf 取 <sessionID>/<relDir>/<name> 的字节数(目录清单缓存,每个目录只列一次)。
// found=false 表示该目录下没有这个文件(目录不存在 / 会话已被清理 同样落这里)。
func (st *relocateState) sizeOf(ctx context.Context, sessionID, relDir, name string) (int64, bool, error) {
	if relDir == "." || relDir == "/" {
		relDir = ""
	}
	key := sessionID + "|" + relDir
	entries, ok := st.dirs[key]
	if !ok {
		tree, err := st.client.ListWorkspaceFiles(ctx, sessionID, relDir)
		if err != nil {
			if errors.Is(err, agent.ErrSessionNotFound) {
				entries = map[string]int64{} // 会话已不在 → 等价于空目录,由调用方给「已被清理」文案
			} else {
				return 0, false, err
			}
		} else {
			entries = map[string]int64{}
			// State: ok | missing | error。missing = 目录还不存在(如首次物化前的 uploads/),
			// 按空目录处理;error 是真故障,不能当「文件不存在」吞掉。
			if tree != nil && tree.State == "error" {
				return 0, false, fmt.Errorf("agentattach: list %s/%s failed: state=error", sessionID, relDir)
			}
			if tree != nil {
				for _, e := range tree.Entries {
					if !e.IsDirectory {
						entries[e.Name] = e.Size
					}
				}
			}
		}
		st.dirs[key] = entries
	}
	size, found := entries[name]
	return size, found, nil
}

// remember 把刚写入的文件补进目录缓存,让同批次后续项的幂等判定看到它。
func (st *relocateState) remember(sessionID, relDir, name string, size int64) {
	key := sessionID + "|" + relDir
	if st.dirs[key] == nil {
		st.dirs[key] = map[string]int64{}
	}
	st.dirs[key][name] = size
}

// ─── 路径分类 ─────────────────────────────────────────────────────────────

type attachKind int

const (
	attachLocal   attachKind = iota // 已在本会话 cwd(相对路径 / cwd 子树 / /work 别名)
	attachForeign                   // 落在**别的会话** cwd —— 需要物化
	attachAlien                     // 既不在本会话、也不在会话根下 —— 非法,拒绝
)

// classifyAttachmentPath 判定一个 attachments[].path 相对本会话的位置。
//
// 判据与 agentbridge 权限层的 pathWithin 严格同构(相对路径 = 相对 cwd;/work 是本会话 cwd
// 的沙箱别名;绝对路径 Clean 后前缀比对),这样「分类为 local」与「权限层会放行」是同一件事。
//
// 外来路径的解析靠一个结构事实:会话 cwd 恒为 <SESSIONS_ROOT>/<sessionId>(全部 feature 都
// 不设 SessionOptions.WorkDir),故 root = path.Dir(workDir),外来路径必形如 <root>/<别的sid>/<rel>。
// workDir 的 basename 与 sessionID 不一致时(自定义 workDir)不做任何猜测,直接判 alien。
func classifyAttachmentPath(p, sessionID, workDir string) (kind attachKind, srcSession, srcRel string) {
	p = strings.TrimSpace(p)
	if p == "" {
		return attachAlien, "", ""
	}
	if !path.IsAbs(p) {
		// 相对路径 = 相对本会话 cwd;Clean 后仍以 ".." 开头才是逃逸。
		if strings.HasPrefix(path.Clean(p), "..") {
			return attachAlien, "", ""
		}
		return attachLocal, "", ""
	}
	cleaned := path.Clean(p)
	root := path.Clean(workDir)
	if root == "" || root == "/" {
		return attachAlien, "", ""
	}
	// /work 别名:权限层已把它整片映射回本会话 cwd,视为本地(不物化、不改写)。
	if root != sandboxWorkAlias && !strings.HasPrefix(root, sandboxWorkAlias+"/") {
		if cleaned == sandboxWorkAlias || strings.HasPrefix(cleaned, sandboxWorkAlias+"/") {
			return attachLocal, "", ""
		}
	}
	if cleaned == root || strings.HasPrefix(cleaned, root+"/") {
		return attachLocal, "", ""
	}
	if path.Base(root) != sessionID {
		return attachAlien, "", "" // 自定义 workDir:无法可靠反推会话根,不猜
	}
	sessionsRoot := path.Dir(root)
	if sessionsRoot == "" || sessionsRoot == "/" || sessionsRoot == "." {
		return attachAlien, "", ""
	}
	rest, ok := strings.CutPrefix(cleaned, sessionsRoot+"/")
	if !ok {
		return attachAlien, "", ""
	}
	sid, rel, ok := strings.Cut(rest, "/")
	if !ok || sid == "" || rel == "" || sid == sessionID {
		return attachAlien, "", ""
	}
	return attachForeign, sid, rel
}

// storedNamePrefix —— upload.go 的落盘名 = <uuid>-<原名>。展示给用户时剥掉 UUID 前缀,
// 否则错误文案里出现的是一串乱码而不是用户认得的文件名。
var storedNamePrefix = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-`)

func displayAttachmentName(stored string) string {
	if loc := storedNamePrefix.FindStringIndex(stored); loc != nil && loc[1] < len(stored) {
		return stored[loc[1]:]
	}
	return stored
}
