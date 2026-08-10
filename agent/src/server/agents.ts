// ── /api/agents 的 subagent 定义注册表(2026-08-10)──────────────────────────
//
// 背景:backend 的 skill sync(agentbridge.Bridge.UpsertSkill → internal/agent.UpsertAgent)
// 在每次启动时把各 feature 的 agent 定义 {name, description, systemPrompt, color} 推到
// GET/POST/PUT /api/agents[...]。这个端点在本容器**从未实现过**,catch-all 回 501,
// backend 把它误诊为「agent 镜像过旧」并打 ERROR 后永久停止推送 —— 每次部署一条噪音,
// 且 backend 侧「以后切到创建时绑定 agentType」的铺垫(skill.go 注释)永远等不到。
//
// 语义(与 backend 契约对齐,刻意最小):
//   - 注册表是「声明性定义的存放处」:主流路的 prompt 注入仍走 WS 前缀(backend hub),
//     这里存的定义当前只用于可观测(GET 列表)与未来 agentType 绑定 —— 诚实起见,别处
//     不 import 它做任何行为分支。
//   - GET  /api/agents           → { agents: AgentDef[] }
//   - GET  /api/agents/:name     → AgentDef | 404
//   - POST /api/agents           → body 里带 name,upsert
//   - PUT  /api/agents/:name     → 以 URL name 为键 upsert(body.name 不一致时以 URL 为准)
//   - 幂等:同内容重复推零副作用。
//
// 持久化:单 JSON 文件(默认落在 SESSIONS_ROOT 卷下,跨容器重启存活;backend 只在
// 启动时推一次,agent 单独重启若不落盘定义就丢了)。写入走 tmp+rename 原子替换。

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { log } from "../obs/log.ts";

export interface AgentDef {
  name: string;
  description?: string;
  systemPrompt?: string;
  color?: string;
  updatedAt: string; // ISO
}

// 懒解析(而非模块级 const):测试用 EXECUTOR_AGENTS_FILE 指向临时文件 + resetAgentsForTest
// 重置内存态即可换存储位置。
function agentsFile(): string {
  return (
    process.env.EXECUTOR_AGENTS_FILE ||
    join(process.env.SESSIONS_ROOT || "/tmp/executor-sessions", ".agents.json")
  );
}

// name 契约:backend 推的是 "scholay-smart-search" 这类 slug。放宽到常见安全字符,
// 拒绝路径分隔与控制字符(它会进 URL path 段与 JSON 文件)。
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function isValidAgentName(name: string): boolean {
  return NAME_RE.test(name);
}

// systemPrompt 上限:防一次误推把注册表文件撑爆(backend 正常推的 prompt 在几 KB 量级)。
const MAX_PROMPT_BYTES = 256 * 1024;
const MAX_TEXT_FIELD = 4096;

// 单一记忆化 promise(而非 registry+loadPromise 双变量):resolved 值即注册表,
// 并发首访自然合流,测试重置只需清一个变量(复审:双变量是未来失同步的陷阱)。
let loadPromise: Promise<Map<string, AgentDef>> | null = null;

function loadRegistry(): Promise<Map<string, AgentDef>> {
  return (loadPromise ??= (async () => {
    const m = new Map<string, AgentDef>();
    try {
      const raw = await readFile(agentsFile(), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const d = item as Partial<AgentDef>;
          if (d && typeof d.name === "string" && isValidAgentName(d.name)) {
            m.set(d.name, {
              name: d.name,
              description: typeof d.description === "string" ? d.description : undefined,
              systemPrompt: typeof d.systemPrompt === "string" ? d.systemPrompt : undefined,
              color: typeof d.color === "string" ? d.color : undefined,
              updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : new Date().toISOString(),
            });
          }
        }
      }
    } catch {
      // 文件不存在/损坏 → 空注册表起步(backend 每次启动会重推,自愈)
    }
    return m;
  })());
}

// 落盘互斥链:并发 upsert(backend 启动一次推多个 feature)若同时写同一个 tmp 路径,
// writeFile 互相截断 + rename 竞速可能把半截 JSON 装进正式文件 —— 重启后被 loadRegistry
// 的 catch 静默吞成空注册表,恰是本文件要防的事(复审)。所有 persist 串进一条 promise 链,
// 天然串行 + 后写覆盖前写(最后一次全量快照胜出即正确语义)。
let persistTail: Promise<void> = Promise.resolve();

function persist(m: Map<string, AgentDef>): Promise<void> {
  persistTail = persistTail.then(async () => {
    const file = agentsFile();
    try {
      await mkdir(dirname(file), { recursive: true });
      const tmp = file + ".tmp";
      await writeFile(tmp, JSON.stringify([...m.values()], null, 1), "utf8");
      await rename(tmp, file);
    } catch (e) {
      // 落盘失败只留痕:注册表仍在内存中工作,backend 下次启动会重推
      log.warn("agents registry persist failed", { file, err: String((e as Error)?.message ?? e) });
    }
  });
  return persistTail;
}

export async function listAgents(): Promise<AgentDef[]> {
  const m = await loadRegistry();
  return [...m.values()];
}

export async function getAgent(name: string): Promise<AgentDef | null> {
  const m = await loadRegistry();
  return m.get(name) ?? null;
}

export type UpsertResult = { ok: true; def: AgentDef } | { ok: false; error: string };

export async function upsertAgent(name: string, body: Record<string, unknown>): Promise<UpsertResult> {
  if (!isValidAgentName(name)) {
    return { ok: false, error: "invalid agent name (want [A-Za-z0-9][A-Za-z0-9._-]{0,127})" };
  }
  const systemPrompt = typeof body.systemPrompt === "string" ? body.systemPrompt : undefined;
  if (systemPrompt && Buffer.byteLength(systemPrompt, "utf8") > MAX_PROMPT_BYTES) {
    return { ok: false, error: "systemPrompt too large (max 256KB)" };
  }
  const description = typeof body.description === "string" ? body.description.slice(0, MAX_TEXT_FIELD) : undefined;
  const color = typeof body.color === "string" ? body.color.slice(0, 64) : undefined;

  const m = await loadRegistry();
  const prev = m.get(name);
  const def: AgentDef = { name, description, systemPrompt, color, updatedAt: new Date().toISOString() };
  // 幂等:内容(除时间戳)未变则不落盘不改时间戳 —— backend 每次启动都会重推同一份。
  if (
    prev &&
    prev.description === def.description &&
    prev.systemPrompt === def.systemPrompt &&
    prev.color === def.color
  ) {
    return { ok: true, def: prev };
  }
  m.set(name, def);
  await persist(m);
  log.info("agents registry upsert", { name, bytes: systemPrompt ? Buffer.byteLength(systemPrompt, "utf8") : 0 });
  return { ok: true, def };
}

/** 测试用:重置内存态(配合 EXECUTOR_AGENTS_FILE 指向临时文件)。 */
export function resetAgentsForTest(): void {
  loadPromise = null;
  persistTail = Promise.resolve();
}
