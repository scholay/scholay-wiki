// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package conversation

import (
	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
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

	// Get conversations ordered by updated_at DESC
	err := query.Order("updated_at DESC").
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

// GetConversationMessages gets all messages for a conversation
func (r *Repository) GetConversationMessages(conversationID uint) ([]ConversationMessage, error) {
	var messages []ConversationMessage
	err := r.db.Where("conversation_id = ?", conversationID).
		Order("created_at ASC").
		Find(&messages).Error
	if err != nil {
		return nil, err
	}
	return messages, nil
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
func (r *Repository) UpdateMessageSearchResults(conversationID uint, query string, papers []map[string]interface{}, total int) error {
	// Find the latest user message with matching query
	var message ConversationMessage
	err := r.db.Where("conversation_id = ? AND role = ? AND search_query = ?", conversationID, MessageRoleUser, query).
		Order("created_at DESC").
		First(&message).Error
	if err != nil {
		return err
	}

	// Convert papers to SearchResults
	searchResults := make(SearchResults, len(papers))
	for i, paper := range papers {
		searchResults[i] = paper
	}

	// Update the message with search results
	return r.db.Model(&message).Updates(map[string]interface{}{
		"search_results":       searchResults,
		"search_results_total": total,
	}).Error
}

// UpdateMessageSearchResultsByID updates the search results for a specific message by its ID
func (r *Repository) UpdateMessageSearchResultsByID(messageID uint, papers []map[string]interface{}, total int) error {
	// Convert papers to SearchResults
	searchResults := make(SearchResults, len(papers))
	for i, paper := range papers {
		searchResults[i] = paper
	}

	// Update the message with search results
	return r.db.Model(&ConversationMessage{}).Where("id = ?", messageID).Updates(map[string]interface{}{
		"search_results":       searchResults,
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
func (r *Repository) BuildMessageChain(messageID string) ([]ConversationMessage, error) {
	var chain []ConversationMessage
	currentMessageID := messageID

	// Traverse backwards through parent messages
	for currentMessageID != "" {
		message, err := r.GetMessageByMessageID(currentMessageID)
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				break
			}
			return nil, err
		}

		// Prepend to chain (to maintain chronological order)
		chain = append([]ConversationMessage{*message}, chain...)

		// Move to parent
		if message.ParentMessageID != nil {
			currentMessageID = *message.ParentMessageID
		} else {
			break
		}
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

// UpsertMessage creates or updates a message by message_id
func (r *Repository) UpsertMessage(message *ConversationMessage) error {
	// Check if message exists
	var existing ConversationMessage
	err := r.db.Where("message_id = ?", message.MessageID).First(&existing).Error

	if err == gorm.ErrRecordNotFound {
		// Create new message
		return r.db.Create(message).Error
	} else if err != nil {
		return err
	}

	// Update existing message
	message.ID = existing.ID // Preserve the primary key
	return r.db.Save(message).Error
}

// GetMessageChildren gets all children of a message for building the message tree
func (r *Repository) GetMessageChildren(conversationID uint, messageID string) ([]ConversationMessage, error) {
	return r.GetMessagesByParentID(conversationID, messageID)
}

// GetAllMessagesForTree gets all messages in a conversation for building a complete tree
func (r *Repository) GetAllMessagesForTree(conversationID uint) ([]ConversationMessage, error) {
	var messages []ConversationMessage
	err := r.db.Where("conversation_id = ?", conversationID).
		Order("created_at ASC").
		Find(&messages).Error
	if err != nil {
		return nil, err
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

// UpdateMessageFollowUpQuestions updates the follow_up_questions field of a message
func (r *Repository) UpdateMessageFollowUpQuestions(messageID uint, questions string) error {
	return r.db.Model(&ConversationMessage{}).
		Where("id = ?", messageID).
		Update("follow_up_questions", questions).Error
}
