// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package utils

// NormalizePagination validates and normalizes page / pageSize values,
// returning the sanitized (limit, offset) pair ready for database queries.
// maxSize caps the maximum allowed pageSize; pass 0 to use the default (100).
func NormalizePagination(page, pageSize, maxSize int) (limit, offset int) {
	if maxSize <= 0 {
		maxSize = 100
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 20
	}
	if pageSize > maxSize {
		pageSize = maxSize
	}
	return pageSize, (page - 1) * pageSize
}
