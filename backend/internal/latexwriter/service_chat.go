// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"time"

	"scholar-backend/internal/ai"
)

// StreamChat 流式 AI 对话
func (s *Service) StreamChat(ctx context.Context, req *ChatRequest, writer io.Writer) error {
	// 获取系统提示词（从代码中获取，不从数据库）
	systemPrompt := GetSystemPrompt("base")

	// 构建用户消息
	userMessage := req.Prompt
	if req.Context != "" {
		userMessage = fmt.Sprintf("以下是选中的 LaTeX 代码：\n\n```latex\n%s\n```\n\n用户请求：%s", req.Context, req.Prompt)
	}

	// 如果有完整内容的上下文
	if req.FullContent != "" && req.Context == "" {
		// 只有在没有选中内容时才提供完整文档上下文
		if len(req.FullContent) > 2000 {
			// 文档太长，只提供部分上下文
			userMessage = fmt.Sprintf("当前 LaTeX 文档（部分）：\n```latex\n%s...\n```\n\n用户请求：%s",
				req.FullContent[:2000], req.Prompt)
		}
	}

	messages := []ai.ChatMessage{
		{
			Role:    "system",
			Content: systemPrompt,
		},
		{
			Role:    "user",
			Content: userMessage,
		},
	}

	// 使用 LaTeX Agent 配置的模型（modelID 为 0 表示使用默认模型）
	return s.streamWithModel(ctx, messages, writer, 0)
}

// ExecuteTask 执行特定任务
func (s *Service) ExecuteTask(ctx context.Context, taskType string, content string, writer io.Writer, modelLevel string) error {
	// 获取任务提示词
	taskPrompt, ok := GetTaskPrompt(taskType)
	if !ok {
		return fmt.Errorf("未知的任务类型: %s", taskType)
	}

	// 替换内容占位符
	prompt := taskPrompt.Prompt
	prompt = replaceVariable(prompt, "content", content)

	// 获取系统提示词
	systemPrompt := GetSystemPrompt("base")

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: prompt},
	}

	// 使用 LaTeX Agent 配置的默认模型
	return s.streamWithModel(ctx, messages, writer, 0)
}

// ExecuteSectionTask 执行章节写作任务
func (s *Service) ExecuteSectionTask(ctx context.Context, sectionType string, content string, writer io.Writer, modelLevel string) error {
	// 获取章节提示词
	sectionPrompt, ok := GetSectionPrompt(sectionType)
	if !ok {
		return fmt.Errorf("未知的章节类型: %s", sectionType)
	}

	// 替换内容占位符
	prompt := sectionPrompt.Prompt
	prompt = replaceVariable(prompt, "content", content)

	// 获取系统提示词（使用写作专家）
	systemPrompt := GetSystemPrompt("writing_expert")

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: prompt},
	}

	// 使用 LaTeX Agent 配置的默认模型
	return s.streamWithModel(ctx, messages, writer, 0)
}

// ============================================
// 带对话历史的聊天功能
// ============================================

// StreamChatWithContext 流式 AI 对话（带上下文历史）
// 包含自动验证和修复闭环
func (s *Service) StreamChatWithContext(ctx context.Context, userID, documentID uint, req *ChatRequest, writer io.Writer) error {
	startTime := time.Now()

	slog.Info("AI chat flow started",
		"user_id", userID,
		"document_id", documentID,
		"model_id", req.ModelID,
		"prompt_length", len(req.Prompt),
		"context_length", len(req.Context),
		"full_content_length", len(req.FullContent),
	)

	// 0. 获取 Agent 配置
	agentConfig, err := s.configRepo.GetConfig()
	if err != nil {
		slog.Warn("failed to load agent config, using defaults", "err", err)
		agentConfig = &AgentConfig{
			ContextWindowMessages: 50,
			AutoValidateLatex:     false,
			AutoFixErrors:         false,
		}
	} else {
		slog.Debug("agent config loaded", "context_window_messages", agentConfig.ContextWindowMessages, "enable_multi_agent", agentConfig.EnableMultiAgent)
	}

	// 获取模型配置
	var modelConfig *AgentModel
	if req.ModelID > 0 {
		modelConfig, err = s.modelRepo.GetModelByID(req.ModelID)
		if err != nil {
			slog.Warn("specified model not found, using default", "model_id", req.ModelID)
		}
	}
	if modelConfig == nil {
		modelConfig, err = s.modelRepo.GetDefaultModel()
		if err != nil {
			slog.Warn("no default model, using built-in config")
			modelConfig = &AgentModel{
				MaxContextTokens: 128000,
				MaxOutputTokens:  16384,
				Temperature:      0.7,
			}
		}
	}
	slog.Info("model config loaded",
		"display_name", modelConfig.DisplayName,
		"model_name", modelConfig.ModelName,
		"api_endpoint", modelConfig.APIEndpoint,
		"api_format", modelConfig.APIFormat,
		"max_context_tokens", modelConfig.MaxContextTokens,
		"max_output_tokens", modelConfig.MaxOutputTokens,
		"temperature", modelConfig.Temperature,
	)

	// 1. 获取或创建对话
	conv, err := s.convService.GetOrCreateConversation(userID, documentID)
	if err != nil {
		return fmt.Errorf("获取对话失败: %w", err)
	}
	slog.Debug("conversation ready", "conversation_id", conv.ID)

	// 2. 保存用户消息
	_, err = s.convService.AddUserMessage(conv.ID, req.Prompt)
	if err != nil {
		return fmt.Errorf("保存用户消息失败: %w", err)
	}

	// 3. 构建上下文（使用配置的消息数量限制）
	contextStr, err := s.convService.BuildContextStringWithLimit(conv.ID, int(agentConfig.ContextWindowMessages))
	if err != nil {
		return fmt.Errorf("构建上下文失败: %w", err)
	}
	slog.Debug("context built", "context_length", len(contextStr))

	// 4. 获取系统提示词
	systemPrompt := GetSystemPrompt("base")

	// 如果配置了自定义系统提示词，使用它
	if agentConfig.SystemPromptOverride != nil && *agentConfig.SystemPromptOverride != "" {
		systemPrompt = *agentConfig.SystemPromptOverride
		slog.Debug("using custom system prompt override")
	} else if agentConfig.SystemPromptAppend != nil && *agentConfig.SystemPromptAppend != "" {
		systemPrompt = systemPrompt + "\n\n" + *agentConfig.SystemPromptAppend
		slog.Debug("appended custom prompt", "append_length", len(*agentConfig.SystemPromptAppend))
	}

	// 添加工具能力说明
	toolDescription := getToolCapabilitiesDescription()
	systemPrompt = systemPrompt + "\n\n" + toolDescription

	// 添加 MCP 工具描述（动态从注册表获取）
	mcpToolsDescription := s.getMCPToolsDescription()
	if mcpToolsDescription != "" {
		systemPrompt = systemPrompt + mcpToolsDescription
	}

	// 添加多轮对话的特殊说明
	multiTurnInstruction := `
═══════════════════════════════════════════════════════════════════════════════
【多轮对话规则】
═══════════════════════════════════════════════════════════════════════════════

这是一个持续的对话，你需要记住以下规则：

1. 每次输出的 <code> 都必须是完整的、可编译的 LaTeX 代码
2. 不要引用之前对话中的内容到代码里（如"之前我说的xxx"）
3. 不要在代码中加入对话性质的内容
4. 保持代码的纯净性：只有 LaTeX 命令和学术内容
5. 如果用户让你基于之前的内容修改，请输出修改后的完整代码
6. 如果用户只是问问题，只输出 <reply>，不需要输出 <code>
`
	systemPrompt = systemPrompt + multiTurnInstruction
	slog.Debug("system prompt built", "total_length", len(systemPrompt))

	// 5. 构建用户消息（包含上下文和当前请求）
	var userMessage strings.Builder

	// 添加历史上下文（用清晰的标记）
	if contextStr != "" {
		userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
		userMessage.WriteString("【历史对话记录】\n")
		userMessage.WriteString("以下是之前的对话，仅供参考上下文，不要在代码中引用这些内容：\n")
		userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
		userMessage.WriteString(contextStr)
		userMessage.WriteString("\n\n")
	}

	// 添加当前选中的代码上下文
	if req.Context != "" {
		userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
		userMessage.WriteString("【当前选中的 LaTeX 代码】\n")
		userMessage.WriteString("这是用户当前选中的代码，你需要基于这段代码进行操作：\n")
		userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
		userMessage.WriteString("```latex\n")
		userMessage.WriteString(req.Context)
		userMessage.WriteString("\n```\n\n")
	}

	// 如果有完整文档上下文（根据配置的上下文大小动态调整）
	maxDocContext := int(modelConfig.MaxContextTokens / 4) // 粗略估算：1 token ≈ 4 字符
	if maxDocContext < 2000 {
		maxDocContext = 2000
	}
	if maxDocContext > 50000 {
		maxDocContext = 50000 // 最大 50K 字符
	}

	if req.FullContent != "" && req.Context == "" {
		userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
		userMessage.WriteString("【当前完整文档】\n")
		userMessage.WriteString("这是用户当前文档的完整内容，供你参考整体结构：\n")
		userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
		if len(req.FullContent) > maxDocContext {
			userMessage.WriteString("```latex\n")
			userMessage.WriteString(req.FullContent[:maxDocContext])
			userMessage.WriteString("\n...[文档过长，已截断]...\n```\n\n")
		} else if len(req.FullContent) > 0 {
			userMessage.WriteString("```latex\n")
			userMessage.WriteString(req.FullContent)
			userMessage.WriteString("\n```\n\n")
		}
	}

	// 添加当前用户请求（最重要的部分）
	userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
	userMessage.WriteString("【当前用户请求】\n")
	userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
	userMessage.WriteString(req.Prompt)
	userMessage.WriteString("\n\n")
	userMessage.WriteString("请按照系统提示词的格式要求回复。记住：<code> 标签内只能有纯净的 LaTeX 代码！")

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage.String()},
	}

	totalInput := len(systemPrompt) + len(userMessage.String())
	slog.Info("message summary",
		"system_prompt_length", len(systemPrompt),
		"user_message_length", len(userMessage.String()),
		"total_input_chars", totalInput,
		"estimated_tokens", totalInput/4,
	)

	// 6. 创建纯文本内容收集器（用于保存到数据库）
	var pureContent strings.Builder

	// 7. 检查模型配置
	if modelConfig == nil || modelConfig.APIEndpoint == "" || modelConfig.APIKey == "" || modelConfig.ModelName == "" {
		return fmt.Errorf("LaTeX Agent 模型未配置，请在后台管理中配置 AI 模型")
	}

	modelName := modelConfig.DisplayName
	slog.Debug("preparing AI call", "model_name", modelName, "api_endpoint", modelConfig.APIEndpoint)

	// 更新对话的模型级别为模型名称
	s.convService.UpdateModelLevel(conv.ID, modelConfig.DisplayName)

	providerConfig := &ai.ProviderConfig{
		Provider: modelConfig.APIFormat,
		Model:    modelConfig.ModelName,
		BaseURL:  modelConfig.APIEndpoint,
		APIKey:   modelConfig.APIKey,
	}

	provider, providerErr := ai.CreateProviderFromConfig(providerConfig)
	if providerErr != nil {
		return fmt.Errorf("创建 AI 模型失败: %w", providerErr)
	}

	// 转换消息格式
	llmMessages := make([]ai.LLMMessage, len(messages))
	for i, msg := range messages {
		llmMessages[i] = ai.LLMMessage{
			Role:    msg.Role,
			Content: msg.Content,
		}
	}

	llmReq := &ai.LLMRequest{
		Messages:    llmMessages,
		Temperature: modelConfig.Temperature,
		MaxTokens:   int(modelConfig.MaxOutputTokens),
	}

	// 流式调用
	aiCallStart := time.Now()
	streamCh, streamErr := provider.StreamChat(ctx, llmReq)
	if streamErr != nil {
		return fmt.Errorf("AI 模型调用失败: %w", streamErr)
	}
	slog.Debug("AI stream started", "latency_ms", time.Since(aiCallStart).Milliseconds())

	// 收集流式响应
	chunkCount := 0
	for chunk := range streamCh {
		if chunk.Error != nil {
			return fmt.Errorf("AI 响应错误: %w", chunk.Error)
		}
		if chunk.Delta != "" {
			chunkCount++
			pureContent.WriteString(chunk.Delta)
			writeSSEData(writer, chunk.Delta)
		}
	}
	slog.Info("AI stream completed",
		"chunks", chunkCount,
		"duration_ms", time.Since(aiCallStart).Milliseconds(),
		"response_length", len(pureContent.String()),
	)

	// 8. 解析 AI 回复（使用纯文本内容）
	parsed := ParseAIResponse(pureContent.String())
	slog.Debug("AI response parsed", "think_length", len(parsed.Think), "reply_length", len(parsed.Reply), "code_length", len(parsed.Code))

	// 9.5 清理代码（移除可能混入的思考/说明内容）
	if parsed.Code != "" {
		originalLen := len(parsed.Code)
		cleanedCode := SanitizeLatexCode(parsed.Code)
		if cleanedCode != parsed.Code {
			slog.Debug("code sanitized", "original_length", originalLen, "cleaned_length", len(cleanedCode))
			parsed.Code = cleanedCode
		}
	}

	// 10. 自动验证和修复闭环 - 已禁用
	// 用户遇到编译错误时，通过点击"让 AI 修复"按钮手动触发修复
	// 这样更灵活，也避免了不必要的等待

	// 10. 构建格式化的内容字符串（用于保存和历史渲染）
	formattedContent := buildFormattedContent(parsed)

	// 11. 保存最终的 AI 回复
	_, err = s.convService.AddAssistantMessage(conv.ID, formattedContent, parsed, modelName)
	if err != nil {
		slog.Error("failed to save AI reply", "conversation_id", conv.ID, "err", err)
	}

	totalDuration := time.Since(startTime)
	slog.Info("AI chat flow completed",
		"duration_ms", totalDuration.Milliseconds(),
		"estimated_input_tokens", totalInput/4,
		"estimated_output_tokens", len(pureContent.String())/4,
		"code_length", len(parsed.Code),
		"reply_length", len(parsed.Reply),
	)

	return nil
}

// buildFormattedContent 构建格式化的内容字符串
// 用于保存到数据库，保持与实时渲染一致的格式
func buildFormattedContent(parsed *ParsedMessage) string {
	if parsed == nil {
		return ""
	}

	var builder strings.Builder

	// 添加思考内容
	if parsed.Think != "" {
		builder.WriteString("<think>\n")
		builder.WriteString(parsed.Think)
		builder.WriteString("\n</think>\n\n")
	}

	// 添加回复内容
	if parsed.Reply != "" {
		builder.WriteString("<reply>\n")
		builder.WriteString(parsed.Reply)
		builder.WriteString("\n</reply>\n\n")
	}

	// 添加代码内容
	if parsed.Code != "" {
		builder.WriteString("<code>\n")
		builder.WriteString(parsed.Code)
		builder.WriteString("\n</code>")
	}

	return builder.String()
}

// StreamChatWithValidation 流式对话，完成后自动验证并修复
func (s *Service) StreamChatWithValidation(ctx context.Context, userID, documentID uint, req *ChatRequest, writer io.Writer) error {
	// 1. 先进行正常的对话
	var fullResponse strings.Builder
	responseCollector := &responseCollectorWriter{
		writer:    writer,
		collector: &fullResponse,
	}

	// 获取或创建对话
	conv, err := s.convService.GetOrCreateConversation(userID, documentID)
	if err != nil {
		return fmt.Errorf("获取对话失败: %w", err)
	}

	// 保存用户消息
	_, err = s.convService.AddUserMessage(conv.ID, req.Prompt)
	if err != nil {
		return fmt.Errorf("保存用户消息失败: %w", err)
	}

	// 构建上下文
	contextStr, err := s.convService.BuildContextString(conv.ID)
	if err != nil {
		return fmt.Errorf("构建上下文失败: %w", err)
	}

	// 获取系统提示词（包含验证规则）
	systemPrompt := GetSystemPrompt("base")

	// 构建用户消息
	var userMessage strings.Builder
	if contextStr != "" {
		userMessage.WriteString(contextStr)
	}
	if req.Context != "" {
		userMessage.WriteString("以下是当前选中的 LaTeX 代码：\n\n```latex\n")
		userMessage.WriteString(req.Context)
		userMessage.WriteString("\n```\n\n")
	}
	if req.FullContent != "" && req.Context == "" {
		if len(req.FullContent) > 2000 {
			userMessage.WriteString("当前 LaTeX 文档（部分）：\n```latex\n")
			userMessage.WriteString(req.FullContent[:2000])
			userMessage.WriteString("...\n```\n\n")
		} else if len(req.FullContent) > 0 {
			userMessage.WriteString("当前 LaTeX 文档：\n```latex\n")
			userMessage.WriteString(req.FullContent)
			userMessage.WriteString("\n```\n\n")
		}
	}
	userMessage.WriteString("用户请求：")
	userMessage.WriteString(req.Prompt)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage.String()},
	}

	// 获取 LaTeX Agent 配置的默认模型名称
	modelConfig, _ := s.modelRepo.GetDefaultModel()
	modelName := "default"
	if modelConfig != nil {
		modelName = modelConfig.DisplayName
	}

	s.convService.UpdateModelLevel(conv.ID, modelName)

	// 使用 LaTeX Agent 配置的默认模型
	err = s.streamWithModel(ctx, messages, responseCollector, 0)
	if err != nil {
		return err
	}

	// 2. 解析 AI 响应
	aiResponse := fullResponse.String()
	parsed := ParseAIResponse(aiResponse)

	// 3. 自动验证已禁用 - 用户通过对话或点击"让 AI 修复"按钮手动触发

	// 4. 保存 AI 回复
	_, err = s.convService.AddAssistantMessage(conv.ID, aiResponse, parsed, modelName)
	if err != nil {
		slog.Error("failed to save assistant message", "err", err)
	}

	return nil
}

// ============================================
// 增强的 Agent 架构 - 使用 Orchestrator
// ============================================

// StreamChatWithOrchestrator 使用 Orchestrator 进行流式对话
// 这是新的增强版本，支持多 Agent、Function Calling、自动压缩等功能
func (s *Service) StreamChatWithOrchestrator(ctx context.Context, userID, documentID uint, req *ChatRequest, writer io.Writer) error {
	slog.Info("StreamChatWithOrchestrator started", "user_id", userID, "document_id", documentID, "model_id", req.ModelID)

	// 1. 获取或创建 Orchestrator
	orchestrator, err := s.GetOrCreateOrchestrator(req.ModelID)
	if err != nil {
		slog.Warn("failed to create orchestrator, falling back to basic mode", "err", err)
		// 回退到基础模式
		return s.StreamChatWithContext(ctx, userID, documentID, req, writer)
	}

	// 2. 获取或创建对话
	conv, err := s.convService.GetOrCreateConversation(userID, documentID)
	if err != nil {
		return fmt.Errorf("获取对话失败: %w", err)
	}

	// 3. 保存用户消息
	_, err = s.convService.AddUserMessage(conv.ID, req.Prompt)
	if err != nil {
		return fmt.Errorf("保存用户消息失败: %w", err)
	}

	// 4. 获取对话历史
	history, err := s.convService.GetConversationHistory(conv.ID, 20) // 最近 20 条消息
	if err != nil {
		slog.Warn("failed to get conversation history", "err", err)
		history = []ai.LLMMessage{}
	}

	// 5. 构建 Orchestrator 请求
	orchReq := &OrchestratorRequest{
		UserID:              userID,
		DocumentID:          documentID,
		SessionID:           fmt.Sprintf("conv_%d", conv.ID),
		Prompt:              req.Prompt,
		Context:             req.Context,
		FullContent:         req.FullContent,
		ConversationHistory: history,
		ModelID:             req.ModelID,
		Temperature:         0.7,
	}

	// 6. 执行流式编排
	result, err := orchestrator.StreamExecute(ctx, orchReq, writer)
	if err != nil {
		return fmt.Errorf("orchestrator execution failed: %w", err)
	}

	// 7. 保存 AI 回复
	parsed := &ParsedMessage{
		Think: result.Think,
		Reply: result.Reply,
		Code:  result.Code,
	}

	// 构建完整响应用于保存
	var fullResponse strings.Builder
	if result.Think != "" {
		fullResponse.WriteString("<think>\n")
		fullResponse.WriteString(result.Think)
		fullResponse.WriteString("\n</think>\n\n")
	}
	if result.Reply != "" {
		fullResponse.WriteString("<reply>\n")
		fullResponse.WriteString(result.Reply)
		fullResponse.WriteString("\n</reply>\n\n")
	}
	if result.Code != "" {
		fullResponse.WriteString("<code>\n")
		fullResponse.WriteString(result.Code)
		fullResponse.WriteString("\n</code>")
	}

	_, err = s.convService.AddAssistantMessage(conv.ID, fullResponse.String(), parsed, "orchestrator")
	if err != nil {
		slog.Error("failed to save assistant message", "err", err)
	}

	slog.Info("StreamChatWithOrchestrator completed",
		"duration_ms", result.TotalDuration,
		"iterations", result.Iterations,
		"code_length", len(result.Code),
	)

	return nil
}
