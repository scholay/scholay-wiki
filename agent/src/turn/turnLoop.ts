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
import { limitLiveImages, stripImageBlocks } from "../server/attachments.ts";
import { buildDateLine } from "../tools/clock.ts";
import { reduceForWindow } from "./compact.ts";
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

// 随请求外发的历史图块上限(P3 遗留补齐):base64 图每轮全量重发,长会话成本线性涨且
// 加剧不稳中转掐大请求。保最近 N 张,更早换占位(history 不动)。0 = 不限制。
const MAX_LIVE_IMAGES = Number(process.env.EXECUTOR_MAX_LIVE_IMAGES || 3);

// budgetDisclosure —— 有界透支预算(SS#2)的「软自控」披露:turn 开始时告诉模型本次大致预算,
// 让它自我配速、接近用尽时主动交付最完整答案(Anthropic Task-Budgets 式)。
// V3-4.1-1:披露含逐轮变化的数字,若放 system 会让**跨轮** system 前缀每轮变 → 打断上游隐式前缀缓存;
// 故改为 append 到本轮 user 消息尾部(历史里冻结不回改,前缀跨轮 byte 稳定)。轮内仍只算一次。
export function budgetDisclosure(tb?: { softRemaining: number; hardRemaining: number }): string {
  if (!tb) return "";
  if (tb.softRemaining <= 0) {
    return "【预算提示】本次配额已接近用尽:请用尽量少的步骤、基于已有信息给出最完整的回答并尽快结束,不要再展开细枝末节。";
  }
  return `【预算提示】本次任务大约有 ${tb.softRemaining} token 的预算。请据此把握节奏:接近用尽时,基于已掌握的信息给出最完整的回答并结束,不要为细枝末节继续消耗。`;
}
// wind-down「硬但优雅」的收尾指令:到 hardRemaining 时去掉全部工具 + 注入本指令,
// 模型只能出文本 → 自己写完最终答案后自然 end_turn → 正常 message_complete(非硬杀 socket)。
const budgetWindDownDirective =
  "【预算已用尽】现在起停止调用任何工具,基于目前已掌握的全部信息,直接给出最完整、可交付的最终回答,然后结束。";

// langLine —— 语言纪律(静态串,保 prompt cache):中文平台默认中文;**思考过程(thinking)同样受约束**
// (owner 反馈:thinking 时中时英观感割裂)。跟随用户语言与用户记忆里的语言偏好;代码/术语/文献题目保持原文。
const langLine =
  "语言:默认使用中文 —— 你的思考过程与最终回复都用中文书写。例外:用户以其它语言提问、明确要求其它语言、" +
  "或其长期偏好(见上下文中的用户记忆)指明了语言时,跟随之。代码、命令、专业术语、文献标题与直接引语保持原文,不翻译。";

// attachLine —— 附件约定(静态串,保 prompt cache):backend hub 把用户上传的附件折成 user 消息
// 开头的 @"绝对路径" 标记(2026-07-14 断链修复)。没有这行,模型对着标记只能靠猜(实测 deepseek
// 会 Glob 自救,但依赖用户口头提示)。回复中不要复读该标记(前端已把它渲染成附件卡片)。
const attachLine =
  '附件约定:用户消息开头形如 @"/绝对路径" 的标记表示该轮上传到会话工作目录的附件文件,标记后紧跟用户正文。' +
  "**图片附件(png/jpg 等)已直接随消息呈现给你**:直接观察图片作答,绝不要对图片路径调用 Read" +
  "(消息里没有随附图像时,说明当前模型不支持识图,如实告知用户并建议切换支持视觉的模型)。" +
  "文本类附件按需用 Read 读取;PDF/Office 等二进制先用 Bash 转成文本再读(无 Bash 工具时," +
  "直接告知该格式暂不支持解析,不要凭空编造内容)。回复中引用附件用其文件名,不要复读整段路径标记。";

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
  const client = anthropicClientFromProvider(input.providerName);
  // max_tokens = min(全局上限, 模型完成窗):目录 max_output 未配置(0/缺失)时用全局值;
  // 上游仍拒绝时 openai adapter 会按 400 报文钳制重试(零配置兜底),anthropic 系暂无该自愈。
  const maxTokens =
    input.maxOutput && input.maxOutput > 0 ? Math.min(MAX_TOKENS, input.maxOutput) : MAX_TOKENS;
  const tools = await buildTools(input);
  const messages: Anthropic.MessageParam[] = [...input.messages];
  // system = 当前日期锚点 + 语言纪律 + 控制面 appendSystemPrompt(规则+记忆)+ per-feature skill/CLAUDE.md(H6)。
  // dateLine 放这里(而非 backend)是刻意的:此处是四个 feature 每轮必经的唯一 system 组装点
  // (peerreview 不走 appendSystemPrompt、prism 建会话绕过 buildCreateOptions,backend 注入必漏),
  // 且每轮现算 → 长寿会话跨天自动更新;天粒度 → prompt cache 每天最多 miss 一次(clock.ts 铁律)。
  // langLine 同理放这里(owner 反馈:思考过程时中时英):静态串不破缓存,四个 feature 全覆盖。
  const skillCtx = loadAddDirContext(input.addDirs ?? []);
  const baseSystem =
    [buildDateLine(), langLine, attachLine, input.appendSystemPrompt, skillCtx].filter((s) => s && s.trim()).join("\n\n");
  // 有界透支预算(SS#2):披露一次(turn 开始)让模型据 soft 自我配速;越过 hard 时翻 windingDown →
  // 去工具 + 收尾指令,让 agent 自己给最完整答案并 end_turn 结束(非硬杀)。system/tools 只在翻转时变一次,
  // 不逐轮改 → 不破坏 prompt cache。peerreview 无 taskBudget → 全程 baseSystem + 全量 tools,行为完全不变。
  const tb = input.taskBudget;
  let windingDown = false;
  let activeTools = tools;
  // system 不含披露(跨轮 byte 稳定保前缀缓存);披露 append 到本轮 user 消息尾部(见 budgetDisclosure 注释)。
  let system: string | undefined = baseSystem || undefined;
  const disclosure = budgetDisclosure(tb);
  if (disclosure && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last.role === "user") {
      if (typeof last.content === "string") {
        messages[messages.length - 1] = { role: "user", content: last.content + "\n\n" + disclosure };
      } else if (Array.isArray(last.content)) {
        messages[messages.length - 1] = {
          role: "user",
          content: [...last.content, { type: "text", text: disclosure }],
        };
      }
    }
  }

  // 计费(C1):逐轮累加每个 LLM call 的 usage → calls[];message_complete 带 usage(本轮合计)+ calls。
  // session_total(会话累计)由 WS 层(server/ws.ts)据会话内存累计补上,executor 无状态不自持有。
  const calls: CallUsage[] = [];
  // 终帧守卫(C2):无论正常完成 / abort / error / round-cap,turn 退出时**必有**一个终帧
  // (message_complete 或 error),Go hub 据此清 inFlight,否则整个会话卡 busy 锁死。
  let terminalSent = false;
  // P0 反应式压缩:上游 context 溢出时有界次数「收紧压缩 + 重试本轮」(对齐 Claude Code prompt_too_long)。
  let reactiveReduces = 0;
  const MAX_REACTIVE_REDUCES = Number(process.env.EXECUTOR_MAX_REACTIVE_REDUCES || 2);
  const REACTIVE_KEEP_TURNS = Number(process.env.EXECUTOR_WINDOW_KEEP_TURNS || 25);
  const sendComplete = () => {
    if (terminalSent) return;
    terminalSent = true;
    sink.frame({ type: "message_complete", usage: sumUsage(calls), calls });
  };
  // error 终帧同样携带本轮已完成 LLM call 的 usage/calls:多轮工具循环里最后一轮失败时,
  // 前几轮的上游消耗是真实发生的 —— 只发裸 error 会让 Go 侧整轮漏记(计费/配额)。
  // Go hub 的 error case 按 message_complete 同一链路入账;WS 层(server/ws.ts)会像完成帧
  // 一样补 session_total(水位口径跨帧型一致)。
  const sendError = (message: string, code: string) => {
    terminalSent = true;
    const carry = calls.length > 0 ? { usage: sumUsage(calls), calls } : {};
    sink.frame({ type: "error", message, code, ...carry });
  };

  try {
    for (let round = 0; ; round++) {
      if (signal?.aborted) break; // 用户 stop → 跳出,finally 补终帧
      if (round >= MAX_TOOL_ROUNDS) {
        sendError("tool round cap exceeded", "busy"); // error 即终帧(hub 在 error case 清 inFlight)
        break;
      }
      if (MAX_TURN_TOKENS > 0) {
        // V3-4.1-5:与 wind-down 统一为 raw 口径(4 类全 1x),两闸不再各说各话。
        const spent = calls.reduce(
          (n, c) => n + (c.input_tokens || 0) + (c.output_tokens || 0) + (c.cache_read_tokens || 0) + (c.cache_creation_tokens || 0),
          0,
        );
        if (spent > MAX_TURN_TOKENS) {
          log.warn("turn token budget exceeded", { session_id: input.sessionId, spent, budget: MAX_TURN_TOKENS });
          sendError("本轮处理量已达上限,已自动停止。请精简需求后重试。", "budget");
          break;
        }
      }
      // 有界透支自动收尾(SS#2):raw 口径(4 类全 1x)已花 >= hardRemaining → 翻 windingDown。
      // 只翻一次:去掉全部工具 + 换成收尾指令,后续轮模型只能出文本 → 写完 end_turn 自然结束。
      if (tb && !windingDown) {
        const rawSpent = calls.reduce(
          (n, c) => n + (c.input_tokens || 0) + (c.output_tokens || 0) + (c.cache_read_tokens || 0) + (c.cache_creation_tokens || 0),
          0,
        );
        if (rawSpent >= tb.hardRemaining) {
          windingDown = true;
          activeTools = [];
          system = [baseSystem, budgetWindDownDirective].filter((s) => s && s.trim()).join("\n\n") || undefined;
          log.info("turn budget wind-down: agent-driven finalize", {
            session_id: input.sessionId, raw_spent: rawSpent, hard_remaining: tb.hardRemaining,
          });
        }
      }
      sink.frame({ type: "status", state: "thinking" });

      // P2 图片通道:无视觉模型 → 请求里的历史 image 块换文本占位(history 本体不动,
      // 切回视觉模型仍能看见);vision 模型限量外发(保最近 N 张,控 token/payload)。
      const wireMessages = input.vision
        ? limitLiveImages(messages, MAX_LIVE_IMAGES)
        : stripImageBlocks(messages);
      const stream = client.messages.stream(
        { model, max_tokens: maxTokens, system, messages: wireMessages, tools: activeTools as unknown as Anthropic.ToolUnion[] },
        signal ? { signal } : undefined,
      );
      const assembler = new ToolUseAssembler();

      // 流式迭代与 finalMessage 必须同一个 try:OpenAI 适配层(及 SDK 网络层)的失败可能从
      // 迭代器本身 throw —— 若不接住,会越过本函数直接进 finally 的终帧守卫,先发出一个
      // 空 usage 的 message_complete,error 帧反而落在完成帧之后(前端已收轮 → 用户看到
      // 「无任何返回」且两侧都无日志)。2026-07-14 智能搜索空返回事故根因。
      let msg: Anthropic.Message;
      try {
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

        msg = await stream.finalMessage();
      } catch (e) {
        if (signal?.aborted) break; // abort 触发的流中断:走 finally 补终帧,不报 error
        const errMsg = String((e as Error)?.message ?? e);
        // P0 反应式压缩:上游报 context 溢出(声明窗口 < 实际 / 首轮 seed 大历史 / 切小模型)时,
        // 收紧目标再压一次并重试本轮 —— 而非直接报错。有界次数,防死循环。
        if (isContextOverflow(errMsg) && input.contextWindow && input.contextWindow > 0 && reactiveReduces < MAX_REACTIVE_REDUCES) {
          try {
            const r = await reduceForWindow(messages, input.contextWindow, { keepTurns: REACTIVE_KEEP_TURNS, targetPct: 55 });
            if (r.actions.length > 0) {
              messages.splice(0, messages.length, ...r.messages); // 原地替换工作数组
              if (r.usage) calls.push(r.usage); // 摘要用量计入本轮
              reactiveReduces++;
              log.warn("reactive context reduce on overflow, retrying round", {
                session_id: input.sessionId, model, round, actions: r.actions.join(","), attempt: reactiveReduces,
              });
              continue; // 用压缩后的 messages 重发本轮
            }
          } catch (re) {
            log.warn("reactive reduce failed", { err: String((re as Error)?.message ?? re) });
          }
        }
        log.error("upstream stream failed", { err: errMsg, session_id: input.sessionId, model, round });
        sendError("模型服务响应异常,请稍后重试或更换模型。", "upstream");
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
            max_tokens: maxTokens,
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

// 导出供单测。isContextOverflow:上游 context 窗口溢出的错误形态识别(跨 Anthropic / OpenAI 兼容 / 国产端点)。
export function isContextOverflow(msg: string): boolean {
  return /prompt is too long|too many tokens|maximum context|context[_ ]?length|context length exceeded|exceeds?.{0,20}context|reduce.{0,12}length|context window/i.test(
    msg,
  );
}
