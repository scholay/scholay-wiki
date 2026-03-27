// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package message

import (
	"time"

	"gorm.io/gorm"
)

// Repository 消息数据仓库
type Repository struct {
	db *gorm.DB
}

// NewRepository 创建消息仓库实例
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// ========== 消息模板操作 ==========

// CreateTemplate 创建消息模板
func (r *Repository) CreateTemplate(template *MessageTemplate) error {
	return r.db.Create(template).Error
}

// GetTemplateByID 根据ID获取模板
func (r *Repository) GetTemplateByID(id uint) (*MessageTemplate, error) {
	var template MessageTemplate
	err := r.db.First(&template, id).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}

// GetTemplateByCode 根据代码获取模板
func (r *Repository) GetTemplateByCode(code string) (*MessageTemplate, error) {
	var template MessageTemplate
	err := r.db.Where("code = ?", code).First(&template).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}

// UpdateTemplate 更新模板
func (r *Repository) UpdateTemplate(template *MessageTemplate) error {
	return r.db.Save(template).Error
}

// DeleteTemplate 删除模板
func (r *Repository) DeleteTemplate(id uint) error {
	return r.db.Delete(&MessageTemplate{}, id).Error
}

// ListTemplates 获取模板列表
func (r *Repository) ListTemplates(req *TemplateListRequest) ([]MessageTemplate, int64, error) {
	var templates []MessageTemplate
	var total int64

	query := r.db.Model(&MessageTemplate{})

	if req.Category != "" {
		query = query.Where("category = ?", req.Category)
	}
	if req.IsActive != nil {
		query = query.Where("is_active = ?", *req.IsActive)
	}
	if req.Keyword != "" {
		keyword := "%" + req.Keyword + "%"
		query = query.Where("name LIKE ? OR code LIKE ? OR title LIKE ?", keyword, keyword, keyword)
	}

	// 获取总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 分页
	page := req.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&templates).Error
	return templates, total, err
}

// ========== 消息操作 ==========

// CreateMessage 创建消息
func (r *Repository) CreateMessage(message *Message) error {
	return r.db.Create(message).Error
}

// GetMessageByID 根据ID获取消息
func (r *Repository) GetMessageByID(id uint) (*Message, error) {
	var message Message
	err := r.db.First(&message, id).Error
	if err != nil {
		return nil, err
	}
	return &message, nil
}

// UpdateMessage 更新消息
func (r *Repository) UpdateMessage(message *Message) error {
	return r.db.Save(message).Error
}

// DeleteMessage 删除消息
func (r *Repository) DeleteMessage(id uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// 先删除用户消息关联
		if err := tx.Where("message_id = ?", id).Delete(&UserMessage{}).Error; err != nil {
			return err
		}
		// 再删除消息
		return tx.Delete(&Message{}, id).Error
	})
}

// ListMessages 获取消息列表（管理端）
func (r *Repository) ListMessages(req *MessageListRequest) ([]Message, int64, error) {
	var messages []Message
	var total int64

	query := r.db.Model(&Message{})

	if req.Category != "" {
		query = query.Where("category = ?", req.Category)
	}
	if req.Status != "" {
		query = query.Where("status = ?", req.Status)
	}
	if req.Keyword != "" {
		keyword := "%" + req.Keyword + "%"
		query = query.Where("title LIKE ? OR content LIKE ?", keyword, keyword)
	}

	// 获取总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 分页
	page := req.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&messages).Error
	return messages, total, err
}

// UpdateMessageStats 更新消息统计
func (r *Repository) UpdateMessageStats(messageID uint) error {
	return r.db.Exec(`
		UPDATE messages m
		SET 
			recipient_count = (SELECT COUNT(*) FROM user_messages WHERE message_id = m.id),
			read_count = (SELECT COUNT(*) FROM user_messages WHERE message_id = m.id AND is_read = TRUE)
		WHERE m.id = ?
	`, messageID).Error
}

// GetMessageStats 获取消息统计
func (r *Repository) GetMessageStats() (*MessageStatsResponse, error) {
	var stats MessageStatsResponse

	// 总消息数
	r.db.Model(&Message{}).Where("status = ?", StatusSent).Count(&stats.TotalMessages)

	// 总接收人数和已读人数
	r.db.Model(&UserMessage{}).Count(&stats.TotalRecipients)
	r.db.Model(&UserMessage{}).Where("is_read = ?", true).Count(&stats.TotalRead)

	if stats.TotalRecipients > 0 {
		stats.OverallReadRate = float64(stats.TotalRead) / float64(stats.TotalRecipients) * 100
	}

	// 按分类统计
	type categoryCount struct {
		Category MessageCategory
		Count    int64
	}
	var categoryStats []categoryCount
	r.db.Model(&Message{}).
		Select("category, COUNT(*) as count").
		Where("status = ?", StatusSent).
		Group("category").
		Scan(&categoryStats)
	for _, c := range categoryStats {
		stats.ByCategory = append(stats.ByCategory, struct {
			Category MessageCategory `json:"category"`
			Count    int64           `json:"count"`
		}{c.Category, c.Count})
	}

	// 按发送类型统计
	type sendTypeCount struct {
		SendType SendType
		Count    int64
	}
	var sendTypeStats []sendTypeCount
	r.db.Model(&Message{}).
		Select("send_type, COUNT(*) as count").
		Where("status = ?", StatusSent).
		Group("send_type").
		Scan(&sendTypeStats)
	for _, s := range sendTypeStats {
		stats.BySendType = append(stats.BySendType, struct {
			SendType SendType `json:"send_type"`
			Count    int64    `json:"count"`
		}{s.SendType, s.Count})
	}

	return &stats, nil
}

// ========== 用户消息操作 ==========

// CreateUserMessages 批量创建用户消息
func (r *Repository) CreateUserMessages(userMessages []UserMessage) error {
	if len(userMessages) == 0 {
		return nil
	}
	return r.db.CreateInBatches(userMessages, 1000).Error
}

// GetUserMessageByID 根据ID获取用户消息
func (r *Repository) GetUserMessageByID(userID, id uint) (*UserMessage, error) {
	var um UserMessage
	err := r.db.Preload("Message").
		Where("id = ? AND user_id = ? AND is_deleted = ?", id, userID, false).
		First(&um).Error
	if err != nil {
		return nil, err
	}
	return &um, nil
}

// GetUserMessageByMessageID 根据消息ID获取用户消息
func (r *Repository) GetUserMessageByMessageID(userID, messageID uint) (*UserMessage, error) {
	var um UserMessage
	err := r.db.Preload("Message").
		Where("user_id = ? AND message_id = ? AND is_deleted = ?", userID, messageID, false).
		First(&um).Error
	if err != nil {
		return nil, err
	}
	return &um, nil
}

// ListUserMessages 获取用户消息列表
func (r *Repository) ListUserMessages(userID uint, req *UserMessageListRequest) ([]UserMessage, int64, error) {
	var messages []UserMessage
	var total int64

	query := r.db.Model(&UserMessage{}).
		Preload("Message").
		Where("user_id = ? AND is_deleted = ?", userID, false)

	// 过滤已过期的消息
	query = query.Joins("JOIN messages ON messages.id = user_messages.message_id").
		Where("messages.expire_at IS NULL OR messages.expire_at > ?", time.Now())

	if req.Category != "" {
		query = query.Where("messages.category = ?", req.Category)
	}
	if req.IsRead != nil {
		query = query.Where("user_messages.is_read = ?", *req.IsRead)
	}

	// 获取总数
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 分页
	page := req.Page
	if page < 1 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize < 1 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	err := query.Order("user_messages.created_at DESC").
		Offset(offset).
		Limit(pageSize).
		Find(&messages).Error
	return messages, total, err
}

// GetUnreadCount 获取未读消息数量
func (r *Repository) GetUnreadCount(userID uint) (int64, error) {
	var count int64
	err := r.db.Model(&UserMessage{}).
		Joins("JOIN messages ON messages.id = user_messages.message_id").
		Where("user_messages.user_id = ? AND user_messages.is_read = ? AND user_messages.is_deleted = ?", userID, false, false).
		Where("messages.expire_at IS NULL OR messages.expire_at > ?", time.Now()).
		Count(&count).Error
	return count, err
}

// MarkAsRead 标记消息已读
func (r *Repository) MarkAsRead(userID, id uint) error {
	now := time.Now()
	result := r.db.Model(&UserMessage{}).
		Where("id = ? AND user_id = ? AND is_read = ?", id, userID, false).
		Updates(map[string]any{
			"is_read": true,
			"read_at": now,
		})
	if result.Error != nil {
		return result.Error
	}

	// 如果有更新，同步更新消息表的已读计数
	if result.RowsAffected > 0 {
		var um UserMessage
		if err := r.db.First(&um, id).Error; err == nil {
			r.db.Model(&Message{}).Where("id = ?", um.MessageID).
				UpdateColumn("read_count", gorm.Expr("read_count + 1"))
		}
	}

	return nil
}

// MarkAllAsRead 标记所有消息已读
func (r *Repository) MarkAllAsRead(userID uint) (int64, error) {
	now := time.Now()
	result := r.db.Model(&UserMessage{}).
		Where("user_id = ? AND is_read = ? AND is_deleted = ?", userID, false, false).
		Updates(map[string]any{
			"is_read": true,
			"read_at": now,
		})
	return result.RowsAffected, result.Error
}

// DeleteUserMessage 软删除用户消息
func (r *Repository) DeleteUserMessage(userID, id uint) error {
	now := time.Now()
	return r.db.Model(&UserMessage{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(map[string]any{
			"is_deleted": true,
			"deleted_at": now,
		}).Error
}

// ========== 用户查询（用于发送消息） ==========

// GetAllActiveUserIDs 获取所有活跃用户ID
func (r *Repository) GetAllActiveUserIDs() ([]uint, error) {
	var userIDs []uint
	err := r.db.Table("users").
		Where("status = ?", 1).
		Pluck("id", &userIDs).Error
	return userIDs, err
}

// GetUserIDsByPlan 根据会员等级获取用户ID
func (r *Repository) GetUserIDsByPlan(plans []string) ([]uint, error) {
	var userIDs []uint
	err := r.db.Table("users").
		Where("status = ? AND subscription_plan IN ?", 1, plans).
		Pluck("id", &userIDs).Error
	return userIDs, err
}

// CheckUserExists 检查用户是否存在
func (r *Repository) CheckUserExists(userID uint) (bool, error) {
	var count int64
	err := r.db.Table("users").Where("id = ? AND status = ?", userID, 1).Count(&count).Error
	return count > 0, err
}

// CheckUsersExist 批量检查用户是否存在
func (r *Repository) CheckUsersExist(userIDs []uint) ([]uint, error) {
	var existingIDs []uint
	err := r.db.Table("users").
		Where("id IN ? AND status = ?", userIDs, 1).
		Pluck("id", &existingIDs).Error
	return existingIDs, err
}



