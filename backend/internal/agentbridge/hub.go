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
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
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

	// Web-native 重构 P0 影子日志(h.mu 守护):当前进行中轮的持久 turn id(0=无)+ 是否已
	// 经 message_complete 正常完成。仅用于把 live 帧 tee 进事件日志 + 终态时 Complete/Fail/Abort。
	// jsonl + 内存 hub 仍权威;这两字段失效不影响 live。
	currentTurnID     uint64
	completedThisTurn bool

	promptInjected atomic.Bool // 首条 user_message 注入 system prompt prefix,每 session 一次
	pendingMark    atomic.Bool // 注入了但等 agent 首个 message_complete 才落库 prompt_injected

	stopPing  chan struct{}
	closeOnce sync.Once

	// graceTimer(h.mu 守护):最后一个订阅者离开时不立即 shutdown,而是 arm 这个 grace 计时器,
	// 让在途回答继续(上游 pump 不停、帧继续落 journal),用户切走再切回能续看;到点仍无订阅者才 shutdown。
	graceTimer *time.Timer
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
	// P4a:按 feature 选 executor 或 fork 客户端拨 WS(默认 fork;executorFeatures 命中走 executor)。
	cl := f.bridge.clientForFeature(f.spec.Key)
	agentWSURL, err := buildAgentWSURL(cl.BaseURL(), sessionID)
	if err != nil {
		slog.Error("agentbridge hub: bad agent base url",
			"base_url", cl.BaseURL(), "err", err)
		return nil, err
	}
	header := http.Header{}
	if tok := cl.AuthToken(); tok != "" {
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

	// H1:切到 executor 的 feature,连接后先从 journal 喂 history(executor 无状态、内存重连即丢)。
	// 在 upstreamLoop/user_message 之前发,WS 有序 → executor 先 seed 再收首条 user_message。
	if f.bridge.isExecutorFeature(f.spec.Key) {
		h.seedHistoryFromJournal()
	}
	// 模型路由 方案A:建连即给 executor 发一次「会话锁定 tier」(A1 feature 默认 / A3 用户显式选),
	// 整连接锁定。在 user_message 之前发,WS 有序 → executor 先设 tier 再收首条消息。
	h.sendInitialTier()

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

// validTier 校验模型档位(对应 agent_config 槽位 + executor resolveTier)。
func validTier(t string) bool {
	return t == "main" || t == "haiku" || t == "sonnet" || t == "opus"
}

// tierFromFrame 从 set_runtime_config 帧取 tier(仅返回合法档位,否则空)。
func tierFromFrame(data []byte) string {
	var f struct {
		Tier string `json:"tier"`
	}
	if json.Unmarshal(data, &f) != nil {
		return ""
	}
	t := strings.TrimSpace(f.Tier)
	if validTier(t) {
		return t
	}
	return ""
}

// sendInitialTier 建连后给 executor 发一次 set_runtime_config{tier}(模型路由 方案A:A1 默认 + A3 锁定)。
// effectiveTier = 会话 pinned_tier(用户显式选) || feature.DefaultTier。空(如 peerreview serverside,
// 自管 per-round modelId)→ 不发。整连接锁定:executor 据此设 ws.data.tier 用于本连接所有轮。
func (h *sessionHub) sendInitialTier() {
	tier := h.f.spec.DefaultTier
	if h.f.bridge.repo != nil {
		if row, err := h.f.bridge.repo.FindByAgentSessionID(h.sessionID); err == nil && row != nil && validTier(row.PinnedTier) {
			tier = row.PinnedTier // A3 用户显式选优先于 feature 默认
		}
	}
	if !validTier(tier) {
		return // 空 / 非法 → 不下发(executor 用它自己的默认 tier=main)
	}
	frame, err := json.Marshal(map[string]any{"type": "set_runtime_config", "tier": tier})
	if err != nil {
		return
	}
	if werr := h.writeAgent(gorillaws.TextMessage, frame); werr != nil {
		slog.Debug("agentbridge hub: initial set_runtime_config write failed", "session_id", h.sessionID, "err", werr)
	} else {
		slog.Debug("agentbridge hub: sent session tier", "feature", h.f.spec.Key, "session_id", h.sessionID, "tier", tier)
	}
}

// seedHistoryFromJournal 在(切到 executor 的)hub 建连后,把 journal 折叠的会话历史作为 seed_history
// 控制帧喂给 executor —— executor 无状态、不自持久化历史(H1)。fork 路径不调用(fork 有 jsonl)。
func (h *sessionHub) seedHistoryFromJournal() {
	if h.f.bridge.log == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	evs, _, _, err := h.f.bridge.log.ReadRecentTurns(ctx, h.sessionID, 30)
	if err != nil {
		return
	}
	msgs := h.f.bridge.log.FoldToMessages(evs)
	// 老会话(切流前)无事件日志 → 历史在归档表(P6:fork 退役前归档)。journal 空 → 先读归档,
	// 让 executor 续聊老会话仍有上下文;再兜底 client(过渡 fork / collapse 后 executor 返空无害)。
	if len(msgs) == 0 {
		if ar, ok := h.f.bridge.readArchive(h.sessionID); ok {
			msgs = ar.Messages
		} else if resp, derr := h.f.bridge.client.GetSessionMessages(ctx, h.sessionID, 30); derr == nil && resp != nil && len(resp.Messages) > 0 {
			msgs = resp.Messages
		}
	}
	// 一并喂已有标题(后端拥有),executor 据此跳过重复生成标题(避免重连后又生成、与 DB 不一致)。
	title := ""
	if row, derr := h.f.bridge.repo.FindByAgentSessionID(h.sessionID); derr == nil && row != nil {
		title = row.Title
	}
	// H3(2026-07):executor 无状态 —— 重启后 ephemeral meta 的 system prompt / 该用户记忆 /
	// skills(addDirs)/ denylist 全空,只 seed messages 会让存量会话丢规则/记忆/skills(能力面由
	// backend decidePermission 兜住未破,但行为静默漂移:如 prism 丢 document.md 编辑协议后可能直接
	// 写 .tex)。故一并把「建会话时的注入面」带进 seed_history,executor 仅在对应字段为空时回填(不覆盖
	// 活会话)。opts 由 buildCreateOptions 现算 → 每次重连都用最新 MemoryBlocks 渲染,重启后记忆更新
	// 对存量会话即时生效(顺带修记忆读环断裂)。仅 executor feature 走到这里,均 InjectPromptOnFirstMsg。
	opts, _ := h.f.buildCreateOptions(ctx, h.userID)
	hasOpts := opts != nil && (opts.AppendSystemPrompt != "" || len(opts.AddDirs) > 0 || len(opts.DisallowedTools) > 0)
	if len(msgs) == 0 && title == "" && !hasOpts {
		return // 全新会话:无历史/标题/注入面,executor 从空起(并会生成标题)
	}
	payload := map[string]any{"type": "seed_history", "messages": msgs}
	if title != "" {
		payload["title"] = title
	}
	if opts != nil {
		if opts.AppendSystemPrompt != "" {
			payload["appendSystemPrompt"] = opts.AppendSystemPrompt
		}
		if len(opts.AddDirs) > 0 {
			payload["addDirs"] = opts.AddDirs
		}
		if len(opts.DisallowedTools) > 0 {
			payload["disallowedTools"] = opts.DisallowedTools
		}
	}
	frame, ferr := json.Marshal(payload)
	if ferr != nil {
		return
	}
	if werr := h.writeAgent(gorillaws.TextMessage, frame); werr != nil {
		slog.Debug("agentbridge hub: seed_history write failed", "session_id", h.sessionID, "err", werr)
	} else {
		slog.Info("agentbridge hub: seeded executor history", "feature", h.f.spec.Key, "session_id", h.sessionID, "messages", len(msgs))
	}
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

	// P1 第一段(锁外):若在途 + 本 feature 启用日志读 → 从事件日志读在途轮(MySQL 往返**绝不**
	// 持 h.mu,否则阻塞同 hub 的 broadcastAgent/beginTurn)。读错 → useJournal=false 落回 replayBuf。
	var jTurn *Turn
	var jEvs []Event
	useJournal := false
	if h.inFlightSnapshot() && h.f.bridge.readFromJournal(h.f.spec.Key) && h.f.bridge.log != nil {
		if t, evs, jerr := h.f.bridge.log.ReadInFlightEvents(context.Background(), h.sessionID); jerr == nil && t != nil {
			jTurn, jEvs, useJournal = t, evs, true
		}
	}

	// 第二段(进锁):注册 sub + 据 useJournal 选回放源。锁内只内存操作,无 DB。
	h.mu.Lock()
	if h.closed {
		h.mu.Unlock()
		return nil
	}
	if h.inFlight {
		if useJournal && jTurn != nil {
			// 迟到续流(P1 持久源):从事件日志合成 user_echo + 回放已产出助手帧。data-loss 修复点:
			// 即便所有 sub 离开 / hub 中途 shutdown,partial 内容已 durable 在 agent_turn_events,
			// 重连 tab 仍能回放 —— replayBuf(RAM,shutdown 即弃)永远做不到。
			if jTurn.RoleUserText != "" {
				trySend(sub.out, userEchoFrame(jTurn.RoleUserText))
			}
			for _, ev := range jEvs {
				trySend(sub.out, ev.Payload)
			}
		} else {
			// 既有内存路径(flag off / 日志读错的 fallback):用户气泡 + replayBuf(已合并,有界)。
			if h.inFlightUserText != "" {
				trySend(sub.out, userEchoFrame(h.inFlightUserText))
			}
			for _, fr := range h.replayBuf {
				trySend(sub.out, fr)
			}
		}
	}
	h.subs[sub] = struct{}{}
	// tab 切回:取消 grace 关闭计时器,hub 继续存活。
	if h.graceTimer != nil {
		h.graceTimer.Stop()
		h.graceTimer = nil
	}
	h.mu.Unlock()
	safego.Go("agentbridge-hub-sub-write:"+h.f.spec.Key, sub.writeLoop)
	return sub
}

// inFlightSnapshot 短临持 h.mu 读 inFlight(给 addSubscriber 锁外预判用,非长持)。
func (h *sessionHub) inFlightSnapshot() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.inFlight
}

// hubGracePeriod:最后一个订阅者离开后,hub 保活窗口。让「回答中切走再切回」不中断、不丢中间过程
// (上游 pump 持续、帧继续落 journal);窗口内无人回来才真正 shutdown。
const hubGracePeriod = 3 * time.Minute

// removeSubscriber 摘除一条订阅者;摘到 0 个 → **不立即关**,arm grace 计时器(到点仍空才关),
// 避免单 tab 切走时杀掉正在进行的回答(bug:回答中跳页面再回来被打断 + 中间过程消失)。
func (h *sessionHub) removeSubscriber(sub *subscriber) {
	sub.close()
	h.mu.Lock()
	delete(h.subs, sub)
	if len(h.subs) == 0 && !h.closed {
		if h.graceTimer != nil {
			h.graceTimer.Stop()
		}
		h.graceTimer = time.AfterFunc(hubGracePeriod, h.graceShutdown)
	}
	h.mu.Unlock()
}

// graceShutdown:grace 到点。仍无订阅者才 shutdown(其间有 tab 切回则 addSubscriber 已取消计时器)。
func (h *sessionHub) graceShutdown() {
	h.mu.Lock()
	stillEmpty := len(h.subs) == 0 && !h.closed
	h.mu.Unlock()
	if stillEmpty {
		h.shutdown()
	}
}

// shutdown 关闭 hub:cancel 钩子 ctx、停 ping、关上游、踢所有订阅者、出注册表、清水位。幂等。
func (h *sessionHub) shutdown() {
	h.closeOnce.Do(func() {
		h.mu.Lock()
		h.closed = true
		if h.graceTimer != nil {
			h.graceTimer.Stop()
			h.graceTimer = nil
		}
		subs := make([]*subscriber, 0, len(h.subs))
		for s := range h.subs {
			subs = append(subs, s)
		}
		// P0 影子:hub 关闭时仍有未完成在途轮(订阅者全断 / 进程收尾)→ 标 aborted。
		// 上游读错路径已先 endTurn(置 currentTurnID=0),故那条路径走到这里 abortTID==0,不重复。
		abortTID := h.currentTurnID
		abortDone := h.completedThisTurn
		h.currentTurnID = 0
		h.mu.Unlock()

		h.cancelHook()
		close(h.stopPing)
		_ = h.agentConn.Close()
		for _, s := range subs {
			s.close()
		}
		h.f.bridge.removeHub(h.key, h)
		h.f.bridge.deleteTokenWatermark(h.sessionID)
		if abortTID != 0 && !abortDone && h.f.bridge.turns != nil {
			turns := h.f.bridge.turns
			safego.Go("agentbridge-turn-abort:"+h.f.spec.Key, func() { _ = turns.AbortTurn(context.Background(), abortTID) })
		}
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
	tid := h.currentTurnID
	done := h.completedThisTurn
	h.currentTurnID = 0
	h.mu.Unlock()
	// P0 影子:非正常完成(轮内 error / 上游 drop / 注入失败 / writeAgent 失败)→ 标 failed。
	// message_complete 路径已在上游把 currentTurnID 置 0 + completedThisTurn=true,故此处 tid==0 跳过。
	// 用 context.Background()(hookCtx 可能在收尾路径被 cancel,而这是 best-effort 终态写)。
	if tid != 0 && !done && h.f.bridge.turns != nil {
		turns := h.f.bridge.turns
		safego.Go("agentbridge-turn-fail:"+h.f.spec.Key, func() { _ = turns.FailTurn(context.Background(), tid) })
	}
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
					// P0 影子:终结符入日志 + CompleteTurn(影子计费);live 计费仍走下方 accrueTurnUsage,完全不动。
					// 在此同步置 currentTurnID=0 + completedThisTurn=true:使下方 endTurn 不重复 finalize、
					// 且 broadcastAgent 后的通用 Append tee 不重复 append message_complete。
					if f.bridge.turns != nil {
						h.mu.Lock()
						tid := h.currentTurnID
						h.currentTurnID = 0
						h.completedThisTurn = true
						h.mu.Unlock()
						if tid != 0 {
							f.bridge.turns.Append(tid, h.sessionID, EvMessageComplete, data)
							ledger := buildLedgerRow(h.userID, h.sessionID, f.spec.Key, usage)
							model := usage.Model
							safego.Go("agentbridge-turn-complete:"+f.spec.Key, func() {
								if err := f.bridge.turns.CompleteTurn(context.Background(), tid, model, ledger); err != nil {
									slog.Warn("agentbridge hub: shadow CompleteTurn failed (billing unaffected)",
										"feature", f.spec.Key, "turn_id", tid, "err", err)
								}
							})
						}
					}
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
							if frame := f.bridge.buildMemoryExtractFrame(ctx, uid, sid, f.spec.Key); frame != nil {
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
			case "error":
				// C2:executor 的 error 终帧(round-cap / 上游失败 / abort 等)也必须清 inFlight,
				// 否则该会话永远卡 busy(ping/pong 保活使读 deadline 永不触发)。仍向下广播 error 给前端解锁。
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
				if title, aiGen, ok := extractTitleUpdateFrame(data); ok && aiGen && title != "" {
					// 标题后端拥有(migration 0050):first-wins 持久化到 agent_sessions.title,
					// 使 ListSessions / 续流读 DB 为准(executor 内存态不持久;切流后标题不丢)。
					if perr := f.bridge.repo.SetTitleIfEmpty(h.sessionID, title); perr != nil {
						slog.Warn("agentbridge hub: persist title failed", "session_id", h.sessionID, "err", perr)
					}
					if f.spec.OnTitleResult != nil {
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

		// P0 影子:把 live 帧 tee 进事件日志(在扇出之后;content_delta 仅入 batcher 内存,无 MySQL)。
		// message_complete 已在上面 case 里处理(置 currentTurnID=0),故此处自然跳过、不重复。
		if f.bridge.turns != nil {
			h.mu.Lock()
			tid := h.currentTurnID
			h.mu.Unlock()
			if tid != 0 {
				if ev, ok := classifyJournalEv(data); ok {
					f.bridge.turns.Append(tid, h.sessionID, ev, data)
				}
			}
		}
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
		case "set_runtime_config":
			// 模型路由 A3:浏览器显式选 快/深(tier)→ 持久化为会话 pinned_tier(stickiness:重连后
			// sendInitialTier 据此重发,锁定);再转发上游立即生效。无效 tier 不持久化。
			if tier := tierFromFrame(data); tier != "" {
				if perr := h.f.bridge.repo.SetPinnedTier(h.sessionID, tier); perr != nil {
					slog.Debug("agentbridge hub: persist pinned_tier failed", "session_id", h.sessionID, "err", perr)
				}
			}
			if err := h.writeAgent(mt, data); err != nil {
				slog.Debug("agentbridge hub: agent write end", "feature", h.f.spec.Key, "err", err)
				return
			}
		default:
			// stop_generation / permission_response 等控制帧 → 转发到唯一上游。
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

	// P0 影子日志:turn 账本 + user_message 事件落库(幂等于 clientTurnId)。同步一行 INSERT,
	// 失败只 warn、绝不影响 live(jsonl + 内存 hub 仍权威)。用原文 content(注入前)。
	if f.bridge.turns != nil {
		clientTurnID := extractClientTurnID(data)
		if clientTurnID == "" {
			clientTurnID = uuid.NewString() // 旧客户端不带 → mint,唯一键永不撞(= 今天无跨重连去重的行为)
		}
		res, terr := f.bridge.turns.BeginTurn(h.hookCtx, TurnInput{
			AgentSessionID: h.sessionID, FeatureKey: f.spec.Key, UserID: h.userID,
			ClientTurnID: clientTurnID, RoleUserText: content,
		})
		if terr != nil {
			slog.Warn("agentbridge hub: shadow BeginTurn failed (live unaffected)",
				"feature", f.spec.Key, "session_id", h.sessionID, "err", terr)
		} else if res.AlreadySeen {
			h.endTurn() // 浏览器重发同 clientTurnId → 释放刚开的内存轮、丢帧、不转 agent
			return
		} else {
			h.mu.Lock()
			h.currentTurnID = res.TurnID
			h.completedThisTurn = false
			h.mu.Unlock()
		}
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

// ── P0 影子日志辅助 ───────────────────────────────────────────────────────────

// buildLedgerRow 从一轮 message_complete 的 usage 组装 P0 shadow 计费行(turn_id 由 CompleteTurn 填)。
// 这只是审计影子;真权威计费仍是 accrueTurnUsage→recordAgentTokens(本轮完全不动)。
func buildLedgerRow(userID uint, sid, featureKey string, usage AgentUsage) *BillingLedgerRow {
	return &BillingLedgerRow{
		AgentSessionID: sid,
		UserID:         userID,
		FeatureKey:     featureKey,
		Kind:           "interactive",
		InputTokens:    int64(usage.InputTokens),
		OutputTokens:   int64(usage.OutputTokens),
		CacheRead:      int64(usage.CacheReadTokens),
		CacheCreation:  int64(usage.CacheCreationTokens),
	}
}

// classifyJournalEv 把一帧广播帧映射成要入事件日志的 EvType(白名单)。
// message_complete 在上游 case 单独处理(tee B),不在此;纯后端信号(token_usage/memory_update/
// session_title_updated/ping/pong)与合成帧(user_echo/busy)不入(返回 false)。
func classifyJournalEv(frame []byte) (EvType, bool) {
	switch frameType(frame) {
	case "content_start":
		// 块边界标记(修 HIGH-2):落库供 in-flight replay 还原块边界;fold 不据此产 message。
		return EvContentStart, true
	case "content_delta":
		return EvContentDelta, true
	case "thinking":
		// 思考过程入日志(修「历史会话思考过程丢失」)。batcher 用独立 buffer 合并(~百帧/轮 → 一行)。
		return EvThinking, true
	case "tool_use", "tool_use_complete":
		// 实测 agent 发的工具调用帧类型是 tool_use_complete(非裸 tool_use);两者都收以保完整。
		return EvToolUse, true
	case "tool_result":
		return EvToolResult, true
	case "permission_request":
		return EvPermissionRequest, true
	case "error":
		return EvError, true
	default:
		return "", false
	}
}
