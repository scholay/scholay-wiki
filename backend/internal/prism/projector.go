// ============================================================================
// projector —— 结构体 + 目标模板 → .tex/.bib(确定性、纯函数、不调 LLM)。
//   见 REPORT.md Part III §2.2/§2.6。「换刊 = 模板替换非 LLM 重写」的承重件:
//   同一份结构体经不同模板投影出不同期刊的 .tex —— 关键在各期刊的作者/机构「绑定模型」不同:
//     article    —— 作者名简单拼接;abstract 在 \maketitle 后
//     ieee-conf  —— 嵌套 \IEEEauthorblockN/A(无标签)
//     elsarticle —— 标签式 \author[1] ↔ \affiliation[1]{organization=,city=,country=},在 frontmatter 环境内
//   每个模板自带 assemble(整篇装配)—— 因为期刊间连「文档结构」都不同(elsarticle 用
//   \begin{frontmatter}),不能只换作者宏。投影产物写进既有 prism_file_versions → 复用编译链。
// ============================================================================

package prism

import (
	"embed"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// texTemplate 模板注册项。assemble 装配整篇 .tex;conformance 报缺失的必填前置信息。
type texTemplate struct {
	Key         string
	Name        string
	DocClass    string
	ClassOpts   string
	BibStyle    string
	Packages    []string
	PageLimit   int // 0 = 不限
	assemble    func(t texTemplate, d *DocStruct, bodyTeX string, hasBib bool) string
	conformance func(d *DocStruct) []string
}

// 模板注册表 = go:embed 的 manifest.json(元数据,数据驱动)+ 下面按 key 注册的 Go 装配函数(代码)。
// 各期刊「作者绑定模型」是逻辑(嵌套/标签/序号),不能纯数据化,故拆成「元数据 embed + 装配代码」两半。

//go:embed templates/*/manifest.json
var templateManifests embed.FS

type templateFuncs struct {
	assemble    func(t texTemplate, d *DocStruct, body string, hasBib bool) string
	conformance func(d *DocStruct) []string
}

var templateFuncsByKey = map[string]templateFuncs{
	"article":    {assembleArticle, func(*DocStruct) []string { return nil }},
	"ieee-conf":  {assembleIEEE, conformIEEE},
	"elsarticle": {assembleElsarticle, conformElsarticle},
	"llncs":      {assembleLLNCS, conformLLNCS},
	// "sn-jnl": {assembleSNJnl, conformSNJnl}, // 待 sn-jnl.cls 装上 + 加 templates/sn-jnl/manifest.json 后启用
}

var texTemplates = loadTemplates()

// loadTemplates 读 go:embed 的每份 manifest.json,与同 key 的装配函数合成注册项。
// manifest 无对应装配函数(或反之)→ 跳过(元数据与代码必须成对)。
func loadTemplates() map[string]texTemplate {
	out := map[string]texTemplate{}
	entries, err := templateManifests.ReadDir("templates")
	if err != nil {
		return out
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		key := e.Name()
		fns, ok := templateFuncsByKey[key]
		if !ok {
			continue
		}
		data, rerr := templateManifests.ReadFile("templates/" + key + "/manifest.json")
		if rerr != nil {
			continue
		}
		var m struct {
			Key       string   `json:"key"`
			Name      string   `json:"name"`
			DocClass  string   `json:"doc_class"`
			ClassOpts string   `json:"class_opts"`
			BibStyle  string   `json:"bib_style"`
			Packages  []string `json:"packages"`
			PageLimit int      `json:"page_limit"`
		}
		if json.Unmarshal(data, &m) != nil {
			continue
		}
		out[key] = texTemplate{
			Key: m.Key, Name: m.Name, DocClass: m.DocClass, ClassOpts: m.ClassOpts,
			BibStyle: m.BibStyle, Packages: m.Packages, PageLimit: m.PageLimit,
			assemble: fns.assemble, conformance: fns.conformance,
		}
	}
	return out
}

// 引用 sn-jnl 投影件防「未使用」并保持随时可启用(装上类 + 加 manifest + 进 templateFuncsByKey)。
var _ = assembleSNJnl
var _ = conformSNJnl

// TemplateMeta 给前端模板选择器的精简元数据。
type TemplateMeta struct {
	Key       string `json:"key"`
	Name      string `json:"name"`
	DocClass  string `json:"doc_class"`
	PageLimit int    `json:"page_limit,omitempty"`
}

func ListTemplateMeta() []TemplateMeta {
	out := make([]TemplateMeta, 0, len(texTemplates))
	for _, t := range texTemplates {
		out = append(out, TemplateMeta{Key: t.Key, Name: t.Name, DocClass: t.DocClass, PageLimit: t.PageLimit})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

func templateFor(key string) texTemplate {
	if t, ok := texTemplates[key]; ok {
		return t
	}
	return texTemplates["article"]
}

// ProjectStruct 投影:结构体 → 文件集(main.tex [+ references.bib])。
func ProjectStruct(d *DocStruct) map[string]string {
	t := templateFor(d.TargetTemplate)
	body := renderBody(d.Body, d.Assets)
	hasBib := len(d.Bibliography) > 0
	files := map[string]string{"main.tex": t.assemble(t, d, body, hasBib)}
	if hasBib {
		files["references.bib"] = renderBib(d.Bibliography)
	}
	return files
}

// ─── ConformanceReport(合规检查:必填前置信息是否齐全)──────────────────────

type ConformanceReport struct {
	Template  string   `json:"template"`
	PageLimit int      `json:"page_limit,omitempty"`
	PageCount int      `json:"page_count,omitempty"` // 最近一次成功编译页数(compile_check)
	Overfull  int      `json:"overfull,omitempty"`   // Overfull hbox 数(内容溢出)
	Missing   []string `json:"missing"`              // 未满足的必填项 / 超页限 / 溢出(前端红点提示)
}

// Conformance 报告结构体相对目标模板的必填缺失(确定性,不需要编译)。
func Conformance(d *DocStruct) ConformanceReport {
	t := templateFor(d.TargetTemplate)
	missing := []string{}
	if t.conformance != nil {
		missing = t.conformance(d)
	}
	if missing == nil {
		missing = []string{}
	}
	return ConformanceReport{Template: t.Key, PageLimit: t.PageLimit, Missing: missing}
}

func conformIEEE(d *DocStruct) []string {
	var m []string
	if strings.TrimSpace(d.FrontMatter.Abstract) == "" {
		m = append(m, "缺摘要(IEEE 需要 abstract)")
	}
	if len(d.FrontMatter.Authors) == 0 {
		m = append(m, "缺作者")
	}
	return m
}

func conformElsarticle(d *DocStruct) []string {
	var m []string
	if strings.TrimSpace(d.FrontMatter.Abstract) == "" {
		m = append(m, "缺摘要(Elsevier 需要 abstract)")
	}
	if len(d.FrontMatter.Affiliations) == 0 {
		m = append(m, "缺作者机构(Elsevier 需要 organization / country)")
	} else {
		for _, af := range d.FrontMatter.Affiliations {
			if strings.TrimSpace(af.Organization) == "" || strings.TrimSpace(af.Country) == "" {
				m = append(m, "机构信息不全(Elsevier 需要 organization 与 country)")
				break
			}
		}
	}
	return m
}

// ─── 各模板装配 ──────────────────────────────────────────────────────────

func preamble(t texTemplate) string {
	var b strings.Builder
	if t.ClassOpts != "" {
		fmt.Fprintf(&b, "\\documentclass[%s]{%s}\n", t.ClassOpts, t.DocClass)
	} else {
		fmt.Fprintf(&b, "\\documentclass{%s}\n", t.DocClass)
	}
	for _, p := range t.Packages {
		fmt.Fprintf(&b, "\\usepackage{%s}\n", p)
	}
	// Unicode + CJK 支持(见 REPORT.md Part VI)。类无关:xeCJK 是纯字体覆盖层,不动期刊类排版,
	// 与 article/IEEEtran/elsarticle/llncs 都兼容(ctex 会与期刊类冲突,故不用)。CJK 字体按**文件名**
	// 设(沙箱无 fontconfig,家族名找不到)。注入 \usepackage{xeCJK} 也让 needsXeLaTeX 自动选 xelatex。
	// 拉丁重音/希腊/符号由 xelatex 默认 Latin Modern 覆盖,无需额外设置。
	b.WriteString(unicodeCJKPreamble)
	return b.String()
}

const unicodeCJKPreamble = `% --- Unicode + CJK(struct 轨,xelatex)---
\usepackage{fontspec}
\usepackage{xeCJK}
\setCJKmainfont[BoldFont=FandolSong-Bold.otf,ItalicFont=FandolKai-Regular.otf]{FandolSong-Regular.otf}
\setCJKsansfont{FandolHei-Regular.otf}
\setCJKmonofont{FandolFang-Regular.otf}
\xeCJKsetup{AutoFakeBold=true,AutoFakeSlant=true}
\usepackage{xurl}
\sloppy
`

func bibTail(t texTemplate, hasBib bool) string {
	if !hasBib {
		return ""
	}
	return fmt.Sprintf("\n\\bibliographystyle{%s}\n\\bibliography{references}\n", t.BibStyle)
}

// article:标题+拼接作者;摘要在 \maketitle 后。
func assembleArticle(t texTemplate, d *DocStruct, body string, hasBib bool) string {
	fm := d.FrontMatter
	var b strings.Builder
	b.WriteString(preamble(t))
	fmt.Fprintf(&b, "\n\\title{%s}\n", escapeLaTeX(fm.Title))
	if len(fm.Authors) > 0 {
		names := make([]string, 0, len(fm.Authors))
		for _, a := range fm.Authors {
			names = append(names, escapeLaTeX(authorName(a)))
		}
		fmt.Fprintf(&b, "\\author{%s}\n", strings.Join(names, " \\and "))
	}
	b.WriteString("\\date{\\today}\n\\begin{document}\n\\maketitle\n")
	if strings.TrimSpace(fm.Abstract) != "" {
		fmt.Fprintf(&b, "\n\\begin{abstract}\n%s\n\\end{abstract}\n", escapeLaTeX(fm.Abstract))
	}
	if len(fm.Keywords) > 0 {
		fmt.Fprintf(&b, "\n\\noindent\\textbf{Keywords:} %s\n", escapeLaTeX(strings.Join(fm.Keywords, ", ")))
	}
	fmt.Fprintf(&b, "\n%s", body)
	b.WriteString(bibTail(t, hasBib))
	b.WriteString("\n\\end{document}\n")
	return b.String()
}

// ieee-conf:嵌套 \IEEEauthorblockN/A(无标签绑定模型)。
func assembleIEEE(t texTemplate, d *DocStruct, body string, hasBib bool) string {
	fm := d.FrontMatter
	var b strings.Builder
	b.WriteString(preamble(t))
	fmt.Fprintf(&b, "\n\\title{%s}\n", escapeLaTeX(fm.Title))
	if len(fm.Authors) > 0 {
		affByID := affIndex(fm.Affiliations)
		blocks := make([]string, 0, len(fm.Authors))
		for _, a := range fm.Authors {
			var ab strings.Builder
			fmt.Fprintf(&ab, "\\IEEEauthorblockN{%s}", escapeLaTeX(authorName(a)))
			lines := []string{}
			for _, rid := range a.AffRefs {
				if af, ok := affByID[rid]; ok {
					lines = append(lines, escapeLaTeX(affLine(af.aff)))
				}
			}
			if a.Email != "" {
				lines = append(lines, escapeLaTeX(a.Email))
			}
			if len(lines) > 0 {
				fmt.Fprintf(&ab, "\n\\IEEEauthorblockA{%s}", strings.Join(lines, " \\\\ "))
			}
			blocks = append(blocks, ab.String())
		}
		fmt.Fprintf(&b, "\\author{%s}\n", strings.Join(blocks, "\n\\and\n"))
	}
	b.WriteString("\\begin{document}\n\\maketitle\n")
	if strings.TrimSpace(fm.Abstract) != "" {
		fmt.Fprintf(&b, "\n\\begin{abstract}\n%s\n\\end{abstract}\n", escapeLaTeX(fm.Abstract))
	}
	if len(fm.Keywords) > 0 {
		fmt.Fprintf(&b, "\n\\begin{IEEEkeywords}\n%s\n\\end{IEEEkeywords}\n", escapeLaTeX(strings.Join(fm.Keywords, ", ")))
	}
	fmt.Fprintf(&b, "\n%s", body)
	b.WriteString(bibTail(t, hasBib))
	b.WriteString("\n\\end{document}\n")
	return b.String()
}

// elsarticle:标签式 \author[i] ↔ \affiliation[i]{organization=,city=,country=},全部在 frontmatter 环境。
func assembleElsarticle(t texTemplate, d *DocStruct, body string, hasBib bool) string {
	fm := d.FrontMatter
	var b strings.Builder
	b.WriteString(preamble(t))
	b.WriteString("\n\\begin{document}\n\\begin{frontmatter}\n")
	fmt.Fprintf(&b, "\\title{%s}\n", escapeLaTeX(fm.Title))
	affByID := affIndex(fm.Affiliations)
	for _, a := range fm.Authors {
		labels := []string{}
		for _, rid := range a.AffRefs {
			if e, ok := affByID[rid]; ok {
				labels = append(labels, fmt.Sprintf("%d", e.idx))
			}
		}
		if len(labels) > 0 {
			fmt.Fprintf(&b, "\\author[%s]{%s}\n", strings.Join(labels, ","), escapeLaTeX(authorName(a)))
		} else {
			fmt.Fprintf(&b, "\\author{%s}\n", escapeLaTeX(authorName(a)))
		}
		if a.Email != "" {
			fmt.Fprintf(&b, "\\ead{%s}\n", escapeLaTeX(a.Email))
		}
	}
	// 机构按序号输出。
	affs := make([]affEntry, 0, len(affByID))
	for _, e := range affByID {
		affs = append(affs, e)
	}
	sort.Slice(affs, func(i, j int) bool { return affs[i].idx < affs[j].idx })
	for _, e := range affs {
		af := e.aff
		parts := []string{}
		if af.Organization != "" {
			parts = append(parts, "organization={"+escapeLaTeX(af.Organization)+"}")
		}
		if af.City != "" {
			parts = append(parts, "city={"+escapeLaTeX(af.City)+"}")
		}
		if af.Country != "" {
			parts = append(parts, "country={"+escapeLaTeX(af.Country)+"}")
		}
		fmt.Fprintf(&b, "\\affiliation[%d]{%s}\n", e.idx, strings.Join(parts, ", "))
	}
	if strings.TrimSpace(fm.Abstract) != "" {
		fmt.Fprintf(&b, "\\begin{abstract}\n%s\n\\end{abstract}\n", escapeLaTeX(fm.Abstract))
	}
	if len(fm.Keywords) > 0 {
		kws := make([]string, 0, len(fm.Keywords))
		for _, k := range fm.Keywords {
			kws = append(kws, escapeLaTeX(k))
		}
		fmt.Fprintf(&b, "\\begin{keyword}\n%s\n\\end{keyword}\n", strings.Join(kws, " \\sep "))
	}
	b.WriteString("\\end{frontmatter}\n")
	fmt.Fprintf(&b, "\n%s", body)
	b.WriteString(bibTail(t, hasBib))
	b.WriteString("\n\\end{document}\n")
	return b.String()
}

// affEntry 机构 + 1-based 序号(标签/序号绑定模型用)。
type affEntry struct {
	idx int
	aff Affiliation
}

func affIndex(affs []Affiliation) map[string]affEntry {
	m := make(map[string]affEntry, len(affs))
	for i, af := range affs {
		key := af.ID
		if key == "" {
			key = fmt.Sprintf("__aff%d", i)
		}
		m[key] = affEntry{idx: i + 1, aff: af}
	}
	return m
}

func sortedAffs(m map[string]affEntry) []affEntry {
	out := make([]affEntry, 0, len(m))
	for _, e := range m {
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].idx < out[j].idx })
	return out
}

// sn-jnl(Springer Nature):序号绑定 + \fnm{}\sur{} 拆名 + \affil*[i]{\orgname..} + \abstract{} 命令(非环境)。
func assembleSNJnl(t texTemplate, d *DocStruct, body string, hasBib bool) string {
	fm := d.FrontMatter
	var b strings.Builder
	b.WriteString(preamble(t))
	b.WriteString("\n\\begin{document}\n")
	fmt.Fprintf(&b, "\\title{%s}\n", escapeLaTeX(fm.Title))
	affByID := affIndex(fm.Affiliations)
	for ai, a := range fm.Authors {
		star := ""
		if a.Corresponding || ai == 0 { // 第一/通讯作者标 *
			star = "*"
		}
		lbl := ""
		labels := []string{}
		for _, rid := range a.AffRefs {
			if e, ok := affByID[rid]; ok {
				labels = append(labels, fmt.Sprintf("%d", e.idx))
			}
		}
		if len(labels) > 0 {
			lbl = "[" + strings.Join(labels, ",") + "]"
		}
		fmt.Fprintf(&b, "\\author%s%s{\\fnm{%s}\\sur{%s}}", star, lbl, escapeLaTeX(a.Given), escapeLaTeX(a.Family))
		if a.Email != "" {
			fmt.Fprintf(&b, "\\email{%s}", escapeLaTeX(a.Email))
		}
		b.WriteString("\n")
	}
	for _, e := range sortedAffs(affByID) {
		af := e.aff
		star := ""
		if e.idx == 1 {
			star = "*"
		}
		parts := []string{}
		if af.Organization != "" {
			parts = append(parts, "\\orgname{"+escapeLaTeX(af.Organization)+"}")
		}
		if af.City != "" {
			parts = append(parts, "\\city{"+escapeLaTeX(af.City)+"}")
		}
		if af.Country != "" {
			parts = append(parts, "\\country{"+escapeLaTeX(af.Country)+"}")
		}
		fmt.Fprintf(&b, "\\affil%s[%d]{%s}\n", star, e.idx, strings.Join(parts, ", "))
	}
	if strings.TrimSpace(fm.Abstract) != "" {
		fmt.Fprintf(&b, "\\abstract{%s}\n", escapeLaTeX(fm.Abstract)) // 命令,不是环境
	}
	if len(fm.Keywords) > 0 {
		fmt.Fprintf(&b, "\\keywords{%s}\n", escapeLaTeX(strings.Join(fm.Keywords, ", ")))
	}
	b.WriteString("\\maketitle\n\n")
	b.WriteString(body)
	if hasBib {
		b.WriteString("\n\\bibliography{references}\n") // sn-jnl 由 class option 定 style,不加 \bibliographystyle
	}
	b.WriteString("\n\\end{document}\n")
	return b.String()
}

// llncs(Springer LNCS):位置序号绑定 —— \author{名\inst{1} \and ...} + \institute{X \and Y};abstract 环境内含 \keywords。
func assembleLLNCS(t texTemplate, d *DocStruct, body string, hasBib bool) string {
	fm := d.FrontMatter
	var b strings.Builder
	b.WriteString(preamble(t))
	b.WriteString("\n\\begin{document}\n")
	fmt.Fprintf(&b, "\\title{%s}\n", escapeLaTeX(fm.Title))
	affByID := affIndex(fm.Affiliations)
	if len(fm.Authors) > 0 {
		parts := make([]string, 0, len(fm.Authors))
		for _, a := range fm.Authors {
			nm := escapeLaTeX(authorName(a))
			insts := []string{}
			for _, rid := range a.AffRefs {
				if e, ok := affByID[rid]; ok {
					insts = append(insts, fmt.Sprintf("%d", e.idx))
				}
			}
			if len(insts) > 0 {
				nm += "\\inst{" + strings.Join(insts, ",") + "}"
			}
			parts = append(parts, nm)
		}
		fmt.Fprintf(&b, "\\author{%s}\n", strings.Join(parts, " \\and "))
	}
	if len(fm.Affiliations) > 0 {
		insts := make([]string, 0, len(fm.Affiliations))
		for _, e := range sortedAffs(affByID) {
			insts = append(insts, escapeLaTeX(affLine(e.aff)))
		}
		fmt.Fprintf(&b, "\\institute{%s}\n", strings.Join(insts, " \\and "))
	}
	b.WriteString("\\maketitle\n")
	if strings.TrimSpace(fm.Abstract) != "" {
		fmt.Fprintf(&b, "\\begin{abstract}\n%s\n", escapeLaTeX(fm.Abstract))
		if len(fm.Keywords) > 0 {
			kws := make([]string, 0, len(fm.Keywords))
			for _, k := range fm.Keywords {
				kws = append(kws, escapeLaTeX(k))
			}
			fmt.Fprintf(&b, "\\keywords{%s}\n", strings.Join(kws, " \\and "))
		}
		b.WriteString("\\end{abstract}\n")
	}
	fmt.Fprintf(&b, "\n%s", body)
	if hasBib {
		fmt.Fprintf(&b, "\n\\bibliographystyle{%s}\n\\bibliography{references}\n", t.BibStyle)
	}
	b.WriteString("\n\\end{document}\n")
	return b.String()
}

func conformLLNCS(d *DocStruct) []string {
	if strings.TrimSpace(d.FrontMatter.Abstract) == "" {
		return []string{"缺摘要(LNCS 需要 abstract)"}
	}
	return nil
}

func conformSNJnl(d *DocStruct) []string {
	var m []string
	if strings.TrimSpace(d.FrontMatter.Abstract) == "" {
		m = append(m, "缺摘要(Springer 需要 abstract)")
	}
	for _, a := range d.FrontMatter.Authors {
		if strings.TrimSpace(a.Given) == "" || strings.TrimSpace(a.Family) == "" {
			m = append(m, "作者需拆分为名/姓(Springer 用 \\fnm / \\sur)")
			break
		}
	}
	return m
}

func authorName(a Author) string {
	n := strings.TrimSpace(strings.TrimSpace(a.Given) + " " + strings.TrimSpace(a.Family))
	if n == "" {
		return "Anonymous"
	}
	return n
}

func affLine(af Affiliation) string {
	parts := []string{}
	for _, s := range []string{af.Department, af.Organization, af.City, af.Country} {
		if strings.TrimSpace(s) != "" {
			parts = append(parts, strings.TrimSpace(s))
		}
	}
	return strings.Join(parts, ", ")
}

// ─── 正文投影 ────────────────────────────────────────────────────────────

func renderBody(blocks []Block, assets map[string]DocAsset) string {
	var b strings.Builder
	for _, blk := range blocks {
		switch blk.Type {
		case BlockHeading:
			cmd := "section"
			switch blk.Level {
			case 2:
				cmd = "subsection"
			case 3:
				cmd = "subsubsection"
			}
			fmt.Fprintf(&b, "\\%s{%s}\n", cmd, escapeLaTeX(blk.Text))
			if blk.Label != "" {
				fmt.Fprintf(&b, "\\label{%s}\n", blk.Label)
			}
		case BlockParagraph:
			b.WriteString(renderInlines(blk.Inlines))
			b.WriteString("\n\n")
		case BlockDisplayMath:
			math := wrapCJKInMath(blk.Latex)
			if blk.Label != "" {
				fmt.Fprintf(&b, "\\begin{equation}\\label{%s}\n%s\n\\end{equation}\n", blk.Label, math)
			} else {
				fmt.Fprintf(&b, "\\begin{equation*}\n%s\n\\end{equation*}\n", math)
			}
		case BlockFigure:
			b.WriteString("\\begin{figure}[htbp]\n\\centering\n")
			width := strings.TrimSpace(blk.Width)
			if width == "" {
				width = "0.8\\linewidth"
			}
			if a, ok := assets[blk.Asset]; ok && strings.TrimSpace(a.RelPath) != "" {
				fmt.Fprintf(&b, "\\includegraphics[width=%s]{%s}\n", width, a.RelPath)
			} else {
				b.WriteString("\\framebox[0.8\\linewidth]{\\rule{0pt}{3cm}}\n") // 无资产 → 占位框
			}
			// 有 Label 必须先出 \caption(哪怕空)——浮动体计数器只由 \caption 步进,否则 \label 抓到的是
			// 外层 section 号,[@fig:x]→\ref 出错号。只有 Caption、无 Label 时照常只出 \caption。
			if blk.Caption != "" || blk.Label != "" {
				fmt.Fprintf(&b, "\\caption{%s}\n", escapeLaTeX(blk.Caption))
				if blk.Label != "" {
					fmt.Fprintf(&b, "\\label{%s}\n", blk.Label)
				}
			}
			b.WriteString("\\end{figure}\n")
		case BlockList:
			env := "itemize"
			if blk.Ordered {
				env = "enumerate"
			}
			fmt.Fprintf(&b, "\\begin{%s}\n", env)
			for _, it := range blk.Items {
				fmt.Fprintf(&b, "\\item %s\n", renderInlines(it))
			}
			fmt.Fprintf(&b, "\\end{%s}\n", env)
		case BlockTable:
			b.WriteString(tableToLatex(blk))
		case BlockOpaque:
			b.WriteString(blk.RawLatex)
			b.WriteString("\n")
		}
	}
	return b.String()
}

func renderInlines(inls []Inline) string {
	var b strings.Builder
	for i := 0; i < len(inls); i++ {
		in := inls[i]
		switch in.T {
		case InlineBold:
			fmt.Fprintf(&b, "\\textbf{%s}", escapeLaTeX(in.V))
		case InlineItalic:
			fmt.Fprintf(&b, "\\emph{%s}", escapeLaTeX(in.V))
		case InlineCite:
			// [@key] 一键两用:fig:/tbl:/sec: 前缀 = 交叉引用锚 → \ref{key};其余 = 文献引用 → \cite{key}。
			if isCrossRefKey(in.Key) {
				fmt.Fprintf(&b, "\\ref{%s}", in.Key)
			} else {
				keys := []string{in.Key}
				for i+1 < len(inls) && inls[i+1].T == InlineCite && !isCrossRefKey(inls[i+1].Key) { // 合并相邻文献引用 → \cite{a,b}
					i++
					keys = append(keys, inls[i].Key)
				}
				fmt.Fprintf(&b, "\\cite{%s}", strings.Join(keys, ",")) // cite key 不转义
			}
		case InlineMath:
			fmt.Fprintf(&b, "$%s$", wrapCJKInMath(in.Latex)) // 数学源不转义;CJK 包 \text 防 xelatex 丢字
		default: // InlineText 及未知
			b.WriteString(escapeLaTeX(in.V))
		}
	}
	return b.String()
}

// wrapCJKInMath 把数学源里的 CJK 连续段包进 \text{} —— xelatex 在数学模式下用数学字体(无 CJK 字形),
// 直接放 CJK 会静默丢字(prism_tex 实测 exit 0 但字丢);amsmath \text 切回文本模式用 xeCJK 字体。
// 简单稳妥:包最大 CJK 段;即便偶尔与已有 \text{} 双重包裹也无害(\text{\text{}} 合法且等价),
// pandoc 的 md→OMML 也认 \text{},故 PDF 与 Word 两条链都受益。
func wrapCJKInMath(latex string) string {
	if latex == "" {
		return latex
	}
	runes := []rune(latex)
	n := len(runes)
	var b strings.Builder
	inRun := false
	closeRun := func() {
		if inRun {
			b.WriteByte('}')
			inRun = false
		}
	}
	// 抑制:引用/标签「键」命令(\ref/\label/\eqref…)的花括号参数内不包 CJK —— 键要精确匹配,
	// 包进 \text 会毁掉键(引用变未定义)且 \text 在 \csname 键上下文报错致整篇编译失败。
	// 结构体自带的 label(blk.Label)在 wrapCJKInMath 之外输出,不受影响;这里只挡「用户写进公式里」的。
	suppress := 0 // >0:在被抑制命令的 { } 内(记花括号深度)
	i := 0
	for i < n {
		r := runes[i]
		if r == '\\' && i+1 < n {
			// 读控制序列名(字母);单字符控制符(\{ \\ \, 等)当 2 字符原样过。命令名不含 CJK。
			j := i + 1
			for j < n && ((runes[j] >= 'a' && runes[j] <= 'z') || (runes[j] >= 'A' && runes[j] <= 'Z')) {
				j++
			}
			if j == i+1 {
				j = i + 2
			}
			closeRun()
			b.WriteString(string(runes[i:j]))
			if suppress == 0 && isRefKeyCmd(string(runes[i+1:j])) {
				k := j
				for k < n && runes[k] == ' ' { // 命令名与 { 间允许空格
					k++
				}
				if k < n && runes[k] == '{' {
					b.WriteString(string(runes[j : k+1])) // 写掉中间空格 + 开花括号
					suppress = 1
					i = k + 1
					continue
				}
			}
			i = j
			continue
		}
		if suppress > 0 {
			if r == '{' {
				suppress++
			} else if r == '}' {
				suppress--
			}
			b.WriteRune(r)
			i++
			continue
		}
		cjk := isCJKRune(r)
		if cjk && !inRun {
			b.WriteString("\\text{")
			inRun = true
		} else if !cjk && inRun {
			closeRun()
		}
		b.WriteRune(r)
		i++
	}
	closeRun()
	return b.String()
}

// isRefKeyCmd 报某命令是否取「必须精确匹配的键」参数(键内 CJK 绝不能包 \text)。
func isRefKeyCmd(name string) bool {
	switch name {
	case "label", "ref", "eqref", "pageref", "autoref", "cref", "Cref", "nameref", "vref", "vpageref":
		return true
	}
	return false
}

func isCJKRune(r rune) bool {
	switch {
	case r >= 0x3400 && r <= 0x9FFF: // CJK 统一表意 + 扩展A
		return true
	case r >= 0xF900 && r <= 0xFAFF: // CJK 兼容表意
		return true
	case r >= 0x3000 && r <= 0x303F: // CJK 符号与标点(、。「」…)
		return true
	case r >= 0x3040 && r <= 0x30FF: // 平假名 + 片假名
		return true
	case r >= 0xFF00 && r <= 0xFFEF: // 全角 ASCII / 全角标点 / 半角片假名
		return true
	default:
		return false
	}
}

// isCrossRefKey [@key] 是交叉引用锚(fig:/tbl:/sec: 前缀 → \ref)而非文献引用(→ \cite)。
func isCrossRefKey(key string) bool {
	return strings.HasPrefix(key, "fig:") || strings.HasPrefix(key, "tbl:") || strings.HasPrefix(key, "sec:")
}

// tableToLatex 行×单元格 → 居中 tabular(单元格文本转义;math-in-cell 是边界,v1 按文本处理)。
// 题注按惯例在表**上方**;有 Label 时紧跟 \caption 出 \label(可被 [@tbl:x] → \ref 引用)。
func tableToLatex(blk Block) string {
	rows := blk.Rows
	if len(rows) == 0 {
		return ""
	}
	cols := 0
	for _, r := range rows {
		if len(r) > cols {
			cols = len(r)
		}
	}
	if cols == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString("\\begin{table}[htbp]\n\\centering\n")
	// 同 figure:有 Label 必须先出 \caption(哪怕空)让表计数器步进,否则 [@tbl:x]→\ref 抓到 section 号。
	if blk.Caption != "" || blk.Label != "" {
		fmt.Fprintf(&b, "\\caption{%s}\n", escapeLaTeX(blk.Caption))
		if blk.Label != "" {
			fmt.Fprintf(&b, "\\label{%s}\n", blk.Label)
		}
	}
	fmt.Fprintf(&b, "\\begin{tabular}{%s}\n\\hline\n", strings.Repeat("l", cols))
	for ri, r := range rows {
		cells := make([]string, cols)
		for c := 0; c < cols; c++ {
			if c < len(r) {
				cells[c] = escapeLaTeX(r[c])
			}
		}
		b.WriteString(strings.Join(cells, " & ") + " \\\\\n")
		if ri == 0 {
			b.WriteString("\\hline\n")
		}
	}
	b.WriteString("\\hline\n\\end{tabular}\n\\end{table}\n")
	return b.String()
}

func renderBib(bib map[string]string) string {
	keys := make([]string, 0, len(bib))
	for k := range bib {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	for _, k := range keys {
		b.WriteString(strings.TrimSpace(bib[k]))
		b.WriteString("\n\n")
	}
	return b.String()
}

// escapeLaTeX 转义纯文本里的 LaTeX 特殊字符(单遍替换,不二次转义)。
// cite key / 数学源 / opaque 原样 LaTeX 都不走这里。
func escapeLaTeX(s string) string {
	return latexEscaper.Replace(s)
}

var latexEscaper = strings.NewReplacer(
	"\\", "\\textbackslash{}",
	"&", "\\&",
	"%", "\\%",
	"$", "\\$",
	"#", "\\#",
	"_", "\\_",
	"{", "\\{",
	"}", "\\}",
	"~", "\\textasciitilde{}",
	"^", "\\textasciicircum{}",
)
