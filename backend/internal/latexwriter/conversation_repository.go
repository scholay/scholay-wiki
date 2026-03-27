package latexwriter

import (
	"gorm.io/gorm"
)

// ConversationRepository LaTeX 对话数据访问层
type ConversationRepository struct {
	db *gorm.DB
}

// NewConversationRepository 创建 Repository 实例
func NewConversationRepository(db *gorm.DB) *ConversationRepository {
	return &ConversationRepository{db: db}
}

// GetOrCreateByDocument 获取或创建文档对话
func (r *ConversationRepository) GetOrCreateByDocument(userID, documentID uint) (*LatexConversation, error) {
	var conv LatexConversation

	// 尝试获取现有对话
	err := r.db.Where("user_id = ? AND document_id = ?", userID, documentID).First(&conv).Error
	if err == nil {
		return &conv, nil
	}

	if err != gorm.ErrRecordNotFound {
		return nil, err
	}

	// 创建新对话
	conv = LatexConversation{
		UserID:     userID,
		DocumentID: documentID,
		Title:      "LaTeX 对话",
		ModelLevel: "mid",
	}

	if err := r.db.Create(&conv).Error; err != nil {
		return nil, err
	}

	return &conv, nil
}

// GetByID 通过 ID 获取对话
func (r *ConversationRepository) GetByID(id uint) (*LatexConversation, error) {
	var conv LatexConversation
	err := r.db.First(&conv, id).Error
	if err != nil {
		return nil, err
	}
	return &conv, nil
}

// GetByUserAndDocument 通过用户ID和文档ID获取对话
func (r *ConversationRepository) GetByUserAndDocument(userID, documentID uint) (*LatexConversation, error) {
	var conv LatexConversation
	err := r.db.Where("user_id = ? AND document_id = ?", userID, documentID).First(&conv).Error
	if err != nil {
		return nil, err
	}
	return &conv, nil
}

// GetMessages 获取对话消息（支持分页，按时间正序）
func (r *ConversationRepository) GetMessages(conversationID uint, limit, offset int) ([]LatexChatMessage, int64, error) {
	var messages []LatexChatMessage
	var total int64

	// 获取总数
	if err := r.db.Model(&LatexChatMessage{}).
		Where("conversation_id = ?", conversationID).
		Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 获取消息（按时间正序）
	if err := r.db.Where("conversation_id = ?", conversationID).
		Order("created_at ASC").
		Limit(limit).
		Offset(offset).
		Find(&messages).Error; err != nil {
		return nil, 0, err
	}

	return messages, total, nil
}

// GetRecentMessages 获取最近N条消息（用于上下文，按时间正序返回）
func (r *ConversationRepository) GetRecentMessages(conversationID uint, limit int) ([]LatexChatMessage, error) {
	var messages []LatexChatMessage

	// 子查询获取最近N条（倒序），然后正序返回
	subQuery := r.db.Model(&LatexChatMessage{}).
		Where("conversation_id = ?", conversationID).
		Order("created_at DESC").
		Limit(limit)

	if err := r.db.Table("(?) as sub", subQuery).
		Order("created_at ASC").
		Find(&messages).Error; err != nil {
		return nil, err
	}

	return messages, nil
}

// GetAllMessages 获取所有消息（按时间正序）
func (r *ConversationRepository) GetAllMessages(conversationID uint) ([]LatexChatMessage, error) {
	var messages []LatexChatMessage

	if err := r.db.Where("conversation_id = ?", conversationID).
		Order("created_at ASC").
		Find(&messages).Error; err != nil {
		return nil, err
	}

	return messages, nil
}

// AddMessage 添加消息
func (r *ConversationRepository) AddMessage(msg *LatexChatMessage) error {
	return r.db.Create(msg).Error
}

// UpdateMessage 更新消息
func (r *ConversationRepository) UpdateMessage(msg *LatexChatMessage) error {
	return r.db.Save(msg).Error
}

// UpdateConversationStats 更新对话统计信息
func (r *ConversationRepository) UpdateConversationStats(conversationID uint) error {
	// 统计消息数量和总 Token
	var stats struct {
		Count  int64
		Tokens uint
	}

	if err := r.db.Model(&LatexChatMessage{}).
		Where("conversation_id = ?", conversationID).
		Select("COUNT(*) as count, COALESCE(SUM(token_count), 0) as tokens").
		Scan(&stats).Error; err != nil {
		return err
	}

	// 更新对话统计
	return r.db.Model(&LatexConversation{}).
		Where("id = ?", conversationID).
		Updates(map[string]any{
			"message_count": stats.Count,
			"total_tokens":  stats.Tokens,
		}).Error
}

// ClearMessages 清空对话消息
func (r *ConversationRepository) ClearMessages(conversationID uint) error {
	// 删除所有消息
	if err := r.db.Where("conversation_id = ?", conversationID).
		Delete(&LatexChatMessage{}).Error; err != nil {
		return err
	}

	// 重置统计
	return r.db.Model(&LatexConversation{}).
		Where("id = ?", conversationID).
		Updates(map[string]any{
			"message_count": 0,
			"total_tokens":  0,
		}).Error
}

// DeleteConversation 删除对话（消息会级联删除）
func (r *ConversationRepository) DeleteConversation(conversationID uint) error {
	return r.db.Delete(&LatexConversation{}, conversationID).Error
}

// UpdateModelLevel 更新模型级别
func (r *ConversationRepository) UpdateModelLevel(conversationID uint, modelLevel string) error {
	return r.db.Model(&LatexConversation{}).
		Where("id = ?", conversationID).
		Update("model_level", modelLevel).Error
}
