// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

import (
	"regexp"
	"strings"
)

// CodeSanitizer LaTeX 代码清理器
// 确保输出的 LaTeX 代码是纯净的，没有混入思考过程或说明文字
type CodeSanitizer struct {
	// 需要移除的非 LaTeX 模式
	invalidPatterns []*regexp.Regexp
}

// NewCodeSanitizer 创建代码清理器
func NewCodeSanitizer() *CodeSanitizer {
	patterns := []string{
		// 中文思考/说明模式
		`(?m)^.*我(认为|建议|觉得|修改|添加|删除|调整|优化).*$`,
		`(?m)^.*这(里|段|部分)(是|需要|可以|已经).*$`,
		`(?m)^.*以下(是|为).*$`,
		`(?m)^.*如下(所示)?[:：]?\s*$`,
		`(?m)^.*请(注意|看|参考).*$`,
		`(?m)^.*注意[:：].*$`,
		`(?m)^.*说明[:：].*$`,
		`(?m)^.*修改(了|为|成).*$`,
		`(?m)^.*改(为|成|进).*$`,
		`(?m)^.*增加(了)?.*解释.*$`,
		`(?m)^.*删除(了)?.*$`,
		`(?m)^.*补充(了)?.*$`,
		
		// 英文思考/说明模式
		`(?mi)^.*I (think|suggest|recommend|modified|added|removed).*$`,
		`(?mi)^.*Here (is|are|I).*$`,
		`(?mi)^.*Note[:：].*$`,
		`(?mi)^.*Please (note|see|refer).*$`,
		`(?mi)^.*The following.*$`,
		`(?mi)^.*As shown below.*$`,
		
		// 方括号中文占位符
		`\[[\u4e00-\u9fa5].*?\]`,
		
		// Markdown 代码块标记（如果误包含）
		"(?m)^```(latex|tex)?\\s*$",
		"(?m)^```\\s*$",
		
		// 空的注释行（连续多个）
		`(?m)(^%\s*$\n){3,}`,
	}

	compiled := make([]*regexp.Regexp, 0, len(patterns))
	for _, p := range patterns {
		if r, err := regexp.Compile(p); err == nil {
			compiled = append(compiled, r)
		}
	}

	return &CodeSanitizer{
		invalidPatterns: compiled,
	}
}

// Sanitize 清理 LaTeX 代码
func (s *CodeSanitizer) Sanitize(code string) string {
	if code == "" {
		return code
	}

	result := code

	// 1. 移除 <think>, <reply> 标签及其内容（如果误包含在代码中）
	result = s.removeTagContent(result, "think")
	result = s.removeTagContent(result, "reply")

	// 2. 提取 <code> 标签内容（如果存在）
	if extracted := s.extractCodeContent(result); extracted != "" {
		result = extracted
	}

	// 3. 应用无效模式过滤
	for _, pattern := range s.invalidPatterns {
		result = pattern.ReplaceAllString(result, "")
	}

	// 4. 移除行首/行尾非 LaTeX 的说明文字
	result = s.cleanLines(result)

	// 5. 清理多余空行
	result = s.cleanEmptyLines(result)

	return strings.TrimSpace(result)
}

// removeTagContent 移除指定标签及其内容
func (s *CodeSanitizer) removeTagContent(content, tag string) string {
	pattern := regexp.MustCompile(`(?s)<` + tag + `>.*?</` + tag + `>`)
	return pattern.ReplaceAllString(content, "")
}

// extractCodeContent 提取 <code> 标签内容
func (s *CodeSanitizer) extractCodeContent(content string) string {
	pattern := regexp.MustCompile(`(?s)<code>(.*?)</code>`)
	matches := pattern.FindStringSubmatch(content)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}
	return ""
}

// cleanLines 清理每行的非 LaTeX 内容
func (s *CodeSanitizer) cleanLines(content string) string {
	lines := strings.Split(content, "\n")
	cleaned := make([]string, 0, len(lines))

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		
		// 保留空行（后面会处理多余的）
		if trimmed == "" {
			cleaned = append(cleaned, "")
			continue
		}

		// 保留以 LaTeX 命令开头的行
		if strings.HasPrefix(trimmed, "\\") ||
			strings.HasPrefix(trimmed, "%") ||
			strings.HasPrefix(trimmed, "{") ||
			strings.HasPrefix(trimmed, "}") ||
			strings.HasPrefix(trimmed, "&") ||
			strings.HasPrefix(trimmed, "$") {
			cleaned = append(cleaned, line)
			continue
		}

		// 检查是否看起来像 LaTeX 内容
		if s.isLikelyLatexContent(trimmed) {
			cleaned = append(cleaned, line)
			continue
		}

		// 检查是否是纯中文说明（应该移除）
		if s.isChineseExplanation(trimmed) {
			// 将其转换为注释或跳过
			continue
		}

		// 保留其他内容（可能是论文正文）
		cleaned = append(cleaned, line)
	}

	return strings.Join(cleaned, "\n")
}

// isLikelyLatexContent 判断是否可能是 LaTeX 内容
func (s *CodeSanitizer) isLikelyLatexContent(line string) bool {
	// 包含 LaTeX 命令
	if strings.Contains(line, "\\") {
		return true
	}
	
	// 数学模式
	if strings.Contains(line, "$") {
		return true
	}

	// 表格分隔符
	if strings.Contains(line, "&") && strings.Contains(line, "\\\\") {
		return true
	}

	// 环境内容（纯文本）
	// 如果行在某个环境内部，它可能是纯文本内容
	return true
}

// isChineseExplanation 判断是否是中文说明文字
func (s *CodeSanitizer) isChineseExplanation(line string) bool {
	// 检查是否包含中文
	hasChinesePattern := regexp.MustCompile(`[\u4e00-\u9fa5]`)
	if !hasChinesePattern.MatchString(line) {
		return false
	}

	// 如果是 LaTeX 注释中的中文，可以保留
	if strings.HasPrefix(strings.TrimSpace(line), "%") {
		return false
	}

	// 检查是否是常见的说明文字模式
	explanationPatterns := []string{
		"我", "这里", "以下", "如下", "请", "注意",
		"修改", "添加", "删除", "建议", "说明",
		"优化", "调整", "增强", "改进",
	}

	for _, p := range explanationPatterns {
		if strings.Contains(line, p) {
			return true
		}
	}

	return false
}

// cleanEmptyLines 清理多余的空行
func (s *CodeSanitizer) cleanEmptyLines(content string) string {
	// 将连续的空行（3个以上）压缩为2个
	pattern := regexp.MustCompile(`\n{4,}`)
	return pattern.ReplaceAllString(content, "\n\n\n")
}

// ValidateAndClean 验证并清理代码
// 返回清理后的代码和是否有修改
func (s *CodeSanitizer) ValidateAndClean(code string) (string, bool) {
	original := code
	cleaned := s.Sanitize(code)
	modified := original != cleaned
	return cleaned, modified
}

// 全局清理器实例
var globalSanitizer = NewCodeSanitizer()

// SanitizeLatexCode 全局函数：清理 LaTeX 代码
func SanitizeLatexCode(code string) string {
	return globalSanitizer.Sanitize(code)
}
