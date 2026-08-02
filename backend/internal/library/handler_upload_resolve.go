// ============================================================================
// Scholay 文献集 · 上传 PDF 智能识别 —— SSE 流式端点 + Confirm 端点
// ----------------------------------------------------------------------------
// 流程:
//
//   POST /user/library/papers/upload-and-resolve  (multipart, field=file)
//      → SSE 流回:
//          event: parsed   { title, abstract, sha256, has_text }
//          event: searched { papers: [...] }            // 标题非空才推
//          event: ready    { job_id }                   // 末尾
//          event: error    { message }                  // 任意阶段失败
//
//   POST /user/library/papers/confirm-upload-job  (json)
//      body: { job_id, decision: "link"|"free", link?: { ... } }
//      → 200 { paper: UserLibraryPaper, merged: bool }
//
// 文件先暂存到 MinIO `tmp/<job_id>.pdf`(对象 key 与 jobID 同步),
// job 上下文存 Redis(TTL 30 min)。
// confirm 阶段:把 tmp 对象移到正主 key,落库;失败回滚清 tmp 对象。
// ============================================================================

package library

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/pdfparse"
	"scholar-backend/internal/storage"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// JobTTL Redis 中 job 上下文的存活时间 —— 用户从看到结果到点确认通常 < 30s,
// 给 30 分钟兜底足够;超时未 confirm 的 tmp PDF 由 storage 的 tmp/ 24h lifecycle
// (Tier 2)自动回收,主区(papers/)另有 common/cleanup 的 orphan reaper 兜底。
const jobTTL = 30 * time.Minute

// JobState Redis 里存的 job 上下文 —— 用户 confirm 时拿这个落库
type JobState struct {
	UserID         uint64      `json:"user_id"`
	SHA256         string      `json:"sha256"`
	OriginalName   string      `json:"original_name"`
	Size           int64       `json:"size"`
	TmpObjectKey   string      `json:"tmp_object_key"`
	ParsedTitle    string      `json:"parsed_title"`
	ParsedAbstract string      `json:"parsed_abstract"`
	ParsedAuthors  []string    `json:"parsed_authors,omitempty"`
	ParsedYear     uint16      `json:"parsed_year,omitempty"`
	ParsedVenue    string      `json:"parsed_venue,omitempty"`
	ParsedDOI      string      `json:"parsed_doi,omitempty"`
	ParsedArXiv    string      `json:"parsed_arxiv,omitempty"`
	SearchResults  []SearchHit `json:"search_results,omitempty"`
}

// jobRedisKey 生成 Redis key —— 命名空间 `library:upload-job:<jobId>`
func jobRedisKey(jobID string) string {
	return "library:upload-job:" + jobID
}

func saveJob(ctx context.Context, jobID string, state *JobState) error {
	rdb := cache.GetRedis()
	b, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return rdb.Set(ctx, jobRedisKey(jobID), b, jobTTL).Err()
}

func loadJob(ctx context.Context, jobID string) (*JobState, error) {
	rdb := cache.GetRedis()
	s, err := rdb.Get(ctx, jobRedisKey(jobID)).Result()
	if err != nil {
		return nil, err
	}
	var st JobState
	if err := json.Unmarshal([]byte(s), &st); err != nil {
		return nil, err
	}
	return &st, nil
}

func deleteJob(ctx context.Context, jobID string) {
	rdb := cache.GetRedis()
	_ = rdb.Del(ctx, jobRedisKey(jobID)).Err()
}

// ============================================================================
// SSE: POST /user/library/papers/upload-and-resolve
// ============================================================================

// UploadAndResolve 一次性接收 multipart PDF,流式回阶段事件。
func (h *Handler) UploadAndResolve(c *gin.Context) {
	if !storage.IsEnabled() {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "对象存储未启用")
		return
	}
	if h.deps.Minicod == nil {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "搜索服务未启用")
		return
	}
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	// 读 file —— 受 Gin 全局 multipart memory 限制 + 这里再守 50MB
	if c.Request.ContentLength > maxPDFSize+1<<20 {
		utils.ErrorResponse(c, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("文件过大,上限 %d MiB", maxPDFSize/1024/1024))
		return
	}
	fileHeader, err := c.FormFile("file")
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "缺少 file 字段: "+err.Error())
		return
	}
	if fileHeader.Size > maxPDFSize {
		utils.ErrorResponse(c, http.StatusRequestEntityTooLarge, "文件过大")
		return
	}
	if !strings.HasSuffix(strings.ToLower(fileHeader.Filename), ".pdf") {
		utils.Error(c, http.StatusBadRequest, "只支持 .pdf 文件")
		return
	}
	src, err := fileHeader.Open()
	if err != nil {
		utils.InternalError(c, 500, "无法读取上传文件", err)
		return
	}
	defer src.Close()
	buf := make([]byte, fileHeader.Size)
	if _, err := io.ReadFull(src, buf); err != nil {
		slog.Warn("library: 读取上传内容失败", "err", err)
		utils.Error(c, http.StatusBadRequest, "读取上传内容失败,请重试")
		return
	}
	if len(buf) < len(pdfMagicPrefix) || string(buf[:len(pdfMagicPrefix)]) != pdfMagicPrefix {
		utils.Error(c, http.StatusBadRequest, "不是合法的 PDF 文件")
		return
	}

	// ---- 接下来开 SSE ----
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no") // nginx 不缓冲 SSE
	flusher, _ := c.Writer.(http.Flusher)
	writeEvent := func(event string, data any) bool {
		b, err := json.Marshal(data)
		if err != nil {
			return false
		}
		_, err = fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event, b)
		if err != nil {
			return false
		}
		if flusher != nil {
			flusher.Flush()
		}
		return true
	}
	emitError := func(msg string) {
		writeEvent("error", map[string]string{"message": msg})
	}

	jobID := uuid.NewString()
	ctx := c.Request.Context()

	// Step 1: 上传到 MinIO 临时区
	sum := sha256.Sum256(buf)
	shaHex := hex.EncodeToString(sum[:])
	bucket := storage.PaperPDFBucket()
	tmpKey := fmt.Sprintf("tmp/%d/%s.pdf", uid, jobID)
	putCtx, putCancel := context.WithTimeout(ctx, 30*time.Second)
	if _, err := storage.PutObject(putCtx, bucket, tmpKey, bytesReader(buf), int64(len(buf)),
		storage.PutOptions{
			ContentType: pdfContentType,
			UserMeta: map[string]string{
				"user-id": fmt.Sprintf("%d", uid),
				"job-id":  jobID,
			},
		}); err != nil {
		putCancel()
		// 不回显 err.Error()(会带出 MinIO endpoint/key 等内部细节),详情进日志
		slog.Error("library: 上传到对象存储失败", "err", err, "job_id", jobID)
		emitError("上传到对象存储失败,请稍后重试")
		return
	}
	putCancel()

	// Step 2: pdftotext + heuristic 切标题摘要
	parseCtx, parseCancel := context.WithTimeout(ctx, 60*time.Second)
	parsed, err := pdfparse.Parse(parseCtx, buf, pdfparse.Options{
		// 全文都要(extract.js 内部已限制前 25 页)
		Timeout: 50 * time.Second,
	})
	parseCancel()
	if err != nil {
		// 解析失败不算 fatal —— title 留空,自由保存路径仍可用
		slog.Warn("library: pdfparse failed", "err", err, "job_id", jobID)
		parsed = &pdfparse.Result{}
	}

	job := &JobState{
		UserID: uid,
		SHA256: shaHex,
		// 2026-07 审查:原始 multipart 文件名客户端可控且无长度限制,后面 4 处
		// confirm 路径都会写进 pdf_original_filename varchar(255) —— 在这里裁一次
		// 覆盖全部下游写入点(job 只在本函数构造)。
		OriginalName:   truncateRunes(fileHeader.Filename, origFilenameMaxRunes),
		Size:           fileHeader.Size,
		TmpObjectKey:   tmpKey,
		ParsedTitle:    parsed.Title,
		ParsedAbstract: parsed.Abstract,
		ParsedAuthors:  parsed.Authors,
		ParsedYear:     parsed.Year,
		ParsedVenue:    parsed.Venue,
		ParsedDOI:      parsed.DOI,
		ParsedArXiv:    parsed.ArXivID,
	}

	writeEvent("parsed", map[string]any{
		"title":         parsed.Title,
		"abstract":      parsed.Abstract,
		"sha256":        shaHex,
		"has_text":      parsed.FullText != "",
		"extracted_doi": parsed.DOI,
		"arxiv_id":      parsed.ArXivID,
		"authors":       parsed.Authors,
		"year":          parsed.Year,
		"venue":         parsed.Venue,
	})

	// Step 3: 在线查询候选(part 2)—— 分置信度:
	//   DOI 三源精确解析 → 标题 stc 精确匹配 → 模糊全文检索兜底;
	//   按匹配类型 + 标题相似度排序,已收藏只标注不重排(见 resolveUploadCandidates)。
	// DOI/标题/arXiv 全空时(纯扫描件无文本)跳过,confirmFree 仍能靠 pdfparse 落 og。
	if parsed.DOI != "" || parsed.ArXivID != "" || strings.TrimSpace(parsed.Title) != "" {
		searchCtx, searchCancel := context.WithTimeout(ctx, 45*time.Second)
		hits := h.resolveUploadCandidates(searchCtx, uid, parsed.DOI, parsed.ArXivID, parsed.Title)
		searchCancel()
		job.SearchResults = hits
		writeEvent("searched", map[string]any{"papers": hits})
	}

	// (AI 兜底识别已下线 —— 防止滥用大模型 token。三源搜索没命中时,confirmFree
	// 仍会用 pdftotext heuristic 抽到的 title/abstract 落到 og_* 字段,保证自由保存可用)

	// Step 4: 持久化 job state,推 ready 事件
	if err := saveJob(ctx, jobID, job); err != nil {
		// 不回显 err.Error()(Redis 内部错误),详情进日志
		slog.Error("library: 保存上传任务上下文失败", "err", err, "job_id", jobID)
		emitError("保存任务上下文失败,请稍后重试")
		// 回收 tmp 对象
		go cleanupTmpObject(bucket, tmpKey)
		return
	}
	writeEvent("ready", map[string]string{"job_id": jobID})
}

// cleanupTmpObject 清理临时对象 —— confirm 失败或 job 过期时使用
func cleanupTmpObject(bucket, key string) {
	ctx, cancel := ctxutil.With(ctxutil.QuickIO)
	defer cancel()
	if err := storage.DeleteObject(ctx, bucket, key); err != nil {
		slog.Warn("library: cleanup tmp pdf failed", "err", err, "key", key)
	}
}

// ============================================================================
// Confirm: POST /user/library/papers/confirm-upload-job
// ============================================================================

// LinkChoice 用户从 searched 列表里挑的那一条 —— 直接来自 SearchHit 的字段
type LinkChoice struct {
	Source        string          `json:"source"         binding:"required"`
	SourcePaperID string          `json:"source_paper_id" binding:"required"`
	Title         string          `json:"title"`
	Abstract      string          `json:"abstract"`
	Year          *uint16         `json:"year"`
	Venue         string          `json:"venue"`
	DOI           string          `json:"doi"`
	CitationCount uint32          `json:"citation_count"`
	PdfURL        string          `json:"pdf_url"`
	Authors       json.RawMessage `json:"authors,omitempty"`
	Raw           json.RawMessage `json:"raw,omitempty"`
}

type ConfirmUploadJobRequest struct {
	JobID    string      `json:"job_id" binding:"required"`
	Decision string      `json:"decision" binding:"required"` // link | free
	Link     *LinkChoice `json:"link,omitempty"`
	// FolderID 可选 —— 不传则后端 lazy 取/建默认文件夹(与 Add 接口一致)
	FolderID *uint64 `json:"folder_id,omitempty"`
}

type ConfirmUploadJobResponse struct {
	Paper  *UserLibraryPaper `json:"paper"`
	Merged bool              `json:"merged"`
}

// ConfirmUploadJob 用户在弹窗选好"关联到上游 / 作为自由文件"后调本端点。
func (h *Handler) ConfirmUploadJob(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	var req ConfirmUploadJobRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误: "+err.Error())
		return
	}
	if req.Decision != "link" && req.Decision != "free" {
		utils.Error(c, http.StatusBadRequest, "decision 必须是 link 或 free")
		return
	}
	if req.Decision == "link" && req.Link == nil {
		utils.Error(c, http.StatusBadRequest, "decision=link 时必须传 link 字段")
		return
	}

	ctx := c.Request.Context()
	job, err := loadJob(ctx, req.JobID)
	if err != nil {
		utils.Error(c, http.StatusNotFound, "job 不存在或已过期,请重新上传")
		return
	}
	if job.UserID != uid {
		utils.Error(c, http.StatusForbidden, "job 不属于当前用户")
		return
	}

	bucket := storage.PaperPDFBucket()
	db := database.GetDB()

	// 文件夹兜底
	folderID, err := h.resolveFolderID(db, uid, req.FolderID)
	if err != nil {
		utils.InternalError(c, 500, "文件夹初始化失败", err)
		return
	}

	now := time.Now()

	if req.Decision == "link" {
		// 关联到上游论文
		paper, merged, err := h.confirmLinked(ctx, db, uid, folderID, bucket, job, req.Link, &now)
		if err != nil {
			writeConfirmError(c, err)
			return
		}
		deleteJob(ctx, req.JobID)
		utils.Success(c, ConfirmUploadJobResponse{Paper: paper, Merged: merged})
		return
	}

	// decision == "free"
	paper, merged, err := h.confirmFree(ctx, db, uid, folderID, bucket, job, &now)
	if err != nil {
		writeConfirmError(c, err)
		return
	}
	deleteJob(ctx, req.JobID)
	utils.Success(c, ConfirmUploadJobResponse{Paper: paper, Merged: merged})
}

// writeConfirmError 把 confirmLinked / confirmFree 抛出的错误统一回前端:
//   - 撞文献集 1000 条上限 → 409 + 原文(让用户看到具体上限和操作指引)
//   - 其余 → 500 + 友好文案。**不回显 err.Error()** —— %w 链会带出 GORM/SQL/MinIO
//     原始错误(如并发双 confirm 撞唯一键的 Error 1062 全文),违反项目 friendly-error
//     铁律;详情走 utils.InternalError 进日志(带 RequestID 可定位)。
func writeConfirmError(c *gin.Context, err error) {
	msg := err.Error()
	if strings.Contains(msg, "文献集已达上限") {
		utils.ErrorResponse(c, http.StatusConflict, msg)
		return
	}
	utils.InternalError(c, http.StatusInternalServerError, "保存失败,请稍后重试", err)
}

// resolveFolderID —— 用户没传 folder_id 时,lazy 取默认文件夹(没有就建)
func (h *Handler) resolveFolderID(db *gorm.DB, uid uint64, given *uint64) (*uint64, error) {
	if given != nil {
		var f UserLibraryFolder
		if err := db.Where("id = ? AND user_id = ?", *given, uid).First(&f).Error; err == nil {
			return given, nil
		}
		// 给的不存在 —— 走默认
	}
	def, err := ensureDefaultFolder(db, uid)
	if err != nil {
		return nil, err
	}
	id := def.ID
	return &id, nil
}

// confirmLinked decision=link 路径 —— 把 PDF 从 tmp 挪到正主 key,落正常字段
// 若 (user_id, source, source_paper_id) 已存在 → 合并到既有行
func (h *Handler) confirmLinked(
	ctx context.Context, db *gorm.DB, uid uint64, folderID *uint64,
	bucket string, job *JobState, choice *LinkChoice, now *time.Time,
) (*UserLibraryPaper, bool, error) {
	if !IsValidUpstreamSource(choice.Source) {
		return nil, false, fmt.Errorf("source 取值非法")
	}
	// 2026-07 审查:choice 来自 confirm 请求体,字段无长度校验;逐列按列宽 rune 截断,
	// 防超长值撞 Error 1406(严格模式下是报错不是截断)让同一 job 反复 confirm 失败。
	// source_paper_id 在下面既参与唯一键查询又参与 INSERT,必须在查询**之前**先裁剪,
	// 保证两处口径一致。
	choice.SourcePaperID = truncateRunes(choice.SourcePaperID, sourcePaperIDMaxRunes)
	choice.Title = truncateRunes(choice.Title, titleMaxRunes)
	choice.Venue = truncateRunes(choice.Venue, venueMaxRunes)
	choice.DOI = truncateRunes(choice.DOI, doiMaxRunes)
	choice.PdfURL = truncateRunes(choice.PdfURL, pdfURLMaxRunes)
	// 2026-07 线上审计:该链路写入的是用户 PDF 抽取内容,GORM 默认 logger 出错时会把整条
	// INSERT(含全部绑定值)dump 进日志 → docker logs 长期留存用户内容。此处静音 SQL Trace;
	// 错误摘要仍经 writeConfirmError → utils.InternalError 带 RequestID 落日志,观测不丢。
	db = db.Session(&gorm.Session{Logger: gormlogger.Discard})

	// 查 (user_id, source, source_paper_id) 是否已存在
	var existing UserLibraryPaper
	q := db.Where("user_id = ? AND source = ? AND source_paper_id = ?",
		uid, choice.Source, choice.SourcePaperID).First(&existing)
	merging := q.Error == nil

	if !merging {
		// 新建一行:
		//   - metadata 列 ← 在线候选(choice):被引/OA直链/venue 等「在线增补」层
		//   - og_* ← pdfparse「识别」结果(见下 applyParsedToNewOG):文件自己的题录,
		//     pickField 优先展示。两层分开:在线匹配错/缺不影响已识别的题录。
		newPaper := &UserLibraryPaper{
			UserID:        uid,
			FolderID:      folderID,
			Source:        choice.Source,
			SourcePaperID: choice.SourcePaperID,
			Title:         choice.Title,
			AuthorsJSON:   choice.Authors,
			Year:          choice.Year,
			Venue:         choice.Venue,
			DOI:           choice.DOI,
			Abstract:      choice.Abstract,
			PdfURL:        choice.PdfURL,
			CitationCount: choice.CitationCount,
			RawJSON:       choice.Raw,
			LinkState:     LinkStateLinked,
			Origin:        OriginUpload, // 用户上传 PDF 关联到上游的行,后续展示走 upload 主操作
		}
		// 识别产物落 og_*(新行 og 本为空,直接填非空 parsed 值)
		applyParsedToNewOG(newPaper, job)
		// 风控 + 插入原子化:锁用户区间 → 计数 → 插入,撞 1000 上限直接退回
		if err := insertPaperAtomic(db, newPaper); err != nil {
			if errors.Is(err, errPaperLimit) {
				return nil, false, fmt.Errorf("文献集已达上限(%d 条),请删除一些不用的论文再试", MaxPapersPerUser)
			}
			return nil, false, fmt.Errorf("create paper row: %w", err)
		}
		newKey := fmt.Sprintf("papers/%d/%d/%s.pdf", uid, newPaper.ID, job.SHA256)
		if err := movePdfTmpToFinal(ctx, bucket, job.TmpObjectKey, newKey); err != nil {
			// 回滚:删除刚创建的行 + 显式清掉 tmp 对象。
			// 之前只删行,tmp 留下来要等 Tier 2 lifecycle 24h 才清,
			// 这里同步清掉避免短期孤儿。tmp 删失败只 warn(Tier 2 兜底)。
			db.Delete(&UserLibraryPaper{}, newPaper.ID)
			cleanupTmpObject(bucket, job.TmpObjectKey)
			return nil, false, fmt.Errorf("move pdf to final: %w", err)
		}
		// 更新 row 的 PDF 元数据
		if err := db.Model(&UserLibraryPaper{}).Where("id = ?", newPaper.ID).Updates(map[string]interface{}{
			"pdf_object_key":        newKey,
			"pdf_original_filename": job.OriginalName,
			"pdf_size":              job.Size,
			"pdf_sha256":            job.SHA256,
			"pdf_mime":              pdfContentType,
			"pdf_uploaded_at":       now,
		}).Error; err != nil {
			return nil, false, fmt.Errorf("update pdf meta: %w", err)
		}
		// 重新读一次行返回
		var refreshed UserLibraryPaper
		if err := db.First(&refreshed, newPaper.ID).Error; err != nil {
			return nil, false, fmt.Errorf("refresh: %w", err)
		}
		return &refreshed, false, nil
	}

	// 合并:把 tmp 移到既有行的 key,更新 PDF 元数据。
	// 识别产物 fill-empty 补进 og_*(只填该行仍为空的 og 字段,绝不覆盖用户已编辑的 og)——
	// 给这篇论文补传 PDF 时,把 PDF 里抽到的题录也补上,与既有在线 metadata 分开共存。
	newKey := fmt.Sprintf("papers/%d/%d/%s.pdf", uid, existing.ID, job.SHA256)
	if err := movePdfTmpToFinal(ctx, bucket, job.TmpObjectKey, newKey); err != nil {
		return nil, false, fmt.Errorf("move pdf to final: %w", err)
	}
	// 若旧 key 不同 → 异步删旧
	if existing.PdfObjectKey != "" && existing.PdfObjectKey != newKey {
		oldKey := existing.PdfObjectKey
		go cleanupTmpObject(bucket, oldKey)
	}
	updates := map[string]interface{}{
		"pdf_object_key":        newKey,
		"pdf_original_filename": job.OriginalName,
		"pdf_size":              job.Size,
		"pdf_sha256":            job.SHA256,
		"pdf_mime":              pdfContentType,
		"pdf_uploaded_at":       now,
		"link_state":            LinkStateLinked,
	}
	applyParsedFillEmptyOG(updates, &existing, job)
	if err := db.Model(&UserLibraryPaper{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
		return nil, false, fmt.Errorf("update existing: %w", err)
	}
	var refreshed UserLibraryPaper
	if err := db.First(&refreshed, existing.ID).Error; err != nil {
		return nil, false, fmt.Errorf("refresh: %w", err)
	}
	return &refreshed, true, nil
}

// confirmFree decision=free 路径 —— 落自由文件
// source='local', source_paper_id=sha256(PDF 内容)。
// 重复上传同 PDF → 唯一键冲突 → 合并到既有自由文件行(返回 merged=true)。
func (h *Handler) confirmFree(
	ctx context.Context, db *gorm.DB, uid uint64, folderID *uint64,
	bucket string, job *JobState, now *time.Time,
) (*UserLibraryPaper, bool, error) {
	// 2026-07 线上审计:同 confirmLinked —— 静音 GORM SQL Trace,防用户内容随错误日志泄漏。
	db = db.Session(&gorm.Session{Logger: gormlogger.Discard})
	// 查同 sha 是否已经收过为自由文件(秒传)
	var existing UserLibraryPaper
	q := db.Where("user_id = ? AND source = ? AND source_paper_id = ?",
		uid, SourceLocal, job.SHA256).First(&existing)
	merging := q.Error == nil

	if merging {
		// 同一 PDF 已经传过(秒传)—— 更新 PDF 元数据;og_* 只填空:
		// 既有 og 非空(可能是用户手动编辑)绝不覆盖,只把 parsed 值补进为空的 og 字段
		newKey := fmt.Sprintf("papers/%d/%d/%s.pdf", uid, existing.ID, job.SHA256)
		if err := movePdfTmpToFinal(ctx, bucket, job.TmpObjectKey, newKey); err != nil {
			return nil, false, fmt.Errorf("move pdf to final: %w", err)
		}
		// 若旧 key 不同 → 异步删旧(对齐 confirmLinked 合并分支),避免 MinIO 孤儿
		if existing.PdfObjectKey != "" && existing.PdfObjectKey != newKey {
			oldKey := existing.PdfObjectKey
			go cleanupTmpObject(bucket, oldKey)
		}
		updates := map[string]interface{}{
			"pdf_object_key":        newKey,
			"pdf_original_filename": job.OriginalName,
			"pdf_size":              job.Size,
			"pdf_sha256":            job.SHA256,
			"pdf_mime":              pdfContentType,
			"pdf_uploaded_at":       now,
		}
		applyParsedFillEmptyOG(updates, &existing, job)
		if err := db.Model(&UserLibraryPaper{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
			return nil, false, fmt.Errorf("update existing free: %w", err)
		}
		var refreshed UserLibraryPaper
		if err := db.First(&refreshed, existing.ID).Error; err != nil {
			return nil, false, fmt.Errorf("refresh: %w", err)
		}
		return &refreshed, true, nil
	}

	// 新建自由文件行 —— 正常字段(source/source_paper_id/title/...)按规则填:
	//   - source='local', source_paper_id=sha256
	//   - 正常 title/abstract 留空,内容只放 og_*(由前端 pickField 自动 fallback)
	newPaper := &UserLibraryPaper{
		UserID:        uid,
		FolderID:      folderID,
		Source:        SourceLocal,
		SourcePaperID: job.SHA256,
		// title 等正常字段留空字符串/默认值
		LinkState: LinkStateFree,
		Origin:    OriginUpload, // 自由文件一律是上传上来的
	}
	// 识别产物落 og_*(新行 og 本为空,直接填非空 parsed 值)——与 confirmLinked 同一助手。
	applyParsedToNewOG(newPaper, job)
	// 风控 + 插入原子化:锁用户区间 → 计数 → 插入,撞 1000 上限直接退回
	if err := insertPaperAtomic(db, newPaper); err != nil {
		if errors.Is(err, errPaperLimit) {
			return nil, false, fmt.Errorf("文献集已达上限(%d 条),请删除一些不用的论文再试", MaxPapersPerUser)
		}
		return nil, false, fmt.Errorf("create free paper row: %w", err)
	}
	newKey := fmt.Sprintf("papers/%d/%d/%s.pdf", uid, newPaper.ID, job.SHA256)
	if err := movePdfTmpToFinal(ctx, bucket, job.TmpObjectKey, newKey); err != nil {
		// 同 linked 路径:回滚 DB 行 + 同步清 tmp,避免短期孤儿。
		db.Delete(&UserLibraryPaper{}, newPaper.ID)
		cleanupTmpObject(bucket, job.TmpObjectKey)
		return nil, false, fmt.Errorf("move pdf to final: %w", err)
	}
	if err := db.Model(&UserLibraryPaper{}).Where("id = ?", newPaper.ID).Updates(map[string]interface{}{
		"pdf_object_key":        newKey,
		"pdf_original_filename": job.OriginalName,
		"pdf_size":              job.Size,
		"pdf_sha256":            job.SHA256,
		"pdf_mime":              pdfContentType,
		"pdf_uploaded_at":       now,
	}).Error; err != nil {
		return nil, false, fmt.Errorf("update pdf meta: %w", err)
	}
	var refreshed UserLibraryPaper
	if err := db.First(&refreshed, newPaper.ID).Error; err != nil {
		return nil, false, fmt.Errorf("refresh: %w", err)
	}
	return &refreshed, false, nil
}

// ============================================================================
// helpers
// ============================================================================

// authorNameStruct 与前端 PaperAuthor 同构: { name, authorId? }。
// og_authors_json 列的存储格式: 永远是 [{name, authorId?}, ...] (对象数组),
// 不存 string[] —— 与上游 authors 字段格式对齐, 前端 pickField 无需判 union 类型。
type authorNameStruct struct {
	Name     string `json:"name"`
	AuthorID string `json:"authorId,omitempty"`
}

// marshalAuthorNames 把 PDF heuristic 抽到的字符串作者列表包装成 [{name}, ...]
// 之后再 json.Marshal, 保持 og_authors 与 authors 同形。
func marshalAuthorNames(names []string) (json.RawMessage, bool) {
	if len(names) == 0 {
		return nil, false
	}
	out := make([]authorNameStruct, 0, len(names))
	for _, n := range names {
		n = strings.TrimSpace(n)
		if n == "" {
			continue
		}
		out = append(out, authorNameStruct{Name: n})
	}
	if len(out) == 0 {
		return nil, false
	}
	b, err := json.Marshal(out)
	if err != nil {
		return nil, false
	}
	return b, true
}

// jsonFieldEmpty 判断 JSON 列是否"语义为空" —— 未设置("")、null、空数组([])
// 都视为空。og_authors_json / authors_json 的填空判断共用。
func jsonFieldEmpty(raw json.RawMessage) bool {
	s := strings.TrimSpace(string(raw))
	return s == "" || s == "null" || s == "[]"
}

// user_library_papers 上「客户端可控」varchar 列的 rune 截断上限 —— 逐列对照
// model.go / 0001_baseline.sql 的列宽,刻意留余量。
// 2026-07 线上审计:pdfparse 偶发把整段摘要当标题抽出,超长直插 og_title 触发 Error 1406,
// 线上上传 confirm 131 次全灭。og_abstract / abstract 是 mediumtext,无需截断。
// 2026-07 审查:截断此前只覆盖 og_* 三列,同一条 INSERT 里同样客户端可控的
// title / venue / doi / pdf_url / source_paper_id(来自 confirm 请求体的 link 对象,
// 只有 binding:"required" 无长度校验)和 pdf_original_filename(原始 multipart 文件名)
// 仍会撞 1406 → 同一 job 每次 confirm 必失败。补齐到全部列。
const (
	ogTitleMaxRunes = 1000 // og_title    varchar(1024)
	ogVenueMaxRunes = 500  // og_venue    varchar(512)
	ogDOIMaxRunes   = 250  // og_doi      varchar(255)

	titleMaxRunes         = 1000 // title                 varchar(1024)
	venueMaxRunes         = 500  // venue                 varchar(512)
	doiMaxRunes           = 250  // doi                   varchar(255)
	pdfURLMaxRunes        = 1000 // pdf_url               varchar(1024)
	sourcePaperIDMaxRunes = 120  // source_paper_id       varchar(128)
	origFilenameMaxRunes  = 250  // pdf_original_filename varchar(255)
)

// truncateRunes 按 rune 安全截断(不劈开多字节字符;len(r)<=max 原样返回)。
func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}

// applyParsedToNewOG 把 pdfparse「识别」抽到的字段写进一个**新行**的 og_*(新行 og 本为空,
// 直接填非空值)。
//
// 架构约定:「识别」这一步的产物统一落 og_*(文件自己的题录),与「在线查询」落 metadata 列
// 分开——两条路互相独立。即使在线匹配错了 / 没匹配上,已识别出的题录也始终保留在 og_*,
// 且经 pickField(og 优先)默认展示,不被在线增补层污染。
func applyParsedToNewOG(paper *UserLibraryPaper, job *JobState) {
	// 2026-07 线上审计:入库前按列宽 rune 截断,防超长解析产物撞 Error 1406(见 truncateRunes)。
	paper.OGTitle = truncateRunes(job.ParsedTitle, ogTitleMaxRunes)
	paper.OGAbstract = job.ParsedAbstract
	paper.OGVenue = truncateRunes(job.ParsedVenue, ogVenueMaxRunes)
	paper.OGDOI = truncateRunes(job.ParsedDOI, ogDOIMaxRunes)
	if job.ParsedYear > 0 {
		y := job.ParsedYear
		paper.OGYear = &y
	}
	if b, ok := marshalAuthorNames(job.ParsedAuthors); ok {
		paper.OGAuthorsJSON = b
	}
}

// applyParsedFillEmptyOG 秒传(同 sha 重复上传)/ 合并到既有行路径把 heuristic 抽到的字段补进 og_*。
// **只填空**:og 是用户侧真值,自动化路径绝不覆盖非空 og —— 仅当既有行 og 字段为空
// 且本次 parsed 值非空时才写入。
func applyParsedFillEmptyOG(updates map[string]interface{}, existing *UserLibraryPaper, job *JobState) {
	// 2026-07 线上审计:与 applyParsedToNewOG 同款按列宽 rune 截断,防 Error 1406。
	if strings.TrimSpace(existing.OGTitle) == "" && job.ParsedTitle != "" {
		updates["og_title"] = truncateRunes(job.ParsedTitle, ogTitleMaxRunes)
	}
	if strings.TrimSpace(existing.OGAbstract) == "" && job.ParsedAbstract != "" {
		updates["og_abstract"] = job.ParsedAbstract
	}
	if strings.TrimSpace(existing.OGVenue) == "" && job.ParsedVenue != "" {
		updates["og_venue"] = truncateRunes(job.ParsedVenue, ogVenueMaxRunes)
	}
	if strings.TrimSpace(existing.OGDOI) == "" && job.ParsedDOI != "" {
		updates["og_doi"] = truncateRunes(job.ParsedDOI, ogDOIMaxRunes)
	}
	if existing.OGYear == nil && job.ParsedYear > 0 {
		updates["og_year"] = job.ParsedYear
	}
	if jsonFieldEmpty(existing.OGAuthorsJSON) {
		if b, ok := marshalAuthorNames(job.ParsedAuthors); ok {
			updates["og_authors_json"] = b
		}
	}
}

// movePdfTmpToFinal 把 tmp/<jobId>.pdf 移动到正式 key —— MinIO 没有原生 rename,
// 用 CopyObject + DeleteObject。简化:这里走 stream 拷贝(GetObject → PutObject)
// 适合小文件(50MB 内)。生产真要省内存可以用 minio.CopyObject。
func movePdfTmpToFinal(ctx context.Context, bucket, tmpKey, finalKey string) error {
	if tmpKey == finalKey {
		return nil
	}
	rd, info, err := storage.GetObject(ctx, bucket, tmpKey)
	if err != nil {
		return fmt.Errorf("get tmp: %w", err)
	}
	defer rd.Close()
	if _, err := storage.PutObject(ctx, bucket, finalKey, rd, info.Size, storage.PutOptions{
		ContentType: pdfContentType,
	}); err != nil {
		return fmt.Errorf("put final: %w", err)
	}
	// 删 tmp(失败只 log)
	if err := storage.DeleteObject(ctx, bucket, tmpKey); err != nil {
		slog.Warn("library: delete tmp pdf failed", "err", err, "key", tmpKey)
	}
	return nil
}
