// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// All Rights Reserved.
// ============================================================================

package usermemory

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"scholar-backend/internal/common/utils"
)

// Handler 用户端「我的记忆」HTTP 接口(前缀 /api/v1/user/memory,需登录)。
// 前端「我的记忆」页可延后;后端先把查看/编辑/删除接口做好(隐私/GDPR)。
type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler { return &Handler{service: service} }

func userID(c *gin.Context) (uint, bool) {
	v, exists := c.Get("user_id")
	if !exists {
		return 0, false
	}
	switch id := v.(type) {
	case uint:
		return id, true
	case uint64:
		return uint(id), true
	case int:
		return uint(id), true
	case float64:
		return uint(id), true
	default:
		return 0, false
	}
}

// List GET /api/v1/user/memory —— 列出当前用户的全部记忆块。
func (h *Handler) List(c *gin.Context) {
	uid, ok := userID(c)
	if !ok {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}
	blocks, err := h.service.List(uid)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "加载记忆失败,请稍后重试")
		return
	}
	utils.Success(c, gin.H{"blocks": blocks})
}

// SetBlock PUT /api/v1/user/memory/:label —— 用户手动设置某块内容。
func (h *Handler) SetBlock(c *gin.Context) {
	uid, ok := userID(c)
	if !ok {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}
	label := strings.TrimSpace(c.Param("label"))
	if label == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "缺少记忆块标识")
		return
	}
	var body struct {
		Value string `json:"value"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "请求参数有误")
		return
	}
	if err := h.service.SetBlock(uid, label, body.Value); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "保存记忆失败,请稍后重试")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// DeleteBlock DELETE /api/v1/user/memory/:label —— 删某块。
func (h *Handler) DeleteBlock(c *gin.Context) {
	uid, ok := userID(c)
	if !ok {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}
	label := strings.TrimSpace(c.Param("label"))
	if label == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "缺少记忆块标识")
		return
	}
	if err := h.service.DeleteBlock(uid, label); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "删除记忆失败,请稍后重试")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}

// Clear DELETE /api/v1/user/memory —— 清空当前用户全部记忆。
func (h *Handler) Clear(c *gin.Context) {
	uid, ok := userID(c)
	if !ok {
		utils.ErrorResponse(c, http.StatusUnauthorized, "未登录")
		return
	}
	if err := h.service.Clear(uid); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "清空记忆失败,请稍后重试")
		return
	}
	utils.Success(c, gin.H{"ok": true})
}
