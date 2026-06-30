// Minicod MCP stdio 客户端 —— singleton,boot 预热(详细设计 §2.5)。
//
// Minicod 是**唯一** MCP。spawn @minicod/mcp-server(stdio),复用 fork 的 preinstalled-mcp.json
// 的 command/args/env。进程共享、启动预热,避开 cold-start 连接超时。tool *可见性* 由 per-turn
// allow-list 控(toAnthropicTools),不在这一层。

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { log } from "../obs/log.ts";

export interface McpToolDef {
  name: string; // 原始 MCP 工具名(不带 mcp__minicod__ 前缀)
  description?: string;
  inputSchema: Record<string, unknown>;
}

const MINICOD_SERVER_JS =
  process.env.MINICOD_MCP_ENTRY || "/app/node_modules/@minicod/mcp-server/dist/index.js";

let client: Client | null = null;
let toolsCache: McpToolDef[] | null = null;
let connecting: Promise<void> | null = null;

async function ensureConnected(): Promise<void> {
  if (client) return;
  if (connecting) return connecting;
  connecting = (async () => {
    const transport = new StdioClientTransport({
      command: process.env.MINICOD_MCP_COMMAND || "bun",
      args: [MINICOD_SERVER_JS],
      env: {
        ...getDefaultEnvironment(),
        MINICOD_API_KEY: process.env.MINICOD_API_KEY || "",
        MINICOD_API_BASE_URL: process.env.MINICOD_API_BASE_URL || "https://www.minicod.com/v1",
        // scholar-agent-net 是 internal(无 NAT):MCP 子进程访问 minicod.com 必须经 egress-proxy。
        // Bun fetch 原生认这几个 env。
        HTTPS_PROXY: process.env.HTTPS_PROXY || "",
        HTTP_PROXY: process.env.HTTP_PROXY || "",
        NO_PROXY: process.env.NO_PROXY || "",
      },
    });
    const c = new Client({ name: "scholay-agent-executor", version: "0.1.0" }, { capabilities: {} });
    await c.connect(transport);
    client = c;
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
export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: unknown; isError: boolean }> {
  await ensureConnected();
  const res = (await client!.callTool({ name, arguments: args })) as {
    content?: unknown;
    isError?: boolean;
  };
  return { content: res.content ?? [], isError: res.isError === true };
}
