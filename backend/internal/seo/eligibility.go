package seo

import "strings"

// The row-level helpers mirror the repository sitemap scopes. They are used by
// SSR so a URL cannot be omitted from the sitemap as thin/retired while the
// HTML response still advertises it as indexable.
func paperRowIndexable(p *SEOPaper) bool {
	return p != nil &&
		p.Status == StatusActive &&
		IsCanonicalSource(strings.TrimSpace(p.Source)) &&
		strings.TrimSpace(p.PaperID) != "" &&
		strings.TrimSpace(p.Title) != "" &&
		(strings.TrimSpace(p.Abstract) != "" || p.QualityTier == TierDetailClick)
}

// 2026-08-10 审计收紧:paper_count / citation_count / h_index 不再单独构成收录资格。
// 线上实测 stc 作者 72% 无 top_works、99% 无 affiliations,这些行渲染出来只有
// 「姓名 + 三个数字」的 169 字符薄页(约 2.6 万条,占作者 sitemap 一半以上),
// 是「已抓取未收录」与模板化重复描述的最大来源。指标行保留展示,但页面要进
// sitemap / 主动推送,必须有至少一块可展开的实质内容(代表作 / 机构 / 主页 / ORCID)
// 或真实用户详情点击(TierDetailClick)。enrich 补齐 top_works 后自动恢复资格。
func authorRowIndexable(a *SEOAuthor) bool {
	if a == nil || a.Status != StatusActive ||
		!IsCanonicalSource(strings.TrimSpace(a.Source)) || strings.TrimSpace(a.AuthorID) == "" ||
		strings.TrimSpace(a.Name) == "" {
		return false
	}
	return a.QualityTier == TierDetailClick ||
		hasJSONArrayContent(a.AffiliationsJSON) ||
		strings.TrimSpace(a.Homepage) != "" ||
		strings.TrimSpace(a.ORCID) != "" ||
		hasJSONArrayContent(a.TopWorksJSON)
}

// 2026-08-11 全量摄取:publish_state=1 是新的硬前置(与 journalSitemapRows 的 SQL
// 镜像成对,sitemap_pages_test.go 钉住)。seoingest 批量落的 staged 行即便数据再全
// (IF/出版社/ISSN 齐备)也必须 noindex —— 30 万行的放量节奏由发布批次控制,
// 不由单行数据完整度决定。有机写入路径插入即 published,老行为不变。
func journalRowIndexable(j *SEOJournal) bool {
	if j == nil || j.Status != StatusActive || j.PublishState != PublishStatePublished ||
		j.JournalID <= 0 || strings.TrimSpace(j.CanonicalName) == "" {
		return false
	}
	return j.QualityTier == TierDetailClick ||
		strings.TrimSpace(j.Publisher) != "" ||
		hasJSONArrayContent(j.ISSNsJSON) ||
		j.JCRImpactFactor > 0 ||
		(j.OpenAlexHIndex != nil && *j.OpenAlexHIndex > 0)
}

// JournalPublishEligible 发布资格(比收录门槛严,防 soft-404):
// canonical_name + (issn_l 或 publisher) + 至少 2 项实质信号。
// 收录门槛(journalRowIndexable)是「单行能不能出现在 sitemap」;发布资格是
// 「staged 行值不值得占用发布批次与推送配额」—— 一个身份锚点 + 两个实质信号,
// 渲染出来才不是「刊名 + 一个数字」的薄页。
//
// 与 journalPublishEligibleSQL(repository_journal_ingest.go)成对修改,
// journal_publish_gate_test.go 钉住两者的信号集合一致。
func JournalPublishEligible(j *SEOJournal) bool {
	if j == nil || strings.TrimSpace(j.CanonicalName) == "" {
		return false
	}
	if strings.TrimSpace(j.ISSNL) == "" && strings.TrimSpace(j.Publisher) == "" {
		return false
	}
	return journalSubstantiveSignals(j) >= 2
}

// journalSubstantiveSignals 实质信号计数(spec: jcr_if>0 / 任一分区 / h_index>0 /
// works_count>=50 / doaj / ccf / gjqk预警 / comment_count>0)。
func journalSubstantiveSignals(j *SEOJournal) int {
	n := 0
	if j.JCRImpactFactor > 0 {
		n++
	}
	// 任一分区(JCR Q / 中科院大类 / 新锐 / SCImago best quartile)算一个信号
	if strings.TrimSpace(j.JCRQuartile) != "" || strings.TrimSpace(j.FQBMajorQuartile) != "" ||
		strings.TrimSpace(j.XRMajorQuartile) != "" || strings.TrimSpace(j.SJRBestQuartile) != "" {
		n++
	}
	if (j.OpenAlexHIndex != nil && *j.OpenAlexHIndex > 0) || j.ScimagoHIndex > 0 {
		n++
	}
	if j.WorksCount >= 50 {
		n++
	}
	if j.IsInDOAJ {
		n++
	}
	if strings.TrimSpace(j.CCFRank) != "" {
		n++
	}
	if strings.TrimSpace(j.GJQKWarningLevel) != "" {
		n++
	}
	if j.CommentCount > 0 {
		n++
	}
	return n
}

func hasJSONArrayContent(raw string) bool {
	value := strings.TrimSpace(raw)
	return value != "" && value != "[]" && value != "null"
}
