// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package coupon

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// DiscountType 折扣类型
type DiscountType string

const (
	DiscountTypePercentage DiscountType = "percentage" // 百分比折扣
	DiscountTypeFixed      DiscountType = "fixed"      // 固定金额
	DiscountTypePriceOff   DiscountType = "price_off"  // 减免金额
)

// DistributionType 发放类型
type DistributionType string

const (
	DistributionTypeManual       DistributionType = "manual"        // 手动发放
	DistributionTypeAutoInvite   DistributionType = "auto_invite"   // 邀请自动发放
	DistributionTypeAutoRegister DistributionType = "auto_register" // 注册自动发放
	DistributionTypeBatch        DistributionType = "batch"         // 批量发放
	DistributionTypeTargeted     DistributionType = "targeted"      // 定向发放
)

// TemplateStatus 模板状态
type TemplateStatus string

const (
	TemplateStatusDraft   TemplateStatus = "draft"   // 草稿
	TemplateStatusActive  TemplateStatus = "active"  // 活动
	TemplateStatusPaused  TemplateStatus = "paused"  // 暂停
	TemplateStatusExpired TemplateStatus = "expired" // 过期
)

// CouponStatus 折扣券状态
type CouponStatus string

const (
	CouponStatusUnused    CouponStatus = "unused"    // 未使用
	CouponStatusReserved  CouponStatus = "reserved"  // 已预留（订单创建但未支付）
	CouponStatusUsed      CouponStatus = "used"      // 已使用
	CouponStatusExpired   CouponStatus = "expired"   // 已过期
	CouponStatusCancelled CouponStatus = "cancelled" // 已取消
)

// SourceType 来源类型
type SourceType string

const (
	SourceTypeManual   SourceType = "manual"   // 手动发放
	SourceTypeInvite   SourceType = "invite"   // 邀请获得
	SourceTypeRegister SourceType = "register" // 注册获得
	SourceTypeBatch    SourceType = "batch"    // 批量发放
	SourceTypeTargeted SourceType = "targeted" // 定向发放
	SourceTypeActivity SourceType = "activity" // 活动获得
)

// JSONArray 用于处理JSON数组
type JSONArray []interface{}

// Value 实现 driver.Valuer 接口
func (j JSONArray) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return json.Marshal(j)
}

// Scan 实现 sql.Scanner 接口
func (j *JSONArray) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, j)
}

// JSONMap 用于处理JSON对象
type JSONMap map[string]interface{}

// Value 实现 driver.Valuer 接口
func (j JSONMap) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return json.Marshal(j)
}

// Scan 实现 sql.Scanner 接口
func (j *JSONMap) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, j)
}

// CouponTemplate 折扣券模板
type CouponTemplate struct {
	ID          uint64    `gorm:"primaryKey;autoIncrement" json:"id"`
	Code        string    `gorm:"type:varchar(50);not null;uniqueIndex" json:"code"`
	Name        string    `gorm:"type:varchar(100);not null" json:"name"`
	Description string    `gorm:"type:text" json:"description"`
	Type        DiscountType `gorm:"type:enum('percentage','fixed','price_off');default:'percentage'" json:"type"`
	DiscountValue float64   `gorm:"type:decimal(10,2);not null" json:"discount_value"`

	// 使用条件
	MinPurchaseAmount float64   `gorm:"type:decimal(10,2);default:0" json:"min_purchase_amount"`
	ApplicablePlans   JSONArray `gorm:"type:json" json:"applicable_plans"`
	ApplicableProducts JSONArray `gorm:"type:json" json:"applicable_products"`

	// 发放规则
	DistributionType DistributionType `gorm:"type:enum('manual','auto_invite','auto_register','batch','targeted');default:'manual'" json:"distribution_type"`

	// 时间限制
	ValidDays       int       `gorm:"default:30" json:"valid_days"`
	FixedValidStart *time.Time `json:"fixed_valid_start"`
	FixedValidEnd   *time.Time `json:"fixed_valid_end"`

	// 使用限制
	MaxUsageTotal   *int `json:"max_usage_total"`
	MaxUsagePerUser int  `gorm:"default:1" json:"max_usage_per_user"`
	FirstPurchaseOnly bool `gorm:"default:false" json:"first_purchase_only"`
	NewUserOnly     bool `gorm:"default:false" json:"new_user_only"`

	// 状态管理
	Status   TemplateStatus `gorm:"type:enum('draft','active','paused','expired');default:'draft'" json:"status"`
	Priority int           `gorm:"default:0" json:"priority"`

	// 邀请相关
	IsInviteCoupon bool    `gorm:"default:false" json:"is_invite_coupon"`
	InviterBenefit JSONMap `gorm:"type:json" json:"inviter_benefit"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	CreatedBy *uint64   `json:"created_by"`
}

// TableName 指定表名
func (CouponTemplate) TableName() string {
	return "coupon_templates"
}

// UserCoupon 用户折扣券
type UserCoupon struct {
	ID         uint64 `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID     uint64 `gorm:"not null;index:idx_user_status" json:"user_id"`
	TemplateID uint64 `gorm:"not null;index" json:"template_id"`
	CouponCode string `gorm:"type:varchar(100);uniqueIndex" json:"coupon_code"`

	// 来源追踪
	SourceType   SourceType `gorm:"type:enum('manual','invite','register','batch','targeted','activity');not null" json:"source_type"`
	SourceID     string     `gorm:"type:varchar(100)" json:"source_id"`
	SourceDetail JSONMap    `gorm:"type:json" json:"source_detail"`

	// 有效期
	ValidFrom  time.Time `gorm:"not null" json:"valid_from"`
	ValidUntil time.Time `gorm:"not null" json:"valid_until"`

	// 使用状态
	Status      CouponStatus `gorm:"type:enum('unused','used','expired','cancelled');default:'unused';index:idx_user_status" json:"status"`
	UsedAt      *time.Time   `json:"used_at"`
	UsedOrderID *uint64      `json:"used_order_id"`

	// 折扣信息（冗余存储）
	DiscountType      string  `gorm:"type:varchar(20);not null" json:"discount_type"`
	DiscountValue     float64 `gorm:"type:decimal(10,2);not null" json:"discount_value"`
	MinPurchaseAmount float64 `gorm:"type:decimal(10,2);default:0" json:"min_purchase_amount"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// 关联
	Template *CouponTemplate `gorm:"foreignKey:TemplateID" json:"template,omitempty"`
}

// TableName 指定表名
func (UserCoupon) TableName() string {
	return "user_coupons"
}

// CouponUsageLog 折扣券使用记录
type CouponUsageLog struct {
	ID           uint64 `gorm:"primaryKey;autoIncrement" json:"id"`
	UserCouponID uint64 `gorm:"not null;index" json:"user_coupon_id"`
	UserID       uint64 `gorm:"not null;index" json:"user_id"`
	OrderID      uint64 `gorm:"not null;index" json:"order_id"`

	OriginalAmount float64 `gorm:"type:decimal(10,2);not null" json:"original_amount"`
	DiscountAmount float64 `gorm:"type:decimal(10,2);not null" json:"discount_amount"`
	FinalAmount    float64 `gorm:"type:decimal(10,2);not null" json:"final_amount"`

	Status string `gorm:"type:enum('applied','confirmed','refunded');default:'applied'" json:"status"`

	AppliedAt   time.Time  `gorm:"default:CURRENT_TIMESTAMP" json:"applied_at"`
	ConfirmedAt *time.Time `json:"confirmed_at"`
	RefundedAt  *time.Time `json:"refunded_at"`

	Metadata JSONMap `gorm:"type:json" json:"metadata"`
}

// TableName 指定表名
func (CouponUsageLog) TableName() string {
	return "coupon_usage_logs"
}

// UserInvitation 用户邀请信息
type UserInvitation struct {
	ID             uint64 `gorm:"primaryKey;autoIncrement" json:"id"`
	UserID         uint64 `gorm:"not null;uniqueIndex" json:"user_id"`
	InvitationCode string `gorm:"type:varchar(50);not null;uniqueIndex" json:"invitation_code"`
	InvitationURL  string `gorm:"type:varchar(500)" json:"invitation_url"`

	// 统计数据
	TotalInvites      int `gorm:"default:0" json:"total_invites"`
	SuccessfulInvites int `gorm:"default:0" json:"successful_invites"`
	PaidInvites       int `gorm:"default:0" json:"paid_invites"`

	// 状态
	IsActive bool `gorm:"default:true;index" json:"is_active"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName 指定表名
func (UserInvitation) TableName() string {
	return "user_invitations"
}

// InvitationRelationship 邀请关系
type InvitationRelationship struct {
	ID             uint64 `gorm:"primaryKey;autoIncrement" json:"id"`
	InviterID      uint64 `gorm:"not null;index" json:"inviter_id"`
	InviteeID      uint64 `gorm:"not null;uniqueIndex" json:"invitee_id"`
	InvitationCode string `gorm:"type:varchar(50);index" json:"invitation_code"`

	Status string `gorm:"type:enum('pending','registered','activated','rewarded');default:'pending';index" json:"status"`

	InviteeCouponID *uint64 `json:"invitee_coupon_id"`
	InviterRewardID *uint64 `json:"inviter_reward_id"`

	RegisteredAt *time.Time `json:"registered_at"`
	ActivatedAt  *time.Time `json:"activated_at"`
	CreatedAt    time.Time  `json:"created_at"`
}

// TableName 指定表名
func (InvitationRelationship) TableName() string {
	return "invitation_relationships"
}

// CouponBatch 折扣券批次
type CouponBatch struct {
	ID          uint64 `gorm:"primaryKey;autoIncrement" json:"id"`
	BatchCode   string `gorm:"type:varchar(50);not null;uniqueIndex" json:"batch_code"`
	TemplateID  uint64 `gorm:"not null;index" json:"template_id"`
	Name        string `gorm:"type:varchar(100);not null" json:"name"`
	Description string `gorm:"type:text" json:"description"`

	// 发放规则
	TargetType       string    `gorm:"type:enum('all','new_users','paid_users','specific_users','user_group');not null" json:"target_type"`
	TargetUsers      JSONArray `gorm:"type:json" json:"target_users"`
	TargetConditions JSONMap   `gorm:"type:json" json:"target_conditions"`

	TotalQuantity      int `gorm:"not null" json:"total_quantity"`
	DistributedQuantity int `gorm:"default:0" json:"distributed_quantity"`
	UsedQuantity       int `gorm:"default:0" json:"used_quantity"`

	Status string `gorm:"type:enum('draft','processing','completed','cancelled');default:'draft';index" json:"status"`

	ScheduledAt *time.Time `json:"scheduled_at"`
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`

	CreatedAt time.Time `json:"created_at"`
	CreatedBy *uint64   `json:"created_by"`

	// 关联
	Template *CouponTemplate `gorm:"foreignKey:TemplateID" json:"template,omitempty"`
}

// TableName 指定表名
func (CouponBatch) TableName() string {
	return "coupon_batches"
}

// ============================================
// 请求和响应结构
// ============================================

// CreateCouponTemplateRequest 创建折扣券模板请求
type CreateCouponTemplateRequest struct {
	Code              string           `json:"code" binding:"omitempty,max=50"` // 可选,为空时自动生成
	Name              string           `json:"name" binding:"required,max=100"`
	Description       string           `json:"description"`
	Type              DiscountType     `json:"type" binding:"required,oneof=percentage fixed price_off"`
	DiscountValue     float64          `json:"discount_value" binding:"required,min=0"`
	MinPurchaseAmount float64          `json:"min_purchase_amount"`
	ApplicablePlans   []string         `json:"applicable_plans"`
	ApplicableProducts []string         `json:"applicable_products"`
	DistributionType  DistributionType `json:"distribution_type"`
	ValidDays         int              `json:"valid_days"`
	FixedValidStart   *time.Time       `json:"fixed_valid_start"`
	FixedValidEnd     *time.Time       `json:"fixed_valid_end"`
	MaxUsageTotal     *int             `json:"max_usage_total"`
	MaxUsagePerUser   int              `json:"max_usage_per_user"`
	FirstPurchaseOnly bool             `json:"first_purchase_only"`
	NewUserOnly       bool             `json:"new_user_only"`
	IsInviteCoupon    bool             `json:"is_invite_coupon"`
	InviterBenefit    map[string]interface{} `json:"inviter_benefit"`
}

// UpdateCouponTemplateRequest 更新折扣券模板请求
type UpdateCouponTemplateRequest struct {
	Name              string           `json:"name"`
	Description       string           `json:"description"`
	MinPurchaseAmount float64          `json:"min_purchase_amount"`
	ApplicablePlans   []string         `json:"applicable_plans"`
	ApplicableProducts []string         `json:"applicable_products"`
	ValidDays         int              `json:"valid_days"`
	FixedValidStart   *time.Time       `json:"fixed_valid_start"`
	FixedValidEnd     *time.Time       `json:"fixed_valid_end"`
	MaxUsageTotal     *int             `json:"max_usage_total"`
	MaxUsagePerUser   int              `json:"max_usage_per_user"`
	FirstPurchaseOnly bool             `json:"first_purchase_only"`
	NewUserOnly       bool             `json:"new_user_only"`
	Status            TemplateStatus   `json:"status"`
	Priority          int              `json:"priority"`
}

// DistributeCouponRequest 发放折扣券请求
type DistributeCouponRequest struct {
	TemplateID uint64     `json:"template_id" binding:"required"`
	UserIDs    []uint64   `json:"user_ids" binding:"required,min=1"`
	SourceType SourceType `json:"source_type"`
	SourceID   string     `json:"source_id"`
}

// ClaimCouponRequest 领取折扣券请求
type ClaimCouponRequest struct {
	Code string `json:"code" binding:"required"`
}

// ApplyCouponRequest 应用折扣券请求
type ApplyCouponRequest struct {
	CouponID uint64  `json:"coupon_id" binding:"required"`
	OrderID  uint64  `json:"order_id" binding:"required"`
	Amount   float64 `json:"amount" binding:"required,min=0"`
}

// GenerateInvitationRequest 生成邀请码请求
type GenerateInvitationRequest struct {
	// 可以为空，系统会自动生成
}

// RegisterWithInvitationRequest 通过邀请码注册请求
type RegisterWithInvitationRequest struct {
	InvitationCode string `json:"invitation_code" binding:"required"`
	Email          string `json:"email" binding:"required,email"`
	Password       string `json:"password" binding:"required,min=6"`
	// 其他注册信息...
}

// CouponStatistics 折扣券统计
type CouponStatistics struct {
	TotalTemplates      int64   `json:"total_templates"`
	ActiveTemplates     int64   `json:"active_templates"`
	TotalDistributed    int64   `json:"total_distributed"`
	TotalUsed           int64   `json:"total_used"`
	UsageRate           float64 `json:"usage_rate"`
	TotalDiscountAmount float64 `json:"total_discount_amount"`
}

// CreateBatchRequest 创建批量发放请求
type CreateBatchRequest struct {
	BatchCode        string            `json:"batch_code" binding:"required,max=50"`
	TemplateID       uint64            `json:"template_id" binding:"required"`
	Name             string            `json:"name" binding:"required,max=100"`
	Description      string            `json:"description"`
	TargetType       string            `json:"target_type" binding:"required,oneof=all new_users paid_users specific_users user_group"`
	TargetUsers      []uint64          `json:"target_users"`
	TargetConditions map[string]interface{} `json:"target_conditions"`
	TotalQuantity    int               `json:"total_quantity" binding:"required,min=1"`
	ScheduledAt      *time.Time        `json:"scheduled_at"`
}

// BatchListResponse 批次列表响应
type BatchListResponse struct {
	Batches []*CouponBatch `json:"batches"`
	Total   int64          `json:"total"`
	Page    int            `json:"page"`
	PageSize int           `json:"page_size"`
}