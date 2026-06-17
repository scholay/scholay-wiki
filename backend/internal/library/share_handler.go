// ============================================================================
// Scholay 文献集分享 —— HTTP handlers(创建 / 列表 / 撤销 / 访问记录 / 转存 / 公开获取)
// ----------------------------------------------------------------------------
// owner 端点挂在 /api/v1/user/library/shares(登录);公开获取挂在
// /api/v1/public/share/:token(OptionalUserAuth);转存挂在 .../shares/:token/save(登录)。
// 沿用本模块「model/repo/service 合并进 handler」的风格。
// ============================================================================

package library

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
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

	switch req.Kind {
	case ShareKindSingle:
		if req.Paper == nil || strings.TrimSpace(req.Paper.Source) == "" || strings.TrimSpace(req.Paper.SourcePaperID) == "" {
			utils.Error(c, http.StatusBadRequest, "单篇分享缺少论文信息")
			return
		}
		p := req.Paper
		share.Kind = ShareKindSingle
		share.EntityType = ShareEntityPaper
		share.Title = firstNonEmpty(req.Title, p.Title, "未命名论文")
		share.Subtitle = p.Venue
		share.PaperCount = 1
		snapshot = []LibrarySharePaper{{
			Source: p.Source, SourcePaperID: p.SourcePaperID, Title: p.Title,
			AuthorsJSON: p.Authors, Year: p.Year, Venue: p.Venue, DOI: p.DOI,
			Abstract: p.Abstract, PdfURL: p.PdfURL, CitationCount: p.CitationCount, Position: 0,
		}}

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
		// 海报/预览用的篇目样本(前 N 篇,不含 abstract 以保持响应精简)。
		// 让分享图无论从哪个入口(文献集列表 / 集内 / PC)创建,都能稳定渲染前几篇。
		"papers": sharePaperSample(snapshot),
	})
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
		code := strings.TrimSpace(c.Query("code"))
		if !strings.EqualFold(code, share.ExtractCode) {
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

	// 记一次 view + 自增计数(best-effort,失败不阻断)
	recordShareAccess(db, c, &share, ShareActionView, 0)
	db.Model(&LibraryShare{}).Where("id = ?", share.ID).
		UpdateColumn("view_count", gorm.Expr("view_count + 1"))

	utils.Success(c, gin.H{
		"need_code":   false,
		"token":       share.Token,
		"kind":        share.Kind,
		"entity_type": share.EntityType,
		"title":       share.Title,
		"subtitle":    share.Subtitle,
		"paper_count": share.PaperCount,
		"journal_id":  share.JournalID, // kind=journal:落地页据此实时取期刊详情
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
	if share.ExtractCode != "" && !strings.EqualFold(strings.TrimSpace(req.Code), share.ExtractCode) {
		utils.Error(c, http.StatusForbidden, "提取码错误")
		return
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

	added, skipped := 0, 0
	limitHit := false
	for i := range papers {
		sp := &papers[i]
		if strings.TrimSpace(sp.Source) == "" || strings.TrimSpace(sp.SourcePaperID) == "" {
			skipped++
			continue
		}
		// 幂等:已收藏(user_id + source + source_paper_id 唯一)→ 跳过
		var existing int64
		db.Model(&UserLibraryPaper{}).
			Where("user_id = ? AND source = ? AND source_paper_id = ?", uid, sp.Source, sp.SourcePaperID).
			Count(&existing)
		if existing > 0 {
			skipped++
			continue
		}
		fid := targetFolderID
		linkState := LinkStateLinked
		if sp.Source == "local" {
			linkState = LinkStateFree
		}
		row := UserLibraryPaper{
			UserID: uid, FolderID: &fid, Source: sp.Source, SourcePaperID: sp.SourcePaperID,
			Title: sp.Title, AuthorsJSON: sp.AuthorsJSON, Year: sp.Year, Venue: sp.Venue,
			DOI: sp.DOI, Abstract: sp.Abstract, PdfURL: sp.PdfURL, CitationCount: sp.CitationCount,
			LinkState: linkState, Origin: OriginShare,
		}
		if err := insertPaperAtomic(db, &row); err != nil {
			if errors.Is(err, errPaperLimit) {
				limitHit = true
				break
			}
			// 单篇失败不致命,跳过继续
			skipped++
			continue
		}
		added++
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

// resolveDisplayName 取用户展示名(username → email → 用户#id),用于"X 的分享"/访问记录。
func resolveDisplayName(db *gorm.DB, uid uint64) string {
	var row struct {
		Username *string
		Email    *string
	}
	if err := db.Table("users").Select("username, email").Where("id = ?", uid).Scan(&row).Error; err == nil {
		if row.Username != nil && strings.TrimSpace(*row.Username) != "" {
			return *row.Username
		}
		if row.Email != nil && strings.TrimSpace(*row.Email) != "" {
			return *row.Email
		}
	}
	return "用户#" + strconv.FormatUint(uid, 10)
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
