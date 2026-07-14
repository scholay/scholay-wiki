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
	"math"
	"strings"
	"sync"
	"time"

	"gorm.io/gorm"
)

// cacheTTL —— 目录/绑定的内存缓存(照抄 vip.ConfigService 手法):Resolve 在 WS/审稿热路径上
// 被调用,不能每次打 DB;admin 写操作主动失效,最坏 30s 收敛。
const cacheTTL = 30 * time.Second

// snapshot 一次性加载的目录+绑定快照(读侧无锁共享,写时整体替换)。
type snapshot struct {
	models    []AgentModel
	byModel   map[string]*AgentModel // model_id → 行(含停用行:计价/解析必须查得到,enabled 只约束选择器)
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
		return &snapshot{byModel: map[string]*AgentModel{}, bindings: map[string]string{}, providers: map[uint64]*AgentProvider{}}
	}
	bindings, err := s.repo.ListBindings()
	if err != nil {
		slog.Warn("modelcatalog: load bindings failed", "err", err)
		if stale != nil {
			return stale
		}
		return &snapshot{byModel: map[string]*AgentModel{}, bindings: map[string]string{}, providers: map[uint64]*AgentProvider{}}
	}
	provs, err := s.repo.ListProviders()
	if err != nil {
		slog.Warn("modelcatalog: load providers failed", "err", err)
		provs = nil // provider 读失败按「只有默认」降级,不阻断目录
	}

	snap := &snapshot{
		models:    models,
		byModel:   make(map[string]*AgentModel, len(models)),
		bindings:  make(map[string]string, len(bindings)),
		providers: make(map[uint64]*AgentProvider, len(provs)),
	}
	for i := range models {
		snap.byModel[models[i].ModelID] = &models[i]
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

// ResolveSlots 实现 agentconfig.SlotProvider:PushConfig 推给 agent 容器的槽位值由绑定生成
// (main/sonnet/opus = system.main,haiku = system.fast),agent 侧 resolveTier/带外调用零改动。
func (s *Service) ResolveSlots() (main string, fast string) {
	main = s.Resolve(PurposeSystemMain)
	fast = s.Resolve(PurposeSystemFast)
	if fast == "" {
		fast = main
	}
	return main, fast
}

// Get 按 model_id 查目录行,**含停用行**——计价(P3)与展示映射必须查得到已下架模型,
// enabled 只约束用户选择器与 P2 的 hub 闸。查不到返回 nil。
func (s *Service) Get(modelID string) *AgentModel {
	if m, ok := s.load().byModel[modelID]; ok {
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

// ProviderKey 实现 agentbridge.ModelCatalog(F0):"" = 默认 provider;"scholay-p<id>" = 额外。
func (s *Service) ProviderKey(modelID string) string {
	if p := s.ProviderFor(modelID); p != nil {
		return p.ExecutorKey()
	}
	return ""
}

// BillingWeight 返回模型计费倍率(clamp 下限防除零;目录 miss → 1 = raw 口径)。
// 计价/盖章路径用它 —— **含停用行**(下架的模型在跑的会话必须照常计价,不能变便宜)。
func (s *Service) BillingWeight(modelID string) float64 {
	if m := s.Get(modelID); m != nil {
		if m.BillingWeight < MinBillingWeight {
			return MinBillingWeight
		}
		return m.BillingWeight
	}
	return 1
}

// pricerMissWarn 目录 miss 告警限流(每分钟一条;上游改名/(reconciled) 哨兵会走到这)。
var (
	pricerMissMu sync.Mutex
	pricerMissAt time.Time
)

// PriceUsage 实现 llmusage.Pricer:weighted = raw总量 × billing_weight;
// cost = Σ(各类 tokens × 对应单价) —— 单价是 元/1M token,tokens × 单价恰好就是**微元**。
// 只走内存缓存(Record 在同步请求路径上,绝不回源 DB)。目录 miss → weight=1 + 限流 WARN。
func (s *Service) PriceUsage(model string, input, output, cacheRead, cacheWrite int) (int64, int64) {
	total := int64(input) + int64(output) + int64(cacheRead) + int64(cacheWrite)
	m := s.Get(model)
	if m == nil {
		if model != "" && model != "(reconciled)" {
			pricerMissMu.Lock()
			if time.Since(pricerMissAt) >= time.Minute {
				pricerMissAt = time.Now()
				slog.Warn("modelcatalog: 计价目录 miss,按 weight=1 兜底", "model", model)
			}
			pricerMissMu.Unlock()
		}
		return total, 0
	}
	w := m.BillingWeight
	if w < MinBillingWeight {
		w = MinBillingWeight
	}
	cost := int64(float64(input)*m.PriceIn + float64(output)*m.PriceOut +
		float64(cacheRead)*m.PriceCacheR + float64(cacheWrite)*m.PriceCacheW)
	return int64(float64(total)*w + 0.5), cost
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
	if m.MinTier != "" && tierRank(s.userTier(userID)) < tierRank(m.MinTier) {
		return errors.New("该模型需要更高会员档位")
	}
	return nil
}

// UserModelView 用户选择器 DTO(/api/v1/user/models)。
// 刻意不透四类单价与 notes;billing_weight 出口量化到 0.25(4 位小数会精确泄露上游价格比例)。
type UserModelView struct {
	ModelID       string  `json:"model_id"`
	DisplayName   string  `json:"display_name"`
	Description   string  `json:"description"`
	ContextWindow int     `json:"context_window"`
	SpeedClass    string  `json:"speed_class"`
	BillingWeight float64 `json:"billing_weight"`
	Locked        bool    `json:"locked"`   // min_tier 门槛未达 → 选择器置灰 + 升级引导
	MinTier       string  `json:"min_tier"` // 锁定时的引导文案用(pro/max)
	IsDefault     bool    `json:"is_default"`
}

// ListForUser 用户可见目录(enabled ∧ user_selectable,按 sort_order),default 按 feature 的
// chat_default 绑定标注。locked 的模型仍返回(置灰 + 升级引导是产品面,过滤是 hub 闸的事)。
func (s *Service) ListForUser(userID uint, featureKey string) []UserModelView {
	snap := s.load()
	def := s.Resolve("chat_default." + featureKey)
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
			BillingWeight: math.Round(m.BillingWeight*4) / 4,
			Locked:        m.MinTier != "" && tierRank(tier) < tierRank(m.MinTier),
			MinTier:       m.MinTier,
			IsDefault:     m.ModelID == def,
		})
	}
	return out
}

// ListModels 全量目录(admin 页)。
func (s *Service) ListModels() ([]AgentModel, error) {
	return s.repo.ListModels()
}

// BindingViews admin 绑定页:11 个 purpose 闭集逐个给出 绑定值/生效值/是否回退态。
func (s *Service) BindingViews() []BindingView {
	snap := s.load()
	views := make([]BindingView, 0, len(AllPurposes))
	for _, p := range AllPurposes {
		bound := snap.bindings[p]
		effective := s.Resolve(p)
		views = append(views, BindingView{
			Purpose:   p,
			ModelID:   bound,
			Effective: effective,
			Fallback:  bound == "" || bound != effective,
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
	if m.BillingWeight < MinBillingWeight || m.BillingWeight > MaxBillingWeight {
		return fmt.Errorf("计费倍率必须在 %.2f ~ %.0f 之间", float64(MinBillingWeight), float64(MaxBillingWeight))
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
	if modelID == "" || s.Get(modelID) == nil {
		return errors.New("绑定的模型不在目录中")
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
