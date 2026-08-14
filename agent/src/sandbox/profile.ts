// 每会话 sandbox profile(详细设计 §2.6)。控制面决定 net/allowBash;执行器据此构造 jail。
// smartsearch={net:open(仅 MCP 经 egress),allowBash:false};claw={allowBash:true};
// prism={net:none}(compile profile,泛化 prism_tex 的 network_mode:none)。

export type SandboxNet = "open" | "none";

export interface SandboxProfile {
  cwd: string; // 唯一可写目录
  net: SandboxNet; // open=经 egress 出网;none=完全断网(prism compile)
  allowBash: boolean;
  roBinds: string[]; // 只读挂载(skill / add-dir 目录)
  // 🔴 本次 spawn 允许写入的**保留区**目录(默认空 = 全部只读)。
  //
  // 为什么需要这个口子:数据分析有一对看似矛盾的约束 ——
  //   ① 用户数据受 PHI 约束,**不能出 jail**(所以 statkit 必须在 jail 内跑);
  //   ② bundle 是报告里每个数字的真源,**模型不能写**(所以 analysis/ 是保留区)。
  // 解法不是把数据搬出去,而是给引擎**单独一次**可写该保留区的 spawn:
  // 模型自己的 Bash 永远拿只读覆盖层,只有 executor 侧的 StatRun 工具这一条路径带此字段。
  //
  // ⚠️ 安全方向刻意设计成:**默认拒、显式放行**。漏传 = 更严格(写入被拒),
  // 而不是更宽松 —— 这与「加字段可能漏传导致静默敞口」的常见风险正好相反。
  writableReserved?: readonly string[];
}

export function profileFor(
  ctx: { workDir: string; net: SandboxNet; allowBash: boolean },
  roBinds: string[] = [],
): SandboxProfile {
  return { cwd: ctx.workDir, net: ctx.net, allowBash: ctx.allowBash, roBinds };
}

import { sandboxMode } from "./bwrap.ts";

// unsandboxedBashGate —— 生产 secure-by-default:Bash 若未进 bwrap 沙箱则默认拒绝执行。
// 背景(评审):claw 是唯一开 Bash 的 feature;bwrap 关闭时裸 Bash 无 PID/mount 命名空间,
// 多租户下可 `cat` 其它会话上传文件、经 /proc/*/environ 偷 MINICOD_API_KEY / EXECUTOR_AUTH_TOKEN。
// **Bash 能力本身始终保留** —— 这里只拦「生产 + 无沙箱 + 未显式放行」这一危险组合。放行条件(任一):
//   ① bwrap 自探成功(正道,拿进程/网络隔离;沙箱已无开关、探到即强制启用);
//   ② 非 production(本机/单租户开发,裸 Bash 无跨租户面);
//   ③ EXECUTOR_ALLOW_UNSANDBOXED_BASH=1(操作者显式知情放行,如内核无法开 unprivileged userns)。
export function unsandboxedBashGate(): { ok: boolean; reason: string } {
  // 沙箱无开关:以**自探结果**为准(sandboxMode 启动时真跑一次 bwrap 验证)。
  if (sandboxMode() === "bwrap") return { ok: true, reason: "bwrap-sandboxed" };
  if (process.env.NODE_ENV !== "production") return { ok: true, reason: "non-production" };
  if (process.env.EXECUTOR_ALLOW_UNSANDBOXED_BASH === "1") return { ok: true, reason: "explicit-override" };
  return {
    ok: false,
    reason:
      "本环境 bwrap 沙箱自探失败,Bash 已被 secure-by-default 关闭(防跨租户读文件 / 经 /proc 泄漏密钥)。" +
      "多半是容器未挂 docker/seccomp/agent-bwrap.json(Docker 默认 seccomp 把 clone/unshare 门禁在 CAP_SYS_ADMIN 之后);" +
      "确无法沙箱且已知悉风险时,可设 EXECUTOR_ALLOW_UNSANDBOXED_BASH=1 显式放行(生产被硬锁拒绝启动)。",
  };
}
