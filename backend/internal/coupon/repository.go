// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package coupon

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// ============================================
// 折扣券模板相关
// ============================================

// CreateTemplate 创建折扣券模板
func (r *Repository) CreateTemplate(template *CouponTemplate) error {
	return r.db.Create(template).Error
}

// GetTemplateByID 通过ID获取模板
func (r *Repository) GetTemplateByID(id uint64) (*CouponTemplate, error) {
	var template CouponTemplate
	err := r.db.Where("id = ?", id).First(&template).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}

// GetTemplateByCode 通过代码获取模板
func (r *Repository) GetTemplateByCode(code string) (*CouponTemplate, error) {
	var template CouponTemplate
	err := r.db.Where("code = ?", code).First(&template).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}

// GetActiveTemplateByCode 获取活动状态的模板
func (r *Repository) GetActiveTemplateByCode(code string) (*CouponTemplate, error) {
	var template CouponTemplate
	err := r.db.Where("code = ? AND status = ?", code, TemplateStatusActive).First(&template).Error
	if err != nil {
		return nil, err
	}
	return &template, nil
}

// UpdateTemplate 更新模板
func (r *Repository) UpdateTemplate(id uint64, updates map[string]any) error {
	return r.db.Model(&CouponTemplate{}).Where("id = ?", id).Updates(updates).Error
}

// ListTemplates 获取模板列表
func (r *Repository) ListTemplates(status *TemplateStatus, distributionType *DistributionType, offset, limit int) ([]*CouponTemplate, int64, error) {
	query := r.db.Model(&CouponTemplate{})

	if status != nil {
		query = query.Where("status = ?", *status)
	}
	if distributionType != nil {
		query = query.Where("distribution_type = ?", *distributionType)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var templates []*CouponTemplate
	err := query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&templates).Error
	return templates, total, err
}

// GetAutoDistributionTemplates 获取自动发放的模板
func (r *Repository) GetAutoDistributionTemplates(distributionType DistributionType) ([]*CouponTemplate, error) {
	var templates []*CouponTemplate
	err := r.db.Where("distribution_type = ? AND status = ?", distributionType, TemplateStatusActive).
		Find(&templates).Error
	return templates, err
}

// DeleteTemplate 删除模板（软删除）
func (r *Repository) DeleteTemplate(id uint64) error {
	// 检查是否有用户已经领取了该模板的券
	var userCouponCount int64
	if err := r.db.Model(&UserCoupon{}).Where("template_id = ?", id).Count(&userCouponCount).Error; err != nil {
		return err
	}
	if userCouponCount > 0 {
		return fmt.Errorf("无法删除：该折扣券已发放给 %d 位用户，请先暂停该折扣券", userCouponCount)
	}

	// 检查是否有批次发放记录关联
	var batchCount int64
	if err := r.db.Model(&CouponBatch{}).Where("template_id = ?", id).Count(&batchCount).Error; err != nil {
		return err
	}
	if batchCount > 0 {
		return fmt.Errorf("无法删除：该折扣券有 %d 个批次发放记录，请先删除相关批次", batchCount)
	}

	return r.db.Delete(&CouponTemplate{}, id).Error
}

// ============================================
// 用户折扣券相关
// ============================================

// CreateUserCoupon 创建用户折扣券
func (r *Repository) CreateUserCoupon(coupon *UserCoupon) error {
	return r.db.Create(coupon).Error
}

// CreateUserCoupons 批量创建用户折扣券
func (r *Repository) CreateUserCoupons(coupons []*UserCoupon) error {
	return r.db.CreateInBatches(coupons, 100).Error
}

// GetUserCouponByID 通过ID获取用户折扣券
func (r *Repository) GetUserCouponByID(id uint64) (*UserCoupon, error) {
	var coupon UserCoupon
	err := r.db.Preload("Template").Where("id = ?", id).First(&coupon).Error
	if err != nil {
		return nil, err
	}
	return &coupon, nil
}

// GetUserCouponByCode 通过代码获取用户折扣券
func (r *Repository) GetUserCouponByCode(code string) (*UserCoupon, error) {
	var coupon UserCoupon
	err := r.db.Preload("Template").Where("coupon_code = ?", code).First(&coupon).Error
	if err != nil {
		return nil, err
	}
	return &coupon, nil
}

// ListUserCoupons 获取用户的折扣券列表
func (r *Repository) ListUserCoupons(userID uint64, status *CouponStatus, offset, limit int) ([]*UserCoupon, int64, error) {
	query := r.db.Model(&UserCoupon{}).Preload("Template").Where("user_id = ?", userID)

	if status != nil {
		query = query.Where("status = ?", *status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var coupons []*UserCoupon
	err := query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&coupons).Error
	return coupons, total, err
}

// AdminListAllDistributedCoupons 管理员获取所有已发放折扣券列表（支持筛选）
func (r *Repository) AdminListAllDistributedCoupons(templateID *uint64, status *CouponStatus, userEmail string, offset, limit int) ([]*UserCoupon, int64, error) {
	query := r.db.Model(&UserCoupon{}).Preload("Template")

	// 如果指定了用户邮箱，需要join用户表进行筛选
	if userEmail != "" {
		query = query.Joins("JOIN users ON users.id = user_coupons.user_id").
			Where("users.email LIKE ?", "%"+userEmail+"%")
	}

	// 按模板筛选
	if templateID != nil {
		query = query.Where("template_id = ?", *templateID)
	}

	// 按状态筛选
	if status != nil {
		query = query.Where("user_coupons.status = ?", *status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var coupons []*UserCoupon
	err := query.Order("user_coupons.created_at DESC").Offset(offset).Limit(limit).Find(&coupons).Error
	return coupons, total, err
}

// GetAvailableCoupons 获取用户可用的折扣券
func (r *Repository) GetAvailableCoupons(userID uint64, amount float64) ([]*UserCoupon, error) {
	now := time.Now()
	var coupons []*UserCoupon

	err := r.db.Preload("Template").
		Joins("JOIN coupon_templates ON user_coupons.template_id = coupon_templates.id").
		Where("user_coupons.user_id = ? AND user_coupons.status = ? AND user_coupons.valid_from <= ? AND user_coupons.valid_until >= ?",
			userID, CouponStatusUnused, now, now).
		Where("user_coupons.min_purchase_amount <= ?", amount).
		Where("coupon_templates.status = ?", TemplateStatusActive).
		Order("user_coupons.discount_value DESC").
		Find(&coupons).Error

	return coupons, err
}

// UpdateUserCoupon 更新用户折扣券
func (r *Repository) UpdateUserCoupon(id uint64, updates map[string]any) error {
	return r.db.Model(&UserCoupon{}).Where("id = ?", id).Updates(updates).Error
}

// UseCoupon 使用折扣券 (accepts both unused and reserved status)
func (r *Repository) UseCoupon(couponID uint64, orderID uint64) error {
	now := time.Now()
	return r.db.Model(&UserCoupon{}).
		Where("id = ? AND status IN (?)", couponID, []CouponStatus{CouponStatusUnused, CouponStatusReserved}).
		Updates(map[string]any{
			"status":        CouponStatusUsed,
			"used_at":       now,
			"used_order_id": orderID,
		}).Error
}

// CountUserCouponUsage 统计用户使用某模板的次数
func (r *Repository) CountUserCouponUsage(userID uint64, templateID uint64) (int64, error) {
	var count int64
	err := r.db.Model(&UserCoupon{}).
		Where("user_id = ? AND template_id = ?", userID, templateID).
		Count(&count).Error
	return count, err
}

// ============================================
// 邀请系统相关
// ============================================

// CreateUserInvitation 创建用户邀请信息
func (r *Repository) CreateUserInvitation(invitation *UserInvitation) error {
	return r.db.Create(invitation).Error
}

// GetUserInvitation 获取用户邀请信息
func (r *Repository) GetUserInvitation(userID uint64) (*UserInvitation, error) {
	var invitation UserInvitation
	err := r.db.Where("user_id = ?", userID).First(&invitation).Error
	if err != nil {
		return nil, err
	}
	return &invitation, nil
}

// GetUserInvitationByCode 通过邀请码获取邀请信息
func (r *Repository) GetUserInvitationByCode(code string) (*UserInvitation, error) {
	var invitation UserInvitation
	err := r.db.Where("invitation_code = ? AND is_active = ?", code, true).First(&invitation).Error
	if err != nil {
		return nil, err
	}
	return &invitation, nil
}

// UpdateUserInvitation 更新邀请信息
func (r *Repository) UpdateUserInvitation(userID uint64, updates map[string]any) error {
	return r.db.Model(&UserInvitation{}).Where("user_id = ?", userID).Updates(updates).Error
}

// IncrementInvitationCount 增加邀请计数
func (r *Repository) IncrementInvitationCount(userID uint64, field string) error {
	return r.db.Model(&UserInvitation{}).Where("user_id = ?", userID).
		UpdateColumn(field, gorm.Expr(fmt.Sprintf("%s + ?", field), 1)).Error
}

// CreateInvitationRelationship 创建邀请关系
func (r *Repository) CreateInvitationRelationship(relationship *InvitationRelationship) error {
	return r.db.Create(relationship).Error
}

// GetInvitationRelationship 获取邀请关系
func (r *Repository) GetInvitationRelationship(inviteeID uint64) (*InvitationRelationship, error) {
	var relationship InvitationRelationship
	err := r.db.Where("invitee_id = ?", inviteeID).First(&relationship).Error
	if err != nil {
		return nil, err
	}
	return &relationship, nil
}

// UpdateInvitationRelationship 更新邀请关系
func (r *Repository) UpdateInvitationRelationship(id uint64, updates map[string]any) error {
	return r.db.Model(&InvitationRelationship{}).Where("id = ?", id).Updates(updates).Error
}

// ListInvitationRelationships 获取用户的邀请关系列表
func (r *Repository) ListInvitationRelationships(inviterID uint64, status *string, offset, limit int) ([]*InvitationRelationship, int64, error) {
	query := r.db.Model(&InvitationRelationship{}).Where("inviter_id = ?", inviterID)

	if status != nil {
		query = query.Where("status = ?", *status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var relationships []*InvitationRelationship
	err := query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&relationships).Error
	return relationships, total, err
}

// ============================================
// 使用记录相关
// ============================================

// CreateUsageLog 创建使用记录
func (r *Repository) CreateUsageLog(log *CouponUsageLog) error {
	return r.db.Create(log).Error
}

// GetUsageLogByOrderID 通过订单ID获取使用记录
func (r *Repository) GetUsageLogByOrderID(orderID uint64) (*CouponUsageLog, error) {
	var log CouponUsageLog
	err := r.db.Where("order_id = ?", orderID).First(&log).Error
	if err != nil {
		return nil, err
	}
	return &log, nil
}

// UpdateUsageLog 更新使用记录
func (r *Repository) UpdateUsageLog(id uint64, updates map[string]any) error {
	return r.db.Model(&CouponUsageLog{}).Where("id = ?", id).Updates(updates).Error
}

// ============================================
// 批次管理相关
// ============================================

// CreateBatch 创建批次
func (r *Repository) CreateBatch(batch *CouponBatch) error {
	return r.db.Create(batch).Error
}

// GetBatchByID 通过ID获取批次
func (r *Repository) GetBatchByID(id uint64) (*CouponBatch, error) {
	var batch CouponBatch
	err := r.db.Preload("Template").Where("id = ?", id).First(&batch).Error
	if err != nil {
		return nil, err
	}
	return &batch, nil
}

// UpdateBatch 更新批次
func (r *Repository) UpdateBatch(id uint64, updates map[string]any) error {
	return r.db.Model(&CouponBatch{}).Where("id = ?", id).Updates(updates).Error
}

// ListBatches 获取批次列表
func (r *Repository) ListBatches(status *string, offset, limit int) ([]*CouponBatch, int64, error) {
	query := r.db.Model(&CouponBatch{}).Preload("Template")

	if status != nil {
		query = query.Where("status = ?", *status)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var batches []*CouponBatch
	err := query.Order("created_at DESC").Offset(offset).Limit(limit).Find(&batches).Error
	return batches, total, err
}

// ============================================
// 统计相关
// ============================================

// GetStatistics 获取统计信息
func (r *Repository) GetStatistics() (*CouponStatistics, error) {
	var stats CouponStatistics

	// 统计模板数量
	r.db.Model(&CouponTemplate{}).Count(&stats.TotalTemplates)
	r.db.Model(&CouponTemplate{}).Where("status = ?", TemplateStatusActive).Count(&stats.ActiveTemplates)

	// 统计发放和使用数量
	r.db.Model(&UserCoupon{}).Count(&stats.TotalDistributed)
	r.db.Model(&UserCoupon{}).Where("status = ?", CouponStatusUsed).Count(&stats.TotalUsed)

	// 计算使用率
	if stats.TotalDistributed > 0 {
		stats.UsageRate = float64(stats.TotalUsed) / float64(stats.TotalDistributed) * 100
	}

	// 统计折扣总金额
	var discountAmount float64
	r.db.Model(&CouponUsageLog{}).Where("status = ?", "confirmed").
		Select("COALESCE(SUM(discount_amount), 0)").Scan(&discountAmount)
	stats.TotalDiscountAmount = discountAmount

	return &stats, nil
}

// GetAllActiveUserIDs returns IDs of all non-deleted users
func (r *Repository) GetAllActiveUserIDs() ([]uint64, error) {
	var userIDs []uint64
	err := r.db.Table("users").
		Where("deleted_at IS NULL").
		Pluck("id", &userIDs).Error
	return userIDs, err
}

// GetNewUserIDsSince returns IDs of non-deleted users created on or after the given time
func (r *Repository) GetNewUserIDsSince(since time.Time) ([]uint64, error) {
	var userIDs []uint64
	err := r.db.Table("users").
		Where("deleted_at IS NULL AND created_at >= ?", since).
		Pluck("id", &userIDs).Error
	return userIDs, err
}

// GetPaidUserIDs returns distinct user IDs that have at least one paid order
func (r *Repository) GetPaidUserIDs() ([]uint64, error) {
	var userIDs []uint64
	err := r.db.Table("orders").
		Where("status = ?", "paid").
		Distinct("user_id").
		Pluck("user_id", &userIDs).Error
	return userIDs, err
}

// GetUserIDsByConditions returns user IDs matching the given dynamic conditions
func (r *Repository) GetUserIDsByConditions(conditions map[string]any) ([]uint64, error) {
	query := r.db.Table("users").Where("deleted_at IS NULL")

	if registeredAfter, ok := conditions["registered_after"].(string); ok {
		query = query.Where("created_at >= ?", registeredAfter)
	}
	if registeredBefore, ok := conditions["registered_before"].(string); ok {
		query = query.Where("created_at <= ?", registeredBefore)
	}

	var userIDs []uint64
	err := query.Pluck("id", &userIDs).Error
	return userIDs, err
}

// Transaction 执行事务
func (r *Repository) Transaction(fn func(*Repository) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		txRepo := &Repository{db: tx}
		return fn(txRepo)
	})
}