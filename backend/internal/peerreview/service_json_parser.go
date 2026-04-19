// ============================================================================
// Scholay学术 V1.0
// Peer Review JSON 解析与验证辅助函数
// ============================================================================

package peerreview

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// parseReviewJSON 解析 AI 返回的审稿报告 JSON
// 包含多层容错处理，尽最大努力解析 AI 返回的内容
func parseReviewJSON(content string) (*ReviewReportJSON, error) {
	// 清理内容：移除可能的 markdown 代码块标记
	content = strings.TrimSpace(content)

	// 移除 ```json 和 ``` 标记（支持多种变体）
	content = removeMarkdownCodeBlock(content)

	// 尝试找到 JSON 对象的边界
	jsonContent := extractJSONObject(content)
	if jsonContent == "" {
		return nil, fmt.Errorf("no valid JSON object found in content")
	}

	// 第一次尝试：直接解析
	var report ReviewReportJSON
	if err := json.Unmarshal([]byte(jsonContent), &report); err == nil {
		return &report, nil
	}

	// 第二次尝试：修复常见的 JSON 格式问题
	fixedJSON := fixCommonJSONIssues(jsonContent)
	if err := json.Unmarshal([]byte(fixedJSON), &report); err == nil {
		return &report, nil
	}

	// 第三次尝试：使用正则表达式提取关键字段，构建部分报告
	partialReport := extractPartialReviewFromText(content)
	if partialReport != nil {
		return partialReport, nil
	}

	return nil, fmt.Errorf("failed to parse review JSON after multiple attempts")
}

// removeMarkdownCodeBlock 移除 markdown 代码块标记
func removeMarkdownCodeBlock(content string) string {
	content = strings.TrimSpace(content)

	// 移除开头的代码块标记
	prefixes := []string{"```json", "```JSON", "```", "'''json", "'''"}
	for _, prefix := range prefixes {
		if strings.HasPrefix(content, prefix) {
			content = strings.TrimPrefix(content, prefix)
			break
		}
	}

	// 移除结尾的代码块标记
	suffixes := []string{"```", "'''"}
	for _, suffix := range suffixes {
		if strings.HasSuffix(content, suffix) {
			content = strings.TrimSuffix(content, suffix)
			break
		}
	}

	return strings.TrimSpace(content)
}

// extractJSONObject 从内容中提取 JSON 对象
func extractJSONObject(content string) string {
	// 找到第一个 { 和最后一个 }
	startIdx := strings.Index(content, "{")
	endIdx := strings.LastIndex(content, "}")

	if startIdx == -1 || endIdx == -1 || endIdx <= startIdx {
		return ""
	}

	return content[startIdx : endIdx+1]
}

// fixCommonJSONIssues 修复常见的 JSON 格式问题
func fixCommonJSONIssues(jsonContent string) string {
	// 1. 移除尾部逗号（JSON 对象和数组最后一个元素后的逗号）
	// 例如: {"a": 1,} -> {"a": 1}
	re := regexp.MustCompile(`,\s*([}\]])`)
	jsonContent = re.ReplaceAllString(jsonContent, "$1")

	// 2. 修复单引号为双引号
	// 注意：这是一个简化处理，可能在某些边缘情况下不正确
	// 但对于 AI 生成的 JSON 通常有效
	if !strings.Contains(jsonContent, `"`) && strings.Contains(jsonContent, `'`) {
		jsonContent = strings.ReplaceAll(jsonContent, `'`, `"`)
	}

	// 3. 移除控制字符（除了 \n, \r, \t）
	var cleanedBuilder strings.Builder
	for _, r := range jsonContent {
		if r >= 32 || r == '\n' || r == '\r' || r == '\t' {
			cleanedBuilder.WriteRune(r)
		}
	}
	jsonContent = cleanedBuilder.String()

	// 4. 修复未转义的换行符在字符串值中的问题
	// 这是一个启发式修复，将值中的换行替换为 \n
	jsonContent = fixUnescapedNewlines(jsonContent)

	return jsonContent
}

// fixUnescapedNewlines 修复字符串值中未转义的换行符
func fixUnescapedNewlines(jsonContent string) string {
	// 使用状态机来处理字符串内的换行
	var result strings.Builder
	inString := false
	escaped := false

	for i, r := range jsonContent {
		if escaped {
			result.WriteRune(r)
			escaped = false
			continue
		}

		if r == '\\' && inString {
			escaped = true
			result.WriteRune(r)
			continue
		}

		if r == '"' {
			inString = !inString
			result.WriteRune(r)
			continue
		}

		if inString && (r == '\n' || r == '\r') {
			// 在字符串内遇到换行，替换为 \n
			if r == '\n' {
				result.WriteString("\\n")
			}
			// 跳过 \r
			continue
		}

		// 检查是否是字符串值中的实际换行（可能是 AI 输出的格式问题）
		if inString && i > 0 {
			result.WriteRune(r)
		} else {
			result.WriteRune(r)
		}
	}

	return result.String()
}

// extractPartialReviewFromText 从文本中提取部分审稿信息（最后的容错方案）
func extractPartialReviewFromText(content string) *ReviewReportJSON {
	report := &ReviewReportJSON{}
	hasValidContent := false

	// 使用正则表达式提取关键字段

	// 1. 提取 recommendation
	recPatterns := []string{
		`"recommendation"\s*:\s*"([^"]+)"`,
		`recommendation[：:]\s*(\w+)`,
	}
	for _, pattern := range recPatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.OverallAssessment.Recommendation = normalizeRecommendation(matches[1])
			hasValidContent = true
			break
		}
	}

	// 2. 提取 core_contribution
	contribPatterns := []string{
		`"core_contribution"\s*:\s*"([^"]+)"`,
		`核心贡献[：:]\s*(.+?)(?:\n|$)`,
	}
	for _, pattern := range contribPatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.OverallAssessment.CoreContribution = strings.TrimSpace(matches[1])
			hasValidContent = true
			break
		}
	}

	// 3. 提取 venue_name
	venuePatterns := []string{
		`"venue_name"\s*:\s*"([^"]+)"`,
	}
	for _, pattern := range venuePatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.OverallAssessment.FitForTargetVenue.VenueName = strings.TrimSpace(matches[1])
			hasValidContent = true
			break
		}
	}

	// 4. 提取 novelty_evaluation
	noveltyPatterns := []string{
		`"novelty_evaluation"\s*:\s*"([^"]+)"`,
		`新颖性[评價评价][：:]\s*(.+?)(?:\n|$)`,
	}
	for _, pattern := range noveltyPatterns {
		re := regexp.MustCompile(pattern)
		if matches := re.FindStringSubmatch(content); len(matches) > 1 {
			report.ExtendedReviewItems.NoveltyEvaluation = strings.TrimSpace(matches[1])
			hasValidContent = true
			break
		}
	}

	// 5. 尝试提取 critical_issues（简化版）
	issuePattern := regexp.MustCompile(`"issue_title"\s*:\s*"([^"]+)"`)
	issueMatches := issuePattern.FindAllStringSubmatch(content, -1)
	for _, match := range issueMatches {
		if len(match) > 1 {
			report.CriticalIssues = append(report.CriticalIssues, CriticalIssue{
				IssueTitle: strings.TrimSpace(match[1]),
			})
			hasValidContent = true
		}
	}

	// 6. 如果没有从 JSON 字段提取到推荐意见，尝试从全文提取
	if report.OverallAssessment.Recommendation == "" || report.OverallAssessment.Recommendation == "Pending Review" {
		report.OverallAssessment.Recommendation = extractRecommendation(content)
		if report.OverallAssessment.Recommendation != "Pending Review" {
			hasValidContent = true
		}
	}

	if hasValidContent {
		return report
	}
	return nil
}

// normalizeRecommendation 标准化推荐意见
func normalizeRecommendation(rec string) string {
	rec = strings.TrimSpace(rec)
	recLower := strings.ToLower(rec)

	// 处理带有选项分隔符的情况，如 "Accept | Minor Revision | Major Revision | Reject"
	// 这种情况下应该返回 Pending Review，因为 AI 没有做出选择
	if strings.Contains(rec, "|") {
		return "Pending Review"
	}

	if strings.Contains(recLower, "reject") {
		return "Reject"
	}
	if strings.Contains(recLower, "major revision") || strings.Contains(recLower, "major_revision") {
		return "Major Revision"
	}
	if strings.Contains(recLower, "minor revision") || strings.Contains(recLower, "minor_revision") {
		return "Minor Revision"
	}
	if strings.Contains(recLower, "accept") {
		return "Accept"
	}

	return "Pending Review"
}

// extractRecommendation 从审稿报告中提取推荐意见（文本模式，向后兼容）
func extractRecommendation(content string) string {
	content = strings.ToLower(content)

	if strings.Contains(content, "reject") || strings.Contains(content, "拒稿") {
		return "Reject"
	}
	if strings.Contains(content, "major revision") || strings.Contains(content, "大修") {
		return "Major Revision"
	}
	if strings.Contains(content, "minor revision") || strings.Contains(content, "小修") {
		return "Minor Revision"
	}
	if strings.Contains(content, "accept") || strings.Contains(content, "接受") {
		return "Accept"
	}

	return "Pending Review"
}
// isValidReviewJSON 检查AI返回的内容是否是有效的完整JSON
// 用于验证审稿评论的JSON格式是否正确且完整
func (s *Service) isValidReviewJSON(content string) bool {
	if content == "" {
		return false
	}

	// 清理可能的markdown代码块标记
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	// 检查是否以 { 开头，以 } 结尾
	if !strings.HasPrefix(content, "{") || !strings.HasSuffix(content, "}") {
		return false
	}

	// 尝试解析JSON以验证其有效性
	var result map[string]any
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return false
	}

	return true
}
