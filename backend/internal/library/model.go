// ============================================================================
// Scholay 文献集 V2.0
// ----------------------------------------------------------------------------
// **一级文件夹模型** —— 用户可建若干文件夹(folders 不嵌套),论文通过
// folder_id 挂在文件夹下;folder_id IS NULL 表示「根目录」直接放论文。
//
// 唯一性按 (user_id, source, source_paper_id) — 同一论文从不同源加入
// 会保存两份,因为 stc/olx/pmd 三个数据源的 paperId 不互通。
// ============================================================================

package library

import (
	"encoding/json"
	"time"
)

// 支持的搜索源
const (
	SourceSTC   = "stc"   // 精选(Semantic Scholar)
	SourceOLX   = "olx"   // 全域(OpenAlex)
	SourcePMD   = "pmd"   // 医学(PubMed)
	SourceLocal = "local" // 自由文件 —— 本地上传的 PDF(pdfparse 识别),source_paper_id 用 PDF sha256
)

// 收藏行的关联状态(对应 column link_state)
const (
	LinkStateLinked = "linked" // 关联到上游论文(stc/olx/pmd 任一)
	LinkStateFree   = "free"   // 自由文件 —— 未关联上游,字段由 pdfparse 兜底识别落 og_*
)

// 用户单一资源上限(防止恶意 / 误操作把存储吃满)
//
// 这些是**风险防控阈值**,前端没必要直显示给用户;只有触达上限的请求才在响应里
// 带出友好提示。日常使用不会接近这些数,真撞上一般是脚本批量灌库或异常循环。
const (
	MaxFoldersPerUser    = 50
	MaxFolderNameRuneLen = 32
	// 文献集总条数上限 —— 每用户最多 1000 条收藏(含 linked + free 上传)。
	// 超过时所有新增路径(收藏/上传)都阻断,提示用户清理。
	MaxPapersPerUser = 1000
)

// DefaultFolderName 是系统为每个用户自动创建的默认文件夹名称。
// 用户首次收藏论文时若没指定 folder_id,后端 lazy 创建并把论文挂进去。
// 这个名字是**保留字**:CreateFolder / UpdateFolder 都会拒绝叫这个名字的新建/改名。
const DefaultFolderName = "默认文件夹"

// IsValidSource 校验前端传过来的源是否合法。
// 注意 'local' 只允许后端内部使用(智能上传流程落自由文件),
// 不接受前端直接 POST /user/library 传 source='local',因此用 IsValidUpstreamSource 兜底。
func IsValidSource(s string) bool {
	return s == SourceSTC || s == SourceOLX || s == SourcePMD || s == SourceLocal
}

// IsValidUpstreamSource 只接受上游三源(stc/olx/pmd),用于前端可直接传的端点
// (POST /user/library 等)。
func IsValidUpstreamSource(s string) bool {
	return s == SourceSTC || s == SourceOLX || s == SourcePMD
}

// UserLibraryFolder 是 user_library_folders 表对应的 GORM 模型 —— 一级文件夹。
type UserLibraryFolder struct {
	ID        uint64    `json:"id" gorm:"primaryKey"`
	UserID    uint64    `json:"user_id" gorm:"not null;index"`
	Name      string    `json:"name" gorm:"size:64;not null;default:''"`
	Position  int       `json:"position" gorm:"not null;default:0"`
	IsDefault bool      `json:"is_default" gorm:"column:is_default;not null;default:false"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (UserLibraryFolder) TableName() string { return "user_library_folders" }

// UserLibraryPaper 是 user_library_papers 表对应的 GORM 模型。
// 论文元数据冗余落库:外部源短暂不可用时本地仍能完整展示用户的收藏。
// FolderID 是 NULL = 根目录;非 NULL = 归属某个文件夹。
//
// PDF 上传字段(0036 迁移加):用户可以为单篇论文上传一份 PDF,文件本体走
// MinIO,这里只存元数据。重新上传会覆盖旧 object_key(并删旧对象)。
//
//	PdfUploadedAt IS NULL → 还没上传过;前端按这个判 "上传 PDF" / "重新上传" 文案。
type UserLibraryPaper struct {
	ID                   uint64          `json:"id" gorm:"primaryKey"`
	UserID               uint64          `json:"user_id" gorm:"not null;index"`
	FolderID             *uint64         `json:"folder_id,omitempty" gorm:"index"` // NULL = 根目录
	Source               string          `json:"source" gorm:"size:16;not null"`
	SourcePaperID        string          `json:"source_paper_id" gorm:"size:128;not null"`
	Title                string          `json:"title" gorm:"size:1024;not null;default:''"`
	AuthorsJSON          json.RawMessage `json:"authors,omitempty" gorm:"column:authors_json;type:json"`
	Year                 *uint16         `json:"year,omitempty"`
	Venue                string          `json:"venue" gorm:"size:512;not null;default:''"`
	DOI                  string          `json:"doi" gorm:"size:255;not null;default:''"`
	Abstract             string          `json:"abstract" gorm:"type:mediumtext"`
	PdfURL               string          `json:"pdf_url" gorm:"size:1024;not null;default:''"`
	PublicationTypesJSON json.RawMessage `json:"publication_types,omitempty" gorm:"column:publication_types_json;type:json"`
	CitationCount        uint32          `json:"citation_count" gorm:"not null;default:0"`
	RawJSON              json.RawMessage `json:"-" gorm:"column:raw_json;type:json"`
	// ---- 用户上传 PDF(存 MinIO,这里只是元数据) ----
	PdfObjectKey        string     `json:"-" gorm:"column:pdf_object_key;size:512;not null;default:''"`
	PdfOriginalFilename string     `json:"pdf_original_filename,omitempty" gorm:"column:pdf_original_filename;size:255;not null;default:''"`
	PdfSize             int64      `json:"pdf_size,omitempty" gorm:"column:pdf_size;not null;default:0"`
	PdfSHA256           string     `json:"pdf_sha256,omitempty" gorm:"column:pdf_sha256;size:64;not null;default:''"`
	PdfMime             string     `json:"pdf_mime,omitempty" gorm:"column:pdf_mime;size:64;not null;default:''"`
	PdfUploadedAt       *time.Time `json:"pdf_uploaded_at,omitempty" gorm:"column:pdf_uploaded_at"`
	// ---- og_*: 用户侧覆盖字段(用户编辑 / pdfparse 抽取), 与上游"元数据"分离 ----
	// 写入路径:
	//   1) PDF 上传 → pdfparse heuristic 抽取 → 写 og_*(只填空, 绝不覆盖非空 og)
	//   2) 用户手动编辑 (PATCH /library/papers/:id) → 写 og_*
	// 读取展示:
	//   前端 pickField(og, metadata) —— og_xx 非空就用 og, 否则 fallback 到元数据,
	//   两者都空才不渲染。元数据(上游冻结)永远不会被用户编辑污染。
	OGTitle       string          `json:"og_title,omitempty" gorm:"column:og_title;size:1024;not null;default:''"`
	OGAbstract    string          `json:"og_abstract,omitempty" gorm:"column:og_abstract;type:mediumtext"`
	OGAuthorsJSON json.RawMessage `json:"og_authors,omitempty" gorm:"column:og_authors_json;type:json"`
	OGYear        *uint16         `json:"og_year,omitempty" gorm:"column:og_year"`
	OGVenue       string          `json:"og_venue,omitempty" gorm:"column:og_venue;size:512;not null;default:''"`
	OGDOI         string          `json:"og_doi,omitempty" gorm:"column:og_doi;size:255;not null;default:''"`
	// ---- 关联状态 —— 'linked' (常规上游收藏) / 'free' (本地自由文件) ----
	LinkState string `json:"link_state" gorm:"column:link_state;size:16;not null;default:'linked'"`
	// ---- 来源动作 —— 'search' (用户在搜索/详情/QuickAdd 点收藏) / 'upload' (PDF 上传走出来的) ----
	// 与 LinkState 正交:linked+search 是搜索来的、linked+upload 是上传后关联的、free+upload 是上传未关联;
	// 文献集行用它区分主操作:search 行管理 PDF,upload 行管理关联。
	Origin    string    `json:"origin" gorm:"column:origin;size:16;not null;default:'search'"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

const (
	OriginSearch = "search"
	OriginUpload = "upload"
)

// TableName 显式给出表名(避免被 GORM 复数化)
func (UserLibraryPaper) TableName() string {
	return "user_library_papers"
}

// ========== DTO ==========

// AddPaperRequest 前端 POST /api/v1/user/library 的请求体
//
// source + source_paper_id 是唯一定位键;其余字段是冗余的展示元数据。
// folder_id 可选(null/缺省 = 放到根目录)。
type AddPaperRequest struct {
	Source           string          `json:"source" binding:"required"`
	SourcePaperID    string          `json:"source_paper_id" binding:"required"`
	FolderID         *uint64         `json:"folder_id,omitempty"`
	Title            string          `json:"title"`
	Authors          json.RawMessage `json:"authors,omitempty"`
	Year             *uint16         `json:"year,omitempty"`
	Venue            string          `json:"venue"`
	DOI              string          `json:"doi"`
	Abstract         string          `json:"abstract"`
	PdfURL           string          `json:"pdf_url"`
	PublicationTypes json.RawMessage `json:"publication_types,omitempty"`
	CitationCount    uint32          `json:"citation_count"`
	Raw              json.RawMessage `json:"raw,omitempty"`
}

// ListResponse 列表接口的响应
type ListResponse struct {
	Items []UserLibraryPaper `json:"items"`
	Total int64              `json:"total"`
}

// CheckRequest 批量查询某一组 (source, paperId) 是否在我的文献集
type CheckRequest struct {
	Source   string   `json:"source" binding:"required"`
	PaperIDs []string `json:"paper_ids" binding:"required"`
}

// CheckResponse 返回每个 paperId 是否已收藏(true/false)
type CheckResponse struct {
	Saved map[string]bool `json:"saved"`
}

// ========== Folder DTO ==========

// FolderListItem 文件夹列表项 —— 自带论文计数,前端 sidebar 直接渲染
type FolderListItem struct {
	UserLibraryFolder
	PaperCount int64 `json:"paper_count"`
}

// FolderListResponse GET /user/library/folders 的响应
//
// 多带 root_count 字段:根目录(folder_id IS NULL)的论文数量,
// 让前端 "全部 / 根目录" 节点也能秒出计数。
type FolderListResponse struct {
	Folders    []FolderListItem `json:"folders"`
	TotalCount int64            `json:"total_count"` // 用户所有论文总数
	RootCount  int64            `json:"root_count"`  // 根目录论文数
}

// CreateFolderRequest POST /user/library/folders
type CreateFolderRequest struct {
	Name string `json:"name"`
}

// UpdateFolderRequest PATCH /user/library/folders/:id
type UpdateFolderRequest struct {
	Name *string `json:"name,omitempty"`
}

// MovePaperRequest PATCH /user/library/papers/:id/folder
// folder_id 为 null 表示移到根目录
type MovePaperRequest struct {
	FolderID *uint64 `json:"folder_id"`
}

// BatchMoveRequest POST /user/library/papers/batch/move
// folder_id 为 null 表示移到根目录;ids 是 user_library_papers.id 数组
type BatchMoveRequest struct {
	IDs      []uint64 `json:"ids" binding:"required,min=1,max=500"`
	FolderID *uint64  `json:"folder_id"`
}

// BatchDeleteRequest POST /user/library/papers/batch/delete
type BatchDeleteRequest struct {
	IDs []uint64 `json:"ids" binding:"required,min=1,max=500"`
}

// BatchResult 通用批量操作响应
type BatchResult struct {
	Affected int64 `json:"affected"`
}
