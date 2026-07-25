// bubblewrap jail 启动器(详细设计 §2.6,P4b)。
//
// 运行前提(2026-07-15 实测更正):bwrap 需要 **Docker 放行 userns/mount 系统调用** ——
// Docker 默认 seccomp 把 clone/unshare/setns/mount/pivot_root 全部门禁在 CAP_SYS_ADMIN 之后,
// 而本容器 cap_drop=ALL,故默认必失败并报 "kernel does not allow non-privileged user namespaces"
// (**这是 bwrap 的猜测话术,不是真因** —— 内核其实支持,拦截来自 seccomp)。
// 解法:挂 docker/seccomp/agent-bwrap.json(Docker 默认 profile + 仅放行 userns/mount 家族),
// 加固(cap_drop ALL + no-new-privileges)可全部保留。本机 Docker Desktop 与生产 Linux 同理。
//
// jail 不变式:--unshare-all(新 user/pid/ipc/uts/cgroup/net ns)+ tmpfs 根 + 唯一可写=cwd
// + skill 目录只读 + --die-with-parent + --new-session(防 TIOCSTI)+ no-new-privs + clearenv。
// 跨租户文件遍历物理不可能(其它会话 cwd 根本不在 mount 命名空间里)。

import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { egressEnv } from "./egress.ts";
import { log } from "../obs/log.ts";
import type { SandboxProfile } from "./profile.ts";

export type SandboxMode = "none" | "bwrap";

// 沙箱**无开关**(2026-07-15):安全控制不该能被配置关掉 —— 旧的 SANDBOX_MODE=none 一旦误设,
// 多租户下 Bash 立刻裸跑(跨会话读文件 / 偷密钥),而且没人会注意到。改为**启动自探**:
//   探到 bwrap 真能建沙箱 → 所有 Bash 强制进 jail,无法绕过;
//   探不到(缺二进制 / 裸机跑 bun / 别的发行版限制)→ 交给 unsandboxedBashGate:
//     生产 fail-closed 关 Bash;非生产(单租户开发)裸跑 + 大声 warn。
// 探测只在首次调用跑一次(spawnSync ~ms 级)并缓存。
let sandboxProbe: SandboxMode | null = null;

export function sandboxMode(): SandboxMode {
  if (sandboxProbe !== null) return sandboxProbe;
  sandboxProbe = probeBwrap() ? "bwrap" : "none";
  return sandboxProbe;
}

// probeBwrap:真跑一次最小 jail,确认本环境能建 user/mount 命名空间(而不是猜)。
// 失败原因通常是 Docker 默认 seccomp 未放行 userns —— 见 docker/seccomp/agent-bwrap.json。
function probeBwrap(): boolean {
  try {
    const r = Bun.spawnSync(["bwrap", "--unshare-all", "--ro-bind", "/", "/", "/bin/true"], {
      stdout: "ignore",
      stderr: "pipe",
    });
    if (r.exitCode === 0) return true;
    log.error(
      "FATAL(sandbox):bwrap 自探失败 —— 本环境建不了 user namespace,Bash 将按 secure-by-default 处理" +
        "(生产=拒绝执行)。多半是容器 seccomp 未放行 clone/unshare(见 docker/seccomp/agent-bwrap.json 与 compose 的 security_opt)。",
      { stderr: new TextDecoder().decode(r.stderr ?? new Uint8Array()).trim().slice(0, 200) },
    );
    return false;
  } catch (e) {
    log.error("FATAL(sandbox):bwrap 不可执行(二进制缺失?)—— Bash 按 secure-by-default 处理。", {
      err: String((e as Error)?.message ?? e),
    });
    return false;
  }
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
    // LANG:--clearenv 会丢它 → jail 内 UTF-8 locale 缺失(中文文件名/内容处理、未来 weasyprint 等
    // Python PDF 引擎会乱码/失败)。透传容器 LANG,缺省给 C.UTF-8;对 bash/pandoc 无害。
    "--setenv", "LANG", process.env.LANG || "C.UTF-8",
    // TZ:--clearenv 丢了它、jail 也没 bind /etc/localtime → jail 内 `date` 会跑 UTC(北京 0-8 点
    // 日期差一天,重蹈 2026-07-15 时区事故)。透传容器 TZ;/usr/share/zoneinfo 已在 ro-bind 的 /usr 里。
    "--setenv", "TZ", process.env.TZ || "Asia/Shanghai",
    // 刻意**不挂 /proc**:Docker 对容器 /proc 做了 masked paths(锁定挂载),userns 内无法在其上
    // 挂新 procfs → bwrap 报 "Can't mount proc: Operation not permitted"。解开需 systempaths=unconfined,
    // 那会削弱**外层**容器的加固;实测 claw 真实负载(pandoc / python-docx / openpyxl / pdftotext /
    // 管道)全部不需要 /proc,故直接不挂 —— jail 里 /proc 不存在 = 偷 /proc/*/environ 的向量物理消失
    // (--unshare-pid 本已使 jail 只见自身进程,这是第二层)。代价:jail 内 `ps` 不可用(无碍转换负载)。
    // 若将来某工具确需 /proc:compose 给 agent 加 security_opt: systempaths=unconfined 并在此恢复 --proc。
    "--dev", "/dev",
    "--tmpfs", "/tmp", // 临时可写(jail 内,随退出销毁)
    "--ro-bind", "/usr", "/usr",
    "--ro-bind-try", "/bin", "/bin",
    "--ro-bind-try", "/lib", "/lib",
    "--ro-bind-try", "/lib64", "/lib64",
    // ── 科研绘图 B/C 车道(matplotlib/rdkit)在 jail 内渲染所需的 OS 只读配置 ──
    // 这三条都是「镜像装了依赖、但依赖在运行时还要读某个 /etc 路径,而 jail 没 bind → 失败」的坑;
    // 裸 `docker exec python3` 看不到(不进 jail),只有 smokeTestSciDrawDeps 用真实 jail 才暴露。
    // /etc/alternatives:Debian update-alternatives 软链枢纽。libblas.so.3/liblapack.so.3(numpy 依赖,
    //   matplotlib/rdkit 都要 numpy)= /usr/lib/<arch>/libblas.so.3 → /etc/alternatives/... 两跳软链;
    //   不 bind 这一跳 → jail 内软链悬空 → `import numpy` 直接 ImportError。pandoc/weasyprint 同理受益。
    "--ro-bind-try", "/etc/alternatives", "/etc/alternatives",
    // /etc/matplotlibrc:Debian 把 matplotlib 的真配置放这里(matplotlib_fname() 解析到它);不 bind →
    //   `import matplotlib.pyplot` 抛 "Could not find matplotlibrc file; your install is broken"。
    "--ro-bind-try", "/etc/matplotlibrc", "/etc/matplotlibrc",
    // /etc/fonts:fontconfig 主配置(fonts.conf)。不 bind → "Fontconfig error: Cannot load default config
    //   file",cairo/matplotlib 的字体解析退化,中文(Noto Sans CJK)可能渲成豆腐块。
    "--ro-bind-try", "/etc/fonts", "/etc/fonts",
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

// wrapBash:据**自探结果**决定是否包 jail(沙箱无开关)。探到即强制进 jail;探不到时 Bash
// 是否还能跑由 unsandboxedBashGate 决定(生产 fail-closed)。
export function wrapBash(profile: SandboxProfile, command: string): string[] {
  const inner = ["bash", "-lc", command];
  if (sandboxMode() === "bwrap") {
    return buildBwrapArgv(profile, inner);
  }
  return inner;
}

// smokeTestSciDrawDeps:启动后自检「科研绘图 B/C 车道」的 python 渲染依赖在**真实 jail 内**能否跑通。
// 动机(2026-07-21 事故):镜像装了 matplotlib/numpy/rdkit + libblas3,裸 `docker exec python3` 全绿,
// 但真实链路是 Bash→wrapBash→buildBwrapArgv 进 jail;jail 的 bind 集若漏了某运行库依赖(如
// /etc/alternatives 中转的 libblas.so.3),`import numpy` 就 ImportError,两条车道全部产不出图 ——
// 而裸 exec 自检完全看不到。故这里用与生产**同一套 buildBwrapArgv**造 jail 跑最小 savefig +
// MolDraw2DSVG,把「装了却在 jail 内挂不了」这类缺陷在启动日志里大声暴露(非致命,不拖垮整个 agent)。
// 只在 bwrap 自探成功(真会进 jail)时有意义;探不到则跳过。
export async function smokeTestSciDrawDeps(): Promise<void> {
  if (sandboxMode() !== "bwrap") return;
  let dir = "";
  try {
    dir = await mkdtemp(join(tmpdir(), "sci-smoke-"));
    const profile: SandboxProfile = { cwd: dir, net: "none", allowBash: true, roBinds: [] };
    // numpy→matplotlib(B 车道)+ rdkit(C 车道):import + 最小渲染,断言产出非空。
    const code =
      "import numpy, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt; " +
      "f=plt.figure(); f.savefig('smoke.svg'); " +
      "from rdkit import Chem; from rdkit.Chem.Draw import rdMolDraw2D; " +
      "m=Chem.MolFromSmiles('CCO'); d=rdMolDraw2D.MolDraw2DSVG(80,80); " +
      "rdMolDraw2D.PrepareAndDrawMolecule(d,m); d.FinishDrawing(); " +
      "assert d.GetDrawingText().strip(); print('SCI_SMOKE_OK')";
    const argv = buildBwrapArgv(profile, ["python3", "-c", code]);
    const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    const exit = await proc.exited;
    if (exit === 0 && out.includes("SCI_SMOKE_OK")) {
      log.info("科研绘图 B/C 车道自检通过(matplotlib + rdkit 在真实 bwrap jail 内可渲染)");
    } else {
      const err = await new Response(proc.stderr).text();
      log.error(
        "科研绘图 B/C 车道自检失败 —— matplotlib/rdkit 在 bwrap jail 内跑不通(数据图/分子图将产不出)。" +
          "多半是某运行库未 bind 进 jail(如 /etc/alternatives→libblas.so.3);见 buildBwrapArgv 的 ro-bind 集。",
        { exit, stderr: err.trim().slice(0, 300) },
      );
    }
  } catch (e) {
    log.error("科研绘图 B/C 车道自检异常", { err: String((e as Error)?.message ?? e) });
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// smokeTestExport:启动后自检 ExportDocument 链路(pandoc → docx / pdf)在**真实 jail 内**能否产出。
// 动机(2026-07 审计 P0-4):生产 bwrap 自探失败 → 导出 4/4 全挂、半月 0 个 docx/pdf,且只有真实
// 会话踩到才暴露。与 smokeTestSciDrawDeps 同构:用生产同一套 buildBwrapArgv 造 jail,把「镜像装了、
// jail 内跑不通」类缺陷在启动日志里大声暴露(非致命)。pdf 目标仅在 EXECUTOR_PDF_ENGINE 配置时测。
export async function smokeTestExport(): Promise<void> {
  if (sandboxMode() !== "bwrap") return;
  let dir = "";
  try {
    dir = await mkdtemp(join(tmpdir(), "export-smoke-"));
    await Bun.write(join(dir, "s.md"), "# 冒烟测试\n\n中文段落与 formula $x^2$。\n\n- 列表项\n");
    const profile: SandboxProfile = { cwd: dir, net: "none", allowBash: false, roBinds: [] };
    const engine = (process.env.EXECUTOR_PDF_ENGINE || "").trim();
    const targets: string[][] = [["docx"], ...(engine ? [["pdf", `--pdf-engine=${engine}`]] : [])];
    for (const [fmt, ...extra] of targets) {
      const argv = buildBwrapArgv(profile, ["pandoc", "/work/s.md", "-o", `/work/o.${fmt}`, ...extra]);
      const proc = Bun.spawn(argv, { stdout: "ignore", stderr: "pipe" });
      const exit = await proc.exited;
      const st = exit === 0 ? await stat(join(dir, `o.${fmt}`)).catch(() => null) : null;
      if (st && st.size > 0) {
        log.info(`导出自检通过(${fmt} 在真实 bwrap jail 内可产出,${st.size} bytes)`);
      } else {
        const err = await new Response(proc.stderr).text();
        log.error(`导出自检失败(${fmt})—— ExportDocument 生产将出不了该格式`, {
          exit,
          stderr: err.trim().slice(0, 300),
        });
      }
    }
  } catch (e) {
    log.error("导出自检异常", { err: String((e as Error)?.message ?? e) });
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
