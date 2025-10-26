package user

import (
	"scholar-backend/internal/common/utils"

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

// SendCodeRequest represents a send verification code request
type SendCodeRequest struct {
	Email   string `json:"email" binding:"required,email"`
	Purpose string `json:"purpose" binding:"required,oneof=register login reset_password"`
}

// RegisterRequest represents a registration request
type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
	Code     string `json:"code" binding:"required"`
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

// RegisterRoutes registers user routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	user := router.Group("/user")
	{
		user.POST("/send-code", h.SendVerificationCode)
		user.POST("/register", h.Register)
		user.POST("/login", h.Login)
		// Protected routes will be added in the main server setup with middleware
	}
}
