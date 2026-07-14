# Scholar Skills 市场 · 设计文档

> **状态**:设计提案(v1),供 owner 决策。尚未实现。
> **日期**:2026-07-11
> **产出方式**:17 个子代理的多智能体工作流(6 代码库深挖 + 3 外部调研 → 4 设计提案 → 3 视角对抗评审 → 合成),主 agent 复核 + 直接核实关键事实后定稿。
> **需求来源**:owner 提出「做 Skills 市场(用户上传/分享 skill)+ 智能助手(claw)可自由使用用户 skill + per-user 沙箱」。

## 主 agent 直接核实过的现状事实(非推测)

这几条是设计的地基,已在代码里逐一确认:

1. **线上目前连"可信 Bash"都没跑通**:生产 `.env` 无任何沙箱设置 → `SANDBOX_MODE=none`;同时 `NODE_ENV=production`。这个组合下 `agent/src/sandbox/profile.ts:unsandboxedBashGate()` 会**直接拒绝执行 claw 的 Bash**(secure-by-default,防跨租户偷文件/密钥),除非设 `EXECUTOR_ALLOW_UNSANDBOXED_BASH=1`(`.env` 也没有)。→ **claw 的 PDF/docx 转文本这条 Bash 路径在你线上很可能是关闭状态**。这说明"跑不可信 skill"之前,连"跑可信脚本"的隔离地基都还没铺。
2. **生产已有的纵深防御地基**(`docker-compose.prod.yml` agent 服务):`pids:512`、`memory:1.5G`、`cap_drop: ALL`、`no-new-privileges:true`、网络仅 `scholar-agent-net`(backend)+ `egress-net`(公网 NAT)→ **agent 碰不到 mysql/redis/minio**。`.env.example` 其实推荐 `EXECUTOR_SANDBOX_MODE=bwrap`,但实际没启用 → bwrap 在你的生产内核上大概率没真正跑通(unprivileged userns 未放开)。
3. **skill 现状是"可信一方内容"**:`agent-skills/` 提交进 git → docker `:ro` 挂载 → Go 侧 `claw/spec.go` 静态 `AddDirs:["/claw-add"]` → executor `loader.ts` 加载 `CLAUDE.md`(常驻)+ `.claude/skills/*`(常驻)+ `guides/*`(按需菜单)。**无 per-user、无动态**。
4. **executor 硬常量**(设计里的限额据此):`PER_SKILL_CAP=8000`、`TOTAL_CAP=40000`、`MENU_CAP_CHARS=2500`、`MAX_SKILL_BODY=16000`、`SKILL_NAME_RE=/^[a-z0-9][a-z0-9-]*$/`。触帽是**静默丢弃**(skill 会神秘消失)。
5. **会话模型**:`agent_sessions` 按 `(user_id, feature_key)` 锚定,claw 被 migration 0034 排除单会话唯一键 → 一用户可有多个长期 claw 会话。
6. **addDir 注入面的安全前提(⚠️ 必须收紧)**:`agent/src/server/ws.ts:107` 的 `seed_history` 帧允许在 `meta.addDirs` 为空时从 WS 帧写入 addDirs。该 WS 是 **backend↔executor 内网**(executor 不对宿主暴露端口,浏览器连不上);但 `set_runtime_config` 的注释表明后端会把部分浏览器帧管道转发给 executor。**因此"后端是否逐字转发浏览器的 `seed_history` 帧(含 addDirs)"决定了用户能否注入任意 addDir 绕过审核 —— 上线前必须审计 backend 侧管道(`agentbridge/hub.go` / `ws.ts`)并收紧为"addDirs 只接受 backend 控制面下发"。** 这是整个隔离方案的地基,列为 P0 待验证项。

---

# Scholar Skills 市场 · 设计文档（v1，供 owner 决策）

> 本文综合了代码库深挖（executor 生命周期 / agentbridge 会话流 / skill 格式 / 沙箱现状 / 存储 / 前端）、外部安全与沙箱调研、三份沙箱提案（A/B/C）及其三视角（security / feasibility / dev-ergonomics）评审后合成。**核心判断**：三视角评审罕见地一致收敛到同一落法——**用 C 的分层框架当骨架，第一期只做 tier-1「三无」纯指令 skill，脚本能力压到 B2（per-session gVisor worker）就绪之后，egress 用 A 的 egress-guard，再加一行生产硬锁**。本文即按此展开。

---

## 1. 需求梳理

### 1.1 用户原始需求（三点）
1. **Skills 市场**：用户上传自己的 skill；平台保存；可选择公开分享；其他用户可查看/使用。
2. **claw 改造成可自由使用用户 skill**（agent 本就支持 skill 机制）。
3. **per-user 沙箱**：因为要跑不可信 skill；Mac 本机开不了沙箱、线上目前也没开——重点调研。

### 1.2 拆解后的功能点
- **F1 上传/管理**：用户上传 skill（MVP = 一个 `SKILL.md` 纯文本）、编辑、版本迭代、删除、设可见性。
- **F2 分享/浏览**：公开 skill 走 SEO 友好短链 `/skills/<slug>`；市场列表 + 详情 + 只读 SKILL.md 预览。
- **F3 安装/启用**：用户把自己的或他人公开的 skill「装到我的」；在 claw 会话里选择启用哪些。
- **F4 claw 动态加载**：会话建立时把用户启用的 skill 物化成 executor 可读的按需菜单，模型运行时 `Skill()` 加载。
- **F5 审核/治理**：public 需过审；举报；admin 下架 kill-switch；版本级审核。
- **F6 执行隔离**：不可信 skill 的运行时租户隔离（沙箱）——本文第 5 章。

### 1.3 非功能需求
- **安全（首要）**：跨租户读文件 / 偷密钥 / RCE / 数据外传 / 提示注入，五条攻击面必须逐条有明确处置。
- **成本**：线上是单 VPS + docker-compose，90% 的学术 skill 是纯 Markdown 指南；不能为全体 skill 付 microVM 成本。
- **体验（dev-ergo）**：Mac 本机开不了内核沙箱，MVP 必须能在本机端到端开发/验收；对现有 4 个 feature（smart_search / claw / prism / peerreview）零回归。

### 1.4 根本转变（必须贯穿全文）
> **引入用户 skill = 引入不可信代码 + 不可信提示词。**

- 现状 skill = **可信**：提交进 git、经审查、`:ro` 挂载、全用户同一份。SKILL.md 是可信文案，附带脚本是可信代码。现有全套隔离（`confine.ts` realpath、`unsandboxedBashGate`、`bashEnv` 白名单、网络分段）都是**为可信 skill 设计的**。
- 市场后 skill = **不可信**：`SKILL.md` 变成**提示注入面**（诱导 agent 用它自己被授权的工具越权/泄漏他人数据）；附带脚本/文件变成 **RCE 面**；可跨租户读他人 cwd、经 `/proc` 偷 `MINICOD_API_KEY`/`EXECUTOR_AUTH_TOKEN`、滥用出网外传数据、挖矿。
- **这正是 Anthropic 官方明确警告"不要做"的事**（"Use Skills only from trusted sources … treat like installing software"）。且实证（arXiv SkillScan 31k skill：26.1% 有漏洞；Snyk ToxicSkills：ClawHub 36.8% 有问题）表明**静态扫描器可被 <1h 绕过**——信任边界必须落在**运行时隔离**，不能落在提交时审查。

---

## 2. 总体架构

### 2.1 文字架构图（目标态）

```
浏览器 ─ nginx ─┬─ frontend-user (新 feature: src/features/skills/ + claw 侧栏 ClawSkillPanel)
                │
                └─ backend (Go, 可信控制面, 拥有 journal/state 真源)
                    ├─ internal/skillmarket ★新   上传/解压校验/frontmatter 规范化/审核/举报
                    │     └─ MinIO: BucketSkillBundles ★新  (skills/<uid>/<skill_id>/v<n>/<sha256>.tgz)
                    │     └─ DB: user_skills / skill_versions / user_enabled_skills / skill_reports ★新(0061)
                    │
                    ├─ internal/agentbridge
                    │     · buildCreateOptions(userID,sid)  ← 唯一 per-user 收口
                    │        + FeatureSpec.AddDirsProvider ★新钩子(修 slice 别名 bug)
                    │        + 会话级 skill 快照落库(防重启漂移)
                    │     · hub.seedHistoryFromJournal      ← journal 是真源, worker/executor 重启可重放
                    │
                    ├─ internal/claw · AddDirsProvider 实现 (物化 skill 内容, 仿 library-reference)
                    │
                    └─ sandbox-orchestrator ★新(Phase 2)  持受限 docker.sock(经 socket-proxy)
                          · LeaseWorker(sid) / ReleaseWorker / 热池 / reaper

  可信会话(无市场 skill / 一方 skill)                不可信会话(启用了市场 skill 且需脚本, Phase 2)
        │                                                    │
        ▼                                                    ▼
  scholar_agent (共享, 现状)                     per-session gVisor worker ★新(Phase 2, B2)
   · turnLoop + LLM key + Minicod MCP             · runtime=runsc(systrap, 无需 KVM)
   · SANDBOX_MODE=none, Bash 关闭                 · network_mode:none, 零密钥 env
   · skill loader.ts:                             · read_only + tmpfs cwd + cgroup 配额
       ├ 一方 /claw-add: CLAUDE.md/.claude/skills 常驻(可信)   · 即用即弃, 单租户
       └ 用户 skill: 仅 guides/ 按需菜单(不可信, 禁常驻注入)
   · egress-guard ★新(A): allowlist + DNS 防火墙(给一切要出网的档)
```

### 2.2 与现有系统的关键接缝
| 接缝 | 现状 | 改动 |
|---|---|---|
| **addDirs 注入** | `claw/spec.go` 静态 `["/claw-add"]`，全用户同一份 `:ro` 挂载 | `FeatureSpec.AddDirsProvider(ctx,userID,sid)` 钩子，在 `bridge.go:917 buildCreateOptions` 一处注入 per-session 目录 |
| **skill loader** | `loader.ts:loadAddDirContext` 无条件把 `CLAUDE.md`+`.claude/skills/*` 拼进 system；`guides/*` 走按需菜单 | 用户目录**只读 `guides/`**，禁常驻注入；`addDirContextCache` 必须重写（否则内存泄漏） |
| **内容投递** | backend↔agent 不共享可写卷；靠 compose `:ro` mount | 扩 executor `CreateOpts.skills:[{name,skillMd}]` 内联通道，物化到 cwd 外 `<sid>.skills/guides/` |
| **存储** | MinIO 多 bucket，私有，backend stream 转发 | 加 `BucketSkillBundles` + getter + `ensureBucket` |
| **会话状态** | journal + `agent_session_archive` 真源，executor 按轮无状态 | 天然支持 worker/executor 重启重放（seed_history），**无需改 reseed 逻辑** |

---

## 3. Skills 数据模型与格式契约

### 3.1 MinIO 存储
- 新 bucket `scholay-skill-bundles`（私有，不挂 `tmp/` ILM，永久资源）。
- Key：`skills/<user_id>/<skill_id>/v<version>/<sha256>.tgz`（含 uid 段 → 注销批量清理；含 version 段 → 版本并存；sha256 → 秒传去重）。
- bundle 上限 **2MB**，入口 `ParseMultipartForm` 限幅 + magic-bytes 校验 gzip（`1f 8b`）。

### 3.2 数据表（迁移 `0061_skill_market.sql`，下一个可用编号 = 0061，单文件内联索引风格，utf8mb4，`CREATE TABLE IF NOT EXISTS`，never DROP）

四张表（完整字段见"市场与集成设计"章节，此处只列职责与关键约束）：

- **`user_skills`**（主表）：所有权 `user_id` + `slug UNIQUE`（保留字守卫 + 冲突加后缀）+ 元数据（`name`/`tagline`/`description_md`/`when_to_use` 均**不可信、渲染必转义**）+ `declared_tools JSON`（**仅展示，不授权**）+ `current_version_id` 指针 + `visibility`(private/unlisted/public) + `moderation_status`(draft/pending/approved/rejected/flagged) + `install_count`(去正规化排序)。索引 `idx_market_rank(visibility,moderation_status,install_count)`。
- **`skill_versions`**（不可变版本）：`UNIQUE(skill_id,version)` + `object_key` + `bundle_sha256` + `manifest_json`（frontmatter 快照）+ **`skill_md MEDIUMTEXT`**（规范化后正文，物化热路径直接读此列，零 MinIO 往返）+ `scan_status` + 版本级 `moderation_status`。
- **`user_enabled_skills`**（installs）：`UNIQUE(user_id,skill_id)` 幂等 + `pinned_version_id`（NULL=跟随 current 且需 approved）+ `source`(self/market)。
- **`skill_reports`**（举报）：`UNIQUE(skill_id,reporter_user_id,reason)` 防重刷 + `status` 流转。

### 3.3 用户 skill 格式契约（MVP）

**一个用户 skill = 恰好一个 `SKILL.md` 纯文本文件（MVP 零附件、零脚本）。**

平台物化后的目录形态（per-session，只读给 executor，**在 cwd 之外**）：
```
<SESSIONS_ROOT>/<sid>.skills/          ← 与 workDir 平级, 不在 cwd(防自改写/成果误收割)
  guides/
    u<userId>-<slug>/                  ← 目录名=加载 key, 强制命名空间前缀
      SKILL.md                         ← 唯一文件
```

三条硬约束（红线，来自威胁模型反转）：
1. **只进 `guides/`（按需菜单）**：严禁写 `CLAUDE.md`/`.claude/skills/`（那两条被无条件拼进每轮 system prompt = 最强注入位）。
2. **命名空间前缀 `u<userId>-<slug>`**：必须匹配 executor 白名单 `^[a-z0-9][a-z0-9-]*$`；防与他人/一方 skill 撞名被 shadow，防冒充一方 skill 名做诱导。
3. **frontmatter 平台规范化后写入，不信原文**：必填 `name`/`description`/`menu`（**强制截断 ≤60 字符**，仓库无 lint 得自己截）；可选 `when_to_use`/`axis`；**一律剥离** `allowed-tools`/`user-invocable`/`model`/`effort`（executor 根本不解析，留着误导）；照抄官方硬约束——`name` 禁 XML/`<>`、禁保留词（`anthropic`/`claude`/一方 skill 名），`description` ≤1024 禁 XML。

大小/数量限制（对齐 executor 硬约束，**待验证**具体常量以 `registry.ts`/`loader.ts` 为准）：
- 单份 SKILL.md 正文 ≤ **8000 字符**（executor `MAX_SKILL_BODY=16000` 会静默截断，留一半余量）。
- 单会话装载用户 skill ≤ **5 份**（护住 `MENU_CAP_CHARS=2500`：一方 lens 菜单已占预算，超限 guides 条目**静默丢弃**导致 skill 神秘消失）。

### 3.4 可见性 / 所有权 / 版本
- private/unlisted 可自用（仍不可信）；**public 必须 `moderation_status=approved` 才对外可见**。
- 版本不可变、追加式；改内容 = 传新版本（回滚 + 举报定位 + 审计）。
- 他人「使用」= install 到自己名下 + `pinned_version_id` 可钉版本 → 作者事后改内容不影响已装用户（**内容 pin 版本**）。

---

## 4. claw 动态加载集成（静态 addDirs → per-session 动态物化）

### 4.1 唯一收口 + slice 别名 bug（必修）
所有建会话路径（create/newsession/reset/recreate/**seed_history**）共用 `buildCreateOptions(ctx,userID)`（`bridge.go:917`）。它现在 `clone := *base` 浅拷贝，`opts.AddDirs` 与静态 `spec.SessionOptions.AddDirs` **共享底层数组**——per-user `append` 会就地污染全体用户的静态 slice（跨租户污染）。

```go
clone := *base
clone.AddDirs = append([]string(nil), base.AddDirs...)   // 必须新分配
if f.spec.AddDirsProvider != nil {
    extra, snap, err := f.spec.AddDirsProvider(ctx, userID, sessionID)
    // 物化失败 = fail-open 到"无用户 skill", 不阻断建会话(skill 是增强非必需)
    clone.AddDirs = append(clone.AddDirs, extra...)       // /claw-add 仍在, 用户目录并列
    persistSessionSkillSnapshot(sessionID, snap)          // 见 4.4
}
```
`AddDirsProvider` 实现放 `internal/skillmarket`，`claw/spec.go` 只引用——避免 claw 直接依赖市场表。

### 4.2 物化流程（DB/MinIO → per-session 只读目录）
仿 claw `library-reference`「物化 references/」成熟范式：
1. 查 `user_enabled_skills WHERE user_id=? AND enabled=1`，join `skill_versions` 取生效版本（pinned 或 current，**且 public 必须 approved 才物化**）。
2. 把 `skill_versions.skill_md`（已规范化正文）写进 `<sid>.skills/guides/u<uid>-<slug>/SKILL.md`（cwd 外），硬限 ≤5 份。
3. 目录作为额外 addDir 传入。`loader.buildSkillMenu` 与 `skillTool` **无需改动**即识别。

**投递机制（推荐路径 A，内联传内容）**：扩 executor `CreateOpts.skills:[{name,skillMd}]`，`createSession` 物化到 `<sid>.skills/guides/` 并 push 进 `meta.addDirs`。后端零共享卷，内容随建会话/seed 帧下发，skill 更新即时。**`deleteSession` 必须一并 `rm <sid>.skills`**（现只删 workDir）。

### 4.3 【前置必修】`addDirContextCache` 坑
`loader.ts:129` 缓存 key = `addDirs.join('|')`。per-session 目录路径含 sid ⇒ **每会话唯一 key ⇒ 缓存永不命中 + Map 无界增长（进程生命期内存泄漏）**。若改稳定路径省内存 → 又会「同路径内容被换 → 跨会话读到旧内容」。
**改造**：缓存 key 改为「addDirs 各目录内容 hash + LRU 上限」，或对 per-user 目录**直接 bypass 缓存**（每份 ≤8000 字符、≤5 份，渲染开销可接受）。**这是接入 per-user skill 的前置改动，不改会内存泄漏。**

### 4.4 长期 session 失效重建 + enable/disable 生效路径
**语义定调：skill 在建会话时刻冻结，enable/disable 只影响新对话。** 理由链：
- claw = 一用户 N 个长期 session（`agent_sessions` 代理键 PK，migration 0034 把 claw 显式排除单会话唯一键）。
- executor `ws.ts:107` 只在 `meta.addDirs` 为空时回填（backfill-when-empty），re-seed **改不动活会话** addDir。
- **给用户两个动作**：`CreateNewSession`（带当前 skill 集，老会话保持旧集，推荐默认）；`ResetSession`（换 sid、丢历史、按新集重建，前端二次确认「将清空当前对话」）。

**必须落库会话级快照（否则 executor 重启 skill 漂移）**：`seedHistoryFromJournal` 用 `buildCreateOptions` **现算** addDir（= 当前市场态）。若老会话建时启用 A、之后用户改成 B，重启补空会把老会话 rebind 到 B。
- 落库：新增侧表 `agent_session_skills(session_row_id, skill_id, version_id)` 或 `agent_sessions` 加 `skills_snapshot JSON` 列（与 0061 同批）。
- `AddDirsProvider` 在 **seed 路径**读会话快照（冻结版本），**只有首次建会话**读 live 的 `user_enabled_skills`。

### 4.5 安全接缝校验
- **addDir 必须始终由 backend 控制面下发**。审计 `ws.ts:107`：确认 addDirs 不被前端 WS 帧可控，否则用户自带任意 addDir 绕过审核。若不能保证，收紧为「只接受 seed_history/create 的 addDirs，拒绝纯前端 WS 帧的 addDirs」。**待验证**。
- per-session `.skills` 目录过 `safeSessionDir`/realpath 断言防逃逸；目录内相对引用/符号链接 confine（现 `confine.ts` 只服务 cwd，需补断言）。
- backend 全程不解压执行 tarball、不跑任何脚本，只解析元数据。

---

## 5. 沙箱与租户隔离（重点）

### 5.1 评审结论与推荐方案

三视角评审（security 8/7/6，feasibility C8/B6/A5，dev-ergo C8/A7/B4）一致收敛。**推荐落法**：

> **C 的分层框架当骨架 + tier-1「三无」纯指令 skill 作 MVP + B2（per-session gVisor worker）作 tier-2 唯一引擎 + A 的 egress-guard 给一切要出网的档 + 一行生产硬锁封死坍缩模式。**

三个提案各自的处置：
- **C（分层）= 采纳其框架**，但认清它「不贡献任何隔离机制，只是路由/策略层」——真正的安全来自 tier-1 的「不执行代码」和 tier-2 的 B2。
- **B2（工具下沉的 per-session gVisor worker）= 采纳作 tier-2 唯一实现**。共享可信 executor 继续编排 LLM，只把 Bash/不可信文件工具**这一次调用**下沉给 backend（经受限 docker.sock 的 orchestrator）动态起停的 `network_mode:none`、零密钥、gVisor、cgroup 配额的 ephemeral worker。**与生产已验证的 `prism-tex` 同构**（backend 经卷投喂断网 worker），密钥零暴露从根上消灭偷密钥面，冷启动可被热池吸收。
  - **不用 B1**（整只 executor 进 worker）：它逼你建 egress-broker 注入 LLM key，是「做出来容易做对极难、上线即带洞」的高危部件（Unit42 AgentCore DNS 隧道教训）。B2 用断网 worker 绕开它。
- **A 的 bwrap = 丢弃作 tier-2 最终答案，至多作过渡且诚实标注**。理由（对抗性）：A 因 ro-bind 张力被迫「只上纯指令 skill」，可 Bash 一关，bwrap 对跨租户读/偷密钥的价值就蒸发（没有代码执行路径，confine 已够）；而 A 真正需要 bwrap 的场景（开 Bash 跑脚本）恰是它因**共享宿主内核 + 无 per-session cgroup** 不够格的场景。付出「开 bwrap 的不确定性」却落在能力真空区。
- **A 的 egress-guard = 采纳**（A 写得最扎实的部分）。

### 5.2 生产 Linux 怎么真正开隔离（精确配置）

**反直觉但关键的结论：gVisor 比 bwrap 更容易在这套 Docker 里真跑起来。**
- bwrap = 容器内再 `unshare(CLONE_NEWUSER)`，撞 Docker 默认 seccomp/apparmor + 宿主内核开关（Ubuntu 23.10+ 的 `apparmor_restrict_unprivileged_userns` 是 2024 后头号失败根因），且与 `unsandboxedBashGate` 加固方向对冲。**赌的是环境不可控的内核放开**。
- gVisor = **宿主 runtime**（`runsc install` 注册进 daemon），worker 是 daemon 起的 sibling，**不嵌套、不与 agent 自身 seccomp/apparmor 打架**，**systrap 平台不需要 `/dev/kvm`/nested virt**（普通 VPS 直接可用）。**赌的是工程可控的「引入受限 docker.sock 编排服务」**。

**tier-2（B2）生产开启步骤**：
1. 宿主 `runsc install`，`daemon.json` 注册 `runtimes.runsc`（platform=systrap）。**待验证**：目标 VPS 内核/发行版能跑 systrap（几乎所有现代 Linux 可）。
2. 起 `sandbox-orchestrator`（Go 小服务）+ `tecnativa/docker-socket-proxy`，只放行 `CONTAINERS create/start/stop/kill/inspect` + `IMAGES`。**docker.sock 绝不挂进 backend 或 agent 本体**。
3. worker `docker run` 硬化模板（抄 prism-tex + 加 gVisor）：
```
docker run -d --runtime=runsc \
  --name skillworker_<sid> --label scholay.worker=1 \
  --network sandbox-worker-net \            # B2: 仅内网 RPC; worker 本身断网出公网
  --read-only --tmpfs /tmp:size=256m \
  --tmpfs /home/bun/work:size=512m,mode=0700 --tmpfs /skills:size=32m \
  --cpus=1.0 --memory=768m --memory-swap=768m \   # 关 swap 防绕过
  --pids-limit=128 \                        # 封 fork bomb
  --cap-drop=ALL --security-opt=no-new-privileges:true --user bun \
  -e WORKER_MODE=1 -e PER_LEASE_TOKEN=<random> \   # 无 MINICOD_API_KEY / provider key / 全局 EXECUTOR_AUTH_TOKEN
  --stop-timeout 5 scholay/agent:latest
```
4. executor 侧：`registry.ts` 的 Bash/不可信文件工具在 worker 会话下经内网 RPC 委派给 worker 的 `/api/exec`（受 per-lease token 保护）；用 `WORKER_MODE` 分支严格隔离，**不污染可信 claw 主路径**（回归风险最大处，需重点测试）。
5. worker 断网 → 密钥零暴露（`cat /proc/1/environ` 偷不到东西）→ **架构上消灭偷密钥面**。

**egress-guard（A，给一切要出网的档：一方会话、未来 B1）**：
- 新增 `egress-guard` 容器（tinyproxy/squid/自研 loopback），default-deny + allowlist（minicod、Anthropic host）。
- **必须同时过滤 DNS**（Unit42 教训：挡 TCP 不挡递归 DNS 等于没挡）：受控解析器只解白名单域；按 host 放行时**校验并 pin 解析出的 IP**（防 DNS rebinding 重绑到 `169.254.169.254`/内网）。
- 默认拦：`169.254.169.254`（云元数据）、`169.254.0.0/16`、`10/8`、`172.16/12`、`192.168/16`、`127/8`。
- agent 设 `HTTPS_PROXY=http://egress-guard:8080` → `egressEnv()` 现有逻辑自动注入，**代码零改动**。

### 5.3 Mac 本机降级
- **Mac（LinuxKit）永远开不了 gVisor/bwrap** → `SANDBOX_MODE=none`。
- **tier-1（纯指令 skill）dev/prod 行为完全一致**：它不依赖任何内核沙箱，只靠 `disallowedTools` 关 Bash + `confine.ts` 锁文件工具 + guides-only + 围栏注入。**MVP 可在 Mac 完整开发验收**——这是选 C 骨架的核心理由。
- **tier-2（需脚本）在 Mac 直接不可用**：`sandbox-orchestrator` 检测非 Linux/无 runsc → 返回「sandbox unavailable」，前端提示「该能力仅生产可用」。dev 联调 orchestrator/路由可用普通 runc（无隔离）+ 启动 log 大声打 `FATAL(dev-only): worker 无 gVisor 隔离,禁止跑真不可信内容`。**绝不在 Mac 用 none 共享容器跑不可信脚本**。
- 真隔离验证只能在远程 Linux 做（对齐 `verify-before-deliver` 铁律）。
- 可选加固（A 的降级思路，采纳）：dev 的 `AddDirsProvider` 只物化 `source='self'` skill，`source='market'` 一律不注入 → 本机永远单租户不裸跑他人内容。

### 5.4 信任分级与能力收窄
四档，由 `visibility` + `moderation_status` + 作者身份派生：

| 档 | 判定 | Bash | 出网 | 文件工具 | skill 加载 | 注入位 | 执行档 |
|---|---|---|---|---|---|---|---|
| **T0 官方一方** | 仓库 `agent-skills/` `:ro` | 现状 | 现状 | 全量 cwd-confined | CLAUDE.md+.claude/skills 常驻+guides | STRICT RULES/system | 现状不变 |
| **T1 已审核公开** | public+approved | 默认禁 | 默认禁 | Read/Grep/Glob/Edit/Write | **仅 guides** | user 段+不可信围栏 | tier-1 / tier-2(有脚本) |
| **T2 未审核私有/自用** | private/unlisted 自用 | 一律禁 | 一律禁 | Read/Grep/Glob(建议禁 Write) | **仅 guides** | user 段+围栏 | tier-1 强制 |
| **T3 待审/被举报** | pending/flagged/rejected | 禁 | 禁 | 不进会话(仅市场页只读展示) | 不加载 | — | kill-switch |

**能力交集算法**（backend 建会话时算，写进 `DisallowedTools`）：
```
最终工具集 = manifest 请求 ∩ 信任档允许集 ∩ 用户勾选同意
默认拒绝一切; Bash/网络工具默认不在任何不可信档的允许集里, 除非 tier-2 且沙箱就绪
```
**manifest 只减不增，且本身是不可信输入**：`allowed-tools`/`permissionMode` 等一律无视（Reversec 证明 frontmatter `!`command`` 可在推理前预执行）。

### 5.5 提示注入缓解（任何沙箱都不解决，必须并行）
> **诚实标注（贯穿三评审）**：即便 B2 开满，turnLoop 仍在共享可信 executor、仍持 minicod MCP + key + 会话上下文。注入让模型用**自己被授权的工具**（minicod 拉/外发他人数据、Read 读本会话敏感上传、Write 产出诱导性文件）——发生在**可信平面，worker 只兜住了 Bash-RCE**。「沙箱开满仍泄他人数据」对所有档成立。

必做的正交控制：
1. **loader 信任分级**（前置 P0）：用户目录只走 guides，禁 CLAUDE.md/.claude/skills 常驻注入；guides 正文当「不可信 user 段 + 隔离围栏」返回，绝不进 system。
2. **市场 skill 会话关闭 `permission_request` 自动 approve**（现有 auto-approve 是为可信 skill 设计的，否则注入可自我批准越权）。
3. **每会话 egress allowlist**（5.2）+ **高危工具人审/策略校验**。
4. 提交时扫描当降噪层（base64/Unicode 走私、`ignore previous instructions`、隐藏注释指令、硬编码外链），**不当信任边界**。

### 5.6 资源配额
- tier-2：worker cgroup（`--cpus` / `--memory` + 关 swap / `--pids-limit` 封 fork bomb / tmpfs 限磁盘）+ wall-clock（`docker stop --time 5` 连 sandbox 一起收，解决现状「none 模式不杀子进程组」）。
- tier-1 无脚本，资源风险仅在轮次消耗，走 claw 现有 `vip.CheckDailyQuota` 日额度。

### 5.7 MVP 最小可行安全基线 vs 增强项

**MVP 必须有（缺一不可）**：
- ✅ loader 信任分级（用户 skill 只走 guides，禁常驻注入）
- ✅ `addDirContextCache` 重写（否则内存泄漏）
- ✅ `buildCreateOptions` slice 别名修复
- ✅ 会话级 skill 快照落库（防重启漂移）
- ✅ tier-1「三无」：无 Bash（`disallowedTools` 含 Bash + `unsandboxedBashGate` 维持关闭）/ 无出网工具 / 无密钥可达
- ✅ **一行生产硬锁**：生产环境检测到 `EXECUTOR_ALLOW_UNSANDBOXED_BASH=1` **存在即拒绝启动 + 告警**（性价比最高的一行改动，直接封死「工期压力下有人放行 Bash → 分层瞬间崩成任意用户拿共享 shell + 直读密钥」的坍缩模式）
- ✅ 上传解压安全校验（限大小/文件数/路径穿越/符号链接/拒可执行位）+ frontmatter 规范化剥离
- ✅ public 过审门 + 举报 + admin kill-switch + 内容 hash 锁版本
- ✅ 前端 SKILL.md 预览禁 `rehype-raw`/`dangerouslySetInnerHTML`，元数据渲染转义

**增强项（后续）**：
- 🔜 把 `MINICOD_API_KEY`/`EXECUTOR_AUTH_TOKEN` 移出 executor 进程（backend broker + 每会话短时 scope token）——tier-2 硬依赖，tier-1 靠「无 Bash」回避。
- 🔜 B2 sandbox-orchestrator + gVisor worker（tier-2 引擎）
- 🔜 egress-guard + DNS 防火墙
- 🔜 低/高信任分池（付费/一方会话不与不可信会话共享 worker 池）
- 🔜 会话即用即弃、审计与异常检测

---

## 6. 市场 UX 与管理审核

新 feature `src/features/skills/`；claw 启用面板数据 hook 因跨 feature 禁令落 `shared/api/skills.ts`；admin 并入 `features/admin/`。

### 6.1 用户端
| 页面 | 路由 | 组件 | 接口 |
|---|---|---|---|
| 市场浏览 | `/skills`（壳仿 `ToolsLayout`） | `SkillCard`/`SkillsFilterSidebar`(URL 态)/分页 24 | `GET /skills/market?q&category&sort&page` · `GET /skills/market/categories` |
| 详情/预览 | `/skills/:idOrSlug` | 元数据头 + `declared_tools` Badge + **「社区·未审核」来源标签** + `SkillReadme`(react-markdown 禁 raw) + 安装/举报 | `GET /skills/market/:idOrSlug` · `POST /user/skills/installed` · `POST /skills/market/:id/report` |
| 我的 Skills | `/skills/mine`(loader 守卫) | `MySkillsPage`(状态 Badge) / `SkillEditorPage`(rhf+zod) / `SkillUploadDialog` / 可见性 Switch | `GET/POST /user/skills`(multipart 仿 `useUploadClawAttachment`) · `GET/PATCH/DELETE /user/skills/:id` · `PUT /user/skills/:id/content` · `POST /user/skills/:id/publish` |
| claw 启用面板 | `/claw` 侧栏 | `ClawSkillPanel` = `ClawSidebar` 第三个 `SidebarSection`，多选开关 | 复用 `shared/api/skills.ts` `useInstalledSkills`；启用走 WS `{type:'set_active_skills',skillIds}`(仿 `set_runtime_config`, per-session) |

**启用面板语义**（对齐 4.4）：切换只对新对话/Reset 生效，UI 明示「将应用于新对话」+ 提供「在新对话中应用」按钮。

### 6.2 管理端
| 页面 | 路由 | 接口 |
|---|---|---|
| 审核队列 | `/admin/skills-review`（nav「内容运营」组） | `GET /admin/skills?status` · `POST .../approve` · `.../reject`(原因) · `.../takedown`(kill-switch) |
| 举报处理 | `/admin/skills-reports` | `GET /admin/skills/reports` · `POST .../resolve` |

用 `features/admin/components/DataTable.tsx`（shared/ui 无 Table 原子），仿 `FeedbackPage`。

### 6.3 前端铁律约束（`frontend-user/CLAUDE.md`）
- 所有接口写 react-query hook 经 `http` 实例，`queryKey` 三段式，mutation 后 invalidate；文件头标注镜像的 Go struct；状态枚举/分页信封进 `tests/contract/` zod 守卫。
- claw 不能 import `features/skills/`，数据 hook 落 `shared/api/`。
- SKILL.md 预览 `react-markdown + remark-gfm + rehype-highlight`，**绝不 `rehype-raw`**；状态 Badge 用 token 色（`brand-red` 驳回/下架、`brand-amber` 审核中、`brand-green` 已发布）。
- Radix modal 铁律：`open={open && cond}` 常驻 + 内容守卫，严禁「open 时被 unmount」。

### 6.4 配额（防滥用，参考 library `MaxSharesPerUser`）
每用户 skill 数（免费 10/Pro 50）、单 skill 版本 ≤20、bundle ≤2MB、SKILL.md ≤8000 字符、上传频率限流、单会话启用 ≤5。**skill 本身不单独计费**，触发的 agent 轮次照走 `vip.CheckDailyQuota`。

---

## 7. 分期落地路线图

### Phase 0 · 前置改造（不接市场也该做，A/B/C 共用，可独立回滚）
- `loader.ts` `addDirContextCache` 改内容 hash + LRU / bypass（防内存泄漏）
- 修 `buildCreateOptions` 浅拷贝 slice 别名 bug
- **生产硬锁 `EXECUTOR_ALLOW_UNSANDBOXED_BASH` 存在即拒绝启动**
- 审计 `ws.ts:107` 确认前端不可控 addDirs
- **交付物**：更安全的 executor；**可回滚点**：每项独立 commit。

### Phase 1 · 市场 + tier-1 纯指令 MVP（能安全跑起来的最小闭环）
- 迁移 0061 四表 + `agent_session_skills` 快照 + `BucketSkillBundles` + `internal/skillmarket`（上传/解压校验/frontmatter 规范化，backend 只解析不执行）
- `FeatureSpec.AddDirsProvider` 钩子 + executor `CreateOpts.skills` 内联通道 + `deleteSession` 清理 `.skills` + loader 信任分级（只 guides、禁常驻注入、围栏注入、菜单预算分区）
- tier-1「三无」：`disallowedTools` 含 Bash，维持 `unsandboxedBashGate` 关闭
- 前端 `features/skills/` 三页 + claw 启用面板 + admin 审核/举报两页
- 审查流水线（降噪）+ 举报 + kill-switch + 内容 hash 锁版本
- **限制**：只放行 `needs_bash=false && needs_network=false` 的纯文本 skill
- **交付物**：完整可用的纯指令 skill 市场，Mac/prod 一致；**可回滚点**：市场入口 feature flag（关掉 = 市场不可见，claw 不物化用户 skill，退回现状）。

### Phase 2 · tier-2 脚本能力（沙箱就绪后）
- P0 密钥外移：上游调用走 backend broker，executor 只拿短时 scope token
- 生产 `runsc install` + `sandbox-orchestrator` + `docker-socket-proxy` + `EndpointResolver`（`agent_sessions.sandbox_kind` 列）
- worker 用 runc 跑通全链路（lease→推 skill→reseed→WS→release）→ 切 `--runtime=runsc` + cgroup + tmpfs + read_only
- egress-guard + DNS 防火墙
- `registry.ts` Bash/文件工具 `WORKER_MODE` 远程化（严格分支隔离，重点回归测试可信 claw）
- 才放行 `needs_bash`/`needs_network` skill 晋级可执行
- **交付物**：带脚本的不可信 skill 可在隔离 worker 跑；**可回滚点**：`EndpointResolver` 全量路由回共享 executor 的 flag + moderation gate 卡死脚本 skill 晋级。

### Phase 3 · 纵深与运营（可选）
低/高信任分池、审计异常检测、B1 演进（若需 worker 自主联网，才建 egress-broker）。

---

## 8. 风险与未决问题

### 8.1 致命风险（诚实标注）
1. **提示注入无任何沙箱能解**（贯穿三评审）：恶意 SKILL.md 正文诱导模型用自己被授权的工具（minicod 拿他人数据、Read 读本会话敏感上传）越权，**无需 Bash**，发生在可信平面。tier-1 只把它降到「单会话内」，围栏注入只降成功率非硬边界。**必须接受：市场上线即带此残余风险，靠关闭 auto-approve + egress allowlist + 高危工具人审把「可行动性」压到最低。**
2. **B2 的 docker.sock 是不可消除的新特权面**：gVisor 不能嵌套，worker 必由宿主 daemon 起，必有进程持 sock。orchestrator 被攻陷 ≈ 接近宿主逃逸。即便 socket-proxy 限权，这是用「一个高价值单点」换「每会话强隔离」。
3. **tier-2 前置在「线上 none」现状下形同虚设 + 坍缩模式**：只要 gVisor + 密钥外移 + egress 一天没落地，脚本 skill 一天不能真跑；若有人「临时」放行 Bash，整个分层瞬间崩成「任意用户共享容器 shell + 直读密钥 + 跨租户读文件」。**Phase 0 的生产硬锁是唯一防线，必须真做。**
4. **审核质量决定 T1 安全水位**：T1（已审核公开）拿到比 T2 更大能力（Write、未来出网），而扫描器可 <1h 绕过——一个骗过审核的恶意 skill 拿更大能力，是分层模型的结构性缺陷。

### 8.2 成本
- Phase 1 成本 ≈ library-reference 物化（~ms，单容器不变），几乎零新基建。
- Phase 2 引入热池（空 worker 也常驻烧内存）+ 全新容量规划维度（现在只有一个 1.5G agent）；冷启动 vs 成本两难，**没有免费档**，需按真实并发调。

### 8.3 需 owner 拍板的决策点
1. **tier-2 到底做不做 / 何时做**：若产品可接受「市场只上纯指令 skill、永不跑用户脚本」，则 Phase 2 整体可砍，风险面从 RCE 降到仅提示注入，成本大降。**这是最大的一个拍板点。**
2. **若做 tier-2**：确认目标 VPS 能跑 gVisor systrap（**待验证**，几乎所有现代 Linux 可）；接受引入 docker.sock 编排服务的特权面。
3. **密钥外移的优先级**：即便不做 tier-2，是否值得先把 `MINICOD_API_KEY`/`EXECUTOR_AUTH_TOKEN` 移出 executor（当前 tier-1 靠「无 Bash」回避，但这是纵深加固）。
4. **审核人力**：public skill 过审是人工还是纯自动？纯自动 = T1 安全水位由可被绕过的扫描器决定（见 8.1.4）。
5. **dev/prod 能力割裂的接受度**:tier-2 在 Mac 永远不可开发，只能远程 Linux 迭代——接受这个开发反馈环变长。

### 8.4 待验证清单
- `ws.ts:107` addDirs 注入口是否前端可控（安全前提）
- executor 常量 `MAX_SKILL_BODY` / `MENU_CAP_CHARS` / `SKILL_NAME_RE` 精确值（以 `registry.ts`/`loader.ts` 为准）
- 目标生产 VPS 内核/发行版对 gVisor systrap 的支持
- `confine.ts` 对 cwd 外 `.skills` 目录的 realpath 断言是否需补
- executor `CreateOpts.skills` 内联通道在 seed_history 重放帧的体积上限（内联全量内容 vs `TOTAL_CAP` 压力）

---

**一句话总结**：Phase 0 修隐患 + 加硬锁；Phase 1 用 C 骨架的 tier-1「三无」上纯指令 skill 市场（Mac/prod 一致、零新沙箱、库存范式复用），这是「能安全跑起来的最小闭环」；脚本能力用 B2（prism-tex 同构的 per-session gVisor 断网零密钥 worker）压到 Phase 2 且被 moderation gate 卡死；egress 用 A 的 guard；提示注入是所有档的不可消除残余风险，靠关闭 auto-approve + allowlist + 人审并行缓解，而非沙箱。

---

# 附录 A · 市场与集成设计(数据模型/格式契约/UX 详版)

> 正文第 3/4/6 章的展开细节。表结构 DDL、frontmatter 契约、前端页面/路由/接口清单在此。

# Skills 市场与 claw 动态加载集成 · 设计章节

> 范围:数据模型、用户 skill 格式契约、动态加载接缝、市场 UX、配额计费。**沙箱/执行隔离选型不在本章**(另案)。但本章所有设计都以「skill = 不可信用户内容(SKILL.md = 提示注入面,附带脚本 = RCE 面)」为前提,并把「执行隔离未就绪」作为硬约束,决定 MVP 只放行**纯指令型 skill、零脚本、只走 guides 按需菜单**。

---

## 0. 贯穿全章的三条不可协商红线

这三条是威胁模型反转后的地基,后面每个设计决策都由它推导:

1. **不可信 skill 只能走 `guides/` 按需菜单,绝不进常驻注入路径。** 平台物化用户 skill 时,**永远不写** `<addDir>/CLAUDE.md` 和 `<addDir>/.claude/skills/`(这两条被 `loader.ts:loadAddDirContext` 无条件拼进每轮 system prompt = 最强注入位)。用户内容只落 `<addDir>/guides/<slug>/SKILL.md`,由模型看菜单后主动 `Skill()` 加载,有自主判断层 + `skill_loaded` 日志留痕。
2. **MVP 零附件、零脚本、Bash 保持关闭。** 线上 `SANDBOX_MODE=none` + `unsandboxedBashGate` 在生产把 Bash 直接关掉——这道闸今天挡住了 RCE。**改造 claw 接市场时绝不为「让 skill 有用」而放行 Bash**;带脚本的 skill 压到 per-user 沙箱就绪之后(另案)。因此 MVP 的 skill 契约 = 恰好一个 `SKILL.md` 纯文本。
3. **frontmatter 声明的能力(`allowed-tools` 等)只作展示,绝不据此授权。** executor 根本不解析这些字段(实证:只解析 `menu/when_to_use/description/axis` 四个)。任何真限制在后端权限门 + executor denylist 落地;manifest 只能**收窄**、平台默认拒绝。

---

## 1. 数据模型

### 1.1 MinIO 桶与 key 约定

- `storage.Config` 新增 `BucketSkillBundles`(建议桶名 `scholay-skill-bundles`);`storage.Init` 加一段 `ensureBucket`,加一个 `SkillBundlesBucket()` getter。桶**私有**,不给 presigned URL(沿用全平台「backend stream 转发」范式)。
- **永久资源,不挂 `tmp/` ILM**;若做「草稿上传→发布」两阶段,草稿走 `tmp/` 前缀复用 24h 自动过期兜底。
- **Key 约定**:`skills/<user_id>/<skill_id>/v<version>/<sha256>.tgz`
  - 含 `user_id` 段 → 用户注销时 `ListObjectKeys("skills/<uid>/")` 一把清、且天然防误删他人。
  - 含 `v<version>` 段 → 历史版本并存(回滚 + 举报定位到具体版本)。
  - `sha256` 秒传去重:`Put` 前算整包哈希,同 sha 命中则跳过上传只写元数据。
- **bundle 大小上限 2MB**(纯文本 skill 绰绰有余;上传入口先 `ParseMultipartForm` 限幅,再 magic-bytes 校验 gzip `1f 8b`)。

### 1.2 表设计(4 张表,迁移 `0061_skill_market.sql`)

沿用近期实践(单文件 + CREATE TABLE 内联 PK/UK/KEY,`utf8mb4`,`CREATE TABLE IF NOT EXISTS`,never DROP)。下一个可用编号 = **0061**。

**表 A `user_skills`(市场主表:所有权 + 元数据 + 当前版本指针 + 可见性 + 过审)**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT UNSIGNED PK AI | |
| `user_id` | BIGINT UNSIGNED NOT NULL | 作者 |
| `slug` | VARCHAR(160) NOT NULL | 公开短链 `/skills/<slug>`;`UNIQUE`;派生自 name + 冲突加后缀 + **保留字守卫**(参考 `reservedToolSlugs`) |
| `name` | VARCHAR(120) NOT NULL | **不可信展示文本,渲染必转义** |
| `tagline` | VARCHAR(255) | 一句话简介 |
| `description_md` | TEXT | 市场详情(不可信) |
| `when_to_use` | VARCHAR(1024) | frontmatter 抽取,给菜单/展示 |
| `declared_tools` | JSON | SKILL.md `allowed-tools`,**仅展示/审核参考,不授权** |
| `current_version_id` | BIGINT UNSIGNED NULL | → `skill_versions.id`,生效版本指针 |
| `visibility` | VARCHAR(16) NOT NULL DEFAULT 'private' | `private`/`unlisted`/`public` |
| `moderation_status` | VARCHAR(16) NOT NULL DEFAULT 'draft' | `draft`/`pending`/`approved`/`rejected`/`flagged`;**public 必须 approved 才对外可见** |
| `moderation_note` | VARCHAR(512) | 驳回理由 |
| `category` | VARCHAR(40) DEFAULT 'other' | 市场浏览分组 |
| `install_count` | BIGINT NOT NULL DEFAULT 0 | 去正规化启用量(排序用,可后台重算对账) |
| `report_count` | INT NOT NULL DEFAULT 0 | 未处理举报数,超阈值自动置 `flagged` |
| `status` | VARCHAR(16) NOT NULL DEFAULT 'active' | `active`/`disabled_by_admin`/`deleted` |
| `created_at`/`updated_at` | DATETIME | |

索引:`UNIQUE(slug)`、`KEY(user_id, updated_at)`、`KEY(visibility, moderation_status, install_count)`(市场「公开已过审按热度」)、`KEY(category)`。

**表 B `skill_versions`(不可变版本,bundle 存 MinIO)**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT UNSIGNED PK AI | |
| `skill_id` | BIGINT UNSIGNED NOT NULL | → user_skills |
| `version` | INT NOT NULL | skill 内自增 1..N;`UNIQUE(skill_id, version)` |
| `object_key` | VARCHAR(512) NOT NULL | `skills/<uid>/<skill_id>/v<n>/<sha256>.tgz` |
| `bundle_sha256` | CHAR(64) NOT NULL | 完整性 + 秒传 |
| `bundle_size` | BIGINT NOT NULL | |
| `manifest_json` | JSON | frontmatter 解析快照 |
| `skill_md` | MEDIUMTEXT | **规范化后的 SKILL.md 正文**(见 §3.2:后端解析、清洗、命名空间化后落库,物化时直接从此列写盘,不再回 MinIO 解 tarball) |
| `entry_count` | INT DEFAULT 1 | bundle 内文件数(审核展示) |
| `scan_status` | VARCHAR(16) DEFAULT 'pending' | `pending`/`clean`/`suspect`(静态扫描 = **降噪非授权门**) |
| `scan_report` | JSON | 命中项 |
| `moderation_status` | VARCHAR(16) DEFAULT 'pending' | **版本级**审核(每次改内容重审) |
| `changelog` | VARCHAR(512) | |
| `created_at` | DATETIME | |

索引:`UNIQUE(skill_id, version)`、`KEY(bundle_sha256)`、`KEY(skill_id, created_at)`。

> 设计要点:`skill_md` 冗余存 DB 是为**物化热路径零 MinIO 往返**(建会话时直接把该列写进 per-session guides 目录)。MinIO 的 tarball 仅作原始归档/审计/未来带附件时的真源。MVP 阶段 tarball 甚至可退化为「就一个 SKILL.md 打包」。

**表 C `user_enabled_skills`(用户在 claw 启用了哪些 = installs)**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT UNSIGNED PK AI | |
| `user_id` | BIGINT UNSIGNED NOT NULL | 启用者 |
| `skill_id` | BIGINT UNSIGNED NOT NULL | |
| `pinned_version_id` | BIGINT UNSIGNED NULL | NULL=跟随作者 current_version(需 approved);非 NULL=钉某版本 |
| `enabled` | TINYINT(1) DEFAULT 1 | 软开关 |
| `source` | VARCHAR(16) DEFAULT 'self' | `self`/`market` |
| `created_at`/`updated_at` | DATETIME | |

索引:**`UNIQUE(user_id, skill_id)`**(幂等 enable)、`KEY(skill_id)`。`install_count` 由本表增删维护 + 后台对账。

**表 D `skill_reports`(举报)**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` PK / `skill_id` / `version_id` NULL / `reporter_user_id` | | |
| `reason` | VARCHAR(32) | `prompt_injection`/`malware`/`data_exfil`/`ip_infringe`/`spam`/`other` |
| `detail` | VARCHAR(1024) | |
| `status` | VARCHAR(16) DEFAULT 'open' | `open`/`reviewing`/`actioned`/`dismissed` |
| `handled_by` | BIGINT UNSIGNED NULL | admin user_id |
| `created_at`/`resolved_at` | DATETIME | |

防重刷:`UNIQUE(skill_id, reporter_user_id, reason)`。索引 `KEY(skill_id, created_at)`、`KEY(status)`。

### 1.3 迁移骨架(节选,风格对齐 0032)

```sql
-- 0061: Skills 市场(bundle 存 MinIO;DB 存元数据+版本+启用+举报)
-- ⚠️ skill = 不可信用户内容:name/description 渲染必转义;declared_tools 仅展示不授权;
--    执行隔离靠 per-user 沙箱(另案)。幂等 CREATE TABLE IF NOT EXISTS;never DROP;中文 utf8mb4。
CREATE TABLE IF NOT EXISTS `user_skills` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `slug` VARCHAR(160) NOT NULL,
  `name` VARCHAR(120) NOT NULL DEFAULT '' COMMENT '不可信展示文本,渲染转义',
  `tagline` VARCHAR(255) NOT NULL DEFAULT '',
  `description_md` TEXT NULL,
  `when_to_use` VARCHAR(1024) NOT NULL DEFAULT '',
  `declared_tools` JSON NULL COMMENT '仅展示/审核参考,不据此授权',
  `current_version_id` BIGINT UNSIGNED NULL,
  `visibility` VARCHAR(16) NOT NULL DEFAULT 'private',
  `moderation_status` VARCHAR(16) NOT NULL DEFAULT 'draft',
  `moderation_note` VARCHAR(512) NOT NULL DEFAULT '',
  `category` VARCHAR(40) NOT NULL DEFAULT 'other',
  `install_count` BIGINT NOT NULL DEFAULT 0,
  `report_count` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(16) NOT NULL DEFAULT 'active',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slug` (`slug`),
  KEY `idx_user_updated` (`user_id`,`updated_at`),
  KEY `idx_market_rank` (`visibility`,`moderation_status`,`install_count`),
  KEY `idx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Skills 市场 · 主表';
-- skill_versions / user_enabled_skills / skill_reports 见 §1.2(结构同上,略)
```

---

## 2. 用户 Skill 的格式契约(MVP)

**一个用户 skill = 恰好一个 `SKILL.md` 纯文本文件(MVP 零附件)。** 未来放开附件需白名单扩展名 + 大小上限 + 落 Bash 不可达路径 + 强制沙箱。

### 2.1 平台侧物化后的目录形态(per-session,见 §3)

```
<per-session-skill-dir>/          ← backend 为每个 claw 会话独立生成、只读给 executor
  guides/
    u<userId>-<slug>/             ← 目录名 = 加载 key = 强制命名空间前缀
      SKILL.md                    ← 唯一文件
```

- **只进 `guides/`(按需菜单)**;严禁进 `CLAUDE.md` / `.claude/skills/`(红线 1)。
- 目录名 = **`u<userId>-<slug>`**,整体必须匹配 executor 白名单 `^[a-z0-9][a-z0-9-]*$`。前缀双重作用:防与他人/一方 skill 撞名(`skillTool` 首个命中即返回,撞名会被 shadow)、防冒充一方 skill 名(如 `topic-selection`)做诱导。

### 2.2 frontmatter(平台解析并**规范化**后写入,不直接信任原文)

- **必填**:`name`(展示;平台覆写为 slug 保持一致)、`description`(市场卡片)、`menu`(菜单指针,**平台强制截断 ≤60 字符**——仓库无 lint,得自己截)。
- **可选**:`when_to_use`、`axis`(仅 `craft`/`rigor`,非法值归「其它」)。
- **一律剥离**:`allowed-tools`/`user-invocable`/`disable-model-invocation`/`model`/`effort` 等——executor 不读,留着只会误导。剥离前把 `allowed-tools` 原值抄进 `declared_tools`(展示用)。
- **照抄官方硬约束并加严**:`name` 仅小写字母数字连字符、**禁含 XML/`<>` 标签**、**禁保留词**(`anthropic`/`claude`/一方 skill 名);`description` ≤1024、禁 XML 标签。

### 2.3 大小/数量限制(对齐 executor 硬约束)

| 约束 | 值 | 依据 |
|---|---|---|
| 单份 SKILL.md 正文 | ≤ **8000 字符**(上传即拒) | executor `MAX_SKILL_BODY=16000` 会静默截断,留一半余量 |
| 单会话装载用户 skill | ≤ **5 份** | 护住 `MENU_CAP_CHARS=2500`:一方 lens 菜单已占预算,超限的 guides 条目**静默丢弃**,会让 skill 神秘消失。给用户 skill 单独菜单预算或硬限 5 份 |
| bundle 大小 | ≤ 2MB | §1.1 |
| 附件 | **0**(MVP) | 红线 2 |

### 2.4 注入前的内容清洗(降噪层,非信任边界)

上传即视为不可信,入库前:frontmatter 白名单剥离 + 大小/正则校验 + 已知注入模式扫描(base64/Unicode 走私、`ignore previous instructions`、隐藏在 markdown 注释里的指令、硬编码外链 URL);`scan_status` 记 `clean`/`suspect`。**明确:扫描器可被 SkillCloak/test-file 绕过,只降噪,信任落在运行时隔离(另案)+ guides 按需 + Bash 关闭。**

---

## 3. 动态加载集成(核心接缝)

### 3.1 现状回顾与唯一收口

- claw 的 `AddDirs` 现在是静态常量 `["/claw-add"]`(`claw/spec.go`),全用户共享 compose `:ro` 挂载。
- 唯一把 per-user 信息塞进建会话选项的地方 = **`buildCreateOptions(ctx, userID)`**(`agentbridge/bridge.go:917`),已被 create/newsession/reset/recreate/**seed_history** 五条路径共用。**这是 per-user addDir 的唯一且干净插入点。**

### 3.2 FeatureSpec 接缝:从静态 AddDirs 改成 per-session 动态

`FeatureSpec` 新增钩子:

```go
// 返回:该 user 本次建会话要额外挂的 addDir 路径 + 冻结进会话的 skill 版本快照
// 内层实现负责把 skill 内容物化到 per-session 目录并返回其路径
AddDirsProvider func(ctx context.Context, userID uint64, sessionID string) (dirs []string, snapshot []EnabledSkillRef, err error)
```

`buildCreateOptions` 改造(**必须修浅拷贝 slice 别名 bug**):

```go
clone := *base
clone.AddDirs = append([]string(nil), base.AddDirs...)   // 新分配,杜绝就地污染静态 spec
if f.spec.AddDirsProvider != nil {
    extra, snap, err := f.spec.AddDirsProvider(ctx, userID, sessionID)
    // 物化失败 = fail-open 到「无用户 skill」而非阻断建会话(skill 是增强非必需)
    clone.AddDirs = append(clone.AddDirs, extra...)       // /claw-add 仍在,用户 dir 并列
    // snap 持久化(见 §3.4)
}
```

> claw 的 `AddDirsProvider` 实现在 `internal/skillmarket`(新模块),`claw/spec.go` 只引用它——避免 claw 直接依赖市场表。

### 3.3 物化流程(DB/MinIO → per-session 只读目录 → executor addDirs)

复用 claw `library-reference` 「把 references/ 物化进目录」的成熟范式。**关键:物化目标在 cwd 之外**(否则模型 Write/Edit/Bash 能自改写、且被「成果收割」误列)。

1. 建会话时,`AddDirsProvider` 查 `user_enabled_skills WHERE user_id=? AND enabled=1`,join `skill_versions` 取生效版本(pinned 或 current;且**必须 approved**——他人 public skill 未过审不物化)。
2. 对每个 skill,把 `skill_versions.skill_md`(已规范化正文)写进 **per-session 目录** `<SESSIONS_ROOT>/<sid>.skills/guides/u<uid>-<slug>/SKILL.md`(与 workDir 平级,不在 cwd)。硬限 ≤5 份、总菜单预算内。
3. 该目录路径作为额外 addDir 传入 `CreateSession.AddDirs`。`loader.buildSkillMenu` 与 `skillTool` **无需改动**即识别。

**两种投递机制二选一**(backend 与 agent 不共享可写卷):
- **推荐 · 路径 A(内联传内容)**:扩 executor `CreateOpts` 加 `skills:[{name, skillMd}]`,executor `createSession` 侧把每份物化到 `<sid>.skills/guides/<name>/SKILL.md` 并 push 进 `meta.addDirs`。后端零共享卷,内容随建会话/seed 帧下发,skill 更新即时。**`deleteSession` 需一并 `rm <sid>.skills`**(现只删 workDir)。
- 路径 B(共享卷):后端写 `/skill-store/<sid>/...`、AddDirs 指该路径。引入 backend↔agent 共享可写卷(当前刻意没有)、GC/并发复杂——**不推荐**。

### 3.4 【必须先修】`addDirContextCache` 的坑

`loader.ts:129` 的 `addDirContextCache` key = `addDirs.join('|')`,value = 渲染好的 system 后缀。per-session skill dir 路径含 sid ⇒ **每会话唯一 key ⇒ 缓存永不命中 + Map 无界增长(进程生命期内存泄漏)**。若改用「稳定路径」省内存,又会「同路径内容被换 → 跨会话读到旧内容」。

**改造方案**:缓存 key 从「路径拼接」改为**「addDirs 各目录内容 hash + LRU 上限」**;或对 per-user skill dir **直接 bypass 缓存**(用户 skill 每份 ≤8000 字符、≤5 份,渲染开销可接受)。**这是接入 per-user skill 的前置改动,不改会内存泄漏 + 陈旧内容。**

### 3.5 会话级 skill 快照 vs enable/disable 后的存量会话

**语义定调:skill 在建会话时刻冻结,enable/disable 只影响新对话。** 理由链:

- claw = 一用户 N 个长期 session(`agent_sessions` 代理键 PK,claw 被 migration 0034 显式排除单会话唯一键)。不同会话可能建于不同时间、带不同 skill 集。
- executor `ws.ts:107` **只在 `meta.addDirs` 为空时回填**(backfill-when-empty),re-seed **改不动活会话** addDir。所以「市场里 enable 一个 skill」对已存在活会话无效。
- **给用户的两个动作**:
  - **新建对话**(`CreateNewSession`):带当前 skill 集,老会话保持旧集 —— 契合多会话 UX,推荐默认。
  - **Reset 当前会话**(`ResetSession`):换 sid、丢历史、按新 skill 集重建 —— 供「就想在这个会话换 skill」用,前端明确二次确认「将清空当前对话」。

**必须落库会话级快照(否则 executor 重启后 skill 漂移)**:`seedHistoryFromJournal` 用 `buildCreateOptions` **现算** addDir(= 当前市场态)。若老会话建时启用 A、之后用户改成 B,executor 重启补空时会把老会话 rebind 到 B,与「活会话仍是 A」不一致。

- **落库方式**:新增侧表 `agent_session_skills(session_row_id, skill_id, version_id, created_at)`(或 `agent_sessions` 加 `skills_snapshot JSON` 列),建会话时把 `snapshot` 写入。
- `AddDirsProvider` 在 **seed 路径**优先读该会话快照(冻结版本),**只有首次建会话**才读 live 的 `user_enabled_skills`。这样重启回填得到的是「这个会话当初的 skill 集」,而非当前市场态。

### 3.6 安全接缝校验

- **addDir 必须始终由 backend 控制面下发。** `ws.ts:107` 允许 `meta.addDirs` 为空时从 WS 帧注入 addDirs —— 市场上线前**确认该路径不被前端可控**,否则用户自带任意 addDir 绕过审核。若不能保证,收紧为「只接受来自 seed_history/create 的 addDirs,拒绝纯前端 WS 帧的 addDirs」。
- per-session `.skills` 目录同样过 `safeSessionDir`/realpath 断言防逃逸;目录内相对引用/符号链接 confine(现 `confine.ts` 只服务 cwd,物化目录需补断言)。
- 物化只写 `skill_md` 纯文本,**backend 全程不解压执行 tarball、不跑任何脚本**。

---

## 4. 市场 UX

新建 feature **`src/features/skills/`**;admin 审核并入 `features/admin/`。claw 启用面板数据 hook 因跨 feature 禁令落 **`shared/api/skills.ts`**。

### 4.1 用户端

| 页面 | 路由 | 主要组件 | 接口草案 |
|---|---|---|---|
| **市场浏览** | `/skills`(壳 `SkillsMarketLayout`+`<Outlet/>`,仿 `ToolsLayout`);index=`SkillsCatalogPage` | `SkillCard`、`SkillsFilterSidebar`(分类/排序,URL 态 `useUrlState`)、搜索条、`EmptyState`/`LoadingState`/`RouteSEO`、分页 `PAGE_SIZE=24` | `GET /skills/market?q&category&sort&page&page_size`(信封 `{list,total,page,pageSize}`)· `GET /skills/market/categories` |
| **详情/SKILL.md 预览** | `/skills/:idOrSlug` | 元数据头(作者/安装数/更新时间/`declared_tools` 徽章 + **「社区·未审核」来源标签**)+ **`SkillReadme`(react-markdown 只读,禁 `rehype-raw`/`dangerouslySetInnerHTML`)** + 「安装到我的」+ 「举报」 | `GET /skills/market/:idOrSlug` · `POST /user/skills/installed` · `POST /skills/market/:id/report` |
| **我的 Skills** | `/skills/mine`(loader 守卫);编辑 `/skills/mine/:id` | `MySkillsPage`(状态 Badge:草稿/审核中/已发布/驳回/下架)、`SkillEditorPage`(`react-hook-form+zod`)、`SkillUploadDialog`、可见性 `Switch`、`ConfirmDialog` 删除 | `GET /user/skills` · `POST /user/skills`(multipart,仿 `useUploadClawAttachment` FormData mutation)· `GET/PATCH/DELETE /user/skills/:id` · `PUT /user/skills/:id/content`(传新版本)· `POST /user/skills/:id/publish`(转 public → moderation=pending) |
| **claw 内启用面板** | 挂 `/claw` 侧栏 | `ClawSkillPanel` = `ClawSidebar` 第三个 `SidebarSection`(在 `ClawModelSelector` 与 `ClawSessionList` 之间),多选开关列「我已安装的 skills」 | 数据复用 `shared/api/skills.ts` 的 `useInstalledSkills`;启用走 WS 控制帧 `{type:'set_active_skills', skillIds:[...]}`(仿 `set_runtime_config`,per-session,`onSendToSocket` 透传)+ localStorage per-session 记忆 |

**claw 启用面板的语义对齐 §3.5**:面板改动**只对新对话/Reset 生效**。UI 明示:切换 skill 后提示「将应用于新对话」,并提供「在新对话中应用」按钮(触发 `CreateNewSession` 带新 skill 集)。避免用户误以为热切换当前会话。

### 4.2 管理端(并入 `features/admin/`)

| 页面 | 路由 | 组件 | 接口 |
|---|---|---|---|
| **审核队列** | `/admin/skills-review`(`nav.ts`「内容运营」组;`handle.title:'Skill 审核'`) | `SkillReviewPage`:`DataTable` + 状态筛选 + 详情 Drawer 内嵌 `SkillReadme` 预览 + 审核动作 | `GET /admin/skills?status=&page` · `POST /admin/skills/:id/approve` · `POST /admin/skills/:id/reject`(带原因)· `POST /admin/skills/:id/takedown`(下架 = kill-switch) |
| **举报处理** | `/admin/skills-reports` | `SkillReportsPage`:`DataTable` + 关联 skill 预览 + 处理动作 | `GET /admin/skills/reports` · `POST /admin/skills/reports/:id/resolve`(驳回举报/下架 skill) |

admin API:`features/admin/api/skills.ts`,`queryKey ['admin','skills',...]`,mutation 成功 `invalidateQueries(['admin','skills'])`。

### 4.3 前端铁律约束(`frontend-user/CLAUDE.md`)

- **§0/§3 安全叠加**:SKILL.md 预览用 `react-markdown + remark-gfm + rehype-highlight`,**绝不开 `rehype-raw`/`dangerouslySetInnerHTML`**(不可信内容 → XSS);`declared_tools` 以 Badge 明示。所有接口写成 react-query hook 经 `http` 实例,`queryKey` 三段式,mutation 后 invalidate;文件头注释标注镜像的 Go struct;状态枚举/举报状态/分页信封进 `tests/contract/` 用 zod 守卫。
- **§1 依赖方向**:claw 不能 import `features/skills/`;启用面板数据 hook 必须在 `shared/api/skills.ts`;共享类型放 `shared/types/`。
- **§5 样式 token**:状态 Badge 用 `brand-red`(驳回/下架)/`brand-amber`(审核中)/`brand-green`(已发布),软底 `bg-danger-soft`/`bg-warning-soft`;禁 `.css`/内联 style/`dark:`/`text-gray-*`。
- **§6/§10**:admin 队列用 `features/admin/components/DataTable.tsx`(shared/ui 无 Table 原子);网格仿 `ToolCard`;`SkillCard` forwardRef+displayName ≤300 行;上传/编辑/审核用 shadcn `Dialog`/`Sheet` 且严禁「open 时被 unmount」(`open={open && cond}` 常驻 + 内容守卫);删除二次确认 `ConfirmDialog`,Toast 用 `sonner`。

---

## 5. 配额与计费

### 5.1 上传/持有限额(防滥用,参考 library `MaxSharesPerUser`)

| 项 | 建议值 | 落地 |
|---|---|---|
| 每用户 skill 数上限 | 免费 10 / Pro 50 | 上传前 `COUNT(user_skills WHERE user_id=? AND status!='deleted')` |
| 单 skill 版本数 | ≤ 20(超出提示删旧版) | `COUNT(skill_versions)` |
| 单 bundle 大小 | ≤ 2MB(§1.1) | 入口 multipart 限幅 |
| 单 SKILL.md 正文 | ≤ 8000 字符(§2.3) | 解析后校验 |
| 上传频率 | 每用户 N 次/小时 | 复用 `RateLimitMiddleware` 用户维度 |
| 单会话启用 skill | ≤ 5 份(§2.3) | enable 时校验 + 物化时硬截断 |

### 5.2 可见性与审核门

- `private`/`unlisted` 可自用(仍不可信,靠隔离兜);`public` **必须 `moderation_status=approved`** 才对外可见。
- 转 public → `moderation_status=pending` 进审核队列;每次**改内容(新版本)需重新过审**(版本级 `moderation_status`)。
- 举报累计超阈值 → 自动 `flagged` 下架待复核;admin `takedown` = 全局 kill-switch。
- 「公开分享」= 只读展示 SKILL.md 文本;他人「使用」= **install 到自己名下**(`user_enabled_skills` 加行 + `pinned_version_id` 可钉版本)。**内容 pin 版本**:作者事后改内容不影响已装用户(除非用户跟随 current 且新版已 approved)。

### 5.3 启用他人 skill 的限制

- 只能 install `visibility=public AND moderation_status=approved AND status=active` 的 skill;作者下架/被 takedown 后,已装用户下次建会话物化时**跳过失效 skill**(fail-open,不阻断)。
- **运行时不因「装了别人的 skill」而放开任何能力**:被启用的 skill 仍只进 guides 按需菜单、仍无 Bash、仍受 claw 现有工具权限门约束(红线 1/2/3)。
- **计费**:skill 本身不单独计费;它触发的 agent 轮次照常走 claw 现有 `agentbridge.StandardHooks` → `vip.Service.CheckDailyQuota` tier-aware 日额度。即「用 skill 干活」= 正常消耗 token 额度,无新增计费维度。

---

## 6. 落地顺序建议(给实现)

1. **前置改造**(不接市场也该做):`loader.ts` `addDirContextCache` 改内容 hash + LRU(§3.4);修 `buildCreateOptions` 浅拷贝 slice 别名 bug(§3.2)。
2. **数据层**:迁移 0061 + `storage.BucketSkillBundles` + `internal/skillmarket` 模块(repo/service/handler)。
3. **动态加载**:`FeatureSpec.AddDirsProvider` 钩子 + executor `CreateOpts.skills` 内联通道 + `deleteSession` 清理 `.skills` + 会话级快照侧表(§3.3/3.5)。收紧 `ws.ts:107` 前端不可控 addDirs(§3.6)。
4. **市场 UX**:`features/skills/` + claw 启用面板 + admin 两页。
5. **配额/审核**:限额校验 + 审核队列 + 举报 + kill-switch。

**MVP 边界再强调**:纯指令型 skill、零附件、只走 guides、Bash 保持关闭。「带脚本的 skill」与「运行时真隔离」是本设计的显式前置依赖,归属另案沙箱工程,未就绪前不放行。

---

# 附录 B · 沙箱三提案的对抗评审(为什么这样选)

> 第 5 章推荐方案的依据。三个沙箱提案(A=强化共享容器/bwrap,B=per-session gVisor worker,C=分层混合)经 security / feasibility / dev-ergonomics 三视角对抗评审后的原始结论,罕见地一致收敛。保留原文以便复核推理链。

## 评审(security)
纯安全强度评审(能否真正挡住跨租户读文件 / 偷密钥 / RCE / 数据外传 / 提示注入)。先给贯穿三案的两条硬事实,再逐案打分。

**贯穿事实(评分基线)**
1. **提示注入驱动"已授权工具"是所有三案都挡不住的面**,且比文档承认的更严重:即便在 B2,turnLoop 仍跑在共享可信 executor 里、仍持 minicod MCP + key + 会话上下文。注入让模型用 minicod 去拉/外发他人数据,发生在**可信平面**,worker 只兜住了 Bash-RCE。所以"沙箱开满仍泄他人数据"对三案同等成立,B 的隔离比它看起来要窄。
2. **"能不能真跑不可信脚本"才是真考题**。纯指令型 skill(Bash 关)的 RCE/T3/T4/外传面本就接近零——因为没有代码执行路径,confine 已覆盖 5 个文件工具。真正的安全强度差异,全在"要开 Bash/脚本时你拿什么兜"。

---

**方案 A(bwrap 强化共享容器)—— 6/10**
一句话:bwrap 的 per-session mount/pid namespace 对 T3(读他人 cwd)/T4(经 /proc 偷密钥)是**真硬解**,egress-guard+DNS 防火墙投入产出比最高;但共享宿主内核 = 非硬边界,且它自己承认只能上纯指令 skill。
- **最大问题(对抗性)**:**A 的核心机制与它自己的作用域自相矛盾**。A 因为 ro-bind 张力被迫"只上纯指令、Bash 保持关"(弱点3);可一旦 Bash 关着,bwrap 对 T3/T4 的价值就大幅蒸发(没有不可信代码执行路径,confine 已够),bwrap 沦为"防文件工具越狱"的纵深项而非主边界。也就是说:**A 真正需要 bwrap 的场景(开 Bash 跑脚本)恰恰是 bwrap 因共享内核 + 无 per-session cgroup 而不够格的场景。** 残余风险:unprivileged userns 是 CVE 高发区(CVE-2022-0185 类),一次内核 LPE 逃进 agent 容器;噪声邻居/资源型 DoS 在共享容器里 ulimit 只能 best-effort,无解。

**方案 B(per-session gVisor worker,B2 工具下沉)—— 8/10**
一句话:**唯一提供真租户边界的方案**;B2 形态下 worker `network_mode:none` + 零密钥 env,把"偷密钥(T4)"和"数据外传(T5)"从架构上消灭(没网没 key,`/proc/1/environ` 里无物可偷),RCE 关进即用即弃的 gVisor 容器,跨租户读文件靠独立内核视图物理隔离。
- **最大问题(对抗性)**:**docker.sock 是不可消除的新特权面**——gVisor 不能嵌套,worker 必须由宿主 daemon 起,必有进程持 sock;即便经 socket-proxy 限权,orchestrator 被攻陷 ≈ 可在宿主创建容器 ≈ 接近逃逸。你是用"一个高价值单点"换"每会话强隔离"。另外别被 B2 的干净迷惑:它只兜住 RCE/偷密钥,**注入驱动 minicod 拿数据仍在可信平面发生**(见基线1);B1 变体的 egress-broker 更是"做出来容易做对极难",allowlist 只比字符串不校验解析 IP、或放行递归 DNS,就是现成外传通道(Unit42 AgentCore 教训),这是最可能上线即带洞的部件——所以只该走 B2 断网 worker,别碰 B1。残余:gVisor 冷启动/热池成本、兼容性坑、Mac dev 完全跑不了(dev/prod 行为分叉)。

**方案 C(分层混合)—— 7/10**
一句话:**C 本身不贡献任何隔离机制,它是路由/策略层**;其安全强度 = max(档-1"默认三无"这一策略, 档-2 借来的 A 或 B)。档-1 的"无 Bash/无出网/无密钥"其实是**最强的一种保证——不执行不可信代码就不可能被 RCE**,且 dev/prod 一致;capability 只减不增、loader 信任分级(guides-only、禁常驻注入、addDirContextCache 重写)、moderation-gate 卡住带脚本 skill,都是策略正确性上的必做项。
- **最大问题(对抗性)**:两个系统性漏洞。①**信任档反向放大风险**:T1"已审核公开"能拿到比 T2 更多能力(Write、档-2 甚至网络),而"已审核"依赖的扫描器 research 证明可 <1h 绕过——**一个成功骗过审核的恶意 skill,能力随一个可伪造的信任信号而增长**,这是分层模型的结构性缺陷。②**档-2 前置在"线上 none"现状下形同虚设**,且存在灾难性坍缩模式:工期压力下有人 `EXECUTOR_ALLOW_UNSANDBOXED_BASH=1`,整个分层瞬间垮成"任意用户拿共享容器 shell + 直读密钥 + 跨租户读文件"。C 只是把真正的难题(档-2 隔离)优雅地推迟并甩给 A/B,自己不解决。残余:同 uid 共享容器地基的天花板未除;多会话×快照一致性复杂度。

---

**最该采纳(诚实结论,不和稀泥)**

**用 C 的框架当骨架,但别把 C 当"安全方案"——它只是决策层。真正的安全来自:MVP 期靠 C 档-1 把危险能力整个拿掉,scripted 期靠 B2 提供唯一的真隔离,egress 靠 A 的 guard。**

- **必采(与选型无关的 P0,三案都点名)**:loader 信任分级(不可信目录只走 guides、禁 `CLAUDE.md`/`.claude/skills` 常驻注入)、`addDirContextCache` 重写(否则 per-user 直接内存泄漏 + 陈旧内容)、`buildCreateOptions` slice 别名修复、**把 `MINICOD_API_KEY`/`EXECUTOR_AUTH_TOKEN` 移出 executor 进程**(改 backend broker + 每会话短时 scope token)、`unsandboxedBashGate` 维持关闭并**在生产对 `EXECUTOR_ALLOW_UNSANDBOXED_BASH` 加硬锁(该 env 存在即拒绝启动)**——这条硬锁直接封死 C 的坍缩模式,是本次评审里性价比最高的一行改动。
- **采 C 的档-1 作 MVP**:纯指令 + 三无。这是安全强度最高的起点,因为它用"不执行"消灭了 RCE/T3/T4/外传面,且 Mac 能开发验证。
- **采 B2 作 档-2 的唯一实现**:共享可信 executor 编排 LLM、per-session gVisor(runsc systrap 无需 KVM)worker 断网零密钥跑脚本。**不要用 A 的 bwrap 作 scripted skill 的最终答案**——共享内核对"任意用户不可信代码"不是硬边界。bwrap 至多作 worker 就绪前的临时过渡,且要诚实标注为过渡。
- **采 A 的 egress-guard + DNS 防火墙**(default-deny、校验并 pin 解析 IP、拦 169.254/内网/loopback),给一切"要出网"的档用;这块 A 写得最扎实。
- **明确写进设计的残余风险**:注入驱动已授权工具(minicod 拿他人数据、Read 读本会话敏感上传)**没有任何沙箱能解**,必须并行上"高危工具人审 + 市场会话关闭 permission_request 自动 approve + 每会话 egress allowlist",否则强隔离也救不了数据泄漏。

一句话:**B(B2)安全强度最高但引入 docker.sock 单点;C 的策略正确但零隔离贡献且有坍缩风险;A 的 bwrap 是过渡不是边界。落地 = C 骨架 + 档-1 三无 MVP + B2 做档-2 + A 的 egress-guard + 那一行 prod 硬锁。**

## 评审(feasibility)
# Feasibility 评审:三提案在现有基建的落地可行性

## 打分(1-10,纯落地可行性:改动量 × 真能跑起来的确定性)

| 提案 | 分 | 一句理由 |
|---|---|---|
| **C 分层/混合** | **8** | 档-1(guides-only + `disallowedTools` 关 Bash + confine)**不依赖任何内核沙箱**,dev/prod 行为一致,改动全落在现有架构(AddDirsProvider 单点 + library-reference 物化范式 + 四表),是三者里"能高确定性上线且够安全"的唯一切片——**代价是它靠不跑代码来赢,把 tier-2 真沙箱问题推给了 A/B。** |
| **B per-session gVisor** | **6** | 隔离最正确、且 **gVisor 作宿主 runtime(runsc/systrap 无需 KVM)在生产 Docker 反而比 A 的 bwrap 更确定能开**(它不嵌套、不与 agent 容器自身 seccomp/apparmor 对打);但改动面最大——新 orchestrator + docker.sock 特权面 + EndpointResolver 改核心路由 + 热池容量规划 + `registry.ts` 工具远程化(回归可信 claw 的风险)。**B2 靠 prism-tex 现成先例把不确定性压下来,是唯一让"跑不可信脚本"这件事真能落地的路径。** |
| **A 强化共享容器(bwrap)** | **5** | 改动最小、复用现成 bwrap 代码,topology 不动——但 **"bwrap 在生产 Docker 真能开"是三者里最不确定的一环**(要解 Ubuntu24 apparmor userns 限制 + 给 agent 容器写自定义 seccomp 放行 `unshare/clone/mount/pivot_root`、绝不能 unconfined + 宿主 sysctl),而且**即便开起来也解决不了核心需求**:`registry.ts:264` 不传 roBinds→skill 目录不进 jail→带脚本 skill 本就跑不了;要让它有用就得把不可信目录 ro-bind 回 Bash 可达面,RCE 面重开。per-session cgroup 配额在共享容器里拿不到。 |

## "bwrap / gVisor 在生产 Docker 真能开吗"—— 直接结论

这是本评审最反直觉、也最关键的一点:**gVisor 比 bwrap 更容易在你这套 Docker 里真正跑起来,尽管 gVisor 听起来更重。**

- **bwrap(方案 A)= 容器内再关一层**:它要在 `scholar_agent` 容器**内部** `unshare(CLONE_NEWUSER)`,直接撞上 Docker 默认 seccomp/apparmor 两道防线 + 宿主内核开关(Ubuntu 23.10+ 的 `apparmor_restrict_unprivileged_userns` 是 2024 后头号失败根因)。issue #505 证明"光加 cap 没用"。**可开,但 finicky,需宿主调优 + 自定义 seccomp,且和你 `unsandboxedBashGate` 的加固方向对冲。** 好在可 fail-closed(自检探针失败就退回 none)。
- **gVisor(方案 B)= 宿主 runtime**:`runsc install` 注册进 daemon,worker 是宿主 daemon 起的 sibling 容器,**不嵌套、不与 agent 自身的 seccomp/apparmor 打架**,systrap 平台**不需要 `/dev/kvm`/nested virt**(普通 VPS 直接可用)。它的"不确定性"不在内核能不能开,而在**你得引入一个持 docker.sock 的进程**(经 socket-proxy 限权)——是新特权面,不是内核赌博。

一句话:**A 赌的是内核/运行时能不能放开;B 赌的是你敢不敢引入受限 docker.sock 的编排服务。后者是工程可控的,前者是环境不可控的。**

## 各自最大问题(对抗性)

- **A 的致命伤 = 自相矛盾**:bwrap 是真实工程 + 不确定能开,但对 MVP(纯文本 skill)**根本不需要它**(guides-only + Bash off 就够);对带脚本 skill **它又安全地做不到**(§4 弱点 3 的 roBinds 张力无解)。加上共享内核非硬边界 + 无 per-session cgroup。**你付出了"开 bwrap"的全部不确定性,却落在一个既不需要它、又不能用它的能力区间。**
- **B 的致命伤 = 改动面 + docker.sock**:orchestrator 被攻陷≈接近宿主逃逸;热池是新容量维度(常驻烧内存 vs 冷启动 1-2s 的两难);`registry.ts` 工具远程化会碰可信 claw 的核心工具运行时(pdftotext 等),回归风险实打实。B1 的 egress-broker 是"做出来容易做对难"的上线即带洞高危区——**必须走 B2(断网 worker、零密钥)绕开它**。
- **C 的致命伤 = 它没解决真问题,只是排序**:tier-1 挡不住提示注入(只降到单会话内,恶意 SKILL.md 正文仍能诱导模型用**自己被授权的工具**越权,无需 Bash);tier-2 的沙箱前置在"线上 none"现状下形同虚设;而且 `EXECUTOR_ALLOW_UNSANDBOXED_BASH=1` 这个逃生舱**极可能被工期压力击穿**——C 自己也点名要在配置层加硬锁(生产环境该 env 存在即拒绝启动),这条**必须真做**,否则整个分层瞬间崩成"任意用户拿共享容器 shell + 直读密钥"。

## 最该采纳:哪个的哪部分

**采纳 C 的分层/排序框架作为骨架,tier-2 引擎位置留给 B2,坚决不用 A 的 bwrap。**

1. **现在就落 C 的第 0/1 期(高确定性、零内核依赖)**:loader 信任分级(guides-only、禁 `CLAUDE.md`/`.claude/skills` 常驻注入)+ `addDirContextCache` 重写(否则 per-session 路径直接内存泄漏)+ `buildCreateOptions` 加 `AddDirsProvider`(**务必修 `clone := *base` 浅拷贝 slice 别名 bug,否则跨租户污染静态 spec**)+ 会话级 `enabled_skills_snapshot` 落库(否则 executor 重启 reseed 会把老会话漂移到 live 市场态)+ library-reference 式 cwd 外物化 + 0061 四表。**这一切片 A/B/C 都共用,不是白做,且能让纯文本市场先上线。**

2. **tier-2 就绪时,采纳 B2(不是 A、不是 B1)**:共享可信 executor 继续编排 LLM,只把 Bash/不可信文件工具**这一次调用**下沉给 backend(经受限 docker.sock 的 orchestrator)动态起停的 `network_mode:none`、零密钥、gVisor、cgroup 配额的 per-session ephemeral worker。它与你**已在生产验证的 prism-tex 同构**(backend 经共享卷投喂断网 worker),密钥零暴露从根上消灭偷密钥面,冷启动可被热池吸收,且 journal-reseed 架构天然支持"worker 是全新空容器"。

3. **A 的可复用残值**:egress-guard/DNS 防火墙、loader 收窄、市场 DB、AddDirsProvider——但这些 **C 第 1 期本来就要做**,不构成"采纳 A"的理由。A 独有的"共享容器开 bwrap"是唯一该丢弃的部分。

**一句话**:C 给排序,B2 给引擎,A 的 bwrap 是看起来省事、实则付了不确定性又落在能力真空区的陷阱。dev(Mac)对 tier-2 一律降级"不可用",纯文本市场不受影响——这条三提案一致,照做。

## 评审(dev-ergonomics)
# 评审:dev-ergonomics(开发/运维体验)视角

只谈"写代码、本机跑、调试、回滚、别把现有 4 feature 搞坏",不谈安全强度。

## 打分

| 提案 | 分数 | 一句话理由 |
|---|---|---|
| **A 强化共享容器(bwrap)** | **7/10** | 本机开发环几乎不变、单容器可调、回滚就一个 `SANDBOX_MODE` 旋钮;但 bwrap 是**容器级全局开关**,一翻全 4 feature 一起变,且真隔离本机复现不了。 |
| **B per-session gVisor 容器** | **4/10** | 招牌能力(跑脚本)在 Mac 上**根本起不来**,ephemeral worker 用完即焚导致 prod 也难抓日志,还要动 `registry.ts` 工具运行时这一全 feature 热路径。 |
| **C 分层/混合** | **8/10** | 档-1(90% 纯指南 skill)**Mac 与 prod 行为完全一致、零新基建、改动加法且限于 claw**;真正难的档-2 被 moderation gate 明确推到二期、隔离掉 dev/prod 割裂。 |

## 各自最大的 dev-ergo 问题

**A —— "全容器一刀切" + 隔离路径本机不可复现。**
你没法只让 claw 进 bwrap:`SANDBOX_MODE=bwrap` 一开,smart_search / prism(已用 net:none)/ peerreview / claw 全部换执行模型,`seccomp`/`apparmor` 改的是整容器。任何 bwrap 引起的回归(比如 claw 的 pdftotext/pandoc 走 Bash 时行为变化)是**四个 feature 同时暴露**,回归面 = 整个 executor。更烦的是 bwrap 在 Mac(LinuxKit)永远开不了,所以"bwrap 到底把什么挡了/放了"这件事**只能在远程 Linux 调**,本机绿了不代表 prod 绿——违背你们 `verify-before-deliver` 铁律。

**B —— 招牌能力本机零可开发性 + 分布式生命周期地狱 + 动最危险的文件。**
gVisor 注册不进 Docker Desktop 的 LinuxKit,worker 路径 Mac 上要么 runc 裸跑(无隔离、只验功能)要么直接不可用。等于"跑用户脚本"这个核心卖点**在开发者本机无法迭代/断点**,只能远程 Linux,开发反馈环极长。运行期是 orchestrator + docker-socket-proxy + worker + 共享 executor 四家的分布式 lease/reseed/WS 流,worker `--stop` 即销毁,复现一个 bug 要在 reaper 杀它之前截住它 + 把日志外运。加上 B2 必须把 `registry.ts` 的 Bash/文件工具改成"可远程执行"——这是所有 feature 共用的工具运行时核心,`WORKER_MODE` 分支稍有污染就波及 claw/prism 现有能力。本机开发体验、prod 可观测性、回归风险三项全垫底。

**C —— 它赢在"把难题划出去",不是"解决了难题"。**
档-2(真跑脚本)C 一样开不了本机、一样要 bwrap/gVisor,C 只是用 `moderation_status` 把它锁死在二期。所以**当你真需要档-2 时,C 继承的正是 A 或 B 的全部 dev-ergo 痛**,它没有解,只是诚实地推迟。次要痛点:trust-tier + `enabled_skills_snapshot` 会话级冻结带来状态一致性调试面("我明明启用了新 skill,为什么老会话没有?"是个会反复来的支持工单/bug 源)。

## 冷启动 / 成本 / 可调试 / 回滚横比

- **冷启动**:A、C(档-1)≈ 现状(物化几个文件,同 library-reference,~ms);B 每会话 0.5–2s 或维护热池。B 独输。
- **成本/容量**:A、C 单容器不变;B 引入热池(空 worker 也常驻烧内存)+ 全新容量规划维度。B 独输。
- **可调试**:A、C 单容器 `docker logs scholar_agent` + 磁盘上可 `cat` 的物化 skill 文件;B 多服务 + ephemeral,最差。
- **回滚**:A = 翻 `SANDBOX_MODE` 一个旋钮(最干净);C = 按 tier 关(可关整个市场 / 只关档-2,最细粒度);B = 靠 `EndpointResolver` 全量路由回共享 executor 的 flag(可行但要确保 orchestrator/路由代码能空转)。A 最简,C 最细,B 尚可但最重。
- **对现有 4 feature 干扰**:C 最小(T0 一方 skill 走原路不动,只有 claw 加 `AddDirsProvider`,其余三 feature 不碰,除非共享的 `loader.ts` 改错)→ A(容器级 flip,四 feature 同时受影响)→ B(动 `registry.ts` 工具运行时,热路径回归面最大)。

## 最该采纳:C 的第 0/1 期做主干,借 A 的旋钮,B 留作远期且晚接

- **主干 = C 的档-1 路线**:trust-tier 路由(`buildCreateOptions` 单点收口 + 修浅拷贝 slice 别名 bug)+ guides-only + `disallowedTools` 关 Bash + per-session 物化。理由纯 dev-ergo:**它是三个提案里唯一让 MVP 在 Mac 上端到端可开发、可调试、可验收的**,且改动是加法、限于 claw、不惊动另外三个 feature。市场能先上线,不被"Mac 开不了沙箱"这道墙卡住整个项目。
- **从 A 借**:`SANDBOX_MODE` 单旋钮 + Mac 上"只注入 `source='self'` skill"的优雅降级——这是最干净的"一个开关回滚 + 本机永远单租户不裸跑他人内容"的运维姿态,C 的档-2 落地时应直接套用,而不是自己再发明降级逻辑。
- **对 B 的处置**:B2(断网、零密钥、per-session ephemeral worker)在**安全上**是对的最终形态,但**dev-ergo 上它是最贵、最难调、Mac 最不可开发的一条**。正确做法是让 C 的 moderation gate 把它挡在门外,等档-2 真有产品需求、且你愿意接受"这条路只能远程 Linux 开发"的代价时再接——**绝不能让它成为 MVP 的前置依赖**,否则整个市场从第一天起就绑死在一个本机跑不起来的编排层上。

**一句话对抗性结论**:B 从开发体验看是自残——为了 10% 带脚本 skill 的隔离,把 100% 的市场功能(含纯文本 MVP)绑到一个 Mac 上根本起不来、prod 上四服务分布式难调的架构上。A 体验不错但"容器级一刀切 + 本机不可复现隔离"让它只配当过渡。C 唯一想清楚了"哪些能在本机开发、哪些不能",把不能的那部分诚实地隔离到二期——这不是和稀泥,是唯一让团队能持续迭代的划法。它的代价要认:难题没解、只是推迟,且 tier/快照一致性会长期产生调试噪音。