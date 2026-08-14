// ============================================================================
// 情报 SSR/SEO provider —— 实现 config.NewsSEOProvider(news → seo 单向, 无 cycle)。
//   ResolveNewsBySlug  详情页全文 + 元数据(已 sanitize body_html)
//   RecentNewsForSEO   列表页 noscript 链接列表(slug + title)
// 功能未开启(enabled=false)→ 返回 nil,SSR 回落默认壳(不让未上线内容进搜索)。
// ============================================================================

package news

import (
	"regexp"
	"strings"

	"scholar-backend/internal/seo"
)

// ResolveNewsBySlug 详情页 SSR meta(含 sanitize 后的全文)。不存在/未开启 → (nil, nil)。
func (s *Service) ResolveNewsBySlug(slug string) (*seo.NewsSSRMeta, error) {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		return nil, err
	}
	if !cfg.Enabled {
		return nil, nil
	}
	item, ok, err := s.repo.GetBySlug(slug)
	if err != nil || !ok {
		return nil, err
	}
	return toSSRMeta(item), nil
}

// RecentNewsForSEO 列表页 noscript 用(只填 slug/title/summary/时间)。未开启 → 空。
func (s *Service) RecentNewsForSEO(limit int) ([]*seo.NewsSSRMeta, error) {
	cfg, err := s.repo.GetConfig()
	if err != nil {
		return nil, err
	}
	if !cfg.Enabled {
		return nil, nil
	}
	items, err := s.repo.ListCards("latest", "", limit, 0)
	if err != nil {
		return nil, err
	}
	out := make([]*seo.NewsSSRMeta, 0, len(items))
	for i := range items {
		it := items[i]
		out = append(out, &seo.NewsSSRMeta{
			Slug:        it.Slug,
			Title:       it.Title,
			Summary:     it.Summary,
			PublishedAt: fmtTime(it.PublishedAt),
		})
	}
	return out, nil
}

func toSSRMeta(it *NewsItem) *seo.NewsSSRMeta {
	srcs := parseSources(it.Sources)
	out := make([]seo.NewsSourceMeta, 0, len(srcs))
	for _, sc := range srcs {
		out = append(out, seo.NewsSourceMeta{URL: sc.URL, Label: sc.Label})
	}
	return &seo.NewsSSRMeta{
		Slug:            it.Slug,
		Title:           it.Title,
		Summary:         it.Summary,
		BodyHTML:        sanitizeBodyHTML(it.BodyHTML),
		SectionLabel:    it.SectionLabel,
		ReportType:      it.ReportType,
		CoverImage:      it.CoverImage,
		PublishedAt:     fmtTime(it.PublishedAt),
		UpdatedAt:       fmtTime(it.UpstreamUpdatedAt),
		CredibilityNote: it.CredibilityNote,
		Sources:         out,
	}
}

// ─── body_html 轻量 sanitize ────────────────────────────────────────────────
// 上游是可信 server-to-server(HMAC 验签),且正文只进 <noscript>(浏览器不执行),
// 故做「轻量白名单清洗」即可:剥 <script>/<style> 块、on* 事件属性、javascript: 协议。
// 这是 stored-XSS + SEO 双重防线(脏标签也会污染我方索引)。
var (
	reScriptBlock = regexp.MustCompile(`(?is)<script\b[^>]*>.*?</script>`)
	reStyleBlock  = regexp.MustCompile(`(?is)<style\b[^>]*>.*?</style>`)
	reOnAttr      = regexp.MustCompile(`(?is)\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)`)
	reJsProto     = regexp.MustCompile(`(?is)(href|src)\s*=\s*("|')\s*javascript:[^"']*("|')`)
	reIframe      = regexp.MustCompile(`(?is)<iframe\b[^>]*>.*?</iframe>`)
)

func sanitizeBodyHTML(html string) string {
	if html == "" {
		return ""
	}
	html = reScriptBlock.ReplaceAllString(html, "")
	html = reStyleBlock.ReplaceAllString(html, "")
	html = reIframe.ReplaceAllString(html, "")
	html = reOnAttr.ReplaceAllString(html, "")
	html = reJsProto.ReplaceAllString(html, `$1=$2#$3`)
	return strings.TrimSpace(html)
}
