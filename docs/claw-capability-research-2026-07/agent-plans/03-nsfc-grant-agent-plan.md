# 国自然基金标书工作台 · 深度工程方案(feature_key = `nsfc_grant`)【修订终稿】

> 骨架沿用 docs/claw-capability-research-2026-07/designs/04-nsfc-grant.md(集成范式、backend 三件套、前端克隆路径、0034/SetVIPChecker 坑位全部照用,不再重复)。本轮加深四块:**确定性引擎 nsfc-kit、开源集成、项目状态机、质量评测**,并按政策核实修正事实基础。修订版重点补强:**签名级防篡改、真源持久化对抗 workdir GC、mock-review 对齐现行 reviewer-as-skills 范式、评测指标去伪求实、排期实事求是**。

## 0. 政策核实修正(设计的事实地基,信源均为官方原文)

初版把「2026 三段式」当产品假设,本轮已核实为真并带来必须改设计的修正:

1. **三段式仅面上+青C**(立项依据/研究内容/研究基础,正文原则上≤30页;基金委 2025-12-30 官网通知 nsfc.gov.cn/p1/3381/2821/99242.html)。重点/杰青/优青/地区仍旧版八股 → 骨架引擎必须**双模板路由**。
2. **科学问题属性是两类不是四类**(自由探索类/目标导向类,2024 起简化,2026 指南·申请规定 PDF 原文)→ 初版「四选一向导」作废,改**两类属性选择器**,函评评审要点按属性分叉。
3. **AI 条款 2026 首次成文**(「不得使用由生成式人工智能直接生成的申请书,不得使用未经核实的生成内容」,须声明+按《AI 生成合成内容标识办法》标识)→「不代写正文」从产品定位升格为**引擎级代码约束**(§8)。
4. 形审官方 7 大高频原因(期限/代码/资格/限项/缺项/证明材料/指南范畴)与《条例》四种不予受理情形 → FormCheck 规则集覆盖清单真源。**但注意:7 大原因并非全部 docx 可机检,规则集必须分档**(§2.4,吸收评审意见)。

## 1. 总架构

```
用户 ⇄ claw 第三张模板卡(GrantModeWorkspace)
        ⇄ agentbridge(nsfc_grant feature,多会话)
            ⇄ agent 容器
                ├─ skills: agent-skills/nsfc-grant-add/(何时调引擎、怎么解释)
                ├─ 确定性引擎 /opt/nsfc-kit(python3 -m nsfc_kit,jail 内 Bash 跑)★核心资产
                ├─ executor 工具 VerifyClaims(直连 minicod REST + ed25519 签名,私钥仅在 executor 进程侧)★
                └─ minicod MCP(白名单子集,检索发现)
        ⇄ backend internal/nsfcgrant(thin wrapper + 项目快照回填)+ mock-review server-side 双会话(P2)
产物:cwd/project.json(工作真源,MinIO 快照兜底)+ ./out/*.docx|svg|md → MinIO → 前端预览
```

## 2. 确定性引擎 nsfc-kit(方案核心资产)

**定位**:与 boltslides deck 引擎/scidraw compose.ts 同级。纯 Python(3.13,只依赖已烧入的 python-docx/openpyxl + pandoc 子进程),**构建期 COPY 进镜像 `/opt/nsfc-kit` + PYTHONPATH**(沿用 pandoc vendor 先例;自研代码无 license 问题),jail 内断网可跑。调用方式:`python3 -m nsfc_kit <subcmd> --project .`,所有子命令输出**机器可读 JSON 到 stdout + 产物落 ./out/**,失败输出结构化 error 供 LLM 修参重试。**一切数字(核实率、字数配额、违规计数、评分聚合、上会区间)只出自引擎,LLM 只做理解/编排/解释。**

五个模块(总计约 2600 行 Python,Dockerfile 增量仅一条 COPY):

### 2.1 `project`(~250 行)— 状态机 CLI
`init / status / advance / rollback / snapshot`。project.json 的 schema 校验入口 + 写前快照到 `.nsfc/history/<ts>.json`。**诚实定位(修订)**:模型在 jail 内持有 Write/Edit/Bash,cwd 是唯一可写目录,引擎无法物理阻止模型直改 project.json——因此 advance/快照/history 定位为**审计快照与误操作恢复兜底,不做安全承诺**;真正的防伪只落在 claims 的签名机制上(§2.2/§3),skill 铁律 + eval 负责把「绕过引擎直改」列为失败项。

### 2.2 `claims`(~500 行)— 主张↔引用台账引擎
台账真源 `claims.json`,schema 草案:

```json
{ "version": 1, "updated_at": "...",
  "claims": [{
    "id": "C001", "section": "立项依据", "text": "用户提供的主张原文",
    "citations": [{
      "cite_key": "wang2024", "doi": "10.x/..", "title": "", "authors": [], "year": 2024,
      "venue": "", "source": "graph",          // 对外只允许 graph|discovery|medicine
      "status": "pending|verified|mismatch|not_found",
      "evidence_snippet": "上游返回的摘要/段落片段",
      "verified_by": "VerifyClaims/v1@2026-07-24T10:00:00", "match_score": 0.93,
      "sig": "ed25519(cite_key|doi|status|snippet 的 base64 签名,executor 私钥签发)" }],
    "claim_status": "pending|supported|partial|unsupported"   // 引擎按验签通过的 citations 推导
  }],
  "stats": { "total": 8, "supported": 5, "unsupported": 1, "pending": 2 }  // 引擎计算,只计验签条目
}
```

**防篡改机制(修订,替换初版的假承诺)**:初版称「status 只能由 VerifyClaims 写入」——这在 jail 语境下只是约定不是机制,模型完全可以 Edit 把 status 改成 verified、伪造 snippet。修订为**非对称签名闸**:
- VerifyClaims 在 **executor 进程侧**(bwrap jail 拿不到 executor env)持 ed25519 私钥,对每条核验结果的 `(cite_key + doi + status + evidence_snippet)` 规范化串签名写入 `citations[].sig`;
- **公钥烧进 `/opt/nsfc-kit`**(镜像只读层,jail 内不可改);`claims stats` / `claims render` 对每条 verified/mismatch/not_found **一律验签**,验不过按 pending 计,且报告 docx 中显式标「⚠️ 签名无效(疑似手工篡改)」;
- eval 增加篡改用例:模型(脚本模拟)手改 status→verified 后,render 必须降级并出警示(§9)。
至此「引擎裁决、LLM 不可越权」从约定变成密码学机制:模型能改 claims.json,但**改不出合法签名**。

子命令:`claims validate`(schema+枚举守卫)、`claims stats`、`claims render`(pandoc + reference-doc + **GB/T 7714-2015 numeric CSL** citeproc,✅/⚠️/❌ 逐条表格)。模型的合法操作只有新增 pending 条目;核验数字全部出自验签后聚合。

### 2.3 `skeleton`(~450 行)— 双模板骨架装配器
- 模板路由:`outline_2026_free`(面上/青C 三段式)/ `outline_classic`(其余类型八股),模板结构与写作要点为**外置 YAML 数据文件**(skill 目录,年更热换)。
- **篇幅预算器(修订:字数为主、页数降级)**:初版承诺「页数误差 ±1 页」方法学不成立——pandoc→weasyprint 的分页引擎与 Word/WPS 官方模板排版是两套字体度量/行距系统,30 页文档偏差可达数页。修订为:**主指标 = 每节字数/字符配额**(数据文件按类型给定;python-docx 直接统计,纯确定性、与渲染引擎无关),`skeleton budget --docx 草稿.docx` 输出各节超/欠配额 JSON;**页数仅作次级估算提示,显式标「估算,±10%」**,估算系数按「字符数→页」的实排标定曲线换算(标定数据来自 Word/WPS 实排 PDF,见 §9)。
- `skeleton render`:装配骨架 docx = 标题层级 + 每节「要素 checklist + 字数配额 + 灰字占位『请作者撰写』」+ 两类属性论证策略提示 + AI 使用声明合规段模板。**代码路径中不存在生成正文长文的函数**(§8)。

### 2.4 `formcheck`(~700 行)— 形式审查确定性 checker
- 规则源:`formcheck-rules-2026.yaml`(外置 skill 目录,据高校《形式审查明细表》+官方 7 大原因+《条例》四情形自行改写,年更)。
- **规则集显式分三档(修订)**——初版「7 大原因全类目 100% 检出」不可达,资格/限项/指南范畴根本不是 docx 可机检事实(资格靠人事聘任关系、限项靠基金委系统全局数据、范畴是语义判断),硬写进 golden 只会逼出伪实现:
  - **A 档·机检确定项**:研究期限日期(2027-01-01 起)、申请代码位数、章节/要素缺项(查要素不查标题,适配三段式;同样覆盖旧八股降级要素:研究目标/关键科学问题/可行性/创新点/年度计划)、AI 声明存在性、附件清单勾选 → golden 要求 **100% 检出/零误报**;
  - **B 档·排版估算项**:页数/字体字号(docx 样式继承链解析有不确定性)→ 只出 **warning** 并声明允差;
  - **C 档·人工自查项**:申请资格/限项/指南范畴 → 产出**结构化自查问卷 checklist**(逐项给官方依据条款、判断口径、去哪查),**不进检出率指标**。
- 输出 `formcheck report`:violations JSON(rule_id/tier/severity/位置/官方依据条款)+ 自查报告 docx(A 档结论 + B 档提示 + C 档问卷三段式呈现)。

### 2.5 `review`(~400 行,P2)— 函评聚合器
接收 N 份有界 JSON 函评意见(LLM 产,§6):`review aggregate` 按**可配置评分模型 scoring.yaml**(社区经验换算 A/B/C/D + 资助意见权重,「版本不一,不写死」)做档位聚合、≤35% 比例约束模拟、上会概率**区间**计算,渲染函评报告 docx(强制免责水印);`review verify-evidence`:对每条意见的 quote 在**原文 PDF 页索引**上做 fuzzy 锚定(输入契约见 §6),锚不上的标「未锚定」并触发有界重试——页码/引文证据的真伪由引擎裁决,不信 LLM。

## 3. 工具契约

**新 executor 自定义工具 `VerifyClaims`**(仿 BuildDeck/FetchCorpus 范式,agent/src/tools/registry.ts,~250 行 TS):
- **输入(修订,补分批协议)**:`{ ids?: string[], limit?: number }`,**limit 默认且上限 10 条/次**;返回 `{ processed, remaining, stats }`——60s 超时下几十条 pending × 每条 REST 精查+重试一次跑不完,agent 依 remaining 循环调用直至清零。自守卫:仅当 cwd 存在 project.json 且 feature 脚手架标记存在才可用;日志尾部回喂。
- 行为:读 claims.json 中 pending 条目 → **直连 minicod REST**(api-1.json 真源:match/DOI 精查,executor 进程侧、不进 jail、不过模型上下文)→ 写回真实元数据+snippet+match_score+status+**ed25519 签名**(§2.2)。**匹配算法与阈值写死在 executor 一处(修订)**:标题 NFKC 归一化+去标点小写化后 token-set ratio,叠加第一作者姓氏匹配与年份 ±1 容差,加权得 match_score;`≥0.90 → verified`、`0.60~0.90 → mismatch(存疑)`、`<0.60 或无命中 → not_found`;算法版本号写入 `verified_by`(如 `VerifyClaims/v1@ts`),阈值变更必须升版本并重跑 claims golden——杜绝「阈值漂移后 golden 变玄学」。
- 接线:`agentbridge/ws.go permissionAllowed` 加 case(初版说「无需加 case」,本轮因新增工具而**推翻**);`AGENT_EXECUTOR_FEATURES` 加 key;签名私钥经 executor env 注入(不落盘、不进 jail)。
- 教训规避:仿 BuildDeck「重连后凭 cwd 标记判定而非 CreateSession 一次性铺设」。

**jail 内 Bash**:全部 nsfc_kit 子命令 + pandoc/weasyprint。**MCP 白名单 AllowedMcpTools**(backend 单一真源,skill frontmatter 不生效):`search_papers, get_paper_by_doi, match_paper, get_paper_references, get_paper_citations, group_works, get_related_works, recommend_from_pool`——用于**发现与选题**;逐条核验一律走 VerifyClaims。对外文案只称 Graph/Discovery/Medicine。

## 4. 状态机与项目持久化

project.json schema 沿初版(meta: program_type/discipline_code/attribute/template + stages: intake/claims/skeleton/roadmap/formcheck/mock_review + history_ptr),不再重复。

**持久化架构(修订,正面解决 workdir GC 冲突)**:实测 `agent/src/server/sessions.ts:314` 有 `EXECUTOR_WORKDIR_TTL_DAYS=30` 磁盘 GC 会删整个会话 workdir,而标书是天然跨月项目(9 月起草→12 月预评审→次年 3 月提交),「cwd = 唯一真源」在闲置 30 天后必然蒸发,对基金场景是灾难级数据丢失。修订为**「cwd 工作真源 + MinIO 快照兜底 + 重连回填」**(方案①,工程量最小且完全踩在 BuildDeck 标记自愈 + agentartifact 收割两条已验证路径上):
- **快照时机**:每次 `project advance/rollback` 与每次 claims.json 变更(VerifyClaims 写回后、claims render 后),把 `project.json + claims.json`(含签名,快照本身无需再防伪)随 ./out 收割进 MinIO(agentartifact 通道,backend `internal/nsfcgrant` 存 latest 指针);
- **回填协议**:会话重开时 skill 第一步 `project status`;若检测到「feature 侧车标记存在但 project.json 缺失」(= workdir 被 GC 后重建),agent 调用 backend 提供的恢复端点拉最新快照写回 cwd,再继续——即 BuildDeck 的「标记自愈工具可用性」升级为「标记自愈 + 数据回填」;
- 不选方案②(真源上移 backend DB,prism owner_kind=project 模式)的理由:引擎所有子命令以 cwd 文件为输入输出,真源上移意味着每次调用都要 backend↔agent 双向同步,打破「jail 内断网纯本地」的引擎设计;快照兜底以 ~100 行 Go + ~30 行 skill 铁律达成同等数据安全。若未来出现多端并发编辑需求再升级为 ②。
- **会话重开恢复**:skill 铁律第一步 = `nsfc_kit project status`(多会话经 0081 迁移解锁,anchor 排除集照 0077 手法);**可重入**:所有子命令幂等(claims 按 id upsert、skeleton/formcheck 纯函数式重渲染);**改主意回滚**:`project rollback --field meta.template` 自动快照、级联把受影响 stage 打回 todo 并列出失效产物清单。

## 5. skills 分层(agent-skills/nsfc-grant-add/.claude/skills/)

skill 只教「何时调引擎、怎么解释结果、怎么与用户对话」,不教怎么算:
- `grant-workbench/SKILL.md`(总编排/守门):开场 AskUserQuestion 问诊(类型→学科口子→属性两选一→当前阶段),铁律=先 project status(含快照回填分支)、数字只引用引擎 stdout、评审保密拦截(「我是评审专家/别人的本子」→拒绝并引行为规范第 11/12 条)、对外数据源别名铁律。
- `lit-workbench/SKILL.md`(手艺):主张拆解→MCP 发现→写 pending 条目→调 VerifyClaims→解读 stats→render。**分批铁律(修订)**:单轮最多 24 工具轮,「拆解→逐条检索→写台账→核验」连跑极易顶限——每轮处理 **≤3 条主张**的完整闭环,VerifyClaims 按 remaining 分批,多主张任务显式分轮推进并汇报进度。接 library-reference(references/ 物化文献)。
- `skeleton-formcheck/SKILL.md`:双模板问诊→skeleton render→budget 解读(字数为主、页数标「估算」);上传稿→formcheck report 分档解读(A 档结论/B 档提示/C 档问卷,不吓唬)。
- `roadmap/SKILL.md`:mermaid 会话内迭代→定稿 SVG 落盘;**3 个正面母版**(flowchart TB 四层:科学问题→研究内容→方法手段→预期成果)+ gantt 母版存本目录(ASCII 复发教训:只给正面模板)。挂 sci-draw-skills 复用画风,继承 IP/证据图红线。
- `resources/`:outline YAML×2、formcheck-rules-2026.yaml、scoring.yaml、gb-t-7714-2015-numeric.csl、reference-nsfc.docx、字数→页标定曲线数据、官方条款摘录 md(带年度版本号,**年更约定:每年 1 月指南发布后 72h 内 diff 更新**)。

## 6. 模拟函评(P2)

**架构对齐现行范式(修订,放弃初版的死架构)**:初版称迁移「PersonaRandomPicker + feature_prompts」——实测 `peerreview/service.go:111` 明注该机制已整体废弃,现行范式是 agent-skills 下 reviewer-roster + rv-* 技能目录。修订为:
- **persona 落 skill**:`agent-skills/nsfc-reviewer-skills/` 新目录 = `nsfc-reviewer-roster`(编排:读摘要→按学科/属性选 3-5 位)+ 5 个 persona skill(领域战略家/方法学严苛者/可行性怀疑者/研究基础审视者/交叉学科视角),完全仿 reviewer-skills 现行结构;
- **仍复用的两块**(确实还在):server-side 双会话编排(会话A digest 抽结构化摘要+分节页码索引 → 会话B×N 独立 persona 出有界 JSON)+ 有界 JSON 重试;配额在 Submit 内手放(peerreview 同法)。
- **输入契约(修订)**:mock-review 输入**统一为 PDF**(复用 pdfparse 页索引做 evidence 页锚定;docx 上传先经 pandoc 转 PDF 再锚定)——docx 无页概念,初版按 page 锚定而不定义基准是漏洞。
- 意见 JSON 结构沿初版(persona/attribute_track/四维 comments 带 evidence page+quote/overall A-D/funding/suggestions),结构对齐核实到的真实函评意见表;评审要点按属性路由(自由探索重原创性/科学价值,目标导向重需求匹配/应用前景);prompt 遵循 ReviewerGPT 结论做**逐维 checklist 问答**;rubric+ensemble+聚合设计借鉴 AI-Scientist(仅设计,零代码,其 license 禁止引入)。
- 聚合与数字全交 `nsfc_kit review`(§2.5):verify-evidence 锚定→aggregate 出档位分布+上会区间+免责。

## 7. 开源采用/借鉴清单

**采用(进仓/进 skill,license 已核)**:① Ruzim/NSFC-application-template-latex(MIT,已实证存在)→2026 提纲结构文本+样式参数摘编进 resources/,并作自制 reference-nsfc.docx 的样式依据,附 MIT 声明;② huangwb8/ChineseResearchLaTeX(MIT)→青C/地区结构补全+「Vibe Writing」合规叙事引用;③ CSL 官方仓 gb-t-7714-2015-numeric.csl(CC BY-SA 3.0,保留文件头声明,不从 zotero-chinese 整仓拷);④ 官方公文资产(2026 指南 PDF/改版通知/形审明细表/两类属性/评审专家行为规范)→结构化自写进 resources/ 与 formcheck-rules YAML。
**只借设计,零内容引入**:njzjz/nsfc-agent-skills(无 license;技能切分校准)、LXLTX(无 license;评审量化维度对标)、AI-Scientist perform_review(限制性 license;ensemble+AC 架构)、openreviewer(输出契约文体)、arXiv 2603.08281 扰动评测方法、TikZ 模板群(路线图版式)、CUHK 手册(内部资料,规则用自己的话重写)。

## 8. 合规硬线的工程化

「不代写正文」不靠 prompt 自觉,落成三层:① **引擎约束**:nsfc-kit 全部渲染路径只装配骨架/清单/台账/报告,skeleton 正文槽位硬编码为灰字占位符,**代码库中不存在「生成正文长文」的函数**——审计时可 grep 自证;② **产物形态约束**:./out 白名单为骨架 docx/核查报告 docx/自查报告 docx/路线图 svg/清单 md,LLM 直接 Write 长文 docx 在 skill 铁律+产品验收 eval 中列为失败项;③ **产品叙事**:模板卡与 hero 文案定位「结构辅导·引用核验·评审预演——人写,AI 审」,内置 AI 使用声明生成器(按用户实际使用范围出合规声明,依据指南条款+《标识办法》),正文写作需求导流 prism。营销绝不出现「一键生成申请书」「函评平替」。

## 9. 质量评测(上线门槛)

评测资产放 `agent/evals/nsfc-grant/`(fixtures/ + run_eval.py + golden/),CI 可跑(docker exec 进 agent 容器 **jail 内**执行,保证与生产同环境):
- **formcheck golden(分档,修订)**:20 份构造 docx(每份埋 1-3 个已知违规,覆盖 **A 档全类目**)→ A 档检出率 100%、白名单干净稿零误报;B 档只断言「出 warning 且带允差声明」;C 档断言问卷完整产出——不再对不可机检项承诺检出率。
- **claims golden**:30 条主张 fixture(含 10 条伪 DOI/错标题/错年份)→ VerifyClaims 判 not_found/mismatch 召回 100%(算法+阈值锁死在 executor v1,升版必重跑);**新增篡改用例(修订)**:脚本手改 status→verified 后,claims stats/render 必须验签失败降级为 pending 并出「签名无效」标注;claims stats 数字与人工核对全等。
- **skeleton/budget(修订)**:双模板快照测试(渲染结果 diff 锁定);字数配额统计与人工计数全等(主指标,确定性);页数估算对 **3 份 Word/WPS 实排 PDF**(非本管线生成,杜绝循环自证)标定,允差按实测标定后写死并在报告中如实声明(目标 ±10%)。
- **mock_review 扰动集(P2,修订)**:**3-4 份合成标书**(MIT 模板骨架+内部生成内容,文首标注「仅测试用途」;真实申请书涉密不可入仓;合成工时 **3 天显式列入 P2 排期**)×3 类受控扰动(删可行性细节/弱化创新点/假说不清),按自建函评 taxonomy 打标,persona ensemble 对埋入缺陷命中率 ≥80%,evidence 锚定率 ≥95%(PDF 页索引基准);聚合器数学(比例约束/区间)纯单测。
- **线上监控**:抽样审计 claims 台账 verified 占比与验签失败率、函评 evidence 锚定率、`agent_usage` token 分布、formcheck 误报工单率。
- **别名铁律双保险**:claims.json source 枚举只收 graph|discovery|medicine(schema 级)+ eval 断言全部产物无 Semantic Scholar/OpenAlex/PubMed 违禁词。

## 10. 交互走查·交付物·成本

流程:模板卡进入→AskUserQuestion 问诊(类型/口子/属性/阶段)→project init→按阶段走 skill→每阶段产物落 ./out(骨架 docx、claims 核查报告 docx、路线图 svg、形审自查 docx、函评报告 docx)+ project/claims 快照→MinIO→前端 DocxPreview/svg 内联/md 渲染;多会话续作靠 project status + 快照回填。**成本**:VerifyClaims 使核验不过上下文,lit-workbench 从初版预估 80-200 万 token 降至 **30-80 万**;骨架/形审 15-30 万;函评双会话 15-30 万。接 StandardHooks→vip 有界透支,绑 `chat_default.nsfc_grant`(+.free),单轮预算略高于 claw。

## 11. 风险登记簿

| 类 | 风险 | 对策 |
|---|---|---|
| 数据 | workdir 30 天 GC 蒸发跨月项目(灾难级) | §4 快照兜底+重连回填;恢复端点做 P0a 验收项 |
| 完整性 | 模型 jail 内直改 claims 伪造核实 | §2.2 ed25519 签名闸+验签降级+篡改 eval 用例 |
| 技术 | python-docx 对高校模板 docx 解析兼容性(域代码/嵌套表) | fixture 覆盖真实高校模板;解析失败降级「仅可机检项」+明示未检项 |
| 技术 | 页数估算与官方排版偏差 | 字数配额为主指标;页数标「估算±10%」且用实排 PDF 标定 |
| 技术 | 老会话重连后 VerifyClaims 失效(BuildDeck 踩过) | cwd 标记探测而非 CreateSession 铺设 |
| 技术 | 台账大批量 pending 顶 60s 超时/24 工具轮 | VerifyClaims limit≤10+remaining 分批;skill 每轮≤3 主张铁律 |
| 合规 | 「AI 直接生成申请书」违规 | §8 三层约束;eval 把长文产物列为失败 |
| 合规 | 评审专家上传他人本子 | grant-workbench 守门拦截+引行为规范 11/12 条 |
| 合规 | 数据源真名泄漏 | schema 枚举+skill 铁律+eval 违禁词断言 |
| 质量 | 函评幻觉页码/引文 | PDF 页索引统一输入+verify-evidence 引擎锚定+有界重试 |
| 运维 | 年度改版(模板/规则/日期) | 全部外置 resources/ 数据文件+年度版本号+「1 月指南 72h 内更新」约定 |

## 12. 里程碑(修订:P0 拆两段,合计 8-10 天,不虚报)

初版 P0=5 天不自洽:~2200 行引擎 + formcheck 规则集(政策研究活,须消化官方 7 大原因+《条例》四情形+高校形审明细表)+ 20 份 fixtures + VerifyClaims + backend 三件套 + 迁移 + 前端克隆 + golden 全绿,对照 boltslides/scidraw 实际落地节奏做不完。修订为:

- **P0a(4-5 天)· 台账核验闭环**:nsfc-kit project+claims 模块 + VerifyClaims(registry.ts+签名+ws.go permissionAllowed case+分批协议)+ backend `internal/nsfcgrant/{spec,handler,artifact}.go` 含快照/恢复端点 + 迁移 `0081_agent_sessions_nsfcgrant_multi.sql`/`0082_modelcatalog_nsfcgrant.sql`(与库内最新 0080 衔接)+ grant-workbench/lit-workbench skill + 前端骨架(TemplateCards 第三卡/GrantModeWorkspace/useNsfcGrantConversation 克隆/feature-meta)。**验收**:claims golden(含篡改用例)全绿;5 条主张含伪 DOI 全被判出并出报告 docx;跨会话 project status 续作 + 模拟 GC 后快照回填成功;配额扣减+VIPCheckerWired 断言过。
- **P0b(4-5 天)· 骨架与形审**:skeleton+formcheck 模块 + formcheck-rules-2026.yaml 政策消化 + 20 份构造 docx fixtures + skeleton-formcheck skill + resources 全套。**验收**:formcheck A 档 golden 100%/零误报、B/C 档形态断言;双模板骨架 docx+字数配额;9 月上线窗口(P0a+P0b 8-10 天,7 月底启动仍充裕)。
- **P1(+3 天)**:roadmap 母版套件+SVG 落盘、AI 使用声明生成器、budget 标定曲线精化、reference-doc 样式打磨。**验收**:口述模块→mermaid→定稿 svg 进材料包;声明文本含指南条款依据。
- **P2(2026-11 前,赶 12 月预评审季)**:review 模块 + nsfc-reviewer-skills(roster+5 persona,现行 reviewer-as-skills 范式)+ server-side 双会话编排复用 + **合成标书 3-4 份(3 天工时显式列入)**+ 扰动评测集 + 8 月底放榜后「败因复盘/复审辅助」轻入口。**验收**:扰动缺陷命中 ≥80%、evidence 锚定 ≥95%(PDF 基准)、报告含免责水印与上会区间。
