# 情报功能 · 移动端展示设计

> 主题:学术情报(Minicod news webhook)在移动端的 UX 设计 —— 竞品调研结论 + 与本仓库移动 feed 架构的接入方案。
>
> 上游 = Minicod news webhook(server-to-server,事件 `news.created` / `news.updated` / `news.heat`);本侧落库 `news_items` + slug 详情页 + 移动「刷新流」+ PC 首页情报区 + SEO/GEO。本文只覆盖**移动端展示 + 与 feed 架构接入**,后端 webhook 接收/验签/幂等/落库属另文(本文只在「接入点」处引用)。
>
> 数据字段(item):`id` `slug` `url` `report_id` `report_type`(hourly=快讯 / daily=今日要览)`section`(major-event / china-policy / top-journal / other)`section_label` `title` `summary` `body_md` `body_html` `credibility_note` `original_date` `published_at` `sources[{url,label}]` `is_featured` `score`(0-10) `view_count` `heat_external`(0-100) `heat_trend` `heat_measured_at`。

---

## 0. TL;DR(结论先行)

1. **默认形态 = feed 卡片列表,不是抖音式全屏沉浸。** 资讯是「扫描-选择」心智(用户主动挑要点看),全屏沉浸只适合「内容即终点」的强消费(视频/kill time)。沉浸式纵滑留给**单篇 slug 详情页串联相邻情报**,列表层保持卡片/榜单(竞品共识 + BBC/TandF 2026 学界结论)。
2. **移动端入口 = `/m/feed` 顶部第三个 tab(`intel`),不开独立 `/m/news` 路由。** 复用现有论文/期刊 tab 的横滑切换与壳,最快上线;路由独立性是后话。`FeedTopTabs` 现已为情报留好 placeholder(`frontend-user/src/features/mobile/components/FeedTopTabs.tsx:11` `{ key: 'intel', label: '情报', to: null }`),把 `to` 从 `null` 改成 `'/m/feed/news'` 即接通。
3. **情报 feed 不能套用 `(seed,page)` 随机契约。** 现有论文/期刊 feed 是「随机种子驱动、无标准全序、二次进入无缝复用旧内容」;情报有**真实发布时间 + 站外热度**,是确定性时间序/热度序、要求实时性。→ 用 `(sortBy, page)` 纯函数取代 `(seed, page)`,`offset=(page-1)*PAGE_SIZE`;**不持久化内容**(只持久化「上次选的子 tab」),`staleTime` 短(5min)。`VerticalSwipeFeed` 引擎本身完全可复用(它对数据来源无感知)。
4. **子 tab(情报内部)推荐三选一收敛为两个 + 二级 chip:** 顶级三 tab 已是论文/期刊/情报,情报内部**再分子 tab 会嵌套过深**。推荐:情报 tab 内**先做单一时间序流(快讯+要览混排,按 `published_at` DESC)**,`report_type` 与 `section` 用卡片上的彩色 chip 区分;热榜作为第二阶段的子 tab(按 `heat_external` DESC)。备选见 §2。
5. **卡片以「纯文卡」为主**(学术情报多无大图):`section_label` chip → `title`(语义 `h2`/`h3`,与 SEO headline 一致)→ `summary`(2-3 行截断)→ meta 行(相对时间 + 主来源 label + 仅飙升时出现的 `heat_trend` token)。`is_featured` 置顶大卡(≤2~3 条),`credibility_note` 作二级折叠信息,**不做 NewsGuard 式红绿盾**。
6. **详情页 `/news/:slug` 同 URL 响应式**(不重定向,保 SEO/GEO),桌面走 `AppShell`、移动走 `MobileShell`(同 `paper`/`journal`/`library` 详情既有模式);分享复用全局 `ShareSheet`(`frontend-user/src/stores/share.store.ts`)。
7. **性能/动画铁律照搬**:`LazyMotion(domMax)` 已在 `MobileShell` 顶层(`frontend-user/src/features/mobile/layouts/MobileShell.tsx:72`),情报页树内只用 `m.*`;`VerticalSwipeFeed` 自带 `RENDER_WINDOW=3` 窗口化 + 半批预取;卡片用 `memo` + `renderPeek` 下一条预览,与 `PaperFeedCard` 同构。

---

## 1. 竞品 UX 提炼(逐条带「我们是否采用 + 为什么」)

调研覆盖今日头条(信息流四卡型)、抖音(沉浸式上下滑)、微博热搜 / 百度热搜 / 知乎热榜(榜单)、财经 7×24(东方财富/新浪/华尔街见闻,快讯时间轴)、36 氪/虎嗅(快讯独立 tab)、Google News / Gemini Daily Brief / Scholar Inbox(每日锚点)。学界/工程参照:TandF 2026《The UX of TikTok and Its Compatibility with News》、BBC News swipe 原型复盘、GetStream TikTok feed 工程经验、NN/G、W3C/USWDS 卡片可访问性、Google NewsArticle schema。

| # | 竞品形态 | 提炼 | 我们是否采用 + 为什么 |
|---|---|---|---|
| 1 | **榜单 · 前三名领奖台**(微博/百度/知乎/抖音直播榜) | 前三名金/银/铜(或红/橙/黄)方徽标突出仪式感;第 4 名起浅灰圆角数字。把头部曝光从「第一」扩展到「前三」。 | **采用(第二阶段·热榜子 tab)。** 我们 `heat_external`(0-100)直接作排序键,前三大徽标(1 红/2 橙/3 黄),`is_featured` 在榜内置顶并加「重磅/头条」标。一阶段先不做榜,避免阻塞 MVP。 |
| 2 | **榜单 · 热度值格式化 + 趋势箭头/标签** | 序号 + 标题 + 趋势(↑/↓)+ 热度值(「万」为单位、对数平滑);高热挂「沸/爆/新」彩标;微博 2025 起前 50 加「解释标签」说明上榜原因。 | **采用(改造)。** `heat_external` 用 **0-100 原值**(进度条/数字徽标),比「万在看」更克制、契合学术调性,**不映射成「万」**。`heat_trend` **只在飙升时**出红色 ↑ + 「飙升」chip,平稳态不显箭头(避免噪声)。`credibility_note` 充当类似「解释标签」的可信度小注。 |
| 3 | **实时快讯 · 时间轴极简流 + 相对时间 + 日期分组**(财经 7×24 / 36 氪快讯 tab) | 左侧竖时间轴;每条极简纯文卡(无图/小图);顶部「N 条更新点击查看」增量提示;相对时间(刚刚/X 分钟前 → HH:mm → 昨天/前天 → 日期);按「今天/昨天」吸顶分组;重要快讯红字加粗标星。 | **采用(MVP 主形态的时间序内核)。** `report_type=hourly` 走这条;`published_at` → 相对时间 + 日期吸顶分组;`is_featured`/高 `score` → 红字加粗标星;`news.heat`/`news.created` 增量到达驱动顶部「有 N 条新情报」提示。**注意**:在 `VerticalSwipeFeed`(整屏 snap)里「竖时间轴」要弱化为卡片角标的相对时间(整屏卡不适合左侧贯穿轴);若要原汁原味时间轴,需在情报 tab 内提供「列表视图」开关(见 §2 备选)。 |
| 4 | **信息流 · 四卡型 + 标题 2 行 + 来源/时间/互动同行**(今日头条) | 纯文/左文右图/大图/三图,按内容自适应;标题约 2 行截断;来源 chip + 时间 + 互动数在底同一行;缩略图右侧圆角;每屏 4-6 条最优;核心优先、辅助折叠(F 型阅读);置顶 ≤2 条。 | **采用(卡片解剖直接照搬,见 §3)。** 学术情报多无大图 → **以纯文卡为主**;底部行 = `section_label` chip + 相对时间 + `heat_external` 小热度标 + `view_count`;`sources[0].label` 作来源 chip。但**整屏 snap feed 一屏一条**(抖音式),与「每屏 4-6 条」是两种范式 —— 我们沿用现有 `VerticalSwipeFeed` 的一屏一条(与论文/期刊一致),把「每屏 4-6 条」作为 §2 备选「列表视图」的参数。 |
| 5 | **沉浸式上下滑(抖音式全屏)** | 整屏 snap、单卡聚焦、预加载下 2-3 屏、正负信号、70/30 熟悉/探索比。 | **部分采用。** 引擎(`VerticalSwipeFeed` = embla 纵轴整屏 snap + 窗口化 + 半批预取)**复用**,与论文/期刊 feed 同一交互语言、零学习成本。但**不把它当资讯主承载的理由仍成立**:TandF 2026 + BBC 复盘指出全屏 swipe 对文字密集资讯有结构性缺陷(长正文塞不进一屏、嵌入媒体抢触摸、100vh 地址栏抖动、严肃内容打断 flow)。我们的对策:**卡片只放 `summary`(短),长 `body_html` 一律进 `/news/:slug` 详情页**;`daily`(长)更偏「点开看」,`hourly`(短)更适合刷流。 |
| 6 | **分区 tab 分层(顶级 tab 少、分区下沉二级)** | 成熟产品控制顶级 tab 数;过多分区下沉为二级 chip/筛选;36 氪把「快讯」单提一 tab 体现独立心智。 | **采用(关键决策)。** 顶级 tab 已是「论文/期刊/情报」三个,**情报内部不再叠三个顶级感的子 tab**;`section`(major-event/china-policy/top-journal/other)做**情报 tab 内的二级 chip 横滑筛选**,不占顶级。`report_type` 用卡片彩 chip 区分(快讯/今日要览),不单独成 tab(MVP)。 |
| 7 | **头条/Featured 视觉强调** | 置顶 + 加大卡 + 配图 + 红角标/加粗;置顶 ≤2 条保稀缺;榜内头条额外加重磅标。 | **采用。** `is_featured=true` → feed 顶部置顶大卡(标题加粗放大、有图走大图、加「重磅」红角标),数量限 ≤2~3;热榜 tab 中 featured 额外挂标;高 `score`(0-10)可作准头条参与置顶排序(不展示给用户)。 |
| 8 | **每日锚点(Daily Digest)+ 实时快讯双节奏**(Google News「今日导览」/ Gemini Daily Brief / Scholar Inbox) | 「每日要览」与「实时快讯」做成两个视觉/入口分明的容器,而非混排;固定每日节奏更养习惯(Scholar Inbox 实证 daily digest → 35% 月活留存);SmartNews 教训:算法流会淹没 breaking,需更强区分。 | **部分采用(分阶段)。** 我们的 `report_type`(daily/hourly)天然对应双节奏。**MVP 阶段先混排时间序**(用卡片 chip 区分两态)以最快上线;**第二阶段**再把「今日要览」抽成情报 tab 内独立子 tab 或顶部锚点(daily 当天聚合卡)。理由:双容器是更优终态,但 MVP 不应一上来就引入两层 tab 嵌套。 |
| 9 | **文章级可信度标签(微博「解释标签」)优于来源级红绿盾** | NewsGuard 营养标签/盾牌色是来源级;NYU CSMaP/Science Advances 实证来源级标签平均效果有限(仅改善「信息饮食最差」人群);文章级解释性文字更可取。 | **采用。** `credibility_note` 做**文章级二级信息**(列表可折叠/详情页常驻的「可信度说明」),配 `sources[]` 来源 chip(`rel="nofollow noopener"`);**不做醒目红绿盾**。来源是学术期刊/官方时,在 `label` 上强化可信感。 |
| 10 | **卡片信息层级 image→title→summary→meta + 语义 heading** | W3C/USWDS:卡片标题须是真实 `heading`(`h2`/`h3`),屏幕阅读器顺序与视觉一致,整卡可点要正确 ARIA;NN/G 移动新闻卡 = 标题+缩略+来源+时间戳=天然点击区。 | **采用。** 渲染顺序严格 `section_label` chip → `title`(`h2`/`h3`,与 SEO headline 一致)→ `summary`(截断)→ meta;整卡可点给正确 ARIA;`score` 仅用于内部排序不展示。沿用 `PaperFeedCard` 已用 `<h2>` 的做法(`frontend-user/src/features/mobile/components/PaperFeedCard.tsx:101`)。 |

---

## 2. 信息架构推荐

### 入口决策:`/m/feed` 新增 tab(✅推荐) vs 独立 `/m/news`

**推荐:`/m/feed` 顶部新增第三个 tab `intel`,路由 `/m/feed/news`。**

- `FeedTopTabs` 已为情报留位:`frontend-user/src/features/mobile/components/FeedTopTabs.tsx:8-12` 的 `TABS` 数组里 `{ key: 'intel', label: '情报', to: null }`;把 `to` 改成 `'/m/feed/news'` 即接通,点击不再 `comingSoon()`(同文件 `:46-49`)。
- 横滑互通:论文 `←` 期刊 `←` 情报(三段循环)。现状只有两段(`FeedPage.tsx:62-64` 论文左滑→期刊;`JournalFeedPage.tsx:56-58` 期刊右滑→论文)。情报接入后:期刊左滑→情报、情报右滑→期刊(可选再做情报左滑→论文形成环)。
- 设备分流:在 `/m/feed` 下作 tab **无需改** `device.ts` 的 `MOBILE_EQUIVALENTS`(`frontend-user/src/shared/lib/device.ts:79-95`)。只有详情 `/news/:slug` 走同 URL 响应式,也不进映射表(见 §5)。

**备选:独立 `/m/news` 路由模块。** 模块边界更清晰(情报数据/排序与 feed 完全异构),但要:① `device.ts` `MOBILE_EQUIVALENTS` 加 `{ prefix: '/news', target: '/m/news' }`;② 底部导航是否新增「情报」入口(`MobileBottomNav.tsx:17-43` 现为 浏览/Claw/功能/我的,加第五个会拥挤);③ 横滑互通逻辑要跨模块。**结论:先 tab(MVP),数据独立性确实顶不住再升级为独立路由。**

### 子 tab:实时快讯(时间序) / 热榜(热度序) / 分区

**推荐方案(分阶段收敛):**

- **MVP(第一阶段):情报 tab 内单一时间序流。** 按 `published_at` DESC,`hourly`+`daily` 混排;`report_type` 与 `section` 用卡片彩 chip 区分。`section` 四分区做**二级 chip 横滑筛选**(`全部 / 重大事件 / 国内政策 / 顶刊速递 / 其他`),不占 tab。理由:三个顶级 tab 之下再叠子 tab = 嵌套过深;先把「能刷到最新情报」跑通。
- **第二阶段:加「热榜」子 tab。** 情报 tab 顶部出现两个轻量子 tab `实时 | 热榜`(pill 切换,非顶级 tab):
  - `实时` = `published_at` DESC(承接 MVP)。
  - `热榜` = `heat_external` DESC + 前三领奖台 + 飙升标(竞品 #1/#2)。
- **第三阶段(可选):把 daily「今日要览」抽成锚点。** 在情报流顶部放一张「今日要览」聚合大卡(当天 `report_type=daily` 条目),点开进 daily 详情或专页;承接竞品 #8 的每日锚点。

**daily(今日要览)与 hourly(快讯)如何并存:**

| 阶段 | daily | hourly | 区分手段 |
|---|---|---|---|
| MVP | 混入时间序流 | 混入时间序流 | 卡片 `section_label`/`report_type` 彩 chip(如「今日要览」金 chip vs「快讯」常规 chip) |
| 二阶段 | 仍可混排,或在热榜外保留 | 时间序流主力 | 子 tab 不按 report_type 切(按时间/热度切);report_type 仍是卡片 chip |
| 三阶段 | 顶部「今日要览」锚点大卡 | 时间序流 | daily 升格为锚点,hourly 留流 |

> 不推荐「实时快讯 / 今日要览」**直接作为两个子 tab**:它们是「同一批情报的两种产出节奏」而非两类内容,用户更想要「最新 + 最热」两个维度的切换(时间序/热度序),而不是按产出节奏切。report_type 作卡片标签即可。

### 最终信息架构(推荐)

```
/m/feed
├─ tab: 论文   → /m/feed            (FeedPage,现有)
├─ tab: 期刊   → /m/feed/journals   (JournalFeedPage,现有)
└─ tab: 情报   → /m/feed/news       (NewsPage,新增)
       ├─ [MVP]      时间序流(published_at DESC,hourly+daily 混排)
       │              + 二级 chip:全部/重大事件/国内政策/顶刊速递/其他(section 筛选)
       ├─ [二阶段]   子 tab:实时(时间序) | 热榜(heat_external DESC + 领奖台)
       └─ [三阶段]   顶部「今日要览」锚点大卡(daily 聚合)
```

---

## 3. 卡片解剖

### 情报卡 vs 论文卡(逐视觉元素映射字段)

参照 `PaperFeedCard`(`frontend-user/src/features/mobile/components/PaperFeedCard.tsx`)的框架语言:Identity 行 + 标题/作者 + 徽章排 + 指标网格 + 摘要 + 右侧浮动操作栏(Action Rail)。情报卡**复用同一框架**,但语义替换如下。

| 视觉元素 | 论文卡(现有) | 情报卡(新)→ 字段 | 说明 |
|---|---|---|---|
| **顶部 Identity 行** | `JournalCover`(venue 字标) + 来源/年份(`PaperFeedCard.tsx:81-97`) | `section` 彩色徽标 + `section_label` 文案 + 相对时间(`published_at`) | 用 `section` 取色(major-event 红 / china-policy 蓝 / top-journal 绿 / other 灰),`section_label` 作可见文案 |
| **标题** | `<h2 line-clamp-3>` `paper.title`(`:101`) | `<h2 line-clamp-3>` `title` | 语义 heading,与 SEO `headline` 一致;`is_featured` 时放大加粗 |
| **副行** | 作者行 `formatAuthors`(`:104`) | `summary`(2-3 行 `line-clamp`) | 情报无作者,改放摘要 |
| **徽章排** | 开放获取/年份/学科 Pill(`:110-122`) | `report_type` chip(快讯/今日要览)+ 飙升 token(仅 `heat_trend` 超阈)+ `is_featured`「重磅」红角标 | 平稳态不显趋势箭头 |
| **指标区** | 2×2 网格:被引/参考文献/高影响引用/年份(`:124-136`) | 简化为单行 meta:`heat_external`(0-100 进度条/数字) + `view_count` + `score`(内部排序,不展示) | 情报不需要 2×2 重网格,降权为底部 meta 行 |
| **正文/摘要** | `paper.abstract` `line-clamp-[8]`(`:138-153`) | `summary`(已在副行)+ `credibility_note`(二级折叠「可信度说明」) | 长 `body_html` 不进卡片,进详情页 |
| **来源** | venue 字标 | `sources[0].label` 来源 chip(整卡进详情看全部 `sources[]`) | `rel="nofollow noopener"` |
| **Action Rail** | 作者/收藏/分享/引用(`:155-185`) | 分享(复用 `openShare`)/(可选)收藏 | 分享走全局 `ShareSheet`;情报收藏是后续扩展 |
| **双击交互** | 双击收藏 ❤️(`useDoubleTapFavorite`,`:59`) | 暂不做(情报收藏未定),保留卡片整体可点进详情 | — |

**关键差异总结:** 论文卡是「重指标 + 操作密集」(被引/引用/收藏/引用格式);情报卡是「时间敏感 + 轻指标」(相对时间 + 热度 + 可信度),正文短摘要 + 点开进详情。两者共用 `VerticalSwipeFeed` 引擎与 `renderCard`/`renderPeek` 回调(`VerticalSwipeFeed.tsx:16,47`),框架语言一致。

### 榜单项样式(热榜子 tab · 第二阶段)

```
┌─────────────────────────────────────────┐
│ [①]  标题(2 行截断)…………………  ▕███▌ 87  │   ← 前三:红/橙/黄渐变方徽标 + heat_external
│      section_label · 2 小时前         🔥飙升 │   ← heat_trend 超阈才出 🔥/↑ chip
├─────────────────────────────────────────┤
│ [4]  标题………………………………  ▕██▏ 52     │   ← 第 4 名起:浅灰圆角数字徽标
│      section_label · 5 小时前                │
└─────────────────────────────────────────┘
```

- 排名徽标:`is_featured` 在榜内额外挂「重磅」标;并列时用 `score`(0-10)作二级排序键。
- 热度:`heat_external`(0-100)= 细进度条 + 数字,**不换算「万」**。
- 趋势:`heat_trend` 超阈 → 红 ↑ + 「飙升」chip;平稳不显。
- 顶部:`heat_measured_at` → 「X 分钟前更新」佐证实时性。

### 快讯项样式(时间序流 · 时间轴)

`VerticalSwipeFeed` 整屏 snap 模式下,时间轴弱化为卡片角标的相对时间(整屏卡不适合贯穿竖轴):

```
┌─────────────────────────────────────────┐
│ ● 重大事件 · 刚刚                          │   ← section 圆点 + section_label + 相对时间(吸顶分组「今天」)
│   标题(h2,加粗)                          │
│   summary 摘要两到三行截断………………       │
│   来源:Nature · 热度 ▕██▏62              │   ← sources[0].label + heat_external
└─────────────────────────────────────────┘
```

> 若 §2 备选采用「列表视图」(每屏 4-6 条而非整屏一条),则可还原竞品 #3 的左侧贯穿竖时间轴 + 「今天/昨天」吸顶分组 + 顶部「N 条更新」增量提示。整屏 snap 模式下用相对时间角标 + 分组吸顶替代。

---

## 4. 与现有架构接入

### 4.1 `(seed,page)` 纯函数契约的冲突点与解法(明确结论)

**现有契约**(论文/期刊 feed):
- `(seed, page) → 固定内容` 纯函数(`feed.ts:42-55` `planPage`、`journal-feed.ts:34-51` `fetchJournalFeedPage`)。`seed` 进 `queryKey`(`feed.ts:60` `paperFeedKey`),换 seed = 新查询 = 刷一批。
- `seed` 45min 复用(`feed-seed.ts:13,46-50`),期间 `refetchOnMount:false` + `staleTime:Infinity`(`feed.ts:107-109`)→ 二次进入无缝显示旧内容。
- 下拉刷新**必须换 seed**(`FeedPage.tsx:67-70` `rotateFeedSeed` + `removeQueries`),不能 refetch 同 seed(同 seed 拉到同样的空页)。
- 前 3 页持久化(`feed-cache.ts:18` `MAX_PAGES=3`、`FeedPage.tsx:47-51`),位置持久化(`feed-position.ts`)。

**冲突点(情报与上述契约不兼容):**

| # | 现有契约 | 情报需求 | 冲突 |
|---|---|---|---|
| C1 | `seed` 驱动随机化(主题/源/offset 打乱),无标准全序 | 情报有真实**时间序/热度序**,需要确定且最新 | 随机化与「最新」直接矛盾 |
| C2 | `seed` 45min 复用 + `staleTime:Infinity` + 不持久化新内容 | 实时性强,二次进入应能看到**新到的情报** | 极长缓存会让用户看不到刚发布的情报 |
| C3 | 下拉刷新换 seed = 换一批「不同的随机内容」 | 下拉刷新应是「拉取最新」(回到时间序顶部),不是换随机 | 「换 seed」语义不对 |
| C4 | 内容持久化进 localStorage(`feed-cache`) | 实时内容更新快,不宜持久化(会显示过期情报) | 持久化反成累赘 |
| C5 | 位置持久化「接着上次往后刷」(`feed-position`) | 时间序里「接着上次往后」会**错过新发布的顶部内容** | 位置恢复策略需调整 |

**解法(逐条结论):**

- **C1 → 用 `(sortBy, page)` 取代 `(seed, page)`。** 新建 `frontend-user/src/features/mobile/api/news-feed.ts`,导出 `useNewsFeed(sortBy: 'published' | 'heat')`(`useInfiniteQuery`),`queryKey = ['mobile','feed','news', sortBy]`(三段式 + sortBy 维度,**不含 seed**)。分页固定公式 `offset = (page-1) * NEWS_FEED_PAGE_SIZE`(10),后端 `/public/news/list?sort=published_at|heat_external&page=...`。`VerticalSwipeFeed` 引擎对数据来源无感知 —— `items`/`onPrefetch`/`canPrefetch`/`pageSize` 接口照传即可(`VerticalSwipeFeed.tsx:12-54`)。
- **C2 → 短 `staleTime` + `refetchOnMount` 受控。** `staleTime: 5 * 60_000`(5min,非 `Infinity`),`refetchOnWindowFocus: false`;切 tab 回来是否自动拉由产品定(建议 `refetchOnMount: false` 避免脚下重排,靠下拉/顶部「N 条更新」提示主动拉)。**不复用 `feed-seed.ts`**。
- **C3 → 下拉刷新 = `invalidateQueries` 同一 key**(不是换 seed)。情报是确定全序,refetch 同 `(sortBy)` 会拿到「含最新条目」的第一页 —— 与论文 feed「同 seed refetch = 同样空页」的坑**不同**,因为情报第一页内容会随时间变化(新条目排到顶)。`onEmptyRetry` 回落 `refetch`(不需要 `onEmptyRetry` 专门换 seed)。
- **C4 → 情报 feed 不接 `feed-cache.ts`**(不调 `persistFeedPages`/`hydrateFeed`)。可选:只用一个轻量 store/localStorage 记「上次选的子 tab(实时/热榜)」与「滚动到第几条」,不存内容正文。
- **C5 → 位置恢复策略:时间序默认回顶部(看最新),不强制「接着上次往后」。** `VerticalSwipeFeed` 的 `initialIndex` 传 `0`(或仅在「热榜」这种相对稳定的序里恢复位置);时间序流每次进入回顶部更符合资讯心智。`onIndexChange` 可只用于「N 条更新」提示的对照,不写 `feed-position`。

> **一句话结论:复用 `VerticalSwipeFeed` 引擎(纯展示,数据无关),不复用 `feed-seed`/`feed-cache`/`feed-position` 三件套。** 情报数据层 `news-feed.ts` 与 `feed.ts`/`journal-feed.ts` 平级、逻辑独立、互不耦合(符合 `frontend-user/CLAUDE.md` 分层与「业务 API 写在 features/<domain>/api/、导出 hook」约定)。

### 4.2 LazyMotion / 虚拟化 / MobileShell tab / 底部导航 接入点(file:line)

| 接入项 | 现状 file:line | 情报接入动作 |
|---|---|---|
| **LazyMotion(domMax)** | `frontend-user/src/features/mobile/layouts/MobileShell.tsx:72`(顶层 `<LazyMotion features={domMax}>` 包整个移动树) | **零动作**。`/m/feed/news` 在 `MobileShell` 树内,情报页/卡片树内一律用 `framer-motion` 的 `m.*`(命中瘦身),**不再额外包 LazyMotion**。若情报弹窗(如分区筛选 bottom sheet)挂在 `MobileShell` 外才需自带 LazyMotion(铁律,见 MEMORY `collect-folder-picker-2026-06`)。 |
| **虚拟化/窗口化** | `VerticalSwipeFeed.tsx:10` `RENDER_WINDOW=3`(只渲当前 ±3,远处空壳 + `content-visibility:auto`,`:186-193`) | **复用**。情报卡走 `renderCard`,窗口化白拿;无需 `@tanstack/react-virtual`(整屏 snap 已是单卡聚焦)。 |
| **半批预取** | `VerticalSwipeFeed.tsx:130-135`(剩余未看 ≤ `ceil(pageSize/2)` 触发 `onPrefetch`) | **复用**。`useNewsFeed` 提供 `fetchNextPage`/`hasNextPage`/`isFetchingNextPage`,照 `FeedPage.tsx:55-58,85` 接 `onPrefetch`/`canPrefetch`。 |
| **MobileShell 顶层 tab(版块转场)** | `MobileShell.tsx:62` `sectionKey`(取前两段路径)+ `:77-88` `AnimatePresence mode="wait"` opacity 淡入 | **零动作**。`/m/feed/news` 与 `/m/feed`、`/m/feed/journals` 同属 `/m/feed` 版块(`sectionKey='/m/feed'`)→ tab 间切换**即时不淡入**(版块内 key 不变,符合设计意图:tab/钻取更跟手)。 |
| **Feed 顶栏 tab** | `FeedTopTabs.tsx:8-12`(`intel` placeholder,`to:null`)+ `:46-49`(`to` 为 null 时 `comingSoon()`) | 改 `intel.to = '/m/feed/news'`;`NewsPage` 渲 `<FeedTopTabs active="intel" />`(`active` 类型 `FeedTabKey` 已含 `'intel'`,`:14`)。搜索 icon 跟随 tab:情报 tab 当前回落搜论文(`FeedTopTabs.tsx:78-81`),可后续接情报搜索。 |
| **路由注册** | `frontend-user/src/features/mobile/routes.tsx:15-35`(`mobileRoutes`,含 `feed`/`feed/journals`) | 加 `{ path: 'feed/news', lazy: () => import('./pages/NewsPage').then((m) => ({ Component: m.NewsPage })) }`。 |
| **横滑互通** | `FeedPage.tsx:62-64` / `JournalFeedPage.tsx:56-58`(`useHorizontalSwipe`,被动检测,不干扰纵向 embla) | 期刊页加 `onSwipeLeft → /m/feed/news`;`NewsPage` 加 `onSwipeRight → /m/feed/journals`(可选再做 `onSwipeLeft → /m/feed` 形成环)。 |
| **底部导航** | `MobileBottomNav.tsx:17-43`(浏览/Claw/功能/我的) | **零动作**(情报在「浏览」`/m/feed` 下,`startsWith('/m/feed')` 高亮已覆盖,`:57`)。不新增第五个底部入口(会拥挤)。 |
| **页面级 lazy** | 现有页均 `lazy()`(`routes.tsx:19-28`) | `NewsPage` 走页面级 lazy(铁律「页面级 lazy 是默认」,`frontend-user/CLAUDE.md` §7)。`NewsCard` 组件小,内联 `features/mobile/components`。 |
| **路由顶级段校验** | `frontend-user/src/shared/lib/route-validation.ts:16` `KNOWN_FIRST_SEGMENTS` | 若开 PC 端 `/news`(详情/列表)→ 把 `'news'` 加进 `KNOWN_FIRST_SEGMENTS`(铁律,避免新顶级路由被误判假 404,见 MEMORY `stale-chunk-vs-real-404`)。`/m/feed/news` 在 `m` 段下,**不需要**改这里。 |

---

## 5. 移动详情页(同 URL 响应式,保 SEO)与分享

### 详情页:`/news/:slug` 同 URL 响应式(不重定向)

- **同 URL 响应式**(对齐 paper/journal/library 详情既定模式,MEMORY `mobile-detail-and-share-2026-06`):一个 `/news/:slug` 路由,桌面挂 `AppShell`、移动由 `device.ts` 判断响应式降级渲染 —— **不做 `/m/news/:slug`,不重定向**(保 SEO/GEO,搜索引擎抓到的就是 canonical URL)。
  - 这就是为什么详情页**不进** `MOBILE_EQUIVALENTS` 映射表(`device.ts:79-95`):映射表只管「有移动对等页才跳」,详情页同 URL 响应式不需要跳。
- 前端:`features/news/pages/NewsDetailPage.tsx` 走 `AppShell`(PC 路由 `newsRoutes` 在 `app/router.tsx` `AppShell` children 下,与 `paperRoutes` 等平级);移动响应式由组件内 `isPhoneDevice()` / 响应式 Tailwind 类适配。
- 正文真源:`body_html`(已是绝对 URL,可直接渲)由后端公开 API `GET /api/v1/public/news/:slug` 返回;**前端不打包正文 TS**(铁律 `content-single-source-backend`:正文单一真源在后端,前端只取数渲染,对齐 `frontend-user/src/features/help/api/content.ts` 的 `useArticle` 模式)。
- 列表→详情转场:`MobileShell.tsx:60-62` 注释明确「列表↔详情 key 不变 → 即时切换不淡入」;`/news/:slug` 与 `/m/feed/news` 不同 `sectionKey`(`news` vs `feed`),会有一次版块淡入 —— 这是合理的(从浏览版块进详情版块)。

### SEO/GEO(本文只点接入位,详见情报 SEO 专文)

| 能力 | 现有 file:line(参考既有 content 文章实现) | 情报接入 |
|---|---|---|
| 公开取数 | `frontend-user/src/features/help/api/content.ts:64-73`(`useArticle`) | `features/news/api/news.ts` 仿造 `useNewsDetail(slug)` 走 `/public/news/:slug` |
| 后端 SSR 注入全文进 noscript | `backend/internal/config/handler_ssr.go:139` `injectRouteNoscript` + `:146-154` 博客/资源把全文写进 noscript | `/news/:slug` 路由同样把 `body_html` 写进 `<noscript>`(`insertNoscriptBlock`,`handler_ssr.go:472-483`),爬虫首抓即得全文 |
| SEO meta + JSON-LD | `handler_ssr.go:150-154` `injectArticleSEOMeta`("blog"/"resources") | 新增 `injectArticleSEOMeta(..., "news", slug, path)` 或专用 `injectNewsSEOMeta`;JSON-LD 用 **`NewsArticle`**(`headline=title` 须与可见标题一致、`description=summary`、`articleBody=body_html`、`datePublished=published_at`、`dateModified=updated_at`、`author`/`publisher`、`sources` → `citation`/`sameAs`);`report_type=hourly` 突发条目尤其适合 NewsArticle(publish date 即价值) |
| Sitemap | `backend/internal/seo/content_articles.go:88-122`(`AllBlogPaths`/`MaxArticleLastMod` 等) | 后端按 `news_items` List 动态产出 `/sitemap_news_*.xml`(`<loc>/news/:slug</loc>`,`priority` 0.7);`is_featured` 条目优先走主动推送(`internal/seosubmit`) |
| 点击 tier 计数 | `backend/internal/seo/`(papers/authors/journals 三类 + content articles) | 新增 `news.go`(`RecordNewsDetailClick`)按 tier 记入 `seo_articles` 或独立 `seo_news` |

> **铁律对齐:** 把 news 作为 `internal/content` 模块新增 `kind` 或独立 `internal/news` 模块均可,但**正文单一真源必须在后端**(go:embed/DB),`body_html` 由后端直出 SSR + API,**绝不往前端 TS 写正文**(MEMORY `content-single-source-backend`)。

### 分享

- 复用全局 `ShareSheet`(`frontend-user/src/stores/share.store.ts:18-22` `useShareSheet` + `MobileShell.tsx:96` 已挂 `<ShareSheet>`)。
- `ShareTarget` 现有 `kind: 'single'(paper) | 'journal' | 'collection'`(`share.store.ts:2,15`)→ **新增 `kind: 'news'`**(`@/shared/api/types` 的 `ShareTarget` union 加一支),`ShareSheet.tsx` 加 news 分支(标题=`title`、链接=`/news/:slug`、海报可选)。情报卡 Action Rail 与详情页分享按钮统一 `openShare({ kind: 'news', item })`。
- 分享 taxonomy 沿用既有:链接 + 海报 + 二维码(`shared/components/share/{ShareSheet,SharePoster,ShareCard}.tsx`)。

---

## 6. 落地步骤清单(file 级)+ 开放问题

### 第一阶段(MVP):移动情报 feed(时间序)

前端(`frontend-user/`):
1. `src/features/mobile/api/news-feed.ts`(新建)— `useNewsFeed(sortBy)`(`useInfiniteQuery`,`queryKey=['mobile','feed','news',sortBy]`,`offset=(page-1)*10`,`staleTime:5min`,**不接 feed-seed/cache/position**);`flattenNewsPages`(跨页去重 by `id` + 过滤无 `title`);`NEWS_FEED_PAGE_SIZE=10`。
2. `src/features/mobile/components/NewsCard.tsx`(新建)— `memo`;`section` 彩 chip + `section_label` → `<h2>` `title`(line-clamp-3)→ `summary`(line-clamp 2-3)→ meta 行(相对时间 + `sources[0].label` + `heat_external` + 飙升 token);`is_featured` 置顶大卡变体;Action Rail 仅分享(`openShare({kind:'news',item})`)。日期相对时间用 `date-fns`(已装,`frontend-user/CLAUDE.md` §2)。
3. `src/features/mobile/components/NewsPeek.tsx` 或内联 `renderPeek`(下一条预览,仿 `FeedPage.tsx:106-120`)。
4. `src/features/mobile/pages/NewsPage.tsx`(新建)— `<FeedTopTabs active="intel" />` + `<VerticalSwipeFeed>`(`renderCard=NewsCard`、`renderPeek`、`initialIndex=0`、不持久化);`useHorizontalSwipe` `onSwipeRight → /m/feed/journals`;下拉刷新 = `invalidateQueries`(同 key,非换 seed);二级 `section` chip 行(MVP 可后置)。
5. `src/features/mobile/components/FeedTopTabs.tsx:11` — `intel.to` 改 `'/m/feed/news'`(去掉 `to:null`/`comingSoon` 分支自然生效)。
6. `src/features/mobile/pages/JournalFeedPage.tsx:56-58` — 加 `onSwipeLeft → /m/feed/news`(三段横滑)。
7. `src/features/mobile/routes.tsx:28` 后 — 加 `{ path: 'feed/news', lazy: () => import('./pages/NewsPage').then((m) => ({ Component: m.NewsPage })) }`。

后端(`backend/`,本文只点接口,详见接收专文):
8. `internal/news/{model.go,handler.go,service.go,repository.go}`(新建)— `GET /api/v1/public/news/list?sort=published_at|heat_external&page=&page_size=`(公开、无鉴权)返回卡片字段(不含 `body_html`,减体积);webhook 接收/验签/幂等另文。
9. 迁移 `docker/mysql/migrations/0040~0042`(news_items fields/indexes/defaults)+ `0043`(news_webhook_config)— utf8mb4,幂等存储过程(`0000_utils.sql`),续 `0039_promo_config.sql` 格式。
10. 路由注册:`backend/cmd/server/routes.go`(public)挂 `/public/news/*`。

### 第二阶段:热榜子 tab + PC 首页情报区
11. `NewsPage` 内子 tab `实时 | 热榜`(pill,store 记上次选);热榜走 `useNewsFeed('heat')` + 领奖台样式(可独立 `NewsRankCard.tsx`)。
12. `src/features/home/components/NewsSection.tsx`(新建)+ `src/features/home/HomePage.tsx` 底部挂载 — 取 `/public/news/trending?days=7&limit=10`,5 条横向卡片 + 「查看全部」→ `/news/trending`(PC 列表页)。

### 第三阶段:详情页 + SEO/GEO
13. `src/features/news/{routes.tsx,pages/NewsDetailPage.tsx,api/news.ts}`(新建)— `/news/:slug` 挂 `AppShell` children(`app/router.tsx:118-131` 区);同 URL 响应式;正文走后端 `body_html`。
14. `src/shared/lib/route-validation.ts:16` — `KNOWN_FIRST_SEGMENTS` 加 `'news'`。
15. `src/shared/api/types` 的 `ShareTarget` union 加 `{ kind: 'news'; item }`;`shared/components/share/ShareSheet.tsx` 加 news 分支。
16. 后端 `internal/seo/news.go`(`RecordNewsDetailClick` + tier);`backend/internal/config/handler_ssr.go` 对 `/news/:slug` 注 `body_html` 进 noscript + `NewsArticle` JSON-LD;sitemap `/sitemap_news_*.xml`;`internal/seosubmit` 对 `is_featured` 主动推送。
17. `GET /api/v1/public/news/:slug`(完整含 `body_html`、`sources[]`、`credibility_note`)。

### 开放问题

1. **MVP 子 tab 收敛:** MVP 是否真的只做单一时间序流(本文推荐),还是一上来就给「实时/热榜」两个子 tab?推荐先单流,降低嵌套与后端排序压力。
2. **daily/hourly 混排 vs 分离:** MVP 混排(卡片 chip 区分)是否会让「今日要览」被快讯淹没(SmartNews 教训)?若实测淹没,提前到第二阶段做 daily 锚点。
3. **横滑环 vs 截断:** 三段横滑做「论文↔期刊↔情报」环(纸→刊→情报→纸)还是两端截断?推荐环(UX 顺手),但要确认 `useHorizontalSwipe` 在三页间不误触。
4. **时间序位置恢复:** 时间序流每次进入回顶部(看最新,本文推荐)vs 接着上次往后(论文 feed 行为)?二者冲突,建议时间序回顶 + 顶部「N 条更新」提示。
5. **「N 条更新」增量提示数据源:** 靠 `news.heat`/`news.created` 推送驱动,还是前端轮询 `/public/news/list` 第一页 diff?MVP 用轮询(简单),WebSocket 推送列后续扩展(仅特定 tier)。
6. **`heat_trend` 飙升阈值:** 后端返回 trend 字符(飙升/↑/→/↓)供前端直接渲(本文推荐),还是返回数值由前端定阈值?推荐后端定字符,避免前后端阈值漂移。
7. **情报卡是否要「收藏」:** 复用 library 还是独立收藏表?MVP 不做,Action Rail 只放分享。
8. **PC 端 `/news/trending` 列表页:** 与详情同期上线还是延后?本文建议详情页与 webhook 同期(保闭环:点卡能进详情),trending 列表页可延后。
9. **搜索 icon 跟随情报 tab:** 现 `FeedTopTabs.tsx:78-81` 情报 tab 回落搜论文;是否要做情报搜索?MVP 维持回落论文。

---

## 附:遵循的性能/动画铁律(自查)

- LazyMotion 只在 `MobileShell` 顶层一处,情报页树内只用 `m.*`(`MobileShell.tsx:72`)。✅
- 整屏 snap + `RENDER_WINDOW=3` 窗口化 + `content-visibility:auto`,长 feed 不积累 DOM(`VerticalSwipeFeed.tsx:10,186-193`)。✅
- 卡片 `memo`(同 `PaperFeedCard.tsx:47`),`itemKey` 用稳定 `id`(`VerticalSwipeFeed.tsx:180`)。✅
- 横滑被动检测(`useHorizontalSwipe`),不干扰纵向 embla(`FeedPage.tsx:62`)。✅
- 等待态用 `CyclingHint` 循环文案(`VerticalSwipeFeed.tsx:148-155`),不用静态 spinner(MEMORY `cycling-loader-ux`)。✅
- 列表加载失败显示 friendly error + 重试 `refetch`,不回显原始 `err.Error()`(MEMORY `friendly-error-messages`)。✅
- 分享/详情正文单一真源在后端,前端不打包正文 TS(MEMORY `content-single-source-backend`)。✅
- 交付前必须 `tsc -b` + `vite build` 验证(MEMORY `verify-before-deliver`)。⏳(实现阶段)
