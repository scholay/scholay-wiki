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
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/seo"

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

// PaperSEOProvider 由 seo.Service 直接实现, 用于论文详情页 SSR 元数据注入。
//
// 类型从 config 包搬到了 seo 包 (seo.PaperSSRMeta), 因为 seo 才是数据所有者;
// 早期的 cmd/server/paperSEOProviderAdapter 已撤掉, 这里只剩接口契约。
//
// 两个解析入口对应两个路由:
//
//	ResolveSlug      → 老的 /paper/{slug} 直接根据 slug 反查 (legacy 301 流量)
//	ResolveByPaperID → 新 canonical /paper/{source}/{paperId}, source 当前未参与查询
//	                    (paperId 全局唯一), 保留 source 形参以便日后做多源去重。
type PaperSEOProvider interface {
	ResolveSlug(slug string) (*seo.PaperSSRMeta, error)
	ResolveByPaperID(source, paperID string) (*seo.PaperSSRMeta, error)
}

// AuthorSEOProvider 由 seo.Service 直接实现, 用于作者详情页 SSR 元数据注入。
type AuthorSEOProvider interface {
	ResolveAuthorSlug(slug string) (*seo.AuthorSSRMeta, error)
	ResolveByAuthorID(source, authorID string) (*seo.AuthorSSRMeta, error)
}

// JournalSEOProvider 由 seo.Service 直接实现, 用于期刊详情页 SSR 元数据注入。
type JournalSEOProvider interface {
	ResolveByJournalID(journalID int64) (*seo.JournalSSRMeta, error)
}

// ToolSEOProvider 由 featuretool.Service 实现, 用于功能广场工具详情页 (/tools/{slug}) SSR 元数据注入。
type ToolSEOProvider interface {
	ResolveToolBySlug(slug string) (*seo.ToolSSRMeta, error)
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

	// 作者详情页 SSR 元数据提供者（/author/{slug}）
	authorSEOProvider AuthorSEOProvider

	// 期刊详情页 SSR 元数据提供者 (/journal/{id} / /journal/{id}/{slug})
	journalSEOProvider JournalSEOProvider

	// 功能广场工具详情页 SSR 元数据提供者 (/tools/{slug})
	toolSEOProvider ToolSEOProvider

	// WeChat OAuth 启用探针 —— bootstrap 注入,handler_system.GetSystemConfig 用它
	// 决定 public 响应里 `wechat_enabled` 的值。这里用 probe 是为了避免 config 包
	// 直接 import wechat 包(那样会形成循环依赖:wechat → config → wechat)。
	wechatProbe func() bool
}

// SetWeChatOAuthEnabledProbe 注入 WeChat OAuth 启用探针。
// bootstrap 时 `cfgHandler.SetWeChatOAuthEnabledProbe(wechatService.IsLoginEnabled)`。
func (h *Handler) SetWeChatOAuthEnabledProbe(probe func() bool) {
	h.wechatProbe = probe
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

// SetAuthorSEOProvider 设置作者 SSR 元数据提供者
func (h *Handler) SetAuthorSEOProvider(p AuthorSEOProvider) {
	h.authorSEOProvider = p
}

// SetJournalSEOProvider 设置期刊 SSR 元数据提供者
func (h *Handler) SetJournalSEOProvider(p JournalSEOProvider) {
	h.journalSEOProvider = p
}

// SetToolSEOProvider 设置功能广场工具 SSR 元数据提供者
func (h *Handler) SetToolSEOProvider(p ToolSEOProvider) {
	h.toolSEOProvider = p
}

// RegisterRoutes registers config routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup) {
	config := router.Group("/config")
	{
		// 隐私政策 / 服务条款已下线 —— 前端 hardcode 在 legal-content.ts(见 0046 迁移)
		config.GET("/system", h.GetSystemConfig)
		// 用户端代码片段（公开接口）
		config.GET("/code-snippets", h.GetCodeSnippetsForUser)
	}
}
