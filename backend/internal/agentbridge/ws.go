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
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	gorillaws "github.com/gorilla/websocket"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
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

// frontUpgrader 升级浏览器 WS。CORS 由 nginx 同源策略兜底; 桥接本身是内部 API,
// 默认 CheckOrigin 放行 (生产部署若要收紧, 在这里读 allow-list env)。
var frontUpgrader = gorillaws.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
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

// closeMessageWriteTimeout 是写 CloseMessage 控制帧时给对端的最大等待时间。
// 短到不阻塞清理流程, 长到允许网卡 flush。500ms 足够内网 + 公网常规延迟。
const closeMessageWriteTimeout = 500 * time.Millisecond

// HandleWS 是给 gin 路由用的 WS handler, 自动用 FeatureBridge 的 spec 串起来
// 鉴权 + 升级 + dial agent + pipe。
//
// 鉴权策略 (优先级):
//  1. `?ws_token=<...>` 短命一次性 ticket (推荐): consume Redis ticket, 拿 userID + sessionID;
//     ticket 用一次就销毁, 避免 JWT 落到 nginx access log 长期暴露。
//  2. `?token=<jwt>` 完整 JWT (DEPRECATED, 兼容旧前端): 直接 ParseToken + OwnsSession,
//     命中时打 warn 日志,2 个版本周期后下掉。
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

	agentWSURL, err := buildAgentWSURL(f.bridge.client.BaseURL(), sessionID)
	if err != nil {
		slog.Error("agentbridge ws: bad agent base url",
			"base_url", f.bridge.client.BaseURL(), "err", err)
		utils.ServerError(c, "agent base url misconfigured")
		return
	}

	frontConn, err := frontUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Warn("agentbridge ws: upgrade failed", "feature", f.spec.Key, "err", err)
		return
	}
	defer frontConn.Close()

	header := http.Header{}
	if tok := f.bridge.client.AuthToken(); tok != "" {
		header.Set("Authorization", "Bearer "+tok)
	}
	agentConn, _, err := agentDialer.Dial(agentWSURL, header)
	if err != nil {
		slog.Error("agentbridge ws: dial agent failed",
			"feature", f.spec.Key, "agent_url", agentWSURL,
			"user_id", userID, "session_id", sessionID, "err", err)
		_ = frontConn.WriteJSON(gin.H{
			"type":    "error",
			"message": "agent 不可达,请重试",
		})
		return
	}
	defer agentConn.Close()

	// 探测 session 是否已经有过 user entry:
	//   - 没有 (空会话 / 刚 reset) → 这次 WS 的第一条 user_message 注入 system prompt prefix
	//   - 有 (页面刷新或重连)     → prefix 已在 transcript 里, 跳过注入
	// 探测失败 → 按 "未注入" 兜底 (代价: 多注入一次, 远小于完全不注入)。
	// 仅当 spec.InjectPromptOnFirstMsg = true 才做探测。
	alreadyInjected := true
	if f.spec.InjectPromptOnFirstMsg {
		probeCtx, probeCancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
		hasUser, probeErr := f.SessionAlreadyHasUserMessage(probeCtx, sessionID)
		probeCancel()
		if probeErr != nil {
			slog.Warn("agentbridge ws: probe injected state failed, falling back to inject",
				"feature", f.spec.Key, "user_id", userID, "session_id", sessionID, "err", probeErr)
			alreadyInjected = false
		} else {
			alreadyInjected = hasUser
		}
	}

	slog.Info("agentbridge ws: bridge established",
		"feature", f.spec.Key, "user_id", userID, "session_id", sessionID,
		"already_injected", alreadyInjected)

	// hookCtx 用于 PreUserMessage / OnMessageComplete; WS 关闭时 cancel, 让钩子里
	// 阻塞中的 Redis 调用能及时退出。不用 c.Request.Context() (gin handler 一返回就 cancel)。
	hookCtx, cancelHooks := context.WithCancel(context.Background())
	defer cancelHooks()

	// "多窗口接管" 注册: 把这条 WS 写进 activeWSConns, 同 (user, feature) 的老 WS
	// (如有) 收到 displaced 帧后 Close(1000)。frontWriteMu 跟 pipe 共用同一把锁,
	// 让 displacer 写 front 不会跟 pipe 内的 "agent→front 转发" 并发冲突
	// (gorilla websocket WriteMessage 非线程安全)。
	frontWriteMu := &sync.Mutex{}
	registered := &displacedConn{
		conn:       frontConn,
		writeMu:    frontWriteMu,
		featureKey: f.spec.Key,
		userID:     userID,
		agentSID:   sessionID,
	}
	cleanupRegistry := f.bridge.registerAndDisplaceOldWS(f.spec.Key, userID, registered)
	defer cleanupRegistry()

	f.pipe(hookCtx, userID, sessionID, frontConn, agentConn, frontWriteMu, alreadyInjected)

	slog.Info("agentbridge ws: bridge closed",
		"feature", f.spec.Key, "user_id", userID, "session_id", sessionID)
}

// pipe 在前端 WS ↔ agent WS 之间双向转发, 并定时向 agent 发应用层 ping 保活。
// 任一侧 close/error → 一并收口。
//
// hookCtx: 给 PreUserMessage / OnMessageComplete 钩子用的 ctx (WS 关闭时一并 cancel)。
// userID: 已通过 JWT 校验的用户 ID, 注入给钩子做配额/账单识别。
// frontWriteMu: 从 HandleWS 传入的 front 写锁 (跟 displacement 共用); pipe 内所有
//   front.Write* 都走这把锁, 防止与 displacer "踢老 WS" 时并发写违反 gorilla 契约。
// alreadyInjected: 当此 session 之前已注入过 system prompt prefix 时传 true,
//   pipe 会跳过本次的首条 user_message 改写。
func (f *FeatureBridge) pipe(
	hookCtx context.Context, userID uint, sessionID string,
	front, agentSide *gorillaws.Conn,
	frontWriteMu *sync.Mutex,
	alreadyInjected bool,
) {
	var (
		closeOnce      sync.Once
		writeMu        sync.Mutex // agentSide 的写要互斥 (pipe 转发 + 心跳两路写)
		promptInjected atomic.Bool
	)
	if alreadyInjected || !f.spec.InjectPromptOnFirstMsg {
		promptInjected.Store(true)
	}

	closeBoth := func() {
		closeOnce.Do(func() {
			// 先 best-effort 写 CloseMessage, 让对端看到 orderly shutdown
			// (前端 reconnect 逻辑能据 CloseNormalClosure 判断要不要重试)。
			// front 那边走 frontWriteMu 保护 (与 displacer 互斥); WriteControl 实际
			// 跟 WriteMessage 不互锁但 gorilla 文档要求高级场景手动互斥, 拿一下安全。
			deadline := time.Now().Add(closeMessageWriteTimeout)
			closeFrame := gorillaws.FormatCloseMessage(gorillaws.CloseNormalClosure, "")
			frontWriteMu.Lock()
			_ = front.WriteControl(gorillaws.CloseMessage, closeFrame, deadline)
			frontWriteMu.Unlock()
			_ = agentSide.WriteControl(gorillaws.CloseMessage, closeFrame, deadline)
			_ = front.Close()
			_ = agentSide.Close()
		})
	}

	// ReadDeadline 在每个 read 循环里 refresh; 超时返回 net.Error.Timeout()=true,
	// 不命中 IsCloseError → 走 debug 日志 + 收口。

	writeAgent := func(mt int, data []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return agentSide.WriteMessage(mt, data)
	}

	// writeFront 走 frontWriteMu, 保证 pipe 的 agent→front 转发 / writeFrontJSON
	// 错误帧 / displacer 踢人 之间互斥, 不违反 gorilla 写线程契约。
	writeFront := func(mt int, data []byte) error {
		frontWriteMu.Lock()
		defer frontWriteMu.Unlock()
		return front.WriteMessage(mt, data)
	}

	stopPing := make(chan struct{})
	pingInterval := f.spec.PingIntervalOrDefault()
	safego.Go("agentbridge-ws-ping:"+f.spec.Key, func() {
		ticker := time.NewTicker(pingInterval)
		defer ticker.Stop()
		for {
			select {
			case <-stopPing:
				return
			case <-ticker.C:
				if err := writeAgent(gorillaws.TextMessage, agentPingPayload); err != nil {
					slog.Debug("agentbridge ws: keepalive ping write failed",
						"feature", f.spec.Key, "err", err)
					return
				}
			}
		}
	})

	done := make(chan struct{}, 2)

	// writeFrontJSON 在 quota/usage 错误时给前端回 error 帧。失败只打 debug,
	// 因为 WS 多半已经在断开过程中。走 frontWriteMu (与 displacer 互斥)。
	writeFrontJSON := func(payload any) {
		raw, err := json.Marshal(payload)
		if err != nil {
			slog.Debug("agentbridge ws: front payload marshal failed",
				"feature", f.spec.Key, "err", err)
			return
		}
		if err := writeFront(gorillaws.TextMessage, raw); err != nil {
			slog.Debug("agentbridge ws: front write json failed",
				"feature", f.spec.Key, "err", err)
		}
	}

	// front → agent: 配额检查 → 首条 user_message 注入 prefix → 转发
	safego.Go("agentbridge-ws-front2agent:"+f.spec.Key, func() {
		defer func() { done <- struct{}{} }()
		for {
			_ = front.SetReadDeadline(time.Now().Add(frontReadDeadline))
			mt, data, err := front.ReadMessage()
			if err != nil {
				if !gorillaws.IsCloseError(err, gorillaws.CloseNormalClosure, gorillaws.CloseGoingAway) {
					slog.Debug("agentbridge ws: front read end",
						"feature", f.spec.Key, "err", err)
				}
				return
			}
			if mt == gorillaws.TextMessage {
				// "继续对话" = 发出 user_message 才算会话活跃 → Touch last_accessed_at, 让它在
				// 侧边栏列表置顶。单纯点选历史会话 (ActivateSession) 不再 Touch, 所以查看历史
				// 不会打乱排序; 只有真的说了话才上浮。其它控制帧 (ping / stop / set_runtime_config /
				// permission_response) 不算活跃, 不 Touch。
				if _, isUserMsg := extractUserMessageContent(data); isUserMsg {
					if err := f.bridge.repo.Touch(sessionID); err != nil {
						slog.Debug("agentbridge ws: touch last_accessed_at failed",
							"feature", f.spec.Key, "session_id", sessionID, "err", err)
					}
				}
				// 配额检查: 只对 user_message 帧生效, 其它控制帧 (ping / permission_response /
				// set_runtime_config / stop_generation) 不消耗额度。
				if f.spec.PreUserMessage != nil {
					if content, isUserMsg := extractUserMessageContent(data); isUserMsg {
						if err := callPreUserMessage(f.spec.PreUserMessage, hookCtx, userID, content); err != nil {
							slog.Info("agentbridge ws: user_message rejected by PreUserMessage",
								"feature", f.spec.Key, "user_id", userID, "err", err)
							writeFrontJSON(gin.H{
								"type":      "error",
								"code":      classifyPreUserMessageError(err),
								"message":   err.Error(),
								"retryable": !errors.Is(err, ErrQuotaExceeded),
							})
							// 不转发, 但保持 WS 打开 — 用户可以下一轮再试 (或第二天等额度回滚)
							continue
						}
					}
				}
				if f.spec.InjectPromptOnFirstMsg {
					// 拉 prompt 从 picker 而不是 spec.SystemPrompt const:
					//   - 只在"本次 WS 连接还没注入过"时才会 Pick (atomic CAS 保护)
					//   - Pick 失败 (DB/Redis 故障 + 缓存空) → 视为 critical, 不强约束放进去
					//     反而让 agent 跑飞, 不如失败一帧让用户看到 error
					if !promptInjected.Load() && f.spec.Picker != nil {
						choice, perr := f.spec.Picker.Pick(hookCtx, PickInput{UserID: userID})
						if perr != nil {
							slog.Error("agentbridge ws: picker.Pick failed, dropping user_message",
								"feature", f.spec.Key, "err", perr)
							writeFrontJSON(gin.H{
								"type":      "error",
								"code":      "prompt_unavailable",
								"message":   "系统提示词暂不可用, 请稍后再试 (admin 请检查 feature_prompts 表)",
								"retryable": true,
							})
							continue
						}
						if rewritten, ok := injectSystemPromptIntoFirstUserMessage(
							&promptInjected, data, choice.SystemPrompt); ok {
							data = rewritten
							slog.Info("agentbridge ws: injected system prompt prefix into first user_message",
								"feature", f.spec.Key,
								"prompt_id", choice.PromptID,
								"slug", choice.Slug,
								"version", choice.Version)
						}
					} else if !promptInjected.Load() && f.spec.Picker == nil {
						// 配置错误: 开了 InjectPromptOnFirstMsg 但忘配 Picker。
						// 这是开发期 bug, fail-fast 比 silent 跑飞掉强。
						slog.Error("agentbridge ws: InjectPromptOnFirstMsg=true but Picker is nil",
							"feature", f.spec.Key)
						writeFrontJSON(gin.H{
							"type":      "error",
							"code":      "spec_misconfigured",
							"message":   "feature spec 配置缺失 picker, 请联系管理员",
							"retryable": false,
						})
						continue
					}
				}
			}
			if err := writeAgent(mt, data); err != nil {
				slog.Debug("agentbridge ws: agent write end", "feature", f.spec.Key, "err", err)
				return
			}
		}
	})

	// agent → front: 拦截 permission_request 自动 approve / 解析 message_complete usage
	safego.Go("agentbridge-ws-agent2front:"+f.spec.Key, func() {
		defer func() { done <- struct{}{} }()
		for {
			// 每收一帧重置 deadline; agent 周期性回 {type:"pong"} 给 backend 的 ping,
			// 60s 内一帧都没收到 (含 pong) → 视为 agent 卡死, 让 read 超时收口。
			_ = agentSide.SetReadDeadline(time.Now().Add(agentReadDeadline))
			mt, data, err := agentSide.ReadMessage()
			if err != nil {
				if !gorillaws.IsCloseError(err, gorillaws.CloseNormalClosure, gorillaws.CloseGoingAway) {
					slog.Debug("agentbridge ws: agent read end", "feature", f.spec.Key, "err", err)
				}
				return
			}
			if mt == gorillaws.TextMessage {
				if f.spec.AutoApprovePermission {
					sessionWorkDir := path.Join(agentSessionWorkdirRoot(), sessionID)
					if reply, ok := decidePermission(data, sessionWorkDir, specDeny(f.spec)); ok {
						if err := writeAgent(gorillaws.TextMessage, reply); err != nil {
							slog.Debug("agentbridge ws: permission decision write failed",
								"feature", f.spec.Key, "err", err)
							return
						}
					}
				}
				if f.spec.OnMessageComplete != nil {
					if usage, ok := extractMessageCompleteUsage(data); ok {
						// 非阻塞 — 钩子做 DB 写入 / 日志 / 账单, 不能拖累 pipe 转发
						hook := f.spec.OnMessageComplete
						featureKey := f.spec.Key
						safego.Go("agentbridge-on-message-complete:"+featureKey, func() {
							hook(hookCtx, userID, usage)
						})
					}
				}
			}
			if err := writeFront(mt, data); err != nil {
				slog.Debug("agentbridge ws: front write end", "feature", f.spec.Key, "err", err)
				return
			}
		}
	})

	<-done
	close(stopPing)
	closeBoth()
	<-done
}

// injectSystemPromptIntoFirstUserMessage 把 systemPrompt 作为 prefix 拼到首条
// user_message 的 content 前面。后续 user_message 不再注入。
//
// 返回 (改写后 bytes, true) 仅当本帧被识别为首条 user_message 且改写成功;
// 否则 (nil, false), caller 原样转发。
//
// 并发安全: 用 atomic.CompareAndSwap 保证同一连接生命周期内只会真正改写一次。
func injectSystemPromptIntoFirstUserMessage(injected *atomic.Bool, raw []byte, systemPrompt string) ([]byte, bool) {
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
	generic["content"] = buildInjectionPrefix(systemPrompt) + probe.Content

	out, err := json.Marshal(generic)
	if err != nil {
		return nil, false
	}
	return out, true
}

// buildInjectionPrefix 用 marker 包住 systemPrompt, 让模型清楚 prefix 边界。
// marker 是英文 + 醒目大括号, 减少与用户内容冲突的概率。
func buildInjectionPrefix(systemPrompt string) string {
	return "[AGENT BRIDGE — STRICT RULES YOU MUST FOLLOW]\n" +
		systemPrompt +
		"\n[/AGENT BRIDGE — END OF RULES]\n\n以下是用户的请求:\n"
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
		slog.Warn("agentbridge ws: permission DENIED (out-of-workspace or unsafe tool)",
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
var fileToolPathKeys = []string{"file_path", "path", "notebook_path", "filePath", "notebookPath"}

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
	// Bash 放行 (2026-05): agent 需要 Bash 跑 pandoc/python 把 docx/xlsx 转成可读文本。
	// ⚠️ Bash 是 shell, 无法做路径限制 —— 本地接受此风险 (见 agent
	// conversationService.ts DEFAULT_DISALLOWED_TOOLS 注释); 生产应靠 bubblewrap sandbox
	// 把 Bash 关进 cwd + 断网, 而不是靠这里的 permission 裁决。
	if toolName == "Bash" || toolName == "BashOutput" || toolName == "KillShell" {
		return true
	}
	// Web 工具 / Skill 放行 (2026-06, 配合 egress 代理): agent 在 internal 网, 出网只能经
	// egress 代理 (域名/端口控制 + 统一记日志), SSRF/外泄由网络层兜底, 故这里放行 WebFetch/WebSearch。
	// Skill 走 inline 执行 —— skill 正文里再调的工具 (Bash/文件/mcp/web) 仍会逐个回到本函数裁决,
	// 故放行 Skill 本身不放大权限面。
	// ⚠️ Task/Agent (子 agent) 不在此列, 仍全禁: 子 agent 的工具调用**旁路本裁决**, 必须等生产
	// L2 沙箱 (bubblewrap/gVisor) 就位再放 (见 agent conversationService.ts 注释)。
	if toolName == "WebFetch" || toolName == "WebSearch" || toolName == "Skill" {
		return true
	}
	// 文件工具: 校验路径在会话目录内
	switch toolName {
	case "Read", "Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "Grep", "LS", "Ls":
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

// authenticateWSRequest 实现 HandleWS 的双轨鉴权 (ws_token 优先, JWT 回落)。
// 任一路径失败都直接 c.JSON 写 response 并 return error, caller 仅需 return。
//
// 返回 (userID, sessionID, nil) 表示鉴权通过; sessionID 已与 pathSessionID 比对一致。
func (f *FeatureBridge) authenticateWSRequest(c *gin.Context, pathSessionID string) (uint, string, error) {
	if wsToken := strings.TrimSpace(c.Query("ws_token")); wsToken != "" {
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

	// JWT fallback (deprecated)
	jwtToken := strings.TrimSpace(c.Query("token"))
	if jwtToken == "" {
		utils.Unauthorized(c, "missing ws_token")
		return 0, "", errors.New("missing ws_token")
	}
	slog.Warn("agentbridge ws: DEPRECATED JWT-in-URL fallback used, frontend should switch to ws_token",
		"feature", f.spec.Key, "session_id", pathSessionID)
	claims, err := utils.ParseToken(jwtToken)
	if err != nil {
		slog.Warn("agentbridge ws: invalid jwt token",
			"feature", f.spec.Key, "session_id", pathSessionID, "err", err)
		utils.Unauthorized(c, "invalid token")
		return 0, "", err
	}
	// 对齐 UserAuthMiddleware:仅接受 user 类型 token,且必须查 Redis 黑名单。
	// 少了这两道,登出/封号/降级后被吊销的 JWT 仍能从 ?token= 升级 WS(绕过 HTTP 中间件)。
	if claims.Type != "user" {
		slog.Warn("agentbridge ws: jwt wrong token type",
			"feature", f.spec.Key, "session_id", pathSessionID, "type", claims.Type)
		utils.Unauthorized(c, "invalid token type")
		return 0, "", errors.New("invalid token type")
	}
	if utils.IsTokenRevoked(c.Request.Context(), claims) {
		slog.Warn("agentbridge ws: jwt revoked",
			"feature", f.spec.Key, "session_id", pathSessionID, "user_id", claims.UserID)
		utils.Unauthorized(c, "token revoked")
		return 0, "", errors.New("token revoked")
	}
	uid := claims.UserID
	owns, ownErr := f.OwnsSession(uid, pathSessionID)
	if ownErr != nil {
		slog.Error("agentbridge ws: ownership check failed",
			"feature", f.spec.Key, "user_id", uid, "session_id", pathSessionID, "err", ownErr)
		utils.ServerError(c, "ownership check failed")
		return 0, "", ownErr
	}
	if !owns {
		slog.Warn("agentbridge ws: jwt session ownership failed",
			"feature", f.spec.Key, "user_id", uid, "session_id", pathSessionID)
		utils.Forbidden(c, "session does not belong to user")
		return 0, "", ErrSessionMismatch
	}
	return uid, pathSessionID, nil
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

// extractMessageCompleteUsage 浅 parse 一帧 agent→front 消息, 仅识别 message_complete 的 usage。
// 返回 (usage, true) 仅当本帧是 message_complete 且 usage 非空。
func extractMessageCompleteUsage(raw []byte) (AgentUsage, bool) {
	var zero AgentUsage
	if len(raw) == 0 || raw[0] != '{' {
		return zero, false
	}
	var probe struct {
		Type  string     `json:"type"`
		Usage AgentUsage `json:"usage"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return zero, false
	}
	if probe.Type != "message_complete" {
		return zero, false
	}
	return probe.Usage, true
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
