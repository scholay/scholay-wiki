// ============================================================================
// Scholay Prism (智能写作 / AI-native LaTeX IDE) —— GORM 模型。
//
// 锁定架构 D1: 后端 DB 是项目文件唯一真源。Project → File → 追加式 FileVersion(diff base)。
// 编译产物 PDF/log 落 MinIO(scholar-prism 桶),文本正文进 FileVersion.Body。
// 表定义见 docker/mysql/migrations/0009_prism_fields.sql。
// ============================================================================

package prism

import "time"

// 文件类型。
const (
	KindTex   = "tex"
	KindBib   = "bib"
	KindSty   = "sty"
	KindCls   = "cls"
	KindAsset = "asset"
)

// 版本来源 / 状态。
const (
	AuthorUser     = "user"
	AuthorAgent    = "agent"
	AuthorAccepted = "accepted"

	VerPending    = "pending"
	VerCurrent    = "current"
	VerSuperseded = "superseded"
)

// 编译状态。
const (
	CompileQueued  = "queued"
	CompileRunning = "running"
	CompileSuccess = "success"
	CompileError   = "error"
)

// 编译引擎。
const (
	EnginePDFLaTeX = "pdflatex"
	EngineXeLaTeX  = "xelatex"
)

// AI 编辑作业状态 / 类型。
const (
	EditQueued  = "queued"
	EditRunning = "running"
	EditDone    = "done"
	EditError   = "error"

	KindEdit = "edit" // 选区 + 指令
	KindFix  = "fix"  // 修编译错
)

// Project 写作项目。
type Project struct {
	ID               uint       `gorm:"column:id;primaryKey" json:"id"`
	UserID           uint       `gorm:"column:user_id" json:"user_id"`
	Title            string     `gorm:"column:title" json:"title"`
	MainFile         string     `gorm:"column:main_file" json:"main_file"`
	VenueTemplateKey *string    `gorm:"column:venue_template_key" json:"venue_template_key,omitempty"`
	AgentSessionID   *string    `gorm:"column:agent_session_id" json:"-"`
	Status           string     `gorm:"column:status" json:"status"`
	CreatedAt        time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt        time.Time  `gorm:"column:updated_at" json:"updated_at"`
}

func (Project) TableName() string { return "prism_projects" }

// File 项目内文件清单 + current 版本指针。
type File struct {
	ID               uint      `gorm:"column:id;primaryKey" json:"id"`
	ProjectID        uint      `gorm:"column:project_id" json:"project_id"`
	RelPath          string    `gorm:"column:rel_path" json:"rel_path"`
	FileKind         string    `gorm:"column:file_kind" json:"file_kind"`
	CurrentVersionID *uint     `gorm:"column:current_version_id" json:"current_version_id,omitempty"`
	ContentSHA256    string    `gorm:"column:content_sha256" json:"content_sha256,omitempty"`
	Size             int64     `gorm:"column:size" json:"size"`
	Mime             string    `gorm:"column:mime" json:"mime,omitempty"`
	MinioObjectKey   *string   `gorm:"column:minio_object_key" json:"-"`
	CreatedAt        time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt        time.Time `gorm:"column:updated_at" json:"updated_at"`
}

func (File) TableName() string { return "prism_files" }

// FileVersion 追加式版本(diff base + accept/reject + 防丢失)。
type FileVersion struct {
	ID            uint      `gorm:"column:id;primaryKey" json:"id"`
	FileID        uint      `gorm:"column:file_id" json:"file_id"`
	VersionNo     int       `gorm:"column:version_no" json:"version_no"`
	Body          string    `gorm:"column:body" json:"body"`
	ContentSHA256 string    `gorm:"column:content_sha256" json:"content_sha256,omitempty"`
	Author        string    `gorm:"column:author" json:"author"`
	Status        string    `gorm:"column:status" json:"status"`
	BaseVersionID *uint     `gorm:"column:base_version_id" json:"base_version_id,omitempty"`
	CreatedAt     time.Time `gorm:"column:created_at" json:"created_at"`
}

func (FileVersion) TableName() string { return "prism_file_versions" }

// Compile 编译记录 + 内容哈希缓存。
type Compile struct {
	ID           uint       `gorm:"column:id;primaryKey" json:"id"`
	ProjectID    uint       `gorm:"column:project_id" json:"project_id"`
	ContentHash  string     `gorm:"column:content_hash" json:"content_hash,omitempty"`
	Status       string     `gorm:"column:status" json:"status"`
	Engine       string     `gorm:"column:engine" json:"engine"`
	PdfObjectKey *string    `gorm:"column:pdf_object_key" json:"-"`
	LogObjectKey *string    `gorm:"column:log_object_key" json:"-"`
	LogExcerpt   string     `gorm:"column:log_excerpt" json:"log_excerpt,omitempty"`
	ErrorSummary string     `gorm:"column:error_summary" json:"error_summary,omitempty"`
	DurationMs   int        `gorm:"column:duration_ms" json:"duration_ms"`
	ExpiresAt    *time.Time `gorm:"column:expires_at" json:"-"`
	CreatedAt    time.Time  `gorm:"column:created_at" json:"created_at"`
}

func (Compile) TableName() string { return "prism_compiles" }

// Edit AI 编辑作业(异步 patch 提案)。
type Edit struct {
	ID            uint      `gorm:"column:id;primaryKey" json:"id"`
	ProjectID     uint      `gorm:"column:project_id" json:"project_id"`
	FileID        uint      `gorm:"column:file_id" json:"file_id"`
	UserID        uint      `gorm:"column:user_id" json:"-"`
	Kind          string    `gorm:"column:kind" json:"kind"`
	Status        string    `gorm:"column:status" json:"status"`
	Instruction   string    `gorm:"column:instruction" json:"instruction"`
	BaseVersionID *uint     `gorm:"column:base_version_id" json:"base_version_id,omitempty"`
	ProposedBody  string    `gorm:"column:proposed_body" json:"proposed_body"`
	AppliedHunks  int       `gorm:"column:applied_hunks" json:"applied_hunks"`
	FailedHunks   int       `gorm:"column:failed_hunks" json:"failed_hunks"`
	ErrorSummary  string    `gorm:"column:error_summary" json:"error_summary,omitempty"`
	CreatedAt     time.Time `gorm:"column:created_at" json:"created_at"`
}

func (Edit) TableName() string { return "prism_edits" }

// ChatMessage 对话线一条(持久化,重入恢复)。表 prism_chat_messages(migration 0012)。
type ChatMessage struct {
	ID           uint      `gorm:"column:id;primaryKey" json:"id"`
	ProjectID    uint      `gorm:"column:project_id" json:"project_id"`
	UserID       uint      `gorm:"column:user_id" json:"-"`
	Role         string    `gorm:"column:role" json:"role"`
	Text         string    `gorm:"column:text" json:"text"`
	EditID       *uint     `gorm:"column:edit_id" json:"edit_id,omitempty"`
	FileID       *uint     `gorm:"column:file_id" json:"file_id,omitempty"`
	AppliedHunks int       `gorm:"column:applied_hunks" json:"applied_hunks"`
	FailedHunks  int       `gorm:"column:failed_hunks" json:"failed_hunks"`
	CreatedAt    time.Time `gorm:"column:created_at" json:"created_at"`
}

func (ChatMessage) TableName() string { return "prism_chat_messages" }

// CiteCandidate 文献库检索结果(给 \cite 用),来自 user_library_papers 真实行。
type CiteCandidate struct {
	LibraryPaperID uint   `json:"library_paper_id"`
	CiteKey        string `json:"cite_key"`
	Title          string `json:"title"`
	Authors        string `json:"authors"`
	Year           int    `json:"year"`
	Venue          string `json:"venue"`
	DOI            string `json:"doi"`
}
