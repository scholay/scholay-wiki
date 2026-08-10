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

import "scholar-backend/internal/content"

// ArticleEntry sitemap 条目（博客/资源通用）
type ArticleEntry struct {
	Slug    string // URL slug
	LastMod string // YYYY-MM-DD，用作 <lastmod>
}

// StaticPagesLastMod 静态页面的真实最近修改日期。
//
// 用法:
//   - sitemap-static.xml 内每个 <url> 的 <lastmod> 都用此值
//   - sitemap.xml 索引中 static 子条目的 <lastmod> 也用此值
//
// 维护: 当 ServeStaticSitemap 中 staticPages 列表新增/删除/改路径,或这些
// 静态页的页面内容有显著变更(SEO 文案/标题)时,手动 bump 这个日期。
// 不需要每天改 — 没有真实变更就别动。
const StaticPagesLastMod = "2026-08-10"

// StaticPage sitemap-static 的单条目结构。导出后 ServeStaticSitemap 和
// 主动提交 bootstrap 都基于同一份数据,避免两处维护。
type StaticPage struct {
	Path       string
	ChangeFreq string
	Priority   string
}

// StaticPages 站点全部静态/列表入口。
// 维护:新增静态路由就加一行;sitemap 和主动提交都自动跟进。
//
// **与 frontend-v2 实际路由严格对齐**(2026-05 重排):
//   - 旧 frontend-user 的 /chat /assistant /latex-writer /features/latex-writer
//     在 v2 已 redirect 到新规范名(/claw /prism /features/prism),不再放进
//     sitemap —— 改放新的 canonical(避免 Google 把 redirect 链入索引,
//     稀释 PageRank)
//   - 旧链接的 SEO 入站权重靠 nginx 301 保留(legacy-redirects.conf),
//     不依赖 sitemap 暴露
//   - 公开搜索入口 /search /journals/search 是公开页(空状态有引导文案 + 装饰),
//     加入 sitemap 不构成 thin content;具体结果仍走 /paper/{slug}、
//     /author/{slug} 动态 sitemap
//   - 裸应用入口 /claw /prism /peer-review 已移出 sitemap(2026-06):它们的 SEO 落地
//     语义由营销页 /features/{claw,prism,peer-review} 承担(canonical 集中,避免重复内容);
//     /contact /feedback 是表单/反馈页,非 SEO 落地页,也一并移出,杜绝"进 sitemap 却空壳"的低质收录。
var StaticPages = []StaticPage{
	// ── 核心功能首页 ──────────────────────────────────
	{"/", "daily", "1.0"},
	{"/search", "weekly", "0.8"},          // 文献搜索入口
	{"/journals/search", "weekly", "0.7"}, // 期刊搜索入口
	{"/tools", "weekly", "0.8"},           // 经审核科研工具的发现枢纽
	{"/tools/skills", "weekly", "0.7"},    // 社区技能公开入口

	// ── 期刊聚合榜单(程序化 SEO 落地页,预设筛选 + 实结果,非 thin content)──
	{"/journals/sci-q1", "weekly", "0.6"},             // SCI 一区(JCR Q1)
	{"/journals/cas-zone1", "weekly", "0.6"},          // 中科院一区
	{"/journals/ccf-a", "weekly", "0.6"},              // CCF A 类
	{"/journals/high-impact-factor", "weekly", "0.6"}, // 高影响因子 IF≥10

	// ── 营销 / 品牌页(7 个 feature 落地页 + 概览 + 价格) ─────
	{"/features", "monthly", "0.7"},
	{"/features/search", "monthly", "0.6"},
	{"/features/library", "monthly", "0.6"},
	{"/features/prism", "monthly", "0.6"},
	{"/features/claw", "monthly", "0.6"},
	{"/features/submit", "monthly", "0.6"},
	{"/features/peer-review", "monthly", "0.6"},
	{"/pricing", "monthly", "0.7"},
	{"/about", "monthly", "0.6"},

	// ── 内容中心入口 ──────────────────────────────────
	{"/resources", "weekly", "0.8"}, // 学术资源中心(博客+资源合并,/blog 进同一中心)
	{"/blog", "weekly", "0.8"},
	{"/help", "weekly", "0.8"}, // 帮助中心 = 学术问答(QA 列表首页);/qa 裸列表 301→/help 故不再单列

	// ── 合规页(信任信号,需可索引) ───────────────────
	{"/privacy", "monthly", "0.5"},
	{"/terms", "monthly", "0.5"},
	{"/disclaimer", "monthly", "0.5"},
}

// AllStaticPaths 返回 StaticPages 的纯路径列表(主动提交 bootstrap 用)
func AllStaticPaths() []string {
	out := make([]string, 0, len(StaticPages))
	for _, p := range StaticPages {
		out = append(out, p.Path)
	}
	return out
}

// articleSeedPaths 从 content 包(正文单一真源)生成某类的 /{index} + /{index}/{slug} 全集,
// 供主动推送(IndexNow/百度)seed 用。content 包加文章即自动覆盖,不再依赖旧 registry。
func articleSeedPaths(kind, indexPath string) []string {
	arts := content.List(kind)
	out := make([]string, 0, len(arts)+1)
	out = append(out, indexPath)
	for _, a := range arts {
		if a.Slug != "" {
			out = append(out, indexPath+"/"+a.Slug)
		}
	}
	return out
}

// AllBlogPaths 返回 /blog + /blog/{slug} 全集(content 单一真源)
func AllBlogPaths() []string { return articleSeedPaths("blog", "/blog") }

// AllResourcePaths 返回 /resources + /resources/{slug} 全集(content 单一真源)
func AllResourcePaths() []string { return articleSeedPaths("resources", "/resources") }

// AllQAPaths 返回 QA 的主动推送路径:列表首页 /help(帮助中心=学术问答)+ 详情 /qa/{slug}。
// 详情 URL 保持 /qa/(canonical 不变);裸 /qa 列表已 301→/help,故列表入口用 /help。
func AllQAPaths() []string {
	arts := content.List("qa")
	out := make([]string, 0, len(arts)+1)
	out = append(out, "/help")
	for _, a := range arts {
		if a.Slug != "" {
			out = append(out, "/qa/"+a.Slug)
		}
	}
	return out
}

// 注:BlogArticles / ResourceArticles registries 与 MaxArticleLastMod 现已无人读
// (sitemap 走 content.MaxLastMod、seed 走 content.List),保留为历史兜底,Go 允许未使用的包级声明。

// MaxArticleLastMod 计算一组文章中最近的 lastmod (YYYY-MM-DD 字典序比较即可)
// 空切片返回空串,调用方应回退到默认值。
func MaxArticleLastMod(entries []ArticleEntry) string {
	max := ""
	for _, e := range entries {
		if e.LastMod > max {
			max = e.LastMod
		}
	}
	return max
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
