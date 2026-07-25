// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package minicod

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// ======================== Minicod API Raw Response Types ========================
// These match the JSON format returned by the Minicod API (snake_case)

// APIResponse is the envelope for all Minicod API responses
type APIResponse struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

// APIStatusError 上游业务信封 code != 0 的错误(HTTP 200 但业务失败,区别于 HTTP 层的
// upstream.Error)。doPost 返回它,调用方可 errors.As 拿 Code 区分「资源未找到」(40401)
// 等正常业务态与真故障 —— 例:DOI/标题精确查询未命中不应计入熔断。
type APIStatusError struct {
	Code    int
	Message string
}

func (e *APIStatusError) Error() string {
	return fmt.Sprintf("minicod API error (code %d): %s", e.Code, e.Message)
}

// RawPaper matches Minicod's paper JSON format
type RawPaper struct {
	ID              string      `json:"id"`
	Source          string      `json:"source"`
	Title           string      `json:"title"`
	Abstract        string      `json:"abstract"`
	Year            int         `json:"year"`
	PublicationDate string      `json:"publication_date"`
	DOI             string      `json:"doi"`
	CitationCount   int         `json:"citation_count"`
	ReferenceCount  int         `json:"reference_count"`
	Venue           string      `json:"venue"`
	IsOpenAccess    bool        `json:"is_open_access"`
	PdfURL          string      `json:"pdf_url"`
	URL             string      `json:"url"`
	FieldsOfStudy   []string    `json:"fields_of_study"`
	Authors         []RawAuthor `json:"authors"`
	// api-1.json 的 Paper 新增字段:tldr 是**纯字符串**摘要(非旧 Semantic Scholar 的 {model,text} 对象),
	// bibtex 是可直接引用的条目。此前 RawPaper 不解析 → 前端 TLDR 永 nil、每篇 BibTeX 丢失(对齐审计 #17)。
	Tldr   string `json:"tldr"`
	Bibtex string `json:"bibtex"`
}

// RawAuthor matches Minicod's author JSON format
type RawAuthor struct {
	ID            string   `json:"id"`
	Source        string   `json:"source"`
	Name          string   `json:"name"`
	Affiliations  []string `json:"affiliations"`
	PaperCount    int      `json:"paper_count"`
	CitationCount int      `json:"citation_count"`
	HIndex        int      `json:"h_index"`
	ORCID         string   `json:"orcid"`
	URL           string   `json:"url"`
}

// RawPaperSearchResult matches Minicod's paper search result
type RawPaperSearchResult struct {
	Items          []RawPaper `json:"items"`
	Total          int        `json:"total"`
	Offset         int        `json:"offset"`
	Limit          int        `json:"limit"`
	SourcesQueried []string   `json:"sources_queried"`
}

// RawAuthorSearchResult matches Minicod's author search result
type RawAuthorSearchResult struct {
	Items          []RawAuthor `json:"items"`
	Total          int         `json:"total"`
	Offset         int         `json:"offset"`
	Limit          int         `json:"limit"`
	SourcesQueried []string    `json:"sources_queried"`
}

// RawRecommendationResult matches Minicod's recommendation result
type RawRecommendationResult struct {
	RecommendedPapers []RawPaper `json:"recommended_papers"`
}

// RawAutocompleteItem 兼容 STC / OLX 两种 autocomplete item 形态:
//   STC (SemanticAutocompleteItem): { id, title }
//   OLX (AutocompleteItem):         { id, display_name, hint, ... }
// 上游字段名不同 —— STC 用 title, OLX 用 display_name。Label() 取二者非空者,
// 修掉了"OLX 联想结果标题全空"的 bug。
type RawAutocompleteItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	DisplayName string `json:"display_name"`
}

// Label 返回展示标题, 优先 title (STC), 回落 display_name (OLX)。
func (r RawAutocompleteItem) Label() string {
	if r.Title != "" {
		return r.Title
	}
	return r.DisplayName
}

// RawBulkSearchResult matches Minicod's bulk search result
type RawBulkSearchResult struct {
	Data  []RawPaper `json:"data"`
	Total int        `json:"total"`
	Token string     `json:"token"`
}

// ======================== Frontend-Compatible Output Types ========================
// These produce the same JSON as the existing semanticscholar types (camelCase)
// so the frontend doesn't need changes.

// Paper matches the existing frontend Paper contract
type Paper struct {
	PaperID          string             `json:"paperId,omitempty"`
	CorpusID         int64              `json:"corpusId,omitempty"`
	Title            string             `json:"title,omitempty"`
	Abstract         string             `json:"abstract,omitempty"`
	Year             int                `json:"year,omitempty"`
	PublicationDate  string             `json:"publicationDate,omitempty"`
	Venue            string             `json:"venue,omitempty"`
	URL              string             `json:"url,omitempty"`
	CitationCount    int                `json:"citationCount,omitempty"`
	ReferenceCount   int                `json:"referenceCount,omitempty"`
	InfluentialCount int                `json:"influentialCitationCount,omitempty"`
	IsOpenAccess     bool               `json:"isOpenAccess,omitempty"`
	OpenAccessPDF    *OpenAccessPDF     `json:"openAccessPdf,omitempty"`
	FieldsOfStudy    []string           `json:"fieldsOfStudy,omitempty"`
	S2FieldsOfStudy  []S2FieldOfStudy   `json:"s2FieldsOfStudy,omitempty"`
	Authors          []Author           `json:"authors,omitempty"`
	ExternalIDs      map[string]any     `json:"externalIds,omitempty"`
	TLDR             *TLDR              `json:"tldr,omitempty"`
	// BibTeX:api-1.json 的 Paper 直供的可引用条目(prism 引用接地 / 前端「复制引用」可直接用)。
	BibTeX           string             `json:"bibtex,omitempty"`
	Journal          *JournalRef        `json:"journal,omitempty"`
	Source           string             `json:"source,omitempty"`
	// IsFavorited 仅在「已登录」请求时由 handler 后置标注(在共享缓存命中之后,逐请求标注,
	// 不污染按 query 缓存的公共结果);匿名请求省略。供搜索结果直接显示「已收藏」,省一次 /library/check。
	IsFavorited *bool `json:"isFavorited,omitempty"`
}

// Author matches the existing frontend Author contract
type Author struct {
	AuthorID      string   `json:"authorId,omitempty"`
	Name          string   `json:"name,omitempty"`
	URL           string   `json:"url,omitempty"`
	Affiliations  []string `json:"affiliations,omitempty"`
	Homepage      string   `json:"homepage,omitempty"`
	PaperCount    int      `json:"paperCount,omitempty"`
	CitationCount int      `json:"citationCount,omitempty"`
	HIndex        int      `json:"hIndex,omitempty"`
	// ORCID 学者唯一标识(裸 iD, 形如 0000-0002-1825-0097)。Minicod 部分作者带,
	// 历史上在 ConvertAuthor 被丢弃,现保留 —— 前端展示「已验证 ORCID」链接 +
	// SSR sameAs 结构化数据(权威信号, 利于 SEO/GEO)。
	ORCID  string `json:"orcid,omitempty"`
	Source string `json:"source,omitempty"`
}

// Citation matches the existing frontend Citation contract
type Citation struct {
	PaperId         string         `json:"paperId,omitempty"`
	ExternalIDs     map[string]any `json:"externalIds,omitempty"`
	URL             string         `json:"url,omitempty"`
	Title           string         `json:"title,omitempty"`
	Abstract        string         `json:"abstract,omitempty"`
	Venue           string         `json:"venue,omitempty"`
	Year            int            `json:"year,omitempty"`
	ReferenceCount  int            `json:"referenceCount,omitempty"`
	CitationCount   int            `json:"citationCount,omitempty"`
	OpenAccessPdf   *OpenAccessPDF `json:"openAccessPdf,omitempty"`
	PublicationDate string         `json:"publicationDate,omitempty"`
	Authors         []Author       `json:"authors,omitempty"`
	Source          string         `json:"source,omitempty"`
}

// OpenAccessPDF contains open access PDF information
type OpenAccessPDF struct {
	URL    string `json:"url,omitempty"`
	Status string `json:"status,omitempty"`
}

// S2FieldOfStudy represents field of study classification
type S2FieldOfStudy struct {
	Category string `json:"category,omitempty"`
	Source   string `json:"source,omitempty"`
}

// TLDR represents the auto-generated summary
type TLDR struct {
	Model string `json:"model,omitempty"`
	Text  string `json:"text,omitempty"`
}

// JournalRef represents journal publication information
type JournalRef struct {
	Name   string `json:"name,omitempty"`
	Pages  string `json:"pages,omitempty"`
	Volume string `json:"volume,omitempty"`
}

// SearchResponse matches the existing frontend SearchResponse contract
type SearchResponse struct {
	Total  int     `json:"total"`
	Offset int     `json:"offset"`
	Next   int     `json:"next,omitempty"`
	Data   []Paper `json:"data"`
	// W6 P1-5 检索透明化(纯增量,omitempty 前端零改动兼容;旧 Redis 缓存条目缺字段随 TTL 自愈):
	// SourcesQueried = 上游本次实际查询的库(透传 raw sources_queried,此前解析后被丢弃);
	// ActualSource   = 命中的 minicod 源(stc/olx/pmd),failover 后即真实供数源。
	SourcesQueried []string `json:"sourcesQueried,omitempty"`
	ActualSource   string   `json:"actualSource,omitempty"`
}

// AuthorSearchResponse matches the existing frontend AuthorSearchResponse contract
type AuthorSearchResponse struct {
	Total  int      `json:"total"`
	Offset int      `json:"offset"`
	Next   int      `json:"next,omitempty"`
	Data   []Author `json:"data"`
}

// CitationsResponse matches the existing frontend CitationsResponse contract
type CitationsResponse struct {
	Offset int        `json:"offset"`
	Next   int        `json:"next,omitempty"`
	Data   []Citation `json:"data"`
}

// ReferencesResponse matches the existing frontend ReferencesResponse contract
type ReferencesResponse struct {
	Offset int        `json:"offset"`
	Next   int        `json:"next,omitempty"`
	Data   []Citation `json:"data"`
}

// RecommendationsResponse matches the existing frontend RecommendationsResponse contract
type RecommendationsResponse struct {
	RecommendedPapers []Paper `json:"recommendedPapers"`
}

// AutocompleteMatch represents a single autocomplete suggestion
type AutocompleteMatch struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	AuthorsYear string `json:"authorsYear"`
	// Source 标识来源("stc" / "olx" / "pmd"),前端展示成 minicod-x / minicod-o / minicod-p
	Source string `json:"source,omitempty"`
}

// AutocompleteResponse represents paper autocomplete response
type AutocompleteResponse struct {
	Matches []AutocompleteMatch `json:"matches"`
}

// SearchSuggestionsResponse represents combined search suggestions
type SearchSuggestionsResponse struct {
	Papers  []AutocompleteMatch `json:"papers"`
	Authors []Author            `json:"authors"`
}

// ======================== Request Types ========================

// PaperSearchOptions contains options for paper search
type PaperSearchOptions struct {
	Query            string
	YearFrom         int
	YearTo           int
	DateFrom         string   // YYYY-MM-DD,比 year_from 精度更高;同时提供时 date_* 优先
	DateTo           string   // YYYY-MM-DD
	PublicationTypes []string // maps to upstream "types"(stc/olx 才支持)
	OpenAccessPDF    string   // "true" → upstream "open_access": true (stc/olx)
	Venue            []string
	FieldsOfStudy    []string // maps to upstream "subjects"(stc/olx)
	Fields           []string
	Offset           int
	Limit            int
	MinCitationCount int    // maps to upstream "min_citations"(stc/olx)
	Source           string // stc, olx, pmd, or all (default: stc)
	Sort             string // relevance | citations | date — STC relevance 端点不支持非默认 sort
}

// AuthorSearchOptions contains options for author search
type AuthorSearchOptions struct {
	Query  string
	Fields []string
	Offset int
	Limit  int
	Source string // stc or olx
}

// CitationsOptions contains options for fetching citations
type CitationsOptions struct {
	Fields []string
	Offset int
	Limit  int
}

// RecommendationsOptions contains options for paper recommendations
type RecommendationsOptions struct {
	Fields           []string
	Limit            int
	PositivePaperIDs []string
	NegativePaperIDs []string
}

// PaperDetailsOptions contains options for fetching paper details
type PaperDetailsOptions struct {
	Fields []string
}

// ======================== JNL (Journal) Types ========================

// Journal represents a journal entry from JNL API
type Journal struct {
	ID                int                `json:"id"`
	CanonicalName     string             `json:"canonical_name"`
	ISSNs             []string           `json:"issns,omitempty"`
	Publisher         string             `json:"publisher,omitempty"`
	Country           string             `json:"country,omitempty"`
	Type              string             `json:"type,omitempty"`
	IsOA              bool               `json:"is_oa,omitempty"`
	JCRImpactFactor   float64            `json:"jcr_impact_factor,omitempty"`
	JCRQuartile       string             `json:"jcr_quartile,omitempty"`
	FQBQuartile       string             `json:"fqb_quartile,omitempty"`
	CCFRank           string             `json:"ccf_rank,omitempty"`
	OpenAlexHIndex    int                `json:"openalex_h_index,omitempty"`
	GJQKWarning       bool               `json:"gjqk_warning,omitempty"`
	SourceCount       int                `json:"source_count,omitempty"`
	Sources           map[string]any     `json:"sources,omitempty"`
}

// JournalSearchOptions 期刊搜索过滤参数 —— 对齐上游 /v1/jnl/search 全量字段(api-1.json 2440-2580)。
// 全部 omitempty 透传:不填等于不过滤。
type JournalSearchOptions struct {
	Page                int     `json:"page,omitempty"`
	PageSize            int     `json:"page_size,omitempty"`
	Keyword             string  `json:"keyword,omitempty"`
	Name                string  `json:"name,omitempty"`
	ISSN                string  `json:"issn,omitempty"`
	Publisher           string  `json:"publisher,omitempty"`
	Country             string  `json:"country,omitempty"`
	Type                string  `json:"type,omitempty"`
	IsOA                string  `json:"is_oa,omitempty"`
	JCRQuartile         string  `json:"jcr_quartile,omitempty"`
	FQBQuartile         string  `json:"fqb_quartile,omitempty"`
	ScimagoBestQuartile string  `json:"scimago_best_quartile,omitempty"` // SCImago 最佳分区 Q1-Q4
	CCFRank             string  `json:"ccf_rank,omitempty"`
	MinImpactFactor     float64 `json:"min_impact_factor,omitempty"`
	MaxImpactFactor     float64 `json:"max_impact_factor,omitempty"`
	MinSJR              float64 `json:"min_sjr,omitempty"` // SCImago Journal Rank 下限
	MaxSJR              float64 `json:"max_sjr,omitempty"`
	MinHIndex           int     `json:"min_h_index,omitempty"`
	MaxHIndex           int     `json:"max_h_index,omitempty"`
	MinWorksCount       int     `json:"min_works_count,omitempty"` // 最少发刊量
	// api-1.json 新增:按真实投稿评价(get_journal_comments 聚合)筛选 —— 评分下限 / 评价条数下限 /
	// 计数口径(count_mode)。omitempty:不传即不启用,老行为不变。
	MinCommentRating float64 `json:"min_comment_rating,omitempty"`
	MinCommentCount  int     `json:"min_comment_count,omitempty"`
	CountMode        string  `json:"count_mode,omitempty"`
	MinSources       int     `json:"min_sources,omitempty"` // 最少数据源覆盖数
	HasSources          string  `json:"has_sources,omitempty"`     // 命中的数据源逗号分隔
	GJQKWarning         string  `json:"gjqk_warning,omitempty"`
	SortBy              string  `json:"sort_by,omitempty"`  // 排序字段(jcr_impact_factor_num / scimago_sjr_num 等)
	SortDir             string  `json:"sort_dir,omitempty"` // asc / desc
	Fields              string  `json:"fields,omitempty"`   // 返回字段裁剪,逗号分隔
	Full                string  `json:"full,omitempty"`
}

// JournalListOptions contains options for journal listing
type JournalListOptions struct {
	Page       int    `json:"page,omitempty"`
	PageSize   int    `json:"page_size,omitempty"`
	SortBy     string `json:"sort_by,omitempty"`
	SortDir    string `json:"sort_dir,omitempty"`
	Name       string `json:"name,omitempty"`
	ISSN       string `json:"issn,omitempty"`
	MinSources int    `json:"min_sources,omitempty"`
	HasSources string `json:"has_sources,omitempty"`
	Full       string `json:"full,omitempty"`
}

// JournalSearchResponse represents journal search results
type JournalSearchResponse struct {
	Items    []Journal `json:"items"`
	Total    int       `json:"total"`
	Page     int       `json:"page"`
	PageSize int       `json:"page_size"`
}

// ======================== Field Sanitizing (W6 P0-3) ========================
// 上游偶发 spam 论文(审计实例:单条 abstract 6.7 万字符 / 乱码标题 / JATS 标签残留)会先进
// Redis 缓存被放大(manager 缓存写在 Convert 之后),再全量落 hot_papers 与 SEO/文献集。
// 此处在 ConvertPaper —— search/batch/citations/references/recommendations 全部转换的唯一
// 收口、且**先于缓存写入** —— 做字段清洗;列表转换(ConvertPapers/ConvertPapersToCitations)
// 顺带整条剔除 spam。阈值与 agent 侧 sanitizeMinicod.ts 同语义(per-item 上限不同:agent 侧
// 为省上下文取 2000,此处为不伤 SEO/详情页取 5000)。

const (
	abstractCapRunes = 5000 // 正常 abstract <3k;5000 只拦 spam,不伤 SEO/详情页
	titleCapRunes    = 400
	tldrCapRunes     = 1000
	bibtexCapRunes   = 2000
)

var (
	// 控制符 + 零宽 + bidi 覆盖字符(spam 常用);\t\n\r 保留。
	ctrlRe = regexp.MustCompile("[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E]")
	// JATS/HTML 标签。属性区必须是 name=value 形态,不再用 `(\s[^<>]*)?` 吞任意散文 —— 否则无空格
	// 不等式 `n<m … r>` 会把 `<m the ratio r>` 整段当标签删掉、吃掉真实正文(审计 [16];旧注释只覆盖
	// `<` 后有空格的情形,漏了理论/遗传学摘要里常见的无空格不等式)。仍能剥裸标签(<italic> </i>
	// <br/>)与带引号属性标签(<xref ref-type="bibr" rid="B1">)。
	tagRe = regexp.MustCompile(`</?[a-zA-Z][a-zA-Z0-9:_-]*(\s+[a-zA-Z][a-zA-Z0-9:_.-]*\s*=\s*("[^"]*"|'[^']*'|[^\s"'<>]+))*\s*/?>`)
)

// sanitizeText 洗掉控制符 / JATS·HTML 标签,并按 rune 上限截断(尾部 "…" 可辨识;limit<=0 不截)。
func sanitizeText(s string, limit int) string {
	if s == "" {
		return s
	}
	s = ctrlRe.ReplaceAllString(s, "")
	s = tagRe.ReplaceAllString(s, " ")
	s = strings.TrimSpace(s)
	if r := []rune(s); limit > 0 && len(r) > limit {
		return string(r[:limit]) + "…"
	}
	return s
}

// sanitizeVerbatim 用于 BibTeX 这类逐字字段:只剥控制符 + 截长,不做标签剥离
// (BibTeX 里的花括号/反斜杠/尖括号是合法语法,tagRe 会误伤)。
func sanitizeVerbatim(s string, limit int) string {
	if s == "" {
		return s
	}
	s = strings.TrimSpace(ctrlRe.ReplaceAllString(s, ""))
	if r := []rune(s); limit > 0 && len(r) > limit {
		return string(r[:limit]) + "…"
	}
	return s
}

// isSpamPaper 判定一条上游返回是否为 spam 条目(仅列表转换整条剔除;单篇详情不走此判定)。
// 与 agent 侧 sanitizeMinicod isSpamTitle 同语义,阈值刻意保守,宁漏勿错杀:
// 空标题 / 标题超 400 runes / 控制·bidi·零宽字符 >5 / (标题 >40 且非字母数字非 CJK 占比 >0.5)。
func isSpamPaper(raw RawPaper) bool {
	title := strings.TrimSpace(raw.Title)
	r := []rune(title)
	if len(r) == 0 || len(r) > titleCapRunes {
		return true
	}
	if len(ctrlRe.FindAllString(title, 6)) > 5 {
		return true
	}
	if len(r) > 40 {
		junk := 0
		for _, c := range r {
			// 字母(含 CJK)/ 数字 / 空白视为正常;其余(标点/符号/emoji 等)计 junk。
			if !unicode.IsLetter(c) && !unicode.IsDigit(c) && !unicode.IsSpace(c) {
				junk++
			}
		}
		if float64(junk)/float64(len(r)) > 0.5 {
			return true
		}
	}
	return false
}

// ======================== Conversion Functions ========================

// ConvertPaper converts a Minicod raw paper to frontend-compatible Paper
// normalizeID ensures paper/author IDs include their source prefix (e.g., "olx:W123")
// so that downstream GetPaper/GetAuthor calls can route to the correct endpoint.
// IDs from STC (Semantic Scholar) are left as-is since they're the default.
func normalizeID(id, source string) string {
	if source != "" && source != SourceSTC && !strings.Contains(id, ":") {
		return source + ":" + id
	}
	return id
}

func ConvertPaper(raw RawPaper) Paper {
	// W6 P0-3:先于 Redis 缓存 / hot_papers / SEO 的字段清洗(控制符 + JATS 标签 + spam 长度 cap)。
	p := Paper{
		PaperID:         normalizeID(raw.ID, raw.Source),
		Title:           sanitizeText(raw.Title, titleCapRunes),
		Abstract:        sanitizeText(raw.Abstract, abstractCapRunes),
		Year:            raw.Year,
		PublicationDate: raw.PublicationDate,
		Venue:           raw.Venue,
		URL:             raw.URL,
		CitationCount:   raw.CitationCount,
		ReferenceCount:  raw.ReferenceCount,
		IsOpenAccess:    raw.IsOpenAccess,
		FieldsOfStudy:   raw.FieldsOfStudy,
		Source:          raw.Source,
	}

	// Map PDF URL
	if raw.PdfURL != "" {
		p.OpenAccessPDF = &OpenAccessPDF{URL: raw.PdfURL}
	}

	// Map DOI to externalIds
	if raw.DOI != "" {
		p.ExternalIDs = map[string]any{"DOI": raw.DOI}
	}

	// Map fields_of_study to s2FieldsOfStudy for frontend compatibility
	if len(raw.FieldsOfStudy) > 0 {
		for _, f := range raw.FieldsOfStudy {
			p.S2FieldsOfStudy = append(p.S2FieldsOfStudy, S2FieldOfStudy{
				Category: f,
				Source:   "external",
			})
		}
	}

	// Convert authors
	for _, a := range raw.Authors {
		p.Authors = append(p.Authors, ConvertAuthor(a))
	}

	// Map venue to journal
	if raw.Venue != "" {
		p.Journal = &JournalRef{Name: raw.Venue}
	}

	// tldr(上游纯字符串)→ 前端既有的 TLDR{text} 对象契约(前端零改动即显示摘要)。
	if t := sanitizeText(raw.Tldr, tldrCapRunes); t != "" {
		p.TLDR = &TLDR{Text: t}
	}
	// bibtex 逐字透出(仅剥控制符 + 截长;花括号/尖括号是合法 BibTeX 语法,不走 tagRe)。
	if b := sanitizeVerbatim(raw.Bibtex, bibtexCapRunes); b != "" {
		p.BibTeX = b
	}

	return p
}

// ConvertAuthor converts a Minicod raw author to frontend-compatible Author
func ConvertAuthor(raw RawAuthor) Author {
	return Author{
		AuthorID:      normalizeID(raw.ID, raw.Source),
		Name:          raw.Name,
		URL:           raw.URL,
		Affiliations:  raw.Affiliations,
		PaperCount:    raw.PaperCount,
		CitationCount: raw.CitationCount,
		HIndex:        raw.HIndex,
		ORCID:         NormalizeORCID(raw.ORCID),
		Source:        raw.Source,
	}
}

// orcidPattern 校验裸 ORCID iD(末位校验位可能是 X)。
var orcidPattern = regexp.MustCompile(`^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$`)

// NormalizeORCID 把 URL / 前缀写法归一成裸 iD;非法则返回空串(不展示)。
func NormalizeORCID(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	s = strings.TrimPrefix(s, "https://")
	s = strings.TrimPrefix(s, "http://")
	s = strings.TrimPrefix(s, "orcid.org/")
	s = strings.TrimSpace(s)
	s = strings.ToUpper(s) // 末位校验位 X 统一大写
	if !orcidPattern.MatchString(s) {
		return ""
	}
	return s
}

// ConvertPaperToCitation converts a Minicod raw paper to a Citation
func ConvertPaperToCitation(raw RawPaper) Citation {
	// W6 P0-3:与 ConvertPaper 同款字段清洗(citations/references 同样进缓存与前端)。
	c := Citation{
		PaperId:         normalizeID(raw.ID, raw.Source),
		URL:             raw.URL,
		Title:           sanitizeText(raw.Title, titleCapRunes),
		Abstract:        sanitizeText(raw.Abstract, abstractCapRunes),
		Venue:           raw.Venue,
		Year:            raw.Year,
		ReferenceCount:  raw.ReferenceCount,
		CitationCount:   raw.CitationCount,
		PublicationDate: raw.PublicationDate,
		Source:          raw.Source,
	}

	if raw.PdfURL != "" {
		c.OpenAccessPdf = &OpenAccessPDF{URL: raw.PdfURL}
	}

	if raw.DOI != "" {
		c.ExternalIDs = map[string]any{"DOI": raw.DOI}
	}

	for _, a := range raw.Authors {
		c.Authors = append(c.Authors, ConvertAuthor(a))
	}

	return c
}

// ConvertPapers converts a slice of raw papers
// W6 P0-3:列表转换顺带整条剔除 spam 条目(空标题/超长标题/乱码占比超标)——
// 剔除发生在 Redis 缓存写入之前,spam 不再被缓存放大、也不落 hot_papers/SEO。
func ConvertPapers(raws []RawPaper) []Paper {
	papers := make([]Paper, 0, len(raws))
	for _, r := range raws {
		if isSpamPaper(r) {
			continue
		}
		papers = append(papers, ConvertPaper(r))
	}
	return papers
}

// ConvertAuthors converts a slice of raw authors
func ConvertAuthors(raws []RawAuthor) []Author {
	authors := make([]Author, 0, len(raws))
	for _, r := range raws {
		authors = append(authors, ConvertAuthor(r))
	}
	return authors
}

// ConvertPapersToCitations converts a slice of raw papers to citations
// W6 P0-3:与 ConvertPapers 同款 spam 剔除。
func ConvertPapersToCitations(raws []RawPaper) []Citation {
	citations := make([]Citation, 0, len(raws))
	for _, r := range raws {
		if isSpamPaper(r) {
			continue
		}
		citations = append(citations, ConvertPaperToCitation(r))
	}
	return citations
}
