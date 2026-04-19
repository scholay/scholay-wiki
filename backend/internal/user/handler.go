// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// Handler 核心：接口定义、Handler 结构体、构造与 Setter、RegisterRoutes
// 具体业务处理函数已按职责拆分至：
//   - handler_auth.go     认证（注册、登录、验证码、密码、Token）
//   - handler_profile.go  个人资料、绑定/解绑、可用性、任务历史
//   - handler_oauth.go    微信 OAuth 登录与绑定
//   - handler_admin.go    管理员专用接口

package user

import (
	"context"
	"time"

	ifaces "scholar-backend/internal/common/interfaces"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// WeChatService interface for WeChat OAuth operations
type WeChatService interface {
	GetAccessToken(code string) (accessToken, openID, unionID string, err error)
	GetUserInfo(accessToken, openID string) (nickname, headImgURL, unionID string, err error)
}

// ConversationQueryService provides conversation queries needed by user handler
type ConversationQueryService interface {
	GetRecentByUser(ctx context.Context, userID uint, convType string, since time.Time) ([]ConversationItemDTO, error)
}

// ConversationItemDTO mirrors conversation.RecentConversationItem
type ConversationItemDTO struct {
	ID        uint      `json:"id"`
	Title     string    `json:"title"`
	UpdatedAt time.Time `json:"updated_at"`
}

// PeerReviewQueryService provides peer review queries needed by user handler
type PeerReviewQueryService interface {
	GetRecentNonDraftTasks(userID uint, since time.Time) ([]PeerReviewItemDTO, error)
}

// PeerReviewItemDTO mirrors peerreview.RecentPeerReviewItem
type PeerReviewItemDTO struct {
	ID        uint      `json:"id"`
	Title     string    `json:"title"`
	Status    string    `json:"status"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Handler handles HTTP requests for user operations
type Handler struct {
	service             *Service
	wechatService       WeChatService
	onlineStatsProvider ifaces.OnlineStatsProvider
	conversationQuery   ConversationQueryService
	peerReviewQuery     PeerReviewQueryService
}

// NewHandler creates a new user handler
func NewHandler(service *Service, db *gorm.DB) *Handler {
	return &Handler{
		service:       service,
		wechatService: nil, // Will be set via SetWeChatService
	}
}

// SetWeChatService sets the WeChat service
func (h *Handler) SetWeChatService(wechatService WeChatService) {
	h.wechatService = wechatService
}

// SetOnlineStatsProvider 设置在线统计提供者（WebSocket Hub）
func (h *Handler) SetOnlineStatsProvider(provider ifaces.OnlineStatsProvider) {
	h.onlineStatsProvider = provider
}

// SetConversationQueryService sets the conversation query service
func (h *Handler) SetConversationQueryService(svc ConversationQueryService) {
	h.conversationQuery = svc
}

// SetPeerReviewQueryService sets the peer review query service
func (h *Handler) SetPeerReviewQueryService(svc PeerReviewQueryService) {
	h.peerReviewQuery = svc
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
