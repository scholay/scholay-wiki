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
// sitemap 通过 Redis 做 version-based 缓存,版本号由 Service.invalidate{Papers,Authors}Cache 驱动。
// papers / authors 各自独立计数器,论文写入不会让作者 sitemap cache 失效,反之亦然。
// ============================================================================

package seo

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/safego"
	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

const (
	sitemapCacheKey     = "seo:sitemap:cache"
	sitemapCacheTTL     = 6 * time.Hour
	sitemapSummaryTTL   = 10 * time.Minute // 索引页允许稍短 TTL，保证新写入的论文能更快上 sitemap
	sitemapBrowserCache = 3600             // 浏览器/CDN 端缓存 1h
	sitemapSummaryCache = 900              // 索引页浏览器缓存 15m
)

// baseURL 站点权威域名（sitemap 全部 <loc> 前缀）
// 读 SEO_BASE_URL 环境变量，默认 https://www.scholay.com
// 必须和 canonical link / Open Graph url 同一个 host(都带 www),
// 否则 Google 会把 sitemap 列出的 URL 当 duplicate 忽略。
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

// ExposeRequest 搜索曝光请求体 (papers + authors + journals 同一通道, 节流)
type ExposeRequest struct {
	Papers   []PaperSeed   `json:"papers,omitempty"`
	Authors  []AuthorSeed  `json:"authors,omitempty"`
	Journals []JournalSeed `json:"journals,omitempty"`
	// DetailPapers: 论文**详情页**打开的曝光(tier-1,高优先级)。站内详情走前端缓存、不打
	// GET /papers/:id,服务端看不到,故论文 tier-1 只能由前端 exposePaperDetail 经此字段上报。
	// 作者/期刊详情由后端 GetAuthor/GetJournal 服务端记 tier-1,不依赖此字段。
	DetailPapers []PaperSeed `json:"detail_papers,omitempty"`
}

// ExposeSeeds 接收搜索曝光批量种子
// 前端在搜索结果加载后调用,传入 1-20 条可见论文/作者/期刊的精简元数据
func (h *Handler) ExposeSeeds(c *gin.Context) {
	var req ExposeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "invalid payload")
		return
	}
	papers, authors, journals, detailPapers := req.Papers, req.Authors, req.Journals, req.DetailPapers
	if len(papers) == 0 && len(authors) == 0 && len(journals) == 0 && len(detailPapers) == 0 {
		utils.Success(c, gin.H{"accepted": false})
		return
	}

	// 曝光种子是 best-effort 的 SEO 遥测,前端用 sendBeacon 发出且**不读响应体**。
	// 原本同步跑最多 20+20+20 条 upsert,把全部 DB 往返压在请求路径上(N+1,纯浪费的请求延迟)。
	// 改成立即 ACK + 后台落库:请求 O(1) 返回,写入在 goroutine(safego 带 recover)里慢慢做。
	// req.* 切片由本请求独占,捕获进 goroutine 安全;goroutine 内不得再碰 gin.Context。
	safego.Record("seo-expose-seeds", func() {
		if len(detailPapers) > 0 {
			// 论文详情曝光 → tier-1(priority 高 / changefreq weekly),与作者/期刊详情对齐。
			if _, err := h.service.RecordDetailSeeds(detailPapers); err != nil {
				slog.Warn("seo expose detail papers failed", "err", err)
			}
		}
		if len(papers) > 0 {
			if _, err := h.service.RecordSearchSeeds(papers); err != nil {
				slog.Warn("seo expose papers failed", "err", err)
			}
		}
		if len(authors) > 0 {
			if _, err := h.service.RecordAuthorSearchSeeds(authors); err != nil {
				slog.Warn("seo expose authors failed", "err", err)
			}
		}
		if len(journals) > 0 {
			if _, err := h.service.RecordJournalSearchSeeds(journals); err != nil {
				slog.Warn("seo expose journals failed", "err", err)
			}
		}
	})

	utils.Success(c, gin.H{"accepted": true})
}

// ResolveAuthorBySlug 通过 slug 查询作者元数据（前端 /author/:slug 首屏解析用）
// 返回 author_id + 缓存的 SEO 摘要；前端再用 author_id 跳到 /search-results?authorId=X
func (h *Handler) ResolveAuthorBySlug(c *gin.Context) {
	slug := c.Param("slug")
	if slug == "" {
		utils.BadRequest(c, "slug required")
		return
	}
	a, err := h.service.GetAuthorBySlug(slug)
	if err != nil {
		slog.Warn("seo author resolve failed", "slug", slug, "err", err)
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500})
		return
	}
	if a == nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": "not found"})
		return
	}
	utils.Success(c, gin.H{
		"author_id":      a.AuthorID,
		"slug":           a.Slug,
		"name":           a.Name,
		"homepage":       a.Homepage,
		"paper_count":    a.PaperCount,
		"citation_count": a.CitationCount,
		"h_index":        a.HIndex,
	})
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
		utils.ServerError(c, "resolve failed")
		return
	}
	if p == nil {
		utils.NotFound(c, "not found")
		return
	}

	// SEO 直访量改由前端在论文页冷进入时上报 POST /public/hot-content/track,
	// 这里不再记 (本接口只做 slug→paper_id 解析)。
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
// 列出: static / blogs / resources / papers 分页 / authors 分页
//
// 索引文件 cache key 同时引用 papers + authors 两个版本号 —— 任一变化都重建。
func (h *Handler) ServeSitemapIndex(c *gin.Context) {
	pVer := h.versionForKind(c.Request.Context(), "papers")
	aVer := h.versionForKind(c.Request.Context(), "authors")
	jVer := h.versionForKind(c.Request.Context(), "journals")
	cacheKey := fmt.Sprintf("%s:index:vP%d:vA%d:vJ%d", sitemapCacheKey, pVer, aVer, jVer)

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

	// 各子 sitemap 的真实 lastmod ——
	// 用真实数据而非 now,避免误导爬虫每分钟都来抓
	staticLastMod := StaticPagesLastMod                    // 静态页面常量(代码维护)
	blogLastMod := MaxArticleLastMod(BlogArticles)         // 博客文章里最新的
	resourceLastMod := MaxArticleLastMod(ResourceArticles) // 资源文章里最新的
	if blogLastMod == "" {
		blogLastMod = staticLastMod
	}
	if resourceLastMod == "" {
		resourceLastMod = staticLastMod
	}

	// 论文 sitemap 各页的 lastmod (单次 GROUP BY 查询)
	paperPageLastMod, err := h.service.GetSitemapLastModPerPage()
	if err != nil {
		slog.Warn("seo sitemap per-page lastmod failed, fallback to summary lastmod", "err", err)
		paperPageLastMod = nil
	}
	fallbackPapersLastMod := summary.LastMod
	if fallbackPapersLastMod.IsZero() {
		fallbackPapersLastMod = time.Now()
	}

	// 作者 sitemap：与论文同构，summary + per-page lastmod
	authorSummary, err := h.service.GetAuthorSitemapSummary()
	if err != nil {
		slog.Warn("seo author sitemap summary failed", "err", err)
		authorSummary = &SitemapSummary{}
	}
	authorPageLastMod, err := h.service.GetAuthorSitemapLastModPerPage()
	if err != nil {
		slog.Warn("seo author sitemap per-page lastmod failed", "err", err)
		authorPageLastMod = nil
	}
	fallbackAuthorsLastMod := authorSummary.LastMod
	if fallbackAuthorsLastMod.IsZero() {
		fallbackAuthorsLastMod = time.Now()
	}

	// 期刊 sitemap: 同构, summary + per-page lastmod
	journalSummary, err := h.service.GetJournalSitemapSummary()
	if err != nil {
		slog.Warn("seo journal sitemap summary failed", "err", err)
		journalSummary = &SitemapSummary{}
	}
	journalPageLastMod, err := h.service.GetJournalSitemapLastModPerPage()
	if err != nil {
		slog.Warn("seo journal sitemap per-page lastmod failed", "err", err)
		journalPageLastMod = nil
	}
	fallbackJournalsLastMod := journalSummary.LastMod
	if fallbackJournalsLastMod.IsZero() {
		fallbackJournalsLastMod = time.Now()
	}

	base := baseURL()
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")

	// 静态页
	fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-static.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
		base, staticLastMod)

	// 博客
	fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-blogs.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
		base, blogLastMod)

	// 资源中心
	fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-resources.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
		base, resourceLastMod)

	// 动态论文 sitemap（按分页,各页用自身真实 lastmod）
	// 统一 YYYY-MM-DD 粒度 — 爬虫按天判断变化,跟其它子 sitemap 一致
	for i := 1; i <= summary.TotalPages; i++ {
		t, ok := paperPageLastMod[i]
		if !ok {
			t = fallbackPapersLastMod
		}
		fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-papers-%d.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
			base, i, t.Format("2006-01-02"))
	}

	// 动态作者 sitemap
	for i := 1; i <= authorSummary.TotalPages; i++ {
		t, ok := authorPageLastMod[i]
		if !ok {
			t = fallbackAuthorsLastMod
		}
		fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-authors-%d.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
			base, i, t.Format("2006-01-02"))
	}

	// 动态期刊 sitemap
	for i := 1; i <= journalSummary.TotalPages; i++ {
		t, ok := journalPageLastMod[i]
		if !ok {
			t = fallbackJournalsLastMod
		}
		fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-journals-%d.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
			base, i, t.Format("2006-01-02"))
	}

	b.WriteString(`</sitemapindex>` + "\n")

	xml := b.String()
	h.setCached(c.Request.Context(), cacheKey, xml, sitemapSummaryTTL)
	h.writeXML(c, xml, sitemapSummaryCache)
}

// ServeStaticSitemap 静态页 sitemap（/sitemap-static.xml）
// 写死的站点元信息；博客/资源文章已拆分到独立 sitemap
//
// 所有 <url> 的 <lastmod> 都用 StaticPagesLastMod 常量,避免每次访问 lastmod
// 都跳到 today,导致爬虫误判每天都更新。
func (h *Handler) ServeStaticSitemap(c *gin.Context) {
	lastMod := StaticPagesLastMod
	base := baseURL()

	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, p := range StaticPages {
		fmt.Fprintf(&b, "  <url>\n    <loc>%s%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>%s</changefreq>\n    <priority>%s</priority>\n  </url>\n",
			base, p.Path, lastMod, p.ChangeFreq, p.Priority)
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
//
// 注意路由模式 `/sitemap-papers-:page.xml` 是 httprouter 不支持的
// mid-segment placeholder,c.Param("page") 实际拿不到值,必须手动从 URL 路径救回。
func (h *Handler) ServePaperSitemap(c *gin.Context) {
	page, ok := parseSitemapPageParam(c, "/sitemap-papers-")
	if !ok {
		return
	}
	h.serveEntitySitemap(c, page, "papers", "/paper/", h.service.GetSitemapPage)
}

// ServeAuthorSitemap 分页作者 sitemap（/sitemap-authors-{N}.xml）
func (h *Handler) ServeAuthorSitemap(c *gin.Context) {
	page, ok := parseSitemapPageParam(c, "/sitemap-authors-")
	if !ok {
		return
	}
	h.serveEntitySitemap(c, page, "authors", "/author/", h.service.GetAuthorSitemapPage)
}

// ServeJournalSitemap 分页期刊 sitemap (/sitemap-journals-{N}.xml)
// URL 形态 /journal/{id}/{slug}, slug 缺失时退化为 /journal/{id}
func (h *Handler) ServeJournalSitemap(c *gin.Context) {
	page, ok := parseSitemapPageParam(c, "/sitemap-journals-")
	if !ok {
		return
	}
	h.serveJournalSitemap(c, page)
}

// serveJournalSitemap 独立于 serveEntitySitemap, 因为 journal URL 形态不带 source 段
func (h *Handler) serveJournalSitemap(c *gin.Context, page int) {
	version := h.versionForKind(c.Request.Context(), "journals")
	cacheKey := fmt.Sprintf("%s:journals:%d:v%d", sitemapCacheKey, page, version)

	if xml, ok := h.getCached(c.Request.Context(), cacheKey); ok {
		h.writeXML(c, xml, sitemapBrowserCache)
		return
	}

	entries, err := h.service.GetJournalSitemapPage(page)
	if err != nil {
		slog.Error("seo sitemap page failed", "kind", "journals", "page", page, "err", err)
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
		loc := journalCanonicalURL(base, e.EntityID, e.Slug)
		if loc == "" {
			continue
		}
		lastMod := e.UpdatedAt.Format(time.RFC3339)
		priority := fmt.Sprintf("%.1f", e.Priority)
		changefreq := changefreqForTier(e.QualityTier)
		fmt.Fprintf(&b, "  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>%s</changefreq>\n    <priority>%s</priority>\n  </url>\n",
			loc, lastMod, changefreq, priority)
	}
	b.WriteString(`</urlset>` + "\n")

	xml := b.String()
	h.setCached(c.Request.Context(), cacheKey, xml, sitemapCacheTTL)
	h.writeXML(c, xml, sitemapBrowserCache)
}

// journalCanonicalURL 期刊 canonical URL:
//   - id + slug 都有 → /journal/{id}/{slug}
//   - 仅 id → /journal/{id}  (老行 slug 缺失时的回落)
//   - id 空 → "" (跳过该条)
func journalCanonicalURL(base, journalID, slug string) string {
	if journalID == "" {
		return ""
	}
	if slug != "" {
		return base + "/journal/" + journalID + "/" + slug
	}
	return base + "/journal/" + journalID
}

// parseSitemapPageParam 解析 /sitemap-{kind}-{N}.xml 中的页码
// Gin 的 mid-segment placeholder 解析为空时,从原始 URL 提取。
func parseSitemapPageParam(c *gin.Context, prefix string) (int, bool) {
	pageStr := strings.TrimSuffix(c.Param("page"), ".xml")
	if pageStr == "" {
		p := c.Request.URL.Path
		p = strings.TrimPrefix(p, prefix)
		pageStr = strings.TrimSuffix(p, ".xml")
	}
	page, err := strconv.Atoi(pageStr)
	if err != nil || page <= 0 {
		c.String(http.StatusNotFound, "not found")
		return 0, false
	}
	return page, true
}

// serveEntitySitemap 论文/作者 sitemap 的通用渲染逻辑
//   - kind: 缓存键前缀（区分 papers / authors,避免互相覆盖）
//   - urlPrefix: 站内路径前缀（"/paper/" 或 "/author/"）
//   - fetcher: 拉取该实体某分页全部条目的函数（差异点）
//
// URL 格式 (2026-05 改 SEO canonical):
//
//	`${base}${urlPrefix}${source}/${entityID}` — 与前端路由 `/paper/:source/:paperId`
//	/ `/author/:source/:authorId` 完全对齐。
//	缺 source/entityID 的旧数据回落到 legacy `${base}${urlPrefix}${slug}`,
//	/paper/{slug} 端点(handler_ssr 注册的 fallback)会继续 SSR + 301。
//
// changefreq 按 quality_tier 区分: tier=1(详情点击,活跃)→weekly,
// tier=2(搜索曝光,长尾)→monthly,降低 Googlebot 对长尾页的无效抓取。
func (h *Handler) serveEntitySitemap(c *gin.Context, page int, kind, urlPrefix string, fetcher func(int) ([]SitemapEntry, error)) {
	// 只取自家 kind 的版本号 —— 论文写入不会让作者 sitemap cache 失效
	version := h.versionForKind(c.Request.Context(), kind)
	cacheKey := fmt.Sprintf("%s:%s:%d:v%d", sitemapCacheKey, kind, page, version)

	if xml, ok := h.getCached(c.Request.Context(), cacheKey); ok {
		h.writeXML(c, xml, sitemapBrowserCache)
		return
	}

	entries, err := fetcher(page)
	if err != nil {
		slog.Error("seo sitemap page failed", "kind", kind, "page", page, "err", err)
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
		loc := canonicalEntityURL(base, urlPrefix, e)
		if loc == "" {
			// source + entityID + slug 全空 —— 跳过,不写无效 URL
			continue
		}
		lastMod := e.UpdatedAt.Format(time.RFC3339)
		priority := fmt.Sprintf("%.1f", e.Priority)
		changefreq := changefreqForTier(e.QualityTier)
		fmt.Fprintf(&b, "  <url>\n    <loc>%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>%s</changefreq>\n    <priority>%s</priority>\n  </url>\n",
			loc, lastMod, changefreq, priority)
	}
	b.WriteString(`</urlset>` + "\n")

	xml := b.String()
	h.setCached(c.Request.Context(), cacheKey, xml, sitemapCacheTTL)
	h.writeXML(c, xml, sitemapBrowserCache)
}

// canonicalEntityURL 计算单个 sitemap 条目的 <loc>:
//   - 有 source + entityID → canonical `${base}${urlPrefix}${source}/${entityID}`
//   - 否则 → legacy `${base}${urlPrefix}${slug}` (老数据回落,handler_ssr 会 301)
//   - 全空 → 返回 ""(调用方跳过该条)
//
// entityID 走 url.PathEscape — Semantic Scholar 等上游 ID 形如 `arXiv:1706.03762` /
// `MAG:1234567890`,带冒号或斜杠也要在 URL 里安全。
func canonicalEntityURL(base, urlPrefix string, e SitemapEntry) string {
	if e.Source != "" && e.EntityID != "" {
		return base + urlPrefix + e.Source + "/" + url.PathEscape(e.EntityID)
	}
	if e.Slug != "" {
		return base + urlPrefix + e.Slug
	}
	return ""
}

// changefreqForTier tier=1(详情点击)→weekly, 其它(含 tier=2 搜索曝光)→monthly
func changefreqForTier(tier int) string {
	if tier == TierDetailClick {
		return "weekly"
	}
	return "monthly"
}

// ServeRobotsTxt 返回 robots.txt，声明 sitemap 入口
// 索引文件 /sitemap.xml 会枚举所有子 sitemap，爬虫跟随即可
func (h *Handler) ServeRobotsTxt(c *gin.Context) {
	// 规则按 robots 规范:爬虫只遵从**最具体匹配**的 User-agent 组,**不继承** * 组。
	// 故 Baiduspider / Sogou 这两个主力中文爬虫的具名组必须各自自带 Disallow,
	// 否则它们会无视下面的禁爬目录,去爬 /admin、/api、OAuth 回调(query 带 code/state)等非 SEO 面。
	rules := `Allow: /
Disallow: /admin
Disallow: /settings
Disallow: /alipay-return
Disallow: /wechat/callback
Disallow: /github/callback
Disallow: /apple/callback
Disallow: /orcid/callback
Disallow: /microsoft/callback
Disallow: /discourse/callback
Disallow: /api/`

	body := fmt.Sprintf(`User-agent: *
%s

User-agent: Baiduspider
%s
Crawl-delay: 2

User-agent: Sogou web spider
%s
Crawl-delay: 2

Sitemap: %s/sitemap.xml
Sitemap: %s/sitemap-tools.xml
`, rules, rules, rules, baseURL(), baseURL())
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=86400")
	c.String(http.StatusOK, body)
}

// ---------- 内部工具 ----------

// versionForKind 读取指定 kind 的缓存版本号 ("papers" / "authors")
// kind 不识别时返回 0,handler 走冷构建路径(同 Redis 不可用情况)。
func (h *Handler) versionForKind(ctx context.Context, kind string) int64 {
	var key string
	switch kind {
	case "papers":
		key = sitemapPapersVersionKey
	case "authors":
		key = sitemapAuthorsVersionKey
	case "journals":
		key = sitemapJournalsVersionKey
	default:
		return 0
	}
	rdb := cache.GetRedis()
	if rdb == nil {
		return 0
	}
	cctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()
	val, err := rdb.Get(cctx, key).Int64()
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
