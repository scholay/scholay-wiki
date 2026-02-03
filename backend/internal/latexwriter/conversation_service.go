package latexwriter

import (
	"regexp"
	"strings"

	"gorm.io/gorm"

	"scholar-backend/internal/ai"
)

// ConversationService LaTeX 对话服务
type ConversationService struct {
	repo           *ConversationRepository
	contextManager *ContextManager
}

// NewConversationService 创建对话服务
func NewConversationService(db *gorm.DB) *ConversationService {
	return &ConversationService{
		repo:           NewConversationRepository(db),
		contextManager: NewDefaultContextManager(),
	}
}

// NewConversationServiceWithConfig 创建带自定义配置的对话服务
func NewConversationServiceWithConfig(db *gorm.DB, config ContextConfig) *ConversationService {
	return &ConversationService{
		repo:           NewConversationRepository(db),
		contextManager: NewContextManager(config),
	}
}

// GetOrCreateConversation 获取或创建文档对话
func (s *ConversationService) GetOrCreateConversation(userID, documentID uint) (*LatexConversation, error) {
	return s.repo.GetOrCreateByDocument(userID, documentID)
}

// GetConversation 获取对话（不自动创建）
func (s *ConversationService) GetConversation(userID, documentID uint) (*LatexConversation, error) {
	return s.repo.GetByUserAndDocument(userID, documentID)
}

// GetConversationByID 通过 ID 获取对话
func (s *ConversationService) GetConversationByID(id uint) (*LatexConversation, error) {
	return s.repo.GetByID(id)
}

// GetHistory 获取对话历史（分页）
func (s *ConversationService) GetHistory(conversationID uint, page, pageSize int) (*ConversationHistoryResponse, error) {
	// 获取对话信息
	conv, err := s.repo.GetByID(conversationID)
	if err != nil {
		return nil, err
	}

	// 计算偏移
	offset := (page - 1) * pageSize

	// 获取消息
	messages, total, err := s.repo.GetMessages(conversationID, pageSize, offset)
	if err != nil {
		return nil, err
	}

	return &ConversationHistoryResponse{
		Conversation: conv,
		Messages:     messages,
		Total:        total,
		Page:         page,
		PageSize:     pageSize,
		HasMore:      int64(offset+len(messages)) < total,
	}, nil
}

// GetAllMessages 获取所有消息
func (s *ConversationService) GetAllMessages(conversationID uint) ([]LatexChatMessage, error) {
	return s.repo.GetAllMessages(conversationID)
}

// AddUserMessage 添加用户消息
func (s *ConversationService) AddUserMessage(conversationID uint, content string) (*LatexChatMessage, error) {
	msg := &LatexChatMessage{
		ConversationID: conversationID,
		Role:           RoleUser,
		Content:        content,
		TokenCount:     uint(EstimateTokens(content)),
	}

	if err := s.repo.AddMessage(msg); err != nil {
		return nil, err
	}

	// 更新统计
	s.repo.UpdateConversationStats(conversationID)

	return msg, nil
}

// AddAssistantMessage 添加 AI 回复（含解析后的结构化内容）
func (s *ConversationService) AddAssistantMessage(conversationID uint, content string, parsed *ParsedMessage, model string) (*LatexChatMessage, error) {
	msg := &LatexChatMessage{
		ConversationID: conversationID,
		Role:           RoleAssistant,
		Content:        content,
		TokenCount:     uint(EstimateTokens(content)),
		Model:          model,
	}

	// 设置解析后的内容
	if parsed != nil {
		if parsed.Think != "" {
			msg.ThinkContent = &parsed.Think
		}
		if parsed.Reply != "" {
			msg.ReplyContent = &parsed.Reply
		}
		if parsed.Code != "" {
			msg.CodeContent = &parsed.Code
		}
	}

	if err := s.repo.AddMessage(msg); err != nil {
		return nil, err
	}

	// 更新统计
	s.repo.UpdateConversationStats(conversationID)

	return msg, nil
}

// BuildContextForChat 为对话构建上下文
func (s *ConversationService) BuildContextForChat(conversationID uint) ([]ContextMessage, error) {
	// 获取最近的消息
	messages, err := s.repo.GetRecentMessages(conversationID, s.contextManager.config.MaxMessageCount)
	if err != nil {
		return nil, err
	}

	// 构建上下文
	return s.contextManager.BuildContext(messages), nil
}

// BuildContextString 为对话构建上下文字符串
func (s *ConversationService) BuildContextString(conversationID uint) (string, error) {
	messages, err := s.repo.GetRecentMessages(conversationID, s.contextManager.config.MaxMessageCount)
	if err != nil {
		return "", err
	}

	return s.contextManager.BuildContextString(messages), nil
}

// BuildContextStringWithLimit 构建上下文字符串（指定消息数量限制）
func (s *ConversationService) BuildContextStringWithLimit(conversationID uint, limit int) (string, error) {
	if limit <= 0 {
		limit = s.contextManager.config.MaxMessageCount
	}
	messages, err := s.repo.GetRecentMessages(conversationID, limit)
	if err != nil {
		return "", err
	}

	return s.contextManager.BuildContextString(messages), nil
}

// ClearConversation 清空对话
func (s *ConversationService) ClearConversation(conversationID uint) error {
	return s.repo.ClearMessages(conversationID)
}

// DeleteConversation 删除对话
func (s *ConversationService) DeleteConversation(conversationID uint) error {
	return s.repo.DeleteConversation(conversationID)
}

// UpdateModelLevel 更新模型级别
func (s *ConversationService) UpdateModelLevel(conversationID uint, modelLevel string) error {
	return s.repo.UpdateModelLevel(conversationID, modelLevel)
}

// ParseAIResponse 解析 AI 响应
// 提取 <think>、<reply>、<code> 标签内容
func ParseAIResponse(content string) *ParsedMessage {
	if content == "" {
		return &ParsedMessage{Raw: ""}
	}

	result := &ParsedMessage{Raw: content}

	// 提取 <think>...</think>
	thinkRegex := regexp.MustCompile(`(?is)<think>(.*?)</think>`)
	if matches := thinkRegex.FindStringSubmatch(content); len(matches) > 1 {
		result.Think = strings.TrimSpace(matches[1])
	}

	// 提取 <reply>...</reply>
	replyRegex := regexp.MustCompile(`(?is)<reply>(.*?)</reply>`)
	if matches := replyRegex.FindStringSubmatch(content); len(matches) > 1 {
		result.Reply = strings.TrimSpace(matches[1])
	}

	// 提取 <code>...</code>
	codeRegex := regexp.MustCompile(`(?is)<code>(.*?)</code>`)
	if matches := codeRegex.FindStringSubmatch(content); len(matches) > 1 {
		result.Code = strings.TrimSpace(matches[1])
	}

	// 如果没有找到 <code>，尝试提取 markdown 代码块
	if result.Code == "" {
		markdownCodeRegex := regexp.MustCompile("(?s)```(?:latex|tex)?\\n?(.*?)```")
		if matches := markdownCodeRegex.FindStringSubmatch(content); len(matches) > 1 {
			result.Code = strings.TrimSpace(matches[1])
		}
	}

	// 如果没有 reply 标记，尝试提取非标记内容
	if result.Reply == "" && result.Think == "" {
		// 移除所有标记后的内容
		cleanContent := content
		cleanContent = thinkRegex.ReplaceAllString(cleanContent, "")
		cleanContent = replyRegex.ReplaceAllString(cleanContent, "")
		cleanContent = codeRegex.ReplaceAllString(cleanContent, "")
		cleanContent = regexp.MustCompile("(?s)```(?:latex|tex)?\\n?.*?```").ReplaceAllString(cleanContent, "")
		cleanContent = strings.TrimSpace(cleanContent)

		if cleanContent != "" {
			result.Reply = cleanContent
		}
	}

	return result
}

// GetContextManager 获取上下文管理器
func (s *ConversationService) GetContextManager() *ContextManager {
	return s.contextManager
}

// GetConversationHistory 获取对话历史，转换为 LLMMessage 格式
// limit: 最多返回的消息数量
func (s *ConversationService) GetConversationHistory(conversationID uint, limit int) ([]ai.LLMMessage, error) {
	if limit <= 0 {
		limit = 20
	}

	messages, err := s.repo.GetRecentMessages(conversationID, limit)
	if err != nil {
		return nil, err
	}

	// 转换为 LLMMessage 格式
	result := make([]ai.LLMMessage, 0, len(messages))
	for _, msg := range messages {
		llmMsg := ai.LLMMessage{
			Role: string(msg.Role),
		}

		// 对于助手消息，优先使用结构化内容
		if msg.Role == RoleAssistant {
			var content strings.Builder
			if msg.ReplyContent != nil && *msg.ReplyContent != "" {
				content.WriteString(*msg.ReplyContent)
			}
			if msg.CodeContent != nil && *msg.CodeContent != "" {
				if content.Len() > 0 {
					content.WriteString("\n\n")
				}
				content.WriteString("```latex\n")
				content.WriteString(*msg.CodeContent)
				content.WriteString("\n```")
			}
			if content.Len() > 0 {
				llmMsg.Content = content.String()
			} else {
				llmMsg.Content = msg.Content
			}
		} else {
			llmMsg.Content = msg.Content
		}

		result = append(result, llmMsg)
	}

	return result, nil
}
