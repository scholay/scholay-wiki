// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package hotcontent

import (
	"time"
)

// 常量定义
const (
	HotContentRetentionDays = 180    // 6 months
	HotContentMaxRecords    = 100000 // 100k records
	CleanupBatchSize        = 1000   // Records per batch
)

// SearchType 搜索类型 —— 文献 / 期刊分开统计。
type SearchType string

const (
	SearchTypePaper   SearchType = "paper"   // 文献搜索
	SearchTypeJournal SearchType = "journal" // 期刊搜索
)

// HotSearchKeyword 热门搜索关键词统计 —— 同一关键词按 search_type 独立计数。
type HotSearchKeyword struct {
	ID              uint64    `gorm:"primaryKey" json:"id"`
	Keyword         string    `gorm:"size:500;not null" json:"keyword"`
	KeywordHash     string    `gorm:"size:32;not null;uniqueIndex:uk_keyword_hash_type,priority:1" json:"keyword_hash"`
	SearchType      string    `gorm:"size:16;not null;default:paper;uniqueIndex:uk_keyword_hash_type,priority:2" json:"search_type"`
	SearchCount     uint      `gorm:"not null;default:1" json:"search_count"`
	FirstSearchedAt time.Time `gorm:"not null" json:"first_searched_at"`
	LastSearchedAt  time.Time `gorm:"not null" json:"last_searched_at"`
}

// TableName 指定表名
func (HotSearchKeyword) TableName() string {
	return "hot_search_keywords"
}

// HotPaper 热门论文统计 —— 曝光 / 点击 / SEO 直访 三个维度独立计数。
//
// ViewCount 是历史遗留列(旧的单一"查看次数"), 新逻辑不再写, 仅保留兼容/回滚兜底。
type HotPaper struct {
	ID              uint64    `gorm:"primaryKey" json:"id"`
	PaperID         string    `gorm:"size:64;not null;uniqueIndex:uk_paper_id" json:"paper_id"`
	DOI             *string   `gorm:"size:255" json:"doi"`
	Title           *string   `gorm:"type:text" json:"title"`
	Abstract        *string   `gorm:"type:text" json:"abstract"`
	Authors         *string   `gorm:"type:text" json:"authors"` // JSON格式
	Year            *int      `json:"year"`
	Venue           *string   `gorm:"size:500" json:"venue"`
	ImpressionCount uint64    `gorm:"not null;default:0" json:"impression_count"` // 曝光量(出现在搜索结果集中)
	ClickCount      uint64    `gorm:"not null;default:0" json:"click_count"`      // 点击量(从搜索结果点开详情)
	SeoViewCount    uint64    `gorm:"not null;default:0" json:"seo_view_count"`   // SEO 直访量(经 /paper/:slug 直接访问)
	ViewCount       uint      `gorm:"not null;default:0" json:"view_count"`       // 历史遗留, 不再写
	FirstViewedAt   time.Time `gorm:"not null" json:"first_viewed_at"`
	LastViewedAt    time.Time `gorm:"not null" json:"last_viewed_at"`
}

// TableName 指定表名
func (HotPaper) TableName() string {
	return "hot_papers"
}

// PaperViewData 论文查看数据（前端上报）
type PaperViewData struct {
	PaperID  string  `json:"paper_id"`
	DOI      *string `json:"doi"`
	Title    *string `json:"title"`
	Abstract *string `json:"abstract"`
	Authors  *string `json:"authors"` // JSON格式
	Year     *int    `json:"year"`
	Venue    *string `json:"venue"`
}

// HotKeywordsQuery 热门关键词查询参数
type HotKeywordsQuery struct {
	Days     int `form:"days" binding:"min=1,max=180"`
	Page     int `form:"page" binding:"min=1"`
	PageSize int `form:"page_size" binding:"min=1,max=100"`
}

// HotPapersQuery 热门论文查询参数
type HotPapersQuery struct {
	Days     int `form:"days" binding:"min=1,max=180"`
	Page     int `form:"page" binding:"min=1"`
	PageSize int `form:"page_size" binding:"min=1,max=100"`
}

// HotKeywordsResponse 热门关键词响应
type HotKeywordsResponse struct {
	Items    []HotSearchKeyword `json:"items"`
	Total    int64              `json:"total"`
	Page     int                `json:"page"`
	PageSize int                `json:"page_size"`
}

// HotPapersResponse 热门论文响应
type HotPapersResponse struct {
	Items    []HotPaper `json:"items"`
	Total    int64      `json:"total"`
	Page     int        `json:"page"`
	PageSize int        `json:"page_size"`
}

// CleanupStats 清理统计
type CleanupStats struct {
	KeywordsDeleted int64 `json:"keywords_deleted"`
	PapersDeleted   int64 `json:"papers_deleted"`
}

// HotContentConfig 清理策略 (单行表, id=1)。常量 HotContentRetentionDays /
// HotContentMaxRecords 现在只作为种子默认值与 DB 不可读时的兜底, 业务路径全部从这里读。
type HotContentConfig struct {
	ID            uint8     `gorm:"primaryKey" json:"id"`
	RetentionDays uint      `gorm:"not null;default:180" json:"retention_days"`
	MaxRecords    uint      `gorm:"not null;default:100000" json:"max_records"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// TableName 指定表名
func (HotContentConfig) TableName() string {
	return "hot_content_config"
}

// HotContentConfigUpdateRequest 更新策略入参 —— 给出合理上下限, 防止填错把表撑爆/瞬间清空。
type HotContentConfigUpdateRequest struct {
	RetentionDays int `json:"retention_days" binding:"required,min=1,max=3650"`     // 1 天 ~ 10 年
	MaxRecords    int `json:"max_records"    binding:"required,min=100,max=10000000"` // 100 ~ 1000 万
}
