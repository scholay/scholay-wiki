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
	res := r.db.Model(&InviteCode{}).Where("code = ?", code).
		Updates(map[string]any{
			"open_count":     gorm.Expr("open_count + 1"),
			"last_opened_at": time.Now(),
		})
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

// InsertRegistrationIgnore 用 INSERT IGNORE 落归因流水,返回受影响行数。
// 0 行 = invited_user_id 已归因过(uk_invreg_invited),静默幂等。
func (r *Repository) InsertRegistrationIgnore(row *InviteRegistration) (int64, error) {
	res := r.db.Clauses(clause.Insert{Modifier: "IGNORE"}).Create(row)
	return res.RowsAffected, res.Error
}

// FindRegistrationByInvitedUser 按被邀者查归因行(uk_invreg_invited 唯一);不存在返回 (nil, nil)。
// 供奖励链路兜底:gorm 对 INSERT IGNORE 成功插入会回填自增 id,万一没回填,按唯一键查回。
func (r *Repository) FindRegistrationByInvitedUser(invitedUserID uint) (*InviteRegistration, error) {
	var row InviteRegistration
	err := r.db.Where("invited_user_id = ?", invitedUserID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &row, nil
}

// ─── 邀请奖励(0100)──────────────────────────────────────────────────────

// (CountRewardedToday 已删除:锁外单独取数会诱导「先查后发」的写法,而那正是审计 P1-11 的缺陷。
//  日上限判据现在只存在于 MarkRewardedWithinDailyCap 的事务内部,没有第二个入口。
//  「今天」仍按本地时区起算,口径用行的 created_at —— 发放紧跟归因发生,归因时刻即发放时刻。)

// MarkRewardedWithinDailyCap 在**同一个事务**里做「查当日已奖数 → 抢标记」,并用邀请人的
// users 行锁把同一邀请人的并发发放串行化。返回 (抢到=可发放, 是否因日上限被拒, err)。
//
// 🔴 2026-08-02 计费审计 P1-11:此前是 CountRewardedToday 与 MarkRewarded 两次独立调用,
// 中间没有任何锁 —— 每张邀请注册是**不同的行**,MarkRewarded 的 `rewarded_credits=0` 条件更新
// 只防「同一行被发两次」,完全不防「N 个不同的人同时注册,各自读到 n<cap 后各自抢到自己那一行」。
// cap=5 时并发 5 个注册可以全部发出,日上限形同虚设(默认 invite_reward_credits=0 关着活动,
// 所以今天不可触发;一旦运营开启,单 IP 单机脚本即可复现,authLimit burst=30 远高于所需并发)。
//
// 为什么锁 users 行而不是 invite_registrations:并发流各自更新的是**不同的**注册行,
// 且 `rewarded_credits=0` 的行不会被 `WHERE rewarded_credits>0` 的 SELECT ... FOR UPDATE 命中,
// 想靠间隙锁挡住是不成立的。真正的共享资源是「这个邀请人今天的额度」,那就锁邀请人本身。
func (r *Repository) MarkRewardedWithinDailyCap(inviterUserID uint, regID uint64, amount, dailyCap int) (granted, cappedOut bool, err error) {
	err = r.db.Transaction(func(tx *gorm.DB) error {
		// 同一邀请人的并发发放在此排队。锁的是邀请人,不是被邀请人。
		var lockID uint
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Table("users").Select("id").Where("id = ?", inviterUserID).Scan(&lockID).Error; e != nil {
			return e
		}
		if dailyCap > 0 {
			now := time.Now()
			dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
			var n int64
			if e := tx.Model(&InviteRegistration{}).
				Where("inviter_user_id = ? AND rewarded_credits > 0 AND created_at >= ?", inviterUserID, dayStart).
				Count(&n).Error; e != nil {
				return e
			}
			if n >= int64(dailyCap) {
				cappedOut = true
				return nil
			}
		}
		res := tx.Model(&InviteRegistration{}).
			Where("id = ? AND rewarded_credits = 0", regID).
			UpdateColumn("rewarded_credits", amount)
		if res.Error != nil {
			return res.Error
		}
		granted = res.RowsAffected > 0
		return nil
	})
	return granted, cappedOut, err
}

// MarkRewarded 抢「已发放」标记:WHERE rewarded_credits=0 条件更新,并发/重放下只有一个
// 执行流的 RowsAffected=1(=抢到,允许继续发放);0 = 已被标过,调用方跳过 —— 防双发的物理根。
// **不含日上限**;发放路径请用 MarkRewardedWithinDailyCap(见其红字)。
func (r *Repository) MarkRewarded(id uint64, amount int) (bool, error) {
	res := r.db.Model(&InviteRegistration{}).
		Where("id = ? AND rewarded_credits = 0", id).
		UpdateColumn("rewarded_credits", amount)
	if res.Error != nil {
		return false, res.Error
	}
	return res.RowsAffected > 0, nil
}

// UnmarkRewarded 把 rewarded_credits 回滚成 0(granter 失败的补偿)。
// 不回滚会留下「标了没发」的行:用户奖励被永久吞掉,且统计里多出一笔从未入账的经费。
func (r *Repository) UnmarkRewarded(id uint64) error {
	return r.db.Model(&InviteRegistration{}).Where("id = ?", id).
		UpdateColumn("rewarded_credits", 0).Error
}

// RewardTotalOf 某邀请人累计已获奖励经费(SUM(rewarded_credits))。
func (r *Repository) RewardTotalOf(inviterUserID uint) (int64, error) {
	var total int64
	err := r.db.Model(&InviteRegistration{}).
		Where("inviter_user_id = ?", inviterUserID).
		Select("COALESCE(SUM(rewarded_credits), 0)").
		Scan(&total).Error
	return total, err
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
	if err := r.db.Model(&InviteRegistration{}).
		Select("COALESCE(SUM(rewarded_credits), 0)").Scan(&out.TotalRewardCredits).Error; err != nil {
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
			(SELECT COALESCE(SUM(irr.rewarded_credits), 0) FROM invite_registrations irr
			  WHERE irr.inviter_user_id = ic.user_id) AS reward_credits`).
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
			ir.method, ir.rewarded_credits, ir.created_at`).
		Where("ir.inviter_user_id = ?", inviterUserID).
		Order("ir.created_at DESC").
		Limit(limit).Offset(offset).
		Scan(&rows).Error
	if err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}
