// ============================================================================
// Scholay 智能审稿 v3 — GORM 模型
// ----------------------------------------------------------------------------
// 表来自 migration 0057_peer_review_v3_tables.sql:
//
//   peer_review_submissions  投稿主表(草稿 + 已交 + 审稿结果元数据)
//   peer_review_assets       MinIO 文件元数据
//   peer_review_reports      4 份审稿报告(alpha/beta/gamma/chief)
//
// 设计:
//   - 期刊 / 毕业 共用一张主表,差异字段并存,
//     mode='journal' 用 journal_* 列,mode='thesis' 用 school_* 列
//   - JSON 字段 (journal_meta_json / scores_json) 不在 model 里 unmarshal,
//     repo 把 raw bytes 暴露给 service / handler 自己 decode
//   - 不写 BeforeCreate hook,所有时间走 DB CURRENT_TIMESTAMP 默认值
// ============================================================================

package peerreview

import (
	"database/sql"
	"encoding/json"
	"time"
)

type Submission struct {
	ID                uint64        `gorm:"primaryKey" json:"id"`
	UserID            uint64        `gorm:"column:user_id;not null;index" json:"userId"`
	Mode              string        `gorm:"column:mode;size:16;not null" json:"mode"`
	Status            string        `gorm:"column:status;size:16;not null;default:draft" json:"status"`
	Step              uint8         `gorm:"column:step;not null;default:1" json:"step"`
	Title             sql.NullString `gorm:"column:title;size:500" json:"-"`
	Abstract          sql.NullString `gorm:"column:abstract;type:text" json:"-"`
	ManuscriptAssetID sql.NullInt64  `gorm:"column:manuscript_asset_id" json:"-"`

	JournalID       sql.NullInt64  `gorm:"column:journal_id" json:"-"`
	JournalName     sql.NullString `gorm:"column:journal_name;size:500" json:"-"`
	JournalMetaJSON json.RawMessage `gorm:"column:journal_meta_json;type:json" json:"-"`

	SchoolName       sql.NullString `gorm:"column:school_name;size:255" json:"-"`
	DegreeType       sql.NullString `gorm:"column:degree_type;size:16" json:"-"`
	DisciplineField  sql.NullString `gorm:"column:discipline_field;size:255" json:"-"`
	AdvisorName      sql.NullString `gorm:"column:advisor_name;size:100" json:"-"`

	LetterBody sql.NullString `gorm:"column:letter_body;type:mediumtext" json:"-"`

	AgreedAt        sql.NullTime   `gorm:"column:agreed_at" json:"-"`
	AgentSessionID  sql.NullString `gorm:"column:agent_session_id;size:64" json:"-"`
	SubmittedAt     sql.NullTime   `gorm:"column:submitted_at" json:"-"`
	CompletedAt     sql.NullTime   `gorm:"column:completed_at" json:"-"`
	FailedReason    sql.NullString `gorm:"column:failed_reason;size:500" json:"-"`

	// ─── 0058 新增 ─────────────────────────────────────────────────────
	// AssetsRevision / MetaRevision / LetterRevision 是 step_cache fingerprint 的输入,
	// 上游字段变化 → 对应 revision +1 → cache fingerprint 不匹配 → 自动 stale。
	AssetsRevision uint32 `gorm:"column:assets_revision;not null;default:0" json:"-"`
	MetaRevision   uint32 `gorm:"column:meta_revision;not null;default:0" json:"-"`
	LetterRevision uint32 `gorm:"column:letter_revision;not null;default:0" json:"-"`

	// ExtraMetaJSON 存 keywords/subjects/manuscriptType (title/abstract 在顶层列)。
	// service 层用 ExtractedMeta 序列化/反序列化, repo 只看到 raw bytes。
	ExtraMetaJSON json.RawMessage `gorm:"column:extra_meta_json;type:json" json:"-"`

	// ComputeState 是 wizard 异步 agent 调用的标记:
	//   idle             空闲, 可点下一步
	//   computing_meta   Step1→2 抽 meta 中
	//   computing_letter Step2→3 起草 letter 中
	//   reviewing        Step4 投递后 4 轮审稿中
	//   failed           agent 异常, ComputeError 给前端展示
	ComputeState string         `gorm:"column:compute_state;size:20;not null;default:idle" json:"-"`
	ComputeError sql.NullString `gorm:"column:compute_error;size:500" json:"-"`

	CreatedAt time.Time `gorm:"column:created_at;not null;autoCreateTime" json:"createdAt"`
	UpdatedAt time.Time `gorm:"column:updated_at;not null;autoUpdateTime" json:"updatedAt"`

	// ChiefDecision 是非持久化派生字段 (gorm:"-"): 列表页用主审报告的 recommendation 填充,
	// 让"决议"列直接显示结果 (而不是泛泛的"已完成")。仅 service.ListSubmissions 批量填充。
	ChiefDecision string `gorm:"-" json:"-"`
}

func (Submission) TableName() string { return "peer_review_submissions" }

// StepCache 是 wizard 每步 agent 输出的缓存。
//
// fingerprint 不匹配 → 调 agent 重算 + ON DUPLICATE KEY UPDATE 覆写,
// 永远只有一行 per (submission_id, step), 不需要 GC 旧分支。
type StepCache struct {
	SubmissionID     uint64          `gorm:"column:submission_id;primaryKey" json:"submissionId"`
	Step             uint8           `gorm:"column:step;primaryKey" json:"step"`
	InputFingerprint string          `gorm:"column:input_fingerprint;size:64;not null" json:"inputFingerprint"`
	PayloadJSON      json.RawMessage `gorm:"column:payload_json;type:json;not null" json:"-"`
	AgentTokensIn    sql.NullInt32   `gorm:"column:agent_tokens_in" json:"-"`
	AgentTokensOut   sql.NullInt32   `gorm:"column:agent_tokens_out" json:"-"`
	CreatedAt        time.Time       `gorm:"column:created_at;not null;autoCreateTime" json:"createdAt"`
	UpdatedAt        time.Time       `gorm:"column:updated_at;not null;autoUpdateTime" json:"updatedAt"`
}

func (StepCache) TableName() string { return "peer_review_step_cache" }

type Asset struct {
	ID           uint64    `gorm:"primaryKey" json:"id"`
	SubmissionID uint64    `gorm:"column:submission_id;not null;index" json:"submissionId"`
	Role         string    `gorm:"column:role;size:16;not null" json:"role"`
	Category     sql.NullString `gorm:"column:category;size:32" json:"-"`
	Filename     string    `gorm:"column:filename;size:255;not null" json:"filename"`
	Size         uint64    `gorm:"column:size;not null" json:"size"`
	Mime         string    `gorm:"column:mime;size:100;not null" json:"mime"`
	SHA256       sql.NullString `gorm:"column:sha256;size:64" json:"-"`
	ObjectKey    string    `gorm:"column:object_key;size:512;not null" json:"-"`
	TextChars    sql.NullInt32  `gorm:"column:text_chars" json:"-"`
	TextExcerpt  sql.NullString `gorm:"column:text_excerpt;type:mediumtext" json:"-"`
	CreatedAt    time.Time `gorm:"column:created_at;not null;autoCreateTime" json:"createdAt"`
}

func (Asset) TableName() string { return "peer_review_assets" }

type Report struct {
	ID               uint64    `gorm:"primaryKey" json:"id"`
	SubmissionID     uint64    `gorm:"column:submission_id;not null;index" json:"submissionId"`
	Role             string    `gorm:"column:role;size:8;not null" json:"role"`
	Decision         sql.NullString `gorm:"column:decision;size:16" json:"-"`
	ScoresJSON       json.RawMessage `gorm:"column:scores_json;type:json" json:"-"`
	ContentMd        string    `gorm:"column:content_md;type:mediumtext;not null" json:"contentMd"`
	AgentDurationSec sql.NullInt32  `gorm:"column:agent_duration_sec" json:"-"`
	AgentTokensIn    sql.NullInt32  `gorm:"column:agent_tokens_in" json:"-"`
	AgentTokensOut   sql.NullInt32  `gorm:"column:agent_tokens_out" json:"-"`
	CreatedAt        time.Time `gorm:"column:created_at;not null;autoCreateTime" json:"createdAt"`

	// ─── 0062 新增: 结构化字段, 取代 content_md 单块 markdown ───────────
	// 老报告这些都是 NULL, 前端读取时做 nil-check 兜底。
	ReviewerSkillID    sql.NullInt64   `gorm:"column:reviewer_skill_id" json:"-"`
	Score              sql.NullInt32   `gorm:"column:score" json:"-"`
	Recommendation     sql.NullString  `gorm:"column:recommendation;size:16" json:"-"`
	Expertise          sql.NullString  `gorm:"column:expertise;size:120" json:"-"`
	DimensionsJSON     json.RawMessage `gorm:"column:dimensions_json;type:json" json:"-"`
	LineCommentsJSON   json.RawMessage `gorm:"column:line_comments_json;type:json" json:"-"`
	MacroCommentsJSON  json.RawMessage `gorm:"column:macro_comments_json;type:json" json:"-"`
	FinalSummaryMd     sql.NullString  `gorm:"column:final_summary_md;type:mediumtext" json:"-"`

	// chief 专有
	RulingSummaryMd         sql.NullString  `gorm:"column:ruling_summary_md;type:mediumtext" json:"-"`
	RulingParagraphMd       sql.NullString  `gorm:"column:ruling_paragraph_md;type:mediumtext" json:"-"`
	ReviewerResponsesJSON   json.RawMessage `gorm:"column:reviewer_responses_json;type:json" json:"-"`
	MustFixJSON             json.RawMessage `gorm:"column:must_fix_json;type:json" json:"-"`
	SuggestionsJSON         json.RawMessage `gorm:"column:suggestions_json;type:json" json:"-"`
	DeadlineDays            sql.NullInt32   `gorm:"column:deadline_days" json:"-"`
	SummaryForAuthor        sql.NullString  `gorm:"column:summary_for_author;size:300" json:"-"`
}

func (Report) TableName() string { return "peer_review_reports" }
