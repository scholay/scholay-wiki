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
type OAMessage = { role: string; content: string | null; tool_call_id?: string; tool_calls?: unknown[]; reasoning_content?: string };

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
      // user:tool_result 块逐条转 role:tool(必须紧跟上一条 assistant.tool_calls);其余文本单独成 user 消息。
      const texts: string[] = [];
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
        }
      }
      if (texts.length) out.push({ role: "user", content: texts.join("\n") });
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

function normOAUsage(u: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | null | undefined) {
  const prompt = u?.prompt_tokens ?? 0;
  const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
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
    if (!/max_completion_tokens|max_tokens/.test(detail)) return resp;
    // 一次到位:换名 + 钳制在同一个重试里做 —— 分两步会多打一发,且部分中转(实测 cometapi)
    // 对带 max_tokens 的请求不回 400 而是直接掐断连接,分步修复会死在中间态。
    const next = { ...cur } as Record<string, unknown>;
    let changed = false;
    if (next.max_tokens !== undefined) {
      next.max_completion_tokens = next.max_tokens; // 现代方言:o 系/新模型只认 max_completion_tokens
      delete next.max_tokens;
      changed = true;
    }
    const limit = Number(next.max_completion_tokens);
    const capMatch = detail.match(/at most (\d+)/i) ?? detail.match(/maximum(?:\s+\w+){0,3}\s+(?:is|of)?\s*(\d{3,})/i);
    const cap = capMatch ? Number(capMatch[1]) : 0;
    if (cap > 0 && Number.isFinite(limit) && cap < limit) {
      next.max_completion_tokens = cap;
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
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
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

    if (!usage) log.warn("openai adapter: upstream sent no usage (billing gap this call)", { model: this.params.model });
    const content: AnyBlock[] = [];
    if (this.provider.reasoningReplay && thinkBuf) content.push({ type: "thinking", thinking: thinkBuf, signature: "" });
    if (textBuf) content.push({ type: "text", text: textBuf });
    for (const st of toolByOAIdx.values()) {
      let input: unknown = {};
      try { input = st.args ? JSON.parse(st.args) : {}; } catch {
        log.warn("openai adapter: tool arguments not valid JSON", { name: st.name });
      }
      content.push({ type: "tool_use", id: st.id, name: st.name, input });
    }
    this.finalMsg = {
      id: "oa_" + Date.now(),
      type: "message",
      role: "assistant",
      model: this.params.model,
      content: content as never,
      // 有 tool_calls 一律判 tool_use(个别上游 finish_reason 报 stop):turnLoop 据此进入工具轮。
      stop_reason: (toolByOAIdx.size > 0 ? "tool_use" : mapStopReason(finish)) as never,
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
