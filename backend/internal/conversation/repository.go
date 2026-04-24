// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"scholar-backend/internal/common/database"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// WithCtx 返回一个绑定 context 的 Repository 副本。GORM 的 WithContext 会把 ctx 传给
// 底层驱动，客户端断开或上游超时时正在执行的 SQL 会被 driver.Cancel（对 MySQL 是 KILL QUERY），
// 避免 SSE 断开后慢查询还在后端吃资源。调用方在 HTTP handler/流式路径中应优先使用 WithCtx。
func (r *Repository) WithCtx(ctx context.Context) *Repository {
	if ctx == nil {
		return r
	}
	return &Repository{db: r.db.WithContext(ctx)}
}

// CreateConversation creates a new conversation
func (r *Repository) CreateConversation(conversation *Conversation) error {
	return r.db.Create(conversation).Error
}

// GetConversationByID gets a conversation by ID
func (r *Repository) GetConversationByID(id uint, userID uint) (*Conversation, error) {
	var conversation Conversation
	err := r.db.Where("id = ? AND user_id = ?", id, userID).First(&conversation).Error
	if err != nil {
		return nil, err
	}
	return &conversation, nil
}

// GetUserConversations gets all conversations for a user, optionally filtered by type
func (r *Repository) GetUserConversations(userID uint, limit, offset int, conversationType *ConversationType) ([]Conversation, int64, error) {
	var conversations []Conversation
	var total int64

	// Build base query
	query := r.db.Model(&Conversation{}).Where("user_id = ?", userID)

	// Add conversation type filter if provided
	if conversationType != nil {
		query = query.Where("conversation_type = ?", *conversationType)
	}

	// Get total count
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get conversations ordered by updated_at DESC, id DESC tiebreaker
	// 没有 id tiebreaker 时，并发更新可能让 OFFSET 分页漏掉/重复同 updated_at 的记录。
	err := query.Order("updated_at DESC, id DESC").
		Limit(limit).
		Offset(offset).
		Find(&conversations).Error

	if err != nil {
		return nil, 0, err
	}

	return conversations, total, nil
}

// UpdateConversation updates a conversation
func (r *Repository) UpdateConversation(conversation *Conversation) error {
	return r.db.Save(conversation).Error
}

// DeleteConversation deletes a conversation and its messages
func (r *Repository) DeleteConversation(id uint, userID uint) error {
	return r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&Conversation{}).Error
}

// CreateMessage creates a new message in a conversation
func (r *Repository) CreateMessage(message *ConversationMessage) error {
	return r.db.Create(message).Error
}

// GetConversationMessages gets messages for a conversation (capped to avoid OOM on very long conversations).
// 上限 5000 条足以支撑绝大多数对话；需要完整翻页请用 GetConversationMessagesPaginated。
const maxConversationMessagesPerLoad = 5000

func (r *Repository) GetConversationMessages(conversationID uint) ([]ConversationMessage, error) {
	var messages []ConversationMessage
	err := r.db.Where("conversation_id = ?", conversationID).
		Order("created_at ASC").
		Limit(maxConversationMessagesPerLoad).
		Find(&messages).Error
	if err != nil {
		return nil, err
	}
	return messages, nil
}

// GetConversationMessagesPaginated gets messages with pagination (newest first)
// Returns messages in DESC order (newest first), total count, and error
// page starts from 1, pageSize is the number of messages per page
func (r *Repository) GetConversationMessagesPaginated(conversationID uint, page, pageSize int) ([]ConversationMessage, int64, error) {
	var messages []ConversationMessage
	var total int64

	// Get total count
	if err := r.db.Model(&ConversationMessage{}).Where("conversation_id = ?", conversationID).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get messages ordered by created_at DESC, id DESC tiebreaker
	// 同一会话内连续写入消息可能 created_at 相同（毫秒级冲突），无 tiebreaker 会漏页。
	err := r.db.Where("conversation_id = ?", conversationID).
		Order("created_at DESC, id DESC").
		Scopes(database.Paginate(page, pageSize)).
		Find(&messages).Error
	if err != nil {
		return nil, 0, err
	}

	return messages, total, nil
}

// GetConversationMessagesCount gets the total count of messages for a conversation
func (r *Repository) GetConversationMessagesCount(conversationID uint) (int64, error) {
	var count int64
	err := r.db.Model(&ConversationMessage{}).Where("conversation_id = ?", conversationID).Count(&count).Error
	return count, err
}

// GetConversationWithMessages gets a conversation with all its messages
func (r *Repository) GetConversationWithMessages(id uint, userID uint) (*ConversationWithMessages, error) {
	// Get conversation
	conversation, err := r.GetConversationByID(id, userID)
	if err != nil {
		return nil, err
	}

	// Get messages
	messages, err := r.GetConversationMessages(id)
	if err != nil {
		return nil, err
	}

	return &ConversationWithMessages{
		Conversation: *conversation,
		Messages:     messages,
	}, nil
}

// TouchConversation updates the updated_at timestamp
func (r *Repository) TouchConversation(id uint) error {
	return r.db.Model(&Conversation{}).Where("id = ?", id).Update("updated_at", gorm.Expr("NOW()")).Error
}

// UpdateMessageSearchResults updates the search results for the latest user message in a conversation
func (r *Repository) UpdateMessageSearchResults(conversationID uint, query string, papers []map[string]any, total int) error {
	// Find the latest user message with matching query
	var message ConversationMessage
	err := r.db.Where("conversation_id = ? AND role = ? AND search_query = ?", conversationID, MessageRoleUser, query).
		Order("created_at DESC").
		First(&message).Error
	if err != nil {
		return err
	}

	// SearchResults 的底层类型就是 []map[string]any，直接类型转换零拷贝，
	// 避免原实现中 make + for-loop 的 O(N) 复制（大 papers 切片下浪费内存和 GC 压力）。
	searchResults := SearchResults(papers)

	// Update the message with search results
	return r.db.Model(&message).Updates(map[string]any{
		"search_results":       searchResults,
		"search_results_total": total,
	}).Error
}

// UpdateMessageSearchResultsByID updates the search results for a specific message by its ID
func (r *Repository) UpdateMessageSearchResultsByID(messageID uint, papers []map[string]any, total int) error {
	// 同上，零拷贝类型转换
	searchResults := SearchResults(papers)

	// Update the message with search results
	return r.db.Model(&ConversationMessage{}).Where("id = ?", messageID).Updates(map[string]any{
		"search_results":       searchResults,
		"search_results_total": total,
	}).Error
}

// UpdateMessageSearchPaperIDs updates only the paper IDs for a specific message
// This is used for optimized storage - only IDs are saved, frontend fetches details
func (r *Repository) UpdateMessageSearchPaperIDs(messageID uint, paperIDs []string, total int) error {
	return r.db.Model(&ConversationMessage{}).Where("id = ?", messageID).Updates(map[string]any{
		"search_paper_ids":     SearchPaperIDs(paperIDs),
		"search_results_total": total,
	}).Error
}

// GetMessageByMessageID gets a message by its UUID message_id
func (r *Repository) GetMessageByMessageID(messageID string) (*ConversationMessage, error) {
	var message ConversationMessage
	err := r.db.Where("message_id = ?", messageID).First(&message).Error
	if err != nil {
		return nil, err
	}
	return &message, nil
}

// GetMessagesByParentID gets all messages with a specific parent_message_id
func (r *Repository) GetMessagesByParentID(conversationID uint, parentMessageID string) ([]ConversationMessage, error) {
	var messages []ConversationMessage
	err := r.db.Where("conversation_id = ? AND parent_message_id = ?", conversationID, parentMessageID).
		Order("created_at ASC").
		Find(&messages).Error
	if err != nil {
		return nil, err
	}
	return messages, nil
}

// BuildMessageChain builds the complete message chain from root to a specific message
// Returns messages in chronological order (oldest to newest)
//
// 注意：N+1 查询。生产路径请使用 BuildMessageChainOptimized。此版本保留为兜底/对比基准。
// 这里仍然采用"反向收集 + 翻转"避免 O(N²) 前置插入。
func (r *Repository) BuildMessageChain(messageID string) ([]ConversationMessage, error) {
	chain := make([]ConversationMessage, 0, 32)
	currentMessageID := messageID

	for currentMessageID != "" {
		message, err := r.GetMessageByMessageID(currentMessageID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				break
			}
			return nil, err
		}
		chain = append(chain, *message)
		if message.ParentMessageID != nil {
			currentMessageID = *message.ParentMessageID
		} else {
			break
		}
	}

	for i, j := 0, len(chain)-1; i < j; i, j = i+1, j-1 {
		chain[i], chain[j] = chain[j], chain[i]
	}

	return chain, nil
}

// GetLatestMessageInConversation gets the most recent message in a conversation
func (r *Repository) GetLatestMessageInConversation(conversationID uint) (*ConversationMessage, error) {
	var message ConversationMessage
	err := r.db.Where("conversation_id = ?", conversationID).
		Order("created_at DESC, id DESC").
		First(&message).Error
	if err != nil {
		return nil, err
	}
	return &message, nil
}

// UpdateMessage updates a message (for upsert-like behavior)
func (r *Repository) UpdateMessage(message *ConversationMessage) error {
	return r.db.Save(message).Error
}

// UpsertMessage creates or updates a message by message_id.
// 使用 GORM clause.OnConflict 的 ON DUPLICATE KEY UPDATE 单次 SQL 原子 upsert，
// 避免原 "先 SELECT 再 Create/Save" 的双查询 + TOCTOU 窗口（高并发同 message_id 下可能重复插入）。
func (r *Repository) UpsertMessage(message *ConversationMessage) error {
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "message_id"}},
		UpdateAll: true,
	}).Create(message).Error
}

// GetMessageChildren gets all children of a message for building the message tree
func (r *Repository) GetMessageChildren(conversationID uint, messageID string) ([]ConversationMessage, error) {
	return r.GetMessagesByParentID(conversationID, messageID)
}

// MaxTreeMessages 构建消息树时的硬上限。超过此上限意味着会话消息量异常（或恶意），
// 加载全量会占用数百 MB 内存并卡住请求。命中上限时返回最新的 N 条，前端可按需扩展。
const MaxTreeMessages = 2000

// GetAllMessagesForTree gets messages in a conversation for building the message tree.
// Caps at MaxTreeMessages latest messages to avoid OOM on pathological conversations.
// Returns messages in chronological order (oldest → newest).
func (r *Repository) GetAllMessagesForTree(conversationID uint) ([]ConversationMessage, error) {
	return r.GetMessagesForTreeWithContext(context.Background(), conversationID, MaxTreeMessages)
}

// GetMessagesForTreeWithContext is the ctx-aware, bounded variant used by new callers.
// 默认加载最近 limit 条消息（DESC → 内存翻转回 ASC），避免一次性拉几万条消息。
func (r *Repository) GetMessagesForTreeWithContext(ctx context.Context, conversationID uint, limit int) ([]ConversationMessage, error) {
	if limit <= 0 || limit > MaxTreeMessages {
		limit = MaxTreeMessages
	}
	var messages []ConversationMessage
	err := r.db.WithContext(ctx).
		Where("conversation_id = ?", conversationID).
		Order("created_at DESC, id DESC").
		Limit(limit).
		Find(&messages).Error
	if err != nil {
		return nil, err
	}
	// 翻转成 ASC 保持与旧签名一致
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}
	return messages, nil
}

// GetSiblingMessages gets all sibling messages (same parent_message_id) for a given message
// Returns messages ordered by created_at, useful for branch navigation
func (r *Repository) GetSiblingMessages(messageID string) ([]ConversationMessage, error) {
	// First get the target message to find its parent
	targetMessage, err := r.GetMessageByMessageID(messageID)
	if err != nil {
		return nil, err
	}

	// If no parent, this is a root message - no siblings
	if targetMessage.ParentMessageID == nil {
		return []ConversationMessage{*targetMessage}, nil
	}

	// Get all messages with the same parent
	var siblings []ConversationMessage
	err = r.db.Where("conversation_id = ? AND parent_message_id = ?",
		targetMessage.ConversationID,
		*targetMessage.ParentMessageID).
		Order("created_at ASC").
		Find(&siblings).Error

	if err != nil {
		return nil, err
	}

	return siblings, nil
}

// GetLatestLeafFromMessage finds the latest leaf node (deepest child) starting from a message
// This is used for branch navigation to show the complete path of a sibling branch
func (r *Repository) GetLatestLeafFromMessage(messageID string) (string, error) {
	currentMessageID := messageID

	for {
		// Get children of current message
		message, err := r.GetMessageByMessageID(currentMessageID)
		if err != nil {
			return "", err
		}

		var children []ConversationMessage
		err = r.db.Where("conversation_id = ? AND parent_message_id = ?",
			message.ConversationID, currentMessageID).
			Order("created_at DESC"). // Get latest child first
			Find(&children).Error

		if err != nil {
			return "", err
		}

		// If no children, this is a leaf node
		if len(children) == 0 {
			return currentMessageID, nil
		}

		// Continue with the latest child
		currentMessageID = children[0].MessageID
	}
}

// ClearOldFollowUpQuestions clears follow_up_questions field from all previous messages in a conversation
// This ensures only the latest assistant message shows follow-up questions
func (r *Repository) ClearOldFollowUpQuestions(conversationID uint) error {
	return r.db.Model(&ConversationMessage{}).
		Where("conversation_id = ? AND role = ? AND follow_up_questions IS NOT NULL AND follow_up_questions != ?",
			conversationID, MessageRoleAssistant, "").
		Update("follow_up_questions", "").Error
}

// GetMessageByID gets a message by its numeric ID
func (r *Repository) GetMessageByID(id uint) (*ConversationMessage, error) {
	var message ConversationMessage
	err := r.db.Where("id = ?", id).First(&message).Error
	if err != nil {
		return nil, err
	}
	return &message, nil
}

// RecentConversationItem is a lightweight DTO for task history
type RecentConversationItem struct {
	ID        uint      `json:"id"`
	Title     string    `json:"title"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GetRecentByUserAndType returns recent conversations of a given type for a user since a start date
func (r *Repository) GetRecentByUserAndType(userID uint, convType string, since time.Time) ([]RecentConversationItem, error) {
	var items []RecentConversationItem
	err := r.db.Table("conversations").
		Select("id, title, updated_at").
		Where("user_id = ? AND conversation_type = ? AND updated_at >= ?", userID, convType, since).
		Order("updated_at DESC").
		Scan(&items).Error
	return items, err
}

// UpdateMessageFollowUpQuestions updates the follow_up_questions field of a message
func (r *Repository) UpdateMessageFollowUpQuestions(messageID uint, questions string) error {
	return r.db.Model(&ConversationMessage{}).
		Where("id = ?", messageID).
		Update("follow_up_questions", questions).Error
}

// UpdateConversationTitle updates only the title of a conversation
func (r *Repository) UpdateConversationTitle(conversationID uint, title string) error {
	return r.db.Model(&Conversation{}).Where("id = ?", conversationID).Update("title", title).Error
}
