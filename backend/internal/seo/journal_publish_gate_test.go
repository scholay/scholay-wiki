package seo

import (
	"strings"
	"testing"

	"gorm.io/gorm"
)

// 发布资格是 Go 谓词(JournalPublishEligible)+ SQL 镜像(journalPublishEligibleSQL)
// 成对维护的 —— 本文件同时钉住两侧,改信号集合时两边不同步会在这里红。

func TestJournalPublishEligibleRequiresAnchorAndTwoSignals(t *testing.T) {
	h := 42

	// 锚点缺失:没有 issn_l 也没有 publisher → 无论多少信号都不行
	if JournalPublishEligible(&SEOJournal{CanonicalName: "J", JCRImpactFactor: 3.4, JCRQuartile: "Q2"}) {
		t.Fatal("journal without issn_l/publisher anchor must not be publishable")
	}
	// 名称缺失
	if JournalPublishEligible(&SEOJournal{ISSNL: "0360-4012", JCRImpactFactor: 3.4, JCRQuartile: "Q2"}) {
		t.Fatal("journal without canonical_name must not be publishable")
	}
	// 只有 1 项实质信号(IF)→ 不达标
	if JournalPublishEligible(&SEOJournal{CanonicalName: "J", ISSNL: "0360-4012", JCRImpactFactor: 3.4}) {
		t.Fatal("single substantive signal must not qualify")
	}
	// IF + 分区 = 2 项 → 达标
	if !JournalPublishEligible(&SEOJournal{CanonicalName: "J", ISSNL: "0360-4012", JCRImpactFactor: 3.4, JCRQuartile: "Q2"}) {
		t.Fatal("IF + quartile must qualify")
	}
	// publisher 锚点 + h_index + 载文量 → 达标
	if !JournalPublishEligible(&SEOJournal{CanonicalName: "J", Publisher: "Wiley", OpenAlexHIndex: &h, WorksCount: 120}) {
		t.Fatal("publisher anchor + h_index + works_count must qualify")
	}
	// works_count 门槛是 50:49 不算信号
	if JournalPublishEligible(&SEOJournal{CanonicalName: "J", Publisher: "Wiley", WorksCount: 49, ScimagoHIndex: 10}) {
		t.Fatal("works_count below 50 must not count as a signal")
	}
	// doaj + 预警 → 达标(预警刊是高价值搜索词「XX期刊 预警」,必须可发布)
	if !JournalPublishEligible(&SEOJournal{CanonicalName: "J", ISSNL: "1076-2787", IsInDOAJ: true, GJQKWarningLevel: "中"}) {
		t.Fatal("doaj + warning must qualify")
	}
	// ccf + 真实评价 → 达标
	if !JournalPublishEligible(&SEOJournal{CanonicalName: "J", Publisher: "IEEE", CCFRank: "A", CommentCount: 5}) {
		t.Fatal("ccf + comments must qualify")
	}
	// 各分区形态都算「任一分区」信号(但四个分区合计只算 1 个信号)
	if JournalPublishEligible(&SEOJournal{CanonicalName: "J", ISSNL: "0360-4012",
		JCRQuartile: "Q2", FQBMajorQuartile: "4", XRMajorQuartile: "3", SJRBestQuartile: "Q2"}) {
		t.Fatal("four quartile variants must collapse into one signal, not four")
	}
}

// SQL 镜像与 Go 谓词的信号集合一致性:每个信号的列名必须出现在 SQL 里;
// 信号求和项个数(8 项)与阈值(>= 2)也钉死,漏改任何一侧这里红。
func TestJournalPublishGateSQLMirrorsGoSignals(t *testing.T) {
	sql := strings.ToLower(journalPublishEligibleSQL)
	for _, required := range []string{
		"canonical_name", "issn_l", "publisher", // 锚点
		"jcr_impact_factor",
		"jcr_quartile", "fqb_major_quartile", "xr_major_quartile", "sjr_best_quartile",
		"openalex_h_index", "scimago_h_index",
		"works_count", ">= 50",
		"is_in_doaj",
		"ccf_rank",
		"gjqk_warning_level",
		"comment_count",
		">= 2",
	} {
		if !strings.Contains(sql, required) {
			t.Errorf("publish gate SQL missing %q:\n%s", required, sql)
		}
	}
	// Go 侧 journalSubstantiveSignals 有 8 个信号;SQL 求和是首项 + 7 个 "+ (”。
	if got := strings.Count(journalPublishEligibleSQL, "+ ("); got != 7 {
		t.Fatalf("publish gate SQL has %d '+ (' signal terms, want 7 (8 signals total, mirror journalSubstantiveSignals)", got)
	}
}

// 摄取写入的列清单与参数序列必须一一对应(insert 的占位符个数由 len(values) 推导,
// 两边错位会把值写进错误的列 —— 这里钉住数量恒等)。
func TestJournalIngestColumnsMatchValues(t *testing.T) {
	cols := strings.Split(journalIngestColumns, ",")
	vals := journalIngestValues(&JournalIngestRow{})
	if len(cols) != len(vals) {
		t.Fatalf("journalIngestColumns has %d columns but journalIngestValues returns %d values", len(cols), len(vals))
	}
}

// 发现层查询(SSR 同学科推荐 / 枢纽页)只允许消费 published 行 —— staged 行经由
// 推荐内链 / 枢纽列表泄漏等于绕过发布闸门。用真实 scope 构造 dry-run 钉 SQL。
func TestJournalDiscoveryQueriesScopePublishedOnly(t *testing.T) {
	repo := NewRepository(newSitemapDryRunDB(t))

	catSQL := normalizedSQL(repo.journalCategoryScope("医学").
		Session(&gorm.Session{DryRun: true}).
		Find(&[]SEOJournal{}).Statement)
	for _, required := range []string{"publish_state = ?", "status = ?", "fqb_major_category = ?", "jcr_category = ?"} {
		if !strings.Contains(catSQL, required) {
			t.Errorf("category scope missing %q:\n%s", required, catSQL)
		}
	}

	hubSQL := normalizedSQL(repo.journalHubScope(JournalHubFilter{
		FQBMajorCategory: "医学",
		WarningOnly:      true,
		OAOnly:           true,
	}).Session(&gorm.Session{DryRun: true}).
		Find(&[]SEOJournal{}).Statement)
	for _, required := range []string{
		"publish_state = ?", "status = ?", "fqb_major_category = ?",
		"gjqk_warning_level", "is_oa = 1", "is_in_doaj",
	} {
		if !strings.Contains(hubSQL, required) {
			t.Errorf("hub scope missing %q:\n%s", required, hubSQL)
		}
	}
}
