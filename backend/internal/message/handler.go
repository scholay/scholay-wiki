// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package message

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"scholar-backend/internal/common/utils"
)

// Handler 消息处理器
type Handler struct {
	service *Service
}

// NewHandler 创建消息处理器
func NewHandler(db *gorm.DB) *Handler {
	return &Handler{
		service: NewService(db),
	}
}

// SetWebSocketHub 设置 WebSocket Hub（用于实时推送）
func (h *Handler) SetWebSocketHub(hub WebSocketHub) {
	h.service.SetWebSocketHub(hub)
}

// GetService 获取消息服务（供其他模块调用）
func (h *Handler) GetService() *Service {
	return h.service
}

// MessageServiceAdapter 消息服务适配器（实现外部模块需要的接口）
type MessageServiceAdapter struct {
	service *Service
}

// NewMessageServiceAdapter 创建消息服务适配器
func NewMessageServiceAdapter(service *Service) *MessageServiceAdapter {
	return &MessageServiceAdapter{service: service}
}

// SendToUser 发送消息给用户（实现 coupon.MessageService 接口）
func (a *MessageServiceAdapter) SendToUser(userID uint, title, content string, category string, linkURL, linkText string) error {
	return a.service.SendToUserWithCategory(userID, title, content, category, linkURL, linkText)
}

// SendToast 发送纯 toast 提示给用户（不创建站内信记录，不可点击）
func (a *MessageServiceAdapter) SendToast(userID uint, title, content, category string) error {
	return a.service.SendToastToUser(userID, title, content, category)
}

// GetAdapter 获取消息服务适配器
func (h *Handler) GetAdapter() *MessageServiceAdapter {
	return NewMessageServiceAdapter(h.service)
}

// ========== 用户端 API ==========

// GetMessages 获取用户消息列表
// @Summary 获取用户消息列表
// @Tags 站内信-用户端
// @Security BearerAuth
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(20)
// @Param category query string false "分类" Enums(system, promotion, transaction)
// @Param is_read query bool false "是否已读"
// @Success 200 {object} utils.Response{data=UserMessageListResponse}
// @Router /api/v1/user/messages [get]
func (h *Handler) GetMessages(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, http.StatusUnauthorized, "未登录")
		return
	}

	var req UserMessageListRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误: "+err.Error())
		return
	}

	resp, err := h.service.GetUserMessages(userID.(uint), &req)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, resp)
}

// GetMessage 获取消息详情
// @Summary 获取消息详情
// @Tags 站内信-用户端
// @Security BearerAuth
// @Param id path int true "消息ID"
// @Success 200 {object} utils.Response{data=UserMessageResponse}
// @Router /api/v1/user/messages/{id} [get]
func (h *Handler) GetMessage(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, http.StatusUnauthorized, "未登录")
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "无效的消息ID")
		return
	}

	resp, err := h.service.GetUserMessage(userID.(uint), uint(id))
	if err != nil {
		utils.Error(c, http.StatusNotFound, err.Error())
		return
	}

	utils.Success(c, resp)
}

// GetUnreadCount 获取未读消息数量
// @Summary 获取未读消息数量
// @Tags 站内信-用户端
// @Security BearerAuth
// @Success 200 {object} utils.Response{data=UnreadCountResponse}
// @Router /api/v1/user/messages/unread-count [get]
func (h *Handler) GetUnreadCount(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, http.StatusUnauthorized, "未登录")
		return
	}

	resp, err := h.service.GetUnreadCount(userID.(uint))
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, resp)
}

// MarkAsRead 标记消息已读
// @Summary 标记消息已读
// @Tags 站内信-用户端
// @Security BearerAuth
// @Param id path int true "消息ID"
// @Success 200 {object} utils.Response
// @Router /api/v1/user/messages/{id}/read [put]
func (h *Handler) MarkAsRead(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, http.StatusUnauthorized, "未登录")
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "无效的消息ID")
		return
	}

	if err := h.service.MarkAsRead(userID.(uint), uint(id)); err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, nil)
}

// MarkAllAsRead 标记所有消息已读
// @Summary 标记所有消息已读
// @Tags 站内信-用户端
// @Security BearerAuth
// @Success 200 {object} utils.Response{data=map[string]int64}
// @Router /api/v1/user/messages/read-all [put]
func (h *Handler) MarkAllAsRead(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, http.StatusUnauthorized, "未登录")
		return
	}

	count, err := h.service.MarkAllAsRead(userID.(uint))
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, gin.H{"count": count})
}

// DeleteMessage 删除消息
// @Summary 删除消息
// @Tags 站内信-用户端
// @Security BearerAuth
// @Param id path int true "消息ID"
// @Success 200 {object} utils.Response
// @Router /api/v1/user/messages/{id} [delete]
func (h *Handler) DeleteMessage(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Error(c, http.StatusUnauthorized, "未登录")
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "无效的消息ID")
		return
	}

	if err := h.service.DeleteUserMessage(userID.(uint), uint(id)); err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, nil)
}

// ========== 管理端 API ==========

// AdminCreateMessage 创建消息
// @Summary 创建消息
// @Tags 站内信-管理端
// @Security BearerAuth
// @Param body body CreateMessageRequest true "创建消息请求"
// @Success 200 {object} utils.Response{data=MessageResponse}
// @Router /api/v1/admin/messages [post]
func (h *Handler) AdminCreateMessage(c *gin.Context) {
	adminID, _ := c.Get("adminID")
	adminName, _ := c.Get("adminUsername")

	var req CreateMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误: "+err.Error())
		return
	}

	senderID := adminID.(uint)
	senderName := ""
	if name, ok := adminName.(string); ok {
		senderName = name
	}

	resp, err := h.service.CreateMessage(&req, senderID, senderName)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, resp)
}

// AdminSendMessage 发送消息
// @Summary 发送消息（将草稿状态的消息发送出去）
// @Tags 站内信-管理端
// @Security BearerAuth
// @Param id path int true "消息ID"
// @Success 200 {object} utils.Response
// @Router /api/v1/admin/messages/{id}/send [post]
func (h *Handler) AdminSendMessage(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "无效的消息ID")
		return
	}

	if err := h.service.SendMessage(uint(id)); err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, nil)
}

// AdminGetMessages 获取消息列表
// @Summary 获取消息列表
// @Tags 站内信-管理端
// @Security BearerAuth
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(20)
// @Param category query string false "分类" Enums(system, promotion, transaction)
// @Param status query string false "状态" Enums(draft, sent, cancelled)
// @Param keyword query string false "关键词"
// @Success 200 {object} utils.Response{data=MessageListResponse}
// @Router /api/v1/admin/messages [get]
func (h *Handler) AdminGetMessages(c *gin.Context) {
	var req MessageListRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误: "+err.Error())
		return
	}

	resp, err := h.service.ListMessages(&req)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, resp)
}

// AdminGetMessage 获取消息详情
// @Summary 获取消息详情
// @Tags 站内信-管理端
// @Security BearerAuth
// @Param id path int true "消息ID"
// @Success 200 {object} utils.Response{data=MessageResponse}
// @Router /api/v1/admin/messages/{id} [get]
func (h *Handler) AdminGetMessage(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "无效的消息ID")
		return
	}

	resp, err := h.service.GetMessage(uint(id))
	if err != nil {
		utils.Error(c, http.StatusNotFound, err.Error())
		return
	}

	utils.Success(c, resp)
}

// AdminGetMessageStats 获取消息统计
// @Summary 获取消息统计
// @Tags 站内信-管理端
// @Security BearerAuth
// @Success 200 {object} utils.Response{data=MessageStatsResponse}
// @Router /api/v1/admin/messages/stats [get]
func (h *Handler) AdminGetMessageStats(c *gin.Context) {
	resp, err := h.service.GetMessageStats()
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, resp)
}

// ========== 模板管理 API ==========

// AdminCreateTemplate 创建模板
// @Summary 创建消息模板
// @Tags 站内信-模板管理
// @Security BearerAuth
// @Param body body CreateTemplateRequest true "创建模板请求"
// @Success 200 {object} utils.Response{data=TemplateResponse}
// @Router /api/v1/admin/message-templates [post]
func (h *Handler) AdminCreateTemplate(c *gin.Context) {
	var req CreateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误: "+err.Error())
		return
	}

	resp, err := h.service.CreateTemplate(&req)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, resp)
}

// AdminGetTemplates 获取模板列表
// @Summary 获取模板列表
// @Tags 站内信-模板管理
// @Security BearerAuth
// @Param page query int false "页码" default(1)
// @Param page_size query int false "每页数量" default(20)
// @Param category query string false "分类" Enums(system, promotion, transaction)
// @Param is_active query bool false "是否启用"
// @Param keyword query string false "关键词"
// @Success 200 {object} utils.Response{data=TemplateListResponse}
// @Router /api/v1/admin/message-templates [get]
func (h *Handler) AdminGetTemplates(c *gin.Context) {
	var req TemplateListRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误: "+err.Error())
		return
	}

	resp, err := h.service.ListTemplates(&req)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, resp)
}

// AdminGetTemplate 获取模板详情
// @Summary 获取模板详情
// @Tags 站内信-模板管理
// @Security BearerAuth
// @Param id path int true "模板ID"
// @Success 200 {object} utils.Response{data=TemplateResponse}
// @Router /api/v1/admin/message-templates/{id} [get]
func (h *Handler) AdminGetTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "无效的模板ID")
		return
	}

	resp, err := h.service.GetTemplate(uint(id))
	if err != nil {
		utils.Error(c, http.StatusNotFound, err.Error())
		return
	}

	utils.Success(c, resp)
}

// AdminUpdateTemplate 更新模板
// @Summary 更新模板
// @Tags 站内信-模板管理
// @Security BearerAuth
// @Param id path int true "模板ID"
// @Param body body UpdateTemplateRequest true "更新模板请求"
// @Success 200 {object} utils.Response{data=TemplateResponse}
// @Router /api/v1/admin/message-templates/{id} [put]
func (h *Handler) AdminUpdateTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "无效的模板ID")
		return
	}

	var req UpdateTemplateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误: "+err.Error())
		return
	}

	resp, err := h.service.UpdateTemplate(uint(id), &req)
	if err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, resp)
}

// AdminDeleteTemplate 删除模板
// @Summary 删除模板
// @Tags 站内信-模板管理
// @Security BearerAuth
// @Param id path int true "模板ID"
// @Success 200 {object} utils.Response
// @Router /api/v1/admin/message-templates/{id} [delete]
func (h *Handler) AdminDeleteTemplate(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		utils.Error(c, http.StatusBadRequest, "无效的模板ID")
		return
	}

	if err := h.service.DeleteTemplate(uint(id)); err != nil {
		utils.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	utils.Success(c, nil)
}

