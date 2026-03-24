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
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"gorm.io/gorm"

	"scholar-backend/internal/ai"
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
func (s *Service) streamWithModel(messages []ai.ChatMessage, writer io.Writer, modelID uint) error {
	// 获取模型配置
	var modelConfig *AgentModel
	var err error
	
	if modelID > 0 {
		modelConfig, err = s.modelRepo.GetModelByID(modelID)
		if err != nil {
			log.Printf("[LaTeXWriter] Model %d not found, using default\n", modelID)
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
	
	log.Printf("[LaTeXWriter] 🎯 Using model: %s (%s)\n", modelConfig.DisplayName, modelConfig.ModelName)
	
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
	ctx := context.Background()
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
func (s *Service) streamWithModelAndCollect(messages []ai.ChatMessage, writer io.Writer, modelID uint) (string, error) {
	var modelConfig *AgentModel
	var err error
	
	if modelID > 0 {
		modelConfig, err = s.modelRepo.GetModelByID(modelID)
		if err != nil {
			log.Printf("[LaTeXWriter] Model %d not found, using default\n", modelID)
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
	
	ctx := context.Background()
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
	
	log.Println("\n[LaTeXWriter] 🔧 Initializing MCP Tool Registry...")
	
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
			log.Printf("[LaTeXWriter] ⚠️ Failed to register provider %s: %v\n", provider.GetCategory(), err)
		} else {
			tools := provider.GetTools()
			log.Printf("[LaTeXWriter] ✅ Registered %d tools in category '%s'\n", len(tools), provider.GetCategory())
		}
	}
	
	// 打印注册的工具总数
	allTools := registry.ListTools()
	log.Printf("[LaTeXWriter] 🔧 Total MCP tools registered: %d\n", len(allTools))
	
	// 打印所有工具名称（调试用）
	log.Println("[LaTeXWriter] 📋 Registered tools:")
	for _, tool := range allTools {
		log.Printf("    - %s (%s): %s\n", tool.Name, tool.Category, tool.Description[:min(50, len(tool.Description))]+"...")
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

	// 使用 LaTeX Agent 配置的模型（modelID 为 0 表示使用默认模型）
	return s.streamWithModel(messages, writer, 0)
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

	// 使用 LaTeX Agent 配置的默认模型
	return s.streamWithModel(messages, writer, 0)
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

	// 使用 LaTeX Agent 配置的默认模型
	return s.streamWithModel(messages, writer, 0)
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
		log.Println("[LaTeXWriter] ⚠️ MCP registry is nil, no tools available")
		return ""
	}
	
	tools := s.mcpRegistry.ListTools()
	if len(tools) == 0 {
		log.Println("[LaTeXWriter] ⚠️ No MCP tools registered")
		return ""
	}
	
	log.Printf("[LaTeXWriter] 📋 Building tools description with %d tools\n", len(tools))
	
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
	startTime := time.Now()
	
	log.Println("\n" + strings.Repeat("=", 80))
	log.Println("[AI-FLOW] ==================== 🚀 AI 对话流程开始 ====================")
	log.Printf("[AI-FLOW] 📍 Step 1: 请求接收\n")
	log.Printf("[AI-FLOW]   - 时间: %s\n", startTime.Format("2006-01-02 15:04:05.000"))
	log.Printf("[AI-FLOW]   - 用户ID: %d\n", userID)
	log.Printf("[AI-FLOW]   - 文档ID: %d\n", documentID)
	log.Printf("[AI-FLOW]   - 模型ID: %d\n", req.ModelID)
	log.Printf("[AI-FLOW]   - Prompt长度: %d 字符\n", len(req.Prompt))
	log.Printf("[AI-FLOW]   - Context长度: %d 字符\n", len(req.Context))
	log.Printf("[AI-FLOW]   - FullContent长度: %d 字符\n", len(req.FullContent))
	
	// 打印 Prompt 前200字符
	promptPreview := req.Prompt
	if len(promptPreview) > 200 {
		promptPreview = promptPreview[:200] + "..."
	}
	log.Printf("[AI-FLOW]   - Prompt预览: %s\n", promptPreview)
	log.Println(strings.Repeat("-", 80))
	
	// 0. 获取 Agent 配置
	log.Printf("[AI-FLOW] 📍 Step 2: 加载 Agent 配置\n")
	agentConfig, err := s.configRepo.GetConfig()
	if err != nil {
		log.Printf("[AI-FLOW]   ⚠️ 获取配置失败，使用默认值: %v\n", err)
		// 使用默认配置
		agentConfig = &AgentConfig{
			ContextWindowMessages: 50,
			AutoValidateLatex:     false, // 已禁用，用户通过对话修复
			AutoFixErrors:         false, // 已禁用，用户通过对话修复
		}
	} else {
		log.Printf("[AI-FLOW]   ✅ Agent配置加载成功\n")
		log.Printf("[AI-FLOW]   - ContextWindowMessages: %d\n", agentConfig.ContextWindowMessages)
		log.Printf("[AI-FLOW]   - EnableMultiAgent: %v\n", agentConfig.EnableMultiAgent)
	}

	// 获取模型配置
	log.Printf("[AI-FLOW] 📍 Step 3: 加载模型配置\n")
	var modelConfig *AgentModel
	if req.ModelID > 0 {
		// 如果请求指定了模型 ID
		modelConfig, err = s.modelRepo.GetModelByID(req.ModelID)
		if err != nil {
			log.Printf("[AI-FLOW]   ⚠️ 指定模型 %d 未找到，使用默认模型\n", req.ModelID)
		}
	}
	if modelConfig == nil {
		// 使用默认模型
		modelConfig, err = s.modelRepo.GetDefaultModel()
		if err != nil {
			log.Printf("[AI-FLOW]   ⚠️ 无默认模型，使用内置配置\n")
			modelConfig = &AgentModel{
				MaxContextTokens: 128000,
				MaxOutputTokens:  16384,
				Temperature:      0.7,
			}
		}
	}
	log.Printf("[AI-FLOW]   ✅ 模型配置加载成功\n")
	log.Printf("[AI-FLOW]   - 模型名称: %s\n", modelConfig.DisplayName)
	log.Printf("[AI-FLOW]   - 模型ID: %s\n", modelConfig.ModelName)
	log.Printf("[AI-FLOW]   - API端点: %s\n", modelConfig.APIEndpoint)
	log.Printf("[AI-FLOW]   - API格式: %s\n", modelConfig.APIFormat)
	log.Printf("[AI-FLOW]   - 最大上下文: %d tokens\n", modelConfig.MaxContextTokens)
	log.Printf("[AI-FLOW]   - 最大输出: %d tokens\n", modelConfig.MaxOutputTokens)
	log.Printf("[AI-FLOW]   - Temperature: %.2f\n", modelConfig.Temperature)
	log.Println(strings.Repeat("-", 80))

	// 1. 获取或创建对话
	log.Printf("[AI-FLOW] 📍 Step 4: 对话管理\n")
	conv, err := s.convService.GetOrCreateConversation(userID, documentID)
	if err != nil {
		log.Printf("[AI-FLOW]   ❌ 获取对话失败: %v\n", err)
		return fmt.Errorf("获取对话失败: %w", err)
	}
	log.Printf("[AI-FLOW]   ✅ 对话ID: %d\n", conv.ID)

	// 2. 保存用户消息
	_, err = s.convService.AddUserMessage(conv.ID, req.Prompt)
	if err != nil {
		log.Printf("[AI-FLOW]   ❌ 保存用户消息失败: %v\n", err)
		return fmt.Errorf("保存用户消息失败: %w", err)
	}
	log.Printf("[AI-FLOW]   ✅ 用户消息已保存\n")

	// 3. 构建上下文（使用配置的消息数量限制）
	contextStr, err := s.convService.BuildContextStringWithLimit(conv.ID, int(agentConfig.ContextWindowMessages))
	if err != nil {
		log.Printf("[AI-FLOW]   ❌ 构建上下文失败: %v\n", err)
		return fmt.Errorf("构建上下文失败: %w", err)
	}
	log.Printf("[AI-FLOW]   ✅ 历史上下文长度: %d 字符\n", len(contextStr))
	log.Println(strings.Repeat("-", 80))

	// 4. 获取系统提示词
	log.Printf("[AI-FLOW] 📍 Step 5: 构建系统提示词 (System Prompt)\n")
	systemPrompt := GetSystemPrompt("base")
	basePromptLen := len(systemPrompt)
	log.Printf("[AI-FLOW]   - 基础提示词长度: %d 字符\n", basePromptLen)
	
	// 检查基础提示词是否包含关键规则
	if strings.Contains(systemPrompt, "第一优先级规则") {
		log.Printf("[AI-FLOW]   ✅ 基础提示词包含【第一优先级规则】\n")
	} else {
		log.Printf("[AI-FLOW]   ⚠️ 基础提示词缺少【第一优先级规则】\n")
	}
	if strings.Contains(systemPrompt, "参数必须完整") {
		log.Printf("[AI-FLOW]   ✅ 基础提示词包含【参数必须完整】规则\n")
	} else {
		log.Printf("[AI-FLOW]   ⚠️ 基础提示词缺少【参数必须完整】规则\n")
	}
	
	// 如果配置了自定义系统提示词，使用它
	if agentConfig.SystemPromptOverride != nil && *agentConfig.SystemPromptOverride != "" {
		systemPrompt = *agentConfig.SystemPromptOverride
		log.Printf("[AI-FLOW]   🔄 使用自定义系统提示词 (override)\n")
	} else if agentConfig.SystemPromptAppend != nil && *agentConfig.SystemPromptAppend != "" {
		// 追加额外提示词
		systemPrompt = systemPrompt + "\n\n" + *agentConfig.SystemPromptAppend
		log.Printf("[AI-FLOW]   ➕ 追加自定义提示词: %d 字符\n", len(*agentConfig.SystemPromptAppend))
	}

	// 添加工具能力说明（帮助模型理解可用的功能）
	toolDescription := getToolCapabilitiesDescription()
	systemPrompt = systemPrompt + "\n\n" + toolDescription
	log.Printf("[AI-FLOW]   ➕ 添加工具能力说明: %d 字符\n", len(toolDescription))
	
	// 添加 MCP 工具描述（动态从注册表获取）
	mcpToolsDescription := s.getMCPToolsDescription()
	if mcpToolsDescription != "" {
		systemPrompt = systemPrompt + mcpToolsDescription
		log.Printf("[AI-FLOW]   ➕ 添加MCP工具描述: %d 字符\n", len(mcpToolsDescription))
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
	log.Printf("[AI-FLOW]   ➕ 添加多轮对话规则: %d 字符\n", len(multiTurnInstruction))
	log.Printf("[AI-FLOW]   📊 系统提示词总长度: %d 字符\n", len(systemPrompt))
	
	// 打印系统提示词的前500字符（用于验证关键规则是否在开头）
	promptHead := systemPrompt
	if len(promptHead) > 500 {
		promptHead = promptHead[:500] + "..."
	}
	log.Printf("[AI-FLOW]   📄 系统提示词开头预览:\n%s\n", promptHead)
	log.Println(strings.Repeat("-", 80))

	// 5. 构建用户消息（包含上下文和当前请求）
	log.Printf("[AI-FLOW] 📍 Step 6: 构建用户消息 (User Message)\n")
	var userMessage strings.Builder

	// 添加历史上下文（用清晰的标记）
	if contextStr != "" {
		userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
		userMessage.WriteString("【历史对话记录】\n")
		userMessage.WriteString("以下是之前的对话，仅供参考上下文，不要在代码中引用这些内容：\n")
		userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
		userMessage.WriteString(contextStr)
		userMessage.WriteString("\n\n")
		log.Printf("[AI-FLOW]   ➕ 添加历史对话: %d 字符\n", len(contextStr))
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
		log.Printf("[AI-FLOW]   ➕ 添加选中代码: %d 字符\n", len(req.Context))
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
			log.Printf("[AI-FLOW]   ➕ 添加完整文档(截断): %d -> %d 字符\n", len(req.FullContent), maxDocContext)
		} else if len(req.FullContent) > 0 {
			userMessage.WriteString("```latex\n")
			userMessage.WriteString(req.FullContent)
			userMessage.WriteString("\n```\n\n")
			log.Printf("[AI-FLOW]   ➕ 添加完整文档: %d 字符\n", len(req.FullContent))
		}
	}

	// 添加当前用户请求（最重要的部分）
	userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
	userMessage.WriteString("【当前用户请求】\n")
	userMessage.WriteString("═══════════════════════════════════════════════════════════════════════════════\n")
	userMessage.WriteString(req.Prompt)
	userMessage.WriteString("\n\n")
	userMessage.WriteString("请按照系统提示词的格式要求回复。记住：<code> 标签内只能有纯净的 LaTeX 代码！")

	log.Printf("[AI-FLOW]   📊 用户消息总长度: %d 字符\n", len(userMessage.String()))
	log.Println(strings.Repeat("-", 80))

	messages := []ai.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMessage.String()},
	}

	// 汇总打印
	log.Printf("[AI-FLOW] 📍 Step 7: 消息汇总\n")
	log.Printf("[AI-FLOW]   📄 System Prompt: %d 字符\n", len(systemPrompt))
	log.Printf("[AI-FLOW]   📄 User Message: %d 字符\n", len(userMessage.String()))
	log.Printf("[AI-FLOW]   📄 总输入: %d 字符 (约 %d tokens)\n", 
		len(systemPrompt)+len(userMessage.String()), 
		(len(systemPrompt)+len(userMessage.String()))/4)
	
	// 检查关键规则
	log.Printf("[AI-FLOW]   🔍 关键规则检查:\n")
	if strings.Contains(systemPrompt, "🚨") {
		log.Printf("[AI-FLOW]      ✅ 包含警告符号 🚨\n")
	} else {
		log.Printf("[AI-FLOW]      ⚠️ 缺少警告符号 🚨\n")
	}
	if strings.Contains(systemPrompt, "documentclass[pt,apaper]") {
		log.Printf("[AI-FLOW]      ✅ 包含错误示例 documentclass[pt,apaper]\n")
	} else {
		log.Printf("[AI-FLOW]      ⚠️ 缺少错误示例\n")
	}
	if strings.Contains(systemPrompt, "MCP 工具") || strings.Contains(systemPrompt, "可用的 MCP 工具") {
		log.Printf("[AI-FLOW]      ✅ 包含MCP工具描述\n")
	} else {
		log.Printf("[AI-FLOW]      ⚠️ 缺少MCP工具描述\n")
	}
	log.Println(strings.Repeat("-", 80))

	// 6. 创建纯文本内容收集器（用于保存到数据库）
	var pureContent strings.Builder

	// 7. 检查模型配置
	log.Printf("[AI-FLOW] 📍 Step 8: 准备 AI 调用\n")
	if modelConfig == nil || modelConfig.APIEndpoint == "" || modelConfig.APIKey == "" || modelConfig.ModelName == "" {
		log.Printf("[AI-FLOW]   ❌ 模型配置不完整\n")
		return fmt.Errorf("LaTeX Agent 模型未配置，请在后台管理中配置 AI 模型")
	}
	
	// 使用配置的模型
	modelName := modelConfig.DisplayName
	log.Printf("[AI-FLOW]   🎯 目标模型: %s\n", modelName)
	log.Printf("[AI-FLOW]   🔗 API端点: %s\n", modelConfig.APIEndpoint)
	log.Printf("[AI-FLOW]   🔑 API Key: %s...%s\n", 
		modelConfig.APIKey[:8], 
		modelConfig.APIKey[len(modelConfig.APIKey)-4:])
	
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
	log.Printf("[AI-FLOW]   🔧 创建 Provider (格式: %s)\n", modelConfig.APIFormat)
	provider, providerErr := ai.CreateProviderFromConfig(providerConfig)
	if providerErr != nil {
		log.Printf("[AI-FLOW]   ❌ Provider 创建失败: %v\n", providerErr)
		return fmt.Errorf("创建 AI 模型失败: %w", providerErr)
	}
	log.Printf("[AI-FLOW]   ✅ Provider 创建成功\n")
	
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
	log.Printf("[AI-FLOW]   📝 LLM请求参数: Temperature=%.2f, MaxTokens=%d\n", 
		modelConfig.Temperature, modelConfig.MaxOutputTokens)
	log.Println(strings.Repeat("-", 80))
	
	// 流式调用
	log.Printf("[AI-FLOW] 📍 Step 9: 发起 AI 流式调用\n")
	aiCallStart := time.Now()
	ctx := context.Background()
	log.Printf("[AI-FLOW]   🚀 开始调用 AI... (时间: %s)\n", aiCallStart.Format("15:04:05.000"))
	streamCh, streamErr := provider.StreamChat(ctx, llmReq)
	if streamErr != nil {
		log.Printf("[AI-FLOW]   ❌ AI 调用失败: %v\n", streamErr)
		return fmt.Errorf("AI 模型调用失败: %w", streamErr)
	}
	log.Printf("[AI-FLOW]   ✅ AI 流开始 (首字节时间: %dms)\n", time.Since(aiCallStart).Milliseconds())
	
	// 收集流式响应
	log.Printf("[AI-FLOW] 📍 Step 10: 接收流式响应\n")
	chunkCount := 0
	for chunk := range streamCh {
		if chunk.Error != nil {
			log.Printf("[AI-FLOW]   ❌ 流式响应错误: %v\n", chunk.Error)
			return fmt.Errorf("AI 响应错误: %w", chunk.Error)
		}
		if chunk.Delta != "" {
			chunkCount++
			if chunkCount == 1 {
				log.Printf("[AI-FLOW]   📦 收到首个 chunk (首字节延迟: %dms)\n", 
					time.Since(aiCallStart).Milliseconds())
			}
			// 收集纯文本内容
			pureContent.WriteString(chunk.Delta)
			// 写入 SSE 格式到前端（处理多行内容）
			writeSSEData(writer, chunk.Delta)
		}
	}
	aiCallEnd := time.Now()
	log.Printf("[AI-FLOW]   🏁 流式响应完成\n")
	log.Printf("[AI-FLOW]   - 总 chunks: %d\n", chunkCount)
	log.Printf("[AI-FLOW]   - AI 调用总耗时: %dms\n", aiCallEnd.Sub(aiCallStart).Milliseconds())
	log.Printf("[AI-FLOW]   - 响应内容长度: %d 字符\n", len(pureContent.String()))
	log.Println(strings.Repeat("-", 80))

	// 8. 解析 AI 回复（使用纯文本内容）
	log.Printf("[AI-FLOW] 📍 Step 11: 解析 AI 响应\n")
	
	parsed := ParseAIResponse(pureContent.String())
	
	log.Printf("[AI-FLOW]   📊 解析结果:\n")
	log.Printf("[AI-FLOW]   - Think: %d 字符\n", len(parsed.Think))
	log.Printf("[AI-FLOW]   - Reply: %d 字符\n", len(parsed.Reply))
	log.Printf("[AI-FLOW]   - Code: %d 字符\n", len(parsed.Code))
	
	// 检查 Code 中是否有问题格式
	if parsed.Code != "" {
		log.Printf("[AI-FLOW]   🔍 代码质量检查:\n")
		if strings.Contains(parsed.Code, "\\documentclass[pt,") {
			log.Printf("[AI-FLOW]      ⚠️ 发现问题: documentclass[pt,...] (缺少数字)\n")
		}
		if strings.Contains(parsed.Code, "\\documentclass[12pt,") || strings.Contains(parsed.Code, "\\documentclass[11pt,") {
			log.Printf("[AI-FLOW]      ✅ documentclass 参数正确\n")
		}
		if strings.Contains(parsed.Code, "margin=in") && !strings.Contains(parsed.Code, "margin=1in") {
			log.Printf("[AI-FLOW]      ⚠️ 发现问题: margin=in (缺少数字)\n")
		}
		if strings.Contains(parsed.Code, "\\usepackage[utf]") {
			log.Printf("[AI-FLOW]      ⚠️ 发现问题: usepackage[utf] (缺少数字)\n")
		}
		if strings.Contains(parsed.Code, "\\usepackage[utf8]") {
			log.Printf("[AI-FLOW]      ✅ inputenc 参数正确\n")
		}
		
		// 打印代码前200字符预览
		codePreview := parsed.Code
		if len(codePreview) > 300 {
			codePreview = codePreview[:300] + "..."
		}
		log.Printf("[AI-FLOW]   📄 代码预览:\n%s\n", codePreview)
	}

	// 9.5 清理代码（移除可能混入的思考/说明内容）
	if parsed.Code != "" {
		originalLen := len(parsed.Code)
		cleanedCode := SanitizeLatexCode(parsed.Code)
		if cleanedCode != parsed.Code {
			log.Printf("[AI-FLOW]   🧹 代码清理: %d → %d 字符\n", originalLen, len(cleanedCode))
			parsed.Code = cleanedCode
		} else {
			log.Printf("[AI-FLOW]   ✅ 代码无需清理\n")
		}
	}
	log.Println(strings.Repeat("-", 80))

	// 10. 自动验证和修复闭环 - 已禁用
	// 用户遇到编译错误时，通过点击"让 AI 修复"按钮手动触发修复
	// 这样更灵活，也避免了不必要的等待

	// 10. 构建格式化的内容字符串（用于保存和历史渲染）
	log.Printf("[AI-FLOW] 📍 Step 12: 保存响应\n")
	formattedContent := buildFormattedContent(parsed)
	log.Printf("[AI-FLOW]   📄 格式化内容长度: %d 字符\n", len(formattedContent))

	// 11. 保存最终的 AI 回复
	_, err = s.convService.AddAssistantMessage(conv.ID, formattedContent, parsed, modelName)
	if err != nil {
		log.Printf("[AI-FLOW]   ❌ 保存 AI 回复失败: %v\n", err)
	} else {
		log.Printf("[AI-FLOW]   ✅ AI 回复已保存到对话 %d\n", conv.ID)
	}

	// 流程结束统计
	totalDuration := time.Since(startTime)
	log.Println("\n" + strings.Repeat("=", 80))
	log.Println("[AI-FLOW] ==================== ✅ AI 对话流程完成 ====================")
	log.Printf("[AI-FLOW] 📊 流程统计:\n")
	log.Printf("[AI-FLOW]   - 总耗时: %dms (%.2f秒)\n", totalDuration.Milliseconds(), totalDuration.Seconds())
	log.Printf("[AI-FLOW]   - 输入 tokens (估算): %d\n", (len(systemPrompt)+len(userMessage.String()))/4)
	log.Printf("[AI-FLOW]   - 输出 tokens (估算): %d\n", len(pureContent.String())/4)
	log.Printf("[AI-FLOW]   - Code 长度: %d 字符\n", len(parsed.Code))
	log.Printf("[AI-FLOW]   - Reply 长度: %d 字符\n", len(parsed.Reply))
	if parsed.Code != "" {
		// 最终代码质量检查
		hasIssue := false
		if strings.Contains(parsed.Code, "\\documentclass[pt,") {
			log.Printf("[AI-FLOW]   ⚠️ 最终代码问题: documentclass[pt,...]\n")
			hasIssue = true
		}
		if strings.Contains(parsed.Code, "margin=in") && !strings.Contains(parsed.Code, "margin=1in") {
			log.Printf("[AI-FLOW]   ⚠️ 最终代码问题: margin=in\n")
			hasIssue = true
		}
		if strings.Contains(parsed.Code, "\\usepackage[utf]") {
			log.Printf("[AI-FLOW]   ⚠️ 最终代码问题: usepackage[utf]\n")
			hasIssue = true
		}
		if !hasIssue {
			log.Printf("[AI-FLOW]   ✅ 代码质量检查通过\n")
		}
	}
	log.Println(strings.Repeat("=", 80) + "\n")

	return nil
}

// SSE 日志计数器（用于调试）
var sseLogCounter int64 = 0

// writeSSEData 正确处理内容的 SSE 写入
// 使用 <br> 处理换行符，避免与 LaTeX 命令冲突（如 \newcommand）
func writeSSEData(writer io.Writer, content string) {
	if content == "" {
		return
	}
	
	// 转义换行符：\n -> <br>
	// 注意：不能用 \\n，因为会与 \newcommand 等 LaTeX 命令冲突！
	escaped := strings.ReplaceAll(content, "\n", "<br>")
	
	// 日志打点：记录发送的内容（前50个字符）
	sseLogCounter++
	logContent := escaped
	if len(logContent) > 50 {
		logContent = logContent[:50] + "..."
	}
	// 只记录每10次或包含换行的内容
	if sseLogCounter%10 == 0 || strings.Contains(content, "\n") {
		log.Printf("[SSE #%d] 📤 Sending: %q (original has %d newlines)\n", 
			sseLogCounter, logContent, strings.Count(content, "\n"))
	}
	
	// 写入 SSE 格式
	sseData := fmt.Sprintf("data: %s\n\n", escaped)
	writer.Write([]byte(sseData))
	
	// 立即刷新
	if flusher, ok := writer.(http.Flusher); ok {
		flusher.Flush()
	}
}

// writeSSEStatus 写入状态消息（带转义换行）
func writeSSEStatus(writer io.Writer, message string) {
	// 转义换行符：\n -> <br>
	escaped := strings.ReplaceAll(message, "\n", "<br>")
	sseData := fmt.Sprintf("data: %s\n\n", escaped)
	writer.Write([]byte(sseData))
	if flusher, ok := writer.(http.Flusher); ok {
		flusher.Flush()
	}
	// 日志打点
	logMsg := message
	if len(logMsg) > 50 {
		logMsg = logMsg[:50]
	}
	log.Printf("[SSE] 📢 Status: %s\n", logMsg)
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
func (s *Service) AutoFixLatex(content string, writer io.Writer, modelLevel string) error {
	// 先验证代码
	validator := NewLatexValidator()
	result := validator.Validate(content)

	// 如果没有问题，直接返回
	if result.Valid && len(result.Warnings) == 0 {
		writeSSEData(writer, "<reply>\n✅ LaTeX 代码验证通过，无需修复。\n</reply>\n")
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

	// 使用 LaTeX Agent 配置的默认模型
	return s.streamWithModel(messages, writer, 0)
}

// ValidateLatex 验证 LaTeX 代码
func (s *Service) ValidateLatex(content string) *ValidationResult {
	validator := NewLatexValidator()
	return validator.Validate(content)
}

// AutoFixCompileError 根据编译器错误日志自动修复 LaTeX 代码
// 这是最准确的修复方式，因为它使用真正的 TeX 编译器输出
func (s *Service) AutoFixCompileError(content string, compileLog string, engine string, writer io.Writer) error {
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
	return s.streamWithModel(messages, writer, 0)
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

	// 获取 LaTeX Agent 配置的默认模型名称
	modelConfig, _ := s.modelRepo.GetDefaultModel()
	modelName := "default"
	if modelConfig != nil {
		modelName = modelConfig.DisplayName
	}

	s.convService.UpdateModelLevel(conv.ID, modelName)

	// 使用 LaTeX Agent 配置的默认模型
	err = s.streamWithModel(messages, responseCollector, 0)
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
		log.Printf("[LaTeXWriter] Failed to save assistant message: %v\n", err)
	}

	return nil
}

// ============================================
// 增强的 Agent 架构 - 使用 Orchestrator
// ============================================

// StreamChatWithOrchestrator 使用 Orchestrator 进行流式对话
// 这是新的增强版本，支持多 Agent、Function Calling、自动压缩等功能
func (s *Service) StreamChatWithOrchestrator(userID, documentID uint, req *ChatRequest, writer io.Writer) error {
	log.Println("\n" + strings.Repeat("=", 80))
	log.Println("[LaTeXWriter] 🚀 StreamChatWithOrchestrator started (Enhanced Agent Mode)")
	log.Printf("[LaTeXWriter] 📝 User: %d, Doc: %d, ModelID: %d\n", userID, documentID, req.ModelID)
	log.Println(strings.Repeat("=", 80))

	// 1. 获取或创建 Orchestrator
	orchestrator, err := s.GetOrCreateOrchestrator(req.ModelID)
	if err != nil {
		log.Printf("[LaTeXWriter] Failed to create orchestrator, falling back to basic mode: %v\n", err)
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
		log.Printf("[LaTeXWriter] Warning: Failed to get conversation history: %v\n", err)
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
		log.Printf("[LaTeXWriter] Failed to save assistant message: %v\n", err)
	}

	log.Println("\n" + strings.Repeat("=", 80))
	log.Printf("[LaTeXWriter] ✅ StreamChatWithOrchestrator completed in %dms\n", result.TotalDuration)
	log.Printf("[LaTeXWriter] 📊 Summary: Iterations=%d, Code=%d chars\n", result.Iterations, len(result.Code))
	log.Println(strings.Repeat("=", 80) + "\n")

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
