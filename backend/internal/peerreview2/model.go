// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// peerreview2 —— 对接 peer.scholay.com 外部审稿服务的本地代理层。
// 与老的 internal/peerreview 完全独立,采用 pr2_* 前缀的独立表。
// 远端会话/消息/turn 数据全部由远端持有,本地仅保留映射 + 元数据,用于
// 列表展示与权属校验。

package peerreview2

import "time"

// 会话生命周期状态(与远端 ConversationStatus 对齐)
const (
	StatusPending  = "pending"  // 已创建,首轮 turn 排队中
	StatusRunning  = "running"  // 某 turn 正在跑
	StatusIdle     = "idle"     // 末轮已完成,可继续追问
	StatusFailed   = "failed"   // 末轮失败
	StatusPaused   = "paused"   // 用户主动暂停
	StatusArchived = "archived" // 隐藏
)

// 推荐结论(从合并审稿正文末尾解析)
const (
	RecommendAccept = "Accept"
	RecommendMinor  = "Minor"
	RecommendMajor  = "Major"
	RecommendReject = "Reject"
)

// PeerReview2Conversation 本地审稿会话映射表
type PeerReview2Conversation struct {
	ID                   uint       `json:"id" gorm:"primaryKey"`
	UserID               *uint      `json:"user_id,omitempty" gorm:"index"` // nullable: 匿名用户为 nil
	AnonToken            string     `json:"anon_token,omitempty" gorm:"size:64;index"`
	DeviceID             string     `json:"device_id,omitempty" gorm:"size:64;index"`
	RemoteConversationID string     `json:"remote_conversation_id" gorm:"size:64;uniqueIndex"`
	RemoteThreadID       string     `json:"remote_thread_id,omitempty" gorm:"size:64"`
	ClientRequestID      string     `json:"client_request_id,omitempty" gorm:"size:128;index"`
	PaperFilename        string     `json:"paper_filename,omitempty" gorm:"size:255"`
	Title                string     `json:"title,omitempty" gorm:"size:255"`
	Status               string     `json:"status" gorm:"size:32;index"`
	FinalRecommendation  string     `json:"final_recommendation,omitempty" gorm:"size:32"`
	FinalChars           int        `json:"final_chars,omitempty"`
	LastRemoteSyncAt     *time.Time `json:"last_remote_sync_at,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

func (PeerReview2Conversation) TableName() string {
	return "pr2_conversations"
}

// PeerReview2AnonTrial 匿名试用消费记录
//
// 识别策略沿用老 peerreview 模块: device_id (HttpOnly cookie) + ip_ua_hash 双识别。
// 速率限制: 每 device_id 每天 1 次硬限,登录用户走 quota 不消耗这里的额度。
type PeerReview2AnonTrial struct {
	ID              uint       `json:"id" gorm:"primaryKey"`
	DeviceID        string     `json:"device_id" gorm:"size:64;uniqueIndex:uk_pr2_trial_device_day"`
	IPUAHash        string     `json:"ip_ua_hash" gorm:"size:64;index"`
	TrialDay        string     `json:"trial_day" gorm:"size:10;uniqueIndex:uk_pr2_trial_device_day"` // YYYY-MM-DD
	AnonToken       string     `json:"anon_token" gorm:"size:64"`
	ConversationID  uint       `json:"conversation_id" gorm:"index"`
	ConsumedAt      time.Time  `json:"consumed_at"`
	ClaimedByUserID uint       `json:"claimed_by_user_id" gorm:"default:0;index"`
	ClaimedAt       *time.Time `json:"claimed_at,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

func (PeerReview2AnonTrial) TableName() string {
	return "pr2_anon_trials"
}

// ========== 请求 / 响应 DTO ==========

// CreateConversationResponse 上传 PDF → 创建会话的响应
type CreateConversationResponse struct {
	ID                   uint   `json:"id"`
	RemoteConversationID string `json:"remote_conversation_id"`
	Title                string `json:"title,omitempty"`
	PaperFilename        string `json:"paper_filename,omitempty"`
	Status               string `json:"status"`
	AnonToken            string `json:"anon_token,omitempty"` // 匿名首次创建时下发,前端记到 localStorage
	IsIdempotent         bool   `json:"is_idempotent"`         // true=幂等命中,未触发新审稿
	CreatedAt            time.Time `json:"created_at"`
}

// ConversationSummary 列表中的单条会话(本地表 + 解析后的展示字段)
type ConversationSummary struct {
	ID                  uint      `json:"id"`
	Title               string    `json:"title,omitempty"`
	PaperFilename       string    `json:"paper_filename,omitempty"`
	Status              string    `json:"status"`
	FinalRecommendation string    `json:"final_recommendation,omitempty"`
	FinalChars          int       `json:"final_chars,omitempty"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// ConversationListResponse 列表响应
type ConversationListResponse struct {
	Items      []ConversationSummary `json:"items"`
	Total      int64                 `json:"total"`
	Page       int                   `json:"page"`
	PageSize   int                   `json:"page_size"`
	TotalPages int                   `json:"total_pages"`
}

// ConversationDetailResponse 单个会话详情(本地 + 远端实时状态)
type ConversationDetailResponse struct {
	ID                   uint      `json:"id"`
	RemoteConversationID string    `json:"remote_conversation_id"`
	Title                string    `json:"title,omitempty"`
	PaperFilename        string    `json:"paper_filename,omitempty"`
	Status               string    `json:"status"`
	FinalRecommendation  string    `json:"final_recommendation,omitempty"`
	FinalChars           int       `json:"final_chars,omitempty"`
	RemoteThreadID       string    `json:"remote_thread_id,omitempty"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

// SendMessageRequest 追问请求
type SendMessageRequest struct {
	Content     string `json:"content" binding:"required"`
	ClientMsgID string `json:"client_msg_id,omitempty"`
}

// TurnInfo 远端 turn 直转
type TurnInfo struct {
	ID             string     `json:"id"`
	ConversationID string     `json:"conversation_id"`
	Status         string     `json:"status"`
	StartedAt      *time.Time `json:"started_at,omitempty"`
	CompletedAt    *time.Time `json:"completed_at,omitempty"`
	Error          string     `json:"error,omitempty"`
}

// MessageInfo 远端 message 直转
type MessageInfo struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	Seq       int       `json:"seq"`
	CreatedAt time.Time `json:"created_at"`
}

// TrialStatusResponse 匿名试用余额查询响应
type TrialStatusResponse struct {
	CanTrial   bool       `json:"can_trial"`
	TrialDay   string     `json:"trial_day"`
	ConsumedAt *time.Time `json:"consumed_at,omitempty"`
	Reason     string     `json:"reason,omitempty"` // "" | "already_used"
}
