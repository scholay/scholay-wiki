// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package prompts

// PaperTranslationPrompt 论文翻译提示词
// 使用结构化的XML格式输入输出，一次性翻译标题、摘要、TLDR三个字段
const PaperTranslationPrompt = `<task>学术论文翻译</task>
<input>
<title>{{title}}</title>
<abstract>{{abstract}}</abstract>
<tldr>{{tldr}}</tldr>
</input>
<instructions>
将上述学术论文内容从英文翻译成中文。
规则：
1. 保持学术术语的准确性和专业性
2. 译文通顺自然，符合中文学术表达习惯
3. 专有名词可保留英文或采用通用中文译法
4. 如果某字段内容为空，对应输出也留空
5. 如果某字段内容已经是中文，原样返回该内容
6. 严格按照输出格式返回，不要添加任何额外解释
</instructions>
<output_format>
严格按照以下XML格式输出，不要有任何其他内容：
<title_zh>标题的中文翻译</title_zh>
<abstract_zh>摘要的中文翻译</abstract_zh>
<tldr_zh>TLDR的中文翻译</tldr_zh>
</output_format>`

// RenderPaperTranslationPrompt 渲染论文翻译提示词，替换占位符
func RenderPaperTranslationPrompt(title, abstract, tldr string) string {
	result := PaperTranslationPrompt
	result = replaceVariable(result, "title", title)
	result = replaceVariable(result, "abstract", abstract)
	result = replaceVariable(result, "tldr", tldr)
	return result
}
