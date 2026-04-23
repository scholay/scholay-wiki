// ============================================================================
// Scholay学术 V1.0
// 配置 Handler - SSR 代码片段注入 & 动态 Sitemap
// ============================================================================

package config

import (
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/common/model"

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

	// /paper/{slug} 专属 SEO 元数据注入
	if h.paperSEOProvider != nil && strings.HasPrefix(requestPath, "/paper/") {
		slug := strings.TrimPrefix(requestPath, "/paper/")
		if slug != "" && !strings.Contains(slug, "/") {
			if meta, err := h.paperSEOProvider.ResolveSlug(slug); err == nil && meta != nil {
				modifiedHTML = injectPaperSEOMeta(modifiedHTML, meta, requestPath)
			}
		}
	}

	// Return the modified HTML
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Header("Cache-Control", "no-cache, must-revalidate")
	c.String(http.StatusOK, modifiedHTML)
}

// injectPaperSEOMeta 替换 <title>/<meta description>，并在 noscript 中插入论文摘要卡片
// 目的：让 Googlebot 等爬虫看到真实论文元数据，而不是 SPA 通用壳
func injectPaperSEOMeta(html string, meta *PaperSEOMeta, path string) string {
	title := meta.Title
	if title == "" {
		return html
	}
	// 标题加品牌后缀
	seoTitle := fmt.Sprintf("%s | Scholay 学术搜索", truncate(title, 120))

	// 描述：摘要优先，其次 venue/year
	desc := meta.Abstract
	if desc == "" {
		var parts []string
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
	}
	desc = truncate(desc, 300)

	// 1) 替换 <title>
	titleRe := regexp.MustCompile(`(?is)<title>.*?</title>`)
	html = titleRe.ReplaceAllString(html, "<title>"+htmlEscape(seoTitle)+"</title>")

	// 2) 替换 <meta name="description" ...>（若不存在则跳过，不主动插入以免破坏已有结构）
	descRe := regexp.MustCompile(`(?is)<meta\s+name=["']description["'][^>]*>`)
	if descRe.MatchString(html) {
		html = descRe.ReplaceAllString(html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}

	// 3) 追加 canonical 链接（若 head 里已有则替换）
	// 域名由 SEO_BASE_URL 环境变量控制，默认 https://scholay.com。
	// 必须和 sitemap <loc> 前缀保持一致，否则爬虫会把 sitemap 里的 URL 当 duplicate 忽略。
	canonical := fmt.Sprintf("%s%s", appconfig.CanonicalBaseURL(), path)
	canonRe := regexp.MustCompile(`(?is)<link\s+rel=["']canonical["'][^>]*>`)
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if canonRe.MatchString(html) {
		html = canonRe.ReplaceAllString(html, canonTag)
	} else {
		html = strings.Replace(html, "</head>", canonTag+"\n</head>", 1)
	}

	// 4) 注入 noscript 论文卡片（爬虫友好）
	noscriptCard := buildPaperNoscriptCard(meta)
	if noscriptCard != "" {
		insertBefore := `<p style="text-align: center; margin-top: 30px;`
		if idx := strings.Index(html, insertBefore); idx > 0 {
			html = html[:idx] + noscriptCard + "\n" + html[idx:]
		} else if idx := strings.Index(html, "</noscript>"); idx > 0 {
			html = html[:idx] + noscriptCard + "\n" + html[idx:]
		}
	}

	return html
}

// buildPaperNoscriptCard 渲染论文的 noscript 卡片
func buildPaperNoscriptCard(meta *PaperSEOMeta) string {
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

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
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

	if cached, ok := h.ssrCache.get(requestPath); ok {
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
	h.ssrCache.set(requestPath, html)

	slog.Info("HTML cached successfully", "path", requestPath, "bytes", len(body))
	return html, nil
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
		bodyTagRegex := regexp.MustCompile(`(?i)(<body[^>]*>)`)
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
	routeContent := getRouteNoscriptContent(path)
	if routeContent == "" {
		return html
	}

	// Find existing noscript and append route-specific content BEFORE the closing </noscript>
	noscriptEnd := "</noscript>"
	insertBefore := `<p style="text-align: center; margin-top: 30px;`
	if idx := strings.Index(html, insertBefore); idx > 0 {
		// Insert route-specific section before the "enable JavaScript" message
		return html[:idx] + routeContent + "\n" + html[idx:]
	}

	// Fallback: insert before </noscript>
	if idx := strings.Index(html, noscriptEnd); idx > 0 {
		return html[:idx] + routeContent + "\n" + html[idx:]
	}

	return html
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

	case path == "/assistant":
		return fmt.Sprintf(`<section %s>
<h2 %s>精品 AI 工具</h2>
<p %s>Scholay 将先进的人工智能技术与学术研究深度融合，打造了一套专业的 AI 学术工具集。</p>
<dl style="color: #bdbdbd; line-height: 1.8;">
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">智能助手</dt>
<dd>支持多种大语言模型，帮助解答学术问题、讨论研究方向、分析论文观点、生成文献综述。</dd>
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">智能审稿</dt>
<dd>AI 从论文结构、方法论、论证逻辑等多维度进行全面评估，提供专业修改意见和改进建议。</dd>
<dt style="color: #ffffff; font-weight: bold; margin-top: 12px;">ScholayPrism LaTeX 编辑器</dt>
<dd>原生支持 LaTeX 的在线学术写作工作空间，实时编译预览，内置多种学术模板。</dd>
</dl>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/search-results":
		return fmt.Sprintf(`<section %s>
<h2 %s>学术搜索</h2>
<p %s>Scholay 学术搜索覆盖超过 2 亿篇学术论文，支持直接检索和 AI 智能检索两种模式。使用布尔运算符（AND、OR、NOT）和精确短语检索提升搜索精度。结果可按相关度、被引次数和发表时间排序，并支持按年份、领域、论文类型等条件筛选。</p>
<p %s>热门研究领域包括：深度学习、量子计算、CRISPR 基因编辑、气候变化、大语言模型、新能源技术、计算机视觉、自然语言处理、生物信息学等。</p>
</section>`, baseStyle, headingStyle, textStyle, textStyle)

	case path == "/chat":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 学术聊天</h2>
<p %s>Scholay AI 助手可以帮您解答学术问题、讨论研究方向、分析论文观点、生成文献综述等。支持多种 AI 模型选择，对话内容支持上下文连续交流。您可以直接粘贴论文片段让 AI 解读，或请 AI 帮助改善论文表达。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/peer-review":
		return fmt.Sprintf(`<section %s>
<h2 %s>AI 智能审稿</h2>
<p %s>Scholay 智能审稿服务模拟同行评审流程，从论文结构、方法论严谨性、论证逻辑、写作质量等多个维度对论文进行全面评估。支持 PDF 上传和文本粘贴两种方式提交论文，审稿报告按问题严重性分级，并提供具体的修改建议和改进方向。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/pricing":
		return fmt.Sprintf(`<section %s>
<h2 %s>订阅方案</h2>
<p %s>Scholay 提供灵活的订阅方案，从免费体验到专业版和旗舰版，满足不同层次的学术研究需求。免费用户可使用基础检索和有限次数的 AI 分析功能，付费订阅解锁高级 AI 模型、更多使用配额和专属功能。支持支付宝和微信支付。</p>
</section>`, baseStyle, headingStyle, textStyle)

	default:
		return ""
	}
}

// getArticleNoscript returns noscript HTML for specific article pages
func getArticleNoscript(slug, baseStyle, headingStyle, textStyle string) string {
	articleMeta := map[string][2]string{
		"how-to-search":          {"如何高效检索学术文献：从入门到精通", "学术文献检索是每位研究者的基本功。本文系统介绍学术文献检索的方法论和实用技巧，包括如何明确检索目标、掌握布尔检索逻辑、选择合适的学术数据库、评估文献质量和管理检索结果。掌握这些技巧能大幅提升科研效率，帮助你更快找到高质量的学术论文。"},
		"literature-review-guide": {"文献综述撰写全攻略：结构、方法与常见误区", "文献综述是学术论文中最基础也最重要的组成部分。本文详细介绍叙述性综述、系统性综述和元分析三种类型的写作要点，以及系统化的文献收集策略、文献综述的结构组织方法、批判性分析技巧和常见写作误区的解决方案。"},
		"paper-writing-tips":      {"学术论文写作技巧：如何让你的研究脱颖而出", "从标题构思到结论撰写，本文分享学术论文各部分的实用写作技巧。包括如何撰写吸引人的标题和摘要、使用倒漏斗结构写好引言、确保方法部分的可重复性、客观呈现结果并深入讨论，以及学术写作的风格和语言建议。"},
		"citation-guide":          {"学术引用格式完全指南：APA、MLA、Chicago 与 IEEE", "详细对比四大主流引用格式的使用规则与适用场景。涵盖 APA 第 7 版、MLA 第 9 版、Chicago 第 17 版和 IEEE 格式的核心特点、内文引用方式和参考文献列表格式，以及如何根据学科和期刊要求选择合适的引用格式。"},
		"research-methodology":    {"研究方法论入门：定量、定性与混合方法的选择", "系统介绍三大研究方法范式的核心理念、适用场景和实施步骤。包括定量研究的实验设计和样本量计算、定性研究的扎根理论和现象学方法、混合方法的设计类型，以及如何根据研究问题选择最合适的方法和研究伦理考量。"},
		"ai-in-research":          {"AI 在学术研究中的应用：机遇、实践与伦理思考", "探讨人工智能如何改变学术研究的方方面面。从 AI 驱动的语义检索到辅助论文分析、从机器学习数据分析到 AI 辅助写作，以及使用 AI 工具时需要注意的学术诚信、数据隐私和偏见等伦理问题和最佳实践。"},
		"peer-review-guide":       {"同行评审完全指南：如何写出高质量的审稿意见", "从审稿人视角解析同行评审流程。包括审稿前的准备工作和评审清单、论文评审的核心标准、如何撰写具体且建设性的审稿意见、保持客观和专业的原则，以及如何利用 AI 工具辅助审稿提升效率。"},
		"latex-tutorial":          {"LaTeX 入门教程：学术排版的必备技能", "从零开始学习 LaTeX 学术排版。涵盖 LaTeX 的基本概念与环境搭建、文档结构与章节组织、数学公式排版、图表与浮动体插入、BibTeX 参考文献管理，以及中文支持和常见问题解决等实用技巧。"},
	}

	meta, ok := articleMeta[slug]
	if !ok {
		return ""
	}

	return fmt.Sprintf(`<article %s>
<h2 %s>%s</h2>
<p %s>%s</p>
<p style="color: #9e9e9e; font-size: 0.9rem;">作者：Scholay 学术团队 | <a href="/resources" style="color: #64b5f6;">返回资源中心</a></p>
</article>`, baseStyle, headingStyle, meta[0], textStyle, meta[1])
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
