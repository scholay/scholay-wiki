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

	"scholar-backend/internal/ai"
	"scholar-backend/internal/mcp"
)

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
