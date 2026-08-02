# P0 验收指标 V1–V8:部署前必补 vs 部署后可算

> ## ✅ 落地状态(2026-08-01 当天,本文调查结论已全部处理)
>
> 本文是**调查报告**,写作时四项都还是待办。之后当天就修完了,**别再照着「必补清单」重做一遍**:
>
> | 项 | 结论 | 现状 |
> |---|---|---|
> | **A** V8 的 `research_state` 入 journal | 代码已在工作区 | ✅ 已核实在场(`hub.go:2092` + `eventlog.go:65`),增量成本 0,**发布时别拆** |
> | **B** error 终帧轮丢 `research_state` | 需真改代码 | ✅ **已修**:`sendError` 改为「只登记」,终帧由 `finally` 单点收口,顺序改成 research_state → error |
> | **C** 预检索题录不进 journal | 需真改代码 | ✅ **已修**:命中时发 `evidence_appended` 帧(带 `dois` / `paper_ids`),三侧本就已收,只缺发射点 |
> | **D** V1 判据与实现不自洽 | 零代码、需拍板 | ✅ **已改写**判据(见架构文档 V1 表下的红字),从「块类型」改为「上下文里有没有证据」 |
>
> B/C 由 `agent/src/turn/journalOrdering.test.ts` 三条不变式钉死,**已三向变异验证**
> (改回当场发帧 / 删发帧点 / 调换顺序,各自当场变红)。
> ⚠️ 这两条不变式的共同性质是**破坏它们不会有任何红灯** —— 前端照常渲染、用户照常拿到答案,
> 只有 journal 里悄悄少一块数据,几周后跑指标才发现,而那时数据已永久缺失。
>
> ---
>
> 只读调查,2026-08-01。基准:**HEAD(f53ccac73)= 近似线上**,**工作区 = 待部署**。
> 凡引用代码处均标注取自哪一侧;混用两者的证据在本文里视为无效证据。
> 指标定义唯一真源:[docs/agent-evidence-architecture-2026-08.md:300-313](agent-evidence-architecture-2026-08.md)(全文无第二处)。

---

## 〇 · 三句话结论

1. **有。P0 指标不是纯粹的「部署后分析任务」** —— 至少 **3 项必须随这次部署一起上代码**,另有 **1 组口径冻结**必须在采基线之前完成(零代码,但错过同样不可逆)。
2. 三项分别是:**① V8 的 `research_state` 入 journal**(代码已在工作区写好,只要不被拆出去发布即可,增量成本 0);**② error 终帧轮的 `research_state` 丢失**(今天的实现会在 round_cap / 预算耗尽 / 上游失败 / 空轮这几类轮上把 V8 整帧丢掉,而那恰好是最想量化的一格 —— 需要真改代码);**③ 引擎预检索(prefetch)的入账题录不进 journal**(部署后会让模型合法引用的 DOI 被算成「编造」,**系统性把北极星 V2 的改善压低**,方向恰好是「看起来 P0 失败了」)。
3. 不补的后果分两档:**②③ 是「数据永久有洞 + 指标被系统性带偏」**(部署那一刻起每一轮都在产生不可还原的错数据);**① 是「观测窗口丢失」**(V8 本来就没有基线要保,损失的是从部署到补上那几天的可见性)。而 **V3/V4/V5/V6/V7 与北极星 V2 的主口径,今天已落库、可事后回溯**,不必抢在部署前跑。

---

## 一 · 主表

计数口径:「今天在不在」= HEAD 那份代码跑在生产上时,数据是否已进 MySQL。

| # | 定义(原文摘要) | 需要的数据 | 今天在不在 | 判定 | 补齐成本 |
|---|---|---|---|---|---|
| **V1** | 失忆纪元轮占比(本轮 messages 里 `tool_result=0` 且会话历史存在 `tool_result`),目标 →0 | 每轮 `tool_use`/`tool_result` 事件数 + 会话历史 | **在**(`agent_turn_events`) | **部署后可算,但定义必须在采基线前重写** | 0 代码;需拍板一次口径 |
| **V2** | 冷重播轮 vs 热轮的 DOI 接地率差值(北极星),基线 55pp | ① 分桶(文档基线口径 = 本轮有无工具调用)② 正文 DOI ③ 证据语料(`tool_result`) | **在**(三样都在) | **主口径部署后可算;但需随部署补 prefetch 留痕,否则部署后的值被系统性压低** | 见 §二·必补项 C |
| **V3** | claw 零工具轮里「引用了文献」那部分的 DOI 接地率,基线 43% → ≥90% | 同 V2,分桶 = 零 `tool_use` 轮 | **在** | **部署后可算**(同样受 prefetch 偏差影响) | 同 C |
| **V4** | 追问轮平均工具数是否仍随 seq 坍缩(8.57→4.27→1.71) | `agent_turns.seq` × 每轮 `tool_use` 计数 | **在** | **部署后可算**,但 SQL 必须排除 `status='blocked'`(见下) | 0 代码;SQL 加条件 |
| **V5** | `import statsmodels` 失败次数 → 0 | `tool_result` payload 文本扫 ImportError | **在** | **部署后可算** | 0 代码 |
| **V6** | 正文含统计数值形态且本会话零 `RunAnalysis` 的轮占比 | 正文正则 + RunAnalysis 调用 | **分子在;分母条件恒真** | **部署后只能算半个** —— `RunAnalysis` 全仓不存在(P1 才做),这次部署也不会有 | P0 内无法补齐 |
| **V7** | 代价:单轮 raw token 中位数 / p50 首 token 延迟 | `agent_billing_ledger` 四列 + 事件时间戳 | **在,但两处有偏** | **部署后可算(带已知偏差)** | 可选:失败轮补写 ledger+model |
| **V8** | `ledger_total` 分布 / `origin` 分布 | `research_state` 帧 → `ev_type='evidence'` | **零行**(HEAD 无 `EvEvidence`、无 `research_state` 分支) | **部署前必补**(代码已写好)**+ 一个未修的洞** | 见 §二·必补项 A、B |

### 表内三条必须写进 SQL runbook 的坑

- **V4 的 `seq` 语义会被这次部署改掉**:工作区新增的 `RecordBlockedTurn` 给被配额拦下的轮也取 `MAX(seq)+1`(`backend/internal/agentbridge/eventlog_store.go:166-169`,工作区)。部署后 blocked 行会插进真实轮的编号里 → 基线期 `seq` 与部署后 `seq` **不是同一把尺**。SQL 必须 `status <> 'blocked'` 再按 `created_at` 重排,不能裸用 `seq`。
- **`content_delta` 部署后不再等于「模型正文」**:HEAD 直接丢弃无 `text` 的 delta 分片;工作区把工具入参流也落成 `ev_type='content_delta'`(payload 是 `{toolInput,toolPath}`,`backend/internal/agentbridge/eventlog_batcher.go:206-221`,工作区)。凡抽正文的 SQL 必须写 `JSON_CONTAINS_PATH(payload,'one','$.text')`,否则检索关键词、文件路径会被当成模型输出喂进 DOI 正则。
- **轮级硬超时会静默掐断 tee**:`suppressStray` 的 `continue` 在广播和 tee 之前(`backend/internal/agentbridge/hub.go:1600-1608`,HEAD 同构)。超时轮之后的迟到 `tool_result` 一行都不入库 → 该轮工具数偏低。V3/V4 的分组必须把 `status='failed'` 单独切出去,否则超时轮会被误判成「零工具轮」污染 V2 的分母。

---

## 二 · 北极星 V2 单独一节

### 2.1 三个前置条件逐条结论

**前置 (a) 冷/热分桶 —— 结论:今天就有,因为基线用的不是「驱逐」而是「本轮有无工具调用」。**

文档给 98%/43% 的两行原文是「**本纪元内有过工具调用**」与「**失忆纪元(零工具)**」(`docs/agent-evidence-architecture-2026-08.md:24-28`),括号里就是操作定义;V3 的 43% 与它是同一个数,而 V3 的分母白纸黑字是「claw 零工具轮」(`:306`)。所以 **55pp = 有 `tool_use` 的轮 vs 零 `tool_use` 的轮,两桶 DOI 接地率之差**,而这两样今天都在 `agent_turn_events` 里。

「冷重播 vs 热轮」是文档对这个差值的**因果解读**(烟枪是 `git show HEAD:agent/src/server/shadowTurn.ts:50` 那行 `blocks.filter(b => b.type === "text")`),不是第二种测量方法。据此:

- ✅ **按文档口径,V2 部署后可回算,且前后可比。**
- ⚠️ **反过来的风险更大**:如果部署后改用「真驱逐标签」重算,得到的数与 55pp 基线不可比,等于把北极星测废。
- ❌ 「相邻两轮间隔 > 30 分钟 = 冷」这个代理判据**不要用**:驱逐的硬前提是「无活跃 WS」(`agent/src/server/sessions.ts:477`),而 backend hub 在最后一个订阅者离开后还要 3 分钟才关;另有 `MAX_SESSIONS=200` 的 LRU 挤出(`sessions.ts:484-495`)与容器重启两条零痕迹路径。误差双向,不可用。
- 🟡 存在一个更准的**可选交叉验证**信号(不是必需):执行器的会话累计 token `cumUsage` 存在内存 meta 里,meta 重建即归零,而它每轮盖进终帧的 `session_total`,终帧整帧落库。「`session_total == usage` 且会话内有更早的轮」⇒ 本轮开始时 meta 是新建的。它可用于**验证**因果解读,但**不能替换**基线口径(否则就是方法学切换)。

**前置 (b) 模型正文 —— 结论:今天已落库,担心不成立。**

`hub.go` 上那句「content_delta 仅入 batcher 内存,无 MySQL」(工作区 `:1610`)描述的是**热路径不阻塞**,不是持久性:delta 经 4KB / 200ms 合并(`eventlog_batcher.go:33-34`)后由后台 goroutine 写 `agent_turn_events`,轮终态还有同步 flush 兜底(`:265-288`)。本机 dev 库实测 `content_delta` 3998 行。

**前置 (c) 接地真值 —— 结论:今天已落库,且不需要证据账本。**

`tool_result` 帧整份(cap 之后那一份)入库,DOI 完好。注意两条实操细节:
- DOI 键在 payload 里是被 JSON 转义的字符串内容,**用 `JSON_EXTRACT` 取 `$.doi` 会静默返回空**,必须走文本正则(`payload REGEXP '10[.][0-9]{4}'`)。
- 从正文抽 DOI 时必须 strip markdown 尾随的 `` ` `` 与 `*`,否则重合率会假性归零。

### 2.2 最小补齐方案(具体到文件与字段)

> 只列**必须随这次部署一起上**的。纯 SQL 口径的事项见 §二·2.3。

**必补 A · V8 的 `research_state` 入 journal —— 已写好,别拆。**
工作区 `backend/internal/agentbridge/hub.go:2092-2096` 新增 `case "research_state", "evidence_appended": return EvEvidence, true`;`backend/internal/agentbridge/eventlog.go:65` 新增 `EvEvidence`。HEAD 两者都没有(`git show HEAD:backend/internal/agentbridge/hub.go` 的 `classifyJournalEv` case 列表止于 `round_discarded`;HEAD `eventlog.go:31-41` 只有 11 个 EvType)。**增量工作量 = 0**,唯一要求是发布时不要把 backend 侧这几行拆出去。

**必补 B · error 终帧轮的 `research_state` 会被丢弃 —— 需要真改代码。**
执行器侧 `research_state` 在 `finally` 块里发(`agent/src/turn/turnLoop.ts:894` 的 `} finally {` → `:925-947` 发帧),而**全部 `sendError` 路径都在它之前**:`:398` round_cap、`:409` budget、`:609` content_blocked、`:642` upstream、`:689` model_protocol_error、`:904` empty_turn。backend 侧收到 error 帧后先 `Append(EvError)` 再 `h.endTurn()`(`hub.go:1546-1554`,工作区),`endTurn` 把 `h.currentTurnID = 0`(`hub.go:1222`);随后到达的 `research_state` 落到通用 tee,被 `if tid != 0` 挡掉(`hub.go:1611-1619`)。
⇒ **round_cap 与预算耗尽的轮上,`gate_blocked` / `queries` / `ledger_total` 一个字都不会入库** —— 而「模型在证据饥饿下空转 / 试图不取证就交付」正是整个证据账本架构最想量化的那一格。
修法两条(都要评估):① 执行器把 `research_state` 的 `sink.frame` 移到 `sendError` 之前;② backend 在 error case 里快照 `tid` 并延后收口。
🔴 **硬约束**:不要走「在 `endTurn`/`CompleteTurn` 之后补 `Append`」这条路 —— `dropTurn`(`eventlog_batcher.go:447-454`)删 accum 时不 flush,`accumLocked`(`:169-176`)会在后续 append 时重建 accum 并把 `nextSeq` 归 0,与该 turn 已落库的行撞 `UNIQUE(turn_id, ev_seq, created_at)`,而 `createWithRetry` 把 duplicate key **当成成功**(`:133-135`),这一行会被静默吞掉、连失败计数都不加。

**必补 C · 引擎预检索(prefetch)的题录不进 journal —— 会把 V2 往「失败」的方向带偏。**
`agent/src/evidence/prefetch.ts` 全文**零个 `sink.frame` 调用**(实测 grep `sink|frame(` 无命中),它在 `:141` 直连 `callMcpTool`、`:170` 直接 `ingest` 进账本,结果**只经 digest 进入模型视野**,history 与 journal 里一个字都不加(文件头 `:12-17` 自述了这个设计意图)。触发条件是「取证轮 **且** 账本为空」(`agent/src/turn/turnLoop.ts:254`),也就是**每个取证会话的第一个取证轮** —— 正是 V2/V3 最关心的那一格。
现有 `research_state` 只带 `prefetch`(状态串)与 `prefetch_hits`(条数),**没有 DOI、没有 E-id**(`turnLoop.ts:939-940`)。
⇒ 部署后会出现一整类「引擎真的检索到了、模型合法引用了、但 journal 里永远没有对应 `tool_result`」的 DOI,按 `tool_result` 口径一律判为编造。**偏差方向单一:让改造看起来失败。**
最省的修法:执行器在 prefetch 成功后发一帧 `evidence_appended`,带上本次入账的 `new_ids` 与其 DOI。**backend 白名单已经收这个帧型**(`hub.go:2092`)、**前端 fold 已有显式 no-op**(`frontend-user/src/features/claw/components/chat/fold.ts:164`),所以只缺执行器一个发射点。注意 `ingest` 的返回只有 E-id(`agent/src/evidence/ledger.ts:84-86` 的 `delivered/new_ids/dup_ids`),要带 DOI 需回读记录 → 工作量比「5 行」略大,量级仍是**几十行、单文件**。

**可选 D · 直接冷/热留痕(~5 行,建议顺手)。**
执行器在 seed 守卫求值前算 `const seeded = meta.messages.length === 0`(`agent/src/server/ws.ts:206-208`),加进它已经在发的 `history_seeded` 帧(`ws.ts:252`);backend 侧在 `classifyJournalEv` 加一个 case。今天这个帧**全仓零消费者**(grep 只命中发送点本身),既不入 journal 也不进日志。按文档口径 V2 不需要它,但它能把「因果解读」从推断升级为留痕。

### 2.3 采基线前必须冻结的口径(零代码,但错过同样不可逆)

| 项 | 必须拍板的事 | 不拍板的后果 |
|---|---|---|
| **V1 定义** | 文档写「本轮 messages 里 `tool_result=0`」目标 →0,但**工作区的修复并没有把 `tool_result` 块放回去** —— 它折成 text 行(`agent/src/server/shadowTurn.ts:63-100`,`kept` 类型被硬约束为 `{type:"text"}[]`)。部署后 `tool_result` 块数**依然恒为 0** | V1 部署后自动变成假红灯,会被误读成「修复无效」 |
| **V2 分桶** | 明确写死 = 「本轮有 `tool_use` 事件」vs「零 `tool_use`」 | 换判据 = 方法学切换,55pp 基线作废 |
| **V2/V3 语料** | 用户粘贴的 DOI 算不算接地?文档自己区分 `in_toolresult` vs `in_usertext`(`:174`,实例 `10.1093/plphys/kiab120` 是 `in_toolresult=0 / in_usertext=1`),而 HEAD 的雷达实现把两者混为一谈(`backend/internal/agentbridge/eventlog_validate.go:261`) | 前后不可比;建议基线就分两列算 |
| **V3 谓词** | 「引用了文献」(122/278)是「正文出现 DOI 正则」还是含更宽的题录形态 | 分子口径漂移 |
| **V4 分桶** | 8.57→4.27→1.71 三档的档界 | 无法复现基线 |
| **V5 单位** | 失败「次数」= 行数 / 会话数 / 用户数 | 基线数值差一个数量级 |
| **V7 raw token** | 含不含 `cache_read`/`cache_creation` | ±10% 的验收门形同虚设 |
| **claw 零工具率取哪个数** | 仓库里至少四个:38.2%(`:40` flash)、55.3%(`:40` pro)、42.8%(`:336`/`:372`)、41.5%(`prod-audit-2026-07-31.md:183`) | 任意前后对比都是自欺 |

---

## 三 · 数据永久丢失风险

> 「永久」的判定基础:`agent_turn_events` **永不删除**(`docker/mysql/migrations/0071_agent_tables_partition_indexes.sql:8` 原文「会话历史永久保留、绝不删除(产品要求):只延展分区、永不 DROP 分区」),cleanup 日任务只延展分区(`backend/internal/common/cleanup/cleanup.go:155-160`)。所以**凡是今天已经入库的,都没有时间压力**。

### 3.1 不在部署前埋点就再也拿不到的

1. **error 终帧轮的 `research_state`(必补 B)** —— 最严重。即使 V8 随部署上了,round_cap / 预算耗尽这几类轮依旧是空洞,且这个空洞与「轮的病态程度」正相关(越糟的轮越安静)。
2. **prefetch 题录的归属(必补 C)** —— 部署那一刻起,每一个引擎预检索轮都在产生「看似编造实为真检索」的记录,事后无法从 journal 区分。
3. **V8 的 `ledger_total` / `by_origin` / `queries`(必补 A)** —— 不上则恒零。诚实标注:文档 `:367` 已明确**否决**回溯重建账本(理由:回填的题录没有轴归属,收益低),且 V8 基线栏本来就写「今天完全不可见」、目标栏是「—」。所以它损失的是**观测窗口**,不是**基线** —— 紧迫性低于 1 和 2。
4. **工具入参的流式分片** —— HEAD 直接丢弃(`git show HEAD:backend/internal/agentbridge/eventlog_batcher.go:271` 注释「跳过免写放大」),工作区改成落库。影响低:完整入参今天已经在 `tool_use` 帧的 payload 里,V5 不受影响。
5. **冷/热的直接标记** —— 按文档口径 V2 不需要;但若将来有人「优化」执行器让 `cumUsage` 从 `agent_sessions.usage_watermark` 恢复(backend 已经在持久化这个值,`repository.go:71-75`),那条可选的交叉验证信号会**无声消失**且没有任何护栏会红。

### 3.2 有保留期、会真删的(与 journal 不同)

| 数据 | 期限 | 证据 |
|---|---|---|
| `llm_token_usage` | 365 天,每日真 DELETE | `backend/internal/common/cleanup/cleanup.go:249-256` |
| `usage_events` | 365 天,每日真 DELETE | `cleanup.go:232-241` |
| agent 会话 workdir(含 `evidence/ledger.jsonl`) | 30 天,整目录 `rm` | `agent/src/server/sessions.ts:388`、`:457-459` |

### 3.3 「永久保留」≠「有备份」

`scripts/backup-all.sh` 存在且覆盖 MySQL + agent 盘 + MinIO,但只滚动保留最近 7 份,且需先跑 `scripts/install-backup-cron.sh`;项目记忆里 `prod-audit-2026-07-31` 记的是「零备份 · cron 从未装」。⇒ 「基线不用抢,部署后再跑 SQL」的前提是那台 MySQL 的卷不出事。**动手前手动跑一次 backup-all.sh 固化基线,成本几分钟。**

---

## 四 · 诚实标注:已知不确定与未确认

**判定为「已确认」的核心事实**:HEAD 无 `EvEvidence`/`research_state` 分支(`git show` 直读);prefetch 无 `sink.frame`(grep 零命中);`sendError` 全部先于 `finally` 里的 `research_state`(行号逐条列出);`endTurn` 置 `currentTurnID=0` 且 tee 有 `tid != 0` 门;journal 永不删除。

**未确认 / 需要线上才能定的:**

1. **线上镜像对应哪个 commit。** 本文以 HEAD 近似「已部署」。记忆条目 `billing-full-audit-2026-07-29` 记有「发布断层 c7592f25a 未进 main」。若线上更早,`thinking` / `artifact` / `round_discarded` 等较新 ev_type 在生产可能也不存在。**上线前先跑一条 `SELECT DISTINCT ev_type FROM agent_turn_events` 实测。**
2. **生产库的样本量与 `session_total` 覆盖率未知。** 本机 dev 只有 137 轮,不足以判断 V3/V4 分组统计是否够用。
3. **98%/43% 那份「线上 journal 审计报告」不在仓库里**(`docs/` 下找不到)。文档 `:4-5` 只说「来自线上 journal 审计报告」。所以「冷/热怎么切」「接地怎么判」当初的**确切 SQL** 无法核对 —— §二 对基线口径的还原是从文档措辞与 V3 分母的一致性推出来的,**是强推断,不是原件核对**。
4. **`EXECUTOR_SESSION_IDLE_TTL_MS` / `EXECUTOR_WORKDIR_TTL_DAYS` 在生产是否被覆盖**未核(只读了代码默认 30 分钟 / 30 天)。
5. **`claim_audit` 在生产 journal 的实际覆盖率未知。** 它只在「阳性」时才写,且叠了 `HONESTY_GUARD_ON` / `honestyFired`(一轮至多一次)/ `guardsEligible`(撞工具轮上限的轮永不被审计)等多道闸 ⇒ 缺席同时混合了「没问题」「guard 关着」「已触发过」「轮数到顶」多种语义,**不建议当 V2 的接地信号**。
6. **V5/V6 的「全表扫可行」没有行数与体积证据。** `agent_turn_events` 只有 `PRIMARY(id,created_at)` / `UNIQUE(turn_id,ev_seq,created_at)` / `idx_sid_id` 三个索引,**payload 上无任何索引或生成列**。先量一把:`SELECT COUNT(*), SUM(LENGTH(payload)) FROM agent_turn_events PARTITION (p2607)`,再决定要不要建派生表(若要建,那也属于「随部署上」的候选)。
7. **peerreview 是否在 V2 范围内未确认。** 它走 server-side 路径,`backend/internal/agentbridge/ws_serverside.go` 全文对 `bridge.turns` 零引用 ⇒ 完全不进 journal,任何基于 `agent_turns` 的口径都不覆盖审稿。
8. **`round_discarded`(作废重打)在生产的频率未知**,本机 0 行。V2 重建正文时应按 `FoldToMessages` 的口径丢弃作废前缀,否则作废文本里的 DOI 会计进分子。

**本文刻意不写的**:任何「应该已经这样了」的推测。上面每条判定都对应一次 `git show` / grep / 文件直读;拿不到证据的一律进本节,不进主表。
