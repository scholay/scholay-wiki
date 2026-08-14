package seo

import (
	"regexp"
	"strings"
	"testing"

	"gorm.io/gorm"
)

// ─── 大类 slug 映射稳定性 ────────────────────────────────────────────────────
// slug 一旦对外(sitemap/收录/外链)就永不改动 —— 本测试钉住:
// ① 映射值全部是合法 URL 段(小写 [a-z0-9-]);② 无重复(两个大类共用一个 slug =
// 一个枢纽页两个身份);③ 表外值的 fallback 稳定且带 qita- 前缀,同名恒同 slug。

var hubSlugShapeRe = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

func TestJournalCategorySlugMapIsStableAndCollisionFree(t *testing.T) {
	seen := make(map[string]string, len(journalCategorySlugMap))
	for name, slug := range journalCategorySlugMap {
		if !hubSlugShapeRe.MatchString(slug) {
			t.Errorf("category %q slug %q is not a lowercase url segment", name, slug)
		}
		if owner, dup := seen[slug]; dup {
			t.Errorf("slug %q is shared by %q and %q", slug, owner, name)
		}
		seen[slug] = name
		if got := JournalCategorySlug(name); got != slug {
			t.Errorf("JournalCategorySlug(%q) = %q, want mapped %q", name, got, slug)
		}
	}
	// 基础版 18 大类必须全部在表内(上游 fqb 主力口径,掉进 fallback = URL 变哈希)。
	for _, name := range []string{
		"数学", "物理与天体物理", "化学", "地球科学", "环境科学与生态学", "生物学",
		"农林科学", "医学", "工程技术", "材料科学", "计算机科学", "综合性期刊",
		"经济学", "管理学", "法学", "教育学", "心理学", "人文科学",
	} {
		if _, ok := journalCategorySlugMap[name]; !ok {
			t.Errorf("基础版大类 %q 缺映射,会掉进 qita- fallback", name)
		}
	}
}

func TestJournalCategorySlugFallbackIsStableAndNever404s(t *testing.T) {
	const unmapped = "未知新大类"
	first := JournalCategorySlug(unmapped)
	if !strings.HasPrefix(first, "qita-") || !hubSlugShapeRe.MatchString(first) {
		t.Fatalf("fallback slug %q must be a qita- prefixed url segment", first)
	}
	if second := JournalCategorySlug(unmapped); second != first {
		t.Fatalf("fallback slug is not stable: %q vs %q", first, second)
	}
	if other := JournalCategorySlug("另一个未知大类"); other == first {
		t.Fatalf("distinct unmapped categories collapsed to one slug %q", first)
	}
	if JournalCategorySlug("  ") != "" {
		t.Fatal("blank category must yield empty slug")
	}
}

// ─── 路径式分页边界 ──────────────────────────────────────────────────────────

func TestJournalHubPagedPathsBounds(t *testing.T) {
	if got := journalHubPagedPaths("/journals/oa", 0, 50); got != nil {
		t.Fatalf("empty set must enumerate no pages, got %v", got)
	}
	if got := journalHubPagedPaths("/journals/oa", 50, 50); len(got) != 1 || got[0] != "/journals/oa" {
		t.Fatalf("exactly one page must be the bare path, got %v", got)
	}
	got := journalHubPagedPaths("/journals/oa", 51, 50)
	if len(got) != 2 || got[1] != "/journals/oa/2" {
		t.Fatalf("51 rows must be 2 pages with /2 suffix, got %v", got)
	}
	got = journalHubPagedPaths("/journals/category/yixue", 250, 50)
	if len(got) != 5 || got[0] != "/journals/category/yixue" || got[4] != "/journals/category/yixue/5" {
		t.Fatalf("250 rows must be exactly 5 pages, got %v", got)
	}
	if got := journalHubPagedPaths("/x", 10, 0); got != nil {
		t.Fatalf("non-positive perPage must not divide by zero, got %v", got)
	}
}

// ─── staged 行绝不进入枢纽(发布闸门的发现层镜像)─────────────────────────────
// 新增的聚合查询(大类/国家分组、最近新增)与既有 hub scope 一样,必须以
// publish_state + status 为硬前置 —— dry-run 钉 SQL,漏改任何一条这里红。

func TestJournalHubAggregateQueriesScopePublishedOnly(t *testing.T) {
	repo := NewRepository(newSitemapDryRunDB(t))

	queries := map[string]*gorm.DB{
		"category counts": repo.journalHubCategoryCountsQuery(),
		"country counts":  repo.journalHubCountryCountsQuery(),
		"latest journals": repo.latestPublishedJournalsQuery(20),
	}
	for name, q := range queries {
		sql := normalizedSQL(q.Session(&gorm.Session{DryRun: true}).Find(&[]JournalGroupCount{}).Statement)
		for _, required := range []string{"publish_state = ?", "status = ?"} {
			if !strings.Contains(sql, required) {
				t.Errorf("%s query missing %q — staged rows would leak into hubs:\n%s", name, required, sql)
			}
		}
	}

	// 分组键空值不成组(空大类/空国家没有枢纽页语义)。
	catSQL := normalizedSQL(repo.journalHubCategoryCountsQuery().
		Session(&gorm.Session{DryRun: true}).Find(&[]JournalGroupCount{}).Statement)
	if !strings.Contains(catSQL, "fqb_major_category") || !strings.Contains(catSQL, "group by") {
		t.Fatalf("category counts must group by fqb_major_category:\n%s", catSQL)
	}
	countrySQL := normalizedSQL(repo.journalHubCountryCountsQuery().
		Session(&gorm.Session{DryRun: true}).Find(&[]JournalGroupCount{}).Statement)
	if !strings.Contains(countrySQL, "country") || !strings.Contains(countrySQL, "group by") {
		t.Fatalf("country counts must group by country:\n%s", countrySQL)
	}

	// 「本周新增」按 created_at(真实新增时刻)降序 —— 用 updated_at 会把发布批次的
	// 30 万存量当新增轮播。
	latestSQL := normalizedSQL(repo.latestPublishedJournalsQuery(20).
		Session(&gorm.Session{DryRun: true}).Find(&[]SEOJournal{}).Statement)
	if !strings.Contains(latestSQL, "order by created_at desc") {
		t.Fatalf("latest journals must order by created_at desc:\n%s", latestSQL)
	}
}

// ─── JournalCard 契约映射 ────────────────────────────────────────────────────

func TestJournalCardFromRowMapsContractFields(t *testing.T) {
	h := 42
	card := JournalCardFromRow(&SEOJournal{
		JournalID:        7,
		CanonicalName:    "Nature Fake Reviews",
		Publisher:        "Wiley",
		JCRImpactFactor:  3.4,
		JCRQuartile:      "Q2",
		FQBMajorQuartile: "2",
		FQBTop:           true,
		XRMajorQuartile:  "3",
		IsInDOAJ:         true, // is_oa=false 但 doaj=true → 卡片 is_oa 应为 true
		GJQKWarningLevel: "中",
		OpenAlexHIndex:   &h,
		ScimagoHIndex:    9,
		Country:          "US",
	})
	if card.JournalID != 7 || card.Name != "Nature Fake Reviews" || card.Publisher != "Wiley" {
		t.Fatalf("identity fields mismatch: %+v", card)
	}
	if card.Slug != GenerateJournalSlug("Nature Fake Reviews") || card.Slug == "" {
		t.Fatalf("slug must derive from canonical name, got %q", card.Slug)
	}
	if !card.IsOA {
		t.Fatal("doaj row must surface is_oa=true")
	}
	if card.HIndex != 42 {
		t.Fatalf("h_index must prefer openalex value, got %d", card.HIndex)
	}
	if card.WarningLevel != "中" || !card.FQBTop || card.XRMajorQuartile != "3" {
		t.Fatalf("metric fields mismatch: %+v", card)
	}

	// openalex 缺失回落 scimago。
	fallback := JournalCardFromRow(&SEOJournal{JournalID: 8, CanonicalName: "J", ScimagoHIndex: 9})
	if fallback.HIndex != 9 {
		t.Fatalf("h_index must fall back to scimago, got %d", fallback.HIndex)
	}
}

// ─── SSR meta 的趋势解码 ─────────────────────────────────────────────────────

func TestDecodeJournalTrendsSkipsDirtyPoints(t *testing.T) {
	jcr, sjr := decodeJournalTrends(`{"jcr":[[2021,3.2],[2022,3.5],["bad",1],[2023]],"sjr":[[2021,1.071,"Q1"]]}`)
	if len(jcr) != 2 || jcr[0].Year != 2021 || jcr[1].Value != 3.5 {
		t.Fatalf("jcr trend = %+v", jcr)
	}
	if len(sjr) != 1 || sjr[0].Quartile != "Q1" || sjr[0].Value != 1.071 {
		t.Fatalf("sjr trend = %+v", sjr)
	}
	if a, b := decodeJournalTrends(""); a != nil || b != nil {
		t.Fatal("empty metrics_json must decode to nil trends")
	}
	if a, b := decodeJournalTrends("not-json"); a != nil || b != nil {
		t.Fatal("invalid metrics_json must decode to nil trends")
	}
}
