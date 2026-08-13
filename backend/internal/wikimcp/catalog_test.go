package wikimcp

import (
	"encoding/json"
	"testing"
)

func TestEmbeddedCatalogCoversEverySnapshotArticle(t *testing.T) {
	catalog, err := loadCatalog(embeddedArticles)
	if err != nil {
		t.Fatalf("load embedded Wiki catalog: %v", err)
	}
	if catalog.ArticleCount < 100 {
		t.Fatalf("expected the complete Wiki, got only %d articles", catalog.ArticleCount)
	}
	if len(catalog.bySlug) != catalog.ArticleCount || len(catalog.byURI) != catalog.ArticleCount {
		t.Fatalf("lookup coverage mismatch: articles=%d slugs=%d uris=%d", catalog.ArticleCount, len(catalog.bySlug), len(catalog.byURI))
	}
	for _, article := range catalog.Articles {
		if article.Category == "" || article.Status == "" || len(article.Audience) == 0 {
			t.Fatalf("article %q is missing category/status/audience metadata", article.Slug)
		}
		if len(article.Sections) == 0 {
			t.Fatalf("article %q has no sections", article.Slug)
		}
		if _, ok := catalog.articleBySlug(article.Slug); !ok {
			t.Fatalf("slug lookup does not cover %q", article.Slug)
		}
		if _, ok := catalog.articleByURI(article.ResourceURI); !ok {
			t.Fatalf("URI lookup does not cover %q", article.ResourceURI)
		}
	}

	var raw map[string]any
	if err := json.Unmarshal(embeddedArticles, &raw); err != nil {
		t.Fatalf("decode raw snapshot: %v", err)
	}
	articles, ok := raw["articles"].([]any)
	if !ok {
		t.Fatal("snapshot articles must be an array")
	}
	for _, item := range articles {
		article := item.(map[string]any)
		if _, leaksSourcePaths := article["sourcePaths"]; leaksSourcePaths {
			t.Fatal("public MCP snapshot must not expose sourcePaths")
		}
		if _, leaksSnakeSourcePaths := article["source_paths"]; leaksSnakeSourcePaths {
			t.Fatal("public MCP snapshot must not expose source_paths")
		}
	}
}

func TestResourcePaginationIsCompleteAndStable(t *testing.T) {
	catalog := mustLoadCatalog()
	service := newService(catalog)
	seen := make(map[string]struct{}, catalog.ArticleCount)
	cursor := ""
	for {
		resources, next, err := service.listResources(cursor)
		if err != nil {
			t.Fatalf("list resources at cursor %q: %v", cursor, err)
		}
		if len(resources) == 0 {
			t.Fatal("resource page must not be empty before pagination ends")
		}
		for _, resource := range resources {
			uri := resource["uri"].(string)
			if _, duplicate := seen[uri]; duplicate {
				t.Fatalf("duplicate paginated resource %q", uri)
			}
			seen[uri] = struct{}{}
		}
		if next == "" {
			break
		}
		cursor = next
	}
	if len(seen) != catalog.ArticleCount {
		t.Fatalf("resource pagination covered %d of %d articles", len(seen), catalog.ArticleCount)
	}
}
