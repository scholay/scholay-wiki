// 极小 per-session meta(详细设计 §2.1 journal/sessionMeta)。无 transcript 真源 —— 那在后端 journal。
// 这里只承载:workDir + 工具策略 + appendSystemPrompt + 会话内 messages[](内存续接,跨重启无状态)。

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { safeSessionDir, validSessionId } from "../sandbox/confine.ts";
import { log } from "../obs/log.ts";

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
  if (!skills || skills.length === 0) return null;
  const dir = skillsDirFor(workDir);
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
    createdAt: new Date().toISOString(),
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
  const m = sessions.get(sid);
  if (!m) return false;
  sessions.delete(sid);
  try {
    await rm(m.workDir, { recursive: true, force: true });
    // 一并清理 per-session skill 物化目录(<workDir>.skills)。
    await rm(skillsDirFor(m.workDir), { recursive: true, force: true });
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
