// ============================================================================
// promptregistry/handler — admin HTTP API
//
// 路由 (全部挂在 /admin/feature-prompts 下, AdminAuthMiddleware 已保护):
//
//   GET    /admin/feature-prompts                     列表 (可 ?feature_key= 过滤)
//   GET    /admin/feature-prompts/:id                 详情
//   POST   /admin/feature-prompts                     新建 (运营加变体)
//   PUT    /admin/feature-prompts/:id                 编辑
//   POST   /admin/feature-prompts/:id/toggle          一键启用/停用
//   DELETE /admin/feature-prompts/:id                 真删 (谨慎)
//   GET    /admin/feature-prompts/:id/history         版本历史
//   POST   /admin/feature-prompts/:id/revert/:version 回滚到某版本
//
// 不在这里:
//   - 不暴露 GetBySlug / ListByPersona — 那是 picker 内部, admin 不直接用
//   - 不做 prompt 预览渲染 (前端实现, 走 markdown / 代码 highlighting)
//   - 不做 diff (前端拿两个 version 自己 diff, 后端只提供完整快照)
// ============================================================================

package promptregistry

import (
	"errors"
	"strconv"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// Handler — admin 路由 handler。
type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// ─── DTO ─────────────────────────────────────────────────────────────────

// promptDTO — 返回给 admin 前端的 prompt 视图。
//
// 跟 model.Prompt 几乎一致, 但 ApplicableSubjects 解开成 []string 给前端友好;
// updated_by_user_id 直出但不解析成用户名 (前端如果需要展示用户名, 用 /admin/users
// 的现成 list 自己 join)。
type promptDTO struct {
	ID                  uint64    `json:"id"`
	FeatureKey          string    `json:"feature_key"`
	Slug                string    `json:"slug"`
	Persona             string    `json:"persona"`
	Name                string    `json:"name"`
	Description         *string   `json:"description,omitempty"`
	ApplicableSubjects  []string  `json:"applicable_subjects"`
	Weight              float32   `json:"weight"`
	Enabled             bool      `json:"enabled"`
	SystemPrompt        string    `json:"system_prompt"`
	Version             int       `json:"version"`
	Source              string    `json:"source"`
	UpdatedByUserID     *uint64   `json:"updated_by_user_id,omitempty"`
	CreatedAt           string    `json:"created_at"`
	UpdatedAt           string    `json:"updated_at"`
}

func toDTO(p *Prompt) promptDTO {
	return promptDTO{
		ID:                 p.ID,
		FeatureKey:         p.FeatureKey,
		Slug:               p.Slug,
		Persona:            p.Persona,
		Name:               p.Name,
		Description:        p.Description,
		ApplicableSubjects: p.Subjects(),
		Weight:             p.Weight,
		Enabled:            p.Enabled,
		SystemPrompt:       p.SystemPrompt,
		Version:            p.Version,
		Source:             p.Source,
		UpdatedByUserID:    p.UpdatedByUserID,
		CreatedAt:          p.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:          p.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// historyDTO — 单条版本快照。
type historyDTO struct {
	ID                 uint64   `json:"id"`
	PromptID           uint64   `json:"prompt_id"`
	Version            int      `json:"version"`
	Name               string   `json:"name"`
	ApplicableSubjects []string `json:"applicable_subjects"`
	Weight             float32  `json:"weight"`
	Enabled            bool     `json:"enabled"`
	SystemPrompt       string   `json:"system_prompt"`
	ChangeNote         *string  `json:"change_note,omitempty"`
	ChangedByUserID    *uint64  `json:"changed_by_user_id,omitempty"`
	CreatedAt          string   `json:"created_at"`
}

func historyToDTO(h *PromptHistory) historyDTO {
	tmp := Prompt{SubjectsJSON: h.SubjectsJSON}
	return historyDTO{
		ID:                 h.ID,
		PromptID:           h.PromptID,
		Version:            h.Version,
		Name:               h.Name,
		ApplicableSubjects: tmp.Subjects(),
		Weight:             h.Weight,
		Enabled:            h.Enabled,
		SystemPrompt:       h.SystemPrompt,
		ChangeNote:         h.ChangeNote,
		ChangedByUserID:    h.ChangedByUserID,
		CreatedAt:          h.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// ─── 通用助手 ────────────────────────────────────────────────────────────

func parseIDParam(c *gin.Context) (uint64, bool) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id == 0 {
		utils.BadRequest(c, "无效的 ID")
		return 0, false
	}
	return id, true
}

// adminUserID — admin 中间件已经把 user_id 灌进 gin context (跟 user 共用 JWT)。
// 没拿到也不致命, 写改时 changed_by 落 NULL。
func adminUserID(c *gin.Context) *uint64 {
	if v, ok := c.Get("user_id"); ok {
		switch uid := v.(type) {
		case uint:
			u := uint64(uid)
			return &u
		case uint64:
			return &uid
		case int:
			u := uint64(uid)
			return &u
		}
	}
	return nil
}

// ─── 路由 handler ────────────────────────────────────────────────────────

// List — GET /admin/feature-prompts?feature_key=peerreview
func (h *Handler) List(c *gin.Context) {
	featureKey := c.Query("feature_key")
	list, err := h.svc.ListAll(featureKey)
	if err != nil {
		utils.InternalError(c, 5001, "获取 prompt 列表失败", err)
		return
	}
	dtos := make([]promptDTO, 0, len(list))
	for i := range list {
		dtos = append(dtos, toDTO(&list[i]))
	}
	utils.Success(c, gin.H{"items": dtos, "total": len(dtos)})
}

// Get — GET /admin/feature-prompts/:id
func (h *Handler) Get(c *gin.Context) {
	id, ok := parseIDParam(c)
	if !ok {
		return
	}
	p, err := h.svc.GetByID(id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.Error(c, 4404, "prompt 不存在")
			return
		}
		utils.InternalError(c, 5002, "获取 prompt 失败", err)
		return
	}
	utils.Success(c, toDTO(p))
}

// CreateRequest — POST /admin/feature-prompts body schema。
type CreateRequest struct {
	FeatureKey         string   `json:"feature_key" binding:"required,min=1,max=64"`
	Slug               string   `json:"slug" binding:"required,min=1,max=128"`
	Persona            string   `json:"persona" binding:"max=32"`
	Name               string   `json:"name" binding:"required,min=1,max=120"`
	Description        *string  `json:"description"`
	ApplicableSubjects []string `json:"applicable_subjects"`
	Weight             float32  `json:"weight"`
	Enabled            bool     `json:"enabled"`
	SystemPrompt       string   `json:"system_prompt" binding:"required,min=1"`
}

// Create — POST /admin/feature-prompts
//
// 用于 admin "加变体" 场景 (e.g. 给 peerreview alpha persona 加一个新学科 skill)。
// 不能跟现有 (feature_key, slug) 冲突, 否则 DB 唯一索引会拒掉。
func (h *Handler) Create(c *gin.Context) {
	var req CreateRequest
	if !utils.BindJSON(c, &req) {
		return
	}
	if req.Persona == "" {
		req.Persona = "default"
	}
	if req.Weight <= 0 {
		req.Weight = 1.0
	}
	uid := adminUserID(c)
	p := &Prompt{
		FeatureKey:      req.FeatureKey,
		Slug:            req.Slug,
		Persona:         req.Persona,
		Name:            req.Name,
		Description:     req.Description,
		Weight:          req.Weight,
		Enabled:         req.Enabled,
		SystemPrompt:    req.SystemPrompt,
		Version:         1,
		Source:          "admin",
		UpdatedByUserID: uid,
	}
	p.SetSubjects(req.ApplicableSubjects)
	if err := h.svc.Create(p); err != nil {
		utils.InternalError(c, 5003, "新建 prompt 失败 (slug 可能已存在)", err)
		return
	}
	utils.Success(c, toDTO(p))
}

// UpdateBody — PUT /admin/feature-prompts/:id body schema。
//
// 注意: 不允许改 FeatureKey / Slug / Persona — 这三者是逻辑锚点,
// 改了会让运行中的 picker 抓不到; 想换 slug 就新建一行 + 停用旧的, 而不是 update。
type UpdateBody struct {
	Name               string   `json:"name" binding:"required,min=1,max=120"`
	Description        *string  `json:"description"`
	ApplicableSubjects []string `json:"applicable_subjects"`
	Weight             float32  `json:"weight"`
	Enabled            bool     `json:"enabled"`
	SystemPrompt       string   `json:"system_prompt" binding:"required,min=1"`
	ChangeNote         *string  `json:"change_note"`
}

// Update — PUT /admin/feature-prompts/:id
func (h *Handler) Update(c *gin.Context) {
	id, ok := parseIDParam(c)
	if !ok {
		return
	}
	var req UpdateBody
	if !utils.BindJSON(c, &req) {
		return
	}
	if req.Weight <= 0 {
		req.Weight = 1.0
	}
	updated, err := h.svc.Update(id, UpdateRequest{
		Name:            req.Name,
		Description:     req.Description,
		Subjects:        req.ApplicableSubjects,
		Weight:          req.Weight,
		Enabled:         req.Enabled,
		SystemPrompt:    req.SystemPrompt,
		ChangedByUserID: adminUserID(c),
		ChangeNote:      req.ChangeNote,
	})
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.Error(c, 4404, "prompt 不存在")
			return
		}
		utils.InternalError(c, 5004, "更新 prompt 失败", err)
		return
	}
	utils.Success(c, toDTO(updated))
}

// ToggleBody — POST /admin/feature-prompts/:id/toggle body schema。
type ToggleBody struct {
	Enabled bool `json:"enabled"`
}

// Toggle — POST /admin/feature-prompts/:id/toggle
//
// 单按钮启用/停用; 比走完整 Update 省事, 也避免 admin 误改其它字段。
func (h *Handler) Toggle(c *gin.Context) {
	id, ok := parseIDParam(c)
	if !ok {
		return
	}
	var req ToggleBody
	if !utils.BindJSON(c, &req) {
		return
	}
	updated, err := h.svc.ToggleEnabled(id, req.Enabled, adminUserID(c))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.Error(c, 4404, "prompt 不存在")
			return
		}
		utils.InternalError(c, 5005, "切换状态失败", err)
		return
	}
	utils.Success(c, toDTO(updated))
}

// Delete — DELETE /admin/feature-prompts/:id
//
// 真删 (含历史). 通常 admin 应走 toggle 停用而非删, 这个 endpoint 给删运营误建变体用。
// 删除 seed 行也允许 — 但下次 migration 跑会重建 (因为 seed 用 INSERT IGNORE)。
func (h *Handler) Delete(c *gin.Context) {
	id, ok := parseIDParam(c)
	if !ok {
		return
	}
	if err := h.svc.Delete(id); err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.Error(c, 4404, "prompt 不存在")
			return
		}
		utils.InternalError(c, 5006, "删除 prompt 失败", err)
		return
	}
	utils.SuccessWithMessage(c, "已删除", nil)
}

// History — GET /admin/feature-prompts/:id/history?limit=50
func (h *Handler) History(c *gin.Context) {
	id, ok := parseIDParam(c)
	if !ok {
		return
	}
	limit := 50
	if lstr := c.Query("limit"); lstr != "" {
		if n, err := strconv.Atoi(lstr); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	hist, err := h.svc.GetHistory(id, limit)
	if err != nil {
		utils.InternalError(c, 5007, "获取历史失败", err)
		return
	}
	dtos := make([]historyDTO, 0, len(hist))
	for i := range hist {
		dtos = append(dtos, historyToDTO(&hist[i]))
	}
	utils.Success(c, gin.H{"items": dtos, "total": len(dtos)})
}

// Revert — POST /admin/feature-prompts/:id/revert/:version
//
// 回滚到指定版本。实际做的是"以历史版本的内容走一次正常 Update", 自动产生 version+1
// 和新 history 行 (note='reverted from vN')。这样回滚也可被审计 / 再回滚。
func (h *Handler) Revert(c *gin.Context) {
	id, ok := parseIDParam(c)
	if !ok {
		return
	}
	vstr := c.Param("version")
	v, err := strconv.Atoi(vstr)
	if err != nil || v <= 0 {
		utils.BadRequest(c, "无效的 version")
		return
	}
	reverted, err := h.svc.RevertToVersion(id, v, adminUserID(c))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			utils.Error(c, 4404, "prompt 或目标 version 不存在")
			return
		}
		utils.InternalError(c, 5008, "回滚失败", err)
		return
	}
	utils.Success(c, toDTO(reverted))
}
