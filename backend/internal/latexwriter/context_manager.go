package latexwriter

import (
	"strings"
	"unicode/utf8"
)

// ContextConfig 上下文配置
type ContextConfig struct {
	MaxMessageCount int  // 最大消息条数，默认 10
	MaxTokens       int  // 最大 Token 数，默认 4000
	TruncateLength  int  // 单条消息截断长度（字符数），默认 1000
	PreserveRecent  int  // 始终保留最近N条完整消息，默认 2
	SummaryEnable   bool // 是否启用摘要压缩（预留）
}

// DefaultContextConfig 默认配置
var DefaultContextConfig = ContextConfig{
	MaxMessageCount: 10,
	MaxTokens:       4000,
	TruncateLength:  1000,
	PreserveRecent:  2,
	SummaryEnable:   false,
}

// ContextManager 上下文管理器
type ContextManager struct {
	config ContextConfig
}

// NewContextManager 创建上下文管理器
func NewContextManager(config ContextConfig) *ContextManager {
	return &ContextManager{config: config}
}

// NewDefaultContextManager 创建使用默认配置的上下文管理器
func NewDefaultContextManager() *ContextManager {
	return &ContextManager{config: DefaultContextConfig}
}

// BuildContext 构建上下文消息
// 处理流程：
// 1. 取最近 MaxMessageCount 条消息
// 2. 最近 PreserveRecent 条保持完整
// 3. 其余消息如果超过 TruncateLength 则截断
// 4. 检查总 Token 数，必要时从最早消息开始移除
func (cm *ContextManager) BuildContext(messages []LatexChatMessage) []ContextMessage {
	if len(messages) == 0 {
		return []ContextMessage{}
	}

	// 1. 限制消息数量
	if len(messages) > cm.config.MaxMessageCount {
		messages = messages[len(messages)-cm.config.MaxMessageCount:]
	}

	// 2. 转换并处理消息
	contextMessages := make([]ContextMessage, 0, len(messages))
	totalTokens := 0

	for i, msg := range messages {
		// 计算是否在保护范围内（最近 PreserveRecent 条）
		isProtected := i >= len(messages)-cm.config.PreserveRecent

		content := msg.Content
		isTruncated := false

		// 3. 对非保护消息进行截断
		if !isProtected && utf8.RuneCountInString(content) > cm.config.TruncateLength {
			content, isTruncated = TruncateMessage(content, cm.config.TruncateLength)
		}

		contextMessages = append(contextMessages, ContextMessage{
			Role:        msg.Role,
			Content:     content,
			IsTruncated: isTruncated,
		})

		totalTokens += EstimateTokens(content)
	}

	// 4. 检查总 Token 数，必要时从最早消息开始移除
	for totalTokens > cm.config.MaxTokens && len(contextMessages) > cm.config.PreserveRecent {
		// 移除最早的消息
		removed := contextMessages[0]
		contextMessages = contextMessages[1:]
		totalTokens -= EstimateTokens(removed.Content)
	}

	return contextMessages
}

// BuildContextString 构建上下文字符串（用于 prompt）
func (cm *ContextManager) BuildContextString(messages []LatexChatMessage) string {
	contextMessages := cm.BuildContext(messages)

	if len(contextMessages) == 0 {
		return ""
	}

	var builder strings.Builder
	builder.WriteString("以下是之前的对话历史：\n\n")

	for _, msg := range contextMessages {
		switch msg.Role {
		case RoleUser:
			builder.WriteString("用户: ")
		case RoleAssistant:
			builder.WriteString("助手: ")
		case RoleSystem:
			builder.WriteString("系统: ")
		}
		builder.WriteString(msg.Content)
		if msg.IsTruncated {
			builder.WriteString(" [已截断]")
		}
		builder.WriteString("\n\n")
	}

	builder.WriteString("---\n\n")
	return builder.String()
}

// EstimateTokens 估算 Token 数
// 简单实现：中文约 1.5 字符/token，英文约 4 字符/token
// 这里使用保守估计：字符数 / 3
func EstimateTokens(text string) int {
	runeCount := utf8.RuneCountInString(text)
	if runeCount == 0 {
		return 0
	}
	return (runeCount + 2) / 3 // 向上取整
}

// TruncateMessage 截断消息
func TruncateMessage(content string, maxLength int) (string, bool) {
	runes := []rune(content)
	if len(runes) <= maxLength {
		return content, false
	}

	// 截断并添加标记
	truncated := string(runes[:maxLength])

	// 尝试在句子边界截断
	lastPeriod := strings.LastIndexAny(truncated, "。.!?！？\n")
	if lastPeriod > maxLength/2 {
		truncated = truncated[:lastPeriod+1]
	}

	return truncated + "\n[... 内容已截断 ...]", true
}

// GetConfig 获取配置
func (cm *ContextManager) GetConfig() ContextConfig {
	return cm.config
}

// SetConfig 设置配置
func (cm *ContextManager) SetConfig(config ContextConfig) {
	cm.config = config
}
