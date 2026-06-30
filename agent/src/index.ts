// Scholay clean-room agent executor —— 进程入口(详细设计 §2.1)。
// 起 HTTP + WS server :3456,讲 agent.Client 契约(§5.2)+ WS frame 协议(§5.3)。
// 后端拥有 state(事件溯源 journal);执行器按轮无状态。零 cc-haha / Claude Code CLI 血统。

import { handleHTTP } from "./server/http.ts";
import { onOpen, onMessage, onClose, type WSData } from "./server/ws.ts";
import { authOK, tokenConfigured } from "./auth.ts";
import { validSessionId } from "./sandbox/confine.ts";
import { prewarm } from "./mcp/minicodClient.ts";
import { log } from "./obs/log.ts";

const PORT = Number(process.env.PORT || 3456);

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
        data: { sessionId, inFlight: false, abort: null, pending: new Map(), tier: "main", modelOverride: null } as WSData,
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

log.info("agent started (clean-room executor · provider-agnostic · WS+HTTP)", {
  port: server.port,
  auth: tokenConfigured() ? "bearer" : "open(dev)",
  sandbox_mode: process.env.SANDBOX_MODE ?? "none",
});

// C4:none 模式下 Bash 未进 bwrap 隔离(进程/网络)。凭据泄漏已由 bash env 白名单挡住、路径逃逸已由
// realpath confine 挡住,但生产仍应设 EXECUTOR_SANDBOX_MODE=bwrap 拿进程/网络隔离。本机 LinuxKit 无 bwrap → none。
if ((process.env.SANDBOX_MODE ?? "none") === "none") {
  log.warn("SANDBOX_MODE=none:Bash 未进 bwrap 隔离。生产请设 EXECUTOR_SANDBOX_MODE=bwrap(本机无 bwrap 可忽略)。");
}
if (process.env.NODE_ENV === "production" && !tokenConfigured()) {
  log.error("FATAL: NODE_ENV=production 但未配 EXECUTOR_AUTH_TOKEN/AGENT_INTERNAL_TOKEN — 鉴权 fail-closed,所有请求将被拒。请配置 token。");
}
