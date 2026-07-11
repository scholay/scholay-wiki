// bubblewrap jail 启动器(详细设计 §2.6,P4b)。
//
// ⚠️ 仅**生产真 Linux 内核**可用:bwrap 需 user namespaces + seccomp,本机 docker(LinuxKit)
// 无法运行 → 本机一律 SANDBOX_MODE=none(直跑,与 fork 当前行为一致)。生产设 SANDBOX_MODE=bwrap。
//
// jail 不变式:--unshare-all(新 user/pid/ipc/uts/cgroup/net ns)+ tmpfs 根 + 唯一可写=cwd
// + skill 目录只读 + --die-with-parent + --new-session(防 TIOCSTI)+ no-new-privs + clearenv。
// 跨租户文件遍历物理不可能(其它会话 cwd 根本不在 mount 命名空间里)。

import { egressEnv } from "./egress.ts";
import type { SandboxProfile } from "./profile.ts";

export type SandboxMode = "none" | "bwrap";

export function sandboxMode(): SandboxMode {
  return process.env.SANDBOX_MODE === "bwrap" ? "bwrap" : "none";
}

// buildBwrapArgv:把 inner argv 包进 bubblewrap。返回完整 spawn argv(以 "bwrap" 开头)。
export function buildBwrapArgv(profile: SandboxProfile, inner: string[]): string[] {
  const args: string[] = [
    "bwrap",
    "--unshare-all", // 全 namespace 隔离(含 net;net:open 下方再 --share-net)
    "--die-with-parent", // 父进程亡 → jail 内进程亡(无孤儿逃逸)
    "--new-session", // 新 session,防 TIOCSTI 终端注入逃逸
    "--clearenv", // 清环境,仅显式 setenv 下方白名单
    "--setenv", "HOME", "/work",
    "--setenv", "PATH", "/usr/local/bin:/usr/bin:/bin",
    "--setenv", "TMPDIR", "/tmp",
    "--proc", "/proc",
    "--dev", "/dev",
    "--tmpfs", "/tmp", // 临时可写(jail 内,随退出销毁)
    "--ro-bind", "/usr", "/usr",
    "--ro-bind-try", "/bin", "/bin",
    "--ro-bind-try", "/lib", "/lib",
    "--ro-bind-try", "/lib64", "/lib64",
    "--ro-bind-try", "/etc/ssl", "/etc/ssl", // TLS CA(出网验证证书)
    "--ro-bind-try", "/etc/resolv.conf", "/etc/resolv.conf",
    "--bind", profile.cwd, "/work", // 唯一可写绑定 = 本会话 cwd
    "--chdir", "/work",
  ];

  // 只读挂载 skill / add-dir(缺失不报错)
  for (const ro of profile.roBinds) {
    if (ro) args.push("--ro-bind-try", ro, ro);
  }

  // 网络:net:open → 重新共享 net + 注入 egress 代理 env(egress-proxy 已删:默认无 HTTPS_PROXY →
  //       经 egress-net NAT 直连公网;设了 HTTPS_PROXY 才收口到代理,见 egress.ts);
  //       net:none → 不共享(--unshare-all 已断网,prism compile)。
  if (profile.net === "open") {
    args.push("--share-net");
    for (const [k, v] of egressEnv()) args.push("--setenv", k, v);
  }

  args.push("--"); // 终止 bwrap 参数
  args.push(...inner);
  return args;
}

// wrapBash:据 SANDBOX_MODE 决定是否包 jail。none(本机/默认)= 直跑 bash(与 fork 一致)。
export function wrapBash(profile: SandboxProfile, command: string): string[] {
  const inner = ["bash", "-lc", command];
  if (sandboxMode() === "bwrap") {
    return buildBwrapArgv(profile, inner);
  }
  return inner;
}
