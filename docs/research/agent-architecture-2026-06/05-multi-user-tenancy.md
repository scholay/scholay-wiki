> 维度文档 · 基于 01-current-architecture.md + findings/ · 2026-06

# 多用户隔离与租户 (Multi-User Isolation & Tenancy)

> 本文是面向决策的提案,不重述调研。只用 01 文档与 findings 里的事实;findings 标 [UNVERIFIED] 的不当事实断言。
> 涉及我方代码给 `file:line`/符号,涉及妥协给 C 编号,涉及外部方案给项目名。每条建议附分期选项 + 取舍 + 改动触点。

---

## 1. Landscape:隔离不是开关,是一条光谱

2026 年的明确共识是:**共享内核的 container 不足以承载不可信代码**(B-multiuser:"standard multi-tenant containers can't safely contain AI agents executing arbitrary code")。大厂用脚投票——"AWS built Firecracker for Lambda. Google built gVisor for Search and Gmail. Azure uses Hyper-V for ephemeral agent sandboxes."。隔离强度与密度成本是一条连续光谱,应**按信任级别分级选型**而非一刀切:

| 级别 | 技术 | 边界 | 对不可信 agent 代码 |
|---|---|---|---|
| L1 Container | Docker/runc | 共享宿主内核 + namespace/cgroup | **仅适合可信内部代码**(被点名的反模式) |
| L2 用户态内核 | gVisor(`runsc`/Sentry/Gofer) | 系统调用在用户态重实现,"No system call is passed through directly to the host" | 强隔离 + 高密度,但不防侧信道、不防资源耗尽、"not a substitute for a secure architecture" |
| L3 microVM | Firecracker/Kata | 每 workload 自己的内核(KVM 硬件虚拟化)+ jailer 第二道防线 | gold-standard;125ms 启动 / <5MiB 开销 / 150 microVM/s/host,但每 VM 自带内核+RAM(e2b 默认 1GB) |
| L5 机密计算 | SEV-SNP/TDX | 硬件加密内存,宿主也读不到 | 除非数据机密性硬需求,否则过度设计 |

落地参照是 **OpenHands**(B-openhands)——它走的正是我们的轨迹(CLI 风 agent → Web 平台),且把隔离做成了可组合抽象:`BaseWorkspace`(`execute_command/file_upload/file_download`)→ `LocalWorkspace`(进程内、宿主 FS,"no cleanup",**= 我们今天的不安全路径**)→ `DockerWorkspace`("Each agent instance runs in an independent container with a dedicated file system... enables SaaS-style multi-tenancy")→ `RemoteWorkspace`(HTTP/WS 委托)。配套两件关键事:**per-session SecretRegistry**("Each conversation maintains its own instance, ensuring strict per-session isolation")与**事件溯源状态**(`base_state.json` + 可重放 event 文件,单事件 persist 0.20ms 中位,崩溃恢复 358 events 仍 <20ms)。生产蓝图(kane.mx AWS Fargate,第三方博客)给了文件系统隔离的最干净手法:**每会话挂一个 EFS access point,root 在 `/sandbox-workspace/<conversation_id>`、POSIX uid/gid 1000 → container 够不到父目录或别人的 workspace**。

算力层有成熟托管方案:**e2b**(Firecracker microVM,pause/resume 保 FS+内存、无 TTL、resume ~1s)、**Modal**(gVisor secure container,inbound secure-by-default + `outbound_domain_allowlist` 只放 443+通配)、**Daytona**(营销称 dedicated kernel 但多份比较称底层是共享内核 Docker,[UNVERIFIED],用于不可信执行前需核)、**Northflank**(BYOC,200 sandbox 成本 $2,060 vs e2b $11,500,厂商自published)。

但**最反直觉、对我们最该提前规划的一条**:真正的扩展悬崖不是 VM 启动而是**网络平面**——研究称 **~400 并发启动**时 "setting up CNI plugins and virtual switches becomes the primary bottleneck",可让 125ms 的 VM boot 膨胀成 multi-second,延迟最多 +263%。结论:**不要把单 sandbox 启动时间等同于端到端 provisioning 时间。**

---

## 2. 我们的现状 = 被业界点名的「Level 1 / 完全共享」反模式

把 01 文档 §5.4 与 §7 对照 landscape,Scholay 当前是 OpenHands 口中的 `LocalWorkspace` 形态——**一个共享 `scholar_agent` 容器,N 用户 M 会话,全部 transcript 落在单一共享 `~/.claude/projects/.../<sid>.jsonl` 树**(01 §5.4)。隔离不是 OS user/容器边界,而是一组软约定的叠加,逐条对应妥协清单:

- **C5(共享 FS jsonl,高)**:隔离 = 随机 sid + cwd 路径检查(`SCHOLAY_ISOLATE_SESSIONS`,默认开,限 Read/Glob/Grep 于 `~/sessions/<id>` 子树)。但 `SCHOLAY_ISOLATE_SESSIONS=0` 直接塌成共享 cwd——边界是 env 开关,不是硬约束。这正是 fast.io 警告的 **Pool 模型**:"漏一个 `tenant_id` 过滤就跨租户泄漏"。
- **C1(Bash 无条件 auto-approve,高)**:`ws.go:579-585` allow `Bash/BashOutput/KillShell` 并显式注「无法路径限制」。路径感知 approve 守 Read/Glob/Grep,**但 Bash 直接绕开**(01 §7.4):被 prompt-injected 的模型可 `cat ~/.claude/cc-haha/providers.json`(真 LLM key)、`printenv MINICOD_API_KEY`、`cat` 他人 jsonl。
- **C2/C3(进程内 displacement + 配额 mutex,单实例假设,高)**:`activeWSConns sync.Map`(`bridge.go:44-46`)与配额 reset 的进程内 256-shard mutex(`vip/quota.go:24-34`),Redis 锁均「计划但未实现」。**整个平台被钉死在单实例**:水平扩展立即出现 jsonl 双写损坏 + 配额双扣。
- **C12(prism Trusted 后门,中)**:`IssueWSTicketTrusted`(`ws_round.go:47-56`)跳过 `OwnsSession`,显式技术债;任何忘记自校验归属的未来调用方 = 跨用户会话劫持。
- **C21(无外键,低)**:`agent_sessions` 引用完整性仅服务层,删用户/项目留孤儿行。

**但必须点明一个关键缓和因素**(否则会把风险定级抬高):**我们当前 agent 形态主要调 MCP(唯一 server 是 minicod 学术检索,只读),不是任意代码执行**(01 §7.3)。按 landscape 的信任分级,这本应让 L1/L2 container 变得「可辩护」(B-multiuser 借鉴点 4:"若 agent 只调 MCP 工具→ gVisor/container 可辩护")。**真正把风险拉回不可信级别的是 C1——2026-05 为 office 转换重开的 Bash**(01 §7.1 Layer A)。也就是说:**我们的安全姿态不是「形态本身危险」,而是「为一个 feature(claw office 转换)开了一道把所有 feature 都拖进不可信级别的口子」。** 这是分级设计的入口,见 §3。

OpenHands 论文还给了一个**反向警示**(B-openhands 局限):V0 的「每会话一容器 + inter-pod HTTP daemon」朴素做法(≈ 我们今天 backend↔agent 的形状)是有记录的失败源——infrastructure errors 高达 69.8/1k,V1 改为「能 co-locate 就 co-locate、沙箱 opt-in」后降到 0.0/1k。**取舍提示:不是「容器越多越好」,而是按信任分级,只在需要时才付隔离的代价。**

---

## 3. 目标设计

### 3.1 按信任级别分级(north-star 的 per-session 沙箱,落到我们的 feature 矩阵)

不要给四个 feature 用同一套隔离。按 01 §4 的能力矩阵分级:

| 信任级 | feature | 当前能力 | 目标隔离 |
|---|---|---|---|
| **只读 MCP** | smart_search | `mcp__minicod__*` only,SessionOptions=nil | L1 container / 现状 cwd 隔离即可辩护(B-multiuser 点 4) |
| **写 DB + 沙箱编译** | prism | Bash 已禁(`DisallowedTools: Bash,NotebookEdit,Task,Agent`),LaTeX 编译已在 `prism_tex` `network_mode:none` 硬沙箱 | 现状已是分级最好的样本——**prism_tex 就是 C1 的解药模型** |
| **写文件 + 任意代码** | claw | **Bash 开放**(office 转换),artifact harvest | **需 microVM 或至少 per-session 沙箱容器**;这是 §4 进阶档的主战场 |
| **只读稿件(服务端驱动)** | peerreview | 只读,ServerSide streaming | L1 即可,但绕开 bridge(C10/C11)是另一维度问题 |

**第一性原则**:把 C1 从「全局重开」收敛成「按 feature 重开」。smart_search/peerreview 根本不需要 Bash,prism 已禁;**只有 claw 需要,而 claw 恰恰是该被装进沙箱的那个**。改动触点:`conversationService.ts:77-97` 的 `DEFAULT_DISALLOWED_TOOLS` 应改为「默认含 Bash」+ per-feature opt-in(claw 的 SessionOptions 显式去掉 Bash 禁令并配套沙箱),后端 `ws.go:575-604` `decidePermission` 对 Bash 的 allow 改为「仅当 feature 标记 `BashSandboxed`」。

### 3.2 per-session 文件系统隔离(直接修 C5)

抄 OpenHands EFS access-point 模式(B-multiuser 点 2 / B-openhands kane.mx):**每会话 root = `/workspace/<session_id>`、非 root uid、够不到兄弟与父目录**。Hermes 的 `worktree` workspace kind(B-hermes:git worktree 于 `.worktrees/<id>/`,保留;`scratch` 完成即删)给了更细的取舍——**临时会话用 scratch(删 session 即清 cwd,正对我们「删会话清理」需求),长期实体会话(prism 项目)用 worktree/dir 保留**。

把它做成 OpenHands 的 `Workspace` 工厂抽象(B-openhands 点 2):agent 容器内每 session 不再是「同一 `~/.claude` 树下随机 sid + 软 cwd」,而是「一个 uid 隔离、根目录绑死 `/workspace/<sid>` 的 namespace」。这是从「软约定」到「OS 强制边界」的关键一步——即便 C1 暂未完全收口,Bash 也只能 `cat` 到自己 workspace 内的东西,够不到 `providers.json`(它在 `~/.claude/cc-haha/`,该路径应移出任何 session workspace)与他人 jsonl。

**取舍**:agent 容器内做 per-uid + chroot/bind-mount 是「便宜的渐进」(不换容器运行时);真正的 per-session **容器/microVM** 是「彻底重做」(见 §4)。

### 3.3 per-session 密钥隔离(修 C1 的暴露面)

抄 OpenHands SecretRegistry(B-multiuser 点 8 / B-openhands 点 11:"secrets 在沙箱内惰性解析、原始值 never transit through the SDK client"):**上游 key 运行时注入到会话进程环境,绝不烤进共享镜像/共享文件**。我们现状(01 §7.4)是 `agent_config` 真值被 backend 推到 `~/.claude/cc-haha/providers.json` 单一文件——一旦 Bash 开放就是明文可读。

具体改动:`providers.json` 不再是全局单文件,而是**每 session 子进程拉起时由 server 注入 env(或写入仅该 session workspace 可读的临时文件,会话结束即删)**。改动触点:`conversationService.ts` 的 `Bun.spawn`(`:185-215`,加 per-session env 注入)+ `agentconfig` 推送路径(`agentconfig/service.go` `PushConfig`,从「推全局文件」改为「推内存,spawn 时注入」)。这样即便 prompt-injected 的 Bash 跑起来,`printenv`/`cat` 也只看到本会话被授权的那把 key,而非全局 LLM key + MINICOD_API_KEY。

### 3.4 横向扩展:进程内锁 → Redis 锁(解钉单实例,修 C2/C3)

这是**最便宜、收益最高、不依赖换容器运行时**的一项。两处进程内状态换 Redis:

- **displacement(C2)**:`activeWSConns sync.Map` 的「同一 agent session 防双 WS 双写」改为 Redis 锁。键沿用现有的 `displacementKey = featureKey + ":" + sessionID`(`bridge.go:74-76`,已是 per-session 不是 per-user,这个修复正确,直接复用)。用 `SETNX <key> <instanceID:wsConnID>` + 租约(`PX`)抢占,旧持有者经 pub/sub 收到 displace 通知(替代现在的进程内 `safego.Go(old.displace)`)。01 §2.6 已记 Plan B 是 Redis 锁,**这只是实现它**。
- **配额 reset(C3)**:`vip/quota.go:24-34` 的 256-shard mutex 改 `quota:reset:<uid>:<day>` 的 Redis SETNX——`quota.go` 注释**已经写明**计划用这个键,同样只是实现它。

**取舍**:Redis 锁引入「Redis 挂则锁失效」的新失败模式,但配额已 fail-open(C8)、displacement 本就是 best-effort,语义可接受。这一项让平台**第一次可以水平扩展 backend**,代价仅是两段锁代码 + Redis,不动 agent 容器、不动数据模型。**强烈建议作为 MVP 第一刀。**

### 3.5 控制面/数据面分离 + egress allowlist + per-tenant 限流

我们已经做对了一半(01 §7.2):`scholar-agent-net` 是 `internal:true`,agent 够不到 mysql/redis/minio,backend 单向可达 agent——这正是 B-multiuser 点 10「被攻破的 sandbox 够不到 orchestrator/数据面」的拓扑。**缺的是 egress allowlist 默认化与 per-tenant 限流**:

- **egress allowlist(修 C1 的横向移动面)**:egress proxy 已有 `allowlist` 模式(`FilterDefaultDeny Yes`,当前只 `deepseek.com`/`minicod.com`),但默认是 `open`(deny-list)。Modal 的模型(B-multiuser 点 3:`outbound_domain_allowlist` 只放 TLS 443+通配)是基线——**prod 默认切 allowlist**。改动触点:`egress/filter` + compose 的 egress 配置。注意 01 §7.2 自警「仅字符串匹配,DNS rebinding 可绕」,allowlist 比 deny-list 抗 rebinding。
- **per-tenant 限流(杀 noisy-neighbor)**:接已有的 `PreUserMessage` 钩子(B-multiuser 点 11)。现在 `PreUserMessage` 只做 vip 每日 token 配额(01 §2.5);加一层 per-user 并发会话数 / 每分钟请求率限流即可。改动触点:`spec.go:50-55` 的 `PreUserMessageFn` chain 加一个 rate-limit hook(这同时缓解 C7 的成本敞口——前置拦住而非 post-hoc 发现超额)。

### 3.6 买 vs 自建

01 §7.5 已记一条硬约束:**本地 Docker Desktop 的 LinuxKit kernel 跑不了 unprivileged userns**,所以 prism_tex 那样的 bubblewrap+no-net 沙箱「暂不能」,C1 的硬隔离被这条卡住。这把 §4 的进阶/完全档逼成一个真实的「买 vs 自建」决策:

- **自建(生产宿主机换内核)**:在能跑 unprivileged userns 的生产 Linux 宿主(非 Docker Desktop)上,把 claw 的 Bash 装进 bubblewrap+`network_mode:none`(复用 prism_tex 已验证的模型,01 §7.5)。**最省钱、复用现有拓扑,但要求生产环境与本地 dev 分叉**(dev 仍 LinuxKit 跑不了,只能 degrade)。
- **买(托管 microVM)**:claw 的不可信执行外包给 **e2b**(Firecracker microVM,原地 resume 保 FS+内存,B-multiuser 点 5:pause/resume 把「定时任务」便宜解决=resume→跑→pause)或 **Northflank BYOC**(学术数据留自己云,200 sandbox 比 e2b 便宜 ~5.6×,B-multiuser 扩展性小节)。**省运维、即拿 microVM 边界,但引入外部依赖 + 出网(把会话推到外部算力,与我们 internal:true 拓扑相悖,需重新设计数据面)。**

**推荐**:近期走「自建 + 生产换内核」复用 prism_tex 模型(最贴合现有架构);只有当 claw 这类不可信负载量级起来、自建 microVM 池运维不划算时,才评估 e2b/Northflank。**别为还没起量的负载买 microVM。**

---

## 4. 分期选项

### MVP(便宜的渐进,不换容器运行时,1-2 周量级)

1. **Redis 锁解单实例(C2/C3)** —— 实现 `bridge.go` displacement 与 `vip/quota.go` reset 的 Redis SETNX(两处注释已写明计划)。**收益最大、风险最低、第一刀。**改动触点:`agentbridge/bridge.go`、`agentbridge/displacement.go`、`vip/quota.go`。
2. **per-session cwd 强隔离(C5)** —— agent 容器内每 session 用非 root uid + bind-mount 绑死 `/workspace/<sid>`,`providers.json` 移出任何 session 可达路径。改动触点:`conversationService.ts`(spawn 时设 cwd/uid)、`Dockerfile`。
3. **收 Bash(C1)** —— `DEFAULT_DISALLOWED_TOOLS` 默认含 Bash,只 claw opt-in;后端 `decidePermission` 对 Bash 改为 feature-gated。改动触点:`conversationService.ts:77-97`、`agentbridge/ws.go:575-604`。
4. **egress 默认 allowlist + per-tenant 限流** —— egress prod 切 allowlist;`PreUserMessage` chain 加并发/速率限流。改动触点:`egress/filter`、`agentbridge/spec.go`。
5. **加外键(C21)** —— `agent_sessions.user_id`/`owner_id` 加 FK(或至少级联清理),修引用完整性。改动触点:新迁移 `docker/mysql/migrations/00XX_agent_sessions_fk.sql`。

**取舍**:MVP 不给 claw 任意代码真正的硬隔离(Bash 仍在共享内核 container 内跑,只是 cwd/uid 限制 + egress allowlist 兜底)。这把姿态从「软约定」抬到「OS 强制边界 + 网络层兜底」,但对 kernel 级逃逸无防护。**对当前以 MCP 只读为主、claw 量小的负载,这是合理的成本/风险点。**

### 进阶(每会话 sandbox 容器,需生产换内核)

6. **claw 的 Bash 装进 per-session bubblewrap + `network_mode:none`** —— 复用 prism_tex 验证过的模型(01 §7.5)。要求生产宿主能跑 unprivileged userns(非 Docker Desktop)。**这是 C1 的真正解药。**
7. **Workspace 工厂抽象** —— 把 agent 容器的「软 cwd 隔离」重构成 OpenHands `BaseWorkspace` 式工厂(`LocalWorkspace` 给 smart_search 廉价跑,`SandboxWorkspace` 给 claw),per-session SecretRegistry 落地(§3.3)。改动触点:agent `src/server/services/` 大改 + `agentconfig` 推送路径。

**取舍**:进阶档让 dev 与 prod 隔离能力分叉(dev LinuxKit 降级),需接受「本地测不出真沙箱行为」;运维上多一层会话级容器生命周期(冷启动 + 清理预算,B-openhands 局限)。

### 完全(microVM / 托管,起量后才评估)

8. **claw 不可信执行外包 e2b/Northflank microVM**,或自建 Firecracker 池 —— 硬件边界。**但要为 ~400 并发的 CNI/网络瓶颈预留预算**(B-multiuser:别把 VM 启动当端到端 provisioning),且重新设计数据面(外部算力 vs 我们 internal:true 拓扑)。
9. **事件溯源会话状态(顺带从 C5 升级)** —— 把不透明 jsonl 换成 OpenHands `base_state.json` + 可重放 event(B-openhands 点 1),白送崩溃恢复 + admin transcript 审计。**这是大改,与「记忆」维度的 per-session checkpoint 共用底座,应跨维度协同而非本维度单推。**

**取舍**:完全档是「彻底重做」,成本最高;只在不可信负载量级与多租户安全要求都起来后才划算。**当前不推荐**,但 §3.6 的「买 vs 自建」分叉应提前在架构上留口子(claw 的执行后端做成可替换接口,而非硬编码本容器 Bash)。

---

## 改动触点速查(本仓库)

- 锁(C2/C3):`backend/internal/agentbridge/{bridge,displacement}.go`、`backend/internal/vip/quota.go`
- Bash 收口(C1):`agent/src/server/services/conversationService.ts:77-97`、`backend/internal/agentbridge/ws.go:575-604`
- cwd/密钥隔离(C5/C1):`agent/src/server/services/conversationService.ts:185-215`、`agent/Dockerfile`、`backend/internal/agentconfig/service.go`
- egress/限流:`egress/filter`、`backend/internal/agentbridge/spec.go`(`PreUserMessageFn` chain)
- 外键(C21):新迁移 `docker/mysql/migrations/00XX_agent_sessions_fk.sql`
- 进阶沙箱(C1):`docker-compose.yml`(复用 `scholar_prism_tex` 模型给 claw)
