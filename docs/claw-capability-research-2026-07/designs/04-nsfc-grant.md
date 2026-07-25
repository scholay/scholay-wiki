# 国自然基金标书工作台 — 落地设计

> verdict: go

## 核实结论
## 一、重叠度核查(实读代码,无阻断性重复)

**全库 grep「基金/标书/国自然/NSFC/grant」,现有覆盖仅 3 处,均不构成重复:**

1. **prism 人格 pw-doc-grant**(/Users/youngp/mypro/fuck_副本/scholar/agent-skills/prism-personas/pw-doc-grant/SKILL.md):是「基金申请书正文写作人格」,但骨架是 Specific Aims/Significance/Innovation/Approach/Broader Impacts —— **纯 NIH/NSF 国际范式**,完全不含国自然三段式(立项依据/研究内容/研究基础)结构。scope 里「正文写作导流 prism pw-doc-grant」的落点真实存在,边界成立;但注意它接不住国自然中文正文范式(可作为后续 prism 侧衔接项,不在本 scope)。
2. **claw 轻 guide topic-selection**(agent-skills/claw-add/guides/topic-selection/SKILL.md):已完整覆盖「minicod 引文网络找 gap」工作流(search_papers→get_paper_references/citations→group_works→新颖性证伪),即 scope ① 的核心已存在。①的增量只是把产出重塑成标书「科学问题属性」框架 —— 属编排升级,不是新能力,立项宣传时别当新亮点。
3. **claw 轻 guide citation-audit**(guides/citation-audit/SKILL.md):已覆盖 scope ② 的「核查」半边(DOI/match_paper/search_papers 逐条查证 + ✅/⚠️/❌ 报告)。②的真正增量是「工作台」编排:逐条主张↔真实引用绑定 + 接个人文献集(claw 已有 library-reference skill 把文献集物化到 references/,可直接复用)+ docx 交付。

**scope ④(2026 三段式骨架+形审清单+AI声明)在全库零覆盖,是真空白;⑤(模拟函评)内容零覆盖但架构现成**:peerreview 的 PersonaRandomPicker + feature_prompts 表(按 feature_key/persona 区分)+ server-side 双会话 + 有界 JSON 解析(backend/internal/peerreview/spec.go、service.go)是通用设施,换一套「基金函评 persona」(科学问题属性/创新性/可行性/研究基础四维)即可迁移;现有 33 个 reviewer-skills 全是论文域,需新写内容但不需新架构。

**重模式集成范式已模板化**:scidraw 就是照 boltslides 抄的 thin wrapper(backend/internal/scidraw/spec.go 约 150 行:FeatureKey + StaticPicker + StandardHooks 配额 + AddDirs 挂 skill 目录 + AllowedMcpTools 白名单),前端在 TemplateCards.tsx 加第三张模板卡即可(frontend-user/src/features/claw/components/chat/TemplateCards.tsx,现有 制作PPT/科研绘图 两张)。新增重模式成本低、路径完全踩熟。

## 二、容器可行性(现有依赖全够,MVP 零新增包)

- **Word 材料包**:agent 已有 ExportDocument 工具(agent/src/tools/registry.ts:624 起,固定 argv pandoc,target docx/pptx/html/pdf),镜像装了上游 pandoc 3.10.1(agent/Dockerfile:70-76);前端 claw 已有 DocxPreview.tsx(frontend-user/src/features/claw/components/preview/),docx 产物可直接预览。PDF 走 weasyprint(Dockerfile:59-61,配 EXECUTOR_PDF_ENGINE,memory 记录生产已全绿)。国自然模板样式可用 pandoc --reference-doc 把模板 docx 放进 skill add-dir,零镜像改动。
- **技术路线图**:scidraw L2 车道 = agent 直接 Write .svg 落 ./out/,无任何特殊依赖;claw 聊天界面原生渲染 Mermaid/SVG(agent-skills/claw-add/CLAUDE.md 渲染约定)。可双轨:会话内 mermaid 快速迭代 + SVG 落盘进材料包。sci-draw-skills 可经 AddDirs([]string,支持多目录)直接挂载复用,不必复制。
- **沙箱不挡**:bwrap jail(agent/src/sandbox/bwrap.ts)只约束 Bash 子进程(--unshare-all + 唯一可写=cwd);minicod MCP 调用发生在 agent 进程内、不进 jail,断网 jail 不影响文献检索。/etc/fonts 已 bind,docx/PDF 中文不豆腐块。
- **交互式收集信息**:AskUserQuestion 分步面板已在 scidraw 放开(spec.go 注释),工作台「先问学科/口子/申请类型」的 wizard 体验有现成 UI。
- **已知地雷(实现时必躲)**:migration 0034 的 user_feature_anchor 生成列按 feature_key 排除表决定单/多会话(docker/mysql/migrations/0034_agent_sessions_user_feature_anchor.sql:53 现排除 claw/smart_search/boltslides/sci_draw);新 feature_key 若要多会话必须新迁移把它加进排除集,boltslides/smart-search 两次都踩过。另:新付费 feature 必须接 SetVIPChecker(scidraw 有 VIPCheckerWired 启动断言可仿),忘接=静默免费。

## 三、合规红线(不触碰,但有一条要从「产品定位」升格为「硬约束」)

- **生成式图像禁令**:不触碰。技术路线图是 SVG 矢量示意,与 scidraw 同车道;scidraw spec 已有 IP 铁律 +「(d) 不合成病理/影像等一手证据图」红线可整体继承。
- **医疗 PHI**:暴露面与 peerreview 上传稿件等同,无新增;scidraw 拒 PHI 先例可复用到 prompt。
- **AIGC 检测灰产**:scope 未涉及降 AI 率/绕检测,保持不做即可。
- **关键点**:科技部《负责任研究行为规范指引(2023)》明确申报材料**不得用生成式 AI 直接生成**、AI 生成内容须标注,NSFC 亦持续强调申请材料 AI 使用声明。因此 scope 里「不代写正文」不是可选的产品定位,而是**合规硬线**:必须做成 system prompt 级铁律 + 产出物形态约束(骨架/清单/文献核查报告/路线图,不输出可整段粘贴的立项依据成文正文),与 claw 现有 HonestyGuard/引用铁律同级对待。模拟函评面向申请人自查合规(NSFC 禁的是**评审专家**把他人申请书喂 AI),营销措辞避免「函评平替」表述即可。
- **事实性提醒**:「2026 新版三段式」是产品假设,立项后须对照 2026 年度申报指南核实;骨架/形审清单应放在 skill 文本层(agent-skills 目录,唯一生效源)而非代码层,版式年年变时可热更新。

## 结论

照原 scope 做(go)。原 scope 自己画的边界(①标注为升级、正文归 prism、⑤二期、不做 NIH)与代码现状完全吻合,无需调整能力边界。核心新增价值 = ②工作台编排 + ④国自然结构/形审(真空白)+ ⑤基金函评内容(旧架构新内容);①③是复用,别当新能力宣传。实现按 scidraw 范式走(新 internal/<feature>/ 三件套 + TemplateCards 第三张卡 + agent-skills 新目录),MVP 零新镜像依赖;注意 0034 排除集与 SetVIPChecker 两个已知坑,并把「不代写正文」落成 prompt 铁律。

## 调整后边界
照原 scope

---

## claw 新重能力落地方案:国自然基金标书工作台(feature_key = `nsfc_grant`)

定位:claw 页第三张模板卡(与 制作PPT / 科研绘图 并列),**结构化辅导 + 评审预演 + 材料包交付**。严守边界:不代写正文长文(导流 prism `pw-doc-grant`),不承诺中标率,不碰 NIH 英文核心章节。集成范式逐字仿 `internal/scidraw`(thin wrapper),不引入新架构。

---

### 1. 用户故事与交付物形态

**输入**:用户在会话内描述申请信息(学科口子/申请类型青年或面上/研究主题/已有工作),或上传旧标书 docx、预实验数据 csv/图。
**输出**:① 会话内联渲染(mermaid 技术路线图快速迭代、逐条立项依据的引用核查表 ✅/⚠️/❌);② `./out/` 落盘材料包 → MinIO 产物 → 前端文件卡预览+下载(docx 走 DocxPreview,svg 内联,md 渲染)。

- **场景A 立项依据文献工作台**:用户贴 8 条论述主张 → agent 用 minicod `search_papers`/`get_paper_by_doi`/`match_paper` 逐条绑真实文献 → 复用 `citation-audit` 核查 DOI/标题/年份 → 产出「主张↔引用」映射表 docx(每条标 ✅ 已核实 / ⚠️ 存疑 / ❌ 查无此文),直击「DeepSeek 编文献」痛点。
- **场景B 技术路线图**:用户口述四个研究模块 → 会话内先出 mermaid 快速对齐 → 定稿后 Write 一张出版级 `.svg` 落 `./out/`(复用 sci-draw L2 SVG 车道)进材料包。
- **场景C 2026 新版三段式骨架+形审**:agent 用 `AskUserQuestion` 分步问清学科部/申请类型 → 生成「立项依据/研究内容/研究基础」结构骨架 docx(含科学问题属性四选一提示、AI 使用声明合规段模板)+ 形式审查自检清单 md。

---

### 2. 交互设计

- **入口**:`frontend-user/src/features/claw/components/chat/TemplateCards.tsx` 加第三张模板卡(16:9 封面动画),点卡切 `GrantModeWorkspace`,配 `GRANT_CFG: WorkspaceConfig`(hero 文案「国自然标书工作台」、建议 prompt、`enableAttachments=true` 允许传旧标书/数据、`autoOpenLatestArtifact=true`、`artifactBasePath='/user/nsfc_grant'`、`layoutKey='nsfc_grant'`)。
- **会话流程**:首条消息注入身份 prompt(`InjectPromptOnFirstMsg=true`)→ agent 先用 AskUserQuestion wizard 收集(学科口子/申请类型/研究方向/现有基础)→ 按用户选的子任务(立项依据/路线图/骨架/函评)走对应 skill。
- **产物预览与导出**:docx 用现成 `DocxPreview.tsx`;技术路线图 svg 走 `ClawArtifactPreview` 内联;清单 md 直接渲染。无需新导出按钮(不像 boltslides 的 export-pptx 特殊端点)。

---

### 3. agent 侧

**新 skill 目录 `agent-skills/nsfc-grant-add/.claude/skills/`**(compose 挂 `<dir>/.claude/skills:ro`,env `NSFC_GRANT_SKILL_ADDDIR` 默认 `/nsfc-grant-add`):

- `lit-workbench/SKILL.md`:立项依据文献工作台。工具 Read/Write/Grep + minicod 检索;工作流=主张拆解→逐条 `search_papers`/`get_paper_by_doi`/`match_paper` 绑定→套 `citation-audit` 核查逻辑→产出映射表 docx。铁律:**只用 MCP 返回的真实元数据,禁凭记忆写 DOI/年份**;接 `library-reference`(用户从文献集引用的物化在 `references/`)。
- `roadmap/SKILL.md`:技术路线图。会话内先 mermaid 迭代,定稿 Write `.svg`(继承 sci-draw L2 通用画风,`AddDirs` 可多目录直接挂 `sci-draw-skills` 复用,不复制)。红线:矢量示意,禁生成式图像/合成证据图。
- `skeleton/SKILL.md`:2026 三段式骨架 + 形审清单 + AI 声明模板。内嵌国自然模板 docx 作 `pandoc --reference-doc`(放本 skill add-dir,零镜像改动)。科学问题属性四维提示、AI 使用声明合规段。
- `mock-review/SKILL.md`(P2):模拟函评,迁移 peerreview persona 架构,四维 persona(科学问题属性/创新性/可行性/研究基础)。

**自定义工具**:不需要。全走现有 Read/Write/Edit/Glob/Grep/Bash/ReadDocument/**ExportDocument**(docx via pandoc)/AskUserQuestion + minicod MCP。
**featurePolicy**:无需改(执行器二道墙结构规则通用;工具收敛在 FeatureSpec.DisallowedTools)。
**Dockerfile 新增依赖**:**零新增**。pandoc 3.10.1 出 docx、weasyprint 出 pdf、chromium 渲 mermaid、Noto CJK 字体、matplotlib(路线图如需)全已烧入。国自然模板 docx 随 skill 目录 bind,不进镜像。

---

### 4. backend 侧

**新 feature(非 claw mode),仿 scidraw 三文件** `backend/internal/nsfcgrant/{spec,handler,artifact}.go`:

- `spec.go`:`FeatureKey="nsfc_grant"`、`agentName="scholay-nsfc-grant"`、`Color`、`InjectPromptOnFirstMsg=true`、`PermissionMode=PermissionAuto`、`AllowBash=true`(pandoc/matplotlib/mermaid 落盘)。`DisallowedTools` 禁 `WebFetch/WebSearch/Task/Agent/NotebookEdit/MultiEdit/LS`,**保留** ExportDocument(要出 docx)/AskUserQuestion/ReadDocument。`SessionOptions.AddDirs=[nsfcGrantSkillAddDir(), sciDrawSkillAddDir()]`(路线图复用绘图 skill)。
- **MCP 白名单** `AllowedMcpTools`:复用 claw 的论文/作者/期刊子集(`search_papers`/`get_paper_by_doi`/`get_paper_references`/`get_paper_citations`/`group_works`/`match_paper`/`get_related_works`/`recommend_from_pool` 等),gap 分析与引用核查够用;不放高校/bulk/OpenAlex 实体。
- **配额/审计**:`agentbridge.StandardHooks`(`checkQuota`→`vip.CheckDailyQuotaOverdraft`,超额转 `NewQuotaError`)+ `budgetProvider`(有界透支)+ `recordQuestion`(usagestat `FeatureNsfcGrant`/`message`)+ `VIPCheckerWired()` 启动断言(防静默免费)。
- `handler.go`:纯 gin 翻译层,全委托 `FeatureBridge`(session/messages/context/ws-ticket/ws + 多会话 CRUD + models)。
- `artifact.go`:照 `internal/scidraw/artifact.go` 抄,收割 `./out` → MinIO(`agent_artifacts`,sha256 去重,upsert-only),`/artifact/:id` 校验 OwnerID + **FeatureKey**(越权 404),nosniff+attachment。

**接线** `bootstrap.go`:`nsfcgrant.BuildSpec()`→`agentBridge.For(spec)`→`NewHandler`+`SetUsageRecorder/SetVIPChecker`+ 启动 UpsertSkill push。`routes_user.go` 挂 15 REST + 1 WS(`/user/nsfc_grant/*`)+ `agent-session/resolve` 列入可见 feature。
**权限墙**:无新自定义工具,`agentbridge/ws.go` 的 `permissionAllowed` 无需加 case。

**迁移**(幂等,遵循规范):
- `0081_agent_sessions_nsfcgrant_multi.sql`:照 **0077** 手法,把 `nsfc_grant` 加入 0034 `user_feature_anchor` 生成列排除集(先 drop 唯一索引→守卫式 MODIFY→加回索引),否则单会话锁死撞 1062。
- `0082`(modelcatalog):`chat_default.nsfc_grant`(+`.free`)能力绑定。
- usagestat 加 `FeatureNsfcGrant` 常量;compose `AGENT_EXECUTOR_FEATURES` 加 key;prism `feature_prompts` 无需(prompt 走 Go const)。

---

### 5. frontend 侧

- **api** `api/nsfc-grant-session.ts`:复用 shared `makeAgentSessionApi` 工厂,queryKey 根 `'nsfc_grant'`,BASE `/user/nsfc_grant`,协议类型复用 `./types`(同 agentbridge)。
- **状态机** `hooks/useNsfcGrantConversation.ts`:从 `useSciDrawConversation` 机械克隆(继承已修线上 bug 的 ACK 看门狗/resync 对账/懒新建 pendingSend/停止兜底)。
- **workspace**:`ClawPage.tsx` 加 `GrantModeWorkspace`(自包含,共享 `ConversationWorkspace` 布局),`GRANT_CFG` 配置。`TemplateCards.tsx` 加第三张卡。
- **产物预览**:全复用现成 `ClawArtifactPreview.tsx`(docx→DocxPreview、svg 内联、md 渲染),`artifacts.ts` 按 `basePath` 参数化传 `/user/nsfc_grant`。会话历史并入 `UnifiedSidebar`,图标单一真源 `lib/feature-meta.ts` 加 `nsfc_grant` 徽标。

---

### 6. 风险与坑(实现时必躲)

1. **0034 唯一索引 anchor**:新 `feature_key` 必须新迁移(0081)加进排除集,否则多会话被锁死撞 1062(boltslides/smart-search/scidraw 三次都踩)。
2. **FeatureKey 越权校验**:`/artifact/:id` 必须同时校 OwnerID + FeatureKey,越权/跨 feature 一律 404 防枚举。
3. **SetVIPChecker 忘接=静默免费**:仿 scidraw 加 `VIPCheckerWired()` bootstrap 断言。
4. **改 prompt 须 restart scholar_agent**:system prompt 是 Go const + UpsertSkill,改完重启容器才生效(ASCII 框图复发的教训:否定式规则无效,用正面模板)。
5. **skill 的 allowed-tools frontmatter 不生效**:MCP 工具收敛只认 backend `AllowedMcpTools` 白名单(单一真源),skill frontmatter 里写 WebFetch/WebSearch 在本执行器根本不存在。
6. **bwrap bind**:docx/pdf 中文字体依赖 `/etc/fonts` 已 bind(scidraw 修过 /etc 三 bind),中文不豆腐块;不挂 `/proc` 故 python 别用 ps/`/proc/*`。
7. **合规红线升格硬约束**:AI 使用声明是「辅助合规」不是代写正文;骨架仅结构不填正文长文,越界导流 prism。

---

### 7. MVP 切法

- **P0(2-3 天,最小闭环)**:立项依据文献工作台(`lit-workbench` skill)+ 三段式骨架/形审清单(`skeleton` skill)+ 后端 nsfcgrant 三文件 + 0081/0082 迁移 + 前端第三张卡 + workspace + api/hook 克隆。**验收**:①贴 5 条主张能逐条绑真实文献并标 ✅/⚠️/❌ 出 docx;②AskUserQuestion 收集后出三段式骨架 docx + 形审清单 md;③多会话 CRUD 正常、产物预览+下载正常、配额扣减生效(`docker logs backend | grep agent_usage`)。
- **P1(+2 天)**:技术路线图(`roadmap` skill 复用 sci-draw L2)+ mermaid 会话内迭代→svg 落盘;AI 使用声明合规段模板完善。**验收**:口述模块出 mermaid 内联 + 定稿 svg 进材料包。
- **P2(12-3 月申报季前)**:模拟函评(`mock-review` skill),迁移 peerreview PersonaRandomPicker + 四维 persona + 有界 JSON 解析。**验收**:上传标书草稿出四维函评意见,不承诺中标率。

---

### 8. 成本与配额

- **单次会话 token 量级**:立项依据工作台是重头 —— 多轮 MCP 检索(每工具结果注入上下文)+ 逐条核查,预估单会话 **80万-200万 token**(与 smart_search 深度检索同量级,高于普通 claw 对话);骨架/清单生成较轻(20-40 万);模拟函评走双会话有界 JSON,单次 15-30 万。
- **接 vip 日额度**:走 `agentbridge.StandardHooks` → `vip.Service.CheckDailyQuotaOverdraft`(SS#2 有界透支:跨日上限那轮总能起跑,透支带用完才 `quota_exceeded`)+ `RemainingBudget` 单轮盖章。付费绑定 `chat_default.nsfc_grant`(admin 模型目录可改档),`.free` 档给免费用户小额度。审计经 `OnMessageComplete` 记 token usage 到 slog。**因立项依据检索重,建议 admin 侧把 nsfc_grant 默认绑较高档模型 + 单轮预算略高于 claw**,避免深度核查中途被有界透支截断。
