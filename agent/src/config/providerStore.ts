// 内存活跃 provider 配置(详细设计 §2.1 / §2.2)。
//
// provider-agnostic 注入点:backend 的 PushConfig 经 /api/providers upsert+activate 写入,
// anthropic/client.ts 与 config/models.ts 读取。base_url + token + 4 个 model 槽位。
// apiFormat="anthropic" 是协议不变量(非厂商),authStrategy="auth_token" → Bearer。
//
// 无持久化:provider 配置在进程内存,容器重启后由 backend 重新 PushConfig(单一真源在
// backend DB agent_config 表)。这与 backend 拥有 state 的总原则一致。

export interface ModelSlots {
  main: string;
  haiku: string;
  sonnet: string;
  opus: string;
}

export interface ProviderConfig {
  id: string;
  presetId: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  apiFormat: string; // "anthropic"
  authStrategy: string; // "auth_token"
  models: ModelSlots;
  notes?: string;
}

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

let providers: ProviderConfig[] = [];
let activeId: string | null = null;
let seq = 0;

// 轻量持久化:provider 配置写本地文件,容器 crash-restart 后自动恢复(避免重启后无 active provider)。
// 真源仍是 backend agent_config 表(backend 启动/配置变更会重推);此文件只是减少「executor 单独重启 →
// 无配置」的窗口。默认 /home/bun/.executor(bun 用户家目录可写,无需额外卷;crash-restart 保留写层)。
const STATE_FILE = (process.env.EXECUTOR_STATE_DIR || "/home/bun/.executor") + "/providers.json";

function persist(): void {
  try {
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ providers, activeId, seq }), "utf8");
  } catch {
    /* best-effort */
  }
}

(function loadOnInit() {
  try {
    const d = JSON.parse(readFileSync(STATE_FILE, "utf8")) as {
      providers?: ProviderConfig[];
      activeId?: string | null;
      seq?: number;
    };
    if (Array.isArray(d.providers)) providers = d.providers;
    if (typeof d.seq === "number") seq = d.seq;
    activeId = d.activeId ?? null;
  } catch {
    /* 首次启动无文件 */
  }
})();

export function listProviders(): { providers: ProviderConfig[]; activeId: string | null } {
  return { providers, activeId };
}

export function getActive(): ProviderConfig | null {
  if (!activeId) return null;
  return providers.find((p) => p.id === activeId) ?? null;
}

export function findByName(name: string): ProviderConfig | null {
  return providers.find((p) => p.name === name) ?? null;
}

export function createProvider(input: Omit<ProviderConfig, "id">): ProviderConfig {
  seq += 1;
  const p: ProviderConfig = { ...input, id: "prov_" + seq };
  providers.push(p);
  persist();
  return p;
}

export function updateProvider(id: string, patch: Partial<Omit<ProviderConfig, "id">>): ProviderConfig | null {
  const p = providers.find((x) => x.id === id);
  if (!p) return null;
  if (patch.name !== undefined) p.name = patch.name;
  if (patch.apiKey !== undefined) p.apiKey = patch.apiKey;
  if (patch.baseUrl !== undefined) p.baseUrl = patch.baseUrl;
  if (patch.apiFormat !== undefined) p.apiFormat = patch.apiFormat;
  if (patch.authStrategy !== undefined) p.authStrategy = patch.authStrategy;
  if (patch.models !== undefined) p.models = patch.models;
  if (patch.notes !== undefined) p.notes = patch.notes;
  persist();
  return p;
}

export function activateProvider(id: string): boolean {
  if (!providers.find((x) => x.id === id)) return false;
  activeId = id;
  persist();
  return true;
}
