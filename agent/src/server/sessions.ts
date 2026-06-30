// 极小 per-session meta(详细设计 §2.1 journal/sessionMeta)。无 transcript 真源 —— 那在后端 journal。
// 这里只承载:workDir + 工具策略 + appendSystemPrompt + 会话内 messages[](内存续接,跨重启无状态)。

import { mkdir, rm } from "node:fs/promises";
import type Anthropic from "@anthropic-ai/sdk";
import { safeSessionDir, validSessionId } from "../sandbox/confine.ts";

const SESSIONS_ROOT = process.env.SESSIONS_ROOT || "/tmp/executor-sessions";

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
}

export interface CreateOpts {
  sessionId?: string;
  workDir?: string;
  disallowedTools?: string[];
  addDirs?: string[];
  appendSystemPrompt?: string;
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
  const meta: SessionMeta = {
    sessionId: sid,
    workDir,
    disallowedTools: opts.disallowedTools || [],
    addDirs: opts.addDirs || [],
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
