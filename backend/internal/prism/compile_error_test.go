package prism

import (
	"strings"
	"testing"
)

// TestExtractCompileError 用 beidou.tex(legend 逗号 bug)的真实 pdflatex log 片段验证:
// 能抠出行号(380)+ 错误信息 + 含 pgfplots legend 线索的源码块。
func TestExtractCompileError(t *testing.T) {
	log := strings.Join([]string{
		"Overfull \\hbox (41.5pt too wide) in paragraph at lines 350--351",
		" [][]",
		"! Extra }, or forgotten $.",
		"\\pgfplots@already@computed@legend@node ...= 0.002}",
		"                                                  ;\\\\};",
		"l.380 \\end{axis}",
		"                ",
		"! Missing } inserted.",
		"l.380 \\end{axis}",
	}, "\n")

	summary, excerpt := extractCompileError(log)
	t.Logf("summary = %q", summary)
	t.Logf("excerpt = %q", excerpt)

	if !strings.Contains(summary, "380") {
		t.Fatalf("summary 缺行号: %q", summary)
	}
	if !strings.Contains(summary, "Extra }") {
		t.Fatalf("summary 缺错误信息: %q", summary)
	}
	if !strings.Contains(excerpt, "l.380") || !strings.Contains(excerpt, "Extra }") {
		t.Fatalf("excerpt 缺定位信息: %q", excerpt)
	}
	// 错误块应带出 pgfplots legend 线索(真 bug 所在),让 AI 能定位到 legend 而非瞎猜。
	if !strings.Contains(excerpt, "legend") {
		t.Fatalf("excerpt 未带出源码上下文(legend 线索): %q", excerpt)
	}
}

func TestExtractCompileError_NoError(t *testing.T) {
	if s, e := extractCompileError("This is pdfTeX...\nOutput written on a.pdf (1 page).\nTranscript written on a.log."); s != "" || e != "" {
		t.Fatalf("无 \"! \" 块应返回空, 实得 %q / %q", s, e)
	}
}
