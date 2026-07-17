// 极小 per-session meta(详细设计 §2.1 journal/sessionMeta)。无 transcript 真源 —— 那在后端 journal。
// 这里只承载:workDir + 工具策略 + appendSystemPrompt + 会话内 messages[](内存续接,跨重启无状态)。

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { safeSessionDir, validSessionId } from "../sandbox/confine.ts";
import { log } from "../obs/log.ts";
import { localISO } from "../tools/clock.ts";

const SESSIONS_ROOT = process.env.SESSIONS_ROOT || "/tmp/executor-sessions";

// 用户市场 skill 的一份物化输入(backend 规范化后经 CreateSession/seed_history 内联下发)。
export interface SessionSkillInput {
  name: string; // 命名空间化 guide 名(u<authorId>-<slug>),须匹配 SKILL_NAME_RE
  skillMd: string; // 规范化后的 SKILL.md 正文(不可信用户内容,只走 guides 按需层)
}

// guide 目录名白名单(对齐 registry.ts SKILL_NAME_RE / loader.ts)。防路径穿越 / 撞名 shadow。
const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const MAX_SESSION_SKILLS = 5; // 护 loader MENU_CAP_CHARS;与 backend MaxEnabledPerSession 对齐
const MAX_SKILL_MD_BYTES = 20_000; // 与 backend 8000 字符上限对齐留余量,防超大注入

// skillsDirFor:会话 skill 物化目录 = <workDir>.skills(cwd 之外的兄弟目录,防模型自改写 / 被成果收割)。
function skillsDirFor(workDir: string): string {
  return workDir + ".skills";
}

// materializeSessionSkills:把 backend 下发的用户 skill 写成 <workDir>.skills/guides/<name>/SKILL.md
// (只读语义:目录在 cwd 外,文件工具的 confine 只服务 cwd,模型碰不到)。返回 skills 目录路径(有内容时)
// 供推进 addDirs;无有效 skill 返回 null。**只走 guides 按需菜单**,绝不写 CLAUDE.md/.claude/skills(常驻注入位)。
export async function materializeSessionSkills(
  workDir: string,
  skills: SessionSkillInput[] | undefined,
): Promise<string | null> {
  const dir = skillsDirFor(workDir);
  const guidesDir = join(dir, "guides");
  // 清后写:每次物化 = 当前启用集的**全量替换**。executor 重启后 backend 用「当前」启用集重 seed,
  // 若只增不清,旧集 / 已 disable / 已 takedown 的 skill 副本会在磁盘 guides/ 累积、仍被 Skill 工具加载
  // (5 份上限名存实亡)。先清空 guides/ 再逐份写,杜绝跨重启残留。SESSIONS_ROOT 无 volume,
  // restart: unless-stopped 会保留可写层,故这一步必须在物化前无条件执行(含 skills 为空时清尽旧集)。
  await rm(guidesDir, { recursive: true, force: true });
  if (!skills || skills.length === 0) return null;
  let written = 0;
  for (const sk of skills) {
    if (written >= MAX_SESSION_SKILLS) break;
    const name = String(sk?.name ?? "").trim();
    if (!SKILL_NAME_RE.test(name)) {
      log.warn("skip session skill: invalid name", { name });
      continue; // 拒非法名(防 ../ 穿越 / 撞一方 skill)
    }
    const body = String(sk?.skillMd ?? "");
    if (!body.trim()) continue;
    const capped = body.length > MAX_SKILL_MD_BYTES ? body.slice(0, MAX_SKILL_MD_BYTES) : body;
    try {
      const guideDir = join(dir, "guides", name);
      await mkdir(guideDir, { recursive: true });
      await writeFile(join(guideDir, "SKILL.md"), capped, "utf8");
      written++;
    } catch (e) {
      log.warn("materialize session skill failed", { name, err: String((e as Error)?.message ?? e) });
    }
  }
  if (written === 0) return null;
  log.info("session skills materialized", { dir, count: written });
  return dir;
}

export interface SessionMeta {
  sessionId: string;
  workDir: string;
  disallowedTools: string[];
  addDirs: string[];
  appendSystemPrompt?: string;
  title?: string;
  messages: Anthropic.MessageParam[]; // 会话内 history(内存);耐久真源在后端事件溯源 journal
  lastUsage?: { input_tokens: number; output_tokens: number; model: string };
  // 会话累计 token(in-band 计费用):每轮把 message_complete.usage 累加进来,作为 session_total 发给
  // Go 计费链(accrueTurnUsage 用 per-session 水位去重 + 处理重连 reset)。executor 重启即归零 →
  // 后端水位检测到回退会 re-base,不会双计。
  cumUsage: { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_creation_tokens: number; model: string };
  createdAt: string;
  lastActiveAt: number; // 最近活动时刻(ms;建会话/收 user_message/WS 连接时刷新)——内存淘汰用

  // 压缩缓存(P2 memoize):同一被压缩边界不重复摘要 + 不破坏上游前缀缓存。
  compactCache?: import("../turn/compact.ts").CompactCache;
}

export interface CreateOpts {
  sessionId?: string;
  workDir?: string;
  disallowedTools?: string[];
  addDirs?: string[];
  appendSystemPrompt?: string;
  // 用户市场 skill(内联内容):executor 物化到 <workDir>.skills/guides/ 并并入 addDirs。
  skills?: SessionSkillInput[];
}

const sessions = new Map<string, SessionMeta>();

// allowBash 由 denylist 推导:Bash 不在 denylist 即允许(claw 画像)。
export function allowBashFor(meta: SessionMeta): boolean {
  return !meta.disallowedTools.includes("Bash");
}

export async function createSession(opts: CreateOpts): Promise<SessionMeta> {
  const sid = opts.sessionId || crypto.randomUUID();
  if (!validSessionId(sid)) throw new Error("invalid sessionId"); // H4:挡 ../ 等穿越
  // H4:默认 workDir 经 safeSessionDir 断言为 SESSIONS_ROOT 子目录(opts.workDir 来自 Go 控制面,可信)。
  const workDir = opts.workDir || safeSessionDir(SESSIONS_ROOT, sid);
  await mkdir(workDir, { recursive: true });
  const addDirs = [...(opts.addDirs || [])];
  // 用户市场 skill:物化到 <workDir>.skills/guides/ 并并入 addDirs(guides 按需层)。
  const skillsDir = await materializeSessionSkills(workDir, opts.skills);
  if (skillsDir && !addDirs.includes(skillsDir)) addDirs.push(skillsDir);
  const meta: SessionMeta = {
    sessionId: sid,
    workDir,
    disallowedTools: opts.disallowedTools || [],
    addDirs,
    appendSystemPrompt: opts.appendSystemPrompt,
    messages: [],
    cumUsage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, model: "" },
    createdAt: localISO(),
    lastActiveAt: Date.now(),
  };
  sessions.set(sid, meta);
  return meta;
}

export function getSession(sid: string): SessionMeta | null {
  return sessions.get(sid) ?? null;
}

// getOrCreateEphemeral:WS 连到未经 CreateSession 的 session(直连/迁移期)→ 建保守默认 meta。
export async function getOrCreateEphemeral(sid: string): Promise<SessionMeta> {
  const existing = sessions.get(sid);
  if (existing) return existing;
  return createSession({ sessionId: sid });
}

export async function deleteSession(sid: string): Promise<boolean> {
  if (!validSessionId(sid)) return false; // H4:挡 ../ 等穿越(下面按约定路径删磁盘目录)
  const m = sessions.get(sid);
  if (m) sessions.delete(sid);
  // 兜底(评审 2026-07 性能审计 P0):executor 重启后内存 Map 清空,但 workspace 目录仍在宿主 bind-mount 上。
  // 旧逻辑 Map miss 直接 return false → backend 收 404 后照删 DB 行 → workspace 成永久孤儿(且卡死 backend GC)。
  // 改为 Map miss 时回退按约定路径 safeSessionDir(SESSIONS_ROOT, sid) 删目录,让删除对重启幂等。
  const workDir = m?.workDir || safeSessionDir(SESSIONS_ROOT, sid);
  try {
    await rm(workDir, { recursive: true, force: true });
    // 一并清理 per-session skill 物化目录(<workDir>.skills)。
    await rm(skillsDirFor(workDir), { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
  return true;
}

export function listSessions(ids?: string[]): SessionMeta[] {
  const all = [...sessions.values()];
  if (ids && ids.length) return all.filter((s) => ids.includes(s.sessionId));
  return all;
}

// ── 会话内存生命周期(性能审计 P0)────────────────────────────────────────────────
// 问题:sessions Map 只增不减 —— 每个连过的会话连同完整内存 history(含 base64 图)常驻,进程内存只涨不跌。
// 淘汰策略(纯内存,不碰磁盘):
//   ① 空闲 TTL:lastActiveAt 超过 IDLE_TTL 且【无活跃 WS 订阅者】的会话 → 驱逐内存 meta。
//   ② MAX_SESSIONS 硬帽:超帽按 lastActiveAt 升序 LRU 挤出最久未用(同样要求无活跃 WS)。
// 安全性:耐久真源在 backend journal;被驱逐会话重连时,backend 在首条 user_message 前经 seed_history
// 把 journal 折叠的 history 回灌到(重新创建的空)meta(见 ws.ts seed_history + hub.go seedHistoryFromJournal),
// 故驱逐纯内存无损。驱逐【绝不删 workDir】—— 磁盘回收归 backend 侧 GC。

const IDLE_TTL_MS = Math.max(60_000, Number(process.env.EXECUTOR_SESSION_IDLE_TTL_MS || 30 * 60_000));
const MAX_SESSIONS = Math.max(16, Number(process.env.EXECUTOR_MAX_SESSIONS || 200));
const SWEEP_EVERY_MS = 5 * 60_000;

const activeWs = new Map<string, number>(); // sid → 活跃 WS 订阅者数(>0 = 有连接在用,不淘汰)

/** WS 连接打开:活跃计数 +1 并刷新活动时刻。 */
export function sessionWsOpened(sid: string): void {
  activeWs.set(sid, (activeWs.get(sid) ?? 0) + 1);
  markSessionActive(sid);
}

/** WS 连接关闭:活跃计数 -1(归零即删)。 */
export function sessionWsClosed(sid: string): void {
  const n = (activeWs.get(sid) ?? 0) - 1;
  if (n > 0) activeWs.set(sid, n);
  else activeWs.delete(sid);
}

function hasActiveWs(sid: string): boolean {
  return (activeWs.get(sid) ?? 0) > 0;
}

/** 刷新会话最近活动时刻(收到 user_message / WS 连接时调)。 */
export function markSessionActive(sid: string): void {
  const m = sessions.get(sid);
  if (m) m.lastActiveAt = Date.now();
}

function sweepIdleSessions(): void {
  const now = Date.now();
  let evicted = 0;
  // ① 空闲 TTL
  for (const [sid, m] of sessions) {
    if (hasActiveWs(sid)) continue;
    if (now - m.lastActiveAt > IDLE_TTL_MS) {
      sessions.delete(sid);
      evicted++;
    }
  }
  // ② 硬帽 LRU:仍超帽则按 lastActiveAt 升序挤出最久未用(无活跃 WS 者)
  if (sessions.size > MAX_SESSIONS) {
    const evictable = [...sessions.entries()]
      .filter(([sid]) => !hasActiveWs(sid))
      .sort((a, b) => a[1].lastActiveAt - b[1].lastActiveAt);
    let over = sessions.size - MAX_SESSIONS;
    for (const [sid] of evictable) {
      if (over <= 0) break;
      sessions.delete(sid);
      evicted++;
      over--;
    }
  }
  if (evicted > 0) {
    log.info("session sweep: evicted idle in-memory metas", { evicted, remaining: sessions.size });
  }
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

/** 启动会话内存淘汰的周期扫描(进程启动时调一次)。 */
export function startSessionSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(sweepIdleSessions, SWEEP_EVERY_MS);
}

export function setTitle(sid: string, title: string): boolean {
  const m = sessions.get(sid);
  if (!m) return false;
  m.title = title;
  return true;
}

// sessionFlatMessages:把会话内 Anthropic messages 摊成 daemon 扁平形(每 block 一条 typed message),
// 供 GetSessionMessages(主要消费者=记忆抽取的 transcript)。耐久真源仍是后端 journal;这是内存尽力视图。
export function sessionFlatMessages(meta: SessionMeta): {
  messages: Array<{ type: string; content: unknown }>;
  totalTurns: number;
} {
  const out: Array<{ type: string; content: unknown }> = [];
  let userTurns = 0;
  for (const m of meta.messages) {
    const blocks = Array.isArray(m.content)
      ? (m.content as unknown as Array<Record<string, unknown>>)
      : [{ type: "text", text: String(m.content) }];
    if (m.role === "user") {
      const textBlocks = blocks.filter((b) => b.type !== "tool_result");
      const toolResults = blocks.filter((b) => b.type === "tool_result");
      if (textBlocks.length) {
        out.push({ type: "user", content: textBlocks });
        userTurns++;
      }
      for (const tr of toolResults) out.push({ type: "tool_result", content: [tr] });
    } else {
      for (const b of blocks) {
        if (b.type === "tool_use") out.push({ type: "tool_use", content: [b] });
        else out.push({ type: "assistant", content: [b] });
      }
    }
  }
  return { messages: out, totalTurns: userTurns };
}
