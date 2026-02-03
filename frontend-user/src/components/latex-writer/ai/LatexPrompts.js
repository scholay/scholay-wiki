/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * LaTeX 论文写作提示词模板
 * 所有提示词统一在此管理，不存储在数据库中
 */

/**
 * 系统角色提示词
 */
export const SYSTEM_PROMPTS = {
  // 基础角色定义
  base: `你是一个专业的 LaTeX 论文写作助手。你精通学术论文写作、LaTeX 排版、学术英语和中文学术表达。

你的核心能力：
1. 精通 LaTeX 排版系统，包括各种宏包的使用
2. 熟悉学术论文的结构规范（摘要、引言、方法、结果、讨论、结论）
3. 能够撰写高质量的学术内容
4. 熟悉不同学科领域的写作风格

重要规则：
- 当用户请求修改或生成代码时，直接给出完整的 LaTeX 代码，使用 \`\`\`latex 代码块包裹
- 保持学术论文的严谨性和专业性
- 解释和交流使用中文，论文内容根据用户要求使用相应语言
- 注意 LaTeX 特殊字符的转义（如 %, $, &, #, _ 等）`,

  // 论文写作专家
  writing_expert: `你是一位资深的学术论文写作专家，专注于帮助研究者撰写高质量的学术论文。

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
  latex_expert: `你是一位 LaTeX 排版专家，专门解决 LaTeX 相关的技术问题。

专业能力：
- 精通 LaTeX 语法和各种宏包
- 熟悉常见学术期刊的 LaTeX 模板
- 能够设计复杂的公式、表格和图形
- 熟练处理参考文献管理（BibTeX/BibLaTeX）

工作原则：
1. 代码简洁高效，易于维护
2. 遵循最佳实践和编码规范
3. 提供完整可编译的代码示例
4. 解释关键命令的用途`
};

/**
 * 任务型提示词模板
 * {content} - 用户选中或提供的内容
 * {language} - 目标语言
 * {section} - 章节类型
 */
export const TASK_PROMPTS = {
  // 续写任务
  continue_writing: {
    name: '续写',
    icon: 'continue',
    prompt: `请继续撰写以下 LaTeX 论文内容：

\`\`\`latex
{content}
\`\`\`

要求：
1. 保持与原文的风格、语气和学术水平一致
2. 确保 LaTeX 语法正确，能够编译
3. 内容应符合学术论文规范
4. 自然衔接，逻辑连贯，不要重复已有内容
5. 续写长度约为原文的 50%-100%

请直接输出续写的 LaTeX 代码。`
  },

  // 润色任务
  polish: {
    name: '润色',
    icon: 'polish',
    prompt: `请润色以下 LaTeX 论文内容，使其更加学术规范和专业：

\`\`\`latex
{content}
\`\`\`

润色要点：
1. 提高语言的学术性和专业性
2. 改进句式结构，使表达更加流畅
3. 确保术语使用准确一致
4. 保持原意不变，仅优化表达
5. 确保 LaTeX 格式正确

请输出润色后的完整 LaTeX 代码，并简要说明主要改进点。`
  },

  // 翻译任务
  translate: {
    name: '翻译',
    icon: 'translate',
    prompt: `请将以下 LaTeX 论文内容翻译成{language}：

\`\`\`latex
{content}
\`\`\`

翻译要求：
1. 保持 LaTeX 格式和命令不变，仅翻译文本内容
2. 确保学术术语翻译准确
3. 保持原文的学术风格和严谨性
4. 译文应流畅自然，符合目标语言的学术表达习惯
5. 专有名词、人名、地名保留原文或使用通用译法

请输出翻译后的 LaTeX 代码。`
  },

  // 错误修复任务
  fix_errors: {
    name: '修复错误',
    icon: 'fix',
    prompt: `请检查并修复以下 LaTeX 代码中的错误：

\`\`\`latex
{content}
\`\`\`

检查重点：
1. 语法错误（命令拼写、参数格式）
2. 环境嵌套问题（begin/end 配对）
3. 括号匹配问题
4. 特殊字符转义
5. 数学公式格式
6. 可能导致编译失败的问题

请输出修复后的完整 LaTeX 代码，并列出发现的问题及修复说明。`
  },

  // 解释任务
  explain: {
    name: '解释代码',
    icon: 'explain',
    prompt: `请解释以下 LaTeX 代码的含义和作用：

\`\`\`latex
{content}
\`\`\`

解释要点：
1. 代码的整体功能和目的
2. 关键命令和环境的作用
3. 参数的含义
4. 可能的注意事项或常见问题
5. 相关的替代方案或改进建议

请用清晰易懂的中文进行解释。`
  },

  // 缩写/精简任务
  shorten: {
    name: '精简',
    icon: 'shorten',
    prompt: `请精简以下 LaTeX 论文内容，在保持核心信息的前提下减少篇幅：

\`\`\`latex
{content}
\`\`\`

精简要求：
1. 保留核心论点和关键信息
2. 删除冗余表达和重复内容
3. 简化复杂句式
4. 保持学术严谨性
5. 目标字数约为原文的 60%-70%

请输出精简后的 LaTeX 代码。`
  },

  // 扩展任务
  expand: {
    name: '扩展',
    icon: 'expand',
    prompt: `请扩展以下 LaTeX 论文内容，增加更多细节和深度：

\`\`\`latex
{content}
\`\`\`

扩展要求：
1. 增加更多解释、论据或例证
2. 深化论述，增强说服力
3. 补充必要的背景信息
4. 保持风格一致
5. 扩展后字数约为原文的 1.5-2 倍

请输出扩展后的 LaTeX 代码。`
  },

  // 摘要生成任务
  generate_abstract: {
    name: '生成摘要',
    icon: 'abstract',
    prompt: `请根据以下论文内容生成学术摘要：

\`\`\`latex
{content}
\`\`\`

摘要要求：
1. 包含研究背景、目的、方法、结果和结论
2. 字数控制在 200-300 字（或 150-250 词）
3. 使用第三人称，避免使用 "本文"、"我们"
4. 突出创新点和主要贡献
5. 语言精炼，信息密集

请输出 LaTeX 格式的摘要（使用 abstract 环境）。`
  },

  // 章节大纲生成
  generate_outline: {
    name: '生成大纲',
    icon: 'outline',
    prompt: `请根据以下研究主题生成论文大纲：

研究主题：{content}

大纲要求：
1. 包含完整的论文结构（引言、文献综述、方法、结果、讨论、结论）
2. 每个章节包含 2-4 个小节
3. 小节标题具体且有信息量
4. 逻辑清晰，层次分明

请输出 LaTeX 格式的大纲（使用 section 和 subsection）。`
  },

  // 参考文献格式化
  format_references: {
    name: '格式化引用',
    icon: 'reference',
    prompt: `请将以下参考文献转换为 BibTeX 格式：

{content}

要求：
1. 识别文献类型（article, book, inproceedings 等）
2. 提取所有必要字段
3. 生成规范的引用键（作者年份格式）
4. 确保格式正确，可直接用于 BibTeX

请输出 BibTeX 格式的参考文献条目。`
  },

  // 公式生成
  generate_formula: {
    name: '生成公式',
    icon: 'formula',
    prompt: `请根据以下描述生成 LaTeX 数学公式：

描述：{content}

要求：
1. 公式正确表达所描述的数学关系
2. 使用标准的数学符号和记号
3. 格式清晰，便于阅读
4. 提供行内公式和行间公式两种形式
5. 如有必要，添加简要说明

请输出 LaTeX 格式的公式。`
  },

  // 表格生成
  generate_table: {
    name: '生成表格',
    icon: 'table',
    prompt: `请根据以下数据或描述生成 LaTeX 表格：

数据/描述：{content}

要求：
1. 使用 tabular 或 table 环境
2. 包含适当的标题和标签
3. 格式整洁，对齐合理
4. 如有需要，添加表格注释
5. 遵循学术论文的表格规范

请输出完整的 LaTeX 表格代码。`
  }
};

/**
 * 特定章节写作提示词
 */
export const SECTION_PROMPTS = {
  introduction: {
    name: '引言',
    prompt: `请帮我撰写论文引言部分。

研究主题/背景：
{content}

引言应包含：
1. 研究背景和意义（2-3 段）
2. 研究现状和存在的问题
3. 本研究的目的和创新点
4. 论文结构概述（可选）

要求：
- 从宏观到微观，层层递进
- 引用相关文献（用 \\cite{} 标记）
- 语言学术规范

请输出 LaTeX 格式的引言内容。`
  },

  literature_review: {
    name: '文献综述',
    prompt: `请帮我撰写文献综述部分。

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
- 使用 \\cite{} 标记引用
- 突出研究空白

请输出 LaTeX 格式的文献综述内容。`
  },

  methodology: {
    name: '研究方法',
    prompt: `请帮我撰写研究方法部分。

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

请输出 LaTeX 格式的方法部分内容。`
  },

  results: {
    name: '结果',
    prompt: `请帮我撰写研究结果部分。

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
- 引用图表使用 \\ref{}
- 数据准确

请输出 LaTeX 格式的结果部分内容。`
  },

  discussion: {
    name: '讨论',
    prompt: `请帮我撰写讨论部分。

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

请输出 LaTeX 格式的讨论部分内容。`
  },

  conclusion: {
    name: '结论',
    prompt: `请帮我撰写结论部分。

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

请输出 LaTeX 格式的结论部分内容。`
  }
};

/**
 * 提示词工具类
 */
export class LatexPrompts {
  /**
   * 获取系统提示词
   * @param {string} type - 提示词类型
   * @returns {string}
   */
  static getSystemPrompt(type = 'base') {
    return SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.base;
  }

  /**
   * 获取任务提示词
   * @param {string} taskType - 任务类型
   * @param {object} variables - 变量替换
   * @returns {string}
   */
  static getTaskPrompt(taskType, variables = {}) {
    const task = TASK_PROMPTS[taskType];
    if (!task) {
      console.error(`Unknown task type: ${taskType}`);
      return '';
    }

    let prompt = task.prompt;
    
    // 替换变量
    Object.keys(variables).forEach(key => {
      const placeholder = new RegExp(`\\{${key}\\}`, 'g');
      prompt = prompt.replace(placeholder, variables[key] || '');
    });

    return prompt;
  }

  /**
   * 获取章节写作提示词
   * @param {string} sectionType - 章节类型
   * @param {string} content - 内容
   * @returns {string}
   */
  static getSectionPrompt(sectionType, content) {
    const section = SECTION_PROMPTS[sectionType];
    if (!section) {
      console.error(`Unknown section type: ${sectionType}`);
      return '';
    }

    return section.prompt.replace('{content}', content || '');
  }

  /**
   * 构建完整的 AI 请求消息
   * @param {string} systemType - 系统提示词类型
   * @param {string} userPrompt - 用户提示词
   * @returns {Array}
   */
  static buildMessages(systemType, userPrompt) {
    return [
      { role: 'system', content: this.getSystemPrompt(systemType) },
      { role: 'user', content: userPrompt }
    ];
  }

  /**
   * 获取所有可用任务
   * @returns {Array}
   */
  static getAvailableTasks() {
    return Object.keys(TASK_PROMPTS).map(key => ({
      id: key,
      ...TASK_PROMPTS[key]
    }));
  }

  /**
   * 获取所有可用章节
   * @returns {Array}
   */
  static getAvailableSections() {
    return Object.keys(SECTION_PROMPTS).map(key => ({
      id: key,
      ...SECTION_PROMPTS[key]
    }));
  }
}

export default LatexPrompts;
