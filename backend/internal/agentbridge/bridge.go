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
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/agent"
	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/llmusage"
	"scholar-backend/internal/usermemory"
)

// ghostCleanupDelay 是 reset 流程中 "二次 DELETE" 的等待时间。
// 背景见 smartsearch v1 的同名常量: scholar_agent 在 WS 流结束后会异步把 last-prompt
// flush 回 jsonl, 第一次 DELETE 可能赶不上; 等 ~250ms 再删一次能擦掉 cache 残骸。
const ghostCleanupDelay = 250 * time.Millisecond

// Bridge 是 agent 桥接的总入口, 持有 agent HTTP 客户端 + 通用 repository。
//
// 实例由 bootstrap 构造一份, 跨 feature 共享; feature 通过 Bridge.For(spec) 拿到
// 与自己 feature 绑定的 FeatureBridge。
type Bridge struct {
	client *agent.Client
	repo   *Repository

	// activeWSConns 跟踪每个 (user, feature) 当前活跃的 WS 连接, 用于"多窗口接管"
	// 体验: 新窗口建 WS 时, 先把老 WS 发一帧 displaced 通知再 Close, 让前端 banner
	// 提示用户"此会话已在其他窗口打开"。
	//
	// key 形如 "claw:<agentSessionId>"; value 是 *displacedConn。同 (feature, **session**)
	// 永远只保留一条 active 记录 —— 按 session 而非 user,故不同会话/项目可并存(见 displacementKey)。
	//
	// 注意: 这是 process-local 状态, 多实例部署时只在同一实例命中。这是 by design —
	// 方案 A 是 "best-effort 提示, 不是强互斥"; 跨实例真互斥需 Redis 锁 (方案 B,
	// 暂不实施)。生产用单实例 backend 时此实现等效真互斥。
	activeWSConns sync.Map

	// llmRec 统一 LLM token 账本录入器 (允许 nil = 不记账)。
	// **带内**落账本路径(ws.go pipe):agent 把 per-call 明细 + 会话累计随 message_complete /
	// token_usage 帧经已鉴权 WS 带回, pipe 用 accrueTurnUsage 按水位算增量 → recordAgentTokens。
	// 归属(user/feature)来自已鉴权会话本身, 不反查; 不再走独立 HTTP 旁路(那条因子进程里
	// ANTHROPIC_API_KEY 被 provider 覆盖而鉴权失败、且 fire-and-forget 易丢, 已删除)。
	// server-side peerreview 的 token 同样靠 agent per-call → 此 WS 路(经其会话)记账。
	llmRec llmusage.Recorder

	// memSvc per-user 长期记忆服务 (允许 nil = 不启用记忆)。所有 feature 共享同一份用户记忆:
	// 读(注入)经 MemoryBlocks;写(后台抽取)经 triggerMemoryExtract(WS message_complete 触发)。
	memSvc *usermemory.Service

	// tokenWatermarks: 每个 agent session 已记账的「会话累计 token 水位」(4 元组
	// [input, output, cacheRead, cacheCreation])。带内 token 账本据此**只记累计相对水位的增量** ——
	// 既自愈丢帧(丢的那轮由下一轮累计差额补回), 又防重连重发旧帧时双计。
	// process-local:重连复用同一 sessionID 的水位(不双计);进程重启丢失 → 跨重启的在途会话
	// 首帧会按全量累计重记一次(罕见、有界,对 best-effort 账本可接受)。key=agentSessionID(string),
	// value=[4]int64。session reset 会换新 agentSessionID(旧条目自然作废、新条目从 0 起算)。
	tokenWatermarks sync.Map

	// watermarkMu 串行化 accrueTurnUsage 的「读-改-写」水位(sync.Map 单次 Load/Store 原子,
	// 但 RMW 不原子)。WS pipe 路每会话单 goroutine 本就串行;server-side(peerreview)并行
	// reviewer 可能共享同一会话并发记账 → 全局粗锁兜底。accrueTurnUsage 纯内存、微秒级、低频,
	// 全局锁争用可忽略。
	watermarkMu sync.Mutex
}

// loadTokenWatermark 取某 agent session 的已记账累计水位(缺省全 0)。
func (b *Bridge) loadTokenWatermark(sessionID string) [4]int64 {
	if v, ok := b.tokenWatermarks.Load(sessionID); ok {
		if wm, ok2 := v.([4]int64); ok2 {
			return wm
		}
	}
	return [4]int64{}
}

// storeTokenWatermark 推进某 agent session 的累计水位。
func (b *Bridge) storeTokenWatermark(sessionID string, wm [4]int64) {
	b.tokenWatermarks.Store(sessionID, wm)
}

// deleteTokenWatermark 会话删除时清理水位条目(防 process-local map 无界增长)。
func (b *Bridge) deleteTokenWatermark(sessionID string) {
	b.tokenWatermarks.Delete(sessionID)
}

// accrueTurnUsage 按「会话累计水位」算出本轮要落账本的行(per-call 明细 + 必要时一行对账补差),
// 并就地推进水位。纯内存、与 pipe 读循环同一 goroutine 串行执行(保证水位读改写原子、幂等);
// 真正落库(含 Redis 日配额累加)由调用方异步做,不阻塞帧转发。
//
//   - sessionTotal==nil(老 agent 不带累计字段)→ 返回 nil:无水位锚点,裸记会双计,宁可不记。
//   - 任一累计分量回退 = CLI 子进程重启(全局计数器清零)→ 水位归零重算。
//   - 累计无进展(重连重发旧帧 / 空轮)→ 返回 nil:幂等跳过,不双计。
//   - per-call 明细之和 < 累计增量(此前丢过帧)→ 追加一行差额(model="(reconciled)"),
//     保证账本总额 == 会话累计、日配额不少算(自愈)。
func (b *Bridge) accrueTurnUsage(sessionID string, turnUsage AgentUsage, calls []AgentUsage, sessionTotal *AgentUsage) []AgentUsage {
	if sessionTotal == nil {
		return nil
	}
	b.watermarkMu.Lock()
	defer b.watermarkMu.Unlock()
	cur := [4]int64{
		int64(sessionTotal.InputTokens), int64(sessionTotal.OutputTokens),
		int64(sessionTotal.CacheReadTokens), int64(sessionTotal.CacheCreationTokens),
	}
	wm := b.loadTokenWatermark(sessionID)
	if cur[0] < wm[0] || cur[1] < wm[1] || cur[2] < wm[2] || cur[3] < wm[3] {
		wm = [4]int64{} // CLI 重启 → 累计清零, 从 0 起算
	}
	delta := [4]int64{cur[0] - wm[0], cur[1] - wm[1], cur[2] - wm[2], cur[3] - wm[3]}
	if delta[0] <= 0 && delta[1] <= 0 && delta[2] <= 0 && delta[3] <= 0 {
		return nil // 无进展 → 幂等跳过
	}
	b.storeTokenWatermark(sessionID, cur)

	var rows []AgentUsage
	var sum [4]int64
	for _, c := range calls {
		ci := [4]int64{int64(c.InputTokens), int64(c.OutputTokens), int64(c.CacheReadTokens), int64(c.CacheCreationTokens)}
		if ci[0] <= 0 && ci[1] <= 0 && ci[2] <= 0 && ci[3] <= 0 {
			continue
		}
		rows = append(rows, c)
		sum[0] += ci[0]
		sum[1] += ci[1]
		sum[2] += ci[2]
		sum[3] += ci[3]
	}
	rd := [4]int64{nonNegInt64(delta[0] - sum[0]), nonNegInt64(delta[1] - sum[1]), nonNegInt64(delta[2] - sum[2]), nonNegInt64(delta[3] - sum[3])}
	if rd[0] > 0 || rd[1] > 0 || rd[2] > 0 || rd[3] > 0 {
		model := "(reconciled)"
		if len(rows) == 0 && turnUsage.Model != "" {
			model = turnUsage.Model // 无 per-call 明细(老 agent / 空 calls)→ 用本轮模型标注差额行
		}
		rows = append(rows, AgentUsage{
			Model:               model,
			InputTokens:         int(rd[0]),
			OutputTokens:        int(rd[1]),
			CacheReadTokens:     int(rd[2]),
			CacheCreationTokens: int(rd[3]),
		})
	}
	return rows
}

func nonNegInt64(x int64) int64 {
	if x < 0 {
		return 0
	}
	return x
}

// New 装配 Bridge。client 由 agent.LoadFromEnv() 构造, repo 由 NewRepository(db) 构造。
func New(client *agent.Client, repo *Repository) *Bridge {
	return &Bridge{client: client, repo: repo}
}

// SetLLMUsageRecorder 注入统一 LLM token 账本录入器 (server-side chat 用)。
// bootstrap 调用一次; nil = 不记账。
func (b *Bridge) SetLLMUsageRecorder(r llmusage.Recorder) {
	b.llmRec = r
}

// SetMemoryService 注入 per-user 长期记忆服务 (bootstrap 调用一次; nil = 不启用记忆)。
func (b *Bridge) SetMemoryService(s *usermemory.Service) {
	b.memSvc = s
}

// MemoryBlocks 返回某用户的记忆块渲染文本 (bullet 列表, 无记忆/未启用返回 "")。
// 供注入路径用:WS 首条消息前缀 (ws.go) 与 peerreview prompt (service.go) 各自包 frame。
func (b *Bridge) MemoryBlocks(userID uint) string {
	if b.memSvc == nil {
		return ""
	}
	return b.memSvc.RenderBlocks(userID)
}

// triggerMemoryExtract 在一轮对话结束后异步从最近对话抽取用户持久信息更新记忆。
// 绝不内联热路径 (safego 异步);限流闸 ShouldExtract 控成本。仅 WS 对话 feature 调用
// (peerreview 是审稿不学用户画像, 只读注入不写)。
func (b *Bridge) triggerMemoryExtract(userID uint, sessionID string) {
	if b.memSvc == nil || userID == 0 || sessionID == "" {
		return
	}
	safego.Go("usermemory-extract", func() {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		if !b.memSvc.ShouldExtract(ctx, userID) {
			return // 冷却中, 跳过
		}
		resp, err := b.client.GetSessionMessages(ctx, sessionID, 3) // 最近 3 个用户轮足够抽画像
		if err != nil || resp == nil {
			return
		}
		transcript := flattenTranscript(resp.Messages)
		b.memSvc.Extract(ctx, userID, transcript)
	})
}

// flattenTranscript 把 agent 会话消息压成纯文本 (user/assistant 文本), 供抽取用。
// 跳过 sidechain (子 agent) 与工具块;剥掉 backend 注入的 STRICT RULES/记忆前缀。
func flattenTranscript(msgs []agent.SessionMessage) string {
	var sb strings.Builder
	for _, m := range msgs {
		if m.IsSidechain {
			continue
		}
		if m.Type != "user" && m.Type != "assistant" {
			continue
		}
		text := extractMessageText(m.Content)
		if m.Type == "user" {
			text = stripInjectionPrefix(text)
		}
		text = strings.TrimSpace(text)
		if text == "" {
			continue
		}
		sb.WriteString(m.Type)
		sb.WriteString(": ")
		sb.WriteString(text)
		sb.WriteString("\n")
	}
	return sb.String()
}

// extractMessageText 从 agent content (string 或 Anthropic content[] blocks) 抠出文本。
func extractMessageText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var blocks []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal(raw, &blocks); err == nil {
		var sb strings.Builder
		for _, bl := range blocks {
			if bl.Type == "text" && bl.Text != "" {
				sb.WriteString(bl.Text)
				sb.WriteString(" ")
			}
		}
		return sb.String()
	}
	return ""
}

// injectionHeader / injectionMarker —— 与 ws.go buildInjectionPrefix 对齐。
const injectionHeader = "[AGENT BRIDGE — STRICT RULES"
const injectionMarker = "以下是用户的请求:\n"

// stripInjectionPrefix 去掉 backend 注入的「[AGENT BRIDGE — STRICT RULES…] … 以下是用户的请求:\n」
// 前缀, 还原用户真实输入。**只在文本确实以注入头开头时才剥**, 避免误伤用户自己输入里
// 恰好含 marker 的内容。用于:(1) 记忆抽取只看真实输入;(2) 历史消息回前端时隐藏系统规则。
func stripInjectionPrefix(s string) string {
	if !strings.HasPrefix(s, injectionHeader) {
		return s
	}
	if idx := strings.LastIndex(s, injectionMarker); idx >= 0 {
		return s[idx+len(injectionMarker):]
	}
	return s
}

// stripInjectionFromMessages 把发给前端的历史里、被后端注入到首条 user_message 的系统规则/
// 记忆前缀去掉(系统级提示词不该展示给用户)。只动 user 文本块,assistant/工具块不碰。
// 兼容存量数据:历史会话的首条 user 早已把前缀落进 jsonl,这里在出口统一隐藏。
func stripInjectionFromMessages(msgs []agent.SessionMessage) {
	for i := range msgs {
		if msgs[i].Type != "user" {
			continue
		}
		if stripped, changed := stripInjectionInContent(msgs[i].Content); changed {
			msgs[i].Content = stripped
		}
	}
}

// stripInjectionInContent 处理 agent content(string 或 Anthropic content[] blocks),
// 把其中 text 的注入前缀剥掉。返回 (新内容, 是否变更)。
func stripInjectionInContent(raw json.RawMessage) (json.RawMessage, bool) {
	if len(raw) == 0 {
		return raw, false
	}
	// string 形态
	var s string
	if json.Unmarshal(raw, &s) == nil {
		ns := stripInjectionPrefix(s)
		if ns == s {
			return raw, false
		}
		if b, err := json.Marshal(ns); err == nil {
			return b, true
		}
		return raw, false
	}
	// content[] blocks 形态
	var blocks []map[string]any
	if json.Unmarshal(raw, &blocks) == nil {
		changed := false
		for _, bl := range blocks {
			if bl["type"] != "text" {
				continue
			}
			if t, ok := bl["text"].(string); ok {
				if nt := stripInjectionPrefix(t); nt != t {
					bl["text"] = nt
					changed = true
				}
			}
		}
		if changed {
			if b, err := json.Marshal(blocks); err == nil {
				return b, true
			}
		}
	}
	return raw, false
}

// displacementKey 拼 activeWSConns 的 key, 按 (feature, **agent session**) 寻址。
//
// ⚠️ 关键:按 session 而非 user。displacement 要防的是"**同一个 agent session 被两条 WS
// 同时驱动**"(jsonl 双写损坏)。但 claw 多会话、prism 多项目下,同一用户在两个 tab 打开
// **不同**会话/项目本就该并存 —— 按 user 寻址会把它们也误判成"接管",弹出 displaced banner
// (用户反馈的"不是并发也会出现")。session_id 全局唯一,feature 前缀仅作命名空间清晰。
// smart-search 是用户级单会话,两个 tab 拿到同一 session_id,按 session 仍正确互斥。
func displacementKey(featureKey, sessionID string) string {
	return featureKey + ":" + sessionID
}

// registerAndDisplaceOldWS 把新 WS 注册进 activeWSConns, 并把同 key (= 同一 agent session)
// 的旧 WS (如有) 发 displaced 帧后 Close。返回一个 cleanup 函数, caller 必须 defer 调用
// (在 WS pipe 退出后) 把自己从 map 摘掉。
//
// 注意: 摘掉只会摘"还是我"的情况; 如果中途又有更新的 WS 把我替换了, 不会误删。
func (b *Bridge) registerAndDisplaceOldWS(featureKey, sessionID string, newConn *displacedConn) func() {
	key := displacementKey(featureKey, sessionID)
	if prev, loaded := b.activeWSConns.Swap(key, newConn); loaded {
		if old, ok := prev.(*displacedConn); ok {
			// 异步 displace, 不阻塞新 WS 建联流程。失败也只是老 WS 没收到通知,
			// 不影响新 WS 工作 — 老 WS 下一次 read deadline 到了会自然超时退出。
			safego.Go("agentbridge-ws-displace:"+featureKey, old.displace)
		}
	}
	// 跨实例接管 (C2): 本地 Swap 之后广播给其它副本 —— 若别的实例也持有同一 session 的活跃 WS,
	// 它的订阅 goroutine 会把那条旧 WS displace 掉, 避免两实例同时驱动一个 agent session (jsonl 双写)。
	// best-effort: Redis 挂只是退化到纯本地 displacement; 异步发, 不阻塞建连。
	safego.Go("agentbridge-ws-displace-publish:"+featureKey, func() {
		pubCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		b.publishDisplace(pubCtx, key)
	})
	return func() {
		b.activeWSConns.CompareAndDelete(key, newConn)
	}
}

// For 返回一个绑定到指定 FeatureSpec 的视图。
// FeatureBridge 是值类型, 内部持有指针, 复制开销可忽略 (可以放心传值)。
func (b *Bridge) For(spec FeatureSpec) *FeatureBridge {
	return &FeatureBridge{bridge: b, spec: spec}
}

// Client 暴露底层 agent.Client, 适用于 bootstrap 阶段需要直接对接的极少数场景
// (例如 UpsertSkill / Health)。业务侧不应直接持有它, 走 FeatureBridge 即可。
func (b *Bridge) Client() *agent.Client { return b.client }

// FeatureBridge 是绑定某个 FeatureSpec 后的 bridge 视图。所有方法都自动用 spec.Key
// 做 (user, feature) 寻址, feature 模块零样板。
type FeatureBridge struct {
	bridge *Bridge
	spec   FeatureSpec
}

// Spec 返回绑定的 FeatureSpec (WS bridge 内部要用; feature 模块通常用不到)。
func (f *FeatureBridge) Spec() FeatureSpec { return f.spec }

// AgentClient 暴露底层 agent.Client, 适用于 feature 在 server 端自驱动
// (POST chat → poll status → fetch messages) 的场景, 例如 peer review 的
// 后台 4 轮串行编排。普通对话场景应该走 WebSocket 桥接, 不需要直接持有 client。
//
// 成果交付 (C13): 「agent 把成品写进会话 ./out/ → 后端收割落 MinIO → 交给 web 用户下载」
// 这套能力**不是** bridge 的内建方法, 而是各 feature 组合 AgentClient()(读 workspace)+
// internal/agentartifact(MinIO 元数据, 契约见 agentartifact.Delivery)实现的。目前唯一实现
// 是 claw(internal/claw/artifact*.go);未来 feature 想要交付物时, 复用 agentartifact.Repository
// + 抄 claw 的 harvest/serve 端点即可, 无需在 bridge 加新方法(避免把 claw-specific 的 ./out
// 约定为单一消费者上升为一等公民, 见 agentartifact/delivery.go 的诚实评估)。
func (f *FeatureBridge) AgentClient() *agent.Client { return f.bridge.client }

// Bridge 暴露父 Bridge, 让 feature 可以调用 ServerSideChat 等 backend-driven 方法。
func (f *FeatureBridge) Bridge() *Bridge { return f.bridge }

// BindOwnerSession — 实体级会话「双写」: feature (prism/peerreview) 把 agent_session_id
// 写进自己业务表后, 再调这个把同一映射写进统一归属表 agent_sessions
// (owner_kind=project/submission, owner_id=实体主键)。
//
// 按 (owner_kind, owner_id) upsert (见 repo.UpsertByOwnerEntity): churn 时同行换
// session_id, 不留孤儿不破唯一键。写进归属表后, 标准 OwnsSession / IssueWSTicket 即可
// 覆盖该 feature, 无需各自的 Trusted 后门。best-effort 语义由 caller 决定 (建议
// 记 warn 不阻断主流程, 漏写由阶段2 对账 SQL 兜底)。
func (f *FeatureBridge) BindOwnerSession(userID uint, ownerKind string, ownerID uint64, agentSessionID string) error {
	return f.bridge.repo.UpsertByOwnerEntity(userID, f.spec.Key, ownerKind, ownerID, agentSessionID)
}

// UnbindOwnerSession — 实体被删除时清掉归属表里对应行 (按 owner 删), 避免悬空映射。
// best-effort: 删失败不致命 (孤儿行无害, agent_session_id 全局唯一不会被复用)。
func (f *FeatureBridge) UnbindOwnerSession(ownerKind string, ownerID uint64) error {
	return f.bridge.repo.DeleteByOwner(ownerKind, ownerID)
}

// SessionMessagesResult 是 GetSessionMessages 的返回包装, 把 sessionId 一并带回,
// 让前端拿一份 payload 就能既建 WS 又渲染历史。
//
// 分页 (limitTurns>0 时): Messages 只含最近 limitTurns 个"用户轮", TotalTurns 是全部轮数,
// HasMore 表示还有更早的轮没返回 (前端据此显示"加载更早")。超长会话靠这个避免一次性把
// 上万轮 transcript 全量推给浏览器解析/渲染。
type SessionMessagesResult struct {
	SessionID  string                 `json:"sessionId"`
	Messages   []agent.SessionMessage `json:"messages"`
	TotalTurns int                    `json:"totalTurns"`
	HasMore    bool                   `json:"hasMore"`
}

// sliceRecentTurns 取 msgs 末尾、覆盖最近 limitTurns 个"用户轮"的子切片, 返回 (切片, 总轮数, 是否还有更早)。
// 轮边界 = type=="user" 的 entry —— agent 已把带 tool_result 的 user entry 归类为 "tool_result"
// (见 sessionService.entryToMessage), 所以 type=="user" 必是真实用户提问起点, 不会切在轮中间。
// limitTurns<=0 或总轮数不超过 limit → 原样返回, hasMore=false。
func sliceRecentTurns(msgs []agent.SessionMessage, limitTurns int) ([]agent.SessionMessage, int, bool) {
	starts := make([]int, 0, 32)
	for i := range msgs {
		if msgs[i].Type == "user" {
			starts = append(starts, i)
		}
	}
	total := len(starts)
	if limitTurns <= 0 || total <= limitTurns {
		return msgs, total, false
	}
	startIdx := starts[total-limitTurns]
	return msgs[startIdx:], total, true
}

// sliceWithAgentMeta 本地切片兜底 + 采用 agent 服务端切片元数据。
// 新版 agent 已按 limitTurns 服务端切好并带回 totalTurns(全量轮数): 本地 sliceRecentTurns
// 对已切片结果幂等 no-op, 但 total/hasMore 必须用 agent 的全量轮数纠正(本地只看得到切片后的)。
// 旧版 agent (TotalTurns=nil) 返回全量, 本地切片照常生效, 行为与历史一致。
func sliceWithAgentMeta(resp *agent.SessionMessagesResponse, limitTurns int) ([]agent.SessionMessage, int, bool) {
	sliced, total, hasMore := sliceRecentTurns(resp.Messages, limitTurns)
	if resp.TotalTurns != nil {
		total = *resp.TotalTurns
		hasMore = limitTurns > 0 && total > limitTurns
	}
	return sliced, total, hasMore
}

// GetOrCreateSession 进入 feature 页时调 — 拿当前 (user, feature) 的 agent_session_id,
// 没有就新建并写库。
//
// 如果 DB 里有 mapping 但 agent 端 jsonl 已经被运维或清理掉, 后续接口 (GetSessionMessages
// / GetContextEstimate / WS dial) 会在拿到 404 时显式 recreate 自愈, 避免本接口
// 多发一次往返做探活。
func (f *FeatureBridge) GetOrCreateSession(ctx context.Context, userID uint) (string, error) {
	row, err := f.bridge.repo.Get(userID, f.spec.Key)
	switch {
	case err == nil:
		return row.AgentSessionID, nil
	case errors.Is(err, ErrNotFound):
		return f.createAndPersist(ctx, userID)
	default:
		return "", fmt.Errorf("get session mapping: %w", err)
	}
}

// GetSessionID 只读当前 (user, feature) 的 agent session id;不存在返回 ""(**绝不创建**)。
// 用于「重置前先拿旧 sid 去清理交付物」这类场景 —— 不能像 GetOrCreateSession 那样误建空会话。
func (f *FeatureBridge) GetSessionID(userID uint) (string, error) {
	row, err := f.bridge.repo.Get(userID, f.spec.Key)
	switch {
	case err == nil:
		return row.AgentSessionID, nil
	case errors.Is(err, ErrNotFound):
		return "", nil
	default:
		return "", fmt.Errorf("get session mapping: %w", err)
	}
}

// ResetSession 删旧 + 建新 + 改 DB。旧 sessionId 在 agent 端 404 视为已删, 不算错。
// 顺序: 先建新 → 改 DB → (DB 失败则回滚新建) → 删旧 → 异步 ghost cleanup。
// 这样用户拿到的新 sessionId 永远是可用的, 任何中间失败都不会让 mapping 指向失效行。
func (f *FeatureBridge) ResetSession(ctx context.Context, userID uint) (string, error) {
	row, err := f.bridge.repo.Get(userID, f.spec.Key)
	switch {
	case errors.Is(err, ErrNotFound):
		return f.createAndPersist(ctx, userID)
	case err != nil:
		return "", fmt.Errorf("get session mapping: %w", err)
	}

	oldSessionID := row.AgentSessionID

	opts, delivered := f.buildCreateOptions(ctx, userID)
	created, err := f.bridge.client.CreateSession(ctx, opts)
	if err != nil {
		return "", fmt.Errorf("create new agent session: %w", err)
	}
	newSessionID := created.SessionID

	if err := f.bridge.repo.UpdateSessionID(userID, f.spec.Key, oldSessionID, newSessionID); err != nil {
		slog.Error("agentbridge reset: DB update failed, cleaning up new session",
			"feature", f.spec.Key, "user_id", userID,
			"new_session_id", newSessionID, "err", err)
		if delErr := f.bridge.client.DeleteSession(ctx, newSessionID); delErr != nil {
			slog.Warn("agentbridge reset: cleanup new session also failed",
				"session_id", newSessionID, "err", delErr)
		}
		return "", fmt.Errorf("update session mapping: %w", err)
	}

	if delivered {
		f.markPromptInjectedSync(newSessionID) // 已系统级下发, 抑制 WS in-band 回落
	}

	if oldSessionID != "" {
		f.bridge.deleteTokenWatermark(oldSessionID) // 旧会话的 token 水位作废(新会话从 0 起算)
		slog.Info("agentbridge reset: deleting old session",
			"feature", f.spec.Key, "user_id", userID, "old_session_id", oldSessionID)
		delErr := f.bridge.client.DeleteSession(ctx, oldSessionID)
		switch {
		case delErr == nil:
			slog.Info("agentbridge reset: old session deleted",
				"feature", f.spec.Key, "user_id", userID, "old_session_id", oldSessionID)
		case errors.Is(delErr, agent.ErrSessionNotFound):
			slog.Info("agentbridge reset: old session already gone (404)",
				"feature", f.spec.Key, "user_id", userID, "old_session_id", oldSessionID)
		default:
			slog.Warn("agentbridge reset: delete old session failed (best-effort)",
				"feature", f.spec.Key, "user_id", userID,
				"old_session_id", oldSessionID, "err", delErr)
		}

		// 二次清理: agent 在 WS 关闭后异步 flush 一份 last-prompt cache, 等 ~250ms 再删。
		go f.cleanupGhostCache(oldSessionID, userID)
	}

	slog.Info("agentbridge reset: session swapped",
		"feature", f.spec.Key, "user_id", userID, "old", oldSessionID, "new", newSessionID)
	return newSessionID, nil
}

// GetSessionMessages 拉历史消息; agent 端 404 时清旧 mapping + 重建空 session。
// limitTurns>0 时只返回最近 limitTurns 个用户轮 (分页, 见 sliceRecentTurns)。
func (f *FeatureBridge) GetSessionMessages(ctx context.Context, userID uint, limitTurns int) (*SessionMessagesResult, error) {
	sessionID, err := f.GetOrCreateSession(ctx, userID)
	if err != nil {
		return nil, err
	}
	msgs, err := f.bridge.client.GetSessionMessages(ctx, sessionID, limitTurns)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			newID, createErr := f.recreate(ctx, userID, sessionID)
			if createErr != nil {
				return nil, createErr
			}
			return &SessionMessagesResult{SessionID: newID, Messages: nil}, nil
		}
		return nil, fmt.Errorf("agent get messages: %w", err)
	}
	sliced, total, hasMore := sliceWithAgentMeta(msgs, limitTurns)
	stripInjectionFromMessages(sliced) // 隐藏注入到首条 user 的系统规则/记忆前缀
	return &SessionMessagesResult{SessionID: sessionID, Messages: sliced, TotalTurns: total, HasMore: hasMore}, nil
}

// GetSessionMessagesByID 拉指定 sessionID 的历史 (多会话场景: 用户在侧边栏选了某 session,
// 前端应当显式带 sessionID 而不是依赖 "latest active" 隐式选择, 避免切换中 race)。
//
// 鉴权: 强制 OwnsSession 检查, 防止越权读他人 session。
// agent 端 404: 不自愈、也**绝不删 DB 映射行** —— 返回空历史优雅降级 (见下方说明)。
func (f *FeatureBridge) GetSessionMessagesByID(ctx context.Context, userID uint, sessionID string, limitTurns int) (*SessionMessagesResult, error) {
	owns, err := f.OwnsSession(userID, sessionID)
	if err != nil {
		return nil, fmt.Errorf("ownership check: %w", err)
	}
	if !owns {
		return nil, ErrNotFound
	}
	msgs, err := f.bridge.client.GetSessionMessages(ctx, sessionID, limitTurns)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			// 历史教训(数据丢失 bug): 这里**曾**顺手 DeleteByAgentSessionID "清孤儿"。
			// 但 agent 端 404 不一定是"真不存在" —— 容器重启窗口 / 卷挂载抖动 / jsonl 临时读不到
			// 都可能瞬时 404;一旦误删, claw 是用户级会话(无业务源表), 无法经 ReconcileOwnerSessions
			// 重建 → 该会话从侧边栏**永久消失、退登也回不来**(真·数据丢失)。
			// 改为非破坏性优雅降级: 保留 DB 行, 返回空历史 (对齐 PaginateSessionMessages 的 prism 路径)。
			// 会话仍留在列表里; 内容真没了用户可自行删除; 瞬时故障下次重拉即恢复。
			return &SessionMessagesResult{SessionID: sessionID, Messages: nil}, nil
		}
		return nil, fmt.Errorf("agent get messages: %w", err)
	}
	sliced, total, hasMore := sliceWithAgentMeta(msgs, limitTurns)
	stripInjectionFromMessages(sliced) // 隐藏注入前缀
	return &SessionMessagesResult{SessionID: sessionID, Messages: sliced, TotalTurns: total, HasMore: hasMore}, nil
}

// PaginateSessionMessages 拉指定 sessionID 的历史并按 limitTurns 分页(同 sliceRecentTurns),
// **不做 OwnsSession 校验** —— 给「会话归属由 feature 自己业务表确认」的场景用(如 prism 已先
// GetProject(uid) 校验项目归属,不应再耦合到归属表/双写;一次双写漏写不能让历史加载失败)。
//
// agent 端 404(会话被 GC/重启)→ 返回空结果优雅降级(让前端显示空历史,下一轮 feature 自行
// recreate),不报错。sessionID 为空同样返回空结果。
func (f *FeatureBridge) PaginateSessionMessages(ctx context.Context, sessionID string, limitTurns int) (*SessionMessagesResult, error) {
	if sessionID == "" {
		return &SessionMessagesResult{Messages: nil}, nil
	}
	msgs, err := f.bridge.client.GetSessionMessages(ctx, sessionID, limitTurns)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			return &SessionMessagesResult{SessionID: sessionID, Messages: nil}, nil
		}
		return nil, fmt.Errorf("agent get messages: %w", err)
	}
	sliced, total, hasMore := sliceWithAgentMeta(msgs, limitTurns)
	stripInjectionFromMessages(sliced) // 隐藏注入前缀
	return &SessionMessagesResult{SessionID: sessionID, Messages: sliced, TotalTurns: total, HasMore: hasMore}, nil
}

// GetContextEstimate 透传上下文水位; 会话还没说过话时 agent 返回空 contextEstimate,
// 这里以 (nil, sessionID, nil) 返回, 上层渲染成 0/maxTokens。agent 404 时同样自愈。
func (f *FeatureBridge) GetContextEstimate(ctx context.Context, userID uint) (*agent.SessionContextEstimate, string, error) {
	sessionID, err := f.GetOrCreateSession(ctx, userID)
	if err != nil {
		return nil, "", err
	}
	est, err := f.bridge.client.GetSessionContextEstimate(ctx, sessionID)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			newID, createErr := f.recreate(ctx, userID, sessionID)
			if createErr != nil {
				return nil, "", createErr
			}
			return nil, newID, nil
		}
		return nil, sessionID, fmt.Errorf("agent get context estimate: %w", err)
	}
	return est, sessionID, nil
}

// GetContextEstimateByID — 多会话场景: 显式 sessionID 查上下文水位。鉴权同 GetSessionMessagesByID。
func (f *FeatureBridge) GetContextEstimateByID(ctx context.Context, userID uint, sessionID string) (*agent.SessionContextEstimate, error) {
	owns, err := f.OwnsSession(userID, sessionID)
	if err != nil {
		return nil, fmt.Errorf("ownership check: %w", err)
	}
	if !owns {
		return nil, ErrNotFound
	}
	est, err := f.bridge.client.GetSessionContextEstimate(ctx, sessionID)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("agent get context estimate: %w", err)
	}
	return est, nil
}

// SessionAlreadyHasUserMessage 探测 agent transcript 里是否已有过 user entry。
// WS 升级时用于决定要不要注入 system prompt prefix:
//   - 首次开会话 → transcript 空 → false → 注入
//   - 之后刷新/重连 → 已注入过 → true → 跳过 (避免每次都污染 transcript)
//
// 网络失败时返回 (false, err), caller 自行选择: 当前 WS bridge 兜底为"未注入",
// 多注入一次的代价小于完全跳过 (会导致主 agent 退回 Bash/Read 死循环)。
func (f *FeatureBridge) SessionAlreadyHasUserMessage(ctx context.Context, sessionID string) (bool, error) {
	if sessionID == "" {
		return false, nil
	}
	// limitTurns=1: 新版 agent 只返最近一轮 + totalTurns 元数据, 探测从"拉整段 transcript"
	// 降为一轮的传输量; 旧版 agent 忽略参数返回全量, 下面的逐条扫描兜底。
	msgs, err := f.bridge.client.GetSessionMessages(ctx, sessionID, 1)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			return false, nil
		}
		return false, fmt.Errorf("agent get messages: %w", err)
	}
	if msgs.TotalTurns != nil {
		return *msgs.TotalTurns > 0, nil
	}
	for _, m := range msgs.Messages {
		if m.Type == "user" {
			return true, nil
		}
	}
	return false, nil
}

// markPromptInjected 异步把 agent_sessions.prompt_injected 置 1 (migration 0024)。
// 纯优化标记: 置位后, 后续 WS 升级用一次 DB 点查替代全量 transcript 探测
// (SessionAlreadyHasUserMessage)。写失败只意味着下次连接多探测一次, 不影响正确性,
// 故走全局有界 record 池 + Debug 级日志。
func (f *FeatureBridge) markPromptInjected(sessionID string) {
	if sessionID == "" {
		return
	}
	safego.Record("agentbridge-mark-injected:"+f.spec.Key, func() {
		if err := f.bridge.repo.MarkPromptInjected(sessionID); err != nil {
			slog.Debug("agentbridge: mark prompt_injected failed",
				"feature", f.spec.Key, "session_id", sessionID, "err", err)
		}
	})
}

// buildSystemPromptPayload 拼「系统级」附加提示词 = 规则正文 + (可选) 该用户长期记忆。
// 与 ws.go buildInjectionPrefix 的区别: **不带** [AGENT BRIDGE — STRICT RULES] 包裹 marker、
// 也不带「以下是用户的请求:」尾巴 —— 因为它作为真正的 system prompt 下发 (agent appendSystemPrompt),
// 本就在 system 角色里, 无需再向模型声明「这段是规则不是用户输入」(那套 marker 正是 in-band
// 注入的产物, 也正是泄漏给用户看的东西)。记忆段仍保留中文 marker 以界定边界。
// deliveryMode 把 buildCreateOptions 的 delivered 布尔翻成可读的日志值, 方便排查某会话走的是
// 系统级 appendSystemPrompt 还是 in-band 兜底。
func deliveryMode(delivered bool) string {
	if delivered {
		return "system_level_append" // 系统级 appendSystemPrompt
	}
	return "in_band_fallback" // 旧路径: WS 首条消息前缀
}

func buildSystemPromptPayload(systemPrompt, memoryContext string) string {
	payload := systemPrompt
	if strings.TrimSpace(memoryContext) != "" {
		payload += "\n\n[关于这位用户 — 长期记忆, 跨会话持久。据此个性化你的回答; 若与用户当前明确诉求冲突, 以当前诉求为准]\n" +
			memoryContext +
			"[/长期记忆]"
	}
	return payload
}

// buildCreateOptions 构造创建 agent session 的选项:在 feature 静态 SessionOptions 基础上,
// 填入该用户的**系统级**附加提示词 (规则 + 长期记忆),走 agent appendSystemPrompt —— 取代旧的
// 「注入到首条 user_message 前缀」(in-band, 会泄漏给用户)。返回 (opts, deliveredSystemPrompt)。
//
// deliveredSystemPrompt=true 时, 调用方在会话落库后应同步 markPromptInjectedSync, 把
// agent_sessions.prompt_injected 置 1 —— 这样 WS 桥首条消息的 in-band 注入会被抑制, 规则不会
// 被重复注入 (系统级 appendSystemPrompt + in-band 两份)。
//
// 仅对 InjectPromptOnFirstMsg 且配了 Picker 的 feature 生效 (smart_search/claw/prism);
// peerreview 等业务自管 prompt 的 feature 不受影响 (deliveredSystemPrompt=false, 原样行为)。
// Pick 失败时**不阻塞建会话**: 退回 deliveredSystemPrompt=false, WS 首条消息仍走 in-band 兜底。
func (f *FeatureBridge) buildCreateOptions(ctx context.Context, userID uint) (*agent.CreateSessionOptions, bool) {
	base := f.spec.SessionOptions
	if !f.spec.InjectPromptOnFirstMsg || f.spec.Picker == nil {
		return base, false
	}
	choice, err := f.spec.Picker.Pick(ctx, PickInput{UserID: userID})
	if err != nil || choice == nil || choice.SystemPrompt == "" {
		slog.Warn("agentbridge: pick system prompt at create failed, falling back to in-band",
			"feature", f.spec.Key, "user_id", userID, "err", err)
		return base, false
	}
	payload := buildSystemPromptPayload(choice.SystemPrompt, f.bridge.MemoryBlocks(userID))
	// 浅拷贝静态 spec.SessionOptions (它被所有用户复用), 避免把 per-user payload 写进共享对象。
	opts := &agent.CreateSessionOptions{}
	if base != nil {
		clone := *base
		opts = &clone
	}
	opts.AppendSystemPrompt = payload
	return opts, true
}

// markPromptInjectedSync 同步把 prompt_injected 置 1 —— 用在「建会话时已系统级下发 systemPrompt」
// 之后, 必须在用户可能发起 WS 之前生效, 故不能像 markPromptInjected 那样异步 (异步存在
// create→WS 之间的竞态窗口, 会导致 in-band 兜底误触发、规则双注入)。写失败只退化为可能多一次
// in-band 注入 (无害, 会被 strip 隐藏), 故仅告警不阻断。
func (f *FeatureBridge) markPromptInjectedSync(sessionID string) {
	if sessionID == "" {
		return
	}
	if err := f.bridge.repo.MarkPromptInjected(sessionID); err != nil {
		slog.Warn("agentbridge: sync mark prompt_injected failed (in-band may double-inject, harmless)",
			"feature", f.spec.Key, "session_id", sessionID, "err", err)
	}
}

// OwnsSession 校验 sessionId 是否归当前 (user, feature) 所有。
// WS 升级前必须调一次, 防止用户拿到别人的 sessionId 偷拉历史。
//
// 多会话 (claw) 场景下, 同 (user, feature) 可有多行 row, 任一 row 的 agent_session_id
// 命中即视为 ownership 成立。单会话 (smart_search) 场景退化为单行匹配。
func (f *FeatureBridge) OwnsSession(userID uint, sessionID string) (bool, error) {
	if sessionID == "" {
		return false, nil
	}
	row, err := f.bridge.repo.GetByAgentSessionID(userID, f.spec.Key, sessionID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	return row != nil && row.AgentSessionID == sessionID, nil
}

// ─── 多会话 API (claw 用; smart_search 不调这些, 沿用 GetOrCreateSession / ResetSession) ────

// SessionListItem 是 ListSessions 返回的一项 — DB mapping + agent transcript 元数据合并。
//
// Title / MessageCount / ModifiedAt 来自 agent /api/sessions; 若 agent 端找不到此
// sessionId (DB 孤儿) 则字段为零值, caller 仍能看到, 一般会触发"自愈删除孤儿"路径。
type SessionListItem struct {
	SessionID      string    `json:"sessionId"`
	Title          string    `json:"title"`
	MessageCount   int       `json:"messageCount"`
	LastAccessedAt time.Time `json:"lastAccessedAt"`
	CreatedAt      time.Time `json:"createdAt"`
	// agent 端如果探不到 (孤儿), 这两个会是 zero
	AgentCreatedAt  string `json:"agentCreatedAt,omitempty"`
	AgentModifiedAt string `json:"agentModifiedAt,omitempty"`
}

// ListSessions 列出 (user, feature) 下的全部 agent session, 按 last_accessed_at DESC 排序。
//
// 实现: DB.ListByUserFeature → 拿到该用户的 sessionId 集合 → agent.ListSessions
// 拉全量 (含 title/messageCount) → 按 sessionId 做 left-join → 返回。
//
// agent 端不存在的 DB 行 (孤儿) 不会自动清理 — 让 caller 看到 messageCount=0 / title=""
// 的项, 用户可以选择删除。这避免列表查询时偷偷删数据。
func (f *FeatureBridge) ListSessions(ctx context.Context, userID uint) ([]SessionListItem, error) {
	rows, err := f.bridge.repo.ListByUserFeature(userID, f.spec.Key)
	if err != nil {
		return nil, fmt.Errorf("list sessions: %w", err)
	}
	if len(rows) == 0 {
		return []SessionListItem{}, nil
	}

	// 把用户名下的 sessionId 集合传给 agent 做服务端过滤: agent 只 stat/读这些会话的
	// jsonl, 不再拉全平台 top-200 —— 总会话数超 200 后用户旧会话也不会再静默丢元数据。
	// (旧版 agent 忽略 ids 返回全量, 下面按 agentByID map 取交集的逻辑天然兜底。)
	ids := make([]string, 0, len(rows))
	for _, r := range rows {
		if r.AgentSessionID != "" {
			ids = append(ids, r.AgentSessionID)
		}
	}
	agentList, agentErr := f.bridge.client.ListSessions(ctx, ids)
	// agent 拉失败不致命: 仍返 DB 行, title/messageCount 留空
	agentByID := make(map[string]agent.SessionSummary)
	if agentErr == nil && agentList != nil {
		for _, s := range agentList.Sessions {
			agentByID[s.ID] = s
		}
	} else if agentErr != nil {
		slog.Warn("agentbridge ListSessions: agent list failed, returning DB-only view",
			"feature", f.spec.Key, "user_id", userID, "err", agentErr)
	}

	out := make([]SessionListItem, 0, len(rows))
	for _, r := range rows {
		item := SessionListItem{
			SessionID:      r.AgentSessionID,
			LastAccessedAt: r.LastAccessedAt,
			CreatedAt:      r.CreatedAt,
		}
		if meta, ok := agentByID[r.AgentSessionID]; ok {
			item.Title = meta.Title
			item.MessageCount = meta.MessageCount
			item.AgentCreatedAt = meta.CreatedAt
			item.AgentModifiedAt = meta.ModifiedAt
		}
		out = append(out, item)
	}
	return out, nil
}

// CreateNewSession 给 (user, feature) **新建** 一条 session, 不删任何已有 session。
//
// 用法对比:
//   - 单会话 (smart_search): 不调这个; 用 GetOrCreateSession (已有就复用) 或
//     ResetSession (删旧 + 建新)
//   - 多会话 (claw): 用户点"新对话"按钮调这个, 老 session 保留在历史列表中可访问
//
// 返回新建的 agent_session_id; DB mapping 一并写入, last_accessed_at = NOW 让新
// session 自动成为"当前活跃"。
func (f *FeatureBridge) CreateNewSession(ctx context.Context, userID uint) (string, error) {
	opts, delivered := f.buildCreateOptions(ctx, userID)
	created, err := f.bridge.client.CreateSession(ctx, opts)
	if err != nil {
		return "", fmt.Errorf("create agent session: %w", err)
	}
	row := &SessionRow{
		UserID:         userID,
		FeatureKey:     f.spec.Key,
		AgentSessionID: created.SessionID,
		LastAccessedAt: time.Now(),
	}
	if err := f.bridge.repo.Create(row); err != nil {
		// 写 DB 失败 → 回滚 agent 端 session, 避免孤儿
		slog.Error("agentbridge CreateNewSession: DB insert failed, rolling back agent session",
			"feature", f.spec.Key, "user_id", userID, "session_id", created.SessionID, "err", err)
		if delErr := f.bridge.client.DeleteSession(ctx, created.SessionID); delErr != nil {
			slog.Warn("agentbridge CreateNewSession: agent rollback failed", "err", delErr)
		}
		return "", fmt.Errorf("persist session mapping: %w", err)
	}
	if delivered {
		f.markPromptInjectedSync(created.SessionID) // 已系统级下发, 抑制 WS in-band 回落
	}
	slog.Info("agentbridge CreateNewSession: session created",
		"feature", f.spec.Key, "user_id", userID, "session_id", created.SessionID,
		"system_prompt_delivery", deliveryMode(delivered))
	return created.SessionID, nil
}

// RenameSession 改 session 标题 (透传 agent PATCH /api/sessions/:id)。
// 必须先 OwnsSession 鉴权, 防止改别人的 session 标题。
func (f *FeatureBridge) RenameSession(ctx context.Context, userID uint, sessionID, title string) error {
	owns, err := f.OwnsSession(userID, sessionID)
	if err != nil {
		return fmt.Errorf("ownership check: %w", err)
	}
	if !owns {
		return ErrNotFound
	}
	if err := f.bridge.client.PatchSession(ctx, sessionID, title); err != nil {
		return fmt.Errorf("agent rename: %w", err)
	}
	// 改标题也算"活跃" 一次, 让它在列表里前置
	_ = f.bridge.repo.Touch(sessionID)
	return nil
}

// DeleteSessionByID 删除某具体 session (DB 行 + agent jsonl)。
//
// 顺序: 先删 agent (best-effort, 404 ok) → 再删 DB 行。
// 反向顺序 (先 DB) 会出现"用户看不到了但 jsonl 还在"的孤儿, 而正向最坏只是
// 短暂的"DB 行还在但 agent 已删", 下次 ListSessions 会让 caller 看到孤儿提示。
func (f *FeatureBridge) DeleteSessionByID(ctx context.Context, userID uint, sessionID string) error {
	owns, err := f.OwnsSession(userID, sessionID)
	if err != nil {
		return fmt.Errorf("ownership check: %w", err)
	}
	if !owns {
		return ErrNotFound
	}
	if err := f.bridge.client.DeleteSession(ctx, sessionID); err != nil &&
		!errors.Is(err, agent.ErrSessionNotFound) {
		return fmt.Errorf("agent delete: %w", err)
	}
	if err := f.bridge.repo.DeleteByAgentSessionID(userID, f.spec.Key, sessionID); err != nil {
		return fmt.Errorf("db delete: %w", err)
	}
	f.bridge.deleteTokenWatermark(sessionID) // 清 token 账本水位条目, 防 process-local map 泄漏
	slog.Info("agentbridge DeleteSessionByID",
		"feature", f.spec.Key, "user_id", userID, "session_id", sessionID)
	return nil
}

// ActivateSession 校验某 session 归属当前用户 (用户在侧边栏点选时 frontend 调一次)。
//
// **故意不再 Touch last_accessed_at**: 列表按 last_accessed_at DESC 排序, 若点选就 Touch,
// 用户每点一次历史会话它就跳到顶部 —— 不符合"会话列表按最近活跃排序"的直觉。
// 正确语义: 只有"继续对话"(发出 user_message) 才算活跃, 才置顶 (见 ws.go 的 Touch)。
// 单纯查看历史会话不改变排序。这里保留 ownership 校验, 失败让 frontend 拿到 4404。
func (f *FeatureBridge) ActivateSession(userID uint, sessionID string) error {
	owns, err := f.OwnsSession(userID, sessionID)
	if err != nil {
		return fmt.Errorf("ownership check: %w", err)
	}
	if !owns {
		return ErrNotFound
	}
	return nil
}

func (f *FeatureBridge) createAndPersist(ctx context.Context, userID uint) (string, error) {
	opts, delivered := f.buildCreateOptions(ctx, userID)
	created, err := f.bridge.client.CreateSession(ctx, opts)
	if err != nil {
		return "", fmt.Errorf("create agent session: %w", err)
	}
	row := &SessionRow{
		UserID:         userID,
		FeatureKey:     f.spec.Key,
		AgentSessionID: created.SessionID,
	}
	if err := f.bridge.repo.Create(row); err != nil {
		// 仅唯一键冲突 (1062, migration 0034 的 uk_user_feature_single) 才是并发竞态:
		// 另一个请求已经写了同 (user, feature) 的用户级行, 把刚建的 agent session 回收,
		// 复用对方写的 id, 让 get-or-create 真正幂等。其余错误 (DB 故障等) 不该误删 +
		// 回读, 直接回滚刚建的 agent session 并返回原错误。
		if !IsDuplicateKey(err) {
			slog.Error("agentbridge create: DB insert failed (non-duplicate), rolling back agent session",
				"feature", f.spec.Key, "user_id", userID, "session_id", created.SessionID, "err", err)
			if delErr := f.bridge.client.DeleteSession(ctx, created.SessionID); delErr != nil {
				slog.Warn("agentbridge create: rollback agent session failed",
					"session_id", created.SessionID, "err", delErr)
			}
			return "", fmt.Errorf("persist session mapping: %w", err)
		}
		// 并发竞态: 另一个请求已经写了一行, 把刚建的 agent session 回收, 复用对方写的 id。
		slog.Warn("agentbridge create: mapping race (duplicate key), retrying with read",
			"feature", f.spec.Key, "user_id", userID, "err", err)
		if delErr := f.bridge.client.DeleteSession(ctx, created.SessionID); delErr != nil {
			slog.Warn("agentbridge create: cleanup orphaned session failed",
				"session_id", created.SessionID, "err", delErr)
		}
		existing, getErr := f.bridge.repo.Get(userID, f.spec.Key)
		if getErr != nil {
			return "", fmt.Errorf("create + race lookup: %w", err)
		}
		return existing.AgentSessionID, nil
	}
	if delivered {
		f.markPromptInjectedSync(created.SessionID) // 已系统级下发, 抑制 WS in-band 回落
	}
	slog.Info("agentbridge create: session created",
		"feature", f.spec.Key, "user_id", userID, "session_id", created.SessionID,
		"system_prompt_delivery", deliveryMode(delivered))
	return created.SessionID, nil
}

// recreate 自愈路径: agent 端 404 时把 oldSessionID 那一行换成新建的会话 (行级,不动其它会话)。
func (f *FeatureBridge) recreate(ctx context.Context, userID uint, oldSessionID string) (string, error) {
	opts, delivered := f.buildCreateOptions(ctx, userID)
	created, err := f.bridge.client.CreateSession(ctx, opts)
	if err != nil {
		return "", fmt.Errorf("recreate agent session: %w", err)
	}
	if err := f.bridge.repo.UpdateSessionID(userID, f.spec.Key, oldSessionID, created.SessionID); err != nil {
		// 回收刚建的 agent 会话,避免重试一次漏一个孤儿(audit rank 16)。
		if delErr := f.bridge.client.DeleteSession(ctx, created.SessionID); delErr != nil {
			slog.Warn("agentbridge recreate: cleanup new session after DB fail also failed",
				"feature", f.spec.Key, "session_id", created.SessionID, "err", delErr)
		}
		return "", fmt.Errorf("recreate update mapping: %w", err)
	}
	if delivered {
		f.markPromptInjectedSync(created.SessionID) // 已系统级下发, 抑制 WS in-band 回落
	}
	slog.Info("agentbridge recreate: session rebuilt after agent 404",
		"feature", f.spec.Key, "user_id", userID, "new_session_id", created.SessionID,
		"system_prompt_delivery", deliveryMode(delivered))
	return created.SessionID, nil
}

// cleanupGhostCache 在 reset 后等待一小段时间, 把 agent 异步 flush 的 last-prompt
// cache 文件也一并删掉。失败不算错 — 残留只是 ~500B 的空 jsonl, 业务不读它。
func (f *FeatureBridge) cleanupGhostCache(sessionID string, userID uint) {
	time.Sleep(ghostCleanupDelay)
	bgCtx, cancel := ctxutil.With(ctxutil.QuickIO)
	defer cancel()
	err := f.bridge.client.DeleteSession(bgCtx, sessionID)
	switch {
	case err == nil:
		slog.Info("agentbridge: ghost cache swept",
			"feature", f.spec.Key, "user_id", userID, "session_id", sessionID)
	case errors.Is(err, agent.ErrSessionNotFound):
		// happy path: 没有残留
	default:
		slog.Warn("agentbridge: ghost cache sweep failed (best-effort)",
			"feature", f.spec.Key, "user_id", userID,
			"session_id", sessionID, "err", err)
	}
}
