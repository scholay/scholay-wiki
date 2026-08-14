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
	// 注:制作PPT(chat_default.boltslides)/ 科研绘图(chat_default.sci_draw)不再单列能力绑定 ——
	// 经 purposeAlias 归到 chat_default.claw(智能助手默认)。免费档覆盖(chat_default.*.free)整套已下线
	// (2026-07:不再区分免费/付费档,所有档位一律走主绑定)。这两组 key 现在只作为 purposeAlias 的别名源。

	PurposePeerreviewMeta        = "peerreview.meta"        // 审稿预填自动识别(便宜快,需 tool-use+严格 JSON)
	PurposePeerreviewLetter      = "peerreview.letter"      // 推荐信/审稿信起草
	PurposePeerreviewMethodology = "peerreview.methodology" // 方法论+选审稿人(强推理)
	PurposePeerreviewScoring     = "peerreview.scoring"     // 三审稿人盲评
	PurposePeerreviewChief       = "peerreview.chief"       // 主审裁决

	PurposePrismPlanner = "prism.planner" // 写作画像一次性选择(便宜)

	// 项目侧单次调用功能(0080)—— 原走第三方账号 LLM key,改经 agent /api/complete 单次接口,
	// 模型由这些绑定选(默认便宜档)。绑定缺失时 Resolve 回退 system.main。
	PurposeProjectTranslate = "project.translate" // 论文翻译(SSE 流式)
	PurposeProjectAnalysis  = "project.analysis"  // 论文分析 / 对比矩阵(结构化 JSON)
	PurposeProjectWechatOA  = "project.wechat_oa" // 公众号自动回复
	PurposeProjectRevision  = "project.revision"  // 智能写作 · 修改意见拆条(一次性 JSON)
)

// AllPurposes 绑定 key 闭集(admin 绑定页渲染顺序)—— 精简为「系统槽 + 用户功能」两组。
// 被合并/折叠的能力(见 purposeAlias)不在此列:admin 不单独配置,运行时经别名归到主 purpose。
var AllPurposes = []string{
	// 系统槽(基础设施:PushConfig 主/快槽位 —— 标题生成 / 记忆抽取 / 全局回退兜底,非用户功能)
	PurposeSystemMain, PurposeSystemFast,
	// 用户功能默认模型
	PurposeChatDefaultSmartSearch, // 智能文献搜索
	PurposeChatDefaultClaw,        // 智能助手(制作PPT / 科研绘图 经别名归此)
	PurposeChatDefaultPrism,       // 智能写作(写作画像 planner / 修改意见拆条 revision 经别名归此)
	PurposePeerreviewMeta,         // 智能审稿 · 预填识别 / 信件起草(letter 经别名归此)
	PurposePeerreviewMethodology,  // 智能审稿 · 审稿环节(scoring / chief 经别名归此)
	PurposeProjectTranslate,       // 论文翻译
	PurposeProjectAnalysis,        // 矩阵分析
	PurposeProjectWechatOA,        // 公众号回复
}

// purposeAlias 把「被合并/折叠、不在 admin 闭集里」的 purpose 解引用到主 purpose。
// Resolve 在查绑定前先 deref —— 调用方(peerreview.modelFor / hub chat_default / prism planner /
// ai.CompleteSimple)一律不用改,继续用各自原 purpose 常量即可。DB 里的旧别名绑定行由 migration 0082 清理。
var purposeAlias = map[string]string{
	"chat_default.boltslides":  PurposeChatDefaultClaw,       // 制作PPT → 智能助手默认
	"chat_default.sci_draw":    PurposeChatDefaultClaw,       // 科研绘图 → 智能助手默认(注:从 vision 模型降级到 flash)
	"chat_default.stat_lab":    PurposeChatDefaultClaw,       // 数据分析 → 智能助手默认(统计计算在引擎侧,模型只问诊与解读,不需要更强档)
	PurposePeerreviewLetter:    PurposePeerreviewMeta,        // 信件起草 → 预填识别(合并)
	PurposePeerreviewScoring:   PurposePeerreviewMethodology, // 审稿人盲评 → 审稿环节(合并)
	PurposePeerreviewChief:     PurposePeerreviewMethodology, // 主审裁决 → 审稿环节(合并)
	PurposePrismPlanner:        PurposeChatDefaultPrism,      // 写作画像 → 智能写作默认
	PurposeProjectRevision:     PurposeChatDefaultPrism,      // 修改意见拆条 → 智能写作默认
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
	// MaxInput 最大输入 token(migration 0088)。0 = 未配,agent 压缩墙回落「上下文 − 输出预留」自动算。
	// 上下文 = 输入 + 输出 的共享预算;拆出便于按各厂商口径(总窗 vs 最大输入)独立配置。
	MaxInput       int       `json:"max_input" gorm:"column:max_input;not null;default:0"`
	MaxOutput      int       `json:"max_output" gorm:"column:max_output;not null;default:0"`
	Vision         bool      `json:"vision" gorm:"column:vision;not null;default:false"` // 视觉能力(P2 图片通道):支持图片输入
	Flagship       bool      `json:"flagship" gorm:"column:flagship;not null;default:false"` // 旗舰标识(0089):用户选择器差异化高亮 + 旗舰标签
	PriceIn        float64   `json:"price_in" gorm:"column:price_in;type:decimal(12,4);not null;default:0"`
	PriceOut       float64   `json:"price_out" gorm:"column:price_out;type:decimal(12,4);not null;default:0"`
	PriceCacheR    float64   `json:"price_cache_r" gorm:"column:price_cache_r;type:decimal(12,4);not null;default:0"`
	PriceCacheW    float64   `json:"price_cache_w" gorm:"column:price_cache_w;type:decimal(12,4);not null;default:0"`
	BillingWeight  float64   `json:"billing_weight" gorm:"column:billing_weight;type:decimal(8,4);not null;default:1"`
	// 输入长度分档计价(migration 0084):prompt(input+cacheRead+cacheWrite,与 PriceUsage 实现
	// 一致)超过 InputTierThreshold 时切高档价格(千问 qwen3.7-plus 等 >256k 约 3×),
	// 否则长上下文请求平台白吃差价。InputTierThreshold=0 → 不分档(DeepSeek / max / flash 等扁平模型)。
	// price_*_hi 为 0 时 PriceUsage 回落基础值(防误配把价清零);BillingWeightHi 已随倍率制退休。
	InputTierThreshold int     `json:"input_tier_threshold" gorm:"column:input_tier_threshold;not null;default:0"`
	PriceInHi          float64 `json:"price_in_hi" gorm:"column:price_in_hi;type:decimal(12,4);not null;default:0"`
	PriceOutHi         float64 `json:"price_out_hi" gorm:"column:price_out_hi;type:decimal(12,4);not null;default:0"`
	PriceCacheRHi      float64 `json:"price_cache_r_hi" gorm:"column:price_cache_r_hi;type:decimal(12,4);not null;default:0"`
	PriceCacheWHi      float64 `json:"price_cache_w_hi" gorm:"column:price_cache_w_hi;type:decimal(12,4);not null;default:0"`
	BillingWeightHi    float64 `json:"billing_weight_hi" gorm:"column:billing_weight_hi;type:decimal(8,4);not null;default:0"`
	// 第三档(migration 0087):prompt 超过 InputTierThreshold2 时切更高档价 hi2(千问 qwen3.7-flash 等
	// 按 32k/256k 分 3 档)。InputTierThreshold2 须 > InputTierThreshold;=0 → 只 2 档或不分档。
	// price_*_hi2 为 0 时 PriceUsage 回落档2(hi)已选值。
	InputTierThreshold2 int     `json:"input_tier_threshold_2" gorm:"column:input_tier_threshold_2;not null;default:0"`
	PriceInHi2          float64 `json:"price_in_hi2" gorm:"column:price_in_hi2;type:decimal(12,4);not null;default:0"`
	PriceOutHi2         float64 `json:"price_out_hi2" gorm:"column:price_out_hi2;type:decimal(12,4);not null;default:0"`
	PriceCacheRHi2      float64 `json:"price_cache_r_hi2" gorm:"column:price_cache_r_hi2;type:decimal(12,4);not null;default:0"`
	PriceCacheWHi2      float64 `json:"price_cache_w_hi2" gorm:"column:price_cache_w_hi2;type:decimal(12,4);not null;default:0"`
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
