package seosubmit

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"

	"scholar-backend/internal/common/upstream"
)

const testIndexNowKey = "test-key-12345678"

func testCanonicalSite(t *testing.T) canonicalSite {
	t.Helper()
	site, err := parseCanonicalSite("https://www.scholay.com")
	if err != nil {
		t.Fatalf("parse canonical site: %v", err)
	}
	return site
}

func testUpstreamClient(t *testing.T, server *httptest.Server) *upstream.Client {
	t.Helper()
	client, err := upstream.New("indexnow_test").
		BaseURL(server.URL).
		HTTPClient(server.Client()).
		Build()
	if err != nil {
		t.Fatalf("build upstream client: %v", err)
	}
	return client
}

func TestSubmitIndexNowPayloadUsesOneCanonicalWWWOrigin(t *testing.T) {
	var got indexNowPayload
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("Content-Type = %q", r.Header.Get("Content-Type"))
		}
		if r.Header.Get("User-Agent") != "ScholayIndexNowClient/1.0" {
			t.Errorf("User-Agent = %q", r.Header.Get("User-Agent"))
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Errorf("decode payload: %v", err)
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	wantURLs := []string{
		"https://www.scholay.com/paper/openalex/W123",
		"https://www.scholay.com/author/openalex/A456",
	}
	err := submitIndexNowWithClient(context.Background(), testUpstreamClient(t, server), testIndexNowKey, testCanonicalSite(t), wantURLs)
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if got.Host != "www.scholay.com" {
		t.Errorf("host = %q", got.Host)
	}
	if got.Key != testIndexNowKey {
		t.Errorf("key = %q", got.Key)
	}
	if got.KeyLocation != "https://www.scholay.com/"+testIndexNowKey+".txt" {
		t.Errorf("keyLocation = %q", got.KeyLocation)
	}
	if !reflect.DeepEqual(got.URLList, wantURLs) {
		t.Errorf("urlList = %#v, want %#v", got.URLList, wantURLs)
	}
}

func TestSubmitIndexNowRejectsNonCanonicalBatchBeforePOST(t *testing.T) {
	var calls atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()
	client := testUpstreamClient(t, server)
	site := testCanonicalSite(t)

	tests := []struct {
		name string
		url  string
	}{
		{name: "apex host", url: "https://scholay.com/paper/1"},
		{name: "foreign host", url: "https://example.com/paper/1"},
		{name: "http", url: "http://www.scholay.com/paper/1"},
		{name: "query", url: "https://www.scholay.com/paper/1?utm_source=x"},
		{name: "fragment", url: "https://www.scholay.com/paper/1#abstract"},
		{name: "explicit port", url: "https://www.scholay.com:443/paper/1"},
		{name: "dot segment", url: "https://www.scholay.com/paper/../author/1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := submitIndexNowWithClient(context.Background(), client, testIndexNowKey, site, []string{
				"https://www.scholay.com/ok",
				tt.url,
			})
			if !errors.Is(err, errIndexNowConfig) {
				t.Fatalf("error = %v, want errIndexNowConfig", err)
			}
		})
	}
	if got := calls.Load(); got != 0 {
		t.Fatalf("non-canonical batches made %d POST requests", got)
	}
}

func TestSubmitIndexNowStatusSemantics(t *testing.T) {
	tests := []struct {
		name        string
		status      int
		body        string
		wantErr     error
		wantText    string
		wantSuccess bool
	}{
		{name: "200", status: http.StatusOK, wantSuccess: true},
		{name: "202", status: http.StatusAccepted, wantSuccess: true},
		{name: "204 is not protocol success", status: http.StatusNoContent, wantErr: errIndexNowUnexpectedStatus},
		{name: "403 ownership", status: http.StatusForbidden, body: `{"code":"UserForbiddedToAccessSite"}`, wantErr: errIndexNowOwnership, wantText: "403 UserForbiddedToAccessSite"},
		{name: "429", status: http.StatusTooManyRequests, body: "slow down", wantErr: upstream.ErrRateLimit},
		{name: "500", status: http.StatusInternalServerError, body: "temporary", wantErr: upstream.ErrServer},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tt.status)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer server.Close()

			err := submitIndexNowWithClient(context.Background(), testUpstreamClient(t, server), testIndexNowKey, testCanonicalSite(t), []string{"https://www.scholay.com/paper/1"})
			if tt.wantSuccess {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("error = %v, want errors.Is(%v)", err, tt.wantErr)
			}
			if tt.wantText != "" && !strings.Contains(err.Error(), tt.wantText) {
				t.Fatalf("error %q does not contain %q", err, tt.wantText)
			}
			if tt.status == http.StatusForbidden && !errors.Is(err, upstream.ErrAuth) {
				t.Fatalf("403 must retain upstream.ErrAuth: %v", err)
			}
			if tt.status == http.StatusForbidden && (!strings.Contains(err.Error(), "canonical_host=www.scholay.com") || !strings.Contains(err.Error(), "key_location_origin=https://www.scholay.com")) {
				t.Fatalf("403 diagnostic lacks canonical host/keyLocation guidance: %v", err)
			}
		})
	}
}

func TestNewServiceRejectsNonWWWCanonicalOriginAtStartup(t *testing.T) {
	cfg := testSEOConfig()
	for _, origin := range []string{
		"https://scholay.com",
		"http://www.scholay.com",
		"https://www.scholay.com/",
		"https://WWW.scholay.com",
		"https://www.scholay.com:443",
	} {
		svc := NewService(cfg, origin)
		if svc.Enabled() {
			t.Errorf("origin %q unexpectedly enabled", origin)
		}
		if !errors.Is(svc.canonicalErr, errIndexNowConfig) {
			t.Errorf("origin %q error = %v", origin, svc.canonicalErr)
		}
	}
}

func TestNewServiceRejectsInvalidIndexNowKeyAtStartup(t *testing.T) {
	cfg := testSEOConfig()
	cfg.IndexNowKey = "short"
	svc := NewService(cfg, "https://www.scholay.com")
	if svc.Enabled() || svc.indexNowReady() {
		t.Fatal("service with invalid INDEXNOW_KEY unexpectedly enabled")
	}
	if !errors.Is(svc.indexNowConfigErr, errIndexNowConfig) {
		t.Fatalf("validation error = %v", svc.indexNowConfigErr)
	}
	if got := svc.IndexNowKey(); got != "" {
		t.Fatalf("invalid key exposed by key-file handler: %q", got)
	}
}
