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
	PaperId            string   `json:"paperId,omitempty"`
	Title              string   `json:"title,omitempty"`
	Year               int      `json:"year,omitempty"`
	Authors            []Author `json:"authors,omitempty"`
	Venue              string   `json:"venue,omitempty"`
	CitationCount      int      `json:"citationCount,omitempty"`
	IsInfluential      bool     `json:"isInfluential,omitempty"`
	IntentScore        float64  `json:"intentScore,omitempty"`
	Contexts           []string `json:"contexts,omitempty"`
	Intents            []string `json:"intents,omitempty"`
}

// OpenAccessPDF contains open access PDF information
type OpenAccessPDF struct {
	URL    string `json:"url,omitempty"`
	Status string `json:"status,omitempty"`
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
