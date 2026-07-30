// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package agentbridge

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	gorillaws "github.com/gorilla/websocket"

	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/llmusage"
)

// agentSessionWorkdirRoot 是 agent 容器内每会话隔离 cwd 的根 (跟 agent 端
// sessionService.isolatedSessionWorkDir 推算规则一致: <root>/<sessionId>)。
// agent 容器 HOME=/home/bun, 所以默认 /home/bun/sessions; 可用 env 覆盖。
func agentSessionWorkdirRoot() string {
	if v := os.Getenv("AGENT_SESSION_WORKDIR_ROOT"); v != "" {
		return v
	}
	return "/home/bun/sessions"
}

// frontUpgrader 升级浏览器 WS。CORS 由 nginx 同源策略兜底; CheckOrigin 是 CSWSH 二道防线。
var frontUpgrader = gorillaws.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     checkWSOrigin,
}

// checkWSOrigin: WS 跨站防护(CSWSH)二道防线 (C16),复用 CORS_ALLOWED_ORIGINS 白名单。
//   - 无 Origin 头(非浏览器客户端 / 同源内网调用)→ 放行。
//   - 配了白名单 → 只放行白名单内的 Origin。
//   - 没配白名单 → 放行 (dev 默认, 与 CORS AllowAllOrigins-when-empty 一致; 同源仍由 nginx 兜底)。
//
// 在请求时读 config(而非包级 var 初始化时), 确保 config.AppConfig 已加载。
func checkWSOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	allowed := config.AppConfig.App.CORSAllowedOrigins
	if strings.TrimSpace(allowed) == "" {
		return true
	}
	for _, o := range strings.Split(allowed, ",") {
		o = strings.TrimSpace(o)
		// "*" = 放行一切, 与 CORS 中间件 (parseAllowedOrigins → AllowAllOrigins) 语义一致;
		// 否则精确匹配 Origin。⚠️ 不处理 "*" 会让 CORS_ALLOWED_ORIGINS=* (生产常见 / .env.example 默认)
		// 直接拒掉所有 WS 升级。
		if o == "*" || o == origin {
			return true
		}
	}
	slog.Warn("agentbridge ws: rejected WS upgrade by origin allowlist", "origin", origin)
	return false
}

// agentDialer 用于 backend → agent 的内网 WS, 与 agent HTTP 池分开。
// 内网延迟可忽略, 握手超时 10s 已够用。
var agentDialer = &gorillaws.Dialer{
	HandshakeTimeout: 10 * time.Second,
	ReadBufferSize:   4096,
	WriteBufferSize:  4096,
}

// agentPingPayload 是发到 agent 的应用层 keepalive (对应 agent ClientMessage.type=ping)。
// 不用 WS 控制帧: agent Bun.serve idleTimeout=60s 按 application data 算, 控制帧不刷新计时。
var agentPingPayload = []byte(`{"type":"ping"}`)

// agentReadDeadline 是 agent→backend 方向的读超时。我们每 25s 主动给 agent 发 ping,
// agent 会回 {type:"pong"} (见 ws/events.ts ServerMessage.pong); 60s 内一帧都没收到
// 说明 agent 真的卡死或 TCP 断了。设短一点比 hang 在没响应的连接上好。
const agentReadDeadline = 60 * time.Second

// frontReadDeadline 是 front→backend 方向的读超时。前端没有周期性流量
// (用户输入是事件驱动), 所以设宽松些 — 仅作为防止 TCP 半死连接的安全网。
const frontReadDeadline = 10 * time.Minute

// frontWriteDeadline 是写 front 每帧的最大阻塞时长。慢/卡死的浏览器若 TCP 接收窗口填满,
// 无 deadline 的 WriteMessage 会永久阻塞 → 卡住 agent→front goroutine(停止读 agent leg)→
// HOL 阻塞 + goroutine/连接泄漏永不回收, 且 closeBoth 也要抢 frontWriteMu 会被一起拖死。
// 给个有界写超时, 超时即报错, 让 pipe 收口踢掉慢客户端(性能审计 ws-backpressure)。
const frontWriteDeadline = 30 * time.Second

// agentWriteDeadline 是 backend→agent 方向每帧写的最大阻塞时长(性能审计 P0)。agent 容器 TCP 假死时,
// 无 deadline 的 WriteMessage 会永久阻塞并持 agentWriteMu → 该会话所有写方(user_message / pingLoop /
// permission 回写 / 模型帧)全卡死,最坏拖到 60s 读超时才被间接解救。给个有界写超时,超时即报错走收尾。
// 内网帧至多几十 KB,10s 对正常写绰绰有余,不会误伤慢但活的连接。
const agentWriteDeadline = 10 * time.Second

// closeMessageWriteTimeout 是写 CloseMessage 控制帧时给对端的最大等待时间。
// 短到不阻塞清理流程, 长到允许网卡 flush。500ms 足够内网 + 公网常规延迟。
const closeMessageWriteTimeout = 500 * time.Millisecond

// HandleWS 是给 gin 路由用的 WS handler, 自动用 FeatureBridge 的 spec 串起来
// 鉴权 + 升级 + dial agent + pipe。
//
// 鉴权策略:`?ws_token=<...>` 短命一次性 ticket —— consume Redis ticket 拿 userID + sessionID,
// 用一次即销毁,避免 JWT 落到 nginx access log 长期暴露。前端先 POST /<feature>/session/ws-ticket
// 拿 ticket 再升级 WS。(旧的 `?token=<jwt>` 裸 JWT 回落已下线,见 authenticateWSRequest。)
//
// 不走 UserAuthMiddleware —— 浏览器 WS 无法带 Authorization header。
func (f *FeatureBridge) HandleWS(c *gin.Context) {
	pathSessionID := c.Param("sessionId")
	if pathSessionID == "" {
		utils.BadRequest(c, "missing sessionId")
		return
	}

	userID, sessionID, err := f.authenticateWSRequest(c, pathSessionID)
	if err != nil {
		// authenticateWSRequest 已经写过 response, 这里只 return
		return
	}

	frontConn, err := frontUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Warn("agentbridge ws: upgrade failed", "feature", f.spec.Key, "err", err)
		return
	}
	defer frontConn.Close()

	// 多端实时同步:同一 (feature, session) 的多个浏览器都作为「订阅者」接入同一条上游 agent WS
	// (扇出 Hub, 见 hub.go),不再互相抢占。首个订阅者触发建 hub(dial 上游 + 起读循环/ping),
	// prompt 注入判定、配额/账单/记忆等钩子都收在 hub 里每 session 跑一次。
	var sub *subscriber
	for attempt := 0; attempt < 3; attempt++ {
		hub, herr := f.bridge.getOrCreateHub(f, userID, sessionID)
		if herr != nil {
			_ = frontConn.WriteJSON(gin.H{"type": "error", "message": "agent 不可达,请重试"})
			return
		}
		if sub = hub.addSubscriber(frontConn); sub != nil {
			break
		}
		// addSubscriber 返回 nil = 该 hub 恰好在关闭中(最后一个订阅者刚离开)→ 重试建新 hub。
	}
	if sub == nil {
		_ = frontConn.WriteJSON(gin.H{"type": "error", "message": "会话繁忙,请重试"})
		return
	}

	slog.Info("agentbridge ws: subscriber attached",
		"feature", f.spec.Key, "user_id", userID, "session_id", sessionID)
	sub.readLoop() // 阻塞直到前端断开;退出时 removeSubscriber(订阅者归零则关 hub + 上游)
	slog.Info("agentbridge ws: subscriber detached",
		"feature", f.spec.Key, "user_id", userID, "session_id", sessionID)
}

// injectSystemPromptIntoFirstUserMessage 把 systemPrompt 作为 prefix 拼到首条
// user_message 的 content 前面。后续 user_message 不再注入。
//
// 返回 (改写后 bytes, true) 仅当本帧被识别为首条 user_message 且改写成功;
// 否则 (nil, false), caller 原样转发。
//
// 并发安全: 用 atomic.CompareAndSwap 保证同一连接生命周期内只会真正改写一次。
func injectSystemPromptIntoFirstUserMessage(injected *atomic.Bool, raw []byte, systemPrompt, memoryContext string) ([]byte, bool) {
	if injected.Load() {
		return nil, false
	}
	if len(raw) == 0 || raw[0] != '{' {
		return nil, false
	}
	var probe struct {
		Type    string `json:"type"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return nil, false
	}
	if probe.Type != "user_message" {
		return nil, false
	}
	if !injected.CompareAndSwap(false, true) {
		return nil, false
	}

	var generic map[string]any
	if err := json.Unmarshal(raw, &generic); err != nil {
		return nil, false
	}
	generic["content"] = buildInjectionPrefix(systemPrompt, memoryContext) + probe.Content

	out, err := json.Marshal(generic)
	if err != nil {
		return nil, false
	}
	return out, true
}

// buildInjectionPrefix 用 marker 包住 systemPrompt + per-user 记忆, 让模型清楚 prefix 边界。
// marker 是英文 + 醒目大括号, 减少与用户内容冲突的概率。memoryContext 为空时不注入记忆段。
func buildInjectionPrefix(systemPrompt, memoryContext string) string {
	prefix := "[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW]\n" +
		systemPrompt +
		"\n[/AGENT BRIDGE — END OF RULES]\n\n"
	if strings.TrimSpace(memoryContext) != "" {
		prefix += "[关于这位用户 — 长期记忆, 跨会话持久。据此个性化你的回答; 若与用户当前明确诉求冲突, 以当前诉求为准]\n" +
			memoryContext +
			"[/长期记忆]\n\n"
	}
	prefix += "以下是用户的请求:\n"
	return prefix
}

// decidePermission 解析一帧 agent→front 消息; 若是 permission_request 就**按工具 + 路径**
// 决定批准 / 拒绝, 回 permission_response, 返回 (replyBytes, true)。非权限帧返回 (nil, false)。
//
// 这是方案 B 文件隔离的命门:
//   - MCP 工具 (mcp__*): 直接批准 (只读学术检索, 无害)
//   - 文件工具 (Read/Write/Edit/MultiEdit/NotebookEdit/Glob/Grep/LS): 解析 input 里的路径,
//     **只有落在本会话隔离 cwd (sessionWorkDir) 子树内才批准**; 越界 (读别人会话目录 /
//     ~/.claude/projects 下他人 jsonl / 任意系统路径) 一律拒绝。
//   - 其它工具 (理论上已被 agent --disallowed-tools 移除, 触发不了): 保险起见拒绝。
//
// 为什么靠这里而不是只靠 Claude Code 的 cwd 限定: Claude Code 对 cwd 内文件不弹权限 (自动放行),
// 对 cwd 外才弹 permission_request → 到我们这。我们对"弹上来的(=cwd 外的)"文件操作默认拒,
// 就堵死了跨会话读取。Bash 已全禁, 没法用 `cat` 绕过路径校验。
func decidePermission(raw []byte, sessionWorkDir string, denyTools []string) ([]byte, bool) {
	if len(raw) == 0 || raw[0] != '{' {
		return nil, false
	}
	var probe struct {
		Type      string          `json:"type"`
		RequestID string          `json:"requestId"`
		ToolName  string          `json:"toolName"`
		Input     json.RawMessage `json:"input"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return nil, false
	}
	if probe.Type != "permission_request" || probe.RequestID == "" {
		return nil, false
	}

	allowed := permissionAllowed(probe.ToolName, probe.Input, sessionWorkDir, denyTools)
	if !allowed {
		// INFO 而非 WARN: 这是沙箱护栏按预期拒绝越界/危险工具(agent 探索时常态发生),
		// 是安全审计信息而非系统故障。保留可见性(docker logs 可查), 但不污染 WARN/ERROR。
		slog.Info("agentbridge ws: permission denied (guard enforced)",
			"tool", probe.ToolName, "workdir", sessionWorkDir)
	}
	reply, err := json.Marshal(struct {
		Type      string `json:"type"`
		RequestID string `json:"requestId"`
		Allowed   bool   `json:"allowed"`
	}{
		Type:      "permission_response",
		RequestID: probe.RequestID,
		Allowed:   allowed,
	})
	if err != nil {
		return nil, false
	}
	return reply, true
}

// fileToolPathKeys 是各文件工具 input 里存"路径"的字段名 (Claude Code 约定)。
var fileToolPathKeys = []string{"file_path", "source_path", "path", "notebook_path", "filePath", "notebookPath"}

// permissionAllowed 判定一次工具调用是否放行。
// denyTools: 该会话(feature)显式禁用的工具 —— 后端二道防线,即便 agent 端 --disallowed-tools
// 被绕过,这里也对禁用工具一律拒绝(Prism 写作:禁 Bash/Write/Edit/...,见 review F9)。
func permissionAllowed(toolName string, input json.RawMessage, sessionWorkDir string, denyTools []string) bool {
	// 显式禁用名单最高优先级:任何匹配一律拒绝(无视路径/类型)。
	for _, d := range denyTools {
		if d == toolName {
			return false
		}
	}
	// MCP 工具一律放行 (只读学术检索)
	if strings.HasPrefix(toolName, "mcp__") {
		return true
	}
	// Bash 三件套 (Bash/BashOutput/KillShell) 现在按 feature 收敛 (C1, 2026-06):
	// 只有 AllowBash=true 的 feature (目前仅 claw, 它要跑 pandoc/python 转 docx/xlsx) 才放行 ——
	// 其余 feature 的 Bash 已由 specDeny() 注入到上方 denyTools, 在本函数顶部命中 denylist 被直接拒,
	// 走不到这里。claw 的 Bash 在下方 switch 之前放行(见该处)。
	// ⚠️ Bash 是 shell, 即便对 claw 放行也无法做路径限制; 生产应靠 bubblewrap sandbox
	// 把 Bash 关进 cwd + 断网, 而不是靠这里的 permission 裁决。
	// Web 工具 / Skill 放行 (2026-06, 配合 egress 代理): agent 在 internal 网, 出网只能经
	// egress 代理 (域名/端口控制 + 统一记日志), SSRF/外泄由网络层兜底, 故这里放行 WebFetch/WebSearch。
	// Skill 走 inline 执行 —— skill 正文里再调的工具 (Bash/文件/mcp/web) 仍会逐个回到本函数裁决,
	// 故放行 Skill 本身不放大权限面。
	// ⚠️ Task/Agent (子 agent) 不在此列, 仍全禁: 子 agent 的工具调用**旁路本裁决**, 必须等生产
	// L2 沙箱 (bubblewrap/gVisor) 就位再放 (见 agent conversationService.ts 注释)。
	if toolName == "WebFetch" || toolName == "WebSearch" || toolName == "Skill" {
		return true
	}
	// Bash 三件套: 走到这里 = 该 feature AllowBash=true (否则已在顶部 denylist 被拒)。
	// shell 无法做路径限制, 对 AllowBash feature (claw) 放行 (风险见上方注释 / 生产靠 sandbox)。
	if toolName == "Bash" || toolName == "BashOutput" || toolName == "KillShell" {
		return true
	}
	// TodayDate (2026-07): agent 内建的只读时钟工具 (查当前日期/时间, 治时间线幻觉)。
	// 无参数、无路径、不碰文件系统与网络, 对全部 feature 放行。
	if toolName == "TodayDate" {
		return true
	}
	// AskUserQuestion (2026-07, 交互提问): agent 把「只有用户能拍板的决策」做成选项卡片让用户点选。
	// input 仅 { questions: [...] }(问题/选项文本,无路径、不碰文件系统与网络),纯前端渲染 + 回一条
	// 占位 tool_result,故对 feature 放行(否则命中下方 default: return false 被权限墙一律拒绝、DOA)。
	// 供给面收敛在能力轴:server-side / 无人值守 feature(peerreview)与任务型模式(boltslides/scidraw)
	// 及 smart_search/prism 已把本工具经 SessionOptions.DisallowedTools 注入 denyTools,在本函数顶部
	// 命中 denylist 被直接拒 —— P0 仅 claw 放开。
	if toolName == "AskUserQuestion" {
		return true
	}
	// BuildDeck (2026-07, 制作PPT/boltslides): 把会话内预置的 bolt-slides 脚手架编译成单文件 HTML
	// 落 ./out/。input 仅 { name? }(文件名 slug,无路径);工具内部把产物强制 confine 到 out/<name>.html,
	// 无用户可控路径,故无需在此校验路径,直接放行(否则命中下面 default: return false 被权限墙拒、DOA,
	// 同 ReadDocument/ExportDocument 当年漏加即失效)。工具自身对非演示稿工作区自守卫(缺脚手架即拒),
	// 故对非 boltslides feature 放行也无害。
	if toolName == "BuildDeck" {
		return true
	}
	// ReadDocument/ExportDocument(2026-07-15):安全受限的文档抽取/导出工具(内部固定 argv 调
	// pandoc/pdftotext,路径 confine 在会话 cwd)。二道防线仍校验 input 路径在会话目录内 —— 否则
	// 命中下面 default: return false 被拒(评审确认:漏加这两个 case → 两工具在生产被权限墙一律
	// 拒绝、DOA;审稿 ReadDocument 读稿件、claw ExportDocument 导出 docx 全部失败)。
	// ExportDocument 的 source_path 已并入 fileToolPathKeys;输出被工具强制落 ./out/ 无需在此校验。
	// 文件工具: 校验路径在会话目录内
	switch toolName {
	case "Read", "ReadDocument", "ExportDocument", "Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "Grep", "LS", "Ls":
		p := extractPathFromInput(input)
		if p == "" {
			// Glob/Grep 不带 path 默认搜 cwd → 安全放行; 其它没路径视为异常 → 拒。
			return toolName == "Glob" || toolName == "Grep"
		}
		return pathWithin(p, sessionWorkDir)
	default:
		// 其它工具理论上已被禁用 (agent --disallowed-tools), 兜底拒绝。
		return false
	}
}

// extractPathFromInput 从工具 input JSON 里取第一个命中的路径字段。
func extractPathFromInput(input json.RawMessage) string {
	if len(input) == 0 {
		return ""
	}
	var obj map[string]any
	if err := json.Unmarshal(input, &obj); err != nil {
		return ""
	}
	for _, k := range fileToolPathKeys {
		if v, ok := obj[k]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

// pathWithin 判定 p 是否落在 workDir 子树内 (含 workDir 本身)。
// 相对路径视为相对 cwd(=workDir) → 一定在内。绝对路径 Clean 后做前缀比对, 防 `..` 逃逸。
func pathWithin(p, workDir string) bool {
	if workDir == "" {
		return false // 没有 workdir 信息时保守拒绝
	}
	if !path.IsAbs(p) {
		// 相对路径 = 相对 cwd, 清理后若仍以 ".." 开头说明逃逸出 cwd → 拒
		cleaned := path.Clean(p)
		return !strings.HasPrefix(cleaned, "..")
	}
	cleaned := path.Clean(p)
	root := path.Clean(workDir)
	return cleaned == root || strings.HasPrefix(cleaned, root+"/")
}

// authenticateWSRequest 用 `?ws_token=<...>` 一次性 ticket 鉴权 HandleWS。
// 任一失败都直接 c.JSON 写 response 并 return error, caller 仅需 return。
// ticket 内已绑定 userID + sessionID, ConsumeWSTicket 一次性消费 (GETDEL) + 校验
// feature key, 这里再比对 sessionID 与 pathSessionID 一致即放行。
//
// 历史上还接受 `?token=<jwt>` 裸 JWT 回落 (兼容旧前端), 现已下线 —— 三个 feature 的前端
// 早已统一只发 ws_token, 留着裸 JWT 反而是「吊销后的 token 仍能从 URL 升级 WS、绕过 HTTP
// 中间件」的攻击面。现在缺/错 ws_token 一律 401。
//
// 返回 (userID, sessionID, nil) 表示鉴权通过; sessionID 已与 pathSessionID 比对一致。
func (f *FeatureBridge) authenticateWSRequest(c *gin.Context, pathSessionID string) (uint, string, error) {
	wsToken := strings.TrimSpace(c.Query("ws_token"))
	if wsToken == "" {
		utils.Unauthorized(c, "missing ws_token")
		return 0, "", errors.New("missing ws_token")
	}
	uid, sid, err := f.ConsumeWSTicket(c.Request.Context(), wsToken)
	if err != nil {
		slog.Warn("agentbridge ws: ws_token consume failed",
			"feature", f.spec.Key, "session_id", pathSessionID, "err", err)
		utils.Unauthorized(c, "invalid or expired ws_token")
		return 0, "", err
	}
	if sid != pathSessionID {
		slog.Warn("agentbridge ws: ws_token session mismatch",
			"feature", f.spec.Key, "user_id", uid,
			"ticket_sid", sid, "path_sid", pathSessionID)
		utils.Forbidden(c, "ws_token does not match sessionId")
		return 0, "", ErrSessionMismatch
	}
	return uid, sid, nil
}

// foldUserAttachments 把 user_message 帧上的 attachments[].path 折进 content 首部的 @"path" 标记。
// 2026-07-14 附件断链修复:老 executor 的 materializeAttachments(@"path" 注入)在 web-native 重写中
// 丢失,attachments 字段一度全链路无消费 —— 模型只能靠列目录自救,历史回放的附件 chips 消失。
// 放 hub 侧(而非前端/executor)的理由:
//   - journal 的 RoleUserText 同源携带前缀 → 前端回放剥离器(agent-history splitAttachmentPrefix)
//     与 executor seed_history 天然一致;
//   - 新老 web bundle / 小程序一并生效,无需多端发版;
//   - user_echo 用注入前原文(调用方保留),不把容器绝对路径泄进其它端的气泡。
// 格式与前端剥离器严格同构:`@"<绝对路径>" `×N + 正文;空正文补英文占位句(剥离器同样识别并隐藏)。
// 路径须为绝对路径且不含引号/换行(防标记断裂);全部无效 → 不改帧。
func foldUserAttachments(raw []byte) (rewritten []byte, newContent string, ok bool) {
	if len(raw) == 0 || raw[0] != '{' {
		return nil, "", false
	}
	var frame map[string]any
	if err := json.Unmarshal(raw, &frame); err != nil || frame["type"] != "user_message" {
		return nil, "", false
	}
	atts, _ := frame["attachments"].([]any)
	if len(atts) == 0 {
		return nil, "", false
	}
	// 服务端数量帽 (2026-07 文件上传调研): 前端 MAX_ATTACHMENTS=10 只是 UI 约束, 绕过前端
	// 可塞任意长 attachments 数组把 @"path" 前缀灌爆。与前端同口径, 超出丢弃。
	const maxWsAttachments = 10
	if len(atts) > maxWsAttachments {
		atts = atts[:maxWsAttachments]
	}
	var b strings.Builder
	for _, a := range atts {
		m, _ := a.(map[string]any)
		p, _ := m["path"].(string)
		if p == "" || !strings.HasPrefix(p, "/") || strings.ContainsAny(p, "\"\n") {
			continue
		}
		b.WriteString(`@"`)
		b.WriteString(p)
		b.WriteString(`" `)
	}
	if b.Len() == 0 {
		return nil, "", false
	}
	content, _ := frame["content"].(string)
	if strings.TrimSpace(content) == "" {
		// 只发附件没打字:补前端剥离器认识的占位句(agent-history.ts EMPTY_ATTACHMENT_PLACEHOLDER),
		// 同时避开 executor 的空 content 丢弃守卫。
		content = "Please analyze the attached files."
	}
	newContent = b.String() + content
	frame["content"] = newContent
	out, err := json.Marshal(frame)
	if err != nil {
		return nil, "", false
	}
	return out, newContent, true
}

// extractUserMessageContent 浅 parse 一帧 front→agent 消息, 仅识别 user_message 类型。
// 返回 (content, true) 仅当本帧是 user_message; 其它情况 (ping / permission_response /
// stop_generation / set_runtime_config / 非 JSON) 都返回 ("", false), 不计配额。
func extractUserMessageContent(raw []byte) (string, bool) {
	if len(raw) == 0 || raw[0] != '{' {
		return "", false
	}
	var probe struct {
		Type    string `json:"type"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return "", false
	}
	if probe.Type != "user_message" {
		return "", false
	}
	return probe.Content, true
}

// extractClientTurnID 取 user_message 帧里的 clientTurnId(P0 影子日志的幂等键,前端每次
// send-click 生成一个 UUID,跨 reconnect-resend/双击稳定)。旧客户端不带 → 返回 "",由
// handleUserMessage mint 一个,故唯一键永不撞(代价是旧客户端无跨重连去重 = 今天行为)。
func extractClientTurnID(raw []byte) string {
	if len(raw) == 0 || raw[0] != '{' {
		return ""
	}
	var probe struct {
		ClientTurnID string `json:"clientTurnId"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return ""
	}
	return probe.ClientTurnID
}

// frameType 只解析一帧消息的 `type` 字段, 用于在转发循环里先做廉价分流, 避免对每个
// content_delta 帧都跑完整的 decidePermission / extractMessageCompleteUsage 解析。
// 非 JSON 帧返回 ""。
func frameType(raw []byte) string {
	if len(raw) == 0 || raw[0] != '{' {
		return ""
	}
	var probe struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return ""
	}
	return probe.Type
}

// backendOnlyFrameTypes —— 这些帧类型是 backend 控制面**专属**下发给 executor 的,浏览器绝不该发。
// seed_history 携带 addDirs/disallowedTools/appendSystemPrompt(注入面),必须只由 hub 自建下发
// (seedHistoryFromJournal);extract_memory 的 system/user 是 Go-authored 记忆抽取 spec。
// P0.4(skill 市场前置):hub 的 front→agent default 转发路径若逐字转发浏览器帧,用户即可自带任意
// addDirs 绕过审核让 executor 加载宿主任意 CLAUDE.md/SKILL.md(读文件 + 提示注入)。故在转发前拦截。
var backendOnlyFrameTypes = map[string]bool{
	"seed_history":   true,
	"extract_memory": true,
}

// frameCarriesInjectionSurface —— 帧是否携带「会话注入面」字段。即便帧类型被伪装,只要带这些 key
// 就拒转发(纵深防御:执行器只有 seed_history 消费它们,但不赌未来新增消费点)。
func frameCarriesInjectionSurface(raw []byte) bool {
	if len(raw) == 0 || raw[0] != '{' {
		return false
	}
	var probe struct {
		AddDirs            json.RawMessage `json:"addDirs"`
		DisallowedTools    json.RawMessage `json:"disallowedTools"`
		AllowedMcpTools    json.RawMessage `json:"allowedMcpTools"`
		AppendSystemPrompt json.RawMessage `json:"appendSystemPrompt"`
		Skills             json.RawMessage `json:"skills"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return false
	}
	return len(probe.AddDirs) > 0 || len(probe.DisallowedTools) > 0 || len(probe.AllowedMcpTools) > 0 ||
		len(probe.AppendSystemPrompt) > 0 || len(probe.Skills) > 0
}

// browserFrameForwardable —— front→agent default 转发前的安全闸:拒绝 backend-only 帧类型与任何
// 携带注入面字段的浏览器帧。合法控制帧(stop_generation / permission_response / resync_* /
// prewarm_session 等,均不带注入面)照常放行。
func browserFrameForwardable(raw []byte) bool {
	if backendOnlyFrameTypes[frameType(raw)] {
		return false
	}
	return !frameCarriesInjectionSurface(raw)
}

// stripInjectionSurface —— 从帧里删除会话注入面顶层字段(addDirs/disallowedTools/appendSystemPrompt/skills)。
// 专用于 user_message 路径:该帧走 handleUserMessage 专属分支、**不过** browserFrameForwardable 闸
// (default 分支才过),故浏览器若在 user_message 里夹带这些键会被原样透传到 executor。此处在转发上游前
// 剥掉它们,把「闸只覆盖 default 路径」补成「全路径覆盖」——不再依赖「executor 只在 seed_history 消费
// 注入面」这一容器侧口头约定。返回剥离后的字节;无注入面字段或解析失败则原样返回。
func stripInjectionSurface(raw []byte) []byte {
	if len(raw) == 0 || raw[0] != '{' {
		return raw
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return raw
	}
	changed := false
	for _, k := range []string{"addDirs", "disallowedTools", "allowedMcpTools", "appendSystemPrompt", "skills"} {
		if _, ok := m[k]; ok {
			delete(m, k)
			changed = true
		}
	}
	if !changed {
		return raw
	}
	if out, err := json.Marshal(m); err == nil {
		return out
	}
	return raw
}

// agentErrorFriendly —— 执行器 error 终帧的 code → 用户友好中文文案(评审 #4)。
// 执行器某些 error 的 message 是原始英文、甚至泄露内部机制名(如 "no active provider/model
// (awaiting PushConfig)")。用户面绝不回显内部标识,故在广播前按 code 换成友好中文。
var agentErrorFriendly = map[string]string{
	"config":   "AI 服务正在准备中,请稍后再试。",
	"upstream": "AI 服务连接中断,请重试。",
	"internal": "服务处理出错,请稍后重试。",
	"busy":     "系统正忙,请稍候再试。",
	// W3 轮生命周期新 code(冻结契约 #2):agent 侧同名帧经本函数净化后保留友好中文;
	// backend 合成帧(emptyTurnFrame/turnTimeoutFrame)不过本函数,文案在帧构造处已定稿。
	"empty_turn":           "模型没有返回任何内容,本轮未完成,请重试。",
	"turn_timeout":         "本轮处理时间过长已自动停止,已生成的内容保留在上方,请重试或换个问法。",
	"model_protocol_error": "模型输出出现协议异常,本轮已终止,请重试或更换模型。",
}

// agentErrorFriendlyPassthrough —— 这些 code 的 message 执行器已友好化(中文、无内部标识),原样保留。
var agentErrorFriendlyPassthrough = map[string]bool{
	"budget":         true, // "本轮处理量已达上限…请精简需求后重试。"
	"quota_exceeded": true,
}

const genericAgentErrorFrame = `{"type":"error","code":"internal","message":"服务处理出错,请稍后重试。","retryable":true}`

// sanitizeAgentErrorFrame —— 把执行器上行的 error 终帧净化成不泄露内部实现的友好帧再广播。
//   - 已友好化的 code(budget/quota_exceeded)原样保留;
//   - 已知英文/泄露型 code(config/upstream/internal/busy)按 agentErrorFriendly 换文案;
//   - 未知 code:绝不回显原 message(可能是英文/内部标识)→ 通用文案。
// 其余字段(code/retryable 等)保留,便于前端 fold 按 code 分支。解析失败 → 通用兜底帧。
func sanitizeAgentErrorFrame(raw []byte) []byte {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return []byte(genericAgentErrorFrame)
	}
	code, _ := m["code"].(string)
	if agentErrorFriendlyPassthrough[code] {
		return raw
	}
	if friendly, ok := agentErrorFriendly[code]; ok {
		m["message"] = friendly
	} else {
		m["message"] = "服务处理出错,请稍后重试。"
	}
	// 审查修复(协议 code 冲突):hub 自己的竞态拒绝帧 busyFrame()(sendSelf、不过本函数)也用
	// code="busy",而前端把 code=busy 拦截成「回滚刚发的那轮」。执行器上行的 busy(round-cap /
	// 并发槽满)是**终帧**语义 —— 若不换名,前端会把已流式出的整轮内容误回滚掉。改映射成
	// "overloaded" 后:code=busy 全局唯一表示「hub 竞态拒绝、轮未消耗」,执行器过载帧按普通
	// error 终帧进 messages 正常收口该轮。
	if code == "busy" {
		m["code"] = "overloaded"
	}
	out, err := json.Marshal(m)
	if err != nil {
		return []byte(genericAgentErrorFrame)
	}
	return out
}

// extractMessageComplete 浅 parse 一帧 message_complete:
//   - usage:本轮整轮用量(agent 侧算的相邻轮增量),给 slog 钩子用。
//   - calls:本轮每次真实模型调用的 per-call 明细(带内账本据此按模型逐行记账)。
//   - sessionTotal:会话累计用量快照(带内账本据此做水位自愈;老 agent 不带 → nil)。
//
// 返回 ok=true 仅当本帧确为 message_complete。calls / sessionTotal 可能为空/nil(老 agent 兼容)。
func extractMessageComplete(raw []byte) (usage AgentUsage, calls []AgentUsage, sessionTotal *AgentUsage, ok bool) {
	if len(raw) == 0 || raw[0] != '{' {
		return AgentUsage{}, nil, nil, false
	}
	var probe struct {
		Type         string       `json:"type"`
		Usage        AgentUsage   `json:"usage"`
		Calls        []AgentUsage `json:"calls"`
		SessionTotal *AgentUsage  `json:"session_total"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil || probe.Type != "message_complete" {
		return AgentUsage{}, nil, nil, false
	}
	return probe.Usage, probe.Calls, probe.SessionTotal, true
}

// extractErrorUsage 浅 parse error 终帧上可选携带的 usage/calls/session_total。
// 2026-07-14 计费回归修复:轮中途上游失败时,executor 把失败前已完成 LLM call 的真实消耗
// 随 error 终帧带回(此前只有 message_complete 携带 → 失败轮整轮漏记)。
// 无 usage 的 error 帧(配置错误 / 转发拒绝等,未产生上游消耗)返回 ok=false,不入账。
func extractErrorUsage(raw []byte) (usage AgentUsage, calls []AgentUsage, sessionTotal *AgentUsage, ok bool) {
	if len(raw) == 0 || raw[0] != '{' {
		return AgentUsage{}, nil, nil, false
	}
	var probe struct {
		Type         string       `json:"type"`
		Usage        *AgentUsage  `json:"usage"`
		Calls        []AgentUsage `json:"calls"`
		SessionTotal *AgentUsage  `json:"session_total"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil || probe.Type != "error" || probe.Usage == nil {
		return AgentUsage{}, nil, nil, false
	}
	if *probe.Usage == (AgentUsage{}) && len(probe.Calls) == 0 {
		return AgentUsage{}, nil, nil, false
	}
	return *probe.Usage, probe.Calls, probe.SessionTotal, true
}

// extractTokenUsageFrame 浅 parse 一帧 token_usage(带外模型调用,如会话标题生成):
// 不进会话累计水位,按「附加」记一行。返回 (usage, true) 仅当本帧确为 token_usage。
// extractTokenUsageFrame 解 agent→backend 的 token_usage 帧, 返回 (用量, kind, ok)。
// kind 标识这次带外调用的种类(title_gen / memory_extract / ...), 决定记账归到哪个 feature。
// 三类带外全部正常计费(2026-07-30 拍板:凡消耗 token 一律扣额度)。
func extractTokenUsageFrame(raw []byte) (AgentUsage, string, bool) {
	if len(raw) == 0 || raw[0] != '{' {
		return AgentUsage{}, "", false
	}
	var probe struct {
		Type  string     `json:"type"`
		Kind  string     `json:"kind"`
		Usage AgentUsage `json:"usage"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil || probe.Type != "token_usage" {
		return AgentUsage{}, "", false
	}
	return probe.Usage, probe.Kind, true
}

// recordOutOfBandTokens 记一行「带外」token 用量(标题/记忆抽取等不产生 message_complete 的调用)。
// kind=="memory_extract" → 归 Feature=memory;其它(title_gen / context_compact 等)→ 归本 feature。
// 全部正常计费。requestID 传 agent sessionID。
func recordOutOfBandTokens(rec llmusage.Recorder, userID *uint, feature, kind, sessionID string, u AgentUsage) {
	if rec == nil {
		return
	}
	// 归因:记忆抽取归 memory feature(跨 feature 共享的后台动作);压缩/标题归原 feature。
	// 🔴 2026-07-30 owner 拍板「凡消耗 token 一律扣用户额度」—— 原先 memory_extract /
	// context_compact 的 SkipQuota 豁免(记账不扣额)已取消,带外三类(标题/记忆/压缩)
	// 全部正常计费。不会双计:agent 侧刻意不把带外调用并入 session_total(turnLoop),
	// 这里的计费与轮内水位差额无交集。
	feat := feature
	if kind == "memory_extract" || feat == "" {
		feat = llmusage.FeatureMemory
	}
	recordAgentTokens(rec, nil, userID, feat, sessionID, u) // 带外恒走默认 provider
}

// extractMemoryUpdateFrame 解 agent→backend 的 memory_update 帧, 取出 agent 跑完抽取的原始模型输出。
// backend 拿去 IngestMemory(parseUpdates + allow-list + 截断 + Upsert), 解析全在 backend(零 TS 漂移)。
// 返回 (text, extractFailed, ok):extractFailed=true 表示 agent 侧抽取 LLM 失败(带 error 标记),
// 供 hub 补后端告警(审计 P2-6:否则记忆静默冻结、后端零日志)。
func extractMemoryUpdateFrame(raw []byte) (string, bool, bool) {
	if len(raw) == 0 || raw[0] != '{' {
		return "", false, false
	}
	var probe struct {
		Type  string `json:"type"`
		Text  string `json:"text"`
		Error bool   `json:"error"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil || probe.Type != "memory_update" {
		return "", false, false
	}
	return probe.Text, probe.Error, true
}

// extractTitleUpdateFrame 解 agent→backend 的 session_title_updated 帧, 取标题 + aiGenerated 标志。
// aiGenerated=false 是 deriveTitle 即时占位(backend-owned 标题不落占位, 避免把项目名锁死)。
func extractTitleUpdateFrame(raw []byte) (string, bool, bool) {
	if len(raw) == 0 || raw[0] != '{' {
		return "", false, false
	}
	var probe struct {
		Type        string `json:"type"`
		Title       string `json:"title"`
		AIGenerated bool   `json:"aiGenerated"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil || probe.Type != "session_title_updated" {
		return "", false, false
	}
	return probe.Title, probe.AIGenerated, true
}

// callPreUserMessage 包一层 recover, 防止业务侧的 hook panic 把 WS 读循环炸掉。
// panic 视为内部错误, 给用户回一个 retryable=true 的 generic 错误。
func callPreUserMessage(fn PreUserMessageFn, ctx context.Context, userID uint, content string) (err error) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("agentbridge: PreUserMessage panicked",
				"user_id", userID, "panic", r)
			err = errors.New("internal hook error")
		}
	}()
	return fn(ctx, userID, content)
}

// classifyPreUserMessageError 把钩子返回的 error 映射成 ws error 帧的 code 字段。
// 已知类型 → 稳定的机器可读 code; 其它一律 hook_error 让前端 fallback 处理。
func classifyPreUserMessageError(err error) string {
	switch {
	case errors.Is(err, ErrQuotaExceeded):
		return "quota_exceeded"
	default:
		return "hook_error"
	}
}

// preUserMessageUserText —— PreUserMessage 拒绝帧给用户看的文案(评审 SS#4 残留)。
// quota_exceeded 的 err 文案本就是友好中文(NewQuotaError 构造),原样透出;其余(hook_error /
// panic 的 "internal hook error")**绝不**回显 err.Error()(可能是英文/内部标识,违反"用户面绝不回显
// err.Error()"约定)→ 通用中文。
func preUserMessageUserText(err error) string {
	if errors.Is(err, ErrQuotaExceeded) {
		return err.Error()
	}
	return "暂时无法处理这条消息,请稍后重试。"
}

// stampBudget —— SS#2:把 {"budget":{"softRemaining":..,"hardRemaining":..}} 合并进 user_message 帧,
// 执行器据此让 agent 自我配速 + 到界优雅收尾。解析失败 → 原样返回(执行器收不到 budget = 走无预算路径,
// 安全降级)。仅 5 个 chat feature(smart_search/claw/prism/boltslides/sci_draw)调用;
// peerreview BudgetProvider=nil,永不到这里。
func stampBudget(raw []byte, soft, hard int64) []byte {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return raw
	}
	m["budget"] = map[string]any{"softRemaining": soft, "hardRemaining": hard}
	out, err := json.Marshal(m)
	if err != nil {
		return raw
	}
	return out
}

// buildAgentWSURL: http(s)://host:port → ws(s)://host:port/ws/<sessionId>
func buildAgentWSURL(baseURL, sessionID string) (string, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	default:
		// 其它 scheme (例如已经是 ws) 不动。
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/ws/" + sessionID
	return u.String(), nil
}
