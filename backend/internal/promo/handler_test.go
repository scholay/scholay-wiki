package promo

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestDecodeImageDataURL(t *testing.T) {
	want := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}
	raw := "data:image/png;base64," + base64.StdEncoding.EncodeToString(want)
	mimeType, got, err := decodeImageDataURL(raw)
	if err != nil {
		t.Fatal(err)
	}
	if mimeType != "image/png" || string(got) != string(want) {
		t.Fatalf("decoded (%q, %x), want (image/png, %x)", mimeType, got, want)
	}
}

func TestDecodeImageDataURLRejectsNonImageAndMalformedPayload(t *testing.T) {
	for _, raw := range []string{
		"data:text/html;base64,PGgxPm5vPC9oMT4=",
		"data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+",
		"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
		"data:image/png;base64,PGh0bWw+bm90IGEgcG5nPC9odG1sPg==",
		"data:image/png;base64,not-base64",
		"https://example.com/qr.png",
	} {
		if _, _, err := decodeImageDataURL(raw); err == nil {
			t.Fatalf("decodeImageDataURL(%q) unexpectedly succeeded", raw)
		}
	}
}

func TestDecodeImageDataURLUsesDecodedThreeHundredKilobyteLimit(t *testing.T) {
	payload := make([]byte, qrMaxBytes)
	copy(payload, []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a})
	raw := "data:image/png;base64," + base64.StdEncoding.EncodeToString(payload)
	if len(raw) <= qrMaxBytes {
		t.Fatal("test payload must demonstrate base64 expansion")
	}
	if _, got, err := decodeImageDataURL(raw); err != nil || len(got) != qrMaxBytes {
		t.Fatalf("300KB decoded image rejected: len=%d err=%v", len(got), err)
	}

	payload = append(payload, 0)
	raw = "data:image/png;base64," + base64.StdEncoding.EncodeToString(payload)
	if _, _, err := decodeImageDataURL(raw); err == nil {
		t.Fatal("image larger than 300KB unexpectedly accepted")
	}
}

func TestPublicCacheSupportsConditionalRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	firstRecorder := httptest.NewRecorder()
	first, _ := gin.CreateTestContext(firstRecorder)
	first.Request = httptest.NewRequest(http.MethodGet, "/api/v1/config/promo/summary", nil)
	if setPublicCache(first, map[string]any{"enabled": true}, 60) {
		t.Fatal("first request must not be reported as not modified")
	}
	etag := firstRecorder.Header().Get("ETag")
	if etag == "" {
		t.Fatal("missing ETag")
	}
	if got := firstRecorder.Header().Get("Cache-Control"); got != "public, max-age=60, must-revalidate" {
		t.Fatalf("Cache-Control = %q", got)
	}

	secondRecorder := httptest.NewRecorder()
	second, _ := gin.CreateTestContext(secondRecorder)
	second.Request = httptest.NewRequest(http.MethodGet, "/api/v1/config/promo/summary", nil)
	second.Request.Header.Set("If-None-Match", etag)
	if !setPublicCache(second, map[string]any{"enabled": true}, 60) {
		t.Fatal("matching ETag should return not modified")
	}
	if second.Writer.Status() != http.StatusNotModified {
		t.Fatalf("status = %d, want 304", second.Writer.Status())
	}
}
