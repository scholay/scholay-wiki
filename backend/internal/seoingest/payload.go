// ============================================================================
// Scholay学术 V1.0
// internal/seoingest —— minicod /v1/jnl/list(full=1) 响应的解析与落库映射。
//
// 字段名以真实样例为准(scratchpad jnl_plain.json / jnl_full.json + 2026-08-11
// 实测,与 api-1.json 的 spec 形状不同):
//
//	{"data":{"rows":[{"unified":{88 字段},"cover":{},"issn_details":[],
//	  "sources":{crossref,openalex,...},"submission":{},"comments":{}}],
//	  "page":N,"pageSize":N,"hasMore":true},"success":true}
//
// 原始 sources 血包单行可达 65KB,绝不落库 —— 只萃取:
//   - jcr.all_years / scimago.all_years → metrics_json 逐年趋势(≤2KB)
//   - openalex.topics top5 / comments 指数 / apc → extra_json 兜底(≤2KB)
// ============================================================================

package seoingest

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"scholar-backend/internal/seo"
)

// listPage /v1/jnl/list 的 data 层(doPost 已剥掉 {success,data} 信封)。
type listPage struct {
	Rows       []journalPayload `json:"rows"`
	Total      *int             `json:"total"`
	Page       int              `json:"page"`
	PageSize   int              `json:"pageSize"`
	TotalPages *int             `json:"totalPages"`
	HasMore    bool             `json:"hasMore"`
}

// journalMeta /v1/jnl/meta 的 data 层(2026-08-11 实测)。
type journalMeta struct {
	TotalJournals int    `json:"totalJournals"`
	LastBuiltAt   string `json:"lastBuiltAt"`
}

type journalPayload struct {
	Unified     unifiedPayload             `json:"unified"`
	Cover       *coverPayload              `json:"cover"`
	ISSNDetails []issnDetailPayload        `json:"issn_details"`
	Sources     map[string]json.RawMessage `json:"sources"`
	Submission  *submissionPayload         `json:"submission"`
	Comments    *commentsPayload           `json:"comments"`
}

// unifiedPayload full=1 时 88 字段的消费子集。上游数值字段有的以字符串下发
// ("jcr_impact_factor":"3.4"、"scimago_sjr":"1,071" 欧式小数逗号),用 flex 类型接。
type unifiedPayload struct {
	ID             int64  `json:"id"`
	CanonicalName  string `json:"canonical_name"`
	ISSNL          string `json:"issn_l"`
	PrintISSN      string `json:"print_issn"`
	ElectronicISSN string `json:"electronic_issn"`
	AllISSNs       string `json:"all_issns"`

	CrossrefPublisher string `json:"crossref_publisher"`
	DoajPublisher     string `json:"doaj_publisher"`

	OpenAlexCountry      string    `json:"openalex_country"`
	OpenAlexType         string    `json:"openalex_type"`
	OpenAlexWorksCount   int       `json:"openalex_works_count"`
	OpenAlexCitedByCount int64     `json:"openalex_cited_by_count"`
	OpenAlexHIndex       int       `json:"openalex_h_index"`
	OpenAlexI10Index     int       `json:"openalex_i10_index"`
	OpenAlex2YrCitedness flexFloat `json:"openalex_2yr_mean_citedness"`
	OpenAlexIsOA         flexBool  `json:"openalex_is_oa"`

	DoajIsInDoaj flexBool `json:"doaj_is_in_doaj"`
	DoajHasAPC   flexBool `json:"doaj_has_apc"`

	WikidataLabelZh   string `json:"wikidata_label_zh"`
	WikidataInception string `json:"wikidata_inception"`

	ScimagoYear         int    `json:"scimago_year"`
	ScimagoSJR          string `json:"scimago_sjr"`
	ScimagoBestQuartile string `json:"scimago_best_quartile"`
	ScimagoHIndex       int    `json:"scimago_h_index"`

	JCRYear            int       `json:"jcr_year"`
	JCRImpactFactor    flexFloat `json:"jcr_impact_factor"`
	JCRImpactFactorNum flexFloat `json:"jcr_impact_factor_num"`
	JCRQuartile        string    `json:"jcr_quartile"`
	JCRCategory        string    `json:"jcr_category"`

	FQBYear                 int    `json:"fqb_year"`
	FQBMajorCategory        string `json:"fqb_major_category"`
	FQBMajorQuartile        string `json:"fqb_major_quartile"`
	FQBTop                  string `json:"fqb_top"`
	FQBSubcategory1         string `json:"fqb_subcategory_1"`
	FQBSubcategory1Quartile string `json:"fqb_subcategory_1_quartile"`

	XRYear            int    `json:"xr_year"`
	XRMajorCategoryCN string `json:"xr_major_category_cn"`
	XRMajorQuartile   string `json:"xr_major_quartile"`
	XRTop             string `json:"xr_top"`

	CCFYear  int    `json:"ccf_year"`
	CCFRank  string `json:"ccf_rank"`
	CCFField string `json:"ccf_field"`

	GJQKYear          int    `json:"gjqk_year"`
	GJQKWarningLevel  string `json:"gjqk_warning_level"`
	GJQKWarningReason string `json:"gjqk_warning_reason"`

	HasJCR     flexBool `json:"has_jcr"`
	HasFQB     flexBool `json:"has_fqb"`
	HasXR      flexBool `json:"has_xr"`
	HasScimago flexBool `json:"has_scimago"`
	HasCCF     flexBool `json:"has_ccf"`
	HasDoaj    flexBool `json:"has_doaj"`

	BuiltAt string `json:"built_at"`
}

type coverPayload struct {
	OriginalURL string `json:"original_url"`
	CoverURL    string `json:"cover_url"`
}

type issnDetailPayload struct {
	ISSN string `json:"issn"`
	Type string `json:"type"`
}

type submissionPayload struct {
	HasGuideline bool   `json:"has_guideline"`
	HasLatex     bool   `json:"has_latex"`
	LatexClass   string `json:"latex_class"`
}

type commentsPayload struct {
	HasComments     bool      `json:"has_comments"`
	Count           int       `json:"count"`
	Rating          flexFloat `json:"rating"`
	DifficultyIndex flexFloat `json:"difficulty_index"`
	SpeedIndex      flexFloat `json:"speed_index"`
}

// ─── sources 萃取用的窄形状(其余字段一律不解码)────────────────────────────────

type jcrSourcePayload struct {
	AllYears []struct {
		Year         int       `json:"year"`
		ImpactFactor flexFloat `json:"impact_factor"`
	} `json:"all_years"`
}

type scimagoSourcePayload struct {
	AllYears []struct {
		Year         int    `json:"year"`
		SJR          string `json:"sjr"`
		BestQuartile string `json:"sjr_best_quartile"`
	} `json:"all_years"`
}

type openalexSourcePayload struct {
	Main struct {
		HomepageURL string    `json:"homepage_url"`
		APCUSD      flexFloat `json:"apc_usd"`
	} `json:"main"`
	Topics []struct {
		DisplayName string `json:"display_name"`
		Count       int    `json:"count"`
	} `json:"topics"`
}

type commentsSourcePayload struct {
	AvgFirstReviewDays    flexFloat `json:"avg_first_review_days"`
	MedianFirstReviewDays flexFloat `json:"median_first_review_days"`
}

// ─── flex 类型:上游数值字段的字符串/数字双形态 ────────────────────────────────

// flexFloat 接受 JSON number / 数字字符串(含欧式小数逗号 "1,071")/ null。
type flexFloat float64

func (f *flexFloat) UnmarshalJSON(data []byte) error {
	s := strings.TrimSpace(string(data))
	if s == "" || s == "null" {
		*f = 0
		return nil
	}
	s = strings.Trim(s, `"`)
	if s == "" {
		*f = 0
		return nil
	}
	// SCImago CSV 用逗号作小数分隔符("1,071" = 1.071);数据域内不存在千分位语义。
	s = strings.ReplaceAll(s, ",", ".")
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		*f = 0
		return nil // 解析不动的脏值按缺失处理, 不让单行毒死整页
	}
	*f = flexFloat(v)
	return nil
}

// flexBool 接受 JSON bool / 0/1 数字 / "0"/"1" 字符串 / null。
type flexBool bool

func (b *flexBool) UnmarshalJSON(data []byte) error {
	s := strings.Trim(strings.TrimSpace(string(data)), `"`)
	*b = flexBool(s == "1" || strings.EqualFold(s, "true"))
	return nil
}

// ─── 映射 ────────────────────────────────────────────────────────────────────

const (
	compactJSONByteCap = 2048  // metrics_json / extra_json 单列上限(spec ≤2KB)
	trendYearCap       = 10    // 逐年趋势最多保留最近 10 年
	topicCap           = 5     // openalex topics top5
	daysPerMonth       = 30.44 // 平均月长, 审稿周期 天→月 折算
)

// parseListPage 解析 /v1/jnl/list 的 data 层字节。
func parseListPage(raw json.RawMessage) (*listPage, error) {
	var page listPage
	if err := json.Unmarshal(raw, &page); err != nil {
		return nil, fmt.Errorf("seoingest: parse list page: %w", err)
	}
	return &page, nil
}

// parseJournalMeta 解析 /v1/jnl/meta 的 data 层字节。
func parseJournalMeta(raw json.RawMessage) (int, time.Time, error) {
	var meta journalMeta
	if err := json.Unmarshal(raw, &meta); err != nil {
		return 0, time.Time{}, fmt.Errorf("seoingest: parse meta: %w", err)
	}
	builtAt, err := time.Parse(time.RFC3339, meta.LastBuiltAt)
	if err != nil {
		return meta.TotalJournals, time.Time{}, fmt.Errorf("seoingest: parse lastBuiltAt %q: %w", meta.LastBuiltAt, err)
	}
	return meta.TotalJournals, builtAt, nil
}

// mapJournalRow 把一行上游 payload 映射为落库行。canonical_name 空返回 nil(跳过)。
func mapJournalRow(p *journalPayload) *seo.JournalIngestRow {
	u := &p.Unified
	name := strings.TrimSpace(u.CanonicalName)
	if u.ID <= 0 || name == "" {
		return nil
	}

	row := &seo.JournalIngestRow{
		JournalID:     u.ID,
		CanonicalName: name,
		Slug:          seo.GenerateJournalSlug(name),
		Publisher:     firstNonEmpty(u.CrossrefPublisher, u.DoajPublisher),
		ISSNL:         strings.TrimSpace(u.ISSNL),
		// 只收 openalex 两位国家码 —— /journals/country/{cc} 枢纽按码路由,
		// 混入 scimago 的全名("United States")会把维度打碎。
		Country: strings.TrimSpace(u.OpenAlexCountry),
		Type:    strings.TrimSpace(u.OpenAlexType),
		IsOA:    bool(u.OpenAlexIsOA) || bool(u.DoajIsInDoaj),

		JCRImpactFactor: firstPositive(float64(u.JCRImpactFactorNum), float64(u.JCRImpactFactor)),
		JCRQuartile:     strings.TrimSpace(u.JCRQuartile),
		JCRCategory:     strings.TrimSpace(u.JCRCategory),
		JCRYear:         u.JCRYear,
		OpenAlexHIndex:  u.OpenAlexHIndex,

		SJR:             strings.TrimSpace(u.ScimagoSJR),
		SJRBestQuartile: strings.TrimSpace(u.ScimagoBestQuartile),
		ScimagoHIndex:   u.ScimagoHIndex,

		FQBMajorCategory: strings.TrimSpace(u.FQBMajorCategory),
		FQBMajorQuartile: normalizeQuartileDigit(u.FQBMajorQuartile),
		FQBTop:           isAffirmative(u.FQBTop),
		FQBYear:          u.FQBYear,
		FQBSubcategory:   strings.TrimSpace(u.FQBSubcategory1),
		FQBSubQuartile:   normalizeQuartileDigit(u.FQBSubcategory1Quartile),

		XRMajorCategory: strings.TrimSpace(u.XRMajorCategoryCN),
		XRMajorQuartile: normalizeQuartileDigit(u.XRMajorQuartile),
		XRTop:           isAffirmative(u.XRTop),
		XRYear:          u.XRYear,

		CCFRank:  strings.TrimSpace(u.CCFRank),
		CCFField: strings.TrimSpace(u.CCFField),

		GJQKWarningLevel: strings.TrimSpace(u.GJQKWarningLevel),
		GJQKWarningWhy:   strings.TrimSpace(u.GJQKWarningReason),
		GJQKYear:         u.GJQKYear,

		WorksCount:     u.OpenAlexWorksCount,
		CitedByCount:   u.OpenAlexCitedByCount,
		I10Index:       u.OpenAlexI10Index,
		TwoYrCitedness: round3(float64(u.OpenAlex2YrCitedness)),

		IsInDOAJ:        bool(u.DoajIsInDoaj),
		HasAPC:          bool(u.DoajHasAPC),
		WikidataLabelZH: strings.TrimSpace(u.WikidataLabelZh),
		Inception:       truncate(strings.TrimSpace(u.WikidataInception), 16),
	}

	row.ValueTier = computeValueTier(u)
	row.ISSNsJSON = buildISSNsJSON(p)

	if p.Cover != nil {
		// original_url 是可公网访问的外链封面;cover_url 是 minicod 站内相对路径,
		// 落库没有可用性(跨域且可能要 key),不取。
		row.CoverURL = truncate(strings.TrimSpace(p.Cover.OriginalURL), 512)
	}
	if p.Submission != nil {
		row.HasGuideline = p.Submission.HasGuideline
		row.HasLatex = p.Submission.HasLatex
		row.LatexClass = truncate(strings.TrimSpace(p.Submission.LatexClass), 64)
	}
	if p.Comments != nil {
		row.CommentCount = p.Comments.Count
		row.CommentRating = round2(float64(p.Comments.Rating))
	}

	row.MetricsJSON = buildMetricsJSON(p.Sources)
	row.ExtraJSON = buildExtraJSON(p.Sources, p.Comments)
	row.FirstReviewMonths = firstReviewMonths(p.Sources)

	if builtAt, err := time.Parse(time.RFC3339, u.BuiltAt); err == nil {
		row.UpstreamBuiltAt = &builtAt
	}

	row.ContentHash = computeContentHash(row)
	return row
}

// computeValueTier spec 口径:has_jcr|has_fqb|has_xr→1; has_scimago|has_ccf→2;
// doaj|is_oa→3; 其余→4。
func computeValueTier(u *unifiedPayload) int {
	switch {
	case bool(u.HasJCR) || bool(u.HasFQB) || bool(u.HasXR):
		return seo.JournalTierPartitioned
	case bool(u.HasScimago) || bool(u.HasCCF):
		return seo.JournalTierScimagoCCF
	case bool(u.HasDoaj) || bool(u.OpenAlexIsOA):
		return seo.JournalTierOA
	default:
		return seo.JournalTierOpenAlexOnly
	}
}

// computeContentHash 页面可见字段的 SHA1(CHAR(40))。
// 这是 resync 时 updated_at 是否 bump 的唯一判据 —— 字段集合就是「页面渲染会用到
// 的内容」:任何进模板的新列都必须加进来,否则该列变化不会触发 lastmod。
func computeContentHash(row *seo.JournalIngestRow) string {
	parts := []string{
		row.CanonicalName, row.Publisher, row.ISSNL, row.ISSNsJSON,
		row.Country, row.Type, boolBit(row.IsOA),
		f2s(row.JCRImpactFactor), row.JCRQuartile, row.JCRCategory, itoa(row.JCRYear), itoa(row.OpenAlexHIndex),
		row.SJR, row.SJRBestQuartile, itoa(row.ScimagoHIndex),
		row.FQBMajorCategory, row.FQBMajorQuartile, boolBit(row.FQBTop), itoa(row.FQBYear),
		row.FQBSubcategory, row.FQBSubQuartile,
		row.XRMajorCategory, row.XRMajorQuartile, boolBit(row.XRTop), itoa(row.XRYear),
		row.CCFRank, row.CCFField,
		row.GJQKWarningLevel, row.GJQKWarningWhy, itoa(row.GJQKYear),
		itoa(row.WorksCount), strconv.FormatInt(row.CitedByCount, 10), itoa(row.I10Index), f2s(row.TwoYrCitedness),
		boolBit(row.IsInDOAJ), boolBit(row.HasAPC), row.WikidataLabelZH, row.Inception, row.CoverURL,
		boolBit(row.HasGuideline), boolBit(row.HasLatex), row.LatexClass,
		itoa(row.CommentCount), f2s(row.CommentRating), f2s(row.FirstReviewMonths),
		row.MetricsJSON, row.ExtraJSON,
	}
	sum := sha1.Sum([]byte(strings.Join(parts, "\x1f")))
	return hex.EncodeToString(sum[:])
}

// buildISSNsJSON issn_details 优先(带类型的权威列表),缺失回落 print/electronic。
func buildISSNsJSON(p *journalPayload) string {
	raw := make([]string, 0, 4)
	for _, d := range p.ISSNDetails {
		raw = append(raw, d.ISSN)
	}
	if len(raw) == 0 {
		raw = append(raw, p.Unified.ISSNL, p.Unified.PrintISSN, p.Unified.ElectronicISSN)
	}
	issns := seo.NormalizeISSNs(raw)
	if len(issns) == 0 {
		return ""
	}
	b, err := json.Marshal(issns)
	if err != nil {
		return ""
	}
	return string(b)
}

// buildMetricsJSON 逐年趋势:{"jcr":[[year,if],...],"sjr":[[year,sjr,quartile],...]}。
// 各序列按年份升序、保留最近 trendYearCap 年;超 2KB 逐步减半直到装下。
func buildMetricsJSON(sources map[string]json.RawMessage) string {
	type pair struct {
		year int
		vals []any
	}
	var jcrSeries, sjrSeries []pair

	if raw, ok := sources["jcr"]; ok {
		var src jcrSourcePayload
		if json.Unmarshal(raw, &src) == nil {
			for _, y := range src.AllYears {
				if y.Year > 0 && float64(y.ImpactFactor) > 0 {
					jcrSeries = append(jcrSeries, pair{y.Year, []any{y.Year, round3(float64(y.ImpactFactor))}})
				}
			}
		}
	}
	if raw, ok := sources["scimago"]; ok {
		var src scimagoSourcePayload
		if json.Unmarshal(raw, &src) == nil {
			for _, y := range src.AllYears {
				sjr := parseEuroFloat(y.SJR)
				if y.Year > 0 && sjr > 0 {
					sjrSeries = append(sjrSeries, pair{y.Year, []any{y.Year, round3(sjr), strings.TrimSpace(y.BestQuartile)}})
				}
			}
		}
	}
	if len(jcrSeries) == 0 && len(sjrSeries) == 0 {
		return ""
	}

	build := func(keep int) string {
		out := map[string][][]any{}
		for name, series := range map[string][]pair{"jcr": jcrSeries, "sjr": sjrSeries} {
			if len(series) == 0 {
				continue
			}
			sort.Slice(series, func(i, j int) bool { return series[i].year < series[j].year })
			deduped := series[:0:len(series)]
			seen := map[int]bool{}
			for _, e := range series {
				if !seen[e.year] {
					seen[e.year] = true
					deduped = append(deduped, e)
				}
			}
			if len(deduped) > keep {
				deduped = deduped[len(deduped)-keep:]
			}
			rows := make([][]any, 0, len(deduped))
			for _, e := range deduped {
				rows = append(rows, e.vals)
			}
			out[name] = rows
		}
		b, err := json.Marshal(out)
		if err != nil {
			return ""
		}
		return string(b)
	}

	for keep := trendYearCap; keep >= 2; keep /= 2 {
		if s := build(keep); len(s) <= compactJSONByteCap {
			return s
		}
	}
	return ""
}

// buildExtraJSON 兜底扩展:openalex topics top5 / apc / homepage / comments 指数。
// 超 2KB 先丢 topics,再整体放弃(extra 是增强,不是底线)。
func buildExtraJSON(sources map[string]json.RawMessage, comments *commentsPayload) string {
	out := map[string]any{}

	if raw, ok := sources["openalex"]; ok {
		var src openalexSourcePayload
		if json.Unmarshal(raw, &src) == nil {
			sort.Slice(src.Topics, func(i, j int) bool { return src.Topics[i].Count > src.Topics[j].Count })
			topics := make([]map[string]any, 0, topicCap)
			for _, t := range src.Topics {
				if len(topics) >= topicCap {
					break
				}
				if name := strings.TrimSpace(t.DisplayName); name != "" {
					topics = append(topics, map[string]any{"name": name, "count": t.Count})
				}
			}
			if len(topics) > 0 {
				out["topics"] = topics
			}
			if v := float64(src.Main.APCUSD); v > 0 {
				out["apc_usd"] = v
			}
			if h := strings.TrimSpace(src.Main.HomepageURL); h != "" {
				out["homepage"] = h
			}
		}
	}
	if comments != nil && comments.Count > 0 {
		cm := map[string]any{}
		if v := round2(float64(comments.DifficultyIndex)); v > 0 {
			cm["difficulty"] = v
		}
		if v := round2(float64(comments.SpeedIndex)); v > 0 {
			cm["speed"] = v
		}
		if len(cm) > 0 {
			out["comments"] = cm
		}
	}
	if len(out) == 0 {
		return ""
	}
	b, err := json.Marshal(out)
	if err != nil {
		return ""
	}
	if len(b) > compactJSONByteCap {
		delete(out, "topics")
		if b, err = json.Marshal(out); err != nil || len(b) > compactJSONByteCap {
			return ""
		}
	}
	return string(b)
}

// firstReviewMonths comments 聚合源的平均首审天数 → 月(除以平均月长,2 位小数)。
// 上游没有独立的 scirev 字段(2026-08-11 实测),avg_first_review_days 即该语义。
func firstReviewMonths(sources map[string]json.RawMessage) float64 {
	raw, ok := sources["comments"]
	if !ok {
		return 0
	}
	var src commentsSourcePayload
	if json.Unmarshal(raw, &src) != nil {
		return 0
	}
	days := float64(src.AvgFirstReviewDays)
	if days <= 0 {
		days = float64(src.MedianFirstReviewDays)
	}
	if days <= 0 {
		return 0
	}
	return round2(days / daysPerMonth)
}

// ─── 小工具 ──────────────────────────────────────────────────────────────────

// normalizeQuartileDigit 中科院/新锐分区的原始形态("4 [2568/5603]" / "3 区" / "3")
// 归一为纯数字串;"—"/空/无数字 → ""(列宽 VARCHAR(8),排名分母进不了页面主指标)。
func normalizeQuartileDigit(raw string) string {
	s := strings.TrimSpace(raw)
	digits := strings.Builder{}
	for _, r := range s {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
			continue
		}
		if digits.Len() > 0 {
			break
		}
	}
	return digits.String()
}

// isAffirmative fqb_top / xr_top 的中文取值("是"/"否"/"—")→ bool。
func isAffirmative(raw string) bool {
	return strings.TrimSpace(raw) == "是"
}

func parseEuroFloat(raw string) float64 {
	s := strings.ReplaceAll(strings.Trim(strings.TrimSpace(raw), `"`), ",", ".")
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return v
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}

func firstPositive(vals ...float64) float64 {
	for _, v := range vals {
		if v > 0 {
			return v
		}
	}
	return 0
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}

func round2(v float64) float64 { return math.Round(v*100) / 100 }
func round3(v float64) float64 { return math.Round(v*1000) / 1000 }

func boolBit(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

func itoa(n int) string { return strconv.Itoa(n) }

// f2s 浮点入哈希的稳定序列化(3 位小数覆盖 IF/SJR/评分粒度)。
func f2s(f float64) string { return strconv.FormatFloat(round3(f), 'f', -1, 64) }
