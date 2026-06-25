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

	"scholar-backend/internal/common/config"
	"scholar-backend/internal/common/safego"
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

	// 判定 session 是否已注入过 system prompt prefix (仅 spec.InjectPromptOnFirstMsg=true):
	//
	//   1. 快路径: 读 agent_sessions.prompt_injected 标记 (uk 点查, migration 0024)。
	//      =true → 直接跳过, 不再为读一个 bool 把整段 transcript 从 agent 拉回来
	//      (原探测无 limit, 长会话每次开页/刷新/重连都付随会话长度线性增长的传输+解析成本)。
	//   2. 标记缺失/读失败 → 回落原 transcript 探测:
	//        - 没有 user entry (空会话 / 刚 reset) → 这次 WS 的第一条 user_message 注入 prefix
	//        - 有 (存量会话标记未回填)             → 跳过注入, 并回填标记让下次走快路径
	//      探测失败 → 按 "未注入" 兜底 (代价: 多注入一次, 远小于完全不注入)。
	alreadyInjected := true
	if f.spec.InjectPromptOnFirstMsg {
		flagKnown := false
		if row, derr := f.bridge.repo.FindByAgentSessionID(sessionID); derr == nil && row.PromptInjected {
			flagKnown = true
		}
		if !flagKnown {
			probeCtx, probeCancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
			hasUser, probeErr := f.SessionAlreadyHasUserMessage(probeCtx, sessionID)
			probeCancel()
			if probeErr != nil {
				slog.Warn("agentbridge ws: probe injected state failed, falling back to inject",
					"feature", f.spec.Key, "user_id", userID, "session_id", sessionID, "err", probeErr)
				alreadyInjected = false
			} else {
				alreadyInjected = hasUser
				if hasUser {
					// 探测到 transcript 已有 user entry (= prefix 已注入) → 回填标记
					f.markPromptInjected(sessionID)
				}
			}
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
	// 接管判定按 (feature, **agent session**) 寻址 —— 只有同一个 session 被两条 WS 同时驱动才算
	// 冲突;同一用户开不同会话/项目(claw 多会话、prism 多项目)不再互相误踢(见 displacementKey)。
	cleanupRegistry := f.bridge.registerAndDisplaceOldWS(f.spec.Key, sessionID, registered)
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
//
//	front.Write* 都走这把锁, 防止与 displacer "踢老 WS" 时并发写违反 gorilla 契约。
//
// alreadyInjected: 当此 session 之前已注入过 system prompt prefix 时传 true,
//
//	pipe 会跳过本次的首条 user_message 改写。
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
		// pendingMark: 本连接做了 prefix 注入、但还没确认 agent 落盘。等首个 message_complete
		// 到达(agent 已处理并持久化首轮)才把 prompt_injected 落库 —— 见 agent→front 分支。
		pendingMark atomic.Bool
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
		// 写超时收口: 防慢客户端把转发 goroutine 永久阻塞在 WriteMessage 上(详见 frontWriteDeadline)。
		_ = front.SetWriteDeadline(time.Now().Add(frontWriteDeadline))
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
			// didInjectThisFrame: 本帧真的做了 prefix 注入 → 转发成功后把 prompt_injected
			// 标记落库。放在 writeAgent 成功之后才标, 避免"注入了但没送达 agent"时标脏。
			didInjectThisFrame := false
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
						// 首条消息一并注入该用户的长期记忆 (跨所有 feature 共享同一份)。
						memCtx := f.bridge.MemoryBlocks(userID)
						if rewritten, ok := injectSystemPromptIntoFirstUserMessage(
							&promptInjected, data, choice.SystemPrompt, memCtx); ok {
							data = rewritten
							didInjectThisFrame = true
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
			if didInjectThisFrame {
				// 仅记「待标记」—— 真正落库推迟到 agent 回首个 message_complete(确认已处理+落盘)。
				// 旧实现在 writeAgent 成功(= 帧已送达,≠ jsonl 已持久化)即标,agent 落盘前崩溃会 stale-true。
				pendingMark.Store(true)
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
				// 先做一次极轻量 type 探测(只解 `{type}`)。agent 的 WS 协议每个流式 token 发一帧
				// content_delta —— 一次回答就是成百上千帧, 而它既不是 permission_request 也不是
				// message_complete。旧实现对每一帧都跑 decidePermission + extractMessageCompleteUsage
				// 两次完整 json.Unmarshal; 这里改成先探 type, 只有命中的帧才做重解析。
				// content_delta(绝大多数)只付一次微型 unmarshal。
				switch frameType(data) {
				case "permission_request":
					// C14 审批轴: auto = backend 自动裁决 (decidePermission, 不透传前端);
					// passthrough = 不裁决, 让 permission_request 落到下方统一 writeFront 原样转发给前端,
					// 前端回的 permission_response 经 front2agent 循环原样写回 agent (无特殊处理)。
					if f.spec.EffectivePermissionMode() == PermissionAuto {
						sessionWorkDir := path.Join(agentSessionWorkdirRoot(), sessionID)
						if reply, ok := decidePermission(data, sessionWorkDir, specDeny(f.spec)); ok {
							if err := writeAgent(gorillaws.TextMessage, reply); err != nil {
								slog.Debug("agentbridge ws: permission decision write failed",
									"feature", f.spec.Key, "err", err)
								return
							}
						}
					}
				case "message_complete":
					if usage, calls, sessionTotal, isComplete := extractMessageComplete(data); isComplete {
						// 首个 message_complete = agent 已处理并落盘首轮(含注入了 prefix 的首条 user_message)。
						// 此刻才把 prompt_injected 落库,杜绝「帧送达但落盘前崩溃」的 stale-true。
						if pendingMark.CompareAndSwap(true, false) {
							f.markPromptInjected(sessionID)
						}
						if f.spec.OnMessageComplete != nil {
							// 非阻塞 — 钩子做 slog / 审计, 不能拖累 pipe 转发
							hook := f.spec.OnMessageComplete
							featureKey := f.spec.Key
							safego.Go("agentbridge-on-message-complete:"+featureKey, func() {
								hook(hookCtx, userID, usage)
							})
						}
						// 带内 token 账本:按会话累计水位算出本轮要落库的行(per-call 明细 + 必要时一行对账补差)。
						// 水位读改写在 pipe 读循环内串行完成(保证幂等);真正落库(含 Redis 日配额)异步,
						// 归属(user/feature)直接来自已鉴权会话, 不反查。
						if rows := f.bridge.accrueTurnUsage(sessionID, usage, calls, sessionTotal); len(rows) > 0 {
							uid, feat, sid, rec := userID, f.spec.Key, sessionID, f.bridge.llmRec
							safego.Go("agentbridge-usage-record:"+feat, func() {
								for i := range rows {
									recordAgentTokens(rec, &uid, feat, sid, rows[i])
								}
							})
						}
						// 一轮结束后,把「记忆抽取」任务异步推给 agent 执行(backend 不跑 LLM):限流 +
						// 组装 prompt 后,经**同一条已鉴权 WS**(writeAgent,不新开连接避免 displacement)发
						// extract_memory 控制帧;agent 跑完廉价模型把原始输出经 memory_update 帧回传,由下方
						// agent→front 的 memory_update case 落库。仅 WS 对话 feature(smart_search/claw/prism)。
						if f.bridge.memSvc != nil && userID != 0 {
							uid, sid := userID, sessionID
							safego.Go("usermemory-extract-dispatch:"+f.spec.Key, func() {
								ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
								defer cancel()
								if frame := f.bridge.buildMemoryExtractFrame(ctx, uid, sid); frame != nil {
									if err := writeAgent(gorillaws.TextMessage, frame); err != nil {
										slog.Debug("agentbridge ws: extract_memory frame write failed",
											"feature", f.spec.Key, "session_id", sid, "err", err)
									}
								}
							})
						}
					}
				case "token_usage":
					// 带外模型调用(会话标题生成 / 记忆抽取等不产生 message_complete 帧的调用)的 token:
					// 不进会话累计水位,按「附加」记一行。kind 决定归属:memory_extract → Feature=memory
					// + SkipQuota(系统开销不扣用户日额度);其它(title_gen)→ 本 feature 正常计费。
					// 纯后端记账信号,前端无用 → 记完即 continue, 不 writeFront 转发。
					if u, kind, ok := extractTokenUsageFrame(data); ok {
						uid, feat, knd, sid, rec := userID, f.spec.Key, kind, sessionID, f.bridge.llmRec
						safego.Go("agentbridge-token-usage-record:"+feat, func() {
							recordOutOfBandTokens(rec, &uid, feat, knd, sid, u)
						})
					}
					continue
				case "memory_update":
					// agent 跑完「记忆抽取」廉价模型调用后回传的原始输出。backend 据已鉴权会话的 userID
					// 落库(IngestMemory 内做 allow-list / 截断 / Upsert,agent 永远只是建议者)。
					// 纯后端信号 → 记完即 continue, 不 writeFront 转发。
					if userID != 0 {
						if raw, ok := extractMemoryUpdateFrame(data); ok {
							uid := userID
							safego.Go("agentbridge-memory-ingest:"+f.spec.Key, func() {
								f.bridge.IngestMemory(uid, raw)
							})
						}
					}
					continue
				case "session_title_updated":
					// 标题真源在 agent jsonl 的 feature(claw/smart_search)自管;但 backend-owned 标题
					// (prism:真源在 prism_projects.title)需 backend 落库:spec.OnTitleResult 非空即 tap,
					// 仅 aiGenerated 的最终标题落库(忽略 deriveTitle 占位,避免占位把项目名锁死)。
					// 不 continue —— 仍 writeFront 把标题帧转发前端。
					if f.spec.OnTitleResult != nil {
						if title, aiGen, ok := extractTitleUpdateFrame(data); ok && aiGen && title != "" {
							hook := f.spec.OnTitleResult
							uid, sid := userID, sessionID
							safego.Go("agentbridge-title-result:"+f.spec.Key, func() {
								hook(hookCtx, uid, sid, title)
							})
						}
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

// extractTokenUsageFrame 浅 parse 一帧 token_usage(带外模型调用,如会话标题生成):
// 不进会话累计水位,按「附加」记一行。返回 (usage, true) 仅当本帧确为 token_usage。
// extractTokenUsageFrame 解 agent→backend 的 token_usage 帧, 返回 (用量, kind, ok)。
// kind 标识这次带外调用的种类(title_gen / memory_extract / ...), 决定记账归到哪个 feature
// 及是否计入用户日额度(memory_extract → Feature=memory + SkipQuota,不扣用户额度)。
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
// kind=="memory_extract" → 归 Feature=memory 且 SkipQuota=true(系统后台开销, 不扣用户日额度);
// 其它(title_gen 等)→ 归本 feature, 正常计费。requestID 传 agent sessionID。
func recordOutOfBandTokens(rec llmusage.Recorder, userID *uint, feature, kind, sessionID string, u AgentUsage) {
	if rec == nil {
		return
	}
	if kind == "memory_extract" {
		rec.Record(llmusage.Usage{
			UserID:              userID,
			Feature:             llmusage.FeatureMemory,
			Source:              llmusage.SourceAgent,
			Provider:            "scholay-managed",
			Model:               u.Model,
			InputTokens:         u.InputTokens,
			OutputTokens:        u.OutputTokens,
			CacheReadTokens:     u.CacheReadTokens,
			CacheCreationTokens: u.CacheCreationTokens,
			RequestID:           sessionID,
			SkipQuota:           true,
		})
		return
	}
	recordAgentTokens(rec, userID, feature, sessionID, u)
}

// extractMemoryUpdateFrame 解 agent→backend 的 memory_update 帧, 取出 agent 跑完抽取的原始模型输出。
// backend 拿去 IngestMemory(parseUpdates + allow-list + 截断 + Upsert), 解析全在 backend(零 TS 漂移)。
func extractMemoryUpdateFrame(raw []byte) (string, bool) {
	if len(raw) == 0 || raw[0] != '{' {
		return "", false
	}
	var probe struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil || probe.Type != "memory_update" {
		return "", false
	}
	return probe.Text, true
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
