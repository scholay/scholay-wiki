// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package message

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// WebSocketHub WebSocket 推送接口
type WebSocketHub interface {
	SendNotification(userID uint, msgID uint, title, content, category, linkURL, linkText string) error
	SendUnreadCount(userID uint, count int) error
}

// Service 消息服务
type Service struct {
	repo  *Repository
	wsHub WebSocketHub
}

// NewService 创建消息服务实例
func NewService(db *gorm.DB) *Service {
	return &Service{
		repo: NewRepository(db),
	}
}

// SetWebSocketHub 设置 WebSocket Hub（用于实时推送）
func (s *Service) SetWebSocketHub(hub WebSocketHub) {
	s.wsHub = hub
}

// ========== 消息模板服务 ==========

// CreateTemplate 创建消息模板
func (s *Service) CreateTemplate(req *CreateTemplateRequest) (*TemplateResponse, error) {
	// 检查代码是否已存在
	existing, _ := s.repo.GetTemplateByCode(req.Code)
	if existing != nil {
		return nil, errors.New("模板代码已存在")
	}

	var varsJSON *string
	if len(req.Variables) > 0 {
		data, _ := json.Marshal(req.Variables)
		str := string(data)
		varsJSON = &str
	}

	category := req.Category
	if category == "" {
		category = CategorySystem
	}

	template := &MessageTemplate{
		Code:      req.Code,
		Name:      req.Name,
		Title:     req.Title,
		Content:   req.Content,
		Category:  category,
		Variables: varsJSON,
		IsActive:  true,
	}

	if err := s.repo.CreateTemplate(template); err != nil {
		return nil, err
	}

	return s.templateToResponse(template), nil
}

// GetTemplate 获取模板详情
func (s *Service) GetTemplate(id uint) (*TemplateResponse, error) {
	template, err := s.repo.GetTemplateByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("模板不存在")
		}
		return nil, err
	}
	return s.templateToResponse(template), nil
}

// UpdateTemplate 更新模板
func (s *Service) UpdateTemplate(id uint, req *UpdateTemplateRequest) (*TemplateResponse, error) {
	template, err := s.repo.GetTemplateByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("模板不存在")
		}
		return nil, err
	}

	if req.Name != "" {
		template.Name = req.Name
	}
	if req.Title != "" {
		template.Title = req.Title
	}
	if req.Content != "" {
		template.Content = req.Content
	}
	if req.Category != "" {
		template.Category = req.Category
	}
	if req.Variables != nil {
		data, _ := json.Marshal(req.Variables)
		str := string(data)
		template.Variables = &str
	}
	if req.IsActive != nil {
		template.IsActive = *req.IsActive
	}

	if err := s.repo.UpdateTemplate(template); err != nil {
		return nil, err
	}

	return s.templateToResponse(template), nil
}

// DeleteTemplate 删除模板
func (s *Service) DeleteTemplate(id uint) error {
	_, err := s.repo.GetTemplateByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("模板不存在")
		}
		return err
	}
	return s.repo.DeleteTemplate(id)
}

// ListTemplates 获取模板列表
func (s *Service) ListTemplates(req *TemplateListRequest) (*TemplateListResponse, error) {
	templates, total, err := s.repo.ListTemplates(req)
	if err != nil {
		return nil, err
	}

	list := make([]TemplateResponse, len(templates))
	for i, t := range templates {
		list[i] = *s.templateToResponse(&t)
	}

	page := req.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize < 1 {
		pageSize = 20
	}

	return &TemplateListResponse{
		List:     list,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

func (s *Service) templateToResponse(t *MessageTemplate) *TemplateResponse {
	resp := &TemplateResponse{
		ID:        t.ID,
		Code:      t.Code,
		Name:      t.Name,
		Title:     t.Title,
		Content:   t.Content,
		Category:  t.Category,
		IsActive:  t.IsActive,
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
	if t.Variables != nil {
		var vars map[string]string
		if err := json.Unmarshal([]byte(*t.Variables), &vars); err == nil {
			resp.Variables = vars
		}
	}
	return resp
}

// ========== 消息服务（管理端） ==========

// CreateMessage 创建消息
func (s *Service) CreateMessage(req *CreateMessageRequest, senderID uint, senderName string) (*MessageResponse, error) {
	category := req.Category
	if category == "" {
		category = CategorySystem
	}

	message := &Message{
		Title:    req.Title,
		Content:  req.Content,
		Category: category,
		SendType: req.SendType,
		Status:   StatusDraft,
	}

	// 设置目标
	switch req.SendType {
	case SendTypeByPlan:
		if len(req.TargetPlans) == 0 {
			return nil, errors.New("按会员等级发送时需要指定目标等级")
		}
		data, _ := json.Marshal(req.TargetPlans)
		str := string(data)
		message.TargetPlans = &str
	case SendTypeBatch, SendTypeSingle:
		if len(req.TargetUserIDs) == 0 {
			return nil, errors.New("批量/单个发送时需要指定目标用户")
		}
		// 验证用户是否存在
		existingIDs, err := s.repo.CheckUsersExist(req.TargetUserIDs)
		if err != nil {
			return nil, err
		}
		if len(existingIDs) == 0 {
			return nil, errors.New("指定的用户不存在")
		}
		data, _ := json.Marshal(existingIDs)
		str := string(data)
		message.TargetUserIDs = &str
	}

	// 设置链接
	if req.LinkURL != "" {
		message.LinkURL = &req.LinkURL
	}
	if req.LinkText != "" {
		message.LinkText = &req.LinkText
	}

	// 设置过期时间
	if req.ExpireAt != nil {
		message.ExpireAt = req.ExpireAt
	}

	// 设置发送人
	message.SenderID = &senderID
	message.SenderName = &senderName

	// 创建消息
	if err := s.repo.CreateMessage(message); err != nil {
		return nil, err
	}

	// 如果立即发送
	if req.SendNow {
		if err := s.SendMessage(message.ID); err != nil {
			return nil, err
		}
		// 重新获取消息
		message, _ = s.repo.GetMessageByID(message.ID)
	}

	return s.messageToResponse(message), nil
}

// SendMessage 发送消息
func (s *Service) SendMessage(messageID uint) error {
	message, err := s.repo.GetMessageByID(messageID)
	if err != nil {
		return errors.New("消息不存在")
	}

	if message.Status != StatusDraft {
		return errors.New("只能发送草稿状态的消息")
	}

	// 获取目标用户
	var userIDs []uint
	switch message.SendType {
	case SendTypeAll:
		userIDs, err = s.repo.GetAllActiveUserIDs()
	case SendTypeByPlan:
		plans := message.GetTargetPlans()
		if len(plans) == 0 {
			return errors.New("目标会员等级为空")
		}
		userIDs, err = s.repo.GetUserIDsByPlan(plans)
	case SendTypeBatch, SendTypeSingle:
		userIDs = message.GetTargetUserIDs()
	}

	if err != nil {
		return err
	}
	if len(userIDs) == 0 {
		return errors.New("没有符合条件的目标用户")
	}

	// 创建用户消息记录
	userMessages := make([]UserMessage, len(userIDs))
	for i, uid := range userIDs {
		userMessages[i] = UserMessage{
			UserID:    uid,
			MessageID: message.ID,
			IsRead:    false,
		}
	}

	if err := s.repo.CreateUserMessages(userMessages); err != nil {
		return err
	}

	// 更新消息状态
	now := time.Now()
	message.Status = StatusSent
	message.SendAt = &now
	message.RecipientCount = len(userIDs)

	if err := s.repo.UpdateMessage(message); err != nil {
		return err
	}

	// 通过 WebSocket 实时推送通知给所有目标用户
	linkURL := ""
	linkText := ""
	if message.LinkURL != nil {
		linkURL = *message.LinkURL
	}
	if message.LinkText != nil {
		linkText = *message.LinkText
	}
	for _, uid := range userIDs {
		s.pushNotification(uid, message.ID, message.Title, message.Content, string(message.Category), linkURL, linkText)
	}

	return nil
}

// GetMessage 获取消息详情（管理端）
func (s *Service) GetMessage(id uint) (*MessageResponse, error) {
	message, err := s.repo.GetMessageByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("消息不存在")
		}
		return nil, err
	}
	return s.messageToResponse(message), nil
}

// ListMessages 获取消息列表（管理端）
func (s *Service) ListMessages(req *MessageListRequest) (*MessageListResponse, error) {
	messages, total, err := s.repo.ListMessages(req)
	if err != nil {
		return nil, err
	}

	list := make([]MessageResponse, len(messages))
	for i, m := range messages {
		list[i] = *s.messageToResponse(&m)
	}

	page := req.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize < 1 {
		pageSize = 20
	}

	return &MessageListResponse{
		List:     list,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

// GetMessageStats 获取消息统计
func (s *Service) GetMessageStats() (*MessageStatsResponse, error) {
	return s.repo.GetMessageStats()
}

func (s *Service) messageToResponse(m *Message) *MessageResponse {
	resp := &MessageResponse{
		ID:             m.ID,
		Title:          m.Title,
		Content:        m.Content,
		Category:       m.Category,
		SendType:       m.SendType,
		SendAt:         m.SendAt,
		ExpireAt:       m.ExpireAt,
		Status:         m.Status,
		RecipientCount: m.RecipientCount,
		ReadCount:      m.ReadCount,
		CreatedAt:      m.CreatedAt,
	}

	if m.TargetPlans != nil {
		resp.TargetPlans = m.GetTargetPlans()
	}
	if m.LinkURL != nil {
		resp.LinkURL = *m.LinkURL
	}
	if m.LinkText != nil {
		resp.LinkText = *m.LinkText
	}
	if m.SenderName != nil {
		resp.SenderName = *m.SenderName
	}
	if m.RecipientCount > 0 {
		resp.ReadRate = float64(m.ReadCount) / float64(m.RecipientCount) * 100
	}

	return resp
}

// ========== 用户端消息服务 ==========

// GetUserMessages 获取用户消息列表
func (s *Service) GetUserMessages(userID uint, req *UserMessageListRequest) (*UserMessageListResponse, error) {
	messages, total, err := s.repo.ListUserMessages(userID, req)
	if err != nil {
		return nil, err
	}

	list := make([]UserMessageResponse, len(messages))
	for i, um := range messages {
		list[i] = *s.userMessageToResponse(&um)
	}

	page := req.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize < 1 {
		pageSize = 20
	}

	return &UserMessageListResponse{
		List:     list,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

// GetUserMessage 获取用户消息详情
func (s *Service) GetUserMessage(userID, id uint) (*UserMessageResponse, error) {
	um, err := s.repo.GetUserMessageByID(userID, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("消息不存在")
		}
		return nil, err
	}

	// 自动标记为已读
	if !um.IsRead {
		_ = s.repo.MarkAsRead(userID, id)
		um.IsRead = true
		now := time.Now()
		um.ReadAt = &now
	}

	return s.userMessageToResponse(um), nil
}

// GetUnreadCount 获取未读消息数量
func (s *Service) GetUnreadCount(userID uint) (*UnreadCountResponse, error) {
	count, err := s.repo.GetUnreadCount(userID)
	if err != nil {
		return nil, err
	}
	return &UnreadCountResponse{Count: count}, nil
}

// MarkAsRead 标记消息已读
func (s *Service) MarkAsRead(userID, id uint) error {
	return s.repo.MarkAsRead(userID, id)
}

// MarkAllAsRead 标记所有消息已读
func (s *Service) MarkAllAsRead(userID uint) (int64, error) {
	return s.repo.MarkAllAsRead(userID)
}

// DeleteUserMessage 删除用户消息
func (s *Service) DeleteUserMessage(userID, id uint) error {
	// 检查消息是否存在
	_, err := s.repo.GetUserMessageByID(userID, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return errors.New("消息不存在")
		}
		return err
	}
	return s.repo.DeleteUserMessage(userID, id)
}

func (s *Service) userMessageToResponse(um *UserMessage) *UserMessageResponse {
	resp := &UserMessageResponse{
		ID:        um.ID,
		MessageID: um.MessageID,
		IsRead:    um.IsRead,
		ReadAt:    um.ReadAt,
		CreatedAt: um.CreatedAt,
	}

	if um.Message != nil {
		resp.Title = um.Message.Title
		resp.Content = um.Message.Content
		resp.Category = um.Message.Category
		resp.SendAt = um.Message.SendAt
		if um.Message.LinkURL != nil {
			resp.LinkURL = *um.Message.LinkURL
		}
		if um.Message.LinkText != nil {
			resp.LinkText = *um.Message.LinkText
		}
	}

	return resp
}

// ========== 辅助方法 ==========

// RenderTemplate 渲染模板（替换变量）
func (s *Service) RenderTemplate(templateCode string, variables map[string]string) (title string, content string, err error) {
	template, err := s.repo.GetTemplateByCode(templateCode)
	if err != nil {
		return "", "", errors.New("模板不存在")
	}

	if !template.IsActive {
		return "", "", errors.New("模板已停用")
	}

	title = template.Title
	content = template.Content

	// 替换变量
	for key, value := range variables {
		placeholder := "{{" + key + "}}"
		title = strings.ReplaceAll(title, placeholder, value)
		content = strings.ReplaceAll(content, placeholder, value)
	}

	return title, content, nil
}

// SendToUser 发送消息给单个用户（快捷方法）
func (s *Service) SendToUser(userID uint, title, content string, category MessageCategory, linkURL, linkText string) error {
	// 检查用户是否存在
	exists, err := s.repo.CheckUserExists(userID)
	if err != nil {
		return err
	}
	if !exists {
		return errors.New("用户不存在")
	}

	// 创建消息
	message := &Message{
		Title:    title,
		Content:  content,
		Category: category,
		SendType: SendTypeSingle,
		Status:   StatusSent,
	}

	userIDsJSON, _ := json.Marshal([]uint{userID})
	str := string(userIDsJSON)
	message.TargetUserIDs = &str

	if linkURL != "" {
		message.LinkURL = &linkURL
	}
	if linkText != "" {
		message.LinkText = &linkText
	}

	now := time.Now()
	message.SendAt = &now
	message.RecipientCount = 1

	if err := s.repo.CreateMessage(message); err != nil {
		return err
	}

	// 创建用户消息记录
	userMessage := []UserMessage{{
		UserID:    userID,
		MessageID: message.ID,
		IsRead:    false,
	}}

	if err := s.repo.CreateUserMessages(userMessage); err != nil {
		return err
	}

	// 通过 WebSocket 实时推送通知
	s.pushNotification(userID, message.ID, title, content, string(category), linkURL, linkText)

	return nil
}

// pushNotification 通过 WebSocket 推送通知（异步，不阻塞主流程）
func (s *Service) pushNotification(userID uint, msgID uint, title, content, category, linkURL, linkText string) {
	if s.wsHub == nil {
		return
	}

	go func() {
		// 推送新消息通知
		if err := s.wsHub.SendNotification(userID, msgID, title, content, category, linkURL, linkText); err != nil {
			fmt.Printf("[Message] Failed to push notification to user %d: %v\n", userID, err)
		}

		// 推送未读数量更新
		count, err := s.repo.GetUnreadCount(userID)
		if err == nil {
			if err := s.wsHub.SendUnreadCount(userID, int(count)); err != nil {
				fmt.Printf("[Message] Failed to push unread count to user %d: %v\n", userID, err)
			}
		}
	}()
}

// SendFromTemplate 使用模板发送消息给用户
func (s *Service) SendFromTemplate(userID uint, templateCode string, variables map[string]string, linkURL, linkText string) error {
	title, content, err := s.RenderTemplate(templateCode, variables)
	if err != nil {
		return err
	}

	template, _ := s.repo.GetTemplateByCode(templateCode)
	category := CategorySystem
	if template != nil {
		category = template.Category
	}

	return s.SendToUser(userID, title, content, category, linkURL, linkText)
}

// SendToUserWithCategory 发送消息给用户（使用字符串类型的分类，供外部模块调用）
func (s *Service) SendToUserWithCategory(userID uint, title, content string, category string, linkURL, linkText string) error {
	// 转换字符串为 MessageCategory
	msgCategory := MessageCategory(category)
	// 验证分类是否有效
	switch msgCategory {
	case CategorySystem, CategoryPromotion, CategoryTransaction:
		// 有效分类
	default:
		msgCategory = CategorySystem // 默认使用系统分类
	}
	return s.SendToUser(userID, title, content, msgCategory, linkURL, linkText)
}

