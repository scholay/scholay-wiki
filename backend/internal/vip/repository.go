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
		"free_window_tokens":       c.FreeWindowTokens,
		"window_days":              c.WindowDays,
		"base_price_per_m":         c.BasePricePerM,
		"pro_multiplier":           c.ProMultiplier,
		"max_multiplier":           c.MaxMultiplier,
		"pro_price_cents":          c.ProPriceCents,
		"pro_original_cents":       c.ProOriginalCents,
		"max_price_cents":          c.MaxPriceCents,
		"max_original_cents":       c.MaxOriginalCents,
		"pro_year_price_cents":     c.ProYearPriceCents,
		"pro_year_original_cents":  c.ProYearOriginalCents,
		"max_year_price_cents":     c.MaxYearPriceCents,
		"max_year_original_cents":  c.MaxYearOriginalCents,
		// 0090 退休:pro/max × 月/年 四个 grant 列 + 两个 subscription_*_days 列不再写回。
		// 这个 map 刻意显式列举(为了不跳零值),所以「struct 删字段」与「map 删 key」必须同批 ——
		// 只删一边:留 key = 编译错(好);留字段不删 key = 前端 PUT 缺 key 时零值刷掉
		// 0090 声明要保留的回滚兜底值(坏)。
		"recharge_rate":            c.RechargeRate,
		"credit_to_points":         c.CreditToPoints, // 0094 按量付费兑换率
		"min_recharge_cents":       c.MinRechargeCents,
		"invite_reward_credits":    c.InviteRewardCredits,  // 0100 邀请奖励(0=关闭)
		"invite_reward_daily_cap":  c.InviteRewardDailyCap, // 0100 每日上限(0=不限)
		"reset_cost_credits":       c.ResetCostCredits, // 运行时不读,但 0092 换算要用,必须继续写回
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

// GetUserVIP 读某用户的 VIP 等级 + 到期 + 计费周期(从 users 表三列)。用户不存在时返回零值(视为 free)。
func (r *Repository) GetUserVIP(userID uint) (UserVIP, error) {
	var uv UserVIP
	err := r.db.Table("users").
		Select("vip_tier, vip_expires_at, vip_cycle").
		Where("id = ?", userID).
		Scan(&uv).Error
	return uv, err
}

// windowDays 读计费周期天数(兑换码满血资格判据用;兑换是低频操作,多一次查询无所谓)。
// 读不到 → 7,与 BillingConfig.WindowDuration 的兜底同口径。
func (r *Repository) windowDays() int {
	var d int
	if err := r.db.Table("billing_config").Select("window_days").Where("id = 1").Scan(&d).Error; err != nil || d <= 0 {
		return 7
	}
	return d
}

// SetUserVIP 直接设置某用户的等级 + 到期(admin 直授/取消会员用)。expiresAt nil = 永久/清空。
// cycle = 计费周期标识(monthly|yearly);空串 = 不改动现值(admin 直授默认不动周期,防
// 「给年费用户随手补 7 天」把年费标识冲掉)。用户不存在(错 id)→ ErrUserNotFound。
func (r *Repository) SetUserVIP(userID uint, tier string, expiresAt *time.Time, cycle string) error {
	updates := map[string]any{"vip_tier": tier, "vip_expires_at": expiresAt}
	if cycle != "" {
		updates["vip_cycle"] = normCycle(cycle)
	}
	res := r.db.Table("users").Where("id = ?", userID).Updates(updates)
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

// GetCodeByID 按主键读一行(续期/加次数后回读最新值返给前端)。未命中回 ErrCodeNotFound。
func (r *Repository) GetCodeByID(id uint64) (*RedemptionCode, error) {
	var rc RedemptionCode
	if err := r.db.Where("id = ?", id).First(&rc).Error; err != nil {
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

// UserRedemptionView 某用户一条兑换记录(兑换流水 join 兑换码定义),供 admin「用户详情」展示。
// Code 是兑换码原文 —— handler 落地前会打码(防仍可多次兑换的有效码经 admin 视图泄漏)。
type UserRedemptionView struct {
	RedeemedAt   time.Time `json:"redeemed_at"`
	Code         string    `json:"code"`
	GrantKind    string    `json:"grant_kind"` // tier | credit
	GrantTier    string    `json:"grant_tier"`
	GrantDays    int       `json:"grant_days"`
	GrantCredits int       `json:"grant_credits"`
	CreditKind   string    `json:"credit_kind"` // temp | perm
	Note         string    `json:"note"`
}

// ListUserRedemptions 列某用户的兑换记录(vip_code_redemptions join vip_redemption_codes),分页 + total。
// 用户面无此读路径(只有 HasUserRedeemed bool),为 admin 用户详情新增。
func (r *Repository) ListUserRedemptions(userID uint, limit, offset int) ([]UserRedemptionView, int64, error) {
	base := r.db.Table("vip_code_redemptions AS cr").
		Joins("JOIN vip_redemption_codes AS c ON c.id = cr.code_id").
		Where("cr.user_id = ?", userID)
	var total int64
	if err := base.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []UserRedemptionView
	if err := base.
		Select("cr.redeemed_at AS redeemed_at, c.code AS code, c.grant_kind AS grant_kind, " +
			"c.grant_tier AS grant_tier, c.grant_days AS grant_days, c.grant_credits AS grant_credits, " +
			"c.credit_kind AS credit_kind, c.note AS note").
		Order("cr.redeemed_at DESC").Limit(limit).Offset(offset).
		Scan(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
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

// ExtendValidUntil 续期:把 valid_until 顺延 days 天。已过期 / 无到期(NULL)的从现在起算
// (GREATEST(COALESCE(valid_until, NOW()), NOW())),仍在期的从原 valid_until 顺延。
// 原子 SQL,时区随 MySQL 服务器(=容器北京时间,与 time.Now() 一致)。影响 0 行回 ErrCodeNotFound。
func (r *Repository) ExtendValidUntil(id uint64, days int) error {
	res := r.db.Model(&RedemptionCode{}).Where("id = ?", id).
		UpdateColumn("valid_until", gorm.Expr("DATE_ADD(GREATEST(COALESCE(valid_until, NOW()), NOW()), INTERVAL ? DAY)", days))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrCodeNotFound
	}
	return nil
}

// AddMaxUses 加次数:max_uses += delta(封顶 capValue)。原子 SQL,影响 0 行回 ErrCodeNotFound。
// 对已用完(used_count>=max_uses)的码加次数即可让其重新可兑,正是该操作的用途。
func (r *Repository) AddMaxUses(id uint64, delta, capValue int) error {
	res := r.db.Model(&RedemptionCode{}).Where("id = ?", id).
		UpdateColumn("max_uses", gorm.Expr("LEAST(max_uses + ?, ?)", delta, capValue))
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrCodeNotFound
	}
	return nil
}

// SetGrantDays 覆盖会员码授予的会员天数(grant_days)。仅限 tier 码(WHERE grant_kind='tier')。
// 兑换在 Redeem 时【实时读取本行 grant_days】(applyMembershipGrant),故改完只影响之后的兑换,
// 已兑换的用户 vip_expires_at 早已落定、不受影响。RowsAffected==0 时区分「不存在」与「非 tier 码」。
func (r *Repository) SetGrantDays(id uint64, days int) error {
	res := r.db.Model(&RedemptionCode{}).
		Where("id = ? AND grant_kind = ?", id, GrantKindTier).
		UpdateColumn("grant_days", days)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		// 没更到:要么 id 不存在,要么该码不是 tier 码。查一次给出精确错误。
		if _, err := r.GetCodeByID(id); err != nil {
			return err // ErrCodeNotFound
		}
		return ErrCodeNotTier
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
			// 0090:临时经费退休 —— 存量 credit_kind='temp' 的旧码**一律按永久发放**,
			// 而不是拒兑。用户手里已发出去的码不能因为我们改模型就作废;
			// 永久比临时对用户只多不少,是安全的降级方向。
			if err := grantPermInTx(tx, userID, rc.GrantCredits, SourceGift, code, TxGift); err != nil {
				return err
			}
			result = &RedeemResult{Kind: GrantKindCredit, Credits: rc.GrantCredits, CreditKind: CreditKindPerm}
			return nil
		}

		// 会员码:单调叠加(不降级 + 在期顺延)。
		// 走 grantMembershipInTx 这个唯一串行化落点 —— 它持 users 行 FOR UPDATE(见其红字:
		// 此前无锁读+整值覆盖会与订阅履约/另一张码互相吃掉授予),并顺手作废在途升级单。
		// vip_cycle 的「防陈旧泄漏」规则也在里面(cycleOverride 传空 = 仅在非在期付费时回落 monthly)。
		newTier, newExpires, prevTier, err := grantMembershipInTx(tx, userID, rc.GrantTier, rc.GrantDays, "", now)
		if err != nil {
			return err
		}
		exp := newExpires
		result = &RedeemResult{
			Kind: GrantKindTier, Tier: newTier, ExpiresAt: &exp,
			// 满血资格在事务内算(此处才拿得到 prevTier 与本码的 grant_days),见 Service.Redeem 红字。
			refillEligible: tierRank(newTier) > tierRank(prevTier) && rc.GrantDays >= r.windowDays(),
		}
		return nil
	})
	return result, err
}
