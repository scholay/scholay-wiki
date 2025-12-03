// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import "time"

// 任务状态常量
const (
	TaskStatusDraft      = "draft"      // 草稿（文件上传后待处理）
	TaskStatusPending    = "pending"    // 待处理
	TaskStatusProcessing = "processing" // 处理中
	TaskStatusCompleted  = "completed"  // 已完成
	TaskStatusFailed     = "failed"     // 失败
)

// 输入类型常量
const (
	InputTypeText = "text" // 文本输入
	InputTypeFile = "file" // 文件上传
)

// PeerReviewTask 审稿任务
type PeerReviewTask struct {
	ID                uint       `json:"id" gorm:"primaryKey"`
	UserID            uint       `json:"user_id" gorm:"index"`
	InputType         string     `json:"input_type"`                              // text 或 file
	ManuscriptText    string     `json:"manuscript_text" gorm:"type:longtext"`    // 稿件文本
	ManuscriptHash    string     `json:"manuscript_hash" gorm:"index"`            // 稿件哈希（用于去重）
	FileID            *uint      `json:"file_id"`                                 // 关联的文件ID（指针类型允许为空）
	FileName          string     `json:"file_name"`                               // 上传的文件名
	Title             string     `json:"title"`                                   // 稿件标题
	TargetVenue       string     `json:"target_venue"`                            // 目标期刊/会议
	ModelLevel        string     `json:"model_level"`                             // 模型级别
	Status            string     `json:"status" gorm:"index"`                     // 任务状态
	Progress          int        `json:"progress"`                                // 进度百分比 0-100
	ProgressStage     string     `json:"progress_stage"`                          // 当前阶段描述
	ManuscriptMeta    string     `json:"manuscript_meta" gorm:"type:text"`        // 稿件元信息 JSON
	LiteratureContext string     `json:"literature_context" gorm:"type:longtext"` // 文献上下文 JSON
	LiteratureSummary string     `json:"literature_summary" gorm:"type:text"`     // 文献总结 JSON
	GapLiterature     string     `json:"gap_literature" gorm:"type:text"`         // 研究空白相关文献 JSON
	ReviewContent     string     `json:"review_content" gorm:"type:longtext"`     // 审稿报告内容
	Recommendation    string     `json:"recommendation"`                          // 推荐意见
	ErrorMessage      string     `json:"error_message"`                           // 错误信息
	StartedAt         *time.Time `json:"started_at"`                              // 开始处理时间
	CompletedAt       *time.Time `json:"completed_at"`                            // 完成时间
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

func (PeerReviewTask) TableName() string {
	return "peer_review_tasks"
}

// PeerReviewFile 审稿文件
type PeerReviewFile struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	UserID       uint      `json:"user_id" gorm:"index"`
	FileName     string    `json:"file_name"`
	FileType     string    `json:"file_type"`                         // txt, doc, docx, rtf, odt, pdf
	FileSize     int64     `json:"file_size"`                         // 文件大小（字节）
	FilePath     string    `json:"file_path"`                         // 存储路径
	ExtractedText string   `json:"extracted_text" gorm:"type:longtext"` // 提取的文本内容
	Status       string    `json:"status"`                            // pending, processed, failed
	CreatedAt    time.Time `json:"created_at"`
}

func (PeerReviewFile) TableName() string {
	return "peer_review_files"
}

// ========== 请求/响应结构 ==========

// PeerReviewRequest 审稿请求（兼容旧接口）
type PeerReviewRequest struct {
	ManuscriptText string `json:"manuscript_text" binding:"required"`
	TargetVenue    string `json:"target_venue"`
	ModelLevel     string `json:"model_level"` // low, mid, high
}

// CreateTaskRequest 创建任务请求
type CreateTaskRequest struct {
	InputType      string `json:"input_type" binding:"required"` // text 或 file
	ManuscriptText string `json:"manuscript_text"`               // 文本输入时必填
	FileID         uint   `json:"file_id"`                       // 文件输入时必填
	TargetVenue    string `json:"target_venue"`
	ModelLevel     string `json:"model_level"` // low, mid, high
}

// StartTaskRequest 启动任务请求
type StartTaskRequest struct {
	TargetVenue string `json:"target_venue"`
	ModelLevel  string `json:"model_level"`
}

// SaveDraftRequest 保存草稿请求
type SaveDraftRequest struct {
	InputType      string `json:"input_type"`      // text 或 file
	ManuscriptText string `json:"manuscript_text"` // 稿件文本
	TargetVenue    string `json:"target_venue"`    // 目标期刊
	ModelLevel     string `json:"model_level"`     // 模型级别
	FileName       string `json:"file_name"`       // 文件名（如果是文件上传）
}

// SubmitDraftRequest 提交草稿请求
type SubmitDraftRequest struct {
	TargetVenue string `json:"target_venue"`
	ModelLevel  string `json:"model_level"`
}

// DraftResponse 草稿响应
type DraftResponse struct {
	ID             uint   `json:"id"`
	InputType      string `json:"input_type"`
	ManuscriptText string `json:"manuscript_text"`
	TargetVenue    string `json:"target_venue"`
	ModelLevel     string `json:"model_level"`
	FileName       string `json:"file_name,omitempty"`
	ContentPreview string `json:"content_preview,omitempty"` // 内容预览（前500字）
}

// TaskListResponse 任务列表响应
type TaskListResponse struct {
	Tasks      []TaskSummary `json:"tasks"`
	Total      int64         `json:"total"`
	Page       int           `json:"page"`
	PageSize   int           `json:"page_size"`
	TotalPages int           `json:"total_pages"`
}

// TaskSummary 任务摘要
type TaskSummary struct {
	ID             uint       `json:"id"`
	Title          string     `json:"title"`
	TargetVenue    string     `json:"target_venue"`
	InputType      string     `json:"input_type"`
	Status         string     `json:"status"`
	Progress       int        `json:"progress"`
	ProgressStage  string     `json:"progress_stage"`
	Recommendation string     `json:"recommendation"`
	ModelLevel     string     `json:"model_level"`
	CreatedAt      time.Time  `json:"created_at"`
	CompletedAt    *time.Time `json:"completed_at"`
}

// TaskDetailResponse 任务详情响应
type TaskDetailResponse struct {
	ID                uint               `json:"id"`
	InputType         string             `json:"input_type"`
	Title             string             `json:"title"`
	TargetVenue       string             `json:"target_venue"`
	ModelLevel        string             `json:"model_level"`
	Status            string             `json:"status"`
	Progress          int                `json:"progress"`
	ProgressStage     string             `json:"progress_stage"`
	ManuscriptText    string             `json:"manuscript_text,omitempty"`
	FileID            *uint              `json:"file_id,omitempty"`
	FileName          string             `json:"file_name,omitempty"`
	ManuscriptMeta    *ManuscriptMeta    `json:"manuscript_meta,omitempty"`
	LiteratureSummary *LiteratureSummary `json:"literature_summary,omitempty"`
	GapLiterature     []GapLiterature    `json:"gap_literature,omitempty"`
	ReviewContent     string             `json:"review_content,omitempty"`
	Recommendation    string             `json:"recommendation,omitempty"`
	ErrorMessage      string             `json:"error_message,omitempty"`
	CreatedAt         time.Time          `json:"created_at"`
	UpdatedAt         time.Time          `json:"updated_at"`
	CompletedAt       *time.Time         `json:"completed_at,omitempty"`
}

// TaskProgressResponse 任务进度响应
type TaskProgressResponse struct {
	Status        string `json:"status"`
	Progress      int    `json:"progress"`
	ProgressStage string `json:"progress_stage"`
	ErrorMessage  string `json:"error_message,omitempty"`
}

// UploadFileResponse 文件上传响应（解析文件并保存到草稿）
type UploadFileResponse struct {
	DraftID        uint   `json:"draft_id"`        // 草稿任务ID
	FileID         uint   `json:"file_id"`         // 文件记录ID
	FileName       string `json:"file_name"`       // 文件名
	FileSize       int64  `json:"file_size"`       // 文件大小
	ExtractedText  string `json:"extracted_text"`  // 提取的完整文本
	ContentPreview string `json:"content_preview"` // 内容预览（前500字）
}

// ========== 内部数据结构 ==========

// StreamEvent SSE 事件
type StreamEvent struct {
	Type     string      `json:"type"`
	Data     interface{} `json:"data"`
	Progress int         `json:"progress,omitempty"`
	Message  string      `json:"message,omitempty"`
}

// ManuscriptMeta 稿件元信息
type ManuscriptMeta struct {
	Title          string   `json:"title"`
	Abstract       string   `json:"abstract"`
	Field          string   `json:"field"`
	MainTopic      string   `json:"main_topic"`
	MainMethods    []string `json:"main_methods"`
	KeyVariables   []string `json:"key_variables"`
	ClaimedNovelty []string `json:"claimed_novelty"`
	Keywords       []string `json:"keywords"`
}

// SearchQuery 搜索查询
type SearchQuery struct {
	ID    string `json:"id"`
	Query string `json:"query"`
	TopK  int    `json:"top_k"`
}

// LiteratureContext 文献上下文
type LiteratureContext struct {
	AllPapers []map[string]interface{} `json:"all_papers"`
	ByTopic   []map[string]interface{} `json:"by_topic"`
	ByMethod  []map[string]interface{} `json:"by_method"`
	ByNovelty []map[string]interface{} `json:"by_novelty"`
	ByTheory  []map[string]interface{} `json:"by_theory"`
}

// LiteratureSummary 文献总结
type LiteratureSummary struct {
	FieldState       string         `json:"field_state"`
	ClosestPapers    []ClosestPaper `json:"closest_papers"`
	TypicalGaps      []string       `json:"typical_gaps"`
	NotesForReviewer string         `json:"notes_for_reviewer"`
}

// ClosestPaper 最相似论文
type ClosestPaper struct {
	Title  string `json:"title"`
	Year   int    `json:"year"`
	Reason string `json:"reason"`
}

// GapLiterature 研究空白相关文献
type GapLiterature struct {
	Gap    string                   `json:"gap"`
	Papers []map[string]interface{} `json:"papers"`
}

// ReferenceForReviewer 供审稿人使用的参考文献
type ReferenceForReviewer struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Year    int    `json:"year"`
	Authors string `json:"authors"`
	URL     string `json:"url"`
	PaperID string `json:"paper_id"`
}
