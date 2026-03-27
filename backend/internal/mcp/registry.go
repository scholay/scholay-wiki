// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// MCP 工具注册表
// 统一管理所有 MCP 工具，支持工具发现、调用和分类

package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
)

// ToolCategory 工具分类
type ToolCategory string

const (
	CategoryLatex      ToolCategory = "latex"      // LaTeX 相关工具
	CategorySearch     ToolCategory = "search"     // 论文搜索工具
	CategoryBibtex     ToolCategory = "bibtex"     // 参考文献工具
	CategoryFile       ToolCategory = "file"       // 文件操作工具
	CategoryConvert    ToolCategory = "convert"    // 格式转换工具
	CategoryMath       ToolCategory = "math"       // 数学工具
	CategoryImage      ToolCategory = "image"      // 图片工具
	CategoryCode       ToolCategory = "code"       // 代码执行工具
	CategoryTemplate   ToolCategory = "template"   // 模板工具
)

// ToolDefinition 工具定义（扩展自 Tool）
type ToolDefinition struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Category    ToolCategory           `json:"category"`
	InputSchema map[string]any `json:"inputSchema"`
	// 工具行为提示（遵循 MCP 规范）
	ReadOnlyHint     bool `json:"readOnlyHint,omitempty"`     // 是否只读
	DestructiveHint  bool `json:"destructiveHint,omitempty"`  // 是否可能删除/覆盖数据
	IdempotentHint   bool `json:"idempotentHint,omitempty"`   // 是否幂等
	OpenWorldHint    bool `json:"openWorldHint,omitempty"`    // 是否与外部世界交互
}

// ToolExecutor 工具执行器接口
type ToolExecutor interface {
	// Execute 执行工具调用
	Execute(ctx context.Context, args map[string]any) (*ToolResult, error)
}

// ToolResult 工具执行结果
type ToolResult struct {
	Success bool                     `json:"success"`
	Data    any              `json:"data,omitempty"`
	Error   string                   `json:"error,omitempty"`
	Content []map[string]any `json:"content,omitempty"` // MCP 格式内容
}

// ToolProvider 工具提供者接口
type ToolProvider interface {
	// GetTools 获取该提供者的所有工具定义
	GetTools() []ToolDefinition
	// GetCategory 获取工具分类
	GetCategory() ToolCategory
	// ExecuteTool 执行工具
	ExecuteTool(ctx context.Context, name string, args map[string]any) (*ToolResult, error)
}

// Registry 工具注册表
type Registry struct {
	mu        sync.RWMutex
	providers map[ToolCategory]ToolProvider
	tools     map[string]*registeredTool
}

// registeredTool 已注册的工具
type registeredTool struct {
	Definition ToolDefinition
	Provider   ToolProvider
}

// NewRegistry 创建新的注册表
func NewRegistry() *Registry {
	return &Registry{
		providers: make(map[ToolCategory]ToolProvider),
		tools:     make(map[string]*registeredTool),
	}
}

// RegisterProvider 注册工具提供者
func (r *Registry) RegisterProvider(provider ToolProvider) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	category := provider.GetCategory()
	r.providers[category] = provider

	// 注册该提供者的所有工具
	for _, tool := range provider.GetTools() {
		if _, exists := r.tools[tool.Name]; exists {
			return fmt.Errorf("tool %s already registered", tool.Name)
		}
		r.tools[tool.Name] = &registeredTool{
			Definition: tool,
			Provider:   provider,
		}
	}

	return nil
}

// ListTools 列出所有工具
func (r *Registry) ListTools() []ToolDefinition {
	r.mu.RLock()
	defer r.mu.RUnlock()

	tools := make([]ToolDefinition, 0, len(r.tools))
	for _, rt := range r.tools {
		tools = append(tools, rt.Definition)
	}
	return tools
}

// ListToolsByCategory 按分类列出工具
func (r *Registry) ListToolsByCategory(category ToolCategory) []ToolDefinition {
	r.mu.RLock()
	defer r.mu.RUnlock()

	tools := make([]ToolDefinition, 0)
	for _, rt := range r.tools {
		if rt.Definition.Category == category {
			tools = append(tools, rt.Definition)
		}
	}
	return tools
}

// GetTool 获取工具定义
func (r *Registry) GetTool(name string) (*ToolDefinition, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	rt, exists := r.tools[name]
	if !exists {
		return nil, false
	}
	return &rt.Definition, true
}

// CallTool 调用工具
func (r *Registry) CallTool(ctx context.Context, name string, args map[string]any) (*ToolResult, error) {
	r.mu.RLock()
	rt, exists := r.tools[name]
	r.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("tool not found: %s", name)
	}

	return rt.Provider.ExecuteTool(ctx, name, args)
}

// GetToolsForLLM 获取 LLM 可用的工具定义（OpenAI/Anthropic 格式）
func (r *Registry) GetToolsForLLM() []map[string]any {
	r.mu.RLock()
	defer r.mu.RUnlock()

	tools := make([]map[string]any, 0, len(r.tools))
	for _, rt := range r.tools {
		tool := map[string]any{
			"type": "function",
			"function": map[string]any{
				"name":        rt.Definition.Name,
				"description": rt.Definition.Description,
				"parameters":  rt.Definition.InputSchema,
			},
		}
		tools = append(tools, tool)
	}
	return tools
}

// GetCategories 获取所有已注册的分类
func (r *Registry) GetCategories() []ToolCategory {
	r.mu.RLock()
	defer r.mu.RUnlock()

	categories := make([]ToolCategory, 0, len(r.providers))
	for cat := range r.providers {
		categories = append(categories, cat)
	}
	return categories
}

// ToJSON 将工具列表转换为 JSON
func (r *Registry) ToJSON() ([]byte, error) {
	tools := r.ListTools()
	return json.MarshalIndent(tools, "", "  ")
}

// CreateSuccessResult 创建成功结果
func CreateSuccessResult(data any) *ToolResult {
	jsonData, _ := json.Marshal(data)
	return &ToolResult{
		Success: true,
		Data:    data,
		Content: []map[string]any{
			{
				"type": "text",
				"text": string(jsonData),
			},
		},
	}
}

// CreateErrorResult 创建错误结果
func CreateErrorResult(err error) *ToolResult {
	return &ToolResult{
		Success: false,
		Error:   err.Error(),
		Content: []map[string]any{
			{
				"type": "text",
				"text": fmt.Sprintf("Error: %s", err.Error()),
			},
		},
	}
}

// CreateTextResult 创建文本结果
func CreateTextResult(text string) *ToolResult {
	return &ToolResult{
		Success: true,
		Data:    text,
		Content: []map[string]any{
			{
				"type": "text",
				"text": text,
			},
		},
	}
}

// 全局注册表实例
var globalRegistry *Registry
var registryOnce sync.Once

// GetGlobalRegistry 获取全局注册表
func GetGlobalRegistry() *Registry {
	registryOnce.Do(func() {
		globalRegistry = NewRegistry()
	})
	return globalRegistry
}
