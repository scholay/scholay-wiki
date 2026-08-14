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
// 2026-08-12 视觉改版:普通用户在 JS 到达前会真实看到这份静态兜底(与爬虫同一份 HTML,
// 刻意不做 UA 分流),此前的裸排版被用户点名「丑」。现对齐前端设计系统的视觉语言:
// 米白画布 #F6F4EE(bg-background)+ 白卡 #FFFFFF(surface-card)+ 16px 圆角(rounded-16)
// + hairline 边框 rgba(31,31,35,.12)(border-border)+ 720px 阅读测量宽(max-w-reading)。
// 【内容一字不动、链接一条不少】—— 只动排版容器,SEO 面零变化。
// 字体族收口到画布层(ssrCanvasStyle)统一声明,子元素不再各写一份。
const (
	ssrBaseStyle    = `style="max-width: 720px; margin: 0 auto 16px; padding: 24px 28px; background: #FFFFFF; border: 1px solid rgba(31,31,35,0.12); border-radius: 16px; color: #1F1F23;"`
	ssrHeadingStyle = `style="color: #1F1F23; font-size: 1.25rem; font-weight: 500; line-height: 1.45; margin: 0 0 12px;"`
	ssrHeadingTight = `style="color: #1F1F23; font-size: 1.15rem; font-weight: 500; line-height: 1.45; margin: 0 0 10px;"`
	ssrTextStyle    = `style="color: #505059; line-height: 1.8; margin: 0 0 12px;"`
	ssrMetaStyle    = `style="color: #6E6E78; font-size: 0.9rem; margin: 0 0 8px;"`
	ssrSubHeadStyle = `style="color: #1F1F23; font-size: 1.05rem; font-weight: 500; margin: 16px 0 8px;"`
	ssrListStyle    = `style="color: #505059; line-height: 1.8; padding-left: 20px; margin: 0;"`
	ssrNavStyle     = `style="max-width: 720px; margin: 8px auto 0; padding: 16px 4px 0; border-top: 1px solid rgba(31,31,35,0.08); font-size: 0.85rem;"`
	ssrNavListStyle = `style="list-style: none; margin: 0; padding: 0; color: #6E6E78; line-height: 2.1; text-align: center;"`

	// 画布:整页米白底 + 系统字体栈(含中文黑体),所有静态兜底内容都包在它里面。
	ssrCanvasStyle = `style="min-height: 100vh; background: #F6F4EE; padding: 40px 16px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;"`
)

// ssrBrandHeaderHTML 品牌头:衬线 wordmark + tagline,与 React 首屏同款视觉 ——
// 「静态兜底 → 应用接管」读起来是同一个页面在推进,而不是两个产品。
// 刻意不用 <h1>(每页唯一 h1 属于正文标题,有路由测试钉死);wordmark 链回首页,
// 顺带给每个 SSR 页一条品牌内链。字体栈与前端 BrandName 同源(Playfair local 匹配
// → Didot/Georgia 系统衬线兜底)。
var ssrBrandHeaderHTML = `<header data-ssr-brand="true" style="max-width: 720px; margin: 0 auto 20px; text-align: center;">` +
	`<p style="margin: 0; font-family: 'Playfair Display', Didot, Georgia, 'Times New Roman', serif; font-size: 2rem; font-weight: 500; letter-spacing: -0.03em; line-height: 1.2;"><a href="/" style="color: #1F1F23; text-decoration: none;">Scholay</a></p>` +
	`<p style="margin: 6px 0 0; color: #6E6E78; font-size: 0.8rem;">学术搜索 · AI 审稿 · LaTeX 协作</p>` +
	`</header>`

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
		writeSSRStatusPage(c, "", http.StatusNotFound)
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
		writeSSRStatusPage(c, "", http.StatusServiceUnavailable)
		return
	}

	// 所有公开页面(普通用户与爬虫)都从同一份、带可见正文的初始 HTML 启动。
	// React 随后会替换 #root 内的静态 fallback；壳自带的全站 noscript 必须先移除，
	// 否则详情页会同时出现品牌 H1 与实体 H1。
	modifiedHTML := prepareSSRPageShell(pageHTML)

	// 配置服务临时不可用不应让整个页面退回通用首页壳；代码片段是增强项，
	// 记录错误后继续生成本路由的 title/canonical/正文与正确状态码。
	if h.service != nil {
		snippetsGrouped, snippetErr := h.service.GetCodeSnippetsGrouped()
		if snippetErr != nil {
			slog.Error("failed to get code snippets", "err", snippetErr)
		} else {
			modifiedHTML = h.injectCodeSnippets(modifiedHTML, snippetsGrouped)
		}
	}

	status := http.StatusOK
	handled := false

	// 静态/入口页只有白名单里的路径才是 200。此前 `/features/<任意值>` 等路径会
	// 回落通用壳并返回 200，形成无限软 404。
	if _, ok := staticPageSEO[requestPath]; ok {
		handled = true
		modifiedHTML = injectRouteNoscript(modifiedHTML, requestPath)
		modifiedHTML = injectStaticPageSEOMeta(modifiedHTML, requestPath)
		if requestPath == "/tools" {
			if listing, ok := h.toolSEOProvider.(ToolSEOListingProvider); ok {
				tools, listErr := listing.ListIndexableToolsForSEO(100)
				if listErr != nil {
					status = http.StatusServiceUnavailable
				} else {
					modifiedHTML = appendSSRStaticContent(modifiedHTML, buildToolHubLinks(tools))
				}
			}
		}
	}

	// 博客 / 资源 / 问答详情必须命中正文单一真源；不存在的 slug 返回真 404。
	for _, articleRoute := range []struct{ prefix, kind string }{
		{"/blog/", "blog"},
		{"/resources/", "resources"},
		{"/qa/", "qa"},
	} {
		if strings.HasPrefix(requestPath, articleRoute.prefix) {
			handled = true
			slug := strings.TrimPrefix(requestPath, articleRoute.prefix)
			if slug == "" || strings.Contains(slug, "/") {
				status = http.StatusNotFound
				break
			}
			if _, ok := content.Get(articleRoute.kind, slug); !ok {
				status = http.StatusNotFound
				break
			}
			modifiedHTML = injectRouteNoscript(modifiedHTML, requestPath)
			modifiedHTML = injectArticleSEOMeta(modifiedHTML, articleRoute.kind, slug, requestPath)
			break
		}
	}

	// 论文详情页 SEO 元数据注入 —— source 必须与 resolver 返回的权威 source 一致。
	if strings.HasPrefix(requestPath, "/paper/") {
		handled = true
		if h.paperSEOProvider == nil {
			status = http.StatusServiceUnavailable
		} else {
			rest := strings.TrimPrefix(requestPath, "/paper/")
			if rest == "" {
				status = http.StatusNotFound
			} else {
				parts := strings.Split(rest, "/")
				var meta *seo.PaperSSRMeta
				var resolveErr error
				canonicalRequest := false
				// onMissTerminal:on-miss 分支已进入终局 —— 要么真调了上游没拿到,
				// 要么被闸门挡掉压根没调。两者都不该再给 SPA 200 兜底:实体不在库里,
				// 爬虫必须收到 404 才会停止沿内链扩散(见 ssr_onmiss_gate.go 文件头)。
				onMissTerminal := false
				switch len(parts) {
				case 1:
					meta, resolveErr = h.paperSEOProvider.ResolveSlug(parts[0])
				case 2:
					canonicalRequest = true
					if source, paperID := parts[0], parts[1]; source != "" && paperID != "" {
						meta, resolveErr = h.paperSEOProvider.ResolveByPaperID(source, paperID)
						if resolveErr == nil && meta == nil && !seo.IsCanonicalSource(source) {
							// 允许已存在的历史别名由 resolver 收口，但未命中时绝不用
							// URL 中的任意 source 触发上游回填，否则首访可污染 canonical。
							status = http.StatusNotFound
						} else if resolveErr == nil && meta == nil && h.paperEnricher != nil {
							onMissTerminal = true
							if h.allowOnMissEnrich(c, "paper", source, paperID) {
								ctx, cancel := context.WithTimeout(c.Request.Context(), paperOnMissTimeout)
								var e2 error
								if m2, enrichErr := h.paperEnricher.EnrichPaperOnMiss(ctx, source, paperID); enrichErr == nil && m2 != nil {
									meta = m2
								} else {
									e2 = enrichErr
								}
								cancel()
								if e2 != nil {
									resolveErr = e2
								}
							}
						}
					} else {
						status = http.StatusNotFound
					}
				default:
					status = http.StatusNotFound
				}
				if status == http.StatusOK {
					switch {
					case resolveErr != nil:
						status = http.StatusServiceUnavailable
					case meta == nil:
						if canonicalRequest && !onMissTerminal {
							// SEO 行只是缓存，canonical 深链在未启用 on-miss 时不能据此判实体不存在。
							// 保留 SPA 让用户端数据源继续解析，同时去掉错误的首页 canonical。
							modifiedHTML = ssrCanonRe.ReplaceAllString(modifiedHTML, "")
							modifiedHTML = setSSRNoindex(c, modifiedHTML)
						} else {
							status = http.StatusNotFound
						}
					case meta.SEOInactive:
						status = http.StatusNotFound
					default:
						canonical := canonicalPaperPath(meta)
						if canonical != "" && !canonicalMatchesRequest(canonical, requestPath) {
							c.Redirect(http.StatusMovedPermanently, canonical)
							return
						}
						renderPath := requestPath
						if canonical != "" {
							renderPath = canonical
						}
						modifiedHTML = injectPaperSEOMeta(modifiedHTML, h.closePaperAuthorFrontier(meta), renderPath)
						if !meta.SEOIndexable || canonical == "" {
							if canonical == "" {
								// 旧 SEO 行可能没有 source。没有权威 canonical 时宁可省略，
								// 也不能让 Vite 壳里的首页 canonical 泄漏到实体页。
								modifiedHTML = ssrCanonRe.ReplaceAllString(modifiedHTML, "")
							}
							modifiedHTML = setSSRNoindex(c, modifiedHTML)
						}
					}
				}
			}
		}
	}

	// 作者详情页与论文同口径：错误 503、缺失 404、source 不匹配 301。
	if strings.HasPrefix(requestPath, "/author/") {
		handled = true
		if h.authorSEOProvider == nil {
			status = http.StatusServiceUnavailable
		} else {
			rest := strings.TrimPrefix(requestPath, "/author/")
			if rest == "" {
				status = http.StatusNotFound
			} else {
				parts := strings.Split(rest, "/")
				var meta *seo.AuthorSSRMeta
				var resolveErr error
				canonicalRequest := false
				// 与论文同口径,见上面 onMissTerminal 的说明。
				onMissTerminal := false
				switch len(parts) {
				case 1:
					meta, resolveErr = h.authorSEOProvider.ResolveAuthorSlug(parts[0])
				case 2:
					canonicalRequest = true
					if source, authorID := parts[0], parts[1]; source != "" && authorID != "" {
						meta, resolveErr = h.authorSEOProvider.ResolveByAuthorID(source, authorID)
						if resolveErr == nil && meta == nil && !seo.IsCanonicalSource(source) {
							status = http.StatusNotFound
						} else if resolveErr == nil && meta == nil && h.authorEnricher != nil {
							onMissTerminal = true
							if h.allowOnMissEnrich(c, "author", source, authorID) {
								ctx, cancel := context.WithTimeout(c.Request.Context(), paperOnMissTimeout)
								var e2 error
								if m2, enrichErr := h.authorEnricher.EnrichAuthorOnMiss(ctx, source, authorID); enrichErr == nil && m2 != nil {
									meta = m2
								} else {
									e2 = enrichErr
								}
								cancel()
								if e2 != nil {
									resolveErr = e2
								}
							}
						}
					} else {
						status = http.StatusNotFound
					}
				default:
					status = http.StatusNotFound
				}
				if status == http.StatusOK {
					switch {
					case resolveErr != nil:
						status = http.StatusServiceUnavailable
					case meta == nil:
						if canonicalRequest && !onMissTerminal {
							modifiedHTML = ssrCanonRe.ReplaceAllString(modifiedHTML, "")
							modifiedHTML = setSSRNoindex(c, modifiedHTML)
						} else {
							status = http.StatusNotFound
						}
					case meta.SEOInactive:
						status = http.StatusNotFound
					default:
						canonical := canonicalAuthorPath(meta)
						if canonical != "" && !canonicalMatchesRequest(canonical, requestPath) {
							c.Redirect(http.StatusMovedPermanently, canonical)
							return
						}
						renderPath := requestPath
						if canonical != "" {
							renderPath = canonical
						}
						modifiedHTML = injectAuthorSEOMeta(modifiedHTML, h.closeAuthorWorkFrontier(meta), renderPath)
						if !meta.SEOIndexable || canonical == "" {
							if canonical == "" {
								modifiedHTML = ssrCanonRe.ReplaceAllString(modifiedHTML, "")
							}
							modifiedHTML = setSSRNoindex(c, modifiedHTML)
						}
					}
				}
			}
		}
	}

	if strings.HasPrefix(requestPath, "/journal/") {
		handled = true
		if h.journalSEOProvider == nil {
			status = http.StatusServiceUnavailable
		} else {
			rest := strings.TrimPrefix(requestPath, "/journal/")
			if rest == "" {
				status = http.StatusNotFound
			} else {
				parts := strings.Split(rest, "/")
				validShape := (len(parts) == 1 || len(parts) == 2) && parts[0] != ""
				if len(parts) == 2 && parts[1] == "" {
					validShape = false
				}
				if !validShape {
					status = http.StatusNotFound
				} else if id, parseErr := strconv.ParseInt(parts[0], 10, 64); parseErr != nil || id <= 0 {
					status = http.StatusNotFound
				} else if meta, resolveErr := h.journalSEOProvider.ResolveByJournalID(id); resolveErr != nil {
					status = http.StatusServiceUnavailable
				} else if meta == nil {
					// seo_journals 只是曝光缓存，没有权威 on-miss resolver。合法 ID
					// 的首次直达仍交给 SPA/API 解析，同时去掉首页 canonical 并 noindex。
					modifiedHTML = ssrCanonRe.ReplaceAllString(modifiedHTML, "")
					modifiedHTML = setSSRNoindex(c, modifiedHTML)
				} else if meta.SEOInactive {
					status = http.StatusNotFound
				} else {
					canonical := canonicalJournalPath(meta)
					if canonical != "" && !canonicalMatchesRequest(canonical, requestPath) {
						c.Redirect(http.StatusMovedPermanently, canonical)
						return
					}
					renderPath := requestPath
					if canonical != "" {
						renderPath = canonical
					}
					modifiedHTML = injectJournalSEOMeta(modifiedHTML, meta, renderPath)
					if !meta.SEOIndexable || meta.JournalID <= 0 || meta.CanonicalName == "" {
						modifiedHTML = setSSRNoindex(c, modifiedHTML)
					}
				}
			}
		}
	}

	// 期刊枢纽页(发现层)SSR:/journals/browse | category/{slug}[/{page}] |
	// country/{cc}[/{page}] | warning | oa[/{page}]。exact-match 的 /journals/search
	// 与四个榜单页已被 staticPageSEO 分支 handled,不会进到这里;其余 /journals/*
	// 未命中枢纽形状时不置 handled,落到统一 404。
	// 🔴 刻意可索引:路径式真分页每页是独立稳定落地页,「?page 参数态 noindex」的
	// 全站约定不适用于此(详见 handler_ssr_journal_hubs.go 头注)。
	if !handled && strings.HasPrefix(requestPath, "/journals/") {
		route, hubRedirect := parseJournalHubPath(requestPath)
		if hubRedirect != "" {
			c.Redirect(http.StatusMovedPermanently, hubRedirect)
			return
		}
		if route != nil {
			handled = true
			modifiedHTML, status = h.injectJournalHubSSR(modifiedHTML, route)
		}
	}

	// `/tools/skills` 是独立静态公开页，已由 staticPageSEO 分支处理，不能再当工具 slug。
	if !handled && strings.HasPrefix(requestPath, "/tools/") {
		handled = true
		if h.toolSEOProvider == nil {
			status = http.StatusServiceUnavailable
		} else {
			rest := strings.TrimPrefix(requestPath, "/tools/")
			if rest == "" || strings.Contains(rest, "/") {
				status = http.StatusNotFound
			} else {
				meta, resolveErr := h.toolSEOProvider.ResolveToolBySlug(rest)
				// MySQL 常用 collation 不区分大小写；这里仍给严格 provider 一个 lowercase 回退，
				// 从而 `/tools/Python` 能稳定找到权威 slug 并 301，而不是误报 404。
				if resolveErr == nil && meta == nil && rest != strings.ToLower(rest) {
					meta, resolveErr = h.toolSEOProvider.ResolveToolBySlug(strings.ToLower(rest))
				}
				switch {
				case resolveErr != nil:
					status = http.StatusServiceUnavailable
				case meta == nil || meta.Slug == "":
					status = http.StatusNotFound
				default:
					canonical := "/tools/" + url.PathEscape(meta.Slug)
					if !canonicalMatchesRequest(canonical, requestPath) {
						c.Redirect(http.StatusMovedPermanently, canonical)
						return
					}
					modifiedHTML = injectToolSEOMeta(modifiedHTML, meta, canonical)
					if !meta.SEOIndexable {
						modifiedHTML = setSSRNoindex(c, modifiedHTML)
					}
				}
			}
		}
	}

	if requestPath == "/news" || strings.HasPrefix(requestPath, "/news/") {
		handled = true
		var redirectTo string
		modifiedHTML, status, redirectTo = h.injectNewsSSR(modifiedHTML, requestPath)
		if redirectTo != "" {
			c.Redirect(http.StatusMovedPermanently, redirectTo)
			return
		}
	}

	if !handled {
		status = http.StatusNotFound
	}
	if status != http.StatusOK {
		writeSSRStatusPage(c, pageHTML, status)
		return
	}

	// 带检索/筛选/分页参数的结果状态不是稳定落地页：统一 canonical 到干净入口并 noindex，
	// 避免 canonical 指向参数 URL、robots 又要求不索引的冲突组合。
	if c.Request.URL.RawQuery != "" && isParameterizedSearchRoute(requestPath) {
		modifiedHTML = setSSRNoindex(c, modifiedHTML)
	}

	// GSC HTML-tag 站点验证:env GOOGLE_SITE_VERIFICATION 非空时注入到每个 SSR 页
	// (验证只需首页,但全页注入无害且省一个路径判断)。DNS TXT 验证时留空即可。
	if token := appconfig.GoogleSiteVerification(); token != "" {
		tag := fmt.Sprintf(`<meta name="google-site-verification" content="%s" />`, htmlEscape(token))
		modifiedHTML = strings.Replace(modifiedHTML, "</head>", tag+"\n</head>", 1)
	}
	modifiedHTML = markSSRSEOHead(modifiedHTML)
	writeSSRHTML(c, http.StatusOK, modifiedHTML)
}

// canonicalMatchesRequest 判断编码域 canonical(PathEscape 产物)与 requestPath 是否指同一资源。
// c.Request.URL.Path 是【已解码】形态,直接与 PathEscape 后的 canonical 比较,任何含转义字符
// (中文/空格等)的 slug/ID 都永不相等 → 301 指向自身编码形态、下一跳解码后再 301,无限自我
// 重定向(2026-08-10 news 全量 1055 篇中文 slug 线上事故)。比较统一回解码域做;
// canonical(编码域)只用于输出(Location 头 / canonical link)。
func canonicalMatchesRequest(canonical, requestPath string) bool {
	if canonical == requestPath {
		return true
	}
	dec, err := url.PathUnescape(canonical)
	return err == nil && dec == requestPath
}

func canonicalPaperPath(meta *seo.PaperSSRMeta) string {
	if meta == nil || !seo.IsCanonicalSource(meta.Source) || meta.PaperID == "" {
		return ""
	}
	return "/paper/" + url.PathEscape(meta.Source) + "/" + url.PathEscape(meta.PaperID)
}

func canonicalAuthorPath(meta *seo.AuthorSSRMeta) string {
	if meta == nil || !seo.IsCanonicalSource(meta.Source) || meta.AuthorID == "" {
		return ""
	}
	return "/author/" + url.PathEscape(meta.Source) + "/" + url.PathEscape(meta.AuthorID)
}

func isParameterizedSearchRoute(path string) bool {
	switch path {
	case "/search", "/journals/search", "/tools", "/tools/skills",
		// 2026-08-10 审计:四个期刊榜单页复用搜索结果组件,会产生真实可爬的 ?page=N
		// 分页 URL,此前只有 canonical 收敛(提示非指令)没有 noindex —— 一并纳入,
		// 参数态统一 200+noindex+canonical 收敛的受控形态。
		"/journals/sci-q1", "/journals/cas-zone1", "/journals/ccf-a", "/journals/high-impact-factor":
		return true
	default:
		return false
	}
}

func setSSRNoindex(c *gin.Context, html string) string {
	c.Header("X-Robots-Tag", "noindex, follow")
	return injectNoindex(html)
}

// markSSRSEOHead 标记由服务端提供、随后可被 React RouteSEO 临时接管的基础 SEO 标签。
// OG/Twitter/JSON-LD 不属于 RouteSEO 的所有权，刻意不标记。
func markSSRSEOHead(html string) string {
	mark := func(tag string) string {
		if ssrFallbackAttrRe.MatchString(tag) {
			return ssrFallbackAttrRe.ReplaceAllString(tag, `data-seo-fallback="server"`)
		}
		lower := strings.ToLower(tag)
		for _, prefix := range []string{"<title", "<meta", "<link"} {
			if strings.HasPrefix(lower, prefix) {
				return tag[:len(prefix)] + ` data-seo-fallback="server"` + tag[len(prefix):]
			}
		}
		return tag
	}
	for _, re := range []*regexp.Regexp{ssrTitleRe, ssrDescRe, ssrKeywordsRe, ssrCanonRe, ssrRobotsRe} {
		html = re.ReplaceAllStringFunc(html, mark)
	}
	return html
}

// writeSSRHTML 是**所有** SSR 响应的唯一写出口(200 走 :541,4xx/5xx 走 :638)。
//
// 🔴 环境级 noindex 就钉在这里,而不是逐个页面分支加。理由:SSR 有实体页、内容页、
// 静态品牌页、软 404、503 一堆分支,逐个加必然漏,而且以后新增分支的人不会知道要加。
// 出口只有一个,钉在出口上就是全覆盖。
//
// 注入的 robots meta **刻意不带** data-seo-fallback="server" 标记 ——
// 带了会被前端 RouteSEO 在 useLayoutEffect 里当成"服务端兜底"移除掉
// (见 markSSRSEOHead),那样会跑 JS 的爬虫就重新看到一个可索引的页面。
func writeSSRHTML(c *gin.Context, status int, html string) {
	if !appconfig.RequestIndexable(c.Request.Host) {
		// nofollow 而非 follow:非权威环境的站内链接指向的也是本环境的副本,
		// 让爬虫顺着爬下去只会把整份重复内容都发现一遍。
		c.Header("X-Robots-Tag", "noindex, nofollow")
		html = upsertHeadTag(html, ssrRobotsRe, `<meta name="robots" content="noindex,nofollow">`)
	}
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Header("Cache-Control", "no-cache, must-revalidate")
	c.String(status, html)
}

func writeSSRStatusPage(c *gin.Context, shell string, status int) {
	title := "页面不存在 | Scholay 学术"
	desc := "抱歉，你访问的页面不存在。"
	heading := "页面不存在"
	message := "请检查网址，或返回 Scholay 学术首页继续浏览。"
	if status == http.StatusServiceUnavailable {
		title = "服务暂时不可用 | Scholay 学术"
		desc = "服务暂时不可用，请稍后重试。"
		heading = "服务暂时不可用"
		message = "数据服务正在恢复，请稍后重试。"
		c.Header("Retry-After", "60")
	}
	if shell == "" {
		shell = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Scholay 学术</title><meta name="description" content=""></head><body><div id="root"></div></body></html>`
	}
	html := prepareSSRPageShell(shell)
	html = ssrCanonRe.ReplaceAllString(html, "")
	html = replaceSSRTitleDescCanon(html, title, desc, "")
	html = injectNoindex(html)
	html = insertNoscriptBlock(html, fmt.Sprintf(`<section %s><h1 %s>%s</h1><p %s>%s</p><p><a href="/">返回首页</a></p></section>`, ssrBaseStyle, ssrHeadingTight, heading, ssrTextStyle, message))
	html = markSSRSEOHead(html)
	c.Header("X-Robots-Tag", "noindex, nofollow")
	writeSSRHTML(c, status, html)
}

// canonicalRedirectFor 检查请求路径是不是 legacy /paper/{slug} 或 /author/{slug},
// 若能反查到 source + entityID,返回 canonical 路径(供 301 跳转);
// 否则返回 "" 表示无需重定向。
//
// 调用方在拿到 HTML 之前调,所以 200 的 SSR 路径不会被 301 截掉。
// query string + raw path 一并保留 —— 用户可能从带 utm 的链接进来。
func (h *Handler) canonicalRedirectFor(requestPath string) string {
	switch requestPath {
	case "/journals":
		return "/journals/search"
	case "/features/latex-writer":
		return "/features/prism"
	case "/skills":
		return "/tools/skills"
	case "/qa":
		return "/help"
	}
	// /paper/{slug}
	if h.paperSEOProvider != nil && strings.HasPrefix(requestPath, "/paper/") {
		rest := strings.TrimPrefix(requestPath, "/paper/")
		if rest != "" && !strings.Contains(rest, "/") {
			if meta, err := h.paperSEOProvider.ResolveSlug(rest); err == nil && meta != nil && !meta.SEOInactive {
				if canonical := canonicalPaperPath(meta); canonical != "" {
					return canonical
				}
			}
		}
	}
	// /author/{slug}
	if h.authorSEOProvider != nil && strings.HasPrefix(requestPath, "/author/") {
		rest := strings.TrimPrefix(requestPath, "/author/")
		if rest != "" && !strings.Contains(rest, "/") {
			if meta, err := h.authorSEOProvider.ResolveAuthorSlug(rest); err == nil && meta != nil && !meta.SEOInactive {
				if canonical := canonicalAuthorPath(meta); canonical != "" {
					return canonical
				}
			}
		}
	}
	// Journal canonicalization is intentionally performed in ServeIndexHTML after
	// its single resolver call. Keeping it here as well doubles the DB query for
	// every journal request and makes cache-miss status handling ambiguous.
	return ""
}

// canonicalJournalPath 用 meta 拼 canonical 路径(编码域,供输出;比较走 canonicalMatchesRequest)
//   - 有 slug → /journal/{id}/{slug}(slug 经 PathEscape:CJK 期刊名 canonical/og:url
//     必须输出 percent-encoded 形态,与 sitemap loc 同口径)
//   - 无 slug → /journal/{id} (永远不需要 301)
func canonicalJournalPath(meta *seo.JournalSSRMeta) string {
	if meta == nil || meta.JournalID <= 0 {
		return ""
	}
	idStr := strconv.FormatInt(meta.JournalID, 10)
	if meta.Slug != "" {
		return "/journal/" + idStr + "/" + url.PathEscape(meta.Slug)
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
	// 2026-08-10 审计:此前 publisher 硬编码「Scholay学术」—— 对 29.6k 论文页规模化断言
	// 虚假出版商(IEEE 的论文也标 Scholay),违反 Google 结构化数据「内容必须准确」准则。
	// ScholarlyArticle 的 publisher 应为论文真实出版商(数据侧暂无该字段,故整个省略 ——
	// Article 类 publisher 非必填);Scholay 的站点级 publisher 角色由壳里的
	// WebSite→Organization @graph 承载,不在作品实体上冒名。期刊归属仍由 isPartOf 表达。
	obj := map[string]any{
		"@context": "https://schema.org",
		"@type":    "ScholarlyArticle",
		"headline":  truncate(meta.Title, 110),
		"name":      meta.Title,
		"url":       canonical,
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

// buildJournalJSONLD —— Periodical(刊名/出版商/ISSN/封面)
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
	// 中文刊名(wikidata)作为 alternateName:中文 SERP 的实体对齐信号。
	if meta.WikidataLabelZH != "" && meta.WikidataLabelZH != meta.CanonicalName {
		obj["alternateName"] = meta.WikidataLabelZH
	}
	if meta.Publisher != "" {
		obj["publisher"] = map[string]any{"@type": "Organization", "name": meta.Publisher}
	}
	if len(meta.ISSNs) > 0 {
		obj["issn"] = meta.ISSNs
	}
	// 封面图(0125 cover_url):仅接受 http(s) 外链,与工具 logo 同口径走 safeHTTPURL。
	if img := safeHTTPURL(meta.CoverURL); img != "" {
		obj["image"] = img
	}
	return jsonLDScript(obj)
}

// SSR 注入用的正则在包级编译一次。原先每个 inject{Paper,Author,Journal,Tool}SEOMeta
// 在函数体内 regexp.MustCompile 同样的模式，而 ServeIndexHTML 对每个爬虫请求都会跑一次注入，
// 等于每请求重编译；提到包级 var 后只在 init 编译一次。
var (
	ssrTitleRe        = regexp.MustCompile(`(?is)<title\b[^>]*>.*?</title>`)
	ssrDescRe         = regexp.MustCompile(`(?is)<meta\b[^>]*\bname=["']description["'][^>]*>`)
	ssrKeywordsRe     = regexp.MustCompile(`(?is)<meta\b[^>]*\bname=["']keywords["'][^>]*>`)
	ssrCanonRe        = regexp.MustCompile(`(?is)<link\b[^>]*\brel=["']canonical["'][^>]*>`)
	ssrBodyTagRe      = regexp.MustCompile(`(?i)(<body[^>]*>)`)
	ssrNoscriptRe     = regexp.MustCompile(`(?is)<noscript\b[^>]*>.*?</noscript>`)
	ssrEmptyRootRe    = regexp.MustCompile(`(?is)<div[^>]*\bid=["']root["'][^>]*>\s*</div>`)
	ssrFallbackAttrRe = regexp.MustCompile(`(?i)data-seo-fallback=["'][^"']*["']`)
	// Open Graph 标签(社媒分享卡片)。壳里硬编码成首页值,实体页必须改写成本页的 url/title/desc,
	// 否则 facebook/twitter/linkedin/whatsapp 抓取分享链接时会全部塌缩成首页卡片。
	ssrOgTitleRe = regexp.MustCompile(`(?is)<meta\b[^>]*\bproperty=["']og:title["'][^>]*>`)
	ssrOgURLRe   = regexp.MustCompile(`(?is)<meta\b[^>]*\bproperty=["']og:url["'][^>]*>`)
	ssrOgDescRe  = regexp.MustCompile(`(?is)<meta\b[^>]*\bproperty=["']og:description["'][^>]*>`)
	ssrOgTypeRe  = regexp.MustCompile(`(?is)<meta\b[^>]*\bproperty=["']og:type["'][^>]*>`)
	ssrOgImageRe = regexp.MustCompile(`(?is)<meta\b[^>]*\bproperty=["']og:image["'][^>]*>`)
	// Twitter Card 壳里同样硬编码首页值,与 og:* 一并按页改写(否则 X / 偏好 twitter:* 的 AI 爬虫
	// 对每个不同详情页都显示同一张首页卡)。
	ssrTwTitleRe = regexp.MustCompile(`(?is)<meta\b[^>]*\bname=["']twitter:title["'][^>]*>`)
	ssrTwDescRe  = regexp.MustCompile(`(?is)<meta\b[^>]*\bname=["']twitter:description["'][^>]*>`)
	ssrTwImageRe = regexp.MustCompile(`(?is)<meta\b[^>]*\bname=["']twitter:image["'][^>]*>`)
	// robots meta —— 实体路径解析不到实体时打 noindex,阻止无界失效/伪造 ID 形成软 404 重复面。
	ssrRobotsRe = regexp.MustCompile(`(?is)<meta\b[^>]*\bname=["']robots["'][^>]*>`)
)

// upsertHeadTag 若 re 命中则整段替换为 tag,否则把 tag 插在 </head> 前。
// SSR 注入统一走它,消除各处「MatchString ? Replace : 插 </head>」重复。
func upsertHeadTag(html string, re *regexp.Regexp, tag string) string {
	if re.MatchString(html) {
		return replaceRegexpLiteral(re, html, tag)
	}
	return strings.Replace(html, "</head>", tag+"\n</head>", 1)
}

// regexp.ReplaceAllString interprets `$1` and `$name` in its replacement.
// Titles, abstracts and canonical URLs are data, not replacement templates;
// a perfectly ordinary title such as "Cost is $E$" must remain byte-for-byte
// intact after HTML escaping. ReplaceAllStringFunc returns the tag literally.
func replaceRegexpLiteral(re *regexp.Regexp, input, replacement string) string {
	return re.ReplaceAllStringFunc(input, func(string) string { return replacement })
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
//
//	列表/落地/枢纽页传 "website";空串则不写 og:type。
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

// prepareSSRPageShell 移除 Vite 壳里全站通用的 noscript 品牌正文。公开路由由后端
// 给普通用户和爬虫返回同一份初始 HTML，路由正文随后写进 #root；保留这段会制造
// 第二个 H1，并让每个详情页重复首页文字。
func prepareSSRPageShell(html string) string {
	return ssrNoscriptRe.ReplaceAllString(html, "")
}

// ssrSiteNavHTML 全站栏目导航,统一追加在每个 SSR 静态兜底正文尾部(insertNoscriptBlock)。
// 2026-08-10 审计:首页兜底正文 0 出链、实体/文章详情页 0 内链、4 个列表页 0 入链 ——
// 对不渲染 JS 的引擎(百度/搜狗)整站链接图断裂,发现与权重传递只剩 sitemap 单通道。
// 这一块让每个 SSR 页都成为链接图节点:任意页导出到各列表枢纽,爬虫沿列表页可发现
// 全部内容。React 接管 #root 后此块不再显示,不影响真实用户 UI。
var ssrSiteNavHTML = buildSSRSiteNav()

// ssrSiteNavLinks 导航条目。路径必须存在于 seo.StaticPages 注册表(或为 /news hub)——
// 有测试钉住这层约束,防止路由改名后这里残留全站性的 301/404 死链。
var ssrSiteNavLinks = [][2]string{
	{"/search", "论文搜索"},
	{"/journals/search", "期刊检索"},
	{"/news", "学术情报"},
	{"/blog", "Scholay 博客"},
	{"/resources", "学术资源"},
	{"/help", "学术问答"},
	{"/features", "全部功能"},
	{"/tools", "功能广场"},
	{"/journals/sci-q1", "SCI 一区期刊"},
	{"/journals/cas-zone1", "中科院一区期刊"},
	{"/journals/ccf-a", "CCF A 类期刊"},
	{"/journals/high-impact-factor", "高影响因子期刊"},
	{"/pricing", "会员定价"},
	{"/about", "关于 Scholay"},
}

func buildSSRSiteNav() string {
	links := ssrSiteNavLinks
	var b strings.Builder
	b.WriteString(`<nav data-ssr-nav="true" aria-label="站点栏目" ` + ssrNavStyle + `><ul ` + ssrNavListStyle + `>`)
	for i, l := range links {
		if i > 0 {
			b.WriteString(` <li style="display: inline;">·</li> `)
		}
		fmt.Fprintf(&b, `<li style="display: inline;"><a href="%s" style="color: #505059; text-decoration: none;">%s</a></li>`, l[0], l[1])
	}
	b.WriteString(`</ul></nav>`)
	return b.String()
}

// insertNoscriptBlock 保留历史函数名以减少调用面，但正文已不再放在 noscript。
// 它把可见静态 fallback 直接写入 #root；浏览器拿到首包即可显示真实路由正文，
// React createRoot 随后替换该内容。搜索引擎与普通用户因此观察同一份初始 HTML。
// 每个静态兜底正文尾部统一带全站栏目导航(见 ssrSiteNavHTML)。
func insertNoscriptBlock(html, innerHTML string) string {
	if innerHTML == "" {
		return html
	}
	// 结构:main(测试钉死的裸标记)> 画布 div(米白底+字体)> 品牌头 + 正文卡片 + 栏目导航。
	// ⚠️ <main data-ssr-static="true"> 必须保持这个精确形态(handler_ssr_routing_test 钉死),
	// 画布样式只能放内层 div。
	block := `<main data-ssr-static="true">` + "\n" +
		`<div data-ssr-canvas="true" ` + ssrCanvasStyle + `>` + "\n" +
		ssrBrandHeaderHTML + "\n" + innerHTML + "\n" + ssrSiteNavHTML + "\n" +
		`</div>` + "\n</main>"
	if loc := ssrEmptyRootRe.FindStringIndex(html); loc != nil {
		root := html[loc[0]:loc[1]]
		if openEnd := strings.Index(root, ">"); openEnd >= 0 {
			replacement := root[:openEnd+1] + "\n" + block + "\n</div>"
			return html[:loc[0]] + replacement + html[loc[1]:]
		}
	}
	if idx := strings.LastIndex(html, "</body>"); idx >= 0 {
		return html[:idx] + block + "\n" + html[idx:]
	}
	return html + "\n" + block
}

func appendSSRStaticContent(html, innerHTML string) string {
	if innerHTML == "" {
		return html
	}
	// 画布改造后正文都在 <div data-ssr-canvas> 内:追加内容必须落在栏目导航之前、
	// 画布之内 —— 插到 </main> 前会掉到画布外面变成白底裸文。
	if idx := strings.Index(html, `<nav data-ssr-nav`); idx >= 0 {
		return html[:idx] + innerHTML + "\n" + html[idx:]
	}
	if idx := strings.Index(html, "</main>"); idx >= 0 {
		return html[:idx] + "\n" + innerHTML + "\n" + html[idx:]
	}
	return insertNoscriptBlock(html, innerHTML)
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
	//
	// 2026-08-10 审计收紧:① 上游(OpenAlex 等)标题自带的尾部省略号先剥掉,否则
	// truncate 再补 "..." 会出现「...NU... - 论文详情」双截断;② 标题段 100→70 rune ——
	// 叠加固定后缀后整条 <title> 曾达 141 字符,SERP 只展示 ~60 字符,超长部分纯粹
	// 稀释关键词权重。H1 与 JSON-LD headline 保留完整标题,不受影响。
	venueYear := buildPaperVenueSegment(meta)
	if venueYear != "" {
		venueYear = " (" + venueYear + ")"
	}
	seoTitle := fmt.Sprintf("%s - 论文详情%s | Scholay 学术搜索", truncate(stripTrailingEllipsis(title), 70), venueYear)

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
	html = replaceRegexpLiteral(titleRe, html, "<title>"+htmlEscape(seoTitle)+"</title>")

	// 2) 替换 <meta name="description" ...>（若不存在则跳过，不主动插入以免破坏已有结构）
	descRe := ssrDescRe
	if descRe.MatchString(html) {
		html = replaceRegexpLiteral(descRe, html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}

	// 2.5) 替换 <meta name="keywords"> —— 论文场景词 + 标题中的关键名词作为长尾
	keywords := buildPaperKeywords(meta)
	keywordsRe := ssrKeywordsRe
	if keywordsRe.MatchString(html) {
		html = replaceRegexpLiteral(keywordsRe, html, fmt.Sprintf(`<meta name="keywords" content="%s">`, htmlEscape(keywords)))
	}

	// 3) 追加 canonical 链接（若 head 里已有则替换）
	// 域名由 SEO_BASE_URL 环境变量控制，默认 https://www.scholay.com。
	// 必须和 sitemap <loc> 前缀保持一致，否则爬虫会把 sitemap 里的 URL 当 duplicate 忽略。
	canonical := fmt.Sprintf("%s%s", appconfig.CanonicalBaseURL(), path)
	canonRe := ssrCanonRe
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if canonRe.MatchString(html) {
		html = replaceRegexpLiteral(canonRe, html, canonTag)
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
	if authorsHTML := buildPaperAuthorsHTML(meta); authorsHTML != "" {
		metaLines = append(metaLines, "作者："+authorsHTML)
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

// buildPaperAuthorsHTML 论文卡片的作者列表:有 AuthorID 的渲染成 /author/{source}/{id}
// 内链(与 SPA PaperHeader 的可点作者同一映射,paper.Source 即作者 ID 的来源空间),
// 其余纯文本。2026-08-10 审计:论文/作者/期刊详情页 SSR HTML 内链数为 0,~2.5 万
// 实体页对不渲染 JS 的爬虫(百度/搜狗)是零出链孤岛 —— 作者内链让权重在
// 论文↔作者间流动,爬虫可沿链接发现作者页。
func buildPaperAuthorsHTML(meta *seo.PaperSSRMeta) string {
	// 超长作者列表只链前 12 位,避免兜底正文膨胀成链接农场。
	const maxLinked = 12
	canLink := seo.IsCanonicalSource(meta.Source)
	names := meta.Authors
	refs := meta.AuthorRefs
	if len(refs) == 0 && len(names) == 0 {
		return ""
	}
	if len(refs) == 0 {
		// 旧行只有名字列表:保持原纯文本行为。
		return htmlEscape(strings.Join(names, ", "))
	}
	parts := make([]string, 0, len(refs))
	linked := 0
	for _, au := range refs {
		if au.Name == "" {
			continue
		}
		name := htmlEscape(au.Name)
		if canLink && au.AuthorID != "" && linked < maxLinked {
			href := "/author/" + url.PathEscape(meta.Source) + "/" + url.PathEscape(au.AuthorID)
			parts = append(parts, fmt.Sprintf(`<a href="%s">%s</a>`, htmlEscape(href), name))
			linked++
		} else {
			parts = append(parts, name)
		}
	}
	return strings.Join(parts, ", ")
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
	html = replaceRegexpLiteral(titleRe, html, "<title>"+htmlEscape(seoTitle)+"</title>")

	descRe := ssrDescRe
	if descRe.MatchString(html) {
		html = replaceRegexpLiteral(descRe, html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}

	// keywords meta —— 作者场景高频词 + 个人元数据
	keywords := buildAuthorKeywords(meta)
	keywordsRe := ssrKeywordsRe
	if keywordsRe.MatchString(html) {
		html = replaceRegexpLiteral(keywordsRe, html, fmt.Sprintf(`<meta name="keywords" content="%s">`, htmlEscape(keywords)))
	}

	canonical := fmt.Sprintf("%s%s", appconfig.CanonicalBaseURL(), path)
	canonRe := ssrCanonRe
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if canonRe.MatchString(html) {
		html = replaceRegexpLiteral(canonRe, html, canonTag)
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
	return buildWorksListHTML("代表论文", works)
}

// buildWorksListHTML 论文精简列表的通用渲染(作者代表作 / 期刊近期论文共用):
// 每条尽量带 <a href> 内链到 canonical 论文页 —— 实体间真实链接是爬虫发现与
// 权重传递的载体(2026-08-10 审计:期刊页此前 0 实体内链)。
func buildWorksListHTML(heading string, works []seo.AuthorWork) string {
	if len(works) == 0 {
		return ""
	}
	subHeadStyle := ssrSubHeadStyle
	listStyle := ssrListStyle
	var b strings.Builder
	fmt.Fprintf(&b, "<h2 %s>%s</h2><ul %s>", subHeadStyle, htmlEscape(heading), listStyle)
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

// injectJournalSEOMeta 期刊详情页 SEO 注入 (与 paper / author 同构)。
// 2026-08-11 全量摄取:title/desc 改指标矩阵模板(预警刊必须在两者中体现 ——
// 「XX期刊 预警」是高价值搜索词),head 增补 FAQPage 与 BreadcrumbList JSON-LD。
func injectJournalSEOMeta(html string, meta *seo.JournalSSRMeta, path string) string {
	if meta.CanonicalName == "" {
		return html
	}

	seoTitle := buildJournalTitle(meta)
	desc := buildJournalDesc(meta)

	titleRe := ssrTitleRe
	html = replaceRegexpLiteral(titleRe, html, "<title>"+htmlEscape(seoTitle)+"</title>")

	descRe := ssrDescRe
	if descRe.MatchString(html) {
		html = replaceRegexpLiteral(descRe, html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}

	keywords := buildJournalKeywords(meta)
	keywordsRe := ssrKeywordsRe
	if keywordsRe.MatchString(html) {
		html = replaceRegexpLiteral(keywordsRe, html, fmt.Sprintf(`<meta name="keywords" content="%s">`, htmlEscape(keywords)))
	}

	// canonical 永远指向当前 path —— canonicalRedirectFor 已经把非 canonical 的路径 301 走了
	canonical := fmt.Sprintf("%s%s", appconfig.CanonicalBaseURL(), path)
	canonRe := ssrCanonRe
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if canonRe.MatchString(html) {
		html = replaceRegexpLiteral(canonRe, html, canonTag)
	} else {
		html = strings.Replace(html, "</head>", canonTag+"\n</head>", 1)
	}

	if jsonLD := buildJournalJSONLD(meta, canonical); jsonLD != "" {
		html = strings.Replace(html, "</head>", jsonLD+"\n</head>", 1)
	}
	// FAQPage:字段生成的常见问题(无数据的问题不出;全部无数据则整块不出)。
	if faqLD := buildJournalFAQJSONLD(meta); faqLD != "" {
		html = strings.Replace(html, "</head>", faqLD+"\n</head>", 1)
	}
	// BreadcrumbList:首页 > 期刊 > 大类枢纽 > 本刊(大类缺失时跳过第三级)。
	if bcLD := buildJournalBreadcrumbJSONLD(meta, canonical); bcLD != "" {
		html = strings.Replace(html, "</head>", bcLD+"\n</head>", 1)
	}

	html = injectOG(html, seoTitle, canonical, desc, "website")
	html = insertNoscriptBlock(html, buildJournalNoscriptCard(meta))

	return html
}

// buildJournalTitle 标题模板(spec):《name》影响因子X·JCR Qx·中科院X区(year) - 期刊详情。
// 预警刊在段首插「N年预警」—— title 必须可命中「XX期刊 预警」检索词。
// 指标全缺(有机曝光的老行)回落旧「name (publisher) - 期刊详情」形态,不硬凑空段。
func buildJournalTitle(meta *seo.JournalSSRMeta) string {
	var segs []string
	if meta.GJQKWarningLevel != "" {
		seg := "预警期刊"
		if meta.GJQKYear > 0 {
			seg = fmt.Sprintf("%d年预警期刊", meta.GJQKYear)
		}
		segs = append(segs, seg)
	}
	if meta.JCRImpactFactor > 0 {
		segs = append(segs, fmt.Sprintf("影响因子%.1f", meta.JCRImpactFactor))
	}
	if meta.JCRQuartile != "" {
		segs = append(segs, "JCR "+meta.JCRQuartile)
	}
	if meta.FQBMajorQuartile != "" {
		seg := "中科院" + meta.FQBMajorQuartile + "区"
		if meta.FQBTop {
			seg += "Top"
		}
		if meta.FQBYear > 0 {
			seg += fmt.Sprintf("(%d)", meta.FQBYear)
		}
		segs = append(segs, seg)
	}
	name := truncate(meta.CanonicalName, 60)
	if len(segs) == 0 {
		publisherSeg := ""
		if meta.Publisher != "" {
			publisherSeg = " (" + truncate(meta.Publisher, 40) + ")"
		}
		return fmt.Sprintf("%s%s - 期刊详情 | Scholay 学术搜索", name, publisherSeg)
	}
	return fmt.Sprintf("《%s》%s - 期刊详情 | Scholay 学术搜索", name, strings.Join(segs, "·"))
}

// buildJournalDesc 描述(spec:指标浓缩 + 预警状态 + 投稿参考,120-160 字截断)。
func buildJournalDesc(meta *seo.JournalSSRMeta) string {
	var parts []string
	if meta.WikidataLabelZH != "" && meta.WikidataLabelZH != meta.CanonicalName {
		parts = append(parts, "中文名《"+meta.WikidataLabelZH+"》")
	}
	if meta.Publisher != "" {
		parts = append(parts, "由 "+meta.Publisher+" 出版")
	}
	if meta.JCRImpactFactor > 0 {
		seg := fmt.Sprintf("最新影响因子 %.1f", meta.JCRImpactFactor)
		if meta.JCRQuartile != "" {
			seg += "(JCR " + meta.JCRQuartile + ")"
		}
		parts = append(parts, seg)
	} else if meta.JCRQuartile != "" {
		parts = append(parts, "JCR "+meta.JCRQuartile)
	}
	if meta.FQBMajorQuartile != "" {
		seg := "中科院"
		if meta.FQBMajorCategory != "" {
			seg += meta.FQBMajorCategory
		}
		seg += meta.FQBMajorQuartile + "区"
		if meta.FQBTop {
			seg += "(Top)"
		}
		parts = append(parts, seg)
	}
	// 预警状态必须进 desc(与 title 同理)。
	if meta.GJQKWarningLevel != "" {
		seg := "注意:已列入"
		if meta.GJQKYear > 0 {
			seg += fmt.Sprintf("%d年", meta.GJQKYear)
		}
		seg += "国际期刊预警名单(" + meta.GJQKWarningLevel + ")"
		parts = append(parts, seg)
	}
	// 投稿参考浓缩。
	if meta.FirstReviewMonths > 0 {
		parts = append(parts, fmt.Sprintf("审稿周期约 %.1f 个月", meta.FirstReviewMonths))
	}
	if meta.IsOA || meta.IsInDOAJ {
		parts = append(parts, "开放获取(OA)")
	}
	if meta.HasLatex {
		parts = append(parts, "提供 LaTeX 投稿模板")
	}

	var desc string
	if len(parts) > 0 {
		desc = fmt.Sprintf("%s:%s。查看逐年趋势、同学科期刊与投稿参考 — Scholay 学术。",
			meta.CanonicalName, strings.Join(parts, ","))
	} else {
		desc = fmt.Sprintf("%s 期刊详情与近期发表 — Scholay 整合 JCR、SCImago、CCF、OpenAlex 多源期刊数据,提供分区、影响因子、ISSN、出版商等元数据。", meta.CanonicalName)
	}
	// spec 定 120-160 字:比旧 300 上限严,超长在「投稿参考」段自然截断。
	return truncate(desc, 160)
}

// buildJournalKeywords 期刊页 keywords meta
func buildJournalKeywords(meta *seo.JournalSSRMeta) string {
	parts := []string{
		meta.CanonicalName,
		"期刊详情", "期刊分区", "影响因子", "JCR", "SCImago", "CCF", "OpenAlex",
		"ISSN 查询", "期刊出版商", "学术期刊", "Scholay",
		"journal", "academic journal", "impact factor", "journal quartile",
	}
	// 中文刊名 + 高价值组合词(「XX期刊 预警」「XX 影响因子」是真实检索形态)。
	if meta.WikidataLabelZH != "" && meta.WikidataLabelZH != meta.CanonicalName {
		parts = append(parts, meta.WikidataLabelZH)
	}
	if meta.GJQKWarningLevel != "" {
		parts = append(parts, meta.CanonicalName+" 预警", "期刊预警", "国际期刊预警名单")
	}
	if meta.FQBMajorCategory != "" {
		parts = append(parts, meta.FQBMajorCategory+"期刊", "中科院分区")
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

// buildJournalNoscriptCard 渲染期刊的 SSR 正文卡片(普通用户与爬虫的同一份初始 HTML)。
// 2026-08-11 全量摄取:七区块模板,全部「有则渲染无则省略」——
// 面包屑 → 身份行 → ①指标矩阵 → ②预警提示 → ③逐年趋势文字化 → ④投稿参考
// → ⑤同学科推荐(内链) → ⑥FAQ 可见区块(JSON-LD 同源) → 近期代表论文。
func buildJournalNoscriptCard(meta *seo.JournalSSRMeta) string {
	baseStyle := ssrBaseStyle
	headingStyle := ssrHeadingStyle

	name := htmlEscape(meta.CanonicalName)

	// 可见面包屑(与 BreadcrumbList JSON-LD 同构):每刊入链保障的一环 ——
	// 详情页 → 大类枢纽的反向链接让爬虫从任意详情页发现枢纽层。
	breadcrumb := fmt.Sprintf(`<p %s><a href="/" style="color: #882828;">首页</a> › <a href="/journals/browse" style="color: #882828;">期刊</a>`, ssrMetaStyle)
	if meta.FQBMajorCategory != "" {
		breadcrumb += fmt.Sprintf(` › <a href="%s" style="color: #882828;">%s</a>`,
			htmlEscape("/journals/category/"+seo.JournalCategorySlug(meta.FQBMajorCategory)), htmlEscape(meta.FQBMajorCategory))
	}
	breadcrumb += " › " + name + "</p>"

	// 身份行:中文名/出版商/ISSN/国家/类型/OA/创刊。
	var metaLines []string
	if meta.WikidataLabelZH != "" && meta.WikidataLabelZH != meta.CanonicalName {
		metaLines = append(metaLines, "中文名："+htmlEscape(meta.WikidataLabelZH))
	}
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
	if meta.Inception != "" {
		metaLines = append(metaLines, "创刊："+htmlEscape(meta.Inception))
	}
	if meta.IsOA || meta.IsInDOAJ {
		metaLines = append(metaLines, "OA 开放获取")
	}
	var metaHTML string
	if len(metaLines) > 0 {
		metaHTML = fmt.Sprintf("<p %s>%s</p>", ssrMetaStyle, strings.Join(metaLines, " · "))
	}

	blocks := []string{
		buildJournalWarningHTML(meta),      // 预警放最前:读者/爬虫第一眼要看到风险提示
		buildJournalMetricsMatrixHTML(meta),
		buildJournalTrendHTML(meta),
		buildJournalSubmitRefHTML(meta),
		buildJournalSameCategoryHTML(meta),
		buildJournalFAQHTML(meta),
		buildWorksListHTML("本刊近期代表论文", meta.RecentPapers),
	}
	var body strings.Builder
	for _, b := range blocks {
		if b != "" {
			body.WriteString("\n" + b)
		}
	}

	return fmt.Sprintf(`<article %s>
%s
<h1 %s>%s</h1>
%s%s
</article>`, baseStyle, breadcrumb, headingStyle, name, metaHTML, body.String())
}

// buildJournalWarningHTML ② 预警提示区块(gjqk 字段;非预警刊整块不出)。
func buildJournalWarningHTML(meta *seo.JournalSSRMeta) string {
	if meta.GJQKWarningLevel == "" {
		return ""
	}
	yearSeg := ""
	if meta.GJQKYear > 0 {
		yearSeg = fmt.Sprintf("%d年", meta.GJQKYear)
	}
	text := fmt.Sprintf("预警提示:本刊已列入%s《国际期刊预警名单》,预警等级:%s。", yearSeg, htmlEscape(meta.GJQKWarningLevel))
	if meta.GJQKWarningWhy != "" {
		text += "预警原因:" + htmlEscape(meta.GJQKWarningWhy) + "。"
	}
	text += "投稿前请谨慎评估。"
	// 朱砂色加边框:预警是本页最重要的事实,视觉上必须区别于普通段落。
	return fmt.Sprintf(`<p style="color: #882828; border: 1px solid #882828; padding: 10px 12px; line-height: 1.8; margin: 12px 0;"><strong>%s</strong></p>`, text)
}

// buildJournalMetricsMatrixHTML ① 指标矩阵区块(有哪项渲染哪项)。
func buildJournalMetricsMatrixHTML(meta *seo.JournalSSRMeta) string {
	var items []string
	if meta.JCRImpactFactor > 0 {
		label := "影响因子"
		if meta.JCRYear > 0 {
			label = fmt.Sprintf("影响因子(JCR %d)", meta.JCRYear)
		}
		items = append(items, fmt.Sprintf("%s:%.3f", label, meta.JCRImpactFactor))
	}
	if meta.JCRQuartile != "" {
		seg := "JCR 分区:" + htmlEscape(meta.JCRQuartile)
		if meta.JCRCategory != "" {
			seg += "(" + htmlEscape(meta.JCRCategory) + ")"
		}
		items = append(items, seg)
	}
	if meta.FQBMajorQuartile != "" {
		seg := "中科院分区"
		if meta.FQBYear > 0 {
			seg += fmt.Sprintf("(%d)", meta.FQBYear)
		}
		seg += ":"
		if meta.FQBMajorCategory != "" {
			seg += htmlEscape(meta.FQBMajorCategory) + " "
		}
		seg += htmlEscape(meta.FQBMajorQuartile) + "区"
		if meta.FQBTop {
			seg += "(Top)"
		}
		if meta.FQBSubcategory != "" && meta.FQBSubQuartile != "" {
			seg += ";小类:" + htmlEscape(meta.FQBSubcategory) + " " + htmlEscape(meta.FQBSubQuartile) + "区"
		}
		items = append(items, seg)
	}
	if meta.XRMajorQuartile != "" {
		seg := "新锐分区"
		if meta.XRYear > 0 {
			seg += fmt.Sprintf("(%d)", meta.XRYear)
		}
		seg += ":"
		if meta.XRMajorCategory != "" {
			seg += htmlEscape(meta.XRMajorCategory) + " "
		}
		seg += htmlEscape(meta.XRMajorQuartile) + "区"
		if meta.XRTop {
			seg += "(Top)"
		}
		items = append(items, seg)
	}
	if meta.SJR != "" {
		seg := "SJR:" + htmlEscape(meta.SJR)
		if meta.SJRBestQuartile != "" {
			seg += "(" + htmlEscape(meta.SJRBestQuartile) + ")"
		}
		items = append(items, seg)
	}
	if meta.CCFRank != "" {
		seg := "CCF:" + htmlEscape(meta.CCFRank) + " 类"
		if meta.CCFField != "" {
			seg += "(" + htmlEscape(meta.CCFField) + ")"
		}
		items = append(items, seg)
	}
	// 中性指标名:noscript 正文不带上游数据源名(与 desc 口径一致)。
	if meta.OpenAlexHIndex != nil && *meta.OpenAlexHIndex > 0 {
		items = append(items, fmt.Sprintf("h-index:%d", *meta.OpenAlexHIndex))
	} else if meta.ScimagoHIndex > 0 {
		items = append(items, fmt.Sprintf("h-index:%d", meta.ScimagoHIndex))
	}
	var volume []string
	if meta.WorksCount > 0 {
		volume = append(volume, fmt.Sprintf("载文量 %d", meta.WorksCount))
	}
	if meta.CitedByCount > 0 {
		volume = append(volume, fmt.Sprintf("总被引 %d", meta.CitedByCount))
	}
	if len(volume) > 0 {
		items = append(items, strings.Join(volume, " · "))
	}
	if len(items) == 0 {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "<h2 %s>核心指标</h2><ul %s>", ssrSubHeadStyle, ssrListStyle)
	for _, it := range items {
		b.WriteString("<li>" + it + "</li>")
	}
	b.WriteString("</ul>")
	return b.String()
}

// buildJournalTrendHTML ③ 逐年趋势文字化(metrics_json 解码;纯文本即可被索引)。
// 最多取最近 5 年,箭头连接:「2021 3.2 → 2022 3.5 → …」。
func buildJournalTrendHTML(meta *seo.JournalSSRMeta) string {
	trendLine := func(label string, points []seo.JournalTrendPoint, withQ bool) string {
		if len(points) == 0 {
			return ""
		}
		if len(points) > 5 {
			points = points[len(points)-5:]
		}
		segs := make([]string, 0, len(points))
		for _, p := range points {
			seg := fmt.Sprintf("%d %.3g", p.Year, p.Value)
			if withQ && p.Quartile != "" {
				seg += "(" + htmlEscape(p.Quartile) + ")"
			}
			segs = append(segs, seg)
		}
		return fmt.Sprintf("<li>%s:%s</li>", label, strings.Join(segs, " → "))
	}
	jcr := trendLine("近年影响因子", meta.JCRTrend, false)
	sjr := trendLine("近年 SJR", meta.SJRTrend, true)
	if jcr == "" && sjr == "" {
		return ""
	}
	return fmt.Sprintf("<h2 %s>逐年趋势</h2><ul %s>%s%s</ul>", ssrSubHeadStyle, ssrListStyle, jcr, sjr)
}

// buildJournalSubmitRefHTML ④ 投稿参考区块(审稿周期/评价/APC/DOAJ/LaTeX/投稿指南)。
func buildJournalSubmitRefHTML(meta *seo.JournalSSRMeta) string {
	var items []string
	if meta.FirstReviewMonths > 0 {
		items = append(items, fmt.Sprintf("审稿周期:首次审稿意见平均约 %.1f 个月", meta.FirstReviewMonths))
	}
	if meta.CommentRating > 0 && meta.CommentCount > 0 {
		items = append(items, fmt.Sprintf("投稿人评价:%.1f 分(%d 条评价)", meta.CommentRating, meta.CommentCount))
	}
	if meta.IsInDOAJ {
		seg := "DOAJ 收录的开放获取期刊"
		if meta.HasAPC {
			seg += ",收取文章处理费(APC)"
		} else {
			seg += ",不收取文章处理费(APC)"
		}
		items = append(items, seg)
	} else if meta.HasAPC {
		items = append(items, "收取文章处理费(APC)")
	}
	if meta.HasLatex {
		seg := "提供 LaTeX 投稿模板"
		if meta.LatexClass != "" {
			seg += "(" + htmlEscape(meta.LatexClass) + ")"
		}
		items = append(items, seg)
	}
	if meta.HasGuideline {
		items = append(items, "提供投稿指南")
	}
	if len(items) == 0 {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "<h2 %s>投稿参考</h2><ul %s>", ssrSubHeadStyle, ssrListStyle)
	for _, it := range items {
		b.WriteString("<li>" + it + "</li>")
	}
	b.WriteString("</ul>")
	return b.String()
}

// buildJournalSameCategoryHTML ⑤ 同学科推荐(published 行,真实 <a href> 内链)。
func buildJournalSameCategoryHTML(meta *seo.JournalSSRMeta) string {
	if len(meta.SameCategory) == 0 {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "<h2 %s>同学科期刊推荐</h2><ul %s>", ssrSubHeadStyle, ssrListStyle)
	for _, ref := range meta.SameCategory {
		href := "/journal/" + strconv.FormatInt(ref.JournalID, 10)
		if ref.Slug != "" {
			href += "/" + ref.Slug
		}
		var metrics []string
		if ref.JCRImpactFactor > 0 {
			metrics = append(metrics, fmt.Sprintf("IF %.1f", ref.JCRImpactFactor))
		}
		if ref.JCRQuartile != "" {
			metrics = append(metrics, "JCR "+htmlEscape(ref.JCRQuartile))
		}
		if ref.FQBMajorQuartile != "" {
			seg := "中科院" + htmlEscape(ref.FQBMajorQuartile) + "区"
			if ref.FQBTop {
				seg += "(Top)"
			}
			metrics = append(metrics, seg)
		}
		suffix := ""
		if len(metrics) > 0 {
			suffix = " — " + strings.Join(metrics, " · ")
		}
		fmt.Fprintf(&b, `<li><a href="%s" style="color: #882828;">%s</a>%s</li>`,
			htmlEscape(href), htmlEscape(ref.Name), suffix)
	}
	b.WriteString("</ul>")
	return b.String()
}

// journalFAQItem FAQ 单条(可见区块与 FAQPage JSON-LD 的同一数据源)。
type journalFAQItem struct {
	Q, A string
}

// journalFAQItems ⑥ 由字段生成的常见问题。铁律:**无数据的问题不出** ——
// 每条都以对应字段非零为前置;OA/预警等布尔零值无法与「未知」区分,只出肯定态。
func journalFAQItems(meta *seo.JournalSSRMeta) []journalFAQItem {
	name := meta.CanonicalName
	var items []journalFAQItem
	if meta.JCRImpactFactor > 0 {
		a := fmt.Sprintf("《%s》的最新影响因子(IF)为 %.3f", name, meta.JCRImpactFactor)
		if meta.JCRYear > 0 {
			a = fmt.Sprintf("根据 JCR %d 年数据,%s", meta.JCRYear, a)
		}
		items = append(items, journalFAQItem{
			Q: fmt.Sprintf("《%s》的影响因子是多少?", name),
			A: a + "。",
		})
	}
	if meta.FQBMajorQuartile != "" || meta.JCRQuartile != "" {
		var segs []string
		if meta.FQBMajorQuartile != "" {
			seg := "中科院分区"
			if meta.FQBYear > 0 {
				seg += fmt.Sprintf("(%d年版)", meta.FQBYear)
			}
			seg += "为"
			if meta.FQBMajorCategory != "" {
				seg += meta.FQBMajorCategory
			}
			seg += meta.FQBMajorQuartile + "区"
			if meta.FQBTop {
				seg += "(Top 期刊)"
			}
			segs = append(segs, seg)
		}
		if meta.JCRQuartile != "" {
			segs = append(segs, "JCR 分区为 "+meta.JCRQuartile)
		}
		items = append(items, journalFAQItem{
			Q: fmt.Sprintf("《%s》是几区期刊?", name),
			A: fmt.Sprintf("《%s》%s。", name, strings.Join(segs, ",")),
		})
	}
	if meta.GJQKWarningLevel != "" {
		a := fmt.Sprintf("是。《%s》已列入", name)
		if meta.GJQKYear > 0 {
			a += fmt.Sprintf("%d年", meta.GJQKYear)
		}
		a += "《国际期刊预警名单》,预警等级:" + meta.GJQKWarningLevel + "。"
		if meta.GJQKWarningWhy != "" {
			a += "预警原因:" + meta.GJQKWarningWhy + "。"
		}
		a += "投稿前请谨慎评估。"
		items = append(items, journalFAQItem{
			Q: fmt.Sprintf("《%s》是预警期刊吗?", name),
			A: a,
		})
	}
	if meta.IsOA || meta.IsInDOAJ {
		a := fmt.Sprintf("是,《%s》是开放获取(Open Access)期刊", name)
		if meta.IsInDOAJ {
			a += ",已被 DOAJ 收录"
		}
		if meta.HasAPC {
			a += ",发表需支付文章处理费(APC)"
		}
		items = append(items, journalFAQItem{
			Q: fmt.Sprintf("《%s》是开放获取(OA)期刊吗?", name),
			A: a + "。",
		})
	}
	if meta.FirstReviewMonths > 0 {
		items = append(items, journalFAQItem{
			Q: fmt.Sprintf("《%s》的审稿周期多久?", name),
			A: fmt.Sprintf("根据投稿经验数据,《%s》首次审稿意见平均约 %.1f 个月返回,实际周期因稿件而异。", name, meta.FirstReviewMonths),
		})
	}
	return items
}

// buildJournalFAQHTML FAQ 可见区块(与 JSON-LD 同源;Google 要求 FAQPage
// 标记的内容必须在页面可见,只挂 JSON-LD 不渲染正文是违规形态)。
func buildJournalFAQHTML(meta *seo.JournalSSRMeta) string {
	items := journalFAQItems(meta)
	if len(items) == 0 {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "<h2 %s>常见问题</h2>", ssrSubHeadStyle)
	for _, it := range items {
		fmt.Fprintf(&b, "<h3 %s>%s</h3><p %s>%s</p>",
			ssrSubHeadStyle, htmlEscape(it.Q), ssrTextStyle, htmlEscape(it.A))
	}
	return b.String()
}

// buildJournalFAQJSONLD FAQPage JSON-LD(journalFAQItems 同源;无数据返回空)。
func buildJournalFAQJSONLD(meta *seo.JournalSSRMeta) string {
	items := journalFAQItems(meta)
	if len(items) == 0 {
		return ""
	}
	entities := make([]map[string]any, 0, len(items))
	for _, it := range items {
		entities = append(entities, map[string]any{
			"@type": "Question",
			"name":  it.Q,
			"acceptedAnswer": map[string]any{
				"@type": "Answer",
				"text":  it.A,
			},
		})
	}
	return jsonLDScript(map[string]any{
		"@context":   "https://schema.org",
		"@type":      "FAQPage",
		"mainEntity": entities,
	})
}

// buildJournalBreadcrumbJSONLD 期刊详情页 BreadcrumbList:
// 首页 > 期刊(/journals/browse) > 大类枢纽(slug 映射) > 本刊。大类缺失时三级降二级。
func buildJournalBreadcrumbJSONLD(meta *seo.JournalSSRMeta, canonical string) string {
	base := appconfig.CanonicalBaseURL()
	items := [][2]string{
		{"首页", base + "/"},
		{"期刊", base + "/journals/browse"},
	}
	if meta.FQBMajorCategory != "" {
		items = append(items, [2]string{
			meta.FQBMajorCategory,
			base + "/journals/category/" + seo.JournalCategorySlug(meta.FQBMajorCategory),
		})
	}
	items = append(items, [2]string{meta.CanonicalName, canonical})
	return buildBreadcrumbJSONLD(items)
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
	html = replaceRegexpLiteral(titleRe, html, "<title>"+htmlEscape(seoTitle)+"</title>")

	descRe := ssrDescRe
	if descRe.MatchString(html) {
		html = replaceRegexpLiteral(descRe, html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}

	keywords := buildToolKeywords(meta)
	keywordsRe := ssrKeywordsRe
	if keywordsRe.MatchString(html) {
		html = replaceRegexpLiteral(keywordsRe, html, fmt.Sprintf(`<meta name="keywords" content="%s">`, htmlEscape(keywords)))
	}

	canonical := fmt.Sprintf("%s%s", appconfig.CanonicalBaseURL(), path)
	canonRe := ssrCanonRe
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if canonRe.MatchString(html) {
		html = replaceRegexpLiteral(canonRe, html, canonTag)
	} else {
		html = strings.Replace(html, "</head>", canonTag+"\n</head>", 1)
	}

	if jsonLD := buildToolJSONLD(meta, canonical); jsonLD != "" {
		html = strings.Replace(html, "</head>", jsonLD+"\n</head>", 1)
	}
	if faqLD := buildToolFAQJSONLD(meta); faqLD != "" {
		html = strings.Replace(html, "</head>", faqLD+"\n</head>", 1)
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

func buildToolHubLinks(metas []*seo.ToolSSRMeta) string {
	var b strings.Builder
	count := 0
	for _, meta := range metas {
		if meta == nil || !meta.SEOIndexable || meta.Slug == "" || meta.Name == "" {
			continue
		}
		if count == 0 {
			b.WriteString(`<section aria-labelledby="approved-tools"><h2 id="approved-tools">精选科研工具</h2><ul>`)
		}
		href := "/tools/" + url.PathEscape(meta.Slug)
		fmt.Fprintf(&b, `<li><a href="%s">%s</a>`, htmlEscape(href), htmlEscape(meta.Name))
		if meta.Tagline != "" {
			b.WriteString(" — " + htmlEscape(truncate(meta.Tagline, 160)))
		}
		b.WriteString(`</li>`)
		count++
		if count >= 100 {
			break
		}
	}
	if count == 0 {
		return ""
	}
	b.WriteString(`</ul></section>`)
	return b.String()
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
	if officialURL := safeHTTPURL(meta.OfficialURL); officialURL != "" {
		obj["sameAs"] = officialURL
	}
	return jsonLDScript(obj)
}

func buildToolFAQJSONLD(meta *seo.ToolSSRMeta) string {
	if meta == nil {
		return ""
	}
	mainEntity := make([]map[string]any, 0, len(meta.FAQ))
	for _, item := range meta.FAQ {
		question := strings.TrimSpace(item.Question)
		answer := strings.TrimSpace(item.Answer)
		if question == "" || answer == "" {
			continue
		}
		mainEntity = append(mainEntity, map[string]any{
			"@type": "Question",
			"name":  question,
			"acceptedAnswer": map[string]string{
				"@type": "Answer",
				"text":  answer,
			},
		})
	}
	if len(mainEntity) == 0 {
		return ""
	}
	return jsonLDScript(map[string]any{
		"@context":   "https://schema.org",
		"@type":      "FAQPage",
		"mainEntity": mainEntity,
	})
}

func safeHTTPURL(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return ""
	}
	return parsed.String()
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
	if officialURL := safeHTTPURL(meta.OfficialURL); officialURL != "" {
		bodyHTML += fmt.Sprintf(`<p %s><a href="%s" rel="nofollow noopener">访问官方网站</a></p>`, textStyle, htmlEscape(officialURL))
	}
	if len(meta.UseCases) > 0 {
		var useCases strings.Builder
		for _, item := range meta.UseCases {
			title := strings.TrimSpace(item.Title)
			if title == "" {
				continue
			}
			useCases.WriteString(`<li><strong>` + htmlEscape(title) + `</strong>`)
			if desc := strings.TrimSpace(item.Desc); desc != "" {
				useCases.WriteString(` — ` + htmlEscape(desc))
			}
			useCases.WriteString(`</li>`)
		}
		if useCases.Len() > 0 {
			bodyHTML += `<section><h2>使用场景</h2><ul>` + useCases.String() + `</ul></section>`
		}
	}
	if len(meta.FAQ) > 0 {
		var faq strings.Builder
		for _, item := range meta.FAQ {
			question := strings.TrimSpace(item.Question)
			answer := strings.TrimSpace(item.Answer)
			if question == "" || answer == "" {
				continue
			}
			faq.WriteString(`<dt><strong>` + htmlEscape(question) + `</strong></dt><dd>` + htmlEscape(answer) + `</dd>`)
		}
		if faq.Len() > 0 {
			bodyHTML += `<section><h2>常见问题</h2><dl>` + faq.String() + `</dl></section>`
		}
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

// stripTrailingEllipsis 剥掉上游标题自带的尾部省略号("..." / "…")与收尾空白 ——
// 否则 truncate 再补一次 "..." 会产生「...NU... - 论文详情」式双截断(2026-08-10 审计)。
func stripTrailingEllipsis(s string) string {
	s = strings.TrimSpace(s)
	for {
		switch {
		case strings.HasSuffix(s, "..."):
			s = strings.TrimSpace(strings.TrimSuffix(s, "..."))
		case strings.HasSuffix(s, "…"):
			s = strings.TrimSpace(strings.TrimSuffix(s, "…"))
		case strings.HasSuffix(s, ".."):
			s = strings.TrimSpace(strings.TrimSuffix(s, ".."))
		default:
			return s
		}
	}
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

	// The Vite frontend serves one identical index.html shell for every SPA
	// route. Always fetch the safe root URL: forwarding an arbitrary entity slug
	// (for example `/news/.draft`) can trigger the frontend Nginx hidden-file or
	// static-extension locations and turn an otherwise valid SSR request into a
	// false 403/404/503 before the resolver even runs.
	fetchURL := strings.TrimRight(h.frontendURL, "/") + "/"
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
	"/features/search": {
		"文献搜索 · Scholay学术 — 用一句中文,读懂一整个研究领域",
		"Scholay 文献搜索基于自然语言理解,跨数千万篇学术论文同时检索、引文矩阵分析与语义图谱探索,让你像与同行对话一样发现关联文献。",
	},
	"/features/library": {
		"文件夹 · Scholay学术 — 千篇文献,一处归档",
		"用文件夹树结构与 AI 自动打标签,管理 1000+ 篇论文;浏览器内高亮批注 PDF,多端实时同步,一键导出 BibTeX/RIS 引用,并与团队成员实时协作。",
	},
	"/features/prism": {
		"Prism · Scholay学术 — AI 学术写作 + LaTeX 编辑器",
		"在浏览器里写 LaTeX,在 AI 协作中完成论文。Prism 把实时编译预览、文献引用、润色批注、模板套用与版本协作合并到一个简洁的编辑器里:AI 可按指令直接修改正文并以 diff 形式呈现,自动引用检索到的文献,内置 IEEE、ACM、Springer 等主流期刊模板,零安装上手。",
	},
	"/features/claw": {
		"Claw · Scholay学术 — 你的学术对话伙伴,基于你的文件夹回答",
		"Claw 根植于你上传的论文、笔记与数据,提供可溯源的引用、可复用的研究路径,以及中英双语的多轮学术对话。",
	},
	"/features/submit": {
		"智能投稿 · Scholay学术 — 一次准备,多刊投稿",
		"从期刊匹配到 Cover Letter,Scholay 让 SCI / EI / 核心期刊投稿全流程自动化,并检查格式、参考文献与投稿材料。",
	},
	"/features/peer-review": {
		"同行评审 · Scholay学术 — 为学者,重新发明同行评审",
		"Scholay 同行评审是为期刊与会议而生的智能评审工作台,提供结构化评审模板、自动新颖性核查、引用图谱对比与偏见提示,辅助审稿人与作者在投稿前发现结构、方法论与论证逻辑中的关键问题。支持 PDF 上传与文本粘贴提交,审稿报告按问题严重性分级并附具体修改建议。",
	},
	"/tools": {
		"学术工具广场 — 科研软件与在线工具大全 | Scholay 学术",
		"Scholay 学术工具广场:汇集文献检索、文献管理、论文写作、数据分析、AI 学术助手、LaTeX 排版、学术绘图等科研常用软件与在线工具,每个工具附分类、获取方式、官网链接与使用说明,支持按类目检索与对比,帮研究者快速找到合适的科研工具。",
	},
	"/tools/skills": {
		"社区技能 · 科研能力广场 | Scholay 学术",
		"浏览社区分享的科研智能体技能,按主题搜索与排序,将可复用的研究能力安装到 Scholay 智能助手或其他 Agent。",
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
		"Scholay 学术搜索覆盖 2 亿+ 学术论文,支持直接检索与 AI 智能检索两种模式,可用布尔运算符(AND、OR、NOT)与精确短语提升检索精度;结果可按相关度、被引次数与发表时间排序,并按年份、领域、论文类型筛选,覆盖深度学习、大语言模型等热门研究方向。",
	},
	"/journals/search": {
		"期刊检索 — 影响因子 / 分区 / 收录查询 | Scholay 学术",
		"按刊名、ISSN、学科、出版商与影响因子分区查找学术期刊,逐刊查看 JCR 影响因子、CiteScore、中科院分区与 JCR 分区、是否开放获取(OA)及收录范围,辅助选刊投稿与文献质量评估;另有 SCI 一区、中科院一区、CCF A 类与高影响因子期刊榜单。",
	},
	"/journals/sci-q1": {
		"SCI 一区(JCR Q1)期刊有哪些 - Scholay 期刊库",
		"JCR Q1(SCI 一区)期刊完整列表,含影响因子、中科院分区、CCF 等级、ISSN、出版商,按影响因子排序,支持继续筛选与检索。",
	},
	"/journals/cas-zone1": {
		"中科院一区期刊有哪些 - Scholay 期刊库",
		"中科院基础版一区(Top)期刊列表,含影响因子、JCR 分区、CCF 等级、ISSN、出版商,按影响因子排序,支持筛选与检索。",
	},
	"/journals/ccf-a": {
		"CCF A 类推荐期刊有哪些 - Scholay 期刊库",
		"CCF(中国计算机学会)推荐 A 类期刊列表,含影响因子、JCR / 中科院分区、ISSN、出版商,适合计算机方向选刊投稿。",
	},
	"/journals/high-impact-factor": {
		"高影响因子期刊(IF ≥ 10)有哪些 - Scholay 期刊库",
		"影响因子 10 以上的高影响力期刊列表,含中科院 / JCR 分区、CCF 等级、ISSN、出版商,按影响因子降序排列。",
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
		html = replaceRegexpLiteral(ssrTitleRe, html, "<title>"+htmlEscape(seoTitle)+"</title>")
	}
	if ssrDescRe.MatchString(html) {
		html = replaceRegexpLiteral(ssrDescRe, html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}
	canonical := appconfig.CanonicalBaseURL() + path
	canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
	if ssrCanonRe.MatchString(html) {
		html = replaceRegexpLiteral(ssrCanonRe, html, canonTag)
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
//
// Provider 错误返回 503，不存在的详情返回 404；返回的权威 slug 与请求不同时返回 301 目标。
func (h *Handler) injectNewsSSR(html, path string) (string, int, string) {
	if h.newsSEOProvider == nil {
		return html, http.StatusServiceUnavailable, ""
	}
	base := appconfig.CanonicalBaseURL()

	// 列表页
	if path == "/news" {
		seoTitle := "学术情报 - 顶刊速递 · 重大事件 · 国内政策 | Scholay 学术"
		desc := "Scholay 学术情报:实时汇集顶级期刊论文速递、学术界重大事件、国内科研政策等学术新闻,按热度与时间持续更新。"
		canonical := base + "/news"
		html = replaceSSRTitleDescCanon(html, seoTitle, desc, canonical)
		metas, err := h.newsSEOProvider.RecentNewsForSEO(50)
		if err != nil {
			return html, http.StatusServiceUnavailable, ""
		}
		html = insertNoscriptBlock(html, buildNewsListNoscript(metas))
		html = injectOG(html, seoTitle, canonical, desc, "website")
		return html, http.StatusOK, ""
	}

	// 详情页:单段 slug
	slug := strings.TrimPrefix(path, "/news/")
	if slug == "" || strings.Contains(slug, "/") {
		return html, http.StatusNotFound, ""
	}
	meta, err := h.newsSEOProvider.ResolveNewsBySlug(slug)
	if err != nil {
		return html, http.StatusServiceUnavailable, ""
	}
	if meta == nil || meta.Title == "" {
		return html, http.StatusNotFound, ""
	}
	if meta.Slug != "" {
		canonicalPath := "/news/" + url.PathEscape(meta.Slug)
		if !canonicalMatchesRequest(canonicalPath, path) {
			return html, http.StatusOK, canonicalPath
		}
		path = canonicalPath
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
	return html, http.StatusOK, ""
}

// replaceSSRTitleDescCanon 统一替换 <title>/<meta description>/<link canonical>(缺失则按既有约定处理)。
func replaceSSRTitleDescCanon(html, title, desc, canonical string) string {
	if ssrTitleRe.MatchString(html) {
		html = replaceRegexpLiteral(ssrTitleRe, html, "<title>"+htmlEscape(title)+"</title>")
	}
	if ssrDescRe.MatchString(html) {
		html = replaceRegexpLiteral(ssrDescRe, html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(desc)))
	}
	if canonical != "" {
		canonTag := fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical))
		if ssrCanonRe.MatchString(html) {
			html = replaceRegexpLiteral(ssrCanonRe, html, canonTag)
		} else {
			html = strings.Replace(html, "</head>", canonTag+"\n</head>", 1)
		}
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
		html = replaceRegexpLiteral(ssrTitleRe, html, "<title>"+htmlEscape(meta.title)+"</title>")
	}
	if ssrDescRe.MatchString(html) {
		html = replaceRegexpLiteral(ssrDescRe, html, fmt.Sprintf(`<meta name="description" content="%s">`, htmlEscape(meta.desc)))
	}
	// 自指 canonical(否则吃首页 canonical,被判重复页)。首页 path="/" → canonical 带尾斜杠。
	canonical := appconfig.CanonicalBaseURL() + path
	html = upsertHeadTag(html, ssrCanonRe, fmt.Sprintf(`<link rel="canonical" href="%s">`, htmlEscape(canonical)))
	// OG / Twitter 也改成本页值(否则落地页社媒卡片全是首页);枢纽/落地页非文章,og:type=website。
	html = injectOG(html, meta.title, canonical, meta.desc, "website")
	return html
}

type staticRouteBody struct {
	heading string
	body    string
}

// dedicatedStaticRouteBodies 镜像前端 6 个功能落地页与 4 个期刊榜单的首屏事实文案。
// 这些路由此前全部复用一段通用 features 文案或完全没有正文，导致 title/description/
// canonical 缺失且内容哈希相同。这里只保留可验证的概述，完整交互仍由 React 渲染。
var dedicatedStaticRouteBodies = map[string]staticRouteBody{
	"/": {
		"Scholay学术 — AI 驱动的学术搜索与科研工具平台",
		"Scholay 学术提供论文搜索、AI 论文分析、同行评审、文献管理、期刊查询与 LaTeX 在线写作，帮助研究者在一个工作空间完成检索、阅读、分析与写作。",
	},
	"/features/search": {
		"用一句中文，读懂一整个研究领域",
		"Scholay 文献搜索支持自然语言与关键词检索，并把跨来源论文、引文关系和筛选结果组织成可继续分析的研究视图。",
	},
	"/features/library": {
		"千篇文献，一处归档",
		"用文件夹树、标签与 PDF 批注管理研究资料，支持引用导出、多端同步与团队协作，并可把已收藏文献直接交给智能助手分析。",
	},
	"/features/prism": {
		"Prism AI 学术写作与 LaTeX 编辑器",
		"Prism 将 LaTeX 编辑、实时编译预览、文献引用、AI 润色与版本协作放在同一个浏览器工作空间中。",
	},
	"/features/claw": {
		"Claw 可溯源学术对话助手",
		"Claw 基于你选择的论文、笔记和数据回答问题，在多轮对话中保留研究上下文，并为关键结论提供可追溯引用。",
	},
	"/features/submit": {
		"智能投稿 — 一次准备，多刊投稿",
		"从目标期刊匹配、格式与参考文献检查到 Cover Letter 草拟，Scholay 帮助研究者系统准备投稿材料。",
	},
	"/features/peer-review": {
		"为学者重新设计的同行评审工作台",
		"通过结构化评审模板、新颖性核查、引用图谱对比与偏见提示，辅助审稿人和作者发现论文中的关键问题。",
	},
	"/journals/sci-q1": {
		"SCI 一区（JCR Q1）期刊",
		"JCR Q1 代表各学科影响力较高的前 25% 期刊。本榜单展示匹配期刊及其影响因子、分区、ISSN 与出版商，并支持继续按学科筛选。",
	},
	"/journals/cas-zone1": {
		"中科院一区期刊",
		"查看中科院期刊分区中一区期刊的影响因子、JCR 分区、ISSN 与出版信息，并进入期刊详情核对投稿相关指标。",
	},
	"/journals/ccf-a": {
		"CCF A 类推荐期刊",
		"查看中国计算机学会推荐目录中的 A 类期刊，以及相应影响因子、JCR 与中科院分区、ISSN 和出版商信息。",
	},
	"/journals/high-impact-factor": {
		"高影响因子期刊（IF ≥ 10）",
		"按影响因子降序浏览 IF 不低于 10 的期刊，并结合 JCR、中科院与 CCF 等指标进一步判断投稿适配度。",
	},
	"/tools/skills": {
		"社区技能 — 可复用的科研智能体能力",
		"浏览社区发布的科研技能，按关键词、热度与更新时间筛选，并打开技能详情了解用途后安装到支持的智能助手。",
	},
}

// getRouteNoscriptContent returns route-specific static fallback HTML.
func getRouteNoscriptContent(path string) string {
	baseStyle := ssrBaseStyle
	headingStyle := ssrHeadingTight
	textStyle := ssrTextStyle
	if page, ok := dedicatedStaticRouteBodies[path]; ok {
		return fmt.Sprintf(`<section %s><h1 %s>%s</h1><p %s>%s</p></section>`,
			baseStyle, headingStyle, htmlEscape(page.heading), textStyle, htmlEscape(page.body))
	}

	switch {
	case path == "/resources":
		return fmt.Sprintf(`<section %s>
<h1 %s>学术资源中心</h1>
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
<h1 %s>帮助中心 · 学术问答 — 科研常见问题深度解答</h1>
<p %s>Scholay 帮助中心即学术问答,收录科研全流程的真实问题与深度解答,涵盖学术开题、研究方法、数据集、AI 辅助写作、模拟审稿、论文查重、AI 写作幻觉与文献核对等主题,每个问题都给出一篇完整回答。</p>
%s
</section>`, baseStyle, headingStyle, textStyle, articleListNoscript("qa", "/qa/"))

	case path == "/search":
		return fmt.Sprintf(`<section %s>
<h1 %s>学术搜索</h1>
<p %s>Scholay 学术搜索覆盖超过 2 亿篇学术论文，支持直接检索和 AI 智能检索两种模式。使用布尔运算符（AND、OR、NOT）和精确短语检索提升搜索精度。结果可按相关度、被引次数和发表时间排序，并支持按年份、领域、论文类型等条件筛选。</p>
<p %s>热门研究领域包括：深度学习、量子计算、CRISPR 基因编辑、气候变化、大语言模型、新能源技术、计算机视觉、自然语言处理、生物信息学等。</p>
</section>`, baseStyle, headingStyle, textStyle, textStyle)

	case path == "/journals/search":
		return fmt.Sprintf(`<section %s>
<h1 %s>期刊检索 — 影响因子 / 分区 / 收录查询</h1>
<p %s>Scholay 期刊检索帮助科研工作者按刊名、ISSN、学科、出版商及影响因子分区查找学术期刊，查看每本期刊的影响因子（JCR Impact Factor）、CiteScore、中科院分区与 JCR 分区、是否开放获取（OA）及收录范围，辅助选刊投稿与文献质量评估。</p>
<p %s><a href="/journals/browse" style="color: #882828;">期刊导航：按学科 / 国家 / 预警 / OA 专题浏览全部期刊，查看本周新增期刊</a></p>
</section>`, baseStyle, headingStyle, textStyle, textStyle)

	case path == "/claw":
		return fmt.Sprintf(`<section %s>
<h1 %s>智能助手 — AI 学术对话</h1>
<p %s>Scholay 智能助手是面向科研的 AI 学术对话工具，可帮您解答学术问题、讨论研究方向、分析论文观点、生成文献综述。支持多种大语言模型，对话支持上下文连续交流，可直接粘贴论文片段让 AI 解读，或请 AI 帮助改善论文表达、检索并引用相关文献。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/prism":
		return fmt.Sprintf(`<section %s>
<h1 %s>智能写作 — ScholayPrism AI-native LaTeX 编辑器</h1>
<p %s>ScholayPrism 是原生支持 LaTeX 的在线学术写作工作空间，AI 内联协作、实时编译预览、内置多种期刊模板。AI 可按指令直接修改正文并以 diff 形式呈现、自动 \cite 引用检索到的文献、按学科规范排版，是论文写作与投稿前排版的一体化工具。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/about":
		return fmt.Sprintf(`<section %s>
<h1 %s>关于 Scholay 学术</h1>
<p %s>Scholay（学术）是一个 AI 驱动的学术搜索与科研协作平台，整合超过 2 亿篇学术论文，提供学术检索、AI 论文分析、智能学术对话、AI 智能审稿与 LaTeX 智能写作等一站式科研工具，致力于用人工智能提升科研工作者的文献检索与论文写作效率。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/features":
		return fmt.Sprintf(`<section %s>
<h1 %s>Scholay 核心功能</h1>
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
<h1 %s>Scholay 学术博客</h1>
<p %s>Scholay 学术博客分享文献检索技巧、学术工具评测、论文写作与同行评审经验、AI 科研应用等原创长文,帮助研究者提升科研效率。精选文章:</p>
%s
</section>`, baseStyle, headingStyle, textStyle, articleListNoscript("blog", "/blog/"))

	case path == "/qa":
		return fmt.Sprintf(`<section %s>
<h1 %s>学术问答 — 科研常见问题深度解答</h1>
<p %s>Scholay 学术问答收录科研全流程的真实问题与深度解答,涵盖学术开题、研究方法、数据集、AI 辅助写作、模拟审稿、论文查重、AI 写作幻觉与文献核对等主题,每个问题都给出一篇完整回答。</p>
%s
</section>`, baseStyle, headingStyle, textStyle, articleListNoscript("qa", "/qa/"))

	case path == "/tools":
		return fmt.Sprintf(`<section %s>
<h1 %s>科研工具广场 — 学术软件与工具大全</h1>
<p %s>Scholay 功能广场收录科研工作者常用的学术工具与软件,涵盖文献检索、文献管理、论文写作、数据分析、AI 学术助手、LaTeX 排版、参考文献管理、学术绘图等类目。每个工具含分类、获取方式、官网链接与使用说明,帮助研究者快速找到合适的科研工具。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/peer-review":
		return fmt.Sprintf(`<section %s>
<h1 %s>AI 智能审稿</h1>
<p %s>Scholay 智能审稿服务模拟同行评审流程，从论文结构、方法论严谨性、论证逻辑、写作质量等多个维度对论文进行全面评估。支持 PDF 上传和文本粘贴两种方式提交论文，审稿报告按问题严重性分级，并提供具体的修改建议和改进方向。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/pricing":
		return fmt.Sprintf(`<section %s>
<h1 %s>订阅方案</h1>
<p %s>Scholay 提供灵活的订阅方案，从 Free 到 Pro 和 Max，满足不同层次的学术研究需求。Free 用户可使用基础检索和有限次数的 AI 分析功能，付费订阅解锁高级 AI 模型、更多使用配额和专属功能。支持支付宝和微信支付。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/privacy":
		return fmt.Sprintf(`<section %s>
<h1 %s>隐私政策</h1>
<p %s>本页说明 Scholay（成都恩特罐罐文化科技有限公司）如何收集、使用、存储与保护用户个人信息，包括账号信息与检索/使用记录的处理方式、Cookie 使用、第三方服务、数据安全措施，以及用户对自身数据的访问、更正与删除权利。完整条款以页面正文为准。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/terms":
		return fmt.Sprintf(`<section %s>
<h1 %s>服务条款</h1>
<p %s>本页为 Scholay 学术平台的服务条款，说明用户在使用检索、AI 论文分析、智能写作与智能审稿等服务时的权利与义务、账号与订阅规则、知识产权与内容使用规范、免责声明及条款变更方式。使用本平台即视为同意本条款。</p>
</section>`, baseStyle, headingStyle, textStyle)

	case path == "/disclaimer":
		return fmt.Sprintf(`<section %s>
<h1 %s>免责声明</h1>
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
