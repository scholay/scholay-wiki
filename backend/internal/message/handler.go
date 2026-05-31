// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package message

import (
	"net/http"

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
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req UserMessageListRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		utils.Error(c, http.StatusBadRequest, "参数错误: "+err.Error())
		return
	}

	resp, err := h.service.GetUserMessages(userID, &req)
	if err != nil {
		utils.InternalError(c, 500, "获取消息列表失败", err)
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
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	resp, err := h.service.GetUnreadCount(userID)
	if err != nil {
		utils.InternalError(c, 500, "获取未读数量失败", err)
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
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.MarkAsRead(userID, id); err != nil {
		utils.InternalError(c, 500, "标记已读失败", err)
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
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	count, err := h.service.MarkAllAsRead(userID)
	if err != nil {
		utils.InternalError(c, 500, "标记全部已读失败", err)
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
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeleteUserMessage(userID, id); err != nil {
		utils.InternalError(c, 500, "删除消息失败", err)
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
	if !utils.BindJSON(c, &req) {
		return
	}

	senderID := adminID.(uint)
	senderName := ""
	if name, ok := adminName.(string); ok {
		senderName = name
	}

	resp, err := h.service.CreateMessage(&req, senderID, senderName)
	if err != nil {
		utils.InternalError(c, 500, "创建消息失败", err)
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
	id, ok := utils.ParseUintParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.SendMessage(id); err != nil {
		utils.InternalError(c, 500, "发送消息失败", err)
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
		utils.InternalError(c, 500, "获取消息列表失败", err)
		return
	}

	utils.Success(c, resp)
}



