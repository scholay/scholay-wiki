// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package database

import "gorm.io/gorm"

const (
	DefaultPageSize = 20
	MaxPageSize     = 100
)

// Paginate returns a GORM scope that applies offset/limit pagination.
// It normalizes page (min 1) and pageSize (min 1, max MaxPageSize).
//
// Usage:
//
//	db.Scopes(database.Paginate(page, pageSize)).Find(&results)
func Paginate(page, pageSize int) func(db *gorm.DB) *gorm.DB {
	return func(db *gorm.DB) *gorm.DB {
		page, pageSize = NormalizePage(page, pageSize)
		return db.Offset((page - 1) * pageSize).Limit(pageSize)
	}
}

// NormalizePage clamps page and pageSize to valid ranges.
// Returns normalized (page, pageSize).
func NormalizePage(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = DefaultPageSize
	}
	if pageSize > MaxPageSize {
		pageSize = MaxPageSize
	}
	return page, pageSize
}

// CalcOffset returns the offset for a given page and pageSize.
// Use this when the repository method accepts (offset, limit) instead of GORM scopes.
func CalcOffset(page, pageSize int) int {
	page, pageSize = NormalizePage(page, pageSize)
	return (page - 1) * pageSize
}
