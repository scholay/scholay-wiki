// ============================================================================
// llmusage.Service —— 统一 LLM token 账本的中央记录器。
//
// 两条路都喂它(都异步、best-effort、绝不阻塞请求):
//   - 项目侧 internal/ai 的咽喉点 executeWithRetry(读响应 Usage 后调 Record)
//   - agent 侧 agentbridge OnMessageComplete(WS)+ ServerSideChatStreaming(peerreview)
//
// 项目侧的 feature/user/request_id 通过 context.Context 携带(WithCall),
// 这样 executeWithRetry 不必改每个调用签名就能拿到归属信息。
// ============================================================================

package llmusage

import (
	"context"
	"log/slog"

	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/safego"
)

// Usage —— Record 的入参(一次 LLM 调用的用量 + 归属)。
type Usage struct {
	UserID              *uint  // nil = 公众号 / 匿名
	Feature             string // 必填(取 Feature* 常量)
	Source              string // 必填: SourceProject | SourceAgent
	Provider            string
	AccountID           *uint
	Model               string
	InputTokens         int
	OutputTokens        int
	TotalTokens         int
	CacheReadTokens     int
	CacheCreationTokens int
	RequestID           string
	// SkipQuota —— 系统开销类调用(如后台记忆抽取):仍记账本(成本可见 + 按用户归属),
	// 但**不触发 observer / 不扣用户每日额度**。用户未主动发起、又会高频后台跑的 AI 调用用它,
	// 避免悄悄吃掉用户额度。默认 false = 正常计费。
	SkipQuota bool
}

// Recorder 业务依赖的最小接口 —— Service 实现, bootstrap 注入。
type Recorder interface {
	Record(u Usage)
}

// UsageObserver —— 每记一行账本时同步回调(userID 已登录 + cost>0 + 非 SkipQuota 才触发)。
// P5(成本制计费):传**真实成本(微元)** = Σ(各类 token × 对应单价),而非加权 token ——
// 输入/输出/缓存单价差 100 倍,按真实成本扣额度才公平(见 vip 周期配额,单位=微元;显示 ÷1000=算力点)。
// 未接 Pricer / 模型未定价 → cost=0 → 不扣额度(须保证目录内模型都配了价格)。必须轻量, 不可阻塞。
type UsageObserver func(userID uint, costMicroYuan int)

// Pricer —— 模型定价接缝(internal/modelcatalog 实现;P3 加权计费)。
// 在 Record 内、observer 门**之前**统一计算 —— SkipQuota(记忆抽取)与匿名(公众号)行也要
// 有成本快照(挂在 observer 上会让最需要核账的系统开销行恒为 0)。实现必须只走内存缓存。
type Pricer interface {
	// PriceUsage 返回 (weightedTokens, costMicroYuan)。目录查不到 → weight=1 兜底(raw 口径)。
	PriceUsage(model string, input, output, cacheRead, cacheWrite int) (weighted int64, costMicroYuan int64)
}

type Service struct {
	repo     *Repository
	observer UsageObserver
	pricer   Pricer
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// SetObserver 注入用量观察者(bootstrap 接到 vip.AddUsage,P3 起口径=加权 token)。
func (s *Service) SetObserver(o UsageObserver) { s.observer = o }

// SetPricer 注入模型定价(bootstrap 接 modelcatalog;nil = 加权退化为 raw、成本恒 0)。
func (s *Service) SetPricer(p Pricer) { s.pricer = p }

// ResolveUserIDs 把「用户关键词」解析成 user_id 集合(给按用户筛选 token 用量用)。
func (s *Service) ResolveUserIDs(keyword string, limit int) []uint {
	return s.repo.ResolveUserIDs(keyword, limit)
}

// Record 异步写一行账本(safego 带 recover; 单条 INSERT 失败仅 Warn, 不阻塞业务)。
// feature 缺省 → "unknown" + Warn, 让漏埋点可见。total 缺省时用 input+output 兜底(agent 不吐 total)。
func (s *Service) Record(u Usage) {
	if s == nil {
		return
	}
	if u.Feature == "" {
		u.Feature = "unknown"
		slog.Warn("llmusage: record with empty feature", "source", u.Source, "model", u.Model)
	}
	// total 缺省时(agent 侧不吐 total)用四项之和兜底 —— 必须含 cache_read / cache_creation,
	// 否则 prism/审稿这类「一轮读大缓存上下文」的功能对上游计费数万 token、却只向日配额记
	// input+output 几百,成本帽对最烧钱的功能系统性漏气(Anthropic 用量里 input 不含缓存项,
	// 缓存 token 单列上报,故四项相加不重复)。如需把更便宜的 cache_read 降权,在此乘系数即可。
	if u.TotalTokens == 0 {
		u.TotalTokens = u.InputTokens + u.OutputTokens + u.CacheReadTokens + u.CacheCreationTokens
	}
	// 全 0 用量不入账本:合成/空轮、上游没吐 usage、agent 增量为 0 的轮 —— 没有 token 可计,
	// 记一行只会虚增后台「调用次数(total_calls)」、污染明细。无 token = 无消耗, 跳过不算遗漏。
	if u.TotalTokens == 0 {
		return
	}
	// P3 定价(observer 门之前统一算):weighted 参与额度扣减,cost 是账本快照(SkipQuota/匿名
	// 行同样落快照,admin 成本看板才不对系统开销失明)。Pricer 未接线 → 加权退化为 raw。
	weighted := int64(u.TotalTokens)
	var costMicro int64
	if s.pricer != nil {
		weighted, costMicro = s.pricer.PriceUsage(u.Model,
			u.InputTokens, u.OutputTokens, u.CacheReadTokens, u.CacheCreationTokens)
	}
	// 同步喂周期额度计数(轻量 Redis INCRBY);只对已登录用户的非零**成本**用量。
	// P5 成本制:喂真实成本 costMicro(微元),而非加权 token —— 按输入/输出/缓存的真实单价扣额度才公平。
	// SkipQuota 的系统开销调用(如记忆抽取)记账本但不扣额度,故跳过 observer。
	// costMicro=0(模型未定价)→ 不扣(该模型须在目录补价;notePricingMiss 已登记占位行提醒 admin)。
	if s.observer != nil && u.UserID != nil && costMicro > 0 && !u.SkipQuota {
		s.observer(*u.UserID, int(costMicro))
	}
	// 走独立 ledger 池:账本喂计费,不与匿名 beacon 抢同一 drop-on-full 队列。
	safego.RecordLedger("llmusage:"+u.Feature, func() {
		row := &LLMTokenUsage{
			UserID:              u.UserID,
			Feature:             u.Feature,
			Source:              u.Source,
			Provider:            u.Provider,
			AccountID:           u.AccountID,
			Model:               u.Model,
			InputTokens:         u.InputTokens,
			OutputTokens:        u.OutputTokens,
			TotalTokens:         u.TotalTokens,
			CacheReadTokens:     u.CacheReadTokens,
			CacheCreationTokens: u.CacheCreationTokens,
			WeightedTokens:      weighted,
			CostMicroYuan:       costMicro,
			RequestID:           u.RequestID,
		}
		ctx, cancel := ctxutil.With(ctxutil.QuickIO)
		defer cancel()
		if err := s.repo.Create(ctx, row); err != nil {
			slog.Warn("llmusage: record failed",
				"feature", u.Feature, "source", u.Source, "model", u.Model, "err", err)
		}
	})
}

// ─── ctx 携带调用归属(项目侧 internal/ai 用)──────────────────────────────
//
// 项目侧 100% 的 LLM 调用都过 executeWithRetry, 但它不知道"这次是哪个 feature、哪个用户"。
// 入口 handler 用 WithCall 把这些塞进 ctx, executeWithRetry 用 CallFromCtx 通用读出, 不必改每个签名。

// Call —— ctx 携带的调用归属信息。
type Call struct {
	Feature   string
	UserID    *uint
	RequestID string
	// SkipQuota —— 见 Usage.SkipQuota:系统开销类调用记账本但不扣用户每日额度。
	// 经 recordLLMUsage 透传到 Usage。
	SkipQuota bool
}

type callKey struct{}

// WithCall 把调用归属塞进 ctx。入口(translate/matrix/wechat_oa handler 或 service)调一次。
func WithCall(ctx context.Context, c Call) context.Context {
	return context.WithValue(ctx, callKey{}, c)
}

// CallFromCtx 取出调用归属;没有则返回零值 Call(executeWithRetry 据此降级 feature="unknown")。
func CallFromCtx(ctx context.Context) Call {
	if ctx == nil {
		return Call{}
	}
	c, _ := ctx.Value(callKey{}).(Call)
	return c
}
