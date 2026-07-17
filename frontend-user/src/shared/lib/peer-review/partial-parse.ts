/**
 * 智能审稿 · 流式 JSON 增量解析。
 *
 * agent 在 SSE 通道里逐 token 吐 JSON, 这里在文本"还没闭合"的状态下就能把
 * 已写好的 scalar 字段、已闭合的数组对象逐个抽出来, 让前端把"半成品 JSON"
 * 渲染成最终的结构化样式 —— 用户看到 dimension 卡片 / line comment 卡片
 * 一个一个滑入, 而不是一坨 raw JSON 文本。
 *
 * 设计原则:
 *   - 不要求 JSON 整体合法; 只识别已闭合的字段 / 已闭合的数组对象
 *   - 字符串 / 数组对象使用手写状态机, 比通用 partial-json 库更可控且 0 依赖
 *   - 单测可独立运行 — 没有 React / DOM 依赖
 */

import type {
  ChiefDecision,
  DimensionScore,
  LineComment,
  MacroComment,
  ReviewerResponse,
} from './types';

// ─── Reviewer (alpha/beta/gamma) ─────────────────────────────────────────

export interface PartialReviewerOutput {
  expertise?: string;
  score?: number;
  recommendation?: ChiefDecision;
  /** 已闭合的 dimension 对象, 可能 0-4 条 */
  dimensions: DimensionScore[];
  /** 已闭合的 line comment 对象, 可能 0-N 条 */
  lineComments: LineComment[];
  macroComments: MacroComment[];
  finalSummary?: string;
  /** 总字符数 — 给「N 字」进度文案用 */
  totalChars: number;
}

export function parsePartialReviewer(text: string): PartialReviewerOutput {
  return {
    expertise: extractStringField(text, 'expertise'),
    score: extractNumberField(text, 'score'),
    recommendation: extractStringField(text, 'recommendation') as ChiefDecision | undefined,
    dimensions: extractObjectsInArray(text, 'dimensions') as DimensionScore[],
    lineComments: extractObjectsInArray(text, 'line_comments') as LineComment[],
    macroComments: extractObjectsInArray(text, 'macro_comments') as MacroComment[],
    finalSummary: extractStringField(text, 'final_summary'),
    totalChars: text.length,
  };
}

/**
 * 取一份报告的"有效推荐 + 分数": 优先用后端结构化字段, 缺失时(旧脏数据 / 后端 JSON 解析失败)
 * 从 contentMd 用宽松解析器复原。让状态栏 / 侧栏摘要跟 tab 内容(也走宽松解析)保持一致,
 * 不会出现"已完成却显示 等待中 / — "的割裂。reviewer 与 chief 共用 (字段名一致)。
 * 入参用结构化最小形, 避免依赖 ReviewReport 类型 (保持本文件零业务耦合)。
 */
export function effectiveResult(report: {
  recommendation?: ChiefDecision;
  score?: number;
  contentMd?: string;
}): { recommendation?: ChiefDecision; score?: number } {
  let recommendation = report.recommendation;
  let score = report.score;
  if ((recommendation == null || score == null) && report.contentMd) {
    const p = parsePartialReviewer(report.contentMd);
    recommendation = recommendation ?? p.recommendation;
    score = score ?? p.score;
  }
  return { recommendation, score };
}

// ─── Chief 主审 ──────────────────────────────────────────────────────────

export interface PartialChiefOutput {
  score?: number;
  recommendation?: ChiefDecision;
  rulingSummary?: string;
  rulingParagraph?: string;
  reviewerResponses: ReviewerResponse[];
  mustFix: string[];
  suggestions: string[];
  deadlineDays?: number;
  summaryForAuthor?: string;
  totalChars: number;
}

export function parsePartialChief(text: string): PartialChiefOutput {
  return {
    score: extractNumberField(text, 'score'),
    recommendation: extractStringField(text, 'recommendation') as ChiefDecision | undefined,
    rulingSummary: extractStringField(text, 'ruling_summary'),
    rulingParagraph: extractStringField(text, 'ruling_paragraph'),
    reviewerResponses: extractObjectsInArray(text, 'reviewer_responses') as ReviewerResponse[],
    mustFix: extractStringsInArray(text, 'must_fix'),
    suggestions: extractStringsInArray(text, 'suggestions'),
    deadlineDays: extractNumberField(text, 'deadline_days'),
    summaryForAuthor: extractStringField(text, 'summary_for_author'),
    totalChars: text.length,
  };
}

// ─── Helpers (private) ───────────────────────────────────────────────────

/**
 * 抽 "field":"value" 字符串字段。
 * 优先完整闭合, 退化为部分字符串(尾巴未闭合)。两种都做转义还原。
 */
function extractStringField(text: string, field: string): string | undefined {
  const closed = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(text);
  if (closed) return unescapeJson(closed[1]);
  const open = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)$`).exec(text);
  if (open) return unescapeJson(open[1]);
  return undefined;
}

/** 抽 "field":42 / "field":42.5 数字字段 */
function extractNumberField(text: string, field: string): number | undefined {
  const m = new RegExp(`"${field}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(text);
  return m ? Number(m[1]) : undefined;
}

/**
 * 抽 "field":[{...},{...},...] 中所有**已闭合**的对象。
 * 字符级状态机: 跟踪 brace depth + in-string + 转义, depth 从 1→0 时收一个对象。
 * 数组本身未闭合 / 最后一个对象未闭合都没关系 — 已闭合的部分照样能输出。
 */
function extractObjectsInArray(text: string, field: string): unknown[] {
  const head = new RegExp(`"${field}"\\s*:\\s*\\[`).exec(text);
  if (!head) return [];
  const out: unknown[] = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let escape = false;

  for (let i = head.index + head[0].length; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (c === '\\') escape = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try {
          out.push(JSON.parse(text.slice(objStart, i + 1)));
        } catch {
          // depth tracking 已经保证语法合法; 不行就跳过, 等下一次重新解析
        }
        objStart = -1;
      }
    } else if (c === ']' && depth === 0) {
      break;
    }
  }
  return out;
}

/**
 * 抽 "field":["a","b",...] 中所有**已闭合**的字符串。
 * 跟 extractObjectsInArray 类似, 但收集字符串而非对象。
 */
function extractStringsInArray(text: string, field: string): string[] {
  const head = new RegExp(`"${field}"\\s*:\\s*\\[`).exec(text);
  if (!head) return [];
  const out: string[] = [];
  let inStr = false;
  let strStart = -1;
  let escape = false;

  for (let i = head.index + head[0].length; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (inStr) {
      if (c === '\\') escape = true;
      else if (c === '"') {
        try {
          out.push(JSON.parse(text.slice(strStart, i + 1)));
        } catch {
          // skip
        }
        inStr = false;
      }
      continue;
    }
    if (c === '"') {
      inStr = true;
      strStart = i;
    } else if (c === ']') {
      break;
    }
  }
  return out;
}

function unescapeJson(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}
