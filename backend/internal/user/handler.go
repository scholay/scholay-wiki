// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package user

import (
	"encoding/json"
	"scholar-backend/internal/common/turnstile"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/config"
	"scholar-backend/internal/currency"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// WeChatService interface for WeChat OAuth operations
type WeChatService interface {
	GetAccessToken(code string) (accessToken, openID, unionID string, err error)
	GetUserInfo(accessToken, openID string) (nickname, headImgURL, unionID string, err error)
}

// OnlineStatsProvider 提供在线统计的接口（由 WebSocket Hub 实现）
type OnlineStatsProvider interface {
	GetOnlineUserCount() int
	GetOnlineGuestCount() int
}

// Handler handles HTTP requests for user operations
type Handler struct {
	service             *Service
	wechatService       WeChatService
	userRepo            *Repository
	configRepo          *config.Repository
	currencyService     *currency.Service
	onlineStatsProvider OnlineStatsProvider
}

// NewHandler creates a new user handler
func NewHandler(service *Service, db *gorm.DB) *Handler {
	return &Handler{
		service:       service,
		wechatService: nil, // Will be set via SetWeChatService
		userRepo:      NewRepository(db),
		configRepo:    config.NewRepository(db),
	}
}

// SetWeChatService sets the WeChat service
func (h *Handler) SetWeChatService(wechatService WeChatService) {
	h.wechatService = wechatService
}

// SetCurrencyService sets the currency service
func (h *Handler) SetCurrencyService(currencyService *currency.Service) {
	h.currencyService = currencyService
}

// SetOnlineStatsProvider 设置在线统计提供者（WebSocket Hub）
func (h *Handler) SetOnlineStatsProvider(provider OnlineStatsProvider) {
	h.onlineStatsProvider = provider
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
	Token            string `json:"token"`
	User             *User  `json:"user"`
	RegisterGiftGold int64  `json:"register_gift_gold,omitempty"` // 注册赠送经费金额（仅注册时返回）
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
	WeChatOpenID  *string    `json:"wechat_openid"`   // WeChat OpenID if bound
	WeChatName    *string    `json:"wechat_name"`     // WeChat nickname if bound
	GitHubID      *string    `json:"github_id"`       // GitHub ID if bound
	GitHubLogin   *string    `json:"github_login"`    // GitHub login username if bound
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

	user, token, err := h.service.RegisterWithEmailAndInvitation(req.Email, req.Password, req.Code, req.InvitationCode, ip)
	if err != nil {
		utils.Error(c, 2002, err.Error())
		return
	}

	// Create session for the new user
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour) // 30 days session

	// 获取注册赠送经费金额
	registerGiftGold := h.service.GetRegisterGiftAmount()

	utils.Success(c, AuthResponse{
		Token:            token,
		User:             user,
		RegisterGiftGold: registerGiftGold,
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
	var wechatName *string
	wechatProvider, err := h.service.repo.FindAuthProviderByUserAndProvider(userID.(uint), "wechat")
	if err == nil && wechatProvider != nil {
		wechatOpenID = &wechatProvider.ProviderUserID
		// Try to get WeChat nickname from provider_data first
		if wechatProvider.ProviderData != nil {
			// Parse JSON to extract nickname field
			// Expected format: {"nickname":"xxx","avatar_url":"xxx"}
			var providerData map[string]interface{}
			if err := json.Unmarshal([]byte(*wechatProvider.ProviderData), &providerData); err == nil {
				if nickname, ok := providerData["nickname"].(string); ok && nickname != "" {
					wechatName = &nickname
				}
			}
		}
		// Fallback to username if provider_data doesn't have nickname
		if wechatName == nil && user.Username != nil && *user.Username != "" {
			wechatName = user.Username
		}
	}

	// Check if GitHub is bound
	var githubID *string
	var githubLogin *string
	githubProvider, err := h.service.repo.FindAuthProviderByUserAndProvider(userID.(uint), "github")
	if err == nil && githubProvider != nil {
		githubID = &githubProvider.ProviderUserID
		// Try to extract GitHub login from provider_data JSON
		if githubProvider.ProviderData != nil {
			// Parse JSON to extract login field
			// Expected format: {"login":"username","name":"Full Name","avatar_url":"..."}
			var providerData map[string]interface{}
			if err := json.Unmarshal([]byte(*githubProvider.ProviderData), &providerData); err == nil {
				if login, ok := providerData["login"].(string); ok && login != "" {
					githubLogin = &login
				}
			}
		}
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
		WeChatName:    wechatName,
		GitHubID:      githubID,
		GitHubLogin:   githubLogin,
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

	// 获取注册赠送经费金额
	registerGiftGold := h.service.GetRegisterGiftAmount()

	utils.Success(c, AuthResponse{
		Token:            token,
		User:             user,
		RegisterGiftGold: registerGiftGold,
	})
}

// LoginWithPhone handles user login with phone
func (h *Handler) LoginWithPhone(c *gin.Context) {
	var req LoginPhoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
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

// UnbindGitHub handles unbinding GitHub from user account
func (h *Handler) UnbindGitHub(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	err := h.service.UnbindGitHub(userID.(uint))
	if err != nil {
		utils.Error(c, 2029, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "GitHub unbound successfully", nil)
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
// 性能优化版本：只返回列表必需的数据，详细信息通过 GetUserDetail 获取
func (h *Handler) GetUserList(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	sortBy := c.DefaultQuery("sort_by", "last_login_at")   // 排序字段: last_login_at, created_at
	sortOrder := c.DefaultQuery("sort_order", "desc")       // 排序方向: asc, desc

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	// 验证排序字段
	validSortFields := map[string]bool{"last_login_at": true, "created_at": true}
	if !validSortFields[sortBy] {
		sortBy = "last_login_at"
	}
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}

	users, total, err := h.service.GetUserListWithSort(page, pageSize, sortBy, sortOrder)
	if err != nil {
		utils.Error(c, 2008, "Failed to get user list")
		return
	}

	// Get user IDs for fetching subscriptions
	userIDs := make([]uint, len(users))
	for i, user := range users {
		userIDs[i] = user.ID
	}

	// 响应结构体 - 精简版，只包含列表必需的字段
	type SubscriptionInfo struct {
		PlanCode      string     `json:"plan_code"`
		PlanName      string     `json:"plan_name"`
		Status        string     `json:"status"`
		EndDate       *time.Time `json:"end_date,omitempty"`
		RemainingDays int        `json:"remaining_days"`
		AutoRenew     bool       `json:"auto_renew"`
	}

	type UserResponse struct {
		User
		Subscription *SubscriptionInfo `json:"subscription,omitempty"`
	}

	// 只查询订阅信息（会员筛选需要）
	var subscriptions []struct {
		UserID    uint       `gorm:"column:user_id"`
		PlanCode  string     `gorm:"column:plan_code"`
		PlanName  string     `gorm:"column:plan_name"`
		Status    string     `gorm:"column:status"`
		EndDate   *time.Time `gorm:"column:end_date"`
		AutoRenew bool       `gorm:"column:auto_renew"`
	}
	h.service.repo.GetDB().Table("user_subscriptions").
		Select("user_subscriptions.user_id, user_subscriptions.plan_code, subscription_plans.plan_name, user_subscriptions.status, user_subscriptions.end_date, user_subscriptions.auto_renew").
		Joins("LEFT JOIN subscription_plans ON user_subscriptions.plan_code = subscription_plans.plan_code").
		Where("user_subscriptions.user_id IN ? AND user_subscriptions.status = ?", userIDs, "active").
		Scan(&subscriptions)

	// Map subscriptions by user ID
	subscriptionMap := make(map[uint]*SubscriptionInfo)
	for _, sub := range subscriptions {
		remainingDays := 0
		if sub.EndDate != nil {
			remainingDays = int(time.Until(*sub.EndDate).Hours() / 24)
			if remainingDays < 0 {
				remainingDays = 0
			}
		}
		subscriptionMap[sub.UserID] = &SubscriptionInfo{
			PlanCode:      sub.PlanCode,
			PlanName:      sub.PlanName,
			Status:        sub.Status,
			EndDate:       sub.EndDate,
			RemainingDays: remainingDays,
			AutoRenew:     sub.AutoRenew,
		}
	}

	// 构建精简响应
	userResponses := make([]UserResponse, len(users))
	for i, user := range users {
		response := UserResponse{User: user}

		// Add subscription info
		if subInfo, ok := subscriptionMap[user.ID]; ok {
			response.Subscription = subInfo
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
// 基于 WebSocket 连接状态返回在线统计
func (h *Handler) GetOnlineUsers(c *gin.Context) {
	if h.onlineStatsProvider != nil {
		// 使用 WebSocket 连接状态
		onlineUsers := h.onlineStatsProvider.GetOnlineUserCount()
		onlineGuests := h.onlineStatsProvider.GetOnlineGuestCount()

		utils.Success(c, gin.H{
			"online_users":  onlineUsers,
			"online_guests": onlineGuests,
			"total_online":  onlineUsers + onlineGuests,
		})
		return
	}

	// 回退到旧逻辑（数据库查询）
	users, err := h.service.GetOnlineUsers()
	if err != nil {
		utils.Error(c, 2009, "Failed to get online users")
		return
	}

	utils.Success(c, gin.H{
		"online_users": len(users),
	})
}

// GetUserDetail handles getting detailed user information (admin only)
func (h *Handler) GetUserDetail(c *gin.Context) {
	userIDStr := c.Param("id")
	userID, err := strconv.ParseUint(userIDStr, 10, 64)
	if err != nil {
		utils.BadRequest(c, "Invalid user ID")
		return
	}

	detail, err := h.service.GetUserDetail(uint(userID))
	if err != nil {
		utils.Error(c, 2030, "Failed to get user detail: "+err.Error())
		return
	}

	utils.Success(c, detail)
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
		if err.Error() == "session expired, please login again" {
			// 会话超过30天，需要重新登录
			utils.Error(c, 2016, err.Error())
			return
		}
		if err.Error() == "session not found" {
			// 会话不存在，可能是被其他设备登录踢出
			utils.Error(c, 2019, "您的账号已在其他设备登录")
			return
		}
		utils.Error(c, 2017, "Failed to refresh token: "+err.Error())
		return
	}

	utils.Success(c, map[string]interface{}{
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
		utils.Error(c, 2018, "Failed to get token info: "+err.Error())
		return
	}

	utils.Success(c, info)
}

// ChangePassword handles user password change
func (h *Handler) ChangePassword(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	var req struct {
		CurrentPassword string `json:"current_password" binding:"required"`
		NewPassword     string `json:"new_password" binding:"required,min=8"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	err := h.service.ChangePassword(userID.(uint), req.CurrentPassword, req.NewPassword)
	if err != nil {
		if err.Error() == "current password is incorrect" {
			utils.Error(c, 2012, "Current password is incorrect")
			return
		}
		utils.Error(c, 2013, "Failed to change password")
		return
	}

	utils.SuccessWithMessage(c, "Password changed successfully", nil)
}

// NOTE: Heartbeat 接口已移除，由 WebSocket 连接替代
// WebSocket 在连接建立和收到 ping 消息时会自动更新 session activity

// GetUserStatisticsChart handles getting user statistics chart data (admin only)
// 支持自定义时间范围和时间粒度
// Query params:
//   - start_time: 开始时间 (格式: 2006-01-02 15:04:05)
//   - end_time: 结束时间 (格式: 2006-01-02 15:04:05)
//   - granularity: 时间粒度 (hour, day, week, month)
func (h *Handler) GetUserStatisticsChart(c *gin.Context) {
	// 解析时间范围参数
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	granularity := c.Query("granularity")

	// 默认值：最近30天，按天统计
	if granularity == "" {
		granularity = "day"
	}

	// 验证粒度参数
	validGranularities := map[string]bool{"hour": true, "day": true, "week": true, "month": true}
	if !validGranularities[granularity] {
		utils.Error(c, 2012, "Invalid granularity, must be one of: hour, day, week, month")
		return
	}

	var startTime, endTime time.Time
	var err error
	loc := time.Local

	if startTimeStr != "" {
		startTime, err = time.ParseInLocation("2006-01-02 15:04:05", startTimeStr, loc)
		if err != nil {
			utils.Error(c, 2012, "Invalid start_time format, expected: 2006-01-02 15:04:05")
			return
		}
	} else {
		// 默认开始时间：30天前
		startTime = time.Now().AddDate(0, 0, -29)
		startTime = time.Date(startTime.Year(), startTime.Month(), startTime.Day(), 0, 0, 0, 0, loc)
	}

	if endTimeStr != "" {
		endTime, err = time.ParseInLocation("2006-01-02 15:04:05", endTimeStr, loc)
		if err != nil {
			utils.Error(c, 2012, "Invalid end_time format, expected: 2006-01-02 15:04:05")
			return
		}
	} else {
		// 默认结束时间：当前时间
		endTime = time.Now()
	}

	// 验证时间范围
	if endTime.Before(startTime) {
		utils.Error(c, 2012, "end_time must be after start_time")
		return
	}

	data, err := h.service.GetUserStatisticsChartWithGranularity(startTime, endTime, granularity)
	if err != nil {
		utils.Error(c, 2012, "Failed to get user statistics: "+err.Error())
		return
	}

	utils.Success(c, map[string]interface{}{
		"statistics":  data,
		"start_time":  startTime.Format("2006-01-02 15:04:05"),
		"end_time":    endTime.Format("2006-01-02 15:04:05"),
		"granularity": granularity,
	})
}

// GetOnlineUserChart handles getting online user chart data (admin only)
// 支持自定义时间范围和时间粒度
// Query params:
//   - start_time: 开始时间 (格式: 2006-01-02 15:04:05)
//   - end_time: 结束时间 (格式: 2006-01-02 15:04:05)
//   - granularity: 时间粒度 (5min, hour)
//   - hours: 兼容旧接口，查询最近N小时的数据
func (h *Handler) GetOnlineUserChart(c *gin.Context) {
	// 解析时间范围参数
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	granularity := c.Query("granularity")

	// 默认值
	if granularity == "" {
		granularity = "5min"
	}

	// 验证粒度参数
	validGranularities := map[string]bool{"5min": true, "hour": true}
	if !validGranularities[granularity] {
		utils.Error(c, 2013, "Invalid granularity, must be one of: 5min, hour")
		return
	}

	var startTime, endTime time.Time
	var err error
	loc := time.Local

	// 兼容旧接口：如果没有提供 start_time/end_time，使用 hours 参数
	if startTimeStr == "" && endTimeStr == "" {
		hours := 24
		if hoursParam := c.Query("hours"); hoursParam != "" {
			if parsedHours, err := strconv.Atoi(hoursParam); err == nil && parsedHours > 0 {
				hours = parsedHours
			}
		}
		endTime = time.Now()
		startTime = endTime.Add(-time.Duration(hours) * time.Hour)
	} else {
		if startTimeStr != "" {
			startTime, err = time.ParseInLocation("2006-01-02 15:04:05", startTimeStr, loc)
			if err != nil {
				utils.Error(c, 2013, "Invalid start_time format, expected: 2006-01-02 15:04:05")
				return
			}
		} else {
			startTime = time.Now().Add(-24 * time.Hour)
		}

		if endTimeStr != "" {
			endTime, err = time.ParseInLocation("2006-01-02 15:04:05", endTimeStr, loc)
			if err != nil {
				utils.Error(c, 2013, "Invalid end_time format, expected: 2006-01-02 15:04:05")
				return
			}
		} else {
			endTime = time.Now()
		}
	}

	// 验证时间范围
	if endTime.Before(startTime) {
		utils.Error(c, 2013, "end_time must be after start_time")
		return
	}

	data, err := h.service.GetOnlineUserChartDataWithGranularity(startTime, endTime, granularity)
	if err != nil {
		utils.Error(c, 2013, "Failed to get online user chart data: "+err.Error())
		return
	}

	utils.Success(c, map[string]interface{}{
		"snapshots":   data,
		"start_time":  startTime.Format("2006-01-02 15:04:05"),
		"end_time":    endTime.Format("2006-01-02 15:04:05"),
		"granularity": granularity,
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

		// Token management (public endpoints for refresh)
		user.POST("/refresh-token", h.RefreshToken)
		user.GET("/token-info", h.GetTokenInfo)

		// Protected routes will be added in the main server setup with middleware
	}
}

// WeChatCallbackRequest represents WeChat OAuth callback request
type WeChatCallbackRequest struct {
	Code           string `json:"code" binding:"required"`
	State          string `json:"state" binding:"required"`
	InvitationCode string `json:"invitation_code"` // 邀请码（可选）
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
	ip := c.ClientIP()
	user, token, isNewUser, err := h.service.LoginOrRegisterWithWeChat(
		openID,
		unionID,
		nickname,
		headImgURL,
		ip,
		req.InvitationCode, // 传递邀请码
	)
	if err != nil {
		utils.Error(c, 5003, "微信登录失败："+err.Error())
		return
	}

	// Create session (30 days session, token expires in 2 hours)
	userAgent := c.GetHeader("User-Agent")
	_ = h.service.CreateSession(user.ID, token, ip, userAgent, 30*24*time.Hour)

	response := gin.H{
		"token":       token,
		"user":        user,
		"is_new_user": isNewUser,
	}

	// 如果是新用户，返回注册赠送经费金额
	if isNewUser {
		response["register_gift_gold"] = h.service.GetRegisterGiftAmount()
	}

	utils.Success(c, response)
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

// TaskHistoryItem represents a unified task history item
type TaskHistoryItem struct {
	ID        uint      `json:"id"`
	Type      string    `json:"type"`       // "smart_analysis" | "peer_review"
	Title     string    `json:"title"`
	Status    string    `json:"status"`     // 任务状态
	UpdatedAt time.Time `json:"updated_at"`
}

// TaskHistoryDayGroup represents tasks grouped by day
type TaskHistoryDayGroup struct {
	Date   string            `json:"date"`   // 日期标签: "今天", "昨天", "2天前" 等
	Tasks  []TaskHistoryItem `json:"tasks"`  // 该天的任务列表
	Total  int               `json:"total"`  // 该天任务总数
}

// GetTaskHistory gets unified task history for the current user, grouped by day
// GET /api/v1/user/task-history?days=3&limit_per_day=20
func (h *Handler) GetTaskHistory(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		utils.Unauthorized(c, "User not authenticated")
		return
	}

	// 获取参数：最近几天，每天最多多少条
	days, _ := strconv.Atoi(c.DefaultQuery("days", "3"))
	if days < 1 || days > 7 {
		days = 3
	}
	limitPerDay, _ := strconv.Atoi(c.DefaultQuery("limit_per_day", "20"))
	if limitPerDay < 1 || limitPerDay > 50 {
		limitPerDay = 20
	}

	// 计算时间范围：最近N天
	now := time.Now()
	startOfToday := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	startDate := startOfToday.AddDate(0, 0, -(days - 1)) // 包含今天

	// Query conversations (type=search) - 智能分析
	var conversations []struct {
		ID        uint      `gorm:"column:id"`
		Title     string    `gorm:"column:title"`
		UpdatedAt time.Time `gorm:"column:updated_at"`
	}
	h.userRepo.GetDB().Table("conversations").
		Select("id, title, updated_at").
		Where("user_id = ? AND conversation_type = ? AND updated_at >= ?", userID.(uint), "search", startDate).
		Order("updated_at DESC").
		Scan(&conversations)

	// Query peer_review_tasks (non-draft) - AI审稿
	var peerReviewTasks []struct {
		ID        uint      `gorm:"column:id"`
		Title     string    `gorm:"column:title"`
		Status    string    `gorm:"column:status"`
		UpdatedAt time.Time `gorm:"column:updated_at"`
	}
	h.userRepo.GetDB().Table("peer_review_tasks").
		Select("id, title, status, updated_at").
		Where("user_id = ? AND status != ? AND updated_at >= ?", userID.(uint), "draft", startDate).
		Order("updated_at DESC").
		Scan(&peerReviewTasks)

	// 合并所有任务
	allItems := make([]TaskHistoryItem, 0, len(conversations)+len(peerReviewTasks))

	for _, conv := range conversations {
		allItems = append(allItems, TaskHistoryItem{
			ID:        conv.ID,
			Type:      "smart_analysis",
			Title:     conv.Title,
			Status:    "completed",
			UpdatedAt: conv.UpdatedAt,
		})
	}

	for _, task := range peerReviewTasks {
		title := task.Title
		if title == "" {
			title = "AI审稿任务"
		}
		allItems = append(allItems, TaskHistoryItem{
			ID:        task.ID,
			Type:      "peer_review",
			Title:     title,
			Status:    task.Status,
			UpdatedAt: task.UpdatedAt,
		})
	}

	// 按天分组
	dayGroups := make(map[string][]TaskHistoryItem)
	dayOrder := make([]string, 0, days) // 保持天的顺序

	for _, item := range allItems {
		itemDate := time.Date(item.UpdatedAt.Year(), item.UpdatedAt.Month(), item.UpdatedAt.Day(), 0, 0, 0, 0, now.Location())
		diffDays := int(startOfToday.Sub(itemDate).Hours() / 24)

		var dateLabel string
		switch diffDays {
		case 0:
			dateLabel = "今天"
		case 1:
			dateLabel = "昨天"
		default:
			dateLabel = strconv.Itoa(diffDays) + "天前"
		}

		if _, exists := dayGroups[dateLabel]; !exists {
			dayOrder = append(dayOrder, dateLabel)
		}
		dayGroups[dateLabel] = append(dayGroups[dateLabel], item)
	}

	// 对每天的任务按时间排序，并限制数量
	result := make([]TaskHistoryDayGroup, 0, len(dayOrder))
	
	// 按照 今天 -> 昨天 -> N天前 的顺序排序
	sortedDays := []string{"今天", "昨天"}
	for i := 2; i < days; i++ {
		sortedDays = append(sortedDays, strconv.Itoa(i)+"天前")
	}

	for _, dateLabel := range sortedDays {
		tasks, exists := dayGroups[dateLabel]
		if !exists || len(tasks) == 0 {
			continue
		}

		// 对该天的任务按时间倒序排序
		for i := 0; i < len(tasks)-1; i++ {
			for j := i + 1; j < len(tasks); j++ {
				if tasks[j].UpdatedAt.After(tasks[i].UpdatedAt) {
					tasks[i], tasks[j] = tasks[j], tasks[i]
				}
			}
		}

		totalCount := len(tasks)
		// 限制每天的任务数量
		if len(tasks) > limitPerDay {
			tasks = tasks[:limitPerDay]
		}

		result = append(result, TaskHistoryDayGroup{
			Date:  dateLabel,
			Tasks: tasks,
			Total: totalCount,
		})
	}

	utils.Success(c, gin.H{
		"groups": result,
	})
}
