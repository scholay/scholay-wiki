// per-turn 工具策略 —— 执行器的第二道墙(详细设计 §2.4)。
//
// 控制面(Go decidePermission / permissionAllowed)是**权威**;此处镜像它,确保执行器绝不跑
// Go 会拒的东西、且绝不拓宽 denylist。结构性规则:Bash 需 allowBash;MCP 永远候选(除非显式 deny);
// 文件工具的路径限 cwd 在 registry.confine() 内强制。

import { isMcpTool, MCP_PREFIX } from "../mcp/mcpTools.ts";
import type { TurnInput } from "../turn/types.ts";

export function toolPermitted(name: string, input: TurnInput): boolean {
  // denylist 命中 → 拒
  if (input.disallowedTools.includes(name)) return false;
  // Bash 仅在 allowBash(claw)
  if (name === "Bash" && !input.allowBash) return false;
  // MCP 工具:正向白名单(收敛 minicod 0.4.1 的 76 工具洪水,见 minicod 对齐审计 #2)。
  //   - allowedMcpTools 非空 → 只放行白名单内的 MCP 工具(按去前缀的原始工具名匹配);
  //   - allowedMcpTools 空/缺省 → 不限制(向后兼容:控制面没配就沿用「denylist 之外全放」)。
  // 单一真源:本函数同时被 toAnthropicTools(可见性)与 runTools(执行二道墙)调用,两处口径一致。
  if (isMcpTool(name)) {
    const allow = input.allowedMcpTools;
    if (allow && allow.length > 0) return allow.includes(name.slice(MCP_PREFIX.length));
    return true;
  }
  return true;
}
