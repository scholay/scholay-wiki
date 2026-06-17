# Security & sandboxing of agent tools
> kind: dimension · confidence: high · last-checked: 2026-06

## 概述

这一维度回答的是:**一个 LLM agent 的工具调用到底被允许做什么** —— 权限闸门、代码执行的 OS 级沙箱、出网/网络控制、prompt injection 的"围堵"、以及密钥隔离 —— 目的是让一个正在处理"攻击者可控文本"的 agent 不会被改造成数据外泄或 RCE 引擎。

2025–2026 这个领域已经收敛到一个根本认知:**prompt injection 在模型层是架构性无解的**,所以安全必须来自"约束能力(capability)",而不是把模型"变聪明"。这一点被 Simon Willison、Meta、OWASP 三方独立表述并相互印证(见 Sources)。对我们这种"多用户 Web 学术 agent 平台"而言,这意味着不能指望一个"95% 拦截率"的 guardrail 当主防线,而要把防御做到 OS / 网络 / 凭据架构层。

核心威胁模型(直接当设计公理):

- **Lethal Trifecta(致命三角,Willison)**:危险 = (1) 能访问私有数据 + (2) 暴露于不可信内容 + (3) 能向外通信。Willison 明确指出 LLM "will happily follow *any* instructions that make it to the model, whether or not they came from their operator or from some other source",且 "unable to *reliably distinguish* the importance of instructions based on where they came from"。他对厂商 "capture 95% of attacks" 之类的 guardrail 宣称表示怀疑(在安全语境里 95% 等于失败级)。唯一可靠缓解 = **永远不要把三者凑齐**。
- **Agents Rule of Two(Meta,2025-10)** —— 上面那条的可操作化版本。三个属性:**[A]** 处理不可信输入;**[B]** 能访问敏感系统/私有数据;**[C]** 能改变状态或向外通信。**规则:一个 agent 在一个 session 内最多满足 3 者中的 2 个**("must satisfy no more than two ... within a session")。若三者确实都需要且无法靠 fresh context window 拆开,则 "the agent should not be permitted to operate autonomously and at a minimum requires supervision — via human-in-the-loop approval or another reliable means of validation"。**一个全新 context window(fresh session)会重置这条 A→B→C 利用链**,所以可以跨 session 从 [AC] 切到 [B]。该框架明确声称受 Chromium 的同名 Rule of Two 与 Willison 的 lethal trifecta 启发,并强调满足 Rule of Two "should not be viewed as a finish line",**纵深防御(defense in depth)仍是必需**。
- **OWASP**:prompt injection 被映射到其 *Top 10 for Agentic Applications* 中 **10 项里的 6 项**("OWASP maps it to six of the ten categories")。[UNVERIFIED] 该榜单"2025-12 发布、100+ 研究者参与"的具体发布元数据——所引 HelpNetSecurity 文中只引用了 OWASP GenAI 的 *State of Agentic AI Security and Governance v2.01*,未给出发布日期/人数,故此细节不能确证。

## 关键架构决策

### 权限模型(ask / allow / deny / allowlist)

Claude Code 的模型是参考设计,可直接对标我们平台:

- **默认只读**;会改系统的 Bash 命令需显式批准;一组内建只读命令(`ls`、`cat`、`git status`)无提示直接跑。
- **per-user / per-codebase / per-org 的 allowlist** 用来对抗 "prompt fatigue";规则形如 `Bash(curl *)` 的 allow,以及 `permissions.deny` 硬阻断。
- **Fail-closed 匹配**:"Unmatched commands default to requiring manual approval."(未匹配=要人批)
- **命令注入检测**:"Suspicious bash commands require manual approval even if previously allowlisted."(可疑命令即便在 allowlist 也要人批)
- **写入收敛**:Claude Code 只能写它启动的目录及子目录,不能写父目录;读则可广泛读(便于读系统库/依赖)。
- **网络命令 `curl`/`wget` 不被自动批准** —— 它们像任何非只读命令一样弹窗;可一次性批准、加 `Bash(curl *)` allow 规则,或加进 `permissions.deny` 彻底封禁。

Codex 用了值得抄的**两轴(two-axis)**模型 —— "sandbox mode"(进程能碰什么)与 "approval policy"(何时问人)是**正交**的:

- Sandbox modes:`read-only` → `workspace-write`(默认) → `danger-full-access`。
- Approval policies:`untrusted` / `on-request`(默认在沙箱内跑,越界才升级问人) / `never`。
- 官方原文:"Sandboxing and approvals are different controls that work together. The sandbox defines technical boundaries. The approval policy decides when Codex must stop and ask before crossing them." 配置键在 `config.toml`:`sandbox_mode` + `approval_policy` + `sandbox_workspace_write.writable_roots`。

OWASP LLM01 的缓解清单与上面高度重叠,逐条确证(原文条目名):**"Constrain model behavior" / "Enforce privilege control and least privilege access" / "Require human approval for high-risk actions" / "Segregate and identify external content" / "Implement input and output filtering" / "Conduct adversarial testing and attack simulations" / "Define and validate expected output formats"**。

### 内建工具加固(built-in tool hardening)

- **沙箱化 Bash**:用 OS 强制的 FS+网络边界取代逐命令弹窗。OS 边界"holds regardless of what the model chose to run and even if an allowed command does more than its name suggests" —— 即**强制发生在模型决策之下**(below the model)。
- **Accept-Edits 模式**:自动批准文件编辑 + 一组固定白名单 FS Bash 命令(原文列举:`mkdir`、`touch`、`rm`、`mv`、`cp`、`sed`),**仅限工作目录内的路径**;其它 Bash 命令与越界路径仍弹窗。(出处:Claude Code Security 文档)
- **设置文件被 OS 级写保护**:"the sandbox automatically denies write access to Claude Code's `settings.json` files at every scope ... so a sandboxed command cannot modify its own policy."(沙箱内命令改不了自己的策略)—— 这正是 **CVE-2025-59532**(Codex CLI:"the agent's own output could redefine the boundary of its sandbox")和 **CVE-2026-22708**(Cursor:"poison the agent's execution environment so allowlisted commands like git branch deliver arbitrary payloads")这一类漏洞的针对性防御。两个 CVE 编号与措辞均经 HelpNetSecurity 原文确证。
- 我们平台当前模型 = "全局硬禁内建工具(只留 MCP)+ 容器加固",对应最严解读;**缺口在于 OS 级强制 vs 策略级禁用** —— 我们是策略层把工具关掉,而非靠 OS 边界兜底。

## 编排与子agent

- **Subagents 的沙箱继承**:Claude Code 文档明确 "subagents run in the same process as the parent session and use the same sandbox configuration",子 agent 内的 Bash 在父 session 开启沙箱时同样被沙箱化。对编排的含义:**子 agent 不会自动获得更高权限**,沙箱边界沿父 session 继承。
- **逐 session 的 Rule of Two 拆链是编排的核心抓手**:把"读不可信论文/网页"的子任务与"有 API key / 能出网写盘"的子任务**放进不同 context window**,让 A→B→C 链在 session 边界断开。这是 Meta 框架直接背书的编排手法,比"一个 agent 全能"安全得多。
- **MCP 服务器不被厂商安全审计**:"Anthropic ... does not security-audit or manage any MCP server." 由于我们平台靠 MCP(Minicod 等)做学术检索,这意味着**对 MCP 上游的信任要自己建立**(自写或只用可信源)。
- **首次信任校验在非交互 `-p` 模式被关闭**:"Trust verification is disabled when running non-interactively with the `-p` flag." —— 与我们直接相关,因为我们在**服务端非交互**地跑 agent,这层信任确认对我们天然失效,需要别的机制补。

## 记忆

- 目前我们平台**没有长期记忆**;但 OWASP 的 *Agentic Applications* 体系中 **memory poisoning(记忆投毒)是一个被命名的 agentic 威胁** —— 一旦引入长期记忆,写入记忆的不可信内容会变成**持久化注入向量**。设计含义:把"写记忆"当作状态变更(即 Rule of Two 的属性 [C])来对待,记忆写入路径要受 [A]/[C] 不同时满足的约束。
- [UNVERIFIED] 上一稿把 memory poisoning 归到 HelpNetSecurity 那篇文章 —— 复核发现该文**未提及** memory poisoning。该威胁确实是 OWASP agentic 体系中的真实条目,但此处不能用该 URL 背书;若要正式引用应直接引 OWASP GenAI 的 Agentic 文档。

## 多用户与隔离

### 沙箱技术栈(具体落地)

| 层 | macOS | Linux | 备注 |
|---|---|---|---|
| Claude Code / `sandbox-runtime` | **Seatbelt**(`sandbox-exec` + 动态生成 profile) | **bubblewrap** 做 FS 隔离 + 嵌套 user+PID+mount namespace;**seccomp-BPF** 拦 `socket()` 阻断 `AF_UNIX` 套接字创建;`socat` 中继网络流量 | 独立包 `@anthropic-ai/sandbox-runtime` 可包裹**任意**进程:`srt "cmd"` |
| Codex | Seatbelt | **bubblewrap**(用 `PATH` 上第一个 `bwrap`) | 三档 sandbox mode |

> 说明:Codex 在 Linux 用的是 **bubblewrap**,**不是 Landlock**(官方 Codex 文档原文 "Codex uses the first `bwrap` executable it finds on `PATH`")。部分二手 2026 博客称其用 Landlock,与一手文档冲突,以一手为准。

**FS 隔离模式(非对称,可逐字照抄)**:写 = **deny-by-default, allow-only**(`allowWrite`/`denyWrite`,denyWrite 优先);读 = **allow-by-default, deny-then-re-allow**(`denyRead`/`allowRead`,allowRead 优先)。无论配置如何都**强制保护**的文件:`.bashrc`/`.bash_profile`/`.zshrc`/`.zprofile`/`.profile`、`.gitconfig`/`.gitmodules`、`.vscode/`/`.idea/`("always blocked from writes, even if they fall within an allowed write path")。
**易踩的脚枪**:默认读策略**仍然允许读 `~/.aws/credentials` 和 `~/.ssh/`**(Claude Code 文档原话:"this default still allows reading credential files such as `~/.aws/credentials` and `~/.ssh/`. Add them to `denyRead` to block them."),不显式加进 `denyRead` 就会泄漏。

**多租户的更强隔离档位(2026 行业共识)** —— 标准容器对不可信 AI 代码**明确不推荐**(共享内核 → 逃逸风险,"suitable only for trusted, vetted code in single-tenant environments"):

- **gVisor**:用户态内核(Sentry)在到达宿主内核前拦截 syscall,只暴露最小化的、经审的子集;I/O 密集负载上 **10–30%** 开销,启动快。("pragmatic middle ground" 是本稿的概括,非 Northflank 原话。)
- **Firecracker microVM**:KVM 内每个 workload 独立 Linux 内核,启动 **~125ms**,每 VM 开销 **<5 MiB**,**~150 VMs/秒/宿主**。Northflank 推荐用于 "Multi-tenant AI agent execution, untrusted code, production environments"("2026 baseline" 是本稿概括,非原文标签)。
- **Kata Containers**:与 Firecracker 同级的硬件隔离,K8s 原生编排,启动 **~200ms**。
- 指导原则(原文):"Default to microVMs for untrusted code. Relax to gVisor or containers only when threat model justifies it."

**逐 session 临时化 + per-user FS 隔离是共识默认**:Northflank 系列文一致表述"多租户 agent 平台上,带恰当隔离的 ephemeral 环境是 hard requirement";"每个 agent session 跑在自己的 microVM(Kata/Firecracker/gVisor)","spin up in 1-2 seconds"。这直接回答我们"单一共享文件系统、无真正 per-user 隔离"的问题。
> [UNVERIFIED] 上一稿那句 "ephemeral environments should be the default, with each session receiving isolated, temporary access rather than persistent credentials" 不是 `how-to-sandbox-ai-agents` 页的逐字引用;其**实质主张**(ephemeral-by-default + per-session microVM 隔离)在 Northflank 多篇文中成立,但该精确措辞与"用临时访问替代持久凭据"的合并表述无法逐字确证。

### 密钥处理(agent 容器内)

- **环境变量擦除**:沙箱化 Bash 默认继承父进程环境(含凭据);`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` 从子进程剥离 Anthropic/云厂商凭据。
- **凭据 broker / 代理模式(2026 最强)**:agent **不持有任何原始密钥**;一个 sidecar/vault 拦截出站 HTTP、注入凭据、再转发到目标。Infisical Agent Vault 原文:"if an agent can't be trusted with credentials, it shouldn't have them";agent 的 HTTP client 用 **HTTP CONNECT** 建隧道到 Agent Vault,vault "strip any credentials the agent attached, inject the correct credential from its encrypted store, and establish a new TLS connection to the real upstream";"The proxy authenticates requests via a session token during the CONNECT handshake so that every request is scoped to a specific agent context." 即便 prompt injection 成功也拿不到凭据。
  > [UNVERIFIED] 上一稿"为每个 ephemeral sandbox 铸造 per-session 短时 vault-scoped token"这一子点,Agent Vault 文档未明确展开(它讲 agent token / service token,但没细说 ephemeral 沙箱的 token 生命周期)。
- **云执行模型(Claude Code on web)**:每 session = 隔离的 Anthropic 托管 VM;鉴权 "handled through a secure proxy that uses a scoped credential inside the sandbox, which is then translated to your actual GitHub authentication token";git push "restricted to the current working branch";"All operations ... are logged";"Cloud environments are automatically terminated after session completion."

## 扩展性

- **`@anthropic-ai/sandbox-runtime`(`srt`)是可独立复用的隔离原语**:"wraps any command with security boundaries",可包裹任意进程(`srt "curl example.com"`)。对我们意味着 OS 级沙箱不必绑死在某个 agent CLI 里,可作为通用 wrapper 套在任何上游工具进程外。
- **两轴模型(sandbox mode × approval policy)天然可扩展**:新增能力时,只需在两个正交维度上各自定档,而非堆叠单一开关。
- **per-org/per-codebase allowlist 可版本化**:权限规则随源码 check-in,组织级 managed settings 还能 "keep developers from widening the policy"(布尔键用 managed 值忽略本地;数组键可设 `allowManagedReadPathsOnly`/`allowManagedDomainsOnly` 锁死)。这套"配置即代码 + 组织锁"模型适合多团队扩展。
- **自定义代理可插拔**:`httpProxyPort` / `socksProxyPort` 把出网流量导到自建代理,可做 TLS 终结、自定义过滤、全量日志、对接现有安全设施 —— 扩展网络策略不必改 agent 本体。

## 调度与异步

- [UNVERIFIED] 没有一手来源专门覆盖这些 CLI 对**定时/后台任务**的安全控制。但 Rule of Two 的推论很清晰:**一个无人监督的定时(非交互)agent 必须始终 ≤2 个属性**,因为没有 human-in-the-loop 来兜第三个属性。
- 直接相关的一手事实:**非交互 `-p` 模式下首次信任校验被关闭**(见上)。对"调度/异步在服务端跑"的我们,这条最该警惕 —— 异步任务天然非交互,信任确认这层默认不存在,要靠 allowlist + OS 沙箱 + 凭据 broker 补齐。

## 值得借鉴(对标我们的多用户Web学术agent平台)

1. **把 Rule-of-Two 当成显式的 per-session 不变量**。我们的学术 agent 今天同时读不可信论文/网页 [A]、有 Minicod/API key [B]、能写盘/MinIO/出网 [C] = 完整三角。拆法:给"读论文/RAG"的 session 配 [A]+[B] 但**禁出网/禁写**;给"交付"的 session 配 [B]+[C] 但**无不可信输入**;两者之间用 fresh context window 断链。
2. **两轴权限**:把 "sandbox mode"(OS 强制)与 "approval policy"(何时问人)分开,像 Codex 一样,比单旋钮清晰。
3. **把沙箱做到模型之下**:用 bubblewrap+seccomp(单宿主)或 **per-user/per-session Firecracker microVM**(真多租户)替代纯策略级工具禁用。我们当前的"共享 FS + 每用户 jsonl"充其量是容器级隔离;microVM 是 2026 的多租户基线。
4. **凭据 broker / 出网代理作为 SSRF+外泄的咽喉**:agent 不持 API key,后端代理注入 per-session scoped token,代理自己解析 DNS 并扫 hostname 找凭据模式("The proxy resolves DNS itself and scans the hostname for credential patterns"),并做 SSRF 防护——封私网段(`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`)、云 metadata `169.254.169.254`、link-local,以及 DNS rebinding 防护("resolve the hostname, verify the IP, then connect")。这把我们记的 "egress 明文 SSRF" 风险从 per-handler 提到架构层。
5. **不可信抓取用隔离 context window**(WebFetch/论文摄入):"Web fetch uses a separate context window to avoid injecting potentially malicious prompts",让注入指令到不了特权 agent loop。
6. **fail-closed + 保护自身策略**:未匹配=拒;沙箱不能写自己的 config/settings(化解 Cursor/Codex 那一类 sandbox-redefinition CVE)。
7. **env 擦除 + 对 `~/.ssh`、`~/.aws` 显式 `denyRead`**(默认读策略会泄漏它们)。
8. **per-org/per-codebase 可复用 allowlist** 降 prompt fatigue,同时不破坏 fail-closed;组织级用 managed settings 锁死不让放宽。
9. **ephemeral + 自动 teardown 的 session + 短时凭据** —— 对标 Claude Code on web,直接修我们"无真正 per-user 隔离"。

## 局限

- **prompt injection 在模型层不可解** —— 别把 "guardrail" 当主防线;capability-splitting 才是确定性控制。Willison 至今没有 100% 可靠阻断之法。
- **仅按 hostname 的出网过滤可被绕过**(domain fronting):Claude Code 内建代理 "does not terminate or perform TLS inspection on outbound traffic","makes its allow decision from the client-supplied hostname without inspecting TLS, code running inside the sandbox can potentially use domain fronting ... to reach hosts outside the allowlist"。真正保证需 **TLS 终结的 MITM 代理 + 注入 CA**(`httpProxyPort` + `enableWeakerNetworkIsolation`),代价是 CA 注入运维。
- **容器 ≠ 不可信代码的隔离**;且削弱档位 `enableWeakerNestedSandbox` 官方原文 "considerably weakens security",只应在外层已有隔离时用。
- **默认读策略泄漏凭据**(`~/.aws/credentials`、`~/.ssh/`);**Unix 套接字放行可交出宿主**(放行 `/var/run/docker.sock` "effectively grants access to the host system");**对 `$PATH`/shell-rc 目录的过宽 `allowWrite` = 提权**。
- **MCP 服务器不被厂商安全审计**;**信任校验在非交互 `-p` 模式被跳过** —— 与我们服务端非交互跑 agent 强相关。
- **Rule-of-Two 必要但不充分** —— Meta 仍要求其上叠加纵深防御。
- **原生 Windows 不支持**这些沙箱(只有 Seatbelt/bubblewrap,Windows 需 WSL2) —— 对我们 Linux/Docker 部署无影响。
- [UNVERIFIED] 定时/后台任务专属的安全控制无一手来源;Codex 在 Linux 的精确机制为 bubblewrap(非 Landlock,与部分二手 2026 博客冲突,以一手 Codex 文档为准)。
- [UNVERIFIED] pipelab 那篇**未**主张 "DLP 在 DNS 解析之前运行";其表述是代理自己解析 DNS 再扫 hostname 找凭据模式,并做 DNS rebinding 防护——上一稿"DLP runs before DNS"系误读,已更正。
- [UNVERIFIED] OWASP *Top 10 for Agentic Applications* 的"2025-12 发布 / 100+ 研究者"发布元数据,所引来源未支撑。

## Sources

- Lethal Trifecta (Willison): https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/
- Meta — Agents Rule of Two: https://ai.meta.com/blog/practical-ai-agent-security/
- Willison — new prompt injection papers (Rule of Two 评注): https://simonwillison.net/2025/Nov/2/new-prompt-injection-papers/
- Claude Code — Security: https://code.claude.com/docs/en/security
- Claude Code — Sandboxing: https://code.claude.com/docs/en/sandboxing
- Anthropic — sandbox-runtime (srt): https://github.com/anthropic-experimental/sandbox-runtime
- Codex — Sandboxing: https://developers.openai.com/codex/concepts/sandboxing
- OWASP — LLM01 Prompt Injection: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
- HelpNetSecurity — OWASP / prompt injection / CVE-2025-59532 / CVE-2026-22708: https://www.helpnetsecurity.com/2026/06/11/owasp-prompt-injection-ai-security-failures/
- Infosecurity Magazine — Infosec Europe prompt injection: https://www.infosecurity-magazine.com/news/infosec-europe-prompt-injection/
- Northflank — how to sandbox AI agents (gVisor/Firecracker/Kata 数据): https://northflank.com/blog/how-to-sandbox-ai-agents
- Northflank — ephemeral execution environments for AI agents: https://northflank.com/blog/ephemeral-execution-environments-ai-agents
- Infisical — Agent Vault(凭据代理): https://infisical.com/blog/agent-vault-the-open-source-credential-proxy-and-vault-for-agents
- Infisical — Agent Vault repo: https://github.com/Infisical/agent-vault
- PipeLab — AI egress proxy(SSRF/DNS rebinding/169.254.169.254): https://pipelab.org/learn/ai-egress-proxy/
- dev.to — gVisor vs Firecracker for AI agent sandboxing (2026): https://dev.to/chunxiaoxx/mcp-security-patterns-2026-gvisor-vs-firecracker-for-ai-agent-sandboxing-3hp7
