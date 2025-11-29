package ai

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// TemplateVariables represents template variables as JSON
type TemplateVariables map[string]interface{}

// Scan implements sql.Scanner for Variables field
func (v *TemplateVariables) Scan(value interface{}) error {
	if value == nil {
		*v = nil
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}

	return json.Unmarshal(bytes, v)
}

// Value implements driver.Valuer for Variables field
func (v TemplateVariables) Value() (driver.Value, error) {
	if v == nil {
		return nil, nil
	}
	return json.Marshal(v)
}

// PromptTemplate represents an AI prompt template
type PromptTemplate struct {
	ID          uint              `gorm:"primaryKey" json:"id"`
	Name        string            `gorm:"type:varchar(100);not null" json:"name"`
	Key         string            `gorm:"type:varchar(50);not null;uniqueIndex:idx_key" json:"key"`
	Template    string            `gorm:"type:text;not null" json:"template"`
	Description string            `gorm:"type:text" json:"description"`
	Variables   TemplateVariables `gorm:"type:json" json:"variables"`
	IsActive    int               `gorm:"default:1;index:idx_active" json:"is_active"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

// MessageContent represents content that can be either text or multimodal
type MessageContent interface{}

// TextContent represents plain text content
type TextContent struct {
	Type string `json:"type"` // "text"
	Text string `json:"text"`
}

// ImageURLContent represents image URL content
type ImageURLContent struct {
	Type     string `json:"type"` // "image_url"
	ImageURL struct {
		URL    string `json:"url"`    // can be http URL or base64 data URL
		Detail string `json:"detail"` // "auto", "low", "high"
	} `json:"image_url"`
}

// ChatMessage represents a message in OpenAI chat format
// Content can be either string (for simple text) or []MessageContent (for multimodal)
type ChatMessage struct {
	Role    string         `json:"role"`    // system, user, assistant
	Content MessageContent `json:"content"` // string or array of content parts
}

// Message is an alias for ChatMessage for convenience
type Message = ChatMessage

// Tool represents an OpenAI function/tool definition
type Tool struct {
	Type     string       `json:"type"` // "function"
	Function ToolFunction `json:"function"`
}

// ToolFunction represents a function definition
type ToolFunction struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// ChatCompletionRequest represents OpenAI chat completion request
type ChatCompletionRequest struct {
	Model       string        `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Stream      bool          `json:"stream"`
	Temperature float32       `json:"temperature,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
	Tools       []Tool        `json:"tools,omitempty"`
	ToolChoice  string        `json:"tool_choice,omitempty"` // "auto", "none", or specific tool
}

// ToolCall represents a tool call in the response
type ToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

// ChatCompletionResponse represents a non-streaming response
type ChatCompletionResponse struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index   int `json:"index"`
		Message struct {
			Role      string     `json:"role"`
			Content   string     `json:"content"`
			ToolCalls []ToolCall `json:"tool_calls,omitempty"`
		} `json:"message"`
		FinishReason string `json:"finish_reason,omitempty"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// ChatCompletionChunk represents a streaming response chunk
type ChatCompletionChunk struct {
	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`
	Choices []struct {
		Index int `json:"index"`
		Delta struct {
			Role      string     `json:"role,omitempty"`
			Content   string     `json:"content,omitempty"`
			ToolCalls []ToolCall `json:"tool_calls,omitempty"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason,omitempty"`
	} `json:"choices"`
}

// PaperAnalysis 论文AI分析结果存储表
// 用于缓存论文摘要的AI分析结果，避免重复请求大模型
// 采用动态维度设计：使用 dimension_hash 标识维度配置，analysis_data 存储JSON格式的分析结果
type PaperAnalysis struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	PaperID       string    `gorm:"type:varchar(100);not null;uniqueIndex:uk_paper_dimension,priority:1" json:"paperId"`
	PaperTitle    string    `gorm:"type:varchar(500)" json:"paperTitle"`
	DimensionHash string    `gorm:"type:varchar(32);not null;uniqueIndex:uk_paper_dimension,priority:2;index:idx_dimension_hash" json:"dimensionHash"` // 维度配置哈希，用于判断缓存是否匹配
	AnalysisData  string    `gorm:"type:text" json:"analysisData"`                                                                                      // JSON格式的分析结果 {"dimensionKey": "分析内容", ...}
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// TableName 指定表名
func (PaperAnalysis) TableName() string {
	return "paper_analysis"
}

// AnalysisDimension 分析维度定义表
// 支持系统默认维度和用户自定义维度
// user_id = -1 表示系统默认维度，user_id > 0 表示用户自定义维度
type AnalysisDimension struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       int64     `gorm:"index:idx_user_id;default:-1" json:"userId"`                         // -1表示系统默认维度，>0表示用户自定义
	DimensionKey string    `gorm:"type:varchar(50);not null;uniqueIndex:uk_user_dimension,priority:2" json:"dimensionKey"` // 维度标识符
	Name         string    `gorm:"type:varchar(100);not null" json:"name"`                             // 维度名称
	Description  string    `gorm:"type:text;not null" json:"description"`                              // 维度解释/分析指示
	SortOrder    int       `gorm:"default:0;index:idx_sort_order" json:"sortOrder"`                    // 排序顺序
	IsActive     bool      `gorm:"default:true" json:"isActive"`                                       // 是否启用
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// TableName 指定表名
func (AnalysisDimension) TableName() string {
	return "analysis_dimensions"
}
