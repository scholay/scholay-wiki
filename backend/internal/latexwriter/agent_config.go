// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// LaTeX Agent 配置管理
// 提供后台配置的模型、上下文、工具等参数

package latexwriter

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// AgentConfig LaTeX Agent 全局配置模型
type AgentConfig struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	UpdatedBy *uint     `json:"updated_by,omitempty"`

	// 默认模型
	DefaultModelID *uint `gorm:"column:default_model_id" json:"default_model_id,omitempty"`

	// 上下文配置
	ContextWindowMessages uint   `gorm:"column:context_window_messages;default:50" json:"context_window_messages"`
	TruncationStrategy    string `gorm:"column:truncation_strategy;default:sliding_window" json:"truncation_strategy"`

	// 生成参数（全局默认）
	TopP             float64 `gorm:"column:top_p;default:0.9" json:"top_p"`
	FrequencyPenalty float64 `gorm:"column:frequency_penalty;default:0.0" json:"frequency_penalty"`
	PresencePenalty  float64 `gorm:"column:presence_penalty;default:0.0" json:"presence_penalty"`

	// Agent 行为配置
	MaxIterations         uint    `gorm:"column:max_iterations;default:10" json:"max_iterations"`
	AutoValidateLatex     bool    `gorm:"column:auto_validate_latex;default:true" json:"auto_validate_latex"`
	AutoFixErrors         bool    `gorm:"column:auto_fix_errors;default:true" json:"auto_fix_errors"`
	EnableToolCalling     bool    `gorm:"column:enable_tool_calling;default:true" json:"enable_tool_calling"`
	EnabledToolCategories *string `gorm:"column:enabled_tool_categories;type:json" json:"-"`

	// 多 Agent 配置（新增）
	EnableMultiAgent       bool    `gorm:"column:enable_multi_agent;default:false" json:"enable_multi_agent"`
	AutoCompactEnabled     bool    `gorm:"column:auto_compact_enabled;default:true" json:"auto_compact_enabled"`
	AutoCompactThreshold   float64 `gorm:"column:auto_compact_threshold;default:0.85" json:"auto_compact_threshold"`
	PlannerModelID         *uint   `gorm:"column:planner_model_id" json:"planner_model_id,omitempty"`
	ValidatorModelID       *uint   `gorm:"column:validator_model_id" json:"validator_model_id,omitempty"`
	DefaultToolPermissions *string `gorm:"column:default_tool_permissions;type:json" json:"-"`

	// 系统提示词配置
	SystemPromptOverride *string `gorm:"column:system_prompt_override;type:text" json:"system_prompt_override,omitempty"`
	SystemPromptAppend   *string `gorm:"column:system_prompt_append;type:text" json:"system_prompt_append,omitempty"`

	// 状态
	IsActive bool `gorm:"column:is_active;default:true" json:"is_active"`
}

// GetDefaultToolPermissions 获取默认工具权限
func (c *AgentConfig) GetDefaultToolPermissions() map[string]string {
	if c.DefaultToolPermissions == nil || *c.DefaultToolPermissions == "" {
		return make(map[string]string)
	}
	var permissions map[string]string
	if err := json.Unmarshal([]byte(*c.DefaultToolPermissions), &permissions); err != nil {
		return make(map[string]string)
	}
	return permissions
}

// SetDefaultToolPermissions 设置默认工具权限
func (c *AgentConfig) SetDefaultToolPermissions(permissions map[string]string) error {
	data, err := json.Marshal(permissions)
	if err != nil {
		return err
	}
	s := string(data)
	c.DefaultToolPermissions = &s
	return nil
}

// TableName 指定表名
func (AgentConfig) TableName() string {
	return "latex_agent_config"
}

// GetEnabledToolCategories 获取启用的工具分类
func (c *AgentConfig) GetEnabledToolCategories() []string {
	if c.EnabledToolCategories == nil || *c.EnabledToolCategories == "" {
		return []string{"latex", "search", "bibtex", "file", "convert"}
	}
	var categories []string
	if err := json.Unmarshal([]byte(*c.EnabledToolCategories), &categories); err != nil {
		return []string{"latex", "search", "bibtex", "file", "convert"}
	}
	return categories
}

// SetEnabledToolCategories 设置启用的工具分类
func (c *AgentConfig) SetEnabledToolCategories(categories []string) error {
	data, err := json.Marshal(categories)
	if err != nil {
		return err
	}
	s := string(data)
	c.EnabledToolCategories = &s
	return nil
}

// AgentConfigResponse API 响应格式
type AgentConfigResponse struct {
	AgentConfig
	EnabledToolCategoriesList []string `json:"enabled_tool_categories"`
}

// ToResponse 转换为响应格式
func (c *AgentConfig) ToResponse() *AgentConfigResponse {
	return &AgentConfigResponse{
		AgentConfig:               *c,
		EnabledToolCategoriesList: c.GetEnabledToolCategories(),
	}
}

// AgentConfigRepository 配置仓库
type AgentConfigRepository struct {
	db *gorm.DB
}

// NewAgentConfigRepository 创建配置仓库
func NewAgentConfigRepository(db *gorm.DB) *AgentConfigRepository {
	return &AgentConfigRepository{db: db}
}

// GetConfig 获取配置（单例，始终返回 ID=1 的记录）
func (r *AgentConfigRepository) GetConfig() (*AgentConfig, error) {
	var config AgentConfig
	err := r.db.First(&config, 1).Error
	if err == gorm.ErrRecordNotFound {
		// 如果不存在，创建默认配置
		defaultModelID := uint(1)
		config = AgentConfig{
			ID:                    1,
			DefaultModelID:        &defaultModelID,
			ContextWindowMessages: 50,
			TruncationStrategy:    "sliding_window",
			TopP:                  0.9,
			MaxIterations:         10,
			AutoValidateLatex:     true,
			AutoFixErrors:         true,
			EnableToolCalling:     true,
			IsActive:              true,
		}
		config.SetEnabledToolCategories([]string{"latex", "search", "bibtex", "file", "convert"})
		if err := r.db.Create(&config).Error; err != nil {
			return nil, err
		}
		return &config, nil
	}
	return &config, err
}

// UpdateConfig 更新配置
func (r *AgentConfigRepository) UpdateConfig(config *AgentConfig) error {
	config.ID = 1 // 确保只更新 ID=1 的记录
	return r.db.Save(config).Error
}

// ============================================================================
// 预设模型配置
// ============================================================================

// ModelPreset 模型预设
type ModelPreset struct {
	Provider         string `json:"provider"`
	Name             string `json:"name"`
	DisplayName      string `json:"display_name"`
	MaxContextTokens uint   `json:"max_context_tokens"`
	MaxOutputTokens  uint   `json:"max_output_tokens"`
	Description      string `json:"description"`
}

// GetModelPresets 获取可用的模型预设列表
func GetModelPresets() []ModelPreset {
	return []ModelPreset{
		// OpenAI
		{
			Provider:         "openai",
			Name:             "gpt-4o",
			DisplayName:      "GPT-4o (推荐)",
			MaxContextTokens: 128000,
			MaxOutputTokens:  16384,
			Description:      "最新的 GPT-4 Omni 模型，支持 128K 上下文，性价比高",
		},
		{
			Provider:         "openai",
			Name:             "gpt-4-turbo",
			DisplayName:      "GPT-4 Turbo",
			MaxContextTokens: 128000,
			MaxOutputTokens:  4096,
			Description:      "GPT-4 Turbo 模型，支持 128K 上下文",
		},
		{
			Provider:         "openai",
			Name:             "gpt-4",
			DisplayName:      "GPT-4",
			MaxContextTokens: 8192,
			MaxOutputTokens:  4096,
			Description:      "原版 GPT-4 模型，8K 上下文",
		},
		{
			Provider:         "openai",
			Name:             "gpt-3.5-turbo",
			DisplayName:      "GPT-3.5 Turbo",
			MaxContextTokens: 16385,
			MaxOutputTokens:  4096,
			Description:      "性价比高的 GPT-3.5 模型",
		},
		// Anthropic
		{
			Provider:         "anthropic",
			Name:             "claude-3-5-sonnet-20241022",
			DisplayName:      "Claude 3.5 Sonnet (最新)",
			MaxContextTokens: 200000,
			MaxOutputTokens:  8192,
			Description:      "Anthropic 最新的 Claude 3.5 Sonnet，支持 200K 上下文",
		},
		{
			Provider:         "anthropic",
			Name:             "claude-3-opus-20240229",
			DisplayName:      "Claude 3 Opus",
			MaxContextTokens: 200000,
			MaxOutputTokens:  4096,
			Description:      "Anthropic 最强的 Claude 3 Opus 模型",
		},
		// DeepSeek
		{
			Provider:         "deepseek",
			Name:             "deepseek-chat",
			DisplayName:      "DeepSeek Chat",
			MaxContextTokens: 64000,
			MaxOutputTokens:  8192,
			Description:      "DeepSeek 对话模型，性价比极高",
		},
		{
			Provider:         "deepseek",
			Name:             "deepseek-coder",
			DisplayName:      "DeepSeek Coder",
			MaxContextTokens: 64000,
			MaxOutputTokens:  8192,
			Description:      "DeepSeek 代码专用模型",
		},
		// Google
		{
			Provider:         "google",
			Name:             "gemini-1.5-pro",
			DisplayName:      "Gemini 1.5 Pro",
			MaxContextTokens: 1000000,
			MaxOutputTokens:  8192,
			Description:      "Google Gemini 1.5 Pro，支持 1M 上下文",
		},
	}
}

// GetTruncationStrategies 获取可用的截断策略
func GetTruncationStrategies() []map[string]string {
	return []map[string]string{
		{"value": "sliding_window", "label": "滑动窗口", "description": "保留最近的消息，丢弃最早的消息"},
		{"value": "summarize", "label": "摘要压缩", "description": "使用 AI 压缩早期消息为摘要"},
		{"value": "hybrid", "label": "混合策略", "description": "结合滑动窗口和摘要，平衡上下文质量"},
	}
}

// GetToolCategories 获取可用的工具分类
func GetToolCategories() []map[string]string {
	return []map[string]string{
		{"value": "latex", "label": "LaTeX 工具", "description": "语法验证、格式化、结构提取等"},
		{"value": "search", "label": "论文搜索", "description": "arXiv、PubMed、Crossref、Semantic Scholar 等"},
		{"value": "bibtex", "label": "参考文献", "description": "BibTeX 解析、生成、格式化"},
		{"value": "file", "label": "文件操作", "description": "文档读写、列表、搜索"},
		{"value": "convert", "label": "格式转换", "description": "Markdown/HTML 转 LaTeX"},
		{"value": "math", "label": "数学工具", "description": "公式渲染、符号计算"},
		{"value": "image", "label": "图片工具", "description": "图表生成、图片处理"},
		{"value": "code", "label": "代码执行", "description": "Python 代码沙箱执行"},
		{"value": "template", "label": "模板工具", "description": "期刊模板、格式检查"},
	}
}
