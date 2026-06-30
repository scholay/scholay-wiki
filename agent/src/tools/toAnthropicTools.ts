// 构建本轮发给模型的 tools[](registry + MCP),按 per-turn denylist + 结构规则过滤(详细设计 §2.3/§2.6)。
// smart_search=MCP-only(built-ins 全在 denylist);claw=+Bash;prism=file-edit。

import { mcpAnthropicTools } from "../mcp/mcpTools.ts";
import { builtinRegistry } from "./registry.ts";
import { toolPermitted } from "../policy/featurePolicy.ts";
import type { AnthropicTool, TurnInput } from "../turn/types.ts";

export async function buildTools(input: TurnInput): Promise<AnthropicTool[]> {
  const out: AnthropicTool[] = [];

  // MCP 工具(Minicod)
  const mcp = await mcpAnthropicTools();
  for (const t of mcp) {
    if (toolPermitted(t.name, input)) out.push(t);
  }

  // built-in 工具
  for (const [name, t] of builtinRegistry) {
    if (toolPermitted(name, input)) {
      out.push({ name: t.name, description: t.description, input_schema: t.input_schema });
    }
  }

  return out;
}
