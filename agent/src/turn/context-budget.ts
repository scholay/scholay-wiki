// 上下文预算工具(P0/P1,业界成熟模式,见 docs/research/context-compaction-2026-07/INDUSTRY-REVIEW.md)。
//
// 三件纯函数,给分层压缩(compact.ts reduceForWindow)与触发用:
//   - estimateTokens:无 tokenizer 的粗略 token 估算(偏保守,宁可早触发;不参与计费)。
//   - pruneOldToolResults:把「较早回合」的 tool_result 正文截短(最廉价的第一层降级,不动 LLM)。
//   - keepRecentByTokenBudget:按 token 预算保留最近回合(取代固定回合数 —— 回合 token 差几十倍)。
//
// 触发缺口修复(P0):此前触发只看上一轮 usage(lastCtx),重连 seed 大历史 / 首轮时为 0 → 压缩不触发,
// 恰好漏掉「切小模型溢出」立项场景。estimateTokens 让触发不依赖 lastUsage。

import type Anthropic from "@anthropic-ai/sdk";
import { isTurnStart } from "./window.ts";

// 字符→token 粗略折算:偏保守(除数小→估得多→早触发)。CJK≈1-1.5 tok/字、英文≈4 字/tok,取中偏保守 2.6。
const CHARS_PER_TOKEN = Number(process.env.EXECUTOR_EST_CHARS_PER_TOKEN || 2.6);
// image 块粗估(base64 不计字符,按 Anthropic 视觉典型 ~1600 tok 记)。
const IMAGE_TOKENS = 1600;

/** turnStarts:回合起点下标(与 window.ts 同口径,tool 配对安全的切点)。 */
export function turnStarts(messages: Anthropic.MessageParam[]): number[] {
  const s: number[] = [];
  for (let i = 0; i < messages.length; i++) if (isTurnStart(messages[i]!)) s.push(i);
  return s;
}

/** 粗略估算一段消息的 token 数(触发/预算用,非计费)。 */
export function estimateTokens(messages: Anthropic.MessageParam[]): number {
  let tokens = 0;
  const add = (s: string) => {
    tokens += Math.ceil(s.length / CHARS_PER_TOKEN);
  };
  for (const m of messages) {
    if (typeof m.content === "string") {
      add(m.content);
      continue;
    }
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content as Anthropic.ContentBlockParam[]) {
      const t = (b as { type?: string }).type;
      if (t === "text") add(String((b as { text?: unknown }).text ?? ""));
      else if (t === "tool_use") add(JSON.stringify((b as { input?: unknown }).input ?? {}));
      else if (t === "tool_result") {
        const c = (b as { content?: unknown }).content;
        add(typeof c === "string" ? c : JSON.stringify(c ?? ""));
      } else if (t === "image") tokens += IMAGE_TOKENS;
    }
  }
  return tokens;
}

/**
 * pruneOldToolResults:把**早于最近 keepRecentTurns 回合**的 tool_result 正文截到 headChars,
 * 保留 tool_result 块结构(tool_use↔tool_result 配对不断)。最近回合的工具结果保持原文。
 * 这是最廉价的降级层(不动 LLM),常常一撞阈值不用摘要就省掉大头。
 * 返回是否有改动 + 截了几个。原对象在无改动时零拷贝。
 */
export function pruneOldToolResults(
  messages: Anthropic.MessageParam[],
  keepRecentTurns: number,
  headChars = 200,
): { messages: Anthropic.MessageParam[]; pruned: number } {
  const starts = turnStarts(messages);
  if (starts.length <= keepRecentTurns) return { messages, pruned: 0 };
  const cut = starts[starts.length - keepRecentTurns]!;
  let pruned = 0;
  const out = messages.map((m, i) => {
    if (i >= cut || m.role !== "user" || !Array.isArray(m.content)) return m;
    let changed = false;
    const content = (m.content as Anthropic.ContentBlockParam[]).map((b) => {
      if ((b as { type?: string }).type !== "tool_result") return b;
      const raw = (b as { content?: unknown }).content;
      const s = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
      if (s.length <= headChars) return b;
      changed = true;
      pruned++;
      return { ...(b as object), content: s.slice(0, headChars) + "\n[…较早的工具结果已省略以节省上下文]" } as Anthropic.ContentBlockParam;
    });
    return changed ? ({ ...m, content } as Anthropic.MessageParam) : m;
  });
  return pruned > 0 ? { messages: out, pruned } : { messages, pruned: 0 };
}

/**
 * keepRecentByTokenBudget:按 **token 预算**保留最近若干回合(在回合起点切,结构安全)。
 * 从末尾往回累加回合 token,装不下即停;但至少保 minTurns、至多 maxTurns(防极端)。
 * 取代固定 WINDOW_KEEP_TURNS —— token 触发 + 回合数保留错配会「要么浪费要么溢出」。
 */
export function keepRecentByTokenBudget(
  messages: Anthropic.MessageParam[],
  tokenBudget: number,
  minTurns = 4,
  maxTurns = 60,
): Anthropic.MessageParam[] {
  const starts = turnStarts(messages);
  if (starts.length <= minTurns) return messages;
  let keep = 0;
  let acc = 0;
  for (let k = starts.length - 1; k >= 0; k--) {
    const from = starts[k]!;
    const to = k + 1 < starts.length ? starts[k + 1]! : messages.length;
    const turnTokens = estimateTokens(messages.slice(from, to));
    if (keep >= minTurns && acc + turnTokens > tokenBudget) break;
    if (keep >= maxTurns) break;
    acc += turnTokens;
    keep++;
  }
  keep = Math.max(minTurns, keep);
  if (keep >= starts.length) return messages;
  return messages.slice(starts[starts.length - keep]!);
}
