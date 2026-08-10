// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// ssr_meta.go 给 SSR 渲染层 (config.Handler) 用的 "结构化好的" SEO 元数据类型 + 解析方法。
//
// 历史上这些类型住在 config 包 (PaperSEOMeta / AuthorSEOMeta / JournalSEOMeta), seo
// 包返回的是 DB 行原型 (SEOPaper 等, 含 authors_json 字符串), 中间有 cmd/server/adapters.go
// 做 JSON 解析 + 字段平移。adapter 是为了避免 config 和 seo 互相 import 形成 cycle。
// 既然 import 图允许 config → seo (实测无反向), 那 SSR meta 类型放在 seo 包更自然:
// 谁产数据就由谁定义类型, 谁解析就由谁解析。adapter 在 cleanup 第 N 轮删掉。
//
// 这些类型只给 SSR 注入用 (HTML head meta + JSON-LD), 不外露给 API 客户端。
// 字段是 seo 行原型的 "已展开" 子集。

package seo

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
)

// PaperSSRMeta SSR 注入所需的最小论文元数据集。
//
// Source 是上游来源标识 ("stc" / "olx" / "pmd"), 用于:
//  1. 拼 canonical URL `/paper/{Source}/{PaperID}`, 在 legacy /paper/{slug} 请求里判断要不要 301
//  2. 未来多源去重 (同一篇论文在不同来源的 paperID 不同)
//
// 旧数据没回填 Source 时为空, handler 会跳过 301 留在原 slug 路径。
type PaperSSRMeta struct {
	PaperID  string
	Source   string
	Title    string
	Abstract string
	Year     *int
	Venue    string
	DOI      string
	Authors  []string
	// GEO: 被引数 / 学科 是"证据型"信号(统计数字 + 实体), 注入 noscript 卡片与 JSON-LD,
	// 让 AI 生成式引擎能引用可量化的论文权威度与领域。CitationCount 为 0 时不渲染。
	CitationCount int
	FieldsOfStudy []string
	// AuthorRefs 带 AuthorID 的作者列表(与 Authors 同源同序)。SSR 卡片用它把作者名
	// 渲染成 /author/{Source}/{AuthorID} 内链;Authors(纯名字)保留给 JSON-LD 与旧调用面。
	AuthorRefs []Author
	// SEOInactive means the durable SEO row was explicitly hidden/retired. A
	// missing row is different: it can be a legitimate deep link that has not
	// yet entered the SEO cache.
	SEOInactive  bool
	SEOIndexable bool
}

// AuthorWork 作者代表作(一篇论文的精简信息),供 SSR noscript 内链 + JSON-LD。
type AuthorWork struct {
	Title         string `json:"title"`
	Year          int    `json:"year,omitempty"`
	Venue         string `json:"venue,omitempty"`
	PaperID       string `json:"paperId,omitempty"`
	Source        string `json:"source,omitempty"`
	CitationCount int    `json:"citationCount,omitempty"`
}

// AuthorSSRMeta 作者 SSR 注入所需的最小元数据集
type AuthorSSRMeta struct {
	AuthorID      string
	Source        string
	Name          string
	Affiliations  []string
	Homepage      string
	PaperCount    int
	CitationCount int
	HIndex        *int
	ORCID         string       // 裸 iD;非空则进 ProfilePage 的 sameAs(权威身份信号)
	Works         []AuthorWork // 代表作(seoenrich 回填);noscript 列表 + 内链论文页
	SEOInactive   bool
	SEOIndexable  bool
}

// JournalSSRMeta 期刊 SSR 注入所需的最小元数据集
//
// Slug 是 SEO canonical 的 URL 后缀 (从 canonical_name 派生), 用于:
//  1. 在 /journal/{id} 请求时 301 跳到 /journal/{id}/{slug}
//  2. 在 /journal/{id}/{slug-wrong} 请求时 301 校正
//  3. 注入 <link rel=canonical>
type JournalSSRMeta struct {
	JournalID       int64
	Slug            string
	CanonicalName   string
	Publisher       string
	ISSNs           []string
	Country         string
	Type            string
	IsOA            bool
	JCRImpactFactor float64
	JCRQuartile     string
	OpenAlexHIndex  *int
	// RecentPapers 本刊近期代表论文(venue 名称匹配 seo_papers,年份↓被引↓)。
	// 2026-08-10 审计:期刊页此前 0 实体内链、描述承诺「近期发表」而正文没有 ——
	// 这份列表同时补上内容承诺与期刊→论文的内链(链接权重传递 + 抓取发现)。
	RecentPapers []AuthorWork
	SEOInactive  bool
	SEOIndexable bool
}

// ToolSSRMeta 功能广场工具详情页 (/tools/{slug}) 的 SSR 元数据。
// 由 internal/featuretool 的 Service 实现 ResolveToolBySlug 后回填(featuretool → seo 单向, 无 cycle),
// config 包注入到 index.html (title/description/keywords/canonical/JSON-LD/noscript)。
type ToolSSRMeta struct {
	Slug          string
	Name          string
	NameEn        string
	Tagline       string
	Description   string
	CategoryLabel string
	Logo          string
	Tags          []string
	AccessType    string
	PriceType     string
	OfficialURL   string
	SEOIndexable  bool
	UseCases      []ToolUseCaseMeta
	FAQ           []ToolQAMeta
}

type ToolUseCaseMeta struct {
	Title string
	Desc  string
}

type ToolQAMeta struct {
	Question string
	Answer   string
}

// NewsSourceMeta 情报来源(SSR / JSON-LD 用)。
type NewsSourceMeta struct {
	URL   string
	Label string
}

// NewsSSRMeta 情报详情页 (/news/{slug}) 的 SSR 元数据。
// 由 internal/news 的 Service 实现 ResolveNewsBySlug 后回填(news → seo 单向, 无 cycle),
// config 包注入到 index.html(title/description/canonical/NewsArticle JSON-LD/noscript 全文)。
// BodyHTML 是已 sanitize 的正文 HTML(上游 body_html 经白名单清洗)。
type NewsSSRMeta struct {
	Slug            string
	Title           string
	Summary         string
	BodyHTML        string
	SectionLabel    string
	ReportType      string
	CoverImage      string
	PublishedAt     string // RFC3339
	UpdatedAt       string // RFC3339(dateModified)
	CredibilityNote string
	Sources         []NewsSourceMeta
}

// ResolveSlug 老 /paper/{slug} 直接根据 slug 反查, 返回 SSR meta (legacy 301 流量)。
// 返回 (nil, nil) 只表示 SEO 缓存未命中，不能证明上游实体不存在。canonical
// 两段深链在未启用权威 on-miss resolver 时必须保留 200+noindex，避免误伤真实体。
func (s *Service) ResolveSlug(slug string) (*PaperSSRMeta, error) {
	p, err := s.GetBySlug(slug)
	if err != nil || p == nil {
		return nil, err
	}
	return paperSSRMetaFromRow(p), nil
}

// ResolveByPaperID 新 canonical /paper/{source}/{paperId} 的解析入口。
// source 当前不参与查询 (paperId 全局唯一), 仅保留接口形参以便日后做多源去重。
func (s *Service) ResolveByPaperID(_, paperID string) (*PaperSSRMeta, error) {
	p, err := s.GetByPaperID(paperID)
	if err != nil || p == nil {
		return nil, err
	}
	return paperSSRMetaFromRow(p), nil
}

// ResolveAuthorSlug 老 /author/{slug}
func (s *Service) ResolveAuthorSlug(slug string) (*AuthorSSRMeta, error) {
	au, err := s.GetAuthorBySlug(slug)
	if err != nil || au == nil {
		return nil, err
	}
	return authorSSRMetaFromRow(au), nil
}

// ResolveByAuthorID 新 canonical /author/{source}/{authorId}
func (s *Service) ResolveByAuthorID(_, authorID string) (*AuthorSSRMeta, error) {
	au, err := s.GetAuthorByAuthorID(authorID)
	if err != nil || au == nil {
		return nil, err
	}
	return authorSSRMetaFromRow(au), nil
}

// ResolveByJournalID 期刊详情 SSR meta
func (s *Service) ResolveByJournalID(journalID int64) (*JournalSSRMeta, error) {
	j, err := s.GetJournalByID(journalID)
	if err != nil || j == nil {
		return nil, err
	}
	meta := &JournalSSRMeta{
		JournalID: j.JournalID,
		// Slug is derived from the current canonical name, just like the
		// frontend helper and sitemap renderer. The persisted column is only a
		// write-time cache and may predate a journal rename.
		Slug:            GenerateJournalSlug(j.CanonicalName),
		CanonicalName:   j.CanonicalName,
		Publisher:       j.Publisher,
		Country:         j.Country,
		Type:            j.Type,
		IsOA:            j.IsOA,
		JCRImpactFactor: j.JCRImpactFactor,
		JCRQuartile:     j.JCRQuartile,
		SEOInactive:     j.Status != StatusActive,
		SEOIndexable:    journalRowIndexable(j),
	}
	if j.OpenAlexHIndex != nil {
		h := *j.OpenAlexHIndex
		meta.OpenAlexHIndex = &h
	}
	if j.ISSNsJSON != "" {
		var issns []string
		if err := json.Unmarshal([]byte(j.ISSNsJSON), &issns); err == nil {
			// 输出兜底(2026-08-10 审计):历史行可能存有「单元素内逗号拼接多 ISSN」的
			// 脏数组(入库侧已修 + 迁移 0122 已清洗,这里挡未来其它写入路径),
			// 读出时拆分+去重,保证 Periodical JSON-LD 的 issn 永远是干净数组。
			meta.ISSNs = NormalizeISSNs(issns)
		}
	}
	// 近期代表论文:失败不阻断 SSR(列表是增强,元数据是底线)。
	if papers, err := s.repo.ListPapersByVenueForSSR(j.CanonicalName, 6); err != nil {
		slog.Warn("seo journal recent papers query failed", "journal_id", j.JournalID, "err", err)
	} else {
		meta.RecentPapers = papers
	}
	return meta, nil
}

// samePaperTitle 判断两个标题是否同一篇论文(DOI 撞键防线用):大小写不敏感、
// 前 30 个 rune 前缀比对 —— 同一论文的跨源记录标题一致(或仅尾部标点/副标题差异),
// 字段嫁接的两篇论文标题则完全无关。空标题按「不同」处理(无从判定,宁可拒写 DOI)。
func samePaperTitle(a, b string) bool {
	na, nb := titlePrefix30(a), titlePrefix30(b)
	if na == "" || nb == "" {
		return false
	}
	return na == nb
}

func titlePrefix30(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	r := []rune(s)
	if len(r) > 30 {
		r = r[:30]
	}
	return string(r)
}

// NormalizeISSNs 把 ISSN 列表归一:每个元素按 [,;] 拆分、TrimSpace、统一大写 X、
// 剔除空串、保序去重。刻意不做严格格式校验(那是入库侧的职责)——输出侧只负责
// 「不重复、不拼接」,避免把历史上格式特殊但真实的值静默吞掉。
func NormalizeISSNs(in []string) []string {
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, el := range in {
		for _, part := range strings.FieldsFunc(el, func(r rune) bool { return r == ',' || r == ';' }) {
			s := strings.ToUpper(strings.TrimSpace(part))
			if s == "" {
				continue
			}
			if _, ok := seen[s]; ok {
				continue
			}
			seen[s] = struct{}{}
			out = append(out, s)
		}
	}
	return out
}

// paperSSRMetaFromRow 把 seo_papers 行映射成 SSR 注入需要的子集
func paperSSRMetaFromRow(p *SEOPaper) *PaperSSRMeta {
	meta := &PaperSSRMeta{
		PaperID:       p.PaperID,
		Source:        p.Source,
		Title:         p.Title,
		Abstract:      p.Abstract,
		Venue:         p.Venue,
		DOI:           p.DOI,
		CitationCount: p.CitationCount,
		SEOInactive:   p.Status != StatusActive,
		SEOIndexable:  paperRowIndexable(p),
	}
	if p.Year != nil {
		y := *p.Year
		meta.Year = &y
	}
	// fields_of_study 是字符串数组 JSON (["Computer Science", ...]); 解析失败降级为空
	if p.FieldsOfStudy != "" {
		var fos []string
		if err := json.Unmarshal([]byte(p.FieldsOfStudy), &fos); err != nil {
			slog.Debug("seo: paper fields_of_study unmarshal failed", "paper_id", p.PaperID, "err", err)
		} else {
			for _, f := range fos {
				if f != "" {
					meta.FieldsOfStudy = append(meta.FieldsOfStudy, f)
				}
			}
		}
	}
	// 作者解析 authors_json 失败不致命, 降级为空列表
	if p.AuthorsJSON != "" {
		var authors []Author
		if err := json.Unmarshal([]byte(p.AuthorsJSON), &authors); err != nil {
			slog.Debug("seo: paper authors_json unmarshal failed", "paper_id", p.PaperID, "err", err)
		} else {
			for _, au := range authors {
				if au.Name != "" {
					meta.Authors = append(meta.Authors, au.Name)
					meta.AuthorRefs = append(meta.AuthorRefs, au)
				}
			}
		}
	}
	return meta
}

// authorSSRMetaFromRow 把 seo_authors 行映射成 SSR 注入需要的子集
func authorSSRMetaFromRow(au *SEOAuthor) *AuthorSSRMeta {
	meta := &AuthorSSRMeta{
		AuthorID:      au.AuthorID,
		Source:        au.Source,
		Name:          au.Name,
		Homepage:      au.Homepage,
		PaperCount:    au.PaperCount,
		CitationCount: au.CitationCount,
		SEOInactive:   au.Status != StatusActive,
		SEOIndexable:  authorRowIndexable(au),
	}
	if au.HIndex != nil {
		h := *au.HIndex
		meta.HIndex = &h
	}
	meta.ORCID = au.ORCID
	if au.AffiliationsJSON != "" {
		var affs []string
		if err := json.Unmarshal([]byte(au.AffiliationsJSON), &affs); err == nil {
			meta.Affiliations = affs
		}
	}
	if au.TopWorksJSON != "" {
		var works []AuthorWork
		if err := json.Unmarshal([]byte(au.TopWorksJSON), &works); err == nil {
			meta.Works = works
		} else {
			slog.Debug("seo: author top_works unmarshal failed", "author_id", au.AuthorID, "err", err)
		}
	}
	return meta
}

// ========== seosubmit.SeedSource 接口适配 ==========
// 把 content_articles.go 的 package-level fn 提到 Service 方法上, 让 seo.Service
// 不靠 cmd/server adapter 直接满足 seosubmit.SeedSource。BootstrapXxxSlugs 故意接受
// (但忽略) ctx 形参, 与接口签名一致 — 当前实现是同步 in-memory, 后续若改成数据库
// 大表分批拉再考虑透传 ctx。

// StaticPaths 暴露静态页 URL 列表
func (s *Service) StaticPaths() []string { return AllStaticPaths() }

// BlogPaths 暴露博客 URL 列表
func (s *Service) BlogPaths() []string { return AllBlogPaths() }

// ResourcePaths 暴露资源页 URL 列表
func (s *Service) ResourcePaths() []string { return AllResourcePaths() }

// QAPaths 暴露学术问答 URL 列表
func (s *Service) QAPaths() []string { return AllQAPaths() }

// BootstrapPaperPaths 给 seosubmit 启动期 seed 用 —— 热门论文 canonical 路径 /paper/{source}/{id}。
// ctx 当前不参与 (实现是同步 in-memory), 保留以匹配接口签名。
func (s *Service) BootstrapPaperPaths(_ context.Context, limit int) []string {
	return s.GetTopPaperPaths(limit)
}

// BootstrapAuthorPaths 同上, 热门作者 canonical 路径 /author/{source}/{id}。
func (s *Service) BootstrapAuthorPaths(_ context.Context, limit int) []string {
	return s.GetTopAuthorPaths(limit)
}
