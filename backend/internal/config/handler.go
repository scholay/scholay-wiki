// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================
//
// Handler 核心：接口定义、Handler 结构体、构造与 Setter、RegisterRoutes
// 具体业务处理函数已按职责拆分至：
//   - handler_policy.go      隐私政策 / 服务条款
//   - handler_email_sms.go   邮件 SMTP / 短信 SMS
//   - handler_system.go      系统配置（邮箱验证、Turnstile）
//   - handler_oauth.go       OAuth 提供商（GitHub/Google/ORCID/Microsoft/Apple/Discourse SSO）
//   - handler_snippets.go    代码片段（SEO / 广告 / 分析）
//   - handler_ssr.go         SSR 代码片段注入 & 动态 Sitemap

package config

import (
	"time"

	appconfig "scholar-backend/internal/common/config"

	"github.com/gin-gonic/gin"
)

// UsageLogService 定义 usagelog service 接口（避免循环依赖）
type UsageLogService interface {
	GetPopularPaperIDs(days int, limit int) ([]PopularPaper, error)
}

// PopularPaper 热门论文记录（从 usagelog 包复制，避免循环依赖）
type PopularPaper struct {
	PaperID string `json:"paper_id"`
	Count   int64  `json:"count"`
}

// PaperSEOProvider 由 seo.Service 实现，用于 /paper/{slug} 路由的 SSR 元数据注入
type PaperSEOProvider interface {
	ResolveSlug(slug string) (*PaperSEOMeta, error)
}

// PaperSEOMeta SSR 注入所需的最小元数据集
type PaperSEOMeta struct {
	PaperID  string
	Title    string
	Abstract string
	Year     *int
	Venue    string
	DOI      string
	Authors  []string
}

// htmlCacheEntry stores a cached HTML page with its expiry time
type htmlCacheEntry struct {
	html      string
	fetchedAt time.Time
}

// Handler handles HTTP requests for configuration operations
type Handler struct {
	service *Service

	// SSR 渲染相关：缓存与前端地址单独封装
	ssrCache    *ssrCache
	frontendURL string

	// 动态 sitemap 依赖（保留以维持 Setter 契约）
	usageLogService UsageLogService

	// 论文详情页 SSR 元数据提供者（/paper/{slug}）
	paperSEOProvider PaperSEOProvider
}

// NewHandler creates a new config handler
func NewHandler(service *Service) *Handler {
	frontendURL := ""
	if appconfig.AppConfig != nil {
		frontendURL = appconfig.AppConfig.App.FrontendUserURL
	}
	if frontendURL == "" {
		frontendURL = "http://frontend-user:80"
	}

	return &Handler{
		service:     service,
		frontendURL: frontendURL,
		ssrCache:    newSSRCache(indexHTMLCacheTTL),
	}
}

// SetUsageLogService 设置 usagelog service（用于动态 sitemap 生成）
func (h *Handler) SetUsageLogService(service UsageLogService) {
	h.usageLogService = service
}

// SetPaperSEOProvider 设置论文 SSR 元数据提供者
func (h *Handler) SetPaperSEOProvider(p PaperSEOProvider) {
	h.paperSEOProvider = p
}

// RegisterRoutes registers config routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	config := router.Group("/config")
	{
		// Public endpoints
		config.GET("/privacy-policy", h.GetPrivacyPolicy)
		config.GET("/terms-of-service", h.GetTermsOfService)
		config.GET("/system", h.GetSystemConfig)
		// 用户端代码片段（公开接口）
		config.GET("/code-snippets", h.GetCodeSnippetsForUser)
	}
}
