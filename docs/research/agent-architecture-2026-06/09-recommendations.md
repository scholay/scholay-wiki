> Keystone 文档 · 综合 01 现状 + 02–08 各维度 + findings/ · 2026-06-14

# 综合优化建议与分期路线图 (Recommendations & Roadmap)

> 这是整个调研的**收口文档**。前面 8 篇分别测绘了现状(`01`)、对标了全网开源 agent
> (`02` + `findings/`)、并按 6 个维度给出提案(`03`–`08`)。本文把它们拧成**一条排过序、
> 标了风险、覆盖全部妥协 C1–C22 的执行路线**,并在最后列出**需要你拍板的岔路口决策**。
>
> 阅读顺序建议:本文 §1(一句话结论)→ §2(north-star 图)→ §4(路线图,核心)→ §7(待决策);
> 想深挖某一维度再回去看对应的 `0X-*.md`。

---

## 1. 一句话结论

**现有 agent「能用、且在单用户/单实例下设计得相当克制」,但它本质是一个桌面 CLI(cc-haha)硬套多用户 Web,把本该是「硬边界」的东西退化成了「软约定」。** 优化的主线不是推倒重来,而是沿四条轴把软约定逐步换成硬保证:

| 轴 | 现状(软约定) | 目标(硬保证) | 主要妥协 |
|---|---|---|---|
| **状态** | agent 自管 jsonl,backend 黑盒 | DB 记权威 event/turn(渐进)→ DB-as-truth(北极星) | C5/C7/C21 |
| **隔离** | 随机 sid + cwd + 后端路径门(Bash 绕过) | per-session 沙箱 + 密钥隔离 + Redis 锁解单实例 | C1/C2/C3/C5/C12 |
| **记忆** | 几乎为零(CLI 有但 Web 没接) | 两层记忆:per-session + per-user 长期 | C4/C9 |
| **调度** | 完全缺失,只有前台同步交互 | `agent_jobs` 任务底座 + dispatcher + 异步 HITL + 通知 | C15/C10/C11 |

外加一条贯穿的**前端轴**:resumable streams + AG-UI 词汇表 + Agent Inbox + 审批卡,把「长任务/后台/审批」这些 CLI 时代不存在的形态在 Web 上表达出来。

> **最关键的认知**:用户问的「定时任务」「长期记忆」「多用户」三件事,**不是三个独立功能,而是同一个根因(state 在黑盒 jsonl 里、隔离靠软约定)的三个症状**。所以路线图把「把 state 和锁收归后端」放在最前面——它是后面一切的地基。

---

## 2. North-Star 架构

```
┌── 浏览器 (多 tab / 多线程) ──────────────────────────────────────┐
│  Agent Inbox(跨 session 任务面)  │  对话(resumable stream)        │
│  - run 列表 + 状态 + 完成红点      │  - AG-UI 事件词汇表             │
│  - HumanInterrupt 审批卡          │  - 断连≠stop,挂载即 resume     │
└───────────────┬──────────────────────────────────────────────────┘
                │ SSE/WS(AG-UI 帧) + POST(用户输入) + Redis 重放缓冲
                ▼
┌── backend (Go) ── 从「字节搬运桥」抬升为「编排 + 状态 + 记忆 的主」──┐
│  agentbridge(收口):StandardHooks · RunBackgroundTurn(server-side  │
│    一等公民) · ArtifactDelivery · ReviewRound(退役 Trusted 后门)    │
│  agentjob(新):agent_jobs/agent_job_events + 60s dispatcher        │
│    (Redis SETNX claim) + 异步 HITL(blocked + /resume)             │
│  memory(新):user_memory_blocks + user_memory_archive +            │
│    memory_20250818 handler(per-user 命名空间) + sleep-time worker  │
│  权威状态:agent_turns(token 归属) → (北极星) DB-as-truth event log │
│  锁:Redis(displacement / quota-reset / job-claim / awaitable)     │
│  MySQL · Redis · MinIO · message+websocket hub(完成通知)           │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTP(CreateSession/喂消息) + per-session 凭据注入
                ▼
┌── agent 容器 (cc-haha) ── 瘦身 + per-session 硬隔离 ──────────────┐
│  每 session 一个隔离 worker:                                       │
│   - /workspace/<sid> 强隔离(非 root uid,够不到父/兄弟)            │
│   - 上游 key 运行时注入(SecretRegistry),绝不烤进共享 providers.json│
│   - Bash 仅对需要的 feature(claw)开,且在沙箱内(bubblewrap/microVM)│
│   - memory 工具 → 回调 backend per-user 命名空间(不碰共享 FS)      │
│  egress proxy(allowlist 模式,抗 DNS rebinding) · prism_tex(已硬沙箱)│
└──────────────────────────────────────────────────────────────────┘
```

与现状的差别浓缩成一句:**把「一个共享 `~/.claude` + 进程内锁 + in-band prompt」换成「per-session 沙箱 + Redis 锁 + DB 记忆/状态 + out-of-band 注入」。**

---

## 3. 妥协 → 建议 → 分期 总映射(C1–C22 全覆盖)

> P0=快赢(低风险/不碰 agent 容器/不重写 state) · P1=横扩+后台地基 · P2=隔离+记忆+异步 · P3=北极星

| C | 妥协 | 建议(详见) | 分期 |
|---|---|---|---|
| C1 | Bash 无条件 auto-approve | 收成 per-feature opt-in(仅 claw)→ 审批化 → 进沙箱(`05`/`08`) | P0→P2 |
| C2 | displacement 进程内单实例 | Redis 锁(`03`/`05`) | P1 |
| C3 | 配额 reset 进程内 mutex,横扩失效 | Redis SETNX(与 job-claim 复用同一原语,`05`/`06`) | P1 |
| C4 | 无 per-user 长期记忆 | 两层记忆 + memory 工具 + sleep-time(`04`) | P1→P2 |
| C5 | 共享 FS jsonl 软隔离 | per-session FS 强隔离(`05`)→ DB-as-truth(`03`) | P2→P3 |
| C6 | 首次 get-or-create 可双行 | 唯一约束(生成列,`04`/`03`) | P0 |
| C7 | 配额检查与扣减解耦 | `agent_turns` 表带 request_id(`03`) | P0 |
| C8 | 配额 fail-open | 交互态保留,后台 job fail-closed(`06`) | P1 |
| C9 | prompt 注入前缀 in-band | frozen-snapshot 走真 system 位(`04`)+ 注入前扫描(`06`/`08`) | P2 |
| C10 | SessionOptions 不覆盖 server-side | `RunBackgroundTurn` 收口(`06`/`03`) | P2 |
| C11 | 配额钩子无 server-side 等价 | 同上 `RunBackgroundTurn` | P2 |
| C12 | prism Trusted ws-ticket 后门 | 抽 `ReviewRound` bridge 原语,强制归属校验(`03`) | P0/P1 |
| C13 | artifact 交付是 claw 私有 | 抽 `ArtifactDelivery` bridge 一等公民(`03`/`07`) | P2 |
| C14 | AutoApprovePermission 单 bool 语义分裂 | Codex 两轴权限(能力×何时问)+ 审批卡(`07`/`08`) | P2 |
| C15 | 无后台任务面 + 无通知 | `agent_jobs` 底座 + dispatcher + 通知 + Inbox(`06`/`07`) | P1 |
| C16 | CheckOrigin 恒 true | WS origin allowlist(`08`) | P0 |
| C17 | 逐帧同步转发无缓冲 | resumable streams 的 Redis 缓冲顺带解(`07`) | P2 |
| C18 | 桌面遗留物随容器装运 | 构建期裁剪 + 长期瘦镜像(`02`/`08`) | P0/P3 |
| C19 | 死代码 + 三 feature hooks 重复 | `StandardHooks` 收口(`03`) | P0 |
| C20 | 文档 drift(RedisDailyCap 不存在) | 修 CLAUDE.md(`03`) | P0 |
| C21 | 无 user_id/owner_id 外键 | DB-as-truth 时一并补(或服务层维持,`03`) | P3 |
| C22 | api_key 掩码基于内容 | 改 sentinel/长度判定(`08`) | P0 |

**一个事实**:**P0 全是几小时到一两天的小改,却能清掉 8 个妥协(C6/C7/C16/C19/C20/C22 + C1 收敛 + C12 收口),且零架构风险。** 建议无论后续大方向怎么定,P0 先做。

---

## 4. 分期路线图(核心)

每个 phase 标注:**目标 / 动作 / 关闭的 C / 主要触点 / 风险 / 为什么是这个顺序**。

### P0 — 快赢:零架构风险的收敛与纠偏(~2–4 天)

**目标**:把「明显该修、改动小、不碰 agent 容器、不重写 state」的全清掉,顺手为后面铺垫。

动作:
1. `agentbridge.StandardHooks(feature, action, vip)` 收口三 feature 逐字重复的 `preUserMessageChain`/`onMessageComplete`,删 `SetLLMUsageRecorder` 死代码。**[C19]**
2. 新表 `agent_turns(id, user_id, feature_key, agent_session_id, request_id, input_tokens, output_tokens, cache_*, model, created_at)`,在 `hooks.go:recordAgentTokens` 旁路写——立刻拿到**精确 token 归属**,为「前置预扣」打底。**[C7]**(这是 `03` 的「选项 A」,不重写 agent,纯旁路。)
3. `agent_sessions` 给单会话 feature 补回唯一约束:用生成列 `user_feature_anchor`(仅当 owner 两列为 NULL 时取 `user_id:feature_key`)+ `uk`,堵并发双行(沿用 [[library-default-folder-uniqueness]] 手法)。**[C6]**
4. **Bash 收敛**:`DEFAULT_DISALLOWED_TOOLS` 默认含 Bash/BashOutput/KillShell,只对 **claw** per-feature opt-in 重开(smart_search/peerreview/prism 本就不需要)。这是 config 改动、零代码风险,却把「软隔离三角」里最尖的一角先削平。**[C1 收敛]**
5. 退役 prism `IssueWSTicketTrusted` 后门的「静默降级」,改成**强制归属校验**(查不到归属即拒,而非 warning fallback)。**[C12 收口]**
6. WS `CheckOrigin` 加 origin allowlist(读 nginx 配的同源)。**[C16]**
7. `agentconfig` api_key 掩码改 sentinel 判定(不再 `contains "****"`)。**[C22]**
8. 修 CLAUDE.md 的 `RedisDailyCap` drift,改指向真实的 `internal/vip` 链路。**[C20]**

风险:极低。触点集中在 `agentbridge/{hooks,bridge}.go`、`agentconfig/handler.go`、`prism/ws_round.go`、`conversationService.ts`(仅 denylist 常量)、一个迁移 0033。

### P1 — 横向扩展 + 后台任务地基(~1–2 周)

**目标**:解开「单实例钉死」,并**端到端交付用户明确要的「定时任务 + 跑完通知我」**。这两件可并行,且都不必重写 state。

动作:
1. **Redis 锁解单实例**:`activeWSConns`(displacement)与 `vip/quota.go` 的 256-shard reset mutex 换成 **Redis SETNX + 租约**。两处代码注释本就写了「计划用 Redis 锁但未实现」,这只是把计划落地。**[C2/C3]**
2. **`agent_jobs` 任务底座**(`06` 的 MVP):migration 0033 建 `agent_jobs` + `agent_job_events`(append-only 审计)→ `internal/agentjob/`(repo/service/dispatcher)→ 60s ticker dispatcher 用 **Redis SETNX 原子 claim**(与动作 1 同一把锁原语,天然多实例安全)→ worker = `CreateSession` 喂 prompt 跑完(**fresh-agent-per-run,先不做 durable/HITL**)。触发支持 cron(6 段)+ 一次性 + API。**[C15]**
3. **完成通知**(运行解耦):job 终态 → 推 `internal/message`(`user_messages` 站内信,离线可见)+ `internal/websocket/hub.go`(在线 toast)。零新基础设施。**[C15]**
4. **per-user 记忆 MVP**(`04` 的 MVP):建 `user_memory_blocks`(字符封顶、`uk_user_feature_label`)+ 一个 `FeatureSpec.MemoryProvider` 钩子,session 开始把用户 research-profile/persona block 注入。**先用现有注入位**(后续 P2 升级成 out-of-band)。**[C4 起步]**
5. 后台 job 配额 fail-closed(Redis 挂则暂缓,而非放行)。**[C8]**

风险:中。动作 1 是唯一需要小心的(并发锁正确性),但有现成键名规划。后台任务线**本就无 WS pipe**,所以它从第一天就是多实例安全的——这是先做后台线的额外好处。
为什么这个顺序:**这一档就满足了用户「每周一汇总我领域新 arXiv + 跑完通知我」的明确诉求**,且不碰 agent 容器、不碰交互态代码、不重写 state。投入产出比最高。

### P2 — 隔离强化 + 记忆深化 + 异步 HITL + resumable streams(~3–6 周)

**目标**:把软隔离换成硬隔离,把记忆做成真能力,把审批/长流做成「不靠前台在线」。这一档开始**有限度地破 agent 容器黑盒**。

动作:
1. **per-session 沙箱**(`05`):每会话 root `/workspace/<sid>`(非 root uid,够不到父/兄弟,OpenHands EFS-access-point 模式)+ workspace kind(scratch 完成即删 / worktree 保留)。**把 cwd 软边界抬成 OS 强制边界。** **[C5]**
2. **per-session 密钥隔离**(`05`):上游 key 运行时注入会话进程(OpenHands SecretRegistry),绝不烤进共享 `providers.json`——即便 Bash 跑起来,`printenv`/`cat` 也只看到本会话授权的 key。**这是 C1 暴露面的真正解。** **[C1]**
3. **记忆完全体**(`04`):实现 Anthropic `memory_20250818` 六命令 handler → 后端 **per-user 行级隔离**存储(不碰共享 FS,把 Anthropic「MUST validate paths」升级成更硬的行级隔离)+ `user_memory_archive`(多信号检索 + 双时态 `valid_at`/`invalid_at`,不上图数据库)+ **后台 sleep-time worker**(每 N 轮用更强模型蒸馏 transcript→block/archival,异步默认,接 P1 任务底座)。frozen-snapshot 注入改走真 system 位。**[C4/C5 记忆面/C9]**
4. **`RunBackgroundTurn` 收口**(`06`/`03`):把 server-side run 抽成 bridge 一等公民(内走 `preUserMessageChain`+`OnMessageComplete`+`SessionOptions`),peerreview 改用它。**一次消掉 C10/C11**(+ 巩固 C19)。
5. **durable journaling + 异步 HITL**(`06` 进阶):`agent_job_events` 的 llm_call/tool_call checkpoint + reclaim 续跑(**turn 级,非 token 级——黑盒硬约束**)+ awaitable 挂起审批(`blocked` + `/resume`,释放 goroutine)。**直接治「关 pipe→权限没人批」老痛点。** **[C9 治理 / HITL]**
6. **前端**(`07`):resumable streams(session 级 active-stream-id + Redis 重放缓冲 + 显式 stop endpoint;**铁律:断连≠stop**)+ 采纳 AG-UI 事件词汇表作为 WS/SSE schema + Agent Inbox 视图 + HumanInterrupt 审批卡替代 auto-approve(per-tool allow_accept/edit/respond/ignore)。**[C17/C14/C1/C15 前端面]**
7. **注入扫描**(`06`/`08`):对被存储/被调度的任务体执行前做 prompt-injection 扫描(Hermes Promptware)+ 发 LLM 前 secret/PII 脱敏。**[C9/安全]**
8. **artifact 上抽**(`03`/`07`):`ArtifactDelivery` bridge 一等公民,prism 编译产物/未来 feature 复用。**[C13]**

风险:中高。动作 1/2/3 需要改 agent 容器 `conversationService.ts`(per-session system 注入、workspace、SecretRegistry),是「破黑盒」的开始;但每一步都对应一个已被业界验证的模式(OpenHands/Anthropic)。

### P3 — 北极星:DB-as-truth + 硬沙箱 + 多 agent(按需,~月级)

**目标**:只有当规模/可靠性/审计的需求真的到了,才做这些「重」改动。**不要为架构完整性提前做。**

动作:
1. **DB-as-truth**(`03` 选项 B):state 出 jsonl 进后端 event log(OpenHands event-sourcing:append-only EventStore + base_state.json 重放),jsonl 降为派生视图。这是 12-factor #5/#12 的彻底实现,也是 C5/C21 的根治,但**要重写 agent↔backend 的状态契约**,投入最大。
2. **per-session 硬沙箱**(`05`/`08`):对真正跑任意代码的 feature(claw office 转换),用 bubblewrap+`network_mode:none`(复用已验证的 `prism_tex` 模型)或托管 microVM。**本地 Docker Desktop 的 LinuxKit 跑不了 unprivileged userns(01 已记),所以这一步绑定「生产换内核 / 买 e2b/Northflank」的决策(见 §7)。** **[C5/C1 彻底]**
3. **Kanban 多 agent 依赖图**(`06` 完全):`job_links` 父子依赖 + dispatcher deps-done promote + 多 worker 扇出(并发封顶)。支持「综述 = 检索→筛选→并行精读 20 篇→汇总」这类多步 workflow。
4. **只读 fan-out 多 agent**(`03`):仅给 smart_search 的多论文检索做 orchestrator-workers(子 agent 回 1–2k summary),**启用前按 ~15× token 预算圈配额**;claw/prism/peerreview 强耦合写作**绝不**多 agent。
5. 镜像瘦身(裁桌面遗留物 `main.tsx`/Ink/voice/vim/ssh)。**[C18/C21]**

---

## 5. 该从谁偷什么(速查)

| 来源 | 偷的东西 | 落到我们哪 |
|---|---|---|
| **Hermes(爱马仕)** | Kanban 任务板(状态机 + append-only events + 父子依赖 + cron dispatcher);MEMORY.md/USER.md 字符封顶逼整合;frozen-snapshot 保 prefix cache;Promptware 注入扫描;Curator(用量遥测→idle 治理,带 dry-run/备份/pin) | `agent_jobs`(`06`)、`user_memory_blocks`(`04`)、注入位(`04`)、扫描(`06`/`08`)、procedural skills 治理 |
| **OpenHands** | Workspace 工厂 + per-session SecretRegistry + 事件溯源状态(base_state.json + replay) | per-session 沙箱/密钥(`05`)、DB-as-truth(`03`) |
| **Letta/MemGPT** | DB-as-truth 记忆;两层(core block + archival);sleep-time 双 agent(后台更强模型蒸馏);共享 block | 记忆全套(`04`) |
| **Mem0** | 可组合作用域键(user/session/agent/org);写默认异步;多信号检索+rerank;latest-truth-wins | 记忆作用域 + 检索(`04`) |
| **Zep/Graphiti** | 双时态事实(valid_at/invalid_at 作废非删) | 学术记忆陈旧问题(`04`) |
| **Anthropic** | `memory_20250818` 客户端工具契约;context editing + compaction;building-effective-agents 五模式;12-factor 背书 | 记忆 handler(`04`)、编排(`03`) |
| **Codex** | 后台 worktree-per-run;结果落 review-queue/inbox;两轴权限(沙箱能力 × approval 何时问) | 后台隔离(`05`/`06`)、权限模型(`08`) |
| **Goose** | `execution_mode` 交互/后台同 pipeline;recipe 排程快照;6 段 cron;agent 自排程工具(门控) | dispatcher(`06`) |
| **OpenClaw(小龙虾)** | Dreaming(idle 时离线巩固记忆,cron+评分);「session id 是路由选择器不是授权令牌」的多用户警示 | 记忆巩固(`04`)、多用户(`05`) |
| **OpenCode/Crush** | headless server + 多瘦客户端 + SSE 事件总线;SQLite 持久化;`crush serve` cwd-keyed workspace | 传输/状态(`07`/`03`) |
| **Aider** | repo-map(tree-sitter 排序);architect/editor 两模型分工;git-first | (学术语料的「just-in-time retrieval」类比,`03`/`04`) |
| **Vercel AI SDK / assistant-ui / CopilotKit / AG-UI** | SSE+POST 默认;resumable streams(Redis 缓冲);AG-UI 事件词汇表;Agent Inbox;HumanInterrupt 审批卡;生成式 UI 白名单 | 前端全套(`07`) |
| **durable execution(DBOS/Restate/Temporal)** | DB 背书持久队列(不引新 broker);journaling 断点续跑;awaitable 异步 HITL(挂起即释放算力) | 任务底座(`06`) |

---

## 6. 硬约束与「不做什么」(诚实边界)

这些是调研里反复被一手来源/现状证实的**真实约束**,任何方案都绕不开,写在这里防止过度设计:

1. **agent 是黑盒,backend 看不到 CLI query loop 内部**——所以 durable 的最小粒度是「一轮 turn / 一次 tool 裁决」,**不可能做到 token 级断点续跑**。对长学术任务(每篇论文一轮)已够用,但别承诺做不到的。
2. **本地 Docker Desktop 的 LinuxKit kernel 跑不了 unprivileged userns**(01 §7.5 已记)——所以 bubblewrap 硬沙箱**本地起不来**,P3 的硬沙箱绑定「生产换内核 / 买托管 microVM」的决策。
3. **多 agent 对耦合写作既贵(~15× token)又脆(conflicting decisions)**——只对**只读、独立、可并行**的检索 fan-out 用,绝不用于论文撰写/审稿报告拼装。
4. **共享内核 container 不足以跑不可信代码**(2026 业界共识)——但**我们当前 agent 以 MCP 只读为主,不是任意代码执行**;是 Bash 重开(C1)把风险拉回不可信级别。所以「收敛 Bash」比「立刻上 microVM」性价比高得多。
5. **记忆字符上限是特性不是 bug**(Hermes 2200/1375 字符)——长期记忆层是「精炼摘要」,不是知识库;重召回靠 archival 检索,别把整篇 PDF 塞进 block。
6. **compaction / context-editing 会丢信息、会打破 prefix cache**——调参要保守,清理前先让 agent flush 关键发现到记忆。
7. **不要为架构完整性提前做 Kanban UI / DB-as-truth / microVM**——MVP+进阶覆盖 90% 诉求,北极星按真实需求触发。

---

## 7. 需要你拍板的决策(明天验收时定)

这些岔路口会显著改变路线图,**建议你逐条给个倾向**,我据此细化:

1. **横向扩展是不是近期(半年内)目标?**
   - 是 → P1 的 Redis 锁(C2/C3)优先级拉满。
   - 否 → C2/C3 可降级,但 P1 的 `agent_jobs` 仍建议做(后台任务本就该多实例安全)。

2. **claw 真的需要 Bash 吗?**(C1 的核心岔路)
   - 需要(office 转换等) → 走「P0 收敛成仅 claw + P2 把 claw 放进沙箱」。
   - 其实可以用 MCP/库替代 → 直接全局关掉 Bash,「软隔离三角」一刀削平,P2 沙箱压力大减。

3. **state 大方向:DB-as-truth 彻底重写(P3 选项 B) vs jsonl + DB 索引(选项 A)长期够用?**
   - 这是**最大的架构岔路**。选项 A 便宜、保留 agent 黑盒、够支撑记忆/任务/计费;选项 B 根治隔离/审计/扩展但要重写状态契约。**我的倾向:先 A,把 B 作为北极星,等隔离和扩展的需求真到了再评估**——别为 B 先重写 agent。

4. **沙箱:自建(生产换内核 + 复用 prism_tex 的 bubblewrap 模型)vs 买(e2b/Northflank BYOC)?**
   - 取决于「是否开任意代码执行」(见决策 2)+「起量预期」。**倾向:自建优先**(学术数据留自己云,且已有 prism_tex 样板),把 claw 执行后端做成可替换接口留口子。

5. **长期记忆默认开还是 opt-in?隐私/同意策略?**
   - 多用户产品需要用户可见的记忆查看/删除(GDPR);决定要不要在 P1 就带 `/api/v1/user/memory/*` 管理面。

6. **前端传输:维持 WS,还是逐步迁 SSE + resumable?**
   - WS 已投入且 `useAgentSocket` 做得不错(心跳/看门狗/退避/resync);**倾向:保留 WS 但补 resumable 语义 + AG-UI 词汇表**,不为迁 SSE 而迁。

7. **优先级取舍**:如果只能先做一件大的,我的推荐顺序是 **P0(快赢)→ P1 后台任务(用户明确要)→ P1 Redis 锁 → P2 记忆**。你更想先要哪个?

---

### 决策记录(2026-06-14,用户已拍板)

| # | 决策 | 用户选择 | 对路线图的影响 |
|---|---|---|---|
| 2 | claw 是否需要 Bash | **保留 Bash**(能力大幅提升,值得) | 见下「Bash↔沙箱耦合」 |
| 3 | state 大方向 | **按既定设计**(先选项 A:jsonl + DB 旁路索引;DB-as-truth 作北极星,不提前重写 agent) | P0–P2 不重写 agent;P3 北极星按需 |
| 4 | 沙箱:自建 vs 买 | **自建**(复用 prism_tex 的 bubblewrap + `network_mode:none` 模型,生产换内核;claw 执行后端做成可替换接口) | 不引入 e2b/Northflank;沙箱绑定生产内核 |

**Bash↔沙箱耦合(本次最重要的结论)**:保留 Bash = 把威胁模型从「MCP 只读(共享容器勉强可辩护)」拉到「任意代码执行(必须硬隔离)」。因此**「保留 Bash」和「自建沙箱」是同一个决策**,且使 per-session 沙箱从「nice to have」变成**必做、且优先级上移**。落地两条修订:

1. **Bash 按 feature 收敛**(不是全局开):**claw**(及未来通用 agent feature)开;**smart_search/peerreview**(只读)关;**prism**(只产 patch)关。不削弱能力,只是不给用不到的 feature 白扩攻击面。
2. **per-session 密钥隔离从 P2 提前**:它是「先救命」的最便宜措施——上游 key 运行时注入(OpenHands SecretRegistry)而非烤进共享 `providers.json`,即便完整沙箱未上、Bash 已开,也堵死「偷 LLM key」这个最危险向量。建议放进 **P1**(与后台任务底座并行)。

**修订后的优先级**:P0 快赢(含 Bash 收敛成 claw-only)→ **P1 加一项:per-session 密钥隔离** + Redis 锁 + `agent_jobs` 底座 → P2 完整 per-session FS 沙箱(生产,复用 prism_tex 模型)+ 记忆 + 异步 HITL + resumable → P3 北极星。
**本地开发期硬约束**:LinuxKit 跑不了 unprivileged userns,本地 Bash 仍走「收敛 + 接受风险」,完整硬沙箱只在生产落地。

---

## 8. 数据模型增量汇总(新表/新列一览)

便于评估迁移工作量(均遵守 CLAUDE.md 迁移铁律:`CREATE TABLE IF NOT EXISTS` + 幂等存储过程,绝不 DROP;下一个编号从 **0033** 起):

| 对象 | 类型 | 维度 | 分期 |
|---|---|---|---|
| `agent_turns` | 新表(token 归属,带 request_id) | `03` | P0 |
| `agent_sessions.user_feature_anchor` | 新生成列 + 唯一约束(治 C6) | `03`/`04` | P0 |
| `agent_jobs` | 新表(任务定义 + 状态机) | `06` | P1 |
| `agent_job_events` | 新表(append-only 审计) | `06` | P1 |
| `user_memory_blocks` | 新表(in-context 长期块,字符封顶) | `04` | P1 |
| `user_memory_archive` | 新表(语义检索 + 双时态) | `04` | P2 |
| `user_skills` | 新表(procedural 记忆,Curator 治理) | `04` | P2/P3 |
| `job_links` | 新表(多 agent 父子依赖) | `06` | P3 |
| (北极星)event log 表 | 新表(DB-as-truth) | `03` | P3 |

> **命名统一**:任务底座统一用 `agent_jobs` / `agent_job_events` / `job_links`(以 `06` 为准;`03` 摘要里出现过 Hermes 原名 `agent_tasks/task_events/task_links`,指同一组表,落地用 `agent_jobs` 系)。

---

## 附:文档清单

- `01-current-architecture.md` — 现状测绘 + 妥协清单 C1–C22(基线)
- `02-landscape-survey.md` — 11 个开源 agent 逐项对比 + 范式聚类
- `03-orchestration.md` — 后端组织 / 编排 / bridge 收口 / 多 agent 边界
- `04-memory.md` — 两层记忆 / memory 工具 / sleep-time / 双时态
- `05-multi-user-tenancy.md` — 隔离光谱 / per-session 沙箱 / Redis 锁 / 买 vs 自建
- `06-scheduled-tasks.md` — `agent_jobs` 底座 / dispatcher / 异步 HITL / 通知
- `07-frontend-ux.md` — resumable streams / AG-UI / Agent Inbox / 审批卡
- `08-security-sandboxing.md` — lethal trifecta / Bash 收敛 / egress / 注入扫描
- `09-recommendations.md` — 本文(路线图 + 待决策)
- `findings/B-*.md` — 17 份带引用、经事实核查的原始调研(溯源)
