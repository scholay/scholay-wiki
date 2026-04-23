// ============================================================================
// Scholay学术 V1.0
// SEO HTTP Handler
//
// 暴露三类 endpoint：
//   1. 搜索曝光批量 seed           POST /api/v1/public/seo/expose
//   2. sitemap 索引文件              GET  /sitemap.xml
//   3. sitemap 分片（静态 / 分页论文）
//        GET  /sitemap-static.xml
//        GET  /sitemap-papers-{N}.xml
//
// sitemap 通过 Redis 做 version-based 缓存（版本号由 Service.invalidateSitemapCache 驱动）
// ============================================================================

package seo

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

const (
	sitemapCacheKey     = "seo:sitemap:cache"
	sitemapVersionKey   = "seo:sitemap:version"
	sitemapCacheTTL     = 6 * time.Hour
	sitemapSummaryTTL   = 10 * time.Minute // 索引页允许稍短 TTL，保证新写入的论文能更快上 sitemap
	sitemapBrowserCache = 3600             // 浏览器/CDN 端缓存 1h
	sitemapSummaryCache = 900              // 索引页浏览器缓存 15m
)

// baseURL 站点权威域名（sitemap 全部 <loc> 前缀）
// 读 SEO_BASE_URL 环境变量，默认 https://scholay.com
func baseURL() string {
	return appconfig.CanonicalBaseURL()
}

// Handler HTTP 处理器
type Handler struct {
	service *Service
}

// NewHandler 构造
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// ExposeRequest 搜索曝光请求体
type ExposeRequest struct {
	Papers []PaperSeed `json:"papers"`
}

// ExposeSeeds 接收搜索曝光批量种子
// 前端在搜索结果加载后调用，传入 1-20 条可见论文的精简元数据
func (h *Handler) ExposeSeeds(c *gin.Context) {
	var req ExposeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "invalid payload")
		return
	}
	if len(req.Papers) == 0 {
		utils.Success(c, gin.H{"written": 0})
		return
	}

	written, err := h.service.RecordSearchSeeds(req.Papers)
	if err != nil {
		slog.Warn("seo expose failed", "err", err)
	}
	utils.Success(c, gin.H{"written": written})
}

// ResolveBySlug 通过 slug 查询论文元数据（前端 /paper/:slug 首屏解析用）
// 返回 paper_id + 缓存的 SEO 摘要；前端再用 paper_id 调 /api/v1/public/papers/:paperId 取全量数据。
func (h *Handler) ResolveBySlug(c *gin.Context) {
	slug := c.Param("slug")
	if slug == "" {
		utils.BadRequest(c, "slug required")
		return
	}
	p, err := h.service.GetBySlug(slug)
	if err != nil {
		slog.Warn("seo resolve failed", "slug", slug, "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500})
		return
	}
	if p == nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "not found"})
		return
	}
	utils.Success(c, gin.H{
		"paper_id":       p.PaperID,
		"slug":           p.Slug,
		"title":          p.Title,
		"abstract":       p.Abstract,
		"year":           p.Year,
		"venue":          p.Venue,
		"doi":            p.DOI,
		"citation_count": p.CitationCount,
	})
}

// ServeSitemapIndex 返回 sitemap 索引（/sitemap.xml）
// 列出: static / blogs / resources / papers 分页
func (h *Handler) ServeSitemapIndex(c *gin.Context) {
	version := h.currentVersion(c.Request.Context())
	cacheKey := fmt.Sprintf("%s:index:v%d", sitemapCacheKey, version)

	if xml, ok := h.getCached(c.Request.Context(), cacheKey); ok {
		h.writeXML(c, xml, sitemapSummaryCache)
		return
	}

	summary, err := h.service.GetSitemapSummary()
	if err != nil {
		slog.Error("seo sitemap summary failed", "err", err)
		c.String(http.StatusInternalServerError, "internal error")
		return
	}

	lastMod := summary.LastMod
	if lastMod.IsZero() {
		lastMod = time.Now()
	}
	lastModStr := lastMod.UTC().Format(time.RFC3339)
	nowStr := time.Now().UTC().Format(time.RFC3339)
	base := baseURL()

	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")

	// 静态页
	fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-static.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
		base, nowStr)

	// 博客
	fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-blogs.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
		base, nowStr)

	// 资源中心
	fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-resources.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
		base, nowStr)

	// 动态论文 sitemap（按分页）
	for i := 1; i <= summary.TotalPages; i++ {
		fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-papers-%d.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
			base, i, lastModStr)
	}

	b.WriteString(`</sitemapindex>` + "\n")

	xml := b.String()
	h.setCached(c.Request.Context(), cacheKey, xml, sitemapSummaryTTL)
	h.writeXML(c, xml, sitemapSummaryCache)
}

// ServeStaticSitemap 静态页 sitemap（/sitemap-static.xml）
// 写死的站点元信息；博客/资源文章已拆分到独立 sitemap
func (h *Handler) ServeStaticSitemap(c *gin.Context) {
	today := time.Now().UTC().Format("2006-01-02")
	base := baseURL()
	staticPages := []struct {
		Path       string
		ChangeFreq string
		Priority   string
	}{
		// 核心功能页
		{"/", "daily", "1.0"},
		{"/search-results", "daily", "0.9"},
		{"/chat", "weekly", "0.8"},
		{"/assistant", "weekly", "0.8"},
		{"/peer-review", "weekly", "0.8"},
		{"/latex-writer", "weekly", "0.8"},

		// 营销 / 品牌页
		{"/features", "monthly", "0.7"},
		{"/features/search", "monthly", "0.6"},
		{"/features/peer-review", "monthly", "0.6"},
		{"/features/latex-writer", "monthly", "0.6"},
		{"/pricing", "monthly", "0.7"},
		{"/about", "monthly", "0.6"},
		{"/contact", "monthly", "0.6"},

		// 内容中心入口
		{"/resources", "weekly", "0.8"},
		{"/blog", "weekly", "0.8"},
		{"/help", "monthly", "0.7"},

		// 合规 / 反馈
		{"/privacy", "monthly", "0.5"},
		{"/terms", "monthly", "0.5"},
		{"/disclaimer", "monthly", "0.5"},
		{"/feedback", "monthly", "0.5"},
	}

	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, p := range staticPages {
		fmt.Fprintf(&b, "  <url>\n    <loc>%s%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>%s</changefreq>\n    <priority>%s</priority>\n  </url>\n",
			base, p.Path, today, p.ChangeFreq, p.Priority)
	}
	b.WriteString(`</urlset>` + "\n")

	h.writeXML(c, b.String(), sitemapBrowserCache)
}

// ServeBlogSitemap 博客文章 sitemap（/sitemap-blogs.xml）
func (h *Handler) ServeBlogSitemap(c *gin.Context) {
	h.writeArticleSitemap(c, BlogArticles, "/blog/", "weekly", "0.7")
}

// ServeResourceSitemap 资源中心文章 sitemap（/sitemap-resources.xml）
func (h *Handler) ServeResourceSitemap(c *gin.Context) {
	h.writeArticleSitemap(c, ResourceArticles, "/resources/", "monthly", "0.7")
}

// writeArticleSitemap 共用的博客/资源文章 sitemap 生成
func (h *Handler) writeArticleSitemap(c *gin.Context, entries []ArticleEntry, pathPrefix, changefreq, priority string) {
	base := baseURL()
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, e := range entries {
		fmt.Fprintf(&b, "  <url>\n    <loc>%s%s%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>%s</changefreq>\n    <priority>%s</priority>\n  </url>\n",
			base, pathPrefix, e.Slug, e.LastMod, changefreq, priority)
	}
	b.WriteString(`</urlset>` + "\n")

	h.writeXML(c, b.String(), sitemapBrowserCache)
}

// ServePaperSitemap 分页论文 sitemap（/sitemap-papers-{N}.xml）
func (h *Handler) ServePaperSitemap(c *gin.Context) {
	pageStr := c.Param("page")
	page, err := strconv.Atoi(pageStr)
	if err != nil || page <= 0 {
		c.String(http.StatusNotFound, "not found")
		return
	}

	version := h.currentVersion(c.Request.Context())
	cacheKey := fmt.Sprintf("%s:papers:%d:v%d", sitemapCacheKey, page, version)

	if xml, ok := h.getCached(c.Request.Context(), cacheKey); ok {
		h.writeXML(c, xml, sitemapBrowserCache)
		return
	}

	entries, err := h.service.GetSitemapPage(page)
	if err != nil {
		slog.Error("seo sitemap page failed", "page", page, "err", err)
		c.String(http.StatusInternalServerError, "internal error")
		return
	}
	if len(entries) == 0 {
		c.String(http.StatusNotFound, "not found")
		return
	}

	base := baseURL()
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, e := range entries {
		lastMod := e.UpdatedAt.UTC().Format(time.RFC3339)
		priority := fmt.Sprintf("%.1f", e.Priority)
		fmt.Fprintf(&b, "  <url>\n    <loc>%s/paper/%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>%s</priority>\n  </url>\n",
			base, e.Slug, lastMod, priority)
	}
	b.WriteString(`</urlset>` + "\n")

	xml := b.String()
	h.setCached(c.Request.Context(), cacheKey, xml, sitemapCacheTTL)
	h.writeXML(c, xml, sitemapBrowserCache)
}

// ServeRobotsTxt 返回 robots.txt，声明 sitemap 入口
// 索引文件 /sitemap.xml 会枚举所有子 sitemap，爬虫跟随即可
func (h *Handler) ServeRobotsTxt(c *gin.Context) {
	body := fmt.Sprintf(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /settings
Disallow: /alipay-return
Disallow: /wechat/callback
Disallow: /github/callback
Disallow: /apple/callback
Disallow: /orcid/callback
Disallow: /microsoft/callback
Disallow: /discourse/callback
Disallow: /api/

User-agent: Baiduspider
Crawl-delay: 2

User-agent: Sogou web spider
Crawl-delay: 2

Sitemap: %s/sitemap.xml
`, baseURL())
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=86400")
	c.String(http.StatusOK, body)
}

// ---------- 内部工具 ----------

func (h *Handler) currentVersion(ctx context.Context) int64 {
	rdb := cache.GetRedis()
	if rdb == nil {
		return 0
	}
	cctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()
	val, err := rdb.Get(cctx, sitemapVersionKey).Int64()
	if err != nil {
		return 0
	}
	return val
}

func (h *Handler) getCached(ctx context.Context, key string) (string, bool) {
	rdb := cache.GetRedis()
	if rdb == nil {
		return "", false
	}
	cctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()
	val, err := rdb.Get(cctx, key).Result()
	if err != nil {
		return "", false
	}
	return val, true
}

func (h *Handler) setCached(ctx context.Context, key, xml string, ttl time.Duration) {
	rdb := cache.GetRedis()
	if rdb == nil {
		return
	}
	cctx, cancel := context.WithTimeout(ctx, 1*time.Second)
	defer cancel()
	if err := rdb.Set(cctx, key, xml, ttl).Err(); err != nil {
		slog.Warn("seo sitemap cache set failed", "key", key, "err", err)
	}
}

func (h *Handler) writeXML(c *gin.Context, xml string, maxAge int) {
	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.Header("Cache-Control", fmt.Sprintf("public, max-age=%d", maxAge))
	c.String(http.StatusOK, xml)
}
