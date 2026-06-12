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
	"errors"
	"fmt"
	"net/http"
	"strings"

	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/storage"

	"github.com/gin-gonic/gin"
	"github.com/go-sql-driver/mysql"
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
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "搜索服务未启用")
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
		utils.InternalError(c, 500, "搜索失败", err)
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
			utils.InternalError(c, 500, "合并失败", err)
			return
		}
		utils.Success(c, RelinkResponse{Paper: paper, Merged: true})
		return
	}

	// 没冲突 → 原地把 current 改成 linked 到新上游
	paper, err := h.relinkInPlace(db, current, &req.Link)
	if err != nil {
		utils.InternalError(c, 500, "关联失败", err)
		return
	}
	utils.Success(c, RelinkResponse{Paper: paper, Merged: false})
}

// ============================================================================
// 内部:合并 vs 原地更新
// ============================================================================

// mergeIntoExisting 把 current 行的 PDF + og_* 合到 existing,然后删 current。
// PDF 转移用 MinIO copy-then-delete;失败则不动既有数据,返回错误。
func (h *Handler) mergeIntoExisting(
	ctx context.Context, db *gorm.DB,
	current, existing *UserLibraryPaper, choice *LinkChoice,
) (*UserLibraryPaper, error) {
	bucket := storage.PaperPDFBucket()
	updates := map[string]interface{}{}

	// PDF 迁移:current 有 PDF + existing 没有 (或不同 sha256) → 把 current 的对象搬到 existing 的命名空间
	movedPdf := false
	if current.PdfObjectKey != "" {
		if existing.PdfObjectKey == "" || existing.PdfSHA256 != current.PdfSHA256 {
			newKey := fmt.Sprintf("papers/%d/%d/%s.pdf", existing.UserID, existing.ID, current.PdfSHA256)
			if err := movePdfTmpToFinal(ctx, bucket, current.PdfObjectKey, newKey); err != nil {
				return nil, fmt.Errorf("move pdf: %w", err)
			}
			movedPdf = true
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
		// 若 existing 已有同 sha256 的 PDF —— 保留 existing 的对象;current 的对象在
		// 事务成功后异步清理(见下),否则 current 行删除后对象成 MinIO 孤儿
	}

	// og_* 字段迁移:existing 没有的填上;有的留 existing 的(避免覆盖已有用户编辑)
	// 双侧判空标准与 unlink 快照一致:字符串用 TrimSpace,JSON 列用 jsonFieldEmpty
	if strings.TrimSpace(existing.OGTitle) == "" && strings.TrimSpace(current.OGTitle) != "" {
		updates["og_title"] = current.OGTitle
	}
	if strings.TrimSpace(existing.OGAbstract) == "" && strings.TrimSpace(current.OGAbstract) != "" {
		updates["og_abstract"] = current.OGAbstract
	}
	if jsonFieldEmpty(existing.OGAuthorsJSON) && !jsonFieldEmpty(current.OGAuthorsJSON) {
		updates["og_authors_json"] = current.OGAuthorsJSON
	}
	if existing.OGYear == nil && current.OGYear != nil {
		updates["og_year"] = *current.OGYear
	}
	if strings.TrimSpace(existing.OGVenue) == "" && strings.TrimSpace(current.OGVenue) != "" {
		updates["og_venue"] = current.OGVenue
	}
	if strings.TrimSpace(existing.OGDOI) == "" && strings.TrimSpace(current.OGDOI) != "" {
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

	// 事务成功后:同 sha 分支(没走 move)的 current PDF 对象已无任何行引用,
	// 异步清理避免 MinIO 孤儿。move 分支的源对象已由 movePdfTmpToFinal 顺带删除。
	if current.PdfObjectKey != "" && !movedPdf && current.PdfObjectKey != existing.PdfObjectKey {
		oldKey := current.PdfObjectKey
		go cleanupTmpObject(bucket, oldKey)
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
// og_* / pdf_* 保留,link_state 改为 linked。
func (h *Handler) relinkInPlace(db *gorm.DB, current *UserLibraryPaper, choice *LinkChoice) (*UserLibraryPaper, error) {
	// 元数据 = 上游冻结快照,**无条件写满全部 10 列**:choice 缺值的字段显式写零值,
	// 否则 linked→linked 切上游时会残留旧论文的快照,一行混入两篇论文的元数据。
	updates := map[string]interface{}{
		"source":          choice.Source,
		"source_paper_id": choice.SourcePaperID,
		"title":           choice.Title,
		"venue":           choice.Venue,
		"doi":             choice.DOI,
		"abstract":        choice.Abstract,
		"pdf_url":         choice.PdfURL,
		"citation_count":  choice.CitationCount,
		"authors_json":    nil,
		"year":            nil,
		"raw_json":        nil,
		// LinkChoice 当前链路拿不到 publication_types → 显式清空,不留旧快照
		"publication_types_json": nil,
		"link_state":             LinkStateLinked,
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
// 取消关联 —— 把一行从 linked 退回到 free(本地)状态。
//
// 语义:**把当前生效的展示值固化为 og,然后清掉上游快照**。前端展示合并是逐字段
// "og 非空优先,否则回落元数据";unlink 先做快照 —— og 为空的字段用对应元数据值
// 回填(og 已非空的字段绝不覆盖,og 是用户侧真值),再清空全部上游元数据列,
// 保证 unlink 前后用户看到的内容不变。
//
// 字段动作:
//   - og_*           = 快照:og 为空的字段回填对应元数据值;og 非空的字段不动
//   - source         = 'local'
//   - source_paper_id = pdf_sha256(走 free 行的占位约定;sha 为空回 row id;
//     撞 (user, source, source_paper_id) 唯一键时追加 -<rowID> 后缀兜底)
//   - link_state     = 'free'
//   - title/abstract/authors/year/venue/doi/pdf_url/publication_types/
//     citation_count/raw 全部清空
//   - pdf_*          不动
//
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

	if row.LinkState != LinkStateLinked {
		// 已经是 free,no-op,直接回当前行
		utils.Success(c, *row)
		return
	}

	// 空壳守卫:条目必须"有自己的东西"(任一 og 字段非空 或 已上传 PDF)才允许取消
	// 关联 —— 只有在线数据的条目取消后只剩无意义的复制壳(见 ogAllEmpty)。
	if ogAllEmpty(row) && row.PdfObjectKey == "" {
		utils.Error(c, http.StatusBadRequest,
			"该收藏仅有在线数据,取消关联后将不包含任何信息;可先上传 PDF 或编辑基本信息")
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
		// 清空全部上游元数据列(生效展示值已在下方快照进 og_*)
		"title":                  "",
		"abstract":               "",
		"venue":                  "",
		"doi":                    "",
		"pdf_url":                "",
		"citation_count":         0,
		"authors_json":           nil,
		"publication_types_json": nil,
		"year":                   nil,
		"raw_json":               nil,
	}

	// 快照:og 为空的字段把当前元数据值固化进去 —— 只填空,绝不覆盖非空 og
	if strings.TrimSpace(row.OGTitle) == "" && strings.TrimSpace(row.Title) != "" {
		updates["og_title"] = row.Title
	}
	if strings.TrimSpace(row.OGAbstract) == "" && strings.TrimSpace(row.Abstract) != "" {
		updates["og_abstract"] = row.Abstract
	}
	if jsonFieldEmpty(row.OGAuthorsJSON) && !jsonFieldEmpty(row.AuthorsJSON) {
		updates["og_authors_json"] = row.AuthorsJSON
	}
	if row.OGYear == nil && row.Year != nil && *row.Year > 0 {
		updates["og_year"] = *row.Year
	}
	if strings.TrimSpace(row.OGVenue) == "" && strings.TrimSpace(row.Venue) != "" {
		updates["og_venue"] = row.Venue
	}
	if strings.TrimSpace(row.OGDOI) == "" && strings.TrimSpace(row.DOI) != "" {
		updates["og_doi"] = row.DOI
	}

	err := db.Model(&UserLibraryPaper{}).Where("id = ?", row.ID).Updates(updates).Error
	if isDuplicateKey(err) {
		// (user, source, source_paper_id) 撞唯一键 —— 同 sha 的自由文件行已存在
		// (典型:同一 PDF 既单独传成过 free 行,又被关联到上游行)。
		// 追加行 id 后缀保证唯一,不能裸 500。
		updates["source_paper_id"] = fmt.Sprintf("%s-%d", placeholder, row.ID)
		err = db.Model(&UserLibraryPaper{}).Where("id = ?", row.ID).Updates(updates).Error
	}
	if err != nil {
		utils.InternalError(c, 500, "取消关联失败", err)
		return
	}

	var refreshed UserLibraryPaper
	if err := db.First(&refreshed, row.ID).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "取消关联后回读失败")
		return
	}
	utils.Success(c, refreshed)
}

// isDuplicateKey 判断是否 MySQL 唯一键冲突(1062)。
func isDuplicateKey(err error) bool {
	var me *mysql.MySQLError
	return errors.As(err, &me) && me.Number == 1062
}

// ogAllEmpty 判断行的 6 个 og 字段(用户侧信息)是否全空。
//
// 空壳规则:og 全空且未上传 PDF 的条目"没有自己的东西" —— 不允许脱离在线数据
// 独立存在(Unlink 守卫:仅在线数据的行取消关联后只剩无意义的复制壳;DeletePDF
// 守卫:free 行 og 全空时再移除 PDF 会变成彻底空壳)。
//
// 判空标准与 Unlink 快照逻辑一致:字符串列 TrimSpace 后为空、og_year 为
// nil 或 0、og_authors_json 用 jsonFieldEmpty(""/null/[] 视为空)。
func ogAllEmpty(row *UserLibraryPaper) bool {
	return strings.TrimSpace(row.OGTitle) == "" &&
		strings.TrimSpace(row.OGAbstract) == "" &&
		jsonFieldEmpty(row.OGAuthorsJSON) &&
		(row.OGYear == nil || *row.OGYear == 0) &&
		strings.TrimSpace(row.OGVenue) == "" &&
		strings.TrimSpace(row.OGDOI) == ""
}
