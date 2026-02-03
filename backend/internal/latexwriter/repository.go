// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"gorm.io/gorm"
)

// Repository 提供数据库操作
type Repository struct {
	db *gorm.DB
}

// NewRepository 创建新的 Repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// CreateDocument 创建文档
func (r *Repository) CreateDocument(doc *LatexDocument) error {
	return r.db.Create(doc).Error
}

// GetDocumentByID 根据 ID 获取文档
func (r *Repository) GetDocumentByID(id uint, userID uint) (*LatexDocument, error) {
	var doc LatexDocument
	err := r.db.Where("id = ? AND user_id = ?", id, userID).First(&doc).Error
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

// GetDocumentsByUserID 获取用户的所有文档
func (r *Repository) GetDocumentsByUserID(userID uint) ([]LatexDocument, error) {
	var docs []LatexDocument
	err := r.db.Where("user_id = ?", userID).Order("sort_order ASC, created_at ASC").Find(&docs).Error
	return docs, err
}

// GetRootDocuments 获取用户的根级文档
func (r *Repository) GetRootDocuments(userID uint) ([]LatexDocument, error) {
	var docs []LatexDocument
	err := r.db.Where("user_id = ? AND parent_id IS NULL", userID).Order("sort_order ASC, created_at ASC").Find(&docs).Error
	return docs, err
}

// GetChildDocuments 获取子文档
func (r *Repository) GetChildDocuments(parentID uint, userID uint) ([]LatexDocument, error) {
	var docs []LatexDocument
	err := r.db.Where("user_id = ? AND parent_id = ?", userID, parentID).Order("sort_order ASC, created_at ASC").Find(&docs).Error
	return docs, err
}

// UpdateDocument 更新文档
func (r *Repository) UpdateDocument(doc *LatexDocument) error {
	return r.db.Save(doc).Error
}

// DeleteDocument 删除文档
func (r *Repository) DeleteDocument(id uint, userID uint) error {
	return r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&LatexDocument{}).Error
}

// DeleteDocumentAndChildren 递归删除文档及其子文档
func (r *Repository) DeleteDocumentAndChildren(id uint, userID uint) error {
	// 先获取所有子文档
	var children []LatexDocument
	if err := r.db.Where("user_id = ? AND parent_id = ?", userID, id).Find(&children).Error; err != nil {
		return err
	}

	// 递归删除子文档
	for _, child := range children {
		if err := r.DeleteDocumentAndChildren(child.ID, userID); err != nil {
			return err
		}
	}

	// 删除当前文档
	return r.DeleteDocument(id, userID)
}

// CountUserDocuments 统计用户文档数量
func (r *Repository) CountUserDocuments(userID uint) (int64, error) {
	var count int64
	err := r.db.Model(&LatexDocument{}).Where("user_id = ?", userID).Count(&count).Error
	return count, err
}
