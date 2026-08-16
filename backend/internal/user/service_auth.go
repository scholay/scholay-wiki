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
	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"
	"time"

	mysqldriver "github.com/go-sql-driver/mysql"
)

// 注:历史上这里有个 isPrivilegedRole 闸门,把 admin/super_admin 挡在用户端登录/改密之外
// (那时管理员走独立的 5455 后台)。5455 后台已下线,现在管理员与普通用户**共用** 5411
// 这一套登录入口 —— 管理员也必须能从 /user/login 登入、登入后凭 role=admin token 进 /admin
// (前端 adminGuard 校验角色)。因此该闸门已移除。原 2.5 担心的「经用户面爆破 OTP 改管理员
// 密码」由验证码失败计数(cache.VerifyCode)+ 限流可信代理修复(SetTrustedProxies)兜底。

// dummyBcryptHash 用于「账号不存在 / 未设密码」时也跑一次 bcrypt 比较,把登录响应耗时抹平
// 到与「账号存在但密码错」一致,堵住「响应快 = 该邮箱/手机号未注册」的时间侧信道枚举。
// 包加载时算一次;万一算失败(返回 ""),CheckPassword 仍安全返回 false,只是少了恒定耗时保护。
var dummyBcryptHash, _ = utils.HashPassword("scholay-constant-time-dummy")

func isDuplicateUserIdentity(err error) bool {
	var mysqlErr *mysqldriver.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == 1062
}

// SendWelcomeMessage 发送新用户欢迎站内信
func (s *Service) SendWelcomeMessage(userID uint) {
	if s.messageService == nil {
		return
	}

	// 欢迎语给「现在能做什么」而不是纯寒暄 —— 新用户读完这一条就该知道从哪儿下手。
	// 口径依据:论文检索与文献管理不限次不耗额度,AI 能力走额度(Free 档即可体验)。
	title := "欢迎加入 " + utils.EmailBrandName
	content := "论文检索与文献管理不限次数;智能搜论文、AI 审稿等 AI 功能均可直接使用。"

	safego.Go("user-welcome-message", func() {
		if err := s.messageService.SendToUser(userID, title, content, "system", "/", "开始检索"); err != nil {
			slog.Error("failed to send welcome message", "user_id", userID, "err", err)
		}
	})
}

// RegisterWithEmail registers a new user with email and password
// Enhanced with transaction support for concurrency safety
func (s *Service) RegisterWithEmail(ctx context.Context, email, password, code, ip string) (*User, string, error) {
	return s.RegisterWithEmailAndInvitation(ctx, email, password, code, "", ip)
}

// RegisterWithEmailAndInvitation registers a new user with email, password and optional invitation code
func (s *Service) RegisterWithEmailAndInvitation(ctx context.Context, email, password, code, invitationCode, ip string) (*User, string, error) {
	_ = invitationCode // 旧 body 字段仅兼容；归因真源是 middleware/OAuth state 恢复的 X-Invite-Code ctx。

	// Verify the email code using Redis (only if code is provided)
	if code != "" {
		valid, err := cache.VerifyCode(ctx, email, code, "register")
		if err != nil {
			return nil, "", fmt.Errorf("failed to verify code: %w", err)
		}
		if !valid {
			return nil, "", errors.New("验证码无效或已过期")
		}
	}

	// First check: validate email availability (pre-verification)
	existing, err := s.repo.FindByEmail(email)
	if err != nil {
		return nil, "", err
	}
	if existing != nil {
		return nil, "", errors.New("该邮箱已注册,请直接登录")
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(password)
	if err != nil {
		return nil, "", err
	}

	var user *User
	var token string

	// Use transaction for atomic registration
	err = s.repo.ExecuteInTransaction(func(txRepo *Repository) error {
		// Second check: double-check email availability within transaction (concurrency protection)
		existing, err := txRepo.FindByEmail(email)
		if err != nil {
			return err
		}
		if existing != nil {
			return errors.New("该邮箱已注册,请直接登录")
		}

		// Generate random username
		username, err := s.generateRandomUsername()
		if err != nil {
			return fmt.Errorf("failed to generate username: %w", err)
		}

		// Create user
		user = &User{
			Email:         &email,
			Username:      &username,
			PasswordHash:  &hashedPassword,
			Role:          "user",
			Status:        1,
			EmailVerified: true,
		}

		if err := txRepo.Create(user); err != nil {
			return err
		}

		// Update last login time and IP (registration counts as first login)
		_ = txRepo.UpdateLastLoginWithIP(user.ID, ip)

		// Create auth provider record
		authProvider := &UserAuthProvider{
			UserID:         user.ID,
			Provider:       "email",
			ProviderUserID: email,
		}
		if err := txRepo.CreateAuthProvider(authProvider); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, "", err
	}

	// 邀请归因(best-effort):事务已提交、新用户已存在;失败只记日志,绝不影响注册返回。
	notifyInviteRegistered(ctx, user.ID, "email")

	// Generate JWT token
	tokenUsername := email
	if user.Username != nil {
		tokenUsername = *user.Username
	}
	token, err = s.generateTokenForUser(user, tokenUsername)
	if err != nil {
		return nil, "", err
	}

	// 发送欢迎站内信
	s.SendWelcomeMessage(user.ID)

	return user, token, nil
}

// LoginWithEmail logs in a user with email and password
func (s *Service) LoginWithEmail(email, password, ip string) (*User, string, error) {
	user, err := s.repo.FindByEmail(email)
	if err != nil {
		return nil, "", err
	}

	// 统一口径 + 恒定耗时:无论账号是否存在,都先跑一次 bcrypt(不存在/无密码则比对 dummy hash),
	// 再把「不存在 / 未设密码 / 密码错」全部收敛成同一句「邮箱或密码错误」。
	// 这样既不靠错误文案、也不靠响应快慢泄露「某邮箱是否注册」(防账号枚举)。
	// 管理员/超管不再特殊处理:与普通用户共用本登录入口,登入后凭 role=admin token 进 /admin。
	hash := dummyBcryptHash
	if user != nil && user.PasswordHash != nil {
		hash = *user.PasswordHash
	}
	passwordOK := utils.CheckPassword(password, hash)
	if user == nil || user.PasswordHash == nil || !passwordOK {
		return nil, "", errors.New("邮箱或密码错误")
	}

	// 密码正确后才区分停用 —— 此时对方已证明掌控账号,可如实告知,不构成枚举。
	if user.Status != 1 {
		return nil, "", errors.New("账号已被停用")
	}

	// Update last login time and IP
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

	// Generate JWT token
	username := email
	if user.Username != nil {
		username = *user.Username
	}
	token, err := s.generateTokenForUser(user, username)
	if err != nil {
		return nil, "", err
	}

	return user, token, nil
}

// ResetPassword resets user password with email verification code.
// 返回 userID 供 handler 调 utils.RevokeUserAllTokens 踢掉该用户所有在用 token。
func (s *Service) ResetPassword(ctx context.Context, email, code, newPassword string) (uint, error) {
	// Verify the code
	valid, err := cache.VerifyCode(ctx, email, code, "reset_password")
	if err != nil {
		return 0, fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return 0, errors.New("验证码无效或已过期")
	}

	// Find user by email
	user, err := s.repo.FindByEmail(email)
	if err != nil {
		return 0, err
	}
	// 验证码已校验通过 = 已证明掌控该邮箱(攻击者拿不到别人邮箱的码,错 5 次即烧码),
	// 因此如实告知「未注册」不构成账号枚举,反而让走「忘记密码」却其实没注册的用户不再一头雾水。
	if user == nil {
		return 0, errors.New("该邮箱未注册,请先注册")
	}

	// Hash new password
	hashedPassword, err := utils.HashPassword(newPassword)
	if err != nil {
		return 0, fmt.Errorf("failed to hash password: %w", err)
	}

	if err := s.repo.UpdatePassword(user.ID, hashedPassword); err != nil {
		return 0, err
	}
	return user.ID, nil
}

// LoginWithEmailCode logs in a user with email and verification code
func (s *Service) LoginWithEmailCode(ctx context.Context, email, code, ip string) (*User, string, bool, error) {
	// Verify the code
	valid, err := cache.VerifyCode(ctx, email, code, "login")
	if err != nil {
		return nil, "", false, fmt.Errorf("failed to verify code: %w", err)
	}
	if !valid {
		return nil, "", false, errors.New("验证码无效或已过期")
	}

	// Find user by email
	user, err := s.repo.FindByEmail(email)
	if err != nil {
		return nil, "", false, err
	}
	// 未注册 → 自动注册并直接登录:验证码已证明掌控该邮箱,门槛与独立注册流等同
	// (Turnstile + 验证码 + 限流均已在上游通过),免去「先注册再登录」两步。
	if user == nil {
		return s.autoRegisterEmail(ctx, email, ip)
	}

	if user.Status != 1 {
		return nil, "", false, errors.New("账号已被停用")
	}

	// Update last login time and IP
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)

	// Generate JWT token
	username := email
	if user.Username != nil {
		username = *user.Username
	}
	token, err := s.generateTokenForUser(user, username)
	if err != nil {
		return nil, "", false, err
	}

	return user, token, false, nil
}

// autoRegisterEmail 在「验证码登录时邮箱尚未注册」时自动建号并登录。
// 调用方已校验验证码(证明掌控该邮箱)+ Turnstile,故此处不再二次校验码;创建的是**无密码**账号
// (与 OAuth 账号一致,后续可经改密设置),邮箱置为已验证、账号 active。
// 并发下若被同邮箱请求抢先建号,事务内回退为复用既有账号(不报错、不重复发欢迎)。
func (s *Service) autoRegisterEmail(ctx context.Context, email, ip string) (*User, string, bool, error) {
	var user *User
	var created bool
	err := s.repo.ExecuteInTransaction(func(txRepo *Repository) error {
		existing, err := txRepo.FindByEmail(email)
		if err != nil {
			return err
		}
		if existing != nil {
			user = existing // 并发抢先建号 → 复用登录
			return nil
		}
		username, err := s.generateRandomUsername()
		if err != nil {
			return fmt.Errorf("failed to generate username: %w", err)
		}
		user = &User{
			Email:         &email,
			Username:      &username,
			Role:          "user",
			Status:        1,
			EmailVerified: true,
		}
		if err := txRepo.Create(user); err != nil {
			return err
		}
		_ = txRepo.UpdateLastLoginWithIP(user.ID, ip)
		if err := txRepo.CreateAuthProvider(&UserAuthProvider{
			UserID:         user.ID,
			Provider:       "email",
			ProviderUserID: email,
		}); err != nil {
			return err
		}
		created = true
		return nil
	})
	if err != nil && isDuplicateUserIdentity(err) {
		// 两个验证码登录并发首次建号：唯一键败者回读胜者已提交的账号，
		// created=false，不重复欢迎/邀请归因，也不把正常竞争暴露成登录失败。
		if winner, lookupErr := s.repo.FindByEmail(email); lookupErr == nil && winner != nil {
			user, created, err = winner, false, nil
		}
	}
	if err != nil {
		return nil, "", false, err
	}
	if user.Status != 1 {
		return nil, "", false, errors.New("账号已被停用")
	}
	_ = s.repo.UpdateLastLoginWithIP(user.ID, ip)
	username := email
	if user.Username != nil {
		username = *user.Username
	}
	token, err := s.generateTokenForUser(user, username)
	if err != nil {
		return nil, "", false, err
	}
	if created {
		s.SendWelcomeMessage(user.ID)
		// 邀请归因(best-effort):仅本次真的新建号才归因;并发复用既有账号(created=false)不算。
		notifyInviteRegistered(ctx, user.ID, "email")
	}
	return user, token, created, nil
}

// SendVerificationCode sends a verification code to an email
func (s *Service) SendVerificationCode(ctx context.Context, email, purpose string) error {
	// Check rate limit: prevent sending too frequently (must wait 1 minute)
	ttl, err := cache.GetVerificationCodeTTL(ctx, email, purpose)
	if err == nil && ttl > 9*time.Minute {
		// Code exists and was sent less than 1 minute ago
		remainingSeconds := int((ttl - 9*time.Minute).Seconds())
		return fmt.Errorf("操作过于频繁，请 %d 秒后再试", remainingSeconds)
	}

	// Generate 6-digit code
	code := utils.SecureRandomDigits(6)

	// Save verification code to Redis (auto-expires in 10 minutes)
	if err := cache.SaveVerificationCode(ctx, email, code, purpose); err != nil {
		return fmt.Errorf("failed to save verification code: %w", err)
	}

	// Get email configuration from database
	if s.configService != nil {
		emailConfig, err := s.configService.GetActiveEmailConfig()
		if err == nil && emailConfig != nil {
			// Determine purpose text
			purposeText := "验证码"
			if purpose == "register" {
				purposeText = "注册验证码"
			} else if purpose == "reset_password" {
				purposeText = "重置密码验证码"
			} else if purpose == "login" {
				purposeText = "登录验证码"
			}

			// 3 位随机参考码防邮件服务按主题去重(同一收件人短时间内多封验证码会被折叠/丢弃)。
			// 主题统一走 utils.EmailSubject → "Scholay · 注册验证码 [Ref: ABC]"。
			refCode := utils.SecureRandomString(3, "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
			subject := fmt.Sprintf("%s [Ref: %s]", utils.EmailSubject(purposeText), refCode)

			// 时间戳进正文,避免邮件服务按内容去重
			currentTime := time.Now().Format("2006-01-02 15:04:05")
			body := utils.RenderBrandedEmail(utils.EmailContent{
				Title: purposeText,
				Intro: "请在页面中输入以下验证码完成操作:",
				Code:  code,
				// 有效期是用户唯一需要立刻知道的约束,放最前;发送时间是防去重的副产物,
				// 但对「同时收到几封、该用哪封」也有用,所以留着但压到后面。
				// 「不是本人操作请忽略」外壳页脚已有一句,这里不再重复。
				Note: fmt.Sprintf("验证码 10 分钟内有效。发送时间 %s。", currentTime),
			})

			config := utils.EmailConfig{
				SMTPHost:     emailConfig.SMTPHost,
				SMTPPort:     emailConfig.SMTPPort,
				SMTPUser:     emailConfig.SMTPUser,
				SMTPPassword: emailConfig.SMTPPassword,
				FromEmail:    emailConfig.FromEmail,
				FromName:     emailConfig.FromName,
			}

			// 异步投递: 验证码已落 Redis(上方 SaveVerificationCode), 用户已可用; SMTP 往返
			// (可能慢/卡)不该阻塞这个公开的 pre-auth 请求。原同步实现失败也只 Warn 不影响返回,
			// 故改 async 无行为损失(性能审计 email-sms-sync)。email.go 侧另有建连/操作超时兜底。
			mailCfg, mailTo := config, email
			safego.Go("send-verification-email", func() {
				if err := utils.SendEmailWithTLS(mailCfg, []string{mailTo}, subject, body); err != nil {
					slog.Warn("failed to send email, code generated but not delivered", "err", err, "email", mailTo, "purpose", purpose)
					return
				}
				slog.Info("verification code sent via email", "email", mailTo, "purpose", purpose)
			})
			return nil
		}
	}

	// Fallback: If no email config, log without the code value
	slog.Warn("verification code generated but no email config available", "email", email, "purpose", purpose)

	return nil
}

// ChangePassword changes user password with current password verification
// Also invalidates all existing sessions to force re-login
func (s *Service) ChangePassword(userID uint, currentPassword, newPassword string) error {
	// Get user by ID
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return fmt.Errorf("failed to find user: %w", err)
	}
	if user == nil {
		return errors.New("用户不存在")
	}

	// Check if user has a password set
	if user.PasswordHash == nil || *user.PasswordHash == "" {
		return errors.New("该账号尚未设置密码")
	}

	// Verify current password
	if !utils.CheckPassword(currentPassword, *user.PasswordHash) {
		return ErrCurrentPasswordInvalid
	}

	// Hash new password
	hashedPassword, err := utils.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	// Update password. 改密成功后由 handler 调 utils.RevokeUserAllTokens 踢掉所有 token。
	return s.repo.UpdatePassword(userID, hashedPassword)
}
