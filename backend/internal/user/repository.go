// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/storage"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Repository handles database operations for users
type Repository struct {
	db *gorm.DB
}

// NewRepository creates a new user repository
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// nonAdminScope is a reusable GORM scope that excludes admin / super_admin
// accounts from user-facing queries. After the admin-to-users migration every
// row has an explicit role value.
func nonAdminScope(db *gorm.DB) *gorm.DB {
	return db.Where("role NOT IN ?", []string{"admin", "super_admin"})
}

// GetDB returns the database instance
func (r *Repository) GetDB() *gorm.DB {
	return r.db
}

// FindByEmail finds a user by email.
//
// 规范化:所有外部调用者(handler / service / OAuth callback)都 fan-in 到这一处,
// 在仓库层统一 lower + trim,避免每个调用点重复处理 —— 见 utils.NormalizeEmail 注释。
func (r *Repository) FindByEmail(email string) (*User, error) {
	normalized := utils.NormalizeEmail(email)
	if normalized == "" {
		return nil, nil
	}
	var user User
	err := r.db.Where("email = ?", normalized).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

// FindByID finds a user by ID
func (r *Repository) FindByID(id uint) (*User, error) {
	var user User
	err := r.db.First(&user, id).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

// FindByIDs finds users by IDs and returns a map
func (r *Repository) FindByIDs(ids []uint) (map[uint]*User, error) {
	if len(ids) == 0 {
		return make(map[uint]*User), nil
	}

	var users []User
	err := r.db.Where("id IN ?", ids).Find(&users).Error
	if err != nil {
		return nil, err
	}

	result := make(map[uint]*User)
	for i := range users {
		result[users[i].ID] = &users[i]
	}
	return result, nil
}

// FindByUsername finds a user by username
func (r *Repository) FindByUsername(username string) (*User, error) {
	var user User
	err := r.db.Where("username = ?", username).First(&user).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &user, nil
}

// Create creates a new user.
// 持久化前规范化 email,确保数据库里全是规范形式 —— 这样后续 FindByEmail 不会因
// 大小写差异漏查。
func (r *Repository) Create(user *User) error {
	normalizeUserEmail(user)
	return r.db.Create(user).Error
}

// Update updates a user.
// 同 Create:持久化前规范化 email。
//
// 注意:这里走 Save() 是全列回写,**对部分更新场景偏重**。如果只是改 2-3 个字段
// (typical: profile 改 username/avatar/bio; OAuth 回填昵称/头像), 请改用
// UpdatePartial(id, fields), 走 Model+Where+Updates(map) 只写指定列, 避免:
//   - 18+ 列的 UPDATE 语句网络/binlog 开销
//   - 把内存里偶然为零值的字段误覆写 (race 时尤其危险)
//
// 现存 admin 全字段编辑场景仍用 Update 保持语义稳定。
func (r *Repository) Update(user *User) error {
	normalizeUserEmail(user)
	return r.db.Save(user).Error
}

// UpdatePartial 部分更新指定字段(map 形式)。比 Update(struct) 省网络和 binlog,
// 且行为可预期:**只**写 map 里列出的列, 缺席的列不动。
//
// fields 的 key 必须用 GORM 列名(snake_case),如 "username" / "avatar_url" / "bio"。
// 调用方负责规范化 email —— 这个方法不替你处理,避免 caller 误以为它会自动 normalize。
func (r *Repository) UpdatePartial(id uint, fields map[string]any) error {
	if len(fields) == 0 {
		return nil
	}
	return r.db.Model(&User{}).Where("id = ?", id).Updates(fields).Error
}

// normalizeUserEmail 把 user.Email 指针指向的字符串规范化为 lower+trim。
// 空指针 / 空字符串保持原状(允许「无邮箱」用户,例如 WeChat / ORCID 注册)。
func normalizeUserEmail(user *User) {
	if user == nil || user.Email == nil {
		return
	}
	normalized := utils.NormalizeEmail(*user.Email)
	user.Email = &normalized
}

// UpdateLastLogin updates the last login timestamp
func (r *Repository) UpdateLastLogin(id uint) error {
	now := time.Now()
	return r.db.Model(&User{}).Where("id = ?", id).Update("last_login_at", now).Error
}

// UpdateLastLoginWithIP updates the last login timestamp and IP
func (r *Repository) UpdateLastLoginWithIP(id uint, ip string) error {
	now := time.Now()
	return r.db.Model(&User{}).Where("id = ?", id).Updates(map[string]any{
		"last_login_at": now,
		"last_login_ip": ip,
	}).Error
}

// UpdateLastActive 更新「最后活跃时间」(真实使用时间, 0036)。
// 由 service.RecordActivity 在每次鉴权请求节流后异步调用 —— 反映用户最后实际使用,
// 而非仅登录动作(last_login_at)。单列点查 UPDATE, 极轻。
func (r *Repository) UpdateLastActive(id uint) error {
	return r.db.Model(&User{}).Where("id = ?", id).Update("last_active_at", time.Now()).Error
}

// RecordDailyActive 每日活跃台账落行(0069):每(用户,本地日)至多一行,INSERT IGNORE 幂等。
// 由 service.RecordActivity 在每日节流后异步调用 —— 台账 append-only,可重建历史每日活跃序列
// (last_active_at 是单列覆盖做不到)。date 为本地(北京)日 'YYYY-MM-DD',由调用方用 Go 侧
// time.Now() 计算,不用 MySQL CURDATE() 以免会话时区歧义(见 time-handling-no-utc 约定)。
func (r *Repository) RecordDailyActive(id uint, date string) error {
	return r.db.Exec(
		"INSERT IGNORE INTO user_daily_active (user_id, active_date) VALUES (?, ?)",
		id, date,
	).Error
}

// UpdatePassword updates the user's password
func (r *Repository) UpdatePassword(id uint, passwordHash string) error {
	return r.db.Model(&User{}).Where("id = ?", id).Update("password_hash", passwordHash).Error
}

// CreateVerificationCode creates a new verification code.
// 同 user 邮箱:验证码表里也存规范形式,后续 FindVerificationCode 才能查到。
func (r *Repository) CreateVerificationCode(code *EmailVerificationCode) error {
	if code != nil {
		code.Email = utils.NormalizeEmail(code.Email)
	}
	return r.db.Create(code).Error
}

// FindVerificationCode finds a verification code
func (r *Repository) FindVerificationCode(email, code, purpose string) (*EmailVerificationCode, error) {
	var vc EmailVerificationCode
	err := r.db.Where("email = ? AND code = ? AND purpose = ? AND used = false AND expires_at > ?",
		utils.NormalizeEmail(email), code, purpose, time.Now()).First(&vc).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &vc, nil
}

// MarkVerificationCodeAsUsed marks a verification code as used
func (r *Repository) MarkVerificationCodeAsUsed(id uint) error {
	return r.db.Model(&EmailVerificationCode{}).Where("id = ?", id).Update("used", true).Error
}

// CreateAuthProvider creates a new auth provider record
func (r *Repository) CreateAuthProvider(provider *UserAuthProvider) error {
	return r.db.Create(provider).Error
}

// CountAuthProvidersByUser returns the number of 3rd-party providers bound to a user.
// 解绑前用它判断是否会让用户失去最后一个登录方式 —— 见 Service.CountLoginMethods。
func (r *Repository) CountAuthProvidersByUser(userID uint) (int64, error) {
	var count int64
	err := r.db.Model(&UserAuthProvider{}).Where("user_id = ?", userID).Count(&count).Error
	return count, err
}

// ListAuthProvidersByUser returns all 3rd-party providers bound to a user.
// 账号设置「已绑定第三方」列表用。
func (r *Repository) ListAuthProvidersByUser(userID uint) ([]UserAuthProvider, error) {
	var providers []UserAuthProvider
	err := r.db.Where("user_id = ?", userID).Order("created_at ASC").Find(&providers).Error
	return providers, err
}

// FindAuthProvider finds an auth provider
func (r *Repository) FindAuthProvider(provider, providerUserID string) (*UserAuthProvider, error) {
	var ap UserAuthProvider
	err := r.db.Where("provider = ? AND provider_user_id = ?", provider, providerUserID).First(&ap).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &ap, nil
}

// GetTotalUserCount returns the total number of non-admin users
func (r *Repository) GetTotalUserCount() (int64, error) {
	var count int64
	err := r.db.Model(&User{}).Scopes(nonAdminScope).Count(&count).Error
	return count, err
}

// GetUserList returns a paginated list of non-admin users
func (r *Repository) GetUserList(offset, limit int) ([]User, int64, error) {
	var users []User
	var total int64

	if err := r.db.Model(&User{}).Scopes(nonAdminScope).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// id DESC tiebreaker：避免高并发注册时同一秒多用户在 OFFSET 分页中漏页/重复
	err := r.db.Scopes(nonAdminScope).
		Order("created_at DESC, id DESC").
		Offset(offset).
		Limit(limit).
		Find(&users).Error

	return users, total, err
}

var allowedSortColumns = map[string]bool{
	"last_active_at": true, // 最后活跃(真实使用)时间, 运营按此找近期活跃/沉睡用户
	"last_login_at":  true,
	"created_at":     true,
	"vip_expires_at": true, // 按会员到期排序, 便于运营找将到期/已过期
}

// GetUserListWithSort returns a paginated list of non-admin users with sorting.
// sortBy and sortOrder are validated against a whitelist to prevent SQL injection.
func (r *Repository) GetUserListWithSort(offset, limit int, sortBy, sortOrder string) ([]User, int64, error) {
	return r.GetUserListWithFilter(offset, limit, UserListFilter{
		SortBy:    sortBy,
		SortOrder: sortOrder,
	})
}

// UserListFilter aggregates server-side query options for the admin user list.
//
// Semantics:
//   - Q       : LIKE 搜索 username / email / phone
//   - Status  : nil 不过滤；指定值精确匹配 (0/1/-1/2)
//   - Role    : "" 默认**显示全部(含管理员)**；指定值精确匹配 (user/admin/super_admin)
//   - Tier    : "" 不过滤；"pro"=生效 pro(未过期);"free"=其余
//   - EmailVerified : nil 不过滤
//   - CreatedFrom/To: 注册日期范围 (YYYY-MM-DD), 闭区间
//   - SortBy  / SortOrder : 与 GetUserListWithSort 同义，走白名单校验
type UserListFilter struct {
	Q             string
	Status        *int8
	Role          string
	Tier          string
	EmailVerified *bool
	CreatedFrom   string
	CreatedTo     string
	SortBy        string
	SortOrder     string
}

// GetUserListWithFilter returns paginated users with optional search/filter/sort.
// 安全：role/status 走精确匹配避免注入；q 用 LIKE 但参数化 + 转义 % / _。
func (r *Repository) GetUserListWithFilter(offset, limit int, f UserListFilter) ([]User, int64, error) {
	if !allowedSortColumns[f.SortBy] {
		f.SortBy = "last_login_at"
	}
	if f.SortOrder != "asc" && f.SortOrder != "desc" {
		f.SortOrder = "desc"
	}

	query := r.db.Model(&User{})

	// role: 指定就精确匹配;**未指定(或非法)→ 显示全部(含 admin/super_admin)**。
	// (历史默认 nonAdminScope 会让"提升为管理员后该用户从列表消失",且运营根本看不到管理员 —— 已移除该默认。)
	switch f.Role {
	case "user", "admin", "super_admin":
		query = query.Where("role = ?", f.Role)
	}

	if f.Status != nil {
		query = query.Where("status = ?", *f.Status)
	}

	// 会员等级(effective):pro/max = 对应 vip_tier 且未过期;free = 其余(无 / 非付费 / 已过期)。
	// time.Now() 不做 UTC 转换(容器=北京)。**必须含 max** —— 早期只判 'pro' 时,
	// "free" 用的是 vip_tier<>'pro',会把 max 用户错算进 free(列表/筛选都漏 max)。
	switch f.Tier {
	case "pro":
		query = query.Where("vip_tier = 'pro' AND (vip_expires_at IS NULL OR vip_expires_at > ?)", time.Now())
	case "max":
		query = query.Where("vip_tier = 'max' AND (vip_expires_at IS NULL OR vip_expires_at > ?)", time.Now())
	case "free":
		query = query.Where("vip_tier IS NULL OR vip_tier NOT IN ('pro','max') OR (vip_expires_at IS NOT NULL AND vip_expires_at <= ?)", time.Now())
	}

	if f.EmailVerified != nil {
		query = query.Where("email_verified = ?", *f.EmailVerified)
	}
	if f.CreatedFrom != "" {
		query = query.Where("created_at >= ?", f.CreatedFrom+" 00:00:00")
	}
	if f.CreatedTo != "" {
		query = query.Where("created_at <= ?", f.CreatedTo+" 23:59:59")
	}

	// 关键词:ID 精确(纯数字)+ username/email/phone 模糊。全站统一口径(utils.UserSearchClause)。
	if sql, args := utils.UserSearchClause(f.Q, "id", "username", "email", "phone"); sql != "" {
		query = query.Where(sql, args...)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var users []User
	// id DESC tiebreaker：避免 OFFSET 分页在并发场景下漏页/重复
	err := query.Order(f.SortBy + " " + f.SortOrder + ", id DESC").
		Offset(offset).
		Limit(limit).
		Find(&users).Error
	return users, total, err
}

// GetUserAuthProviders returns all auth providers for given user IDs
func (r *Repository) GetUserAuthProviders(userIDs []uint) (map[uint][]UserAuthProvider, error) {
	var providers []UserAuthProvider
	if err := r.db.Where("user_id IN ?", userIDs).Find(&providers).Error; err != nil {
		return nil, err
	}

	// Group by user ID
	result := make(map[uint][]UserAuthProvider)
	for _, p := range providers {
		result[p.UserID] = append(result[p.UserID], p)
	}
	return result, nil
}

// CountUsersSince counts non-admin users created on or after the given date string (YYYY-MM-DD)
func (r *Repository) CountUsersSince(dateStr string) (int64, error) {
	var count int64
	err := r.db.Table("users").Scopes(nonAdminScope).
		Where("DATE(created_at) >= ?", dateStr).
		Count(&count).Error
	return count, err
}

// CountUsersOnDate counts non-admin users created on a specific date (YYYY-MM-DD)
func (r *Repository) CountUsersOnDate(dateStr string) (int64, error) {
	var count int64
	err := r.db.Table("users").Scopes(nonAdminScope).
		Where("DATE(created_at) = ?", dateStr).
		Count(&count).Error
	return count, err
}

// FindByPhone finds a user by phone number
func (r *Repository) FindByPhone(phone string) (*User, error) {
	var user User
	err := r.db.Where("phone = ?", phone).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &user, err
}

// FindAuthProviderByUserAndProvider finds auth provider by user ID and provider type
func (r *Repository) FindAuthProviderByUserAndProvider(userID uint, provider string) (*UserAuthProvider, error) {
	var authProvider UserAuthProvider
	err := r.db.Where("user_id = ? AND provider = ?", userID, provider).First(&authProvider).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &authProvider, err
}

// UpdateAuthProvider updates an auth provider record
func (r *Repository) UpdateAuthProvider(provider *UserAuthProvider) error {
	return r.db.Save(provider).Error
}

// DeleteAuthProvider deletes an auth provider by ID
func (r *Repository) DeleteAuthProvider(id uint) error {
	return r.db.Delete(&UserAuthProvider{}, id).Error
}

// FindAuthProviderByProviderAndProviderUserID finds auth provider by provider type and provider user ID
func (r *Repository) FindAuthProviderByProviderAndProviderUserID(provider, providerUserID string) (*UserAuthProvider, error) {
	var authProvider UserAuthProvider
	err := r.db.Where("provider = ? AND provider_user_id = ?", provider, providerUserID).First(&authProvider).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &authProvider, err
}

// FindAuthProviderByUnionID finds auth provider by provider type and union ID (for WeChat UnionID)
func (r *Repository) FindAuthProviderByUnionID(provider, unionID string) (*UserAuthProvider, error) {
	var authProvider UserAuthProvider
	err := r.db.Where("provider = ? AND provider_union_id = ?", provider, unionID).First(&authProvider).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	return &authProvider, err
}

// DeleteUser 硬删用户 + 一致地清理「无外键级联」的孤儿表。
//
// FK ON DELETE CASCADE 只会带走:user_auth_providers、orders→payment_transactions、
// user_coupons、user_messages、user_invitations、usage_logs 等(见 0001_baseline FK)。
// 以下均**没有 FK**,必须在同一事务里显式清:
//   - 0015 计费表(user_wallets / credit_temp_lots / credit_transactions / vip_code_redemptions)
//     不清则订单审计轨迹被级联删除、但同一笔钱的钱包/账本/兑换流水滞留,两套资金记录互相矛盾;
//   - 文献集(user_library_papers / user_library_folders)与分享三表(library_shares /
//     library_share_papers / library_share_access)—— 不清则「死人分享」永续公开可访问且
//     无人可撤销(owner 已无 RevokeShare 通道),快照表还存着论文全量元数据,属隐私/合规缺口
//     (删除权要求删号连带撤销对外分享)。
//
// MinIO 对象(papers/<uid>/ 前缀的用户上传 PDF)在事务提交后异步 best-effort 清理
// (失败只 warn,残余对象由孤儿对账 reaper 兜底)。
//
// ⚠️ 仍未清理(留作后续决策):peer_review_* / prism_* / user_staging_* 及其对象键、
//
//	agent_sessions 映射与 agent 容器内 jsonl。
func (r *Repository) DeleteUser(userID uint) error {
	err := r.db.Transaction(func(tx *gorm.DB) error {
		// 先清无 FK 的计费孤儿表(顺序无关,均无相互 FK)。用表名直删,避免跨包导入 vip 模型。
		for _, table := range []string{
			"credit_transactions",
			"credit_temp_lots",
			"user_wallets",
			"vip_code_redemptions",
		} {
			if err := tx.Exec("DELETE FROM "+table+" WHERE user_id = ?", userID).Error; err != nil {
				return fmt.Errorf("failed to delete %s: %w", table, err)
			}
		}

		// 分享三表:share_papers/share_access 以 share_id 关联,先按子表删,再删 shares 主行。
		if err := tx.Exec(
			"DELETE sp FROM library_share_papers sp JOIN library_shares s ON sp.share_id = s.id WHERE s.user_id = ?",
			userID).Error; err != nil {
			return fmt.Errorf("failed to delete library_share_papers: %w", err)
		}
		if err := tx.Exec(
			"DELETE sa FROM library_share_access sa JOIN library_shares s ON sa.share_id = s.id WHERE s.user_id = ?",
			userID).Error; err != nil {
			return fmt.Errorf("failed to delete library_share_access: %w", err)
		}
		for _, table := range []string{
			"library_shares",
			"user_library_papers",
			"user_library_folders",
		} {
			if err := tx.Exec("DELETE FROM "+table+" WHERE user_id = ?", userID).Error; err != nil {
				return fmt.Errorf("failed to delete %s: %w", table, err)
			}
		}

		// 删除用户主行(FK ON DELETE CASCADE 带走 auth_providers / orders→payment_transactions / 等)。
		if err := tx.Delete(&User{}, userID).Error; err != nil {
			return fmt.Errorf("failed to delete user: %w", err)
		}

		return nil
	})
	if err != nil {
		return err
	}

	// 事务提交成功后,异步清该用户的 MinIO PDF 对象(papers/<uid>/ 前缀,lifecycle 只盖 tmp/)。
	// best-effort:失败只 warn,不影响删号结果;残余由孤儿 reaper 下一轮兜底。
	safego.Go("user-delete-minio-cleanup", func() {
		if !storage.IsEnabled() {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		bucket := storage.PaperPDFBucket()
		prefix := fmt.Sprintf("papers/%d/", userID)
		keys, err := storage.ListObjectKeys(ctx, bucket, prefix, 0)
		if err != nil {
			slog.Warn("user: 删号清理 MinIO 列举失败", "user_id", userID, "err", err)
		}
		if len(keys) == 0 {
			return
		}
		_ = storage.DeleteObjects(ctx, bucket, keys, func(key string, err error) {
			slog.Warn("user: 删号清理 MinIO 对象失败", "user_id", userID, "key", key, "err", err)
		})
	})

	return nil
}

// ==================== Transaction helper ====================

// ExecuteInTransaction wraps a function in a database transaction,
// providing a transaction-scoped Repository to the callback.
func (r *Repository) ExecuteInTransaction(fn func(txRepo *Repository) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		return fn(NewRepository(tx))
	})
}

// ==================== Cross-table query methods ====================

// CountUsersInTimeRange counts non-admin users created within [start, end).
func (r *Repository) CountUsersInTimeRange(start, end time.Time) (int64, error) {
	var count int64
	err := r.db.Model(&User{}).Scopes(nonAdminScope).
		Where("created_at >= ? AND created_at < ?", start, end).
		Count(&count).Error
	return count, err
}

// ==================== Unbind transaction methods ====================

// UnbindPhoneInTx atomically unbinds phone from a user within a transaction with row locking.
func (r *Repository) UnbindPhoneInTx(userID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", userID).First(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to lock user record: %w", err)
		}

		if lockedUser.Phone == nil || *lockedUser.Phone == "" {
			return errors.New("phone is not bound")
		}

		hasEmail := lockedUser.Email != nil && *lockedUser.Email != ""

		var wechatCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, "wechat").
			Count(&wechatCount).Error; err != nil {
			return fmt.Errorf("failed to check WeChat binding: %w", err)
		}

		if !hasEmail && wechatCount == 0 {
			return errors.New("cannot unbind phone: at least one login method must remain")
		}

		lockedUser.Phone = nil
		lockedUser.PhoneVerified = false
		if err := tx.Save(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to unbind phone: %w", err)
		}

		if err := tx.Where("user_id = ? AND provider = ?", userID, "phone").
			Delete(&UserAuthProvider{}).Error; err != nil {
			return fmt.Errorf("failed to delete phone auth provider: %w", err)
		}

		return nil
	})
}

// UnbindEmailInTx atomically unbinds email from a user within a transaction with row locking.
func (r *Repository) UnbindEmailInTx(userID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", userID).First(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to lock user record: %w", err)
		}

		if lockedUser.Email == nil || *lockedUser.Email == "" {
			return errors.New("email is not bound")
		}

		hasPhone := lockedUser.Phone != nil && *lockedUser.Phone != ""

		var wechatCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, "wechat").
			Count(&wechatCount).Error; err != nil {
			return fmt.Errorf("failed to check WeChat binding: %w", err)
		}

		if !hasPhone && wechatCount == 0 {
			return errors.New("cannot unbind email: at least one login method must remain")
		}

		lockedUser.Email = nil
		lockedUser.EmailVerified = false
		if err := tx.Save(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to unbind email: %w", err)
		}

		if err := tx.Where("user_id = ? AND provider = ?", userID, "email").
			Delete(&UserAuthProvider{}).Error; err != nil {
			return fmt.Errorf("failed to delete email auth provider: %w", err)
		}

		return nil
	})
}

// UnbindWeChatInTx atomically unbinds WeChat from a user within a transaction with row locking.
func (r *Repository) UnbindWeChatInTx(userID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", userID).First(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to lock user record: %w", err)
		}

		var wechatCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, "wechat").
			Count(&wechatCount).Error; err != nil {
			return fmt.Errorf("failed to check WeChat binding: %w", err)
		}

		if wechatCount == 0 {
			return errors.New("WeChat is not bound")
		}

		hasEmail := lockedUser.Email != nil && *lockedUser.Email != ""
		hasPhone := lockedUser.Phone != nil && *lockedUser.Phone != ""

		if !hasEmail && !hasPhone {
			return errors.New("cannot unbind WeChat: at least one login method must remain")
		}

		if err := tx.Where("user_id = ? AND provider = ?", userID, "wechat").
			Delete(&UserAuthProvider{}).Error; err != nil {
			return fmt.Errorf("failed to delete WeChat auth provider: %w", err)
		}

		return nil
	})
}

// UnbindGitHubInTx atomically unbinds GitHub from a user within a transaction with row locking.
func (r *Repository) UnbindGitHubInTx(userID uint) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", userID).First(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to lock user record: %w", err)
		}

		var githubCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, "github").
			Count(&githubCount).Error; err != nil {
			return fmt.Errorf("failed to check GitHub binding: %w", err)
		}

		if githubCount == 0 {
			return errors.New("GitHub is not bound")
		}

		hasEmail := lockedUser.Email != nil && *lockedUser.Email != ""
		hasPhone := lockedUser.Phone != nil && *lockedUser.Phone != ""

		var wechatCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, "wechat").
			Count(&wechatCount).Error; err != nil {
			return fmt.Errorf("failed to check WeChat binding: %w", err)
		}

		if !hasEmail && !hasPhone && wechatCount == 0 {
			return errors.New("cannot unbind GitHub: at least one login method must remain")
		}

		if err := tx.Where("user_id = ? AND provider = ?", userID, "github").
			Delete(&UserAuthProvider{}).Error; err != nil {
			return fmt.Errorf("failed to delete GitHub auth provider: %w", err)
		}

		return nil
	})
}

// UnbindProviderInTx atomically unbinds any OAuth provider from a user.
func (r *Repository) UnbindProviderInTx(userID uint, provider string) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var lockedUser User
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", userID).First(&lockedUser).Error; err != nil {
			return fmt.Errorf("failed to lock user record: %w", err)
		}

		var providerCount int64
		if err := tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider = ?", userID, provider).
			Count(&providerCount).Error; err != nil {
			return fmt.Errorf("failed to check binding: %w", err)
		}
		if providerCount == 0 {
			return fmt.Errorf("%s is not bound", provider)
		}

		hasEmail := lockedUser.Email != nil && *lockedUser.Email != ""
		hasPhone := lockedUser.Phone != nil && *lockedUser.Phone != ""
		var otherProviders int64
		tx.Model(&UserAuthProvider{}).
			Where("user_id = ? AND provider != ?", userID, provider).
			Count(&otherProviders)

		if !hasEmail && !hasPhone && otherProviders == 0 {
			return errors.New("cannot unbind: at least one login method must remain")
		}

		if err := tx.Where("user_id = ? AND provider = ?", userID, provider).
			Delete(&UserAuthProvider{}).Error; err != nil {
			return fmt.Errorf("failed to delete auth provider: %w", err)
		}

		return nil
	})
}
