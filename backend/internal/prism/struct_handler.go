// ============================================================================
// struct 轨 HTTP handler —— 结构体读写 + 模板列表(新版工作台用)。
//   见 REPORT.md Part III §5.2。struct 端点只服务 schema_version=struct 项目。
// ============================================================================

package prism

import (
	"encoding/json"
	"errors"
	"io"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// ownedStructProject 取项目 + 校验归属 + 要求是 struct 轨(旧版项目用旧端点)。
// 注:不走 ownedWritableProject —— struct 项目恒可经 struct 端点编辑(ReadOnly() 对 struct 恒 true 是
// 「禁旧版编辑面」之意,不是禁 struct 编辑)。
func (h *Handler) ownedStructProject(c *gin.Context) (*Project, uint, bool) {
	p, uid, ok := h.ownedProject(c)
	if !ok {
		return nil, 0, false
	}
	if p.SchemaVersion != SchemaStruct {
		utils.SafeBadRequest(c, ErrNotStructProject)
		return nil, 0, false
	}
	return p, uid, true
}

// GetStruct GET /user/prism/projects/:id/struct → 当前结构体真源(struct 轨)。
func (h *Handler) GetStruct(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	js, err := h.svc.GetStruct(p.ID)
	if err != nil {
		utils.InternalError(c, 500, "加载文档失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"struct": json.RawMessage(js)})
}

// SaveStruct PUT /user/prism/projects/:id/struct {struct} → 保存结构体 + 投影编译。
func (h *Handler) SaveStruct(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	var req struct {
		Struct json.RawMessage `json:"struct"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	if len(req.Struct) == 0 {
		utils.SafeBadRequest(c, ErrNotStructProject)
		return
	}
	d, err := h.svc.SaveStruct(p.ID, string(req.Struct), AuthorUser)
	if err != nil {
		utils.InternalError(c, 500, "保存文档失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"struct": d, "conformance": Conformance(d)})
}

// ListStructVersions GET /user/prism/projects/:id/struct/versions → 结构体版本历史(不含正文)。
func (h *Handler) ListStructVersions(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	vs, err := h.svc.ListStructVersions(p.ID)
	if err != nil {
		utils.InternalError(c, 500, "加载历史版本失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"versions": vs})
}

// RestoreStructVersion POST /user/prism/projects/:id/struct/versions/:versionId/restore
// → 把该历史版本恢复为当前(追加成新版本,历史不改)+ 重投影。
func (h *Handler) RestoreStructVersion(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	versionID, ok := utils.ParseUintParam(c, "versionId")
	if !ok {
		return
	}
	d, err := h.svc.RestoreStructVersion(p.ID, versionID)
	if err != nil {
		utils.InternalError(c, 500, "恢复历史版本失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"struct": d, "conformance": Conformance(d)})
}

// SetJournalTemplate POST /user/prism/projects/:id/template {template} → 确定性换刊(非 LLM 重写)。
func (h *Handler) SetJournalTemplate(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	var req struct {
		Template string `json:"template"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}
	d, err := h.svc.SetJournalTemplate(p.ID, req.Template)
	if err != nil {
		utils.InternalError(c, 500, "切换模板失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"struct": d, "conformance": Conformance(d)})
}

// GetConformance GET /user/prism/projects/:id/conformance → 目标模板必填前置信息缺失检查。
func (h *Handler) GetConformance(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	r, err := h.svc.StructConformance(p.ID)
	if err != nil {
		utils.InternalError(c, 500, "合规检查失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"conformance": r})
}

// CloneToStruct POST /user/prism/projects/:id/clone-to-struct → 从旧项目新建 struct 项目(逃生口)。
// 源项目可为 legacy(只读)—— 克隆是「读源 + 建新」,不改源,故用 ownedProject 而非 writable。
func (h *Handler) CloneToStruct(c *gin.Context) {
	p, uid, ok := h.ownedProject(c)
	if !ok {
		return
	}
	np, err := h.svc.CloneToStruct(uid, p.ID)
	if err != nil {
		if errors.Is(err, ErrProjectNotFound) {
			utils.NotFound(c, "项目不存在")
			return
		}
		utils.InternalError(c, 500, "创建新版项目失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"project": np})
}

// ExportDocx GET /user/prism/projects/:id/export/docx → struct → Pandoc → .docx 下载(struct 轨专属)。
func (h *Handler) ExportDocx(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	data, err := h.svc.ExportDocx(c.Request.Context(), p.ID)
	if err != nil {
		utils.InternalError(c, 500, "导出 Word 失败,请稍后重试", err)
		return
	}
	const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	c.Header("Content-Disposition", "attachment; filename=document.docx")
	c.Data(200, mime, data)
}

// UploadAsset POST /user/prism/projects/:id/assets (multipart "file") → 上传图片 + 末尾插 figure 块。
func (h *Handler) UploadAsset(c *gin.Context) {
	p, _, ok := h.ownedStructProject(c)
	if !ok {
		return
	}
	fh, err := c.FormFile("file")
	if err != nil {
		utils.SafeBadRequest(c, errors.New("缺少上传文件"))
		return
	}
	if fh.Size > 8*1024*1024 { // 8MB(全局 BodyLimit 10MB 之下)
		utils.SafeBadRequest(c, errors.New("图片过大(≤ 8MB)"))
		return
	}
	src, err := fh.Open()
	if err != nil {
		utils.InternalError(c, 500, "读取上传失败,请稍后重试", err)
		return
	}
	defer src.Close()
	data, err := io.ReadAll(src)
	if err != nil {
		utils.InternalError(c, 500, "读取上传失败,请稍后重试", err)
		return
	}
	mime := fh.Header.Get("Content-Type")
	if mime == "" {
		mime = "application/octet-stream"
	}
	d, err := h.svc.UploadAsset(c.Request.Context(), p.ID, fh.Filename, data, mime)
	if err != nil {
		if errors.Is(err, ErrInvalidPath) {
			utils.SafeBadRequest(c, errors.New("仅支持 png / jpg / pdf 图片"))
			return
		}
		utils.InternalError(c, 500, "上传失败,请稍后重试", err)
		return
	}
	utils.Success(c, gin.H{"struct": d})
}

// ListTemplates GET /user/prism/templates → 模板选择器元数据(struct 轨「投到哪个期刊」)。
func (h *Handler) ListTemplates(c *gin.Context) {
	utils.Success(c, gin.H{"templates": ListTemplateMeta()})
}
