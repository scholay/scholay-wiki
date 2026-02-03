// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package mcp

import (
	"context"
	"fmt"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/semanticscholar"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// UnifiedHandler 统一 MCP 处理器
// 整合所有 MCP 工具提供者
type UnifiedHandler struct {
	registry       *Registry
	legacyServer   *MCPServer // 保留原有 Semantic Scholar MCP
	db             *gorm.DB
}

// HandlerConfig 处理器配置
type HandlerConfig struct {
	DB             *gorm.DB
	ScholarManager *semanticscholar.Manager
	SerperAPIKey   string // 可选：Serper API Key
	CrossrefEmail  string // 可选：Crossref Polite Pool Email
}

// NewUnifiedHandler 创建统一处理器
func NewUnifiedHandler(config HandlerConfig) *UnifiedHandler {
	registry := NewRegistry()

	// 注册 LaTeX 工具
	latexProvider := NewLaTeXToolProvider()
	if err := registry.RegisterProvider(latexProvider); err != nil {
		fmt.Printf("[MCP] Failed to register LaTeX tools: %v\n", err)
	}

	// 注册搜索工具
	searchProvider := NewSearchToolProvider(config.SerperAPIKey, config.CrossrefEmail)
	if err := registry.RegisterProvider(searchProvider); err != nil {
		fmt.Printf("[MCP] Failed to register Search tools: %v\n", err)
	}

	// 注册 BibTeX 工具
	bibtexProvider := NewBibTeXToolProvider()
	if err := registry.RegisterProvider(bibtexProvider); err != nil {
		fmt.Printf("[MCP] Failed to register BibTeX tools: %v\n", err)
	}

	// 注册文件工具（需要数据库）
	if config.DB != nil {
		fileProvider := NewFileToolProvider(config.DB)
		if err := registry.RegisterProvider(fileProvider); err != nil {
			fmt.Printf("[MCP] Failed to register File tools: %v\n", err)
		}
	}

	// 注册格式转换工具
	convertProvider := NewConvertToolProvider()
	if err := registry.RegisterProvider(convertProvider); err != nil {
		fmt.Printf("[MCP] Failed to register Convert tools: %v\n", err)
	}

	// 注册数学工具
	mathProvider := NewMathToolProvider()
	if err := registry.RegisterProvider(mathProvider); err != nil {
		fmt.Printf("[MCP] Failed to register Math tools: %v\n", err)
	}

	// 注册模板工具
	templateProvider := NewTemplateToolProvider()
	if err := registry.RegisterProvider(templateProvider); err != nil {
		fmt.Printf("[MCP] Failed to register Template tools: %v\n", err)
	}

	// 注册图片工具
	imageProvider := NewImageToolProvider()
	if err := registry.RegisterProvider(imageProvider); err != nil {
		fmt.Printf("[MCP] Failed to register Image tools: %v\n", err)
	}

	// 注册代码工具
	codeProvider := NewCodeToolProvider()
	if err := registry.RegisterProvider(codeProvider); err != nil {
		fmt.Printf("[MCP] Failed to register Code tools: %v\n", err)
	}

	// 创建处理器
	handler := &UnifiedHandler{
		registry: registry,
		db:       config.DB,
	}

	// 保留原有 Semantic Scholar MCP
	if config.ScholarManager != nil {
		handler.legacyServer = NewMCPServer(config.ScholarManager)
	}

	fmt.Printf("[MCP] Unified handler initialized with %d tools\n", len(registry.ListTools()))

	return handler
}

// ListAllTools 列出所有工具（包括新工具和 Semantic Scholar 工具）
// GET /api/v1/mcp/tools
func (h *UnifiedHandler) ListAllTools(c *gin.Context) {
	// 获取新注册的工具
	newTools := h.registry.ListTools()

	// 获取 Semantic Scholar 工具
	var scholarTools []Tool
	if h.legacyServer != nil {
		scholarTools = h.legacyServer.ListTools()
	}

	// 合并工具列表
	allTools := make([]map[string]interface{}, 0, len(newTools)+len(scholarTools))

	// 添加新工具
	for _, tool := range newTools {
		allTools = append(allTools, map[string]interface{}{
			"name":            tool.Name,
			"description":     tool.Description,
			"category":        tool.Category,
			"inputSchema":     tool.InputSchema,
			"readOnlyHint":    tool.ReadOnlyHint,
			"destructiveHint": tool.DestructiveHint,
			"idempotentHint":  tool.IdempotentHint,
			"openWorldHint":   tool.OpenWorldHint,
		})
	}

	// 添加 Semantic Scholar 工具（标记分类）
	for _, tool := range scholarTools {
		allTools = append(allTools, map[string]interface{}{
			"name":          tool.Name,
			"description":   tool.Description,
			"category":      "search", // Semantic Scholar 属于搜索类
			"inputSchema":   tool.InputSchema,
			"openWorldHint": true,
			"readOnlyHint":  true,
		})
	}

	utils.Success(c, map[string]interface{}{
		"total":      len(allTools),
		"tools":      allTools,
		"categories": h.registry.GetCategories(),
	})
}

// ListToolsByCategory 按分类列出工具
// GET /api/v1/mcp/tools/category/:category
func (h *UnifiedHandler) ListToolsByCategory(c *gin.Context) {
	category := ToolCategory(c.Param("category"))

	tools := h.registry.ListToolsByCategory(category)

	// 如果是 search 分类，也包含 Semantic Scholar 工具
	if category == CategorySearch && h.legacyServer != nil {
		scholarTools := h.legacyServer.ListTools()
		for _, tool := range scholarTools {
			tools = append(tools, ToolDefinition{
				Name:          tool.Name,
				Description:   tool.Description,
				Category:      CategorySearch,
				InputSchema:   tool.InputSchema,
				ReadOnlyHint:  true,
				OpenWorldHint: true,
			})
		}
	}

	utils.Success(c, map[string]interface{}{
		"category": category,
		"count":    len(tools),
		"tools":    tools,
	})
}

// GetTool 获取工具详情
// GET /api/v1/mcp/tools/:name
func (h *UnifiedHandler) GetTool(c *gin.Context) {
	name := c.Param("name")

	// 先在新注册表中查找
	if tool, found := h.registry.GetTool(name); found {
		utils.Success(c, tool)
		return
	}

	// 在 Semantic Scholar 工具中查找
	if h.legacyServer != nil {
		for _, tool := range h.legacyServer.ListTools() {
			if tool.Name == name {
				utils.Success(c, tool)
				return
			}
		}
	}

	utils.Error(c, 5004, "Tool not found: "+name)
}

// CallToolRequest 工具调用请求
type CallToolRequest struct {
	Name      string                 `json:"name" binding:"required"`
	Arguments map[string]interface{} `json:"arguments"`
}

// CallTool 调用工具
// POST /api/v1/mcp/call
func (h *UnifiedHandler) CallTool(c *gin.Context) {
	var req CallToolRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 5001, "Invalid request body: "+err.Error())
		return
	}

	ctx := c.Request.Context()

	// 先尝试在新注册表中调用
	if _, found := h.registry.GetTool(req.Name); found {
		result, err := h.registry.CallTool(ctx, req.Name, req.Arguments)
		if err != nil {
			utils.Error(c, 5002, "Tool call failed: "+err.Error())
			return
		}
		utils.Success(c, result)
		return
	}

	// 尝试调用 Semantic Scholar 工具
	if h.legacyServer != nil {
		legacyReq := ToolRequest{
			Name:      req.Name,
			Arguments: req.Arguments,
		}
		result, err := h.legacyServer.CallTool(legacyReq)
		if err != nil {
			utils.Error(c, 5002, "Tool call failed: "+err.Error())
			return
		}
		utils.Success(c, result)
		return
	}

	utils.Error(c, 5003, "Tool not found: "+req.Name)
}

// GetToolsForLLM 获取 LLM 可用的工具定义
// GET /api/v1/mcp/tools/llm
func (h *UnifiedHandler) GetToolsForLLM(c *gin.Context) {
	// 获取新工具的 LLM 格式
	tools := h.registry.GetToolsForLLM()

	// 添加 Semantic Scholar 工具
	if h.legacyServer != nil {
		for _, tool := range h.legacyServer.ListTools() {
			tools = append(tools, map[string]interface{}{
				"type": "function",
				"function": map[string]interface{}{
					"name":        tool.Name,
					"description": tool.Description,
					"parameters":  tool.InputSchema,
				},
			})
		}
	}

	utils.Success(c, map[string]interface{}{
		"tools": tools,
	})
}

// BatchCallTools 批量调用工具
// POST /api/v1/mcp/batch
func (h *UnifiedHandler) BatchCallTools(c *gin.Context) {
	var requests []CallToolRequest
	if err := c.ShouldBindJSON(&requests); err != nil {
		utils.Error(c, 5001, "Invalid request body: "+err.Error())
		return
	}

	ctx := c.Request.Context()
	results := make([]map[string]interface{}, 0, len(requests))

	for _, req := range requests {
		result := map[string]interface{}{
			"tool": req.Name,
		}

		// 先尝试新注册表
		if _, found := h.registry.GetTool(req.Name); found {
			toolResult, err := h.registry.CallTool(ctx, req.Name, req.Arguments)
			if err != nil {
				result["success"] = false
				result["error"] = err.Error()
			} else {
				result["success"] = true
				result["result"] = toolResult
			}
		} else if h.legacyServer != nil {
			// 尝试 Semantic Scholar
			legacyReq := ToolRequest{Name: req.Name, Arguments: req.Arguments}
			toolResult, err := h.legacyServer.CallTool(legacyReq)
			if err != nil {
				result["success"] = false
				result["error"] = err.Error()
			} else {
				result["success"] = true
				result["result"] = toolResult
			}
		} else {
			result["success"] = false
			result["error"] = "Tool not found"
		}

		results = append(results, result)
	}

	utils.Success(c, map[string]interface{}{
		"results": results,
	})
}

// ============================================================================
// 保留原有 Handler 以保持向后兼容
// ============================================================================

// Handler handles MCP HTTP requests (legacy, for backward compatibility)
type Handler struct {
	server *MCPServer
}

// NewHandler creates a new MCP handler (legacy)
func NewHandler(manager *semanticscholar.Manager) *Handler {
	return &Handler{
		server: NewMCPServer(manager),
	}
}

// ListTools handles GET /api/v1/mcp/tools (legacy)
func (h *Handler) ListTools(c *gin.Context) {
	tools := h.server.ListTools()
	utils.Success(c, map[string]interface{}{
		"tools": tools,
	})
}

// CallTool handles POST /api/v1/mcp/call (legacy)
func (h *Handler) CallTool(c *gin.Context) {
	var req ToolRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.Error(c, 5001, "Invalid request body: "+err.Error())
		return
	}

	result, err := h.server.CallTool(req)
	if err != nil {
		utils.Error(c, 5002, "Tool call failed: "+err.Error())
		return
	}

	utils.Success(c, result)
}

// ============================================================================
// Semantic Scholar 适配器（将其作为 ToolProvider）
// ============================================================================

// SemanticScholarProvider Semantic Scholar 工具提供者适配器
type SemanticScholarProvider struct {
	server *MCPServer
}

// NewSemanticScholarProvider 创建 Semantic Scholar 提供者
func NewSemanticScholarProvider(manager *semanticscholar.Manager) *SemanticScholarProvider {
	return &SemanticScholarProvider{
		server: NewMCPServer(manager),
	}
}

// GetCategory 返回工具分类
func (p *SemanticScholarProvider) GetCategory() ToolCategory {
	return CategorySearch
}

// GetTools 返回工具定义列表
func (p *SemanticScholarProvider) GetTools() []ToolDefinition {
	tools := p.server.ListTools()
	definitions := make([]ToolDefinition, 0, len(tools))
	
	for _, tool := range tools {
		definitions = append(definitions, ToolDefinition{
			Name:          tool.Name,
			Description:   tool.Description,
			Category:      CategorySearch,
			InputSchema:   tool.InputSchema,
			ReadOnlyHint:  true,
			OpenWorldHint: true,
		})
	}
	
	return definitions
}

// ExecuteTool 执行工具
func (p *SemanticScholarProvider) ExecuteTool(ctx context.Context, name string, args map[string]interface{}) (*ToolResult, error) {
	req := ToolRequest{
		Name:      name,
		Arguments: args,
	}
	
	resp, err := p.server.CallTool(req)
	if err != nil {
		return CreateErrorResult(err), nil
	}
	
	return &ToolResult{
		Success: true,
		Content: resp.Content,
	}, nil
}
