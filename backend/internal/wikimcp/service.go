package wikimcp

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

const (
	defaultListLimit   = 20
	maxListLimit       = 50
	defaultSearchLimit = 10
	maxSearchLimit     = 20
	resourcePageSize   = 50
	maxQueryLength     = 200
	maxCursorLength    = 256
)

var (
	errInvalidCursor = errors.New("invalid cursor")
	errInvalidParams = errors.New("invalid parameters")
)

type Service struct {
	catalog *Catalog
	tools   []map[string]any
}

func newService(catalog *Catalog) *Service {
	service := &Service{catalog: catalog}
	service.tools = service.toolDefinitions()
	return service
}

type articleSummary struct {
	Slug          string   `json:"slug"`
	Title         string   `json:"title"`
	Summary       string   `json:"summary"`
	Category      string   `json:"category"`
	CategoryTitle string   `json:"category_title"`
	Kind          string   `json:"kind"`
	Status        string   `json:"status"`
	Aliases       []string `json:"aliases,omitempty"`
	URL           string   `json:"url"`
	ResourceURI   string   `json:"resource_uri"`
}

type listArguments struct {
	Category string
	Cursor   string
	Limit    int
}

type searchArguments struct {
	Query    string
	Category string
	Cursor   string
	Limit    int
}

type readArguments struct {
	Slug      string
	SectionID string
}

type pageResult struct {
	Articles   []articleSummary `json:"articles"`
	NextCursor string           `json:"next_cursor,omitempty"`
	Total      int              `json:"total"`
}

func (service *Service) toolDefinitions() []map[string]any {
	readOnly := map[string]any{
		"readOnlyHint":    true,
		"destructiveHint": false,
		"idempotentHint":  true,
		"openWorldHint":   false,
	}
	categories := service.catalog.categories()
	return []map[string]any{
		{
			"name":        "list_wiki_articles",
			"title":       "列出 Scholay Wiki 词条",
			"description": "按稳定顺序分页列出 Wiki 词条，可限定栏目。返回 slug、摘要、页面 URL 与可读取的资源 URI。",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"category": map[string]any{"type": "string", "enum": categories, "description": "可选的 Wiki 栏目标识。"},
					"cursor":   map[string]any{"type": "string", "maxLength": maxCursorLength, "description": "上一页返回的不透明游标。"},
					"limit":    map[string]any{"type": "integer", "minimum": 1, "maximum": maxListLimit, "default": defaultListLimit},
				},
				"additionalProperties": false,
			},
			"annotations": readOnly,
		},
		{
			"name":        "search_wiki",
			"title":       "搜索 Scholay Wiki",
			"description": "在全部 Wiki 词条的标题、别名、摘要与正文中搜索；结果按相关性排序并支持有界分页。",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"query":    map[string]any{"type": "string", "minLength": 1, "maxLength": maxQueryLength, "description": "要检索的产品功能、术语或使用问题。"},
					"category": map[string]any{"type": "string", "enum": categories, "description": "可选的 Wiki 栏目标识。"},
					"cursor":   map[string]any{"type": "string", "maxLength": maxCursorLength, "description": "上一页返回的不透明游标。"},
					"limit":    map[string]any{"type": "integer", "minimum": 1, "maximum": maxSearchLimit, "default": defaultSearchLimit},
				},
				"required":             []string{"query"},
				"additionalProperties": false,
			},
			"annotations": readOnly,
		},
		{
			"name":        "read_wiki_article",
			"title":       "读取 Scholay Wiki 词条",
			"description": "按 slug 读取完整 Wiki 词条。可指定 section_id 只返回一个章节；正文同时以 Markdown 和结构化数据提供。",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"slug":       map[string]any{"type": "string", "minLength": 1, "maxLength": 128, "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$"},
					"section_id": map[string]any{"type": "string", "minLength": 1, "maxLength": 128, "description": "可选的章节锚点 ID。"},
				},
				"required":             []string{"slug"},
				"additionalProperties": false,
			},
			"annotations": readOnly,
		},
	}
}

func (service *Service) listTools(cursor string) ([]map[string]any, error) {
	if cursor != "" {
		return nil, errInvalidCursor
	}
	return service.tools, nil
}

func (service *Service) listResources(cursor string) ([]map[string]any, string, error) {
	offset, err := decodeCursor(cursor, cursorScope("resources"))
	if err != nil || offset > len(service.catalog.Articles) {
		return nil, "", errInvalidCursor
	}
	end := min(offset+resourcePageSize, len(service.catalog.Articles))
	resources := make([]map[string]any, 0, end-offset)
	for _, article := range service.catalog.Articles[offset:end] {
		resources = append(resources, map[string]any{
			"uri":         article.ResourceURI,
			"name":        article.Slug,
			"title":       article.Title,
			"description": article.Summary,
			"mimeType":    "text/markdown; charset=utf-8",
			"annotations": map[string]any{"audience": []string{"user", "assistant"}, "priority": 0.7},
		})
	}
	next := ""
	if end < len(service.catalog.Articles) {
		next = encodeCursor(end, cursorScope("resources"))
	}
	return resources, next, nil
}

func (service *Service) readResource(uri string) (*Article, error) {
	if len(uri) == 0 || len(uri) > 256 {
		return nil, errInvalidParams
	}
	article, exists := service.catalog.articleByURI(uri)
	if !exists {
		return nil, fmt.Errorf("%w: unknown Wiki resource", errInvalidParams)
	}
	return article, nil
}

func (service *Service) listArticles(arguments listArguments) (pageResult, error) {
	if !service.catalog.hasCategory(arguments.Category) {
		return pageResult{}, fmt.Errorf("%w: unknown category", errInvalidParams)
	}
	if arguments.Limit == 0 {
		arguments.Limit = defaultListLimit
	}
	if arguments.Limit < 1 || arguments.Limit > maxListLimit {
		return pageResult{}, fmt.Errorf("%w: limit must be between 1 and %d", errInvalidParams, maxListLimit)
	}
	articles := service.filterByCategory(arguments.Category)
	scope := cursorScope("list", arguments.Category)
	offset, err := decodeCursor(arguments.Cursor, scope)
	if err != nil || offset > len(articles) {
		return pageResult{}, errInvalidCursor
	}
	return paginateSummaries(articles, offset, arguments.Limit, scope), nil
}

func (service *Service) searchArticles(arguments searchArguments) (pageResult, error) {
	query := normalizeText(arguments.Query)
	if query == "" || len([]rune(arguments.Query)) > maxQueryLength {
		return pageResult{}, fmt.Errorf("%w: query must contain 1..%d characters", errInvalidParams, maxQueryLength)
	}
	if !service.catalog.hasCategory(arguments.Category) {
		return pageResult{}, fmt.Errorf("%w: unknown category", errInvalidParams)
	}
	if arguments.Limit == 0 {
		arguments.Limit = defaultSearchLimit
	}
	if arguments.Limit < 1 || arguments.Limit > maxSearchLimit {
		return pageResult{}, fmt.Errorf("%w: limit must be between 1 and %d", errInvalidParams, maxSearchLimit)
	}

	type scoredArticle struct {
		article *Article
		score   int
	}
	scored := make([]scoredArticle, 0)
	for index := range service.catalog.Articles {
		article := &service.catalog.Articles[index]
		if arguments.Category != "" && article.Category != arguments.Category {
			continue
		}
		score := scoreArticle(article, query)
		if score > 0 {
			scored = append(scored, scoredArticle{article: article, score: score})
		}
	}
	sort.SliceStable(scored, func(left, right int) bool {
		if scored[left].score == scored[right].score {
			return scored[left].article.Slug < scored[right].article.Slug
		}
		return scored[left].score > scored[right].score
	})
	articles := make([]*Article, len(scored))
	for index, item := range scored {
		articles[index] = item.article
	}

	scope := cursorScope("search", query, arguments.Category)
	offset, err := decodeCursor(arguments.Cursor, scope)
	if err != nil || offset > len(articles) {
		return pageResult{}, errInvalidCursor
	}
	return paginateSummaries(articles, offset, arguments.Limit, scope), nil
}

func (service *Service) readArticle(arguments readArguments) (*Article, error) {
	if !slugPattern.MatchString(arguments.Slug) || len(arguments.Slug) > 128 {
		return nil, fmt.Errorf("%w: invalid slug", errInvalidParams)
	}
	article, exists := service.catalog.articleBySlug(arguments.Slug)
	if !exists {
		return nil, fmt.Errorf("%w: unknown Wiki article", errInvalidParams)
	}
	if arguments.SectionID == "" {
		return article, nil
	}
	if len(arguments.SectionID) > 128 {
		return nil, fmt.Errorf("%w: invalid section_id", errInvalidParams)
	}
	for _, section := range article.Sections {
		if section.ID == arguments.SectionID {
			copy := *article
			copy.Sections = []ArticleSection{section}
			copy.ContentMarkdown = renderSelectedSection(article, &section)
			return &copy, nil
		}
	}
	return nil, fmt.Errorf("%w: unknown section_id", errInvalidParams)
}

func (service *Service) filterByCategory(category string) []*Article {
	articles := make([]*Article, 0, len(service.catalog.Articles))
	for index := range service.catalog.Articles {
		article := &service.catalog.Articles[index]
		if category == "" || article.Category == category {
			articles = append(articles, article)
		}
	}
	return articles
}

func paginateSummaries(articles []*Article, offset, limit int, scope string) pageResult {
	end := min(offset+limit, len(articles))
	items := make([]articleSummary, 0, end-offset)
	for _, article := range articles[offset:end] {
		items = append(items, summarize(article))
	}
	result := pageResult{Articles: items, Total: len(articles)}
	if end < len(articles) {
		result.NextCursor = encodeCursor(end, scope)
	}
	return result
}

func summarize(article *Article) articleSummary {
	return articleSummary{
		Slug:          article.Slug,
		Title:         article.Title,
		Summary:       article.Summary,
		Category:      article.Category,
		CategoryTitle: article.CategoryTitle,
		Kind:          article.Kind,
		Status:        article.Status,
		Aliases:       article.Aliases,
		URL:           article.URL,
		ResourceURI:   article.ResourceURI,
	}
}

func scoreArticle(article *Article, query string) int {
	title := normalizeText(article.Title)
	aliases := normalizeText(strings.Join(article.Aliases, " "))
	summary := normalizeText(article.Summary)
	body := normalizeText(article.ContentMarkdown)
	switch {
	case title == query:
		return 100
	case strings.Contains(title, query):
		return 70
	case strings.Contains(aliases, query):
		return 50
	case strings.Contains(summary, query):
		return 30
	case strings.Contains(body, query):
		return 10
	default:
		return 0
	}
}

func normalizeText(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(strings.TrimSpace(value))), " ")
}

func renderSelectedSection(article *Article, section *ArticleSection) string {
	return fmt.Sprintf("# %s\n\n%s\n\n## %s\n\n%s", article.Title, article.Summary, section.Title, section.ContentMarkdown)
}

type cursorPayload struct {
	Offset int    `json:"o"`
	Scope  string `json:"s"`
}

func cursorScope(parts ...string) string {
	digest := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(digest[:8])
}

func encodeCursor(offset int, scope string) string {
	payload, _ := json.Marshal(cursorPayload{Offset: offset, Scope: scope})
	return base64.RawURLEncoding.EncodeToString(payload)
}

func decodeCursor(cursor, scope string) (int, error) {
	if cursor == "" {
		return 0, nil
	}
	if len(cursor) > maxCursorLength {
		return 0, errInvalidCursor
	}
	data, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return 0, errInvalidCursor
	}
	var payload cursorPayload
	if err := json.Unmarshal(data, &payload); err != nil || payload.Offset < 0 || payload.Scope != scope {
		return 0, errInvalidCursor
	}
	return payload.Offset, nil
}

func intArgument(arguments map[string]any, key string) (int, error) {
	value, exists := arguments[key]
	if !exists {
		return 0, nil
	}
	switch typed := value.(type) {
	case json.Number:
		parsed, err := strconv.Atoi(typed.String())
		if err != nil {
			return 0, errInvalidParams
		}
		return parsed, nil
	case float64:
		if typed != float64(int(typed)) {
			return 0, errInvalidParams
		}
		return int(typed), nil
	case int:
		return typed, nil
	default:
		return 0, errInvalidParams
	}
}

func stringArgument(arguments map[string]any, key string) (string, error) {
	value, exists := arguments[key]
	if !exists {
		return "", nil
	}
	text, ok := value.(string)
	if !ok {
		return "", errInvalidParams
	}
	return text, nil
}

func rejectUnknownArguments(arguments map[string]any, allowed ...string) error {
	known := make(map[string]struct{}, len(allowed))
	for _, key := range allowed {
		known[key] = struct{}{}
	}
	for key := range arguments {
		if _, exists := known[key]; !exists {
			return fmt.Errorf("%w: unknown argument %q", errInvalidParams, key)
		}
	}
	return nil
}
