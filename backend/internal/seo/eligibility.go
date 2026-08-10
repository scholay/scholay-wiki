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

func journalRowIndexable(j *SEOJournal) bool {
	if j == nil || j.Status != StatusActive || j.JournalID <= 0 || strings.TrimSpace(j.CanonicalName) == "" {
		return false
	}
	return j.QualityTier == TierDetailClick ||
		strings.TrimSpace(j.Publisher) != "" ||
		hasJSONArrayContent(j.ISSNsJSON) ||
		j.JCRImpactFactor > 0 ||
		(j.OpenAlexHIndex != nil && *j.OpenAlexHIndex > 0)
}

func hasJSONArrayContent(raw string) bool {
	value := strings.TrimSpace(raw)
	return value != "" && value != "[]" && value != "null"
}
