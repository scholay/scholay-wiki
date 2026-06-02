// ============================================================================
// Scholay学术 V1.0
// 功能使用统计 v2 —— 取代旧 internal/usagelog 的"功能项统计"。
//
// 旧系统 (usagelog + usage_logs 表) 经一次迭代后数据不健康 (幽灵 feature_code、
// 一堆从不填充的字段),已废弃: 旧埋点全部移除、旧表保留为历史只读。
// 本模块是干净重做: 一张原始事件表 usage_events,一行一事件,读时聚合。
// ============================================================================

package usagestat

import (
	"encoding/json"
	"time"
)

// Feature 功能维度常量。每个值对应用户端一个可统计的功能。
const (
	FeaturePaperSearch   = "paper_search"   // 传统文献搜索
	FeatureSmartSearch   = "smart_search"   // 智能搜索
	FeatureJournalSearch = "journal_search" // 期刊搜索
	FeatureStaging       = "staging"        // 暂存
	FeatureFavorite      = "favorite"       // 收藏
	FeatureMatrix        = "matrix"         // 矩阵分析
	FeaturePeerReview    = "peer_review"    // 智能审稿
	FeatureClaw          = "claw"           // 智能助手
	FeatureTranslate     = "translate"      // 论文翻译
)

// FeatureNames 功能中文名 —— admin 展示用。新增功能时在这里登记。
var FeatureNames = map[string]string{
	FeaturePaperSearch:   "传统搜索",
	FeatureSmartSearch:   "智能搜索",
	FeatureJournalSearch: "期刊搜索",
	FeatureStaging:       "暂存",
	FeatureFavorite:      "收藏",
	FeatureMatrix:        "矩阵分析",
	FeaturePeerReview:    "智能审稿",
	FeatureClaw:          "智能助手",
	FeatureTranslate:     "论文翻译",
}

// FeatureName 取功能中文名, 未登记则回退原 code。
func FeatureName(feature string) string {
	if n, ok := FeatureNames[feature]; ok {
		return n
	}
	return feature
}

// Source 来源上下文 —— 暂存/收藏区分来自传统搜索还是智能搜索。
const (
	SourceTraditional = "traditional"
	SourceSmart       = "smart"
)

// UsageEvent 一条功能使用事件 (原始事件, admin 读时再聚合)。
type UsageEvent struct {
	ID            uint64          `gorm:"primaryKey" json:"id"`
	UserID        *uint           `gorm:"index" json:"user_id"`                // NULL = 匿名
	AnonID        string          `gorm:"size:64;index" json:"anon_id"`        // 匿名访客稳定标识
	Feature       string          `gorm:"size:40;not null;index" json:"feature"`
	Action        string          `gorm:"size:40;not null" json:"action"`
	CorrelationID string          `gorm:"size:64;index" json:"correlation_id"` // 连贯性键 (审稿 submission_id 等)
	Source        string          `gorm:"size:20" json:"source"`               // traditional / smart
	IPAddress     string          `gorm:"size:45" json:"ip_address"`
	UserAgent     string          `gorm:"size:500" json:"user_agent"`
	DeviceType    string          `gorm:"size:20" json:"device_type"`
	Extra         json.RawMessage `gorm:"type:json" json:"extra"`
	CreatedAt     time.Time       `gorm:"autoCreateTime;index" json:"created_at"`
}

// TableName 指定表名
func (UsageEvent) TableName() string {
	return "usage_events"
}

// 数据保留天数 —— cleanup 删超过此天数的事件 (兜底常量, 防表无限增长)。
const RetentionDays = 365
