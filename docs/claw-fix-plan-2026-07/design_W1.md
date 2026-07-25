# W1 沙箱解锁与导出复活 — 文件级落地方案

## 0. 根因链与三选一裁决(先定架构,再列改动)

**观测证据**:生产 bwrap 报 `Failed to make / slave`(审计 P0-4),seccomp(docker/seccomp/agent-bwrap.json:794-807)已放行 clone/unshare/mount 家族,故拦截不在 seccomp。在 Ubuntu(apparmor_restrict_unprivileged_userns=1)宿主上,有**两层独立的 AppArmor 拦截**,必须同时理解才能选对方案:

1. **docker-default profile 拒 mount**:该 profile 无 mount 规则(AppArmor 对 mount 类默认拒),且因旧 abi 编译不调解 userns → bwrap 能建 userns、但随后 `mount --make-slave /` 被拒 → 正是观测到的 `Failed to make / slave`。
2. **sysctl=1 对 unconfined 进程的钳制**:一旦容器改 `apparmor=unconfined`,进程创建 userns 时被内核转入特殊的 `unprivileged_userns` 桩 profile(拒 capability)→ mount 还是失败,**只是换一种死法**。

由此三个选项的真实效果:

| 方案 | 效果 | 结论 |
|---|---|---|
| 仅容器 `apparmor=unconfined` | 解除第 1 层,撞上第 2 层,**仍然失败** | 单独不可用 |
| 仅宿主 sysctl=0 | 解除第 2 层,docker-default 仍拒 mount,**仍然失败** | 单独不可用 |
| **A:sysctl=0 + apparmor=unconfined(推荐)** | 两层同时解除,确定性恢复 | **P0 采纳** |
| C:自定义 AppArmor profile(含 `userns,`+mount 规则,保 sysctl=1) | 也能解,且保留 AppArmor | P2 增强,不做 P0 |

**推荐 A 的理由**:① 两处纯机械改动(一行 compose + 一个 sysctl 文件),分钟级可验证,符合"最小而有效";② C 需要以 abi 4.0 手写 profile,而 abi 4.0 会把 network/io_uring/mqueue 全部变为受调解类——**Bun 运行时用 io_uring 做文件 IO**,漏一条 allow 规则就是新的静默瘫痪,作者风险远高于收益;③ 摘掉 AppArmor 后剩余防线依然完整:cap_drop=ALL、no-new-privileges、自定义 seccomp(仍禁 bpf/perf_event_open)、Docker masked /proc paths、以及 **bwrap 本身作为内层 jail**(tmpfs 根 + 唯一可写 cwd + net 按 profile + clearenv)。净增风险与当初接受自定义 seccomp 同量级(调研资料 §5 同一判断)。sysctl=0 只是回到 24.04 之前所有发行版的内核默认,该宿主是专用 docker 主机,无其它多用户负载。

---

## P0(合计约 7h,当天可全部上线)

### P0-1 解锁 bwrap:compose 两处 + 宿主 sysctl(1.5h + 运维 0.5h)

**改动 1:`docker-compose.prod.yml:371-376`(生产真正生效)与 `docker-compose.yml:411-416`(开发对齐,macOS Docker Desktop 无 AppArmor 为 no-op)** — agent 服务 security_opt 各追加一行:

```yaml
    security_opt:
      - no-new-privileges:true
      # bwrap 内层沙箱(2026-07-15):…(原注释保留)
      - seccomp=./docker/seccomp/agent-bwrap.json
      # AppArmor(2026-07-23):docker-default 无 mount 规则,即使 seccomp 已放行,jail 内
      # mount --make-slave / 仍被拒("Failed to make / slave")。摘 AppArmor 后防线仍有:
      # cap_drop ALL + no-new-privileges + 上面的自定义 seccomp + bwrap 内层 jail。
      # ⚠️ 必须配套宿主 sysctl kernel.apparmor_restrict_unprivileged_userns=0(见 scripts/enable-bwrap-host.sh),
      # 否则 unconfined 进程建 userns 会被内核转入 unprivileged_userns 桩 profile,换一种方式失败。
      - apparmor=unconfined
```

**改动 2:新增 `scripts/enable-bwrap-host.sh`**(宿主一次性 runbook,与 seccomp 文件同样进仓库留痕):

```bash
#!/usr/bin/env bash
# 生产宿主(Ubuntu 24.04+)启用 agent 容器内 bwrap 沙箱的前置:解除 unconfined 进程的 userns 钳制。
# 与 docker-compose*.yml agent 服务的 apparmor=unconfined 配套,两者缺一 bwrap 都起不来。
set -euo pipefail
echo "kernel.apparmor_restrict_unprivileged_userns = 0" > /etc/sysctl.d/99-scholar-agent-userns.conf
sysctl --system | grep apparmor_restrict_unprivileged_userns
echo "OK. 接着执行: docker compose -f docker-compose.prod.yml up -d agent  (security_opt 变更必须重建容器,restart 无效)"
```

**为什么能解决**:直接对应审计 P0-4 的两层拦截(见 §0);Bash 47/65 失败、ExportDocument 4/4 失败全部源自 `sandboxMode()=="none"` 后 `unsandboxedBashGate` 生产 fail-closed(profile.ts:30-42、registry.ts:283-284、registry.ts:424-428)——探测一旦成功,这些闸门自动放行且 Bash 强制进 jail(bwrap.ts:126-134),**零代码改动即全量恢复**。

**验证**:见 P0-5 清单。注意探测结果进程级缓存(bwrap.ts:29-35),必须 `up -d agent` 重建而非 restart。

**风险与回滚**:回滚 = 删掉 compose 那一行 + 删 sysctl 文件 + `sysctl --system` + 重建容器,退回现状(Bash 关闭但服务无损)。摘 AppArmor 的残余风险已在 §0 论证;sysctl 全局生效但宿主无其它非容器负载。

### P0-2 PDF 引擎落地(半月 0 个 pdf 的另一半根因)(1.5h,含镜像重建)

审计"半月 0 个 docx/pdf"里 docx 是沙箱闸,**pdf 即使解锁也出不来**:`EXECUTOR_PDF_ENGINE` 从未配置(registry.ts:566),Dockerfile 无任何引擎。

**改动 1:`agent/Dockerfile`**,在 python3-rdkit 层(L50-52)之后新增独立层(遵循该文件"大层不合并"的既有铁律):

```dockerfile
# ExportDocument 的 PDF 引擎(pandoc --pdf-engine=weasyprint,bookworm pandoc 2.17 已支持)。
# 选 weasyprint:纯本地渲染(jail net:none 兼容)、走 fontconfig(/etc/fonts 已 bind 进 jail,
# fonts-noto-cjk 已装,中文不豆腐块)、无 TeX 依赖(体积远小于 texlive)。
RUN apt-get update && apt-get install -y --no-install-recommends weasyprint \
    && rm -rf /var/lib/apt/lists/*
```

**改动 2:`docker-compose.yml` 与 `docker-compose.prod.yml`** agent 服务 environment 段各加:

```yaml
      - EXECUTOR_PDF_ENGINE=weasyprint
```

**为什么这样能成**:jail 内运行条件全部已满足——/usr 只读 bind(bwrap.ts:85)、/etc/fonts(bwrap.ts:101)、/etc/alternatives(bwrap.ts:95)、HOME=/work 可写(fontconfig 缓存)、LANG UTF-8(bwrap.ts:73);net:none 下远程图片行为与现有 docx 路径一致(registry.ts:629-632 已有提示文案,复用)。

**验证**:P0-3 的导出冒烟自检 + 真实会话导出 pdf。
**风险与回滚**:weasyprint 对复杂 LaTeX 公式排版弱于 TeX——可接受(当前是 0 到 1);回滚 = 去掉 env(pdf 回到"无引擎"降级文案,docx 不受影响)。

### P0-3 导出冒烟自检(部署即验证,复制 sci-draw smoke 模式)(1.5h)

**改动:`agent/src/sandbox/bwrap.ts`** 新增 `smokeTestExport()`(放 smokeTestSciDrawDeps 之后,同构):

```ts
export async function smokeTestExport(): Promise<void> {
  if (sandboxMode() !== "bwrap") return;
  let dir = "";
  try {
    dir = await mkdtemp(join(tmpdir(), "export-smoke-"));
    await Bun.write(join(dir, "s.md"), "# 冒烟\n\n中文段落 formula $x$\n");
    const profile: SandboxProfile = { cwd: dir, net: "none", allowBash: false, roBinds: [] };
    const targets = [["docx"], ...(process.env.EXECUTOR_PDF_ENGINE ? [["pdf", `--pdf-engine=${process.env.EXECUTOR_PDF_ENGINE}`]] : [])];
    for (const [fmt, ...extra] of targets) {
      const argv = buildBwrapArgv(profile, ["pandoc", "/work/s.md", "-o", `/work/o.${fmt}`, "-t", fmt, ...extra]);
      const proc = Bun.spawn(argv, { stdout: "ignore", stderr: "pipe" });
      const exit = await proc.exited;
      const st = exit === 0 ? await stat(join(dir, `o.${fmt}`)).catch(() => null) : null;
      if (st && st.size > 0) log.info(`导出自检通过(${fmt} 在真实 bwrap jail 内可产出)`);
      else log.error(`导出自检失败(${fmt})—— ExportDocument 生产将出不了该格式`, { exit, stderr: (await new Response(proc.stderr).text()).trim().slice(0, 300) });
    }
  } catch (e) { log.error("导出自检异常", { err: String((e as Error)?.message ?? e) }); }
  finally { if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
```

`agent/src/index.ts:94` 后追加 `smokeTestExport().catch(() => {});`(需在 index.ts:9 的 import 里补导出名)。

**为什么**:2026-07-21 sci-draw 事故已证明"镜像装了、裸 exec 全绿、真实 jail 挂掉"这类缺陷只有**用生产同一套 buildBwrapArgv 造 jail** 才能在启动日志暴露(bwrap.ts:136-142 注释)。导出链路同理,把 P0-1/P0-2 的部署验证变成机械自证。
**验证**:`docker logs scholar_agent | grep 导出自检`。风险:无(fire-and-forget,非致命);回滚删函数即可。

### P0-4 失败期兜底文案重写:失败点带内注入模型指令,杜绝"Word 打开 md"话术(1.5h)

**为什么必须代码层而非全局 prompt**:P1-13 的误导话术发生在"导出失败→模型即兴解释"的瞬间;审计同时表明 flash 模型对远距离规则失效(P1-8"正面模板规则对 flash 无效")。tool_result 是**紧贴生成点**的带内注入——模型解释失败前读到的最后一段文本就是它,这是确定性最强的 prompt 落点;全局条文只作 P1 兜底。

**改动 1:`agent/src/tools/registry.ts:283-284`(Bash 闸)**——gate.reason(含 EXECUTOR_ALLOW_UNSANDBOXED_BASH/seccomp 等内部词,审计 P1-12 的泄漏源之一)改进日志,tool_result 换成模型指令:

```ts
    const gate = unsandboxedBashGate();
    if (!gate.ok) {
      log.error("bash disabled by sandbox gate", { reason: gate.reason }); // 内部真因只进日志
      return fail(
        "Bash 暂不可用(执行环境维护中,运维已在处理)。对用户只能如实说明:『命令执行/文件转换功能暂时维护中』。" +
          "禁止:编造替代操作步骤、宣称已用其它方式完成、把本条报错或任何内部报错原文转述给用户。" +
          "你仍可用 Read/Write/Edit/ReadDocument 完成不依赖 shell 的部分,并把已完成内容写入 out/ 供用户下载。",
      );
    }
```

**改动 2:`agent/src/tools/registry.ts:424-428`(runConverterConfined 导出闸)**:

```ts
  if (sandboxMode() !== "bwrap") {
    const gate = unsandboxedBashGate();
    if (!gate.ok) {
      log.error("export refused by sandbox gate", { reason: gate.reason });
      return {
        ok: false, text: "",
        err:
          "导出功能暂时不可用(执行环境维护中)。请先确认完整内容已用 Write 落盘为 out/<名称>.md,再如实告知用户:" +
          "『文档导出暂时维护中,我已把完整内容保存为 Markdown 文件,可直接下载查看;导出恢复后可再生成 docx/pdf。』" +
          "禁止:声称 Word/WPS 能直接打开 .md 并自动保留格式(不成立);声称文件已导出;编造其它补救步骤。",
      };
    }
    return runConverter(argv, workDir);
  }
```

**改动 3:`agent/src/tools/registry.ts:617-621`(PDF 无引擎降级)**——现文案任由模型即兴,替换为唯一许可话术(该话术为真):

```ts
        if (fmt.needsEngine) {
          return fail(
            "ExportDocument: PDF engine unavailable. 请改为导出 docx(target_format=docx),并告知用户:" +
              "『PDF 暂不可用,已生成 docx,可在 Word/WPS 中打开后另存为 PDF。』这是唯一允许的替代说法,禁止编造其它方法。Detail: " + res.err,
          );
        }
```

**核对项(无需改动)**:审计"Read 报错文案教 agent 走 Bash"在当前代码已不成立——registry.ts:92-96 的二进制 hint 已指向 ReadDocument;ReadDocument 本身不依赖 bwrap(registry.ts:445-449),失败期照常可用。此项记为已修,验证时确认即可。

**验证**:本地(macOS 无 AppArmor 但可临时用 `NODE_ENV=production` + 卸掉 seccomp 强造 gate 关闭)发一条"导出 docx"消息,检查回复不含 Word/md 话术、不含 gate 内部词。
**风险**:文案变更零协议影响;回滚 = 还原字符串。

### P0-5 部署后验证清单(1h,照单执行)

```
宿主:
[ ] sysctl kernel.apparmor_restrict_unprivileged_userns → 0
[ ] docker inspect scholar_agent --format '{{.HostConfig.SecurityOpt}}'
    → 同时含 apparmor=unconfined 与 seccomp=…agent-bwrap.json(seccomp 仍在=没有顺手裸奔)
启动日志(docker logs scholar_agent):
[ ] "agent started … sandbox_mode: bwrap"(index.ts:71-75)
[ ] "科研绘图 B/C 车道自检通过"(bwrap.ts:162)
[ ] "导出自检通过(docx)" + "导出自检通过(pdf)"(P0-3 新增)
[ ] 无 "FATAL(sandbox)" / "FATAL(secure-by-default)"
功能(真实 claw 会话):
[ ] Bash: `echo ok && date`(验证 jail 内 TZ 正常)
[ ] ExportDocument docx + pdf → out/ 出文件、前端下载卡片可下、文件可打开且中文不豆腐块
安全回归(bwrap 仍是内层沙箱):
[ ] claw Bash 跑 `ls /proc` → 不存在(bwrap.ts:77-82 不挂 /proc)
[ ] claw Bash 跑 `ls /home/bun/sessions` → No such file(其它会话 cwd 不在 mount ns)
[ ] claw Bash 跑 `env` → 无 MINICOD_API_KEY / EXECUTOR_AUTH_TOKEN(clearenv + 白名单)
持续观察(48h):
[ ] docker logs scholar_backend | grep agent_usage 无异常;审计口径复测 Bash 成功率、docx/pdf 产出数
```

---

## P1(合计约 4.5h)

### P1-1 tool_result 双通道:用户导向 userHint 帧字段(4h)

现状:tool_result 单一 text 既回喂模型又原样进前端折叠(runTools.ts:80-81),P0-4 的模型指令文案若被用户点开工具卡会直接看到"禁止编造…"——诚实但难看,且 P1-12 的内部报错泄漏无展示层防线。机械方案:**帧加可选 `userHint`,失败卡片优先展示它**。

- `agent/src/tools/registry.ts:23`:`export interface ToolResult { content: …; isError: boolean; userHint?: string }`;`fail(text, userHint?)` 透传。P0-4 三处失败各配一句用户话术,如 `fail(模型指令, "导出功能暂时维护中,已保存为 Markdown 文件供下载")`。
- `agent/src/turn/runTools.ts:80`:`sink.frame({ type:"tool_result", toolUseId: tu.id, content, isError, userHint: (r as ToolResult).userHint })`;**发给上游 messages[] 的 Anthropic tool_result(L81)不带此字段**(协议纯净)。
- 透传链零改动:ws.ts sink 整帧 safeSend(ws.ts:257)、Go hub `broadcastAgent(frame []byte)` 原字节转发(hub.go:811)、journal 存原帧(回放同构,符合"实时 fold 与历史 fold 同构"铁律)。
- 前端:`shared/types/chat.ts` ToolCall 加 `userHint?: string`(L31-33 result/isError 旁);三个 feature 的实时 fold `case 'tool_result'` 各加一行捕获(claw `features/claw/components/chat/fold.ts:110-117`、prism `features/prism/components/chat/fold.ts` 同构分支、smart-search 对应 fold);`shared/components/chat/ToolCallBlock.tsx` 失败展开区:`tool.userHint` 存在时以它替代 raw 结果渲染(raw 不再给终端用户;admin 会话监控走 journal/transcript 不受影响)。
- 局限声明:cc-haha transcript 回退路径(agent-history.ts)无此字段,降级显示原文——可接受。
- 验证:`cd agent && bun run tsc` 类检查(如有)+ `cd frontend-user && tsc -b && vite build`;造一次导出失败看卡片文案。回滚:字段可选,任一层还原都不破协议。

### P1-2 全局 prompt 兜底条文(0.5h)

**位置:`backend/internal/prompts/claw.go` ClawSystemPrompt 常量**(工具失败话术属人格层约束,claw 是唯一开 Bash/导出的 feature),追加一节:

```
## 工具失败时的话术纪律
任何工具失败时:如实说明该功能暂时不可用,给出真实可行的替代(下载已生成的源文件/稍后重试),
绝不描述你没有实际执行成功的操作。明令禁止:声称用 Word/WPS 直接打开 .md 会自动保留格式;
把工具报错原文、内部路径或配置名转述给用户;宣称"已生成文件"却没有对应成功的 Write/ExportDocument。
```

**为何 prompt 层在此足够**:它只是 P0-4 带内注入的第二道兜底(覆盖"失败发生在多轮之前、模型后续又提起"的场景),主防线是机械的失败点注入。部署:重建 backend(`docker compose build backend`);仅新会话生效(SystemPrompt 前缀在首条 user_message 注入),无需 restart scholar_agent。

---

## P2(可选增强,3-4h,不阻塞)

**把 AppArmor 加回来**:仓库新增 `docker/apparmor/scholar-agent`(以 moby docker-default 模板为底,abi 4.0 + `userns,` + `mount,`/`umount,`/`pivot_root,`,并显式 `network,`/`io_uring,`/`mqueue,`/`unix,`/`signal,` allow——abi 4.0 下这些从不调解变为受调解,漏则 Bun/出网静默挂),宿主 `apparmor_parser -r` 加载后 compose 改 `apparmor=scholar-agent`,同时宿主 sysctl 可回 1。上线前必须在 staging 全量跑 P0-5 清单;失败模式是容器拒启(fail-fast 可见)。在 P0 方案 A 稳定运行且有闲余前不建议动。

---

**排期汇总**:P0-1(2h)→ P0-2(1.5h)→ P0-3(1.5h)→ P0-4(1.5h)→ P0-5 验证(1h),一个工作日内完成并上线;P1-1(4h)+ P1-2(0.5h)次日;P2 择机。关键文件:`docker-compose.prod.yml:371` / `docker-compose.yml:411` / `scripts/enable-bwrap-host.sh`(新)/ `agent/Dockerfile:52后` / `agent/src/sandbox/bwrap.ts` / `agent/src/index.ts:94` / `agent/src/tools/registry.ts:283,424,617` / `agent/src/turn/runTools.ts:80` / `frontend-user/src/shared/types/chat.ts` / `frontend-user/src/shared/components/chat/ToolCallBlock.tsx` / `backend/internal/prompts/claw.go`。