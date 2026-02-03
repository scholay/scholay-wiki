package latexwriter

import "time"

// LatexConversation LaTeX 对话模型
type LatexConversation struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"column:user_id;not null" json:"user_id"`
	DocumentID   uint      `gorm:"column:document_id;not null" json:"document_id"`
	Title        string    `gorm:"column:title;size:255" json:"title"`
	ModelLevel   string    `gorm:"column:model_level;size:20;default:mid" json:"model_level"`
	MessageCount uint      `gorm:"column:message_count;default:0" json:"message_count"`
	TotalTokens  uint      `gorm:"column:total_tokens;default:0" json:"total_tokens"`
	CreatedAt    time.Time `gorm:"column:created_at" json:"created_at"`
	UpdatedAt    time.Time `gorm:"column:updated_at" json:"updated_at"`
}

// TableName 指定表名
func (LatexConversation) TableName() string {
	return "latex_conversations"
}

// LatexChatMessage LaTeX 对话消息模型
type LatexChatMessage struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	ConversationID uint      `gorm:"column:conversation_id;not null" json:"conversation_id"`
	Role           string    `gorm:"column:role;type:enum('user','assistant','system');not null" json:"role"`
	Content        string    `gorm:"column:content;type:text;not null" json:"content"`
	ThinkContent   *string   `gorm:"column:think_content;type:text" json:"think_content,omitempty"`
	ReplyContent   *string   `gorm:"column:reply_content;type:text" json:"reply_content,omitempty"`
	CodeContent    *string   `gorm:"column:code_content;type:text" json:"code_content,omitempty"`
	TokenCount     uint      `gorm:"column:token_count;default:0" json:"token_count"`
	Model          string    `gorm:"column:model;size:100" json:"model,omitempty"`
	IsTruncated    bool      `gorm:"column:is_truncated;default:false" json:"is_truncated"`
	CreatedAt      time.Time `gorm:"column:created_at" json:"created_at"`
}

// TableName 指定表名
func (LatexChatMessage) TableName() string {
	return "latex_chat_messages"
}

// MessageRole 消息角色常量
const (
	RoleUser      = "user"
	RoleAssistant = "assistant"
	RoleSystem    = "system"
)

// ParsedMessage 解析后的 AI 消息结构
type ParsedMessage struct {
	Think string `json:"think,omitempty"`
	Reply string `json:"reply,omitempty"`
	Code  string `json:"code,omitempty"`
	Raw   string `json:"raw"`
}

// ContextMessage 上下文消息（用于构建 AI 请求）
type ContextMessage struct {
	Role        string `json:"role"`
	Content     string `json:"content"`
	IsTruncated bool   `json:"is_truncated,omitempty"`
}

// ConversationHistoryResponse 对话历史响应
type ConversationHistoryResponse struct {
	Conversation *LatexConversation `json:"conversation"`
	Messages     []LatexChatMessage `json:"messages"`
	Total        int64              `json:"total"`
	Page         int                `json:"page"`
	PageSize     int                `json:"page_size"`
	HasMore      bool               `json:"has_more"`
}
