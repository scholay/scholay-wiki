// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// LaTeX MCP 工具
// 提供 LaTeX 验证、修复、格式化等功能

package mcp

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// LaTeXToolProvider LaTeX 工具提供者
type LaTeXToolProvider struct {
	validator *LaTeXValidator
}

// NewLaTeXToolProvider 创建 LaTeX 工具提供者
func NewLaTeXToolProvider() *LaTeXToolProvider {
	return &LaTeXToolProvider{
		validator: NewLaTeXValidator(),
	}
}

// GetCategory 返回工具分类
func (p *LaTeXToolProvider) GetCategory() ToolCategory {
	return CategoryLatex
}

// GetTools 返回工具定义列表
func (p *LaTeXToolProvider) GetTools() []ToolDefinition {
	return []ToolDefinition{
		{
			Name:        "validate_latex",
			Description: "验证 LaTeX 代码语法，检查环境配对、括号匹配、中文字符、特殊字符转义等问题",
			Category:    CategoryLatex,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"content": map[string]any{
						"type":        "string",
						"description": "要验证的 LaTeX 代码",
					},
				},
				"required": []string{"content"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
		{
			Name:        "fix_latex_errors",
			Description: "自动修复 LaTeX 代码中的常见语法错误",
			Category:    CategoryLatex,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"content": map[string]any{
						"type":        "string",
						"description": "要修复的 LaTeX 代码",
					},
					"errors": map[string]any{
						"type":        "array",
						"description": "验证器返回的错误列表（可选）",
						"items": map[string]any{
							"type": "object",
						},
					},
				},
				"required": []string{"content"},
			},
		},
		{
			Name:        "format_latex",
			Description: "格式化 LaTeX 代码，统一缩进和代码风格",
			Category:    CategoryLatex,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"content": map[string]any{
						"type":        "string",
						"description": "要格式化的 LaTeX 代码",
					},
					"indent_size": map[string]any{
						"type":        "integer",
						"description": "缩进空格数（默认 2）",
						"default":     2,
					},
				},
				"required": []string{"content"},
			},
		},
		{
			Name:        "extract_structure",
			Description: "提取 LaTeX 文档结构，返回章节、公式、图表、表格的层级结构",
			Category:    CategoryLatex,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"content": map[string]any{
						"type":        "string",
						"description": "LaTeX 文档内容",
					},
				},
				"required": []string{"content"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
		{
			Name:        "check_latex_packages",
			Description: "检查 LaTeX 文档中使用的命令是否有对应的宏包声明",
			Category:    CategoryLatex,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"content": map[string]any{
						"type":        "string",
						"description": "LaTeX 文档内容",
					},
				},
				"required": []string{"content"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
	}
}

// ExecuteTool 执行工具
func (p *LaTeXToolProvider) ExecuteTool(ctx context.Context, name string, args map[string]any) (*ToolResult, error) {
	switch name {
	case "validate_latex":
		return p.validateLaTeX(ctx, args)
	case "fix_latex_errors":
		return p.fixLaTeXErrors(ctx, args)
	case "format_latex":
		return p.formatLaTeX(ctx, args)
	case "extract_structure":
		return p.extractStructure(ctx, args)
	case "check_latex_packages":
		return p.checkPackages(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

// validateLaTeX 验证 LaTeX 代码
func (p *LaTeXToolProvider) validateLaTeX(ctx context.Context, args map[string]any) (*ToolResult, error) {
	content, ok := args["content"].(string)
	if !ok {
		return CreateErrorResult(fmt.Errorf("content is required")), nil
	}

	result := p.validator.Validate(content)
	return CreateSuccessResult(result), nil
}

// fixLaTeXErrors 修复 LaTeX 错误
func (p *LaTeXToolProvider) fixLaTeXErrors(ctx context.Context, args map[string]any) (*ToolResult, error) {
	content, ok := args["content"].(string)
	if !ok {
		return CreateErrorResult(fmt.Errorf("content is required")), nil
	}

	fixed := p.validator.AutoFix(content)
	
	// 再次验证修复后的代码
	validation := p.validator.Validate(fixed)
	
	return CreateSuccessResult(map[string]any{
		"original":   content,
		"fixed":      fixed,
		"validation": validation,
	}), nil
}

// formatLaTeX 格式化 LaTeX 代码
func (p *LaTeXToolProvider) formatLaTeX(ctx context.Context, args map[string]any) (*ToolResult, error) {
	content, ok := args["content"].(string)
	if !ok {
		return CreateErrorResult(fmt.Errorf("content is required")), nil
	}

	indentSize := 2
	if size, ok := args["indent_size"].(float64); ok {
		indentSize = int(size)
	}

	formatted := formatLaTeXCode(content, indentSize)
	return CreateSuccessResult(map[string]any{
		"formatted": formatted,
	}), nil
}

// extractStructure 提取文档结构
func (p *LaTeXToolProvider) extractStructure(ctx context.Context, args map[string]any) (*ToolResult, error) {
	content, ok := args["content"].(string)
	if !ok {
		return CreateErrorResult(fmt.Errorf("content is required")), nil
	}

	structure := extractDocumentStructure(content)
	return CreateSuccessResult(structure), nil
}

// checkPackages 检查宏包使用
func (p *LaTeXToolProvider) checkPackages(ctx context.Context, args map[string]any) (*ToolResult, error) {
	content, ok := args["content"].(string)
	if !ok {
		return CreateErrorResult(fmt.Errorf("content is required")), nil
	}

	result := p.validator.CheckPackageUsage(content)
	return CreateSuccessResult(result), nil
}

// ============================================================================
// LaTeX 验证器
// ============================================================================

// LaTeXValidator LaTeX 验证器
type LaTeXValidator struct{}

// NewLaTeXValidator 创建验证器
func NewLaTeXValidator() *LaTeXValidator {
	return &LaTeXValidator{}
}

// ValidationResult 验证结果
type ValidationResult struct {
	Valid    bool              `json:"valid"`
	Errors   []ValidationError `json:"errors"`
	Warnings []ValidationError `json:"warnings"`
	Summary  string            `json:"summary"`
}

// ValidationError 验证错误
type ValidationError struct {
	Line    int    `json:"line"`
	Column  int    `json:"column,omitempty"`
	Type    string `json:"type"` // error, warning
	Code    string `json:"code"`
	Message string `json:"message"`
	Context string `json:"context,omitempty"`
}

// Validate 验证 LaTeX 代码
func (v *LaTeXValidator) Validate(content string) *ValidationResult {
	result := &ValidationResult{
		Valid:    true,
		Errors:   []ValidationError{},
		Warnings: []ValidationError{},
	}

	lines := strings.Split(content, "\n")

	// 检查 Unicode/中文字符
	v.checkUnicodeCharacters(content, lines, result)

	// 检查环境配对
	v.checkEnvironmentPairing(content, lines, result)

	// 检查括号匹配
	v.checkBracketMatching(content, lines, result)

	// 检查数学模式
	v.checkMathMode(content, lines, result)

	// 检查常见命令错误
	v.checkCommonCommandErrors(content, lines, result)

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

// checkUnicodeCharacters 检查 Unicode 字符
func (v *LaTeXValidator) checkUnicodeCharacters(content string, lines []string, result *ValidationResult) {
	chineseRegex := regexp.MustCompile(`[\x{4e00}-\x{9fff}\x{3400}-\x{4dbf}]`)
	
	hasCTex := strings.Contains(content, "\\usepackage{ctex}") ||
		strings.Contains(content, "\\usepackage{xeCJK}") ||
		strings.Contains(content, "\\usepackage{CJKutf8}")

	chineseLines := []int{}
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "%") {
			continue
		}
		if chineseRegex.MatchString(line) {
			chineseLines = append(chineseLines, i+1)
		}
	}

	if len(chineseLines) > 0 && !hasCTex {
		result.Errors = append(result.Errors, ValidationError{
			Line:    chineseLines[0],
			Type:    "error",
			Code:    "ENC001",
			Message: fmt.Sprintf("文档包含中文字符（第 %d 行等），但未加载中文支持宏包", chineseLines[0]),
			Context: "建议：添加 \\usepackage{xeCJK} 或将中文替换为英文",
		})
	}
}

// checkEnvironmentPairing 检查环境配对
func (v *LaTeXValidator) checkEnvironmentPairing(content string, lines []string, result *ValidationResult) {
	beginRegex := regexp.MustCompile(`\\begin\{([^}]+)\}`)
	endRegex := regexp.MustCompile(`\\end\{([^}]+)\}`)

	type envInfo struct {
		name string
		line int
	}

	stack := []envInfo{}

	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "%") {
			continue
		}

		beginMatches := beginRegex.FindAllStringSubmatch(line, -1)
		for _, match := range beginMatches {
			stack = append(stack, envInfo{name: match[1], line: i + 1})
		}

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
						Message: fmt.Sprintf("环境不匹配：期望 \\end{%s}，但找到 \\end{%s}", last.name, envName),
						Context: line,
					})
				}
				stack = stack[:len(stack)-1]
			}
		}
	}

	for _, env := range stack {
		result.Errors = append(result.Errors, ValidationError{
			Line:    env.line,
			Type:    "error",
			Code:    "ENV003",
			Message: fmt.Sprintf("\\begin{%s} 没有对应的 \\end{%s}", env.name, env.name),
		})
	}
}

// checkBracketMatching 检查括号匹配
func (v *LaTeXValidator) checkBracketMatching(content string, lines []string, result *ValidationResult) {
	for i, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "%") {
			continue
		}

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
	}
}

// checkMathMode 检查数学模式
func (v *LaTeXValidator) checkMathMode(content string, lines []string, result *ValidationResult) {
	for i, line := range lines {
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
}

// checkCommonCommandErrors 检查常见命令错误
func (v *LaTeXValidator) checkCommonCommandErrors(content string, lines []string, result *ValidationResult) {
	typos := map[string]string{
		`\\begni`:       "\\begin 拼写错误",
		`\\sectino`:     "\\section 拼写错误",
		`\\subsectino`:  "\\subsection 拼写错误",
		`\\texbf{`:      "\\textbf 拼写错误（缺少 t）",
		`\\usepackge`:   "\\usepackage 拼写错误",
	}

	for typo, msg := range typos {
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
}

// CheckPackageUsage 检查宏包使用
func (v *LaTeXValidator) CheckPackageUsage(content string) map[string]any {
	packageRegex := regexp.MustCompile(`\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}`)
	loadedPackages := make(map[string]bool)
	matches := packageRegex.FindAllStringSubmatch(content, -1)
	for _, match := range matches {
		pkgs := strings.Split(match[1], ",")
		for _, pkg := range pkgs {
			loadedPackages[strings.TrimSpace(pkg)] = true
		}
	}

	commandPackages := map[string]string{
		`\\includegraphics`: "graphicx",
		`\\textcolor`:       "xcolor",
		`\\href`:            "hyperref",
		`\\url`:             "hyperref",
		`\\toprule`:         "booktabs",
		`\\midrule`:         "booktabs",
		`\\bottomrule`:      "booktabs",
	}

	missingPackages := []map[string]string{}
	for cmd, pkg := range commandPackages {
		regex := regexp.MustCompile(cmd)
		if regex.MatchString(content) && !loadedPackages[pkg] {
			missingPackages = append(missingPackages, map[string]string{
				"command": strings.Replace(cmd, `\`, "", -1),
				"package": pkg,
			})
		}
	}

	return map[string]any{
		"loaded_packages":  loadedPackages,
		"missing_packages": missingPackages,
	}
}

// AutoFix 自动修复 LaTeX 代码
func (v *LaTeXValidator) AutoFix(content string) string {
	fixed := content

	// 修复常见拼写错误
	fixes := map[string]string{
		`\begni{`:      `\begin{`,
		`\sectino{`:    `\section{`,
		`\subsectino{`: `\subsection{`,
		`\texbf{`:      `\textbf{`,
		`\usepackge{`:  `\usepackage{`,
	}

	for wrong, correct := range fixes {
		fixed = strings.ReplaceAll(fixed, wrong, correct)
	}

	return fixed
}

// ============================================================================
// 辅助函数
// ============================================================================

// formatLaTeXCode 格式化 LaTeX 代码
func formatLaTeXCode(content string, indentSize int) string {
	lines := strings.Split(content, "\n")
	indent := strings.Repeat(" ", indentSize)
	result := []string{}
	level := 0

	beginRegex := regexp.MustCompile(`\\begin\{`)
	endRegex := regexp.MustCompile(`\\end\{`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		
		// 减少缩进（在处理当前行之前）
		if endRegex.MatchString(trimmed) {
			level--
			if level < 0 {
				level = 0
			}
		}

		// 应用缩进
		if trimmed != "" {
			result = append(result, strings.Repeat(indent, level)+trimmed)
		} else {
			result = append(result, "")
		}

		// 增加缩进（在处理当前行之后）
		if beginRegex.MatchString(trimmed) {
			level++
		}
	}

	return strings.Join(result, "\n")
}

// DocumentStructure 文档结构
type DocumentStructure struct {
	Title      string            `json:"title,omitempty"`
	Author     string            `json:"author,omitempty"`
	Sections   []SectionInfo     `json:"sections"`
	Figures    []FigureInfo      `json:"figures"`
	Tables     []TableInfo       `json:"tables"`
	Equations  []EquationInfo    `json:"equations"`
	References []ReferenceInfo   `json:"references"`
}

// SectionInfo 章节信息
type SectionInfo struct {
	Level    int           `json:"level"` // 1=section, 2=subsection, 3=subsubsection
	Title    string        `json:"title"`
	Line     int           `json:"line"`
	Children []SectionInfo `json:"children,omitempty"`
}

// FigureInfo 图片信息
type FigureInfo struct {
	Label   string `json:"label,omitempty"`
	Caption string `json:"caption,omitempty"`
	Line    int    `json:"line"`
}

// TableInfo 表格信息
type TableInfo struct {
	Label   string `json:"label,omitempty"`
	Caption string `json:"caption,omitempty"`
	Line    int    `json:"line"`
}

// EquationInfo 公式信息
type EquationInfo struct {
	Label string `json:"label,omitempty"`
	Line  int    `json:"line"`
	Type  string `json:"type"` // inline, display, equation, align
}

// ReferenceInfo 引用信息
type ReferenceInfo struct {
	Key  string `json:"key"`
	Line int    `json:"line"`
}

// extractDocumentStructure 提取文档结构
func extractDocumentStructure(content string) *DocumentStructure {
	lines := strings.Split(content, "\n")
	structure := &DocumentStructure{
		Sections:   []SectionInfo{},
		Figures:    []FigureInfo{},
		Tables:     []TableInfo{},
		Equations:  []EquationInfo{},
		References: []ReferenceInfo{},
	}

	// 提取标题
	titleRegex := regexp.MustCompile(`\\title\{([^}]+)\}`)
	if match := titleRegex.FindStringSubmatch(content); len(match) > 1 {
		structure.Title = match[1]
	}

	// 提取作者
	authorRegex := regexp.MustCompile(`\\author\{([^}]+)\}`)
	if match := authorRegex.FindStringSubmatch(content); len(match) > 1 {
		structure.Author = match[1]
	}

	// 提取章节
	sectionRegex := regexp.MustCompile(`\\(section|subsection|subsubsection)\{([^}]+)\}`)
	for i, line := range lines {
		if match := sectionRegex.FindStringSubmatch(line); len(match) > 2 {
			level := 1
			switch match[1] {
			case "subsection":
				level = 2
			case "subsubsection":
				level = 3
			}
			structure.Sections = append(structure.Sections, SectionInfo{
				Level: level,
				Title: match[2],
				Line:  i + 1,
			})
		}
	}

	// 提取图片
	figureRegex := regexp.MustCompile(`\\begin\{figure\}`)
	labelRegex := regexp.MustCompile(`\\label\{([^}]+)\}`)
	captionRegex := regexp.MustCompile(`\\caption\{([^}]+)\}`)
	for i, line := range lines {
		if figureRegex.MatchString(line) {
			fig := FigureInfo{Line: i + 1}
			// 查找后续行中的 label 和 caption
			for j := i; j < len(lines) && j < i+10; j++ {
				if match := labelRegex.FindStringSubmatch(lines[j]); len(match) > 1 {
					fig.Label = match[1]
				}
				if match := captionRegex.FindStringSubmatch(lines[j]); len(match) > 1 {
					fig.Caption = match[1]
				}
				if strings.Contains(lines[j], `\end{figure}`) {
					break
				}
			}
			structure.Figures = append(structure.Figures, fig)
		}
	}

	// 提取表格
	tableRegex := regexp.MustCompile(`\\begin\{table\}`)
	for i, line := range lines {
		if tableRegex.MatchString(line) {
			tbl := TableInfo{Line: i + 1}
			for j := i; j < len(lines) && j < i+10; j++ {
				if match := labelRegex.FindStringSubmatch(lines[j]); len(match) > 1 {
					tbl.Label = match[1]
				}
				if match := captionRegex.FindStringSubmatch(lines[j]); len(match) > 1 {
					tbl.Caption = match[1]
				}
				if strings.Contains(lines[j], `\end{table}`) {
					break
				}
			}
			structure.Tables = append(structure.Tables, tbl)
		}
	}

	// 提取公式
	equationRegex := regexp.MustCompile(`\\begin\{(equation|align|gather|multline)\*?\}`)
	for i, line := range lines {
		if match := equationRegex.FindStringSubmatch(line); len(match) > 1 {
			eq := EquationInfo{Line: i + 1, Type: match[1]}
			for j := i; j < len(lines) && j < i+5; j++ {
				if match := labelRegex.FindStringSubmatch(lines[j]); len(match) > 1 {
					eq.Label = match[1]
					break
				}
			}
			structure.Equations = append(structure.Equations, eq)
		}
	}

	// 提取参考文献
	bibitemRegex := regexp.MustCompile(`\\bibitem\{([^}]+)\}`)
	for i, line := range lines {
		if match := bibitemRegex.FindStringSubmatch(line); len(match) > 1 {
			structure.References = append(structure.References, ReferenceInfo{
				Key:  match[1],
				Line: i + 1,
			})
		}
	}

	return structure
}
