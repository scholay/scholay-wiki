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
			strings.Contains(t, "Runaway argument"),                      // 参数未闭合
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
