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
// ============================================================================

package seosubmit

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"scholar-backend/internal/common/cache"
)

const (
	baiduPushEndpoint = "http://data.zz.baidu.com/urls"
	baiduDailyKeyFmt  = "seo:push:baidu:daily:%s" // %s = YYYYMMDD
	baiduDailyKeyTTL  = 30 * time.Hour            // 留余量保险

	baiduPushTimeout = 10 * time.Second
)

var baiduHTTPClient = &http.Client{Timeout: baiduPushTimeout}

// baiduResp 百度成功响应:
//   { "remain": 4999998, "success": 2 }
// 失败响应字段不同,这里用 map 解析后看 error/message 字段。
type baiduResp struct {
	Remain        int      `json:"remain"`
	Success       int      `json:"success"`
	NotSameSite   []string `json:"not_same_site"`
	NotValid      []string `json:"not_valid"`
	Error         int      `json:"error"`
	Message       string   `json:"message"`
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

	endpoint := fmt.Sprintf("%s?site=%s&token=%s", baiduPushEndpoint, site, token)
	body := strings.Join(filtered, "\n")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader([]byte(body)))
	if err != nil {
		return 0, fmt.Errorf("baidu: build request: %w", err)
	}
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("User-Agent", "ScholayBaiduPushClient/1.0")

	resp, err := baiduHTTPClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("baidu: do request: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("baidu: status %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed baiduResp
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return 0, fmt.Errorf("baidu: parse response %q: %w", string(respBody), err)
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
	rdb := cache.GetRedis()
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
