> 维度文档 · 基于 01-current-architecture.md + findings/ · 2026-06

# 08 · 安全与沙箱 (Security & Sandboxing)

> 决策提案。前提:agent 是桌面 Claude-Code CLI(cc-haha)套 HTTP+WS daemon,被 `agentbridge` 适配成多租户 Web。
> 桌面 CLI 的根本假设是「机器=机主一个人的,shell 与文件系统可信」。Scholay 把它原样搬上多租户 Web,
> 安全姿态因此退化为「网络层缓解 + 软约定」而非「代码层硬隔离」(01 §8.2)。本文只论安全/沙箱维度,
> 沙箱选型与 microVM 经济性见 06(多用户)、审批 UI 见 07(HumanInterrupt),记忆投毒治理见 09(记忆)。

---

## 1. Landscape:这个领域 2026 已收敛到的几条公理

把 findings 里反复互证的认知当设计公理,不再展开论证:

- **权限模型 = ask / allow / deny + allowlist,fail-closed。** Claude Code 的参考设计:默认只读;改系统的 Bash 需显式批准;一组内建只读命令(`ls`/`cat`/`git status`)无提示;per-user/codebase/org allowlist 抗 prompt fatigue;**未匹配命令默认要人批**;**可疑 bash 命令即便在 allowlist 也要人批**;写入只能落启动目录及子目录(B-security)。Codex 把它正交成**两轴**:`sandbox_mode`(进程能碰什么,OS 强制)× `approval_policy`(何时问人),原文 "The sandbox defines technical boundaries. The approval policy decides when Codex must stop and ask before crossing them."(B-security)。

- **prompt injection 在模型层架构性无解。** Willison/Meta/OWASP 三方独立互证(B-security)。模型 "will happily follow *any* instructions that make it to the model",无法可靠按来源区分指令重要性;别把"95% 拦截率"的 guardrail 当主防线 —— 安全必须来自**约束能力(capability)**,做到 OS/网络/凭据架构层。

- **Lethal Trifecta(Willison)= 私有数据 + 不可信内容 + 外泄通道,三者凑齐即危险。** 唯一可靠缓解是永远不要凑齐三者。可操作化版本是 **Meta Agents Rule of Two**:一个 session 内三属性([A]不可信输入 / [B]敏感数据 / [C]改状态或外泄)**最多满足 2 个**;若三者都要,则 agent **不得自主运行,至少需 human-in-the-loop 审批**;一个 fresh context window 能重置 A→B→C 利用链(B-security)。OWASP 把 prompt injection 映射到其 Agentic Top 10 的 6/10(B-security)。

- **沙箱技术栈是一条连续光谱,按信任级别选型而非一刀切。** 进程级 OS 沙箱(macOS Seatbelt / Linux bubblewrap+seccomp-BPF,Anthropic `sandbox-runtime`/`srt` 可包裹任意进程;Codex Linux 用 bubblewrap 非 Landlock)→ 用户态内核 gVisor(syscall 不直通宿主,I/O 负载 10–30% 开销)→ microVM Firecracker/Kata(每 workload 独立内核,启动 ~125ms、<5MiB/VM、~150 VM/s/host)→ 机密计算(B-security/B-multiuser)。**2026 明确共识:共享内核的标准容器不足以承载不可信代码**(AWS 为 Lambda 造 Firecracker、Google 为 Search/Gmail 造 gVisor、Azure 用 Hyper-V),对任意代码执行 microVM 是基线,对 MCP-only(无任意代码)gVisor/container 可辩护(B-multiuser)。

- **凭据 broker / 出网代理是 SSRF+外泄的咽喉。** "if an agent can't be trusted with credentials, it shouldn't have them" —— agent 不持原始密钥,sidecar/vault 经 HTTP CONNECT 隧道注入 per-session scoped 凭据,代理**自己解析 DNS 并扫 hostname 找凭据模式**、封私网段/云元数据 `169.254.169.254`/link-local、做 DNS rebinding 防护("resolve the hostname, verify the IP, then connect")(B-security)。

- **被存储/被召回/被调度的任务体也是注入面。** Hermes 的 **Promptware Defense**(v0.15.0 确认)对**工具输出、被召回的记忆、存储的技能**做注入扫描(~15 个 Brainworm/C2 模式)(B-hermes)。引入长期记忆后,memory poisoning 是 OWASP 命名的 agentic 威胁,写记忆要当作状态变更 [C] 受 Rule-of-Two 约束(B-security)。

- **CVE 类教训:沙箱不能让被攻陷的 agent 重定义自己的边界。** CVE-2025-59532(Codex:agent 输出可重定义自身沙箱边界)、CVE-2026-22708(Cursor:毒化执行环境让 allowlisted 的 `git branch` 投递任意 payload);针对性防御 = 沙箱在每个 scope **OS 级写保护自己的 settings.json**(B-security)。

---

## 2. 我们的现状:已有不少纵深防御,但有几处确定性绕过点

**先肯定已有的。** 01 §7 显示团队已经做了远超"裸跑 CLI"的纵深防御,这是真实资产,不要在重构里丢掉:

- **三容器协作 + 数据面够不到**(01 §7.2):`scholar-agent-net` 是 `internal: true`(无 NAT/公网路由),agent 在此网够不到 mysql/redis/minio;backend 横跨两网**单向**可达 agent —— "即便 agent 被攻陷也够不到数据面"。
- **唯一出网口 + SSRF 基线**(01 §7.2):agent 强制 `HTTPS_PROXY=scholar_egress_proxy:3128`(tinyproxy),`ConnectPort 443` only;deny 基线含云元数据(`169.254.169.254`/`100.100.100.200`)、RFC1918、loopback、compose 服务名;支持 `open`(默认 deny-list)/`allowlist`(`FilterDefaultDeny Yes`,prod 推荐)两模式。
- **容器加固**(01 §7.2):agent/egress/prism_tex 全 `cap_drop: ALL` + `no-new-privileges`;agent 限 `1.5G/2cpu/512pids`(fork-bomb 防护)。
- **工具三层 union denylist**(01 §7.1):Layer A 全局 `DEFAULT_DISALLOWED_TOOLS`(`conversationService.ts:77-97`)+ Layer B per-feature(prism `Bash,NotebookEdit,Task,Agent`)+ Layer C 后端权限门(`ws.go:575-604`,每个 tool_use 裁决,文件工具走 `pathWithin(p, sessionWorkDir)`)。
- **per-session cwd 隔离**(01 §5.4):每会话 `~/sessions/<id>`(`SCHOLAY_ISOLATE_SESSIONS`),Read/Glob/Grep 限于子树。
- **prism_tex 硬沙箱**(01 §7.5):`network_mode: none` air-gapped + `read_only` rootfs + `/tmp` tmpfs + `user:1001:1001` + `cap_drop:ALL` + `COMPILE_TIMEOUT` —— 这是平台**已经存在的**"硬隔离能跑起来"的范本。
- **ws-ticket fail-closed authn**(01 §2.4):`crypto/rand` 32 字节、Redis persist pool TTL 30s、GETDEL 一次性消费、跨 feature 守卫、消费后再校验 `sid==pathSessionID`;裸 JWT 回落已移除。
- **输出脱敏雏形**:agent 侧 `redactProcessOutput`(01 §3.5)。

**这是"检测 + 网络层缓解"的姿态,不是"代码层硬隔离"(01 §8.2 自评)。** 下面是确定性绕过点 —— 不是"理论风险",而是**当前架构里可被一次成功的 prompt injection 直接利用**的缝:

| 缺口 | 现状/证据 | 后果 | 妥协 |
|---|---|---|---|
| **Bash 绕过所有路径门** | `ws.go:579-585` allow Bash/BashOutput/KillShell,显式注"无法路径限制";路径感知 approve 只守 Read/Glob/Grep | 被注入的模型可 `cat ~/.claude/cc-haha/providers.json`(**真 LLM key**)、`printenv MINICOD_API_KEY`、`cat` 他人 jsonl(01 §7.4 团队已记录) | **C1** [高] |
| **in-band prompt 注入可伪造** | 系统规则以文本标记 `[AGENT BRIDGE — STRICT RULES…]` prepend 进用户 `content`(`ws.go:504-510`),非独立 system role | 精心构造的用户消息含同一结束标记即可伪造规则边界、解除约束 —— 标准 in-band injection 敞口 | **C9** [中] |
| **共享 FS 遍历** | 全用户 transcript 在单容器单 `~/.claude/projects/.../<sid>.jsonl`,隔离=随机 sid + cwd 软约定;`SCHOLAY_ISOLATE_SESSIONS=0` 直接塌成共享 cwd | 经 C1 的 Bash 越过 cwd 即可读任意用户 jsonl(私有学术数据 + 对话) | **C5** [高] |
| **Trusted ws-ticket 后门** | prism `IssueWSTicketTrusted`(`ws_round.go:47-56`)**跳过 OwnsSession** 归属校验,降级是 warning | 任何忘记自校验归属的未来调用方 = 跨用户会话劫持 | **C12** [中] |
| **CheckOrigin 恒 true** | `ws.go:43-47` 无 WS origin 白名单,CSWSH 防护全委托 nginx 同源 + ws-ticket | 层内零防护(影响被有效 ticket 约束,但缺纵深防御层) | **C16** [低] |
| **egress 仅字符串匹配** | SSRF deny 基线"仅字符串匹配,DNS rebinding 可绕"(01 §7.2 文件自警);tinyproxy 不做 TLS 终结 | DNS rebinding / domain fronting 可绕 hostname 过滤到达 allowlist 外主机 | (01 已记) |
| **被存储/调度任务体无注入扫描** | 当前无长期记忆/技能/任务板,但 north-star 要引入(09/10);bridge 无扫描钩子 | 一旦引入,被召回记忆/被存技能/被调度任务体成**持久化**注入向量(memory poisoning) | 衔接 C4 |

> **运行时需确认的地图冲突**(01 §7.1):`ws.go:590-591` 注释仍称 Task/Agent 全禁,但 `conversationService.ts:65-68` 称已重开(无头 `--print` 下子 agent 同步跑、工具调用会回 `decidePermission`)。注释相对决定陈旧,实际 Task/Agent 事实 allow。这意味着子 agent 的 Bash 同样继承 C1 的绕过 —— 与 B-security "subagents 沿父 session 沙箱继承"对照,我们的子 agent 沿父 session **继承的是缺失的沙箱**。

---

## 3. Lethal-Trifecta 分析:我们三角齐活,必须按维度断链

把 Rule-of-Two 三属性映射到 Scholay 的 agent(B-security 第 1 条"值得借鉴"已点名):

- **[A] 不可信输入**:`mcp__minicod__*` 返回的学术检索结果、WebFetch/WebSearch 抓回的网页、claw 上传的用户文件、(未来)被召回的记忆/技能/任务体。**这些是攻击者可控文本。**
- **[B] 敏感/私有数据**:`providers.json` 真 LLM key、`MINICOD_API_KEY`、他人 jsonl(私有学术数据 + 全部对话)、prism DB 正文。
- **[C] 外泄/改状态通道**:Bash(`curl` via 默认环境)、WebFetch、MinIO artifact 写出、(未来)写记忆/写技能。

**三者在同一个 session 内同时齐活 = 完整 lethal trifecta。** 一次成功注入(例如一篇恶意论文摘要里藏指令)即可:让模型 `cat providers.json`(命中 [B]),再 `curl` 外带或塞进 WebFetch URL(命中 [C])。C1+C5 让这条链**没有任何代码层闸门**,只有"egress proxy 只放 443 + allowlist"在网络层兜底,而 egress 又可被 DNS rebinding 绕(01 §7.2)。

**按维度断链(每条对应一个具体改动,不是口号):**

1. **断 [C] 的 Bash 旁路(本维度核心,治 C1)**:Bash 要么移进 OS 沙箱(FS+网络边界在模型决策之下强制),要么按 feature 关掉,要么审批化。最便宜的即时止血是**生产把 Bash 从 Layer A 重新移回 denylist**(只 office 转换 feature 才 union 回来),因为多数 feature(smart_search/peerreview 只读)根本不需要 Bash。
2. **断 [B] 的可达性(治 C5/C1 协同)**:把真 key 从 agent 可读的文件系统拿走 —— 凭据 broker 模式(§4),agent 不持 `providers.json` 原文。per-session 硬隔离让"他人 jsonl"物理不可达。
3. **断 [A]→特权 loop 的传导(治 C9 + 不可信抓取)**:out-of-band system prompt(§4)+ 不可信抓取用隔离 context window(B-security:"Web fetch uses a separate context window")。
4. **当三者实在拆不开 → 上 HITL 审批**(Rule-of-Two 兜底,衔接 07):高危工具不再 auto-approve,改 HumanInterrupt 审批卡。

> 注:Rule-of-Two 是必要不充分(Meta 强调仍需纵深防御),所以上面四条要叠加,不是择一。

---

## 4. 目标设计(按 C 编号组织,每条给改动触点)

### 4.1 收紧 Bash + egress allowlist + per-session 密钥隔离(C1)

- **生产 Bash 收口**:`conversationService.ts:77-97` 的 `DEFAULT_DISALLOWED_TOOLS` 在 prod 重新含 `Bash/BashOutput/KillShell`,只对真正需要 shell 的 feature(office 转换)在 per-feature `SessionOptions.AllowedTools`/`AddDirs` 路径 union 回来。代价:office 转换暂时退化或走专用沙箱容器。
- **后端权限门给 Bash 加判定(治 C1 在 Layer C)**:`ws.go:575-604` 的 `decidePermission` 当前对 `Bash*` 无条件 allow;改为对 Bash **默认拒**,仅放行一组固定白名单只读命令(对标 Claude Code 的 `ls/cat/git status` + Accept-Edits 的 `mkdir/touch/mv/cp/sed` 限工作目录),其余进审批(§4.2)。注意 B-security 警示:hostname/命令字符串匹配可被绕,这只是过渡,真隔离靠 OS 边界。
- **egress 切 allowlist + 抗 DNS rebinding**:prod 默认 `FilterDefaultDeny Yes`(01 §7.2 已支持但"当前只 deepseek.com/minicod.com"),并升级 egress 代理:**自己解析 DNS、verify IP 不在私网/元数据段、再 connect**(B-security 的 "resolve → verify → connect")。彻底防 domain fronting 需 TLS 终结 MITM 代理 + 注入 CA(B-security 明示代价是 CA 运维),建议**列为 prod 加固选项而非默认**。改动触点:`egress/{filter,filter-deny-internal,tinyproxy.base.conf,entrypoint.sh}`。
- **per-session 密钥隔离(衔接 05/06)**:`providers.json` 不再以可读文件形式存在 agent 容器 —— 引入凭据 broker:egress proxy 升级为"strip agent 附带的任何凭据、从加密存储注入正确 per-session scoped 凭据"(B-security Infisical Agent Vault 模式),CONNECT 握手时用 session token 把每个请求 scope 到具体 agent context。这把 01 §7.4 记录的"被注入即可 cat 真 key"从根上消除。`MINICOD_API_KEY` 同理不再 boot 烤进 env(01 §5.2),改 broker 注入。

### 4.2 审批化高危工具替代 auto-approve(C14,衔接 07)

- **拆掉单 bool 的语义分裂(治 C14)**:`AutoApprovePermission bool` 对 smart_search=「approve 一切只读 MCP」、对 prism/claw=「路径感知 decidePermission」——同一 `true` 三种含义(01 §8.1 C14)。对标 Codex 两轴:把 `FeatureSpec` 的单 bool 拆成 `SandboxMode`(OS 强制边界,衔接 §4.5)× `ApprovalPolicy`(`auto`/`on-escalation`/`always`)两个正交字段。改动触点:`agentbridge/spec.go`(新字段)+ `ws.go`(`decidePermission` 读两轴)。
- **高危工具走 HumanInterrupt(衔接 07)**:Bash 越界、首次 WebFetch 到新域、(未来)写记忆/写技能/调度任务 → 不再 auto-approve,而是发审批卡给前端,用户 approve 才执行。这正是 Rule-of-Two "三角拆不开就上 HITL" 的落地。当前 `permission_request` 在用户 feature 后端直接 auto-approve、前端不 fold(01 §6.2),需打通这条链 —— 这是 07 的主战场,本维度只标依赖。
- **注意 B-security 的"非交互 -p 模式信任校验被关闭"**:我们 100% 服务端非交互跑 agent,首次信任确认这层默认失效,所以审批化不是可选项而是补这层缺失的唯一途径。

### 4.3 out-of-band system prompt(C9)

- **首选**:若 agent 协议支持真 system role,把 `buildInjectionPrefix`(`ws.go:504-510`)的 `[AGENT BRIDGE — STRICT RULES]` 从 prepend 进用户 `content` 改为**独立 system 消息**,in-band 伪造结束标记即失效。改动触点:`agentbridge/ws.go` 注入路径 + agent `ws/handler.ts` 协议层是否暴露 system slot(需运行时确认 cc-haha 的 stream-json 是否支持)。
- **退路(协议不支持时)**:更强的边界标记(随机 nonce 包裹,用户无法预测)+ 输入消毒(剥离用户 content 里任何形如 `[AGENT BRIDGE …]` 的伪标记)。结合 Hermes 的 frozen-snapshot 思路(B-hermes:session 开始冻结系统提示词,prefix-cache 友好),把系统约束做成 session 级冻结而非每帧临拼,既治 C9 又省 token(09 会接这条)。

### 4.4 对被召回记忆/被存技能/被调度任务体做注入扫描(衔接 09/10)

- north-star 要引入两层记忆(09)+ Kanban 任务板(10)。一旦引入,**写入路径必须当状态变更 [C] 处理**,执行前过注入扫描 —— 这是 Hermes Promptware Defense 的模式(B-hermes:对工具输出/被召回记忆/存储技能扫 ~15 个 Brainworm/C2 模式)。
- **改动触点(前瞻,给 09/10 留钩子)**:在 `agentbridge` 加 `ScanUntrustedContent(text) error` 钩子,挂在三处:(a) 记忆注入前(09 的 memory_20250818 handler 回读 per-user block 后);(b) 技能加载前(`agent/src/skills` loadSkillsDir);(c) Kanban 任务 dispatch claim 后、spawn 前(10 的 dispatcher)。扫描失败 → fail-closed 拒绝注入/执行(对标 01 §2.7 picker 失败 fail-closed 的既有纪律)。

### 4.5 发 LLM 前 secret/PII 脱敏 + Trusted 后门收口(C12)

- **脱敏**:agent 侧已有 `redactProcessOutput`(01 §3.5);扩成"发 LLM 前统一脱敏层",对工具输出/上传文件/检索结果扫 secret 模式(LLM key 形态、`sk-`/`****` 等)与 PII。注意 **C22**:`agentconfig/handler.go:54` 现以"内容含 `****`"判掩码,真 key 含 `****` 会被静默丢 —— 脱敏改造时一并把掩码从"内容启发式"改为"显式 sentinel 字段"(对标 admin secret-input 的成熟做法)。
- **Trusted 后门收口(治 C12)**:`IssueWSTicketTrusted`(`ws_round.go:47-56`)跳 OwnsSession 是显式技术债。改为**强制归属校验** —— prism 的 per-project 归属在 `prism_projects.agent_session_id`,让 Trusted 路径也走一个"按 owner_kind/owner_id 校验 caller 拥有该实体"的硬检查(`OwnsSession` 的实体级变体),把"降级是 warning"升级为"不通过即 401"。改动触点:`prism/ws_round.go` + `agentbridge/wstoken.go`(暴露实体级归属校验原语)。

### 4.6 沙箱路线:本地跑不了 bubblewrap,给出替代(治 C1/C5 的硬隔离层)

- **约束(01 §7.5 已记)**:本地 Docker Desktop 的 LinuxKit kernel 跑不了 unprivileged userns → bubblewrap 暂不可用。这是为什么 prism_tex 用 `network_mode:none` 而非 bubblewrap、为什么 Bash 至今没被包进沙箱(01 §7.4 "接受的缓解是未来 bubblewrap,不是权限门")。
- **替代路线(按信任级别分级,B-security/B-multiuser)**:
  1. **MCP-only feature(smart_search/peerreview,无任意代码)**:gVisor / 加固容器可辩护 —— 当前形态可先停在这一档,优先把 Bash 关掉(§4.1)让多数 feature 落入 MCP-only。
  2. **要 Bash/任意代码的 feature(office 转换、未来)**:microVM 是 2026 多租户基线。两条具体路:(a) **生产宿主机换内核**(裸金属 / 支持 unprivileged userns 的 Linux),解锁 bubblewrap + seccomp(对标 Anthropic `srt` 可包裹任意进程,不必绑死 CLI);(b) **托管 microVM**(e2b Firecracker / Northflank BYOC,B-multiuser),per-session 一个硬件隔离环境,顺带拿到 §4.1 的密钥每 session 注入 + per-session FS 隔离(直接消灭 C5)。
  3. **prism_tex 已是范本**:把它的 `network_mode:none + read_only + 非 root + cap_drop:ALL` 模式推广给任何需要执行不可信代码的 feature 容器(短期、不换内核也能做到的最强档)。
- **CVE 教训落地**:无论哪条路线,沙箱必须 OS 级写保护 agent 自己的策略文件(providers.json / settings / denylist),防 CVE-2025-59532 类"agent 输出重定义自身边界"。

---

## 5. 分期选项 + 取舍 + 改动触点

### Phase MVP —— 止血(便宜、渐进,不换内核)

| 动作 | 治 | 改动触点 |
|---|---|---|
| 生产 Bash 移回 Layer A denylist,只 office feature union 回来 | C1 | `agent/src/server/services/conversationService.ts:77-97` |
| 后端权限门 Bash 默认拒 + 只读白名单 | C1 | `agentbridge/ws.go:575-604` (`decidePermission`) |
| egress prod 默认 allowlist + DNS resolve→verify→connect | (01 SSRF) | `egress/{filter,filter-deny-internal,entrypoint.sh}` |
| Trusted 后门改强制实体归属校验 | C12 | `prism/ws_round.go:47-56` + `agentbridge/wstoken.go` |
| CheckOrigin 加 WS origin 白名单(纵深) | C16 | `agentbridge/ws.go:43-47` |
| api_key 掩码从内容启发式改显式 sentinel | C22 | `agentconfig/handler.go:54` |

**取舍**:不动 agent 进程模型、不换内核,1-2 周可落;但仍是"网络层 + 权限门"缓解,Bash-in-sandbox 的硬边界没补;office 转换暂退化。**这是把 lethal trifecta 从"无闸门"降到"有闸门但可绕",显著但非根治。**

### Phase 进阶 —— 审批化 + 注入扫描 + 脱敏

| 动作 | 治 | 改动触点 |
|---|---|---|
| `AutoApprovePermission` 单 bool 拆 `SandboxMode × ApprovalPolicy` 两轴 | C14 | `agentbridge/spec.go` + `ws.go` |
| 高危工具走 HumanInterrupt 审批(打通 permission_request→前端) | C1/Rule-of-Two | 07 主战场;本维度提供 `decidePermission` 升级点 |
| out-of-band system prompt 或 nonce 边界 + 输入消毒 | C9 | `agentbridge/ws.go:504-510` + agent `ws/handler.ts` 协议 |
| `ScanUntrustedContent` 钩子挂记忆/技能/任务三处 | memory poisoning | `agentbridge` 新钩子 + 09/10 集成点 |
| 发 LLM 前统一 secret/PII 脱敏层 | 外泄 | agent `redactProcessOutput` 扩展 |
| 凭据 broker:egress 注入 per-session scoped 凭据,agent 不持原文 | C1/C5 协同 | `egress/*` 升级 + `agentconfig` 推送路径 |

**取舍**:依赖 07(审批 UI)+ 09/10(记忆/任务板)先有骨架;凭据 broker 是较重改造(egress 从透传代理升级为凭据注入代理)。**收益是把"被注入即拿 key"从根上消除,并对未来的持久化注入面(记忆/技能/任务)预先设防 —— 不做这步,引入记忆/任务板等于引入新的 lethal-trifecta [C] 通道。**

### Phase 完全 —— per-session 硬沙箱

| 动作 | 治 | 改动触点 |
|---|---|---|
| 生产宿主换内核(支持 unprivileged userns)解锁 bubblewrap+seccomp | C1/C5 | 部署层;`agent` 容器 entrypoint 包 `srt`/bwrap |
| 或托管 microVM(e2b/Northflank BYOC)per-session 一台 | C1/C5/C2/C3 | agent 进程模型重构(衔接 06 OpenHands Workspace 工厂) |
| sandbox OS 级写保护自身策略文件 | CVE 类 | 沙箱 profile |

**取舍**:这是 06 的主战场(microVM 经济性、~400 并发 CNI 瓶颈、buy-vs-build);成本最高(microVM ~1GB/sandbox)、改动最大(agent 从"共享容器 spawn 子进程"变"per-session sandbox")。**但只有这一步把隔离从软约定(C5)变物理边界,并顺带解决横向扩展(C2/C3)。** 在那之前,平台的安全姿态对 prompt injection 始终是"检测 + 网络缓解"。

---

## 摘要(本维度对 Scholay 最重要的建议)

1. **最高优先:收口 Bash(C1)** —— 它是 lethal trifecta 的 [C] 外泄通道,且当前绕过所有路径门(`ws.go:579-585`),被注入即可 `cat providers.json` 拿真 LLM key、读他人 jsonl(C5)。MVP 即可止血:`conversationService.ts:77-97` 把 Bash 移回 prod denylist + `ws.go` 权限门 Bash 默认拒。便宜、立竿见影。
2. **egress 切 allowlist 模式 + 抗 DNS rebinding(治 01 已记的明文 SSRF)** —— prod 默认 `FilterDefaultDeny Yes`,egress 自己 resolve→verify-IP→connect;改动局限在 `egress/*`,不碰 agent。
3. **Trusted 后门收口(C12)** —— `IssueWSTicketTrusted`(`ws_round.go:47-56`)跳 OwnsSession 是显式跨用户劫持债,改强制实体归属校验,把"降级是 warning"升为"不通过即 401"。
4. **审批化替代 auto-approve(C14,衔接 07)+ out-of-band system prompt(C9)** —— 单 bool 拆 SandboxMode×ApprovalPolicy 两轴(对标 Codex);高危工具走 HumanInterrupt(Rule-of-Two 兜底);把 `[AGENT BRIDGE STRICT RULES]` 从 in-band 前缀(`ws.go:504-510`)改独立 system 消息或 nonce 边界,堵伪造结束标记。
5. **为 north-star 的记忆/任务板预设防(衔接 09/10)** —— 引入长期记忆/技能/Kanban 前,先在 `agentbridge` 加 `ScanUntrustedContent` 钩子(Hermes Promptware Defense 模式)+ 发 LLM 前 secret/PII 脱敏;否则等于新开持久化注入向量(memory poisoning)。硬隔离(microVM/换内核解锁 bubblewrap)是 Phase 完全的目标,治 C5 软约定并顺带 C2/C3,但成本最高、归 06 主导。
