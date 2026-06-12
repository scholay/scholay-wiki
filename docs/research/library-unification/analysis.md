# 文献集统一化分析(元数据 / og 数据 / PDF · 多入口弹窗)

> 2026-06-11 · 基于 5 路并行深读(后端数据模型 / 导入弹窗 / 管理弹窗 / 共享构件 / 库外入口)的交叉分析。
> 所有论断带 文件:行号 证据;不确定项标「待核实」。

---

## 1. 数据模型一页纸

### 1.1 三类数据的精确对应

| | **元数据(上游冻结快照)** | **og 数据(用户侧真值)** | **PDF 文件** |
|---|---|---|---|
| **后端列**(`user_library_papers`,0001_baseline.sql:1190-1228) | `title` `authors_json` `year` `venue` `doi` `abstract` `pdf_url` `publication_types_json` `citation_count` `raw_json` | `og_title` `og_abstract` `og_authors_json` `og_year` `og_venue` `og_doi`(model.go:106-118) | 本体在 MinIO(`papers/<uid>/<rowid>/<sha>.pdf`,handler_pdf.go:53-55);表内仅元信息 `pdf_object_key` `pdf_original_filename` `pdf_size` `pdf_sha256` `pdf_mime` `pdf_uploaded_at`(model.go:79-82) |
| **写入 API** | ① `POST /library` 收藏(handler.go:303-318)② `confirm-upload-job decision=link`(handler_upload_resolve.go:432-449)③ `relink` 原地替换(handler_relink.go:272-291)。**PATCH 永远碰不到**(handler_edit.go:6-7, 19-20) | ① PDF 解析自动填(仅 free 路径,handler_upload_resolve.go:578-591)② `PATCH /library/papers/:id` 手动编辑(handler_edit.go:51-124) | `POST/GET/DELETE /library/papers/:id/pdf`(handler_pdf.go:71-348);导入路径经 tmp 暂存后搬正(handler_upload_resolve.go:123-203, 716) |
| **前端类型**(shared/api/types.ts:112-176) | `UserLibraryPaper.title/authors/year/venue/doi/abstract/pdf_url/publication_types/citation_count` | `og_title/og_abstract/og_authors/og_year/og_venue/og_doi`(types.ts:142-156,注释与 pick-field 逐字对齐) | `pdf_original_filename/pdf_size/pdf_sha256/pdf_mime/pdf_uploaded_at`(非空=已上传,types.ts:130-141) |
| **前端写 payload** | `AddPaperPayload`(shared/api/user-library-mutations.ts:22-38,整 paper 对象进 `raw`) | `UpdatePaperOGPayload`(features/library/api/papers.ts:133-140;''/[]/0=显式清空,papers.ts:128-130) | multipart(api/pdf.ts:39-93,50MiB+进度+abort) |

**关联关系**:本地**没有 papers 主数据表、没有外键**,与在线论文的关联是逻辑键 `(user_id, source, source_paper_id)` 唯一索引 `uk_user_source_paper`(0001_baseline.sql:1223);同一篇论文从 stc/olx/pmd 三源加入会存三行(model.go:7-8)。自由文件 `source='local'`、`source_paper_id`=PDF sha256(handler_upload_resolve.go:530, 570)。`link_state`(linked/free)与 `origin`(search/upload)正交(model.go:27-30, 121-124)。

### 1.2 合并优先级规则:逐字段、纯前端

- **后端不做展示合并**,读接口原样返回两组列。唯一的后端"og 优先"是 relink-search 搜索词取 `og_title` 优先(handler_relink.go:80-87)。
- 前端单一真源 `lib/pick-field.ts`:`pickString`(og trim 非空赢,:22-26)/ `pickNumber`(og>0 赢,:29-36)/ `pickAuthors`(og 非空数组赢,:39-45)/ `pickEffectiveFields` 一次算 6 字段(:78-87)。**逐字段**而非整体——og_title 填了但 og_year 没填时,标题显 og、年份显元数据。
- 恢复显示元数据 = PATCH 显式置空对应 og 字段(handler_edit.go:74-104)。

### 1.3 写入侧三套互相矛盾的合并策略(后端)

| 场景 | 策略 | 证据 |
|---|---|---|
| relink 合并到已有行 | **只填空**,绝不覆盖既有 og | handler_relink.go:219-236 |
| free 秒传(同 sha 重传) | 非空 parsed **直接覆盖**既有 og → **会擦掉用户手动编辑** | handler_upload_resolve.go:677-696 |
| applyOGUpdates | 空值也全量覆盖(现不可达死代码) | handler_upload_resolve.go:698-711 |

### 1.4 当前规则的坑

1. **confirmLinked 不落 parsed og,与 confirmFree 不对称**:`AIMeta` 恒 nil(import_helpers.go:334-337),linked 新建行 og 全空(handler_upload_resolve.go:450-452)→ 连锁导致该行 `paperHasOGData=false`,**永远不能 unlink**(handler_relink.go:344-348)。
2. **列表搜索 q 不查 og_***:LIKE 只打 title/abstract/venue/doi(handler.go:196-200),free 行这些列全空 → 自由文件按显示标题搜索 0 命中。
3. **unlink 清元数据不彻底**:漏 `pdf_url`、`publication_types_json`(handler_relink.go:356-368);且占位键用 pdf_sha256 可撞 uk 唯一约束裸 500(:350-354)。
4. **单条 Remove 泄漏 MinIO 对象**(handler.go:333-360 不清 pdf_object_key;批删反而做了 :806-858)。
5. **ai_*/og_* 命名残留**贯穿后端注释与类型(handler_relink.go:187/271/319-321;import_helpers.go:324-332;0001_baseline.sql:1214-1219 COMMENT 仍写"AI 提取")。
6. **前端类型双定义漂移**:`AddPaperPayload` 在 papers.ts:184-195(无 authors/raw)与 user-library-mutations.ts:22-38(有)两处定义,前者挂在零消费死代码 `useAddLibraryPaper` 上(papers.ts:197-229)。
7. **`publication_types` 声明未填充**(user-library-mutations.ts:34 vs :142-155);后端侧 `SearchHit.PublicationTypes` 同样声明不赋值(import_helpers.go:47)→ 该列只有 `POST /library` 路径会写。
8. **类型谎言**:`libraryRowToPaper` 的 `row.source as UpstreamSource` 在运行时透传 'local'(papers.ts:178-181)。
9. **"根目录"半死**:类型/迁移注释说 folder_id NULL=根目录(model.go:4-5, 0001_baseline.sql:1207),所有写路径却强制默认文件夹(handler.go:270-279, 723-731, 779-787),`folder=root` 过滤为兼容残骸。

---

## 2. 入口全景矩阵

| # | 入口 | 触发 UI | 弹窗组件 | 表单组件 | 调用 API | 写入数据 | 引导后续完善 |
|---|---|---|---|---|---|---|---|
| 1 | 传统搜索结果卡 | chip 按钮(DefaultCard.tsx:142-148) | **无弹窗** | 无 | `useFavoritePaper` → POST /user/library(user-library-mutations.ts:131) | 元数据快照(含 raw 整对象)→ 默认文件夹 | ❌ 仅 "+1" burst/toast |
| 2 | 智能搜索论文组 | 同卡复用(PaperListScroller.tsx:283-300) | 无 | 无 | 同上 | 同上 | ❌ |
| 3 | 矩阵工作区 | hover 显隐 icon(PaperCell.tsx:41-48,showToast=false) | 无 | 无 | 同上 | 同上 | ❌(失败也静默) |
| 4 | 论文详情页 | link 文字按钮(PaperActionRow.tsx:145-156) | 无 | 无 | 同上 | 同上 | ❌(未上传 PDF 也不提示) |
| 5 | 移动端 feed | 圆形 icon(PaperFeedCard.tsx:141-149) | 无 | 无 | 同上 | 同上 | ❌(且移动端无 /m/library 可查看) |
| 6 | 登录后自动重放 | 隐形(useReplayPendingAction.ts:37-48) | 无 | 无 | 同上(silentSuccess) | 同上 | ❌ |
| 7 | 导入弹窗·在线搜索 tab | 工具栏按钮(LibraryPage.tsx:268-323) | `LibraryImportDialog` → OnlineSearchTab | 无(搜索条) | `useQuickPaperSearch` 三源 + 同一 `useFavoritePaper`(OnlineSearchTab.tsx:202-210) | 元数据快照 → **唯一能传 folderId 的入口**(:49) | ❌ |
| 8 | 导入弹窗·PDF 上传 tab | 同上 | `LibraryImportDialog` → PdfUploadTab 四态 wizard | `MetadataFields` + `useMetadataForm`(全量 `toFullOgPayload`,PdfUploadFill.tsx:46) | SSE `upload-and-resolve` → `confirm-upload-job`(link/free)→ `PATCH og_*`(PdfUploadTab.tsx:158-209) | link:元数据 + PDF + 表单og;free:仅 og + PDF | ✅ 流程内强制走 fill 步(唯一闭环入口) |
| 9 | 导入弹窗·Zotero/Endnote | 同上 | ComingSoonTab(占位) | — | — | — | — |
| 10 | 管理弹窗·元数据 tab | 行 chip 菜单「手动编辑/填写」(LibraryPaperRow.tsx:241;BasicInfoChip.tsx:52-56) | `PaperManageDialog` → MetadataPanel | 同一套 `MetadataFields` + `useMetadataForm`(**差量** `toOgPayload`) | `PATCH /papers/:id`(api/papers.ts:142-160) | 仅 og_* | —(本身即完善动作) |
| 11 | 管理弹窗·在线关联 tab | 行 chip 菜单「在线关联」(仅 free 行,LibraryPaperRow.tsx:242) | `PaperManageDialog` → RelinkPanel | 无(检索条) | `POST relink-search` / `POST relink`(api/relink.ts:30-86) | 元数据整体替换或合并;og 不动(handler_relink.go:271-304) | — |
| 12 | 管理弹窗·PDF tab | 行 chip 菜单「本地上传/更换 PDF」(PdfChip.tsx:43,49) | `PaperManageDialog` → PdfPanel | 无(dropzone;link/doi 子 tab 为占位) | `POST/DELETE /papers/:id/pdf`(api/pdf.ts:39-109) | PDF 文件 + pdf_* 元数据 | 弱:「编辑信息」按钮切 metadata tab(PdfPanel.tsx:145) |
| 13 | 行上直接动作:取消关联 | chip 菜单(linked 行) | 无弹窗,ConfirmPopover(LibraryPaperRow.tsx:139-151) | 无 | `DELETE unlink`(relink.ts:96-113) | 清空全部元数据,留 og+PDF | — |

**核心结论**:13 个入口在 mutation 层其实只有 4 条写路径(favorite / confirm+og / patch-og / relink),收口程度比表面好;割裂在 **UI 壳层**(两个 90% 同构却各自手搓的 Dialog)与 **动线层**(入口 1-7 加完即断,与 8/10-12 的"完善"流程零衔接)。

---

## 3. 重复造轮子清单(按重复份数排序)

### 重复 5 份
1. **footer 操作条**(左 hint + 右按钮组,`px-6 py-3 bg-surface-1 border-t border-border-soft`):MetadataPanel.tsx:94-131、PdfPanel.tsx:259-309、RelinkPanel.tsx:171-202、OnlineSearchTab.tsx:126-140、PdfUploadTab.tsx:319-363。
2. **"venue · 年份 · DOI" meta 行拼接**:relink-result-area.tsx:103-117、PdfUploadDecide.tsx:200-225 + 313-330、pdf-parts.tsx:60-74、MetadataPanel PreviewPanel:166-178,另有列表行专用 paper-row/MetaRow.tsx 不通用。
3. **作者纯文本截断 4-5 个变体**:`formatAuthorsDisplay`(resolve-paper.ts:76-81,前5+et al)/ PdfUploadDecide.tsx:497-514(**逐字重复前者**)/ OnlineSearchTab.tsx:160-165(前3+et al)/ paper-status.ts:52-56("X 等 N 人")/ AuthorsRow.tsx JSX 版(前5+"等 N 人",交互版独立合理)。

### 重复 4 份
4. **amber 下划线 tablist**(`role=tablist` + active 橙字 + h-0.5 下划线):PaperManageDialog.tsx:103-130(h-11)、PdfPanel.tsx:148-175(h-9)、RelinkPanel.tsx:80-116(h-10+计数 badge)、LibraryImportDialog.tsx:101-141(h-10+「即将」badge)。
5. **编号"状态条"**(pill 0/1/2/3 + 态名):PdfUploadEntry.tsx:38-50、PdfUploadInspecting.tsx:36-47、PdfUploadDecide.tsx:66-79、PdfUploadFill.tsx:64-79。

### 重复 3 份
6. **论文候选结果行卡**(标题+作者行+meta 行+动作):relink-result-area.tsx:85-118(radio 单选)、OnlineSearchTab.tsx:149-213(FavoritePaperButton 多选)、PdfUploadDecide.tsx:300-348(「采用」按钮)。注意:三处**交互模型确实不同**(单选提交 / 逐篇收藏 / 接受候选),API 也不同(relink-search vs quick-search vs SSE searched 事件)——是"平行实现"而非纯复制,可统一的是行卡视觉件 + 上游搜索数据形态。
7. **文件夹列表 hook 三份复制**(同 queryKey `['library','folders']`):features/search/api/library.ts:74、features/journals/api/library.ts:19、features/home/api/library.ts:20(系"features 不互 import"约束的刻意复制)。
8. **收藏态判定三套链路**:单源批查(SearcherColumn.tsx:145)/ 三源分桶且 key 形态不同(PaperListScroller.tsx:101-110 vs useStagedFavorites.ts:26-36)/ 详情页绕开 check 用 libRow(PaperActionRow.tsx:43);外加 OnlineSearchTab 本地 `favoritedKeys` state 第四套(OnlineSearchTab.tsx:34)。

### 重复 2 份
9. **Dialog 外壳手搓两份,90% 同构**:PaperManageDialog.tsx:54-100 vs LibraryImportDialog.tsx:53-99(同 Portal/Overlay/Content/header 模板,差异仅 960px固定高 vs 860px自适应、图标颜色)。
10. **PDF 文件校验两份逐条相同**(后缀/.pdf、非空、≤50MB、同文案):PdfPanel.tsx:65-72 vs pdf-import-wizard/validate-file.ts:7-27。
11. **dropzone 三件套两份**:隐藏 input+accept+value 重置(PdfPanel.tsx:224-234 vs PdfUploadTab.tsx:261-271,逐行同构)、drag handlers(PdfPanel.tsx:184-195 vs PdfUploadTab.tsx:219-229)、dropzone 视觉(pdf-parts.tsx FileTab:157-199 vs PdfUploadEntry.tsx:53-81)。两边**业务流确实不同**(已有行直传 vs 建新行 wizard),重复在工具/视觉层。
12. **源品牌名两套且矛盾**:PdfUploadDecide.tsx:490-495 `sourceLabel`(stc→**Crossref**,疑似事实性错误)vs resolve-paper.ts:45-50 `sourceBrandLabel`(stc→**Graph**)。
13. **formatSize 两份完全重复**:PdfPreviewCard.tsx:136-140 vs api/pdf.ts:120-124。
14. **entity→表单初值映射器两份**:MetadataPanel.ogToValues(:17-26)vs PdfUploadFill.buildInitialValues(:244-270)。
15. **侧栏 LibrarySection 两份近逐行复制**:search-sidebar/LibrarySection.tsx vs JournalSidebar.tsx:147-219(后者漏挂 FavoriteBurst sink)。
16. **期刊增强 badge 两套渲染**:PdfUploadDecide JournalBadges(:429-477)vs PdfUploadFill 质量信息三格(:120-142),同消费 useJournalEnrichments。
17. **后端写入侧 og 合并策略三套语义矛盾**(见 §1.3)——前端统一时必须连带定后端真值规则。

### 死代码(0 份消费,顺手清)
18. `pdf-import-wizard/UploadStep.tsx`(全仓 0 引用,兜底文案与 PdfUploadEntry.tsx:151-155 逐字重复);`useAddLibraryPaper`/`useRemoveLibraryPaper`(papers.ts:197-229);后端 AIMeta/fillOGFields/applyOGUpdates 死路径 + 幽灵 `ai_done` 事件(handler_upload_resolve.go:11, 267-268;前端 upload-resolve.ts:125-127 解析了但 PdfUploadTab.tsx:87-99 不消费)。

---

## 4. 不一致体验清单(同一概念跨弹窗差异)

| 概念 | 差异 | 证据 |
|---|---|---|
| **数据源品牌名** | 同一 stc 源,导入 decide 步显示"Crossref",关联面板显示"Graph";olx 是"OpenAlex" vs "Discovery" | PdfUploadDecide.tsx:490-495 vs resolve-paper.ts:45-50 |
| **匹配度** | 导入 decide 步显示 96%/78% 等**前端 mock 数字**且文案暗示"PDF 全文+DOI 比对";关联面板「排序:匹配度」是无 onClick 死按钮 | PdfUploadDecide.tsx:516-531;relink-result-area.tsx:55-60 |
| **主操作按钮颜色** | metadata/pdf 面板 brand-green,relink 面板 brand-amber;导入 fill 步绿;全部裸 `<button>` 内联 tailwind,未用 shared/ui Button | — |
| **错误展示** | 四种并存:Metadata=toast(MetadataPanel.tsx:70);Pdf=内联红条+toast 混用(:252-254);Relink=内联裸 `error.message`(relink-result-area.tsx:30-36);在线搜索 tab **完全吞掉**源级错误(OnlineSearchTab.tsx:45) | — |
| **按钮文案 vs 行为** | RelinkPanel「下一步」实为终点提交;PdfPanel 上传中「关闭(终止)」不真 abort,而导入侧 cancelAndClose 主动 abort | PdfPanel.tsx:294 vs PdfUploadTab.tsx:64-67 |
| **UI 承诺 vs 实现** | 「先填写信息」蓝卡静默 no-op(PdfUploadTab.tsx:144);parsing 步提示"可立即手动填写"但点击被 toast 挡(PdfUploadInspecting.tsx:108-113 vs PdfUploadTab.tsx:134-143);"粘贴 PDF 链接 Ctrl+V"无 paste handler(PdfUploadTab.tsx:314);PdfPanel link/doi 子 tab 全占位且共享同一 urlInput(:56, :210, :219) | — |
| **文件夹定向** | 仅 OnlineSearchTab 收进当前文件夹(:49),其余 5 个库外入口一律默认文件夹且无提示 | — |
| **成功反馈** | burst "+1" / toast / 自定义 toast+burst 双重叠加(OnlineSearchTab 未传 silentSuccess)/ 矩阵完全静默(连失败 toast 都关) | PaperCell.tsx:46 |
| **收藏态记忆** | OnlineSearchTab 用本地 state,重开弹窗清零,历史已收藏显示为未收藏可再点 | OnlineSearchTab.tsx:34 |
| **检索触发** | LibraryPage 主搜索 300ms debounce(LibraryPage.tsx:117)、quick-search 280ms debounce;RelinkPanel 逐键击触发 POST 无 debounce | RelinkPanel.tsx:126 + relink.ts:37 |
| **og 概念暴露** | MetadataPanel footer 直接对用户写「仅写入你的本地字段(og)」(:96),其余入口对双轨数据零解释 | — |
| **数据后果不一致** | 同样"上传 PDF 入库":选关联 → og 全空、日后不能 unlink;选自由文件 → og 全填、重传会被解析覆盖手动编辑 | §1.4.1 + §1.3 |
| **自由文件可见性** | 列表显示 og 标题,但搜索框按该标题搜不到(后端 q 不查 og) | handler.go:196-200 |

---

## 5. 统一方案设计空间

交叉结论:**数据层与表单层已基本统一**(useFavoritePaper 唯一 mutation、useMetadataForm+MetadataFields 已 100% 收编两个编辑入口、resolve-paper/pick-field 单一真源),割裂集中在 **弹窗壳层、候选列表交互层、入口动线层**。方案不需要推倒数据层,重心是壳与动线。

### 方案 A:纯构件收口(不动信息架构)
保留两个弹窗,抽 feature 级共享件:`TabbedDialogShell`(壳+header+tablist)、`DialogFooterBar`、`PaperHitRow`+`MetaLine`、`usePdfDropzone`+统一 `validatePdfFile`、作者格式化/品牌名收口进 resolve-paper。
- 成本:低(1-2 周量级,纯前端)。风险:极低,逐件替换可回归。
- 缺陷:视觉统一了,但"加入后去哪完善"的动线断裂依旧。

### 方案 B(推荐):单一「文献工作台」弹窗 = 一壳 + 可组合面板
合并两弹窗为 `PaperWorkbenchDialog`,内部面板注册表:检索加入 / PDF 导入向导 / 元数据 / PDF 附件 / 在线关联。统一入口 API:`openWorkbench({ intent, paper?, folderId? })`——paper 空 = 新建语境,非空 = 管理语境;所有入口只是不同 intent。导入 wizard confirm 后**不关弹窗而是原地切入该行的管理语境**,"加入→完善"一个壳内闭环。
- 可行性:两弹窗外壳已 90% 同构;元数据表单已同一套(fill vs MetadataPanel 差异仅 toFullOgPayload vs toOgPayload);管理弹窗本就有跨面板跳转先例(PdfPanel.tsx:145)。
- 成本:中(A 之上再 1-2 周)。风险:中——PDF wizard 的 SSE 流与 abort 语义要在统一壳里保活;tab 切换 unmount 重置的现设计(LibraryImportDialog.tsx:24-25)与"新建→管理原地续接"有张力。
- **前置依赖**:后端先定"og 真值规则"(§1.3 收敛 + confirmLinked 落 parsed og),否则统一 UI 会把后端不一致更显眼地暴露。

### 方案 C:页面化「文献条目详情」(去弹窗)
每条 library 行建路由页/侧拉详情,弹窗只留"快速加入"。成本高、与现有弹窗心智差异大,暂缓;若未来做笔记/标注/全文阅读再考虑。

**推荐:A 作为第一阶段地基,B 作为目标形态**——B 的全部构件依赖正是 A 的产出,是同一条路径的两站。

---

## 6. 分步落地顺序(每步独立可交付)

**Step 0 — 清障与事实性修复**(无 UI 变化,半天-1天)
- 删死代码:pdf-import-wizard/UploadStep.tsx;useAddLibraryPaper/useRemoveLibraryPaper + 死的 AddPaperPayload 副本;types/validate-file 迁入 library-import-dialog/ 并删目录。
- 修品牌名 bug:PdfUploadDecide 的 sourceLabel/formatAuthors/手拼 key 全部换 resolve-paper 导出。
- 决断 ai_done:后端已恒不发 → 前后端协议层移除;清后端 AIMeta 死路径。
- 修 UI 谎言:蓝卡 no-op、"Ctrl+V"hint、mock 匹配度、「排序:匹配度」死按钮。

**Step 1 — 后端真值规则收敛**(可独立发布,前端无感)
- confirmLinked 落 parsed → og(对齐 confirmFree),解锁该类行的 unlink。
- 三套 og 合并策略统一为"只填空,绝不覆盖用户编辑"(以 handler_relink.go:219-236 为准)。
- List 搜索 q 增加 og_title/og_abstract/og_venue/og_doi。
- 顺手:单条 Remove 清 MinIO、unlink 清 pdf_url/publication_types + sha 撞 uk 合并兜底、注释 ai_*→og_* 改名。

**Step 2 — 共享构件层(方案 A 主体)**
- 抽 TabbedDialogShell / DialogFooterBar / StepBanner / PaperHitRow + MetaLine / usePdfDropzone + 单一 validatePdfFile / JournalQualityBadges;按钮统一 shared/ui Button 或 feature cva;错误展示统一为"面板内联条 + 提交 toast"。
- 顺带修交互债:RelinkPanel debounce、「下一步」改「确认关联」、PdfPanel 关闭真 abort、link/doi 子 tab 拆 state。

**Step 3 — 收藏态与数据 hook 收口**
- 统一 useFavoriteCheck 复合 key 用法,收编四套判定;OnlineSearchTab 弃本地 favoritedKeys 改 check + silentSuccess 消双重反馈;移动端 feed 按实际源分桶。
- entity→MetadataFormValues 映射器下沉到 useMetadataForm 旁。

**Step 4 — 合并两弹窗为 PaperWorkbenchDialog(方案 B 主体)**
- Step 2 构件拼装统一壳 + 面板注册表 + openWorkbench(intent);入口全部切新 API;PDF wizard confirm 成功后原地进入管理语境,fill 步与 MetadataPanel 合并为同一面板的两种 payload 模式。
- 旧弹窗留薄壳转发一版,验证后删除。

**Step 5 — 入口动线补全(库外体验)**
- 库外收藏成功反馈追加「完善信息」action(打开 Workbench 管理语境)与文件夹选择(FavoritePaperButton 已有 folderId prop);journals 侧栏补 FavoriteBurst sink;智能搜索「一键收藏」对齐(可后置)。
- 移动端 /m/library 是否做:产品决策,待核实。

依赖关系:Step 0/1 完全独立;Step 2 不依赖 1;Step 4 依赖 2(构件)与 1(否则统一 UI 暴露后端不一致);Step 3/5 可与 4 并行或先行。

---

### 残留不确定项(待核实)
- PdfUploadInspecting 的 5 步 checklist 文案提到 "Crossref/Semantic Scholar" 与实际三源(stc/olx/pmd=Minicod)是否还有品牌错位——合并面板时现场核对。
- 「跳过自动匹配」在 parsing 步被挡的根因是 confirm 需要 jobId(PdfUploadTab.tsx:138-140 TODO);统一后是否允许"先手填、jobId 后到再补 confirm",需确认 job 生命周期(Redis TTL 30min)是否支持。
- 方案 B 中"tab 切换不保状态是设计意图"(LibraryImportDialog.tsx:24-25)与新动线的取舍,需产品确认。
