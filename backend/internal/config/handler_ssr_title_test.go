package config

import "testing"

// 2026-08-10 审计:上游(OpenAlex 等)标题自带尾部省略号时,truncate 再补 "..."
// 会产生「...NU... - 论文详情」式双截断,必须先剥掉。
func TestStripTrailingEllipsis(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"Plain title", "Plain title"},
		{"Truncated upstream title ...", "Truncated upstream title"},
		{"Truncated upstream title...", "Truncated upstream title"},
		{"Unicode ellipsis…", "Unicode ellipsis"},
		{"Stacked mess... …", "Stacked mess"},
		{"  padded  ", "padded"},
		{"...", ""},
	}
	for _, tt := range cases {
		if got := stripTrailingEllipsis(tt.in); got != tt.want {
			t.Errorf("stripTrailingEllipsis(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
