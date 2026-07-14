// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 模型目录 + 能力绑定(模型目录化 P1,方案 docs/research/model-catalog-2026-07/REPORT.md)。
//
// agent_models        目录:N 个模型取代 agent_config 4 槽位,承载上下文/四类单价/计费倍率/可选性。
// agent_model_bindings 绑定:purpose(能力 key)→ model_id。固定能力(审稿各阶段/标题记忆/各
//                      feature 默认)全部经 Resolve(purpose) 取模型,admin 可改、不再写死槽位。
package modelcatalog

import (
	"regexp"
	"time"
)

// Purpose 常量 —— 能力绑定 key 的闭集(绑定行不可删,只可改指向)。
const (
	PurposeSystemMain = "system.main" // PushConfig 填 agent 槽位 main/sonnet/opus(兜底+带外)
	PurposeSystemFast = "system.fast" // PushConfig 填 agent 槽位 haiku(标题生成/记忆抽取)

	PurposeChatDefaultSmartSearch = "chat_default.smart_search" // 交互会话默认模型(P2 sendInitialModel)
	PurposeChatDefaultClaw        = "chat_default.claw"
	PurposeChatDefaultPrism       = "chat_default.prism"

	PurposePeerreviewMeta        = "peerreview.meta"        // 审稿预填自动识别(便宜快,需 tool-use+严格 JSON)
	PurposePeerreviewLetter      = "peerreview.letter"      // 推荐信/审稿信起草
	PurposePeerreviewMethodology = "peerreview.methodology" // 方法论+选审稿人(强推理)
	PurposePeerreviewScoring     = "peerreview.scoring"     // 三审稿人盲评
	PurposePeerreviewChief       = "peerreview.chief"       // 主审裁决

	PurposePrismPlanner = "prism.planner" // 写作画像一次性选择(便宜)
)

// AllPurposes 绑定 key 闭集(admin 绑定页渲染顺序)。
var AllPurposes = []string{
	PurposeSystemMain, PurposeSystemFast,
	PurposeChatDefaultSmartSearch, PurposeChatDefaultClaw, PurposeChatDefaultPrism,
	PurposePeerreviewMeta, PurposePeerreviewLetter, PurposePeerreviewMethodology,
	PurposePeerreviewScoring, PurposePeerreviewChief,
	PurposePrismPlanner,
}

// billing_weight 合法区间:下限堵「除零/免费模型不受额度约束」,上限防手滑。
const (
	MinBillingWeight = 0.05
	MaxBillingWeight = 100
)

// modelIDPattern —— model_id 字符白名单。防两类问题:①admin「试连」等场景把 id 拼进请求时
// 被 ../ ? # 改写路径;②collation 大小写变体绕过校验。
var modelIDPattern = regexp.MustCompile(`^[A-Za-z0-9._:/-]{1,200}$`)

// ValidModelID 报告 model_id 是否落在白名单字符集内。
func ValidModelID(id string) bool { return modelIDPattern.MatchString(id) }

// AgentModel 目录一行(表 agent_models)。
type AgentModel struct {
	ID             uint64    `json:"id" gorm:"primaryKey"`
	ModelID string `json:"model_id" gorm:"column:model_id;type:varchar(200);not null"`
	// ProviderID (migration 0066, F0):0 = 默认 provider(agent_config 链);>0 = agent_providers.id。
	// 接口格式挂 provider(格式是端点属性),模型选 provider 即隐含 api_format。
	ProviderID uint64 `json:"provider_id" gorm:"column:provider_id;not null;default:0"`
	DisplayName    string    `json:"display_name" gorm:"column:display_name;type:varchar(100);not null;default:''"`
	Description    string    `json:"description" gorm:"column:description;type:varchar(500);not null;default:''"`
	Channel        string    `json:"channel" gorm:"column:channel;type:varchar(16);not null;default:'agent'"`
	ContextWindow  int       `json:"context_window" gorm:"column:context_window;not null;default:128000"`
	MaxOutput      int       `json:"max_output" gorm:"column:max_output;not null;default:0"`
	Vision         bool      `json:"vision" gorm:"column:vision;not null;default:false"` // 视觉能力(P2 图片通道):支持图片输入
	PriceIn        float64   `json:"price_in" gorm:"column:price_in;type:decimal(12,4);not null;default:0"`
	PriceOut       float64   `json:"price_out" gorm:"column:price_out;type:decimal(12,4);not null;default:0"`
	PriceCacheR    float64   `json:"price_cache_r" gorm:"column:price_cache_r;type:decimal(12,4);not null;default:0"`
	PriceCacheW    float64   `json:"price_cache_w" gorm:"column:price_cache_w;type:decimal(12,4);not null;default:0"`
	BillingWeight  float64   `json:"billing_weight" gorm:"column:billing_weight;type:decimal(8,4);not null;default:1"`
	SpeedClass     string    `json:"speed_class" gorm:"column:speed_class;type:varchar(16);not null;default:'balanced'"`
	UserSelectable bool      `json:"user_selectable" gorm:"column:user_selectable;not null;default:false"`
	MinTier        string    `json:"min_tier" gorm:"column:min_tier;type:varchar(16);not null;default:''"`
	Enabled        bool      `json:"enabled" gorm:"column:enabled;not null;default:true"`
	SortOrder      int       `json:"sort_order" gorm:"column:sort_order;not null;default:0"`
	Notes          string    `json:"notes" gorm:"column:notes;type:varchar(500);not null;default:''"`
	CreatedAt      time.Time `json:"created_at" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt      time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

// TableName 指定表名。
func (AgentModel) TableName() string { return "agent_models" }

// ModelBinding 能力绑定一行(表 agent_model_bindings)。
type ModelBinding struct {
	Purpose   string    `json:"purpose" gorm:"column:purpose;primaryKey;type:varchar(64)"`
	ModelID   string    `json:"model_id" gorm:"column:model_id;type:varchar(200);not null"`
	UpdatedAt time.Time `json:"updated_at" gorm:"column:updated_at;autoUpdateTime"`
}

// TableName 指定表名。
func (ModelBinding) TableName() string { return "agent_model_bindings" }

// BindingView admin 绑定页 DTO:绑定值 + 实际生效值 + 是否处于回退态(标红用)。
// Resolve 的回退绝不静默:fallback=true 时 effective≠bound(或 bound 为空),admin 必须看得见。
type BindingView struct {
	Purpose   string `json:"purpose"`
	ModelID   string `json:"model_id"`  // 绑定的值(空=未绑定)
	Effective string `json:"effective"` // Resolve 实际返回
	Fallback  bool   `json:"fallback"`  // 生效值 ≠ 绑定值(绑定缺失/指向不存在的模型)
}
