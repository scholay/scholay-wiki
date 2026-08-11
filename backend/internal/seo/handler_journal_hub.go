// ============================================================================
// Scholay学术 V1.0
// SEO 期刊枢纽 —— 公开 JSON API + hub sitemap
//
//	GET /api/v1/public/journal-hubs/overview
//	GET /api/v1/public/journal-hubs/list?dimension=category|country|warning|oa&key=&page=&per_page=
//	GET /sitemap-journal-hubs.xml
//
// API 响应形状是与前端 SPA 的精确契约(JournalCard 见 journal_hub.go),
// 走 utils.Success 信封;匿名,限流继承 public 组。
// ============================================================================

package seo

import (
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// journalHubAPIPerPageCap 公开 API 单页上限(SSR 侧的预警单页 500 不走这里)。
const journalHubAPIPerPageCap = 100

// JournalHubOverviewAPI GET /public/journal-hubs/overview
// data: {categories:[{slug,name,count}], countries:[{code,count}], warning_count, oa_count, latest:[JournalCard]}
func (h *Handler) JournalHubOverviewAPI(c *gin.Context) {
	ov, err := h.service.GetJournalHubOverview()
	if err != nil {
		slog.Error("seo journal hub overview failed", "err", err)
		utils.ServerError(c, "journal hub overview failed")
		return
	}
	utils.Success(c, ov)
}

// JournalHubListAPI GET /public/journal-hubs/list
// data: {items:[JournalCard], total, page, per_page}
//   - dimension=category|country 需要 key(slug / 两位国家码);warning|oa 忽略 key
//   - 超尾页返回空 items + 真实 total(200,不是 404 —— total 让前端自判边界)
func (h *Handler) JournalHubListAPI(c *gin.Context) {
	dimension := strings.TrimSpace(c.Query("dimension"))
	key := strings.TrimSpace(c.Query("key"))

	switch dimension {
	case "category", "country":
		if key == "" {
			utils.BadRequest(c, "key is required for dimension "+dimension)
			return
		}
	case "warning", "oa":
		// 专题维度无 key。
	default:
		utils.BadRequest(c, "dimension must be one of category|country|warning|oa")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", strconv.Itoa(JournalHubPerPage)))
	if page <= 0 {
		page = 1
	}
	if perPage <= 0 {
		perPage = JournalHubPerPage
	}
	if perPage > journalHubAPIPerPageCap {
		perPage = journalHubAPIPerPageCap
	}

	lst, err := h.service.GetJournalHubList(dimension, key, page, perPage)
	if err != nil {
		slog.Error("seo journal hub list failed", "dimension", dimension, "key", key, "err", err)
		utils.ServerError(c, "journal hub list failed")
		return
	}
	if lst == nil {
		utils.NotFound(c, "hub dimension key not found")
		return
	}
	utils.Success(c, gin.H{
		"items":    lst.Items,
		"total":    lst.Total,
		"page":     lst.Page,
		"per_page": lst.PerPage,
	})
}

// ServeJournalHubSitemap GET /sitemap-journal-hubs.xml
// 全部枢纽页 URL(含路径式分页);lastmod = 对应集合最新 updated_at(行级诚实,
// 见 ListJournalHubSitemapEntries 头注),零值省略。缓存策略与其它期刊分片一致:
// journals 版本号驱动失效 + 6h TTL 兜底。
func (h *Handler) ServeJournalHubSitemap(c *gin.Context) {
	version := h.versionForKind(c.Request.Context(), "journals")
	cacheKey := fmt.Sprintf("%s:journal-hubs:v1:v%d", sitemapCacheKey, version)

	if xml, ok := h.getCached(c.Request.Context(), cacheKey); ok {
		h.writeXML(c, xml, sitemapBrowserCache)
		return
	}

	entries, err := h.service.ListJournalHubSitemapEntries()
	if err != nil {
		slog.Error("seo journal hub sitemap failed", "err", err)
		c.String(http.StatusInternalServerError, "internal error")
		return
	}
	if len(entries) == 0 {
		// 冷启动(库内还没有已发布期刊):hub 页面可访问但没有可列条目。
		c.String(http.StatusNotFound, "not found")
		return
	}

	base := baseURL()
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, e := range entries {
		lastModXML := ""
		if !e.LastMod.IsZero() {
			lastModXML = "    <lastmod>" + e.LastMod.Format("2006-01-02") + "</lastmod>\n"
		}
		// 枢纽是发现层列表页:weekly/0.6;总枢纽入口 daily/0.7(新增期刊板块日更语义)。
		changefreq, priority := "weekly", "0.6"
		if e.Path == "/journals/browse" {
			changefreq, priority = "daily", "0.7"
		}
		fmt.Fprintf(&b, "  <url>\n    <loc>%s</loc>\n%s    <changefreq>%s</changefreq>\n    <priority>%s</priority>\n  </url>\n",
			html.EscapeString(base+e.Path), lastModXML, changefreq, priority)
	}
	b.WriteString(`</urlset>` + "\n")

	xml := b.String()
	h.setCached(c.Request.Context(), cacheKey, xml, sitemapCacheTTL)
	h.writeXML(c, xml, sitemapBrowserCache)
}
