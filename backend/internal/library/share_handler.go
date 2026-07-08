// ============================================================================
// Scholay 文献集分享 —— HTTP handlers(创建 / 列表 / 撤销 / 访问记录 / 转存 / 公开获取)
// ----------------------------------------------------------------------------
// owner 端点挂在 /api/v1/user/library/shares(登录);公开获取挂在
// /api/v1/public/share/:token(OptionalUserAuth);转存挂在 .../shares/:token/save(登录)。
// 沿用本模块「model/repo/service 合并进 handler」的风格。
// ============================================================================

package library

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/minicod"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ---- 请求/响应 DTO ----

type sharePaperInput struct {
	Source        string          `json:"source"`
	SourcePaperID string          `json:"source_paper_id"`
	Title         string          `json:"title"`
	Authors       json.RawMessage `json:"authors"`
	Year          *uint16         `json:"year"`
	Venue         string          `json:"venue"`
	DOI           string          `json:"doi"`
	Abstract      string          `json:"abstract"`
	PdfURL        string          `json:"pdf_url"`
	CitationCount uint32          `json:"citation_count"`
}

type createShareReq struct {
	Kind          string           `json:"kind"`            // single | collection | journal
	Paper         *sharePaperInput `json:"paper"`           // single 必填:前端传 Paper 对象
	FolderID      *uint64          `json:"folder_id"`       // collection 必填
	JournalID     *uint64          `json:"journal_id"`      // journal 必填:被分享期刊 id
	Subtitle      string           `json:"subtitle"`        // 可选(期刊:出版社·类型·国家)
	Title         string           `json:"title"`           // 可选:覆盖标题
	WithCode      bool             `json:"with_code"`       // 生成提取码
	ExpiresInDays *int             `json:"expires_in_days"` // nil/<=0 = 永久
	AllowSave     *bool            `json:"allow_save"`      // 默认 true
}

// ---- owner: 创建分享 ----

// CreateShare POST /api/v1/user/library/shares
func (h *Handler) CreateShare(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	var req createShareReq
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误")
		return
	}

	db := database.GetDB()

	// 活跃分享数量护栏
	var activeCount int64
	if err := db.Model(&LibraryShare{}).
		Where("user_id = ? AND status = ?", uid, ShareStatusActive).
		Count(&activeCount).Error; err != nil {
		utils.InternalError(c, http.StatusInternalServerError, "创建分享失败", err)
		return
	}
	if activeCount >= maxSharesPerUser {
		utils.Error(c, http.StatusConflict, "活跃分享数量已达上限,请先清理后再试")
		return
	}

	share := LibraryShare{
		UserID:    uid,
		Status:    ShareStatusActive,
		AllowSave: true,
	}
	if req.AllowSave != nil {
		share.AllowSave = *req.AllowSave
	}
	if req.ExpiresInDays != nil && *req.ExpiresInDays > 0 {
		exp := time.Now().Add(time.Duration(*req.ExpiresInDays) * 24 * time.Hour)
		share.ExpiresAt = &exp
	}

	var snapshot []LibrarySharePaper
	truncated := false

	switch req.Kind {
	case ShareKindSingle:
		if req.Paper == nil || strings.TrimSpace(req.Paper.Source) == "" || strings.TrimSpace(req.Paper.SourcePaperID) == "" {
			utils.Error(c, http.StatusBadRequest, "单篇分享缺少论文信息")
			return
		}
		// 服务端锚定:快照绝不直接采信客户端提交的 title/abstract/pdf_url 等展示字段
		// (落地页免登录公开,原实现可被任意登录用户用来生成伪造论文的钓鱼页,
		// 且经转存以「上游快照」身份污染他人文献集)。锚定顺序:
		//   1) 论文在分享者自己文献集中 → 用库行(og 优先)做快照(覆盖 local 自由文件);
		//   2) 否则 → 必须是合法上游源,经 minicod 实查存在性并用上游权威元数据做快照。
		sp, ok := h.anchorSingleSharePaper(c, uid, req.Paper)
		if !ok {
			return
		}
		share.Kind = ShareKindSingle
		share.EntityType = ShareEntityPaper
		share.Title = firstNonEmpty(sp.Title, "未命名论文")
		share.Subtitle = sp.Venue
		share.PaperCount = 1
		snapshot = []LibrarySharePaper{*sp}

	case ShareKindCollection:
		if req.FolderID == nil || *req.FolderID == 0 {
			utils.Error(c, http.StatusBadRequest, "集合分享缺少文件夹")
			return
		}
		var folder UserLibraryFolder
		if err := db.Where("id = ? AND user_id = ?", *req.FolderID, uid).First(&folder).Error; err != nil {
			utils.Error(c, http.StatusNotFound, "文件夹不存在")
			return
		}
		// 先取文件夹总数:超过快照上限时要向创建者明示"仅包含最新 N 篇",不能静默截断
		var folderTotal int64
		if err := db.Model(&UserLibraryPaper{}).
			Where("user_id = ? AND folder_id = ?", uid, folder.ID).
			Count(&folderTotal).Error; err != nil {
			utils.InternalError(c, http.StatusInternalServerError, "创建分享失败", err)
			return
		}
		var rows []UserLibraryPaper
		if err := db.Where("user_id = ? AND folder_id = ?", uid, folder.ID).
			Order("created_at DESC").Limit(maxSharePapersSnapshot).Find(&rows).Error; err != nil {
			utils.InternalError(c, http.StatusInternalServerError, "创建分享失败", err)
			return
		}
		if len(rows) == 0 {
			utils.Error(c, http.StatusBadRequest, "空文件夹不能分享")
			return
		}
		truncated = folderTotal > int64(len(rows))
		share.Kind = ShareKindCollection
		share.EntityType = ShareEntityFolder
		share.FolderID = &folder.ID
		share.Title = firstNonEmpty(req.Title, folder.Name, "未命名文献集")
		share.PaperCount = len(rows)
		share.Subtitle = strconv.Itoa(len(rows)) + " 篇文献"
		snapshot = make([]LibrarySharePaper, len(rows))
		for i := range rows {
			snapshot[i] = snapshotFromLibraryRow(&rows[i], i)
		}

	case ShareKindJournal:
		// 期刊是公开规范实体:token 只记 journal_id,落地页按 id 实时取详情;无篇目快照、不支持转存。
		if req.JournalID == nil || *req.JournalID == 0 {
			utils.Error(c, http.StatusBadRequest, "期刊分享缺少期刊 id")
			return
		}
		jid := *req.JournalID
		share.Kind = ShareKindJournal
		share.EntityType = ShareEntityJournal
		share.JournalID = &jid
		share.Title = firstNonEmpty(req.Title, "期刊")
		share.Subtitle = req.Subtitle
		share.PaperCount = 0
		share.AllowSave = false // 期刊关注收藏后端未上线,落地页只「在 Scholay 打开」

	default:
		utils.Error(c, http.StatusBadRequest, "kind 取值非法")
		return
	}

	if req.WithCode {
		code, err := genExtractCode()
		if err != nil {
			utils.InternalError(c, http.StatusInternalServerError, "创建分享失败", err)
			return
		}
		share.ExtractCode = code
	}

	// token + 落库(token 唯一,撞了重试几次)
	if err := db.Transaction(func(tx *gorm.DB) error {
		var lastErr error
		for attempt := 0; attempt < 5; attempt++ {
			token, err := genShareToken()
			if err != nil {
				return err
			}
			share.Token = token
			share.ID = 0
			if err := tx.Create(&share).Error; err != nil {
				lastErr = err
				continue // 多半是 token 唯一键冲突,重试
			}
			lastErr = nil
			break
		}
		if lastErr != nil {
			return lastErr
		}
		for i := range snapshot {
			snapshot[i].ShareID = share.ID
		}
		if len(snapshot) > 0 {
			if err := tx.Create(&snapshot).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		utils.InternalError(c, http.StatusInternalServerError, "创建分享失败", err)
		return
	}

	utils.Success(c, gin.H{
		"id":           share.ID,
		"token":        share.Token,
		"path":         "/s/" + share.Token,
		"kind":         share.Kind,
		"title":        share.Title,
		"paper_count":  share.PaperCount,
		"extract_code": share.ExtractCode,
		"expires_at":   share.ExpiresAt,
		"allow_save":   share.AllowSave,
		// 文件夹超过快照上限时明示截断(快照只含最新 maxSharePapersSnapshot 篇)
		"truncated": truncated,
		// 海报/预览用的篇目样本(前 N 篇,不含 abstract 以保持响应精简)。
		// 让分享图无论从哪个入口(文献集列表 / 集内 / PC)创建,都能稳定渲染前几篇。
		"papers": sharePaperSample(snapshot),
	})
}

// anchorSingleSharePaper 单篇分享的服务端锚定:返回可信快照。
//
//  1. 论文已在分享者文献集 → snapshotFromLibraryRow(og 真值优先),local 自由文件也走这里;
//  2. 不在库中(分享任意搜索结果的场景)→ 只接受上游三源,校验 source 与 id 前缀一致后
//     经 minicod 实查;查得到才用**上游返回的权威元数据**构造快照,客户端提交的
//     title/abstract/pdf_url 等全部丢弃。
//
// 失败时已写好响应,返回 (nil, false)。
func (h *Handler) anchorSingleSharePaper(c *gin.Context, uid uint64, p *sharePaperInput) (*LibrarySharePaper, bool) {
	source := strings.TrimSpace(p.Source)
	paperID := strings.TrimSpace(p.SourcePaperID)

	// 1) 库内行优先(涵盖 local 自由文件与用户编辑过的 og 真值)
	var row UserLibraryPaper
	err := database.GetDB().
		Where("user_id = ? AND source = ? AND source_paper_id = ?", uid, source, paperID).
		First(&row).Error
	if err == nil {
		sp := snapshotFromLibraryRow(&row, 0)
		return &sp, true
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		utils.InternalError(c, http.StatusInternalServerError, "创建分享失败", err)
		return nil, false
	}

	// 2) 上游锚定:source 白名单 + id 前缀一致性 + 存在性实查
	if !IsValidUpstreamSource(source) {
		utils.Error(c, http.StatusBadRequest, "该论文不在你的文献集中,无法分享")
		return nil, false
	}
	if !sourceIDPrefixConsistent(source, paperID) {
		utils.Error(c, http.StatusBadRequest, "论文来源与编号不匹配")
		return nil, false
	}
	if h.deps.Minicod == nil {
		utils.Error(c, http.StatusServiceUnavailable, "暂时无法验证论文信息,请稍后再试")
		return nil, false
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	papers, err := h.deps.Minicod.GetPaperBatch(ctx, []string{paperID}, nil)
	if err != nil || len(papers) == 0 || strings.TrimSpace(papers[0].Title) == "" {
		if err != nil {
			slog.Warn("library: 单篇分享上游校验失败", "source", source, "paper_id", paperID, "err", err)
		}
		utils.Error(c, http.StatusBadRequest, "未能验证该论文,暂不能分享")
		return nil, false
	}
	sp := snapshotFromUpstreamPaper(&papers[0], source, paperID)
	return &sp, true
}

// sourceIDPrefixConsistent 校验 source 声明与 minicod id 前缀路由的一致性
// (olx/pmd 的 source_paper_id 携带 "olx:"/"pmd:" 前缀;stc 无前缀)。
func sourceIDPrefixConsistent(source, paperID string) bool {
	switch source {
	case SourceOLX:
		return strings.HasPrefix(paperID, "olx:")
	case SourcePMD:
		return strings.HasPrefix(paperID, "pmd:")
	case SourceSTC:
		return !strings.HasPrefix(paperID, "olx:") && !strings.HasPrefix(paperID, "pmd:")
	}
	return false
}

// snapshotFromUpstreamPaper 用 minicod 上游返回的权威元数据构造分享快照。
func snapshotFromUpstreamPaper(p *minicod.Paper, source, paperID string) LibrarySharePaper {
	sp := LibrarySharePaper{
		Source:        source,
		SourcePaperID: paperID,
		Title:         p.Title,
		Abstract:      p.Abstract,
		Venue:         p.Venue,
		CitationCount: uint32(max(p.CitationCount, 0)),
		Position:      0,
	}
	if p.Year > 0 {
		y := uint16(p.Year)
		sp.Year = &y
	}
	if doi := extractDOIFromExternal(p.ExternalIDs); doi != "" {
		sp.DOI = doi
	}
	if p.OpenAccessPDF != nil && p.OpenAccessPDF.URL != "" {
		sp.PdfURL = p.OpenAccessPDF.URL
	} else if p.IsOpenAccess && p.URL != "" {
		sp.PdfURL = p.URL
	}
	if len(p.Authors) > 0 {
		if b, err := json.Marshal(p.Authors); err == nil {
			sp.AuthorsJSON = b
		}
	}
	return sp
}

// sharePaperSample 取快照前 N 篇的精简视图(title/venue/year/authors 等),供创建后的分享海报/预览使用。
func sharePaperSample(snapshot []LibrarySharePaper) []gin.H {
	const n = 8
	count := len(snapshot)
	if count > n {
		count = n
	}
	out := make([]gin.H, 0, count)
	for i := 0; i < count; i++ {
		sp := &snapshot[i]
		out = append(out, gin.H{
			"source":          sp.Source,
			"source_paper_id": sp.SourcePaperID,
			"title":           sp.Title,
			"authors":         sp.AuthorsJSON,
			"year":            sp.Year,
			"venue":           sp.Venue,
			"citation_count":  sp.CitationCount,
		})
	}
	return out
}

// ---- owner: 列表 / 撤销 / 访问记录 ----

// ListShares GET /api/v1/user/library/shares
func (h *Handler) ListShares(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	var shares []LibraryShare
	if err := database.GetDB().Where("user_id = ?", uid).
		Order("created_at DESC").Limit(200).Find(&shares).Error; err != nil {
		utils.InternalError(c, http.StatusInternalServerError, "查询失败", err)
		return
	}
	utils.Success(c, gin.H{"shares": shares})
}

// RevokeShare DELETE /api/v1/user/library/shares/:id
func (h *Handler) RevokeShare(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		utils.Error(c, http.StatusBadRequest, "id 非法")
		return
	}
	res := database.GetDB().Model(&LibraryShare{}).
		Where("id = ? AND user_id = ?", id, uid).
		Update("status", ShareStatusRevoked)
	if res.Error != nil {
		utils.InternalError(c, http.StatusInternalServerError, "撤销失败", res.Error)
		return
	}
	if res.RowsAffected == 0 {
		utils.Error(c, http.StatusNotFound, "分享不存在")
		return
	}
	utils.Success(c, gin.H{"revoked": true})
}

// ShareAccess GET /api/v1/user/library/shares/:id/access —— 谁查看/转存过
func (h *Handler) ShareAccess(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		utils.Error(c, http.StatusBadRequest, "id 非法")
		return
	}
	var share LibraryShare
	if err := database.GetDB().Where("id = ? AND user_id = ?", id, uid).First(&share).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "分享不存在")
		return
	}
	var rows []LibraryShareAccess
	if err := database.GetDB().Where("share_id = ?", id).
		Order("created_at DESC").Limit(200).Find(&rows).Error; err != nil {
		utils.InternalError(c, http.StatusInternalServerError, "查询失败", err)
		return
	}
	utils.Success(c, gin.H{
		"view_count": share.ViewCount,
		"save_count": share.SaveCount,
		"records":    rows,
	})
}

// ---- 公开:获取分享(免登录) ----

// ---- 提取码防爆破:同一 (token, IP) 连错 N 次锁定一段时间(Redis 计数) ----

const shareCodeFailWindow = 10 * time.Minute

func shareCodeFailKey(token, ip string) string {
	return "library:share-code-fail:" + token + ":" + ip
}

// shareCodeLocked 该 (token, IP) 是否已因连错提取码被锁定。Redis 不可用时放行(可用性优先)。
func shareCodeLocked(ctx context.Context, token, ip string) bool {
	s, err := cache.GetString(ctx, shareCodeFailKey(token, ip))
	if err != nil || s == "" {
		return false
	}
	n, _ := strconv.Atoi(s)
	return n >= shareCodeFailLimit
}

// recordShareCodeFail 记一次提取码错误(首错时设置过期窗口)。
func recordShareCodeFail(ctx context.Context, token, ip string) {
	key := shareCodeFailKey(token, ip)
	n, err := cache.Incr(ctx, key)
	if err != nil {
		return
	}
	if n == 1 {
		_ = cache.Expire(ctx, key, shareCodeFailWindow)
	}
}

// clearShareCodeFails 验码成功后清除失败计数。
func clearShareCodeFails(ctx context.Context, token, ip string) {
	_ = cache.Delete(ctx, shareCodeFailKey(token, ip))
}

// verifyShareCode 校验提取码(带防爆破熔断)。
// 返回值:ok=码正确或无需码;locked=已被锁定(调用方应回 429)。
// 只有「提交了非空 code 且错误」才计一次失败;首次进页(空 code)不计。
func verifyShareCode(c *gin.Context, share *LibraryShare, code string) (ok, locked bool) {
	if share.ExtractCode == "" {
		return true, false
	}
	ctx := c.Request.Context()
	ip := c.ClientIP()
	if shareCodeLocked(ctx, share.Token, ip) {
		return false, true
	}
	code = strings.TrimSpace(code)
	if strings.EqualFold(code, share.ExtractCode) {
		clearShareCodeFails(ctx, share.Token, ip)
		return true, false
	}
	if code != "" {
		recordShareCodeFail(ctx, share.Token, ip)
	}
	return false, false
}

// PublicGetShare GET /api/v1/public/share/:token?code=  (OptionalUserAuth)
func (h *Handler) PublicGetShare(c *gin.Context) {
	token := strings.TrimSpace(c.Param("token"))
	if token == "" {
		utils.Error(c, http.StatusNotFound, "分享不存在")
		return
	}
	db := database.GetDB()
	var share LibraryShare
	if err := db.Where("token = ?", token).First(&share).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "分享不存在或已被取消")
		return
	}
	if share.Status != ShareStatusActive {
		utils.Error(c, http.StatusNotFound, "分享已被取消")
		return
	}
	if share.IsExpired(time.Now()) {
		utils.Error(c, http.StatusGone, "分享链接已过期")
		return
	}

	sharer := resolveDisplayName(db, share.UserID)

	// 需要提取码但未提供/不匹配 → 回「预览」信息:标题/分享人/篇数 + 前 N 篇 teaser 样本
	// (无摘要/doi/pdf),让落地页直接呈现合集预览;完整篇目与转存仍需正确提取码。
	if share.ExtractCode != "" {
		codeOK, codeLocked := verifyShareCode(c, &share, c.Query("code"))
		if codeLocked {
			utils.Error(c, http.StatusTooManyRequests, "提取码尝试次数过多,请 10 分钟后再试")
			return
		}
		if !codeOK {
			resp := gin.H{
				"need_code":   true,
				"kind":        share.Kind,
				"title":       share.Title,
				"subtitle":    share.Subtitle,
				"paper_count": share.PaperCount,
				"sharer":      sharer,
				"created_at":  share.CreatedAt,
				"allow_save":  share.AllowSave,
			}
			if share.Kind == ShareKindCollection {
				resp["papers"] = loadSharePreviewSample(db, share.ID, sharePreviewSampleN)
				resp["author_count"] = loadShareAuthorCount(db, share.ID)
			}
			utils.Success(c, resp)
			return
		}
	}

	var papers []LibrarySharePaper
	if err := db.Where("share_id = ?", share.ID).Order("position ASC, id ASC").Find(&papers).Error; err != nil {
		utils.InternalError(c, http.StatusInternalServerError, "查询失败", err)
		return
	}

	// 记一次 view + 自增计数(best-effort,失败不阻断)。
	// 同一 (token, IP) 10 分钟内只记一次 —— 防刷 view_count 与 access 流水无限膨胀
	// (SetNX 失败/Redis 不可用时照记,可用性优先)。
	if fresh, err := cache.SetNX(c.Request.Context(),
		"library:share-view:"+share.Token+":"+c.ClientIP(), "1", 10*time.Minute); err != nil || fresh {
		recordShareAccess(db, c, &share, ShareActionView, 0)
		db.Model(&LibraryShare{}).Where("id = ?", share.ID).
			UpdateColumn("view_count", gorm.Expr("view_count + 1"))
	}

	utils.Success(c, gin.H{
		"need_code":    false,
		"token":        share.Token,
		"kind":         share.Kind,
		"entity_type":  share.EntityType,
		"title":        share.Title,
		"subtitle":     share.Subtitle,
		"paper_count":  share.PaperCount,
		"journal_id":   share.JournalID, // kind=journal:落地页据此实时取期刊详情
		"allow_save":   share.AllowSave,
		"expires_at":   share.ExpiresAt,
		"created_at":   share.CreatedAt,
		"author_count": countSharePaperAuthors(papers),
		"sharer":       sharer,
		"papers":       papers,
	})
}

const sharePreviewSampleN = 5

// loadSharePreviewSample 取分享「最高被引」前 N 篇的预览样本(title/venue/year/authors/citation,
// 不含 abstract/doi/pdf),供 need_code 落地页的合集 teaser 用(与落地页「按被引排序」一致);
// 完整篇目与转存仍需正确提取码。
func loadSharePreviewSample(db *gorm.DB, shareID uint64, n int) []gin.H {
	var rows []LibrarySharePaper
	if err := db.Where("share_id = ?", shareID).
		Order("citation_count DESC, position ASC").Limit(n).Find(&rows).Error; err != nil {
		return []gin.H{}
	}
	out := make([]gin.H, 0, len(rows))
	for i := range rows {
		sp := &rows[i]
		out = append(out, gin.H{
			"source":          sp.Source,
			"source_paper_id": sp.SourcePaperID,
			"title":           sp.Title,
			"authors":         sp.AuthorsJSON,
			"year":            sp.Year,
			"venue":           sp.Venue,
			"citation_count":  sp.CitationCount,
		})
	}
	return out
}

// countSharePaperAuthors 统计快照里去重后的作者人数(按作者 name 去重)。
func countSharePaperAuthors(rows []LibrarySharePaper) int {
	seen := make(map[string]struct{})
	for i := range rows {
		if len(rows[i].AuthorsJSON) == 0 {
			continue
		}
		var authors []struct {
			Name string `json:"name"`
		}
		if json.Unmarshal(rows[i].AuthorsJSON, &authors) != nil {
			continue
		}
		for _, a := range authors {
			if n := strings.TrimSpace(a.Name); n != "" {
				seen[n] = struct{}{}
			}
		}
	}
	return len(seen)
}

// loadShareAuthorCount 只取 authors_json 列统计去重作者数(teaser 分支用,避免加载全部字段)。
func loadShareAuthorCount(db *gorm.DB, shareID uint64) int {
	var rows []LibrarySharePaper
	if err := db.Select("authors_json").Where("share_id = ?", shareID).Find(&rows).Error; err != nil {
		return 0
	}
	return countSharePaperAuthors(rows)
}

// ---- 收件人:转存 ----

type saveShareReq struct {
	Code     string  `json:"code"`
	FolderID *uint64 `json:"folder_id"`
}

// SaveShare POST /api/v1/user/library/shares/:token/save  (登录) —— 一键转存到自己的文献集
func (h *Handler) SaveShare(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	token := strings.TrimSpace(c.Param("token"))
	var req saveShareReq
	_ = c.ShouldBindJSON(&req)

	db := database.GetDB()
	var share LibraryShare
	if err := db.Where("token = ? AND status = ?", token, ShareStatusActive).First(&share).Error; err != nil {
		utils.Error(c, http.StatusNotFound, "分享不存在或已被取消")
		return
	}
	if share.IsExpired(time.Now()) {
		utils.Error(c, http.StatusGone, "分享链接已过期")
		return
	}
	if !share.AllowSave {
		utils.Error(c, http.StatusForbidden, "该分享不允许转存")
		return
	}
	if share.ExtractCode != "" {
		codeOK, codeLocked := verifyShareCode(c, &share, req.Code)
		if codeLocked {
			utils.Error(c, http.StatusTooManyRequests, "提取码尝试次数过多,请 10 分钟后再试")
			return
		}
		if !codeOK {
			utils.Error(c, http.StatusForbidden, "提取码错误")
			return
		}
	}

	// 目标文件夹:指定则校验归属,否则默认文件夹
	var targetFolderID uint64
	var targetFolderName string
	if req.FolderID != nil && *req.FolderID != 0 {
		var f UserLibraryFolder
		if err := db.Where("id = ? AND user_id = ?", *req.FolderID, uid).First(&f).Error; err != nil {
			utils.Error(c, http.StatusNotFound, "目标文件夹不存在")
			return
		}
		targetFolderID, targetFolderName = f.ID, f.Name
	} else {
		f, err := ensureDefaultFolder(db, uid)
		if err != nil {
			utils.InternalError(c, http.StatusInternalServerError, "转存失败", err)
			return
		}
		targetFolderID, targetFolderName = f.ID, f.Name
	}

	var papers []LibrarySharePaper
	if err := db.Where("share_id = ?", share.ID).Order("position ASC, id ASC").Find(&papers).Error; err != nil {
		utils.InternalError(c, http.StatusInternalServerError, "转存失败", err)
		return
	}

	// 构造待插入行(分层落列,见 savedRowFromSnapshot)+ 过滤非法快照
	rows := make([]UserLibraryPaper, 0, len(papers))
	skipped := 0
	for i := range papers {
		sp := &papers[i]
		row, ok := savedRowFromSnapshot(sp, uid, targetFolderID)
		if !ok {
			skipped++
			continue
		}
		rows = append(rows, row)
	}

	// 幂等预筛:一次 (source, source_paper_id) 元组 IN 查询代替逐篇 Count
	// (旧实现 500 篇 = 500 次预查 + 500 个独立 FOR UPDATE 事务,转存大合集
	// 期间同用户所有并发收藏被串行阻塞)。
	if len(rows) > 0 {
		pairs := make([][]any, 0, len(rows))
		for i := range rows {
			pairs = append(pairs, []any{rows[i].Source, rows[i].SourcePaperID})
		}
		type dupKey struct {
			Source        string
			SourcePaperID string
		}
		var dups []dupKey
		if err := db.Model(&UserLibraryPaper{}).
			Select("source, source_paper_id").
			Where("user_id = ? AND (source, source_paper_id) IN ?", uid, pairs).
			Find(&dups).Error; err != nil {
			utils.InternalError(c, http.StatusInternalServerError, "转存失败", err)
			return
		}
		existing := make(map[dupKey]bool, len(dups))
		for _, d := range dups {
			existing[d] = true
		}
		fresh := rows[:0]
		for i := range rows {
			if existing[dupKey{rows[i].Source, rows[i].SourcePaperID}] {
				skipped++
				continue
			}
			fresh = append(fresh, rows[i])
		}
		rows = fresh
	}

	// 单事务批量插入:一次 FOR UPDATE 锁用户区间 → 按剩余配额截断 → INSERT IGNORE
	// (IGNORE 兜住与并发收藏的罕见唯一键竞态,不让整批失败)。
	added := 0
	limitHit := false
	if len(rows) > 0 {
		if err := db.Transaction(func(tx *gorm.DB) error {
			var count int64
			if err := tx.Raw(
				"SELECT COUNT(*) FROM user_library_papers WHERE user_id = ? FOR UPDATE", uid,
			).Row().Scan(&count); err != nil {
				return err
			}
			remaining := MaxPapersPerUser - int(count)
			if remaining <= 0 {
				limitHit = true
				return nil
			}
			if len(rows) > remaining {
				rows = rows[:remaining]
				limitHit = true
			}
			res := tx.Clauses(clause.Insert{Modifier: "IGNORE"}).Create(&rows)
			if res.Error != nil {
				return res.Error
			}
			added = int(res.RowsAffected)
			return nil
		}); err != nil {
			utils.InternalError(c, http.StatusInternalServerError, "转存失败", err)
			return
		}
	}

	if added > 0 {
		recordShareAccess(db, c, &share, ShareActionSave, added)
		db.Model(&LibraryShare{}).Where("id = ?", share.ID).
			UpdateColumn("save_count", gorm.Expr("save_count + 1"))
	}

	resp := gin.H{
		"added":       added,
		"skipped":     skipped,
		"total":       len(papers),
		"folder_id":   targetFolderID,
		"folder_name": targetFolderName,
	}
	if limitHit {
		resp["limit_reached"] = true
	}
	utils.Success(c, resp)
}

// ---- helpers ----

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// savedRowFromSnapshot 把分享快照转成收件人库行 —— **按 og/metadata 双轨分层落列**。
//
// 快照值(创建时已做 og 优先合并)本质是「分享者侧真值」,不是上游冻结快照,
// 所以有 og 孪生列的字段(title/abstract/authors/year/venue/doi)一律落 og_*、
// metadata 留空 —— 否则:
//   - linked 行的"上游冻结"不变量被分享者手编值污染(且 relink 同键 no-op 永不刷新);
//   - local 行变成「og 全空、metadata 有值」的倒置行,空壳守卫全误判,
//     一次 relink 会静默清光全部内容(relinkInPlace 无条件覆写 metadata 10 列)。
//
// 无 og 孪生列的 pdf_url/citation_count 本就是上游数据,保留在 metadata 列。
// local 行的 source_paper_id 换成 "share-<原sha>" 占位:收件人没有 PDF 本体,
// 不能冒充其自有文件的 sha(否则其后自传 PDF 会造成 source_paper_id 与 pdf_sha256
// 永久漂移,还会让智能上传的 sha 幂等合并命中错行)。
//
// 快照 source 既非上游三源也非 local(历史遗留/异常数据)→ ok=false 跳过,
// 绝不把非法 source 写进收件人库(单删端点 IsValidSource 校验会让这种行删不掉)。
func savedRowFromSnapshot(sp *LibrarySharePaper, uid, folderID uint64) (UserLibraryPaper, bool) {
	source := strings.TrimSpace(sp.Source)
	paperID := strings.TrimSpace(sp.SourcePaperID)
	if source == "" || paperID == "" {
		return UserLibraryPaper{}, false
	}
	if !IsValidUpstreamSource(source) && source != SourceLocal {
		return UserLibraryPaper{}, false
	}
	linkState := LinkStateLinked
	if source == SourceLocal {
		linkState = LinkStateFree
		if !strings.HasPrefix(paperID, savedShareIDPrefix) {
			paperID = savedShareIDPrefix + paperID
		}
	}
	fid := folderID
	return UserLibraryPaper{
		UserID:        uid,
		FolderID:      &fid,
		Source:        source,
		SourcePaperID: paperID,
		// 分享者侧真值 → og_*(用户侧真值层)
		OGTitle:       sp.Title,
		OGAbstract:    sp.Abstract,
		OGAuthorsJSON: sp.AuthorsJSON,
		OGYear:        sp.Year,
		OGVenue:       sp.Venue,
		OGDOI:         sp.DOI,
		// 无 og 孪生列的上游数据 → metadata 层
		PdfURL:        sp.PdfURL,
		CitationCount: sp.CitationCount,
		LinkState:     linkState,
		Origin:        OriginShare,
	}, true
}

// snapshotFromLibraryRow 把库行转成分享快照,优先用用户编辑过的 og_* 真值。
func snapshotFromLibraryRow(r *UserLibraryPaper, position int) LibrarySharePaper {
	title := firstNonEmpty(r.OGTitle, r.Title)
	venue := firstNonEmpty(r.OGVenue, r.Venue)
	doi := firstNonEmpty(r.OGDOI, r.DOI)
	abstract := firstNonEmpty(r.OGAbstract, r.Abstract)
	authors := r.AuthorsJSON
	if len(r.OGAuthorsJSON) > 0 {
		authors = r.OGAuthorsJSON
	}
	year := r.Year
	if r.OGYear != nil {
		year = r.OGYear
	}
	return LibrarySharePaper{
		Source: r.Source, SourcePaperID: r.SourcePaperID, Title: title,
		AuthorsJSON: authors, Year: year, Venue: venue, DOI: doi,
		Abstract: abstract, PdfURL: r.PdfURL, CitationCount: r.CitationCount, Position: position,
	}
}

// resolveDisplayName 取用户展示名(username → 脱敏 email → 匿名占位),用于"X 的分享"/访问记录。
//
// 展示名会下发给**匿名公开访客**(分享落地页)与分享 owner(访问记录),所以:
//   - email 绝不原文外露(PII),只展示脱敏形式(ab***@example.com);
//   - 用户行已删(账号注销)→ 显示「已注销用户」,不暴露内部自增 id。
func resolveDisplayName(db *gorm.DB, uid uint64) string {
	var row struct {
		Username *string
		Email    *string
	}
	res := db.Table("users").Select("username, email").Where("id = ?", uid).Scan(&row)
	if res.Error == nil {
		if res.RowsAffected == 0 {
			return "已注销用户"
		}
		if row.Username != nil && strings.TrimSpace(*row.Username) != "" {
			return *row.Username
		}
		if row.Email != nil && strings.TrimSpace(*row.Email) != "" {
			return maskEmail(*row.Email)
		}
	}
	return "学者用户"
}

// maskEmail 邮箱脱敏:保留本地部分前 2 个字符(不足 2 个保留 1 个)+ *** + 完整域名。
func maskEmail(email string) string {
	email = strings.TrimSpace(email)
	at := strings.Index(email, "@")
	if at <= 0 {
		return "学者用户"
	}
	local, domain := email[:at], email[at:]
	keep := 2
	if r := []rune(local); len(r) < keep {
		keep = len(r)
	}
	return string([]rune(local)[:keep]) + "***" + domain
}

// recordShareAccess 记一条访问/转存流水(best-effort)。登录则记 user_id + 展示名,否则匿名。
func recordShareAccess(db *gorm.DB, c *gin.Context, share *LibraryShare, action string, itemCount int) {
	acc := LibraryShareAccess{ShareID: share.ID, Action: action, ItemCount: itemCount}
	if v, ok := c.Get("user_id"); ok {
		if uid := toUint64(v); uid > 0 {
			acc.ViewerUserID = &uid
			acc.ViewerLabel = resolveDisplayName(db, uid)
		}
	}
	if acc.ViewerLabel == "" {
		acc.ViewerLabel = "匿名访客"
	}
	_ = db.Create(&acc).Error
}

func toUint64(v any) uint64 {
	switch id := v.(type) {
	case uint64:
		return id
	case uint:
		return uint64(id)
	case int:
		return uint64(id)
	case int64:
		return uint64(id)
	case float64:
		return uint64(id)
	}
	return 0
}
