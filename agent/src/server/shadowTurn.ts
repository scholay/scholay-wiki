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
import { convertFlatToAnthropic, type FlatMessage } from "./replayHistory.ts";
import type { EventSink, TurnInput } from "../turn/types.ts";
import type { Tier } from "../config/models.ts";

// 冷重播还原本体已搬到 server/replayHistory.ts —— 它是**每 7 轮就跑一次的生产路径**
// (ws.ts seed_history 直接从那里 import),而 /api/turn 的 shadow 路径今天是 dormant 的;
// 把生产路径挂在一个 dormant 文件里会持续误导评审(2026-08-08)。这里只是本文件自己要用。

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
