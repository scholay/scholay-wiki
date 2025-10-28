package conversation

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// Conversation represents a conversation between user and system
type Conversation struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null;index:idx_user_id" json:"user_id"`
	Title     string    `gorm:"type:varchar(255);not null" json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// MessageRole represents the role of a message sender
type MessageRole string

const (
	MessageRoleUser      MessageRole = "user"
	MessageRoleAssistant MessageRole = "assistant"
	MessageRoleSystem    MessageRole = "system"
)

// SearchResults represents Semantic Scholar search results stored as JSON
type SearchResults []map[string]interface{}

// Scan implements sql.Scanner interface
func (s *SearchResults) Scan(value interface{}) error {
	if value == nil {
		*s = nil
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}

	return json.Unmarshal(bytes, s)
}

// Value implements driver.Valuer interface
func (s SearchResults) Value() (driver.Value, error) {
	if s == nil {
		return nil, nil
	}
	return json.Marshal(s)
}

// ConversationMessage represents a message in a conversation
type ConversationMessage struct {
	ID                  uint          `gorm:"primaryKey" json:"id"`
	ConversationID      uint          `gorm:"not null;index:idx_conversation_id" json:"conversation_id"`
	Role                MessageRole   `gorm:"type:varchar(20);not null" json:"role"`
	Content             string        `gorm:"type:text;not null" json:"content"`
	SearchQuery         string        `gorm:"type:varchar(500)" json:"search_query,omitempty"`
	SearchResults       SearchResults `gorm:"type:json" json:"search_results,omitempty"`
	SearchResultsTotal  int           `gorm:"default:0" json:"search_results_total,omitempty"`
	CreatedAt           time.Time     `json:"created_at"`
}

// CreateConversationRequest represents the request to create a new conversation
type CreateConversationRequest struct {
	Title string `json:"title" binding:"required"`
}

// CreateMessageRequest represents the request to add a message to a conversation
type CreateMessageRequest struct {
	Content     string                   `json:"content" binding:"required"`
	SearchQuery string                   `json:"search_query"`
	SearchPapers bool                    `json:"search_papers"` // Whether to search papers via Semantic Scholar
}

// ConversationWithMessages represents a conversation with its messages
type ConversationWithMessages struct {
	Conversation
	Messages []ConversationMessage `json:"messages"`
}

// ConversationListResponse represents a list of conversations
type ConversationListResponse struct {
	Conversations []Conversation `json:"conversations"`
	Total         int64          `json:"total"`
}
