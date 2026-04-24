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
	"scholar-backend/internal/common/middleware"

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
		// 敏感认证接口严格限流（防暴力破解 / 防短信&邮件轰炸）
		// 登录/注册/改密 —— 每 IP 每分钟 30 次（普通用户足够，恶意扫号远达不到）
		// 发码类 —— 每 IP 每分钟 8 次（足够正常重试，但无法用于短信轰炸）
		authLimit := middleware.RateLimitMiddleware(30, time.Minute)
		codeLimit := middleware.RateLimitMiddleware(8, time.Minute)

		// Email-based auth
		user.POST("/check-email", h.CheckEmail)
		user.POST("/send-code", codeLimit, h.SendVerificationCode)
		user.POST("/register", authLimit, h.Register)
		user.POST("/login", authLimit, h.Login)
		user.POST("/login-with-code", authLimit, h.LoginWithCode)
		user.POST("/reset-password", authLimit, h.ResetPassword)

		// Phone-based auth
		user.POST("/check-phone", h.CheckPhone)
		user.POST("/send-phone-code", codeLimit, h.SendPhoneVerificationCode)
		user.POST("/register-phone", authLimit, h.RegisterWithPhone)
		user.POST("/login-phone", authLimit, h.LoginWithPhone)
		user.POST("/login-phone-with-code", authLimit, h.LoginPhoneWithCode)
		user.POST("/reset-password-phone", authLimit, h.ResetPasswordPhone)

		// Token management (public endpoints for refresh)
		user.POST("/refresh-token", h.RefreshToken)
		user.GET("/token-info", h.GetTokenInfo)

		// Protected routes will be added in the main server setup with middleware
	}
}
