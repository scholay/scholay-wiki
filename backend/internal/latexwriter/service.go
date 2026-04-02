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
	"io"
	"log/slog"
	"strings"

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

// replaceVariable 替换模板中的变量
func replaceVariable(template, key, value string) string {
	placeholder := "{" + key + "}"
	return strings.Replace(template, placeholder, value, -1)
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
