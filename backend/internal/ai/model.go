// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import (
	"fmt"
	"log/slog"
	"strings"
	"time"
)

// MessageContent represents content that can be either text or multimodal
type MessageContent any

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
	FileName string `json:"file_name"` // 文件名（用于GPT模型）
}

// IsClaudeModel 判断是否是 Claude 模型
func IsClaudeModel(modelName string) bool {
	modelLower := strings.ToLower(modelName)
	return strings.Contains(modelLower, "claude")
}

// IsGPTSupportedMimeType 判断 GPT 模型是否支持该 MIME 类型直接传递
// GPT 模型只支持 PDF 和图片直接传递，其他文档格式需要提取文本
func IsGPTSupportedMimeType(mimeType string) bool {
	// 图片格式支持
	if strings.HasPrefix(mimeType, "image/") {
		return true
	}
	// PDF 格式支持
	if mimeType == "application/pdf" {
		return true
	}
	// 其他格式（Word、Excel等）不支持直接传递
	return false
}

// getFileExtFromMimeType 根据 MIME 类型获取文件扩展名
func getFileExtFromMimeType(mimeType string) string {
	switch mimeType {
	case "application/pdf":
		return ".pdf"
	case "application/msword":
		return ".doc"
	case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		return ".docx"
	case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
		return ".xlsx"
	case "application/vnd.ms-excel":
		return ".xls"
	case "text/plain":
		return ".txt"
	case "application/rtf":
		return ".rtf"
	case "application/vnd.oasis.opendocument.text":
		return ".odt"
	default:
		// 从 MIME 类型推断扩展名
		if strings.HasPrefix(mimeType, "image/") {
			return "." + strings.TrimPrefix(mimeType, "image/")
		}
		return ""
	}
}

// fileCounter 用于生成唯一文件名的计数器
var fileCounter int

// getDefaultFileName 根据 MIME 类型生成唯一的默认文件名（仅在 FileName 为空时使用）
func getDefaultFileName(mimeType string) string {
	fileCounter++
	ext := getFileExtFromMimeType(mimeType)
	if ext == "" {
		return fmt.Sprintf("document_%d", fileCounter)
	}
	return fmt.Sprintf("document_%d%s", fileCounter, ext)
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
		if contentArray, ok := msg.Content.([]any); ok {
			newContent := make([]any, 0, len(contentArray))
			for _, part := range contentArray {
				// 检查是否是 FileInputMeta 类型
				if partMap, ok := part.(map[string]any); ok {
					if partMap["type"] == "file_input_meta" {
						// 转换文件内容
						mimeType, _ := partMap["mime_type"].(string)
						data, _ := partMap["data"].(string)
						fileName, _ := partMap["file_name"].(string)
						if fileName == "" {
							fileName = getDefaultFileName(mimeType)
						}
						
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
						// OpenAI/GPT 格式 - 根据文件类型选择不同格式
						// 注意：OpenAI 的 file 格式只支持 PDF，不支持 Word 等其他文档格式
						if strings.HasPrefix(mimeType, "image/") {
							// 图片使用 image_url 格式
							newContent = append(newContent, map[string]any{
								"type": "image_url",
								"image_url": map[string]any{
									"url":    fmt.Sprintf("data:%s;base64,%s", mimeType, data),
									"detail": "high",
								},
							})
						} else if mimeType == "application/pdf" {
							// 只有 PDF 可以使用 file 格式
							newContent = append(newContent, map[string]any{
								"type": "file",
								"file": map[string]any{
									"file_data": fmt.Sprintf("data:%s;base64,%s", mimeType, data),
									"filename":  fileName,
								},
							})
						} else {
							slog.Warn("GPT model does not support file type, skipping", "mimeType", mimeType)
						}
					}
						continue
					}
				}
				
				// 检查是否是 FileInputMeta 结构体
				if fileMeta, ok := part.(FileInputMeta); ok {
					fileName := fileMeta.FileName
					if fileName == "" {
						fileName = getDefaultFileName(fileMeta.MimeType)
					}
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
						// OpenAI/GPT 格式 - 根据文件类型选择不同格式
						// 注意：OpenAI 的 file 格式只支持 PDF，不支持 Word 等其他文档格式
						if strings.HasPrefix(fileMeta.MimeType, "image/") {
							// 图片使用 image_url 格式
							newContent = append(newContent, map[string]any{
								"type": "image_url",
								"image_url": map[string]any{
									"url":    fmt.Sprintf("data:%s;base64,%s", fileMeta.MimeType, fileMeta.Data),
									"detail": "high",
								},
							})
						} else if fileMeta.MimeType == "application/pdf" {
							// 只有 PDF 可以使用 file 格式
							newContent = append(newContent, map[string]any{
								"type": "file",
								"file": map[string]any{
									"file_data": fmt.Sprintf("data:%s;base64,%s", fileMeta.MimeType, fileMeta.Data),
									"filename":  fileName,
								},
							})
					} else {
						slog.Warn("GPT model does not support file type, skipping", "mimeType", fileMeta.MimeType)
						}
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
	Parameters  map[string]any `json:"parameters"`
}

// ChatCompletionRequest represents OpenAI chat completion request
type ChatCompletionRequest struct {
	Model         string         `json:"model"`
	Messages      []ChatMessage  `json:"messages"`
	Stream        bool           `json:"stream"`
	Temperature   float32        `json:"temperature,omitempty"`
	MaxTokens     int            `json:"max_tokens,omitempty"`
	Tools         []Tool         `json:"tools,omitempty"`
	ToolChoice    string         `json:"tool_choice,omitempty"` // "auto", "none", or specific tool
	StreamOptions *StreamOptions `json:"stream_options,omitempty"`
}

// StreamOptions 对应 OpenAI 兼容的 stream_options。IncludeUsage=true 让上游在流末尾
// 追发一个 choices 为空、带 usage 的 chunk —— 这是流式拿 token 用量的唯一途径
// (否则流式响应不带 usage)。供 token 账本统计用。部分上游不支持时会忽略, 该次记 0。
type StreamOptions struct {
	IncludeUsage bool `json:"include_usage,omitempty"`
}

// LLMUsageStats 对应 OpenAI 兼容响应里的 usage 字段。同步响应必带; 流式响应仅在
// stream_options.include_usage=true 时由末尾 chunk 带上。PromptTokensDetails.CachedTokens
// 是 prompt 命中缓存的部分 (= 账本 cache_read_tokens), 不是所有上游都吐。
type LLMUsageStats struct {
	PromptTokens        int `json:"prompt_tokens"`
	CompletionTokens    int `json:"completion_tokens"`
	TotalTokens         int `json:"total_tokens"`
	PromptTokensDetails struct {
		CachedTokens int `json:"cached_tokens"`
	} `json:"prompt_tokens_details"`
}

// ToolCall represents a tool call in the response
type ToolCall struct {
	Index    int    `json:"index"` // 工具调用索引（流式响应中使用）
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

// ToolResult represents the result of a tool execution
// Used in tool call loop to pass results back to the AI
type ToolResult struct {
	ToolCallID string `json:"tool_call_id"` // ID of the tool call this result is for
	Content    string `json:"content"`      // Result content (usually JSON string)
}

// ToolMessage represents a message with tool role for OpenAI API
type ToolMessage struct {
	Role       string `json:"role"`         // "tool"
	Content    string `json:"content"`      // Tool execution result
	ToolCallID string `json:"tool_call_id"` // ID of the tool call this message is responding to
}

// AssistantMessageWithToolCalls represents an assistant message that contains tool calls
type AssistantMessageWithToolCalls struct {
	Role      string     `json:"role"`       // "assistant"
	Content   string     `json:"content"`    // Can be empty when there are tool calls
	ToolCalls []ToolCall `json:"tool_calls"` // Tool calls made by the assistant
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
	Usage LLMUsageStats `json:"usage"`
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
	// Usage 仅在 stream_options.include_usage=true 时由流末尾 chunk 带上 (choices 通常为空)。
	Usage *LLMUsageStats `json:"usage,omitempty"`
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
//
// 隐藏(IsHidden)策略：用户想隐藏系统维度时，前端调"设置可见性"接口，
// 后端创建一条 user_id>0 的 override 行（拷贝 name/description）并把
// IsHidden 置 true —— 与改名/改提示词同款 override 模式，**永不修改 user_id=-1 行**。
type AnalysisDimension struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       int64     `gorm:"index:idx_user_id;default:-1" json:"userId"`                         // -1表示系统默认维度，>0表示用户自定义
	DimensionKey string    `gorm:"type:varchar(50);not null;uniqueIndex:uk_user_dimension,priority:2" json:"dimensionKey"` // 维度标识符
	Name         string    `gorm:"type:varchar(100);not null" json:"name"`                             // 维度名称
	Description  string    `gorm:"type:text;not null" json:"description"`                              // 维度解释/分析指示
	SortOrder    int       `gorm:"default:0;index:idx_sort_order" json:"sortOrder"`                    // 排序顺序
	IsActive     bool      `gorm:"default:true" json:"isActive"`                                       // 是否启用(管理员控制 / 维度配置层)
	IsHidden     bool      `gorm:"default:false" json:"isHidden"`                                      // 用户隐藏(矩阵 UI 不展示;仅 user override 有意义)
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// TableName 指定表名
func (AnalysisDimension) TableName() string {
	return "analysis_dimensions"
}
