// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package minicod

import (
	"encoding/json"
	"strings"
)

// ======================== Minicod API Raw Response Types ========================
// These match the JSON format returned by the Minicod API (snake_case)

// APIResponse is the envelope for all Minicod API responses
type APIResponse struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
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
	Journal          *JournalRef        `json:"journal,omitempty"`
	Source           string             `json:"source,omitempty"`
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
	Source        string   `json:"source,omitempty"`
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
	MinSources          int     `json:"min_sources,omitempty"`     // 最少数据源覆盖数
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
	p := Paper{
		PaperID:         normalizeID(raw.ID, raw.Source),
		Title:           raw.Title,
		Abstract:        raw.Abstract,
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
		Source:        raw.Source,
	}
}

// ConvertPaperToCitation converts a Minicod raw paper to a Citation
func ConvertPaperToCitation(raw RawPaper) Citation {
	c := Citation{
		PaperId:         normalizeID(raw.ID, raw.Source),
		URL:             raw.URL,
		Title:           raw.Title,
		Abstract:        raw.Abstract,
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
func ConvertPapers(raws []RawPaper) []Paper {
	papers := make([]Paper, 0, len(raws))
	for _, r := range raws {
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
func ConvertPapersToCitations(raws []RawPaper) []Citation {
	citations := make([]Citation, 0, len(raws))
	for _, r := range raws {
		citations = append(citations, ConvertPaperToCitation(r))
	}
	return citations
}
