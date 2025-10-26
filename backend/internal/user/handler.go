package user

import (
	"scholar-backend/internal/common/utils"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// Handler handles HTTP requests for user operations
type Handler struct {
	service *Service
}

// NewHandler creates a new user handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
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
	Purpose string `json:"purpose" binding:"required,oneof=register login reset_password"`
}

// RegisterRequest represents a registration request
type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Code     string `json:"code"`
}

// LoginRequest represents a login request
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
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
		utils.Error(c, 2001, "Failed to send verification code")
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

	user, token, err := h.service.RegisterWithEmail(req.Email, req.Password, req.Code)
	if err != nil {
		utils.Error(c, 2002, err.Error())
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

// Login handles user login
func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "Invalid request: "+err.Error())
		return
	}

	user, token, err := h.service.LoginWithEmail(req.Email, req.Password)
	if err != nil {
		utils.Error(c, 2003, err.Error())
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

	utils.Success(c, user)
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

	err := h.service.UpdateProfile(userID.(uint), req.Username, req.AvatarURL)
	if err != nil {
		utils.Error(c, 2006, err.Error())
		return
	}

	utils.SuccessWithMessage(c, "Profile updated successfully", nil)
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

	utils.Success(c, gin.H{
		"users": users,
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

// RegisterRoutes registers user routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	user := router.Group("/user")
	{
		user.POST("/check-email", h.CheckEmail)
		user.POST("/send-code", h.SendVerificationCode)
		user.POST("/register", h.Register)
		user.POST("/login", h.Login)
		// Protected routes will be added in the main server setup with middleware
	}
}
