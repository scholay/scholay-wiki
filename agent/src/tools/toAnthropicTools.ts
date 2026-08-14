// 构建本轮发给模型的 tools[](registry + MCP),按 per-turn denylist + 结构规则过滤(详细设计 §2.3/§2.6)。
// smart_search=MCP-only(built-ins 全在 denylist);claw=+Bash;prism=file-edit。
//
// 2026-08-14 渐进披露:MCP 工具再按 RESIDENT_CORE 分成「常驻广告面」与「延迟披露」两半
// (见 mcp/deferred.ts)。延迟的那半**权限不变**(toolPermitted 仍放行),只是不进 tools[] ——
// 模型经 ToolSearch 拿到定义、经 ToolInvoke 调用。tools[] 因此在一轮内恒定不变,不打断前缀缓存。

import { mcpAnthropicTools } from "../mcp/mcpTools.ts";
import { deferralEnabled, isResidentMcpTool } from "../mcp/deferred.ts";
import { builtinRegistry } from "./registry.ts";
import { toolPermitted } from "../policy/featurePolicy.ts";
import type { AnthropicTool, TurnInput } from "../turn/types.ts";

/** 本轮**权限允许**的 MCP 工具全集(常驻 + 延迟)。ToolSearch/ToolInvoke 的可见域即此。 */
export async function permittedMcpTools(input: TurnInput): Promise<AnthropicTool[]> {
  const mcp = await mcpAnthropicTools();
  return mcp.filter((t) => toolPermitted(t.name, input));
}

/** 本轮**延迟披露**的 MCP 工具(允许但不进 tools[])。渐进披露关闭时恒为空。 */
export async function deferredMcpTools(input: TurnInput): Promise<AnthropicTool[]> {
  if (!deferralEnabled()) return [];
  return (await permittedMcpTools(input)).filter((t) => !isResidentMcpTool(t.name));
}

export async function buildTools(input: TurnInput): Promise<AnthropicTool[]> {
  const out: AnthropicTool[] = [];

  // MCP 工具(Minicod):只广告常驻核心;其余延迟披露(权限不变)。
  for (const t of await permittedMcpTools(input)) {
    if (!deferralEnabled() || isResidentMcpTool(t.name)) out.push(t);
  }

  // built-in 工具
  for (const [name, t] of builtinRegistry) {
    if (toolPermitted(name, input)) {
      out.push({ name: t.name, description: t.description, input_schema: t.input_schema });
    }
  }

  return out;
}
