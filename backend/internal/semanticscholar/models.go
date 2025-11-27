package semanticscholar

// Paper represents a research paper
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
	Authors          []Author                `json:"authors,omitempty"`
	Citations        []Citation              `json:"citations,omitempty"`
	References       []Citation              `json:"references,omitempty"`
	Embedding        *PaperEmbedding         `json:"embedding,omitempty"`
	TLDR             *TLDR                   `json:"tldr,omitempty"`
	ExternalIDs      map[string]interface{}  `json:"externalIds,omitempty"`
	Journal          *Journal                `json:"journal,omitempty"`
}

// Author represents a paper author
type Author struct {
	AuthorID     string `json:"authorId,omitempty"`
	Name         string `json:"name,omitempty"`
	URL          string `json:"url,omitempty"`
	Affiliations []string `json:"affiliations,omitempty"`
	Homepage     string `json:"homepage,omitempty"`
	PaperCount   int    `json:"paperCount,omitempty"`
	CitationCount int   `json:"citationCount,omitempty"`
	HIndex       int    `json:"hIndex,omitempty"`
}

// Citation represents a citation/reference relationship
type Citation struct {
	PaperId                 string                 `json:"paperId,omitempty"`
	ExternalIDs             map[string]interface{} `json:"externalIds,omitempty"`
	URL                     string                 `json:"url,omitempty"`
	Title                   string                 `json:"title,omitempty"`
	Abstract                string                 `json:"abstract,omitempty"`
	Venue                   string                 `json:"venue,omitempty"`
	PublicationVenue        *PublicationVenue      `json:"publicationVenue,omitempty"`
	Year                    int                    `json:"year,omitempty"`
	ReferenceCount          int                    `json:"referenceCount,omitempty"`
	CitationCount           int                    `json:"citationCount,omitempty"`
	InfluentialCitationCount int                   `json:"influentialCitationCount,omitempty"`
	IsInfluential           bool                   `json:"isInfluential,omitempty"`
	OpenAccessPdf           *OpenAccessPDF         `json:"openAccessPdf,omitempty"`
	S2FieldsOfStudy         []S2FieldOfStudy       `json:"s2FieldsOfStudy,omitempty"`
	PublicationTypes        []string               `json:"publicationTypes,omitempty"`
	PublicationDate         string                 `json:"publicationDate,omitempty"`
	Journal                 *Journal               `json:"journal,omitempty"`
	CitationStyles          *CitationStyles        `json:"citationStyles,omitempty"`
	Authors                 []Author               `json:"authors,omitempty"`
	TLDR                    *TLDR                  `json:"tldr,omitempty"`
	// Legacy fields for backward compatibility
	IntentScore             float64                `json:"intentScore,omitempty"`
	Contexts                []string               `json:"contexts,omitempty"`
	Intents                 []string               `json:"intents,omitempty"`
}

// OpenAccessPDF contains open access PDF information
type OpenAccessPDF struct {
	URL        string `json:"url,omitempty"`
	Status     string `json:"status,omitempty"`
	License    string `json:"license,omitempty"`
	Disclaimer string `json:"disclaimer,omitempty"`
}

// PublicationVenue represents venue information
type PublicationVenue struct {
	ID             string   `json:"id,omitempty"`
	Name           string   `json:"name,omitempty"`
	Type           string   `json:"type,omitempty"`
	AlternateNames []string `json:"alternate_names,omitempty"`
	ISSN           string   `json:"issn,omitempty"`
	URL            string   `json:"url,omitempty"`
	AlternateURLs  []string `json:"alternate_urls,omitempty"`
}

// Journal represents journal publication information
type Journal struct {
	Name   string `json:"name,omitempty"`
	Pages  string `json:"pages,omitempty"`
	Volume string `json:"volume,omitempty"`
}

// CitationStyles represents citation formatting
type CitationStyles struct {
	BibTeX string `json:"bibtex,omitempty"`
}

// S2FieldOfStudy represents Semantic Scholar's field of study classification
type S2FieldOfStudy struct {
	Category string `json:"category,omitempty"`
	Source   string `json:"source,omitempty"`
}

// PaperEmbedding represents paper embedding vector
type PaperEmbedding struct {
	Model  string    `json:"model,omitempty"`
	Vector []float64 `json:"vector,omitempty"`
}

// TLDR represents the auto-generated summary
type TLDR struct {
	Model string `json:"model,omitempty"`
	Text  string `json:"text,omitempty"`
}

// SearchResponse represents paper search response
type SearchResponse struct {
	Total  int     `json:"total"`
	Offset int     `json:"offset"`
	Next   int     `json:"next,omitempty"`
	Data   []Paper `json:"data"`
}

// AuthorSearchResponse represents author search response
type AuthorSearchResponse struct {
	Total  int      `json:"total"`
	Offset int      `json:"offset"`
	Next   int      `json:"next,omitempty"`
	Data   []Author `json:"data"`
}

// CitationsResponse represents citations response
type CitationsResponse struct {
	Offset int        `json:"offset"`
	Next   int        `json:"next,omitempty"`
	Data   []Citation `json:"data"`
}

// ReferencesResponse represents references response
type ReferencesResponse struct {
	Offset int        `json:"offset"`
	Next   int        `json:"next,omitempty"`
	Data   []Citation `json:"data"`
}

// RecommendationsResponse represents paper recommendations response
type RecommendationsResponse struct {
	RecommendedPapers []Paper `json:"recommendedPapers"`
}

// BatchPaperRequest represents batch paper request
type BatchPaperRequest struct {
	IDs []string `json:"ids"`
}

// PaperSearchOptions contains options for paper search
type PaperSearchOptions struct {
	Query          string
	Year           string   // e.g., "2020" or "2019-2021"
	PublicationTypes []string // e.g., "JournalArticle", "Conference"
	OpenAccessPDF  string   // "" or "true"
	Venue          []string
	FieldsOfStudy  []string
	Fields         []string // Fields to return
	Offset         int
	Limit          int
}

// BulkSearchOptions contains options for bulk paper search
type BulkSearchOptions struct {
	Query            string   // Supports OR operator with |, e.g. "machine learning | deep learning"
	Fields           []string // Fields to return
	Sort             string   // e.g., "citationCount:desc", "publicationDate:desc"
	MinCitationCount int      // Minimum citation count filter
	Year             string   // e.g., "2020" or "2019-2024"
	PublicationTypes []string
	OpenAccessPDF    string
	Venue            []string
	FieldsOfStudy    []string
	Token            string // For pagination
}

// AuthorSearchOptions contains options for author search
type AuthorSearchOptions struct {
	Query  string
	Fields []string
	Offset int
	Limit  int
}

// PaperDetailsOptions contains options for fetching paper details
type PaperDetailsOptions struct {
	Fields []string
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

// AutocompleteMatch represents a single autocomplete suggestion
type AutocompleteMatch struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	AuthorsYear string `json:"authorsYear"`
}

// AutocompleteResponse represents paper autocomplete response
type AutocompleteResponse struct {
	Matches []AutocompleteMatch `json:"matches"`
}

// SearchSuggestionsResponse represents combined search suggestions
type SearchSuggestionsResponse struct {
	Papers  []AutocompleteMatch `json:"papers"`  // Paper title suggestions
	Authors []Author            `json:"authors"` // Author suggestions
}
