// Scholay clean-room agent executor —— 进程入口(详细设计 §2.1)。
// 起 HTTP + WS server :3456,讲 agent.Client 契约(§5.2)+ WS frame 协议(§5.3)。
// 后端拥有 state(事件溯源 journal);执行器按轮无状态。零 cc-haha / Claude Code CLI 血统。

import { handleHTTP } from "./server/http.ts";
import { onOpen, onMessage, onClose, type WSData } from "./server/ws.ts";
import { startSessionSweeper } from "./server/sessions.ts";
import { authOK, tokenConfigured } from "./auth.ts";
import { sandboxMode, smokeTestEvidenceReadonly, smokeTestSciDrawDeps, smokeTestExport } from "./sandbox/bwrap.ts";
import { validSessionId } from "./sandbox/confine.ts";
import { prewarm } from "./mcp/minicodClient.ts";
import { unsandboxedBashGate } from "./sandbox/profile.ts";
import { probeStatsEngines } from "./tools/statsEngines.ts";
import { log } from "./obs/log.ts";

const PORT = Number(process.env.PORT || 3456);

// P0.3 生产硬锁(skill 市场前置):EXECUTOR_ALLOW_UNSANDBOXED_BASH=1 是「内核开不了 userns 时显式放行裸 Bash」
// 的逃生舱。在生产它是灾难性坍缩模式的开关——一旦被误设(工期压力/复制粘贴),多租户下任意用户即可拿共享
// 容器 shell:跨会话读他人上传文件、经 /proc 偷 MINICOD_API_KEY/EXECUTOR_AUTH_TOKEN。skill 市场把 SKILL.md
// 变成不可信输入后风险更大。故生产**拒绝以该 override 启动**(退回 secure-by-default:Bash 关闭)。
// 非生产(本机单租户)不受影响,裸 Bash 仍可放行。
if (process.env.NODE_ENV === "production" && process.env.EXECUTOR_ALLOW_UNSANDBOXED_BASH === "1") {
  log.error(
    "FATAL(prod hard-lock): 生产环境禁止设 EXECUTOR_ALLOW_UNSANDBOXED_BASH=1 —— 该 override 会让未沙箱化的 Bash " +
      "在多租户下跨租户读文件/偷密钥,是坍缩模式的总开关。沙箱已无开关、启动自探即强制启用 —— 若自探失败,请修容器的 " +
      "seccomp(挂 docker/seccomp/agent-bwrap.json)而不是放行裸 Bash。拒绝启动。",
  );
  process.exit(1);
}

const server = Bun.serve<WSData>({
  port: PORT,
  idleTimeout: 255, // 秒(Bun 上限);流式长连由 ping/pong + Go hub 维持
  async fetch(req, srv) {
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/ws\/(.+)$/);
    if (m) {
      // Go hub 用 Authorization: Bearer header 拨;浏览器经 Go pipe,不直连。
      if (!authOK(req)) return new Response("unauthorized", { status: 401 });
      const sessionId = decodeURIComponent(m[1]);
      if (!validSessionId(sessionId)) return new Response("bad session id", { status: 400 }); // H4:挡 ..%2f 穿越
      const upgraded = srv.upgrade(req, {
        data: { sessionId, inFlight: false, abort: null, pending: new Map(), tier: "main", modelOverride: null, providerOverride: null, contextWindow: null, maxInput: null, maxOutput: null, vision: false } as WSData,
      });
      if (upgraded) return undefined;
      return new Response("ws upgrade failed", { status: 400 });
    }
    try {
      return await handleHTTP(req);
    } catch (e) {
      log.error("unhandled http error", { err: String((e as Error)?.message ?? e) });
      return new Response(JSON.stringify({ error: "internal", message: "internal error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  },
  websocket: {
    open: onOpen,
    message: onMessage,
    close: onClose,
  },
});

// 预热 Minicod MCP(避开首轮 cold-start 连接超时)
prewarm().catch(() => {});

// 会话内存淘汰周期扫描(性能审计 P0):驱逐空闲且无活跃 WS 的内存 meta,防进程内存只涨不跌。
startSessionSweeper();

log.info("agent started (clean-room executor · provider-agnostic · WS+HTTP)", {
  port: server.port,
  auth: tokenConfigured() ? "bearer" : "open(dev)",
  sandbox_mode: sandboxMode(), // 自探结果(无开关)
});

// C4/secure-by-default:none 模式下 Bash 未进 bwrap 隔离(进程/网络)。生产 + 无沙箱 + 未显式放行时,
// Bash 已被 unsandboxedBashGate 关闭(见 registry.bashTool);此处把该状态大声打出来,避免像旧的单条
// warn 那样被忽略(评审:旧 warn 被无视导致裸 Bash 一直带病上生产)。
{
  const gate = unsandboxedBashGate();
  if (!gate.ok) {
    log.error("FATAL(secure-by-default):" + gate.reason + " —— Bash 工具将拒绝执行,claw 的文件转换能力不可用,直至启用 bwrap 或显式放行。");
  } else if (sandboxMode() === "none") {
    log.warn(`bwrap 自探失败:Bash 未进隔离(放行原因:${gate.reason})。请确认容器挂了 docker/seccomp/agent-bwrap.json。`);
  }
}
if (process.env.NODE_ENV === "production" && !tokenConfigured()) {
  log.error("FATAL: NODE_ENV=production 但未配 EXECUTOR_AUTH_TOKEN/AGENT_INTERNAL_TOKEN — 鉴权 fail-closed,所有请求将被拒。请配置 token。");
}

// 科研绘图 B/C 车道(matplotlib/rdkit)在真实 jail 内的渲染自检 —— 非阻塞、fire-and-forget。
// 结果打进启动日志(`docker logs scholar_agent | grep 科研绘图`);失败=某运行库没 bind 进 jail。
// 证据保留区闸的**真 jail 实测**:argv 断言只证明参数在场,不证明内核真的拦住
// (--ro-bind 覆盖 --bind 子路径依赖 bwrap 版本与参数顺序)。失败会打 error 级日志。
smokeTestEvidenceReadonly().catch(() => {});
smokeTestSciDrawDeps().catch(() => {});
// ExportDocument 链路(pandoc docx/pdf)同款 jail 内自检(`docker logs scholar_agent | grep 导出自检`)。
smokeTestExport().catch(() => {});
// 统计引擎(statsmodels / sklearn / lifelines …)可用性探测(2026-08 证据账本 P0-a 运行时诚实化)。
// 结果落进 statsEngines.engineSupported(P1 方法候选表的真值来源);缺库会在启动日志里 error
// 大声报出(`docker logs scholar_agent | grep 统计引擎`)—— SKILL.md 承诺了而镜像没有 = 模型只能编数。
probeStatsEngines().catch(() => {});
