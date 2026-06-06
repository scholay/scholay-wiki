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
		return "", ""
	}
	if firstLineNo != "" {
		summary = fmt.Sprintf("第 %s 行附近:%s", firstLineNo, firstMsg)
	} else {
		summary = firstMsg
	}
	if r := []rune(summary); len(r) > 120 {
		summary = string(r[:120])
	}
	excerpt = strings.Join(blocks, "\n\n")
	if r := []rune(excerpt); len(r) > 1800 { // 按 rune 截断,避免切坏 UTF-8(源码可能含中文)
		excerpt = string(r[:1800])
	}
	return summary, excerpt
}
