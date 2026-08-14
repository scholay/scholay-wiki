# Agent 架构 · 编排能力 · 模型能力 → 科研能力评估

> 2026-08-01 · 只读调查,代码级取证(6 路取证 + 逐路复核 + 完备性补漏)
> 读者:项目负责人。所有代码类结论带 `file:line`,与文档冲突时以代码为准。
> **贯穿全文的一条轴:机械保证(引擎算数,模型改不了) vs 靠模型自觉(散文,引擎不校验)。**

---

## 〇、读这份报告前必须先接受的一件事:时态

本报告出现的所有"证据账本 / Router / 预检索 / 交付闸",**都不在生产上**。

```
$ git status --porcelain agent/
?? agent/src/evidence/            ← 整个目录未跟踪
?? agent/src/policy/researchTurn.ts
?? agent/src/tools/statsEngines.ts
 M agent/src/turn/turnLoop.ts     ← +470 行未提交
 M agent/src/tools/registry.ts    ← +266 行未提交
 M agent/src/server/shadowTurn.ts ← +86 行未提交

$ git rev-list --count main..HEAD
24                                ← 当前分支还领先 main 24 个 commit,main 停在 2026-07-26

$ docker exec scholar_agent ls /app/src/policy
featurePolicy.ts                  ← 容器里只有这一个,没有 researchTurn.ts
```

离生产隔着**两层**:未提交 + 未合 main + 未部署。

且方向上有一个反直觉的事实:**HEAD(=线上)的诚实性核验是活的、会注入纠偏轮的**——
`git show HEAD:agent/src/turn/turnLoop.ts:245` 有 `corrective_fired: true`,`:573` 有
`log.warn("guard:honesty corrective round")`。而这批未部署改动**把它降级成了纯观测**
(工作区 `turnLoop.ts:783-823`)。

⇒ 这批改动上线时,机械接地的净效果**可能先变弱再变强**:拆掉了唯一在跑的语义纠偏,
换上了一套只在特定路径生效的新闸(下文 §三详述覆盖面)。上线前必须先把这笔账算清。

本文凡涉及能力评级,一律按 **"线上现状 / 工作区意图"** 双时态标注。

---

## 一、三句话结论

**1. 架构形态**:我们是一个**单体 ReAct 循环**——`agent/src/turn/turnLoop.ts:426` 一个
`for (let round = 0; ; round++)`,轮上限 24,15 个内置工具里**没有 Task/subagent/Plan/Todo**。
没有规划阶段、没有并行扇出、没有反思-补检索环、没有大纲阶段。它外面裹着一台**不小的确定性状态机**
(预算 wind-down / 三条形态纠偏 guard / 交付闸 / Router),但这台状态机管的全是
"怎么收尾、说什么语言、有没有证据可交付",**没有一格管"研究该怎么做"**。

**2. 科研能力水平**:诚实评级 **"强检索工具的对话助手",不是 research agent**。
逐环节:提问 🟡 / 检索 ✅(SR 尺度 ❌)/ 筛选 ❌ / 提取 🟡(扫描件与表格 ❌)/ 分析 🟡(线上口径接近 ❌)/
可视化 ✅ / 成文 🟡 / 自查 🟡。与 PaperQA2 / OpenScholar / Elicit 相比,我们**证据只到摘要级**
(`agent/src/evidence/ledger.ts:251-253` 检索入账 `has_fulltext` 恒 false),它们已到 chunk 级;
但我们在"引用溯源真实性"这条更窄的轴上有一条**机械硬失败**的保证,是真强项。

**3. 最大瓶颈**:**不是模型,不是 loop-vs-graph,是"证据的粒度与生命周期"+"编排里没有一格是给研究用的"。**
最便宜的一刀:`search_snippets` 返回的原文片段今天进了账本却被记成**空壳**
(`agent/src/evidence/parse.ts` 的 `normalizePaper` 只取 `abstract/summary/description`,
不取 minicod `Snippet` 的 `text`/`section`)——全仓唯一已存在的 chunk 级接地入口被我们自己丢掉了。

---

## 二、我们的实际架构

### 2.1 控制流(文字版,已逐行核对)

```
WS 层  agent/src/server/ws.ts
  onMessage → user_message (:194)
    ├ inFlight 守卫 (:331)                    同连接并发 → error{busy}
    ├ awaitHydration (:342)                   等 seed_history,超时拒轮 code=context_not_ready
    ├ tryAcquireTurn (:369)                   ★进程级并发槽 = 2(admission.ts:14),满即拒不排队
    ├ meta.messages.push(user) (:444)
    ├ maybeReduceContext (:449)               三层降级压缩(裁老 tool_result → 摘要 → 硬窗)
    └ runTurn(...) (:479)

runTurn  agent/src/turn/turnLoop.ts:152   —— turn 开始的一次性准备(全在第一次 LLM call 之前)
    · buildTools → 去掉两个交付工具 (:167-172)
    · messages = [...input.messages] (:173)   轮内局部副本
    · classifyResearchTurn (:229)             ★Router:0 LLM / 0 token,turn 内冻结不重算
    · shouldPrefetch (:254) → runPrefetch     ★引擎替模型搜一枪,不进 history,只经 digest
    · buildDigest (:318) → append 到本轮最后一条 user 消息尾部 (:331-343)

for (round = 0; ; round++)   (:426)
  ① abort → break (:427)
  ② round >= 24 → sendError(round_cap) + break (:428)     ★硬 error,不是优雅收尾
  ③ 累计 raw token > 5,000,000 → sendError(budget) + break (:441)
  ④ taskBudget 硬额度耗尽 → windingDown 单向翻转 (:449)    ★工具面收窄到 4 个只读/交付工具
  ⑤ windingDown 且已用满 2 个工具轮 → activeTools=[] (:467) ★模型只能出文本,自然 end_turn
  ⑥ askFired → activeTools=[] + 收尾指令 (:476)
  ⑦ client.messages.stream (:489)
       catch: context 溢出 → reduceForWindow + continue(≤2)
              瞬态 → round_discarded + 退避 + continue(≤1)
              content_blocked → break / 其它 → upstream error break
  ⑧ DSML 泄漏轮级裁决 (:714)                 净化 history,正文过短则 round_discarded(≤1)
  ⑨ messages.push(assistant) (:729)
  ⑩ stop_reason !== 'tool_use' (:731) → 轮末 guard 链:
        max_tokens 恢复 (:741)     ┐
        语言纠偏     (:827)        ├ 三条全是【确定性正则判据】+ 注入一条 user 消息 + continue
        字符画纠偏   (:854)        ┘  共享预算 MAX_CORRECTIVE_ROUNDS = 2
        诚实性核验   (:794)        ← 【工作区】纯观测,恒不 continue;【线上 HEAD】仍会注入纠偏
        都不触发 → break (:875)
  ⑪ 有 tool_use → runTools (:885)             ★全或无并行:整批全 parallelSafe 才 Promise.all
  ⑫ 交付闸编排 (:892-926)
        DeclareInsufficient ok → 引擎发不足横幅(模型压不掉)
        SubmitAnswer 被拒     → gateBlocked++,不吞轮
        SubmitAnswer 放行     → 引擎分片流出正文 + redact + break   ★唯一确定性收轮点
  ⑬ 回循环顶

finally (:928)  空轮改判 error → emitArtifacts(./out diff) → research_state 帧 → sendComplete
```

**退出点共 9 个**(不是"若干"):`:427` abort、`:433` round_cap、`:444` budget、`:644` content_blocked、
`:677` upstream、`:724` model_protocol_error、`:768` max_tokens 截断轮、`:875` 正常完成、`:925` SubmitAnswer 交付。

### 2.2 形态判定

| 主流范式 | 我们有没有 | 证据 |
|---|---|---|
| ReAct 单循环 | ✅ **就是它** | `turnLoop.ts:426` |
| plan-execute(模型产计划) | ❌ agent 侧零。**Go 侧有两处** | peerreview `service.go:1724`;prism `planner.go:92` |
| graph(多节点/条件边/checkpoint) | ❌ | Router 是**二值**输出,不是图 |
| 多代理 / subagent | ❌ 执行器无 Task 工具 | `registry.ts:1231` 枚举 15 个工具 |
| reflection / self-critique | ⚠️ 有过,**被实测证伪后主动降级** | `turnLoop.ts:783-823` 写了三条降级理由 |
| 搜索式(ToT/LATS) | ❌ | — |
| memory-augmented / context engineering | ✅ **真正的骨架** | 账本 + digest + 折行重灌 |

**Router 不是 graph。** `agent/src/policy/researchTurn.ts:72-89`:四个输入
(`userText / ledgerTotal / toolNames / interactive`)、六条有序规则、**二值输出**(chat|evidence)、
0 token 0 LLM,turn 开始判一次并冻结(`turnLoop.ts:229`,理由是工具面中途变形会打断上游隐式前缀缓存)。
它只继承了 graph 的**一个**要素:状态转移由引擎而非模型决定。没有多节点、没有 checkpoint、没有 time travel。

**预检索是 plan-and-execute 的反面。** `evidence/prefetch.ts:134` 是引擎在模型开口前自己发起一次真实
MCP 检索,**计划由引擎写死、模型不可修改、刻意不进 history**(`:11-16` 注释:走 runTools 就得手搓
tool_use = 伪造模型动作)。plan-and-execute 的定义是"计划是模型产出的一等公民",我们正好相反。

**Go 侧的两处 plan-first**(agent 里没有,但仓里有):
- `backend/internal/peerreview/service.go:1724` — 方法论 → alpha/beta/gamma → chief 的固定 4 阶段 DAG,
  **串行**,带 4 个重入点(`loadPersistedReviewer` 逐位 gap-fill、`allReviewersPersisted` 跳整段、
  reviewTokenCap 触顶跳到 chief、chief 已持久化直接收尾)。
- `backend/internal/prism/planner.go:92` `PlanWritingProfile` — 建 throwaway 会话跑一次 runTurn,
  解 JSON、落库、`invalidateSessionForProfile` 逼主会话重建 seed。**这是一次 LLM 调用,输出直接改变
  后续所有轮的 system prompt** —— 定义上就是 planner。

⇒ **"我们完全没有 plan-first 能力"是错的。我们有,只是它长在 Go 里,而且没被推广。**
这把"从零造多代理"降级成"把已有编排模式加并行 + 推广",难度差一个量级。

### 2.3 状态载体(三类,不是"只有 messages")

| 类别 | 介质 | 耐久性 |
|---|---|---|
| ① messages | 轮内局部副本 → 内存 meta → journal 重灌 | **逐层降级**;30 分钟闲置即驱逐(`sessions.ts:347`);冷重灌把工具调用折成一行(`shadowTurn.ts:121`) |
| ② 证据账本 + `./out` | 会话 cwd 磁盘,append-only jsonl | 扛驱逐与重启,TTL 30 天(`sessions.ts:388`);**每轮经 digest 回到 prompt**(`turnLoop.ts:317-343`) |
| ③ user_memory_blocks | Go 侧 DB | 跨会话,但只有 `profile`/`preferences` 两个 label,**不含研究进度** |

**没有任何任务状态 / 计划对象。** 全仓 grep `todo|plan|scratchpad|state.json` 在 `agent/src` 下
只命中一句注释和一个统计库名。工具表里没有 TodoWrite/Plan。

---

## 三、编排能力:机械保证 vs 靠自觉

这是本次评估最有价值的一条轴。同一件事,写在代码里 = 保证,写在 prompt/skill 里 = 期望。
本仓库已经**自己证明了散文通道饱和**:用户 467 直接打字"你应该使用查询论文的工具来找",该轮
`tool_use` 仍为 0(`docs/agent-evidence-architecture-2026-08.md:34`)。

### 表 A · 真正的机械保证(引擎算数,模型改不了)

| # | 机制 | 判据 | 位置 | 时态 | 强度备注 |
|---|---|---|---|---|---|
| A1 | 工具面 per-feature 白名单(双墙) | backend spec 下发 + executor `featurePolicy` 再关一次 | `smartsearch/spec.go:198`;`runTools.ts:54` | **线上** | 最硬的一条。smart_search 只剩 minicod + TodayDate,除检索外无动作可做 |
| A2 | 24 轮 / 5M token / taskBudget 三层闸 | 纯计数 | `turnLoop.ts:36,52,435,449` | **线上** | 撞 24 轮是 **error**,撞 taskBudget 是**优雅收尾**——两条路径体验结构性不同 |
| A3 | wind-down 单向状态翻转 | `rawSpent >= hardRemaining` | `turnLoop.ts:449-472` | **线上** | 工具面收窄→2 轮后清空→模型只能出文本 |
| A4 | 三条形态纠偏轮 | 正则:max_tokens / CJK<10% / box-art | `turnLoop.ts:741,827,854` | **线上** | 唯一在跑的"机械自我修正",但**只管形态不管内容** |
| A5 | 诚实性核验注入纠偏 | DOI ∈ 证据语料 | HEAD `turnLoop.ts:245,573` | **线上,工作区拆除** | ⚠️ 见 §〇 |
| A6 | 证据账本 ingest 咽喉点 | `isMcpTool && !isError` → 立刻回写 E 编号 | `runTools.ts:110-122` | 工作区 | E 编号会话内单调分配 |
| A7 | Router 相位判定 | 四输入六规则,0 LLM | `researchTurn.ts:72-89` | 工作区 | 二值输出 |
| A8 | 引擎预检索 | `phase==='evidence' && ledgerTotal===0` | `prefetch.ts:123` | 工作区 | 一**会话**至多一次(见下) |
| A9 | SubmitAnswer 出口闸 | `stats().total > 0` | `registry.ts:1149` | 工作区 | 纯计数,零内容判断 |
| A10 | DeclareInsufficient 横幅 | 引擎发,模型压不掉 | `turnLoop.ts:889-900` | 工作区 | — |
| A11 | `[[E7]]` 交付展开闸 | 展不开则**硬失败不生成文件** | `registry.ts:686,857`;`artifacts.ts:301` | 工作区 | **我们最硬的一条,但覆盖面窄** |
| A12 | 中文覆盖披露 | `CJK_RE.test(query)` → 注入 coverage_note | `mcp/sanitizeMinicod.ts:238` | **线上** | 与工具结果同帧注入,比 skill 散文强一个量级 |
| A13 | peerreview 阶段级续跑 | 已持久化即跳过 | `peerreview/service.go:1702-1723` | **线上** | 仓内唯一的 durable execution |
| A14 | peerreview 按 slug 自读 SKILL.md | 不信任模型回显 + 正则防路径穿越 | `service_reviewers.go:1-17,69-75` | **线上** | "模型编排收窄到最小可信面"的正确形态 |

### 表 B · 靠模型自觉(散文,引擎零校验)

| # | 期望的行为 | 写在哪 | 引擎校验? | 后果 |
|---|---|---|---|---|
| B1 | 检索策略全套(概念块拆解 / 同义扩展 / 引文双向滚雪球 / 作者枢纽 / 覆盖度自检 / 何时停 / 稀疏时放宽顺序) | `agent-skills/smart-search-skills/minicod-search-strategy/SKILL.md:18-46`(61 行散文) | ❌ 一条都没数过 | 综述可能只搜一个角度,**引用全真但系统性漏掉半个领域**——比编造更难发现 |
| B2 | 选题流程 Step 0-4(含新颖性证伪核验) | `claw-add/guides/topic-selection/SKILL.md:12-40` | ❌ 且**要模型自己想起来调 Skill 工具才加载** | 两层自觉。可以完全跳过证伪直接下"这个方向没人做过"的判断 |
| B3 | "必须先检索再回答" | `smartsearch/spec.go:157-179`;`prompts/claw.go:78-84` | ❌ | 见 B1 |
| B4 | 空结果时换关键词重试 2 轮 | `prompts/claw.go:68`(system prompt,权威高于 skill) | ❌ | 与 skill §5 的数值有对撞前科(`prompts/smart_search.go:13-18` 记录的历史事故) |
| B5 | **用 `[[E7]]` 句柄写引用** | `evidence/render.ts:322-325` CITATION_CONTRACT | ❌ | **A11 的前提是模型自愿走进它**。不写句柄 → `deliver.ts:33` 的 `if (!text.includes("[["))` 零 I/O 直接放行 |
| B6 | **不伪造账本记录** | CITATION_CONTRACT 里那句"没有任何工具能创建它" | ❌ **这句话是散文不是代码** | 见下,最严重的一条 |
| B7 | 自我配速(budgetDisclosure) | `turnLoop.ts:70-80` | ❌(机械的那一半是 A3) | — |
| B8 | 统计库可用性 | `guides/methods-stats/SKILL.md:34` 声称有 statsmodels | ❌ 且**与镜像不一致** | 见 §七 |

### 🔴 B6 展开:E 编号"不可铸造"是假的

`evidence/ledger.ts:52` 定义 E 编号,账本落在 `<workDir>/evidence/ledger.jsonl`。
`sandbox/confine.ts` 里 **没有任何 `evidence/` 的路径 denylist**(我 grep 过,零命中)——
它只断言路径落在 workDir 内。而:

- `Write` 的校验是 `confinePath(workDir, ..., true)`(`registry.ts:178`)
- `Bash` 的 jail 唯一可写绑定是 `--bind profile.cwd /work`(`sandbox/bwrap.ts:104`)
- `claw / prism / boltslides / sci_draw` 四个 feature 的 denylist **都不含 Write/Edit**,claw 与 prism 还开着 Bash
- `DeclareInsufficient` 自己就是 `appendFile` 到 `ledger.jsonl`(`registry.ts:1214`),证明这条路是通的
- 读侧 `loadLedger`(`ledger.ts:159-179`)对一行的**全部校验**只有 `typeof r.id === "string" && typeof r.key === "string"`

⇒ 一条手写的 `{"id":"E99","key":"x","title":"…","doi":"…","read_marks":[]}` 同时做到:
① `stats().total > 0` → A9 出口闸恒开;② `[[E99]]` 在三个交付边界被 `expandCitations` 展开成
**一条格式完整、看起来完全真实的题录**。

**这正是整套设计声称要消灭的失败模式。** "不可铸造"只对 smart_search(禁 Write/Edit/Glob/Grep/Bash)
和 peerreview 评分会话成立。修法机械且便宜:`confinePath` 加一条 `evidence/` 前缀拒写,
或把账本挪到 workDir 之外的 sibling 目录。

### 3.1 六个缺口的明确答案

| 缺口 | 答案 | 证据 |
|---|---|---|
| **任务分解** | ❌ agent 侧零。15 个工具无 Todo/Plan/Task。Go 侧有两处(peerreview 硬编码 5 段 / prism 单步 planner),不可迁移不动态 | `registry.ts:1231`;`peerreview/service.go:1724`;`prism/planner.go:92` |
| **并行探索** | ❌ 唯一并行是模型自己一轮内发多个 `tool_use` 的 `Promise.all`,且是**全或无**——批里混进一个 Write/Bash,连同的 6 次 MCP 检索全部退化串行 | `runTools.ts:37-50`(`every` 判定) |
| **显式计划对象** | ❌ 全仓无任何可检查/可修改/可跨轮持久的 plan 结构 | grep 零命中 |
| **反思 / 自我批评** | ⚠️ **有过,被我们自己的生产数据证伪后主动降级**。剩下三条只管形态 | `turnLoop.ts:783-823` 三条理由 |
| **迭代深化** | ❌ 且比想象的严重:`shouldPrefetch` 要求 `ledgerTotal===0`,而账本是 append-only 只增不减 ⇒ 预检索是**一会话至多一次**;Router 的 `ledger_grounded` 让账本非空后**全会话所有轮**恒判 chat、交付闸整个消失 | `prefetch.ts:123`;`researchTurn.ts:82` |
| **跨轮研究状态** | ⚠️ 半有。"查过什么"活着(`queries.jsonl` + digest 最近 3 条);"**还缺什么**"是**死数据**——`DeclareInsufficient` 写进账本的 `missing` 字段全仓无任何读取点。跨会话为零 | 写 `registry.ts:1211`;读 `ledger.ts:159-179` 只 fold `op:"read_mark"` |

### 3.2 三条互相抵消的结构性反讽(必须写进任何改造方案)

**① 预检索解除了交付闸的约束力。** Router 判 evidence 的前提之一是 `ledgerTotal==0`,而
`shouldPrefetch` 也恰好要求 `ledger==0`。⇒ **每个装了闸的轮次,都会先被引擎自己打一枪**;
预检索一 hit,账本非空,模型随后调 SubmitAnswer 直接命中 `st.total>0` 放行——
**模型一次检索都没做也照样过闸**。闸只在预检索 miss/timeout/no_query 时才真正咬人。

**② SubmitAnswer 的捷径同时是一次 guard 旁路。** 交付 break 在 `turnLoop.ts:926`,位于
**tool_use 分支内**;而整条轮末 guard 链(A4 三条 + 诚实性观测)全挂在
`if (stop_reason !== "tool_use")` 分支里(`:731-877`)。⇒ 走 SubmitAnswer 交付的轮次
**一条 guard 都不跑、claim_audit 一条不落**。方向最坏:取证轮 = 最可能产出长篇文献综述的轮次,
恰恰是唯一没有任何 guard、且在带外指标里对诚实性完全不可见的那条路径。

**③ 闸 fail-open。** `registry.ts:1167-1170`:账本读失败时 `catch` 直接 `return ok("已交付…")`。
作为一条以"引擎算数、零裁量"为卖点的闸,它有一条静默的全开路径。

### 3.3 覆盖面的三个盲区

- **对话路径零引用校验。** 全仓 `resolveFileForDelivery` 只有三个调用点(`registry.ts:686` ExportDocument、
  `:857` BuildDeck、`artifacts.ts:301` 落盘产物)。**SubmitAnswer 交付的正文和普通 assistant 文本块
  一个都不经过**(`turnLoop.ts:917` 直接 `content_delta` 分片)。而对话正是 smart_search 的**唯一**产物形态。
  ⇒ 我们最强的 A11 在使用量最大的路径上完全不在场。
- **peerreview 整体在契约之外。** `researchTurn.ts:78` `!interactive → chat, rule=task_feature`,
  而 peerreview 走 server-side 不盖 taskBudget。`rv-novelty`(判新颖性)、`rv-integrity`(核对被引文献
  是否真支撑论断)这两个最需要真检索的 skill,跑在一个无闸、无预检索、无横幅的通道里。
- **`out/` 的展开只覆盖 7 个扩展名**(`artifacts.ts:277` CITABLE_EXTS = md/markdown/txt/html/htm/csv/svg)。
  `.tex` / `.bib` / `.json` / `.py` / `.docx` **完全不过闸**——而 prism 的主力产物就是 `.tex`/`.bib`。

---

## 四、模型能力:是不是瓶颈?

### 4.1 我们在用什么

12 个模型,DB 驱动(`agent_models`),**全部国产上游**:DeepSeek(默认端点,Anthropic 协议)/ 千问 / 智谱 / MiniMax。
**目录里没有任何 Anthropic / OpenAI / Google 前沿模型。** 12 行全部 `enabled=1 user_selectable=1 min_tier=''`
⇒ free 用户也能直接选 ¥12/36 每 1M 的 qwen3.7-max。

绑定实况(实查 `agent_model_bindings`):

```
system.main            = deepseek-v4-pro     (¥3/6,  1M 窗, vision=0)
system.fast            = deepseek-v4-flash   (¥1/2,  1M 窗, vision=0)
chat_default.claw      = flash
chat_default.smart_search = flash
chat_default.prism     = flash
boltslides / sci_draw  → 经 purposeAlias 归到 claw 默认 = flash   ← 设计如此,不是配置遗漏
peerreview.methodology = pro   ← pro 只出现在这里(+ scoring/chief 经别名)
```

⇒ **五个用户面 feature 的默认模型 100% 是最便宜档。**
其中 `model.go:73` 的别名注释原文写着:「`chat_default.sci_draw` → 智能助手默认(**注:从 vision 模型降级到 flash**)」
——**一个科研绘图 feature 被有意识地降到一个看不见图的模型上**,`turnLoop.ts:485` 会把历史 image 块换成文本占位。

### 4.2 结论:模型的**推理深度**不是当前瓶颈,但这句话必须小心说

**能被证据支持的只有这一句**:在当前编排下,零工具轮与引用编造这两个具体病灶,
其方差由**编排项**支配,换 deepseek 内部档位不能消除。

**不能说"推理深度不是瓶颈"** ——因为我们从来没测过推理深度。被反复引用的三组数据
(pro/flash 零工具率、smart_search/claw 零工具率、DOI 接地率 98% vs 43%)测的全是
"是否发起工具调用"和"引用是否可回溯",没有一条测推理。用它们否定"推理深度"是量纲错误。

而且那组数字本身**不可用**:

- `docs/p0-metrics-collectability-2026-08.md:116` 原文:「claw 零工具率取哪个数 |
  仓库里至少四个:38.2% / 55.3% / 42.8% / 41.5% | **任意前后对比都是自欺**」
- 原始 journal 不在仓库,无样本量、无置信区间
- **模型分配不是随机的**:`hub.go:511-528`,claw 上跑 pro 的轮 100% 来自用户主动 pin
- 分母被本仓库自己确认污染:`prod-audit-2026-07-31.md` §2.5「41.5% 零工具含被当"科研生活教练"的
  51 轮情绪咨询——真实黏性来源,不建议封堵」

### 4.3 🔴 而且我们的编排在结构上惩罚贵模型 2.9 倍

`backend/internal/agentbridge/hub.go:675-690` `stampTurnBudget`:BudgetProvider 返回的是
**微元真实成本**余量,盖帧前 `soft/hard ÷ CostPerToken(model)` 换算成 token 预算。
`modelcatalog/service.go:287-297` `CostPerToken = 0.8×cacheR + 0.15×in + 0.05×out`。DB 实算:

| 模型 | 微元/token | 同样 ¥ 余量拿到的 token 预算 |
|---|---|---|
| deepseek-v4-flash | 0.266 | 100%(基准) |
| deepseek-v4-pro | 0.770 | **34%** |
| glm-5.2 | 4.20 | 6.3% |
| qwen3.7-max | 5.52 | 4.8% |

这个预算有两个直达零工具轮的出口:① `turnLoop.ts:70-80` 每轮把 `budgetDisclosure` append 到
user 消息尾,`softRemaining≤0` 时原文是「内部资源即将见底:请用尽量少的步骤、**基于已有信息**给出
最完整回答并尽快结束」;② `turnLoop.ts:449` 越过 `hardRemaining` 即 wind-down 清空工具面。

⇒ **"更贵 = 更早被劝退 = 更可能零工具"是我们自己编排出来的。**
55.3/38.2 = 1.45 倍,远小于 2.9 倍的预算削减,方向完全一致。
**这条不修,任何模型 A/B 都是在测"谁被削了预算"。**

### 4.4 真正的模型侧瓶颈:可控性,不是聪明度

**`tool_choice` 探针实测(`docs/tool-choice-probe-2026-08.md`)**:

- 两个线上主力 `deepseek-v4-pro` / `deepseek-v4-flash` 对 `{type:'any'}` 是
  **HTTP 200 + 静默无视 + 照常 end_turn**(最坏的一种不支持)
- 12 个模型里只有 `glm-4.7-flashx` 全绿 PASS;支持度是 **per-model 而非 per-provider**
- 生产代码里 `tool_choice` 命中 **0 处**(`turnLoop.ts:489` 的 stream 调用只带
  `model/max_tokens/system/messages/tools`)

⇒ **"每一轮不调工具直接回答,在 API 层永远是合法且零成本的采样分支。"**
"先检索再综述"这条不变量无法用 API 强制,只能靠散文——而散文通道已被证伪饱和。

但注意:这是**模型路由与成本的产品选择,不是架构级不可能**。阶段编排今天就能在
`glm-4.7-flashx` 上跑,退化到今天的形态即可。探针文档 §165 已写好方案(admin 模型目录加
`phase_orchestration` 列)。

**其它模型侧事实**:
- 全仓生产路径**零 extended-thinking / reasoning-effort 旋钮**。审稿的方法论评估与"帮我改个标题"
  用同一个不可调的思考预算。这是**完全缺席**,不是"被常量钳住"——两者修法不同。
- MiniMax 三个模型上游 **402 余额不足**,却仍 `enabled=1 user_selectable=1` 且带 flagship 高亮。
  用户选中 → 下一条消息整轮失败。
- 上下文压缩在主力配置下**从未被触及**(1M 窗,触发线 702K,240h 内 0 次)。它不是死代码,
  是**只在故障路径(模型帧投递失败 → 兜底 128K 窗 → 触发线 48K)和小窗模型上才活**的代码
  ——比"死代码"更危险,因为长期零生产验证。
- `context-budget.ts:14` 的 `CHARS_PER_TOKEN=2.6` 注释自称「CJK≈1-1.5 tok/字…取中偏保守」,
  但对 CJK 用 2.6 当**除数**是估**少** ~3 倍,方向与注释自述相反。1M 窗吸收了它;切到 200K 档模型会静默越墙。

### 4.5 我们已经有一个"强模型 + 正确编排"的自然实验,而且它是全站最好的

**peerreview**:pro(`peerreview.methodology`)+ Go 侧确定性固定序 + `chatWithRetry` 带
`parseReviewerJSON` 谓词的 schema 校验有界重试 + **`BudgetProvider=nil`**(`agentbridge/ws.go:1044`,
唯一不吃 §4.3 成本归一削减的 feature)。

结果:`prod-audit-2026-07-31.md` §2.5「peerreview:**可靠性全站最好**(18/18 完成,0 失败,
端到端 7 分钟,单篇 ¥0.5)」。

**它的残留失败模式才是判断"模型是不是天花板"该看的那一格**:同一份审计 §2.4#15 记录的
**输出刻度坍缩**——18 篇全部大修/拒稿、68/71 份报告恰好 6 条意见、分数挤在 50-52、多轮重投不单调。
那是编排修好之后仍然存在的模型/判据侧天花板。

---

## 五、主流架构对标

对每一种范式:**它买到什么 / 代价 / 对科研任务的真实收益 / 我们该不该抄**。
证据分三档标注:**[一手]** 同行评议或公开可查基准 / **[自评]** 厂商内部 eval / **[二手]** 聚合复述与内容营销。

### 5.1 loop(ReAct)—— 我们就在这

- **买到**:最省的实现,单一 message 序列,provider 无关,前缀缓存友好。
- **代价**:所有"阶段感"来自模型自由裁量;上下文单点;没有一格状态是给研究用的。
- **科研收益**:对"找 20 篇核心文献 + 写一段综述"够用。对"5 个正交子问题的系统调研"不够。
- **判断**:**主干不换**。2026 的主流共识本身就是"先用最简单的模式,只在具体故障形态出现时才叠加"
  ——我们的演进路径与之吻合。[二手]

### 5.2 graph(LangGraph 式)

- **买到**:真实卖点**不是"图好看",是 durable execution** —— 每个节点转移自动 checkpoint,
  支撑故障恢复、状态历史、time travel、HITL 审批。[一手,官方文档]
- **代价**:把控制流从"一个循环"改写成"节点 + 条件边",全部现有 guard/闸/压缩逻辑要重新挂载。
- **科研收益**:对我们**最有价值的那一格已经拿到了**——peerreview 的阶段级续跑
  (`service.go:1702-1723`)就是最小版 durable execution。而交互式 feature 的一次长 turn
  崩了只能整轮重来。
- **判断**:**不要为了 graph 而 graph。** 我们要的是 checkpoint,不是节点图。
  把 peerreview 的续跑模式移植到长产出场景,成本远低于换框架。

### 5.3 plan-execute

- **买到**:计划可见、可编辑、可被用户中途改向;子任务失败可局部恢复。
  Gemini Deep Research 的形态是 plan → multi-source search → iterate → output,
  关键工程是一个异步任务管理器在 planner 与 task 模型之间维护共享状态。[二手,来源是 Google 产品页文案]
- **代价**:多一次 LLM 往返 + 计划漂移风险(模型照着一份过时计划走)。
- **科研收益**:**对科研任务是这几条里最高的**。用户问"CAR-T 治疗实体瘤研究现状",
  一份可见的分面计划(机制 / 临床试验 / 毒性管理 / 耐药)让"漏掉整个子领域"变成用户可发现的事。
  今天我们连"本次打算查哪几个面"都不输出。
- **判断**:**该抄,而且我们已经有两个 Go 侧先例可以照抄**(peerreview / prism planner)。

### 5.4 多代理(orchestrator-worker)

- **买到**:并行提速 + **上下文隔离**(每个子代理烧自己的窗口,主代理只收摘要)。
  Anthropic 的 lead agent + 3-5 并行子代理在内部 eval 上比单代理 Opus 4 高 90.2%,
  复杂查询耗时降低最多 90%。[自评]
- **代价**:约 **15x token**,token 用量解释 80% 的性能方差;失控时(子代理递归派生 / 工具返回超大结果)
  再乘 10x。[二手]
- **科研收益**:上下文隔离这一半**真的解决我们的问题**(读 12 篇 PDF 做对比表,读到第 7 篇时前 3 篇
  已被 compact 折成一行)。但 15x token 只是钱的问题,**真正致命的是子代理会重新制造
  "证据生命周期比对话短"这个我们刚花一轮改造修掉的根因**——子代理的 tool_result 主代理看不见。
- **判断**:**先别做。** 如果要做,必须先让子代理写进**同一个证据账本**,否则是倒退。
  且 §六 会说明:我们的并发容量今天就已经是硬约束,15x 不只是钱。

### 5.5 reflection / self-critique

- **买到**:理论上的自我纠错。
- **代价**:**无外部 grader 的 LLM 自我批评不可靠已有 ICLR 2025 级证据**
  (Stechly / Valmeekam / Kambhampati,GPT-4 在 Game of 24 / 图着色 / STRIPS 三域);
  Kamoi et al. 的批判性综述结论是"内在自纠常常无提升甚至变差"。[一手]
- **我们的独立复现**:`turnLoop.ts:783-823` 写明三条实测理由降级 verifyClaims ——
  (a) 609 轮只触发 8 次 = 1.3%,最该拦的那次(用户传 PDF 前就产出 31 条效应量)findings 全空;
  (b) 冷重播时是**净负值**——旧语料读的是被 shadowTurn 掏空的 messages,每条**真实**引用都被判编造,
  纠偏要求"补齐或更正"而模型此刻无法查证,**最省力的服从方式是删掉真引用**;
  (c) 误报吃掉 `MAX_CORRECTIVE_ROUNDS=2` 共享预算,把三条确定性 guard 挤出去。
- **判断**:**我们踩在正确的一侧,不是偷懒。** 但注意区分:被证伪的是"LLM 语义自评",
  **不是"引擎算数的外部判据"**。我们其实已经有 grader 的原料
  (verifyClaims 的"正文 DOI ∈ 账本"就是引擎算数),只是刻意没接成阻断、**也没接成用户可见标注**。
  后者既不占纠偏预算、模型也压不掉,与 INSUFFICIENT_BANNER 完全同构——这是被漏掉的低成本收益。

### 5.6 搜索式(ToT / LATS)

- **代价**:ToT 约 **>100x** 单次 CoT 算力、实测约 $0.74/题。LATS 还有两条对我们特别致命的假设:
  它假定**可以回退到早先状态**,且**不建模工具失败与工具成本**。[一手]
- **对科研任务的真实收益**:**最低,而且原因是结构性的** —— 搜索式的全部价值在 value function,
  而科研任务里最不可靠的恰恰是它:"判一条检索路径好不好"等于"已经知道答案"。
  我们的工具是有真实上游花费与限流的 MCP 检索,回退不可能免费。
- **判断**:**不抄。**

---

## 六、前沿科研 agent 对比

前沿已分化成两条路线,我们两条都不在上面。

### 路线 A · Deep Research 编排派

| 系统 | 架构关键点 | 证据档 |
|---|---|---|
| Gemini DR | plan → multi-source search → iterate → output;异步任务管理器维护 planner/task 共享状态;广度优先铺面 → 遇矛盾/高价值时切深度优先 | [二手/厂商文案] |
| OpenAI DR | o3 浏览优化版,**端到端 RL 在模拟研究环境里训练多步检索策略** —— 这条我们复制不了 | [厂商] |
| Anthropic Research | orchestrator-worker,3-5 并行子代理 + 独立引文核对 pass | [自评 90.2%] |
| STORM / Co-STORM | **perspective-guided question asking**:先调查同类主题发现若干视角,用视角驱动多轮提问做预写作检索与大纲生成 | [一手,斯坦福开源] |

**STORM 最值得看**:它用架构回答了"我怎么知道该问什么"。我们把这件事完全交给了 skill 散文(表 B B1/B2)。

### 路线 B · 文献接地派

| 系统 | 证据粒度 | 关键差异 |
|---|---|---|
| PaperQA2 | **全文 chunk** | 摄入解析 → 语义分块+embedding → 带查询扩展的 agentic 检索 → 带引用合成。LitQA2 上超过生物 PhD/博后的检索准确率;RAG-QA Arena 科学子集比第二名高 12.4% [一手] |
| OpenScholar | **全文 chunk** | 45M OA 论文库 + **专训 retriever/reranker** + 8B 专用合成模型 + 推理期自反馈。引用准确率与人类专家相当;对照 GPT-4o 编造引用率 78-90%。**2026-02 上 Nature** [一手] |
| Ai2 Scholar QA | 双索引 | 1 亿+摘要索引 + 1170 万全文索引,pipeline 全开源 —— **对我们最有借鉴价值的折中方案** |
| Elicit | 结构化抽取 | 把系统综述流程产品化:建议筛选标准与抽取字段 → 摘要筛 → 全文筛 → 结构化抽取(含表格与图中数据),每格挂原文引语,每个排除决策有理由与逐标准打分,全程 PRISMA 可审计 [自评 97/99/96%;第三方研究更保守] |
| Consensus | **claim 级** | 每篇抽 Study Snapshot,LLM 分类研究设计,Claims-and-Evidence 表列支持/反对,Consensus Meter 聚合共识度 |
| FutureHouse Kosmos | 超长时程 | 单次运行 1500 篇论文 + 42000 行分析代码 [融资期自述] |

### 我们差在哪

1. **证据粒度**:我们只到题录 + 摘要(截 1200 字符,`ledger.ts:98`),`has_fulltext` **恒 false**
   (`ledger.ts:251-253`,代码注释明说"不是上游标了 OA")。⇒ "Smith 2023 用的是 ITT 还是 PP 分析?"
   "这三篇里哪几篇报告了 95% CI?"——答案在正文方法/结果节,我们的账本里根本没有这些字节。
2. **没有全文获取路径**:执行器**根本没有实现** WebFetch/WebSearch(grep 全树零命中;
   backend `ws.go:318` 还留着放行它们的分支,那是对不存在的工具放行)。⇒ 补这块是**写一个工具**,
   不是改几行 denylist。
   ⚠️ 但有一条被忽略的既有通道:claw/sci_draw 的 Bash jail 是**刻意网络开放**的
   (`ws.ts:473` 硬编码 `net:"open"` → `bwrap.ts:116` `--share-net`,`:104` bind `/etc/ssl` 与
   `/etc/resolv.conf`),镜像自带 python3/nodejs/chromium/pdftotext,而 minicod 的 Paper schema
   **返回 `pdf_url` 与 `is_open_access`** 且不在 sanitize 的剔除清单里。
   ⇒ **OA 全文下载 + 抽取在机制上今天就可用,只是无人接线、无 skill 教、无验证。**
3. **无重排(rerank)**:预检索取上游前 5 条原始顺序,模型自己调工具也只有 limit。
   检索质量天花板被压在上游 API 默认排序上。OpenScholar 的核心组件之一就是专训 reranker。
4. **无结构化抽取 / 无筛选流水线 / 无矛盾检测**:Elicit 与 Consensus 各占的那一格,我们是零。
5. **无长时程异步研究任务形态**——但这条比表面轻:我们**已经有 server-side 后台车道**
   (peerreview 用 `safego.Go` + `ctxutil.BackgroundJob` + `ServerSideChatStreaming`,无 taskBudget
   因而无 wind-down)。缺的是编排与成本控制,**不是执行车道**。这把 Kosmos 类能力从
   "架构不可能"拉回"没立项"。
6. **无任何 benchmark 读数**:LitQA2 / RAG-QA Arena 科学子集 / DeepResearch Bench 的 RACE+FACT
   都是现成可跑的。我们唯一的质量指标(DOI 接地率)与业界任何基准不可比。

### 我们强在哪(不是自夸,但要说准)

**A11 是一条业界公开材料里我没见到同构物的机械保证**:`[[E7]]` 句柄由平台在工具返回题录时分配,
交付时展开,**编号对不上则整次构建硬失败、文件不生成**(`render.ts:270,302`)。
竞品普遍靠事后核验(引用准确率 78%-94%),我们这条在其覆盖到的路径上是结构性的。

**但必须说准边界**,否则会误导决策:
- 只对 `[[E]]` 句柄生效(`render.ts:221` 的 `CITATION_RE`),模型写裸书目 → `deliver.ts:33`
  零 I/O 直接放行
- **只覆盖文件交付**(3 个调用点),**对话路径零校验** —— 而对话是 smart_search 的唯一产物形态
- 只覆盖 7 个扩展名,`.tex`/`.bib` 不在内
- 量的是"书目记录是否来自真实工具返回",**不是**业界 FACT 框架量的"被引来源是否支撑了那句陈述"。
  后者我们**一个机制都没有**。

**顺带纠正一个常被引用的数**:DeepResearch Bench 上引用准确率最高的不是 Perplexity(90.24%),
是 Claude-3.5-Sonnet w/Search(94.04%);Perplexity 只是 deep-research 那一档里最高。
另:"retrieval grounding 降幻觉 75-90%"追下去是一家内容营销站自 published 的内部 benchmark,
同批检索里的同行评议来源给的是 **30-70%**。**别把它当硬数据引用。**

---

## 七、科研任务链条逐环节评级

评级口径:✅ 有机械保证或成熟实现 / 🟡 能做但靠模型自觉、无保证 / ❌ 结构性缺失。
**双时态:线上现状 → 工作区意图。**

| 环节 | 评级 | 判据 |
|---|---|---|
| **① 提问 / 问题澄清** | 🟡 | `AskUserQuestion` + ask wind-down 是真机械(`registry.ts:960`,下一轮强制清空工具)。**对 claw/smart_search/prism/boltslides/sci_draw 五个 feature 全开**,只有 peerreview 禁用。但**没有 STORM 式的多视角发现**,"该问什么"完全靠模型 |
| **② 检索** | ✅ / SR 尺度 ❌ | 76 工具白名单子集(18/22/17/13),主题搜 / 双向引文滚雪球 / 近邻 / 作者枢纽 / 期刊筛选与投稿模板都真实存在,skill 教手艺。**但**:上游只有 SS+OpenAlex+PubMed,**无 Embase/Cochrane/WoS/知网**;策略全是散文(表 B B1);**无重排**;三重硬帽叠乘(单次 limit≤100、tool_result 压到 50K 字符会**从最长列表尾部丢弃**、单轮 24 工具轮)⇒ 一次对话能进上下文的题录**几百条封顶**,而真 SR 的 identification 是 1000-3000 条 |
| **③ 筛选(纳排/去重/PRISMA)** | ❌ **零** | 全部只以散文活在 skill/persona/lens 里。唯一的去重**实现**在未提交的 `ledger.ts:52`(身份键 `doi > src:source:id > sha1(norm(title)+year)`),且它服务的是引用接地不是 PRISMA。**PRISMA 第一格"识别 N 篇"其实机械可得**(minicod `PaperSearchResult.total` 是 root 级字段、不被 sanitize 裁剪),后三格必然编造 |
| **④ 数据提取** | 🟡 / 扫描件与表格 ❌ | ReadDocument:PDF→`pdftotext -layout`、xlsx→自研 openpyxl 脚本、其余→vendor pandoc 3.10.1。**旧版 Office 硬拒;扫描件无文本层直接失败——没有 OCR**。多栏 PDF 经 `-layout` 抽出的表格是错位文本流,下游**零数字校验**。无 Elicit 式按字段抽取、无 per-cell 溯源 |
| **⑤ 分析 / 统计** | 🟡 → 线上近 ❌ | 🔴 **已部署镜像里只有 numpy/pandas/matplotlib/rdkit/openpyxl/python-docx**;statsmodels/sklearn/lifelines/显式 scipy 那一层**未提交**。而 `guides/methods-stats/SKILL.md:34` **在 HEAD 就已经声称"claw 能用 python(statsmodels)真算"**。且 skill 走 bind mount(`:ro`,改了不用 rebuild)、Dockerfile 走镜像层(必须 rebuild)⇒ **宣称面会先于能力面上线**。无 R、无 pip、**无任何 meta 分析库**(metafor/PythonMeta 都不在)。能跑 Bash 的只有 claw 与 sci_draw;**peerreview 审稿人被禁 Bash,无法重算稿件里任何统计量**;**prism 的 Bash 是 DOA**(见下) |
| **⑥ 可视化** | ✅ **最扎实的一环** | 三车道:charts=matplotlib 出 SVG、molecules=RDKit 确定性渲染(解析失败即报错不硬画)、figures=模型只出配方 JSON 坐标交给确定性渲染器。**但 charts 明写"不做统计推断、不发明数字"**——森林图/KM 是把已算好的数画出来(ROC 例外,允许从 `(score,label)` 现算) |
| **⑦ 成文** | 🟡 | prism 有真 LaTeX 编译沙箱(`prism_tex`,双层禁 shell-escape + `network_mode:none`)、DB struct 真源、`quality.go:26-41` 的**确定性**质量回执(悬空 `[@cite]` / 未定义交叉引用 / 骨架节 / TODO 哨兵 / 缩写一致性 / **摘要数字 ⊆ 正文数字对账** / 术语变体)。31 lens + 14 人格。**但官方能力矩阵自评 54 项任务 ✅8 / 🟡21 / ❌24 / ⚠️1**:全篇中译英、项目级术语表、修改意见回应信、latexdiff 标红、投稿材料包全部 ❌。**无大纲阶段** |
| **⑧ 自查** | 🟡 → 上线后可能变 ❌ | 线上:HonestyGuard(DOI 级)在 claw/prism 开、**会注入纠偏轮**;smart_search/peerreview/sci_draw/boltslides 没开。工作区:降级为纯观测。交付闸只查 `count>0` 不查内容;三条 guard 只管形态;**"有标题有作者没 DOI"的伪题录两道都漏** |

### 三条必须单独点名的实现缺陷

**🔴 prism 的 Bash 是半接线的 DOA。** 2026-08-01 在 `prismSessionOptions` 里把 `allowBash` 改 true
(执行器侧工具面已出现 Bash),但 `FeatureSpec` **没有设 `AllowBash` 字段**(零值 false)
⇒ `specDeny()`(`agentbridge/spec.go:255-262`)仍把 Bash 三件套塞进 denyTools
⇒ `hub.go:1329` 每次 permission_request 都被 `ws.go:301` 的 denylist 直接拒。
**模型会看到 Bash、调用、然后收到"该操作未获授权"。**
这不是一个 bug,它是本仓库反复复发的同一类架构缺陷(跨层单边修复)——
而 `permissionParity.test.ts` 恰恰是 pre-push 唯一跑的两个测试之一,**却没拦住它**。

**🔴 `statsEngines.ts` 是零消费者的启动探针。** 它用**与生产同一条 argv 路径**去探测三个库能否真 import
(因为"Dockerfile 装上了"≠"jail 里能 import",2026-07-21 `libblas.so.3` 事故就是这么漏的)——
设计正确。但 `grep engineSupported` 全仓只有它自身与 `index.ts:99` 的一句注释,
`probeStatsEngines()` 在 `index.ts:101` fire-and-forget,**结果无任何读者**。
它承诺要修的失败模式(模型被告知有 statsmodels、jail 里没有、于是编数)一个字都没修。
本仓库自己命名过这个模式:**"引擎造好没接线"**。

**🔴 sci_draw / boltslides 未配 `AllowedMcpTools`。** 执行器语义是"空 = 不限制"
(`agent/client.go:143`)⇒ 76 个 minicod 工具全量灌进每轮 tools[](估 15-25K token/轮,破坏前缀缓存)。
后果不止浪费:Router 的 `hasRetrieval` 恒真 ⇒ 它们又有 Write/Bash(WRITE_CAPABLE)
⇒ 用户说"做个关于 XX 研究进展的 PPT"就会进取证轮、被引擎预检索一枪,
且 `SubmitAnswer` 进 tools[] ⇒ **模型可以交一段散文就 break 整轮,一个 deck 都不建。**

---

## 八、能力缺口排序(实际影响 ÷ 实现成本)

排序口径:对科研能力的实际影响 ÷ 实现成本。每条给具体改法(落到文件)、成本量级、风险。

| # | 缺口 | 影响 | 改法(文件) | 成本 | 风险 |
|---|---|---|---|---|---|
| **1** | **snippet 正文被账本丢弃** —— 全仓唯一已存在的 chunk 级接地入口被自己关掉 | 把"证据粒度"这一格从 0 拉到 0.5,直接对上 PaperQA2/OpenScholar 那条轴 | `evidence/parse.ts` `normalizePaper` 加两个提取键(`text`/`section`)+ `ParsedPaper` 加 `snippet` 字段 + `render.ts` 的 `renderRow`/`renderRecordMd` 显式区分"摘要"与"原文片段" | **小时级** | 低。digest 体积会涨,需与 `DIGEST_MAX_CHARS=6000` 一起调 |
| **2** | **对话路径零引用校验** —— A11 在使用量最大的路径上不在场 | smart_search 的唯一产物形态获得与文件交付同级的保护 | 把 `expandCitations` 接到 `turnLoop.ts:917` SubmitAnswer 的 `delivered` 文本上(一个调用点) | **小时级** | 中。要先决定聊天里 `[[E7]]` 展开成什么形态;**今天模型若照契约写句柄,用户会看到字面量 `[[E7]]`** —— 这已经是一条在产的破输出 |
| **3** | **账本可被模型伪造(B6)** —— 抽空 A9 与 A11 两条最硬保证的前提 | 让"E 编号不可铸造"从散文变成代码 | `sandbox/confine.ts` 加 `evidence/` 前缀拒写(Write/Edit/Bash 三条路径共用同一个 confine),或把账本挪到 workDir 之外的 sibling 目录 | **小时级** | 低。要同步改 `ledger.ts` 的 `dirOf` 与 GC 的 TTL 口径 |
| **4** | **prism Bash DOA** + **statsEngines 零消费者** + **sci_draw/boltslides 无 MCP 白名单** | 三条都是"造好没接线",各自一行到几行 | ① `prism/spec.go` FeatureSpec 加 `AllowBash: true`;② `engineSupported` 接到 skill 注入或方法候选表;③ 两个 spec 补 `AllowedMcpTools` | **小时级 ×3** | 低。但 ① 必须同时查 `permissionParity.test.ts` **为什么没抓到**(见 §十) |
| **5** | **成本归一削弱贵模型 2.9x**(§4.3) | 解开模型 A/B 的头号混杂因子;让 pin 了 pro 的付费用户不再被静默削预算 | `agentbridge/hub.go:675-690` `stampTurnBudget`:改成按 token 归一(或至少对 pin 场景不折算) | **天级** | **中高**:这是真实成本闸,改宽了直接烧钱。需要与计费口径一起设计 |
| **6** | **迭代深化不存在**(预检索一会话一次 + `ledger_grounded` 让全会话降级) | 从"首轮机制"变成"全程机制"。**这是当前设计最大的单点洞** | `researchTurn.ts:82` 的 `ledger_grounded` 判据从 `ledgerTotal>0` 改成**覆盖度判据**;`prefetch.ts:123` 的 `shouldPrefetch` 同步。**分母已经采集了**:`QueryRecord.total_upstream`(`ledger.ts:83`)是"上游命中总数",已渲进 digest 给模型看,只是没人拿它当闸 | **天级** | 中。要防"每轮都预检索"的成本爆炸;需要一个"本轮问题与账本主题是否相关"的判据,而这个判据不能是 LLM(否则回到自觉) |
| **7** | **无计划阶段 / 计划不可见** | 让"漏掉整个子领域"从不可见变成用户可发现;为后续所有编排改造提供挂载点 | 抄 `prism/planner.go:92` 的形态:取证轮开头跑一次**受限**规划(只输出 3-6 个检索面 + 每面 1 个检索式的 JSON),落进账本的一个新 `op:"plan"` 行,digest 每轮回注"计划 vs 已覆盖面" | **周级** | 中。多一次 LLM 往返(延迟,见 §九);计划漂移;`tool_choice` 不支持 ⇒ 只能靠 JSON schema + `chatWithRetry` 式有界重试(peerreview 已有现成实现) |
| **8** | **无全文获取** | 从"摘要级"跨到"全文级",④⑤⑧ 三个环节同时提级 | 两条路:(a) 写一个 `FetchOA` 工具走已有的开放 Bash jail(`pdf_url` 已在模型视野里),(b) 走 executor 侧不过上下文的 `FetchCorpus`(落盘 JSONL) | **周级** | **高**:SSRF 面、法务(非 OA 的抓取)、`bashEnv` 白名单要不要开(今天刻意不给模型 minicod key)、账本要新增 `has_fulltext=true` 的写入口 |
| **9** | **系统综述全链条** | 占住科研流程里最耗人力的一段(Elicit 的地盘) | **仓内已有一份可直接开工的设计**:`docs/claw-capability-research-2026-07/agent-plans/02-sys-review-agent-plan.md`(feature_key=`sys_review`,~780 行 Go thin feature + 烧进镜像的 `/opt/sysrev-engine` 纯 Python 7 模块 ~2500 行;核心判据写死"所有数字由确定性引擎算出,LLM 永不亲手产 DOI、永不亲手算统计量,排除定论只能来自用户")。落地状态**为零**(grep `sys_review` 全仓零命中) | **月级** | 高。但它是唯一一条能同时解 ②③④⑤ 四格的路,且方案已定稿 |
| **10** | **无并行子代理** | 上下文隔离 + 提速 | — | 月级 | **高,且当前不建议**:15x token 之外,子代理会重新制造"证据生命周期比对话短";且并发容量今天已是硬约束(§九) |

**刻意排在后面的**:换 graph 框架(我们要的 checkpoint 已在 peerreview 拿到)、
ToT/LATS(value function 在科研任务里不可靠)、加 reflection(已被自己和 ICLR 证伪)。

---

## 九、如果只做三件事

### 第一件:**先把这批改动的账算清,再谈上线**(必做,零新功能)

不是加功能,是止损。三个子项:

1. **verifyClaims 降级的净效果核算**。线上 HEAD 是活的纠偏,这批改动拆掉它。
   拆之前必须确认新闸的覆盖面**真的更大** —— 而按 §三,新闸在对话路径为 0、在 peerreview 为 0、
   在会话第二轮之后为 0。**目前看是净变弱。**
2. **一个跨层契约违规已经在等着**:`MessageTurn.tsx:349` 渲染的信任标签
   `turn.complete && turn.claimAudited`,其唯一来源是 `fold.ts:187` 的
   `msg.claim_audit?.corrective_fired`(prism/smart-search 三份镜像同构)。
   降级后该字段**恒 false** ⇒ **上线当天这枚标签在三个 feature 里同时永久消失,零告警。**
   这正是本仓库自己的铁律"跨层扩面先查下游契约 / fold 有四份"的又一次复发。
3. **回归防线只接了 2/26**。`find agent -name "*.test.ts"` = 26;无 CI;`agent/Dockerfile` 不跑测试;
   唯一自动执行点是 `.githooks/pre-push` 的 `scripts/check-evidence-mirror.sh`,
   而它 `:60-63` 的 `TESTS_REL` **只列了两个文件**。`ledger.test.ts` / `deliveryGate.test.ts` /
   `researchTurn.test.ts` / `prefetch.test.ts` 等 24 个从不运行。
   按本仓库自己的口径:**24 条从不运行的规则 = 24 条不存在的规则。**

**为什么是它而不是别的**:这批改动是我们对科研能力最大的一次投入,如果带着"净变弱 + 前端静默失效 +
无回归防线"上线,后面所有判断都会建立在污染的观测上。**成本以天计,收益是让后面每一步都可信。**

### 第二件:**把证据从"题录"拉到"片段",把闸从"文件"拉到"对话"**(缺口 1+2+3 打包)

三条都是小时级,而且互相咬合:

- 缺口 1(snippet 入账)把账本的**内容**变富 —— 今天账本比上下文还穷,与 `ledger.ts` 文件头
  自述的"账本必须比上下文富"正好相反
- 缺口 2(对话路径接展开)把闸的**覆盖面**从最小的路径挪到最大的路径
- 缺口 3(confine 拒写 evidence/)把闸的**前提**从散文变成代码

**为什么是它而不是"上更强的模型"**:§4.2 已证明模型档位的方差被编排项支配,
而 §4.3 证明我们的编排还在反向惩罚贵模型。在修好 `stampTurnBudget` 之前,换模型是在测预算。
**为什么不是"上并行子代理"**:15x token 之外,它会重新制造我们刚修的那个根因;
而这三条是在**加固**同一个根因的修复。

### 第三件:**给取证轮加一个可见的检索计划 + 把闸的判据从"计数"换成"覆盖度"**(缺口 6+7)

这是唯一一件"周级"的事,但它是**科研能力**(而不是可靠性)的真正杠杆:

- 计划抄 `prism/planner.go:92` 的现成形态,用 peerreview 的 `chatWithRetry` 做 schema 有界重试
  (`tool_choice` 不可用,这是唯一可行的强制手段)
- 覆盖度的**分母已经在账本里**(`QueryRecord.total_upstream`,已渲进 digest),
  缺的只是一个判据,不是数据管线
- 计划落进账本的一个新 `op` 行 ⇒ 顺手补上"**还缺什么**"这条今天的死数据
  (`DeclareInsufficient` 的 `missing` 全仓无读取点)

**为什么是它而不是"做系统综述工作台"**:sys_review 方案(缺口 9)更值钱但是月级,
且它依赖全文获取(缺口 8)先落地。而计划+覆盖度是**在现有架构内**、不动主循环形态、
能立刻改善所有取证轮的一刀。

**为什么不是"转 graph"**:见 §十的一句话回答。

---

## 十、不确定性与未确认项

### 已确认但需要生产复算的(dev 库口径,方向大概率不变,数值不可引用)

1. **会话长度分布**。dev 库 70 会话:**53% 是单轮**,最长 13 轮,均轮数 claw 2.3 / smart_search 2.9 /
   prism 1.8 / sci_draw 1.5。
   ⇒ 这直接冲击"跨轮跨会话状态丢失"这类 critical 叙事(第 15 轮被 compact 压掉、隔天回来降级上下文、
   第 5 轮对第 2 轮失忆)——**在观测数据里基本不发生**。真正高频的是**单轮内 24 个工具轮**。
   本报告的排序已按此调整(缺口 6/7 = 单轮内取证深度,排在跨会话记忆之前)。
   **必须用线上 journal 复算后再定案。**
2. **轮时长与并发容量**。dev 库 150 轮:加权均值 **51.1s/轮**;sci_draw 均值 **145.6s**、最大 456s。
   而 `admission.ts:14` `MAX_CONCURRENT_TURNS=2`、`:34` 满即拒**不排队**(M/M/2 损失系统)。
   Erlang-B 代入:全站 **≈27 轮/小时**时已有 5% 用户被硬拒;流量偏 sci_draw 时天花板掉到 **≈9 轮/小时**。
   ⇒ **"并行子代理""迭代深化""多轮取证"每一条都在延长轮长,而轮长是容量的分母。**
   本报告在缺口 6/7/10 的成本栏已带上这一条,但**线上真实分布未验证**。
3. **满槽时用户看到一句假话**。`ws.ts:371` 槽满回 `error{code:"busy"}`,但
   `useAgentSocket.ts:411-413` 只认 `code==='busy'` 就 return,**message 被整条丢弃**;
   四个消费点一律 toast「正在回答中,请稍候再发」。
   ⇒ **别人占满了全站两个槽 → 你的消息被丢 → 你看到"你自己正在回答中"。** 不排队、不自动重试。
   `useClawConversation.ts:375` 的注释只考虑了同连接 inFlight 这个自伤场景。

### 明确的未确认项(不要当结论用)

1. **`permissionParity.test.ts` 在场却没抓住 prism 的 Bash 单边放开** ——
   是守卫覆盖面不够,还是它从未在那次改动后被跑过(无 CI,pre-push 需手工装钩子)?**必须查清**,
   因为这决定了缺口 4 是"改一行"还是"守卫本身要重做"。
2. **线上真实 busy 拒绝率算不出来**。前端把 message 丢了、后端也不区分两种 busy 来源
   (同连接 inFlight vs 全站槽满)⇒ **这个指标今天在任何一层都不可得**,得先加字段。
3. **agent 侧零计时埋点**。`grep "Date.now()\|performance.now" agent/src/turn/turnLoop.ts
   agent/src/server/ws.ts` 零命中;`agent/src/obs/` 只有 28 行 `log.ts`;
   `llm_token_usage` 16 列全是 token/成本无耗时列。
   ⇒ 首 token 延迟、单次 LLM call 耗时、单工具耗时**今天一个读数都没有**。
   "预检索不阻塞本轮""省一次 LLM 往返"这类性能论断**结构上无法验证**。
   (预检索 `timeout=8000ms` 且是 `await`、位置在第一次 LLM call 之前 ⇒
   **用户可能多等最多 8 秒才看到第一个字**,这是推算不是实测。)
4. **提示词注入 / 检索内容可信度:零覆盖,且我们自己证明了通道可用。**
   `grep -rni "injection|untrusted|不可信" agent/src/mcp/ agent/src/turn/runTools.ts` 零命中。
   `sanitizeMinicod.ts` 做了字段截断、控制符剔除、spam 剔除,但**没有一处处理"工具结果正文里的祈使句"**。
   而摘要/标题是任何人都能写进预印本的攻击者可控文本,它们与我们自己的 `coverage_note`
   走**同一个 JSON、同一个 tool_result 块** —— COVERAGE_NOTE 的设计前提就是"模型会服从工具结果里的指令"。
   我只证明了通道无防护,**没证明会被服从**(需要一次真实构造实验)。
5. **`research_state` 帧的消费者**:前端**是**读的(`fold.ts:151-163` 折进 `current.research` 渲染 chip),
   但没有任何运维 SQL / 看板 / 告警。准确说法是"有前端消费、无运维消费"。
   且 Router 的**唯一危险方向**(该 evidence 判成 chat)在 journal 里**结构性不可见** ——
   `turnLoop.ts:961` 的发帧门槛是 `st.total>0 || turnQueries>0 || phase==='evidence'`,
   而危险样本(判 chat + 账本空 + 零检索)正好全落在不发帧的集合里。
6. **中文估算器**:`context-budget.ts:14` 的 `CHARS_PER_TOKEN=2.6` 对 CJK 估少约 3 倍,
   注释自述的方向与代码相反。今天被 1M 窗吸收 ⇒ "240h 零压缩"**有可能不是"从未接近墙",
   而是"估算器长期低估、墙从未被看见"**。可证伪,未证伪。
7. **minicod 是否透传 PubMed 原始 query 串**(Boolean+MeSH)。若不透传,SR 的"可复现检索式"
   连原则上都做不到,而不只是"没有产物"。minicod 是外部服务,`backend/internal/minicod/client.go`
   只是转发,仓内看不到。
8. **`runPrefetch` 调用块在 `runTurn` 的 try/finally 之外**(`turnLoop.ts:253-285` vs `:425-995`)。
   `prefetchOn()`/`buildPrefetchQuery`/`sink.frame(:275)` 都不在任何 try 里。
   任一处抛出会绕过终帧守卫,而 `turnLoop.ts:370` 自己写明"turn 退出时必有终帧,否则整个会话卡 busy 锁死"。
   同函数里的 `ledgerStats` 与 `buildDigest` 都各自包了 try/catch。**这是结构性风险,不是已发生事故。**

### 对外/对上叙述的红线

**`frontend-user/src/features/landing/data/landings.ts:558-564`(HEAD 版同样存在,活路由
`/features/library`)写着**:「PRISMA 流程友好:从多个学术数据库批量导入,去重、筛选、纳排标准
全部可追溯。Prism 智能体协助做证据矩阵抽取」,bullets 三条是「PRISMA 流程图自动生成」
「AI 抽取:人群·干预·结局」「双人独立筛选 + 冲突解决」。

**这三条功能在代码里一条都不存在。** 同页 `:964-967` 还挂着 32,000+ 研究者 / 1.2M 已索引文献 /
94% 综述提速 / <3% 幻觉率 四个无来源数字。

这是当前**已上线、对外**的最危险宣称错位,优先级高于任何架构讨论。

---

## 附:一句话回答"我们要不要转 graph 架构"

**不要。** graph 的真实卖点是 durable execution(checkpoint / 故障恢复 / HITL),
而我们要的那一格 **peerreview 已经拿到了**(`service.go:1702-1723` 阶段级 gap-fill 续跑);
把它移植到长产出场景的成本,远低于把整个 turnLoop 改写成节点图,而收益是同一份。
**我们缺的不是状态机基建 —— 我们有一台不小的确定性状态机,它只是没有一格是给"研究该怎么做"用的。**
