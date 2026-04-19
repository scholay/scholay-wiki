// ============================================================================
// Scholay学术 V1.0
// Handler - 认证相关（注册/登录/验证码/密码/Token）
// ============================================================================

package user

import (
	"errors"
	"strings"
	"time"

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

// SendCodeRequest represents a send verification code request
type SendCodeRequest struct {
	Email   string `json:"email" binding:"required,email"`
	Purpose string `json:"purpose" binding:"required,oneof=register login bind unbind reset_password"`
}

// CheckPhoneRequest represents a check phone request
type CheckPhoneRequest struct {
	Phone string `json:"phone" binding:"required,len=11"`
}

// CheckPhoneResponse represents a check phone response
type CheckPhoneResponse struct {
	Exists bool `json:"exists"`
}

// SendPhoneCodeRequest represents a send phone verification code request
type SendPhoneCodeRequest struct {
	Phone   string `json:"phone" binding:"required,len=11"`
	Purpose string `json:"purpose" binding:"required,oneof=register login bind unbind reset_password"`
}

// RegisterPhoneRequest represents a phone registration request
type RegisterPhoneRequest struct {
	Phone          string `json:"phone" binding:"required,len=11"`
	Password       string `json:"password" binding:"required,min=8"`
	Code           string `json:"code" binding:"required,len=6"`
	InvitationCode string `json:"invitation_code"` // 邀请码（可选）
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
	Token string `json:"token"`
	User  *User  `json:"user"`
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
		utils.Error(c, 2000, "Failed to check email")
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

	err := h.service.SendVerificationCode(req.Email, req.Purpose)
	if err != nil {
		// Return the specific error message from service (includes rate limit info)
		utils.Error(c, 2001, err.Error())
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
		utils.Error(c, 5000, "Failed to get system configuration")
		return
	}

	// Verify Turnstile token (if enabled)
	ip := c.ClientIP()
	if valid, err := turnstile.VerifyWithConfig(c.Request.Context(), req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, 4001, errMsg)
		return
	}

	user, token, err := h.service.RegisterWithEmailAndInvitation(req.Email, req.Password, req.Code, req.InvitationCode, ip)
	if err != nil {
		utils.Error(c, 2002, err.Error())
		return
	}

	// Create session for the new user
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour) // 30 days session

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
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
		utils.Error(c, 5000, "Failed to get system configuration")
		return
	}

	// Verify Turnstile token (if enabled)
	ip := c.ClientIP()
	if valid, err := turnstile.VerifyWithConfig(c.Request.Context(), req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, 4001, errMsg)
		return
	}

	user, token, err := h.service.LoginWithEmail(req.Email, req.Password, ip)
	if err != nil {
		utils.Error(c, 2003, err.Error())
		return
	}

	// Create session for the user
	// Session expires in 30 days, but token expires in 2 hours
	// Client should refresh token before it expires
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour) // 30 days session

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
		utils.Error(c, 5000, "Failed to get system configuration")
		return
	}

	// Verify Turnstile token (if enabled)
	ip := c.ClientIP()
	if valid, err := turnstile.VerifyWithConfig(c.Request.Context(), req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, 4001, errMsg)
		return
	}

	user, token, err := h.service.LoginWithEmailCode(req.Email, req.Code, ip)
	if err != nil {
		utils.Error(c, 2016, err.Error())
		return
	}

	// Create session for the user
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour) // 30 days session

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
	})
}

// ResetPassword handles password reset with email verification code
func (h *Handler) ResetPassword(c *gin.Context) {
	var req ResetPasswordRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	err := h.service.ResetPassword(req.Email, req.Code, req.NewPassword)
	if err != nil {
		utils.Error(c, 2014, err.Error())
		return
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
		utils.Error(c, 2020, "Failed to check phone")
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

	err := h.service.SendPhoneVerificationCode(req.Phone, req.Purpose)
	if err != nil {
		utils.InternalError(c, 2021, "Failed to send verification code", err)
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

	user, token, err := h.service.RegisterWithPhone(req.Phone, req.Password, req.Code, req.InvitationCode, ip)
	if err != nil {
		utils.Error(c, 2022, err.Error())
		return
	}

	// Create session for the new user
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour) // 30 days session

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
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
		utils.Error(c, 2023, err.Error())
		return
	}

	// Create session for the user
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour) // 30 days session

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
		utils.Error(c, 5000, "Failed to get system configuration")
		return
	}

	// Verify Turnstile token (if enabled)
	ip := c.ClientIP()
	if valid, err := turnstile.VerifyWithConfig(c.Request.Context(), req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, 4001, errMsg)
		return
	}

	user, token, err := h.service.LoginWithPhoneCode(req.Phone, req.Code, ip)
	if err != nil {
		utils.Error(c, 2017, err.Error())
		return
	}

	// Create session for the user
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour) // 30 days session

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
	})
}

// ResetPasswordPhone handles password reset with phone verification code
func (h *Handler) ResetPasswordPhone(c *gin.Context) {
	var req ResetPasswordPhoneRequest
	if !utils.BindJSON(c, &req) {
		return
	}

	err := h.service.ResetPasswordPhone(req.Phone, req.Code, req.NewPassword)
	if err != nil {
		utils.Error(c, 2015, err.Error())
		return
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
			utils.Error(c, 2012, "Current password is incorrect")
			return
		}
		utils.Error(c, 2013, "Failed to change password")
		return
	}

	utils.SuccessWithMessage(c, "Password changed successfully", nil)
}

// Logout handles user logout
func (h *Handler) Logout(c *gin.Context) {
	userID, ok := utils.GetUserID(c)
	if !ok {
		return
	}

	err := h.service.Logout(userID)
	if err != nil {
		utils.Error(c, 2010, "Failed to logout")
		return
	}

	utils.SuccessWithMessage(c, "Logged out successfully", nil)
}

// RefreshToken handles token refresh
// This endpoint allows refreshing a token before it expires
// The session must be within 30 days of creation
func (h *Handler) RefreshToken(c *gin.Context) {
	// Get token from Authorization header
	authHeader := c.GetHeader("Authorization")
	var token string
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && parts[0] == "Bearer" {
			token = parts[1]
		}
	}

	if token == "" {
		utils.BadRequest(c, "Token is required")
		return
	}

	newToken, err := h.service.RefreshToken(token)
	if err != nil {
		if errors.Is(err, ErrSessionExpired) {
			utils.Error(c, 2016, err.Error())
			return
		}
		if errors.Is(err, ErrSessionNotFound) {
			utils.Error(c, 2019, "您的账号已在其他设备登录")
			return
		}
		utils.InternalError(c, 2017, "Failed to refresh token", err)
		return
	}

	utils.Success(c, map[string]any{
		"token": newToken,
	})
}

// GetTokenInfo returns token expiry information
func (h *Handler) GetTokenInfo(c *gin.Context) {
	// Get token from Authorization header
	authHeader := c.GetHeader("Authorization")
	var token string
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && parts[0] == "Bearer" {
			token = parts[1]
		}
	}

	if token == "" {
		utils.BadRequest(c, "Token is required")
		return
	}

	info, err := h.service.GetTokenInfo(token)
	if err != nil {
		utils.InternalError(c, 2018, "Failed to get token info", err)
		return
	}

	utils.Success(c, info)
}
