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
	"os"
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
	client agent.Executor // 接缝:fork *agent.Client 满足;P3 clean-room executor 同样满足(一行 bootstrap 切换)
	repo   *Repository

	// hubs 跟踪每个 (feature, agent session) 的扇出 Hub(多端实时同步,见 hub.go)。
	// key 形如 "claw:<agentSessionId>"; value 是 *hubSlot(承载 *sessionHub + ready 信号,per-key
	// singleflight,见 getOrCreateHub)。同一 session 的多个浏览器都作为订阅者接入同一条上游 agent WS
	// —— 既满足 jsonl 单写者,又让多端实时同步(取代旧的「抢占」)。首连建 hub 经 sync.Map.LoadOrStore
	// 做 per-key 原子裁决,创建者锁外 dial(不再有全局 hubsMu 串行化全站建连)。
	//
	// ⚠️ process-local:当前 backend 单容器部署即正确。多实例横向扩容时同一 session 的订阅者可能
	// 落到不同实例 → 各自一条上游 → jsonl 双写。届时需「上游单实例 owner + Redis 中继扇出」或
	// sticky 路由(见 hub.go 顶部注释)。
	hubs sync.Map

	// llmRec 统一 LLM token 账本录入器 (允许 nil = 不记账)。
	// **带内**落账本路径(ws.go pipe):agent 把 per-call 明细 + 会话累计随 message_complete /
	// token_usage 帧经已鉴权 WS 带回, pipe 用 accrueTurnUsage 按水位算增量 → recordAgentTokens。
	// 归属(user/feature)来自已鉴权会话本身, 不反查; 不再走独立 HTTP 旁路(那条因子进程里
	// ANTHROPIC_API_KEY 被 provider 覆盖而鉴权失败、且 fire-and-forget 易丢, 已删除)。
	// server-side peerreview 的 token 同样靠 agent per-call → 此 WS 路(经其会话)记账。
	llmRec llmusage.Recorder

	// memSvc per-user 长期记忆服务 (允许 nil = 不启用记忆)。所有 feature 共享同一份用户记忆:
	// 读(注入)经 MemoryBlocks;写(抽取)由 agent 容器跑 LLM —— backend 经 buildMemoryExtractFrame
	// 组装 prompt + WS extract_memory 帧推给 agent(WS message_complete / server-side 触发),
	// agent 回传 memory_update 帧后经 IngestMemory 落库。backend 自身不跑抽取 LLM。
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

	// turns: Web-native 重构 P0 影子日志的 TurnCoordinator(允许 nil = 未 wired → 所有
	// shadow 写都是 no-op,绝不影响 live)。bootstrap 经 SetTurnCoordinator 注入(此处有 *gorm.DB)。
	// P0: 仅 shadow 写 agent_turns/agent_turn_events/agent_billing_ledger;jsonl + 内存 hub 仍权威。
	turns *TurnCoordinator
	// log: P1 读路径(GetSessionMessages / 迟到续流)从事件日志读的入口(= turns 底层 EventLog)。
	// 由 SetTurnCoordinator 一并设置;nil = 未接线 → readFromJournal 恒 false → 全走 daemon。
	log EventLog

	// executorClient: P4a 切流到 clean-room executor 的客户端(nil = 未配置 AGENT_EXECUTOR_BASE_URL = 全走 fork)。
	// executorFeatures: 路由到 executor 的 feature 集合(AGENT_EXECUTOR_FEATURES csv);命中 → WS dial executor
	// + 连接时从 journal 喂 history(seed_history)+ 历史读走 journal。默认空 = 全 fork,可秒回退。
	// 要求:启用任一 executor feature 必须同时 AGENT_TURN_JOURNAL=shadow(否则历史无源)。
	executorClient   agent.Executor
	executorFeatures map[string]bool

	// catalog: 模型目录接缝(P2 用户选模型;internal/modelcatalog 实现,允许 nil = 未接线 →
	// hub 不下发模型帧、拒收浏览器 set_runtime_config)。hub 用它做:建连下发会话模型、
	// 浏览器换模型帧的权威校验(堵「devtools 发任意 modelId 直达上游」注入洞)、每条消息前
	// 重校验(会员到期/模型下架对活连接生效)。
	catalog ModelCatalog
}

// ModelCatalog 模型目录最小接缝(避免反向依赖 internal/modelcatalog;purpose 字符串与
// modelcatalog.Purpose* 常量对齐:system.fast / chat_default.<featureKey>)。
type ModelCatalog interface {
	// Resolve 按能力绑定取模型 id(含回退链;空 = 目录未配置)。
	Resolve(purpose string) string
	// ResolveChatDefault feature 默认对话模型:走主绑定 chat_default.<featureKey>(经 Resolve 的回退链
	// + purposeAlias 归并)。2026-07 起不再分免费/付费档(.free 覆盖已下线)。feature 默认模型解析
	// **恒走此方法**(hub 默认解析 + 水位窗口 + 用户目录默认徽标同口径)。第二参数保留仅为兼容。
	ResolveChatDefault(featureKey string, userID uint) string
	// ValidateUserModel 校验该用户此刻可用该模型(存在 ∧ enabled ∧ user_selectable ∧ 档位门槛)。
	ValidateUserModel(userID uint, modelID string) error
	// ContextWindow 返回模型上下文窗口 token 数(0 = 未知,executor 回落全局默认)。
	ContextWindow(modelID string) int
	// MaxInput 返回模型最大输入 token 数(0 = 未配,executor 压缩墙回落「上下文 − 输出预留」自动算)。
	MaxInput(modelID string) int
	// MaxOutput 返回模型最大完成 token 数(0 = 未知,executor 回落全局默认并靠 adapter 400 钳制自愈)。
	MaxOutput(modelID string) int
	// Vision 返回模型是否支持图片输入(P2 图片通道:executor 按此过滤历史 image 块)。
	Vision(modelID string) bool
	// CostPerToken 返回模型混合估算成本(微元/token),把「微元额度余量」换算成执行器 token 预算(SS#2 自配速)。
	// P5 成本制取代旧 BillingWeight(配额已按真实成本扣,不再有加权倍率)。
	CostPerToken(modelID string) float64
	// ProviderKey 返回模型所属 provider 在 executor 侧的 upsert 键(F0 多 provider):
	// "" = 默认 provider(scholay-managed,executor 走 active);"scholay-p<id>" = 额外 provider。
	// hub 组 set_runtime_config 帧与计费 Provider 归属共用此口径。
	ProviderKey(modelID string) string
}

// SetModelCatalog 注入模型目录(bootstrap 调用一次)。
func (b *Bridge) SetModelCatalog(c ModelCatalog) { b.catalog = c }

// SetExecutorRouting 接线 P4a 切流:executor 客户端 + 路由到 executor 的 feature 集合(csv)。
// 默认空 csv = 全走 fork(零行为变更,可秒回退)。bootstrap 调用一次。
func (b *Bridge) SetExecutorRouting(client agent.Executor, csv string) {
	b.executorClient = client
	feats := map[string]bool{}
	for _, k := range strings.Split(csv, ",") {
		if s := strings.TrimSpace(k); s != "" {
			feats[s] = true
		}
	}
	b.executorFeatures = feats
}

// isExecutorFeature: 该 feature 是否已切到 executor。
func (b *Bridge) isExecutorFeature(featureKey string) bool {
	return b.executorClient != nil && b.executorFeatures[featureKey]
}

// clientForFeature: 按 feature 选 executor 或 fork 客户端(WS dial + HTTP op 都用它)。
func (b *Bridge) clientForFeature(featureKey string) agent.Executor {
	if b.isExecutorFeature(featureKey) {
		return b.executorClient
	}
	return b.client
}

// loadTokenWatermark 取某 agent session 的已记账累计水位。进程内 map 缺失(backend 刚重启)
// → 回源 agent_sessions.usage_watermark(P3:水位持久化 —— 修「发版重启后活跃会话整段历史
// 累计被当增量重复扣额度」的存量 bug;agent 侧 session_total 跨 backend 重启存活)。
func (b *Bridge) loadTokenWatermark(sessionID string) [4]int64 {
	if v, ok := b.tokenWatermarks.Load(sessionID); ok {
		if wm, ok2 := v.([4]int64); ok2 {
			return wm
		}
	}
	if b.repo != nil {
		if wm, ok := parseWatermark(b.repo.GetUsageWatermark(sessionID)); ok {
			b.tokenWatermarks.Store(sessionID, wm)
			return wm
		}
	}
	return [4]int64{}
}

// formatWatermark / parseWatermark —— usage_watermark 列的编解码("in,out,cacheRead,cacheWrite")。
func formatWatermark(wm [4]int64) string {
	return fmt.Sprintf("%d,%d,%d,%d", wm[0], wm[1], wm[2], wm[3])
}

func parseWatermark(s string) ([4]int64, bool) {
	var wm [4]int64
	if s == "" {
		return wm, false
	}
	if n, err := fmt.Sscanf(s, "%d,%d,%d,%d", &wm[0], &wm[1], &wm[2], &wm[3]); n != 4 || err != nil {
		return [4]int64{}, false
	}
	return wm, true
}

// storeTokenWatermark 推进某 agent session 的累计水位。
func (b *Bridge) storeTokenWatermark(sessionID string, wm [4]int64) {
	b.tokenWatermarks.Store(sessionID, wm)
}

// flushTokenWatermark 同步把某 session 的内存水位落库。**在丢弃内存副本前调用**(hub 关闭 /
// grace 拆 hub 时):每轮的落库是 safego 异步 best-effort,优雅重启(SIGTERM 抽干)时若恰有一笔
// 在途未落、内存副本又被 deleteTokenWatermark 清掉 → 重连回源到「上一轮」的旧水位,delta 会把
// 最后一轮多算一次(有界重复计费)。关 hub 前同步落一次,保证 DB 拿到最新水位后再删内存。
func (b *Bridge) flushTokenWatermark(sessionID string) {
	if b.repo == nil {
		return
	}
	v, ok := b.tokenWatermarks.Load(sessionID)
	if !ok {
		return
	}
	wm, ok := v.([4]int64)
	if !ok {
		return
	}
	if err := b.repo.SetUsageWatermark(sessionID, formatWatermark(wm)); err != nil {
		slog.Debug("agentbridge: flush usage watermark on shutdown failed", "session_id", sessionID, "err", err)
	}
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
// sessionModel(P3)= 会话当前生效模型:交互路传 hub 内存态、serverside 传本轮注入的 modelID。
// 补差行按它计价 —— 否则「贵模型出答案期间断线丢 message_complete → 残差落 (reconciled) 按
// 基准价计」成为可重复操作的降价通道。
func (b *Bridge) accrueTurnUsage(sessionID, sessionModel string, turnUsage AgentUsage, calls []AgentUsage, sessionTotal *AgentUsage) []AgentUsage {
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
		// P3 计价优先级:无明细时的本轮模型(最准)> 会话当前模型 > "(reconciled)" 哨兵(按基准价)。
		model := "(reconciled)"
		if len(rows) == 0 && turnUsage.Model != "" {
			model = turnUsage.Model // 无 per-call 明细(老 agent / 空 calls)→ 用本轮模型标注差额行
		} else if sessionModel != "" {
			model = sessionModel
		}
		rows = append(rows, AgentUsage{
			Model:               model,
			InputTokens:         int(rd[0]),
			OutputTokens:        int(rd[1]),
			CacheReadTokens:     int(rd[2]),
			CacheCreationTokens: int(rd[3]),
		})
	}
	// P3 水位持久化:异步落 agent_sessions.usage_watermark(best-effort,失败=至多回到
	// 「重启后按全量重记一次」的旧行为)。不在 watermarkMu 内做 SQL —— 拷贝后 goroutine 写。
	if b.repo != nil {
		wmStr := formatWatermark(cur)
		sid := sessionID
		safego.Go("agentbridge-watermark-persist", func() {
			if err := b.repo.SetUsageWatermark(sid, wmStr); err != nil {
				slog.Debug("agentbridge: persist usage watermark failed", "session_id", sid, "err", err)
			}
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
func New(client agent.Executor, repo *Repository) *Bridge {
	return &Bridge{client: client, repo: repo}
}

// ResolveUserSession — feature 中立地把一个「全局唯一的 agent_session_id」反查成它的 feature,
// 并校验归属当前用户。给前端 /claw/:sessionId 深链/刷新用:URL 只带裸 sessionId、不带 feature,
// 页层据此决定挂哪个 workspace(claw/boltslides/sci_draw)+ 判「不存在/不属于我 → 回新对话」。
//
// agent_session_id 全局唯一(uk_agent_session_id),故一个 id → 至多一行 → 确定的 (user, feature)。
// 不存在 与 属于别人 一律返回 ("", false)(反枚举,和 OwnsSession 同语义)。
func (b *Bridge) ResolveUserSession(userID uint, sessionID string) (feature string, owned bool) {
	if b.repo == nil || sessionID == "" {
		return "", false
	}
	row, err := b.repo.FindByAgentSessionID(sessionID)
	if err != nil || row == nil || row.UserID != userID {
		return "", false
	}
	return row.FeatureKey, true
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

// SetTurnCoordinator 注入 Web-native 重构 P0 影子日志的 TurnCoordinator (bootstrap 调用一次;
// nil = 不写影子,所有 shadow 写 no-op、live 不受影响)。同时缓存底层 EventLog 供 P1 读路径用。
func (b *Bridge) SetTurnCoordinator(tc *TurnCoordinator) {
	b.turns = tc
	b.log = tc.readLog()
}

// ShutdownJournal 优雅停机:drain 事件日志写通道(M5,防重启丢未落盘事件)。main 在 srv.Shutdown 后调。
func (b *Bridge) ShutdownJournal(ctx context.Context) {
	if b.log != nil {
		if n := b.log.WriteFailures(); n > 0 {
			slog.Warn("agentbridge: journal had write failures this run", "failures", n)
		}
		b.log.Shutdown(ctx)
	}
}

// ReconcileJournalOnBoot 启动时清理僵尸 running turn(M5)。bootstrap 调用一次。
func (b *Bridge) ReconcileJournalOnBoot(ctx context.Context) {
	if b.log != nil {
		if err := b.log.ReconcileStaleRunning(ctx); err != nil {
			slog.Warn("agentbridge: reconcile stale running turns failed", "err", err)
		}
	}
}

// StartJournalReaper 运行期周期回收僵尸 running turn(W3-2c):FailTurn 异步落库失败 / 进程活着
// 但 hub 异常路径漏 finalize 时,不再等到下次发版才被 boot 回收(审计:挂死轮 848s/624s 无人收)。
// 10min ticker 调 ReconcileStaleRunning —— SQL 幂等、只动 status=running 的僵尸行(阈值 30min,
// 大于轮级硬超时 15min,正常轮绝不会被误收),与 boot 版同一写口。bootstrap 调用一次。
func (b *Bridge) StartJournalReaper(ctx context.Context) {
	if b.log == nil {
		return
	}
	safego.Go("agentbridge-journal-reaper", func() {
		t := time.NewTicker(10 * time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				rctx, cancel := context.WithTimeout(ctx, 30*time.Second)
				err := b.log.ReconcileStaleRunning(rctx)
				cancel()
				if err != nil {
					slog.Warn("agentbridge: journal reaper failed", "err", err)
				}
			}
		}
	})
}

// readFromJournal 判断某 feature 的历史/续流是否从 durable 事件日志读(而非 agent 内存/daemon)。
//
// 【根治 2026-07-21】durable journal 是**默认真源**:只要事件日志已接线(b.log != nil,即
// AGENT_TURN_JOURNAL != off),所有 feature 的历史读都走 journal —— 能否读出历史**不再取决于** feature
// 是否碰巧进了 AGENT_EXECUTOR_FEATURES / AGENT_JOURNAL_READ 名单。此前那套 opt-in 会因配置漏项让整个
// feature 历史静默读空(boltslides 事故:漏进 executor 名单 → 读 agent 内存 → 容器重建后全空)。
// 数据完整性不该由 env 名单决定,故反转极性:durable-by-default。
// 安全性:读路径自带 archive + daemon 兜底(见 readHistoryFromJournal),journal 空的老会话自动落回,
// 故对任何 feature 都 strictly better(不会比原 daemon 读更差)。
// AGENT_JOURNAL_DAEMON_ONLY(逗号分隔 feature)是**紧急 opt-out** 回滚闸:某 feature 的 journal 折叠
// 万一出问题,把它临时强制回 daemon 读(默认空 = 全部走 durable journal)。
func (b *Bridge) readFromJournal(featureKey string) bool {
	if b.log == nil {
		return false // 事件日志未接线(AGENT_TURN_JOURNAL=off)→ 无 durable 源可读
	}
	if csv := os.Getenv("AGENT_JOURNAL_DAEMON_ONLY"); csv != "" {
		for _, k := range strings.Split(csv, ",") {
			if strings.TrimSpace(k) == featureKey {
				return false // 紧急回滚:该 feature 强制回 daemon 读
			}
		}
	}
	return true // 默认:durable journal 是真源
}

// MemoryBlocks 返回某用户的记忆块渲染文本 (bullet 列表, 无记忆/未启用返回 "")。
// 供注入路径用:WS 首条消息前缀 (ws.go) 与 peerreview prompt (service.go) 各自包 frame。
func (b *Bridge) MemoryBlocks(userID uint) string {
	if b.memSvc == nil {
		return ""
	}
	return b.memSvc.RenderBlocks(userID)
}

// buildMemoryExtractFrame 一轮对话结束后,限流通过则组装要推给 agent 的 extract_memory 控制帧。
// 返回 nil = 这轮不抽(未启用 / 冷却中 / 拉不到 transcript / 太短)。
//
// 记忆抽取的「LLM 调用」由 agent 容器跑(backend 不跑 LLM):此处只做 backend 侧的非 LLM 工作 ——
// 限流(ShouldExtract,per-user Redis)、拉最近对话(GetSessionMessages,纯 HTTP 取数)、组装抽取
// prompt(BuildExtractionPrompt,单一真源)。frame 由调用方经同一条**已鉴权 WS** 用 writeAgent 发给
// agent(不新开连接,避免 displacement);agent 跑完把原始输出经 memory_update 帧回传,再走 IngestMemory。
func (b *Bridge) buildMemoryExtractFrame(ctx context.Context, userID uint, sessionID, featureKey string) []byte {
	if b.memSvc == nil || userID == 0 || sessionID == "" {
		return nil
	}
	if !b.memSvc.ShouldExtract(ctx, userID) {
		return nil // 冷却中, 跳过
	}
	// M2 修复:executor-routed feature 的 transcript 在 journal(fork 见不到)→ 从 journal 折叠;
	// 空(切流前老会话)再回退 fork。否则记忆抽取对所有 executor feature 静默死亡(user_memory_blocks 冻结)。
	var msgs []agent.SessionMessage
	if b.isExecutorFeature(featureKey) && b.log != nil {
		if evs, _, _, jerr := b.log.ReadRecentTurns(ctx, sessionID, 3); jerr == nil {
			msgs = b.log.FoldToMessages(evs)
		}
	}
	if len(msgs) == 0 {
		// journal 空(切流前老会话)→ 归档表;再兜底 client(过渡 fork / collapse 后 executor)。
		if ar, ok := b.readArchive(sessionID); ok {
			msgs = ar.Messages
		} else {
			resp, err := b.client.GetSessionMessages(ctx, sessionID, 3) // 最近 3 个用户轮足够抽画像
			if err != nil || resp == nil {
				return nil
			}
			msgs = resp.Messages
		}
	}
	transcript := flattenTranscript(msgs)
	system, user, ok := b.memSvc.BuildExtractionPrompt(userID, transcript)
	if !ok {
		return nil
	}
	frame, err := buildExtractMemoryFrame(system, user)
	if err != nil {
		return nil
	}
	return frame
}

// IngestMemory 把 agent 回传的原始抽取输出落库(写记忆的唯一可信入口;allow-list / 截断 / Upsert
// 全在 usermemory.IngestFromAgent,agent 永远只是建议者)。memSvc 未启用 = no-op。
func (b *Bridge) IngestMemory(userID uint, raw string) {
	if b.memSvc == nil {
		return
	}
	b.memSvc.IngestFromAgent(userID, raw)
}

// buildExtractMemoryFrame 组装 backend→agent 的 extract_memory 控制帧(agent 据此跑一次廉价模型补全)。
func buildExtractMemoryFrame(system, user string) ([]byte, error) {
	return json.Marshal(map[string]string{
		"type":   "extract_memory",
		"system": system,
		"user":   user,
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

// For 返回一个绑定到指定 FeatureSpec 的视图。
// FeatureBridge 是值类型, 内部持有指针, 复制开销可忽略 (可以放心传值)。
func (b *Bridge) For(spec FeatureSpec) *FeatureBridge {
	return &FeatureBridge{bridge: b, spec: spec}
}

// Client 暴露底层 agent.Client, 适用于 bootstrap 阶段需要直接对接的极少数场景
// (例如 UpsertSkill / Health)。业务侧不应直接持有它, 走 FeatureBridge 即可。
func (b *Bridge) Client() agent.Executor { return b.client }

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
func (f *FeatureBridge) AgentClient() agent.Executor { return f.bridge.clientForFeature(f.spec.Key) }

// ExtractMemoryServerSide(FeatureBridge):server-side feature(peerreview)一轮结束后抽记忆,
// 自动带本 feature key → transcript 从 journal 取、dial 命中正确上游(M2)。
func (f *FeatureBridge) ExtractMemoryServerSide(ctx context.Context, sessionID string, userID uint) {
	f.bridge.ExtractMemoryServerSide(ctx, sessionID, userID, f.spec.Key)
}

// client 返回本 feature 应使用的 agent 客户端(P4a:executor 命中则 executor,否则 fork)。
// FeatureBridge 内所有 HTTP op 走它,使切流的 feature 的 session/workspace/context op 落到 executor。
func (f *FeatureBridge) client() agent.Executor { return f.bridge.clientForFeature(f.spec.Key) }

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
	created, err := f.client().CreateSession(ctx, opts)
	if err != nil {
		return "", fmt.Errorf("create new agent session: %w", err)
	}
	newSessionID := created.SessionID

	if err := f.bridge.repo.UpdateSessionID(userID, f.spec.Key, oldSessionID, newSessionID); err != nil {
		slog.Error("agentbridge reset: DB update failed, cleaning up new session",
			"feature", f.spec.Key, "user_id", userID,
			"new_session_id", newSessionID, "err", err)
		if delErr := f.client().DeleteSession(ctx, newSessionID); delErr != nil {
			slog.Warn("agentbridge reset: cleanup new session also failed",
				"session_id", newSessionID, "err", delErr)
		}
		return "", fmt.Errorf("update session mapping: %w", err)
	}

	if delivered {
		f.markPromptInjectedSync(newSessionID) // 已系统级下发, 抑制 WS in-band 回落
	}

	if oldSessionID != "" {
		// **不在此删 S_old 的内存水位**:UpdateSessionID 已把 DB 行 repoint 到 S_new(GetUsageWatermark(S_old)
		// 从此返回空),若此刻删掉内存水位,而 S_old 的 hub 仍活着并收到「重置瞬间在途轮」的终帧,
		// accrueTurnUsage(S_old) 内存+DB 双 miss → 水位归 0 → 把整段会话累计当增量重记(reconciled 暴量复发,
		// 正是历史事故机制)。保留内存水位 → 在途帧按正确水位算增量;S_old 的 hub 随后被 DeleteSession 关闭时
		// 其 shutdown 会自行 flush + deleteTokenWatermark 清理(见 hub.shutdown),不会泄漏。
		slog.Info("agentbridge reset: deleting old session",
			"feature", f.spec.Key, "user_id", userID, "old_session_id", oldSessionID)
		delErr := f.client().DeleteSession(ctx, oldSessionID)
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

// readHistoryFromJournal — P1 历史读:启用了 AGENT_JOURNAL_READ 的 feature 从事件日志折叠历史,
// 取代 daemon 往返。ok=false → caller 走既有 daemon 路径(jsonl 仍权威,读错自动落回)。
// 轮计数依赖 FoldToMessages 的轮边界硬约束(只有 user_message 生成 type==user),与 daemon 路分页 parity 一致。
func (f *FeatureBridge) readHistoryFromJournal(ctx context.Context, sessionID string, limitTurns int) (*SessionMessagesResult, bool) {
	if !f.bridge.readFromJournal(f.spec.Key) {
		return nil, false
	}
	evs, total, hasMore, jerr := f.bridge.log.ReadRecentTurns(ctx, sessionID, limitTurns)
	if jerr != nil {
		slog.Warn("agentbridge: journal history read failed, fallback daemon",
			"feature", f.spec.Key, "session_id", sessionID, "err", jerr)
		return nil, false
	}
	folded := f.bridge.log.FoldToMessages(evs)
	// 老会话(切流前创建)没进事件日志 → 历史只在归档表(P6:fork 退役前从 fork jsonl 一次性归档进
	// agent_session_archive)。journal 空 → 先读归档;再兜底 client(过渡期=fork;collapse 后=executor,
	// 老会话返空无害,归档已覆盖)。
	if len(folded) == 0 {
		if ar, ok := f.bridge.readArchive(sessionID); ok {
			stripInjectionFromMessages(ar.Messages)
			return ar, true
		}
		if resp, derr := f.bridge.client.GetSessionMessages(ctx, sessionID, limitTurns); derr == nil && resp != nil && len(resp.Messages) > 0 {
			tt := total
			if resp.TotalTurns != nil {
				tt = *resp.TotalTurns
			}
			slog.Info("agentbridge: journal empty, served history from client fallback",
				"feature", f.spec.Key, "session_id", sessionID, "messages", len(resp.Messages))
			return &SessionMessagesResult{SessionID: sessionID, Messages: resp.Messages, TotalTurns: tt, HasMore: false}, true
		}
	}
	stripInjectionFromMessages(folded)
	return &SessionMessagesResult{SessionID: sessionID, Messages: folded, TotalTurns: total, HasMore: hasMore}, true
}

// GetSessionMessages 拉历史消息; agent 端 404 时清旧 mapping + 重建空 session。
// limitTurns>0 时只返回最近 limitTurns 个用户轮 (分页, 见 sliceRecentTurns)。
func (f *FeatureBridge) GetSessionMessages(ctx context.Context, userID uint, limitTurns int) (*SessionMessagesResult, error) {
	sessionID, err := f.GetOrCreateSession(ctx, userID)
	if err != nil {
		return nil, err
	}
	if res, ok := f.readHistoryFromJournal(ctx, sessionID, limitTurns); ok {
		return res, nil
	}
	msgs, err := f.client().GetSessionMessages(ctx, sessionID, limitTurns)
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
	if res, ok := f.readHistoryFromJournal(ctx, sessionID, limitTurns); ok {
		return res, nil
	}
	msgs, err := f.client().GetSessionMessages(ctx, sessionID, limitTurns)
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
	if res, ok := f.readHistoryFromJournal(ctx, sessionID, limitTurns); ok {
		return res, nil
	}
	msgs, err := f.client().GetSessionMessages(ctx, sessionID, limitTurns)
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

// effectiveContextWindow 解析该会话「当前生效模型」的上下文窗口(pinned_model 优先且需过校验,
// 否则退 chat_default 绑定)。0 = 目录未接线 / 模型未配窗口 → 调用方保留 executor 的全局兜底。
// 与 hub.sendInitialModel 的解析口径一致,保证「水位表显示的窗口」== 「实际下发给 executor 的窗口」。
func (f *FeatureBridge) effectiveContextWindow(userID uint, sessionID string) int {
	cat := f.bridge.catalog
	if cat == nil || f.bridge.repo == nil {
		return 0
	}
	model := ""
	if row, err := f.bridge.repo.FindByAgentSessionID(sessionID); err == nil && row != nil && row.PinnedModel != "" {
		if cat.ValidateUserModel(userID, row.PinnedModel) == nil {
			model = row.PinnedModel
		}
	}
	if model == "" {
		model = cat.ResolveChatDefault(f.spec.Key, userID) // 主绑定 chat_default.<key>(+ purposeAlias 归并)
	}
	if model == "" {
		return 0
	}
	return cat.ContextWindow(model)
}

// applyModelContextWindow 用「当前生效模型的窗口」覆盖 est.MaxTokens 并重算百分比。
// 事故修复(2026-07-15):executor 的 context 端点回的 maxTokens 是全局常量 EXECUTOR_CONTEXT_WINDOW
// (128k),不随模型变 → 1M/256k 等异构窗口模型水位表全错、切模型不更新。这里按目录窗口纠偏。
func (f *FeatureBridge) applyModelContextWindow(est *agent.SessionContextEstimate, userID uint, sessionID string) {
	if est == nil {
		return
	}
	if w := f.effectiveContextWindow(userID, sessionID); w > 0 {
		est.MaxTokens = w
		if est.TotalTokens > 0 {
			est.Percentage = est.TotalTokens * 100 / w
		} else {
			est.Percentage = 0
		}
	}
}

// GetContextEstimate 透传上下文水位; 会话还没说过话时 agent 返回空 contextEstimate,
// 这里以 (nil, sessionID, nil) 返回, 上层渲染成 0/maxTokens。agent 404 时同样自愈。
func (f *FeatureBridge) GetContextEstimate(ctx context.Context, userID uint) (*agent.SessionContextEstimate, string, error) {
	sessionID, err := f.GetOrCreateSession(ctx, userID)
	if err != nil {
		return nil, "", err
	}
	est, err := f.client().GetSessionContextEstimate(ctx, sessionID)
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
	f.applyModelContextWindow(est, userID, sessionID)
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
	est, err := f.client().GetSessionContextEstimate(ctx, sessionID)
	if err != nil {
		if errors.Is(err, agent.ErrSessionNotFound) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("agent get context estimate: %w", err)
	}
	f.applyModelContextWindow(est, userID, sessionID)
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
	msgs, err := f.client().GetSessionMessages(ctx, sessionID, 1)
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
	wantPrompt := f.spec.InjectPromptOnFirstMsg && f.spec.Picker != nil
	wantSkills := f.spec.SessionSkillsProvider != nil
	if !wantPrompt && !wantSkills {
		return base, false // 无 per-user 变更 → 原样返回共享静态 base(零分配)
	}

	// clone-before-mutate:base 被所有用户复用,任何 per-user 写入都必须先拷贝。
	// ⚠️ AddDirs slice 必须**新分配**:浅拷贝 clone := *base 与 base 共享底层数组,
	//    后续若 append(opts.AddDirs, …) 会就地污染全体用户的静态 spec(跨租户污染)。
	opts := &agent.CreateSessionOptions{}
	if base != nil {
		clone := *base
		clone.AddDirs = append([]string(nil), base.AddDirs...)
		opts = &clone
	}

	delivered := false
	if wantPrompt {
		choice, err := f.spec.Picker.Pick(ctx, PickInput{UserID: userID})
		if err != nil || choice == nil || choice.SystemPrompt == "" {
			slog.Warn("agentbridge: pick system prompt at create failed, falling back to in-band",
				"feature", f.spec.Key, "user_id", userID, "err", err)
		} else {
			opts.AppendSystemPrompt = buildSystemPromptPayload(choice.SystemPrompt, f.bridge.MemoryBlocks(userID))
			delivered = true
		}
	}

	if wantSkills {
		// fail-open:provider 报错 / 空 → 无用户 skill,不阻断建会话(skill 是增强非必需)。
		skills, err := f.spec.SessionSkillsProvider(ctx, userID)
		if err != nil {
			slog.Warn("agentbridge: session skills provider failed, continuing without user skills",
				"feature", f.spec.Key, "user_id", userID, "err", err)
		} else if len(skills) > 0 {
			opts.Skills = skills
		}
	}

	return opts, delivered
}

// applySessionProfile(Phase 2)把 feature 的项目级 in-band 注入块(prism 写作画像)拼在 opts.AppendSystemPrompt
// 之后。SessionProfile 以 sessionID 为身份(项目级,区别于 user 级 MemoryBlocks)。**clone-before-mutate**:
// buildCreateOptions 在无 Picker 时返回共享静态 base,直接改会污染所有用户,故先拷贝再改。空块 → 原样返回。
func (f *FeatureBridge) applySessionProfile(ctx context.Context, sessionID string, opts *agent.CreateSessionOptions) *agent.CreateSessionOptions {
	if f.spec.SessionProfile == nil {
		return opts
	}
	block := strings.TrimSpace(f.spec.SessionProfile(ctx, sessionID))
	if block == "" {
		return opts
	}
	var o agent.CreateSessionOptions
	if opts != nil {
		o = *opts
	}
	if o.AppendSystemPrompt != "" {
		o.AppendSystemPrompt += "\n\n" + block
	} else {
		o.AppendSystemPrompt = block
	}
	return &o
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

// ─── 多会话 API (claw / smart_search 用; 单会话 feature 仍走 GetOrCreateSession / ResetSession) ────

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
	return f.enrichSessionRows(ctx, rows), nil
}

// ListOwnerSessions 列某实体(owner_kind, owner_id)下的全部对话(会话),含 agent transcript 元数据。
// 用于「一实体多对话」——prism 一项目多条对话:owner 唯一约束已放开(migration 0074)。归属校验由调用方
// (prism 侧已 GetProject 确认项目属本人)负责,这里只按 owner 列。
func (f *FeatureBridge) ListOwnerSessions(ctx context.Context, ownerKind string, ownerID uint64) ([]SessionListItem, error) {
	rows, err := f.bridge.repo.ListByOwner(ownerKind, ownerID)
	if err != nil {
		return nil, fmt.Errorf("list owner sessions: %w", err)
	}
	return f.enrichSessionRows(ctx, rows), nil
}

// CurrentOwnerSession 返回某实体最近活跃的一条会话 id(last_accessed_at 最大);无会话返回 ""(不查 agent,纯 DB)。
// 多对话下端点未指定 sessionId 时的「当前对话」回落。
func (f *FeatureBridge) CurrentOwnerSession(ownerKind string, ownerID uint64) (string, error) {
	rows, err := f.bridge.repo.ListByOwner(ownerKind, ownerID)
	if err != nil {
		return "", err
	}
	if len(rows) == 0 {
		return "", nil
	}
	return rows[0].AgentSessionID, nil // ListByOwner 已按 last_accessed_at DESC
}

// VerifyOwnerSession 校验 sessionID 确属 (userID, ownerKind, ownerID) —— 多对话端点收前端传的 sessionId 时
// 必须过这道(铁律:绝不信前端裸传的 sessionId 直接用,否则跨实体/越权)。三者全对才 true。
func (f *FeatureBridge) VerifyOwnerSession(userID uint, ownerKind string, ownerID uint64, sessionID string) (bool, error) {
	if sessionID == "" {
		return false, nil
	}
	row, err := f.bridge.repo.FindByAgentSessionID(sessionID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return false, nil
		}
		return false, err
	}
	if row == nil || row.UserID != userID || row.OwnerKind == nil || *row.OwnerKind != ownerKind || row.OwnerID == nil || *row.OwnerID != ownerID {
		return false, nil
	}
	return true, nil
}

// enrichSessionRows 把 DB 会话行合并 agent transcript 元数据(title/messageCount/时间)。ListSessions /
// ListOwnerSessions 共用(单一真源)。agent 拉失败非致命:仍返 DB 行,元数据留空。
func (f *FeatureBridge) enrichSessionRows(ctx context.Context, rows []SessionRow) []SessionListItem {
	if len(rows) == 0 {
		return []SessionListItem{}
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
	agentList, agentErr := f.client().ListSessions(ctx, ids)
	// agent 拉失败不致命: 仍返 DB 行, title/messageCount 留空
	agentByID := make(map[string]agent.SessionSummary)
	if agentErr == nil && agentList != nil {
		for _, s := range agentList.Sessions {
			agentByID[s.ID] = s
		}
	} else if agentErr != nil {
		slog.Warn("agentbridge enrichSessionRows: agent list failed, returning DB-only view",
			"feature", f.spec.Key, "err", agentErr)
	}

	// 标题后端拥有(migration 0050):DB title 为准。executor 内存态无历史标题,故对切流 feature
	// 用 DB;DB 空再 backfill —— 优先 agentByID(fork 路径=jsonl 标题),仍空则查 fork(b.client)
	// 把历史 jsonl 标题迁进 DB(executor-routed 的历史会话标题不丢)。
	out := make([]SessionListItem, 0, len(rows))
	var forkBackfill []string
	for _, r := range rows {
		item := SessionListItem{
			SessionID:      r.AgentSessionID,
			LastAccessedAt: r.LastAccessedAt,
			CreatedAt:      r.CreatedAt,
			Title:          r.Title, // DB 优先
		}
		if meta, ok := agentByID[r.AgentSessionID]; ok {
			item.MessageCount = meta.MessageCount
			item.AgentCreatedAt = meta.CreatedAt
			item.AgentModifiedAt = meta.ModifiedAt
			if item.Title == "" && meta.Title != "" {
				item.Title = meta.Title
				_ = f.bridge.repo.SetTitleIfEmpty(r.AgentSessionID, meta.Title) // 迁进 DB
			}
		}
		if item.Title == "" && r.AgentSessionID != "" && f.bridge.isExecutorFeature(f.spec.Key) {
			forkBackfill = append(forkBackfill, r.AgentSessionID)
		}
		out = append(out, item)
	}

	// 历史 backfill:切流 feature 仍缺标题的会话,从 fork(原 jsonl)取标题迁进 DB。
	if len(forkBackfill) > 0 {
		if forkList, ferr := f.bridge.client.ListSessions(ctx, forkBackfill); ferr == nil && forkList != nil {
			forkByID := make(map[string]string, len(forkList.Sessions))
			for _, s := range forkList.Sessions {
				if s.Title != "" {
					forkByID[s.ID] = s.Title
				}
			}
			for i := range out {
				if out[i].Title == "" {
					if t, ok := forkByID[out[i].SessionID]; ok {
						out[i].Title = t
						_ = f.bridge.repo.SetTitleIfEmpty(out[i].SessionID, t)
					}
				}
			}
		}
	}
	return out
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
	created, err := f.client().CreateSession(ctx, opts)
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
		if delErr := f.client().DeleteSession(ctx, created.SessionID); delErr != nil {
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
	// H2 修复:标题后端拥有(migration 0050,ListSessions 用 r.Title 为准)。改名必须**无条件**写 DB,
	// 否则已有标题的会话(常态:session_title_updated 已 SetTitleIfEmpty 落过)改名静默 no-op。
	if err := f.bridge.repo.SetTitle(sessionID, title); err != nil {
		return fmt.Errorf("rename (db title): %w", err)
	}
	// agent 端 meta 也尽量同步(失败不致命:DB 已权威)。
	if err := f.client().PatchSession(ctx, sessionID, title); err != nil {
		slog.Warn("agentbridge RenameSession: agent PatchSession failed (db title already set)",
			"feature", f.spec.Key, "session_id", sessionID, "err", err)
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
	if err := f.client().DeleteSession(ctx, sessionID); err != nil &&
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
	created, err := f.client().CreateSession(ctx, opts)
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
			if delErr := f.client().DeleteSession(ctx, created.SessionID); delErr != nil {
				slog.Warn("agentbridge create: rollback agent session failed",
					"session_id", created.SessionID, "err", delErr)
			}
			return "", fmt.Errorf("persist session mapping: %w", err)
		}
		// 并发竞态: 另一个请求已经写了一行, 把刚建的 agent session 回收, 复用对方写的 id。
		slog.Warn("agentbridge create: mapping race (duplicate key), retrying with read",
			"feature", f.spec.Key, "user_id", userID, "err", err)
		if delErr := f.client().DeleteSession(ctx, created.SessionID); delErr != nil {
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
	created, err := f.client().CreateSession(ctx, opts)
	if err != nil {
		return "", fmt.Errorf("recreate agent session: %w", err)
	}
	if err := f.bridge.repo.UpdateSessionID(userID, f.spec.Key, oldSessionID, created.SessionID); err != nil {
		// 回收刚建的 agent 会话,避免重试一次漏一个孤儿(audit rank 16)。
		if delErr := f.client().DeleteSession(ctx, created.SessionID); delErr != nil {
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
	err := f.client().DeleteSession(bgCtx, sessionID)
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
