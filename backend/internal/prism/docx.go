// ============================================================================
// Word (.docx) 导出 —— struct → 干净 Markdown → Pandoc → docx(见 REPORT.md Part III §7.2)。
//   走 struct→Markdown→docx(非任意 LaTeX→docx):Pandoc 的 LaTeX reader 会静默跳过未知命令、
//   自定义宏毁公式;干净 Markdown 源则 $...$ 转成 Word 原生可编辑 OMML 公式。
//   pandoc 二进制已在 backend 镜像内(Dockerfile apk add pandoc)—— 在 backend 跑,不碰 prism_tex 沙箱。
// ============================================================================

package prism

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ExportDocx 结构体 → Markdown → Pandoc → .docx 字节。
func (s *Service) ExportDocx(ctx context.Context, projectID uint) ([]byte, error) {
	js, err := s.GetStruct(projectID)
	if err != nil {
		return nil, err
	}
	d, err := ParseDocStruct(js)
	if err != nil {
		return nil, err
	}
	// 图片二进制(与编译同源:MinIO,key=RelPath)→ 铺进 pandoc 临时目录,让 figure 内联成真图。
	// 失败则空 map → figure 回落文字占位(导出永不因取图失败而报错)。
	staged, _, _ := s.gatherAssets(ctx, projectID)
	// opaque 块(多为从旧 .tex 克隆来的整段正文)先尽力转成 Markdown:否则整段在 Word 里丢成占位符(评审 #5)。
	// 按块序号索引(ID 可能为空/重复,index 唯一);转失败的块不入表,bodyToMarkdown 回落占位符。
	opaque := map[int]string{}
	for i, blk := range d.Body {
		if blk.Type == BlockOpaque {
			if md, ok := latexFragmentToMarkdown(ctx, blk.RawLatex); ok {
				opaque[i] = md
			}
		}
	}
	return runPandocMDToDocx(ctx, structToMarkdown(d, staged, opaque), d.Bibliography, staged)
}

// latexFragmentToMarkdown 尽力把一段 opaque LaTeX 片段转成 Markdown(供 docx 主转换吸收)。仅用于 opaque
// 块 —— 它多是从旧 .tex 克隆来的**整段正文**,若不还原则 Word 导出会把整篇丢成一个「(AI 管理的区域)」占位符。
// pandoc 的 latex reader 会跳过不认识的宏、可能损坏自定义公式(见本文件顶部注释),但对 opaque 而言
// 「部分还原」远胜「整篇丢失」;失败 / 空 → ("", false),调用方回落占位符。走 stdin/stdout,不落临时文件。
func latexFragmentToMarkdown(ctx context.Context, raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false
	}
	cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, "pandoc", "-f", "latex", "-t", "markdown", "-o", "-")
	cmd.Stdin = strings.NewReader(raw)
	out, err := cmd.Output()
	if err != nil {
		return "", false
	}
	md := strings.TrimSpace(string(out))
	if md == "" {
		return "", false
	}
	return md, true
}

func runPandocMDToDocx(ctx context.Context, md string, bib map[string]string, staged map[string][]byte) ([]byte, error) {
	dir, err := os.MkdirTemp("", "prism-docx-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(dir)
	// 图片二进制写进临时目录(pandoc 相对 in.md 目录解析 ![](relPath) 并把图内联进 docx)。
	// filepath.Clean("/"+rel) 去掉 .. 段,防 RelPath 路径逃逸出临时目录。
	for rel, data := range staged {
		if len(data) == 0 {
			continue
		}
		p := filepath.Join(dir, filepath.Clean("/"+rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
			continue
		}
		_ = os.WriteFile(p, data, 0o600)
	}
	inPath := filepath.Join(dir, "in.md")
	outPath := filepath.Join(dir, "out.docx")
	if err := os.WriteFile(inPath, []byte(md), 0o600); err != nil {
		return nil, err
	}
	args := []string{inPath, "-f", "markdown", "-t", "docx", "-o", outPath, "--resource-path=" + dir}
	// 有参考文献 → 写临时 .bib + --citeproc:[@key] 解析成 Word 里的正式引用与文末参考文献表。
	if len(bib) > 0 {
		bibPath := filepath.Join(dir, "references.bib")
		if err := os.WriteFile(bibPath, []byte(renderBib(bib)), 0o600); err == nil {
			args = append(args, "--citeproc", "--bibliography="+bibPath)
		}
	}
	cctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(cctx, "pandoc", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("pandoc docx: %v: %s", err, strings.TrimSpace(string(out)))
	}
	return os.ReadFile(outPath)
}

// structToMarkdown 结构体 → 干净 Markdown(pandoc 源)。前置信息走 YAML 元数据块,
// 数学 $...$ 由 pandoc 转成 Word 原生 OMML 公式。staged=已铺进临时目录的图片(key=RelPath)。
// opaque=按块序号索引的、已尽力转好的 opaque 块 Markdown(评审 #5)。
func structToMarkdown(d *DocStruct, staged map[string][]byte, opaque map[int]string) string {
	var b strings.Builder
	fm := d.FrontMatter
	// 单位机构编号(评审 #10):affiliation.ID → 1-based 序号,用于作者名上标 + 文末单位列表。
	affNum := map[string]int{}
	for i, af := range fm.Affiliations {
		if strings.TrimSpace(af.ID) != "" {
			affNum[af.ID] = i + 1
		}
	}
	b.WriteString("---\n")
	fmt.Fprintf(&b, "title: %s\n", yamlEscape(fm.Title))
	if len(fm.Authors) > 0 {
		b.WriteString("author:\n")
		for _, a := range fm.Authors {
			name := authorName(a)
			// 作者名带单位上标(pandoc 把 author 元数据按 markdown inline 渲染,^1,2^ = 上标)。
			var marks []string
			for _, ref := range a.AffRefs {
				if n, ok := affNum[ref]; ok {
					marks = append(marks, fmt.Sprintf("%d", n))
				}
			}
			if len(marks) > 0 {
				name += "^" + strings.Join(marks, ",") + "^"
			}
			fmt.Fprintf(&b, "  - %s\n", yamlEscape(name))
		}
	}
	if strings.TrimSpace(fm.Abstract) != "" {
		fmt.Fprintf(&b, "abstract: %s\n", yamlEscape(fm.Abstract))
	}
	b.WriteString("---\n\n")
	// 单位机构:pandoc 默认 docx 模板不渲染结构化 affiliation → 显式渲一段可见的带上标编号单位列表(评审 #10)。
	for i, af := range fm.Affiliations {
		var seg []string
		for _, s := range []string{af.Department, af.Organization, af.City, af.Country} {
			if strings.TrimSpace(s) != "" {
				seg = append(seg, strings.TrimSpace(s))
			}
		}
		if len(seg) > 0 {
			fmt.Fprintf(&b, "^%d^ %s\n\n", i+1, strings.Join(seg, ", "))
		}
	}
	// 关键词:pandoc 不把 YAML keywords 渲进正文(只落 docx 属性,不可见)→ 显式渲一段可见的关键词。
	if len(fm.Keywords) > 0 {
		fmt.Fprintf(&b, "**关键词:** %s\n\n", strings.Join(fm.Keywords, ", "))
	}
	b.WriteString(bodyToMarkdown(d.Body, d.Assets, staged, opaque))
	return b.String()
}

func bodyToMarkdown(blocks []Block, assets map[string]DocAsset, staged map[string][]byte, opaque map[int]string) string {
	var parts []string
	for i, blk := range blocks {
		switch blk.Type {
		case BlockHeading:
			lvl := blk.Level
			if lvl < 1 {
				lvl = 1
			}
			if lvl > 5 {
				lvl = 5
			}
			parts = append(parts, strings.Repeat("#", lvl)+" "+blk.Text)
		case BlockParagraph:
			parts = append(parts, inlinesToMarkdown(blk.Inlines))
		case BlockDisplayMath:
			parts = append(parts, "$$\n"+wrapCJKInMath(blk.Latex)+"\n$$")
		case BlockList:
			var lines []string
			for i, it := range blk.Items {
				bullet := "-"
				if blk.Ordered {
					bullet = fmt.Sprintf("%d.", i+1)
				}
				lines = append(lines, bullet+" "+inlinesToMarkdown(it))
			}
			parts = append(parts, strings.Join(lines, "\n"))
		case BlockTable:
			parts = append(parts, tableToMarkdown(blk.Rows))
		case BlockFigure:
			// 有真图(资产已铺进临时目录)→ pandoc 内联图片 ![caption](relPath) 会成 Word 里的题注图;
			// 否则回落文字占位(旧行为)。
			rel := ""
			if a, ok := assets[blk.Asset]; ok {
				rel = strings.TrimSpace(a.RelPath)
			}
			if rel != "" && len(staged[rel]) > 0 {
				parts = append(parts, fmt.Sprintf("![%s](%s)", mdImgCaption(blk.Caption), rel))
			} else {
				cap := blk.Caption
				if cap == "" {
					cap = "插图"
				}
				parts = append(parts, "*[图:"+cap+"]*")
			}
		case BlockOpaque:
			// 尽力还原的 opaque Markdown(评审 #5);转失败/空则回落占位符(旧行为)。
			if md, ok := opaque[i]; ok && strings.TrimSpace(md) != "" {
				parts = append(parts, md)
			} else {
				parts = append(parts, "*(AI 管理的区域)*")
			}
		}
	}
	return strings.Join(parts, "\n\n") + "\n"
}

func inlinesToMarkdown(inls []Inline) string {
	var b strings.Builder
	for i := 0; i < len(inls); i++ {
		in := inls[i]
		switch in.T {
		case InlineBold:
			fmt.Fprintf(&b, "**%s**", in.V)
		case InlineItalic:
			fmt.Fprintf(&b, "_%s_", in.V)
		case InlineCite:
			// 交叉引用锚(fig:/tbl:/eq:… → 编译期是 \ref)在 docx 走 citeproc 会被当成找不到的文献、渲成破损红字。
			// 镜像内没有 pandoc-crossref 做自动编号,故降级成纯文本标记(如「fig:pipeline」),不喂 citeproc(评审 #6)。
			if isCrossRefKey(in.Key) {
				b.WriteString(in.Key)
				break
			}
			keys := []string{"@" + in.Key}
			for i+1 < len(inls) && inls[i+1].T == InlineCite && !isCrossRefKey(inls[i+1].Key) { // 只合并相邻**文献**引用 → [@a; @b]
				i++
				keys = append(keys, "@"+inls[i].Key)
			}
			fmt.Fprintf(&b, "[%s]", strings.Join(keys, "; ")) // pandoc citeproc 格式
		case InlineMath:
			fmt.Fprintf(&b, "$%s$", wrapCJKInMath(in.Latex))
		default:
			b.WriteString(in.V)
		}
	}
	return b.String()
}

// mdImgCaption 清洗图片 alt/caption —— 反斜杠转义 markdown 元字符,防题注里的
// 方括号(如引用角标「[12]」)截断 ![...] 导致图片内联失败,顺带避免 * _ ` 被当强调符。
func mdImgCaption(s string) string {
	return strings.TrimSpace(mdCaptionEscaper.Replace(s))
}

var mdCaptionEscaper = strings.NewReplacer(
	`\`, `\\`,
	"[", `\[`,
	"]", `\]`,
	"*", `\*`,
	"_", `\_`,
	"`", "\\`",
	"\n", " ",
	"\r", " ",
)

func yamlEscape(s string) string {
	return `"` + strings.ReplaceAll(strings.ReplaceAll(s, `\`, `\\`), `"`, `\"`) + `"`
}
