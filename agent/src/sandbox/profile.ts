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

// unsandboxedBashGate —— 生产 secure-by-default:Bash 若未进 bwrap 沙箱则默认拒绝执行。
// 背景(评审):claw 是唯一开 Bash 的 feature;bwrap 关闭时裸 Bash 无 PID/mount 命名空间,
// 多租户下可 `cat` 其它会话上传文件、经 /proc/*/environ 偷 MINICOD_API_KEY / EXECUTOR_AUTH_TOKEN。
// **Bash 能力本身始终保留** —— 这里只拦「生产 + 无沙箱 + 未显式放行」这一危险组合。放行条件(任一):
//   ① SANDBOX_MODE=bwrap(正道,拿进程/网络隔离);
//   ② 非 production(本机/单租户开发,裸 Bash 无跨租户面);
//   ③ EXECUTOR_ALLOW_UNSANDBOXED_BASH=1(操作者显式知情放行,如内核无法开 unprivileged userns)。
export function unsandboxedBashGate(): { ok: boolean; reason: string } {
  const mode = process.env.SANDBOX_MODE ?? "none";
  if (mode === "bwrap") return { ok: true, reason: "bwrap-sandboxed" };
  if (process.env.NODE_ENV !== "production") return { ok: true, reason: "non-production" };
  if (process.env.EXECUTOR_ALLOW_UNSANDBOXED_BASH === "1") return { ok: true, reason: "explicit-override" };
  return {
    ok: false,
    reason:
      "production 环境未启用 bwrap 沙箱,Bash 已被 secure-by-default 关闭(防跨租户读文件 / 经 /proc 泄漏密钥)。" +
      "请设 EXECUTOR_SANDBOX_MODE=bwrap(需内核放开 unprivileged userns);确无法沙箱且已知悉风险时,可设 EXECUTOR_ALLOW_UNSANDBOXED_BASH=1 显式放行。",
  };
}
