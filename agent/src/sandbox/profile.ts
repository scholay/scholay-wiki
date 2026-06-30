// 每会话 sandbox profile(详细设计 §2.6)。控制面决定 net/allowBash;执行器据此构造 jail。
// smartsearch={net:open(仅 MCP 经 egress),allowBash:false};claw={allowBash:true};
// prism={net:none}(compile profile,泛化 prism_tex 的 network_mode:none)。

export type SandboxNet = "open" | "none";

export interface SandboxProfile {
  cwd: string; // 唯一可写目录
  net: SandboxNet; // open=经 egress 出网;none=完全断网(prism compile)
  allowBash: boolean;
  roBinds: string[]; // 只读挂载(skill / add-dir 目录)
}

export function profileFor(
  ctx: { workDir: string; net: SandboxNet; allowBash: boolean },
  roBinds: string[] = [],
): SandboxProfile {
  return { cwd: ctx.workDir, net: ctx.net, allowBash: ctx.allowBash, roBinds };
}
