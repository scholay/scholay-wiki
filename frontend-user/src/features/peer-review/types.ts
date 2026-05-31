/**
 * 智能审稿 feature 类型 —— 前端先建模,后端按这些字段对齐。
 *
 * 模型映射 .pen `njIUu / vfCZS / DA8l7 / RYbJN`(期刊 4 步)+
 * `qGKD1 / sGFTb / Auz6H / TdIIn`(毕业 4 步)+ `bT0Dp / O4oP1`(工单)。
 *
 * 设计原则:
 *   - 期刊 / 毕业 两条流共用同一张投稿主表(`Submission`),差别在 `mode` 和
 *     step2 / step3 各自的目标对象(target = 期刊 / 院校)、letter(coverLetter / reviewLetter)。
 *   - 文件存 MinIO(沿用 feedback attachment tmp/ 模式),DB 只存 objectKey + 元数据。
 *   - reports 是 agent 串行 3+1 轮跑完的产物,UI 上分 4 个 tab。
 */

/** 投稿流程的两条分支 */
export type SubmissionMode = 'journal' | 'thesis';

/** 整体生命周期 */
export type SubmissionStatus =
  | 'draft'      // 草稿:用户还在 wizard 里
  | 'queued'     // 已提交,等 agent 取号
  | 'reviewing'  // agent 跑 3+1 轮中
  | 'completed'  // 4 份报告齐了
  | 'failed';    // agent 异常 / 配额不足

/**
 * Wizard 异步 agent 调用的状态机(后端 compute_state 列)。
 *
 *   idle              空闲, 可点下一步
 *   computing_meta    Step1→2 抽 meta 中
 *   computing_letter  Step2→3 起草 letter 中
 *   reviewing         Step4 投递后 4 轮审稿中
 *   failed            agent 异常, computeError 给用户展示
 *
 * 前端用它决定:渲染骨架屏 / 启用"下一步" / 是否 polling submission detail。
 */
export type ComputeState =
  | 'idle'
  | 'computing_meta'
  | 'computing_letter'
  | 'reviewing'
  | 'failed';

/** 4 步 wizard 进度 */
export type WizardStep = 1 | 2 | 3 | 4;

/** 上传文件的语义角色 */
export type AssetRole =
  | 'manuscript'   // 主稿件正文 (.docx/.pdf)
  | 'attachment';  // 附属材料 (figures/data/cover_letter_draft/...)

/** 单个附件的归档分类(用户在 Step1 右侧给附件打的标签) */
export type AttachmentCategory =
  | 'figures'        // 图表/曲线
  | 'data'           // 数据集
  | 'cover_letter'   // cover letter 草稿
  | 'response'       // 答复审稿意见
  | 'supplement'     // 补充材料
  | 'other';

export interface SubmissionAsset {
  id: number;
  submissionId: number;
  role: AssetRole;
  category?: AttachmentCategory;
  filename: string;
  size: number;
  mime: string;
  sha256?: string;
  /** 仅 manuscript 有 — agent 解析前 backend 同步抽出来的纯文本字符数 */
  textChars?: number;
  createdAt: string;
}

/** 期刊目标(.pen vfCZS) */
export interface JournalTarget {
  journalId: number;
  canonicalName: string;
  issns?: string[];
  /** AI 推荐理由(只在 source='ai' 时有) */
  aiReason?: string;
  /**
   * 期刊定位元数据 —— 展示用 + **随投稿一起提交给后续审稿流程**
   * (后端存 journal_meta_json,buildCommonContext 注入审稿 prompt,让门槛贴合期刊档次)。
   * 自定义期刊 (journalId<=0) 这些字段都为空。
   */
  jcrImpactFactor?: number;
  jcrQuartile?: string;
  /** 中科院分区 (1-4) */
  fqbQuartile?: string;
  /** CCF 等级 (A/B/C) */
  ccfRank?: string;
  publisher?: string;
  country?: string;
  /** OpenAlex h-index */
  hIndex?: number;
  isOA?: boolean;
}

/** 院校目标(.pen sGFTb)*/
export interface SchoolTarget {
  schoolName: string;
  degreeType: 'phd' | 'master' | 'bachelor';
  disciplineField: string;
  advisorName?: string;
}

/**
 * agent 抽出的额外元数据(keywords / subjects / manuscriptType)。
 * title/abstract 仍在 Submission 顶层,不在这里重复。
 */
export interface ExtraMeta {
  keywords?: string[];
  subjects?: string[];
  manuscriptType?: 'research' | 'review' | 'short_communication';
}

/** wizard 完成后的最终 submission 快照 */
export interface Submission {
  id: number;
  userId: number;
  mode: SubmissionMode;
  status: SubmissionStatus;
  step: WizardStep;
  title?: string;
  abstract?: string;
  /** 0058: keywords / subjects / manuscriptType,持久化到 extra_meta_json */
  extraMeta?: ExtraMeta;
  /** 主稿件文件 id(快捷引用) */
  manuscriptAssetId?: number;
  /** 期刊模式:target 是 JournalTarget;毕业模式:SchoolTarget */
  journalTarget?: JournalTarget;
  schoolTarget?: SchoolTarget;
  /** Step3 信件正文(Markdown 或 HTML 富文本)*/
  letterBody?: string;
  /** Step4 用户同意双盲规范的时间戳 */
  agreedAt?: string;
  /** agent session id(draft 创建时就分配, 整个 wizard 复用) */
  agentSessionId?: string;
  /** 0058: 异步 agent 调用状态机 */
  computeState: ComputeState;
  computeError?: string;
  /** 0058: revision counters — 上游字段改动时 +1,下游 cache 自然失效 */
  assetsRevision: number;
  metaRevision: number;
  letterRevision: number;
  createdAt: string;
  updatedAt: string;
  /** Step4 投递成功的时间戳, 用于详情页时间线 / 投递成功 splash */
  submittedAt?: string;
  /** completed 后才有 */
  completedAt?: string;
}

/** agent 跑出的 4 份报告之一。审稿人 A=alpha, B=beta, C=gamma, 主审=chief。 */
export type ReviewerRole = 'alpha' | 'beta' | 'gamma' | 'chief';

/**
 * 主审决议 / 审稿人推荐。0072 后系统只输出 3 档中文内部值 "小修 / 大修 / 拒稿"(修订严重度),
 * 前端经 lib/recommendation 映射成对外编辑决议名 ((修改后)录用 / 返修 / 拒稿) + 绿/黄/红。
 * union 仍保留历史值 (录用 / 返修 / 英文 enum) 以兼容旧 report 的显示。
 */
export type ChiefDecision =
  | 'accept' | 'minor_revision' | 'major_revision' | 'reject' // 老英文 enum
  | '录用' | '返修'                                            // 老中文 (并入 小修 / 大修)
  | '小修' | '大修' | '拒稿';                                   // 当前 3 档 (内部值)

export interface DimensionScore {
  /** 科学性 | 严谨性 | 创新性 | 可读性 */
  name: string;
  /** A+/A/A-/B+/B/B-/C+/C/C-/D */
  grade: string;
  comment: string;
}

export interface LineComment {
  location: string;        // §方法 / 引言 / 图5 等
  dimension: string;       // 4 维之一
  severity: '必改' | '建议' | '参考' | string;
  quote: string;
  issue: string;
  peer_practice: string;
  suggestion: string;
}

export interface MacroComment {
  aspect: string;
  stance: '积极' | '中性' | '建议加强' | '质疑' | string;
  body: string;
}

export interface ReviewerResponse {
  reviewer: string;        // "审稿人 A" / "审稿人 B" / "审稿人 C"
  judgment: string;        // "全部同意" / "部分同意" / "有所保留"
  /** 一句话概要 (强) —— 新格式; 老 report 可能没有, 回退只显示 body */
  summary?: string;
  body: string;            // 详细复审结论 (弱, 前端可折叠默认展开)
}

/**
 * 0062 之后, ReviewReport 是 alpha/beta/gamma/chief 通用 DTO:
 *   - reviewer 字段族 (score/recommendation/dimensions/lineComments/...) 给 abc 用
 *   - chief 字段族 (rulingParagraphMd/reviewerResponses/mustFix/...) 给 chief 用
 *
 * 老 report 这些字段全空, 前端在渲染前 nil-check, 回退到 contentMd 的 markdown 展示。
 */
export interface ReviewReport {
  id: number;
  submissionId: number;
  role: ReviewerRole;
  /** 旧字段, 0062 后被 dimensions 取代 */
  scores?: Record<string, number>;
  /** 旧字段, 跟 recommendation 等价, 前端优先用 recommendation */
  decision?: ChiefDecision;
  /** 报告正文 markdown, 永远保留兜底原文 */
  contentMd: string;

  agentDurationSec?: number;
  agentTokensIn?: number;
  agentTokensOut?: number;
  createdAt: string;

  // ─── 0062 结构化字段 ─────────────────────────────────────────────
  reviewerSkillId?: number;
  skillSlug?: string;
  skillName?: string;
  score?: number;                 // 0-100
  recommendation?: ChiefDecision; // 中文 4 选 1
  expertise?: string;             // revHead 副标题
  dimensions?: DimensionScore[];
  lineComments?: LineComment[];
  macroComments?: MacroComment[];
  finalSummaryMd?: string;

  // chief 专有
  /** 主审决议一句话概要 (强) —— 新格式; 老 report 没有, 回退只显示 rulingParagraphMd */
  rulingSummaryMd?: string;
  rulingParagraphMd?: string;
  reviewerResponses?: ReviewerResponse[];
  mustFix?: string[];
  suggestions?: string[];
  deadlineDays?: number;
  summaryForAuthor?: string;
}

/** 工单列表行(.pen bT0Dp) */
export interface SubmissionListItem {
  id: number;
  mode: SubmissionMode;
  title: string;
  status: SubmissionStatus;
  /** chief decision,completed 之后才有 */
  decision?: ChiefDecision;
  /** alpha+beta+gamma 平均分,展示用 */
  scoreAvg?: number;
  /** 期刊名 / 院校名,列表第 4 列 */
  targetLabel?: string;
  submittedAt?: string;
  completedAt?: string;
}
