package wikimcp

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

const (
	articleURIPrefix = "scholay://wiki/article/"
	maxArticleCount  = 5000
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

//go:embed articles.json
var embeddedArticles []byte

type Catalog struct {
	SchemaVersion int       `json:"schema_version"`
	ArticleCount  int       `json:"article_count"`
	Articles      []Article `json:"articles"`

	bySlug map[string]*Article
	byURI  map[string]*Article
}

type Article struct {
	Slug            string           `json:"slug"`
	Title           string           `json:"title"`
	Summary         string           `json:"summary"`
	Category        string           `json:"category"`
	CategoryTitle   string           `json:"category_title"`
	Kind            string           `json:"kind"`
	Status          string           `json:"status"`
	Audience        []string         `json:"audience"`
	Aliases         []string         `json:"aliases"`
	Related         []string         `json:"related"`
	URL             string           `json:"url"`
	ResourceURI     string           `json:"resource_uri"`
	HeaderEmbeds    []EmbedRef       `json:"header_embeds"`
	Sections        []ArticleSection `json:"sections"`
	ContentMarkdown string           `json:"content_markdown"`
}

type EmbedRef struct {
	ID      string `json:"id"`
	Caption string `json:"caption,omitempty"`
}

// ArticleSection keeps the authored structural blocks intact so tool callers can
// reason about tables, prompt tabs, tips and next-step cards in addition to the
// rendered Markdown resource.
type ArticleSection struct {
	ID              string           `json:"id"`
	Title           string           `json:"title"`
	Markdown        string           `json:"markdown"`
	ContentMarkdown string           `json:"content_markdown"`
	Table           map[string]any   `json:"table,omitempty"`
	Embeds          []EmbedRef       `json:"embeds,omitempty"`
	Blocks          []map[string]any `json:"blocks,omitempty"`
}

func loadCatalog(data []byte) (*Catalog, error) {
	var catalog Catalog
	if err := json.Unmarshal(data, &catalog); err != nil {
		return nil, fmt.Errorf("decode embedded wiki articles: %w", err)
	}
	if catalog.SchemaVersion != 1 {
		return nil, fmt.Errorf("unsupported wiki article schema version %d", catalog.SchemaVersion)
	}
	if len(catalog.Articles) == 0 || len(catalog.Articles) > maxArticleCount {
		return nil, fmt.Errorf("wiki article count %d is outside 1..%d", len(catalog.Articles), maxArticleCount)
	}
	if catalog.ArticleCount != len(catalog.Articles) {
		return nil, fmt.Errorf("wiki article_count=%d does not match articles=%d", catalog.ArticleCount, len(catalog.Articles))
	}

	catalog.bySlug = make(map[string]*Article, len(catalog.Articles))
	catalog.byURI = make(map[string]*Article, len(catalog.Articles))
	for index := range catalog.Articles {
		article := &catalog.Articles[index]
		if !slugPattern.MatchString(article.Slug) {
			return nil, fmt.Errorf("invalid wiki article slug %q", article.Slug)
		}
		if strings.TrimSpace(article.Title) == "" || strings.TrimSpace(article.Summary) == "" || strings.TrimSpace(article.ContentMarkdown) == "" {
			return nil, fmt.Errorf("wiki article %q is missing public content", article.Slug)
		}
		if article.ResourceURI != articleURIPrefix+article.Slug {
			return nil, fmt.Errorf("wiki article %q has unstable resource URI %q", article.Slug, article.ResourceURI)
		}
		if _, exists := catalog.bySlug[article.Slug]; exists {
			return nil, fmt.Errorf("duplicate wiki article slug %q", article.Slug)
		}
		if _, exists := catalog.byURI[article.ResourceURI]; exists {
			return nil, fmt.Errorf("duplicate wiki resource URI %q", article.ResourceURI)
		}
		catalog.bySlug[article.Slug] = article
		catalog.byURI[article.ResourceURI] = article
	}

	if !sort.SliceIsSorted(catalog.Articles, func(left, right int) bool {
		return catalog.Articles[left].Slug < catalog.Articles[right].Slug
	}) {
		return nil, errors.New("wiki articles must be sorted by slug")
	}
	for _, article := range catalog.Articles {
		for _, related := range article.Related {
			if _, exists := catalog.bySlug[related]; !exists {
				return nil, fmt.Errorf("wiki article %q references missing related article %q", article.Slug, related)
			}
		}
	}
	return &catalog, nil
}

func mustLoadCatalog() *Catalog {
	catalog, err := loadCatalog(embeddedArticles)
	if err != nil {
		panic(err)
	}
	return catalog
}

func (catalog *Catalog) articleBySlug(slug string) (*Article, bool) {
	article, ok := catalog.bySlug[slug]
	return article, ok
}

func (catalog *Catalog) articleByURI(uri string) (*Article, bool) {
	article, ok := catalog.byURI[uri]
	return article, ok
}

func (catalog *Catalog) categories() []string {
	seen := make(map[string]struct{})
	for _, article := range catalog.Articles {
		seen[article.Category] = struct{}{}
	}
	values := make([]string, 0, len(seen))
	for category := range seen {
		values = append(values, category)
	}
	sort.Strings(values)
	return values
}

func (catalog *Catalog) hasCategory(category string) bool {
	if category == "" {
		return true
	}
	for _, article := range catalog.Articles {
		if article.Category == category {
			return true
		}
	}
	return false
}
