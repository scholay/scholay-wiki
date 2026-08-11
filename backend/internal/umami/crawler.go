// ============================================================================
// internal/umami — 「搜索引擎抓取」admin 面板端点
//
//   GET /admin/analytics/crawler?range=24h|7d|30d
//
// 数据源是 internal/crawlerwatch 写入的**独立**爬虫监控 website(每次爬虫命中
// = 一条自定义事件:事件名 = 引擎 key,url = 被抓路径,data = {engine, status})。
//
// 🔴 取数口径(2026-08-11 对 umami 2.20.2 逐端点实测,勿凭 umami 文档想当然):
// 带 name 的自定义事件是 event_type=2,而 /stats、/pageviews、/metrics?type=url、
// reports/insights 全部只统计 event_type=1 的 pageview —— 对这个站点它们恒空。
// 所以:
//   - 引擎排行   → GET /metrics?type=event          (自定义事件名计数,可用)
//   - 时间序列   → GET /events/series               (自定义事件唯一的时序端点)
//   - 状态码提示 → GET /event-data/fields           (data.status 取值分布)
//   - top_pages  → HTTP API 做不到,直查 umami 库一条 GROUP BY(见 crawlerTopPages)
// ============================================================================

package umami

import (
	"context"
	"log/slog"
	"sort"
	"strconv"
	"time"

	"scholar-backend/internal/common/utils"

	"github.com/gin-gonic/gin"
)

// crawlerEngineCount 引擎抓取量一行。
type crawlerEngineCount struct {
	Engine string `json:"engine"`
	Count  uint64 `json:"count"`
}

// crawlerSeriesPoint 时间桶一行。t 格式:hour → "2006-01-02 15:04",day → "2006-01-02"。
type crawlerSeriesPoint struct {
	T     string `json:"t"`
	Count uint64 `json:"count"`
}

// crawlerPageCount 被抓路径一行。
type crawlerPageCount struct {
	URL   string `json:"url"`
	Count uint64 `json:"count"`
}

// GetCrawlerStats —— 「搜索引擎抓取」面板一次拉全。
//
// 未配置(UMAMI_CRAWLER_WEBSITE_ID 空)→ 200 + {configured:false},不是错误:
// 前端据此渲染配置引导卡。
func (h *Handler) GetCrawlerStats(c *gin.Context) {
	if h.crawler == nil {
		utils.Success(c, gin.H{"configured": false})
		return
	}

	rng := c.DefaultQuery("range", "7d")
	var span time.Duration
	unit := "day"
	switch rng {
	case "24h":
		span, unit = 24*time.Hour, "hour"
	case "30d":
		span = 30 * 24 * time.Hour
	default:
		rng, span = "7d", 7*24*time.Hour
	}
	end := time.Now()
	start := end.Add(-span)
	ctx := c.Request.Context()

	// ① 引擎排行(metrics type=event 已是降序)。limit 50 覆盖全部已知引擎 key(21 个)。
	engineRows, err := h.crawler.Metrics(ctx, start, end, "event", 50)
	if err != nil {
		utils.InternalError(c, 6005, "umami crawler metrics failed", err)
		return
	}
	engines := make([]crawlerEngineCount, 0, len(engineRows))
	for _, r := range engineRows {
		engines = append(engines, crawlerEngineCount{Engine: r.X, Count: r.Y})
	}

	// ② 时间序列:events/series 按(事件名 × 桶)返回,聚合成总量并把空桶补零 ——
	// 爬虫在夜间可能整小时无命中,不补零折线会把安静时段直接吞掉。
	seriesRows, err := h.crawler.EventsSeries(ctx, start, end, unit)
	if err != nil {
		utils.InternalError(c, 6006, "umami crawler series failed", err)
		return
	}
	series := buildCrawlerSeries(seriesRows, start, end, unit)

	// ③ top pages:直查 umami 库。失败降级为空 + WARN(schema 耦合风险不拖垮整个面板)。
	topPages, err := h.crawlerTopPages(ctx, start, end, 30)
	if err != nil {
		slog.Warn("umami crawler top_pages query failed (degraded to empty)", "err", err)
		topPages = []crawlerPageCount{}
	}

	payload := gin.H{
		"configured": true,
		"range":      rng,
		"unit":       unit,
		"engines":    engines,
		"series":     series,
		"top_pages":  topPages,
		"start":      start.Format(time.RFC3339),
		"end":        end.Format(time.RFC3339),
	}

	// ④ 状态码提示:429(会被 Google 记成站点限流、压低抓取配额)与 5xx。
	// 拿不到就整个省略(契约允许),不阻塞主体数据。
	if hint := h.crawlerStatusHint(ctx, start, end); hint != nil {
		payload["status_hint"] = hint
	}

	utils.Success(c, payload)
}

// buildCrawlerSeries 把 events/series 的(事件名 × 桶)行聚合成总量时序,并按
// unit 步长从 start 走到 end 补零桶。umami 返回的 t 是请求 timezone(= 容器
// time.Local,见 platformTZName)下的 "YYYY-MM-DD HH:00:00",这里统一裁剪:
// hour → 前 16 字符("2006-01-02 15:04"),day → 前 10 字符("2006-01-02")。
func buildCrawlerSeries(rows []EventSeriesRow, start, end time.Time, unit string) []crawlerSeriesPoint {
	keyLen, layout := 10, "2006-01-02"
	if unit == "hour" {
		keyLen, layout = 16, "2006-01-02 15:04"
	}
	agg := make(map[string]uint64, len(rows))
	for _, r := range rows {
		k := r.T
		if len(k) > keyLen {
			k = k[:keyLen]
		}
		agg[k] += r.Y
	}

	loc := time.Local
	cur := start.In(loc)
	if unit == "hour" {
		cur = time.Date(cur.Year(), cur.Month(), cur.Day(), cur.Hour(), 0, 0, 0, loc)
	} else {
		cur = time.Date(cur.Year(), cur.Month(), cur.Day(), 0, 0, 0, 0, loc)
	}
	out := make([]crawlerSeriesPoint, 0, 32)
	for !cur.After(end) {
		k := cur.Format(layout)
		out = append(out, crawlerSeriesPoint{T: k, Count: agg[k]})
		delete(agg, k)
		if unit == "hour" {
			cur = cur.Add(time.Hour)
		} else {
			cur = cur.AddDate(0, 0, 1)
		}
	}
	// 兜底:umami 返了窗口外/未对齐的桶(时钟漂移等)也别丢数据,按 key 排序补在后面。
	if len(agg) > 0 {
		rest := make([]string, 0, len(agg))
		for k := range agg {
			rest = append(rest, k)
		}
		sort.Strings(rest)
		for _, k := range rest {
			out = append(out, crawlerSeriesPoint{T: k, Count: agg[k]})
		}
		sort.Slice(out, func(i, j int) bool { return out[i].T < out[j].T })
	}
	return out
}

// crawlerTopPages 被抓路径 Top N —— 直查 umami 库的唯一原因:umami 2.20 的
// HTTP API 对自定义事件做不了 URL 维度聚合(实测 /metrics?type=url 带不带
// event 过滤都恒空,insights 报告同样只看 pageview)。
//
// 依赖两个既有事实(都在本仓库口径内,不是新增假设):
//   - umami 与业务库同一个 MySQL 实例,scholar_user 拥有 umami.* 权限
//     (scripts/run-migrations.sh 幂等 GRANT,umami 容器本身就用这个账号连库);
//   - website_event 表结构(website_id/event_type/created_at/url_path)自 umami 2.x
//     起稳定。镜像升级若破坏此查询,这里只影响 top_pages 一栏(上层已降级)。
func (h *Handler) crawlerTopPages(ctx context.Context, start, end time.Time, limit int) ([]crawlerPageCount, error) {
	if h.crawlerDB == nil {
		return []crawlerPageCount{}, nil
	}
	websiteID, err := h.crawler.EnsureWebsiteID(ctx)
	if err != nil {
		return nil, err
	}
	var rows []struct {
		URLPath string
		Cnt     uint64
	}
	// event_type=2 = 自定义事件(爬虫命中);DSN loc=Local,time.Time 直接可比。
	err = h.crawlerDB.WithContext(ctx).Raw(
		`SELECT url_path, COUNT(*) AS cnt
		   FROM umami.website_event
		  WHERE website_id = ? AND event_type = 2 AND created_at >= ? AND created_at < ?
		  GROUP BY url_path
		  ORDER BY cnt DESC
		  LIMIT ?`,
		websiteID, start, end, limit,
	).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]crawlerPageCount, 0, len(rows))
	for _, r := range rows {
		out = append(out, crawlerPageCount{URL: r.URLPath, Count: r.Cnt})
	}
	return out, nil
}

// crawlerStatusHint 从 event-data/fields 的 data.status 取值分布聚出
// {"429": n, "5xx": n}。查询失败返回 nil(上层省略该字段)。
func (h *Handler) crawlerStatusHint(ctx context.Context, start, end time.Time) gin.H {
	fields, err := h.crawler.EventDataFields(ctx, start, end)
	if err != nil {
		slog.Warn("umami crawler status hint failed (omitted)", "err", err)
		return nil
	}
	var n429, n5xx uint64
	for _, f := range fields {
		if f.PropertyName != "status" {
			continue
		}
		code, err := strconv.Atoi(f.Value)
		if err != nil {
			continue
		}
		switch {
		case code == 429:
			n429 += f.Total
		case code >= 500:
			n5xx += f.Total
		}
	}
	return gin.H{"429": n429, "5xx": n5xx}
}
