// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package peerreview

import "time"

// ========== 常量定义 ==========

// 任务状态常量
const (
	TaskStatusDraft      = "draft"      // 草稿
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

// 文件角色常量
const (
	FileRoleManuscript = "manuscript" // 主稿件
	FileRoleAttachment = "attachment" // 附件
)

// 文件处理模式常量
const (
	ProcessModeExtract = "extract" // 提取文本
	ProcessModeDirect  = "direct"  // 直接传递给AI
)

// 最大附件数量
const MaxAttachments = 5

// 审稿人数量（三审制）
const ReviewerCount = 3

// ========== 数据库模型 ==========

// PeerReviewTask 审稿任务主表
type PeerReviewTask struct {
	ID               uint   `json:"id" gorm:"primaryKey"`
	UserID           uint   `json:"user_id" gorm:"index"`
	InputType        string `json:"input_type"`                           // text 或 file
	ManuscriptText   string `json:"manuscript_text" gorm:"type:longtext"` // 主稿件文本内容
	ManuscriptFileID *uint  `json:"manuscript_file_id"`                   // 主稿件文件ID

	// 任务配置
	Title       string `json:"title"`        // 稿件标题
	TargetVenue string `json:"target_venue"` // 目标期刊/会议
	ModelLevel  string `json:"model_level"`  // 模型级别: low, mid, high
	ContentHash string `json:"content_hash"` // 内容哈希，用于缓存

	// 任务状态
	Status        string `json:"status" gorm:"index"` // draft, pending, processing, completed, failed
	Progress      int    `json:"progress"`            // 总体进度 0-100
	ProgressStage string `json:"progress_stage"`      // 当前阶段描述
	ErrorMessage  string `json:"error_message"`       // 错误信息

	// 预处理结果（共享给三个审稿人）
	ManuscriptMeta    string `json:"manuscript_meta" gorm:"type:text"`        // 稿件元信息 JSON
	LiteratureContext string `json:"literature_context" gorm:"type:longtext"` // 检索到的相关文献 JSON
	LiteratureSummary string `json:"literature_summary" gorm:"type:text"`     // 文献总结 JSON

	// 综合审稿结果（三审汇总）
	FinalRecommendation  string  `json:"final_recommendation"`                    // 最终推荐
	FinalReviewContent   string  `json:"final_review_content" gorm:"type:longtext"` // 综合审稿报告
	ConsensusScore       float64 `json:"consensus_score"`                         // 三审一致性评分 0-1

	// 时间戳
	SubmittedAt *time.Time `json:"submitted_at"` // 提交审稿时间
	StartedAt   *time.Time `json:"started_at"`   // 开始处理时间
	CompletedAt *time.Time `json:"completed_at"` // 完成时间
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`

	// 关联数据（非数据库字段）
	ManuscriptFile *PeerReviewFile   `json:"manuscript_file,omitempty" gorm:"-"`
	Attachments    []PeerReviewFile  `json:"attachments,omitempty" gorm:"-"`
	Reviews        []PeerReviewResult `json:"reviews,omitempty" gorm:"-"`
}

func (PeerReviewTask) TableName() string {
	return "peer_review_tasks"
}

// PeerReviewFile 审稿文件表（主稿件和附件）
type PeerReviewFile struct {
	ID       uint  `json:"id" gorm:"primaryKey"`
	TaskID   *uint `json:"task_id" gorm:"index"` // 关联的任务ID
	UserID   uint  `json:"user_id" gorm:"index"`
	FileRole string `json:"file_role"` // manuscript=主稿件, attachment=附件
	SortOrder int   `json:"sort_order"` // 排序顺序（附件用）

	// 文件信息
	FileName string `json:"file_name"`
	FileExt  string `json:"file_ext"`  // 文件扩展名（不含点）
	FileSize int64  `json:"file_size"` // 文件大小（字节）
	FilePath string `json:"file_path"` // 存储路径
	MimeType string `json:"mime_type"` // MIME类型

	// 内容处理
	ProcessMode   string `json:"process_mode"`                         // extract=提取文本, direct=直接传AI
	ExtractedText string `json:"extracted_text" gorm:"type:longtext"` // 提取的文本内容
	ProcessStatus string `json:"process_status"`                       // pending, processed, failed
	ProcessError  string `json:"process_error"`                        // 处理错误信息

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (PeerReviewFile) TableName() string {
	return "peer_review_files"
}

// PeerReviewResult 独立审稿结果表（三审制）
type PeerReviewResult struct {
	ID            uint `json:"id" gorm:"primaryKey"`
	TaskID        uint `json:"task_id" gorm:"index"`
	ReviewerIndex int  `json:"reviewer_index"` // 审稿人编号: 1, 2, 3

	// 审稿状态
	Status       string `json:"status"`        // pending, processing, completed, failed
	Progress     int    `json:"progress"`      // 进度 0-100
	ErrorMessage string `json:"error_message"` // 错误信息

	// 审稿结果
	Recommendation  string  `json:"recommendation"`   // Accept, Minor Revision, Major Revision, Reject
	ConfidenceScore float64 `json:"confidence_score"` // 置信度 0-1
	ReviewContent   string  `json:"review_content" gorm:"type:longtext"` // 审稿报告 Markdown

	// 评分维度
	DimensionScores string `json:"dimension_scores" gorm:"type:text"` // 各维度评分 JSON

	// 时间戳
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func (PeerReviewResult) TableName() string {
	return "peer_review_results"
}

// ========== 请求/响应结构 ==========

// CreateTaskRequest 创建任务请求（兼容旧接口）
type CreateTaskRequest struct {
	InputType      string `json:"input_type" binding:"required"`
	ManuscriptText string `json:"manuscript_text"`
	FileID         uint   `json:"file_id"`
	TargetVenue    string `json:"target_venue"`
	ModelLevel     string `json:"model_level"`
}

// StartTaskRequest 启动任务请求（兼容旧接口）
type StartTaskRequest struct {
	TargetVenue string `json:"target_venue"`
	ModelLevel  string `json:"model_level"`
}

// PeerReviewRequest 审稿请求（兼容旧接口）
type PeerReviewRequest struct {
	ManuscriptText string `json:"manuscript_text" binding:"required"`
	TargetVenue    string `json:"target_venue"`
	ModelLevel     string `json:"model_level"`
}

// SaveDraftRequest 保存草稿请求
type SaveDraftRequest struct {
	InputType      string `json:"input_type"`      // text 或 file
	ManuscriptText string `json:"manuscript_text"` // 稿件文本
	TargetVenue    string `json:"target_venue"`    // 目标期刊
	ModelLevel     string `json:"model_level"`     // 模型级别
}

// SubmitDraftRequest 提交草稿请求
type SubmitDraftRequest struct {
	TargetVenue string `json:"target_venue"`
	ModelLevel  string `json:"model_level"`
}

// DraftResponse 草稿响应
type DraftResponse struct {
	ID             uint                `json:"id"`
	InputType      string              `json:"input_type"`
	ManuscriptText string              `json:"manuscript_text"`
	TargetVenue    string              `json:"target_venue"`
	ModelLevel     string              `json:"model_level"`
	ContentPreview string              `json:"content_preview,omitempty"`
	ManuscriptFile *FileInfo           `json:"manuscript_file,omitempty"`
	Attachments    []FileInfo          `json:"attachments,omitempty"`
}

// FileInfo 文件信息（用于响应）
type FileInfo struct {
	ID            uint   `json:"id"`
	FileName      string `json:"file_name"`
	FileExt       string `json:"file_ext"`
	FileSize      int64  `json:"file_size"`
	ProcessMode   string `json:"process_mode"`
	ProcessStatus string `json:"process_status"`
	ContentPreview string `json:"content_preview,omitempty"`
}

// UploadFileResponse 文件上传响应
type UploadFileResponse struct {
	FileID         uint   `json:"file_id"`
	FileName       string `json:"file_name"`
	FileExt        string `json:"file_ext"`
	FileSize       int64  `json:"file_size"`
	ProcessMode    string `json:"process_mode"`
	ContentPreview string `json:"content_preview,omitempty"`
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
	ID                  uint       `json:"id"`
	Title               string     `json:"title"`
	TargetVenue         string     `json:"target_venue"`
	InputType           string     `json:"input_type"`
	Status              string     `json:"status"`
	Progress            int        `json:"progress"`
	ProgressStage       string     `json:"progress_stage"`
	FinalRecommendation string     `json:"final_recommendation"`
	ModelLevel          string     `json:"model_level"`
	AttachmentCount     int        `json:"attachment_count"`
	CreatedAt           time.Time  `json:"created_at"`
	CompletedAt         *time.Time `json:"completed_at"`
}

// TaskDetailResponse 任务详情响应
type TaskDetailResponse struct {
	ID             uint   `json:"id"`
	InputType      string `json:"input_type"`
	Title          string `json:"title"`
	TargetVenue    string `json:"target_venue"`
	ModelLevel     string `json:"model_level"`
	Status         string `json:"status"`
	Progress       int    `json:"progress"`
	ProgressStage  string `json:"progress_stage"`
	ErrorMessage   string `json:"error_message,omitempty"`

	// 稿件信息
	ManuscriptText string    `json:"manuscript_text,omitempty"`
	ManuscriptFile *FileInfo `json:"manuscript_file,omitempty"`
	Attachments    []FileInfo `json:"attachments,omitempty"`

	// 预处理结果
	ManuscriptMeta    *ManuscriptMeta    `json:"manuscript_meta,omitempty"`
	LiteratureSummary *LiteratureSummary `json:"literature_summary,omitempty"`

	// 三审结果
	Reviews []ReviewResultInfo `json:"reviews,omitempty"`

	// 综合结果
	FinalRecommendation string  `json:"final_recommendation,omitempty"`
	FinalReviewContent  string  `json:"final_review_content,omitempty"`
	ConsensusScore      float64 `json:"consensus_score,omitempty"`

	// 时间戳
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
	SubmittedAt *time.Time `json:"submitted_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

// ReviewResultInfo 审稿结果信息（用于响应）
type ReviewResultInfo struct {
	ReviewerIndex   int                    `json:"reviewer_index"`
	Status          string                 `json:"status"`
	Progress        int                    `json:"progress"`
	Recommendation  string                 `json:"recommendation,omitempty"`
	ConfidenceScore float64                `json:"confidence_score,omitempty"`
	ReviewContent   string                 `json:"review_content,omitempty"`
	DimensionScores map[string]interface{} `json:"dimension_scores,omitempty"`
	CompletedAt     *time.Time             `json:"completed_at,omitempty"`
}

// TaskProgressResponse 任务进度响应
type TaskProgressResponse struct {
	Status          string               `json:"status"`
	Progress        int                  `json:"progress"`
	ProgressStage   string               `json:"progress_stage"`
	ErrorMessage    string               `json:"error_message,omitempty"`
	ReviewsProgress []ReviewProgressInfo `json:"reviews_progress,omitempty"`
}

// ReviewProgressInfo 单个审稿人进度
type ReviewProgressInfo struct {
	ReviewerIndex int    `json:"reviewer_index"`
	Status        string `json:"status"`
	Progress      int    `json:"progress"`
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

// DimensionScores 审稿维度评分
type DimensionScores struct {
	Originality  float64 `json:"originality"`  // 原创性 0-10
	Methodology  float64 `json:"methodology"`  // 方法论 0-10
	Clarity      float64 `json:"clarity"`      // 清晰度 0-10
	Significance float64 `json:"significance"` // 重要性 0-10
	Overall      float64 `json:"overall"`      // 总体评分 0-10
}

// ========== 文件处理相关 ==========

// 支持的文件类型及其处理模式
var FileProcessModes = map[string]string{
	// 提取文本的文件类型
	"txt":  ProcessModeExtract,
	"rtf":  ProcessModeExtract,
	"odt":  ProcessModeExtract,
	"xml":  ProcessModeExtract,
	"html": ProcessModeExtract,
	"htm":  ProcessModeExtract,
	// 直接传递给AI的文件类型
	"pdf":  ProcessModeDirect,
	"doc":  ProcessModeDirect,
	"docx": ProcessModeDirect,
	// 附件支持的额外类型（都直接传递）
	"xlsx": ProcessModeDirect,
	"xls":  ProcessModeDirect,
	"csv":  ProcessModeExtract, // CSV可以提取文本
	"epub": ProcessModeDirect,
	// 代码文件（提取文本）
	"py":   ProcessModeExtract,
	"js":   ProcessModeExtract,
	"ts":   ProcessModeExtract,
	"go":   ProcessModeExtract,
	"java": ProcessModeExtract,
	"c":    ProcessModeExtract,
	"cpp":  ProcessModeExtract,
	"h":    ProcessModeExtract,
	"rs":   ProcessModeExtract,
	"rb":   ProcessModeExtract,
	"php":  ProcessModeExtract,
	"sql":  ProcessModeExtract,
	"json": ProcessModeExtract,
	"yaml": ProcessModeExtract,
	"yml":  ProcessModeExtract,
	"md":   ProcessModeExtract,
	"r":    ProcessModeExtract,
}

// GetProcessMode 获取文件处理模式
func GetProcessMode(fileExt string) string {
	if mode, ok := FileProcessModes[fileExt]; ok {
		return mode
	}
	return ProcessModeDirect // 默认直接传递
}

// IsAllowedFileType 检查文件类型是否支持
func IsAllowedFileType(fileExt string) bool {
	_, ok := FileProcessModes[fileExt]
	return ok
}

// GetMimeType 根据文件扩展名获取MIME类型
func GetMimeType(fileExt string) string {
	mimeTypes := map[string]string{
		"pdf":  "application/pdf",
		"doc":  "application/msword",
		"docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"txt":  "text/plain",
		"rtf":  "application/rtf",
		"odt":  "application/vnd.oasis.opendocument.text",
		"xml":  "application/xml",
		"html": "text/html",
		"htm":  "text/html",
		"xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"xls":  "application/vnd.ms-excel",
		"csv":  "text/csv",
		"epub": "application/epub+zip",
		"py":   "text/x-python",
		"js":   "text/javascript",
		"ts":   "text/typescript",
		"go":   "text/x-go",
		"java": "text/x-java",
		"c":    "text/x-c",
		"cpp":  "text/x-c++",
		"h":    "text/x-c",
		"rs":   "text/x-rust",
		"rb":   "text/x-ruby",
		"php":  "text/x-php",
		"sql":  "text/x-sql",
		"json": "application/json",
		"yaml": "text/yaml",
		"yml":  "text/yaml",
		"md":   "text/markdown",
		"r":    "text/x-r",
	}
	if mime, ok := mimeTypes[fileExt]; ok {
		return mime
	}
	return "application/octet-stream"
}
