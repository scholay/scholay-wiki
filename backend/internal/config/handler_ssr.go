// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - SSR 代码片段注入 & 动态 Sitemap
// ============================================================================

package config

import (
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
	"scholar-backend/internal/seo"

	"github.com/gin-gonic/gin"
)

const (
	// indexHTMLCacheTTL is how long to cache the original index.html
	indexHTMLCacheTTL = 5 * time.Minute
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

	// 论文详情页 SEO 元数据注入 —— 同时支持新 canonical 和 legacy 两种路径形式:
	//   新 canonical /paper/{source}/{paperId}   → ResolveByPaperID
	//   legacy      /paper/{slug}                → ResolveSlug
	// 仅按 `/` 段数区分,paperId 内部允许出现 `:`(如 arXiv:1706.03762),不可有 `/`。
	if h.paperSEOProvider != nil && strings.HasPrefix(requestPath, "/paper/") {
		rest := strings.TrimPrefix(requestPath, "/paper/")
		if rest != "" {
			parts := strings.Split(rest, "/")
			switch len(parts) {
			case 1:
				// legacy /paper/{slug}
				if meta, err := h.paperSEOProvider.ResolveSlug(parts[0]); err == nil && meta != nil {
					modifiedHTML = injectPaperSEOMeta(modifiedHTML, meta, requestPath)
				}
			case 2:
				// canonical /paper/{source}/{paperId}
				source, paperID := parts[0], parts[1]
				if source != "" && paperID != "" {
					if meta, err := h.paperSEOProvider.ResolveByPaperID(source, paperID); err == nil && meta != nil {
						modifiedHTML = injectPaperSEOMeta(modifiedHTML, meta, requestPath)
					}
				}
			}
		}
	}

	// 作者详情页 SEO 元数据注入 —— 同样支持新 canonical 和 legacy
	if h.authorSEOProvider != nil && strings.HasPrefix(requestPath, "/author/") {
		rest := strings.TrimPrefix(requestPath, "/author/")
		if rest != "" {
			parts := strings.Split(rest, "/")
			switch len(parts) {
			case 1:
				if meta, err := h.authorSEOProvider.ResolveAuthorSlug(parts[0]); err == nil && meta != nil {
					modifiedHTML = injectAuthorSEOMeta(modifiedHTML, meta, requestPath)
				}
			case 2:
				source, authorID := parts[0], parts[1]
				if source != "" && authorID != "" {
					if meta, err := h.authorSEOProvider.ResolveByAuthorID(source, authorID); err == nil && meta != nil {
						modifiedHTML = injectAuthorSEOMeta(modifiedHTML, meta, requestPath)
					}
				}
			}
		}
	}

	// 期刊详情页 SEO 元数据注入 (canonicalRedirectFor 已处理 301; 走到这里说明 URL 已是 canonical
	// 或者 SEO 行不存在/没 slug 不需要重定向)
	if h.journalSEOProvider != nil && strings.HasPrefix(requestPath, "/journal/") {
		rest := strings.TrimPrefix(requestPath, "/journal/")
		if rest != "" {
			idStr, _ := splitJournalPath(rest)
			if id, err := strconv.ParseInt(idStr, 10, 64); err == nil && id > 0 {
				if meta, err := h.journalSEOProvider.ResolveByJournalID(id); err == nil && meta != nil {
					modifiedHTML = injectJournalSEOMeta(modifiedHTML, meta, requestPath)
				}
			}
		}
	}

	// 功能广场工具详情页 SEO 元数据注入 (/tools/{slug}) —— 单段 slug, 列表页 /tools 不命中。
	if h.toolSEOProvider != nil && strings.HasPrefix(requestPath, "/tools/") {
		rest := strings.TrimPrefix(requestPath, "/tools/")
		if rest != "" && !strings.Contains(rest, "/") {
			if meta, err := h.toolSEOProvider.ResolveToolBySlug(rest); err == nil && meta != nil {
				modifiedHTML = injectToolSEOMeta(modifiedHTML, meta, requestPath)
			}
		}
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
	if meta.Homepage != "" {
		person["sameAs"] = []string{meta.Homepage}
	}
	return jsonLDScript(map[string]any{
		"@context":   "https://schema.org",
		"@type":      "ProfilePage",
		"url":        canonical,
		"mainEntity": person,
	})
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
)

// injectOG 改写 og:title / og:url / og:description 为本页值(标签存在则替换,缺失则插在 </head> 前)。
// title/desc 走 htmlAttrEscape 防属性注入;canonical 已是安全 URL。空值不动对应标签。
func injectOG(html, ogTitle, ogURL, ogDesc string) string {
	if ogTitle != "" {
		tag := fmt.Sprintf(`<meta property="og:title" content="%s" />`, htmlEscape(ogTitle))
		if ssrOgTitleRe.MatchString(html) {
			html = ssrOgTitleRe.ReplaceAllString(html, tag)
		} else {
			html = strings.Replace(html, "</head>", tag+"\n</head>", 1)
		}
	}
	if ogURL != "" {
		tag := fmt.Sprintf(`<meta property="og:url" content="%s" />`, htmlEscape(ogURL))
		if ssrOgURLRe.MatchString(html) {
			html = ssrOgURLRe.ReplaceAllString(html, tag)
		} else {
			html = strings.Replace(html, "</head>", tag+"\n</head>", 1)
		}
	}
	if ogDesc != "" {
		tag := fmt.Sprintf(`<meta property="og:description" content="%s" />`, htmlEscape(ogDesc))
		if ssrOgDescRe.MatchString(html) {
			html = ssrOgDescRe.ReplaceAllString(html, tag)
		} else {
			html = strings.Replace(html, "</head>", tag+"\n</head>", 1)
		}
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

	// 描述：摘要优先，其次 venue/year/DOI/作者
	desc := meta.Abstract
	if desc == "" {
		var parts []string
		if len(meta.Authors) > 0 {
			parts = append(parts, "作者: "+strings.Join(meta.Authors[:minInt(len(meta.Authors), 5)], ", "))
		}
		if meta.Venue != "" {
			parts = append(parts, meta.Venue)
		}
		if meta.Year != nil && *meta.Year > 0 {
			parts = append(parts, fmt.Sprintf("%d", *meta.Year))
		}
		if meta.DOI != "" {
			parts = append(parts, "DOI: "+meta.DOI)
		}
		desc = strings.Join(parts, " · ")
		if desc != "" {
			desc = "在 Scholay 阅读这篇论文 — " + desc + "。AI 摘要、引文图谱、PDF 全文一键获取。"
		}
	}
	desc = truncate(desc, 300)

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

	// 3.6) 改写 Open Graph 为本页值(否则社媒分享塌缩到首页)
	html = injectOG(html, seoTitle, canonical, desc)

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
	baseStyle := `style="max-width: 1000px; margin: 20px auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e0e0e0;"`
	headingStyle := `style="color: #ffffff; border-bottom: 1px solid #424242; padding-bottom: 10px; font-size: 1.4rem;"`
	textStyle := `style="color: #bdbdbd; line-height: 1.8; margin-bottom: 12px;"`
	metaStyle := `style="color: #9e9e9e; font-size: 0.9rem; margin-bottom: 8px;"`

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

	html = injectOG(html, seoTitle, canonical, desc)
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
	baseStyle := `style="max-width: 1000px; margin: 20px auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e0e0e0;"`
	headingStyle := `style="color: #ffffff; border-bottom: 1px solid #424242; padding-bottom: 10px; font-size: 1.4rem;"`
	metaStyle := `style="color: #9e9e9e; font-size: 0.9rem; margin-bottom: 8px;"`
	statStyle := `style="color: #bdbdbd; line-height: 1.8; margin-bottom: 12px;"`

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

	return fmt.Sprintf(`<article %s>
<h1 %s>%s</h1>
%s
%s
</article>`, baseStyle, headingStyle, name, metaHTML, statHTML)
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

	html = injectOG(html, seoTitle, canonical, desc)
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
	baseStyle := `style="max-width: 1000px; margin: 20px auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e0e0e0;"`
	headingStyle := `style="color: #ffffff; border-bottom: 1px solid #424242; padding-bottom: 10px; font-size: 1.4rem;"`
	metaStyle := `style="color: #9e9e9e; font-size: 0.9rem; margin-bottom: 8px;"`
	statStyle := `style="color: #bdbdbd; line-height: 1.8; margin-bottom: 12px;"`

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
		statLines = append(statLines, fmt.Sprintf("OpenAlex h-index %d", *meta.OpenAlexHIndex))
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

	html = injectOG(html, seoTitle, canonical, desc)
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
	baseStyle := `style="max-width: 1000px; margin: 20px auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e0e0e0;"`
	headingStyle := `style="color: #ffffff; border-bottom: 1px solid #424242; padding-bottom: 10px; font-size: 1.4rem;"`
	metaStyle := `style="color: #9e9e9e; font-size: 0.9rem; margin-bottom: 8px;"`
	textStyle := `style="color: #bdbdbd; line-height: 1.8; margin-bottom: 12px;"`

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
	for _, prefix := range []string{"/paper/", "/author/", "/journal/", "/tools/"} {
		if strings.HasPrefix(path, prefix) {
			return prefix
		}
	}
	return path
}

// injectCodeSnippets injects code snippets into the HTML at appropriate positions
func (h *Handler) injectCodeSnippets(html string, snippets *model.CodeSnippetsGroupedResponse) string {
	if snippets == nil {
		return html
	}

	result := html

	// Build head snippets content
	if len(snippets.Head) > 0 {
		var headContent strings.Builder
		headContent.WriteString("\n<!-- SSR Code Snippets: head -->\n")
		headContent.WriteString("<script>window.__SSR_SNIPPETS_INJECTED__=true;</script>\n")
		for _, s := range snippets.Head {
			headContent.WriteString(s.CodeContent)
			headContent.WriteString("\n")
		}
		headContent.WriteString("<!-- End SSR Code Snippets: head -->\n")

		// Inject before </head>
		result = strings.Replace(result, "</head>", headContent.String()+"</head>", 1)
	} else {
		// Still add the flag even if no head snippets
		flagScript := "\n<!-- SSR Code Snippets -->\n<script>window.__SSR_SNIPPETS_INJECTED__=true;</script>\n<!-- End SSR Code Snippets -->\n"
		result = strings.Replace(result, "</head>", flagScript+"</head>", 1)
	}

	// Build body_start snippets content
	if len(snippets.BodyStart) > 0 {
		var bodyStartContent strings.Builder
		bodyStartContent.WriteString("\n<!-- SSR Code Snippets: body_start -->\n")
		for _, s := range snippets.BodyStart {
			bodyStartContent.WriteString(s.CodeContent)
			bodyStartContent.WriteString("\n")
		}
		bodyStartContent.WriteString("<!-- End SSR Code Snippets: body_start -->\n")

		// Inject after <body> (handle potential attributes on body tag)
		bodyTagRegex := ssrBodyTagRe
		result = bodyTagRegex.ReplaceAllString(result, "${1}"+bodyStartContent.String())
	}

	// Build body_end snippets content
	if len(snippets.BodyEnd) > 0 {
		var bodyEndContent strings.Builder
		bodyEndContent.WriteString("\n<!-- SSR Code Snippets: body_end -->\n")
		for _, s := range snippets.BodyEnd {
			bodyEndContent.WriteString(s.CodeContent)
			bodyEndContent.WriteString("\n")
		}
		bodyEndContent.WriteString("<!-- End SSR Code Snippets: body_end -->\n")

		// Inject before </body>
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

// getRouteNoscriptContent returns route-specific HTML for noscript injection
func getRouteNoscriptContent(path string) string {
	baseStyle := `style="max-width: 1000px; margin: 20px auto; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e0e0e0;"`
	headingStyle := `style="color: #ffffff; border-bottom: 1px solid #424242; padding-bottom: 10px;"`
	textStyle := `style="color: #bdbdbd; line-height: 1.8; margin-bottom: 12px;"`

	switch {
	case path == "/resources":
		return fmt.Sprintf(`<section %s>
<h2 %s>学术资源中心</h2>
<p %s>Scholay 学术资源中心提供原创学术指南，涵盖文献检索技巧、论文写作方法、引用格式规范、研究方法论和 AI 学术工具使用教程，助力科研工作者提升效率。</p>
<ul style="color: #bdbdbd; line-height: 2; padding-left: 24px;">
<li><a href="/resources/how-to-search" style="color: #64b5f6;">如何高效检索学术文献：从入门到精通</a> - 掌握布尔运算符、关键词策略和数据库筛选技巧</li>
<li><a href="/resources/literature-review-guide" style="color: #64b5f6;">文献综述撰写全攻略</a> - 结构、方法与常见误区</li>
<li><a href="/resources/paper-writing-tips" style="color: #64b5f6;">学术论文写作技巧</a> - 从标题构思到结论撰写的实用指南</li>
<li><a href="/resources/citation-guide" style="color: #64b5f6;">学术引用格式完全指南</a> - APA、MLA、Chicago 与 IEEE 格式对比</li>
<li><a href="/resources/research-methodology" style="color: #64b5f6;">研究方法论入门</a> - 定量、定性与混合方法的选择</li>
<li><a href="/resources/ai-in-research" style="color: #64b5f6;">AI 在学术研究中的应用</a> - 机遇、实践与伦理思考</li>
<li><a href="/resources/peer-review-guide" style="color: #64b5f6;">同行评审完全指南</a> - 如何写出高质量的审稿意见</li>
<li><a href="/resources/latex-tutorial" style="color: #64b5f6;">LaTeX 入门教程</a> - 学术排版的必备技能</li>
</ul>
</section>`, baseStyle, headingStyle, textStyle)

	case strings.HasPrefix(path, "/resources/"):
		slug := strings.TrimPrefix(path, "/resources/")
		return getArticleNoscript(slug, baseStyle, headingStyle, textStyle)

	case strings.HasPrefix(path, "/blog/"):
		slug := strings.TrimPrefix(path, "/blog/")
		return renderArticleNoscript(blogArticleMeta, slug, "/blog", "返回博客", baseStyle, headingStyle, textStyle)

	case path == "/help":
		return fmt.Sprintf(`<section %s>
<h2 %s>帮助中心</h2>
<p %s>了解 Scholay 的核心功能和使用方法。Scholay 是一个 AI 驱动的学术搜索平台，整合了 Semantic Scholar 超过 2 亿篇学术论文资源。</p>
<h3 style="color: #ffffff;">核心功能</h3>
<ul style="color: #bdbdbd; line-height: 2; padding-left: 24px;">
<li><strong>学术文献检索</strong> - 直接检索和智能检索两种模式，支持布尔运算符和自然语言查询</li>
<li><strong>AI 论文分析</strong> - 利用大语言模型提供论文的深度分析报告，包含核心贡献、方法论和创新点</li>
<li><strong>AI 学术聊天</strong> - 与 AI 助手进行学术对话，获取研究灵感和论文写作辅助</li>
<li><strong>AI 智能审稿</strong> - 上传论文获取 AI 生成的专业审稿意见和改进建议</li>
<li><strong>ScholayPrism LaTeX 编辑器</strong> - 在线 LaTeX 学术写作工作空间，集成 AI 辅助写作</li>
</ul>
<h3 style="color: #ffffff;">常见问题</h3>
<dl style="color: #bdbdbd; line-height: 1.8;">
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">Scholay 是免费的吗？</dt>
<dd>Scholay 提供免费基础版，包含学术检索和有限次数的 AI 分析功能。高级功能需要订阅付费方案。</dd>
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">如何注册和登录？</dt>
<dd>支持邮箱注册、GitHub 账号登录和微信登录三种方式。</dd>
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">AI 分析结果准确吗？</dt>
<dd>AI 分析基于先进的大语言模型，能较好地理解学术论文，但仅供参考，建议结合原文进行人工验证。</dd>
</dl>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/search":
		return fmt.Sprintf(`<section %s>
<h2 %s>学术搜索</h2>
<p %s>Scholay 学术搜索覆盖超过 2 亿篇学术论文，支持直接检索和 AI 智能检索两种模式。使用布尔运算符（AND、OR、NOT）和精确短语检索提升搜索精度。结果可按相关度、被引次数和发表时间排序，并支持按年份、领域、论文类型等条件筛选。</p>
<p %s>热门研究领域包括：深度学习、量子计算、CRISPR 基因编辑、气候变化、大语言模型、新能源技术、计算机视觉、自然语言处理、生物信息学等。</p>
</section>`, baseStyle, headingStyle, textStyle, textStyle)

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
<ul style="color: #bdbdbd; line-height: 2; padding-left: 24px;">
<li><a href="/features/search" style="color: #64b5f6;">学术检索</a> — 直接检索 + AI 智能检索,覆盖 2 亿+ 论文</li>
<li><a href="/features/library" style="color: #64b5f6;">个人文献集</a> — 收藏、整理、管理论文与 PDF</li>
<li><a href="/features/claw" style="color: #64b5f6;">智能助手</a> — AI 学术对话与文献辅助</li>
<li><a href="/features/prism" style="color: #64b5f6;">智能写作 Prism</a> — AI-native LaTeX 编辑器</li>
<li><a href="/features/peer-review" style="color: #64b5f6;">智能审稿</a> — AI 多维度审稿意见</li>
<li><a href="/features/submit" style="color: #64b5f6;">投稿辅助</a> — 期刊推荐与投稿信起草</li>
</ul>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/blog":
		return fmt.Sprintf(`<section %s>
<h2 %s>Scholay 学术博客</h2>
<p %s>Scholay 学术博客分享文献检索技巧、学术工具评测、论文写作与同行评审经验、AI 科研应用等原创长文,帮助研究者提升科研效率。精选文章:</p>
%s
</section>`, baseStyle, headingStyle, textStyle, blogArticleListNoscript())

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

	default:
		return ""
	}
}

// blogArticleListNoscript 从 seo.BlogArticles 注册表生成博客文章链接列表(供爬虫发现 16 篇文章)。
// anchor 优先用 blogArticleMeta 里的真实中文标题(摘要也带上),缺失时回落 slug 派生文本。
func blogArticleListNoscript() string {
	var b strings.Builder
	b.WriteString(`<ul style="color: #bdbdbd; line-height: 2; padding-left: 24px;">`)
	for _, e := range seo.BlogArticles {
		if e.Slug == "" {
			continue
		}
		title := strings.ReplaceAll(e.Slug, "-", " ")
		excerpt := ""
		if m, ok := blogArticleMeta[e.Slug]; ok {
			title = m[0]
			excerpt = m[1]
		}
		if excerpt != "" {
			fmt.Fprintf(&b, `<li><a href="/blog/%s" style="color: #64b5f6;">%s</a> — %s</li>`, e.Slug, htmlEscape(title), htmlEscape(excerpt))
		} else {
			fmt.Fprintf(&b, `<li><a href="/blog/%s" style="color: #64b5f6;">%s</a></li>`, e.Slug, htmlEscape(title))
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
<p style="color: #9e9e9e; font-size: 0.9rem;">作者：Scholay 学术团队 | <a href="%s" style="color: #64b5f6;">%s</a></p>
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

	// 动态论文页面（基于访问统计）
	if h.usageLogService != nil {
		papers, err := h.usageLogService.GetPopularPaperIDs(30, 200) // 最近30天，最多200篇
		if err != nil {
			slog.Error("failed to get popular papers for sitemap", "err", err)
		} else {
			sitemapBuilder.WriteString(`

  <!-- Popular Paper Pages (dynamically generated based on access statistics) -->`)
			for i, paper := range papers {
				// 根据访问量设置优先级
				priority := "0.6"
				if i < 10 {
					priority = "0.8"
				} else if i < 50 {
					priority = "0.7"
				}

				sitemapBuilder.WriteString(fmt.Sprintf(`
  <url>
    <loc>%s/paper/%s</loc>
    <lastmod>%s</lastmod>
    <changefreq>weekly</changefreq>
    <priority>%s</priority>
  </url>`, baseURL, paper.PaperID, today, priority))
			}
		}
	}

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
