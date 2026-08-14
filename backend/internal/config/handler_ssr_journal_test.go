package config

import (
	"errors"
	"net/http"
	"strings"
	"testing"

	appconfig "scholar-backend/internal/common/config"
	"scholar-backend/internal/seo"
)

// ─── FAQ JSON-LD:只在有数据时输出(spec:无数据的问题不出)──────────────────

func TestJournalFAQJSONLDOnlyWithData(t *testing.T) {
	// 全部字段缺失 → 整块不出(空 FAQPage 是结构化数据违规形态)。
	bare := &seo.JournalSSRMeta{JournalID: 1, CanonicalName: "Bare Journal"}
	if got := buildJournalFAQJSONLD(bare); got != "" {
		t.Fatalf("journal without FAQ facts must emit no FAQPage, got %s", got)
	}
	if got := buildJournalFAQHTML(bare); got != "" {
		t.Fatalf("journal without FAQ facts must render no FAQ block, got %s", got)
	}

	// 只有 IF → 只出影响因子一问;预警/OA/审稿问题绝不虚构。
	ifOnly := &seo.JournalSSRMeta{JournalID: 2, CanonicalName: "IF Journal", JCRImpactFactor: 3.456, JCRYear: 2024}
	ld := buildJournalFAQJSONLD(ifOnly)
	if !strings.Contains(ld, `"@type":"FAQPage"`) || !strings.Contains(ld, "影响因子是多少") {
		t.Fatalf("IF-only journal must emit the impact factor question: %s", ld)
	}
	for _, forbidden := range []string{"预警", "开放获取", "审稿周期"} {
		if strings.Contains(ld, forbidden) {
			t.Fatalf("IF-only journal fabricated %q question: %s", forbidden, ld)
		}
	}

	// 预警刊 → 预警问题必须在,且答案含等级与年份。
	warned := &seo.JournalSSRMeta{
		JournalID: 3, CanonicalName: "Risky Journal",
		GJQKWarningLevel: "中", GJQKYear: 2025, GJQKWarningWhy: "论文工厂嫌疑",
	}
	ld = buildJournalFAQJSONLD(warned)
	for _, want := range []string{"是预警期刊吗", "2025", "中", "论文工厂嫌疑"} {
		if !strings.Contains(ld, want) {
			t.Fatalf("warned journal FAQ missing %q: %s", want, ld)
		}
	}

	// FAQ 可见区块与 JSON-LD 同源(Google 要求标记内容页面可见)。
	if html := buildJournalFAQHTML(warned); !strings.Contains(html, "是预警期刊吗") {
		t.Fatalf("visible FAQ block must mirror JSON-LD questions: %s", html)
	}
}

// ─── title/desc:预警刊必须体现预警(高价值搜索词「XX期刊 预警」)──────────────

func TestJournalTitleAndDescSurfaceWarning(t *testing.T) {
	warned := &seo.JournalSSRMeta{
		JournalID: 5, CanonicalName: "Risky Journal",
		JCRImpactFactor: 3.4, JCRQuartile: "Q2",
		FQBMajorQuartile: "2", FQBTop: true, FQBYear: 2025,
		GJQKWarningLevel: "高", GJQKYear: 2025,
	}
	title := buildJournalTitle(warned)
	for _, want := range []string{"预警", "影响因子3.4", "JCR Q2", "中科院2区Top(2025)"} {
		if !strings.Contains(title, want) {
			t.Fatalf("title missing %q: %s", want, title)
		}
	}
	desc := buildJournalDesc(warned)
	if !strings.Contains(desc, "预警名单") || !strings.Contains(desc, "高") {
		t.Fatalf("desc must state the warning: %s", desc)
	}

	// 指标全缺的老行回落旧形态(不硬凑《》空段模板)。
	legacy := buildJournalTitle(&seo.JournalSSRMeta{JournalID: 6, CanonicalName: "Old Journal", Publisher: "Wiley"})
	if !strings.Contains(legacy, "Old Journal (Wiley) - 期刊详情") {
		t.Fatalf("metric-less journal must keep legacy title shape: %s", legacy)
	}
}

// ─── 详情页七区块与内链 ──────────────────────────────────────────────────────

func TestJournalDetailRendersBlocksAndCategoryLinks(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	h.journalSEOProvider = stubJournalSEO{resolve: func(int64) (*seo.JournalSSRMeta, error) {
		return &seo.JournalSSRMeta{
			JournalID: 3, Slug: "nature", CanonicalName: "Nature", SEOIndexable: true,
			Publisher: "Springer Nature", JCRImpactFactor: 64.8, JCRQuartile: "Q1",
			FQBMajorCategory: "医学", FQBMajorQuartile: "1", FQBTop: true, FQBYear: 2025,
			JCRTrend: []seo.JournalTrendPoint{{Year: 2023, Value: 62.1}, {Year: 2024, Value: 64.8}},
			FirstReviewMonths: 2.5, HasLatex: true, LatexClass: "nature-cls",
			SameCategory: []seo.JournalRef{
				{JournalID: 9, Slug: "cell", Name: "Cell", JCRImpactFactor: 45.5, JCRQuartile: "Q1"},
			},
		}, nil
	}}
	body := requestSSR(t, h, "/journal/3/nature", "Googlebot/2.1").Body.String()

	for name, want := range map[string]string{
		"metrics matrix":        "核心指标",
		"trend text":            "2023 62.1 → 2024 64.8",
		"submit reference":      "投稿参考",
		"same-category heading": "同学科期刊推荐",
		// 不断言内联 style 里的品牌色字面值:颜色由设计护栏的 LITERAL_MIRRORS 在
		// 源文件(handler_ssr*.go)层看管,测试重复持有会被判「无人看管的品牌字面值」。
		"same-category link href": `<a href="/journal/9/cell"`,
		"same-category link text": `>Cell</a>`,
		"faq block":             "常见问题",
		"faq jsonld":            `"@type":"FAQPage"`,
		"breadcrumb jsonld":     `"@type":"BreadcrumbList"`,
		"category hub link":     `href="/journals/category/yixue"`,
		"browse hub link":       `href="/journals/browse"`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("journal detail missing %s (%q):\n%s", name, want, body)
		}
	}
	// 非预警刊绝不出现预警文案。
	if strings.Contains(body, "预警提示") {
		t.Fatalf("non-warned journal rendered a warning block:\n%s", body)
	}
}

// ─── 枢纽路由解析与 canonical 归一 ───────────────────────────────────────────

func TestParseJournalHubPathShapes(t *testing.T) {
	tests := []struct {
		path     string
		kind     string // "" = 非枢纽路径
		key      string
		page     int
		redirect string
	}{
		{"/journals/browse", "browse", "", 1, ""},
		{"/journals/warning", "warning", "", 1, ""},
		{"/journals/warning/2", "invalid", "", 0, ""}, // 预警单页,不接受分页段
		{"/journals/oa", "oa", "", 1, ""},
		{"/journals/oa/3", "oa", "", 3, ""},
		{"/journals/oa/1", "", "", 0, "/journals/oa"}, // /1 → 裸路径归一
		{"/journals/oa/0", "invalid", "", 0, ""},
		{"/journals/oa/x", "invalid", "", 0, ""},
		{"/journals/category/yixue", "category", "yixue", 1, ""},
		{"/journals/category/yixue/4", "category", "yixue", 4, ""},
		{"/journals/category/yixue/1", "", "", 0, "/journals/category/yixue"},
		{"/journals/category/yixue/4/extra", "invalid", "", 0, ""},
		{"/journals/country/us", "country", "us", 1, ""},
		{"/journals/country/US", "", "", 0, "/journals/country/us"}, // 大写码归一
		{"/journals/country/US/2", "", "", 0, "/journals/country/us/2"},
		{"/journals/search", "", "", 0, ""},  // 静态白名单页,不归枢纽
		{"/journals/sci-q1", "", "", 0, ""},  // 榜单页同上
		{"/journal/3/nature", "", "", 0, ""}, // 详情页前缀不同
	}
	for _, tc := range tests {
		route, redirect := parseJournalHubPath(tc.path)
		if redirect != tc.redirect {
			t.Errorf("%s redirect = %q, want %q", tc.path, redirect, tc.redirect)
			continue
		}
		if tc.kind == "" {
			if tc.redirect == "" && route != nil {
				t.Errorf("%s parsed as %+v, want non-hub", tc.path, route)
			}
			continue
		}
		if route == nil || route.kind != tc.kind || route.key != tc.key || (tc.kind != "invalid" && route.page != tc.page) {
			t.Errorf("%s = %+v, want kind=%q key=%q page=%d", tc.path, route, tc.kind, tc.key, tc.page)
		}
	}
}

// ─── 枢纽页 SSR:可索引、有真实内链、分页边界如实 404 ─────────────────────────

type stubJournalHub struct {
	overview func() (*seo.JournalHubOverview, error)
	list     func(dimension, key string, page, perPage int) (*seo.JournalHubList, error)
}

func (s stubJournalHub) GetJournalHubOverview() (*seo.JournalHubOverview, error) {
	if s.overview == nil {
		return nil, nil
	}
	return s.overview()
}

func (s stubJournalHub) GetJournalHubList(dimension, key string, page, perPage int) (*seo.JournalHubList, error) {
	if s.list == nil {
		return nil, nil
	}
	return s.list(dimension, key, page, perPage)
}

func hubCards(n int, offset int) []seo.JournalCard {
	out := make([]seo.JournalCard, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, seo.JournalCard{
			JournalID: int64(offset + i + 1), Slug: "journal-x", Name: "Journal X",
			Publisher: "Wiley", JCRImpactFactor: 3.4, JCRQuartile: "Q2", FQBMajorQuartile: "2",
		})
	}
	return out
}

func TestJournalHubBrowseIsIndexableWithRealLinks(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	h.journalHubProvider = stubJournalHub{overview: func() (*seo.JournalHubOverview, error) {
		return &seo.JournalHubOverview{
			Categories:   []seo.JournalHubCategory{{Slug: "yixue", Name: "医学", Count: 5603}},
			Countries:    []seo.JournalHubCountry{{Code: "US", Count: 12000}},
			WarningCount: 134,
			OACount:      22714,
			Latest:       hubCards(2, 0),
		}, nil
	}}
	got := requestSSR(t, h, "/journals/browse", "Googlebot/2.1")
	body := got.Body.String()
	if got.Code != http.StatusOK {
		t.Fatalf("status = %d; body=%s", got.Code, body)
	}
	// 🔴 可索引:枢纽页绝不能带 noindex(路径式分页的刻意例外,见 hub 文件头注)。
	if got.Header().Get("X-Robots-Tag") != "" || strings.Contains(body, `content="noindex`) {
		t.Fatalf("hub page must be indexable: headers=%v body=%s", got.Header(), body)
	}
	for _, want := range []string{
		`href="/journals/category/yixue"`,
		`href="/journals/country/us"`,
		`href="/journals/warning"`,
		`href="/journals/oa"`,
		"本周新增期刊",
		// 同上:不持有品牌色字面值,href 与链接文本分开断言。
		`<a href="/journal/1/journal-x"`,
		`>Journal X</a>`,
		`rel="canonical" href="` + appconfig.CanonicalBaseURL() + `/journals/browse"`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("browse hub missing %q:\n%s", want, body)
		}
	}
}

func TestJournalHubListPaginationAndBounds(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	h.journalHubProvider = stubJournalHub{list: func(dimension, key string, page, perPage int) (*seo.JournalHubList, error) {
		if dimension != "category" || key != "yixue" {
			return nil, nil
		}
		total := int64(120) // 3 页
		if page > 3 {
			return &seo.JournalHubList{Dimension: dimension, Key: key, Label: "医学", Total: total, Page: page, PerPage: perPage}, nil
		}
		return &seo.JournalHubList{
			Dimension: dimension, Key: key, Label: "医学",
			Items: hubCards(perPage, (page-1)*perPage), Total: total, Page: page, PerPage: perPage,
		}, nil
	}}

	// 中间页:上一页/下一页都是真实路径链接,canonical 自指分页路径。
	got := requestSSR(t, h, "/journals/category/yixue/2", "Baiduspider/2.0")
	body := got.Body.String()
	if got.Code != http.StatusOK {
		t.Fatalf("page 2 status = %d; body=%s", got.Code, body)
	}
	for _, want := range []string{
		`href="/journals/category/yixue"`,   // 上一页 = 裸路径
		`href="/journals/category/yixue/3"`, // 下一页
		`rel="canonical" href="` + appconfig.CanonicalBaseURL() + `/journals/category/yixue/2"`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("page 2 missing %q:\n%s", want, body)
		}
	}
	if got.Header().Get("X-Robots-Tag") != "" || strings.Contains(body, `content="noindex`) {
		t.Fatalf("path-style pagination must stay indexable: headers=%v", got.Header())
	}

	// /1 → 301 到裸路径(重复页归一)。
	got = requestSSR(t, h, "/journals/category/yixue/1", "Googlebot/2.1")
	if got.Code != http.StatusMovedPermanently || got.Header().Get("Location") != "/journals/category/yixue" {
		t.Fatalf("page 1 suffix: status=%d Location=%q", got.Code, got.Header().Get("Location"))
	}

	// 超尾页与未知维度键如实 404。
	if got = requestSSR(t, h, "/journals/category/yixue/9", "Googlebot/2.1"); got.Code != http.StatusNotFound {
		t.Fatalf("out-of-range page status = %d, want 404", got.Code)
	}
	if got = requestSSR(t, h, "/journals/category/not-a-slug", "Googlebot/2.1"); got.Code != http.StatusNotFound {
		t.Fatalf("unknown category slug status = %d, want 404", got.Code)
	}

	// provider 错误 → 503(与实体页同口径)。
	h.journalHubProvider = stubJournalHub{list: func(string, string, int, int) (*seo.JournalHubList, error) {
		return nil, errors.New("database unavailable")
	}}
	if got = requestSSR(t, h, "/journals/category/yixue", "Googlebot/2.1"); got.Code != http.StatusServiceUnavailable {
		t.Fatalf("provider error status = %d, want 503", got.Code)
	}
}

// 静态白名单里的 /journals/* 页面(检索页/四榜单)不被枢纽分支截胡。
func TestJournalHubBranchDoesNotShadowStaticJournalPages(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	// hub provider 故意不注入:若静态页被误路由进枢纽分支,这里会拿到 503 而非 200。
	for _, path := range []string{"/journals/search", "/journals/sci-q1", "/journals/cas-zone1"} {
		got := requestSSR(t, h, path, "Googlebot/2.1")
		if got.Code != http.StatusOK {
			t.Fatalf("%s status = %d, want 200 (hub branch shadowed a static page?)", path, got.Code)
		}
	}
	// /journals/search 的正文带「期刊导航」入口(本周新增期刊的发现链)。
	body := requestSSR(t, h, "/journals/search", "Googlebot/2.1").Body.String()
	if !strings.Contains(body, `href="/journals/browse"`) {
		t.Fatalf("/journals/search lost the browse hub entry link:\n%s", body)
	}
	// 未知 /journals/* 仍是真 404,不落通用壳。
	if got := requestSSR(t, h, "/journals/definitely-not-a-hub", "Googlebot/2.1"); got.Code != http.StatusNotFound {
		t.Fatalf("unknown /journals/* status = %d, want 404", got.Code)
	}
}
