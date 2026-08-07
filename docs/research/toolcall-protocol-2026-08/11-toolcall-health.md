# 工具调用全链路体检

> 2026-08-08 · 线上只读取证(`154.201.87.103`,全程 SELECT / `docker logs` / `docker inspect` / `docker exec … grep`)+ 本地代码走读 + `bun test`(360 pass / 0 fail)
> 数据窗口:`agent_turns` 2,477 轮 · `agent_turn_events` 547,783 行(2026-06-30 12:31 ~ 2026-08-08 00:15)
> 本文回答的是「我们的工具调用是否正常」,**不涉及**幻影工具链(链 B)与 DSML 泄漏(链 A)的修复 —— 那两条见 [ROOTCAUSE.md](ROOTCAUSE.md)。

---

## 〇 结论先行

**工具调用协议本身是健康的,而且健康得比预期干净。**
最硬的那条指标 —— `tool_use` 与 `tool_result` 一一配对 —— 在 **12,977 次真实工具调用**上是 **12,976 配对 + 1 例可完整解剖的孤儿**,
零重复 id、零跨轮串台、零乱序、零孤儿 `tool_result`。出站 tools 组装、并行调用、id 回填三处都没有可归因的缺陷。

但体检查出了**四个真问题**,其中两个正在线上持续烧钱、一个会在下次发版当天变成安全面扩张:

| # | 问题 | 性质 | 线上证据 |
|---|---|---|---|
| **A** | **prism 的 Bash 是半边接线** —— agent 侧放开了、backend 权限门没放开 ⇒ **48/48 次 prism Bash 调用 100% 失败**,至今仍在发生 | 🔴 一行代码,生产中 | `prism` Bash 48 次调用,43 次 `permission denied` + 5 次 `tool not permitted`,最近一次 2026-08-07 16:54 |
| **B** | 工作区新增的 `StatRun` / `StatReport` **没有任何 feature 把它们列进 denylist**,而 backend 权限门无条件放行 ⇒ 下次发版当天,纯只读检索的 smart_search 也能跑统计引擎 | 🔴 发版即生效,尚未部署 | 代码:`grep '"StatRun"' backend/` 只命中 `ws.go:387/400`(放行),零 denylist |
| **C** | OpenAI 适配道**没有任何入参类型校验/矫正**,弱模型把 `limit` 发成字符串 `"8"` ⇒ 上游 zod 400,模型 6 轮不自愈 | 🟠 路径特有,已发生 | qwen3.7-max 一轮内连续 6 次 `-32602 Expected number, received string`(2026-08-07 12:04) |
| **D** | `permissionAllowed` ↔ builtin registry 的接线守卫**只做单向**(builtin→backend),反向漂移无人管 ⇒ backend 批准了执行器根本没有的 `MultiEdit` | 🟡 低频,浪费轮次 | 4 次 `unknown tool: MultiEdit`(2026-07-17 ~ 2026-08-02) |

另外**证伪了一条 ROOTCAUSE 里的存疑项**:`activeTools=[]` 时两条道口径不一致(anthropic 发 `tools: []`、openai 省略键)
—— 线上 **87/87 轮 AskUserQuestion 收尾轮全部 `complete`**,`tools: []` 不是失败源。

---

## 一 数据与口径(先说清楚我怎么算的)

### 1.1 事件表的形状

```sql
SELECT ev_type, COUNT(*) FROM agent_turn_events GROUP BY ev_type ORDER BY 2 DESC;
```

| ev_type | 条数 |
|---|---:|
| thinking | 301,876 |
| content_delta | 173,761 |
| content_start | 28,016 |
| **tool_use** | **12,977** |
| **tool_result** | **12,976** |
| **permission_request** | **12,971** |
| user_message | 2,442 |
| message_complete | 2,327 |
| artifact | 898 |
| evidence | 307 |
| error | 103 |
| round_discarded | 39 |
| quota_blocked | 35 |

`payload` 的键形只有两种族(零畸形):
`tool_use` = `[type, input, toolName, toolUseId]`(12,977 全部);
`tool_result` = `[type, content, isError, toolUseId]`(12,491)或 `+userMessage`(485)。

### 1.2 帧与代码的对应(别把三个计数当同一件事)

```
content_start(blockType=tool_use)  12,995   ← turnLoop.ts:552  流式块**开始**
       tool_use(=tool_use_complete) 12,977   ← turnLoop.ts:614  流式块**闭合**(assembler.close)
       permission_request           12,971   ← runTools.ts:65   控制面裁决(第二道墙放行后才发)
       tool_result                  12,976   ← runTools.ts:130 / 154
```

三个差值各有确定含义,下面逐个交代:
`12,995 − 12,977 = 18`(§2.3)、`12,977 − 12,971 = 6`(§3.2)、`12,977 − 12,976 = 1`(§2.2)。

### 1.3 ⚠️ 一条运维事故(我造成的,必须留痕)

跑 §5 那条 `CAST(payload AS CHAR) LIKE '%-32602%'` 的全表 JOIN 时,**scholar_mysql 被 OOM 打挂并自动重启**
(`2026-08-07T16:18:54 XA crash recovery finished`,恢复后 `Up … (healthy)`,数据无损)。
`agent_turn_events` 是 54.7 万行 + JSON 列,任何**跨全表的 `CAST(json AS CHAR) LIKE`** 都会把整列物化进临时表。
后续查询已改成 `JSON_UNQUOTE(payload->'$.content[0].text')` + 前缀 `LIKE 'MCP error%'`,并加 `LIMIT`。
**复跑本文 SQL 时请沿用这个写法**,别用 §9 之外的自创变体。

---

## 二 ① 配对:`tool_use` ↔ `tool_result` 是否一一对应

这是「工具调用是否正常」唯一说得清的硬指标。结论:**全绿**。

### 2.1 全量配对

```sql
WITH tu AS (SELECT turn_id, JSON_UNQUOTE(payload->'$.toolUseId') tid, ev_seq FROM agent_turn_events WHERE ev_type='tool_use'),
     tr AS (SELECT turn_id, JSON_UNQUOTE(payload->'$.toolUseId') tid, ev_seq FROM agent_turn_events WHERE ev_type='tool_result')
SELECT …  -- 完整语句见 §9
```

| 判据 | 值 | 解读 |
|---|---:|---|
| tool_use 总数 | 12,977 | |
| tool_result 总数 | 12,976 | |
| **孤儿 tool_use(发了没结果)** | **1** | 见 §2.2,已定位到具体一行代码 |
| **孤儿 tool_result(没 use 的 result)** | **0** | |
| **重复的 toolUseId** | **0**(两侧都是 0) | id 生成/回填无碰撞 |
| **跨轮配对**(tu.turn ≠ tr.turn) | **0** | 不存在把 A 轮的结果回填给 B 轮 |
| **结果早于调用**(tr.ev_seq < tu.ev_seq) | **0** | 顺序在 journal 层严格 |

### 2.2 那 1 例孤儿的完整解剖

```
turn_id 1231 · claw · user 1098 · qwen3.7-max(**OpenAI 适配道**) · status=failed
ev_seq 292  content_start  {blockType:"tool_use", toolName:"Write", toolUseId:"call_f37cc2e6eb3e4b44bbc3ed11"}   00:06:14.590
ev_seq 293  tool_use       {toolName:"Write", input:{}}                                                          00:09:02.032   ← 相隔 2 分 47 秒
ev_seq 294  error          {code:"upstream"}                                                                     00:09:02.035
```

机制(逐行可追):

1. 中转在 `Write` 的 `arguments` 分片中途掐断 → `openai/adapter.ts` 的 SSE 循环 `done` 退出;
2. `adapter.ts:439` 收尾时对每个 tool 块 yield `content_block_stop`;
3. turnLoop 收到 stop → `assembler.close(index)` → **`assembleToolUse.ts:38-42` 把 `JSON.parse` 失败静默吞成 `input = {}`**,并照常 `sink.frame({type:"tool_use_complete", input:{}})`;
4. 之后 `adapter.ts:504` 在构造 finalMessage 时同一段半截 JSON 再 parse 一次,这次 `finish !== "length"` → `throw new Error("tool arguments truncated by upstream: Write")` → turnLoop catch → `code=upstream`。

**结论**:配对断裂不是协议缺陷,是「帧层比消息层更宽容」的后果 ——
`ToolUseAssembler.close()` 是全仓唯一会把**坏 JSON 变成一个看起来正常的工具卡片**的地方。
用户屏幕上出现一张「Write(无参数)」的卡片,它对应的调用从未存在过。
`adapter.ts` 已经为这件事做了显式处理(finish=length 走占位、否则抛错),**但 assembler 抢在它前面把帧发出去了**。

> 🟡 建议(不属本次范围):`close()` 在 JSON.parse 失败时返回一个带 `malformed:true` 的结果,turnLoop 据此**不发** `tool_use_complete` 帧。判据是确定性的,不含语义判断。

### 2.3 「开了没闭」的 18 个工具块

```sql
-- content_start(tool_use) 有、tool_use(complete) 无
```

18 个,分布:`Write` 8 · `AskUserQuestion` 4 · `MultiEdit` 2 · `Edit` 2 · `ReadDocument` 1 · (另 1 个 Write)。
时间跨 2026-07-09 ~ 2026-08-04,**全部落在 DeepSeek 两个模型或错误轮**(`model_main` 为空 = 被 error 打断的轮)。

这类块在前端表现为**一张永远不会 resolve 的工具卡**。
成因是 `max_tokens` 撞顶(输出窗被 thinking + 大 Write content 吃光)或流被掐断,`content_block_stop` 从未到达。
turnLoop 的 `max_tokens` 恢复分支(`turnLoop.ts:823`)会为 `finalMessage` 里**存在的** pending tool_use 补 `is_error` tool_result,
但这 18 个块连 `finalMessage` 都没进,所以它们既没有 `tool_use` 帧也没有 `tool_result` 帧 —— **孤儿的是 `content_start`,不是 `tool_use`**,故不计入 §2.1。

量级:18 / 12,995 = **0.14%**。

---

## 三 ② 单轮工具数、并行度、permission_request 关系

### 3.1 分布(无截断迹象)

1,729 / 2,477 轮用了工具(**69.8%**)。

| 每轮 tool_use 次数 | 轮数 | 调用数 |
|---|---:|---:|
| 1 | 251 | 251 |
| 2 | 215 | 430 |
| 3–5 | 447 | 1,709 |
| 6–10 | 414 | 3,189 |
| 11–20 | 297 | 4,279 |
| 21–40 | 91 | 2,351 |
| 41–80 | 13 | 687 |
| 81+ | 1 | 81 |

最重的一轮 81 次(turn 64,claw,deepseek-v4-pro,`complete`)。
`MAX_TOOL_ROUNDS` 撞顶(`code=round_cap`)全窗口只有 **1 次**(2026-08-04 13:55)——
说明轮上限**不是**当前的瓶颈,不需要调。

**并行工具调用是真在工作**(按「两条 tool_result 之间的连续 tool_use」聚簇):

| 单批并行数 | 批数 |
|---|---:|
| 1 | 4,147 |
| 2 | 1,060 |
| 3 | 859 |
| 4 | 534 |
| 5–8 | 296 |
| 9–16 | 22 |

共 6,918 批,其中 **2,771 批(40%)是并行批**,最大单批 **16 个工具**。
两条道都有并行:`qwen3.7-max` 最大 6 并行 / `glm-5.2` 最大 4 —— **OpenAI 适配器的 `tc.index` 交错聚合状态机在生产上是通的**。

### 3.2 permission_request 少的那 6 个 = 执行器第二道墙

`12,977 − 12,971 = 6`,逐条查出来是:

| 轮 | 工具 | feature | tool_result |
|---|---|---|---|
| 608 / 613 / 1172 / 1215×2 | Bash | **prism** | `tool not permitted: Bash` |
| 1231 | Write | claw | (无,就是 §2.2 那例) |

`runTools.ts:60` 的 `toolPermitted()` 在发 `permission_request` **之前**短路,所以这 5 次不产生权限帧 —— 语义正确。
**这也意味着:「MCP 白名单 / denylist 在执行器侧生效」在整个窗口里只被触发过 5 次,且全是 Bash。**(见 §5)

---

## 四 ③ 工具幻觉:模型调了 registry 之外的工具吗

### 4.1 调过。13 次,全在 DeepSeek,全部被正确拒绝

registry 现网 15 个 builtin(`Read/Write/Edit/Glob/Grep/Bash/ReadDocument/ExportDocument/BuildDeck/TodayDate/Skill/AskUserQuestion/EvidenceGet/SubmitAnswer/DeclareInsufficient`;工作区多 `StatRun/StatReport`,未部署)。

线上出现过的 registry 之外的 `toolName`:

| 幻想的工具名 | 次数 | 时间 | 模型 | 得到的 tool_result |
|---|---:|---|---|---|
| `SearchPapers` | 6 | 07-19 ~ 07-28 | deepseek-v4-flash | `permission denied: SearchPapers` |
| `MultiEdit` | 4 | 07-17 ~ 08-02 | deepseek-v4-pro/flash | `unknown tool: MultiEdit` |
| `search_papers`(裸名,无 mcp 前缀) | 2 | 07-30 | deepseek-v4-flash | `permission denied: search_papers` |
| `GetDocument` | 1 | 07-28 | deepseek-v4-flash | `permission denied: GetDocument` |

**13 / 12,977 = 0.10%**,且 **13/13 都收到了 `is_error` 的 tool_result**,协议没有一次因此断裂。
另有 2 次 `mcp__minicod__get_author` 被上游回 `MCP error -32602: Tool get_author not found`(同名工具在 minicod 侧时有时无,属上游 churn;同名工具另有 5 次成功)。

值得注意的旁证:`SearchPapers` 的入参是 `{"limit":10,"query":"…","source":"semantic"}` —— 这是**旧 Semantic Scholar 时代的形状**,
模型从训练记忆里搬出来的,`source` 直接写了 `semantic`/`openalex`。这与「数据源别名铁律」是同一条战线上的事:
我们能遮蔽 tool description 里的品牌名,遮蔽不了模型记忆里的旧工具名。

### 4.2 🔴 D — 接线守卫是单向的,反向漂移无人管

`agent/src/tools/permissionParity.test.ts` 机械校验 **builtin → backend**(每个 builtin 必须在 `permissionAllowed` 里被显式提到),
这条守卫救过五次「造好没接线」。但**反向没有守卫**:

`backend/internal/agentbridge/ws.go:410` 的文件工具 switch 列了
`"Read","ReadDocument","ExportDocument","Write","Edit","MultiEdit","NotebookEdit","Glob","Grep","LS","Ls"` ——
其中 **`MultiEdit` / `NotebookEdit` / `LS` / `Ls` 在 agent registry 里根本不存在**。

后果链是可复现的:

```
模型幻想 MultiEdit
  → permissionAllowed 命中 switch → known=true, 路径在 cwd 内 → **批准**
  → decidePermission 因为 known=true **不发**「不存在名为 MultiEdit 的工具」那句自愈提示
  → runTools.ts:96  builtinRegistry.get("MultiEdit") === undefined → "unknown tool: MultiEdit"
```

模型拿到的是英文的 `unknown tool`,而不是控制面为它准备好的中文自愈句。
线上 4 次,每次浪费一个工具轮 + 一次 LLM 往返。

**顺带的实测**:那句 `"不存在名为 X 的工具"` 在整个窗口里**从未在生产出现过 0 次**
(`tool_result.content LIKE '%不存在名为%'` = 0),尽管两侧都已接线
(现网 backend 二进制含该串;现网 `agent/src/server/ws.ts:108` 已透传 `userMessage`)。
原因就是上面这条:唯一一个**发版后**还在出现的幻想名 `MultiEdit` 恰好被 backend 判成 `known=true`。
**这条自愈路径目前是零生产验证的。**

---

## 五 ④ MCP 白名单 `AllowedMcpTools` 是否真的生效

### 5.1 当前部署窗口:零越界

现网镜像构建时间 `agent 2026-08-02T10:55` / `backend 2026-08-04T12:45`,容器启动 `2026-08-04T16:35`。

自当前部署以来的**全部** MCP 调用(去前缀原始名)逐条对照三份白名单:

| feature | 实际调用到的 MCP 工具 | 是否全部在白名单内 |
|---|---|---|
| claw | search_papers, get_journal, suggest_journals, search_journals, get_papers_batch, get_journal_submission_guideline, get_paper_citations, match_paper | ✅ 全部在 `clawAllowedMcpTools`(22 项) |
| prism | search_papers, get_paper_by_doi, match_paper, get_paper, search_snippets | ✅ 全部在 `prismAllowedMcpTools`(17 项) |
| smart_search | search_papers, match_paper, get_paper_citations, get_paper_by_doi, search_snippets, recommend_paper, search_authors, get_related_works, get_paper_references, get_paper, get_papers_batch, recommend_from_pool, get_author_papers | ✅ 全部在 `smartSearchAllowedMcpTools`(18 项) |

**零越界。** 白名单落地在两处同源判据(`policy/featurePolicy.ts:20`:可见性 `toAnthropicTools` + 执行二道墙 `runTools`),
生产上没有任何一次 MCP 调用绕过它。

### 5.2 历史越界只有 1 起,且发生在白名单**部署之前**

白名单三份代码同批落地于 `23b22e306`(2026-07-26)。此前的越界(claw `list_countries` 07-09、prism `suggest_journals` 07-23、smart_search `search_journals` 07-11~07-24)全部在该日期之前,属预期。

07-26 之后唯一一起是 **claw `mcp__minicod__search_universities`,2026-07-28 01:07**(会话建于 07-25 13:32)。
无法判定它是「白名单尚未部署」还是「真绕过」—— 我拿不到 07-28 当天的镜像构建时间(现网只保留 latest)。
**按未越界处理是不诚实的,按越界处理是无据的;记为存疑。**

### 5.3 🟠 机制上的不对称(latent,当前未致害)

`agent/src/server/ws.ts` 相邻 11 行里,两个同类字段用了**相反**的刷新策略:

```ts
// ws.ts:238 —— 控制面下发即权威、无条件覆盖
if (Array.isArray(frame.disallowedTools) && frame.disallowedTools.length > 0) {
  meta.disallowedTools = (frame.disallowedTools as unknown[]).map(String);
}
// ws.ts:249 —— 仅在本进程 meta 尚空时接受,不覆盖活会话
if (Array.isArray(frame.allowedMcpTools) && frame.allowedMcpTools.length > 0 && meta.allowedMcpTools.length === 0) {
  meta.allowedMcpTools = (frame.allowedMcpTools as unknown[]).map(String);
}
```

`disallowedTools` 那条的注释写着它**原本**就是「仅 meta 为空时回填一次」,并因为
「prism 长寿命 project 会话重连后永远拿旧 denylist → 模型看得见已被禁的工具、承诺后被 backend 拒(18 轮白烧)」
被改成无条件覆盖。**白名单这条还是旧形态。**

失效面:**收窄**白名单(删掉某个 MCP 工具)不会到达任何一个内存里还活着的会话,
直到 agent 进程重启或该会话 meta 被 idle sweep 淘汰(`sessions.ts:414`,默认 30min 且需无活跃 WS)。
放宽白名单同样不生效。今天恰好没造成越界,是因为白名单自 07-26 之后没改过。

---

## 六 ⑤ 两条 client 分叉的行为差异矩阵

分叉点只有一处 —— `agent/src/anthropic/client.ts:35`:

```ts
p.apiFormat === "openai" ? openAIAdapterClient(p) : new Anthropic({ baseURL: p.baseUrl, … })
```

`tools` 在分叉**之前**就已定型(`tools/toAnthropicTools.ts:9-26`),两条道拿到同一个对象。
下表的每一条都是**分叉之后**的差异。

| # | 维度 | anthropic 原生道(DeepSeek) | openai 适配道(千问 / GLM) | 证据等级 |
|---|---|---|---|---|
| 1 | **入参类型** | API 直接回结构化 JSON,类型由上游保证 | `arguments` 是**模型手写的 JSON 字符串**,我们 `JSON.parse` 后**零校验**直接喂工具 | 🔴 已发生,见 §6.1 |
| 2 | **`activeTools=[]`** | 字面发 `"tools": []` | `toOpenAITools([])` 返回 `undefined` → **整个键省略** (`adapter.ts:142`) | ✅ 已证无害,见 §6.2 |
| 3 | **thinking 块** | 全程保留在 history | 默认**剥离**(`adapter.ts:88`),仅 `reasoningReplay` 方言以 `reasoning_content` 带回 | 代码确凿 |
| 4 | **`is_error`** | 结构化布尔 `tool_result.is_error` | 降级成 `"[error] " + body` 文本前缀(`adapter.ts:107`) | 代码确凿 |
| 5 | **`content_block_stop` 时机** | 每块闭合时逐个发 | **全部堆到流末尾一次性发**(`adapter.ts:438-440`) | 代码确凿 |
| 6 | **截断 tool args** | SDK 侧行为 | 显式处理:`finish=length` → 保留 `input:{}` 占位块交 max_tokens 恢复;否则抛错(`adapter.ts:494-509`) | 代码确凿 |
| 7 | **tool_use id** | `toolu_*`,上游签发 | `call_*`;上游漏发 id 时**合成** `call_${idx}_${Date.now()}`(`adapter.ts:419`) | 🟡 理论,未观测 |
| 8 | **空 user 消息** | `{role:"user", content:[]}` 会原样发出 → 上游 400 | `toOpenAIMessages` **静默丢弃**该消息(`adapter.ts:128-135`) | 🟡 理论,未观测 |

### 6.1 🔴 C —— 入参类型:同一个工具,两条道成功率不同

现网 MCP 协议级错误(`-32602`)全窗口只有 **11 条 / 12,977 次调用(0.085%)**,但分布极不均匀:

```
qwen3.7-max   search_papers  7 条   ← 全部是 "limit": "8"(字符串)而 schema 要 number
deepseek      3 条            ← 1 条漏必填 paper_id、1 条 enum 值 'pmd'、1 条 enum 值不合法
glm/其它      1 条
```

最有说服力的是 2026-08-07 12:04:02 ~ 12:04:22 的**同一轮 20 秒内 6 连发**(qwen3.7-max,openai 道):

```
{"limit": "8", "query": "big data education review survey", "source": "discovery"}
      → invalid_enum_value: received "discovery", options ["semantic","openalex","pubmed"]
{"limit": "8", "query": "…", "source": "openalex"}
      → invalid_type: path ["limit"], expected "number", received "string"
{"limit": "8", "query": "…", "source": "semantic", "yearEnd": "2025", "yearStart": "2024"}
      → invalid_type: limit …
{"limit": "8", "query": "…", "yearEnd": "2026", "yearStart": "2022"}
      → invalid_type: source undefined
{"limit": "8", …} ×2 再来
      → invalid_type: limit …
```

模型每轮都在改 `source` / `yearStart`,**六次都没动 `limit`** —— 因为报错文本被埋在一大段 zod JSON 里,
而 `limit` 是它自己觉得「肯定没问题」的字段。这一轮用户等来的是零检索结果。

两件事同时成立:

- **这不是我们的 bug**(是 OpenAI 协议把 arguments 定义成字符串,弱模型不区分 `8` 和 `"8"`);
- **但我们本可以廉价地兜住**:`runTools.ts:87` 收到 `tu.input` 后直接透传给 `callMcpTool`,
  中间**没有任何一处**拿 `input_schema` 做类型矫正。我们手上恰好有 schema(`toAnthropicTools` 刚发出去过),
  按 schema 把 `"8"` → `8`、`"true"` → `true` 是纯确定性变换。
  且这层矫正对 anthropic 道是零影响(类型本来就对)。

另注:第一条 `source: "discovery"` 是**别名遮蔽的残留失效面** ——
`mcp/mcpTools.ts:27` 把 description 里的 `OpenAlex` 换成 `Discovery`(enum/const/default 整棵跳过,写法是对的),
但模型仍会把散文里的品牌名当成 enum 值发出来。全窗口 1 例,不构成方案否定,记录备查。

### 6.2 ✅ 证伪 ROOTCAUSE 存疑 #6:`tools: []` 不是失败源

`activeTools = []` 在生产是常态,不是边缘:近 3 天 agent 日志里 51 条 wind-down,
其中 **20 条 `turn ask wind-down: awaiting user choice`**(`turnLoop.ts:503` 显式 `activeTools = []`)
+ 9 条 `evidence lookup budget spent, text-only`(同样清空)。

线上结局:**含 `AskUserQuestion` 的 87 轮,87 轮全部 `status=complete`**(deepseek 83 / glm 3 / qwen 1),零 error。

⇒ anthropic 原生道对 `"tools": []` 的处理是正常的,ROOTCAUSE §二存疑 #6「它是文本形工具调用的放大器」**不成立**。
(代码层的口径不一致仍在,只是无害。)

### 6.3 两条道的总体健康度对比

| model | api_format | 工具调用 | 孤儿 | is_error | 错误率 | 最大并行 |
|---|---|---:|---:|---:|---:|---:|
| deepseek-v4-flash | anthropic | 8,597 | 0 | 511 | 5.94% | 16 |
| deepseek-v4-pro | anthropic | 3,438 | 0 | 259 | 7.53% | 10 |
| qwen3.7-max | openai | 114 | **1** | 13 | 11.40% | 6 |
| glm-5.2 | openai | 67 | 0 | 5 | 7.46% | 4 |
| glm-4.7-flashx | openai | 40 | 0 | 12 | **30.00%** | 2 |
| qwen3.7-plus | openai | 35 | 0 | 5 | 14.29% | 4 |
| glm-5v-turbo | openai | 7 | 0 | 0 | 0% | 1 |
| *(model_main 空)* | — | 679 | 0 | 56 | 8.25% | 6 |

> ⚠️ 口径陷阱同 [01-prod-slice](01-prod-slice.md):`agent_turns.model_main` **只在 message_complete 写入**,
> 被 error 打断的轮恒为空串,故有 679 次调用落在 `(unknown)` 桶。上表不做回收(本文关心的是配对与并行,不是破损归因)。

`glm-4.7-flashx` 的 30% 是小样本假象:40 次调用里 12 次错,其中 8 次是 **Bash 里的 Python 语法/命令不存在**
(`bolt-slides-render: command not found`、`SyntaxError`),1 次 BuildDeck 不在演示稿工作区 —— 都是模型能力问题,不是协议问题。

---

## 七 顺带查实的两个真 bug(不在体检清单里,但比清单里的任何一条都值钱)

### 7.1 🔴 A —— prism 的 Bash 是半边接线,48/48 全灭

**能力面有两个真源,2026-08-01 只改了一个。**

```go
// backend/internal/prism/spec.go:103  —— agent 侧 denylist:allowBash=true,Bash 不再并入
DisallowedTools: agentbridge.SessionDisallowedTools(prismDisallowedTools, true),

// backend/internal/prism/spec.go:200-222  BuildSpec 返回的 FeatureSpec —— **没有 AllowBash 字段**(零值 false)

// backend/internal/agentbridge/spec.go:292  —— backend 权限门用的是 FeatureSpec.AllowBash
if !spec.AllowBash { deny = append(deny, bashTools...) }   // ⇒ prism 的 Bash 仍在 denyTools
```

于是:**agent 把 Bash 摆进 `tools[]` 给模型看 → 模型调 → backend `permissionAllowed` 顶部命中 denylist → 一律拒。**

线上实测(全窗口):

| feature | Bash 调用 | 结局 |
|---|---:|---|
| claw | 624 | 正常执行 |
| **prism** | **48** | **43 次 `permission denied: Bash` + 5 次 `tool not permitted: Bash` = 100% 失败** |
| sci_draw | 26 | 正常 |
| smart_search | 1 | 1 次拒(预期,只读检索) |

最近一次:`2026-08-07 16:54:55`,现网 backend(构建于 08-04)日志同刻有
`{"level":"INFO","msg":"agentbridge ws: permission denied (guard enforced)","tool":"Bash", …}` ——
**仍在发生**,且因为日志是 INFO 级「护栏按预期拒绝」,不会有任何人被告警。

横向对照(其它 feature 都对):

| feature | `SessionDisallowedTools(…, allowBash)` | `FeatureSpec.AllowBash` | 一致 |
|---|---|---|---|
| claw | (不传 SessionOptions denylist) | `true` | ✅ |
| **prism** | **`true`** | **缺省 = false** | ❌ |
| sci_draw | `true` | `true` | ✅ |
| statlab | `true` | `true` | ✅ |
| boltslides | `false` | false | ✅ |
| smart_search | `false` | false | ✅ |

**修法是一行**:prism 的 `BuildSpec()` 里补 `AllowBash: true`。
**但更该修的是结构**:`SessionDisallowedTools(x, allowBash)` 与 `FeatureSpec.AllowBash` 是同一个事实的两次书写,
`specDeny` 的注释写着「保证『agent 端禁的』与『backend 门禁的』完全一致,不漂移」—— 这个保证只在两处传同一个值时成立,
而**没有任何东西强制它们同源**。可行的机械防线:`specDeny` 断言
`spec.SessionOptions.DisallowedTools` 是否含 `Bash` 必须与 `!spec.AllowBash` 同真值,不一致直接 panic 在启动期。

### 7.2 关联异常:prism 的 ExportDocument 也走到了权限门(22 次)

`ExportDocument` **在** `prismDisallowedTools`(2026-07-16 起,commit `c97b10701`)。
按设计它应该:① 不出现在 prism 的 `tools[]`;② 万一被调,`runTools.ts:60` 回 `tool not permitted`。

线上实测:**22 次 prism 的 ExportDocument 调用拿到的是 `permission denied: ExportDocument`(来自 backend)**,
最近一次 2026-08-05 00:19。这意味着执行器侧的 `meta.disallowedTools` 在调用时刻**不含** ExportDocument,
否则第二道墙会先短路、根本不会发 `permission_request`。

被违反的不变式很清楚:

> 凡出现在 `spec.SessionOptions.DisallowedTools` 里的工具,**永远不应该产生 `permission_request`**。

我没能把漂移路径钉死(只读证据不够):`ws.ts:238` 现网确认是无条件覆盖、
`hub.go:422` 的 `seedHistoryFromJournal()` 每次建 hub 都现算 `buildCreateOptions` 下发 —— 两条路看起来都对。
候选机制两条,都需要一次**可写的现场探针**才能区分:
(a) 某些 prism 会话的 executor meta 是 `getOrCreateEphemeral`(`sessions.ts:304`)造的保守默认(全空),且该进程生命周期内没收到过 seed_history;
(b) `seedHistoryFromJournal` 只在 hub 创建时跑一次(`hub.go:422`),hub 存活期间 backend 侧改了 denylist 不会补发。

旁证支持 (a):2026-08-05 那次的 input 是 `{"file_path":…, "export_path":…}` —— **完全不是 ExportDocument 的真实入参**
(真实是 `source_path`/`target_format`/`output_name`),说明模型是**凭记忆**调的、手里没有 schema
⇒ 该工具**不在** `tools[]` ⇒ 执行器的 `toolPermitted` 却放行了 ⇒ `meta.disallowedTools` 为空。

### 7.3 🔴 B —— `StatRun` / `StatReport` 将在下次发版被**所有** feature 继承

工作区新增的两个工具:

- `backend/internal/agentbridge/ws.go:387` / `:400` —— **无条件放行**(`return true, true`);
- **零个** feature 的 denylist 提到它们(`grep -rn '"StatRun"\|"StatReport"' backend/` 只命中上面两行);
- 各 feature 的能力面是 **deny-list 形状**:`smartSearchDisallowedTools` / `prismDisallowedTools` /
  `sciDrawDisallowedTools` / `boltSlidesDisallowedTools` / `scoringSessionDeny` 都是「列出要禁的」。

⇒ `toAnthropicTools` 对每个 feature 都会把 `StatRun`/`StatReport` 放进 `tools[]`,`permissionAllowed` 都会批准。
纯只读检索的 **smart_search** 会突然能调「全仓唯一带 `writableReserved:[analysis]` 的 spawn」;
`peerreview` 的 server-side 无人值守会话同理。

`smartSearchDisallowedTools` 的注释自己预见过这个模式:

> `MultiEdit/NotebookEdit/LS/WebFetch/WebSearch/Task/Agent` 当前不在 registry,列出是**防御性兜底**:
> 一旦将来 registry 新增,smart_search 仍默认锁死,不必回来补。

这个防御性写法只覆盖了当时想得到的名字。**deny-list 的结构性缺陷是「新增即默认授予」**,
`permissionParity.test.ts` 校验的是「builtin 必须在 backend 被提到」,**不校验**「新 builtin 是否被每个 feature 有意识地取舍过」。

建议在发版前二选一:
① 给三个只读/受限 feature 的 denylist 补上这两个名字(治标,下一个新工具还会重演);
② 加一条与 `permissionParity` 同族的守卫:**新增 builtin 必须在每个 feature 的 spec 里被显式提及(允许或禁止)**,
   没提到当场红 —— 把「默认授予」翻成「默认必须表态」。

---

## 八 未决 / 只读证据判不了的

| # | 问题 | 为什么判不了 |
|---|---|---|
| 1 | 2026-07-28 那次 claw `search_universities` 是否为真绕过 | 拿不到当日镜像构建时间(registry 只留 latest) |
| 2 | §7.2 ExportDocument 漂移的确切路径 | 需要在现场读一个活会话的 `meta.disallowedTools`(要么加只读调试端点,要么写日志)—— 属写操作 |
| 3 | 差异矩阵 #7(合成 tool id)与 #8(空 user 消息)是否可达 | 需构造上游异常响应;全窗口零观测,可能真的不可达 |
| 4 | 按 schema 做入参类型矫正的收益量级 | 只有 11 条 `-32602` 样本,其中 7 条来自同一轮同一个用户;千问/GLM 的 MCP 调用总量只有 98 次,统计上给不出可靠的「矫正能挽回 X%」 |
| 5 | `tools[]` 的**实际线缆体积** | 我没有抓包能力(只读),只能从代码推:smart_search ≈ 18 MCP + 8 builtin,claw ≈ 22 + 15,prism ≈ 17 + 13 —— 未实测 |

---

## 九 复跑清单(全部只读;⚠️ 务必用这里的写法,别自创 `CAST(json AS CHAR) LIKE`,见 §1.3)

```bash
# 通道
sshpass -e ssh root@154.201.87.103 \
  "echo $(base64 < q.sql | tr -d '\n') | base64 -d | docker exec -i scholar_mysql mysql -u scholar_user -pscholar_pass scholar"
```

```sql
-- ① 配对(本文 §2.1)
WITH tu AS (SELECT turn_id, JSON_UNQUOTE(payload->'$.toolUseId') tid, ev_seq FROM agent_turn_events WHERE ev_type='tool_use'),
     tr AS (SELECT turn_id, JSON_UNQUOTE(payload->'$.toolUseId') tid, ev_seq FROM agent_turn_events WHERE ev_type='tool_result')
SELECT 'tool_use total' k, COUNT(*) v FROM tu UNION ALL
SELECT 'tool_result total', COUNT(*) FROM tr UNION ALL
SELECT 'orphan tool_use', COUNT(*) FROM tu LEFT JOIN tr ON tu.tid=tr.tid WHERE tr.tid IS NULL UNION ALL
SELECT 'orphan tool_result', COUNT(*) FROM tr LEFT JOIN tu ON tu.tid=tr.tid WHERE tu.tid IS NULL UNION ALL
SELECT 'dup use ids', COUNT(*) FROM (SELECT tid FROM tu GROUP BY tid HAVING COUNT(*)>1) x UNION ALL
SELECT 'dup result ids', COUNT(*) FROM (SELECT tid FROM tr GROUP BY tid HAVING COUNT(*)>1) y UNION ALL
SELECT 'pair cross-turn', COUNT(*) FROM tu JOIN tr ON tu.tid=tr.tid WHERE tu.turn_id<>tr.turn_id UNION ALL
SELECT 'result before use', COUNT(*) FROM tu JOIN tr ON tu.tid=tr.tid AND tu.turn_id=tr.turn_id WHERE tr.ev_seq<tu.ev_seq;

-- ② 并行批分布(本文 §3.1)
WITH ev AS (
  SELECT turn_id, ev_seq, ev_type,
         SUM(CASE WHEN ev_type='tool_result' THEN 1 ELSE 0 END)
           OVER (PARTITION BY turn_id ORDER BY ev_seq ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) grp
  FROM agent_turn_events WHERE ev_type IN ('tool_use','tool_result'))
SELECT sz, COUNT(*) batches FROM (SELECT turn_id,grp,COUNT(*) sz FROM ev WHERE ev_type='tool_use' GROUP BY 1,2) b GROUP BY sz ORDER BY sz;

-- ③ registry 之外的工具名(本文 §4.1)—— 对照 agent/src/tools/registry.ts:1786 的 all[]
SELECT JSON_UNQUOTE(payload->'$.toolName') tname, COUNT(*) n
FROM agent_turn_events WHERE ev_type='tool_use' GROUP BY 1 ORDER BY 2 DESC;

-- ④ MCP 白名单越界(本文 §5.1)—— 对照三份 *AllowedMcpTools
SELECT t.feature_key, SUBSTRING(JSON_UNQUOTE(e.payload->'$.toolName'),15) n, COUNT(*) c
FROM agent_turn_events e JOIN agent_turns t ON t.id=e.turn_id
WHERE e.ev_type='tool_use' AND JSON_UNQUOTE(e.payload->'$.toolName') LIKE 'mcp\_\_%'
  AND e.created_at >= '2026-08-04 16:35:00' GROUP BY 1,2 ORDER BY 1,3 DESC;

-- ⑤ 拒绝分类学(本文 §4/§7)
WITH tr AS (SELECT JSON_UNQUOTE(payload->'$.toolUseId') tid,
                   LEFT(JSON_UNQUOTE(payload->'$.content[0].text'),60) c, created_at
            FROM agent_turn_events WHERE ev_type='tool_result' AND JSON_EXTRACT(payload,'$.isError')=true)
SELECT CASE WHEN c LIKE 'permission denied:%' THEN 'permission denied'
            WHEN c LIKE 'tool not permitted:%' THEN 'executor 2nd wall'
            WHEN c LIKE 'unknown tool:%' THEN 'executor unknown tool'
            WHEN c LIKE '%不存在名为%' THEN 'control-plane unknown tool'
            WHEN c LIKE 'MCP error%' THEN 'mcp protocol'
            ELSE 'other' END kind, COUNT(*) n, MIN(created_at) f, MAX(created_at) l
FROM tr GROUP BY 1 ORDER BY 2 DESC;

-- ⑥ prism Bash 全灭(本文 §7.1)
SELECT t.feature_key, COUNT(*) bash_calls, MAX(e.created_at) last_at
FROM agent_turn_events e JOIN agent_turns t ON t.id=e.turn_id
WHERE e.ev_type='tool_use' AND JSON_UNQUOTE(e.payload->'$.toolName')='Bash' GROUP BY 1 ORDER BY 2 DESC;
```

```bash
# 现网侧(只读)
docker logs scholar_backend --since 96h 2>&1 | grep 'permission denied'
docker logs scholar_agent 2>&1 | grep -cF 'wind-down'
docker exec scholar_agent sh -c "sed -n '234,252p' /app/src/server/ws.ts"    # denylist vs 白名单刷新策略
docker inspect scholar_agent --format '{{.Config.Image}}' | xargs docker image inspect --format '{{.Created}}'
```

```bash
# 本地
cd /Users/youngp/mypro/fuck_副本/scholar && docker run --rm -v "$PWD":/repo -w /repo/agent \
  --security-opt seccomp=./docker/seccomp/agent-bwrap.json --security-opt apparmor=unconfined \
  --entrypoint sh $(docker inspect scholar_agent --format '{{.Config.Image}}') -c 'bun test'
# → 360 pass / 0 fail(2026-08-08 实跑)
```

---

## 十 一句话回答用户

**工具调用协议本身没病** —— 12,977 次调用一一配对、零重复、零乱序、并行到 16 路都正常,
模型幻想工具名的 13 次全部被正确拒绝并拿到了可自愈的错误。
**病在能力面的接线**:prism 的 Bash 只放开了一半,48 次调用 100% 白烧且没有任何告警;
OpenAI 适配道对模型手写的入参不做任何类型矫正,弱模型一个 `"8"` 就能空转一整轮;
而工作区里的 `StatRun`/`StatReport` 因为「能力面是 deny-list」,发版当天会被每一个 feature 默认继承。
