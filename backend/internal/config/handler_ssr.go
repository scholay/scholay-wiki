// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - SSR 代码片段注入 & 动态 Sitemap
// ============================================================================

package config

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/model"
	"scholar-backend/internal/content"
	"scholar-backend/internal/seo"

	"github.com/gin-gonic/gin"
)

// ---------------------------------------------------------------------------
// noscript SSR 正文样式 —— 爬虫(以及禁用 JS 的访客)看到的那一份 HTML。
//
// 配色是 frontend-user/src/styles/globals.css 的**人工镜像**(真源在 Figma
// `JIv8fxQthMS37JLGHNOEbB` / `Scholay设计系统`)。这里是后端拼字符串,拿不到
// CSS 变量,只能抄 token 解析后的字面值 —— **改前端品牌色必须同步改这里**。
//
// ⚠️ 2026-07-28 修的一个真回归:这一整套原本是**暗色态**配色
// (正文 #e0e0e0、标题 #ffffff、链接 Material 蓝 #64b5f6)。站点的暗色态已于
// 2026-07 下线,body 底色改成米白 #F6F4EE 后,这些浅色文字的对比度掉到
// **正文 1.20:1、链接 2.01:1** —— 等于隐形。前端的设计护栏只扫 frontend-user/src,
// 完全看不到 backend/,所以它一直没被发现。
//
// 对比度按米白底 #F6F4EE 实算:正文 14.93:1 · 段落 7.25:1 · 小字 4.58:1 · 链接 8.02:1。
// 另:链接从蓝改朱砂不只是对比度 —— 设计系统里蓝色已整体退休。
//
// 收口成包级常量而不是每个函数各写一份:改造前同一串样式在本文件里重复了 8 次,
// 改配色要改 8 处,漏一处就出现「同一批 noscript 里两种正文色」。
// ---------------------------------------------------------------------------
const (
	ssrBaseStyle    = `style="max-width: 1000px; margin: 20px auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1F1F23;"`
	ssrHeadingStyle = `style="color: #1F1F23; border-bottom: 1px solid #DCDAD6; padding-bottom: 10px; font-size: 1.4rem;"`
	ssrHeadingTight = `style="color: #1F1F23; border-bottom: 1px solid #DCDAD6; padding-bottom: 10px;"`
	ssrTextStyle    = `style="color: #505059; line-height: 1.8; margin-bottom: 12px;"`
	ssrMetaStyle    = `style="color: #6E6E78; font-size: 0.9rem; margin-bottom: 8px;"`
	ssrSubHeadStyle = `style="color: #1F1F23; font-size: 1.1rem; margin: 16px 0 8px;"`
	ssrListStyle    = `style="color: #505059; line-height: 1.8; padding-left: 20px;"`
)

const (
	// indexHTMLCacheTTL is how long to cache the original index.html
	indexHTMLCacheTTL = 5 * time.Minute
	// paperOnMissTimeout 冷门论文 URL 现拉 minicod 的超时(M2)。爬虫请求可接受几秒,但必须有界。
	paperOnMissTimeout = 3 * time.Second
)

// knownRoutePrefixes lists legitimate frontend route prefixes that should NOT be blocked,
// even if they match a suspicious prefix pattern (e.g., /admin/ is our real admin dashboard).
var knownRoutePrefixes = []string{
	"/admin/",
}

// isSuspiciousPath returns true for paths that are clearly not valid frontend routes
// (e.g., scanner/bot probes like .php, .asp, .env, wp-admin, etc.)
func isSuspiciousPath(path string) bool {
	lowerPath := strings.ToLower(path)

	// 1. Suspicious suffixes always block (e.g., /admin/login.php is still suspicious)
	suspiciousSuffixes := []string{
		".php", ".asp", ".aspx", ".jsp", ".cgi", ".pl",
		".env", ".git", ".bak", ".sql", ".yml", ".yaml",
		".xml", ".log", ".ini", ".conf", ".config",
	}
	for _, suffix := range suspiciousSuffixes {
		if strings.HasSuffix(lowerPath, suffix) {
			return true
		}
	}

	// 2. Allow our own legitimate route prefixes (before checking suspicious prefixes)
	for _, known := range knownRoutePrefixes {
		if strings.HasPrefix(lowerPath, known) || lowerPath == strings.TrimSuffix(known, "/") {
			return false
		}
	}

	// 3. Suspicious prefixes block (scanner probes)
	suspiciousPrefixes := []string{
		"/wp-", "/wordpress", "/admin/", "/cgi-bin/",
		"/.well-known/", "/vendor/", "/node_modules/",
	}
	for _, prefix := range suspiciousPrefixes {
		if strings.HasPrefix(lowerPath, prefix) {
			return true
		}
	}
	return false
}

// ServeIndexHTML serves the route-specific HTML with code snippets injected.
// For each request path (e.g. /about, /privacy), it fetches the corresponding
// pre-rendered HTML from the frontend container, which has unique title,
// description, canonical URL and noscript content for SEO/AdSense compliance.
func (h *Handler) ServeIndexHTML(c *gin.Context) {
	requestPath := c.Request.URL.Path
	if requestPath == "" {
		requestPath = "/"
	}

	if isSuspiciousPath(requestPath) {
		c.Redirect(http.StatusFound, "/")
		return
	}

	// 尾斜杠归一:/paper/x/ → 301 /paper/x。NoRoute 走的路径 gin 的 RedirectTrailingSlash 不生效,
	// 不归一会让尾斜杠变体拿到通用壳 + 首页 canonical(未自指),形成重复页。带 query 时保留 query。
	if len(requestPath) > 1 && strings.HasSuffix(requestPath, "/") {
		target := strings.TrimRight(requestPath, "/")
		if target == "" {
			target = "/"
		}
		if raw := c.Request.URL.RawQuery; raw != "" {
			target += "?" + raw
		}
		c.Redirect(http.StatusMovedPermanently, target)
		return
	}

	// Legacy /paper/{slug} / /author/{slug} → canonical /paper/{source}/{paperId} 永久重定向
	// (新前端路由全部用 source+paperId,旧 slug 仍在 sitemap fallback / 收录里出现,
	// 这里 301 把 link equity 收拢到 canonical,避免 Google 当 duplicate 内容)。
	// 仅在 slug 真能反查到带 source+paperId 的 SEO 行时才跳转 —— 解析失败 / 旧行
	// 没回填 source 都保持原路径,让下面的 SSR 走 fallback。
	if redirectTo := h.canonicalRedirectFor(requestPath); redirectTo != "" {
		c.Redirect(http.StatusMovedPermanently, redirectTo)
		return
	}

	// Get the route-specific HTML content from frontend
	pageHTML, err := h.getPageHTML(requestPath)
	if err != nil {
		slog.Error("failed to get HTML for route", "path", requestPath, "err", err)
		// Fallback: proxy to frontend container directly
		h.proxyToFrontend(c)
		return
	}

	// Get code snippets from database
	snippetsGrouped, err := h.service.GetCodeSnippetsGrouped()
	if err != nil {
		slog.Error("failed to get code snippets", "err", err)
		// Return original HTML without snippets
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.Header("Cache-Control", "no-cache, must-revalidate")
		c.String(http.StatusOK, pageHTML)
		return
	}

	// Inject code snippets into HTML
	modifiedHTML := h.injectCodeSnippets(pageHTML, snippetsGrouped)

	// Inject route-specific noscript content for SEO (Google AdSense compliance)
	modifiedHTML = injectRouteNoscript(modifiedHTML, requestPath)

	// 静态/入口页专属 title/description/自指 canonical —— SPA 壳对所有路由回落同一份
	// 首页 index.html,不注入则新纳入索引的 search/journals/privacy/terms/disclaimer
	// 全是首页通用标题。实体页(paper/author/...)不在 map 内,此调用对其为 no-op。
	modifiedHTML = injectStaticPageSEOMeta(modifiedHTML, requestPath)

	// 博客 / 资源文章:完整正文已由上面的 injectRouteNoscript 写进 noscript(content 包单一真源),
	// 这里补专属 title/description/自指 canonical + BlogPosting/Article JSON-LD + OG。
	if strings.HasPrefix(requestPath, "/blog/") {
		if slug := strings.TrimPrefix(requestPath, "/blog/"); slug != "" && !strings.Contains(slug, "/") {
			modifiedHTML = injectArticleSEOMeta(modifiedHTML, "blog", slug, requestPath)
		}
	} else if strings.HasPrefix(requestPath, "/resources/") {
		if slug := strings.TrimPrefix(requestPath, "/resources/"); slug != "" && !strings.Contains(slug, "/") {
			modifiedHTML = injectArticleSEOMeta(modifiedHTML, "resources", slug, requestPath)
		}
	} else if strings.HasPrefix(requestPath, "/qa/") {
		if slug := strings.TrimPrefix(requestPath, "/qa/"); slug != "" && !strings.Contains(slug, "/") {
			modifiedHTML = injectArticleSEOMeta(modifiedHTML, "qa", slug, requestPath)
		}
	}

	// 论文详情页 SEO 元数据注入 —— 同时支持新 canonical 和 legacy 两种路径形式:
	//   新 canonical /paper/{source}/{paperId}   → ResolveByPaperID
	//   legacy      /paper/{slug}                → ResolveSlug
	// 仅按 `/` 段数区分,paperId 内部允许出现 `:`(如 arXiv:1706.03762),不可有 `/`。
	if h.paperSEOProvider != nil && strings.HasPrefix(requestPath, "/paper/") {
		rest := strings.TrimPrefix(requestPath, "/paper/")
		if rest != "" {
			parts := strings.Split(rest, "/")
			var meta *seo.PaperSSRMeta
			var err error
			switch len(parts) {
			case 1:
				// legacy /paper/{slug}
				meta, err = h.paperSEOProvider.ResolveSlug(parts[0])
			case 2:
				// canonical /paper/{source}/{paperId}
				if source, paperID := parts[0], parts[1]; source != "" && paperID != "" {
					meta, err = h.paperSEOProvider.ResolveByPaperID(source, paperID)
					// M2:seo 无行(冷门 URL)且注入了 enricher → 现拉一次 minicod 落库并渲染,
					// 让首个爬虫命中即建索引(带超时;拉不到/超时回落下面的 noindex)。
					if err == nil && meta == nil && h.paperEnricher != nil {
						ctx, cancel := context.WithTimeout(c.Request.Context(), paperOnMissTimeout)
						if m2, e2 := h.paperEnricher.EnrichPaperOnMiss(ctx, source, paperID); e2 == nil && m2 != nil {
							meta = m2
						}
						cancel()
					}
				}
			}
			if meta != nil {
				modifiedHTML = injectPaperSEOMeta(modifiedHTML, meta, requestPath)
			} else if err == nil {
				// 论文不存在(非 DB 错误)—— 失效/伪造 paperId 空间无界,打 noindex 阻止软 404 被收录
				modifiedHTML = injectNoindex(modifiedHTML)
			}
		}
	}

	// 作者详情页 SEO 元数据注入 —— 同样支持新 canonical 和 legacy
	if h.authorSEOProvider != nil && strings.HasPrefix(requestPath, "/author/") {
		rest := strings.TrimPrefix(requestPath, "/author/")
		if rest != "" {
			parts := strings.Split(rest, "/")
			var meta *seo.AuthorSSRMeta
			var err error
			switch len(parts) {
			case 1:
				meta, err = h.authorSEOProvider.ResolveAuthorSlug(parts[0])
			case 2:
				if source, authorID := parts[0], parts[1]; source != "" && authorID != "" {
					meta, err = h.authorSEOProvider.ResolveByAuthorID(source, authorID)
					// M2:seo 无行(冷门作者 URL)→ 现拉一次 minicod 落库并渲染。
					if err == nil && meta == nil && h.authorEnricher != nil {
						ctx, cancel := context.WithTimeout(c.Request.Context(), paperOnMissTimeout)
						if m2, e2 := h.authorEnricher.EnrichAuthorOnMiss(ctx, source, authorID); e2 == nil && m2 != nil {
							meta = m2
						}
						cancel()
					}
				}
			}
			if meta != nil {
				modifiedHTML = injectAuthorSEOMeta(modifiedHTML, meta, requestPath)
			} else if err == nil {
				// 作者不存在(非 DB 错误)—— 失效/伪造 authorId 空间无界,打 noindex
				modifiedHTML = injectNoindex(modifiedHTML)
			}
		}
	}

	// 期刊详情页 SEO 元数据注入 (canonicalRedirectFor 已处理 301; 走到这里说明 URL 已是 canonical
	// 或者 SEO 行不存在/没 slug 不需要重定向)
	if h.journalSEOProvider != nil && strings.HasPrefix(requestPath, "/journal/") {
		rest := strings.TrimPrefix(requestPath, "/journal/")
		if rest != "" {
			idStr, _ := splitJournalPath(rest)
			if id, perr := strconv.ParseInt(idStr, 10, 64); perr == nil && id > 0 {
				if meta, err := h.journalSEOProvider.ResolveByJournalID(id); err == nil && meta != nil {
					modifiedHTML = injectJournalSEOMeta(modifiedHTML, meta, requestPath)
				} else if err == nil {
					// 期刊不存在(非 DB 错误)→ noindex
					modifiedHTML = injectNoindex(modifiedHTML)
				}
			} else {
				// journal id 非数字 / <=0 —— 非法期刊路径,软 404
				modifiedHTML = injectNoindex(modifiedHTML)
			}
		}
	}

	// 功能广场工具详情页 SEO 元数据注入 (/tools/{slug}) —— 单段 slug, 列表页 /tools 不命中。
	if h.toolSEOProvider != nil && strings.HasPrefix(requestPath, "/tools/") {
		rest := strings.TrimPrefix(requestPath, "/tools/")
		if rest != "" && !strings.Contains(rest, "/") {
			if meta, err := h.toolSEOProvider.ResolveToolBySlug(rest); err == nil && meta != nil {
				modifiedHTML = injectToolSEOMeta(modifiedHTML, meta, requestPath)
			} else if err == nil {
				// 工具不存在(非 DB 错误)→ noindex,避免 /tools/<乱写> 成软 404
				modifiedHTML = injectNoindex(modifiedHTML)
			}
		}
	}

	// 情报 SEO 注入:/news 列表(noscript 链接列表)+ /news/{slug} 详情(全文 noscript + NewsArticle JSON-LD)。
	if h.newsSEOProvider != nil && (requestPath == "/news" || strings.HasPrefix(requestPath, "/news/")) {
		modifiedHTML = h.injectNewsSSR(modifiedHTML, requestPath)
	}

	// Return the modified HTML
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Header("Cache-Control", "no-cache, must-revalidate")
	c.String(http.StatusOK, modifiedHTML)
}

// canonicalRedirectFor 检查请求路径是不是 legacy /paper/{slug} 或 /author/{slug},
// 若能反查到 source + entityID,返回 canonical 路径(供 301 跳转);
// 否则返回 "" 表示无需重定向。
//
// 调用方在拿到 HTML 之前调,所以 200 的 SSR 路径不会被 301 截掉。
// query string + raw path 一并保留 —— 用户可能从带 utm 的链接进来。
func (h *Handler) canonicalRedirectFor(requestPath string) string {
	// /paper/{slug}
	if h.paperSEOProvider != nil && strings.HasPrefix(requestPath, "/paper/") {
		rest := strings.TrimPrefix(requestPath, "/paper/")
		if rest != "" && !strings.Contains(rest, "/") {
			if meta, err := h.paperSEOProvider.ResolveSlug(rest); err == nil && meta != nil {
				if meta.Source != "" && meta.PaperID != "" {
					return "/paper/" + meta.Source + "/" + url.PathEscape(meta.PaperID)
				}
			}
		}
	}
	// /author/{slug}
	if h.authorSEOProvider != nil && strings.HasPrefix(requestPath, "/author/") {
		rest := strings.TrimPrefix(requestPath, "/author/")
		if rest != "" && !strings.Contains(rest, "/") {
			if meta, err := h.authorSEOProvider.ResolveAuthorSlug(rest); err == nil && meta != nil {
				if meta.Source != "" && meta.AuthorID != "" {
					return "/author/" + meta.Source + "/" + url.PathEscape(meta.AuthorID)
				}
			}
		}
	}
	// /journal/{id} 或 /journal/{id}/{slug}  ——  301 到 canonical /journal/{id}/{canonical-slug}
	//   - 缺 slug → 补到 canonical
	//   - slug 不对 → 校正
	//   - 已是 canonical → 返回 ""
	//   - id 解析失败 / 找不到 SEO 行 / 无 slug → 不重定向 (前端正常渲染,但没 SEO 增益)
	if h.journalSEOProvider != nil && strings.HasPrefix(requestPath, "/journal/") {
		rest := strings.TrimPrefix(requestPath, "/journal/")
		if rest != "" {
			idStr, currentSlug := splitJournalPath(rest)
			if id, err := strconv.ParseInt(idStr, 10, 64); err == nil && id > 0 {
				if meta, err := h.journalSEOProvider.ResolveByJournalID(id); err == nil && meta != nil {
					canonical := canonicalJournalPath(meta)
					if canonical != "" && canonical != requestPath {
						// 只在 slug 部分不一致时 301; canonical 和 currentSlug 已被 splitJournalPath 解码
						_ = currentSlug
						return canonical
					}
				}
			}
		}
	}
	// /qa 裸列表页 → /help(帮助中心 = 学术问答;详情 /qa/{slug} 不受影响,保持 canonical)
	if requestPath == "/qa" {
		return "/help"
	}
	return ""
}

// splitJournalPath 把 "{id}" 或 "{id}/{slug}" 切成两段
// 多于 1 个 "/" (例如 /journal/123/foo/bar) → slug 取第一段, 多余尾段忽略
func splitJournalPath(rest string) (id, slug string) {
	if i := strings.Index(rest, "/"); i >= 0 {
		return rest[:i], rest[i+1:]
	}
	return rest, ""
}

// canonicalJournalPath 用 meta 拼 canonical 路径
//   - 有 slug → /journal/{id}/{slug}
//   - 无 slug → /journal/{id} (永远不需要 301)
func canonicalJournalPath(meta *seo.JournalSSRMeta) string {
	idStr := strconv.FormatInt(meta.JournalID, 10)
	if meta.Slug != "" {
		return "/journal/" + idStr + "/" + meta.Slug
	}
	return "/journal/" + idStr
}

// ─── JSON-LD 结构化数据(详情页 schema.org)────────────────────────────────
// 给爬虫提供机器可读的实体类型与属性, 触发富摘要 + 知识卡; 与首页 Organization/WebSite
// 一起构成百度/必应「官网 + 子链」的结构化基础。
// json.Marshal 默认把 <>& 转义成 \u00xx, 嵌进 <script> 安全(不会被 </script> 截断)。

func jsonLDScript(obj any) string {
	b, err := json.Marshal(obj)
	if err != nil {
		return ""
	}
	return `<script type="application/ld+json">` + string(b) + `</script>`
}

// buildPaperJSONLD —— ScholarlyArticle(标题/作者/年份/期刊/DOI)
func buildPaperJSONLD(meta *seo.PaperSSRMeta, canonical string) string {
	if meta.Title == "" {
		return ""
	}
	obj := map[string]any{
		"@context":  "https://schema.org",
		"@type":     "ScholarlyArticle",
		"headline":  truncate(meta.Title, 110),
		"name":      meta.Title,
		"url":       canonical,
		"publisher": map[string]any{"@type": "Organization", "name": "Scholay学术", "url": appconfig.CanonicalBaseURL()},
	}
	if meta.Abstract != "" {
		obj["abstract"] = truncate(meta.Abstract, 500)
		obj["description"] = truncate(meta.Abstract, 200)
	}
	if len(meta.Authors) > 0 {
		authors := make([]map[string]string, 0, len(meta.Authors))
		for _, n := range meta.Authors {
			if n != "" {
				authors = append(authors, map[string]string{"@type": "Person", "name": n})
			}
		}
		if len(authors) > 0 {
			obj["author"] = authors
		}
	}
	if meta.Year != nil && *meta.Year > 0 {
		obj["datePublished"] = fmt.Sprintf("%d", *meta.Year)
	}
	if meta.Venue != "" {
		obj["isPartOf"] = map[string]any{"@type": "Periodical", "name": meta.Venue}
	}
	if meta.DOI != "" {
		obj["identifier"] = map[string]any{"@type": "PropertyValue", "propertyID": "DOI", "value": meta.DOI}
		obj["sameAs"] = "https://doi.org/" + meta.DOI
	}
	// GEO: 被引数作为 interactionStatistic(可量化权威度),供 AI 引擎引用。
	if meta.CitationCount > 0 {
		obj["interactionStatistic"] = map[string]any{
			"@type":                "InteractionCounter",
			"interactionType":      "https://schema.org/CiteAction",
			"userInteractionCount": meta.CitationCount,
		}
	}
	// GEO: 学科领域作为 about(主题实体),帮 AI 引擎把论文关联到正确学科。
	if len(meta.FieldsOfStudy) > 0 {
		about := make([]map[string]string, 0, len(meta.FieldsOfStudy))
		for _, f := range meta.FieldsOfStudy {
			if f != "" {
				about = append(about, map[string]string{"@type": "Thing", "name": f})
			}
		}
		if len(about) > 0 {
			obj["about"] = about
		}
	}
	return jsonLDScript(obj)
}

// buildAuthorJSONLD —— ProfilePage + Person(姓名/机构/主页)
func buildAuthorJSONLD(meta *seo.AuthorSSRMeta, canonical string) string {
	if meta.Name == "" {
		return ""
	}
	person := map[string]any{
		"@type": "Person",
		"name":  meta.Name,
		"url":   canonical,
	}
	if len(meta.Affiliations) > 0 {
		affs := make([]map[string]string, 0, len(meta.Affiliations))
		for _, a := range meta.Affiliations {
			if a != "" {
				affs = append(affs, map[string]string{"@type": "Organization", "name": a})
			}
		}
		if len(affs) > 0 {
			person["affiliation"] = affs
		}
	}
	// sameAs:权威外链(主页 + ORCID)。ORCID 是学者身份的强权威信号,利于 SEO / 被 AI 引用。
	var sameAs []string
	if meta.Homepage != "" {
		sameAs = append(sameAs, meta.Homepage)
	}
	if meta.ORCID != "" {
		person["identifier"] = "https://orcid.org/" + meta.ORCID
		sameAs = append(sameAs, "https://orcid.org/"+meta.ORCID)
	}
	if len(sameAs) > 0 {
		person["sameAs"] = sameAs
	}
	// 学术指标作为机器可读 additionalProperty(论文数 / 总被引 / h-index)。schema.org 无标准
	// 学者指标字段,用 PropertyValue 兜住 —— 主要给 AI 生成式引擎可引用的量化权威度(GEO)。
	var props []map[string]any
	if meta.PaperCount > 0 {
		props = append(props, map[string]any{"@type": "PropertyValue", "name": "论文数", "value": meta.PaperCount})
	}
	if meta.CitationCount > 0 {
		props = append(props, map[string]any{"@type": "PropertyValue", "name": "总被引", "value": meta.CitationCount})
	}
	if meta.HIndex != nil && *meta.HIndex > 0 {
		props = append(props, map[string]any{"@type": "PropertyValue", "name": "h-index", "value": *meta.HIndex})
	}
	if len(props) > 0 {
		person["additionalProperty"] = props
	}
	page := map[string]any{
		"@context":   "https://schema.org",
		"@type":      "ProfilePage",
		"url":        canonical,
		"mainEntity": person,
	}
	// 代表作作为 hasPart(ScholarlyArticle 列表),给 AI 引擎可引用的作者产出清单(GEO)。
	if len(meta.Works) > 0 {
		base := appconfig.CanonicalBaseURL()
		parts := make([]map[string]any, 0, len(meta.Works))
		for _, w := range meta.Works {
			if w.Title == "" {
				continue
			}
			art := map[string]any{"@type": "ScholarlyArticle", "name": w.Title}
			if w.Source != "" && w.PaperID != "" {
				art["url"] = base + "/paper/" + w.Source + "/" + w.PaperID
			}
			if w.Year > 0 {
				art["datePublished"] = fmt.Sprintf("%d", w.Year)
			}
			parts = append(parts, art)
		}
		if len(parts) > 0 {
			page["hasPart"] = parts
		}
	}
	return jsonLDScript(page)
}

// buildJournalJSONLD —— Periodical(刊名/出版商/ISSN)
func buildJournalJSONLD(meta *seo.JournalSSRMeta, canonical string) string {
	if meta.CanonicalName == "" {
		return ""
	}
	obj := map[string]any{
		"@context": "https://schema.org",
		"@type":    "Periodical",
		"name":     meta.CanonicalName,
		"url":      canonical,
	}
	if meta.Publisher != "" {
		obj["publisher"] = map[string]any{"@type": "Organization", "name": meta.Publisher}
	}
	if len(meta.ISSNs) > 0 {
		obj["issn"] = meta.ISSNs
	}
	return jsonLDScript(obj)
}

// SSR 注入用的正则在包级编译一次。原先每个 inject{Paper,Author,Journal,Tool}SEOMeta
// 在函数体内 regexp.MustCompile 同样的模式，而 ServeIndexHTML 对每个爬虫请求都会跑一次注入，
// 等于每请求重编译；提到包级 var 后只在 init 编译一次。
var (
	ssrTitleRe    = regexp.MustCompile(`(?is)<title>.*?</title>`)
	ssrDescRe     = regexp.MustCompile(`(?is)<meta\s+name=["']description["'][^>]*>`)
	ssrKeywordsRe = regexp.MustCompile(`(?is)<meta\s+name=["']keywords["'][^>]*>`)
	ssrCanonRe    = regexp.MustCompile(`(?is)<link\s+rel=["']canonical["'][^>]*>`)
	ssrBodyTagRe  = regexp.MustCompile(`(?i)(<body[^>]*>)`)
	// Open Graph 标签(社媒分享卡片)。壳里硬编码成首页值,实体页必须改写成本页的 url/title/desc,
	// 否则 facebook/twitter/linkedin/whatsapp(已被 $is_crawler 路由到 SSR)抓分享链接全塌缩成首页卡片。
	ssrOgTitleRe = regexp.MustCompile(`(?is)<meta\s+property=["']og:title["'][^>]*>`)
	ssrOgURLRe   = regexp.MustCompile(`(?is)<meta\s+property=["']og:url["'][^>]*>`)
	ssrOgDescRe  = regexp.MustCompile(`(?is)<meta\s+property=["']og:description["'][^>]*>`)
	ssrOgTypeRe  = regexp.MustCompile(`(?is)<meta\s+property=["']og:type["'][^>]*>`)
	ssrOgImageRe = regexp.MustCompile(`(?is)<meta\s+property=["']og:image["'][^>]*>`)
	// Twitter Card 壳里同样硬编码首页值,与 og:* 一并按页改写(否则 X / 偏好 twitter:* 的 AI 爬虫
	// 对每个不同详情页都显示同一张首页卡)。
	ssrTwTitleRe = regexp.MustCompile(`(?is)<meta\s+name=["']twitter:title["'][^>]*>`)
	ssrTwDescRe  = regexp.MustCompile(`(?is)<meta\s+name=["']twitter:description["'][^>]*>`)
	ssrTwImageRe = regexp.MustCompile(`(?is)<meta\s+name=["']twitter:image["'][^>]*>`)
	// robots meta —— 实体路径解析不到实体时打 noindex,阻止无界失效/伪造 ID 形成软 404 重复面。
	ssrRobotsRe = regexp.MustCompile(`(?is)<meta\s+name=["']robots["'][^>]*>`)
)

// upsertHeadTag 若 re 命中则整段替换为 tag,否则把 tag 插在 </head> 前。
// SSR 注入统一走它,消除各处「MatchString ? Replace : 插 </head>」重复。
func upsertHeadTag(html string, re *regexp.Regexp, tag string) string {
	if re.MatchString(html) {
		return re.ReplaceAllString(html, tag)
	}
	return strings.Replace(html, "</head>", tag+"\n</head>", 1)
}

// injectNoindex 给「实体路径但实体不存在」的软 404 打 noindex,阻止无界的失效/伪造 ID
// (来自外部 OpenAlex/Semantic Scholar 语料)被 Baidu / 无 JS 的 AI 爬虫当有效重复首页收录、
// 浪费抓取预算。follow 保留让爬虫顺内链爬到真实页。
// ⚠️ 只在 resolver 明确「未找到」(err==nil && meta==nil)时调用 —— DB 出错不打,避免误伤真实页;
// 也不对真实但从未被访问过(seo 行未建)的冷门实体造成永久 de-index:一旦有人访问建行,
// 下次爬取即拿到真实 meta 且无 noindex,恢复可收录。
func injectNoindex(html string) string {
	return upsertHeadTag(html, ssrRobotsRe, `<meta name="robots" content="noindex,follow">`)
}

// injectOG 改写 og:title / og:url / og:description / og:type 为本页值,并让 twitter:title /
// twitter:description 镜像同值(标签存在则替换,缺失则插在 </head> 前)。
// title/desc 走 htmlEscape 防属性注入;url 已是安全 URL。空值不动对应标签。
// ogType: 详情/文章类页传 "article"(带 og:type 后 OG 消费方才知是文章而非落地页);
//         列表/落地/枢纽页传 "website";空串则不写 og:type。
func injectOG(html, ogTitle, ogURL, ogDesc, ogType string) string {
	if ogTitle != "" {
		esc := htmlEscape(ogTitle)
		html = upsertHeadTag(html, ssrOgTitleRe, fmt.Sprintf(`<meta property="og:title" content="%s" />`, esc))
		html = upsertHeadTag(html, ssrTwTitleRe, fmt.Sprintf(`<meta name="twitter:title" content="%s" />`, esc))
	}
	if ogURL != "" {
		html = upsertHeadTag(html, ssrOgURLRe, fmt.Sprintf(`<meta property="og:url" content="%s" />`, htmlEscape(ogURL)))
	}
	if ogDesc != "" {
		esc := htmlEscape(ogDesc)
		html = upsertHeadTag(html, ssrOgDescRe, fmt.Sprintf(`<meta property="og:description" content="%s" />`, esc))
		html = upsertHeadTag(html, ssrTwDescRe, fmt.Sprintf(`<meta name="twitter:description" content="%s" />`, esc))
	}
	if ogType != "" {
		html = upsertHeadTag(html, ssrOgTypeRe, fmt.Sprintf(`<meta property="og:type" content="%s" />`, htmlEscape(ogType)))
	}
	return html
}

// insertNoscriptBlock 把一段「爬虫友好正文」包进 <noscript> 后插进 shell。
//
// 关键修复:当前 Vite 构建的 index.html **既没有 <noscript> 也没有旧锚点**
// (`<p style="text-align:center;margin-top:30px`),旧实现找不到锚点就**静默丢弃整张卡**
// → 弱 JS 爬虫(百度/搜狗)拿到空 <body>,SSR 为爬虫提供真实正文/H1/摘要的核心目的被打穿。
// 这里统一改为:把内容包进 <noscript> 后插在 </body> 前(Vite 壳唯一保证存在的锚点),
// 保证 noscript 正文一定进 HTML。浏览器执行 JS 时 <noscript> 不渲染(SPA 接管),爬虫则能读到。
func insertNoscriptBlock(html, innerHTML string) string {
	if innerHTML == "" {
		return html
	}
	block := "<noscript>\n" + innerHTML + "\n</noscript>"
	if idx := strings.LastIndex(html, "</body>"); idx >= 0 {
		return html[:idx] + block + "\n" + html[idx:]
	}
	// 极端兜底:连 </body> 都没有(理论不会)也把正文追加到末尾,crawler 仍可读。
	return html + "\n" + block
}

// injectPaperSEOMeta 替换 <title>/<meta description>，并在 noscript 中插入论文摘要卡片
// 目的：让 Googlebot 等爬虫看到真实论文元数据，而不是 SPA 通用壳
func injectPaperSEOMeta(html string, meta *seo.PaperSSRMeta, path string) string {
	title := meta.Title
	if title == "" {
		return html
	}
	// 标题:论文标题 + 学科/年份提示 + 品牌后缀
	// 例如:"Attention Is All You Need - 论文详情 (NeurIPS 2017) | Scholay 学术搜索"
	venueYear := buildPaperVenueSegment(meta)
	if venueYear != "" {
		venueYear = " (" + venueYear + ")"
	}
	seoTitle := fmt.Sprintf("%s - 论文详情%s | Scholay 学术搜索", truncate(title, 100), venueYear)

	// 描述：摘要优先，其次 venue/year/DOI/作者(作者截前 3 + 等,避免多作者时描述溢出被 SERP 截断)
	desc := meta.Abstract
	if desc == "" {
		var parts []string
		if len(meta.Authors) > 0 {
			n := minInt(len(meta.Authors), 3)
			authorsSeg := strings.Join(meta.Authors[:n], ", ")
			if len(meta.Authors) > n {
				authorsSeg += " 等"
			}
			parts = append(parts, "作者: "+authorsSeg)
		}
		if meta.Venue != "" {
			parts = append(parts, meta.Venue)
		}
		if meta.Year != nil && *meta.Year > 0 {
			parts = append(parts, fmt.Sprintf("%d", *meta.Year))
		}
		if meta.CitationCount > 0 {
			parts = append(parts, fmt.Sprintf("被引 %d 次", meta.CitationCount))
		}
		if meta.DOI != "" {
			parts = append(parts, "DOI: "+meta.DOI)
		}
		desc = strings.Join(parts, " · ")
		if desc != "" {
			desc = "在 Scholay 阅读这篇论文 — " + desc + "。AI 摘要、引文图谱、PDF 全文一键获取。"
		}
	}
	// SERP 大约展示 ~155-160 字,统一收敛到 160,避免过长被截或多作者时忽长忽短。
	desc = truncate(desc, 160)

	// 1) 替换 <title>
	titleRe := ssrTitleRe
	html = titleRe.ReplaceAllString(html, "<title>"+htmlEscape(seoTitle)+"</title>")

	// 2) 替换 <meta name="description" ...>（若不存在则跳过，不主动插入以免破坏已有结构）
	descRe := ssrDescRe
	if descRe.MatchString(html) {
		html = descRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}

	// 2.5) 替换 <meta name="keywords"> —— 论文场景词 + 标题中的关键名词作为长尾
	keywords := buildPaperKeywords(meta)
	keywordsRe := ssrKeywordsRe
	if keywordsRe.MatchString(html) {
		html = keywordsRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="keywords" content="%s">`, htmlEscape(keywords)))
	}

	// 3) 追加 canonical 链接（若 head 里已有则替换）
	// 域名由 SEO_BASE_URL 环境变量控制，默认 https://www.scholay.com。
	// 必须和 sitemap <loc> 前缀保持一致，否则爬虫会把 sitemap 里的 URL 当 duplicate 忽略。
	canonical := fmt.Sprintf("%s%s", appconfig.CanonicalBaseURL(), path)
	canonRe := ssrCanonRe
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if canonRe.MatchString(html) {
		html = canonRe.ReplaceAllString(html, canonTag)
	} else {
		html = strings.Replace(html, "</head>", canonTag+"\n</head>", 1)
	}

	// 3.5) 注入 ScholarlyArticle JSON-LD（富摘要 / 知识卡）
	if jsonLD := buildPaperJSONLD(meta, canonical); jsonLD != "" {
		html = strings.Replace(html, "</head>", jsonLD+"\n</head>", 1)
	}

	// 3.6) 改写 Open Graph / Twitter 为本页值(否则社媒分享塌缩到首页),og:type=article
	html = injectOG(html, seoTitle, canonical, desc, "article")

	// 4) 注入 noscript 论文卡片（爬虫友好）
	html = insertNoscriptBlock(html, buildPaperNoscriptCard(meta))

	return html
}

// buildPaperVenueSegment 拼出 "Venue Year" 或单独 venue/year,空则空串
func buildPaperVenueSegment(meta *seo.PaperSSRMeta) string {
	venue := meta.Venue
	year := ""
	if meta.Year != nil && *meta.Year > 0 {
		year = fmt.Sprintf("%d", *meta.Year)
	}
	if venue != "" && year != "" {
		return fmt.Sprintf("%s %s", venue, year)
	}
	if venue != "" {
		return venue
	}
	return year
}

// buildPaperKeywords 论文页 keywords meta:
//
//	通用学术高频词(让 Google 知道这是论文详情页) + 论文自身上下文(venue/year/作者/DOI)
//	原始论文标题里的关键名词由 Google 自己从内容中提取,我们不强塞,避免堆砌惩罚。
func buildPaperKeywords(meta *seo.PaperSSRMeta) string {
	parts := []string{
		"论文详情", "学术论文", "论文阅读", "论文摘要", "AI 论文",
		"文献检索", "文献综述", "Semantic Scholar", "Scholay",
		"paper detail", "research paper", "scholarly article",
	}
	if meta.Venue != "" {
		parts = append(parts, meta.Venue)
	}
	if meta.Year != nil && *meta.Year > 0 {
		parts = append(parts, fmt.Sprintf("%d 论文", *meta.Year))
	}
	if meta.DOI != "" {
		parts = append(parts, "DOI "+meta.DOI)
	}
	for i, name := range meta.Authors {
		if i >= 3 {
			break
		}
		if name != "" {
			parts = append(parts, name)
		}
	}
	// 学科领域作为长尾关键词 + 实体信号
	for _, f := range meta.FieldsOfStudy {
		if f != "" {
			parts = append(parts, f)
		}
	}
	return strings.Join(parts, ",")
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// buildPaperNoscriptCard 渲染论文的 noscript 卡片
func buildPaperNoscriptCard(meta *seo.PaperSSRMeta) string {
	baseStyle := ssrBaseStyle
	headingStyle := ssrHeadingStyle
	textStyle := ssrTextStyle
	metaStyle := ssrMetaStyle

	title := htmlEscape(meta.Title)
	var abstract string
	if meta.Abstract != "" {
		abstract = fmt.Sprintf("<p %s>%s</p>", textStyle, htmlEscape(truncate(meta.Abstract, 1500)))
	}

	var metaLines []string
	if len(meta.Authors) > 0 {
		metaLines = append(metaLines, "作者："+htmlEscape(strings.Join(meta.Authors, ", ")))
	}
	if meta.Venue != "" {
		metaLines = append(metaLines, "发表于："+htmlEscape(meta.Venue))
	}
	if meta.Year != nil && *meta.Year > 0 {
		metaLines = append(metaLines, fmt.Sprintf("年份：%d", *meta.Year))
	}
	if meta.DOI != "" {
		metaLines = append(metaLines, "DOI："+htmlEscape(meta.DOI))
	}
	// GEO 证据信号:被引数(可量化权威度) + 研究领域(实体关联)。AI 引擎偏好可引用的统计数字。
	if meta.CitationCount > 0 {
		metaLines = append(metaLines, fmt.Sprintf("被引用次数：%d", meta.CitationCount))
	}
	if len(meta.FieldsOfStudy) > 0 {
		metaLines = append(metaLines, "研究领域："+htmlEscape(strings.Join(meta.FieldsOfStudy, "、")))
	}

	var metaHTML string
	if len(metaLines) > 0 {
		metaHTML = fmt.Sprintf("<p %s>%s</p>", metaStyle, strings.Join(metaLines, " · "))
	}

	return fmt.Sprintf(`<article %s>
<h1 %s>%s</h1>
%s
%s
</article>`, baseStyle, headingStyle, title, metaHTML, abstract)
}

// injectAuthorSEOMeta 替换 <title>/<meta description>，并在 noscript 中插入作者卡片
// 与 injectPaperSEOMeta 同构,只是描述/卡片内容用作者元数据填充。
func injectAuthorSEOMeta(html string, meta *seo.AuthorSSRMeta, path string) string {
	if meta.Name == "" {
		return html
	}
	// 标题:作者名 + 主要机构 + 品牌
	// 例如:"Geoffrey Hinton (University of Toronto) - 作者档案 · 代表论文 | Scholay 学术搜索"
	primaryAff := ""
	if len(meta.Affiliations) > 0 {
		primaryAff = " (" + meta.Affiliations[0] + ")"
	}
	seoTitle := fmt.Sprintf("%s%s - 作者档案 · 代表论文 | Scholay 学术搜索", truncate(meta.Name, 80), primaryAff)

	// 描述：机构 + 文献量 + 引用 + h-index
	var parts []string
	if len(meta.Affiliations) > 0 {
		parts = append(parts, strings.Join(meta.Affiliations, ", "))
	}
	if meta.PaperCount > 0 {
		parts = append(parts, fmt.Sprintf("共 %d 篇论文", meta.PaperCount))
	}
	if meta.CitationCount > 0 {
		parts = append(parts, fmt.Sprintf("被引 %d 次", meta.CitationCount))
	}
	if meta.HIndex != nil && *meta.HIndex > 0 {
		parts = append(parts, fmt.Sprintf("h-index %d", *meta.HIndex))
	}
	statSeg := strings.Join(parts, " · ")
	desc := ""
	if statSeg != "" {
		desc = fmt.Sprintf("%s 的学术档案 — %s。在 Scholay 浏览代表论文、被引情况、合作网络与研究方向。", meta.Name, statSeg)
	} else {
		desc = fmt.Sprintf("%s 的学术档案与代表论文 — Scholay 整合 Semantic Scholar 与 OpenAlex 的作者画像数据,展示发表论文、引用情况与研究领域。", meta.Name)
	}
	desc = truncate(desc, 300)

	titleRe := ssrTitleRe
	html = titleRe.ReplaceAllString(html, "<title>"+htmlEscape(seoTitle)+"</title>")

	descRe := ssrDescRe
	if descRe.MatchString(html) {
		html = descRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}

	// keywords meta —— 作者场景高频词 + 个人元数据
	keywords := buildAuthorKeywords(meta)
	keywordsRe := ssrKeywordsRe
	if keywordsRe.MatchString(html) {
		html = keywordsRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="keywords" content="%s">`, htmlEscape(keywords)))
	}

	canonical := fmt.Sprintf("%s%s", appconfig.CanonicalBaseURL(), path)
	canonRe := ssrCanonRe
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if canonRe.MatchString(html) {
		html = canonRe.ReplaceAllString(html, canonTag)
	} else {
		html = strings.Replace(html, "</head>", canonTag+"\n</head>", 1)
	}

	if jsonLD := buildAuthorJSONLD(meta, canonical); jsonLD != "" {
		html = strings.Replace(html, "</head>", jsonLD+"\n</head>", 1)
	}

	html = injectOG(html, seoTitle, canonical, desc, "profile")
	html = insertNoscriptBlock(html, buildAuthorNoscriptCard(meta))

	return html
}

// buildAuthorKeywords 作者页 keywords meta
//
//	学术作者高频词(让 Google 知道这是作者档案页) + 作者具体机构/姓名信息
func buildAuthorKeywords(meta *seo.AuthorSSRMeta) string {
	parts := []string{
		meta.Name,
		"作者档案", "学者主页", "代表论文", "h-index", "引用统计",
		"研究方向", "合作网络", "Semantic Scholar 作者", "Scholay",
		"author profile", "researcher profile", "scholarly author", "academic profile",
	}
	for _, aff := range meta.Affiliations {
		if aff != "" {
			parts = append(parts, aff)
		}
	}
	if meta.PaperCount > 0 {
		parts = append(parts, fmt.Sprintf("%d 篇论文", meta.PaperCount))
	}
	if meta.HIndex != nil && *meta.HIndex > 0 {
		parts = append(parts, fmt.Sprintf("h-index %d", *meta.HIndex))
	}
	return strings.Join(parts, ",")
}

// buildAuthorNoscriptCard 渲染作者的 noscript 卡片
func buildAuthorNoscriptCard(meta *seo.AuthorSSRMeta) string {
	baseStyle := ssrBaseStyle
	headingStyle := ssrHeadingStyle
	metaStyle := ssrMetaStyle
	statStyle := ssrTextStyle

	name := htmlEscape(meta.Name)

	var metaLines []string
	if len(meta.Affiliations) > 0 {
		metaLines = append(metaLines, "机构："+htmlEscape(strings.Join(meta.Affiliations, ", ")))
	}
	if meta.Homepage != "" {
		metaLines = append(metaLines, "主页："+htmlEscape(meta.Homepage))
	}
	var metaHTML string
	if len(metaLines) > 0 {
		metaHTML = fmt.Sprintf("<p %s>%s</p>", metaStyle, strings.Join(metaLines, " · "))
	}

	var statLines []string
	if meta.PaperCount > 0 {
		statLines = append(statLines, fmt.Sprintf("发表论文 %d 篇", meta.PaperCount))
	}
	if meta.CitationCount > 0 {
		statLines = append(statLines, fmt.Sprintf("总被引 %d 次", meta.CitationCount))
	}
	if meta.HIndex != nil && *meta.HIndex > 0 {
		statLines = append(statLines, fmt.Sprintf("h-index %d", *meta.HIndex))
	}
	var statHTML string
	if len(statLines) > 0 {
		statHTML = fmt.Sprintf("<p %s>%s</p>", statStyle, strings.Join(statLines, " · "))
	}

	// 代表作:实质内容 + 内链到论文页(给论文页导权重,让爬虫顺爬),把「只有人名」的薄页补厚。
	worksHTML := buildAuthorWorksHTML(meta.Works)

	return fmt.Sprintf(`<article %s>
<h1 %s>%s</h1>
%s
%s
%s
</article>`, baseStyle, headingStyle, name, metaHTML, statHTML, worksHTML)
}

// buildAuthorWorksHTML 渲染作者代表作列表(noscript);标题带内链到 canonical 论文页。
func buildAuthorWorksHTML(works []seo.AuthorWork) string {
	if len(works) == 0 {
		return ""
	}
	subHeadStyle := ssrSubHeadStyle
	listStyle := ssrListStyle
	var b strings.Builder
	fmt.Fprintf(&b, "<h2 %s>代表论文</h2><ul %s>", subHeadStyle, listStyle)
	for _, w := range works {
		if w.Title == "" {
			continue
		}
		label := htmlEscape(w.Title)
		var suffix []string
		if w.Year > 0 {
			suffix = append(suffix, fmt.Sprintf("%d", w.Year))
		}
		if w.Venue != "" {
			suffix = append(suffix, htmlEscape(w.Venue))
		}
		if w.CitationCount > 0 {
			suffix = append(suffix, fmt.Sprintf("被引 %d", w.CitationCount))
		}
		if len(suffix) > 0 {
			label += " (" + strings.Join(suffix, " · ") + ")"
		}
		// paperId 内部可能含 ':'(如 olx:W...),在 URL path 段里合法;htmlEscape 只处理属性注入字符。
		if w.Source != "" && w.PaperID != "" {
			href := "/paper/" + htmlEscape(w.Source) + "/" + htmlEscape(w.PaperID)
			fmt.Fprintf(&b, `<li><a href="%s">%s</a></li>`, href, label)
		} else {
			fmt.Fprintf(&b, "<li>%s</li>", label)
		}
	}
	b.WriteString("</ul>")
	return b.String()
}

// injectJournalSEOMeta 期刊详情页 SEO 注入 (与 paper / author 同构)
func injectJournalSEOMeta(html string, meta *seo.JournalSSRMeta, path string) string {
	if meta.CanonicalName == "" {
		return html
	}

	// 标题: 期刊名 + 出版商 + 品牌
	// 例如:"Nature (Springer Nature) - 期刊详情 · 影响因子 64.8 | Scholay 学术搜索"
	publisherSeg := ""
	if meta.Publisher != "" {
		publisherSeg = " (" + meta.Publisher + ")"
	}
	suffix := ""
	if meta.JCRImpactFactor > 0 {
		suffix = fmt.Sprintf(" · IF %.1f", meta.JCRImpactFactor)
	} else if meta.JCRQuartile != "" {
		suffix = " · " + meta.JCRQuartile
	}
	seoTitle := fmt.Sprintf("%s%s - 期刊详情%s | Scholay 学术搜索",
		truncate(meta.CanonicalName, 100), publisherSeg, suffix)

	// 描述: 出版商 + ISSN + 影响因子 + h-index + 国家
	var parts []string
	if meta.Publisher != "" {
		parts = append(parts, "出版商: "+meta.Publisher)
	}
	if len(meta.ISSNs) > 0 {
		parts = append(parts, "ISSN: "+strings.Join(meta.ISSNs, ", "))
	}
	if meta.JCRImpactFactor > 0 {
		parts = append(parts, fmt.Sprintf("影响因子 %.1f", meta.JCRImpactFactor))
	}
	if meta.JCRQuartile != "" {
		parts = append(parts, "JCR "+meta.JCRQuartile)
	}
	if meta.OpenAlexHIndex != nil && *meta.OpenAlexHIndex > 0 {
		parts = append(parts, fmt.Sprintf("h-index %d", *meta.OpenAlexHIndex))
	}
	if meta.Country != "" {
		parts = append(parts, meta.Country)
	}
	desc := ""
	if len(parts) > 0 {
		desc = fmt.Sprintf("%s 期刊详情 — %s。在 Scholay 查看期刊分区、影响因子、ISSN、近期发表与作者画像。",
			meta.CanonicalName, strings.Join(parts, " · "))
	} else {
		desc = fmt.Sprintf("%s 期刊详情与近期发表 — Scholay 整合 JCR、SCImago、CCF、OpenAlex 多源期刊数据,提供分区、影响因子、ISSN、出版商等元数据。", meta.CanonicalName)
	}
	desc = truncate(desc, 300)

	titleRe := ssrTitleRe
	html = titleRe.ReplaceAllString(html, "<title>"+htmlEscape(seoTitle)+"</title>")

	descRe := ssrDescRe
	if descRe.MatchString(html) {
		html = descRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}

	keywords := buildJournalKeywords(meta)
	keywordsRe := ssrKeywordsRe
	if keywordsRe.MatchString(html) {
		html = keywordsRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="keywords" content="%s">`, htmlEscape(keywords)))
	}

	// canonical 永远指向当前 path —— canonicalRedirectFor 已经把非 canonical 的路径 301 走了
	canonical := fmt.Sprintf("%s%s", appconfig.CanonicalBaseURL(), path)
	canonRe := ssrCanonRe
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if canonRe.MatchString(html) {
		html = canonRe.ReplaceAllString(html, canonTag)
	} else {
		html = strings.Replace(html, "</head>", canonTag+"\n</head>", 1)
	}

	if jsonLD := buildJournalJSONLD(meta, canonical); jsonLD != "" {
		html = strings.Replace(html, "</head>", jsonLD+"\n</head>", 1)
	}

	html = injectOG(html, seoTitle, canonical, desc, "website")
	html = insertNoscriptBlock(html, buildJournalNoscriptCard(meta))

	return html
}

// buildJournalKeywords 期刊页 keywords meta
func buildJournalKeywords(meta *seo.JournalSSRMeta) string {
	parts := []string{
		meta.CanonicalName,
		"期刊详情", "期刊分区", "影响因子", "JCR", "SCImago", "CCF", "OpenAlex",
		"ISSN 查询", "期刊出版商", "学术期刊", "Scholay",
		"journal", "academic journal", "impact factor", "journal quartile",
	}
	if meta.Publisher != "" {
		parts = append(parts, meta.Publisher)
	}
	for _, issn := range meta.ISSNs {
		if issn != "" {
			parts = append(parts, "ISSN "+issn)
		}
	}
	if meta.JCRQuartile != "" {
		parts = append(parts, meta.JCRQuartile)
	}
	if meta.JCRImpactFactor > 0 {
		parts = append(parts, fmt.Sprintf("IF %.1f", meta.JCRImpactFactor))
	}
	if meta.Country != "" {
		parts = append(parts, meta.Country)
	}
	return strings.Join(parts, ",")
}

// buildJournalNoscriptCard 渲染期刊的 noscript 卡片(供爬虫)
func buildJournalNoscriptCard(meta *seo.JournalSSRMeta) string {
	baseStyle := ssrBaseStyle
	headingStyle := ssrHeadingStyle
	metaStyle := ssrMetaStyle
	statStyle := ssrTextStyle

	name := htmlEscape(meta.CanonicalName)

	var metaLines []string
	if meta.Publisher != "" {
		metaLines = append(metaLines, "出版商："+htmlEscape(meta.Publisher))
	}
	if len(meta.ISSNs) > 0 {
		metaLines = append(metaLines, "ISSN："+htmlEscape(strings.Join(meta.ISSNs, ", ")))
	}
	if meta.Country != "" {
		metaLines = append(metaLines, "国家/地区："+htmlEscape(meta.Country))
	}
	if meta.Type != "" {
		metaLines = append(metaLines, "类型："+htmlEscape(meta.Type))
	}
	if meta.IsOA {
		metaLines = append(metaLines, "OA 开放获取")
	}
	var metaHTML string
	if len(metaLines) > 0 {
		metaHTML = fmt.Sprintf("<p %s>%s</p>", metaStyle, strings.Join(metaLines, " · "))
	}

	var statLines []string
	if meta.JCRImpactFactor > 0 {
		statLines = append(statLines, fmt.Sprintf("影响因子 %.3f", meta.JCRImpactFactor))
	}
	if meta.JCRQuartile != "" {
		statLines = append(statLines, "JCR "+htmlEscape(meta.JCRQuartile))
	}
	if meta.OpenAlexHIndex != nil && *meta.OpenAlexHIndex > 0 {
		// 中性指标名:此处是 noscript **正文**(无 JS 用户与 AI 爬虫直接可见),
		// 不带上游数据源名(与 1028 行 desc 分支同口径)。
		statLines = append(statLines, fmt.Sprintf("h-index %d", *meta.OpenAlexHIndex))
	}
	var statHTML string
	if len(statLines) > 0 {
		statHTML = fmt.Sprintf("<p %s>%s</p>", statStyle, strings.Join(statLines, " · "))
	}

	return fmt.Sprintf(`<article %s>
<h1 %s>%s</h1>
%s
%s
</article>`, baseStyle, headingStyle, name, metaHTML, statHTML)
}

// injectToolSEOMeta 功能广场工具详情页 SEO 注入(与 paper/author/journal 同构)。
func injectToolSEOMeta(html string, meta *seo.ToolSSRMeta, path string) string {
	if meta.Name == "" {
		return html
	}
	enSeg := ""
	if meta.NameEn != "" && meta.NameEn != meta.Name {
		enSeg = " (" + meta.NameEn + ")"
	}
	catSeg := ""
	if meta.CategoryLabel != "" {
		catSeg = " · " + meta.CategoryLabel
	}
	seoTitle := fmt.Sprintf("%s%s - 功能广场%s | Scholay学术", truncate(meta.Name, 80), enSeg, catSeg)

	desc := meta.Tagline
	if desc == "" {
		desc = meta.Description
	}
	if desc == "" {
		desc = fmt.Sprintf("%s —— 科研工具详情、获取方式与使用说明,在 Scholay 功能广场收录。", meta.Name)
	} else {
		desc = fmt.Sprintf("%s —— %s。Scholay 功能广场收录的科研工具,含分类、获取方式与使用说明。", meta.Name, desc)
	}
	desc = truncate(desc, 300)

	titleRe := ssrTitleRe
	html = titleRe.ReplaceAllString(html, "<title>"+htmlEscape(seoTitle)+"</title>")

	descRe := ssrDescRe
	if descRe.MatchString(html) {
		html = descRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}

	keywords := buildToolKeywords(meta)
	keywordsRe := ssrKeywordsRe
	if keywordsRe.MatchString(html) {
		html = keywordsRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="keywords" content="%s">`, htmlEscape(keywords)))
	}

	canonical := fmt.Sprintf("%s%s", appconfig.CanonicalBaseURL(), path)
	canonRe := ssrCanonRe
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if canonRe.MatchString(html) {
		html = canonRe.ReplaceAllString(html, canonTag)
	} else {
		html = strings.Replace(html, "</head>", canonTag+"\n</head>", 1)
	}

	if jsonLD := buildToolJSONLD(meta, canonical); jsonLD != "" {
		html = strings.Replace(html, "</head>", jsonLD+"\n</head>", 1)
	}

	html = injectOG(html, seoTitle, canonical, desc, "website")
	html = insertNoscriptBlock(html, buildToolNoscriptCard(meta))
	return html
}

// buildToolKeywords 工具页 keywords meta。
func buildToolKeywords(meta *seo.ToolSSRMeta) string {
	parts := []string{meta.Name}
	if meta.NameEn != "" && meta.NameEn != meta.Name {
		parts = append(parts, meta.NameEn)
	}
	parts = append(parts, "科研工具", "学术软件", "功能广场", "科研软件下载", "Scholay")
	if meta.CategoryLabel != "" {
		parts = append(parts, meta.CategoryLabel)
	}
	parts = append(parts, meta.Tags...)
	return strings.Join(parts, ",")
}

// buildToolJSONLD —— SoftwareApplication(名称/分类/描述/价格/图标)。
func buildToolJSONLD(meta *seo.ToolSSRMeta, canonical string) string {
	if meta.Name == "" {
		return ""
	}
	obj := map[string]any{
		"@context":            "https://schema.org",
		"@type":               "SoftwareApplication",
		"name":                meta.Name,
		"url":                 canonical,
		"applicationCategory": "ResearchApplication",
		"publisher":           map[string]any{"@type": "Organization", "name": "Scholay学术", "url": appconfig.CanonicalBaseURL()},
	}
	if d := meta.Tagline; d != "" {
		obj["description"] = truncate(d, 200)
	} else if meta.Description != "" {
		obj["description"] = truncate(meta.Description, 200)
	}
	if meta.Logo != "" {
		img := meta.Logo
		if strings.HasPrefix(img, "/") {
			img = appconfig.CanonicalBaseURL() + img
		}
		obj["image"] = img
	}
	if meta.PriceType == "free" {
		obj["offers"] = map[string]any{"@type": "Offer", "price": "0", "priceCurrency": "USD"}
	}
	return jsonLDScript(obj)
}

// buildToolNoscriptCard 渲染工具的 noscript 卡片(供爬虫)。
func buildToolNoscriptCard(meta *seo.ToolSSRMeta) string {
	baseStyle := ssrBaseStyle
	headingStyle := ssrHeadingStyle
	metaStyle := ssrMetaStyle
	textStyle := ssrTextStyle

	var metaLines []string
	if meta.CategoryLabel != "" {
		metaLines = append(metaLines, "分类："+htmlEscape(meta.CategoryLabel))
	}
	if len(meta.Tags) > 0 {
		metaLines = append(metaLines, "标签："+htmlEscape(strings.Join(meta.Tags, " / ")))
	}
	var metaHTML string
	if len(metaLines) > 0 {
		metaHTML = fmt.Sprintf("<p %s>%s</p>", metaStyle, strings.Join(metaLines, " · "))
	}
	var bodyHTML string
	if meta.Tagline != "" {
		bodyHTML += fmt.Sprintf("<p %s>%s</p>", textStyle, htmlEscape(meta.Tagline))
	}
	if meta.Description != "" {
		bodyHTML += fmt.Sprintf("<p %s>%s</p>", textStyle, htmlEscape(truncate(meta.Description, 1500)))
	}
	return fmt.Sprintf(`<article %s>
<h1 %s>%s</h1>
%s
%s
</article>`, baseStyle, headingStyle, htmlEscape(meta.Name), metaHTML, bodyHTML)
}

// truncate 按 **rune(字符)** 截断而非字节 —— 中文 1 字符 3 字节,按字节 s[:n] 几乎必然
// 切在 rune 中间,产生半个字符的坏字节,喂进 <title>/meta/JSON-LD/noscript 会在 SERP 显示乱码
// (mojibake)、压低 CTR。本平台面向中文市场,必须 rune 感知。n 是字符预算。
func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "..."
}

// htmlEscape 轻量 HTML 转义（足以覆盖 title/description 中的常见特殊字符）
func htmlEscape(s string) string {
	r := strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&#39;",
	)
	return r.Replace(s)
}

// ssrHTTPClient is a shared HTTP client for SSR fetches with sensible limits
var ssrHTTPClient = &http.Client{
	Timeout: 5 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        20,
		MaxIdleConnsPerHost: 20,
		IdleConnTimeout:     60 * time.Second,
	},
}

// getPageHTML fetches and caches the HTML for a specific route from the frontend container.
// Each route (e.g. /about, /privacy) may have its own pre-rendered HTML with unique
// meta tags (title, description, canonical) and noscript content for SEO.
func (h *Handler) getPageHTML(requestPath string) (string, error) {
	if requestPath == "" {
		requestPath = "/"
	}

	// 缓存 key 归一:前端 SPA 对所有路由返回**同一份** index.html 壳(try_files 回落)。
	// 旧实现按完整路径 key → 深度爬论文/作者 sitemap(10^5~10^6 唯一 slug)时,每 URL 一个 key,
	// 512 LRU 在复用前就被驱逐 → 命中率≈0,每个爬虫实体请求都多打一次 frontend 取同一份壳。
	// 实体路径归并到 /paper/ /author/ /journal/ /tools/ 一份缓存即可(逐页 SEO 注入在缓存读取之后)。
	cacheKey := normalizeSSRCacheKey(requestPath)
	if cached, ok := h.ssrCache.get(cacheKey); ok {
		return cached, nil
	}

	fetchURL := h.frontendURL + requestPath
	resp, err := ssrHTTPClient.Get(fetchURL)
	if err != nil {
		return "", fmt.Errorf("failed to fetch HTML for %s from frontend: %w", requestPath, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		io.Copy(io.Discard, resp.Body)
		return "", fmt.Errorf("frontend returned status %d for %s", resp.StatusCode, requestPath)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	if err != nil {
		return "", fmt.Errorf("failed to read HTML body for %s: %w", requestPath, err)
	}

	html := string(body)
	h.ssrCache.set(cacheKey, html)

	slog.Info("HTML cached successfully", "path", requestPath, "cache_key", cacheKey, "bytes", len(body))
	return html, nil
}

// normalizeSSRCacheKey 把实体详情路径归并到类目前缀(/paper/* → "/paper/" 等),
// 让所有同类实体共用一份壳缓存,深度爬时命中率≈100%。其余路径按自身 key。
func normalizeSSRCacheKey(path string) string {
	for _, prefix := range []string{"/paper/", "/author/", "/journal/", "/tools/", "/news/"} {
		if strings.HasPrefix(path, prefix) {
			return prefix
		}
	}
	return path
}

type deferredSnippetPayload struct {
	Head      []string `json:"head,omitempty"`
	BodyStart []string `json:"body_start,omitempty"`
	BodyEnd   []string `json:"body_end,omitempty"`
}

// splitCodeSnippets keeps the service-provided priority order intact while
// separating parse-time snippets from work that administrators explicitly
// opted into running after load/idle.
func splitCodeSnippets(snippets []model.CodeSnippetResponse) (immediate, deferred []model.CodeSnippetResponse) {
	for _, snippet := range snippets {
		if snippet.DeferUntilIdle {
			deferred = append(deferred, snippet)
			continue
		}
		immediate = append(immediate, snippet)
	}
	return immediate, deferred
}

func appendRawCodeSnippets(builder *strings.Builder, snippets []model.CodeSnippetResponse) {
	for _, snippet := range snippets {
		builder.WriteString(snippet.CodeContent)
		builder.WriteString("\n")
	}
}

func snippetCodeContents(snippets []model.CodeSnippetResponse) []string {
	contents := make([]string, 0, len(snippets))
	for _, snippet := range snippets {
		contents = append(contents, snippet.CodeContent)
	}
	return contents
}

// buildDeferredCodeSnippetsRuntime serializes administrator-authored HTML as
// JSON before embedding it in an inline script. encoding/json's default HTML
// escaping turns '<', '>' and '&' into unicode escapes, so a snippet containing
// a closing script tag cannot terminate this wrapper early.
//
// Scripts parsed through template.innerHTML are inert. Recreating each script
// node makes it executable when the fragment is finally inserted, matching the
// runtime injector in frontend-user/index.html.
func buildDeferredCodeSnippetsRuntime(payload deferredSnippetPayload) string {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		// The payload only contains strings, so json.Marshal cannot fail in
		// practice. Keep the SSR response usable if that invariant ever changes.
		slog.Error("failed to marshal deferred SSR code snippets", "err", err)
		return ""
	}

	return `<script data-ssr-deferred-snippets>(function(group){
function build(list){var frag=document.createDocumentFragment();for(var i=0;i<list.length;i++){var tpl=document.createElement('template');tpl.innerHTML=list[i];var scripts=tpl.content.querySelectorAll('script');for(var j=0;j<scripts.length;j++){var old=scripts[j];var script=document.createElement('script');for(var k=0;k<old.attributes.length;k++){script.setAttribute(old.attributes[k].name,old.attributes[k].value);}script.text=old.textContent||'';old.parentNode.replaceChild(script,old);}frag.appendChild(tpl.content);}return frag;}
function inject(){document.head.appendChild(build(group.head||[]));var injectBody=function(){document.body.insertBefore(build(group.body_start||[]),document.body.firstChild);document.body.appendChild(build(group.body_end||[]));};if(document.body){injectBody();}else{document.addEventListener('DOMContentLoaded',injectBody,{once:true});}}
function schedule(){if('requestIdleCallback' in window){window.requestIdleCallback(inject,{timeout:2000});}else{window.setTimeout(inject,250);}}
if(document.readyState==='complete'){schedule();}else{window.addEventListener('load',schedule,{once:true});}
})(` + string(payloadJSON) + `);</script>`
}

// injectCodeSnippets injects code snippets into the HTML at appropriate positions.
func (h *Handler) injectCodeSnippets(html string, snippets *model.CodeSnippetsGroupedResponse) string {
	if snippets == nil {
		return html
	}

	result := html
	immediateHead, deferredHead := splitCodeSnippets(snippets.Head)
	immediateBodyStart, deferredBodyStart := splitCodeSnippets(snippets.BodyStart)
	immediateBodyEnd, deferredBodyEnd := splitCodeSnippets(snippets.BodyEnd)

	// The marker is emitted for every non-nil response, including an empty one,
	// so the frontend does not issue a second injection after SSR has made the
	// authoritative decision for this response.
	var headContent strings.Builder
	headContent.WriteString("\n<!-- SSR Code Snippets: head -->\n")
	headContent.WriteString("<script>window.__SSR_SNIPPETS_INJECTED__=true;</script>\n")
	appendRawCodeSnippets(&headContent, immediateHead)
	if len(deferredHead)+len(deferredBodyStart)+len(deferredBodyEnd) > 0 {
		headContent.WriteString("<!-- SSR Deferred Code Snippets: load + idle -->\n")
		headContent.WriteString(buildDeferredCodeSnippetsRuntime(deferredSnippetPayload{
			Head:      snippetCodeContents(deferredHead),
			BodyStart: snippetCodeContents(deferredBodyStart),
			BodyEnd:   snippetCodeContents(deferredBodyEnd),
		}))
		headContent.WriteString("\n<!-- End SSR Deferred Code Snippets -->\n")
	}
	headContent.WriteString("<!-- End SSR Code Snippets: head -->\n")
	result = strings.Replace(result, "</head>", headContent.String()+"</head>", 1)

	// Build parser-time body_start snippets. FindStringIndex + direct slicing is
	// intentional: ReplaceAllString treats '$' in administrator code as capture
	// expansion and would silently corrupt otherwise valid JavaScript.
	if len(immediateBodyStart) > 0 {
		var bodyStartContent strings.Builder
		bodyStartContent.WriteString("\n<!-- SSR Code Snippets: body_start -->\n")
		appendRawCodeSnippets(&bodyStartContent, immediateBodyStart)
		bodyStartContent.WriteString("<!-- End SSR Code Snippets: body_start -->\n")

		if bodyTagLocation := ssrBodyTagRe.FindStringIndex(result); bodyTagLocation != nil {
			result = result[:bodyTagLocation[1]] + bodyStartContent.String() + result[bodyTagLocation[1]:]
		}
	}

	// Build parser-time body_end snippets content.
	if len(immediateBodyEnd) > 0 {
		var bodyEndContent strings.Builder
		bodyEndContent.WriteString("\n<!-- SSR Code Snippets: body_end -->\n")
		appendRawCodeSnippets(&bodyEndContent, immediateBodyEnd)
		bodyEndContent.WriteString("<!-- End SSR Code Snippets: body_end -->\n")

		result = strings.Replace(result, "</body>", bodyEndContent.String()+"</body>", 1)
	}

	return result
}

// injectRouteNoscript replaces or appends route-specific noscript content
// so each page has unique text content visible to crawlers that don't execute JS.
// This is critical for Google AdSense "low value content" compliance.
func injectRouteNoscript(html string, path string) string {
	// 统一走 insertNoscriptBlock:包进 <noscript> 插在 </body> 前(当前 Vite 壳无 noscript 锚点,
	// 旧实现找不到锚点会静默丢弃这段静态页正文)。
	return insertNoscriptBlock(html, getRouteNoscriptContent(path))
}

// staticPageSEO 给已纳入 SSR 白名单的静态/入口页的专属 title + meta description。
// 前端 SPA 对所有路由回落同一份 index.html(首页通用 title),不注入则这些页全用首页标题,
// 削弱 SERP 主题相关性。仅覆盖 map 内路径,实体页等不在内即 no-op。
var staticPageSEO = map[string]struct{ title, desc string }{
	// 首页:壳里已有 title/desc,但**无自指 canonical** → 变体(尾斜杠/参数/大小写)未归一。
	// 纳入白名单补 canonical(=https://www.scholay.com/),title 与线上一致避免回归。
	"/": {
		"Scholay学术 - AI 驱动的学术搜索与研究平台 | 论文搜索 · AI 审稿 · 文献管理",
		"Scholay 学术是 AI 驱动的一站式科研平台:覆盖 2 亿+ 论文的智能检索、AI 论文分析与审稿、期刊查询、文献集管理与 LaTeX 在线写作。",
	},
	// 落地 / 枢纽页:各自有独特 noscript 正文,但 title/desc/OG 仍是首页值、无 canonical(M4)。
	"/about": {
		"关于 Scholay — AI 驱动的学术搜索与科研工具平台 | Scholay 学术",
		"了解 Scholay 学术:用 AI 让论文检索、分析、审稿与写作更高效的一站式科研平台,以及我们的使命与团队。",
	},
	"/features": {
		"全部功能 — 智能搜索 · AI 审稿 · 智能写作 · 文献集 | Scholay 学术",
		"Scholay 学术全部功能一览:智能论文搜索、AI 论文分析、AI 智能审稿、文献集管理、期刊查询与 LaTeX 在线写作。",
	},
	"/tools": {
		"学术工具广场 — 科研软件与在线工具大全 | Scholay 学术",
		"Scholay 学术工具广场:汇集编程语言、数据分析、文献管理、写作排版等科研常用软件与在线工具,按分类检索与对比。",
	},
	"/pricing": {
		"会员与定价 — 免费额度 · Pro · Max | Scholay 学术",
		"Scholay 学术会员方案与定价:免费额度、Pro 与 Max 各档 AI 用量与功能权益,按需选择,支持经费钱包。",
	},
	"/blog": {
		"学术博客 — 科研方法 · AI 写作 · 检索技巧 | Scholay 学术",
		"Scholay 学术博客:选题开题、文献检索、AI 辅助写作与学术伦理等科研方法长文,持续更新。",
	},
	"/resources": {
		"学术资源中心 — 科研指南与工具合集 | Scholay 学术",
		"Scholay 学术资源中心:学术写作、会议投稿、研究方法与 AI 科研工具等系统性指南与资源合集。",
	},
	"/search": {
		"学术文献搜索 — 2 亿+ 论文检索 | Scholay 学术",
		"Scholay 学术搜索覆盖 2 亿+ 学术论文,支持直接检索与 AI 智能检索、布尔运算符与精确短语,结果可按相关度、被引次数与发表时间排序。",
	},
	"/journals/search": {
		"期刊检索 — 影响因子 / 分区 / 收录查询 | Scholay 学术",
		"按刊名、ISSN、学科与影响因子分区查找学术期刊,查看 JCR 影响因子、CiteScore、中科院分区与开放获取(OA)信息,辅助选刊投稿。",
	},
	"/privacy": {
		"隐私政策 | Scholay 学术",
		"Scholay(成都恩特罐罐文化科技有限公司)隐私政策:个人信息的收集、使用、存储、保护,以及用户的数据访问、更正与删除权利。",
	},
	"/terms": {
		"服务条款 | Scholay 学术",
		"Scholay 学术平台服务条款:用户使用检索、AI 分析、智能写作与审稿服务的权利义务、账号订阅规则与知识产权规范。",
	},
	"/disclaimer": {
		"免责声明 | Scholay 学术",
		"Scholay 免责声明:检索结果与 AI 生成的论文分析、审稿与写作建议仅供学术参考,论文版权归原作者及出版方所有。",
	},
	"/help": {
		"帮助中心 · 学术问答 — 科研常见问题深度解答 | Scholay 学术",
		"Scholay 帮助中心即学术问答:开题、研究方法、数据集、AI 辅助写作、模拟审稿、论文查重、AI 写作幻觉、文献核对等科研真实问题的深度长答案。",
	},
	"/qa": {
		"学术问答 — 科研常见问题深度解答 | Scholay 学术",
		"Scholay 学术问答:开题、研究方法、数据集、AI 辅助写作、模拟审稿、论文查重、AI 写作幻觉、文献核对等科研真实问题的深度长答案。",
	},
}

// injectArticleSEOMeta 为博客/资源文章页注入专属 title/description/自指 canonical
// + BlogPosting/Article JSON-LD + OG。正文 noscript 已在别处注入,这里只补 head 元数据。
func injectArticleSEOMeta(html, kind, slug, path string) string {
	a, ok := content.Get(kind, slug)
	if !ok {
		return html
	}
	label := "博客"
	switch kind {
	case "resources":
		label = "学术资源"
	case "qa":
		label = "学术问答"
	}
	seoTitle := fmt.Sprintf("%s | Scholay %s", truncate(a.Title, 100), label)
	desc := truncate(a.Excerpt, 300)

	if ssrTitleRe.MatchString(html) {
		html = ssrTitleRe.ReplaceAllString(html, "<title>"+htmlEscape(seoTitle)+"</title>")
	}
	if ssrDescRe.MatchString(html) {
		html = ssrDescRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}
	canonical := appconfig.CanonicalBaseURL() + path
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if ssrCanonRe.MatchString(html) {
		html = ssrCanonRe.ReplaceAllString(html, canonTag)
	} else {
		html = strings.Replace(html, "</head>", canonTag+"\n</head>", 1)
	}
	if jsonLD := a.BuildJSONLD(canonical, appconfig.CanonicalBaseURL()); jsonLD != "" {
		html = strings.Replace(html, "</head>", jsonLD+"\n</head>", 1)
	}
	// 含 FAQ 的文章额外注入 FAQPage JSON-LD(AI/富结果最易抽取)
	if faqLD := a.BuildFAQJSONLD(); faqLD != "" {
		html = strings.Replace(html, "</head>", faqLD+"\n</head>", 1)
	}
	html = injectOG(html, seoTitle, canonical, desc, "article")
	return html
}

// injectNewsSSR 情报 SSR 注入(方法,持有 newsSEOProvider):
//   - /news        列表页:专属 title/desc/canonical + noscript 链接列表(爬虫发现各详情)
//   - /news/{slug} 详情页:title/desc/自指 canonical + NewsArticle JSON-LD + OG + 全文 noscript
// 功能未开启 / 不存在时 provider 返回 nil → 回落默认壳(不注入)。
func (h *Handler) injectNewsSSR(html, path string) string {
	base := appconfig.CanonicalBaseURL()

	// 列表页
	if path == "/news" {
		seoTitle := "学术情报 - 顶刊速递 · 重大事件 · 国内政策 | Scholay 学术"
		desc := "Scholay 学术情报:实时汇集顶级期刊论文速递、学术界重大事件、国内科研政策等学术新闻,按热度与时间持续更新。"
		canonical := base + "/news"
		html = replaceSSRTitleDescCanon(html, seoTitle, desc, canonical)
		if metas, err := h.newsSEOProvider.RecentNewsForSEO(50); err == nil && len(metas) > 0 {
			html = insertNoscriptBlock(html, buildNewsListNoscript(metas))
		}
		html = injectOG(html, seoTitle, canonical, desc, "website")
		return html
	}

	// 详情页:单段 slug
	slug := strings.TrimPrefix(path, "/news/")
	if slug == "" || strings.Contains(slug, "/") {
		return html
	}
	meta, err := h.newsSEOProvider.ResolveNewsBySlug(slug)
	if err != nil {
		return html // DB 错误,保守不动(不误伤)
	}
	if meta == nil || meta.Title == "" {
		return injectNoindex(html) // 情报不存在 → 软 404 打 noindex
	}
	seoTitle := truncate(meta.Title, 100) + " | Scholay 学术情报"
	desc := truncate(meta.Summary, 300)
	canonical := base + path
	html = replaceSSRTitleDescCanon(html, seoTitle, desc, canonical)
	if jsonLD := buildNewsJSONLD(meta, canonical); jsonLD != "" {
		html = strings.Replace(html, "</head>", jsonLD+"\n</head>", 1)
	}
	html = injectOG(html, seoTitle, canonical, desc, "article")
	// M6:情报是新闻,分发信号补齐 —— og:image/twitter:image 用文章真封面(否则塌成通用 logo),
	// 加 article:published_time / modified_time 供 Discover / 社媒卡片。封面为空则保留壳默认图。
	if meta.CoverImage != "" {
		imgTag := fmt.Sprintf(`<meta property="og:image" content="%s" />`, htmlEscape(meta.CoverImage))
		html = upsertHeadTag(html, ssrOgImageRe, imgTag)
		twImgTag := fmt.Sprintf(`<meta name="twitter:image" content="%s" />`, htmlEscape(meta.CoverImage))
		html = upsertHeadTag(html, ssrTwImageRe, twImgTag)
	}
	if meta.PublishedAt != "" {
		tag := fmt.Sprintf(`<meta property="article:published_time" content="%s" />`, htmlEscape(meta.PublishedAt))
		html = strings.Replace(html, "</head>", tag+"\n</head>", 1)
	}
	if meta.UpdatedAt != "" {
		tag := fmt.Sprintf(`<meta property="article:modified_time" content="%s" />`, htmlEscape(meta.UpdatedAt))
		html = strings.Replace(html, "</head>", tag+"\n</head>", 1)
	}
	html = insertNoscriptBlock(html, buildNewsNoscript(meta))
	return html
}

// replaceSSRTitleDescCanon 统一替换 <title>/<meta description>/<link canonical>(缺失则按既有约定处理)。
func replaceSSRTitleDescCanon(html, title, desc, canonical string) string {
	if ssrTitleRe.MatchString(html) {
		html = ssrTitleRe.ReplaceAllString(html, "<title>"+htmlEscape(title)+"</title>")
	}
	if ssrDescRe.MatchString(html) {
		html = ssrDescRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if ssrCanonRe.MatchString(html) {
		html = ssrCanonRe.ReplaceAllString(html, canonTag)
	} else {
		html = strings.Replace(html, "</head>", canonTag+"\n</head>", 1)
	}
	return html
}

// buildNewsJSONLD —— NewsArticle(标题/导语/发布与更新时间/版块/封面/来源引用)。
func buildNewsJSONLD(meta *seo.NewsSSRMeta, canonical string) string {
	if meta.Title == "" {
		return ""
	}
	base := appconfig.CanonicalBaseURL()
	publisher := map[string]any{"@type": "Organization", "name": "Scholay学术", "url": base}
	obj := map[string]any{
		"@context":         "https://schema.org",
		"@type":            "NewsArticle",
		"headline":         truncate(meta.Title, 110),
		"name":             meta.Title,
		"url":              canonical,
		"mainEntityOfPage": canonical,
		"inLanguage":       "zh-CN",
		"publisher":        publisher,
		"author":           publisher,
	}
	if meta.Summary != "" {
		obj["description"] = truncate(meta.Summary, 300)
	}
	if meta.PublishedAt != "" {
		obj["datePublished"] = meta.PublishedAt
	}
	if meta.UpdatedAt != "" {
		obj["dateModified"] = meta.UpdatedAt
	}
	if meta.SectionLabel != "" {
		obj["articleSection"] = meta.SectionLabel
	}
	if meta.CoverImage != "" {
		obj["image"] = meta.CoverImage
	}
	// GEO 强信号:来源作为 citation(可信 attribution)。
	if len(meta.Sources) > 0 {
		cites := make([]map[string]string, 0, len(meta.Sources))
		for _, s := range meta.Sources {
			if s.URL != "" {
				cites = append(cites, map[string]string{"@type": "CreativeWork", "url": s.URL, "name": s.Label})
			}
		}
		if len(cites) > 0 {
			obj["citation"] = cites
		}
	}
	return jsonLDScript(obj)
}

// buildNewsNoscript 渲染情报详情全文进 noscript(answer-first:标题→时间→导语→正文→来源→可信度)。
// meta.BodyHTML 已 sanitize(news.sanitizeBodyHTML)。
func buildNewsNoscript(meta *seo.NewsSSRMeta) string {
	baseStyle := ssrBaseStyle
	var b strings.Builder
	b.WriteString(`<section ` + baseStyle + `>`)
	b.WriteString(`<h1>` + htmlEscape(meta.Title) + `</h1>`)
	var metaParts []string
	if meta.SectionLabel != "" {
		metaParts = append(metaParts, htmlEscape(meta.SectionLabel))
	}
	if meta.PublishedAt != "" {
		metaParts = append(metaParts, "发布 "+htmlEscape(meta.PublishedAt))
	}
	if meta.UpdatedAt != "" && meta.UpdatedAt != meta.PublishedAt {
		metaParts = append(metaParts, "更新 "+htmlEscape(meta.UpdatedAt))
	}
	if len(metaParts) > 0 {
		b.WriteString(`<p>` + strings.Join(metaParts, " · ") + `</p>`)
	}
	if meta.Summary != "" {
		b.WriteString(`<p><strong>` + htmlEscape(meta.Summary) + `</strong></p>`)
	}
	if meta.BodyHTML != "" {
		b.WriteString(meta.BodyHTML) // 已 sanitize
	}
	if len(meta.Sources) > 0 {
		b.WriteString(`<h2>信息来源</h2><ul>`)
		for _, s := range meta.Sources {
			if s.URL == "" {
				continue
			}
			label := s.Label
			if label == "" {
				label = s.URL
			}
			b.WriteString(`<li><a href="` + htmlEscape(s.URL) + `" rel="nofollow noopener">` + htmlEscape(label) + `</a></li>`)
		}
		b.WriteString(`</ul>`)
	}
	if meta.CredibilityNote != "" {
		b.WriteString(`<h2>可信度说明</h2><p>` + htmlEscape(meta.CredibilityNote) + `</p>`)
	}
	b.WriteString(`</section>`)
	return b.String()
}

// buildNewsListNoscript 渲染情报列表页的链接列表(让爬虫从 /news 发现各详情页)。
func buildNewsListNoscript(metas []*seo.NewsSSRMeta) string {
	baseStyle := ssrBaseStyle
	var b strings.Builder
	b.WriteString(`<section ` + baseStyle + `>`)
	b.WriteString(`<h1>学术情报</h1>`)
	b.WriteString(`<p>顶刊速递 · 重大事件 · 国内政策 —— 实时汇集学术界动态。</p><ul>`)
	for _, m := range metas {
		if m == nil || m.Slug == "" {
			continue
		}
		b.WriteString(`<li><a href="/news/` + htmlEscape(m.Slug) + `">` + htmlEscape(m.Title) + `</a></li>`)
	}
	b.WriteString(`</ul></section>`)
	return b.String()
}

// injectStaticPageSEOMeta 为静态/入口页注入专属 title/description/自指 canonical。
func injectStaticPageSEOMeta(html string, path string) string {
	meta, ok := staticPageSEO[path]
	if !ok {
		return html
	}
	if ssrTitleRe.MatchString(html) {
		html = ssrTitleRe.ReplaceAllString(html, "<title>"+htmlEscape(meta.title)+"</title>")
	}
	if ssrDescRe.MatchString(html) {
		html = ssrDescRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(meta.desc)))
	}
	// 自指 canonical(否则吃首页 canonical,被判重复页)。首页 path="/" → canonical 带尾斜杠。
	canonical := appconfig.CanonicalBaseURL() + path
	html = upsertHeadTag(html, ssrCanonRe, fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical)))
	// OG / Twitter 也改成本页值(否则落地页社媒卡片全是首页);枢纽/落地页非文章,og:type=website。
	html = injectOG(html, meta.title, canonical, meta.desc, "website")
	return html
}

// getRouteNoscriptContent returns route-specific HTML for noscript injection
func getRouteNoscriptContent(path string) string {
	baseStyle := ssrBaseStyle
	headingStyle := ssrHeadingTight
	textStyle := ssrTextStyle

	switch {
	case path == "/resources":
		return fmt.Sprintf(`<section %s>
<h2 %s>学术资源中心</h2>
<p %s>Scholay 学术资源中心提供原创学术指南，涵盖文献检索技巧、论文写作方法、引用格式规范、研究方法论和 AI 学术工具使用教程，助力科研工作者提升效率。</p>
%s
</section>`, baseStyle, headingStyle, textStyle, articleListNoscript("resources", "/resources/"))

	case strings.HasPrefix(path, "/resources/"):
		slug := strings.TrimPrefix(path, "/resources/")
		// content 包是正文单一真源:渲染完整正文给爬虫(GEO)。缺失才回退旧 teaser。
		if a, ok := content.Get("resources", slug); ok {
			return content.RenderNoscriptHTML(a, baseStyle, headingStyle, textStyle)
		}
		return getArticleNoscript(slug, baseStyle, headingStyle, textStyle)

	case strings.HasPrefix(path, "/blog/"):
		slug := strings.TrimPrefix(path, "/blog/")
		if a, ok := content.Get("blog", slug); ok {
			return content.RenderNoscriptHTML(a, baseStyle, headingStyle, textStyle)
		}
		return renderArticleNoscript(blogArticleMeta, slug, "/blog", "返回博客", baseStyle, headingStyle, textStyle)

	case strings.HasPrefix(path, "/qa/"):
		slug := strings.TrimPrefix(path, "/qa/")
		if a, ok := content.Get("qa", slug); ok {
			return content.RenderNoscriptHTML(a, baseStyle, headingStyle, textStyle)
		}
		return ""

	case path == "/help":
		// 帮助中心 = 学术问答(QA 列表)。爬虫读到的就是 QA 全文索引,
		// 详情链接指向 canonical /qa/{slug}(详情 URL 不变,SEO 不动)。
		return fmt.Sprintf(`<section %s>
<h2 %s>帮助中心 · 学术问答 — 科研常见问题深度解答</h2>
<p %s>Scholay 帮助中心即学术问答,收录科研全流程的真实问题与深度解答,涵盖学术开题、研究方法、数据集、AI 辅助写作、模拟审稿、论文查重、AI 写作幻觉与文献核对等主题,每个问题都给出一篇完整回答。</p>
%s
</section>`, baseStyle, headingStyle, textStyle, articleListNoscript("qa", "/qa/"))

	case path == "/search":
		return fmt.Sprintf(`<section %s>
<h2 %s>学术搜索</h2>
<p %s>Scholay 学术搜索覆盖超过 2 亿篇学术论文，支持直接检索和 AI 智能检索两种模式。使用布尔运算符（AND、OR、NOT）和精确短语检索提升搜索精度。结果可按相关度、被引次数和发表时间排序，并支持按年份、领域、论文类型等条件筛选。</p>
<p %s>热门研究领域包括：深度学习、量子计算、CRISPR 基因编辑、气候变化、大语言模型、新能源技术、计算机视觉、自然语言处理、生物信息学等。</p>
</section>`, baseStyle, headingStyle, textStyle, textStyle)

	case path == "/journals/search":
		return fmt.Sprintf(`<section %s>
<h2 %s>期刊检索 — 影响因子 / 分区 / 收录查询</h2>
<p %s>Scholay 期刊检索帮助科研工作者按刊名、ISSN、学科、出版商及影响因子分区查找学术期刊，查看每本期刊的影响因子（JCR Impact Factor）、CiteScore、中科院分区与 JCR 分区、是否开放获取（OA）及收录范围，辅助选刊投稿与文献质量评估。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/claw":
		return fmt.Sprintf(`<section %s>
<h2 %s>智能助手 — AI 学术对话</h2>
<p %s>Scholay 智能助手是面向科研的 AI 学术对话工具，可帮您解答学术问题、讨论研究方向、分析论文观点、生成文献综述。支持多种大语言模型，对话支持上下文连续交流，可直接粘贴论文片段让 AI 解读，或请 AI 帮助改善论文表达、检索并引用相关文献。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/prism":
		return fmt.Sprintf(`<section %s>
<h2 %s>智能写作 — ScholayPrism AI-native LaTeX 编辑器</h2>
<p %s>ScholayPrism 是原生支持 LaTeX 的在线学术写作工作空间，AI 内联协作、实时编译预览、内置多种期刊模板。AI 可按指令直接修改正文并以 diff 形式呈现、自动 \cite 引用检索到的文献、按学科规范排版，是论文写作与投稿前排版的一体化工具。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/about":
		return fmt.Sprintf(`<section %s>
<h2 %s>关于 Scholay 学术</h2>
<p %s>Scholay（学术）是一个 AI 驱动的学术搜索与科研协作平台，整合超过 2 亿篇学术论文，提供学术检索、AI 论文分析、智能学术对话、AI 智能审稿与 LaTeX 智能写作等一站式科研工具，致力于用人工智能提升科研工作者的文献检索与论文写作效率。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/features" || strings.HasPrefix(path, "/features/"):
		return fmt.Sprintf(`<section %s>
<h2 %s>Scholay 核心功能</h2>
<p %s>Scholay 提供覆盖科研全流程的 AI 学术工具：</p>
<ul style="color: #505059; line-height: 2; padding-left: 24px;">
<li><a href="/features/search" style="color: #882828;">学术检索</a> — 直接检索 + AI 智能检索,覆盖 2 亿+ 论文</li>
<li><a href="/features/library" style="color: #882828;">个人文献集</a> — 收藏、整理、管理论文与 PDF</li>
<li><a href="/features/claw" style="color: #882828;">智能助手</a> — AI 学术对话与文献辅助</li>
<li><a href="/features/prism" style="color: #882828;">智能写作 Prism</a> — AI-native LaTeX 编辑器</li>
<li><a href="/features/peer-review" style="color: #882828;">智能审稿</a> — AI 多维度审稿意见</li>
<li><a href="/features/submit" style="color: #882828;">投稿辅助</a> — 期刊推荐与投稿信起草</li>
</ul>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/blog":
		return fmt.Sprintf(`<section %s>
<h2 %s>Scholay 学术博客</h2>
<p %s>Scholay 学术博客分享文献检索技巧、学术工具评测、论文写作与同行评审经验、AI 科研应用等原创长文,帮助研究者提升科研效率。精选文章:</p>
%s
</section>`, baseStyle, headingStyle, textStyle, articleListNoscript("blog", "/blog/"))

	case path == "/qa":
		return fmt.Sprintf(`<section %s>
<h2 %s>学术问答 — 科研常见问题深度解答</h2>
<p %s>Scholay 学术问答收录科研全流程的真实问题与深度解答,涵盖学术开题、研究方法、数据集、AI 辅助写作、模拟审稿、论文查重、AI 写作幻觉与文献核对等主题,每个问题都给出一篇完整回答。</p>
%s
</section>`, baseStyle, headingStyle, textStyle, articleListNoscript("qa", "/qa/"))

	case path == "/tools":
		return fmt.Sprintf(`<section %s>
<h2 %s>科研工具广场 — 学术软件与工具大全</h2>
<p %s>Scholay 功能广场收录科研工作者常用的学术工具与软件,涵盖文献检索、文献管理、论文写作、数据分析、AI 学术助手、LaTeX 排版、参考文献管理、学术绘图等类目。每个工具含分类、获取方式、官网链接与使用说明,帮助研究者快速找到合适的科研工具。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/peer-review":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 智能审稿</h2>
<p %s>Scholay 智能审稿服务模拟同行评审流程，从论文结构、方法论严谨性、论证逻辑、写作质量等多个维度对论文进行全面评估。支持 PDF 上传和文本粘贴两种方式提交论文，审稿报告按问题严重性分级，并提供具体的修改建议和改进方向。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/pricing":
		return fmt.Sprintf(`<section %s>
<h2 %s>订阅方案</h2>
<p %s>Scholay 提供灵活的订阅方案，从 Free 到 Pro 和 Max，满足不同层次的学术研究需求。Free 用户可使用基础检索和有限次数的 AI 分析功能，付费订阅解锁高级 AI 模型、更多使用配额和专属功能。支持支付宝和微信支付。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/privacy":
		return fmt.Sprintf(`<section %s>
<h2 %s>隐私政策</h2>
<p %s>本页说明 Scholay（成都恩特罐罐文化科技有限公司）如何收集、使用、存储与保护用户个人信息，包括账号信息与检索/使用记录的处理方式、Cookie 使用、第三方服务、数据安全措施，以及用户对自身数据的访问、更正与删除权利。完整条款以页面正文为准。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/terms":
		return fmt.Sprintf(`<section %s>
<h2 %s>服务条款</h2>
<p %s>本页为 Scholay 学术平台的服务条款，说明用户在使用检索、AI 论文分析、智能写作与智能审稿等服务时的权利与义务、账号与订阅规则、知识产权与内容使用规范、免责声明及条款变更方式。使用本平台即视为同意本条款。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/disclaimer":
		return fmt.Sprintf(`<section %s>
<h2 %s>免责声明</h2>
<p %s>本页为 Scholay 免责声明。平台提供的检索结果、AI 生成的论文分析、审稿意见与写作建议仅供学术参考，不构成专业意见或决策依据；论文版权归原作者及出版方所有，用户应遵守相关版权规定并自行核验信息准确性。</p>
</section>`, baseStyle, headingStyle, textStyle)

	default:
		return ""
	}
}

// articleListNoscript 从 content 包(正文单一真源)渲染某类文章的链接列表,供爬虫在
// /blog、/resources 索引页发现并跟随到各篇详情。标题/摘要随 content 实时,不再镜像旧注册表。
func articleListNoscript(kind, pathPrefix string) string {
	var b strings.Builder
	b.WriteString(`<ul style="color: #505059; line-height: 2; padding-left: 24px;">`)
	for _, a := range content.List(kind) {
		if a.Slug == "" {
			continue
		}
		if a.Excerpt != "" {
			fmt.Fprintf(&b, `<li><a href="%s%s" style="color: #882828;">%s</a> — %s</li>`, pathPrefix, a.Slug, htmlEscape(a.Title), htmlEscape(a.Excerpt))
		} else {
			fmt.Fprintf(&b, `<li><a href="%s%s" style="color: #882828;">%s</a></li>`, pathPrefix, a.Slug, htmlEscape(a.Title))
		}
	}
	b.WriteString(`</ul>`)
	return b.String()
}

// resourceArticleMeta / blogArticleMeta: slug → {标题, 摘要}。镜像前端
// frontend-user/src/features/help/data/{resource,blog}-articles.ts —— 让弱 JS 爬虫(百度)在
// /resources/{slug} 与 /blog/{slug} 详情页看到逐篇真实标题+摘要,而非首页通用壳(薄内容)。
// 两表 slug 无冲突。与前端数据若漂移,以前端为准同步(后续可考虑改 build 期生成,消除双源)。
var resourceArticleMeta = map[string][2]string{
	"how-to-search":                   {"如何高效检索学术文献：从入门到精通", "掌握学术文献检索的核心技巧，学会使用布尔运算符、关键词策略和数据库筛选功能，大幅提升科研效率。"},
	"literature-review-guide":         {"文献综述撰写全攻略：结构、方法与常见误区", "从选题到成文，全面解析文献综述的撰写方法论，包含叙述式、系统式和元分析三种综述类型的写作要点。"},
	"paper-writing-tips":              {"学术论文写作技巧：如何让你的研究脱颖而出", "从标题构思到结论撰写，分享学术论文各部分的写作技巧，帮助提升论文的可读性和影响力。"},
	"citation-guide":                  {"学术引用格式完全指南：APA、MLA、Chicago 与 IEEE", "详细对比四大主流引用格式的使用规则与适用场景，附带常见引用场景的示例和易错点提醒。"},
	"research-methodology":            {"研究方法论入门：定量、定性与混合方法的选择", "系统介绍三大研究方法范式的核心理念、适用场景和实施步骤，帮助研究者选择最合适的研究设计。"},
	"ai-in-research":                  {"AI 在学术研究中的应用：机遇、实践与伦理思考", "探讨人工智能如何改变学术研究的方方面面，从文献检索到论文写作，以及使用 AI 工具时需要注意的伦理边界。"},
	"peer-review-guide":               {"同行评审完全指南：如何写出高质量的审稿意见", "从审稿人视角解析同行评审流程，分享审稿的方法论和写作技巧，帮助研究者更好地理解和参与评审过程。"},
	"latex-tutorial":                  {"LaTeX 入门教程：学术排版的必备技能", "从零开始学习 LaTeX 学术排版，涵盖文档结构、数学公式、图表插入和参考文献管理等核心功能。"},
	"open-access-guide":               {"开放获取（Open Access）发表完全指南", "全面解析学术论文开放获取发表模式，帮助研究者选择合适的 OA 期刊，了解费用结构、版权协议和合规要求。"},
	"systematic-review-meta-analysis": {"系统综述与 Meta 分析撰写指南", "从选题到发表的系统综述完整流程，涵盖 PRISMA 规范、文献检索策略、质量评价方法和统计分析要点。"},
	"academic-english-writing":        {"学术英语写作核心技巧与常见错误", "系统讲解学术英语写作规范，从句式结构、时态运用到学术用词，帮助非英语母语研究者提升论文语言质量。"},
	"research-data-management":        {"科研数据管理与共享最佳实践", "详解科研数据全生命周期管理：从数据收集、整理、存储到开放共享，遵循 FAIR 原则，满足期刊和资助方的数据政策要求。"},
	"academic-conference-guide":       {"学术会议参与全攻略：从投稿到报告", "覆盖学术会议全流程：会议选择、摘要投稿、海报设计、口头报告技巧和学术社交方法，助你最大化会议参与收益。"},
}

var blogArticleMeta = map[string][2]string{
	"ai-literature-search-efficiency":       {"如何使用 AI 提升学术文献检索效率：从关键词到语义搜索的跨越", "传统关键词搜索常常遗漏大量相关文献。本文详解 AI 语义搜索的工作原理，以及如何利用 Scholay 的智能检索功能将文献发现效率提升 3-5 倍。"},
	"academic-search-tools-comparison-2026": {"2026 年学术搜索工具全景对比：选对工具让科研效率翻倍", "面对琳琅满目的学术搜索工具，如何选择最适合自己的？本文从数据覆盖、搜索精度、AI 功能和用户体验四个维度，深度对比 2026 年主流学术搜索工具的优劣。"},
	"semantic-scholar-vs-google-scholar":    {"AI 学术搜索与 Google Scholar 深度对比：哪个更适合你的研究？", "新一代 AI 学术搜索引擎与传统 Google Scholar 的全方位对比，从数据源、搜索算法、引用分析到 AI 功能，帮助你在不同研究场景中做出最佳选择。"},
	"graduate-literature-review-workflow":   {"研究生文献综述的完整工作流程：从零开始到成稿的系统方法", "文献综述不是简单的论文堆砌。本文提供一套从确定范围、检索文献、阅读笔记到组织成文的完整工作流程，特别适合正在撰写学位论文的研究生。"},
	"judge-paper-quality-impact":            {"如何快速判断一篇论文的质量和影响力：5 个关键指标详解", "面对海量检索结果，如何快速识别高质量论文？本文详解 5 个核心评估指标，并介绍利用 AI 工具辅助论文质量评估的实用方法。"},
	"citation-network-analysis":             {"学术论文引用网络分析：用引用关系图发现领域核心文献", "引用关系是学术知识传播的脉络。本文教你如何利用引用网络分析快速绘制研究领域的知识地图，发现关键论文和新兴方向。"},
	"ai-academic-writing-ethics":            {"AI 辅助学术写作的伦理边界：什么可以做，什么不应该做", "随着 ChatGPT 等 AI 工具在学术界的广泛使用，如何在利用 AI 提效的同时维护学术诚信，成为每位研究者必须面对的问题。"},
	"open-access-legal-free-papers":         {"开放获取完全指南：合法免费获取学术论文的 8 种途径", "付费墙不应该成为知识获取的障碍。本文介绍 8 种合法获取学术论文全文的方法，帮助你在遵守版权的前提下获取所需文献。"},
	"latex-vs-word-academic-writing":        {"LaTeX 与 Word 选择指南：学术论文排版工具该如何选", "LaTeX 和 Word 各有优劣，适用场景也不同。本文从排版质量、学习成本、协作效率和期刊要求四个维度提供选择建议。"},
	"peer-review-process-explained":         {"同行评审流程揭秘：从投稿到发表的每一步", "同行评审是学术出版的质量保障机制。本文详细解析整个流程的每个环节，以及如何提高论文通过评审的概率。"},
	"citation-trend-discovery":              {"如何利用引文分析发现研究趋势：数据驱动的选题方法", "研究趋势隐藏在引用数据中。本文介绍如何利用引文增长曲线、突发检测和共词分析等方法，数据驱动地发现和验证研究趋势。"},
	"cross-disciplinary-search-strategies":  {"跨学科文献检索策略：突破学科壁垒发现创新研究", "创新往往发生在学科交叉处。本文分享四种跨学科文献检索策略，帮助你发现其他领域中与你研究相关的重要工作。"},
	"conference-vs-journal-papers":          {"学术会议论文 vs 期刊论文：有何不同，如何选择发表渠道", "会议论文和期刊论文在评审流程、发表周期和学术影响力上有显著差异。了解这些区别，帮你为不同类型的研究选择最合适的发表渠道。"},
	"scholay-platform-complete-guide":       {"Scholay 平台完全使用指南：从入门到精通的一站式教程", "系统介绍 Scholay 平台的所有功能模块——从学术搜索、AI 分析到智能审稿和 LaTeX 编辑器，帮你充分发挥平台的全部潜力。"},
	"common-search-mistakes-solutions":      {"学术搜索中的 7 个常见误区与破解方法", "很多研究者在文献检索中不自觉地犯着同样的错误。本文总结 7 个最常见的搜索误区，并提供针对性的破解策略。"},
	"ai-tools-research-workflow-2026":       {"AI 工具如何重塑科研工作流：2026 年学术研究者的新常态", "从文献检索到论文写作，AI 工具正在改变科研的每一个环节。本文梳理 2026 年 AI 在学术研究中的典型应用场景和最佳实践。"},
}

// renderArticleNoscript 渲染单篇文章的 noscript 卡片(标题 + 摘要 + 返回链接)。slug 未命中返回空。
func renderArticleNoscript(meta map[string][2]string, slug, backHref, backLabel, baseStyle, headingStyle, textStyle string) string {
	m, ok := meta[slug]
	if !ok {
		return ""
	}
	return fmt.Sprintf(`<article %s>
<h1 %s>%s</h1>
<p %s>%s</p>
<p style="color: #6E6E78; font-size: 0.9rem;">作者：Scholay 学术团队 | <a href="%s" style="color: #882828;">%s</a></p>
</article>`, baseStyle, headingStyle, htmlEscape(m[0]), textStyle, htmlEscape(m[1]), backHref, backLabel)
}

// getArticleNoscript 资源中心单篇(保留旧签名给 /resources/{slug} 调用)。
func getArticleNoscript(slug, baseStyle, headingStyle, textStyle string) string {
	return renderArticleNoscript(resourceArticleMeta, slug, "/resources", "返回资源中心", baseStyle, headingStyle, textStyle)
}

// proxyToFrontend proxies the request to the frontend container
func (h *Handler) proxyToFrontend(c *gin.Context) {
	resp, err := ssrHTTPClient.Get(h.frontendURL + c.Request.URL.Path)
	if err != nil {
		c.String(http.StatusBadGateway, "Failed to proxy to frontend")
		return
	}
	defer resp.Body.Close()

	for key, values := range resp.Header {
		for _, value := range values {
			c.Header(key, value)
		}
	}

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
	c.Data(resp.StatusCode, resp.Header.Get("Content-Type"), body)
}

// InvalidateIndexHTMLCache invalidates all cached HTML pages.
// Call this when code snippets are updated to ensure fresh content.
func (h *Handler) InvalidateIndexHTMLCache() {
	h.ssrCache.invalidateAll()
	slog.Info("all HTML page caches invalidated")
}

// ============================================
// Dynamic Sitemap Generation
// 动态 sitemap 生成 - 包含热门论文页面
// ============================================

// ServeDynamicSitemap 生成并返回动态 sitemap（XML 格式）
// 包含静态页面和热门论文页面
// ⚠️ 此函数当前未被路由引用，真正提供服务的是 internal/seo 包。保留仅为兼容老调用方。
func (h *Handler) ServeDynamicSitemap(c *gin.Context) {
	baseURL := appconfig.CanonicalBaseURL()
	today := time.Now().Format("2006-01-02")

	var sitemapBuilder strings.Builder
	sitemapBuilder.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
`)

	// 静态页面
	staticPages := []struct {
		Path       string
		ChangeFreq string
		Priority   string
	}{
		{"/", "daily", "1.0"},
		{"/search-results", "daily", "0.9"},
		{"/chat", "weekly", "0.8"},
		{"/assistant", "weekly", "0.8"},
		{"/peer-review", "weekly", "0.8"},
		{"/pricing", "monthly", "0.7"},
		{"/fund-center", "weekly", "0.6"},
		{"/about", "monthly", "0.6"},
		{"/privacy", "monthly", "0.5"},
		{"/terms", "monthly", "0.5"},
		{"/feedback", "monthly", "0.5"},
		{"/contact", "monthly", "0.6"},
		{"/disclaimer", "monthly", "0.5"},
		{"/resources", "weekly", "0.8"},
		{"/resources/how-to-search", "monthly", "0.7"},
		{"/resources/literature-review-guide", "monthly", "0.7"},
		{"/resources/paper-writing-tips", "monthly", "0.7"},
		{"/resources/citation-guide", "monthly", "0.7"},
		{"/resources/research-methodology", "monthly", "0.7"},
		{"/resources/ai-in-research", "monthly", "0.7"},
		{"/resources/peer-review-guide", "monthly", "0.7"},
		{"/resources/latex-tutorial", "monthly", "0.7"},
		{"/help", "monthly", "0.7"},
	}

	for _, page := range staticPages {
		sitemapBuilder.WriteString(fmt.Sprintf(`
  <url>
    <loc>%s%s</loc>
    <lastmod>%s</lastmod>
    <changefreq>%s</changefreq>
    <priority>%s</priority>
  </url>`, baseURL, page.Path, today, page.ChangeFreq, page.Priority))
	}

	// 注:原「动态论文页面(基于 usage_logs 访问统计的热门论文)」已随 usagelog v1 下线移除。
	// 它本就是死代码:① 本 handler(ServeDynamicSitemap)未注册任何路由;② 查询窗口是 usage_logs
	// 最近 30 天,而该表 2026-06 起零写入 → 恒返回 0 条。线上论文 sitemap 走 seo.ServePaperSitemap
	// (基于 seo_papers 永久索引库),与此无关。

	sitemapBuilder.WriteString(`
</urlset>
`)

	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=3600") // 缓存1小时
	c.String(http.StatusOK, sitemapBuilder.String())
}

// ServeSitemapIndex 生成 sitemap 索引文件
// 用于当 sitemap 太大时分割成多个文件
// ⚠️ 此函数当前未被路由引用，真正提供服务的是 internal/seo 包。保留仅为兼容老调用方。
func (h *Handler) ServeSitemapIndex(c *gin.Context) {
	baseURL := appconfig.CanonicalBaseURL()
	today := time.Now().Format("2006-01-02")

	sitemapIndex := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>%s/sitemap.xml</loc>
    <lastmod>%s</lastmod>
  </sitemap>
  <sitemap>
    <loc>%s/sitemap-papers.xml</loc>
    <lastmod>%s</lastmod>
  </sitemap>
</sitemapindex>
`, baseURL, today, baseURL, today)

	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=86400") // 缓存24小时
	c.String(http.StatusOK, sitemapIndex)
}
