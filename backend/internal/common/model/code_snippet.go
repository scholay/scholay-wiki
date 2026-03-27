// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package model

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// CodeSnippetCategory 代码片段分类
type CodeSnippetCategory string

const (
	CategorySEO       CodeSnippetCategory = "seo"       // SEO相关
	CategoryAnalytics CodeSnippetCategory = "analytics" // 统计分析
	CategoryAd        CodeSnippetCategory = "ad"        // 广告
	CategorySocial    CodeSnippetCategory = "social"    // 社交
	CategoryOther     CodeSnippetCategory = "other"     // 其他
)

// CodeSnippetPosition 代码片段注入位置
type CodeSnippetPosition string

const (
	PositionHead      CodeSnippetPosition = "head"       // 头部
	PositionBodyStart CodeSnippetPosition = "body_start" // body开始
	PositionBodyEnd   CodeSnippetPosition = "body_end"   // body结束
)

// StringArray 用于 JSON 数组字段
type StringArray []string

// Scan 实现 sql.Scanner 接口
func (s *StringArray) Scan(value any) error {
	if value == nil {
		*s = nil
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, s)
}

// Value 实现 driver.Valuer 接口
func (s StringArray) Value() (driver.Value, error) {
	if s == nil {
		return nil, nil
	}
	return json.Marshal(s)
}

// CodeSnippet 代码片段配置表（用于用户端前端的SEO、广告、统计等代码注入）
type CodeSnippet struct {
	ID          uint                `gorm:"primaryKey" json:"id"`
	Name        string              `gorm:"type:varchar(100);not null" json:"name"`                       // 配置名称
	CodeKey     string              `gorm:"type:varchar(50);uniqueIndex;not null" json:"code_key"`        // 唯一标识键
	Category    CodeSnippetCategory `gorm:"type:varchar(30);not null;default:other" json:"category"`      // 分类
	Position    CodeSnippetPosition `gorm:"type:varchar(20);not null;default:head" json:"position"`       // 注入位置
	CodeContent string              `gorm:"type:text;not null" json:"code_content"`                       // 代码内容
	Description string              `gorm:"type:varchar(500)" json:"description"`                         // 配置说明
	IsEnabled   bool                `gorm:"default:true" json:"is_enabled"`                               // 是否启用
	Priority    int                 `gorm:"not null;default:100" json:"priority"`                         // 优先级（数字越小越先加载）
	Pages       StringArray         `gorm:"type:json" json:"pages"`                                       // 生效页面
	CreatedAt   time.Time           `json:"created_at"`
	UpdatedAt   time.Time           `json:"updated_at"`
}

// TableName 指定表名
func (CodeSnippet) TableName() string {
	return "code_snippets"
}

// CodeSnippetResponse 代码片段响应（用户端获取）
type CodeSnippetResponse struct {
	Position    CodeSnippetPosition `json:"position"`
	CodeContent string              `json:"code_content"`
	Priority    int                 `json:"priority"`
}

// CodeSnippetsGroupedResponse 按位置分组的代码片段响应
type CodeSnippetsGroupedResponse struct {
	Head      []CodeSnippetResponse `json:"head"`
	BodyStart []CodeSnippetResponse `json:"body_start"`
	BodyEnd   []CodeSnippetResponse `json:"body_end"`
}
