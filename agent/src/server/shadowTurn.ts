// 无状态一次性 turn(详细设计 §3 「后端拥有 history」的纯形态;step 6 shadow 对账的执行面)。
//
// 后端喂完整 history(已是 Anthropic 形)+ 本轮 user 文本 → 执行器跑一轮 → 返回**结构化摘要**
// (完成否 / tool 名序列 / 帧计数 / usage / 文本长度)。无 WS、无会话续接、无 transcript 落地。
// 用途:① shadow 对账(Go hub 把 live 轮的 history 喂进来比 executor 与 fork 的 tool 序列/完成度);
//       ② 未来 cutover 后「后端喂 history」的执行入口。
// 安全:shadow 是只读对账,控制面不在环 → 自动批权限;smart_search 画像 MCP-only 读,无副作用。

import type Anthropic from "@anthropic-ai/sdk";
import { runTurn } from "../turn/turnLoop.ts";
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
  tier?: Tier;
  appendSystemPrompt?: string;
  workDir?: string;
}

// convertFlatToAnthropic:daemon 扁平形(user/assistant/tool_use/tool_result 各独立 typed message)
// → Anthropic MessageParam[]。**只保留 text 块**:history seeding 是给「上下文连续性」用,不是精确回放。
//
// 为什么丢 tool_use / tool_result / thinking:Anthropic 强约束「每个 tool_result 必须紧跟含对应
// tool_use 的 assistant 消息」。journal 窗口切割 / 并行调用 / 中间夹 assistant 文本都可能产出无法配对
// 的孤儿 tool_result → 400。而 assistant 的文本回答本就已概括工具结果,丢掉工具块不损上下文、且彻底
// 杜绝配对错误。连续同角色合并成一条消息。
export function convertFlatToAnthropic(flat: FlatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of flat) {
    const role: "user" | "assistant" = m.type === "assistant" || m.type === "tool_use" ? "assistant" : "user";
    const blocks = Array.isArray(m.content) ? (m.content as Array<Record<string, unknown>>) : [];
    const kept = blocks.filter((b) => b && b.type === "text"); // 仅 text;丢 tool_use/tool_result/thinking
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
