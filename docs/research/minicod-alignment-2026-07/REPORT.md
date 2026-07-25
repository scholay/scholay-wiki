# Minicod 对齐审计报告（api-1.json + mcp-server 0.3.0→0.4.1）

> ## ✅ 实施状态（2026-07-22 已落地 a→f 全量,三端构建全绿）
>
> **Phase A — MCP bump**:`agent/package.json` `^0.3.0`→`^0.4.1`;重生 `bun.lock`(完整锁,原 lock 是残缺的);`Dockerfile` 加 `COPY package.json bun.lock` + `bun install --frozen-lockfile`(修 #14 不可复现)。装 0.4.1 确认 76 工具、entry `dist/index.js` 不变。
>
> **Phase B — 正向 MCP 白名单(#2 核心)**:新增 `CreateSessionOptions.AllowedMcpTools`(去前缀原始工具名)贯通 backend→agent:`agent/client.go` 序列化 + `hub.go` seed 帧 + `ws.go` 注入面 probe/strip(防浏览器自带)+ agent 侧 `types/sessions/http/ws/shadowTurn` 管道 + `featurePolicy.toolPermitted` 单点过滤(**同时管可见性与执行二道墙**,`runTools.ts:46` 已复用)。空=不限制(向后兼容)。四 feature 各配白名单:smart_search 18 / claw 22 / prism 17 / peerreview 13,把 76 收敛到各自子集。**⚠️ 非枚举执行:`allowed-tools` frontmatter 在本执行器【不生效】(clean-room 不解析),真源是 `AllowedMcpTools`。**
>
> **Phase C — 后端 client 对齐**:#4 OLX works get/batch `select`→`fields`(spec 确认共享 PaperGetRequest/BatchRequest 只认 fields);#17 RawPaper 加 `tldr`(字符串→TLDR{text})/`bibtex`(→Paper.BibTeX);#16 doPost 双信封守卫(仅在「code==0 且无 data key」这一本会静默的分支探测 {success,error},零影响成功路径);#3 journal seed 双形状(先 flat 顶层、回退 unified 包装;spec 确认 Journal 扁平、无 unified);#24 JournalSearchOptions 加 min_comment_rating/count/count_mode;#26 config 注释。
>
> **Phase D — prompt + skills**:`smart_search.go`/`claw.go` 静态 prompt 补新工具(claw 补期刊一套);7 个 SKILL.md 补教 search_snippets/match_paper/get_paper_by_doi/batch/bulk/group_works/recommend_* 并同步 `allowed-tools`(逐条核对 ⊆ 白名单、无品牌名泄漏)。
>
> **Phase E — 前端安全网**:`minicod-papers.ts` 加 `toolResultHasPapers`(P0 不识别为论文就回退 `expandable=true` 显示 JSON,不再隐形)+ `isNonPaperEntity` 守卫(作者/高校不再伪装论文卡)+ 接受 `recommended_papers`/`paper_title`/`paper_id`(P2);三渲染器(smart-search/claw/admin)据此切换。**P3 专用卡(期刊/高校/snippet)未做**——安全网已把「隐形」降级为「可见 JSON」,列为后续。
>
> **验证**:agent `bunx tsc --noEmit`(仅 1 处**既有**无关 lint)+ `--frozen-lockfile` 可复现;backend `docker compose build backend` 绿;frontend `tsc -b` + `vite build` 绿。
>
> **未做/需后续**:开放问题 #1/#2/#3(journal 扁平信封 / paper 信封 / pmd source)已**用防御式改法(兼容双形状)规避**、无需 live 抓包即安全,但仍建议线上抓包确认默认路径;#25 死结构体(inert 不影响编译)保留;E-P3 专用卡;memory `prod-seoenrich-...`(审计发现三根因当前代码树**已修复**,建议标记已解决)。
>
> ---


> 2026-07-22 · 综合 7 路调查（api-1.json 契约、backend Go 直连 client、backend 其它消费方、agent MCP 集成机制、mcp-server 0.3.0→0.4.1 契约 diff、skills/静态 prompt、frontend 结果渲染）
> 结论一句话：**没有任何"炸掉"的破坏性变更**——三层现存代码依赖的端点/工具/参数在 0.4.1 里全部原样保留；真正的 drift 几乎全是"遗漏"（没接上新能力）+ 若干"接错形状会静默出错"的隐患。核心动作是：**先 bump MCP 到 0.4.1（package.json 一行 + 配套），再补 allow-list / skills / 前端卡片**。

## 1. 结论摘要（TL;DR）

- **升级本体只有一行阻塞**：`agent/package.json:15` 是 `^0.3.0`，caret 语义 `>=0.3.0 <0.4.0` 永远拉不到 0.4.1，`bun.lock:27` 也钉在 0.3.0。0.4.1 是**纯加法的向后兼容 minor**（17→76 个工具，17 个老工具名/参数/路由零改动），bump 后所有老调用形状不动即可继续跑。
- **bump 之后最大的新风险是"工具洪水"**：agent 与 backend 两侧对 `mcp__minicod__*` 都是**前缀放行、无正向白名单**（`toAnthropicTools.ts:12-16` / `featurePolicy.ts:16` / `ws.go:289-292`），76 个工具 schema（≈21KB 描述文本，序列化后约 15–25K tokens）会灌进**每一个** MCP 轮次（smart_search/claw/prism/peerreview 打分），且全部自动批准。smart_search 实际只需 ~6–8 个工具 → 严重浪费 + prompt cache 成本。**必须在 bump 同时给 FeatureSpec 加正向 MCP 白名单**。
- **两处"接错形状会静默失败"值得优先核实/修**：(a) backend 期刊 SEO 种子解析走 `data.unified.*` 包装，而 api-1.json 的 journal detail `data` 是**扁平 Journal**（`unified` 全 spec 0 次）——若线上已扁平，`seo_journals` 会静默停止 seeding（`handler.go:692-711`）；(b) OLX works get/batch 仍发 `select`，而共享 schema 只认 `fields`（`client.go:317-320,444-446`）——轻则字段裁剪失效，重则 400。
- **前端会把新工具结果"渲染错"或"渲染成隐形"**：所有 minicod 工具结果被强制走同一个论文卡解析器且 `expandable={false}` 隐藏原始 JSON。作者/高校因带 `name`+`id` 会**伪装成论文卡**（含错误收藏/暂存动作）；期刊/snippet/28 个 OpenAlex 实体/recommendations 因字段名不匹配**解析成空 → 彻底隐形**（`minicod-papers.ts:56,98,108`）。
- **skills/prompt 全部"无 stale、纯遗漏"**：没有一个失效工具名或参数；但高价值新工具（`search_snippets` 接地、`match_paper` 解引用、`get_papers_batch`/`search_papers_bulk` 批量收割、`recommend_*`/`get_related_works` 近邻、期刊评论/高校家族）无人教。且多个 skill 的 `allowed-tools` frontmatter 是**硬白名单**，即使 bump 也会把新工具挡在门外。**seoenrich 那起线上事故（熔断抖 13103 次 + 硬编码 source-400 + 热循环）三处根因当前代码树已全部修复**，memory 的"待修"是过期状态。

**推荐路径**：`bump MCP` →（同一 PR）`加 FeatureSpec 正向白名单` → `核实两处形状隐患` → `前端加安全网（不识别就回退 expandable=true）+ 作者/高校/期刊卡` → `按序更新 skills/prompt 并放宽各自 allowed-tools`。

## 2. 三层使用全景（usage map）

Minicod API v1.0.0（`https://www.minicod.com`，Bearer `sk-...`，101 条路径全 POST）被三条独立路径消费：

**(A) Backend Go 直连 client（`backend/internal/minicod/`）** — 25 个 `doPost` 方法，解析 `{code,message,data}` 信封（`client.go:198-207`）。依赖 paper `search/get/doi/batch/citations/references/authors/match/autocomplete`（stc→`/v1/stc/papers/*`、olx→`/v1/olx/works/*`、pmd→`/v1/pmd/papers/*`）、author `search/get/papers`、journal 一整套。消费者：seoenrich(作者回填)、library(导入)、`config/handler_ssr.go`、`routes_scholar.go`。**依赖端点在 0.4.1 全部原样存在，无 REST 破坏。** 另有 `GetJournalByISSN/CompareJournals/GetJournalFilters/JournalsByISSNs/GetPaperCitations/GetPaperAuthors/GetRecommendations*` 实现了但未挂路由（能力闲置）。

**(B) Agent MCP（scholar_agent 容器 spawn `@minicod/mcp-server`）** — stdio spawn → `listTools()` 全量 → 加前缀 `mcp__minicod__` → **无正向白名单**透传给模型。两侧前缀放行：`featurePolicy.ts:16` + `ws.go:290-292`。per-feature denylist **只列内建工具名**，从不列 MCP 名。暴露 MCP 的 feature 均 `PermissionAuto`(自动批准)。egress 无 host 白名单、plain NAT 直连、新工具全打同一 minicod host → **egress 零改动**。

**(C) Skills + 静态 prompt** — 只引用 8 个核心工具。静态 prompt 用**通配 gate**(`smart_search.go:15-18`)→ 新工具自动放行；但 skill 的 `allowed-tools` frontmatter 是**硬白名单**(`minicod-search-strategy:7`、`prism-citation-grounding:7`、`citation-audit:7`、32 个 reviewer:9)→ 会挡住新工具。覆盖 `minicod-search-strategy`、3 个 prism skill、topic-selection/citation-audit、`wl-lit-synthesis`、32 个 reviewer-skills + 2 个静态 prompt。

**前端** — 唯一耦合是前缀常量 `MINICOD_TOOL_PREFIX`(`minicod-papers.ts:241`)，**无逐工具 allow-list/switch**。单一解析器 `parsePapersFromToolResult`(4 消费方)只认论文信封 `{items:[{title,id,...}]}`。**无期刊/作者/高校/snippet/实体卡渲染器。**

## 3. 上游变化（0.3.0→0.4.1 delta）

**MCP 工具集 17→76（纯加法）**，按 `dist/tools/*.js` 实际计数：Papers 6→12（+get_papers_batch、search_papers_bulk[semantic,token 游标]、match_paper[title→body query]、autocomplete_papers、get_related_works[olx]、group_works[olx]）；Authors 2→6（+get_author、get_authors_batch、autocomplete/group_authors[olx]）；Journals 9→22（+get_journal_comments[旗舰:接受/拒稿/desk-reject 率]、timeline、by_keyword、submission_guideline/latex[会员门]、export[CSV]、batch/byIds 等）；**Universities 0→5（全新中国高校）**；**OpenAlex 实体 0→28（6 类×{search,get,batch,autocomplete,(group)}）**；**Discovery 0→3（search_snippets[semantic,RAG]、recommend_paper[semantic/pubmed,olx→501]、recommend_from_pool）**。

**破坏性 vs 加法**：零破坏——17 个老工具名/参数/路由/默认值全不变；老工具仅两处**可选**追加（authors 新增可选 `source` 默认 openalex→省略即复现 0.3.0；search_journals 新增 min_comment_rating/count）。`package.json` 契约（node>=18、sdk ^1.0.4、zod ^3.23.8、bin、DEFAULT_BASE_URL、env）全不变 → **drop-in 版本 bump**。端点覆盖 99/101，仅 `/v1/chat/completions` 与 `/v1/today/recent` 无 MCP 工具。

**api-1.json 契约坑（参考基线）**：信封**不统一**——stc/olx/pmd/uni/today 用 `ApiResponse{success,error{code=HTTP 状态},meta}`，核心 jnl 数据端点用 `{code,message,data}`，jnl 辅助端点又切回 ApiResponse；`info.description` 的 40001 业务码任何 schema 都没用。jnl submission 会员门(403 不计费)返回文件；jnl 批量参数是逗号字符串、id 是整数；`SearchOptions.source` enum=[stc,olx,all]（无 pmd）、`subjects/types` 无 enum 列表(与 prod source-400 事故同源)；Paper 新增 tldr/bibtex；`OpenAlexSearchOptions` 是死 schema。

## 4. 对齐问题清单（drift inventory，已合并重复）

| # | 层 | 严重度 | 问题 | 证据 file:line | 修复建议 |
|---|---|---|---|---|---|
| 1 | MCP | **High** | caret `^0.3.0` 拉不到 0.4.1；升级唯一阻塞点 | `agent/package.json:15`；`bun.lock:27` | 改 `^0.4.1`，`bun install` 重生 lock，`build agent`。Dockerfile/env/entry 不动 |
| 2 | MCP | **High** | 无正向 MCP 白名单：76 工具 schema(≈15–25K tokens)灌每轮 + 全自动批准；denylist 只列内建名挡不住 | `toAnthropicTools.ts:12-16`；`featurePolicy.ts:10-18`；`ws.go:289-292`；`smartsearch/spec.go:129-133` | FeatureSpec 加 `AllowedMcpTools`，buildTools 强制 + permissionAllowed 镜像；smart_search 收敛 ~6–8。**bump 同 PR** |
| 3 | BE | **High** | 期刊 SEO 种子读 `data.unified.*`，spec 是扁平 Journal(`unified` 0 次)→ 线上扁平则静默停 seeding | `handler.go:692-711` | seed builder 兼容两形状(先顶层回退 unified)；先抓 live `/v1/jnl/get` 核实 |
| 4 | BE | **Med→High**易踩 | OLX works get/batch 发 `select`，共享 schema 只认 `fields` → 裁剪失效或 400 | `client.go:312-321,442-456` | works get/batch 改发 `fields`；select 只留 OLX 实体端点 |
| 5 | FE | **High** | 作者伪装成论文卡(`name→title`,`id→paperId`)+错误收藏/暂存；0.3.0 已潜伏 | `minicod-papers.ts:98,108,56,103-106`；`PaperListScroller.tsx:94-113` | 识别作者→专用卡；或 normalizePaper 仅 name 无论文字段时拒绝 |
| 6 | FE | **High** | 高校伪装成论文卡(0.4.1 新增) | api-1.json `University`；`minicod-papers.ts:43-45,56-58` | 加高校卡 + 同守卫 |
| 7 | FE | **High** | ~50 个非论文工具结果**隐形**：解析返回 [] + `expandable={false}` 无法看 JSON。期刊/snippet/28 实体/recommend_*/autocomplete/group 全 null | `minicod-papers.ts:56,98,108`；`AssistantTurn.tsx:99`；`MessageTurn.tsx:193`；`AdminTranscriptView.tsx:184` | (a)加渲染器;(b)**安全网**:不识别为论文时回退默认 expandable;(c)接受集加 `recommended_papers`、处理 paper_title/paper_id |
| 8 | SKILL | **High** | `search_snippets`(接地)无人教——反幻觉三 skill 命门 | `prism-citation-grounding/SKILL.md:7,19-24`；`wl-lit-synthesis:44`；`citation-audit` | 三 skill+search-strategy 教 search_snippets(semantic)并进 allowed-tools |
| 9 | SKILL | **High** | claw 宣传期刊推荐但只暴露 `get_journal` | `claw.go:16` vs `:32` | claw.go 加 search_journals/suggest_journals/compare_journals(+get_journal_comments/submission_guideline) |
| 10 | SKILL | **High** | citation-audit 教"DOI 当 query 传"而非 `get_paper_by_doi`;缺 `match_paper` | `citation-audit/SKILL.md:7,25-27,26` | 换 get_paper_by_doi;加 match_paper;进 allowed-tools |
| 11 | SKILL | **High** | 旗舰 search-strategy 缺收割工具(get_papers_batch/search_papers_bulk/match_paper/group_works/recommend_*);硬白名单挡住 | `minicod-search-strategy/SKILL.md:7,22-28,34-45` | 补教 + 同步放宽 allowed-tools |
| 12 | BE-other | **Med** | prompt 硬列 `mcp__minicod__get_author`,0.3.0 不存在(17 工具无它),仅 0.4.1 有→悬空;bump 即修 | `claw.go:30`；`smart_search.go:17` | 优先 bump(通配 gate 自动暴露);若留 0.3.0 则删 get_author 改指 get_author_papers/search_authors |
| 13 | MCP | **Med** | 轮级死锁:connect/listTools 无超时且 buildTools 在 try 外→握手挂起卡死整轮 | `minicodClient.ts:54-83,94-105`；`turnLoop.ts:86` | connect/listTools 加有界超时+reset;buildTools 挪进 try |
| 14 | MCP | **Med** | `bun.lock` 从未 COPY 进镜像→按 caret 现场解析,不可复现 | `Dockerfile:64-65`；`bun.lock:27` | 加 `COPY bun.lock` + `--frozen-lockfile` |
| 15 | MCP | **Med** | 76 工具全自动批准;batch/bulk/export/group 单轮扇出计费上游调用暴涨(只读非安全升级) | `ws.go:289-292`；`peerreview/spec.go:55`；README:201 | 配 #2 白名单让重工具 opt-in;必要时加单轮 MCP 预算 |
| 16 | BE | **Med** | 信封隐患:doPost 只认 `{code,message,data}`,若上游改 documented `{success,error,meta}`→错误当成功静默空结果 | `client.go:198-207`；`models.go:21-25` | 抓 live 核实;必要时兼容双信封 |
| 17 | BE | **Med** | Paper 新增 tldr/bibtex,RawPaper 不解析→前端 TLDR 永 nil、BibTeX 每篇丢 | `models.go:40-56,402-449` | RawPaper 加字段+ConvertPaper 映射 |
| 18 | SKILL | **Med** | 多 skill `allowed-tools` 硬白名单,bump 也挡新工具(功能门) | `minicod-search-strategy:7`；`prism-citation-grounding:7`；`rv-*:9` | bump 时逐个放宽;先确认 loader 语义 |
| 19 | SKILL | **Med** | prism-citation-grounding 要真实 BibTeX 却只授权 search_papers | `prism-citation-grounding/SKILL.md:7,15` | 加 get_paper/get_paper_by_doi/match_paper |
| 20 | SKILL | **Med** | wl-lit-synthesis/topic-selection 漏 snippets/batch/group_works/recommend_from_pool | `wl-lit-synthesis:13,16,44`；`topic-selection:16-20,31` | 按协议补教 |
| 21 | SKILL | **Med** | smart_search.go/claw.go 工具清单+重试梯子停留 8-工具;漏 bulk(token 深挖) | `smart_search.go:17,39-46`；`claw.go:25-32` | 刷新清单+加"深挖→bulk" |
| 22 | MCP-diff | **Med** | 高校 MCP 参数名≠backend body 键(include_colleges→full,school_codes→codes) | `universities.js:15-158` | skill 用 MCP 面向名 |
| 23 | MCP-diff | **Med** | jnl submission 会员门(403 不计费)返回文件;新增 fetchFile | `journals.js:479-515`；`client.js:92-152` | skill:403 勿重试;latex base64 解 zip;export CSV 免会员 |
| 24 | BE | **Low** | JournalSearchOptions 漏 count_mode/min_comment_rating/count | `models.go:336-379` | 加 omitempty 可选字段 |
| 25 | BE | **Low** | 死 Journal 结构体类型冲突(IsOA bool vs int,IF float64 vs string) | `models.go:318-334` | 删或对齐类型 |
| 26 | BE-other | **Low** | 过期注释引用已删的 `DefaultBaseURL` | `config.go:101` | 改注释 |
| 27 | MCP | **Low** | base-URL 分歧 www vs bare(无 egress 白名单故无害) | `minicodClient.ts:64`；compose | 无需为升级动 |
| 28 | SKILL | **Low** | 32 reviewer 全有效;rv-novelty 缺近邻工具,rv-integrity 配 snippets 更佳 | `rv-novelty/SKILL.md:9,20` | 机会性补;余 30 不动 |
| 29 | FE | **Low** | 装饰性耦合(chip/streaming 动词)对新工具标注含糊 | `StreamingIndicator.tsx:65-72`；`ToolCallBlock.tsx:68` | 扩展覆盖新后缀 |
| — | BE-other | **Info(已修)** | seoenrich prod 事故三根因当前代码树全修 | `authors.go:24-28,42-99`；`manager.go:101-121,200-226`；`upstream/breaker.go:127-153` | **无需改码**,更新 memory 标记已解决 |

**口径纠正**：调查(6)称 `get_author` 0.3.0 已存在,与其自列的 0.3.0 17-工具清单矛盾(清单无它);调查(3)(5)一致确认 **get_author 是 0.4.1 新增**。本报告以后者为准(#12)。

## 5. 升级方案（action plan）

> 铁律：**MCP bump 与正向白名单同一 PR**;skills 教新工具**必须在 bump 之后**。

**(a) bump MCP** — 1.[S/低]`package.json:15`→`^0.4.1`;2.[S/低]`bun install` 重生 lock;3.[S/低]Dockerfile 加 `COPY bun.lock`+`--frozen-lockfile`(修 #14);4.[S/低]`build agent` 确认 CLIENT_VERSION 0.4.1/76 工具;5.[无]entry/env/egress 不改。

**(b) 正向白名单(同 PR,必须)** — 6.[M/中]FeatureSpec 加 `AllowedMcpTools`,buildTools 强制+ws.go 镜像;smart_search 默认 ~6–8;最低限度也要把 28 OpenAlex+5 高校+discovery 从 smart_search 关掉避免 tokens 回归。风险:白名单过窄挡掉该用的工具→按现有 prompt 宣传集给默认再迭代。

**(c) backend Go 对齐** — 7.[S/中]#4 select→fields(优先,错发 400);8.[S/中]#3 seed 兼容双形状(先做 (f) live 核实);9.[S/低]#17 RawPaper 加 tldr/bibtex;10.[S/低]#16 doPost 兼容双信封;11.[S/低]#24/25/26 补可选参/清死结构体/改注释。

**(d) seoenrich 事故** — 12.[无]代码无需改;**更新 memory** `prod-seoenrich-minicod-breaker-hotloop-2026-07` 标记已解决。

**(e) skills/prompt(bump 之后)** — 13.[S/低]静态 prompt 刷新清单(通配 gate 无门);14.[M/低]skill 逐改+**同步放宽 allowed-tools**(search-strategy/citation-grounding/citation-audit/wl-lit-synthesis/topic-selection/rv-novelty/rv-integrity + 高校/submission 文案)。风险:先确认 loader 是否硬执行 allowed-tools。

**(f) 前端卡片(可并行)** — 15.[S/中]**安全网优先**:不识别为论文时不传 `expandable={false}`,回退默认(把隐形降级为可见 JSON);16.[M/中]normalizePaper 守卫+接受集加 recommended_papers/paper_title;17.[L/中]演进成 results dispatcher 渲染 author/journal/university/snippet/entity 卡;18.[S/低]#29 标签覆盖。

## 6. 未覆盖/待验证（open questions）

1. **[live]** `/v1/jnl/get`(含/不含 full)真实响应是扁平还是 `{unified}`?决定 #3 是否已静默失效 + seed 默认路径。
2. **[live]** paper/author 端点真实信封是 `{code,message,data}` 还是 `{success,error,meta}`?决定 #16 紧迫度(强指向前者但未抓包)。
3. **[live]** `/v1/pmd/papers/search` 返回项是否带 `source='pmd'`?否则 normalizeID 不加前缀→GetPaper 误路由 stc。
4. **[读 loader/用户决策]** agent skill loader 是否把 `allowed-tools` 当硬白名单?决定 (e) 是否必须同步扩白名单。
5. **[measure]** 76 工具序列化 tools[] 真实 token 数(当前 15–25K/轮 为估算)。
6. **[用户决策]** 是否接入 0.4.1 新数据面(高校/snippets/related/OpenAlex 实体/期刊评论/authors batch)——产品增量,需排期。
7. **[未网络验证]** www vs apex 的 cert/vhost 一致性(#27)。
