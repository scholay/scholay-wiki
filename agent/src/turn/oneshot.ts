// 单次补全(one-shot)—— 无工具、无会话、无 journal,像裸调大模型。
// 项目侧功能(翻译 / 矩阵分析 / 公众号自动回复 / Prism 内联点评)经 backend 的
// POST /api/complete(非流式)与 /api/complete/stream(SSE)复用本模块,取代原「第三方账号 key」。
//
// 模型由调用方(backend modelcatalog 能力绑定解析)**显式指定**;缺省回落 active provider 的 main 槽位。
// 统一走 client.messages.stream:Anthropic 与 OpenAI 出口适配器都实现 stream(turnLoop 同款),
// 非流式 = 缓冲该流,兼容两种上游、不依赖适配器是否实现 create。

import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClientFromProvider } from "../anthropic/client.ts";
import { resolveTier } from "../config/models.ts";

export interface OneShotMessage {
  role: "user" | "assistant";
  content: string;
}

export interface OneShotOptions {
  /** 显式模型 id(backend 能力绑定解析);空则回落 active provider 的 main 槽位。 */
  model?: string;
  /** 指定 provider(scholay-p<id>);空则默认 active provider。 */
  providerName?: string | null;
  system?: string;
  messages: OneShotMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface OneShotUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  model: string;
}

export interface OneShotResult {
  text: string;
  usage: OneShotUsage;
  stop_reason: string | null;
}

function resolveModel(opts: OneShotOptions): string {
  const m = (opts.model && opts.model.trim()) || resolveTier("main");
  if (!m) throw new Error("no active provider/model (awaiting PushConfig)");
  return m;
}

function normUsage(u: unknown, model: string): OneShotUsage {
  const x = (u ?? {}) as Record<string, number>;
  return {
    input_tokens: x.input_tokens ?? 0,
    output_tokens: x.output_tokens ?? 0,
    cache_read_tokens: x.cache_read_input_tokens ?? 0,
    cache_creation_tokens: x.cache_creation_input_tokens ?? 0,
    model,
  };
}

function buildParams(opts: OneShotOptions, model: string): Anthropic.MessageStreamParams {
  const params: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens && opts.maxTokens > 0 ? opts.maxTokens : 2048,
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
  };
  if (opts.system) params.system = opts.system;
  if (typeof opts.temperature === "number") params.temperature = opts.temperature;
  return params as Anthropic.MessageStreamParams;
}

/** 流式单次补全:逐 text_delta 回调 onDelta,并返回全文 + usage(计费用)。 */
export async function oneShotStream(
  opts: OneShotOptions,
  onDelta: (text: string) => void,
): Promise<OneShotResult> {
  const model = resolveModel(opts);
  const client = anthropicClientFromProvider(opts.providerName);
  const stream = client.messages.stream(buildParams(opts, model));
  let text = "";
  for await (const ev of stream) {
    if (ev.type === "content_block_delta") {
      const d = ev.delta as { type: string; text?: string };
      if (d.type === "text_delta" && d.text) {
        text += d.text;
        onDelta(d.text);
      }
    }
  }
  const final = await stream.finalMessage();
  return { text, usage: normUsage(final.usage, model), stop_reason: final.stop_reason ?? null };
}

/** 非流式单次补全 = 缓冲流式(兼容 OpenAI 出口适配器仅实现 stream)。 */
export async function oneShotComplete(opts: OneShotOptions): Promise<OneShotResult> {
  return oneShotStream(opts, () => {});
}
