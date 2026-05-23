// ============================================================================
// Scholay 文献集 Handler
// ----------------------------------------------------------------------------
// 把 model / repository / service 三层合并到 handler 里写：这个模块表面积
// 极小（CRUD + 一个批量 check），分层只会增加文件数不增加价值。
// 等出现复杂业务逻辑（多文件夹/标签/PDF 上传…）再拆。
// ============================================================================

package library

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/minicod"
	"scholar-backend/internal/storage"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Deps 库 handler 依赖的外部域 —— 仅"上传 PDF 智能识别"流程会用到。
// 这两个 dep 在 bootstrap 里由 aiBundle 注入;为 nil 时智能上传相关端点
// 会优雅地返回 503(其余 library CRUD 不受影响)。
type Deps struct {
	Minicod  *minicod.Manager // 三源论文搜索
	AI       *ai.Service      // PDF 结构化字段抽取(自由文件兜底)
}

type Handler struct {
	deps Deps
}

func NewHandler(deps Deps) *Handler {
	return &Handler{deps: deps}
}

// RegisterRoutes 挂在认证后的 /api/v1/user/library 下
//
// 路由列表(注意 :id 这种通配段放最后,避免和 /folders 等静态段抢匹配):
//
//	GET    /library                              列表(可按 source / folder 过滤)
//	POST   /library                              新增论文(可带 folder_id)
//	POST   /library/check                        批量查论文是否已收藏
//	DELETE /library/:source/:paperId             按 source+paperId 删
//
//	GET    /library/folders                      列出所有文件夹(自带论文计数)
//	POST   /library/folders                      新建文件夹
//	PATCH  /library/folders/:id                  重命名
//	DELETE /library/folders/:id                  删除文件夹(内含论文回到根目录)
//
//	PATCH  /library/papers/:id/folder            移动单篇论文到某文件夹(或根)
func (h *Handler) RegisterRoutes(g *gin.RouterGroup) {
	lib := g.Group("/library")
	{
		lib.GET("", h.List)
		lib.POST("", h.Add)
		lib.POST("/check", h.Check)
		lib.GET("/by-upstream/:source/:paperId", h.GetByUpstream)

		// 文件夹 CRUD
		lib.GET("/folders", h.ListFolders)
		lib.POST("/folders", h.CreateFolder)
		lib.PATCH("/folders/:id", h.UpdateFolder)
		lib.DELETE("/folders/:id", h.DeleteFolder)

		// 单篇论文移动
		lib.PATCH("/papers/:id/folder", h.MovePaperFolder)

		// 单篇论文编辑 og_* 字段 (用户手动修改 / 补充元数据, 不会污染上游 metadata)
		lib.PATCH("/papers/:id", h.UpdatePaper)

		// 用户上传 PDF —— 文件本体存 MinIO,这里 backend 转发 + 鉴权
		lib.POST("/papers/:id/pdf", h.UploadPDF)
		lib.GET("/papers/:id/pdf", h.DownloadPDF)
		lib.DELETE("/papers/:id/pdf", h.DeletePDF)

		// 上传 PDF 智能识别 —— SSE 解析 + 确认两段式
		lib.POST("/papers/upload-and-resolve", h.UploadAndResolve)
		lib.POST("/papers/confirm-upload-job", h.ConfirmUploadJob)

		// 关联(后期关联) —— 自由文件 / 任何已收藏行 → 切到上游论文(含合并)
		lib.POST("/papers/:id/relink-search", h.RelinkSearch)
		lib.POST("/papers/:id/relink", h.Relink)
		lib.DELETE("/papers/:id/unlink", h.Unlink)

		// 批量(文件系统/云盘风格)
		lib.POST("/papers/batch/move", h.BatchMovePapers)
		lib.POST("/papers/batch/delete", h.BatchDeletePapers)

		// 注意:这个 catch-all 通配段必须放最后
		lib.DELETE("/:source/:paperId", h.Remove)
	}
}

// ---- helpers ----

func getUserID(c *gin.Context) (uint64, bool) {
	v, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, http.StatusUnauthorized, "未登录")
		return 0, false
	}
	switch id := v.(type) {
	case uint64:
		return id, true
	case uint:
		return uint64(id), true
	case int:
		return uint64(id), true
	case int64:
		return uint64(id), true
	case float64:
		return uint64(id), true
	default:
		utils.Error(c, http.StatusInternalServerError, "用户 ID 类型异常")
		return 0, false
	}
}

// ---- handlers ----

// List GET /api/v1/user/library?source=&folder=&q=&page=&page_size=&order=
//
//	source : stc/olx/pmd —— 不传返回全部源
//	folder : "root"     根目录(folder_id IS NULL)
//	         <id>       某文件夹内
//	         缺省/空      全部(不过滤)
//	q      : 关键词模糊搜索(title / abstract / venue / doi)
//	         非空时附加 OR LIKE 过滤;不传跳过
//	order  : asc | desc(按 created_at 升 / 降);缺省 desc(最新在前)
//
// **不会全表扫**:WHERE 永远以 user_id = ? 起头(走 idx_user_created_at /
// idx_user_folder),LIKE 只在该用户的子集上做。单用户论文 ≤ 几千行毫秒级。
func (h *Handler) List(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	source := strings.TrimSpace(c.Query("source"))
	folder := strings.TrimSpace(c.Query("folder"))
	q := strings.TrimSpace(c.Query("q"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}
	// order 排序方向 —— 仅接受 "asc" / "desc",其他值(包括空)回落到 desc
	order := strings.ToLower(strings.TrimSpace(c.Query("order")))
	if order != "asc" {
		order = "desc"
	}
	// 关键词长度护栏(防超长 / 全字符 % 通配等滥用)
	if r := []rune(q); len(r) > 64 {
		q = string(r[:64])
	}

	db := database.GetDB().Model(&UserLibraryPaper{}).Where("user_id = ?", uid)
	if source != "" {
		if !IsValidSource(source) {
			utils.Error(c, http.StatusBadRequest, "source 取值非法")
			return
		}
		db = db.Where("source = ?", source)
	}
	switch folder {
	case "":
		// 不过滤
	case "root":
		db = db.Where("folder_id IS NULL")
	default:
		fid, err := strconv.ParseUint(folder, 10, 64)
		if err != nil || fid == 0 {
			utils.Error(c, http.StatusBadRequest, "folder 参数非法")
			return
		}
		db = db.Where("folder_id = ?", fid)
	}

	// 模糊搜索 —— 转义 LIKE 通配符(_ % \)防注入,然后 4 字段 OR
	if q != "" {
		like := "%" + escapeLikePattern(q) + "%"
		db = db.Where(
			"title LIKE ? OR abstract LIKE ? OR venue LIKE ? OR doi LIKE ?",
			like, like, like, like,
		)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}

	// id 作 secondary key 保证同 created_at 的稳定相对顺序;方向跟随 order
	orderClause := "created_at DESC, id DESC"
	if order == "asc" {
		orderClause = "created_at ASC, id ASC"
	}

	var items []UserLibraryPaper
	if err := db.
		Order(orderClause).
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&items).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}

	utils.Success(c, ListResponse{Items: items, Total: total})
}

// escapeLikePattern 转义 MySQL LIKE 元字符(% _ \),防止用户输入的 % 被当通配符。
func escapeLikePattern(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

// Add POST /api/v1/user/library
//
// 幂等：同 (user, source, source_paper_id) 已存在则直接返回已有记录。
func (h *Handler) Add(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	var req AddPaperRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误："+err.Error())
		return
	}
	// 此端点仅接受上游 source(stc/olx/pmd);'local' 是后端内部用,
	// 自由文件走 /papers/upload-and-resolve + /confirm-upload-job 流程
	if !IsValidUpstreamSource(req.Source) {
		utils.Error(c, http.StatusBadRequest, "source 取值非法(仅支持 stc/olx/pmd)")
		return
	}
	req.SourcePaperID = strings.TrimSpace(req.SourcePaperID)
	if req.SourcePaperID == "" {
		utils.Error(c, http.StatusBadRequest, "source_paper_id 必填")
		return
	}

	db := database.GetDB()

	// 校验 folder_id(若提供) —— 必须是本人的文件夹
	if req.FolderID != nil {
		if ok := assertOwnedFolder(c, db, uid, *req.FolderID); !ok {
			return
		}
	} else {
		// 没指定就塞默认文件夹(系统级,lazy 创建一次)
		def, err := ensureDefaultFolder(db, uid)
		if err != nil {
			utils.Error(c, http.StatusInternalServerError, "获取默认文件夹失败")
			return
		}
		fid := def.ID
		req.FolderID = &fid
	}

	// 先查是否已存在(幂等);命中时如果 folder_id 不同则随手更新归属
	var existing UserLibraryPaper
	err := db.Where("user_id = ? AND source = ? AND source_paper_id = ?",
		uid, req.Source, req.SourcePaperID).
		First(&existing).Error
	if err == nil {
		if req.FolderID != nil &&
			(existing.FolderID == nil || *existing.FolderID != *req.FolderID) {
			existing.FolderID = req.FolderID
			if err := db.Save(&existing).Error; err != nil {
				utils.Error(c, http.StatusInternalServerError, "更新失败")
				return
			}
		}
		utils.Success(c, existing)
		return
	}
	if err != gorm.ErrRecordNotFound {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}

	// 文献集总条数风控 —— 上限 MaxPapersPerUser
	if atLimit, _, err := enforcePaperLimit(db, uid); err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	} else if atLimit {
		utils.Error(c, http.StatusConflict,
			fmt.Sprintf("文献集已达上限(%d 条),请删除一些不用的论文再试", MaxPapersPerUser))
		return
	}

	row := UserLibraryPaper{
		UserID:               uid,
		FolderID:             req.FolderID,
		Source:               req.Source,
		SourcePaperID:        req.SourcePaperID,
		Title:                strings.TrimSpace(req.Title),
		AuthorsJSON:          req.Authors,
		Year:                 req.Year,
		Venue:                strings.TrimSpace(req.Venue),
		DOI:                  strings.TrimSpace(req.DOI),
		Abstract:             req.Abstract,
		PdfURL:               strings.TrimSpace(req.PdfURL),
		PublicationTypesJSON: req.PublicationTypes,
		CitationCount:        req.CitationCount,
		RawJSON:              req.Raw,
	}
	if err := db.Create(&row).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "保存失败")
		return
	}

	utils.Success(c, row)
}

// Remove DELETE /api/v1/user/library/:source/:paperId
func (h *Handler) Remove(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	source := c.Param("source")
	paperID := c.Param("paperId")
	if !IsValidSource(source) {
		utils.Error(c, http.StatusBadRequest, "source 取值非法")
		return
	}
	if paperID == "" {
		utils.Error(c, http.StatusBadRequest, "paperId 必填")
		return
	}

	res := database.GetDB().
		Where("user_id = ? AND source = ? AND source_paper_id = ?", uid, source, paperID).
		Delete(&UserLibraryPaper{})
	if res.Error != nil {
		utils.Error(c, http.StatusInternalServerError, "删除失败")
		return
	}

	utils.Success(c, gin.H{"deleted": res.RowsAffected})
}

// GetByUpstream GET /api/v1/user/library/by-upstream/:source/:paperId
//
// 详情页场景:用户打开任意论文详情(可能从搜索来 / 从文献集来 / 从外部链接来),
// 想知道"我有没有收藏过 + 我有没有给这条上传过 PDF"。
// 命中返回完整 UserLibraryPaper(含 pdf_* 与 ai_* 等所有列)。
//
// **未收藏不是错误**,返 200 + data:null —— 这是查询型接口,
// "没收藏过"是有效查询结果而不是 404。早期返 404 会让 DevTools 控制台
// 红色高亮一片,虽然前端 catch 已经把 404 当 null 用,但视觉上很噪。
func (h *Handler) GetByUpstream(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	source := c.Param("source")
	paperID := c.Param("paperId")
	if !IsValidSource(source) {
		utils.Error(c, http.StatusBadRequest, "source 取值非法")
		return
	}
	if paperID == "" {
		utils.Error(c, http.StatusBadRequest, "paperId 必填")
		return
	}
	var row UserLibraryPaper
	if err := database.GetDB().
		Where("user_id = ? AND source = ? AND source_paper_id = ?", uid, source, paperID).
		First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			utils.Success(c, nil)
			return
		}
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}
	utils.Success(c, row)
}

// Check POST /api/v1/user/library/check
//
// 列表场景：前端要给每张卡片标"已收藏"红心。一个请求拿一整页结果的状态，
// 避免每张卡片单独发请求。
func (h *Handler) Check(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	var req CheckRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误："+err.Error())
		return
	}
	if !IsValidSource(req.Source) {
		utils.Error(c, http.StatusBadRequest, "source 取值非法")
		return
	}

	saved := make(map[string]bool, len(req.PaperIDs))
	for _, id := range req.PaperIDs {
		saved[id] = false
	}

	if len(req.PaperIDs) == 0 {
		utils.Success(c, CheckResponse{Saved: saved})
		return
	}

	var found []string
	if err := database.GetDB().Model(&UserLibraryPaper{}).
		Where("user_id = ? AND source = ? AND source_paper_id IN ?",
			uid, req.Source, req.PaperIDs).
		Pluck("source_paper_id", &found).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}
	for _, id := range found {
		saved[id] = true
	}

	utils.Success(c, CheckResponse{Saved: saved})
}

// ============================================================================
// Folder CRUD
// ============================================================================

// ListFolders GET /api/v1/user/library/folders
//
// 一次返回:文件夹列表(自带 paper_count) + 全部论文 total_count + 根目录 root_count。
// 文件夹按 (position ASC, id ASC) 排序。
//
// 设计:前端 sidebar 只调一次接口就能把整棵树渲染出来。
func (h *Handler) ListFolders(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	db := database.GetDB()

	// 保证用户至少有"默认文件夹" —— 即使一次都没收藏过,sidebar 也能看到
	if _, err := ensureDefaultFolder(db, uid); err != nil {
		utils.Error(c, http.StatusInternalServerError, "获取默认文件夹失败")
		return
	}

	var folders []UserLibraryFolder
	if err := db.Where("user_id = ?", uid).
		Order("position ASC, id ASC").
		Find(&folders).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}

	// 一次 GROUP BY 拿到 folder_id → count;NULL 单独取
	type countRow struct {
		FolderID *uint64
		Cnt      int64
	}
	var rows []countRow
	if err := db.Raw(`
		SELECT folder_id AS folder_id, COUNT(*) AS cnt
		FROM user_library_papers
		WHERE user_id = ?
		GROUP BY folder_id
	`, uid).Scan(&rows).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}

	countByID := make(map[uint64]int64, len(rows))
	var rootCount, totalCount int64
	for _, r := range rows {
		totalCount += r.Cnt
		if r.FolderID == nil {
			rootCount = r.Cnt
		} else {
			countByID[*r.FolderID] = r.Cnt
		}
	}

	items := make([]FolderListItem, 0, len(folders))
	for _, f := range folders {
		items = append(items, FolderListItem{
			UserLibraryFolder: f,
			PaperCount:        countByID[f.ID],
		})
	}

	utils.Success(c, FolderListResponse{
		Folders:    items,
		TotalCount: totalCount,
		RootCount:  rootCount,
	})
}

// CreateFolder POST /api/v1/user/library/folders
//
// 允许空 body —— 自动取名 "新建文件夹"。文件夹上限 MaxFoldersPerUser。
func (h *Handler) CreateFolder(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	var req CreateFolderRequest
	_ = c.ShouldBindJSON(&req)

	db := database.GetDB()
	var count int64
	if err := db.Model(&UserLibraryFolder{}).Where("user_id = ?", uid).Count(&count).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}
	if count >= MaxFoldersPerUser {
		utils.Error(c, http.StatusConflict,
			fmt.Sprintf("文件夹最多创建 %d 个,请删除一些不用的再试", MaxFoldersPerUser))
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = "新建文件夹"
	}
	if r := []rune(name); len(r) > MaxFolderNameRuneLen {
		name = string(r[:MaxFolderNameRuneLen])
	}
	// 保留字:不允许用户手动建一个叫"默认文件夹"的(系统名)
	if name == DefaultFolderName {
		utils.Error(c, http.StatusBadRequest, "该名称为系统保留,请换一个")
		return
	}

	// 用户级重名校验 —— 同一用户名下不能有同名文件夹
	var dup int64
	if err := db.Model(&UserLibraryFolder{}).
		Where("user_id = ? AND name = ?", uid, name).
		Count(&dup).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}
	if dup > 0 {
		utils.Error(c, http.StatusConflict, "已存在同名文件夹,请换一个名称")
		return
	}

	row := UserLibraryFolder{
		UserID:   uid,
		Name:     name,
		Position: int(count),
	}
	if err := db.Create(&row).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "创建失败")
		return
	}
	utils.Success(c, FolderListItem{UserLibraryFolder: row, PaperCount: 0})
}

// UpdateFolder PATCH /api/v1/user/library/folders/:id
//
// v1 只支持改名(后续要支持拖拽排序的话在这里加 position)。
func (h *Handler) UpdateFolder(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	fid, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var req UpdateFolderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误:"+err.Error())
		return
	}

	db := database.GetDB()
	folder, ok := loadOwnedFolder(c, db, uid, fid)
	if !ok {
		return
	}

	// 系统默认文件夹锁定:不可改名(也不能被改 position 等)
	if folder.IsDefault {
		utils.Error(c, http.StatusBadRequest, "默认文件夹不可修改")
		return
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			utils.Error(c, http.StatusBadRequest, "名称不能为空")
			return
		}
		if r := []rune(name); len(r) > MaxFolderNameRuneLen {
			name = string(r[:MaxFolderNameRuneLen])
		}
		if name == DefaultFolderName {
			utils.Error(c, http.StatusBadRequest, "该名称为系统保留,请换一个")
			return
		}
		// 用户级重名校验 —— 排除自己本身,允许 no-op 重命名(name 没变化也走这里)
		if name != folder.Name {
			var dup int64
			if err := db.Model(&UserLibraryFolder{}).
				Where("user_id = ? AND name = ? AND id <> ?", uid, name, folder.ID).
				Count(&dup).Error; err != nil {
				utils.Error(c, http.StatusInternalServerError, "查询失败")
				return
			}
			if dup > 0 {
				utils.Error(c, http.StatusConflict, "已存在同名文件夹,请换一个名称")
				return
			}
		}
		folder.Name = name
	}

	if err := db.Save(folder).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}
	utils.Success(c, folder)
}

// DeleteFolder DELETE /api/v1/user/library/folders/:id
//
// 策略:**不级联删论文**。文件夹删除后内部论文回退到**默认文件夹**(不是根目录,
// 因为新模型不允许论文放根)。系统默认文件夹本身不可删。
func (h *Handler) DeleteFolder(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	fid, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	db := database.GetDB()
	folder, ok := loadOwnedFolder(c, db, uid, fid)
	if !ok {
		return
	}
	if folder.IsDefault {
		utils.Error(c, http.StatusBadRequest, "默认文件夹不可删除")
		return
	}

	// 子论文回退到默认文件夹(lazy 创建一个)
	def, err := ensureDefaultFolder(db, uid)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "获取默认文件夹失败")
		return
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		// 1) 把该文件夹下论文回退到默认文件夹
		if err := tx.Model(&UserLibraryPaper{}).
			Where("user_id = ? AND folder_id = ?", uid, fid).
			Update("folder_id", def.ID).Error; err != nil {
			return err
		}
		// 2) 删文件夹本体
		return tx.Where("id = ? AND user_id = ?", fid, uid).
			Delete(&UserLibraryFolder{}).Error
	})
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "删除失败")
		return
	}
	utils.Success(c, gin.H{"deleted": true})
}

// MovePaperFolder PATCH /api/v1/user/library/papers/:id/folder
//
// folder_id 为 null 时**自动归到默认文件夹**(不再有根目录概念)。
func (h *Handler) MovePaperFolder(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}
	pid, ok := parseUintParam(c, "id")
	if !ok {
		return
	}

	var req MovePaperRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误:"+err.Error())
		return
	}

	db := database.GetDB()
	// 目标文件夹存在性 & 归属校验;null → 自动默认文件夹
	if req.FolderID != nil {
		if ok := assertOwnedFolder(c, db, uid, *req.FolderID); !ok {
			return
		}
	} else {
		def, err := ensureDefaultFolder(db, uid)
		if err != nil {
			utils.Error(c, http.StatusInternalServerError, "获取默认文件夹失败")
			return
		}
		fid := def.ID
		req.FolderID = &fid
	}

	var paper UserLibraryPaper
	if err := db.Where("id = ? AND user_id = ?", pid, uid).First(&paper).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			utils.Error(c, http.StatusNotFound, "论文不存在")
		} else {
			utils.Error(c, http.StatusInternalServerError, "查询失败")
		}
		return
	}

	paper.FolderID = req.FolderID
	if err := db.Save(&paper).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "更新失败")
		return
	}
	utils.Success(c, paper)
}

// ============================================================================
// 批量操作 —— 文件系统/云盘风格的「多选 + 移动/删除」
// ============================================================================

// BatchMovePapers POST /api/v1/user/library/papers/batch/move
//
// 一次把多篇论文移到目标文件夹(或根目录,folder_id=null)。
// 安全:WHERE id IN ? AND user_id = uid —— 自动过滤掉非本人 / 不存在的 id,
// 不会泄露其他用户的数据。
func (h *Handler) BatchMovePapers(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	var req BatchMoveRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误:"+err.Error())
		return
	}

	db := database.GetDB()

	// 目标文件夹归属校验;null → 自动归到默认文件夹
	if req.FolderID != nil {
		if ok := assertOwnedFolder(c, db, uid, *req.FolderID); !ok {
			return
		}
	} else {
		def, err := ensureDefaultFolder(db, uid)
		if err != nil {
			utils.Error(c, http.StatusInternalServerError, "获取默认文件夹失败")
			return
		}
		fid := def.ID
		req.FolderID = &fid
	}

	// UPDATE ... WHERE id IN ? AND user_id = uid —— GORM 会用 ? 占位预编译,无注入风险
	res := db.Model(&UserLibraryPaper{}).
		Where("user_id = ? AND id IN ?", uid, req.IDs).
		Update("folder_id", req.FolderID)
	if res.Error != nil {
		utils.Error(c, http.StatusInternalServerError, "移动失败")
		return
	}

	utils.Success(c, BatchResult{Affected: res.RowsAffected})
}

// BatchDeletePapers POST /api/v1/user/library/papers/batch/delete
//
// 一次删除多篇论文。同款 user_id 过滤保护。
//
// 防游离 (Tier 1):删 DB 行之前先把这批的 pdf_object_key 收齐;DB delete 成功后
// 异步批量删 MinIO。**先 DB 后 MinIO** —— DB 删失败时连 MinIO 都不动,语义干净;
// MinIO 失败只 warn(下一轮 Tier 3 对账兜底,本次设计先不接 reaper)。
func (h *Handler) BatchDeletePapers(c *gin.Context) {
	uid, ok := getUserID(c)
	if !ok {
		return
	}

	var req BatchDeleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误:"+err.Error())
		return
	}

	db := database.GetDB()

	// 1) 先把要删的行的 pdf_object_key 拉出来 —— 一次 SELECT,
	//    user_id 限定,id IN 条件,顺手保证只删自己的。
	var keys []string
	if err := db.Model(&UserLibraryPaper{}).
		Where("user_id = ? AND id IN ?", uid, req.IDs).
		Where("pdf_object_key <> ''").
		Pluck("pdf_object_key", &keys).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}

	// 2) DB 删
	res := db.Where("user_id = ? AND id IN ?", uid, req.IDs).
		Delete(&UserLibraryPaper{})
	if res.Error != nil {
		utils.Error(c, http.StatusInternalServerError, "删除失败")
		return
	}

	// 3) DB 成功后异步删 MinIO 对象 —— 用户体感是"立刻删了",
	//    实际 MinIO 清理在后台 1-2s 内完成。失败的 key warn 出来,
	//    Tier 2 lifecycle 不覆盖主区,这里失败的对象会持续占用直到
	//    将来 Tier 3 reaper 上线扫到。
	if len(keys) > 0 {
		bucket := storage.PaperPDFBucket()
		go func(ks []string) {
			ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
			defer cancel()
			_ = storage.DeleteObjects(ctx, bucket, ks, func(key string, err error) {
				slog.Warn("library: BatchDeletePapers 清理对象失败",
					"key", key, "err", err)
			})
		}(keys)
	}

	utils.Success(c, BatchResult{Affected: res.RowsAffected})
}

// ============================================================================
// helpers(本地复用)
// ============================================================================

func parseUintParam(c *gin.Context, key string) (uint64, bool) {
	id, err := strconv.ParseUint(c.Param(key), 10, 64)
	if err != nil || id == 0 {
		utils.Error(c, http.StatusBadRequest, key+" 非法")
		return 0, false
	}
	return id, true
}

func loadOwnedFolder(c *gin.Context, db *gorm.DB, uid, fid uint64) (*UserLibraryFolder, bool) {
	var f UserLibraryFolder
	err := db.Where("id = ? AND user_id = ?", fid, uid).First(&f).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		utils.Error(c, http.StatusNotFound, "文件夹不存在")
		return nil, false
	}
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return nil, false
	}
	return &f, true
}

// assertOwnedFolder 仅做归属校验,不返回行
func assertOwnedFolder(c *gin.Context, db *gorm.DB, uid, fid uint64) bool {
	var cnt int64
	if err := db.Model(&UserLibraryFolder{}).
		Where("id = ? AND user_id = ?", fid, uid).
		Count(&cnt).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return false
	}
	if cnt == 0 {
		utils.Error(c, http.StatusNotFound, "文件夹不存在或无权访问")
		return false
	}
	return true
}

// ensureDefaultFolder 返回该用户的"默认文件夹";若尚未创建则 lazy 建一个。
// 新收藏 / 移动论文目标为 null / 删除其他文件夹时论文回退,统一走这个文件夹,
// 不再有"根目录放论文"的概念。
// enforcePaperLimit 检查用户当前收藏总数是否已达 MaxPapersPerUser。
// 已达 → 返回 (true, count, nil),调用方应回 409;否则 (false, count, nil)。
// 查询出错 → (false, 0, err)。
//
// 注意:这是**应用层风险防控**,不带原子性 —— 并发情况下两个新增请求可能都在
// 同一 tick 看到 999 然后各自插一行,结果落 1001。日常用户行为踩不到这种边
// (人不可能 ms 级双开浏览器收藏);真要硬约束需要 DB 触发器,这里成本不值得。
func enforcePaperLimit(db *gorm.DB, uid uint64) (atLimit bool, count int64, err error) {
	if err = db.Model(&UserLibraryPaper{}).Where("user_id = ?", uid).Count(&count).Error; err != nil {
		return false, 0, err
	}
	return count >= MaxPapersPerUser, count, nil
}

func ensureDefaultFolder(db *gorm.DB, uid uint64) (*UserLibraryFolder, error) {
	var f UserLibraryFolder
	err := db.Where("user_id = ? AND is_default = ?", uid, true).First(&f).Error
	if err == nil {
		return &f, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	f = UserLibraryFolder{
		UserID:    uid,
		Name:      DefaultFolderName,
		Position:  -1, // 排在所有手动建的(position 默认 0+)之前
		IsDefault: true,
	}
	if err := db.Create(&f).Error; err != nil {
		// 并发场景:别的请求同一时刻也在 lazy create,再读一次兜底
		var again UserLibraryFolder
		if err2 := db.Where("user_id = ? AND is_default = ?", uid, true).
			First(&again).Error; err2 == nil {
			return &again, nil
		}
		return nil, err
	}
	return &f, nil
}
