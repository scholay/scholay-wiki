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
//   - Redis 计数器做软限:host 过滤【之后】才预扣;提交失败/被拒部分【返还】;
//     超配额的尾部由调用方(service.processBaidu)放回百度队列,次日 worker 真的能拿到
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

// errBaiduAPIReject 百度以 HTTP 200 + 业务错误码拒绝(token 失效/站点未验证等)。
// 结构性失败:每 5 分钟重试只会原样再错一次,调用方应装冷却而非紧密重试。
var errBaiduAPIReject = errors.New("baidu: api rejected")

// BaiduSubmitOutcome SubmitBaidu 的结构化结果。
type BaiduSubmitOutcome struct {
	Submitted int      // 百度确认收下的条数
	Unsent    []string // 配额不足未发送、或整批失败需调用方放回队列重试的 URL
	Rejected  []string // 百度在 200 应答里明确拒收的 URL(not_valid/not_same_site):结构性,调用方落死信
}

// SubmitBaidu 推一批 URL 到百度普通收录 API。
//   site:  已在站长平台验证的站点,形如 "www.scholay.com" (不带 scheme)
//   token: 站长平台获取的 token
//   urls:  完整 URL 列表(必须与 site 同 host,百度会校验)
//   quota: 每天最多推送的 URL 数(软限,超过部分进 Outcome.Unsent 返还给调用方)
//
// 错误时 Outcome.Unsent = 全部可重试 URL(已发送部分的配额已返还);
// token/站点级业务错误会 wrap errBaiduAPIReject,调用方据此装冷却。
//
// 配额语义(2026-08-10 修正):host 过滤【之后】才预扣(被过滤掉的不消耗配额);
// 网络/接口失败、百度拒收(not_valid/not_same_site)的部分【返还】配额 ——
// 旧实现先扣后滤、失败不返还,配额会被无效请求白白烧掉。
func SubmitBaidu(ctx context.Context, site, token string, urls []string, quota int) (BaiduSubmitOutcome, error) {
	var out BaiduSubmitOutcome
	if token == "" || site == "" {
		return out, fmt.Errorf("%w: missing site/token", errBaiduAPIReject)
	}
	if len(urls) == 0 {
		return out, nil
	}

	// 过滤 host 不匹配的 URL(百度会把整批拒掉)。被过滤的属结构性错误,
	// 进 Rejected 落死信(回队也永远推不上去)。
	filtered := make([]string, 0, len(urls))
	for _, u := range urls {
		if matchesHost(u, site) {
			filtered = append(filtered, u)
		} else {
			out.Rejected = append(out.Rejected, u)
		}
	}
	if len(out.Rejected) > 0 {
		slog.Warn("baidu dropped host-mismatched URLs before submit", "dropped", len(out.Rejected), "site", site)
	}
	if len(filtered) == 0 {
		return out, nil
	}

	// 配额 key 在预扣时定死并贯穿返还:跨午夜的「预扣 A 日 / 返还 B 日」会把
	// 次日 key 减成无 TTL 的负数计数器(永不过期 + 次日实际可超额)。
	quotaKey := baiduDailyKey()
	allow, reserved, err := reserveBaiduQuota(ctx, quotaKey, len(filtered), quota)
	if err != nil {
		// Redis 异常时偷偷推,大不了被百度自己 4xx;不能因此停推
		slog.Warn("baidu quota check failed, proceeding without quota guard", "err", err)
		allow, reserved = len(filtered), false
	}
	if allow <= 0 {
		slog.Info("baidu daily quota exhausted, deferring batch", "wanted", len(filtered), "quota", quota)
		out.Unsent = filtered
		return out, nil
	}
	if allow > len(filtered) {
		allow = len(filtered)
	}
	send, deferred := filtered[:allow], filtered[allow:]
	out.Unsent = deferred

	resp, err := baidu().Do(ctx, upstream.Request{
		Method: http.MethodPost,
		Path:   "", // baseURL 已经是完整 endpoint
		Query:  url.Values{"site": []string{site}, "token": []string{token}},
		Headers: http.Header{
			"Content-Type": []string{"text/plain"},
			"User-Agent":   []string{"ScholayBaiduPushClient/1.0"},
		},
		Body: bytes.NewReader([]byte(strings.Join(send, "\n"))),
	})
	if err != nil {
		if reserved {
			releaseBaiduQuota(ctx, quotaKey, allow)
		}
		out.Unsent = filtered
		// upstream.Error 已经带 status/body/kind, 这里直接 wrap 透传
		return out, fmt.Errorf("baidu: %w", err)
	}

	var parsed baiduResp
	if err := json.Unmarshal(resp.Body, &parsed); err != nil {
		if reserved {
			releaseBaiduQuota(ctx, quotaKey, allow)
		}
		out.Unsent = filtered
		return out, fmt.Errorf("baidu: parse response %q: %w", string(resp.Body), err)
	}
	if parsed.Error != 0 {
		if reserved {
			releaseBaiduQuota(ctx, quotaKey, allow)
		}
		out.Unsent = filtered
		return out, fmt.Errorf("%w: api error %d: %s", errBaiduAPIReject, parsed.Error, parsed.Message)
	}

	// 200 应答里被点名拒收的 URL:结构性失败,交调用方落死信(可枚举、可诊断),
	// 不再只打 count 日志后静默蒸发。
	if len(parsed.NotSameSite) > 0 {
		slog.Warn("baidu rejected not_same_site URLs", "count", len(parsed.NotSameSite))
		out.Rejected = append(out.Rejected, parsed.NotSameSite...)
	}
	if len(parsed.NotValid) > 0 {
		slog.Warn("baidu rejected not_valid URLs", "count", len(parsed.NotValid))
		out.Rejected = append(out.Rejected, parsed.NotValid...)
	}
	// 百度只确认收下 Success 条;被拒的(not_valid 等)返还配额 —— 它们没换来收录
	if reserved && parsed.Success >= 0 && allow > parsed.Success {
		releaseBaiduQuota(ctx, quotaKey, allow-parsed.Success)
	}
	slog.Info("baidu submit ok",
		"submitted", parsed.Success,
		"remain_today", parsed.Remain,
		"sent", len(send),
		"deferred", len(deferred),
		"rejected", len(out.Rejected),
	)
	out.Submitted = parsed.Success
	return out, nil
}

func baiduDailyKey() string {
	return fmt.Sprintf(baiduDailyKeyFmt, time.Now().Format("20060102"))
}

// reserveBaiduQuota 原子扣减 key 对应的当日配额,返回还能推多少条(<=wantN)与是否
// 真的发生了预扣(reserved=false 表示无 Redis/不限额,失败路径无需返还)。
// 实现:INCRBY want → 若超过 quota,扣回多余部分。
func reserveBaiduQuota(ctx context.Context, key string, wantN, quota int) (int, bool, error) {
	if quota <= 0 {
		return wantN, false, nil // 配额配 0/负值 视为不限
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return wantN, false, nil
	}
	cctx, cancel := context.WithTimeout(ctx, 1*time.Second)
	defer cancel()

	used, err := rdb.IncrBy(cctx, key, int64(wantN)).Result()
	if err != nil {
		return 0, false, err
	}
	// 第一次增长后设过期,避免无限驻留
	if used == int64(wantN) {
		_ = rdb.Expire(cctx, key, baiduDailyKeyTTL).Err()
	}
	if used <= int64(quota) {
		return wantN, true, nil
	}
	// 超额了,部分回滚
	overflow := used - int64(quota)
	_, _ = rdb.DecrBy(cctx, key, overflow).Result()
	allow := int64(wantN) - overflow
	if allow < 0 {
		allow = 0
	}
	return int(allow), allow > 0, nil
}

// releaseBaiduQuota 返还预扣但未兑现为收录的配额(提交失败/百度拒收部分)。
// key 必须与预扣时同一个(见 SubmitBaidu 内注释)。
func releaseBaiduQuota(ctx context.Context, key string, n int) {
	if n <= 0 {
		return
	}
	rdb := cache.GetRedisPersist()
	if rdb == nil {
		return
	}
	cctx, cancel := context.WithTimeout(ctx, 1*time.Second)
	defer cancel()
	if _, err := rdb.DecrBy(cctx, key, int64(n)).Result(); err != nil {
		slog.Warn("baidu quota release failed", "count", n, "err", err)
	}
}
