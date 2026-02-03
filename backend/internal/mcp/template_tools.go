// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 模板工具 MCP
// 提供 LaTeX 期刊模板、格式检查功能

package mcp

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

// TemplateToolProvider 模板工具提供者
type TemplateToolProvider struct{}

// NewTemplateToolProvider 创建模板工具提供者
func NewTemplateToolProvider() *TemplateToolProvider {
	return &TemplateToolProvider{}
}

// GetCategory 返回工具分类
func (p *TemplateToolProvider) GetCategory() ToolCategory {
	return CategoryTemplate
}

// GetTools 返回工具定义列表
func (p *TemplateToolProvider) GetTools() []ToolDefinition {
	return []ToolDefinition{
		{
			Name:        "list_templates",
			Description: "列出可用的 LaTeX 论文模板（期刊、会议等）",
			Category:    CategoryTemplate,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"category": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"all", "journal", "conference", "thesis", "report"},
						"description": "模板类别",
						"default":     "all",
					},
					"field": map[string]interface{}{
						"type":        "string",
						"description": "学科领域（可选）：cs, physics, math, biology, etc.",
					},
				},
			},
			ReadOnlyHint: true,
		},
		{
			Name:        "get_template",
			Description: "获取指定模板的详细信息和使用示例",
			Category:    CategoryTemplate,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"template_id": map[string]interface{}{
						"type":        "string",
						"description": "模板 ID",
					},
				},
				"required": []string{"template_id"},
			},
			ReadOnlyHint: true,
		},
		{
			Name:        "check_format",
			Description: "检查 LaTeX 文档是否符合指定格式要求",
			Category:    CategoryTemplate,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"content": map[string]interface{}{
						"type":        "string",
						"description": "LaTeX 文档内容",
					},
					"template_id": map[string]interface{}{
						"type":        "string",
						"description": "目标模板 ID（可选，不指定则进行通用检查）",
					},
				},
				"required": []string{"content"},
			},
			ReadOnlyHint: true,
		},
		{
			Name:        "generate_preamble",
			Description: "根据需求生成 LaTeX 文档前言（\\documentclass 到 \\begin{document}）",
			Category:    CategoryTemplate,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"document_type": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"article", "report", "book", "beamer", "letter"},
						"description": "文档类型",
						"default":     "article",
					},
					"features": map[string]interface{}{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "需要的功能：math, graphics, tables, code, bibliography, etc.",
					},
					"language": map[string]interface{}{
						"type":        "string",
						"enum":        []string{"english", "chinese"},
						"description": "文档语言",
						"default":     "english",
					},
				},
				"required": []string{"document_type"},
			},
			IdempotentHint: true,
		},
		{
			Name:        "suggest_improvements",
			Description: "分析 LaTeX 文档并建议改进",
			Category:    CategoryTemplate,
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"content": map[string]interface{}{
						"type":        "string",
						"description": "LaTeX 文档内容",
					},
				},
				"required": []string{"content"},
			},
			ReadOnlyHint: true,
		},
	}
}

// ExecuteTool 执行工具
func (p *TemplateToolProvider) ExecuteTool(ctx context.Context, name string, args map[string]interface{}) (*ToolResult, error) {
	switch name {
	case "list_templates":
		return p.listTemplates(ctx, args)
	case "get_template":
		return p.getTemplate(ctx, args)
	case "check_format":
		return p.checkFormat(ctx, args)
	case "generate_preamble":
		return p.generatePreamble(ctx, args)
	case "suggest_improvements":
		return p.suggestImprovements(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

// JournalTemplate 期刊模板
type JournalTemplate struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Publisher    string   `json:"publisher"`
	Category     string   `json:"category"`
	Field        string   `json:"field"`
	DocumentClass string  `json:"document_class"`
	Description  string   `json:"description"`
	Requirements []string `json:"requirements"`
}

// getTemplates 获取模板列表
func getTemplates() []JournalTemplate {
	return []JournalTemplate{
		// IEEE
		{
			ID:            "ieee-transaction",
			Name:          "IEEE Transactions",
			Publisher:     "IEEE",
			Category:      "journal",
			Field:         "cs,engineering",
			DocumentClass: "IEEEtran",
			Description:   "IEEE 期刊论文模板，适用于大多数 IEEE Transactions 系列",
			Requirements:  []string{"双栏排版", "摘要不超过 200 词", "必须包含关键词"},
		},
		{
			ID:            "ieee-conference",
			Name:          "IEEE Conference",
			Publisher:     "IEEE",
			Category:      "conference",
			Field:         "cs,engineering",
			DocumentClass: "IEEEtran",
			Description:   "IEEE 会议论文模板",
			Requirements:  []string{"双栏排版", "页数限制（通常 6-8 页）"},
		},
		// ACM
		{
			ID:            "acm-sigconf",
			Name:          "ACM SIGCONF",
			Publisher:     "ACM",
			Category:      "conference",
			Field:         "cs",
			DocumentClass: "acmart",
			Description:   "ACM 会议论文模板（新版 acmart 格式）",
			Requirements:  []string{"双栏排版", "CCS 概念分类", "ACM 参考格式"},
		},
		{
			ID:            "acm-journal",
			Name:          "ACM Journals",
			Publisher:     "ACM",
			Category:      "journal",
			Field:         "cs",
			DocumentClass: "acmart",
			Description:   "ACM 期刊论文模板",
			Requirements:  []string{"双栏排版", "CCS 概念分类"},
		},
		// Springer
		{
			ID:            "springer-lncs",
			Name:          "Springer LNCS",
			Publisher:     "Springer",
			Category:      "conference",
			Field:         "cs",
			DocumentClass: "llncs",
			Description:   "Springer Lecture Notes in Computer Science 模板",
			Requirements:  []string{"单栏排版", "页数限制", "Springer 格式引用"},
		},
		{
			ID:            "springer-nature",
			Name:          "Springer Nature",
			Publisher:     "Springer",
			Category:      "journal",
			Field:         "science",
			DocumentClass: "sn-jnl",
			Description:   "Springer Nature 期刊模板",
			Requirements:  []string{"结构化摘要", "数据可用性声明"},
		},
		// Elsevier
		{
			ID:            "elsevier",
			Name:          "Elsevier Journal",
			Publisher:     "Elsevier",
			Category:      "journal",
			Field:         "science",
			DocumentClass: "elsarticle",
			Description:   "Elsevier 期刊通用模板",
			Requirements:  []string{"支持多种引用格式", "图表需单独提交"},
		},
		// arXiv
		{
			ID:            "arxiv-preprint",
			Name:          "arXiv Preprint",
			Publisher:     "arXiv",
			Category:      "preprint",
			Field:         "all",
			DocumentClass: "article",
			Description:   "arXiv 预印本通用模板",
			Requirements:  []string{"PDF 大小限制", "支持多种文档类"},
		},
		// 学位论文
		{
			ID:            "thesis-general",
			Name:          "学位论文（通用）",
			Publisher:     "",
			Category:      "thesis",
			Field:         "all",
			DocumentClass: "report",
			Description:   "通用学位论文模板",
			Requirements:  []string{"章节结构", "参考文献", "附录"},
		},
	}
}

// listTemplates 列出模板
func (p *TemplateToolProvider) listTemplates(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	category := "all"
	if cat, ok := args["category"].(string); ok {
		category = cat
	}

	field := ""
	if f, ok := args["field"].(string); ok {
		field = f
	}

	templates := getTemplates()
	filtered := []JournalTemplate{}

	for _, t := range templates {
		// 过滤类别
		if category != "all" && t.Category != category {
			continue
		}
		// 过滤领域
		if field != "" && !strings.Contains(t.Field, field) {
			continue
		}
		filtered = append(filtered, t)
	}

	return CreateSuccessResult(map[string]interface{}{
		"count":     len(filtered),
		"templates": filtered,
	}), nil
}

// getTemplate 获取模板详情
func (p *TemplateToolProvider) getTemplate(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	templateID, ok := args["template_id"].(string)
	if !ok || templateID == "" {
		return CreateErrorResult(fmt.Errorf("template_id is required")), nil
	}

	for _, t := range getTemplates() {
		if t.ID == templateID {
			// 生成示例代码
			example := generateTemplateExample(t)
			return CreateSuccessResult(map[string]interface{}{
				"template": t,
				"example":  example,
			}), nil
		}
	}

	return CreateErrorResult(fmt.Errorf("template not found: %s", templateID)), nil
}

// generateTemplateExample 生成模板示例
func generateTemplateExample(t JournalTemplate) string {
	switch t.ID {
	case "ieee-transaction", "ieee-conference":
		return `\documentclass[journal]{IEEEtran}
\usepackage{cite}
\usepackage{amsmath,amssymb,amsfonts}
\usepackage{graphicx}
\usepackage{textcomp}

\begin{document}

\title{Your Paper Title}
\author{\IEEEauthorblockN{Author Name}
\IEEEauthorblockA{Affiliation\\
Email}}

\maketitle

\begin{abstract}
Your abstract here.
\end{abstract}

\begin{IEEEkeywords}
keyword1, keyword2
\end{IEEEkeywords}

\section{Introduction}
Your content here.

\bibliographystyle{IEEEtran}
\bibliography{references}

\end{document}`

	case "acm-sigconf", "acm-journal":
		return `\documentclass[sigconf]{acmart}

\begin{document}

\title{Your Paper Title}
\author{Author Name}
\affiliation{
  \institution{Institution}
  \city{City}
  \country{Country}
}
\email{email@example.com}

\begin{abstract}
Your abstract here.
\end{abstract}

\begin{CCSXML}
<ccs2012>
</ccs2012>
\end{CCSXML}

\keywords{keyword1, keyword2}

\maketitle

\section{Introduction}
Your content here.

\bibliographystyle{ACM-Reference-Format}
\bibliography{references}

\end{document}`

	default:
		return `\documentclass[12pt]{article}
\usepackage[utf8]{inputenc}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}

\title{Your Paper Title}
\author{Author Name}
\date{\today}

\begin{document}

\maketitle

\begin{abstract}
Your abstract here.
\end{abstract}

\section{Introduction}
Your content here.

\bibliographystyle{plain}
\bibliography{references}

\end{document}`
	}
}

// checkFormat 检查格式
func (p *TemplateToolProvider) checkFormat(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	content, ok := args["content"].(string)
	if !ok || content == "" {
		return CreateErrorResult(fmt.Errorf("content is required")), nil
	}

	issues := []map[string]string{}
	suggestions := []string{}

	// 检查文档类
	if !regexp.MustCompile(`\\documentclass`).MatchString(content) {
		issues = append(issues, map[string]string{
			"type":    "error",
			"message": "缺少 \\documentclass 声明",
		})
	}

	// 检查必要结构
	if !regexp.MustCompile(`\\begin\{document\}`).MatchString(content) {
		issues = append(issues, map[string]string{
			"type":    "error",
			"message": "缺少 \\begin{document}",
		})
	}
	if !regexp.MustCompile(`\\end\{document\}`).MatchString(content) {
		issues = append(issues, map[string]string{
			"type":    "error",
			"message": "缺少 \\end{document}",
		})
	}

	// 检查标题
	if !regexp.MustCompile(`\\title\{`).MatchString(content) {
		issues = append(issues, map[string]string{
			"type":    "warning",
			"message": "缺少 \\title 声明",
		})
	}

	// 检查作者
	if !regexp.MustCompile(`\\author\{`).MatchString(content) {
		issues = append(issues, map[string]string{
			"type":    "warning",
			"message": "缺少 \\author 声明",
		})
	}

	// 检查摘要
	if !regexp.MustCompile(`\\begin\{abstract\}`).MatchString(content) {
		suggestions = append(suggestions, "建议添加摘要（\\begin{abstract}...\\end{abstract}）")
	}

	// 检查参考文献
	if !regexp.MustCompile(`\\bibliography\{|\\begin\{thebibliography\}`).MatchString(content) {
		suggestions = append(suggestions, "建议添加参考文献")
	}

	// 检查中文支持
	hasChinese := regexp.MustCompile(`[\x{4e00}-\x{9fff}]`).MatchString(content)
	hasXeCJK := strings.Contains(content, "\\usepackage{xeCJK}")
	hasCTeX := strings.Contains(content, "\\usepackage{ctex}") || strings.Contains(content, "ctexart") || strings.Contains(content, "ctexbook")
	
	if hasChinese {
		if hasCTeX {
			issues = append(issues, map[string]string{
				"type":    "error",
				"message": "ctex 宏包在在线编译器中不可用，请使用 xeCJK 替代",
			})
		} else if !hasXeCJK {
			issues = append(issues, map[string]string{
				"type":    "error",
				"message": "文档包含中文但未加载 xeCJK 宏包",
			})
			suggestions = append(suggestions, "添加 \\usepackage{xeCJK} 并设置字体：\\setCJKmainfont{Noto Serif CJK SC}")
		}
	} else if regexp.MustCompile(`[^\x00-\x7F]`).MatchString(content) {
		// 其他非 ASCII 字符
		suggestions = append(suggestions, "文档包含非 ASCII 字符，建议使用 XeTeX 编译")
	}

	// 检查常见问题
	if strings.Count(content, "$") % 2 != 0 {
		issues = append(issues, map[string]string{
			"type":    "warning",
			"message": "数学公式定界符 $ 数量不匹配",
		})
	}

	return CreateSuccessResult(map[string]interface{}{
		"valid":       len(issues) == 0,
		"issues":      issues,
		"suggestions": suggestions,
		"issue_count": len(issues),
	}), nil
}

// generatePreamble 生成文档前言
func (p *TemplateToolProvider) generatePreamble(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	docType := "article"
	if dt, ok := args["document_type"].(string); ok {
		docType = dt
	}

	features := []string{}
	if f, ok := args["features"].([]interface{}); ok {
		for _, feat := range f {
			if s, ok := feat.(string); ok {
				features = append(features, s)
			}
		}
	}

	language := "english"
	if lang, ok := args["language"].(string); ok {
		language = lang
	}

	var preamble strings.Builder

	// 文档类
	preamble.WriteString(fmt.Sprintf("\\documentclass[12pt]{%s}\n\n", docType))

	// 编码
	if language == "chinese" {
		preamble.WriteString("% 中文支持（使用 xeCJK，需要 XeTeX 引擎编译）\n")
		preamble.WriteString("\\usepackage{xeCJK}\n")
		preamble.WriteString("% 设置中文字体（Noto 字体在线编译器支持）\n")
		preamble.WriteString("\\setCJKmainfont{Noto Serif CJK SC}\n")
		preamble.WriteString("\\setCJKsansfont{Noto Sans CJK SC}\n")
		preamble.WriteString("\\setCJKmonofont{Noto Sans Mono CJK SC}\n\n")
	} else {
		preamble.WriteString("% 编码\n")
		preamble.WriteString("\\usepackage[T1]{fontenc}\n\n")
	}

	// 根据功能添加宏包
	for _, feat := range features {
		switch feat {
		case "math":
			preamble.WriteString("% 数学支持\n")
			preamble.WriteString("\\usepackage{amsmath,amssymb,amsthm}\n\n")
		case "graphics":
			preamble.WriteString("% 图片支持\n")
			preamble.WriteString("\\usepackage{graphicx}\n")
			preamble.WriteString("\\usepackage{float}\n\n")
		case "tables":
			preamble.WriteString("% 表格支持\n")
			preamble.WriteString("\\usepackage{booktabs}\n")
			preamble.WriteString("\\usepackage{array}\n")
			preamble.WriteString("\\usepackage{multirow}\n\n")
		case "code":
			preamble.WriteString("% 代码支持\n")
			preamble.WriteString("\\usepackage{listings}\n")
			preamble.WriteString("\\usepackage{xcolor}\n\n")
		case "bibliography":
			preamble.WriteString("% 参考文献支持\n")
			preamble.WriteString("\\usepackage[numbers]{natbib}\n\n")
		case "hyperref":
			preamble.WriteString("% 超链接支持\n")
			preamble.WriteString("\\usepackage{hyperref}\n")
			preamble.WriteString("\\hypersetup{colorlinks=true,linkcolor=blue,citecolor=blue}\n\n")
		}
	}

	// 页面设置
	preamble.WriteString("% 页面设置\n")
	preamble.WriteString("\\usepackage{geometry}\n")
	preamble.WriteString("\\geometry{a4paper,margin=1in}\n\n")

	return CreateSuccessResult(map[string]interface{}{
		"preamble":      preamble.String(),
		"document_type": docType,
		"features":      features,
		"language":      language,
	}), nil
}

// suggestImprovements 建议改进
func (p *TemplateToolProvider) suggestImprovements(ctx context.Context, args map[string]interface{}) (*ToolResult, error) {
	content, ok := args["content"].(string)
	if !ok || content == "" {
		return CreateErrorResult(fmt.Errorf("content is required")), nil
	}

	improvements := []map[string]string{}

	// 检查是否使用了旧式命令
	oldCommands := map[string]string{
		`\\bf\b`:     "\\bf 已过时，建议使用 \\textbf{...}",
		`\\it\b`:     "\\it 已过时，建议使用 \\textit{...}",
		`\\rm\b`:     "\\rm 已过时，建议使用 \\textrm{...}",
		`\\sc\b`:     "\\sc 已过时，建议使用 \\textsc{...}",
		`\\over\b`:   "\\over 已过时，建议使用 \\frac{...}{...}",
		`\\centerline`: "\\centerline 已过时，建议使用 center 环境",
	}

	for pattern, suggestion := range oldCommands {
		if regexp.MustCompile(pattern).MatchString(content) {
			improvements = append(improvements, map[string]string{
				"type":       "style",
				"suggestion": suggestion,
			})
		}
	}

	// 检查图片格式
	if regexp.MustCompile(`\\includegraphics.*\.bmp`).MatchString(content) {
		improvements = append(improvements, map[string]string{
			"type":       "quality",
			"suggestion": "建议使用 PDF、PNG 或 EPS 格式的图片，而不是 BMP",
		})
	}

	// 检查硬编码尺寸
	if regexp.MustCompile(`\\vspace\{[0-9]+pt\}`).MatchString(content) {
		improvements = append(improvements, map[string]string{
			"type":       "style",
			"suggestion": "避免硬编码间距，建议使用 \\smallskip、\\medskip、\\bigskip",
		})
	}

	// 检查是否使用了宏包
	if !strings.Contains(content, "\\usepackage") {
		improvements = append(improvements, map[string]string{
			"type":       "structure",
			"suggestion": "文档没有使用任何宏包，建议至少添加基本宏包（如 amsmath, graphicx）",
		})
	}

	// 检查章节结构
	sectionCount := len(regexp.MustCompile(`\\section\{`).FindAllString(content, -1))
	subsectionCount := len(regexp.MustCompile(`\\subsection\{`).FindAllString(content, -1))
	if sectionCount > 0 && subsectionCount == 0 && strings.Count(content, "\n") > 200 {
		improvements = append(improvements, map[string]string{
			"type":       "structure",
			"suggestion": "文档较长但没有使用 \\subsection，建议添加子章节以改善结构",
		})
	}

	return CreateSuccessResult(map[string]interface{}{
		"improvements": improvements,
		"count":        len(improvements),
	}), nil
}
