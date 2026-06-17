# Hermes Agent (Nous Research, 爱马仕)
> kind: project · confidence: high · last-checked: 2026-06

## 概述

Hermes Agent 是 Nous Research 开源(MIT)的**自我改进、可自托管、CLI 优先**的 AI agent,定位为长期运行的「数字员工」:持久记忆、自主创建技能、多 agent 任务看板(Kanban)、cron 定时,并能横跨多种消息平台对话。官方 tagline 是 "The agent that grows with you" / "The self-improving AI agent built by Nous Research",并自称 "the only agent with a built-in learning loop"。

- 当前版本:**v0.16.0 "Surface Release"(2026-06-05)**(官方 README / Releases 已确认)。
- License:**MIT**(官方 README 确认)。
- 消息平台:官方 README 列出 **Telegram、Discord、Slack、WhatsApp、Signal、Email、CLI**;另有 OpenAI 兼容 `/v1/chat/completions` server、ACP server、Electron 桌面端、浏览器 Admin Panel。Matrix 及"18+/22 个平台"等更大数字来自第三方汇总,版本相关,标记 [UNVERIFIED]。
- 核心闭环:**从经验创建技能 → 使用中修补技能 → 周期性提醒自己写入记忆 → 检索自己的历史 → 深化用户画像**。

## 关键架构决策

- **单一 agent 核心,多入口(surfaces)。** 一个 `AIAgent` 类(`run_agent.py`)负责对话循环(迭代预算、`handle_function_call` 工具执行、状态持久化)。gateway / CLI / ACP server / cron 调度器 / kanban worker 全部复用这同一个核心,因此各入口行为一致。
  - [来源置信度:这条核心论断在官方 README 与多份社区文档一致,类名/文件名细节来自社区 docs,标 medium]
  - → **对我们最干净的一条思想:一个 feature 是「在一个 agent 核心之上做配置」,而不是 fork 一份。** 直接印证我们 `agentbridge.FeatureSpec` 的方向。
- **并行工具执行。** 独立的工具调用通过 `ThreadPoolExecutor` 并发(max 8 workers,社区 docs)。[细节 medium]
- **SQLite-everywhere 持久化。** 状态库为 SQLite + FTS5 索引;session 携带 `parent_session_id` 血缘链,使上下文压缩时仍能回溯历史。配置在 `config.yaml`(优先级 env > file > defaults),home 目录 `~/.hermes/`。[来源:社区 docs + 官方记忆文档交叉印证,medium]
- **Frozen snapshot 模式(已官方确认)。** 系统提示词 + 记忆文件在 **session 开始时冻结、整个 session 内不再变更**——"The system prompt injection is captured once at session start and never changes mid-session. This is intentional — it preserves the LLM's prefix cache for performance." agent 写盘立即生效,但**下个 session 才进提示词**。
  - → **与我们直接相关:我们 jsonl-per-session 模型没有等价的 prefix-cache 纪律,而且我们的注入前缀是临场拼的。**

## 编排与子 agent

两个截然不同的原语(均以官方 `kanban.md` 文档为准,**高置信**):

- **`delegate_task` = 同步 fork→join(函数调用形态)。** 父 agent 阻塞等待匿名子 agent 返回,结果回到父上下文;无持久化、无 crash 续跑、上下文压缩后丢失。官方原文:"`delegate_task` is a function call; Kanban is a work queue where every handoff is a row any profile (or human) can see and edit."。适合短推理子任务、不涉及人。
- **Kanban = 持久消息队列 + 状态机。** 落在 SQLite(默认 `~/.hermes/kanban.db`,具名 board 在 `~/.hermes/kanban/boards/<slug>/kanban.db`),**WAL 模式**让读循环不阻塞 dispatcher 的 `BEGIN IMMEDIATE` 抢占事务。
  - 任务字段(官方确认):`title` / body / **`assignee`(profile 名,可空)** / `status` / 可选 **`tenant`** 命名空间 / **idempotency key** / `priority`(数值) / `max_runtime_seconds` / `max_retries` / `workspace` / 可选 `scheduled_at`。
  - 状态机(官方原文):`triage | todo | ready | running | blocked | done | archived`。
  - `task_events`:**append-only**、单调 `id` + `run_id` 指针,既驱动实时看板又做永久审计;`task_links`:父→子依赖。
  - **Dispatcher**(官方原文,默认在 gateway 内 `dispatch_in_gateway: true`):"every N seconds (default 60): reclaims stale claims, reclaims crashed workers (PID gone but TTL not yet expired), promotes ready tasks, atomically claims, spawns assigned profiles."——**所有父任务 `done` 时把 `todo → ready`**;`BEGIN IMMEDIATE` 原子抢占;**把被指派的 profile 拉起为它自己的完整 OS 进程**(`HERMES_KANBAN_BOARD` 环境固定),**不是进程内 subagent 蜂群**(官方/社区均明确 "no in-process subagent swarms")。连续失败 `failure_limit`(默认 2)后自动 block。
  - **Workspace kinds(官方原文)**:`scratch`(默认,`~/.hermes/kanban/workspaces/<id>/` 临时目录,**完成即删**)/ `dir:<path>`(已存在共享目录,绝对路径,**保留**)/ `worktree`(git worktree 于 `.worktrees/<id>/`,**保留**)。
  - → **对我们最值得偷的编排模型。**

## 记忆

> 注:官方**记忆文档**本身描述的是**两个主层 + 外部 provider 层**;DRAFT 里"三层(procedural/episodic/semantic)"是把分散的几个机制做的合成视角——其中 episodic(FTS5 会话检索)在官方是**独立 feature**,procedural(Skills)见下一节。下面据官方原文给出准确口径。

官方两个主记忆层(均存于 `~/.hermes/memories/`,session 开始时作为冻结快照注入系统提示词):
1. **`MEMORY.md`** — agent 的个人笔记(环境事实、约定、学到的东西)。
2. **`USER.md`** — 用户画像(偏好、沟通风格、期望)。

另有可插拔的**外部记忆 provider**(扩展而非替换内置层),官方记忆页列出 8 个:**Honcho(dialectic 用户建模)/ OpenViking / Mem0 / Hindsight / Holographic / RetainDB / ByteRover / Supermemory**。

机制要点(官方确认):
- **硬字符上限强制裁剪**:`memory_char_limit: 2200`(~800 tok)、`user_char_limit: 1375`(~500 tok)。**写入溢出会返回错误**而非静默丢弃——"when a write would exceed the limit, the `memory` tool returns an error",错误体示例 `"Memory at 2,100/2,200 chars. Adding this entry (250 chars) would exceed the limit..."`,逼 agent 自行整合。
- `memory` 工具动作:`add` / `replace` / `remove`,**没有 `read`**——记忆在 session 开始自动注入系统提示词,并带用量计 `[67% — 1,474/2,200 chars]`。
- `write_approval`(默认 `false`):置 `true` 时后台「自我改进」写入进 pending,经 `/memory pending` / `/memory approve <id>` / `/memory reject <id>` 复核。
- **跨 session 召回(episodic,独立 feature)**:基于 SQLite **FTS5** 的全文检索覆盖所有过往 CLI + 消息 session,配 LLM 摘要做跨 session 回忆。官方 README 原文确认 "FTS5 session search with LLM summarization for cross-session recall";~20ms 查询延迟来自第三方,标 [UNVERIFIED]。

社区扩展 Mnemosyne 用 sqlite-vec、混合打分 `50% vector / 30% FTS5 / 20% importance` — 第三方,[UNVERIFIED]。

### 自我改进闭环 + 技能创建/演化

**Skills(程序性记忆,官方确认):**
- 存为 `SKILL.md`(YAML frontmatter,**agentskills.io 开放标准**),按类别放 `~/.hermes/skills/`;frontmatter 字段含 `name`(≤64)、`description`(≤1024)、`platforms`、`required_environment_variables`、`setup.collect_secrets`、`metadata.hermes.config`(社区 docs / DeepWiki)。[字段细节 medium]
- `skill_manage`:`create` / `edit` / `patch`(搜索-替换)/ `delete`(仅用户技能)。**渐进式披露(progressive disclosure)省上下文**:L0 `skills_list()`= 仅元数据 → L1 `skill_view(name)`= 完整指令 → L2 `skill_view(name, path)`= 具体参考/模板文件。
  - → **渐进式披露是很强的上下文预算模式。**
- **自动创建触发条件在各源不一致**:官方 README 仅称 "Autonomous skill creation after complex tasks";社区 docs 说"5+ tool calls";DeepWiki/curator 文档则称是 discretionary/鼓励性(无硬性判据)。**[PARTIALLY UNVERIFIED:精确触发规则]**——不要假设有精确阈值。

**Autonomous Curator(官方 `curator.md`,高置信):**
- 引入版本:据 issue #18373 报告,**Curator release 对应版本 `v2026.4.30`**(日期式版本串)。DRAFT 写的 "v0.12.0" 来自第三方博客,与官方版本串不符,以 `v2026.4.30` 为准。
- 默认配置(官方原文):`enabled: true` / `interval_hours: 168`(7d) / `min_idle_hours: 2` / `stale_after_days: 30` / `archive_after_days: 90` / `prune_builtins: true`。**靠 idle 触发,不是常驻 daemon。**
- 一次 run 两阶段(官方称 "Automatic transitions / LLM review",非字面 "Phase 1/2"):
  1. **确定性转换(无 LLM)**:未用 30d → `stale`;未用 90d → 移到 `~/.hermes/skills/.archive/`。
  2. **LLM review**:`AIAgent` 的后台 fork、单次 aux-model pass、`max_iterations=8`,**只 review agent 自建技能**,逐条决定 keep / patch(`skill_manage`)/ consolidate(合并重叠)/ archive。
- **用量遥测** `~/.hermes/skills/.usage.json`:`use_count` / `view_count` / `patch_count` / `last_used_at` / `last_viewed_at` / `last_patched_at` / `created_at` / `state` / `pinned` / `archived_at`。
- **安全机制(官方确认)**:`hermes curator pin <skill>` 钉住的技能豁免所有自动转换与删除;每次 run 报告 `~/.hermes/logs/curator/<ts>/{run.json,REPORT.md}`;每次真实 run 前 tar.gz 快照 `~/.hermes/skills/.curator_backups/<utc-iso>/skills.tar.gz`;`hermes curator run --dry-run` / `hermes curator rollback` 可预览/回滚。

**离线演化(`hermes-agent-self-evolution`,独立 repo,官方 README 确认):**
- 用 **DSPy + GEPA**(Genetic-Pareto Prompt Evolution):GEPA 读执行 *traces* 推断「为什么失败」,再提定向变异。
- **无需 GPU——纯 API,~$2–10/run**(官方原文 "No GPU training required... ~$2-10 per optimization run")。
- **5 阶段路线,目前仅 Phase 1 上线(`SKILL.md` 优化)**;Phase 2–5(工具描述 → 系统提示词分段 → 工具代码 → 持续改进循环)仍 planned。
- 每个变体须过 5 道闸:完整 `pytest tests/ -q`(100%);尺寸限制(skills ≤15KB、tool descriptions ≤500 chars);prefix-cache 兼容;语义保真;**人工 code review 后才部署(从不直接 commit)**。
- 官方 README 标注 "ICLR 2026 Oral, MIT licensed"。

## 多用户与隔离

- **Profiles = 多租户单元(官方 `profiles.md`)。** 一个 profile 就是「一整个 Hermes home 目录」,各自 `config.yaml` / `.env`(各自 API key 与平台 token)/ `skills/` / `sessions/` / 记忆文件 / gateway 状态;经 `HERMES_HOME` 环境变量切换,可并发跑。`hermes profile list/create/use/export/import`。
- **Token lock 防凭据撞车(官方确认)**:两个 profile 误用同一 bot token 时,第二个 gateway 被拦并报出冲突 profile 名(支持 Telegram/Discord/Slack/WhatsApp/Signal)。
- **执行沙箱(官方确认)**:六种 terminal backend——`local`、Docker、SSH、Singularity、Modal、Daytona(部分文档另列 Vercel Sandbox)。客户面工作需用 Docker/SSH/Modal/Daytona/Singularity 等更强边界。
- **网络/SSRF**:v0.16.0 release note 原文确认 "SSRF off-loop hardening"(把 SSRF URL 检查移出 async 路径的事件循环)+ "subprocess credential stripping"。但 DRAFT 里具体的「cloud-metadata SSRF floor 屏蔽 `169.254.169.254`」未在官方 release notes 找到确认,**[UNVERIFIED:具体的 metadata-IP 屏蔽]**——通用 SSRF 硬化是确认的。
- **已知多 profile 隐患(官方 issue,值得警惕)**:`#4587` 报告 `kill_gateway_processes()` / `release_all_scoped_locks()` 是 profile-blind(`hermes gateway stop` 会杀掉机器上所有 gateway);`#17080` 报告 `profile create --clone` 会复制独占平台凭据造成冲突。**说明这套「每 profile 一份 home/进程」的隔离并非天然干净。**

## 扩展性

- **内置工具数量(版本相关,[UNVERIFIED:精确计数])**:第三方称 ~40–64 个(`hermes tools` 开关),分组:web(`web_search`/`web_extract`)、终端/文件(`terminal`/`process`/`read_file`/`patch`)、浏览器(`browser_navigate/snapshot/vision`)、媒体(`vision_analyze`/`image_generate`/`text_to_speech`)、编排(`todo`/`clarify`/`execute_code`/`delegate_task`)、记忆(`memory`/`session_search`)、自动化(`cronjob`/`send_message`),以及动态 `mcp_<server>_<tool>`。
- **后台进程模型**:长跑命令返回一个 session id;`process` 工具以 `list/poll/wait/log/kill/write` 管理(第三方 docs,medium)。→ 适合我们长编译/分析 job。
- **MCP**:原生 client,stdio + HTTP 传输,选择性加载工具 + utility policy,支持 sampling(server 发起的 LLM 调用),`mcp_servers` 配置改动自动 reload;工具前缀 `mcp_<server>_<tool>`;`hermes mcp serve` 把 Hermes 自身暴露为 MCP server(社区 docs,medium)。
- **Plugins**:把 Python 文件丢进 `~/.hermes/plugins/`;记忆 provider 也是可插拔(社区 docs)。

## 调度与异步

- **Cron job 是 agent 任务,不是 shell 命令(官方 README 确认)。** 每个定时 job 拉起一个**全新 `AIAgent`**(自带提示词、可选技能、多平台投递);job 持久化、重启后存活;自然语言创建("daily reports, nightly backups, weekly audits")。
- **Promptware Defense(官方 release 确认是 v0.15.0 "Velocity Release",非 DRAFT 所说 v0.13.0)**:对**工具输出、被召回的记忆、存储的技能**做注入扫描(~15 个 Brainworm/C2 模式);另有 `security-guidance` 插件 pattern-match 危险代码写入。→ **对「被存储/被调度的任务体在执行前做提示注入扫描」这一模式,我们目前缺失。**
- **Kanban dispatcher 本身是 cron 驱动**(默认 60s),是异步工作引擎(claim→spawn→heartbeat→reclaim)。

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **三层记忆拆分**(我们目前几乎为零):episodic = 对 `agent_sessions` transcript 建 **MySQL 全文 / 搜索索引**;semantic/user-model = **每用户一行、字符封顶的 `MEMORY.md`/`USER.md` 等价物**,session 开始注入;procedural = **每用户 Skills 表**。**「字符上限逼整合」**这招把成本框住。
2. **Session 开始冻结系统提示词 + 记忆快照**以保 prefix cache——我们现在临场拼提示词,这是直接的 token 成本收益,可与我们的 `buildInjectionPrefix` 互补。
3. **Kanban 作为多 agent + 调度的底座**:一张持久 SQLite/MySQL 任务板(`assignee` / `task_links` 依赖 / `task_events` append-only 审计 / 状态机)+ cron dispatcher(依赖满足才 promote、原子 claim、每任务隔离 worker 跑)。一次补齐我们缺的「长跑/后台/定时」与「多 agent」,且建在我们已有的 MySQL + Redis 锁上。
4. **Skills + 渐进式披露(L0 list → L1 view → L2 file)** 控技能上下文成本;再加 **Autonomous Curator**(用量遥测 → idle 时 stale/archive/consolidate,带 dry-run + 备份 + pin 保护)防技能膨胀——直接延伸我们已有的技能管线(`--add-dir /prism-add`)。
5. **Workspace kinds(`scratch`/`dir`/`worktree`)** 是对我们「每 session cwd 隔离」缺口的干净抽象;`scratch` 完成即删正是我们「删 session → 清 cwd」的需求。
6. **`(provider,model) → api_mode` resolver + 凭据池 + fallback 链**——把我们的 `agent_config` / `third_party_accounts` 形式化成厂商中立的开关(我们已在 `third_party_accounts` 做 key 池)。注:Hermes 的多模型 resolver/19+ provider 等具体细节多来自第三方,标 [UNVERIFIED],但「resolver + key 池」这个**模式**值得借鉴。
7. **我们缺的安全原语**:发给 LLM 前的 secret/PII 脱敏;**对存储/被调度任务体的提示注入扫描**(Hermes Promptware Defense);workspace 限定的文件读取;以及 agent 容器的容器化硬化默认值。
8. **一个 agent 核心,feature = 配置**(其 `AIAgent` 被 CLI/gateway/cron/kanban 复用)——印证并锐化我们 `agentbridge.FeatureSpec` 方向。
9. **离线 GEPA 式技能/提示词演化,以测试 + 人工 PR 为闸**——一条安全、免 GPU、从生产 trace 真正「改进」提示词/技能的路。
10. **后台 `process` 工具(poll/wait/log/kill)** 比同步调用更适合我们长编译/PDF 解析/分析 job。

## 局限

- **Profiles ≈ 独立 OS home/进程,不是轻量的 per-request 租户。** 真隔离很重(每 profile 一个 `~/.hermes-<name>/` + 一个 gateway);Web 平台多用户场景 1:1 照搬不可扩展——借**隔离保证**,别借「每 OS 用户一份」的机制。且官方 issue(#4587/#17080)显示这套多 profile 本身有 profile-blind 杀进程、凭据克隆撞车等坑。
- **`local` terminal backend = 宿主级访问**(dev 默认);只有 Docker/SSH/Singularity/Modal/Daytona 等 backend 才是沙箱化的。Web 产品必须默认沙箱 backend,绝不能用 `local`。
- **Kanban 把每个任务拉起为完整 OS 进程**——稳健但资源重;少量 agent 行,成千上万并发 Web 用户则需加池/配额层。
- **技能自动创建触发规则文档不全/互相矛盾**("5+ tool calls" vs "discretionary")——别假设有精确规则。**[PARTIALLY UNVERIFIED]**
- **Self-evolution 主要还在 Phase 1**(仅 `SKILL.md` 上线;提示词/工具代码/持续循环仍 planned),且刻意要求**人工 PR review**——它**不是**无人值守的自我改写。
- **记忆字符上限很小**(2,200 / 1,375 chars)——为成本/缓存而设计,意味着语义层是「精炼摘要」而非知识库;重召回靠 FTS5 episodic + 外部 provider 卸载。
- **Curator 会过度归档**:issue **#18373**(已关闭,PR #18389 修复)报告它在 `v2026.4.30` 升级后**未经 dry-run/审批就自动 archive/consolidate 了用户自建技能**(87 → 45 条),根因是默认开启 + gateway 后台 cron 首跑无 prior state 拦。→「自主」修剪上线前必须有护栏(pin、默认 dry-run)。
- **若干深层内部**(精确 SQLite schema、压缩算法、FTS5 ranking)被引用但未完全公开;工具计数(40 vs 64)、技能目录数等随版本/来源浮动——按版本相关处理。**[partially UNVERIFIED]**
- **从 DRAFT 已剔除/降级的项**:容器硬化具体值(read-only rootfs、drop 全部 cap 仅留 DAC_OVERRIDE/CHOWN/FOWNER、no-new-privileges、PID 256)未在官方 release notes 找到——**[UNVERIFIED,仅见于第三方 blakecrosley/runoob,勿当事实]**;`169.254.169.254` 元数据屏蔽同样降为 [UNVERIFIED](官方只确认通用 "SSRF off-loop hardening")。

## Sources

- https://github.com/NousResearch/hermes-agent (官方 repo / README)
- https://github.com/NousResearch/hermes-agent/releases (版本与安全说明:v0.16.0/v0.15.0/v0.14.0)
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/kanban.md (官方 Kanban 文档)
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/curator.md (官方 Curator 文档)
- https://hermes-agent.nousresearch.com/docs/user-guide/features/memory (官方记忆文档)
- https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md (官方 Profiles 文档)
- https://github.com/NousResearch/hermes-agent-self-evolution/blob/main/README.md (官方 self-evolution repo)
- https://github.com/NousResearch/hermes-agent/issues/18373 (Curator 过度归档 issue,已关闭/PR #18389)
- https://github.com/NousResearch/hermes-agent/issues/4587 (多 profile gateway 不安全 issue)
- https://github.com/NousResearch/hermes-agent/issues/17080 (profile --clone 凭据克隆冲突 issue)
- https://deepwiki.com/NousResearch/hermes-agent (DeepWiki 架构索引,含 kanban/skills,社区二手)
- https://github.com/mudrii/hermes-agent-docs (社区综合文档,二手)
- https://github.com/SamurAIGPT/awesome-hermes-agent (社区资源汇总,二手)
- https://blakecrosley.com/guides/hermes (第三方 v0.16 参考,部分细节 [UNVERIFIED])
- https://www.runoob.com/ai-agent/hermes-agent-tools.html (第三方工具清单,版本相关 [UNVERIFIED])
- https://magnus919.com/2026/05/the-hermes-kanban-a-complete-guide-to-multi-agent-task-orchestration/ (第三方 Kanban 指南,二手)
