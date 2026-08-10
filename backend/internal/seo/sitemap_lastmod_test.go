package seo

import (
	"strings"
	"testing"
	"time"
)

// 2026-08-10 审计:updated_at ≈ created_at = 入库后内容从未变化,此时 <lastmod>
// 只是入库时刻,输出会制造「整片 URL 同一天全部被修改」的假象 → 必须省略。
func TestEntityLastModXMLOmitsIngestionTimestamps(t *testing.T) {
	base := time.Date(2026, 8, 10, 12, 0, 0, 0, time.UTC)

	// 入库后从未变化(完全相等)→ 省略
	if got := entityLastModXML(SitemapEntry{CreatedAt: base, UpdatedAt: base}); got != "" {
		t.Fatalf("equal created/updated must omit lastmod, got %q", got)
	}
	// 亚分钟抖动(INSERT 参数与 DB 时钟差)→ 仍视为未变化
	if got := entityLastModXML(SitemapEntry{CreatedAt: base, UpdatedAt: base.Add(30 * time.Second)}); got != "" {
		t.Fatalf("sub-minute jitter must omit lastmod, got %q", got)
	}
	// 旧数据 created_at 缺失(零值)→ 无法判定,宁可省略
	if got := entityLastModXML(SitemapEntry{UpdatedAt: base}); got != "" {
		t.Fatalf("zero created_at must omit lastmod, got %q", got)
	}
	// 真实内容变化(晚于入库 1 分钟以上)→ 输出 RFC3339
	got := entityLastModXML(SitemapEntry{CreatedAt: base, UpdatedAt: base.Add(48 * time.Hour)})
	if !strings.Contains(got, "<lastmod>") || !strings.Contains(got, "2026-08-12T12:00:00Z") {
		t.Fatalf("genuine update must emit lastmod, got %q", got)
	}
}

func TestETagMatches(t *testing.T) {
	etag := `W/"00000000deadbeef"`
	cases := []struct {
		header string
		want   bool
	}{
		{`W/"00000000deadbeef"`, true},
		{`"00000000deadbeef"`, true}, // 弱比较:忽略 W/ 前缀
		{`*`, true},
		{`W/"other", W/"00000000deadbeef"`, true},
		{`W/"other"`, false},
		{``, false},
	}
	for _, tt := range cases {
		if got := etagMatches(tt.header, etag); got != tt.want {
			t.Errorf("etagMatches(%q) = %v, want %v", tt.header, got, tt.want)
		}
	}
}
