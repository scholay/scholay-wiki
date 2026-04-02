// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package ai

import "gorm.io/gorm"

// Repository handles all database operations for the AI module.
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new AI repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// ==================== PromptTemplate operations ====================

func (r *Repository) ListPromptTemplates() ([]PromptTemplate, error) {
	var templates []PromptTemplate
	err := r.db.Order("created_at DESC").Find(&templates).Error
	return templates, err
}

func (r *Repository) GetPromptTemplateByID(id uint) (*PromptTemplate, error) {
	var template PromptTemplate
	err := r.db.First(&template, id).Error
	return &template, err
}

func (r *Repository) CreatePromptTemplate(template *PromptTemplate) error {
	return r.db.Create(template).Error
}

func (r *Repository) UpdatePromptTemplate(template *PromptTemplate) error {
	return r.db.Save(template).Error
}

func (r *Repository) DeletePromptTemplate(id uint) error {
	return r.db.Delete(&PromptTemplate{}, id).Error
}

func (r *Repository) GetActivePromptTemplateByKey(key string) (*PromptTemplate, error) {
	var template PromptTemplate
	err := r.db.Where("`key` = ? AND is_active = 1", key).First(&template).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}

// ==================== PaperAnalysis cache operations ====================

func (r *Repository) FindPaperAnalysis(paperID, dimensionHash string) (*PaperAnalysis, error) {
	var analysis PaperAnalysis
	err := r.db.Where("paper_id = ? AND dimension_hash = ?", paperID, dimensionHash).First(&analysis).Error
	if err != nil {
		return nil, err
	}
	return &analysis, nil
}

func (r *Repository) UpsertPaperAnalysis(analysis *PaperAnalysis) error {
	return r.db.Where("paper_id = ? AND dimension_hash = ?", analysis.PaperID, analysis.DimensionHash).
		Assign(*analysis).FirstOrCreate(analysis).Error
}

// ==================== AnalysisDimension operations ====================

func (r *Repository) GetSystemDimensions() ([]AnalysisDimension, error) {
	var dimensions []AnalysisDimension
	err := r.db.Where("user_id = -1 AND is_active = ?", true).
		Order("sort_order ASC").
		Find(&dimensions).Error
	return dimensions, err
}

func (r *Repository) GetUserDimensions(userID uint) ([]AnalysisDimension, error) {
	var dimensions []AnalysisDimension
	err := r.db.Where("user_id = ? AND is_active = ?", userID, true).
		Order("sort_order ASC").
		Find(&dimensions).Error
	return dimensions, err
}

func (r *Repository) GetAllUserDimensions(userID uint) ([]AnalysisDimension, error) {
	var dimensions []AnalysisDimension
	err := r.db.Where("user_id = ?", userID).
		Find(&dimensions).Error
	return dimensions, err
}

func (r *Repository) FindDimensionByUserAndKey(userID uint, dimensionKey string) (*AnalysisDimension, error) {
	var dim AnalysisDimension
	err := r.db.Where("user_id = ? AND dimension_key = ?", userID, dimensionKey).First(&dim).Error
	if err != nil {
		return nil, err
	}
	return &dim, nil
}

func (r *Repository) FindSystemDimensionByKey(dimensionKey string) (*AnalysisDimension, error) {
	var dim AnalysisDimension
	err := r.db.Where("user_id = -1 AND dimension_key = ?", dimensionKey).First(&dim).Error
	if err != nil {
		return nil, err
	}
	return &dim, nil
}

func (r *Repository) FindDimensionByIDAndUser(dimensionID uint, userID uint) (*AnalysisDimension, error) {
	var dim AnalysisDimension
	err := r.db.Where("id = ? AND user_id = ?", dimensionID, userID).First(&dim).Error
	if err != nil {
		return nil, err
	}
	return &dim, nil
}

func (r *Repository) FindSystemDimensionByID(dimensionID uint) (*AnalysisDimension, error) {
	var dim AnalysisDimension
	err := r.db.Where("id = ? AND user_id = -1", dimensionID).First(&dim).Error
	if err != nil {
		return nil, err
	}
	return &dim, nil
}

func (r *Repository) CreateDimension(dim *AnalysisDimension) error {
	return r.db.Create(dim).Error
}

func (r *Repository) SaveDimension(dim *AnalysisDimension) error {
	return r.db.Save(dim).Error
}

func (r *Repository) DeleteDimensionByIDAndUser(dimensionID, userID uint) (int64, error) {
	result := r.db.Where("id = ? AND user_id = ?", dimensionID, userID).Delete(&AnalysisDimension{})
	return result.RowsAffected, result.Error
}

func (r *Repository) DeleteDimensionByUserAndKey(userID uint, dimensionKey string) error {
	return r.db.Where("user_id = ? AND dimension_key = ?", userID, dimensionKey).Delete(&AnalysisDimension{}).Error
}

func (r *Repository) DeleteAllUserDimensions(userID uint) (int64, error) {
	result := r.db.Where("user_id = ?", userID).Delete(&AnalysisDimension{})
	return result.RowsAffected, result.Error
}

func (r *Repository) GetDB() *gorm.DB {
	return r.db
}
