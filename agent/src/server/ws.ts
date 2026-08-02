// WS frame 协议(详细设计 §5.3)—— Go hub 拨 ws://executor/ws/<sessionId>(Bearer header),
// 一会话一连接。执行器收 browser→agent 帧、发 agent→browser 中性帧。协议与 fork 同构 ⇒ 前端不变。
//
// 关键约定:
//  - 一连接一会话;回答中(inFlight)再来 user_message → error{code:busy}(前端 busyRejected)。
//  - permission 由控制面权威:执行器发 permission_request,阻塞等 permission_response(超时默认拒)。
//  - stop_generation → abort 当前 stream。
//  - 会话内 history 在内存(meta.messages);耐久真源在后端 journal。

import type { ServerWebSocket } from "bun";
import { runTurn, addUsage, effectiveOutputCap, type CallUsage } from "../turn/turnLoop.ts";
import { getOrCreateEphemeral, setTitle, allowBashFor, materializeSessionSkills, sessionWsOpened, sessionWsClosed, markSessionActive, beginHydration, endHydration, awaitHydration, envNum } from "./sessions.ts";
import { tryAcquireTurn } from "./admission.ts";
import { buildUserContentWithImages } from "./attachments.ts";
import { convertFlatToAnthropic, type FlatMessage } from "./shadowTurn.ts";
import type { EventSink, PermissionDecision, TurnInput } from "../turn/types.ts";
import type { Tier } from "../config/models.ts";
import { fallbackTitle, generateTitle } from "../turn/title.ts";
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
  // 回调第二参 = 控制面回执里的 userMessage(2026-07 审查 [16]/[21]);缺省(超时/断连默认拒)时不带。
  pending: Map<string, (allowed: boolean, userMessage?: string) => void>;
  tier: Tier;
  modelOverride: string | null; // set_runtime_config{modelId};peerreview 按轮切具体模型
  // set_runtime_config{providerId}(F0 多 provider):额外 provider 的 executor 键(scholay-p<id>);
  // null = 默认 active provider。backend hub 是 canonical 来源,随模型帧成对下发(""=显式回默认)。
  providerOverride: string | null;
  // set_runtime_config{contextWindow}:当前会话模型的上下文窗口(模型目录化 P2,backend 随
  // 模型帧下发)。null = 未知 → 回落全局 EXECUTOR_CONTEXT_WINDOW。异构上下文模型(64k/200k)
  // 的 H5 滑窗裁剪据此按模型定界,否则小上下文模型先撞上游墙、大上下文模型被提前裁剪。
  contextWindow: number | null;
  // set_runtime_config{maxInput}:当前会话模型的最大输入 token(目录 max_input,backend 随模型帧下发)。
  // null = 未配置 → 压缩墙回落「上下文 − 输出预留」自动算。压缩墙的输入预算据此定,保证 输入+输出 ≤ 上下文。
  maxInput: number | null;
  // set_runtime_config{maxOutput}:当前会话模型的最大完成 token 数(目录 max_output,backend 随
  // 模型帧下发)。null = 未知 → 回落全局 EXECUTOR_MAX_TOKENS;turnLoop 取二者较小值定 max_tokens,
  // 避免小完成窗模型(gpt-4o-mini 16384)被全局 64000 顶爆 400(2026-07-14 事故)。
  maxOutput: number | null;
  // set_runtime_config{vision}:当前会话模型是否支持图片输入(P2 图片通道,backend 按目录下发)。
  // false → turnLoop 发请求前把历史 image 块换成文本占位(防无视觉模型对图块 400)。
  vision: boolean;
}

const PERMISSION_TIMEOUT_MS = Number(process.env.EXECUTOR_PERMISSION_TIMEOUT_MS || 120_000);

// 水合(seed_history)等待硬上限(2026-07 线上审计 §2.3):正常 <50ms,给到秒级只为盖住磁盘抖动;
// 超时即**拒绝本轮**(见 handleUserMessage),绝不带空上下文硬答。envNum 防误配成非数字 → NaN。
const SEED_WAIT_MS = envNum("EXECUTOR_SEED_WAIT_MS", 10_000);

// parseTaskBudget —— 从 user_message 帧的 budget 对象解析有界透支预算(SS#2)。
// backend 只给 5 个 chat feature(smart_search/claw/prism/boltslides/sci_draw)盖章;
// 缺失/非法 → undefined(peerreview 及老前端天然走无预算路径)。
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
  sessionWsOpened(ws.data.sessionId); // 活跃计数 +1:有连接的会话不被内存淘汰
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
        // userMessage(可选):控制面对拒绝原因的可见说明,透传给 runTools 替换固定文案。
        resolve(frame.allowed === true, typeof frame.userMessage === "string" ? frame.userMessage : undefined);
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
        ws.data.maxInput =
          typeof frame.maxInput === "number" && frame.maxInput > 0 ? frame.maxInput : null;
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
      // 切到更小窗口即压一次(不等下条消息):当前 history 超过新窗口 75% 时立即收敛 + 即时刷水位。
      // 借 inFlight 当锁 —— 压缩期间并发 user_message 会被 busy 挡回,防并发改 meta.messages。
      // 无进行中回合、且会话已有内容时才做;maybeReduceContext 内部按阈值判定,不到阈值(切大窗/未满)即 no-op。
      if (!ws.data.inFlight) {
        ws.data.inFlight = true;
        try {
          const meta = await getOrCreateEphemeral(ws.data.sessionId);
          if (meta.messages.length > 0) await maybeReduceContext(ws, meta, { updateWater: true });
        } catch (e) {
          log.warn("switch-time compact failed", { session_id: ws.data.sessionId, err: String((e as Error)?.message ?? e) });
        } finally {
          ws.data.inFlight = false;
        }
      }
      return;
    }
    case "seed_history": {
      // 2026-07 线上审计 §2.3「重连上下文竞态」:水合门 —— **同步**登记在途(必须在本帧处理的
      // 任何 await 之前),让紧随其后到达的首条 user_message 等历史真正写回 meta 再进轮。
      // finally 保证抛错/提前 return 也放行,绝不把会话卡死(见 sessions.ts 水合门注释)。
      beginHydration(ws.data.sessionId);
      try {
        await handleSeedHistory(ws, frame);
      } finally {
        endHydration(ws.data.sessionId);
      }
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
          // 带 error 标记回后端:否则后端只见空 text→静默 no-op、零告警,记忆静默冻结无人知(审计 P2-6)。
          safeSend(ws, { type: "memory_update", text: "", error: true });
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

// handleSeedHistory —— seed_history 帧的处理体(从 onMessage 里提出来,让水合门能用 try/finally 包住)。
async function handleSeedHistory(ws: ServerWebSocket<WSData>, frame: Record<string, unknown>): Promise<void> {
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
  // 用户市场 skill:重连/重启后 backend 经 seed_history 带内联内容回填(与 CreateSession 同一物化路径)。
  // **本进程尚未物化过(meta 无 .skills)即无条件走一次物化(清后写)**:即便本次启用集为空(用户禁用了
  // 全部 skill → backend 不下发 skills 字段,frame.skills 缺省),也要清掉上个进程在可写层残留的旧 / 已停用
  // guides —— 否则残留副本占盘、极端下被 loader 扫到。非空则清后重写当前集,物化目录并入 addDirs 供 guides 菜单识别。
  if (!meta.addDirs.some((d) => d.endsWith(".skills"))) {
    const skills = Array.isArray(frame.skills)
      ? (frame.skills as { name: string; skillMd: string }[])
      : undefined;
    const skillsDir = await materializeSessionSkills(meta.workDir, skills);
    if (skillsDir && !meta.addDirs.includes(skillsDir)) meta.addDirs.push(skillsDir);
  }
  // 2026-07 审查([3]/[5]):denylist 原带「仅 meta 为空时回填一次」守卫,prism 长寿命 project 会话
  // 重连后永远拿旧 denylist → 模型看得见已被禁的工具、承诺后被 backend 拒(18 轮白烧)。
  // seed_history 的 disallowedTools 由 hub 每次现算(buildCreateOptions,hub.go:672),本来就是最新值,
  // 故改为**控制面下发即权威、无条件覆盖**。字段缺省(旧 backend / 该 feature 无 denylist)时保留现值。
  if (Array.isArray(frame.disallowedTools) && frame.disallowedTools.length > 0) {
    meta.disallowedTools = (frame.disallowedTools as unknown[]).map(String);
  }
  // MCP 白名单:重连/重启后 backend 经 seed_history 回填(与 disallowedTools 同策略,仅在本进程 meta
  // 尚空时接受,不覆盖活会话)。缺省字段 → 保持不限制,行为不变。
  if (frame.honestyGuard === true && !meta.honestyGuard) {
    meta.honestyGuard = true; // seed_history 回填(存量会话 restart 后重灌)
  }
  if (frame.honestyChecks && typeof frame.honestyChecks === "object" && !meta.honestyChecks) {
    meta.honestyChecks = frame.honestyChecks as { citations?: boolean; delivery?: boolean; fullread?: boolean };
  }
  if (Array.isArray(frame.allowedMcpTools) && frame.allowedMcpTools.length > 0 && meta.allowedMcpTools.length === 0) {
    meta.allowedMcpTools = (frame.allowedMcpTools as unknown[]).map(String);
  }
  safeSend(ws, { type: "history_seeded", count: meta.messages.length });
}

// maybeReduceContext:近上限时分层降级会话上下文。两处调用:①handleUserMessage 每轮前;
// ②set_runtime_config 切到更小窗口时立即压一次(不等下条消息)。返回是否发生过压缩。
// updateWater=true(切模型即压场景,没有紧接的 LLM call 刷水位)→ 用压缩后估算近似 lastUsage,
// 让水位环立即反映新占用(下一轮真实值会校正)。
async function maybeReduceContext(
  ws: ServerWebSocket<WSData>,
  meta: Awaited<ReturnType<typeof getOrCreateEphemeral>>,
  opts?: { updateWater?: boolean },
): Promise<boolean> {
  const ctxWindow = ws.data.contextWindow ?? CONTEXT_WINDOW;
  // 压缩墙的**输入预算**:保证「输入 + 本轮实际输出 ≤ 上下文」不溢出(彻底修复小窗模型溢出)。
  //   ① 预留输出 = min(全局 MAX_TOKENS, 模型 maxOutput);② 输入预算 = 上下文 − 预留输出;
  //   ③ 若显式配了 maxInput,取更小者(尊重厂商最大输入,但不超过「上下文 − 输出预留」这条硬底线)。
  // 之前用整个 ctxWindow 当墙、只靠 75% 的 25% 余量留输出 —— context<256K 时 25%<64K 会撑爆(靠反应式兜)。
  const reservedOutput = effectiveOutputCap(ws.data.maxOutput);
  let inputBudget = ctxWindow > 0 ? Math.max(1024, ctxWindow - reservedOutput) : ctxWindow;
  if (ws.data.maxInput && ws.data.maxInput > 0) {
    inputBudget = Math.min(inputBudget, ws.data.maxInput);
  }
  const lastCtx = meta.lastUsage ? meta.lastUsage.input_tokens + meta.lastUsage.output_tokens : 0;
  const estCtx = Math.max(lastCtx, estimateTokens(meta.messages));
  if (!(inputBudget > 0 && WINDOW_KEEP_TURNS > 0 && WINDOW_TRIGGER_PCT > 0 && estCtx > (inputBudget * WINDOW_TRIGGER_PCT) / 100)) {
    return false;
  }
  const beforeTok = estimateTokens(meta.messages);
  let compacted = false;
  try {
    const r = await reduceForWindow(meta.messages, inputBudget, {
      keepTurns: WINDOW_KEEP_TURNS,
      targetPct: WINDOW_TRIGGER_PCT,
      cache: meta.compactCache,
      currentTokens: estCtx, // 统一口径:用触发时的真实占用做内层入口闸,杜绝「触发了却空转返回」
    });
    if (r.actions.length > 0) {
      meta.messages = r.messages;
      meta.compactCache = r.cache;
      compacted = true;
      log.info("context reduced", {
        session_id: meta.sessionId, ctx_window: ctxWindow,
        before_tok: beforeTok, after_tok: estimateTokens(meta.messages), actions: r.actions.join(","),
      });
      if (r.usage) {
        safeSend(ws, { type: "token_usage", usage: r.usage, kind: "context_compact" });
      }
      if (r.actions.some((a) => a.startsWith("compact"))) {
        safeSend(ws, {
          type: "system_notification",
          kind: "context_compacted",
          level: "info",
          message: "为适配当前模型的上下文窗口,已将较早的对话压缩为摘要 —— 精确细节可能有损,需要完整上下文可开新对话。",
        });
      }
    } else {
      log.warn("context reduce no-op (triggered but nothing cut)", {
        session_id: meta.sessionId, ctx_window: ctxWindow, input_budget: inputBudget,
        est_ctx: estCtx, est_msgs: estimateTokens(meta.messages), target: Math.floor((inputBudget * WINDOW_TRIGGER_PCT) / 100),
      });
    }
  } catch (e) {
    meta.messages = windowMessages(meta.messages, WINDOW_KEEP_TURNS);
    compacted = true;
    log.warn("context reduce threw, hard-truncated", {
      session_id: meta.sessionId, err: String((e as Error)?.message ?? e),
    });
  }
  if (compacted && opts?.updateWater) {
    meta.lastUsage = {
      input_tokens: estimateTokens(meta.messages),
      output_tokens: 0,
      model: ws.data.modelOverride ?? meta.lastUsage?.model ?? "",
    };
  }
  return compacted;
}

async function handleUserMessage(ws: ServerWebSocket<WSData>, frame: Record<string, unknown>): Promise<void> {
  if (ws.data.inFlight) {
    safeSend(ws, { type: "error", code: "busy", message: "a turn is already in flight", retryable: false });
    return;
  }
  const content = String(frame.content ?? "");
  if (!content) return;

  // 2026-07 线上审计 §2.3「重连上下文竞态」:重连后 backend 先写 seed_history 再转发本帧,但两者
  // 在 executor 侧是并发的 async 链 —— 不等历史真正写回 meta 就进轮,模型会带空上下文明面失忆。
  // 这里等在途水合落地(无在途 seed 时零等待);超时**拒绝本轮**并给用户明确可重发的提示,
  // 绝不静默失忆继续答。放在 inFlight 置位之前,拒绝时无状态需要回滚。
  if (!(await awaitHydration(ws.data.sessionId, SEED_WAIT_MS))) {
    safeSend(ws, {
      type: "error",
      code: "context_not_ready",
      message: "会话上下文正在恢复中,这条消息尚未发出,请稍后重新发送。",
      retryable: true,
    });
    return;
  }

  markSessionActive(ws.data.sessionId); // 刷新活动时刻:长连接内持续对话不被误淘汰
  const meta = await getOrCreateEphemeral(ws.data.sessionId);
  // 2026-07 审查([3]/[5]):此处曾按 user_message 帧上的 disallowedTools 覆盖 denylist —— 死代码。
  // backend 的 handleUserMessage 第一件事就是 stripInjectionSurface(hub.go:1497 / ws.go:604),
  // 把 addDirs/disallowedTools/appendSystemPrompt/skills 顶层键整个删掉再转发(浏览器注入防线),
  // 且全仓没有任何地方在 user_message 上重新盖章 → 该字段在真实链路上恒不存在。
  // denylist 的**唯一权威通道是 seed_history**(hub 每次建连现算下发,上面已改为无条件覆盖)。
  // 若将来 backend 要在每轮盖章,必须盖在 stripInjectionSurface 之后,并在此重新加消费点。
  // P2 图片通道:attachments 里的 image 从会话 cwd 读出并 base64 内嵌为 Anthropic image 块
  // (与 @"path" 文本标记并存:标记服务历史回放 chips 与文件语义,图块给模型「看见」)。
  // 无图 / 读取失败 → 纯文本(与旧行为一致)。是否真发给上游由 turnLoop 按 vision 能力过滤。
  const userContent = await buildUserContentWithImages(meta.workDir, content, frame.attachments);
  const isFirstTurn = !meta.title && meta.messages.length === 0; // 首轮 → 之后生成标题

  // 进程级并发准入(性能审计 P0):inFlight 只挡「同一连接」的并发,这里挡「跨连接」的并发 turn 总数,
  // 防 N 个不同会话各跑一轮 runTurn 打爆 1.5G 容器。满则即刻回 busy(可重试)不排队。放在 inFlight=true
  // 之前,拒绝时无需回滚状态;下方 finally 释放,覆盖 reduceForWindow(自带 catch)+ runTurn 全程。
  const releaseSlot = tryAcquireTurn();
  if (!releaseSlot) {
    safeSend(ws, { type: "error", code: "busy", message: "服务繁忙,请稍候重试。", retryable: true });
    return;
  }
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
        // 水位口径(≠计费):lastUsage 记「本轮**最后一次** LLM call 的真实上下文占用」,而非 sumUsage 的
        // 跨 call 求和(turnUsage)—— 一轮 N 次工具循环里每次 prompt 都含全部历史,求和 = 把同一段上下文重复
        // 计 N 次,水位随之虚高到 100%。且必须计入 cache_read/cache_creation:命中前缀缓存的历史仍占满上下文
        // 窗口(只是计价便宜),OpenAI 出口的 input_tokens 已被上游扣掉 cached,不补回来水位会反向塌成 0%。
        // turnUsage 仍走 cumUsage/session_total 做计费,两路口径彻底分家。
        const callsArr = ((f as Record<string, unknown>).calls ?? []) as Array<Record<string, unknown>>;
        const lastCall = callsArr.length > 0 ? callsArr[callsArr.length - 1]! : (u as Record<string, unknown>);
        meta.lastUsage = {
          input_tokens:
            Number(lastCall.input_tokens ?? 0) +
            Number(lastCall.cache_read_tokens ?? 0) +
            Number(lastCall.cache_creation_tokens ?? 0),
          output_tokens: Number(lastCall.output_tokens ?? 0),
          model: String(lastCall.model ?? turnUsage.model),
        };
      }
      safeSend(ws, f);
    },
    error(message, code) {
      safeSend(ws, { type: "error", message, code });
    },
    requestPermission(req) {
      // 2026-07 审查([16]/[21]):回执的 userMessage 一并透传给 runTools —— 控制面对「幻想的工具名」
      // 给的自愈提示此前在这里被丢掉,模型只收到与真越权同文的 permission denied。
      return new Promise<PermissionDecision>((resolve) => {
        const timer = setTimeout(() => {
          if (ws.data.pending.delete(req.requestId)) resolve({ allowed: false }); // 超时默认拒(安全侧)
        }, PERMISSION_TIMEOUT_MS);
        ws.data.pending.set(req.requestId, (allowed, userMessage) => {
          clearTimeout(timer);
          resolve({ allowed, userMessage });
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

  // 近上限时分层降级上下文(每轮前),避免只增不减撞上游 context 墙。详见 maybeReduceContext:
  // ① 裁老 tool_result ② 滚动摘要 ③ 硬裁;触发信号 max(上一轮真实占用, 当前估算),按会话模型窗口定界。
  const ctxWindow = ws.data.contextWindow ?? CONTEXT_WINDOW; // 供下方 TurnInput.contextWindow(反应式压缩用)
  await maybeReduceContext(ws, meta);

  // 本轮开始前的 history 长度(**必须在压缩之后取** —— maybeReduceContext 会整体替换 meta.messages)。
  // = turnLoop 里的 historyLen 语义:含本轮那条 user 消息,slice(historyBase) 即本轮新增。
  const historyBase = meta.messages.length - 1;

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
    allowedMcpTools: meta.allowedMcpTools,
    honestyGuard: meta.honestyGuard,
    honestyChecks: meta.honestyChecks,
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
    // 2026-07-31 线上审计:一轮以 error 终帧收场、且**什么都没往 history 里加**(只剩本轮这条 user
    // 消息)→ 把它摘掉,让会话 history 回到「本轮从未发生过」。否则这条悬挂的 user 消息会与下一次
    // 重发拼成 user-after-user 非法序列(用户手点重试的场景线上已在发生:一位用户 9 连败),
    // 且它还带着 runTurn 盖上的语言指令 / 预算披露尾巴,会被当成用户原话再喂一遍模型。
    // 用户主动 stop(abort)不摘:那轮是用户自己收的,问题留在 history 里符合他的预期。
    if (!turnCompleted && !abort.signal.aborted && meta.messages.length === historyBase + 1) {
      meta.messages.length = historyBase;
    }
  } catch (e) {
    // 兜底:runTurn 内部已接住上游/流式失败(带日志+error 帧),走到这说明是意外异常 —— 必须留痕。
    log.error("runTurn threw (unexpected)", { err: String((e as Error)?.message ?? e), session_id: meta.sessionId });
    safeSend(ws, { type: "error", message: "服务开小差了,请稍后重试。", code: "internal" });
  } finally {
    ws.data.inFlight = false;
    ws.data.abort = null;
    for (const [, resolve] of ws.data.pending) resolve(false);
    ws.data.pending.clear();
    releaseSlot(); // 释放进程级并发槽(幂等)
  }

  // 首轮生成标题 —— **必落一个非空标题**,杜绝前端永久「生成标题中…」(根因:旧逻辑单次机会 + 4 条静默
  // 失败出口 + 无兜底)。setTitle 写 agent jsonl(即便 WS 已关/帧丢,ListSessions 的 agentByID 回填也能自愈)。
  if (isFirstTurn && !meta.title) {
    if (turnCompleted && assistantText) {
      // 正常路径:有正文 → 异步用 LLM 起标题(generateTitle 内部失败即回落首条消息截断,永不返回空)。
      generateTitle(content, assistantText)
        .then(({ title, usage }) => {
          if (usage) safeSend(ws, { type: "token_usage", usage, kind: "title_gen" }); // C1 计费
          setTitle(meta.sessionId, title);
          safeSend(ws, { type: "session_title_updated", sessionId: meta.sessionId, title, aiGenerated: true });
        })
        .catch((e) => log.warn("title-gen failed", { err: String((e as Error)?.message ?? e) }));
    } else {
      // 首轮上游报错 / 被 abort / 纯工具轮无正文(turnCompleted 或 assistantText 缺)→ 不调 LLM,
      // **同步**用首条消息截断兜底,立刻 setTitle(jsonl)+ 发帧 → 该会话立即有可读标题、绝不卡 spinner。
      const title = fallbackTitle(content);
      setTitle(meta.sessionId, title);
      safeSend(ws, { type: "session_title_updated", sessionId: meta.sessionId, title, aiGenerated: false });
    }
  }
}

export function onClose(ws: ServerWebSocket<WSData>): void {
  ws.data.abort?.abort();
  for (const [, resolve] of ws.data.pending) resolve(false);
  ws.data.pending.clear();
  sessionWsClosed(ws.data.sessionId); // 活跃计数 -1:归零后该会话满足空闲条件即可被内存淘汰
  log.info("ws close", { session_id: ws.data.sessionId });
}
