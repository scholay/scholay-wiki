package vip

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// GetUserVIP 读某用户的 VIP 等级 + 到期(从 users 表两列)。用户不存在时返回零值(视为 free)。
func (r *Repository) GetUserVIP(userID uint) (UserVIP, error) {
	var uv UserVIP
	err := r.db.Table("users").
		Select("vip_tier, vip_expires_at").
		Where("id = ?", userID).
		Scan(&uv).Error
	return uv, err
}

// SetUserVIP 直接设置某用户的等级 + 到期(admin 直授/取消会员用)。expiresAt nil = 永久/清空。
// 用户不存在(错 id)→ ErrUserNotFound, 避免上层伪造成功。
func (r *Repository) SetUserVIP(userID uint, tier string, expiresAt *time.Time) error {
	res := r.db.Table("users").Where("id = ?", userID).
		Updates(map[string]any{"vip_tier": tier, "vip_expires_at": expiresAt})
	if res.Error != nil {
		return res.Error
	}
	// RowsAffected 在 clientFoundRows=false(驱动默认)下只数「值有变化」的行:
	// 取消会员(置回 free/NULL)对本就 free 的用户是合法 no-op, 不能据此判定用户不存在。
	// 0 行时显式查一次存在性区分:行不存在 → ErrUserNotFound;行在但无变化 → 幂等成功。
	if res.RowsAffected == 0 {
		var n int64
		if err := r.db.Table("users").Where("id = ?", userID).Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			return ErrUserNotFound
		}
	}
	return nil
}

// CreateCodes 批量插入兑换码。
func (r *Repository) CreateCodes(codes []RedemptionCode) error {
	if len(codes) == 0 {
		return nil
	}
	return r.db.Create(&codes).Error
}

// CodeExists 用于生成时去重。
func (r *Repository) CodeExists(code string) (bool, error) {
	var n int64
	err := r.db.Model(&RedemptionCode{}).Where("code = ?", code).Count(&n).Error
	return n > 0, err
}

// CodeFilter 列表过滤。Status: ""(全部)/ "unredeemed" / "redeemed"。
type CodeFilter struct {
	Status string
	Tier   string
}

// ListCodes 分页列出兑换码(created_at DESC)。
func (r *Repository) ListCodes(f CodeFilter, limit, offset int) ([]RedemptionCode, int64, error) {
	q := r.db.Model(&RedemptionCode{})
	switch f.Status {
	case "redeemed":
		q = q.Where("redeemed_at IS NOT NULL")
	case "unredeemed":
		q = q.Where("redeemed_at IS NULL")
	}
	if f.Tier != "" {
		q = q.Where("grant_tier = ?", f.Tier)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []RedemptionCode
	if err := q.Order("created_at DESC").Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// Redeem 兑换:校验码 → 顺延/设置 users 的 vip_tier+expires → 标记码已用。整体在事务里, 防并发重复兑换。
// 返回 (授予等级, 新到期时间)。
func (r *Repository) Redeem(userID uint, code string, now time.Time) (string, time.Time, error) {
	var grantTier string
	var newExpires time.Time
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var rc RedemptionCode
		// 行锁, 防并发两个请求兑换同一码。
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("code = ?", code).First(&rc).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrCodeNotFound
			}
			return err
		}
		if rc.RedeemedAt != nil {
			return ErrCodeRedeemed
		}
		if rc.ValidUntil != nil && rc.ValidUntil.Before(now) {
			return ErrCodeExpired
		}

		var uv UserVIP
		if err := tx.Table("users").Select("vip_tier, vip_expires_at").Where("id = ?", userID).Scan(&uv).Error; err != nil {
			return err
		}
		// 单调(绝不让用户变差):当前是**未过期的 pro** → 永远保持 pro 且从现有到期日顺延,
		// 即便兑换的是较低等级的码 —— 否则一张 free 码会把在期 pro 直接降级并截断剩余时间。
		// 否则(free / 已过期)→ 从 now 起算, 授予码的等级。
		base := now
		grantTier = rc.GrantTier
		if uv.VIPTier == TierPro && uv.VIPExpiresAt != nil && uv.VIPExpiresAt.After(now) {
			base = *uv.VIPExpiresAt
			grantTier = TierPro
		}
		newExpires = base.AddDate(0, 0, rc.GrantDays)

		if err := tx.Table("users").Where("id = ?", userID).
			Updates(map[string]any{"vip_tier": rc.GrantTier, "vip_expires_at": newExpires}).Error; err != nil {
			return err
		}
		// 仅当仍未兑换时才标记(并发兜底:RowsAffected==0 说明被另一个事务抢先)。
		res := tx.Model(&RedemptionCode{}).
			Where("id = ? AND redeemed_at IS NULL", rc.ID).
			Updates(map[string]any{"redeemed_by_user_id": userID, "redeemed_at": now})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrCodeRedeemed
		}
		return nil
	})
	return grantTier, newExpires, err
}
