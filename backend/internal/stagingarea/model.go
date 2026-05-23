// ============================================================================
// Scholay 检索工作区 · 暂存区 (Staging Areas) V1.0
// ----------------------------------------------------------------------------
// 单用户多组模型（每用户上限 5 组，每组上限 100 篇）。论文按 (source, paperId)
// 在组内去重。论文元数据冗余存储，与 user_library_papers 同策略。
// ============================================================================

package stagingarea

import (
	"encoding/json"
	"time"
)

const (
	MaxAreasPerUser     = 5
	MaxPapersPerArea    = 100
	DefaultAreaName     = "默认暂存区"
	SourceSTC           = "stc"
	SourceOLX           = "olx"
	SourcePMD           = "pmd"
)

// IsValidSource 校验源标识合法（与前端 UpstreamSource 三件套保持一致）
func IsValidSource(s string) bool {
	return s == SourceSTC || s == SourceOLX || s == SourcePMD
}

// ============================================================================
// GORM Models
// ============================================================================

// StagingArea 是 user_staging_areas 表对应模型
type StagingArea struct {
	ID        uint64    `json:"id" gorm:"primaryKey"`
	UserID    uint64    `json:"user_id" gorm:"not null;index"`
	Name      string    `json:"name" gorm:"size:64;not null;default:''"`
	Position  int       `json:"position" gorm:"not null;default:0"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// 关联论文 —— Preload("Papers") 时填充
	Papers []StagingAreaPaper `json:"papers,omitempty" gorm:"foreignKey:AreaID;references:ID"`
}

func (StagingArea) TableName() string { return "user_staging_areas" }

// StagingAreaPaper 是 user_staging_area_papers 表对应模型
type StagingAreaPaper struct {
	ID            uint64          `json:"id" gorm:"primaryKey"`
	AreaID        uint64          `json:"area_id" gorm:"not null;index"`
	UserID        uint64          `json:"user_id" gorm:"not null;index"`
	Source        string          `json:"source" gorm:"size:16;not null"`
	SourcePaperID string          `json:"source_paper_id" gorm:"size:128;not null"`
	Title         string          `json:"title" gorm:"size:1024;not null;default:''"`
	AuthorsJSON   json.RawMessage `json:"authors,omitempty" gorm:"column:authors_json;type:json"`
	Year          *uint16         `json:"year,omitempty"`
	Venue         string          `json:"venue" gorm:"size:512;not null;default:''"`
	DOI           string          `json:"doi" gorm:"size:255;not null;default:''"`
	Abstract      string          `json:"abstract" gorm:"type:mediumtext"`
	PdfURL        string          `json:"pdf_url" gorm:"size:1024;not null;default:''"`
	CitationCount uint32          `json:"citation_count" gorm:"not null;default:0"`
	IsOpenAccess  bool            `json:"is_open_access" gorm:"not null;default:false"`
	RawJSON       json.RawMessage `json:"raw,omitempty" gorm:"column:raw_json;type:json"`
	Position      int             `json:"position" gorm:"not null;default:0"`
	CreatedAt     time.Time       `json:"created_at"`
}

func (StagingAreaPaper) TableName() string { return "user_staging_area_papers" }

// ============================================================================
// DTOs
// ============================================================================

// PaperPayload 是前端落库时的论文数据形状 —— 与 frontend Paper interface 对齐
type PaperPayload struct {
	Source        string          `json:"source" binding:"required"`
	SourcePaperID string          `json:"source_paper_id" binding:"required"`
	Title         string          `json:"title"`
	Authors       json.RawMessage `json:"authors,omitempty"`
	Year          *uint16         `json:"year,omitempty"`
	Venue         string          `json:"venue"`
	DOI           string          `json:"doi"`
	Abstract      string          `json:"abstract"`
	PdfURL        string          `json:"pdf_url"`
	CitationCount uint32          `json:"citation_count"`
	IsOpenAccess  bool            `json:"is_open_access"`
	Raw           json.RawMessage `json:"raw,omitempty"`
}

// CreateAreaRequest POST /staging-areas
type CreateAreaRequest struct {
	Name string `json:"name"`
}

// UpdateAreaRequest PATCH /staging-areas/:id
type UpdateAreaRequest struct {
	Name *string `json:"name,omitempty"`
}

// AddPaperRequest POST /staging-areas/:id/papers
type AddPaperRequest = PaperPayload

// MigrateAreaPayload 一组论文 + 区域名（匿名→登录时本地数据全量上传）
type MigrateAreaPayload struct {
	Name   string         `json:"name"`
	Papers []PaperPayload `json:"papers"`
}

// MigrateRequest POST /staging-areas/migrate
type MigrateRequest struct {
	Areas []MigrateAreaPayload `json:"areas" binding:"required"`
}

// ListResponse GET /staging-areas
type ListResponse struct {
	Areas []StagingArea `json:"areas"`
}

// MigrateResponse 迁移返回的最终区域列表（含已合并的）
type MigrateResponse struct {
	Areas   []StagingArea `json:"areas"`
	Merged  int           `json:"merged"`
	Skipped int           `json:"skipped"`
}
