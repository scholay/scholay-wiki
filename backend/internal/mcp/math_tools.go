// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 数学工具 MCP
// 提供 LaTeX 数学公式的验证、格式化、简化功能

package mcp

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// MathToolProvider 数学工具提供者
type MathToolProvider struct{}

// NewMathToolProvider 创建数学工具提供者
func NewMathToolProvider() *MathToolProvider {
	return &MathToolProvider{}
}

// GetCategory 返回工具分类
func (p *MathToolProvider) GetCategory() ToolCategory {
	return CategoryMath
}

// GetTools 返回工具定义列表
func (p *MathToolProvider) GetTools() []ToolDefinition {
	return []ToolDefinition{
		{
			Name:        "validate_math",
			Description: "验证 LaTeX 数学公式语法，检查括号匹配、环境配对、常见错误",
			Category:    CategoryMath,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"formula": map[string]any{
						"type":        "string",
						"description": "要验证的数学公式（可以是行内或块级）",
					},
				},
				"required": []string{"formula"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
		{
			Name:        "format_math",
			Description: "格式化 LaTeX 数学公式，统一风格和排版",
			Category:    CategoryMath,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"formula": map[string]any{
						"type":        "string",
						"description": "要格式化的数学公式",
					},
					"style": map[string]any{
						"type":        "string",
						"enum":        []string{"compact", "readable", "standard"},
						"description": "格式化风格：compact（紧凑）、readable（易读）、standard（标准）",
						"default":     "standard",
					},
				},
				"required": []string{"formula"},
			},
			IdempotentHint: true,
		},
		{
			Name:        "extract_math",
			Description: "从 LaTeX 文档中提取所有数学公式",
			Category:    CategoryMath,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"content": map[string]any{
						"type":        "string",
						"description": "LaTeX 文档内容",
					},
					"include_inline": map[string]any{
						"type":        "boolean",
						"description": "是否包含行内公式（$...$）",
						"default":     true,
					},
				},
				"required": []string{"content"},
			},
			ReadOnlyHint: true,
		},
		{
			Name:        "convert_math_delimiters",
			Description: "转换数学公式定界符格式（如 $...$ 和 \\(...\\) 互转）",
			Category:    CategoryMath,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"content": map[string]any{
						"type":        "string",
						"description": "包含数学公式的内容",
					},
					"target_format": map[string]any{
						"type":        "string",
						"enum":        []string{"dollar", "paren", "bracket"},
						"description": "目标格式：dollar（$/$$/）、paren（\\(\\)/\\[\\]）、bracket（\\begin{equation}）",
					},
				},
				"required": []string{"content", "target_format"},
			},
			IdempotentHint: true,
		},
		{
			Name:        "suggest_math_packages",
			Description: "根据公式内容建议需要的 LaTeX 宏包",
			Category:    CategoryMath,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"formula": map[string]any{
						"type":        "string",
						"description": "数学公式内容",
					},
				},
				"required": []string{"formula"},
			},
			ReadOnlyHint: true,
		},
	}
}

// ExecuteTool 执行工具
func (p *MathToolProvider) ExecuteTool(ctx context.Context, name string, args map[string]any) (*ToolResult, error) {
	switch name {
	case "validate_math":
		return p.validateMath(ctx, args)
	case "format_math":
		return p.formatMath(ctx, args)
	case "extract_math":
		return p.extractMath(ctx, args)
	case "convert_math_delimiters":
		return p.convertMathDelimiters(ctx, args)
	case "suggest_math_packages":
		return p.suggestMathPackages(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

// validateMath 验证数学公式
func (p *MathToolProvider) validateMath(ctx context.Context, args map[string]any) (*ToolResult, error) {
	formula, ok := args["formula"].(string)
	if !ok || formula == "" {
		return CreateErrorResult(fmt.Errorf("formula is required")), nil
	}

	errors := []string{}
	warnings := []string{}

	// 检查括号匹配
	bracketPairs := map[rune]rune{
		'{': '}',
		'(': ')',
		'[': ']',
	}
	stack := []rune{}
	for _, ch := range formula {
		for open, close := range bracketPairs {
			if ch == open {
				stack = append(stack, close)
			} else if ch == close {
				if len(stack) == 0 || stack[len(stack)-1] != close {
					errors = append(errors, fmt.Sprintf("括号不匹配: 多余的 '%c'", ch))
				} else {
					stack = stack[:len(stack)-1]
				}
			}
		}
	}
	if len(stack) > 0 {
		errors = append(errors, fmt.Sprintf("括号不匹配: 缺少 %d 个闭合括号", len(stack)))
	}

	// 检查 \left 和 \right 配对
	leftCount := len(regexp.MustCompile(`\\left[(\[{|.]`).FindAllString(formula, -1))
	rightCount := len(regexp.MustCompile(`\\right[)\]}|.]`).FindAllString(formula, -1))
	if leftCount != rightCount {
		errors = append(errors, fmt.Sprintf("\\left 和 \\right 不匹配: %d 个 \\left, %d 个 \\right", leftCount, rightCount))
	}

	// 检查数学环境配对
	envPatterns := []string{"equation", "align", "gather", "matrix", "bmatrix", "pmatrix", "cases"}
	for _, env := range envPatterns {
		beginCount := len(regexp.MustCompile(fmt.Sprintf(`\\begin\{%s\*?\}`, env)).FindAllString(formula, -1))
		endCount := len(regexp.MustCompile(fmt.Sprintf(`\\end\{%s\*?\}`, env)).FindAllString(formula, -1))
		if beginCount != endCount {
			errors = append(errors, fmt.Sprintf("环境 %s 不匹配: %d 个 \\begin, %d 个 \\end", env, beginCount, endCount))
		}
	}

	// 检查常见错误
	if strings.Contains(formula, "\\\\") && !strings.Contains(formula, "\\begin") {
		warnings = append(warnings, "行内公式中使用了 \\\\，这可能导致错误")
	}

	if regexp.MustCompile(`[a-zA-Z]{2,}`).MatchString(formula) {
		matches := regexp.MustCompile(`[a-zA-Z]{2,}`).FindAllString(formula, -1)
		for _, match := range matches {
			// 排除常见命令
			if !strings.HasPrefix(match, "\\") && 
			   match != "sin" && match != "cos" && match != "tan" && 
			   match != "log" && match != "ln" && match != "exp" &&
			   match != "lim" && match != "max" && match != "min" {
				warnings = append(warnings, fmt.Sprintf("多字母变量 '%s' 应该使用 \\text{%s} 或 \\mathrm{%s}", match, match, match))
			}
		}
	}

	return CreateSuccessResult(map[string]any{
		"valid":    len(errors) == 0,
		"errors":   errors,
		"warnings": warnings,
		"formula":  formula,
	}), nil
}

// formatMath 格式化数学公式
func (p *MathToolProvider) formatMath(ctx context.Context, args map[string]any) (*ToolResult, error) {
	formula, ok := args["formula"].(string)
	if !ok || formula == "" {
		return CreateErrorResult(fmt.Errorf("formula is required")), nil
	}

	style := "standard"
	if s, ok := args["style"].(string); ok {
		style = s
	}

	result := formula

	switch style {
	case "compact":
		// 移除多余空格
		result = regexp.MustCompile(`\s+`).ReplaceAllString(result, " ")
		result = strings.TrimSpace(result)
	case "readable":
		// 在操作符周围添加空格
		result = regexp.MustCompile(`([+\-*/=<>])`).ReplaceAllString(result, " $1 ")
		// 在逗号后添加空格
		result = strings.ReplaceAll(result, ",", ", ")
		// 清理多余空格
		result = regexp.MustCompile(`\s+`).ReplaceAllString(result, " ")
		result = strings.TrimSpace(result)
	case "standard":
		// 标准格式化
		result = regexp.MustCompile(`\s+`).ReplaceAllString(result, " ")
		// 统一分数格式
		result = regexp.MustCompile(`\\frac\s*\{`).ReplaceAllString(result, "\\frac{")
		result = strings.TrimSpace(result)
	}

	return CreateSuccessResult(map[string]any{
		"original":  formula,
		"formatted": result,
		"style":     style,
	}), nil
}

// extractMath 提取数学公式
func (p *MathToolProvider) extractMath(ctx context.Context, args map[string]any) (*ToolResult, error) {
	content, ok := args["content"].(string)
	if !ok || content == "" {
		return CreateErrorResult(fmt.Errorf("content is required")), nil
	}

	includeInline := true
	if inc, ok := args["include_inline"].(bool); ok {
		includeInline = inc
	}

	formulas := []map[string]any{}

	// 提取块级公式 $$...$$
	displayMatches := regexp.MustCompile(`\$\$[\s\S]+?\$\$`).FindAllStringIndex(content, -1)
	for _, match := range displayMatches {
		formulas = append(formulas, map[string]any{
			"type":     "display",
			"content":  content[match[0]:match[1]],
			"position": match[0],
		})
	}

	// 提取 \[...\] 块级公式
	bracketMatches := regexp.MustCompile(`\\\[[\s\S]+?\\\]`).FindAllStringIndex(content, -1)
	for _, match := range bracketMatches {
		formulas = append(formulas, map[string]any{
			"type":     "display",
			"content":  content[match[0]:match[1]],
			"position": match[0],
		})
	}

	// 提取 equation 环境
	envMatches := regexp.MustCompile(`\\begin\{equation\*?\}[\s\S]+?\\end\{equation\*?\}`).FindAllStringIndex(content, -1)
	for _, match := range envMatches {
		formulas = append(formulas, map[string]any{
			"type":     "equation",
			"content":  content[match[0]:match[1]],
			"position": match[0],
		})
	}

	// 提取行内公式
	if includeInline {
		// 单 $ 行内公式（排除 $$）
		inlineMatches := regexp.MustCompile(`(?<!\$)\$(?!\$)[^$]+?\$(?!\$)`).FindAllStringIndex(content, -1)
		for _, match := range inlineMatches {
			formulas = append(formulas, map[string]any{
				"type":     "inline",
				"content":  content[match[0]:match[1]],
				"position": match[0],
			})
		}

		// \(...\) 行内公式
		parenMatches := regexp.MustCompile(`\\\(.+?\\\)`).FindAllStringIndex(content, -1)
		for _, match := range parenMatches {
			formulas = append(formulas, map[string]any{
				"type":     "inline",
				"content":  content[match[0]:match[1]],
				"position": match[0],
			})
		}
	}

	return CreateSuccessResult(map[string]any{
		"count":    len(formulas),
		"formulas": formulas,
	}), nil
}

// convertMathDelimiters 转换数学定界符
func (p *MathToolProvider) convertMathDelimiters(ctx context.Context, args map[string]any) (*ToolResult, error) {
	content, ok := args["content"].(string)
	if !ok || content == "" {
		return CreateErrorResult(fmt.Errorf("content is required")), nil
	}

	targetFormat, ok := args["target_format"].(string)
	if !ok || targetFormat == "" {
		return CreateErrorResult(fmt.Errorf("target_format is required")), nil
	}

	result := content

	switch targetFormat {
	case "dollar":
		// 转换 \(...\) 到 $...$
		result = regexp.MustCompile(`\\\((.+?)\\\)`).ReplaceAllString(result, `$$$1$$`)
		// 转换 \[...\] 到 $$...$$
		result = regexp.MustCompile(`\\\[(.+?)\\\]`).ReplaceAllString(result, `$$$$$1$$$$`)
	case "paren":
		// 转换 $...$ 到 \(...\)
		result = regexp.MustCompile(`(?<!\$)\$(?!\$)([^$]+?)\$(?!\$)`).ReplaceAllString(result, `\\($1\\)`)
		// 转换 $$...$$ 到 \[...\]
		result = regexp.MustCompile(`\$\$(.+?)\$\$`).ReplaceAllString(result, `\\[$1\\]`)
	case "bracket":
		// 转换行内公式到 \(...\)
		result = regexp.MustCompile(`(?<!\$)\$(?!\$)([^$]+?)\$(?!\$)`).ReplaceAllString(result, `\\($1\\)`)
		// 转换块级公式到 \begin{equation}...\end{equation}
		result = regexp.MustCompile(`\$\$(.+?)\$\$`).ReplaceAllString(result, `\begin{equation}$1\end{equation}`)
	}

	return CreateSuccessResult(map[string]any{
		"original":      content,
		"converted":     result,
		"target_format": targetFormat,
	}), nil
}

// suggestMathPackages 建议数学宏包
func (p *MathToolProvider) suggestMathPackages(ctx context.Context, args map[string]any) (*ToolResult, error) {
	formula, ok := args["formula"].(string)
	if !ok || formula == "" {
		return CreateErrorResult(fmt.Errorf("formula is required")), nil
	}

	packages := []map[string]string{}

	// amsmath - 基本数学功能
	if regexp.MustCompile(`\\(align|gather|multline|split|cases|matrix|bmatrix|pmatrix|vmatrix)`).MatchString(formula) ||
		regexp.MustCompile(`\\(text|intertext|substack|overset|underset|sideset)`).MatchString(formula) {
		packages = append(packages, map[string]string{
			"name":        "amsmath",
			"reason":      "提供高级数学环境和命令",
			"declaration": "\\usepackage{amsmath}",
		})
	}

	// amssymb - 数学符号
	if regexp.MustCompile(`\\(mathbb|mathfrak|because|therefore|leqslant|geqslant)`).MatchString(formula) {
		packages = append(packages, map[string]string{
			"name":        "amssymb",
			"reason":      "提供额外的数学符号",
			"declaration": "\\usepackage{amssymb}",
		})
	}

	// amsthm - 定理环境
	if regexp.MustCompile(`\\(theorem|lemma|proof|qed)`).MatchString(formula) {
		packages = append(packages, map[string]string{
			"name":        "amsthm",
			"reason":      "提供定理环境",
			"declaration": "\\usepackage{amsthm}",
		})
	}

	// mathtools - 扩展 amsmath
	if regexp.MustCompile(`\\(dcases|rcases|prescript|coloneqq)`).MatchString(formula) {
		packages = append(packages, map[string]string{
			"name":        "mathtools",
			"reason":      "提供 amsmath 的扩展功能",
			"declaration": "\\usepackage{mathtools}",
		})
	}

	// physics - 物理公式
	if regexp.MustCompile(`\\(dv|pdv|dd|grad|div|curl|laplacian|bra|ket)`).MatchString(formula) {
		packages = append(packages, map[string]string{
			"name":        "physics",
			"reason":      "提供物理公式简写",
			"declaration": "\\usepackage{physics}",
		})
	}

	// siunitx - 单位
	if regexp.MustCompile(`\\(SI|si|num|unit|qty)`).MatchString(formula) {
		packages = append(packages, map[string]string{
			"name":        "siunitx",
			"reason":      "提供国际单位制支持",
			"declaration": "\\usepackage{siunitx}",
		})
	}

	return CreateSuccessResult(map[string]any{
		"formula":            formula,
		"suggested_packages": packages,
		"count":              len(packages),
	}), nil
}
