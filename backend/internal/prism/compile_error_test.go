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

// TestExtractCompileError_Undefined 锁定 friendlyHint 从错误块(非首行)抠出具体未定义命令名
// (P0 对抗审查 finding #5:命令名在 l.NNN 续行里,不在 `! ` 首行)。
func TestExtractCompileError_Undefined(t *testing.T) {
	log := strings.Join([]string{
		"! Undefined control sequence.",
		"l.42 \\toprule",
		"              ",
	}, "\n")
	summary, _ := extractCompileError(log)
	if !strings.Contains(summary, "\\toprule") {
		t.Fatalf("summary 应含具体命令名 \\toprule(friendlyHint 从块抠): %q", summary)
	}
	if !strings.Contains(summary, "42") {
		t.Fatalf("summary 应含行号 42: %q", summary)
	}
}

// TestExtractCompileError_Bibtex 锁定 bibtex 阶段失败(无 `! ` 行)也能抠出可读 summary
// (P0 对抗审查:修裸 "Latexmk: Errors")。
func TestExtractCompileError_Bibtex(t *testing.T) {
	log := strings.Join([]string{
		"Database file #1: references.bib",
		"I was expecting a `,' or a `}'---line 12 of file references.bib",
		"Latexmk: Errors, so I did not complete making targets",
	}, "\n")
	summary, _ := extractCompileError(log)
	if summary == "" || strings.Contains(summary, "Latexmk: Errors") {
		t.Fatalf("bibtex 错应抠出可读 summary 而非回落 Latexmk 总结: %q", summary)
	}
	if !strings.Contains(summary, "参考文献") {
		t.Fatalf("bibtex 错应带 .bib 友好提示: %q", summary)
	}
}

func TestExtractCompileError_NoError(t *testing.T) {
	if s, e := extractCompileError("This is pdfTeX...\nOutput written on a.pdf (1 page).\nTranscript written on a.log."); s != "" || e != "" {
		t.Fatalf("无 \"! \" 块应返回空, 实得 %q / %q", s, e)
	}
}

// TestClassifyCompileErrorSource 锁定 2026-07 线上审计 #3:三类高频 bib 源错误
// (条目未闭合 / 期刊名裸 & / 作者名重音)判 bibliography,供前端把自动修复分流出
// 「改 document.md」回路(线上实测该方向 6~11 轮不收敛白烧)。
func TestClassifyCompileErrorSource(t *testing.T) {
	cases := []struct {
		name    string
		kind    string
		summary string
		excerpt string
		want    string
	}{
		// bibtex 阶段直接报错(.bib 条目未闭合,线上 project 267)
		{"bibtex-skipping", compileErrLatex, "I'm skipping whatever remains of this entry", "", compileSrcBib},
		{"bibtex-expecting", compileErrLatex, `I was expecting a ',' or a '}'---line 12 of file references.bib`, "", compileSrcBib},
		// 期刊名裸 &(线上 project 261:Soil & Tillage Research):真阳性形态的出错源码行落在
		// .bbl 里,自带 \newblock/{\em 上下文 → 仍判 bibliography。
		{"misplaced-tab-in-bbl", compileErrLatex, "第 14 行附近:Misplaced alignment tab character &",
			"! Misplaced alignment tab character &.\nl.14 \\newblock {\\em Soil &", compileSrcBib},
		// 2026-07 审查 [13]/[25]:同一条报错来自正文(opaque 原样 LaTeX / 没写 aligned 的 $$ 数学块)
		// 时无 .bbl 上下文 → 必须判 body,否则用户同时失去原始报错文案与「让 AI 修复」按钮。
		{"misplaced-tab-in-body", compileErrLatex, "第 12 行附近:Misplaced alignment tab character &",
			"! Misplaced alignment tab character &.\nl.12 x &= y \\\\", compileSrcBody},
		// 引擎错但上下文在 bibtex 产物(\newblock / {\em 行内的 Undefined control sequence:作者名重音)
		{"undef-in-bbl", compileErrLatex, "Undefined control sequence",
			"! Undefined control sequence.\nl.12 \\newblock {\\em Journal of Ap\\'{e}ry}", compileSrcBib},
		// 正文错照旧 body
		{"body-extra-brace", compileErrLatex, "第 380 行附近:Extra }, or forgotten $", "l.380 \\end{axis}", compileSrcBody},
		{"body-undef", compileErrLatex, "Undefined control sequence", "l.42 \\toprule", compileSrcBody},
		// 非 latex 的 error_kind 一律 infra
		{"infra", "infra", "素材读取失败,请稍后重试", "", compileSrcInfra},
		{"timeout", "timeout", "编译排队超时,请稍后重试", "", compileSrcInfra},
		// 0072 迁移前的存量行(kind 为空)按信号判定
		{"legacy-empty-kind", "", "I'm skipping whatever remains of this entry", "", compileSrcBib},
	}
	for _, c := range cases {
		if got := classifyCompileErrorSource(c.kind, c.summary, c.excerpt); got != c.want {
			t.Errorf("[%s] classifyCompileErrorSource = %q, want %q", c.name, got, c.want)
		}
	}
}
