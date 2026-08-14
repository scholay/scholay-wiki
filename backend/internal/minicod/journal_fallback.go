// ============================================================================
// 期刊详情的本地回落(2026-08-13 线上事故)
//
// 事故形态:minicod 上游的 /v1/jnl/get 单端点持续 502(Cloudflare Bad Gateway),
// 日志窗口内 **0 次成功 / 14 次失败**,而同期 works/authors 等其它端点全部正常。
// 后果:每一个 /journal/{id}/{slug} 页面对真实用户都渲染成「期刊加载失败」——
// 而我们**自己库里就有 100,767 行完整期刊数据**(seo_journals,0125 迁移刚扩出
// JCR/SJR/中科院/新锐/CCF/预警/OA 全套指标),只是从来没被当成读路径用过。
//
// 为什么必须修在这一层:
//   ① SSR 注入走的是 seo_journals(所以爬虫看到的 HTML 是好的),SPA 却只认上游 ——
//      同一个 URL 对爬虫正常、对用户报错,这种分裂本身就是 SEO 事故(渲染型引擎
//      按用户视角判定,会把它算成软 404);
//   ② 期刊垂类正准备放行 8 万页,带着这个缺陷放行 = 批量生产坏页面;
//   ③ 修在 handler 是单点,SPA / SSR / 未来任何消费方一起受益。
//
// 语义边界(刻意保守):
//   - 只在上游**失败**时回落,上游成功一律以上游为准(本地是缓存不是真源);
//   - 回落响应带 `degraded: true`,消费方可选择提示「部分数据可能不是最新」;
//   - 本地无该期刊 → 照旧返回上游错误(不编造数据)。
// ============================================================================

package minicod

import (
	"encoding/json"

	"scholar-backend/internal/seo"
)

// JournalFallbackProvider 由 seo.Service 实现:按 journal_id 取本地期刊行。
// minicod 已经 import seo(buildJournalSEOSeed 用 seo.JournalSeed),无新增依赖方向。
type JournalFallbackProvider interface {
	GetJournalByID(journalID int64) (*seo.SEOJournal, error)
}

// SetJournalFallback 注入本地回落源(bootstrap 调一次;nil 则功能关闭,行为同旧版)。
func (h *Handler) SetJournalFallback(p JournalFallbackProvider) { h.journalFallback = p }

// journalFallbackJSON 用本地行拼出与上游 flat 形状同字段名的响应。
// 字段名严格对齐 journalSeedFields 与前端 RawJournal(frontend-user/src/features/
// journals/api/journals.ts)—— 两侧任一改字段名,这里要跟着改。
// 返回 nil 表示本地也没有,调用方应保留上游错误。
func journalFallbackJSON(j *seo.SEOJournal) json.RawMessage {
	if j == nil || j.JournalID <= 0 || j.CanonicalName == "" {
		return nil
	}
	out := map[string]any{
		"id":             j.JournalID,
		"canonical_name": j.CanonicalName,
		"slug":           j.Slug,
		// degraded 是本回落独有的标记:上游不可用时为 true。消费方据此决定要不要
		// 提示用户「部分字段可能不是最新」;上游正常返回时该字段不存在。
		"degraded": true,
	}
	put := func(k string, v any) {
		switch t := v.(type) {
		case string:
			if t == "" {
				return
			}
		case int:
			if t == 0 {
				return
			}
		case int64:
			if t == 0 {
				return
			}
		case float64:
			if t == 0 {
				return
			}
		case bool:
			if !t {
				return
			}
		}
		out[k] = v
	}

	// 身份 / 出版
	put("crossref_publisher", j.Publisher)
	put("issn_l", j.ISSNL)
	put("openalex_country", j.Country)
	put("openalex_type", j.Type)
	put("openalex_is_oa", j.IsOA)
	put("is_in_doaj", j.IsInDOAJ)
	put("wikidata_label_zh", j.WikidataLabelZH)
	put("inception", j.Inception)
	put("cover_url", j.CoverURL)

	// issns_json 是 ["1234-5678", ...];前端读 print_issn / electronic_issn / all_issns。
	// 输出前统一走 NormalizeISSNs(拆分+去重),与 SSR 侧同口径。
	if j.ISSNsJSON != "" {
		var issns []string
		if err := json.Unmarshal([]byte(j.ISSNsJSON), &issns); err == nil {
			issns = seo.NormalizeISSNs(issns)
			if len(issns) > 0 {
				out["print_issn"] = issns[0]
				if len(issns) > 1 {
					out["electronic_issn"] = issns[1]
				}
				out["all_issns"] = joinComma(issns)
			}
		}
	}

	// 指标矩阵
	put("jcr_impact_factor", j.JCRImpactFactor)
	put("jcr_quartile", j.JCRQuartile)
	put("jcr_category", j.JCRCategory)
	put("jcr_year", j.JCRYear)
	put("sjr", j.SJR)
	put("scimago_best_quartile", j.SJRBestQuartile)
	put("sjr_best_quartile", j.SJRBestQuartile)
	put("scimago_h_index", j.ScimagoHIndex)
	put("fqb_major_category", j.FQBMajorCategory)
	put("fqb_major_quartile", j.FQBMajorQuartile)
	put("fqb_top", j.FQBTop)
	put("fqb_year", j.FQBYear)
	put("fqb_subcategory", j.FQBSubcategory)
	put("fqb_sub_quartile", j.FQBSubQuartile)
	put("xr_major_category_cn", j.XRMajorCategory)
	put("xr_major_quartile", j.XRMajorQuartile)
	put("xr_top", j.XRTop)
	put("xr_year", j.XRYear)
	put("ccf_rank", j.CCFRank)
	put("ccf_field", j.CCFField)

	// 预警(高价值搜索词「XX期刊 预警」)
	put("gjqk_warning_level", j.GJQKWarningLevel)
	put("gjqk_warning_reason", j.GJQKWarningWhy)
	put("gjqk_year", j.GJQKYear)

	// 体量 / 投稿参考
	put("openalex_works_count", j.WorksCount)
	put("works_count", j.WorksCount)
	put("openalex_cited_by_count", j.CitedByCount)
	put("cited_by_count", j.CitedByCount)
	put("i10_index", j.I10Index)
	put("two_yr_citedness", j.TwoYrCitedness)
	put("has_apc", j.HasAPC)
	put("has_guideline", j.HasGuideline)
	put("has_latex", j.HasLatex)
	put("latex_class", j.LatexClass)
	put("comment_count", j.CommentCount)
	put("comment_rating", j.CommentRating)
	put("scirev_first_review_months", j.FirstReviewMonths)
	if j.OpenAlexHIndex != nil && *j.OpenAlexHIndex > 0 {
		out["openalex_h_index"] = *j.OpenAlexHIndex
	}

	raw, err := json.Marshal(out)
	if err != nil {
		return nil
	}
	return raw
}

func joinComma(in []string) string {
	s := ""
	for i, v := range in {
		if i > 0 {
			s += ", "
		}
		s += v
	}
	return s
}
