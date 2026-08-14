// ============================================================================
// Scholay学术 V1.0
// Handler - 认证相关（注册/登录/验证码/密码/Token）
// ============================================================================

package user

import (
	"errors"
	"log/slog"

	"scholar-backend/internal/common/turnstile"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// ========== Request/Response 类型 ==========

// CheckEmailRequest represents a check email request
type CheckEmailRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// CheckEmailResponse represents a check email response
type CheckEmailResponse struct {
	Exists bool `json:"exists"`
}

// SendCodeRequest represents a send verification code request.
// change_email purpose 用于「换绑邮箱」场景给当前已绑邮箱发码,确认用户对旧邮箱
// 的所有权。见 service.BindEmail 注释。
type SendCodeRequest struct {
	Email   string `json:"email" binding:"required,email"`
	Purpose string `json:"purpose" binding:"required,oneof=register login bind unbind reset_password change_email"`
}

// CheckPhoneRequest represents a check phone request
type CheckPhoneRequest struct {
	Phone string `json:"phone" binding:"required,len=11"`
}

// CheckPhoneResponse represents a check phone response
type CheckPhoneResponse struct {
	Exists bool `json:"exists"`
}

// SendPhoneCodeRequest represents a send phone verification code request.
// change_phone purpose 用于「换绑手机」场景给当前已绑手机发码,确认旧号所有权。
// 见 service.BindPhone 注释。
type SendPhoneCodeRequest struct {
	Phone   string `json:"phone" binding:"required,len=11"`
	Purpose string `json:"purpose" binding:"required,oneof=register login bind unbind reset_password change_phone"`
}

// RegisterPhoneRequest represents a phone registration request
type RegisterPhoneRequest struct {
	Phone          string `json:"phone" binding:"required,len=11"`
	Password       string `json:"password" binding:"required,min=8"`
	Code           string `json:"code" binding:"required,len=6"`
	InvitationCode string `json:"invitation_code"` // 邀请码（可选）
	TurnstileToken string `json:"turnstile_token"` // Cloudflare Turnstile 人机校验,与邮箱注册对称
}

// LoginPhoneRequest represents a phone login request
type LoginPhoneRequest struct {
	Phone    string `json:"phone" binding:"required,len=11"`
	Password string `json:"password" binding:"required"`
}

// RegisterRequest represents a registration request
type RegisterRequest struct {
	Email          string `json:"email" binding:"required,email"`
	Password       string `json:"password" binding:"required,min=8"`
	Code           string `json:"code"`
	InvitationCode string `json:"invitation_code"` // 邀请码（可选）
	TurnstileToken string `json:"turnstile_token"`
}

// LoginRequest represents a login request
type LoginRequest struct {
	Email          string `json:"email" binding:"required,email"`
	Password       string `json:"password" binding:"required"`
	TurnstileToken string `json:"turnstile_token"`
}

// AuthResponse represents an authentication response
type AuthResponse struct {
	Token     string `json:"token"`
	User      *User  `json:"user"`
	IsNewUser bool   `json:"is_new_user,omitempty"`
}

// ResetPasswordRequest represents a password reset request
type ResetPasswordRequest struct {
	Email       string `json:"email" binding:"required,email"`
	Code        string `json:"code" binding:"required,len=6"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// ResetPasswordPhoneRequest represents a phone password reset request
type ResetPasswordPhoneRequest struct {
	Phone       string `json:"phone" binding:"required,len=11"`
	Code        string `json:"code" binding:"required,len=6"`
	NewPassword string `json:"new_password" binding:"required,min=8"`
}

// LoginWithCodeRequest represents a login with verification code request
type LoginWithCodeRequest struct {
	Email          string `json:"email" binding:"required,email"`
	Code           string `json:"code" binding:"required,len=6"`
	TurnstileToken string `json:"turnstile_token"`
}

// LoginPhoneWithCodeRequest represents a phone login with verification code request
type LoginPhoneWithCodeRequest struct {
	Phone          string `json:"phone" binding:"required,len=11"`
	Code           string `json:"code" binding:"required,len=6"`
	TurnstileToken string `json:"turnstile_token"`
}

// ========== 邮箱认证 ==========

// CheckEmail handles checking if email exists
func (h *Handler) CheckEmail(c *gin.Context) {
	var req CheckEmailRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	exists, err := h.service.CheckEmailExists(req.Email)
	if err != nil {
		utils.Error(c, CodeCheckEmailFailed, "检查邮箱失败,请稍后重试")
		return
	}

	utils.Success(c, CheckEmailResponse{Exists: exists})
}

// SendVerificationCode handles sending verification code
func (h *Handler) SendVerificationCode(c *gin.Context) {
	var req SendCodeRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// purpose=register 时跟随 admin 开关 —— 关掉就别浪费 SMTP / 验证码额度。
	// 其他 purpose (login/bind/unbind/reset_password/change_email) 都是用户主动
	// 走"用验证码做某事"的流程, 不受这个开关影响。
	if req.Purpose == "register" {
		if cfg, _ := h.service.GetSystemConfig(); cfg != nil && !cfg.RequireEmailVerification {
			utils.Error(c, CodeSendCodeFailed, "管理员已关闭邮箱验证, 注册无需验证码")
			return
		}
	}

	err := h.service.SendVerificationCode(c.Request.Context(), req.Email, req.Purpose)
	if err != nil {
		// Return the specific error message from service (includes rate limit info)
		utils.SafeError(c, CodeSendCodeFailed, err)
		return
	}

	utils.SuccessWithMessage(c, "Verification code sent successfully", nil)
}

// Register handles user registration
func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// Get system configuration
	systemConfig, err := h.service.GetSystemConfig()
	if err != nil {
		utils.Error(c, CodeSystemConfigError, "加载系统配置失败,请稍后重试")
		return
	}

	// Verify Turnstile token (if enabled)
	ip := c.ClientIP()
	if valid, err := turnstile.VerifyWithConfig(c.Request.Context(), req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, CodeTurnstileFailed, errMsg)
		return
	}

	// 跟随 admin 的 RequireEmailVerification 开关:
	//   ON  → code 必填, 走 service 内置的 cache.VerifyCode
	//   OFF → 忽略前端可能仍带的 code, 传空给 service 跳过验证
	// (service 自身的 `if code != ""` 守卫意味着空 code 就跳, 我们这里只统一意图。)
	code := req.Code
	if systemConfig != nil && systemConfig.RequireEmailVerification {
		if code == "" {
			utils.Error(c, CodeRegisterFailed, "请输入邮箱验证码")
			return
		}
	} else {
		code = "" // verification off → don't pass user-supplied code into VerifyCode at all
	}

	user, token, err := h.service.RegisterWithEmailAndInvitation(c.Request.Context(), req.Email, req.Password, code, req.InvitationCode, ip)
	if err != nil {
		utils.SafeError(c, CodeRegisterFailed, err)
		return
	}

	utils.Success(c, AuthResponse{
		Token:     token,
		User:      user,
		IsNewUser: true,
	})
}

// Login handles user login
func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// Get system configuration
	systemConfig, err := h.service.GetSystemConfig()
	if err != nil {
		utils.Error(c, CodeSystemConfigError, "加载系统配置失败,请稍后重试")
		return
	}

	// Verify Turnstile token (if enabled)
	ip := c.ClientIP()
	if valid, err := turnstile.VerifyWithConfig(c.Request.Context(), req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, CodeTurnstileFailed, errMsg)
		return
	}

	user, token, err := h.service.LoginWithEmail(req.Email, req.Password, ip)
	if err != nil {
		utils.SafeError(c, CodeLoginFailed, err)
		return
	}

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
	})
}

// LoginWithCode handles login with email verification code
func (h *Handler) LoginWithCode(c *gin.Context) {
	var req LoginWithCodeRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// Get system configuration
	systemConfig, err := h.service.GetSystemConfig()
	if err != nil {
		utils.Error(c, CodeSystemConfigError, "加载系统配置失败,请稍后重试")
		return
	}

	// Verify Turnstile token (if enabled)
	ip := c.ClientIP()
	if valid, err := turnstile.VerifyWithConfig(c.Request.Context(), req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, CodeTurnstileFailed, errMsg)
		return
	}

	user, token, created, err := h.service.LoginWithEmailCode(c.Request.Context(), req.Email, req.Code, ip)
	if err != nil {
		utils.SafeError(c, CodeLoginWithCodeFailed, err)
		return
	}

	utils.Success(c, AuthResponse{
		Token:     token,
		User:      user,
		IsNewUser: created,
	})
}

// ResetPassword handles password reset with email verification code.
// 改密成功后立刻 revoke 该用户所有在用 token, 强制全部设备重新登录。
func (h *Handler) ResetPassword(c *gin.Context) {
	var req ResetPasswordRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	userID, err := h.service.ResetPassword(c.Request.Context(), req.Email, req.Code, req.NewPassword)
	if err != nil {
		utils.SafeError(c, CodeResetPasswordFailed, err)
		return
	}
	if err := utils.RevokeUserAllTokens(c.Request.Context(), userID); err != nil {
		// 不阻塞响应: Redis 故障最多让旧 token 续命到自然过期, 仍比之前更好
		slog.Warn("reset password: revoke user tokens failed", "err", err, "user_id", userID)
	}

	utils.SuccessWithMessage(c, "Password reset successfully", nil)
}

// ========== 手机认证 ==========

// CheckPhone handles checking if phone exists
func (h *Handler) CheckPhone(c *gin.Context) {
	var req CheckPhoneRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	exists, err := h.service.CheckPhoneExists(req.Phone)
	if err != nil {
		utils.Error(c, CodeCheckPhoneFailed, "检查手机号失败,请稍后重试")
		return
	}

	utils.Success(c, CheckPhoneResponse{Exists: exists})
}

// SendPhoneVerificationCode handles sending phone verification code
func (h *Handler) SendPhoneVerificationCode(c *gin.Context) {
	var req SendPhoneCodeRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	err := h.service.SendPhoneVerificationCode(c.Request.Context(), req.Phone, req.Purpose)
	if err != nil {
		utils.InternalError(c, CodeSendPhoneCodeFailed, "验证码发送失败,请稍后重试", err)
		return
	}

	utils.SuccessWithMessage(c, "Verification code sent successfully", nil)
}

// RegisterWithPhone handles user registration with phone
func (h *Handler) RegisterWithPhone(c *gin.Context) {
	var req RegisterPhoneRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// Get client IP
	ip := c.ClientIP()

	// Turnstile —— 与邮箱注册对称(原本漏了,管理员开关启用后会跳过手机注册的人机验证,
	// 是 P1 安全洞)。VerifyWithConfig 内部会读 systemConfig.EnableTurnstile,关时直通。
	systemConfig, err := h.service.GetSystemConfig()
	if err != nil {
		utils.Error(c, CodeSystemConfigError, "加载系统配置失败,请稍后重试")
		return
	}
	if valid, err := turnstile.VerifyWithConfig(c.Request.Context(), req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, CodeTurnstileFailed, errMsg)
		return
	}

	user, token, err := h.service.RegisterWithPhone(c.Request.Context(), req.Phone, req.Password, req.Code, req.InvitationCode, ip)
	if err != nil {
		utils.SafeError(c, CodeRegisterPhoneFailed, err)
		return
	}

	utils.Success(c, AuthResponse{
		Token:     token,
		User:      user,
		IsNewUser: true,
	})
}

// LoginWithPhone handles user login with phone
func (h *Handler) LoginWithPhone(c *gin.Context) {
	var req LoginPhoneRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	ip := c.ClientIP()
	user, token, err := h.service.LoginWithPhone(req.Phone, req.Password, ip)
	if err != nil {
		utils.SafeError(c, CodeLoginPhoneFailed, err)
		return
	}

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
	})
}

// LoginPhoneWithCode handles login with phone verification code
func (h *Handler) LoginPhoneWithCode(c *gin.Context) {
	var req LoginPhoneWithCodeRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	// Get system configuration
	systemConfig, err := h.service.GetSystemConfig()
	if err != nil {
		utils.Error(c, CodeSystemConfigError, "加载系统配置失败,请稍后重试")
		return
	}

	// Verify Turnstile token (if enabled)
	ip := c.ClientIP()
	if valid, err := turnstile.VerifyWithConfig(c.Request.Context(), req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, CodeTurnstileFailed, errMsg)
		return
	}

	user, token, created, err := h.service.LoginWithPhoneCode(c.Request.Context(), req.Phone, req.Code, ip)
	if err != nil {
		utils.SafeError(c, CodeLoginPhoneWithCodeFailed, err)
		return
	}

	utils.Success(c, AuthResponse{
		Token:     token,
		User:      user,
		IsNewUser: created,
	})
}

// ResetPasswordPhone handles password reset with phone verification code.
// 改密成功后立刻 revoke 该用户所有在用 token。
func (h *Handler) ResetPasswordPhone(c *gin.Context) {
	var req ResetPasswordPhoneRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	userID, err := h.service.ResetPasswordPhone(c.Request.Context(), req.Phone, req.Code, req.NewPassword)
	if err != nil {
		utils.SafeError(c, CodeResetPasswordPhoneFailed, err)
		return
	}
	if err := utils.RevokeUserAllTokens(c.Request.Context(), userID); err != nil {
		slog.Warn("reset password (phone): revoke user tokens failed", "err", err, "user_id", userID)
	}

	utils.SuccessWithMessage(c, "Password reset successfully", nil)
}

// ========== 密码、Token、登出 ==========

// ChangePassword handles user password change
func (h *Handler) ChangePassword(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	var req struct {
		CurrentPassword string `json:"current_password" binding:"required"`
		NewPassword     string `json:"new_password" binding:"required,min=8"`
	}

	if !utils.BindJSON(c, &req) {
		return
	}

	err := h.service.ChangePassword(userID, req.CurrentPassword, req.NewPassword)
	if err != nil {
		if errors.Is(err, ErrCurrentPasswordInvalid) {
			utils.Error(c, CodeChangePasswordInvalid, "当前密码不正确")
			return
		}
		utils.Error(c, CodeChangePasswordFailed, "修改密码失败,请稍后重试")
		return
	}
	// 改密成功 → 踢掉该用户所有设备, 强制重新登录
	if err := utils.RevokeUserAllTokens(c.Request.Context(), userID); err != nil {
		slog.Warn("change password: revoke user tokens failed", "err", err, "user_id", userID)
	}

	utils.SuccessWithMessage(c, "Password changed successfully", nil)
}

// Logout handles user logout.
//
// 把当前 token 写入 Redis blacklist (按 jti), 让本端立刻失效 —— 其他端不受影响。
// 全部设备登出走 LogoutAll(/user/logout-all)。admin 也用本端点(admin token type=user)。
func (h *Handler) Logout(c *gin.Context) {
	if _, ok := utils.GetUserID(c); !ok {
		return
	}
	// middleware 已经把 token 字符串挂到 context, 这里取出 claims 走 revoke
	if tokRaw, ok := c.Get("token"); ok {
		if tokStr, ok := tokRaw.(string); ok && tokStr != "" {
			if claims, perr := utils.ParseToken(tokStr); perr == nil {
				if err := utils.RevokeToken(c.Request.Context(), claims); err != nil {
					slog.Warn("logout: revoke token failed", "err", err)
				}
			}
		}
	}
	utils.SuccessWithMessage(c, "Logged out successfully", nil)
}

// LogoutAll 吊销该用户在**所有设备**上的 token(user-level 黑名单)。
// 改密时后端已自动调 RevokeUserAllTokens;这里把"主动一键退出所有设备"也暴露成端点。
func (h *Handler) LogoutAll(c *gin.Context) {
	uid, ok := utils.GetUserID(c)
	if !ok {
		return
	}
	if err := utils.RevokeUserAllTokens(c.Request.Context(), uid); err != nil {
		slog.Warn("logout-all: revoke all tokens failed", "err", err, "user_id", uid)
	}
	utils.SuccessWithMessage(c, "已退出所有设备", nil)
}
