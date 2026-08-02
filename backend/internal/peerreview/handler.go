// ============================================================================
// 智能审稿 v3 — HTTP handler (gin)
//
// 路由表 (见 routes.go):
//   GET    /peer-review/submissions
//   POST   /peer-review/submissions
//   GET    /peer-review/submissions/:id
//   PATCH  /peer-review/submissions/:id
//   POST   /peer-review/submissions/:id/submit
//
//   GET    /peer-review/submissions/:id/assets
//   POST   /peer-review/submissions/:id/assets        multipart: file, role, category
//   DELETE /peer-review/submissions/:id/assets/:aid
//
//   POST   /peer-review/submissions/:id/journal-recommend
//   POST   /peer-review/submissions/:id/letter-draft
//
//   GET    /peer-review/submissions/:id/reports
//   GET    /peer-review/submissions/:id/reports/:role
//
// 所有路由都挂在 UserAuthMiddleware 下, 从 ctx 取 user_id (uint), 转 uint64 用。
// ============================================================================

package peerreview

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/storage"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/vip"
)

type Handler struct {
	svc           *Service
	statRecorder usagestat.Recorder
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// SetUsageStatRecorder 注入使用统计录入器(审稿各步骤连贯统计, correlation_id=submission_id)
func (h *Handler) SetUsageStatRecorder(r usagestat.Recorder) {
	h.statRecorder = r
}

// recordPR 记一条审稿步骤事件, correlation_id=submission_id 把同一次审稿的各步骤串起来。
func (h *Handler) recordPR(c *gin.Context, action string, submissionID uint64, extra map[string]any) {
	if h.statRecorder == nil {
		return
	}
	e := usagestat.FromGin(c)
	e.Feature = usagestat.FeaturePeerReview
	e.Action = action
	e.CorrelationID = strconv.FormatUint(submissionID, 10)
	e.Extra = extra
	h.statRecorder.Record(e)
}

// ─── helpers ────────────────────────────────────────────────────────────

func uidOf(c *gin.Context) uint64 { return uint64(c.GetUint("user_id")) }

func parseUintParam(c *gin.Context, name string) (uint64, bool) {
	n, err := strconv.ParseUint(c.Param(name), 10, 64)
	if err != nil || n == 0 {
		utils.Error(c, http.StatusBadRequest, "invalid "+name)
		return 0, false
	}
	return n, true
}

// submissionDTO 是返回给前端的 Submission 形态;
// model 内部有大量 sql.NullX 字段, 这里 flatten 成普通 JSON 友好对象。
type submissionDTO struct {
	ID                uint64            `json:"id"`
	UserID            uint64            `json:"userId"`
	Mode              string            `json:"mode"`
	Status            string            `json:"status"`
	Step              uint8             `json:"step"`
	Title             string            `json:"title,omitempty"`
	Abstract          string            `json:"abstract,omitempty"`
	ExtraMeta         *ExtractedMeta    `json:"extraMeta,omitempty"`
	ManuscriptAssetID *uint64           `json:"manuscriptAssetId,omitempty"`
	JournalTarget     *journalTargetDTO `json:"journalTarget,omitempty"`
	SchoolTarget      *schoolTargetDTO  `json:"schoolTarget,omitempty"`
	LetterBody        string            `json:"letterBody,omitempty"`
	AgreedAt          string            `json:"agreedAt,omitempty"`
	AgentSessionID    string            `json:"agentSessionId,omitempty"`
	SubmittedAt       string            `json:"submittedAt,omitempty"`
	CompletedAt       string            `json:"completedAt,omitempty"`

	// 0058 新增: 异步 agent 状态 + revision counters (前端 polling 判断用)
	ComputeState   string `json:"computeState"`
	ComputeError   string `json:"computeError,omitempty"`
	AssetsRevision uint32 `json:"assetsRevision"`
	MetaRevision   uint32 `json:"metaRevision"`
	LetterRevision uint32 `json:"letterRevision"`

	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type journalTargetDTO struct {
	JournalID       int64    `json:"journalId"`
	CanonicalName   string   `json:"canonicalName"`
	ISSNs           []string `json:"issns,omitempty"`
	AIReason        string   `json:"aiReason,omitempty"`
	JCRImpactFactor float64  `json:"jcrImpactFactor,omitempty"`
	JCRQuartile     string   `json:"jcrQuartile,omitempty"`
	// 与前端 JournalTarget 完整对齐 —— 否则读回 (GET /submissions/:id) 会静默丢这 6 个字段。
	FqbQuartile     string   `json:"fqbQuartile,omitempty"`
	CCFRank         string   `json:"ccfRank,omitempty"`
	Publisher       string   `json:"publisher,omitempty"`
	Country         string   `json:"country,omitempty"`
	HIndex          int      `json:"hIndex,omitempty"`
	IsOA            bool     `json:"isOA,omitempty"`
}

type schoolTargetDTO struct {
	SchoolName      string `json:"schoolName"`
	DegreeType      string `json:"degreeType"`
	DisciplineField string `json:"disciplineField"`
	AdvisorName     string `json:"advisorName,omitempty"`
}

func toSubmissionDTO(s *Submission) submissionDTO {
	d := submissionDTO{
		ID:        s.ID,
		UserID:    s.UserID,
		Mode:      s.Mode,
		Status:    s.Status,
		Step:      s.Step,
		CreatedAt: s.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt: s.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if s.Title.Valid {
		d.Title = s.Title.String
	}
	if s.Abstract.Valid {
		d.Abstract = s.Abstract.String
	}
	if s.ManuscriptAssetID.Valid {
		v := uint64(s.ManuscriptAssetID.Int64)
		d.ManuscriptAssetID = &v
	}
	if s.LetterBody.Valid {
		d.LetterBody = s.LetterBody.String
	}
	if s.AgreedAt.Valid {
		d.AgreedAt = s.AgreedAt.Time.Format("2006-01-02T15:04:05Z07:00")
	}
	if s.AgentSessionID.Valid {
		d.AgentSessionID = s.AgentSessionID.String
	}
	if s.SubmittedAt.Valid {
		d.SubmittedAt = s.SubmittedAt.Time.Format("2006-01-02T15:04:05Z07:00")
	}
	if s.CompletedAt.Valid {
		d.CompletedAt = s.CompletedAt.Time.Format("2006-01-02T15:04:05Z07:00")
	}
	if s.Mode == "journal" && len(s.JournalMetaJSON) > 0 && string(s.JournalMetaJSON) != "null" {
		var jt journalTargetDTO
		if err := json.Unmarshal(s.JournalMetaJSON, &jt); err == nil {
			d.JournalTarget = &jt
		}
	}
	if s.Mode == "thesis" && s.SchoolName.Valid {
		d.SchoolTarget = &schoolTargetDTO{
			SchoolName:      s.SchoolName.String,
			DegreeType:      s.DegreeType.String,
			DisciplineField: s.DisciplineField.String,
			AdvisorName:     s.AdvisorName.String,
		}
	}
	if len(s.ExtraMetaJSON) > 0 && string(s.ExtraMetaJSON) != "null" {
		var em ExtractedMeta
		if err := json.Unmarshal(s.ExtraMetaJSON, &em); err == nil {
			d.ExtraMeta = &em
		}
	}
	d.ComputeState = s.ComputeState
	if s.ComputeError.Valid {
		d.ComputeError = s.ComputeError.String
	}
	d.AssetsRevision = s.AssetsRevision
	d.MetaRevision = s.MetaRevision
	d.LetterRevision = s.LetterRevision
	return d
}

type assetDTO struct {
	ID           uint64 `json:"id"`
	SubmissionID uint64 `json:"submissionId"`
	Role         string `json:"role"`
	Category     string `json:"category,omitempty"`
	Filename     string `json:"filename"`
	Size         uint64 `json:"size"`
	Mime         string `json:"mime"`
	SHA256       string `json:"sha256,omitempty"`
	TextChars    int32  `json:"textChars,omitempty"`
	CreatedAt    string `json:"createdAt"`
}

func toAssetDTO(a *Asset) assetDTO {
	d := assetDTO{
		ID:           a.ID,
		SubmissionID: a.SubmissionID,
		Role:         a.Role,
		Filename:     a.Filename,
		Size:         a.Size,
		Mime:         a.Mime,
		CreatedAt:    a.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if a.Category.Valid {
		d.Category = a.Category.String
	}
	if a.SHA256.Valid {
		d.SHA256 = a.SHA256.String
	}
	if a.TextChars.Valid {
		d.TextChars = a.TextChars.Int32
	}
	return d
}

// listItem 列表用,只暴露列表展示要的字段
type listItem struct {
	ID          uint64  `json:"id"`
	Mode        string  `json:"mode"`
	Title       string  `json:"title"`
	Status      string  `json:"status"`
	TargetLabel string  `json:"targetLabel,omitempty"`
	ScoreAvg    float64 `json:"scoreAvg,omitempty"`
	Decision    string  `json:"decision,omitempty"`
	SubmittedAt string  `json:"submittedAt,omitempty"`
	CompletedAt string  `json:"completedAt,omitempty"`
}

func toListItem(s *Submission) listItem {
	d := listItem{
		ID:     s.ID,
		Mode:   s.Mode,
		Status: s.Status,
	}
	if s.Title.Valid {
		d.Title = s.Title.String
	} else {
		d.Title = "(未命名稿件)"
	}
	if s.Mode == "journal" && s.JournalName.Valid {
		d.TargetLabel = s.JournalName.String
	} else if s.Mode == "thesis" && s.SchoolName.Valid {
		d.TargetLabel = s.SchoolName.String + " · " + degreeLabel(s.DegreeType.String)
	}
	if s.SubmittedAt.Valid {
		d.SubmittedAt = s.SubmittedAt.Time.Format("2006-01-02T15:04:05Z07:00")
	}
	if s.CompletedAt.Valid {
		d.CompletedAt = s.CompletedAt.Time.Format("2006-01-02T15:04:05Z07:00")
	}
	// 决议结果 (service.ListSubmissions 批量填充; 普通查询为空)。
	d.Decision = s.ChiefDecision
	return d
}

// ─── handlers ───────────────────────────────────────────────────────────

func (h *Handler) ListSubmissions(c *gin.Context) {
	uid := uidOf(c)
	mode := c.Query("mode")
	items, err := h.svc.ListSubmissions(uid, mode)
	if err != nil {
		slog.Error("peerreview list", "err", err)
		utils.ServerError(c, "查询失败")
		return
	}
	out := make([]listItem, len(items))
	for i := range items {
		out[i] = toListItem(&items[i])
	}
	utils.Success(c, gin.H{"items": out})
}

type createReq struct {
	Mode string `json:"mode"`
}

func (h *Handler) CreateSubmission(c *gin.Context) {
	uid := uidOf(c)
	var req createReq
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid body")
		return
	}
	s, err := h.svc.CreateDraft(c.Request.Context(), uid, req.Mode)
	if err != nil {
		if errors.Is(err, ErrInvalidMode) {
			utils.Error(c, http.StatusBadRequest, "invalid mode")
			return
		}
		utils.ServerError(c, "创建失败")
		return
	}
	h.recordPR(c, "create", s.ID, map[string]any{"mode": req.Mode})
	utils.Success(c, toSubmissionDTO(s))
}

// LatestDraft — wizard 入口用,GET /submissions/latest-draft?mode=X。
// 返回该用户该 mode 下"已上传过文件"的最近草稿;没有 → 404,前端走"空 UploadStep"。
// 不会创建,纯只读;创建草稿改成由前端"用户传第一个文件"时 lazy 触发 CreateDraft。
func (h *Handler) LatestDraft(c *gin.Context) {
	uid := uidOf(c)
	mode := c.Query("mode")
	if mode != "journal" && mode != "thesis" {
		utils.Error(c, http.StatusBadRequest, "invalid mode")
		return
	}
	sub, err := h.svc.LatestActiveDraft(uid, mode)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "no draft")
			return
		}
		utils.InternalError(c, 500, "操作失败,请稍后重试", err)
		return
	}
	utils.Success(c, toSubmissionDTO(sub))
}

// ResumeOrCreate 是 wizard 入口用的智能创建:
// 有未完成草稿就复用 (用户可继续填),没有才新建。
func (h *Handler) ResumeOrCreate(c *gin.Context) {
	uid := uidOf(c)
	var req createReq
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid body")
		return
	}
	s, err := h.svc.ResumeOrCreateDraft(c.Request.Context(), uid, req.Mode)
	if err != nil {
		if errors.Is(err, ErrInvalidMode) {
			utils.Error(c, http.StatusBadRequest, "invalid mode")
			return
		}
		utils.ServerError(c, "创建失败")
		return
	}
	// 复用既有草稿时, 同一 submission_id 会再记一条 create —— 漏斗用 COUNT(DISTINCT
	// correlation_id) 天然去重, 不会把 resume 当成新审稿重复计。
	h.recordPR(c, "create", s.ID, map[string]any{"mode": req.Mode})
	utils.Success(c, toSubmissionDTO(s))
}

func (h *Handler) GetSubmission(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	s, err := h.svc.GetSubmission(uidOf(c), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "submission not found")
			return
		}
		utils.InternalError(c, 500, "操作失败,请稍后重试", err)
		return
	}
	utils.Success(c, toSubmissionDTO(s))
}

func (h *Handler) PatchSubmission(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var p PatchPayload
	if err := c.ShouldBindJSON(&p); err != nil {
		utils.Error(c, http.StatusBadRequest, "invalid body")
		return
	}
	s, err := h.svc.PatchSubmission(uidOf(c), id, p)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "submission not found")
			return
		}
		utils.SafeError(c, http.StatusBadRequest, err)
		return
	}
	utils.Success(c, toSubmissionDTO(s))
}

func (h *Handler) Submit(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	// 会员额度在 service.Submit 内部、确认要真正跑一轮审稿时才扣(见 service);这里只把
	// vip.ErrQuotaExceeded 映射成 6010/429 + 友好文案。
	s, err := h.svc.Submit(c.Request.Context(), uidOf(c), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "submission not found")
			return
		}
		if errors.Is(err, vip.ErrQuotaExceeded) {
			vip.RespondQuotaExceeded(c, err) // 6010/429 + 结构化 quota 载荷(冻结契约)
			return
		}
		slog.Error("peerreview submit", "err", err, "submission_id", id)
		utils.SafeError(c, http.StatusBadRequest, err)
		return
	}

	// 使用统计: 提交审稿 = 一次审稿流程走到"已投递"(漏斗终点)。
	h.recordPR(c, "submit", id, nil)

	utils.Success(c, toSubmissionDTO(s))
}

// Retry 重试一份失败的审稿(评审 top#2)。复用已完成轮,只补跑失败部分;仍过每日额度闸。
func (h *Handler) Retry(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	s, err := h.svc.RetryReview(c.Request.Context(), uidOf(c), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "submission not found")
			return
		}
		if errors.Is(err, vip.ErrQuotaExceeded) {
			vip.RespondQuotaExceeded(c, err) // 6010/429 + 结构化 quota 载荷(冻结契约)
			return
		}
		slog.Error("peerreview retry", "err", err, "submission_id", id)
		utils.SafeError(c, http.StatusBadRequest, err)
		return
	}
	h.recordPR(c, "retry", id, nil)
	utils.Success(c, toSubmissionDTO(s))
}

// DeleteSubmission 整条删除 — 任务记录页 "删除" / wizard "取消草稿" 都走这里。
// 会顺带清掉 agent session + MinIO 对象;DB 行通过 FK CASCADE 触发 assets/reports/step_cache 的清理。
func (h *Handler) DeleteSubmission(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := h.svc.DeleteSubmission(c.Request.Context(), uidOf(c), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "submission not found")
			return
		}
		slog.Error("peerreview delete", "err", err, "submission_id", id)
		utils.ServerError(c, "删除失败,请稍后重试")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// ─── Assets ─────────────────────────────────────────────────────────────

func (h *Handler) ListAssets(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	items, err := h.svc.ListAssets(uidOf(c), id)
	if err != nil {
		// submission 不存在 / 不属于当前用户 → 404, 而不是 500(否则前端轮询 assets 时刷一片
		// 500 错误日志, 且 TanStack Query 拿 500 保留旧缓存 → 删文件后 UI 不更新)。
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "submission not found")
			return
		}
		utils.InternalError(c, 500, "操作失败,请稍后重试", err)
		return
	}
	out := make([]assetDTO, len(items))
	for i := range items {
		out[i] = toAssetDTO(&items[i])
	}
	utils.Success(c, gin.H{"items": out})
}

// DownloadAssets — GET /:id/download: 把该投稿上传的原始稿件 + 附件打包成 zip 流式下载。
// 稿件放 zip 根目录, 附件放 "附件/" 子目录; 同名自动加序号去重。
func (h *Handler) DownloadAssets(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	uid := uidOf(c)
	sub, err := h.svc.GetSubmission(uid, id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "submission not found")
		} else {
			utils.InternalError(c, 500, "操作失败,请稍后重试", err)
		}
		return
	}
	assets, err := h.svc.ListAssets(uid, id)
	if err != nil {
		utils.InternalError(c, 500, "操作失败,请稍后重试", err)
		return
	}
	if len(assets) == 0 {
		utils.Error(c, http.StatusBadRequest, "该投稿没有可下载的文件")
		return
	}

	zipName := buildZipName(sub, id)
	c.Header("Content-Type", "application/zip")
	// ASCII 回退名 + RFC5987 UTF-8 文件名 (支持中文标题)
	c.Header("Content-Disposition", fmt.Sprintf(
		`attachment; filename="submission-%d.zip"; filename*=UTF-8''%s`,
		id, url.PathEscape(zipName)))
	c.Header("Cache-Control", "no-store")
	c.Status(http.StatusOK)

	bucket := h.svc.BucketName()
	zw := zip.NewWriter(c.Writer)
	defer zw.Close()
	used := make(map[string]int)
	for i := range assets {
		a := &assets[i]
		rc, _, gerr := storage.GetObject(c.Request.Context(), bucket, a.ObjectKey)
		if gerr != nil {
			slog.Warn("peerreview download: get object failed, skipping",
				"submission_id", id, "asset_id", a.ID, "key", a.ObjectKey, "err", gerr)
			continue
		}
		name := zipEntryName(a, used)
		if fw, cerr := zw.Create(name); cerr == nil {
			_, _ = io.Copy(fw, rc)
		}
		_ = rc.Close()
	}
}

// buildZipName 用稿件标题(净化)或投稿号生成 zip 文件名。
func buildZipName(sub *Submission, id uint64) string {
	base := ""
	if sub.Title.Valid {
		base = strings.TrimSpace(sub.Title.String)
	}
	base = sanitizeForFilename(base)
	if base == "" {
		base = fmt.Sprintf("submission-%d", id)
	}
	if len([]rune(base)) > 40 {
		base = string([]rune(base)[:40])
	}
	return base + ".zip"
}

// zipEntryName 决定 asset 在 zip 内的路径: 附件进 "附件/" 子目录; 同名加 " (n)" 去重。
func zipEntryName(a *Asset, used map[string]int) string {
	name := sanitizeForFilename(a.Filename)
	if name == "" {
		name = fmt.Sprintf("file-%d", a.ID)
	}
	if a.Role == "attachment" {
		name = "附件/" + name
	}
	if n, seen := used[name]; seen {
		used[name] = n + 1
		dot := strings.LastIndex(name, ".")
		if dot > strings.LastIndex(name, "/") && dot >= 0 {
			name = fmt.Sprintf("%s (%d)%s", name[:dot], n+1, name[dot:])
		} else {
			name = fmt.Sprintf("%s (%d)", name, n+1)
		}
	} else {
		used[name] = 1
	}
	return name
}

// sanitizeForFilename 去掉路径分隔符与控制字符, 防 zip slip / 非法名。
func sanitizeForFilename(s string) string {
	s = strings.TrimSpace(s)
	repl := func(r rune) rune {
		switch r {
		case '/', '\\', ':', '*', '?', '"', '<', '>', '|', '\n', '\r', '\t':
			return '_'
		}
		if r < 0x20 {
			return '_'
		}
		return r
	}
	return strings.Map(repl, s)
}

func (h *Handler) UploadAsset(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	if err := c.Request.ParseMultipartForm(MaxManuscriptBytes); err != nil {
		utils.Error(c, http.StatusBadRequest, "文件过大或格式错误")
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "missing file")
		return
	}
	role := c.PostForm("role")
	category := c.PostForm("category")
	// 按 role 卡不同上限: 稿件 50MB / 附件 30MB (跟 service.go 常量 + 前端 UploadStep 一致)。
	sizeLimit := int64(MaxManuscriptBytes)
	if role == "attachment" {
		sizeLimit = MaxAttachmentBytes
	}
	if fh.Size > sizeLimit {
		utils.Error(c, http.StatusBadRequest, "single file exceeds limit")
		return
	}
	a, err := h.svc.UploadAsset(c.Request.Context(), uidOf(c), id, fh, role, category)
	if err != nil {
		if errors.Is(err, ErrAttachmentLimit) {
			utils.Error(c, http.StatusBadRequest, "附件已达上限 10 个")
			return
		}
		slog.Error("peerreview upload", "err", err, "submission_id", id)
		utils.SafeError(c, http.StatusBadRequest, err)
		return
	}
	utils.Success(c, toAssetDTO(a))
}

func (h *Handler) DeleteAsset(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	aid, ok := parseUintParam(c, "aid")
	if !ok {
		return
	}
	submissionDeleted, err := h.svc.DeleteAsset(c.Request.Context(), uidOf(c), id, aid)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "asset not found")
			return
		}
		if errors.Is(err, ErrNotDraft) {
			utils.SafeBadRequest(c, err)
			return
		}
		utils.InternalError(c, 500, "操作失败,请稍后重试", err)
		return
	}
	// submissionDeleted=true: 删的是草稿最后一个文件, 整条草稿已一并取消 —— 前端据此重置向导,
	// 不要再去拉这条已不存在的 submission。
	utils.Success(c, gin.H{"ok": true, "submissionDeleted": submissionDeleted})
}

// ─── 流式输出 (SSE) ─────────────────────────────────────────────────────
//
// streamSlotActive 判断该 slot 当前是否"正在/即将产出" —— 决定 SSE 用 SubscribePending(等起步)
// 还是 Subscribe(没流就立刻 done)。审稿 4 轮(reviewer:*)都在 compute_state=reviewing 期间串行起步。
func streamSlotActive(sub *Submission, slot string) bool {
	if sub == nil {
		return false
	}
	switch {
	case strings.HasPrefix(slot, "reviewer:"):
		return sub.ComputeState == StateReviewing
	case slot == SlotMeta:
		return sub.ComputeState == StateComputingMeta
	case slot == SlotLetter:
		return sub.ComputeState == StateComputingLetter
	case slot == SlotMethodology:
		return sub.ComputeState == StateComputingMethodology
	}
	return false
}

// GET /user/peer-review/submissions/:id/stream
//
// 走 SSE (Content-Type: text/event-stream)。配合前端 fetch + ReadableStream
// (而不是 EventSource —— 浏览器原生 EventSource 不支持 Authorization header,
// 用 fetch 才能复用 ws-auth-style Bearer token)。
//
// 协议事件:
//   event: snapshot   data: {"phase":"computing","text":"已累积的全部文本"}
//   event: delta      data: {"phase":"computing","text":"新增片段"}
//   event: done       data: {"phase":"done","text":"最终全文本"}
//   event: error      data: {"phase":"error","error":"..."}
//
// 没有正在跑的 stream → 直接 200 + 一个 done 事件 + close, 前端 fallback 到
// useSubmission 拿最终值。
func (h *Handler) StreamPartial(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	// 鉴权 + 防越权: 同步取一次 submission 校验 user_id (顺带拿 compute_state 决定要不要 wait-for-begin)
	sub, err := h.svc.GetSubmission(uidOf(c), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "submission not found")
			return
		}
		utils.InternalError(c, 500, "操作失败,请稍后重试", err)
		return
	}

	// SSE 响应头
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // 关 nginx 缓冲, 否则 SSE 帧攒一起才送
	c.Writer.WriteHeader(http.StatusOK)
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		return
	}

	// slot 必填 — 老的 wizard meta/letter SSE 也已经更新, 不再有"匿名 slot"。
	// 兼容历史调用: 没传 slot 时默认 meta (旧 frontend stream.ts 不传 slot)。
	slot := c.Query("slot")
	if slot == "" {
		slot = SlotMeta
	}
	// 计算/审稿进行中 → SubscribePending: slot 即便还没 Begin 也先挂住订阅, 等它起步从头收。
	// 否则前端订阅早了(尤其 4 轮串行审稿里靠后的 reviewer/chief)会立刻拿 done 而漏掉整段流 ——
	// 这正是详情页 reviewer/chief "一口气出" 的根因。
	var snap StreamEvent
	var ch <-chan StreamEvent
	var unsub func()
	if streamSlotActive(sub, slot) {
		snap, ch, unsub = h.svc.Broker().SubscribePending(id, slot, 64)
	} else {
		snap, ch, unsub = h.svc.Broker().Subscribe(id, slot, 64)
	}
	defer unsub()

	// 首帧: snapshot (无论是否有 stream 都发, 让前端立即知道当前状态)
	if err := writeSSE(c.Writer, "snapshot", snap); err != nil {
		return
	}
	flusher.Flush()
	// 没有 active stream (snapshot.phase=done 且无 channel) → 直接关 SSE
	if ch == nil {
		_ = writeSSE(c.Writer, "done", snap)
		flusher.Flush()
		return
	}
	// 已经 done (broker 还保留着) → 不订阅 channel, 也直接关
	if snap.Phase == StreamPhaseDone || snap.Phase == StreamPhaseError {
		evtName := "done"
		if snap.Phase == StreamPhaseError {
			evtName = "error"
		}
		_ = writeSSE(c.Writer, evtName, snap)
		flusher.Flush()
		return
	}

	// 流式循环
	// 30s 心跳: agent "思考 / 用工具" 的静默期可能 >60s 不产生 delta。不发心跳的话, 经过
	// nginx (默认 60s proxy_read_timeout) 会被当 idle 连接掐断 —— 生产实测 reviewer/chief
	// 流就报 "upstream timed out", 前端退化成"一口气出"。写 SSE comment frame ": ping"
	// (EventSource 静默忽略, 不污染业务数据) 保持连接活跃, 跟 sse.BeginStream 同款机制。
	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()
	clientGone := c.Request.Context().Done()
	for {
		select {
		case <-clientGone:
			return
		case <-heartbeat.C:
			if _, err := c.Writer.Write([]byte(": ping\n\n")); err != nil {
				return
			}
			flusher.Flush()
		case evt, alive := <-ch:
			if !alive {
				return
			}
			evtName := "delta"
			if evt.Phase == StreamPhaseDone {
				evtName = "done"
			} else if evt.Phase == StreamPhaseError {
				evtName = "error"
			} else if evt.Phase == StreamPhaseStatus {
				evtName = "status" // 瞬时进度提示 (note), 不进 text
			}
			if err := writeSSE(c.Writer, evtName, evt); err != nil {
				return
			}
			flusher.Flush()
			if evt.Phase == StreamPhaseDone || evt.Phase == StreamPhaseError {
				return
			}
		}
	}
}

func writeSSE(w http.ResponseWriter, evt string, payload StreamEvent) error {
	data, _ := json.Marshal(payload)
	_, err := w.Write([]byte("event: " + evt + "\ndata: "))
	if err != nil {
		return err
	}
	if _, err := w.Write(data); err != nil {
		return err
	}
	_, err = w.Write([]byte("\n\n"))
	return err
}

// ─── Wizard advance ────────────────────────────────────────────────────

type advanceReq struct {
	From int `json:"from"`
}

// Advance 是 wizard "下一步" 的统一入口 (替代独立 extract-meta / letter-draft / 直接 PATCH step)。
// 后端按 from 路由到 advanceTo2 / advanceTo3 / step4-no-op, 返回最新的 submission DTO,
// 前端根据 computeState 决定是 polling 还是直接渲染。
func (h *Handler) Advance(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req advanceReq
	if err := c.ShouldBindJSON(&req); err != nil || req.From == 0 {
		utils.Error(c, http.StatusBadRequest, "invalid from step")
		return
	}
	s, err := h.svc.AdvanceStep(c.Request.Context(), uidOf(c), id, req.From)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "submission not found")
			return
		}
		// 向导 step1→2 / step2→3 是真实 LLM 消耗,service 侧过 CheckDailyQuota;
		// 与 Submit 一致映射成 6010/429 + 友好文案,触发前端「额度用尽」弹窗。
		if errors.Is(err, vip.ErrQuotaExceeded) {
			vip.RespondQuotaExceeded(c, err) // 6010/429 + 结构化 quota 载荷(冻结契约)
			return
		}
		// advance 失败基本是业务校验(文件已变更 / 未生成稿件信息 / 缺院校等),作为 400 回给用户。
		// 这类是用户侧 4xx 而非系统故障,记 Warn 不记 Error,避免污染 ERROR 日志。
		slog.Warn("peerreview advance rejected", "err", err, "submission_id", id, "from", req.From)
		utils.SafeError(c, http.StatusBadRequest, err)
		return
	}
	h.recordPR(c, fmt.Sprintf("step_%d", req.From+1), id,
		map[string]any{"from": req.From, "to": req.From + 1})
	utils.Success(c, toSubmissionDTO(s))
}

// ─── Reports ────────────────────────────────────────────────────────────

// reportDTO 是返给前端的扁平报告对象。alpha/beta/gamma 用 reviewer 字段族,
// chief 用 chief 字段族, 共用 score/recommendation 顶层。
//
// 老数据 (0062 之前的 report) 字段全空, 前端拿到 contentMd 后会回退到 markdown 渲染。
type reportDTO struct {
	ID               uint64             `json:"id"`
	SubmissionID     uint64             `json:"submissionId"`
	Role             string             `json:"role"`
	Decision         string             `json:"decision,omitempty"`
	Scores           map[string]float64 `json:"scores,omitempty"`
	ContentMd        string             `json:"contentMd"`
	AgentDurationSec int32              `json:"agentDurationSec,omitempty"`
	AgentTokensIn    int32              `json:"agentTokensIn,omitempty"`
	AgentTokensOut   int32              `json:"agentTokensOut,omitempty"`
	CreatedAt        string             `json:"createdAt"`

	// 0062 结构化字段 — 前端按设计稿渲染时用, NULL 时省略
	ReviewerSkillID  uint64             `json:"reviewerSkillId,omitempty"`
	SkillSlug        string             `json:"skillSlug,omitempty"`
	SkillName        string             `json:"skillName,omitempty"`
	Score            int32              `json:"score,omitempty"`
	Recommendation   string             `json:"recommendation,omitempty"`
	Expertise        string             `json:"expertise,omitempty"`
	Dimensions       []DimensionScore   `json:"dimensions,omitempty"`
	LineComments     []LineComment      `json:"lineComments,omitempty"`
	MacroComments    []MacroComment     `json:"macroComments,omitempty"`
	FinalSummaryMd   string             `json:"finalSummaryMd,omitempty"`

	// chief 专有
	RulingSummaryMd    string             `json:"rulingSummaryMd,omitempty"`
	RulingParagraphMd  string             `json:"rulingParagraphMd,omitempty"`
	ReviewerResponses  []ReviewerResponse `json:"reviewerResponses,omitempty"`
	MustFix            []string           `json:"mustFix,omitempty"`
	Suggestions        []string           `json:"suggestions,omitempty"`
	DeadlineDays       int32              `json:"deadlineDays,omitempty"`
	SummaryForAuthor   string             `json:"summaryForAuthor,omitempty"`
}

func (h *Handler) toReportDTO(r *Report) reportDTO {
	d := reportDTO{
		ID:           r.ID,
		SubmissionID: r.SubmissionID,
		Role:         r.Role,
		ContentMd:    r.ContentMd,
		CreatedAt:    r.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if r.Decision.Valid {
		d.Decision = r.Decision.String
	}
	if len(r.ScoresJSON) > 0 && string(r.ScoresJSON) != "null" {
		_ = json.Unmarshal(r.ScoresJSON, &d.Scores)
	}
	if r.AgentDurationSec.Valid {
		d.AgentDurationSec = r.AgentDurationSec.Int32
	}
	if r.AgentTokensIn.Valid {
		d.AgentTokensIn = r.AgentTokensIn.Int32
	}
	if r.AgentTokensOut.Valid {
		d.AgentTokensOut = r.AgentTokensOut.Int32
	}

	// 0062 结构化字段。
	// v3 后 reviewer_skill_id 列语义改指 feature_prompts.id (旧 peer_review_skills 表
	// 已 DEPRECATED, 数据迁移时 ID 区间对齐, 历史报告 ID 仍能命中)。
	// DTO 字段名保持 ReviewerSkillID/SkillSlug/SkillName 不动, 避免前端改契约。
	if r.ReviewerSkillID.Valid {
		d.ReviewerSkillID = uint64(r.ReviewerSkillID.Int64)
		// 顺手查 prompt slug/name 给前端展示。失败不致命。
		if prompt, err := h.svc.GetPromptByID(d.ReviewerSkillID); err == nil && prompt != nil {
			d.SkillSlug = prompt.Slug
			d.SkillName = prompt.Name
		}
	}
	if r.Score.Valid {
		d.Score = r.Score.Int32
	}
	if r.Recommendation.Valid {
		d.Recommendation = r.Recommendation.String
	}
	if r.Expertise.Valid {
		d.Expertise = r.Expertise.String
	}
	if len(r.DimensionsJSON) > 0 && string(r.DimensionsJSON) != "null" {
		_ = json.Unmarshal(r.DimensionsJSON, &d.Dimensions)
	}
	if len(r.LineCommentsJSON) > 0 && string(r.LineCommentsJSON) != "null" {
		_ = json.Unmarshal(r.LineCommentsJSON, &d.LineComments)
	}
	if len(r.MacroCommentsJSON) > 0 && string(r.MacroCommentsJSON) != "null" {
		_ = json.Unmarshal(r.MacroCommentsJSON, &d.MacroComments)
	}
	if r.FinalSummaryMd.Valid {
		d.FinalSummaryMd = r.FinalSummaryMd.String
	}
	if r.RulingSummaryMd.Valid {
		d.RulingSummaryMd = r.RulingSummaryMd.String
	}
	if r.RulingParagraphMd.Valid {
		d.RulingParagraphMd = r.RulingParagraphMd.String
	}
	if len(r.ReviewerResponsesJSON) > 0 && string(r.ReviewerResponsesJSON) != "null" {
		_ = json.Unmarshal(r.ReviewerResponsesJSON, &d.ReviewerResponses)
	}
	if len(r.MustFixJSON) > 0 && string(r.MustFixJSON) != "null" {
		_ = json.Unmarshal(r.MustFixJSON, &d.MustFix)
	}
	if len(r.SuggestionsJSON) > 0 && string(r.SuggestionsJSON) != "null" {
		_ = json.Unmarshal(r.SuggestionsJSON, &d.Suggestions)
	}
	if r.DeadlineDays.Valid {
		d.DeadlineDays = r.DeadlineDays.Int32
	}
	if r.SummaryForAuthor.Valid {
		d.SummaryForAuthor = r.SummaryForAuthor.String
	}
	return d
}

func (h *Handler) ListReports(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	items, err := h.svc.ListReports(uidOf(c), id)
	if err != nil {
		utils.InternalError(c, 500, "操作失败,请稍后重试", err)
		return
	}
	out := make([]reportDTO, len(items))
	for i := range items {
		out[i] = h.toReportDTO(&items[i])
	}
	utils.Success(c, gin.H{"items": out})
}

func (h *Handler) GetReport(c *gin.Context) {
	id, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	role := c.Param("role")
	r, err := h.svc.GetReportByRole(uidOf(c), id, role)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.NotFound(c, "report not found")
			return
		}
		utils.InternalError(c, 500, "操作失败,请稍后重试", err)
		return
	}
	utils.Success(c, h.toReportDTO(r))
}
