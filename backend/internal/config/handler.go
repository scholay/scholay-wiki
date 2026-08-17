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
	"context"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/seo"

	"github.com/gin-gonic/gin"
)

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

// PaperCorpusProvider / AuthorCorpusProvider —— 「抓取前沿必须闭合在自己的语料上」。
//
// 论文页把 authors_json 里的作者渲染成 /author/{source}/{id} 内链、作者页把 top_works
// 渲染成 /paper/{source}/{id} 内链;这些 ID 来自上游,绝大多数在我们库里**没有对应行**。
// 于是每渲染一个实体页,就等于给爬虫发了 3~25 个新的未落地 URL,爬虫顺着爬 → on-miss →
// 建行 → 又吐出新链接,沿整张学术图谱指数扩散(生产 24h:新建 4.5 万论文 + 7.4 万作者)。
// 渲染前批量核对一次「哪些已落地」,未落地的降级成纯文本,爬取前沿就闭合了。
//
// 与 ToolSEOListingProvider 同一模式(可选接口 + 类型断言):轻量测试桩不必实现;
// 生产上 seo.Service 两个都实现,断言必中。
type PaperCorpusProvider interface {
	ExistingPaperIDs(paperIDs []string) (map[string]bool, error)
}

type AuthorCorpusProvider interface {
	ExistingAuthorIDs(authorIDs []string) (map[string]bool, error)
}

// JournalSEOProvider 由 seo.Service 直接实现, 用于期刊详情页 SSR 元数据注入。
type JournalSEOProvider interface {
	ResolveByJournalID(journalID int64) (*seo.JournalSSRMeta, error)
}

// JournalHubProvider 由 seo.Service 直接实现, 用于期刊枢纽页 SSR
// (/journals/browse | /journals/category/{slug}[/{page}] | /journals/country/{cc}[/{page}]
// | /journals/warning | /journals/oa[/{page}])。
// 刻意与 JournalSEOProvider 分开:详情 resolver 的测试桩不该被枢纽方法拖着一起实现。
type JournalHubProvider interface {
	GetJournalHubOverview() (*seo.JournalHubOverview, error)
	// GetJournalHubList 返回 (nil, nil) 表示维度键不存在(SSR 侧 404)。
	GetJournalHubList(dimension, key string, page, perPage int) (*seo.JournalHubList, error)
}

// ToolSEOProvider 由 featuretool.Service 实现, 用于功能广场工具详情页 (/tools/{slug}) SSR 元数据注入。
type ToolSEOProvider interface {
	ResolveToolBySlug(slug string) (*seo.ToolSSRMeta, error)
}

// ToolSEOListingProvider is optional and intentionally separate from the
// detail resolver so lightweight test/provider implementations keep working.
// Production featuretool.Service implements it to expose approved internal
// links in the server-rendered /tools discovery hub.
type ToolSEOListingProvider interface {
	ListIndexableToolsForSEO(limit int) ([]*seo.ToolSSRMeta, error)
}

// NewsSEOProvider 由 news.Service 实现, 用于情报详情页 (/news/{slug}) + 列表页 (/news) SSR 注入。
//   - ResolveNewsBySlug:详情页全文 + 元数据(功能未开启时返回 nil,SSR 走默认壳)
//   - RecentNewsForSEO :列表页 noscript 链接列表(供爬虫从 /news 发现各详情页)
type NewsSEOProvider interface {
	ResolveNewsBySlug(slug string) (*seo.NewsSSRMeta, error)
	RecentNewsForSEO(limit int) ([]*seo.NewsSSRMeta, error)
}

// PaperEnricher 由 seoenrich.Enricher 实现(可选,bootstrap 仅在 SEO_ENRICH_ENABLED 时注入)。
// M2 方案 A:canonical /paper/{source}/{id} 命中但 seo 无行(冷门 URL)时,SSR 现场拉一次 minicod
// 落库并返回 meta;拉不到返回 (nil,nil),调用方回落 noindex。未注入(默认)时不改变行为。
type PaperEnricher interface {
	EnrichPaperOnMiss(ctx context.Context, source, paperID string) (*seo.PaperSSRMeta, error)
}

// AuthorEnricher 同 PaperEnricher,作者维度(冷门作者 URL 现拉机构/指标/代表作落库)。
type AuthorEnricher interface {
	EnrichAuthorOnMiss(ctx context.Context, source, authorID string) (*seo.AuthorSSRMeta, error)
}

// Handler handles HTTP requests for configuration operations
type Handler struct {
	service *Service

	// SSR 渲染相关：缓存与前端地址单独封装
	ssrCache    *ssrCache
	frontendURL string

	// 论文详情页 SSR 元数据提供者（/paper/{slug}）
	paperSEOProvider PaperSEOProvider

	// 作者详情页 SSR 元数据提供者（/author/{slug}）
	authorSEOProvider AuthorSEOProvider

	// 期刊详情页 SSR 元数据提供者 (/journal/{id} / /journal/{id}/{slug})
	journalSEOProvider JournalSEOProvider

	// 期刊枢纽页 SSR 数据提供者 (/journals/browse 等发现层路由)
	journalHubProvider JournalHubProvider

	// 功能广场工具详情页 SSR 元数据提供者 (/tools/{slug})
	toolSEOProvider ToolSEOProvider

	// 情报详情/列表页 SSR 元数据提供者 (/news/{slug} / /news)
	newsSEOProvider NewsSEOProvider

	// 论文 / 作者 SSR 冷门 URL 现拉回填(M2,可选;仅 SEO_ENRICH_ENABLED 时注入)
	paperEnricher  PaperEnricher
	authorEnricher AuthorEnricher

	// on-miss 现拉的准入闸门(爬虫 UA + 每小时预算 + 单 IP 上限)。
	// 见 ssr_onmiss_gate.go 文件头:这条路径曾占上游调用量的 94%。
	onMissGate *onMissGate

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
		onMissGate:  newOnMissGate(appconfig.SEOOnMissHourlyBudget(), onMissPerIPHourly),
	}
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

// SetJournalHubProvider 设置期刊枢纽页 SSR 数据提供者
func (h *Handler) SetJournalHubProvider(p JournalHubProvider) {
	h.journalHubProvider = p
}

// SetToolSEOProvider 设置功能广场工具 SSR 元数据提供者
func (h *Handler) SetToolSEOProvider(p ToolSEOProvider) {
	h.toolSEOProvider = p
}

// SetPaperEnricher 注入论文冷门 URL 现拉回填器(M2;bootstrap 仅在启用时调用)。
func (h *Handler) SetPaperEnricher(e PaperEnricher) {
	h.paperEnricher = e
}

// SetAuthorEnricher 注入作者冷门 URL 现拉回填器(M2;bootstrap 仅在启用时调用)。
func (h *Handler) SetAuthorEnricher(e AuthorEnricher) {
	h.authorEnricher = e
}

// SetNewsSEOProvider 设置情报 SSR 元数据提供者
func (h *Handler) SetNewsSEOProvider(p NewsSEOProvider) {
	h.newsSEOProvider = p
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
