// ============================================================================
// Markdown ↔ struct 桥(agent 结构体协议)—— agent 编辑面向 Markdown,后端 parse 回结构体。
//
// 设计(见 REPORT.md Part III + agent README):agent 是 stateless-per-turn 执行器,在会话 cwd 里
// 用原生 Read/Edit/Write 改文件。struct 轨给它铺一份 document.md(structToEditorMarkdown),agent 改它,
// 轮末 ApplyRound 读回 document.md → parseEditorMarkdown → 合并进结构体(SaveStruct → 重投影 → 可重编译)。
// 这样 100% 复用既有 WS/round/流式/diff 设施,agent 侧无需新工具。
//
// 受限 markdown 方言(serialize/parse **互逆**):
//   frontmatter `---` 块:title / abstract / keywords(单行值)
//   正文:# 标题 / 段落 / - · 1. 列表 / $$..$$ 展示公式 / 行内 $..$ **粗** _斜_ [@key] 引用 / ```latex 兜底
// authors/affiliations/bibliography/targetTemplate **不进** agent 编辑面(由 V2 表单/文献库管),
// parse 时从既有结构体保留,绝不因 agent 编辑而丢。
// ============================================================================

package prism

import (
	"fmt"
	"strings"
)

// EditorDocFile —— struct 轨铺给 agent 编辑的 markdown 文件名(cwd 内)。
const EditorDocFile = "document.md"

// BibFile —— struct 轨铺给 agent 编辑的参考文献 BibTeX 文件名(cwd 内)。agent 把它经 minicod MCP 查到的
// 真实论文写成 BibTeX 条目放这里,正文用 [@key] 引用;轮末解析回 DocStruct.Bibliography(反幻觉:数据真实)。
const BibFile = "references.bib"

// TerminologyFile —— 项目级术语表(V4-④ 双语工作流):DB 真源(prism_projects.terminology)轮前物化到
// cwd,agent 翻译时作 soft constraint 并把首译写回;轮末 applyStructRound 回收进 DB。
const TerminologyFile = "terminology.md"

// structToEditorMarkdown 结构体 → agent 可编辑 markdown。
func structToEditorMarkdown(d *DocStruct) string {
	var b strings.Builder
	fm := d.FrontMatter
	b.WriteString("---\n")
	fmt.Fprintf(&b, "title: %s\n", oneLine(fm.Title))
	if strings.TrimSpace(fm.Abstract) != "" {
		fmt.Fprintf(&b, "abstract: %s\n", oneLine(fm.Abstract))
	}
	if len(fm.Keywords) > 0 {
		fmt.Fprintf(&b, "keywords: %s\n", strings.Join(fm.Keywords, ", "))
	}
	b.WriteString("---\n\n")
	b.WriteString(bodyToEditorMarkdown(d.Body))
	return b.String()
}

func bodyToEditorMarkdown(blocks []Block) string {
	var parts []string
	for _, blk := range blocks {
		switch blk.Type {
		case BlockHeading:
			lvl := blk.Level
			if lvl < 1 {
				lvl = 1
			}
			if lvl > 4 {
				lvl = 4
			}
			head := strings.Repeat("#", lvl) + " " + blk.Text
			if blk.Label != "" {
				head += " {#" + blk.Label + "}" // 交叉引用锚(可被 [@sec:x] 引用)
			}
			parts = append(parts, head)
		case BlockParagraph:
			parts = append(parts, inlinesToEditorMd(blk.Inlines))
		case BlockDisplayMath:
			// V3-4.2-3:公式打锚 → 闭合 $$ 后带 {#eq:x},正文用 [@eq:x] 交叉引用(projector 出 \label/\ref)。
			closing := "$$"
			if blk.Label != "" {
				closing = "$$ {#" + blk.Label + "}"
			}
			parts = append(parts, "$$\n"+strings.TrimSpace(blk.Latex)+"\n"+closing)
		case BlockList:
			var ls []string
			for i, it := range blk.Items {
				pfx := "- "
				if blk.Ordered {
					pfx = fmt.Sprintf("%d. ", i+1)
				}
				ls = append(ls, pfx+inlinesToEditorMd(it))
			}
			parts = append(parts, strings.Join(ls, "\n"))
		case BlockTable:
			tbl := tableToMarkdown(blk.Rows)
			if blk.Caption != "" || blk.Label != "" {
				capLine := "表: " + blk.Caption // 题注写在表正下方一行(可带 {#tbl:x} 锚)
				if blk.Label != "" {
					capLine += " {#" + blk.Label + "}"
				}
				tbl += "\n" + capLine
			}
			parts = append(parts, tbl)
		case BlockFigure:
			fig := "![图](" + blk.Asset
			if blk.Caption != "" {
				fig += " \"" + blk.Caption + "\"" // 空题注不塞 "figure" 字面量(否则往返出 \caption{figure})
			}
			fig += ")"
			if blk.Label != "" {
				fig += "{#" + blk.Label + "}" // 交叉引用锚(可被 [@fig:x] 引用)
			}
			parts = append(parts, fig)
		case BlockOpaque:
			parts = append(parts, "```latex\n"+strings.TrimRight(blk.RawLatex, "\n")+"\n```")
		}
	}
	return strings.Join(parts, "\n\n") + "\n"
}

// editorTextEscaper 转义纯文本里会被 parseInlines 误当行内标记的字符(评审 #8):
// \ * _ $ [ —— 否则正文里字面的 a_b_c / $x$ / **粗** / [@ 往返时被解析成斜体/公式/粗体/引用,破坏内容。
// parseInlines 侧以反斜杠转义还原(见 isMdEscapable)。strings.NewReplacer 单趟替换、不回扫,不会重复转义。
var editorTextEscaper = strings.NewReplacer(
	`\`, `\\`,
	"*", `\*`,
	"_", `\_`,
	"$", `\$`,
	"[", `\[`,
)

func inlinesToEditorMd(inls []Inline) string {
	var b strings.Builder
	for i := 0; i < len(inls); i++ {
		in := inls[i]
		switch in.T {
		case InlineBold:
			fmt.Fprintf(&b, "**%s**", in.V)
		case InlineItalic:
			fmt.Fprintf(&b, "_%s_", in.V)
		case InlineCite:
			// 交叉引用锚(fig:/tbl:/sec:…)各自成 [@key],不与文献引用合并。
			if isCrossRefKey(in.Key) {
				fmt.Fprintf(&b, "[@%s]", in.Key)
				break
			}
			// 相邻文献引用合并成 pandoc 多引用 [@a; @b];顺带经 splitCiteKeys 把历史复合键拆干净
			// (存量结构体材质化成 document.md 时自愈,agent 看到的永远是规范形式)。
			keys := splitCiteKeys(in.Key)
			for i+1 < len(inls) && inls[i+1].T == InlineCite && !isCrossRefKey(inls[i+1].Key) {
				i++
				keys = append(keys, splitCiteKeys(inls[i].Key)...)
			}
			if len(keys) > 0 {
				fmt.Fprintf(&b, "[@%s]", strings.Join(keys, "; @"))
			}
		case InlineMath:
			fmt.Fprintf(&b, "$%s$", in.Latex)
		default:
			b.WriteString(editorTextEscaper.Replace(in.V))
		}
	}
	return b.String()
}

// isMdEscapable 反斜杠后跟这些标点时按转义还原成字面字符(与 editorTextEscaper 对称,并兼容 agent 手写的
// 标准 markdown 转义)。对 \alpha 这类「反斜杠后非标点」保留反斜杠(符合 CommonMark),不吞 LaTeX 命令。
func isMdEscapable(c rune) bool {
	switch c {
	case '\\', '*', '_', '$', '[', ']', '`', '(', ')', '#', '~':
		return true
	}
	return false
}

// parseEditorMarkdown 受限 markdown → (title, abstract, keywords, body)。互逆于 structToEditorMarkdown。
func parseEditorMarkdown(md string) (title, abstract string, keywords []string, body []Block) {
	lines := strings.Split(strings.ReplaceAll(md, "\r\n", "\n"), "\n")
	i := 0
	// frontmatter
	if i < len(lines) && strings.TrimSpace(lines[i]) == "---" {
		i++
		for i < len(lines) && strings.TrimSpace(lines[i]) != "---" {
			line := lines[i]
			i++
			idx := strings.Index(line, ":")
			if idx <= 0 {
				continue
			}
			k := strings.TrimSpace(line[:idx])
			v := strings.TrimSpace(line[idx+1:])
			switch k {
			case "title":
				title = v
			case "abstract":
				abstract = v
			case "keywords":
				for _, kw := range strings.Split(v, ",") {
					if t := strings.TrimSpace(kw); t != "" {
						keywords = append(keywords, t)
					}
				}
			}
		}
		if i < len(lines) {
			i++ // 跳过收尾 ---
		}
	}

	bid := 0
	nextID := func() string { bid++; return fmt.Sprintf("b%d", bid) }
	for i < len(lines) {
		t := strings.TrimSpace(lines[i])
		if t == "" {
			i++
			continue
		}
		switch {
		case strings.HasPrefix(t, "#"):
			lvl := 0
			for lvl < len(t) && t[lvl] == '#' {
				lvl++
			}
			text, label := splitLabelSuffix(strings.TrimSpace(t[lvl:]))
			body = append(body, Block{ID: nextID(), Type: BlockHeading, Level: lvl, Text: text, Label: label})
			i++
		case t == "$$":
			i++
			var mb []string
			label := ""
			for i < len(lines) {
				lt := strings.TrimSpace(lines[i])
				// V3-4.2-3:闭合行 $$ 可带 {#eq:x} 锚。
				if lt == "$$" || strings.HasPrefix(lt, "$$ ") || strings.HasPrefix(lt, "$${") {
					_, label = splitLabelSuffix(lt)
					i++
					break
				}
				mb = append(mb, lines[i])
				i++
			}
			body = append(body, Block{ID: nextID(), Type: BlockDisplayMath, Latex: strings.TrimSpace(strings.Join(mb, "\n")), Label: label})
		case strings.HasPrefix(t, "```"):
			lang := strings.ToLower(strings.TrimSpace(t[3:])) // 围栏 info string(语言标)
			i++
			var cb []string
			for i < len(lines) && !strings.HasPrefix(strings.TrimSpace(lines[i]), "```") {
				cb = append(cb, lines[i])
				i++
			}
			if i < len(lines) {
				i++
			}
			raw := strings.Join(cb, "\n")
			// V3-4.2-3:非 LaTeX 围栏(如 ```python)原样当 LaTeX 注入必炸 → 包 verbatim 安全渲成代码块。
			//   idempotent:序列化时 opaque 仍以 ```latex 包出,再解析 lang=latex 原样保留 verbatim 包裹。
			if lang != "" && lang != "latex" && lang != "tex" {
				raw = "\\begin{verbatim}\n" + raw + "\n\\end{verbatim}"
			}
			body = append(body, Block{ID: nextID(), Type: BlockOpaque, RawLatex: raw})
		case looksLikeFigureLine(t):
			// figure 行 ![alt](asset "caption"){#fig:x}。必须回收成 BlockFigure —— 否则落入 default 变段落文本,
			// 图连同 Asset/Caption/Width/Label 全丢(往返不可逆的核心坑)。Width 不在 md 里,由 restoreBlockMeta
			// 按 Asset 匹配旧块回填;Label 现由行尾 {#fig:x} 直接带出(缺省时 restoreBlockMeta 仍兜底回填)。
			figPart, label := splitLabelSuffix(t)
			asset, cap, _ := figureLine(figPart)
			body = append(body, Block{ID: nextID(), Type: BlockFigure, Asset: asset, Caption: cap, Label: label})
			i++
		case strings.HasPrefix(t, "|") && i+1 < len(lines) && isTableSeparator(strings.TrimSpace(lines[i+1])):
			var tl []string
			for i < len(lines) && strings.HasPrefix(strings.TrimSpace(lines[i]), "|") {
				tl = append(tl, strings.TrimSpace(lines[i]))
				i++
			}
			tbl := Block{ID: nextID(), Type: BlockTable, Rows: parseTableRows(tl)}
			// 表正下方紧跟一行 "表: 题注 {#tbl:x}" → 收为该表的题注 + 交叉引用锚。
			if i < len(lines) {
				if cap, lbl, isCap := parseTableCaptionLine(strings.TrimSpace(lines[i])); isCap {
					tbl.Caption, tbl.Label = cap, lbl
					i++
				}
			}
			body = append(body, tbl)
		case isListItem(t):
			ordered := !strings.HasPrefix(t, "- ")
			var items [][]Inline
			for i < len(lines) && isListItem(strings.TrimSpace(lines[i])) {
				items = append(items, parseInlines(stripListMarker(strings.TrimSpace(lines[i]))))
				i++
			}
			body = append(body, Block{ID: nextID(), Type: BlockList, Ordered: ordered, Items: items})
		default:
			var pl []string
			for i < len(lines) {
				lt := strings.TrimSpace(lines[i])
				if lt == "" || strings.HasPrefix(lt, "#") || lt == "$$" || strings.HasPrefix(lt, "```") || isListItem(lt) {
					break
				}
				pl = append(pl, lines[i])
				i++
			}
			body = append(body, Block{ID: nextID(), Type: BlockParagraph, Inlines: parseInlines(strings.Join(pl, " "))})
		}
	}
	return
}

// splitCiteKeys 把 [@...] 括号里的内容拆成多个**干净**的 citekey。
//   - pandoc 多引用 "a; @b; @c" → ["a","b","c"]
//   - 历史结构体里被误当单键存下的复合键 "ayano2020; @brown2012" → ["ayano2020","brown2012"](自愈)
//   - 普通单键 "a" → ["a"];纯空 / "[@]" → nil
// 规则:按 ; , 及空白切分,去掉每段前导 @,过滤空段。citekey 本身不含这些字符,故对正常键无副作用。
// 投影(projector \cite / docx 引用)与解析(parseInlines)共用它,保证「一个 InlineCite = 一个键」不变量。
func splitCiteKeys(raw string) []string {
	parts := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ';' || r == ',' || r == ' ' || r == '\t' || r == '\n'
	})
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimPrefix(p, "@")
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// parseInlines 左→右扫描行内标记($..$ / [@key] / **粗** / _斜_),其余归 text。
func parseInlines(s string) []Inline {
	var out []Inline
	var text strings.Builder
	flush := func() {
		if text.Len() > 0 {
			out = append(out, Inline{T: InlineText, V: text.String()})
			text.Reset()
		}
	}
	r := []rune(s)
	i := 0
	for i < len(r) {
		switch {
		case r[i] == '\\' && i+1 < len(r) && isMdEscapable(r[i+1]):
			// 反斜杠转义还原(评审 #8):\_ \* \$ \[ … → 字面字符,且必须先于下面的标记判断,
			// 否则被转义的 * _ $ [ 又会被当成行内标记。
			text.WriteRune(r[i+1])
			i += 2
			continue
		case r[i] == '$':
			if j := findRune(r, '$', i+1); j > 0 {
				flush()
				out = append(out, Inline{T: InlineMath, Latex: string(r[i+1 : j])})
				i = j + 1
				continue
			}
		case r[i] == '[' && i+1 < len(r) && r[i+1] == '@':
			if j := findRune(r, ']', i+2); j > 0 {
				flush()
				// pandoc 多引用 [@a; @b; @c] 必须拆成多个 InlineCite —— 否则整段会被当**单个**
				// cite key 存进结构体(如 "a; @b"),投影出 \cite{a; @b},bibtex 报「White space in
				// argument」直接失败,永远编不过(见 splitCiteKeys 注释 + P0 编译死循环根因)。
				for _, k := range splitCiteKeys(string(r[i+2 : j])) {
					out = append(out, Inline{T: InlineCite, Key: k})
				}
				i = j + 1
				continue
			}
		case r[i] == '*' && i+1 < len(r) && r[i+1] == '*':
			if j := findDouble(r, '*', i+2); j > 0 {
				flush()
				out = append(out, Inline{T: InlineBold, V: string(r[i+2 : j])})
				i = j + 2
				continue
			}
		case r[i] == '_':
			if j := findRune(r, '_', i+1); j > 0 {
				flush()
				out = append(out, Inline{T: InlineItalic, V: string(r[i+1 : j])})
				i = j + 1
				continue
			}
		}
		text.WriteRune(r[i])
		i++
	}
	flush()
	return out
}

func findRune(r []rune, c rune, from int) int {
	for j := from; j < len(r); j++ {
		if r[j] == c {
			return j
		}
	}
	return -1
}

func findDouble(r []rune, c rune, from int) int {
	for j := from; j+1 < len(r); j++ {
		if r[j] == c && r[j+1] == c {
			return j
		}
	}
	return -1
}

func isListItem(t string) bool {
	if strings.HasPrefix(t, "- ") {
		return true
	}
	i := 0
	for i < len(t) && t[i] >= '0' && t[i] <= '9' {
		i++
	}
	return i > 0 && i+1 < len(t) && t[i] == '.' && t[i+1] == ' '
}

func stripListMarker(t string) string {
	if strings.HasPrefix(t, "- ") {
		return t[2:]
	}
	i := 0
	for i < len(t) && t[i] >= '0' && t[i] <= '9' {
		i++
	}
	if i < len(t) && t[i] == '.' {
		i++
	}
	if i < len(t) && t[i] == ' ' {
		i++
	}
	return t[i:]
}

func oneLine(s string) string {
	return strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(s, "\r", " "), "\n", " "))
}

// ─── figure 行解析(与 bodyToEditorMarkdown 的 ![图](asset "caption") 互逆)──────────

func looksLikeFigureLine(t string) bool {
	return strings.HasPrefix(t, "![") && strings.Contains(t, "](")
}

// figureLine 解析 ![alt](asset "caption") → (asset, caption)。caption 可缺省。
func figureLine(t string) (asset, caption string, ok bool) {
	lp := strings.Index(t, "](")
	if lp < 0 {
		return "", "", false
	}
	rest := t[lp+2:]
	rp := strings.LastIndex(rest, ")")
	if rp < 0 {
		return "", "", false
	}
	inner := strings.TrimSpace(rest[:rp])
	if q := strings.Index(inner, "\""); q >= 0 {
		asset = strings.TrimSpace(inner[:q])
		caption = strings.Trim(strings.TrimSpace(inner[q:]), "\"")
	} else {
		asset = inner
	}
	return asset, caption, asset != ""
}

// splitLabelSuffix 从行尾拆出 {#label} 交叉引用锚 → (去锚正文, label);无则 label="",正文原样返回。
// label 只认单 token(不含空白/花括号),避免把普通花括号内容误当锚。互逆于序列化的 " {#label}"。
func splitLabelSuffix(s string) (string, string) {
	s = strings.TrimRight(s, " \t")
	if !strings.HasSuffix(s, "}") {
		return s, ""
	}
	open := strings.LastIndex(s, "{#")
	if open < 0 {
		return s, ""
	}
	label := s[open+2 : len(s)-1]
	if label == "" || strings.ContainsAny(label, " \t{}") {
		return s, "" // 不像 label → 原样(不动花括号)
	}
	return strings.TrimRight(s[:open], " \t"), label
}

// parseTableCaptionLine 判断某行是否表题注行(表:/Table: 前缀 + 紧跟半角/全角冒号,可带 {#tbl:x} 锚)
// → (题注文本, label, 命中)。"表格…""Table 1:"(冒号不紧跟)等不命中,避免误伤普通段落。
func parseTableCaptionLine(s string) (caption, label string, ok bool) {
	for _, pfx := range []string{"表", "Table", "table"} {
		if !strings.HasPrefix(s, pfx) {
			continue
		}
		rest := s[len(pfx):]
		switch {
		case strings.HasPrefix(rest, ":"):
			rest = rest[1:]
		case strings.HasPrefix(rest, "："):
			rest = rest[len("："):]
		default:
			continue // "表" 后不是冒号 → 不是题注行(如 "表格…")
		}
		cap, lbl := splitLabelSuffix(strings.TrimSpace(rest))
		return cap, lbl, true
	}
	return "", "", false
}

// mergeEditorInto 把 agent 编辑回的 (title,abstract,keywords,body) 合并进既有结构体 d(原地改)。
// 守卫(防静默丢内容):title/abstract 空不覆盖、keywords 空不覆盖、body 空不整块替换 —— agent 在
// document.md 里漏写某字段(如 frontmatter 少了 abstract 行)时,不把真源里已有的值清空。
// body 非空时经 restoreBlockMeta 回填 markdown 往返丢失的结构元数据(figure.Width/Label、
// heading/displayMath.Label —— 交叉引用锚)。applyStructRound / pendingStructRound 共用此单一合并逻辑。
func mergeEditorInto(d *DocStruct, title, abstract string, keywords []string, body []Block) {
	if strings.TrimSpace(title) != "" {
		d.FrontMatter.Title = title
	}
	if strings.TrimSpace(abstract) != "" {
		d.FrontMatter.Abstract = abstract
	}
	if len(keywords) > 0 {
		d.FrontMatter.Keywords = keywords
	}
	if len(body) > 0 {
		d.Body = restoreBlockMeta(d.Body, body) // 读旧 d.Body 后再赋值,顺序不可换
	}
}

// applyEditorMarkdown 解析 agent 编辑回的 document.md 并合并进 d(原地改)。
func applyEditorMarkdown(d *DocStruct, md string) {
	title, abstract, keywords, body := parseEditorMarkdown(md)
	mergeEditorInto(d, title, abstract, keywords, body)
}

// restoreBlockMeta 把 markdown 往返丢失的结构元数据从旧块回填进新块:figure 按 Asset 回填
// Width/Label,heading 按 (level,text) 回填 Label,displayMath 按归一 Latex 回填 Label。
// 即:agent 没改动的块保住 \label 交叉引用锚与图宽;改动了的块(内容不匹配)自然重来(可接受)。
// 匹配用首次出现(Asset 逻辑上唯一;heading/math 同键极少见),仅在新块对应字段为空时回填。
func restoreBlockMeta(oldBlocks, newBlocks []Block) []Block {
	figByAsset := map[string]Block{}
	headByKey := map[string]string{}
	mathByLatex := map[string]string{}
	tblByRows := map[string]Block{}
	for _, b := range oldBlocks {
		switch b.Type {
		case BlockFigure:
			if b.Asset != "" {
				if _, dup := figByAsset[b.Asset]; !dup {
					figByAsset[b.Asset] = b
				}
			}
		case BlockHeading:
			// V3-4.2-2:键做空白归一化 —— agent 改了缩进/空格但文字实质未变时,{#sec:x} 锚仍能回填。
			k := fmt.Sprintf("%d|%s", b.Level, normWS(b.Text))
			if _, dup := headByKey[k]; !dup {
				headByKey[k] = b.Label
			}
		case BlockDisplayMath:
			k := normWS(b.Latex)
			if _, dup := mathByLatex[k]; !dup {
				mathByLatex[k] = b.Label
			}
		case BlockTable:
			k := rowsKey(b.Rows)
			if _, dup := tblByRows[k]; !dup {
				tblByRows[k] = b
			}
		}
	}
	for i := range newBlocks {
		nb := &newBlocks[i]
		switch nb.Type {
		case BlockFigure:
			if ob, ok := figByAsset[nb.Asset]; ok {
				if nb.Width == "" {
					nb.Width = ob.Width
				}
				if nb.Label == "" {
					nb.Label = ob.Label
				}
			}
		case BlockHeading:
			if nb.Label == "" {
				if lbl := headByKey[fmt.Sprintf("%d|%s", nb.Level, normWS(nb.Text))]; lbl != "" {
					nb.Label = lbl
				}
			}
		case BlockDisplayMath:
			if nb.Label == "" {
				if lbl := mathByLatex[normWS(nb.Latex)]; lbl != "" {
					nb.Label = lbl
				}
			}
		case BlockTable:
			// 表题注/锚在 markdown 里靠「表: … {#tbl:x}」行,若那行被抖掉 → 按行内容回填(未改内容的表)。
			if nb.Caption == "" && nb.Label == "" {
				if ob, ok := tblByRows[rowsKey(nb.Rows)]; ok {
					nb.Caption, nb.Label = ob.Caption, ob.Label
				}
			}
		}
	}
	return newBlocks
}

// normWS 把连续空白归一为单空格并去首尾(restoreBlockMeta 模糊匹配用,V3-4.2-2)。
func normWS(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// rowsKey 把表格行×列压成稳定串(回填时判「同一张表」);用不可见分隔符避免与单元格文本冲突。
func rowsKey(rows [][]string) string {
	var b strings.Builder
	for _, r := range rows {
		b.WriteString(strings.Join(r, "\x1f"))
		b.WriteByte('\x1e')
	}
	return b.String()
}

// ─── GFM 表格 ────────────────────────────────────────────────────────────

// isTableSeparator 判断是否表格分隔行(|---|:---:|...)。
func isTableSeparator(s string) bool {
	if !strings.Contains(s, "-") {
		return false
	}
	for _, r := range s {
		if r != '|' && r != '-' && r != ':' && r != ' ' && r != '\t' {
			return false
		}
	}
	return strings.Contains(s, "|")
}

// parseTableRows 把连续的 | 行解析成行×单元格(跳过分隔行);rows[0]=表头。
func parseTableRows(lines []string) [][]string {
	var rows [][]string
	for _, ln := range lines {
		if isTableSeparator(ln) {
			continue
		}
		ln = strings.Trim(strings.TrimSpace(ln), "|")
		cells := strings.Split(ln, "|")
		for j := range cells {
			cells[j] = strings.TrimSpace(cells[j])
		}
		rows = append(rows, cells)
	}
	return rows
}

// tableToMarkdown 行×单元格 → GFM 表格 markdown(供 document.md / 渲染面)。
func tableToMarkdown(rows [][]string) string {
	if len(rows) == 0 {
		return ""
	}
	cols := 0
	for _, r := range rows {
		if len(r) > cols {
			cols = len(r)
		}
	}
	pad := func(r []string) []string {
		out := make([]string, cols)
		copy(out, r)
		return out
	}
	var b strings.Builder
	b.WriteString("| " + strings.Join(pad(rows[0]), " | ") + " |\n")
	seps := make([]string, cols)
	for i := range seps {
		seps[i] = "---"
	}
	b.WriteString("| " + strings.Join(seps, " | ") + " |\n")
	for _, r := range rows[1:] {
		b.WriteString("| " + strings.Join(pad(r), " | ") + " |\n")
	}
	return strings.TrimRight(b.String(), "\n")
}
