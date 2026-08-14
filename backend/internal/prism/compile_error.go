// ============================================================================
// Prism 编译错误提取 —— 从完整 LaTeX log 抠出「可定位」的错误信息。
//
// 背景:latexmk/pdflatex 失败时,容器写的友好摘要(error.txt)只有一句
//   "! Extra }, or forgotten $." —— 没有行号、没有出错源码。喂给 AI 修复时,它
//   定位不到"错在第几行的什么",只能瞎猜(实测:把 figure 的 \legend 逗号问题错怪成
//   \texttimes/\checkmark)。而完整 log 里其实有关键的 `l.NNN <源码>` 定位行。
//
// 本函数从完整 log 抠出错误块:`! 错误` + 上下文 + `l.NNN 源码` —— 既给 UI 红条
// 显示行号,又给 AI 精准定位修复。
// ============================================================================

package prism

import (
	"fmt"
	"regexp"
	"strings"
)

// lineNumRe 匹配 LaTeX log 的行号行,如 "l.380 \end{axis}"。
var lineNumRe = regexp.MustCompile(`^l\.(\d+)`)

// ── error_source 分类(2026-07 线上审计 #3)─────────────────────────────────
// 三类高频编译错误(bib 条目未闭合 / 期刊名裸 & / 作者名重音命令)全部源于 references.bib,
// 但自动修复回路把错误喂给 AI 改 document.md —— 结构性修不了,线上实测 6~11 轮不收敛白烧。
// 这里加 error_source 维度(body / bibliography / infra),供前端把 bibliography 类错误
// 分流出正文 auto-fix 回路。

const (
	compileSrcBody  = "body"         // 正文/模板 LaTeX 错(照旧回喂 AI 改 document.md)
	compileSrcBib   = "bibliography" // 源头在 references.bib(改正文修不了)
	compileSrcInfra = "infra"        // 基础设施/超时(error_kind 非 latex)
)

// bibErrSignals —— bibliography 家族信号:bibtex 自身报错 + 「错误上下文落在 bibtex 产物(.bbl)」的引擎错。
var bibErrSignals = []string{
	// bibtex 阶段直接报错(.bib 语法 / 条目畸形 / 引用键混空格)
	"I'm skipping whatever remains",
	"I was expecting",
	"White space in argument",
	"Something's wrong---perhaps",
	// 引擎错但上下文在参考文献:\newblock / \bibitem / thebibliography / .bbl / {\em(bst 斜体期刊名)
	// 只出现在 bibtex 生成的参考文献渲染里(正文投影用 \emph,不产 {\em )。
	"\\newblock",
	"\\bibitem",
	"thebibliography",
	".bbl",
	"{\\em ",
	// 2026-07 审查 [13]/[25]:"Misplaced alignment tab character &" 已从信号表**移除** ——
	// 它只在与上面那几条 .bbl 上下文特征共现时才判 bibliography(共现时由上面几条自然命中)。
	// 原理由「正文由投影器转义生成、裸 & 必已转义」对两类路径不成立:BlockOpaque 把 agent/用户
	// 的原样 LaTeX 直接写进正文;BlockDisplayMath 的 blk.Latex 也不转义(没写 aligned 的
	// $$ x &= y $$ 报的就是这条)。误判代价不对称:判成 bibliography 会**同时**换掉原始报错文案
	// 并撤掉「让 AI 修复」按钮(用户被锁死),判成 body 只是多回喂一次 AI —— 故无上下文证据时
	// 保守偏 body。.bib 裸 & 的真阳性形态(l.NNN 落在 .bbl 的 `\newblock {\em Soil &`)自带
	// 上下文特征,仍照常判 bibliography。
}

// classifyCompileErrorSource 由 error_kind + 已存的错误摘要/错误块推断 error_source。
// 读时派生(免迁移加列、向后兼容),对历史失败行同样生效;kind 为空(0072 前存量)按 latex 走信号判定。
func classifyCompileErrorSource(kind, summary, excerpt string) string {
	if kind != "" && kind != compileErrLatex {
		return compileSrcInfra
	}
	blob := summary + "\n" + excerpt
	for _, sig := range bibErrSignals {
		if strings.Contains(blob, sig) {
			return compileSrcBib
		}
	}
	return compileSrcBody
}

// undefCtrlSeqRe 抠出未定义命令名(如 "Undefined control sequence … \toprule" → "\toprule")。
// (?s):`.` 跨行 —— TeX 的 `! Undefined control sequence.` 行本身不含命令名,命令名在紧随的
// `<recently read> \cmd` / `l.NNN \cmd` 上下文行里,故必须在整个错误块(含换行)里找。
var undefCtrlSeqRe = regexp.MustCompile(`(?s)Undefined control sequence.*?(\\[A-Za-z@]+)`)

// extractNonBangError 抠「无 `! ` 前缀」的报错(bibtex/package/runaway/缺文件等窄类别),
// 让 bibtex 阶段失败也能给出可读 summary,而非回落到 latexmk 的无信息量总结。
func extractNonBangError(lines []string) string {
	for _, ln := range lines {
		t := strings.TrimSpace(ln)
		switch {
		case strings.Contains(t, "I was expecting"), // bibtex:.bib 语法错
			strings.Contains(t, "Something's wrong---perhaps a missing"), // bibtex
			strings.Contains(t, "White space in argument"),              // bibtex:\citation 键里有空格/分号(多引用没拆)
			strings.Contains(t, "I'm skipping whatever remains"),        // bibtex:承接上句,命令被跳过
			strings.Contains(t, "Runaway argument"),                     // 参数未闭合
			strings.HasPrefix(t, "Package ") && strings.Contains(t, " Error"), // 宏包错
			strings.Contains(t, "Fatal error"),
			strings.Contains(t, "not found"): // 缺 .sty/.cls/图片
			if r := []rune(t); len(r) > 120 {
				t = string(r[:120])
			}
			return t
		}
	}
	return ""
}

// friendlyHint 给 TeX 报错追加一句「可执行的中文原因」,让用户/AI 不用啃 TeX 术语。
// msg = 首条错误消息(判类型);context = 完整错误块(供抠具体命令名,命令名不在 msg 里而在块的续行)。
// 返回值带前导空格(直接拼在 summary 后),无匹配返回空串。
func friendlyHint(msg, context string) string {
	lm := strings.ToLower(msg)
	switch {
	case strings.Contains(msg, "Undefined control sequence"):
		if m := undefCtrlSeqRe.FindStringSubmatch(context); m != nil {
			return fmt.Sprintf("(命令 %s 未定义:可能拼写有误或缺对应宏包)", m[1])
		}
		return "(有命令未定义:可能拼写有误或缺对应宏包)"
	case strings.Contains(lm, "missing $"), strings.Contains(msg, "Extra }"),
		strings.Contains(lm, "missing }"), strings.Contains(lm, "extra alignment"):
		return "(数学公式或括号未配对:检查 $...$ 与 {} 是否闭合)"
	case strings.Contains(lm, "runaway argument"):
		return "(某命令参数未闭合:常见缺 } 或缺 \\end{...})"
	case strings.Contains(msg, "White space in argument"), strings.Contains(msg, "skipping whatever remains"):
		return "(引用键里混进了空格/分号:多引用应是 [@a; @b] 而非把它当一个键)"
	case strings.Contains(msg, "I was expecting"), strings.Contains(msg, "Something's wrong"):
		return "(参考文献 .bib 语法有误:某条目缺逗号或括号)"
	case strings.Contains(lm, "not found"):
		return "(缺少宏包或文件)"
	}
	return ""
}

// extractCompileError 从完整 log 抠错误:
//   - summary:一行带行号,给 UI 红条(如「第 380 行附近:Extra }, or forgotten $」)
//   - excerpt:最多 3 个错误块(! 错误 + l.NNN + 源码 + 上下文),给 AI 精准定位
//
// log 里没有 "! " 错误块时两者都返回空,调用方走友好兜底文案。
func extractCompileError(log string) (summary, excerpt string) {
	lines := strings.Split(log, "\n")
	var blocks []string
	firstLineNo := ""
	firstMsg := ""

	for i := 0; i < len(lines); i++ {
		if !strings.HasPrefix(lines[i], "! ") {
			continue
		}
		msg := strings.TrimSpace(strings.TrimPrefix(lines[i], "! "))
		// 收集本错误块:! 行 + 后续若干行,直到(含)l.NNN 行 + 紧跟的续行(出错列后的源码),最多 8 行。
		block := []string{lines[i]}
		lineNo := ""
		for j := i + 1; j < len(lines) && len(block) < 8; j++ {
			block = append(block, lines[j])
			if m := lineNumRe.FindStringSubmatch(lines[j]); m != nil {
				lineNo = m[1]
				if j+1 < len(lines) { // LaTeX 把出错列之后的源码放在 l.NNN 的下一行
					block = append(block, lines[j+1])
				}
				break
			}
		}
		blocks = append(blocks, strings.TrimRight(strings.Join(block, "\n"), " \n"))
		if firstMsg == "" {
			firstMsg = strings.TrimSuffix(msg, ".")
			firstLineNo = lineNo
		}
		if len(blocks) >= 3 {
			break
		}
	}

	if len(blocks) == 0 {
		// 无 `! ` 引擎错误块 —— 常见于 bibtex 阶段失败(.bib 语法错,bibtex 报 "I was expecting a ','",
		// 无 `! `、无大写 Error)、缺 .cls、fatal 无 `! ` 行等窄类别。抠一条有意义的行,避免返回空
		// → 回落到容器 error.txt 那句无信息量的 "Latexmk: Errors"。
		if s := extractNonBangError(lines); s != "" {
			s = s + friendlyHint(s, s)
			if r := []rune(s); len(r) > 160 {
				s = string(r[:160])
			}
			return s, s
		}
		return "", ""
	}
	if firstLineNo != "" {
		summary = fmt.Sprintf("第 %s 行附近:%s", firstLineNo, firstMsg)
	} else {
		summary = firstMsg
	}
	summary += friendlyHint(firstMsg, blocks[0]) // 追加可执行中文提示(命令名从整块抠;缺包/括号不配/bib 语法等)
	if r := []rune(summary); len(r) > 160 {
		summary = string(r[:160])
	}
	excerpt = strings.Join(blocks, "\n\n")
	if r := []rune(excerpt); len(r) > 1800 { // 按 rune 截断,避免切坏 UTF-8(源码可能含中文)
		excerpt = string(r[:1800])
	}
	return summary, excerpt
}
