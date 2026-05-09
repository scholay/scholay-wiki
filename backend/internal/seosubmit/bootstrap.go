// ============================================================================
// Scholay学术 V1.0
// 启动期一次性入队 —— 把所有"已存在的静态/列表/文章" URL 扔进队列。
//
// 为什么要做:
//   1. 服务首次接入主动提交时,数据库里已经有大量历史 paper/author,只靠"未来写入触发"
//      会让旧数据永远没机会被推。这里在启动时打底一次。
//   2. 静态/博客/资源页是写死在前端代码 + sitemap 里的,数据库里没有,必须显式列出。
//
// 防重:Redis ZSET 自带 ZADD 去重,即使每次启动都 enqueue 全量也不会让推送量翻倍。
// ============================================================================

package seosubmit

import (
	"context"
	"log/slog"
	"time"

	"scholar-backend/internal/common/safego"
)

// SeedSource 由调用方实现,提供启动 seed 的全部 URL 路径。
// 拆出接口避免 seosubmit 反向依赖 seo 包(那里有 BlogArticles / ResourceArticles 数据)。
type SeedSource interface {
	StaticPaths() []string  // 像 ["/", "/pricing", "/about", ...]
	BlogPaths() []string    // 像 ["/blog", "/blog/foo-slug", ...]
	ResourcePaths() []string // 像 ["/resources", "/resources/foo-slug", ...]
	// 数据库 paper/author slug 通过 LimitedPaperSlugs / LimitedAuthorSlugs 获取
	// 限量 + 优先 tier=1 的实现见 seo.Service.GetTopSlugsForBootstrap
	BootstrapPaperSlugs(ctx context.Context, limit int) []string
	BootstrapAuthorSlugs(ctx context.Context, limit int) []string
}

// BootstrapEnqueue 启动时一次性 seed 队列。
// 异步运行,失败静默,不阻塞 server 启动。
//
// limit:每类 paper/author 各最多入队多少条(避免几十万一次性灌进去)。
// 比如 5000:足够初次接入打底,后续靠 SEO write hook 增量推。
func (s *Service) BootstrapEnqueue(parent context.Context, src SeedSource, limit int) {
	if !s.Enabled() || src == nil {
		return
	}
	safego.Go("seo-push-bootstrap-seed", func() {
		ctx, cancel := context.WithTimeout(parent, 30*time.Second)
		defer cancel()

		all := []string{}
		all = append(all, src.StaticPaths()...)
		all = append(all, src.BlogPaths()...)
		all = append(all, src.ResourcePaths()...)

		paperSlugs := src.BootstrapPaperSlugs(ctx, limit)
		for _, slug := range paperSlugs {
			if slug != "" {
				all = append(all, "/paper/"+slug)
			}
		}
		authorSlugs := src.BootstrapAuthorSlugs(ctx, limit)
		for _, slug := range authorSlugs {
			if slug != "" {
				all = append(all, "/author/"+slug)
			}
		}

		s.EnqueuePaths(ctx, all)
		slog.Info("seo push bootstrap seeded",
			"static", len(src.StaticPaths()),
			"blogs", len(src.BlogPaths()),
			"resources", len(src.ResourcePaths()),
			"papers", len(paperSlugs),
			"authors", len(authorSlugs),
		)
	})
}
