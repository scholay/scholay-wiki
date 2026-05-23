// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/utils"
)

// BindEmail binds an email to an existing user account.
//
// 安全设计:
//   - 首次绑定(user.Email == nil):只需新邮箱的 bind 验证码,证明用户掌控新邮箱
//   - 换绑场景(user.Email 已存在):需要 *两份* 验证码 ——
//       1. 新邮箱的 bind code,证明用户控制新邮箱
//       2. 旧邮箱的 change_email code,证明用户也控制旧邮箱(防止 session 被偷
//          后攻击者把邮箱改到自己的然后走「忘记密码」夺号)
//
// oldEmailCode 在首次绑定场景下可以为空。换绑场景必填。
func (s *Service) BindEmail(ctx context.Context, userID uint, email, code, oldEmailCode string) error {
	// Verify the email code on new email (always required)
	valid, err := cache.VerifyCode(ctx, email, code, "bind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("验证码无效或已过期")
	}

	// First check: validate email availability (pre-verification)
	existing, err := s.repo.FindByEmail(email)
	if err != nil {
		return err
	}
	if existing != nil && existing.ID != userID {
		return errors.New("该邮箱已被其他账号绑定")
	}

	// 取当前 user,判断是首绑还是换绑
	currentUser, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}
	if currentUser == nil {
		return errors.New("用户不存在")
	}
	// 换绑场景:必须验证旧邮箱所有权
	if currentUser.Email != nil && *currentUser.Email != "" && *currentUser.Email != utils.NormalizeEmail(email) {
		if oldEmailCode == "" {
			return errors.New("换绑邮箱需要先验证当前邮箱所有权,请先发送验证码到当前邮箱")
		}
		valid, err := cache.VerifyCode(ctx, *currentUser.Email, oldEmailCode, "change_email")
		if err != nil {
			return fmt.Errorf("failed to verify old email code: %w", err)
		}
		if !valid {
			return errors.New("当前邮箱验证码无效或已过期")
		}
	}

	// Use transaction for atomic binding operation
	return s.repo.ExecuteInTransaction(func(txRepo *Repository) error {
		// Second check: double-check email availability within transaction (concurrency protection)
		existing, err := txRepo.FindByEmail(email)
		if err != nil {
			return err
		}
		if existing != nil && existing.ID != userID {
			return errors.New("该邮箱已被其他账号绑定")
		}

		// Get current user
		user, err := txRepo.FindByID(userID)
		if err != nil {
			return err
		}
		if user == nil {
			return errors.New("用户不存在")
		}

		// Update user email
		user.Email = &email
		user.EmailVerified = true
		if err := txRepo.Update(user); err != nil {
			return err
		}

		// Create or update auth provider entry
		authProvider, err := txRepo.FindAuthProviderByUserAndProvider(userID, "email")
		if err != nil {
			return err
		}

		if authProvider == nil {
			authProvider = &UserAuthProvider{
				UserID:         userID,
				Provider:       "email",
				ProviderUserID: email,
			}
			if err := txRepo.CreateAuthProvider(authProvider); err != nil {
				return err
			}
		} else {
			authProvider.ProviderUserID = email
			if err := txRepo.UpdateAuthProvider(authProvider); err != nil {
				return err
			}
		}

		return nil
	})
}

// ─── OAuth 合并确认流程(merge_token 中间页)─────────────────────────────────
//
// 触发条件:OAuth 回调发现 provider 邮箱已存在于 users 表,且该用户尚未绑过
// 这个 provider。此时不直接合并(可能被滥用劫持账号)而是生成短期 merge_token,
// 让用户在前端二选一:确认合并 / 新建独立账号。
//
// 整套流程的 token 数据形态见 cache.PendingOAuthMerge。

// StartPendingMerge 生成 merge_token 并把 pending 数据写入 Redis。
// 返回 token,供 callback handler 重定向 / JSON 给前端。
func (s *Service) StartPendingMerge(ctx context.Context, m cache.PendingOAuthMerge) (string, error) {
	return cache.SaveOAuthMerge(ctx, m)
}

// GetPendingMerge 拉出 token 对应的 pending 数据,供前端展示「合并到哪个账号」UI。
// 不删除 token —— 删除留给 confirm/cancel 两个终态。
func (s *Service) GetPendingMerge(ctx context.Context, token string) (*cache.PendingOAuthMerge, error) {
	return cache.GetOAuthMerge(ctx, token)
}

// FinalizePendingMerge 是「确认合并」分支:
//   - 取出 pending 数据
//   - 在 user_auth_providers 表里给 TargetUserID 加一行 provider 链接
//   - 删除 token(一次性)
//   - 签发 JWT 并返回 user 让 caller 走标准 OAuth 成功响应
func (s *Service) FinalizePendingMerge(ctx context.Context, token, ip string) (*User, string, error) {
	pending, err := cache.GetOAuthMerge(ctx, token)
	if err != nil {
		return nil, "", err
	}
	if pending == nil {
		return nil, "", errors.New("合并链接已过期或无效,请重新发起第三方登录")
	}

	user, err := s.repo.FindByID(pending.TargetUserID)
	if err != nil {
		return nil, "", err
	}
	if user == nil {
		// 目标账号被并发删除 —— 兜底返错,token 顺手清掉
		_ = cache.DeleteOAuthMerge(ctx, token)
		return nil, "", errors.New("目标账号已不存在")
	}

	ap := &UserAuthProvider{
		UserID:          pending.TargetUserID,
		Provider:        pending.Provider,
		ProviderUserID:  pending.ProviderUserID,
		ProviderUnionID: pending.ProviderUnionID,
		ProviderData:    &pending.ProviderData,
	}
	if err := s.repo.CreateAuthProvider(ap); err != nil {
		// UNIQUE 约束失败说明已经被并发绑定过 —— 视作成功,继续登入
		// 这里不做精细 error 类型判断(GORM 不暴露 mysql 错误码),用错误字符串兜底
		if !strings.Contains(err.Error(), "Duplicate entry") && !strings.Contains(err.Error(), "duplicate key") {
			return nil, "", fmt.Errorf("link provider to user: %w", err)
		}
	}

	_ = cache.DeleteOAuthMerge(ctx, token)
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

	jwtToken, err := s.generateTokenForUser(user, "")
	if err != nil {
		return nil, "", err
	}
	return user, jwtToken, nil
}

// CancelPendingMergeAndCreateUser 是「新建独立账号」分支:
//   - 取出 pending 数据
//   - 用 ProviderData 里的 nickname/avatar/email 建一个全新 user(email 设为 nil
//     避免和 target 冲突 —— 我们就是因为冲突才走到这一步,新号不能再占同 email)
//   - 给新 user 加 provider 链接
//   - 删除 token,签发 JWT 返回
//
// 设计取舍:新建账号「无 email」会让用户后续无法用密码登录(必须靠该 provider)。
// 这是「保留两个独立账号」的代价,前端应在二选一界面明确告知用户。
func (s *Service) CancelPendingMergeAndCreateUser(ctx context.Context, token, ip string) (*User, string, error) {
	pending, err := cache.GetOAuthMerge(ctx, token)
	if err != nil {
		return nil, "", err
	}
	if pending == nil {
		return nil, "", errors.New("合并链接已过期或无效,请重新发起第三方登录")
	}

	// 从 ProviderData 取 display name 当 username
	nickname := pending.ProviderDisplayName
	if nickname == "" {
		nickname = pending.Provider + "_" + pending.ProviderUserID
	}
	// 用户名重复时加时间戳后缀
	existing, _ := s.repo.FindByUsername(nickname)
	if existing != nil {
		nickname = fmt.Sprintf("%s_%d", nickname, time.Now().Unix())
	}
	avatar := pending.ProviderAvatarURL

	user := &User{
		Username:  &nickname,
		AvatarURL: &avatar,
		Role:      "user",
		Status:    1,
		// Email 故意留空 —— 不能用 ProviderEmail(那是 target user 的邮箱,占用中)
	}
	if err := s.repo.Create(user); err != nil {
		return nil, "", fmt.Errorf("create independent user: %w", err)
	}

	ap := &UserAuthProvider{
		UserID:          user.ID,
		Provider:        pending.Provider,
		ProviderUserID:  pending.ProviderUserID,
		ProviderUnionID: pending.ProviderUnionID,
		ProviderData:    &pending.ProviderData,
	}
	if err := s.repo.CreateAuthProvider(ap); err != nil {
		return nil, "", fmt.Errorf("link provider to new user: %w", err)
	}

	_ = cache.DeleteOAuthMerge(ctx, token)
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)
	s.SendWelcomeMessage(user.ID)

	jwtToken, err := s.generateTokenForUser(user, "")
	if err != nil {
		return nil, "", err
	}
	return user, jwtToken, nil
}

// acquireOAuthLock 尝试拿一把分布式锁,等不到就轮询直到 ctx 超时。
// OAuth 回调并发概率低、持有时间短,200ms 重试足够;同时保留 ctx 超时上限避免悬挂。
func (s *Service) acquireOAuthLock(ctx context.Context, key string, ttl time.Duration) bool {
	for {
		ok, _ := cache.TryLock(ctx, key, ttl)
		if ok {
			return true
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(200 * time.Millisecond):
		}
	}
}

// ErrLastLoginMethod 是解绑保护用的 sentinel —— 当用户只剩 1 个登录方式时,
// 拒绝再解绑,否则用户会把自己锁出账号(无法再登入)。
// Handler 层捕获后应返回 400 + 友好提示「请先绑定另一个登录方式」。
var ErrLastLoginMethod = errors.New("不能解绑最后一个登录方式,请先绑定另一个登录方式")

// CountLoginMethods 返回用户当前的登录方式总数。
// 计算规则:邮箱(若绑了)+ 手机(若绑了)+ 每个 user_auth_providers 记录。
// 解绑前 N≥2 才允许执行,N==1 即「最后一个」必须拒绝。
func (s *Service) CountLoginMethods(userID uint) (int, error) {
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return 0, err
	}
	if user == nil {
		return 0, errors.New("用户不存在")
	}
	count := 0
	if user.Email != nil && *user.Email != "" {
		count++
	}
	if user.Phone != nil && *user.Phone != "" {
		count++
	}
	n, err := s.repo.CountAuthProvidersByUser(userID)
	if err != nil {
		return 0, err
	}
	return count + int(n), nil
}

// ensureNotLastLoginMethod 是所有 Unbind* 的前置守卫。
// 在执行任何解绑前调用 —— 当前方法数 ≤ 1 表示这次解绑就是「最后一个」,直接拒绝。
func (s *Service) ensureNotLastLoginMethod(userID uint) error {
	n, err := s.CountLoginMethods(userID)
	if err != nil {
		return err
	}
	if n <= 1 {
		return ErrLastLoginMethod
	}
	return nil
}

// UnbindEmail unbinds email from user account
func (s *Service) UnbindEmail(ctx context.Context, userID uint, code string) error {
	// First get user to verify code (without lock)
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return errors.New("用户不存在")
	}

	// Check if email is bound
	if user.Email == nil || *user.Email == "" {
		return errors.New("尚未绑定邮箱")
	}

	// 解绑保护:不能解绑最后一个登录方式
	if err := s.ensureNotLastLoginMethod(userID); err != nil {
		return err
	}

	// Verify the code before starting transaction
	valid, err := cache.VerifyCode(ctx, *user.Email, code, "unbind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("验证码无效或已过期")
	}

	return s.repo.UnbindEmailInTx(userID)
}

// UnbindWeChat unbinds WeChat from user account
func (s *Service) UnbindWeChat(userID uint) error {
	if err := s.ensureNotLastLoginMethod(userID); err != nil {
		return err
	}
	return s.repo.UnbindWeChatInTx(userID)
}

// UnbindGitHub unbinds GitHub from user account
func (s *Service) UnbindGitHub(userID uint) error {
	if err := s.ensureNotLastLoginMethod(userID); err != nil {
		return err
	}
	return s.repo.UnbindGitHubInTx(userID)
}

// UnbindGoogle unbinds Google from user account
func (s *Service) UnbindGoogle(userID uint) error {
	if err := s.ensureNotLastLoginMethod(userID); err != nil {
		return err
	}
	return s.repo.UnbindProviderInTx(userID, "google")
}

// UnbindDiscourse unbinds Discourse from user account
func (s *Service) UnbindDiscourse(userID uint) error {
	if err := s.ensureNotLastLoginMethod(userID); err != nil {
		return err
	}
	return s.repo.UnbindProviderInTx(userID, "discourse")
}

// LoginOrRegisterWithWeChat handles WeChat login or registration.
//
// 并发保护:WeChat 回调短时间内可能因网络抖动 / 客户端重试触发两次,导致重复
// 建号(无 email 走查重比较弱)。这里以 openID / unionID 为 key 加分布式锁,
// 同一 WeChat 账号同一时间只允许一个回调进入下面的查/建逻辑。
//
// 锁拿不到 (5s 等不到 → 极少见,通常 < 200ms) 直接返错,前端引导用户重试。
func (s *Service) LoginOrRegisterWithWeChat(openID, unionID, nickname, avatarURL, ip, invitationCode string) (*User, string, bool, error) {
	_ = invitationCode // 邀请业务已移除，参数保留以兼容前端传参

	// 锁 key 用 unionID(若有,跨 app 同一人)否则 openID。
	lockKey := "wechat-login:" + unionID
	if unionID == "" {
		lockKey = "wechat-login:" + openID
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if !s.acquireOAuthLock(ctx, lockKey, 5*time.Second) {
		return nil, "", false, errors.New("登录处理中,请稍后重试")
	}
	defer cache.Unlock(context.Background(), lockKey)

	var authProvider *UserAuthProvider
	var err error

	// Priority 1: Try to find by unionID if available (for users who have it)
	if unionID != "" {
		authProvider, err = s.repo.FindAuthProviderByUnionID("wechat", unionID)
		if err != nil {
			return nil, "", false, err
		}
	}

	// Priority 2: If not found by unionID, try by openID (for backward compatibility)
	if authProvider == nil {
		authProvider, err = s.repo.FindAuthProviderByProviderAndProviderUserID("wechat", openID)
		if err != nil {
			return nil, "", false, err
		}
	}

	isNewUser := false

	if authProvider != nil {
		// Existing user - login
		user, err := s.repo.FindByID(authProvider.UserID)
		if err != nil {
			return nil, "", false, err
		}

		if user == nil {
			return nil, "", false, errors.New("用户不存在")
		}

		// Check if user is active
		if user.Status != 1 {
			return nil, "", false, errors.New("账号已被停用")
		}

		// Update last login time and IP
		_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

		// Update unionID if it's not set (migration for old records)
		if authProvider.ProviderUnionID == nil && unionID != "" {
			authProvider.ProviderUnionID = &unionID
			_ = s.repo.UpdateAuthProvider(authProvider)
		}

		// Generate JWT token
		token, err := s.generateTokenForUser(user, "")
		if err != nil {
			return nil, "", false, err
		}

		return user, token, isNewUser, nil
	}

	// New user - register
	isNewUser = true

	// Create user with WeChat info
	user := &User{
		Username:  &nickname,
		AvatarURL: &avatarURL,
		Role:      "user",
		Status:    1,
	}

	if err := s.repo.Create(user); err != nil {
		return nil, "", false, err
	}

	// Update last login time and IP (registration counts as first login)
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

	s.SendWelcomeMessage(user.ID)

	// Create auth provider entry
	providerData := map[string]string{
		"nickname":   nickname,
		"avatar_url": avatarURL,
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	var unionIDPtr *string
	if unionID != "" {
		unionIDPtr = &unionID
	}

	authProvider = &UserAuthProvider{
		UserID:          user.ID,
		Provider:        "wechat",
		ProviderUserID:  openID, // openID 作为主要标识
		ProviderUnionID: unionIDPtr, // UnionID 作为跨应用标识
		ProviderData:    &providerDataJSON,
	}

	if err := s.repo.CreateAuthProvider(authProvider); err != nil {
		return nil, "", false, err
	}

	// Generate JWT token
	token, err := s.generateTokenForUser(user, "")
	if err != nil {
		return nil, "", false, err
	}

	return user, token, isNewUser, nil
}

// BindWeChat binds a WeChat account to an existing user
func (s *Service) BindWeChat(userID uint, openID, unionID, nickname, avatarURL string) error {
	// Check if WeChat is already bound to another user (check both openID and unionID)
	existing, err := s.repo.FindAuthProviderByProviderAndProviderUserID("wechat", openID)
	if err != nil {
		return err
	}

	if existing != nil && existing.UserID != userID {
		return errors.New("该微信账号已被其他账号绑定")
	}

	// Also check by unionID if available
	if unionID != "" {
		existingByUnionID, err := s.repo.FindAuthProviderByUnionID("wechat", unionID)
		if err != nil {
			return err
		}
		if existingByUnionID != nil && existingByUnionID.UserID != userID {
			return errors.New("该微信账号已被其他账号绑定")
		}
	}

	// Get current user
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}

	if user == nil {
		return errors.New("用户不存在")
	}

	// Update username and avatar if not set
	if user.Username == nil || *user.Username == "" {
		user.Username = &nickname
	}
	if user.AvatarURL == nil || *user.AvatarURL == "" {
		user.AvatarURL = &avatarURL
	}

	if err := s.repo.Update(user); err != nil {
		return err
	}

	// Create or update auth provider entry
	authProvider, err := s.repo.FindAuthProviderByUserAndProvider(userID, "wechat")
	if err != nil {
		return err
	}

	// Prepare provider data
	providerData := map[string]string{
		"nickname":   nickname,
		"avatar_url": avatarURL,
	}
	providerDataBytes, _ := json.Marshal(providerData)
	providerDataJSON := string(providerDataBytes)

	var unionIDPtr *string
	if unionID != "" {
		unionIDPtr = &unionID
	}

	if authProvider == nil {
		// Create new auth provider
		authProvider = &UserAuthProvider{
			UserID:          userID,
			Provider:        "wechat",
			ProviderUserID:  openID,
			ProviderUnionID: unionIDPtr,
			ProviderData:    &providerDataJSON,
		}
		if err := s.repo.CreateAuthProvider(authProvider); err != nil {
			return err
		}
	} else {
		// Update existing auth provider
		authProvider.ProviderUserID = openID
		authProvider.ProviderUnionID = unionIDPtr
		authProvider.ProviderData = &providerDataJSON
		if err := s.repo.UpdateAuthProvider(authProvider); err != nil {
			return err
		}
	}

	return nil
}

// BindEmailWithPassword binds email to WeChat-registered user with new password
func (s *Service) BindEmailWithPassword(ctx context.Context, userID uint, email, password, code string) error {
	// Verify the email code using Redis
	valid, err := cache.VerifyCode(ctx, email, code, "bind")
	if err != nil {
		return fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return errors.New("验证码无效或已过期")
	}

	// Check if email is already used by another user
	existing, err := s.repo.FindByEmail(email)
	if err != nil {
		return err
	}

	if existing != nil && existing.ID != userID {
		return errors.New("该邮箱已被其他账号绑定")
	}

	// Get current user
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}

	if user == nil {
		return errors.New("用户不存在")
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return err
	}

	// Update user email and password
	user.Email = &email
	user.EmailVerified = true
	user.PasswordHash = &hashedPassword

	if err := s.repo.Update(user); err != nil {
		return err
	}

	// Create or update auth provider entry
	authProvider, err := s.repo.FindAuthProviderByUserAndProvider(userID, "email")
	if err != nil {
		return err
	}

	if authProvider == nil {
		// Create new auth provider
		authProvider = &UserAuthProvider{
			UserID:         userID,
			Provider:       "email",
			ProviderUserID: email,
		}
		if err := s.repo.CreateAuthProvider(authProvider); err != nil {
			return err
		}
	} else {
		// Update existing auth provider
		authProvider.ProviderUserID = email
		if err := s.repo.UpdateAuthProvider(authProvider); err != nil {
			return err
		}
	}

	return nil
}
