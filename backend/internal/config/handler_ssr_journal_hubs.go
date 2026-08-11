// ============================================================================
// Scholay学术 V1.0
// 期刊枢纽页 SSR —— 发现层的服务端整页渲染
//
//	/journals/browse                     总枢纽(各维度入口 + 本周新增)
//	/journals/category/{slug}[/{page}]   中科院大类
//	/journals/country/{cc}[/{page}]      国家/地区(openalex 两位码,URL 用小写)
//	/journals/warning                    国际期刊预警专题(单页)
//	/journals/oa[/{page}]                开放获取专题
//
// 与实体详情 SSR 同机制:NoRoute → ServeIndexHTML → 本文件注入 title/desc/
// canonical/正文;普通用户与爬虫拿同一份初始 HTML,React 随后接管 #root。
//
// 🔴 可索引性(刻意例外):这些页面**不打 noindex**。全站「?page=N 参数态
// 200+noindex+canonical 收敛」的约定(isParameterizedSearchRoute)只针对
// 查询参数状态 —— 路径式真分页(/journals/oa/3)每页是独立的稳定落地页,
// URL 即内容边界,必须可索引,否则 30 万期刊页只剩 sitemap 单通道可被发现。
// ============================================================================

package config

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/seo"
)

// journalHubRoute 解析后的枢纽路由。page 从 1 起;kind ∈ browse|category|country|warning|oa。
type journalHubRoute struct {
	kind string
	key  string
	page int
}

// parseJournalHubPath 判断并解析枢纽路径。
// 返回 (route, redirect):route=nil 且 redirect="" 表示不是枢纽路径(交回上层);
// redirect 非空表示需要 301 归一(如 /journals/oa/1 → /journals/oa、大写国家码 → 小写)。
// 形状非法(页号非正整数 / 多余段)返回 kind="invalid" → 404。
func parseJournalHubPath(path string) (*journalHubRoute, string) {
	rest, ok := strings.CutPrefix(path, "/journals/")
	if !ok {
		return nil, ""
	}
	segs := strings.Split(rest, "/")

	invalid := &journalHubRoute{kind: "invalid"}

	parsePage := func(raw string) (int, bool) {
		p, err := strconv.Atoi(raw)
		if err != nil || p <= 0 {
			return 0, false
		}
		return p, true
	}

	switch segs[0] {
	case "browse":
		if len(segs) != 1 {
			return invalid, ""
		}
		return &journalHubRoute{kind: "browse", page: 1}, ""
	case "warning":
		// 预警专题单页(134 刊一页放完),不接受分页段。
		if len(segs) != 1 {
			return invalid, ""
		}
		return &journalHubRoute{kind: "warning", page: 1}, ""
	case "oa":
		switch len(segs) {
		case 1:
			return &journalHubRoute{kind: "oa", page: 1}, ""
		case 2:
			p, ok := parsePage(segs[1])
			if !ok {
				return invalid, ""
			}
			if p == 1 {
				// 首页 canonical 是裸路径:/journals/oa/1 → /journals/oa(重复页归一)。
				return nil, "/journals/oa"
			}
			return &journalHubRoute{kind: "oa", page: p}, ""
		default:
			return invalid, ""
		}
	case "category", "country":
		if len(segs) < 2 || len(segs) > 3 || segs[1] == "" {
			return invalid, ""
		}
		key := segs[1]
		page := 1
		if len(segs) == 3 {
			p, ok := parsePage(segs[2])
			if !ok {
				return invalid, ""
			}
			page = p
		}
		if segs[0] == "country" {
			// 国家码 URL 规范形态是小写(/journals/country/us);大写 301 归一,防重复页。
			if lower := strings.ToLower(key); lower != key {
				return nil, journalHubPagePath("country", lower, page)
			}
		}
		if page == 1 && len(segs) == 3 {
			return nil, journalHubPagePath(segs[0], key, 1)
		}
		return &journalHubRoute{kind: segs[0], key: key, page: page}, ""
	default:
		return nil, ""
	}
}

// journalHubPagePath 枢纽页 canonical 路径(page 1 = 裸路径,与解析侧 301 规则互为镜像)。
func journalHubPagePath(kind, key string, page int) string {
	var base string
	switch kind {
	case "browse":
		return "/journals/browse"
	case "warning":
		return "/journals/warning"
	case "oa":
		base = "/journals/oa"
	case "category":
		base = "/journals/category/" + key
	case "country":
		base = "/journals/country/" + key
	default:
		return ""
	}
	if page <= 1 {
		return base
	}
	return base + "/" + strconv.Itoa(page)
}

// injectJournalHubSSR 枢纽页注入入口(ServeIndexHTML 的 /journals/* 分支在
// parseJournalHubPath 命中后调用;redirect 已在调用方处理)。
func (h *Handler) injectJournalHubSSR(html string, route *journalHubRoute) (string, int) {
	if route == nil || route.kind == "invalid" {
		return html, http.StatusNotFound
	}
	if h.journalHubProvider == nil {
		return html, http.StatusServiceUnavailable
	}

	if route.kind == "browse" {
		ov, err := h.journalHubProvider.GetJournalHubOverview()
		if err != nil {
			return html, http.StatusServiceUnavailable
		}
		return h.renderJournalHubOverview(html, ov), http.StatusOK
	}

	perPage := seo.JournalHubPerPage
	if route.kind == "warning" {
		// 预警专题单页(spec:134 刊一页放完),页大小取专用上限。
		perPage = seo.JournalHubWarningPageSize
	}
	lst, err := h.journalHubProvider.GetJournalHubList(route.kind, route.key, route.page, perPage)
	if err != nil {
		return html, http.StatusServiceUnavailable
	}
	if lst == nil {
		return html, http.StatusNotFound
	}
	if len(lst.Items) == 0 {
		// 超出真实页数的路径分页(以及零刊的合法维度页)是软 404,如实 404。
		return html, http.StatusNotFound
	}
	return h.renderJournalHubList(html, route, lst), http.StatusOK
}

// ─── 概览页渲染 ──────────────────────────────────────────────────────────────

func (h *Handler) renderJournalHubOverview(html string, ov *seo.JournalHubOverview) string {
	base := appconfig.CanonicalBaseURL()
	canonical := base + "/journals/browse"

	seoTitle := "期刊导航 — 按学科/国家/专题浏览全部期刊 | Scholay 学术"
	desc := fmt.Sprintf(
		"Scholay 期刊导航:按中科院大类学科、出版国家/地区浏览已收录学术期刊,含 %d 本预警期刊专题与 %d 本开放获取(OA)期刊,每周更新新增期刊,逐刊提供影响因子、分区与投稿参考。",
		ov.WarningCount, ov.OACount)

	html = replaceSSRTitleDescCanon(html, seoTitle, truncate(desc, 300), canonical)

	var b strings.Builder
	fmt.Fprintf(&b, `<section %s><h1 %s>期刊导航</h1>`, ssrBaseStyle, ssrHeadingTight)
	fmt.Fprintf(&b, `<p %s>按学科、国家/地区与专题浏览 Scholay 已收录的学术期刊,逐刊查看影响因子、JCR/中科院分区、预警状态与投稿参考。</p>`, ssrTextStyle)

	if len(ov.Categories) > 0 {
		fmt.Fprintf(&b, `<h2 %s>按学科(中科院大类)</h2><ul %s>`, ssrSubHeadStyle, ssrListStyle)
		for _, c := range ov.Categories {
			fmt.Fprintf(&b, `<li><a href="%s" style="color: #882828;">%s类期刊</a>(%d 本)</li>`,
				htmlEscape("/journals/category/"+c.Slug), htmlEscape(c.Name), c.Count)
		}
		b.WriteString(`</ul>`)
	}

	if len(ov.Countries) > 0 {
		fmt.Fprintf(&b, `<h2 %s>按国家/地区</h2><ul %s>`, ssrSubHeadStyle, ssrListStyle)
		for _, c := range ov.Countries {
			fmt.Fprintf(&b, `<li><a href="%s" style="color: #882828;">%s 出版期刊</a>(%d 本)</li>`,
				htmlEscape("/journals/country/"+strings.ToLower(c.Code)), htmlEscape(c.Code), c.Count)
		}
		b.WriteString(`</ul>`)
	}

	fmt.Fprintf(&b, `<h2 %s>专题</h2><ul %s>`, ssrSubHeadStyle, ssrListStyle)
	if ov.WarningCount > 0 {
		fmt.Fprintf(&b, `<li><a href="/journals/warning" style="color: #882828;">国际期刊预警名单</a>(%d 本)</li>`, ov.WarningCount)
	}
	if ov.OACount > 0 {
		fmt.Fprintf(&b, `<li><a href="/journals/oa" style="color: #882828;">开放获取(OA)期刊</a>(%d 本)</li>`, ov.OACount)
	}
	fmt.Fprintf(&b, `<li><a href="/journals/search" style="color: #882828;">期刊检索(按刊名/ISSN/出版商)</a></li>`)
	b.WriteString(`</ul>`)

	if len(ov.Latest) > 0 {
		fmt.Fprintf(&b, `<h2 %s>本周新增期刊</h2><ul %s>`, ssrSubHeadStyle, ssrListStyle)
		for i := range ov.Latest {
			b.WriteString("<li>" + journalCardLineHTML(&ov.Latest[i]) + "</li>")
		}
		b.WriteString(`</ul>`)
	}
	b.WriteString(`</section>`)

	if ld := buildBreadcrumbJSONLD([][2]string{{"首页", base + "/"}, {"期刊导航", canonical}}); ld != "" {
		html = strings.Replace(html, "</head>", ld+"\n</head>", 1)
	}
	html = injectOG(html, seoTitle, canonical, desc, "website")
	return insertNoscriptBlock(html, b.String())
}

// ─── 列表页渲染 ──────────────────────────────────────────────────────────────

func (h *Handler) renderJournalHubList(html string, route *journalHubRoute, lst *seo.JournalHubList) string {
	base := appconfig.CanonicalBaseURL()
	pagePath := journalHubPagePath(route.kind, route.key, route.page)
	canonical := base + pagePath

	pageSeg := ""
	if route.page > 1 {
		pageSeg = fmt.Sprintf("(第%d页)", route.page)
	}

	var seoTitle, desc, heading string
	switch route.kind {
	case "category":
		heading = lst.Label + "类期刊"
		seoTitle = fmt.Sprintf("%s类期刊有哪些(共%d本)%s - 影响因子/中科院分区 | Scholay 学术", lst.Label, lst.Total, pageSeg)
		desc = fmt.Sprintf("中科院%s大类学术期刊列表%s,共收录 %d 本,逐刊标注影响因子、JCR 分区、中科院分区(含 Top)、预警状态与出版商,点击刊名查看分区趋势与投稿参考。", lst.Label, pageSeg, lst.Total)
	case "country":
		heading = lst.Label + " 出版期刊"
		seoTitle = fmt.Sprintf("%s 出版的学术期刊(共%d本)%s - 影响因子/分区一览 | Scholay 学术", lst.Label, lst.Total, pageSeg)
		desc = fmt.Sprintf("%s 出版的学术期刊列表%s,共 %d 本,含影响因子、JCR/中科院分区、OA 与预警标注,辅助按地区选刊投稿。", lst.Label, pageSeg, lst.Total)
	case "warning":
		heading = "国际期刊预警名单"
		seoTitle = fmt.Sprintf("国际期刊预警名单(共%d本) - 预警等级与预警原因 | Scholay 学术", lst.Total)
		desc = fmt.Sprintf("国际期刊预警名单收录的 %d 本预警期刊完整列表,逐刊标注预警等级、影响因子与分区,投稿前先查预警,规避学术风险。", lst.Total)
	case "oa":
		heading = "开放获取(OA)期刊"
		seoTitle = fmt.Sprintf("开放获取(OA)期刊大全(共%d本)%s | Scholay 学术", lst.Total, pageSeg)
		desc = fmt.Sprintf("开放获取(Open Access)学术期刊列表%s,共 %d 本,含 DOAJ 收录标注、影响因子与分区,方便查找可免费阅读全文的发表渠道。", pageSeg, lst.Total)
	}

	html = replaceSSRTitleDescCanon(html, seoTitle, truncate(desc, 300), canonical)

	var b strings.Builder
	fmt.Fprintf(&b, `<section %s>`, ssrBaseStyle)
	fmt.Fprintf(&b, `<p %s><a href="/" style="color: #882828;">首页</a> › <a href="/journals/browse" style="color: #882828;">期刊导航</a> › %s</p>`,
		ssrMetaStyle, htmlEscape(heading))
	fmt.Fprintf(&b, `<h1 %s>%s%s</h1>`, ssrHeadingTight, htmlEscape(heading), pageSeg)
	fmt.Fprintf(&b, `<p %s>共 %d 本。</p>`, ssrMetaStyle, lst.Total)

	b.WriteString(`<ol ` + ssrListStyle + `>`)
	for i := range lst.Items {
		b.WriteString("<li>" + journalCardLineHTML(&lst.Items[i]) + "</li>")
	}
	b.WriteString(`</ol>`)

	// 路径式分页页脚:上一页/下一页是真 <a href>(rel prev/next 已废弃,不加,
	// 链接本身承担爬虫翻页发现)。预警专题单页无页脚。
	if route.kind != "warning" {
		totalPages := int((lst.Total + int64(lst.PerPage) - 1) / int64(lst.PerPage))
		var nav []string
		if route.page > 1 {
			nav = append(nav, fmt.Sprintf(`<a href="%s" style="color: #882828;">上一页</a>`,
				htmlEscape(journalHubPagePath(route.kind, route.key, route.page-1))))
		}
		if route.page < totalPages {
			nav = append(nav, fmt.Sprintf(`<a href="%s" style="color: #882828;">下一页</a>`,
				htmlEscape(journalHubPagePath(route.kind, route.key, route.page+1))))
		}
		if len(nav) > 0 || totalPages > 1 {
			fmt.Fprintf(&b, `<p %s>第 %d/%d 页`, ssrMetaStyle, route.page, totalPages)
			for _, n := range nav {
				b.WriteString(" · " + n)
			}
			b.WriteString(`</p>`)
		}
	}
	b.WriteString(`</section>`)

	if ld := buildBreadcrumbJSONLD([][2]string{
		{"首页", base + "/"},
		{"期刊导航", base + "/journals/browse"},
		{heading, canonical},
	}); ld != "" {
		html = strings.Replace(html, "</head>", ld+"\n</head>", 1)
	}
	html = injectOG(html, seoTitle, canonical, desc, "website")
	return insertNoscriptBlock(html, b.String())
}

// journalCardLineHTML 单刊行:真实 <a href> 内链(/journal/{id}/{slug})+ 纯文本指标摘要。
func journalCardLineHTML(card *seo.JournalCard) string {
	href := "/journal/" + strconv.FormatInt(card.JournalID, 10)
	if card.Slug != "" {
		href += "/" + card.Slug
	}
	line := fmt.Sprintf(`<a href="%s" style="color: #882828;">%s</a>`, htmlEscape(href), htmlEscape(card.Name))

	var metrics []string
	if card.Publisher != "" {
		metrics = append(metrics, htmlEscape(card.Publisher))
	}
	if card.JCRImpactFactor > 0 {
		metrics = append(metrics, fmt.Sprintf("IF %.1f", card.JCRImpactFactor))
	}
	if card.JCRQuartile != "" {
		metrics = append(metrics, "JCR "+htmlEscape(card.JCRQuartile))
	}
	if card.FQBMajorQuartile != "" {
		seg := "中科院" + htmlEscape(card.FQBMajorQuartile) + "区"
		if card.FQBTop {
			seg += "(Top)"
		}
		metrics = append(metrics, seg)
	}
	if card.WarningLevel != "" {
		metrics = append(metrics, "预警("+htmlEscape(card.WarningLevel)+")")
	}
	if card.IsOA {
		metrics = append(metrics, "OA")
	}
	if len(metrics) > 0 {
		line += " — " + strings.Join(metrics, " · ")
	}
	return line
}

// buildBreadcrumbJSONLD BreadcrumbList JSON-LD(枢纽页 / 期刊详情页共用)。
// items 为 (名称, 绝对 URL) 有序对;不足两级不值得输出。
func buildBreadcrumbJSONLD(items [][2]string) string {
	if len(items) < 2 {
		return ""
	}
	elements := make([]map[string]any, 0, len(items))
	for i, it := range items {
		if it[0] == "" || it[1] == "" {
			continue
		}
		elements = append(elements, map[string]any{
			"@type":    "ListItem",
			"position": i + 1,
			"name":     it[0],
			"item":     it[1],
		})
	}
	if len(elements) < 2 {
		return ""
	}
	return jsonLDScript(map[string]any{
		"@context":        "https://schema.org",
		"@type":           "BreadcrumbList",
		"itemListElement": elements,
	})
}
