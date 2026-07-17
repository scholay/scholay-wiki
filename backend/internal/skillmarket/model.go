// ============================================================================
// Scholay Skills 市场 —— 数据模型 + DTO + 请求体
//
// ⚠️ 贯穿本模块的根本前提:用户 skill = 不可信内容。
//   - SKILL.md 是提示注入面;附带脚本(MVP 未放行)是 RCE 面。
//   - name/tagline/description 等字段是不可信展示文本,前端渲染必转义(禁 rehype-raw)。
//   - declared_tools 仅展示/审核参考,绝不据此授权。
//   - MVP 只放行 tier-1 纯指令 skill(一个 SKILL.md,无脚本/无 Bash/无出网)。
// ============================================================================

package skillmarket

import "time"

// ── 可见性 / 审核 / 状态 枚举 ────────────────────────────────────────────────
const (
	VisibilityPrivate  = "private"
	VisibilityUnlisted = "unlisted"
	VisibilityPublic   = "public"

	ModDraft    = "draft"
	ModPending  = "pending"
	ModApproved = "approved"
	ModRejected = "rejected"
	ModFlagged  = "flagged"

	StatusActive          = "active"
	StatusDisabledByAdmin = "disabled_by_admin"
	StatusDeleted         = "deleted"

	ScanPending = "pending"
	ScanClean   = "clean"
	ScanSuspect = "suspect"

	SourceSelf   = "self"
	SourceMarket = "market"

	ReportOpen      = "open"
	ReportReviewing = "reviewing"
	ReportActioned  = "actioned"
	ReportDismissed = "dismissed"
)

// ── 硬约束(与 executor loader.ts/registry.ts 常量对齐)──────────────────────
const (
	MaxSkillMdChars       = 8000            // 单份 SKILL.md 正文上限(executor MAX_SKILL_BODY=16000,留一半余量)
	MaxBundleBytes  int64 = 30 << 20        // bundle 总大小上限 30MB(多文件:SKILL.md + 脚本/资源)
	MaxEnabledPerSession  = 5               // 单会话装载用户 skill 上限(护 MENU_CAP_CHARS=2500)
	MaxSkillsFree         = 10              // 免费用户持有 skill 数
	MaxSkillsPro          = 50              // Pro 用户持有 skill 数
	MaxVersionsPerSkill   = 20              // 单 skill 版本数
	MaxMenuChars          = 60              // menu 字段强制截断
	MaxDescriptionChars   = 1024            // description 上限
	FlagReportThreshold   = 3               // 举报累计超此值自动 flagged
)

// UserSkill 市场主表。
type UserSkill struct {
	ID               uint      `gorm:"primarykey" json:"id"`
	UserID           uint      `gorm:"not null;index" json:"userId"`
	Slug             string    `gorm:"size:160;not null;uniqueIndex:uk_skill_slug" json:"slug"`
	Name             string    `gorm:"size:120;not null" json:"name"`              // 不可信展示文本
	Tagline          string    `gorm:"size:255;not null" json:"tagline"`           // 不可信
	DescriptionMD    string    `gorm:"type:text" json:"descriptionMd"`             // 不可信 markdown
	WhenToUse        string    `gorm:"size:1024;not null" json:"whenToUse"`
	DeclaredTools    string    `gorm:"type:json" json:"declaredTools"`             // 仅展示,不授权(JSON 数组字符串)
	CurrentVersionID *uint     `json:"currentVersionId"`
	Visibility       string    `gorm:"size:16;not null;default:private" json:"visibility"`
	ModerationStatus string    `gorm:"size:16;not null;default:draft" json:"moderationStatus"`
	ModerationNote   string    `gorm:"size:512;not null" json:"moderationNote"`
	Category         string    `gorm:"size:40;not null;default:other" json:"category"`
	ContentSource    string    `gorm:"size:16;not null;default:original" json:"contentSource"` // original 原创 | reposted 转载
	InstallCount     int64     `gorm:"not null;default:0" json:"installCount"`
	ReportCount      int       `gorm:"not null;default:0" json:"reportCount"`
	Status           string    `gorm:"size:16;not null;default:active" json:"status"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

func (UserSkill) TableName() string { return "user_skills" }

// SkillVersion 不可变版本。
type SkillVersion struct {
	ID               uint      `gorm:"primarykey" json:"id"`
	SkillID          uint      `gorm:"not null;uniqueIndex:uk_skill_version,priority:1" json:"skillId"`
	Version          int       `gorm:"not null;uniqueIndex:uk_skill_version,priority:2" json:"version"`
	ObjectKey        string    `gorm:"size:512;not null" json:"-"` // MinIO 对象键,内部用
	BundleSha256     string    `gorm:"size:64;not null;index" json:"bundleSha256"`
	BundleSize       int64     `gorm:"not null" json:"bundleSize"`
	ManifestJSON     string    `gorm:"type:json" json:"manifestJson"`
	SkillMD          string    `gorm:"type:mediumtext" json:"skillMd"` // 规范化后正文(物化热路径读此列)
	FileManifest     string    `gorm:"type:json" json:"fileManifest"`  // bundle 文件清单 [{path,size}]
	DownloadObjectKey string   `gorm:"size:512;not null;default:''" json:"-"` // 供外部下载的 tar.gz MinIO key(根=<slug>/)
	EntryCount       int       `gorm:"not null;default:1" json:"entryCount"`
	ScanStatus       string    `gorm:"size:16;not null;default:pending" json:"scanStatus"`
	ScanReport       string    `gorm:"type:json" json:"scanReport"`
	ModerationStatus string    `gorm:"size:16;not null;default:pending" json:"moderationStatus"`
	Changelog        string    `gorm:"size:512;not null" json:"changelog"`
	CreatedAt        time.Time `json:"createdAt"`
}

func (SkillVersion) TableName() string { return "skill_versions" }

// UserEnabledSkill 用户在 claw 启用了哪些(= installs)。
type UserEnabledSkill struct {
	ID              uint      `gorm:"primarykey" json:"id"`
	UserID          uint      `gorm:"not null;uniqueIndex:uk_user_skill,priority:1" json:"userId"`
	SkillID         uint      `gorm:"not null;uniqueIndex:uk_user_skill,priority:2;index" json:"skillId"`
	PinnedVersionID *uint     `json:"pinnedVersionId"`
	Enabled         bool      `gorm:"not null;default:true" json:"enabled"`
	Source          string    `gorm:"size:16;not null;default:self" json:"source"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

func (UserEnabledSkill) TableName() string { return "user_enabled_skills" }

// SkillReport 举报。
type SkillReport struct {
	ID             uint       `gorm:"primarykey" json:"id"`
	SkillID        uint       `gorm:"not null;uniqueIndex:uk_report_dedup,priority:1;index" json:"skillId"`
	VersionID      *uint      `json:"versionId"`
	ReporterUserID uint       `gorm:"not null;uniqueIndex:uk_report_dedup,priority:2" json:"reporterUserId"`
	Reason         string     `gorm:"size:32;not null;uniqueIndex:uk_report_dedup,priority:3;default:other" json:"reason"`
	Detail         string     `gorm:"size:1024;not null" json:"detail"`
	Status         string     `gorm:"size:16;not null;default:open;index" json:"status"`
	HandledBy      *uint      `json:"handledBy"`
	CreatedAt      time.Time  `json:"createdAt"`
	ResolvedAt     *time.Time `json:"resolvedAt"`
}

func (SkillReport) TableName() string { return "skill_reports" }

// ── DTO(对外响应,不直接暴露 GORM 模型的内部字段)──────────────────────────

// SkillCardDTO 市场列表/卡片视图。
type SkillCardDTO struct {
	ID            uint      `json:"id"`
	Slug          string    `json:"slug"`
	Name          string    `json:"name"`
	Tagline       string    `json:"tagline"`
	Category      string    `json:"category"`
	AuthorName    string    `json:"authorName"`
	InstallCount  int64     `json:"installCount"`
	Visibility    string    `json:"visibility"`
	UpdatedAt     time.Time `json:"updatedAt"`
	Installed     bool      `json:"installed"`     // 当前用户是否已装
	IsOwner       bool      `json:"isOwner"`       // 当前用户是否作者
}

// SkillDetailDTO 详情视图(含规范化后的 SKILL.md 正文供预览)。
type SkillDetailDTO struct {
	SkillCardDTO
	DescriptionMD    string              `json:"descriptionMd"`
	WhenToUse        string              `json:"whenToUse"`
	DeclaredTools    []string            `json:"declaredTools"`
	SkillMD          string              `json:"skillMd"`          // 规范化后正文(不可信,前端渲染禁 raw HTML)
	Version          int                 `json:"version"`
	ModerationStatus string              `json:"moderationStatus"` // 作者/管理端可见来源标签
	ContentSource    string              `json:"contentSource"`    // original | reposted
	FileManifest     []FileManifestEntry `json:"fileManifest"`     // bundle 文件清单
	Install          *InstallCommands    `json:"install"`          // 跨 agent 安装命令(public+approved 才有)
	CreatedAt        time.Time           `json:"createdAt"`
}

// InstallCommands 「去使用」区展示的跨 agent 安装方式(按请求 host 生成)。
type InstallCommands struct {
	DownloadURL    string `json:"downloadUrl"`    // 公开 tar.gz 直链
	ClaudeCodeCurl string `json:"claudeCodeCurl"` // Claude Code:一行 curl 拉进 ~/.claude/skills
	MarketplaceAdd string `json:"marketplaceAdd"` // 可选:/plugin marketplace add …(需 git,当前主推 curl)
	InstallMdURL   string `json:"installMdUrl"`   // 商店 install.md 地址
	ShareURL       string `json:"shareUrl"`       // 分享落地页 URL
}

// MySkillDTO 「我的 skills」列表项(作者视图,含审核状态)。
type MySkillDTO struct {
	ID               uint      `json:"id"`
	Slug             string    `json:"slug"`
	Name             string    `json:"name"`
	Tagline          string    `json:"tagline"`
	Category         string    `json:"category"`
	Visibility       string    `json:"visibility"`
	ModerationStatus string    `json:"moderationStatus"`
	ModerationNote   string    `json:"moderationNote"`
	Status           string    `json:"status"`
	InstallCount     int64     `json:"installCount"`
	Version          int       `json:"version"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

// InstalledSkillDTO claw 启用面板用:我已安装的 skill(自建 + 装的别人的)。
type InstalledSkillDTO struct {
	SkillID   uint   `json:"skillId"`
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	Tagline   string `json:"tagline"`
	GuideName string `json:"guideName"` // = u<作者uid>-<slug>,会话内 Skill 帧的加载 key;前端据此精确匹配"这轮用的是我的哪个技能"(去掉脆弱的 ^u\d+- 前缀解析)
	Source    string `json:"source"`
	Enabled   bool   `json:"enabled"`
	Available bool   `json:"available"` // 作者是否已下架/失效(false = 建会话时会被跳过)
}

// ── 请求体 ──────────────────────────────────────────────────────────────────

type ListMarketRequest struct {
	Q        string `form:"q"`
	Category string `form:"category"`
	Sort     string `form:"sort"` // popular | recent
	Page     int    `form:"page"`
	PageSize int    `form:"pageSize"`
}

type ListMarketResponse struct {
	List     []SkillCardDTO `json:"list"`
	Total    int64          `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"pageSize"`
}

type UpdateSkillMetaRequest struct {
	Name       string `json:"name" binding:"omitempty,max=120"`
	Tagline    string `json:"tagline" binding:"omitempty,max=255"`
	Category   string `json:"category" binding:"omitempty,max=40"`
	Visibility string `json:"visibility" binding:"omitempty,oneof=private unlisted public"`
}

type PublishRequest struct {
	Visibility string `json:"visibility" binding:"required,oneof=unlisted public"`
}

type InstallRequest struct {
	SkillID uint `json:"skillId" binding:"required"`
}

type SetEnabledRequest struct {
	Enabled bool `json:"enabled"`
}

type ReportRequest struct {
	Reason string `json:"reason" binding:"required,oneof=prompt_injection malware data_exfil ip_infringe spam other"`
	Detail string `json:"detail" binding:"omitempty,max=1024"`
}

type RejectRequest struct {
	Note string `json:"note" binding:"omitempty,max=512"`
}
