# Research Run:科研内核架构方案(2026-08)

> 状态:**待开工**。四份独立提案 + 三位评委评审的综合裁决稿。
> 骨架取自「Research Run」提案(三位评委一致胜出:7.7 / 7.55 / 7.6),
> 强制融合「证据基座」的地基层、「研究图」的算术缺口分析与 MCP 闸、「科研内核」的机械防线与装配层收口。
> 所有代码行号均已在 2026-08-01 实测复核;**与约束材料不符的三处已在 §9.1 单列**。

---

## 一、三句话

**改成什么。**
把「一条用户请求 = 一条 turn」这个建模等式拆开:一条科研请求升格为一个持久 **Run**,Run = 一串 **Step**,每个 Step 就是一次**更短的普通 runTurn**(`maxRounds` 6~8)。Step 之间的交接靠 MySQL 上的 step 行(`agent_saga_steps`,已建表零消费)+ 会话 workDir 里的 `run/` 产物,不靠内存 messages。同时把 `evidence/` 与 `run/` 变成**引擎独占的只读子树**,并把证据粒度从题录级下到段落级。

**为什么这样改。**
科研任务的真实死法不是「一轮之内不够并行」,是 `MAX_TOOL_ROUNDS=24`(turnLoop.ts:36)、`TurnTimeout=15min`、`IDLE_TTL=30min` —— 那是**跨轮**的墙,任何 turn 内的 stage 链 / fan-out / span 提取都碰不到它。而 round_cap 不是一个可以调大的旋钮,它是「一次性内存事务」这个建模错误的症状:调到 100 只会让一条 turn 攥住 2 个并发槽之一直到 15 分钟上限,把 7/29 那次头阻塞事故放大四倍。Run 化是唯一**降低**峰值槽压的路径:同样的总工作量,持槽从「一段 15 分钟不可抢占」变成「一串 3 分钟可抢占片段」。

**第一步做什么。**
Phase 0(约 3 天,零 Run 概念、可独立回滚):把 `evidence/` / `run/` 做成真的不可伪造(**canonical 祖先判定**,不是词法首段判定;**`--ro-bind`** 而非 `-try`;真实 jail 内 boot 自检),把今天零生产调用点的 `markRead`(ledger.ts:447)接到 Read/ReadDocument 上,`has_fulltext` 从入账恒 false 改为 `read_marks` 派生。**这不是可选前置** —— Run 的 step 完成判据要读它,分母是空集就会静默无限重排队烧钱。

---

## 二、目标架构

### 2.1 控制流:今天 vs 之后

**今天(唯一形态,一字不改地保留)**

```
浏览器 WS ──user_message──▶ hub.go(inFlight/配额/BeginTurn/stampBudget)
                                │
                                ▼ agent WS
                    ws.ts:369  tryAcquireTurn()   ← 全容器 2 槽,只闸这一帧
                                │
                       runTurn()  for(round=0;;round++)
                                │  round>=24 → sendError("round_cap")  ← turnLoop.ts:428
                                │  内存 messages[],崩了全丢
                                ▼
                       finally  release()
```

**之后(新增第二形态;第一形态零回归)**

```
┌──────────────────────────────────────────────────────────────────┐
│ backend/internal/agentrun   ★新增(内核唯一编排引擎)               │
│                                                                  │
│  Run(agent_runs) status: planning|running|awaiting_user|done|failed│
│        │                                                          │
│        ▼  RunTemplate(纯 JSON,来自 FeatureSpec)                   │
│   N 个 Step 行 → agent_saga_steps(0048,已建表零消费)              │
│        │                                                          │
│        ▼  Scheduler(engine.go)                                    │
│   ① Run 级 admission:全局活跃 Run ≤1(env 可调 2)、per-user ≤1     │
│   ② 让路:GET /api/admission 读 {inUse,max};inUse ≥ max-1 → 不认领 │
│      + Bridge.SessionBusy(hub.go:355)避开该会话自己的实时轮        │
│   ③ 原子认领:UPDATE…WHERE status='pending' AND lease_until<NOW()  │
│      判 RowsAffected==1(MySQL 无 RETURNING;手法写在 0048 注释里)  │
│   ④ Step 完成判据 = CoverageReport(引擎算术,§4.2)不是模型自报     │
└────────┬─────────────────────────────────────────────────────────┘
         ▼
  f.ServerSideChatStreaming(ws_serverside.go)  ← 已存在,peerreview 在生产用
         │  照常去 ws.ts:369 抢同一批槽;抢不到 = 不认领,step 留 pending
         ▼
  runTurn()   ★同一个函数,不新建执行路径★
    maxRounds = input.maxRounds ?? MAX_TOOL_ROUNDS   ← turnLoop.ts:428 单点
    轮尽 → 不再是 error,是 code="step_incomplete"(分页信号)
         │
         ├─▶ 产物  <workDir>/run/steps/<key>.md      引擎写,模型只读
         ├─▶ 证据  <workDir>/evidence/{ledger,queries,passages}.jsonl  引擎独占
         └─▶ step 行 status=done, turn_id=<真 turn>, output_ref={path,chars,evidence_ids}
```

### 2.2 三层状态,权威边界写死

| 层 | 存哪 | 权威于 | 谁读 |
|---|---|---|---|
| Run/Step 元数据 | MySQL `agent_runs`(新)+ `agent_saga_steps`(0048 已有) | 哪一步做完了 / 谁在跑 / attempt / lease | Run 引擎 |
| Step 产物 · 研究状态 | workDir 的 `run/PLAN.md` · `run/steps/<key>.md` | 那一步**做出了什么** | 模型(Read)+ 引擎 |
| 证据 | workDir 的 `evidence/*.jsonl`(含新增 `passages.jsonl`) | 本会话**真的检索到/读过**什么 | 模型(EvidenceGet)+ 引擎 |
| 对话 transcript | 既有 journal `agent_turns` / `agent_turn_events` | 用户**看到了**什么 | 前端回放 |

四层唯一的交点是 `agent_saga_steps.turn_id` —— **0048 里已经有这一列**,把 step 精确钉到一条真 turn 上,于是计费 / 回放 / admin 会话监控全部自动对齐,不需要新账。

产物落 workDir 而非 DB 的理由是**模型视野**:workDir 是模型能 `Read` 的天然位置,放 DB 就得再造一条注入通道。`output_ref` 只存 `{path, chars, evidence_ids}`,正文永远在 workDir —— 这条要在 `repo.go` 里写死约定并加长度断言,否则一定有人图省事把整篇中间稿塞进 JSON 列。

### 2.3 模块清单

**新增(backend)`internal/agentrun/`**

| 文件 | 职责 |
|---|---|
| `model.go` | `AgentRun`(id/user_id/feature_key/agent_session_id/template/status/…) |
| `repo.go` | 骑既有 `agentbridge.SagaStepRow`;`ClaimStep`/`CompleteStep`/`FailStep`/`ReconcileLeases` |
| `engine.go` | 串行 Step 执行器 + Run 级 admission + 让路;调 `f.ServerSideChatStreaming` |
| `template.go` | `RunTemplate{Key, Steps []StepDef{Key,Brief,MaxRounds,ExitCriteria}}`,**纯 JSON** |
| `coverage.go` | 引擎算术覆盖件(§4.2)—— Step 完成判据 + 模型可查工具的共同实现 |
| `handler.go` | 4 个薄路由:创建 / 查询 / 改计划 / 取消 |

迁移 `0101_agent_runs_fields.sql` + `0102_agent_runs_indexes.sql`。**`agent_saga_steps` 一列都不加**,`0034` 那份写死 feature 名单的生成列**一个字不碰**(它是 0.0.66 发布事故的现场)。

**改造(backend,小切口)**
- `agentbridge/spec.go` — `FeatureSpec` 加 `RunTemplates []agentrun.RunTemplate`
- `agentbridge/ws.go:1041` `stampBudget` 旁加 `stampRun`(必须在 `stripInjectionSurface` **之后** —— 唯一合法盖章点)
- `agentbridge/bridge.go:372` `StartJournalReaper` 同款:`StartRunReconciler`
- `agentbridge/hooks.go` — 新增 `StandardQuota(featureKey)`,收掉 5 份逐字重复的配额/预算/用量闭包(≈ −280 行)
- `cmd/server/routes_user.go` — 64 条手抄路由塌进 `MountSessionRoutes`/`MountMultiSessionRoutes`(http_handler.go:127/307,**今天全仓只有 smartsearch/handler.go:66 引用一处**,是又一处「造好没接线」)

**改造(agent,合计约 40 行 + 地基层)**
- `turn/types.ts` — `TurnInput` 加 `maxRounds?` / `stepBrief?`
- `turn/turnLoop.ts:428` — `round >= (input.maxRounds ?? MAX_TOOL_ROUNDS)`;`maxRounds` 在场时发 `step_incomplete` 而非 `round_cap`
- `server/ws.ts:466` — TurnInput 组装处透传
- `server/http.ts` — `GET /api/admission`(**`turnSlotsInUse()` / `maxTurnSlots()` 已经导出**,只缺端点)
- 地基层:`sandbox/confine.ts` · `sandbox/bwrap.ts` · `evidence/passages.ts`(新) · `evidence/parse.ts` · `evidence/ledger.ts` · `tools/registry.ts` · `mcp/minicodClient.ts`

**新增(前端)**
- `shared/components/chat/RunProgressCard.tsx` — 与 `ResearchStateChip` 同「带外声明」范式:数据只能来自 `run_state` 帧,无帧不渲染
- `shared/lib/` 单点实现 `run_state` / `citation_audit` 解析 —— **本仓库 fold 有四份、单边修复等于没修**

---

## 三、「claw 内核 + 聚焦剖面」怎么落地

### 3.1 先承认既成事实:内核化在三层已经完成,只缺编排层

- 执行器**完全 feature-blind**:`agent/src/` 搜 `featureKey` 的 6 处命中全在注释里,零逻辑分支;`policy/researchTurn.ts:66` 明写「执行器无状态、后端从不下发 feature 名」,Router 判据刻意改用「本轮实际发给模型的工具名」。作者早已把「feature 是什么」重述成「能力面是什么」。
- 六个剖面的差异只剩三条轴:**能力面**(4 个字符串数组)、**手艺面**(1 个 prompt + 1 个 `AddDirs`)、**交付面**(1 个模板名 + 3 个可选回调)。全是「喂什么数据」,没有一条是行为分支。

**唯一没兑现的是编排层**:全仓唯一的多步编排(`methodology → alpha/beta/gamma → chief`)硬编码在 `peerreview/service.go` 的 Go 控制流里。它同时是老板框架里最像「剖面」的那个,却是代码上最不像的那个。

### 3.2 落地形态:一份引擎 + 六张声明式模板

```
claw         → 空模板(= 今天的行为,零回归) + deep_research 模板(retrieve→screen→extract*→synthesize)
peerreview   → {methodology, alpha, beta, gamma, chief}   ← 就是它今天硬编码的那个
prism        → {outline, section*, assemble}
smart_search → {retrieve, screen, synthesize}
boltslides / sci_draw → 空模板
```

`RunTemplate` 与 `AllowBash` / `DisallowedTools` / `AddDirs` 是**同一种东西**。

### 3.3 「内核变强 → 剖面自动变强」由什么**结构**保证(三条,缺一不可)

**① 单一执行路径。** `runTurn` 仍然只有一个,Step 就是一次普通 turn。turnLoop 里为 Run 新增的分支**只有一个**:`round >= (input.maxRounds ?? MAX_TOOL_ROUNDS)`。没有 per-feature 的入口可写。

**② 模板必须是纯 JSON —— 这是物理约束,不是约定。**(取自「科研内核」提案,评委 3 称其为「全部四份提案里最值钱的单个机制」)
`RunTemplate` 要 `json.Marshal` 后随 turn 帧过 WS 到另一个进程。**函数过不了 JSON。** 配四条机械测试:

| 测试 | 断言 | 挡住什么 |
|---|---|---|
| JSON 恒等 | `deepEqual(unmarshal(marshal(t)), t)`,六个模板逐个跑 | 有人往模板挂 `Validate func` / `OnStepDone func` |
| 内核无 feature 字面量 | 扫 `internal/agentrun/**`,禁出现 `"claw"`/`"prism"`/… | `if featureKey == "peerreview"` 的退化 |
| 无死旋钮 | 模板每个字段至少被引擎某处读 | 本仓库最高频失效:**加了旋钮忘接线** |
| 无孤儿模板 | 声明了必须被某个剖面引用 | 死代码堆积 |

「无死旋钮」这条尤其对症:`has_fulltext` 就是活体样本 —— 写下去恒 false(ledger.ts:253),`render.ts:39` 的「有全文未读」因此是一句**永远不会出现的话**,而没有一条测试变红。

**③ 能力轴 default-on / 风险轴 default-deny 的不对称成本梯度。**
Phase 1 的模板是 opt-in(零值 = 不支持 Run),这是为了零回归。但**从 Phase 3 起必须翻过来**:内核新增的编排能力(新 Step 类型、新退出判据、新压缩策略)在默认模板里对所有剖面生效,要**关掉**才需要动 `spec.go`;工具面 / 权限保持今天的 default-deny 不动。

于是:**想只让一个剖面变强,你得先让六个都变强,然后显式关掉五个。** 这个不对称梯度就是「自动变强」的结构保证 —— 也正是「编排改进要做六遍、已多次因此漏接线」这个根因的机械封堵。

### 3.4 三条铁律(照守,不谈判)

1. **`feature_key` 一个字符都不改。** `agent_runs.feature_key` 与 `agent_saga_steps.feature_key` 都存**剖面名**;`saga_id` 用 0048 注释里已写好的命名空间约定 `<feature>:<runID>`(原文举例就是 `peerreview:<submissionID>`)。内核是代码层概念,剖面名是数据层身份,两者不通婚。
2. **skill 不合并。** `loader.ts:15 TOTAL_CAP=40000` / `:59 MENU_CAP_CHARS=2500`,触帽是**静默丢弃**。本提案一行不碰 `AddDirs`。(反面教材已在仓库里:`docker-compose.yml` 里那条 reviewer-skills 挂载的删除注释写着「132KB / 33 份 SKILL.md 远超 TOTAL_CAP,补一行 AddDirs 就会静默丢掉排序在后的全部 6 个横切质量维度,日志只有一条 warn」。)
3. **不新增模型可见的派发工具。** `registry.ts` 里没有 `Task`/`Agent`,本提案也不加。Run 的调度在 backend,**模型永远不知道自己在一个 Run 里** —— 它只知道「这一步的目标是 X,你有 8 轮」。

---

## 四、编排能力:哪些是**引擎执行**的

前提再强调一次:主力 deepseek-v4 对 `tool_choice` **HTTP 200 静默无视**(docs/tool-choice-probe-2026-08.md)。所以下面每一条都不依赖模型配合,也不依赖任何 provider 能力。

### 4.1 Step 状态机(引擎全权)

- **分页而非终结**:`round_cap` 在 Run 语境里从终结错误改成 `step_incomplete` 分页信号。引擎把同一 step 排下一 attempt,并把「上次做到哪」作为 `stepBrief` 带回去 —— 工作量守恒,用户看到进度条往前走。这是全场性价比最高的一处改动(turnLoop 两行)。
- **原子认领 + 租约**:`UPDATE … WHERE status='pending' AND lease_until<NOW()`,判 `RowsAffected==1`。手法在 0048 注释里已写死。
- **重试是真计费,但有硬止损**:重试用**新** `clientTurnId`(`run:<runID>:<stepKey>:<attempt>`)。这一条极其容易做错 —— 复用同一个 id 会被 `BeginTurn` 的 `(sid, clientTurnId)` 幂等当成浏览器重发直接丢弃,step 永远推进不了,**一个看起来很对的幂等设计会造成静默死锁**。attempt 上限硬设 **2**,第二次失败立刻转 `awaiting_user` 给「重试 / 跳过 / 结束」三选一,**绝不静默连烧**。
- **用户干预复用既有设施**:某 Step 以 `AskUserQuestion` 的 wind-down 结束 → Run 转 `awaiting_user`、停止认领。零新协议,也不会有 Step 攥着槽等人类(阻塞式确认正是 ask-mode 调研当初判死的形态)。

### 4.2 CoverageReport:一个引擎算术件,两个消费者

这是评委一致要求的合并项 —— 「研究图」的 `gap.ts` 与「证据基座」的 `EvidenceCoverage` **是同一个洞见的两个角度,分开做必然长成两份**。

**实现一份**(`internal/agentrun/coverage.go` + agent 侧只读工具共用同一套判据),**零 LLM、纯算术**,判据全部来自已有数据:

| 判据 | 数据源 | 回答 |
|---|---|---|
| 子问题命中题录数 | `ledger.jsonl` 词重叠(复用 `sanitizeMinicod` 归一) | 有没有 |
| 其中带 passage / read_mark 的条数 | `passages.jsonl` + `read_marks` | **接地了没有** |
| `total_upstream ≫ delivered` | `queries.jsonl` | 欠采样(今天这个分母只进 digest 一行,从没被真正用来算覆盖率) |
| 某分面零 `new_ids` | `queries.jsonl` | 该分面无覆盖 |
| 结论里 `evidence_ids` 为空 | Step 产物 | 无证据支撑的断言 |
| 年份 / 来源分布偏斜 | `ledger.jsonl` | 检索偏倚 |

**两个消费者、两种口径**:
- **引擎侧(Step 迁移判据)**:`StepDef.ExitCriteria` 是一组阈值(如 `min_grounded_per_subq: 3`)。达标 → 进下一 Step;不达标且 attempt 未尽 → 重排队。这就补上了「step 到底做完没有」这一格 —— 否则只能靠模型自报,而那正是会腐烂的 status 字段。
- **模型侧(只读工具)**:回答「我还缺什么」。**只报事实不下判决** —— 说「0 匹配」,不说「未覆盖」。判词留给模型,否则词表不匹配时会触发无谓重搜、反而多烧轮。

**声明与状态物理分开**:模型可以用 `op:"subq"` 行往同一本账里追加子问题(`loadLedger` 对未知 op 天然忽略 → 零迁移),但**覆盖状态永远由引擎算,模型写不进去**。模型只能给自己加义务,不能宣布完成。经典 Plan 对象把两者放在同一个可写结构里,`status` 正是会被伪造或变陈旧的那一格。

### 4.3 模板是我们写死的领域知识,不由 planner LLM 生成

peerreview 的四阶段跑了半年没变过 —— 它是**产品知识**,不是运行时发现的图。动态 planner 意味着多一次 LLM 调用、多一层可幻觉的中间表示(模型编一个不存在的阶段,引擎照跑),而收益只在「流程真的因请求而异」时存在;科研流水线(检索→筛选→提取→综合)恰恰是最稳定的那一类。

### 4.4 明确**不做**的编排

**turn 内 fan-out / 子调查 / Probe。** 三位评委一致否决,理由收敛成三条:① 它解决的不是主要死因(卡的是跨轮,不是一轮内不够并行);② 它要正面穿过全部五道硬约束(2 槽、MCP 单例 stdio + 全局熔断、`pids:512` + bwrap 僵尸泄漏、上游零节流、三个未测未知数),四件运维事全做完才有第一行功能代码;③ 最根本 —— **在接地率还有缺口时并行,是把自信的编造乘以 N**,而子调查摘要构成一层用户看不见的中间产物,提出方自己承认「这条没有机械防线」。

重启条件写在 §8.5。

---

## 五、证据基座:三大缺口在这里被根治

### 5.1 缺口 1 · 账本可被模型伪造 —— **Phase 0 前置,且三份提案的修法都是错的**

**已复验属实**:`evidence/` 落在可写的 workDir 内,`confine.ts` 无保留路径概念,`bwrap.ts:104` 的 `--bind profile.cwd /work` 让 jail 内完全可写。claw / prism / boltslides / sci_draw 一条 `Write` 就能铸造 E 编号。

**🔴 但四份提案里有三份的修法会静默失效。** 我逐行核了 `agent/src/sandbox/confine.ts:43-70`:

```
const abs = isAbsolute(target) ? resolve(target) : resolve(canonRoot, target);  // ← 词法 resolve
if (!within(canonRoot, abs)) throw …                                           // 词法预检
let cur = abs; for(;;) { const rp = await realpathOrNull(cur); … }             // realpath 只喂 within,结果被丢弃
if (forWrite) { const st = await lstat(abs)…; if (st && st.isSymbolicLink()) throw … }  // 末段不存在则 st=null,不拒
return abs;                                                                     // ← 返回的仍是词法结果
```

攻击链(全程合法):Bash 在 jail 内 `ln -s evidence x` → 进程内的 `Write` 工具写 `x/ledger.jsonl` → `abs = <root>/x/ledger.jsonl`,**首段是 `x` 不是 `evidence`** → 祖先 realpath 到 `<root>/evidence`、`within` 通过 → 末段不存在,`lstat` 无感 → **穿透写入账本**。而 bwrap 的 ro-bind 只管 jail 内,管不到执行器进程内的 `Write`。

> 附带发现:`registry.ts:493` 现存一句「confinePath 返回的已 canonicalize(realpath,解符号链接)」的**错误注释**。下一个人照着注释写必踩。这条注释要一并改掉。

**正确修法(三条,缺一不成立):**

① `confine.ts` —— reserved 判定必须打在 **canonical 祖先**上:把祖先 realpath 的结果**留下来**参与判定,祖先命中 `evidence` / `run` 即拒;末段 symlink 由已有的 `forWrite` lstat 分支兜。
```ts
const RESERVED_WRITE_SUBTREES = new Set(["evidence", "run"]);   // 单一真源
// …祖先循环里拿到 rp 后:把 abs 折算成 canonical 形式再取首段判定
```
一处改动同时覆盖**七个入口**(全部已走 `confinePath`):`registry.ts:178 Write` · `:203 Edit` · `:698 ExportDocument` · `:833 BuildDeck` · `workspace.ts:223/230/249`(prism 文件 CRUD + 上传)。这正是「deny 必须放 `confinePath` 而不是放 Write 工具里」的理由 —— 放工具里就漏掉后三个。

② `bwrap.ts` —— 用 **`--ro-bind`(非 `--ro-bind-try`)** 遮蔽,并在 profile 构造处 `mkdirSync` 保证目录存在,mkdir 失败 → bwrap 起不来 → Bash 调用失败(**fail-closed**,与 `unsandboxedBashGate` 同姿态)。
> **为什么 `-try` 是洞**:`evidence/` 由 `ledger.ts:265` 在**首次 ingest 时才懒 mkdir**。新会话开局这个目录根本不存在 → `-try` 静默跳过 → 模型在 jail 里先 `mkdir` 再写就完全绕过,而两侧都会显示「已修复」。claw / prism / sci_draw 三个 `AllowBash` 剖面全部裸奔。
> 位置上没问题:`bwrap.ts` 的 `--bind profile.cwd /work` 之后还有一个 `roBinds` 循环,追加在那里即可(bwrap 按参数顺序施加,后者覆盖前者子路径)。

③ **双重护栏**:
- `buildBwrapArgv()` 输出的 **argv 字符串断言**(ro-bind 项存在,且排在 rw bind 之后)—— 这是唯一能在纯 `./agent` 构建 context 里也真跑的口径(跨包镜像那族规则在 Docker 里整族 skip,本仓库被「一条永远绿的规则」坑过)。
- boot 自检在**真实 jail 内** `touch /work/evidence/x` 并断言失败。这是 `smokeTestSciDrawDeps` 那次事故的同款教训:**裸 `docker exec` 全绿、真 jail 全挂**。

**诚实标注**:`EXECUTOR_SANDBOX_MODE=none` 下 Bash 裸跑仍能写 `evidence/`。生产是 bwrap(W0 已上线),但这条必须写进文档 —— 不能让下一个人以为「E 编号已绝对不可铸造」。

### 5.2 缺口 3 · 账本只到摘要级 —— **Phase 0/1,且它是 Run 的功能性依赖**

**已复验属实,而且比材料描述的更糟**:
- `ledger.ts:253` `has_fulltext: false` 硬写;
- `markRead`(ledger.ts:447)**全仓零生产调用点** —— 只有 `ledger.test.ts` 引用。函数头自述「P0 无调用点;保留是为了让 P1 的 Read/ReadDocument 接线只有一个写入口」。

⇒ **「把 `has_fulltext` 改成 `read_marks` 派生量」这个最小修法单独做是无效的:派生量的分母是空集,改完仍恒 false。** 而 Run 的 step 完成判据里有「本步已通读 N 篇」—— 不接这根线,Run 引擎上线即**静默无限重排队**,烧钱且永不完成。所以证据基座的 P1 不是加分项,是 Phase 0/1 的组成部分。

**三步补齐:**
1. **span 提取**:`parse.ts` 新增 `parsePassagesFromToolResult` —— `snippets` 信封里的 `text`/`section` 抽出来绑到 `evidenceKey`。这批数据**今天已经在返回、已被 `sanitizeMinicod` cap 过、然后被丢掉**,零新增上游调用,是全场性价比最高的一格。
2. **落 `passages.jsonl`**(独立文件、追加式、复用 ledger 的 `withLock`、按 eid 懒读)。**刻意不内联进 `EvidenceRecord`**:`ledger.jsonl` 每次 ingest 都要全量读做 id 分配,行宽膨胀会让每次检索线性变贵;digest 也有 `DIGEST_MAX_CHARS=6000` 帽,段落进去必爆。
3. **接线**:`registry.ts` 的 `Read`/`ReadDocument` 成功后反查 eid → `markRead` + 置 `has_fulltext`/`fulltext_path` + 存首段。`EvidenceGet` 加 `fields="passages"` 与 `q`。

于是 `render.ts:39` 的三档(「已读全文 / 有全文未读 / 仅题录」)**第一次真的有三档**,`CoverageReport` 也第一次能区分「检索到」与「读过原文」—— 账本注释里那句「这正是 31 条效应量凭空出现的那条缝」说的就是这个。

**eid 反查必须保守**:绑错比不绑更糟(会给一条题录挂上别人的全文段落,而这条基座恰恰是要消灭这类错误)。策略:只信 `references/paper-<id>.md` 这条强绑定,basename 匹配只在无歧义时生效,**匹配不上就静默跳过**。

### 5.3 缺口 2 · 对话路径零引用校验 —— **裁决:句柄硬校验 + DOI 带外标注,不做硬拒**

**已复验属实,而且比材料描述的更广**:`resolveFileForDelivery` 只有 3 个调用点(`artifacts.ts:301` / `registry.ts:686` / `:857`),全是文件交付;而 `resolveTextForDelivery`(deliver.ts:28,**文本侧闸,今天零生产调用点** —— 只有 `citations.test.ts` 引用)本来就是为对话正文准备的,只是没人接。这是又一处「引擎造好没接线」。

**🔴 必须更正 Run 提案的一处论断**:它声称「每步产物落盘前过一次 `resolveTextForDelivery` ⇒ 最该被校验的部分全部进入引用校验面」。**不成立** —— 该函数只处理 `[[E]]` 句柄(不含 `[[` 时甚至连账本都不读,直接返回),**裸 DOI、纯文本参考文献、编造的作者-年份引用全部原样通过**。Run 恰恰把这类产出放大了 N 倍。

**评委分歧**(评委 1 支持「研究图」的 SubmitAnswer 硬拒;评委 2、3 明确否决)。**裁决:按一条干净的所有权分界拆开,不按「拒不拒」拆。**

| 对象 | 归属 | 处理 | 理由 |
|---|---|---|---|
| `[[E7]]` 句柄 | **引擎命名空间** | 指向不存在的 E 编号 → `is_error` + 给出精确差额(有效区间 E1–En),模型可自愈 | 句柄是引擎发的,引擎有权判定;与既有交付闸同范式(算术、给差额不给「请检索」) |
| 裸 DOI / 文本引用 | **外部世界** | **绝不拒绝**。发带外 `citation_audit` 帧,前端渲灰 chip「该引用未经平台检索核验」 | 用户自己粘的 DOI、`library_ref` 物化进来的文献、跨会话带入的引用,合法但天然不在本会话账本里 |

**为什么不做 DOI 硬拒**:它与 `verifyClaims` 被降级的失效形态同构 —— 冷重播 / shadowTurn 之后账本还在但模型手上没有工具证据,**真引用会被判成未验证,而模型最省力的服从方式是删掉真引用**(净负值)。turnLoop 里那段长注释已用三条实测理由(609 轮只触发 8 次、判据集合与故障形态不相交、冷重播净负)把这条路关掉了,不该以「这次是确定性算术」为由重开成硬失败面 —— 尤其它会落在 smart_search **唯一**的产物形态上。

**同理不复活 `verifyClaims` 的纠偏注入。** 带外帧的关键性质:**结果只进用户视野,不进模型视野** —— 结构上不可能诱导模型删真引用。

**上线节奏**:`citation_audit` 先跑 **observe 模式两周**(只落 journal 不发帧),用 SQL 看假阳性率,再开 chip。灰 chip 打错位置会让用户不信任真实引用,比不打更糟。

**Run 产物的实际覆盖**:`run/steps/<key>.md` 落盘前过 `resolveTextForDelivery`(句柄展开 + `onMissing:"mark"`)+ `citation_audit` 扫描。诚实边界:**SubmitAnswer 正文与自由文本块的 DOI 仍只有带外标注,没有硬闸** —— 这是刻意的,不是遗漏。

---

## 六、并发与资源:2 槽约束的最终答案

### 6.1 结论:**不提内存、不改 `EXECUTOR_MAX_CONCURRENT_TURNS`。本方案对槽压是净减压。**

三位评委一致。理由:

**① 并发度恒为 1,不是「控制得住」而是「不存在」。** Run 的 Step **严格串行**:同一时刻一个 Run 最多在跑 1 个 Step = 1 条 turn = 1 个槽,与今天一个普通用户轮完全等价。全程零 fan-out、零子 LLM 流、零新子进程。

**② 刻意不利用 admission 的盲区。** `tryAcquireTurn()` 闸的是「一条 WS 上行 `user_message` 帧」,turn 内部开几条流它一概看不见(先例:`compact.ts:376` 的 `compactMessages`)。利用这个洞就必须回答 MCP 单例熔断与 pid 泄漏 —— 那两条答不好,所以不利用。

**③ 峰值槽占用往下压。** 今天一条 24 轮的科研 turn 可以攥住 2 槽之一直到 `TurnTimeout` 15 分钟;`docs/prod-audit-2026-07-31.md:77-78` 记的 7/29 事故就是这个形态(满槽 4 分钟、7 轮瞬时拒绝、一位付费用户重试 6 次后流失)。Step 化后每 Step `maxRounds=6~8`、软超时 ~3 分钟,**槽在 Step 之间释放**。同样的总工作量,持槽从「一段 15 分钟不可抢占」变成「一串 3 分钟可抢占片段」,交互用户的最坏排队延迟降一个量级。

**④ busy 从「用户丢工作」变成「排队延迟」。** 今天满槽 → `ws.go:858` 映射 `overloaded` → 用户手动重发(`agentbridge` 里 grep 不到任何 queue/semaphore)。Run 的 Step **认领失败不是错误,是不认领** —— step 留 `pending`,reconciler 退避重试,用户看到「排队中 · 第 3/7 步」。这是本方案最被低估的收益:**一次性把 2 槽从「用户可见的故障源」变成「用户可见的进度条」**。

**⑤ Run 级 admission 建在 backend,且是让路型。** 建在 backend 而非 `admission.ts`,因为 `ServerSideChat` 会去抢**同一批已经不够的槽**,在 agent 侧加第二个闸只会自锁。参数:全局活跃 Run ≤ **1**(env 可调 2,对齐 peerreview 既有的 `resumeConcurrency=2`)、per-user ≤ **1**;认领前查 `GET /api/admission`,`inUse ≥ max-1` 时**不认领**,把最后一个槽让给交互用户。

**⑥ 唯一新增消耗**:Step 之间释放槽 → 重新抢槽 → 上游 prompt 前缀缓存可能 miss 一次,一个 7 步 Run 最多多付 6 次 cache-miss 的 input 成本。Phase 4 的 Step 边界语义压缩会把 prompt 变短,大致抵消;而这笔钱买的是「崩了不用从头再来」,对几十轮的任务是压倒性划算。

### 6.2 但有三件运维事必须同批做(它们独立于本方案就该做)

| 项 | 改什么 | 为什么本方案躲不开 |
|---|---|---|
| **`init: true`** | 两份 compose 的 agent 服务各一行 | dev 实测 82 个僵尸、单会话 4 分钟漏 78 个 pid、PPID=1 永不 reap;prod `pids:512` ⇒ ~6 个重 Bash 会话打满且只能重启复位。一个 7 步 Run 的 Bash 累计调用次数远超一条普通轮 |
| **MCP inflight 闸** | `minicodClient.ts` 加 `MINICOD_MCP_MAX_INFLIGHT`(默认 4,**排队不拒绝**),并把「排队等待」与「传输失败」在熔断计数上分开 | 模块级单例 stdio + **模块级全局熔断**(`consecutiveFailures>=3` → 全站所有租户检索快速失败 30s)+ `runTools.ts:37` 无上限的 `Promise.all` 批 = 今天就存在的共享命运单点。Run 把检索集中到少数 Step,压强更高 |
| **backend 有界 FIFO** | `agentbridge` 收到 busy 后排队 ≤1 位、≤20s,超时才回 `overloaded` | Run 的 busy 已经变成「排队中」,但**交互轮**仍走即刻 `overloaded`。这是 7/29 那次用户流失的直接对症,几十行 |

### 6.3 扩容:不是前置条件,是「成功之后的问题」

如果 Run 很受欢迎、并发 Run 上到 2,下一个绑定约束是 **`cpus: 2.0`**(SSE 解析 + `ToolUseAssembler` + `FieldStreamer` 都在主线程 JS),**不是内存**。届时提 `cpus`,而且必须同批:先测宿主 `free -g`(仓库零记录)、测生产僵尸 pid 现值、测 MCP 单例 stdio 吞吐上限。**只加内存是白花钱。**

---

## 七、实施阶段表

> 每个阶段**独立交付、独立回滚**。不接受「全做完才有价值」。
> 🔴 **Phase 0 之前的零号动作**:当前分支领先 main 24 个 commit 且全部未提交,线上跑的是旧代码。
> **必须先把这个发布断层清掉** —— 否则 Phase 1 的「行为对齐现状」根本没有可对拍的现状,所有验收数据失真。

### Phase 0 · 地基硬化(零 Run 概念)

| | |
|---|---|
| **目标** | 账本第一次真的不可伪造;`has_fulltext` 第一次有真值 |
| **改动** | `sandbox/confine.ts`(canonical 祖先 reserved 判定 + 改掉 `registry.ts:493` 的错误注释)· `sandbox/bwrap.ts`(`--ro-bind` + mkdirSync fail-closed)· 新增 `sandbox/reserved.test.ts`(工具级拒写 + symlink 祖先 + argv 字符串断言)+ boot 真 jail 自检 · 新增 `evidence/passages.ts` · `evidence/parse.ts`(snippet span)· `evidence/ledger.ts`(`has_fulltext` 改派生)· `registry.ts`(Read/ReadDocument → `markRead`;`EvidenceGet` 加 `fields=passages`)· `evidence/render.ts` · `mcp/minicodClient.ts`(inflight 信号量 + 熔断计数分离)· 两份 compose 加 `init: true` · `server/http.ts` 加 `GET /api/admission` |
| **工作量** | **3 天** |
| **验收** | ① 单测:七个入口写 `evidence/**` 全 reject;`ln -s evidence x` + `Write x/ledger.jsonl` reject ② `buildBwrapArgv` argv 断言 ③ boot 自检在真 jail 内 touch 失败 ④ 跑一次真实检索 + `ReadDocument`,`render.ts` 输出「已读全文」档 ⑤ 生产打一次 `ps -eo stat \| grep -c '^Z'` 与 `free -g` |
| **回滚** | 全部由 env 急停:`EVIDENCE_RESERVED_WRITE=off` / `EVIDENCE_PASSAGES=off`;compose 一行回退 |
| **交付的价值** | 「E 编号结构上不可铸造」这个已被写进四份文件注释、被 `ws.go` 引用、被 SubmitAnswer 闸依赖的立论**第一次真的成立**;`digest` 里「已读全文」不再永远缺席 |

> ⚠️ **Phase 0 是行为破坏性变更**:今天若有会话在往 `evidence/` 写东西,升级后会开始报错并回喂给模型。上线前必须在**生产** `SESSIONS_ROOT` 下实测有多少会话踩到。已有的伪造记录不会被清理(与真记录在 jsonl 里同形),存量污染需要独立审计。

### Phase 1 · Run 引擎 + peerreview 影子归位(用户零可见变化)

| | |
|---|---|
| **目标** | 引擎跑通,并有一个**已在生产验证、有结构化输出可对拍**的第一用户 |
| **改动** | 新增 `internal/agentrun/{model,repo,engine,template,coverage,handler}.go` · 迁移 `0101/0102`(`agent_saga_steps` 不动、`0034` 生成列不动)· `spec.go` 加 `RunTemplates`(五个剖面全零值)· `bridge.go` 加 `StartRunReconciler`(照抄 `StartJournalReaper:372` 的 ticker)+ boot resume(照抄 peerreview `service.go:206` 的 30s 延迟 + 并发限流)· peerreview 四阶段以**影子模式**上引擎 |
| **工作量** | **1.5 周** |
| **验收** | ① 影子模式:引擎跑 step 状态机,产出与旧路径逐字对拍,**不切流** ② kill -9 backend,重启后从正确 step 续跑 ③ 租约过期 step 被 reconciler 重排队 ④ 四条机械测试(§3.3)全绿 ⑤ 对拍连续 7 天无差异后才摘影子 |
| **回滚** | `AGENTRUN_ENABLED=off` → peerreview 走原 Go 控制流,一行 env |
| **交付的价值** | 取证材料里标为「六者唯一真正的架构改动、代价中-大、风险高」的**peerreview 归位**完成,而且是零可见风险的形态 |

> **裁决(评委分歧)**:评委 1 反对把 peerreview 当第一用户,理由是「线上付费 + 配额口径已漂,两件事必须拆开立项」。
> **拆,但不推迟归位。** 具体:本阶段**配额调用点一行不动**(仍是 `service.go:1116/1623/1664` 的 `CheckDailyQuota`),引擎只接管 step 状态机。
> 🔴 并且要指出:约束材料与评委 1 说的「配额口径已漂」**已不成立** —— `vip/quota.go:403-407` 明写 `CheckDailyQuotaOverdraft` 是历史名、**与严格版完全等价、直接委托 `CheckDailyQuota`**,注释还写着「新代码请直接用 `CheckDailyQuota`」。peerreview 用的才是推荐写法。这条不需要单独立项,只需要在 §9 记一笔。

### Phase 2 · turnLoop 参数化 + claw 深度研究模板(第一次用户可见)

| | |
|---|---|
| **目标** | 科研长任务第一次能跨轮跑完 |
| **改动** | agent:`types.ts` 加 `maxRounds?`/`stepBrief?` · `turnLoop.ts:428` 单点参数化 + `step_incomplete` · `ws.ts:466` 透传(**共约 40 行**)· backend:`ws.go:1041` `stampBudget` 旁加 `stampRun`(必须在 `stripInjectionSurface` **之后**)· `template.go` 加 claw `deep_research` 模板 · Step 产物过 `resolveTextForDelivery` + `citation_audit`(**observe 模式**)· 前端 `RunProgressCard` + `shared/lib` 单点解析 + 三份 `fold.ts` 显式 no-op |
| **工作量** | **2 周** |
| **验收** | ① 一个 7 步 Run 跑完,中途 kill 容器能续跑 ② 撞 `maxRounds` 时 step 重排队而非 error ③ 满槽时 Run 让路、交互轮不受影响 ④ `citation_audit` 假阳性率 SQL 可查 ⑤ `run_state` 帧在 claw / prism / search / admin 四处 fold 一致 |
| **回滚** | 模板置空 → 退回今天的单步行为;`maxRounds` 不下发时 `?? MAX_TOOL_ROUNDS` 逐字等价 |
| **交付的价值** | round_cap / IDLE_TTL 两堵墙第一次被穿过;busy 变成进度条 |

> **升级入口必须是用户显式确认**:`researchTurn.ts` 的 STRONG_INTENT 命中(系统综述 / 荟萃分析 / PRISMA 等)时前端弹「这看起来是个长任务,要不要用深度研究模式?」——**用户点确认才升级,绝不自动**。把闲聊自动判成深研 = 用户等 3 分钟拿到一份他没要的东西。

### Phase 3 · CoverageReport 成为 Step 判据 + 装配层收口

| | |
|---|---|
| **目标** | Step 完成与否由**引擎算术**判定,不由模型自报;顺带把六份 spec 的复制粘贴收掉 |
| **改动** | `agentrun/coverage.go` 实装 §4.2 全部判据 · `StepDef.ExitCriteria` 接进认领循环 · agent 侧只读覆盖工具(`ws.go permissionAllowed` 显式放行,`permissionParity.test.ts` 会机械咬)· `op:"subq"` 行经 ledger 唯一写入口 · `hooks.go` 加 `StandardQuota(featureKey)` 收 5 份重复闭包(−280 行)· `routes_user.go` 64 条路由塌进 `MountSessionRoutes`(−90 行)· **能力轴 default-on 梯度在此翻转** |
| **工作量** | **1.5 周** |
| **验收** | ① 同一 Run 在 ExitCriteria 不达标时确实重排队、达标时确实前进 ② `total_upstream/delivered` 覆盖率进 journal 可 SQL 复盘 ③ 路由逐字对齐(含 `POST /sessions/:id/rename` 小程序兼容别名)④ 收口后 `bootstrap.go:457-466` 的 `VIPCheckerWired` 起服断言**确认新路径无旁路**再退休 |
| **回滚** | `ExitCriteria` 置空 → 退回 attempt 计数;路由收口是纯等价重构,git revert |
| **交付的价值** | 「这一步做没做成」第一次有机器可判的答案;-370 行样板 |

> ⚠️ 退休 `VIPCheckerWired` 之前必须确认新的统一挂载路径没有旁路 —— 它今天是「新增付费 feature 忘接线 = 收入泄漏」的唯一机械咬,**否则是用一个真护栏换一个假前提**。

### Phase 4 · Step 边界语义压缩 + 更多剖面模板(看 Phase 2/3 数据决定做不做)

| | |
|---|---|
| **目标** | 解掉「每步仍跑在同一条 messages 上」这个 Run 的固有代价 |
| **改动** | `engine.go`:Step 完成后 messages 重置为 `[原始请求, checkpoint 摘要]` · `template.go` 加 smart_search / prism 模板 · `run/PLAN.md` 前端编辑入口(改完把受影响 step 打回 pending) |
| **工作量** | **1 周** |
| **验收** | 一个 7 步 Run 全程不触发 `compact`;每步 input token 不随步数单调增长 |
| **回滚** | 压缩开关 env,关掉即继承整条历史 |
| **交付的价值** | Run 越长越不劣化 —— **Step 边界是语义完整的天然压缩点,质量优于 `compact.ts` 按 token 阈值机械触发的滚动摘要** |

---

## 八、被否决的方案与理由

### 8.1 把 `MAX_TOOL_ROUNDS` 从 24 提到 100

最省事的假方案,而且是**净负值**:单条 turn 会攥住 2 槽之一直到 `TurnTimeout` 15 分钟上限,把 7/29 那次 4 分钟头阻塞事故直接放大;messages 线性膨胀会更早撞 `compact` 的滚动摘要,而 compact 正是证据消失的地方;崩了照样全丢。它把「一次性事务」这个建模错误的后果加倍,而不是修它。

### 8.2 对 1125 行 `turnLoop` 做 stage 化等价重构(「科研内核」的 Phase 1)

**三位评委一致否决。** 按它自己给的 `STAGE_ORDER` 对照代码数:route / prefetch / ground / deliver / settle 都是循环外已经分好的段,而 12 个互锁局部变量(`windingDown` / `askFired` / `askWoundDown` / `windDownToolRounds` / `gateBlocked`)**全都活在 `for(round)` 里面** —— 全被塞进 `converse` 这**一个** stage。拆完最大的那块还是 ~800 行,长期复杂度几乎没降,却要付一次「12 个隐式时序耦合的等价重构」的全部风险。**它拿了 rewrite 的风险,只买到了命名。** 更致命的是排期结构:该阶段对外价值为零,而后续全部挂在它后面 —— 它一卡,整条链一个字都发不出去。

**保留其中真正值钱的部分**:纯 JSON 剖面 + 四条机械测试 + 能力轴 default-on 梯度,已全部写进 §3.3。这三样都不依赖那次大拆。

### 8.3 turn 内 fan-out / 并行子调查 / Probe(「研究图」主体)

三条否决理由已在 §4.4。补两条评委的具体判断:
- 它明知 2 槽今天就在弹走付费用户,仍把单条 turn 持槽从 30–60s 拉到 2–4 分钟,却把唯一的结构性缓解(backend 有界 FIFO)标为「与本提案正交、可选」。**那不正交,那是它自己制造的账单。**(本方案把 FIFO 提升为 §6.2 的必做项。)
- 子调查的原始 transcript 一个 token 不进主上下文,主模型综合的是**模型写的摘要的摘要**,提出方自陈「这条没有机械防线」。对需要在稿件上署名的用户,这是在已知接地率有缺口(有工具证据 98% / 失忆纪元 43%)的前提下又插一层不可审计的中间层。

### 8.4 backend 侧 orchestrator 派发多次完整 agent 调用

看起来最像「正经架构」,错在两个物理事实上:① 证据在容器内(`evidence/ledger.jsonl` 落会话 cwd,backend 完全黑盒),编排每一步决策都要读账本;② 每次派发都是完整 turn,都抢 `ws.ts:369` 的 2 个槽,做一次综述要抢 6–10 次 → **结构性自锁**。
本方案保留了它唯一有价值的部分:`agent_saga_steps` 作为 durable 底座 —— 但 Step 是**串行**的,并发度恒为 1。

### 8.5 SubmitAnswer 对未入账 DOI 硬拒

见 §5.3 裁决。**重启条件**:若 `citation_audit` 在 observe 模式跑满两周、假阳性率 < 2%、且账本已能吸纳 `library_ref` / 用户粘贴来源,可以重新评估「句柄级硬拒」向 DOI 的扩展 —— 但仍必须保留「每轮至多拒一次 + 冷重播豁免」。

### 8.6 真的把六个 feature 合并成一个 claw

两件事物理否决:① `loader.ts` 的 `TOTAL_CAP=40000` / `MENU_CAP_CHARS=2500`,触帽**静默丢弃**,prism 31 lenses + reviewer 13 + claw 7 全塞一个会话必爆菜单帽(仓库里已有反面教材,见 §3.4);② `feature_key` 是 6 张表的身份 + `AGENT_JOURNAL_DAEMON_ONLY` 紧急阀粒度 + 两个 admin 页面的筛选维度 + `chat_default.<key>` 模型绑定键 + `0034` 生成列名单成员(0.0.66 已为放宽唯一索引出过发布事故)。

### 8.9 fan-out 的重启条件(写下来,免得三个月后重新吵一遍)

四条**全部满足**才重新立项:① `init: true` 已上线且生产僵尸 pid 稳定为 0;② MCP inflight 闸已上线且吞吐上限已实测;③ 宿主 `free -g` 与上游 provider RPM/TPM 配额已知;④ Phase 0–3 之后有 DOI 接地率的前后对比数据,且分子确实做实了。

---

## 九、风险与未确认项

### 9.1 🔴 与约束材料 / 提案不符,已实测更正的三处

| # | 材料的说法 | 实测 | 影响 |
|---|---|---|---|
| 1 | Run 提案:「`SESSIONS_ROOT` 无 volume、容器重启即失」,并据此设计了「`run/` 目录不存在 → Run 转 expired」的销毁式兜底 | `docker-compose.prod.yml` 的 agent 服务**有** `./data/agent-sessions:/home/bun/sessions` 绑定挂载;**dev 的 compose 没有** | 生产重启**不丢**。按错误假设做的 expired 兜底会无谓作废用户跑到一半的 Run。真正要防的只有 `EXECUTOR_WORKDIR_TTL_DAYS=30` 的 GC,而那可以**在 Run 活跃期间续期**,不需要销毁 |
| 2 | Run 提案:需给 `admission.ts` 新增 `snapshot()` | `turnSlotsInUse()` / `maxTurnSlots()` **已经导出** | 只缺一个 HTTP 端点,比估的更便宜 |
| 3 | 约束材料 + 评委 1:「peerreview 配额口径已漂(`CheckDailyQuota` vs `CheckDailyQuotaOverdraft`)」 | `vip/quota.go:403-407` 明写 Overdraft 是历史名、**与严格版完全等价、直接委托**,并注明「新代码请直接用 `CheckDailyQuota`」 | **不存在口径漂移**,peerreview 用的才是推荐写法。评委 1 反对 peerreview 归位的一半理由因此失效 |

### 9.2 高风险项

- **Phase 0 是行为破坏性变更**。存量会话若已在 `evidence/` 下写文件,升级后写路径开始失败并回喂错误给模型。**上线前必须 grep 生产 `SESSIONS_ROOT` 统计踩中数**。已有的伪造记录不会被清理 —— 存量污染需独立审计,而且能不能查出来本身也是问号(伪造记录与真记录同形)。
- **bwrap 的 `--ro-bind` 覆盖 `--bind` 子路径依赖版本与参数顺序**。若在部署镜像上不生效,Phase 0 只封住了一半(进程内工具),而三个 `AllowBash` 剖面照样能写 —— **而我们会自以为封住了**。这就是 boot 真 jail 自检不能省的原因:失败要是启动期告警,不是静默。
- **Step 重试真花钱**。attempt 上限必须硬设 2。这一条若在实现时被放宽(「重要的步骤多试几次」),会重演 `agent-budget-overdraft` 那类失控。
- **`run_state` 是第 3 个带外声明帧型**(artifact / research_state / run_state)。加帧型必须同时改 claw / prism / search 三份 `fold.ts` + admin 镜像 + backend `classifyJournalEv`,并照抄 `journalOrdering.test.ts` 的顺序断言(终帧必须排在 `run_state` 之后,否则 hub 的 `tid!=0` 守卫会静默吞掉它)。**「fold 有四份、单边修复等于没修」是本仓库的老伤。**
- **模板是产品判断而非工程判断**。阶段划分写错比不做更糟 —— 用户会被一个错的流程框住且绕不过。缓解:claw 默认空模板;模板必须先在 peerreview(已知正确、有结构化输出可对拍)验证过再往别的剖面推。
- **成功的代价**:Run 让长任务变便宜 → 用户开始跑长任务 → 2 槽反而更紧张。让路策略保证交互用户优先,但若并发 Run 上到 2,`cpus: 2.0` 会先于内存成为瓶颈。**这是本方案唯一可能倒逼扩容的路径。**
- **`output_ref` 是 JSON 列**,一定会有人图省事把整篇中间稿塞进去。`repo.go` 里写死约定 + 长度断言。
- **发布断层**:24 个未提交 commit 必须先发出去,否则 Phase 1 的「行为对齐现状」没有可对拍的现状。

### 9.3 未确认项(必须实测,不要拿 dev 结果代替)

| 未知数 | 怎么测 | 卡住谁 |
|---|---|---|
| 生产僵尸 pid 现值 | `docker exec scholar_agent ps -eo stat \| grep -c '^Z'` | `init: true` 的紧迫度;dev 实测 82 个,生产 5 天 0 重启 0 报障与之对不上 |
| 宿主总内存 | `free -g` —— **仓库零记录**,`monitor-memory.sh` 只有百分比阈值 | 任何扩容决策的分母 |
| MCP 单例 stdio 吞吐上限 | 一次性 20 并发探针 | `MINICOD_MCP_MAX_INFLIGHT=4` 这个默认值今天是拍脑袋的 |
| 上游 provider RPM/TPM 配额 | 仓库零记录 | 只有在 fan-out 立项时才卡人;本方案不依赖 |
| `citation_audit` 假阳性率 | observe 两周 + SQL | 灰 chip 能不能开 |

### 9.4 本方案**不**解决的(写清楚,别让进度条暗示别的)

- 一份能投稿的系统综述**仍然做不到**。全部缺席:协议 / PICO 与纳排标准固化、去重与 PRISMA 流程数(identified / screened / excluded-with-reasons / included)、逐条题录的纳排决策留痕、偏倚风险评估(RoB2 / ROBINS-I)、异质性与合并效应量。
- 本方案交付的最好形态是:**一个能跑一夜、能续跑、检索式与命中数有据可查、每条断言可下钻到原句、未核验引用被显式标注的「取证与初稿系统」。** 筛选决策、偏倚评估、合并分析仍是研究者自己的活 —— **这一点应当写进产品文案**,不要让 Run 的进度条暗示它做完了系统综述。
- SubmitAnswer 正文与自由文本块的 DOI 仍只有带外标注,没有硬闸(§5.3,刻意)。
- 多个子问题的**并行**取证效率(§4.4 / §8.9)。
