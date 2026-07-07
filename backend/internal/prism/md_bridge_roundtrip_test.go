package prism

import (
	"strings"
	"testing"
)

// parseBib:花括号配平取整条 + 键提取 + 嵌套花括号不丢;非条目文本跳过。
func TestParseBib(t *testing.T) {
	in := "闲话跳过\n@article{smith2020,\n  title   = {A Study of {LaTeX} Braces},\n  author  = {Smith, John and Doe, Jane},\n  year    = {2020},\n}\n\n@inproceedings{li2021,\n  title = {Deep Nets},\n  year  = {2021}\n}\n"
	m := parseBib(in)
	if len(m) != 2 {
		t.Fatalf("want 2 entries, got %d: %v", len(m), m)
	}
	if e, ok := m["smith2020"]; !ok || !strings.Contains(e, "{LaTeX}") {
		t.Fatalf("smith2020 缺失或嵌套花括号丢: %q", e)
	}
	if !strings.HasPrefix(m["smith2020"], "@article{smith2020,") {
		t.Fatalf("整条起止不对: %q", m["smith2020"])
	}
	if _, ok := m["li2021"]; !ok {
		t.Fatalf("li2021 缺失: %v", m)
	}
	// renderBib → parseBib 往返:键集合一致。
	round := parseBib(renderBib(m))
	if len(round) != 2 || round["smith2020"] == "" || round["li2021"] == "" {
		t.Fatalf("renderBib→parseBib 往返丢条目: %v", round)
	}
}

// 构造一份含 figure/label/heading/math 的结构体,序列化成 document.md 再解析+合并回来,
// 验证「静默丢内容」的三个坑已堵:①守卫 ②figure 不退化 ③label/width 回填。
func baseDoc() *DocStruct {
	return &DocStruct{
		FrontMatter: FrontMatter{
			Title:    "原标题",
			Abstract: "原摘要一句话。",
			Keywords: []string{"a", "b"},
		},
		Body: []Block{
			{ID: "h1", Type: BlockHeading, Level: 1, Text: "引言", Label: "sec:intro"},
			{ID: "p1", Type: BlockParagraph, Inlines: []Inline{{T: InlineText, V: "见图"}, {T: InlineCite, Key: "smith2020"}}},
			{ID: "f1", Type: BlockFigure, Asset: "img1", Caption: "示意图", Width: "0.8\\linewidth", Label: "fig:demo"},
			{ID: "m1", Type: BlockDisplayMath, Latex: "E=mc^2", Label: "eq:emc"},
		},
	}
}

// agent 原样回写 document.md(没动任何东西)→ 合并后一切应保住。
func TestRoundTrip_Unchanged_PreservesEverything(t *testing.T) {
	d := baseDoc()
	md := structToEditorMarkdown(d)
	applyEditorMarkdown(d, md)

	if d.FrontMatter.Title != "原标题" || d.FrontMatter.Abstract != "原摘要一句话。" {
		t.Fatalf("frontmatter drifted: %+v", d.FrontMatter)
	}
	if len(d.FrontMatter.Keywords) != 2 {
		t.Fatalf("keywords lost: %v", d.FrontMatter.Keywords)
	}
	// figure 仍是 figure(未退化成段落)且 Asset/Caption 在
	var fig *Block
	for i := range d.Body {
		if d.Body[i].Type == BlockFigure {
			fig = &d.Body[i]
		}
	}
	if fig == nil {
		t.Fatal("figure 退化了(未回收成 BlockFigure)")
	}
	if fig.Asset != "img1" || fig.Caption != "示意图" {
		t.Fatalf("figure asset/caption 丢: %+v", fig)
	}
	// Width/Label 经 restoreBlockMeta 按 Asset 回填
	if fig.Width != "0.8\\linewidth" {
		t.Fatalf("figure width 未回填: %q", fig.Width)
	}
	if fig.Label != "fig:demo" {
		t.Fatalf("figure label 未回填: %q", fig.Label)
	}
	// heading / math 的 label 按内容匹配回填
	for _, b := range d.Body {
		if b.Type == BlockHeading && b.Text == "引言" && b.Label != "sec:intro" {
			t.Fatalf("heading label 未回填: %q", b.Label)
		}
		if b.Type == BlockDisplayMath && b.Latex == "E=mc^2" && b.Label != "eq:emc" {
			t.Fatalf("math label 未回填: %q", b.Label)
		}
	}
}

// agent 在 frontmatter 里漏写了 abstract 行(和 keywords)→ 真源不应被清空(守卫)。
func TestRoundTrip_DroppedFrontmatter_NotWiped(t *testing.T) {
	d := baseDoc()
	// 模拟 agent 回写的 md:只有 title,没有 abstract/keywords 行
	md := "---\ntitle: 新标题\n---\n\n# 引言\n\n正文。\n"
	applyEditorMarkdown(d, md)

	if d.FrontMatter.Title != "新标题" {
		t.Fatalf("title 未更新: %q", d.FrontMatter.Title)
	}
	if d.FrontMatter.Abstract != "原摘要一句话。" {
		t.Fatalf("abstract 被静默清空(守卫失效): %q", d.FrontMatter.Abstract)
	}
	if len(d.FrontMatter.Keywords) != 2 {
		t.Fatalf("keywords 被静默清空(守卫失效): %v", d.FrontMatter.Keywords)
	}
}

// agent 显式改了 figure 的 caption / heading 的 text → 那些块变了,label 不误回填(可接受的重来)。
func TestRoundTrip_ChangedBlock_LabelNotMisrestored(t *testing.T) {
	d := baseDoc()
	// heading text 改了、math latex 改了 → 不应把旧 label 硬套到「已改动」的块上
	md := "---\ntitle: 原标题\nabstract: 原摘要一句话。\nkeywords: a, b\n---\n\n# 绪论(改过)\n\n$$\nF=ma\n$$\n"
	applyEditorMarkdown(d, md)
	for _, b := range d.Body {
		if b.Type == BlockHeading && b.Label == "sec:intro" {
			t.Fatalf("heading 改了 text 却误回填了旧 label")
		}
		if b.Type == BlockDisplayMath && b.Label == "eq:emc" {
			t.Fatalf("math 改了 latex 却误回填了旧 label")
		}
	}
}

// body 为空(agent 只改了 frontmatter,正文没写)→ 不整块清空正文(守卫)。
func TestRoundTrip_EmptyBody_NotWiped(t *testing.T) {
	d := baseDoc()
	md := "---\ntitle: 只改标题\nabstract: 原摘要一句话。\nkeywords: a, b\n---\n"
	applyEditorMarkdown(d, md)
	if len(d.Body) != 4 {
		t.Fatalf("body 被空 md 清空(守卫失效): len=%d", len(d.Body))
	}
	if d.FrontMatter.Title != "只改标题" {
		t.Fatalf("title 未更新: %q", d.FrontMatter.Title)
	}
}

// {#label} 锚 + 表题注 的 serialize→parse 往返(直接带出,不依赖 restoreBlockMeta)。
func TestRoundTrip_LabelsAndTableCaption(t *testing.T) {
	body := []Block{
		{Type: BlockHeading, Level: 2, Text: "方法", Label: "sec:method"},
		{Type: BlockFigure, Asset: "imgX", Caption: "架构图", Label: "fig:arch"},
		{Type: BlockTable, Rows: [][]string{{"方法", "准确率"}, {"本文", "93.1"}}, Caption: "对比结果", Label: "tbl:cmp"},
	}
	md := bodyToEditorMarkdown(body)
	_, _, _, got := parseEditorMarkdown("---\ntitle: t\n---\n\n" + md)
	var h, f, tb *Block
	for i := range got {
		switch got[i].Type {
		case BlockHeading:
			h = &got[i]
		case BlockFigure:
			f = &got[i]
		case BlockTable:
			tb = &got[i]
		}
	}
	if h == nil || h.Text != "方法" || h.Label != "sec:method" {
		t.Fatalf("heading label 往返丢: %+v", h)
	}
	if f == nil || f.Asset != "imgX" || f.Caption != "架构图" || f.Label != "fig:arch" {
		t.Fatalf("figure label 往返丢: %+v", f)
	}
	if tb == nil || tb.Caption != "对比结果" || tb.Label != "tbl:cmp" || len(tb.Rows) != 2 {
		t.Fatalf("table caption/label 往返丢: %+v", tb)
	}
}

// figureLine 解析单点
func TestFigureLine(t *testing.T) {
	cases := []struct{ in, asset, cap string; ok bool }{
		{`![图](img1 "示意图")`, "img1", "示意图", true},
		{`![图](img2)`, "img2", "", true},
		{`![](x "c")`, "x", "c", true},
		{`普通段落`, "", "", false},
		{`![坏行`, "", "", false},
	}
	for _, c := range cases {
		a, cap, ok := figureLine(c.in)
		if ok != c.ok || a != c.asset || cap != c.cap {
			t.Fatalf("figureLine(%q) = (%q,%q,%v) want (%q,%q,%v)", c.in, a, cap, ok, c.asset, c.cap, c.ok)
		}
	}
}
