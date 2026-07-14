// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package modelcatalog

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Repository agent_models / agent_model_bindings 的数据访问层。
type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// ListModels 全量目录(admin 页 + service 缓存快照用),按 sort_order, id 稳定排序。
func (r *Repository) ListModels() ([]AgentModel, error) {
	var rows []AgentModel
	err := r.db.Order("sort_order ASC, id ASC").Find(&rows).Error
	return rows, err
}

// GetModelByID 主键取一行(admin 更新/删除前置查)。
func (r *Repository) GetModelByID(id uint64) (*AgentModel, error) {
	var row AgentModel
	if err := r.db.First(&row, id).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

// CreateModel 新增目录行(model_id 撞唯一键由 DB 兜底,handler 侧先查重给友好文案)。
func (r *Repository) CreateModel(m *AgentModel) error {
	return r.db.Create(m).Error
}

// UpdateModel 显式字段全量更新(map 写法避免 gorm 跳零值 —— enabled/user_selectable/价格清零都要能写进去)。
func (r *Repository) UpdateModel(id uint64, m *AgentModel) error {
	return r.db.Model(&AgentModel{}).Where("id = ?", id).Updates(map[string]any{
		"model_id":        m.ModelID,
		"provider_id":     m.ProviderID,
		"display_name":    m.DisplayName,
		"description":     m.Description,
		"channel":         m.Channel,
		"context_window":  m.ContextWindow,
		"max_output":      m.MaxOutput,
		"price_in":        m.PriceIn,
		"price_out":       m.PriceOut,
		"price_cache_r":   m.PriceCacheR,
		"price_cache_w":   m.PriceCacheW,
		"billing_weight":  m.BillingWeight,
		"speed_class":     m.SpeedClass,
		"user_selectable": m.UserSelectable,
		"min_tier":        m.MinTier,
		"enabled":         m.Enabled,
		"sort_order":      m.SortOrder,
		"notes":           m.Notes,
	}).Error
}

// DeleteModel 物理删除目录行(service 层已挡「仍被绑定引用」的删除)。
func (r *Repository) DeleteModel(id uint64) error {
	return r.db.Delete(&AgentModel{}, id).Error
}

// ListBindings 全量绑定。
func (r *Repository) ListBindings() ([]ModelBinding, error) {
	var rows []ModelBinding
	err := r.db.Find(&rows).Error
	return rows, err
}

// UpsertBinding 写入/覆盖某 purpose 的绑定(绑定行不可删,只可改指向 —— INSERT IGNORE 种子
// 会在重启重放时复活被删行,禁删比加墓碑简单且 11 个 purpose 是闭集)。
func (r *Repository) UpsertBinding(purpose, modelID string) error {
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "purpose"}},
		DoUpdates: clause.AssignmentColumns([]string{"model_id"}),
	}).Create(&ModelBinding{Purpose: purpose, ModelID: modelID}).Error
}
