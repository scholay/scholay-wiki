<!--
产出方式:三轮 workflow(16 agents,0 error,~1.65M tokens)——
  Understand 7(会话注入链/轮次机制与编辑面/执行器侧/质量闭环/skill体系与V2结论/计费路由/逐轮上下文组装成本)
  Research 4(编辑面设计/逐轮上下文工程/会话拓扑/能力暴露UX)
  → Synthesize 1 → Critique 3(接地/与DESIGN-V2一致/务实)→ Finalize 1。
定位:本文管「链路架构」;skills 与生成式设计由 REPORT.md(V1,已落地)与 DESIGN-V2.md(已定稿待实施)接管。
重要批判纠错(已折叠):画像更新非「永不生效」(走 invalidateSessionForProfile 重建,代价是丢会话史);
  budgetDisclosure 轮内稳定(「每 call 全价重发」不成立,收益取决于上游有无隐式前缀缓存→第 0 步打点);
  struct 轨 overrides 被静默丢弃(ws_round.go:140-143)→ 同时证伪 DESIGN-V2 A5「overrides 地基已具备」前提,需勘误。
-->

# Prism 智能写作 Agent 目标架构(全链路梳理 · 最终版 · 2026-07)

> 定位:本文管「链路架构」——注入/上下文/编辑面/轮次/工具/质量闭环/前端协作/计费。skills 与生成式设计由 REPORT.md(V1,已落地)与 DESIGN-V2.md(已定稿待实施)接管。本文与 V2 的交叠处已逐条对表(§4.7),其中 **autoApply 默认态存在一处真实冲突,已上升为开放问题 #1**,不再宣称「全部兼容」。所有量化数字按「零缓存最坏口径 + 128K 默认窗」标注,精确校准依赖落地路线第 0 步的打点。

---

## 1. 概览

**现在的架构**:DocStruct 真源在 DB;每轮 PrepareRound 把结构体投影成受限 markdown 全量铺进 per-project 持续 agent 会话的 cwd,agent 用原生 Read/Edit 定点改,轮末整篇 parse 回来整体替换 Body,确定性 projector 投影 LaTeX 编译;前端 Tiptap WYSIWYG 双向转换;有界透支预算 + raw 1x 计费。

**最大的三个结构性弱点**:
1. **上下文经济失控**:全文逐轮沉淀进 history + 零缓存纪律 + 滑窗参数对 prism 恒 no-op,默认 128K 窗下项目会话在个位数编辑轮内撞墙;而产品假设是跨整篇几十轮。
2. **编辑面无稳定块身份 + 合并粒度断层**:锚静默蒸发、元数据靠内容猜回、agent 定点编辑 vs apply 整体替换,用户轮中编辑可被覆盖,struct 轨 overrides 是假门。
3. **闭环单点与信号盲区**:轮次生命周期由浏览器单点编排(服务端不强制顺序,失败/中断/stop 轮可被盲固化);确定性质量回执与编译错误 agent 全盲,修复靠用户手点再烧一轮。

**目标形态**:测量先行、缓存纪律与 microcompaction 把每轮未缓存 input 压到「hot tail + 底盘」;稳定 Block ID(仅可引用块)+ 按节文件 + 原生 Edit 作为编辑面终态;轮次契约(epoch + aborted 标记 + 服务端 pending)收归服务端;确定性信号经逐轮信封回流 agent;能力分三档两通道(评议/改写快通道 + agent 轮);per-project 会话经 project memory block 外置软状态后变为可弃。

---

## 2. 能力全景图(现状八层)

### ① 注入层
**机制**:三个注入时机——CreateSession(仅 DisallowedTools+AddDirs,无系统提示,`edit.go:62` 绕过 `buildCreateOptions`)、hub 建立时的 seed_history 帧(协议+记忆+画像,`hub.go:269-332`)、首条 user_message 的 in-band STRICT RULES 前缀(`ws.go:205-216`);逐轮只有元数据(预算章、tier 锁)。
**关键数字**:协议 1,487 字符(3,100 字节);人格 cap 3,000 **字节**(Go `len()`,`writing_persona.go:37,158`);seed 覆盖最近 30 轮 journal;首轮协议双份下发(prism 从不 `markPromptInjectedSync`)。
**弱点**:seed 写失败仅 `slog.Debug` 无重试,executor 重启后存量会话可能在「无协议无技能」状态静默运行(这是本层最重的雷);user 记忆中途更新对活会话不可见(要等 executor 重启);协议编译期固化。**修正原稿**:画像更新并非「永不生效」——`SetWritingProfileFromUser`/`PlanWritingProfile` 走 `invalidateSessionForProfile`(`planner.go:45,52-62,106`)删会话重建,是「生效但丢整段项目对话史」;这属于会话可弃化问题(§4.6),不是读环断裂。

### ② 上下文组装层
**机制**:每个 LLM call 的 input = system(dateLine+协议+人格+记忆+3 常驻核+30-lens 菜单+预算披露)+ 工具 schema + 全量 history;历史零压缩。
**关键数字**:固定底盘原稿估 ~19-20K tok,经字节/字符混淆修正(3 核 11,007 为**字节**≈4.4K 汉字)后约 **12-15K tok,需 tokenizer 实测**;8,000 词论文的 document.md ≈13.5K tok 逐轮沉淀进 history;零缓存口径下增长曲线在 **N≈8-9 撞 128K 默认窗**(`EXECUTOR_CONTEXT_WINDOW` 默认 128000);滑窗触发 96K/保 25 回合,对 ~16K/轮的 prism 在第 26 轮前恒 no-op,**从未救过场**;全库 0 处 `cache_control`。
**修正原稿的缓存叙事**:budgetDisclosure 每轮只算一次、**轮内稳定**(`turnLoop.ts:29-36,72-73`,仅 wind-down 翻转变一次)——「每轮 ~5 call 全价重发全史」不成立:若上游有隐式前缀缓存(DeepSeek 型),轮内 call 2..N 命中,只有跨轮首 call 因披露数字变而 miss;若上游是 Anthropic 协议,零 `cache_control` 意味着**本来就没有任何缓存**,披露移位单独上线收益为零。当前上游到底哪种,`normUsage` 的 cache_read 字段一天数据即可判明——这是第 0 步打点的核心理由。
**弱点**:零缓存最坏口径下成本 O(N²);重连 seed 只保 text 块(16K/轮骤缩 0.5K/轮),模型对「自己改过什么」失忆,上下文质量路径依赖连接生命周期。

### ③ 编辑面(document.md 桥)
**机制**:PrepareRound 全量铺 cwd → agent 原生 Read/Edit → apply 时 `parseEditorMarkdown` 整篇解析、`mergeEditorInto` **整体替换 Body**、`restoreBlockMeta` 按内容精确匹配猜回元数据。
**关键数字**:7 种块型;Block.ID 每次 parse 顺序重编(无跨轮稳定性);displayMath 无锚语法(`isCrossRefKey` 认 eq:/lst:/alg: 前缀,agent 却**无任何造锚途径**);表格单元格纯文本 `[][]string`;任意 ``` 围栏 → opaque RawLaTeX 原样注入(```python 即编译必炸)。
**弱点**:内容一改锚即静默蒸发;agent 定点 Edit vs apply 整体替换的粒度断层可覆盖用户轮中编辑(structWriteMu 只防撕裂不防语义丢失);struct 轨 overrides 被静默丢弃(`ws_round.go:140-143`,SchemaStruct 分支直调 applyStructRound)——**这条同时证伪 DESIGN-V2 A5 的「overrides 地基已具备」前提(仅 legacy 轨为真),需给 V2 提交勘误**。

### ④ 轮次拓扑
**机制**:每项目一持续会话;隐式状态机 prepare→WS 轮→pending(cwd vs 基线字节比较)→autoApply/reject,**全部由浏览器编排,服务端不强制顺序**。
**关键数字**:hub 3min grace 后关上游;重入时 fetchPendingRound 有结果即静默 commitAndIndicate(`usePrismChat.ts:352-358`)。
**弱点**:跳过 prepare 无人拦;reject/prepare 可在流式中抽换 agent 脚下的文件;apply 依赖发起 tab 的 JS 活着;**stop 轮与成功轮在帧层不可区分**——`turnLoop.ts` finally 的 sendComplete 使 abort 后照发 message_complete,前端照走 autoApply(hub 转发过 stop_generation,有此信息但没带进轮终态);无 compact/reset 策略。

### ⑤ 工具面
**机制**:7 builtin(Read/Write/Edit/Glob/Grep/TodayDate/Skill,禁 Bash/Task/Agent)+ 全量 minicod MCP;每个 tool_use 经 WS 回 backend `decidePermission` 裁决(cwd 围栏)。
**关键数字**:Edit 取首次出现且**无唯一性校验**(`registry.ts:141 indexOf`,比 Claude Code 更危险);Read 无 offset/limit(`registry.ts:72`,256KB 截断);无 MultiEdit(spec.go 注释与实现漂移);24 tool-rounds/轮、64K max_tokens/call、5M tok/轮硬闸;权限往返 120s 超时默认拒。
**弱点**:长文档重复片段 Edit 静默错位;超长文档尾部对 agent 不可见;wind-down 一刀撕掉全部工具可能留半截编辑。

### ⑥ 质量闭环
**机制**:确定性回执(quality.go:悬空引用/未定义交叉引用/超长句)+ conformance + 编译错误抽取,全部只给用户侧消费;「让 AI 修复」= 手点再烧一轮。
**关键数字**:回执只扫 paragraph/list 的 inlines(heading/caption/opaque 盲区);编译错误横幅渲染在默认隐藏的 pdfPane 内(`PrismWorkspaceV2:335-357`)——首编译即失败时错误与修复入口双双不可见;l.NNN 行号指向 agent 读不到的投影 .tex。
**约束**:quality/parse 是 backend Go 代码,executor 是 TS 且除 permission_request 外无回调通道——「agent 轮内自查工具」不能以 builtin 形态直接落地(见 §4.4)。
**弱点**:agent 对「这轮改完能不能编译、锚断没断」全盲;缺作者/机构是 agent 改不了、UI 也没处填的双重死端。

### ⑦ 前端协作
**机制**:轮中 WS 工具帧驱动乐观预览;轮末 autoApply(无确认门,历史拍板——**注意与 V2-A5-1 的冲突见开放问题 #1**)→ 三 refetch + 自动编译;用户编辑经 flush→save→prepare 防丢;emitSig 回声判定。
**弱点**:多端同时收 message_complete 重复编译(sha 去重兜底);apply 重试耗尽只 toast「请刷新」,数据滞留 cwd 可被另一端 prepare 冲掉。

### ⑧ 计费
**机制**:轮前 `CheckDailyQuotaOverdraft` 起点闸 → hub 逐轮盖 soft/hard 预算章 → agent 自控 wind-down → message_complete 水位增量记账 → `vip.AddUsage`。
**关键数字**:Free 20 万/Pro 100 万/Max 500 万 tok/日,透支带 max(15%, 20 万);配额按 raw 四类 1x(cache_read 真实成本 ~0.1x 也按 1x 扣)。**统一口径后的伤害叙事**(原稿「第 10 轮耗尽」与「N=8 撞窗」取自不同窗口配置,互斥,已废弃):128K 默认窗下,第 6-8 轮单轮 raw input 可达数十万到百万级(视轮内 call 数与隐式缓存有无),Pro 日额度在个位数轮内耗尽,Free 第 2-3 轮即死——**测量前无法给两位有效数字,但量级结论(付费用户体感「额度骗人」)成立**。
**弱点**:raw 1x 计 cache_read 结构性惩罚长文写作;planner 轮绕过配额且记账归属错(user_id=NULL、feature 兜底 peer_review,`ws_serverside.go:260-289`);5M 轮闸(input+output)与 wind-down(raw 四类)两套口径。

---

## 3. 结构性弱点排序(伤害 × 概率)

| # | 弱点 | 证据与量化 | 备注 |
|---|------|-----------|------|
| **W1** | **每轮上下文经济结构性失控**:全文逐轮沉淀 + 零缓存纪律 + 滑窗失配 | 零缓存口径 N≈8-9 撞 128K 默认窗;滑窗 26 轮前恒 no-op;0 处 cache_control;跨轮披露数字变灭隐式前缀缓存(轮内不灭) | 概率 100%,但**处方依赖第 0 步打点**(上游有无隐式缓存决定先做披露移位还是 cache_control) |
| **W2** | **配额口径与长会话写作冲突**:raw 1x 计 cache_read | Pro 个位数轮耗尽日额度;wind-down 同口径极易截断整节起草 | **W1 的下游 + 定价决策**,非独立第二名;须与缓存优化捆绑切换(含 vip 侧四处,见 §4.1-6) |
| **W3** | **编辑面无稳定块身份 + 合并粒度断层** | 改公式内容→restoreBlockMeta 失配→全文 `\ref` 静默 undefined;用户轮中编辑被整体覆盖;overrides 假门(兼 V2-A5 假前提) | 长文档高概率;数据丢失级 |
| **W5** | **轮次生命周期无服务端契约** | 重入静默 commit 未看过的半成品;stop 轮帧层不可区分照走 autoApply;reject 可流式中抽换 cwd;apply 依赖 tab 存活 | 信任级故障;**近期项(epoch+aborted 标记+异常轮门)成本仅数天,应进第一批**——位次上调 |
| **W4** | **质量/编译信号 agent 全盲,闭环有断点** | 编译失败横幅藏在默认隐藏的 pdfPane;修复轮靠手点、行号错位;authors 双重死端 | 两个实际断点(横幅、authors)前端小改即覆盖大头 |
| **W6** | **单档能力面**:改错别字与整节起草同价同通道 | 每次交互 = 完整 agent 轮 + 全史重发 + prepare/apply 全流程;无选区级快通道 | 概率 100% |
| **W7** | **方言表达力缺口** | 公式无锚且无造锚途径;非 latex 围栏 = raw LaTeX 注入必炸;表格单元格数学/引用全丢;theorem/listing 缺位 | 学术写作核心能力残缺 |
| **W8** | **seed 静默失败 + 记忆读环 + 协议热改**(收窄后) | seed 失败仅 Debug→存量会话可能无协议裸跑;user 记忆活会话不可见;协议编译期固化 | 首轮双注入(~2K tok 一次性)降为噪声级小项;画像读环已证伪移出 |

---

## 4. 目标架构

### 4.0 总原则:先测量后动刀

`turnLoop.ts` 的 normUsage 已带 cache_read/cache_creation。**第 0 步**(1-2 周,与止血项并行):agent_usage/llmusage 聚合出 per-round billed input、cache_read/input 比率、prism 文档字符数分布、每项目轮数分布,并列为 Prism 常设健康指标。所有中期/远期档挂**取消条件**:近期档落地后若 P90 每轮未缓存 input 低于阈值(建议 40K)且项目轮数 P90 < 15,则取消双模投影(4.2-7)与摘要式 compaction(4.1-8)。

### 4.1 W1+W2:上下文经济与计费

**近期(不动契约)**
1. **预算披露 append 化**:budgetDisclosure 从 system 移除,数字 append 到最新 user 消息尾部(与信封通道天然合一;放弃「量化档位」备选——档位跨越仍打断缓存且引入新概念)。收益条件化:上游有隐式前缀缓存时立即生效;若打点显示比率为零且为 Anthropic 协议,则首要动作改为 **cache_control 断点**(system 尾 + 最后稳定消息处)。改动都便宜,顺序由打点定。
2. **microcompaction(白名单 + 批量边界)**:发送上游前,把「早于最近 2-3 轮」的**可恢复且已过期**类 tool_result(document.md/references.bib 的 Read、Glob/Grep 结果)替换为一行存根;`is_error` 豁免;**lens/Skill 正文豁免按年龄淘汰**(它是仍在生效的写作规范,存根化等于中途静默撤掉 agent 正在遵循的指导),只做同名 lens 去重保最新。**边界按批推进**(每 5 轮或累计体积过阈值时批量前移),不逐轮滑动——逐轮滑动等于每轮在历史中段改写一处、其后前缀缓存每轮作废;真实收益 = 每轮未缓存底价压到「hot tail(2-3 份全文)+ 底盘」。**前置依赖**:存根文案「可重新 Read」在 Read 无 offset/limit 且单文件现状下会诱导 13.5K tok 整读回吐收益——同批给 Read 补 offset/limit(`registry.ts`,一并修 spec.go MultiEdit 注释漂移)。改 `ws.ts`/`window.ts` 旁新增一层,journal 无损。
3. **滑窗参数修正(纯配置)**:触发公式改为逼近 effectiveWindow−安全垫,KEEP_TURNS 按 prism 轮型修正。原稿的「~55% 分级清理层」**删除**——与 microcompaction 职责重叠,一套按年龄的机制够了。per-feature 化需 executor 协议扩展(SessionMeta 无 feature 字段,CreateOpts/seed 需带 feature),列为小契约变更而非配置项。
4. **planner 双漏修**:`planner.go` 用 `llmusage.WithCall` 注入(CallFromCtx 是读取方)修 user_id=NULL 与 feature 兜底 peer_review;手放配额;降至 agent tier 体系的低档模型(planner 走 executor tier/modelID,不是 thirdparty 的 ModelLow)且仅 needs_refine 才跑。
5. **两闸口径统一**:MAX_TURN_TOKENS 与 wind-down 统一 raw 四类,5M 闸定位兜底;修 `hooks.go:109` 注释漂移。纯工程,无需拍板。

**中期(动局部契约)**
6. **配额口径加权(owner 拍板项)**:cache_read 按折扣系数(建议 0.1-0.25x)计入日额度。**四处同批切**:`vip.AddUsage`、`RemainingBudget`(`spec.go:119-124`→stampBudget→披露)、`OverdraftTokens`、wind-down 判定——只改 AddUsage 会使披露数字与实际扣减背离,制造新的「额度骗人」。llmusage 保留 raw 原始列,新增 weighted 列,admin 双口径展示。**过渡措施**(owner 决策慢时):先上 admin 面板 per-user cache_read 占比 + 名义/加权双口径预览,纯观测,给拍板供数据。与缓存优化捆绑上线,否则「缓存省的钱全归平台、用户额度照扣」。

**远期(换代,挂取消条件)**
7. **摘要式 compaction**:窗口触发时 backend 编排低档模型把将丢轮次折叠成 500-1,000 tok 工作状态摘要(已定写作决策/风格纠正/待办/未解编译错)插入新窗口头再砍。注意:原稿引用的 `ai.SimpleCompletion`/usermemory 抽取链路**已迁走**(`service_llm.go:69-70` 明注移除,抽取现走 agent 的 extract_memory 帧)——实现走现存原语 `ChatCompletionWithTools` 或 agent 侧帧,设计时再定;CLAUDE.md 的 SimpleCompletion 陈旧记载同批修正。

### 4.2 W3+W7:编辑面(稳定身份 → 按节文件)

**近期(不动契约)**
1. **骤降守卫(服务端版)**:`mergeEditorInto` 检测块数 −30%/字数 −40% 且指令无删除语义 → 返回 typed error;**ApplyRound 持久化 requires_confirmation 状态,所有 apply 路径(autoApply/重入 commitAndIndicate/多端)一律被拒并回专用 code**,前端据此弹确认 diff。前端-only 或 merge-内-only 的实现会被 `usePrismChat.ts:352-358` 重入自动固化路径绕过,形同虚设。
2. **restoreBlockMeta 模糊化**:精确键升级为空白归一化 + 小编辑距离,「改措辞即丢锚」降为「大改才丢」。
3. **公式锚语法补齐**:`md_bridge.go` 双向支持 `$$...$$ {#eq:x}`;同批 fenced 围栏语言标白名单(非 latex 语言标拒收为 opaque,返回可操作错误)。改动小、向后兼容。
4. **overrides 假门:先删声明**:`ws_round.go:140-143` 删掉 struct 轨的 overrides 声明;**同时给 DESIGN-V2 提交一行勘误**(A5 的「overrides 地基已具备」限 legacy 轨,struct 轨为假门;Block ID 落地前强制审阅门只能整轮全收/全弃)。块级事后取舍 vs A5-3 的候选挑选是两种竞争性作者在环形态,与 A5 一起拍一次,不各自排期。

**中期——稳定 Block ID(地基,V2-A1 的硬前置)**
5. DocStruct `Block.ID` 持久化(base36 短 ID 终身跟随,行内锚 `{#b:a3f7}`),但按批判收窄:
   - **只给可引用块发锚**(heading/math/figure/table/displayMath),段落不发——段落是最高频编辑对象,全量发锚 markdown 噪声大、协议教学负担重,且 agent 重写段落丢锚与今天丢 `{#label}` 是同一失效模式;
   - **parse 侧 lint**:重复 ID(agent 复制段落)消歧规则、缺失 ID 重发规则;下游(V2-A1 DocPlan 旁路 map)**必须容忍 ID 换代**(丢锚块重发 ID → 旁路账悬空要有回收);
   - **WYSIWYG 存活性**:tiptap split 时原 ID 归前半、后半留空由后端 apply 补发;DocPlan 旁路账 split 跟随原 ID、merge 保留被并入方并标 dirty;加一条 emitSig 同款往返回归测试——这是消化 V2「转换器不携带的字段用户敲一个字符就蒸发」的硬约束,不是绕开;
   - 承诺收窄为「**带锚块不丢身份**」,不是「消灭丢锚」。
6. **表达力扩容(每块型一个独立小项目,非列表项)**:表格单元格 `[][]string→[][]Inline` 牵动存量数据兼容/struct↔tiptap/md_bridge/projector/DiffMarks 五处;theorem/listing 块型三处联动。按真实用户需求排队,theorem 优先。

**远期(证据门:打点显示大文档残余痛才做)**
7. **双模投影 + 按节文件为终态**:`materializeProject` 超阈值(~30K 字符)切 `outline.md`(节树+每节 ID/字数/sha/一行摘要)+ `sections/NN-slug.md`;协议改「先读 outline,只读目标节及邻居」;ApplyRound 按节读回(sha 不变跳过);小文档保持单文件。按节拆后单节 <10K 字符,**原生 Edit 的多匹配/错位问题大幅缓解——收益已占大头**。
8. **node 级 builtin 工具降级为附录 B 计划**:仅当按节文件实测仍失败才考虑(自定义工具偏离模型训练分布,原稿自认收益占比小)。若做:registry.ts 新增 + **backend permissionAllowed 白名单放行(铁律,TodayDate 踩过)**+ 块内容参数保持 markdown 字符串(aider 教训)。
9. **不做**:fast-apply 小模型合并(~2% 静默错误不可接受)、CRDT/Yjs(回合制非实时共编)。

### 4.3 W4:质量闭环回流

**近期(不动契约,前端小改覆盖大头)**
1. **编译失败横幅解耦 pdfPane**:错误指示与「让 AI 修复」入口挂 header 常驻(`PrismWorkspaceV2`)。
2. **回执扫描补盲区**:quality.go 扩 heading/caption 引用语法与 opaque 内 `\cite`。
3. **authors 死端拆弹**:conformance 缺作者/机构类不渲染「让 AI 修复」(必然修不成还烧轮),改跳转设置提示;中期补 authors 编辑 UI(emitSig 签名面同步扩,memory 已预警)。

**中期——逐轮信封通道(两阶段)**
4. **阶段一(前端拼装验证,几天)**:前端本就是轮次编排者,直接把「文档新鲜度一行 + 上轮回执 delta + 编译状态」拼进自己发出的 user_message 文本,渲染回显时剥掉自己拼的前缀(userEchoFrame 泄漏只存在于 hub 侧注入——前端不知道注入了什么;自己拼的自己能过滤)。跑两周看 agent 是否真的少犯悬空引用/少盲读,**信号无效直接省掉整条正式管道**。
5. **阶段二(正式 plumbing,信号验证有效后)**:定稿写入方模型——**backend-known 信号**(回执 delta/编译状态/新鲜度 delta)由 hub 在 `handleUserMessage` 服务端盖章(stampBudget 同款,免客户端信任、免 prepare 时刻过期);**前端-known 信号**(V2-B2 section-role)走 V2 §0 路径 (a) 的独立帧字段,hub 只透传不回吐;两字段均剥离 echo 面。显式声明这是 V2 §0(a)+(b 变体) 的合并实现。**信封 v1 只带三项**(回执 delta/编译状态/新鲜度 delta),B2 字段留到 V2 阶段 0 的 gate 通过再扩,不预建承载格式。
6. **轮内自查改走信封回喂**(替代原「validate_document builtin」——parse+quality 是 backend Go 代码,executor TS 无调用通道,builtin 形态无法落地且违反「agent 黑盒」不动项):轮末 backend 对 cwd document.md 跑 parseEditorMarkdown+quality,结果经信封在下一轮回喂。零新工具、零 TS 重实现。
7. **有界自动修复轮:推迟**。它是「服务端自主发起 LLM 轮」这一新类别的无人值守花费(用户关页后仍烧配额),等信封通道 + tainted 判定都落地后再评估,不进目标架构主线。

### 4.4 W5:轮次生命周期服务端化

**近期(第一批,数天成本,信任级止血)**
1. **round epoch**:PrepareRound 返回世代号(基线 sha),ApplyRound 校验不符即拒;hub inFlight 时 prepare/reject 返回 409。**补数据通路**:重入 tab 从未调过 prepare 拿不到 epoch——pending 响应携带服务端存的当前 epoch,重入 commit 才不会必 409。
2. **stop 轮可识别 + 异常轮确认门**:`turnLoop.ts` finally 照发 message_complete,帧层无 abort 信息——**hub 在转发 stop_generation 时记录本轮 aborted,带进轮终态**。失败/中断/stop 轮的残留 pending 改「展示 diff + 确认门」,不再静默 commitAndIndicate。成功轮 autoApply 现状保持,**但其默认态归开放问题 #1,不列入「不该动」**。

**中期——与 V2-A5 联合裁决(见开放问题 #1)**
3. **服务端 pending 固化点(机制与策略分离)**:backend 在 message_complete 时计算并持久化 pending(消灭断网/多端竞态、编译触发服务端化 sha 去重已在);**是否 auto-commit 由 per-user/per-粒度策略位决定**——A5 落地时翻默认即可,机制先行、策略随裁决。实现需**扩展轮终态契约**:现有 `FeatureSpec.OnMessageComplete(ctx, userID, usage)` 不带 sessionID,prism 无法定位项目——新增 `OnTurnComplete(ctx, userID, sessionID, aborted, usage)`,一次契约变更同时解决 stop 识别(上条)与服务端定位两件事。异常轮标 tainted 不固化。配套服务端异步失败的站内信/前端状态提示(故障归属从 toast 变异步,不配套会更难排查)。**证据门**:纯「服务端 apply 治滞留」的残余收益在 epoch+确认门落地后已小,以实测滞留事故计数决定推进节奏;但作为 A5 审阅门的 plumbing 则随 #1 裁决走。
4. **远期**:显式 round 状态机落 DB(round_id/state/epoch)。仅当多作者协作提上日程再做;届时需为 V2-A1 的 Plan/Draft 新轮型留位(Plan 轮只动 DocPlan 旁路 map,epoch 校验/pending 字节比较语义需单独开洞)。

### 4.5 W6:能力分档(快通道)

**近期(独立可上,两步收窄)**
1. **第一步只上评议类动词**(解释这段/挑论证漏洞/审稿人视角,可复用 peerreview lens 资产):新端点 `POST /api/v1/user/prism/:projectId/inline-edit`,结果只进 popover 不碰正文,零 accept 流程零风险。**实现基座修正**:`ai.SimpleCompletion` 已不存在(唯一消费者 usermemory 已迁 agent 容器)——走现存 `ai.StreamChatCompletionWithLevel`(SSE 已有)或新增薄封装;prompt 模板放 `internal/prompts/`;handler 手放 `vip.CheckDailyQuota` + `llmusage.Record`(抄 peerreview Submit 先例,source 起独立 kind 便于对账)+ per-user 限流 + **selection/contextBefore/After 长度 cap**(否则超长选区把便宜通道变刷额度面)。
2. **第二步看使用率再决定改写类**:改写/压缩/扩写首版**单候选 + 纯文本预览**(popover),Accept 才走 flush→结构化替换→emitSig 一次落盘——复用铁律路径,**禁止在 agent patch 之外开第二条裸写 DocStruct 的通道**。多候选(2-3)与 tiptap decoration 流式 diff 推迟到验证之后;多候选组件做成与 V2-A5-3 共用的前端件。
3. **升级桥**:Cmd-K 面板底部「交给智能助手」,带选区+指令注入主会话。
4. **与 V2-A5 的动词边界**(写进 §4.7 表):纯文本选区变换(无工具、输出只落回选区)一律快通道(压缩/扩写/更学术);依赖会话上下文/voice 记忆/工具的归 A5 任务动词(用我的语气重写)。
5. **移出承诺范围**:节级动词、⌘J 续写(第二步后按需求评估);被动 Tab 补全不做(无 Fusion 级小模型);**task-scoped ephemeral 会话(prism_task)降级**——在快通道与 A5 边界划清之前预设第三条通道没有证据,一条新 agentbridge feature 是配额+计费+WS+前端会话管理的完整面,等升级桥点击数据证明「缝」真实存在再建。
6. **开放问题 #3**:快通道模型池归属(third_party_accounts 池 vs agent_config provider)——同一篇论文的选区改写与整轮改写出自不同厂商,风格/术语一致性无约束,需显式拍板。

### 4.6 W8 + 会话可弃化

**近期(第一批)**
1. **手动「重开会话」提到第一周**(原稿错绑在 memory block 后):DocStruct 真源在 DB,重开只丢聊天连续性,文档零损失;复用现成 `recreateProjectSession`(edit.go)几乎零新代码;文案诚实(「对话记忆会重置,文稿/画像/文献库不丢」)。这是 N≈8 撞墙的**当日止血**,也让所有后续上下文优化可以按数据从容推进。不自动重建(尊重 auto-reset 下线的历史决策)。
2. **seed 失败 fail-closed**:`hub.go:327-328` Debug 升 Error + 有限重试 + 失败拒绝放行首条消息(prompt_unavailable 同款语义)。W8 里真正值钱的一条。
3. **重连 seed 增强**:追加论文地图一份 + 「历史中的文档读取已全部失效,请重新读取」提示。**修正原稿措辞**:论文地图**不「常驻 system」**——地图内容随文档变,常驻即第二个 budgetDisclosure(每轮变灭缓存的同款错误);正确形态 = seed 时一份 + 逐轮 delta 走信封(§4.3),文档新鲜度信息**只此两条通道**,原稿的三通道(信封+seed+cwd outline.md 常驻)砍掉重叠——outline.md 属远期按节文件方案自带,届时信封 delta 只报「哪些节变了」。
4. **首轮双注入修复降权为小项**:一次性 ~2K tok 在总账里是噪声;且 `buildCreateOptions`/`markPromptInjected` 是 agentbridge 未导出方法,修复需新导出 API,只影响新会话(存量会话双份持续存在,随重开会话自然清零)。顺手做,不占优先级。

**中期**
5. **project-scoped memory block**:label=terminology/decisions 挂 project_id,轮后异步抽取(抽取执行走 agent 容器 extract_memory 帧现状,不是已移除的 ai 链路),经信封 delta 下发(同时修复 user 记忆活会话读环)。**与 V2-A2b 划界**:A2b=style/voice、抽取源为用户既往 prose、保留 V2 证据 gate;本项=terminology/decisions、抽取源为对话内纠正,**不受 A2b gate 约束**,label 命名空间分开。这是会话可弃化(含画像 invalidate 从「丢史」变「近无损」)的前置。
6. **不做** orchestrator-worker 起草扇出(voice/术语强耦合 + 15x token);只读 breadth 任务(多视角审读)可 fan-out,模式向 peerreview 看齐,每子会话只回传 1-2K tok 蒸馏。

### 4.7 与 DESIGN-V2 的边界与共用件(修订表)

| 本文项 | V2 项 | 关系 |
|---|---|---|
| 稳定 Block ID(4.2-5) | A1 DocPlan 旁路 map | 本文是 V2 硬前置,先做;A1 须容忍 ID 换代;A1 的 Plan/Draft 轮型对 4.4 轮次契约提出留位需求 |
| 成功轮 autoApply / 服务端 pending(4.4-2/3) | **A5-1/A5-2(autoApply 降为显式特例 + 强制审阅门)** | **正面冲突,开放问题 #1**;推荐机制/策略分离:服务端 pending 固化为机制,auto-commit 为策略位,A5 落地翻默认 |
| 快通道动词(4.5) | **A5-3 任务动词** | 边界已裁:纯文本选区变换→快通道;依赖会话/voice/工具→A5;2-3 候选做共用前端组件 |
| project memory block(4.6-5) | **A2b(style voice,带证据 gate)** | label 命名空间分开;A2b 的 gate 完整保留,本项不绕过 |
| 逐轮信封(4.3-4/5) | B2 软 steer 短名单(V2 §0 路径 a) | 同一帧的两类字段两种 writer(hub 盖章 + 前端透传);信封 v1 不含 B2 字段,gate 过再扩 |
| 回执 delta 回流(4.3) | A4 delta 锚定自动回退 | 同一铁律,本文管管道、V2 管信号内容 |
| microcompaction(4.1-2) | B1 菜单帽/命中率计量 | 白名单化后**不再声称**「顺带解决 lens 重复加载」——lens 只做同名去重保最新,按年龄淘汰豁免;排期避开 C1 度量窗 |
| overrides 假门(4.2-4) | A5 的「地基已具备」前提 | **V2 勘误**:该前提仅 legacy 轨为真,struct 轨为假门 |

---

## 5. 四个核心问题的明确答案

**a) 编辑面要不要从「全文 markdown 桥」演进到 node 级?——终态是「稳定 ID(仅可引用块)+ 按节文件 + 原生 Edit」,node 级自定义工具降为 B 计划。**
先稳定 Block ID(单独消灭带锚块丢身份),再按文档长度路由:小文档保留全文桥,超 ~30K 字符切 outline + 按节文件——按节拆后单节 <10K 字符,原生 Edit 的痛点已消大半,模型对原生文本编辑的训练分布远厚于自定义结构工具。node 工具只在按节文件实测仍失败时启动(附录级)。整条 4.2 远期线挂取消条件:近期档后打点显示残余痛才做。

**b) 每轮上下文的正确策略:全文不在场,「地图 seed 一份 + 信封 delta + 目标节按需 + 历史存根化(白名单)」。**
真源在 DB 使旧 Read 结果是纯负资产(过期 + 占窗 + distractor),可激进存根化;但 lens 正文是仍在生效的规范,豁免淘汰。地图**不常驻 system**(内容随文档变会灭缓存),seed 一份 + 逐轮 delta 走信封。一切阈值先打点后定,缓存动作(披露 append vs cache_control)按上游 provider 实况二选一。

**c) per-project 持久会话对不对?——方向对,「不可弃」错;且止血不等 memory block。**
写作讨论有真实连续性需求,保留主会话;但解法是软状态外置使会话可弃:第一周先上手动重开(文档零损失,复用 recreateProjectSession),中期 project memory block(terminology/decisions,与 V2-A2b 的 style 分命名空间)落地后重开/画像 invalidate 变近无损,再评估阈值提示(不自动,尊重 auto-reset 下线决策)。

**d) 能力面要不要分档?——必须分,但收窄为「快通道两步 + agent 轮」两通道。**
评议类动词先行(popover 只读零风险)验证通道,改写类看使用率再上(单候选纯文本预览,Accept 走 emitSig 铁律路径);实现基座是 `ai.StreamChatCompletionWithLevel`(SimpleCompletion 已移除,CLAUDE.md 同批勘误);handler 手放配额+计费+长度 cap。ephemeral prism_task 第三通道降级为证据门后评估。分档不违反「不中途换模型」铁律——快通道根本不在 session 内。

---

## 6. 不该动的(验证过,别碰)

1. **DocStruct 真源在 DB + 追加式版本链**——所有失败模式的最后兜底,也是「历史正文可激进丢弃」「会话可弃」的前提。
2. **structWriteMu 每项目写锁 + flush→save→prepare 纪律 + emitSig 回声判定 + onPick 铁律链**——任何新写入路径(含快通道改写类)必须复用而非绕开。
3. **确定性 projector**(纯函数、模板注册表、wrapCJKInMath、caption 先于 label)。
4. **decidePermission cwd 围栏 + disallowedTools 双墙**;新增 builtin 必过 permissionAllowed 白名单(TodayDate 教训)。
5. **SS#2 有界透支 + 优雅收尾机制**(disclosure 一次、自我配速、非硬杀)——只改披露的载体位置与(拍板后的)口径,不动机制。
6. **ws-ticket 30s 一次性 WS 鉴权**(裸 JWT 回落别加回)。
7. **mergeEditorInto 空值守卫**(只增强不移除);authors/affiliations/targetTemplate 不进编辑面的隔离保留。
8. **agent 黑盒 jsonl,backend 不读**——状态交换只走帧协议与 cwd 文件(4.3-6 的轮末质检正是据此改为 backend 对 cwd 跑而非 executor builtin)。
9. **静态分级 + 首轮锁定,绝不中途换模型**(KV-cache 铁律)。
10. **确定性质量回执,绝不信模型自评**——信封只运送确定性信号。
11. **编译 cacheKey sha 复用 + 沙箱 network_none**。
12. ~~autoApply 成功轮~~ **已从本清单移除**:它与 V2-A5-1(已定稿)正面冲突,归开放问题 #1;近期保持现状,但不再享有「不该动」地位。

---

## 7. 落地路线(与 DESIGN-V2 阶段 0-2 合并的一张时间线)

**第 0 批(第 1 周,止血 + 行为中性 + 打点)**
- 打点第 0 步:per-round billed input / cache_read 比率 / 文档字符分布 / 每项目轮数分布(§4.0)
- 手动重开会话按钮(4.6-1)· seed 失败 fail-closed(4.6-2)
- round epoch + pending 携带 epoch + hub aborted 标记 + 异常/stop 轮确认门(4.4-1/2)
- budgetDisclosure append 化(4.1-1,行为近中性)· Read offset/limit(4.1-2 前置)
- planner 双漏修(4.1-4)· 两闸口径统一(4.1-5)· overrides 删声明 + V2 勘误(4.2-4)
- **V2 阶段 0 项同批上线**(B1/B3/B2 层一/A3/A4/C1/C3/C4)

**度量冻结窗(2-4 周,C1 在线信号期间不改 agent 可见历史/行为)**
- 只做 agent 行为中性项:编辑面护栏(骤降守卫服务端版 4.2-1、restoreBlockMeta 模糊化 4.2-2、公式锚+围栏白名单 4.2-3)、闭环前端断点(4.3-1/2/3)、快通道评议类 MVP(4.5-1,独立通道)、admin 配额双口径观测面板(4.1-6 过渡)

**窗后按读数 gate(第 5-8 周)**
- 缓存动作二选一落地:隐式缓存存在→披露收益确认;为零且 Anthropic 协议→cache_control 断点(4.1-1/中期 7)
- microcompaction(白名单+批量边界,4.1-2)+ 滑窗参数修正含 feature 字段协议扩展(4.1-3)
- V2-B2 层二同窗 gate;信封阶段一(前端拼装验证,4.3-4)启动
- **决策门评估**:P90 未缓存 input 低于阈值 → 取消 4.2-7 双模投影与 4.1-8 摘要 compaction
- 配额加权 owner 拍板 → vip 四处同批切(4.1-6)

**中期(第 2-3 月)**
- 稳定 Block ID(4.2-5,解锁 V2-A1)→ 信封阶段二正式 plumbing(4.3-5,解锁质量回流+记忆读环+V2-B2 承载)→ project memory block(4.6-5)
- **A5 + autoApply 默认态 + 服务端 pending 固化联合裁决**(开放问题 #1)→ 按裁决实施 4.4-3 与 V2 阶段 1
- 快通道改写类(按第一步使用率,4.5-2)· theorem 块型(4.2-6 首个)

**远期(证据门,不排日历)**
- 双模投影+按节文件(4.2-7)→ node 工具 B 计划(4.2-8)· 摘要式 compaction(4.1-8)· 有界自动修复轮(4.3-7)· 显式 round 状态机/多作者(4.4-4)· ephemeral prism_task(4.5-5)

---

## 8. 开放问题 / 需 owner 拍板

1. **autoApply 默认态(最高优先,两份定稿正面冲突)**:选项 A=接受 V2-A5-1(autoApply 降为显式特例;本文推荐,配套机制/策略分离——服务端 pending 固化 + per-user/per-粒度策略位,A5 落地翻默认);选项 B=推翻 A5-1 维持 autoApply(V2 出勘误重拍)。当前互相顶撞的状态不能带进实施。附属裁决:块级事后取舍 vs 候选挑选二选一(4.2-4)。
2. **配额 cache_read 折扣系数**(建议 0.1-0.25x):直接影响 ARPU,收入决策;但必须与缓存优化捆绑,且 vip 四处同批切(4.1-6)。过渡观测面板可先行。
3. **快通道模型池归属**:third_party_accounts 池(实现快)vs 复用 agent_config provider(跨通道风格一致);连带 llmusage source kind 命名。
4. **服务端 apply 推进节奏**:epoch+确认门后残余收益小,以滞留事故实测计数为证据门,还是随 #1 直接作为 A5 plumbing 建?
5. **重开会话的阈值提示**:闲置 N 天/token 阈值的提示要不要上(不自动重建的前提下)——尊重 auto-reset 下线历史,memory block 验证后再议。
6. **量化数字的最终校准**:本文全部增长曲线/撞窗轮数为「零缓存 + 128K 默认窗」估算(且已修正原稿的字节/字符混淆与两处配置互斥),生产 .env 实际窗口与真实 provider 确认前,W1/W2 的伤害规模按量级不按两位有效数字使用。

**诚实取舍清单(保留)**:node 工具的模型熟练度风险(灰度+度量,失败退守按节文件);服务端 apply 改变故障归属(需异步失败通知配套);cache 收益依赖 provider(打点为准,列常设健康指标);多作者协作完全未设计(structWriteMu/PendingRound 均单作者假设,入口是 4.4-4);信封阶段一的前端拼装版不解决多端一致性(它只为验证信号价值,正式一致性归阶段二)。
