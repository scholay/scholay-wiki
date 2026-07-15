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
        const name = String((b as { name?: unknown }).name ?? "工具");
        lines.push(`助手[调用${name}]`);
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

/** 从被压缩文本里抽关键产物(原样保留):论文 ID(stc:/olx:/pmd: 前缀)、会话内文件路径、URL。 */
function extractArtifacts(text: string): string[] {
  const set = new Set<string>();
  const push = (re: RegExp) => {
    for (const m of text.matchAll(re)) set.add(m[0]);
  };
  push(/\b(?:stc|olx|pmd|semantic|openalex):[A-Za-z0-9._-]+/g); // minicod 论文 ID
  push(/\/home\/bun\/sessions\/[A-Za-z0-9/._-]+/g); // 会话 cwd 文件
  push(/https?:\/\/[^\s)>\]]+/g); // URL
  return [...set].slice(0, 40); // 上限防爆
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

  let rendered = renderForSummary(old);
  const artifacts = extractArtifacts(rendered);
  // cap 输入(超则丢最老一段,保证便宜档读得下)。
  if (rendered.length > SUMMARY_INPUT_CHARS) {
    rendered = "[更早内容从略]\n" + rendered.slice(rendered.length - SUMMARY_INPUT_CHARS);
  }

  const system =
    "你是对话摘要助手。把下面这段学术检索/写作对话压缩成简洁要点(中文,150-400 字):" +
    "保留用户的目标、已确认的关键结论、进行到哪一步、以及后续待办。忽略寒暄与冗余。只输出摘要正文。";
  const { text: summary, usage } = await fastCompletion(system, rendered, SUMMARY_MAX_TOKENS);
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
