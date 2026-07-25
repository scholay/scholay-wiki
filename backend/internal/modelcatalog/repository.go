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
		"max_input":       m.MaxInput,
		"max_output":      m.MaxOutput,
		"price_in":        m.PriceIn,
		"price_out":       m.PriceOut,
		"price_cache_r":   m.PriceCacheR,
		"price_cache_w":   m.PriceCacheW,
		// P5 成本制:billing_weight / billing_weight_hi 已作废,**刻意不写**(列保留历史值作回滚兜底)。
		// 分档字段(0084 两档 + 0087 三档):map 写法须显式列出,否则新列在编辑保存时被静默跳过(不写库)。
		"input_tier_threshold":   m.InputTierThreshold,
		"price_in_hi":            m.PriceInHi,
		"price_out_hi":           m.PriceOutHi,
		"price_cache_r_hi":       m.PriceCacheRHi,
		"price_cache_w_hi":       m.PriceCacheWHi,
		"input_tier_threshold_2": m.InputTierThreshold2,
		"price_in_hi2":           m.PriceInHi2,
		"price_out_hi2":          m.PriceOutHi2,
		"price_cache_r_hi2":      m.PriceCacheRHi2,
		"price_cache_w_hi2":      m.PriceCacheWHi2,
		"speed_class":     m.SpeedClass,
		"vision":          m.Vision,
		"flagship":        m.Flagship,
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

// UpsertPlaceholderModel 首见某未计价上游 model code(项目侧翻译/矩阵/公众号等不在目录的模型)时,
// 插入一条**停用占位行**(enabled/user_selectable=false、weight=1、单价 0),让它出现在 admin 目录里
// 可被补上下文窗口/四类单价/计费倍率后启用统计。已存在则完全不动(DoNothing),绝不覆盖 admin 已填值。
func (r *Repository) UpsertPlaceholderModel(modelID, channel string) error {
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "model_id"}},
		DoNothing: true,
	}).Create(&AgentModel{
		ModelID:        modelID,
		DisplayName:    modelID,
		Channel:        channel,
		BillingWeight:  1,
		Enabled:        false,
		UserSelectable: false,
		Notes:          "自动登记:计价目录未命中的上游模型。补上下文窗口/四类单价/计费倍率后即纳入成本看板与加权。",
	}).Error
}

// CountPinnedSessions 统计仍把该 model 设为 pinned_model 的会话数(DeleteModel 前置守卫)。
// 直接查 agent_sessions 表(不 import agentbridge,避免环)。
func (r *Repository) CountPinnedSessions(modelID string) (int64, error) {
	var n int64
	err := r.db.Table("agent_sessions").Where("pinned_model = ?", modelID).Count(&n).Error
	return n, err
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
