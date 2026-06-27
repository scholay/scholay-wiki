# FE↔BE 架构修复 — 已落地 & 待续(2026-06-26)

针对 [REPORT.md](./REPORT.md) 的优先级建议执行。已验证:前端 `tsc -b --noEmit` 通过、
`npm run test:contract` 5/5、`docker compose build backend` 成功。

## ✅ 已落地

### 1. 死掉的类型契约单一真源(唯一 High,选「轻量收口」)
- 删除失效的 `gen:api` 脚本 + `openapi-typescript` / `openapi-fetch` 依赖,`npm install --package-lock-only` 同步 lock。
- 改写 `frontend-user/CLAUDE.md`(§目录 / §2 表 / §3.6 / §10 反模式表):把「手写 interface + 文件头注释配对 Go struct 路径 + 行为关键契约进 `tests/contract/`」立为正式约定,删除已废的 swagger 生成铁律。
- 修正 3 处指向死生成器的陈旧注释(`shared/api/types.ts`、`shared/api/profile.ts`、`features/admin/api/usage-logs.ts`)。
- **新增契约漂移守卫** `frontend-user/tests/contract/`:`schemas.ts`(zod,行为关键契约 + `CANONICAL_BIZ_CODES`)、`contract.test.ts`(BizCode 一致性 + isQuotaSignal 跨协议 + fixture 形态)、`record.mjs`(对真实后端录制 fixture)、`README.md`。脚本 `npm run test:contract`,可接 CI。

### 2. 幽灵/装饰契约清理
- 删 `auth.go extractToken` 里没人用的 `?token=<jwt>` query 分支(L9)—— 消除 JWT 落 nginx 日志的暴露面;前端 SSE 走 Bearer、WS 走 ws-ticket,已 grep 确认零调用方。
- 删前端死函数 `isSessionTakenError`(0 调用,其「banner」UX 从未接线)。
- 重写 `http.ts` 的 `BizCode` 注释:诚实区分「已接线(驱动 UI 分支)」vs「保留位(已定义未消费,勿假设有专属 UI)」,不再宣称 2019/4020/6020 等有它们其实没有的行为。

### 3. 额度信号统一谓词(Theme 2)
- `quota-events.ts` 新增单一真源 `AGENT_QUOTA_HTTP_CODE(6010)` / `AGENT_QUOTA_WS_CODE('quota_exceeded')` + `isQuotaSignal()`。
- `http.ts`(BizCode.AgentQuotaExceeded 引用常量 + 拦截器用谓词)、`sse-post.ts`(删硬编码 6010)、`useAgentSocket.ts`(WS 帧)三处统一调 `isQuotaSignal`,后端改码只需动一处常量。

### 4. agent-WS 帧契约收一份(M4 / Theme 3)
- `agent-stream.ts` 新增共享 `AgentErrorFrame`(带 `code`/`retryable`)、`AgentDisplacedFrame`(带 `AgentDisplacedReason` 枚举)、`AgentResyncUserFrame` + 三个带类型窄化器 `asAgentErrorFrame/asAgentDisplacedFrame/asAgentResyncUserFrame`。
- `useAgentSocket.ts` 用窄化器取代 3 处 `(evt as {..})` 裸 cast(Theme 3 的「泛型藏契约」)。
- 三个 feature union(`claw/api/types.ts`、`search/api/smart-search.ts`、`prism/api/ws-types.ts`)的 error/displaced/resync_user arm 改为复用共享类型 —— 修复 claw/smart-search error 漏 `code`+`retryable`、smart-search displaced 漏 `reason`、prism displaced.reason 退化成 string 的漂移。

### 5(部分). 分页参数 outlier 统一(M3,零中断)
- `peerreview/admin.go`、`agentbridge/admin_monitor.go` 两个 outlier 改为优先读 `page_size`、回落 `pageSize`(兼容旧前端)。
- 前端 `peer-review-monitor.ts`、`session-monitor.ts` 出网处把 `pageSize`→`page_size`(本地 TS 字段不动,不碰组件)。

## ⏳ 待续(item 5 余下 + 报告其余项,需版本位/协调改动,**不宜盲扫**,逐项落)

| 项 | 内容 | 锚点 | 备注 |
|---|---|---|---|
| M3 收尾 | 抽 `utils.Page(c, items, total, page, pageSize)` 统一信封 + 6 种列表形状收敛;过渡稳定后删 `pageSize` 回落 | `common/utils/response.go` + 各 list handler | 需版本位 |
| M1 | JSON 大小写统一 snake_case(agentbridge/claw/feedback 的 camelCase `gin.H` 迁移);minicod 强制 camelCase 隔离进单一标注 DTO | `agentbridge/http_handler.go`、`claw/handler.go`、`feedback/model.go`、`minicod/models.go` | 需 FE+BE 协调 + 版本位 |
| M2 | FE 依赖的 `gin.H{}` 响应升级为具名 struct(优先 agent session/context/history 形态) | 41 文件 ~158 处 | 渐进 |
| M6 | 期刊上游归一化下沉后端 `JournalMetrics` DTO,收掉 ~5 个 FE regex 解析(桌面/移动预警 chip 分歧) | `minicod/handler.go` + `journal-enrichment.ts` 等 5 处 | 中等 |
| L2 | `Overview.Credit` 改值类型 `BalanceView`(保证不 serialize null,消除 FE 解引用崩溃面) | `vip/quota.go:383` | 小,后端单点 |
| I1 | FE `TokenStatus`/`Balance` 补声明 `consumed_today` / `auto_reset`(已在 contract schema 钉住) | `settings/api/membership.ts` | 小 |
| L5 | ~37 处 `err.Error()` 回显迁 `SafeBadRequest`/固定文案 | grep `utils.{Error,BadRequest}(...err.Error())` | 渐进 |
| M8 | `StaticPages ⊆ staticPageSEO` 让营销页 SSR 注入自 canonical+title | `seo/handler_ssr.go` | 小,后端 |
| SC-2 | `['settings','billing']` 6 消费方收敛到 `useBillingOverview` + `select` | `features/settings/api/membership.ts` 等 | 小,前端 |
| L4 | 货币/交易 uint64 PK 加 `,string` json tag,FE 类型 string | `library/model.go`、`billing_model.go` | 防 2^53 |
