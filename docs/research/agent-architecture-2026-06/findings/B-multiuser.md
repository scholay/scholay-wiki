# Multi-user / multi-tenancy & isolation
> kind: dimension · confidence: high · last-checked: 2026-06

## 概述

本维度研究「agent 平台如何安全地服务多个用户」:每用户 / 每会话的 sandbox 隔离;container vs gVisor vs Firecracker microVM 的取舍;托管 sandbox 厂商(e2b / Daytona / Modal / Northflank);文件系统与密钥隔离;以及 OpenHands / Letta / Devin 这类真实平台如何隔离租户。

对标我们当前状态:**所有用户的 agent 会话 jsonl 落在 scholar_agent 容器内同一个共享文件系统上,没有真正的每会话 / 每用户隔离**。这正是 2026 年业界共识里所说的「Level 1 / 完全共享」反模式 —— 对于会执行 agent 生成代码的场景,这是不该用的底线。我们的缓解措施目前停留在「全局硬禁内建工具、只留 MCP、容器加固」(见 agent-tool-hardening),即「靠裁剪能力规避风险」,而非「靠隔离层兜底」。

核心结论(已核实):
- **共享内核的 container 不足以承载不可信代码** —— 这是明确的 2026 共识,大厂用脚投票(AWS Firecracker / Google gVisor / Azure Hyper-V)。
- 隔离强度与成本是一条连续光谱(L1 container → L5 confidential compute),应**按信任级别分级选型**,而非一刀切。
- 高并发下真正的瓶颈往往是**网络平面(CNI / 虚拟交换机)而非 VM 启动**。

## 关键架构决策

### 隔离光谱(核心决策轴)

来源 manveerc《AI Agent Sandboxing Guide》给出五级层次(强度↑ / 密度成本权衡):

| 级别 | 技术 | 边界 | 密度/成本 | 对不可信 agent 代码的结论 |
|---|---|---|---|---|
| L1 Container | Docker / runc / Podman | 共享宿主内核,namespaces + cgroups | 最便宜最快 | 仅适合**可信、内部自研代码**;"standard multi-tenant containers can't safely contain AI agents executing arbitrary code" |
| L2 用户态内核 | gVisor | 系统调用被拦截并在用户态重新实现 | 低开销、超高并发 | 强隔离,有部分 Linux 兼容性缺口 |
| L3 microVM | Firecracker / Kata / libkrun | 每个 workload 跑在 KVM 硬件虚拟化上、有自己的内核 | 较高 RAM/VM | 硬件边界,gold-standard |
| L4 Library OS | Microsoft LiteBox | app 直接链接最小 OS 库 | 实验性 | [UNVERIFIED] 成熟度/生产可用性 |
| L5 机密计算 | AMD SEV-SNP / Intel TDX / OP-TEE | 硬件加密内存,宿主 OS/hypervisor 也读不到 | 最高 | 除非有数据机密性硬需求,否则过度设计 |

明确表述(已核实):shared-kernel 隔离 "isn't cutting it anymore for executing untrusted AI agent code"。大厂选型:**"AWS built Firecracker for Lambda. Google built gVisor for Search and Gmail. Azure uses Hyper-V for ephemeral agent sandboxes."**

**隐藏的扩展陷阱(高并发关键、最反直觉的一条,已核实):** 真正卡住的是网络平面而非 VM 启动。文中引用研究称在 **~400 并发启动**时,"setting up CNI plugins and virtual switches becomes the primary bottleneck",可让 "a 125ms VM boot" 膨胀成 multi-second delay,延迟最多 **+263%**。结论:**不要把单 sandbox 启动时间等同于端到端 provisioning 时间。**

### Firecracker(microVM,硬件边界路线)

- 定位(官方):"purpose-built for creating and managing secure, multi-tenant container and function-based services",基于 Linux KVM。
- 隔离:极简设备模型 "minimal device model that excludes all non-essential functionality and reduces the attack surface area";第二道防线是 **jailer** 伴生程序("further isolated with common Linux user-space security barriers"),即便虚拟化屏障被攻破也兜一层。每个 microVM 都有**自己的内核**。
- 数字(官方,均已核实):启动 "as little as 125 ms";单 microVM 内存开销 "less than 5 MiB";单宿主 "up to 150 microVMs per second per host"。
- 成本注意:每个 VM 需要自己的内核镜像 + RAM(e2b 默认每 sandbox 1GB),高并发下是显著成本(addozhang)。

### gVisor(用户态内核,高并发路线)

- 定位(官方):Google 的「application kernel」,跑在用户态。核心保证:**"No system call is passed through directly to the host. Every supported call has an independent implementation in the Sentry"**。
- 组件:`runsc` runtime;**Sentry**(拦截并实现系统调用);**Gofer**(文件系统代理,"manages the container's filesystem and provides file descriptors to the sandbox upon request";可进一步收紧到拒绝 sandbox 直接访问文件系统、全部由 Gofer 代办;DirectFS 开启时才允许直接访问)。
- 加固(官方):"No CGo is allowed. The Sentry must be a pure Go binary";"Unsafe code is carefully controlled";"the Sentry is fuzzed continuously"。
- **明确承认的局限(重要,已核实):** "gVisor does not provide protection against hardware side channels";资源耗尽 / DoS "relies on the host resource mechanisms (cgroups)";并明确警告 **"A sandbox is not a substitute for a secure architecture"**(暴露在网络上的宿主服务依旧可被利用)。

### microVM vs gVisor 的取舍(主要对比)

两者都强于标准 container 隔离。Northflank 比较:microVM 提供 per-sandbox 的硬件级 VM 边界;gVisor 走拦截系统调用。**何时选 microVM** —— 当 agent 生成需要每次都拿到一个全新、硬件隔离的 Linux 环境的代码时;**何时选 gVisor** —— 当你需要扩展到非常高的并发时。

## 编排与子 agent

(本维度聚焦隔离;调度 / 异步见下文相应小节。)真实平台普遍采用**控制平面 / 数据平面分离**来防止被攻破的 sandbox 横向移动 —— 典型如 OpenHands 的「App service(路由/会话/DB)vs Sandbox Orchestrator(生命周期、注册存储访问点、拉起任务)」拆分(kane.mx 的 AWS Fargate 蓝图)。

## 记忆

### Letta(有状态 agent 的记忆隔离)

- **默认每 agent 隔离(已核实):** GitHub issue #2666 明确 "Memory built in one agent is **completely invisible** to all other agents -- including when starting a new session";"The local backend creates an isolated memory directory per agent ID, with no mechanism to discover, link, or load another agent's memory"。(注:该 issue 实际是在抱怨这种隔离过强 —— 新会话拿不到旧 agent 的记忆,需手动拷文件;但它恰好佐证了「默认强隔离」这一事实。)
- **共享是 opt-in 的 memory blocks(已核实):** 官方文档 —— "Shared memory blocks let multiple agents access and update the same memory";"When one agent updates the block, all others see the change immediately. This enables real-time coordination without explicit agent-to-agent messaging"。通过创建 agent 时传 `block_ids` 把同一 block 挂到多个 agent。
- **记忆分层(OS 隐喻):** core(in-context,类 RAM)/ archival(外部向量库,通过工具查询)/ recall(可搜索的对话历史)。[来源为 Letta core-concepts 文档,本轮未逐字复核该页,但与上面已核实页一致。]
- 多租户:按 `user_id` / `agent_id` / `session_id` 隔离 —— [此具体三元组表述未在已核实的两个 Letta 页面中找到,标 [UNVERIFIED];但「按 agent 隔离」已由 #2666 证实,且与 fast.io 的通用 pool/silo 模型相符]。

## 多用户与隔离

### OpenHands —— 最直接可对标的参照(CLI 风 agent → web 平台,正是我们的轨迹)

来源:论文《The OpenHands Software Agent SDK: A Composable and Extensible Foundation for Production Agents》(arXiv 2511.03690),摘要明确提到 "seamless local-to-remote execution portability"、"lifecycle control"、"event-sourcing"、"security analysis";以下细节取自全文 HTML 版(v1),均已逐字核实:

- **Workspace 抽象(工厂模式):** `BaseWorkspace` 提供 `execute_command()` / `file_upload()` / `file_download()`。
  - **LocalWorkspace** = 进程内、跑在宿主 FS 的薄包装(仅原型用 —— 即我们今天的不安全路径)。
  - **DockerWorkspace** —— **"Each agent instance runs in an independent container with a dedicated file system, environment, and resource"**,"simplifies deployment and enables SaaS-style multi-tenancy while preserving workspace isolation"。
  - **RemoteWorkspace / APIRemoteWorkspace** —— 通过 HTTP/WebSocket 委托给 Agent Server。
- **每会话密钥隔离(已核实):** SecretRegistry —— **"Each conversation maintains its own instance, ensuring strict per-session isolation"**。
- **事件溯源状态(已核实):** 元数据 "serialize to a single base_state.json file on each modification, while EventStore persists events as individual JSON files";恢复时 "loading base_state.json and replaying events from the directory, with agents automatically detecting incomplete conversations and continuing from the last processed event"。这是从我们「裸 jsonl」升级到可恢复 / 可审计状态的干净路径。
- **运行时 / 沙箱定位:** Docker 为主隔离,理由是「沙箱环境阻止恶意代码访问 / 修改宿主资源」;每任务起一个 container;`SANDBOX_NETWORK_DISABLED=true` 可断出网。[运行时具体环境变量 / FS 持久化选项(bind mounts / 命名 volume / overlay)取自 OpenHands 文档站,本轮未逐字复核该具体页,标为辅助来源。]

- **生产级多租户蓝图(AWS Fargate,kane.mx,可直接借鉴 —— 第三方博客,非官方文档):**
  - **文件系统隔离:** 每会话挂一个专用 EFS access point,root 在 `/sandbox-workspace/<conversation_id>`,POSIX uid/gid 1000 → container 够不到父目录或别人的 workspace。
  - **网络隔离:** sandbox task 只接受来自 App service 的连接 → 无 sandbox 间互通、无法访问 orchestrator API、无法绕过鉴权;每角色(ALB / App / Orchestrator / Sandbox)独立 security group。
  - **控制面拆分:** App service(路由/会话/DB)vs Sandbox Orchestrator(生命周期、注册 EFS access point、经 Cloud Map 私有 DNS 拉起 Fargate task)。
  - **用户→算力映射:** DynamoDB 存 `conversation_id → Fargate task ARN + status(RUNNING/PAUSED)`,靠共享 EFS 在 task 替换后仍能续。
  - **边缘鉴权:** CloudFront / Lambda@Edge 在任何内部服务之前先认。

### Devin —— 全云、每任务 ephemeral VM [仅二手来源]

二手来源称每个实例一个 "isolated virtual machine"("ephemeral cloud VM with its own browser, code editor, terminal, and planner";多个并行 Devin 各自一台 VM)。**[UNVERIFIED]:未找到 Cognition 官方隔离文档,具体 VM / hypervisor 技术不确定。**

### 通用多租户模式(设计指南,fast.io —— 厂商博客,设计参考)

三种模型:
- **Silo**(每租户独立基建:独立向量库 + 桶)—— 安全最高、成本最高。
- **Pool**(共享,靠 `tenant_id` 过滤)—— 最便宜,但「实现 bug 导致越权的风险更高」(漏一个 `tenant_id` 过滤就跨租户泄漏)。
- **Hybrid / namespace**(「现代平台的标准做法」)—— 共享基建 + 逻辑分区(向量库 namespace / FS workspace)。

建议:文件按 workspace-per-tenant(入库打 tag、检索按 tag 过滤);"Stamp every vector with `tenant_id` and require a filter on every query";noisy-neighbor 靠租户级严格限流 / 配额缓解;身份在工具调用间传播、工具权限限定到租户目录、审计日志绑租户 ID。

## 扩展性

- **microVM RAM 成本:** ~1GB/sandbox 默认(e2b)使高并发昂贵;gVisor 密度更高但有 Linux 兼容性缺口。
- **网络才是真正的扩展悬崖:** ~400 并发启动时 CNI/虚拟交换机成瓶颈、延迟 +263%(见上)。必须规划 CNI / warm-pool 策略。
- **冷启动缓解:** pre-warmed pool + memory snapshot 可把会话启动压到 ~150ms 而非冷启动(addozhang)。
- **托管厂商成本对比(Northflank,200 sandboxes;厂商自published,有偏向,标注为唯一找到的具体定价矩阵):** PaaS 下 Northflank $7,200 / e2b $16,819 / Modal $24,491;BYOC 下 Northflank $2,060 vs e2b $11,500。Northflank 卖点是 self-serve BYOC 覆盖 AWS/GCP/Azure/Oracle/Civo/CoreWeave/on-prem,广于 e2b(AWS only、enterprise only),端到端创建 1-2 秒。

## 调度与异步

### 托管 sandbox 厂商(算力层)

**e2b —— Firecracker microVM**
- 定位:让 agent 安全执行代码的隔离 sandbox;每个 sandbox 是「自己的 VM、独立内核」(Northflank)。
- 生命周期:创建带 timeout,`setTimeout`/`kill`;连续运行上限 Pro 24h / Base 1h;**pause 会重置运行时窗口** → 定期 pause 即可无限在线。[生命周期具体上限取自 e2b docs/sandbox 页,本轮未逐字复核该页。]
- **持久化(关键能力,已核实):** pause/resume 同时保留**文件系统与内存** —— pause "includes not only state of the sandbox's filesystem but also the sandbox's memory. This means all running processes, loaded variables, data, etc." 被保留;**"Paused sandboxes are kept indefinitely — there is no automatic deletion or time-to-live limit"**;pause ≈ **"4 seconds per 1 GiB of RAM"**,resume ≈ **"1 second"**。
- 冷启动:warm pool + memory snapshot → 恢复 "~150ms"(addozhang)。
- 环境变量 / 密钥:支持全局(创建时,贯穿 sandbox)、运行时、命令级;[「runtime 变量在 OS 内不私密」这一警告本轮未在已核实页面逐字确认,标 [UNVERIFIED];但 e2b 文档确实未给出密钥处理最佳实践规约]。

**Modal —— gVisor「secure containers」**
- 定位:执行不可信用户/agent 代码的 secure containers,基于 gVisor;声称 "50,000+ concurrent sessions"(Modal 博客,厂商口径)。
- 生命周期:Created→Scheduled→Started→Ready→Finished;`create/exec/terminate/detach`;默认 timeout 5min,最大 24h。[取自 Modal docs/sandbox 页,本轮未逐字复核。]
- **网络(文档最完善的 egress 模型,已核实):** **inbound secure-by-default** —— "a default Sandbox has no ability to accept incoming network connections or access your Modal resources";但 **outbound 默认放行** —— "By default, Sandboxes can make outbound connections to any public IP address"。控制项(均已核实):`block_network=True`("Drops all outbound traffic")、`outbound_cidr_allowlist`(按 CIDR,任意协议)、`outbound_domain_allowlist`(只放 TLS 443,支持通配 `*.example.com`)、`inbound_cidr_allowlist`(限制 inbound)。
- 持久化:Filesystem Snapshots 保存+恢复 FS 与内存,但**恢复是「从快照新建一个 sandbox」而非原地 resume**(对比 e2b 的原地 resume;Northflank)。密钥经 `modal.Secret.from_dict()` 注入 env。

**Daytona —— OCI/Docker container(营销「dedicated kernel」)**
- 定位:营销称「完整的可组合计算机……完全隔离、专用内核、文件系统、网络栈」,经 warm pool / 默认 snapshot 实现 "under 90ms"。
- **谨慎 / 部分 [UNVERIFIED — 二手来源]:** 尽管打「dedicated kernel」,多份比较称 Daytona 实际用 **Docker container(共享内核)** 换速度,而非真 microVM。对其「dedicated kernel」宣称应存疑。Daytona **官方文档(已核实)** 把 snapshot 定义为 "reusable sandbox templates built from Docker or OCI compatible images" + 一个 Declarative Builder(代码优先定义依赖),**并未记录内存/进程状态的 resume** —— 文档只覆盖镜像/模板型快照,不保留运行中进程或内存。即:其「dedicated kernel」营销词 vs 官方文档的「OCI 镜像模板」存在张力,不可信任其用于不可信代码执行,需先核。

**Northflank —— BYOC + 成本角度**:见上「扩展性」小节。

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **采用 OpenHands 的 Workspace 工厂 + Agent Server 拆分。** 我们今天的 daemon ≈ 它的 LocalWorkspace(进程内、宿主 FS —— 不安全路径)。迁到 `RemoteWorkspace` 式的 HTTP/WS 边界,**每会话 / 每 conversation 起一个 sandbox**,agent 代码与控制面隔离。这能干净地映射到我们已有的 `agentbridge`(user↔session)+ agent 容器模型 —— 把「共享 FS jsonl」换成「每会话 sandbox」。
2. **每会话文件系统隔离 = 每 conversation 一个 root。** 抄 EFS access-point 模式:每会话 root 在 `/workspace/<session_id>`、非 root uid、够不到兄弟和父目录。直接修我们「单一共享文件系统」的缺口。
3. **网络:secure-by-default + egress allowlist。** 默认拒绝 inbound;出网只放到我们的 Minicod MCP / 已知学术 API(Modal 的 `outbound_domain_allowlist` 模型)。对任何能跑代码的 agent 一律 untrusted-by-default。(对标我们的 egress 明文 SSRF 历史风险。)
4. **按信任级别选隔离,别一刀切。** 若 agent 只调 MCP 工具(无任意代码执行,即我们当前形态)→ gVisor / container 可辩护;若跑任意 Python/Bash → microVM(Firecracker via e2b / 自托管)是 2026 基线。
5. **pause/resume 兼顾成本与「常在线」体感。** e2b 式 pause 保 FS+内存、无 TTL,给长生命周期的每用户 agent 而不为闲置算力买单,且**重置运行时上限**。把「无长期记忆 / 定时任务」便宜地解决:一个定时任务 = resume → 跑 → pause。
6. **warm pool + memory snapshot** 把会话启动压到 ~150ms;但要为 **~400 并发的 CNI/网络瓶颈**预留预算。
7. **事件溯源会话状态**(base_state.json + 可重放 event 文件)替代不透明 jsonl → 可恢复、可检视,顺带白送 admin transcript 查看(对标我们已有的 admin-session-monitor)。
8. **密钥隔离 = 每 conversation 一个实例,绝不全局。** 上游 API key 每 sandbox 运行时注入,绝不烤进共享镜像。
9. **长期记忆 = Letta 的 namespace/blocks 模型:** 默认按 `user_id`/`agent_id` 隔离;向量按 tenant 打戳并强制过滤;仅在需要跨会话连续性处 opt-in 共享 block。用 Letta 三层(core/recall/archival)作记忆心智模型。
10. **控制面 / 数据面分离 + 边缘鉴权 + per-role security group**,让被攻破的 sandbox 够不到 orchestrator、别的 sandbox,也绕不过鉴权。
11. **每租户限流 / 配额**杀 noisy-neighbor —— 正好接我们已有的 `agentbridge` PreUserMessage 配额钩子。
12. **买 vs 自建:** 自托管 Firecracker 太重时,e2b(microVM、原地 resume)或 Northflank BYOC(学术数据留在自己云、规模化更便宜)是可信的托管路线。

## 局限

- **container 不足以承载不可信代码** —— 明确 2026 共识;我们当前的共享 FS / 共享内核模型正是被点名的反模式。
- **microVM RAM 成本** —— e2b 默认 ~1GB/sandbox 使高并发昂贵;gVisor 密度高但有 Linux 兼容性缺口。
- **gVisor 不防侧信道、不防资源耗尽**(靠宿主 cgroups),且「不是安全架构的替代品」。
- **网络是真正的扩展悬崖**(~400 并发、+263% 延迟)—— 需规划 CNI / warm-pool。
- **出网默认放行**(Modal 默认 outbound permissive;e2b 未给密钥处理规约)意味着 egress allowlist + 密钥卫生是**你的**责任,不是厂商的。
- **快照语义不同:** e2b 原地 resume 同一 sandbox;Modal 恢复 fork 一个新 sandbox —— 影响身份 / 长期记忆连续性假设。
- **Daytona「dedicated kernel」宣称有争议** —— 大概率底层是 container [二手来源];用于不可信执行前需核。其官方文档只记录镜像/模板型快照,不记录内存/进程 resume。
- **Pool 模型的逻辑隔离 = 实现 bug 带来的越权风险**(漏一个 `tenant_id` 过滤即跨租户泄漏)—— 敏感数据优先 namespace/hybrid 或 silo。
- **[UNVERIFIED]:** Devin 的具体 VM/hypervisor 技术(无 Cognition 官方文档);Northflank 成本矩阵为厂商自published;Letta「按 `user_id`/`agent_id`/`session_id` 三元组」表述未在已核实页面找到;e2b「runtime env 在 OS 内不私密」、e2b/Modal 生命周期具体上限、OpenHands 运行时具体环境变量/FS 选项均取自未逐字复核的文档页(标辅助来源);LiteBox(L4)成熟度。

## Sources

- https://firecracker-microvm.github.io  (已核实:purpose / jailer / 125ms / <5MiB / 150 microVMs/s)
- https://gvisor.dev/docs/architecture_guide/security/  (已核实:no syscall passthrough / Sentry / Gofer+DirectFS / no CGo / 侧信道与 cgroups 局限 / "not a substitute for a secure architecture")
- https://arxiv.org/abs/2511.03690  (摘要已核实:title / local-to-remote / lifecycle / event-sourcing / security analysis)
- https://arxiv.org/html/2511.03690v1  (全文已核实:Docker/Local/Remote Workspace / SaaS multi-tenancy / per-session SecretRegistry / base_state.json + replay events)
- https://docs.openhands.dev/usage/architecture/runtime  (辅助:runtime/sandbox 定位、FS 持久化选项)
- https://kane.mx/posts/2026/serverless-multi-tenant-openhands-on-aws/  (第三方博客:AWS Fargate 多租户蓝图、EFS access point、控制面拆分)
- https://e2b.dev/docs  ·  https://e2b.dev/docs/sandbox  ·  https://e2b.dev/docs/sandbox/persistence  (persistence 页已核实:FS+内存 / indefinitely no TTL / 4s per 1GiB / resume ~1s)  ·  https://e2b.dev/docs/sandbox/environment-variables
- https://modal.com/docs/guide/sandbox  ·  https://modal.com/docs/guide/sandbox-networking  (networking 页已核实:inbound secure-by-default / outbound 默认放行 / block_network / outbound_cidr_allowlist / outbound_domain_allowlist 443+通配 / inbound_cidr_allowlist)  ·  https://modal.com/resources/best-code-execution-sandboxes-coding-agents
- https://www.daytona.io/docs  ·  https://www.daytona.io/docs/snapshots  (已核实:snapshot = OCI/Docker 镜像模板 + Declarative Builder,无内存/进程 resume)
- https://northflank.com/blog/e2b-vs-modal  ·  https://northflank.com/blog/daytona-vs-e2b-ai-code-execution-sandboxes  (厂商博客:microVM vs gVisor 取舍、成本矩阵、快照语义差异、Daytona 争议)
- https://manveerc.substack.com/p/ai-agent-sandboxing-guide  (已核实:L1-L5 层次 / 大厂选型 / ~400 并发 CNI 瓶颈 +263% / 不可信代码不能用共享内核 container)
- https://addozhang.medium.com/ai-agent-code-execution-sandboxes-isolation-from-containers-to-microvms-e80848effea5  (二手综述:1GB/sandbox 成本、~150ms warm pool 恢复)
- https://docs.letta.com/guides/agents/multi-agent-shared-memory  (已核实:shared blocks / 即时传播 / block_ids)  ·  https://docs.letta.com/guides/core-concepts/stateful-agents  ·  https://github.com/letta-ai/letta-code/issues/2666  (已核实:每 agent 记忆默认完全不可见 / per-agent-ID 隔离目录)
- https://fast.io/resources/ai-agent-multi-tenant-architecture/  (厂商设计指南:Silo/Pool/Hybrid、tenant_id 打戳过滤、noisy-neighbor 配额)
- https://medium.com/@takafumi.endo/agent-native-development-a-deep-dive-into-devin-2-0s-technical-design-3451587d23c0  ·  https://lapu.ai/compare/devin  (二手,Devin VM 技术 [UNVERIFIED])
- https://www.morphllm.com/comparisons/daytona-alternative  (二手,Daytona 隔离模型争议)
