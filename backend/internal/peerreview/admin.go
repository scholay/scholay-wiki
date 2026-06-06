// ============================================================================
// 审稿数据监控(管理端,内测期定位问题)—— 完整透出投稿草稿过程 + 审稿结果 + 每个审稿人的
// 全部数据。样式不必同用户端,但数据必须齐全:故这里把所有 `json:"-"` 的字段都展开成专门的
// admin DTO(NullX 解引用、JSON 列原样透传不 base64)。只读,不改任何投稿。
// ============================================================================

package peerreview

import (
	"database/sql"
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

func admStr(v sql.NullString) string {
	if v.Valid {
		return v.String
	}
	return ""
}
func admI32(v sql.NullInt32) *int32 {
	if v.Valid {
		x := v.Int32
		return &x
	}
	return nil
}
func admI64(v sql.NullInt64) *int64 {
	if v.Valid {
		x := v.Int64
		return &x
	}
	return nil
}
func admTime(v sql.NullTime) *time.Time {
	if v.Valid {
		x := v.Time
		return &x
	}
	return nil
}
func admRaw(v json.RawMessage) json.RawMessage {
	if len(v) == 0 {
		return nil
	}
	return v
}

// ─── DTO ────────────────────────────────────────────────────────────────

// AdminPRListRow 投稿列表一行(联表 users 取邮箱/用户名)。
type AdminPRListRow struct {
	ID          uint64    `json:"id"`
	UserID      uint64    `json:"userId"`
	UserEmail   string    `json:"userEmail"`
	Username    string    `json:"username"`
	Mode        string    `json:"mode"`
	Status      string    `json:"status"`
	Title       string    `json:"title"`
	JournalName string    `json:"journalName"`
	SchoolName  string    `json:"schoolName"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// AdminPRSubmission 投稿全字段(草稿过程数据)。
type AdminPRSubmission struct {
	ID              uint64          `json:"id"`
	UserID          uint64          `json:"userId"`
	Mode            string          `json:"mode"`
	Status          string          `json:"status"`
	Step            uint8           `json:"step"`
	Title           string          `json:"title"`
	Abstract        string          `json:"abstract"`
	JournalName     string          `json:"journalName"`
	JournalMeta     json.RawMessage `json:"journalMeta,omitempty"`
	SchoolName      string          `json:"schoolName"`
	DegreeType      string          `json:"degreeType"`
	DisciplineField string          `json:"disciplineField"`
	AdvisorName     string          `json:"advisorName"`
	LetterBody      string          `json:"letterBody"`
	ExtraMeta       json.RawMessage `json:"extraMeta,omitempty"`
	ComputeState    string          `json:"computeState"`
	ComputeError    string          `json:"computeError"`
	FailedReason    string          `json:"failedReason"`
	AgentSessionID  string          `json:"agentSessionId"`
	AgreedAt        *time.Time      `json:"agreedAt"`
	SubmittedAt     *time.Time      `json:"submittedAt"`
	CompletedAt     *time.Time      `json:"completedAt"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
}

// AdminPRReport 审稿人报告全字段(审稿结果 + 每个审稿人的数据)。
type AdminPRReport struct {
	ID                uint64          `json:"id"`
	Role              string          `json:"role"`
	Decision          string          `json:"decision"`
	Scores            json.RawMessage `json:"scores,omitempty"`
	ContentMd         string          `json:"contentMd"`
	Score             *int32          `json:"score"`
	Recommendation    string          `json:"recommendation"`
	Expertise         string          `json:"expertise"`
	ReviewerSkillID   *int64          `json:"reviewerSkillId"`
	Dimensions        json.RawMessage `json:"dimensions,omitempty"`
	LineComments      json.RawMessage `json:"lineComments,omitempty"`
	MacroComments     json.RawMessage `json:"macroComments,omitempty"`
	FinalSummaryMd    string          `json:"finalSummaryMd"`
	RulingSummaryMd   string          `json:"rulingSummaryMd"`
	RulingParagraphMd string          `json:"rulingParagraphMd"`
	ReviewerResponses json.RawMessage `json:"reviewerResponses,omitempty"`
	MustFix           json.RawMessage `json:"mustFix,omitempty"`
	Suggestions       json.RawMessage `json:"suggestions,omitempty"`
	DeadlineDays      *int32          `json:"deadlineDays"`
	SummaryForAuthor  string          `json:"summaryForAuthor"`
	AgentDurationSec  *int32          `json:"agentDurationSec"`
	AgentTokensIn     *int32          `json:"agentTokensIn"`
	AgentTokensOut    *int32          `json:"agentTokensOut"`
	CreatedAt         time.Time       `json:"createdAt"`
}

// AdminPRAsset 投稿附件元数据 + AI 实际读到的抽取文本(textExcerpt)。
type AdminPRAsset struct {
	ID          uint64    `json:"id"`
	Role        string    `json:"role"`
	Category    string    `json:"category"`
	Filename    string    `json:"filename"`
	Size        uint64    `json:"size"`
	Mime        string    `json:"mime"`
	TextChars   *int32    `json:"textChars"`
	TextExcerpt string    `json:"textExcerpt"`
	CreatedAt   time.Time `json:"createdAt"`
}

// AdminPRDetail 一份投稿的完整监控数据。
type AdminPRDetail struct {
	Submission AdminPRSubmission `json:"submission"`
	Assets     []AdminPRAsset    `json:"assets"`
	Reports    []AdminPRReport   `json:"reports"`
}

func toAdminSubmission(s *Submission) AdminPRSubmission {
	return AdminPRSubmission{
		ID: s.ID, UserID: s.UserID, Mode: s.Mode, Status: s.Status, Step: s.Step,
		Title: admStr(s.Title), Abstract: admStr(s.Abstract),
		JournalName: admStr(s.JournalName), JournalMeta: admRaw(s.JournalMetaJSON),
		SchoolName: admStr(s.SchoolName), DegreeType: admStr(s.DegreeType),
		DisciplineField: admStr(s.DisciplineField), AdvisorName: admStr(s.AdvisorName),
		LetterBody: admStr(s.LetterBody), ExtraMeta: admRaw(s.ExtraMetaJSON),
		ComputeState: s.ComputeState, ComputeError: admStr(s.ComputeError),
		FailedReason: admStr(s.FailedReason), AgentSessionID: admStr(s.AgentSessionID),
		AgreedAt: admTime(s.AgreedAt), SubmittedAt: admTime(s.SubmittedAt),
		CompletedAt: admTime(s.CompletedAt), CreatedAt: s.CreatedAt, UpdatedAt: s.UpdatedAt,
	}
}

func toAdminReport(r Report) AdminPRReport {
	return AdminPRReport{
		ID: r.ID, Role: r.Role, Decision: admStr(r.Decision), Scores: admRaw(r.ScoresJSON),
		ContentMd: r.ContentMd, Score: admI32(r.Score), Recommendation: admStr(r.Recommendation),
		Expertise: admStr(r.Expertise), ReviewerSkillID: admI64(r.ReviewerSkillID),
		Dimensions: admRaw(r.DimensionsJSON), LineComments: admRaw(r.LineCommentsJSON),
		MacroComments: admRaw(r.MacroCommentsJSON), FinalSummaryMd: admStr(r.FinalSummaryMd),
		RulingSummaryMd: admStr(r.RulingSummaryMd), RulingParagraphMd: admStr(r.RulingParagraphMd),
		ReviewerResponses: admRaw(r.ReviewerResponsesJSON), MustFix: admRaw(r.MustFixJSON),
		Suggestions: admRaw(r.SuggestionsJSON), DeadlineDays: admI32(r.DeadlineDays),
		SummaryForAuthor: admStr(r.SummaryForAuthor), AgentDurationSec: admI32(r.AgentDurationSec),
		AgentTokensIn: admI32(r.AgentTokensIn), AgentTokensOut: admI32(r.AgentTokensOut),
		CreatedAt: r.CreatedAt,
	}
}

func toAdminAsset(a Asset) AdminPRAsset {
	return AdminPRAsset{
		ID: a.ID, Role: a.Role, Category: admStr(a.Category), Filename: a.Filename,
		Size: a.Size, Mime: a.Mime, TextChars: admI32(a.TextChars),
		TextExcerpt: admStr(a.TextExcerpt), CreatedAt: a.CreatedAt,
	}
}

// ─── Repository ─────────────────────────────────────────────────────────

// AdminListSubmissions 列投稿(userID 精确 / keyword 模糊邮箱+用户名+标题),按创建倒序。
func (r *Repository) AdminListSubmissions(userID *uint64, keyword string, offset, limit int) ([]AdminPRListRow, int64, error) {
	q := r.db.Table("peer_review_submissions AS s").Joins("LEFT JOIN users u ON u.id = s.user_id")
	if userID != nil {
		q = q.Where("s.user_id = ?", *userID)
	}
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("u.email LIKE ? OR u.username LIKE ? OR s.title LIKE ?", like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []AdminPRListRow
	if err := q.
		Select("s.id, s.user_id, COALESCE(u.email,'') AS user_email, COALESCE(u.username,'') AS username, " +
			"s.mode, s.status, COALESCE(s.title,'') AS title, COALESCE(s.journal_name,'') AS journal_name, " +
			"COALESCE(s.school_name,'') AS school_name, s.created_at, s.updated_at").
		Order("s.created_at DESC").Offset(offset).Limit(limit).Scan(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// ─── Service ────────────────────────────────────────────────────────────

func (s *Service) AdminListSubmissions(userID *uint64, keyword string, offset, limit int) ([]AdminPRListRow, int64, error) {
	return s.repo.AdminListSubmissions(userID, keyword, offset, limit)
}

func (s *Service) AdminSubmissionDetail(id uint64) (*AdminPRDetail, error) {
	sub, err := s.repo.GetByIDInternal(id)
	if err != nil {
		return nil, err
	}
	reports, err := s.repo.ListReports(id)
	if err != nil {
		return nil, err
	}
	assets, err := s.repo.ListAssets(id)
	if err != nil {
		return nil, err
	}
	d := &AdminPRDetail{Submission: toAdminSubmission(sub)}
	for _, rep := range reports {
		d.Reports = append(d.Reports, toAdminReport(rep))
	}
	for _, a := range assets {
		d.Assets = append(d.Assets, toAdminAsset(a))
	}
	return d, nil
}

// ─── Handler ────────────────────────────────────────────────────────────

// AdminListSubmissions GET /admin/peer-review/submissions?userId=&keyword=&page=&pageSize=
func (h *Handler) AdminListSubmissions(c *gin.Context) {
	var userID *uint64
	if s := strings.TrimSpace(c.Query("userId")); s != "" {
		if v, err := strconv.ParseUint(s, 10, 64); err == nil && v > 0 {
			userID = &v
		}
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	rows, total, err := h.svc.AdminListSubmissions(userID, keyword, (page-1)*pageSize, pageSize)
	if err != nil {
		utils.InternalError(c, 500, "查询投稿失败", err)
		return
	}
	utils.Success(c, gin.H{"list": rows, "total": total, "page": page, "pageSize": pageSize})
}

// AdminGetSubmission GET /admin/peer-review/submissions/:id —— 投稿 + 全部审稿报告 + 附件(完整数据)。
func (h *Handler) AdminGetSubmission(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		utils.BadRequest(c, "id 无效")
		return
	}
	d, err := h.svc.AdminSubmissionDetail(id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "投稿不存在")
			return
		}
		utils.InternalError(c, 500, "查询投稿详情失败", err)
		return
	}
	utils.Success(c, d)
}
