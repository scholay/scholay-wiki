// ============================================================================
// Scholay学术 V1.0
// 百度普通收录 —— 主动推送 API
//
// 官方文档:https://ziyuan.baidu.com/linksubmit/index
// 调用形式:
//   POST http://data.zz.baidu.com/urls?site={site}&token={token}
//   Body: 每行一条 URL,纯文本,Content-Type: text/plain
//
// 配额:
//   - 每天有上限(根据站点权重 50~1000 不等)
//   - 我们用 Redis 计数器 SETEX 24h 软限,超过 quota 静默跳过本批,留给次日 worker
//
// 上游调用走 common/upstream — 统一观测 / 错误分类 / breaker 防雪崩。
// ============================================================================

package seosubmit

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/common/cache"
	"scholar-backend/internal/common/upstream"
)

const (
	baiduPushEndpoint = "http://data.zz.baidu.com/urls"
	baiduDailyKeyFmt  = "seo:push:baidu:daily:%s" // %s = YYYYMMDD
	baiduDailyKeyTTL  = 30 * time.Hour            // 留余量保险

	baiduPushTimeout = 10 * time.Second
)

// 全局单例 upstream.Client — 进程内长期持有, 复用共享 httpclient 连接池 + breaker。
// 不重试: 百度配额接口幂等性不可靠 (重试可能多次扣 quota), 失败留给次日 worker。
var (
	baiduOnce   sync.Once
	baiduClient *upstream.Client
)

func baidu() *upstream.Client {
	baiduOnce.Do(func() {
		// 单独构造一个 10s 超时 client; 不复用 httpclient.Default 因为它是 5min 超时,
		// 百度接口正常 1s 内回, 10s 失败就视为挂了。
		hc := &http.Client{Timeout: baiduPushTimeout}
		baiduClient = upstream.New("baidu_push").
			BaseURL(baiduPushEndpoint).
			HTTPClient(hc).
			Breaker(upstream.BreakerConfig{
				MaxRequests:  2,
				MinRequests:  3,
				FailureRatio: 0.6,
				Timeout:      60 * time.Second,
			}).
			MustBuild()
	})
	return baiduClient
}

// baiduResp 百度成功响应:
//   { "remain": 4999998, "success": 2 }
// 失败响应字段不同,这里用 map 解析后看 error/message 字段。
type baiduResp struct {
	Remain      int      `json:"remain"`
	Success     int      `json:"success"`
	NotSameSite []string `json:"not_same_site"`
	NotValid    []string `json:"not_valid"`
	Error       int      `json:"error"`
	Message     string   `json:"message"`
}

// SubmitBaidu 推一批 URL 到百度普通收录 API。
//   site:  已在站长平台验证的站点,形如 "www.scholay.com" (不带 scheme)
//   token: 站长平台获取的 token
//   urls:  完整 URL 列表(必须与 site 同 host,百度会校验)
//   quota: 每天最多推送的 URL 数(软限,超过即跳过本批避免无效请求)
//
// 返回:
//   submitted = 实际推上去的条数(可能 = quota 剩余而 < 入参 len)
//   error     = 网络/接口错误,业务错误日志记下不返回
func SubmitBaidu(ctx context.Context, site, token string, urls []string, quota int) (int, error) {
	if token == "" || site == "" {
		return 0, errors.New("baidu: missing site/token")
	}
	if len(urls) == 0 {
		return 0, nil
	}

	// 配额检查:用 Redis INCRBY 原子扣减
	allow, err := reserveBaiduQuota(ctx, len(urls), quota)
	if err != nil {
		// Redis 异常时偷偷推,大不了被百度自己 4xx;不能因此停推
		slog.Warn("baidu quota check failed, proceeding without quota guard", "err", err)
		allow = len(urls)
	}
	if allow <= 0 {
		slog.Info("baidu daily quota exhausted, skipping batch", "wanted", len(urls), "quota", quota)
		return 0, nil
	}
	if allow > len(urls) {
		allow = len(urls)
	}
	urls = urls[:allow]

	// 过滤 host 不匹配的 URL,百度会把整批拒掉
	filtered := make([]string, 0, len(urls))
	for _, u := range urls {
		if matchesHost(u, site) {
			filtered = append(filtered, u)
		}
	}
	if len(filtered) == 0 {
		return 0, nil
	}

	resp, err := baidu().Do(ctx, upstream.Request{
		Method: http.MethodPost,
		Path:   "", // baseURL 已经是完整 endpoint
		Query:  url.Values{"site": []string{site}, "token": []string{token}},
		Headers: http.Header{
			"Content-Type": []string{"text/plain"},
			"User-Agent":   []string{"ScholayBaiduPushClient/1.0"},
		},
		Body: bytes.NewReader([]byte(strings.Join(filtered, "\n"))),
	})
	if err != nil {
		// upstream.Error 已经带 status/body/kind, 这里直接 wrap 透传
		return 0, fmt.Errorf("baidu: %w", err)
	}

	var parsed baiduResp
	if err := json.Unmarshal(resp.Body, &parsed); err != nil {
		return 0, fmt.Errorf("baidu: parse response %q: %w", string(resp.Body), err)
	}
	if parsed.Error != 0 {
		return 0, fmt.Errorf("baidu: api error %d: %s", parsed.Error, parsed.Message)
	}

	if len(parsed.NotSameSite) > 0 {
		slog.Warn("baidu rejected not_same_site URLs", "count", len(parsed.NotSameSite))
	}
	if len(parsed.NotValid) > 0 {
		slog.Warn("baidu rejected not_valid URLs", "count", len(parsed.NotValid))
	}
	slog.Info("baidu submit ok",
		"submitted", parsed.Success,
		"remain_today", parsed.Remain,
		"sent", len(filtered),
	)
	return parsed.Success, nil
}

// reserveBaiduQuota 原子扣减今日配额,返回还能推多少条(<=wantN)。
// 实现:INCRBY want → 若超过 quota,扣回多余部分;用 EXPIRE 设到第二天 0 点。
func reserveBaiduQuota(ctx context.Context, wantN, quota int) (int, error) {
	if quota <= 0 {
		return wantN, nil // 配额配 0/负值 视为不限
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return wantN, nil
	}
	cctx, cancel := context.WithTimeout(ctx, 1*time.Second)
	defer cancel()

	key := fmt.Sprintf(baiduDailyKeyFmt, time.Now().Format("20060102"))
	used, err := rdb.IncrBy(cctx, key, int64(wantN)).Result()
	if err != nil {
		return 0, err
	}
	// 第一次增长后设过期,避免无限驻留
	if used == int64(wantN) {
		_ = rdb.Expire(cctx, key, baiduDailyKeyTTL).Err()
	}
	if used <= int64(quota) {
		return wantN, nil
	}
	// 超额了,部分回滚
	overflow := used - int64(quota)
	_, _ = rdb.DecrBy(cctx, key, overflow).Result()
	allow := int64(wantN) - overflow
	if allow < 0 {
		allow = 0
	}
	return int(allow), nil
}
