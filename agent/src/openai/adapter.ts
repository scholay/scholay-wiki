// OpenAI Chat Completions 出口适配器(双协议 F3,方案 docs/research/api-format-compat-2026-07)。
//
// 鸭子型「假 Anthropic client」:暴露 messages.stream()/messages.create(),内部把 Anthropic 形
// 请求翻译成 OpenAI chat/completions、把 OpenAI SSE 翻译回 turnLoop 消费的事件形
// (content_block_start/delta/stop + finalMessage)。**内部真源保持 Anthropic 形,翻译只在出口**
// —— turnLoop/completion/window/sessions 零改动。
//
// 语义映射(有损点均显式):
//   · system 顶层参数 → messages[0] {role:"system"}
//   · assistant 块数组 → {content: text 拼接, tool_calls:[{id,function:{name,arguments:JSON串}}]};
//     **thinking 块剥离**(OpenAI 无对应;跨轮回放带 signature 必 400)
//   · user 的 tool_result 块 → 逐块 {role:"tool", tool_call_id, content: 字符串化};is_error → "[error] " 前缀
//   · tools → {type:"function", function:{name,description,parameters: input_schema}}
//   · 流式:delta.content→text_delta;delta.reasoning_content(DeepSeek 方言)→thinking_delta;
//     delta.tool_calls[i](arguments 字符串分片,并行按 index 交错)→ 状态机聚合 →
//     content_block_start(tool_use)/input_json_delta/content_block_stop
//   · finish_reason:tool_calls→tool_use / length→max_tokens / 其它→end_turn
//   · usage(需 stream_options.include_usage):input = prompt−cached,cache_read = cached,
//     cache_creation ≡ 0;上游不吐 usage → 全 0 + warn(计费缺口可见化)
import type Anthropic from "@anthropic-ai/sdk";
import type { ProviderConfig } from "../config/providerStore.ts";
import { log } from "../obs/log.ts";

type AnyBlock = { type: string; [k: string]: unknown };
type OAContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type OAMessage = {
  role: string;
  content: string | null | OAContentPart[];
  tool_call_id?: string;
  tool_calls?: unknown[];
  reasoning_content?: string;
};

function chatCompletionsURL(baseUrl: string): string {
  const b = baseUrl.replace(/\/+$/, "");
  return b.endsWith("/v1") ? `${b}/chat/completions` : `${b}/v1/chat/completions`;
}

/** tool_result 内容字符串化(MCP 富内容块数组 → 文本拼接;OpenAI tool 消息只有字符串)。 */
function stringifyResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        const blk = b as AnyBlock;
        if (blk?.type === "text" && typeof blk.text === "string") return blk.text;
        try { return JSON.stringify(blk); } catch { return String(blk); }
      })
      .join("\n");
  }
  try { return JSON.stringify(content); } catch { return String(content); }
}

/** Anthropic 形 messages → OpenAI 形(见文件头映射表)。 */
export function toOpenAIMessages(
  system: string | undefined,
  messages: Anthropic.MessageParam[],
  opts?: { reasoningReplay?: boolean },
): OAMessage[] {
  const out: OAMessage[] = [];
  if (system && system.trim()) out.push({ role: "system", content: system });
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const blocks = m.content as unknown as AnyBlock[];
    if (m.role === "assistant") {
      const text = blocks.filter((b) => b.type === "text").map((b) => String(b.text ?? "")).join("");
      const toolCalls = blocks
        .filter((b) => b.type === "tool_use")
        .map((b) => ({
          id: String(b.id ?? ""),
          type: "function",
          function: { name: String(b.name ?? ""), arguments: JSON.stringify(b.input ?? {}) },
        }));
      // thinking 块默认剥离(DeepSeek 等回传 reasoning_content 反而 400);Kimi 系方言
      // (provider.reasoningReplay)要求工具轮回传 → 以 reasoning_content 字段带回。
      const reasoning = opts?.reasoningReplay
        ? blocks.filter((b) => b.type === "thinking").map((b) => String(b.thinking ?? "")).join("")
        : "";
      out.push({
        role: "assistant",
        content: text || null,
        ...(reasoning ? { reasoning_content: reasoning } : {}),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
    } else {
      // user:tool_result 块逐条转 role:tool(必须紧跟上一条 assistant.tool_calls);文本与图片
      // 合成一条 user 消息 —— 图片(P2 通道)转 OpenAI 多模态形 image_url data URI;
      // 纯文本时保持 string content(部分严格方言对数组形挑剔,不无谓升级)。
      const texts: string[] = [];
      const images: OAContentPart[] = [];
      for (const b of blocks) {
        if (b.type === "tool_result") {
          const body = stringifyResultContent(b.content);
          out.push({
            role: "tool",
            tool_call_id: String(b.tool_use_id ?? ""),
            content: b.is_error ? `[error] ${body}` : body,
          });
        } else if (b.type === "text") {
          texts.push(String(b.text ?? ""));
        } else if (b.type === "image") {
          const src = b.source as { type?: string; media_type?: string; data?: string } | undefined;
          if (src?.type === "base64" && src.data) {
            images.push({
              type: "image_url",
              image_url: { url: `data:${src.media_type ?? "image/png"};base64,${src.data}` },
            });
          }
        }
      }
      if (images.length) {
        const parts: OAContentPart[] = [];
        if (texts.length) parts.push({ type: "text", text: texts.join("\n") });
        parts.push(...images);
        out.push({ role: "user", content: parts });
      } else if (texts.length) {
        out.push({ role: "user", content: texts.join("\n") });
      }
    }
  }
  return out;
}

export function toOpenAITools(tools: unknown[] | undefined): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return (tools as AnyBlock[]).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description ?? "", parameters: t.input_schema ?? { type: "object" } },
  }));
}

function mapStopReason(finish: string | null | undefined): string {
  if (finish === "tool_calls") return "tool_use";
  if (finish === "length") return "max_tokens";
  return "end_turn";
}

function normOAUsage(
  u:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
        cached_tokens?: number;
        prompt_cache_hit_tokens?: number;
      }
    | null
    | undefined,
) {
  const prompt = u?.prompt_tokens ?? 0;
  // 缓存命中多路兜底:标准 OpenAI 放 prompt_tokens_details.cached_tokens;部分国产端点(Kimi/Moonshot、
  // DeepSeek 兼容口)放顶层 cached_tokens / prompt_cache_hit_tokens。漏读会让成本看板高估平台成本(审计 cache-field)。
  const cached = u?.prompt_tokens_details?.cached_tokens ?? u?.cached_tokens ?? u?.prompt_cache_hit_tokens ?? 0;
  return {
    input_tokens: Math.max(0, prompt - cached),
    output_tokens: u?.completion_tokens ?? 0,
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: 0,
  };
}

/** 首字节前的网络级重试:部分中转(实测 cometapi)对 ~100KB+ 请求**随机掐断连接**(非 4xx/5xx,
 *  fetch 直接 throw)。响应头都没回 → 流必然未开始,重试安全。至多 3 发,退避 400ms×n;用户 abort 不重试。 */
async function fetchWithNetRetry(url: string, makeInit: () => RequestInit, signal?: AbortSignal): Promise<Response> {
  const TRIES = 3;
  let lastErr: unknown;
  for (let i = 0; i < TRIES; i++) {
    try {
      return await fetch(url, makeInit());
    } catch (e) {
      lastErr = e;
      // 末次失败直接抛(不再打「retrying」误导日志、不空睡退避);用户 abort 同样立即抛。
      if (signal?.aborted || i === TRIES - 1) throw lastErr;
      log.warn("openai adapter: network error before first byte, retrying", {
        attempt: i + 1, err: String((e as Error)?.message ?? e),
      });
      await abortableSleep(400 * (i + 1), signal);
      if (signal?.aborted) throw lastErr; // 退避期间被 stop → 不再发起下一次
    }
  }
  throw lastErr;
}

// 可中断退避:abort 时立即醒来(否则 stop 响应最长再拖一个退避周期)。
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", done);
      clearTimeout(t);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** POST chat/completions:400 的零配置自愈(有界修复循环,每种修复至多一次,共至多 3 发):
 *  ① 参数名方言 —— 部分推理模型(OpenAI o 系等)拒收 max_tokens、只认 max_completion_tokens → 换参;
 *  ② 上限值钳制 —— executor 全局 max_tokens(64000,为大输出模型调的)可能超过小模型的完成上限
 *    (如 gpt-4o-mini 16384,报「supports at most N completion tokens」)→ 解析 N 后钳制重试。
 *    2026-07-14 智能搜索空返回事故:两种 400 先后出现,旧逻辑只换名不降值 → 重试仍 400。 */
async function postChat(p: ProviderConfig, body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  const url = chatCompletionsURL(p.baseUrl);
  const headers = { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` };
  let cur = body;
  for (let attempt = 0; ; attempt++) {
    const resp = await fetchWithNetRetry(url, () => ({ method: "POST", headers, body: JSON.stringify(cur), signal }), signal);
    if (resp.status !== 400 || attempt >= 2) return resp;
    const detail = await resp.clone().text().catch(() => "");
    if (!/max_completion_tokens|max_tokens|最大.{0,6}(?:token|输出|长度)|输出.{0,6}(?:超|上限|限制)/i.test(detail)) return resp;
    // 一次到位:换名 + 钳制在同一个重试里做 —— 分两步会多打一发,且部分中转(实测 cometapi)
    // 对带 max_tokens 的请求不回 400 而是直接掐断连接,分步修复会死在中间态。
    const next = { ...cur } as Record<string, unknown>;
    let changed = false;
    // 仅当报文**明确要求 max_completion_tokens**(o 系新方言)才换名。国产端点(DashScope/Moonshot/
    // Zhipu/火山/MiniMax)只认 max_tokens —— 无条件换名会让重试必再 400、该模型每轮必挂(审计 P2-3)。
    if (/max_completion_tokens/.test(detail) && next.max_tokens !== undefined && next.max_completion_tokens === undefined) {
      next.max_completion_tokens = next.max_tokens;
      delete next.max_tokens;
      changed = true;
    }
    // 完成 token 上限钳制:兼容 at most N / maximum … N / <= N / less than or equal to / 中文「最大/最多/不超过 N」。
    const capMatch =
      detail.match(/at most (\d{2,})/i) ??
      detail.match(/maximum(?:\s+\w+){0,3}\s+(?:is|of)?\s*(\d{2,})/i) ??
      detail.match(/(?:<=|less than or equal to|not exceed(?:ing)?|no more than)\s*(\d{2,})/i) ??
      detail.match(/(?:最大|最多|不超过|至多)[^\d]{0,8}(\d{2,})/);
    const cap = capMatch ? Number(capMatch[1]) : 0;
    // 钳制作用在实际存在的字段上(未换名时仍是 max_tokens)。
    const capField = next.max_completion_tokens !== undefined ? "max_completion_tokens" : "max_tokens";
    const limit = Number((next as Record<string, unknown>)[capField]);
    if (cap > 0 && Number.isFinite(limit) && cap < limit) {
      (next as Record<string, unknown>)[capField] = cap;
      changed = true;
    }
    if (!changed) return resp; // 无可修复项(已是换名+钳制后的形态)→ 把 400 交还上层
    cur = next;
    log.warn("openai adapter: retrying after max-tokens dialect repair", {
      model: cur.model, max_completion_tokens: cur.max_completion_tokens, attempt: attempt + 1,
    });
  }
}

type StreamParams = {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Anthropic.MessageParam[];
  tools?: unknown[];
};

/** 假 MessageStream:for-await 产 turnLoop 消费的事件;结束后 finalMessage() 可取。 */
class OpenAIFakeStream {
  private finalMsg: Anthropic.Message | null = null;
  private err: unknown = null;

  constructor(
    private provider: ProviderConfig,
    private params: StreamParams,
    private signal?: AbortSignal,
  ) {}

  async *[Symbol.asyncIterator]() {
    const body = {
      model: this.params.model,
      max_tokens: this.params.max_tokens,
      messages: toOpenAIMessages(this.params.system, this.params.messages, { reasoningReplay: this.provider.reasoningReplay }),
      ...(toOpenAITools(this.params.tools) ? { tools: toOpenAITools(this.params.tools) } : {}),
      stream: true,
      stream_options: { include_usage: true },
    };
    let resp: Response;
    try {
      resp = await postChat(this.provider, body, this.signal);
    } catch (e) {
      this.err = e;
      throw e;
    }
    if (!resp.ok || !resp.body) {
      const detail = await resp.text().catch(() => "");
      this.err = new Error(`openai upstream ${resp.status}: ${detail.slice(0, 300)}`);
      throw this.err;
    }

    // 流式状态机:text/thinking 块 + 按 OpenAI tool_calls index 聚合的 tool 块。
    let nextBlock = 0;
    let textIdx = -1, thinkIdx = -1;
    let textBuf = "";
    let thinkBuf = "";
    const toolByOAIdx = new Map<number, { block: number; id: string; name: string; args: string }>();
    let finish: string | null = null;
    let usage: ReturnType<typeof normOAUsage> | null = null;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let sseBuf = "";
    // 流空闲超时(W3-5b):TCP 活着但字节停了(挂死轮 848s/624s 的一种形态)。长思考会持续产
    // reasoning 字节,120s 无任何字节必是死流 —— 比 backend 轮级硬闸更早把用户放出来。0=关闭。
    const IDLE_MS = Number(process.env.EXECUTOR_STREAM_IDLE_TIMEOUT_MS || 120_000);
    // 首字节(TTFB)窗口独立且更宽:大上下文/重推理 provider 的排队+prefill 可能 >120s 才吐第一个
    // 字节,用 inter-byte 的 120s 会把本可成功的请求误杀在 prefill 阶段(审计 [14])。首字节到达后
    // 才收紧到 IDLE_MS 的 inter-byte 空闲窗;IDLE_MS<=0 时两者一并关闭。用户 stop 仍经 AbortSignal 生效。
    const FIRST_BYTE_MS = Number(process.env.EXECUTOR_STREAM_FIRST_BYTE_TIMEOUT_MS || 300_000);
    let firstByteSeen = false;
    const readWithIdleTimeout = async () => {
      const ms = IDLE_MS <= 0 ? 0 : firstByteSeen ? IDLE_MS : FIRST_BYTE_MS;
      if (ms <= 0) return reader.read();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reader.cancel().catch(() => {
                /* noop */
              });
              reject(
                new Error(
                  firstByteSeen
                    ? `upstream stream idle timeout (no bytes for ${ms}ms)`
                    : `upstream time-to-first-byte timeout (${ms}ms)`,
                ),
              );
            }, ms);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    try {
      while (true) {
        const { done, value } = await readWithIdleTimeout();
        if (done) break;
        firstByteSeen = true; // 收到首个数据块 → 后续读收紧到 IDLE_MS 的 inter-byte 空闲窗
        sseBuf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = sseBuf.indexOf("\n")) >= 0) {
          const line = sseBuf.slice(0, nl).trim();
          sseBuf = sseBuf.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          let chunk: any;
          try { chunk = JSON.parse(data); } catch { continue; }
          if (chunk.usage) usage = normOAUsage(chunk.usage);
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) finish = choice.finish_reason;
          const delta = choice.delta ?? {};
          const reasoning = delta.reasoning_content ?? delta.reasoning;
          if (typeof reasoning === "string" && reasoning) {
            if (thinkIdx < 0) {
              thinkIdx = nextBlock++;
              yield { type: "content_block_start", index: thinkIdx, content_block: { type: "thinking" } } as any;
            }
            thinkBuf += reasoning;
            yield { type: "content_block_delta", index: thinkIdx, delta: { type: "thinking_delta", thinking: reasoning } } as any;
          }
          if (typeof delta.content === "string" && delta.content) {
            if (textIdx < 0) {
              textIdx = nextBlock++;
              yield { type: "content_block_start", index: textIdx, content_block: { type: "text" } } as any;
            }
            textBuf += delta.content;
            yield { type: "content_block_delta", index: textIdx, delta: { type: "text_delta", text: delta.content } } as any;
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const oaIdx = typeof tc.index === "number" ? tc.index : 0;
              let st = toolByOAIdx.get(oaIdx);
              if (!st) {
                st = {
                  block: nextBlock++,
                  id: String(tc.id ?? `call_${oaIdx}_${Date.now()}`),
                  name: String(tc.function?.name ?? ""),
                  args: "",
                };
                toolByOAIdx.set(oaIdx, st);
                yield { type: "content_block_start", index: st.block, content_block: { type: "tool_use", id: st.id, name: st.name } } as any;
              } else if (tc.function?.name && !st.name) {
                st.name = String(tc.function.name); // 个别上游 name 迟到:补齐(块已开,名字在 final 里修正)
              }
              const frag = tc.function?.arguments;
              if (typeof frag === "string" && frag) {
                st.args += frag;
                yield { type: "content_block_delta", index: st.block, delta: { type: "input_json_delta", partial_json: frag } } as any;
              }
            }
          }
        }
      }
    } catch (e) {
      this.err = e;
      throw e;
    }

    // 收尾:关闭 tool 块(turnLoop 据 content_block_stop 触发 tool_use_complete 帧)。
    for (const st of toolByOAIdx.values()) {
      yield { type: "content_block_stop", index: st.block } as any;
    }

    // W3-5a 干净断流不再伪装 end_turn(2026-07 审计 P0-3 最大来源):中转对长思考轮耗尽空闲窗后
    // FIN 关流(无错误、无 [DONE]、无 finish_reason)→ 旧行为 mapStopReason(null)="end_turn" 把
    // 零产出轮标成 complete,前端零提示吞掉用户消息。改为如实抛错 → turnLoop 统一 error 终帧。
    // 有正文的变体保留现状(正文已流给用户,救内容优先),仅 log 留痕。
    if (finish === null && toolByOAIdx.size === 0 && !textBuf) {
      this.err = new Error("upstream stream ended without finish_reason (connection cut by relay)");
      throw this.err;
    }
    if (finish === null) {
      log.warn("openai adapter: stream ended without finish_reason but content exists (keeping)", {
        model: this.params.model, text_len: textBuf.length, tools: toolByOAIdx.size,
      });
    }

    if (!usage) log.warn("openai adapter: upstream sent no usage (billing gap this call)", { model: this.params.model });
    const content: AnyBlock[] = [];
    if (this.provider.reasoningReplay && thinkBuf) content.push({ type: "thinking", thinking: thinkBuf, signature: "" });
    if (textBuf) content.push({ type: "text", text: textBuf });
    // W3-5a tool args 半截 JSON 不再吞成 input={}(旧行为:执行必失败且症状漂移 —— Write 缺参 →
    // 道歉轮 → 幻影交付)。finish=length(上游明确说截断)→ 丢弃坏块并留痕,交 turnLoop 的
    // max_tokens 分支处理;其它情形(中转掐断 mid-args)→ 如实抛错。
    let droppedTruncatedTools = 0;
    for (const st of toolByOAIdx.values()) {
      let input: unknown = {};
      if (st.args) {
        try {
          input = JSON.parse(st.args);
        } catch {
          if (finish === "length") {
            // W3-5c 联动(审计 [4]):不丢弃截断的 tool_use。计入 droppedTruncatedTools 使 validTools
            // 排除它 → stop_reason 落 max_tokens;但仍推一个 input={} 占位块进 content,让 turnLoop 的
            // max_tokens 恢复分支看到 pending tool_use → 回 is_error tool_result(解决前端幻影工具卡)
            // + 注入分段写指令重打。否则丢块后 pendingTools 为空,W3-5c 自恢复对整个 OpenAI 兼容道全失效。
            droppedTruncatedTools++;
            log.warn("openai adapter: keeping truncated tool_use as placeholder (finish=length)", { name: st.name });
            content.push({ type: "tool_use", id: st.id, name: st.name, input: {} });
            continue;
          }
          this.err = new Error(`tool arguments truncated by upstream: ${st.name}`);
          throw this.err;
        }
      }
      content.push({ type: "tool_use", id: st.id, name: st.name, input });
    }
    const validTools = toolByOAIdx.size - droppedTruncatedTools;
    this.finalMsg = {
      id: "oa_" + Date.now(),
      type: "message",
      role: "assistant",
      model: this.params.model,
      content: content as never,
      // 有**有效** tool_calls 一律判 tool_use(个别上游 finish_reason 报 stop):turnLoop 据此进入工具轮。
      // 全部 tool args 被截断丢弃时按 finish 原义(length→max_tokens)走 turnLoop 截断分支。
      stop_reason: (validTools > 0 ? "tool_use" : mapStopReason(finish)) as never,
      stop_sequence: null,
      usage: (usage ?? normOAUsage(null)) as never,
    } as unknown as Anthropic.Message;
  }

  async finalMessage(): Promise<Anthropic.Message> {
    if (this.err) throw this.err;
    if (this.finalMsg) return this.finalMsg;
    throw new Error("openai adapter: stream not fully consumed");
  }
}

/** 假 Anthropic client(messages.stream / messages.create 两个入口,与 turnLoop/completion 契约对齐)。 */
export function openAIAdapterClient(p: ProviderConfig): Anthropic {
  const client = {
    messages: {
      stream(params: StreamParams, opts?: { signal?: AbortSignal }) {
        return new OpenAIFakeStream(p, params, opts?.signal);
      },
      async create(params: StreamParams): Promise<Anthropic.Message> {
        const body = {
          model: params.model,
          max_tokens: params.max_tokens,
          messages: toOpenAIMessages(params.system, params.messages, { reasoningReplay: p.reasoningReplay }),
          stream: false,
        };
        const resp = await postChat(p, body);
        if (!resp.ok) {
          const detail = await resp.text().catch(() => "");
          throw new Error(`openai upstream ${resp.status}: ${detail.slice(0, 300)}`);
        }
        const j: any = await resp.json();
        const msg = j.choices?.[0]?.message ?? {};
        const content: AnyBlock[] = [];
        if (typeof msg.content === "string" && msg.content) content.push({ type: "text", text: msg.content });
        return {
          id: String(j.id ?? "oa_create"),
          type: "message",
          role: "assistant",
          model: params.model,
          content: content as never,
          stop_reason: mapStopReason(j.choices?.[0]?.finish_reason) as never,
          stop_sequence: null,
          usage: normOAUsage(j.usage) as never,
        } as unknown as Anthropic.Message;
      },
    },
  };
  return client as unknown as Anthropic;
}
