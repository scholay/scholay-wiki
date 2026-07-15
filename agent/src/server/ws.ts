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
import { getOrCreateEphemeral, setTitle, allowBashFor, materializeSessionSkills } from "./sessions.ts";
import { buildUserContentWithImages } from "./attachments.ts";
import { convertFlatToAnthropic, type FlatMessage } from "./shadowTurn.ts";
import type { EventSink, TurnInput } from "../turn/types.ts";
import type { Tier } from "../config/models.ts";
import { generateTitle } from "../turn/title.ts";
import { fastCompletion } from "../turn/completion.ts";
import { windowMessages } from "../turn/window.ts";
import { reduceForWindow, type CompactCache } from "../turn/compact.ts";
import { estimateTokens } from "../turn/context-budget.ts";
import { log } from "../obs/log.ts";

// H5:长会话上下文只增不减的滑窗参数。CONTEXT_WINDOW=上游 context 窗口;近 TRIGGER_PCT% 才裁老回合,
// 保留最近 KEEP_TURNS 个回合。KEEP_TURNS/TRIGGER 设 0 关闭。默认保守:仅濒临上限时触发,正常会话零影响。
const CONTEXT_WINDOW = Number(process.env.EXECUTOR_CONTEXT_WINDOW || 128000);
const WINDOW_TRIGGER_PCT = Number(process.env.EXECUTOR_WINDOW_TRIGGER_PCT || 75);
const WINDOW_KEEP_TURNS = Number(process.env.EXECUTOR_WINDOW_KEEP_TURNS || 25);

export interface WSData {
  sessionId: string;
  inFlight: boolean;
  abort: AbortController | null;
  pending: Map<string, (allowed: boolean) => void>;
  tier: Tier;
  modelOverride: string | null; // set_runtime_config{modelId};peerreview 按轮切具体模型
  // set_runtime_config{providerId}(F0 多 provider):额外 provider 的 executor 键(scholay-p<id>);
  // null = 默认 active provider。backend hub 是 canonical 来源,随模型帧成对下发(""=显式回默认)。
  providerOverride: string | null;
  // set_runtime_config{contextWindow}:当前会话模型的上下文窗口(模型目录化 P2,backend 随
  // 模型帧下发)。null = 未知 → 回落全局 EXECUTOR_CONTEXT_WINDOW。异构上下文模型(64k/200k)
  // 的 H5 滑窗裁剪据此按模型定界,否则小上下文模型先撞上游墙、大上下文模型被提前裁剪。
  contextWindow: number | null;
  // set_runtime_config{maxOutput}:当前会话模型的最大完成 token 数(目录 max_output,backend 随
  // 模型帧下发)。null = 未知 → 回落全局 EXECUTOR_MAX_TOKENS;turnLoop 取二者较小值定 max_tokens,
  // 避免小完成窗模型(gpt-4o-mini 16384)被全局 64000 顶爆 400(2026-07-14 事故)。
  maxOutput: number | null;
  // set_runtime_config{vision}:当前会话模型是否支持图片输入(P2 图片通道,backend 按目录下发)。
  // false → turnLoop 发请求前把历史 image 块换成文本占位(防无视觉模型对图块 400)。
  vision: boolean;
}

const PERMISSION_TIMEOUT_MS = Number(process.env.EXECUTOR_PERMISSION_TIMEOUT_MS || 120_000);

// parseTaskBudget —— 从 user_message 帧的 budget 对象解析有界透支预算(SS#2)。
// backend 只给 3 个 chat feature 盖章;缺失/非法 → undefined(peerreview 及老前端天然走无预算路径)。
export function parseTaskBudget(raw: unknown): { softRemaining: number; hardRemaining: number } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as { softRemaining?: unknown; hardRemaining?: unknown };
  if (typeof b.softRemaining !== "number" || typeof b.hardRemaining !== "number") return undefined;
  return { softRemaining: b.softRemaining, hardRemaining: b.hardRemaining };
}

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
      // backend hub(P2 经权威校验后重组的帧)与 peerreview serverside 发具体 modelId;tier 是老通道兼容。
      if (typeof frame.modelId === "string" && frame.modelId.trim()) {
        ws.data.modelOverride = frame.modelId.trim();
        // providerId 随模型帧成对解释:非空 → 指定额外 provider;空串/缺失 → 回默认(清 override)。
        ws.data.providerOverride =
          typeof frame.providerId === "string" && frame.providerId.trim() ? frame.providerId.trim() : null;
        // 窗口/输出上限随模型帧**成对重置**:未携带即回 null(回落全局默认)。若只在 >0 时更新,
        // 从小窗模型切回未配置的模型会把旧值粘住(粘滞 bug)。
        ws.data.contextWindow =
          typeof frame.contextWindow === "number" && frame.contextWindow > 0 ? frame.contextWindow : null;
        ws.data.maxOutput =
          typeof frame.maxOutput === "number" && frame.maxOutput > 0 ? frame.maxOutput : null;
        ws.data.vision = frame.vision === true;
        // 运维可观测:模型帧是会话行为(模型/端点/窗口/视觉)的开关,值错查无可查 → 常驻 INFO。
        log.info("runtime config applied", {
          session_id: ws.data.sessionId,
          model: ws.data.modelOverride,
          provider: ws.data.providerOverride ?? "(default)",
          context_window: ws.data.contextWindow ?? 0,
          max_output: ws.data.maxOutput ?? 0,
          vision: ws.data.vision,
        });
      } else if (typeof frame.contextWindow === "number" && frame.contextWindow > 0) {
        // 无 modelId 的帧(老 tier 通道)只做增量更新,维持原语义。
        ws.data.contextWindow = frame.contextWindow;
      }
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
      // H3:回填注入面(system prompt 规则+记忆 / skills addDirs / denylist)。executor 重启后
      // ephemeral meta 这些字段全空,只 seed messages 会让存量会话丢规则/记忆/skills。仅在 meta
      // 当前为空时回填 —— 不覆盖本进程还活着的活会话(其字段已由 CreateSession 设好)。
      if (typeof frame.appendSystemPrompt === "string" && frame.appendSystemPrompt && !meta.appendSystemPrompt) {
        meta.appendSystemPrompt = frame.appendSystemPrompt;
      }
      if (Array.isArray(frame.addDirs) && frame.addDirs.length > 0 && meta.addDirs.length === 0) {
        meta.addDirs = (frame.addDirs as unknown[]).map(String);
      }
      // 用户市场 skill:重连/重启后 backend 经 seed_history 带内联内容回填(meta.addDirs 为空时物化)。
      // 与 CreateSession 同一物化路径;物化目录并入 addDirs 供 loader 的 guides 菜单识别。
      if (Array.isArray(frame.skills) && frame.skills.length > 0 && !meta.addDirs.some((d) => d.endsWith(".skills"))) {
        const skillsDir = await materializeSessionSkills(meta.workDir, frame.skills as { name: string; skillMd: string }[]);
        if (skillsDir && !meta.addDirs.includes(skillsDir)) meta.addDirs.push(skillsDir);
      }
      if (Array.isArray(frame.disallowedTools) && frame.disallowedTools.length > 0 && meta.disallowedTools.length === 0) {
        meta.disallowedTools = (frame.disallowedTools as unknown[]).map(String);
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
  // P2 图片通道:attachments 里的 image 从会话 cwd 读出并 base64 内嵌为 Anthropic image 块
  // (与 @"path" 文本标记并存:标记服务历史回放 chips 与文件语义,图块给模型「看见」)。
  // 无图 / 读取失败 → 纯文本(与旧行为一致)。是否真发给上游由 turnLoop 按 vision 能力过滤。
  const userContent = await buildUserContentWithImages(meta.workDir, content, frame.attachments);
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
      // 终帧统一入水位:message_complete 必带 usage;error 终帧在轮内已有 LLM 消耗时也携带
      // (turnLoop sendError)—— 两种终帧同口径累计 cumUsage + 补 session_total,否则失败轮
      // 的真实上游消耗漏出会话水位,Go 侧计费/配额跟着漏记(2026-07-14 评审 #4 回归修复)。
      if (f.type === "message_complete" || (f.type === "error" && (f as Record<string, unknown>).usage)) {
        if (f.type === "message_complete") turnCompleted = true;
        const u = ((f as Record<string, unknown>).usage ?? {}) as Record<string, unknown>;
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
  meta.messages.push({ role: "user", content: userContent });

  // 近上限时**分层降级**上下文,避免只增不减撞上游 context 墙(报笼统 upstream failed 卡死)。
  // P0 触发修复:触发信号取 max(上一轮 usage, 当前 history 估算)—— 只信 lastUsage 时,重连 seed
  // 大历史 / 首轮 lastUsage 为空 → 恒不触发,恰好漏掉「切小模型溢出」立项场景。estimateTokens 补上。
  // 分层(reduceForWindow):① 裁老 tool_result(不动 LLM)② 滚动摘要 ③ 按 token 预算硬裁。摘要 memoize。
  // 模型目录化 P2:上下文墙按会话模型定界(backend 随模型帧下发),未知回落全局 env。
  const ctxWindow = ws.data.contextWindow ?? CONTEXT_WINDOW;
  const lastCtx = meta.lastUsage ? meta.lastUsage.input_tokens + meta.lastUsage.output_tokens : 0;
  const estCtx = Math.max(lastCtx, estimateTokens(meta.messages));
  if (ctxWindow > 0 && WINDOW_KEEP_TURNS > 0 && WINDOW_TRIGGER_PCT > 0 && estCtx > (ctxWindow * WINDOW_TRIGGER_PCT) / 100) {
    const beforeTok = estimateTokens(meta.messages);
    try {
      const r = await reduceForWindow(meta.messages, ctxWindow, {
        keepTurns: WINDOW_KEEP_TURNS,
        targetPct: WINDOW_TRIGGER_PCT,
        cache: meta.compactCache,
      });
      if (r.actions.length > 0) {
        meta.messages = r.messages;
        meta.compactCache = r.cache;
        log.info("context reduced", {
          session_id: meta.sessionId, ctx_window: ctxWindow,
          before_tok: beforeTok, after_tok: estimateTokens(meta.messages), actions: r.actions.join(","),
        });
        if (r.usage) {
          // 摘要调用计费(便宜档;后端 recordOutOfBandTokens 按 kind=context_compact 归系统开销)。
          safeSend(ws, { type: "token_usage", usage: r.usage, kind: "context_compact" });
        }
        // 透明层:发生过摘要压缩(非纯裁剪)时才提示用户(裁 tool_result 无损,不打扰)。
        if (r.actions.some((a) => a.startsWith("compact"))) {
          safeSend(ws, {
            type: "system_notification",
            kind: "context_compacted",
            level: "info",
            message: "为适配当前模型的上下文窗口,已将较早的对话压缩为摘要 —— 精确细节可能有损,需要完整上下文可开新对话。",
          });
        }
      }
    } catch (e) {
      // reduceForWindow 内部已含兜底,走到这是意外异常 → 最后一道硬截断保命。
      meta.messages = windowMessages(meta.messages, WINDOW_KEEP_TURNS);
      log.warn("context reduce threw, hard-truncated", {
        session_id: meta.sessionId, err: String((e as Error)?.message ?? e),
      });
    }
  }

  const input: TurnInput = {
    sessionId: meta.sessionId,
    clientTurnId: frame.clientTurnId ? String(frame.clientTurnId) : undefined,
    messages: meta.messages,
    tier: ws.data.tier,
    modelOverride: ws.data.modelOverride ?? undefined,
    providerName: ws.data.providerOverride ?? undefined,
    maxOutput: ws.data.maxOutput ?? undefined,
    contextWindow: ctxWindow,
    vision: ws.data.vision,
    disallowedTools: meta.disallowedTools,
    appendSystemPrompt: meta.appendSystemPrompt,
    addDirs: meta.addDirs,
    workDir: meta.workDir,
    allowBash: allowBashFor(meta),
    net: "open",
    // 有界透支预算(SS#2):backend 在 user_message 上盖 budget 对象;peerreview 不盖 → undefined。
    taskBudget: parseTaskBudget((frame as Record<string, unknown>).budget),
  };

  try {
    meta.messages = await runTurn(input, sink, abort.signal);
  } catch (e) {
    // 兜底:runTurn 内部已接住上游/流式失败(带日志+error 帧),走到这说明是意外异常 —— 必须留痕。
    log.error("runTurn threw (unexpected)", { err: String((e as Error)?.message ?? e), session_id: meta.sessionId });
    safeSend(ws, { type: "error", message: "服务开小差了,请稍后重试。", code: "internal" });
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
