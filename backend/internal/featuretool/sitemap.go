// ============================================================================
// 功能广场 —— sitemap(匿名可访问, 给搜索引擎收录)
//
//   /sitemap-tools.xml          sitemap 索引(列出分页 sitemap)
//   /sitemap-tools-{N}.xml      第 N 页 url 集(已上线工具 /tools/{slug})
//
// robots.txt 里额外加 `Sitemap: <base>/sitemap-tools.xml`(见 internal/seo robots),
// 与主 sitemap 解耦 —— Google/百度 支持 robots 多条 Sitemap 指令。
// 单页 2 万条, 远低于协议 5 万上限;10W 数据 = 5 页,后续增长自动扩页。
// ============================================================================

package featuretool

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	appconfig "scholar-backend/internal/common/config"
)

const toolSitemapPageSize = 20000

// ServeToolSitemapIndex GET /sitemap-tools.xml
func (h *Handler) ServeToolSitemapIndex(c *gin.Context) {
	count, lastMod, err := h.svc.SitemapCount()
	if err != nil {
		c.String(http.StatusInternalServerError, "internal error")
		return
	}
	pages := int((count + toolSitemapPageSize - 1) / toolSitemapPageSize)
	if pages < 1 {
		pages = 1
	}
	base := appconfig.CanonicalBaseURL()
	lm := lastMod.Format("2006-01-02")

	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for i := 1; i <= pages; i++ {
		fmt.Fprintf(&b, "  <sitemap>\n    <loc>%s/sitemap-tools-%d.xml</loc>\n    <lastmod>%s</lastmod>\n  </sitemap>\n", base, i, lm)
	}
	b.WriteString(`</sitemapindex>` + "\n")

	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=21600")
	c.String(http.StatusOK, b.String())
}

// ServeToolSitemap GET /sitemap-tools-{N}.xml
func (h *Handler) ServeToolSitemap(c *gin.Context) {
	// ⚠️ 路由 `/sitemap-tools-:page.xml` 是 gin/httprouter 不支持的 mid-segment placeholder:
	// c.Param("page") 实际拿不到值(为空),必须从原始 URL 路径救回页码。
	// (seo 包的 ServePaperSitemap 早有此救回,tools 处漏了 → 每个分片号都退化成 page=1、
	//  OFFSET 恒为 0、所有分片返回同一批前 2 万条,超页也不 404。这里补齐。)
	pageStr := strings.TrimSuffix(c.Param("page"), ".xml")
	if pageStr == "" {
		p := strings.TrimPrefix(c.Request.URL.Path, "/sitemap-tools-")
		pageStr = strings.TrimSuffix(p, ".xml")
	}
	page, perr := strconv.Atoi(pageStr)
	if perr != nil || page < 1 {
		c.String(http.StatusNotFound, "not found")
		return
	}
	rows, err := h.svc.SitemapPage(page, toolSitemapPageSize)
	if err != nil {
		c.String(http.StatusInternalServerError, "internal error")
		return
	}
	if len(rows) == 0 {
		c.String(http.StatusNotFound, "not found")
		return
	}
	base := appconfig.CanonicalBaseURL()

	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, r := range rows {
		if r.Slug == "" {
			continue
		}
		lm := r.UpdatedAt
		if lm.IsZero() {
			lm = time.Now()
		}
		fmt.Fprintf(&b, "  <url>\n    <loc>%s/tools/%s</loc>\n    <lastmod>%s</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n",
			base, r.Slug, lm.Format(time.RFC3339))
	}
	b.WriteString(`</urlset>` + "\n")

	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=21600")
	c.String(http.StatusOK, b.String())
}
