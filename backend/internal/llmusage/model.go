// ============================================================================
// 统一 LLM token 用量账本 —— 项目侧(internal/ai)+ agent 侧(scholar_agent)
// 每次 LLM 调用(含每次 retry)记一行。读时按 user/feature/day 聚合。
//
// 设计要点见 backend/DESIGN-llm-token-accounting.md。一行一次调用; user_id 可空
// (NULL = 公众号/匿名); 异步写、best-effort(同 usagestat, 非计费级 ACID)。
// ============================================================================

package llmusage

import "time"

// Source —— 调用来自项目自身的 LLM 客户端 还是 scholar_agent 容器。
const (
	SourceProject = "project" // internal/ai (translate / matrix / wechat_oa)
	SourceAgent   = "agent"   // scholar_agent (smart_search / claw / peer_review)
)

// Feature 常量与 usagestat 对齐(同一套功能维度), 便于跨表关联。
const (
	FeatureSmartSearch = "smart_search"
	FeatureClaw        = "claw"
	FeaturePeerReview  = "peer_review"
	FeatureMatrix      = "matrix"
	FeatureTranslate   = "translate"
	FeatureWechatOA    = "wechat_oa"
	FeaturePrism       = "prism"
	// BoltSlides / SciDraw 是 claw 内的两个 mode, 但落账本时写自己的 feature key ——
	// 账本里实际存在这两个值(与 usagestat.FeatureBoltSlides / FeatureSciDraw 同名),
	// 没有对应 label 时看板的「功能」维度会直接显示英文 code。
	FeatureBoltSlides = "boltslides"
	FeatureSciDraw    = "sci_draw"
	FeatureStatLab    = "stat_lab"
	// FeatureMemory —— per-user 长期记忆的后台抽取(每轮对话后用便宜模型从对话里提画像)。
	// 2026-07-30 owner 拍板「凡消耗 token 一律扣用户额度」:此前的 SkipQuota 豁免已取消,
	// 记忆抽取与上下文压缩同标题生成一样正常计费(抽取有 90s 冷却,量级为便宜模型的小调用)。
	FeatureMemory = "memory"
)

// RetentionDays —— 账本保留天数(cleanup 删超期行, 防 per-call 表无限增长)。
const RetentionDays = 365

// LLMTokenUsage 账本一行。GORM 默认把 CamelCase 字段映射成 snake_case 列, 与
// 0006_llm_token_usage.sql 的列名一致(InputTokens→input_tokens 等)。
type LLMTokenUsage struct {
	ID                  uint64    `gorm:"primaryKey" json:"id"`
	UserID              *uint     `json:"user_id"`  // NULL = 公众号 / 匿名
	Feature             string    `json:"feature"`
	Source              string    `json:"source"`   // project | agent
	Provider            string    `json:"provider"`
	AccountID           *uint     `json:"account_id"` // third_party_accounts.id(project 侧)
	Model               string    `json:"model"`
	InputTokens         int       `json:"input_tokens"`
	OutputTokens        int       `json:"output_tokens"`
	TotalTokens         int       `json:"total_tokens"`
	CacheReadTokens     int       `json:"cache_read_tokens"`
	CacheCreationTokens int       `json:"cache_creation_tokens"`
	// CostMicroYuan (migration 0065):四类单价精算成本快照(微元;快照落行,目录调价不漂历史账),
	// P5 成本制起 = 驱动配额扣减的真源。0 = 旧数据 / Pricer 未接线。
	// WeightedTokens:P3 加权扣减量的历史列;P5 成本制起倍率作废,此列 = raw total(与 total_tokens 同值),
	// 仅作账本连续性保留(不再驱动配额,也不外露到任何 admin DTO)。
	WeightedTokens int64  `json:"weighted_tokens"`
	CostMicroYuan  int64  `json:"cost_micro_yuan"`
	RequestID      string `json:"request_id"`
	CreatedAt           time.Time `gorm:"autoCreateTime" json:"created_at"`
}

// TableName 指定表名。
func (LLMTokenUsage) TableName() string {
	return "llm_token_usage"
}
