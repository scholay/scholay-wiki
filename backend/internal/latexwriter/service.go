// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/common/sse"
	"scholar-backend/internal/mcp"
)

// Service 提供 LaTeX Writer 业务逻辑
type Service struct {
	repo         *Repository
	aiService    *ai.Service
	convService  *ConversationService
	configRepo   *AgentConfigRepository
	modelRepo    *AgentModelRepository
	mcpRegistry  *mcp.Registry
	orchestrator *AgentOrchestrator // 新增：Agent 编排器
	db           *gorm.DB           // 保存数据库引用
}

// NewService 创建新的 Service
func NewService(db *gorm.DB, aiService *ai.Service) *Service {
	// 初始化 MCP 工具注册表
	mcpRegistry := initMCPRegistry()

	service := &Service{
		repo:        NewRepository(db),
		aiService:   aiService,
		convService: NewConversationService(db),
		configRepo:  NewAgentConfigRepository(db),
		modelRepo:   NewAgentModelRepository(db),
		mcpRegistry: mcpRegistry,
		db:          db,
	}

	// Orchestrator 将在首次需要时延迟初始化（需要 LLM Provider）
	// 因为 LLM Provider 需要模型配置
	
	return service
}

// streamWithModel 使用 LaTeX Agent 配置的模型进行流式 AI 调用
// 这是所有 AI 调用的统一入口，不使用 thirdparty
func (s *Service) streamWithModel(ctx context.Context, messages []ai.ChatMessage, writer io.Writer, modelID uint) error {
	// 获取模型配置
	var modelConfig *AgentModel
	var err error
	
	if modelID > 0 {
		modelConfig, err = s.modelRepo.GetModelByID(modelID)
		if err != nil {
			slog.Warn("model not found, using default", "model_id", modelID)
		}
	}
	
	if modelConfig == nil {
		modelConfig, err = s.modelRepo.GetDefaultModel()
		if err != nil {
			return fmt.Errorf("未配置 LaTeX Agent 模型，请在后台管理中配置")
		}
	}
	
	// 检查模型配置完整性
	if modelConfig.APIEndpoint == "" || modelConfig.APIKey == "" || modelConfig.ModelName == "" {
		return fmt.Errorf("模型 %s 配置不完整，请检查 API 端点、密钥和模型名称", modelConfig.DisplayName)
	}
	
	slog.Info("using model", "display_name", modelConfig.DisplayName, "model_name", modelConfig.ModelName)
	
	// 创建 provider
	providerConfig := &ai.ProviderConfig{
		Provider: modelConfig.APIFormat,
		Model:    modelConfig.ModelName,
		BaseURL:  modelConfig.APIEndpoint,
		APIKey:   modelConfig.APIKey,
	}
	
	provider, err := ai.CreateProviderFromConfig(providerConfig)
	if err != nil {
		return fmt.Errorf("创建 AI 模型失败: %w", err)
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
	streamCh, err := provider.StreamChat(ctx, llmReq)
	if err != nil {
		return fmt.Errorf("AI 模型调用失败: %w", err)
	}
	
	// 处理流式响应
	for chunk := range streamCh {
		if chunk.Error != nil {
			return fmt.Errorf("AI 响应错误: %w", chunk.Error)
		}
		if chunk.Delta != "" {
			writeSSEData(writer, chunk.Delta)
		}
	}
	
	return nil
}

// streamWithModelAndCollect 使用配置的模型进行流式调用并收集响应
func (s *Service) streamWithModelAndCollect(ctx context.Context, messages []ai.ChatMessage, writer io.Writer, modelID uint) (string, error) {
	var modelConfig *AgentModel
	var err error
	
	if modelID > 0 {
		modelConfig, err = s.modelRepo.GetModelByID(modelID)
		if err != nil {
			slog.Warn("model not found, using default", "model_id", modelID)
		}
	}
	
	if modelConfig == nil {
		modelConfig, err = s.modelRepo.GetDefaultModel()
		if err != nil {
			return "", fmt.Errorf("未配置 LaTeX Agent 模型，请在后台管理中配置")
		}
	}
	
	if modelConfig.APIEndpoint == "" || modelConfig.APIKey == "" || modelConfig.ModelName == "" {
		return "", fmt.Errorf("模型 %s 配置不完整", modelConfig.DisplayName)
	}
	
	// 创建 provider
	providerConfig := &ai.ProviderConfig{
		Provider: modelConfig.APIFormat,
		Model:    modelConfig.ModelName,
		BaseURL:  modelConfig.APIEndpoint,
		APIKey:   modelConfig.APIKey,
	}
	
	provider, err := ai.CreateProviderFromConfig(providerConfig)
	if err != nil {
		return "", fmt.Errorf("创建 AI 模型失败: %w", err)
	}
	
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
	
	streamCh, err := provider.StreamChat(ctx, llmReq)
	if err != nil {
		return "", fmt.Errorf("AI 模型调用失败: %w", err)
	}
	
	var content strings.Builder
	for chunk := range streamCh {
		if chunk.Error != nil {
			return "", fmt.Errorf("AI 响应错误: %w", chunk.Error)
		}
		if chunk.Delta != "" {
			content.WriteString(chunk.Delta)
			writeSSEData(writer, chunk.Delta)
		}
	}
	
	return content.String(), nil
}

// GetOrCreateOrchestrator 获取或创建 Orchestrator
// 使用延迟初始化，因为需要获取模型配置来创建 LLM Provider
func (s *Service) GetOrCreateOrchestrator(modelID uint) (*AgentOrchestrator, error) {
	// 获取模型配置
	var modelConfig *AgentModel
	var err error
	
	if modelID > 0 {
		modelConfig, err = s.modelRepo.GetModelByID(modelID)
	} else {
		modelConfig, err = s.modelRepo.GetDefaultModel()
	}
	
	if err != nil || modelConfig == nil {
		// 使用默认配置
		modelConfig = &AgentModel{
			MaxContextTokens: 128000,
			MaxOutputTokens:  16384,
			Temperature:      0.7,
		}
	}
	
	// 创建 LLM Provider
	providerConfig := &ai.ProviderConfig{
		Provider: modelConfig.APIFormat,
		BaseURL:  modelConfig.APIEndpoint,
		APIKey:   modelConfig.APIKey,
		Model:    modelConfig.ModelName,
	}
	
	provider, err := ai.CreateProviderFromConfig(providerConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create LLM provider: %w", err)
	}
	
	// 获取 Agent 配置
	agentConfig, _ := s.configRepo.GetConfig()
	
	// 创建 Orchestrator 配置
	orchConfig := &OrchestratorConfig{
		EnableMultiAgent: agentConfig != nil && agentConfig.EnableMultiAgent,
		MaxIterations:    10,
		MaxContextTokens: int(modelConfig.MaxContextTokens),
	}
	
	if agentConfig != nil {
		orchConfig.MaxIterations = int(agentConfig.MaxIterations)
	}
	
	// 创建 Orchestrator
	orchestrator := NewAgentOrchestrator(provider, s.mcpRegistry, orchConfig)
	
	return orchestrator, nil
}

// initMCPRegistry 初始化 MCP 工具注册表
func initMCPRegistry() *mcp.Registry {
	registry := mcp.NewRegistry()
	
	slog.Info("initializing MCP tool registry")
	
	// 注册各类工具提供者（不需要外部依赖的）
	providers := []mcp.ToolProvider{
		mcp.NewLaTeXToolProvider(),     // LaTeX 验证/修复工具
		mcp.NewBibTeXToolProvider(),    // 参考文献工具
		mcp.NewConvertToolProvider(),   // 格式转换工具
		mcp.NewMathToolProvider(),      // 数学工具
		mcp.NewTemplateToolProvider(),  // 模板工具
		mcp.NewImageToolProvider(),     // 图片工具
		mcp.NewCodeToolProvider(),      // 代码工具
	}
	
	
	for _, provider := range providers {
		if err := registry.RegisterProvider(provider); err != nil {
			slog.Warn("failed to register MCP provider", "category", provider.GetCategory(), "err", err)
		} else {
			tools := provider.GetTools()
			slog.Info("registered MCP tools", "count", len(tools), "category", provider.GetCategory())
		}
	}
	
	allTools := registry.ListTools()
	slog.Info("total MCP tools registered", "count", len(allTools))
	
	for _, tool := range allTools {
		slog.Debug("registered tool", "name", tool.Name, "category", string(tool.Category))
	}
	
	return registry
}

// GetAvailableModels 获取可用模型列表（用户端）
func (s *Service) GetAvailableModels() ([]AgentModel, error) {
	return s.modelRepo.GetEnabledModels()
}

// GetAgentConfig 获取 Agent 配置
func (s *Service) GetAgentConfig() (*AgentConfig, error) {
	return s.configRepo.GetConfig()
}

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

// replaceVariable 替换模板中的变量
func replaceVariable(template, key, value string) string {
	placeholder := "{" + key + "}"
	return strings.Replace(template, placeholder, value, -1)
}

// getToolCapabilitiesDescription 获取工具能力描述（静态版本）
func getToolCapabilitiesDescription() string {
	return `
═══════════════════════════════════════════════════════════════════════════════
【你的工具能力】
═══════════════════════════════════════════════════════════════════════════════

作为 LaTeX 论文写作助手，你具有以下能力：

1. 【LaTeX 写作】
   - 撰写学术论文各个章节（摘要、引言、方法、结果、讨论、结论）
   - 续写、润色、精简、扩展现有内容
   - 生成数学公式、表格、图形代码
   - 修复 LaTeX 语法错误

2. 【文献支持】
   - 根据主题建议可能需要的引用
   - 格式化参考文献为 BibTeX 格式
   - 使用 \cite{} 标记引用位置

3. 【格式转换】
   - 中英文互译（保持 LaTeX 格式）
   - Markdown 到 LaTeX 转换
   - 纯文本到 LaTeX 格式化

4. 【代码验证】
   - 检查 LaTeX 语法错误
   - 验证环境配对、括号匹配
   - 检测特殊字符问题

【使用建议】
- 如果需要撰写论文，请告诉我研究主题和需要写的章节
- 如果需要修改现有内容，请选中相关代码
- 如果需要生成公式或表格，请提供数据或描述
- 如果需要翻译，请指明目标语言
`
}

// getMCPToolsDescription 获取 MCP 工具描述（从注册表动态生成）
func (s *Service) getMCPToolsDescription() string {
	if s.mcpRegistry == nil {
		slog.Warn("MCP registry is nil, no tools available")
		return ""
	}
	
	tools := s.mcpRegistry.ListTools()
	if len(tools) == 0 {
		slog.Warn("no MCP tools registered")
		return ""
	}
	
	slog.Debug("building tools description", "tool_count", len(tools))
	
	var builder strings.Builder
	builder.WriteString("\n\n═══════════════════════════════════════════════════════════════════════════════\n")
	builder.WriteString("【可用的 MCP 工具】\n")
	builder.WriteString("以下工具可以帮助你完成任务（但当前版本暂未启用自动调用，仅供参考）：\n")
	builder.WriteString("═══════════════════════════════════════════════════════════════════════════════\n\n")
	
	// 按分类组织工具
	categoryTools := make(map[mcp.ToolCategory][]mcp.ToolDefinition)
	for _, tool := range tools {
		categoryTools[tool.Category] = append(categoryTools[tool.Category], tool)
	}
	
	categoryNames := map[mcp.ToolCategory]string{
		mcp.CategoryLatex:    "LaTeX 工具",
		mcp.CategorySearch:   "搜索工具",
		mcp.CategoryBibtex:   "参考文献工具",
		mcp.CategoryFile:     "文件工具",
		mcp.CategoryConvert:  "格式转换工具",
		mcp.CategoryMath:     "数学工具",
		mcp.CategoryImage:    "图片工具",
		mcp.CategoryCode:     "代码工具",
		mcp.CategoryTemplate: "模板工具",
	}
	
	for category, catTools := range categoryTools {
		catName := categoryNames[category]
		if catName == "" {
			catName = string(category)
		}
		
		builder.WriteString(fmt.Sprintf("【%s】(%d 个)\n", catName, len(catTools)))
		for _, tool := range catTools {
			builder.WriteString(fmt.Sprintf("  • %s: %s\n", tool.Name, tool.Description))
		}
		builder.WriteString("\n")
	}
	
	return builder.String()
}

// CreateDocument 创建文档
func (s *Service) CreateDocument(userID uint, req *CreateDocumentRequest) (*LatexDocument, error) {
	doc := &LatexDocument{
		UserID:   userID,
		Title:    req.Title,
		Content:  req.Content,
		ParentID: req.ParentID,
		IsFolder: req.IsFolder,
	}

	if err := s.repo.CreateDocument(doc); err != nil {
		return nil, err
	}

	return doc, nil
}

// GetDocument 获取文档
func (s *Service) GetDocument(id uint, userID uint) (*LatexDocument, error) {
	return s.repo.GetDocumentByID(id, userID)
}

// GetUserDocuments 获取用户文档列表
func (s *Service) GetUserDocuments(userID uint) ([]LatexDocument, error) {
	return s.repo.GetDocumentsByUserID(userID)
}

// GetDocumentTree 获取文档树形结构
func (s *Service) GetDocumentTree(userID uint) ([]*DocumentResponse, error) {
	docs, err := s.repo.GetDocumentsByUserID(userID)
	if err != nil {
		return nil, err
	}

	return buildDocumentTree(docs), nil
}

// buildDocumentTree 构建文档树
func buildDocumentTree(docs []LatexDocument) []*DocumentResponse {
	// 创建 ID 到响应的映射
	responseMap := make(map[uint]*DocumentResponse)
	for _, doc := range docs {
		responseMap[doc.ID] = &DocumentResponse{
			ID:        doc.ID,
			Title:     doc.Title,
			Content:   doc.Content,
			ParentID:  doc.ParentID,
			IsFolder:  doc.IsFolder,
			SortOrder: doc.SortOrder,
			Children:  []*DocumentResponse{},
			CreatedAt: doc.CreatedAt,
			UpdatedAt: doc.UpdatedAt,
		}
	}

	// 构建树形结构
	var roots []*DocumentResponse
	for _, doc := range docs {
		resp := responseMap[doc.ID]
		if doc.ParentID == nil {
			roots = append(roots, resp)
		} else {
			if parent, ok := responseMap[*doc.ParentID]; ok {
				parent.Children = append(parent.Children, resp)
			}
		}
	}

	return roots
}

// UpdateDocument 更新文档
func (s *Service) UpdateDocument(id uint, userID uint, req *UpdateDocumentRequest) (*LatexDocument, error) {
	doc, err := s.repo.GetDocumentByID(id, userID)
	if err != nil {
		return nil, err
	}

	if req.Title != "" {
		doc.Title = req.Title
	}
	if req.Content != "" {
		doc.Content = req.Content
	}

	if err := s.repo.UpdateDocument(doc); err != nil {
		return nil, err
	}

	return doc, nil
}

// DeleteDocument 删除文档
func (s *Service) DeleteDocument(id uint, userID uint) error {
	// 检查文档是否存在
	doc, err := s.repo.GetDocumentByID(id, userID)
	if err != nil {
		return err
	}

	// 如果是文件夹，递归删除
	if doc.IsFolder {
		return s.repo.DeleteDocumentAndChildren(id, userID)
	}

	return s.repo.DeleteDocument(id, userID)
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

// SSE 日志计数器（用于调试）
var sseLogCounter int64 = 0

// writeSSEData 写入 SSE 数据，使用 <br> 处理换行符以避免与 LaTeX 命令冲突
func writeSSEData(writer io.Writer, content string) {
	if content == "" {
		return
	}

	sseLogCounter++
	if sseLogCounter%50 == 0 {
		slog.Debug("SSE sending", "seq", sseLogCounter)
	}

	sse.WriteMultilineData(writer, content)
}

// responseCollectorWriter 同时写入响应和收集内容
type responseCollectorWriter struct {
	writer    io.Writer
	collector *strings.Builder
}

func (w *responseCollectorWriter) Write(p []byte) (n int, err error) {
	// 写入原始 writer
	n, err = w.writer.Write(p)
	if err != nil {
		return n, err
	}

	// 收集内容（解析 SSE 数据）
	content := string(p)
	// 简单提取 data: 后的内容
	if strings.HasPrefix(content, "data: ") {
		data := strings.TrimPrefix(content, "data: ")
		data = strings.TrimSuffix(data, "\n\n")
		if data != "[DONE]" {
			w.collector.WriteString(data)
		}
	}

	return n, nil
}

// pureContentWriter 纯文本内容收集器
// 从 AI 服务的 JSON 格式 SSE 中提取内容，以纯文本格式输出到前端
type pureContentWriter struct {
	writer      io.Writer
	pureContent *strings.Builder
}

// openAIChunk OpenAI 风格的流式响应结构
type openAIChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

func (w *pureContentWriter) Write(p []byte) (n int, err error) {
	n = len(p)
	content := string(p)
	
	// 处理 SSE 数据
	if strings.HasPrefix(content, "data: ") {
		data := strings.TrimPrefix(content, "data: ")
		data = strings.TrimSuffix(data, "\n\n")
		
		if data == "[DONE]" {
			return n, nil
		}
		
		// 尝试解析 JSON 格式（OpenAI 风格）
		var chunk openAIChunk
		if err := json.Unmarshal([]byte(data), &chunk); err == nil {
			// 成功解析 JSON，提取 content
			if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
				extractedContent := chunk.Choices[0].Delta.Content
				// 收集纯文本内容
				w.pureContent.WriteString(extractedContent)
				// 以纯文本格式发送到前端（处理多行内容）
				writeSSEData(w.writer, extractedContent)
			}
		} else {
			// 不是 JSON 格式，直接作为纯文本处理
			w.pureContent.WriteString(data)
			// 使用正确的多行 SSE 格式写入
			writeSSEData(w.writer, data)
		}
	}

	return n, nil
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

// ============================================
// LaTeX 验证与自动修复
// ============================================

// AutoFixLatex 自动修复 LaTeX 代码
func (s *Service) AutoFixLatex(ctx context.Context, content string, writer io.Writer, modelLevel string) error {
	// 先验证代码
	validator := NewLatexValidator()
	result := validator.Validate(content)

	// 如果没有问题，直接返回
	if result.Valid && len(result.Warnings) == 0 {
		writeSSEData(writer, "<reply>\n✅ LaTeX 代码验证通过，无需修复。\n</reply>\n")
		return nil
	}

	return s.AutoFixLatexWithValidation(ctx, content, result, writer, modelLevel)
}

// AutoFixLatexWithValidation 根据验证结果自动修复 LaTeX 代码
func (s *Service) AutoFixLatexWithValidation(ctx context.Context, content string, result *ValidationResult, writer io.Writer, modelLevel string) error {
	// 构建修复提示词
	validator := NewLatexValidator()
	validationReport := validator.FormatValidationResult(result)

	systemPrompt := `你是一个专业的 LaTeX 语法修复专家。用户会提供一段有语法问题的 LaTeX 代码和验证报告。

你的任务是：
1. 分析验证报告中指出的问题
2. 修复所有错误和警告
3. 保持原有内容和格式不变，只修复语法问题

【重要】输出格式：
<think>
分析发现的问题...
</think>

<reply>
修复说明：
1. 问题一：xxx，已修复为 xxx
2. 问题二：xxx，已修复为 xxx
...
</reply>

<code>
修复后的完整 LaTeX 代码
</code>

注意：
- <code> 中必须输出完整的修复后代码，不能省略
- 只修复语法问题，不要改变内容或格式
- 确保修复后的代码可以正常编译`

	userMessage := fmt.Sprintf(`请修复以下 LaTeX 代码中的语法问题。

【验证报告】
%s

【原始代码】
`+"```latex"+`
%s
`+"```"+`

请根据验证报告修复所有问题，输出完整的修复后代码。`, validationReport, content)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage},
	}

	// 使用 LaTeX Agent 配置的默认模型
	return s.streamWithModel(ctx, messages, writer, 0)
}

// ValidateLatex 验证 LaTeX 代码
func (s *Service) ValidateLatex(content string) *ValidationResult {
	validator := NewLatexValidator()
	return validator.Validate(content)
}

// AutoFixCompileError 根据编译器错误日志自动修复 LaTeX 代码
// 这是最准确的修复方式，因为它使用真正的 TeX 编译器输出
func (s *Service) AutoFixCompileError(ctx context.Context, content string, compileLog string, engine string, writer io.Writer) error {
	if engine == "" {
		engine = "pdftex"
	}

	systemPrompt := `你是一个专业的 LaTeX 编译错误修复专家。用户会提供：
1. 有编译错误的 LaTeX 代码
2. TeX 编译器（` + engine + `）输出的实际错误日志

你的任务是分析编译器的错误信息，找出并修复问题。

【重要】常见编译错误及修复方法：

1. **参数不完整**
   - "Missing number, treated as zero" → 检查数字参数是否缺失
   - 例如：\documentclass[pt,apaper] → \documentclass[12pt,a4paper]
   - 例如：margin=in → margin=1in
   
2. **命令未定义**
   - "Undefined control sequence" → 检查宏包是否导入或命令拼写
   - 例如：需要 \usepackage{siunitx} 才能使用 \SI
   
3. **数学模式错误**
   - "Missing $ inserted" → 检查数学模式是否正确闭合
   - "Missing } inserted" → 检查括号是否匹配
   
4. **下标/上标问题**
   - 空的下标 \beta_ 或上标 x^ → 必须有内容
   
5. **环境不匹配**
   - "Environment xxx undefined" → 检查环境名称和宏包
   - "\begin{xxx} ended by \end{yyy}" → 环境配对错误

6. **编码/字体问题**
   - 包含中文但缺少 xeCJK 等宏包

【输出格式】
<think>
分析编译器的错误信息...
找出具体问题所在...
</think>

<reply>
🔧 修复说明：
1. 第 N 行：问题描述 → 修复方法
2. ...
</reply>

<code>
修复后的完整 LaTeX 代码（必须完整，不能省略任何部分）
</code>

【注意】
- 必须根据实际的编译器错误信息来修复，不要猜测
- <code> 中必须输出完整的修复后代码
- 只修复导致编译错误的问题，保持其他内容不变
- 确保修复后的代码可以正常编译`

	// 截取错误日志的关键部分（避免太长）
	logSummary := compileLog
	if len(compileLog) > 3000 {
		// 优先保留包含错误的部分
		lines := strings.Split(compileLog, "\n")
		var errorLines []string
		for i, line := range lines {
			if strings.HasPrefix(line, "!") || strings.HasPrefix(line, "l.") || 
			   strings.Contains(line, "Error") || strings.Contains(line, "error") {
				// 取错误行前后的上下文
				start := i - 2
				if start < 0 {
					start = 0
				}
				end := i + 3
				if end > len(lines) {
					end = len(lines)
				}
				for j := start; j < end; j++ {
					errorLines = append(errorLines, lines[j])
				}
				errorLines = append(errorLines, "---")
			}
		}
		if len(errorLines) > 0 {
			logSummary = strings.Join(errorLines, "\n")
		} else {
			// 如果没找到明显错误标记，取最后1000字符
			logSummary = compileLog[len(compileLog)-1000:]
		}
	}

	userMessage := fmt.Sprintf(`请修复以下 LaTeX 代码的编译错误。

【编译引擎】%s

【编译器错误日志】
%s

【原始代码】
`+"```latex"+`
%s
`+"```"+`

请根据编译器的错误信息修复代码，输出完整的修复后代码。`, engine, logSummary, content)

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage},
	}

	// 使用 LaTeX Agent 配置的默认模型
	return s.streamWithModel(ctx, messages, writer, 0)
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

// writerWrapper 包装 writer 以携带 context
type writerWrapper struct {
	io.Writer
	ctx context.Context
}

// UseEnhancedAgent 检查是否应该使用增强 Agent
// 根据配置和模型能力决定
func (s *Service) UseEnhancedAgent(modelID uint) bool {
	// 获取 Agent 配置
	config, err := s.configRepo.GetConfig()
	if err != nil || config == nil {
		return false // 默认不启用
	}
	
	// 检查是否启用多 Agent 模式
	return config.EnableMultiAgent
}

// GetMCPRegistry 获取 MCP 注册表（供外部使用）
func (s *Service) GetMCPRegistry() *mcp.Registry {
	return s.mcpRegistry
}

// ConvertLatexToWord 将 LaTeX 转换为 Word 文档
// 使用 Pandoc 进行转换
func (s *Service) ConvertLatexToWord(latexContent string, filename string) ([]byte, error) {
	// 创建临时文件
	tmpDir := "/tmp/latex-export"
	if err := os.MkdirAll(tmpDir, 0755); err != nil {
		return nil, fmt.Errorf("创建临时目录失败: %w", err)
	}
	
	// 生成唯一文件名
	timestamp := fmt.Sprintf("%d", time.Now().UnixNano())
	texFile := fmt.Sprintf("%s/%s_%s.tex", tmpDir, filename, timestamp)
	docxFile := fmt.Sprintf("%s/%s_%s.docx", tmpDir, filename, timestamp)
	
	// 写入 LaTeX 文件
	if err := os.WriteFile(texFile, []byte(latexContent), 0644); err != nil {
		return nil, fmt.Errorf("写入 LaTeX 文件失败: %w", err)
	}
	defer os.Remove(texFile)
	
	// 检查 Pandoc 是否可用
	checkCmd := exec.Command("which", "pandoc")
	if err := checkCmd.Run(); err != nil {
		return nil, fmt.Errorf("Pandoc 未安装，无法进行转换。请在服务器上安装 Pandoc")
	}
	
	// 使用 Pandoc 转换
	cmd := exec.Command("pandoc", 
		"-f", "latex",
		"-t", "docx",
		"-o", docxFile,
		texFile,
	)
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("Pandoc 转换失败: %s, 输出: %s", err.Error(), string(output))
	}
	defer os.Remove(docxFile)
	
	// 读取生成的 Word 文件
	docxBytes, err := os.ReadFile(docxFile)
	if err != nil {
		return nil, fmt.Errorf("读取 Word 文件失败: %w", err)
	}
	
	return docxBytes, nil
}
