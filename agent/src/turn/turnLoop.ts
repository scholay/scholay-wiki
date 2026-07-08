// ★ agent loop(详细设计 §2.3)—— 落在 GREEN 探针上。
// while (stop_reason==='tool_use'): stream → emit 中性帧 → 组装 tool_use → 执行 → tool_result → loop。
// 无状态:messages[] 由后端喂。tier→活跃 provider 槽位。provider-agnostic。零 cc-haha 血统。

import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClientFromProvider } from "../anthropic/client.ts";
import { resolveTier } from "../config/models.ts";
import { buildTools } from "../tools/toAnthropicTools.ts";
import { ToolUseAssembler } from "./assembleToolUse.ts";
import { runTools } from "./runTools.ts";
import type { EventSink, TurnInput } from "./types.ts";
import { loadAddDirContext } from "../skills/loader.ts";
import { buildDateLine } from "../tools/clock.ts";
import { log } from "../obs/log.ts";

const MAX_TOOL_ROUNDS = Number(process.env.EXECUTOR_MAX_TOOL_ROUNDS || 24);
// 上限(非每次都用满,模型按需 end_turn/tool_use 自然停)。8192 太小:生成大文档时模型把整篇当
// Write 的 content 参数流式输出会撞顶 → stop_reason=max_tokens → 工具未执行 → 前端「已暂停」。
// 调到 64000:turnLoop 用 messages.stream(流式),DeepSeek 在流式下接受大 max_tokens(实测)。
const MAX_TOKENS = Number(process.env.EXECUTOR_MAX_TOKENS || 64000);

// 单轮(一次 runTurn)累计 token 硬闸(input+output,逐 LLM call 累加)。第二层失控保护:
// 轮数上限只挡「工具循环次数」,挡不住「每轮全量重发超长 history」造成的 token 爆炸
// (历史事故:审稿向导单轮 10-17M token)。默认 5M —— 只兜真正失控,正常多轮读稿不受影响。
// 业务每日额度是 user_message 前的前置闸,进入 turn 后无内层闸;此为该缺口的兜底。0 = 关闭。
const MAX_TURN_TOKENS = Number(process.env.EXECUTOR_MAX_TURN_TOKENS || 5_000_000);

// runTurn 返回本轮结束后的完整 messages[](含 assistant + tool_result),供 WS 层做会话续接。
// 注:这是「会话内 history」的内存承载;耐久真源在后端事件溯源 journal(执行器跨重启无状态)。
export async function runTurn(
  input: TurnInput,
  sink: EventSink,
  signal?: AbortSignal,
): Promise<Anthropic.MessageParam[]> {
  // 具体 model id 覆盖优先(peerreview 按轮切模型);否则 tier→活跃 provider 槽位
  const model = (input.modelOverride && input.modelOverride.trim()) || resolveTier(input.tier);
  if (!model) {
    sink.error("no active provider/model (awaiting PushConfig)", "config");
    return input.messages;
  }
  const client = anthropicClientFromProvider();
  const tools = await buildTools(input);
  const messages: Anthropic.MessageParam[] = [...input.messages];
  // system = 当前日期锚点 + 控制面 appendSystemPrompt(规则+记忆)+ per-feature skill/CLAUDE.md(H6)。
  // dateLine 放这里(而非 backend)是刻意的:此处是四个 feature 每轮必经的唯一 system 组装点
  // (peerreview 不走 appendSystemPrompt、prism 建会话绕过 buildCreateOptions,backend 注入必漏),
  // 且每轮现算 → 长寿会话跨天自动更新;天粒度 → prompt cache 每天最多 miss 一次(clock.ts 铁律)。
  const skillCtx = loadAddDirContext(input.addDirs ?? []);
  const system =
    [buildDateLine(), input.appendSystemPrompt, skillCtx].filter((s) => s && s.trim()).join("\n\n") || undefined;

  // 计费(C1):逐轮累加每个 LLM call 的 usage → calls[];message_complete 带 usage(本轮合计)+ calls。
  // session_total(会话累计)由 WS 层(server/ws.ts)据会话内存累计补上,executor 无状态不自持有。
  const calls: CallUsage[] = [];
  // 终帧守卫(C2):无论正常完成 / abort / error / round-cap,turn 退出时**必有**一个终帧
  // (message_complete 或 error),Go hub 据此清 inFlight,否则整个会话卡 busy 锁死。
  let terminalSent = false;
  const sendComplete = () => {
    if (terminalSent) return;
    terminalSent = true;
    sink.frame({ type: "message_complete", usage: sumUsage(calls), calls });
  };

  try {
    for (let round = 0; ; round++) {
      if (signal?.aborted) break; // 用户 stop → 跳出,finally 补终帧
      if (round >= MAX_TOOL_ROUNDS) {
        sink.error("tool round cap exceeded", "busy");
        terminalSent = true; // error 即终帧(hub 也会在 error case 清 inFlight)
        break;
      }
      if (MAX_TURN_TOKENS > 0) {
        const spent = calls.reduce((n, c) => n + (c.input_tokens || 0) + (c.output_tokens || 0), 0);
        if (spent > MAX_TURN_TOKENS) {
          log.warn("turn token budget exceeded", { session_id: input.sessionId, spent, budget: MAX_TURN_TOKENS });
          sink.error("本轮处理量已达上限,已自动停止。请精简需求后重试。", "budget");
          terminalSent = true; // error 即终帧
          break;
        }
      }
      sink.frame({ type: "status", state: "thinking" });

      const stream = client.messages.stream(
        { model, max_tokens: MAX_TOKENS, system, messages, tools: tools as unknown as Anthropic.ToolUnion[] },
        signal ? { signal } : undefined,
      );
      const assembler = new ToolUseAssembler();

      for await (const ev of stream) {
        if (ev.type === "content_block_start") {
          const cb = ev.content_block;
          if (cb.type === "text") {
            sink.frame({ type: "content_start", blockType: "text" });
          } else if (cb.type === "tool_use") {
            assembler.open(ev.index, { id: cb.id, name: cb.name });
            sink.frame({ type: "content_start", blockType: "tool_use", toolName: cb.name, toolUseId: cb.id });
          } else if (cb.type === "thinking") {
            sink.frame({ type: "content_start", blockType: "thinking" });
          }
        } else if (ev.type === "content_block_delta") {
          const d = ev.delta as { type: string; text?: string; thinking?: string; partial_json?: string };
          if (d.type === "text_delta" && d.text) sink.frame({ type: "content_delta", text: d.text });
          else if (d.type === "thinking_delta" && d.thinking) sink.frame({ type: "thinking", text: d.thinking });
          else if (d.type === "input_json_delta" && d.partial_json !== undefined) assembler.push(ev.index, d.partial_json);
        } else if (ev.type === "content_block_stop") {
          if (assembler.isTool(ev.index)) {
            const tu = assembler.close(ev.index);
            if (tu) sink.frame({ type: "tool_use_complete", toolName: tu.name, toolUseId: tu.id, input: tu.input });
          }
        }
      }

      let msg: Anthropic.Message;
      try {
        msg = await stream.finalMessage();
      } catch (e) {
        if (signal?.aborted) break; // abort 触发的流中断:走 finally 补终帧,不报 error
        log.error("stream finalMessage failed", { err: String((e as Error)?.message ?? e), session_id: input.sessionId });
        sink.error("upstream stream failed", "upstream");
        terminalSent = true;
        break;
      }

      calls.push(normUsage(msg.usage, model)); // 每轮 LLM call 计费(C1)

      // 必须 append 全 content(非仅 text),保留 tool_use 块给下一请求
      messages.push({ role: "assistant", content: msg.content });

      if (msg.stop_reason !== "tool_use") {
        if (msg.stop_reason === "max_tokens") {
          log.warn("turn hit max_tokens (output truncated)", {
            session_id: input.sessionId,
            output_tokens: msg.usage?.output_tokens,
            max_tokens: MAX_TOKENS,
          });
        }
        sendComplete();
        break;
      }

      const toolUses = msg.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, input: b.input }));

      sink.frame({ type: "status", state: "tool_executing" });
      const results = await runTools(toolUses, input, sink, signal);
      // 所有 tool_result 在一个 user 消息里(SDK 规则;拆开会把模型训离 parallel call)
      messages.push({ role: "user", content: results });
    }
  } finally {
    sendComplete(); // C2:兜底终帧(abort/未捕获退出)。已发 error 的路径置了 terminalSent,不重复。
  }
  return messages;
}

// 中性 usage(Go AgentUsage 的 json 形)。Anthropic 字段名 cache_read_input_tokens → cache_read_tokens。
export type CallUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  model: string;
};

function normUsage(u: Anthropic.Usage, model: string): CallUsage {
  const anyU = u as unknown as Record<string, number>;
  return {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_read_tokens: anyU.cache_read_input_tokens ?? 0,
    cache_creation_tokens: anyU.cache_creation_input_tokens ?? 0,
    model,
  };
}

// sumUsage:本轮所有 LLM call 合计 → message_complete.usage(本轮 delta)。
export function sumUsage(calls: CallUsage[]): CallUsage {
  const t: CallUsage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, model: "" };
  for (const c of calls) {
    t.input_tokens += c.input_tokens || 0;
    t.output_tokens += c.output_tokens || 0;
    t.cache_read_tokens += c.cache_read_tokens || 0;
    t.cache_creation_tokens += c.cache_creation_tokens || 0;
    if (c.model) t.model = c.model;
  }
  return t;
}

// addUsage:把一次 turn 的合计累加进会话累计(WS 层维护 session_total)。
export function addUsage(acc: CallUsage, d: CallUsage): CallUsage {
  return {
    input_tokens: acc.input_tokens + (d.input_tokens || 0),
    output_tokens: acc.output_tokens + (d.output_tokens || 0),
    cache_read_tokens: acc.cache_read_tokens + (d.cache_read_tokens || 0),
    cache_creation_tokens: acc.cache_creation_tokens + (d.cache_creation_tokens || 0),
    model: d.model || acc.model,
  };
}
