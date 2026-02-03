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
	"os"
	"os/exec"
	"strings"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
	"scholar-backend/internal/thirdparty"
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
		AutoValidate:     agentConfig == nil || agentConfig.AutoValidateLatex,
		AutoFix:          agentConfig == nil || agentConfig.AutoFixErrors,
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
	
	fmt.Println("\n[LaTeXWriter] 🔧 Initializing MCP Tool Registry...")
	
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
	
	// 注册搜索工具（需要 API key，如果没有则跳过）
	// TODO: 从配置或环境变量获取 API key
	// searchProvider := mcp.NewSearchToolProvider(serperAPIKey, crossrefEmail)
	// providers = append(providers, searchProvider)
	
	// 注册文件工具（需要数据库，暂时跳过）
	// fileProvider := mcp.NewFileToolProvider(db)
	// providers = append(providers, fileProvider)
	
	for _, provider := range providers {
		if err := registry.RegisterProvider(provider); err != nil {
			fmt.Printf("[LaTeXWriter] ⚠️ Failed to register provider %s: %v\n", provider.GetCategory(), err)
		} else {
			tools := provider.GetTools()
			fmt.Printf("[LaTeXWriter] ✅ Registered %d tools in category '%s'\n", len(tools), provider.GetCategory())
		}
	}
	
	// 打印注册的工具总数
	allTools := registry.ListTools()
	fmt.Printf("[LaTeXWriter] 🔧 Total MCP tools registered: %d\n", len(allTools))
	
	// 打印所有工具名称（调试用）
	fmt.Println("[LaTeXWriter] 📋 Registered tools:")
	for _, tool := range allTools {
		fmt.Printf("    - %s (%s): %s\n", tool.Name, tool.Category, tool.Description[:min(50, len(tool.Description))]+"...")
	}
	
	return registry
}

// min helper function
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
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
func (s *Service) StreamChat(req *ChatRequest, writer io.Writer) error {
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

	// 确定模型级别
	modelLevel := thirdparty.ModelLevelMid
	switch req.ModelLevel {
	case "low":
		modelLevel = thirdparty.ModelLevelLow
	case "high":
		modelLevel = thirdparty.ModelLevelHigh
	}

	// 调用 AI 服务
	return s.aiService.StreamChatCompletionWithLevel(messages, writer, modelLevel)
}

// ExecuteTask 执行特定任务
func (s *Service) ExecuteTask(taskType string, content string, writer io.Writer, modelLevel string) error {
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

	// 确定模型级别
	level := thirdparty.ModelLevelMid
	switch modelLevel {
	case "low":
		level = thirdparty.ModelLevelLow
	case "high":
		level = thirdparty.ModelLevelHigh
	}

	return s.aiService.StreamChatCompletionWithLevel(messages, writer, level)
}

// ExecuteSectionTask 执行章节写作任务
func (s *Service) ExecuteSectionTask(sectionType string, content string, writer io.Writer, modelLevel string) error {
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

	// 章节写作默认使用高级模型
	level := thirdparty.ModelLevelHigh
	switch modelLevel {
	case "low":
		level = thirdparty.ModelLevelLow
	case "mid":
		level = thirdparty.ModelLevelMid
	}

	return s.aiService.StreamChatCompletionWithLevel(messages, writer, level)
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
		fmt.Println("[LaTeXWriter] ⚠️ MCP registry is nil, no tools available")
		return ""
	}
	
	tools := s.mcpRegistry.ListTools()
	if len(tools) == 0 {
		fmt.Println("[LaTeXWriter] ⚠️ No MCP tools registered")
		return ""
	}
	
	fmt.Printf("[LaTeXWriter] 📋 Building tools description with %d tools\n", len(tools))
	
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
func (s *Service) StreamChatWithContext(userID, documentID uint, req *ChatRequest, writer io.Writer) error {
	fmt.Println("\n" + strings.Repeat("=", 80))
	fmt.Println("[LaTeXWriter] 🚀 StreamChatWithContext started")
	fmt.Printf("[LaTeXWriter] 📝 User: %d, Doc: %d, ModelID: %d\n", userID, documentID, req.ModelID)
	fmt.Printf("[LaTeXWriter] 💬 Prompt: %.100s...\n", req.Prompt)
	fmt.Println(strings.Repeat("=", 80))
	
	// 0. 获取 Agent 配置
	agentConfig, err := s.configRepo.GetConfig()
	if err != nil {
		fmt.Printf("[LaTeXWriter] Warning: Failed to get agent config, using defaults: %v\n", err)
		// 使用默认配置
		agentConfig = &AgentConfig{
			ContextWindowMessages: 50,
			AutoValidateLatex:     true,
			AutoFixErrors:         true,
		}
	}

	// 获取模型配置
	var modelConfig *AgentModel
	if req.ModelID > 0 {
		// 如果请求指定了模型 ID
		modelConfig, err = s.modelRepo.GetModelByID(req.ModelID)
		if err != nil {
			fmt.Printf("[LaTeXWriter] Warning: Requested model %d not found, using default\n", req.ModelID)
		}
	}
	if modelConfig == nil {
		// 使用默认模型
		modelConfig, err = s.modelRepo.GetDefaultModel()
		if err != nil {
			fmt.Printf("[LaTeXWriter] Warning: No default model found, using fallback\n")
			modelConfig = &AgentModel{
				MaxContextTokens: 128000,
				MaxOutputTokens:  16384,
				Temperature:      0.7,
			}
		}
	}

	// 1. 获取或创建对话
	conv, err := s.convService.GetOrCreateConversation(userID, documentID)
	if err != nil {
		return fmt.Errorf("获取对话失败: %w", err)
	}

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

	// 4. 获取系统提示词
	systemPrompt := GetSystemPrompt("base")
	
	// 如果配置了自定义系统提示词，使用它
	if agentConfig.SystemPromptOverride != nil && *agentConfig.SystemPromptOverride != "" {
		systemPrompt = *agentConfig.SystemPromptOverride
	} else if agentConfig.SystemPromptAppend != nil && *agentConfig.SystemPromptAppend != "" {
		// 追加额外提示词
		systemPrompt = systemPrompt + "\n\n" + *agentConfig.SystemPromptAppend
	}

	// 添加工具能力说明（帮助模型理解可用的功能）
	toolDescription := getToolCapabilitiesDescription()
	systemPrompt = systemPrompt + "\n\n" + toolDescription
	
	// 添加 MCP 工具描述（动态从注册表获取）
	mcpToolsDescription := s.getMCPToolsDescription()
	if mcpToolsDescription != "" {
		systemPrompt = systemPrompt + mcpToolsDescription
		fmt.Println("[LaTeXWriter] ✅ MCP tools description added to system prompt")
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

	// Debug: 打印系统提示词长度和用户消息长度
	fmt.Printf("[LaTeXWriter] 📄 System prompt length: %d chars\n", len(systemPrompt))
	fmt.Printf("[LaTeXWriter] 📄 User message length: %d chars\n", len(userMessage.String()))
	
	// Debug: 检查 MCP 工具是否在提示词中
	if strings.Contains(systemPrompt, "MCP 工具") || strings.Contains(systemPrompt, "可用的 MCP 工具") {
		fmt.Println("[LaTeXWriter] ✅ MCP tools description IS included in system prompt")
	} else {
		fmt.Println("[LaTeXWriter] ⚠️ MCP tools description NOT found in system prompt")
	}

	// 6. 创建纯文本内容收集器（用于保存到数据库）
	var pureContent strings.Builder

	// 7. 根据模型配置选择调用方式
	modelName := "default"
	// 定义 modelLevel 供自动修复使用（默认 mid）
	modelLevel := thirdparty.ModelLevelMid
	
	// 检查是否有完整的自定义模型配置
	useCustomModel := modelConfig != nil && 
		modelConfig.APIEndpoint != "" && 
		modelConfig.APIKey != "" && 
		modelConfig.ModelName != ""
	
	if useCustomModel {
		// 使用用户配置的模型
		fmt.Printf("[LaTeXWriter] 🎯 Using custom model: %s (%s @ %s)\n", 
			modelConfig.DisplayName, modelConfig.ModelName, modelConfig.APIEndpoint)
		modelName = modelConfig.ModelName
		
		// 更新对话的模型级别为模型名称
		s.convService.UpdateModelLevel(conv.ID, modelConfig.DisplayName)
		
		// 创建 provider 配置
		providerConfig := &ai.ProviderConfig{
			Provider: modelConfig.APIFormat,
			Model:    modelConfig.ModelName,
			BaseURL:  modelConfig.APIEndpoint,
			APIKey:   modelConfig.APIKey,
		}
		
		// 创建 provider 实例
		provider, providerErr := ai.CreateProviderFromConfig(providerConfig)
		if providerErr != nil {
			fmt.Printf("[LaTeXWriter] ⚠️ Failed to create custom provider, falling back to default: %v\n", providerErr)
			// 回退到默认方式
			useCustomModel = false
		} else {
			// 使用自定义 provider 调用 AI
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
			ctx := context.Background()
			streamCh, streamErr := provider.StreamChat(ctx, llmReq)
			if streamErr != nil {
				fmt.Printf("[LaTeXWriter] ❌ Custom model stream error: %v\n", streamErr)
				return fmt.Errorf("AI 模型调用失败: %w", streamErr)
			}
			
			// 收集流式响应
			for chunk := range streamCh {
				if chunk.Error != nil {
					fmt.Printf("[LaTeXWriter] ❌ Stream chunk error: %v\n", chunk.Error)
					return fmt.Errorf("AI 响应错误: %w", chunk.Error)
				}
				if chunk.Delta != "" {
					// 收集纯文本内容
					pureContent.WriteString(chunk.Delta)
					// 写入 SSE 格式到前端
					sseData := fmt.Sprintf("data: %s\n\n", chunk.Delta)
					writer.Write([]byte(sseData))
				}
			}
		}
	}
	
	// 如果没有自定义模型或自定义模型创建失败，使用默认的 thirdparty 系统
	if !useCustomModel {
		// 确定模型级别
		switch req.ModelLevel {
		case "low":
			modelLevel = thirdparty.ModelLevelLow
			modelName = "low"
		case "high":
			modelLevel = thirdparty.ModelLevelHigh
			modelName = "high"
		default:
			modelName = "mid"
		}
		
		fmt.Printf("[LaTeXWriter] 📡 Using thirdparty model level: %s\n", modelName)
		
		// 更新对话的模型级别
		s.convService.UpdateModelLevel(conv.ID, req.ModelLevel)
		
		// 使用纯内容收集器调用 AI 服务
		pureContentCollector := &pureContentWriter{
			writer:      writer,
			pureContent: &pureContent,
		}
		err = s.aiService.StreamChatCompletionWithLevel(messages, pureContentCollector, modelLevel)
		if err != nil {
			return err
		}
	}

	// 8. 解析 AI 回复（使用纯文本内容）
	fmt.Println("\n" + strings.Repeat("-", 40))
	fmt.Println("[LaTeXWriter] 📥 AI Response received")
	fmt.Printf("[LaTeXWriter] 📄 Response length: %d chars\n", len(pureContent.String()))
	
	parsed := ParseAIResponse(pureContent.String())
	
	fmt.Printf("[LaTeXWriter] 🧠 Parsed - Think: %d chars, Reply: %d chars, Code: %d chars\n", 
		len(parsed.Think), len(parsed.Reply), len(parsed.Code))

	// 9.5 清理代码（移除可能混入的思考/说明内容）
	if parsed.Code != "" {
		originalLen := len(parsed.Code)
		cleanedCode := SanitizeLatexCode(parsed.Code)
		if cleanedCode != parsed.Code {
			fmt.Printf("[LaTeXWriter] 🧹 Code sanitized: %d → %d chars\n", originalLen, len(cleanedCode))
			parsed.Code = cleanedCode
		} else {
			fmt.Println("[LaTeXWriter] ✅ Code is clean, no sanitization needed")
		}
	}

	// 10. 自动验证和修复闭环（根据配置决定是否启用）
	if parsed.Code != "" && agentConfig.AutoValidateLatex {
		fmt.Println("\n[LaTeXWriter] 🔍 Starting LaTeX validation...")
		validator := NewLatexValidator()
		result := validator.Validate(parsed.Code)
		fmt.Printf("[LaTeXWriter] 📊 Validation result: Valid=%v, Errors=%d, Warnings=%d\n", 
			result.Valid, len(result.Errors), len(result.Warnings))

		// 如果有错误且启用了自动修复，让 AI 修复
		maxRetries := int(agentConfig.MaxIterations / 3) // 使用配置的迭代次数的 1/3
		if maxRetries < 2 {
			maxRetries = 2
		}
		if maxRetries > 5 {
			maxRetries = 5
		}
		retryCount := 0
		currentCode := parsed.Code

		for !result.Valid && len(result.Errors) > 0 && retryCount < maxRetries && agentConfig.AutoFixErrors {
			retryCount++
			fmt.Printf("[LaTeXWriter] Code validation failed (attempt %d), auto-fixing...\n", retryCount)

			// 发送分隔符和提示
			writer.Write([]byte(fmt.Sprintf("data: \n\n---\n\n🔧 检测到语法问题，正在自动修复（第 %d 次）...\n\n", retryCount)))

			// 构建修复请求
			validationReport := validator.FormatValidationResult(result)
			fixMessages := []ai.ChatMessage{
				{Role: "system", Content: `你是 LaTeX 语法修复专家。

【重要规则】
1. 只修复语法问题，不要改变内容
2. 输出完整的修复后代码，使用 <code>...</code> 包裹
3. <code> 标签内只能有纯 LaTeX 代码
4. 不要添加任何解释、说明、注释
5. 不要有中文占位符

输出格式：
<code>
修复后的完整 LaTeX 代码
</code>`},
				{Role: "user", Content: fmt.Sprintf("验证报告：\n%s\n\n原始代码：\n```latex\n%s\n```\n\n请直接修复并输出完整代码（只输出 <code> 标签）。", validationReport, currentCode)},
			}

			// 收集修复响应
			var fixResponse strings.Builder
			fixCollector := &responseCollectorWriter{
				writer:    writer,
				collector: &fixResponse,
			}

			err = s.aiService.StreamChatCompletionWithLevel(fixMessages, fixCollector, modelLevel)
			if err != nil {
				fmt.Printf("[LaTeXWriter] Auto-fix failed: %v\n", err)
				break
			}

			// 解析修复后的代码
			fixParsed := ParseAIResponse(fixResponse.String())
			if fixParsed.Code != "" {
				// 清理修复后的代码
				currentCode = SanitizeLatexCode(fixParsed.Code)
				// 重新验证
				result = validator.Validate(currentCode)

				// 更新 parsed 的 code
				parsed.Code = currentCode
			} else {
				// 无法解析出代码，停止重试
				break
			}
		}

		if result.Valid || len(result.Errors) == 0 {
			if retryCount > 0 {
				writer.Write([]byte("data: \n\n✅ 代码已自动修复完成！\n\n"))
			}
		} else {
			writer.Write([]byte(fmt.Sprintf("data: \n\n⚠️ 仍有 %d 个问题未能自动修复，请手动检查。\n\n", len(result.Errors))))
		}
	}

	// 10. 构建格式化的内容字符串（用于保存和历史渲染）
	formattedContent := buildFormattedContent(parsed)

	// 11. 保存最终的 AI 回复
	_, err = s.convService.AddAssistantMessage(conv.ID, formattedContent, parsed, modelName)
	if err != nil {
		fmt.Printf("[LaTeXWriter] Failed to save assistant message: %v\n", err)
	}

	fmt.Println("\n" + strings.Repeat("=", 80))
	fmt.Println("[LaTeXWriter] ✅ StreamChatWithContext completed successfully")
	fmt.Printf("[LaTeXWriter] 📊 Summary: Code=%d chars, Reply=%d chars\n", len(parsed.Code), len(parsed.Reply))
	fmt.Println(strings.Repeat("=", 80) + "\n")

	return nil
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
// 同时输出 SSE 格式到前端，并收集纯文本内容用于保存
type pureContentWriter struct {
	writer      io.Writer
	pureContent *strings.Builder
}

func (w *pureContentWriter) Write(p []byte) (n int, err error) {
	// 写入原始 writer（SSE 格式输出到前端）
	n, err = w.writer.Write(p)
	if err != nil {
		return n, err
	}

	// 收集纯文本内容（解析 SSE 数据，只保留实际内容）
	content := string(p)
	if strings.HasPrefix(content, "data: ") {
		data := strings.TrimPrefix(content, "data: ")
		data = strings.TrimSuffix(data, "\n\n")
		if data != "[DONE]" {
			w.pureContent.WriteString(data)
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
func (s *Service) AutoFixLatex(content string, writer io.Writer, modelLevel string) error {
	// 先验证代码
	validator := NewLatexValidator()
	result := validator.Validate(content)

	// 如果没有问题，直接返回
	if result.Valid && len(result.Warnings) == 0 {
		writer.Write([]byte("data: " + "✅ LaTeX 代码验证通过，无需修复。\n\n"))
		return nil
	}

	return s.AutoFixLatexWithValidation(content, result, writer, modelLevel)
}

// AutoFixLatexWithValidation 根据验证结果自动修复 LaTeX 代码
func (s *Service) AutoFixLatexWithValidation(content string, result *ValidationResult, writer io.Writer, modelLevel string) error {
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

	// 确定模型级别
	level := thirdparty.ModelLevelMid
	switch modelLevel {
	case "low":
		level = thirdparty.ModelLevelLow
	case "high":
		level = thirdparty.ModelLevelHigh
	}

	return s.aiService.StreamChatCompletionWithLevel(messages, writer, level)
}

// ValidateLatex 验证 LaTeX 代码
func (s *Service) ValidateLatex(content string) *ValidationResult {
	validator := NewLatexValidator()
	return validator.Validate(content)
}

// StreamChatWithValidation 流式对话，完成后自动验证并修复
func (s *Service) StreamChatWithValidation(userID, documentID uint, req *ChatRequest, writer io.Writer) error {
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

	// 确定模型级别
	modelLevel := thirdparty.ModelLevelMid
	modelName := "mid"
	switch req.ModelLevel {
	case "low":
		modelLevel = thirdparty.ModelLevelLow
		modelName = "low"
	case "high":
		modelLevel = thirdparty.ModelLevelHigh
		modelName = "high"
	}

	s.convService.UpdateModelLevel(conv.ID, req.ModelLevel)

	// 调用 AI
	err = s.aiService.StreamChatCompletionWithLevel(messages, responseCollector, modelLevel)
	if err != nil {
		return err
	}

	// 2. 解析 AI 响应
	aiResponse := fullResponse.String()
	parsed := ParseAIResponse(aiResponse)

	// 3. 如果有代码输出，验证它
	if parsed.Code != "" {
		validator := NewLatexValidator()
		result := validator.Validate(parsed.Code)

		// 如果有错误，自动修复
		if !result.Valid {
			// 发送分隔消息
			writer.Write([]byte("data: \n\n---\n\n🔍 检测到代码存在语法问题，正在自动修复...\n\n"))

			// 调用自动修复
			err = s.AutoFixLatexWithValidation(parsed.Code, result, writer, req.ModelLevel)
			if err != nil {
				fmt.Printf("[LaTeXWriter] Auto-fix failed: %v\n", err)
			}
		}
	}

	// 4. 保存 AI 回复
	_, err = s.convService.AddAssistantMessage(conv.ID, aiResponse, parsed, modelName)
	if err != nil {
		fmt.Printf("[LaTeXWriter] Failed to save assistant message: %v\n", err)
	}

	return nil
}

// ============================================
// 增强的 Agent 架构 - 使用 Orchestrator
// ============================================

// StreamChatWithOrchestrator 使用 Orchestrator 进行流式对话
// 这是新的增强版本，支持多 Agent、Function Calling、自动压缩等功能
func (s *Service) StreamChatWithOrchestrator(userID, documentID uint, req *ChatRequest, writer io.Writer) error {
	fmt.Println("\n" + strings.Repeat("=", 80))
	fmt.Println("[LaTeXWriter] 🚀 StreamChatWithOrchestrator started (Enhanced Agent Mode)")
	fmt.Printf("[LaTeXWriter] 📝 User: %d, Doc: %d, ModelID: %d\n", userID, documentID, req.ModelID)
	fmt.Println(strings.Repeat("=", 80))

	// 1. 获取或创建 Orchestrator
	orchestrator, err := s.GetOrCreateOrchestrator(req.ModelID)
	if err != nil {
		fmt.Printf("[LaTeXWriter] Failed to create orchestrator, falling back to basic mode: %v\n", err)
		// 回退到基础模式
		return s.StreamChatWithContext(userID, documentID, req, writer)
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
		fmt.Printf("[LaTeXWriter] Warning: Failed to get conversation history: %v\n", err)
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
	result, err := orchestrator.StreamExecute(writer.(*writerWrapper).ctx, orchReq, writer)
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
		fmt.Printf("[LaTeXWriter] Failed to save assistant message: %v\n", err)
	}

	fmt.Println("\n" + strings.Repeat("=", 80))
	fmt.Printf("[LaTeXWriter] ✅ StreamChatWithOrchestrator completed in %dms\n", result.TotalDuration)
	fmt.Printf("[LaTeXWriter] 📊 Summary: Iterations=%d, Code=%d chars\n", result.Iterations, len(result.Code))
	fmt.Println(strings.Repeat("=", 80) + "\n")

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
