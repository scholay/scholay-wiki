// ============================================================================
// Scholay学术 V1.0
// SEO HTTP Handler
//
// 暴露三类 endpoint：
//   1. 历史搜索曝光端点（仅兼容 ACK，不信任客户端 SEO 数据）
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
	"hash/fnv"
	"html"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/utils"
	"scholar-backend/internal/content"

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
	// newsLastModFn 由 bootstrap 注入(news.Service.SitemapMaxLastMod):
	// 让 sitemap 索引里 /sitemap-news.xml 的 <lastmod> 反映最新情报(否则用静态常量,
	// 情报频繁更新但索引 lastmod 不变 → 爬虫不及时重抓 news sitemap)。seo 不 import news。
	newsLastModFn func() string
	// toolSitemapFn 由 bootstrap 注入(featuretool.Service.SitemapPages):返回工具 sitemap
	// 的分片总数 + 最新 lastmod。主 sitemap 索引据此直接列出各叶子 /sitemap-tools-N.xml,
	// 而不是嵌套引用 /sitemap-tools.xml(索引套索引 → Google 不递归解析,约 6 万工具页发现性受损)。
	// seo 不 import featuretool(反向依赖),故用注入函数解耦。
	toolSitemapFn func() (pages int, lastmod string, err error)
}

// NewHandler 构造
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// SetNewsLastModProvider 注入情报最新 lastmod 提供者(bootstrap 调一次)。
func (h *Handler) SetNewsLastModProvider(fn func() string) {
	h.newsLastModFn = fn
}

// SetToolSitemapProvider 注入工具 sitemap 分片信息提供者(bootstrap 调一次)。
func (h *Handler) SetToolSitemapProvider(fn func() (int, string, error)) {
	h.toolSitemapFn = fn
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

// ExposeSeeds 仅保留历史 API 兼容。
//
// 这是匿名公开端点，客户端上报的 title/abstract/metrics/detail tier 均可伪造。
// 如果用它直接 upsert，攻击者可制造立即进 sitemap 的垃圾页。现在 SEO seed
// 只由 minicod 服务端已验证的搜索/详情响应写入；此端点解析旧 payload 后明确拒绝持久化。
func (h *Handler) ExposeSeeds(c *gin.Context) {
	var req ExposeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.BadRequest(c, "invalid payload")
		return
	}
	if len(req.Papers) == 0 && len(req.Authors) == 0 && len(req.Journals) == 0 && len(req.DetailPapers) == 0 {
		utils.Success(c, gin.H{"accepted": false})
		return
	}
	utils.Success(c, gin.H{
		"accepted": false,
		"reason":   "server_verified_sources_only",
	})
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
	toolPages := 0
	toolLastMod := ""
	if h.toolSitemapFn != nil {
		var toolErr error
		toolPages, toolLastMod, toolErr = h.toolSitemapFn()
		if toolErr != nil {
			slog.Error("seo tool sitemap page enumeration failed", "err", toolErr)
			c.String(http.StatusInternalServerError, "internal error")
			return
		}
	}
	// nonempty-pages-v2 强制绕过旧的 COUNT 推页数索引缓存；否则 Redis 持久化时，
	// 发布后最长 10 分钟仍可能继续漏掉已经存在的 authors-2 等真实分片。
	// Tools do not share the entity version counters. Fold their actual page
	// count/date into the key so the first approval, a page-boundary crossing or
	// a new-day update cannot leave a cached main index silently omitting them.
	cacheKey := fmt.Sprintf("%s:index:nonempty-pages-v4:vP%d:vA%d:vJ%d:vT%d:%s",
		sitemapCacheKey, pVer, aVer, jVer, toolPages, toolLastMod)

	if xml, ok := h.getCached(c.Request.Context(), cacheKey); ok {
		h.writeXML(c, xml, sitemapSummaryCache)
		return
	}

	// 各子 sitemap 的真实 lastmod ——
	// 用真实数据而非 now,避免误导爬虫每分钟都来抓
	staticLastMod := StaticPagesLastMod                // 静态页面常量(代码维护)
	blogLastMod := content.MaxLastMod("blog")          // 博客文章里最新的(content 单一真源)
	resourceLastMod := content.MaxLastMod("resources") // 资源文章里最新的
	qaLastMod := content.MaxLastMod("qa")              // 学术问答里最新的
	if blogLastMod == "" {
		blogLastMod = staticLastMod
	}
	if resourceLastMod == "" {
		resourceLastMod = staticLastMod
	}
	if qaLastMod == "" {
		qaLastMod = staticLastMod
	}

	// 论文 sitemap 的真实非空页集合 + 各页 lastmod（单次 GROUP BY 查询）。
	// map key 是持久化 sitemap_page 的真实页号，允许有缺口；禁止再由 COUNT 推 1..N。
	paperPageLastMod, err := h.service.GetSitemapLastModPerPage()
	if err != nil {
		slog.Error("seo paper sitemap page enumeration failed", "err", err)
		c.String(http.StatusInternalServerError, "internal error")
		return
	}

	// 作者 sitemap：同样枚举真实 key；这会把 ID 空洞后的 authors-2 正确写进主索引。
	authorPageLastMod, err := h.service.GetAuthorSitemapLastModPerPage()
	if err != nil {
		slog.Error("seo author sitemap page enumeration failed", "err", err)
		c.String(http.StatusInternalServerError, "internal error")
		return
	}

	// 期刊 sitemap：同构，枚举真实非空 key。
	journalPageLastMod, err := h.service.GetJournalSitemapLastModPerPage()
	if err != nil {
		slog.Error("seo journal sitemap page enumeration failed", "err", err)
		c.String(http.StatusInternalServerError, "internal error")
		return
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

	// 学术问答
	fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-qa.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
		base, qaLastMod)

	// 工具广场:直接列出各叶子分片 /sitemap-tools-N.xml,不再引用中间的 /sitemap-tools.xml 索引
	// —— sitemap 协议与 Google 都不支持「索引套索引」,嵌套引用会让约 6 万 /tools/* 页只靠未文档化
	// 行为被发现。分片数 + lastmod 由 featuretool 经注入函数提供(seo 不 import featuretool)。
	// 注入缺失(理论不会)时兜底回退到旧的单条 /sitemap-tools.xml 引用,保证工具垂类不至于零发现。
	if h.toolSitemapFn != nil {
		if toolLastMod == "" {
			toolLastMod = staticLastMod
		}
		for i := 1; i <= toolPages; i++ {
			fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-tools-%d.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
				base, i, toolLastMod)
		}
	} else {
		fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-tools.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
			base, staticLastMod)
	}

	// 情报(由 news 生成 /sitemap-news.xml;seo 只引用 URL)。lastmod 取「全量情报最新 upstream_updated_at」
	// (news 注入的 provider),反映新内容;无 provider/无数据时回落静态常量。索引页 10min TTL 兜住及时性。
	newsLastMod := staticLastMod
	if h.newsLastModFn != nil {
		if lm := h.newsLastModFn(); lm != "" {
			newsLastMod = lm
		}
	}
	fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-news.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
		base, newsLastMod)
	// Google News sitemap(48h 窗口,news 模块提供)。放进索引便于发现;
	// GSC 里仍建议单独提交一次以启用 News 专属报告。
	fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-news-latest.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
		base, newsLastMod)

	// 期刊枢纽页(发现层 /journals/browse|category|country|warning|oa,含路径分页)。
	// lastmod = 全体已发布期刊的最新 updated_at(发布 / 内容真实变化才动);
	// 查询失败降级为静态常量 —— lastmod 只是提示,不值得让整个主索引 500。
	hubLastMod := staticLastMod
	if lm, hubErr := h.service.GetJournalHubSitemapLastMod(); hubErr != nil {
		slog.Warn("seo journal hub lastmod query failed", "err", hubErr)
	} else if !lm.IsZero() {
		hubLastMod = lm.Format("2006-01-02")
	}
	fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-journal-hubs.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
		base, hubLastMod)

	// 动态实体 sitemap：严格按真实非空页号升序写入，缺号不补空 leaf。
	appendEntitySitemapIndexEntries(&b, base, "papers", paperPageLastMod)
	appendEntitySitemapIndexEntries(&b, base, "authors", authorPageLastMod)
	appendEntitySitemapIndexEntries(&b, base, "journals", journalPageLastMod)

	b.WriteString(`</sitemapindex>` + "\n")

	xml := b.String()
	h.setCached(c.Request.Context(), cacheKey, xml, sitemapSummaryTTL)
	h.writeXML(c, xml, sitemapSummaryCache)
}

// appendEntitySitemapIndexEntries 将真实非空 page map 稳定地写进主 sitemap。
// map 可能是 {1,2,4}；必须输出 1、2、4，既不能因 COUNT 只输出 1，也不能补出空的 3。
func appendEntitySitemapIndexEntries(b *strings.Builder, base, kind string, pageLastMod map[int]time.Time) {
	pages := make([]int, 0, len(pageLastMod))
	for page := range pageLastMod {
		if page > 0 {
			pages = append(pages, page)
		}
	}
	sort.Ints(pages)
	for _, page := range pages {
		lastMod := pageLastMod[page]
		if lastMod.IsZero() {
			lastMod = time.Now()
		}
		fmt.Fprintf(b, "  <sitemap>\n    <loc>%s/sitemap-%s-%d.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n",
			base, kind, page, lastMod.Format("2006-01-02"))
	}
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

// ServeBlogSitemap 博客文章 sitemap（/sitemap-blogs.xml）—— 文章源自 content 包(正文单一真源)
func (h *Handler) ServeBlogSitemap(c *gin.Context) {
	h.writeArticleSitemap(c, articleEntriesFromContent("blog"), "/blog/", "weekly", "0.7")
}

// ServeResourceSitemap 资源中心文章 sitemap（/sitemap-resources.xml）
func (h *Handler) ServeResourceSitemap(c *gin.Context) {
	h.writeArticleSitemap(c, articleEntriesFromContent("resources"), "/resources/", "monthly", "0.7")
}

// ServeQASitemap 学术问答 sitemap（/sitemap-qa.xml）—— 问答长答案,来自 content 包
func (h *Handler) ServeQASitemap(c *gin.Context) {
	h.writeArticleSitemap(c, articleEntriesFromContent("qa"), "/qa/", "monthly", "0.7")
}

// articleEntriesFromContent 把 content 包的文章(单一真源)映射成 sitemap 用的 (slug, lastmod)。
// lastmod 取文章 UpdatedDate,故重写文章后 sitemap 自动反映新日期,促爬虫重抓。
func articleEntriesFromContent(kind string) []ArticleEntry {
	arts := content.List(kind)
	out := make([]ArticleEntry, 0, len(arts))
	for _, a := range arts {
		out = append(out, ArticleEntry{Slug: a.Slug, LastMod: a.LastMod()})
	}
	return out
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
	cacheKey := fmt.Sprintf("%s:journals:lastmod-honest-v3:%d:v%d", sitemapCacheKey, page, version)

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
		priority := fmt.Sprintf("%.1f", e.Priority)
		changefreq := changefreqForTier(e.QualityTier)
		fmt.Fprintf(&b, "  <url>\n    <loc>%s</loc>\n%s    <changefreq>%s</changefreq>\n    <priority>%s</priority>\n  </url>\n",
			html.EscapeString(loc), entityLastModXML(e), changefreq, priority)
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
		return base + "/journal/" + url.PathEscape(journalID) + "/" + url.PathEscape(slug)
	}
	return base + "/journal/" + url.PathEscape(journalID)
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
	cacheKey := fmt.Sprintf("%s:%s:lastmod-honest-v3:%d:v%d", sitemapCacheKey, kind, page, version)

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
		priority := fmt.Sprintf("%.1f", e.Priority)
		changefreq := changefreqForTier(e.QualityTier)
		fmt.Fprintf(&b, "  <url>\n    <loc>%s</loc>\n%s    <changefreq>%s</changefreq>\n    <priority>%s</priority>\n  </url>\n",
			html.EscapeString(loc), entityLastModXML(e), changefreq, priority)
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
		return base + urlPrefix + url.PathEscape(e.Source) + "/" + url.PathEscape(e.EntityID)
	}
	if e.Slug != "" {
		return base + urlPrefix + url.PathEscape(e.Slug)
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

// entityLastModXML 条件输出 <lastmod> 行(含缩进与换行),不可信时返回 ""。
//
// updated_at ≈ created_at 意味着「入库后内容从未变化」—— 此时 updated_at 只是
// 入库时刻,不是内容修改时刻。批量灌数据的分片若把入库时间当 <lastmod> 输出,
// 会呈现「整片 URL 同一天全部'被修改'」的假象,教会 Googlebot 不信任本站 lastmod
// (2026-08-10 审计:papers-2 / authors-3 全片如此)。sitemap 协议里 <lastmod> 是
// 可选字段,省略是合法且诚实的表达;真实内容变化(标题变更/摘要变长/代表作从无到有)
// 会让 updated_at 显著晚于 created_at,恢复输出。60s 容差覆盖 INSERT 参数与
// DB 时钟的亚秒抖动。
func entityLastModXML(e SitemapEntry) string {
	if e.CreatedAt.IsZero() || e.UpdatedAt.Sub(e.CreatedAt) <= time.Minute {
		return ""
	}
	return "    <lastmod>" + e.UpdatedAt.Format(time.RFC3339) + "</lastmod>\n"
}

// ServeRobotsTxt 返回 robots.txt，声明 sitemap 入口
// 索引文件 /sitemap.xml 会枚举所有子 sitemap，爬虫跟随即可
func (h *Handler) ServeRobotsTxt(c *gin.Context) {
	// 规则按 robots 规范:爬虫只遵从**最具体匹配**的 User-agent 组,**不继承** * 组。
	// 故 Baiduspider / Sogou 这两个主力中文爬虫的具名组必须各自自带 Disallow,
	// 否则它们会无视下面的禁爬目录,去爬 /admin、/api、OAuth 回调(query 带 code/state)等非 SEO 面。
	rules := `Allow: /
Allow: /api/v1/public/
Allow: /api/v1/news
Allow: /api/v1/content/
Disallow: /admin
Disallow: /settings
Disallow: /m/
Disallow: /alipay-return
Disallow: /wechat/callback
Disallow: /github/callback
Disallow: /google/callback
Disallow: /apple/callback
Disallow: /orcid/callback
Disallow: /microsoft/callback
Disallow: /discourse/callback
Disallow: /api/`

	// GEO: AI 生成式引擎爬虫显式放行(它们本就继承 * 组的 Allow, 这里具名是为了
	// ① 表明"我们主动欢迎被 AI 检索/引用"的意图(robots 组不继承, 每组各自带 Disallow);
	// ② 给"训练类"重爬虫加 Crawl-delay 护栏, 减轻 SSR 后端压力。
	// 两类区分(依据 OpenAI/Anthropic/Perplexity 官方文档):
	//   - 检索/实时取页类(被引前提, 不限速): OAI-SearchBot / *-User / *-SearchBot / PerplexityBot
	//   - 训练/批量类(放行但限速): GPTBot / ClaudeBot / Google-Extended / Amazonbot / Meta-ExternalAgent / CCBot
	// 注: 不输出 llms.txt —— Google 官方已否定, 实测几乎无引擎读取, 不投入。
	body := fmt.Sprintf(`User-agent: *
%s

User-agent: Baiduspider
%s
Crawl-delay: 2

User-agent: Sogou web spider
%s
Crawl-delay: 2

User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: Perplexity-User
%s

User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
User-agent: Amazonbot
User-agent: Meta-ExternalAgent
User-agent: CCBot
%s
Crawl-delay: 5

Sitemap: %s/sitemap.xml
`, rules, rules, rules, rules, rules, baseURL())
	WriteBodyWithETag(c, "text/plain; charset=utf-8", body, 86400)
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
	WriteBodyWithETag(c, "application/xml; charset=utf-8", xml, maxAge)
}

// WriteBodyWithETag 统一的条件请求出口:弱 ETag + If-None-Match → 304。
//
// 2026-08-10 审计:全站 SEO 面(sitemap/robots)零 conditional-GET 支持,爬虫每次
// 都全量回源(单片 sitemap 4.3MB 未压缩)。Google 抓取预算文档明确:服务端支持
// 304 能显著提高大站点抓取效率。ETag 用 FNV-1a 内容哈希 —— 内容由 Redis 版本化
// 缓存驱动,同版本字节恒定,哈希即身份;弱标记(W/)表达「字节级可能有差异但语义等价」。
func WriteBodyWithETag(c *gin.Context, contentType, body string, maxAge int) {
	sum := fnv.New64a()
	_, _ = sum.Write([]byte(body))
	etag := fmt.Sprintf(`W/"%016x"`, sum.Sum64())

	c.Header("Cache-Control", fmt.Sprintf("public, max-age=%d", maxAge))
	c.Header("ETag", etag)
	if inm := c.GetHeader("If-None-Match"); inm != "" && etagMatches(inm, etag) {
		c.Status(http.StatusNotModified)
		return
	}
	c.Header("Content-Type", contentType)
	c.String(http.StatusOK, body)
}

// etagMatches If-None-Match 弱比较:忽略 W/ 前缀,支持逗号分隔的多值与 "*"。
func etagMatches(headerVal, etag string) bool {
	stripWeak := func(s string) string {
		s = strings.TrimSpace(s)
		return strings.TrimPrefix(s, "W/")
	}
	target := stripWeak(etag)
	for _, candidate := range strings.Split(headerVal, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || stripWeak(candidate) == target {
			return true
		}
	}
	return false
}
