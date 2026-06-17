# Scholay Agent 架构全方位调研与优化方案

> 调研发起: 2026-06-13 · 验收: 2026-06-14
> 背景: 现有 agent 服务是一个**桌面版 CLI agent (cc-haha, Claude Code 形态)** 包了一层
> HTTP+WS server (`agent/`, 端口 3456), 由 Go 后端的 `internal/agentbridge` 适配成
> **多用户 Web 服务**。本调研评估"桌面→Web"过程中的妥协, 对标全网优秀开源 agent 设计,
> 给出后端组织 / 编排 / 记忆 (含用户长期记忆) / 多用户 / 定时任务 / 前端交互的优化方案。

## 调研对象 (开源 agent 全景)

| 昵称 | 项目 | 关注点 |
|---|---|---|
| 小龙虾 | **OpenClaw** | 社区版 Claude Code, 与我们 cc-haha 同源形态 |
| 爱马仕 / Hermes | **Hermes Agent (Nous Research)** | 自改进学习循环 / 三层记忆 / Skill 自演进 / 多 agent 看板 / OS 级安全 |
| OpenCode | **sst/opencode (~172K★)** | client/server 架构, 多客户端 |
| Crush | **charmbracelet/crush** | Go TUI, LSP 集成 |
| — | Aider / Cline / Roo / Goose / OpenHands / Codex CLI / Gemini CLI / Amp | 各自架构取舍 |
| 记忆层 | Letta(MemGPT) / Mem0 / Zep(Graphiti) / LangMem | 长期记忆 / 多用户 scope |
| 编排/调度 | LangGraph / Temporal / Inngest / Restate / CrewAI / AutoGen | 编排 + 定时/异步任务 |

## TL;DR(执行摘要)

**现有 agent 是一个桌面 CLI(cc-haha)硬套多用户 Web,把本该「硬边界」的东西退化成了「软约定」。** 它在单用户/单实例下设计得相当克制(egress proxy、cap_drop、per-session cwd、ws-ticket、displacement、prism_tex 硬沙箱都做得不错),但有 22 条「桌面→Web」的妥协(C1–C22,见 `01`)。

**核心认知:用户问的「定时任务 / 长期记忆 / 多用户」不是三个独立功能,而是同一个根因(state 在黑盒 jsonl 里、隔离靠软约定)的三个症状。** 优化沿四条轴把软约定换成硬保证:

| 轴 | 现状 | 目标 | 妥协 |
|---|---|---|---|
| 状态 | agent 自管 jsonl,backend 黑盒 | DB 记权威 turn/event(渐进)→ DB-as-truth | C5/C7/C21 |
| 隔离 | sid+cwd+路径门(Bash 绕过) | per-session 沙箱 + 密钥隔离 + Redis 锁解单实例 | C1/C2/C3/C5/C12 |
| 记忆 | 几乎为零(CLI 有但 Web 没接) | 两层:per-session + per-user 长期(memory_20250818) | C4/C9 |
| 调度 | 完全缺失 | `agent_jobs` 任务底座 + dispatcher + 异步 HITL + 通知 | C15/C10/C11 |

**最该偷的三样**:Hermes(爱马仕)的 Kanban 任务板 + 字符封顶记忆;OpenHands 的 per-session 沙箱 + 事件溯源;Letta/Anthropic 的两层记忆 + memory 工具契约。前端补 resumable streams + AG-UI + Agent Inbox。

**路线图(详见 `09`)**:P0 快赢(~2-4 天,零风险清掉 8 条妥协)→ P1 横扩 Redis 锁 + 后台任务底座(端到端交付「定时任务+通知」)→ P2 沙箱/记忆/异步 HITL/resumable → P3 北极星(DB-as-truth/硬沙箱/多 agent,按需)。**6 个待你拍板的岔路决策见 `09` §7。**

## 文档结构 (产出物)

- `README.md` — 本文 (索引 + 执行摘要)
- `01-current-architecture.md` — **现状测绘 + 妥协清单 C1–C22**(基线 keystone,含 file:line)
- `02-landscape-survey.md` — 11 个开源 agent 逐项剖析 + 大对比表 + 范式聚类
- `03-orchestration.md` — 后端组织 / 编排 / bridge 收口 / 多 agent 边界
- `04-memory.md` — 两层记忆 / memory_20250818 工具 / sleep-time / 双时态
- `05-multi-user-tenancy.md` — 隔离光谱 / per-session 沙箱 / Redis 锁 / 买 vs 自建
- `06-scheduled-tasks.md` — `agent_jobs` 底座 / dispatcher / 异步 HITL / 通知
- `07-frontend-ux.md` — resumable streams / AG-UI / Agent Inbox / 审批卡
- `08-security-sandboxing.md` — lethal trifecta / Bash 收敛 / egress / 注入扫描
- `09-recommendations.md` — **综合路线图 + 待决策**(收口 keystone)
- `findings/B-*.md` — 17 份带引用、经事实核查的原始调研 (溯源)

## 进度 (全部完成)

- [x] Phase A: 现状架构测绘 → `01-current-architecture.md` (含妥协清单 C1–C22)
- [x] Phase B: 外部开源 agent 调研 (17 份,含事实核查) → `findings/B-*.md`
- [x] Phase C: 维度提案 (02–08) + 综合路线图 (09)

> 方法论:Phase A 由 8 个并行 reader 读真实代码测绘(带 file:line);Phase B 由 17 个调研 agent
> 各跑「研究 → 抓一手源 → 事实核查(纠错 + [UNVERIFIED] 降级)」两段流水线;Phase C 由 7 个 writer
> 把核查过的发现映射到我们的代码与妥协。findings 里凡标 [UNVERIFIED] 的都是未能从一手源确认、
> 不应当事实采信的点(已在各文保留溯源 URL)。

### Phase A 关键结论 (供 Phase C 引用)

- **软隔离三角 (高危)**: C1 Bash 无条件 auto-approve + C5 共享 jsonl 文件系统 + C4 无 per-user 隔离 → 桌面"机主可信"假设搬到多租户后隔离退化为软约定。
- **单实例押注 (高危)**: C2 displacement 进程内 `sync.Map` + C3 配额 reset 进程内 mutex,Redis 跨实例锁均"计划未实现" → 平台钉死单实例,水平扩展即 jsonl 双写 + 配额双扣。
- **无 per-user 长期记忆 (高危)**: C4 CLI 自带 CLAUDE.md/memdir/getUserContext 但 Web 层未对接;agent_config 单行、skills/OAuth 全局。
- **bridge 抽象漏洞 (中危)**: C10/C11/C12/C13 SessionOptions/配额钩子/会话归属/artifact 交付只覆盖 WS pipe happy path,server-driven (peerreview)/实体会话 (prism)/交付 (claw) 各自绕开。
- **无后台任务面 (中危)**: C15 长任务随 tab 关闭孤儿化,无完成通知 (PushNotification 还在 denylist)。
