# 文献集(Personal Library)功能全景分析报告

> 2026-07-08 · 多智能体深读(5 维度并行 + 完整性复核 + 6 项补漏核查,全部结论经实读代码验证)
> 范围:数据架构 / 后端 API 链路 / 前端页面交互 / **用户导入入口全景** / 跨功能消费面 / 问题清单

---

## 0. 生态位总览

文献集是**「用户私有论文元数据 + 用户上传 PDF」的单一真源**,被 6 个前端功能域和 3 个后端模块消费。

- 后端:`backend/internal/library/`(10 文件 ~4100 行,model/repo/service 合并进 handler 的扁平风格)
- 前端:`frontend-user/src/features/library/`(~50 文件)+ `shared/api/user-library-mutations.ts` / `shared/api/library-share.ts` / `shared/lib/library-invalidation.ts`
- 迁移:`0001_baseline.sql`(user_library_* 表)、`0013`(默认文件夹唯一)、`0032`(分享三表)、`0038`(期刊分享)
- 路由:桌面 `/library`(folder 走 `?folder=` query)、移动 `/m/library` + `/m/library/:folderId`、公开分享 `/s/:token`(独立顶层路由,不挂 shell)

---

## 1. 数据架构

### 1.1 表结构

**`user_library_folders`** — 一级文件夹(平铺不嵌套),`position` 排序,`is_default` 标默认夹。
- 0013 迁移:生成列 `default_anchor = IF(is_default, user_id, NULL)` + 唯一索引 → **每用户至多一个默认文件夹由 DB 硬保证**;lazy 创建的并发安全靠「Create 撞 1062 → re-read 兜底」(handler.go:1003-1010)。
- ⚠️ 无 `(user_id, name)` 唯一索引,重名校验是 read-then-create,并发可产生同名夹。

**`user_library_papers`** — 收藏行,三层字段分层(这是整个模块的核心设计):

| 层 | 字段 | 语义 |
|---|---|---|
| 上游冻结快照(metadata) | title/authors_json/year/venue/doi/abstract/pdf_url/publication_types_json/citation_count/raw_json | 收藏时刻冻结,**用户编辑永不触碰**;上游不可用时本地仍可展示 |
| 用户侧真值(og_*) | og_title/og_abstract/og_authors_json/og_year/og_venue/og_doi | 写入方 = pdfparse 抽取(**只填空**)+ 用户手编;前端 `pickField(og, metadata)` og 非空优先 |
| PDF 元数据 | pdf_object_key/pdf_original_filename/pdf_size/pdf_sha256/pdf_mime/pdf_uploaded_at | 文件本体在 MinIO 私有 bucket,key = `papers/<uid>/<rowId>/<sha256>.pdf` |

状态字段:
- `link_state`:`linked`(关联上游 stc/olx/pmd)/ `free`(自由文件,source='local',source_paper_id=PDF sha256 → 天然内容级秒传去重)
- `origin`:`search` / `upload` / `share`(⚠️ share 定义在 share_model.go:33,model.go 常量表与 DDL 注释均未收录)
- `folder_id`:NULL=「根目录」是 v1 遗留语义;archive/0033 迁移已删光 NULL 行,现行全部写路径都落默认文件夹

**唯一键 `uk_user_source_paper (user_id, source, source_paper_id)`**:同源不可重复收藏;跨源(三源 paperId 不互通)允许同一论文存 2-3 份(model.go:7-8 明示的设计取舍,无 DOI 级归并)。

查询索引:`idx_user_created_at`(列表默认序)、`idx_user_folder`、`idx_user_doi`、`idx_user_link_state`。**全表无外键**(user/folder 关系纯应用层维护)。

**分享三表(0032)**:
- `library_shares`:token(10 位 base58 crypto/rand + uk_token)、kind(single/collection/journal)、extract_code(4 位,空=免码)、expires_at(NULL=永久)、allow_save、status(active/revoked)、view_count/save_count;0038 加 journal_id(期刊分享是引用语义不快照,allow_save 硬编码 0)
- `library_share_papers`:**分享时刻的篇目快照**(网盘语义,owner 后续增删不影响收件人),≤500 篇;**无 pdf_object_key 列 → PDF 本体刻意不随分享泄出**(正确边界)
- `library_share_access`:view/save 流水,匿名 viewer_user_id=NULL

### 1.2 状态转换(unlink / relink / 秒传)

- **unlink(linked→free)**:先把当前生效展示值快照进 og(只填空),再清空全部 metadata 列;source_paper_id 换 pdf_sha256(空则 `unlinked-<id>`,撞唯一键追加 `-<rowID>`);「og 全空且无 PDF」的空壳行禁止 unlink(前后端同口径守卫)
- **relink**:目标已被收藏 → **合并**(PDF copy-then-delete 迁移 + og 只填空迁移 + 事务删当前行);未收藏 → **原地改写**(10 个 metadata 列无条件写满,缺值显式清零防两篇论文快照混行);og_*/pdf_* 保留
- **秒传**:free 行以 sha256 为 source_paper_id;同 sha 再上传 = 命中已有行合并,og 只填空(`applyParsedFillEmptyOG`,三处自动化路径口径一致)

### 1.3 上限与原子性

| 项 | 值 | 原子性 |
|---|---|---|
| 每用户论文 | 1000 | ✅ `insertPaperAtomic`:事务内 `SELECT COUNT(*) FOR UPDATE` 锁用户区间,**所有新增路径(Add/confirm/SaveShare)共用** |
| 文件夹 | 50 | ❌ Count→Create 非原子;重名同 |
| 活跃分享 | 200 | ❌ 非原子 |
| 分享快照 / 批量 ids | 500 | binding 校验 |
| PDF | 50MiB + .pdf 后缀 + `%PDF-` magic 三重校验 | nginx client_max_body_size 50m 兜底 |

### 1.4 生命周期缺口(补漏核查实锤)

- **删号残留(高)**:`user/repository.go:463-484` DeleteUser 只清 4 张计费表 + users 主行 FK 级联;注释明示 user_library_*、MinIO 对象「留作后续决策」,且**清单里连 library_shares 三表都没列**。后果:①已删用户的 active 分享经 `/s/:token` **永续公开可访问可转存**,owner 已无 RevokeShare 通道;②sharer 实时回查 users 落空 → 落地页显示「用户#<内部自增id>」;③`papers/<uid>/` 下 PDF 成永久孤儿(lifecycle 只盖 `tmp/` 前缀,Tier3 对账 reaper 未上线)
- MinIO 删除失败只 warn 无对账;未 confirm 的 tmp 对象靠 24h lifecycle 兜底(主动清理 worker 是 TODO)
- `library_share_access` 匿名可无限刷写;revoked/expired 分享的快照行永不清理

---

## 2. 后端 API 全景

### 登录端点(/api/v1/user/library,UserAuthMiddleware + tieredRL)

| 端点 | 职责 |
|---|---|
| GET /library | 列表:source/folder/q/page/order 过滤,q 截 64 rune + LIKE 转义,page_size ≤200,列表 Omit(raw_json) |
| POST /library | 收藏:只收上游三源(IsValidUpstreamSource,'local' 后端专用);幂等命中返已有行(⚠️ 顺手改 folder 归属);insertPaperAtomic |
| POST /library/check | 批量收藏态(一次 IN) |
| GET /library/by-upstream/:source/:paperId | 未收藏返 200+null(查询语义) |
| DELETE /library/:source/:paperId | 先收集 pdf key → DB 删 → 异步删 MinIO |
| GET/POST/PATCH/DELETE /library/folders* | 文件夹 CRUD;默认夹锁定;删夹时论文事务内回迁默认夹 |
| PATCH /library/papers/:id | 只写 og_*,指针字段区分「未传/显式置空」 |
| PATCH /papers/:id/folder、POST batch/move、batch/delete | 移动/批量(≤500,WHERE user_id 保护) |
| POST/GET/DELETE /papers/:id/pdf | PDF 上传(sha256 秒传/换 hash 删旧)/ 下载(**后端流式代理 + Range**,不签预签名 URL)/ 删除(free 空壳守卫) |
| POST /papers/upload-and-resolve | **SSE 两段式**:校验→MinIO tmp→pdfparse(60s)→DOI/arXiv/标题多 query 三源检索(45s)→job 进 Redis(TTL 30min) |
| POST /papers/confirm-upload-job | decision=link(已存在则合并 PDF 进既有行)/ free(source='local'+sha,og 落 pdfparse 结果) |
| POST /papers/:id/relink-search、/relink、DELETE /unlink | 见 §1.2 |
| POST/GET/DELETE /shares*、POST /shares/:token/save | 分享 CRUD + 转存 |

### 公开端点

`GET /api/v1/public/share/:token?code=`(OptionalUserAuth):需码但缺/错码 → need_code teaser(标题+分享人+篇数+最高被引 5 篇,无 abstract/doi/pdf);验码通过给全篇目 + view 流水。⚠️ **同文件相邻公开端点都挂了限流,唯独它没有**。

### 鉴权与归属

行级归属统一 `WHERE user_id = ?`(loadOwnedPaper 越权回 404 防枚举);confirm job 归属查 Redis JobState.UserID;Reader 强制 user_id 过滤。整体干净。

### 与周边模块

- `bootstrap.go:299`:library.Handler 实现 `minicod.FavoriteChecker` 反向注入 → 搜索响应服务端直标 isFavorited(移动端因此不调 /check)
- `library.Reader`(reader.go)只读 facade 给 claw 引用文献用(上限:单夹 30 篇 / 总 60 篇,PDF 经 OpenPDF 流式推给 agent)
- stagingarea(暂存区)与 library **零耦合**:独立表组,「暂存→收藏」全靠前端调 Add

---

## 3. 前端页面与交互

### 3.1 桌面 LibraryPage

- **URL 即状态**:folder/q/page/sort/size 全进 query(useUrlState),q 300ms debounce,变更 setter 内显式回第 1 页(刻意不用 useEffect 防后退还原被覆盖)
- 侧栏 LibrarySidebar:单层文件夹 + inline 新建(50 上限前置拦截)+ hover 改名/删除 + 默认夹 UI 锁定 + FavoriteBurst「+1」动画 sink
- 列表 LibraryPaperList:纯展示,分页 20/50 **无虚拟化**(行 memo 化,量级可控);行 = TypeBadge(D/G/M 源徽章 or「本地」)+ 标题 + 作者 + Meta + 摘要 + 三 chips
- chips:**StatusChip**(信息完整度三态,摘要 <50 字算 partial)/ **BasicInfoChip**(hover 6 字段 checklist;click 切「在线关联/取消关联」+「手动编辑」,空壳防护与后端同口径)/ **PdfChip**(只看 pdf_uploaded_at,明确不看在线列 pdf_url)
- 批量:useLibrarySelection(Set + shift 范围选,**选择只限当前页**)+ LibraryBulkToolbar(转移/删除,无批量分享)
- 深链 `?manage=<source>:<id>`:收藏 toast「完善信息」入口,带新鲜度门槛防陈旧 null 误判

### 3.2 PaperWorkbenchDialog 统一工作台(add/manage 双语境单壳)

- add:search/pdf/zotero/endnote 四 tab;manage:metadata/pdf/relink 三面板;**加入→完善闭环**(新行产生后原地切管理语境,「继续添加」可回程)
- MetadataPanel:RHF+zod,初值=生效值(pickEffectiveFields),**提交=差量只写 og_***,清空=清 og 回落在线值;reset 只在 paper.id 变化时触发(防 refetch 清掉正在打字的编辑)
- PdfPanel:上传(进度+可取消)/粘贴链接(占位)/DOI 抓取(占位);移除受空壳防护
- RelinkPanel:三源 tab + 命中计数,替换关联 ConfirmPopover 二次确认
- ⚠️ 弹窗采用「挂载条件==open」模式且注释写成约定 —— **违反项目 Radix Dialog 铁律**(靠 BodyPointerLockGuard 兜底)

### 3.3 移动端(能力大幅裁剪)

| 能力 | PC | 移动 |
|---|---|---|
| 浏览/无限分页(react-virtual 虚拟化)/下拉刷新 | ✔(分页) | ✔ |
| 分享(整本/单篇)、引用 | ✔ | ✔(唯一齐平项) |
| 新建文件夹 | ✔(50 上限前置拦截) | ✔(无前置拦截) |
| 重命名/删除文件夹 | ✔ | ✘ |
| 文件夹内搜索/排序切换 | ✔ | ✘ |
| 单篇转移/删除、批量操作 | ✔ | ✘(只有「取消收藏」=整行删,警示不对等) |
| 添加文献(在线搜索/上传 PDF) | ✔ | ✘ |
| 工作台(编辑 og/PDF/relink)、?manage 深链 | ✔ | ✘ |

**收藏之后的全部管理闭环必须回 PC。**

- ⚠️ UA 正向分流丢 query:手机打开 `/library?folder=5` → redirect 只用 pathname → 落 `/m/library` 丢 folder;反向(`/m/library/:id` → `/library?folder=:id`)反而做了专门改写,两向不对称。`?manage=` 深链在移动端双重失败(丢参 + 无工作台)。

### 3.4 状态管理

- queryKey 三段式全 `['library', ...]` 前缀;失效收口 `invalidateLibrary`(排除 quick-search 防收藏触发三源检索风暴);无乐观更新(全 invalidate-refetch,符合项目约定)
- 读写字段策略有单一真源且带单测:`pick-field.ts`(读,og 优先)/ `resolve-paper.ts`(写,SearchHit 序列化)/ `paper-status.ts`(chip 三态)

### 3.5 分享交互

- 创建:PC = 工具栏文件夹「分享」;移动 = 文件夹卡 + 详情页整本 + 行级单篇;**另外 MobileSearchOverlay / PaperFeedCard 对任意搜索结果/feed 论文也能开 ShareSheet(single)** —— 入口远不止文献集
- ShareSheet:链接+提取码开关+有效期+口令文本;PC/移动**两套同构 zustand store**(重复轮子)
- SharedReceivePage(/s/:token):预览先行(teaser 前 5 篇免码),码门只在「打开/收藏」时弹;PC 打开 single/journal 直接 302 到详情页;转存 toast 报 added/skipped/limit_reached

---

## 4. 导入入口全景(重点)

### 后端写入面(反查基准)

`user_library_papers` 的 **INSERT 只有 4 个点**(grep 全量确认):Add / confirmLinked / confirmFree / SaveShare。其余模块(claw/prism/stagingarea)对该表只读。**不存在隐藏写入口**;relink 只 Update/Delete。

### 入口清单总表

| # | 入口位置 | 用户操作 | 前端组件 | API | 数据形态 | 去重 |
|---|---|---|---|---|---|---|
| A1 | 传统搜索结果(PC) | 「收藏」chip → 弹文件夹选择器 | PaperResultCard + FavoritePaperButton + CollectFolderPicker | POST /user/library | 上游快照全字段 + raw_json | 幂等返已有行(⚠️ folder 不同会被改归属) |
| A2 | 智能搜索工具结果 | 同上 | PaperListScroller → PaperResultCard | 同上 | 同上 | 同上 |
| A3 | **暂存区矩阵首列**(暂存区→库唯一转移口) | row hover 收藏 icon | matrix/PaperCell | 同上 | 同上 | 同上;无批量转移 |
| A4 | 智能助手 claw 论文卡 | 同 A1 | ClawPaperList | 同上 | 同上 | 同上 |
| A5 | 论文详情页(PC/移动同 URL) | ActionRow「收藏」 | PaperActionRow(态查 by-upstream) | 同上 | 同上 | 同上 |
| A6 | 移动 feed | 按钮收藏(底部抽屉选夹)或**双击卡片**(直落默认夹) | PaperFeedCard + useDoubleTapFavorite | 同上 | 同上 | 双击已收藏只弹心 |
| A7 | 移动搜索浮层 | 行内收藏 | MobilePaperRow(isFavorited 后端标注) | 同上 | 同上 | 同上 |
| A8 | 登录后自动重放 | 无(自动) | useReplayPendingAction | 同上 | 缓存的 Paper+folderId | 同上 |
| B1 | 库页工作台·在线搜索 | 搜标题 → 行内收藏(免选择器,目标=当前夹) | OnlineSearchTab(三源并行 quick-search) | POST /public/papers/search ×3 + POST /user/library | 上游快照 | ⚠️ 不查已收藏初始态 |
| B2 | 库页工作台·上传 PDF | 拖/选 → SSE 识别 → 确认候选或直接保存 | PdfUploadTab 三态机(entry→inspecting→decide) | upload-and-resolve(SSE)+ confirm-upload-job | link=快照+PDF(og 空);free=local/sha256,pdfparse 落 og_* | link 撞行合并挂 PDF;free 同 sha 秒传,og 只填空 |
| B3 | 工作台占位 | Zotero/EndNote/「先填写信息」 | ComingSoonTab | 无 | — | —(无 BibTeX/DOI/RIS 预告,手动建条目未实现) |
| D | 分享落地页 /s/:token | 输提取码 → 一键转存 | SharedReceivePage | POST /shares/:token/save | 分享快照(og 已合成进 metadata 列);**PDF 不转移** | 逐篇 skip;撞 1000 截断;⚠️ 恒落默认夹(选夹能力被闲置) |
| E | 管理语境(补充) | 给已有行传 PDF / 换关联 | PdfPanel / RelinkPanel | papers/:id/pdf、/relink* | PDF → MinIO | relink 撞已有行→合并删行 |

要点:
- **全站收藏的唯一实现是 `shared/components/FavoritePaperButton`**(payload = 全量快照含 raw;publication_types 声明了但从不发送 → 该列恒空);未登录走 pendingAction 缓存 + 登录后自动重放
- 收藏态批查遵循「用结果实际源」:传统搜索单源一次 check;智能搜索/claw/暂存区固定三源 useFavoriteCheck 合并;移动端由后端搜索响应直标 isFavorited(FavoriteChecker 注入)
- journals / home / landing / news **没有论文收藏入口**(只有只读文件夹列表/计数)
- 移动端(/m/*)没有 B/E 类入口:不能上传 PDF、不能在线搜索加入指定夹

---

## 5. 跨功能消费矩阵

| 功能 | 读什么 | 写什么 | 耦合方式 |
|---|---|---|---|
| claw 引用文献(后端) | papers/folders + 用户 PDF 流 | 物化到 agent cwd references/,不写库 | Go 包引用 `library.Reader` 只读 facade ✅ |
| claw(前端) | folders/papers 列表 | 无 | HTTP 复用 + 复制 hook,自有 queryKey(缓存刻意隔离) |
| minicod 搜索标注 | CheckFavorites | 无 | Go 接口注入(FavoriteChecker) ✅ |
| search/home/journals sidebar | folders 概要 | 无 | 各自复制 hook + **共享 queryKey 字符串契约**(共 5 份复制,无单一真源) |
| browser(详情/PDF) | paper-detail、PDF 流 | og 编辑、relink | ⚠️ **跨 feature 直接 import features/library/api(违规)** + PDF URL 硬编码 |
| prism \cite | user_library_papers 元数据 | 无 | ⚠️ **`Table("user_library_papers")` 裸表直读,绕过 Reader** |
| 分享收件人 /s/:token | public/share | shares/:token/save | HTTP 公开 |
| stagingarea | 无 | 无 | 零耦合(数据互通靠前端 Add) |
| peerreview / smartsearch 后端 | 无 | 无 | 零耦合 |

PDF 阅读:私有 bucket 全部后端流式代理(Range 支持 pdf.js 渐进加载),不签预签名 URL;与 peerreview/prism **不共享数据**,只共享渲染器组件(shared PdfViewer)。

---

## 6. 问题清单(合并去重,按严重度)

### 🔴 高危

**H1. CreateShare(single) 零校验 → 公开钓鱼落地页 + 跨用户数据投毒**(补漏核查实锤,5 份初始摘要全部漏掉)
- share_handler.go:98-113:req.Paper 的 title/abstract/pdf_url/citation_count/source/source_paper_id **全部客户端可控**,只校验 source/id 非空——不校验论文在分享者库中、不校验上游存在、不校验 source 白名单(IsValidSource 都不过)
- 后果链:① /s/:token 免登录落地页把伪造 pdf_url 渲染成「开放获取」信任徽章(SharedReceivePage.tsx:335-340),任意登录用户一键生成站内背书的钓鱼页;② 他人 SaveShare 转存后,伪造数据以 linked「上游冻结快照」身份进入收件人库,击穿 pick-field.ts:6-12 的可信性前提;③ 任意 source 字符串入库后 `DELETE /library/:source/:paperId` 因 IsValidSource 校验反而删不掉;④ 伪造 source_paper_id 使 PC 端自动 302 到任意详情路由
- 入口面比想象大:MobileSearchOverlay/PaperFeedCard 对**任意搜索结果**都能开 single 分享,或直接 POST API
- 修法:single 分享改服务端锚定——只接受「库中已有论文的引用」(校验归属后走 snapshotFromLibraryRow),或对 (source,id) 做上游存在性校验 + pdf_url 域白名单

**H2. SaveShare 转存行系统性破坏 og/metadata 双轨不变量 → relink 一键静默清空全部内容**(补漏核查实锤)
- share_handler.go:539-544 把快照值(创建时已 og-优先合并)写进收件人行的 **metadata 列**、og 全空:
  - linked 行:metadata 被分享者手编值永久污染(relink 同键是 no-op 不会刷回上游)
  - local free 行:「og 空、metadata 有值」与约定完全倒置 → `hasOwnSubstance`/后端 ogAllEmpty 空壳守卫**全部误判**(UI 同时显示「信息完整」)、DeletePDF 被假文案阻断;**最重**:free 行「在线关联」恒可点,relinkInPlace 无条件覆写 10 个 metadata 列 → share free 行的全部内容一次 relink 不可逆丢光
  - PDF 断点:source_paper_id=原主 PDF 的 sha 但 pdf 列全空;收件人再上传不同文件 → source_paper_id 与 pdf_sha256 永久漂移,还会让智能上传的 sha 幂等命中错行
- 修法:转存按行分层落——linked 行快照存元数据原值;local 行内容进 og_*、source_paper_id 用不冒充 sha 的占位。一处改动消掉整串

**H3. 删号残留:死人分享永续公开 + MinIO 永久孤儿**(隐私/合规)
- DeleteUser 不清 user_library_*/library_shares(注释清单连 shares 三表都没列)、不清 MinIO;分享无 FK、PublicGetShare 不校验 owner 存活、owner 删号后失去唯一撤销通道;sharer 退化显示「用户#<内部id>」
- 修法:DeleteUser 事务加 `UPDATE library_shares SET status='revoked'` + best-effort 按 `papers/<uid>/` 前缀清对象

### 🟠 中危

**M1. 4 位提取码可在线爆破**:GET /public/share/:token 无任何限流(同文件相邻公开端点都有 30-120/min),错码不计数不熔断,32^4≈105 万组合;顺带可无限刷 view_count/access 流水。修法:per-IP 限流 + 同 token 错码计数熔断(参考验证码「错5作废」模式)

**M2. 分享人/访客 email 泄露**:resolveDisplayName 在 username 空时回落 **email 原文** → 公开落地页 + owner 的访问记录两处 PII 暴露

**M3. confirm/SSE 链路 5xx 回显 err.Error()**:writeConfirmError「落库失败: 」+err(会带出 SQL 1062 全文/MinIO endpoint)、emitError 两处 —— 违反项目 friendly-error 铁律(同模块 handler_pdf 是正确示范)

**M4. Add 幂等命中静默搬家**:已收藏论文再收藏且 folder 不同 → 无提示改归属;叠加 OnlineSearchTab 不查已收藏初始态 → 工作台里收藏早已在 A 夹的论文,显示未收藏、点了被搬到当前夹、toast 却说「已加入」

**M5.「根目录」僵尸语义**(判决:前端删候选):RowActionsMenu/BulkToolbar 仍提供「移到根目录」且 toast「已把 N 篇移到根目录」,后端实际落默认夹;archive/0033 已删光 NULL 行,`?folder=root` 过滤器与 root_count 永远为空,纯僵尸代码。前端删候选 + 收窄 folderId 类型为 number,后端 null 防御性改写可留

**M6. 手机 UA 正向分流丢 query**:router.tsx 正向闸只用 pathname → `/library?folder=5`、`?manage=` 深链全丢;反向闸反而做了专门改写。修法:mobileEquivalentPath 加对称特判(folder=N → /m/library/N),redirect 统一拼回 search

**M7. PaperWorkbenchDialog「挂载条件==open」违反 Radix 铁律**(全站点击失灵历史根因),注释还把它写成了约定;靠 BodyPointerLockGuard 兜底但 CLAUDE.md 明言别依赖

**M8. 删除/移动后页码不钳制**:第 2 页删完本页 → 空页 + EmptyState 误导「还没有论文」+ 分页器因 total<=pageSize 隐藏,用户无 UI 途径回第 1 页

**M9. 跨源重复无 DOI 归并**:同一论文可存 2-3 份(设计取舍),但 PDF 上传 decide 三源候选混排时 already_saved 只按 (source,id) 标注 → 已藏 stc 版再挑 olx 候选 = 两行且 PDF 挂错行;idx_user_doi 索引在而无任何 DOI 级提示

**M10. collection 分享超 500 篇静默截断**;MinIO 删除失败无对账(Tier3 reaper / tmp worker 均 TODO)

### 🟡 低危 / 打磨项

- 并发重复收藏撞唯一键回 500 而非幂等成功(relink 路径反而处理了 duplicate)
- SaveShare 逐篇独立事务+FOR UPDATE,500 篇转存 ≈ 千余次查询且串行阻塞该用户其他收藏
- SharedReceivePage 转存恒传 folder_id=undefined,全灌默认夹(前后端都支持选夹,能力闲置)
- library 两上传端点未挂 UploadLimitMiddleware(chunked 绕过 ContentLength 预检,幸有 nginx 50m 兜底);Check 端点 paper_ids 无上限
- 列表头「PDF x/N」用 pdf_url 计数,与 PdfChip 的 pdf_uploaded_at 口径同屏打架(项目内 3 处注释警告过不可这么用)
- 选择状态=当前页快照(翻页静默丢弃),shift 锚点跨页不重置
- 空态文案引导「拖动」但全 feature 无拖拽;「加入于 MM-DD」跨年无区分(注释承诺的 hover 年份未实现)
- 文件夹 50 上限前后端各自硬编码镜像;移动端无前置拦截
- claw 引用:INDEX.md 用完整 ids 重查与预算截断后的实际物化不一致(agent 会按清单读不存在的文件);dedup 论文双扣预算
- relink-search query 挂 ['library'] 失效前缀下,任何库写操作连带重拉三源检索
- MobileFolderPage 非法 :folderId 静默降级空列表而非 404(违反 detail-route-invalid-id-guard 约定)
- 移动端「取消收藏」实为整行删除(含 og 编辑与已传 PDF),警示不对等于 PC 的「PDF 一并删除」文案
- upload-resolve 整文件读内存(50MB/req)与 handler_pdf 的 TeeReader 流式不一致;move 用 Get→Put 流拷非 CopyObject
- token/提取码 randomFromAlphabet 取模偏差(token 熵冗余无碍;提取码本就弱)
- 0032 分享三表未显式 COLLATE(落 0900_ai_ci,与全库 unicode_ci 漂移)
- 文档漂移:model.go「0036 迁移」指错、og_* DDL 注释仍写「AI 提取」、origin 枚举漏 share、RootCount 遗留、device.ts:88 死注释、LibraryPage:463「论文行分享单篇」注释与桌面实现脱节

### 🔵 死列 / 价值闲置

| 列 | 状态 | 建议 |
|---|---|---|
| publication_types_json | 写恒空(payload 声明未填)+ 全库零读 | 删代码面(DB 列按迁移铁律保留) |
| pdf_url | 有数据、无任何用户可点入口(PdfChip「在线查找」disabled)、被误用计数 | 激活:missing 态提供「打开 OA 直链」——最低成本兑现高价值字段;或认死移除读面 |
| citation_count | 有展示面(分享页大字+排序+详情 seed)但**永不刷新** | 冻结快照无失效机制,且分享是「快照的快照」跨用户传播陈旧值;补 revalidate 或至少标注「收藏时数据」 |

### 🏗️ 架构面

- **prism 绕过 library.Reader 裸查 user_library_papers**(repository.go:499/518),与 Reader 的存在目的直接冲突;claw 走 Reader、prism 走裸表两种口径并存,schema 演进时 prism 是静默盲区
- **browser 跨 feature 直接 import features/library/api**,与 claw/home/search/journals 为守规专门复制 hook 的做法双标;PDF URL 还在 PdfBrowserPane 硬编码第二份
- folders 概要 hook 存在 5 份复制,靠 queryKey 字符串契约维持一致 → 应提升 shared/api(user-library-mutations 已有先例);注意 claw 隔离缓存的代价是 invalidateLibrary 不失效它的 picker 列表
- 分享生态位漂移:library_shares 已承载期刊(0038)等非库实体,tool 分享又不走短链 —— share 正在长成「通用短链基建」寄生在 library 域,中期建议拆独立域(entity_type 字段已预留)

---

## 7. 修复优先级建议

1. **P0(安全/合规)**:H1 single 分享服务端锚定;M1 公开分享端点限流+错码熔断;M2 email 脱敏;H3 删号联动 revoke 分享
2. **P1(数据完整性)**:H2 转存按分层落列(一处改动消掉守卫误判/relink 丢数据/sha 漂移整串);M4 Add 幂等不再静默搬家(或 OnlineSearchTab 补已收藏态);并发收藏 1062 回落幂等
3. **P2(体验)**:M5 删「根目录」候选;M6 分流保 query;M8 页码钳制;PDF 计数口径;转存支持选夹
4. **P3(架构/清账)**:prism 收编进 Reader;browser 违规 import 提升 shared;死列清理;M7 弹窗挂载模式;MinIO 对账 reaper
