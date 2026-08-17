package config

import (
	"strings"
	"testing"

	"scholar-backend/internal/seo"
)

// stubAuthorSEOWithCorpus / stubPaperSEOWithCorpus —— 在既有解析桩上加「已落地集合」,
// 与 stubToolSEOWithListing 同一手法(可选接口靠嵌入补齐)。
type stubAuthorSEOWithCorpus struct {
	stubAuthorSEO
	existing map[string]bool
}

func (s stubAuthorSEOWithCorpus) ExistingAuthorIDs(ids []string) (map[string]bool, error) {
	out := map[string]bool{}
	for _, id := range ids {
		if s.existing[id] {
			out[id] = true
		}
	}
	return out, nil
}

type stubPaperSEOWithCorpus struct {
	stubPaperSEO
	existing map[string]bool
}

func (s stubPaperSEOWithCorpus) ExistingPaperIDs(ids []string) (map[string]bool, error) {
	out := map[string]bool{}
	for _, id := range ids {
		if s.existing[id] {
			out[id] = true
		}
	}
	return out, nil
}

// TestSSRPaperPageLinksOnlyLandedAuthors 论文页的作者:落地库里有的才是 <a href>,
// 没有的只留姓名文本 —— 否则每个论文页都在给爬虫发未落地 URL,前沿永远闭合不了。
func TestSSRPaperPageLinksOnlyLandedAuthors(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	h.paperSEOProvider = stubPaperSEO{byID: func(_, id string) (*seo.PaperSSRMeta, error) {
		return &seo.PaperSSRMeta{
			PaperID:      id,
			Source:       "olx",
			Title:        "一篇有作者的论文",
			SEOIndexable: true,
			Authors:      []string{"Landed Ada", "Missing Bob"},
			AuthorRefs: []seo.Author{
				{Name: "Landed Ada", AuthorID: "a-landed"},
				{Name: "Missing Bob", AuthorID: "a-missing"},
			},
		}, nil
	}}
	h.authorSEOProvider = stubAuthorSEOWithCorpus{existing: map[string]bool{"a-landed": true}}

	body := requestSSR(t, h, "/paper/olx/p-1", humanUA).Body.String()

	if !strings.Contains(body, `<a href="/author/olx/a-landed">Landed Ada</a>`) {
		t.Errorf("landed author lost its link:\n%s", body)
	}
	if strings.Contains(body, "/author/olx/a-missing") {
		t.Errorf("author outside our corpus was still rendered as a link:\n%s", body)
	}
	if !strings.Contains(body, "Missing Bob") {
		t.Errorf("author name must survive as plain text:\n%s", body)
	}
}

// TestSSRAuthorPageLinksOnlyLandedWorks 作者页的代表作同口径;JSON-LD 的 hasPart url
// 也是爬虫会跟的边,一并不能指向未落地论文。
func TestSSRAuthorPageLinksOnlyLandedWorks(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	h.authorSEOProvider = stubAuthorSEO{byID: func(_, id string) (*seo.AuthorSSRMeta, error) {
		return &seo.AuthorSSRMeta{
			AuthorID:     id,
			Source:       "stc",
			Name:         "Ada Lovelace",
			SEOIndexable: true,
			Works: []seo.AuthorWork{
				{Title: "已落地的代表作", Source: "olx", PaperID: "p-landed", Year: 2024},
				{Title: "未落地的代表作", Source: "olx", PaperID: "p-missing", Year: 2023},
			},
		}, nil
	}}
	h.paperSEOProvider = stubPaperSEOWithCorpus{existing: map[string]bool{"p-landed": true}}

	body := requestSSR(t, h, "/author/stc/a-1", humanUA).Body.String()

	if !strings.Contains(body, `<a href="/paper/olx/p-landed">`) {
		t.Errorf("landed work lost its link:\n%s", body)
	}
	if strings.Contains(body, "p-missing") {
		t.Errorf("work outside our corpus leaked a URL (html or json-ld):\n%s", body)
	}
	if !strings.Contains(body, "未落地的代表作") {
		t.Errorf("work title must survive as plain text:\n%s", body)
	}
}

// TestSSRLinkFrontierFallsBackWhenProviderCannotCheck provider 没实现可选接口时保持旧行为:
// 一次接线遗漏不该让所有实体页的内链凭空消失。
func TestSSRLinkFrontierFallsBackWhenProviderCannotCheck(t *testing.T) {
	h := newSSRRoutingTestHandler(t)
	h.paperSEOProvider = stubPaperSEO{byID: func(_, id string) (*seo.PaperSSRMeta, error) {
		return &seo.PaperSSRMeta{
			PaperID: id, Source: "olx", Title: "论文", SEOIndexable: true,
			AuthorRefs: []seo.Author{{Name: "Ada", AuthorID: "a-1"}},
		}, nil
	}}
	h.authorSEOProvider = stubAuthorSEO{} // 不实现 AuthorCorpusProvider

	body := requestSSR(t, h, "/paper/olx/p-1", humanUA).Body.String()
	if !strings.Contains(body, `<a href="/author/olx/a-1">Ada</a>`) {
		t.Errorf("fallback must keep the existing behaviour:\n%s", body)
	}
}
