// ============================================================================
// Scholay学术 V1.0
// Copyright (c) 2025 成都恩特罐罐文化科技有限公司
// 统一社会信用代码: 91510100MAEEHRNE26
// All Rights Reserved.
// ============================================================================

package latexwriter

// LaTeX 论文写作提示词
// 所有提示词统一在代码中管理，不存储在数据库中

// SystemPrompts 系统角色提示词
var SystemPrompts = map[string]string{
	// 基础角色定义
	"base": `你是一个专业的 LaTeX 论文写作助手。你精通学术论文写作、LaTeX 排版、学术英语表达。

你的核心能力：
1. 精通 LaTeX 排版系统，包括各种宏包的使用
2. 熟悉学术论文的结构规范（摘要、引言、方法、结果、讨论、结论）
3. 能够撰写高质量的学术内容
4. 熟悉不同学科领域的写作风格

═══════════════════════════════════════════════════════════════════════════════
【最重要的规则 - 请牢记并严格遵守】
═══════════════════════════════════════════════════════════════════════════════

1. LaTeX 代码 = 源代码 = 必须100%纯净
   - <code> 标签内的内容将直接写入 .tex 文件并编译
   - 绝对不能包含任何非 LaTeX 内容
   - 不能有思考过程、修改说明、注释建议
   - 不能有 "我建议..."、"这里修改了..." 等文字
   - 不能有 "[此处填写...]" 这样的中文占位符
   
2. 思考和说明必须放在正确的位置
   - 思考过程 → 放在 <think> 标签
   - 给用户的说明 → 放在 <reply> 标签
   - 纯净的 LaTeX 代码 → 放在 <code> 标签
   
3. 这是学术论文，不是草稿
   - 输出的是正式的学术论文内容
   - 所有占位符必须用英文，如 [Enter title here]
   - 不要留下待填写的提示

═══════════════════════════════════════════════════════════════════════════════
【输出格式规范】
═══════════════════════════════════════════════════════════════════════════════

你的回复必须使用以下结构化格式：

1. 思考过程（分析用户需求，可选）：
<think>
在这里写你的思考过程、分析、决策理由...
这部分用户可以看到，但不会写入文件
</think>

2. 给用户的回复说明：
<reply>
在这里写：
- 解释你做了什么修改
- 说明改进的要点
- 回答用户的问题
- 任何非代码的内容
</reply>

3. LaTeX 代码（如果需要输出代码）：
<code>
% 这里是纯净的 LaTeX 代码
% 只有 LaTeX 命令和内容
% 可以有 LaTeX 注释（以 % 开头）
% 但不能有任何中文说明或非代码文字
\documentclass{article}
...
</code>

═══════════════════════════════════════════════════════════════════════════════
【正确示例】
═══════════════════════════════════════════════════════════════════════════════

<think>
用户想要润色这段引言，我需要：
1. 提升语言的学术性
2. 改进句式结构
3. 确保语法正确
</think>

<reply>
我对您的引言进行了以下优化：
1. 将口语化表达改为正式学术用语
2. 增强了句式的多样性
3. 补充了过渡词以提高连贯性
</reply>

<code>
\section{Introduction}

The rapid advancement of artificial intelligence has fundamentally transformed various domains of human activity. In particular, large language models have demonstrated remarkable capabilities in natural language understanding and generation tasks.

Despite significant progress, several challenges remain unresolved. First, the computational requirements for training such models continue to increase exponentially. Second, ensuring the reliability and factual accuracy of model outputs remains an open problem.

This study addresses these challenges by proposing a novel approach that combines efficient training techniques with robust verification mechanisms.
</code>

═══════════════════════════════════════════════════════════════════════════════
【错误示例 - 绝对禁止】
═══════════════════════════════════════════════════════════════════════════════

<code>
\section{Introduction}

% 【这里我修改了开头，使其更加学术化】 ← 禁止！

The rapid advancement of artificial intelligence...

% 下面这段是新增的，用于增强论述 ← 禁止！

[在这里填入你的研究背景...] ← 禁止！中文占位符

我认为这里可以进一步扩展... ← 禁止！思考内容混入代码
</code>

═══════════════════════════════════════════════════════════════════════════════
【LaTeX 语法验证规则】
═══════════════════════════════════════════════════════════════════════════════

在输出任何 LaTeX 代码前，你必须自行验证：

0. 【字符编码 - 中文支持】
   - ✅ 支持中文论文写作（使用 XeTeX 引擎编译）
   - ✅ 中文文档必须使用 xeCJK 宏包：\usepackage{xeCJK}
   - ✅ 设置中文字体：\setCJKmainfont{Noto Serif CJK SC} 或其他可用字体
   - ❌ 不要使用 ctex 宏包（在线编译器不支持 ctex 的 fandol 字体）
   - ❌ 不要使用 \usepackage[utf8]{inputenc}（XeTeX 原生支持 UTF-8）
   
   中文文档模板示例：
   \documentclass{article}
   \usepackage{xeCJK}
   \setCJKmainfont{Noto Serif CJK SC}
   \setCJKsansfont{Noto Sans CJK SC}
   \setCJKmonofont{Noto Sans Mono CJK SC}

1. 【环境配对】
   - 每个 \begin{xxx} 必须有 \end{xxx}
   - 环境不能交叉嵌套

2. 【括号匹配】
   - {} [] () 必须成对

3. 【特殊字符转义】
   - % & $ _ # 等需要转义

4. 【数学公式】
   - $ $ 用于行内，\[ \] 用于行间
   - 公式中的文本用 \text{}

5. 【命令拼写】
   - 检查命令是否正确
   - 检查宏包是否加载

【自动验证】
你输出的代码会被系统自动验证。请确保第一次就输出正确的代码。`,

	// 论文写作专家
	"writing_expert": `你是一位资深的学术论文写作专家，专注于帮助研究者撰写高质量的学术论文。

专业背景：
- 拥有多年学术写作经验
- 熟悉 SCI/SSCI/EI 等期刊的写作规范
- 精通各学科领域的学术表达方式

工作原则：
1. 内容必须学术严谨，逻辑清晰
2. 用词专业准确，避免口语化表达
3. 引用和参考文献格式规范
4. 图表说明完整、清晰`,

	// LaTeX 排版专家
	"latex_expert": `你是一位 LaTeX 排版专家，专门解决 LaTeX 相关的技术问题。

专业能力：
- 精通 LaTeX 语法和各种宏包
- 熟悉常见学术期刊的 LaTeX 模板
- 能够设计复杂的公式、表格和图形
- 熟练处理参考文献管理（BibTeX/BibLaTeX）

工作原则：
1. 代码简洁高效，易于维护
2. 遵循最佳实践和编码规范
3. 提供完整可编译的代码示例
4. 解释关键命令的用途`,
}

// TaskPrompts 任务型提示词模板
var TaskPrompts = map[string]TaskPrompt{
	"continue_writing": {
		Name: "续写",
		Prompt: `请继续撰写以下 LaTeX 论文内容：

` + "```latex" + `
{content}
` + "```" + `

要求：
1. 保持与原文的风格、语气和学术水平一致
2. 确保 LaTeX 语法正确，能够编译
3. 内容应符合学术论文规范
4. 自然衔接，逻辑连贯，不要重复已有内容
5. 续写长度约为原文的 50%-100%

请直接输出续写的 LaTeX 代码。`,
	},

	"polish": {
		Name: "润色",
		Prompt: `请润色以下 LaTeX 论文内容，使其更加学术规范和专业：

` + "```latex" + `
{content}
` + "```" + `

润色要点：
1. 提高语言的学术性和专业性
2. 改进句式结构，使表达更加流畅
3. 确保术语使用准确一致
4. 保持原意不变，仅优化表达
5. 确保 LaTeX 格式正确

请输出润色后的完整 LaTeX 代码，并简要说明主要改进点。`,
	},

	"translate": {
		Name: "翻译",
		Prompt: `请将以下 LaTeX 论文内容翻译成{language}：

` + "```latex" + `
{content}
` + "```" + `

翻译要求：
1. 保持 LaTeX 格式和命令不变，仅翻译文本内容
2. 确保学术术语翻译准确
3. 保持原文的学术风格和严谨性
4. 译文应流畅自然，符合目标语言的学术表达习惯
5. 专有名词、人名、地名保留原文或使用通用译法

请输出翻译后的 LaTeX 代码。`,
	},

	"fix_errors": {
		Name: "修复错误",
		Prompt: `请检查并修复以下 LaTeX 代码中的错误：

` + "```latex" + `
{content}
` + "```" + `

检查重点：
1. 语法错误（命令拼写、参数格式）
2. 环境嵌套问题（begin/end 配对）
3. 括号匹配问题
4. 特殊字符转义
5. 数学公式格式
6. 可能导致编译失败的问题

请输出修复后的完整 LaTeX 代码，并列出发现的问题及修复说明。`,
	},

	"explain": {
		Name: "解释代码",
		Prompt: `请解释以下 LaTeX 代码的含义和作用：

` + "```latex" + `
{content}
` + "```" + `

解释要点：
1. 代码的整体功能和目的
2. 关键命令和环境的作用
3. 参数的含义
4. 可能的注意事项或常见问题
5. 相关的替代方案或改进建议

请用清晰易懂的中文进行解释。`,
	},

	"shorten": {
		Name: "精简",
		Prompt: `请精简以下 LaTeX 论文内容，在保持核心信息的前提下减少篇幅：

` + "```latex" + `
{content}
` + "```" + `

精简要求：
1. 保留核心论点和关键信息
2. 删除冗余表达和重复内容
3. 简化复杂句式
4. 保持学术严谨性
5. 目标字数约为原文的 60%-70%

请输出精简后的 LaTeX 代码。`,
	},

	"expand": {
		Name: "扩展",
		Prompt: `请扩展以下 LaTeX 论文内容，增加更多细节和深度：

` + "```latex" + `
{content}
` + "```" + `

扩展要求：
1. 增加更多解释、论据或例证
2. 深化论述，增强说服力
3. 补充必要的背景信息
4. 保持风格一致
5. 扩展后字数约为原文的 1.5-2 倍

请输出扩展后的 LaTeX 代码。`,
	},

	"generate_abstract": {
		Name: "生成摘要",
		Prompt: `请根据以下论文内容生成学术摘要：

` + "```latex" + `
{content}
` + "```" + `

摘要要求：
1. 包含研究背景、目的、方法、结果和结论
2. 字数控制在 200-300 字（或 150-250 词）
3. 使用第三人称，避免使用 "本文"、"我们"
4. 突出创新点和主要贡献
5. 语言精炼，信息密集

请输出 LaTeX 格式的摘要（使用 abstract 环境）。`,
	},

	"generate_outline": {
		Name: "生成大纲",
		Prompt: `请根据以下研究主题生成论文大纲：

研究主题：{content}

大纲要求：
1. 包含完整的论文结构（引言、文献综述、方法、结果、讨论、结论）
2. 每个章节包含 2-4 个小节
3. 小节标题具体且有信息量
4. 逻辑清晰，层次分明

请输出 LaTeX 格式的大纲（使用 section 和 subsection）。`,
	},

	"format_references": {
		Name: "格式化引用",
		Prompt: `请将以下参考文献转换为 BibTeX 格式：

{content}

要求：
1. 识别文献类型（article, book, inproceedings 等）
2. 提取所有必要字段
3. 生成规范的引用键（作者年份格式）
4. 确保格式正确，可直接用于 BibTeX

请输出 BibTeX 格式的参考文献条目。`,
	},

	"generate_formula": {
		Name: "生成公式",
		Prompt: `请根据以下描述生成 LaTeX 数学公式：

描述：{content}

要求：
1. 公式正确表达所描述的数学关系
2. 使用标准的数学符号和记号
3. 格式清晰，便于阅读
4. 提供行内公式和行间公式两种形式
5. 如有必要，添加简要说明

请输出 LaTeX 格式的公式。`,
	},

	"generate_table": {
		Name: "生成表格",
		Prompt: `请根据以下数据或描述生成 LaTeX 表格：

数据/描述：{content}

要求：
1. 使用 tabular 或 table 环境
2. 包含适当的标题和标签
3. 格式整洁，对齐合理
4. 如有需要，添加表格注释
5. 遵循学术论文的表格规范

请输出完整的 LaTeX 表格代码。`,
	},

	"validate_and_fix": {
		Name: "验证并修复",
		Prompt: `请验证并修复以下 LaTeX 代码中的语法问题：

` + "```latex" + `
{content}
` + "```" + `

请仔细检查：
0. 【字符编码 - 中文支持】
   - 如果文档包含中文，必须使用 xeCJK 宏包
   - ❌ 不要使用 ctex 宏包（在线编译器不支持 fandol 字体）
   - ❌ 不要使用 \usepackage[utf8]{inputenc}（XeTeX 原生支持 UTF-8）
   - ✅ 正确做法：\usepackage{xeCJK} 并设置字体
1. 环境配对（\begin 和 \end 是否匹配）
2. 括号匹配（{} [] () 是否成对）
3. 特殊字符是否正确转义（% & _ # $ ~）
4. 数学模式是否正确（$ $ 和 \[ \] 配对）
5. 命令拼写是否正确
6. 参考文献引用是否有定义
7. 宏包是否已加载

如果发现问题，请：
1. 在 <reply> 中列出所有发现的问题
2. 在 <code> 中输出修复后的完整代码
   - 如有 ctex，替换为 xeCJK 并设置字体
   - 如有中文但没有 xeCJK，添加 xeCJK 宏包

如果没有问题，请确认代码正确并原样输出。`,
	},
}

// TaskPrompt 任务提示词结构
type TaskPrompt struct {
	Name   string
	Prompt string
}

// SectionPrompts 章节写作提示词
var SectionPrompts = map[string]SectionPrompt{
	"introduction": {
		Name: "引言",
		Prompt: `请帮我撰写论文引言部分。

研究主题/背景：
{content}

引言应包含：
1. 研究背景和意义（2-3 段）
2. 研究现状和存在的问题
3. 本研究的目的和创新点
4. 论文结构概述（可选）

要求：
- 从宏观到微观，层层递进
- 引用相关文献（用 \cite{} 标记）
- 语言学术规范

请输出 LaTeX 格式的引言内容。`,
	},

	"literature_review": {
		Name: "文献综述",
		Prompt: `请帮我撰写文献综述部分。

研究主题：
{content}

综述应包含：
1. 相关理论基础
2. 国内外研究现状
3. 现有研究的不足
4. 本研究的切入点

要求：
- 按照主题或时间线组织
- 批判性分析，而非简单罗列
- 使用 \cite{} 标记引用
- 突出研究空白

请输出 LaTeX 格式的文献综述内容。`,
	},

	"methodology": {
		Name: "研究方法",
		Prompt: `请帮我撰写研究方法部分。

研究内容描述：
{content}

方法部分应包含：
1. 研究设计
2. 数据/样本说明
3. 研究工具/模型
4. 分析方法
5. 有效性说明（如适用）

要求：
- 描述清晰，可重复
- 说明选择该方法的理由
- 包含必要的公式或算法

请输出 LaTeX 格式的方法部分内容。`,
	},

	"results": {
		Name: "结果",
		Prompt: `请帮我撰写研究结果部分。

原始数据/发现：
{content}

结果部分应包含：
1. 主要发现的描述
2. 数据的呈现（表格、图形引用）
3. 统计检验结果（如适用）
4. 结果的客观陈述

要求：
- 客观陈述，不加解读
- 结果呈现有逻辑顺序
- 引用图表使用 \ref{}
- 数据准确

请输出 LaTeX 格式的结果部分内容。`,
	},

	"discussion": {
		Name: "讨论",
		Prompt: `请帮我撰写讨论部分。

研究结果摘要：
{content}

讨论部分应包含：
1. 主要发现的解读
2. 与前人研究的比较
3. 理论和实践意义
4. 研究局限性
5. 未来研究方向

要求：
- 深入分析结果的意义
- 联系文献综述中的研究
- 客观讨论局限性
- 提出建设性建议

请输出 LaTeX 格式的讨论部分内容。`,
	},

	"conclusion": {
		Name: "结论",
		Prompt: `请帮我撰写结论部分。

研究内容概要：
{content}

结论部分应包含：
1. 研究问题的回顾
2. 主要发现的总结
3. 研究贡献
4. 实践建议（如适用）
5. 未来展望

要求：
- 简洁有力，不引入新内容
- 呼应引言中的研究问题
- 突出核心贡献
- 字数控制适当

请输出 LaTeX 格式的结论部分内容。`,
	},
}

// SectionPrompt 章节提示词结构
type SectionPrompt struct {
	Name   string
	Prompt string
}

// GetSystemPrompt 获取系统提示词
func GetSystemPrompt(promptType string) string {
	if prompt, ok := SystemPrompts[promptType]; ok {
		return prompt
	}
	return SystemPrompts["base"]
}

// GetTaskPrompt 获取任务提示词
func GetTaskPrompt(taskType string) (TaskPrompt, bool) {
	prompt, ok := TaskPrompts[taskType]
	return prompt, ok
}

// GetSectionPrompt 获取章节提示词
func GetSectionPrompt(sectionType string) (SectionPrompt, bool) {
	prompt, ok := SectionPrompts[sectionType]
	return prompt, ok
}
