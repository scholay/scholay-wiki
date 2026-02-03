// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"fmt"
	"regexp"
	"strings"
)

// ValidationError LaTeX 验证错误
type ValidationError struct {
	Line    int    `json:"line"`
	Column  int    `json:"column,omitempty"`
	Type    string `json:"type"`    // error, warning
	Code    string `json:"code"`    // 错误代码
	Message string `json:"message"` // 错误描述
	Context string `json:"context"` // 上下文（相关代码片段）
}

// ValidationResult 验证结果
type ValidationResult struct {
	Valid    bool              `json:"valid"`
	Errors   []ValidationError `json:"errors"`
	Warnings []ValidationError `json:"warnings"`
	Summary  string            `json:"summary"`
}

// LatexValidator LaTeX 语法验证器
type LatexValidator struct{}

// NewLatexValidator 创建验证器
func NewLatexValidator() *LatexValidator {
	return &LatexValidator{}
}

// Validate 验证 LaTeX 代码
func (v *LatexValidator) Validate(content string) *ValidationResult {
	result := &ValidationResult{
		Valid:    true,
		Errors:   []ValidationError{},
		Warnings: []ValidationError{},
	}

	lines := strings.Split(content, "\n")

	// 0. 检查 Unicode/中文字符（最重要，优先检查）
	v.checkUnicodeCharacters(content, lines, result)

	// 1. 检查环境配对
	v.checkEnvironmentPairing(content, lines, result)

	// 2. 检查括号匹配
	v.checkBracketMatching(content, lines, result)

	// 3. 检查特殊字符
	v.checkSpecialCharacters(content, lines, result)

	// 4. 检查数学模式
	v.checkMathMode(content, lines, result)

	// 5. 检查常见命令错误
	v.checkCommonCommandErrors(content, lines, result)

	// 6. 检查参考文献
	v.checkBibliography(content, lines, result)

	// 7. 检查宏包使用
	v.checkPackageUsage(content, lines, result)

	// 生成摘要
	if len(result.Errors) > 0 {
		result.Valid = false
		result.Summary = fmt.Sprintf("发现 %d 个错误，%d 个警告", len(result.Errors), len(result.Warnings))
	} else if len(result.Warnings) > 0 {
		result.Summary = fmt.Sprintf("代码基本正确，但有 %d 个警告建议修复", len(result.Warnings))
	} else {
		result.Summary = "LaTeX 代码语法检查通过"
	}

	return result
}

// checkUnicodeCharacters 检查 Unicode 字符（中文、日文等非 ASCII 字符）
func (v *LatexValidator) checkUnicodeCharacters(content string, lines []string, result *ValidationResult) {
	// 检查是否包含中文字符
	chineseRegex := regexp.MustCompile(`[\x{4e00}-\x{9fff}\x{3400}-\x{4dbf}\x{f900}-\x{faff}]`)
	// 检查是否包含其他非 ASCII Unicode 字符
	nonASCIIRegex := regexp.MustCompile(`[^\x00-\x7F]`)

	// 检查是否加载了支持中文的宏包
	hasCTex := strings.Contains(content, "\\usepackage{ctex}") ||
		strings.Contains(content, "\\usepackage[") && strings.Contains(content, "ctex") ||
		strings.Contains(content, "\\documentclass{ctexart}") ||
		strings.Contains(content, "\\documentclass{ctexbook}") ||
		strings.Contains(content, "\\documentclass{ctexrep}")
	hasCJK := strings.Contains(content, "\\usepackage{CJK}") ||
		strings.Contains(content, "\\usepackage{CJKutf8}")
	hasXeCJK := strings.Contains(content, "\\usepackage{xeCJK}")
	hasFontspec := strings.Contains(content, "\\usepackage{fontspec}")

	// ⚠️ CTeX 宏包在在线编译器中不可用（缺少 fandol 字体）
	// 建议使用 xeCJK 替代
	if hasCTex {
		// 找到 ctex 所在行
		ctexLine := 1
		for i, line := range lines {
			if strings.Contains(line, "ctex") {
				ctexLine = i + 1
				break
			}
		}
		result.Errors = append(result.Errors, ValidationError{
			Line:    ctexLine,
			Type:    "error",
			Code:    "ENC010",
			Message: "ctex 宏包在在线编译器中不可用（缺少 fandol 字体）。请使用 xeCJK 宏包替代。",
			Context: "解决方案：将 \\usepackage{ctex} 替换为：\n\\usepackage{xeCJK}\n\\setCJKmainfont{Noto Serif CJK SC}\n\\setCJKsansfont{Noto Sans CJK SC}",
		})
	}

	// xeCJK 是支持的，不报错
	// 但如果有中文却没有 xeCJK，需要提示添加

	// 检查是否使用 XeLaTeX/LuaLaTeX 编译器（通过特定宏包推断）
	usesXeLaTeX := hasXeCJK || hasFontspec

	// 收集中文字符出现的位置
	chineseLines := []int{}
	nonASCIILines := []int{}

	for i, line := range lines {
		// 跳过注释行
		if strings.HasPrefix(strings.TrimSpace(line), "%") {
			continue
		}

		if chineseRegex.MatchString(line) {
			chineseLines = append(chineseLines, i+1)
		} else if nonASCIIRegex.MatchString(line) {
			nonASCIILines = append(nonASCIILines, i+1)
		}
	}

	// 如果有中文但没有中文支持包
	if len(chineseLines) > 0 && !hasCTex && !hasCJK && !hasXeCJK {
		// 找出前几个包含中文的行作为示例
		exampleLines := chineseLines
		if len(exampleLines) > 3 {
			exampleLines = exampleLines[:3]
		}

		lineStr := ""
		for i, l := range exampleLines {
			if i > 0 {
				lineStr += ", "
			}
			lineStr += fmt.Sprintf("%d", l)
		}
		if len(chineseLines) > 3 {
			lineStr += " 等"
		}

		result.Errors = append(result.Errors, ValidationError{
			Line:    chineseLines[0],
			Type:    "error",
			Code:    "ENC001",
			Message: fmt.Sprintf("文档包含中文字符（第 %s 行），但未加载中文支持宏包。", lineStr),
			Context: "解决方案：添加 xeCJK 宏包以支持中文：\n\\usepackage{xeCJK}\n\\setCJKmainfont{Noto Serif CJK SC}\n\\setCJKsansfont{Noto Sans CJK SC}\n\n注意：不要使用 ctex 宏包（在线编译器不支持其字体）",
		})
	}

	// 如果有其他非 ASCII 字符但没有 UTF-8 支持
	hasInputenc := strings.Contains(content, "\\usepackage[utf8]{inputenc}") ||
		strings.Contains(content, "\\usepackage{inputenc}")
	
	if len(nonASCIILines) > 0 && !hasInputenc && !usesXeLaTeX && !hasCTex {
		result.Warnings = append(result.Warnings, ValidationError{
			Line:    nonASCIILines[0],
			Type:    "warning",
			Code:    "ENC002",
			Message: "文档包含非 ASCII 字符，建议添加 \\usepackage[utf8]{inputenc} 或使用 XeLaTeX/LuaLaTeX 编译器",
		})
	}

	// 检查 inputenc 配合中文的错误使用
	if len(chineseLines) > 0 && hasInputenc && !hasCTex && !hasCJK && !hasXeCJK {
		result.Errors = append(result.Errors, ValidationError{
			Line:    chineseLines[0],
			Type:    "error",
			Code:    "ENC003",
			Message: "仅使用 inputenc 包无法支持中文字符。inputenc 的 utf8 选项在 pdfTeX 中不支持中文。",
			Context: "建议方案：将中文内容替换为英文，或使用 XeLaTeX 编译器配合 xeCJK 宏包",
		})
	}
}

// checkEnvironmentPairing 检查环境配对
func (v *LatexValidator) checkEnvironmentPairing(content string, lines []string, result *ValidationResult) {
	beginRegex := regexp.MustCompile(`\\begin\{([^}]+)\}`)
	endRegex := regexp.MustCompile(`\\end\{([^}]+)\}`)

	type envInfo struct {
		name string
		line int
	}

	stack := []envInfo{}

	for i, line := range lines {
		// 跳过注释行
		if strings.HasPrefix(strings.TrimSpace(line), "%") {
			continue
		}

		// 移除行内注释
		commentIdx := strings.Index(line, "%")
		if commentIdx > 0 && line[commentIdx-1] != '\\' {
			line = line[:commentIdx]
		}

		// 查找 \begin
		beginMatches := beginRegex.FindAllStringSubmatch(line, -1)
		for _, match := range beginMatches {
			stack = append(stack, envInfo{name: match[1], line: i + 1})
		}

		// 查找 \end
		endMatches := endRegex.FindAllStringSubmatch(line, -1)
		for _, match := range endMatches {
			envName := match[1]
			if len(stack) == 0 {
				result.Errors = append(result.Errors, ValidationError{
					Line:    i + 1,
					Type:    "error",
					Code:    "ENV001",
					Message: fmt.Sprintf("\\end{%s} 没有对应的 \\begin{%s}", envName, envName),
					Context: line,
				})
			} else {
				last := stack[len(stack)-1]
				if last.name != envName {
					result.Errors = append(result.Errors, ValidationError{
						Line:    i + 1,
						Type:    "error",
						Code:    "ENV002",
						Message: fmt.Sprintf("环境不匹配：期望 \\end{%s}（对应第 %d 行的 \\begin），但找到 \\end{%s}", last.name, last.line, envName),
						Context: line,
					})
				}
				stack = stack[:len(stack)-1]
			}
		}
	}

	// 检查未关闭的环境
	for _, env := range stack {
		result.Errors = append(result.Errors, ValidationError{
			Line:    env.line,
			Type:    "error",
			Code:    "ENV003",
			Message: fmt.Sprintf("\\begin{%s} 没有对应的 \\end{%s}", env.name, env.name),
			Context: lines[env.line-1],
		})
	}
}

// checkBracketMatching 检查括号匹配
func (v *LatexValidator) checkBracketMatching(content string, lines []string, result *ValidationResult) {
	for i, line := range lines {
		// 跳过注释行
		if strings.HasPrefix(strings.TrimSpace(line), "%") {
			continue
		}

		// 检查花括号
		braceCount := 0
		for j, ch := range line {
			if ch == '{' && (j == 0 || line[j-1] != '\\') {
				braceCount++
			} else if ch == '}' && (j == 0 || line[j-1] != '\\') {
				braceCount--
			}
			if braceCount < 0 {
				result.Errors = append(result.Errors, ValidationError{
					Line:    i + 1,
					Column:  j + 1,
					Type:    "error",
					Code:    "BRK001",
					Message: "多余的右花括号 '}'",
					Context: line,
				})
				break
			}
		}

		// 单行花括号不匹配只是警告（可能跨行）
		if braceCount > 0 && !strings.Contains(line, "\\begin") && !strings.Contains(line, "\\end") {
			// 检查是否是命令定义等跨行情况
			if !strings.HasSuffix(strings.TrimSpace(line), "{") {
				result.Warnings = append(result.Warnings, ValidationError{
					Line:    i + 1,
					Type:    "warning",
					Code:    "BRK002",
					Message: fmt.Sprintf("该行有 %d 个未闭合的左花括号（可能跨行闭合）", braceCount),
					Context: line,
				})
			}
		}
	}
}

// checkSpecialCharacters 检查特殊字符
func (v *LatexValidator) checkSpecialCharacters(content string, lines []string, result *ValidationResult) {
	// 需要转义的特殊字符及其正则
	specialChars := []struct {
		char    string
		regex   *regexp.Regexp
		message string
	}{
		{"%", regexp.MustCompile(`[^\\]%|^%`), "百分号 % 如果不是注释，需要转义为 \\%"},
		{"&", regexp.MustCompile(`[^\\]&`), "& 符号在非表格环境中需要转义为 \\&"},
		{"_", regexp.MustCompile(`[^\\$]_[^{]|[^\\$]_$`), "下划线 _ 在非数学模式中需要转义为 \\_"},
		{"#", regexp.MustCompile(`[^\\]#`), "井号 # 需要转义为 \\#"},
	}

	for i, line := range lines {
		// 跳过注释行（对于 % 检查）
		trimmedLine := strings.TrimSpace(line)

		for _, sc := range specialChars {
			// % 的特殊处理：整行注释是合法的
			if sc.char == "%" {
				if strings.HasPrefix(trimmedLine, "%") {
					continue
				}
				// 检查是否在命令或合法位置
				if sc.regex.MatchString(line) {
					// 进一步检查是否真的是问题
					idx := strings.Index(line, "%")
					if idx > 0 && line[idx-1] != '\\' {
						// 这是注释，跳过
						continue
					}
				}
			}

			// & 的特殊处理：在 tabular 等环境中合法
			if sc.char == "&" {
				// 简单检查：如果整个文档有 tabular/array 等，可能是合法的
				if strings.Contains(content, "\\begin{tabular}") ||
					strings.Contains(content, "\\begin{array}") ||
					strings.Contains(content, "\\begin{align") {
					continue
				}
			}

			if sc.regex.MatchString(line) {
				result.Warnings = append(result.Warnings, ValidationError{
					Line:    i + 1,
					Type:    "warning",
					Code:    "CHR001",
					Message: sc.message,
					Context: line,
				})
			}
		}
	}
}

// checkMathMode 检查数学模式
func (v *LatexValidator) checkMathMode(content string, lines []string, result *ValidationResult) {
	// 检查 $ 配对
	for i, line := range lines {
		// 跳过注释行
		if strings.HasPrefix(strings.TrimSpace(line), "%") {
			continue
		}

		dollarCount := 0
		inEscape := false
		for j := 0; j < len(line); j++ {
			if line[j] == '\\' {
				inEscape = true
				continue
			}
			if line[j] == '$' && !inEscape {
				dollarCount++
			}
			inEscape = false
		}

		if dollarCount%2 != 0 {
			result.Errors = append(result.Errors, ValidationError{
				Line:    i + 1,
				Type:    "error",
				Code:    "MTH001",
				Message: "行内数学模式 $ 未正确配对",
				Context: line,
			})
		}
	}

	// 检查 \[ \] 配对
	openDisplay := regexp.MustCompile(`\\\[`)
	closeDisplay := regexp.MustCompile(`\\\]`)
	openCount := len(openDisplay.FindAllString(content, -1))
	closeCount := len(closeDisplay.FindAllString(content, -1))
	if openCount != closeCount {
		result.Errors = append(result.Errors, ValidationError{
			Line:    0,
			Type:    "error",
			Code:    "MTH002",
			Message: fmt.Sprintf("行间公式 \\[ \\] 不配对：找到 %d 个 \\[ 和 %d 个 \\]", openCount, closeCount),
		})
	}
}

// checkCommonCommandErrors 检查常见命令错误
func (v *LatexValidator) checkCommonCommandErrors(content string, lines []string, result *ValidationResult) {
	// 常见的命令拼写错误
	typos := map[string]string{
		`\\begni`:       "\\begin 拼写错误",
		`\\ednl`:        "\\end 拼写错误",
		`\\sectino`:     "\\section 拼写错误",
		`\\subsectino`:  "\\subsection 拼写错误",
		`\\itme`:        "\\item 拼写错误",
		`\\textbf{`:     "", // 正确
		`\\texbf{`:      "\\textbf 拼写错误（缺少 t）",
		`\\emhp{`:       "\\emph 拼写错误",
		`\\includegraphcis`: "\\includegraphics 拼写错误",
		`\\usepackge`:   "\\usepackage 拼写错误",
		`\\docuemntclass`: "\\documentclass 拼写错误",
	}

	for typo, msg := range typos {
		if msg == "" {
			continue
		}
		regex := regexp.MustCompile(typo)
		for i, line := range lines {
			if regex.MatchString(line) {
				result.Errors = append(result.Errors, ValidationError{
					Line:    i + 1,
					Type:    "error",
					Code:    "CMD001",
					Message: msg,
					Context: line,
				})
			}
		}
	}

	// 检查 \cite 后面是否有 {}
	citeRegex := regexp.MustCompile(`\\cite\s*[^{]`)
	for i, line := range lines {
		if citeRegex.MatchString(line) {
			result.Warnings = append(result.Warnings, ValidationError{
				Line:    i + 1,
				Type:    "warning",
				Code:    "CMD002",
				Message: "\\cite 命令后应该跟 {key}",
				Context: line,
			})
		}
	}
}

// checkBibliography 检查参考文献
func (v *LatexValidator) checkBibliography(content string, lines []string, result *ValidationResult) {
	// 检查是否同时使用了 bibliographystyle 和 thebibliography
	hasBibStyle := strings.Contains(content, "\\bibliographystyle")
	hasTheBib := strings.Contains(content, "\\begin{thebibliography}")
	hasBib := strings.Contains(content, "\\bibliography{")

	if hasBibStyle && hasTheBib && !hasBib {
		for i, line := range lines {
			if strings.Contains(line, "\\bibliographystyle") {
				result.Warnings = append(result.Warnings, ValidationError{
					Line:    i + 1,
					Type:    "warning",
					Code:    "BIB001",
					Message: "使用 thebibliography 环境时不需要 \\bibliographystyle，可以删除此行",
					Context: line,
				})
				break
			}
		}
	}

	// 收集所有 \bibitem 定义的 key
	bibitemRegex := regexp.MustCompile(`\\bibitem\{([^}]+)\}`)
	bibitemKeys := make(map[string]int) // key -> line
	for i, line := range lines {
		matches := bibitemRegex.FindAllStringSubmatch(line, -1)
		for _, match := range matches {
			bibitemKeys[match[1]] = i + 1
		}
	}

	// 收集所有 \cite 引用的 key
	citeRegex := regexp.MustCompile(`\\cite\{([^}]+)\}`)
	for i, line := range lines {
		matches := citeRegex.FindAllStringSubmatch(line, -1)
		for _, match := range matches {
			// 可能有多个 key 用逗号分隔
			keys := strings.Split(match[1], ",")
			for _, key := range keys {
				key = strings.TrimSpace(key)
				if key != "" && len(bibitemKeys) > 0 {
					if _, exists := bibitemKeys[key]; !exists {
						result.Errors = append(result.Errors, ValidationError{
							Line:    i + 1,
							Type:    "error",
							Code:    "BIB002",
							Message: fmt.Sprintf("引用的文献 '%s' 未在 \\bibitem 中定义", key),
							Context: line,
						})
					}
				}
			}
		}
	}
}

// checkPackageUsage 检查宏包使用
func (v *LatexValidator) checkPackageUsage(content string, lines []string, result *ValidationResult) {
	// 收集已加载的宏包
	packageRegex := regexp.MustCompile(`\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}`)
	loadedPackages := make(map[string]bool)
	matches := packageRegex.FindAllStringSubmatch(content, -1)
	for _, match := range matches {
		// 可能有多个包用逗号分隔
		pkgs := strings.Split(match[1], ",")
		for _, pkg := range pkgs {
			loadedPackages[strings.TrimSpace(pkg)] = true
		}
	}

	// 命令到所需宏包的映射
	commandPackages := map[string]string{
		`\\includegraphics`: "graphicx",
		`\\textcolor`:       "xcolor 或 color",
		`\\href`:            "hyperref",
		`\\url`:             "hyperref 或 url",
		`\\toprule`:         "booktabs",
		`\\midrule`:         "booktabs",
		`\\bottomrule`:      "booktabs",
		`\\lstlisting`:      "listings",
		`\\mintedcode`:      "minted",
		`\\SI`:              "siunitx",
		`\\ce`:              "mhchem",
	}

	for cmd, pkg := range commandPackages {
		regex := regexp.MustCompile(cmd)
		if regex.MatchString(content) {
			// 检查是否加载了所需宏包
			pkgName := strings.Split(pkg, " ")[0] // 取第一个包名
			if !loadedPackages[pkgName] {
				result.Warnings = append(result.Warnings, ValidationError{
					Line:    0,
					Type:    "warning",
					Code:    "PKG001",
					Message: fmt.Sprintf("使用了 %s 命令但可能未加载 %s 宏包", strings.Replace(cmd, `\`, "", -1), pkg),
				})
			}
		}
	}
}

// FormatValidationResult 格式化验证结果为字符串
func (v *LatexValidator) FormatValidationResult(result *ValidationResult) string {
	if result.Valid && len(result.Warnings) == 0 {
		return "✅ LaTeX 代码验证通过，未发现语法问题。"
	}

	var sb strings.Builder
	sb.WriteString("📋 LaTeX 代码验证报告\n")
	sb.WriteString("=" + strings.Repeat("=", 40) + "\n\n")

	if len(result.Errors) > 0 {
		sb.WriteString(fmt.Sprintf("❌ 发现 %d 个错误：\n", len(result.Errors)))
		for i, err := range result.Errors {
			sb.WriteString(fmt.Sprintf("\n%d. [%s] 第 %d 行\n", i+1, err.Code, err.Line))
			sb.WriteString(fmt.Sprintf("   问题：%s\n", err.Message))
			if err.Context != "" {
				sb.WriteString(fmt.Sprintf("   代码：%s\n", strings.TrimSpace(err.Context)))
			}
		}
		sb.WriteString("\n")
	}

	if len(result.Warnings) > 0 {
		sb.WriteString(fmt.Sprintf("⚠️ 发现 %d 个警告：\n", len(result.Warnings)))
		for i, warn := range result.Warnings {
			if warn.Line > 0 {
				sb.WriteString(fmt.Sprintf("\n%d. [%s] 第 %d 行\n", i+1, warn.Code, warn.Line))
			} else {
				sb.WriteString(fmt.Sprintf("\n%d. [%s]\n", i+1, warn.Code))
			}
			sb.WriteString(fmt.Sprintf("   建议：%s\n", warn.Message))
			if warn.Context != "" {
				sb.WriteString(fmt.Sprintf("   代码：%s\n", strings.TrimSpace(warn.Context)))
			}
		}
	}

	return sb.String()
}
