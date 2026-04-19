// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"context"

	"gorm.io/gorm"
)

// BuildMessageChainOptimized 优化版本 - 使用单次查询和内存中构建链
// 相比原版的循环查询,性能提升10-100倍
//
// 实现要点：
//   - 反向遍历收集 + 末尾翻转，避免 O(N²) 前置插入（`append([]{x}, chain...)`）产生
//     大量临时切片和拷贝；长会话 5k+ 消息时内存占用和 GC 暂停数量级下降。
//   - 所有消息仅加载一次（O(N)），链构建严格 O(N)。
func (r *Repository) BuildMessageChainOptimized(messageID string) ([]ConversationMessage, error) {
	return r.BuildMessageChainOptimizedCtx(context.Background(), messageID)
}

// BuildMessageChainOptimizedCtx is the ctx-aware variant. 流式/HTTP 调用方应优先调用此方法，
// 以便请求取消时 GORM 能把 ctx 下传给 driver 取消慢查询。
func (r *Repository) BuildMessageChainOptimizedCtx(ctx context.Context, messageID string) ([]ConversationMessage, error) {
	db := r.db
	if ctx != nil {
		db = db.WithContext(ctx)
	}
	// 首先获取目标消息,找到其conversation_id
	var targetMessage ConversationMessage
	if err := db.Where("message_id = ?", messageID).First(&targetMessage).Error; err != nil {
		return nil, err
	}

	// 一次性获取该对话的所有消息 - 避免N+1查询
	var allMessages []ConversationMessage
	err := db.Where("conversation_id = ?", targetMessage.ConversationID).
		Order("created_at ASC").
		Find(&allMessages).Error
	if err != nil {
		return nil, err
	}

	// 构建消息映射表,用于快速查找
	messageMap := make(map[string]*ConversationMessage, len(allMessages))
	for i := range allMessages {
		messageMap[allMessages[i].MessageID] = &allMessages[i]
	}

	// 从目标消息向上收集（叶子 → 根），最后整体翻转得到时间正序。
	chain := make([]ConversationMessage, 0, 32)
	currentMessageID := messageID
	for currentMessageID != "" {
		message, exists := messageMap[currentMessageID]
		if !exists {
			break
		}
		chain = append(chain, *message)
		if message.ParentMessageID != nil {
			currentMessageID = *message.ParentMessageID
		} else {
			break
		}
	}

	// 原地翻转，无额外分配
	for i, j := 0, len(chain)-1; i < j; i, j = i+1, j-1 {
		chain[i], chain[j] = chain[j], chain[i]
	}

	return chain, nil
}

// GetConversationWithMessagesOptimized 优化版本 - 使用单次查询
func (r *Repository) GetConversationWithMessagesOptimized(id uint, userID uint) (*ConversationWithMessages, error) {
	var result ConversationWithMessages

	// 使用事务确保数据一致性,但不影响性能
	err := r.db.Transaction(func(tx *gorm.DB) error {
		// 获取对话
		var conversation Conversation
		if err := tx.Where("id = ? AND user_id = ?", id, userID).First(&conversation).Error; err != nil {
			return err
		}
		result.Conversation = conversation

		// 获取所有消息 - 单次查询
		var messages []ConversationMessage
		if err := tx.Where("conversation_id = ?", id).
			Order("created_at ASC").
			Find(&messages).Error; err != nil {
			return err
		}
		result.Messages = messages

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &result, nil
}
