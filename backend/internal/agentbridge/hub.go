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
	"os"
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

	// ─── 轮内成本硬闸(逐帧上报,2026-08)。三个字段全部由 h.mu 守护,beginTurn 重置 ───
	// turnSpentMicro 本轮已上报的真实成本(微元),由 turn_usage_delta 帧逐次累加。
	// turnCapMicro   本轮硬顶(微元);turnCapArmed=false 表示本轮不设闸(不限额/未接线/老执行器)。
	// turnStopSent   本轮已因越顶发过 stop_generation —— 幂等位,防止后续 delta 帧重复发停机帧。
	turnSpentMicro int64
	turnCapMicro   int64
	turnCapArmed   bool
	turnStopSent   bool

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

	// W3-2 轮级硬超时(h.mu 守护):beginTurn arm(spec.TurnTimeoutOrDefault),endTurn/shutdown 停。
	// timedOutTurn:本轮被超时收口且**尚无新轮开始**的窗口标志 —— 期间迟到的散帧(content_delta/
	// tool_result)不再广播到已关闭的轮(审计 [19]);beginTurn 清(新轮的帧不该被压)。
	turnTimer    *time.Timer
	timedOutTurn bool
	// currentClientTurnID:当前在途轮的 clientTurnId(beginTurn 记);timedOutClientTurnID:被超时那一轮
	// 的 clientTurnId(onTurnTimeout 记)。用 client id **精确匹配**迟到的孤儿终帧,故意**不**在 beginTurn
	// 清 —— 否则快速重试轮会清掉标志,把上一轮迟到的 message_complete 误算到新轮上、污染 per-turn 台账
	// 并复现幽灵轮(审计 [18])。匹配消费后清空;新轮 clientTurnId 不同,天然不误命中(agent 死亡也不遗毒)。
	currentClientTurnID  string
	timedOutClientTurnID string

	// ── 轮级 provider 故障转移(2026-07-31 线上审计 §五;h.mu 守护)──
	// inFlightAgentFrame:本轮转发给 executor 的 user_message 帧(**盖预算之前**的字节;
	//   重投时按新模型重新盖,见 stampTurnBudget)。beginTurn 清、写上游成功后记、endTurn 清。
	// turnRetries:本轮已做过几次「换 provider 重投」。beginTurn 清零,上限 maxTurnProviderRetries。
	//   与 agent 侧 turnLoop 的同 provider 瞬态重放(isTransientStreamError)是**串联**关系不叠加:
	//   agent 那层跑完自己的额度才会吐 error 终帧,我们只在收到终帧后动作,故总次数 = agent 内重放 × 1 轮
	//   + 本层 1 次重投,天花板固定;且轮级硬超时计时器**不重置**,整轮墙钟仍被 TurnTimeout 兜住。
	inFlightAgentFrame []byte
	turnRetries        int
}

// maxTurnProviderRetries 每轮最多做几次「换 provider 重投」。1 = 一次机会:
// 上游整体挂掉时不该拿用户的等待时间做轮询探测,一次换不活就如实报错。
const maxTurnProviderRetries = 1

// subscriber 是一条下游浏览器 WS。out 由独立 writeLoop 抽干 → 解耦慢客户端。
type subscriber struct {
	hub  *sessionHub
	conn *gorillaws.Conn
	out  chan []byte
	quit chan struct{}
	// quit 与 conn.Close 分两把 Once:shutdown 走 signalQuit(软关,writeLoop 排空 out 后自关连接,
	// 保证合成终帧送达);其余硬关路径走 close(quit + conn 一起关)。两者可任意先后到达,各自幂等。
	quitMu  sync.Once
	closeMu sync.Once
}

// ── 合成帧 ──────────────────────────────────────────────────────────────────

// userEchoFrame:把「某个端发的用户消息」合成成一帧广播给其他端,让它们也渲染用户气泡。
// agent 不回吐用户消息,故由 backend 合成。前端 fold 把 user_echo 当作一个用户轮渲染 + 进入忙态。
// ⚠️ 只用于 echoToOthers 的**多端实时**回声;迟到/重连的**回放段**改走 resync 协议(见下),
// 不再复用 user_echo —— 否则本人重连会把自己的在途轮复制成一条永无终帧的孤儿轮(busy 永久卡死,
// 线上「对话完成后无法继续/新对话按钮也灰」事故的高频根因之一)。
// clientTurnId 随帧下发(审查修复):发送者自己的重连 socket 是「新订阅者指针」,echoToOthers 按
// 指针排除会把回声误投给本人 —— 前端据 clientTurnId 识别自回声丢弃(否则复刻出永无终帧的孤儿轮)。
func userEchoFrame(content, clientTurnID string) []byte {
	b, _ := json.Marshal(map[string]string{"type": "user_echo", "content": content, "clientTurnId": clientTurnID})
	return b
}

// ── 断线续流(resync)协议帧 ─────────────────────────────────────────────────
// 复活 hub 化改造时遗失的 resync 契约:前端 useAgentSocket + 各 feature hook 的消费端一直都在
// (truncateToLastComplete / resyncUserText 种子 / seededResync 对账),只是服务端没了生产者、
// 整条链沦为死代码。迟到/重连订阅者的回放段用 resync_start → resync_user → [回放帧] → resync_end
// 包裹:前端据 resync_start 截掉本地未完成轮的残留(防与回放双份),据 resync_user 在无在途轮时
// 补用户气泡(seededResync 带守卫,本人重连不重复),据 resync_end.inFlight=false 对账解锁
// 「终帧永久丢失」的本地卡死轮。

func resyncStartFrame() []byte {
	b, _ := json.Marshal(map[string]string{"type": "resync_start"})
	return b
}

func resyncUserFrame(content string) []byte {
	b, _ := json.Marshal(map[string]string{"type": "resync_user", "content": content})
	return b
}

// resyncEndFrame:回放段收尾。inFlight=false 是「服务端当前无在途轮」的**权威信号** ——
// 前端若此刻本地还挂着一条未完成的 live 轮,说明它的终帧永远不会来了(断连期间轮已结束 /
// agent·backend 中途死过 / 消息根本没送达),据此当场对账收口,替代「永远等下去」。
func resyncEndFrame(inFlight bool) []byte {
	b, _ := json.Marshal(map[string]any{"type": "resync_end", "inFlight": inFlight})
	return b
}

// userAckFrame:user_message 已成功写入上游 agent 后回给发送端的投递确认。前端据此撤销
// 「未送达看门狗」;半死 TCP / 静默丢弃场景等不到它 → 前端把该条转成「未发送·一键重发」,
// 而不是留下一条永无终帧的幽灵轮把 composer 永久锁死。
func userAckFrame(clientTurnID string) []byte {
	b, _ := json.Marshal(map[string]string{"type": "user_ack", "clientTurnId": clientTurnID})
	return b
}

// upstreamLostFrame:上游 agent 连接在一轮进行中死亡(容器 OOM / 重启 / 60s 读超时 / 发版)时,
// 合成给订阅者的 error 终帧。没有它,前端该轮永远等不到 message_complete/error → busy 永久卡死
// (输入框 + 「新对话」按钮全被锁)。前端 fold 把 error 视作终帧收口该轮并渲染中断提示。
func upstreamLostFrame() []byte {
	b, _ := json.Marshal(map[string]any{
		"type": "error", "code": "upstream_lost",
		"message":   "AI 服务连接中断,本轮回答已中断;若内容未显示完整,刷新页面可查看已生成的部分",
		"retryable": true,
	})
	return b
}

// agentUnavailableFrame:user_message 写上游失败(agent 死/假死)时回给发送端的 error 终帧。
// 旧行为是 endTurn 后静默丢弃 → 前端幽灵轮永久卡 busy;现在明确回帧,fold 当终帧收口。
func agentUnavailableFrame() []byte {
	b, _ := json.Marshal(map[string]any{
		"type": "error", "code": "agent_unavailable",
		"message": "AI 服务暂时不可用,这条消息没有发出,请稍后重试", "retryable": true,
	})
	return b
}

// emptyTurnFrame(W3-1b):空轮裁决改判 failed 时合成的 error 终帧。前端 fold 把 error 当终帧
// 收口并渲染错误提示(零前端改动);code=empty_turn 也在 ws.go agentErrorFriendly 有映射
// (兜 agent 侧同名 code 经 sanitize 的路径;本合成帧文案已是终稿,不过 sanitize)。
func emptyTurnFrame() []byte {
	b, _ := json.Marshal(map[string]any{
		"type": "error", "code": "empty_turn",
		"message":   "模型没有返回任何内容,本轮未完成,也不会计入用量,请重试。",
		"retryable": true,
	})
	return b
}

// turnTimeoutFrame(W3-2a):轮级硬超时强制收口时合成的 error 终帧。
func turnTimeoutFrame() []byte {
	b, _ := json.Marshal(map[string]any{
		"type": "error", "code": "turn_timeout",
		"message":   "本轮处理时间过长已自动停止,已生成的内容保留在上方,请重试或换个问法。",
		"retryable": true,
	})
	return b
}

// emptyTurnAdjudicateEnabled:backend 空轮裁决的急停阀(W3-1b)。默认 on;
// env AGENT_EMPTY_TURN_ADJUDICATE=off 短路(线上误伤时免发版回滚)。
func emptyTurnAdjudicateEnabled() bool {
	return os.Getenv("AGENT_EMPTY_TURN_ADJUDICATE") != "off"
}

// isZeroUsage:message_complete 携带的整轮 usage 四字段全 0(空轮裁决的条件之一)。
func isZeroUsage(u AgentUsage) bool {
	return u.InputTokens == 0 && u.OutputTokens == 0 && u.CacheReadTokens == 0 && u.CacheCreationTokens == 0
}

// replayHasVisibleText:本轮 replayBuf 里是否有任何非空白可见正文(复用 contentDeltaText 判定)。
// 必须在 endTurn 之前读(endTurn 清空 replayBuf)。调用方持 h.mu。
func replayHasVisibleText(buf [][]byte) bool {
	for _, fr := range buf {
		if t, ok := contentDeltaText(fr); ok && strings.TrimSpace(t) != "" {
			return true
		}
	}
	return false
}

// replayInvisibleFrames —— 广播出去但**不构成任何轮内可见产出**的帧类型:纯保活 / 纯控制面 /
// 已自我作废的残缺前缀。轮级 provider 重投(2026-07-31 线上审计 §五)据此判断「本轮是否白纸一张」。
var replayInvisibleFrames = map[string]bool{
	"status":                 true, // 阶段提示,重投后会重新发
	"ping":                   true,
	"pong":                   true,
	"round_discarded":        true, // agent 自己已撤回的残缺前缀
	"runtime_config_updated": true,
	"user_echo":              true,
	"user_ack":               true,
	"resync_start":           true,
	"resync_user":            true,
	"resync_end":             true,
}

// replayHasVisibleOutput:本轮 replayBuf 里是否已有任何**用户可见**产出(正文/思考/工具/产物/
// 权限卡…)。刻意取「已知不可见」的反面 —— 将来 agent 新增任何内容型帧,默认被判为可见而
// **阻止**重投,最坏结果是少救一轮;反过来(白名单可见)一旦漏登记就会把残缺前缀和重投后的
// 完整答案拼成两段渲染出去。必须在 endTurn 之前读(endTurn 清空 replayBuf)。调用方持 h.mu。
func replayHasVisibleOutput(buf [][]byte) bool {
	for _, fr := range buf {
		if !replayInvisibleFrames[frameType(fr)] {
			return true
		}
	}
	return false
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

// hubSlot 承载一个 (feature,session) hub 的创建结果 + ready 信号(性能审计:per-key singleflight)。
// b.hubs 存 *hubSlot 而非 *sessionHub:用 sync.Map.LoadOrStore 做 per-key 原子裁决,只有创建者在【锁外】
// 跑 newHub 的全部 IO(dial + seedHistory + DB + 重试 sleep),其余等待者 <-ready 读结果。去掉了旧的全局
// hubsMu ——那把锁把整个 newHub(含 10s dial + 多次 DB + sleep)串行化,拖慢全站所有新会话建连。
type hubSlot struct {
	hub   *sessionHub
	err   error
	ready chan struct{}
}

// getOrCreateHub 取或建某 (feature, sessionID) 的 hub。同 key 只有一个创建者真正 dial(保住 jsonl 单写者不变式);
// 不同 session 的建连完全并行。
func (b *Bridge) getOrCreateHub(f *FeatureBridge, userID uint, sessionID string) (*sessionHub, error) {
	key := hubKey(f.spec.Key, sessionID)
	slot := &hubSlot{ready: make(chan struct{})}
	actual, loaded := b.hubs.LoadOrStore(key, slot)
	s := actual.(*hubSlot)
	if loaded {
		// 已有创建者(或已就绪 slot)→ 等它完成,读同一结果。
		<-s.ready
		return s.hub, s.err
	}
	// 本 goroutine 是唯一创建者(loaded==false 是原子裁决点):锁外跑 newHub 全部 IO。
	// 用 defer 确保无论成功/失败/panic,ready 都会关闭、失败 slot 都会清理 —— 否则 newHub 若 panic,
	// 等待者会永久阻塞在 <-ready、且该 session 永久卡在 pending slot(比旧全局锁更糟)。panic 仍向上传播由 recovery 兜。
	defer func() {
		if s.hub == nil && s.err == nil {
			s.err = errors.New("agentbridge: hub creation failed unexpectedly") // newHub panic 未赋值 → 给等待者一个错误而非 nil,nil
		}
		close(s.ready)
		if s.err != nil {
			// 创建失败 → 删除该 slot,让后续请求重试(否则该 session 永久卡在失败 slot)。
			b.hubs.CompareAndDelete(key, s)
		}
	}()
	s.hub, s.err = f.newHub(key, userID, sessionID)
	return s.hub, s.err
}

func (b *Bridge) removeHub(key string, h *sessionHub) {
	// 只有当注册表里的 slot 正是 h 所属的那个才删(CompareAndDelete 保证不误删已被新 hub 替换的 slot)。
	if v, ok := b.hubs.Load(key); ok {
		if slot, ok2 := v.(*hubSlot); ok2 && slot.hub == h {
			b.hubs.CompareAndDelete(key, slot)
		}
	}
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
		if slot, ok2 := v.(*hubSlot); ok2 {
			// 非阻塞:仅已就绪且成功的 hub 才判忙态;建连中(pending)/失败 slot 视为不忙。
			select {
			case <-slot.ready:
				if slot.hub != nil {
					return slot.hub.inFlightSnapshot()
				}
			default:
			}
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

// resolveChatDefault 该 feature 的默认对话模型(主绑定 chat_default.<key> + purposeAlias 归并;
// 2026-07 起不再分免费/付费档)。hub 内全部默认解析(初始下发/unpin/老 tier 帧/非法降级/
// 消息前重校验/预算 weight 反折算)必须走此 helper 同口径。调用点均已在 catalog 非 nil 的分支内。
func (h *sessionHub) resolveChatDefault() string {
	return h.f.bridge.catalog.ResolveChatDefault(h.f.spec.Key, h.userID)
}

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
		if mi := cat.MaxInput(modelID); mi > 0 {
			payload["maxInput"] = mi // 最大输入 token(0 不下发,executor 压缩墙回落「上下文−输出预留」)
		}
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
		effective = h.resolveChatDefault()
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
		effective, isDefault = h.resolveChatDefault(), true
	case modelID == "":
		// 老 tier 帧兼容(当前无前端发 tier,防御性保留一个发版周期):映射后只转发不落 pinned。
		if tier == "haiku" {
			effective = cat.Resolve("system.fast")
		} else {
			effective = h.resolveChatDefault()
		}
		isDefault = true
	default:
		if verr := cat.ValidateUserModel(h.userID, modelID); verr != nil {
			slog.Warn("agentbridge hub: 非法 modelId,兼容期静默降级为默认",
				"feature", h.f.spec.Key, "session_id", h.sessionID, "user_id", h.userID,
				"model", modelID, "reason", verr)
			effective, isDefault = h.resolveChatDefault(), true
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
	def := h.resolveChatDefault()
	if def == "" {
		return
	}
	h.setCurrentModel(def, true)
	if werr := h.writeAgent(gorillaws.TextMessage, runtimeConfigFrame(cat, def, cat.ContextWindow(def))); werr == nil {
		h.broadcastAgent(runtimeConfigUpdatedFrame(def, true))
	}
}

// stampTurnBudget 给一帧 user_message 盖单轮预算(SS#2)。
// 给 5 个 chat feature(smart_search/claw/prism/boltslides/sci_draw)用:执行器据此让 agent
// 自我配速 + 到界优雅收尾(透支带已取消,hard=soft)。每轮现算(read-only,不预扣)→ 在途一轮
// 至多超支一轮。unlimited(不限额/收费关)与 BudgetProvider=nil(peerreview 任务型)→ 原帧返回。
//
// model = 该轮**实际将要跑**的会话模型:P5 成本制下 soft/hard 是**微元真实成本**,而执行器按 raw
// token 4 类合计自配速 —— 必须除以该模型的「成本/token」(CostPerToken,微元/token)换算成 token
// 预算,两侧才闭合。(旧 P3 是 ÷billing_weight;成本制下预算已是微元,÷weight 会错缩 weight 倍。)
// 空 model(sendInitialModel 与首条消息竞态 / chat_default 未绑定)→ 回落本 feature 默认模型的成本,
// 而非跳过换算(跳过会把微元当 token 下发,预算严重低估、配速失准)。
//
// 2026-07-31 线上审计:从 handleUserMessage 提出来,使**首投与故障转移重投**共用同一口径 ——
// 重投换了模型却沿用旧帧里的 token 预算,会按新旧单价比把预算整体错缩/错放。
func (h *sessionHub) stampTurnBudget(data []byte, model string) []byte {
	f := h.f
	if f.spec.BudgetProvider == nil {
		return data
	}
	soft, hard, unlimited := f.spec.BudgetProvider(h.hookCtx, h.userID)
	if unlimited {
		return data
	}
	if cat := f.bridge.catalog; cat != nil {
		if model == "" {
			model = h.resolveChatDefault() // 主绑定 chat_default.<key>(+ purposeAlias 归并)
		}
		if model != "" {
			if cpt := cat.CostPerToken(model); cpt > 0 {
				soft = int64(float64(soft) / cpt)
				hard = int64(float64(hard) / cpt)
			}
		}
	}
	return stampBudget(data, soft, hard)
}

// ─── 轮级 provider 故障转移(2026-07-31 线上审计 §五)──────────────────────────
//
// 线上最贵的一条:一位付费新客支付后 8 分钟内连吃 3 次上游硬错误就此永久流失,而**同一会话的
// 下一轮系统自己落回默认模型就成功了** —— provider 池里有健康节点,只是失败时没人去切。
// agent_turns.attempt 全库为 0 也印证:轮级重试机制此前从未存在。
//
// 分层:agent 侧 turnLoop 只在**同一 provider 内**重放瞬态流错误;它把额度用完仍失败才吐 error
// 终帧,我们在这一层做**换 provider 的轮级重投**。两层串联、各自有界,不会叠成无限重试。

// pickFailoverModel 选一个「与失败 provider 不同」的重投目标模型。
// 候选链(顺序即优先级):① 本 feature 默认对话模型(chat_default.<key>,也正是线上那次自愈用的);
// ② system.main 绑定模型。两者都必须 ValidateUserModel 通过 —— 故障转移**绝不**把用户临时抬到
// 没买的档位(那等于按错误路径白送高档模型,且成本更高)。
// 返回 ok=false = 目录里没有「用户有权用 ∧ 换了 provider」的候选,不重投、错误照常上抛。
func (h *sessionHub) pickFailoverModel(failedModel, failedProvider string) (model string, isDefault bool, ok bool) {
	cat := h.f.bridge.catalog
	candidates := []struct {
		id        string
		isDefault bool
	}{
		{h.resolveChatDefault(), true},
		{cat.Resolve("system.main"), false}, // purpose 常量对齐 modelcatalog.PurposeSystemMain
	}
	for _, c := range candidates {
		if c.id == "" || c.id == failedModel {
			continue
		}
		if cat.ProviderKey(c.id) == failedProvider {
			continue // 同一个上游端点 —— 换了模型没换 provider,故障大概率照旧
		}
		if cat.ValidateUserModel(h.userID, c.id) != nil {
			continue
		}
		return c.id, c.isDefault, true
	}
	return "", false, false
}

// tryProviderFailover 收到 error 终帧时尝试「换 provider 重投本轮」。返回 true 表示已重投:
// 调用方必须**吞掉**这帧 error(不广播、不入 journal、不 endTurn),该轮继续在途。
//
// 前置条件全部是**正确性要求**,不是保守挡板:
//   - 本轮尚无任何可见产出:重投是从头重答,已流出的半截会与新答案在同一轮里拼成两段
//     (agent 侧同款守卫见 turnLoop 的 roundEmittedToolBlock/roundEmittedThinking);
//   - 未被用户 stop、未被轮级硬超时收口:那两条路径都已给出终态,重投会造出幽灵轮;
//   - 重投次数未超上限、有 user_message 原帧可重发、目录里确有可切换的健康 provider。
//
// 轮级硬超时计时器**故意不重置**:整轮墙钟仍由 TurnTimeout 兜住,重投不能变成延长赛。
//
// 时序依赖(executor 侧):error 终帧是在 runTurn 内发出的,ws.data.inFlight 要等 runTurn resolve
// 后的 finally 才清 —— 但那是同一条微任务链,必然早于「下一条 socket 消息被派发」。故重投帧到达时
// executor 已空闲。刻意**不加退避 sleep**:upstreamLoop 是该会话唯一的上游读者,在这里睡会把后续
// 帧全部堵住;而且我们是换端点重投,不需要给原端点喘息时间。极端竞态下重投被回 busy,该轮如实收口
// (重投额度已耗尽,不会连锁)。
func (h *sessionHub) tryProviderFailover(rawErr []byte) bool {
	f := h.f
	cat := f.bridge.catalog
	if cat == nil || !turnFailureWorthProviderRetry(errorFrameCode(rawErr)) {
		return false
	}

	h.mu.Lock()
	if h.closed || !h.inFlight || h.abortedTurn || h.timedOutTurn ||
		h.turnRetries >= maxTurnProviderRetries || len(h.inFlightAgentFrame) == 0 ||
		replayHasVisibleOutput(h.replayBuf) {
		h.mu.Unlock()
		return false
	}
	baseFrame := h.inFlightAgentFrame
	failedModel := h.currentModel
	turnID := h.currentTurnID
	h.mu.Unlock()

	failedProvider := cat.ProviderKey(failedModel)
	target, isDefault, ok := h.pickFailoverModel(failedModel, failedProvider)
	if !ok {
		// 留痕:池子里没有可切的健康节点是运营问题(只配了一个 provider / 用户档位只够一个模型),
		// 静默不重试会让「为什么线上还在连败」查无可查。
		slog.Warn("agentbridge hub: 轮失败但无可切换的 provider,错误照常上抛",
			"feature", f.spec.Key, "session_id", h.sessionID, "user_id", h.userID,
			"failed_model", failedModel, "failed_provider", failedProvider)
		return false
	}

	h.mu.Lock()
	h.turnRetries++
	attempt := h.turnRetries
	h.replayBuf = nil // 失败尝试的散帧(status 等)不再补给迟到订阅者:本轮无可见产出,清空 = 回到轮首
	h.mu.Unlock()

	// 先切 executor 的 runtime config(模型 + providerId + 窗口),再重发 user_message。
	if werr := h.writeAgent(gorillaws.TextMessage, runtimeConfigFrame(cat, target, cat.ContextWindow(target))); werr != nil {
		slog.Warn("agentbridge hub: 故障转移下发模型帧失败,放弃重投",
			"feature", f.spec.Key, "session_id", h.sessionID, "target_model", target, "err", werr)
		return false // 调用方继续走原 error 路径(广播 + endTurn),该轮如实收口
	}
	h.setCurrentModel(target, isDefault) // 预算换算/计价/重校验都读它,必须与 executor 实跑一致
	// 预算按**新模型**的成本/token 重算再盖:预算单位是微元真实成本,直接沿用旧帧会把 token 预算
	// 错缩/错放 (新旧模型单价比) 倍,执行器自配速当场失准。
	if werr := h.writeAgent(gorillaws.TextMessage, h.stampTurnBudget(baseFrame, target)); werr != nil {
		slog.Warn("agentbridge hub: 故障转移重发 user_message 失败,放弃重投",
			"feature", f.spec.Key, "session_id", h.sessionID, "target_model", target, "err", werr)
		return false
	}
	// 模型确实换了 → 广播给所有端,选择器如实反映本轮在跑哪个模型(pinned_model **不动**:
	// 这是本次故障的临时转移,用户自己的选择留在 DB 里,下次建连自动回到他选的那个)。
	h.broadcastAgent(runtimeConfigUpdatedFrame(target, isDefault))

	// attempt 落库:复用 agent_turns.attempt 字段语义(此前恒 0 = 没有任何重试机制)。
	// 之所以不给失败尝试写 EvError:重投对用户是透明的,journal 里多一条 error 会让历史回放
	// 在正常答案中间凭空插一段报错。失败尝试的可观测性由 attempt + 下面这条 WARN 承担。
	if journal := f.bridge.log; journal != nil && turnID != 0 {
		safego.Go("agentbridge-turn-attempt:"+f.spec.Key, func() {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			if err := journal.BumpAttempt(ctx, turnID, attempt); err != nil {
				slog.Warn("agentbridge hub: BumpAttempt 落库失败(不影响 live 重投)",
					"turn_id", turnID, "attempt", attempt, "err", err)
			}
		})
	}
	slog.Warn("agentbridge hub: 轮级 provider 故障转移重投",
		"feature", f.spec.Key, "session_id", h.sessionID, "user_id", h.userID, "turn_id", turnID,
		"attempt", attempt, "code", errorFrameCode(rawErr),
		"from_model", failedModel, "from_provider", failedProvider,
		"to_model", target, "to_provider", cat.ProviderKey(target))
	return true
}

// seedHistoryTurns —— 冷重播回灌的历史轮数上限。此前是 ReadRecentTurns(..., 30) 的裸字面量。
// ⚠️ 它同时决定「模型能记得多远」与「seed 帧多大」,是个真实的产品参数,不该藏在参数表里。
const seedHistoryTurns = 30

// seedHistoryFromJournal 在(切到 executor 的)hub 建连后,把 journal 折叠的会话历史作为 seed_history
// 控制帧喂给 executor —— executor 无状态、不自持久化历史(H1)。fork 路径不调用(fork 有 jsonl)。
func (h *sessionHub) seedHistoryFromJournal() {
	if h.f.bridge.log == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// 🔴 2026-08-08:读侧失败此前是**静默 return** —— 不发帧、不置 seedFailed、无日志。
	//    fail-closed 闸(下面那段 + handleUserMessage)只覆盖**写**失败,读失败时会话会在
	//    「无历史 / 无 skills / 无系统提示 / 无 MCP 白名单」的状态裸跑:executor 侧
	//    getOrCreateEphemeral 造全空 meta,allowBashFor 因 denylist 为空返回 true(Bash 被打开),
	//    awaitHydration 因「无在途 seed」立即放行。一次 5s DB 超时就能让一整轮跑在这个状态上。
	//    读失败与写失败的后果完全一样,凭什么只挡一个。
	evs, _, hasMore, err := h.f.bridge.log.ReadRecentTurns(ctx, h.sessionID, seedHistoryTurns)
	if err != nil {
		slog.Error("agentbridge hub: seed history read failed (fail-closed: first message will be gated)",
			"feature", h.f.spec.Key, "session_id", h.sessionID, "err", err)
		h.seedFailed.Store(true)
		return
	}
	// hasMore 此前被 `_` 吞掉:超过 seedHistoryTurns 轮的历史被**静默**硬截断,既不告知 executor
	// 也不给用户任何提示。对照热路径的等价裁剪会发 system_notification{kind:"context_compacted"}
	// 并留一份滚动摘要(compact.ts)。线上 9 个 >30 轮的会话全都反复走这条路(单个会话最多 14 次
	// 冷重播)。这里至少留痕 —— 用户可见的提示是独立一项(需要前端配合),别在这儿假装做完了。
	if hasMore {
		slog.Info("agentbridge hub: seed history truncated (older turns dropped, no summary)",
			"feature", h.f.spec.Key, "session_id", h.sessionID, "kept_turns", seedHistoryTurns)
	}
	msgs := h.f.bridge.log.FoldToMessages(evs)
	// 老会话(切流前)无事件日志 → 历史在归档表(P6:fork 退役前归档)。journal 空 → 先读归档,
	// 让 executor 续聊老会话仍有上下文;再兜底 client(过渡 fork / collapse 后 executor 返空无害)。
	if len(msgs) == 0 {
		if ar, ok := h.f.bridge.readArchive(h.sessionID); ok {
			msgs = ar.Messages
		} else if resp, derr := h.f.bridge.client.GetSessionMessages(ctx, h.sessionID, seedHistoryTurns); derr == nil && resp != nil && len(resp.Messages) > 0 {
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
	hasOpts := opts != nil && (opts.AppendSystemPrompt != "" || len(opts.AddDirs) > 0 || len(opts.DisallowedTools) > 0 || len(opts.AllowedMcpTools) > 0 || len(opts.Skills) > 0 || opts.HonestyGuard)
	// 2026-08 证据账本 P0-c:证据账本的最后一张引擎快照(EvEvidence 的 research_state 帧)。
	// 账本真源是 executor workdir 的 evidence/ledger.jsonl —— 那份文件扛得住重启,但扛不住
	// workdir 被 GC / 换机。故随 seed 带一张后端侧快照做重建入口。**P0 只负责把字段带上**
	// (executor 目前忽略未知字段),消费在 P1;现在就能拿到的收益是:重建口径与 journal 同源,
	// 不用等 P1 再回头补一条链路。
	research := latestResearchState(evs)
	if len(msgs) == 0 && title == "" && !hasOpts && len(research) == 0 {
		return // 全新会话:无历史/标题/注入面,executor 从空起(并会生成标题)
	}
	payload := map[string]any{"type": "seed_history", "messages": msgs}
	if len(research) > 0 {
		payload["research"] = research
	}
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
		if len(opts.AllowedMcpTools) > 0 {
			payload["allowedMcpTools"] = opts.AllowedMcpTools
		}
		// 用户市场 skill 内联内容:重连/重启后 executor 据此重物化(与 CreateSession 同路径)。
		if len(opts.Skills) > 0 {
			payload["skills"] = opts.Skills
		}
		// 冻结契约 #5:诚实性核验 per-feature 旗标随 seed 下发(executor 仅在 meta 为空时回填,
		// 与 allowedMcpTools 同管线)。仅 claw spec 置 true,其余 feature 缺省 false 不携带。
		if opts.HonestyGuard {
			payload["honestyGuard"] = true
		}
		if len(opts.HonestyChecks) > 0 {
			payload["honestyChecks"] = opts.HonestyChecks
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
		// 回放段用 resync 协议包裹(帧构造处有完整注释):resync_start 让前端先截掉本地未完成轮
		// 的残留(防与回放双份);resync_user 替代旧的 user_echo 回放 —— 前端种子逻辑带
		// 「无在途轮才补」守卫,本人同 mount 重连不再复制出永无终帧的孤儿轮(busy 卡死根因)。
		trySend(sub.out, resyncStartFrame())
		// 背压护栏(审查修复):sub.out 容量 subOutBuffer,writeLoop 尚未启动(addSubscriber 返回后才起),
		// 超长在途轮(几十次工具调用)的回放事件数可能超容量 → trySend 静默丢**队尾**帧,恰好把
		// resync_end / runtime_config 丢掉(对账信号失效)。只回放**尾部** replayCap 条:续流关心的是
		// 「接上当前进度」,超长轮的头部内容由刷新后的 history 回放兜底;协议帧(start/user/end)恒保送。
		const replayCap = subOutBuffer - 8
		if useJournal && jTurn != nil {
			// 迟到续流(P1 持久源):从事件日志回放已产出助手帧。data-loss 修复点:
			// 即便所有 sub 离开 / hub 中途 shutdown,partial 内容已 durable 在 agent_turn_events,
			// 重连 tab 仍能回放 —— replayBuf(RAM,shutdown 即弃)永远做不到。
			if jTurn.RoleUserText != "" {
				trySend(sub.out, resyncUserFrame(jTurn.RoleUserText))
			}
			evs := jEvs
			if len(evs) > replayCap {
				evs = evs[len(evs)-replayCap:]
			}
			for _, ev := range evs {
				trySend(sub.out, ev.Payload)
			}
		} else {
			// 既有内存路径(flag off / 日志读错的 fallback):用户气泡 + replayBuf(已合并,有界)。
			if h.inFlightUserText != "" {
				trySend(sub.out, resyncUserFrame(h.inFlightUserText))
			}
			buf := h.replayBuf
			if len(buf) > replayCap {
				buf = buf[len(buf)-replayCap:]
			}
			for _, fr := range buf {
				trySend(sub.out, fr)
			}
		}
	}
	// 无论是否在途都发 resync_end:inFlight=false 是「当前无在途轮」的权威对账信号(见帧构造注释),
	// 前端据此把「终帧永久丢失」的本地卡死轮当场收口 —— 线上 busy 永久卡死事故的兜底闭环。
	trySend(sub.out, resyncEndFrame(h.inFlight))
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
		// 终帧兜底:走到 shutdown 时若仍有在途轮(upstreamLoop 读错路径已先 endTurn 不会命中;
		// 这里兜其余收尾路径,如 grace 到点 / 进程收尾),先广播中断终帧再踢订阅者 —— 有订阅者时
		// 防其 busy 永久卡死,无订阅者时是 no-op。影子日志仍走下方原有 AbortTurn 路径,语义不变。
		if h.inFlightSnapshot() {
			h.broadcastAgent(upstreamLostFrame())
		}
		h.mu.Lock()
		h.closed = true
		if h.graceTimer != nil {
			h.graceTimer.Stop()
			h.graceTimer = nil
		}
		// W3-2:hub 收尾时停轮级硬超时(closed 置位后 onTurnTimeout 也会自守卫,双保险)。
		if h.turnTimer != nil {
			h.turnTimer.Stop()
			h.turnTimer = nil
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
			// 软关闭:只发 quit 信号,不立刻关 conn —— writeLoop 收到 quit 后会带超时排空 out 里
			// 已入队的帧(含上面刚广播的合成终帧)再自行关连接。硬关会让终帧 ~50% 概率竞态丢失。
			s.signalQuit()
		}
		h.f.bridge.removeHub(h.key, h)
		h.f.bridge.flushTokenWatermark(h.sessionID) // 先同步落库最新水位,再丢内存副本(防优雅重启丢在途水位→重连多记一轮)
		h.f.bridge.deleteTokenWatermark(h.sessionID)
		if abortTID != 0 && !abortDone && h.f.bridge.turns != nil {
			turns := h.f.bridge.turns
			key := h.f.spec.Key
			// W3-2c:落库失败不再静默吞(reaper 会兜底回收,但失败必须留痕)。
			safego.Go("agentbridge-turn-abort:"+key, func() {
				if err := turns.AbortTurn(context.Background(), abortTID); err != nil {
					slog.Warn("agentbridge hub: AbortTurn write failed (journal reaper will reconcile)",
						"feature", key, "turn_id", abortTID, "err", err)
				}
			})
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
	// 有界写超时(性能审计 P0):agent TCP 假死时避免 WriteMessage 永久阻塞并持锁拖死该会话所有写方。
	// agentWriteMu 已串行化写,SetWriteDeadline 对本 conn 的作用不会相互干扰。
	_ = h.agentConn.SetWriteDeadline(time.Now().Add(agentWriteDeadline))
	return h.agentConn.WriteMessage(mt, data)
}

// ── 轮次/忙态 ────────────────────────────────────────────────────────────────

// beginTurn 尝试开一轮:已在进行中 → 返回 false(回答中锁住)。否则置 inFlight + 清 replayBuf + 记用户原文。
func (h *sessionHub) beginTurn(content, clientTurnID string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.inFlight {
		return false
	}
	h.inFlight = true
	h.replayBuf = nil
	h.inFlightUserText = content
	// 新一轮:清上一轮的重投状态(帧字节 + 计数),使重投额度按轮而非按连接发放。
	h.inFlightAgentFrame = nil
	h.turnRetries = 0
	h.currentClientTurnID = clientTurnID // 供孤儿终帧 id 匹配(审计 [18]);timedOutClientTurnID 故意不在此清
	h.abortedTurn = false // 新一轮:清上一轮的 stop 标记
	// 逐帧硬闸:清上一轮的计数与幂等位。cap 本身由 armTurnCostCap 在**锁外**取(要走 DB/Redis)。
	h.turnSpentMicro = 0
	h.turnStopSent = false
	h.turnCapMicro, h.turnCapArmed = 0, false
	// W3-2:arm 轮级硬超时(spec 零值 = 默认 15min;负值禁用 → d=0 不 arm)。
	// timedOutTurn 清:新轮开始 → 不再压制散帧(审计 [19]);但 timedOutClientTurnID 不清(见字段注释)。
	h.timedOutTurn = false
	if h.turnTimer != nil {
		h.turnTimer.Stop()
	}
	if d := h.f.spec.TurnTimeoutOrDefault(); d > 0 {
		h.turnTimer = time.AfterFunc(d, h.onTurnTimeout)
	} else {
		h.turnTimer = nil
	}
	return true
}

// endTurn 结束当前轮(message_complete / 轮内 error / 上游断开)。清进行中状态。
func (h *sessionHub) endTurn() {
	h.mu.Lock()
	h.inFlight = false
	h.replayBuf = nil
	h.inFlightUserText = ""
	h.inFlightAgentFrame = nil // 轮已收口 → 重投素材作废(turnRetries 留到 beginTurn 清,便于收尾日志读)
	// W3-2:轮结束即停硬超时计时器(正常完成 / error / 上游断开都不该再 fire)。
	if h.turnTimer != nil {
		h.turnTimer.Stop()
		h.turnTimer = nil
	}
	tid := h.currentTurnID
	done := h.completedThisTurn
	h.currentTurnID = 0
	h.mu.Unlock()
	// P0 影子:非正常完成(轮内 error / 上游 drop / 注入失败 / writeAgent 失败)→ 标 failed。
	// message_complete 路径已在上游把 currentTurnID 置 0 + completedThisTurn=true,故此处 tid==0 跳过。
	// 用 context.Background()(hookCtx 可能在收尾路径被 cancel,而这是 best-effort 终态写)。
	// W3-2c:落库失败不再静默吞(reaper 会兜底回收,但失败必须留痕)。
	if tid != 0 && !done && h.f.bridge.turns != nil {
		turns := h.f.bridge.turns
		key := h.f.spec.Key
		safego.Go("agentbridge-turn-fail:"+key, func() {
			if err := turns.FailTurn(context.Background(), tid); err != nil {
				slog.Warn("agentbridge hub: FailTurn write failed (journal reaper will reconcile)",
					"feature", key, "turn_id", tid, "err", err)
			}
		})
	}

	// ── 轮末产物收割(2026-08-07 · B1)────────────────────────────────────────
	//
	// 挂在 endTurn 而不是 message_complete 的 case 里,是**刻意的**:endTurn 是所有
	// 轮结束路径的唯一汇合口(正常完成 / 轮内 error / 空轮改判 / 硬超时 / 上游断开 /
	// 用户 stop 都经它),而产物是否该留存与这一轮结得漂不漂亮无关 —— 文件已经在盘上了。
	// 挂在 complete 分支会精确漏掉「长任务撞轮上限」这类最需要留住成果的轮。
	//
	// 派发是非阻塞的(有界队列 + 独立 worker 池),不会拖慢本会话的帧扇出;
	// hook 为 nil 的 feature(smart_search / prism 等无交付面的)在这里直接返回。
	if hook := h.f.spec.OnTurnArtifacts; hook != nil {
		h.f.bridge.enqueueArtifactHarvest(harvestJob{
			hook:      hook,
			feature:   h.f.spec.Key,
			userID:    h.userID,
			sessionID: h.sessionID,
		})
	}
}

// ─── 轮内成本硬闸(逐帧上报,2026-08)────────────────────────────────────────
//
// 背景:此前 backend 对「一轮花了多少钱」在轮跑完之前一无所知 —— per-call 明细只随终帧
// 一次性回来,所以唯一的调控手段是把预算**盖在 user_message 帧上建议执行器自己收尾**。
// 建议值在 agent 不配合时完全失效(线上实证:wind-down 按时触发、模型继续跑了 21 轮工具,
// 单轮实花是预算的 8.2 倍,把用户余额打穿到负数)。
//
// 执行器现在每完成一次 LLM call 就上报一帧 turn_usage_delta,hub 据此在轮内累计真实成本,
// 越顶即 stop_generation。与建议值是**互补而非替代**:建议值让绝大多数轮优雅收尾(用户拿到
// 完整答案),硬闸只在建议失效时兜底(用户拿到被截断的答案,但损失有界)。
//
// 🔴 为什么硬闸不合成终帧:stop_generation 传导到执行器的 abort 后,它的 finally 会照常发出
// 自己的终帧,并在其中携带**完整的 calls[] + session_total** —— 计费与 journal 全部沿既有路径
// 收口,一行不用改。这里再合成一帧只会制造「一轮两个终帧」,而那正是 W3-2a 孤儿帧机制在治的病。
// 代价是用户侧看到的是「已停止」而非「预算用尽」,该文案是独立的一步(需要前端配合),不在此实现。

// armTurnCostCap 在轮起点取一次本轮硬顶。**必须在 h.mu 之外调用**(provider 走 Redis + DB)。
//
// cap 取一次而非逐帧现算:payg 用户的钱包余额在轮内会被别的路径异步改(别的会话、别的 feature
// 的扣减都在飞),逐帧现算会让同一轮的闸门口径中途缩水,表现为「同样的任务有时跑得完有时跑不完」。
func (h *sessionHub) armTurnCostCap() {
	fn := h.f.spec.TurnCostCap
	if fn == nil {
		return
	}
	capMicro, unlimited := fn(h.hookCtx, h.userID)
	if unlimited || capMicro <= 0 {
		return // 不限额 / 该档无预算概念 → 本轮不设闸
	}
	h.mu.Lock()
	// 只有仍在本轮才 arm:provider 那次 Redis+DB 读是在锁外做的,期间读循环完全可能因上游断开
	// 走 endTurn 把 inFlight 置回 false。那时再写 cap 会把这一轮的闸门口径**泄漏给下一轮**,
	// 而下一轮的余额/窗口可能已经完全不同 —— 表现为「下一轮刚开口就被掐」,归因链彻底断掉。
	if h.inFlight {
		h.turnCapMicro, h.turnCapArmed = capMicro, true
	}
	h.mu.Unlock()
}

// accrueTurnCost 把一次 LLM call 的用量折成微元累加进本轮水位,并判定是否该停轮。
// **纯状态迁移,无 I/O**(写 socket 在 onTurnUsageDelta) —— 分开是为了让「累加 / 幂等 / arm 与否 /
// 越顶判定」这几条能在没有 websocket 的单测里被钉死;本仓库对 turnCapFromRemaining 那几个
// 判定函数是同一个做法。
//
// 返回 stop=true 只在**越顶的那一帧**发生一次(turnStopSent 幂等位),后续帧一律 false。
func (h *sessionHub) accrueTurnCost(u AgentUsage) (stop bool, spent, capMicro int64) {
	cat := h.f.bridge.catalog
	if cat == nil {
		return false, 0, 0 // 无目录 = 无法定价 → 不设闸(宁可放过,也不按 0 成本假装安全)
	}
	_, costMicro := cat.PriceUsage(u.Model, u.InputTokens, u.OutputTokens, u.CacheReadTokens, u.CacheCreationTokens)
	if costMicro <= 0 {
		// 目录 miss(上游改名 / 未登记模型)→ 计价为 0。这里刻意**不**兜一个估算值:
		// PriceUsage 已经在 miss 时限流告警并自动登记占位行,补单价是 admin 的一步操作;
		// 在闸门里造一个假价格只会让「为什么这轮被掐了」无从解释。
		return false, 0, 0
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if !h.turnCapArmed || !h.inFlight || h.turnStopSent {
		return false, h.turnSpentMicro, h.turnCapMicro
	}
	h.turnSpentMicro += costMicro
	if h.turnSpentMicro < h.turnCapMicro {
		return false, h.turnSpentMicro, h.turnCapMicro
	}
	h.turnStopSent = true
	// 与用户主动 stop 同款语义:终帧广播时盖 aborted:true,前端按「已停止」渲染而非静默收尾。
	h.abortedTurn = true
	return true, h.turnSpentMicro, h.turnCapMicro
}

// onTurnUsageDelta 收一帧执行器上报的单次 LLM call 用量;越顶则向执行器发 stop_generation。
//
// ⚠️ 只做闸门,**不记账** —— 见 ws.go extractTurnUsageDelta 的红字。
func (h *sessionHub) onTurnUsageDelta(u AgentUsage) {
	stop, spent, capMicro := h.accrueTurnCost(u)
	if !stop {
		return
	}
	stopFrame, _ := json.Marshal(map[string]string{"type": "stop_generation"})
	if werr := h.writeAgent(gorillaws.TextMessage, stopFrame); werr != nil {
		slog.Warn("agentbridge hub: 轮内成本硬闸 stop_generation 写失败(本轮将继续烧钱直到执行器自停)",
			"feature", h.f.spec.Key, "session_id", h.sessionID, "user_id", h.userID, "err", werr)
		return
	}
	slog.Warn("agentbridge hub: 轮内成本硬闸触发,已请求执行器停轮",
		"feature", h.f.spec.Key, "session_id", h.sessionID, "user_id", h.userID,
		"spent_micro", spent, "cap_micro", capMicro, "model", u.Model)
}

// onTurnTimeout 轮级硬超时到点(W3-2a):hub 是唯一同时掌握 inFlight/turnID/agent 写口/广播的对象。
// ① 向 agent 发 stop_generation 让它真正停下(abort 传导到 LLM 流/工具批,释放执行器并发槽 ——
//    全容器仅 2 槽,挂死即占死);② EvError 入 journal + FailTurn(经 endTurn 既有路径);
// ③ 广播 turn_timeout 终帧解锁前端 busy。置 timedOutTurn:迟到的孤儿 complete 只入账不广播。
func (h *sessionHub) onTurnTimeout() {
	h.mu.Lock()
	if !h.inFlight || h.closed {
		h.mu.Unlock()
		return
	}
	tid := h.currentTurnID
	h.timedOutTurn = true
	h.timedOutClientTurnID = h.currentClientTurnID // 记下被超时轮的 client id,供孤儿终帧精确匹配(审计 [18])
	h.mu.Unlock()
	stop, _ := json.Marshal(map[string]string{"type": "stop_generation"})
	if werr := h.writeAgent(gorillaws.TextMessage, stop); werr != nil {
		slog.Debug("agentbridge hub: turn-timeout stop_generation write failed",
			"feature", h.f.spec.Key, "session_id", h.sessionID, "err", werr)
	}
	frame := turnTimeoutFrame()
	if tid != 0 && h.f.bridge.turns != nil {
		h.f.bridge.turns.Append(tid, h.sessionID, EvError, frame) // 失败轮终态事件入 journal
	}
	h.endTurn() // tid!=0 && !done → FailTurn(既有路径)
	h.broadcastAgent(frame)
	slog.Warn("agentbridge hub: turn hard-timeout fired",
		"feature", h.f.spec.Key, "session_id", h.sessionID, "turn_id", tid,
		"timeout", h.f.spec.TurnTimeoutOrDefault().String())
}

// accountTurnUsage 只走计费/审计入账链路(OnMessageComplete 钩子 + 水位补差 + 台账),不广播、
// 不写 journal。供「轮级硬超时后迟到的孤儿 complete/error」入账用(W3-2a)—— 上游真实消耗如实
// 记账,但该轮的用户可见终态已由 turn_timeout 定格,不再动 UI 与 journal。
//
// chargeUser=false → 平台自担(2026-07-31 线上审计 §五):仍落账本留成本快照,但不扣用户额度。
func (h *sessionHub) accountTurnUsage(usage AgentUsage, calls []AgentUsage, sessionTotal *AgentUsage, chargeUser bool) {
	f := h.f
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
				if chargeUser {
					recordAgentTokens(rec, f.bridge.catalog, &uid, feat, sid, rows[i])
				} else {
					recordAgentTokensPlatformFault(rec, f.bridge.catalog, &uid, feat, sid, rows[i])
				}
			}
		})
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
			// 终帧兜底(线上事故修复):一轮进行中上游死亡(agent OOM/重启/读超时/发版)时,必须给
			// 所有订阅者补一帧合成 error 终帧再收尾 —— 旧行为只 endTurn 静默返回,前端该轮永远无终帧
			// → busy 永久卡死(输入框 + 「新对话」按钮全锁,用户只能刷新)。
			// 顺序:先 endTurn 清 inFlight/replayBuf,再广播 —— 终帧不 tee 进将被丢弃的 replayBuf。
			h.mu.Lock()
			wasInFlight := h.inFlight
			h.mu.Unlock()
			h.endTurn()
			if wasInFlight {
				h.broadcastAgent(upstreamLostFrame())
			}
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
							// 审查修复:此路径必然在途(permission_request 只在轮中出现),与读错分支同款
							// 先快照再 endTurn 再广播终帧 —— 否则这里先 endTurn 会把 shutdown 顶部的
							// inFlightSnapshot 兜底也短路,订阅者(尤其无 resync-idle 对账的旧客户端/小程序)
							// 永远等不到终帧 → busy 永久卡死。
							h.mu.Lock()
							wasInFlight := h.inFlight
							h.mu.Unlock()
							h.endTurn()
							if wasInFlight {
								h.broadcastAgent(upstreamLostFrame())
							}
							return
						}
					}
				}
			case "message_complete":
				if usage, calls, sessionTotal, isComplete := extractMessageComplete(data); isComplete {
					// 冻结契约 #3:extractMessageComplete 只浅读不改帧;广播用原始 data 字节
					// (stampAbortedFrame 经 map[string]any 重组,同样保留未知字段)—— 执行器新增的
					// claim_audit 等扩展字段必须原样透传给前端,此处不得改成「白名单重组」。

					// W3-2a 孤儿 complete 防护:本轮已被轮级硬超时强制收口(turn_timeout 终帧已广播、
					// FailTurn 已落)→ 迟到的 complete 只走计费入账链路,跳过广播与 journal complete,
					// 防止超时 error 之后又飘来一帧 complete 把前端 fold 顶出幽灵轮。
					// 用 clientTurnId **精确匹配**被超时的那一轮(审计 [18]):不再靠会被 beginTurn 清掉的
					// bool,故快速重试轮不会把上一轮的孤儿 complete 误算到自己头上。
					frameCTID := extractClientTurnID(data)
					h.mu.Lock()
					orphanAfterTimeout := h.timedOutClientTurnID != "" && frameCTID == h.timedOutClientTurnID
					if orphanAfterTimeout {
						h.timedOutClientTurnID = ""
					}
					h.mu.Unlock()
					if orphanAfterTimeout {
						slog.Info("agentbridge hub: orphan complete after turn-timeout, accounting only",
							"feature", f.spec.Key, "session_id", h.sessionID)
						// 迟到的 complete = 上游其实跑完了(只是晚于我们的硬超时),消耗如实计入用户额度。
						h.accountTurnUsage(usage, calls, sessionTotal, true)
						continue
					}

					// W3-1b 空轮裁决(机械兜底):usage 全 0 + 零 LLM call + 本轮无任何可见正文 + 非用户
					// 主动 stop → 该 complete 实为事故空轮(上游断流/异常吞终帧被伪装成正常结束),改判
					// failed:合成 error{empty_turn} 终帧广播 + EvError 入 journal + FailTurn;continue
					// 跳过 buildLedgerRow / OnMessageComplete / accrueTurnUsage 三条计费路径(空轮不计费)。
					// 读 replayBuf 必须在 endTurn 之前(endTurn 清空它)。env AGENT_EMPTY_TURN_ADJUDICATE=off 短路。
					h.mu.Lock()
					hasVisibleText := replayHasVisibleText(h.replayBuf)
					stoppedByUser := h.abortedTurn
					emptyTID := h.currentTurnID
					h.mu.Unlock()
					if emptyTurnAdjudicateEnabled() && isZeroUsage(usage) && len(calls) == 0 && !hasVisibleText && !stoppedByUser {
						frame := emptyTurnFrame()
						h.mu.Lock()
						h.currentTurnID = 0
						h.completedThisTurn = true // endTurn 不再重复 finalize(FailTurn 由下方显式落)
						h.mu.Unlock()
						if emptyTID != 0 && f.bridge.turns != nil {
							f.bridge.turns.Append(emptyTID, h.sessionID, EvError, frame) // 失败轮终态事件入 journal
							turns := f.bridge.turns
							safego.Go("agentbridge-turn-emptyfail:"+f.spec.Key, func() {
								if err := turns.FailTurn(context.Background(), emptyTID); err != nil {
									slog.Warn("agentbridge hub: FailTurn(empty) write failed (journal reaper will reconcile)",
										"turn_id", emptyTID, "err", err)
								}
							})
						}
						slog.Warn("agentbridge hub: empty turn adjudicated to failed",
							"feature", f.spec.Key, "session_id", h.sessionID, "turn_id", emptyTID)
						h.endTurn()
						h.broadcastAgent(frame)
						continue // 不广播原 complete 帧、不写 ledger、不走 OnMessageComplete/accrueTurnUsage
					}

					// stop 后 executor 仍发 message_complete。在写 journal/终态之前读 aborted，
					// 并把同一份已盖章帧用于 journal + live，避免管理端看到 complete。
					h.mu.Lock()
					wasAborted := h.abortedTurn
					h.mu.Unlock()
					if wasAborted {
						if stamped := stampAbortedFrame(data); stamped != nil {
							data = stamped
						}
					}

					// P0 影子:终结符入日志 + 权威终态(影子计费);live 计费仍走下方。
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
							status := "complete"
							if wasAborted {
								status = "aborted"
							}
							safego.Go("agentbridge-turn-complete:"+f.spec.Key, func() {
								if err := f.bridge.turns.FinalizeTurn(context.Background(), tid, status, model, ledger); err != nil {
									slog.Warn("agentbridge hub: shadow FinalizeTurn failed (billing unaffected)",
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
				// 轮结束:先解锁忙态,再广播完成帧(让所有端解除置灰)。
				h.endTurn()
			case "error":
				// W3-2a 孤儿 error 防护(审计 [18]):被超时收口那一轮迟到的 error 终帧(agent abort 后
				// 可能发 error 而非 complete)—— 按 clientTurnId 匹配到即只入账,不重复 journal/endTurn/广播
				// (turn_timeout 终帧已发、FailTurn 已落、inFlight 已清)。否则会双终帧 + 误清新轮 inFlight。
				{
					frameCTID := extractClientTurnID(data)
					h.mu.Lock()
					orphanErr := h.timedOutClientTurnID != "" && frameCTID == h.timedOutClientTurnID
					if orphanErr {
						h.timedOutClientTurnID = ""
					}
					h.mu.Unlock()
					if orphanErr {
						if usage, calls, sessionTotal, hasUsage := extractErrorUsage(data); hasUsage {
							// 归责与主路径同口径(2026-07-31 线上审计 §五):平台责任的失败不扣用户额度。
							h.accountTurnUsage(usage, calls, sessionTotal, turnFailureChargedToUser(errorFrameCode(data)))
						}
						slog.Info("agentbridge hub: orphan error after turn-timeout, accounting only",
							"feature", f.spec.Key, "session_id", h.sessionID)
						continue
					}
				}
				// 计费回归修复(2026-07-14):error 终帧可携带失败前已完成 LLM call 的 usage/calls
				// (executor turnLoop 失败路径随帧带回)。按 message_complete 同一链路入账(用量钩子 +
				// 水位补差 + 台账),否则「多轮工具循环最后一轮流被掐」整轮上游消耗漏记。
				// 刻意不做:记忆抽取(轮失败不抽取)、prompt_injected 标记(维持失败轮原语义)。
				//
				// 2026-07-31 线上审计 §五:入账**归责**在此分叉 —— 平台责任的失败(上游断流/过载/
				// 模型协议异常/轮内步数撞我们自己的上限)照记账本但**不扣用户额度**;用户任务导致的
				// (budget 任务过大 / content_blocked 内容合规)照扣。线上一位用户为 9 连败付了 9 轮钱。
				if usage, calls, sessionTotal, hasUsage := extractErrorUsage(data); hasUsage {
					chargeUser := turnFailureChargedToUser(errorFrameCode(data))
					if !chargeUser {
						slog.Warn("agentbridge hub: 失败轮平台自担(记成本不扣额度)",
							"feature", f.spec.Key, "session_id", h.sessionID, "user_id", h.userID,
							"code", errorFrameCode(data), "model", usage.Model)
					}
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
								if chargeUser {
									recordAgentTokens(rec, f.bridge.catalog, &uid, feat, sid, rows[i])
								} else {
									recordAgentTokensPlatformFault(rec, f.bridge.catalog, &uid, feat, sid, rows[i])
								}
							}
						})
					}
				}
				// 2026-07-31 线上审计 §五:传输层/容量类失败 → 换一个健康 provider 把这一轮重投一次。
				// 成功派发即**吞掉**这帧 error(不净化、不入 journal、不 endTurn、不广播),该轮继续在途,
				// 用户只感到多等了一会儿。上面的入账已完成 —— 失败尝试的真实消耗照记账本(平台自担)。
				// 必须放在 endTurn 之前:replayBuf(判「本轮是否白纸一张」)与 inFlight 都由 endTurn 清。
				if h.tryProviderFailover(data) {
					continue
				}
				// 评审 #4:执行器 error 帧可能带原始英文 / 内部机制名(如 "awaiting PushConfig")。
				// 用户面绝不回显内部标识 —— 按 code 换成友好中文再广播;原文留 slog 便于排查。
				// W3-1b 修既有缝:sanitize 提前到 endTurn 之前 —— 此前 endTurn 先清 currentTurnID,
				// 通用 tee(见下方 classifyJournalEv 路径)拿到 tid==0 直接跳过,error 终帧**永远**进不了
				// journal,失败轮回放无终态。现在在 endTurn 前用净化后的帧显式 Append EvError
				// (journal 与广播存同一份净化文案,回放天然干净);endTurn 后通用 tee tid==0,不重复。
				slog.Debug("agentbridge hub: agent error frame", "feature", f.spec.Key, "raw", string(data))
				data = sanitizeAgentErrorFrame(data)
				if f.bridge.turns != nil {
					h.mu.Lock()
					errTID := h.currentTurnID
					h.mu.Unlock()
					if errTID != 0 {
						f.bridge.turns.Append(errTID, h.sessionID, EvError, data)
					}
				}
				// C2:executor 的 error 终帧(round-cap / 上游失败 / abort 等)也必须清 inFlight,
				// 否则该会话永远卡 busy(ping/pong 保活使读 deadline 永不触发)。仍向下广播 error 给前端解锁。
				h.endTurn()
			case "turn_usage_delta":
				// 逐帧硬闸的唯一入口。同步执行(不起 goroutine):闸门必须在**下一次 LLM call
				// 发出之前**做完判定才有意义,而读循环与执行器的帧序是同一条 TCP 流 —— 放到
				// goroutine 里就等于把「及时」交给调度器运气。判定是纯内存 + 一次目录查表,
				// 微秒级,不会拖慢帧转发。
				if u, ok := extractTurnUsageDelta(data); ok {
					h.onTurnUsageDelta(u)
				}
				continue // 纯后端控制信号,不广播给前端(前端无消费方,广播只会撑大 replayBuf)
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
					if raw, extractFailed, ok := extractMemoryUpdateFrame(data); ok {
						if extractFailed {
							// agent 侧抽取 LLM 失败(默认 provider 挂 / OpenAI 兼容端点报错 / 无可用槽位):
							// 记忆静默冻结在旧值。补后端告警,否则只有 agent 容器日志可见(审计 P2-6)。
							slog.Warn("agentbridge hub: agent-side memory extract failed",
								"session_id", h.sessionID, "feature", f.spec.Key, "user_id", h.userID)
						} else if raw != "" {
							uid := h.userID
							safego.Go("agentbridge-memory-ingest:"+f.spec.Key, func() {
								f.bridge.IngestMemory(uid, raw)
							})
						}
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
		// [19] 轮已被超时收口且尚无新轮开始 → 丢弃迟到的散帧(tool_result/content_delta 等非终帧):
		// 否则它们会广播到前端已关闭的轮上,渲染成无主残帧。终帧(message_complete/error)在上面 case
		// 里已各自处理(孤儿走 continue),到不了这里;新轮 beginTurn 清 timedOutTurn,不影响新轮的帧。
		h.mu.Lock()
		suppressStray := h.timedOutTurn
		h.mu.Unlock()
		if suppressStray {
			continue
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
			// 退出前非阻塞排空 out 里已入队的帧(每帧带写超时):shutdown 先入队合成终帧、紧跟
			// signalQuit,本 select 可能先看到 quit —— 不排空则终帧 ~50% 概率竞态丢失,前端该轮
			// 永无终帧 → busy 永久卡死。排空有界(队列容量 × 写超时上限),不会挂住收尾;
			// 硬关路径(close 已关 conn)下写必失败,立即返回,行为与旧版等价。
			for {
				select {
				case frame := <-s.out:
					_ = s.conn.SetWriteDeadline(time.Now().Add(frontWriteDeadline))
					if err := s.conn.WriteMessage(gorillaws.TextMessage, frame); err != nil {
						return
					}
				default:
					return
				}
			}
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
	// 安全闸(与 default 路径 browserFrameForwardable 对齐):user_message 走本专属分支、不过那道闸,
	// 故在此剥离浏览器可能夹带的注入面字段(addDirs/disallowedTools/appendSystemPrompt/skills),
	// 防用户经 user_message 绕过审核向 executor 注入任意目录 / skill。合法 user_message 不带这些键,剥离是 no-op。
	if frameCarriesInjectionSurface(data) {
		slog.Warn("agentbridge hub: stripped injection surface from user_message",
			"feature", f.spec.Key, "session_id", h.sessionID)
		data = stripInjectionSurface(data)
	}
	content, _ := extractUserMessageContent(data)
	// clientTurnId 提前抽取:除影子日志幂等键外,还用于向发送端回投递确认(user_ack)。
	clientTurnID := extractClientTurnID(data)

	// echoText 保留注入前原文 —— 其它端的 user_echo 气泡不显示容器绝对路径。
	// (附件折叠 foldUserAttachments 已下移到配额校验之后,见下方「跨会话附件物化」一段。)
	echoText := content

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
			errFrame := map[string]any{
				"type":      "error",
				"code":      classifyPreUserMessageError(err),
				"message":   preUserMessageUserText(err),
				"retryable": !errors.Is(err, ErrQuotaExceeded),
			}
			// 冻结契约:quota_exceeded 帧带结构化 quota 对象
			// ({reset_at, window_days, credit_balance_positive, credit_autopay}),
			// 前端 QuotaNotifier 据此渲染「等待重置 / 重置次数 / 升级 / 用经费继续」。
			if q, ok := quotaFramePayload(err); ok {
				errFrame["quota"] = q
			}
			frame, _ := json.Marshal(errFrame)
			// 2026-07-31 线上审计 §五:拦截落 journal(agent_turns status=blocked / kind=quota +
			// EvQuotaBlocked 事件,payload 就是这一帧),让「配额墙 → 付费」漏斗可 SQL 复盘,不再
			// 依赖会被轮转掉的 INFO 日志。异步 + 失败只告警,绝不阻断拦截;读侧过滤保证不进前端回放。
			f.bridge.turns.RecordBlocked(TurnInput{
				AgentSessionID: h.sessionID, FeatureKey: f.spec.Key, UserID: h.userID,
				ClientTurnID: clientTurnID, RoleUserText: content,
				Kind: blockedTurnKind(err),
			}, data, frame)
			s.sendSelf(frame)
			return
		}
	}

	// ── 跨会话附件物化(2026-07-31 线上审计 §五)+ 附件折叠(2026-07-14)──────────────
	// 顺序是硬要求:①配额校验已在上面通过 —— 不为一条注定被拒的消息白拷几十 MB;
	// ②物化必须早于 foldUserAttachments —— 折叠会把 attachments[].path 写进 content 的
	// @"path" 前缀,折完再改路径就来不及了。
	// workDir 必须与 decidePermission 传给 pathWithin 的是**同一个字符串**:两者不同源
	// 就会重现「批了却打不开」。
	if f.spec.AttachmentRelocator != nil {
		if paths := extractUserMessageAttachmentPaths(data); len(paths) > 0 {
			workDir := path.Join(agentSessionWorkdirRoot(), h.sessionID)
			localPaths, aerr := f.spec.AttachmentRelocator.EnsureLocal(
				h.hookCtx, h.userID, h.sessionID, workDir, paths)
			if aerr != nil {
				// 失败必须用户可见:绝不静默 complete 让模型对着读不到的文件道歉(线上原症状)。
				// 不 beginTurn、不计额度、不转发。用户文案由实现方给(鸭子类型,不 import agentattach)。
				msg := "附件暂时不可用,请在当前对话重新上传后再试。"
				if ue, ok := aerr.(interface{ UserMessage() string }); ok && ue.UserMessage() != "" {
					msg = ue.UserMessage()
				}
				slog.Warn("agentbridge hub: attachment relocate failed, turn rejected",
					"feature", f.spec.Key, "session_id", h.sessionID, "user_id", h.userID, "err", aerr)
				frame, _ := json.Marshal(map[string]any{
					"type": "error", "code": "attachment_unavailable",
					"message": msg, "retryable": false,
				})
				s.sendSelf(frame)
				return
			}
			if newData, ok := rewriteUserMessageAttachmentPaths(data, localPaths); ok {
				data = newData
			}
		}
	}
	if newData, newContent, folded := foldUserAttachments(data); folded {
		data, content = newData, newContent
	}

	// 回答中锁住:一轮进行中 → 拒绝再发(竞态兜底,前端忙态本已置灰)。
	// beginTurn 记 echoText(注入前原文):它只喂 user_echo/迟到补帧,别把 @"path" 泄进其它端气泡。
	if !h.beginTurn(echoText, clientTurnID) {
		s.sendSelf(busyFrame())
		return
	}
	// 逐帧硬闸:在 beginTurn 之后、锁外 arm(provider 要读 Redis 窗口 + DB 钱包,不能在 h.mu 内做)。
	h.armTurnCostCap()

	// P0 影子日志:turn 账本 + user_message 事件落库(幂等于 clientTurnId)。同步一行 INSERT,
	// 失败只 warn、绝不影响 live(jsonl + 内存 hub 仍权威)。用原文 content(注入前)。
	if f.bridge.turns != nil {
		shadowTurnID := clientTurnID
		if shadowTurnID == "" {
			shadowTurnID = uuid.NewString() // 旧客户端不带 → mint,唯一键永不撞(= 今天无跨重连去重的行为)
		}
		res, terr := f.bridge.turns.BeginTurn(h.hookCtx, TurnInput{
			AgentSessionID: h.sessionID, FeatureKey: f.spec.Key, UserID: h.userID,
			ClientTurnID: shadowTurnID, RoleUserText: content, UserPayload: append([]byte(nil), data...),
		})
		if terr != nil {
			// 留痕与计数在 TurnCoordinator.BeginTurn 里(JOURNAL_TURN_LOST + journalTurnLossCnt)——
			// 那里有完整 TurnInput 上下文,这里不重复打一条。此处唯一要保证的是 live 照常:
			// currentTurnID 保持 0,后续 tee 全部跳过,用户侧的这一轮完全正常地跑完。
			_ = terr
		} else if res.AlreadySeen {
			h.endTurn() // 浏览器重发同 clientTurnId → 释放刚开的内存轮、丢帧、不转 agent
			// 先前那条其实已送达(幂等命中)→ 当成功回 ack,撤掉发送端的未送达看门狗;不重转 agent。
			s.sendSelf(userAckFrame(clientTurnID))
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

	// 轮级 provider 故障转移的重投素材(2026-07-31 线上审计 §五):存**盖预算之前**的字节 ——
	// 重投时模型可能已换,预算要按新模型的成本/token 重算再盖(见 stampTurnBudget)。
	sessModel, _ := h.currentModelSnapshot()
	h.mu.Lock()
	h.inFlightAgentFrame = data
	h.mu.Unlock()

	data = h.stampTurnBudget(data, sessModel)

	if err := h.writeAgent(gorillaws.TextMessage, data); err != nil {
		slog.Debug("agentbridge hub: agent write end (user_message)", "feature", f.spec.Key, "err", err)
		h.endTurn()
		// 明确回终帧而非静默丢弃(线上事故修复):旧行为让发送端这轮永无终帧 → busy 永久卡死。
		// error 终帧被 fold 收口该轮,用户可见「AI 服务暂时不可用,消息没有发出」。
		s.sendSelf(agentUnavailableFrame())
		return
	}
	// 投递确认:消息已写入上游。前端据此撤销「未送达看门狗」;半死 TCP / 静默丢弃场景等不到 ack
	// → 前端把该条转成「未发送·一键重发」并解锁 busy(幽灵轮闭环)。旧客户端不带 clientTurnId
	// 时回空 id,前端按 id 匹配不上则忽略,无副作用。
	s.sendSelf(userAckFrame(clientTurnID))
	if didInject {
		h.pendingMark.Store(true)
	}
	// 回声:让其他端也渲染这句用户消息(agent 不回吐用户消息)。用 echoText(fold 前的干净原文)——
	// content 已被 foldUserAttachments 折进 @"/绝对路径" 前缀,直接回声会把容器路径泄进他端气泡;且前端
	// user_echo 处理(useClawConversation)按「不含前缀」直接当正文渲染,不解析。与 beginTurn(echoText) 的
	// 迟到补帧路径对齐,两条回声都用干净原文(附件 chip 由刷新后的历史回放 parseUserEntryWithAttachments 补出)。
	h.echoToOthers(userEchoFrame(echoText, clientTurnID), s)
}

// signalQuit 只关 quit、不关 conn:writeLoop 收到后带写超时排空剩余帧再自行 close()。
// shutdown 用它替代硬关,保证刚入队的合成终帧能送达浏览器(丢终帧 = 前端 busy 永久卡死)。
func (s *subscriber) signalQuit() {
	s.quitMu.Do(func() { close(s.quit) })
}

func (s *subscriber) close() {
	s.signalQuit()
	s.closeMu.Do(func() {
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

// coalesceReplay 把相邻的同类 content_delta 合并进 replayBuf,使其大小退回 O(内容块) 而非 O(token),
// 让迟到续流补帧有界。文本流与工具入参流(toolInput)各自同类合并,不互并(2026-07 前 toolInput
// 逐帧堆积不合并,长 Write 会把 replayCap=248 的窗口刷穿 —— 已修)。
func coalesceReplay(buf [][]byte, frame []byte) [][]byte {
	if txt, ok := contentDeltaText(frame); ok {
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
	if ti, tp, ok := contentDeltaToolInput(frame); ok {
		if n := len(buf); n > 0 {
			if lti, ltp, lok := contentDeltaToolInput(buf[n-1]); lok {
				path := ltp
				if path == "" {
					path = tp // toolPath 可能迟到:取任一非空(与前端 appendStreamMessage 同语义)
				}
				m := map[string]string{"type": "content_delta", "toolInput": lti + ti}
				if path != "" {
					m["toolPath"] = path
				}
				if merged, err := json.Marshal(m); err == nil {
					buf[n-1] = merged
					return buf
				}
			}
		}
		return append(buf, frame)
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

// contentDeltaToolInput 返回 (toolInput, toolPath, true) 仅当该帧是带 toolInput、不带 text 的 content_delta。
func contentDeltaToolInput(frame []byte) (string, string, bool) {
	if len(frame) == 0 || frame[0] != '{' {
		return "", "", false
	}
	var p struct {
		Type      string  `json:"type"`
		Text      *string `json:"text"`
		ToolInput *string `json:"toolInput"`
		ToolPath  string  `json:"toolPath"`
	}
	if err := json.Unmarshal(frame, &p); err != nil {
		return "", "", false
	}
	if p.Type != "content_delta" || p.ToolInput == nil || p.Text != nil {
		return "", "", false
	}
	return *p.ToolInput, p.ToolPath, true
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
	case "round_discarded":
		// DSML 作废重打标记:入 journal,回放时 FoldToMessages 据此丢弃本轮在途残缺前缀(审计 [10])。
		return EvRoundDiscarded, true
	case "research_state", "evidence_appended":
		// 证据账本过程状态(2026-08 证据账本 P0-c):引擎口径的检索次数 / 账本条数 / 来源构成。
		// 入 journal 拿指标(V8:ledger_total 与 origin 分布今天完全不可见)+ 给 seed_history 的
		// research 字段供一张最新快照 + 让 FoldToMessages 折出带外 entry 还原历史轮的过程 chip
		// (只认 research_state 快照;它不进模型上下文,见 EvEvidence 注释)。
		return EvEvidence, true
	case "error":
		return EvError, true
	default:
		return "", false
	}
}
