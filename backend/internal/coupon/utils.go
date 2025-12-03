// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package coupon

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"time"
)

// GenerateCouponCode 生成折扣券唯一码
func GenerateCouponCode(prefix string) string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	const length = 8

	b := make([]byte, length)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}

	if prefix != "" {
		return fmt.Sprintf("%s-%s", strings.ToUpper(prefix), string(b))
	}
	return string(b)
}

// GenerateInvitationCode 生成邀请码
func GenerateInvitationCode() string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	const length = 6

	b := make([]byte, length)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}

	return string(b)
}

// GenerateBatchCode 生成批次号
func GenerateBatchCode() string {
	timestamp := time.Now().Format("20060102150405")
	randomPart := GenerateCouponCode("")[:4]
	return fmt.Sprintf("BATCH-%s-%s", timestamp, randomPart)
}

// GenerateTemplateCode 生成模板编码
func GenerateTemplateCode(distributionType DistributionType) string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	const length = 6

	b := make([]byte, length)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}

	// 根据发放类型添加前缀
	var prefix string
	switch distributionType {
	case DistributionTypeAutoRegister:
		prefix = "REG"
	case DistributionTypeAutoInvite:
		prefix = "INV"
	case DistributionTypeManual:
		prefix = "MAN"
	case DistributionTypeBatch:
		prefix = "BAT"
	case DistributionTypeTargeted:
		prefix = "TGT"
	default:
		prefix = "CPN"
	}

	return fmt.Sprintf("%s%s", prefix, string(b))
}

// GenerateRandomCode 生成随机验证码
func GenerateRandomCode(length int) string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

	b := make([]byte, length)
	for i := range b {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		b[i] = charset[n.Int64()]
	}

	return string(b)
}

// CalculateExpiry 计算过期时间
func CalculateExpiry(template *CouponTemplate) time.Time {
	now := time.Now()

	// 如果有固定结束时间，使用固定结束时间
	if template.FixedValidEnd != nil {
		return *template.FixedValidEnd
	}

	// 否则使用有效天数计算
	if template.ValidDays > 0 {
		return now.AddDate(0, 0, template.ValidDays)
	}

	// 默认30天
	return now.AddDate(0, 0, 30)
}

// CalculateDiscount 计算折扣金额
// 返回值是折扣金额,即原价减去的部分
func CalculateDiscount(discountType DiscountType, discountValue float64, originalAmount float64) float64 {
	switch discountType {
	case DiscountTypePercentage:
		// 百分比折扣: 例如20%折扣,原价100,折扣金额20,最终支付80
		return originalAmount * (discountValue / 100)
	case DiscountTypeFixed:
		// 固定金额支付: 例如固定支付99元,原价100,折扣金额1,最终支付99
		// 如果固定金额大于原价,则折扣金额为0(按原价支付)
		if discountValue >= originalAmount {
			return 0
		}
		return originalAmount - discountValue
	case DiscountTypePriceOff:
		// 减免金额: 例如减免20元,原价100,折扣金额20,最终支付80
		// 最多减免到0元
		if discountValue > originalAmount {
			return originalAmount
		}
		return discountValue
	default:
		return 0
	}
}

// IsValidForUser 检查折扣券是否对用户有效
func IsValidForUser(template *CouponTemplate, isNewUser bool, isFirstPurchase bool) bool {
	// 检查新用户限制
	if template.NewUserOnly && !isNewUser {
		return false
	}

	// 检查首购限制
	if template.FirstPurchaseOnly && !isFirstPurchase {
		return false
	}

	return true
}

// IsValidAmount 检查金额是否满足要求
func IsValidAmount(minPurchaseAmount float64, orderAmount float64) bool {
	return orderAmount >= minPurchaseAmount
}

// IsValidTime 检查时间是否有效
func IsValidTime(validFrom, validUntil time.Time) bool {
	now := time.Now()
	return now.After(validFrom) && now.Before(validUntil)
}

// BuildInvitationURL 构建邀请链接
func BuildInvitationURL(baseURL string, invitationCode string) string {
	if !strings.HasSuffix(baseURL, "/") {
		baseURL += "/"
	}
	return fmt.Sprintf("%sregister?invite=%s", baseURL, invitationCode)
}