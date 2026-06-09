package vip

import (
	"errors"
	"time"

	"scholar-backend/internal/common/utils"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// DB 暴露底层连接, 供同包的 WalletService 起事务用。
func (r *Repository) DB() *gorm.DB { return r.db }

// GetBillingConfig 拉取单行计费配置(id=1)。
func (r *Repository) GetBillingConfig() (*BillingConfig, error) {
	var c BillingConfig
	if err := r.db.First(&c).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

// UpdateBillingConfig upsert 单行配置(显式字段 Updates, 避免 gorm 跳零值 —— enabled/各数值需可写 0)。
func (r *Repository) UpdateBillingConfig(c *BillingConfig) error {
	var existing BillingConfig
	if err := r.db.First(&existing).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		c.ID = 1
		return r.db.Create(c).Error
	} else if err != nil {
		return err
	}
	return r.db.Model(&existing).Updates(map[string]any{
		"free_daily_tokens":        c.FreeDailyTokens,
		"pro_multiplier":           c.ProMultiplier,
		"max_multiplier":           c.MaxMultiplier,
		"pro_price_cents":          c.ProPriceCents,
		"pro_original_cents":       c.ProOriginalCents,
		"max_price_cents":          c.MaxPriceCents,
		"max_original_cents":       c.MaxOriginalCents,
		"pro_grant_credits":        c.ProGrantCredits,
		"max_grant_credits":        c.MaxGrantCredits,
		"recharge_rate":            c.RechargeRate,
		"min_recharge_cents":       c.MinRechargeCents,
		"reset_cost_credits":       c.ResetCostCredits,
		"subscription_period_days": c.SubscriptionPeriodDays,
		"popular_plan":             c.PopularPlan,
		"enabled":                  c.Enabled,
	}).Error
}

// GetUserContact 读某用户的邮箱(通知邮件用)。无邮箱/不存在 → 返回空串(调用方据此跳过发邮件)。
func (r *Repository) GetUserContact(userID uint) (email string, err error) {
	var u struct{ Email string }
	err = r.db.Table("users").Select("email").Where("id = ?", userID).Scan(&u).Error
	return u.Email, err
}

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

// GetCodeByCode 读一行兑换码(预览用, 不锁不改)。未命中回 ErrCodeNotFound。
func (r *Repository) GetCodeByCode(code string) (*RedemptionCode, error) {
	var rc RedemptionCode
	if err := r.db.Where("code = ?", code).First(&rc).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCodeNotFound
		}
		return nil, err
	}
	return &rc, nil
}

// HasUserRedeemed 该用户是否已兑换过此码(每用户每码一次的判据)。
func (r *Repository) HasUserRedeemed(codeID uint64, userID uint) (bool, error) {
	return r.hasUserRedeemedTx(r.db, codeID, userID)
}

// hasUserRedeemedTx 同 HasUserRedeemed, 但跑在给定事务/连接上(Redeem 事务内复用)。
func (r *Repository) hasUserRedeemedTx(tx *gorm.DB, codeID uint64, userID uint) (bool, error) {
	var n int64
	err := tx.Model(&CodeRedemption{}).Where("code_id = ? AND user_id = ?", codeID, userID).Count(&n).Error
	return n > 0, err
}

// SetCodeRevoked 管理员停用 / 恢复一个兑换码。revoked=true 写入停用时间, false 清空。
// 影响 0 行(id 不存在)回 ErrCodeNotFound。
func (r *Repository) SetCodeRevoked(id uint64, revoked bool, now time.Time) error {
	var revokedAt *time.Time
	if revoked {
		revokedAt = &now
	}
	res := r.db.Model(&RedemptionCode{}).Where("id = ?", id).Update("revoked_at", revokedAt)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrCodeNotFound
	}
	return nil
}

// CodeFilter 列表过滤。Status: ""(全部)/ "unredeemed"(仍可兑) / "redeemed"(已用完)。
// Redeemer: 兑换人关键词(ID/用户名/邮箱/手机号)—— 只看被该用户兑换过的码。
type CodeFilter struct {
	Status   string
	Tier     string
	Redeemer string
}

// ListCodes 分页列出兑换码(created_at DESC)。
func (r *Repository) ListCodes(f CodeFilter, limit, offset int) ([]RedemptionCode, int64, error) {
	q := r.db.Model(&RedemptionCode{})
	switch f.Status {
	case "redeemed": // 已用完:已兑次数达上限
		q = q.Where("used_count >= max_uses")
	case "unredeemed": // 仍可兑:未达上限
		q = q.Where("used_count < max_uses")
	}
	if f.Tier != "" {
		q = q.Where("grant_tier = ?", f.Tier)
	}
	// 按兑换人筛选:命中用户兑换过的码(走兑换流水 vip_code_redemptions)。
	if f.Redeemer != "" {
		if sql, args := utils.UserSearchClause(f.Redeemer, "id", "username", "email", "phone"); sql != "" {
			uidSub := r.db.Table("users").Select("id").Where(sql, args...)
			codeSub := r.db.Table("vip_code_redemptions").Select("code_id").Where("user_id IN (?)", uidSub)
			q = q.Where("id IN (?)", codeSub)
		}
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

// Redeem 兑换:事务里 校验码 → 记流水(每用户每码一次)→ 计数 +1 → 授予(会员 or 经费),
// 全原子。对码行加 FOR UPDATE 行锁:并发兑同一码被串行化, 故次数判定与每用户去重都准确。
func (r *Repository) Redeem(userID uint, code string, now time.Time) (*RedeemResult, error) {
	var result *RedeemResult
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
		if rc.RevokedAt != nil {
			return ErrCodeRevoked
		}
		if rc.ValidUntil != nil && rc.ValidUntil.Before(now) {
			return ErrCodeExpired
		}
		maxUses := rc.MaxUses
		if maxUses < 1 {
			maxUses = 1
		}
		if rc.UsedCount >= maxUses {
			return ErrCodeExhausted
		}
		// 每用户每码一次:先查流水(持码行锁, 同用户并发被串行化), 唯一键再兜底。
		dup, err := r.hasUserRedeemedTx(tx, rc.ID, userID)
		if err != nil {
			return err
		}
		if dup {
			return ErrCodeAlreadyRedeemed
		}
		if err := tx.Create(&CodeRedemption{CodeID: rc.ID, UserID: userID, RedeemedAt: now}).Error; err != nil {
			return err
		}
		// 计数 +1(并发兜底:used_count < max_uses 抢占, RowsAffected==0 说明刚被抢光)。
		res := tx.Model(&RedemptionCode{}).
			Where("id = ? AND used_count < ?", rc.ID, maxUses).
			Updates(map[string]any{
				"used_count":          gorm.Expr("used_count + 1"),
				"redeemed_by_user_id": userID,
				"redeemed_at":         now,
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrCodeExhausted
		}

		if rc.GrantKind == GrantKindCredit {
			if rc.CreditKind == CreditKindPerm {
				if err := grantPermInTx(tx, userID, rc.GrantCredits, SourceGift, code, TxGift); err != nil {
					return err
				}
				result = &RedeemResult{Kind: GrantKindCredit, Credits: rc.GrantCredits, CreditKind: CreditKindPerm}
			} else {
				days := rc.CreditValidityDays
				if days <= 0 {
					days = 30
				}
				exp := now.AddDate(0, 0, days)
				if err := grantTempInTx(tx, userID, rc.GrantCredits, SourceGift, code, now, exp, TxGift); err != nil {
					return err
				}
				result = &RedeemResult{Kind: GrantKindCredit, Credits: rc.GrantCredits, CreditKind: CreditKindTemp}
			}
			return nil
		}

		// 会员码:单调叠加(不降级 + 在期顺延)。
		var uv UserVIP
		if err := tx.Table("users").Select("vip_tier, vip_expires_at").Where("id = ?", userID).Scan(&uv).Error; err != nil {
			return err
		}
		newTier, newExpires := applyMembershipGrant(uv, rc.GrantTier, rc.GrantDays, now)
		if err := tx.Table("users").Where("id = ?", userID).
			Updates(map[string]any{"vip_tier": newTier, "vip_expires_at": newExpires}).Error; err != nil {
			return err
		}
		exp := newExpires
		result = &RedeemResult{Kind: GrantKindTier, Tier: newTier, ExpiresAt: &exp}
		return nil
	})
	return result, err
}
