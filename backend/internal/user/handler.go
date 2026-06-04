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
	"time"

	"scholar-backend/internal/common/middleware"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// WeChatService interface for WeChat OAuth operations
type WeChatService interface {
	GetAccessToken(code string) (accessToken, openID, unionID string, err error)
	GetUserInfo(accessToken, openID string) (nickname, headImgURL, unionID string, err error)
}

// Handler handles HTTP requests for user operations
type Handler struct {
	service       *Service
	wechatService WeChatService
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

// RegisterRoutes registers user routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	user := router.Group("/user")
	{
		// 敏感认证接口严格限流（防暴力破解 / 防短信&邮件轰炸）
		// 登录/注册/改密 —— 每 IP 每分钟 30 次（普通用户足够，恶意扫号远达不到）
		// 发码类 —— 每 IP 每分钟 8 次（足够正常重试，但无法用于短信轰炸）
		authLimit := middleware.RateLimitMiddleware(30, time.Minute)
		codeLimit := middleware.RateLimitMiddleware(8, time.Minute)

		// 注:/check-email 与 /check-phone(返回 {exists}) 已下线 —— 它们是纯账号枚举
		// 探针,且前端无任何消费者。登录改为统一「邮箱/手机号或密码错误」+ 恒定耗时,
		// 不再从任何登录路径泄露账号是否存在。CheckEmail/CheckPhone handler 保留为死代码,
		// 不再注册路由。

		// Email-based auth
		user.POST("/send-code", codeLimit, h.SendVerificationCode)
		user.POST("/register", authLimit, h.Register)
		user.POST("/login", authLimit, h.Login)
		user.POST("/login-with-code", authLimit, h.LoginWithCode)
		user.POST("/reset-password", authLimit, h.ResetPassword)

		// Phone-based auth
		user.POST("/send-phone-code", codeLimit, h.SendPhoneVerificationCode)
		user.POST("/register-phone", authLimit, h.RegisterWithPhone)
		user.POST("/login-phone", authLimit, h.LoginWithPhone)
		user.POST("/login-phone-with-code", authLimit, h.LoginPhoneWithCode)
		user.POST("/reset-password-phone", authLimit, h.ResetPasswordPhone)

		// Protected routes will be added in the main server setup with middleware
	}
}
