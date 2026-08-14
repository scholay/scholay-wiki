// Minicod MCP stdio 客户端 —— singleton,boot 预热(详细设计 §2.5)。
//
// Minicod 是**唯一** MCP。spawn @minicod/mcp-server(stdio),复用 fork 的 preinstalled-mcp.json
// 的 command/args/env。进程共享、启动预热,避开 cold-start 连接超时。tool *可见性* 由 per-turn
// allow-list 控(toAnthropicTools),不在这一层。

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { log } from "../obs/log.ts";
import { sanitizeMinicodResult } from "./sanitizeMinicod.ts";

export interface McpToolDef {
  name: string; // 原始 MCP 工具名(不带 mcp__minicod__ 前缀)
  description?: string;
  inputSchema: Record<string, unknown>;
}

const MINICOD_SERVER_JS =
  process.env.MINICOD_MCP_ENTRY || "/app/node_modules/@minicod/mcp-server/dist/index.js";

let client: Client | null = null;
let transport: StdioClientTransport | null = null;
let toolsCache: McpToolDef[] | null = null;
let connecting: Promise<void> | null = null;

// 单次 MCP callTool 超时(默认 30s)。stdio 子进程 hang 时,若不设 deadline,runOne 会永久 await →
// turn 终帧永不发出 → hub inFlight 永不释放 → 会话对用户彻底 busy 死锁。metadata 检索本该秒级返回,
// 60s 太久(评审 #6)→ 收到 30s;仍可经 env 调。
const CALL_TIMEOUT_MS = Number(process.env.MINICOD_MCP_CALL_TIMEOUT_MS || 30_000);

// 轻量熔断(评审 #6):minicod 上游/子进程连续**传输级**失败(超时/崩溃)到阈值后,短时间内
// 直接快速失败,不再逐次干等 timeout。避免上游挂掉时一个 turn 里多轮 × 30s 把会话 busy 锁死,
// 且提示词允许最多 3 次重试会放大这个问题。成功一次立即复位。工具级 is_error(如"无结果")
// 不算传输失败,不触发熔断。backend 的 MinicodBreaker 只管 internal/minicod,管不到这条执行器路径。
const CIRCUIT_FAIL_THRESHOLD = Number(process.env.MINICOD_MCP_CIRCUIT_THRESHOLD || 3);
const CIRCUIT_OPEN_MS = Number(process.env.MINICOD_MCP_CIRCUIT_OPEN_MS || 30_000);
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

// 断开并清空 client:任何 callTool 异常(含超时)后调,使下次 ensureConnected 重建连接。
// 否则子进程死掉后 client 引用仍在,此执行器上所有后续检索永久失败,直到重启容器。
function resetClient(): void {
  const t = transport;
  client = null;
  transport = null;
  if (t) {
    try {
      void t.close();
    } catch {
      /* noop */
    }
  }
}

async function ensureConnected(): Promise<void> {
  if (client) return;
  if (connecting) return connecting;
  connecting = (async () => {
    const tp = new StdioClientTransport({
      command: process.env.MINICOD_MCP_COMMAND || "bun",
      args: [MINICOD_SERVER_JS],
      env: {
        ...getDefaultEnvironment(),
        MINICOD_API_KEY: process.env.MINICOD_API_KEY || "",
        MINICOD_API_BASE_URL: process.env.MINICOD_API_BASE_URL || "https://www.minicod.com/v1",
        // MCP 子进程经 egress-net(NAT)直连 minicod.com(egress-proxy 已删)。默认无 HTTPS_PROXY,
        // 下面透传是为「将来若配代理收口出网」留的口子;Bun fetch 原生认这几个 env。
        HTTPS_PROXY: process.env.HTTPS_PROXY || "",
        HTTP_PROXY: process.env.HTTP_PROXY || "",
        NO_PROXY: process.env.NO_PROXY || "",
      },
    });
    const c = new Client({ name: "scholay-agent-executor", version: "0.1.0" }, { capabilities: {} });
    await c.connect(tp);
    client = c;
    transport = tp;
    log.info("minicod mcp connected", { entry: MINICOD_SERVER_JS });
  })();
  try {
    await connecting;
  } finally {
    connecting = null;
  }
}

// prewarm 在 boot 时调,提前建连 + 拉 tool 列表(忽略失败,turn 时会重试)。
export async function prewarm(): Promise<void> {
  try {
    await listTools();
  } catch (e) {
    log.warn("minicod mcp prewarm failed (will retry on turn)", { err: String((e as Error)?.message ?? e) });
  }
}

export async function listTools(): Promise<McpToolDef[]> {
  if (toolsCache) return toolsCache;
  await ensureConnected();
  const res = await client!.listTools();
  toolsCache = (res.tools || []).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: (t.inputSchema as Record<string, unknown>) || { type: "object" },
  }));
  log.info("minicod mcp tools listed", { count: toolsCache.length, names: toolsCache.map((t) => t.name) });
  return toolsCache;
}

// callTool 透传到 MCP,返回 Anthropic tool_result 形状的 content。
// ── inflight 闸(2026-08-01 Phase 0)───────────────────────────────────────────
// 🔴 今天就存在的**共享命运单点**:本模块是**模块级单例 stdio 客户端** + **模块级全局熔断**
//    (consecutiveFailures >= 阈值 → 全站所有租户的检索一起快速失败 30s),
//    而 runTools.ts:37 是**无上限**的 Promise.all 批 —— 一个用户一轮吐 12 个检索工具,
//    就能把单例打到超时,连坐所有人。Run 引擎会把检索集中到少数 Step,压强只会更高。
//
// 设计要点(两条都不能少):
//  ① **排队,不拒绝**。拒绝会变成模型眼里的"检索失败"→ 它要么重试(更挤)要么编(正是要治的病)。
//  ② **计时器在拿到名额之后才起**。否则排队时间算进 CALL_TIMEOUT_MS → 超时 → 熔断 →
//     这道本来用来保护上游的闸,自己制造了它要防止的那场故障。
//     排队等待与传输失败因此在熔断计数上**天然分开**:排队根本不进 try 块。
const MAX_INFLIGHT = Math.max(1, Number(process.env.MINICOD_MCP_MAX_INFLIGHT || 4));
let inflight = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (inflight < MAX_INFLIGHT) {
    inflight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) next(); // 名额直接转交下一个等待者(不减 inflight,避免中间态被抢)
  else inflight--;
}

/** 观测用:当前占用与排队长度(进 slog,便于判断闸是不是设小了)。 */
export function mcpInflightSnapshot(): { inflight: number; queued: number; max: number } {
  return { inflight, queued: waiters.length, max: MAX_INFLIGHT };
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: unknown; isError: boolean }> {
  // 熔断开启期间:直接快速失败(不建连、不等 timeout),回稳定的 is_error 让模型停止重试、
  // 转而向用户友好收尾(见系统提示错误恢复契约),而不是逐轮干等 30s 把会话锁死。
  if (Date.now() < circuitOpenUntil) {
    return {
      content: [{ type: "text", text: "检索服务暂时不可用(上游连续失败),请稍后再试。" }],
      isError: true,
    };
  }
  // 排队拿名额 —— 在 try 之外,故排队本身**绝不计入熔断失败**(见上面 ② )。
  const waitStart = Date.now();
  await acquireSlot();
  const waited = Date.now() - waitStart;
  if (waited > 1000) {
    log.info("minicod mcp inflight queued", { waited_ms: waited, ...mcpInflightSnapshot(), tool: name });
  }
  try {
    await ensureConnected();
  } catch (e) {
    releaseSlot();
    throw e;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const call = client!.callTool({ name, arguments: args }) as Promise<{
      content?: unknown;
      isError?: boolean;
    }>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`minicod mcp call timed out after ${CALL_TIMEOUT_MS}ms: ${name}`)),
        CALL_TIMEOUT_MS,
      );
    });
    const res = await Promise.race([call, timeout]);
    consecutiveFailures = 0; // 传输成功 → 复位熔断(工具级 is_error 不影响传输健康)
    circuitOpenUntil = 0;
    if (res.isError === true) return { content: res.content ?? [], isError: true };
    // 成功结果统一过清洗(spam 剔除/字段上限/低相关标注/中文覆盖披露,见 sanitizeMinicod.ts)。
    return { content: sanitizeMinicodResult(name, args, res.content ?? []), isError: false };
  } catch (e) {
    // 超时或子进程异常(传输级失败)→ 记一次失败;到阈值就开熔断一段时间。
    consecutiveFailures++;
    if (consecutiveFailures >= CIRCUIT_FAIL_THRESHOLD) {
      circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
      log.warn("minicod mcp circuit opened (fast-fail)", {
        consecutive_failures: consecutiveFailures,
        open_ms: CIRCUIT_OPEN_MS,
      });
    }
    // 置空 client,下次 ensureConnected 重建;错误上抛由 runOne 回填 is_error。
    resetClient();
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    releaseSlot();
  }
}
