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

// HotSearchKeyword 热门搜索关键词统计
type HotSearchKeyword struct {
	ID              uint64    `gorm:"primaryKey" json:"id"`
	Keyword         string    `gorm:"size:500;not null" json:"keyword"`
	KeywordHash     string    `gorm:"size:32;not null;uniqueIndex:uk_keyword_hash" json:"keyword_hash"`
	SearchCount     uint      `gorm:"not null;default:1" json:"search_count"`
	FirstSearchedAt time.Time `gorm:"not null" json:"first_searched_at"`
	LastSearchedAt  time.Time `gorm:"not null" json:"last_searched_at"`
}

// TableName 指定表名
func (HotSearchKeyword) TableName() string {
	return "hot_search_keywords"
}

// HotPaper 热门论文统计
type HotPaper struct {
	ID            uint64    `gorm:"primaryKey" json:"id"`
	PaperID       string    `gorm:"size:64;not null;uniqueIndex:uk_paper_id" json:"paper_id"`
	DOI           *string   `gorm:"size:255" json:"doi"`
	Title         *string   `gorm:"type:text" json:"title"`
	Abstract      *string   `gorm:"type:text" json:"abstract"`
	Authors       *string   `gorm:"type:text" json:"authors"` // JSON格式
	Year          *int      `json:"year"`
	Venue         *string   `gorm:"size:500" json:"venue"`
	ViewCount     uint      `gorm:"not null;default:1" json:"view_count"`
	FirstViewedAt time.Time `gorm:"not null" json:"first_viewed_at"`
	LastViewedAt  time.Time `gorm:"not null" json:"last_viewed_at"`
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
