package user

import (
	"scholar-backend/internal/common/turnstile"
	"scholar-backend/internal/common/utils"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// WeChatService interface for WeChat OAuth operations
type WeChatService interface {
	GetAccessToken(code string) (accessToken, openID, unionID string, err error)
	GetUserInfo(accessToken, openID string) (nickname, headImgURL, unionID string, err error)
}

// Handler handles HTTP requests for user operations
type Handler struct {
	service        *Service
	wechatService  WeChatService
}

// NewHandler creates a new user handler
func NewHandler(service *Service) *Handler {
	return &Handler{
		service:       service,
		wechatService: nil, // Will be set via SetWeChatService
	}
}

// SetWeChatService sets the WeChat service
func (h *Handler) SetWeChatService(wechatService WeChatService) {
	h.wechatService = wechatService
}

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
	Purpose string `json:"purpose" binding:"required,oneof=register login bind reset_password"`
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
	Purpose string `json:"purpose" binding:"required,oneof=register login bind reset_password"`
}

// RegisterPhoneRequest represents a phone registration request
type RegisterPhoneRequest struct {
	Phone    string `json:"phone" binding:"required,len=11"`
	Password string `json:"password" binding:"required,min=8"`
	Code     string `json:"code" binding:"required,len=6"`
}

// LoginPhoneRequest represents a phone login request
type LoginPhoneRequest struct {
	Phone    string `json:"phone" binding:"required,len=11"`
	Password string `json:"password" binding:"required"`
}

// BindPhoneRequest represents a bind phone request
type BindPhoneRequest struct {
	Phone string `json:"phone" binding:"required,len=11"`
	Code  string `json:"code" binding:"required,len=6"`
}

// BindEmailRequest represents a bind email request
type BindEmailRequest struct {
	Email string `json:"email" binding:"required,email"`
	Code  string `json:"code" binding:"required,len=6"`
}

// UnbindRequest represents an unbind request (requires verification code)
type UnbindRequest struct {
	Code string `json:"code" binding:"required,len=6"`
}

// RegisterRequest represents a registration request
type RegisterRequest struct {
	Email          string `json:"email" binding:"required,email"`
	Password       string `json:"password" binding:"required,min=8"`
	Code           string `json:"code"`
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

// UpdateProfileRequest represents an update profile request
type UpdateProfileRequest struct {
	Username  *string `json:"username"`
	AvatarURL *string `json:"avatar_url"`
	Bio       *string `json:"bio"`
}

// UserProfileResponse represents an extended user profile response with auth providers
type UserProfileResponse struct {
	ID            uint       `json:"id"`
	Username      *string    `json:"username"`
	Email         *string    `json:"email"`
	Phone         *string    `json:"phone"`
	AvatarURL     *string    `json:"avatar_url"`
	Bio           *string    `json:"bio"`
	Status        int8       `json:"status"`
	EmailVerified bool       `json:"email_verified"`
	PhoneVerified bool       `json:"phone_verified"`
	WeChatOpenID  *string    `json:"wechat_openid"` // WeChat OpenID if bound
	LastLoginAt   *time.Time `json:"last_login_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// CheckEmail handles checking if email exists
func (h *Handler) CheckEmail(c *gin.Context) {
	var req CheckEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
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
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
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
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
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
	if valid, err := turnstile.VerifyWithConfig(req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, 4001, errMsg)
		return
	}

	user, token, err := h.service.RegisterWithEmail(req.Email, req.Password, req.Code)
	if err != nil {
		utils.Error(c, 2002, err.Error())
		return
	}

	// Create session for the new user
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 24*7*time.Hour) // 7 days

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
	})
}

// Login handles user login
func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
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
	if valid, err := turnstile.VerifyWithConfig(req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, 4001, errMsg)
		return
	}

	user, token, err := h.service.LoginWithEmail(req.Email, req.Password)
	if err != nil {
		utils.Error(c, 2003, err.Error())
		return
	}

	// Create session for the user
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 24*7*time.Hour) // 7 days

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
	})
}

// GetProfile handles getting user profile
func (h *Handler) GetProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	user, err := h.service.GetProfile(userID.(uint))
	if err != nil {
		utils.Error(c, 2004, "Failed to get profile")
		return
	}

	if user == nil {
		utils.Error(c, 2005, "User not found")
		return
	}

	// Check if WeChat is bound
	var wechatOpenID *string
	wechatProvider, err := h.service.repo.FindAuthProviderByUserAndProvider(userID.(uint), "wechat")
	if err == nil && wechatProvider != nil {
		wechatOpenID = &wechatProvider.ProviderUserID
	}

	// Build extended response
	response := UserProfileResponse{
		ID:            user.ID,
		Username:      user.Username,
		Email:         user.Email,
		Phone:         user.Phone,
		AvatarURL:     user.AvatarURL,
		Bio:           user.Bio,
		Status:        user.Status,
		EmailVerified: user.EmailVerified,
		PhoneVerified: user.PhoneVerified,
		WeChatOpenID:  wechatOpenID,
		LastLoginAt:   user.LastLoginAt,
		CreatedAt:     user.CreatedAt,
		UpdatedAt:     user.UpdatedAt,
	}

	utils.Success(c, response)
}

// UpdateProfile handles updating user profile
func (h *Handler) UpdateProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.UpdateProfile(userID.(uint), req.Username, req.AvatarURL, req.Bio)
	if err != nil {
		utils.Error(c, 2006, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Profile updated successfully", nil)
}

// CheckPhone handles checking if phone exists
func (h *Handler) CheckPhone(c *gin.Context) {
	var req CheckPhoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
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
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.SendPhoneVerificationCode(req.Phone, req.Purpose)
	if err != nil {
		utils.Error(c, 2021, "Failed to send verification code: "+err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Verification code sent successfully", nil)
}

// RegisterWithPhone handles user registration with phone
func (h *Handler) RegisterWithPhone(c *gin.Context) {
	var req RegisterPhoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	user, token, err := h.service.RegisterWithPhone(req.Phone, req.Password, req.Code)
	if err != nil {
		utils.Error(c, 2022, err.Error())
		return
	}

	// Create session for the new user
	ip := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 24*7*time.Hour) // 7 days

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
	})
}

// LoginWithPhone handles user login with phone
func (h *Handler) LoginWithPhone(c *gin.Context) {
	var req LoginPhoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	user, token, err := h.service.LoginWithPhone(req.Phone, req.Password)
	if err != nil {
		utils.Error(c, 2023, err.Error())
		return
	}

	// Create session for the user
	ip := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 24*7*time.Hour) // 7 days

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
	})
}

// BindPhone handles binding phone to user account
func (h *Handler) BindPhone(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req BindPhoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.BindPhone(userID.(uint), req.Phone, req.Code)
	if err != nil {
		utils.Error(c, 2024, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Phone bound successfully", nil)
}

// BindEmail handles binding email to user account
func (h *Handler) BindEmail(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req BindEmailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.BindEmail(userID.(uint), req.Email, req.Code)
	if err != nil {
		utils.Error(c, 2025, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Email bound successfully", nil)
}

// UnbindPhone handles unbinding phone from user account
func (h *Handler) UnbindPhone(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req UnbindRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.UnbindPhone(userID.(uint), req.Code)
	if err != nil {
		utils.Error(c, 2026, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Phone unbound successfully", nil)
}

// UnbindEmail handles unbinding email from user account
func (h *Handler) UnbindEmail(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req UnbindRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.UnbindEmail(userID.(uint), req.Code)
	if err != nil {
		utils.Error(c, 2027, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Email unbound successfully", nil)
}

// UnbindWeChat handles unbinding WeChat from user account
func (h *Handler) UnbindWeChat(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	err := h.service.UnbindWeChat(userID.(uint))
	if err != nil {
		utils.Error(c, 2028, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "WeChat unbound successfully", nil)
}

// GetUserStatistics handles getting user statistics (admin only)
func (h *Handler) GetUserStatistics(c *gin.Context) {
	stats, err := h.service.GetUserStatistics()
	if err != nil {
		utils.Error(c, 2007, "Failed to get user statistics")
		return
	}

	utils.Success(c, stats)
}

// GetUserList handles getting paginated user list (admin only)
func (h *Handler) GetUserList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	users, total, err := h.service.GetUserList(page, pageSize)
	if err != nil {
		utils.Error(c, 2008, "Failed to get user list")
		return
	}

	// Get user IDs for fetching auth providers
	userIDs := make([]uint, len(users))
	for i, user := range users {
		userIDs[i] = user.ID
	}

	// Fetch auth providers (including WeChat) for all users
	authProviders, err := h.service.repo.GetUserAuthProviders(userIDs)
	if err != nil {
		// Log error but continue without provider info
		authProviders = make(map[uint][]UserAuthProvider)
	}

	// Build response with auth provider info
	type UserResponse struct {
		User
		WeChatOpenID string `json:"wechat_openid,omitempty"`
	}

	userResponses := make([]UserResponse, len(users))
	for i, user := range users {
		response := UserResponse{User: user}

		// Find WeChat provider
		if providers, ok := authProviders[user.ID]; ok {
			for _, provider := range providers {
				if provider.Provider == "wechat" {
					response.WeChatOpenID = provider.ProviderUserID
					break
				}
			}
		}

		userResponses[i] = response
	}

	utils.Success(c, gin.H{
		"users": userResponses,
		"total": total,
		"page":  page,
		"page_size": pageSize,
	})
}

// GetOnlineUsers handles getting currently online users (admin only)
func (h *Handler) GetOnlineUsers(c *gin.Context) {
	users, err := h.service.GetOnlineUsers()
	if err != nil {
		utils.Error(c, 2009, "Failed to get online users")
		return
	}

	utils.Success(c, gin.H{
		"online_users": users,
	})
}

// Logout handles user logout
func (h *Handler) Logout(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	err := h.service.Logout(userID.(uint))
	if err != nil {
		utils.Error(c, 2010, "Failed to logout")
		return
	}

	utils.SuccessWithMessage(c, "Logged out successfully", nil)
}

// Heartbeat handles heartbeat requests to update session activity
func (h *Handler) Heartbeat(c *gin.Context) {
	// Get token from Authorization header
	token := c.GetHeader("Authorization")
	if token == "" {
		utils.Unauthorized(c, "No token provided")
		return
	}

	// Remove "Bearer " prefix if present
	if len(token) > 7 && token[:7] == "Bearer " {
		token = token[7:]
	}

	// Update session activity
	err := h.service.UpdateSessionActivity(token)
	if err != nil {
		utils.Error(c, 2011, "Failed to update session activity")
		return
	}

	utils.Success(c, map[string]interface{}{
		"timestamp": time.Now(),
	})
}

// GetUserStatisticsChart handles getting user statistics chart data (admin only)
func (h *Handler) GetUserStatisticsChart(c *gin.Context) {
	// Get days parameter (default 30 days)
	days := 30
	if daysParam := c.Query("days"); daysParam != "" {
		if parsedDays, err := strconv.Atoi(daysParam); err == nil && parsedDays > 0 {
			days = parsedDays
		}
	}

	data, err := h.service.GetUserStatisticsChart(days)
	if err != nil {
		utils.Error(c, 2012, "Failed to get user statistics")
		return
	}

	utils.Success(c, map[string]interface{}{
		"statistics": data,
	})
}

// GetOnlineUserChart handles getting online user chart data (admin only)
func (h *Handler) GetOnlineUserChart(c *gin.Context) {
	// Get hours parameter (default 24 hours)
	hours := 24
	if hoursParam := c.Query("hours"); hoursParam != "" {
		if parsedHours, err := strconv.Atoi(hoursParam); err == nil && parsedHours > 0 {
			hours = parsedHours
		}
	}

	data, err := h.service.GetOnlineUserChartData(hours)
	if err != nil {
		utils.Error(c, 2013, "Failed to get online user chart data")
		return
	}

	utils.Success(c, map[string]interface{}{
		"snapshots": data,
	})
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

// ResetPassword handles password reset with email verification code
func (h *Handler) ResetPassword(c *gin.Context) {
	var req ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.ResetPassword(req.Email, req.Code, req.NewPassword)
	if err != nil {
		utils.Error(c, 2014, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Password reset successfully", nil)
}

// ResetPasswordPhone handles password reset with phone verification code
func (h *Handler) ResetPasswordPhone(c *gin.Context) {
	var req ResetPasswordPhoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.ResetPasswordPhone(req.Phone, req.Code, req.NewPassword)
	if err != nil {
		utils.Error(c, 2015, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Password reset successfully", nil)
}

// LoginWithCode handles login with email verification code
func (h *Handler) LoginWithCode(c *gin.Context) {
	var req LoginWithCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
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
	if valid, err := turnstile.VerifyWithConfig(req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, 4001, errMsg)
		return
	}

	user, token, err := h.service.LoginWithEmailCode(req.Email, req.Code)
	if err != nil {
		utils.Error(c, 2016, err.Error())
		return
	}

	// Create session for the user
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 24*7*time.Hour) // 7 days

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
	})
}

// LoginPhoneWithCode handles login with phone verification code
func (h *Handler) LoginPhoneWithCode(c *gin.Context) {
	var req LoginPhoneWithCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
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
	if valid, err := turnstile.VerifyWithConfig(req.TurnstileToken, ip, systemConfig); !valid {
		errMsg := "人机验证失败"
		if err != nil {
			errMsg = err.Error()
		}
		utils.Error(c, 4001, errMsg)
		return
	}

	user, token, err := h.service.LoginWithPhoneCode(req.Phone, req.Code)
	if err != nil {
		utils.Error(c, 2017, err.Error())
		return
	}

	// Create session for the user
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 24*7*time.Hour) // 7 days

	utils.Success(c, AuthResponse{
		Token: token,
		User:  user,
	})
}

// RegisterRoutes registers user routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	user := router.Group("/user")
	{
		// Email-based auth
		user.POST("/check-email", h.CheckEmail)
		user.POST("/send-code", h.SendVerificationCode)
		user.POST("/register", h.Register)
		user.POST("/login", h.Login)
		user.POST("/login-with-code", h.LoginWithCode)
		user.POST("/reset-password", h.ResetPassword)

		// Phone-based auth
		user.POST("/check-phone", h.CheckPhone)
		user.POST("/send-phone-code", h.SendPhoneVerificationCode)
		user.POST("/register-phone", h.RegisterWithPhone)
		user.POST("/login-phone", h.LoginWithPhone)
		user.POST("/login-phone-with-code", h.LoginPhoneWithCode)
		user.POST("/reset-password-phone", h.ResetPasswordPhone)

		// Protected routes will be added in the main server setup with middleware
	}
}

// WeChatCallbackRequest represents WeChat OAuth callback request
type WeChatCallbackRequest struct {
	Code  string `json:"code" binding:"required"`
	State string `json:"state" binding:"required"`
}

// WeChatCallback handles WeChat OAuth callback for login/register
// POST /api/v1/user/wechat/callback
func (h *Handler) WeChatCallback(c *gin.Context) {
	var req WeChatCallbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get WeChat service (needs to be injected)
	wechatService := h.wechatService
	if wechatService == nil {
		utils.Error(c, 5000, "微信服务暂不可用")
		return
	}

	// Exchange code for access token
	accessToken, openID, unionID1, err := wechatService.GetAccessToken(req.Code)
	if err != nil {
		utils.Error(c, 5001, "获取微信访问令牌失败："+err.Error())
		return
	}

	// Get user info
	nickname, headImgURL, unionID2, err := wechatService.GetUserInfo(accessToken, openID)
	if err != nil {
		utils.Error(c, 5002, "获取微信用户信息失败："+err.Error())
		return
	}

	// Use unionID from GetUserInfo if available, otherwise from GetAccessToken
	unionID := unionID2
	if unionID == "" {
		unionID = unionID1
	}

	// Login or register user
	user, token, isNewUser, err := h.service.LoginOrRegisterWithWeChat(
		openID,
		unionID,
		nickname,
		headImgURL,
	)
	if err != nil {
		utils.Error(c, 5003, "微信登录失败："+err.Error())
		return
	}

	// Create session
	ip := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 24*7*time.Hour)

	utils.Success(c, gin.H{
		"token":       token,
		"user":        user,
		"is_new_user": isNewUser,
	})
}

// BindWeChatRequest represents WeChat binding request
type BindWeChatRequest struct {
	Code  string `json:"code" binding:"required"`
	State string `json:"state" binding:"required"`
}

// BindWeChatAccount binds WeChat account to current user
// POST /api/v1/user/bind-wechat
func (h *Handler) BindWeChatAccount(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req BindWeChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	// Get WeChat service
	wechatService := h.wechatService
	if wechatService == nil {
		utils.Error(c, 5000, "微信服务暂不可用")
		return
	}

	// Exchange code for access token
	accessToken, openID, unionID1, err := wechatService.GetAccessToken(req.Code)
	if err != nil {
		utils.Error(c, 5001, "获取微信访问令牌失败："+err.Error())
		return
	}

	// Get user info
	nickname, headImgURL, unionID2, err := wechatService.GetUserInfo(accessToken, openID)
	if err != nil {
		utils.Error(c, 5002, "获取微信用户信息失败："+err.Error())
		return
	}

	// Use unionID from GetUserInfo if available, otherwise from GetAccessToken
	unionID := unionID2
	if unionID == "" {
		unionID = unionID1
	}

	// Bind WeChat to user
	if err := h.service.BindWeChat(
		userID.(uint),
		openID,
		unionID,
		nickname,
		headImgURL,
	); err != nil {
		utils.Error(c, 5003, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "WeChat account bound successfully"})
}

// BindEmailWithPasswordRequest represents email binding with password request
type BindEmailWithPasswordRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Code     string `json:"code" binding:"required,len=6"`
}

// BindEmailWithPassword binds email to WeChat user with password (first-time binding)
// POST /api/v1/user/bind-email-with-password
func (h *Handler) BindEmailWithPassword(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req BindEmailWithPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	if err := h.service.BindEmailWithPassword(userID.(uint), req.Email, req.Password, req.Code); err != nil {
		utils.Error(c, 2010, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Email and password set successfully"})
}

// BindPhoneWithPasswordRequest represents phone binding with password request
type BindPhoneWithPasswordRequest struct {
	Phone    string `json:"phone" binding:"required,len=11"`
	Password string `json:"password" binding:"required,min=8"`
	Code     string `json:"code" binding:"required,len=6"`
}

// BindPhoneWithPassword binds phone to WeChat user with password (first-time binding)
// POST /api/v1/user/bind-phone-with-password
func (h *Handler) BindPhoneWithPassword(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req BindPhoneWithPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	if err := h.service.BindPhoneWithPassword(userID.(uint), req.Phone, req.Password, req.Code); err != nil {
		utils.Error(c, 2020, err.Error())
		return
	}

	utils.Success(c, gin.H{"message": "Phone and password set successfully"})
}

// DeleteUser handles deleting a user account (admin only)
// This endpoint removes the user and all associated data except statistics
func (h *Handler) DeleteUser(c *gin.Context) {
	// Get user ID from URL parameter
	userIDStr := c.Param("id")
	userID, err := strconv.ParseUint(userIDStr, 10, 64)
	if err != nil {
		utils.BadRequest(c, "Invalid user ID")
		return
	}

	// Call service to delete the user
	if err := h.service.DeleteUser(uint(userID)); err != nil {
		utils.Error(c, 3001, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "User deleted successfully", nil)
}

// CheckEmailAvailabilityRequest represents email availability check request
type CheckEmailAvailabilityRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// CheckEmailAvailability checks if an email is available for binding
func (h *Handler) CheckEmailAvailability(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req CheckEmailAvailabilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	available, err := h.service.CheckEmailAvailability(req.Email, userID.(uint))
	if err != nil {
		utils.Error(c, 2029, "Failed to check email availability")
		return
	}

	utils.Success(c, gin.H{
		"available": available,
		"email":     req.Email,
	})
}

// CheckPhoneAvailabilityRequest represents phone availability check request
type CheckPhoneAvailabilityRequest struct {
	Phone string `json:"phone" binding:"required,len=11"`
}

// CheckPhoneAvailability checks if a phone is available for binding
func (h *Handler) CheckPhoneAvailability(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req CheckPhoneAvailabilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	available, err := h.service.CheckPhoneAvailability(req.Phone, userID.(uint))
	if err != nil {
		utils.Error(c, 2030, "Failed to check phone availability")
		return
	}

	utils.Success(c, gin.H{
		"available": available,
		"phone":     req.Phone,
	})
}
