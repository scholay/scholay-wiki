// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 格式转换 MCP 工具
// 提供 Markdown、HTML 到 LaTeX 的转换功能

package mcp

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// ConvertToolProvider 格式转换工具提供者
type ConvertToolProvider struct{}

// NewConvertToolProvider 创建格式转换工具提供者
func NewConvertToolProvider() *ConvertToolProvider {
	return &ConvertToolProvider{}
}

// GetCategory 返回工具分类
func (p *ConvertToolProvider) GetCategory() ToolCategory {
	return CategoryConvert
}

// GetTools 返回工具定义列表
func (p *ConvertToolProvider) GetTools() []ToolDefinition {
	return []ToolDefinition{
		{
			Name:        "markdown_to_latex",
			Description: "将 Markdown 格式转换为 LaTeX 格式",
			Category:    CategoryConvert,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"markdown": map[string]any{
						"type":        "string",
						"description": "Markdown 内容",
					},
					"document_class": map[string]any{
						"type":        "string",
						"enum":        []string{"article", "report", "book", "beamer"},
						"description": "文档类型（默认 article）",
						"default":     "article",
					},
					"include_preamble": map[string]any{
						"type":        "boolean",
						"description": "是否包含完整的文档前言",
						"default":     false,
					},
				},
				"required": []string{"markdown"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
		{
			Name:        "html_to_latex",
			Description: "将 HTML 格式转换为 LaTeX 格式",
			Category:    CategoryConvert,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"html": map[string]any{
						"type":        "string",
						"description": "HTML 内容",
					},
					"include_preamble": map[string]any{
						"type":        "boolean",
						"description": "是否包含完整的文档前言",
						"default":     false,
					},
				},
				"required": []string{"html"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
		{
			Name:        "latex_to_markdown",
			Description: "将 LaTeX 格式转换为 Markdown 格式（简化转换）",
			Category:    CategoryConvert,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"latex": map[string]any{
						"type":        "string",
						"description": "LaTeX 内容",
					},
				},
				"required": []string{"latex"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
	}
}

// ExecuteTool 执行工具
func (p *ConvertToolProvider) ExecuteTool(ctx context.Context, name string, args map[string]any) (*ToolResult, error) {
	switch name {
	case "markdown_to_latex":
		return p.markdownToLaTeX(ctx, args)
	case "html_to_latex":
		return p.htmlToLaTeX(ctx, args)
	case "latex_to_markdown":
		return p.latexToMarkdown(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

// markdownToLaTeX 将 Markdown 转换为 LaTeX
func (p *ConvertToolProvider) markdownToLaTeX(ctx context.Context, args map[string]any) (*ToolResult, error) {
	markdown, ok := args["markdown"].(string)
	if !ok || markdown == "" {
		return CreateErrorResult(fmt.Errorf("markdown is required")), nil
	}

	includePreamble := false
	if ip, ok := args["include_preamble"].(bool); ok {
		includePreamble = ip
	}

	docClass := "article"
	if dc, ok := args["document_class"].(string); ok {
		docClass = dc
	}

	latex := convertMarkdownToLaTeX(markdown)

	if includePreamble {
		preamble := generateLaTeXPreamble(docClass)
		latex = preamble + "\n\\begin{document}\n\n" + latex + "\n\n\\end{document}"
	}

	return CreateSuccessResult(map[string]any{
		"latex":            latex,
		"document_class":   docClass,
		"include_preamble": includePreamble,
	}), nil
}

// htmlToLaTeX 将 HTML 转换为 LaTeX
func (p *ConvertToolProvider) htmlToLaTeX(ctx context.Context, args map[string]any) (*ToolResult, error) {
	html, ok := args["html"].(string)
	if !ok || html == "" {
		return CreateErrorResult(fmt.Errorf("html is required")), nil
	}

	includePreamble := false
	if ip, ok := args["include_preamble"].(bool); ok {
		includePreamble = ip
	}

	latex := convertHTMLToLaTeX(html)

	if includePreamble {
		preamble := generateLaTeXPreamble("article")
		latex = preamble + "\n\\begin{document}\n\n" + latex + "\n\n\\end{document}"
	}

	return CreateSuccessResult(map[string]any{
		"latex":            latex,
		"include_preamble": includePreamble,
	}), nil
}

// latexToMarkdown 将 LaTeX 转换为 Markdown
func (p *ConvertToolProvider) latexToMarkdown(ctx context.Context, args map[string]any) (*ToolResult, error) {
	latex, ok := args["latex"].(string)
	if !ok || latex == "" {
		return CreateErrorResult(fmt.Errorf("latex is required")), nil
	}

	markdown := convertLaTeXToMarkdown(latex)

	return CreateSuccessResult(map[string]any{
		"markdown": markdown,
	}), nil
}

// ============================================================================
// 转换函数
// ============================================================================

// convertMarkdownToLaTeX 将 Markdown 转换为 LaTeX
func convertMarkdownToLaTeX(md string) string {
	result := md

	// 标题转换
	result = regexp.MustCompile(`(?m)^######\s+(.+)$`).ReplaceAllString(result, `\subparagraph{$1}`)
	result = regexp.MustCompile(`(?m)^#####\s+(.+)$`).ReplaceAllString(result, `\paragraph{$1}`)
	result = regexp.MustCompile(`(?m)^####\s+(.+)$`).ReplaceAllString(result, `\subsubsection{$1}`)
	result = regexp.MustCompile(`(?m)^###\s+(.+)$`).ReplaceAllString(result, `\subsection{$1}`)
	result = regexp.MustCompile(`(?m)^##\s+(.+)$`).ReplaceAllString(result, `\section{$1}`)
	result = regexp.MustCompile(`(?m)^#\s+(.+)$`).ReplaceAllString(result, `\chapter{$1}`)

	// 粗体和斜体
	result = regexp.MustCompile(`\*\*\*(.+?)\*\*\*`).ReplaceAllString(result, `\textbf{\textit{$1}}`)
	result = regexp.MustCompile(`\*\*(.+?)\*\*`).ReplaceAllString(result, `\textbf{$1}`)
	result = regexp.MustCompile(`\*(.+?)\*`).ReplaceAllString(result, `\textit{$1}`)
	result = regexp.MustCompile(`_(.+?)_`).ReplaceAllString(result, `\textit{$1}`)

	// 行内代码
	result = regexp.MustCompile("`([^`]+)`").ReplaceAllString(result, `\texttt{$1}`)

	// 代码块
	result = regexp.MustCompile("(?s)```(\\w*)\\n(.+?)```").ReplaceAllStringFunc(result, func(match string) string {
		re := regexp.MustCompile("(?s)```(\\w*)\\n(.+?)```")
		parts := re.FindStringSubmatch(match)
		lang := parts[1]
		code := parts[2]
		if lang != "" {
			return fmt.Sprintf("\\begin{lstlisting}[language=%s]\n%s\\end{lstlisting}", lang, code)
		}
		return fmt.Sprintf("\\begin{verbatim}\n%s\\end{verbatim}", code)
	})

	// 链接
	result = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`).ReplaceAllString(result, `\href{$2}{$1}`)

	// 图片
	result = regexp.MustCompile(`!\[([^\]]*)\]\(([^)]+)\)`).ReplaceAllString(result, `\begin{figure}[h]
\centering
\includegraphics[width=0.8\textwidth]{$2}
\caption{$1}
\end{figure}`)

	// 无序列表
	result = convertMarkdownList(result, false)

	// 有序列表
	result = convertMarkdownList(result, true)

	// 引用
	result = regexp.MustCompile(`(?m)^>\s+(.+)$`).ReplaceAllString(result, `\begin{quote}
$1
\end{quote}`)

	// 水平线
	result = regexp.MustCompile(`(?m)^---+$`).ReplaceAllString(result, `\hrulefill`)
	result = regexp.MustCompile(`(?m)^\*\*\*+$`).ReplaceAllString(result, `\hrulefill`)

	// 数学公式（保持不变）
	// $$...$$ 已经是 LaTeX 格式

	return result
}

// convertMarkdownList 转换 Markdown 列表
func convertMarkdownList(content string, ordered bool) string {
	lines := strings.Split(content, "\n")
	result := []string{}
	inList := false
	listEnv := "itemize"
	if ordered {
		listEnv = "enumerate"
	}

	listPattern := `^\s*[-*+]\s+(.+)$`
	if ordered {
		listPattern = `^\s*\d+\.\s+(.+)$`
	}
	re := regexp.MustCompile(listPattern)

	for _, line := range lines {
		if match := re.FindStringSubmatch(line); match != nil {
			if !inList {
				result = append(result, fmt.Sprintf("\\begin{%s}", listEnv))
				inList = true
			}
			result = append(result, fmt.Sprintf("  \\item %s", match[1]))
		} else {
			if inList {
				result = append(result, fmt.Sprintf("\\end{%s}", listEnv))
				inList = false
			}
			result = append(result, line)
		}
	}

	if inList {
		result = append(result, fmt.Sprintf("\\end{%s}", listEnv))
	}

	return strings.Join(result, "\n")
}

// convertHTMLToLaTeX 将 HTML 转换为 LaTeX
func convertHTMLToLaTeX(html string) string {
	result := html

	// 移除 HTML 注释
	result = regexp.MustCompile(`<!--[\s\S]*?-->`).ReplaceAllString(result, "")

	// 标题
	result = regexp.MustCompile(`<h1[^>]*>([^<]+)</h1>`).ReplaceAllString(result, `\chapter{$1}`)
	result = regexp.MustCompile(`<h2[^>]*>([^<]+)</h2>`).ReplaceAllString(result, `\section{$1}`)
	result = regexp.MustCompile(`<h3[^>]*>([^<]+)</h3>`).ReplaceAllString(result, `\subsection{$1}`)
	result = regexp.MustCompile(`<h4[^>]*>([^<]+)</h4>`).ReplaceAllString(result, `\subsubsection{$1}`)
	result = regexp.MustCompile(`<h5[^>]*>([^<]+)</h5>`).ReplaceAllString(result, `\paragraph{$1}`)
	result = regexp.MustCompile(`<h6[^>]*>([^<]+)</h6>`).ReplaceAllString(result, `\subparagraph{$1}`)

	// 文本格式
	result = regexp.MustCompile(`<strong>([^<]+)</strong>`).ReplaceAllString(result, `\textbf{$1}`)
	result = regexp.MustCompile(`<b>([^<]+)</b>`).ReplaceAllString(result, `\textbf{$1}`)
	result = regexp.MustCompile(`<em>([^<]+)</em>`).ReplaceAllString(result, `\textit{$1}`)
	result = regexp.MustCompile(`<i>([^<]+)</i>`).ReplaceAllString(result, `\textit{$1}`)
	result = regexp.MustCompile(`<code>([^<]+)</code>`).ReplaceAllString(result, `\texttt{$1}`)
	result = regexp.MustCompile(`<u>([^<]+)</u>`).ReplaceAllString(result, `\underline{$1}`)

	// 段落
	result = regexp.MustCompile(`<p[^>]*>([^<]+)</p>`).ReplaceAllString(result, "$1\n\n")

	// 链接
	result = regexp.MustCompile(`<a[^>]*href="([^"]+)"[^>]*>([^<]+)</a>`).ReplaceAllString(result, `\href{$1}{$2}`)

	// 图片
	result = regexp.MustCompile(`<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*/?\>`).ReplaceAllString(result, `\includegraphics{$1}`)

	// 列表
	result = regexp.MustCompile(`<ul[^>]*>`).ReplaceAllString(result, `\begin{itemize}`)
	result = regexp.MustCompile(`</ul>`).ReplaceAllString(result, `\end{itemize}`)
	result = regexp.MustCompile(`<ol[^>]*>`).ReplaceAllString(result, `\begin{enumerate}`)
	result = regexp.MustCompile(`</ol>`).ReplaceAllString(result, `\end{enumerate}`)
	result = regexp.MustCompile(`<li[^>]*>([^<]+)</li>`).ReplaceAllString(result, `\item $1`)

	// 引用
	result = regexp.MustCompile(`<blockquote[^>]*>([^<]+)</blockquote>`).ReplaceAllString(result, `\begin{quote}
$1
\end{quote}`)

	// 换行
	result = regexp.MustCompile(`<br\s*/?>`).ReplaceAllString(result, `\\\\`)

	// 水平线
	result = regexp.MustCompile(`<hr\s*/?>`).ReplaceAllString(result, `\hrulefill`)

	// 移除其他 HTML 标签
	result = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(result, "")

	// 转义特殊字符
	result = strings.ReplaceAll(result, "&amp;", `\&`)
	result = strings.ReplaceAll(result, "&lt;", `<`)
	result = strings.ReplaceAll(result, "&gt;", `>`)
	result = strings.ReplaceAll(result, "&nbsp;", `~`)

	return strings.TrimSpace(result)
}

// convertLaTeXToMarkdown 将 LaTeX 转换为 Markdown
func convertLaTeXToMarkdown(latex string) string {
	result := latex

	// 移除文档前言
	result = regexp.MustCompile(`(?s)\\documentclass.*?\\begin\{document\}`).ReplaceAllString(result, "")
	result = regexp.MustCompile(`\\end\{document\}`).ReplaceAllString(result, "")

	// 标题
	result = regexp.MustCompile(`\\chapter\{([^}]+)\}`).ReplaceAllString(result, "# $1")
	result = regexp.MustCompile(`\\section\{([^}]+)\}`).ReplaceAllString(result, "## $1")
	result = regexp.MustCompile(`\\subsection\{([^}]+)\}`).ReplaceAllString(result, "### $1")
	result = regexp.MustCompile(`\\subsubsection\{([^}]+)\}`).ReplaceAllString(result, "#### $1")
	result = regexp.MustCompile(`\\paragraph\{([^}]+)\}`).ReplaceAllString(result, "##### $1")

	// 文本格式
	result = regexp.MustCompile(`\\textbf\{([^}]+)\}`).ReplaceAllString(result, "**$1**")
	result = regexp.MustCompile(`\\textit\{([^}]+)\}`).ReplaceAllString(result, "*$1*")
	result = regexp.MustCompile(`\\emph\{([^}]+)\}`).ReplaceAllString(result, "*$1*")
	result = regexp.MustCompile(`\\texttt\{([^}]+)\}`).ReplaceAllString(result, "`$1`")
	result = regexp.MustCompile(`\\underline\{([^}]+)\}`).ReplaceAllString(result, "$1")

	// 链接
	result = regexp.MustCompile(`\\href\{([^}]+)\}\{([^}]+)\}`).ReplaceAllString(result, "[$2]($1)")
	result = regexp.MustCompile(`\\url\{([^}]+)\}`).ReplaceAllString(result, "<$1>")

	// 列表
	result = regexp.MustCompile(`\\begin\{itemize\}`).ReplaceAllString(result, "")
	result = regexp.MustCompile(`\\end\{itemize\}`).ReplaceAllString(result, "")
	result = regexp.MustCompile(`\\begin\{enumerate\}`).ReplaceAllString(result, "")
	result = regexp.MustCompile(`\\end\{enumerate\}`).ReplaceAllString(result, "")
	result = regexp.MustCompile(`\\item\s+`).ReplaceAllString(result, "- ")

	// 引用
	result = regexp.MustCompile(`\\begin\{quote\}`).ReplaceAllString(result, "> ")
	result = regexp.MustCompile(`\\end\{quote\}`).ReplaceAllString(result, "")

	// 数学公式
	result = regexp.MustCompile(`\\\[`).ReplaceAllString(result, "$$")
	result = regexp.MustCompile(`\\\]`).ReplaceAllString(result, "$$")

	// 移除常见 LaTeX 命令
	result = regexp.MustCompile(`\\maketitle`).ReplaceAllString(result, "")
	result = regexp.MustCompile(`\\tableofcontents`).ReplaceAllString(result, "")
	result = regexp.MustCompile(`\\newpage`).ReplaceAllString(result, "---")
	result = regexp.MustCompile(`\\clearpage`).ReplaceAllString(result, "---")

	return strings.TrimSpace(result)
}

// generateLaTeXPreamble 生成 LaTeX 前言
func generateLaTeXPreamble(docClass string) string {
	return fmt.Sprintf(`\documentclass[12pt]{%s}
\usepackage[utf8]{inputenc}
\usepackage[T1]{fontenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage{hyperref}
\usepackage{listings}
\usepackage{booktabs}
`, docClass)
}
