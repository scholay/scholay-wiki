// ============================================================================
// Scholay 文献集 Handler
// ----------------------------------------------------------------------------
// 把 model / repository / service 三层合并到 handler 里写：这个模块表面积
// 极小（CRUD + 一个批量 check），分层只会增加文件数不增加价值。
// 等出现复杂业务逻辑（多文件夹/标签/PDF 上传…）再拆。
// ============================================================================

package library

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"scholar-backend/internal/common/ctxutil"
	"scholar-backend/internal/common/database"
	"scholar-backend/internal/common/middleware"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/minicod"
	"scholar-backend/internal/storage"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Deps 库 handler 依赖的外部域 —— 仅"上传 PDF 智能识别"流程会用到。
// Minicod 在 bootstrap 里由 aiBundle 注入;为 nil 时智能上传相关端点
// 会优雅地返回 503(其余 library CRUD 不受影响)。
//
// 历史上还有一个 AI *ai.Service(PDF 全文 LLM 抽取),已下线 —— 上传解析只走
// pdfparse(标题/DOI/摘要文本),不调大模型。
type Deps struct {
	Minicod *minicod.Manager // 三源论文搜索
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

		// 用户上传 PDF —— 文件本体存 MinIO,这里 backend 转发 + 鉴权。
		// UploadLimitMiddleware:chunked 请求 ContentLength=-1 会绕过 handler 内的
		// 预检,由 MaxBytesReader 在读取层硬限 + 统一 7001 业务码(与 claw/feedback 一致)。
		lib.POST("/papers/:id/pdf",
			middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.UploadPDF)
		lib.GET("/papers/:id/pdf", h.DownloadPDF)
		lib.DELETE("/papers/:id/pdf", h.DeletePDF)

		// 上传 PDF 智能识别 —— SSE 解析 + 确认两段式
		lib.POST("/papers/upload-and-resolve",
			middleware.UploadLimitMiddleware(middleware.UploadMaxBodySize), h.UploadAndResolve)
		lib.POST("/papers/confirm-upload-job", h.ConfirmUploadJob)

		// 关联(后期关联) —— 自由文件 / 任何已收藏行 → 切到上游论文(含合并)
		lib.POST("/papers/:id/relink-search", h.RelinkSearch)
		lib.POST("/papers/:id/relink", h.Relink)
		lib.DELETE("/papers/:id/unlink", h.Unlink)

		// 批量(文件系统/云盘风格)
		lib.POST("/papers/batch/move", h.BatchMovePapers)
		lib.POST("/papers/batch/delete", h.BatchDeletePapers)

		// 分享(网盘式:链接 + 提取码 + 过期 + 转存 + 访问追踪)。
		// owner 管理在此(登录);收件人公开获取在 /api/v1/public/share/:token;转存需登录。
		lib.POST("/shares", h.CreateShare)
		lib.GET("/shares", h.ListShares)
		lib.DELETE("/shares/:id", h.RevokeShare)
		lib.GET("/shares/:id/access", h.ShareAccess)
		lib.POST("/shares/:token/save", h.SaveShare)

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
//	q      : 关键词模糊搜索(title / abstract / venue / doi + og_* 同名四列,
//	         覆盖用户编辑过的 og 真值与自由文件)非空时附加 OR LIKE 过滤;不传跳过
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

	// 模糊搜索 —— 转义 LIKE 通配符(_ % \)防注入,元数据 4 列 + og_* 4 列 OR
	// (og 是用户侧真值,自由文件/用户编辑过的行内容都在 og_* 里,不搜会漏)
	if q != "" {
		like := "%" + escapeLikePattern(q) + "%"
		db = db.Where(
			"title LIKE ? OR abstract LIKE ? OR venue LIKE ? OR doi LIKE ?"+
				" OR og_title LIKE ? OR og_abstract LIKE ? OR og_venue LIKE ? OR og_doi LIKE ?",
			like, like, like, like, like, like, like, like,
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
		// raw_json 是 json:"-" 的完整上游对象(每行多 KB)，列表视图永不序列化它，
		// SELECT 进来纯属浪费带宽与 GC；详情端点才需要完整对象。
		Omit("raw_json").
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

	// 先查是否已存在(幂等)。命中时**不改动已有归属** —— 旧实现会把行静默搬到
	// 新文件夹(用户在别处再点一次收藏,已归档的论文就被挪走且 toast 谎报"已加入");
	// 移动归属是显式操作(MovePaperFolder / 批量移动),收藏端点不做隐式搬家。
	var existing UserLibraryPaper
	err := db.Where("user_id = ? AND source = ? AND source_paper_id = ?",
		uid, req.Source, req.SourcePaperID).
		First(&existing).Error
	if err == nil {
		respondAddExisting(c, &existing)
		return
	}
	if err != gorm.ErrRecordNotFound {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
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
	// 文献集总条数风控 —— 上限 MaxPapersPerUser(原子:锁用户区间 → 计数 → 插入)
	if err := insertPaperAtomic(db, &row); err != nil {
		if errors.Is(err, errPaperLimit) {
			utils.ErrorResponse(c, http.StatusConflict,
				fmt.Sprintf("文献集已达上限(%d 条),请删除一些不用的论文再试", MaxPapersPerUser))
			return
		}
		// 并发双击/双端同时收藏:两个请求都过了"先查",后者撞唯一键 —— 幂等回落到
		// 已有行(旧实现回 500"保存失败",用户视角是收藏失败,实际已收藏)。
		if isDuplicateKey(err) {
			var again UserLibraryPaper
			if err2 := db.Where("user_id = ? AND source = ? AND source_paper_id = ?",
				uid, req.Source, req.SourcePaperID).First(&again).Error; err2 == nil {
				respondAddExisting(c, &again)
				return
			}
		}
		utils.InternalError(c, http.StatusInternalServerError, "保存失败", err)
		return
	}

	utils.Success(c, row)
}

// respondAddExisting 幂等命中已有收藏行时的统一响应:返回已有行原样字段 +
// already_existed 标志,前端据此把 toast 从"已加入"改成"已在文献集中"。
// (字段平铺在 data 顶层,与新建分支返回 UserLibraryPaper 的形状兼容。)
func respondAddExisting(c *gin.Context, row *UserLibraryPaper) {
	b, err := json.Marshal(row)
	if err != nil {
		utils.Success(c, row)
		return
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		utils.Success(c, row)
		return
	}
	m["already_existed"] = true
	utils.Success(c, m)
}

// Remove DELETE /api/v1/user/library/:source/:paperId
//
// 防游离(与 BatchDeletePapers 对齐):删 DB 行之前先收集 pdf_object_key;
// DB 删成功后异步删 MinIO 对象,失败只 warn,不阻塞行删除。
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

	db := database.GetDB()

	// 1) 先把待删行的 pdf_object_key 拉出来(唯一键定位,至多一行)
	var keys []string
	if err := db.Model(&UserLibraryPaper{}).
		Where("user_id = ? AND source = ? AND source_paper_id = ?", uid, source, paperID).
		Where("pdf_object_key <> ''").
		Pluck("pdf_object_key", &keys).Error; err != nil {
		utils.Error(c, http.StatusInternalServerError, "查询失败")
		return
	}

	// 2) DB 删
	res := db.
		Where("user_id = ? AND source = ? AND source_paper_id = ?", uid, source, paperID).
		Delete(&UserLibraryPaper{})
	if res.Error != nil {
		utils.Error(c, http.StatusInternalServerError, "删除失败")
		return
	}

	// 3) DB 成功后异步删 MinIO 对象 —— 失败只 warn(同批删的容错风格)
	if len(keys) > 0 {
		bucket := storage.PaperPDFBucket()
		ks := keys
		safego.Go("library-remove-pdf-cleanup", func() {
			ctx, cancel := ctxutil.With(ctxutil.NormalIO)
			defer cancel()
			_ = storage.DeleteObjects(ctx, bucket, ks, func(key string, err error) {
				slog.Warn("library: Remove 清理对象失败",
					"key", key, "err", err)
			})
		})
	}

	utils.Success(c, gin.H{"deleted": res.RowsAffected})
}

// GetByUpstream GET /api/v1/user/library/by-upstream/:source/:paperId
//
// 详情页场景:用户打开任意论文详情(可能从搜索来 / 从文献集来 / 从外部链接来),
// 想知道"我有没有收藏过 + 我有没有给这条上传过 PDF"。
// 命中返回完整 UserLibraryPaper(含 pdf_* 与 og_* 等所有列)。
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

	for id := range h.CheckFavorites(uid, req.Source, req.PaperIDs) {
		saved[id] = true
	}

	utils.Success(c, CheckResponse{Saved: saved})
}

// CheckFavorites 批量查「这些 (source, source_paper_id) 是否在该用户文献集」,返回已收藏 id 集合。
// 同时实现 minicod.FavoriteChecker —— 让搜索结果可在服务端直接标注 isFavorited(省一次 /library/check)。
// source 非法或入参为空时返回空集合,不报错(供调用方安全降级)。
func (h *Handler) CheckFavorites(userID uint64, source string, ids []string) map[string]bool {
	out := make(map[string]bool)
	if userID == 0 || len(ids) == 0 || !IsValidSource(source) {
		return out
	}
	var found []string
	if err := database.GetDB().Model(&UserLibraryPaper{}).
		Where("user_id = ? AND source = ? AND source_paper_id IN ?", userID, source, ids).
		Pluck("source_paper_id", &found).Error; err != nil {
		return out
	}
	for _, id := range found {
		out[id] = true
	}
	return out
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

	// 上限 + 重名校验 + 插入放同一事务,FOR UPDATE 锁该用户的文件夹区间 ——
	// 与 insertPaperAtomic 同款写法。旧实现 Count→Create 两步非原子,并发双击
	// "新建文件夹"可产生同名文件夹/小幅越限(user_library_folders 无 (user_id,name)
	// 唯一索引,应用层是唯一防线,必须原子)。
	var row UserLibraryFolder
	err := database.GetDB().Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Raw(
			"SELECT COUNT(*) FROM user_library_folders WHERE user_id = ? FOR UPDATE", uid,
		).Row().Scan(&count); err != nil {
			return err
		}
		if count >= MaxFoldersPerUser {
			return errFolderLimit
		}
		var dup int64
		if err := tx.Model(&UserLibraryFolder{}).
			Where("user_id = ? AND name = ?", uid, name).
			Count(&dup).Error; err != nil {
			return err
		}
		if dup > 0 {
			return errFolderDupName
		}
		row = UserLibraryFolder{
			UserID:   uid,
			Name:     name,
			Position: int(count),
		}
		return tx.Create(&row).Error
	})
	if err != nil {
		switch {
		case errors.Is(err, errFolderLimit):
			utils.ErrorResponse(c, http.StatusConflict,
				fmt.Sprintf("文件夹最多创建 %d 个,请删除一些不用的再试", MaxFoldersPerUser))
		case errors.Is(err, errFolderDupName):
			utils.ErrorResponse(c, http.StatusConflict, "已存在同名文件夹,请换一个名称")
		default:
			utils.InternalError(c, http.StatusInternalServerError, "创建失败", err)
		}
		return
	}
	utils.Success(c, FolderListItem{UserLibraryFolder: row, PaperCount: 0})
}

// 文件夹创建的哨兵错误(事务内识别,handler 层映射 HTTP 状态)
var (
	errFolderLimit   = errors.New("library: folder limit reached")
	errFolderDupName = errors.New("library: duplicate folder name")
)

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
				utils.ErrorResponse(c, http.StatusConflict, "已存在同名文件夹,请换一个名称")
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
	//    Tier 2 lifecycle 不覆盖主区(papers/),这里失败的对象由
	//    common/cleanup 的 orphan pdf reaper(每天 05:00 扫 DB 已无引用者)兜底回收。
	if len(keys) > 0 {
		bucket := storage.PaperPDFBucket()
		ks := keys
		safego.Go("library-batch-delete-pdfs", func() {
			ctx, cancel := ctxutil.With(ctxutil.NormalIO)
			defer cancel()
			_ = storage.DeleteObjects(ctx, bucket, ks, func(key string, err error) {
				slog.Warn("library: BatchDeletePapers 清理对象失败",
					"key", key, "err", err)
			})
		})
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
// errPaperLimit 是"文献集已达条数上限"的哨兵错误,调用方据此回 409。
var errPaperLimit = errors.New("library: paper limit reached")

// insertPaperAtomic 在一个事务里"锁定该用户的收藏区间 → 计数 → 插入",让条数风控原子化,
// 杜绝并发新增越过 MaxPapersPerUser(取代旧的非原子"先 Count 再 Create"两步 —— 那种写法
// 下两个并发请求可能都看到 999 各插一行落到 1001)。
//
// SELECT COUNT(*) ... WHERE user_id=? FOR UPDATE 对该用户在索引上的记录区间加 next-key 锁
// (含 gap lock:即便当前 0 条,也锁住"该 user_id 将要落行的间隙"),同一用户的并发插入
// 在本事务 COMMIT 前阻塞串行;计数与插入之间不再有可乘之机。锁只覆盖单用户区间、事务体
// 只有 count+create 两步,持锁极短,不会与其他用户互相阻塞。
//
// 撞上限返回 errPaperLimit(事务回滚,什么都没插);其它错误原样上抛。
func insertPaperAtomic(db *gorm.DB, paper *UserLibraryPaper) error {
	return db.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Raw(
			"SELECT COUNT(*) FROM user_library_papers WHERE user_id = ? FOR UPDATE",
			paper.UserID,
		).Row().Scan(&count); err != nil {
			return err
		}
		if count >= MaxPapersPerUser {
			return errPaperLimit
		}
		return tx.Create(paper).Error
	})
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
