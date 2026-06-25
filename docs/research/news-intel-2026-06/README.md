# 情报(学术新闻)功能 · 调研总览与端到端实施计划

> 目录: `docs/research/news-intel-2026-06/`
> 状态: 调研完成,待排期实施。本文是索引页 + 端到端落地计划,**不含业务代码**。
> 所有子文档已实地核实 file:line 坐标,落地以子文档为准、以源码为终判。

---

## 1. 功能一句话定义

**情报 = 由上游 Minicod 主动推送(server-to-server webhook)的学术新闻流**:本侧只负责"接收 → 验签 → 幂等 → 落库 → 对外展示",自己不生产内容、不做编辑后台,以"今日要览(daily)/ 实时快讯(hourly)+ 热榜"三种心智在移动端刷新流、PC 首页情报区、每条 `/news/{slug}` 详情页(SEO/GEO 友好)呈现。

**数据来源**: Minicod news webhook,三个事件:

| 事件 (`X-Minicod-News-Event`) | 语义 | 载荷 |
|---|---|---|
| `news.created` | 情报首次发布 | 单条 `item`(全字段) |
| `news.updated` | 已发布情报内容更新 | 单条 `item`(用 `item.id` 覆盖) |
| `news.heat` | 一批站外热度刷新 | `items[]`(只含 `id/slug/url/heat_external/heat_trend/heat_measured_at`,不含正文) |

**验签铁律(必做)**: 用后台配置的密钥对【**原始请求体字节**】(不可 `JSON.parse` 后再 `stringify`)算 `HMAC-SHA256` hex,与 `X-Minicod-News-Signature`(去 `sha256=` 前缀)做**常量时间比较**;不过 → 401 拒收。
**返回契约**: ~10s 内 2xx=已接收;429(可带 `Retry-After`)=整批退避;其它非 2xx=失败,上游按 1m/5m/30m/2h/6h 退避重试,5 次后进死信(可手动重投)。**本侧不主动返 429**。

---

## 2. 文档索引

| 文档 | 一句话 |
|---|---|
| [01-webhook-ingestion-and-admin-config.md](01-webhook-ingestion-and-admin-config.md) | 后端接收端:公开路由 + HMAC-SHA256 原始字节验签 + Redis/DB 双层幂等 + 三事件落库 + 单行专表 admin 配置(对标 promo_config / wechatofficial),含数据库表逐字段设计与 file 级落地清单。 |
| [02-mobile-ux-and-feed.md](02-mobile-ux-and-feed.md) | 移动端"刷新流":在 `/m/feed` 加第三个 tab(intel),复用 `VerticalSwipeFeed` 引擎但**不复用** `(seed,page)` 随机契约,改 `(sortBy,page)` 确定性分页;竞品(头条/抖音/微博热搜)UX 提炼 → 情报卡解剖 → 三阶段落地。 |
| [03-pc-homepage-section-and-detail.md](03-pc-homepage-section-and-detail.md) | PC 首页底部情报区(`HomePage.tsx:146` 与 `<Footer/>` 之间)布局方案 + `/news/{slug}` 详情页(镜像 `BlogDetailPage` + 信源/可信度/热度特化)+ 前端工程约定(路由三处登记 / 网络层 / 分层 / store)。 |
| [04-seo-geo-and-sitemap.md](04-seo-geo-and-sitemap.md) | SEO/GEO:复用现有 SSR noscript 全文注入 + JSON-LD + sitemap + robots/nginx 四件套骨架,仅把数据源从 `go:embed` 换 DB,经 provider 接口挂入;`NewsArticle` JSON-LD、主 sitemap-news.xml、freshness 闭环、`sources`+`credibility_note` 作为最大 GEO 差异化资产。 |

---

## 3. 端到端架构图

```
┌──────────────────────────────────────────────────────────────────────────┐
│  上游 Minicod news webhook  (server-to-server POST, application/json)        │
│  headers: X-Minicod-News-{Event, Delivery(uuid), Signature(sha256=hex),      │
│           Timestamp(unix秒)}                                                  │
│  events:  news.created / news.updated (单条 item) · news.heat (批量 items[]) │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │  POST /api/v1/webhook/minicod-news
                                 │  (公开路由, registerPaymentCallbackRoutes 同层, 禁挂认证中间件)
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  后端 internal/news  (model/repository/service/handler)                      │
│  ① io.ReadAll 原始 body 字节  (不可 parse 后重序列化)                          │
│  ② HMAC-SHA256(body, secret) + subtle.ConstantTimeCompare  → 不过即 401      │
│  ③ 幂等: Redis SetNX(news:delivery:{Delivery}, 24h, fail-open)               │
│          + DB news_deliveries UNIQUE(delivery_id) 兜底                        │
│  ④ switch(Event):                                                            │
│       created/updated → upsert news_items BY id (ON DUPLICATE KEY UPDATE)    │
│       heat            → 批量按 items[].id 只更 heat_external/heat_trend/      │
│                         heat_measured_at 三列 (不动正文、不触 updated_at)      │
│  ⑤ 返回 200 (已落库) / 401 (验签失败) / 400 (体坏) / 500 (DB 错)              │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 ▼
                        ┌────────────────┐
                        │   MySQL (DB)    │   news_items (主表) ·
                        │                 │   news_deliveries (去重) ·
                        │                 │   news_webhook_config (单行 id=1)
                        └───────┬─────────┘
                                │  公开只读 API (无鉴权)
                                │  GET /api/v1/news/:slug         (详情, body_html)
                                │  GET /api/v1/news/list?sort=published_at|heat_external&page=
                                │  GET /api/v1/news/trending?days=7&limit=  (PC 首页/榜单)
                                ▼
        ┌───────────────────────┬───────────────────────┬───────────────────────┐
        ▼                       ▼                       ▼                       ▼
┌───────────────┐   ┌───────────────────┐   ┌───────────────────────────────────────┐
│ 移动 feed      │   │ PC 首页情报区       │   │ SEO / GEO (爬虫 & AI)                    │
│ /m/feed (intel)│   │ HomePage.tsx 底部   │   │ • SSR: handler_ssr.go injectRouteNoscript│
│ VerticalSwipe  │   │ NewsSection         │   │   → 全文 noscript (sanitize 后) + og:*    │
│ (sortBy,page)  │   │ (热榜 Top + 最新)   │   │ • JSON-LD: NewsArticle (NewsSEOProvider) │
│ 确定性分页      │   │ → /news/{slug}      │   │ • sitemap-news.xml (lastmod=updated_at) │
│                │   │                     │   │   → ServeSitemapIndex 引入               │
│ 详情同 URL      │◄──┤ 详情 /news/{slug}  ├──►│ • nginx user.conf SSR 白名单 + robots    │
│ 响应式 (保 SEO) │   │ (AppShell 镜像 Blog)│   │   (默认放行, AI 爬虫已具名)               │
└───────────────┘   └───────────────────┘   └───────────────────────────────────────┘

       admin 后台 (AdminAuthMiddleware):
       GET/PUT /api/v1/admin/news-webhook/config
       → 展示接收 URL(给上游) + 密钥脱敏读写(secret-input + utils.MaskSecret)
```

---

## 4. 数据模型概览

> 迁移最新编号 **0039**(`promo_config`),news 从 **0040** 起。三段式 `NNNN_xxx_{fields,indexes,defaults}.sql`,幂等存储过程见 `0000_utils.sql`,中文列必须 `utf8mb4 COLLATE utf8mb4_unicode_ci`。

### `news_items`(情报主表,逐字段映射上游 `item`)

| 列 | 类型 | 来源/说明 |
|---|---|---|
| `id` | `CHAR(36)` PK | item.id(uuid)= **覆盖/幂等的稳定主键**(非 slug) |
| `slug` | `VARCHAR(200)` UNIQUE | item.slug(形如 `2026-06-12-xxx`),路由/SEO 用 |
| `url` | `VARCHAR(500)` | 上游规范 URL |
| `report_id` / `report_type` | `VARCHAR` / `ENUM('hourly','daily')` | hourly=快讯 · daily=今日要览 |
| `section` / `section_label` | `ENUM(...)` / `VARCHAR` | major-event/china-policy/top-journal/other + 可读文案 |
| `title` | `VARCHAR(500)` | |
| `summary` | `TEXT` | answer-first 前置摘要 |
| `body_md` / `body_html` | `LONGTEXT` | zh,`/uploads` 已绝对 URL;`body_html` 可直接展示(**进 noscript 前必须白名单 sanitize**) |
| `credibility_note` | `TEXT` | 可信度说明(GEO 差异化资产,需可见渲染) |
| `original_date` | `DATE NULL` | 事件原始日期(可空) |
| `published_at` | `DATETIME` | RFC3339 → 直接合规 datePublished |
| `sources` | `JSON` | `[{url,label}]`(GEO 强信号 → JSON-LD citation/isBasedOn) |
| `status` | `VARCHAR(20)` | 恒 `published` |
| `is_featured` | `TINYINT(1)` | 置顶/头条 |
| `score` | `DECIMAL(3,1)` | 0–10 影响力(排序权重,不展示) |
| `view_count` | `BIGINT` | 见开放问题:webhook 覆盖 vs 本侧累加冲突 |
| `heat_external` | `TINYINT` | 0–100 站外热度(榜单排序键) |
| `heat_trend` | `VARCHAR(16)` | 上升速度/飙升标识 |
| `heat_measured_at` | `DATETIME` | 热度测量时刻 |
| `created_at` / `updated_at` | `DATETIME` | `updated_at` = dateModified 真源(freshness 核心) |

**索引**: `uk_slug`(唯一)+ `idx_report_type` + `idx_section` + `idx_published_at` + `idx_heat_external` + `idx_featured_heat(is_featured, heat_external DESC)`。

### `news_deliveries`(去重表,DB 兜底层)

`delivery_id`(`CHAR(36)` UNIQUE)+ `event_type` + `processed_at` + `created_at` + 仅失败路径记 `status`/`error`。Redis SetNX 是秒级一次性闸,这是长期审计兜底。

### `news_webhook_config`(单行专表 `id=1`,对标 `promo_config`)

`enabled`(总开关)+ `webhook_url`(展示给上游)+ `webhook_secret`(hex,脱敏读写)+ `created_at` + `updated_at`。(push_status 类字段:本功能是"接收方"非"推送方",`push_*` 字段**非必需**,见开放问题。)

> **MVP 不建**: `heat_history`(热度趋势历史)、`raw_body` 长期留存。失败路径只记 `status`/`error`。

---

## 5. 分阶段实施计划

### Phase 0 — 接收落库(后端,无 UI 依赖,先打通主干)
- **关键交付物**:
  - 迁移 `0040_news_items_fields.sql` / `0041_news_items_indexes.sql` / `0042_news_items_defaults.sql`(空种子)/ `0043_news_webhook_config_fields.sql`(含 `news_deliveries`)。
  - `internal/news` 模块四文件(model/repository/service/handler)。
  - 公开路由 `POST /api/v1/webhook/minicod-news`(挂 `routes_scholar.go` 公开回调层,**禁中间件**)。
  - HMAC-SHA256 原始字节验签 + Redis/DB 双层幂等 + 三事件落库(created/updated upsert · heat 批量三列覆盖)。
  - `bootstrap.go` 装配。
- **依赖**: 上游先生成密钥(需要先有 Phase 1 配置表写入,或临时用环境变量;推荐 Phase 0 与 Phase 1 配置表合并落地,先手工 INSERT 密钥跑通)。
- **验收**: `docker compose build backend` 编译过 + `docker logs scholar_schema_sync` 迁移过 + 用 curl 带正确/错误签名各打一次(200 / 401),重投同 delivery_id 返 200 不重复进库。

### Phase 1 — admin 配置(后端 + admin 前端)
- **关键交付物**:
  - `GET/PUT /api/v1/admin/news-webhook/config`(`routes_admin.go` adminProtected 组)。
  - 密钥脱敏: `utils.MaskSecret` + `PreserveSecretOnEmpty`(识别 `********` 哨兵保留旧值,**核心反 bug 点**)。
  - admin 配置页: 展示接收 URL(copy)+ `secret-input.tsx`(小眼睛 `?show_sensitive=true` 重 fetch)+ react-query hooks。
- **依赖**: Phase 0 的配置表。
- **验收**: 后台改密钥后 webhook 验签生效;GET 不回明文;PUT 回脱敏值不毁密钥。

### Phase 2 — 公开 API + PC/移动展示(前端为主)
- **关键交付物**:
  - 公开只读 API: `GET /api/v1/news/:slug` · `/news/list?sort=&page=` · `/news/trending?days=&limit=`。
  - **移动**: `features/mobile` 加 `pages/NewsPage.tsx` + `api/news-feed.ts`(`(sortBy,page)` 确定性分页,`offset=(page-1)*PAGE_SIZE`)+ `components/NewsCard.tsx`;`FeedTopTabs.tsx:11` placeholder `to:null` → `/m/feed/news`;`routes.tsx` 加 `{ path:'feed/news' }`。**不复用** feed-seed/feed-cache/feed-position 三件套(冲突点见子文档 02 的 C1~C5)。下拉刷新=`invalidateQueries` 同 key(非换 seed)。
  - **PC**: `features/news/{routes.tsx, pages/NewsDetailPage.tsx, NewsListPage.tsx, api/news.ts, components/}`;`HomePage.tsx:146`↔`<Footer/>` 之间插 `NewsSection`(热榜 Top + 最新流);路由三处登记(`router.tsx` spread + `route-validation.ts` `KNOWN_FIRST_SEGMENTS` 加 `'news'` + `news/routes.tsx`)。
  - 详情 `/news/:slug` **同 URL 响应式不重定向**(保 SEO),不进 `MOBILE_EQUIVALENTS`;404/越权统一 `ResourceError`;分享给 `ShareTarget` union 加 `kind:'news'`。
- **依赖**: Phase 0 落库有数据。
- **验收**: `tsc -b` + `vite build` 过;`/v2-audit` 跑过(跨 feature import 决策见 §6);移动 feed 滑动、PC 首页区、详情页三态可达。

### Phase 3 — SEO / GEO(后端 SSR/sitemap + nginx)
- **关键交付物**:
  - `seo/ssr_meta.go` 加 `NewsSSRMeta`;`config/handler.go` 加 `NewsSEOProvider` 接口 + Setter;`handler_ssr.go` 加 `/news/` case 分支 + `injectNewsSEOMeta` + `buildNewsJSONLD`(`NewsArticle`)。
  - sitemap: `seo/handler.go` 加 `news` case + `versionForKind`;`internal/news` 自提供 `ServeNewsSitemap`(主 `sitemap-news.xml` + 分页,`lastmod=updated_at`,天粒度);`routes.go` 注册;进 `ServeSitemapIndex`(只引 URL)。webhook 落库 bump 缓存失效。
  - nginx `user.conf` SSR 白名单加 `news`(**关键,否则爬虫拿空壳**)。robots / `$is_crawler` map **无需改**(/news 默认放行,AI 爬虫已具名)。
- **依赖**: Phase 2 详情路由 + 公开 API。
- **验收**: `curl -A GPTBot/Baiduspider http://.../news/<slug>` 拿到 noscript 全文 + `NewsArticle` JSON-LD;`sitemap-news.xml` 可访问且进索引。
- **暂缓**: Google News sitemap(48h 窗口 / <1000 URL / `news:` 命名空间,需先被 Google News 收录,优先级低于"结构化数据 + AI 爬虫放行")。

---

## 6. 跨切面决策清单(给推荐)

| 议题 | 选项 | **推荐** |
|---|---|---|
| **路由前缀** | `/news` vs `/intel` vs `/browser/news` | **`/news`**:与 blog/resources 同层级、SEO 友好、对外语义清晰。后端公开 API `/api/v1/news/*`,接收口 `/api/v1/webhook/minicod-news`。 |
| **接收端点挂点** | `/api/v1/webhook/minicod-news`(公开,签名兜底)vs `/api/v1/admin/...`(需 token) | **公开 `/api/v1/webhook/minicod-news`**,挂 `registerPaymentCallbackRoutes` 同层、**禁认证中间件**(防白名单失效),验签即闸。 |
| **移动入口形态** | 独立 `/m/news` vs `/m/feed` 加第三 tab | **`/m/feed` 加 intel tab**(`FeedTopTabs` 已留 placeholder),复用 `VerticalSwipeFeed`,低学习成本、快上线;不进 `MOBILE_EQUIVALENTS`(详情同 URL 响应式)。 |
| **feed 数据契约** | `(seed,page)` 随机 vs `(sortBy,page)` 确定性 | **`(sortBy,page)` 确定性分页**:情报有真实全序(`published_at`/`heat_external`),不能随机;**不复用** seed/cache/position 三件套;下拉刷新=`invalidateQueries`。 |
| **子 tab 收敛** | 三顶级 tab(daily/hourly/热榜)vs 单一时间序 | MVP **单一时间序流**(`published_at DESC`,hourly/daily 混排卡片 chip 区分),section 做二级 chip;热榜留第二阶段,daily 锚点留第三阶段(避免嵌套过深)。 |
| **正文渲染选型** | `body_html` 直渲 vs `body_md` + react-markdown | **`body_md` + react-markdown**(可控、与博客一致);`body_html` 仅用于 SSR noscript(**先白名单 sanitize**)。正文单一真源在后端,**铁律:别往前端 TS 写正文**。 |
| **JSON-LD 类型** | `Article` vs `NewsArticle` | **`NewsArticle`**(继承 Article,Top Stories 目标类型;`publisher.logo` 必给)。 |
| **Google News sitemap** | 做 vs 暂缓 | **暂缓**:需先被 Google News 收录;先做主 `sitemap-news.xml`(`lastmod=updated_at`)+ 结构化数据 + AI 爬虫放行(更高 ROI)。 |
| **heat 刷新对缓存影响** | heat 触 dateModified/bump sitemap vs 隔离 | **隔离**:`news.heat` 只刷热度三列,**不改 `updated_at`、不触 `dateModified`、不 bump sitemap**(热度≠内容更新,防虚假新鲜);只有 `news.updated` 走 freshness 闭环(`updated_at`→`dateModified`→sitemap `lastmod`→bump 缓存失效)。 |
| **PC NewsSection 跨 feature import** | home 直接 import news(违 CLAUDE.md §1) vs 提 shared 纯展示 | **NewsSection 提 shared 纯展示(props-in)**,数据由 home 注入;或 home 受控例外。**PR 必跑 `/v2-audit` 定调**。 |
| **幂等层数** | 仅 Redis vs Redis + DB | **Redis SetNX(24h,fail-open)+ DB UNIQUE 兜底**(秒级拦截 + 长期审计)。 |
| **配置存储** | `system_configs` k-v vs 单行专表 | **单行专表 `news_webhook_config`**(对标 promo 0039),字段类型明确、脱敏逻辑清晰。 |

---

## 7. 风险与开放问题汇总(四篇去重后)

**接收/落库(01)**
1. `enabled=false` 时接收行为:仍接收落库 vs 直接拒收?(推荐:仍验签接收,只是配置未就绪前无密钥则 401)
2. heat 事件**早于**对应正文到达(item 尚未 created):跳过 vs 占位行?(推荐:跳过缺 id 项)
3. 时间戳回放窗口:是否校验 `X-Minicod-News-Timestamp` 防重放?多大窗口?
4. 同步 vs 异步落库:大批 heat 是否走 goroutine(`safego`)避免阻塞 10s 内 2xx?
5. `sources` 列类型:`JSON` vs 关联子表?(推荐 JSON,无需 join)
6. 接收端是否限流(防滥用,验签已是主闸)。
7. `raw_body` 是否留存(MVP 不留,仅失败路径记 error)。

**展示/数据(03/02)**
8. `view_count` 归属:webhook 覆盖 vs 本侧前端打点累加?二者冲突如何裁决(单一真源)。
9. 首页榜单排序算法:纯 `heat_external` 线性 vs `(view_count + heat_trend + recency)` 复合评分。
10. 是否进 `/search` 聚合检索(与论文/期刊/学者四源合并)。
11. `heat_trend` 格式:文本(飙升/上升/平稳/下降)vs `{current, previous, emoji}`?(推荐后端返字符,前端直渲)
12. 是否需要后台手工发布/草稿态(当前定位:纯 webhook 接收,无编辑后台)。
13. 权限:全部公开 vs 分内部/公开 tier(当前:全公开只读)。

**SEO/GEO(04)**
14. **封面图缺口**:上游 `item` 无 `image` 字段。上游补字段 vs 本侧默认图?(影响 JSON-LD `image`、OG、PC 中栏带图卡)
15. `body_html` sanitize 白名单定稿(stored-XSS + SEO 双重必要)。
16. 分区页 `/news/section/{section}` 是否独立可索引落地页(路径形避免重复页)。
17. `author` 主体:机构(成都恩特罐罐文化科技)vs 具名?
18. `original_date` 展示用途(历史日期语义)。
19. News sitemap 分片阈值。
20. SSR 缓存 TTL 与 `news.updated` 主动失效的配合粒度。
21. Google News sitemap 是否申请(暂缓,见 §6)。

---

## 8. 与其他 agent 并行开发的协调提示

**本功能将占用以下新增资源,其它并行 agent 请避让:**

- **迁移编号 `0040`–`0043`**(四个 SQL 文件):`0040_news_items_fields` / `0041_news_items_indexes` / `0042_news_items_defaults` / `0043_news_webhook_config_fields`(含 `news_deliveries`)。**任何并行新建迁移请从 `0044` 起**,避免编号撞车导致重放顺序混乱。
- **新增后端模块 `backend/internal/news/`**(model/repository/service/handler [+ 可选 webhooks.go]):全新目录,与现有模块无重叠;但会**改动**共享文件:`cmd/server/bootstrap.go`(装配一行)、`cmd/server/routes.go`(公开 API)、`cmd/server/routes_scholar.go`(webhook 回调路由)、`cmd/server/routes_admin.go`(配置路由)、`internal/config/handler_ssr.go`(SSR case)、`internal/config/handler.go`(NewsSEOProvider 接口 + Setter)、`internal/seo/handler.go`(sitemap index)、`internal/seo/ssr_meta.go`(NewsSSRMeta)。**这些是热点共享文件,提交前 rebase / 解冲突优先。**
- **新增前端 feature `frontend-user/src/features/news/`**(全新目录);改动共享文件:`app/router.tsx`(spread 路由)、`shared/lib/route-validation.ts`(`KNOWN_FIRST_SEGMENTS` 加 `'news'`)、`shared/components/share/*`(`ShareTarget` union 加 `kind:'news'`);移动端改 `features/mobile/{routes.tsx, components/FeedTopTabs.tsx}` + 新增 `features/mobile/{pages/NewsPage.tsx, api/news-feed.ts, components/NewsCard.tsx}`;PC 首页改 `features/home/HomePage.tsx`(插 NewsSection)。
- **nginx**: 改 `nginx/conf.d/user.conf` SSR 白名单(加 `news`)。robots / `$is_crawler` map 无需改。
- **数据表命名空间**: `news_items` / `news_deliveries` / `news_webhook_config`;Redis 键前缀 `news:delivery:*`。请其它功能勿复用此命名空间。

> 协调要点:**迁移编号、`bootstrap.go`、`routes*.go`、`router.tsx`、`route-validation.ts`、`handler_ssr.go` 是与他人最易冲突的接缝**。建议本功能单独开 feature 分支、先合并迁移与路由骨架(小 PR),再分批合展示层。
