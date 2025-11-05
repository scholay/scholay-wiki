package conversation

import (
	"database/sql/driver"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ConversationType represents the type of conversation
type ConversationType string

const (
	ConversationTypeChat   ConversationType = "chat"
	ConversationTypeSearch ConversationType = "search"
)

// Conversation represents a conversation between user and system
type Conversation struct {
	ID               uint             `gorm:"primaryKey" json:"id"`
	UserID           uint             `gorm:"not null;index:idx_user_id" json:"user_id"`
	Title            string           `gorm:"type:varchar(255);not null" json:"title"`
	ConversationType ConversationType `gorm:"type:varchar(20);not null;default:search;index:idx_conversation_type" json:"conversation_type"`
	ModelLevel       string           `gorm:"type:varchar(20);default:low" json:"model_level"` // Model level used: low, mid, high
	CreatedAt        time.Time        `json:"created_at"`
	UpdatedAt        time.Time        `json:"updated_at"`
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

// ConversationMessage represents a message in a conversation with chain support
type ConversationMessage struct {
	ID                  uint          `gorm:"primaryKey" json:"id"`
	MessageID           string        `gorm:"type:varchar(36);uniqueIndex;not null" json:"message_id"`
	ConversationID      uint          `gorm:"not null;index:idx_conversation_id" json:"conversation_id"`
	ParentMessageID     *string       `gorm:"type:varchar(36);index:idx_parent_message_id" json:"parent_message_id,omitempty"`
	Role                MessageRole   `gorm:"type:varchar(20);not null" json:"role"`
	Content             string        `gorm:"type:text;not null" json:"content"`
	SearchQuery         string        `gorm:"type:varchar(500)" json:"search_query,omitempty"`
	SearchResults       SearchResults `gorm:"type:json" json:"search_results,omitempty"`
	SearchResultsTotal  int           `gorm:"default:0" json:"search_results_total,omitempty"`
	TokenCount          int           `gorm:"default:0" json:"token_count,omitempty"`
	Model               string        `gorm:"type:varchar(50)" json:"model,omitempty"`
	FinishReason        string        `gorm:"type:varchar(20)" json:"finish_reason,omitempty"`
	Error               bool          `gorm:"default:false" json:"error"`
	Unfinished          bool          `gorm:"default:false" json:"unfinished"`
	CreatedAt           time.Time     `json:"created_at"`
	UpdatedAt           time.Time     `json:"updated_at"`
}

// BeforeCreate hook to generate message_id if not set
func (m *ConversationMessage) BeforeCreate(tx *gorm.DB) error {
	if m.MessageID == "" {
		m.MessageID = uuid.New().String()
	}
	return nil
}

// CreateConversationRequest represents the request to create a new conversation
type CreateConversationRequest struct {
	Title            string           `json:"title" binding:"required"`
	ConversationType ConversationType `json:"conversation_type"` // Optional, defaults to "search" if not provided
}

// CreateMessageRequest represents the request to add a message to a conversation
type CreateMessageRequest struct {
	Content          string  `json:"content" binding:"required"`
	ParentMessageID  *string `json:"parent_message_id,omitempty"` // For branching conversations
	SearchQuery      string  `json:"search_query"`
	SearchPapers     bool    `json:"search_papers"` // Whether to search papers via Semantic Scholar
}

// MessageChainResponse represents a message with its position in the chain
type MessageChainResponse struct {
	ConversationMessage
	Children []string `json:"children,omitempty"` // Child message IDs (for branching visualization)
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
