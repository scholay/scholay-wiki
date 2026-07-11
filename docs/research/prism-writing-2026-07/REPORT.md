<!--
产出方式:多阶段 workflow(18 agents,0 error,~1.37M tokens)——
  Understand 4(读码:prism agent架构 / 审稿 base+lens 先例 / skill loader caps / 现有 prism-skills)
  Research 9(网上调研:结构·修辞动作 / 句段风格清晰 / 论证贡献 / 严谨诚实反spin / 可复现-报告规范 / 学科惯例 / 现成写作skill库 / 长文写作agent架构 / 中英文规范)
  Synthesize 1 → Critique 3(接地正确 / 可组合合caps / 覆盖质量)→ Finalize 1
接地校正(三份对抗批判一致命中、已全部并入):
  ① prism_projects 无 `subjects` 字段(仅 venue_template_key 可空 + DocStruct.TargetTemplate 默认 "article");学科确定性信号弱
  ② loader cap 是「字符 .length」不是字节:现常驻 4 skill 合计 8,139 chars(非 14.9KB),headroom 充裕,「必须激进瘦身」premise 不成立
  ③ 画像注入点是 hub seed 通道(prism 用静态 CreateSession,不走 create/AppendSystemPrompt),且 payload 通道无结构截断(须自 hard-truncate)
  ④ per-node intent 不能经 document.md 由 agent 往返(restoreBlockMeta 靠 OLD→NEW 匹配,新建 node 无 old);须走 struct-API 写、backend 读入 in-band 供 agent 只读
-->

# Prism 写作质量优化 — 镜像审稿「base + lens」的可组合写作技能体系(最终版)

# 概览

**要解决什么**:Prism 现在是「1 份静态系统提示 + 4 份全量常驻 skill(academic-writing / latex-format / figures / discipline-conventions)」,写作质量缺三样东西——(1) 按学科/文体切换的写作画像;(2) 可复用、可按需深加载的 craft/rigor 深度指南;(3) 让 agent 修订能锚定在**外部确定性信号**上的校验闭环。审稿(peerreview)已有成熟的「base 人格 + 可复用 lens + 按 slug 从磁盘保真拼装 + 有界 JSON 选择」体系,值得镜像。

**结论一句话**:把写作能力拆成 **base 文体人格(项目级恒定,只管结构/时态/引用风格)× craft lens × rigor lens(按当前编辑的 section-role 逐轮按需加载)**,base 走 in-band 保真注入(经 **hub seed 通道**,非 create 通道)、深度 lens 走 loader `guides/` 懒加载、并新增一个**几乎全非-LLM 的双轨校验回执(rigor/format + craft)**给修订轮当锚——用最小 backend 表面拿到审稿级丰富度,同时**不撑爆任何预算、不与 quota 冲突、不假设 Prism 结构里不存在的字段**。

> 三份对抗批判一致命中的四个致命接地错误已全部修正并写进本设计:①`subjects` 字段不存在;②预算数字把字节当字符;③注入点不是 create 通道而是 hub seed;④per-node intent 无法经 `document.md` 往返。另有多处丰富度/正交性/成本/quota 缺口在下文逐条修掉。

---

# 现状与先例

## Prism 现状(带文件路径)

- **真源**:`DocStruct` JSON(`backend/internal/prism/struct_model.go`),node 级结构体,`TargetTemplate` 默认 `"article"`(:129),`FrontMatter.Keywords`(:50-55);项目行 `prism_projects` 只有 `venue_template_key`(可空,`model.go:64`)。**没有 `subjects` 字段、没有管理它的 V2 表单**。
- **编辑面**:agent 唯一可写的是会话 cwd 的受限 markdown `document.md`(7 种 block,`struct_model.go:78-97`;`md_bridge.go` serialize/parse 互逆,`restoreBlockMeta` :468 靠 OLD→NEW block 匹配回填 struct-only 元数据)。轮末由 `parseEditorMarkdown`(md_bridge.go:146)合回结构体,projector 投影 LaTeX 编译。
- **会话模型**:**单个持续会话**跨整篇多轮。`ensureProjectSession`(edit.go:31)get-or-create,`createProjectSession`(edit.go:55)用**静态** `prismSessionOptions()`(spec.go)调 `CreateSession`(edit.go:62)——**无 `AppendSystemPrompt`,绕过 `buildCreateOptions`**。系统提示 + `MemoryBlocks` 是 **WS 连接时经 hub seed_history 下发**(hub.go seed 路径),不是 create 时。
- **轮机制**:`PrepareRound`(ws_round.go,DB current→cwd `document.md`,只写盘、无回传通道)→ WS user_message → agent `Read/Edit/Write` → `message_complete` → diff → `PendingRound` → 用户经 diff 门 `ApplyRound` 或 `RejectRound`。**backend 侧无 autoApply**(autoApply 概念在 Tiptap 编辑器层,非 agent 轮)。
- **既有校验**(都只在用户触发时算、agent 轮内看不到):`StructConformance`(struct_service.go)、`parseCompileStats`(overfull/页数)。
- **配额**:`PreUserMessage → CheckDailyQuotaOverdraft`,**按轮计费**;单轮有界透支,`windingDown` 到硬顶时 `tools=[]` 强制 `end_turn`。
- **常驻 skill 现状(实测字符)**:`prism-latex-format` 3,746 / `prism-figures` 1,677 / `prism-academic-writing` 1,288 / `prism-discipline-conventions` 1,428 = **合计 8,139 chars**;loader 按 `.length` 计,`TOTAL_CAP=40000`,故当前占用仅 ~20%,**headroom ~32k,「必须激进瘦身」这个前提不成立**。

## 审稿 base+lens 机制(先例,带文件路径)

- `agent-skills/reviewer-skills/rv-*/SKILL.md`:`<<<SCORING_PERSONA>>>` 段;`agent-skills/reviewer-lenses/lens-*/SKILL.md`:`<<<LENS>>>` 段(附加、无身份、无输出格式,`LensModule` 注释,`service_reviewers.go:41`),**可跨任意 rv-\* 复用**。
- `service_reviewers.go`:`availableReviewers`(:131)/`availableLenses`(:203)glob 花名册;`loadReviewerPersona`(:172)/`loadLensModule`(:237)**按 slug 从磁盘保真读、绝不信 agent 回显**;`resolveLenses`(:254)校验+去重+**硬上限+slug 升序**(prompt-cache 确定性);`parseSelection`+`extractLastFencedJSON`(:379)解析有界 JSON 选择;`builtinReviewerChoices`(:444)**永不 hard-fail 降级**。评分 JSON schema 拼在 prompt **最后**。
- lint:`scripts/lint-reviewer-skills.py`——`LENS_MAX_CHARS=1500` **只**限 `<<<LENS>>>` 体;`<<<SCORING_PERSONA>>>` **无长度上限**(:99-100)。
- 交付:2026-07 起审稿全 in-band、**不再 AddDir**。
- loader:`agent/src/skills/loader.ts` `PER_SKILL_CAP=8000`/`TOTAL_CAP=40000`(:14-15,`.length`),`buildSkillMenu` 菜单行 bypass cap,`:ro` 变更需重启;`MAX_SKILL_BODY=16000`(registry.ts:291)Skill 工具懒加载正文。

---

# 调研提炼(分面)

| 面 | 关键结论 | 代表来源 |
|---|---|---|
| Outline-first 长文 | 显式 per-unit 计划/预算才解锁可靠长文;先大纲后逐单元起草显著降重复/漂移 | STORM(Shao 2024)、AgentWrite/LongWriter(Bai 2024)、WriteHERE 异构递归(2025) |
| 逐节条件化起草 | 起草 node N 只喂「全局大纲 + 已写邻居摘要 + 本 node intent + 挂在 N 的引用源」,防长上下文漂移/自我重复 | Papers-to-Posts、Re³ |
| Verifier 是最高 ROI 且可非-LLM | 写作 agent 最常被省的组件是 verifier;把可机械判定的检查外置成确定性信号能显著提因子性,并**避免 Self-Refine 的 self-bias** | Self-Refine(Madaan 2023,警示自评偏差)、Reflexion、CRITIC(工具锚定) |
| 清晰度有确定性阈值 | 话题位/强调位、角色-动作主干、名词化率、主谓距离、主题句在位、旧→新衔接链——**都可机械测** | Gopen-Swan《Science of Scientific Writing》、Williams《Style》、reverse-outline |
| Spin/hedging 可词库化 | 三类 spin + 触发词表;结论强度须对齐主要结局证据 | Boutron 2010/2019 |
| 报告规范是**完整性清单** | CONSORT/PRISMA/STROBE/ARRIVE/SAMPL/MDAR;完整性须**全文(含附录)**判定,非 section-local | EQUATOR network |
| Skill 路由靠描述质量 | 大量近义 skill 描述会**降低** agent 选择准确率 | Anthropic agent skills 实践 |
| 结构真源=交叉校验优势 | 有结构文档可把「摘要 claim node ↔ results node」「`[@key]` ↔ bib」做确定性闭合,聊天式工具做不到 | (Prism 特有,DocStruct) |

---

# 写作能力分类法 —— 正交可组合的四层

审稿是「base + lens」两层;写作需要**多拆一条**,因为「学科惯例 / craft 好坏 / rigor 诚实」三者互不蕴含,外加「文体(是不是论文)」与结构强相关。

```
┌──────────────────────────────────────────────────────────────────────────┐
│ 轴 0(不可选 · 常驻内核 = 审稿 chief 类比,每轮兜底)                          │
│   编辑契约/机制(document.md)· 引用反幻觉硬约束 · 通用写作声音               │
└──────────────────────────────────────────────────────────────────────────┘
  轴 1  BASE 文体/学科人格(每 project 恰好 1,项目级恒定,in-band 保真)
        = 「文体基座(paper|rebuttal|cover-letter|grant|protocol|thesis-chapter)」
          其中 paper 基座再挂一个「学科结构子模块」(结构/时态/引用风格/该领域 rigor 内涵)
        ★ base 只管:结构骨架 + 时态语态 + 引用风格 + 报告规范的**结构位**
                    ×(正交)
  轴 2  CRAFT lens(0..N,axis:craft,**按当前 section-role 逐轮按需**)
        「写得好不好」——学科无关:clarity/cohesion/argument/structure/signposting/de-slop…
                    ×(正交)
  轴 3  RIGOR lens(0..N,axis:rigor,**按当前 section-role 逐轮按需**)
        「诚不诚实/齐不齐全」——学科无关的跨 base 复用检查:anti-spin/hedging/stats-language/
        causal/claim-evidence/figure-integrity/external-validity/ethics-irb…
        + 报告**完整性**校验(全文判定)= 单一 wl-rl-reporting,内部按 study-type 分流
```

**关键修正(对抗批判 §composability)**:
1. **报告规范不再拆成 4 个 base-耦合的 rigor lens**。CONSORT/PRISMA/STROBE/ARRIVE 的**结构位**归 base(它本就与文体 1:1);其**完整性清单**收进**一个** study-type-routed `wl-rl-reporting`(内部 switch),避免「同一事实两处写、必漂移」和菜单近义项污染路由。rigor-lens 层**只保留真正跨 base 复用**的检查(anti-spin/hedging/stats/causal/claim-evidence/figure-integrity/external-validity/ethics)——这才是 lens 抽象挣得的内容。
2. **base 是项目恒定,craft/rigor lens 是逐轮按需**。正确的激活时机是「写哪个 section 才加哪个 lens」(stats-language→Results、anti-spin→Discussion),Prism 从 DocStruct 已知 section-role。所以**不设「项目默认常驻 lens 组」**(那会在写 Abstract 时白付 stats lens 的 token,50+ 轮会话里成倍放大成本);改由 `/round/prepare` 时按 section-role 给一个**确定性菜单指针**,让 agent Skill-load 正确 lens。
3. **正交性证明只对真正跨 base 的 lens 成立**:`wl-clarity`(Gopen-Swan)对数学证明与临床 RCT 同样适用;`wl-rl-anti-spin`(Boutron)对 CS·ML 与生物医学同样适用。报告规范因为不跨 base,已被移出 lens 层。
4. **文体≠craft pass**:rebuttal/cover-letter/grant/protocol 不是「叠在论文之上的 craft lens」(它们不要 IMRaD),而是**另一种 base 文档**,与 paper 基座**互斥单选**。

---

# 技能目录

命名/目录(slug 白名单同时是分类闸 + 路径穿越守卫):
- 常驻内核:`agent-skills/prism-skills/`(现址,精简后)→ 挂 `/prism-add/.claude/skills`(always-on)
- BASE:`agent-skills/prism-personas/pw-*/SKILL.md`,`<<<WRITING_PERSONA>>>` 段,slug `^pw-[a-z0-9-]+$`
- 写作 lens:`agent-skills/prism-lenses/wl-*/SKILL.md`,`<<<LENS>>>` 紧凑核 + frontmatter `axis: craft|rigor`,slug `^wl-[a-z0-9-]+$`
- 深度指南正文:同一 `wl-*` 文件**双挂**——backend 读 `<<<LENS>>>` 核(仅当极少数被设为项目级 always;≤1500 chars)、agent 经 `/prism-add/guides` + Skill 工具读全文(≤16000)。**被 resolve 进 in-band 的 lens,其 guides 菜单行必须抑制**(防同一 lens 两处、两份可能冲突的文本)。

## 2A. 常驻内核(always-on,~3 份,轴 0)

| 文件 | scope(一句) |
|---|---|
| `prism-writing-core` | 通用声音:章节感知 register/默认时态、claim-first 主题句、move 思维、默认 hedging 校准、一句一信息 |
| `prism-edit-discipline` | `document.md` 受限 markdown 机制 + 编辑纪律:`$…$`、GFM 表、`{#fig/tbl/sec:}` 锚 + `[@key]`、frontmatter 不删行、转义、**node 级最小定点编辑禁整篇重写**、不写 LaTeX 源码/不编译/不画图(拆自 `prism-latex-format`) |
| `prism-citation-grounding` | 反幻觉硬约束:绝不从记忆造 `[@key]`/BibTeX;`cite-then-write`;只用 minicod 查到的真论文写 `references.bib`;润色保留所有 `[@key]` 位置 |

> 删 `prism-discipline-conventions`(7 领域各 1-2 行 monolith → 由 pw-* 深化取代);迁 `prism-figures` → `wl-figure-narrative`(按需 craft)。三份核实测目标各 ~2.5-5k chars,常驻总量 build-time 断言 **< 12000 chars**(远低于 40000,舒适)。

## 2B. BASE 文体/学科人格 pw-*(每 project 选 1)

**文体基座(与 paper 互斥单选)**:

| slug | scope |
|---|---|
| `pw-doc-rebuttal` | response-to-reviewers:point-by-point 结构 + 语气(concede/clarify/push-back)+ 引改后行号 |
| `pw-doc-cover-letter` | 投稿信/与编辑沟通 |
| `pw-doc-grant` | aims / significance / broader-impacts / approach |
| `pw-doc-registered-report` | 前置假设 + 分析计划(pre-specified,与 preregistration rigor 呼应) |
| `pw-doc-thesis-chapter` | 章级连贯、lit-review-as-chapter、跨章交叉引用 |

**学科-论文人格(paper 基座下选 1,已按批判合并去碎片化)**:

| slug | scope |
|---|---|
| `pw-experimental-stem` | 通用实证 IMRaD:Methods/Results 过去时 vs 公认事实现在时、量化呈现、可复现细节(覆盖物理/化学/材料/实验生物/神经/基因组的**结构-时态-引用**层;各领域特异报告项走 `wl-rl-reporting`/`wl-rl-materials`) |
| `pw-biomedical-empirical` | 临床/临床前/观察性生物医学的 IMRaD + participant flow/outcomes+效应量·CI/harms;**报告规范(CONSORT/STROBE/ARRIVE)由 `wl-rl-reporting` 按 study-type 分流**,base 只放结构位与试验注册号期望 |
| `pw-cs-systems-ml` | 贡献 bullet 前置、evaluation 围绕可复现(artifact/代码/数据/环境)、ablation+baseline 归因、related work 用于 positioning、记号一致 |
| `pw-math-proof-theory` | def-theorem-proof 骨架、self-contained 陈述、`Proof…□`、显式逻辑状态、theorem/lemma/corollary 分级、句首不用符号、定义附 motivation |
| `pw-systematic-review` | PRISMA 四阶段 + 可复现检索块、纳排透明、taxonomy 分组、强制 synthesis(≠逐篇罗列) |
| `pw-qualitative-social` | reflexivity 段、trustworthiness(triangulation/member-checking/audit-trail)、thick description + 逐字引语、允许第一人称、COREQ vs SRQR |
| `pw-quant-social-psych-econ` | 识别假设/稳健性/因果需识别策略;APA 结构 + 效应量·CI 最低期望 + pre-reg vs post-hoc 区分;author-date |
| `pw-engineering-systems` | 系统贡献、设计-实现-评估、benchmark、工程可复现 |
| `pw-humanities-argumentative` | 论证 + 文本证据 + 理论框架、Chicago/MLA、nuanced hedging |

> base 从 17 收敛到 ~9 学科 + 5 文体。收敛依据(批判 §composability/§coverage):17 个学科基座的真实差异(结构/时态/引用)在多数实证领域是共享的,过度分裂只制造 base↔lens 重复;领域特异的报告/材料细节归 rigor lens。

## 2C. CRAFT lens(axis:craft,逐轮按需)

| slug | scope |
|---|---|
| `wl-structure` | CARS 引言 3-move、反漏斗 discussion 5-move、per-section job+时态+禁写内容、abstract 5-slot、methods 子脚手架 |
| `wl-clarity` | Gopen-Swan 话题位/强调位、Williams 角色-动作主干、名词化诊断+豁免、主谓邻近阈值、concision、删 metadiscourse |
| `wl-cohesion-flow` | 旧→新/known-new、theme→rheme 链、段级话题串收敛 |
| `wl-argument` | SPJ 叙事弧、Toulmin 六件套(标 unstated warrant)、claim 校准梯度、contribution bullet 可证伪+So-What |
| `wl-related-work-structure` | 按主题簇组织、positioning 定位句(公正性归 rigor) |
| `wl-signposting` | intro roadmap→frame markers→endophoric 交叉引用、relation-appropriate 连接词 |
| `wl-title-abstract` | 标题打磨、摘要**从成稿章节派生**、关键词 3-8 |
| `wl-figure-narrative` | 题注 craft、figure-first、表叙述、`{#fig}` 锚(升级自 prism-figures) |
| `wl-paragraph` | PEEL/MEAL、主题句关键词回声、一段一意 |
| `wl-de-slop` | AI 腔黑名单 + humanize(**on_demand** 定档) |
| `wl-eal-chinglish` | 非母语英文:冠词、时态一致、Chinglish 赘余→动词、句长护栏 |
| `wl-length-budget` | per-node 目标字数、按 venue 页/字预算扩写/压缩 |

> mode-rebuttal/cover-letter/grant/limitations **已从 craft 轴移走**:前三个→2B 文体基座;limitations craft 与 `wl-rl-limitations-honesty` 合并进后者(避免同 section 双 lens)。

## 2D. RIGOR lens(axis:rigor,逐轮按需;只保留跨 base 复用项)

| slug | scope |
|---|---|
| `wl-rl-anti-spin` | Boutron 三类 spin + 触发词库 + 结论强度 vs 主要结局证据对齐 |
| `wl-rl-hedging` | 逐句估证据档位匹配修饰语强度,双向纠 over/under-hedge(**on_demand** 定档) |
| `wl-rl-stats-language` | p 值红线、estimation-first(effect size+95%CI)、SAMPL、不显著≠接受零假设 |
| `wl-rl-multiple-comparisons` | **独立** lens(从 stats 拆出):多重比较/FDR、家族错误、常被省 |
| `wl-rl-causal-language` | 从 Methods 判设计→校准因果动词梯度 associate…→cause;查 claim↔引用跳级 |
| `wl-rl-claim-evidence` | abstract↔results 一致、overclaiming、机制叙事过载(warrant 缺失)——**并触发 §校验里的结构级闭合** |
| `wl-rl-limitations-honesty` | 剔样板套话、每条限制说明对具体结论/功效/外推的影响、limitation↔conclusion 跨节回改 |
| `wl-rl-external-validity` | scope-of-claim vs 采样人群/场景/时间、单数据集/单点过度外推(**恢复自 peerreview lens-external-validity**) |
| `wl-rl-figure-integrity` | error-bar 定义(SD/SE/CI)、轴截断/双轴诚实、无 panel-splice(**恢复自 lens-figure-integrity**;补 `wl-figure-narrative` 只管 craft 的缺口) |
| `wl-rl-ethics-irb` | IRB/consent/ethics-approval 声明起草(**恢复自 lens-ethics-irb**) |
| `wl-rl-preregistration-harking` | **独立** lens:pre-specified vs post-hoc、防 HARKing(不再埋进 psychology base) |
| `wl-rl-reproducible-methods` | 领域无关 rigor 管道:样本量+依据/随机化/盲法/纳排/确切检验+软件版本;缺项插 labeled TODO stub(核心 checklist 下沉进各实证 pw-* always-scan,见「base 兜底」) |
| `wl-rl-availability` | data/code availability 参数化模板;拒绝裸「available on request」 |
| `wl-rl-materials-mdar` | 每试剂/数据/工具/模型:Accessibility/Identification(RRID/accession/version)/Characterization |
| `wl-rl-related-work-fairness` | 反 straw-man、避免引用刷量、贡献 delta 公正 |
| `wl-rl-citation-integrity` | 深度引用审计:被引源是否真支撑该 claim、`[MATERIAL GAP]` 占位 |
| `wl-rl-eval-contamination` | 评测污染/数据泄漏(ML) |
| `wl-rl-reporting` | **单一** study-type-routed 完整性校验:内部 CONSORT/PRISMA/STROBE/ARRIVE switch;**全文(含附录)判定**,不 section-local |

**base 兜底(修批判「reproducible-methods 是最常被省却设成 opt-in」)**:`wl-rl-reproducible-methods` 的**核心 checklist(样本量/随机化/盲法)**下沉进每个实证 pw-* 的**always-scan 提示**(base 恒在场),lens 只承担深度展开——避免 agent「忘了 load 就漏最关键 rigor」。

> 合计 ~3 常驻 + ~14 base(9 学科 + 5 文体)+ ~12 craft + ~18 rigor ≈ **47 条**,与审稿(32 rv + 12 lens)同量级。**恢复了 peerreview 已有却被 draft 丢掉的 3 个先例 lens**(figure-integrity/external-validity/ethics-irb),**去折叠**了 multiple-comparisons 与 preregistration-harking——契合「镜像成熟审稿体系」的本意。

---

# Agent 架构设计

## 三层交付(接地 Prism 真实会话流)

```
┌── 系统提示 seed(WS 连接时经 hub seed_history 下发;prism 用静态 CreateSession,不走 create 通道)┐
│ ① agentNativeProtocol(编辑契约,常驻)                                                          │
│ ② MemoryBlocks(userID)(user-scoped,已有)                                                       │
│ ③【新】WritingProfileBlock(project) ← base 文体/学科人格,按 slug 从磁盘保真读、in-band 拼        │
│    ⚠ 走 seed 通道(与 MemoryBlocks 同「字符串拼接」层),但**身份来源不同**(见 §注入身份)        │
│    ⚠ payload 通道**无结构截断**,必须自己 hard-truncate + slog.Warn                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
┌── AddDir 通道 /prism-add(受 8000/40000 cap)──────────────────────────────────────────────────┐
│ .claude/skills/ ← 常驻内核 3 份(每轮在场)                                                       │
│ guides/wl-*      ← 全量深度 lens,仅注入 when_to_use 菜单行(bypass cap),正文经 Skill 懒加载       │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
┌── 逐轮 in-band 前缀(prism 特有,ws_round 驱动;新 plumbing)─────────────────────────────────────┐
│ /round/prepare 组一个「回合信封」:section-role→推荐 lens 菜单指针 + 上一次 apply 的校验回执        │
│ 注入在该轮 user_message 的 in-band 前缀里(逐轮,非仅首条;是新增能力,honestly flagged)            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

三层职责:轴 0 常驻=不可组合的「chief」每轮兜底;轴 1 base=项目级恒定 in-band(KV-cache 友好,只在用户改画像时失效);轴 2/3 深度 lens=0 常驻 token、按 section-role 逐轮懒加载。**这是「丰富度不撑爆 40k、且长会话不成倍计费」的关键**。

## 注入点与身份(修批判「机制与 MemoryBlocks 同」的过度声明)

- **注入点 = hub seed,不是 create**。Prism `edit.go:62` 用静态 `prismSessionOptions()` 建会话,无 `AppendSystemPrompt`;系统提示 + MemoryBlocks 是 WS 连接时 hub seed 下发。画像块骑同一 seed 通道拼在 MemoryBlocks 之后。
- **身份层不对等,需新 plumbing**。MemoryBlocks 是 **user-scoped**(`MemoryBlocks(userID)`,seed 路径只传 `userID`)。**per-project 画像必须把 session→project→profile 串进 seed builder**:hub 侧已有 `sessionID`,需新增 `sessionID → prism_projects(agent_session_id) → project → writing_profile` 解析,并把「project-scoped profile 文本」传进 seed 组装。设计如实标注:**与 MemoryBlocks 的相似仅在「字符串拼接」这一层,身份解析是新增工作**(约:agentbridge 加一个 `SessionProfile(ctx, sessionID) string` provider,prism 实现它做上面这条解析;非-prism feature 返回 `""`)。

## 写作画像怎么「选」(修「subjects 不存在→确定性默认很弱」)

Prism 唯一可靠结构信号是 `venue_template_key` + `FrontMatter.Keywords`,二者对 `article`/arXiv/blank 模板**常常给不出学科**。因此:

1. **确定性默认(零 agent 成本)**:`venue_template_key → 学科` 映射表(作为**数据**维护)+ keywords 精修。**明确「无信号」分支**:模板学科无关或 keywords 空 → 直接落 `builtinWritingProfile()`(通用 `pw-experimental-stem` paper 基座)**并标 `needs_refine`**。
2. **planner 轮(实为主精修路径,非可选奢侈)**:因确定性默认经常落到兜底,**一次性 planner 轮成为达到准确画像的主路径**。首次实质编辑前跑 throwaway 轮:读稿 + 注入 `availablePersonas()`/`availableLenses()` 花名册 → 末尾输出与审稿**同构**的选择 JSON `{"base":"pw-...","genre":"paper|rebuttal|...","why_chosen":"..."}`;backend 复用 `extractLastFencedJSON` 解析→按 slug resolve→落库 `source:"planner"`。**注意 lens 不在此固定选(lens 是逐轮 section-scoped),planner 只定 base/genre**。
3. **用户覆盖(最高优先级)**:`PUT /api/v1/user/prism/projects/:id/writing-profile`,前端 base 单选面板。契合「用户拍板」铁律。

三者产物统一落新列 `prism_projects.writing_profile`(`{base_slug, genre, source, needs_refine}`),注入路径同一。

**画像变更失效(修批判「stale profile on live session」)**:hub seed 只在字段为空时回填(不覆盖活会话)。因此 `PUT writing-profile` 或 planner 重选 **必须调 `recreateProjectSession`/`DeleteSession`(edit.go:100/125)**,让下次连接用新画像重建 seed。否则用户覆盖在活会话内静默 no-op。此步写入设计,非可选。

## planning → drafting → revision 循环

| 阶段 | 轮的形态 | 载入 | 关键接地 |
|---|---|---|---|
| **Planning** | 编辑**结构骨架**:heading/空 node + 写 per-node `intent`/`target_length`,不写散文 | 常驻 + base;可 Skill-load `wl-structure` | ⚠ **per-node intent 不能经 `document.md` 由 agent 往返**(见下)。Planning 落成 **struct-API 操作**(`SaveStruct`/struct_handler,backend/UI 驱动),agent 在 in-band 上下文里**只读**注入的 intent |
| **Drafting** | 逐 node 起草:in-band 上下文 = 全局大纲(所有 node intent)+ 已写邻居 + 本 node intent + 挂在 N 的引用源 | 常驻 + base;按 section-role Skill-load 对应 `wl-*` | 条件化起草防漂移 |
| **Revision** | 修订轮,**外部信号锚定**,上限 2-3 | 常驻 + base;按 pass Skill-load 对应 `wl-*` | 见 §校验闭环;每次迭代=一个 quota 轮,须披露 |

**per-node intent/target_length 的载体(修批判「document.md 无法承载」)**:agent 唯一可写面是 `document.md`(7 block,无 Intent/TargetLength 字段,markdown 不可表达);`restoreBlockMeta` 靠 OLD→NEW 匹配回填,**planner 新建 node 没有 old 匹配 → 无法往返**。结论:**intent/target_length 存在 `DocStruct` node 的可选字段里,由 struct-API(后端/UI)写、由 backend 组装进 agent 的 in-band 上下文供其读**;**agent 不经 `document.md` 写 intent**。UI 露一个「扩到 ~800 词」杠杆写 `target_length`。(LongWriter:显式 per-unit 预算才解锁可靠长文。)

## Citation grounding 反幻觉

- **常驻硬约束**(`prism-citation-grounding`):`cite-then-write`;沿用 `onPick=flush→applyCite→refetch→insertCitation` 铁律与 `mergeBibInto`(cite.go)。
- **确定性后置校验(非 LLM)**:扫 `document.md` 所有 `[@key]`,凡不在 `references.bib` 已解析键集合 → 标红。此检查在无结构文本里做不到,是 Prism 结构真源优势。

## 质量校验闭环 —— **双轨回执**(修最严重的「craft 无锚 = self-bias」缺口)

批判核心命中:draft 的 verifier 回执只喂机械 rigor/format 信号,**craft 轴(clarity/cohesion/argument/structure/de-slop)完全没有外部锚**,退化成 Self-Refine 自评偏差——正是设计引用的研究要避免的陷阱。修法:回执**拆两轨,都尽量非-LLM**。

**A. rigor/format 回执**(确定性布尔):① `parseCompileStats`(编译通过/overfull/页数 vs venue);② 悬空 `[@key]`;③ undefined `{#...}`(复用 `isCrossRefKey`);④ `StructConformance` 必填前置缺口;⑤ **结构级 claim↔evidence 闭合**——摘要/引言的 claim node 是否映射到某 results node(利用 DocStruct,类比 `[@key]` 校验;这是 Prism 最区别于「聊天贴剪贴板」的高价值检查);⑥ study-type reporting 完整性(全文判定)。

**B. craft 回执**(机械阈值,非-LLM,这是补上的关键):句长 >40w、主谓距离 >8-10w、名词化率 ≥5%、每段主题句在位、given→new 衔接断裂、reverse-outline「主题句是否支撑本节 claim」、缩写/记号首次定义一致。→ 让 craft 修订也锚在外部信号上,而非模型自评。

**注入与时序(如实标注新 plumbing 与滞后)**:
- 所有信号在 **`ApplyRound` 时/后**在**已 apply**的文档上算(`PrepareRound` 只写盘、无回传通道)。因此回执只能在**下一轮的回合信封 in-band 前缀**里到达 agent,**不是 mid-turn tool-result**。这是新增的「逐轮前缀注入」能力(prism `ws_round` 特有),不是复用现成钩子——诚实计入工作量。
- 循环**只在已接受的轮上闭合**:必须 `ApplyRound`(用户经 diff 门)后才有新信号;`RejectRound` 不产信号。所以「有界 self-refine」实质是**多次 apply、用户在环、每次一个 quota 轮**的过程,**不是紧凑 in-turn 自迭代**(backend 无 autoApply)。
- **首个修订轮可能没有编译产物**(上一 apply 尚未编译)→ 门逻辑必须把「暂无信号」与「通过」**区别对待**,否则误放行/误阻塞。
- 门:在这些布尔上,上限 2-3 次,避免 self-bias thrash 与费用。

## Revision 与 quota 的调和(修批判「迭代被当免费」)

配额**按轮计费**。明确取舍并披露:
- **采用路径 A(多轮 + 用户在环)**,因为它与现有 user-gated 轮模型(`Prepare→Pending→Apply/Reject`,无 backend autoApply)一致:**每个修订迭代 = 一个 quota 轮**,前端**显式披露**「本次修订将消耗 N 个额度轮」。
- **不采用单轮内自 refine**:单轮跑到硬顶会被 `windingDown`(`tools=[]`)**中途截断**,留下半改稿,且 anchor 到 N+1 的回执从未被消费。
- 若未来要单轮内闭环,须给单轮透支预算留 reserve 防截断——列为开放项,当前不做。

## 与审稿:复用 vs 分叉

**直接复用(镜像 `service_reviewers.go` 模式)**:`<<<...>>>` 段 + frontmatter + slug 白名单正则 + **按 slug 从磁盘保真读(不信 agent 回显)**;lens 概念(附加/无身份/无输出格式/跨 base 复用);`resolveLenses` 校验+去重+硬上限+**slug 升序**;**永不 hard-fail** 降级到 `builtinWritingProfile()`;lint 脚本形态。新建 `backend/internal/prism/writing_persona.go` 逐函数镜像 `availablePersonas/availableLenses/loadWritingPersona/loadLensModule/resolveLenses/parseSelection(复用 extractLastFencedJSON)/builtinWritingProfile/renderProfileBlock`(公共 helper 可抽共享包)。

**必须分叉**:① peerreview 输出契约=末尾评分 JSON schema;Prism **无 JSON schema**,输出=对 `document.md` 的最小 node 级编辑,该契约在**常驻内核**每轮在场,故**画像块不以 schema 收尾**(纯附加引导)。② 组装粒度:peerreview 每评分轮拼全新 prompt;Prism base 一次注入、项目内恒定;lens 逐轮按需。③ 选择时机:peerreview 每提交 throwaway 轮;Prism 确定性默认(弱)+ planner(主精修)+ 用户覆盖,持久化 per project;**lens 不在选择期固定,按 section-role 逐轮**。④ base/lens 语义:base 从「评价 rubric」→「生成 register/时态/move」;rigor lens 从「查违规」→「帮作者满足(起草声明/插 TODO stub/校准措辞)」,产物是逐句 diff 建议非评分。⑤ chief 类比=常驻内核。⑥ 交付:peerreview 全 in-band;Prism **两模式并用**(常驻 + 按需)。⑦ lint:**不能 1:1 抄**——reviewer lint 无 persona 长度上限,Prism 必须给 `<<<WRITING_PERSONA>>>` 加上限(见 §lint)。

---

# 与 loader caps 适配 + 字符预算分配

## 三个独立预算(基线全部用**字符**,不是字节)

| 通道 | cap | 放什么 | 预算控制 |
|---|---|---|---|
| **seed payload**(hub seed 拼接) | **无结构截断**(仅计费成本) | agentNativeProtocol(~常量)+ MemoryBlocks(变长)+ **画像块** | 画像块 = 1 base 人格,`renderProfileBlock` **hard-truncate 到 ≤3000 chars + slog.Warn**(payload 通道 loader 不管,必须自守);**不放常驻 lens 组**(lens 走逐轮按需) |
| **AddDir /prism-add** | PER_SKILL 8000 / TOTAL 40000(`.length`) | 常驻内核 3 份 + guides **菜单行**(bypass cap) | 3 份核目标各 ~2.5-5k,**常驻总量 build-time 断言 < 12000**(现 4 份仅 8,139;精简+搬走后更低,headroom 充裕) |
| **on-demand guide 正文** | MAX_SKILL_BODY 16000 | 全量 wl-* 深度正文 | 每条 0 常驻 token,仅调用时付 ≤16000 |

**再基线(修「字节当字符」)**:当前常驻实测 **8,139 chars**(非 14.9KB 字节);`prism-latex-format` **3,746 chars**(非 6456「近 8000 顶」)。故拆成 3 份核**很舒适**;「必须激进瘦身」premise 不成立——瘦身的真理由是**职责清晰(编辑纪律/反幻觉独立成核)+ 让 payload 画像块每轮成本可控**,非 cap 压力。

**每轮真实驻留成本核算(修「只按通道孤立算」)**:build-time 断言必须**求和所有共驻通道**:`agentNativeProtocol + 常驻核(<12000)+ 画像块(<3000)+ MemoryBlocks`。loader 只在 runtime warn 且看不到 payload 通道,故补一个**跨通道构建期硬 gate**。因 lens 不再驻留,长会话每轮增量恒定小(base ≤3000 + 按需 lens 的一次性 ≤16000,用完不驻留)。

## 加一条 skill 的定式

- **加按需 lens**:丢 `agent-skills/prism-lenses/wl-xxx/SKILL.md`(frontmatter `when_to_use`/`axis` + `<<<LENS>>>` 核)→ 已被 `/prism-add/guides` 与 backend `PRISM_LENSES_DIR` 两处 `:ro` 覆盖 → **重启 agent 容器**(`:ro` 变更需重启)。无 Go 改。
- **加 base 人格**:丢 `agent-skills/prism-personas/pw-xxx/SKILL.md`(含 `<<<WRITING_PERSONA>>>`)→ `availablePersonas()` 自动收录、planner 花名册自动出现。无 Go 改。
- **加/改常驻核**:改 `prism-skills/*` → 重启;盯 `docker logs` 有无 `hit total cap`/`truncated`。

---

# 落地步骤(分阶段,风险递增,可独立发)

**Phase 0(纯 skill 重组,零 backend 改,零风险)**:拆 `prism-latex-format`→`prism-edit-discipline`+`prism-citation-grounding`;瘦身 `prism-academic-writing`→`prism-writing-core`;删 `prism-discipline-conventions`;`prism-figures`→`wl-figure-narrative`。加 `scripts/lint-writing-skills.py`。验证 loader 仍在 cap 内。**立得**:反幻觉独立成核 + 常驻职责清晰。

**Phase 1(按需 lens 库,加一个 compose 挂载,低风险)**:建全量 `wl-*` guides(含恢复的 figure-integrity/external-validity/ethics-irb 与拆出的 multiple-comparisons/preregistration-harking、合并的 `wl-rl-reporting`),`docker-compose.yml` 加 `./agent-skills/prism-lenses:/prism-add/guides:ro`。agent 即可 Skill-load。**纯加法、零 backend 逻辑改,交付大部分 craft/rigor 覆盖**——完全接地(claw `/claw-add` guides + `buildSkillMenu` + Skill 工具 + MAX_SKILL_BODY 16000 先例)。**明确与 Phase 2 解耦,Phase 1 的安全不为 Phase 2 的 plumbing 背书**。

**Phase 2(画像 in-band,backend + 迁移,中风险)**:`writing_persona.go`(镜像 `service_reviewers.go`,但 lint/renderProfileBlock 加 persona 上限 + hard-truncate);compose 加 backend `:ro`(`PRISM_PERSONAS_DIR`/`PRISM_LENSES_DIR`,两容器同源,peerreview 先例);建 `pw-*` 库 + `wl-*` 的 `<<<LENS>>>` 核;迁移新列 `prism_projects.writing_profile`(幂等 `add_column_if_not_exists`,utf8mb4);`venue_template_key→profile` 确定性默认(数据表)+ **明确无信号→builtin+`needs_refine`** 分支;agentbridge 加 `SessionProfile(ctx, sessionID) string` provider + **sessionID→project 身份解析新 plumbing**;hub seed 在 MemoryBlocks 之后拼画像块;**`PUT writing-profile` 触发 `recreateProjectSession`** 失效活会话。

**Phase 3(planner + 用户覆盖,中风险)**:一次性 planner 轮(只定 base/genre,选择 JSON 复用 `extractLastFencedJSON`)+ `PUT …/writing-profile` 端点 + 前端 base 单选面板 + admin 可视。

**Phase 4(双轨 verifier 回执闭环 + 逐轮前缀注入,最高风险)**:实现「回合信封」逐轮 in-band 前缀;把 §双轨回执(rigor/format A + craft B + 结构级 claim↔evidence)在 revision 轮注入;门=布尔 + 上限 2-3 + **「暂无信号」≠「通过」**;前端披露**每次修订 = 一个 quota 轮**。Planning 的 per-node intent 走 struct-API(非 agent `document.md`)。

## lint / 校验(CI exit 1)—— `scripts/lint-writing-skills.py`(照 reviewer lint 改,但**补 persona 上限**)

- `pw-*`:必须含 `<<<WRITING_PERSONA>>>`;**段内无工具/skill 词**(skill/task/agent/invoke/mcp__/调用技能);**新增:`<<<WRITING_PERSONA>>>` 体 ≤3000 chars**(reviewer lint 缺此,不能 1:1 抄,否则 base 无界撑破 payload)。
- `wl-*`:必须含 `<<<LENS>>>` + `axis: craft|rigor`;段内**无工具/skill 词** + **无输出格式词**(json/schema/输出格式,防与常驻编辑纪律竞争);`<<<LENS>>>` 核 ≤1500 chars。
- slug 闸:`^pw-[a-z0-9-]+$` / `^wl-[a-z0-9-]+$`。
- **跨通道常驻总量 build-time 断言**(按字符,mirror loader `.length`):`常驻核总和 < 12000` 且 `常驻核 + max 画像块(3000) + agentNativeProtocol < TOTAL_CAP` 留足余量。
- **双挂互斥断言**:被 resolve 进 in-band 的 lens,其 guides 菜单行必须被抑制(防两处)。

## 接地清单(改哪/加哪,全绝对路径)

**改**:
- `backend/internal/prism/spec.go` — `prismSessionOptions()` AddDirs 已是 `["/prism-add"]`,guides/ 靠 compose 新挂载即被 `buildSkillMenu` 发现,**无需改 AddDirs**;`BuildSpec()` 挂 `SessionProfile` provider。
- `backend/internal/agentbridge/spec.go` — `FeatureSpec` 加 `SessionProfile func(ctx, sessionID string) string`(注意签名以 **sessionID** 为身份,非 ownerID)。
- `backend/internal/agentbridge/bridge.go` + `hub.go` — seed 组装在 MemoryBlocks 后拼画像块;**新增 sessionID→project 解析把 project-scoped 文本喂进 seed**。
- `backend/internal/prism/edit.go` — `createProjectSession` 建会话时补默认 `writing_profile`(仅 DB 行);画像变更调 `recreateProjectSession`(:100)/`DeleteSession`(:125)。
- `backend/internal/prism/ws_round.go` — `PrepareRound`:组「回合信封」(section-role 菜单指针 + 上次 apply 回执)注入本轮 user_message 前缀;`ApplyRound`:算双轨回执 + 悬空 `[@key]`/undefined `{#...}`/结构级 claim↔evidence 校验。
- `backend/internal/prism/struct_model.go` — `DocStruct` node 加可选 `Intent`/`TargetLength`;**由 struct-API 写、backend 读入 in-band 上下文;不进 `document.md`,agent 只读**。`struct_service.go`/`struct_handler` 承载 planning 的 struct 操作。
- `backend/internal/prism/edit.go` `agentNativeProtocol` — 保持编辑契约常驻。
- `docker-compose.yml` — agent 侧 `./agent-skills/prism-lenses:/prism-add/guides:ro`;backend 侧 `./agent-skills/prism-personas:/app/prism-personas:ro` + `./agent-skills/prism-lenses:/app/prism-lenses:ro`(参照现 peerreview :287-304)。
- `agent-skills/prism-skills/{prism-academic-writing,prism-latex-format,prism-figures,prism-discipline-conventions}/SKILL.md` — Phase 0 拆分/瘦身/迁移/删除。

**加**:
- `backend/internal/prism/writing_persona.go`(镜像 `service_reviewers.go`,补 persona 上限 + renderProfileBlock hard-truncate)。
- `agent-skills/prism-skills/{prism-writing-core,prism-edit-discipline,prism-citation-grounding}/`。
- `agent-skills/prism-personas/pw-*/SKILL.md`(~14)。
- `agent-skills/prism-lenses/wl-*/SKILL.md`(~30,双挂)。
- `scripts/lint-writing-skills.py`。
- `docker/mysql/migrations/NNNN_prism_writing_profile_fields.sql`(幂等,utf8mb4)。

**保真参考(读、照抄模式)**:`service_reviewers.go`:131/172/203/237/254/379/444;`agentbridge/picker.go` `NewStaticPicker`(画像**不走 picker**,走 seed provider);`agent/src/skills/loader.ts`:14-15/56/103-116;`scripts/lint-reviewer-skills.py`(注意其 persona 无上限,是要补的差异)。

---

# 开放问题 / 取舍(诚实标注)

1. **【需 owner 拍板】base 轴的精确因子化**:文体基座(paper/rebuttal/…)与学科人格是「一个互斥选择器」还是「genre 选择器 + 论文下的学科子选择器」?本设计取前者(rebuttal 直接是 base,不叠 IMRaD),但 rebuttal 仍需学科的引用风格/rigor 语言——是否允许 non-paper 基座**引用**学科人格的「引用风格子块」而不继承其结构?建议前者简单,owner 定。
2. **【需接地确认】逐轮前缀注入**:§Phase 4 的「回合信封 in-band 前缀」是**新增能力**(agentbridge 现只在**首条** user_message 注入 SystemPrompt 前缀)。Prism `ws_round` 逐轮注入是否要下沉到 agentbridge 还是 prism-local?工作量取决于此,建议 prism-local 起步。
3. **planner 轮的成本**:因确定性默认弱,planner 成了主精修路径,**每个新项目多花一个 throwaway agent 轮**。可否用极便宜的 `ModelLow` + 只读 FrontMatter/前 2 段?或仅当 `needs_refine` 时才跑?建议后者(默认命中学科时跳过)。
4. **section-role → lens 映射表**:draft/revision 轮由 backend 按 node section-role 给「推荐 lens 菜单指针」,该映射需人工维护且可能与 agent 判断冲突——是硬推(强制 Skill-load)还是软提示(菜单加星)?建议软提示,保留 agent 自主。
5. **reporting 完整性的全文判定成本**:`wl-rl-reporting` 要求全文(含附录)扫描以避免 section-local 误报,但 Prism 附录是否在同一 DocStruct?若外挂,完整性校验会漏——需确认附录归属。
6. **planning 的 UI/agent 边界**:per-node intent 既然只能 struct-API 写(非 agent `document.md`),那「AI 帮我搭大纲」这个诉求怎么落?要么 UI 提供大纲编辑 + 一个**独立的 struct-API agent 端点**(非普通编辑轮),要么放弃 AI 自动搭骨架、只做 AI 读 intent 起草。建议先做后者(低风险),AI 搭骨架列为后续。
7. **de-slop/hedging 已定档 on-demand**:若实测发现 AI 腔/over-hedge 普遍到值得常驻,可把**极短**版本(≤300 chars)并进 `prism-writing-core`,但需重算跨通道断言。当前不常驻。
8. **planner 与画像失效的并发**:planner 重选 + 用户同时覆盖的竞态,以及 `recreateProjectSession` 与正在跑的 executor 轮的时序——沿用 prism 现有项目锁,但需测「改画像→重建→下轮连接」这条路是否真的换上新 seed(批判明确点名此处最易 silent no-op)。上线前 `/verify` 必测。
