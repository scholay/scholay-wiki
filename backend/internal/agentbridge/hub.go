// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

// agentbridge/hub — 多端实时同步「扇出 Hub」(取代旧的「多窗口抢占 displacement」)
//
// 旧模型:每个浏览器各开一条 agent WS,backend 1:1 转发,新窗口建联即把老窗口 displace
// (踢掉)—— 因为一个 agent session 的 jsonl 必须单写者,两条 agent WS 同时驱动会双写损坏。
//
// 新模型:同一 (feature, sessionID) 只保留**一条上游 agent WS**(继续满足单写者),但
// backend 把它**扇出**给 N 条下游浏览器订阅者:
//   - agent→订阅者:每帧广播给所有订阅者(各自独立 out 队列 + 写超时,慢客户端单独丢,不互相拖累)。
//   - 订阅者→agent:任一订阅者发的 user_message 转发到唯一上游;并把「用户气泡」回声广播给**其他**
//     订阅者(agent 不回吐用户消息,故 backend 合成 user_echo 帧让其他端也能看到这句话)。
//   - 回答中锁住:一轮进行中(inFlight)时,任一端再发 user_message 一律被拒(busy 帧);所有端
//     据广播的 status/user_echo/message_complete 保持忙态一致。
//   - 迟到续流:订阅者在某轮进行中加入 → 先补「用户气泡 + 已产出的助手帧(content_delta 已合并,
//     有界)」,再接 live 流;补帧与注册在同一把锁内完成,保证每帧要么在补帧里要么在 live 广播里,
//     不重不漏。
//
// ⚠️ 单实例假设:hub 是 process-local。当前 backend 单容器部署,进程内 Hub 即正确。**若将来横向
// 扩容**,同一 session 的订阅者可能落到不同实例 → 各自开一条上游 → 又回到 jsonl 双写。届时需
// 「上游单实例 owner + Redis 中继扇出」或 sticky 路由(可复用已下线的 agentbridge:displace pub/sub 思路)。
package agentbridge

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"path"
	"sync"
	"sync/atomic"
	"time"

	gorillaws "github.com/gorilla/websocket"

	"scholar-backend/internal/common/safego"
)

// subOutBuffer 是每个订阅者出站队列的容量。流式 content_delta 很密,但 writeLoop 持续在抽,
// 256 足够吸收突发;真填满(慢到 backpressure)即丢弃该订阅者(踢连接),不阻塞广播。
const subOutBuffer = 256

// sessionHub 把一条上游 agent WS 扇出给 N 个浏览器订阅者(每 (feature, sessionID) 一个)。
type sessionHub struct {
	f         *FeatureBridge
	key       string
	userID    uint
	sessionID string

	agentConn    *gorillaws.Conn
	agentWriteMu sync.Mutex // 串行化对 agent 的写(多订阅者输入 + hub ping + permission 回写)

	hookCtx    context.Context    // PreUserMessage / OnMessageComplete 用;hub 关闭时 cancel
	cancelHook context.CancelFunc

	mu               sync.Mutex            // 保护 subs / replayBuf / inFlight / inFlightUserText / closed
	subs             map[*subscriber]struct{}
	replayBuf        [][]byte              // 当前进行中轮的 agent 帧(content_delta 已合并,有界),供迟到续流
	inFlightUserText string                // 当前进行中轮的用户原文(供迟到者合成 user_echo)
	inFlight         bool                  // 一轮回答进行中 → 回答中锁住
	closed           bool

	promptInjected atomic.Bool // 首条 user_message 注入 system prompt prefix,每 session 一次
	pendingMark    atomic.Bool // 注入了但等 agent 首个 message_complete 才落库 prompt_injected

	stopPing  chan struct{}
	closeOnce sync.Once
}

// subscriber 是一条下游浏览器 WS。out 由独立 writeLoop 抽干 → 解耦慢客户端。
type subscriber struct {
	hub     *sessionHub
	conn    *gorillaws.Conn
	out     chan []byte
	quit    chan struct{}
	closeMu sync.Once
}

// ── 合成帧 ──────────────────────────────────────────────────────────────────

// userEchoFrame:把「某个端发的用户消息」合成成一帧广播给其他端,让它们也渲染用户气泡。
// agent 不回吐用户消息,故由 backend 合成。前端 fold 把 user_echo 当作一个用户轮渲染 + 进入忙态。
func userEchoFrame(content string) []byte {
	b, _ := json.Marshal(map[string]string{"type": "user_echo", "content": content})
	return b
}

// busyFrame:回答中再发被拒时回给该订阅者(其它端的输入框本就因忙态置灰,这是竞态兜底)。
func busyFrame() []byte {
	b, _ := json.Marshal(map[string]any{
		"type": "error", "code": "busy", "message": "正在回答中,请稍候再发", "retryable": true,
	})
	return b
}

// ── Bridge 侧的 hub 注册表 ───────────────────────────────────────────────────

// getOrCreateHub 取或建某 (feature, sessionID) 的 hub。首个订阅者触发建 hub(dial agent + 起上游/ping)。
// 用 hubsMu 串行化「建」,避免两个首连各 dial 一条上游。
func (b *Bridge) getOrCreateHub(f *FeatureBridge, userID uint, sessionID string) (*sessionHub, error) {
	key := hubKey(f.spec.Key, sessionID)
	if v, ok := b.hubs.Load(key); ok {
		return v.(*sessionHub), nil
	}
	b.hubsMu.Lock()
	defer b.hubsMu.Unlock()
	if v, ok := b.hubs.Load(key); ok {
		return v.(*sessionHub), nil
	}
	hub, err := f.newHub(key, userID, sessionID)
	if err != nil {
		return nil, err
	}
	b.hubs.Store(key, hub)
	return hub, nil
}

func (b *Bridge) removeHub(key string, h *sessionHub) {
	b.hubs.CompareAndDelete(key, h)
}

// hubKey 按 (feature, agent session) 寻址 —— session_id 全局唯一,feature 前缀仅命名空间。
func hubKey(featureKey, sessionID string) string {
	return featureKey + ":" + sessionID
}

// newHub dial 上游 agent WS + 判定 prompt 注入状态 + 起上游读循环与 ping。失败(dial 不通)返回 error。
func (f *FeatureBridge) newHub(key string, userID uint, sessionID string) (*sessionHub, error) {
	agentWSURL, err := buildAgentWSURL(f.bridge.client.BaseURL(), sessionID)
	if err != nil {
		slog.Error("agentbridge hub: bad agent base url",
			"base_url", f.bridge.client.BaseURL(), "err", err)
		return nil, err
	}
	header := http.Header{}
	if tok := f.bridge.client.AuthToken(); tok != "" {
		header.Set("Authorization", "Bearer "+tok)
	}
	agentConn, _, derr := agentDialer.Dial(agentWSURL, header)
	if derr != nil {
		slog.Error("agentbridge hub: dial agent failed",
			"feature", f.spec.Key, "agent_url", agentWSURL,
			"user_id", userID, "session_id", sessionID, "err", derr)
		return nil, derr
	}

	hookCtx, cancelHook := context.WithCancel(context.Background())
	h := &sessionHub{
		f:          f,
		key:        key,
		userID:     userID,
		sessionID:  sessionID,
		agentConn:  agentConn,
		hookCtx:    hookCtx,
		cancelHook: cancelHook,
		subs:       make(map[*subscriber]struct{}),
		stopPing:   make(chan struct{}),
	}

	// 判定 session 是否已注入过 system prompt prefix(逻辑同旧 HandleWS,移到 hub 级,每 session 一次)。
	if f.spec.InjectPromptOnFirstMsg {
		h.promptInjected.Store(h.resolveAlreadyInjected())
	} else {
		h.promptInjected.Store(true)
	}

	safego.Go("agentbridge-hub-upstream:"+f.spec.Key, h.upstreamLoop)
	safego.Go("agentbridge-hub-ping:"+f.spec.Key, h.pingLoop)
	slog.Info("agentbridge hub: created",
		"feature", f.spec.Key, "user_id", userID, "session_id", sessionID)
	return h, nil
}

// resolveAlreadyInjected 判定本 session 是否已注入过 prefix(快路径读标记 → 回落 transcript 探测)。
// 返回 true = 已注入(本次 WS 首条不再注入)。探测失败按「未注入」兜底(多注一次远小于完全不注)。
func (h *sessionHub) resolveAlreadyInjected() bool {
	f := h.f
	if row, derr := f.bridge.repo.FindByAgentSessionID(h.sessionID); derr == nil && row.PromptInjected {
		return true
	}
	probeCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	hasUser, perr := f.SessionAlreadyHasUserMessage(probeCtx, h.sessionID)
	if perr != nil {
		slog.Warn("agentbridge hub: prompt-injected probe failed, assuming not injected",
			"feature", f.spec.Key, "session_id", h.sessionID, "err", perr)
		return false
	}
	if hasUser {
		f.markPromptInjected(h.sessionID) // 回填标记,下次走快路径
	}
	return hasUser
}

// ── 订阅者生命周期 ───────────────────────────────────────────────────────────

// addSubscriber 注册一条下游 WS。若有进行中的轮,先在锁内补「用户气泡 + 已产出助手帧」再注册,
// 保证后续 live 帧要么在补帧快照里、要么在 live 广播里,不重不漏。返回 nil = hub 正在关闭(调用方重试)。
func (h *sessionHub) addSubscriber(conn *gorillaws.Conn) *subscriber {
	sub := &subscriber{
		hub:  h,
		conn: conn,
		out:  make(chan []byte, subOutBuffer),
		quit: make(chan struct{}),
	}
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return nil
	}
	if h.inFlight {
		// 迟到续流:用户气泡 + 已产出助手帧(content_delta 在 replayBuf 里已合并,有界)。
		if h.inFlightUserText != "" {
			trySend(sub.out, userEchoFrame(h.inFlightUserText))
		}
		for _, fr := range h.replayBuf {
			trySend(sub.out, fr)
		}
	}
	h.subs[sub] = struct{}{}
	h.mu.Unlock()
	safego.Go("agentbridge-hub-sub-write:"+h.f.spec.Key, sub.writeLoop)
	return sub
}

// removeSubscriber 摘除一条订阅者;摘到 0 个 → 关 hub(连带关上游 agent WS)。
func (h *sessionHub) removeSubscriber(sub *subscriber) {
	sub.close()
	h.mu.Lock()
	delete(h.subs, sub)
	empty := len(h.subs) == 0
	h.mu.Unlock()
	if empty {
		h.shutdown()
	}
}

// shutdown 关闭 hub:cancel 钩子 ctx、停 ping、关上游、踢所有订阅者、出注册表、清水位。幂等。
func (h *sessionHub) shutdown() {
	h.closeOnce.Do(func() {
		h.mu.Lock()
		h.closed = true
		subs := make([]*subscriber, 0, len(h.subs))
		for s := range h.subs {
			subs = append(subs, s)
		}
		h.mu.Unlock()

		h.cancelHook()
		close(h.stopPing)
		_ = h.agentConn.Close()
		for _, s := range subs {
			s.close()
		}
		h.f.bridge.removeHub(h.key, h)
		h.f.bridge.deleteTokenWatermark(h.sessionID)
		slog.Info("agentbridge hub: closed",
			"feature", h.f.spec.Key, "session_id", h.sessionID)
	})
}

// ── 广播 ─────────────────────────────────────────────────────────────────────

// broadcastAgent 把一帧 agent 帧广播给所有订阅者;进行中轮时同时存入 replayBuf(供迟到续流)。
func (h *sessionHub) broadcastAgent(frame []byte) {
	h.mu.Lock()
	if h.inFlight {
		h.replayBuf = coalesceReplay(h.replayBuf, frame)
	}
	subs := make([]*subscriber, 0, len(h.subs))
	for s := range h.subs {
		subs = append(subs, s)
	}
	h.mu.Unlock()
	for _, s := range subs {
		h.enqueue(s, frame)
	}
}

// echoToOthers 把一帧(通常是 user_echo)发给除 except 外的所有订阅者(不进 replayBuf,
// 迟到者另由 inFlightUserText 合成,避免重复)。
func (h *sessionHub) echoToOthers(frame []byte, except *subscriber) {
	h.mu.Lock()
	subs := make([]*subscriber, 0, len(h.subs))
	for s := range h.subs {
		if s != except {
			subs = append(subs, s)
		}
	}
	h.mu.Unlock()
	for _, s := range subs {
		h.enqueue(s, frame)
	}
}

// enqueue 投递一帧到某订阅者出站队列;队列满(慢客户端)→ 丢弃该订阅者,不阻塞广播。
func (h *sessionHub) enqueue(sub *subscriber, frame []byte) {
	select {
	case sub.out <- frame:
	default:
		slog.Debug("agentbridge hub: subscriber out full, dropping",
			"feature", h.f.spec.Key, "session_id", h.sessionID)
		sub.close()
	}
}

func (h *sessionHub) writeAgent(mt int, data []byte) error {
	h.agentWriteMu.Lock()
	defer h.agentWriteMu.Unlock()
	return h.agentConn.WriteMessage(mt, data)
}

// ── 轮次/忙态 ────────────────────────────────────────────────────────────────

// beginTurn 尝试开一轮:已在进行中 → 返回 false(回答中锁住)。否则置 inFlight + 清 replayBuf + 记用户原文。
func (h *sessionHub) beginTurn(content string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.inFlight {
		return false
	}
	h.inFlight = true
	h.replayBuf = nil
	h.inFlightUserText = content
	return true
}

// endTurn 结束当前轮(message_complete / 轮内 error / 上游断开)。清进行中状态。
func (h *sessionHub) endTurn() {
	h.mu.Lock()
	h.inFlight = false
	h.replayBuf = nil
	h.inFlightUserText = ""
	h.mu.Unlock()
}

// ── 上游读循环(agent → 订阅者),保留 pipe 原有全部钩子 ─────────────────────────
func (h *sessionHub) upstreamLoop() {
	defer h.shutdown()
	f := h.f
	for {
		_ = h.agentConn.SetReadDeadline(time.Now().Add(agentReadDeadline))
		mt, data, err := h.agentConn.ReadMessage()
		if err != nil {
			if !gorillaws.IsCloseError(err, gorillaws.CloseNormalClosure, gorillaws.CloseGoingAway) {
				slog.Debug("agentbridge hub: agent read end", "feature", f.spec.Key, "err", err)
			}
			h.endTurn()
			return
		}
		if mt == gorillaws.TextMessage {
			switch frameType(data) {
			case "permission_request":
				// 审批轴:auto = backend 自动裁决(回写 agent),仍按现状向前端透传(fold 忽略)。
				if f.spec.EffectivePermissionMode() == PermissionAuto {
					workDir := path.Join(agentSessionWorkdirRoot(), h.sessionID)
					if reply, ok := decidePermission(data, workDir, specDeny(f.spec)); ok {
						if werr := h.writeAgent(gorillaws.TextMessage, reply); werr != nil {
							slog.Debug("agentbridge hub: permission decision write failed",
								"feature", f.spec.Key, "err", werr)
							h.endTurn()
							return
						}
					}
				}
			case "message_complete":
				if usage, calls, sessionTotal, isComplete := extractMessageComplete(data); isComplete {
					if h.pendingMark.CompareAndSwap(true, false) {
						f.markPromptInjected(h.sessionID)
					}
					if f.spec.OnMessageComplete != nil {
						hook, featureKey := f.spec.OnMessageComplete, f.spec.Key
						uid := h.userID
						safego.Go("agentbridge-on-message-complete:"+featureKey, func() {
							hook(h.hookCtx, uid, usage)
						})
					}
					if rows := f.bridge.accrueTurnUsage(h.sessionID, usage, calls, sessionTotal); len(rows) > 0 {
						uid, feat, sid, rec := h.userID, f.spec.Key, h.sessionID, f.bridge.llmRec
						safego.Go("agentbridge-usage-record:"+feat, func() {
							for i := range rows {
								recordAgentTokens(rec, &uid, feat, sid, rows[i])
							}
						})
					}
					if f.bridge.memSvc != nil && h.userID != 0 {
						uid, sid := h.userID, h.sessionID
						safego.Go("usermemory-extract-dispatch:"+f.spec.Key, func() {
							ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
							defer cancel()
							if frame := f.bridge.buildMemoryExtractFrame(ctx, uid, sid); frame != nil {
								if werr := h.writeAgent(gorillaws.TextMessage, frame); werr != nil {
									slog.Debug("agentbridge hub: extract_memory frame write failed",
										"feature", f.spec.Key, "session_id", sid, "err", werr)
								}
							}
						})
					}
				}
				// 轮结束:先解锁忙态,再广播完成帧(让所有端解除置灰)。
				h.endTurn()
			case "token_usage":
				if u, kind, ok := extractTokenUsageFrame(data); ok {
					uid, feat, knd, sid, rec := h.userID, f.spec.Key, kind, h.sessionID, f.bridge.llmRec
					safego.Go("agentbridge-token-usage-record:"+feat, func() {
						recordOutOfBandTokens(rec, &uid, feat, knd, sid, u)
					})
				}
				continue // 纯后端记账信号,不广播
			case "memory_update":
				if h.userID != 0 {
					if raw, ok := extractMemoryUpdateFrame(data); ok {
						uid := h.userID
						safego.Go("agentbridge-memory-ingest:"+f.spec.Key, func() {
							f.bridge.IngestMemory(uid, raw)
						})
					}
				}
				continue // 纯后端信号,不广播
			case "session_title_updated":
				if f.spec.OnTitleResult != nil {
					if title, aiGen, ok := extractTitleUpdateFrame(data); ok && aiGen && title != "" {
						hook := f.spec.OnTitleResult
						uid, sid := h.userID, h.sessionID
						safego.Go("agentbridge-title-result:"+f.spec.Key, func() {
							hook(h.hookCtx, uid, sid, title)
						})
					}
				}
			}
		}
		h.broadcastAgent(data)
	}
}

// pingLoop 每 PingInterval 给上游 agent 发应用层 ping 保活(agent 回 pong → 经 broadcastAgent
// 转给所有订阅者,顺带刷新前端无帧看门狗)。
func (h *sessionHub) pingLoop() {
	ticker := time.NewTicker(h.f.spec.PingIntervalOrDefault())
	defer ticker.Stop()
	for {
		select {
		case <-h.stopPing:
			return
		case <-ticker.C:
			if err := h.writeAgent(gorillaws.TextMessage, agentPingPayload); err != nil {
				slog.Debug("agentbridge hub: keepalive ping failed", "feature", h.f.spec.Key, "err", err)
				return
			}
		}
	}
}

// ── 订阅者读/写循环 ──────────────────────────────────────────────────────────

func (s *subscriber) writeLoop() {
	defer s.close()
	for {
		select {
		case <-s.quit:
			return
		case frame, ok := <-s.out:
			if !ok {
				return
			}
			_ = s.conn.SetWriteDeadline(time.Now().Add(frontWriteDeadline))
			if err := s.conn.WriteMessage(gorillaws.TextMessage, frame); err != nil {
				slog.Debug("agentbridge hub: front write end",
					"feature", s.hub.f.spec.Key, "err", err)
				return
			}
		}
	}
}

// readLoop 读这条浏览器 WS 的客户端消息并路由到唯一上游;阻塞直到该 WS 断开。
func (s *subscriber) readLoop() {
	h := s.hub
	defer h.removeSubscriber(s)
	for {
		_ = s.conn.SetReadDeadline(time.Now().Add(frontReadDeadline))
		mt, data, err := s.conn.ReadMessage()
		if err != nil {
			if !gorillaws.IsCloseError(err, gorillaws.CloseNormalClosure, gorillaws.CloseGoingAway) {
				slog.Debug("agentbridge hub: front read end", "feature", h.f.spec.Key, "err", err)
			}
			return
		}
		if mt != gorillaws.TextMessage {
			continue
		}
		switch frameType(data) {
		case "ping":
			// 吸收:仅作 front→backend 保活(已刷新 read deadline),不转发给 agent(hub 自己 ping)。
			continue
		case "user_message":
			h.handleUserMessage(s, data)
		default:
			// stop_generation / set_runtime_config / permission_response 等控制帧 → 转发到唯一上游。
			if err := h.writeAgent(mt, data); err != nil {
				slog.Debug("agentbridge hub: agent write end", "feature", h.f.spec.Key, "err", err)
				return
			}
		}
	}
}

// sendSelf 仅给该订阅者回一帧(busy / 配额 / prompt 错误)。
func (s *subscriber) sendSelf(frame []byte) {
	select {
	case s.out <- frame:
	default:
		s.close()
	}
}

// handleUserMessage 处理一条 user_message:Touch → 配额 → 回答中锁 → 首条注入 prefix → 转发上游 → 回声其他端。
func (h *sessionHub) handleUserMessage(s *subscriber, data []byte) {
	f := h.f
	content, _ := extractUserMessageContent(data)

	// 发了话才算会话活跃 → Touch last_accessed_at(侧边栏置顶)。
	if err := f.bridge.repo.Touch(h.sessionID); err != nil {
		slog.Debug("agentbridge hub: touch failed",
			"feature", f.spec.Key, "session_id", h.sessionID, "err", err)
	}

	// 配额检查(每日额度)。失败 → 回 error 帧,不消费一轮,WS 保持打开。
	if f.spec.PreUserMessage != nil {
		if err := callPreUserMessage(f.spec.PreUserMessage, h.hookCtx, h.userID, content); err != nil {
			slog.Info("agentbridge hub: user_message rejected by PreUserMessage",
				"feature", f.spec.Key, "user_id", h.userID, "err", err)
			frame, _ := json.Marshal(map[string]any{
				"type":      "error",
				"code":      classifyPreUserMessageError(err),
				"message":   err.Error(),
				"retryable": !errors.Is(err, ErrQuotaExceeded),
			})
			s.sendSelf(frame)
			return
		}
	}

	// 回答中锁住:一轮进行中 → 拒绝再发(竞态兜底,前端忙态本已置灰)。
	if !h.beginTurn(content) {
		s.sendSelf(busyFrame())
		return
	}

	// 首条 user_message 注入 system prompt prefix(每 session 一次)。
	didInject := false
	if f.spec.InjectPromptOnFirstMsg {
		if !h.promptInjected.Load() && f.spec.Picker != nil {
			choice, perr := f.spec.Picker.Pick(h.hookCtx, PickInput{UserID: h.userID})
			if perr != nil {
				slog.Error("agentbridge hub: picker.Pick failed, dropping user_message",
					"feature", f.spec.Key, "err", perr)
				frame, _ := json.Marshal(map[string]any{
					"type": "error", "code": "prompt_unavailable",
					"message": "系统提示词暂不可用, 请稍后再试 (admin 请检查 feature_prompts 表)", "retryable": true,
				})
				s.sendSelf(frame)
				h.endTurn()
				return
			}
			memCtx := f.bridge.MemoryBlocks(h.userID)
			if rewritten, ok := injectSystemPromptIntoFirstUserMessage(
				&h.promptInjected, data, choice.SystemPrompt, memCtx); ok {
				data = rewritten
				didInject = true
				slog.Info("agentbridge hub: injected system prompt prefix into first user_message",
					"feature", f.spec.Key, "prompt_id", choice.PromptID, "slug", choice.Slug, "version", choice.Version)
			}
		} else if !h.promptInjected.Load() && f.spec.Picker == nil {
			slog.Error("agentbridge hub: InjectPromptOnFirstMsg=true but Picker is nil", "feature", f.spec.Key)
			frame, _ := json.Marshal(map[string]any{
				"type": "error", "code": "spec_misconfigured",
				"message": "feature spec 配置缺失 picker, 请联系管理员", "retryable": false,
			})
			s.sendSelf(frame)
			h.endTurn()
			return
		}
	}

	if err := h.writeAgent(gorillaws.TextMessage, data); err != nil {
		slog.Debug("agentbridge hub: agent write end (user_message)", "feature", f.spec.Key, "err", err)
		h.endTurn()
		return
	}
	if didInject {
		h.pendingMark.Store(true)
	}
	// 回声:让其他端也渲染这句用户消息(agent 不回吐用户消息)。用原文 content(非注入了 prefix 的)。
	h.echoToOthers(userEchoFrame(content), s)
}

func (s *subscriber) close() {
	s.closeMu.Do(func() {
		close(s.quit)
		_ = s.conn.Close()
	})
}

// ── 工具 ─────────────────────────────────────────────────────────────────────

// trySend 非阻塞投递(队列满即丢)。仅用于 addSubscriber 锁内补帧,避免持锁阻塞。
func trySend(ch chan []byte, frame []byte) {
	select {
	case ch <- frame:
	default:
	}
}

// coalesceReplay 把相邻的文本 content_delta 合并进 replayBuf,使其大小退回 O(内容块) 而非 O(token),
// 让迟到续流补帧有界。仅合并都带 text 且不带 toolInput 的 content_delta(工具入参流不并)。
func coalesceReplay(buf [][]byte, frame []byte) [][]byte {
	txt, ok := contentDeltaText(frame)
	if !ok {
		return append(buf, frame)
	}
	if n := len(buf); n > 0 {
		if last, lok := contentDeltaText(buf[n-1]); lok {
			if merged, err := json.Marshal(map[string]string{"type": "content_delta", "text": last + txt}); err == nil {
				buf[n-1] = merged
				return buf
			}
		}
	}
	return append(buf, frame)
}

// contentDeltaText 返回 (text, true) 仅当该帧是带文本、不带 toolInput 的 content_delta。
func contentDeltaText(frame []byte) (string, bool) {
	if len(frame) == 0 || frame[0] != '{' {
		return "", false
	}
	var p struct {
		Type      string  `json:"type"`
		Text      *string `json:"text"`
		ToolInput *string `json:"toolInput"`
	}
	if err := json.Unmarshal(frame, &p); err != nil {
		return "", false
	}
	if p.Type != "content_delta" || p.Text == nil || p.ToolInput != nil {
		return "", false
	}
	return *p.Text, true
}
