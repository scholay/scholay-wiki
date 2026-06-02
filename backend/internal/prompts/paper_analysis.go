// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package prompts

import "strings"

// AnalysisPromptTemplate 论文摘要多维分析提示词的静态骨架。
// 占位符:
//   - {{title}}          论文标题
//   - {{abstract}}       论文摘要
//   - {{dimensionList}}  运行时按 analysis_dimensions 表(admin 可配)生成的维度列表
//   - {{jsonFormat}}     运行时按维度集合生成的 JSON 输出 schema
//
// dimensionList 末尾自带 "\n\n"(见 service 层 buildDimensionListString),
// 故模板里 {{dimensionList}} 紧贴【输出格式】、不额外加换行;
// jsonFormat 末尾无换行,故其后紧跟 "\n\n所有维度..."。改动需保证渲染结果逐字节不变。
const AnalysisPromptTemplate = `请你阅读以下论文摘要，并严格根据摘要内容进行分析。

论文标题：{{title}}

论文摘要：{{abstract}}

为确保输出稳定性、可控性与准确性，请遵守以下规则：
【核心规则】
1. 必须先在内部逐步推理，但不要展示推理过程，只输出最终结果。
2. 所有分类必须完全基于摘要原文，不允许推断、不允许类比、不允许编造。
3. 允许所有维度的结果为空。如果摘要中完全没有对应信息，请回答：未提及。
4. 当摘要极短、极度模糊、非学术化、甚至不含任何可分析内容时，你必须保持结构完整，但允许全部返回未提及。
5. 不要引入摘要中没有的技术、领域、理论、国家、组织、数据、研究方法等信息。
6. 每一项结论都必须在摘要中找到明确对应的词句；若无法定位对应内容，必须回答：未提及。

【分析维度】
{{dimensionList}}【输出格式】
请严格使用以下JSON格式输出，不得增删字段：
{{jsonFormat}}

所有维度都必须输出，即使内容全部为"未提及"。`

// RenderPaperAnalysisPrompt 渲染论文分析提示词,替换占位符。
// dimensionList / jsonFormat 由调用方(service)基于 DB 维度运行时生成后传入。
func RenderPaperAnalysisPrompt(title, abstract, dimensionList, jsonFormat string) string {
	result := AnalysisPromptTemplate
	result = strings.ReplaceAll(result, "{{title}}", title)
	result = strings.ReplaceAll(result, "{{abstract}}", abstract)
	result = strings.ReplaceAll(result, "{{dimensionList}}", dimensionList)
	result = strings.ReplaceAll(result, "{{jsonFormat}}", jsonFormat)
	return result
}
