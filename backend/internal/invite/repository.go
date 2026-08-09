// ============================================================================
// invite Repository —— invite_codes / invite_registrations 的数据库操作。
// ============================================================================

package invite

import (
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"scholar-backend/internal/common/utils"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) DB() *gorm.DB { return r.db }

// GetCampaignConfig 读邀请活动单行真源(id=1)。迁移保证该行存在。
func (r *Repository) GetCampaignConfig() (*CampaignConfig, error) {
	var cfg CampaignConfig
	err := r.db.Where("id = 1").First(&cfg).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &cfg, nil
}

// UpdateCampaignConfig 显式列更新，使 false/0 也能被正确保存。
func (r *Repository) UpdateCampaignConfig(cfg *CampaignConfig) error {
	if cfg == nil {
		return errors.New("invite: nil campaign config")
	}
	cfg.ID = 1
	updates := map[string]any{
		"enabled":                      cfg.Enabled,
		"inviter_registration_credits": cfg.InviterRegistrationCredits,
		"invitee_registration_credits": cfg.InviteeRegistrationCredits,
		"registration_daily_cap":       cfg.RegistrationDailyCap,
		"bind_window_days":             cfg.BindWindowDays,
		"first_purchase_window_days":   cfg.FirstPurchaseWindowDays,
		"first_purchase_rebate_bps":    cfg.FirstPurchaseRebateBPS,
		"code_help_url":                cfg.CodeHelpURL,
		"updated_at":                   time.Now(),
	}
	res := r.db.Model(&CampaignConfig{}).Where("id = 1").Updates(updates)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected > 0 {
		return nil
	}
	var n int64
	if err := r.db.Model(&CampaignConfig{}).Where("id = 1").Count(&n).Error; err != nil {
		return err
	}
	if n > 0 {
		return nil // 新值与库内完全相同，clientFoundRows=false 下 RowsAffected=0。
	}
	return r.db.Create(cfg).Error
}

type activeInviteCode struct {
	InviteCode
	InviterStatus    int8      `gorm:"column:inviter_status"`
	InviterCreatedAt time.Time `gorm:"column:inviter_created_at"`
	InviterEmail     string    `gorm:"column:inviter_email"`
	InviterName      string    `gorm:"column:inviter_name"`
}

// FindActiveCode 只把「码在 + 邀请人账号在 + status=1」当成可用码。
// 不信任 invite_codes 中的孤儿行，preview/bind 的失效回答也不区分原因。
func (r *Repository) FindActiveCode(code string) (*activeInviteCode, error) {
	var row activeInviteCode
	err := r.db.Table("invite_codes AS ic").
		Joins("JOIN users u ON u.id = ic.user_id AND u.status = 1").
		Select(`ic.*, u.status AS inviter_status, u.created_at AS inviter_created_at,
			COALESCE(u.email, '') AS inviter_email, COALESCE(u.username, '') AS inviter_name`).
		Where("ic.code = ? AND ic.is_active = 1", code).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// FindByUserID 按邀请人查邀请码;不存在返回 (nil, nil)。
func (r *Repository) FindByUserID(userID uint) (*InviteCode, error) {
	var row InviteCode
	err := r.db.Where("user_id = ?", userID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// FindByCode 按码查邀请码行;不存在返回 (nil, nil)。
func (r *Repository) FindByCode(code string) (*InviteCode, error) {
	var row InviteCode
	err := r.db.Where("code = ?", code).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// InsertCodeIgnore 用 INSERT IGNORE 插入邀请码,返回受影响行数。
// 0 行 = 被唯一键吞掉:要么该 user 已有码(并发双开),要么撞了别人的 code —— 调用方
// (Service.GetOrCreate)据「查回 user_id」区分并决定复用还是换码重试,天然防并发双码。
func (r *Repository) InsertCodeIgnore(row *InviteCode) (int64, error) {
	res := r.db.Clauses(clause.Insert{Modifier: "IGNORE"}).Create(row)
	return res.RowsAffected, res.Error
}

// IncrementOpen 原子 +1 打开计数并刷新 last_opened_at;返回码是否存在。
// 单条 UPDATE,无读-改-写窗口,并发安全。
func (r *Repository) IncrementOpen(code string) (bool, error) {
	res := r.db.Exec(`UPDATE invite_codes ic
		JOIN users u ON u.id = ic.user_id AND u.status = 1
		SET ic.open_count = ic.open_count + 1, ic.last_opened_at = ?
		WHERE ic.code = ? AND ic.is_active = 1`, time.Now(), code)
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

// ─── 邀请奖励(0100)──────────────────────────────────────────────────────

// 0118 起幂等真源是 milestone/grant/reversal，旧 rewarded_credits 只供列表兼容。

// RewardTotalOf 某邀请人通过自己邀请关系累计保留的净奖励。
// 只统计 beneficiary_role=inviter，不把该用户作为别人的 invitee 收到的受邀礼
// 错算成“我的邀请收益”；并减去退款时真正从钱包收回的返利。
// shortfall 是平台承担、没有扣到用户的部分，不得从净收益再减一次。
func (r *Repository) RewardTotalOf(userID uint) (int64, error) {
	var gross, reclaimed int64
	if err := r.db.Table("invite_reward_grants AS g").
		Joins("JOIN invite_milestones m ON m.id = g.milestone_id").
		Joins("JOIN invite_registrations ir ON ir.id = m.registration_id").
		Where("ir.inviter_user_id = ? AND g.beneficiary_role = 'inviter'", userID).
		Select("COALESCE(SUM(g.amount_credits), 0)").
		Scan(&gross).Error; err != nil {
		return 0, err
	}
	if err := r.db.Table("invite_reward_reversals AS rv").
		Joins("JOIN invite_reward_grants g ON g.id = rv.grant_id").
		Joins("JOIN invite_milestones m ON m.id = g.milestone_id").
		Joins("JOIN invite_registrations ir ON ir.id = m.registration_id").
		Where("ir.inviter_user_id = ? AND g.beneficiary_role = 'inviter'", userID).
		Select("COALESCE(SUM(rv.reclaimed_credits), 0)").
		Scan(&reclaimed).Error; err != nil {
		return 0, err
	}
	if reclaimed >= gross {
		return 0, nil
	}
	return gross - reclaimed, nil
}

// CountRegistrations 某邀请人名下的归因注册数。
func (r *Repository) CountRegistrations(inviterUserID uint) (int64, error) {
	var n int64
	err := r.db.Model(&InviteRegistration{}).
		Where("inviter_user_id = ?", inviterUserID).Count(&n).Error
	return n, err
}

// ─── 管理端查询 ──────────────────────────────────────────────────────────

// Summary 五个汇总数(0100 起含累计奖励)。每条 COUNT/SUM 都显式检查 error,失败即返回 —— 不静默吞成 0
// (「0 个邀请人」和「查询挂了」是两回事,后台看板不能把故障演成没数据)。
func (r *Repository) Summary() (*AdminSummary, error) {
	var out AdminSummary
	if err := r.db.Model(&InviteCode{}).Count(&out.InviterCount).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&InviteCode{}).
		Select("COALESCE(SUM(open_count), 0)").Scan(&out.TotalOpens).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&InviteRegistration{}).Count(&out.TotalRegistrations).Error; err != nil {
		return nil, err
	}
	// 近 7 天口径走全站唯一实现(审计 P1-15):原来是未对齐零点的 -7,既多回看一天、
	// 最旧那天又被当前钟点截断,同一天内反复刷新数字会缩水。
	since := utils.WindowCutoff(7)
	if err := r.db.Model(&InviteRegistration{}).
		Where("created_at >= ?", since).Count(&out.Registrations7d).Error; err != nil {
		return nil, err
	}
	if err := r.db.Model(&InviteRewardGrant{}).
		Select("COALESCE(SUM(amount_credits), 0)").Scan(&out.TotalRewardCredits).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

// listBase 邀请人列表的公共查询体(计数与取页共用,保证口径一致)。
// LEFT JOIN:邀请人被删号后行仍保留(流水是历史事实),email/name 置空串。
func (r *Repository) listBase(keyword string) *gorm.DB {
	q := r.db.Table("invite_codes AS ic").
		Joins("LEFT JOIN users u ON u.id = ic.user_id")
	if keyword != "" {
		like := "%" + keyword + "%"
		q = q.Where("u.email LIKE ? OR u.username LIKE ? OR ic.code LIKE ?", like, like, like)
	}
	return q
}

// List 邀请人分页列表(keyword 模糊 email/name/code)。registered_count 用相关子查询,
// 避免 GROUP BY 全表聚合;列表页最多 pageSize 次子查询,均为 idx_invreg_inviter_created 命中。
func (r *Repository) List(keyword string, limit, offset int) ([]AdminInviteRow, int64, error) {
	var total int64
	if err := r.listBase(keyword).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	// admin DTO 数组必须显式初始化 —— nil slice JSON 序列化成 null 会崩前端(仓库铁律)。
	rows := make([]AdminInviteRow, 0)
	err := r.listBase(keyword).
		Select(`ic.user_id,
			COALESCE(u.email, '')    AS email,
			COALESCE(u.username, '') AS name,
			ic.code, ic.created_at, ic.open_count,
			(SELECT COUNT(*) FROM invite_registrations ir
			  WHERE ir.inviter_user_id = ic.user_id) AS registered_count,
			(SELECT COALESCE(SUM(irg.amount_credits), 0)
			   FROM invite_reward_grants irg
			   JOIN invite_milestones im ON im.id = irg.milestone_id
			   JOIN invite_registrations irr ON irr.id = im.registration_id
			  WHERE irr.inviter_user_id = ic.user_id AND irg.beneficiary_role = 'inviter') AS reward_credits`).
		Order("ic.created_at DESC").
		Limit(limit).Offset(offset).
		Scan(&rows).Error
	if err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// RegistrationsOf 某邀请人带来的注册明细(分页,新→旧)。
// LEFT JOIN:被邀请用户删号后流水仍展示(email/name 空串)。
func (r *Repository) RegistrationsOf(inviterUserID uint, limit, offset int) ([]AdminRegistrationRow, int64, error) {
	var total int64
	if err := r.db.Model(&InviteRegistration{}).
		Where("inviter_user_id = ?", inviterUserID).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	rows := make([]AdminRegistrationRow, 0) // 显式 [],同上铁律
	err := r.db.Table("invite_registrations AS ir").
		Joins("LEFT JOIN users u ON u.id = ir.invited_user_id").
		Select(`ir.invited_user_id,
			COALESCE(u.email, '')    AS email,
			COALESCE(u.username, '') AS name,
			ir.method, ir.source, ir.bound_at, ir.rewarded_credits, ir.created_at,
			(SELECT COALESCE(SUM(g.amount_credits), 0)
			   FROM invite_milestones m JOIN invite_reward_grants g ON g.milestone_id = m.id
			  WHERE m.registration_id = ir.id AND m.milestone_type = 'registration'
			    AND g.beneficiary_role = 'inviter') AS inviter_registration_credits,
			(SELECT COALESCE(SUM(g.amount_credits), 0)
			   FROM invite_milestones m JOIN invite_reward_grants g ON g.milestone_id = m.id
			  WHERE m.registration_id = ir.id AND m.milestone_type = 'registration'
			    AND g.beneficiary_role = 'invitee') AS invitee_registration_credits,
			(SELECT COALESCE(m.purchase_amount_cents, 0) FROM invite_milestones m
			  WHERE m.registration_id = ir.id AND m.milestone_type = 'first_purchase' LIMIT 1) AS first_purchase_paid_cents,
			(SELECT COALESCE(SUM(g.amount_credits), 0)
			   FROM invite_milestones m JOIN invite_reward_grants g ON g.milestone_id = m.id
			  WHERE m.registration_id = ir.id AND m.milestone_type = 'first_purchase'
			    AND g.beneficiary_role = 'inviter') AS first_purchase_rebate_credits,
			(SELECT COALESCE(SUM(rv.reclaimed_credits), 0)
			   FROM invite_milestones m JOIN invite_reward_grants g ON g.milestone_id = m.id
			   JOIN invite_reward_reversals rv ON rv.grant_id = g.id
			  WHERE m.registration_id = ir.id AND m.milestone_type = 'first_purchase'
			    AND g.beneficiary_role = 'inviter') AS first_purchase_reversed_credits,
			(SELECT COALESCE(SUM(rv.shortfall_credits), 0)
			   FROM invite_milestones m JOIN invite_reward_grants g ON g.milestone_id = m.id
			   JOIN invite_reward_reversals rv ON rv.grant_id = g.id
			  WHERE m.registration_id = ir.id AND m.milestone_type = 'first_purchase'
			    AND g.beneficiary_role = 'inviter') AS first_purchase_reversal_shortfall,
			(SELECT COALESCE(m.trigger_order_no, '') FROM invite_milestones m
			  WHERE m.registration_id = ir.id AND m.milestone_type = 'first_purchase' LIMIT 1) AS first_purchase_order_no,
			(SELECT m.occurred_at FROM invite_milestones m
			  WHERE m.registration_id = ir.id AND m.milestone_type = 'first_purchase' LIMIT 1) AS first_purchase_paid_at`).
		Where("ir.inviter_user_id = ?", inviterUserID).
		Order("ir.created_at DESC").
		Limit(limit).Offset(offset).
		Scan(&rows).Error
	if err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}
