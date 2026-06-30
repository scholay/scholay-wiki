// Anthropic Messages API 客户端工厂 —— provider 注入点(详细设计 §2.2)。
//
// new Anthropic({ baseURL, authToken }):用 authToken(→ Authorization: Bearer),匹配
// PushConfig 发的 authStrategy="auth_token"。provider-agnostic by construction:base_url 指向
// 任何 Anthropic-Messages-API-兼容上游(Anthropic 自家 / DeepSeek / 其它)。
// 探针已证对 DeepSeek (deepseek-v4-pro) 工作。
//
// 切 provider = PushConfig → /api/providers upsert+activate → invalidateClient() → 下次重建。

import Anthropic from "@anthropic-ai/sdk";
import { getActive } from "../config/providerStore.ts";

let cached: { id: string; baseUrl: string; token: string; client: Anthropic } | null = null;

export function anthropicClientFromProvider(): Anthropic {
  const p = getActive();
  if (!p) throw new Error("no active provider configured (awaiting PushConfig)");
  if (cached && cached.id === p.id && cached.baseUrl === p.baseUrl && cached.token === p.apiKey) {
    return cached.client;
  }
  const client = new Anthropic({ baseURL: p.baseUrl, authToken: p.apiKey, apiKey: p.apiKey });
  cached = { id: p.id, baseUrl: p.baseUrl, token: p.apiKey, client };
  return client;
}

export function invalidateClient(): void {
  cached = null;
}
