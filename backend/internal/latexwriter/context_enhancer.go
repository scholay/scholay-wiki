// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

// 上下文增强模块
// 提供文档结构提取、智能选择、压缩策略

package latexwriter

import (
	"fmt"
	"regexp"
	"strings"
)

// ContextEnhancer 上下文增强器
type ContextEnhancer struct {
	maxTokens      int
	charsPerToken  float64 // 估算：每 token 的平均字符数
}

// NewContextEnhancer 创建上下文增强器
func NewContextEnhancer(maxTokens int) *ContextEnhancer {
	return &ContextEnhancer{
		maxTokens:     maxTokens,
		charsPerToken: 4.0, // 英文约 4 字符/token，中文约 2 字符/token
	}
}

// DocumentStructure 文档结构
type DocumentStructure struct {
	Title       string            `json:"title"`
	Abstract    string            `json:"abstract"`
	Sections    []SectionInfo     `json:"sections"`
	Packages    []string          `json:"packages"`
	Bibliography string           `json:"bibliography"`
	TotalLines  int               `json:"total_lines"`
	HasFigures  bool              `json:"has_figures"`
	HasTables   bool              `json:"has_tables"`
	HasMath     bool              `json:"has_math"`
}

// SectionInfo 章节信息
type SectionInfo struct {
	Level    int    `json:"level"`    // 1=section, 2=subsection, 3=subsubsection
	Title    string `json:"title"`
	StartLine int   `json:"start_line"`
	EndLine   int   `json:"end_line"`
	Content   string `json:"content,omitempty"` // 可选，按需填充
}

// ExtractDocumentStructure 提取文档结构
func (e *ContextEnhancer) ExtractDocumentStructure(content string) *DocumentStructure {
	structure := &DocumentStructure{
		Sections: []SectionInfo{},
		Packages: []string{},
	}

	lines := strings.Split(content, "\n")
	structure.TotalLines = len(lines)

	// 提取标题
	if match := regexp.MustCompile(`\\title\{([^}]+)\}`).FindStringSubmatch(content); len(match) > 1 {
		structure.Title = match[1]
	}

	// 提取摘要
	abstractRe := regexp.MustCompile(`(?s)\\begin\{abstract\}(.*?)\\end\{abstract\}`)
	if match := abstractRe.FindStringSubmatch(content); len(match) > 1 {
		structure.Abstract = strings.TrimSpace(match[1])
	}

	// 提取宏包
	packageRe := regexp.MustCompile(`\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}`)
	for _, match := range packageRe.FindAllStringSubmatch(content, -1) {
		if len(match) > 1 {
			// 可能有多个包用逗号分隔
			pkgs := strings.Split(match[1], ",")
			for _, pkg := range pkgs {
				structure.Packages = append(structure.Packages, strings.TrimSpace(pkg))
			}
		}
	}

	// 提取章节
	sectionRe := regexp.MustCompile(`\\(section|subsection|subsubsection)\*?\{([^}]+)\}`)
	for i, line := range lines {
		if match := sectionRe.FindStringSubmatch(line); len(match) > 2 {
			level := 1
			switch match[1] {
			case "subsection":
				level = 2
			case "subsubsection":
				level = 3
			}
			structure.Sections = append(structure.Sections, SectionInfo{
				Level:     level,
				Title:     match[2],
				StartLine: i + 1,
			})
		}
	}

	// 计算章节结束行
	for i := range structure.Sections {
		if i < len(structure.Sections)-1 {
			structure.Sections[i].EndLine = structure.Sections[i+1].StartLine - 1
		} else {
			// 最后一个章节到文档结束
			structure.Sections[i].EndLine = len(lines)
		}
	}

	// 检测特性
	structure.HasFigures = strings.Contains(content, "\\begin{figure}") || 
	                       strings.Contains(content, "\\includegraphics")
	structure.HasTables = strings.Contains(content, "\\begin{table}") || 
	                      strings.Contains(content, "\\begin{tabular}")
	structure.HasMath = strings.Contains(content, "\\begin{equation}") || 
	                    strings.Contains(content, "$$") ||
	                    strings.Contains(content, "\\[")

	// 提取参考文献部分
	bibRe := regexp.MustCompile(`(?s)\\begin\{thebibliography\}.*?\\end\{thebibliography\}`)
	if match := bibRe.FindString(content); match != "" {
		structure.Bibliography = match
	}

	return structure
}

// ContextSelection 上下文选择结果
type ContextSelection struct {
	RelevantSections []SectionInfo `json:"relevant_sections"`
	ContextText      string        `json:"context_text"`
	EstimatedTokens  int           `json:"estimated_tokens"`
	Strategy         string        `json:"strategy"`
}

// SelectRelevantContext 根据用户请求智能选择相关上下文
func (e *ContextEnhancer) SelectRelevantContext(content string, userQuery string, maxChars int) *ContextSelection {
	structure := e.ExtractDocumentStructure(content)
	selection := &ContextSelection{
		RelevantSections: []SectionInfo{},
		Strategy:         "keyword_matching",
	}

	if maxChars <= 0 {
		maxChars = int(float64(e.maxTokens) * e.charsPerToken)
	}

	// 简单的关键词匹配策略
	keywords := extractKeywords(userQuery)
	
	// 始终包含文档结构概览
	var contextBuilder strings.Builder
	contextBuilder.WriteString("【文档结构】\n")
	if structure.Title != "" {
		contextBuilder.WriteString(fmt.Sprintf("标题: %s\n", structure.Title))
	}
	contextBuilder.WriteString(fmt.Sprintf("章节: %d 个\n", len(structure.Sections)))
	for _, sec := range structure.Sections {
		indent := strings.Repeat("  ", sec.Level-1)
		contextBuilder.WriteString(fmt.Sprintf("%s- %s (行 %d-%d)\n", indent, sec.Title, sec.StartLine, sec.EndLine))
	}
	contextBuilder.WriteString("\n")

	// 根据关键词选择相关章节
	lines := strings.Split(content, "\n")
	relevantContent := []string{}
	
	for _, section := range structure.Sections {
		// 检查章节标题是否包含关键词
		relevant := false
		for _, kw := range keywords {
			if strings.Contains(strings.ToLower(section.Title), strings.ToLower(kw)) {
				relevant = true
				break
			}
		}

		// 检查章节内容是否包含关键词
		if !relevant && section.StartLine > 0 && section.EndLine <= len(lines) {
			sectionContent := strings.Join(lines[section.StartLine-1:section.EndLine], "\n")
			for _, kw := range keywords {
				if strings.Contains(strings.ToLower(sectionContent), strings.ToLower(kw)) {
					relevant = true
					break
				}
			}
		}

		if relevant {
			selection.RelevantSections = append(selection.RelevantSections, section)
			// 获取章节内容
			if section.StartLine > 0 && section.EndLine <= len(lines) {
				sectionContent := strings.Join(lines[section.StartLine-1:section.EndLine], "\n")
				relevantContent = append(relevantContent, fmt.Sprintf("【%s】\n%s", section.Title, sectionContent))
			}
		}
	}

	// 如果没有找到相关章节，选择摘要和引言
	if len(relevantContent) == 0 {
		if structure.Abstract != "" {
			relevantContent = append(relevantContent, "【摘要】\n"+structure.Abstract)
		}
		// 尝试找到 Introduction
		for _, section := range structure.Sections {
			if strings.Contains(strings.ToLower(section.Title), "introduction") ||
			   strings.Contains(strings.ToLower(section.Title), "引言") {
				if section.StartLine > 0 && section.EndLine <= len(lines) {
					sectionContent := strings.Join(lines[section.StartLine-1:section.EndLine], "\n")
					relevantContent = append(relevantContent, fmt.Sprintf("【%s】\n%s", section.Title, sectionContent))
				}
				break
			}
		}
		selection.Strategy = "fallback_to_intro"
	}

	// 组装最终上下文
	contextBuilder.WriteString("【相关内容】\n")
	for _, rc := range relevantContent {
		if contextBuilder.Len()+len(rc) > maxChars {
			// 截断并添加提示
			remaining := maxChars - contextBuilder.Len() - 50
			if remaining > 0 {
				contextBuilder.WriteString(rc[:remaining])
				contextBuilder.WriteString("...\n(内容已截断)")
			}
			break
		}
		contextBuilder.WriteString(rc)
		contextBuilder.WriteString("\n\n")
	}

	selection.ContextText = contextBuilder.String()
	selection.EstimatedTokens = int(float64(len(selection.ContextText)) / e.charsPerToken)

	return selection
}

// extractKeywords 从查询中提取关键词
func extractKeywords(query string) []string {
	// 移除常见停用词
	stopWords := map[string]bool{
		"的": true, "是": true, "在": true, "有": true, "和": true,
		"the": true, "is": true, "in": true, "a": true, "an": true,
		"to": true, "for": true, "of": true, "and": true, "this": true,
		"请": true, "帮": true, "我": true, "把": true, "如何": true,
	}

	// 简单分词（中英文）
	words := regexp.MustCompile(`[\p{Han}]+|[a-zA-Z]+`).FindAllString(query, -1)
	
	keywords := []string{}
	for _, word := range words {
		if len(word) > 1 && !stopWords[strings.ToLower(word)] {
			keywords = append(keywords, word)
		}
	}

	return keywords
}

// CompressContext 压缩上下文
func (e *ContextEnhancer) CompressContext(messages []LatexChatMessage, targetTokens int) string {
	if len(messages) == 0 {
		return ""
	}

	targetChars := int(float64(targetTokens) * e.charsPerToken)
	
	var result strings.Builder
	result.WriteString("【对话历史摘要】\n")

	// 统计消息总字符数
	totalChars := 0
	for _, msg := range messages {
		totalChars += len(msg.Content)
	}

	// 如果总长度小于目标，直接返回
	if totalChars <= targetChars {
		for _, msg := range messages {
			role := "用户"
			if msg.Role == "assistant" {
				role = "AI"
			}
			result.WriteString(fmt.Sprintf("%s: %s\n\n", role, msg.Content))
		}
		return result.String()
	}

	// 压缩策略：保留最近的消息，早期消息只保留摘要
	recentCount := 5 // 保留最近 5 条完整消息
	if recentCount > len(messages) {
		recentCount = len(messages)
	}

	// 早期消息摘要
	if len(messages) > recentCount {
		result.WriteString("（早期对话摘要）\n")
		for _, msg := range messages[:len(messages)-recentCount] {
			summary := summarizeMessage(msg.Content, 100)
			role := "用户"
			if msg.Role == "assistant" {
				role = "AI"
			}
			result.WriteString(fmt.Sprintf("- %s: %s\n", role, summary))
		}
		result.WriteString("\n")
	}

	// 最近消息完整保留
	result.WriteString("（最近对话）\n")
	for _, msg := range messages[len(messages)-recentCount:] {
		role := "用户"
		if msg.Role == "assistant" {
			role = "AI"
		}
		content := msg.Content
		// 如果单条消息太长，也需要截断
		maxSingleMsg := targetChars / recentCount
		if len(content) > maxSingleMsg {
			content = content[:maxSingleMsg] + "..."
		}
		result.WriteString(fmt.Sprintf("%s: %s\n\n", role, content))
	}

	return result.String()
}

// summarizeMessage 简单摘要消息
func summarizeMessage(content string, maxLen int) string {
	// 移除代码块
	content = regexp.MustCompile("(?s)```.*?```").ReplaceAllString(content, "[代码]")
	content = regexp.MustCompile("(?s)<code>.*?</code>").ReplaceAllString(content, "[代码]")
	content = regexp.MustCompile("(?s)<think>.*?</think>").ReplaceAllString(content, "")
	
	// 移除多余空白
	content = regexp.MustCompile(`\s+`).ReplaceAllString(content, " ")
	content = strings.TrimSpace(content)
	
	if len(content) <= maxLen {
		return content
	}
	
	return content[:maxLen] + "..."
}

// BuildEnhancedContext 构建增强的上下文
func (e *ContextEnhancer) BuildEnhancedContext(
	fullContent string,
	selectedText string,
	userQuery string,
	history []LatexChatMessage,
	maxTokens int,
) string {
	if maxTokens <= 0 {
		maxTokens = e.maxTokens
	}

	maxChars := int(float64(maxTokens) * e.charsPerToken)
	var result strings.Builder

	// 1. 添加文档结构（约 10% 的预算）
	structureBudget := maxChars / 10
	structure := e.ExtractDocumentStructure(fullContent)
	structureText := formatStructure(structure)
	if len(structureText) > structureBudget {
		structureText = structureText[:structureBudget] + "..."
	}
	result.WriteString(structureText)
	result.WriteString("\n")

	// 2. 添加选中的文本（如果有）
	if selectedText != "" {
		result.WriteString("【当前选中内容】\n```latex\n")
		result.WriteString(selectedText)
		result.WriteString("\n```\n\n")
	}

	// 3. 添加相关上下文（约 40% 的预算）
	contextBudget := maxChars * 4 / 10
	selection := e.SelectRelevantContext(fullContent, userQuery, contextBudget)
	result.WriteString(selection.ContextText)

	// 4. 添加对话历史（约 30% 的预算）
	historyBudget := maxChars * 3 / 10
	if len(history) > 0 {
		historyText := e.CompressContext(history, int(float64(historyBudget)/e.charsPerToken))
		result.WriteString(historyText)
	}

	return result.String()
}

// formatStructure 格式化文档结构
func formatStructure(structure *DocumentStructure) string {
	var sb strings.Builder
	sb.WriteString("【文档结构】\n")
	if structure.Title != "" {
		sb.WriteString(fmt.Sprintf("标题: %s\n", structure.Title))
	}
	sb.WriteString(fmt.Sprintf("总行数: %d\n", structure.TotalLines))
	sb.WriteString(fmt.Sprintf("章节数: %d\n", len(structure.Sections)))
	
	features := []string{}
	if structure.HasFigures {
		features = append(features, "图片")
	}
	if structure.HasTables {
		features = append(features, "表格")
	}
	if structure.HasMath {
		features = append(features, "数学公式")
	}
	if len(features) > 0 {
		sb.WriteString(fmt.Sprintf("包含: %s\n", strings.Join(features, ", ")))
	}
	
	if len(structure.Sections) > 0 {
		sb.WriteString("\n章节大纲:\n")
		for _, sec := range structure.Sections {
			indent := strings.Repeat("  ", sec.Level-1)
			sb.WriteString(fmt.Sprintf("%s- %s\n", indent, sec.Title))
		}
	}
	
	return sb.String()
}
