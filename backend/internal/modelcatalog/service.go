// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package modelcatalog

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/common/safego"
)

// cacheTTL —— 目录/绑定的内存缓存(照抄 vip.ConfigService 手法):Resolve 在 WS/审稿热路径上
// 被调用,不能每次打 DB;admin 写操作主动失效,最坏 30s 收敛。
const cacheTTL = 30 * time.Second

// snapshot 一次性加载的目录+绑定快照(读侧无锁共享,写时整体替换)。
type snapshot struct {
	models    []AgentModel
	byModel   map[string]*AgentModel // model_id → 行(含停用行:计价/解析必须查得到,enabled 只约束选择器)
	// byModelFold 二级索引:strings.ToLower(model_id) → 行。DB 唯一键 collation 大小写不敏感,
	// 但 byModel 是精确匹配 —— 上游回报的 model code 大小写漂移时精确 miss、占位登记又被
	// DoNothing 吞(唯一键撞已有行)→ 变体永久 cost=0。Get() 精确 miss 后按此折叠回退。
	byModelFold map[string]*AgentModel
	bindings  map[string]string      // purpose → model_id
	providers map[uint64]*AgentProvider // 额外 provider(F0;0=默认不在此)
}

// Service 模型目录 + 能力绑定 + Resolve 解析链。
//
// Resolve(purpose) 回退链(评审修订,必须有终点且绝不静默):
//  1. 绑定存在且目录行存在 → 返回(不过滤 enabled:admin 停用只影响用户选择器,固定能力绑定
//     是 admin 显式配置,停用即换绑是 admin 自己的动作);
//  2. 绑定缺失 / 指向目录里不存在的 id → 回退 system.main 绑定;
//  3. system.main 也无效 → 终极回退 agent_config.main_model 列(经 terminalFallback 闭包注入,
//     该列 P1 起冻结不再被 admin 表单改写,行为=现状);
//  4. 每次回退 slog.Warn + BindingViews 里 fallback=true(admin 绑定页标红)。
type Service struct {
	repo *Repository

	mu       sync.RWMutex
	cached   *snapshot
	cachedAt time.Time

	// terminalFallback 读 agent_config.main_model(bootstrap 注入,避免 import 环)。nil = 无终极回退。
	terminalFallback func() string
	// pushTrigger 绑定/目录变更后触发 agent 配置重推(bootstrap 注入 agentconfig.RepushAsync)。
	pushTrigger func()
	// tierResolver 用户生效会员档(bootstrap 注入 vip.EffectiveTier;nil = 全按 free 处理)。
	// ValidateUserModel 的 min_tier 门槛用它。
	tierResolver func(userID uint) string
	// providerPusher 额外 provider 推送器(F0,bootstrap 注入;见 provider.go)。
	providerPusher ProviderPusher
}

func NewService(repo *Repository) *Service { return &Service{repo: repo} }

// SetTerminalFallback 注入 Resolve 的终极回退(agent_config.main_model 读闭包)。
func (s *Service) SetTerminalFallback(fn func() string) { s.terminalFallback = fn }

// SetPushTrigger 注入「目录/绑定变更 → 重推 agent 配置」的触发器。
func (s *Service) SetPushTrigger(fn func()) { s.pushTrigger = fn }

// SetTierResolver 注入会员档解析(bootstrap 接 vip.EffectiveTier)。
func (s *Service) SetTierResolver(fn func(userID uint) string) { s.tierResolver = fn }

// load 返回当前快照(带 TTL 缓存)。DB 读失败回退上一份快照(可能过期但可用),再不行给空快照
// —— Resolve 走终极回退,行为等价「目录未配置」,不硬挂调用方。
func (s *Service) load() *snapshot {
	s.mu.RLock()
	if s.cached != nil && time.Since(s.cachedAt) < cacheTTL {
		c := s.cached
		s.mu.RUnlock()
		return c
	}
	stale := s.cached
	s.mu.RUnlock()

	models, err := s.repo.ListModels()
	if err != nil {
		slog.Warn("modelcatalog: load models failed", "err", err)
		if stale != nil {
			return stale
		}
		return &snapshot{byModel: map[string]*AgentModel{}, byModelFold: map[string]*AgentModel{}, bindings: map[string]string{}, providers: map[uint64]*AgentProvider{}}
	}
	bindings, err := s.repo.ListBindings()
	if err != nil {
		slog.Warn("modelcatalog: load bindings failed", "err", err)
		if stale != nil {
			return stale
		}
		return &snapshot{byModel: map[string]*AgentModel{}, byModelFold: map[string]*AgentModel{}, bindings: map[string]string{}, providers: map[uint64]*AgentProvider{}}
	}
	provs, err := s.repo.ListProviders()
	if err != nil {
		slog.Warn("modelcatalog: load providers failed", "err", err)
		provs = nil // provider 读失败按「只有默认」降级,不阻断目录
	}

	snap := &snapshot{
		models:      models,
		byModel:     make(map[string]*AgentModel, len(models)),
		byModelFold: make(map[string]*AgentModel, len(models)),
		bindings:    make(map[string]string, len(bindings)),
		providers:   make(map[uint64]*AgentProvider, len(provs)),
	}
	for i := range models {
		snap.byModel[models[i].ModelID] = &models[i]
		snap.byModelFold[strings.ToLower(models[i].ModelID)] = &models[i]
	}
	for _, b := range bindings {
		if b.ModelID != "" {
			snap.bindings[b.Purpose] = b.ModelID
		}
	}
	for i := range provs {
		snap.providers[provs[i].ID] = &provs[i]
	}
	s.mu.Lock()
	s.cached = snap
	s.cachedAt = time.Now()
	s.mu.Unlock()
	return snap
}

func (s *Service) invalidate() {
	s.mu.Lock()
	s.cached = nil
	s.mu.Unlock()
}

// Resolve 见 Service 注释的回退链。返回空串 = 全链无值(fresh install 未配置),
// 调用方语义与现状一致(serverside 不切模型 / PushConfig 推空槽位)。
func (s *Service) Resolve(purpose string) string {
	if primary, ok := purposeAlias[purpose]; ok {
		purpose = primary // 合并/折叠的能力先归主 purpose(见 model.go purposeAlias),调用方零改动
	}
	snap := s.load()
	if id, ok := snap.bindings[purpose]; ok {
		if _, exists := snap.byModel[id]; exists {
			return id
		}
		slog.Warn("modelcatalog: 绑定指向不存在的模型,回退 system.main", "purpose", purpose, "model_id", id)
	}
	if purpose != PurposeSystemMain {
		if id, ok := snap.bindings[PurposeSystemMain]; ok {
			if _, exists := snap.byModel[id]; exists {
				slog.Warn("modelcatalog: 绑定缺失,回退 system.main", "purpose", purpose, "fallback", id)
				return id
			}
		}
	}
	if s.terminalFallback != nil {
		if id := strings.TrimSpace(s.terminalFallback()); id != "" {
			slog.Warn("modelcatalog: 目录无可用绑定,终极回退 agent_config.main_model", "purpose", purpose, "fallback", id)
			return id
		}
	}
	return ""
}

// ResolveChatDefault feature 默认对话模型(实现 agentbridge.ModelCatalog):直接走主绑定
// chat_default.<feature>(经 Resolve 的完整回退链 + purposeAlias 归并)。2026-07 起不再区分
// 免费/付费档 —— .free 覆盖机制整套下线,所有档位一律走主绑定。第二参数保留仅为签名/接口兼容。
// hub 的默认解析、bridge 水位窗口、ListForUser 默认徽标统一走此口径。
func (s *Service) ResolveChatDefault(featureKey string, _ uint) string {
	return s.Resolve("chat_default." + featureKey)
}

// ResolveSlots 实现 agentconfig.SlotProvider:PushConfig 推给 agent 容器的槽位值由绑定生成
// (main/sonnet/opus = system.main,haiku = system.fast),agent 侧 resolveTier/带外调用零改动。
//
// 护栏(2026-07-14 事故修复):槽位只对**默认端点**生效 —— 若 system.* 绑定指向了额外端点
// 的模型,直接填槽会让带外调用(标题/记忆)拿着别家的 model code 打默认上游 → 400。
// 此处跳过跨端点值(回退 agent_config 冻结列)并 WARN;SetBinding 侧已同步拒绝新增此类绑定。
func (s *Service) ResolveSlots() (main string, fast string) {
	main = s.slotSafe(PurposeSystemMain)
	fast = s.slotSafe(PurposeSystemFast)
	if fast == "" {
		fast = main
	}
	return main, fast
}

// slotSafe Resolve + 默认端点校验:解析值属于额外端点 → 视为无效,退回终极回退(冻结列)。
func (s *Service) slotSafe(purpose string) string {
	id := s.Resolve(purpose)
	if id == "" {
		return ""
	}
	if m := s.Get(id); m != nil && m.ProviderID != 0 {
		slog.Warn("modelcatalog: system 槽位绑定指向额外端点模型,跳过(带外调用只走默认端点)",
			"purpose", purpose, "model", id)
		if s.terminalFallback != nil {
			return strings.TrimSpace(s.terminalFallback())
		}
		return ""
	}
	return id
}

// foldHitWarned 已告警过的大小写漂移变体(进程级,每个变体只 WARN 一次,防计价热路径刷屏)。
var foldHitWarned sync.Map

// Get 按 model_id 查目录行,**含停用行**——计价(P3)与展示映射必须查得到已下架模型,
// enabled 只约束用户选择器与 P2 的 hub 闸。查不到返回 nil。
// 匹配顺序:先精确,精确 miss 再按小写折叠回退(DB 唯一键 collation 大小写不敏感,上游回报的
// model code 与目录行大小写漂移时,不折叠会永久 cost=0 且占位登记被 DoNothing 吞)。
// 折叠只用于查找;display/推送等消费的都是返回目录行里的原值,不受查询串大小写影响。
func (s *Service) Get(modelID string) *AgentModel {
	snap := s.load()
	if m, ok := snap.byModel[modelID]; ok {
		clone := *m
		return &clone
	}
	if m, ok := snap.byModelFold[strings.ToLower(modelID)]; ok {
		if _, seen := foldHitWarned.LoadOrStore(modelID, struct{}{}); !seen {
			slog.Warn("modelcatalog: model_id 大小写漂移,已按折叠匹配命中目录行(建议对齐目录 code 与上游回报值)",
				"queried", modelID, "catalog", m.ModelID)
		}
		clone := *m
		return &clone
	}
	return nil
}

// ContextWindow 返回模型上下文窗口(0 = 未知;实现 agentbridge.ModelCatalog)。
func (s *Service) ContextWindow(modelID string) int {
	if m := s.Get(modelID); m != nil {
		return m.ContextWindow
	}
	return 0
}

// MaxInput 返回模型最大输入 token 数(0 = 未配;实现 agentbridge.ModelCatalog)。
// agent 压缩墙的输入预算据此定(未配则回落「上下文 − 输出预留」),保证 输入+输出 ≤ 上下文不溢出。
func (s *Service) MaxInput(modelID string) int {
	if m := s.Get(modelID); m != nil {
		return m.MaxInput
	}
	return 0
}

// MaxOutput 返回模型最大完成 token 数(0 = 未知;实现 agentbridge.ModelCatalog)。
// executor 用 min(全局上限, maxOutput) 定 max_tokens,避免小完成窗模型(如 gpt-4o-mini 16384)
// 被全局 64000 顶爆 400(2026-07-14 智能搜索空返回事故的确定性修复;零配置兜底在 openai adapter 钳制重试)。
func (s *Service) MaxOutput(modelID string) int {
	if m := s.Get(modelID); m != nil {
		return m.MaxOutput
	}
	return 0
}

// Vision 返回模型是否支持图片输入(实现 agentbridge.ModelCatalog;P2 图片通道)。
// hub 随模型帧下发给 executor:发请求时按当前模型能力过滤历史 image 块(防切回无视觉模型 400)。
func (s *Service) Vision(modelID string) bool {
	if m := s.Get(modelID); m != nil {
		return m.Vision
	}
	return false
}

// ProviderKey 实现 agentbridge.ModelCatalog(F0):"" = 默认 provider;"scholay-p<id>" = 额外。
func (s *Service) ProviderKey(modelID string) string {
	if p := s.ProviderFor(modelID); p != nil {
		return p.ExecutorKey()
	}
	return ""
}

// CostPerToken 该模型的**混合估算成本**(微元/token),用于把「微元额度余量」换算成执行器可比的 token 预算
// (SS#2 自配速)。P5 成本制取代旧 BillingWeight:混合口径 = 80% 命中缓存 + 15% 未命中输入 + 5% 输出
// (与成本制配额同源假设)。目录 miss / 全 0 → 回落一个保守正值(≈flash 混合)。含停用行(照常计价)。
// ⚠️ 这是**估算口径**:不含输入分档高价(hi/hi2)与 cache_w 单价,仅用于预算换算(hub 盖章前把
// 微元余量换成 token 预算);真实扣费一律走 PriceUsage(四类单价 × 实际 token,含分档)。
func (s *Service) CostPerToken(modelID string) float64 {
	const fallback = 0.3 // 微元/token,≈flash 混合成本
	m := s.Get(modelID)
	if m == nil {
		return fallback
	}
	cpt := 0.8*m.PriceCacheR + 0.15*m.PriceIn + 0.05*m.PriceOut
	if cpt <= 0 {
		return fallback
	}
	return cpt
}

// reconciledSentinel bridge 补差行(accrueTurnUsage 丢帧残差)落账时的 model 哨兵值。
// 不是真实上游 model code,目录永远 miss —— PriceUsage 对它单独走「基准价」路径。
const reconciledSentinel = "(reconciled)"

// pricerMissWarn 目录 miss 告警限流(每分钟一条;上游改名会走到这)。
var (
	pricerMissMu sync.Mutex
	pricerMissAt time.Time
)

// reconciledMissWarn "(reconciled)" 基准价解析失败告警限流(每分钟一条;与目录 miss 分开计,
// 互不遮蔽 —— 这条意味着 system.main 全链无值,fresh install 未配置之外都值得看)。
var (
	reconciledMissMu sync.Mutex
	reconciledMissAt time.Time
)

// pricingMissSeen 已自动登记过的未命中 model(防重复 upsert 打 DB;进程级,重启后重登一次幂等无害)。
var pricingMissSeen sync.Map

// notePricingMiss 首见某未计价上游 model 时,异步登记一条停用占位目录行(见 repo.UpsertPlaceholderModel),
// 使项目侧 AI 未纳入目录的上游模型在 admin 可见、可补四类单价。同步开销仅一次 map LoadOrStore。
func (s *Service) notePricingMiss(model string) {
	if _, loaded := pricingMissSeen.LoadOrStore(model, struct{}{}); loaded {
		return
	}
	safego.Go("modelcatalog-register-unpriced-model", func() {
		if err := s.repo.UpsertPlaceholderModel(model, "project"); err != nil {
			slog.Warn("modelcatalog: register placeholder for un-priced model failed", "model", model, "err", err)
			pricingMissSeen.Delete(model) // 失败让下次重试
			return
		}
		s.invalidate() // 令后续 Get/PriceUsage 查到新占位行(admin 补价后即生效)
	})
}

// PriceUsage 实现 llmusage.Pricer,返回 (total, cost):
//   - total = 四类 token 原始总量(仅落 ledger 作历史用量,P5 起**不再** ×billing_weight);
//   - cost  = Σ(各类 tokens × 对应单价) —— 单价是 元/1M token,tokens × 单价恰好就是**微元**;
//             cost 才是驱动配额扣减的真源(成本制)。
// 只走内存缓存(Record 在同步请求路径上,绝不回源 DB)。目录 miss → cost=0 + 限流 WARN。
// "(reconciled)" 补差哨兵按**基准价**(system.main 生效模型单价)计价 —— 落账 model 字段仍是
// 哨兵原值(账本可辨识补差行),只有计价换用基准模型;解析不到基准模型才退 cost=0 + 限流 WARN。
// 否则「贵模型出答案期间断线丢 message_complete → 残差落 (reconciled) 按 0 计」成为漏扣通道。
func (s *Service) PriceUsage(model string, input, output, cacheRead, cacheWrite int) (int64, int64) {
	total := int64(input) + int64(output) + int64(cacheRead) + int64(cacheWrite)
	m := s.Get(model)
	if m == nil && model == reconciledSentinel {
		// 基准价 = Resolve(system.main) 的生效模型(含完整回退链);终极回退可能给出不在目录的
		// 冻结列值 → Get 仍 nil → 走下面的 cost=0 兜底。
		if base := s.Resolve(PurposeSystemMain); base != "" {
			m = s.Get(base)
		}
		if m == nil {
			reconciledMissMu.Lock()
			if time.Since(reconciledMissAt) >= time.Minute {
				reconciledMissAt = time.Now()
				slog.Warn("modelcatalog: (reconciled) 补差行解析不到基准模型(system.main 全链无值),按 cost=0 兜底")
			}
			reconciledMissMu.Unlock()
			return total, 0
		}
	}
	if m == nil {
		// 注:"(reconciled)" 在上面已单独收口,不会走到这里的占位登记(哨兵不是真实 model code,
		// 登记会造出垃圾目录行);此处 guard 保留作防御。
		if model != "" && model != reconciledSentinel {
			pricerMissMu.Lock()
			if time.Since(pricerMissAt) >= time.Minute {
				pricerMissAt = time.Now()
				slog.Warn("modelcatalog: 计价目录 miss,按 cost=0 兜底", "model", model)
			}
			pricerMissMu.Unlock()
			// 首见即异步登记一条停用占位目录行(项目侧翻译/矩阵/公众号等未纳入目录的上游模型),
			// 使其在 admin 目录可见、可补单价 → 从「cost 恒 0、看板失明」变为可治理(R2)。
			s.notePricingMiss(model)
		}
		return total, 0
	}
	// 输入长度分档(0084 两档 + 0087 三档):prompt = input + cacheRead + cacheWrite。超过阈值切高档**单价**。
	// P5 成本制:billing_weight / billing_weight_hi **不再参与**(配额改按真实成本扣),分档只剩单价那一半。
	// 档2(hi):prompt > InputTierThreshold;档3(hi2):prompt > InputTierThreshold2(> 档2 阈值)。
	// 高档值为 0 → 回落上一档已选值(档2 回落基础,档3 回落档2);链式选择,防误配把价清零。
	priceIn, priceOut, priceCacheR, priceCacheW := m.PriceIn, m.PriceOut, m.PriceCacheR, m.PriceCacheW
	prompt := int64(input) + int64(cacheRead) + int64(cacheWrite)
	if m.InputTierThreshold > 0 && prompt > int64(m.InputTierThreshold) {
		if m.PriceInHi > 0 {
			priceIn = m.PriceInHi
		}
		if m.PriceOutHi > 0 {
			priceOut = m.PriceOutHi
		}
		if m.PriceCacheRHi > 0 {
			priceCacheR = m.PriceCacheRHi
		}
		if m.PriceCacheWHi > 0 {
			priceCacheW = m.PriceCacheWHi
		}
	}
	if m.InputTierThreshold2 > 0 && prompt > int64(m.InputTierThreshold2) {
		if m.PriceInHi2 > 0 {
			priceIn = m.PriceInHi2
		}
		if m.PriceOutHi2 > 0 {
			priceOut = m.PriceOutHi2
		}
		if m.PriceCacheRHi2 > 0 {
			priceCacheR = m.PriceCacheRHi2
		}
		if m.PriceCacheWHi2 > 0 {
			priceCacheW = m.PriceCacheWHi2
		}
	}
	cost := int64(float64(input)*priceIn + float64(output)*priceOut +
		float64(cacheRead)*priceCacheR + float64(cacheWrite)*priceCacheW)
	// 第一返回值(weighted)P5 起 = raw total(不再 ×billing_weight);仅落 ledger 作历史用量,不驱动配额。
	return total, cost
}

// tierRank 会员档序:free(空)< pro < max。
func tierRank(t string) int {
	switch t {
	case "max":
		return 2
	case "pro":
		return 1
	default:
		return 0
	}
}

// userTier 取用户生效档(未注入解析器时按 free)。
func (s *Service) userTier(userID uint) string {
	if s.tierResolver == nil {
		return ""
	}
	return s.tierResolver(userID)
}

// ValidateUserModel 校验该用户此刻可用该模型(实现 agentbridge.ModelCatalog):
// 存在 ∧ enabled ∧ user_selectable ∧ min_tier ≤ 用户生效档。hub 帧闸 / sendInitialModel /
// 消息前重校验共用这一个口径 —— 会员到期(EffectiveTier 回落)即刻在此失效。
func (s *Service) ValidateUserModel(userID uint, modelID string) error {
	m := s.Get(modelID)
	if m == nil || !m.Enabled || !m.UserSelectable {
		return errors.New("模型不在可选目录中")
	}
	// 🔴 计价准入的**运行时兜底**(2026-08-02 计费审计 P0-4)。
	// validateModel 只在 admin 保存时跑,拦不住**已经躺在库里**的历史零价行(0063 种子灌进来的那批
	// 就是这样躺到 0083 才被发现的),也拦不住 UpsertPlaceholderModel 自动登记的待补价行万一被
	// 顺手勾上 enabled+user_selectable。零价模型的消耗一分不扣额度、不扣经费 = 对所有人无限免费,
	// 所以这里在**用户真要用它**的那一刻再拦一次。文案不暴露"这个模型是免费的",免得被当成薅点。
	if isUnpriced(m) {
		slog.Error("modelcatalog: 目录里存在已启用且用户可选但四类单价全 0 的模型,已拒绝用户选用 —— 请立即补价",
			"model_id", m.ModelID, "user_id", userID)
		return errors.New("该模型暂不可用,请更换模型")
	}
	if m.MinTier != "" && tierRank(s.userTier(userID)) < tierRank(m.MinTier) {
		return errors.New("该模型需要更高会员档位")
	}
	return nil
}

// isUnpriced 四类基础单价全 0 = 未计价(PriceUsage 对它恒返回 cost=0)。
// 与 validateModel 的准入判据、ListForUser 的过滤判据共用同一个函数,避免三处口径漂移。
func isUnpriced(m *AgentModel) bool {
	return m.PriceIn == 0 && m.PriceOut == 0 && m.PriceCacheR == 0 && m.PriceCacheW == 0
}

// UserModelView 用户选择器 DTO(/api/v1/user/models)。
// 刻意不透四类单价、notes 与计费倍率(P5 成本制:用户对额度只看百分比,绝对成本/单价不外泄)。
type UserModelView struct {
	ModelID       string  `json:"model_id"`
	DisplayName   string  `json:"display_name"`
	Description   string  `json:"description"`
	ContextWindow int     `json:"context_window"`
	SpeedClass    string  `json:"speed_class"`
	// P5 成本制:不再向用户下发计费倍率(倍率已作废,用户对额度只看百分比)。
	Locked bool `json:"locked"` // min_tier 门槛未达 → 选择器置灰 + 升级引导
	MinTier       string  `json:"min_tier"` // 锁定时的引导文案用(pro/max)
	IsDefault     bool    `json:"is_default"`
	Vision        bool    `json:"vision"`   // 视觉能力(P2 图片通道):前端按此启停图片上传入口
	Flagship      bool    `json:"flagship"` // 旗舰标识(0089):选择器差异化高亮 + 旗舰标签
}

// ListForUser 用户可见目录(enabled ∧ user_selectable,按 sort_order),default 按 feature 的
// chat_default 绑定标注。locked 的模型仍返回(置灰 + 升级引导是产品面,过滤是 hub 闸的事)。
func (s *Service) ListForUser(userID uint, featureKey string) []UserModelView {
	snap := s.load()
	// 默认徽标与运行时下发口径一致:走 ResolveChatDefault(主绑定 + purposeAlias 归并;不再分档)。
	def := s.ResolveChatDefault(featureKey, userID)
	tier := s.userTier(userID)
	out := make([]UserModelView, 0, len(snap.models))
	for _, m := range snap.models {
		if !m.Enabled || !m.UserSelectable {
			continue
		}
		out = append(out, UserModelView{
			ModelID:       m.ModelID,
			DisplayName:   m.DisplayName,
			Description:   m.Description,
			ContextWindow: m.ContextWindow,
			SpeedClass:    m.SpeedClass,
			Locked:        m.MinTier != "" && tierRank(tier) < tierRank(m.MinTier),
			MinTier:       m.MinTier,
			IsDefault:     m.ModelID == def,
			Vision:        m.Vision,
			Flagship:      m.Flagship,
		})
	}
	return out
}

// ListModels 全量目录(admin 页)。
func (s *Service) ListModels() ([]AgentModel, error) {
	return s.repo.ListModels()
}

// BindingViews admin 绑定页:purpose 闭集逐个给出 绑定值/生效值/是否回退态。
func (s *Service) BindingViews() []BindingView {
	snap := s.load()
	views := make([]BindingView, 0, len(AllPurposes))
	for _, p := range AllPurposes {
		bound := snap.bindings[p]
		effective := s.Resolve(p)
		fallback := bound == "" || bound != effective
		// system.* 与推送口径(slotSafe)一致:存量跨端点绑定实际推的是冻结列回退值,
		// 若此处仍按 Resolve 显示「生效」,管理面与 executor 实跑互相矛盾(评审 #3/#5)。
		if p == PurposeSystemMain || p == PurposeSystemFast {
			effective = s.slotSafe(p)
			fallback = bound == "" || bound != effective
		}
		views = append(views, BindingView{
			Purpose:   p,
			ModelID:   bound,
			Effective: effective,
			Fallback:  fallback,
		})
	}
	return views
}

// validateModel CRUD 公共校验(admin 保存前)。
func validateModel(m *AgentModel) error {
	m.ModelID = strings.TrimSpace(m.ModelID)
	m.DisplayName = strings.TrimSpace(m.DisplayName)
	if m.ModelID == "" || !ValidModelID(m.ModelID) {
		return errors.New("模型 ID 只允许字母/数字/._:/- 且不超过 200 字符")
	}
	if m.DisplayName == "" {
		return errors.New("对外展示名必填(与上游模型 code 分开,给用户看的人话名)")
	}
	// P5 成本制:billing_weight / billing_weight_hi 已作废,不再校验(前端也不再下发,列保留仅作历史)。
	// 四类基础单价不为负(负单价会把 PriceUsage 的 cost 算成负数 → 配额倒扣)。
	if m.PriceIn < 0 || m.PriceOut < 0 || m.PriceCacheR < 0 || m.PriceCacheW < 0 {
		return errors.New("基础价格不能为负(0 = 免费/未计价)")
	}
	// 分档字段(0084 两档 + 0087 三档):阈值/高档价不为负(高档价 = 长输入切档的真实单价,仍参与成本)。
	if m.InputTierThreshold < 0 || m.InputTierThreshold2 < 0 {
		return errors.New("输入分档阈值不能为负(0 = 不分档)")
	}
	if m.PriceInHi < 0 || m.PriceOutHi < 0 || m.PriceCacheRHi < 0 || m.PriceCacheWHi < 0 ||
		m.PriceInHi2 < 0 || m.PriceOutHi2 < 0 || m.PriceCacheRHi2 < 0 || m.PriceCacheWHi2 < 0 {
		return errors.New("高档价格不能为负")
	}
	// 第三档阈值必须 > 第二档阈值(否则档序倒置,PriceUsage 的链式切档语义会乱)。
	if m.InputTierThreshold2 > 0 && m.InputTierThreshold2 <= m.InputTierThreshold {
		return errors.New("第二分档阈值必须大于第一分档阈值(档3 阈值 > 档2 阈值)")
	}
	// 🔴 计价准入(2026-08-02 计费审计 P0-4):**已启用 + 用户可选**的模型不允许四类单价全 0。
	//
	// 「0 = 免费/未计价」这个二义是根因:PriceUsage 对全 0 单价返回 cost=0,而 llmusage.Record
	// 的 observer 门是 `costMicro > 0` —— cost=0 ⇒ 不触发 observer ⇒ 窗口 used 不涨 ⇒
	// CheckDailyQuota 恒放行、payAsYouGoOverflow 恒为 0,经费也一分不扣。也就是说这个模型
	// **对所有用户无限免费**,而唯一的痕迹是每分钟限流一条的 WARN + 后台一张事后看板。
	//
	// 这不是「admin 点错了」才会发生:新建模型表单的默认值就是 price 全 0 + enabled + user_selectable,
	// 「什么都不填直接保存」即成立。而且本仓库真实踩过 —— 迁移 0063 的种子把 agent_config 四槽位
	// model 以 enabled=1/user_selectable=1 灌进目录且一个价格字段都不填,直到 0083 才补价。
	//
	// 刻意只拦「已启用且用户可选」:停用行 / 内部槽位占位行 / UpsertPlaceholderModel 自动登记的
	// 待补价行都必须还能存在(它们正是提醒 admin 补价的载体),只是不能被用户选中来跑。
	// 真的要提供免费模型,把 price_in 设成一个极小正数(如 0.0001 元/1M)即可 —— 成本可见、可对账,
	// 而不是靠一个与「没配置」同形的 0。
	if m.Enabled && m.UserSelectable && isUnpriced(m) {
		return errors.New("已启用且用户可选的模型必须至少配置一项基础单价:四类单价全为 0 会让该模型的消耗完全不计入用户额度与经费(等于对所有人无限免费)。若确实要免费提供,请把输入单价设成一个极小正数(如 0.0001),让成本仍可见、可对账")
	}
	switch m.SpeedClass {
	case "fast", "balanced", "powerful":
	default:
		m.SpeedClass = "balanced"
	}
	switch m.MinTier {
	case "", "pro", "max":
	default:
		return errors.New("档位门槛只能为空、pro 或 max")
	}
	if m.Channel == "" {
		m.Channel = "agent"
	}
	if m.ContextWindow <= 0 {
		m.ContextWindow = 128000
	}
	// 最大输入(0088):不为负;配了就不能超过上下文(输入是上下文的一部分,超了必溢出)。
	if m.MaxInput < 0 {
		return errors.New("最大输入不能为负(0 = 未配,由 agent 自动算)")
	}
	// 最大完成 token 不为负(负值会让 executor 的 min(全局上限, maxOutput) 钳出非法 max_tokens)。
	if m.MaxOutput < 0 {
		return errors.New("最大完成不能为负(0 = 未知,回落全局上限)")
	}
	if m.MaxInput > 0 && m.MaxInput > m.ContextWindow {
		return errors.New("最大输入不能大于上下文(上下文 = 输入 + 输出 的共享预算)")
	}
	return nil
}

// validateModelProvider 模型挂 provider 的门:provider 必须存在;OpenAI 协议 provider 在
// F3 翻译层启用前拒绝挂模型(F0 零行为变化的护栏 —— 挂了也没人会翻译,跑起来必 4xx)。
func (s *Service) validateModelProvider(providerID uint64) error {
	if providerID == 0 {
		return nil // 默认 provider(agent_config 链)
	}
	p, ok := s.load().providers[providerID]
	if !ok {
		return errors.New("所选 provider 不存在")
	}
	// F3 已启用:executor 侧按 provider.apiFormat 分叉出口翻译(openai/adapter.ts),
	// anthropic / openai 两种格式的 provider 均可挂模型。
	_ = p
	return nil
}

// CreateModel 新增目录行。
func (s *Service) CreateModel(m *AgentModel) error {
	if err := validateModel(m); err != nil {
		return err
	}
	if err := s.validateModelProvider(m.ProviderID); err != nil {
		return err
	}
	if s.Get(m.ModelID) != nil {
		return errors.New("该模型 code 已存在:code 是计费/会话锁定的全局标识,跨端点需保持唯一(同一模型走多渠道请用可区分的 code)")
	}
	if err := s.repo.CreateModel(m); err != nil {
		return err
	}
	s.invalidate()
	return nil
}

// UpdateModel 更新目录行;model_id 变更/停用可能影响推送槽位,触发重推。
func (s *Service) UpdateModel(id uint64, m *AgentModel) error {
	if err := validateModel(m); err != nil {
		return err
	}
	if err := s.validateModelProvider(m.ProviderID); err != nil {
		return err
	}
	existing, err := s.repo.GetModelByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("模型不存在")
		}
		return err
	}
	if existing.ModelID != m.ModelID {
		if s.Get(m.ModelID) != nil {
			return errors.New("该模型 code 已存在:code 是计费/会话锁定的全局标识,跨端点需保持唯一(同一模型走多渠道请用可区分的 code)")
		}
	}
	// 堵 SetBinding 护栏的绕行:模型改挂额外端点时,若已被 system.* 绑定引用则拒绝
	// (先绑默认端点模型再改 provider 会静默进入「界面绿、推送走冻结列」的不一致态,评审 #5)。
	if m.ProviderID != 0 && existing.ProviderID == 0 {
		snap := s.load()
		for _, p := range []string{PurposeSystemMain, PurposeSystemFast} {
			if snap.bindings[p] == existing.ModelID || snap.bindings[p] == m.ModelID {
				return errors.New("该模型被「系统主模型/系统快模型」绑定引用,系统槽位只走默认端点 —— 请先解绑再改挂额外端点")
			}
		}
	}
	if err := s.repo.UpdateModel(id, m); err != nil {
		return err
	}
	s.invalidate()
	s.triggerPush()
	return nil
}

// DeleteModel 删除目录行;仍被绑定引用的拒删(先换绑再删,防 Resolve 集体掉回退)。
func (s *Service) DeleteModel(id uint64) error {
	existing, err := s.repo.GetModelByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("模型不存在")
		}
		return err
	}
	for _, v := range s.BindingViews() {
		if v.ModelID == existing.ModelID {
			return fmt.Errorf("模型仍被能力绑定「%s」引用,请先改绑其他模型", v.Purpose)
		}
	}
	// 评审 R2-info:删掉仍被会话 pin 的模型后,其在跑轮次的用量会 Pricer miss → cost=0 漏扣
	// (停用行仍在目录保单价,删除行丢单价)。拒删被 pin 的模型;运营应「停用(disable)」而非删除来淘汰。
	// 查询失败即拒删(fail-closed,与上面绑定引用检查的失败语义对齐 —— 数错宁可不删,防漏扣)。
	n, err := s.repo.CountPinnedSessions(existing.ModelID)
	if err != nil {
		slog.Warn("modelcatalog: count pinned sessions failed (delete rejected)", "model_id", existing.ModelID, "err", err)
		return errors.New("无法确认该模型是否仍被会话锁定选用,已取消删除,请稍后重试")
	}
	if n > 0 {
		return fmt.Errorf("模型仍被 %d 个会话锁定选用,请改为「停用」以保留其单价(删除会使在跑会话按 0 计价漏扣)", n)
	}
	if err := s.repo.DeleteModel(id); err != nil {
		return err
	}
	s.invalidate()
	return nil
}

// SetBinding 改某能力的绑定;purpose 必须在闭集内,model 必须在目录中(可以是停用行——
// admin 显式绑停用模型是自己的决定,绑定页会显示 enabled 状态)。改完触发 agent 配置重推
// (system.* / 其它绑定都可能影响推送槽位与固定能力,统一重推,幂等)。
func (s *Service) SetBinding(purpose, modelID string) error {
	valid := false
	for _, p := range AllPurposes {
		if p == purpose {
			valid = true
			break
		}
	}
	if !valid {
		return errors.New("未知的能力绑定项")
	}
	modelID = strings.TrimSpace(modelID)
	m := s.Get(modelID)
	if modelID == "" || m == nil {
		return errors.New("绑定的模型不在目录中")
	}
	// system.* 槽位随 PushConfig 灌进默认端点,只能绑默认端点下的模型(2026-07-14 事故修复)。
	if (purpose == PurposeSystemMain || purpose == PurposeSystemFast) && m.ProviderID != 0 {
		return errors.New("「系统主模型/系统快模型」走默认端点的槽位,只能绑定默认端点下的模型")
	}
	if err := s.repo.UpsertBinding(purpose, modelID); err != nil {
		return err
	}
	s.invalidate()
	s.triggerPush()
	return nil
}

func (s *Service) triggerPush() {
	if s.pushTrigger != nil {
		s.pushTrigger()
	}
}
