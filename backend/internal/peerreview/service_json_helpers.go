// ============================================================================
// Scholay学术 V1.0
// JSON 解析/截断修复 / 续写去重 等纯字符串工具函数
// ============================================================================

package peerreview

import (
	"encoding/json"
	"log/slog"
	"strings"
)

// extractJSON 从 AI 返回内容中抽取 JSON 部分（兼容 markdown 代码块）。
func extractJSON(content string) string {
	// 先尝试提取 markdown 代码块中的 JSON
	if strings.Contains(content, "```json") {
		start := strings.Index(content, "```json") + 7
		end := strings.LastIndex(content, "```")
		if end > start {
			content = strings.TrimSpace(content[start:end])
		}
	} else if strings.Contains(content, "```") {
		start := strings.Index(content, "```") + 3
		end := strings.LastIndex(content, "```")
		if end > start {
			content = strings.TrimSpace(content[start:end])
		}
	}

	// 尝试找到 JSON 对象的边界
	content = strings.TrimSpace(content)
	if !strings.HasPrefix(content, "{") {
		// 尝试找到第一个 {
		idx := strings.Index(content, "{")
		if idx >= 0 {
			content = content[idx:]
		}
	}

	// 尝试修复被截断的 JSON
	content = tryFixTruncatedJSON(content)

	return content
}

// tryFixTruncatedJSON 尝试修复被截断的 JSON
func tryFixTruncatedJSON(content string) string {
	// 如果 JSON 已经有效，直接返回
	var test any
	if json.Unmarshal([]byte(content), &test) == nil {
		return content
	}

	// 统计未闭合的括号
	openBraces := 0
	openBrackets := 0
	inString := false
	escaped := false

	for i := 0; i < len(content); i++ {
		c := content[i]
		if escaped {
			escaped = false
			continue
		}
		if c == '\\' && inString {
			escaped = true
			continue
		}
		if c == '"' {
			inString = !inString
			continue
		}
		if inString {
			continue
		}
		switch c {
		case '{':
			openBraces++
		case '}':
			openBraces--
		case '[':
			openBrackets++
		case ']':
			openBrackets--
		}
	}

	// 如果在字符串中被截断，先关闭字符串
	if inString {
		content += `"`
	}

	// 尝试清理最后一个不完整的键值对
	lastComma := strings.LastIndex(content, ",")
	lastColon := strings.LastIndex(content, ":")

	// 如果冒号在逗号之后，说明可能有一个不完整的键值对
	if lastColon > lastComma && lastColon > 0 {
		afterColon := strings.TrimSpace(content[lastColon+1:])
		if afterColon == "" || afterColon == `"` || afterColon == `"...` ||
			(strings.HasPrefix(afterColon, `"`) && !strings.HasSuffix(afterColon, `"`) && !strings.Contains(afterColon[1:], `"`)) {
			if lastComma > 0 {
				content = content[:lastComma]
			}
		}
	}

	// 清理尾部的逗号
	content = strings.TrimRight(content, ", \t\n\r")

	// 补充缺失的闭合括号
	for i := 0; i < openBrackets; i++ {
		content += "]"
	}
	for i := 0; i < openBraces; i++ {
		content += "}"
	}

	return content
}

// removeOverlappingContent 检测并去除续写内容中与前一段重复的部分
// 使用多种策略检测重复：
// 1. 查找最长公共子串（从末尾开始匹配）
// 2. 检测常见的重复模式（如重复的 JSON key）
func removeOverlappingContent(previous, current string) string {
	if len(previous) == 0 || len(current) == 0 {
		return current
	}

	// 策略1：查找 previous 末尾与 current 开头的重叠部分
	maxCheckLen := 500
	if len(previous) < maxCheckLen {
		maxCheckLen = len(previous)
	}
	previousTail := previous[len(previous)-maxCheckLen:]

	// 从长到短尝试匹配
	minOverlapLen := 20 // 最小重叠长度，避免误判
	for overlapLen := len(previousTail); overlapLen >= minOverlapLen; overlapLen-- {
		if overlapLen <= len(current) {
			suffix := previousTail[len(previousTail)-overlapLen:]
			prefix := current[:overlapLen]
			if suffix == prefix {
				slog.Debug("detected overlap, removing duplicate", "overlap_chars", overlapLen)
				return current[overlapLen:]
			}
		}
	}

	// 策略2：检测 JSON 格式的重复（如重复的字段名）
	if strings.Contains(previous, `"`) && strings.HasPrefix(strings.TrimSpace(current), `"`) {
		current = removeRepeatedJSONKeys(previous, current)
	}

	return current
}

// removeRepeatedJSONKeys 检测并移除重复的 JSON key
func removeRepeatedJSONKeys(previous, current string) string {
	trimmedCurrent := strings.TrimSpace(current)
	if !strings.HasPrefix(trimmedCurrent, `"`) {
		return current
	}

	// 找到第一个 key 的结束位置
	endQuote := strings.Index(trimmedCurrent[1:], `"`)
	if endQuote == -1 {
		return current
	}

	firstKey := trimmedCurrent[:endQuote+2] // 包含两个引号

	// 检查这个 key 是否在 previous 中已经出现过
	if strings.Contains(previous, firstKey) {
		colonIdx := strings.Index(trimmedCurrent, ":")
		if colonIdx == -1 {
			return current
		}

		valueStart := colonIdx + 1
		depth := 0
		inString := false
		escaped := false

		for i := valueStart; i < len(trimmedCurrent); i++ {
			c := trimmedCurrent[i]

			if escaped {
				escaped = false
				continue
			}

			if c == '\\' && inString {
				escaped = true
				continue
			}

			if c == '"' {
				inString = !inString
				continue
			}

			if inString {
				continue
			}

			if c == '{' || c == '[' {
				depth++
			} else if c == '}' || c == ']' {
				depth--
				if depth < 0 {
					return trimmedCurrent[i:]
				}
			} else if c == ',' && depth == 0 {
				remaining := strings.TrimSpace(trimmedCurrent[i+1:])
				if strings.HasPrefix(remaining, `"`) && !strings.Contains(previous, remaining[:strings.Index(remaining[1:], `"`)+2]) {
					slog.Debug("removed repeated JSON key", "key", firstKey)
					return trimmedCurrent[i:]
				}
			}
		}
	}

	return current
}
