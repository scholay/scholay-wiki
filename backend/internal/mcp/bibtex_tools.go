// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// BibTeX MCP 工具
// 提供 BibTeX 解析、生成、格式化等功能

package mcp

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// BibTeXToolProvider BibTeX 工具提供者
type BibTeXToolProvider struct{}

// NewBibTeXToolProvider 创建 BibTeX 工具提供者
func NewBibTeXToolProvider() *BibTeXToolProvider {
	return &BibTeXToolProvider{}
}

// GetCategory 返回工具分类
func (p *BibTeXToolProvider) GetCategory() ToolCategory {
	return CategoryBibtex
}

// GetTools 返回工具定义列表
func (p *BibTeXToolProvider) GetTools() []ToolDefinition {
	return []ToolDefinition{
		{
			Name:        "parse_bibtex",
			Description: "解析 BibTeX 字符串，提取结构化的参考文献信息",
			Category:    CategoryBibtex,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"bibtex": map[string]any{
						"type":        "string",
						"description": "BibTeX 格式的参考文献字符串",
					},
				},
				"required": []string{"bibtex"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
		{
			Name:        "generate_bibtex",
			Description: "根据论文信息生成 BibTeX 条目",
			Category:    CategoryBibtex,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"title": map[string]any{
						"type":        "string",
						"description": "论文标题",
					},
					"authors": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "作者列表（格式：'姓, 名' 或 '全名'）",
					},
					"year": map[string]any{
						"type":        "string",
						"description": "发表年份",
					},
					"type": map[string]any{
						"type":        "string",
						"enum":        []string{"article", "inproceedings", "book", "phdthesis", "misc"},
						"description": "文献类型",
						"default":     "article",
					},
					"journal": map[string]any{
						"type":        "string",
						"description": "期刊名称（article 类型）",
					},
					"booktitle": map[string]any{
						"type":        "string",
						"description": "会议名称（inproceedings 类型）",
					},
					"volume": map[string]any{
						"type":        "string",
						"description": "卷号",
					},
					"number": map[string]any{
						"type":        "string",
						"description": "期号",
					},
					"pages": map[string]any{
						"type":        "string",
						"description": "页码范围（如 '1-10'）",
					},
					"doi": map[string]any{
						"type":        "string",
						"description": "DOI",
					},
					"url": map[string]any{
						"type":        "string",
						"description": "URL 链接",
					},
					"publisher": map[string]any{
						"type":        "string",
						"description": "出版商",
					},
				},
				"required": []string{"title", "authors", "year"},
			},
			IdempotentHint: true,
		},
		{
			Name:        "format_citation",
			Description: "将参考文献格式化为指定引用样式",
			Category:    CategoryBibtex,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"bibtex": map[string]any{
						"type":        "string",
						"description": "BibTeX 格式的参考文献",
					},
					"style": map[string]any{
						"type":        "string",
						"enum":        []string{"apa", "mla", "chicago", "ieee", "harvard"},
						"description": "引用样式",
						"default":     "apa",
					},
				},
				"required": []string{"bibtex"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
		{
			Name:        "validate_bibtex",
			Description: "验证 BibTeX 格式是否正确",
			Category:    CategoryBibtex,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"bibtex": map[string]any{
						"type":        "string",
						"description": "BibTeX 字符串",
					},
				},
				"required": []string{"bibtex"},
			},
			ReadOnlyHint:   true,
			IdempotentHint: true,
		},
		{
			Name:        "merge_bibtex",
			Description: "合并多个 BibTeX 条目，去除重复",
			Category:    CategoryBibtex,
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"entries": map[string]any{
						"type":        "array",
						"items":       map[string]string{"type": "string"},
						"description": "BibTeX 条目列表",
					},
				},
				"required": []string{"entries"},
			},
			IdempotentHint: true,
		},
	}
}

// ExecuteTool 执行工具
func (p *BibTeXToolProvider) ExecuteTool(ctx context.Context, name string, args map[string]any) (*ToolResult, error) {
	switch name {
	case "parse_bibtex":
		return p.parseBibTeX(ctx, args)
	case "generate_bibtex":
		return p.generateBibTeX(ctx, args)
	case "format_citation":
		return p.formatCitation(ctx, args)
	case "validate_bibtex":
		return p.validateBibTeX(ctx, args)
	case "merge_bibtex":
		return p.mergeBibTeX(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}
}

// ============================================================================
// BibTeX 数据结构
// ============================================================================

// BibEntry BibTeX 条目
type BibEntry struct {
	Type    string            `json:"type"`    // article, book, inproceedings, etc.
	Key     string            `json:"key"`     // 引用键
	Fields  map[string]string `json:"fields"`  // 字段映射
	Raw     string            `json:"raw"`     // 原始字符串
}

// ============================================================================
// 工具实现
// ============================================================================

// parseBibTeX 解析 BibTeX
func (p *BibTeXToolProvider) parseBibTeX(ctx context.Context, args map[string]any) (*ToolResult, error) {
	bibtex, ok := args["bibtex"].(string)
	if !ok || bibtex == "" {
		return CreateErrorResult(fmt.Errorf("bibtex is required")), nil
	}

	entries := parseBibTeXString(bibtex)
	
	return CreateSuccessResult(map[string]any{
		"count":   len(entries),
		"entries": entries,
	}), nil
}

// generateBibTeX 生成 BibTeX
func (p *BibTeXToolProvider) generateBibTeX(ctx context.Context, args map[string]any) (*ToolResult, error) {
	title, ok := args["title"].(string)
	if !ok || title == "" {
		return CreateErrorResult(fmt.Errorf("title is required")), nil
	}

	authorsRaw, ok := args["authors"].([]any)
	if !ok || len(authorsRaw) == 0 {
		return CreateErrorResult(fmt.Errorf("authors is required")), nil
	}

	year, ok := args["year"].(string)
	if !ok || year == "" {
		return CreateErrorResult(fmt.Errorf("year is required")), nil
	}

	authors := make([]string, 0, len(authorsRaw))
	for _, a := range authorsRaw {
		if s, ok := a.(string); ok {
			authors = append(authors, s)
		}
	}

	entryType := "article"
	if t, ok := args["type"].(string); ok && t != "" {
		entryType = t
	}

	// 生成引用键
	key := generateCitationKey(authors, year)

	// 构建 BibTeX
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("@%s{%s,\n", entryType, key))
	sb.WriteString(fmt.Sprintf("  title = {%s},\n", title))
	sb.WriteString(fmt.Sprintf("  author = {%s},\n", strings.Join(authors, " and ")))
	sb.WriteString(fmt.Sprintf("  year = {%s},\n", year))

	// 可选字段
	optionalFields := []struct {
		name string
		key  string
	}{
		{"journal", "journal"},
		{"booktitle", "booktitle"},
		{"volume", "volume"},
		{"number", "number"},
		{"pages", "pages"},
		{"doi", "doi"},
		{"url", "url"},
		{"publisher", "publisher"},
	}

	for _, f := range optionalFields {
		if v, ok := args[f.name].(string); ok && v != "" {
			sb.WriteString(fmt.Sprintf("  %s = {%s},\n", f.key, v))
		}
	}

	sb.WriteString("}")

	bibtex := sb.String()

	return CreateSuccessResult(map[string]any{
		"key":    key,
		"bibtex": bibtex,
	}), nil
}

// formatCitation 格式化引用
func (p *BibTeXToolProvider) formatCitation(ctx context.Context, args map[string]any) (*ToolResult, error) {
	bibtex, ok := args["bibtex"].(string)
	if !ok || bibtex == "" {
		return CreateErrorResult(fmt.Errorf("bibtex is required")), nil
	}

	style := "apa"
	if s, ok := args["style"].(string); ok && s != "" {
		style = s
	}

	entries := parseBibTeXString(bibtex)
	if len(entries) == 0 {
		return CreateErrorResult(fmt.Errorf("no valid BibTeX entries found")), nil
	}

	formatted := make([]string, 0, len(entries))
	for _, entry := range entries {
		citation := formatBibEntry(entry, style)
		formatted = append(formatted, citation)
	}

	return CreateSuccessResult(map[string]any{
		"style":    style,
		"citations": formatted,
	}), nil
}

// validateBibTeX 验证 BibTeX
func (p *BibTeXToolProvider) validateBibTeX(ctx context.Context, args map[string]any) (*ToolResult, error) {
	bibtex, ok := args["bibtex"].(string)
	if !ok || bibtex == "" {
		return CreateErrorResult(fmt.Errorf("bibtex is required")), nil
	}

	errors := []string{}
	warnings := []string{}
	entries := parseBibTeXString(bibtex)

	// 检查是否解析成功
	if len(entries) == 0 {
		errors = append(errors, "未找到有效的 BibTeX 条目")
	}

	for _, entry := range entries {
		// 检查必要字段
		requiredFields := map[string][]string{
			"article":       {"author", "title", "journal", "year"},
			"book":          {"author", "title", "publisher", "year"},
			"inproceedings": {"author", "title", "booktitle", "year"},
		}

		if required, ok := requiredFields[entry.Type]; ok {
			for _, field := range required {
				if _, exists := entry.Fields[field]; !exists {
					warnings = append(warnings, fmt.Sprintf("条目 '%s' 缺少必要字段 '%s'", entry.Key, field))
				}
			}
		}

		// 检查引用键格式
		if !isValidCitationKey(entry.Key) {
			warnings = append(warnings, fmt.Sprintf("引用键 '%s' 包含特殊字符", entry.Key))
		}
	}

	valid := len(errors) == 0

	return CreateSuccessResult(map[string]any{
		"valid":    valid,
		"errors":   errors,
		"warnings": warnings,
		"entries":  len(entries),
	}), nil
}

// mergeBibTeX 合并 BibTeX
func (p *BibTeXToolProvider) mergeBibTeX(ctx context.Context, args map[string]any) (*ToolResult, error) {
	entriesRaw, ok := args["entries"].([]any)
	if !ok || len(entriesRaw) == 0 {
		return CreateErrorResult(fmt.Errorf("entries is required")), nil
	}

	allEntries := make(map[string]BibEntry)
	
	for _, e := range entriesRaw {
		if bibtex, ok := e.(string); ok {
			entries := parseBibTeXString(bibtex)
			for _, entry := range entries {
				// 使用 key 去重
				if _, exists := allEntries[entry.Key]; !exists {
					allEntries[entry.Key] = entry
				}
			}
		}
	}

	// 生成合并后的 BibTeX
	var merged strings.Builder
	for _, entry := range allEntries {
		merged.WriteString(entry.Raw)
		merged.WriteString("\n\n")
	}

	return CreateSuccessResult(map[string]any{
		"count":  len(allEntries),
		"merged": strings.TrimSpace(merged.String()),
	}), nil
}

// ============================================================================
// 辅助函数
// ============================================================================

// parseBibTeXString 解析 BibTeX 字符串
func parseBibTeXString(bibtex string) []BibEntry {
	entries := []BibEntry{}
	
	// 匹配 BibTeX 条目
	entryRegex := regexp.MustCompile(`@(\w+)\s*\{\s*([^,]+)\s*,([^@]*)\}`)
	matches := entryRegex.FindAllStringSubmatch(bibtex, -1)

	for _, match := range matches {
		if len(match) < 4 {
			continue
		}

		entry := BibEntry{
			Type:   strings.ToLower(match[1]),
			Key:    strings.TrimSpace(match[2]),
			Fields: make(map[string]string),
			Raw:    match[0],
		}

		// 解析字段
		fieldsStr := match[3]
		fieldRegex := regexp.MustCompile(`(\w+)\s*=\s*[{\"]([^{}\"]*(?:\{[^{}]*\}[^{}\"]*)*)[}\"]`)
		fieldMatches := fieldRegex.FindAllStringSubmatch(fieldsStr, -1)

		for _, fm := range fieldMatches {
			if len(fm) >= 3 {
				fieldName := strings.ToLower(strings.TrimSpace(fm[1]))
				fieldValue := strings.TrimSpace(fm[2])
				entry.Fields[fieldName] = fieldValue
			}
		}

		entries = append(entries, entry)
	}

	return entries
}

// generateCitationKey 生成引用键
func generateCitationKey(authors []string, year string) string {
	if len(authors) == 0 || year == "" {
		return "unknown"
	}

	// 提取第一作者姓氏
	firstAuthor := authors[0]
	parts := strings.Split(firstAuthor, ",")
	if len(parts) == 0 {
		parts = strings.Split(firstAuthor, " ")
	}
	
	lastName := strings.TrimSpace(parts[len(parts)-1])
	if idx := strings.LastIndex(firstAuthor, " "); idx > 0 {
		lastName = strings.TrimSpace(firstAuthor[idx+1:])
	}
	
	// 清理姓氏
	lastName = cleanForKey(lastName)
	
	return strings.ToLower(lastName) + year
}

// cleanForKey 清理字符串用于引用键
func cleanForKey(s string) string {
	var result strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			result.WriteRune(r)
		}
	}
	return result.String()
}

// isValidCitationKey 检查引用键是否有效
func isValidCitationKey(key string) bool {
	for _, r := range key {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) && r != '_' && r != '-' && r != ':' {
			return false
		}
	}
	return true
}

// formatBibEntry 格式化 BibTeX 条目为引用
func formatBibEntry(entry BibEntry, style string) string {
	author := entry.Fields["author"]
	title := entry.Fields["title"]
	year := entry.Fields["year"]
	journal := entry.Fields["journal"]
	volume := entry.Fields["volume"]
	pages := entry.Fields["pages"]

	switch style {
	case "apa":
		// APA 格式: Author, A. A., & Author, B. B. (Year). Title. Journal, Volume, Pages.
		citation := fmt.Sprintf("%s (%s). %s.", formatAuthorsAPA(author), year, title)
		if journal != "" {
			citation += fmt.Sprintf(" *%s*", journal)
			if volume != "" {
				citation += fmt.Sprintf(", %s", volume)
			}
			if pages != "" {
				citation += fmt.Sprintf(", %s", pages)
			}
			citation += "."
		}
		return citation

	case "mla":
		// MLA 格式: Author. "Title." Journal, vol. X, no. X, Year, pp. X-X.
		citation := fmt.Sprintf("%s. \"%s.\"", formatAuthorsMLA(author), title)
		if journal != "" {
			citation += fmt.Sprintf(" *%s*", journal)
			if volume != "" {
				citation += fmt.Sprintf(", vol. %s", volume)
			}
			citation += fmt.Sprintf(", %s", year)
			if pages != "" {
				citation += fmt.Sprintf(", pp. %s", pages)
			}
			citation += "."
		}
		return citation

	case "ieee":
		// IEEE 格式: A. Author, "Title," Journal, vol. X, pp. X-X, Year.
		citation := fmt.Sprintf("%s, \"%s,\"", formatAuthorsIEEE(author), title)
		if journal != "" {
			citation += fmt.Sprintf(" *%s*", journal)
			if volume != "" {
				citation += fmt.Sprintf(", vol. %s", volume)
			}
			if pages != "" {
				citation += fmt.Sprintf(", pp. %s", pages)
			}
			citation += fmt.Sprintf(", %s.", year)
		}
		return citation

	default:
		// 默认简单格式
		return fmt.Sprintf("%s. %s. %s, %s.", author, title, journal, year)
	}
}

// formatAuthorsAPA 格式化作者为 APA 格式
func formatAuthorsAPA(authors string) string {
	parts := strings.Split(authors, " and ")
	if len(parts) == 1 {
		return parts[0]
	}
	if len(parts) == 2 {
		return parts[0] + ", & " + parts[1]
	}
	return parts[0] + " et al."
}

// formatAuthorsMLA 格式化作者为 MLA 格式
func formatAuthorsMLA(authors string) string {
	parts := strings.Split(authors, " and ")
	if len(parts) == 1 {
		return parts[0]
	}
	if len(parts) == 2 {
		return parts[0] + ", and " + parts[1]
	}
	return parts[0] + ", et al."
}

// formatAuthorsIEEE 格式化作者为 IEEE 格式
func formatAuthorsIEEE(authors string) string {
	parts := strings.Split(authors, " and ")
	formatted := make([]string, 0, len(parts))
	
	for _, part := range parts {
		part = strings.TrimSpace(part)
		// 尝试转换为 "F. Last" 格式
		names := strings.Split(part, ",")
		if len(names) == 2 {
			last := strings.TrimSpace(names[0])
			first := strings.TrimSpace(names[1])
			if len(first) > 0 {
				formatted = append(formatted, string(first[0])+". "+last)
			} else {
				formatted = append(formatted, last)
			}
		} else {
			formatted = append(formatted, part)
		}
	}

	if len(formatted) <= 3 {
		return strings.Join(formatted, ", ")
	}
	return formatted[0] + " et al."
}
