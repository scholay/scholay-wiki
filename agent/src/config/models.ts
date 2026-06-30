// tier 别名 → 活跃 provider 槽位(详细设计 §2.6 model tiering)。
// tier 是 per-call-site 由控制面设的 turn 字段,不是 CLI 进程默认(那是单用户假设)。
// DeepSeek 实例:main/opus=deepseek-v4-pro,haiku/sonnet=deepseek-v4-flash —— 从槽位读,绝不 hardcode。

import { getActive } from "./providerStore.ts";

export type Tier = "main" | "haiku" | "sonnet" | "opus";

export function resolveTier(tier: Tier): string | null {
  const p = getActive();
  if (!p) return null;
  return p.models[tier] || p.models.main || null;
}

// listModels 把 4 个 tier 别名映射到活跃 provider 的槽位 id(镜像 agent.Client.ListModels)。
export function listModels(): {
  models: Array<{ id: string; name: string; description: string }>;
  provider?: { id: string; name: string };
} {
  const p = getActive();
  if (!p) return { models: [] };
  const m = p.models;
  return {
    models: [
      { id: m.main, name: "main", description: "主推理模型 (tier=main)" },
      { id: m.haiku, name: "haiku", description: "快速模型 (tier=haiku)" },
      { id: m.sonnet, name: "sonnet", description: "均衡模型 (tier=sonnet)" },
      { id: m.opus, name: "opus", description: "强推理模型 (tier=opus)" },
    ],
    provider: { id: p.id, name: p.name },
  };
}
