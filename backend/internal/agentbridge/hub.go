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
	abortedTurn      bool                  // V3-4.4-2:本轮转发过 stop_generation → message_complete 广播时盖 aborted:true
	closed           bool

	// Web-native 重构 P0 影子日志(h.mu 守护):当前进行中轮的持久 turn id(0=无)+ 是否已
	// 经 message_complete 正常完成。仅用于把 live 帧 tee 进事件日志 + 终态时 Complete/Fail/Abort。
	// jsonl + 内存 hub 仍权威;这两字段失效不影响 live。
	currentTurnID     uint64
	completedThisTurn bool

	// currentModel / currentModelDefault(h.mu):会话当前生效模型(P2 hub 权威内存态)。
	// sendInitialModel / handleRuntimeConfigFrame 写;迟到补帧、消息前重校验、预算盖章(P3)读。
	currentModel        string
	currentModelDefault bool

	promptInjected atomic.Bool // 首条 user_message 注入 system prompt prefix,每 session 一次
	pendingMark    atomic.Bool // 注入了但等 agent 首个 message_complete 才落库 prompt_injected
	// V3-4.6-2 seed fail-closed:seed_history 写失败(重试后)置位 → 首条 user_message 先重 seed,
	// 仍失败则拒绝放行(executor 重启后无协议/记忆/skills 裸跑是本层最重的雷,绝不静默)。
	seedFailed atomic.Bool

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

// stampAbortedFrame:把 aborted:true 盖进 message_complete 帧(V3-4.4-2)。解析失败返回 nil(原帧照发,
// 前端退化为旧行为 —— 宁可少个标记也不丢完成帧)。
func stampAbortedFrame(data []byte) []byte {
	var m map[string]any
	if err := json.Unmarshal(data, &m); err != nil {
		return nil
	}
	m["aborted"] = true
	out, err := json.Marshal(m)
	if err != nil {
		return nil
	}
	return out
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

// SessionBusy(V3-4.4-1)报告该 agent 会话是否有进行中的一轮(hub inFlight)。
// prism 用它把「流式中 prepare/reject 抽换 agent 脚下的 cwd」拒为 409。无 hub(无人连接)= 不忙。
// 单实例假设(hub 铁律)下内存判定即权威。
func (f *FeatureBridge) SessionBusy(sessionID string) bool {
	if sessionID == "" {
		return false
	}
	if v, ok := f.bridge.hubs.Load(hubKey(f.spec.Key, sessionID)); ok {
		if h, ok2 := v.(*sessionHub); ok2 {
			return h.inFlightSnapshot()
		}
	}
	return false
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
	// P2 模型目录:建连即下发一次会话模型(pinned_model 校验 || chat_default 绑定),
	// 在 user_message 之前发,WS 有序 → executor 先设 modelOverride 再收首条消息。
	h.sendInitialModel()

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

// ─── 会话模型(P2 模型目录化:用户选模型 + 权威校验)────────────────────────────
//
// 真源 = agent_sessions.pinned_model(用户显式选)|| chat_default.<feature> 绑定(admin 可改)。
// hub 是唯一咽喉:建连下发一次、浏览器换模型帧经校验后重组转发(绝不裸转)、每条消息前重校验。
// executor 侧 modelOverride 是 per-connection 内存态,恒由 hub 下发的具体 modelId 驱动。

// chatDefaultPurpose 该 feature 的默认对话模型绑定 key(与 modelcatalog.PurposeChatDefault* 对齐)。
func (h *sessionHub) chatDefaultPurpose() string { return "chat_default." + h.f.spec.Key }

// setCurrentModel / currentModelSnapshot —— hub 内存态(h.mu),供预算盖章(P3)/迟到补帧/重校验读。
func (h *sessionHub) setCurrentModel(modelID string, isDefault bool) {
	h.mu.Lock()
	h.currentModel, h.currentModelDefault = modelID, isDefault
	h.mu.Unlock()
}

func (h *sessionHub) currentModelSnapshot() (string, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.currentModel, h.currentModelDefault
}

// runtimeConfigFrame 组下发 executor 的模型帧(附 contextWindow 供 H5 滑窗裁剪按模型定界;
// F0 起附 canonical providerId:"" 显式下发 = 回默认 provider,executor 据此清 providerOverride)。
func runtimeConfigFrame(cat ModelCatalog, modelID string, contextWindow int) []byte {
	payload := map[string]any{"type": "set_runtime_config", "modelId": modelID}
	if contextWindow > 0 {
		payload["contextWindow"] = contextWindow
	}
	if cat != nil {
		payload["providerId"] = cat.ProviderKey(modelID) // ""=默认(清 override)
		if mo := cat.MaxOutput(modelID); mo > 0 {
			payload["maxOutput"] = mo // 模型完成 token 上限(0 不下发,executor 用全局默认)
		}
		payload["vision"] = cat.Vision(modelID) // P2 图片通道:executor 按此过滤历史 image 块
	}
	frame, _ := json.Marshal(payload)
	return frame
}

// runtimeConfigUpdatedFrame 组广播给所有订阅者的「会话模型已变更」帧(多端选择器实时同步)。
func runtimeConfigUpdatedFrame(modelID string, isDefault bool) []byte {
	frame, _ := json.Marshal(map[string]any{
		"type": "runtime_config_updated", "modelId": modelID, "isDefault": isDefault,
	})
	return frame
}

// sendInitialModel 建连后给 executor 下发一次会话模型(取代旧 sendInitialTier 的 tier 通道)。
// effective = pinned_model(过 ValidateUserModel:会员到期/下架 → 清 pinned 回默认)|| chat_default 绑定。
// catalog 未接线(单测)→ 不下发,executor 用自身默认。写失败重试 3 次(P3 后盖章 weight 依赖
// hub 内存态与 executor 实跑一致,不能像旧 tier 那样丢帧只 Debug)。
func (h *sessionHub) sendInitialModel() {
	cat := h.f.bridge.catalog
	if cat == nil {
		return
	}
	effective, isDefault := "", true
	if h.f.bridge.repo != nil {
		if row, err := h.f.bridge.repo.FindByAgentSessionID(h.sessionID); err == nil && row != nil && row.PinnedModel != "" {
			if verr := cat.ValidateUserModel(h.userID, row.PinnedModel); verr == nil {
				effective, isDefault = row.PinnedModel, false
			} else {
				// 锁定模型已不可用(下架/会员到期)→ 清 pinned 落库,回默认(懒回收)。
				slog.Info("agentbridge hub: pinned_model 已失效,回收为默认",
					"feature", h.f.spec.Key, "session_id", h.sessionID, "model", row.PinnedModel, "reason", verr)
				_ = h.f.bridge.repo.SetPinnedModel(h.sessionID, "")
			}
		}
	}
	if effective == "" {
		effective = cat.Resolve(h.chatDefaultPurpose())
	}
	if effective == "" {
		return // 目录未配置(fresh install)→ executor 自身默认
	}
	h.setCurrentModel(effective, isDefault)
	frame := runtimeConfigFrame(cat, effective, cat.ContextWindow(effective))
	for attempt := 1; ; attempt++ {
		if werr := h.writeAgent(gorillaws.TextMessage, frame); werr == nil {
			slog.Debug("agentbridge hub: sent session model",
				"feature", h.f.spec.Key, "session_id", h.sessionID, "model", effective, "default", isDefault)
			return
		} else if attempt >= 3 {
			slog.Warn("agentbridge hub: initial model frame failed after retries",
				"feature", h.f.spec.Key, "session_id", h.sessionID, "model", effective, "err", werr)
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
}

// handleRuntimeConfigFrame 浏览器 set_runtime_config 帧的权威闸(P2 堵注入洞的核心):
//   - 绝不转发浏览器原始字节(混合帧 {tier, modelId:任意串} 曾可绕过校验直达上游)——
//     校验通过后由 backend 重新组帧,只含白名单字段与目录 canonical model id;
//   - modelId → ValidateUserModel;合法先落 pinned_model(落库失败拒帧,保证 DB 与 executor 一致);
//   - 非法 → **兼容期静默降级为默认模型**(老 web bundle / 小程序会在每次重连自动重发
//     localStorage 里的旧 modelId,回 error 帧会让存量用户凭空弹错;新前端 UI 已按 locked
//     预过滤,error 帧并不承载 UX)。兼容期(≥1 个小程序强更周期)后可转严格拒绝;
//   - useDefault / 全空 → unpin(清 pinned_model,回 chat_default 绑定)——没有此语义则
//     pinned 一旦写入永不解除,admin 换默认绑定对老会话永不生效;
//   - 老 tier 帧兼容:haiku→system.fast,其余→chat_default;只转发不落 pinned(落库会把
//     user_selectable=false 的系统模型 pin 进会话,成为绕过目录过滤的旁路);
//   - 成功后广播 runtime_config_updated 给所有订阅者(多端选择器实时同步)。
func (h *sessionHub) handleRuntimeConfigFrame(data []byte) {
	cat := h.f.bridge.catalog
	if cat == nil {
		slog.Warn("agentbridge hub: set_runtime_config dropped (model catalog not wired)",
			"feature", h.f.spec.Key, "session_id", h.sessionID)
		return
	}
	var f struct {
		ModelID    string `json:"modelId"`
		UseDefault bool   `json:"useDefault"`
		Tier       string `json:"tier"`
	}
	_ = json.Unmarshal(data, &f)
	modelID := strings.TrimSpace(f.ModelID)
	tier := strings.TrimSpace(f.Tier)

	effective, isDefault := "", false
	switch {
	case f.UseDefault || (modelID == "" && tier == ""):
		// unpin:清锁定,回 feature 默认绑定。
		if h.f.bridge.repo != nil {
			if perr := h.f.bridge.repo.SetPinnedModel(h.sessionID, ""); perr != nil {
				slog.Warn("agentbridge hub: unpin model persist failed", "session_id", h.sessionID, "err", perr)
				return
			}
		}
		effective, isDefault = cat.Resolve(h.chatDefaultPurpose()), true
	case modelID == "":
		// 老 tier 帧兼容(当前无前端发 tier,防御性保留一个发版周期):映射后只转发不落 pinned。
		if tier == "haiku" {
			effective = cat.Resolve("system.fast")
		} else {
			effective = cat.Resolve(h.chatDefaultPurpose())
		}
		isDefault = true
	default:
		if verr := cat.ValidateUserModel(h.userID, modelID); verr != nil {
			slog.Warn("agentbridge hub: 非法 modelId,兼容期静默降级为默认",
				"feature", h.f.spec.Key, "session_id", h.sessionID, "user_id", h.userID,
				"model", modelID, "reason", verr)
			effective, isDefault = cat.Resolve(h.chatDefaultPurpose()), true
		} else {
			// 先落库后转发:落库失败拒帧(否则 3min grace 后 hub 重建按旧值重发,用户被静默切回)。
			if h.f.bridge.repo != nil {
				if perr := h.f.bridge.repo.SetPinnedModel(h.sessionID, modelID); perr != nil {
					slog.Warn("agentbridge hub: persist pinned_model failed, frame rejected",
						"session_id", h.sessionID, "err", perr)
					return
				}
			}
			effective, isDefault = modelID, false
		}
	}
	if effective == "" {
		return // 目录未配置 → 不下发
	}
	h.setCurrentModel(effective, isDefault)
	if werr := h.writeAgent(gorillaws.TextMessage, runtimeConfigFrame(cat, effective, cat.ContextWindow(effective))); werr != nil {
		slog.Debug("agentbridge hub: runtime config write failed", "session_id", h.sessionID, "err", werr)
		return
	}
	h.broadcastAgent(runtimeConfigUpdatedFrame(effective, isDefault))
}

// revalidateModelBeforeMessage 每条 user_message 前重校验会话锁定模型(30s 目录缓存 + 一次
// EffectiveTier 主键查,量级与配额闸相同)。覆盖「常开 tab 永不重连」的活连接:会员到期 /
// 模型下架时主动切回默认并广播,而不是等 hub 重建才懒回收。
func (h *sessionHub) revalidateModelBeforeMessage() {
	cat := h.f.bridge.catalog
	if cat == nil {
		return
	}
	cur, isDefault := h.currentModelSnapshot()
	if cur == "" || isDefault {
		return // 默认模型无档位门槛语义(绑定由 admin 管),只校验用户显式锁定的
	}
	if cat.ValidateUserModel(h.userID, cur) == nil {
		return
	}
	slog.Info("agentbridge hub: 会话模型失效,消息前切回默认",
		"feature", h.f.spec.Key, "session_id", h.sessionID, "model", cur)
	if h.f.bridge.repo != nil {
		_ = h.f.bridge.repo.SetPinnedModel(h.sessionID, "")
	}
	def := cat.Resolve(h.chatDefaultPurpose())
	if def == "" {
		return
	}
	h.setCurrentModel(def, true)
	if werr := h.writeAgent(gorillaws.TextMessage, runtimeConfigFrame(cat, def, cat.ContextWindow(def))); werr == nil {
		h.broadcastAgent(runtimeConfigUpdatedFrame(def, true))
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
	opts, delivered := h.f.buildCreateOptions(ctx, h.userID)
	// Phase 2:项目级写作画像(prism)拼进 AppendSystemPrompt —— 以 sessionID 为身份,置于 buildCreateOptions
	// (user 级系统提示 + MemoryBlocks)之后。放在 hasOpts 判定之前,使「仅画像」也能触发 seed 下发。
	opts = h.f.applySessionProfile(ctx, h.sessionID, opts)
	hasOpts := opts != nil && (opts.AppendSystemPrompt != "" || len(opts.AddDirs) > 0 || len(opts.DisallowedTools) > 0 || len(opts.Skills) > 0)
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
		// 用户市场 skill 内联内容:重连/重启后 executor 据此重物化(与 CreateSession 同路径)。
		if len(opts.Skills) > 0 {
			payload["skills"] = opts.Skills
		}
	}
	frame, ferr := json.Marshal(payload)
	if ferr != nil {
		return
	}
	// V3-4.6-2 seed fail-closed:此前写失败仅 slog.Debug → executor 重启后存量会话可能在
	// 「无协议/无记忆/无 skills」状态静默裸跑(行为漂移,如 prism 直接写 .tex)。改为:有限重试 +
	// 终败 slog.Error + 置 seedFailed,handleUserMessage 先重 seed、仍失败则拒绝放行首条消息。
	var werr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(100 * time.Millisecond)
		}
		if werr = h.writeAgent(gorillaws.TextMessage, frame); werr == nil {
			break
		}
	}
	if werr != nil {
		slog.Error("agentbridge hub: seed_history write failed after retries (fail-closed: first message will be gated)",
			"feature", h.f.spec.Key, "session_id", h.sessionID, "err", werr)
		h.seedFailed.Store(true)
	} else {
		h.seedFailed.Store(false)
		// V4 token 去重:seed 已把「系统提示+记忆」经 appendSystemPrompt 系统级下发(delivered=true)→
		// 标记已注入,抑制首条 user_message 的 in-band 前缀回落。否则(prism 建会话不走 CreateNewSession、
		// 从不 markPromptInjectedSync)协议+记忆会**双份下发**,且 in-band 那份永远留在 history、
		// 此后每轮每次调用都重复计费(~2K tok × N call)。同步落库:executor 重启后 hub 重连会再 seed,
		// DB 标记只负责抑制 in-band,不影响 seed 补发。
		if delivered && !h.promptInjected.Load() {
			h.promptInjected.Store(true)
			if perr := h.f.bridge.repo.MarkPromptInjected(h.sessionID); perr != nil {
				slog.Debug("agentbridge hub: mark prompt injected after seed failed", "session_id", h.sessionID, "err", perr)
			}
		}
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
	// P2 迟到补帧:把会话当前生效模型告知新订阅者(多 tab 下 B tab 选择器与 A tab 实时一致;
	// hub 重建后 sendInitialModel 的结果对晚到前端同样可见)。锁内读内存态,零 DB。
	if h.currentModel != "" {
		trySend(sub.out, runtimeConfigUpdatedFrame(h.currentModel, h.currentModelDefault))
	}
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
	h.abortedTurn = false // 新一轮:清上一轮的 stop 标记
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
					sessModel, _ := h.currentModelSnapshot() // P3:补差行按会话当前模型计价
					if rows := f.bridge.accrueTurnUsage(h.sessionID, sessModel, usage, calls, sessionTotal); len(rows) > 0 {
						uid, feat, sid, rec := h.userID, f.spec.Key, h.sessionID, f.bridge.llmRec
						safego.Go("agentbridge-usage-record:"+feat, func() {
							for i := range rows {
								recordAgentTokens(rec, f.bridge.catalog, &uid, feat, sid, rows[i])
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
				// V3-4.4-2:本轮被 stop 过 → 给完成帧盖 aborted:true,前端据此走确认门而非 autoApply
				// (中断的半截稿静默固化是信任级故障)。必须在 endTurn 前读标记(endTurn 不清它,beginTurn 清)。
				h.mu.Lock()
				wasAborted := h.abortedTurn
				h.mu.Unlock()
				if wasAborted {
					if stamped := stampAbortedFrame(data); stamped != nil {
						data = stamped
					}
				}
				// 轮结束:先解锁忙态,再广播完成帧(让所有端解除置灰)。
				h.endTurn()
			case "error":
				// 计费回归修复(2026-07-14):error 终帧可携带失败前已完成 LLM call 的 usage/calls
				// (executor turnLoop 失败路径随帧带回)。按 message_complete 同一链路入账(用量钩子 +
				// 水位补差 + 台账),否则「多轮工具循环最后一轮流被掐」整轮上游消耗漏记、配额不扣。
				// 刻意不做:记忆抽取(轮失败不抽取)、prompt_injected 标记(维持失败轮原语义)。
				if usage, calls, sessionTotal, hasUsage := extractErrorUsage(data); hasUsage {
					if f.spec.OnMessageComplete != nil {
						hook, featureKey := f.spec.OnMessageComplete, f.spec.Key
						uid := h.userID
						safego.Go("agentbridge-on-message-complete:"+featureKey, func() {
							hook(h.hookCtx, uid, usage)
						})
					}
					sessModel, _ := h.currentModelSnapshot()
					if rows := f.bridge.accrueTurnUsage(h.sessionID, sessModel, usage, calls, sessionTotal); len(rows) > 0 {
						uid, feat, sid, rec := h.userID, f.spec.Key, h.sessionID, f.bridge.llmRec
						safego.Go("agentbridge-usage-record:"+feat, func() {
							for i := range rows {
								recordAgentTokens(rec, f.bridge.catalog, &uid, feat, sid, rows[i])
							}
						})
					}
				}
				// C2:executor 的 error 终帧(round-cap / 上游失败 / abort 等)也必须清 inFlight,
				// 否则该会话永远卡 busy(ping/pong 保活使读 deadline 永不触发)。仍向下广播 error 给前端解锁。
				h.endTurn()
				// 评审 #4:执行器 error 帧可能带原始英文 / 内部机制名(如 "awaiting PushConfig")。
				// 用户面绝不回显内部标识 —— 按 code 换成友好中文再广播;原文留 slog 便于排查。
				slog.Debug("agentbridge hub: agent error frame", "feature", f.spec.Key, "raw", string(data))
				data = sanitizeAgentErrorFrame(data)
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
			// P2 权威闸:校验 + 重组转发(绝不裸转浏览器字节),详见 handleRuntimeConfigFrame。
			h.handleRuntimeConfigFrame(data)
		default:
			// stop_generation / permission_response 等控制帧 → 转发到唯一上游。
			// P0.4(skill 市场前置):安全闸 —— 拒绝浏览器发的 backend-only 帧(seed_history/extract_memory)
			// 与任何携带注入面字段(addDirs/disallowedTools/appendSystemPrompt/skills)的帧,否则用户可自带
			// 任意 addDirs 绕过审核让 executor 加载宿主任意目录(读文件 + 提示注入)。合法控制帧不带这些字段,不受影响。
			if !browserFrameForwardable(data) {
				slog.Warn("agentbridge hub: dropped disallowed browser frame (injection-surface / backend-only)",
					"feature", h.f.spec.Key, "session_id", h.sessionID, "frame_type", frameType(data))
				continue
			}
			// V3-4.4-2:executor 的 turnLoop 在 abort 后 finally 照发 message_complete(终帧守卫),
			// 帧层与成功轮不可区分 → hub 是唯一知道「这轮被 stop 过」的地方,记下来供完成帧盖章。
			if frameType(data) == "stop_generation" {
				h.mu.Lock()
				if h.inFlight {
					h.abortedTurn = true
				}
				h.mu.Unlock()
			}
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

// handleUserMessage 处理一条 user_message:Touch → seed 守卫 → 配额 → 回答中锁 → 首条注入 prefix → 转发上游 → 回声其他端。
func (h *sessionHub) handleUserMessage(s *subscriber, data []byte) {
	f := h.f
	content, _ := extractUserMessageContent(data)

	// 附件断链修复(2026-07-14):attachments[].path 折进 content 首部 @"path" 标记(journal/seed/
	// 转发同源携带);echoText 保留注入前原文 —— 其它端的 user_echo 气泡不显示容器绝对路径。
	echoText := content
	if newData, newContent, folded := foldUserAttachments(data); folded {
		data, content = newData, newContent
	}

	// P2:消息前重校验会话锁定模型(会员到期/模型下架对常开连接生效,不等 hub 重建)。
	h.revalidateModelBeforeMessage()

	// V3-4.6-2 seed fail-closed:seed 曾写失败 → 先重试一次;仍失败则拒绝本条(绝不让会话在
	// 无协议/无记忆/无 skills 状态下静默作答)。重 seed 成功会清 seedFailed,正常放行。
	if h.seedFailed.Load() {
		h.seedHistoryFromJournal()
		if h.seedFailed.Load() {
			frame, _ := json.Marshal(map[string]any{
				"type": "error", "code": "seed_failed",
				"message": "会话上下文尚未就绪,请稍后重试(如持续出现请刷新页面)", "retryable": true,
			})
			s.sendSelf(frame)
			return
		}
	}

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
				"message":   preUserMessageUserText(err),
				"retryable": !errors.Is(err, ErrQuotaExceeded),
			})
			s.sendSelf(frame)
			return
		}
	}

	// 回答中锁住:一轮进行中 → 拒绝再发(竞态兜底,前端忙态本已置灰)。
	// beginTurn 记 echoText(注入前原文):它只喂 user_echo/迟到补帧,别把 @"path" 泄进其它端气泡。
	if !h.beginTurn(echoText) {
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

	// SS#2:给 3 个 chat feature 的 user_message 盖上有界透支预算(执行器据此让 agent 自我配速 + 到界优雅
	// 收尾)。每轮现算(read-only,不预扣)→ 在途一轮至多超支一轮。unlimited(不限额/收费关)不盖 →
	// 执行器无预算。peerreview BudgetProvider=nil → 不盖 → 任务型不受影响。
	if f.spec.BudgetProvider != nil {
		if soft, hard, unlimited := f.spec.BudgetProvider(h.hookCtx, h.userID); !unlimited {
			// P3 反折算:额度余量是加权口径,执行器按 raw 4 类合计自配速 —— 除以会话模型的
			// billing_weight 换回 raw 口径,两侧才闭合(weight 已在目录侧 clamp 下限防除零)。
			// 每条消息现读 hub 内存态(随 set_runtime_config 同步更新),多端并发换模型至多错一轮,
			// 透支带兜底。
			if cat := f.bridge.catalog; cat != nil {
				if cur, _ := h.currentModelSnapshot(); cur != "" {
					if w := cat.BillingWeight(cur); w > 0 && w != 1 {
						soft = int64(float64(soft) / w)
						hard = int64(float64(hard) / w)
					}
				}
			}
			data = stampBudget(data, soft, hard)
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
	case "artifact":
		// 产物带外声明:入 journal → 重连/刷新回放时产物随轮重建(payload 即原帧,replay 原样重发)。
		return EvArtifact, true
	case "error":
		return EvError, true
	default:
		return "", false
	}
}
