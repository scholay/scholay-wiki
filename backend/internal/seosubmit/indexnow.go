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
// ============================================================================

package seosubmit

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// IndexNow 公共端点。任何接入 IndexNow 协议的搜索引擎都能从这里收到推送,
// 选择 api.indexnow.org 作为统一聚合入口(Microsoft 维护)。
const indexNowEndpoint = "https://api.indexnow.org/indexnow"

// indexNowHTTPClient 共享 HTTP 客户端,避免每次新建 transport
var indexNowHTTPClient = &http.Client{
	Timeout: 15 * time.Second,
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
// 失败原因 + 错误码 走结构化日志,便于线上诊断。
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
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("indexnow: marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, indexNowEndpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("indexnow: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("User-Agent", "ScholayIndexNowClient/1.0")

	resp, err := indexNowHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("indexnow: do request: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	switch {
	case resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusAccepted:
		slog.Info("indexnow submit ok", "count", len(filtered), "status", resp.StatusCode)
		return nil
	case resp.StatusCode == http.StatusUnprocessableEntity:
		// 422: 通常是 host/key 不匹配,业务级配置问题。不重试。
		return fmt.Errorf("indexnow: 422 unprocessable (key/host mismatch): %s", string(respBody))
	case resp.StatusCode == http.StatusForbidden:
		// 403: key file 验证失败。不重试。
		return fmt.Errorf("indexnow: 403 forbidden (key file 校验失败): %s", string(respBody))
	case resp.StatusCode == http.StatusTooManyRequests:
		// 429: 限流。worker 把 URL 放回队列,稍后重试。
		return fmt.Errorf("indexnow: 429 rate limited: %s", string(respBody))
	default:
		return fmt.Errorf("indexnow: status %d: %s", resp.StatusCode, string(respBody))
	}
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
