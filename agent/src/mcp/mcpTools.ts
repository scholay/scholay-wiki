// MCP tools → Anthropic tool def(详细设计 §2.5)。
//
// 命名保留 mcp__minicod__<tool> —— 前端已按它渲卡片(claw-paper-cards / 智能搜索),零前端改动。
// tool_use name 以 mcp__minicod__ 开头 → 路由 callTool;其余 → built-in。

import { listTools as listMcpTools, callTool as callMcp } from "./minicodClient.ts";
import type { AnthropicTool } from "../turn/types.ts";

export const MCP_PREFIX = "mcp__minicod__";

export function isMcpTool(name: string): boolean {
  return name.startsWith(MCP_PREFIX);
}

export async function mcpAnthropicTools(): Promise<AnthropicTool[]> {
  const tools = await listMcpTools();
  return tools.map((t) => ({
    name: MCP_PREFIX + t.name,
    description: t.description,
    // 确保 type:"object" 在场(Anthropic Tool.input_schema 要求);MCP schema 一般已含,合并兜底。
    input_schema: { type: "object" as const, ...(t.inputSchema as Record<string, unknown>) },
  }));
}

// 调用一个 mcp__minicod__* 工具。
export async function callMcpTool(
  prefixedName: string,
  input: Record<string, unknown>,
): Promise<{ content: unknown; isError: boolean }> {
  const raw = prefixedName.slice(MCP_PREFIX.length);
  return callMcp(raw, input);
}
