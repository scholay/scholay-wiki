// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package database

import (
	"context"
	"errors"

	"gorm.io/gorm"
)

// WithTx 在事务中执行 fn，返回 nil 时提交，返回 error 时回滚。
// 嵌套调用复用外层事务（通过 gorm 的 SavePoint 机制）。
//
// 使用示例：
//
//	err := database.WithTx(ctx, db, func(tx *gorm.DB) error {
//	    if err := tx.Model(&Task{}).Where("id = ?", id).Update("status", "done").Error; err != nil {
//	        return err
//	    }
//	    return tx.Create(&Audit{TaskID: id}).Error
//	})
func WithTx(ctx context.Context, db *gorm.DB, fn func(tx *gorm.DB) error) error {
	if db == nil {
		return errors.New("database: nil db handle")
	}
	if fn == nil {
		return errors.New("database: nil tx function")
	}
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return fn(tx)
	})
}
