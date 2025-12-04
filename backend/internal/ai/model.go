// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
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

// FileContent represents file content (for PDF and other documents)
// This follows the OpenAI file input format for vision models
type FileContent struct {
	Type string          `json:"type"` // "file"
	File FileContentData `json:"file"`
}

// FileContentData represents the file data structure
type FileContentData struct {
	URL      string `json:"url,omitempty"`      // base64 data URL: data:application/pdf;base64,...
	FileData string `json:"file_data,omitempty"` // alternative: raw base64 data
	Filename string `json:"filename,omitempty"` // optional filename
}

// InputFileContent 输入文件内容（用于文档类文件如PDF，OpenAI格式）
type InputFileContent struct {
	Type     string `json:"type"`      // "input_file"
	MimeType string `json:"mime_type"` // MIME类型，如 "application/pdf"
	Data     string `json:"data"`      // base64编码的文件内容
}

// DocumentContent Claude文档内容格式
type DocumentContent struct {
	Type   string             `json:"type"`   // "document"
	Source DocumentSourceData `json:"source"` // 文档来源
}

// DocumentSourceData Claude文档来源数据
type DocumentSourceData struct {
	Type      string `json:"type"`       // "base64"
	MediaType string `json:"media_type"` // MIME类型，如 "application/pdf"
	Data      string `json:"data"`       // base64编码的文件内容
}

// FileInputMeta 文件输入元数据（用于在消息中标记需要转换的文件）
type FileInputMeta struct {
	Type     string `json:"type"`      // "file_input_meta" 内部标记类型
	MimeType string `json:"mime_type"` // MIME类型
	Data     string `json:"data"`      // base64编码的文件内容
}

// IsClaudeModel 判断是否是 Claude 模型
func IsClaudeModel(modelName string) bool {
	modelLower := strings.ToLower(modelName)
	return strings.Contains(modelLower, "claude")
}

// ConvertMessagesForModel 根据模型类型转换消息格式
func ConvertMessagesForModel(messages []ChatMessage, modelName string) []ChatMessage {
	isClaude := IsClaudeModel(modelName)
	
	result := make([]ChatMessage, len(messages))
	for i, msg := range messages {
		result[i] = ChatMessage{
			Role: msg.Role,
		}
		
		// 检查 Content 是否是数组类型
		if contentArray, ok := msg.Content.([]interface{}); ok {
			newContent := make([]interface{}, 0, len(contentArray))
			for _, part := range contentArray {
				// 检查是否是 FileInputMeta 类型
				if partMap, ok := part.(map[string]interface{}); ok {
					if partMap["type"] == "file_input_meta" {
						// 转换文件内容
						mimeType, _ := partMap["mime_type"].(string)
						data, _ := partMap["data"].(string)
						
						if isClaude {
							// Claude 格式
							newContent = append(newContent, DocumentContent{
								Type: "document",
								Source: DocumentSourceData{
									Type:      "base64",
									MediaType: mimeType,
									Data:      data,
								},
							})
						} else {
							// OpenAI/GPT 格式 - 使用 image_url 格式传递
							newContent = append(newContent, map[string]interface{}{
								"type": "image_url",
								"image_url": map[string]interface{}{
									"url":    fmt.Sprintf("data:%s;base64,%s", mimeType, data),
									"detail": "high",
								},
							})
						}
						continue
					}
				}
				
				// 检查是否是 FileInputMeta 结构体
				if fileMeta, ok := part.(FileInputMeta); ok {
					if isClaude {
						newContent = append(newContent, DocumentContent{
							Type: "document",
							Source: DocumentSourceData{
								Type:      "base64",
								MediaType: fileMeta.MimeType,
								Data:      fileMeta.Data,
							},
						})
					} else {
						newContent = append(newContent, map[string]interface{}{
							"type": "image_url",
							"image_url": map[string]interface{}{
								"url":    fmt.Sprintf("data:%s;base64,%s", fileMeta.MimeType, fileMeta.Data),
								"detail": "high",
							},
						})
					}
					continue
				}
				
				// 其他类型保持不变
				newContent = append(newContent, part)
			}
			result[i].Content = newContent
		} else {
			// 字符串内容保持不变
			result[i].Content = msg.Content
		}
	}
	
	return result
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
