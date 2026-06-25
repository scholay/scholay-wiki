# 情报功能 · 数据接收(webhook)/ 验签 / 幂等 / 落库 / 热度覆盖 / admin 配置 —— 后端技术设计

> 范围:本文只覆盖**后端数据面**——接收 Minicod news webhook、验签、幂等、落库、热度覆盖,以及 admin 后台配置。
> 前端 feed / 详情页 / SEO 渲染另文(本文给出落库字段与公开读模型作为契约,供前端文档对接)。
> 所有 file:line 引用为撰写时的快照,实现前请自行 `grep` 复核。

---

## 1. 概述与上游协议(精炼复述)

上游 = **Minicod news webhook**,server-to-server `POST`,`Content-Type: application/json`。三类事件,由请求头 `X-Minicod-News-Event` 区分:

| 事件 | 语义 | body 形态 | 落库动作 |
|---|---|---|---|
| `news.created` | 情报首次发布 | 单条 `item` | 按 `item.id` 插入(已存在则覆盖) |
| `news.updated` | 已发布情报内容更新 | 单条 `item` | 按 `item.id` upsert 覆盖全字段 |
| `news.heat` | 一批站外热度刷新(不含正文) | `{ event, version, measured_at, count, items[] }`,`items[]` 只含 `id/slug/url/heat_external/heat_trend/heat_measured_at` | 按 `items[].id` 批量只更新热度三列,不动正文 |

请求头:
- `X-Minicod-News-Event`:`news.created | news.updated | news.heat`
- `X-Minicod-News-Delivery`:uuid,本次投递唯一 id → **幂等去重键**
- `X-Minicod-News-Signature`:`sha256=<对原始 body 字节做 HMAC-SHA256 的 hex>`
- `X-Minicod-News-Timestamp`:Unix 秒(可选用于回放窗口校验)

**验签(必做)**:用后台配置的密钥对【原始请求体字节】算 HMAC-SHA256 hex,与签名去掉 `sha256=` 前缀做**常量时间比较**;不过 → 401 拒收,无降级。**绝不能** `json.Unmarshal` 后再 marshal 重算(字段顺序/空白会变,签名必挂)。

**返回契约**(上游侧行为,内侧据此设计返回码):
- `~10s 内 2xx` = 已接收 → 上游停止重试。
- `429`(可带 `Retry-After`)= 整批退避。**内侧当前无全局容量问题,不主动返 429。**
- 其它非 2xx = 失败 → 上游按 `1m / 5m / 30m / 2h / 6h` 退避重试,5 次后进死信(上游可手动重投)。

本侧需求拆解:
1. 后台配置:webhook 接收 URL(展示给上游)+ 密钥(上游生成的 hex,如 `c286e0...`)。
2. 接收 / 验签 / 幂等 / 落库 / 热度覆盖(本文主体)。
3~5. 移动 feed / PC 首页情报区 / `/news/:slug` SEO 页面(本文只产出落库与读模型契约,实现另文)。

**复用什么现有模式(一句话总览)**:
- 验签:对标 `wechatofficial` 的对称 HMAC 思路(把 SHA1 换成 HMAC-SHA256 + 常量时间比较)。
- 幂等:对标 `wechatofficial` 的 Redis `SetNX` 一次性闸 + 新增 DB 去重表做长期审计。
- 单行配置 + 公开下发关闭只回 `enabled:false`:对标 **`promo`(迁移 0039)**。
- 密钥脱敏读回:`utils.MaskSecret` / `utils.PreserveSecretOnEmpty` + 前端 `secret-input.tsx`。
- 公开回调路由(无中间件):对标 `registerPaymentCallbackRoutes`。
- 迁移三段式 + 幂等存储过程:`0000_utils.sql`。

新建后端模块 `backend/internal/news/`(`model.go` / `repository.go` / `service.go` / `handler.go`),结构对齐 `promo` / `wechatofficial`。

---

## 2. 接收端点设计

### 2.1 路由路径与挂载层

webhook 是**外部主动回调进来的公开端点**,不出现在前端代码里,验签即闸,**禁止挂任何认证中间件**(挂了等于把 IP/token 白名单变成接收前置,反而把上游挡在外面,且与现有支付回调约定冲突)。沿用 `registerPaymentCallbackRoutes` 的挂法(`backend/cmd/server/routes_scholar.go:18-30`):

```
POST /api/v1/webhook/minicod-news     ← 公开,验签即闸(本文采用此路径)
```

挂载点:在 `registerPaymentCallbackRoutes`(`routes_scholar.go:20`)内追加一行,或在 `routes.go:137` 已调用该函数之后由它统一注册。**不要**放进 `registerAdminRoutes`(`routes_admin.go:17-19`,该组 `Use(AdminAuthMiddleware())`)。

> **开放问题对齐**:勘探里出现过 `/api/v1/admin/minicod-webhook` 与 `/api/v1/_/webhooks/...` 两种候选。结论:**走公开 `/webhook/minicod-news`,签名兜底**,与支付/微信回调一致;admin 端只放"配置读写 + 测试投递",不放真实接收口。

admin 配置读写挂 `adminProtected` 组(`routes_admin.go:18-19`,`AdminAuthMiddleware` 之后),与 promo 的 `/admin/promo/config`(`routes_admin.go:101-102`)同级:

```
GET  /api/v1/admin/news-webhook/config        ← 读(密钥脱敏)
PUT  /api/v1/admin/news-webhook/config        ← 写(留空/遮罩保留旧密钥)
POST /api/v1/admin/news-webhook/test          ← (可选)发样本投递自测
```

公开下发(给前端 feed 用,非 webhook):后续另文,沿用 `api.GET("/config/...")` 顶层公开模式(`routes.go:120-131`)与 content 公开 API(`routes.go:128-130`)。

### 2.2 如何读原始 body 字节(gin)

`http.Request.Body` 是一次性 `io.Reader`,读过即空。验签**必须先于** `json.Unmarshal`,且两者用同一份字节。

参考 `wechatofficial/handler.go:148-154`(`io.ReadAll(c.Request.Body)` 取原始字节再 `xml.Unmarshal`):

```go
raw, err := io.ReadAll(c.Request.Body)
if err != nil {
    c.JSON(http.StatusBadRequest, gin.H{"error": "read body failed"})
    return
}
// 验签用 raw;后续 json.Unmarshal(raw, &payload) 复用同一份 raw,不再触碰 c.Request.Body
```

> 若后续有 middleware 需要二次读,可在读后 `c.Set(gin.BodyBytesKey, raw)` 缓存,`c.GetRawData()` 取回(gin 内部约定)。本场景 handler 单点读取,直接持 `raw` 局部变量即可,**不要**用 `c.ShouldBindJSON`(它会自行读流且无法拿到验签所需的原始字节)。
> 注意:勿对 body 做任何归一化(trim / 重排 / 反序列化再序列化),HMAC 必须吃到上游发出的**逐字节**内容。

### 2.3 HMAC-SHA256 常量时间验签(伪代码)

复用仓库现有验签写法:对称密钥验签结构参考 `wechatofficial/service.go:90-102`(`VerifySignature`,目前用 `crypto/sha1` + `hex.EncodeToString` + `==` 比较)。本端在它基础上做两处升级:**SHA1 → HMAC-SHA256**、`==` → `crypto/subtle.ConstantTimeCompare`(`==` 字符串比较是短路的,理论上可被计时侧信道探测;签名校验必须常量时间)。

放在 `internal/news/service.go`(或 `webhooks.go`):

```go
// VerifySignature 复用 wechatofficial/service.go:90-102 的对称验签骨架,
// 升级为 HMAC-SHA256 + 常量时间比较。secret = 后台配置的 webhook_secret。
//
//   import ("crypto/hmac"; "crypto/sha256"; "crypto/subtle"; "encoding/hex"; "strings")
func (s *Service) VerifySignature(rawBody []byte, sigHeader, secret string) bool {
    if secret == "" || sigHeader == "" {
        return false // 未配置密钥 / 缺签名 → 直接拒,fail-closed
    }
    got := strings.TrimPrefix(sigHeader, "sha256=")    // 去前缀
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(rawBody)                                  // 原始字节,不可改
    want := hex.EncodeToString(mac.Sum(nil))
    // 常量时间比较:长度不等时 ConstantTimeCompare 直接 0,无侧信道泄漏
    return subtle.ConstantTimeCompare([]byte(got), []byte(want)) == 1
}
```

> 参考实现坐标:
> - 现有对称验签骨架:`backend/internal/wechatofficial/service.go:90-102`
> - POST 回调验签前置(读 header → 验签失败 401):`backend/internal/wechatofficial/handler.go:132-146`
> - 常量时间比较标准库:`crypto/subtle.ConstantTimeCompare`(本仓库新引入,无现成 import)。

可选:对 `X-Minicod-News-Timestamp` 加回放窗口(如 `now - ts > 5min` 拒收),防签名重放。MVP 可不做(幂等去重已覆盖重复投递),但建议预留校验位。

### 2.4 三事件分发

验签 + 幂等通过后,按 `X-Minicod-News-Event` 分支(对标 `wechatofficial/handler.go:173-253` 的 `switch msgType`):

```go
event := c.GetHeader("X-Minicod-News-Event")
switch event {
case "news.created", "news.updated":
    var p struct{ Item NewsItemPayload `json:"item"` }   // 或上游实际字段名,需对齐
    if err := json.Unmarshal(raw, &p); err != nil { /* 400 */ }
    svc.UpsertItem(ctx, p.Item)                          // 按 item.id 覆盖
case "news.heat":
    var p NewsHeatPayload                                 // { items:[{id,heat_external,heat_trend,heat_measured_at}] }
    if err := json.Unmarshal(raw, &p); err != nil { /* 400 */ }
    svc.ApplyHeat(ctx, p.Items)                           // 按 items[].id 批量只更热度
default:
    // 未知事件:记 deliveries(event_type=unknown)+ 回 200(避免上游无谓重试),slog.Warn
    c.JSON(http.StatusOK, gin.H{"ok": true, "ignored": true})
    return
}
```

`news.created` 与 `news.updated` 落库逻辑相同(都按 `item.id` upsert),**分两个 case 只为日志/审计区分**,可合并实现。

> 落库可选异步:正文 upsert / 批量热度更新可丢进 `safego` 后台 goroutine,先回 2xx 再落库,降低上游感知延迟、避开 ~10s 超时。**但**异步会让"返 2xx 但落库失败"对上游不可见(上游不会重试)。权衡:MVP 建议**同步落库**(单条 insert/update 很快,远低于 10s),保证 2xx 语义真实;只有当落库被证明会逼近 10s 时再改异步。`news.heat` 批量大时可异步(热度允许最终一致)。

### 2.5 返回码契约落地

| 场景 | 返回 | 说明 |
|---|---|---|
| 验签失败 / 缺签名 / 缺密钥 | `401` | `slog.Warn` 记 `ip`/原因,不回显细节 |
| body 解析失败(JSON 坏) | `400` | 上游会重试,但坏 body 重试也救不回 → 同时 `slog.Error` |
| delivery 已处理(幂等命中) | `200` | 直接返成功,不重复落库(见 §3) |
| 落库成功 / 未知事件忽略 | `200` | `{ "ok": true }` |
| 落库失败(同步路径) | `500` | 触发上游退避重试(`1m/5m/30m/2h/6h`),`slog.Error` |
| —— | ~~`429`~~ | **本端不主动返**(无全局容量闸);若将来加接收限流再启用并带 `Retry-After` |

防滥用:接收端点已被验签兜底;额外可挂 IP 维度速率限制(项目有 `middleware.RateLimitMiddleware` / 顶层 tieredRL),但因公开回调不在 `tieredRL` 组内,需单独按需挂。情报为只读公开内容、不计 token,**无须对接 vip 额度**。

---

## 3. 幂等(去重)设计

去重键 = `X-Minicod-News-Delivery`(uuid,每次投递唯一)。**双层策略**,对标 `wechatofficial` 的 Redis 一次性闸(`handler.go:34-48` `isDuplicateMessage`,`SetNX(key, "1", ttl)`):

### 3.1 第一层:Redis 一次性闸(秒级拦截)

```go
// 复用 wechatofficial/handler.go:34-48 思路:SetNX 返回 false 表示键已存在=重复投递
ok, _ := rdb.SetNX(ctx, "news:delivery:"+deliveryID, "1", 24*time.Hour).Result()
if !ok {
    c.JSON(http.StatusOK, gin.H{"ok": true, "duplicate": true})  // 已处理,直接回 200
    return
}
```

TTL 取 **24h**(覆盖上游 `1m→6h` 共 ~5 次重试的整个窗口,留足余量;微信场景只需 5min,情报重试窗口更长)。Redis 不可用时 `SetNX` 报错 → **fail-open 放行**(与 wechatofficial 一致,不因去重设施故障拒服务),靠第二层 DB 唯一键兜底。

### 3.2 第二层:DB 去重表(长期审计 + 兜底)

`news_deliveries` 表对 `delivery_id` 建 **UNIQUE**。落库时先尝试 `INSERT`,命中唯一冲突 → 视为重复,跳过业务写库:

```go
// 写一条 deliveries(delivery_id UNIQUE);冲突即重复
err := repo.RecordDelivery(ctx, deliveryID, eventType)   // INSERT ... ON DUPLICATE KEY 或捕获 1062
if errors.Is(err, ErrDuplicateDelivery) {
    return // 已处理
}
```

DB 层是真理之源:即便 Redis 在某次重启后丢键、或 fail-open 放行了重复投递,唯一约束仍保证 `news_deliveries` 不重复、业务写库不被重复触发。

### 3.3 三事件的写库逻辑(与幂等关系)

- **`news.created` / `news.updated`(按 `item.id` 覆盖)**:`item.id` 是稳定 uuid 主键,天然幂等——`INSERT ... ON DUPLICATE KEY UPDATE`(GORM `clause.OnConflict{UpdateAll: true}` 或 map Updates)。即使去重层漏掉、同一 item 被处理两次,结果一致(同字段覆盖)。delivery 去重主要防"同一次投递被重复 HTTP 触发"导致的重复审计/无谓写。
- **`news.heat`(按 `items[].id` 批量覆盖热度)**:遍历 `items[]`,对每个 `id` 只 `UPDATE news_items SET heat_external=?, heat_trend=?, heat_measured_at=? WHERE id=?`。**不动正文字段**。`id` 不存在(热度先于正文到达)→ 该条 skip + `slog.Info`(不报错,等正文事件补齐)。批量建议单事务或 `CASE WHEN` 批量 update;条数通常不大,逐条 update 亦可。

> 是否需要 `news_heat_history`(热度变更流水):勘探建议过。**MVP 不建**——`heat_trend` 上游已直给(飙升/↑/→/↓),前端无需本端算趋势。若将来要画"热度时间曲线 / 自算飙升速率",再加 `news_heat_history(item_id, heat_external, measured_at)` 追加表。本文按 **不建** 落地,列入开放问题。

---

## 4. 数据库表设计

新增迁移**从 0040 起**(最新为 `docker/mysql/migrations/0039_promo_config.sql`)。沿用三段式 + `0000_utils.sql` 幂等存储过程。中文字段必须 `utf8mb4 COLLATE utf8mb4_unicode_ci`(防 mojibake)。

### 4.1 情报主表 `news_items`(逐字段映射 item)

| 列名 | 类型 | 来源 item 字段 | 说明 / 索引 |
|---|---|---|---|
| `id` | `CHAR(36)` | `id`(uuid) | **PRIMARY KEY**,稳定主键,upsert 依据 |
| `slug` | `VARCHAR(200)` | `slug` | **UNIQUE `uk_slug`**,详情页路由 `/news/:slug` |
| `url` | `VARCHAR(768)` | `url` | 原文/规范 URL |
| `report_id` | `VARCHAR(64)` | `report_id` | 所属报告 id |
| `report_type` | `VARCHAR(16)` | `report_type` | `hourly`(快讯)/`daily`(今日要览);`idx_report_type` |
| `section` | `VARCHAR(32)` | `section` | `major-event/china-policy/top-journal/other`;`idx_section`(或与 published_at 组合,见下) |
| `section_label` | `VARCHAR(64)` | `section_label` | 板块中文标签 |
| `title` | `VARCHAR(500)` | `title` | 标题 |
| `summary` | `TEXT` | `summary` | 摘要 |
| `body_md` | `LONGTEXT` | `body_md` | 中文正文 markdown(`/uploads` 已绝对 URL) |
| `body_html` | `LONGTEXT` | `body_html` | 中文正文 HTML(可直接展示;详情页/SSR 用) |
| `credibility_note` | `TEXT` | `credibility_note` | 可信度说明 |
| `original_date` | `DATE NULL` | `original_date` | `YYYY-MM-DD`,可空 |
| `published_at` | `DATETIME` | `published_at`(RFC3339) | **`idx_published_at`(DESC 排序用)**,快讯流主排序键 |
| `sources` | `JSON`(或 `TEXT`) | `sources`([{url,label}]) | 信源数组;MySQL 5.7+ 用 `JSON`,稳妥可 `TEXT` 存原始 JSON 串 |
| `status` | `VARCHAR(16)` | `status`(恒 `published`) | 预留状态机位;默认 `published` |
| `is_featured` | `TINYINT(1)` | `is_featured` | 精选标 |
| `score` | `DECIMAL(3,1)` | `score`(0-10) | 质量分 |
| `view_count` | `INT UNSIGNED` | `view_count` | 浏览量(上游给初值;本端点击可叠加) |
| `heat_external` | `TINYINT UNSIGNED` | `heat_external`(0-100) | **站外热度;`idx_heat_external`(DESC)**,热榜主排序键 |
| `heat_trend` | `VARCHAR(16)` | `heat_trend` | 趋势(飙升/上升/平稳/下降 或 ↑→↓);`news.heat` 覆盖 |
| `heat_measured_at` | `DATETIME NULL` | `heat_measured_at` | 热度测量时间;`news.heat` 覆盖 |
| `created_at` | `DATETIME` | `created_at` | 上游创建时间(建议存上游值;若按本端落库时间则用默认) |
| `updated_at` | `DATETIME` | `updated_at` | `ON UPDATE CURRENT_TIMESTAMP` |

索引建议(权衡读路径):
- `PRIMARY KEY (id)` —— upsert。
- `UNIQUE uk_slug (slug)` —— 详情页查 + 防重。
- `idx_published_at (published_at)` —— 快讯流 `ORDER BY published_at DESC`。
- `idx_heat_external (heat_external)` —— 热榜 `ORDER BY heat_external DESC`。
- 可选复合 `idx_featured_heat (is_featured, heat_external)` —— PC 首页"精选热门"取数。
- 可选 `idx_section (section)` —— 板块筛选(若前端做板块 tab)。

> 排序列建二级索引时 MySQL 可单向扫描;若主排序总是 DESC,`idx_heat_external (heat_external DESC)`(8.0+ 支持降序索引)更优,5.7 用普通索引由优化器反向扫描即可。

### 4.2 投递去重表 `news_deliveries`

| 列名 | 类型 | 说明 |
|---|---|---|
| `delivery_id` | `CHAR(36)` | **UNIQUE `uk_delivery_id`**(去重核心);来自 `X-Minicod-News-Delivery` |
| `event_type` | `VARCHAR(32)` | `news.created/updated/heat` |
| `received_at` | `DATETIME` | 收到时间 |
| `created_at` | `DATETIME` | `DEFAULT CURRENT_TIMESTAMP` |

可选排障增强:
- `raw_body LONGTEXT NULL` —— 存原始投递体,用于"验签失败/解析失败"复现。**建议:仅在失败路径存**(成功不存,避免主路径写放大 + 隐私冗余);或单独建 `news_webhook_failures` 失败日志表只在 401/400/500 时落,正常投递不落。
- `status VARCHAR(16)` + `error TEXT` —— 记 `ok/duplicate/sig_failed/parse_failed/db_failed`,admin 可在后台看"最近投递结果分布",定位上游集成问题。

> **本文落地建议**:`news_deliveries` 含 `delivery_id(UNIQUE)/event_type/status/error/received_at/created_at`;**不**在成功路径存 `raw_body`(冗余 + 隐私)。验签/解析失败时把简要原因写进 `status/error`,需要全文复现时再临时加 `raw_body` 列(迁移幂等,加列零风险)。事件日志 = 复用本表的 `status/error`,不另起表。

### 4.3 admin 配置表 `news_webhook_config`(单行,id=1)

完全对标 `promo_config`(`0039_promo_config.sql:11-25`):单行(id 恒 1)+ `enabled` 总开关 + `created_at/updated_at`,`INSERT IGNORE` seed 默认关闭。

| 列名 | 类型 | 说明 |
|---|---|---|
| `id` | `INT UNSIGNED DEFAULT 1` | **PRIMARY KEY**,恒 1 |
| `enabled` | `TINYINT(1) DEFAULT 0` | 接收总开关(关闭时接收端可直接 200 忽略或 503,见开放问题) |
| `webhook_url` | `VARCHAR(500)` | 展示给上游配置的接收地址(本端不据此路由,纯展示) |
| `webhook_secret` | `VARCHAR(255)` | 上游生成的 hex 密钥;验签用;**读回脱敏** |
| `created_at` | `DATETIME DEFAULT CURRENT_TIMESTAMP` | |
| `updated_at` | `DATETIME ... ON UPDATE CURRENT_TIMESTAMP` | |

> 可选 `push_status/last_pushed_at/push_error`(对标 `agent_config` 的推送状态):仅当本端**主动 push 配置给上游**才需要。Minicod 场景是**上游 push 给我们**(我们被动接收),本端不向上游推任何东西,故 **不加** push_* 列。admin 想看接收健康度 → 看 `news_deliveries.status` 分布即可。

### 4.4 迁移文件命名与幂等写法约定

接续 0039,**下一个编号 0040**。字段少的单行配置表二合一(fields+seed 同文件,如 0039 做法);字段多的主表/去重表分段式。建议:

```
0040_news_items_fields.sql      -- CREATE TABLE IF NOT EXISTS news_items (...) utf8mb4
0040_news_items_indexes.sql     -- CALL add_index_if_not_exists('news_items','uk_slug','slug',TRUE) 等
0041_news_deliveries.sql        -- 去重表(字段少,CREATE IF NOT + add_index uk_delivery_id 二合一)
0042_news_webhook_config.sql    -- 单行配置(CREATE IF NOT + INSERT IGNORE id=1, enabled=0;对标 0039)
```

> 编号在同一逻辑批次内"字段→索引→默认值"递增即可(参考 CLAUDE.md 迁移规范);上面把 items 的 fields/indexes 同号 0040 分文件,deliveries/config 各占一号,符合"按创建顺序递增"。最终编号以提交时目录实况为准(若期间已有人占用 0040)。

幂等铁律(CLAUDE.md + `0000_utils.sql`):
- 建表 `CREATE TABLE IF NOT EXISTS ... ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`。
- 加列 `CALL add_column_if_not_exists('news_items','xxx','VARCHAR(...) ...')`(`0000_utils.sql:7-27`)。
- 加索引 `CALL add_index_if_not_exists('news_items','uk_slug','`slug`',TRUE)`(`0000_utils.sql:31-56`)。
- 种子 `INSERT IGNORE INTO news_webhook_config (id, enabled) VALUES (1, 0);`(对标 `0039_promo_config.sql:25`)。
- **永不** `DROP TABLE` / 破坏性操作。

验证:`docker-compose restart schema-sync backend` → `docker logs scholar_schema_sync`(看迁移是否全过)+ `docker logs scholar_backend`(看启动)。

---

## 5. admin 后台配置

### 5.1 存专表 vs system_configs —— 推荐专表(单行)

| 方案 | 适用 | 本场景 |
|---|---|---|
| 单行专表(id=1) | 字段固定、有强类型、有开关 | ✅ **推荐**,对标 `promo_config`(0039)/ `github_oauth_config` / `wechat_official_config` |
| `system_configs`(kv) | 灵活、零散、临时配置 | ✗ 密钥 + URL + 开关是强结构,kv 反而难脱敏/难校验 |

**最新最干净的范例 = `promo`(迁移 0039)**:单行表 + service `GetConfig/UpdateConfig` + repo `First` 兜底空配置(`promo/repository.go:20-29`)+ `Updates(map[...])` 全字段写(避免 GORM 跳零值导致 `enabled` 关不掉,`promo/repository.go:32-41`)。news 直接照搬这套骨架。

### 5.2 字段与脱敏

- `webhook_url`:接收 URL,**纯展示**(给上游配置用),后台可编辑 + 提供 copy 按钮。非敏感。
- `webhook_secret`:**敏感**。读回脱敏,写入"留空/遮罩保留旧值"。

后端复用 `utils`(`backend/internal/common/utils/secret.go`):
- 读(GET):`utils.MaskSecret(&cfg.WebhookSecret, utils.IsShowSensitive(c, "show_sensitive"))`(`secret.go:26-30, 34-36`)。默认脱敏成 `********`,`?show_sensitive=true` 回明文(供 admin 点眼睛查看)。
- 写(PUT):`val, ok := utils.PreserveSecretOnEmpty(c, in.WebhookSecret, existing.WebhookSecret, exists, "Webhook Secret")`(`secret.go:50-59`)。把 `""` 或 `********` 都识别为"用户没改 → 保留旧值"。**这是核心反 bug 点**:若不识别 `********`,前端拿 GET 的脱敏值 PUT 回来会把真密钥洗成 `********`(`secret.go:7-9, 48-49` 注释明确警告;`wechatofficial/handler.go:310-323` 是同款 `strings.Contains(x,"****")` 保留逻辑的现成案例)。

> 也可直接对标 wechatofficial 的 `MaskSensitiveData()` + handler 内 `strings.Contains(..., "****")` 保留(`handler.go:289-323`)。两套等价,**优先用 `utils.secret.go` 的统一函数**(`PreserveSecretOnEmpty` 已封装"新建必填校验 + 留空保留"全套)。

### 5.3 读写端点(handler 层)

`internal/news/handler.go`,对标 `promo/handler.go`:

```go
// GET /admin/news-webhook/config —— 读,密钥脱敏(?show_sensitive=true 解蔽)
func (h *Handler) GetConfig(c *gin.Context) {
    cfg, _ := h.svc.GetConfig()
    utils.MaskSecret(&cfg.WebhookSecret, utils.IsShowSensitive(c, "show_sensitive"))
    utils.Success(c, cfg)
}

// PUT /admin/news-webhook/config —— 写,留空/遮罩保留旧密钥
func (h *Handler) UpdateConfig(c *gin.Context) {
    var in NewsWebhookConfig
    if err := c.ShouldBindJSON(&in); err != nil { utils.BadRequest(c, "参数格式错误"); return }
    existing, _ := h.svc.GetConfig()
    val, ok := utils.PreserveSecretOnEmpty(c, in.WebhookSecret, existing.WebhookSecret, existing != nil, "Webhook Secret")
    if !ok { return }     // PreserveSecretOnEmpty 已写 400
    in.WebhookSecret = val
    if err := h.svc.UpdateConfig(&in); err != nil { utils.ServerError(c, "保存配置失败"); return }
    utils.SuccessWithMessage(c, "已保存", nil)
}
```

路由注册:`routes_admin.go` 在 promo 配置那两行附近(`routes_admin.go:101-102`)追加:

```go
adminProtected.GET("/news-webhook/config", h.news.GetConfig)
adminProtected.PUT("/news-webhook/config", h.news.UpdateConfig)
// 可选自测:adminProtected.POST("/news-webhook/test", h.news.TestDelivery)
```

bootstrap 装配:对标 `bootstrap.go:318`(`promoHandler := promo.NewHandler(promo.NewService(promo.NewRepository(db)))`)与 `bootstrap.go:431`(挂进 `allHandlers`)。`allHandlers` struct 加 `news *news.Handler` 字段(`routes.go:60-97` 附近,参考 `promo` 字段 `routes.go:95`)。

### 5.4 前端配置页要点

- 页面:`features/admin/pages/`(新建 `NewsWebhookConfigPage` 或并入现有配置页 tab)。
- `webhook_url`:普通文本 + copy 按钮(给上游)。
- `webhook_secret`:`@/shared/ui/secret-input.tsx`(右侧小眼睛,点击翻转 revealed 并以 `?show_sensitive=true` 重新 fetch 拿明文)。**保存时不要回填 GET 的 `********`**——交给后端 `PreserveSecretOnEmpty` 兜底,即便误传也不会洗掉旧密钥。
- 数据层:`features/admin/api/*.ts` 导出 react-query hooks `useNewsWebhookConfig` / `useUpdateNewsWebhookConfig`,走 `@/shared/lib/http`(前端铁律:不裸 fetch,业务 API 进 feature 的 api 层)。参考已有 admin 配置 hooks(如 oauth 配置)。
- (可选)"测试投递"按钮 → `POST /admin/news-webhook/test`,后端自构造一条样本走完整验签+落库链路,返回 200/错误码供后台确认配置生效。

---

## 6. 落地步骤清单(file 级)

### 6.1 数据库迁移(新增)
1. **新增** `docker/mysql/migrations/0040_news_items_fields.sql` —— `news_items` 建表(§4.1,utf8mb4)。
2. **新增** `docker/mysql/migrations/0040_news_items_indexes.sql` —— `uk_slug` / `idx_published_at` / `idx_heat_external`(+ 可选 `idx_featured_heat`/`idx_section`),用 `add_index_if_not_exists`。
3. **新增** `docker/mysql/migrations/0041_news_deliveries.sql` —— 去重表 + `uk_delivery_id`(§4.2)。
4. **新增** `docker/mysql/migrations/0042_news_webhook_config.sql` —— 单行配置 + `INSERT IGNORE` seed(对标 `0039_promo_config.sql`)。
   - 验证:`docker-compose restart schema-sync backend` → `docker logs scholar_schema_sync`。

### 6.2 后端模块(新增)
5. **新增** `backend/internal/news/model.go` —— `NewsItem`(主表 GORM 模型 + `TableName`)、`NewsDelivery`、`NewsWebhookConfig`(对标 `promo/model.go`)、webhook payload 结构(`NewsItemPayload`/`NewsHeatPayload`)+ 公开读 DTO(对标 `promo` 的 `PublicView`)。
6. **新增** `backend/internal/news/repository.go` —— `UpsertItem`(`ON DUPLICATE KEY UPDATE`)、`ApplyHeat`(批量只更热度三列)、`RecordDelivery`(`delivery_id` UNIQUE 冲突即重复)、`GetConfig`/`UpdateConfig`(对标 `promo/repository.go`,`Updates(map[...])` 全字段写)。
7. **新增** `backend/internal/news/service.go` —— `VerifySignature`(§2.3 HMAC-SHA256+常量时间)、`UpsertItem`/`ApplyHeat`、`GetConfig`/`UpdateConfig`(对标 `promo/service.go`)。
8. **新增** `backend/internal/news/handler.go` —— `ReceiveWebhook`(读原始 body→验签→Redis+DB 幂等→分发→落库→返回码,§2/§3)、`GetConfig`/`UpdateConfig`(admin,§5.3)、可选 `TestDelivery`。

### 6.3 路由 / 装配(改动)
9. **改动** `backend/cmd/server/bootstrap.go` —— 新增 `newsHandler := news.NewHandler(news.NewService(news.NewRepository(db)))`(对标 `:318`),挂进 `allHandlers`(对标 `:431`)。`import` 加 `scholar-backend/internal/news`(对标 `:44`)。
10. **改动** `backend/cmd/server/routes.go` —— `allHandlers` struct 加 `news *news.Handler` 字段(对标 `:95` 的 `promo`);`import` 加 `news`(对标 `:37`)。
11. **改动** `backend/cmd/server/routes_scholar.go` —— `registerPaymentCallbackRoutes`(`:20-30`)内追加 `api.POST("/webhook/minicod-news", h.news.ReceiveWebhook)`(公开,无中间件)。
12. **改动** `backend/cmd/server/routes_admin.go` —— `adminProtected` 组(promo 那两行 `:101-102` 附近)追加 `GET/PUT /news-webhook/config`(+ 可选 `POST /news-webhook/test`)。

### 6.4 前端(改动 / 新增,本文范围内只列配置页)
13. **新增/改动** `frontend-user/src/features/admin/api/*.ts` —— `useNewsWebhookConfig` / `useUpdateNewsWebhookConfig`(走 `@/shared/lib/http`)。
14. **新增** `frontend-user/src/features/admin/pages/NewsWebhookConfigPage.tsx`(或并入现有配置页 tab)—— URL 展示+copy、`secret-input` 密钥、(可选)测试按钮。

> feed / 详情页 / 公开读 API / SSR / sitemap / robots 的实现属另文范围;本文已产出落库字段(§4.1)与"关闭只回 enabled:false"的公开下发约定(对标 `promo` `GetPublic`,`promo/service.go:20-36`)作为对接契约。前端新增顶级路由段 `news` 需进 `route-validation.ts` 的 `KNOWN_FIRST_SEGMENTS`(前端铁律)。

### 6.5 验证
15. 后端编译(本机无 Go):`docker-compose build backend` 或 `docker-compose up -d --build backend`。
16. 迁移:`docker logs scholar_schema_sync`(全过)+ `docker logs scholar_backend`(启动正常)。
17. 端到端:用 `curl` 构造带正确 `X-Minicod-News-Signature` 的 `POST /api/v1/webhook/minicod-news`,验 201/200;改一字节签名验 401;重复同 `delivery_id` 验第二次 200 且不重复落库。

---

## 风险 / 开放问题

1. **接收端点路径拍板**:本文采用公开 `POST /api/v1/webhook/minicod-news`(签名兜底,与支付/微信回调一致)。备选 `/api/v1/admin/...`(走 `AdminAuthMiddleware`)需上游配合带 token,不推荐。**需与上游确认最终路径并写进后台 `webhook_url` 展示。**
2. **`enabled=false` 时接收端行为**:配置关闭时,`ReceiveWebhook` 是回 `200 ignored`(上游停止重投、数据丢失)还是 `503`(上游持续退避重试、库存待启用后补)?二者都不理想。建议:**默认仍接收并落库(enabled 只控前端展示),或回 503 让上游退避**。需拍板。
3. **`news.heat` 早于正文到达**:热度事件里的 `id` 在 `news_items` 不存在(正文 `news.created` 还没来)→ 本文按 **skip + Info 日志**。是否要"占位插入只含热度的半行,等正文补齐"?会污染列表查询(无 title 的行),倾向不做。
4. **`heat_history` 流水表**:本文 MVP **不建**(`heat_trend` 上游直给)。若产品要画热度曲线/自算飙升,再加 `news_heat_history` 追加表。
5. **`raw_body` / 失败日志**:本文建议**仅失败路径**记 `news_deliveries.status/error`,不存成功体。若排障需要全文复现,临时加 `raw_body` 列(迁移幂等无风险)。是否需要独立 `news_webhook_failures` 表 vs 复用 `news_deliveries` 的 status?本文选复用。
6. **时间戳回放窗口**:是否校验 `X-Minicod-News-Timestamp`(如 `now-ts>5min` 拒)?幂等已防重复投递,回放窗口是额外纵深。MVP 可不做,建议预留。
7. **同步 vs 异步落库**:本文建议同步(保证 2xx 语义真实,单条写远低于 10s);`news.heat` 大批量可异步。需观测真实批量大小后定。
8. **`sources` 列类型**:`JSON`(可查询/校验,需 MySQL 5.7+)vs `TEXT`(存原始 JSON 串,稳但不可索引)。需确认线上 MySQL 版本。
9. **接收端限流**:公开回调不在 `tieredRL` 组内,是否对 `/webhook/minicod-news` 单挂 IP 限流?验签已是主闸,限流为防 DoS 纵深,优先级低。
10. **`view_count` 归属**:上游给初值 + 本端点击叠加,两者如何合并(覆盖 vs 累加)?`news.updated` 会带上游 `view_count`,若直接覆盖会冲掉本端累计。建议:**本端 view_count 独立累加列,不被 webhook 覆盖**,或忽略上游 view_count。需拍板(也影响 §4.1 该列是否被 upsert 覆盖)。
11. **迁移编号占用**:0040~0042 以提交时目录实况为准,若被占用顺延。
