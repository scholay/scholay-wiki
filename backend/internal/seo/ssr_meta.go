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
}

// ResolveSlug 老 /paper/{slug} 直接根据 slug 反查, 返回 SSR meta (legacy 301 流量)。
// 返回 (nil, nil) 表示 slug 不存在 — handler 走 404 路径。
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
		JournalID:       j.JournalID,
		Slug:            j.Slug,
		CanonicalName:   j.CanonicalName,
		Publisher:       j.Publisher,
		Country:         j.Country,
		Type:            j.Type,
		IsOA:            j.IsOA,
		JCRImpactFactor: j.JCRImpactFactor,
		JCRQuartile:     j.JCRQuartile,
	}
	if j.OpenAlexHIndex != nil {
		h := *j.OpenAlexHIndex
		meta.OpenAlexHIndex = &h
	}
	if j.ISSNsJSON != "" {
		var issns []string
		if err := json.Unmarshal([]byte(j.ISSNsJSON), &issns); err == nil {
			meta.ISSNs = issns
		}
	}
	return meta, nil
}

// paperSSRMetaFromRow 把 seo_papers 行映射成 SSR 注入需要的子集
func paperSSRMetaFromRow(p *SEOPaper) *PaperSSRMeta {
	meta := &PaperSSRMeta{
		PaperID:  p.PaperID,
		Source:   p.Source,
		Title:    p.Title,
		Abstract: p.Abstract,
		Venue:    p.Venue,
		DOI:      p.DOI,
	}
	if p.Year != nil {
		y := *p.Year
		meta.Year = &y
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
	}
	if au.HIndex != nil {
		h := *au.HIndex
		meta.HIndex = &h
	}
	if au.AffiliationsJSON != "" {
		var affs []string
		if err := json.Unmarshal([]byte(au.AffiliationsJSON), &affs); err == nil {
			meta.Affiliations = affs
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

// BootstrapPaperSlugs 给 seosubmit 启动期 seed 用 —— 热门论文 slug
// ctx 当前不参与 (实现是同步 in-memory), 保留以匹配接口签名。
func (s *Service) BootstrapPaperSlugs(_ context.Context, limit int) []string {
	return s.GetTopPaperSlugs(limit)
}

// BootstrapAuthorSlugs 同上, 热门作者 slug
func (s *Service) BootstrapAuthorSlugs(_ context.Context, limit int) []string {
	return s.GetTopAuthorSlugs(limit)
}
