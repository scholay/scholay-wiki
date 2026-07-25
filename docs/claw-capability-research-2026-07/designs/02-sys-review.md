# 系统综述/Meta分析工作台 — 落地设计

> verdict: adjust

## 核实结论
【核实过程与结论】(全部基于实际读码)

一、重叠度 —— 结论:无实质重复,联动闭环成立,且缺口比预想更明确
1. agent-skills/prism-lenses/wl-lit-synthesis/SKILL.md:是「写综述节」的七步写作协议(纳排→轮检索→试筛→聚类→逐簇成段),精神上有相似工序,但它面向 ~20-60 篇的叙事性综合、产物是 prose+references.bib,不做 PRISMA 合规检索记录、不做规模化去重、无筛选台账、无提取表 xlsx、无 PRISMA 图、无 meta 统计。恰是「prism 管成文」那一半。
2. agent-skills/prism-personas/pw-systematic-review/SKILL.md:系统综述**写作人格**,其骨架明确假设 PRISMA 流程图/完整检索式/森林图/I² 已存在 —— 平台目前没有任何功能产出这些证据物,反证工作台缺口真实。零重叠、强互补。
3. claw 6 个 guides:topic-selection 是找 gap/开题(可作 PICO 前置,合理);citation-audit 是引用真伪核查;methods-stats 只在报告规范里提了一句 PRISMA;data-figures 是通用数据分析出图。均无系统综述工作流。⚠️ 顺带发现既有债:data-figures/methods-stats 声称可用 scipy/statsmodels,但 agent/Dockerfile 只装了 python3-matplotlib/numpy/pandas/openpyxl/rdkit,**scipy/statsmodels 未装**(沙箱运行期断网无法 pip,声称即失效)。
4. backend/internal/smartsearch/spec.go:对话式找论文,白名单已含 search_papers_bulk,但无筛选/台账/交付工作流;internal/library、stagingarea 是存管,claw 已有 library-reference skill 把引用文献物化进 cwd references/(联动现成)。internal/scidraw、boltslides 证明「claw 页内模板卡/mode + 后端独立 agentbridge feature」的重模式范式成熟(scidraw/spec.go 注释自述完全仿 boltslides)。

二、容器可行性 —— MVP 五件套基本全绿,两处需补
1. 依赖:python3+pandas+numpy+openpyxl(去重、写 xlsx 台账/提取表)✓;matplotlib(二期森林/漏斗图)✓;pandoc 3.10.1+python3-docx+weasyprint(二期 docx/pdf)✓。缺:python3-scipy/python3-statsmodels —— 二期 meta 统计(卡方 p 值、Egger 回归)必须 Dockerfile 加 apt 层(~150-250MB,与既有层同策略,难度低;纯 numpy 手写分布函数不可取)。
2. 沙箱:agent/src/sandbox/bwrap.ts —— --unshare-all 断网 + 唯一可写=cwd;但 minicod MCP 调用在 executor 侧、不进沙箱,检索不受影响;Python 去重/统计离线可跑。生产 bwrap 已全绿(W0 已上线)。不挡。
3. 前端预览:frontend-user/src/features/claw/components/preview/artifact-format.ts 支持 spreadsheet(xlsx/csv 走 SheetJS)、svg(DOMPurify 内联)、docx、pdf、markdown —— 台账 xlsx、提取表 xlsx、PRISMA SVG、二期 docx 全部可预览,零前端新造。
4. **最大工程风险(证实且比设想更硬)**:runTools.ts 对 MCP 结果无截断,大批量检索结果全部过模型上下文;叠加 EXECUTOR_MAX_TOOL_ROUNDS=24(turnLoop.ts:29)、MINICOD_MCP_CALL_TIMEOUT_MS=30s(minicodClient.ts:29)、SS#2 单轮有界透支预算 —— 「几百上千条地毯式检索」靠模型逐轮调 search_papers_bulk 会爆 token/轮次。原 scope 的「分批+断点续作」不够,应加一个 executor 级自定义工具(FetchCorpus,仿 registry.ts:710 BuildDeck 范式):executor 侧直连 minicod bulk API(api-1.json /v1/stc/papers/search/bulk,limit≤1000+token 分页;OLX/PMD batch 亦在),结果直接落会话 cwd 的 JSONL,不过模型上下文,模型只拿到「落盘 N 条」摘要再用 Python 处理。这样 30s/24轮约束全绕开。
5. 「扩 claw 白名单」的说法应修正:按 scidraw/boltslides 范式这是**独立 feature key**(如 sys_review),白名单是新 feature 自己的(含 search_papers_bulk/group_works/get_papers_batch/search_snippets 等),claw 本体白名单不动。

三、合规红线 —— 不触碰
PRISMA 图=SVG 流程图、森林/漏斗=matplotlib 确定性统计图,均非生成式图像,与 scidraw 的 IP 铁律和「绝不合成一手证据图」红线兼容;筛选对象是已发表文献元数据,非患者数据,PHI 风险同 data-figures 现状;人机协同(AI 建议+理由、裁决权留用户、全程台账)与平台既有「新颖性断言红线」文化同构;不碰付费墙全文(internal/openaccess 只做 OA);与 AIGC 检测灰产无关。

关键文件:backend/internal/scidraw/spec.go(集成范式模板)、backend/internal/claw/spec.go(白名单/AllowBash 参照)、agent/src/tools/registry.ts(BuildDeck=自定义工具范式)、agent/src/turn/turnLoop.ts、agent/src/mcp/minicodClient.ts、agent/Dockerfile、agent/src/sandbox/bwrap.ts、frontend-user/src/features/claw/components/preview/artifact-format.ts、frontend-user/src/features/claw/api/sci-draw-session.ts(前端接线模板)、agent-skills/prism-lenses/wl-lit-synthesis/SKILL.md、agent-skills/prism-personas/pw-systematic-review/SKILL.md。

## 调整后边界
总体照做,四处调整:
1. 实现形态修正:不是「扩 claw 白名单」,而是按 boltslides/scidraw 成熟范式新建独立 agentbridge feature(如 feature_key=sys_review):internal/sysreview/{spec,handler}.go + agent-skills/sysreview-skills/(检索式构建/筛选台账/PICO 提取/PRISMA 图四技能,PRISMA 图技能可借 sci-draw-skills 的 SVG 手艺)+ 前端复用 shared agent-session 原语与统一 Composer(照抄 sci-draw-session.ts 接线),在 claw 页以模板卡/一级 mode 露出。AllowBash=true,自带 minicod 正向白名单(必含 search_papers_bulk、get_papers_batch、group_works、search_snippets、match_paper、get_paper_by_doi 及 stc/olx/pmd 多源)。
2. MVP 必须含 executor 级 FetchCorpus 自定义工具(仿 BuildDeck):executor 侧直调 minicod bulk 接口、结果直落会话 cwd JSONL、只回摘要给模型 —— 这是大批量检索在 24 轮/30s/token 预算三重约束下唯一稳妥路径;原「分批+断点续作」降为兜底而非主方案。
3. 二期 meta 统计前置条件:agent/Dockerfile 加 python3-scipy + python3-statsmodels apt 层(运行期断网,必须镜像期烧入);此项同时偿还 data-figures/methods-stats guide「声称有 scipy/statsmodels 但镜像未装」的既有债,建议无论二期做否都先补。
4. MVP 五件套不变(检索→去重→筛选台账→PICO 提取表 xlsx→PRISMA 2020 SVG),交付物全部落 ./out/(现有预览器 xlsx/svg/docx 全覆盖);「不做全自动筛选定论/不碰付费墙/成文移交 prism(wl-lit-synthesis+pw-systematic-review 已就位)」三条边界维持原案。

---

# claw 重模式「系统综述/Meta分析工作台」落地设计(feature_key=`sys_review`)

## 1. 用户故事与交付物形态

**典型输入**:一句话研究问题(可先走 topic-selection guide 定 PICO)+ 纳排标准;**典型输出**(全部落 `./out/`,现有预览器零改造全覆盖):
- `search_strategy.md`(多源检索式 + 逐源命中数,markdown 预览)
- `screening_ledger.xlsx`(筛选台账:题录 + AI 建议纳/排 + 理由 + 用户裁决列,SheetJS 预览)
- `extraction_table.xlsx`(PICO/结局提取表)
- `prisma_2020.svg`(PRISMA 2020 流程图,SafeSvg 内联)
- 原始语料 `corpus/*.jsonl` 留 cwd 不进 out(不展示)

**场景例**:① 医生做「SGLT2 抑制剂对心衰射血分数保留患者的疗效」——出检索式→三源(stc/olx/pmd)抓 800 条→去重 623 条→AI 初筛台账→用户在 xlsx 裁决→PRISMA 图;② 研究生开题需系统综述注册(PROSPERO)——产出检索策略 md + PICO 表直接贴注册表;③ 已有综述返修,审稿人要 PRISMA 合规记录——补做检索复现 + 台账 + 流程图。成文阶段引导移交 Prism(wl-lit-synthesis + pw-systematic-review 已就位)。

**三条红线维持**:不做全自动筛选定论(AI 只给建议+理由,裁决权留用户,全程台账);不碰付费墙全文(仅元数据+OA);不合成一手证据图。

## 2. 交互设计

严格照 boltslides/sci_draw 形态:`/claw` 空态模板卡扇形新增「系统综述」卡 → 切入 `SysReviewWorkspace`(自包含 workspace,共享 `ConversationWorkspace` 布局)。会话流程:开工 AskUserQuestion 问清 PICO/纳排/年限来源 → 检索式确认 → FetchCorpus 落盘 → 去重报告 → 分批初筛出台账 → 用户下载 xlsx 裁决(P1 支持回传)→ PRISMA 图。产物走右侧文件卡 + 预览面板(`autoOpenLatestArtifact=true`);多会话,历史入 `UnifiedSidebar` 带 feature 徽标;`/claw/:sessionId` 深链经 resolve 端点反查。

## 3. agent 侧

**skills**:新建 `agent-skills/sysreview-skills/`(compose 挂到 `/sys-review-add/.claude/skills`,spec `AddDirs=["/sys-review-add"]`,env `SYS_REVIEW_SKILL_ADDDIR` 可覆盖):
- `search-strategy/SKILL.md`:PICO→布尔检索式,三源方言差异,先 `search_papers` 小样本验证查准查全再上 FetchCorpus;
- `screening-ledger/SKILL.md`:pandas 读 corpus JSONL → DOI/标题模糊去重(Bash+python,离线可跑)→ 分批(每轮 ≤80 条题录)初筛,openpyxl 写台账(建议/理由/置信度/待裁决列,颜色标注);铁律:只建议不定论;
- `pico-extraction/SKILL.md`:对纳入集提取 PICO/设计/样本量/结局 → xlsx;数字必须来自摘要原文,`search_snippets` 佐证,不确定填 `NR`;
- `prisma-diagram/SKILL.md`:PRISMA 2020 SVG 流程图(借 sci-draw charts 的 SVG 手艺:Write 直出矢量,数字必须与台账实数一致,禁编造)。

**新自定义工具 FetchCorpus**(`registry.ts`,仿 BuildDeck L688 范式):executor 进程内直调 minicod bulk REST(`/v1/stc/papers/search/bulk` limit≤1000+token 分页,olx/pmd batch 同理;自建 HTTP 调用、整体 180s 超时,不受 30s MCP 单调限制),结果直落 `cwd/corpus/<name>.jsonl`,**只回「落盘 N 条 + 字段清单 + 3 条样例」摘要给模型**——绕开 24 轮/30s/token 三重约束;`confinePath` 限定落盘路径;自守卫:cwd 无 `.sysreview` 标记文件(seedTemplate 或首轮 Write 建)即拒,防他 feature 误用。**必须**在 `agentbridge/ws.go permissionAllowed` 显式加 `FetchCorpus` case(default-deny,漏加即 DOA)。

**MCP 白名单**(spec 自带 `AllowedMcpTools`,不动 claw 本体):`search_papers`、`search_papers_bulk`、`get_papers_batch`、`group_works`、`search_snippets`、`match_paper`、`get_paper_by_doi` + olx/pmd 对应源的 search/batch/doi 变体。**Dockerfile**:P0 零新增;建议本期顺手加 `python3-scipy python3-statsmodels` apt 小层(~200MB,阿里云镜像,拆层防 OOM)——同时偿还 data-figures/methods-stats「声称有但未装」既有债;二期 meta 统计硬依赖。

## 4. backend 侧

**独立 feature**(非 claw mode):`internal/sysreview/{spec,handler,artifact}.go` + `prompts/sys_review.go`,逐字仿 scidraw:
- spec:`Key="sys_review"`、`AgentName="scholay-sys-review"`、`InjectPromptOnFirstMsg=true`、`PermissionAuto`、`AllowBash=true`(pandas 去重/openpyxl 写表)、`DisallowedTools` 禁 MultiEdit/NotebookEdit/LS/ExportDocument/WebFetch/WebSearch/Task/Agent(保留 AskUserQuestion/ReadDocument);配额三件套 `StandardHooks` + `CheckDailyQuotaOverdraft` + `BudgetProvider` + `VIPCheckerWired()` 启动断言;
- handler:全委托 FeatureBridge,无业务端点(导出即产物下载,无需类 ExportPptx);
- artifact:照抄收割 `./out` → MinIO,越权/跨 FeatureKey 一律 404,`shouldListArtifact` 排除 `corpus/`(本就非顶层,天然不收割);
- 接线:bootstrap `agentBridge.For(spec)` + Set 注入 + UpsertSkill push;routes_user 挂 15 REST + 1 WS(`/user/sys_review/*`);resolve 端点 feature 列表加 `sys_review`;compose `AGENT_EXECUTOR_FEATURES` 加 key。

**迁移**(幂等规范):`0081_agent_sessions_sysreview_multi.sql` 照 0077 三步手法(摘 `uk_user_feature_single` → 守卫式 MODIFY 生成列 `NOT IN(...)` 加入 `sys_review`(`LOCATE` 守卫)→ 重建索引),并就地更新 0034 注释;`0082_defaults` 给 modelcatalog 加 `chat_default.sys_review`(+`.free`)绑定 INSERT IGNORE;usagestat 加 `FeatureSysReview` 常量。**无新业务表**——台账真源是 xlsx 产物,刻意不建 DB 表(与「session 数据 agent 自管、backend 黑盒」架构一致)。

## 5. frontend 侧

全部对称克隆:`api/sys-review-session.ts`(`makeAgentSessionApi` 工厂,BASE `/user/sys_review`,queryKey 根 `sys_review`,类型复用 `./types`);`hooks/useSysReviewConversation.ts`(从 useSciDrawConversation 机械克隆,继承 ACK/resync/懒新建全套修复);ClawPage 加 `SYS_REVIEW_CFG: WorkspaceConfig`(`artifactBasePath:'/user/sys_review'`、`enableAttachments:false`(P1 开)、`autoOpenLatestArtifact:true`、hero 文案/建议 prompt);`TemplateCards` 加卡 + `feature-meta.ts` 图标;`artifacts.ts` basePath 第 4 实例。**预览零新建**(xlsx/svg/md 全走现有 artifact-format)。

## 6. 风险与坑

1. **0034 anchor**:漏迁移 0081 → 既有库生成列锁单会话,CreateNewSession 撞 1062;必须照 0077 守卫式 MODIFY。
2. **FetchCorpus 权限墙**:`permissionAllowed` 漏加 case → 工具永远被拒(boltslides 踩过)。
3. **skill 的 `allowed-tools` frontmatter 不生效**:MCP 供给面唯一真源是 spec 的 `AllowedMcpTools` 正向白名单。
4. 改 prompt/skill 须 `docker-compose restart scholar_agent`(prompt 经 UpsertSkill push + WS 注入)。
5. runTools 对 MCP 结果无截断:skill 必须写死「批量取数只准走 FetchCorpus,MCP 单查仅用于验证/补录」,防模型自己拉 bulk 爆上下文。
6. bwrap 断网不影响 FetchCorpus/MCP(均在 executor 侧,不进 jail);Python 去重离线可跑。
7. 1.5G/2 槽内存帽:corpus 上限先钉 2000 条/次(pandas 处理 ~几十 MB,安全);FetchCorpus 参数校验 limit。
8. 台账>数千行时 SheetJS 前端预览卡顿——xlsx 分 sheet(待裁决/已排除),预览默认首 sheet。

## 7. MVP 切法

- **P0(2-3 天)**:上述五件套闭环 + FetchCorpus + 四 skill + 全链接线。验收:新用户从模板卡进入,一句话主题 → 检索式 md → 三源落盘去重 → 台账 xlsx → PICO 表 → PRISMA svg,产物全部可预览可下载;跨 feature 产物访问 404;配额拦截生效;多会话/深链/断线续流与 sci_draw 行为一致。
- **P1(1 周)**:开附件(用户回传裁决后 xlsx / 自有 RIS/CSV 导入,claw 附件方案 B 透传 sessionId);library/暂存区联动(纳入集一键存文献集);移交 Prism 成文的引导卡;分批+断点续作兜底路径打磨。验收:回传台账后 agent 按用户裁决重算 PRISMA 数字。
- **P2(meta 统计)**:scipy/statsmodels 层烧入后,效应量合并(固定/随机效应)、I²/Q 异质性、森林图/漏斗图(matplotlib 确定性出图)、Egger 检验;数字仅来自提取表,禁编造。验收:给定提取表能复现出与 RevMan 一致的合并效应量(误差<0.01)。

## 8. 成本与配额

单次完整会话估算:检索式构建 ~3-5 轮轻量;初筛为大头(600 条题录 ÷80/批 ≈ 8 轮 × 每轮 2-3 万 token 入)≈ 30-50 万 token;提取+PRISMA ~10 万;**合计 50-100 万 token/完整流程**,与 boltslides 重会话同档。FetchCorpus 不过上下文是成本可控的关键。配额直接走既有链路:`StandardHooks` → vip tier-aware 日 token 额度(SS#2 有界透支保证跨阈值轮能起跑),超额前端收 `code=quota_exceeded`;usagestat 记 `sys_review/message`,`docker logs scholar_backend | grep agent_usage` 可审计。免费档天然被日额度限制在「小规模试用」(≤百条语料一轮流程),无需为本 feature 单设配额维度。
