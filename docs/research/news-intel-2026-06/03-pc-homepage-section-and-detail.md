# 情报功能 · PC 端展示设计:首页底部情报区 + 情报详情页(2026-06-25)

> 范围:**仅 PC 端展示层** —— 首页底部「情报区」区块 + `/news/:slug` 情报详情页。
> 上游数据协议(Minicod news webhook)、后端接收/验签/落库、移动端刷新流、admin 配置、迁移/SEO 后端管线
> 在本系列其它文档展开;本文只在**与 PC 展示直接相关**处引用它们,落地到 file:line 与前端铁律。
>
> 强约束来源:`frontend-user/CLAUDE.md`(第三方优先 / 分层 / 网络层 @/shared/lib/http / 样式 token / 组件分层 / 路由)。
> 本文**不写业务代码**,只给方案、线框、字段映射、落地清单、开放问题。

---

## 0. 一句话结论

PC 首页在「智能搜索 CTA」与 `<Footer/>` 之间(`HomePage.tsx:145`↔`148`)插入一个**聚焦的情报区**:
**左主信息流 + 右侧热榜 sidebar 两栏**(方案 A,推荐)。情报详情走新顶级路由 **`/news/:slug`**(推荐前缀 `news`),
结构镜像 `BlogDetailPage`(`HelpLayout` 容器 + 右 TOC + 正文),并叠加情报特有的**信息来源区 + 可信度说明 + 热度条 + 相关情报**。
新建独立 feature `features/news/`,严格走 react-query hooks(`features/news/api/news.ts`)+ `ResourceError`(404)+ `route-validation` 登记 + SSR/JSON-LD 复用 seo 管线。

---

## 1. PC 首页底部情报区:布局方案

### 1.1 现状(必须先吃透插入点)

`frontend-user/src/features/home/HomePage.tsx`:

- 整页是 `<SidebarLayout sidebar={<HomeSidebar/>}>`(`HomePage.tsx:77`),左 240px 侧栏由 `SidebarLayout` 控制开合,主区 `<main className="flex-1 min-w-0 min-h-0 overflow-auto">`(`SidebarLayout.tsx:54`)。
- 主区内部(`HomePage.tsx:87-149`)是一个 `flex flex-col min-h-full`:
  - **hero 块** `flex-1 flex flex-col items-center pt-24 pb-24`(`HomePage.tsx:88`):H1(sr-only)+ `BrandLogo` + tagline + 640 宽搜索条 + 红色「智能搜索」按钮(`HomePage.tsx:137-145`)。
  - **`<Footer />`**(`HomePage.tsx:148`)固定在底部。
- 即:hero 用 `flex-1` 把搜索区**垂直居中撑满首屏**,Footer 沉底。

**插入点 = `HomePage.tsx:146`(智能搜索按钮 `</div>` 之后)与 `HomePage.tsx:148`(`<Footer/>`)之间**,新增一个 `<NewsSection/>`。
这样:首屏仍是「Logo + 搜索」(`flex-1` 居中不变),用户**向下滚动**才看到情报区,再下是 Footer。情报区**不进 sidebar、不挤占首屏搜索、不替换 Footer**。

> 注意:`<main>` 已 `overflow-auto`(`SidebarLayout.tsx:54`),滚动天然成立。情报区宽度需自己**居中收口**(主区是 sidebar 右侧的全宽),与搜索条同一视觉中轴。

### 1.2 字段盘点(来自 Minicod news webhook item)

可用于卡片/热榜的字段(详见上游协议文档):
`is_featured`(头条)· `section`/`section_label`(分区)· `title` · `summary` · `published_at`(RFC3339)·
`heat_external`(0-100 站外热度)· `heat_trend`(飙升速度)· `heat_measured_at` · `score`(0-10 综合)·
`view_count` · `report_type`(hourly=快讯 / daily=今日要览)· `sources`([{url,label}])· `slug`。

### 1.3 方案 A(推荐主版式):主信息流 + 右侧热榜 sidebar 两栏

```
┌─ HomeSidebar(SidebarLayout,240,已存在,不动) ─┐┌──────────────── <main> 主区(本文新增区域在此居中收口) ────────────────┐
│  检索 / 智能 / 资源 菜单                       ││  ┌─ hero(flex-1,首屏,不动)────────────────────────────────────┐  │
│                                               ││  │            Scholay Logo  ·  搜索条 640  ·  [智能搜索]            │  │
│                                               ││  └──────────────────────────────────────────────────────────────┘  │
│                                               ││  ╔══════════════ NewsSection(新增,max-w 居中)═══════════════════╗  │
│                                               ││  ║ 「学术情报」标题行            [今日要览] [快讯]   全部资讯 → ║  │
│                                               ││  ║ ┌──────── 主信息流(≈ flex-[7]) ────────┐ ┌─ 热榜(flex-[3])─┐║  │
│                                               ││  ║ │ ★头条卡:title / summary / section /  │ │ 🔥 实时热榜      │║  │
│                                               ││  ║ │   X 分钟前 · 来源N                    │ │ ① 标题…  92 ↑    │║  │
│                                               ││  ║ │ ─────────────────────────────────── │ │ ② 标题…  88      │║  │
│                                               ││  ║ │ • 普通卡 title / summary / 时间 / 区  │ │ ③ 标题…  85 ↑    │║  │
│                                               ││  ║ │ • 普通卡 …                            │ │ ④ 标题…  80      │║  │
│                                               ││  ║ │ • 普通卡 …                            │ │ ⑤ 标题…  77      │║  │
│                                               ││  ║ └───────────────────────────────────── │ │ ……(Top 8-10)    │║  │
│                                               ││  ║                                        │ │ 更新于 X 分钟前  │║  │
│                                               ││  ║                                        │ └─────────────────┘║  │
│                                               ││  ╚════════════════════════════════════════════════════════════════╝  │
│                                               ││  ┌────────────────────── <Footer/>(不动)────────────────────────┐  │
└───────────────────────────────────────────────┘└──────────────────────────────────────────────────────────────────────┘
```

- 容器:`<section>`，外层 `mx-auto w-full max-w-[960px] px-6 pb-16`(主区已有 sidebar,情报区在主区内再居中;`max-w` 取比搜索条 640 宽,容纳两栏)。
- 内层两栏:`flex gap-6`;左 `flex-[7] min-w-0`(主信息流)、右 `flex-[3] shrink-0`(热榜)。窄屏(< md)右栏堆到下方或隐藏(见 1.6)。
- **左主信息流**:头条卡(`is_featured` 置顶,加「头条」`Badge`)+ N 条普通卡,按 `report_type=hourly` 优先、`published_at` 倒序;卡片见 §2.1。
- **右热榜**:按 `heat_external` 降序 Top 8-10,序号徽标(前三高亮)、`heat_trend` 超阈值渲「飙升 ↑」;顶部「实时热榜」、底部「更新于 {heat_measured_at} 前」;热榜项见 §2.2。
- **顶部分区 tab**(可选):`section`(major-event / china-policy / top-journal / other)做横向 chip 过滤,或 `report_type`(今日要览 / 快讯)二选切换。MVP 可先不做,只展默认混排。
- 取舍:**信息密度最高、桌面体验最佳**,直接复用门户/微博热搜的成熟心智(网易/腾讯/Vanity Fair 范式)。代价:右栏是桌面专属,窄屏必须降级。**推荐为主版式。**

### 1.4 方案 B:卡片网格(featured 突出)

```
╔══════════════ NewsSection ══════════════════════════════════════╗
║ 「学术情报」                                       全部资讯 →    ║
║ ┌──────────────── ★ 头条大卡(跨 2 列)──────────────┐          ║
║ │ title(大)/ summary / section / X 分钟前 · 来源N     │          ║
║ └──────────────────────────────────────────────────────┘          ║
║ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                      ║
║ │ 卡 title│ │ 卡 title│ │ 卡 title│ │ 卡 title│   (grid 4 列)      ║
║ │ summary │ │ summary │ │ summary │ │ summary │                    ║
║ │ 区·时间 │ │ 区·时间 │ │ 区·时间 │ │ 区·时间 │                    ║
║ └────────┘ └────────┘ └────────┘ └────────┘                      ║
╚═════════════════════════════════════════════════════════════════╝
```

- 容器 `grid grid-cols-2 md:grid-cols-4 gap-4`,头条 `col-span-2`(或 `md:col-span-4`)。
- 取舍:视觉整洁、首屏一眼看全;但**丢掉了热榜的排行/飙升语义**(我们最差异化的 `heat_external`/`heat_trend` 无处安放),且每卡内容被压缩成短摘要。**适合作为「无热度数据时的降级版」或移动端单列**,不推荐做 PC 主版式。

### 1.5 方案 C:横向 carousel(头条轮播)+ 下方榜单

```
╔══════════════ NewsSection ══════════════════════════════════════╗
║ ◀ ┌──── ★ 头条轮播(embla,is_featured 大图卡)────┐ ▶   ● ○ ○  ║
║   │ title / summary / 来源 / 时间                    │            ║
║   └──────────────────────────────────────────────────┘            ║
║ ── 实时热榜 ─────────────────────────────────────────────────── ║
║  ① 标题 92↑   ② 标题 88   ③ 标题 85↑   ④ 标题 80   ⑤ 标题 77    ║
╚═════════════════════════════════════════════════════════════════╝
```

- carousel 用 **`embla-carousel-react`**(CLAUDE.md §2 指定,不得自研 slider / react-slick)。
- 取舍:头条有冲击力,但 carousel **后续 slide 曝光低**(用户不主动滑就看不到),信息密度低。**适合把 `is_featured` 头条做成强调横幅**,但单独不足以承载情报区。可作为方案 A 的「顶部强调条」补充,不单独用。

### 1.6 推荐与降级

| 场景 | 版式 | 说明 |
|---|---|---|
| **PC 首页底部(推荐)** | **方案 A** 两栏 | 主信息流 + 右热榜,信息密度与差异化(热度榜)兼得 |
| 窄屏 / 平板(< md) | 方案 A 降级:右栏堆到信息流下方,或折叠成「展开热榜」 | 不做横向 sidebar;`md:` 断点切换 |
| 移动端 `/m/news` | 见移动端文档(榜单 + 实时快讯流,今日头条/抖音/微博热搜混合) | 本文不展开 |
| 无热度数据兜底 | 方案 B 网格 | `heat_external` 全 0 时退化为纯信息流网格 |

> **carousel 仅在确有 `is_featured` 头条且想强调时**作为方案 A 顶部一条横幅(方案 C 思路),非必须。

### 1.7 第三方与铁律对照(本区块)

- **不自研栅格**:两栏/网格用 Tailwind `flex`/`grid` 工具类即可(CLAUDE.md §5)。**无 `shared/components/CardGrid`**(勘探 JSON 误提,实际不存在),不要为此造组件;若复用,卡片是新组件直接放 `features/news/components/`。
- **carousel 必用 `embla-carousel-react`**(CLAUDE.md §2),禁自研。
- **样式只用 token**:背景 `bg-background`/`bg-surface-1`、文字 `text-foreground`/`text-muted-foreground`/`text-faint`、边框 `border-border-soft`/`border-border`、品牌 `text-brand-red`(飙升/CTA)、`text-brand-amber`(warning)。禁硬编码颜色(CLAUDE.md §5 / §10)。
- **数据走 react-query hooks**(§4),组件内零 `axios`。

---

## 2. 数据展示:PC 卡片 与 热榜项

### 2.1 PC 情报卡(主信息流)`NewsCard`

```
┌──────────────────────────────────────────────────────────┐
│ [头条]  [重大事件]          🔥 92 ↑          ⌚ 12 分钟前   │  ← is_featured 徽标 + section_label chip + 热度 + 相对时间
│ 某某重磅:XXXXXXXXXXXXXXXXXXXXXXXXXXXX(title,2 行截断)   │
│ 答案前置的 summary，40–60 字给出核心结论，line-clamp-2 …  │
│ 来源:Nature · Science · +3   ·   今日要览                 │  ← sources 折叠计数 + report_type
└──────────────────────────────────────────────────────────┘  整卡 <Link to={`/news/${slug}`}>
```

字段映射:

| 字段 | 卡片元素 | 备注 |
|---|---|---|
| `is_featured` | 左上「头条」`Badge`(`bg-brand-red`/soft) | 仅 true 显;同时可置顶为首卡 |
| `section_label` | 分区 chip(彩色按 `section` 取 token) | major-event/china-policy/top-journal/other |
| `title` | 标题 `text-base font-bold line-clamp-2` | |
| `summary` | 摘要 `text-xs text-muted-foreground line-clamp-2` | answer-first,薄内容也得有 |
| `heat_external` | 右上热度数字 + 🔥 | `text-faint`,可省略 |
| `heat_trend` | 飙升 `↑`(超阈值,`text-brand-red`) | |
| `published_at` | 相对时间「X 分钟前」 | 用 `date-fns`(CLAUDE.md §2,禁 dayjs/moment) |
| `sources` | 「来源:A · B · +N」折叠 | 完整列表在详情页 |
| `report_type` | hourly→「快讯」/ daily→「今日要览」小标 | |
| `slug` | 整卡 `<Link to={'/news/'+slug}>` | 不在首页拉正文 |

> 卡片**不取 `body_html`/`body_md`**(首页只列表,正文进详情再 fetch)。`view_count` 可选作「N 人在看」社交证明。

### 2.2 PC 热榜项 `NewsHotItem`

```
①  某条飙升情报标题，单行截断 line-clamp-1            92 ↑
②  另一条情报标题 ……                                  88
③  第三条 ……                                          85 ↑
```

| 字段 | 元素 | 备注 |
|---|---|---|
| 排名序号 | `①②③` 徽标,前三 `text-brand-red`/加重 | 由 `heat_external` 降序的下标生成 |
| `title` | 单行 `line-clamp-1`,整行 `<Link>` | |
| `heat_external` | 右侧数字 | `text-faint` |
| `heat_trend` | `↑`(飙升,`text-brand-red`) | |
| `heat_measured_at` | 榜底「更新于 X 分钟前」 | 强化 freshness/实时感 |

> 排序口径(MVP):热榜=`heat_external` 降序;主信息流=`report_type=hourly` 优先 + `published_at` 倒序。
> 是否上 `score`/`view_count`/`recency` 复合评分见**开放问题 §6.4**。

---

## 3. 情报详情页(PC):`/news/:slug`

### 3.1 参考范例

`frontend-user/src/features/help/pages/BlogDetailPage.tsx`(`BlogDetailPage.tsx:1-152`)是**最贴近的现成范例**,直接镜像其结构:

- 容器 `HelpLayout`(面包屑 + eyebrow + title + lead + metaChips + 右 TOC,见 `BlogDetailPage.tsx:42-69`)。
- `useParams` 取 slug(`BlogDetailPage.tsx:19`)→ `useArticle` 取数(`BlogDetailPage.tsx:20`)。
- 加载态 / 错误态(`BlogDetailPage.tsx:24-36`,**本页改用 `ResourceError`**,见 §4.3)。
- `RouteSEO` 注 title/description/keywords/canonical(`BlogDetailPage.tsx:70-75`)。
- 正文渲染 + 标签 + 作者卡 + 相关文章(`BlogDetailPage.tsx:76-149`)。

### 3.2 情报详情页布局(在 Blog 范例上做情报特化)

```
┌─ HelpLayout(面包屑:首页 / 资讯 / {section_label})────────────────────────┐
│ eyebrow = section_label「重大事件」    [头条 Badge]                         │
│ H1: {title}                                                                 │
│ lead: {summary}(answer-first,40-60 字)                                    │
│ metaChips:  ⌚{published_at}  ·  更新 {updated_at}  ·  🔥 热度 92 ↑  ·       │
│             今日要览  ·  原始日期 {original_date}                            │
│ ┌──────────────────────── 正文区 ──────────────────┐ ┌─── 右 TOC ───┐      │
│ │ {body_html} 直接渲染(后端 sanitize)               │ │ 自动从 h2/h3  │      │
│ │  或 body_md → react-markdown(gfm/highlight/katex)  │ │ 提取章节锚点  │      │
│ │                                                    │ └──────────────┘      │
│ │ ── 信息来源(GEO 差异化,务必可见)──────────────                          │
│ │   • Nature — https://…(可点)                                              │
│ │   • Science — https://…                                                    │
│ │ ── 可信度说明 ────────────────────────────────                            │
│ │   {credibility_note}(显式「来源核验」attribution line)                    │
│ │ ── 热度 ──────────────────────────────────────                            │
│ │   站外热度 92 / 100 · 飙升 ↑ · 更新于 {heat_measured_at}                   │
│ │ ── 相关情报(同 section 其它热门)────────────────                          │
│ │   [卡] [卡] [卡] [卡]   → /news/{slug}                                     │
│ └────────────────────────────────────────────────────┘                      │
└──────────────────────────────────────────────────────────────────────────┘
```

模块映射:

| 区块 | 数据 | 实现要点 |
|---|---|---|
| 面包屑 / eyebrow | `section_label` | `HelpLayout` 既有 props |
| 头条徽标 | `is_featured` | `Badge`(`shared/ui`) |
| H1 / lead | `title` / `summary` | answer-first |
| metaChips | `published_at`/`updated_at`/`heat_external`/`heat_trend`/`report_type`/`original_date` | 复用 `MetaChip`(`BlogDetailPage.tsx:6` 同源) |
| **正文** | `body_html`(优先,后端 sanitize)或 `body_md` | md 走 `react-markdown`+`remark-gfm`+`rehype-highlight`+`rehype-katex`(CLAUDE.md §2,禁自研解析) |
| **信息来源** | `sources[{url,label}]` | 可见、可点击 `<a target=_blank rel="noopener">`;GEO 强信号 |
| **可信度说明** | `credibility_note` | 显式 attribution 区,是相对通用资讯站的最大 GEO 资产 |
| 热度条 | `heat_external`/`heat_trend`/`heat_measured_at` | 站外热度 X/100 + 飙升 + 「X 分钟前」 |
| 相关情报 | 同 `section` 其它热门(`useNewsHeatList` 过滤同区 + 排除自身) | 复用 §2.1 卡片;参考 `relatedArticles`(`content.ts:76-93`)思路 |

> **正文渲染选型决策(开放问题 §6.6)**:`body_html` 已是后端可直接展示的 HTML(协议),但前端渲染他人 HTML 需确认 **sanitize 责任在后端**;若走 `body_md` 则用 `react-markdown` 链路,与 Prism/Claw 一致(CLAUDE.md §2)。**优先 body_md + react-markdown**(链路已成熟、可控),`body_html` 作兜底。

### 3.3 SEO / GEO(详情页)

- **路由内**:`RouteSEO`(`react-helmet-async`)塞 `title`/`description=summary`/`keywords`/`canonical=/news/{slug}`(`BlogDetailPage.tsx:70-75` 同款)。
- **SSR(爬虫)**:后端 `internal/config/handler_ssr.go` 在 `ServeIndexHTML` 中新增 `/news/` 分支(对照 `handler_ssr.go:148-156` 的 `/blog/`、`/resources/` 分支):
  - 把**全文 + summary + sources + credibility_note** 写进 `<noscript>`(参考 `getRouteNoscriptContent` 的 `/blog/` 分支 `handler_ssr.go:1379-1384` + `insertNoscriptBlock`),薄内容会被降权,快讯也要成型。
  - 注专属 `<title>`/`description`/**自指 canonical**/OG + **JSON-LD `NewsArticle`**(对照 `injectArticleSEOMeta` `handler_ssr.go:1296-1332`,新增 `injectNewsSEOMeta`)。
  - `NewsArticle` 字段:`headline=title`、`datePublished=published_at`、`dateModified=updated_at`(news.updated 必刷,freshness 核心)、`articleSection=section_label`、`articleBody`=正文、`citation`/`isBasedOn`=`sources[].url`、`publisher`(成都恩特罐罐文化科技 + logo,Top Stories 硬要求)、`image`(需补 16:9 封面,**开放问题 §6.7**)。
- **类型放 `internal/seo`**:新增 `NewsSSRMeta`(对照 `ssr_meta.go` 的 `PaperSSRMeta`/`ToolSSRMeta` `ssr_meta.go:34-95`),由 `internal/news` 的 Service 解析,`config` 注入。**复用 seo 包框架,不另起渲染逻辑。**
- **sitemap**:详情进主 sitemap(长期可索引);可选独立 `sitemap-news.xml`(只收 48h 内、单文件 <1000、`news:` 命名空间)——优先级低于结构化数据 + AI 爬虫放行(沿用 geo-2026-06,robots + nginx 两处放行 GPTBot/OAI-SearchBot/PerplexityBot/ClaudeBot)。
- 详细 SEO/迁移/sitemap 见本系列后端/SEO 文档,**本文不展开**。

---

## 4. 路由与前端工程约定(落地)

### 4.1 路由前缀:推荐 `/news/:slug`(不用 `/intel/`)

- **推荐 `news`**:语义直白、`NewsArticle` schema 对齐、与 `/blog`、`/resources` 同层级(都是内容页);英文 URL 利于 AI/搜索判断新鲜度。
- 不用 `/intel/`(语义偏「内部情报」,对外不友好)、不用 `/browser/news`(无谓加深路径,损 SEO)。
- slug 用**上游 `item.slug`**(形如 `2026-06-12-xxx`,日期前缀=时效语义 + 唯一);canonical 自引用。

### 4.2 路由登记(三处)

1. **`features/news/routes.tsx`**(新建,镜像 `helpRoutes` `help/routes.tsx:19-75`):
   ```
   newsRoutes: RouteObject[] = [
     { path: 'news',        lazy: () => import('./pages/NewsListPage')   ... },  // 可选:全部资讯列表页
     { path: 'news/:slug',  lazy: () => import('./pages/NewsDetailPage') ... },
   ]
   ```
   每页 **lazy**(CLAUDE.md §7「页面级 lazy 是默认」)。
2. **`app/router.tsx`**:`import { newsRoutes }` + spread 进 `'/'`(AppShell)的 `children`(`router.tsx:118-131`,放在 `...clawRoutes` 旁)。
   - 决策:情报详情**挂 AppShell**(`router.tsx:104`,有 TopNav/sidebar),与 paper/journal 详情一致;**不**走 help 那条「不挂 AppShell」分支(help 是营销/法务页自带 HelpLayout)。但若想完全复用 `HelpLayout`(§3.1),也可挂 helpRoutes 那条(`router.tsx:71-75`,自带 errorElement)。**二选一,推荐挂 AppShell**(情报是产品内功能页,需登录态/导航)。
   - AppShell 父级已有 `errorElement: <RouteErrorBoundary/>`(`router.tsx:105`)→ stale-chunk 自动兜底,**子路由无需各自挂**。若改挂 help/landing 那种顶层独立分支,则需像它们一样自带 `errorElement`(`router.tsx:59`/`67`/`74`)。
3. **`shared/lib/route-validation.ts`**:`KNOWN_FIRST_SEGMENTS` 加 `'news'`(`route-validation.ts:16-66`,放「帮助 / 法务 / 内容」段 `blog`/`resources` 旁,`route-validation.ts:43-49`)。**这是硬契约**——不加会让外部数据里的 `/news/...` 链接被判「未知路由」。

### 4.3 stale-chunk 自愈 + 详情守卫 ResourceError(404)

- **stale-chunk**:挂 AppShell → 复用 `router.tsx:105` 的 `RouteErrorBoundary`(lazy import 失败时显「正在更新到最新版本」而非假 404 / react-router 开发者面板)。**不自己处理。**
- **404 守卫**:`NewsDetailPage` 用 `ResourceError`(`shared/components/ResourceError.tsx:52-124`)替代 `BlogDetailPage` 的 `<Navigate to="/blog" replace/>`(`BlogDetailPage.tsx:34-36`):
  - `useNewsDetail(slug)` 配 **`retry: false`**(对照 `content.ts:71` 的 `useArticle`),让 404 友好态秒出。
  - 渲染:`<ResourceError error={error} resourceName="情报" backTo="/news" />`(或 `backTo="/"`)。
  - `ResourceError` 自动:404/403 → 「情报不存在或无权访问」+ 2.5s 自动返回(`ResourceError.tsx:69-101`);网络/5xx → 「加载失败」+ 重试按钮。**后端对不存在/越权统一 404 防枚举**(`ResourceError.tsx:50` 注释),前端只判 404。

### 4.4 网络层(@/shared/lib/http)+ react-query hooks

新建 `features/news/api/news.ts`,镜像 `features/help/api/content.ts`(`content.ts:1-93`):

- **唯一 HTTP 入口 = `@/shared/lib/http` 的 `http` 实例**(`content.ts:4`),组件/store 内**禁止裸 `axios`/`fetch`**(CLAUDE.md §3.4 / §10)。
- 导出 react-query hooks,**不导出裸 fetch**(CLAUDE.md §3.1):
  | hook | 端点(公开,无鉴权) | queryKey 三段式 | 关键参数 |
  |---|---|---|---|
  | `useNewsLatestList(limit)` | `GET /api/v1/news?sort=latest&limit=` | `['news','list','latest',limit]` | 主信息流 |
  | `useNewsHeatList(limit)` | `GET /api/v1/news?sort=heat&limit=` | `['news','list','heat',limit]` | 右热榜 |
  | `useNewsDetail(slug)` | `GET /api/v1/news/:slug` | `['news','detail',slug]` | `enabled: !!slug`,`retry: false` |
  - queryKey 遵 `[feature, resource, ...params]`(CLAUDE.md §3.2),便于 `invalidateQueries({queryKey:['news']})`。
  - `staleTime`:列表可设 `60_000`~`5*60_000`(情报偏实时,比 content 的 `10*60_000` 短);详情 `retry:false`(对照 `content.ts:71`)。
  - 类型:`NewsCard`(列表瘦身,不含正文)+ `NewsDetail`(含 `body_html`/`body_md`/`sources`/`credibility_note`),对照 `content.ts` 的 `ArticleCard`/`Article`(`content.ts:23-40`)。**理想从 `@/shared/api/schema` 生成**(`npm run gen:api`,CLAUDE.md §3.6),不手写镜像后端;若 schema 未含 news,先手写并标注待迁移。
- **错误用 `toApiError(err)`**(`ResourceError.tsx:6` 已用),不到处 setError。

### 4.5 组件分层(新 feature 目录)

```
features/news/
├── routes.tsx                    本 feature 子路由(lazy 暴露)
├── api/
│   └── news.ts                   react-query hooks(§4.4)
├── pages/
│   ├── NewsListPage.tsx          /news 全部资讯(可选 MVP 后置)
│   └── NewsDetailPage.tsx        /news/:slug(镜像 BlogDetailPage)
├── components/
│   ├── NewsSection.tsx           ★ 首页底部情报区(方案 A,组装左流+右榜)
│   ├── NewsCard.tsx              PC 卡片(§2.1)
│   ├── NewsHotList.tsx           右侧热榜容器
│   ├── NewsHotItem.tsx           热榜单项(§2.2)
│   ├── NewsSourceList.tsx        详情页「信息来源」区
│   └── NewsCredibilityNote.tsx   详情页「可信度说明」区
├── hooks/                        (如需,本 feature 私有)
└── types.ts                      本 feature 类型(或从 schema 引)
```

- **分层铁律**(CLAUDE.md §6 / §1):
  - 卡片/热榜/来源块带业务名词(News*),**放 `features/news/components/`**,不进 `shared/`。
  - **首页要用 `NewsSection`**:由 `features/home/HomePage.tsx` import `features/news/components/NewsSection`——这是 **feature → feature import,违反 CLAUDE.md §1「任意 feature import 其他 feature」铁律**。
    - **解法(决策,见开放问题 §6.8)**:把 `NewsSection` 视为「跨 feature 复用的复合区块」**提到 `shared/components/NewsSection.tsx`**(它已在 home 与未来潜在位置复用);但它依赖 news 的 api hooks(`features/news/api`)——而 `shared/` **禁止 import `features/`**(CLAUDE.md §1)。
    - 故**最干净的做法**:`NewsSection` + 其 api hooks + 卡片全部留在 `features/news/`,然后**在 `app/router.tsx`/`HomePage` 的组装处由 app 层注入**——但 HomePage 属 `features/home`。
    - **落地推荐**:`HomePage`(`features/home`)直接 import `features/news/components/NewsSection`,**作为已知的、受控的例外**(如同 `app/router.tsx` 唯一允许 import features)。或:把 news 的「展示区块」整体设计为可被 home 复用的 `shared/components/news/`,而 hooks 仍在 features——届时 shared 组件**接收数据为 props**,由 home 页用 news hooks 取数后传入(**这是符合铁律的最优解**:`shared/components/NewsSection` 纯展示、props in;`features/home/HomePage` 调 `features/news/api` 取数——但 home import features 仍是跨 feature)。
    - ⚠️ **必须在 PR 里显式说明并跑 `/v2-audit`**;最终拍板见 §6.8。
  - `react-markdown`/`embla`/`date-fns`/`Badge` 等全用既有第三方(CLAUDE.md §2),禁自研。

### 4.6 store 约定

- **不把服务端数据放 zustand**(CLAUDE.md §4,列表/详情/热榜全归 react-query)。
- 仅 **UI 偏好**(若有)用 zustand:如「热榜展开/折叠」「首页情报区 section tab 选中」——但这些更适合 `useState` 本页局部(CLAUDE.md §4)。
- 若确需跨页持久(如移动 feed seed),才建 `stores/news.store.ts`(`xxx.store.ts` 命名,CLAUDE.md §9),slice 独立、不 import 其它 store(CLAUDE.md §4)。**PC 展示侧大概率不需要 store。**

---

## 5. 落地步骤清单(file 级,仅 PC 展示)

> 后端接收/验签/落库/迁移/admin/移动端见本系列其它文档;此处只列 **PC 展示 + 详情 + SEO 接线**。

**前端**:
1. `frontend-user/src/features/news/api/news.ts`(新建)—— `useNewsLatestList`/`useNewsHeatList`/`useNewsDetail` + 类型(镜像 `content.ts`)。
2. `frontend-user/src/features/news/components/NewsCard.tsx`、`NewsHotItem.tsx`、`NewsHotList.tsx`、`NewsSection.tsx`(新建)—— §2 字段映射 + §1.3 方案 A 布局,只用 token。
3. `frontend-user/src/features/news/components/NewsSourceList.tsx`、`NewsCredibilityNote.tsx`(新建)—— 详情页来源/可信度区。
4. `frontend-user/src/features/news/pages/NewsDetailPage.tsx`(新建)—— 镜像 `BlogDetailPage.tsx:1-152`,改用 `ResourceError`(§4.3),`react-markdown` 渲 `body_md`。
5. `frontend-user/src/features/news/pages/NewsListPage.tsx`(新建,可后置)—— `/news` 全部资讯列表。
6. `frontend-user/src/features/news/routes.tsx`(新建)—— `newsRoutes`(镜像 `help/routes.tsx`)。
7. `frontend-user/src/app/router.tsx`(改)—— import + spread `newsRoutes` 进 `'/'` children(`router.tsx:118-131`)。
8. `frontend-user/src/shared/lib/route-validation.ts`(改)—— `KNOWN_FIRST_SEGMENTS` 加 `'news'`(`route-validation.ts:43-49` 旁)。
9. `frontend-user/src/features/home/HomePage.tsx`(改)—— `import { NewsSection }`,在 `HomePage.tsx:146`↔`148` 间渲染(§4.5 跨 feature 例外,见 §6.8)。
10. 验收:`tsc -b` + `vite build`(交付前必跑,docker 比本地严;CLAUDE.md §11)+ 运行 `/v2-audit` skill。

**后端(仅 SEO 接线,本文相关部分)**:
11. `backend/internal/news/`(新建模块,详见后端文档)—— 至少需 Service 暴露 `ResolveBySlug → NewsSSRMeta` 供 SSR。
12. `backend/internal/seo/ssr_meta.go`(改)—— 新增 `NewsSSRMeta` 类型(对照 `ssr_meta.go:34-95`)。
13. `backend/internal/config/handler_ssr.go`(改)—— `ServeIndexHTML` 加 `/news/` 分支(对照 `handler_ssr.go:148-156`)+ `getRouteNoscriptContent` 加 `/news/`(对照 `handler_ssr.go:1379-1384`)+ 新增 `injectNewsSEOMeta`(对照 `injectArticleSEOMeta` `handler_ssr.go:1296-1332`,产 `NewsArticle` JSON-LD)。
14. sitemap(可选 `sitemap-news.xml`)+ robots/nginx AI 爬虫放行(沿用 geo-2026-06,本文不展开)。

---

## 6. 开放问题

1. **数据源**:情报完全来自 Minicod webhook,还是同时支持后台手工发布 / 草稿态编辑?(影响是否需要 admin 编辑器,本文按「纯 webhook、只读展示」设计。)
2. **首页区块位置**:确认放「首屏搜索之下、Footer 之上」(本文方案);还是要做成首屏可见的一部分(会挤压搜索区的 `flex-1` 居中)?
3. **顶部分区切换**:首页情报区 MVP 是否需要 `section`/`report_type` tab,还是先默认混排?
4. **排序算法**:热榜仅 `heat_external` 线性排序,还是 `score`+`view_count`+`heat_trend`+recency 复合评分?主信息流是否也参考 `score`?
5. **`/news` 列表页**:是否要做独立的「全部资讯」列表页(方案 B 三栏门户式可落在此处),还是首页区块的「全部资讯 →」先指向移动 `/m/news` 或暂缺?
6. **正文渲染**:`body_html`(后端 sanitize)直渲 vs `body_md` + `react-markdown`?(本文推荐后者,但需确认上游 `body_html` 的 sanitize 责任与 md 完整度。)
7. **封面图 `image`**:协议 item **无 image 字段**;`NewsArticle` JSON-LD / OG / 卡片(方案 B 中栏)需要 16:9 封面。是否补默认品牌图,还是上游补字段,还是 PC 主版式(方案 A 纯文卡)规避此需求?
8. **跨 feature import 拍板**:`HomePage`(features/home)用 `NewsSection`(features/news)的最终形态——(a) home 直接 import news 组件(受控例外);(b) `NewsSection` 提到 `shared/components/`、纯展示 props-in、由 home 用 news hooks 取数传入(更合铁律但 home 仍 import news api)。需在 `/v2-audit` 下定调。
9. **是否进聚合搜索**:`/search` 是否混入 news 结果(与论文/期刊/学者多源合并)?(影响 search feature,本文不含。)
