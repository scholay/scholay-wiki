/**
 * V2 审稿 Prompt 模板
 *
 * 五阶段自动审稿流程，充分利用 Codex CLI 的联网搜索能力。
 * 每个阶段是同一 session 内的一次 chat 调用，上下文自动延续。
 */

export interface ReviewPhase {
  id: string;
  label: string;
  labelEn: string;
  icon: string;
  buildMessage: (context: ReviewContext) => string;
  enableSearch: boolean;
}

export interface ReviewContext {
  fileName: string;
  textFileName: string;
  targetVenue: string;
  userInstructions: string;
  provider: 'codex' | 'claude';
}

const SYSTEM_PREAMBLE = `你是一位顶级学术期刊的资深审稿人（Senior Reviewer），以严苛、尖锐著称，同时具备联网搜索与验证能力。你的首要原则：

1. **绝不客气** — 学术审稿必须直击问题，不做无意义的恭维
2. **证据驱动** — 每一个批评都必须指出具体段落/页码/引用编号
3. **联网验证** — 你必须利用搜索能力去验证论文中的每一条关键声明和引用
4. **学术诚信至上** — 对伪造数据、编造引用零容忍

`;

const CLAUDE_SEARCH_DISCLAIMER = `\n\n⚠️ 注意：当前使用 Claude 模型，不具备联网搜索能力。以下验证基于模型自身知识库，结果可能不完整。建议切换至 Codex 模型以获得联网验证能力。\n`;

function buildVenueInstruction(targetVenue: string): string {
  if (!targetVenue.trim()) return '';
  return `\n目标投稿期刊/会议：${targetVenue}。请据此调整审稿标准和评价尺度。\n`;
}

function buildUserInstruction(instructions: string): string {
  if (!instructions.trim()) return '';
  return `\n用户附加审稿要求：${instructions}\n`;
}

export const REVIEW_PHASES: ReviewPhase[] = [
  // ─── 第一阶段：论文解构与整体评估 ───
  {
    id: 'overview',
    label: '论文解构',
    labelEn: 'Paper Overview',
    icon: 'FileSearch',
    enableSearch: false,
    buildMessage: (ctx) => `${SYSTEM_PREAMBLE}

## 任务：论文解构与整体评估

论文已预提取为文本文件。${ctx.textFileName ? `请直接通过 \`cat ${ctx.textFileName}\` 读取全文内容。` : `请用 \`pdftotext -layout ${ctx.fileName} paper.txt && cat paper.txt\` 读取论文。`}

完成以下工作：

### 1. 论文基本信息提取
- 标题、作者列表、摘要
- 研究领域与子领域
- 论文类型（实证研究/综述/理论框架/技术报告/案例研究）

### 2. 结构完整性审查
逐一检查以下结构是否存在且合格：
- 摘要（是否包含目的、方法、结果、结论）
- 引言（研究背景、问题陈述、研究目标）
- 文献综述（是否有独立章节或融入引言）
- 方法论（研究设计、数据收集、分析方法）
- 结果/发现
- 讨论
- 结论与局限性
- 参考文献列表

### 3. 初步印象
- 用 1-2 段话给出你作为审稿人的第一印象
- 指出最明显的 3 个强项和 3 个弱项
- 初步判断论文的学术贡献级别（突破性/增量性/重复性）

### 4. 提取参考文献清单
将论文中**所有**参考文献按编号列出（作者、年份、标题、期刊/会议），后续阶段需要逐一验证。
${buildVenueInstruction(ctx.targetVenue)}${buildUserInstruction(ctx.userInstructions)}

请以 Markdown 格式输出，使用清晰的标题层级。`,
  },

  // ─── 第二阶段：参考文献真实性验证（杀手锏） ───
  {
    id: 'references',
    label: '引用验证',
    labelEn: 'Reference Verification',
    icon: 'ShieldCheck',
    enableSearch: true,
    buildMessage: (ctx) => {
      const searchDisclaimer =
        ctx.provider === 'claude' ? CLAUDE_SEARCH_DISCLAIMER : '';

      return `## 任务：参考文献真实性验证（严格模式）${searchDisclaimer}

基于上一轮提取的参考文献清单，对**每一条**参考文献执行以下验证：

### 验证步骤（逐条执行）
1. **搜索论文标题** — 在搜索引擎中精确搜索论文标题，确认该论文是否真实存在
2. **交叉验证** — 尝试在 Google Scholar、Semantic Scholar、CrossRef、DBLP 等学术数据库中查找
3. **验证作者信息** — 检查搜到的论文作者是否与引用中一致
4. **验证年份** — 检查发表年份是否匹配
5. **验证期刊/会议** — 检查发表venue是否匹配
6. **DOI 验证** — 如果引用中有 DOI，验证是否可解析

### 输出格式（对每条引用）

\`\`\`
[编号] 作者 (年份). "标题". 期刊/会议.
├─ 状态: ✅ 已验证 / ⚠️ 信息有误 / ❌ 疑似伪造 / ❓ 无法确认
├─ 搜索结果: (简述搜索到的信息)
├─ 不一致项: (如有)
└─ 严重程度: 低/中/高/致命
\`\`\`

### 重点关注
- **完全搜索不到的论文** — 极可能是 AI 生成的幻觉引用，标记为 ❌ 疑似伪造
- **作者署名不匹配** — 可能是张冠李戴
- **年份/期刊错误** — 可能混淆了不同论文
- **自引比例过高** — 统计自引数量和占比

### 最终汇总
- 总引用数、已验证数、疑似伪造数、信息错误数、无法确认数
- 自引比例
- 引用年代分布（近5年占比）
- 严重性评估`;
    },
  },

  // ─── 第三阶段：理论深度与文献覆盖度 ───
  {
    id: 'depth',
    label: '理论深度',
    labelEn: 'Theoretical Depth',
    icon: 'BookOpen',
    enableSearch: true,
    buildMessage: (ctx) => {
      const searchDisclaimer =
        ctx.provider === 'claude' ? CLAUDE_SEARCH_DISCLAIMER : '';

      return `## 任务：理论深度与文献覆盖度审查${searchDisclaimer}

基于前两轮的分析，现在深入审查论文的理论基础和文献覆盖范围。

### 1. 关键文献遗漏检查
搜索该研究领域的**里程碑论文**和**高被引论文**，检查论文是否遗漏了以下类型的重要工作：
- 该领域的奠基性论文（seminal papers）
- 高被引综述论文（review articles with >100 citations）
- 直接相关的近期研究（近 2 年内的重要成果）
- 提出相反观点或挑战性结论的论文

对每个遗漏的重要文献，说明：
- 论文信息（标题、作者、年份、被引次数）
- 为什么这篇论文对本研究不可或缺
- 遗漏它对论文论证链的影响

### 2. 文献综述质量评估
- **广度**：是否覆盖了足够的相关研究流派
- **深度**：是否对关键文献进行了批判性分析而非简单罗列
- **逻辑性**：文献综述是否构建了清晰的研究空白（research gap）
- **时效性**：引用文献的时间分布是否合理
- **自引偏向**：是否过度引用自己或同一团队的工作

### 3. 理论框架评估
- 所采用的理论/模型是否适合研究问题
- 是否存在更合适的替代理论框架
- 理论与假设之间的逻辑推导是否严密
- 是否忽略了重要的理论边界条件

### 4. 研究定位
- 该论文声称的创新点是否真的是新的（搜索验证）
- 是否已有类似研究发表（检查重复发表嫌疑）`;
    },
  },

  // ─── 第四阶段：方法论与逻辑严谨性 ───
  {
    id: 'methodology',
    label: '方法论审查',
    labelEn: 'Methodology Review',
    icon: 'FlaskConical',
    enableSearch: false,
    buildMessage: (_ctx) =>
      `## 任务：方法论与逻辑严谨性审查

对论文的研究方法和逻辑推理进行严格审查。

### 1. 研究设计
- 研究设计类型是否明确且合理
- 样本量/数据规模是否足够（如适用，是否有功效分析）
- 对照组/基线设置是否恰当
- 变量定义是否清晰、操作化是否合理
- 是否存在混淆变量未被控制

### 2. 数据收集与处理
- 数据来源是否可靠、可追溯
- 数据预处理步骤是否完整描述
- 缺失数据处理方式是否合理
- 是否存在数据泄漏（data leakage）风险
- 伦理审查/知情同意是否到位（如适用）

### 3. 统计/分析方法
- 所用统计方法是否适合数据类型和研究假设
- 是否报告了效应量（effect size），而非仅依赖 p 值
- 多重比较是否做了校正（Bonferroni/FDR 等）
- 是否存在 p-hacking 或选择性报告嫌疑
- 模型假设是否被验证（正态性、独立性、线性等）
- 稳健性检查/敏感性分析是否充分

### 4. 结果与讨论的逻辑链
- 数据是否充分支撑所有结论
- 是否存在过度推广（generalization beyond data）
- 替代解释是否被讨论和排除
- 局限性讨论是否诚实、全面
- 因果关系推断是否合理（相关≠因果）

### 5. 可重复性评估
- 方法描述是否足够详细，允许独立重复
- 代码/数据是否公开或承诺公开
- 关键参数设置是否完整记录

对每个问题，明确指出：
- 具体位置（章节/页码/段落）
- 问题性质（方法缺陷/表述不清/逻辑漏洞/遗漏）
- 严重程度（Major/Minor/Suggestion）
- 修改建议`,
  },

  // ─── 第五阶段：综合审稿报告 ───
  {
    id: 'report',
    label: '综合报告',
    labelEn: 'Final Report',
    icon: 'ClipboardCheck',
    enableSearch: false,
    buildMessage: (ctx) =>
      `## 任务：输出综合审稿报告

汇总前四轮所有审查结果，输出一份完整的、结构化的审稿报告。

### 报告格式

---

# 审稿报告 / Peer Review Report

## 基本信息
- 论文标题：
- 审稿日期：${new Date().toISOString().split('T')[0]}
${ctx.targetVenue ? `- 目标期刊/会议：${ctx.targetVenue}` : ''}

## 一、总体评价 (Overall Assessment)
用 2-3 段话总结论文的整体质量、贡献和主要问题。给出明确的发表建议：
- **Accept** — 可直接接收
- **Minor Revision** — 小修后接收
- **Major Revision** — 需大幅修改后重审
- **Reject** — 建议拒稿

## 二、致命问题 (Critical Issues) 🔴
列出所有可能导致拒稿的严重问题（如有），每个问题包含：
- 问题描述
- 具体位置
- 为什么是致命的
- 修复难度评估

## 三、重要问题 (Major Issues) 🟠
必须修改但不至于拒稿的问题。

## 四、次要问题 (Minor Issues) 🟡
建议修改的小问题。

## 五、参考文献验证结果摘要 📚
- 已验证 / 疑似伪造 / 信息错误 / 无法确认 的统计
- 列出所有 ❌ 和 ⚠️ 的引用

## 六、文献覆盖度评估 📖
- 遗漏的关键文献
- 文献综述质量评分（1-10）

## 七、方法论评估 🔬
- 方法论评分（1-10）
- 关键方法论问题汇总

## 八、写作质量 ✍️
- 语言表达、图表质量、格式规范

## 九、给作者的建议 💡
按优先级排列的具体修改建议。

---

请确保报告措辞专业、尖锐但公正。每一个评价都有证据支撑。`,
  },
];

export const TOTAL_PHASES = REVIEW_PHASES.length;
