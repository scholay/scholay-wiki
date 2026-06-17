# OpenClaw (小龙虾)
> kind: project · confidence: high · last-checked: 2026-06

> 说明:本文已对草稿做一次主源核验。官方文档(docs.openclaw.ai)+ GitHub 仓库可证实的结论标注为正文;
> 仅来自社区 deep-dive gist / 第三方文章、官方文档未确认的具体常量,统一降级标注为 **[UNVERIFIED]**。

## 概述

OpenClaw 是一个开源、**自托管的「个人 AI 助手」网关**:把各类消息渠道(WhatsApp / Telegram / Slack / Discord / Signal / iMessage / Feishu / WeChat / WebChat 等)接到一个跑在你自己机器上的 agent 运行时,自带文件型记忆、cron 调度、子 agent、skill/plugin 注册中心。仓库标语:*"Your own personal AI assistant. Any OS. Any Platform. The lobster way. 🦞"*([README 已核实](https://github.com/openclaw/openclaw))。

部署模型:在你掌控的机器(家里的 Mac mini 或独立 VPS)上常驻一个 **Gateway** 守护进程,它连消息 App、收消息、跑一次 agent turn(「大脑」)、按需调工具/设备、再把结果发回渠道。

它**明确定位为单运营者、设备本地**系统,**不是**面向多个互相敌对用户的多租户安全边界 —— 这一点官方安全文档原文写死(见「多用户与隔离」)([security 已核实](https://docs.openclaw.ai/gateway/security))。

## 关键架构决策

**不是 Claude Code 的套壳(重要纠偏)。**
- 官方项目**自带嵌入式 agent 运行时**(`openclaw`),把 Claude Code / Gemini-CLI / OpenCode / Cursor / Droid 等当作*外部 harness*,通过 **ACP(Agent Client Protocol)/ acpx** 驱动,而非原生循环。文档原文:*"Embedded harnesses run inside OpenClaw's prepared agent loop. Today this is the built-in `openclaw` runtime plus registered plugin harnesses."*([agent-runtimes 已核实](https://docs.openclaw.ai/concepts/agent-runtimes))。
- 可*选*用 Anthropic 模型:配置 `agentRuntime.id:"claude-cli"` + 模型引用 `anthropic/claude-opus-4-8`,即「选 Anthropic 模型、经 Claude CLI 作为独立进程执行」。
- 模型引用走 `provider/model` 规范(文档示例如 `openai/gpt-5.5`),执行后端在 runtime policy 里单独配。**所以「OpenClaw = Claude Code 套壳」(中文写法常见)是不准确的**:Claude Code 只是*一个可选后端*,不是引擎。
- 概念级 agent loop(社区教学 gist 里演示的)是标准的 Messages-API tool-use 循环:call model → 看 `stop_reason` → 跑工具 → 回灌结果 → 直到 `end_turn`,直接打 Anthropic API、不经 CLI。该 gist 是教学复刻、非真实代码库,但与官方设计自洽。**[UNVERIFIED:真实 `openclaw` 运行时的内部循环实现细节,官方文档未暴露]**([gist 教学复刻](https://gist.github.com/dabit3/bc60d3bea0b02927995cd9bf53c3db32))。

**单一长驻 Gateway 守护进程**持有*全部*状态与连接 —— sessions / channels / tools / events / cron。传输 **WebSocket 优先**,默认监听 **127.0.0.1:18789**(默认仅本地,需显式配置才对外);macOS app、CLI、Web UI、移动 node、自动化都连这一个端点。所有查询命令走 WebSocket RPC([port 18789 / 本地绑定 已核实(多源)](https://www.meta-intelligence.tech/en/insight-openclaw-gateway-commands))。**[UNVERIFIED:具体的 `{type:"req",id,method,params}` / 流式 `{type:"event",...}` 帧格式来自社区 gist,官方未逐字确认]**([gateway deep-dive gist](https://gist.github.com/royosherove/971c7b4a350a30ac8a8dad41604a95a0))。

**会话/状态模型 —— 文件即真源,而非用 DB 存 transcript:**
- 会话是 **append-only 文本日志**,一会话一文件(`~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl` 形态)。这与*我们当前的 jsonl 模型同构*。**[UNVERIFIED:精确路径模板与「崩溃最多丢一行」表述来自 gist]**([gist](https://gist.github.com/dabit3/bc60d3bea0b02927995cd9bf53c3db32))。
- **会话解析靠 `session.dmScope`**(见「多用户与隔离」)。关键:*"Session identifiers (`sessionKey`, session IDs, labels) are routing selectors, not authorization tokens."*(会话标识只是路由选择器,不是授权凭证)([security 已核实](https://docs.openclaw.ai/gateway/security))。
- **[UNVERIFIED:lane-aware 命令队列(单写者-每会话 + 每 lane 并发上限,文档化示例 main:4 / session:1 / sub-agents:8 / cron:parallel)来自社区 gist,官方文档未给出这些常量]**([gist](https://gist.github.com/royosherove/971c7b4a350a30ac8a8dad41604a95a0))。

**Prompt 装配 = 惰性、文件驱动、预算感知:** system prompt = 工具描述 + guardrails + **skills 仅作元数据**(name+description+path,full `SKILL.md` 按需 `read`)+ bootstrap 文件(`AGENTS.md / SOUL.md / TOOLS.md / IDENTITY.md / USER.md / HEARTBEAT.md`);`MEMORY.md` 在会话开始注入。其中 skills 元数据注入、按需读取已由官方 skills 文档确认;**[UNVERIFIED:~20k 字符截断阈值、注入副本超预算被截断而磁盘原文不变等具体数值来自 gist]**([skills 已核实](https://docs.openclaw.ai/tools/skills);[gist](https://gist.github.com/royosherove/971c7b4a350a30ac8a8dad41604a95a0))。

## 编排与子agent

- **子 agent**用于并行后台工作,**默认不可嵌套**、默认受限工具集(无 session/spawn 工具),结果回报给请求方聊天(带状态、运行时长、token 用量与成本)。**[UNVERIFIED:键格式 `agent:<agentId>:subagent:<uuid>`、默认 60min 归档等常量来自 gist,官方文档未逐条确认]**([gist](https://gist.github.com/royosherove/971c7b4a350a30ac8a8dad41604a95a0))。
- **多 agent 路由**:可有多个 agent,各自独立 workspace + per-agent sessions;每个 Gateway 一个嵌入式运行时,外部 harness(Claude Code / Codex 等)经 ACP 驱动([README](https://github.com/openclaw/openclaw);[agent-runtimes 已核实](https://docs.openclaw.ai/concepts/agent-runtimes))。
- Codex:作为 opt-in plugin harness;配 `openai/*` 模型引用时,经 Codex app-server 运行时执行嵌入式 agent turn([agent-runtimes 已核实](https://docs.openclaw.ai/concepts/agent-runtimes))。

## 记忆

**三层 Markdown 栈 + 一个语义检索层**(注:草稿写「四层栈」不准确 —— 官方文档明确是**三层**,语义检索是叠在这三层之上的*能力*,不是第四层)([memory 已核实](https://docs.openclaw.ai/concepts/memory)):

1. **Session context** —— 会话开始时加载的当前会话上下文(jsonl transcript)。
2. **Daily notes** `memory/YYYY-MM-DD.md` —— 「详细每日笔记、观察、会话摘要、原始上下文」的工作层;**今天+昨天自动加载**,其余被 `memory_search`/`memory_get` *索引但不注入*每轮 prompt。
3. **Long-term `MEMORY.md`** —— 精选的「持久事实、偏好、长期决策」;**每次会话开始注入**。

- **真源 = 工作区里的纯 Markdown**:*"The model only 'remembers' what gets saved to disk — there is no hidden state."*
- **语义检索**:内置后端用 **SQLite**,配置 embedding provider 后做 vector 相似度 + keyword 的**混合检索**;默认 OpenAI embeddings,可替换 Gemini/Voyage/Mistral/Ollama/Bedrock/Copilot。工具:`memory_search`(语义)、`memory_get`(读指定文件/文件块)。
- **[UNVERIFIED:chunk ~400 tokens / 80 overlap、混合分公式 `finalScore = vectorWeight×vectorScore + textWeight×textScore`、默认 70/30 权重 —— 官方 memory 文档未给出这些数值,仅见于社区 gist]**([memory 已核实](https://docs.openclaw.ai/concepts/memory);[gist](https://gist.github.com/royosherove/971c7b4a350a30ac8a8dad41604a95a0))。

**Dreaming(后台记忆固化,opt-in,默认关闭)** —— 这是最有借鉴价值的子系统([dreaming 已核实](https://docs.openclaw.ai/concepts/dreaming)):
- 默认 cron `0 3 * * *`(每天 3AM),且**依赖 heartbeat 触发**(若 heartbeat 未启用或 target=`none`,dreaming 会「blocked」)。
- 三个协作阶段:**light**(摄入/去重/暂存候选,不写 `MEMORY.md`)、**REM**(从近期短期轨迹提炼主题与反思信号,也不写 `MEMORY.md`)、**deep**(**提升引擎**:用加权打分排序并把通过门槛的行写进 `MEMORY.md`,写前从 live daily 文件 *rehydrate*,跳过过期/已删片段)。(注:草稿把顺序写成「light→REM→deep 流水线」略不准;按官方描述,真正做提升的是 deep。)
- **加权打分(deep 排序的六信号,已逐字核实)**:relevance .30、frequency .24、query-diversity .15、recency .15、consolidation .10、conceptual-richness .06;门槛 `minScore` / `minRecallCount` / `minUniqueQueries`(门槛具体阈值官方未细列)。
- `DREAMS.md` 是**给人审阅的日记,只读、不是提升来源**;机器状态在 `memory/.dreams/`(recall store、phase signals、ingestion checkpoints、locks),可选阶段报告在 `memory/dreaming/<phase>/YYYY-MM-DD.md`。
- 已知坑:dreaming 会把 Light/REM 阶段块写进 `memory/YYYY-MM-DD.md`,导致 heartbeat agent 误以为「今天 daily 已存在」而跳过真实会话活动的记录([已知 issue #66947](https://github.com/openclaw/openclaw/issues/66947))。

## 多用户与隔离

- **官方明确「非目标」**:*"OpenClaw is **not** a hostile multi-tenant security boundary for multiple adversarial users sharing one agent or gateway."* 支持的模型是 *"one trusted operator boundary per gateway (single-user, personal-assistant model)."* 推荐做法:*"one user per machine/host (or VPS), one gateway for that user"*;需要隔离敌对用户时 *"split trust boundaries (separate gateway + credentials, ideally separate OS users or hosts)"*([security 已核实](https://docs.openclaw.ai/gateway/security))。
- **`session.dmScope` 四档**(已逐字核实):
  - `"main"` —— 所有 DM 共享一个会话(**默认**,支持跨设备连续性)
  - `"per-peer"` —— 每个发送者跨渠道一个会话
  - `"per-channel-peer"` —— 渠道+发送者一对一隔离 DM 上下文(多用户场景的更安全选择)
  - `"per-account-channel-peer"` —— 多账号渠道变体,per-sender 隔离
- 共享 agent 时的关键约束:*"if several people can message one tool-enabled agent, each of them can steer that same permission set."* per-user 会话隔离只解决*隐私*,**不会**把共享 agent 变成 per-user 授权;**prompt injection 无法被 sandbox 掉**,任何被允许的发送者都能在 agent 策略内诱导工具调用([security 已核实](https://docs.openclaw.ai/gateway/security))。
- **安全分层**(官方列举):gateway 认证(`gateway.auth`)→ context visibility 过滤 → tool policy(allow/deny + sandbox 模式)→ exec approvals(security 模式 / ask)→ DM/group allowlist(pairing / allowlist)。**[UNVERIFIED:草稿所谓「7-layer」逐层枚举(device pairing/trust、outbound send policy 等)与「exec approvals 绑定精确 cwd+operands 但语义不完整」表述更细,部分来自第三方/gist 解读]**。
- **沙箱**:官方 README 提及隔离会话(per agent/workspace/sender)。**[UNVERIFIED:沙箱模式 off/non-main/all、scope session/agent/shared、Docker 默认后端(SSH/OpenShell 备选)等具体取值主要来自 gist/第三方文档]**([README](https://github.com/openclaw/openclaw);[gist](https://gist.github.com/royosherove/971c7b4a350a30ac8a8dad41604a95a0))。
- 第三方审计指出 **data-leakage + prompt-injection** 为真实风险([Giskard 审计](https://www.giskard.ai/knowledge/openclaw-security-vulnerabilities-include-data-leakage-and-prompt-injection-risks))。

## 扩展性

- **一等公民工具**:read/write/edit、exec/process、browser、web_search、message、cron、memory_search、sessions_spawn/_send、nodes、canvas、tts、gateway 等。**[UNVERIFIED:完整工具清单来自 gist]**([gist](https://gist.github.com/royosherove/971c7b4a350a30ac8a8dad41604a95a0))。
- **Skills**:一个 skill = 一个目录,含带 YAML frontmatter 的 `SKILL.md` + 支持文件;系统把**紧凑 XML 块(name + description + 文件位置)注入 system prompt**,full body 按需读取。安装:`openclaw skills install <slug>`(也支持 Git 仓库/本地目录)。**[注:官方 skills 文档未明确「版本化」语义]**([skills 已核实](https://docs.openclaw.ai/tools/skills))。
- **ClawHub** = 公共 **skill(及 plugin)注册中心**([clawhub 仓库](https://github.com/openclaw/clawhub))。社区 skill 生态规模较大,第三方 awesome 列表称数千条量级([VoltAgent/awesome-openclaw-skills](https://github.com/VoltAgent/awesome-openclaw-skills),具体计数为第三方口径)。
- **MCP**:仓库声明支持 Model Context Protocol 接入外部工具([README](https://github.com/openclaw/openclaw))。

## 调度与异步

- **Heartbeat**(已逐字核实)([heartbeat 已核实](https://docs.openclaw.ai/gateway/heartbeat)):周期性的*主会话* turn,默认 `"30m"`,**检测到 Anthropic OAuth/token auth 时为 `"1h"`**;`every:"0m"` 关闭。可选 `HEARTBEAT.md` 带 `tasks:`(每任务自带 interval),**只有 due 的任务进当轮 prompt**,无任务 due 则整轮跳过省 API。`isolatedSession:true`(全新会话无历史)+ `lightContext:true`(只留 `HEARTBEAT.md`)联合把单轮从 **~100K tokens 降到 ~2-5K**。**不创建** background task 记录;**cron 工作活动/排队时自动 defer**;`target: none(默认,不外发)| last | <channel>` 控制投递。
- **Cron**(已逐字核实)([cron-jobs 已核实](https://docs.openclaw.ai/automation/cron-jobs)):schedule 类型 `at`(一次性,ISO 8601 或相对如 `20m`)/ `every` / `cron`(5 或 6 字段 + 可选 `--tz`,默认 UTC)。执行风格 **main**(系统事件注入主会话 cron lane)/ **isolated**(每次 fresh session)/ **current**(创建时绑定)/ **custom**(命名会话,跨次保留历史)。状态持久在 **共享 SQLite**(重启不丢);**legacy `~/.openclaw/cron/` JSON 经 `openclaw doctor --fix` 迁移**(改 `.migrated` 后缀)。isolated 运行**带 forward 安全偏好**(thinking/fast/verbose、labels、用户显式选的 model/auth override),但**剥离 ambient channel 路由/elevation/origin 上下文**。投递 `announce` / `webhook` / `none`。**Command jobs**(跑确定性脚本、无模型)在 Gateway host 执行,**需要 `operator.admin`**(创建/更新/删除/手动跑 cron 同样需要)。
- **Webhook 触发**(已核实):`POST /hooks/wake`(把系统事件入队到主会话)与 `POST /hooks/agent`(跑 isolated agent turn);认证用 `Authorization: Bearer <token>` 或 `x-openclaw-token` header,**query-string token 被显式拒绝**([cron-jobs 已核实](https://docs.openclaw.ai/automation/cron-jobs))。

## 值得借鉴(对标我们的多用户Web学术agent平台)

1. **把「per-(channel,peer) 会话键」做成一等可命名的配置旋钮**:对应我们的 `(user_id, feature_key)`。OpenClaw 的教训是 —— 让 scope *显式且可命名*,并把会话键当作**纯路由、绝不当授权**。我们已用 `agent_sessions` 复合主键做到,值得把这条铁律写进文档([security 已核实](https://docs.openclaw.ai/gateway/security))。
2. **三层 Markdown 记忆 + SQLite 混合检索**,补我们缺失的长期记忆:per-user `MEMORY.md`(精选、开场注入)+ `memory/YYYY-MM-DD.md` daily(索引不注入)+ 经 `memory_search` MCP 工具走 SQLite FTS/vector 召回。文件即真源 → 可移植/可 git 备份,且避免硬绑一个 vector DB 依赖([memory 已核实](https://docs.openclaw.ai/concepts/memory))。
3. **Dreaming = 离线固化作业**:可解释的加权打分 + 门槛 gate + 「写前 rehydrate」,是把用户累积的检索会话转成「持久、可审阅知识」的干净蓝图,可作为夜间 cron 跑([dreaming 已核实](https://docs.openclaw.ai/concepts/dreaming))。
4. **预压缩记忆 flush**:在压缩长学术检索会话前,强制一轮「现在把持久笔记写下来」,让结论挺过 summarization,直接对症我们「无长期记忆」的缺口。**[注:此机制的具体实现来自 gist 描述,官方 dreaming/memory 文档侧重持久化到磁盘的总原则]**([gist](https://gist.github.com/royosherove/971c7b4a350a30ac8a8dad41604a95a0))。
5. **Heartbeat + cron 的 isolated-session 载荷**,补我们缺的「定时任务」能力:轻量周期 check-in(主会话)vs 脱离式 agentTurn 作业(fresh `cron:<jobId>` 会话,**不继承 ambient channel/elevation 上下文**)。「带 forward 安全偏好、丢 ambient 上下文」是个好的隔离默认值([cron-jobs 已核实](https://docs.openclaw.ai/automation/cron-jobs);[heartbeat 已核实](https://docs.openclaw.ai/gateway/heartbeat))。
6. **惰性 skill 加载**(元数据进 prompt、full body 按需 read),在扩展到大量学术 skill/模板时保持 context 精简 —— 与我们现有 skill 设置和 `--add-dir` per-feature 路子一致([skills 已核实](https://docs.openclaw.ai/tools/skills))。
7. **Webhook 触发端点**(`/hooks/agent` bearer-auth、isolated 跑)作为外部系统(期刊提醒、引用监测)替某用户发起 agent run 的模式;**注意学它「query token 一律拒绝」**,与我们 ws-ticket「只认 header/一次性 token」的取向一致([cron-jobs 已核实](https://docs.openclaw.ai/automation/cron-jobs))。
8. **[UNVERIFIED] lane-aware 命令队列(每 lane 并发上限)** 作为叠在 agentbridge 上的并发/成本控制原语 —— 思路可借,但具体常量需对真实代码库再核([gist](https://gist.github.com/royosherove/971c7b4a350a30ac8a8dad41604a95a0))。

## 局限

- **本质单租户。** 官方文档自陈*不是*敌对多租户边界,推荐**一用户一 gateway**,与我们「单共享文件系统 + 多用户」模型相反。它给出的修法(每用户独立 OS 账号/主机)很重;我们需要的是在容器/FS 层做真正的 per-user 隔离 —— 这正是 OpenClaw 承认它在单 gateway 内*不提供*的能力([security 已核实](https://docs.openclaw.ai/gateway/security))。
- **共享态 prompt-injection 是硬约束**:任何能给 tool-enabled agent 发消息的人都能操纵其完整权限集;exec approvals 绑定精确上下文但不语义建模每条加载路径;共享 browser profile 会泄漏 cookie([security 已核实](https://docs.openclaw.ai/gateway/security);[Giskard 审计](https://www.giskard.ai/knowledge/openclaw-security-vulnerabilities-include-data-leakage-and-prompt-injection-risks))。
- **文件即真源是 per-workspace 扩展、不是全局扩展**:Markdown-in-workspace + SQLite 对单 workspace 很好,但数千用户的 Web 平台需要 OpenClaw 未规定的 per-user 分区 + 索引策略。
- **Heartbeat/dreaming 耦合**:dreaming 在 heartbeat target=`none` 或不触发时会静默「blocked」,且已知会污染 daily 文件(issue #66947)—— 是个不能照抄的脆弱依赖([dreaming 已核实](https://docs.openclaw.ai/concepts/dreaming);[issue #66947](https://github.com/openclaw/openclaw/issues/66947))。
- **渠道中心化范式**:OpenClaw 围绕消息收件箱构建,而非带鉴权账号的 Web UI;它的 session/identity 模型(peers、pairing)映射到我们 JWT/`user_id` 的 Web 模型很别扭。该拿的是*记忆/调度/隔离*思路,而非渠道/pairing 身份层。
- **核验缺口**:最细的 loop/queue/并发数字来自社区 deep-dive gist,非官方文档 —— 队列上限、chunk 大小、token 数等精确常量在依赖前应对真实代码库再核([gist](https://gist.github.com/royosherove/971c7b4a350a30ac8a8dad41604a95a0))。

## Sources

官方主源(本轮逐字核验):
- https://github.com/openclaw/openclaw (README / 仓库)
- https://docs.openclaw.ai/concepts/agent-runtimes
- https://docs.openclaw.ai/concepts/memory
- https://docs.openclaw.ai/concepts/dreaming
- https://docs.openclaw.ai/gateway/heartbeat
- https://docs.openclaw.ai/automation/cron-jobs
- https://docs.openclaw.ai/gateway/security
- https://docs.openclaw.ai/tools/skills
- https://github.com/openclaw/clawhub
- https://github.com/openclaw/openclaw/issues/66947 (dreaming 污染 daily 文件 issue)

二手/社区(标 [UNVERIFIED] 的具体常量来源):
- https://gist.github.com/royosherove/971c7b4a350a30ac8a8dad41604a95a0 (社区 deep-dive)
- https://gist.github.com/dabit3/bc60d3bea0b02927995cd9bf53c3db32 ("You Could've Invented OpenClaw" 教学复刻)
- https://github.com/VoltAgent/awesome-openclaw-skills (第三方 skill 列表)
- https://www.giskard.ai/knowledge/openclaw-security-vulnerabilities-include-data-leakage-and-prompt-injection-risks (第三方安全审计)
- https://www.meta-intelligence.tech/en/insight-openclaw-gateway-commands (端口 18789 / 本地绑定,多源佐证)
