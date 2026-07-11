<!--
产出方式:二轮 workflow(17 agents,0 error,~1.39M tokens)——
  Understand 3(现状/审稿对比/规模量化)+ Research 9(生成式架构/迭代闭环/共写/写作skill内容/多技能路由/上下文稀释/范例RAG/Agent Skills渐进披露/有效性度量)
  → Synthesize 1 → Critique 3(接地/真解决问题/过度工程)→ Finalize 1。
  三份对抗批判折叠;所有代码断言已核对(见正文行号)。
-->

All five load-bearing grounding claims from the critiques are now verified against code. Key confirmations: memory+persona go through system-level `AppendSystemPrompt` at CreateSession (bridge.go:896/935/939-957), with in-band first-message prefix only as fallback (line 916/924); `PreUserMessageFn` returns bare `error` (spec.go:55) and hub.go:820 forwards original `content`; `PrepareRound(ctx, userID, projectID) error` has no cursor param; `userEchoFrame(content)` broadcasts raw content to other clients (hub.go:904); the menu block is pushed after the TOTAL_CAP loop (loader.ts:134) so it bypasses the cap; `plannerSelection` is Base/Genre/WhyChosen only. Here is the final report.

---

# Prism 写作技能体系 · DESIGN-V2(终稿)

> 面向 owner 两点关切。三份对抗批判已折叠;所有代码断言均已核对(spec.go:55 / bridge.go:896–957 / hub.go:820,904 / ws_round.go:69,189 / struct_model.go:77 / loader.ts:134 / planner.go:65)。
> 标注:**【P0 必做·零 schema·零 owner 门】** / **【P1 高价值】** / **【P2 需拍板/重】** / **【不做】**。

---

# 概览

- **关切①(生成独到性)**:方向是对的——A 段取自生成式研究(outline-first / thesis-voice / lens 祈使化 / draft-critique-refine),不是审稿换皮;**但上一稿把最能体现"写才需要、评不产生"的机制(outline 状态机、贡献-证据配平)全压在需改真源 schema 的 P2 后面,导致"不需 owner 拍板即可交付"的那半几乎只剩 lens 治理**。终稿把两个纯确定性、零 schema 的生成信号——**stub 检测(空 inlines 启发式)+ notation/terminology 一致性 registry**——前移到 P0,确保即便 owner 缓批 outline,写作本轮仍有可见的生成式独立进展。
- **关切②(sk2ale 规模化)**:上一稿把 B2 层二标成"硬预筛"是**错标签**——在它自己论证的 §0 约束下(常驻菜单是 prompt-cache 前缀、逐轮不可变),前端折入的短名单只是叠加在仍全量在场的 30 条菜单之上的**软建议**,agent 可无视,与它所批判的 Phase-4"软加星"同构;**真正零成本高杠杆的规模化解 = B1 菜单加帽 + B3 近义合并(30→~20)+ B2 层一 axis 分组静态菜单**,这三件先上、量 2–4 周,再决定层二/评测 harness 是否值得建。C1–C4 研究级门禁不作前置税,降为反应式。

**一条贯穿全文的硬约束(已核实,决定 A/B 多数方案形态):**

> agentbridge **没有逐轮注入通道**。memory + 写作画像都经 `opts.AppendSystemPrompt` 在 **CreateSession 一次性下发**(bridge.go:896/935/957),in-band 首条前缀只是 Pick 失败时的 fallback(bridge.go:916/924)。`PreUserMessageFn` 只返回 `error`、纯做 gating,hub.go:820 用**原文** `content` 进 `beginTurn`/上游——**不能改写文本**(spec.go:55)。因此凡"随每轮变化"的东西(section-role 短名单、逐轮回执)只有两条路:**(a) 前端把它作为 user_message 帧的独立结构字段发出**(与 titleSeed 同乘该帧,ws_round.go:189),**且该字段不得折进 `content`**——否则 `userEchoFrame(content)`(hub.go:904)会把它广播进每个端的用户气泡并落 jsonl;或 **(b) 新增后端逐轮通道**(把 `PreUserMessageFn` 改成 `(string, error)` 并贯穿 beginTurn/上游/全部 StandardHooks 调用方——是有界但真实的后端改动,不是"也许已能用")。**默认走 (a),但不是"零 plumbing":需给 `/round/prepare` 加返回短名单 + 给 user_message 帧加一个 hub 不回吐的字段。**

---

# Part A · 写作的独到设计(逐条)

## A0 诊断:哪些是"评审残留"该翻转

| # | 评审残留 | 代码 | 为何写作不该这样 |
|---|---|---|---|
| R1 | lens=诊断清单(文字写坏后才体检) | `wl-*` `<<<LENS>>>` | 从零起草缺专属 craft |
| R2 | base 一次冻结、项目级恒定 | `planner.go` `renderProfileBlock` | 论文逐节生长,需求随 section 漂移 |
| R3 | base 只承载学科 register,无"作者要说什么"通道 | `venueDisciplineMap` | 生成的灵魂是作者论点/voice |
| R4 | 回执只查机械违规 | `quality.go:computeQualityReceipt`(核实:只查悬空 cite/未定义 xref/超长句) | 缺 stub/覆盖/一致性等生成原生信号 |
| R5 | lens 选择全交 agent,后端零收窄 | `PrepareRound`(核实:无 cursor 参数) | 30 条近义正中"选择失效" |
| R7 | 静默兜底默认画像 | `builtinWritingProfile`+`NeedsRefine` | 写作用错时态/引用制作者难察觉 |

---

## A1 显式生成主轴:Outline-first 【P2 需拍板 — 改动面最大、价值最高】

**是什么**:`plan → 逐节条件化 draft → in-loop gate → commit` 状态机。DocStruct 是天然 plan container,但 `DefaultDocStruct()` 只给空段,agent 直接落散文,缺"先造骨架再填肉"层。

**为何写作独有**:审稿拿到完整文档一眼读全;写作必须**无中生有先造结构**再顺序建造(WriteHERE/AgentWrite/STORM/Dramatron 一致)。

**Prism 落地(已按批判修正两处接地错误)**:

1. **plan 元数据用 sidecar map,不加 `Block` 字段**(核实:`struct_model.go:77` Block 现无任何 plan 字段,是 net-new)。**关键修正**:Prism 编辑器现在是 **Tiptap WYSIWYG,struct 为真源、StructEditor 防抖回写**(见 memory `prism-wysiwyg-tiptap`)。若把 `Intent/TargetLen/Covers/Drafted` 加成 `Block` 字段,而 struct↔tiptap 转换器不携带,则用户往某节敲一个字符就会**静默抹掉该节 plan 账**。→ 改为把 plan 元数据存在**以 `Block.ID` 为键的旁路 map**(`DocPlan map[blockID]PlanMeta`),与 Block 正交、与 projector.go / tiptap 转换器解耦,WYSIWYG 编辑天然不触碰它。
2. **Plan 动作 / Draft 动作是新 round 类型,不是新 skill**:Plan 播章节骨架(每节带 intent+targetLen+covers,`drafted=false`),作者可先审这层(复用 apply/reject 门)再触发 Draft;Draft 按拓扑序对 `drafted=false` 节点逐节落散文。
3. **骨架种子 = `pw-*` 文体人格**的 IMRaD/systematic-review/rebuttal outline 模板 + 各节 intent 约定 + 长度基线。
4. **【不做 carried-forward 重机构】**:Re3/Dramatron 的 running summary/背着走的记忆是为**看不到全文的盲式顺序生成**设计的;Prism 每轮 `materializeProject` 把整份 DocStruct 铺进上下文,agent 直接看得到全文——不搬 running-summary 那套。只留最小 plan 账。

**UX【需拍板】**:Outline-first **不强制**,做成可选"从大纲开始"入口,保留"直接落笔"。

---

## A2 学科底座 + 作者意图/voice 双通道 —— 拆成两半,便宜的先上

**为何**:base 给共性语域;生成灵魂是作者论点与嗓音。用作者自身文本抽 ~5 个可解释风格特征注入,心理所有权 +0.43 且采纳率同升(通常两者相反)——最高 ROI 单项。

**修正:拆分,别把便宜确定收益拖在昂贵不确定管线后面**:

- **A2a【P1 便宜·确定】**:① project-level **thesis 一行**("这篇要论证什么/核心贡献"),注入 `renderProfileBlock`;② **`NeedsRefine` 接主动询问**(修 R7)——落到 `builtinWritingProfile` 且 `NeedsRefine=true` 时前端主动弹一次轻确认,而非静默按通用 STEM 起草。两者都不依赖抽取管线。
- **A2b【P2 昂贵·不确定】**:`label=style` 的 `user_memory_block`,后台从用户 `.tex` 异步抽 ~5 特征。**批判修正的接地事实**:它经 `AppendSystemPrompt`(非 in-band),**只在 session 创建时生效**,session 中途改画像不会即时生效(需 `invalidateSessionForProfile` 式重建,与现有 persona/profile 生命周期一致)——文档须写明,别承诺实时。且只惠及已有既往 prose 的用户。延后到 thesis 注入点被证明可用、且有证据"通用 AI 腔"确是头部抱怨后再做。

---

## A3 lens 从"评审清单"翻转为"生成动作" + 双轴写死 【P0】

1. **craft lens 四件套**:① 一行 `生成动作:`(produce/revise/diagnose + 祈使句);② ≥1 个三段标注 before→after(❌病→✅"够得着的好"不炫技→🔍只改的那一个特征);③ 高频 move 给可填空句骨(适配 `[@key]`/`[@fig:x]`);④ 显式"别动/豁免清单"。
2. **补齐生成原生 lens**(审稿维度没有的):`wl-expand`⇄`wl-compress`、`wl-blank-page`(允许 `%TODO` 哨兵、绝不留空节)、`wl-scaffold-templates`(They Say/I Say + Phrasebank)、`wl-voice-register`(采样邻近 2–3 段做 self-exemplar 镜像句长/hedge)、`wl-revision-strategy`(meta,优先级最高:reverse-outline → HOC 先 → LOC 后 + 别动清单)。
3. **双轴写死**(进分类文档 + lint):`rigor`(`wl-rl-*`,18 条)= 谓词/自查门,保留清单形态;`craft` = 生成,四件套形态。新增 lens **先选轴**。

---

## A4 draft-critique-refine 闭环,锚在确定性回执 【P0 — 但修依赖倒挂】

**铁律**:采纳/回退对齐 `quality.go` 回执 delta,**绝不把"模型自称更好了"当接受信号**(self-refine 放大 self-bias,六模型实证);任一 anchored 指标变差自动回退。

**扩 `quality.go` 加生成侧确定性信号 —— 修正依赖倒挂**:上一稿把 stub(靠 `Block.Drafted`)、covered 缺口(靠 `Block.Covers`)都标 P0,但这两字段是 A1(P2)才有的 net-new schema → **P0 承诺无法兑现**。终稿分层:

- **【P0·零 schema】stub 检测 = 空 `Inlines` 启发式**:直接从内容判"这节还是骨架吗",不依赖 `Drafted` 字段(Drafted 本就是可从内容推导的属性,持久化反而引漂移)。
- **【P0·零 schema·补批判漏项】notation/terminology 一致性 registry**:跨 `Block` 抽 记号↔含义 / 缩写↔全称 / label↔指代,冲突即标(如"σ 在 §3 是标准差、§5 被当求和号")。**纯结构可算、不需 LLM、不撞 §0 逐轮约束、天然是写作独有而审稿不产生的账**——这是批判点名的、上一稿漏掉的最高 ROI 低争议生成信号,提为 P0。
- **【随 A1 一起 P2】贡献-证据配平 / covered 缺口**:依赖 A1 的 covers 账,与 A1 同 gate。

**in-loop gate**(commit 前,廉价):每节 draft 后只查三件——与上节衔接 / 覆盖本节 intent / 没重复;不过则**有界重写一次**。**有界迭代**封顶 ~3 轮,轮间 anchored delta≈0 提前停,**停止判据是外部回执非模型自述**。

**【不做】** cross-context throwaway 批评 session + self-bias 背离度 admin 看板 —— 研究工具,几乎注定挣不回维护成本(批判一致判定"永远不会 pull its weight")。

---

## A5 作者在环:粒度、礼仪、检索时序 【P1】

> **勘误(2026-07-10,来自 AGENT-ARCHITECTURE 全链路核查)**:本节原判「`ws_round.go:ApplyRound` 的
> per-file/per-hunk `overrides` 地基已具备」**仅对 legacy 轨为真**。struct 轨(现役)在
> `ws_round.go` 的 SchemaStruct 分支直调 `applyStructRound`(整篇 parse 合并),**overrides 被静默忽略
> ——是假门**。在稳定 Block ID 落地前,struct 轨的作者在环审阅只能「整轮全收 / 全弃」;
> 块级事后取舍 vs A5-3 的候选挑选是两种竞争形态,与 autoApply 默认态一起拍(见 AGENT-ARCHITECTURE 开放问题 #1)。

这块主要是**默认姿态**:

1. **autoApply 降为显式全文操作特例**:默认每条编辑走预览(struct-diff)→接受/拒绝;仅显式点"应用整段/整篇"才批量落库。
2. **粒度分流**:句级微改可内联;跨句/跨段/整节重写**强制**降级 struct-diff 审阅门。
3. **"AI 改"拆成有界任务动词**:续写/选区扩写/用我的语气重写/收紧精简/生成描述,各绑显式作用域 + "不得越界",默认最小作用域;重写类返回 **2–3 候选(含一个更大胆变体)**供作者挑,而非 agent 直接 patch 唯一结果。
4. **claims-heavy 节走 retrieval→reason→compose**(复用已装 Minicod MCP):**硬禁"先写断言、事后配引用"**(post-hoc 配引用是幻觉温床)。与现有常驻核 `prism-citation-grounding` 一致。

---

# Part B · 多 skill 规模化架构

## B0 现状量化(接地)

- 挂载(docker-compose.yml):`prism-skills`→3 核整份常驻(`PER_SKILL_CAP=8000`)、`prism-lenses`→30 wl-*(菜单行常驻、正文经 Skill 工具懒加载 `MAX_SKILL_BODY=16000`)、`prism-personas`→14 pw-*(后端 slug in-band、**0 常驻**,满分做法)。
- **病灶(核实 loader.ts)**:菜单块 `push()` 在 `TOTAL_CAP=40000` 循环**之后**(loader.ts:134),**豁免总帽且无自身上限** → 唯一随 lens 数**线性膨胀**的常驻块(30→1.6K、100→5.2K token/轮;中文 `when_to_use` ~0.65 token/字符,比英文贵近 2×)。30 条平铺、近义高度重叠、后端零收窄(`PrepareRound` 核实无 cursor)。

---

## 失效机理(实证)

工具/选项越多选择越差(~10–15 后退化,15–20 后召回悬崖);长上下文即使无干扰项也独立损害(Context-Rot,~50K 甚至更早);近义描述比条数本身更致命(lost-in-the-middle);一个改动可在自称维度变好、在真正在意的维度变差。所以 lens **不是零成本的**——"无害就留"是错的。

---

## 分级解法:轻→重

### B1【P0】菜单块加帽 + 计量(quick win,堵纯回归面)
改 loader.ts:134:菜单块纳入显式上限(≤2500 字符 / ~50 条目),触帽 `log.warn` 点名被丢项。加 slog:每会话记"常驻 token / 菜单条目数"。**批判提醒的取舍**:菜单是"有哪些技能可加载"的路由,过帽=被丢 lens **静默不可发现/不可加载**(从 token 膨胀换成"加了却用不上")。→ 触帽是**规模化到帽后必须做合并/分层的信号**,不是终态;帽只堵"无界"这个纯回归。

### B2 层一【P0】把 30 条平铺换成按 `axis` 分组的静态菜单
`buildSkillMenu` 改按 `axis` frontmatter 分组输出(`## craft` / `## rigor`),`axis` 字段已存在、零新增、缓存友好。这是官方 domain-organization 手法,目录保留广度但**可导航、有护栏**。Skill 工具仍按 name 加载单份正文(registry.ts 不变)。
> **不采用** router SKILL.md + references/ 叶子方案:registry.ts 的 Skill 工具只读 `guides/<name>/SKILL.md`,Read 工具受 cwd confine,正文放 `references/` 会既不能被 Skill 也不能被 Read 加载。

### B2 层二【P1,gate 在实测误选之后】section-role 逐轮短名单 —— 诚实定性
**批判核心修正:在 §0 约束下,前端折入的短名单是软 steer,不是硬预筛**(常驻 30 条菜单逐轮不可变、Skill 工具对任意 lens 名照常可加载、agent 可无视短名单)。与它所批的 Phase-4"软加星"同构。二选一:

- **(i) 要兑现"硬预筛"**:补一小块 plumbing —— 按 section-role 白名单**限制本轮 Skill 工具可加载的 lens 集**(agent 已有 permission_request 自动 approve 通道,扩成 per-round allow-list),这才与 peerreview `service_reviewers.go` 同构的硬收窄。→ **P2 重**,仅当软 steer 实测不足才建。
- **(ii) 不做该 plumbing**:如实降级为**软 steer**,把关切②的真实解重心压到能起作用的三件:**B2 层一 axis 分组 + B3 触发器互斥 + B1 帽**——承认"catalog 可大、收窄靠描述正交与分组导航,不靠逐轮硬过滤"。→ **默认取此。**

**若做软 steer 的落地(修两处接地)**:
- `role→eligible-lens` map(确定性纯路由无 LLM):methods/results→`wl-rl-*`+`wl-figure-narrative`;intro/discussion→craft 散文类+`wl-rl-claim-evidence`+`wl-rl-hedging`;related-work→`wl-related-work-structure`+`wl-rl-related-work-fairness`;title/abstract 节才出 `wl-title-abstract`;profile=EAL 才出 `wl-eal-chinglish`。**axis gate**:18 条 `wl-rl-*` 只在数据承载节可入选,craft 只在散文节。
- **section-role 从哪来**:`PrepareRound` 核实**无 cursor 参数、只返回 error** → 要么前端从本地 DocStruct+cursor 自算 role,要么给 `/round/prepare` 加 active-node 参数 + 返回短名单结构(现只返回 error)。
- **短名单怎么传**:**必须作为 user_message 帧的独立结构字段**(与 titleSeed 同乘,ws_round.go:189),hub 不回吐;**绝不折进 `content`**——否则 `userEchoFrame(content)`(hub.go:904)把"本轮 section=methods; 优先 wl-rl-reporting"广播进每个端的用户气泡并落 jsonl(`stripInjectionFromMessages` 只 strip 首条前缀,不 strip 逐轮 hint)。

### B3【P0·前置硬顺序】近义触发器互斥化 + 合并审计(30→~20,先于任何路由)
**合并比任何 router 都便宜**,且同时缩小"选择时刻"候选集、缩小 C 的评测面、缩小菜单常驻 token。把重叠 craft 的 `when_to_use` 改成可观测症状上互斥:`wl-cohesion-flow`(句间 given→new/悬空代词)、`wl-paragraph`(段内主题句/单一性)、`wl-structure`(节/段排序)、`wl-signposting`(节间过渡/路线图)、`wl-clarity`(词/句精简)。rigor 侧 reporting/reproducible-methods/materials-mdar/availability 高度重叠,先塌缩。**数量不是丰富度,正交才是。**

### 【P2 可选】语义 top-k 向量检索
在短名单内按段落 embedding 取 top-3。**n=30 不需要**(确定性 role-map+axis gate 已足够,RAG-MCP 过 ~100 项才退化)。保留到 catalog >80–100 再上,届时 build 期预算 embedding(零额外 LLM)。**现在不碰任何向量基础设施。**

---

## 定量准则(验收口径)

| 维度 | 准则 | 依据 |
|---|---|---|
| 常驻软上限 | system+tools+常驻核 ≤ **15–25K token**(核现 ~3196 达标) | Context-Rot |
| 菜单块上限 | ≤ **2500 字符 / ~50 条目**,触帽 warn | 唯一线性膨胀常驻块 |
| 选择时刻 | 逐轮呈现给选择 ≤ **3–5 条**(catalog 可大,choosing moment 必小) | 工具选择 ~10–15 后退化 |
| 单轮 lens 正文 | `resolveLenses` ≤5 去重,实际建议 ≤3(每份 ≤16K,4 份成倍膨胀) | 按轮计费 |
| 缓存纪律 | 常驻区 100% 静态、跨轮 byte 稳定;**只有 per-round section-role 短名单/回执走断点之后** | prompt-cache byte-for-byte |

> **批判修正的缓存纪律**:上一稿把"memory 走断点之后"写进表里是**自伤缓存**——memory 经 `AppendSystemPrompt` 本就是**缓存的 system 前缀**(bridge.go:928/935),逐轮移动它=每轮 KV-cache miss 全价重算。**只有真正逐轮变的 section-role 短名单和逐轮回执才走断点之后。**

---

# Part C · skill 准入与有效性度量(防"越加越差")

**修正定位:C 不作前置税,降为反应式。** 批判一致指出:对 30→47 条(单人/小团队维护)库,每条新 lens 附 400–600 golden set + 三条件消融 + 双向 pairwise + κ>0.6 校准作 **P0 前置门禁**,边际成本远超写一条 lens 本身,会**冻结它要保护的迭代**(上一稿诚实标注 #5 已承认却仍标 P0,自相矛盾)。

## C1【P0】默认只跑廉价在线信号 + 零命中归档
每 lens 记:**命中率**(被短名单/agent 选中频率)+ **条件胜率**(命中时相对无该 lens 的 pairwise)+ **该轮 `quality.go` 回执 delta** + **apply 接受率**。命中率≈0 → 直接归档(纯 token 负债)。**测量先于建造**:B1 的命中率计数器先埋点跑 2–4 周,用真实误选率 gate B2 层二/C2 是否值得建。

## C2【P1·反应式】重度 golden-set 消融只对被标记者跑
仅当某 lens 被在线信号判为**可疑/争议/高命中**时,才触发:目标切片 golden set(早期几十条即可,门禁级判定才 400–600)+ 三条件消融(`base` / `base+lens` / `base+lens+搭档`)+ **双向 pairwise 下注**(同稿两顺序各评、两次都赢才算赢,专治冗长偏置)+ **评委模型≠生成模型**(防自偏好)+ 上线前 κ>0.6 校准。**对 lens 组合而非单 lens 度量**(`resolveLenses` 允许 ≤5 叠加,退化常来自约束冲突)。

## C3【P0】制度化淘汰(与"加"同等操作)
命中但条件胜率不显著 >50% → 整改队列,连两轮不达标即删。GitHub 砍 Copilot 工具 40→13 换基准 +2–5pp/延迟 -400ms 是先例:**删 skill 本身是优化手段。**

## C4【P0】lint 扩展
① `axis` 必填;② craft lens 禁 `json/schema/输出格式` 词(防评价式契约污染编辑契约),rigor 可保留清单;③ **菜单描述近重复检测用 token-overlap/Jaccard 十行脚本**(**批判修正**:不上 embedding —— 与 B2"n=30 不上向量"立场一致,阈值调错反而把需区分的两条误合并成盲区);④ craft/rigor 语义边界断言。

---

# 落地路线(分阶段,必做优先)

## 阶段 0 · 轻量包先上线,量 2–4 周再决定重工程(批判点名的缺失里程碑)
真正的 80/20,全部零 schema、零 owner 门:
- **B1** 菜单加帽 + 命中率/常驻 token 计量
- **B3** 描述互斥化 + 合并审计(30→~20)——**前置硬顺序,先于任何路由**
- **B2 层一** axis 分组静态菜单
- **A3** 双轴写死 + craft 四件套 + 补生成 lens
- **A4** `quality.go`:stub(空 inlines 启发式)+ **notation/terminology 一致性 registry** + delta 锚定自动回退
- **C1/C3/C4** 在线信号 + 零命中归档 + 制度化淘汰 + lint

→ 上线后读命中率/接受率/回执 delta 日志 **2–4 周**,再 gate 阶段 1/2。

## 阶段 1 · 高价值(部分需前端/UX 决策)
- **A2a** thesis 一行 + `NeedsRefine` 主动询问(便宜、确定)
- **A5** autoApply 降级 + 任务动词拆分 + 2–3 候选
- **B2 层二(软 steer 版)** —— **仅当阶段 0 实测确有轴内误选伤害成稿才建**;走 user_message 帧独立字段(非 content 折入),`role→lens` map + axis gate,heading→role fail-open 到"全 craft + claim-evidence"
- **C2** 反应式重度消融(只对被标记 lens)

## 阶段 2 · 需 owner 拍板 / 重
- **A1** Outline-first(plan 元数据走 **Block.ID 旁路 map** 非 Block 字段;Plan/Draft 动作;covered-缺口/配平信号随此落地)
- **A2b** `label=style` voice 抽取管线(注意 AppendSystemPrompt 只在建会话生效,非实时)
- **B2 硬预筛 plumbing**(per-round Skill allow-list)—— 仅当软 steer 实测不足
- 语义 top-k(catalog >80–100)
- 范例层(**本轮仅 P0 把 wl-de-slop 现成 before→after 结构化,零新语料零版权**;范例库延后,只收 CC-BY/CC0 + verbatim 长度限 + 生成后相似度防抄闸)

## 【不做】
A4 cross-context throwaway 批评 session、self-bias 背离度看板、C4 embedding 近重复 lint。

---

# 开放问题 / 需 owner 拍板

1. **【第一个要拍的技术决策】B2 层二做软 steer 还是硬预筛?** 软 steer(默认)= 前端帧独立字段,零新后端 plumbing,但 agent 可无视;硬预筛 = per-round Skill allow-list(P2 重),与 peerreview 同构但要动 permission 通道。**建议先按阶段 0 量出"轴内误选是否真伤害成稿",没量到就别建层二**——避免为可能不存在的问题预建重机构。(**已核实**:`PreUserMessage` 不能改写文本、`PrepareRound` 无 cursor 参数,故"零 plumbing"的说法作废;上一稿"spike PreUserMessage 能否改写"这一项**删除**——代码已答 NO。)
2. **A1 是否本轮做?** 改动面最大、生成价值最高。若做,plan 元数据用 **Block.ID 旁路 map**(不加 Block 字段,避免 tiptap WYSIWYG 编辑静默抹账);需 struct 编辑器 UI + 确认 projector.go/tiptap 转换器忽略新账。**若缓批,阶段 0 的 notation registry + stub 启发式已能提供不依赖 schema 的生成式独立进展**——这是终稿相对上一稿的关键补强,确保关切①不被 A1 绑架。
3. **A2b voice 抽取的合规与预期**:只惠及已有 prose 用户;非实时(建会话生效);须有证据"通用 AI 腔"确是头部抱怨再投入。
4. **section-role 分类准确度**:中英混排/非标准节名会误判(误判→错误短名单→正是要消除的误选)。保守:识别不出退回"全 craft + claim-evidence"通用短名单,不硬猜。
5. **度量成本门槛**:C2 的 400–600 样本只在门禁级判定要;早期几十条即可。**别一上来要求全量,否则准入变成 skill 增长的枷锁。**
6. **不要 1:1 向审稿看齐**:审稿的 never-hard-fail 静默兜底、评分末尾拼 schema、评分轮禁 Skill 都是**契约驱动约束**,写作里不成立甚至要反着做(写作 Skill 必须常开)。凡"审稿因输出契约做的约束",写作侧一律重估。
