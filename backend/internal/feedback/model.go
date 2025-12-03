// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package feedback

import (
	"fmt"
	"time"
)

// FeedbackStatus 反馈状态
type FeedbackStatus string

const (
	StatusPending   FeedbackStatus = "pending"   // 待处理
	StatusProcessed FeedbackStatus = "processed" // 已处理
	StatusReplied   FeedbackStatus = "replied"   // 已回复
	StatusClosed    FeedbackStatus = "closed"    // 已关闭
)

// Feedback 反馈模型
type Feedback struct {
	ID          uint           `gorm:"primarykey" json:"id"`
	Email       string         `gorm:"size:255;not null;index" json:"email"`                   // 反馈者邮箱
	Content     string         `gorm:"type:text;not null" json:"content"`                      // 反馈内容
	Attachments string         `gorm:"type:text" json:"attachments"`                           // 附件列表（JSON格式）
	UserID      *uint          `gorm:"index" json:"userId"`                                    // 用户ID（登录用户）
	Username    string         `gorm:"size:100" json:"username"`                               // 用户名（登录用户）
	IP          string         `gorm:"size:45" json:"ip"`                                      // 反馈者IP
	IPLocation  string         `gorm:"size:255" json:"ipLocation"`                             // IP归属地
	Status      FeedbackStatus `gorm:"size:20;default:pending;index" json:"status"`            // 状态
	ReplyContent string        `gorm:"type:text" json:"replyContent"`                          // 回复内容
	RepliedAt   *time.Time     `json:"repliedAt"`                                              // 回复时间
	RepliedBy   string         `gorm:"size:100" json:"repliedBy"`                              // 回复人
	CreatedAt   time.Time      `gorm:"index" json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
}

// TableName 指定表名
func (Feedback) TableName() string {
	return "feedbacks"
}

// Attachment 附件信息（用于JSON序列化，兼容旧数据）
type Attachment struct {
	Name string `json:"name"` // 文件名
	URL  string `json:"url"`  // 文件URL
	Size int64  `json:"size"` // 文件大小（字节）
	Type string `json:"type"` // 文件类型（image/file）
}

// FeedbackAttachment 反馈附件数据库模型
type FeedbackAttachment struct {
	ID           uint      `gorm:"primarykey" json:"id"`
	UploadKey    string    `gorm:"size:36;not null;index" json:"uploadKey"`       // 上传批次key
	FeedbackID   *uint     `gorm:"index" json:"feedbackId"`                       // 关联的反馈ID
	OriginalName string    `gorm:"size:255;not null" json:"originalName"`         // 原始文件名
	FileData     []byte    `gorm:"type:longblob;not null" json:"-"`               // 文件二进制数据（不返回给前端）
	FileSize     int64     `gorm:"not null" json:"fileSize"`                      // 文件大小
	FileType     string    `gorm:"size:20;not null" json:"fileType"`              // 文件类型 image/file
	MimeType     string    `gorm:"size:100;not null" json:"mimeType"`             // MIME类型
	IsUsed       bool      `gorm:"default:false;index" json:"isUsed"`             // 是否已使用
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// TableName 指定表名
func (FeedbackAttachment) TableName() string {
	return "feedback_attachments"
}

// ToAttachment 转换为Attachment格式（用于响应，URL指向下载接口）
func (fa *FeedbackAttachment) ToAttachment() Attachment {
	return Attachment{
		Name: fa.OriginalName,
		URL:  fmt.Sprintf("/api/v1/public/feedback/attachment/%d", fa.ID),
		Size: fa.FileSize,
		Type: fa.FileType,
	}
}

// CreateFeedbackRequest 创建反馈请求
type CreateFeedbackRequest struct {
	Email   string `json:"email" binding:"required,email"`
	Content string `json:"content" binding:"required,min=10,max=5000"`
}

// ReplyFeedbackRequest 回复反馈请求
type ReplyFeedbackRequest struct {
	ReplyContent string `json:"replyContent" binding:"required,min=1,max=5000"`
}

// UpdateStatusRequest 更新状态请求
type UpdateStatusRequest struct {
	Status FeedbackStatus `json:"status" binding:"required,oneof=pending processed replied closed"`
}

// FeedbackListRequest 反馈列表请求
type FeedbackListRequest struct {
	Page     int            `form:"page" binding:"min=1"`
	PageSize int            `form:"pageSize" binding:"min=1,max=100"`
	Status   FeedbackStatus `form:"status"`
	Email    string         `form:"email"`
	Keyword  string         `form:"keyword"`
	StartDate string        `form:"startDate"`
	EndDate   string        `form:"endDate"`
}

// FeedbackListResponse 反馈列表响应
type FeedbackListResponse struct {
	List     []Feedback `json:"list"`
	Total    int64      `json:"total"`
	Page     int        `json:"page"`
	PageSize int        `json:"pageSize"`
}

// FeedbackStats 反馈统计
type FeedbackStats struct {
	Total     int64 `json:"total"`
	Pending   int64 `json:"pending"`
	Processed int64 `json:"processed"`
	Replied   int64 `json:"replied"`
	Closed    int64 `json:"closed"`
}

