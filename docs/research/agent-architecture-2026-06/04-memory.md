> 维度文档 · 基于 01-current-architecture.md + findings/ · 2026-06

# 记忆体系:短期 / 会话 / 长期用户记忆 / 程序性

> 维度定位:把「Scholay 几乎为零的长期记忆(C4)」补成一套**多用户 Web 学术 agent 该有的两层记忆**。
> 核心主张 —— **记忆出 jsonl、进后端 DB(DB-as-truth)**,per-user 长期记忆作为 DB 行 + Anthropic
> memory tool 客户端契约落地,与 north-star 的 DB-as-truth / 两层记忆方向收敛。
> 本文只写记忆维度;沙箱见安全维度,任务底座/调度见调度维度,这里只在边界处引用。

---

## 1. Landscape:四层心智模型 + 范式对立

2026 年记忆已形成「**一层短期 + 三层长期**」的跨工具共识(findings/B-memory §概述):

- **短期 / 工作记忆**:最近对话轮、工具输出、中间状态 —— 在 LangGraph 就是 thread checkpointing。**这正是我们已有的 jsonl/transcript**。
- **情景(episodic)记忆**:"what happened" —— 过往交互/已完成任务的摘要。
- **语义(semantic)记忆**:"what is known" —— 用户偏好、研究兴趣、领域事实、概念关系。
- **程序性(procedural)记忆**:"how things should be done" —— 学到的工作流、评审规范、工具习惯。Mem0 自承「程序性记忆工具仍处早期」(findings/B-memory)。

本维度最有冲击力的是**范式对立**:Letta 主张「**DB 是真值,context window 是可重建视图**」—— 所有 state(记忆、用户消息、推理、工具调用)持久化在 DB,即便被挤出 context 也永不丢失;这与我们当前「**jsonl 即真值**」(01 §1 数据落点表:transcript「agent 自管,backend 黑盒」)**完全相反**(findings/B-memory §关键架构决策-1)。值得注意的是:我们**已经**对 prism 正文采用了 DB-as-truth(01 §1 表末行「prism LaTeX 正文 MySQL,DB-as-truth」),记忆维度只是把同一范式扩展到「用户记忆」。

外部坐标(均来自 findings,已核实):
- **Anthropic memory tool(`memory_20250818`)**:**客户端工具** —— Claude 只发工具调用,**由你的应用执行**到任意后端;六命令 `view/create/str_replace/insert/delete/rename`,操作于 `/memories` 目录。对我们这种已是 Claude-Code 风格的栈,改造成本最低(findings/B-memory §Anthropic)。文档措辞强硬:实现「**MUST** validate all paths to prevent directory traversal attacks」—— 与我们 C5 共享 FS 路径遍历风险**直接对应**。
- **Letta sleep-time**:异步后台 agent,每 N 步(`sleeptime_agent_frequency` **默认 5**)触发,用**更强模型**离线把 transcript 蒸馏进 memory blocks,用户侧零延迟(findings/B-memory §调度)。
- **Mem0 可组合作用域**:每次写入关联 `user_id`/`agent_id`/`run_id`(session)/`app_id`(org),分层存储、查询时合并(findings/B-memory §Mem0)。**干净映射到我们已有的 `(user_id, feature_key)` 复合键**(01 §5.1 `agent_sessions`)。
- **Zep/Graphiti 双时态**:事实带 `valid_at`/`invalid_at`,信息变化时「旧事实作废而非删除」,可查「现在为真」或「任意历史时刻为真」(findings/B-memory §Zep)。学术场景刚需(研究兴趣、作者所属随时间变)。
- **Hermes MEMORY.md/USER.md + 字符封顶**:两个主层 `MEMORY.md`(agent 个人笔记)+ `USER.md`(用户画像),session 开始作为**冻结快照**注入(保 prefix cache);**硬字符上限**(`memory_char_limit: 2200` ≈800 tok / `user_char_limit: 1375` ≈500 tok),**写溢出返回错误逼 agent 整合**而非静默丢弃(findings/B-hermes §记忆)。

---

## 2. 我们的现状:长期记忆几乎为零

**C4(高/记忆·多用户)是本维度的根因妥协**:CLI 原生有完整记忆能力,但 Web 层一行都没对接。

- **CLI 自带、Web 未接**:`agent/src/context.ts:getUserContext`(:155)调 `getMemoryFiles()`/`getClaudeMds()` 注入 `claudeMd`;`agent/src/memdir/` 提供 auto-memory 目录(`loadMemoryPrompt`)(01 §3.6)。但 01 §3.6 末句明确:「**这些都是 CLI 桌面能力,Scholay Web 层未对接 per-user 的长期记忆**」。它们是「机主一个人的」记忆,在共享容器里是**全局单份**,不是 per-user。
- **配置/技能/OAuth 全局单份**:`agent_config` 永远只 id=1(01 §5.2),skills/OAuth 全局 —— 无 per-user 模型选择、无 per-user 记忆面。
- **唯一的「记忆」是 transcript,且是软隔离**(C5,高/多用户·安全):全用户 transcript 落**单一共享** `~/.claude/projects/.../<sid>.jsonl`,隔离靠随机 sid + cwd 软约定(`SCHOLAY_ISOLATE_SESSIONS`),**非 OS user/容器隔离**(01 §5.4)。叠加 C1(Bash 无条件 auto-approve,绕过路径门)→ 被注入的模型可 `cat` 他人 jsonl(01 §7.4 暴露 caveat)。这恰是 Anthropic memory tool 强调「MUST 校验路径」要防的攻击面(findings/B-memory §局限)。
- **现有「注入前缀」不是记忆,且 in-band 可被绕过**(C9,中/安全):系统规则以文本标记 `[AGENT BRIDGE — STRICT RULES…]` prepend 进**用户 content**(01 §2.7,`ws.go:504-510`),非独立 system role —— 精心构造的用户消息可伪造结束标记解除约束。它是「规则注入」而非「记忆注入」,但**正是 per-user 记忆该接管的注入位**(见 §3 注入)。

一句话:**Scholay 当前没有跨 session 的语义/程序性用户记忆;短期记忆有(jsonl)但既不在 DB、也不隔离。**

---

## 3. 目标设计(具体到表 / 接口 / 触点)

### 3.0 总览:两层 + 三条写路径

```
per-session 短期        per-user 长期(新)
┌──────────────┐       ┌─────────────────────────────────────────┐
│ jsonl/transcript │ ──▶  │ user_memory_blocks (in-context, 注入)     │  ← 冻结快照
│ (或 DB checkpoint)│      │ user_memory_archive (语义可搜, 工具按需查) │  ← 检索
└──────────────┘       │ user_skills        (程序性, 渐进披露)      │
       │ 蒸馏(sleep-time)  └─────────────────────────────────────────┘
       └──────────────────────────▲  ▲  ▲
                  热路径 memory 工具 ┘  │  └ 后台 sleep-time worker
                                      隐私:用户可见查看/删除
```

三条写路径并行(LangMem 双轨 + sleep-time 第三轨):**(a)** session 开始注入(读);**(b)** 热路径 memory 工具(agent 自己写);**(c)** 后台 sleep-time worker(异步蒸馏)。

### 3.1 per-session 短期 = 现有 jsonl/transcript(或渐进迁 DB checkpoint)

短期记忆**不需要新建**:沿用 01 §3.5 的 jsonl + §6 的 history replay 同构契约。north-star 的「state 出 jsonl 进 DB」是更大的工程(影响 C5/编排维度),记忆维度**不强求**立刻迁;但建议把短期记忆的「**checkpoint 摘要**」作为 archival 的 episodic 来源(§3.4),为后续 DB-as-truth 留接口。

### 3.2 per-user 长期记忆:新表(建议 schema)

新增迁移(下一个编号,01 末写明现有迁移在 `docker/mysql/migrations/`)。两张核心表 + 一张程序性表,全部用已有的 `user_id`(+ 可选 `feature_key`)作用域键(Mem0 模型,findings/B-memory §值得借鉴-2),映射到 01 §5.1 `agent_sessions` 的复合键习惯。

**`user_memory_blocks`** —— in-context、字符封顶、session 开始冻结注入(Letta core memory + Hermes MEMORY.md/USER.md):

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | bigint unsigned AUTO_INCREMENT | PK |
| `user_id` | bigint unsigned NOT NULL | 作用域键(无 FK,沿 01 §5.1 服务层完整性惯例,见 C21) |
| `feature_key` | varchar(64) NULL | NULL=全 feature 共享;非空=feature 专属 block(Mem0 分层) |
| `label` | varchar(64) | `persona` / `human`(Letta 默认两 block)/ `research_profile` 等 |
| `value` | text | block 正文 |
| `char_limit` | int unsigned | 硬上限(Hermes:write 溢出**返回错误**逼整合,见 §4) |
| `read_only` | tinyint(1) | persona 类可设只读(Letta block 字段) |
| `updated_at` | datetime | |

唯一键 `uk_user_feature_label(user_id, feature_key, label)` —— 一个用户一个 (feature,label) 一行,**避免重蹈 C6**(代理键后无唯一约束致 get-or-create 双行);这里直接给 DB 硬约束。

**`user_memory_archive`** —— 大容量、语义/关键词可搜、按需查询(Letta archival + Zep 双时态):

| 列 | 类型 | 备注 |
|---|---|---|
| `id` | bigint unsigned AUTO_INCREMENT | PK |
| `user_id` | bigint unsigned NOT NULL | 作用域键 |
| `content` | text | 事实/摘要正文 |
| `embedding` | blob / vector NULL | 语义检索(无向量扩展则降级纯 FTS,见 §3.4 取舍) |
| `fts_content` | text | MySQL FULLTEXT(关键词路,findings/B-hermes:Hermes 用 SQLite FTS5) |
| `entity` | varchar(255) NULL | 实体匹配信号(Mem0 multi-signal 第三路) |
| `valid_at` | datetime | 双时态:事实生效时刻(Zep) |
| `invalid_at` | datetime NULL | 双时态:作废时刻(NULL=现在仍为真) |
| `source` | varchar(64) | 溯源:`tool` / `sleeptime` / `session:<sid>`(Graphiti episodes,findings/B-memory §值得借鉴-11) |
| `created_at` | datetime | |

索引:`FULLTEXT(fts_content)`、`idx_user_valid(user_id, invalid_at)`、`idx_user_entity(user_id, entity)`。**作废=置 `invalid_at` 非删除**(Zep 标志性思想),查询默认 `invalid_at IS NULL`。

**`user_skills`**(程序性,衔接 §4 与 03 维度 / Hermes Curator):`(user_id, name, description, body, char_limit, use_count, last_used_at, state, updated_at)`,`SKILL.md` 等价物,渐进披露(L0 list → L1 view → L2 file,findings/B-hermes §Skills)。

### 3.3 注入:session 开始冻结注入 per-user block(替代/互补 C9)

新增 bridge 钩子。当前注入逻辑在 `agentbridge/ws.go:504-510` 的 `buildInjectionPrefix`(C9,in-band 进用户 content)。目标:

- **新增 `FeatureSpec.MemoryProvider` 钩子**(spec.go,与现有 `Picker`/`PreUserMessage` 并列):session 开始时取该用户的 `user_memory_blocks`(按 feature_key 过滤合并),组装成 **frozen snapshot**(Hermes:「captured once at session start and never changes mid-session ... preserves prefix cache」,findings/B-hermes §关键架构决策),通过 agent 的 `--system-prompt` / providers 注入路径下发,而非临场拼进用户消息。
- **为什么这同时缓解 C9**:per-user persona/规则 block 走真正的 system 注入位 → 不再 in-band 进用户 content → 伪造结束标记的攻击面收窄。**取舍**:agent 容器当前从 system-init 注入的是 CLI 全局 `claudeMd`(01 §3.6);要支持 per-session 不同的冻结快照,需让 backend 在 `client.CreateSession`(01 §5.4)时把 per-user block 作为参数传入,agent 侧 `conversationService.ts` 子进程 spawn 时落地为该 session 的 system 注入。这是**对 agent 容器的一处真实改动**(不再「纯黑盒」),也是 north-star「两层记忆」要付的代价。
- **互补而非立即替换**:C9 的 STRICT RULES 是 feature 级安全约束,可继续走现路径;per-user block 叠加在其上。

### 3.4 写入:热路径 memory 工具 + 后台 sleep-time worker

**(a) 热路径 memory 工具(agent 显式写)** —— 实现 Anthropic `memory_20250818` 六命令 handler,但**后端指向 per-user 命名空间存储,而非共享 FS**(findings/B-memory §值得借鉴-9):

- 当前唯一幸存的 MCP 是 minicod(01 §7.3),且文件工具/Bash 已重开。新增一个 backend 托管的 memory 工具:agent 发 `view/create/str_replace/insert/delete/rename` 工具调用 → 经 01 §7.1 Layer C 后端权限门(`ws.go:575-604`)裁决 → backend handler 把操作落到 `user_memory_blocks`/`user_memory_archive`(按当前 session 的 `user_id` 命名空间),**绝不碰共享 FS**。
- **这直接关掉 C5 的记忆面路径遍历**:记忆不再是 FS 路径,而是 `(user_id, label)` 行,`user_id` 由 backend 从 session 映射(01 §5.1 `OwnsSession`)注入,agent **无法跨用户寻址**。Anthropic 的「MUST validate paths」在我们这里退化为「按 user_id 行级隔离」,比路径校验更硬。
- **请求归属**:写入带 `source=session:<sid>`,顺带补 C7 的缺口方向(WS usage `request_id` 为空)—— 记忆写至少能关联到 session。

**(b) 后台 sleep-time worker(异步蒸馏)** —— Letta sleep-time(findings/B-memory §值得借鉴-4):

- 新增后台 job(建在调度维度的任务底座上;若该底座未就绪,先用 `safego.Go` + 定时器起最小版,01 多处用 `safego.Go`)。触发:每 N 轮(仿 `sleeptime_agent_frequency` 默认 5)或 session 结束。
- 动作:用**更强模型**(可复用 `agent_config` 的 opus_model,01 §5.2)读该 session transcript → 蒸馏出 block 更新(`core_memory_replace` 语义)+ archival 事实(带 `valid_at`,冲突则把旧事实置 `invalid_at`,Mem0「latest truth wins」+ Zep 作废)。
- **默认异步、绝不内联热路径**(Mem0:`async_mode=True` 默认,阻塞响应管线会让用户感到延迟,findings/B-memory §调度)。用户侧零延迟,质量离线提升。
- **取舍**:sleep-time 是「额外烧一次更强模型」的成本/质量权衡(findings/B-memory §局限),不是免费午餐;接 01 §2.5 的 token 账本(`llm_token_usage`)记账,且应受 vip 配额约束(否则后台静默烧钱)。

### 3.5 检索:多信号 + rerank → 紧凑 Context Block

archival 的读路(agent 调 `search` 命令时):

- **多信号并行**(Mem0 multi-signal,findings/B-memory §Mem0):语义(`embedding` 余弦)+ 关键词(`FULLTEXT(fts_content)`)+ 实体(`entity` 匹配)三路打分融合,可选第二趟 rerank。
- **返回紧凑 Context Block 字符串**(Zep `thread.get_user_context` 返回的优化字符串,findings/B-memory §Zep):约 7K vs full-context 约 26K tokens(Mem0 benchmark),token 高效。
- **学术场景双时态作废**:默认只返 `invalid_at IS NULL` 的事实;支持「as-of 某时刻」查询(研究兴趣/所属随时间变,findings/B-memory §值得借鉴-7)。
- **取舍**:findings 明确「先上带 rerank 的向量,真有时序/多跳需求再上图」(Mem0 主动**移除**可遍历图避免 Neo4j 运维,findings/B-memory §扩展性)。**我们不引入图数据库**:`user_memory_archive` 单表 + FULLTEXT(+ 可选向量列)即可,`entity` 列做轻量实体信号,不做图遍历。这与 01 「建在已有 MySQL+Redis 上」一致。

### 3.6 隐私:用户可见的查看/删除(GDPR)

findings 明确「隐私/同意是应用层问题,库不替你解决」(findings/B-memory §局限)。落地:

- 用户端「我的记忆」页:列 `user_memory_blocks` + 分页 `user_memory_archive`,支持单条删除/清空。
- 后端新增 `/api/v1/user/memory/*`(list/delete/clear),复用 `UserAuthMiddleware`。
- 删用户时级联清记忆(注意 C21 无 FK,需服务层显式清,沿 01 §5.4 自愈/清理惯例)。

---

## 4. 字符封顶逼整合(Hermes)+ 程序性记忆

**成本控制靠硬字符上限**(findings/B-hermes §记忆):`user_memory_blocks.char_limit` 在 write 工具里强制 —— 写溢出**返回错误**(Hermes 错误体「Memory at 2,100/2,200 chars... would exceed」)而非静默截断,逼 agent 自己整合/去重。建议初值对齐 Hermes:persona/human ≈ 1375 chars,research_profile ≈ 2200 chars。**好处**:语义层是「精炼摘要」而非无界知识库,且配合 §3.3 冻结快照 → prefix cache 命中稳定(findings/B-hermes §局限:小上限是为成本/缓存而设计)。

**程序性记忆 = per-user `user_skills` 表**(衔接 03 维度 + Hermes Curator,findings/B-hermes §Skills/Curator):

- 写:复用同一 memory 工具或独立 `skill_manage`(create/edit/patch/delete);渐进披露控上下文成本。
- 治理:仿 Autonomous Curator —— 用量遥测(`use_count`/`last_used_at`)+ idle 触发 stale/archive/consolidate,**但必须带护栏**:默认 dry-run + 备份 + pin 保护(findings/B-hermes §局限:issue #18373 报告 Curator 未经 dry-run 自动归档 87→45 条技能)。**取舍**:程序性记忆工具整体不成熟(Mem0/LangMem 均承认),首期可只做「per-user skill 存储 + 注入」,Curator 自动治理延后。

---

## 5. 分期选项 + 取舍 + 改动触点

| 阶段 | 范围 | 影响妥协 | 改动触点 | 取舍 |
|---|---|---|---|---|
| **MVP(便宜渐进)** | 一个 per-user block(`user_memory_blocks`,先只 `human`/`research_profile` 两 label)+ session 开始冻结注入;无工具写,只靠后台从注册信息/前几轮补一行 | **C4**(从零→有)、缓解 **C9**(注入位从 in-band 用户 content 挪向 system) | 新迁移(`user_memory_blocks`);`agentbridge/spec.go` 加 `MemoryProvider` 钩子;`bridge.go` session 创建路径取 block;agent `conversationService.ts` 接 per-session system 注入;`/api/v1/user/memory` 读写 | 不动 archival/检索/sleep-time;agent 容器要破一点黑盒(注入 per-session system),但 token 收益(prefix cache)立竿见影 |
| **进阶(中等)** | + `user_memory_archive` + 热路径 memory 工具(`memory_20250818` 六命令 handler 指向 per-user 命名空间)+ 多信号检索(FULLTEXT + 可选向量)+ rerank;隐私查看/删除页 | **C5**(记忆面从共享 FS 路径 → user_id 行级隔离,关掉路径遍历)、部分 **C7**(写带 `source=session:<sid>`) | memory 工具 handler(backend);`ws.go:575-604` 权限门加该工具;archival 表 + FULLTEXT 索引;用户端「我的记忆」页 | 引入检索复杂度;**不上图数据库**(单表 + FULLTEXT,Mem0 反例);向量列可选,无向量扩展则纯 FTS 降级 |
| **完全(彻底)** | + 后台 sleep-time worker(更强模型异步蒸馏,每 N 轮触发)+ 双时态作废(`valid_at`/`invalid_at`)+ per-user `user_skills` + Curator 式治理(dry-run/备份/pin) | 巩固 **C4**;接 **C7**(记忆写关联 session/request)、与 **C3/C15**(需任务底座/调度)协同 | 后台 job(建在调度维度任务底座,或 `safego.Go` 最小版);蒸馏走 `agent_config.opus_model` + `llm_token_usage` 记账 + vip 配额;`user_skills` 表 + Curator job | sleep-time 额外烧更强模型(成本/质量权衡);依赖调度维度的 durable 任务底座;Curator 必须先有护栏再开自动归档 |

**与其他维度的边界**:
- DB-as-truth 把**短期** state 出 jsonl(C5 根治)是更大工程,归编排/多用户维度;记忆维度只把**长期**记忆做成 DB-as-truth,并为短期迁移留 checkpoint 接口。
- 沙箱分级(MCP-only→container/gVisor→microVM)归安全维度;记忆维度通过「记忆走 user_id 行而非 FS 路径」**绕过**而非解决 C1/C5 的 FS 隔离,但不替代沙箱。
- sleep-time/Curator 的**调度底座**(durable 任务 + Kanban)归调度维度(C15);记忆维度复用它,未就绪则起最小 `safego.Go` 版。

---

## 摘要(本维度对 Scholay 最重要的建议)

1. **新建 per-user 长期记忆表,记忆 DB-as-truth(直击 C4)**:`user_memory_blocks`(in-context、字符封顶、唯一键 `uk_user_feature_label` 防 C6 式双行)+ `user_memory_archive`(语义/关键词/实体多信号 + 双时态 `valid_at`/`invalid_at`),作用域键复用已有 `(user_id, feature_key)`(01 §5.1)。触点:新迁移 + `agentbridge` repository。
2. **session 开始冻结注入 per-user block,顺带缓解 C9**:新增 `FeatureSpec.MemoryProvider` 钩子(`agentbridge/spec.go`),把 per-user persona/research_profile 作为 frozen snapshot 走真正的 system 注入位(Hermes 保 prefix cache),取代/叠加 `ws.go:504-510` 的 in-band 前缀。需 agent `conversationService.ts` 接 per-session system 注入(破一点黑盒)。
3. **memory 工具指向 per-user 命名空间存储而非共享 FS(直击 C5 记忆面)**:实现 Anthropic `memory_20250818` 六命令 handler,后端按 `user_id` 行级隔离 —— Anthropic「MUST validate paths」在我们这退化为更硬的「行级隔离」,agent 无法跨用户寻址,关掉记忆维度的路径遍历。触点:backend handler + `ws.go:575-604` 权限门。
4. **后台 sleep-time worker 异步蒸馏(默认异步,绝不内联热路径)**:每 N 轮用更强模型(`agent_config.opus_model`)把 transcript 蒸馏进 block/archival,Mem0「latest truth wins」+ Zep 作废;接 `llm_token_usage` 记账并受 vip 配额约束。依赖调度维度任务底座(C15),未就绪先起 `safego.Go` 最小版。
5. **字符封顶逼整合 + 隐私可删除**:`char_limit` 写溢出**返回错误**(Hermes)控成本、稳 prefix cache;新增 `/api/v1/user/memory/*`(查看/删除,GDPR);程序性记忆 `user_skills` + Curator 治理须带 dry-run/备份/pin 护栏(Hermes #18373 教训)后再开自动归档。
