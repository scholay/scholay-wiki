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

// GetUserConversations gets all conversations for a user
func (r *Repository) GetUserConversations(userID uint, limit, offset int) ([]Conversation, int64, error) {
	var conversations []Conversation
	var total int64

	// Get total count
	if err := r.db.Model(&Conversation{}).Where("user_id = ?", userID).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// Get conversations ordered by updated_at DESC
	err := r.db.Where("user_id = ?", userID).
		Order("updated_at DESC").
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
