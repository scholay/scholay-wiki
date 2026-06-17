# Managed multi-user agent platforms (Amp, Devin, Cursor agents, Factory Droid)
> kind: project · confidence: medium · last-checked: 2026-06

## 概述

四个面向团队/多用户的「托管式 coding agent」平台，按架构成熟度与对我们(多用户 Web 学术 agent)的可借鉴度梳理:

- **Amp** (Sourcegraph) — 以可分享的 **thread** 为一等公民,subagent 模型最完整(Search / Oracle / Librarian),工作区级共享与权限。CLI + Web + Mobile。
- **Devin** (Cognition) — 每个 session 跑在独立云 VM("cloud laptop");长期记忆(Knowledge)、可复用流程(Playbooks)、定时/事件触发最成熟;自研 `blockdiff` 快照让 per-session 环境分叉极廉价。
- **Cursor Agents** (Anysphere) — agent = Instructions + Tools + Model;Cloud Agents 跑在云端隔离 VM,多入口触发(Web / Slack / GitHub / Linear / API / Automations);双计费池(Auto/Composer vs API)。
- **Factory Droid** (Factory.ai) — coordinator → 专职 subagent(code/review/docs/test/Knowledge)分派;本地/云双存储 + 组织可强制;配置层级 org→project→user。

> 取证说明:Amp / Devin / Cursor 的核心断言已逐条核对到官方一手页面(ampcode.com、docs.devin.ai、cognition.ai 博客、cursor.com docs)。Factory 的内部架构主要来自 **DeepWiki(社区生成的代码库 wiki)+ 评测博客**,属二手来源,标注为 medium/low,落地前需复核官方文档。本轮已修正 DRAFT 中若干来源张冠李戴(尤其 Devin `blockdiff` 被错误引到 Modal 营销页)。

---

## 关键架构决策

**会话/状态模型**
- **Amp**:核心单元 = **thread**(包含全部消息、上下文、工具调用),持久且可分享。给 agent 发消息时若它还在干活,消息进 **队列**(verbatim: "If you send a message when the agent is still working, your message is queued.")。([ampcode.com/manual](https://ampcode.com/manual))
- **Devin**:每个 session = 一台独立云 VM(交互式 UI + 内嵌 IDE/shell/浏览器)。VM 内含仓库、工具、依赖、凭据、磁盘文件,通过磁盘快照保存复用。([cognition.ai/blog/blockdiff](https://cognition.ai/blog/blockdiff))
- **Cursor**:agent 三要素 = **Instructions(system prompt + rules)+ Tools + Model**(verbatim from cursor docs)。会话内 **Checkpoints**:"Checkpoints save snapshots of your codebase during an Agent session";"Agent automatically creates them before making significant changes";出错可点 checkpoint 还原所有文件。([cursor.com/docs/agent](https://cursor.com/docs/agent))
- **Factory**:Droid 维护会话状态(消息历史 + 工具调用 + 审批),agent loop = request → analyze → execute tools with permission checks → present results for approval → repeat。可作交互式 REPL / headless `droid exec` / IDE 运行。([DeepWiki: factory-ai/factory 3.1](https://deepwiki.com/factory-ai/factory/3.1-droid-agent-architecture)) [来源为二手 DeepWiki]

**模型可插拔(Amp 最显式)**
- Amp 把"模型当作更大认知系统里的可替换组件",用系统/辅助模型分别处理 handoff、thread 分类、标题生成,与主 coding 模型分离。([stephenvantran.com](https://stephenvantran.com/posts/2025-11-30-ampcode-agent-harness-wars/)) [来源为二手博客,标 medium]

**会话快照(Devin `blockdiff`,对"per-user 环境分叉"最有参考价值)**
- 自研 VM 磁盘快照格式 **`blockdiff`**:"For two files A & B, blockdiff stores only the blocks in B that are different from blocks in A"(只存变更块,copy-on-write 思路)。([cognition.ai/blog/blockdiff](https://cognition.ai/blog/blockdiff))
- 精确数字(逐字):在其 hypervisor 上 "Reading/writing 20 GB of data: ~6.5 s / **Creating 20 GB snapshot with blockdiff: ~200 ms**"。相对 EC2 的 "30+ minutes" 基线,他们把快照操作整体降到 "just a couple of seconds – a 200x speed-up"。
  - ⚠️ 纠错:DRAFT 把这些数字串成"30 分钟→200 毫秒(20GB)"并归到 Modal 页,属来源张冠李戴。真相是:**200ms** 是 blockdiff 在自家 hypervisor 上创建 20GB 快照的裸耗时;**30+ 分钟**是 EC2 的对照基线;端到端他们说降到"几秒 / 200x"。
- 用途逐字:"Our customers set up their dev environment in Devin's VM, which we save to reuse via a disk snapshot." — 即 per-session/per-customer 环境可被快照后秒级复用。

**[UNVERIFIED] 待复核**:DRAFT 中"Machine Snapshots(具名功能)"与"session timeline + rollback 同时恢复 files AND memory state"两条,在 blockdiff 博客与所引 Modal 页中均未找到原文;Modal 页经核实是泛泛对比 sandbox 的营销稿、不含 Devin 内部细节。这两条降级为 [UNVERIFIED]。

---

## 编排与子agent

- **Amp(四者中 in-task 委派模型最完整)**
  - 通用 subagent:"Each subagent has its own context window and access to tools like file editing and terminal commands."(各自独立上下文窗口 + 工具)
  - 关键约束(逐字):"Subagents work in isolation — they can't communicate with each other, you can't guide them mid-task, they start fresh without your conversation's accumulated context, and the main agent only receives their final summary rather than monitoring their step-by-step work." → **是 fan-out / fan-in,不是会话网状**。
  - 具名专职 subagent:**Search**(代码导航)、**Oracle**(深推理/审查)、**Librarian**(跨仓研究)。([ampcode.com/manual](https://ampcode.com/manual),[stephenvantran.com](https://stephenvantran.com/posts/2025-11-30-ampcode-agent-harness-wars/) 二手)
  - **Oracle** = **read-only subagent**(逐字:"a read-only subagent powered by one of the most powerful models today: OpenAI's o3";后续文章更新为 GPT-5 系列)。擅长 "reviewing... debugging... analyzing... figuring out what to do next"。**Amp 刻意在 system prompt 里克制它**(逐字:"We consciously haven't pushed the oracle too hard in the system prompt, to avoid unnecessarily increasing costs for you or slowing you down. Instead, we rely on explicit prompting...")——因为它"slightly slower / more expensive / less suited for day-to-day"。([ampcode.com/news/oracle](https://ampcode.com/news/oracle))
- **Devin(manager-Devin 模式)**
  - 2026-03-19 "Devin Manages Devins":"Devin can now orchestrate Devins and manage your Devin setup directly from any session";子 session 是 "a full Devin with its own isolated virtual machine",主 session 作 coordinator 并行协调。([docs.devin.ai/release-notes/2026](https://docs.devin.ai/release-notes/2026))
- **Cursor**
  - Cloud Agents 可 "run as many agents as you want in parallel"。([cursor.com/docs/cloud-agent](https://cursor.com/docs/cloud-agent))
  - 另有独立 **Subagents** 文档(`cursor.com/docs/subagents`),即在编辑器内的子 agent 委派能力(本轮未逐字取证内容,仅确认存在)。
- **Factory(coordinator → 专职 droid)** [来源 DeepWiki/评测博客,二手]
  - coordinator 拆解任务并分派给专职 droid(code / review / docs / test / Knowledge),"explicit role boundaries rather than one generalist agent";3 个服务需改时分派 3 个 code-droid session 到隔离 sandbox 并行。自定义 droid = "specialized subagents with restricted tool access"。([digitalapplied.com](https://www.digitalapplied.com/blog/factory-ai-multi-agent-coding-platform-review),[DeepWiki 3.1](https://deepwiki.com/factory-ai/factory/3.1-droid-agent-architecture))

---

## 记忆

- **Amp**:短期 = thread 历史;持久指导 = **`AGENTS.md`** 文件(逐字:"Amp looks in `AGENTS.md` files for guidance on codebase structure, build/test commands, and conventions";cwd 及父目录直到 `$HOME` 自动纳入)。**无**类似 Devin Knowledge 的跨 thread 长期学习记忆。([ampcode.com/manual](https://ampcode.com/manual))
- **Devin — Knowledge(四者中长期记忆最完整)**:每条 = **Trigger Description + Content + 可选 Macro**(以 `!` 开头,如 `!deploy-checklist`)。作用域分 **organization(组织内全员可见)/ enterprise(跨组织)/ repo-pinned(no repo / 特定 repo / all repos)**。每条可 **按用户单独 enable/disable**。**惰性检索**(逐字:"Devin retrieves Knowledge when relevant, not all at once or all at the beginning";"Devin will retrieve a Knowledge item when its current work is related to the specified triggers")。([docs.devin.ai/product-guides/knowledge](https://docs.devin.ai/product-guides/knowledge))
- **Cursor**:Instructions = system prompt + rules。([cursor.com/docs/agent](https://cursor.com/docs/agent)) 具体的 rules/memory 机制页本轮未取证 → [UNVERIFIED]。
- **Factory**:AGENTS.md 约定 + 文件自动追踪 + 语义/文本检索索引 + 会话历史;配置层级 org → project → user 用于共享知识。([DeepWiki 3.1](https://deepwiki.com/factory-ai/factory/3.1-droid-agent-architecture)) [二手]

**Playbooks(Devin,可复用流程 = 团队标准化提示词)**
- 逐字:"A playbook is like a custom system prompt for a repeated task." 字段(可选)实为 **Overview / Procedure / Specifications / Advice / Forbidden Actions / Required from User** + Macro(`!` 标识,如 `!data-tutorial`)。⚠️ 纠错:DRAFT 只列 Procedure/Specifications/Advice,漏了 Overview / Forbidden Actions / Required from User。
- 可作 **`.devin.md`** 文件,启动 session 时拖入 Web app;企业可在 **enterprise level**(除 organization 外)管理、跨组织共享。([docs.devin.ai/product-guides/creating-playbooks](https://docs.devin.ai/product-guides/creating-playbooks))

---

## 多用户与隔离

- **Amp — thread 可见性 4 级**(逐字):**Private**(仅自己 + 工作区 admin)/ **Workspace-shared**(工作区全员;**在工作区内为默认**)/ **Group-shared**(指定 group + 工作区 admin,Enterprise-only)/ **Unlisted**(有链接的任何人 + 你的工作区)。可随时改。
  - **跨 thread 引用**(逐字):可在 prompt 里用 thread URL(`https://ampcode.com/threads/T-...`)或 thread ID(`@T-...`)引用其它 thread,Amp 会读取并抽取相关信息 → thread 成为可复用知识件。
  - **MCP 审批**(逐字):工作区设置(`.amp/settings.json`)里的 MCP server "require explicit approval before they can run"(全局 `~/.config/amp/settings.json` 或 `--mcp-config` 传入的不需要)。
  - Enterprise:SSO(Okta/SAML)、目录同步、用于成本归属的用户 **groups**、IP 白名单等(部分见 manual)。([ampcode.com/manual](https://ampcode.com/manual))
  - **[UNVERIFIED]** "Workspace leaderboard / 浏览彼此 thread 互相学习" — manual 中**未**找到 leaderboard 字样,仅二手博客提及;降级。
- **Devin**:每 session 独立 VM,凭据隔离在 sandbox 内("cloud laptop");多 sandbox 可并行互不干扰。([skywork.ai](https://skywork.ai/blog/devin-cognition-ai-faq-autonomous-ai-software-engineer/) 二手 FAQ) Sessions API 支持按 user email 过滤、session-scoped secrets(见下)。
- **Cursor**:Cloud Agents 跑在 "isolated VMs in the cloud with full development environments";git 工作流 = "clone your repo from GitHub or GitLab and work on a separate branch, then push changes to your repo for handoff"。**Self-hosted Cloud Agents** 已 GA(codebase / 工具执行 / 构建产物不出自有环境)。([cursor.com/docs/cloud-agent](https://cursor.com/docs/cloud-agent),[cursor.com/blog/self-hosted-cloud-agents](https://cursor.com/blog/self-hosted-cloud-agents))
- **Factory**:session 存于 **本地 `~/.factory/sessions/`** 或 **同步到 Factory 云**(跨设备/团队成员),**org 可强制采用哪种存储**;桌面/Web/CLI/IDE 同步。每个 droid 在镜像项目工具链的 sandbox 内。([DeepWiki 3.1](https://deepwiki.com/factory-ai/factory/3.1-droid-agent-architecture)) [二手]
  - **[UNVERIFIED]** "every Droid gets a persistent machine, not an ephemeral sandbox" 来自评测博客([digitalapplied.com](https://www.digitalapplied.com/blog/factory-ai-multi-agent-coding-platform-review)),官方未证实,落地前复核。

---

## 扩展性

- **Amp**:内建工具 + **plugins**(三作用域:项目 `.amp/plugins/`、系统 `~/.config/amp/plugins/`、全局),plugin 可挂事件(如 `tool.call`)加自定义权限门,并可 `amp.experimental.createThread(options?)` **派生后台 thread**(可传 `parentThreadID` 关联父 thread)。MCP(本地/远程)+ `includeTools` 过滤;**Skills** 打包指令 + 资源(可内嵌 `mcp.json`)。([ampcode.com/manual](https://ampcode.com/manual))
- **Devin**:MCP 支持;`SKILL.md` 技能文件;AGENTS.md 风格约定。([medium 二手](https://medium.com/@nitinmatani22/devin-ai-skills-the-skill-md-files-that-teach-an-ai-agent-your-entire-app-1c619dad0501)) [来源二手,标 low]
- **Cursor**:Cloud Agent 环境配置 = `.cursor/environment.json`(逐字:三种 setup "agent-led setup, a saved snapshot, or a Dockerfile in `.cursor/environment.json`");环境含 cloned repos / installed dependencies / secrets / startup commands / network access。([cursor.com/docs/cloud-agent](https://cursor.com/docs/cloud-agent))
- **Factory**:动态加载 **MCP** 工具;**Skills**(用户自定义,命令或上下文触发);**Hooks**(生命周期 `PreToolUse`/`PostToolUse`);自定义 droid。([DeepWiki 3.1](https://deepwiki.com/factory-ai/factory/3.1-droid-agent-architecture)) [二手]

---

## 调度与异步

- **Amp**:plugin 派生的后台 thread(如 "background deep-mode thread")独立于主对话运行;**无**官方 cron/scheduler 文档。([ampcode.com/manual](https://ampcode.com/manual))
- **Devin(四者中最成熟)**
  - **Sessions API**(2026-01):按 ID 取 session、向活跃 session 发消息、按 origin(webapp / Slack / Teams / API / Linear / Jira)与 user email 过滤;**session-scoped secrets**(2026-01-09)。
  - **定时 session**(2026-02-03):可配 frequency + prompt + playbook + email 通知;2026-05-22 起支持直接粘贴 **RFC 5545 RRULE** 字符串。
  - **事件触发**:GitHub "Files-Changed Trigger"(仅当特定文件/目录变更时跑,2026-05-22);"Wake Sleeping Sessions on Retrigger"(PR comment retrigger 唤醒沉睡 session,2026-05-22);Jira 集成增强(从 issue 直接建 session + per-project trigger,2026-03-27)。([docs.devin.ai/release-notes/2026](https://docs.devin.ai/release-notes/2026))
- **Cursor**:**Automations** 在后台跑 cloud agent,"either on a schedule or in response to events from GitHub, GitLab, Slack, webhooks, Linear, and more";触发入口含 Slack `@cursor`、GitHub/GitLab PR/issue `@cursor` 评论、Linear `@cursor`、Web、API。([cursor.com/docs/cloud-agent](https://cursor.com/docs/cloud-agent),[cursor.com/docs/cloud-agent/automations](https://cursor.com/docs/cloud-agent/automations))
- **Factory**:headless `droid exec` 支持脚本化/CI 集成。([DeepWiki 3.1](https://deepwiki.com/factory-ai/factory/3.1-droid-agent-architecture)) [二手]

**计费原语(对我们配额钩子有参考价值)**
- **Devin — ACU(Agentic Compute Unit)**:Cognition 对 Devin 活跃工作时所耗资源的归一化度量 = **VM 时间 + 模型推理 + 网络带宽**;约 **1 ACU ≈ 15 分钟主动自主工作**;仅在 Devin 活跃或 VM 运行时计费。订阅含月度 ACU 额度,超出走 PAYG。(来源为多篇二手 pricing 文章,核心定义一致;具体档位价格/"$2000 阈值"等细节 [UNVERIFIED])([cursor-alternatives.com/blog/devin-faq](https://cursor-alternatives.com/blog/devin-faq/),[aitoolpick.org](https://aitoolpick.org/blog/devin-pricing-2026/))
  - ⚠️ 术语:官方多写作 "Agentic **Compute** Unit"(DRAFT 写 "Computing")。
- **Cursor — 双计费池**(逐字):**Auto + Composer Pool**("Significantly more included usage... Designed for everyday agentic coding at a lower cost")vs **API Pool**("Charged at the model's API price";个人档每月至少含 $20 API usage,高档更多);超额按同 API 费率 PAYG。档位:Pro $20、Pro Plus $60(含 $70 API)、Ultra $200(含 $400 API)。([cursor.com/docs/account/pricing](https://cursor.com/docs/account/pricing))

---

## 值得借鉴(对标我们的多用户Web学术agent平台)

1. **Thread 作一等公民、可分享、可被引用**(Amp)。把每个 agent session 做成持久 thread,带 **可见性分级**(private / 工作区共享默认 / unlisted-link / public),并允许在 prompt 内 **@-引用其它 thread ID**。这把我们"jsonl-on-shared-FS"升级成可分享的知识图谱,落点天然是现有 `agent_sessions` 映射表。
2. **per-user 快速分叉环境 = copy-on-write 快照**(Devin `blockdiff`,20GB 快照创建 ~200ms)。这是修复"无真正 per-user 隔离"的最干净路径:不必上整 VM,**"不可变 base 快照 + per-session overlay"**这一模式可落到 container / overlayfs。
3. **长期 Knowledge 库 + trigger 惰性检索 + 作用域**(Devin)。条目 = trigger + content + macro,按 org/repo/user 作用域,仅相关时召回。正好补我们"无长期记忆"的缺口;学术场景把作用域设为 **用户 / 研究项目 / 学科领域**。
4. **Playbooks / `.md` 宏 = 可复用学术流程**(Devin)。Name + Macro(`!lit-review`)+ Overview/Procedure/Specifications/Advice/Forbidden Actions。比上 Devin orchestration 成本低、对标准化学生/实验室流程杠杆高。
5. **read-only "Oracle" 式审阅 subagent,跑更强模型、显式调用**(Amp)。挂在我们 agentbridge 上很便宜:第二个更贵模型,仅在"审一下这个分析 / 批一下这个论证"时调用,且 system prompt **刻意克制自动调用** 以控成本——直接对接现有 cost-hook。
6. **定时 + 事件触发的异步 agent**(Devin cron/RFC-5545 + file/PR 触发;Cursor schedule/事件 Automations)。学术场景:定时"我领域新论文摘要"、"每周重跑这条检索"。注意我们 deferred 的 `CronCreate`/`RemoteTrigger` 工具提示 harness 已能承载。
7. **多入口触发模型**(Cursor `@cursor` in Slack/GitHub/Linear + API + webhooks)。异步 agent 应能从 Web UI **以及** 程序化(API + webhook)触发,而非只有交互式 WS session。
8. **coordinator → 受限工具 subagent fan-out**(Factory / Amp)。"deep research" 学术任务:coordinator 扇出并行的 search/read/synthesize subagent,各自独立上下文 + 受限工具集。记住 Amp 铁律:**subagent 之间不能通信** —— 用 fan-out/fan-in,不是 chat mesh。
9. **归一化用量单位 + 双用量池**(Devin ACU = VM+推理+带宽;Cursor Auto 池 vs API 池)。把 compute+token 折成单一计费原语,优于裸 token 计数;"便宜默认池 vs 自带强模型池"可映射到我们现有 per-day-cap 配额钩子。
10. **配置层级 org→project→user + 存储可强制**(Factory)。admin 设实验室级默认、用户可覆盖;admin 强制 cloud-vs-local 与我们 admin-config 模式一致。
11. **工具/MCP 执行前审批门**(Amp 显式 approval;Factory per-tool permission)。当我们"放开全量工具 + 隔离层兜风险"时,逐调用对破坏性/外部工具设门是必需的。

---

## 局限

- **Subagent 是隔离的、不协作**(Amp 显式):别设计 chatty 多 agent mesh;用 fan-out/fan-in、独立上下文。([ampcode.com/manual](https://ampcode.com/manual))
- **强模型 subagent 贵且慢** —— Amp 正是在 **system prompt 里**克制 Oracle、强制显式调用来控成本/延迟。预算约束必须落在编排层,不能交给模型自觉。([ampcode.com/news/oracle](https://ampcode.com/news/oracle))
- **per-session VM/快照是 ACU 的成本大头**(VM 时间占 ACU 主体)。整 per-user VM 很重;COW 快照/容器能缓解但相对我们当前 shared FS 仍增 ops + 成本。([cognition.ai/blog/blockdiff](https://cognition.ai/blog/blockdiff))
- **持久机器模型(Factory,[UNVERIFIED])用隔离新鲜度换速度** —— 持久机器会累积 state/drift;需在"per-user 持久"与"per-session 干净快照"间取舍。
- **Knowledge 作用域是多租户泄漏面**:org-shared Knowledge 对组织全员可见 —— 学术平台默认应 **user/project 作用域而非 org-wide**,避免跨用户数据暴露。([docs.devin.ai/product-guides/knowledge](https://docs.devin.ai/product-guides/knowledge))
- **Devin/Cursor sandbox 隔离凭据** 是因为 agent 持有 push/secrets 访问 —— 对应我们的 egress/SSRF 与密钥泄漏关切:默认把 agent 网络出口视为敌意。([cursor.com/docs/cloud-agent](https://cursor.com/docs/cloud-agent))
- **来源质量提示**:Amp(manual / Oracle news)、Devin(Knowledge / Playbooks / release-notes / blockdiff 博客)、Cursor(agent / cloud-agent / pricing docs)为一手或近一手。**Factory 的全部内部架构、Amp leaderboard、Devin "Machine Snapshots"/files+memory rollback、Devin Skills(SKILL.md)、ACU 具体档位价**来自二手写作(DeepWiki / 评测博客 / Medium)或未在一手页证实,已在正文逐处标 [UNVERIFIED] / [二手],架构承诺前需复核。

---

## Sources

一手/近一手:
- https://ampcode.com/manual
- https://ampcode.com/news/oracle
- https://docs.devin.ai/product-guides/knowledge
- https://docs.devin.ai/product-guides/creating-playbooks
- https://docs.devin.ai/release-notes/2026
- https://cognition.ai/blog/blockdiff
- https://cursor.com/docs/agent
- https://cursor.com/docs/cloud-agent
- https://cursor.com/docs/cloud-agent/automations
- https://cursor.com/docs/account/pricing
- https://cursor.com/blog/self-hosted-cloud-agents
- https://cursor.com/docs/subagents

二手(待复核 / 仅作背景):
- https://deepwiki.com/factory-ai/factory/3.1-droid-agent-architecture
- https://www.digitalapplied.com/blog/factory-ai-multi-agent-coding-platform-review
- https://stephenvantran.com/posts/2025-11-30-ampcode-agent-harness-wars/
- https://skywork.ai/blog/devin-cognition-ai-faq-autonomous-ai-software-engineer/
- https://cursor-alternatives.com/blog/devin-faq/
- https://aitoolpick.org/blog/devin-pricing-2026/
- https://medium.com/@nitinmatani22/devin-playbooks-stop-repeating-yourself-start-automating-your-workflow-a0b2fee3e6a9
- https://medium.com/@nitinmatani22/devin-ai-skills-the-skill-md-files-that-teach-an-ai-agent-your-entire-app-1c619dad0501
- https://www.bitdoze.com/amp-code-free-ai-coding-agent/

证伪/已剔除(DRAFT 误引):
- https://modal.com/resources/best-sandboxes-devin — 经核实为 Modal 泛 sandbox 营销稿,**不含** blockdiff/200ms/Machine Snapshots/cloud-laptop/rollback 任何 Devin 内部断言;DRAFT 将多条 Devin 断言错引于此,已改引 cognition.ai/blog/blockdiff 或降级为 [UNVERIFIED]。
