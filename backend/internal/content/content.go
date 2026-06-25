// Package content 是博客 / 学术资源文章的**单一真源**。
//
// 文章正文以结构化 JSON(沿用前端 ArticleSection schema: paragraph/heading/tip)存放在
// data/{blog,resources}/*.json,go:embed 进二进制。两个消费方:
//   1. SSR(internal/config):把全文渲染进 <noscript>,让搜索引擎 / AI 爬虫读到完整正文(GEO)。
//   2. 公开内容 API(本包 handler.go):前端文章页取数渲染(前端不再打包正文 TS)。
//
// 数据由 frontend-user 的 blog-articles.ts / resource-articles.ts 迁移而来
// (scripts 一次性导出),此后以本包为准。
package content

import (
	"embed"
	"encoding/json"
	"log/slog"
	"sort"
	"strings"
)

//go:embed data/blog/*.json data/resources/*.json data/qa/*.json
var dataFS embed.FS

// Kinds 当前支持的内容类型。qa = 学术问答(每个问题一篇完整长答案)。
var Kinds = []string{"blog", "resources", "qa"}

// Author 文章署名(E-E-A-T)。
type Author struct {
	Name string `json:"name"`
	Role string `json:"role"`
	Bio  string `json:"bio"`
}

// QA 是 faq section 里的一问一答。
type QA struct {
	Q string `json:"q"`
	A string `json:"a"`
}

// Section 一段正文。Type ∈ {paragraph, heading, tip, list, table, faq}。
// 各类型只用到自己的字段(JSON omitempty),保持单结构体扁平好序列化:
//   paragraph: Text
//   heading:   Text
//   tip:       Title + Text
//   list:      Items(+ Ordered 决定 ol/ul)
//   table:     Headers + Rows(GEO 对比表)
//   faq:       FAQ(一问一答;额外产出 FAQPage JSON-LD,AI 最易抽取)
type Section struct {
	Type    string     `json:"type"`
	Text    string     `json:"text,omitempty"`
	Title   string     `json:"title,omitempty"`
	Ordered bool       `json:"ordered,omitempty"`
	Items   []string   `json:"items,omitempty"`
	Headers []string   `json:"headers,omitempty"`
	Rows    [][]string `json:"rows,omitempty"`
	FAQ     []QA       `json:"faq,omitempty"`
}

// Article 一篇文章。
type Article struct {
	Slug        string    `json:"slug"`
	Kind        string    `json:"kind"`
	Title       string    `json:"title"`
	Category    string    `json:"category"`
	Tags        []string  `json:"tags"`
	Excerpt     string    `json:"excerpt"`
	ReadTime    string    `json:"readTime"`
	Date        string    `json:"date"`
	UpdatedDate string    `json:"updatedDate"`
	Author      *Author   `json:"author"`
	Sections    []Section `json:"sections"`
}

// LastMod 取 UpdatedDate,无则 Date(YYYY-MM-DD,字典序即时间序)。
func (a *Article) LastMod() string {
	if a.UpdatedDate != "" {
		return a.UpdatedDate
	}
	return a.Date
}

var (
	byKindSlug = map[string]map[string]*Article{}
	listByKind = map[string][]*Article{}
)

func init() {
	for _, kind := range Kinds {
		byKindSlug[kind] = map[string]*Article{}
		entries, err := dataFS.ReadDir("data/" + kind)
		if err != nil {
			slog.Warn("content: read embed dir failed", "kind", kind, "err", err)
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
				continue
			}
			b, err := dataFS.ReadFile("data/" + kind + "/" + e.Name())
			if err != nil {
				slog.Warn("content: read embed file failed", "file", e.Name(), "err", err)
				continue
			}
			var a Article
			if err := json.Unmarshal(b, &a); err != nil {
				slog.Warn("content: unmarshal failed", "file", e.Name(), "err", err)
				continue
			}
			if a.Kind == "" {
				a.Kind = kind
			}
			// 保证 Tags 永远是数组而非 null(资源类文章无 tags 字段 → nil → JSON null →
			// 前端 a.tags.filter 运行期崩)。统一空数组,契约 tags: string[] 才成立。
			if a.Tags == nil {
				a.Tags = []string{}
			}
			ac := a
			byKindSlug[kind][ac.Slug] = &ac
			listByKind[kind] = append(listByKind[kind], &ac)
		}
		// 按 lastmod 倒序(新 → 旧)
		sort.SliceStable(listByKind[kind], func(i, j int) bool {
			return listByKind[kind][i].LastMod() > listByKind[kind][j].LastMod()
		})
		slog.Info("content: loaded", "kind", kind, "count", len(listByKind[kind]))
	}
}

// Get 按 kind+slug 取单篇。
func Get(kind, slug string) (*Article, bool) {
	m, ok := byKindSlug[kind]
	if !ok {
		return nil, false
	}
	a, ok := m[slug]
	return a, ok
}

// List 返回某 kind 的全部文章(lastmod 倒序)。返回的是内部切片,调用方只读。
func List(kind string) []*Article { return listByKind[kind] }

// MaxLastMod 返回某 kind 中最新的 lastmod,空则空串(供 sitemap lastmod 用)。
func MaxLastMod(kind string) string {
	max := ""
	for _, a := range listByKind[kind] {
		if m := a.LastMod(); m > max {
			max = m
		}
	}
	return max
}
