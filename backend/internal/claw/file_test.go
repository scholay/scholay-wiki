// ============================================================================
// Claw — file.go 纯逻辑单元测试: data URL 解码 + 光栅图 MIME 白名单 (XSS 命门)。
// 这两个 gate 同时被 DownloadSessionArtifact 与 GetSessionFile 复用, 回归测试钉死它。
// ============================================================================

package claw

import (
	"strings"
	"testing"
)

func TestDecodeDataURL(t *testing.T) {
	t.Run("valid png", func(t *testing.T) {
		mime, payload, err := decodeDataURL("data:image/png;base64,aGVsbG8=")
		if err != nil || mime != "image/png" || string(payload) != "hello" {
			t.Fatalf("decodeDataURL = (%q, %q, %v)", mime, string(payload), err)
		}
	})
	t.Run("charset param kept in mime", func(t *testing.T) {
		mime, _, err := decodeDataURL("data:image/png;charset=utf-8;base64,aGk=")
		if err != nil || !strings.HasPrefix(mime, "image/png") {
			t.Fatalf("decodeDataURL = (%q, %v)", mime, err)
		}
	})
	t.Run("invalid → error", func(t *testing.T) {
		for _, in := range []string{
			"",
			"notadataurl",
			"data:image/png,nobase64marker",
			"data:image/png;base64,@@@@bad",
		} {
			if _, _, err := decodeDataURL(in); err == nil {
				t.Errorf("decodeDataURL(%q) expected error, got nil", in)
			}
		}
	})
}

func TestAllowedRasterMIME(t *testing.T) {
	for _, m := range []string{"image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"} {
		if !allowedRasterMIME[m] {
			t.Errorf("%s should be inline-allowed", m)
		}
	}
	// XSS 命门: 这些绝不能内联回写 (svg 可带 <script>; html/pdf 同源执行风险)。
	for _, m := range []string{"image/svg+xml", "text/html", "application/pdf", "text/plain", ""} {
		if allowedRasterMIME[m] {
			t.Errorf("%q must NOT be inline-allowed (XSS gate)", m)
		}
	}
}
