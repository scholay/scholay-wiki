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
	SchemaVersion    string     `gorm:"column:schema_version" json:"schema_version"`
	DocStruct        *string    `gorm:"column:doc_struct" json:"-"`
	StructVersionID  *uint      `gorm:"column:struct_version_id" json:"-"`
	AgentSessionID   *string    `gorm:"column:agent_session_id" json:"-"`
	WritingProfile   *string    `gorm:"column:writing_profile" json:"-"` // 写作画像 JSON(Phase 2):base 文体/学科人格 + genre + source + needs_refine
	Terminology      *string    `gorm:"column:terminology" json:"-"`    // 术语表真源 markdown(V4-④:轮前物化 cwd terminology.md、轮末回收)
	ReadOnlyFlag     bool       `gorm:"-" json:"read_only"` // 计算字段(AfterFind 填),前端据此决定旧版工作台是否只读
	Status           string     `gorm:"column:status" json:"status"`
	CreatedAt        time.Time  `gorm:"column:created_at" json:"created_at"`
	UpdatedAt        time.Time  `gorm:"column:updated_at" json:"updated_at"`
}

func (Project) TableName() string { return "prism_projects" }

// 文档轨道(双轨:旧裸 LaTeX 只读 vs 新结构体)。已全量 cutover:新项目一律 struct,旧 legacy 项目冻结只读。
const (
	SchemaLegacy = "legacy" // 旧裸 LaTeX 项目;只读(仅查看/编译/导出/克隆升级)
	SchemaStruct = "struct" // 新结构体项目;经 struct 专用端点编辑
)

// ReadOnly 报告该项目是否禁用「旧版编辑面」端点(手动改/AI 轮次/文件 CRUD/cite)。
// 全量 cutover 后对所有项目恒 true:struct 项目改走 struct 专用端点,legacy 项目已冻结。
// 编译 / 导出 / 读取(GetProject/GetFile/Compile/GetPDF/ListVersions…)永不受此影响。
func (p *Project) ReadOnly() bool { return true }

// EditFrozen 报告「编辑(含 WS 轮次)」是否被冻结 —— 只有 legacy 项目冻结。
// struct 项目【不】冻结(它经 WS 编辑 document.md / 经 struct 端点编辑),只是不能用旧版文件端点。
// WS 轮次端点(ws-ticket/round)用 EditFrozen();旧版文件端点用 ReadOnly()。
func (p *Project) EditFrozen() bool {
	return p.SchemaVersion == SchemaLegacy
}

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
	// ErrorKind 区分失败类型:latex=真 LaTeX 语法错(前端才 arm auto-fix)/ infra=内部/素材/沙箱错 / timeout=排队超时。
	// 只对 latex 回喂 AI 自动修复,infra/timeout 停在琥珀 banner,杜绝把基础设施抖动放大成 AI 轮风暴(性能审计)。
	ErrorKind    string     `gorm:"column:error_kind" json:"error_kind,omitempty"`
	// ErrorSource 错误源头维度(2026-07 线上审计 #3):body=正文 / bibliography=参考文献 / infra=基础设施。
	// 不落库:GetCompile 读时由 classifyCompileErrorSource 从已存 summary/excerpt 派生(向后兼容可选字段),
	// 前端据此把 bib 类错误分流出正文 auto-fix 回路(改 document.md 修不了 .bib,线上 11 轮白烧)。
	ErrorSource  string     `gorm:"-" json:"error_source,omitempty"`
	DurationMs    int        `gorm:"column:duration_ms" json:"duration_ms"`
	PageCount     int        `gorm:"column:page_count" json:"page_count"`
	OverfullCount int        `gorm:"column:overfull_count" json:"overfull_count"`
	ExpiresAt     *time.Time `gorm:"column:expires_at" json:"-"`
	CreatedAt     time.Time  `gorm:"column:created_at" json:"created_at"`
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

// 注:旧的 prism_chat_messages 对话双轨(ChatMessage model)已删除 —— prism 对话历史真源是
// agent jsonl(见 ws_round.go GetWSHistory),DB 不再存对话。表保留为 stranded(不读写)。

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
