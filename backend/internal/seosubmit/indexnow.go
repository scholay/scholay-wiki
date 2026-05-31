// ============================================================================
// Scholay学术 V1.0
// IndexNow 协议客户端
//
// 协议:https://www.indexnow.org/documentation
// 一次推送 → Bing / Yandex / Naver / Seznam.cz / Yep 等同时收录(它们后端共享数据)。
//
// 协议要点:
//   1. 主机站点根目录必须能用 HTTP 200 响应 GET /{key}.txt,内容就是 key 字符串本身。
//      这是搜索引擎反向校验"你确实拥有这个域"的方式。
//   2. POST application/json,body 含 host / key / keyLocation / urlList。
//      返回 200/202 算成功;400 是 key 不匹配;429 是限流;其它 5xx 当临时失败。
//   3. 单次最多 10000 条 URL。我们走 batchSize(默认 100)远低于上限,无需切片。
//
// 上游调用走 common/upstream — 统一观测 / 错误分类 / breaker 防雪崩。
// 4xx (host/key 配置错误) 不重试; 429 / 5xx 由 upstream.Retry 自动处理。
// ============================================================================

package seosubmit

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"scholar-backend/internal/common/upstream"
)

// IndexNow 公共端点。任何接入 IndexNow 协议的搜索引擎都能从这里收到推送,
// 选择 api.indexnow.org 作为统一聚合入口(Microsoft 维护)。
const indexNowEndpoint = "https://api.indexnow.org/indexnow"

var (
	indexNowOnce   sync.Once
	indexNowClient *upstream.Client
)

func indexNow() *upstream.Client {
	indexNowOnce.Do(func() {
		hc := &http.Client{Timeout: 15 * time.Second}
		indexNowClient = upstream.New("indexnow").
			BaseURL(indexNowEndpoint).
			HTTPClient(hc).
			Retry(upstream.RetryConfig{
				Max:         2, // 429 / 5xx 自动重试 2 次
				BackoffBase: 500 * time.Millisecond,
				BackoffMax:  3 * time.Second,
			}).
			Breaker(upstream.BreakerConfig{
				MaxRequests:  2,
				MinRequests:  3,
				FailureRatio: 0.7,
				Timeout:      60 * time.Second,
			}).
			MustBuild()
	})
	return indexNowClient
}

// indexNowPayload 协议定义的请求体结构
type indexNowPayload struct {
	Host        string   `json:"host"`        // 站点 host,不带 scheme(如 www.scholay.com)
	Key         string   `json:"key"`         // 与 /{key}.txt 文件内容一致的字符串
	KeyLocation string   `json:"keyLocation"` // 完整 URL,搜索引擎按此获取并校验 key 文件
	URLList     []string `json:"urlList"`     // 要推送的 URL,全部 host 必须等于上面的 host
}

// SubmitIndexNow 把 URLs 推到 IndexNow 协议端点。
//   key:         INDEXNOW_KEY
//   siteOrigin:  https://www.scholay.com(用作 host 提取 + keyLocation 拼接)
// 失败原因 + 错误码 走结构化日志 (upstream 自动注入),便于线上诊断。
func SubmitIndexNow(ctx context.Context, key, siteOrigin string, urls []string) error {
	if key == "" {
		return fmt.Errorf("indexnow: empty key")
	}
	if len(urls) == 0 {
		return nil
	}
	host, err := extractHost(siteOrigin)
	if err != nil {
		return fmt.Errorf("indexnow: invalid site origin %q: %w", siteOrigin, err)
	}

	// 过滤 host 不一致的 URL —— 协议要求 urlList 里所有 URL 的 host 都等于 payload.host,
	// 否则整批被 422 拒收。SEO 写入路径里我们只 enqueue 自家 URL,这里再做一层防御。
	filtered := make([]string, 0, len(urls))
	for _, u := range urls {
		if matchesHost(u, host) {
			filtered = append(filtered, u)
		}
	}
	if len(filtered) == 0 {
		return nil
	}

	payload := indexNowPayload{
		Host:        host,
		Key:         key,
		KeyLocation: strings.TrimRight(siteOrigin, "/") + "/" + key + ".txt",
		URLList:     filtered,
	}

	resp, err := indexNow().Do(ctx, upstream.Request{
		Method: http.MethodPost,
		Path:   "", // baseURL 已经是完整 endpoint
		Headers: http.Header{
			"User-Agent": []string{"ScholayIndexNowClient/1.0"},
		},
		BodyJSON: payload,
	})
	if err != nil {
		// typed error → 用 errors.Is 区分业务对策
		switch {
		case errors.Is(err, upstream.ErrAuth):
			// 403 — key file 校验失败, 业务配置问题, 不重试
			return fmt.Errorf("indexnow: key file 校验失败 (403): %w", err)
		case errors.Is(err, upstream.ErrBadRequest):
			// 4xx — 通常是 host/key 不匹配, 业务配置问题
			return fmt.Errorf("indexnow: 协议拒绝 (host/key 不匹配): %w", err)
		case errors.Is(err, upstream.ErrRateLimit):
			// 429 — 自动重试已经耗尽, 让 worker 把 URL 放回队列稍后重试
			return fmt.Errorf("indexnow: 限流: %w", err)
		default:
			return fmt.Errorf("indexnow: %w", err)
		}
	}
	slog.Info("indexnow submit ok", "count", len(filtered), "status", resp.StatusCode)
	return nil
}

// extractHost 从 https://www.scholay.com 提出 www.scholay.com
func extractHost(origin string) (string, error) {
	u, err := url.Parse(origin)
	if err != nil {
		return "", err
	}
	if u.Host == "" {
		return "", fmt.Errorf("no host")
	}
	return u.Host, nil
}

// matchesHost 判断 URL 的 host 是否等于给定 host(忽略大小写)
func matchesHost(rawURL, host string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	return strings.EqualFold(u.Host, host)
}
