// ============================================================================
// Scholay学术 V1.0
// IndexNow 协议客户端
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

// IndexNow 公共端点。测试通过 submitIndexNowWithClient 注入 httptest
// client，绝不会命中这个真实端点。
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
				Max:         2,
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

var (
	// errIndexNowConfig marks errors that must be rejected before a request is
	// sent: malformed key/base URL, cross-host URL, query/fragment, etc.
	errIndexNowConfig = errors.New("indexnow: config invalid")

	// errIndexNowOwnership identifies the diagnostic 403 returned when the
	// search engine cannot validate /{key}.txt.  It also wraps upstream.ErrAuth.
	errIndexNowOwnership = errors.New("indexnow: site ownership verification failed")

	// IndexNow only documents 200 and 202 as success.  A different 2xx is not
	// silently accepted; the worker retains the URLs and retries later.
	errIndexNowUnexpectedStatus = errors.New("indexnow: unexpected success status")
)

type indexNowPayload struct {
	Host        string   `json:"host"`
	Key         string   `json:"key"`
	KeyLocation string   `json:"keyLocation"`
	URLList     []string `json:"urlList"`
}

// SubmitIndexNow submits a batch using siteOrigin as the already-selected
// CanonicalBaseURL.  Every field is derived from the same validated www origin;
// a single non-canonical URL rejects the whole batch before network I/O.
func SubmitIndexNow(ctx context.Context, key, siteOrigin string, urls []string) error {
	site, err := parseCanonicalSite(siteOrigin)
	if err != nil {
		return err
	}
	return submitIndexNowWithClient(ctx, indexNow(), key, site, urls)
}

func submitIndexNowWithClient(ctx context.Context, client *upstream.Client, key string, site canonicalSite, urls []string) error {
	if !isValidIndexNowKey(key) {
		return fmt.Errorf("%w: key must be 8-128 letters, digits, or hyphens", errIndexNowConfig)
	}
	if len(urls) == 0 {
		return nil
	}
	canonicalURLs, err := site.canonicalURLs(urls)
	if err != nil {
		return err
	}
	if len(canonicalURLs) == 0 {
		return nil
	}
	if client == nil {
		return fmt.Errorf("%w: HTTP client is nil", errIndexNowConfig)
	}

	payload := indexNowPayload{
		Host:        site.host,
		Key:         key,
		KeyLocation: site.origin + "/" + key + ".txt",
		URLList:     canonicalURLs,
	}
	resp, err := client.Do(ctx, upstream.Request{
		Method: http.MethodPost,
		Path:   "",
		Headers: http.Header{
			"User-Agent": []string{"ScholayIndexNowClient/1.0"},
		},
		BodyJSON: payload,
	})
	if err != nil {
		return classifyIndexNowError(err, site)
	}
	if resp == nil || (resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted) {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		return fmt.Errorf("%w: got %d; only 200/202 are accepted", errIndexNowUnexpectedStatus, status)
	}

	slog.Info("indexnow submit ok", "count", len(canonicalURLs), "status", resp.StatusCode, "canonical_host", site.host)
	return nil
}

func classifyIndexNowError(err error, site canonicalSite) error {
	switch {
	case errors.Is(err, upstream.ErrAuth):
		var ue *upstream.Error
		if errors.As(err, &ue) && ue.Status == http.StatusForbidden {
			reason := "403 ownership check rejected"
			if strings.Contains(strings.ToLower(ue.Body), "userforbiddedtoaccesssite") {
				reason = "403 UserForbiddedToAccessSite"
			}
			return fmt.Errorf("%w: %s; canonical_host=%s key_location_origin=%s; verify public GET /<INDEXNOW_KEY>.txt returns the exact key: %w",
				errIndexNowOwnership, reason, site.host, site.origin, err)
		}
		return fmt.Errorf("indexnow: authorization rejected for canonical_host=%s: %w", site.host, err)
	case errors.Is(err, upstream.ErrBadRequest):
		return fmt.Errorf("indexnow: protocol rejected canonical host/url/key payload: %w", err)
	case errors.Is(err, upstream.ErrRateLimit):
		return fmt.Errorf("indexnow: rate limited after bounded upstream retries: %w", err)
	default:
		return fmt.Errorf("indexnow: %w", err)
	}
}

// extractHost and matchesHost are retained for the Baidu sink.  They compare
// hostnames rather than raw Host so an explicit port cannot accidentally pass.
func extractHost(origin string) (string, error) {
	u, err := url.Parse(origin)
	if err != nil {
		return "", err
	}
	if u.Hostname() == "" || u.Port() != "" {
		return "", fmt.Errorf("no canonical host")
	}
	return strings.ToLower(u.Hostname()), nil
}

func matchesHost(rawURL, host string) bool {
	u, err := url.Parse(rawURL)
	if err != nil || u.Port() != "" {
		return false
	}
	return strings.EqualFold(u.Hostname(), host)
}
