// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package modelcatalog

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
)

// Handler 模型目录 + 能力绑定的 admin HTTP 接口(路由前缀 /api/v1/admin)。
// 价格/倍率对 admin 全量透出;用户面 DTO(P2 的 /user/models)另做,绝不复用这里的形状。
type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// ListModels GET /admin/models —— 目录全量(含停用行)。
func (h *Handler) ListModels(c *gin.Context) {
	rows, err := h.service.ListModels()
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载模型目录失败,请稍后重试")
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", rows)
}

// CreateModel POST /admin/models。
func (h *Handler) CreateModel(c *gin.Context) {
	var m AgentModel
	if err := c.ShouldBindJSON(&m); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数有误")
		return
	}
	m.ID = 0
	if err := h.service.CreateModel(&m); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", m)
}

// UpdateModel PUT /admin/models/:id。
func (h *Handler) UpdateModel(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的模型编号")
		return
	}
	var m AgentModel
	if err := c.ShouldBindJSON(&m); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数有误")
		return
	}
	if err := h.service.UpdateModel(id, &m); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{"message": "updated"})
}

// DeleteModel DELETE /admin/models/:id —— 仍被绑定引用的拒删。
func (h *Handler) DeleteModel(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "无效的模型编号")
		return
	}
	if err := h.service.DeleteModel(id); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{"message": "deleted"})
}

// ListBindings GET /admin/model-bindings —— 11 个 purpose 闭集,含生效值与回退态(标红)。
func (h *Handler) ListBindings(c *gin.Context) {
	utils.SuccessResponse(c, http.StatusOK, "success", h.service.BindingViews())
}

// ListUserModels GET /user/models?feature=claw —— 用户选择器目录(P2)。
// 只回 enabled ∧ user_selectable;locked 模型照回(置灰 + 升级引导);默认项按 feature 绑定标注。
func (h *Handler) ListUserModels(c *gin.Context) {
	feature := c.Query("feature")
	switch feature {
	case "smart_search", "claw", "prism":
	default:
		feature = "claw" // 未知/缺省按 claw(选择器目前只挂三个对话 feature)
	}
	userID := c.GetUint("user_id")
	utils.SuccessResponse(c, http.StatusOK, "success", h.service.ListForUser(userID, feature))
}

// SetBinding PUT /admin/model-bindings/:purpose {model_id}。
func (h *Handler) SetBinding(c *gin.Context) {
	var body struct {
		ModelID string `json:"model_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数有误")
		return
	}
	if err := h.service.SetBinding(c.Param("purpose"), body.ModelID); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, err.Error())
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{"message": "updated"})
}
