// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package prompts

// SearchSuggestionsPrompt 搜索联想建议提示词
// 使用结构化的XML格式输入输出，确保大模型输出可控
const SearchSuggestionsPrompt = `<task>学术搜索联想建议</task>
<input>
<query>{{query}}</query>
</input>
<instructions>
分析用户的搜索查询，生成最多3个相关的英文学术搜索建议。
规则：
1. 无论输入是中文还是英文，都必须生成1-3个相关的英文搜索建议
2. 如果输入包含非英文内容，第一个建议必须是准确的英文翻译
3. 其他建议应为：同义词、相关学术术语、更精确的表达、或领域内常用搜索词
4. 每个建议应简洁，通常2-5个英文单词
5. 建议应与原查询紧密相关，帮助用户发现更多相关学术文献
6. 按相关性排序，最相关的在前
7. 不要添加任何解释或额外文字
</instructions>
<output_format>
严格按照以下XML格式输出，不要有任何其他内容：
<suggestions>
<item>建议1</item>
<item>建议2</item>
<item>建议3</item>
</suggestions>
</output_format>`

// RenderSearchSuggestionsPrompt 渲染搜索建议提示词，替换{{query}}占位符
func RenderSearchSuggestionsPrompt(query string) string {
	return replaceVariable(SearchSuggestionsPrompt, "query", query)
}

// replaceVariable 替换模板中的变量占位符
func replaceVariable(template, variable, value string) string {
	placeholder := "{{" + variable + "}}"
	result := template
	for {
		idx := indexOf(result, placeholder)
		if idx == -1 {
			break
		}
		result = result[:idx] + value + result[idx+len(placeholder):]
	}
	return result
}

// indexOf 查找子字符串位置
func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}
