// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// LaTeX Agent 模型配置
// 支持多模型管理

package latexwriter

import (
	"time"

	"gorm.io/gorm"
)

// AgentModel LaTeX Agent 可用模型
type AgentModel struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	DisplayName      string    `gorm:"column:display_name;type:varchar(100);not null" json:"display_name"`
	APIFormat        string    `gorm:"column:api_format;type:varchar(50);not null;default:openai" json:"api_format"`
	ModelName        string    `gorm:"column:model_name;type:varchar(100);not null" json:"model_name"`
	APIEndpoint      string    `gorm:"column:api_endpoint;type:varchar(500);not null" json:"api_endpoint"`
	APIKey           string    `gorm:"column:api_key;type:varchar(500);not null" json:"-"` // 不返回给前端
	MaxContextTokens uint      `gorm:"column:max_context_tokens;default:128000" json:"max_context_tokens"`
	MaxOutputTokens  uint      `gorm:"column:max_output_tokens;default:16384" json:"max_output_tokens"`
	Temperature      float64   `gorm:"column:temperature;default:0.7" json:"temperature"`
	Description      *string   `gorm:"column:description;type:varchar(500)" json:"description,omitempty"`
	SortOrder        int       `gorm:"column:sort_order;default:0" json:"sort_order"`
	IsDefault        bool      `gorm:"column:is_default;default:false" json:"is_default"`
	IsEnabled        bool      `gorm:"column:is_enabled;default:true" json:"is_enabled"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// AgentModelResponse 前端响应（隐藏密钥）
type AgentModelResponse struct {
	ID               uint    `json:"id"`
	DisplayName      string  `json:"display_name"`
	APIFormat        string  `json:"api_format"`
	ModelName        string  `json:"model_name"`
	APIEndpoint      string  `json:"api_endpoint"`
	HasAPIKey        bool    `json:"has_api_key"` // 是否配置了密钥
	MaxContextTokens uint    `json:"max_context_tokens"`
	MaxOutputTokens  uint    `json:"max_output_tokens"`
	Temperature      float64 `json:"temperature"`
	Description      *string `json:"description,omitempty"`
	SortOrder        int     `json:"sort_order"`
	IsDefault        bool    `json:"is_default"`
	IsEnabled        bool    `json:"is_enabled"`
}

// ToResponse 转换为响应格式（隐藏密钥）
func (m *AgentModel) ToResponse() *AgentModelResponse {
	return &AgentModelResponse{
		ID:               m.ID,
		DisplayName:      m.DisplayName,
		APIFormat:        m.APIFormat,
		ModelName:        m.ModelName,
		APIEndpoint:      m.APIEndpoint,
		HasAPIKey:        m.APIKey != "",
		MaxContextTokens: m.MaxContextTokens,
		MaxOutputTokens:  m.MaxOutputTokens,
		Temperature:      m.Temperature,
		Description:      m.Description,
		SortOrder:        m.SortOrder,
		IsDefault:        m.IsDefault,
		IsEnabled:        m.IsEnabled,
	}
}

// TableName 指定表名
func (AgentModel) TableName() string {
	return "latex_agent_models"
}

// AgentModelRepository 模型配置仓库
type AgentModelRepository struct {
	db *gorm.DB
}

// NewAgentModelRepository 创建模型配置仓库
func NewAgentModelRepository(db *gorm.DB) *AgentModelRepository {
	return &AgentModelRepository{db: db}
}

// GetAllModels 获取所有模型
func (r *AgentModelRepository) GetAllModels() ([]AgentModel, error) {
	var models []AgentModel
	err := r.db.Order("sort_order ASC, id ASC").Find(&models).Error
	return models, err
}

// GetEnabledModels 获取所有启用的模型
func (r *AgentModelRepository) GetEnabledModels() ([]AgentModel, error) {
	var models []AgentModel
	err := r.db.Where("is_enabled = ?", true).Order("sort_order ASC, id ASC").Find(&models).Error
	return models, err
}

// GetModelByID 根据 ID 获取模型
func (r *AgentModelRepository) GetModelByID(id uint) (*AgentModel, error) {
	var model AgentModel
	err := r.db.First(&model, id).Error
	if err != nil {
		return nil, err
	}
	return &model, nil
}

// GetDefaultModel 获取默认模型
func (r *AgentModelRepository) GetDefaultModel() (*AgentModel, error) {
	var model AgentModel
	err := r.db.Where("is_default = ? AND is_enabled = ?", true, true).First(&model).Error
	if err != nil {
		// 如果没有默认模型，返回第一个启用的模型
		err = r.db.Where("is_enabled = ?", true).Order("sort_order ASC").First(&model).Error
		if err != nil {
			return nil, err
		}
	}
	return &model, nil
}

// CreateModel 创建模型
func (r *AgentModelRepository) CreateModel(model *AgentModel) error {
	return r.db.Create(model).Error
}

// UpdateModel 更新模型
func (r *AgentModelRepository) UpdateModel(model *AgentModel) error {
	return r.db.Save(model).Error
}

// DeleteModel 删除模型
func (r *AgentModelRepository) DeleteModel(id uint) error {
	return r.db.Delete(&AgentModel{}, id).Error
}

// SetDefaultModel 设置默认模型
func (r *AgentModelRepository) SetDefaultModel(id uint) error {
	// 先清除所有默认标记
	if err := r.db.Model(&AgentModel{}).Where("is_default = ?", true).Update("is_default", false).Error; err != nil {
		return err
	}
	// 设置新的默认模型
	return r.db.Model(&AgentModel{}).Where("id = ?", id).Update("is_default", true).Error
}

// ToggleModelEnabled 切换模型启用状态
func (r *AgentModelRepository) ToggleModelEnabled(id uint, enabled bool) error {
	return r.db.Model(&AgentModel{}).Where("id = ?", id).Update("is_enabled", enabled).Error
}

// UpdateSortOrder 更新排序
func (r *AgentModelRepository) UpdateSortOrder(orders map[uint]int) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		for id, order := range orders {
			if err := tx.Model(&AgentModel{}).Where("id = ?", id).Update("sort_order", order).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
