package fund

import (
	"time"
)

// MembershipFund 会员基金
type MembershipFund struct {
	ID                      uint      `gorm:"primaryKey" json:"id"`
	FundMonth               string    `gorm:"uniqueIndex;size:7;not null" json:"fund_month"`       // 基金月份（YYYY-MM）
	FundName                string    `gorm:"size:100;not null" json:"fund_name"`                  // 基金名称
	FundSlogan              string    `gorm:"size:200" json:"fund_slogan"`                         // 基金口号
	FundDescription         string    `gorm:"type:text" json:"fund_description"`                   // 基金详细介绍
	CoverImage              string    `gorm:"size:500" json:"cover_image"`                         // 封面图片
	ThemeColor              string    `gorm:"size:20;default:#6366f1" json:"theme_color"`          // 主题色
	ProGoldAmount           int64     `gorm:"not null;default:5000" json:"pro_gold_amount"`        // Pro会员赠送经费
	MaxGoldAmount           int64     `gorm:"not null;default:10000" json:"max_gold_amount"`       // Max会员赠送经费
	MaxDiamondAmount        int64     `gorm:"not null;default:6" json:"max_diamond_amount"`        // Max会员赠送恩特币
	TotalDistributedGold    int64     `gorm:"not null;default:0" json:"total_distributed_gold"`    // 已发放经费总额
	TotalDistributedDiamond int64     `gorm:"not null;default:0" json:"total_distributed_diamond"` // 已发放恩特币总额
	BeneficiaryCount        int       `gorm:"not null;default:0" json:"beneficiary_count"`         // 受益用户数
	Status                  string    `gorm:"size:20;not null;default:pending" json:"status"`      // 状态
	CreatedAt               time.Time `json:"created_at"`
	UpdatedAt               time.Time `json:"updated_at"`
}

func (MembershipFund) TableName() string {
	return "membership_funds"
}

// 基金状态常量
const (
	FundStatusPending   = "pending"   // 待生效
	FundStatusActive    = "active"    // 生效中
	FundStatusCompleted = "completed" // 已结束
)

// MembershipFundDistribution 基金发放记录
type MembershipFundDistribution struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	FundID         uint      `gorm:"not null;index" json:"fund_id"`                     // 基金ID
	UserID         uint      `gorm:"not null;index" json:"user_id"`                     // 用户ID
	MembershipType string    `gorm:"size:20;not null" json:"membership_type"`           // 会员类型
	GoldAmount     int64     `gorm:"not null;default:0" json:"gold_amount"`             // 发放经费
	DiamondAmount  int64     `gorm:"not null;default:0" json:"diamond_amount"`          // 发放恩特币
	TransactionNo  string    `gorm:"size:64" json:"transaction_no"`                     // 关联交易号
	DistributedAt  time.Time `gorm:"not null;default:CURRENT_TIMESTAMP" json:"distributed_at"` // 发放时间
	CreatedAt      time.Time `json:"created_at"`

	// 关联
	Fund *MembershipFund `gorm:"foreignKey:FundID" json:"fund,omitempty"`
}

func (MembershipFundDistribution) TableName() string {
	return "membership_fund_distributions"
}

// FundSummary 基金概要（用于列表展示）
type FundSummary struct {
	ID                      uint   `json:"id"`
	FundMonth               string `json:"fund_month"`
	FundName                string `json:"fund_name"`
	FundSlogan              string `json:"fund_slogan"`
	CoverImage              string `json:"cover_image"`
	ThemeColor              string `json:"theme_color"`
	TotalDistributedGold    int64  `json:"total_distributed_gold"`
	TotalDistributedDiamond int64  `json:"total_distributed_diamond"`
	BeneficiaryCount        int    `json:"beneficiary_count"`
	Status                  string `json:"status"`
}

// FundDetail 基金详情（包含完整信息）
type FundDetail struct {
	MembershipFund
	UserReceived      bool  `json:"user_received"`       // 当前用户是否已领取
	UserGoldAmount    int64 `json:"user_gold_amount"`    // 用户领取的经费
	UserDiamondAmount int64 `json:"user_diamond_amount"` // 用户领取的恩特币
}

