// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package message

import (
	"encoding/json"
	"time"
)

// MessageCategory 消息分类
type MessageCategory string

const (
	CategorySystem      MessageCategory = "system"      // 系统通知
	CategoryPromotion   MessageCategory = "promotion"   // 营销推广
	CategoryTransaction MessageCategory = "transaction" // 交易通知
)

// SendType 发送类型
type SendType string

const (
	SendTypeAll    SendType = "all"    // 全站广播
	SendTypeBatch  SendType = "batch"  // 批量用户
	SendTypeSingle SendType = "single" // 单个用户
)

// MessageStatus 消息状态
type MessageStatus string

const (
	StatusDraft     MessageStatus = "draft"     // 草稿
	StatusSent      MessageStatus = "sent"      // 已发送
	StatusCancelled MessageStatus = "cancelled" // 已取消
)

// MessageTemplate 消息模板
type MessageTemplate struct {
	ID        uint            `gorm:"primaryKey" json:"id"`
	Code      string          `gorm:"size:50;uniqueIndex" json:"code"`
	Name      string          `gorm:"size:100;not null" json:"name"`
	Title     string          `gorm:"size:200;not null" json:"title"`
	Content   string          `gorm:"type:text;not null" json:"content"`
	Category  MessageCategory `gorm:"size:50;default:system" json:"category"`
	Variables *string         `gorm:"type:json" json:"variables"`
	IsActive  bool            `gorm:"default:true" json:"is_active"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// TableName 指定表名
func (MessageTemplate) TableName() string {
	return "message_templates"
}

// GetVariablesMap 获取变量定义
func (t *MessageTemplate) GetVariablesMap() map[string]string {
	if t.Variables == nil {
		return nil
	}
	var vars map[string]string
	if err := json.Unmarshal([]byte(*t.Variables), &vars); err != nil {
		return nil
	}
	return vars
}

// Message 站内信主表
type Message struct {
	ID             uint            `gorm:"primaryKey" json:"id"`
	Title          string          `gorm:"size:200;not null" json:"title"`
	Content        string          `gorm:"type:text;not null" json:"content"`
	Category       MessageCategory `gorm:"size:50;default:system" json:"category"`
	SendType       SendType        `gorm:"size:20;default:all" json:"send_type"`
	TargetPlans    *string         `gorm:"type:json" json:"target_plans"`
	TargetUserIDs  *string         `gorm:"type:json" json:"target_user_ids"`
	LinkURL        *string         `gorm:"size:500" json:"link_url"`
	LinkText       *string         `gorm:"size:100" json:"link_text"`
	SenderID       *uint           `json:"sender_id"`
	SenderName     *string         `gorm:"size:100" json:"sender_name"`
	SendAt         *time.Time      `json:"send_at"`
	ExpireAt       *time.Time      `json:"expire_at"`
	Status         MessageStatus   `gorm:"size:20;default:draft" json:"status"`
	RecipientCount int             `gorm:"default:0" json:"recipient_count"`
	ReadCount      int             `gorm:"default:0" json:"read_count"`
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// TableName 指定表名
func (Message) TableName() string {
	return "messages"
}

// GetTargetPlans 获取目标会员等级列表
func (m *Message) GetTargetPlans() []string {
	if m.TargetPlans == nil {
		return nil
	}
	var plans []string
	if err := json.Unmarshal([]byte(*m.TargetPlans), &plans); err != nil {
		return nil
	}
	return plans
}

// GetTargetUserIDs 获取目标用户ID列表
func (m *Message) GetTargetUserIDs() []uint {
	if m.TargetUserIDs == nil {
		return nil
	}
	var ids []uint
	if err := json.Unmarshal([]byte(*m.TargetUserIDs), &ids); err != nil {
		return nil
	}
	return ids
}

// UserMessage 用户消息状态表
type UserMessage struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"not null;index" json:"user_id"`
	MessageID uint       `gorm:"not null;index" json:"message_id"`
	IsRead    bool       `gorm:"default:false" json:"is_read"`
	ReadAt    *time.Time `json:"read_at"`
	IsDeleted bool       `gorm:"default:false" json:"is_deleted"`
	DeletedAt *time.Time `json:"deleted_at"`
	CreatedAt time.Time  `json:"created_at"`

	// 关联
	Message *Message `gorm:"foreignKey:MessageID" json:"message,omitempty"`
}

// TableName 指定表名
func (UserMessage) TableName() string {
	return "user_messages"
}

// ========== 请求/响应结构体 ==========

// CreateMessageRequest 创建消息请求
type CreateMessageRequest struct {
	Title         string          `json:"title" binding:"required,max=200"`
	Content       string          `json:"content" binding:"required"`
	Category      MessageCategory `json:"category" binding:"omitempty,oneof=system promotion transaction"`
	SendType      SendType        `json:"send_type" binding:"required,oneof=all batch single by_plan"`
	TargetPlans   []string        `json:"target_plans"`   // by_plan 时使用
	TargetUserIDs []uint          `json:"target_user_ids"` // batch/single 时使用
	LinkURL       string          `json:"link_url" binding:"omitempty,url,max=500"`
	LinkText      string          `json:"link_text" binding:"omitempty,max=100"`
	ExpireAt      *time.Time      `json:"expire_at"`
	SendNow       bool            `json:"send_now"` // 是否立即发送
}

// UpdateMessageRequest 更新消息请求（草稿状态）
type UpdateMessageRequest struct {
	Title         string          `json:"title" binding:"omitempty,max=200"`
	Content       string          `json:"content"`
	Category      MessageCategory `json:"category" binding:"omitempty,oneof=system promotion transaction"`
	SendType      SendType        `json:"send_type" binding:"omitempty,oneof=all batch single by_plan"`
	TargetPlans   []string        `json:"target_plans"`
	TargetUserIDs []uint          `json:"target_user_ids"`
	LinkURL       string          `json:"link_url" binding:"omitempty,url,max=500"`
	LinkText      string          `json:"link_text" binding:"omitempty,max=100"`
	ExpireAt      *time.Time      `json:"expire_at"`
}

// MessageListRequest 消息列表请求
type MessageListRequest struct {
	Page     int             `form:"page" binding:"min=1"`
	PageSize int             `form:"page_size" binding:"min=1,max=100"`
	Category MessageCategory `form:"category"`
	Status   MessageStatus   `form:"status"`
	Keyword  string          `form:"keyword"`
}

// UserMessageListRequest 用户消息列表请求
type UserMessageListRequest struct {
	Page     int             `form:"page" binding:"min=1"`
	PageSize int             `form:"page_size" binding:"min=1,max=50"`
	Category MessageCategory `form:"category"`
	IsRead   *bool           `form:"is_read"`
}

// MessageResponse 消息响应
type MessageResponse struct {
	ID             uint            `json:"id"`
	Title          string          `json:"title"`
	Content        string          `json:"content"`
	Category       MessageCategory `json:"category"`
	SendType       SendType        `json:"send_type"`
	TargetPlans    []string        `json:"target_plans,omitempty"`
	LinkURL        string          `json:"link_url,omitempty"`
	LinkText       string          `json:"link_text,omitempty"`
	SenderName     string          `json:"sender_name,omitempty"`
	SendAt         *time.Time      `json:"send_at"`
	ExpireAt       *time.Time      `json:"expire_at,omitempty"`
	Status         MessageStatus   `json:"status"`
	RecipientCount int             `json:"recipient_count"`
	ReadCount      int             `json:"read_count"`
	ReadRate       float64         `json:"read_rate"` // 已读率
	CreatedAt      time.Time       `json:"created_at"`
}

// UserMessageResponse 用户消息响应
type UserMessageResponse struct {
	ID        uint            `json:"id"`
	MessageID uint            `json:"message_id"`
	Title     string          `json:"title"`
	Content   string          `json:"content"`
	Category  MessageCategory `json:"category"`
	LinkURL   string          `json:"link_url,omitempty"`
	LinkText  string          `json:"link_text,omitempty"`
	IsRead    bool            `json:"is_read"`
	ReadAt    *time.Time      `json:"read_at,omitempty"`
	SendAt    *time.Time      `json:"send_at"`
	CreatedAt time.Time       `json:"created_at"`
}

// MessageListResponse 消息列表响应
type MessageListResponse struct {
	List     []MessageResponse `json:"list"`
	Total    int64             `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
}

// UserMessageListResponse 用户消息列表响应
type UserMessageListResponse struct {
	List     []UserMessageResponse `json:"list"`
	Total    int64                 `json:"total"`
	Page     int                   `json:"page"`
	PageSize int                   `json:"page_size"`
}

// UnreadCountResponse 未读消息数量响应
type UnreadCountResponse struct {
	Count int64 `json:"count"`
}

// MessageStatsResponse 消息统计响应
type MessageStatsResponse struct {
	TotalMessages   int64   `json:"total_messages"`
	TotalRecipients int64   `json:"total_recipients"`
	TotalRead       int64   `json:"total_read"`
	OverallReadRate float64 `json:"overall_read_rate"`
	ByCategory      []struct {
		Category MessageCategory `json:"category"`
		Count    int64           `json:"count"`
	} `json:"by_category"`
	BySendType []struct {
		SendType SendType `json:"send_type"`
		Count    int64    `json:"count"`
	} `json:"by_send_type"`
}

// ========== 模板相关 ==========

// CreateTemplateRequest 创建模板请求
type CreateTemplateRequest struct {
	Code      string            `json:"code" binding:"required,max=50"`
	Name      string            `json:"name" binding:"required,max=100"`
	Title     string            `json:"title" binding:"required,max=200"`
	Content   string            `json:"content" binding:"required"`
	Category  MessageCategory   `json:"category" binding:"omitempty,oneof=system promotion transaction"`
	Variables map[string]string `json:"variables"`
}

// UpdateTemplateRequest 更新模板请求
type UpdateTemplateRequest struct {
	Name      string            `json:"name" binding:"omitempty,max=100"`
	Title     string            `json:"title" binding:"omitempty,max=200"`
	Content   string            `json:"content"`
	Category  MessageCategory   `json:"category" binding:"omitempty,oneof=system promotion transaction"`
	Variables map[string]string `json:"variables"`
	IsActive  *bool             `json:"is_active"`
}

// TemplateResponse 模板响应
type TemplateResponse struct {
	ID        uint              `json:"id"`
	Code      string            `json:"code"`
	Name      string            `json:"name"`
	Title     string            `json:"title"`
	Content   string            `json:"content"`
	Category  MessageCategory   `json:"category"`
	Variables map[string]string `json:"variables,omitempty"`
	IsActive  bool              `json:"is_active"`
	CreatedAt time.Time         `json:"created_at"`
	UpdatedAt time.Time         `json:"updated_at"`
}

// TemplateListRequest 模板列表请求
type TemplateListRequest struct {
	Page     int             `form:"page" binding:"min=1"`
	PageSize int             `form:"page_size" binding:"min=1,max=100"`
	Category MessageCategory `form:"category"`
	IsActive *bool           `form:"is_active"`
	Keyword  string          `form:"keyword"`
}

// TemplateListResponse 模板列表响应
type TemplateListResponse struct {
	List     []TemplateResponse `json:"list"`
	Total    int64              `json:"total"`
	Page     int                `json:"page"`
	PageSize int                `json:"page_size"`
}



