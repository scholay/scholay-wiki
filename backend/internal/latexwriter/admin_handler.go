// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// LaTeX Agent 管理员配置处理器
// 提供后台管理接口

package latexwriter

import (
	"fmt"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AdminHandler 管理员配置处理器
type AdminHandler struct {
	configRepo *AgentConfigRepository
	modelRepo  *AgentModelRepository
}

// NewAdminHandler 创建管理员处理器
func NewAdminHandler(configRepo *AgentConfigRepository, db *gorm.DB) *AdminHandler {
	return &AdminHandler{
		configRepo: configRepo,
		modelRepo:  NewAgentModelRepository(db),
	}
}

// GetAgentConfig 获取 Agent 配置
// GET /api/v1/admin/latex-agent/config
func (h *AdminHandler) GetAgentConfig(c *gin.Context) {
	config, err := h.configRepo.GetConfig()
	if err != nil {
		utils.Error(c, 5001, "获取配置失败: "+err.Error())
		return
	}

	utils.Success(c, config.ToResponse())
}

// UpdateAgentConfigRequest 更新配置请求
type UpdateAgentConfigRequest struct {
	// 默认模型
	DefaultModelID *uint `json:"default_model_id,omitempty"`

	// 上下文配置
	ContextWindowMessages *uint   `json:"context_window_messages,omitempty"`
	TruncationStrategy    *string `json:"truncation_strategy,omitempty"`

	// 生成参数
	TopP             *float64 `json:"top_p,omitempty"`
	FrequencyPenalty *float64 `json:"frequency_penalty,omitempty"`
	PresencePenalty  *float64 `json:"presence_penalty,omitempty"`

	// Agent 行为配置
	MaxIterations         *uint    `json:"max_iterations,omitempty"`
	AutoValidateLatex     *bool    `json:"auto_validate_latex,omitempty"`
	AutoFixErrors         *bool    `json:"auto_fix_errors,omitempty"`
	EnableToolCalling     *bool    `json:"enable_tool_calling,omitempty"`
	EnabledToolCategories []string `json:"enabled_tool_categories,omitempty"`

	// 系统提示词配置
	SystemPromptOverride *string `json:"system_prompt_override,omitempty"`
	SystemPromptAppend   *string `json:"system_prompt_append,omitempty"`

	// 状态
	IsActive *bool `json:"is_active,omitempty"`
}

// UpdateAgentConfig 更新 Agent 配置
// PUT /api/v1/admin/latex-agent/config
func (h *AdminHandler) UpdateAgentConfig(c *gin.Context) {
	var req UpdateAgentConfigRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// 获取当前配置
	config, err := h.configRepo.GetConfig()
	if err != nil {
		utils.Error(c, 5002, "获取配置失败: "+err.Error())
		return
	}

	// 获取管理员 ID
	adminID, exists := c.Get("adminId")
	if exists {
		if id, ok := adminID.(uint); ok {
			config.UpdatedBy = &id
		}
	}

	// 更新默认模型
	if req.DefaultModelID != nil {
		config.DefaultModelID = req.DefaultModelID
	}

	// 更新上下文配置
	if req.ContextWindowMessages != nil {
		config.ContextWindowMessages = *req.ContextWindowMessages
	}
	if req.TruncationStrategy != nil {
		config.TruncationStrategy = *req.TruncationStrategy
	}

	// 更新生成参数
	if req.TopP != nil {
		config.TopP = *req.TopP
	}
	if req.FrequencyPenalty != nil {
		config.FrequencyPenalty = *req.FrequencyPenalty
	}
	if req.PresencePenalty != nil {
		config.PresencePenalty = *req.PresencePenalty
	}

	// 更新 Agent 行为配置
	if req.MaxIterations != nil {
		config.MaxIterations = *req.MaxIterations
	}
	if req.AutoValidateLatex != nil {
		config.AutoValidateLatex = *req.AutoValidateLatex
	}
	if req.AutoFixErrors != nil {
		config.AutoFixErrors = *req.AutoFixErrors
	}
	if req.EnableToolCalling != nil {
		config.EnableToolCalling = *req.EnableToolCalling
	}
	if req.EnabledToolCategories != nil {
		config.SetEnabledToolCategories(req.EnabledToolCategories)
	}

	// 更新系统提示词配置
	if req.SystemPromptOverride != nil {
		config.SystemPromptOverride = req.SystemPromptOverride
	}
	if req.SystemPromptAppend != nil {
		config.SystemPromptAppend = req.SystemPromptAppend
	}

	// 更新状态
	if req.IsActive != nil {
		config.IsActive = *req.IsActive
	}

	// 保存配置
	if err := h.configRepo.UpdateConfig(config); err != nil {
		utils.Error(c, 5003, "更新配置失败: "+err.Error())
		return
	}

	utils.Success(c, config.ToResponse())
}

// GetModelPresets 获取模型预设列表
// GET /api/v1/admin/latex-agent/model-presets
func (h *AdminHandler) GetModelPresets(c *gin.Context) {
	utils.Success(c, map[string]any{
		"presets": GetModelPresets(),
	})
}

// GetConfigOptions 获取配置选项（截断策略、工具分类等）
// GET /api/v1/admin/latex-agent/config-options
func (h *AdminHandler) GetConfigOptions(c *gin.Context) {
	utils.Success(c, map[string]any{
		"truncation_strategies": GetTruncationStrategies(),
		"tool_categories":       GetToolCategories(),
	})
}

// ApplyModelPreset 应用模型预设（快速填充表单）
// POST /api/v1/admin/latex-agent/apply-preset
func (h *AdminHandler) ApplyModelPreset(c *gin.Context) {
	var req struct {
		Provider string `json:"provider" binding:"required"`
		Name     string `json:"name" binding:"required"`
	}
	if !utils.BindJSON(c, &req) {
		return
	}

	// 查找预设
	var preset *ModelPreset
	for _, p := range GetModelPresets() {
		if p.Provider == req.Provider && p.Name == req.Name {
			preset = &p
			break
		}
	}

	if preset == nil {
		utils.Error(c, 5002, "找不到指定的模型预设")
		return
	}

	// 返回预设信息供前端填充表单（不直接创建，需要用户填写密钥）
	utils.Success(c, map[string]any{
		"display_name":       preset.DisplayName,
		"api_format":         preset.Provider,
		"model_name":         preset.Name,
		"max_context_tokens": preset.MaxContextTokens,
		"max_output_tokens":  preset.MaxOutputTokens,
		"description":        preset.Description,
		"default_endpoint":   getDefaultEndpoint(preset.Provider),
	})
}

// getDefaultEndpoint 获取默认端点
func getDefaultEndpoint(provider string) string {
	switch provider {
	case "openai":
		return "https://api.openai.com/v1"
	case "anthropic":
		return "https://api.anthropic.com"
	case "google":
		return "https://generativelanguage.googleapis.com"
	case "deepseek":
		return "https://api.deepseek.com/v1"
	case "azure":
		return "https://YOUR_RESOURCE.openai.azure.com"
	default:
		return "https://api.openai.com/v1"
	}
}

// TestConnection 测试模型连接
// POST /api/v1/admin/latex-agent/test-connection
func (h *AdminHandler) TestConnection(c *gin.Context) {
	// 获取默认模型
	model, err := h.modelRepo.GetDefaultModel()
	if err != nil {
		utils.Error(c, 5001, "获取默认模型失败: "+err.Error())
		return
	}

	// TODO: 实现实际的连接测试
	// 目前返回模型信息
	utils.Success(c, map[string]any{
		"success":      true,
		"api_format":   model.APIFormat,
		"model_name":   model.ModelName,
		"api_endpoint": model.APIEndpoint,
		"message":      "配置已保存，连接测试功能待实现",
	})
}


// ============================================================================
// 模型管理 API
// ============================================================================

// ListModels 获取所有模型列表
// GET /api/v1/admin/latex-agent/models
func (h *AdminHandler) ListModels(c *gin.Context) {
	models, err := h.modelRepo.GetAllModels()
	if err != nil {
		utils.Error(c, 5001, "获取模型列表失败: "+err.Error())
		return
	}

	// 转换为响应格式（隐藏密钥）
	var responses []*AgentModelResponse
	for _, m := range models {
		responses = append(responses, m.ToResponse())
	}

	utils.Success(c, map[string]any{
		"models": responses,
		"total":  len(responses),
	})
}

// CreateModelRequest 创建模型请求
type CreateModelRequest struct {
	DisplayName      string  `json:"display_name" binding:"required"`
	APIFormat        string  `json:"api_format" binding:"required"`
	ModelName        string  `json:"model_name" binding:"required"`
	APIEndpoint      string  `json:"api_endpoint" binding:"required"`
	APIKey           string  `json:"api_key" binding:"required"`
	MaxContextTokens uint    `json:"max_context_tokens"`
	MaxOutputTokens  uint    `json:"max_output_tokens"`
	Temperature      float64 `json:"temperature"`
	Description      *string `json:"description"`
	SortOrder        int     `json:"sort_order"`
	IsDefault        bool    `json:"is_default"`
	IsEnabled        bool    `json:"is_enabled"`
}

// CreateModel 创建模型
// POST /api/v1/admin/latex-agent/models
func (h *AdminHandler) CreateModel(c *gin.Context) {
	var req CreateModelRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	model := &AgentModel{
		DisplayName:      req.DisplayName,
		APIFormat:        req.APIFormat,
		ModelName:        req.ModelName,
		APIEndpoint:      req.APIEndpoint,
		APIKey:           req.APIKey,
		MaxContextTokens: req.MaxContextTokens,
		MaxOutputTokens:  req.MaxOutputTokens,
		Temperature:      req.Temperature,
		Description:      req.Description,
		SortOrder:        req.SortOrder,
		IsDefault:        req.IsDefault,
		IsEnabled:        req.IsEnabled,
	}

	// 默认值
	if model.APIFormat == "" {
		model.APIFormat = "openai"
	}
	if model.MaxContextTokens == 0 {
		model.MaxContextTokens = 128000
	}
	if model.MaxOutputTokens == 0 {
		model.MaxOutputTokens = 16384
	}
	if model.Temperature == 0 {
		model.Temperature = 0.7
	}

	if err := h.modelRepo.CreateModel(model); err != nil {
		utils.Error(c, 5002, "创建模型失败: "+err.Error())
		return
	}

	// 如果设置为默认，更新其他模型
	if req.IsDefault {
		h.modelRepo.SetDefaultModel(model.ID)
	}

	utils.Success(c, model.ToResponse())
}

// UpdateModelRequest 更新模型请求
type UpdateModelRequest struct {
	DisplayName      *string  `json:"display_name"`
	APIFormat        *string  `json:"api_format"`
	ModelName        *string  `json:"model_name"`
	APIEndpoint      *string  `json:"api_endpoint"`
	APIKey           *string  `json:"api_key"` // 可选，不传则不更新
	MaxContextTokens *uint    `json:"max_context_tokens"`
	MaxOutputTokens  *uint    `json:"max_output_tokens"`
	Temperature      *float64 `json:"temperature"`
	Description      *string  `json:"description"`
	SortOrder        *int     `json:"sort_order"`
	IsDefault        *bool    `json:"is_default"`
	IsEnabled        *bool    `json:"is_enabled"`
}

// UpdateModel 更新模型
// PUT /api/v1/admin/latex-agent/models/:id
func (h *AdminHandler) UpdateModel(c *gin.Context) {
	idStr := c.Param("id")
	var id uint
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		utils.Error(c, 5001, "无效的模型 ID")
		return
	}

	model, err := h.modelRepo.GetModelByID(id)
	if err != nil {
		utils.Error(c, 5002, "模型不存在")
		return
	}

	var req UpdateModelRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// 更新字段
	if req.DisplayName != nil {
		model.DisplayName = *req.DisplayName
	}
	if req.APIFormat != nil {
		model.APIFormat = *req.APIFormat
	}
	if req.ModelName != nil {
		model.ModelName = *req.ModelName
	}
	if req.APIEndpoint != nil {
		model.APIEndpoint = *req.APIEndpoint
	}
	if req.APIKey != nil && *req.APIKey != "" {
		model.APIKey = *req.APIKey
	}
	if req.MaxContextTokens != nil {
		model.MaxContextTokens = *req.MaxContextTokens
	}
	if req.MaxOutputTokens != nil {
		model.MaxOutputTokens = *req.MaxOutputTokens
	}
	if req.Temperature != nil {
		model.Temperature = *req.Temperature
	}
	if req.Description != nil {
		model.Description = req.Description
	}
	if req.SortOrder != nil {
		model.SortOrder = *req.SortOrder
	}
	if req.IsEnabled != nil {
		model.IsEnabled = *req.IsEnabled
	}

	if err := h.modelRepo.UpdateModel(model); err != nil {
		utils.Error(c, 5004, "更新模型失败: "+err.Error())
		return
	}

	// 处理默认模型设置
	if req.IsDefault != nil && *req.IsDefault {
		h.modelRepo.SetDefaultModel(model.ID)
	}

	utils.Success(c, model.ToResponse())
}

// GetAPIFormats 获取支持的 API 格式列表
// GET /api/v1/admin/latex-agent/api-formats
func (h *AdminHandler) GetAPIFormats(c *gin.Context) {
	formats := []map[string]any{
		{
			"value":           "openai",
			"label":           "OpenAI 格式",
			"description":     "兼容 OpenAI API 的接口（包括大多数国产模型）",
			"default_endpoint": "https://api.openai.com/v1",
		},
		{
			"value":           "anthropic",
			"label":           "Anthropic 格式",
			"description":     "Claude 系列模型专用接口",
			"default_endpoint": "https://api.anthropic.com",
		},
		{
			"value":           "google",
			"label":           "Google AI 格式",
			"description":     "Gemini 系列模型专用接口",
			"default_endpoint": "https://generativelanguage.googleapis.com",
		},
		{
			"value":           "azure",
			"label":           "Azure OpenAI 格式",
			"description":     "Azure 托管的 OpenAI 模型",
			"default_endpoint": "https://YOUR_RESOURCE.openai.azure.com",
		},
	}
	utils.Success(c, map[string]any{
		"formats": formats,
	})
}

// DeleteModel 删除模型
// DELETE /api/v1/admin/latex-agent/models/:id
func (h *AdminHandler) DeleteModel(c *gin.Context) {
	idStr := c.Param("id")
	var id uint
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		utils.Error(c, 5001, "无效的模型 ID")
		return
	}

	if err := h.modelRepo.DeleteModel(id); err != nil {
		utils.Error(c, 5002, "删除模型失败: "+err.Error())
		return
	}

	utils.Success(c, map[string]any{
		"message": "模型已删除",
	})
}

// SetDefaultModel 设置默认模型
// POST /api/v1/admin/latex-agent/models/:id/set-default
func (h *AdminHandler) SetDefaultModel(c *gin.Context) {
	idStr := c.Param("id")
	var id uint
	if _, err := fmt.Sscanf(idStr, "%d", &id); err != nil {
		utils.Error(c, 5001, "无效的模型 ID")
		return
	}

	if err := h.modelRepo.SetDefaultModel(id); err != nil {
		utils.Error(c, 5002, "设置默认模型失败: "+err.Error())
		return
	}

	// 同时更新全局配置中的默认模型 ID
	config, _ := h.configRepo.GetConfig()
	if config != nil {
		config.DefaultModelID = &id
		h.configRepo.UpdateConfig(config)
	}

	utils.Success(c, map[string]any{
		"message": "默认模型已设置",
	})
}
