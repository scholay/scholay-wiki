// Anthropic Messages API 客户端工厂 —— provider 注入点(详细设计 §2.2)。
//
// new Anthropic({ baseURL, authToken }):用 authToken(→ Authorization: Bearer),匹配
// PushConfig 发的 authStrategy="auth_token"。provider-agnostic by construction:base_url 指向
// 任何 Anthropic-Messages-API-兼容上游(Anthropic 自家 / DeepSeek / 其它)。
// 探针已证对 DeepSeek (deepseek-v4-pro) 工作。
//
// F0 多 provider:除默认 active provider 外,backend 可按名(scholay-p<id>)upsert 额外 provider,
// per-turn 经 set_runtime_config{providerId} 指定 → anthropicClientFromProvider(name) 按名解析。
// 缓存改 per-provider Map(键 = id|baseUrl|token),两 provider 交替不再互相踢缓存。
// 切 provider 配置 = PushConfig upsert → invalidateClient() → 下次重建。
//
// F3:apiFormat="openai" 的 provider 走出口翻译适配器(openai/adapter.ts)——对 turnLoop 暴露
// 同一 messages.stream/create 契约,内部真源(Anthropic 消息形)不动,翻译只在此出口分叉。

import Anthropic from "@anthropic-ai/sdk";
import { getActive, findByName } from "../config/providerStore.ts";
import { openAIAdapterClient } from "../openai/adapter.ts";

const cache = new Map<string, Anthropic>();

/**
 * 取指定 provider 的客户端:providerName 空/未知 → 默认 active provider(向后兼容)。
 * backend 是 providerId 的权威来源(hub 校验后随模型帧下发 canonical 值),未知名回落默认
 * 而非报错 —— 推送与帧存在最终一致窗口,回落默认与旧行为一致、不至于卡死会话。
 */
export function anthropicClientFromProvider(providerName?: string | null): Anthropic {
  let p = providerName ? findByName(providerName) : null;
  if (!p) p = getActive();
  if (!p) throw new Error("no active provider configured (awaiting PushConfig)");
  const key = `${p.id}|${p.baseUrl}|${p.apiKey}|${p.apiFormat}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const client =
    p.apiFormat === "openai"
      ? openAIAdapterClient(p) // F3:OpenAI 出口翻译(同契约鸭子型)
      : new Anthropic({ baseURL: p.baseUrl, authToken: p.apiKey, apiKey: p.apiKey });
  cache.set(key, client);
  return client;
}

export function invalidateClient(): void {
  cache.clear();
}
