// ============================================================================
// Scholay学术 V1.0
// 内容文章静态索引 —— 博客 + 资源中心
//
// 博客 (/blog/:slug) 和资源 (/resources/:slug) 目前是纯前端静态数据，
// 分别位于:
//   frontend-user/src/pages/blog/blogArticles.js
//   frontend-user/src/pages/resourceArticles.js
//
// 为了让 sitemap 正确枚举这些 slug，把 (slug, lastmod) 在此以 Go 切片形式
// 镜像一份。任何一侧新增/删除文章时，必须同步修改对应的 JS 和本文件。
//
// 后续若把文章迁到数据库，这里改为 repository 查询即可，handler 层接口不变。
// ============================================================================

package seo

// ArticleEntry sitemap 条目（博客/资源通用）
type ArticleEntry struct {
	Slug    string // URL slug
	LastMod string // YYYY-MM-DD，用作 <lastmod>
}

// BlogArticles 博客文章注册表
// 与 frontend-user/src/pages/blog/blogArticles.js 保持一致
// lastmod 取 updatedDate (若无则取 date)
var BlogArticles = []ArticleEntry{
	{"ai-literature-search-efficiency", "2026-02-24"},
	{"academic-search-tools-comparison-2026", "2026-02-22"},
	{"semantic-scholar-vs-google-scholar", "2026-02-18"},
	{"graduate-literature-review-workflow", "2026-02-12"},
	{"judge-paper-quality-impact", "2026-02-05"},
	{"citation-network-analysis", "2026-01-28"},
	{"ai-academic-writing-ethics", "2026-02-01"},
	{"open-access-legal-free-papers", "2026-01-18"},
	{"latex-vs-word-academic-writing", "2026-01-12"},
	{"peer-review-process-explained", "2026-01-08"},
	{"citation-trend-discovery", "2026-01-05"},
	{"cross-disciplinary-search-strategies", "2025-12-28"},
	{"conference-vs-journal-papers", "2025-12-22"},
	{"scholay-platform-complete-guide", "2026-02-20"},
	{"common-search-mistakes-solutions", "2025-12-15"},
	{"ai-tools-research-workflow-2026", "2026-02-18"},
}

// ResourceArticles 资源中心文章注册表
// 与 frontend-user/src/pages/resourceArticles.js 保持一致
var ResourceArticles = []ArticleEntry{
	{"how-to-search", "2025-12-15"},
	{"literature-review-guide", "2025-12-20"},
	{"paper-writing-tips", "2026-01-05"},
	{"citation-guide", "2026-01-10"},
	{"research-methodology", "2026-01-15"},
	{"ai-in-research", "2026-01-20"},
	{"peer-review-guide", "2026-01-25"},
	{"latex-tutorial", "2026-02-01"},
	{"open-access-guide", "2026-02-10"},
	{"systematic-review-meta-analysis", "2026-02-12"},
	{"academic-english-writing", "2026-02-15"},
	{"research-data-management", "2026-02-18"},
	{"academic-conference-guide", "2026-02-20"},
}
