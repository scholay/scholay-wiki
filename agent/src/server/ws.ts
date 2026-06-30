// WS frame 协议(详细设计 §5.3)—— Go hub 拨 ws://executor/ws/<sessionId>(Bearer header),
// 一会话一连接。执行器收 browser→agent 帧、发 agent→browser 中性帧。协议与 fork 同构 ⇒ 前端不变。
//
// 关键约定:
//  - 一连接一会话;回答中(inFlight)再来 user_message → error{code:busy}(前端 busyRejected)。
//  - permission 由控制面权威:执行器发 permission_request,阻塞等 permission_response(超时默认拒)。
//  - stop_generation → abort 当前 stream。
//  - 会话内 history 在内存(meta.messages);耐久真源在后端 journal。

import type { ServerWebSocket } from "bun";
import { runTurn, addUsage, type CallUsage } from "../turn/turnLoop.ts";
import { getOrCreateEphemeral, setTitle, allowBashFor } from "./sessions.ts";
import { convertFlatToAnthropic, type FlatMessage } from "./shadowTurn.ts";
import type { EventSink, TurnInput } from "../turn/types.ts";
import type { Tier } from "../config/models.ts";
import { generateTitle } from "../turn/title.ts";
import { fastCompletion } from "../turn/completion.ts";
import { log } from "../obs/log.ts";

export interface WSData {
  sessionId: string;
  inFlight: boolean;
  abort: AbortController | null;
  pending: Map<string, (allowed: boolean) => void>;
  tier: Tier;
  modelOverride: string | null; // set_runtime_config{modelId};peerreview 按轮切具体模型
}

const PERMISSION_TIMEOUT_MS = Number(process.env.EXECUTOR_PERMISSION_TIMEOUT_MS || 120_000);

function safeSend(ws: ServerWebSocket<WSData>, obj: unknown): void {
  try {
    ws.send(JSON.stringify(obj));
  } catch {
    /* connection closing */
  }
}

export function onOpen(ws: ServerWebSocket<WSData>): void {
  safeSend(ws, { type: "connected", sessionId: ws.data.sessionId });
  log.info("ws open", { session_id: ws.data.sessionId });
}

export async function onMessage(ws: ServerWebSocket<WSData>, raw: string | Buffer): Promise<void> {
  let frame: Record<string, unknown>;
  try {
    frame = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
  } catch {
    return;
  }
  switch (String(frame.type || "")) {
    case "ping":
      safeSend(ws, { type: "pong" });
      return;
    case "stop_generation":
      ws.data.abort?.abort();
      return;
    case "permission_response": {
      const requestId = String(frame.requestId || "");
      const resolve = ws.data.pending.get(requestId);
      if (resolve) {
        ws.data.pending.delete(requestId);
        resolve(frame.allowed === true);
      }
      return;
    }
    case "set_runtime_config": {
      // peerreview 发具体 modelId(cfg.MainModel/HaikuModel);浏览器可能发 tier。两者都认。
      if (typeof frame.modelId === "string" && frame.modelId.trim()) ws.data.modelOverride = frame.modelId.trim();
      const t = frame.tier as Tier | undefined;
      if (t && ["main", "haiku", "sonnet", "opus"].includes(t)) ws.data.tier = t;
      return;
    }
    case "seed_history": {
      // H1:后端在连接后、首条 user_message 前喂 journal 折叠的 history(执行器不自持久化)。
      // 仅当会话内 history 为空时 seed —— 不覆盖进行中的内存会话(重连且本进程还活着时)。
      const meta = await getOrCreateEphemeral(ws.data.sessionId);
      if (meta.messages.length === 0 && Array.isArray(frame.messages)) {
        meta.messages = convertFlatToAnthropic(frame.messages as FlatMessage[]);
      }
      // 后端拥有的已有标题一并喂入 → 已命名会话重连不再重复生成标题(与 DB 一致)。
      if (typeof frame.title === "string" && frame.title && !meta.title) {
        setTitle(meta.sessionId, frame.title);
      }
      safeSend(ws, { type: "history_seeded", count: meta.messages.length });
      return;
    }
    case "prewarm_session":
      return; // no-op
    case "extract_memory": {
      // Go 发 {system,user}(记忆抽取 spec 是 Go-authored 单一真源);执行器跑一次 fast 补全回 memory_update{text}。
      const system = String(frame.system || "");
      const user = String(frame.user || "");
      if (!system && !user) {
        safeSend(ws, { type: "memory_update", text: "" });
        return;
      }
      fastCompletion(system, user, 1024)
        .then(({ text, usage }) => {
          // C1:记忆抽取是 billable 调用 → 发 token_usage{kind:memory_extract}(Go 端归 memory + SkipQuota)。
          safeSend(ws, { type: "token_usage", usage, kind: "memory_extract" });
          safeSend(ws, { type: "memory_update", text });
        })
        .catch((e) => {
          log.warn("extract_memory failed", { err: String((e as Error)?.message ?? e) });
          safeSend(ws, { type: "memory_update", text: "" });
        });
      return;
    }
    case "user_message":
      await handleUserMessage(ws, frame);
      return;
    default:
      return;
  }
}

async function handleUserMessage(ws: ServerWebSocket<WSData>, frame: Record<string, unknown>): Promise<void> {
  if (ws.data.inFlight) {
    safeSend(ws, { type: "error", code: "busy", message: "a turn is already in flight", retryable: false });
    return;
  }
  const content = String(frame.content ?? "");
  if (!content) return;

  const meta = await getOrCreateEphemeral(ws.data.sessionId);
  const isFirstTurn = !meta.title && meta.messages.length === 0; // 首轮 → 之后生成标题
  ws.data.inFlight = true;
  const abort = new AbortController();
  ws.data.abort = abort;
  let assistantText = "";
  let turnCompleted = false;

  const sink: EventSink = {
    frame(f) {
      if (f.type === "content_delta" && typeof f.text === "string") assistantText += f.text;
      if (f.type === "session_title_updated" && typeof f.title === "string") setTitle(meta.sessionId, f.title);
      if (f.type === "message_complete") {
        turnCompleted = true;
        const u = (f.usage ?? {}) as Record<string, unknown>;
        const turnUsage: CallUsage = {
          input_tokens: Number(u.input_tokens ?? 0),
          output_tokens: Number(u.output_tokens ?? 0),
          cache_read_tokens: Number(u.cache_read_tokens ?? 0),
          cache_creation_tokens: Number(u.cache_creation_tokens ?? 0),
          model: String(u.model ?? ""),
        };
        // C1:补会话累计 session_total(Go accrueTurnUsage 需要它做水位去重 + 计费)。
        meta.cumUsage = addUsage(meta.cumUsage, turnUsage);
        (f as Record<string, unknown>).session_total = meta.cumUsage;
        meta.lastUsage = { input_tokens: turnUsage.input_tokens, output_tokens: turnUsage.output_tokens, model: turnUsage.model };
      }
      safeSend(ws, f);
    },
    error(message, code) {
      safeSend(ws, { type: "error", message, code });
    },
    requestPermission(req) {
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          if (ws.data.pending.delete(req.requestId)) resolve(false); // 超时默认拒(安全侧)
        }, PERMISSION_TIMEOUT_MS);
        ws.data.pending.set(req.requestId, (allowed) => {
          clearTimeout(timer);
          resolve(allowed);
        });
        safeSend(ws, {
          type: "permission_request",
          requestId: req.requestId,
          toolName: req.toolName,
          toolUseId: req.toolUseId,
          input: req.input,
        });
      });
    },
  };

  // 把 user 消息加入会话内 history(runTurn 复制后再 append assistant/tool_result)
  meta.messages.push({ role: "user", content });

  const input: TurnInput = {
    sessionId: meta.sessionId,
    clientTurnId: frame.clientTurnId ? String(frame.clientTurnId) : undefined,
    messages: meta.messages,
    tier: ws.data.tier,
    modelOverride: ws.data.modelOverride ?? undefined,
    disallowedTools: meta.disallowedTools,
    appendSystemPrompt: meta.appendSystemPrompt,
    addDirs: meta.addDirs,
    workDir: meta.workDir,
    allowBash: allowBashFor(meta),
    net: "open",
  };

  try {
    meta.messages = await runTurn(input, sink, abort.signal);
  } catch (e) {
    safeSend(ws, { type: "error", message: String((e as Error)?.message ?? e), code: "internal" });
  } finally {
    ws.data.inFlight = false;
    ws.data.abort = null;
    for (const [, resolve] of ws.data.pending) resolve(false);
    ws.data.pending.clear();
  }

  // 首轮完成后异步生成标题(不阻塞;连接保持以发帧)。Go 侧 OnTitleResult 落库。
  if (isFirstTurn && turnCompleted && !meta.title && assistantText) {
    generateTitle(content, assistantText)
      .then(({ title, usage }) => {
        // C1:标题生成是 billable 调用 → 发 token_usage{kind:title_gen}(Go 端正常计费/扣额度)。
        if (usage) safeSend(ws, { type: "token_usage", usage, kind: "title_gen" });
        if (title) {
          setTitle(meta.sessionId, title);
          safeSend(ws, { type: "session_title_updated", sessionId: meta.sessionId, title, aiGenerated: true });
        }
      })
      .catch((e) => log.warn("title-gen failed", { err: String((e as Error)?.message ?? e) }));
  }
}

export function onClose(ws: ServerWebSocket<WSData>): void {
  ws.data.abort?.abort();
  for (const [, resolve] of ws.data.pending) resolve(false);
  ws.data.pending.clear();
  log.info("ws close", { session_id: ws.data.sessionId });
}
