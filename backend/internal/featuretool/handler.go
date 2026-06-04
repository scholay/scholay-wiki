// ============================================================================
// 功能广场 —— HTTP Handler (Gin)
//
// 公开:  GET /tools, GET /tools/categories, GET /tools/:idOrSlug
// 后台:  /admin/tools CRUD + /import + /import-jobs + /webhooks
// ============================================================================

package featuretool

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"path"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
)

type Handler struct {
	svc  *Service
	disp *Dispatcher
}

func NewHandler(svc *Service, disp *Dispatcher) *Handler {
	return &Handler{svc: svc, disp: disp}
}

// ── 公开端 ───────────────────────────────────────────────────────────────────

func parseListFilter(c *gin.Context) ListFilter {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "24"))
	f := ListFilter{
		Category:   c.Query("category"),
		AccessType: c.Query("access_type"),
		PriceType:  c.Query("price_type"),
		OpenSource: c.Query("open_source"),
		Keyword:    c.Query("q"),
		Page:       page,
		PageSize:   pageSize,
		SortBy:     c.Query("sort_by"),
		SortOrder:  c.Query("sort_order"),
	}
	return f
}

// PublicList GET /api/v1/tools
func (h *Handler) PublicList(c *gin.Context) {
	f := parseListFilter(c)
	f.Status = "published"
	items, total, err := h.svc.List(f)
	if err != nil {
		utils.InternalError(c, 5000, "获取工具列表失败", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": total, "page": maxInt(f.Page, 1)})
}

// PublicCategories GET /api/v1/tools/categories
func (h *Handler) PublicCategories(c *gin.Context) {
	cats, total, err := h.svc.CategoryCounts("published")
	if err != nil {
		utils.InternalError(c, 5000, "获取分类失败", err)
		return
	}
	utils.Success(c, gin.H{"categories": cats, "total": total})
}

// PublicGet GET /api/v1/tools/:idOrSlug
func (h *Handler) PublicGet(c *gin.Context) {
	t, err := h.svc.GetPublic(c.Param("idOrSlug"))
	if err == ErrNotFound {
		utils.NotFound(c, "工具不存在")
		return
	}
	if err != nil {
		utils.InternalError(c, 5000, "获取工具详情失败", err)
		return
	}
	utils.Success(c, t)
}

// ── 后台:工具 CRUD ──────────────────────────────────────────────────────────

// AdminList GET /api/v1/admin/tools
func (h *Handler) AdminList(c *gin.Context) {
	f := parseListFilter(c)
	f.Status = c.Query("status") // admin 可按 status 过滤; 空=全部
	if f.PageSize == 24 {
		f.PageSize = 20
	}
	items, total, err := h.svc.List(f)
	if err != nil {
		utils.InternalError(c, 5000, "获取工具列表失败", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": total, "page": maxInt(f.Page, 1), "page_size": f.PageSize})
}

// AdminCategories GET /api/v1/admin/tools/categories
func (h *Handler) AdminCategories(c *gin.Context) {
	cats, total, err := h.svc.CategoryCounts("")
	if err != nil {
		utils.InternalError(c, 5000, "获取分类失败", err)
		return
	}
	utils.Success(c, gin.H{"categories": cats, "total": total})
}

// AdminGet GET /api/v1/admin/tools/:id
func (h *Handler) AdminGet(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	t, err := h.svc.GetByID(uint64(id))
	if err == ErrNotFound {
		utils.NotFound(c, "工具不存在")
		return
	}
	if err != nil {
		utils.InternalError(c, 5000, "获取工具失败", err)
		return
	}
	utils.Success(c, t)
}

// AdminCreate POST /api/v1/admin/tools
func (h *Handler) AdminCreate(c *gin.Context) {
	var t Tool
	if !utils.BindJSON(c, &t) {
		return
	}
	adminID := adminIDPtr(c)
	created, err := h.svc.Create(&t, adminID)
	if err == ErrNameEmpty {
		utils.BadRequest(c, "工具名称不能为空")
		return
	}
	if err != nil {
		utils.InternalError(c, 5000, "创建工具失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已创建", created)
}

// AdminUpdate PUT /api/v1/admin/tools/:id
func (h *Handler) AdminUpdate(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	var t Tool
	if !utils.BindJSON(c, &t) {
		return
	}
	updated, err := h.svc.Update(uint64(id), &t)
	if err == ErrNotFound {
		utils.NotFound(c, "工具不存在")
		return
	}
	if err == ErrNameEmpty {
		utils.BadRequest(c, "工具名称不能为空")
		return
	}
	if err != nil {
		utils.InternalError(c, 5000, "更新工具失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已更新", updated)
}

// AdminDelete DELETE /api/v1/admin/tools/:id
func (h *Handler) AdminDelete(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	if err := h.svc.Delete(uint64(id)); err == ErrNotFound {
		utils.NotFound(c, "工具不存在")
		return
	} else if err != nil {
		utils.InternalError(c, 5000, "删除工具失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已删除", nil)
}

// ── 后台:批量导入 + 任务 ────────────────────────────────────────────────────

type importReq struct {
	Items    []json.RawMessage `json:"items"`
	Notify   *bool             `json:"notify"`
	Source   string            `json:"source"`
	Filename string            `json:"filename"`
}

// AdminImport POST /api/v1/admin/tools/import
func (h *Handler) AdminImport(c *gin.Context) {
	var req importReq
	if !utils.BindJSON(c, &req) {
		return
	}
	if len(req.Items) == 0 {
		utils.BadRequest(c, "导入数据为空")
		return
	}
	if len(req.Items) > 5000 {
		utils.BadRequest(c, "单次导入不能超过 5000 条")
		return
	}
	notify := true
	if req.Notify != nil {
		notify = *req.Notify
	}
	job, err := h.svc.StartImport(ImportInput{
		Items:    req.Items,
		Notify:   notify,
		Source:   req.Source,
		Filename: req.Filename,
		AdminID:  adminIDPtr(c),
	})
	if err != nil {
		utils.InternalError(c, 5000, "创建导入任务失败", err)
		return
	}
	utils.SuccessWithMessage(c, "导入任务已创建", job)
}

// AdminImportZip POST /api/v1/admin/tools/import-zip
// multipart 上传一个 zip, 解出里面所有 .json (数组或单对象), 合并成 items 后走同一套导入任务。
// 表单字段: file (zip), notify ("1"/"true" 时通知下游)。
func (h *Handler) AdminImportZip(c *gin.Context) {
	fh, err := c.FormFile("file")
	if err != nil {
		utils.BadRequest(c, "缺少上传文件 file")
		return
	}
	f, err := fh.Open()
	if err != nil {
		utils.InternalError(c, 5000, "打开上传文件失败", err)
		return
	}
	defer f.Close()
	buf, err := io.ReadAll(f)
	if err != nil {
		utils.InternalError(c, 5000, "读取上传文件失败", err)
		return
	}
	zr, err := zip.NewReader(bytes.NewReader(buf), int64(len(buf)))
	if err != nil {
		utils.BadRequest(c, "不是有效的 zip 文件")
		return
	}

	var items []json.RawMessage
	images := map[string]imageEntry{} // 文件名(去扩展名)= slug → 图片
	for _, ze := range zr.File {
		if ze.FileInfo().IsDir() {
			continue
		}
		base := strings.ToLower(path.Base(ze.Name))
		ext := strings.ToLower(path.Ext(base))
		stem := strings.TrimSuffix(base, ext)
		switch {
		case ext == ".json":
			// 跳过清单/元数据文件, 避免把 index.json / _categories.json 当工具导入
			if base == "index.json" || strings.HasPrefix(base, "_") {
				continue
			}
			rc, err := ze.Open()
			if err != nil {
				continue
			}
			content, _ := io.ReadAll(io.LimitReader(rc, 8<<20))
			rc.Close()
			content = bytes.TrimSpace(content)
			if len(content) == 0 {
				continue
			}
			switch content[0] {
			case '[':
				var arr []json.RawMessage
				if json.Unmarshal(content, &arr) == nil {
					items = append(items, arr...)
				}
			case '{':
				items = append(items, json.RawMessage(content))
			}
		case isImageExt(ext):
			rc, err := ze.Open()
			if err != nil {
				continue
			}
			data, _ := io.ReadAll(io.LimitReader(rc, 2<<20))
			rc.Close()
			if len(data) > 0 {
				images[stem] = imageEntry{data: data, contentType: contentTypeForExt(ext)}
			}
		}
	}

	if len(items) == 0 {
		utils.BadRequest(c, "zip 里没有可导入的 JSON 工具数据")
		return
	}
	if len(items) > 5000 {
		utils.BadRequest(c, "单次导入不能超过 5000 条")
		return
	}

	// 把 zip 里的图片上传到 MinIO, 并把每条工具的 logo 改成稳定 URL
	// (storage 不可用时 logoBySlug 为空 → logo 留空 → 前端首字母 SVG 兜底)。
	logoBySlug := uploadLogos(c.Request.Context(), images)
	items = rewriteLogos(items, logoBySlug)
	notify := c.PostForm("notify") == "1" || c.PostForm("notify") == "true"
	job, err := h.svc.StartImport(ImportInput{
		Items:    items,
		Notify:   notify,
		Source:   "zip",
		Filename: fh.Filename,
		AdminID:  adminIDPtr(c),
	})
	if err != nil {
		utils.InternalError(c, 5000, "创建导入任务失败", err)
		return
	}
	utils.SuccessWithMessage(c, "导入任务已创建", job)
}

// AdminListJobs GET /api/v1/admin/tools/import-jobs
func (h *Handler) AdminListJobs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	items, total, err := h.svc.ListJobs(page, pageSize)
	if err != nil {
		utils.InternalError(c, 5000, "获取任务列表失败", err)
		return
	}
	utils.Success(c, gin.H{"items": items, "total": total, "page": maxInt(page, 1)})
}

// AdminGetJob GET /api/v1/admin/tools/import-jobs/:id
func (h *Handler) AdminGetJob(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	j, err := h.svc.GetJob(uint64(id))
	if err != nil {
		utils.NotFound(c, "任务不存在")
		return
	}
	utils.Success(c, j)
}

// ── 后台:Webhook ────────────────────────────────────────────────────────────

func (h *Handler) AdminListWebhooks(c *gin.Context) {
	items, err := h.svc.ListWebhooks()
	if err != nil {
		utils.InternalError(c, 5000, "获取 webhook 失败", err)
		return
	}
	utils.Success(c, gin.H{"items": items})
}

type webhookReq struct {
	Name    string   `json:"name"`
	URL     string   `json:"url"`
	Secret  string   `json:"secret"`
	Events  []string `json:"events"`
	Enabled *bool    `json:"enabled"`
}

func (h *Handler) AdminCreateWebhook(c *gin.Context) {
	var req webhookReq
	if !utils.BindJSON(c, &req) {
		return
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.URL) == "" {
		utils.BadRequest(c, "名称和 URL 必填")
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	w := &Webhook{
		Name:      req.Name,
		URL:       req.URL,
		Secret:    req.Secret,
		Events:    req.Events,
		Enabled:   enabled,
		CreatedBy: adminIDPtr(c),
	}
	if err := h.svc.CreateWebhook(w); err != nil {
		utils.InternalError(c, 5000, "创建 webhook 失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已创建", w)
}

func (h *Handler) AdminUpdateWebhook(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	w, err := h.svc.GetWebhook(uint64(id))
	if err != nil {
		utils.NotFound(c, "webhook 不存在")
		return
	}
	var req webhookReq
	if !utils.BindJSON(c, &req) {
		return
	}
	if req.Name != "" {
		w.Name = req.Name
	}
	if req.URL != "" {
		w.URL = req.URL
	}
	w.Secret = req.Secret
	w.Events = req.Events
	if req.Enabled != nil {
		w.Enabled = *req.Enabled
	}
	if err := h.svc.SaveWebhook(w); err != nil {
		utils.InternalError(c, 5000, "更新 webhook 失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已更新", w)
}

func (h *Handler) AdminDeleteWebhook(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	if err := h.svc.DeleteWebhook(uint64(id)); err != nil {
		utils.InternalError(c, 5000, "删除 webhook 失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已删除", nil)
}

// AdminTestWebhook POST /api/v1/admin/tools/webhooks/:id/test
func (h *Handler) AdminTestWebhook(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	status, body, err := h.svc.TestWebhook(uint64(id))
	if err != nil {
		utils.ErrorWithData(c, 5000, "投递失败: "+err.Error(), gin.H{"http_status": 0})
		return
	}
	utils.SuccessWithMessage(c, "已投递", gin.H{"http_status": status, "response": body})
}

// AdminWebhookDeliveries GET /api/v1/admin/tools/webhooks/:id/deliveries
func (h *Handler) AdminWebhookDeliveries(c *gin.Context) {
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	items, err := h.svc.ListDeliveries(uint64(id), limit)
	if err != nil {
		utils.InternalError(c, 5000, "获取投递记录失败", err)
		return
	}
	utils.Success(c, gin.H{"items": items})
}

// ── 小工具 ───────────────────────────────────────────────────────────────────

func adminIDPtr(c *gin.Context) *uint {
	if uid, ok := utils.GetUserID(c); ok {
		return &uid
	}
	return nil
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
