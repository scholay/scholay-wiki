# tools / skills 的加载是否合理 · 长上下文下的工具与技能幻觉

> 2026-08-08 · 全部数字来自**实测**:① 在生产同镜像的 `scholar_agent` 容器内直接调
> `mcpAnthropicTools()` / `builtinRegistry` / `toolPermitted()` / `loadAddDirContext()` 逐 feature 构面并数字节;
> ② 线上只读 SQL(`agent_turn_events` 全量 12,977 条 `tool_use`)+ `docker logs scholar_backend`。
> 复跑命令见 §八。**没有一条结论来自推导**;推测的地方全部显式标「未验证」。

---

## 〇 一句话

**工具的「收敛机制」是对的,但它是一张需要人工维护的名单,而名单已经漂了三处;
skills 的「常驻 + 按需」两层设计是对的,但两层的 frontmatter 处理口径不一致,
这个不一致本身正在生产里制造技能幻觉。**

三条实锤,每条都在**今天的生产上仍在发生**:

| # | 事实 | 实测证据 |
|---|---|---|
| 1 | **sci_draw / boltslides / stat_lab 三个 feature 从未配 MCP 白名单** ⇒ 每轮把 minicod 全部 **76 个文献检索工具**发给模型。sci_draw 冷启动首轮固定前缀 = **43,000 tokens**,而它 61 次工具调用里 **MCP 调用 0 次** | 容器内构面 `tools=92 / chars=142,378`;线上 `calls[0].input_tokens` 冷起轮 11 次落在 42,154–43,411 |
| 2 | **prism 每轮把 Bash 摆进 tools[],而 backend 100% 拒绝它** —— `AllowBash` 这个「单一真源」只改了两个消费者中的一个 | 线上 `permission denied: Bash` 在 prism 上 2026-08-02 起**每天都有**,至 08-07 未停 |
| 3 | **常驻 skill 的 YAML frontmatter 原样进 system**(按需 guides 却被剥掉)⇒ 模型读到 `name: figures`、`allowed-tools: … MultiEdit` 这些**它调不到的东西**,照着调,必然失败 | 线上 `Skill{name:"figures"}` ×3 全部 `isError=true`;`MultiEdit` ×4 全部 `unknown tool: MultiEdit` |

对用户原问的直接回答:

- **「加载 tools 合理吗?」** 机制合理(正向白名单 + 双向二道墙 + 帽),**配置不合理** —— 三个 feature 漏配白名单,一个 feature 的能力开关半改。
- **「上下文过长会不会出现工具/skills 幻觉?」** 会,但**主因不是长上下文**。压缩层**从不碰** system 与 tools 定义(逐行核对见 §三),所以「工具定义被削掉」这条路在代码上不存在。线上 13 次工具名幻觉 + 5 次技能名幻觉里,**能归因到长上下文的只是「更容易发生」的弱相关(n=9,中位数落在 p72)**,而能归因到**我们自己把不存在的东西写进 system**的是硬因果。

---

## 一 每轮实际发给模型的 tools:实测数字

### 1.1 组装路径(只有一条)

```
turnLoop.ts:178   const allTools = await buildTools(input)
                        └── toAnthropicTools.ts:9-25
                              ├── mcpAnthropicTools()  ← minicod stdio,恒 76 个
                              └── builtinRegistry      ← registry.ts:1786,恒 17 个
                              两者都只过一道 toolPermitted()(policy/featurePolicy.ts:10-25)
turnLoop.ts:183   const tools = allTools.filter(t => !ORCHESTRATION_TOOLS.has(t.name))
                        ORCHESTRATION_TOOLS = {SubmitAnswer, DeclareInsufficient}(policy/researchTurn.ts:32)
turnLoop.ts:307   let activeTools = turnTools     ← 轮开始冻结,轮内不再变形
turnLoop.ts:514   client.messages.stream({ …, tools: activeTools })
```

`toolPermitted` 的三条规则(featurePolicy.ts:12-23):
① denylist 命中即拒;② `Bash` 需 `allowBash`;③ MCP 走**正向白名单**,`allowedMcpTools` **为空则不限制**(向后兼容)。
第 ③ 条的「空 = 全放」正是 §1.3 那三个 feature 的漏点。

### 1.2 实测:每个 feature 的工具面

容器内真实构面(`docker exec scholar_agent bun /tmp/probe.ts`,MCP 从真实 stdio server 拉,含品牌遮蔽后的最终字节):

| feature | 工具数 | MCP | builtin | tools JSON 字节 | 线上实测固定前缀下界(tokens) |
|---|---:|---:|---:|---:|---:|
| peerreview | 28 | 13 | 15 | 41,673 | —(server-side,无 first-call 样本口径) |
| smart_search | 28 | 18 | 10 | 50,218 | **≥ 18,827** |
| prism | 33 | 17 | 16 | 51,458 | **≥ 15,077** |
| claw | 39 | 22 | 17 | 60,637 | **≥ 16,615** |
| **boltslides** | **91** | **76** | 15 | **142,117** | **≈ 41,000**(冷起 40,623 / 41,326) |
| **sci_draw** | **92** | **76** | 16 | **142,378** | **≈ 43,000**(冷起 11 次:42,154…43,411) |
| **stat_lab** | **92** | **76** | 16 | **142,471** | 无生产样本(尚未放量) |
| *(不配白名单的理论上限)* | *93* | *76* | *17* | *143,265* | — |

> 「固定前缀下界」= 线上 `message_complete.payload.calls[0].input_tokens` 的**最小值**(>500 过滤掉错误轮)。
> 首个 call 必含 system + tools + 至少一条 user 消息,所以这个最小值是 system+tools 的**实测下界**,不是估算。
> sci_draw 的 11 个冷启动样本(`cache_read_tokens` = 0 或 43)方差极小(42,154–43,411,极差 1,257 ≈ 2.9%),
> 这就是它固定前缀的真值。
>
> 由 sci_draw 反推的换算率:142,378 字节 tools ÷(43,000 − skills 9,656 字节 − sci_draw 系统提示)
> ≈ **3.9 字节/token**。引擎自己的 `estimateTokens` 用 2.6(context-budget.ts:15),**偏保守约 1.5 倍**,
> 是刻意的(注释:「偏保守,宁可早触发」)。本文凡出现 token 估算一律注明口径。

### 1.3 🔴 缺陷 A:三个 feature 从未配 MCP 白名单

`AllowedMcpTools` 的四个已配值(去 `mcp__minicod__` 前缀):

| feature | 白名单条数 | 位置 |
|---|---:|---|
| smart_search | 18 | `backend/internal/smartsearch/spec.go:142` |
| claw | 22 | `backend/internal/claw/spec.go:154` |
| prism | 17 | `backend/internal/prism/spec.go:53` |
| peerreview | 13 | `backend/internal/peerreview/service.go:2032` |
| **boltslides** | **无** | `backend/internal/boltslides/spec.go:135-145` 只有 `DisallowedTools` + `AddDirs` |
| **sci_draw** | **无** | `backend/internal/scidraw/spec.go:140-150` 同上 |
| **stat_lab** | **无** | `backend/internal/statlab/spec.go:160-170` 同上 |

smart_search 的注释(smartsearch/spec.go:137-141)把这件事写得清清楚楚:

> 「minicod 0.4.1 暴露 76 个工具(含 28 个 OpenAlex 实体、5 个高校、期刊投稿/评论/时间线等),
> 不收敛会灌满每轮 tools[](≈15-25K tokens)且全自动批准」

—— 三个 2026-07 之后新增的 feature 一个都没跟上。代价实测:

- **sci_draw:61 次工具调用,MCP 调用 0 次**(线上 GROUP BY),却每轮为 76 个检索工具付 ~36,800 tokens。
- **boltslides:20 次工具调用,MCP 调用 0 次**,同样每轮付 ~36,700 tokens。
- 对比配了白名单的 claw:固定前缀 16,615 tokens。**sci_draw 是它的 2.6 倍**,多出来的部分 100% 是死重。

这不只是钱的问题。76 个工具里有 28 个 OpenAlex 实体工具(`search_openalex_concepts` /
`batch_openalex_funders` / `group_openalex_institutions` …)+ 5 个高校工具,对「画一张信号通路图」
或「做一份 PPT」而言是纯噪音,**而它们和真正该用的 3 个工具在 schema 里长得一模一样**。
这正是选择退化(tool selection degradation)的教科书条件。

### 1.4 🔴 缺陷 B:denylist 模式漂移 —— smart_search 拿到了 StatRun / StatReport / BuildDeck

`smartSearchDisallowedTools`(smartsearch/spec.go:129-136)写着:

```go
"Write", "Edit", "MultiEdit", "NotebookEdit", "Glob", "Grep", "LS", "ExportDocument",
"WebFetch", "WebSearch", "Task", "Agent", "Skill",
```

注释还专门解释过防御性列举的意图(spec.go:124-126):
「MultiEdit/NotebookEdit/LS/WebFetch/WebSearch/Task/Agent 当前不在 registry,列出是防御性兜底:
**一旦将来 registry 新增,smart_search 仍默认锁死,不必回来补**」。

问题是:这个防御只对**当时想得到的名字**有效。2026-08 新增的三个 builtin —— `StatRun`(4,871 字节,
全 registry 最大的一个)、`StatReport`(1,029)、`BuildDeck`(793)—— 名字不在名单里,
于是**默认可见**。实测 smart_search 的 26 个默认工具里就有这三个,合计 6,693 字节 ≈ **1,700 tokens/轮**,
灌给一个自称「纯只读检索」的 feature。

且 backend 侧 `permissionAllowed`(agentbridge/ws.go:387、400)对 `StatRun` / `StatReport`
是**全 feature 无条件放行**的 —— 也就是说 smart_search 不但看得到,还真能跑统计引擎。

> **诚实边界**:线上 `tool_use` 全量里 `StatRun` / `StatReport` 出现 **0 次**(stat_lab 尚未放量),
> 所以这是**已成立的暴露面 + 已发生的 token 浪费**,不是已发生的事故。

同族对照(说明这确实是「漏补」而非有意):`MultiEdit` 被 stat_lab / boltslides / sci_draw
三个 denylist 都显式禁了,**唯独 prism 的 `prismDisallowedTools`(prism/spec.go:48)没禁** ——
而 prism 的常驻 system 里恰好写着 `allowed-tools: … MultiEdit`(见 §四.2)。

### 1.5 🔴 缺陷 C:prism 的 `AllowBash` 只改了一半 —— 摆出来的 Bash 后端 100% 拒绝

`AllowBash` 在 `agentbridge/spec.go:258-268` 被明确定义为**单一真源**,有两个消费者:

1. **agent 端可见性**:`SessionDisallowedTools(base, allowBash)`(spec.go:326-338)决定 Bash 进不进 `--disallowed-tools`;
2. **backend 权限门**:`specDeny(spec)`(spec.go:287-300)据 `spec.AllowBash` 决定 denylist 补不补 Bash 三件套,
   经 `hub.go:1347 → decidePermission(data, workDir, specDeny(f.spec))` 生效。

2026-08-01「拍板放开 prism 的 Bash」只改了消费者 ①:

```go
// backend/internal/prism/spec.go:103
DisallowedTools: agentbridge.SessionDisallowedTools(prismDisallowedTools, true),   // ← allowBash=true
```

而消费者 ② 所读的 `FeatureSpec.AllowBash` **在 prism 的 BuildSpec 里根本没有这个字段**
(prism/spec.go:200-224 逐行比对;claw 在 claw/spec.go:235 写着 `AllowBash: true`)⇒ 取 Go 零值 `false`
⇒ `specDeny` 补上 `Bash/BashOutput/KillShell` ⇒ **backend 拒绝 prism 的每一次 Bash**。

净效果:模型每轮都看见 Bash 在工具列表里 → 决定用它 → `toolPermitted` 放行(agent 侧确实允许)
→ 发 `permission_request` → backend 顶部 denylist 命中 → 回 `allowed:false`
→ 模型拿到 `permission denied: Bash`。

线上实证(`agent_turn_events` 关联 tool_use↔tool_result,按天):

```
2026-08-02  prism  permission denied: Bash  ×1
2026-08-03  prism                            ×3
2026-08-04  prism                            ×2
2026-08-05  prism                            ×2
2026-08-06  prism                            ×2
2026-08-07  prism                            ×1
```

加上 `feature_key IS NULL`(会话行已被 reset/删除)的同期同文案 10 条。
另有 4 条更老的 `tool not permitted: Bash`(agent 侧拦的,即 08-01 之前的正确状态)——
**两种文案的分界正好落在改动日**,这是因果的时间戳证据。

`docker logs scholar_backend`(窗口 2026-08-05 起)侧的对应:12 条 `permission denied (guard enforced)`,
其中 8 条 `tool=Bash`,涉及的 session 反查 `agent_sessions` = **prism 5 个** / claw 3 个
(claw 那 3 条是 Write / Edit / ReadDocument 的路径越界,属护栏正常工作)。

---

## 二 skills:常驻 vs 按需,加载时机,会不会累积

### 2.1 两层结构(设计是对的)

`agent/src/skills/loader.ts` 的 `loadAddDirContext(addDirs)`:

| 层 | 来源 | 进 system? | 帽 |
|---|---|---|---|
| 项目规则 | `<addDir>/CLAUDE.md` | ✅ 常驻全文 | `PER_SKILL_CAP=12000` / `TOTAL_CAP=40000`(loader.ts:30-31) |
| 常驻 skill | `<addDir>/.claude/skills/*/SKILL.md` | ✅ 常驻全文 | 同上 |
| 按需 guides | `<addDir>/guides/*/SKILL.md` | ❌ **只进一行菜单** | 菜单 `MENU_CAP_CHARS=2500`(loader.ts:76) |

按需层的正文由模型经 `Skill` 工具按名加载(registry.ts:1060-1085),返回体
`stripFrontmatter` + `capSkillBody`(上限 16,000 字符,registry.ts:1035)。

**加载时机**:每轮 `turnLoop.ts:215` 调 `loadAddDirContext`,但该函数有**有界 LRU 缓存**
(loader.ts:151-152,`ADDDIR_CACHE_CAP=256`,键 = `addDirs.join("|")`),
挂载是 `:ro` 且容器内不变 ⇒ 首轮读一次,后续零 IO,内容逐字节稳定。

**会不会随轮次累积**:❌ **不会**。skillCtx 是 system 的一部分,每轮重算但结果恒等
(turnLoop.ts:216-219 的 `baseSystem` 拼装顺序固定)⇒ 跨轮 byte-stable ⇒ 上游隐式前缀缓存命中。
线上佐证:sci_draw 非冷起轮 `calls[0].cache_read_tokens` = 42,752 / 50,816 / 54,912 / 57,084 —— 前缀确实被缓存了。

### 2.2 实测:每个 feature 的常驻 skill 体积

容器内直接调 `loadAddDirContext`:

| feature | addDir | `.claude/skills` 份数 | `guides` 份数 | 常驻 system 后缀字节 | 菜单行数/字节 |
|---|---|---:|---:|---:|---|
| claw | `/claw-add` | 1 | 6 | 3,293 | 6 / 453 |
| prism | `/prism-add` | 4 | 31 | 9,858 | 31 / 1,306 |
| smart_search | `/smart-search-add` | 2 | **0** | 3,991 | 0 |
| boltslides | `/bolt-slides-add` | 1 | **0** | 10,623 | 0 |
| sci_draw | `/sci-draw-add` | 3 | **0** | 9,656 | 0 |
| stat_lab | `/stat-lab-add` | 2 | **0** | 11,787 | 0 |
| **peerreview** | `/peerreview-add` | **目录不存在** | 0 | **0** | 0 |

peerreview 的 0 是**刻意的**(docker-compose.yml:417-434 有整段说明:该挂载 2026-08 被删,
理由是 33 份 / 132KB 远超 `TOTAL_CAP=40000`,`.sort()` 会在第 12 个目录处静默截断,
「配了却只生效三分之一」比「没配」更难发现)。评分轮的 persona 改由 backend 按 slug 直接注入。
**这一项是正确处理,不是缺陷。**

菜单帽实测未触及(prism 31 条只用了 1,306 / 2,500),`skill_menu_built` 日志 `dropped=0`。

### 2.3 skill 市场(per-user)路径核实

`materializeSessionSkills`(agent/src/server/sessions.ts:54-89):backend 下发的用户 skill
被物化到 `<workDir>.skills/guides/<name>/SKILL.md` —— **只走 guides 按需层,绝不写 `.claude/skills`**
(注释 sessions.ts:53 明写),上限 5 份、每份 `MAX_SKILL_MD_BYTES`、名字过 `SKILL_NAME_RE`、
物化前 `rm -rf guides/` 全量替换。**这条路径设计干净,没有发现问题。**

---

## 三 压缩会不会削掉 tools 定义或 skill 说明?逐层核对

### 3.1 结论:tools 与 system **一个字节都不会被压缩**

三处压缩入口,全部只接受并只返回 `messages`:

| 入口 | 位置 | 入参 | 是否触及 system/tools |
|---|---|---|---|
| 主动压缩 | `server/ws.ts:279-317` `maybeReduceContext` | `meta.messages` | ❌ |
| 反应式压缩(溢出后重试) | `turn/turnLoop.ts:641-647` | `messages` | ❌ |
| 硬窗口兜底 | `turn/window.ts:24-35` `windowMessages` | `messages` | ❌ |

`reduceForWindow`(compact.ts:333-401)的三层降级全部在 `messages` 上:
① `pruneOldToolResults` ② 滚动摘要 ③ `keepRecentByTokenBudget`。
它甚至**显式为固定前缀让出空间**(compact.ts:347-350):

```ts
const overhead = Math.max(0, current - estMsgs);   // 固定前缀(system + tools schema)+ 估算误差
const msgTarget = Math.max(0, target - overhead);
```

⇒ **「模型忘了有某个工具是因为工具定义被压缩掉了」这条假设,在代码上不成立。**

### 3.2 但**已加载的 skill 正文**会被削掉 —— 而菜单还挂着

这是「skill 幻觉」真正的结构性来源,且**与上下文长度直接相关**:

```
turn 3   Skill({name:"wl-structure"})  → tool_result 正文最多 16,000 字符进 messages
   ↓
turn 3+25 之后(EXECUTOR_WINDOW_KEEP_TURNS 默认 25,ws.ts:29 / turnLoop.ts:389)
   pruneOldToolResults(messages, 25, headChars=200)   context-budget.ts:57-81
   ⇒ 该 tool_result 被截成 200 字符 + "[…较早的工具结果已省略以节省上下文]"
   ↓
继续增长 → 层② 摘要 / 层③ keepRecentByTokenBudget
   ⇒ 整条 tool_result 连同它所在的回合被**整段丢弃**
   ↓
而 system 里的技能菜单(loader.ts:135-140)**一字未动**,仍写着 `- \`wl-structure\`: …`
```

模型此时的处境:菜单说这个 skill 存在、历史里有一行「我加载过它」、正文没了。
最自然的续写就是**按它记得的名字继续声称在遵循该指南** —— 这在形态上与 §四 的
「幻影工具链」是同一类失败(有名无实的档案条目诱导模型补全)。

**更极端的一档是重连**:`shadowTurn.convertFlatToAnthropic`(server/shadowTurn.ts:81-89)
只保留 `text` 块,把每个 `tool_use` 折成一行、`tool_result` **整个丢弃**。
⇒ 会话闲置 30 分钟被逐出或容器重启后,**所有已加载的 skill 正文 100% 蒸发**,
只剩一行「【已调用 Skill …】」。这条路径不需要「上下文过长」,**任何一次重连都触发**。

### 3.3 顺带一处口径缺陷:压缩的触发信号看不见被缓存的前缀

`maybeReduceContext`(ws.ts:275):

```ts
const lastCtx = meta.lastUsage ? meta.lastUsage.input_tokens + meta.lastUsage.output_tokens : 0;
const estCtx  = Math.max(lastCtx, estimateTokens(meta.messages));
```

`estimateTokens` 只数 messages(context-budget.ts:27-49);而 `lastUsage.input_tokens`
**不含 `cache_read_tokens`** —— 而被缓存的那部分恰恰就是 system + tools 这个固定前缀。
线上量级:sci_draw 非冷起轮 `input_tokens` 只有 236–1,031,`cache_read_tokens` 却是 42,677–57,084。

⇒ 触发阈值与 `overhead` 让位量**系统性地少算了整个固定前缀**(sci_draw 是 43K tokens)。
默认 `EXECUTOR_CONTEXT_WINDOW=128000` + `TRIGGER_PCT=75` 时,25% 的余量(~30K)恰好把
claw/prism/smart_search 的 15-19K 前缀盖住了 —— **靠余量凑巧兜住,不是靠设计**。
sci_draw/boltslides 的 43K/41K 前缀已经**超过**这个余量;换到小窗模型(如 32K)必然溢出,
只能靠 `MAX_REACTIVE_REDUCES=2` 的反应式重试兜。

> **未验证**:线上尚无 sci_draw/boltslides 因此溢出的样本(两者共 28 轮,窗口都是大窗模型)。
> 这是一条**结构性风险**,不是已发生的事故。

---

## 四 长上下文下的幻觉:线上到底发生了什么

### 4.1 结构化通道里的工具名幻觉:13 / 12,977 = 0.10%

全量 `tool_use` 的 `toolName` GROUP BY(12,977 条),对照 registry 17 个 + MCP 76 个:

| 幻觉工具名 | 次数 | 模型拿到的 tool_result | 归类 |
|---|---:|---|---|
| `SearchPapers` | 6 | `permission denied: SearchPapers` | 凭空发明(驼峰化的 MCP 名) |
| `MultiEdit` | 4 | `unknown tool: MultiEdit` | **我们在 system 里写了它**(§4.2) |
| `search_papers` | 2 | `permission denied: search_papers` | 漏了 `mcp__minicod__` 前缀 |
| `GetDocument` | 1 | `permission denied: GetDocument` | 凭空发明 |

分布(时间 / feature / turn_id):

```
2026-07-17  MultiEdit      (session 已删)   turn 348   turn 首 call 69,799 tok
2026-07-19  SearchPapers×4 prism            turn 490   72,796
2026-07-21  MultiEdit      prism            turn 551   75,295
2026-07-28  GetDocument    claw             turn 1137  40,134
2026-07-28  SearchPapers×2 claw             turn 1223  21,962
2026-07-29  MultiEdit      (session 已删)   turn 1353  53,272
2026-07-30  search_papers×2 claw            turn 1471   2,559
2026-08-02  MultiEdit      prism            turn 1737  31,976
```

**与上下文长度的关系(诚实版)**:
全量 `message_complete.usage.input_tokens`(轮内累计)分位:p25=1,487 / p50=14,912 / p75=46,167 / p90=89,065。
出现幻觉的 9 个轮的中位数 = **40,134,落在总体的 ~p72**。方向是「长轮更容易」,
但 **n=9,且其中 2 个落在总体最低四分位**(2,559 / 857)。
⇒ **只能说弱相关,不能当因果用。** 要坐实需要按轮做匹配对照,本次没做。

**两处值得单独指出的**:

1. `permission denied: SearchPapers` 这个文案说明:`ws.go:258-263` 那条
   「不存在名为 X 的工具,请改用可用工具」的自愈回执 **在这些轮上没有生效**
   (`runOne` 优先用 `decision.userMessage`,runTools.ts:74-82;文案是旧的 = 后端没给)。
   这些轮全部在 2026-07-19~07-30。**未验证**该修复今天是否已部署 —— 窗口内没有新样本可看。
2. `MultiEdit` 走的是另一条路:backend 的 `permissionAllowed` 的 switch **显式包含 `"MultiEdit"`**
   (ws.go:412)⇒ 路径校验通过 ⇒ **批准** ⇒ 到执行器才 `builtinRegistry.get("MultiEdit")` 落空
   ⇒ `unknown tool`(runTools.ts:95-97)。全链路零告警,`known=false` 的诊断分叉根本没触发。

### 4.2 🔴 技能幻觉:5 / 122 = 4.1%,其中 3 次是我们自己造的

`Skill` 工具的 122 次调用按 `input.name` × `isError` × feature:

| feature | skill name | isError | 次数 |
|---|---|---|---:|
| **sci_draw** | **`figures`** | **true** | **3** |
| (session 已删) | `data-analysis` | true | 1 |
| (session 已删) | `学术写作与论文润色` | true | 1 |
| claw / prism / … | 其余 21 个真实名 | false | 117 |

`figures` 那 3 次是**结构性必然失败**,链条完整可复现:

```
agent-skills/sci-draw-skills/figures/SKILL.md 的 frontmatter:
    ---
    name: figures
    description: 把信号通路/机制/细胞过程…
    when_to_use: 当用户要画信号通路…
    user-invocable: false
    disable-model-invocation: false
    allowed-tools: Read, Write, Edit, Glob, Grep
    ---
        ↓
loader.ts:189   const chunk = `## ${label}\n${trimmed.slice(0, PER_SKILL_CAP)}`
                ← **没有 stripFrontmatter**,整段 YAML 原样进 system
        ↓
模型在 system 里读到 `name: figures` + `disable-model-invocation: false`
⇒ 合理推断「有个叫 figures 的技能可以调」
        ↓
Skill({name:"figures"})
        ↓
registry.ts:1073   readFile(join(dir, "guides", name, "SKILL.md"))   ← 只查 guides/
                   而 /sci-draw-add/guides 不存在(实测 guides=0)
        ↓
registry.ts:1083   fail(`skill "figures" not found. Available skills: (none for this session).`)
```

**同一个 frontmatter 泄漏还在四个 feature 的 system 里写了「假的工具约束」**
(容器内正则提取 `allowed-tools:` 行):

| feature | system 里出现的 `allowed-tools` | 与实际工具面的冲突 |
|---|---|---|
| prism | `Read, Glob, Grep, Edit, Write, **MultiEdit**` ×3 处 + 一条含 4 个 mcp 名 | **`MultiEdit` 不存在于 registry**(prism 又是唯一没把它加进 denylist 的 feature)⇒ 已实测触发 4 次 |
| smart_search | `Read, Glob, Grep` | **`Glob`/`Grep` 在 smart_search 的 denylist 里**(spec.go:130)⇒ 模型照此调用必被二道墙拒 |
| stat_lab | `…, Bash, StatRun, StatReport, AskUserQuestion, ReadDocument, ExportDocument` | 与实际面一致 ✅ |
| sci_draw / boltslides / claw | 见上表 | 名字都存在 ✅(但 `figures` 那条的 `name:` 仍是幻觉源) |

**口径不一致是硬事实**:按需 guides 走 `registry.ts:1077` 的 `stripFrontmatter(body)`(剥掉);
常驻 skill 走 `loader.ts:189`(不剥)。同一份 SKILL.md,放 `.claude/skills/` 与放 `guides/`
喂给模型的东西不一样,而**没有任何测试或护栏锁住这个差异**。

### 4.3 记忆里那条「SKILL 的 allowed-tools 不生效」——核实结果

**核实为真,且比记忆里写的更彻底。**

- `agent-skills/**` 下共 **48 份 SKILL.md 带 `allowed-tools:`**;
- `grep -rn "allowed-tools" agent/src/` = **0 命中** —— agent 侧**没有任何代码读它**;
- 真正的收敛口径是两处,都与 frontmatter 无关:
  ① MCP → `FeatureSpec.SessionOptions.AllowedMcpTools`(正向白名单,featurePolicy.ts:19-23);
  ② builtin → `DisallowedTools`(denylist)+ `AllowBash`(结构规则)。
- **补充**:它不仅「不生效」,还**有反作用** —— 常驻路径把它原样送进 system,
  变成一条模型会当真的假约束(§4.2 的 prism `MultiEdit` / smart_search `Glob,Grep`)。

---

## 五 判断:哪些合理,哪些不合理

### ✅ 合理(不要动)

1. **正向白名单 + 双向二道墙**:`toolPermitted` 被 `toAnthropicTools`(可见性)与 `runTools`
   (执行)**同一个函数**调用(featurePolicy.ts:18 注释明写),口径不可能漂。这是好设计。
2. **skills 两层(常驻规则 + 按需 guides)**:prism 31 个 lens 只花 1,306 字节菜单,
   正文按需付费 —— 实测命中 117/122。这是正确的「菜单经济」。
3. **工具面轮内冻结**(turnLoop.ts:236-240):轮内不变形,既保前缀缓存又不让模型看见工具凭空出现/消失。
4. **压缩不碰 system/tools**,且显式为固定前缀让位(compact.ts:347-350)。
5. **peerreview 不挂 addDirs**:是经过论证的取舍(compose 注释 417-434),不是遗漏。
6. **超帽不静默**:`PER_SKILL_CAP` 触发 `log.error` 并打印被丢的尾巴(loader.ts:183-187),
   菜单触帽 `log.warn` 点名(loader.ts:129);`skill_menu_built` / `skill_loaded` 有计量。

### ❌ 不合理(按 ROI 排序)

| # | 问题 | 实测代价 | 修法 | 工作量 |
|---|---|---|---|---|
| **1** | sci_draw / boltslides / stat_lab 无 MCP 白名单 | 每轮 ~36,800 死重 tokens;sci_draw 实测 0/61 用过 MCP | 三个 spec.go 各加一个 `AllowedMcpTools`(sci_draw/boltslides 直接给**空集之外的显式最小集**,或干脆把 MCP 全禁) | 分钟级 |
| **2** | prism `AllowBash` 半改 | 生产每天都在拒自己摆出来的工具,08-02 至今 11+ 次 | prism/spec.go:200 的 `FeatureSpec` 补 `AllowBash: true` | 一行 |
| **3** | 常驻 skill 的 frontmatter 不剥 | 3 次必然失败的 `Skill{figures}`;prism system 里 3 处假 `MultiEdit`;smart_search 假 `Glob/Grep` | loader.ts:189 改用 registry 同款 `stripFrontmatter`(把它提到共享模块,两处同源) | 小时级 |
| **4** | denylist 模式对新增 builtin 默认开放 | smart_search 白拿 StatRun/StatReport/BuildDeck ≈1,700 tok/轮 + 能真跑统计引擎 | 把 builtin 也翻成**正向白名单**(`AllowedBuiltinTools`),或至少加一条机械测试:每新增 builtin 必须在每个 feature 的 spec 里被显式**列入或排除** | 天级 |
| **5** | `Skill` 工具在 4 个无 guides 的 feature 里可见 | peerreview / boltslides / sci_draw / stat_lab 调它必失败;工具描述指向一个不存在的「技能菜单」小节 | 无 guides 时 `buildTools` 不发 `Skill`(需把 guides 存在性透进 `TurnInput`),或把这四个的 denylist 补上 `Skill` | 小时级 |
| **6** | 压缩触发信号漏算被缓存的前缀 | 大窗模型靠 25% 余量凑巧兜住;sci_draw 43K 前缀已超余量 | `estCtx` 改用 `input + cache_read + cache_creation`;或 `maybeReduceContext` 接一个由 `buildTools` 算出的 `prefixTokens` | 半天 |
| **7** | 已加载的 skill 正文会被 prune/丢弃而菜单不变 | 机制确凿,尚无直接线上样本 | 已加载 skill 记进会话状态,prune 时**同步把菜单行标注为「正文已淘汰,需重新加载」**;或把 skill 正文标记为 `pin`,`pruneOldToolResults` 跳过 | 天级 |

### 与「幻影工具链」的关系

§4 的两类幻觉与 ROOTCAUSE.md 的链 B 是**同一台机器的两个进料口**:
链 B 是「历史里的档案条目长得像动作 → 模型照抄」;
本文找到的是「**system 里的档案条目描述了不存在的东西 → 模型照做**」。
后者比前者更容易根治,因为它不需要说服模型 —— **把不存在的东西从 system 里删掉就行**。
第 3、5 项修复(剥 frontmatter、无 guides 不发 Skill)属于用户要的
「从代码逻辑层面彻底解决」那一类:**不是再加一个检测器,是让错误的路径不存在**。

---

## 六 明确未验证 / 不确定的部分

1. **长上下文 → 工具名幻觉的因果**:只有 n=9 的弱相关(中位数 p72),**不构成结论**。
2. `ws.go:258-263` 的「不存在名为 X 的工具」自愈回执**今天是否已部署**:窗口内(2026-08-05 起)
   `unknown tool` 日志 = 0 条,既可能是已修复也可能是没样本,**无法区分**。
3. stat_lab 的 76 工具灌注**尚无生产样本**(未放量),数字是容器内构面实测 + 与 sci_draw 同构外推。
4. `figures` 这类常驻 skill 是否**本来就打算**能被 `Skill` 调用(即该建 guides/ 而不是删 frontmatter),
   属产品意图问题,代码里看不出来。
5. 我没有测量真实 tokenizer 的 chars/token;§一 的 3.9 是从 sci_draw 的
   「142,378 字节 tools ↔ 43,000 实测 tokens」反推的**单点标定**,不同 feature 会有偏差。

---

## 七 一句话给决策

**今天最贵的一格是第 1 项**:三行配置,把 sci_draw / boltslides / stat_lab 的每轮固定成本
从 ~43K tokens 砍到 ~5K(降 88%),而这三个 feature 的 81 次工具调用里**一次都没用过被砍掉的东西**。
**今天最脏的一格是第 3 项**:一个 `stripFrontmatter` 的调用差异,正在往四个 feature 的 system 里
持续写入模型调不到的工具名和技能名 —— 而这正是「工具/技能幻觉」里**唯一可以被彻底消除**的那部分。

---

## 八 复跑方法(全部只读)

### 容器内构面(数字节)

```bash
# 1) 把探针写进 agent 容器(源码在容器内 /app/src)
docker exec scholar_agent sh -c 'cat > /tmp/p.ts <<EOF
import { mcpAnthropicTools } from "/app/src/mcp/mcpTools.ts";
import { builtinRegistry } from "/app/src/tools/registry.ts";
import { toolPermitted } from "/app/src/policy/featurePolicy.ts";
const mcp = await mcpAnthropicTools();
const inp:any = { disallowedTools:["MultiEdit","NotebookEdit","LS","ExportDocument","WebFetch","WebSearch","Task","Agent"],
                  allowedMcpTools: undefined, allowBash: true };          // ← sci_draw 的真实配置
const out:any[] = [];
for (const t of mcp) if (toolPermitted(t.name, inp)) out.push(t);
for (const [n,t] of builtinRegistry) if (toolPermitted(n, inp))
  out.push({name:t.name, description:t.description, input_schema:t.input_schema});
console.error("tools=", out.length, "chars=", JSON.stringify(out).length);
process.exit(0);
EOF
timeout 90 bun /tmp/p.ts'
```

### 常驻 skill 体积 + frontmatter 泄漏

```bash
docker exec scholar_agent sh -c 'cat > /tmp/s.ts <<EOF
import { loadAddDirContext } from "/app/src/skills/loader.ts";
for (const [f,d] of Object.entries({claw:["/claw-add"],prism:["/prism-add"],
    smart_search:["/smart-search-add"],boltslides:["/bolt-slides-add"],
    sci_draw:["/sci-draw-add"],stat_lab:["/stat-lab-add"]})) {
  const s = loadAddDirContext(d);
  console.log(f, s.length, [...s.matchAll(/allowed-tools:(.*)/g)].map(m=>m[1].trim()));
}
EOF
timeout 60 bun /tmp/s.ts'

# guides / .claude/skills 存在性
docker exec scholar_agent sh -c 'for d in /claw-add /prism-add /smart-search-add \
  /bolt-slides-add /sci-draw-add /stat-lab-add /peerreview-add; do
  printf "%-20s exists=%s guides=%s skills=%s\n" "$d" "$([ -d $d ] && echo Y || echo N)" \
    "$(ls $d/guides 2>/dev/null | wc -l)" "$(ls $d/.claude/skills 2>/dev/null | wc -l)"; done'
```

### 线上只读 SQL(注意:直接 `-e` 里的 `$.` 会被 shell/ssh 吃掉,必须走 SQL 文件)

```sql
-- ① 工具名幻觉:与 registry(17)∪ MCP(76)对不上的名字
SELECT JSON_UNQUOTE(JSON_EXTRACT(payload,'$.toolName')) n, COUNT(*) c
FROM agent_turn_events WHERE ev_type='tool_use' GROUP BY n ORDER BY c DESC;

-- ② 技能名幻觉:Skill 调用的成功/失败
SELECT s.feature_key, JSON_UNQUOTE(JSON_EXTRACT(u.payload,'$.input.name')) skill,
       JSON_EXTRACT(r.payload,'$.isError') err, COUNT(*) c
FROM agent_turn_events u
JOIN agent_turn_events r ON r.ev_type='tool_result'
 AND JSON_UNQUOTE(JSON_EXTRACT(r.payload,'$.toolUseId'))=JSON_UNQUOTE(JSON_EXTRACT(u.payload,'$.toolUseId'))
LEFT JOIN agent_sessions s ON s.agent_session_id=u.agent_session_id
WHERE u.ev_type='tool_use' AND JSON_UNQUOTE(JSON_EXTRACT(u.payload,'$.toolName'))='Skill'
GROUP BY s.feature_key, skill, err ORDER BY err DESC, c DESC;

-- ③ 固定前缀实测下界(每 feature 首个 call 的最小 input_tokens)
SELECT s.feature_key, COUNT(*) n,
       MIN(CAST(JSON_EXTRACT(e.payload,'$.calls[0].input_tokens') AS UNSIGNED)) min_i0
FROM agent_turn_events e LEFT JOIN agent_sessions s ON s.agent_session_id=e.agent_session_id
WHERE e.ev_type='message_complete'
  AND CAST(JSON_EXTRACT(e.payload,'$.calls[0].input_tokens') AS UNSIGNED) > 500
GROUP BY s.feature_key ORDER BY min_i0;

-- ④ prism 的 Bash 被 backend 拒(AllowBash 半改的直接证据)
SELECT DATE(u.created_at) d, s.feature_key, COUNT(*) c
FROM agent_turn_events u
JOIN agent_turn_events r ON r.ev_type='tool_result'
 AND JSON_UNQUOTE(JSON_EXTRACT(r.payload,'$.toolUseId'))=JSON_UNQUOTE(JSON_EXTRACT(u.payload,'$.toolUseId'))
LEFT JOIN agent_sessions s ON s.agent_session_id=u.agent_session_id
WHERE u.ev_type='tool_use' AND JSON_UNQUOTE(JSON_EXTRACT(u.payload,'$.toolName'))='Bash'
  AND JSON_UNQUOTE(JSON_EXTRACT(r.payload,'$.content')) LIKE '%permission denied: Bash%'
GROUP BY d, s.feature_key ORDER BY d;

-- ⑤ MCP 使用率(证明 sci_draw/boltslides 一次都没用过那 76 个工具)
SELECT s.feature_key,
       SUM(JSON_UNQUOTE(JSON_EXTRACT(e.payload,'$.toolName')) LIKE 'mcp__%') mcp_calls,
       COUNT(*) all_calls
FROM agent_turn_events e LEFT JOIN agent_sessions s ON s.agent_session_id=e.agent_session_id
WHERE e.ev_type='tool_use' GROUP BY s.feature_key ORDER BY all_calls DESC;
```

```bash
# 执行方式(SQL 文件经 scp → docker cp → mysql < file,避开 $. 的转义地狱)
scp q.sql root@154.201.87.103:/tmp/q.sql
ssh root@154.201.87.103 'docker cp /tmp/q.sql scholar_mysql:/tmp/q.sql && \
  docker exec scholar_mysql sh -c "mysql --default-character-set=utf8mb4 \
  -u scholar_user -pscholar_pass scholar -N < /tmp/q.sql"'
```

### 关键代码位置速查

| 主题 | 文件:行 |
|---|---|
| tools 组装(唯一入口) | `agent/src/tools/toAnthropicTools.ts:9-25` |
| 工具准入(可见性+执行同源) | `agent/src/policy/featurePolicy.ts:10-25` |
| builtin 注册表(17 个) | `agent/src/tools/registry.ts:1786` |
| 编排工具从默认面剔除 | `agent/src/turn/turnLoop.ts:183` · `agent/src/policy/researchTurn.ts:32` |
| system 拼装(含 skillCtx) | `agent/src/turn/turnLoop.ts:215-219` |
| 常驻 skill 加载(**不剥 frontmatter**) | `agent/src/skills/loader.ts:189` |
| 按需 guides 加载(**剥 frontmatter**) | `agent/src/tools/registry.ts:1073-1077` |
| 技能菜单构建 + 帽 | `agent/src/skills/loader.ts:76-141` |
| 市场 skill 物化(只进 guides) | `agent/src/server/sessions.ts:54-89` |
| 压缩三层(只碰 messages) | `agent/src/turn/compact.ts:333-401` |
| 老 tool_result 截断到 200 字符 | `agent/src/turn/context-budget.ts:57-81` |
| 压缩触发(漏算缓存前缀) | `agent/src/server/ws.ts:275` |
| 重连时 tool_result 全丢 | `agent/src/server/shadowTurn.ts:81-89` |
| backend 权限门(default 拒 + known 分叉) | `backend/internal/agentbridge/ws.go:298-424` |
| `AllowBash` 单一真源与两个消费者 | `backend/internal/agentbridge/spec.go:258-300, 326-338` |
| prism 缺 `AllowBash`(缺陷 C) | `backend/internal/prism/spec.go:200-224` vs `:103` |
| 三个 feature 缺 MCP 白名单(缺陷 A) | `backend/internal/{scidraw,boltslides,statlab}/spec.go` |
