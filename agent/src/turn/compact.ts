// 上下文滚动摘要压缩(设计:docs/research/context-compaction-2026-07/DESIGN.md)。
//
// 近上限 / 超窗口时,把**最老的若干回合**摘要成一个「摘要对」(user 摘要正文 + assistant 确认),
// 最近 keepTurns 个回合保留原文;关键产物(论文 ID / 文件路径 / URL)从被压缩部分原样保留
// (学术场景精度不能丢)。摘要用便宜档(fastCompletion=haiku)。失败抛错 → 调用方回落硬截断。
//
// 结构安全(Anthropic 强约束,与 window.ts 同源):在**回合起点**切(isTurnStart),摘要对是
// user→assistant,前置后再接最近回合(其首条恒为 user turn 起点)→ 首条恒 user、role 交替、
// tool_use/tool_result 配对不被截断。

import type Anthropic from "@anthropic-ai/sdk";
import { fastCompletion } from "./completion.ts";
import { isTurnStart } from "./window.ts";
import { estimateTokens, keepRecentByTokenBudget, pruneOldToolResults, turnStarts } from "./context-budget.ts";
import { log } from "../obs/log.ts";
import type { CallUsage } from "./turnLoop.ts";

// 摘要器输入上限:老回合渲染成文本后 cap 到这里(超则丢最老),保证「读得下」便宜档窗口。
const SUMMARY_INPUT_CHARS = Number(process.env.EXECUTOR_COMPACT_INPUT_CHARS || 48_000);
// 摘要输出上限 token(便宜档一次调用)。
const SUMMARY_MAX_TOKENS = Number(process.env.EXECUTOR_COMPACT_MAX_TOKENS || 1200);

export interface CompactResult {
  messages: Anthropic.MessageParam[];
  droppedTurns: number;
  usage: CallUsage;
}

// ─── 工具调用折行(2026-08 证据账本 P0)────────────────────────────────────────
// 「把一次工具调用折成一行文本」的唯一实现,两处消费:
//   ① 本文件 renderForSummary(滚动摘要的老回合渲染);
//   ② server/shadowTurn.convertFlatToAnthropic(冷重播 seed 的历史折叠)。
// 刻意只折**一行**:把全量 tool_result 折回上下文 = 每轮重发 ~100K token,不可持续
// (2026-08 证据账本 P0 · 终稿否决清单 #2)。完整题录的真源是 evidence/ledger.jsonl。

// 参数里优先展示的键。检索类工具的 query 是「上一轮到底搜了什么」的唯一载体 —— 旧版
// renderForSummary 只写 `助手[调用X]` 把 input 整个丢掉,导致该问题在压缩后永久不可回答。
const TOOL_ARG_KEYS = [
  "query", "q", "keyword", "keywords", "search_query", "text", "question", "title",
  "doi", "ids", "paper_id", "paperId", "file_path", "path", "pattern", "command", "url",
];
// tool_result JSON 里承载「一条条记录」的常见数组键(只用于数个数,不解析题录 —— 题录归 evidence/parse)。
const RESULT_ARRAY_KEYS = [
  "items", "papers", "results", "data", "recommended_papers", "snippets", "matches", "hits", "authors", "journals",
];

function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= n ? one : one.slice(0, n) + "…";
}

/** 把工具入参折成简短可读串(最多两个键);无已知键则回落到 input 的紧凑 JSON 前缀。 */
export function describeToolCall(input: unknown, max = 120): string {
  if (!input || typeof input !== "object") return "";
  const rec = input as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of TOOL_ARG_KEYS) {
    if (!(k in rec)) continue;
    const v = rec[k];
    let s = "";
    if (typeof v === "string") s = v;
    else if (typeof v === "number" || typeof v === "boolean") s = String(v);
    else if (Array.isArray(v)) s = v.slice(0, 3).map((x) => String(x)).join(",") + (v.length > 3 ? `…(${v.length})` : "");
    if (!s.trim()) continue;
    parts.push(`${k}="${clip(s, max)}"`);
    if (parts.length >= 2) break;
  }
  if (parts.length > 0) return parts.join(" ");
  try {
    return clip(JSON.stringify(rec), max);
  } catch {
    return "";
  }
}

/** tool_result 的 content(字符串 / 块数组 / 任意 JSON)拍平成文本。块数组要取**内层 text 原文**,
 *  不能对整个数组 JSON.stringify —— 那会把内层 JSON 的引号全转义,后续任何按原文的抽取都失效。 */
export function flattenToolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const blk = b as { type?: string; text?: unknown };
        if (blk && blk.type === "text" && typeof blk.text === "string") return blk.text;
        try {
          return JSON.stringify(b);
        } catch {
          return "";
        }
      })
      .join("\n");
  }
  try {
    return JSON.stringify(content ?? "");
  } catch {
    return "";
  }
}

/** 数「返回了多少条记录」:能确定条数才报条数,否则报字符数 —— 不猜(猜出来的数就是新的编造源)。 */
function countRecords(text: string): number {
  const t = text.trim();
  if (!t || (t[0] !== "{" && t[0] !== "[")) return -1;
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    return -1;
  }
  if (Array.isArray(parsed)) return parsed.length;
  if (parsed && typeof parsed === "object") {
    const rec = parsed as Record<string, unknown>;
    for (const k of RESULT_ARRAY_KEYS) {
      if (Array.isArray(rec[k])) return (rec[k] as unknown[]).length;
    }
  }
  return -1;
}

/** 把一条 tool_result 折成结果摘要:成功报条数/字符数,失败明写失败(冷重播时防「复述成功」)。 */
export function summarizeToolOutcome(result?: { content?: unknown; is_error?: boolean } | null): string {
  if (!result) return "(结果未记录)";
  const text = flattenToolResultText(result.content);
  if (result.is_error) return `失败:${clip(text, 80) || "未返回原因"}`;
  const n = countRecords(text);
  return n >= 0 ? `命中 ${n} 条` : `返回 ${text.length} 字符`;
}

/** 把一段消息渲染成便于摘要的纯文本:剥掉 tool_use/tool_result 的大 JSON,只留角色 + 文本要点。 */
function renderForSummary(messages: Anthropic.MessageParam[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const role = m.role === "user" ? "用户" : "助手";
    if (typeof m.content === "string") {
      if (m.content.trim()) lines.push(`${role}: ${m.content.trim()}`);
      continue;
    }
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content as Anthropic.ContentBlockParam[]) {
      const t = (b as { type?: string }).type;
      if (t === "text") {
        const txt = String((b as { text?: unknown }).text ?? "").trim();
        if (txt) lines.push(`${role}: ${txt}`);
      } else if (t === "tool_use") {
        // 2026-08 证据账本 P0:旧版只写 `助手[调用X]`,把 input 整个丢掉 —— 一旦压缩发生,
        // 「上一轮搜的是什么」在本会话内永久不可回答。保留 query/路径等关键入参(不保留整个大 JSON)。
        const name = String((b as { name?: unknown }).name ?? "工具");
        const args = describeToolCall((b as { input?: unknown }).input);
        lines.push(args ? `助手[调用${name} ${args}]` : `助手[调用${name}]`);
      } else if (t === "tool_result") {
        // 工具结果只留前若干字(避免把整段 JSON 灌进摘要);产物另行正则抽取。
        const raw = (b as { content?: unknown }).content;
        const s = typeof raw === "string" ? raw : JSON.stringify(raw);
        lines.push(`工具结果: ${s.slice(0, 240)}`);
      }
    }
  }
  return lines.join("\n");
}

/** 从被压缩文本里抽关键产物(原样保留):论文 ID / DOI / arXiv / 会话内文件路径 / URL(P2 补全)。 */
function extractArtifacts(text: string): string[] {
  const set = new Set<string>();
  const push = (re: RegExp) => {
    for (const m of text.matchAll(re)) set.add(m[0]);
  };
  push(/\b(?:stc|olx|pmd|semantic|openalex):[A-Za-z0-9._-]+/g); // minicod 论文 ID
  push(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/g); // DOI
  push(/\barXiv:\s?\d{4}\.\d{4,5}(?:v\d+)?/gi); // arXiv ID
  push(/\/home\/bun\/sessions\/[A-Za-z0-9/._-]+/g); // 会话 cwd 文件(绝对)
  push(/(?:^|\s)(?:\.\/)?(?:out|uploads|references)\/[A-Za-z0-9/._一-龥-]+/g); // cwd 相对交付/引用
  push(/https?:\/\/[^\s)>\]]+/g); // URL
  return [...set].map((a) => a.trim()).filter(Boolean).slice(0, 60); // 上限防爆
}

/** 组「摘要对」:user 摘要正文(含保留产物)+ assistant 确认。前置到最近回合之前。 */
function summaryPair(summary: string, artifacts: string[]): Anthropic.MessageParam[] {
  let body =
    "【较早对话的摘要】为适配当前模型的上下文窗口,以下是我们此前对话的要点总结(较早的完整内容已压缩):\n\n" +
    summary;
  if (artifacts.length > 0) {
    body += "\n\n【需保留的关键条目(原样)】\n" + artifacts.map((a) => `- ${a}`).join("\n");
  }
  return [
    { role: "user", content: body },
    { role: "assistant", content: "好的,我已了解此前对话的要点,继续为你处理。" },
  ];
}

/**
 * compactMessages:把 messages 压缩成 [摘要对, ...最近 keepTurns 回合]。
 * 回合数 ≤ keepTurns → 无可压缩,抛错交调用方(不应发生,调用方已判触发)。
 * 摘要调用失败 → 向上抛,调用方回落 windowMessages。
 */
export async function compactMessages(
  messages: Anthropic.MessageParam[],
  keepTurns: number,
): Promise<CompactResult> {
  const starts: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (isTurnStart(messages[i]!)) starts.push(i);
  }
  if (starts.length <= keepTurns) {
    throw new Error("compact: nothing to compact");
  }
  const cut = starts[starts.length - keepTurns]!; // 最近 keepTurns 回合起点
  const old = messages.slice(0, cut);
  const recent = messages.slice(cut);

  const rendered = renderForSummary(old);
  const artifacts = extractArtifacts(rendered);
  // 分层/递归摘要(P2):超 SUMMARY_INPUT_CHARS 时切块逐段摘要,再把段摘要合并成总摘要;
  // 不再「静默丢最老一段」(学术场景对最早的目标/约束敏感)。
  const { summary, usage } = await summarizeText(rendered);
  if (!summary.trim()) {
    throw new Error("compact: empty summary");
  }

  log.info("context compacted (rolling summary)", {
    dropped_turns: starts.length - keepTurns,
    old_msgs: old.length,
    kept_msgs: recent.length,
    summary_chars: summary.length,
    artifacts: artifacts.length,
  });

  return {
    messages: [...summaryPair(summary, artifacts), ...recent],
    droppedTurns: starts.length - keepTurns,
    usage,
  };
}

// ─── P2:重试 + 分层递归摘要 ─────────────────────────────────────────────────

const emptyUsage: CallUsage = {
  input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, model: "",
};
function addUsage(a: CallUsage, b: CallUsage): CallUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_tokens: a.cache_read_tokens + b.cache_read_tokens,
    cache_creation_tokens: a.cache_creation_tokens + b.cache_creation_tokens,
    model: b.model || a.model,
  };
}

const SUMMARY_SYSTEM =
  "你是对话摘要助手。把下面这段学术检索/写作对话压缩成简洁要点(中文,150-400 字):" +
  "保留用户的目标、已确认的关键结论、进行到哪一步、以及后续待办。忽略寒暄与冗余。只输出摘要正文。";

/** 一次摘要调用,带有界退避重试(便宜档偶发抖动 → 重试而非直接回落硬截断)。 */
async function summarizeOnce(system: string, input: string): Promise<{ summary: string; usage: CallUsage }> {
  let lastErr: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      const { text, usage } = await fastCompletion(system, input, SUMMARY_MAX_TOKENS);
      if (text.trim()) return { summary: text.trim(), usage };
      lastErr = new Error("empty summary");
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** 分层递归摘要:文本 <= 输入上限直接摘;超则切块逐段摘要,再把段摘要合并成总摘要(不丢最老)。 */
async function summarizeText(text: string): Promise<{ summary: string; usage: CallUsage }> {
  if (text.length <= SUMMARY_INPUT_CHARS) {
    return summarizeOnce(SUMMARY_SYSTEM, text);
  }
  // 切块(按行边界靠近 SUMMARY_INPUT_CHARS),逐段摘要
  const chunks: string[] = [];
  const lines = text.split("\n");
  let cur = "";
  for (const ln of lines) {
    if (cur.length + ln.length + 1 > SUMMARY_INPUT_CHARS && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += (cur ? "\n" : "") + ln;
  }
  if (cur) chunks.push(cur);
  let usage = emptyUsage;
  const partials: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const r = await summarizeOnce(
      `你是对话摘要助手。这是一段较长学术对话的第 ${i + 1}/${chunks.length} 部分,压缩成要点(中文,100-250 字),保留目标/结论/进度/待办/关键数据。只输出摘要。`,
      chunks[i]!,
    );
    usage = addUsage(usage, r.usage);
    partials.push(`【第 ${i + 1} 段】${r.summary}`);
  }
  // 合并段摘要成总摘要(段摘要已很短,合起来通常 << 输入上限)
  const merged = partials.join("\n\n");
  if (merged.length <= SUMMARY_INPUT_CHARS) {
    const r = await summarizeOnce(
      "把下面各段摘要合并成一份连贯的总摘要(中文,200-450 字),保留用户目标、关键结论、当前进度、后续待办。只输出总摘要。",
      merged,
    );
    return { summary: r.summary, usage: addUsage(usage, r.usage) };
  }
  return { summary: merged, usage }; // 极端:段摘要仍超上限,直接拼(已远小于原文)
}

// ─── P0/P1:分层压缩编排 ─────────────────────────────────────────────────────

/** 摘要 memoize:同一「被压缩边界 + 老内容签名」重复请求直接返回缓存,避免每消息重算 + 破坏上游前缀缓存。 */
export interface CompactCache {
  key: string; // 老内容签名(边界下标 + 老段字符数)
  messages: Anthropic.MessageParam[]; // 压缩后的全量(摘要对 + 最近回合)
}

/** reduceForWindow 分层降级到「估算 token <= 目标」:①裁老 tool_result ②滚动摘要 ③按 token 预算硬裁。 */
export interface ReduceResult {
  messages: Anthropic.MessageParam[];
  actions: string[]; // 依次应用了哪些层
  usage?: CallUsage; // 摘要调用用量(有摘要时)
  cache?: CompactCache;
}

const SUMMARY_MARK = "【较早对话的摘要】";
function isSummaryPrefix(messages: Anthropic.MessageParam[]): boolean {
  const m0 = messages[0];
  return (
    !!m0 && m0.role === "user" && typeof m0.content === "string" && m0.content.startsWith(SUMMARY_MARK) &&
    messages[1]?.role === "assistant"
  );
}

export async function reduceForWindow(
  messages: Anthropic.MessageParam[],
  ctxWindow: number,
  opts: { keepTurns: number; targetPct: number; cache?: CompactCache; currentTokens?: number },
): Promise<ReduceResult> {
  const target = Math.floor((ctxWindow * opts.targetPct) / 100);
  const estMsgs = estimateTokens(messages);
  // 真实占用:调用方传入的「最后一次 call 的真实 prompt(含 system+tools+cache)」与消息估算取大。
  // 触发与执行统一到同一信号 —— 修复此前「外层用 max(lastCtx,est) 触发、内层只用 estimateTokens 复核,
  // est 偏低就立刻空转返回」的分歧(线上 0 条 context reduced 的直接成因)。currentTokens 缺省则退回纯估算。
  const current = Math.max(opts.currentTokens ?? 0, estMsgs);
  if (target <= 0 || current <= target) {
    return { messages, actions: [] };
  }
  // 固定前缀(system prompt + tools schema)+ 估算误差 = 真实占用 − 消息估算。裁 messages 时要为它让出空间,
  // 否则把 messages 压到 target 后加回这块前缀仍会溢出。msgTarget = 真正留给 messages 的预算(估算口径)。
  const overhead = Math.max(0, current - estMsgs);
  const msgTarget = Math.max(0, target - overhead);
  const actions: string[] = [];
  let msgs = messages;

  // ① 最廉价层:裁早于最近 keepTurns 回合的 tool_result 正文(不动 LLM)。
  const pruned = pruneOldToolResults(msgs, opts.keepTurns);
  if (pruned.pruned > 0) {
    msgs = pruned.messages;
    actions.push(`prune:${pruned.pruned}`);
    if (estimateTokens(msgs) <= msgTarget) return { messages: msgs, actions };
  }

  // ② 滚动摘要层:摘要最老回合。memoize:老段签名命中缓存则跳过 LLM。
  let usage: CallUsage | undefined;
  let cache: CompactCache | undefined;
  const starts = turnStarts(msgs);
  if (starts.length > opts.keepTurns) {
    const cut = starts[starts.length - opts.keepTurns]!;
    const oldSig = `${cut}:${estimateTokens(msgs.slice(0, cut))}`;
    if (opts.cache && opts.cache.key === oldSig) {
      msgs = opts.cache.messages;
      cache = opts.cache;
      actions.push("compact:cached");
    } else {
      try {
        const r = await compactMessages(msgs, opts.keepTurns);
        msgs = r.messages;
        usage = r.usage;
        cache = { key: oldSig, messages: msgs };
        actions.push(`compact:${r.droppedTurns}`);
      } catch (e) {
        log.warn("compact layer failed, falling to hard window", { err: String((e as Error)?.message ?? e) });
      }
    }
    if (estimateTokens(msgs) <= msgTarget) return { messages: msgs, actions, usage, cache };
  }

  // ③ 硬底层:按 token 预算保留最近回合。若前面有摘要对,固定保留它、只裁其后的最近回合。
  const hasSummary = isSummaryPrefix(msgs);
  if (hasSummary) {
    const prefix = msgs.slice(0, 2);
    const rest = msgs.slice(2);
    const budget = Math.max(0, msgTarget - estimateTokens(prefix) - 512);
    msgs = [...prefix, ...keepRecentByTokenBudget(rest, budget)];
  } else {
    msgs = keepRecentByTokenBudget(msgs, Math.max(0, msgTarget - 512));
  }
  // 仅当 ③ 层真的削减了消息数才记 "window";没削动(如单个巨型回合、回合数 ≤ minTurns)则不谎报进展,
  // 让 turnLoop 反应式路径能凭 actions 判断「压不动」→ 如实报错而非用同一 payload 空转重试。
  if (msgs !== messages || actions.length > 0) actions.push("window");
  return { messages: msgs, actions, usage, cache };
}
