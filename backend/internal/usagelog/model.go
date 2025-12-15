// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package usagelog

import (
	"encoding/json"
	"time"
)

// UsageLog 功能使用统计日志
type UsageLog struct {
	ID          uint            `gorm:"primaryKey" json:"id"`
	UserID      *uint           `gorm:"index" json:"user_id"`
	SessionID   string          `gorm:"size:64;index" json:"session_id"`
	FeatureCode string          `gorm:"size:50;not null;index" json:"feature_code"`
	FeatureName string          `gorm:"size:100;not null" json:"feature_name"`
	Action      string          `gorm:"size:50;not null;index" json:"action"`
	EntryPoint  string          `gorm:"size:100;index" json:"entry_point"`
	RequestPath string          `gorm:"size:255" json:"request_path"`
	RefererPath string          `gorm:"size:255" json:"referer_path"`
	IPAddress   string          `gorm:"size:45;index" json:"ip_address"`
	UserAgent   string          `gorm:"size:500" json:"user_agent"`
	DeviceType  string          `gorm:"size:20" json:"device_type"`
	Browser     string          `gorm:"size:50" json:"browser"`
	OS          string          `gorm:"size:50" json:"os"`
	ExtraData   json.RawMessage `gorm:"type:json" json:"extra_data"`
	CreatedAt   time.Time       `gorm:"index" json:"created_at"`
}

// TableName 指定表名
func (UsageLog) TableName() string {
	return "usage_logs"
}

// FeatureConfig 功能配置
type FeatureConfig struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	FeatureCode  string    `gorm:"size:50;uniqueIndex" json:"feature_code"`
	FeatureName  string    `gorm:"size:100" json:"feature_name"`
	FeatureGroup string    `gorm:"size:50" json:"feature_group"`
	Description  string    `gorm:"size:255" json:"description"`
	Enabled      bool      `gorm:"default:true" json:"enabled"`
	SortOrder    int       `gorm:"default:0" json:"sort_order"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// TableName 指定表名
func (FeatureConfig) TableName() string {
	return "feature_configs"
}

// UsageLogWithUser 带用户信息的日志
type UsageLogWithUser struct {
	UsageLog
	Username *string `gorm:"column:username" json:"username"`
	Email    *string `gorm:"column:email" json:"email"`
}

// LogRequest 前端上报请求
type LogRequest struct {
	FeatureCode string                 `json:"feature_code" binding:"required"`
	FeatureName string                 `json:"feature_name"`
	Action      string                 `json:"action" binding:"required"`
	EntryPoint  string                 `json:"entry_point"`
	RequestPath string                 `json:"request_path"`
	RefererPath string                 `json:"referer_path"`
	SessionID   string                 `json:"session_id"`
	ExtraData   map[string]interface{} `json:"extra_data"`
}

// ListQuery 列表查询参数
type ListQuery struct {
	Page        int    `form:"page" binding:"min=1"`
	PageSize    int    `form:"page_size" binding:"min=1,max=100"`
	FeatureCode string `form:"feature_code"`
	Action      string `form:"action"`
	EntryPoint  string `form:"entry_point"`
	UserID      *uint  `form:"user_id"`
	IPAddress   string `form:"ip_address"`
	StartDate   string `form:"start_date"`
	EndDate     string `form:"end_date"`
	Keyword     string `form:"keyword"`
}

// StatsSummary 统计摘要
type StatsSummary struct {
	TotalCount      int64            `json:"total_count"`
	TodayCount      int64            `json:"today_count"`
	UniqueUsers     int64            `json:"unique_users"`
	UniqueSessions  int64            `json:"unique_sessions"`
	FeatureCounts   []FeatureCount   `json:"feature_counts"`
	DailyTrend      []DailyCount     `json:"daily_trend"`
	EntryPointStats []EntryPointStat `json:"entry_point_stats"`
}

// FeatureCount 功能统计
type FeatureCount struct {
	FeatureCode string `json:"feature_code"`
	FeatureName string `json:"feature_name"`
	Count       int64  `json:"count"`
}

// DailyCount 每日统计
type DailyCount struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

// EntryPointStat 入口统计
type EntryPointStat struct {
	EntryPoint string `json:"entry_point"`
	Count      int64  `json:"count"`
}

