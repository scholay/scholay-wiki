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

// Feedback 反馈分类常量(对齐前端)
const (
	CategoryBug       = "bug"
	CategoryFeature   = "feature"
	CategoryComplaint = "complaint"
	CategoryPraise    = "praise"
	CategoryOther     = "other"
)

// Feedback 反馈模型
type Feedback struct {
	ID              uint           `gorm:"primarykey" json:"id"`
	Email           string         `gorm:"size:255;not null;index" json:"email"`                   // 反馈者邮箱
	Content         string         `gorm:"type:text;not null" json:"content"`                      // 反馈内容
	Attachments     string         `gorm:"type:text" json:"attachments"`                           // 附件列表（JSON格式）
	UserID          *uint          `gorm:"index" json:"userId"`                                    // 用户ID（登录用户）
	Username        string         `gorm:"size:100" json:"username"`                               // 用户名（登录用户）
	IP              string         `gorm:"size:45" json:"ip"`                                      // 反馈者IP
	IPLocation      string         `gorm:"size:255" json:"ipLocation"`                             // IP归属地
	Status          FeedbackStatus `gorm:"size:20;default:pending;index" json:"status"`            // 状态
	Category        string         `gorm:"size:32;default:other;index" json:"category"`            // 分类: bug/feature/complaint/praise/other
	ReplyContent    string         `gorm:"type:text" json:"replyContent"`                          // 回复内容
	RepliedAt       *time.Time     `json:"repliedAt"`                                              // 回复时间
	RepliedBy       string         `gorm:"size:100" json:"repliedBy"`                              // 回复人
	AssignedTo      *uint          `gorm:"index" json:"assignedTo"`                                // 指派给某管理员处理 (user.id)
	AssigneeName    string         `gorm:"-" json:"assigneeName,omitempty"`                        // 不入库,运行时填充
	InternalNotes   string         `gorm:"type:text" json:"internalNotes"`                         // 内部协作备注 (用户不可见)
	FirstResponseAt *time.Time     `json:"firstResponseAt"`                                        // 首次响应时间 (SLA 跟踪)
	CreatedAt       time.Time      `gorm:"index" json:"createdAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
	DeletedAt       *time.Time     `gorm:"index" json:"-"`                                         // 软删除时间(NULL=未删)
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

// FeedbackAttachment 反馈附件数据库模型。
//
// 文件本体走 MinIO (object_key = MinIO bucket 里的对象键), MySQL 只存元数据。
// 历史上 file_data LONGBLOB 一直把内容塞库, 在 migration 0055 改造迁到 MinIO。
type FeedbackAttachment struct {
	ID           uint      `gorm:"primarykey" json:"id"`
	UploadKey    string    `gorm:"size:36;not null;index" json:"uploadKey"`       // 上传批次 key (UUID)
	FeedbackID   *uint     `gorm:"index" json:"feedbackId"`                       // 关联的反馈 ID, NULL = 孤儿(未绑定)
	OriginalName string    `gorm:"size:255;not null" json:"originalName"`         // 原始文件名 (给下载用)
	ObjectKey    string    `gorm:"size:512;not null" json:"-"`                    // MinIO bucket 里的对象键, 内部用
	FileSize     int64     `gorm:"not null" json:"fileSize"`                      // 文件大小 (字节)
	FileType     string    `gorm:"size:20;not null" json:"fileType"`              // 类型 image / file
	MimeType     string    `gorm:"size:100;not null" json:"mimeType"`             // MIME 类型
	IsUsed       bool      `gorm:"default:false;index" json:"isUsed"`             // 是否已 attach 到 feedback
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// TableName 指定表名
func (FeedbackAttachment) TableName() string {
	return "feedback_attachments"
}

// ToAttachment 转换为Attachment格式（用于响应，URL指向下载接口）
// URL 带上 uploadKey —— 下载接口用它做能力校验防 id 枚举 IDOR(见 handler.GetAttachment)。
func (fa *FeedbackAttachment) ToAttachment() Attachment {
	return Attachment{
		Name: fa.OriginalName,
		URL:  fmt.Sprintf("/api/v1/public/feedback/attachment/%d?key=%s", fa.ID, fa.UploadKey),
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
	Page       int            `form:"page" binding:"min=1"`
	PageSize   int            `form:"pageSize" binding:"min=1,max=100"`
	Status     FeedbackStatus `form:"status"`
	Category   string         `form:"category"` // bug/feature/complaint/praise/other
	Email      string         `form:"email"`
	Keyword    string         `form:"keyword"`
	StartDate  string         `form:"startDate"`
	EndDate    string         `form:"endDate"`
	AssignedTo *uint          `form:"assignedTo"` // 指派给某管理员
	Unassigned bool           `form:"unassigned"` // true = 仅看未指派
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
	Total      int64   `json:"total"`
	Pending    int64   `json:"pending"`
	Processed  int64   `json:"processed"`
	Replied    int64   `json:"replied"`
	Closed     int64   `json:"closed"`
	Unassigned int64   `json:"unassigned"`            // 未指派数
	// SLA: 平均首次响应时长(分钟),仅基于已响应的反馈
	AvgFirstResponseMinutes float64 `json:"avgFirstResponseMinutes"`
	// SLA: 当前未响应的最久反馈年龄(分钟)
	OldestPendingMinutes int64 `json:"oldestPendingMinutes"`
}

// AssignFeedbackRequest 指派反馈请求
type AssignFeedbackRequest struct {
	AssignedTo *uint `json:"assignedTo"` // null = 取消指派
}

// UpdateInternalNotesRequest 更新内部备注请求
type UpdateInternalNotesRequest struct {
	InternalNotes string `json:"internalNotes" binding:"max=5000"`
}

