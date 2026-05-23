// ============================================================================
// Scholay 文献集 · 已收藏论文的"关联"路径
// ----------------------------------------------------------------------------
// 主要场景:用户对一个"自由文件"(link_state='free',源是 'local')想后期把它
// 关联到真实上游论文。此外 linked 行也可以再次 relink(切上游)。
//
//   POST /user/library/papers/:id/relink-search  (json)
//      body: { title? }
//      → 200 { used_title, hits: SearchHit[] }
//      title 缺省时用 row 的 og_title (free) 或 title (linked) 兜底
//
//   POST /user/library/papers/:id/relink  (json)
//      body: { link: { source, source_paper_id, ... } }
//      → 200 { paper: UserLibraryPaper, merged: bool }
//
// 关联行为:
//   - 若 (uid, link.source, link.source_paper_id) **已存在**另一行 L (L.id != current.id):
//      合并:current 行的 PDF + og_* 转移到 L,删除 current。返回 L。merged=true
//   - 若不存在:
//      原地更新:current 行的 source/source_paper_id/title/authors/... 改成上游数据,
//      link_state='linked',og_*/pdf_* 保留。返回 current。merged=false
//   - 若 (link.source, link.source_paper_id) === (current.source, current.source_paper_id):
//      no-op,直接返回 current(已经是关联状态)
// ============================================================================

package library

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/storage"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ============================================================================
// POST /user/library/papers/:id/relink-search
// ============================================================================

type RelinkSearchRequest struct {
	// Title 覆盖搜索词;不传时后端用 row 的 og_title / title 兜底
	Title string `json:"title"`
}

type RelinkSearchResponse struct {
	UsedTitle string      `json:"used_title"`
	Hits      []SearchHit `json:"hits"`
}

func (h *Handler) RelinkSearch(c *gin.Context) {
	if h.deps.Minicod == nil {
		utils.Error(c, http.StatusServiceUnavailable, "搜索服务未启用")
		return
	}
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	paperID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	db := database.GetDB()
	row, ok := loadOwnedPaper(c, db, uid, paperID)
	if !ok {
		return
	}

	var req RelinkSearchRequest
	// body 可以省 —— 用户什么都不传就用 og_title 兜底
	_ = c.ShouldBindJSON(&req)

	title := strings.TrimSpace(req.Title)
	if title == "" {
		// 优先用 og_title(自由文件通常 title 是空的,og_title 才有内容)
		title = strings.TrimSpace(row.OGTitle)
		if title == "" {
			title = strings.TrimSpace(row.Title)
		}
	}
	if title == "" {
		utils.Error(c, http.StatusBadRequest, "缺少搜索词:请传入 title 或先让该论文有 og_title")
		return
	}

	hits, err := h.SearchThreeSources(c.Request.Context(), uid, title, 5)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "搜索失败: "+err.Error())
		return
	}
	utils.Success(c, RelinkSearchResponse{UsedTitle: title, Hits: hits})
}

// ============================================================================
// POST /user/library/papers/:id/relink
// ============================================================================

type RelinkRequest struct {
	Link LinkChoice `json:"link" binding:"required"`
}

type RelinkResponse struct {
	Paper  *UserLibraryPaper `json:"paper"`
	Merged bool              `json:"merged"`
}

func (h *Handler) Relink(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	paperID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}
	var req RelinkRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误: "+err.Error())
		return
	}
	if !IsValidUpstreamSource(req.Link.Source) {
		utils.Error(c, http.StatusBadRequest, "link.source 取值非法")
		return
	}
	req.Link.SourcePaperID = strings.TrimSpace(req.Link.SourcePaperID)
	if req.Link.SourcePaperID == "" {
		utils.Error(c, http.StatusBadRequest, "link.source_paper_id 必填")
		return
	}

	db := database.GetDB()
	current, ok := loadOwnedPaper(c, db, uid, paperID)
	if !ok {
		return
	}

	// 已经是同一个 (source, source_paper_id) → no-op
	if current.Source == req.Link.Source && current.SourcePaperID == req.Link.SourcePaperID {
		// 但 link_state 可能仍是 free,顺手把它扶正
		if current.LinkState != LinkStateLinked {
			if err := db.Model(&UserLibraryPaper{}).Where("id = ?", current.ID).
				Update("link_state", LinkStateLinked).Error; err != nil {
				utils.Error(c, http.StatusInternalServerError, "更新失败")
				return
			}
			current.LinkState = LinkStateLinked
		}
		utils.Success(c, RelinkResponse{Paper: current, Merged: false})
		return
	}

	// 检查目标上游论文是否已经被该用户收藏过(另一行)
	var existing UserLibraryPaper
	q := db.Where("user_id = ? AND source = ? AND source_paper_id = ?",
		uid, req.Link.Source, req.Link.SourcePaperID).First(&existing)
	if q.Error == nil && existing.ID != current.ID {
		// 合并到 existing
		paper, err := h.mergeIntoExisting(c.Request.Context(), db, current, &existing, &req.Link)
		if err != nil {
			utils.Error(c, http.StatusInternalServerError, "合并失败: "+err.Error())
			return
		}
		utils.Success(c, RelinkResponse{Paper: paper, Merged: true})
		return
	}

	// 没冲突 → 原地把 current 改成 linked 到新上游
	paper, err := h.relinkInPlace(db, current, &req.Link)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "关联失败: "+err.Error())
		return
	}
	utils.Success(c, RelinkResponse{Paper: paper, Merged: false})
}

// ============================================================================
// 内部:合并 vs 原地更新
// ============================================================================

// mergeIntoExisting 把 current 行的 PDF + ai_* 合到 existing,然后删 current。
// PDF 转移用 MinIO copy-then-delete;失败则不动既有数据,返回错误。
func (h *Handler) mergeIntoExisting(
	ctx context.Context, db *gorm.DB,
	current, existing *UserLibraryPaper, choice *LinkChoice,
) (*UserLibraryPaper, error) {
	bucket := storage.PaperPDFBucket()
	updates := map[string]interface{}{}

	// PDF 迁移:current 有 PDF + existing 没有 (或不同 sha256) → 把 current 的对象搬到 existing 的命名空间
	if current.PdfObjectKey != "" {
		if existing.PdfObjectKey == "" || existing.PdfSHA256 != current.PdfSHA256 {
			newKey := fmt.Sprintf("papers/%d/%d/%s.pdf", existing.UserID, existing.ID, current.PdfSHA256)
			if err := movePdfTmpToFinal(ctx, bucket, current.PdfObjectKey, newKey); err != nil {
				return nil, fmt.Errorf("move pdf: %w", err)
			}
			// 旧 existing 的 PDF 异步清理
			if existing.PdfObjectKey != "" && existing.PdfObjectKey != newKey {
				oldKey := existing.PdfObjectKey
				go cleanupTmpObject(bucket, oldKey)
			}
			updates["pdf_object_key"] = newKey
			updates["pdf_original_filename"] = current.PdfOriginalFilename
			updates["pdf_size"] = current.PdfSize
			updates["pdf_sha256"] = current.PdfSHA256
			updates["pdf_mime"] = current.PdfMime
			updates["pdf_uploaded_at"] = current.PdfUploadedAt
		}
		// 若 existing 已有同 sha256 的 PDF —— 已合并(internally idempotent),只删 current 的 tmp 对象
	}

	// og_* 字段迁移:existing 没有的填上;有的留 existing 的(避免覆盖已有用户编辑)
	if existing.OGTitle == "" && current.OGTitle != "" {
		updates["og_title"] = current.OGTitle
	}
	if existing.OGAbstract == "" && current.OGAbstract != "" {
		updates["og_abstract"] = current.OGAbstract
	}
	if len(existing.OGAuthorsJSON) == 0 && len(current.OGAuthorsJSON) > 0 {
		updates["og_authors_json"] = current.OGAuthorsJSON
	}
	if existing.OGYear == nil && current.OGYear != nil {
		updates["og_year"] = *current.OGYear
	}
	if existing.OGVenue == "" && current.OGVenue != "" {
		updates["og_venue"] = current.OGVenue
	}
	if existing.OGDOI == "" && current.OGDOI != "" {
		updates["og_doi"] = current.OGDOI
	}

	// existing 此时一定是 linked(它本来就是),但兜底再设一次
	updates["link_state"] = LinkStateLinked

	// 文件夹位置:existing 已经有自己的位置,不动

	// 落库 + 删 current —— 包在事务里保一致
	if err := db.Transaction(func(tx *gorm.DB) error {
		if len(updates) > 0 {
			if err := tx.Model(&UserLibraryPaper{}).Where("id = ?", existing.ID).Updates(updates).Error; err != nil {
				return err
			}
		}
		// 删 current row(注意 GORM Soft Delete? 检查 model 没有 DeletedAt 字段,所以是硬删)
		if err := tx.Where("id = ? AND user_id = ?", current.ID, existing.UserID).
			Delete(&UserLibraryPaper{}).Error; err != nil {
			return err
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("merge transaction: %w", err)
	}

	var refreshed UserLibraryPaper
	if err := db.First(&refreshed, existing.ID).Error; err != nil {
		return nil, fmt.Errorf("refresh: %w", err)
	}
	_ = choice // 当前实现中 choice 的字段以 existing 行为准,不覆盖
	return &refreshed, nil
}

// relinkInPlace 把 current 行的 source/source_paper_id 改到新上游,
// 同时用 choice 的字段把正常字段都填上(像首次 confirm-link 一样)。
// ai_* / pdf_* 保留,link_state 改为 linked。
func (h *Handler) relinkInPlace(db *gorm.DB, current *UserLibraryPaper, choice *LinkChoice) (*UserLibraryPaper, error) {
	updates := map[string]interface{}{
		"source":           choice.Source,
		"source_paper_id":  choice.SourcePaperID,
		"title":            choice.Title,
		"venue":            choice.Venue,
		"doi":              choice.DOI,
		"abstract":         choice.Abstract,
		"pdf_url":          choice.PdfURL,
		"citation_count":   choice.CitationCount,
		"link_state":       LinkStateLinked,
	}
	if len(choice.Authors) > 0 {
		updates["authors_json"] = choice.Authors
	}
	if choice.Year != nil {
		updates["year"] = *choice.Year
	}
	if len(choice.Raw) > 0 {
		updates["raw_json"] = choice.Raw
	}

	// PDF object key 如果之前是 papers/<uid>/<id>/<sha>.pdf 不需要改;id 没变就还能命中
	// 不动 PDF 这边

	if err := db.Model(&UserLibraryPaper{}).Where("id = ?", current.ID).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("update in place: %w", err)
	}
	var refreshed UserLibraryPaper
	if err := db.First(&refreshed, current.ID).Error; err != nil {
		return nil, fmt.Errorf("refresh: %w", err)
	}
	return &refreshed, nil
}

// ============================================================================
// DELETE /user/library/papers/:id/unlink
//
// 取消关联 —— 把一行从 linked(D/G/M)退回到 free(本地)状态。
// 只对 origin='upload' 的行允许:用户原本是上传 PDF 上来的,关联只是后置标注,
// 取消关联本应可逆;而 origin='search' 的行最初就是从搜索来的"上游论文",
// 没有"取消关联"的概念(那只能整条删除,走 /:source/:paperId DELETE)。
//
// 字段动作:
//   - source         = 'local'
//   - source_paper_id = pdf_sha256(走 free 行的占位约定;若 sha 为空回 row id)
//   - link_state     = 'free'
//   - title/abstract/authors/year/venue/doi/citation_count 清空
//     (用户取消关联后,真实信息只保留 ai_* 快照,与正常 free 行一致)
//   - ai_*           不动
//   - pdf_*          不动
// ============================================================================
func (h *Handler) Unlink(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	paperID, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	db := database.GetDB()
	row, ok := loadOwnedPaper(c, db, uid, paperID)
	if !ok {
		return
	}

	if row.Origin != OriginUpload {
		utils.Error(c, http.StatusBadRequest, "搜索来源的论文不能取消关联,请直接删除该论文")
		return
	}
	if row.LinkState != LinkStateLinked {
		// 已经是 free,no-op,直接回当前行
		utils.Success(c, *row)
		return
	}

	// 占位 source_paper_id:优先 pdf_sha256,空时回 row id
	placeholder := row.PdfSHA256
	if placeholder == "" {
		placeholder = fmt.Sprintf("unlinked-%d", row.ID)
	}

	updates := map[string]interface{}{
		"source":          SourceLocal,
		"source_paper_id": placeholder,
		"link_state":      LinkStateFree,
		"title":           "",
		"abstract":        "",
		"venue":           "",
		"doi":             "",
		"citation_count":  0,
		"authors_json":    nil,
		"year":            nil,
		"raw_json":        nil,
	}

	if err := db.Model(&UserLibraryPaper{}).Where("id = ?", row.ID).Updates(updates).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "取消关联失败")
		return
	}

	var refreshed UserLibraryPaper
	if err := db.First(&refreshed, row.ID).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "取消关联后回读失败")
		return
	}
	utils.Success(c, refreshed)
}

