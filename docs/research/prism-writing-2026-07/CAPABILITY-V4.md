<!--
产出方式:V4 workflow(16 agents,0 error,~1.30M tokens)——Understand 3(入口盘点/已决清单/提示栈深度)
  + Research 8(任务分类学/全文管线/文献综合/修订式编辑/双语/数据到文字/rebuttal/可控多候选)
  → Synthesize → Critique 3(接地/与V1-V3一致且真新/务实覆盖)→ Finalize。
定位:与 V1(skill内容)/V2(生成式+规模化)/V3(链路)正交 —— 任务覆盖面视角。
批判要点已折叠:矩阵重算 54 行;发现 P0 真 bug(wl-revision-strategy 引用 3 个已合并删除的 lens,6 处悬空);
  F2 沙箱 Python=安全专项非小改;G2 latexdiff≈2-3天;E3=V2-A4 已决余项非新缺口;B4 回译抽查砍除。
-->

核验完成:第 6 处悬空路由确认(`wl-revision-strategy/SKILL.md:4` 同一行引用了不存在的 `wl-paragraph`、`wl-cohesion-flow`、`wl-length-budget`);`word_limit` 字段在 backend/prism 与前端全 repo 零命中(确系需新增);25 lens / 14 persona / 4 模板实名单与盘点一致。以下为折叠三份批判后的最终报告。

---

# CAPABILITY-V4(最终版):Prism 写作能力覆盖设计 —— 立题→投稿全任务面

> 定位:与 V1(skill 内容体系)、V2(生成式翻转)、V3(链路/AGENT-ARCHITECTURE)正交,回答「研究者从立题到投稿的全部写作任务,Prism 今天接住多少、缺什么、用什么补」。
> 本版为三轮批判(grounding / consistency / pragmatic-coverage)折叠后的定稿:矩阵重算为 **54 行**(修正初稿 56 的算术错)、砍 4 项过度工程、修 9 处接地错、消 6 处与已决的矛盾、补 6 项漏掉的高频任务。

## 总原则(不可违背,继承前三轮)

一切编排落在「单持续会话 + 用户在环轮次」内:不新增 agent 拓扑、不加第二执行器;工作流 = **skill 阶段协议 + 前端向导 UI + DB 轻状态表(先例 = peerreview wizard「本地 state + 下一步 PATCH」)+ 普通对话轮**;outline-first(A1)维持 P2 owner gate;不做扇出 / fast-apply / CRDT / judge 评语驱动自动改稿;确定性信号锚定,绝不信模型自评。

本版新增四条**骨架级约束**(三份批判共同命中,适用于全部工作流):

1. **逐轮结构化上下文的唯一载体 = cwd 文件**。agentbridge 没有逐轮注入通道(DESIGN-V2 实锤:memory 经 AppendSystemPrompt 只在 CreateSession 生效,PreUserMessageFn 不能改写 content),前端预填进 user content 会被 userEchoFrame 回显污染。故 plan 旁路 map 导出 `plan.md`、术语表 `terminology.md`、`evidence/` 等一律由后端在轮前物化进 cwd,agent 走 Read。
2. **cwd 工件不持久,真源必须进 DB/MinIO**。重开会话(recreateProjectSession)后 PrepareRound 只重铺 document.md + references.bib;所有工作流工件(evidence / terminology / plan / computation log)需 DB 真源 + 重物化路径(先例 = claw references/ 的按需重物化)。
3. **tier 可行性 + 中断恢复语义是每条工作流的必填项**。vip 日额度(billing_model.go,Free 20 万 raw 量级、Pro/Max 逐级放大)下,单持续会话逐轮重放历史,多轮管线对 Free 基本不可行;每条工作流须给「预计轮数 × 单轮 raw 估计 vs tier 日顶」的账 + 配额中断恢复(DB 阶段状态可续 +「从第 k 步续跑」指令模板);**整文级轮次必须在 skill 里先声明本轮完成范围**(如「本轮只译 §1-2」),使单轮透支 wind-down 的部分完成可判定,防半截改动进 diff 门。
4. **epoch/aborted 与 autoApply 双分支对接**。轮被 abort / 确认门拒绝 → 工作流 stage 不推进、条目状态回 pending(消费 V3 round epoch 不变量);所有工作流执行轮按「apply = 显式确认」编写,对开放问题 #1 的两种裁决保持中立(若裁决 autoApply 为默认态,仅绿色回执轮受益,红项一律回显式确认)。

---

# 一、概览

**今日覆盖度一句话**:54 项写作任务中 ✅ 8 / 🟡 21 / ❌ 24 / ⚠️ 1 —— 核心编辑纪律与 rigor 检查(cite-then-write、确定性回执)是扎实的差异化底盘,但**最高频任务(全篇润色、摘要/标题、改稿意见回应)恰恰体验最差或完全没有入口**,覆盖问题的本质是「引导与闭环缺失」而非「能力缺失」。

**最大能力缺口 Top 3**(价值 × 频率):
1. **修改意见回应闭环(G1)**:审稿人/导师/合作者意见 → 拆条 → 逐条改稿 + 回应信。每稿必做 1-3 次、学生用户(平台主力)频率更高;今天只有 pw-doc-rebuttal 人格、零流程。
2. **中英双语管线(B1/B3/B6)**:中文平台核心场景,整篇中译英 + 术语一致 + 双语摘要今天全 ❌。
3. **文献综合 + 全文物化(D3/D4)**:cite-then-write 已封死幻觉,但质量止于摘要级转述;claw 已有 references/ 物化先例,prism 未接是唯一硬机制缺。

**目标**:R3 末 ✅ 从 8 → 约 23/54(KPI 双轨 = ✅ 数 + C1 在线命中;**废弃 ✅+🟡 合并计数**——🟡 定义就是质量不稳,合并计数会奖励撒 lens 刷浅覆盖)。核心判断经批判后仍成立:**覆盖面翻倍不需要动执行器**;但机制硬缺从初稿的 5 件修正为 **7 件**(新增:zh↔en 块映射持久化、工作流工件 DB 真源),全部是服务端轻状态 + 前端视图,无一触碰执行器。

---

# 二、能力覆盖矩阵(54 行,完整)

图例:✅ 完整 / 🟡 能做但无引导或质量不稳 / ❌ 缺失 / ⚠️ 边界项。
优先级与批次一一对账:**P0** = 冻结窗前卫生债;**P1** = 本季(落 R1-R3);**P2** = R4 或带 gate/前置;**P3** = 远期/不做倾向。「出处」列区分 **V4 新增** 与 **完成已决**(consistency 批判要求的记账)。

### A. 微润色与语言(日频)

| # | 任务 | 今日 | 依据/补齐机制 | 优先级·批次 | 出处 |
|---|------|------|------|------|------|
| A1 | 语法纠错/学术润色 | ✅ | wl-clarity + wl-de-slop + wl-eal-chinglish + writing-core;入口=自由指令(见 A7 补入口) | — | 已建成 |
| A2 | 改写分档(轻/中/重) | 🟡 | 参数化旋钮**维持已决 gate(评议类使用率)不提前解锁**;R1 先出「改写此段(轻/中/重)」预填指令按钮——普通轮、不建快通道、不违 gate,一行文案兑现八成价值 | P1(按钮)/P2(旋钮,gate) | gate 已决 |
| A3 | 压缩至目标字数/**页数** | 🟡 | wl-expand-compress 有方法无校验。补:数词校验(目标区间 vs 实际,偏差>10% 一次限句修订)+ **页数信号**(CS 会议是 page limit——编译产物页数 vs 模板 page_limit 对照进回执,纯读现有编译链,半天) | P1·R1 | V4 新增 |
| A4 | 扩写此节 | 🟡 | 快捷按钮(§四) | P1·R1 | V4 新增 |
| A5 | 去 AI 腔(中文档) | 🟡 | wl-de-slop 补中文段(「值得注意的是」滥用/排比堆砌/空洞总起) | P2·R3(随信号) | V4 新增 |
| A6 | 语域/衔接/信号词 | ✅ | wl-voice-register / wl-paragraph-flow / wl-signposting | — | 已建成 |
| A7 | **全文一键润色(逐节分批)** | 🟡 | 竞品日频第一任务(Grammarly/Writefull 核心),今天单轮改全篇 token 与 diff 体积不可控。补:快捷按钮 +「逐节分批」纪律写进 skill | P1·R1 | V4 新增(初稿漏项) |

### B. 翻译与双语(中文平台核心)

| # | 任务 | 今日 | 依据/补齐机制 | 优先级·批次 | 出处 |
|---|------|------|------|------|------|
| B1 | 整篇中译英投稿稿 | ❌ | **工作流④**(直译轮→重开会话→单语润色轮) | P1·R2 | V4 新增 |
| B2 | 选区中英互译 | 🟡 | wl-translate lens + 快捷入口(单节快通道) | P1·R2 | V4 新增 |
| B3 | 项目级术语表一致 | ❌ | R2 降级版 = **cwd `terminology.md`**(轮前物化/轮末回收进 DB 真源)+ 确定性术语 lint;project memory `terminology` namespace 的迁移**等已决依赖链(稳定 Block ID → 信封阶段二 → memory block)之后**,不提前拉动 | P1(降级版)·R2 / P2(namespace)·R4 | 降级版 V4 新增;namespace 完成已决 |
| B4 | 回译忠实度抽查 | ❌ | **砍**。embedding 基建从零建、学术文本阈值噪声大;目标用户中文母语,④的双语对照 diff 已把人工抽核做成一等界面 | 不做 | — |
| B5 | 术语在线(termonline.cn)审定译名 | ❌ | 改为**后端代理 API + 术语表编辑器的查询按钮**(不进 agent 工具面——minicod 是唯一 MCP 的 singleton 架构,加第二个 MCP server 是架构变更);**立项前先核验 API 开放性/许可**(未验证) | P3 | — |
| B6 | **中英双摘要成对生成** | ❌ | 学位论文/中文学报每稿必做(GB/T 7713 要求双语摘要),frontmatter 现仅单 abstract。快捷按钮「生成中/英对照摘要」+ frontmatter 扩 abstract_zh | P1·R2 | V4 新增(初稿漏项) |

### C. 起草与生成(周频)

| # | 任务 | 今日 | 依据/补齐机制 | 优先级·批次 | 出处 |
|---|------|------|------|------|------|
| C1 | 空白项目→大纲→逐节成稿 | 🟡 | **工作流①**:R1 免 gate 引导条先行;管线本体 = 提交给 A1 gate 的**增量提案**(不造第二份 spec,见 §三·①) | P1(引导条)·R1 / P2(管线,A1 gate)·R4 | 完成已决(V2-A1) |
| C2 | 单节起草 | ✅ | wl-blank-page 两阶段 + wl-structure + 14 人格 | — | 已建成 |
| C3 | 从研究笔记/素材成稿 | ❌ | ①变体:素材作 cwd 附件 + 大纲轮以素材为先验 | P2·R4 | V4 新增 |
| C4 | 标题候选×N | 🟡 | 快捷按钮(只读轮,不出 patch) | P1·R1 | V4 新增 |
| C5 | 摘要生成/重写 | 🟡 | 快捷按钮 + 回执「摘要-正文数字对账」(摘要数字 ⊆ 正文数字集合,纯规则) | P1·R1 | V4 新增 |
| C6 | 图表叙述/caption | 🟡 | wl-figure-narrative 固化 caption 分层(L1 构成/L2 统计极值/短 L3 趋势,L4 解读入正文) | P2·R4 | V4 新增 |
| C7 | 数学推导/定理环境 | ❌ | theorem 块型(**V3 已决「优先」**)+ wl-math-narrative lens(setup→claim→proof sketch→remark) | P2·R4 | 块型完成已决;lens V4 新增 |

### D. 文献综合(每稿 1-2 次,高价值)

| # | 任务 | 今日 | 依据/补齐机制 | 优先级·批次 | 出处 |
|---|------|------|------|------|------|
| D1 | related work 组织/公平性 | ✅ | wl-related-work-structure + wl-rl-related-work-fairness | — | 已建成 |
| D2 | 引用真实性(反幻觉) | ✅ | cite-then-write + Minicod MCP + dangling-cite;差异化卖点,守住 | — | 已建成 |
| D3 | 多篇→综述节 | 🟡 | **工作流②**;触发条件显式(引用池 >20 篇或用户明选「综述模式」),普通 related work 维持 D1/D2 对话轮,不拖进重管线 | P1·R3 | V4 新增 |
| D4 | 文献全文阅读 | ❌ | 接通 claw references/ 物化(shared/lib/agent-references,FeatureBridge push)——**唯一执行器外的硬机制缺**,只覆盖用户文献库已有 PDF | P1·R3 | V4 新增(机制复用) |
| D5 | 引文图滚雪球 | ❌ | skill 步骤(每簇种子拉被引/参考);**前置:核验 @minicod/mcp-server 工具面是否暴露 citations/references**(后端 client 有端点 ≠ MCP tool 暴露,未核验) | P2·R4 | V4 新增 |
| D6 | 引文忠实性逐句后验 | 🟡 | ②的 evidence 分层回执(见 §三·②) | P2(随②) | V4 新增 |

### E. 严谨检查与投稿体检

| # | 任务 | 今日 | 依据/补齐机制 | 优先级·批次 | 出处 |
|---|------|------|------|------|------|
| E1 | rigor 清单(11 维 wl-rl-*) | ✅ | 悬空路由修复(P0,共 **6 处**非 5 处) | P0 | 已建成 |
| E2 | 悬空引用/交叉引用/骨架节/缩写 | ✅ | quality.go 确定性回执 | — | 已建成 |
| E3 | 术语/记号/数字风格全文一致性 | 🟡 | **工作流⑥** = **完成已决 V2-A4(记号/术语 registry)的剩余部分**(quality.go 已实装缩写子集,代码注释自证),非 V4 新缺口 | P1·R1 | **完成已决(V2-A4)** |
| E4 | 投稿体检(30+ checklist) | 🟡 | 「投稿前整体检查」预设 = ⑥ + 术语 lint + 体裁 checklist 组合 | P2·R4 | V4 新增 |
| E5 | 修辞 moves 诊断(CARS) | 🟡 | wl-rhetorical-moves,等覆盖信号 | P3 | V4 新增 |
| E6 | 全篇模拟审稿 | 🟡 | **peerreview 导入桥(独立小件)**——修正初稿的映射错位:③的复审步只针对「已有意见的未解决条目」,E6 是投稿前无意见状态,依赖的是桥本身而非复审步 | P2·R4 | V4 新增 |
| E7 | 统计报告规范(SAMPL/APA) | 🟡 | lens-stat-reporting(放 reviewer-lenses/ 供 peerreview 复用) | P2(随⑤) | V4 新增 |

### F. 数据→文字

| # | 任务 | 今日 | 依据/补齐机制 | 优先级·批次 | 出处 |
|---|------|------|------|------|------|
| F1 | 数据表→Results 叙述 | 🟡 | **工作流⑤轻版**(转写 + 纯 Go 数字成员校验,零沙箱改动覆盖八成价值) | P1·R2 | V4 新增 |
| F2 | 派生统计量计算 | ❌ | sandbox Python 白名单 = **独立安全专项**(prism agent Bash 显式禁用、prism_tex 是 file-drop watcher 非 agent 工具、Dockerfile 无 python3——落地量级参照小程序数学渲染管线整个专项,初稿「只加解释器」严重低估);**移出覆盖 KPI** | P3(专项 gate) | — |
| F3 | 数值溯源校验 | ❌→🟡 | 轻版 = 数字成员校验(生成段数字 ⊆ 源表数字,正则+容差)+ 派生值一律标黄「未验证」;statcheck 式 (t,df,p) 重算随 F2 专项 | P1(轻)·R2 / P3(重) | V4 新增 |
| F4 | 图/图表生成(TikZ/matplotlib/mermaid) | ❌ | **维持不做**(协议明确禁止;mermaid 小程序侧已有否决先例) | — | 已决 |

### G. 投稿配套与发表后(每稿必做)

| # | 任务 | 今日 | 依据/补齐机制 | 优先级·批次 | 出处 |
|---|------|------|------|------|------|
| G1 | **修改意见回应(审稿人/导师/合作者)**→逐条改稿+回应信 | ❌ | **工作流③**;入口文案 = 「粘贴任何修改意见」,reviewer 字段可空、聚类步可跳——机制零改动,多覆盖学生用户最高频场景(全设计性价比最高的一句文案) | **P1·R2** | V4 新增 |
| G2 | latexdiff 标红修回稿 | ❌ | ③交付件;实账 = prism_tex Dockerfile 加包 + watcher 新任务类型 + projector 出旧版 .tex,**约 2-3 天**(非「一条命令」) | P1·R2 | V4 新增 |
| G3 | 任意两版本 diff 视图 | ❌ | 前端 struct 级版本 diff | P2·R4 | V4 新增 |
| G4 | cover letter | 🟡 | 投稿材料包按钮(自动带摘要/贡献进 prompt) | P1·R1 | V4 新增 |
| G5 | 材料包(highlights/plain summary/CRediT/COI/data availability/AI 披露/graphical abstract + **acknowledgments/funding + suggested reviewers + camera-ready 适配**) | ❌ | wl-submission-pack lens + 一键批量按钮;初稿七件套补三件纯模板活 | P1·R3 | V4 新增 |
| G6 | 期刊 guideline 注入/换刊 | ❌ | wl-venue-adapt(含 camera-ready 段)+ journal API guideline 喂 conformance(**guideline 数据未接,实测确认**) | P2·R4 | V4 新增 |
| G7 | 模板池扩充 | 🟡 | +3(acmart / sn-jnl / ctexart);实账 = projector assemble + conformance Go 代码 + prism_tex 宏包验证(**非纯内容活**;ctexart 依赖的中文宏包需镜像内核验) | P1·R3 | V4 新增 |
| G8 | 作者/机构信息编辑 | ❌ | **前端表单直改 struct frontmatter(非 AI 路径)**,一次解除官方承认的双重死端;`word_limit`/`page_limit` 为**新增后端模板元数据字段 + 4 模板赋值**(已核验字段不存在,非现成可读) | P1·R1 | V4 新增 |

### H. 中文管线/基金/学位/上游

| # | 任务 | 今日 | 依据/补齐机制 | 优先级·批次 | 出处 |
|---|------|------|------|------|------|
| H1 | 开题报告/研究计划 | ❌ | pw-doc-proposal 人格(立项依据/研究内容/技术路线/可行性) | P2·R4 | V4 新增 |
| H2 | 国自然本子 | 🟡 | pw-doc-grant 加国自然变体段 + 合规准则(AI 只编辑不代写 + 披露) | P2·R4 | V4 新增 |
| H3 | 学位论文单章 | ✅ | pw-doc-thesis-chapter | — | 已建成 |
| H4 | 学位论文多章组稿 | ❌ | **延后**:破坏单 DocStruct + 单会话 + W1 上下文经济三重假设,等多文档项目立项 | P3 | — |
| H5 | GB/T 7713 结构检查 | ❌ | gbt7713 skill(7713.1—2025 / 7713.2—2022 清单)+ 回执国标分组;与 B6 双摘要联动 | P2·R4 | V4 新增 |
| H6 | 降重 | ⚠️ | 改写能力天然覆盖;「规避查重/AI 检测」承诺**明确不做**(§五) | 边界 | — |
| H7 | 传播衍生(会议摘要/海报/slides/社媒) | ❌ | wl-derivative-outputs,等信号 | P3 | — |
| H8 | 立题头脑风暴 | ❌ | 导流 claw + Minicod;「从已有写作项目开始」是产品边界非缺陷 | P3(边界) | — |
| H9 | 多作者协作 | ❌ | AGENT-ARCH 4.4-4 远期入口不变 | P3 | — |

**矩阵结论(重算后)**:54 行中 ✅ 8 / 🟡 21 / ❌ 24 / ⚠️ 1。❌ 中约 2/3 是引导/内容缺(lens/按钮/人格级可补);**机制硬缺 7 件**:文献全文物化(D4,复用 claw 现成实现)、工作流工件 DB 真源 + 重物化(②④⑤共用)、zh↔en 块映射持久化(④)、修回追踪表(G1)、cwd terminology.md 回收链(B3)、theorem 块型(C7,已决)、数据文本上传面(F1)。全部为服务端轻状态 + 前端视图,不动执行器。

---

# 三、六大能力工作流设计

> 编号沿用;⑥ 诚实降级为「R1 line item」(实体 = 已决 V2-A4 收尾 + 回执 A 轨同构),列此仅为叙事完整。每条含 kill 标准(仿 lens 零命中归档制,补齐初稿只有出口度量没有止损的半截纪律)。

## 工作流① 从零起草整篇(outline-first)—— R1 引导条 + R4 gate 后管线

**对 gate 的实质尊重(修正初稿的双 spec 问题)**:初稿把节序/长短分流/每节轮数/预算公式全部定案,等于造出 A1 的第二份 spec。本版砍为两件:
1. **R1 免 gate 先行件**:纯前端「下一步写哪节」引导条——读现有 stub_sections 信号反向生成建议指令,零 schema、零协议改动。
2. **一页提交给 A1 gate 的增量提案**(回填 DESIGN-V2 A1 节,作为建议非定案):节序(Methods/Results 先 → Discussion → Intro → Related Work → Abstract 最后)、长短分流(cover letter/rebuttal/低节数走单轮整稿 + 一次反思,AI Scientist v2 教训)、每节 1 初稿轮 + 1 修订轮、预算 ≈ (N×2+4) 轮、大纲批准门复用既有 apply。

**接地修正三处**:
- 结构先验改为 **persona 骨架/模板先验 + 用户自备范文(D4 物化后的库内 PDF)**——Minicod 只回元数据/摘要,「拉同 venue 论文取 section 结构」以当前数据面不成立,删。
- 引用回填:agent 侧走 references.bib + [@key] 轮末 parse 合并,落**整轮 diff**(稳定 Block ID 前 struct 轨只能整轮全收/全弃);「onPick=flush→applyCite→refetch→insertCitation 逐条批准」是前端文献库选择器的用户手选路径,与 agent 回填是两条不混淆的通路。
- 「初稿轮禁新造 [@key]」是与 citation-grounding 的定向冲突,必须带**作用域声明**:仅 draft-pipeline skill 的初稿 stage 内生效,引用回填轮恢复 citation-grounding(配合 P0 的规则优先序声明,防「两套指令并存」以工作流形式复发)。

**新增件**:plan 元数据走 Block.ID 旁路 map(已决账),由后端轮前物化为 cwd `plan.md`(骨架级约束 1);进度条 UI。
**确定性校验**:stub_sections 递减监控、dangling-cite、编译状态。
**成本/tier**:gate 后再算全账;引导条免费。
**Kill 标准**:引导条点击→apply 率连续 4 周 <5% 则收起入口,gate 提案附此数据。

## 工作流② 文献综合写作(检索→聚类→逐簇成段)—— R3

**触发条件显式**(修正初稿把轻任务拖进重管线):引用池 >20 篇或用户明选「综述模式」才进全量管线;**快通道(自带 references.bib → 直接聚类成段,2-3 轮)是默认路径**;普通 related work(10-15 篇)维持 D1/D2 对话轮。

**用户旅程(全量)**:「文献综合」→ 纳入/排除标准 + 试筛 10 篇确认表(拍板点 1,防 bib 污染)→ 视角轮检索(视角清单由 wl-related-work-structure 的结构槽位派生:问题定义/方法谱系/评测/局限,每轮 1 视角 2-3 条 Minicod 查询)→ 主题簇大纲(拍板点 2)→ 逐簇成段(每簇一轮,条件于已写段落防重复)→ 自评补检索 1 轮封顶。

**证据分层(修正初稿的全文引语虚假承诺)**:`evidence/<bibkey>.md` 分两档——**full-text tier**(用户文献库有 PDF、经 D4 物化,verbatim 引语)与 **abstract tier**(Minicod 新检索,只有摘要级摘录;Unpaywall 全文属 tier0 未部署)。核心纪律 quote-then-cite-then-write 对 full-text tier 全强度执行;abstract tier 句子在回执中默认降级标注。

**新增件**:D4 物化接入(唯一机制件,复用 claw 实现);evidence 真源进 DB(骨架级约束 2,重开会话可重物化);方法对比型簇可选 LaTeX 对比表。
**确定性校验**:逐句后验 (句, bibkey, 支撑摘录, 支持度) 三元组 + tier 标注;覆盖统计(每簇论文数/年份分布/无支撑句比例)。只对照本地 evidence,token 便宜。
**成本/tier**:全量 5-8 轮 → **Max 或多日**(Pro 分 2-3 日,启动时预告);快通道 2-3 轮 → Pro 单日可行,Free 勉强。
**Kill 标准**:全量管线完成率 <50% 或无支撑句比例不优于对话轮基线,则收缩为快通道 only。

## 工作流③ 修改意见回应(拆条→逐条改稿+回应→response letter)—— R2,最高价值

**入口扩容(性价比最高的文案改动)**:「粘贴任何修改意见」——审稿人 decision letter / 导师批注 / 合作者意见 / 编辑要求;reviewer 字段可空、跨审稿人聚类步可跳。学生用户的导师改稿频率高于正式审稿。

**用户旅程**:粘贴意见(peerreview 导入桥 v1 = 用户从 peerreview 任务复制文本粘贴,深度桥见开放问题)→ 第 0 轮自动拆条 {逐字引用, Request/Evaluation, aspect, major/minor},用户 merge/split/改严重度 → 策略轮:每条 action ∈ {concede-revise, clarify, refute, partial, **needs-author-input**} + 理由 + 证据计划,用户 confirm-or-correct(Defend 实证:人在环使事实正确率 45%→74%,**确认门是效果来源不是可选项**)→ 逐条执行 → 汇总轮渲染 response letter + latexdiff 标红 PDF。

**轮次纪律(修正初稿的映射矛盾)**:**写死「一条 canonical 意见 = 一轮」**,round↔item 映射落 DB(`prism_revision_items.round_id`),意见→改动的对齐在产生当下由轮边界机械保证(ARIES 实证事后推断不可行)——不做 per-patch 元数据(方言无 per-edit 元数据位,信封 v1 只带回执 delta,均已决)。minor/editorial 批量快道 = 一轮合并改稿,**诚实语义为「整包接受/拒绝」**(整轮全收/全弃的现实);逐条粒度的批量模式推迟到信封阶段二后。

**锚定(修正 Block.ID 依赖)**:v1 条目→位置映射用**今天就稳定的锚** = section heading 文本 + 既有 \label;`target_blocks[]` 字段预留但显式标注 gate=稳定 Block ID。

**汇总轮**:response letter 从追踪表**机械化渲染**(逐字引用 + 回应 + 「见 Section X」定位),pw-doc-rebuttal 只管语气;letter 是追踪表导出产物(pandoc 链),不占 document.md——一举解掉 rebuttal 与正文两项目割裂。

**epoch/abort 语义**:轮 aborted → 该条目回 pending、stage 表不推进。

**新增件**:DB 轻表 `prism_revision_items` {comment_id, quote, interpretation, action, round_id, anchor(heading+label), status: pending/applied/rejected/needs-author-input};条目列表 + action 卡片 UI(wizard 铁律);latexdiff(2-3 天实账,见 G2)。
**确定性校验(回执三件)**:①覆盖矩阵(每条目 × {策略, 改动轮, 回应段},标漏答)②**承诺核对**(扫描 "we added/now report" 类承诺 ↔ 追踪表 applied 状态,标「承诺了但没改」)③无证据锚点的回应条目清单。
**铁律**:needs-author-input 绝不编造实验结果;major 条目永不跳确认。
**成本/tier**:一条一轮 → 12 条 ≈ 13-16 轮,单轮 raw 随历史增长;**Free 不可行,Pro 多日(预告「约 3 日额度」),Max 单日**;配额中断:条目状态在 DB,「从第 k 条续跑」零损失。
**Kill 标准**:覆盖矩阵漏答率连续 N 稿 >15% 或承诺核对红项率不降,停止扩张(如深度桥、复审步)。

## 工作流④ 中英双语(直译→润色→术语一致)—— R2 降级版

**关键修正(消初稿最硬的一处矛盾)**:round 2「单语润色不见中文原文」在单持续会话内不成立(round 1 中文源永在历史里)。修法现成:**round 1 apply 后强制 recreateProjectSession**(重开会话已建成、文档零损失),round 2 在干净会话内只见英文译文 + terminology.md——translationese 43%→25% 的前提(Lost in Literalism)由此真正满足。

**中文源去向(初稿漏账的隐藏机制件)**:round 1 直译前自动落**只读版本快照**(struct 版本链),并持久化 **zh↔en 块映射**(v1 按段序对齐存进版本元数据;Block.ID 级对齐等稳定 Block ID 落地后升级)。双语对照 diff 视图从版本历史取中文侧、按段序对齐滚动。

**轮次编排**:round 1 忠实直译(prompt 载体 = cwd terminology.md,soft constraint——DuTerm 实证软约束优于硬替换;agent 将专名首译以结构化格式写回 terminology.md,轮末后端回收进 DB 真源)→ 术语 lint → **重开会话** → round 2 单语润色 → 双语对照 diff 审阅 → apply。**整篇默认按节分轮写进 skill(非建议)**——单轮透支 wind-down 是硬约束,整文轮必须声明「本轮只译 §x-y」。

**B3 排期修正**:R2 只做 cwd terminology.md + 确定性 lint(不依赖逐轮注入通道);「滚动注入」经每轮前重物化 terminology.md 自然实现(agent Read);project memory namespace 迁移等已决链(稳定 Block ID → 信封二 → memory block)后执行,不提前拉动信封 plumbing。

**新增件**:wl-translate lens(双向,英译中含中文学术 register:去欧化句式/「的」链);terminology DB 真源 + 物化回收链;双语对照 diff 视图;zh↔en 段序映射。B4 回译抽查已砍(人工对照替代);B5 termonline 为 P3 后端代理。
**确定性校验**:术语漂移 lint(同一中文术语 ≥2 种英译 → 回执 + 按 span 修正建议);MQM 精简 schema {块, span, 维度, 严重度, 建议},refine 只对标注 span 出 patch。
**成本/tier**:整篇 = 2 × 全文量级(重开会话使 round 2 历史轻,反而省);按节分轮 N×2 轮;**Pro 分 2 日 / Max 单日,Free 只开放单节快通道**。
**Kill 标准**:整篇模式使用率 <y%(以单节快通道为分母)连续一月,收缩为快通道 only。

## 工作流⑤ 数据→结果段 —— R2 轻版(降档)

**降档决策(消两处已决冲突 + 砍超配)**:sandbox Python 白名单是全 V4 风险最高机制件却服务最低频场景,且「红项自动触发自纠轮」撞 AGENT-ARCH 4.3-7(有界自动修复轮 = 远期·证据门)与开放问题 #1。**v1 = 纯文本侧最小闭环**:手贴表(CSV/TSV/统计输出文本)→ insight 编号清单(对话轮输出,用户回复「要 1/3/5」——**chips UI 砍,等使用量证据**)→ 成段 →「数字成员校验」(生成段数字 ⊆ 源表数字,纯 Go 正则 + 归一化容差)→ 红项呈现,**用户一键确认后**触发修复轮(兼容 4.3-7 gate)。

**铁律**:绝不从图片猜数(CHOCOLATE:GPT-4V 级高频读错),只接受文本形态;**派生值(百分比变化/差值/合计)v1 一律标黄「未验证」提示用户自行核对**——computation log + sandbox 解释器 + statcheck 重算全部随 F2 独立安全专项(参照数学渲染管线量级立项,移出覆盖 KPI)。easystats-report 模板移植、数字 token 冻结 diff 同砍出 v1。

**新增件**:数据文本粘贴面(复用现有输入,MIME 白名单文本类);quality.go 数字成员校验(与 C5 摘要对账、A3 数词校验共享同一套数字抽取/归一化地基,R1 先落地基);lens-stat-reporting(随⑤投放,reviewer-lenses/ 双用)。
**确定性校验**:per-number 绿(∈源表)/黄(派生未验证)/红(不在源表)+ 溯源坐标进回执。
**成本/tier**:2-3 轮,全 tier 可行——六条里最便宜的生成类工作流。
**Kill 标准**:红色数字率经一次修复轮后仍 >x%,或使用量不足,F2 专项不立项。

## 工作流⑥ 全文一致性 pass —— R1 line item(诚实定位:V2-A4 收尾)

**定位修正**:实体 = quality.go 扩展扫描项 + 清单勾选 UI + 1-2 个修复轮,与既有「回执 A 轨一键构造指令交对话轮修」同构;其核心确定性扫描正是**已决 V2-A4(记号/术语 registry)的剩余部分**(quality.go 已实装缩写子集)。不冒充新工作流,占 R1 一个条目。

**流程**:后端确定性扫描(零 token):术语变体(词形归一 + 精确匹配,**不上 embedding**——尊重 C4 已决)/记号漂移/数字风格(千分位、P 值格式、单位空格)/时态启发式 → 问题清单锚定呈现 → 用户勾选 → agent 按清单一轮修(滑窗:前节+本节+后节)→ ≤2 遍 → 可选「从定稿重写 Abstract/标题」(点名 wl-title-abstract)。规则能查的绝不劳驾模型。

**新增件**:quality.go 扩展 + 清单 UI(复用 PrismQualityDialog 骨架)。也是 E4「投稿前整体检查」预设与工作流①收尾件的地基。
**成本**:扫描免费,修复 1-2 轮,全 tier 可行。

---

# 四、快速补齐清单

### P0 卫生债(冻结窗前,与 V2 阶段 0 同批;协议重写 + 路由修复约半天)

1. **重写 edit.go:161-170 协议段**,四合一:
   - 删 4 份幻影指南引用(prism-academic-writing/discipline-conventions/latex-format/figures,已实地核验不存在),改指真实在场的 3 内核 + lens 菜单;
   - **统一 bib 规则**:以 citation-grounding(自己 minicod 检索→写 references.bib)为准,消灭与 edit.go:159「只能用已存在键」的正面冲突;
   - **规则优先序声明**:内核铁律 > 阶段 skill 临时收紧(必须显式声明生效范围)> lens 建议——一劳永逸防「两套指令并存」以工作流形式复发(工作流①的「本阶段禁新键」即适用);
   - **cwd 文件政策**:一次写清 agent 可读写清单(document.md / references.bib / plan.md / terminology.md / evidence/ / data/)及各自纪律,避免每条工作流上线各改一次协议。
2. **修 6 处悬空 lens 路由**(初稿 5 处 + 本轮核验新增 `wl-revision-strategy:4` 的 `wl-paragraph`):hedging→wl-rl-claim-calibration;cohesion-flow / **wl-paragraph**→wl-paragraph-flow;length-budget→wl-expand-compress;causal-language→wl-rl-stats-language;reproducible-methods→wl-rl-reproducibility。
3. **lint-writing-skills 防复发规则做成机器校验**:正文/when_to_use 中所有 wl-*/pw-* 引用必须能在目录实名单解析(本轮人工盘点漏了第 6 处,恰好证明必须机器化)。

> **冻结窗判据修正**:按 V3 真判据「agent 行为中性」行事,不用初稿自造的「零 schema 即合规」。edit.go 协议重写改 agent 可见面最大的一块,**必须在 C1 基线起算前完成**;lens 新增改菜单块(且菜单块在 TOTAL_CAP 后推入、是已核验的无界面),一律排窗后随工作流分批投放。

### 新 lens/人格(**随工作流分批投放**,非一次 8 件;每个进 C1 淘汰制;菜单块设 cap 并记增量字符账——回应 V3 上下文经济)

| 件 | 随批次 | 内容要点 |
|---|---|---|
| wl-translate | R2(随④) | 两段式纪律(直译≠成稿)、术语 soft constraint、英译中去欧化 |
| lens-stat-reporting | R2(随⑤) | 精确 p 值 / 效应量+CI 成对 / 可再分析描述统计;reviewer-lenses/ 双用 |
| wl-submission-pack | R3(随投稿包) | 材料 10 件(初稿 7 + acknowledgments/funding + suggested reviewers + camera-ready);AI 披露模板直击 36% 使用 vs 9% 披露的合规缺口 |
| wl-lit-synthesis(skill) | R3(随②) | 七步阶段协议 + evidence 分层纪律 |
| wl-de-slop 中文段 | R3(随信号) | 中文 AI 腔清单 |
| wl-math-narrative | R4(随 theorem 块型) | setup→claim→proof sketch→remark |
| wl-venue-adapt | R4(随 guideline 注入) | 换刊 playbook + camera-ready 段 |
| pw-doc-proposal / pw-doc-grant 国自然段 | R4 | 开题四段 / 国自然变体 + 合规准则 |

### 前端快捷入口(预填指令按钮,普通轮,零后端改动;注:按钮改变输入分布,C1 的 lens 命中需按「按钮来源」打标区分)

- **生成摘要**(带「摘要每个数字须在正文有出处」)· **标题候选×5**(只读轮)· **扩写此节** · **压缩到 N 字/N 页**(页数接编译产物信号)· **翻译此节**(整篇引导去④)· **改写此段(轻/中/重)**(不建快通道,不违 A2 gate)· **全文分批润色**(skill 写死逐节纪律)· **生成中/英对照摘要**(B6)· **投稿材料包**(勾选要哪几件)· **下一步写哪节**(①先行件)· **字数/页数统计**(纯前端 + word_limit/page_limit 新字段对照)

### 小机制件

- **作者/机构编辑表单**(G8,1-3 天):前端直改 struct frontmatter,非 AI 路径,一次解除双重死端。
- **模板元数据 word_limit/page_limit 字段 + 4 模板赋值**(新增,非现成)。
- **数字抽取/归一化地基**(quality.go,R1):服务 C5 对账 + A3 数词校验 + ⑤成员校验三处。
- **摘要-正文数字对账**(C5 配套,纯规则)。

---

# 五、不做与边界

**学术诚信硬边界(写进 skill 铁律 + 前端文案)**:
1. **编造实验结果/数据**:③⑤的 needs-author-input / 派生值标黄机制即落地——缺数据提示补料,绝不生成「合理的」数字。
2. **规避检测承诺**:降重/去 AI 腔定位为文风改进;拒绝「改到查重查不出」类指令;产品文案绝不出现「过查重/过 AI 检测」。
3. **虚构引用**:citation-grounding 已封死,维持。
4. **代写基金/学位论文叙事主体**:AI 管结构/压缩/合规/润色,叙事主张由人写(NIH NOT-OD-25-132 类红线);写进 pw-doc-grant/proposal。
5. **AI 披露**:主动供给披露模板(wl-submission-pack),站合规一侧。

**技术不做(重申已决 + 本轮裁决)**:
- 图表生成(TikZ/pgfplots/matplotlib/mermaid)维持禁令;起草扇出 / fast-apply / CRDT / judge 评语驱动自动改稿 / 同 prompt 采 3 次冒充多候选——全部维持已决。
- A2 参数化旋钮不提前解锁(gate=评议类使用率);**gate 开前不写详细设计,防死库存**。
- **B4 回译 + embedding 抽查:砍**(embedding 基建从零建、阈值噪声、④对照视图已覆盖)。
- **B5 termonline MCP:不进 agent 工具面**(minicod 唯一 MCP 的 singleton 已决);P3 后端代理,API 可用性核验前不占排期。
- **F2 sandbox 解释器:不藏在 R3 列表项里**,独立安全专项 gate。
- ⑤ chips UI、easystats 移植、数字 token 冻结:v1 砍,等使用量。
- **手工矩阵重打分不冒充 C1 信号**(C1 = 被动采集的行为数据);矩阵重打分保留为季度覆盖度审计,单列记账。

**延后**:学位论文多章组稿(H4,三重假设被破)、多作者协作(H9)、期刊推荐引擎(等 G6)、修辞 moves 诊断(E5)、传播衍生(H7)、立题头脑风暴(H8,claw 域)。

---

# 六、路线(合并进现有时间线)

前提:已决 P1 项(A2a、C2 等)优先级不受挤占,与 V4 并行归并;**A5 现状为待裁决非已决 P1**(AGENT-ARCH 终稿已挪中期与开放问题 #1 联合裁决,修正初稿的陈旧标签)。冻结窗判据 = agent 行为中性(见 §四)。

**批次 0(本周,冻结窗启动前,0.5-1 天)**
edit.go 协议重写四合一 + 6 处路由修复 + lint 机器校验。理由:改 agent 可见面,必须先于 C1 基线。

**R1(2-3 周,冻结窗内,全部 agent 行为中性)**
作者/机构表单 + word_limit/page_limit 字段与赋值 + 字数/页数统计与回执对照 + quality.go 扩展(⑥一致性扫描 = V2-A4 收尾 + 数字地基 + 摘要-正文对账)+ 清单勾选 UI + 快捷按钮组(11 个,按钮来源打标)+ 「下一步写哪节」引导条。
*出口度量*:按钮点击→apply 率、⑥回执 delta、✅ 8→约 13/54。

**R2(3-4 周,窗后,两条高价值工作流)**
**工作流③**(任意修改意见入口 + 一条一轮 + prism_revision_items + latexdiff 2-3 天实账;peerreview 桥 v1=粘贴)· **工作流④降级版**(recreateProjectSession 强制重开 + cwd terminology.md 回收链 + 中文源快照与段序映射 + 双语对照 diff + 术语 lint + 单节快通道;wl-translate 随批投放)· **工作流⑤轻版**(文本粘贴 + 成员校验 + 用户确认触发修复;lens-stat-reporting 随批)· B6 双摘要。
*出口度量*:③漏答率/承诺核对红项率;④术语漂移检出→修复率、整篇 vs 单节使用比;⑤红色数字率。

**R3(4-6 周,一条带机制件的工作流 + 投稿包)**
**工作流②**(D4 references/ 物化接入 = 唯一机制件 + evidence 分层与 DB 真源 + 逐句后验回执 + 快通道默认)· wl-submission-pack 全量 + 材料包按钮 · 模板池 +3(projector/conformance/宏包验证实账)· wl-de-slop 中文段。
*出口度量*:②无支撑句比例(分 tier)、快通道 vs 全量使用比;✅ 约 23/54。

**R4(gate 后,与中期计划合流)**
工作流① outline-first(A1 owner gate + 稳定 Block ID 落地后;R1 引导条与⑥升级为管线首尾件)· theorem 块型 + wl-math-narrative · terminology 迁 memory namespace(已决链后)· journal guideline 注入 + wl-venue-adapt · 版本 diff 视图 · ④升级 Block.ID 对齐 · peerreview 深度桥(E6)· 「投稿前整体检查」预设 · D5 滚雪球(前置核验通过后)。

**覆盖 KPI(双轨)**:✅ 数(质量达标口径,季度矩阵审计,锁定 54 行清单防漂移)+ C1 在线命中(lens 命中分布/按钮转化/回执 delta,被动采集)。每条工作流带 kill 标准(见 §三),零命中/低完成率照 lens 淘汰制精神收缩。

### 附:V4 一等数据结构清单(全部服务端轻状态,不动执行器)

| 结构 | 归属 | 真源 | 先例 |
|---|---|---|---|
| prism_revision_items(含 round_id、heading+label 锚) | ③ | DB | peerreview wizard 状态表 |
| terminology(DB 真源 ↔ cwd terminology.md 物化回收) | ④⑥ | DB | claw references/ 物化 |
| evidence/<bibkey>.md(分 full-text/abstract tier) | ② | DB/MinIO | claw references/ 物化 |
| zh↔en 块映射 + 中文源快照 | ④ | struct 版本元数据 | 版本链(现成) |
| plan 旁路 map(Block.ID→intent/状态)→ cwd plan.md | ① | DB | V2-A1 已决账 |
| word_limit/page_limit 模板元数据 | A3/G8 | 模板定义 | 新增字段 |

---

# 七、开放问题/需 owner 拍板

1. **autoApply 默认态(继承开放问题 #1)**:本设计全部工作流按「apply=显式确认」写成裁决中立;唯⑤的修复轮触发方式(用户确认 vs 绿项自动)随裁决摆动,请连同 AGENT-ARCH 4.3-7(有界自动修复轮)一并裁决。
2. **A1 outline-first gate(继承)**:本报告 §三·① 的增量提案(节序/长短分流/预算公式)请回填 DESIGN-V2 A1 节评审,避免双 spec;R1 引导条不等 gate。
3. **C1 基线处理**:lens 随工作流分批投放(本设计默认)vs 一次投放 + 显式基线重置——owner 选;快捷按钮的输入分布影响是否纳入 C1 口径同裁。
4. **F2 sandbox Python 解释器**是否立独立安全专项(量级参照数学渲染管线;不立则 F2/F3 重版永久 P3)。
5. **工作流③④②的 tier 门槛与配额文案**:多轮管线对 Free 不可行是硬事实——是「Pro+ 专属」明示,还是「多日续跑」话术,产品侧拍板。
6. **peerreview↔prism 深度桥**:跨 feature 归属/鉴权/文档同一性关联(peerreview 对上传 PDF 出报告,与 prism 项目无 join 键)需独立小设计;v1 粘贴文本不受阻。
7. **两项前置核验**(排期前完成,均半小时级):@minicod/mcp-server 工具面是否暴露 citations/references(D5);termonline API 开放性/许可(B5)。
8. **B3 terminology 的最终归宿**:R2 cwd 文件版是否在 memory namespace 落地(R4,已决链后)时强制迁移并下线文件版,还是双轨长存——建议强制迁移,防两套真源。

**关键文件**:`backend/internal/prism/edit.go`(P0,161-170 行协议段)· `agent-skills/prism-lenses/wl-revision-strategy/SKILL.md:4`(第 6 处悬空路由)· `backend/internal/prism/quality.go`(⑥/数字地基扩展点)· `agent-skills/prism-lenses/`、`agent-skills/prism-personas/`(分批投放落点)· `backend/internal/prism/templates/`(word_limit 字段新增点)· `frontend-user/src/shared/lib/agent-references.ts`(D4 复用源)· `docs/research/prism-writing-2026-07/`(REPORT.md / DESIGN-V2.md / AGENT-ARCHITECTURE.md,本设计的约束真源)。
