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
	"fmt"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"sync"
	"time"

	gorillaws "github.com/gorilla/websocket"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/llmusage"
)

// ServerSideChat 是 backend 自驱动的 agent 对话:
//
// 跟 HandleWS 的双向 pipe 不同, 这里 backend 自己扮演 "WS 客户端", 不需要任何
// 真实用户 WS 在线。用于审稿 / 元数据抽取这类后台 goroutine 触发的 agent 调用。
//
// 协议来自 agent/docs/api.md WebSocket 流式协议:
//   - C→S: { "type":"user_message", "content":"..." }
//   - S→C: content_start / content_delta(text) / message_complete / status:idle
//
// 简化策略:
//   - permission_request 走与 HandleWS 同一套路径感知 decidePermission: MCP 工具放行,
//     文件工具仅当路径落在本会话隔离 cwd 内才放行, 越界 (读别人会话 / 系统路径) 拒绝。
//     方案 B 把稿件/附件推到会话 cwd 让 agent Read, 这里的 cwd 限定就是隔离命门。
//   - 只抓 type=text 的 content_delta, 丢掉 tool_use 块
//   - 等到 message_complete 后 graceful close, 返回累积的文本
//
// 超时由调用方传入的 ctx 控制 (推荐 5 分钟级别)。
//
// 返回 (text, usage, error):
//   - text 是 agent 这一轮所有 text content_delta 拼接的结果
//   - usage 是 message_complete.usage 字段(可能 nil — 不是所有 model 都返)
//
// onDelta 每收到一个 content_delta(text) 就被调用一次(同步,在读循环里)。
// 用于 peer review 把 delta 转发给 StreamBroker -> SSE -> 前端实时渲染。
// 传 nil onDelta 退化成"只在最后返回完整 text"的普通批模式。
// (历史上还有一个 ServerSideChat 非流式 wrapper, 调用方全部迁到 streaming 后已删。)
// onStatus (可空) 在 agent 用工具的"静默期"被调 (读文件 / 检索 / 思考), 给一句中文进度提示,
// 让前端在没有正文 delta 时也能显示 "正在读取稿件…" 之类的 loading 文案, 恢复流式体感。
// modelID (可空) 指定本轮用哪个模型 (走 agent set_runtime_config 覆盖, 按 sessionId 持久)。
// peerreview 用它把 meta/letter 切到快模型 (haiku), review 切回主模型。空 = 用会话当前/默认模型。
// agent 的 user_message 处理会先 waitForRuntimeTransition, 所以先发 set_runtime_config 再发
// user_message 不会有竞态 (agent 内部串行)。
// denyTools(可变参)是本会话(feature)显式禁用的工具,作后端二道防线传给 permission 裁决:
// 命中即拒(无视路径)。现有调用方(peerreview)不传 → nil → 行为不变;Prism 传 prismDisallowedTools。
// ServerSideChatStreaming(Bridge 级):默认用 fork client(b.client)。保留给无 feature 上下文的调用方。
func (b *Bridge) ServerSideChatStreaming(
	ctx context.Context,
	sessionID string,
	prompt string,
	onDelta func(string),
	onStatus func(string),
	modelID string,
	denyTools ...string,
) (string, *ChatUsage, error) {
	return b.serverSideChatStreamingVia(ctx, b.client, sessionID, prompt, onDelta, onStatus, modelID, denyTools...)
}

// ServerSideChatStreaming(FeatureBridge 级):按 feature 路由(executor 命中走 executor,否则 fork)。
// peerreview server-side 切流靠它(P4a)。
func (f *FeatureBridge) ServerSideChatStreaming(
	ctx context.Context,
	sessionID string,
	prompt string,
	onDelta func(string),
	onStatus func(string),
	modelID string,
	denyTools ...string,
) (string, *ChatUsage, error) {
	return f.bridge.serverSideChatStreamingVia(ctx, f.client(), sessionID, prompt, onDelta, onStatus, modelID, denyTools...)
}

func (b *Bridge) serverSideChatStreamingVia(
	ctx context.Context,
	cl agent.Executor,
	sessionID string,
	prompt string,
	onDelta func(string),
	onStatus func(string),
	modelID string,
	denyTools ...string,
) (string, *ChatUsage, error) {
	if sessionID == "" {
		return "", nil, errors.New("agentbridge: empty sessionId")
	}
	if prompt == "" {
		return "", nil, errors.New("agentbridge: empty prompt")
	}

	wsURL, err := buildAgentWSURL(cl.BaseURL(), sessionID)
	if err != nil {
		return "", nil, fmt.Errorf("build agent ws url: %w", err)
	}
	// 文件工具放行的边界 = 本会话隔离 cwd (跟 HandleWS 一致)。
	sessionWorkDir := path.Join(agentSessionWorkdirRoot(), sessionID)

	header := http.Header{}
	if tok := cl.AuthToken(); tok != "" {
		header.Set("Authorization", "Bearer "+tok)
	}

	conn, _, err := agentDialer.DialContext(ctx, wsURL, header)
	if err != nil {
		return "", nil, fmt.Errorf("dial agent ws: %w", err)
	}

	// gorilla/websocket 只允许同一时刻一个 goroutine 写 conn。下面 ping goroutine、读循环里的
	// permission_response、以及关闭控制帧会并发写同一连接,不串行化会交错损坏帧甚至 panic。
	// 所有写 conn 的地方统一走 writeJSON / writeMsg(共享一把 writeMu)。
	var writeMu sync.Mutex
	writeJSON := func(v any) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteJSON(v)
	}
	writeMsg := func(messageType int, data []byte) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteMessage(messageType, data)
	}

	// 派生 ctx 专管 ping goroutine:函数一返回就 cancel → ping 立即退出。
	// 既避免原先依赖调用方 ctx 才退出的 goroutine 泄漏,也缩小它与关闭帧并发写的窗口。
	pingCtx, pingCancel := context.WithCancel(ctx)
	defer func() {
		pingCancel()
		writeMu.Lock()
		_ = conn.WriteControl(
			gorillaws.CloseMessage,
			gorillaws.FormatCloseMessage(gorillaws.CloseNormalClosure, ""),
			time.Now().Add(closeMessageWriteTimeout),
		)
		writeMu.Unlock()
		_ = conn.Close()
	}()

	// 先切模型 (可选) — agent 按 sessionId 记住 override 并在下条 user_message 前完成重启。
	if modelID != "" {
		rc := struct {
			Type       string  `json:"type"`
			ProviderID *string `json:"providerId"`
			ModelID    string  `json:"modelId"`
		}{Type: "set_runtime_config", ProviderID: nil, ModelID: modelID}
		if err := writeJSON(rc); err != nil {
			return "", nil, fmt.Errorf("write set_runtime_config: %w", err)
		}
	}

	// 发 user_message
	userMsg := struct {
		Type    string `json:"type"`
		Content string `json:"content"`
	}{Type: "user_message", Content: prompt}
	if err := writeJSON(userMsg); err != nil {
		return "", nil, fmt.Errorf("write user_message: %w", err)
	}

	var (
		textBuf      strings.Builder
		usage        *ChatUsage
		calls        []AgentUsage
		sessionTotal *AgentUsage
		complete     bool
	)

	// 应用层 ping 让 agent Bun.serve idleTimeout 不触发 (跟 HandleWS 同款)
	pingTicker := time.NewTicker(25 * time.Second)
	defer pingTicker.Stop()
	safego.Go("agentbridge-serverside-ping", func() {
		for {
			select {
			case <-pingCtx.Done():
				return
			case <-pingTicker.C:
				_ = writeMsg(gorillaws.TextMessage, agentPingPayload)
			}
		}
	})

	// 读循环
	for !complete {
		// 单帧超时跟 HandleWS 同款 — 60s 没动静视为 hang
		if err := conn.SetReadDeadline(time.Now().Add(agentReadDeadline)); err != nil {
			return "", nil, fmt.Errorf("set read deadline: %w", err)
		}
		_, raw, err := conn.ReadMessage()
		if err != nil {
			if ctx.Err() != nil {
				return "", nil, ctx.Err()
			}
			return "", nil, fmt.Errorf("read frame: %w", err)
		}

		var ev serverEvent
		if err := json.Unmarshal(raw, &ev); err != nil {
			slog.Warn("agentbridge ServerSideChat: bad event json",
				"err", err, "raw", truncateBytes(raw, 200))
			continue
		}
		switch ev.Type {
		case "content_delta":
			if ev.Text != "" {
				textBuf.WriteString(ev.Text)
				if onDelta != nil {
					onDelta(ev.Text)
				}
			}
		case "content_start":
			// 工具块开始 (Read/Bash/MCP 检索) → 给前端一句进度提示, 填补无正文 delta 的静默期。
			if ev.BlockType == "tool_use" && onStatus != nil {
				onStatus(toolStatusNote(ev.ToolName))
			}
		case "status":
			// agent 状态切换 (thinking / tool_executing) → 进度提示。
			if onStatus != nil {
				if note := stateStatusNote(ev.State); note != "" {
					onStatus(note)
				}
			}
		case "thinking":
			// 抛弃 thinking 正文 (不返回推理过程); 进度感由上面的 status/content_start 提供
		case "permission_request":
			// 路径感知裁决 (跟 HandleWS 同一函数): MCP 放行, 文件工具仅会话 cwd 内放行。
			// decidePermission 直接吃原始帧 (含 toolName/input), 回完整 permission_response 字节。
			//
			// C14 审批轴: server-side 没有前端 WS, 没人能做人审, 故**只支持 auto** —— 无条件
			// 自动裁决。唯一调用方 peerreview 的 spec 本就是 PermissionAuto, 行为不变。若将来有
			// server-side feature 想要 passthrough, 需另设回调 (这里没有 *FeatureBridge / spec 可读)。
			if reply, ok := decidePermission(raw, sessionWorkDir, denyTools); ok {
				_ = writeMsg(gorillaws.TextMessage, reply)
			}
		case "message_complete":
			usage = ev.Usage
			calls = ev.Calls
			sessionTotal = ev.SessionTotal
			complete = true
		case "token_usage":
			// 带外模型调用(会话标题生成等不产生 message_complete 帧)的 token:不进会话累计水位,
			// 按「附加」记一行,归属取 ctx 的 llmusage.Call。镜像 ws.go 的交互路径 —— 补回 server-side
			// (peerreview)此前因 switch 缺该 case 而**静默丢弃** title_gen token 帧的系统性漏计。
			if b.llmRec != nil {
				if u, kind, ok := extractTokenUsageFrame(raw); ok {
					call := llmusage.CallFromCtx(ctx)
					feature := call.Feature
					if feature == "" {
						feature = llmusage.FeaturePeerReview
					}
					uid, feat, knd, sid, rec := call.UserID, feature, kind, sessionID, b.llmRec
					safego.Go("agentbridge-serverside-token-usage-record:"+feat, func() {
						recordOutOfBandTokens(rec, uid, feat, knd, sid, u)
					})
				}
			}
		case "pong", "connected":
			// 心跳应答 / 握手 ack — 忽略
		case "error":
			return "", nil, fmt.Errorf("agent error: %s", ev.Message)
		}
	}

	// 带内 token 账本(server-side,如 peerreview):message_complete 带回本轮 per-call 明细(calls)
	// 与会话累计(session_total)。归属(user/feature)取 ctx 里的 llmusage.Call —— peerreview 的
	// reviewCallCtxWith 注入(此前是「记账死代码」,现接上)。用 accrueTurnUsage 按会话累计水位算增量、
	// 自愈丢帧、防重连双计,与 WS pipe 路同一套。不再依赖已删除的 HTTP per-call 旁路。
	if b.llmRec != nil {
		// P3:补差行按本轮注入的 modelID 计价(peerreview 绑主模型最贵,残差不能落基准价)。
		if rows := b.accrueTurnUsage(sessionID, modelID, chatUsageToAgentUsage(usage), calls, sessionTotal); len(rows) > 0 {
			call := llmusage.CallFromCtx(ctx)
			feature := call.Feature
			if feature == "" {
				feature = llmusage.FeaturePeerReview // server-side 当前唯一用途;无 ctx 归属时兜底
			}
			uid, feat, sid, rec := call.UserID, feature, sessionID, b.llmRec
			safego.Go("agentbridge-serverside-usage-record:"+feat, func() {
				for i := range rows {
					recordAgentTokens(rec, b.catalog, uid, feat, sid, rows[i])
				}
			})
		}
	}

	return textBuf.String(), usage, nil
}

// chatUsageToAgentUsage 把 message_complete.usage(ChatUsage,无 model)转成 AgentUsage,
// 仅作 accrueTurnUsage 的整轮兜底(per-call 明细缺失时给对账补差行用;model 留空)。
func chatUsageToAgentUsage(u *ChatUsage) AgentUsage {
	if u == nil {
		return AgentUsage{}
	}
	return AgentUsage{
		InputTokens:         u.InputTokens,
		OutputTokens:        u.OutputTokens,
		CacheReadTokens:     u.CacheReadTokens,
		CacheCreationTokens: u.CacheCreationTokens,
	}
}

// serverEvent 是 agent S→C 消息的最小子集 — 只把我们 ServerSideChat 关心的字段抽出来。
// 完整协议见 agent/src/server/ws/events.ts。
type serverEvent struct {
	Type      string     `json:"type"`
	Text      string     `json:"text,omitempty"`      // content_delta / thinking
	RequestID string     `json:"requestId,omitempty"` // permission_request
	Message   string     `json:"message,omitempty"`   // error
	Usage     *ChatUsage `json:"usage,omitempty"`     // message_complete
	BlockType string     `json:"blockType,omitempty"` // content_start: "text" | "tool_use"
	ToolName  string     `json:"toolName,omitempty"`  // content_start (tool_use)
	State     string     `json:"state,omitempty"`     // status
	// ─── 带内 token 账本(message_complete 携带)──────────────────────────────
	Calls        []AgentUsage `json:"calls,omitempty"`         // 本轮每次模型调用的 per-call 明细
	SessionTotal *AgentUsage  `json:"session_total,omitempty"` // 会话累计快照(水位自愈用)
}

// toolStatusNote — 把工具名翻译成给用户看的中文进度提示。
func toolStatusNote(tool string) string {
	switch {
	case strings.HasPrefix(tool, "mcp__"):
		return "正在检索文献…"
	case tool == "Read":
		return "正在读取稿件…"
	case tool == "Bash" || tool == "BashOutput":
		return "正在解析文件…"
	case tool == "Glob" || tool == "Grep" || tool == "LS":
		return "正在查阅材料…"
	case tool == "Skill":
		return "正在调用技能…"
	default:
		return "正在处理…"
	}
}

// stateStatusNote — agent status 状态 → 进度提示 (只挑有意义的几个, 其余返回空忽略)。
func stateStatusNote(state string) string {
	switch state {
	case "thinking":
		return "正在分析…"
	case "tool_executing":
		return "正在调用工具…"
	default:
		return ""
	}
}

// ChatUsage 对应 agent message_complete.usage,记 token 计费用。
// 字段名/tag 与 agent 实际下发(events.ts)+ AgentUsage 对齐: cache_read_tokens / cache_creation_tokens
// (之前误写成 cache_*_input_tokens, 两个 cache 字段永远解析成 0, 已修)。
type ChatUsage struct {
	InputTokens         int `json:"input_tokens,omitempty"`
	OutputTokens        int `json:"output_tokens,omitempty"`
	CacheReadTokens     int `json:"cache_read_tokens,omitempty"`
	CacheCreationTokens int `json:"cache_creation_tokens,omitempty"`
}

func truncateBytes(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "..."
}

// ExtractMemoryServerSide 在 server-side feature(peerreview)一轮结束后,把「记忆抽取」推给 agent 执行。
//
// 与 WS pipe 路(ws.go)不同:server-side 没有常驻 pipe,这里**新开一条**到该 agent 会话的 WS
// (此类会话无前端连接 → 不会 displacement live pipe),发 extract_memory 控制帧,读到 memory_update
// 即落库后返回。限流(per-user 90s)+ 拉 transcript + 组装抽取 prompt + 写库校验全在 backend
// (复用 buildMemoryExtractFrame / IngestMemory,与 pipe 路同一套);backend 不跑抽取 LLM。
// best-effort:任何失败仅记 debug,绝不影响审稿结果。
func (b *Bridge) ExtractMemoryServerSide(ctx context.Context, sessionID string, userID uint, featureKey string) {
	if b.memSvc == nil || userID == 0 || sessionID == "" {
		return
	}
	// M2:transcript 从 journal 取(executor feature),frame 组装一致。
	frame := b.buildMemoryExtractFrame(ctx, userID, sessionID, featureKey)
	if frame == nil {
		return
	}

	// M2:dial 走 feature-routed client(peerreview 已切 executor)→ 命中正确上游;否则连到 fork 抽个空。
	cl := b.clientForFeature(featureKey)
	wsURL, err := buildAgentWSURL(cl.BaseURL(), sessionID)
	if err != nil {
		return
	}
	header := http.Header{}
	if tok := cl.AuthToken(); tok != "" {
		header.Set("Authorization", "Bearer "+tok)
	}
	conn, _, err := agentDialer.DialContext(ctx, wsURL, header)
	if err != nil {
		slog.Debug("agentbridge: server-side extract_memory dial failed", "session_id", sessionID, "err", err)
		return
	}
	defer func() {
		_ = conn.WriteControl(gorillaws.CloseMessage,
			gorillaws.FormatCloseMessage(gorillaws.CloseNormalClosure, ""),
			time.Now().Add(closeMessageWriteTimeout))
		_ = conn.Close()
	}()

	if err := conn.WriteMessage(gorillaws.TextMessage, frame); err != nil {
		slog.Debug("agentbridge: server-side extract_memory write failed", "session_id", sessionID, "err", err)
		return
	}

	// 读到 memory_update 即落库后返回;沿途 token_usage(kind=memory_extract)记账。整体 30s 超时兜底。
	deadline := time.Now().Add(30 * time.Second)
	for {
		if err := conn.SetReadDeadline(deadline); err != nil {
			return
		}
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return
		}
		switch frameType(raw) {
		case "token_usage":
			if u, kind, ok := extractTokenUsageFrame(raw); ok {
				uid := userID
				recordOutOfBandTokens(b.llmRec, &uid, llmusage.FeaturePeerReview, kind, sessionID, u)
			}
		case "memory_update":
			if rawText, ok := extractMemoryUpdateFrame(raw); ok {
				b.memSvc.IngestFromAgent(userID, rawText)
			}
			return
		case "error":
			return
		}
	}
}
