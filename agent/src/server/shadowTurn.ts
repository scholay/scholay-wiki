// 无状态一次性 turn(详细设计 §3 「后端拥有 history」的纯形态;step 6 shadow 对账的执行面)。
//
// 后端喂完整 history(已是 Anthropic 形)+ 本轮 user 文本 → 执行器跑一轮 → 返回**结构化摘要**
// (完成否 / tool 名序列 / 帧计数 / usage / 文本长度)。无 WS、无会话续接、无 transcript 落地。
// 用途:① shadow 对账(Go hub 把 live 轮的 history 喂进来比 executor 与 fork 的 tool 序列/完成度);
//       ② 未来 cutover 后「后端喂 history」的执行入口。
// 安全:shadow 是只读对账,控制面不在环 → 自动批权限;smart_search 画像 MCP-only 读,无副作用。
//
// ⚠️ 计费门禁(评审 R1-info):runTurn 会**真实命中上游模型消耗 token**,但本函数的 usage 只随 HTTP
//    响应返回、**不发 token_usage 帧、不进 session_total 水位**,故后端账本对它零感知(当前 dormant:
//    Go 侧无任何 /api/turn 调用方,不产生真实消耗)。**在把 /api/turn 接进任何 live/cutover 路径之前**,
//    必须把 result.usage 经旁路(后端 recordOutOfBandTokens,如 kind=shadow_turn / SkipQuota)接入
//    llm_token_usage,否则每个 shadow 轮翻倍消耗上游 token 且不落账本 = 成本看板系统性低估。

import type Anthropic from "@anthropic-ai/sdk";
import { runTurn } from "../turn/turnLoop.ts";
import { describeToolCall, flattenToolResultText, summarizeToolOutcome } from "../turn/compact.ts";
import type { EventSink, TurnInput } from "../turn/types.ts";
import type { Tier } from "../config/models.ts";

// daemon / journal-fold 的扁平消息形(每 block 一条 typed message)。
export interface FlatMessage {
  type: string; // user | assistant | tool_use | tool_result
  content: unknown; // block 数组(text/thinking/tool_use/tool_result)
}

export interface ShadowTurnRequest {
  sessionId?: string;
  messages?: Anthropic.MessageParam[]; // 后端喂的完整 history(Anthropic 形)
  flatMessages?: FlatMessage[]; // 或:daemon/journal 扁平形(执行器内部转 Anthropic)
  content: string; // 本轮 user 文本
  disallowedTools?: string[];
  allowedMcpTools?: string[]; // MCP 正向白名单(去前缀原始名);缺省 = 不限制
  tier?: Tier;
  appendSystemPrompt?: string;
  workDir?: string;
}

// convertFlatToAnthropic:daemon 扁平形(user/assistant/tool_use/tool_result 各独立 typed message)
// → Anthropic MessageParam[]。输出**全部是 text 块**,但工具调用不再凭空消失,而是折成一行摘要。
//
// 🔴 2026-08 证据账本 P0 · 根因修复。旧版这里是 `blocks.filter(b => b.type === "text")`:
// 会话闲置 30 分钟(sessions.ts IDLE_TTL_MS)或容器重启 → 内存 meta 被清 → backend 从 journal 重灌
// → 这一行把 **100% 的 tool_use/tool_result 丢弃且零标记**,只留 assistant 那段「我检索了 16 篇」的
// 散文。证据没了、宣称证据存在的话留着 —— 模型只能复述自己的检索叙事 + 凭训练记忆填充。
// 生产判别力全部集中在这一个维度:本纪元内有过工具调用时 DOI 接地率 98%,失忆纪元 43%。
//
// 旧版自述的理由是 Anthropic 强约束「每个 tool_result 必须紧跟含对应 tool_use 的 assistant 消息」
// —— 核实后:**折成 text 块根本不需要配对**,该约束只管真正的 tool_use/tool_result 块。所以那是一处
// 纯粹的信息丢弃,约束并不要求它。现在:一次工具调用 = 一行 `【已调用 X args】结果摘要,已入证据账本 E1–E16`,
// 并入它所属的 assistant 消息(tool_result 消息本身不再产出消息 —— 否则会凭空多出「回合起点」,
// 打乱 window.ts/compact.ts 的 isTurnStart 回合计数)。
//
// 刻意**不**把全量 tool_result 折回去:那是每轮重发 ~100K token,成本与注意力稀释不可持续
// (终稿否决清单 #2)。完整题录的真源是 evidence/ledger.jsonl,经 turnLoop 的 digest 注入 + EvidenceGet 读回。
export function convertFlatToAnthropic(flat: FlatMessage[]): Anthropic.MessageParam[] {
  // tool_use_id → tool_result 块(结果并入其 tool_use 的折行,不单独成消息)
  const results = new Map<string, { content?: unknown; is_error?: boolean }>();
  for (const m of flat) {
    const blocks = Array.isArray(m.content) ? (m.content as Array<Record<string, unknown>>) : [];
    for (const b of blocks) {
      if (b && b.type === "tool_result" && typeof b.tool_use_id === "string") {
        results.set(b.tool_use_id, { content: b.content, is_error: b.is_error === true });
      }
    }
  }

  const out: Anthropic.MessageParam[] = [];
  for (const m of flat) {
    const role: "user" | "assistant" = m.type === "assistant" || m.type === "tool_use" ? "assistant" : "user";
    const blocks = Array.isArray(m.content) ? (m.content as Array<Record<string, unknown>>) : [];
    const kept: Array<{ type: "text"; text: string }> = [];
    for (const b of blocks) {
      if (!b) continue;
      if (b.type === "text" && typeof b.text === "string") {
        kept.push({ type: "text", text: b.text });
      } else if (b.type === "tool_use") {
        kept.push({ type: "text", text: foldToolCall(b, results) });
      }
      // tool_result:已并入其 tool_use 的折行。thinking:不是证据,不回喂。
    }
    if (kept.length === 0) continue;
    const last = out[out.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) {
      (last.content as unknown[]).push(...kept);
    } else {
      out.push({ role, content: kept as unknown as Anthropic.MessageParam["content"] });
    }
  }
  return out;
}

// extractEvidenceIds:E-id 直接从 tool_result **正文**里取。账本的 annotate() 在入账时已经把
// `evidence_id` 逐条盖进了这条 tool_result(根上还有 `_evidence` 汇总),journal 存的就是盖过章的
// 那一份 —— 所以「这次调用入账了哪些 E」是**这条记录自带的事实**,不需要任何跨表匹配或推断
// (推出来的 E-id 就是新的一种编造)。用正则而非 JSON.parse:结果可能被 capToolResult 截成非法
// JSON,截断了就少认几个,不会整条失效。老会话(账本上线前的 journal)自然取不到 → 不标。
const EVIDENCE_ID_RE = /"evidence_id"\s*:\s*"(E\d+)"/g;

function extractEvidenceIds(result?: { content?: unknown } | null): string[] {
  if (!result) return [];
  const text = flattenToolResultText(result.content);
  const seen = new Set<string>();
  for (const m of text.matchAll(EVIDENCE_ID_RE)) seen.add(m[1]!);
  return [...seen];
}

// renderIds:连续的 E 编号压成区间(E1–E16),否则逐条列(多于 8 条只列前 8 + 总数)。
function renderIds(ids: string[]): string {
  if (ids.length === 0) return "";
  const nums = ids.map((id) => Number(/^E(\d+)$/.exec(id)?.[1] ?? NaN));
  if (nums.length > 2 && nums.every((n) => Number.isFinite(n))) {
    const sorted = [...nums].sort((a, b) => a - b);
    if (sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1)) {
      return `E${sorted[0]}\u2013E${sorted[sorted.length - 1]}`;
    }
  }
  return ids.length <= 8 ? ids.join("、") : ids.slice(0, 8).join("、") + `…(共 ${ids.length} 条)`;
}

// foldToolCall:一次工具调用 → 一行。工具名 + 关键入参 + 结果摘要 + 入账的 E-id。
function foldToolCall(
  block: Record<string, unknown>,
  results: Map<string, { content?: unknown; is_error?: boolean }>,
): string {
  const name = String(block.name ?? "工具");
  const args = describeToolCall(block.input);
  const id = typeof block.id === "string" ? block.id : "";
  const result = id ? results.get(id) : undefined;
  const outcome = summarizeToolOutcome(result);
  const ids = extractEvidenceIds(result);
  const tail = ids.length > 0 ? `,已入证据账本 ${renderIds(ids)}` : "";
  return `【已调用 ${name}${args ? " " + args : ""}】${outcome}${tail}`;
}

export interface ShadowTurnResult {
  completed: boolean;
  toolSequence: string[];
  frameCounts: Record<string, number>;
  usage?: Record<string, unknown>;
  textLen: number;
  textSample: string;
  error?: string;
}

export async function runShadowTurn(req: ShadowTurnRequest): Promise<ShadowTurnResult> {
  const frameCounts: Record<string, number> = {};
  const toolSequence: string[] = [];
  let text = "";
  let usage: Record<string, unknown> | undefined;
  let errMsg: string | undefined;
  let completed = false;

  const sink: EventSink = {
    frame(f) {
      const t = String(f.type);
      frameCounts[t] = (frameCounts[t] || 0) + 1;
      if (t === "tool_use_complete") toolSequence.push(String((f as Record<string, unknown>).toolName));
      if (t === "content_delta" && typeof (f as Record<string, unknown>).text === "string") {
        text += (f as Record<string, unknown>).text as string;
      }
      if (t === "message_complete") {
        completed = true;
        usage = (f as Record<string, unknown>).usage as Record<string, unknown>;
      }
    },
    error(message, code) {
      errMsg = (code ? code + ": " : "") + message;
    },
    async requestPermission() {
      return true; // shadow:控制面不在环;MCP-only 读安全 → 自动批
    },
  };

  const history = req.messages ?? (req.flatMessages ? convertFlatToAnthropic(req.flatMessages) : []);
  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: req.content }];
  const input: TurnInput = {
    sessionId: req.sessionId || "shadow",
    messages,
    tier: req.tier || "main",
    disallowedTools: req.disallowedTools || [],
    allowedMcpTools: req.allowedMcpTools,
    appendSystemPrompt: req.appendSystemPrompt,
    workDir: req.workDir || "/tmp/executor-shadow",
    allowBash: false,
    net: "open",
  };

  try {
    await runTurn(input, sink);
  } catch (e) {
    errMsg = String((e as Error)?.message ?? e);
  }

  return {
    completed,
    toolSequence,
    frameCounts,
    usage,
    textLen: text.length,
    textSample: text.slice(0, 160),
    error: errMsg,
  };
}
