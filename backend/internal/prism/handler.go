// ============================================================================
// prism HTTP handler —— 用户端 /api/v1/user/prism/*(UserAuth)。
// 每个接口先按 (projectID, userID) 校验归属,非本人一律当 404。
// ============================================================================

package prism

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"scholar-backend/internal/agentattach"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/usagestat"
	"scholar-backend/internal/vip"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	svc          *Service
	statRecorder usagestat.Recorder      // 功能使用统计录入器(bootstrap 注入;同 peerReview)
	uploader     *agentattach.Uploader   // 输入框附件:上传(bootstrap SetAttach 注入;见 attach.go)
	referencer   *agentattach.Referencer // 输入框附件:引用文献集
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// SetUsageStatRecorder 注入使用统计录入器。仅在 AI 编辑/修复成功产出提案时记一条(prism feature)。
func (h *Handler) SetUsageStatRecorder(r usagestat.Recorder) { h.statRecorder = r }

// SetAttach 注入输入框附件能力(2026-07-14 三 feature 输入框统一;实现在 internal/agentattach)。
// 未注入时对应路由返回 503(见 attach.go)。
func (h *Handler) SetAttach(up *agentattach.Uploader, rf *agentattach.Referencer) {
	h.uploader, h.referencer = up, rf
}

// ownedProject 取 :id 项目并校验归属;失败已写响应,返回 (nil,false)。
func (h *Handler) ownedProject(c *gin.Context) (*Project, uint, bool) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return nil, 0, false
	}
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return nil, 0, false
	}
	p, err := h.svc.GetProject(id, uid)
	if err != nil {
		utils.InternalError(c, 500, "加载项目失败,请稍后重试", err)
		return nil, 0, false
	}
	if p == nil {
		utils.NotFound(c, "项目不存在")
		return nil, 0, false
	}
	return p, uid, true
}

// ownedWritableProject 在 ownedProject 基础上再挡只读项目(旧版 cutover 后冻结 / struct 走专用端点)。
// 旧版编辑面端点(改标题/文件 CRUD/手动保存/AI 轮次/cite)都用它;编译/导出/读取仍用 ownedProject。
func (h *Handler) ownedWritableProject(c *gin.Context) (*Project, uint, bool) {
	p, uid, ok := h.ownedProject(c)
	if !ok {
		return nil, 0, false
	}
	if p.ReadOnly() {
		utils.SafeBadRequest(c, ErrReadOnlyProject)
		return nil, 0, false
	}
	return p, uid, true
}

// CreateProject POST /user/prism/projects {title}
func (h *Handler) CreateProject(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	var req struct {
		Title string `json:"title"`
	}
	_ = c.ShouldBindJSON(&req) // title 可空,服务层兜底
	p, files, err := h.svc.CreateProject(uid, req.Title)
	if err != nil {
		utils.InternalError(c, 500, "创建项目失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"project": p, "files": files})
}

// ListProjects GET /user/prism/projects
func (h *Handler) ListProjects(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	ps, err := h.svc.ListProjects(uid)
	if err != nil {
		utils.InternalError(c, 500, "加载项目列表失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"projects": ps})
}

// UpdateProject PATCH /user/prism/projects/:id {title}  → 改项目标题
func (h *Handler) UpdateProject(c *gin.Context) {
	p, _, ok := h.ownedWritableProject(c)
	if !ok {
		return
	}
	var req struct {
		Title string `json:"title"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	proj, err := h.svc.RenameProject(p, req.Title)
	if err != nil {
		utils.InternalError(c, 500, "重命名失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"project": proj})
}

// DeleteProject DELETE /user/prism/projects/:id  → 删项目 + 全部内容(文件/版本/编译/编辑/对话)
func (h *Handler) DeleteProject(c *gin.Context) {
	p, _, ok := h.ownedProject(c)
	if !ok {
		return
	}
	if err := h.svc.DeleteProject(c.Request.Context(), p); err != nil {
		utils.InternalError(c, 500, "删除失败,请稍后重试", err)
		return
	}
	utils.SuccessWithMessage(c, "已删除", nil)
}

// GetProject GET /user/prism/projects/:id  → 项目 + 文件清单
func (h *Handler) GetProject(c *gin.Context) {
	p, _, ok := h.ownedProject(c)
	if !ok {
		return
	}
	files, err := h.svc.ListFiles(p.ID)
	if err != nil {
		utils.InternalError(c, 500, "加载文件列表失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"project": p, "files": files})
}

// GetFile GET /user/prism/projects/:id/files/:fileId  → 文件 + current 正文
func (h *Handler) GetFile(c *gin.Context) {
	p, _, ok := h.ownedProject(c)
	if !ok {
		return
	}
	fileID, ok := utils.ParseUintParam(c, "fileId")
	if !ok {
		return
	}
	f, body, err := h.svc.GetFileBody(p.ID, fileID)
	if err != nil {
		utils.InternalError(c, 500, "加载文件失败,请稍后重试", err)
		return
	}
	if f == nil {
		utils.NotFound(c, "文件不存在")
		return
	}
	utils.Success(c, gin.H{"file": f, "body": body})
}

// mapFileErr 把文件 CRUD 业务错误翻成友好响应。返回 true=已写响应。
func (h *Handler) mapFileErr(c *gin.Context, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, ErrInvalidPath), errors.Is(err, ErrFileExists), errors.Is(err, ErrCannotDeleteMain):
		utils.SafeBadRequest(c, err)
	case errors.Is(err, ErrFileNotFound):
		utils.NotFound(c, "文件不存在")
	default:
		utils.InternalError(c, 500, "操作失败,请稍后重试", err)
	}
	return true
}

// CreateFile POST /user/prism/projects/:id/files {rel_path}
func (h *Handler) CreateFile(c *gin.Context) {
	p, _, ok := h.ownedWritableProject(c)
	if !ok {
		return
	}
	var req struct {
		RelPath string `json:"rel_path"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	f, err := h.svc.CreateTextFile(p.ID, req.RelPath)
	if h.mapFileErr(c, err) {
		return
	}
	utils.Success(c, gin.H{"file": f})
}

// RenameFile POST /user/prism/projects/:id/files/:fileId/rename {rel_path}
func (h *Handler) RenameFile(c *gin.Context) {
	p, _, ok := h.ownedWritableProject(c)
	if !ok {
		return
	}
	fileID, ok := utils.ParseUintParam(c, "fileId")
	if !ok {
		return
	}
	var req struct {
		RelPath string `json:"rel_path"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	f, err := h.svc.RenameFile(p, fileID, req.RelPath)
	if h.mapFileErr(c, err) {
		return
	}
	utils.Success(c, gin.H{"file": f})
}

// DeleteFile DELETE /user/prism/projects/:id/files/:fileId
func (h *Handler) DeleteFile(c *gin.Context) {
	p, _, ok := h.ownedWritableProject(c)
	if !ok {
		return
	}
	fileID, ok := utils.ParseUintParam(c, "fileId")
	if !ok {
		return
	}
	if h.mapFileErr(c, h.svc.DeleteFile(p, fileID)) {
		return
	}
	utils.SuccessWithMessage(c, "已删除", nil)
}

// SaveFile PUT /user/prism/projects/:id/files/:fileId {body}
func (h *Handler) SaveFile(c *gin.Context) {
	p, _, ok := h.ownedWritableProject(c)
	if !ok {
		return
	}
	fileID, ok := utils.ParseUintParam(c, "fileId")
	if !ok {
		return
	}
	var req struct {
		Body string `json:"body"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	ver, err := h.svc.SaveFile(p.ID, fileID, req.Body)
	if err != nil {
		utils.InternalError(c, 500, "保存失败,请稍后重试", err)
		return
	}
	if ver == nil {
		utils.NotFound(c, "文件不存在")
		return
	}
	utils.Success(c, gin.H{"version": ver})
}

// Compile POST /user/prism/projects/:id/compile {engine?}
func (h *Handler) Compile(c *gin.Context) {
	p, _, ok := h.ownedProject(c)
	if !ok {
		return
	}
	var req struct {
		Engine string `json:"engine"`
	}
	_ = c.ShouldBindJSON(&req)
	cm, err := h.svc.StartCompile(p.ID, p.UserID, p.MainFile, req.Engine)
	if err != nil {
		utils.InternalError(c, 500, "发起编译失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"compile": cm})
}

// GetCompile GET /user/prism/projects/:id/compile/:compileId  → 编译状态
func (h *Handler) GetCompile(c *gin.Context) {
	p, _, ok := h.ownedProject(c)
	if !ok {
		return
	}
	compileID, ok := utils.ParseUintParam(c, "compileId")
	if !ok {
		return
	}
	cm, err := h.svc.GetCompile(p.ID, compileID)
	if err != nil {
		utils.InternalError(c, 500, "查询编译状态失败,请稍后重试", err)
		return
	}
	if cm == nil {
		utils.NotFound(c, "编译记录不存在")
		return
	}
	utils.Success(c, gin.H{"compile": cm})
}

// GetPDF GET /user/prism/projects/:id/pdf  → 流式返回最近成功编译的 PDF
func (h *Handler) GetPDF(c *gin.Context) {
	p, _, ok := h.ownedProject(c)
	if !ok {
		return
	}
	rc, info, err := h.svc.OpenLatestPDF(c.Request.Context(), p.ID)
	if err != nil {
		utils.InternalError(c, 500, "加载 PDF 失败,请稍后重试", err)
		return
	}
	if rc == nil {
		utils.NotFound(c, "尚无编译产物,请先编译")
		return
	}
	defer rc.Close()
	c.Header("Content-Type", "application/pdf")
	// 条件请求(性能审计):同一 URL 的 PDF 字节稳定(前端每次成功编译换 ?v=<version> → 换 URL),用 ETag 做
	// 二次拉取的 304 免重传 —— pdf.js 重渲 / 下载按钮不再整份重拉两遍。保守用 no-cache(每次校验、不 immutable),
	// 避免快速连编时旧字节被浏览器长缓存回放(旧 no-store 的顾虑);MinIO ObjectInfo.ETag 直接复用。
	if info != nil && info.ETag != "" {
		etag := `"` + strings.Trim(info.ETag, `"`) + `"`
		if c.GetHeader("If-None-Match") == etag {
			c.Status(http.StatusNotModified)
			return
		}
		c.Header("ETag", etag)
		c.Header("Cache-Control", "private, no-cache")
	} else {
		c.Header("Cache-Control", "no-store")
	}
	if info != nil && info.Size > 0 {
		c.Header("Content-Length", strconv.FormatInt(info.Size, 10))
	}
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, rc)
}

// ─── AI 编辑 ───────────────────────────────────────────────────────────────

// mapEditErr 把 AI 编辑/cite 的业务错误翻成友好响应;非业务错走 500。返回 true=已写响应。
func (h *Handler) mapEditErr(c *gin.Context, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, vip.ErrQuotaExceeded):
		// 6010/429 + 结构化 quota 载荷:与全站额度信号一致(旧裸 400 会绕过前端 QuotaNotifier)。
		vip.RespondQuotaExceeded(c, err)
	case errors.Is(err, ErrFileNotFound), errors.Is(err, ErrCompileNotFound), errors.Is(err, ErrEditNotFound):
		utils.NotFound(c, "目标不存在")
	case errors.Is(err, ErrCiteNotInLibrary), errors.Is(err, ErrStaleBase):
		utils.SafeBadRequest(c, err)
	default:
		utils.InternalError(c, 500, "AI 操作失败,请稍后重试", err)
	}
	return true
}

// ─── 历史(版本 + 对话)──────────────────────────────────────────────────────

// ListVersions GET /user/prism/projects/:id/files/:fileId/versions  → 版本列表(不含正文)
func (h *Handler) ListVersions(c *gin.Context) {
	p, _, ok := h.ownedProject(c)
	if !ok {
		return
	}
	fileID, ok := utils.ParseUintParam(c, "fileId")
	if !ok {
		return
	}
	vs, err := h.svc.ListVersions(p.ID, fileID)
	if h.mapFileErr(c, err) {
		return
	}
	utils.Success(c, gin.H{"versions": vs})
}

// RestoreVersion POST /user/prism/projects/:id/files/:fileId/versions/:versionId/restore
func (h *Handler) RestoreVersion(c *gin.Context) {
	p, _, ok := h.ownedWritableProject(c)
	if !ok {
		return
	}
	fileID, ok := utils.ParseUintParam(c, "fileId")
	if !ok {
		return
	}
	versionID, ok := utils.ParseUintParam(c, "versionId")
	if !ok {
		return
	}
	ver, err := h.svc.RestoreVersion(p.ID, fileID, versionID)
	if err != nil {
		if errors.Is(err, ErrFileNotFound) || errors.Is(err, ErrEditNotFound) {
			utils.NotFound(c, "版本不存在")
			return
		}
		utils.InternalError(c, 500, "回滚失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"version": ver})
}

// CiteSearch GET /user/prism/projects/:id/cite/search?q=  → 用户文献库候选
func (h *Handler) CiteSearch(c *gin.Context) {
	_, uid, ok := h.ownedProject(c)
	if !ok {
		return
	}
	cands, err := h.svc.SearchCite(uid, c.Query("q"), 20)
	if err != nil {
		utils.InternalError(c, 500, "文献检索失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"candidates": cands})
}

// CiteApply POST /user/prism/projects/:id/cite/apply {library_paper_id}
//   → 把库论文 BibTeX 写进结构体 Bibliography map(projector 据它生成参考文献表),返 cite key 供前端插 [@key]。
// 用 ownedProject(不走 ownedWritableProject 的 ReadOnly 闸 —— struct 项目本就该能引用);legacy 项目冻结不支持。
func (h *Handler) CiteApply(c *gin.Context) {
	p, uid, ok := h.ownedProject(c)
	if !ok {
		return
	}
	if p.SchemaVersion != SchemaStruct {
		utils.SafeBadRequest(c, ErrReadOnlyProject)
		return
	}
	var req struct {
		LibraryPaperID uint `json:"library_paper_id"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	key, err := h.svc.ApplyStructCite(p.ID, uid, req.LibraryPaperID)
	if h.mapEditErr(c, err) {
		return
	}
	utils.Success(c, gin.H{"cite_key": key})
}
