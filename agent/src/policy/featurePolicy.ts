// per-turn 工具策略 —— 执行器的第二道墙(详细设计 §2.4)。
//
// 控制面(Go decidePermission / permissionAllowed)是**权威**;此处镜像它,确保执行器绝不跑
// Go 会拒的东西、且绝不拓宽 denylist。结构性规则:Bash 需 allowBash;MCP 永远候选(除非显式 deny);
// 文件工具的路径限 cwd 在 registry.confine() 内强制。

import { isMcpTool } from "../mcp/mcpTools.ts";
import type { TurnInput } from "../turn/types.ts";

export function toolPermitted(name: string, input: TurnInput): boolean {
  // denylist 命中 → 拒
  if (input.disallowedTools.includes(name)) return false;
  // Bash 仅在 allowBash(claw)
  if (name === "Bash" && !input.allowBash) return false;
  // MCP 工具:不在 denylist 即放(可见性由 toAnthropicTools 控)
  if (isMcpTool(name)) return true;
  return true;
}
