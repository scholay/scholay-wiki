# Scholay Wiki 后端与业务规则审计

> 审计基线：`scholay-wiki` 分支，提交 `f23d00032af9718f1fd31189e317a5622549f8cc`（2026-08-11 22:53:19 +08:00，`优化更新`）。
> 审计日期：2026-08-12。范围仅为仓库静态事实；未读取生产数据库、Redis、对象存储或第三方商户后台的实时数据。

## 1. 如何使用这份报告

这份文件是 Scholay Wiki 编写后端相关内容时的“证据索引”，不是第二套接口文档。事实冲突时按以下优先级判断：

1. 路由是否存在、挂了什么中间件：以 `backend/cmd/server/routes*.go` 和各模块 `RegisterRoutes` 为准。
2. 业务行为：以当前 `handler → service → repository` 执行路径为准；不要只相信文件头注释。
3. 数据结构与升级行为：以 `docker/mysql/migrations/*.sql` 为准；GORM model 只是运行时映射，应用没有 `AutoMigrate`。
4. 默认价格、额度和活动参数：以当前 Go fallback 与迁移 seed 共同解释；生产实际值可由后台修改，必须另查运行库或 admin API。
5. `CLAUDE.md`、archive 文档和源码注释仅作历史背景。当前仓库中确有“订单已移除”“系统内无退款链路”等已过时描述，不能覆盖现行代码。

核心装配与入口证据：`backend/cmd/server/main.go`、`backend/cmd/server/bootstrap.go`、`backend/cmd/server/bootstrap_platform.go`、`backend/cmd/server/routes.go`。

## 2. 运行与授权边界

### 2.1 HTTP 公共边界

- Gin 使用 `gin.New()`；全局依次挂 request ID、访问日志、自定义 recovery、CORS、可选爬虫监控、body limit、IP 限流和 API timeout。爬虫基础设施路径（robots、sitemap、IndexNow key）豁免全局 IP 限流。证据：`backend/cmd/server/main.go`、`backend/internal/common/middleware/`。
- `/api/v1` 整组先过维护模式和 `X-Invite-Code` 透传；维护模式对普通用户返回 503，对后台角色及支付/webhook 白名单放行。证据：`backend/cmd/server/routes.go`、`backend/internal/common/middleware/maintenance.go`、`backend/internal/common/middleware/invitecode.go`。
- 登录态 JWT 的来源优先级是 `Authorization: Bearer`，其次是 `scholay_token` cookie；不再接受 query 中的 JWT。Redis token blacklist 故障时 fail-open。可选登录端点把无效 token 当匿名，但“有效且已吊销”的 token 返回 401。证据：`backend/internal/common/middleware/auth.go`、`backend/internal/common/utils/jwt_revoke.go`。
- 登录用户接口在认证后再过按 `user_id` 的 Redis 分级限流；Redis 不可用时回退进程内限流。当前没有 VIP 放大档。证据：`backend/cmd/server/routes.go`、`backend/internal/common/middleware/ratelimit.go`。
- 浏览器 WebSocket 不携带裸 JWT；用户先用 HTTP 领取约 30 秒、一次性的 `ws_token`，WS 端点自行核验票据和 session 归属。证据：`backend/cmd/server/routes_user.go`、`backend/internal/agentbridge/wstoken.go`、`backend/internal/websocket/wsticket.go`。

### 2.2 后台角色与权限

| 角色 | 权限 | 能力边界 |
|---|---|---|
| `user` | 无后台权限 | 普通用户 API |
| `operations` | `analytics.view`、`content.manage`、`users.view` | 可看统计/用户，可运营内容；不能冻结/删用户、调钱包、退款或改系统凭证 |
| `admin` | 上述 + `users.manage`、`config.manage`、`finance.refund` | 除角色分配外的完整后台 |
| `super_admin` | admin 全部 + `users.role.assign` | 唯一可分配角色 |

权限真源：`backend/internal/admin/model.go`；硬闸：`backend/internal/common/middleware/auth.go`；路由分组：`backend/cmd/server/routes_admin.go`。

## 3. `backend/internal` 模块清单

下表覆盖当前 56 个一级包。路径本身就是每项的代码证据；模块若无外部路由，会明确写“内部”。

| 模块 | 职责 | 主要入口/真源 |
|---|---|---|
| `admin` | 角色、权限、后台用户与仪表盘聚合 | `backend/internal/admin/` |
| `agent` | scholar-agent HTTP 客户端、执行与 skill 协议 | `backend/internal/agent/` |
| `agentartifact` | agent 产物 manifest、MinIO 耐久交付与元数据 | `backend/internal/agentartifact/` |
| `agentattach` | agent 上传、文献引用、图片处理、取回、配额和 reaper 编排 | `backend/internal/agentattach/` |
| `agentattachstore` | `agent_attachments` 的 MySQL 持久层 | `backend/internal/agentattachstore/` |
| `agentbridge` | 多 feature 会话、WS 桥接、Hub 扇出、turn journal、计费钩子、归档和后台监控 | `backend/internal/agentbridge/` |
| `agentconfig` | scholar-agent 默认连接配置 | `backend/internal/agentconfig/` |
| `agentrun` | 科研长任务 Run/Step 持久编排、租约、恢复和取消 | `backend/internal/agentrun/` |
| `ai` | Matrix 论文分析、维度配置、论文翻译和 LLM 调用 | `backend/internal/ai/` |
| `announcement` | 公告后台 CRUD；当前没有公开读取路由 | `backend/internal/announcement/` |
| `boltslides` | PPT agent feature 适配、产物和 PPTX 导出 | `backend/internal/boltslides/` |
| `claw` | 通用科研助手 feature、文件、产物、数学/Mermaid 渲染 | `backend/internal/claw/` |
| `clientlog` | 前端错误上报到结构化日志，不入库 | `backend/internal/clientlog/` |
| `common` | DB/Redis、配置、middleware、错误码、上游重试、cleanup、SSE、安全工具 | `backend/internal/common/` |
| `config` | 系统/邮件/短信/OAuth 配置、代码片段、用户端 SSR/SPA fallback | `backend/internal/config/` |
| `content` | go:embed 的博客/资源文章真源与 Markdown 渲染 | `backend/internal/content/` |
| `crawlerwatch` | 搜索引擎/AI 爬虫识别并旁路上报 Umami | `backend/internal/crawlerwatch/` |
| `emaillog` | 全站邮件发送日志与后台查询 | `backend/internal/emaillog/` |
| `featuretool` | 学术工具黄页、导入任务、SEO 审核、logo、sitemap、webhook | `backend/internal/featuretool/` |
| `feedback` | 匿名/登录反馈、附件、状态、回复与统计 | `backend/internal/feedback/` |
| `hotcontent` | 热词、热门论文、追踪、配置与清理 | `backend/internal/hotcontent/` |
| `invite` | 邀请码、归因绑定、双向注册奖励、首单返利、退款反冲 | `backend/internal/invite/` |
| `library` | 文献集、文件夹、PDF、识别/重关联、分享/提取码/转存 | `backend/internal/library/` |
| `llmusage` | LLM 四类 token 成本账本、统计、导出和 cleanup | `backend/internal/llmusage/` |
| `message` | 站内信创建、投递、读取状态；模板层已下线 | `backend/internal/message/` |
| `minicod` | 论文/作者/期刊上游 API 客户端、账号池和字段规范化 | `backend/internal/minicod/` |
| `modelcatalog` | 模型目录、feature/purpose 绑定和多 provider 管理 | `backend/internal/modelcatalog/` |
| `news` | MiniCod 情报 webhook、去重、公开列表/热榜/详情和 sitemap | `backend/internal/news/` |
| `openaccess` | OA PDF 解析/解析服务 | `backend/internal/openaccess/` |
| `payment` | 支付宝、微信支付创建/回调/查单与商户配置 | `backend/internal/payment/` |
| `pdfparse` | PDF 文本/元数据解析客户端 | `backend/internal/pdfparse/` |
| `peerreview` | 智能审稿 wizard、附件、缓存、SSE、4 份报告和重启恢复 | `backend/internal/peerreview/` |
| `prism` | 结构化写作项目、文件版本、编译、引用、修订、WS diff 和导出 | `backend/internal/prism/` |
| `promo` | “限时领取会员”展示开关、文案和客服二维码；不直接发会员 | `backend/internal/promo/` |
| `promptregistry` | 通用 feature/persona prompt、历史版本和加权选择；主要供内部消费 | `backend/internal/promptregistry/` |
| `prompts` | 内置 feature prompt 与 agent 注入内容 | `backend/internal/prompts/` |
| `scidraw` | 科研绘图 agent feature 和 SVG 产物 | `backend/internal/scidraw/` |
| `seo` | 论文/作者/期刊 SEO 实体、slug、SSR、sitemap、robots、期刊枢纽 | `backend/internal/seo/` |
| `seoenrich` | 冷门论文/作者 URL 的现拉回填 | `backend/internal/seoenrich/` |
| `seoingest` | 期刊全量摄取、断点续跑、发布批次和回滚 | `backend/internal/seoingest/` |
| `seosubmit` | IndexNow/百度主动提交队列、重试、冷却和 dead letter | `backend/internal/seosubmit/` |
| `skillmarket` | 用户 Skills 上传、版本、审核、举报、安装和 agent 物化 | `backend/internal/skillmarket/` |
| `smartsearch` | 智能搜索 agent feature、会话、上传与文献引用 | `backend/internal/smartsearch/` |
| `stagingarea` | 检索暂存区及历史数据迁移 | `backend/internal/stagingarea/` |
| `statlab` | 数据分析 agent feature、CSV/XLSX 上传和统计执行约束 | `backend/internal/statlab/` |
| `storage` | MinIO bucket、对象 CRUD、生命周期与安全对象键 | `backend/internal/storage/` |
| `supportcenter` | 联系方式、IMAP 收件、SMTP/飞书发信和客服邮箱后台 | `backend/internal/supportcenter/` |
| `thirdparty` | 上游 API 账号池 CRUD、测试、调用统计 | `backend/internal/thirdparty/` |
| `umami` | Umami 统计代理和爬虫网站数据 | `backend/internal/umami/` |
| `usagestat` | `usage_events` v2 埋点、漏斗、统计与清理 | `backend/internal/usagestat/` |
| `user` | 邮箱/手机/OAuth 登录、账号合并、绑定、资料、活跃、后台用户管理 | `backend/internal/user/` |
| `usermemory` | 用户长期记忆块 CRUD 与 agent 注入数据源 | `backend/internal/usermemory/` |
| `vip` | 会员、统一额度、钱包、重置次数、订单、兑换码、退款 | `backend/internal/vip/` |
| `websocket` | 站内信 WS、ticket 和连接 Hub | `backend/internal/websocket/` |
| `wechat` | 微信 OAuth、小程序登录/绑手机/内容安全 | `backend/internal/wechat/` |
| `wechatofficial` | 微信公众号 webhook 与单行配置 | `backend/internal/wechatofficial/` |

## 4. API 端点、权限与用途

记法：表内省略统一前缀时会注明；`A|B path` 表示同一路径有多个 HTTP method。路由是否存在以列出的源文件为准。

### 4.1 非 `/api/v1` 端点

| 权限 | 端点 | 用途 | 源 |
|---|---|---|---|
| 公开 | `GET /health` | MySQL/Redis 连通性健康检查 | `backend/cmd/server/routes.go` |
| 公开 | `GET|HEAD /robots.txt`、`/sitemap.xml`、`/sitemap-static.xml`、`/sitemap-blogs.xml`、`/sitemap-resources.xml`、`/sitemap-qa.xml`、`/sitemap-papers-:page.xml`、`/sitemap-authors-:page.xml`、`/sitemap-journals-:page.xml`、`/sitemap-journal-hubs.xml`、`/sitemap-tools.xml`、`/sitemap-tools-:page.xml`、`/sitemap-news.xml`、`/sitemap-news-latest.xml` | SEO 基础设施 | `backend/cmd/server/routes.go` |
| 公开 | `GET /{indexnow-key}.txt` | IndexNow key ownership | `backend/cmd/server/main.go`、`backend/internal/seosubmit/handler.go` |
| 公开 | `GET /uploads/*` | 遗留本地静态目录 | `backend/cmd/server/routes.go` |
| 公开 | 其余非 API 路径 | SSR/SPA fallback；API/静态未知路径不会误回 HTML | `backend/cmd/server/routes.go`、`backend/internal/config/handler_ssr.go` |

### 4.2 公开 `/api/v1` 端点

| 领域 | 端点 | 用途/限制 | 源 |
|---|---|---|---|
| 配置/内容 | `GET /config/system`、`/config/code-snippets`、`/config/support-contact`、`/config/promo`、`/config/promo/summary`、`/config/promo/qr` | 公开站点配置、可执行代码片段、客服信息、推广展示 | `backend/internal/config/handler.go`、`backend/cmd/server/routes.go` |
| 内容/情报 | `GET /content/:kind`、`/content/:kind/:slug`、`/news`、`/news/trending`、`/news/detail/:slug` | 博客/资源和已发布情报 | `backend/cmd/server/routes.go` |
| 邮箱认证 | `POST /user/send-code`、`/register`、`/login`、`/login-with-code`、`/reset-password` | auth 30/IP/min；发码 15/IP/min；验证码 10 分钟、错 5 次作废、同目标约 60 秒冷却 | `backend/internal/user/handler.go`、`backend/internal/common/cache/verification_code.go` |
| 手机认证 | `POST /user/send-phone-code`、`/register-phone`、`/login-phone`、`/login-phone-with-code`、`/reset-password-phone` | 与邮箱认证同类限流/验证码约束 | `backend/internal/user/handler.go` |
| 微信登录 | `GET /user/wechat/login-url`、`/user/wechat/qrcode-config`; `POST /user/wechat/callback`、`/user/wechat/miniprogram/login` | 微信网页/小程序登录 | `backend/cmd/server/routes_user.go` |
| 其他 OAuth | GitHub `GET /user/github/login-url|callback`; Google `GET /user/google/client-id`、`POST /user/google/id-token-login`; ORCID/Microsoft/Discourse `GET .../login-url|callback`; Apple `GET .../login-url`、`POST .../callback` | 第三方登录 | `backend/cmd/server/routes_user.go`、`backend/internal/user/*oauth*.go` |
| OAuth 合并 | `GET /user/oauth/pending-merge`; `POST /user/oauth/cancel-merge` | `merge_token` 驱动的冲突摘要/取消；真正合并必须登录 | `backend/cmd/server/routes_user.go` |
| 套餐/邀请 | `GET /billing/plans`、`GET /invite/campaign`、`POST /invite/open`、`POST /invite/preview` | 公开价格；活动参数/邀请码预览/打开计数。邀请分别限 60、20、30/IP/min | `backend/cmd/server/routes_user.go` |
| Skills 分发 | `GET /skills/install.md`、`/skills/marketplace.json`、`/skills/:slug`、`/skills/:slug/SKILL.md`、`/skills/:slug/download` | 只暴露 public + approved + active Skill | `backend/cmd/server/routes_user.go`、`backend/internal/skillmarket/` |
| 支付回调 | `POST /payment/alipay/notify`、`POST /payment/wechat/notify` | 商户签名校验后幂等履约；维护模式白名单 | `backend/cmd/server/routes_scholar.go`、`backend/internal/payment/` |
| 外部 webhook | `GET|POST /wechat-official/webhook`、`POST /webhook/minicod-news` | 微信公众号校验/被动消息；HMAC 情报推送与 delivery 去重 | `backend/cmd/server/routes_scholar.go` |
| 论文 | `GET /public/papers/:paperId`、`POST /public/papers/search`（optional auth）、`POST /public/papers/batch`、`GET /public/papers/:paperId/references`、`GET /public/search/suggestions` | 论文详情、检索、引用和建议 | `backend/cmd/server/routes_scholar.go` |
| OA/分析 | `GET /public/oa/resolve`（30/IP/min）、`GET /public/analysis/dimensions` | 开放获取和系统分析维度 | `backend/cmd/server/routes_scholar.go` |
| 作者/期刊 | `GET /public/author-detail/:authorId`、`.../papers`; `POST /public/journals/search`（optional auth）、`/list`、`/get`、`/stats`、`/suggest`、`/byNames` | 作者和期刊检索/详情 | `backend/cmd/server/routes_scholar.go` |
| 反馈 | `POST /public/feedback`（optional auth）、`POST /public/feedback/upload`、`GET /public/feedback/attachment/:id` | 匿名或登录反馈及附件 | `backend/cmd/server/routes_scholar.go` |
| 翻译 | `POST /public/translate/paper/stream` | 路径名虽为 public，实际要求用户 JWT + 用户级限流 | `backend/cmd/server/routes_scholar.go` |
| 追踪 | `GET /public/umami-config`; `POST /public/seo/expose`、`/hot-content/track`、`/usage-events/track` | tracker 配置；曝光/热度/使用埋点，分别有限流，usage 可选登录 | `backend/cmd/server/routes_scholar.go` |
| 分享 | `GET /public/share/:token` | optional auth；60/IP/min；提取码按 token+IP 连错 5 次锁定 | `backend/cmd/server/routes_scholar.go`、`backend/internal/library/share_handler.go` |
| SEO API | `GET /public/seo/paper/:slug`、`/seo/author/:slug`、`/journal-hubs/overview`、`/journal-hubs/list` | SEO 实体解析和期刊枢纽 | `backend/cmd/server/routes_scholar.go` |
| 工具/Skills | `GET /public/tools`、`/tools/categories`、`/tools/detail/:idOrSlug`、`/tools/logo/:slug`、`/skills`（optional auth） | 工具黄页和 Skill 市场 | `backend/cmd/server/routes_scholar.go` |
| WS | `GET /ws` | 站内信 WebSocket，handler 自验一次性 ticket | `backend/cmd/server/routes.go`、`backend/internal/websocket/` |
| 日志 | `POST /log/client-error` | 只写 warn 日志，不入库 | `backend/cmd/server/routes.go`、`backend/internal/clientlog/handler.go` |

### 4.3 登录用户 `/api/v1/user` 端点

本节全部经过 `UserAuthMiddleware + tieredRL`，最后六个 agent WS 例外：它们不挂 JWT middleware，而是自验一次性 `ws_token`。

| 领域 | 端点 | 用途 | 源 |
|---|---|---|---|
| 账号 | `POST /activity`、`/logout`、`/logout-all`、`/change-password`、`/ws-ticket`、`/oauth/confirm-merge`; `GET|PUT /profile`; `GET /connections` | 活跃、资料、退出/吊销、改密、站内信 ticket、OAuth 合并 | `backend/cmd/server/routes_user.go`、`backend/internal/user/` |
| 会员 | `GET /membership`、`/models`; `POST /redeem-code/preview`、`/redeem-code` | 会员/额度/钱包摘要、可选模型、兑换码 | `backend/cmd/server/routes_user.go`、`backend/internal/vip/` |
| 邀请 | `GET /invite`、`/invite/status`、`/invite/registrations`; `POST /invite/bind` | 我的码、资格/绑定、脱敏邀请明细 | `backend/cmd/server/routes_user.go`、`backend/internal/invite/` |
| Max 投稿资源 | `GET /journals/:id/submission/:kind` | Max 后端硬校验后代理投稿指南/LaTeX 模板 | `backend/cmd/server/routes_user.go`、`backend/internal/minicod/handler.go` |
| 账单 | `GET /billing/overview`、`/billing/transactions`、`/billing/usage-calendar`、`/billing/orders`、`/billing/subscribe/quote`; `POST /billing/reset`、`/billing/recharge`、`/billing/subscribe`、`/billing/test-pay`; `PUT /billing/autopay` | 额度/钱包、重置次数、订单与报价、充值/订阅、显式按量付费。test-pay 还受环境与 release 硬闸 | `backend/cmd/server/routes_user.go`、`backend/internal/vip/billing_handler.go` |
| 账号绑定 | `POST /bind-{phone,email,wechat,github,google,apple,orcid,microsoft,discourse}`、`POST /unbind-{...}`、`GET /apple/bind-url` | 登录方式绑定/解绑 | `backend/cmd/server/routes_user.go` |
| 支付 | `POST /payment/alipay/create`、`/payment/wechat/create`; `GET /payment/wechat/status/:orderNo` | 只能支付自己的 pending 订单；微信轮询可主动查单自愈 | `backend/cmd/server/routes_user.go`、`backend/internal/payment/` |
| 互动 | `POST /feedback`、`/wechat/msg-check`、`/wechat/miniprogram/bind-phone`; `GET /messages`、`/messages/unread-count`; `PUT /messages/:id/read`、`/messages/read-all`; `DELETE /messages/:id` | 登录反馈、小程序安全/绑手机、站内信 | `backend/cmd/server/routes_user.go` |
| 通用附件 | `GET|DELETE /attachment/:uuid`、`GET /attachments` | 全 agent feature 的耐久附件取回/删除/列表；仅 handler 已装配时注册 | `backend/cmd/server/routes_user.go`、`backend/internal/agentattach/` |
| 文献集 | `GET|POST /library`; `POST /library/check`; `GET /library/by-upstream/:source/:paperId`; folder CRUD；paper 更新/移动/PDF 上传下载删除/解析确认/重关联；batch move/delete；share 创建/列表/撤销/访问/转存；`DELETE /library/:source/:paperId` | 每用户 50 文件夹、1000 论文；批量最多 500；PDF 50 MiB；活跃分享最多 200、单分享最多 500 篇 | `backend/internal/library/handler.go`、`backend/internal/library/model.go`、`backend/internal/library/share_model.go` |
| 暂存区 | `GET|POST /staging-areas`; `PATCH|DELETE /staging-areas/:id`; `POST /:id/papers`; `DELETE /:id/papers`、`/:id/papers/:source/:paperId`; `POST /staging-areas/migrate` | 每用户 5 区、每区 100 篇 | `backend/internal/stagingarea/handler.go`、`backend/internal/stagingarea/model.go` |
| 智能审稿 | submission list/create/resume-or-create/latest-draft/get/patch/delete/submit/retry；asset list/upload/delete/download；`POST /advance`; report list/get；`GET /stream` | 四步 wizard、SSE 和报告；稿件 50 MiB、附件 30 MiB/份、最多 10 份 | `backend/internal/peerreview/routes.go`、`backend/internal/peerreview/service.go` |
| Prism | `/prism/projects` CRUD；file get/save/create/rename/delete/version/restore；compile/status/PDF；cite；templates/struct/version/template/conformance；writing-profile/quality/revision/number/terminology；clone/docx/assets；upload/reference/session file/ticket/conversations/reset/messages/context；round prepare/pending/apply/reject/workspace file | 结构化写作、编译与 agent 编辑完整面 | `backend/cmd/server/routes_user.go`、`backend/internal/prism/` |
| Smart Search | session get/reset/messages/context/ticket/file；upload/reference；sessions list/create/rename/delete/activate | 当前实际支持多会话；旧“用户唯一会话”注释已过时 | `backend/cmd/server/routes_user.go`、`backend/internal/smartsearch/` |
| Claw | session get/reset/messages/context/file/artifacts/ticket；artifact/zip；upload/reference；sessions CRUD/activate；models；可选 runs create/list/get/cancel | 通用助手、产物和长任务；runs 仅引擎装配时注册 | `backend/cmd/server/routes_user.go`、`backend/internal/claw/`、`backend/internal/agentrun/` |
| BoltSlides | session/messages/context/artifacts/ticket；artifact；export-pptx；sessions CRUD/activate；models | PPT agent | `backend/cmd/server/routes_user.go`、`backend/internal/boltslides/` |
| SciDraw | session/messages/context/artifacts/ticket；artifact；sessions CRUD/activate；models | 科研绘图 agent | `backend/cmd/server/routes_user.go`、`backend/internal/scidraw/` |
| StatLab | SciDraw 同型端点 + `POST /stat_lab/upload` | 数据分析 agent；支持 CSV/XLSX | `backend/cmd/server/routes_user.go`、`backend/internal/statlab/` |
| 通用 agent | `GET /agent-session/resolve`; `POST /render/math`、`/render/mermaid` | 深链归属解析和小程序图片化渲染 | `backend/cmd/server/routes_user.go` |
| 记忆 | `GET /memory`; `PUT|DELETE /memory/:label`; `DELETE /memory` | 用户查看/修改/清空长期记忆 | `backend/cmd/server/routes_user.go`、`backend/internal/usermemory/` |
| Skills | market list/detail/report；我的 skill list/create/meta/content/publish/unpublish/delete；install list/create/enable/delete | 上传、审核、安装和会话启用 | `backend/cmd/server/routes_user.go`、`backend/internal/skillmarket/` |
| Agent WS | `GET /user/{smart-search,claw,boltslides,sci_draw,stat_lab,prism}/ws/:sessionId?ws_token=...` | 一次性 ticket + session owner 校验 | `backend/cmd/server/routes_user.go` |

登录用户的论文分析另挂 `/api/v1/analysis`：`POST /papers/batch`；`GET /dimensions`、`/dimensions/settings`；`PATCH /dimensions/visibility`、`/dimensions/reorder`；`POST /dimensions`；`PUT|DELETE /dimensions/:id`；`DELETE /dimensions/reset/:dimensionKey`。全部要求 JWT + 用户限流。源：`backend/cmd/server/routes_scholar.go`、`backend/internal/ai/`。

### 4.4 后台 `/api/v1/admin` 端点

| 权限 | 端点族 | 用途 | 源 |
|---|---|---|---|
| `analytics.view` | `GET /dashboard/statistics`; `/analytics/{overview,pageviews,top,active,crawler}`; `/billing/orders`、`/billing/orders/stats`; `/agent-sessions`、`/:sessionId/messages|artifacts|artifact/:artifactId|file`; `/peer-review/submissions`、`/:id`、`/:id/assets/:assetId`; `/usage-stats/summary|peer-review-funnel|events`; `/llm-token-usage/summary|logs|facets|export`; `/email-logs`; `/hot-content/keywords|papers|stats` | 纯只读运营/营收/会话/用量观测 | `backend/cmd/server/routes_admin.go` |
| `content.manage` | announcements CRUD；feedback list/stats/detail/status/reply/delete；skills queue/reports/resolve/approve/reject/takedown；messages create/list/send；promo config GET/PUT；support inbox/poll/reply/compose；tools CRUD/SEO review/import/jobs/webhooks/deliveries | 内容、互动、客服和工具运营 | `backend/cmd/server/routes_admin.go` |
| `users.view` | `GET /users/stats`、`/users/metrics`、`/users`、`/users/:id/detail`; `/invites/summary`、`/invites`、`/invites/:id/registrations` | 用户和邀请只读看板 | `backend/cmd/server/routes_admin.go` |
| `users.manage` | user delete/batch-delete/freeze/unfreeze；VIP get/grant/revoke；wallet adjust；reset-pass grant；user orders/transactions/redemptions | 用户写操作及财务下钻 | `backend/cmd/server/routes_admin.go` |
| `finance.refund` | `POST /billing/orders/:orderNo/refund`; `GET /billing/orders/:orderNo/refunds` | 登记商户后台已完成的退款并回收权益；不调用支付网关 | `backend/cmd/server/routes_admin.go`、`backend/internal/vip/refund.go` |
| `config.manage` | email/SMS/system/OAuth 配置；分析维度；code snippets；billing config；invite campaign；support/news/third-party config；Alipay/WeChat Pay/WeChat OAuth/公众号/小程序；agent config；models/bindings/providers；usage/LLM cleanup；VIP code/batch 管理；hot-content cleanup/config；SEO journal sync/publish/rollback | 系统、凭证、支付、模型、计费和破坏性维护 | `backend/cmd/server/routes_admin.go` |
| `users.role.assign` | `PUT /users/:id/role` | 仅 super_admin 角色分配 | `backend/cmd/server/routes_admin.go` |

后台没有独立登录端点；管理员和运营统一从 `/api/v1/user/login` 登录，再由 `users.role` 决定权限。源：`backend/cmd/server/routes.go`、`backend/internal/admin/model.go`。

## 5. 关键业务规则与状态机

### 5.1 用户与认证

- `users` 是普通用户和后台账号的统一真源；角色为 `user / operations / admin / super_admin`。冻结操作写 `status=2`、原因和时间，并立即吊销该用户所有 token；解冻恢复 `status=1`，不会复活旧 token。源：`backend/internal/user/model.go`、`backend/internal/user/handler_admin_ops.go`。
- `/check-email`、`/check-phone` 已不注册，避免账号枚举；对应 handler 仍是死代码。登录文案与 dummy bcrypt 用于降低枚举侧信道。源：`backend/internal/user/handler.go`、`backend/internal/user/service_auth.go`。
- 验证码存持久 Redis 池，10 分钟有效且一次性；同一个验证码猜错 5 次即删除。发送新码的 TTL 判断形成约 60 秒 per-target 冷却。源：`backend/internal/common/cache/verification_code.go`、`backend/internal/user/service_auth.go`、`backend/internal/user/service_phone.go`。
- OAuth 邮箱冲突不是自动合并：公开端点只展示/取消 pending merge，确认合并需要目标账号 JWT。源：`backend/internal/user/handler_oauth_merge.go`、`backend/cmd/server/routes_user.go`。

### 5.2 会员等级与订阅

- 等级顺序固定为 `free < pro < max`；所有授予路径单调，不能降级。付费等级若有未来到期日则有效；`nil` 到期日兼容历史永久会员。源：`backend/internal/vip/model.go`、`backend/internal/vip/service.go`。
- 默认 fallback（不等于生产实时配置）：Free 每 7 天 `300,000` 微元真实成本，即 300 算力点；Pro 为 Free ×20，即 6,000 点；Max 再 ×5，即 30,000 点。Pro 月价 5,900 分、年价 59,000 分；Max 月价 26,900 分、年价 269,000 分；划线价分别为 19,900/238,800、99,900/1,198,800 分。源：`backend/internal/vip/config.go`、`docker/mysql/migrations/0097_fresh_seed_rebase.sql`。
- 自然周期用 no-overflow 算术：月付 +1 自然月、年付 +1 自然年；1 月 31 日会钳到 2 月末，之后续期稳定在该日。源：`backend/internal/vip/billing_model.go`。
- 订阅动作由后端根据当前状态计算：
  - `new`：免费/过期用户，收完整周期价，从现在起一个自然周期。
  - `renew`：同档续期，收完整周期价，从当前到期日叠加；年付在期用户不能用月付做同档续期。
  - `upgrade`：在期升档，按剩余时间和当前周期价差计费，到期日不变；至少 1 分，且请求 cycle 不改变现周期。
  - `switch`：低档月付升高档年付，收目标年价，并在当前到期日后叠加一年。
- 同一用户同一时刻只能有一张有效 pending 订阅单；创建新单时先把超过 2 小时的本用户 pending 订阅置 `expired`。后台全局清理默认把超过 24 小时的 pending 置 expired。源：`backend/internal/vip/order.go`、`backend/internal/common/cleanup/cleanup.go`。
- 任何延长到期日的动作会作废在途 upgrade 单；支付时还会检查冻结的升级定价基准，避免低价旧升级单兑换更长的新期限。源：`backend/internal/vip/order.go`。
- 0090 起订阅只给会员和周期额度，不再赠送经费；文件头仍有“赠送临时经费”的旧注释，应忽略。源：`backend/internal/vip/order.go` 的实际 `CreditsGranted: 0` 与 `activateSubscriptionInTx`、`docker/mysql/migrations/0090_reset_passes_fields.sql`。
- admin 直授与兑换码可按 day/month/year，最大分别 3650 天、120 月、10 年。直授/续期付费档会触发额度满血。源：`backend/internal/vip/service.go`、`backend/internal/vip/billing_model.go`。

### 5.3 统一额度与按量付费

- 所有 AI feature 共用一个成本池，不再按 feature 次数或 token 数各自限额；计量是真实模型成本“微元”，用户端只显示百分比和窗口时间，不下发绝对微元上限。源：`backend/internal/vip/quota.go`、`backend/internal/vip/quota_response.go`、`backend/internal/llmusage/`。
- 窗口从第一次真实使用时开锚；只查看 overview 不开窗。默认 7 天，到期后下一次使用开启新窗。Redis persist 是热真源，`user_quota_windows` 提供 MySQL 恢复/审计，进程内 fallback 只用于降级。源：`backend/internal/vip/quota.go`、`backend/internal/vip/quota_persist.go`。
- 每条用户消息开始前做额度闸，模型结束后才按真实成本记账；后端不会在单轮中途硬切断。因此一轮可越线，并发的 K 个 feature turn 也可能共同超出；预算戳和约 75% wind-down 只用于让 agent 优雅收尾。源：`backend/internal/vip/quota.go`、`backend/internal/agentbridge/hooks.go`。
- 没有“透支带”。未开启按量付费时，越线那一轮的溢出由平台承担；下一条消息被拦。源：`backend/internal/vip/billing_model.go`、`backend/internal/vip/quota.go`。
- 用户显式开启 `credit_autopay` 后，只有 included ceiling 之外的成本才从经费扣，避免整次调用重复收费。起跑只检查余额大于 0；异步结算允许余额变为小额负数，负债上界约为在途 turn 成本。源：`backend/internal/vip/wallet.go`、`backend/internal/vip/quota.go`。
- 订阅履约、合格兑换码升档和 admin 授予会删除旧锚，使下一次真实使用获得完整新窗口；Redis 删除失败会写 `refill_pending_at`，cleanup 后补偿。源：`backend/internal/vip/quota.go`、`backend/internal/vip/wallet.go`。

### 5.4 钱包与重置次数

- 钱包真值是 `user_wallets.perm_balance_micro`，`1 经费 = 1,000,000 micro-credit`；旧 `perm_balance` 已冻结。经费只有永久一种，来源包括充值、礼品/兑换码、admin 和邀请。源：`backend/internal/vip/wallet.go`、`backend/internal/vip/billing_model.go`、`docker/mysql/migrations/0094_credit_payg_fields.sql`。
- 默认充值汇率 `¥1 = 100 经费`，1 经费兑换 3 算力点，最低充值 1,000 分（¥10）。后台保存配置时强制按量付费比每个已配置套餐都贵。源：`backend/internal/vip/config.go`。
- 普通钱包消费在事务中锁行并要求余额充足；按量付费的真实成本结算例外，允许负数，并按用户/日期聚合成一条 `payg_daily` 流水。源：`backend/internal/vip/wallet.go`。
- 重置额度只消耗 `credit_reset_passes`，按最近到期优先；不能用经费补足。只有当前额度已耗尽才需要扣一次。Redis 不可用时拒绝且不扣次数；若换锚成功、扣次数失败，用户得到一次免费重置，优先避免重复扣。源：`backend/internal/vip/quota.go`、`backend/internal/vip/wallet.go`。
- 自动用经费“买重置”已经下线；`auto_reset_enabled` 列保留但不驱动行为。存量临时经费已一次性换成 reset pass，`credit_temp_lots` 封存不再读取。源：`backend/internal/vip/wallet.go`、`docker/mysql/migrations/0090_reset_passes_fields.sql`、`0092_reset_passes_migrate.sql`。

### 5.5 订单、支付与退款

订单状态机：

```text
pending ──支付成功──> paid
   │                    │
   └──超时清理──> expired ──已在网关付款且校验通过──> paid

paid 不改成 refunded；退款另走 refund_status: none → partial → full
```

- `orders` 是充值/订阅唯一收款真源。创建支付时金额只取订单 `final_amount`，不信任客户端；支付宝验签并核对 `app_id`，微信按“原始 body 验签 → AES-GCM 解密 → 事件/币种/订单/金额校验”执行。源：`backend/internal/payment/alipay_handler.go`、`backend/internal/payment/wechat_pay_handler.go`、`backend/internal/vip/order.go`。
- 履约事务锁订单；`paid` 回调幂等短路；仅 `pending/expired` 可履约。整数分少付拒绝，多付告警后仍按订单权益履约。充值发永久经费，订阅改等级/到期日。源：`backend/internal/vip/order.go`。
- 微信 pending 轮询会主动查商户单并补履约；支付宝没有对应用户查单端点。微信对“已付款但本地订单不存在/少付”会 ACK 并要求人工对账，避免无意义重试。源：`backend/internal/payment/wechat_pay_handler.go`。
- 测试支付只在 `PAYMENT_TEST_ENABLED=true` 且非 release 时可用；生产 release 强制关闭。测试单不应触发邀请首单奖励。源：`backend/cmd/server/main.go`、`backend/internal/vip/billing_handler.go`、`backend/internal/invite/campaign_bind.go`。
- 退款是“管理员已先在支付宝/微信商户后台退款，再回系统登记”，系统不会调用网关退款 API。每笔由客户端 `idempotency_key` 去重，同键重试回放上次结果；支持多次部分退款。源：`backend/internal/vip/refund.go`、`backend/cmd/server/routes_admin.go`。
- 退款不改 `orders.status=paid`，只累计 `refunded_amount` 并更新 `refund_status`。充值经费按累计比例差分回收，余额不足只扣到 0 并记录 shortfall。订阅退款可由管理员选择是否整体撤销会员；系统无法精确撤回某订单贡献的那一段期限，因为订单未保存权益分段排期。源：`backend/internal/vip/refund.go`、`docker/mysql/migrations/0107_order_refunds_fields.sql`、`0109_order_refunds_idempotency.sql`。
- 订单首购邀请返利会随累计退款按比例反冲，单独记录实际回收和 shortfall。源：`backend/internal/invite/campaign_bind.go`、`backend/internal/vip/refund.go`。

### 5.6 兑换码

- 新码格式 `XXXX-XXXX-XXXX-XXXX`，去掉 `0/O/1/I/L`；`grant_kind=tier|credit`。新 credit 码一律永久，历史 temp 码兑换时也按永久处理。源：`backend/internal/vip/service.go`、`backend/internal/vip/billing_model.go`。
- 每用户每码只能兑换一次；码行在事务内加锁，`used_count < max_uses` 才能成功。失效形态为 revoked、expired、exhausted、already redeemed。源：`backend/internal/vip/repository.go`。
- 单次批量生成 1–1000 个；tier 默认 Pro、只允许 Pro/Max；会员时长默认 30 天或 1 月/年；生成时 `max_uses` 1–100；码有效期默认 7 天、最长 30 天。后续加次数总上限 100,000，续码有效期单次最多 3650 天。源：`backend/internal/vip/service.go`、`backend/internal/vip/code_batch.go`。
- 会员码不降级，并从当前有效到期日顺延；只有“等级真的提高”且授予时长至少覆盖一个额度窗口时才触发满血。修改码的状态/时长/次数只影响之后兑换，不追溯已兑换用户。源：`backend/internal/vip/service.go`、`backend/internal/vip/repository.go`。

### 5.7 邀请活动

- 唯一活动配置真源是单行 `invite_campaign_config`；0117 初次升级会从旧 `billing_config` 邀请字段 seed，若无旧值则默认关闭、奖励 0、绑定/首购窗口各 30 天。之后旧字段不再反向同步。源：`backend/internal/invite/service.go`、`docker/mysql/migrations/0117_invite_campaign.sql`。
- 新邀请码为 8 位去歧义字符；兼容历史 6 位 `[A-Z0-9]`。每用户一个码，唯一索引 + 最多 3 次撞码重试。活动关闭时不会新生成或展示可用分享码。源：`backend/internal/invite/service.go`。
- `X-Invite-Code` 只透传；用户注册事务提交后 best-effort 绑定，绑定失败不回滚账号。用户也可在注册后窗口内手动绑定。源：`backend/internal/common/middleware/invitecode.go`、`backend/internal/user/invite_hook.go`、`backend/internal/invite/service.go`。
- 绑定必须满足：活动开启、码有效、双方账号 active、不能自邀、被邀请人未绑定、邀请人账号先于被邀请人（同秒以较小 user id 破平）、仍在注册后绑定窗口。源：`backend/internal/invite/campaign_bind.go`。
- 关系、注册里程碑、邀请人/被邀请人双向奖励、grant 审计、钱包和流水同事务。每日上限只限制邀请人的“可计奖注册数”；撞上限时关系仍保留，但该注册不发奖励。源：`backend/internal/invite/campaign_bind.go`。
- 绑定时把双方注册奖励、每日上限、绑定/首购窗口、返利 bps 和充值汇率写入关系快照；之后后台改活动配置不会追改既有关系。源：`backend/internal/invite/model.go`、`docker/mysql/migrations/0117_invite_campaign.sql`。
- 首个符合条件的真实 paid 充值或订阅，在注册后首购窗口内给邀请人返利；排除 test payment 和已全退订单。返利用整数定点按 `实付分 × bps × 充值汇率 / (10000 × 100)` 四舍五入（half-up）。晚绑定也会回看窗口内首购。源：`backend/internal/invite/campaign_bind.go`。
- 配置校验：奖励非负且单项 ≤10 亿；每日上限 ≤100 万；返利 0–10000 bps；窗口 1–3650 天；开启时至少一种奖励非零；帮助链接只能为空或完整 http(s)。源：`backend/internal/invite/service.go`。
- 对外注册明细在服务层脱敏，不返回被邀请人的原始邮箱/用户名/ID。源：`backend/internal/invite/handler.go`、`backend/internal/invite/campaign_bind.go`。

### 5.8 “限时领取会员”、签到和优惠

- Promo 只是运营展示：单行开关、标题/副标题/福利点/按钮、微信二维码。关闭时公开接口只回 `enabled=false`；二维码只允许 PNG/JPEG/WebP data URL，解码后 ≤300 KiB。它没有“领取”端点、会员发放、资格判断或领取审计。源：`backend/internal/promo/`、`docker/mysql/migrations/0039_promo_config.sql`。
- 当前没有签到模块、签到路由或 `user_checkins/user_checkin_stats` 现行表。baseline 仍在 `feature_configs` seed 中把 `user_checkin` 标成 enabled，这只是孤立遗留配置，不代表功能可用。历史签到表只存在 archive 并已在历史清理脚本中 drop。源：`docker/mysql/migrations/0001_baseline.sql`、`docker/mysql/migrations/archive/0056_drop_stranded_marketing_tables.sql`、`docker/mysql/migrations/archive/DEPRECATED_TABLES.md`。
- 当前没有 coupon handler/service/repository 或用户/admin 路由；`coupon_templates/user_coupons/coupon_usage_logs/coupon_batches` 和 `orders.coupon_id` 是 baseline 遗留。创建订单没有折扣计算，`final_amount` 当前由后端订阅/充值定价直接给出。源：`docker/mysql/migrations/0001_baseline.sql`、`backend/internal/vip/order.go`、`backend/internal/payment/alipay_handler.go`。

### 5.9 智能审稿

投稿主状态机：`draft → queued → reviewing → completed | failed`。只有 draft 可修改/增删附件/推进；submit 用条件更新抢 `draft→queued`，并发重复提交只有一个赢家；failed 可 retry，复用已成功报告，仅补失败轮。源：`backend/internal/peerreview/repository.go`、`backend/internal/peerreview/service.go`。

并行的计算状态为 `idle / computing_meta / computing_letter / computing_methodology / reviewing / failed`。Step 2/3 缓存键包含稿件/元数据 revision 与模型，输入变化自动 miss；每 `(submission, step)` 只有一条缓存。重启会把卡住的快速草稿步骤复位 failed，而 queued/reviewing 审稿自动续跑；另有 5 分钟 sweeper，把超过 15 分钟的草稿计算复位。源：`backend/internal/peerreview/model.go`、`backend/internal/peerreview/service.go`、`backend/internal/peerreview/repository.go`。

### 5.10 Prism 写作

- DB 是项目/结构/文本版本真源，二进制和编译 PDF/log 在 MinIO；agent workspace 只是本轮工作区。新项目一律 `schema_version=struct`，旧 legacy 项目冻结编辑。`Project.ReadOnly()` 当前恒 true：旧 file 编辑面不应被 Wiki 描述成主写作入口，结构体端点和 WS round 才是现行编辑轨。源：`backend/internal/prism/model.go`、`backend/internal/prism/struct_model.go`。
- 文件版本状态 `pending/current/superseded`；每次固化把旧 current 置 superseded 并追加新版本。WS round 是 `prepare → pending diff → apply | reject`，apply 可带 epoch 防另一个窗口覆盖，但缺 epoch 当前仍 fail-open 兼容旧客户端。源：`backend/internal/prism/repository.go`、`backend/internal/prism/ws_round.go`。
- 编译状态 `queued → running → success | error`，错误再分 `latex/infra/timeout`；只有 LaTeX 错误允许前端触发自动修复。内容哈希命中有效成功编译可复用 PDF。重启后超过 5 分钟的 queued/running 会标为 infra error，避免永久轮询。源：`backend/internal/prism/model.go`、`backend/internal/prism/service.go`、`backend/internal/prism/repository.go`。

### 5.11 Agent 会话、Run 与 Skills

- agent 会话和 transcript 的耐久真源是 `agent_sessions` + `agent_turns/agent_turn_events`；JSONL/实时 workspace 是兼容和回退层。产物优先 `agent_artifacts + MinIO`，会话 workspace 仅在未收割时回退。源：`backend/internal/agentbridge/`、`backend/internal/agentartifact/`。
- Run 状态为 `planning → running ↔ awaiting_user → done | failed | canceled`，三个终态不可逆；Phase 1 不产生 awaiting_user。Step 为 `pending → running → done | failed`，租约过期回 pending，顺序取“最早未完成 step”保证同一 Run 串行。默认全局最多 1 个 active Run、每用户 1 个；step 租约 15 分钟、默认最多认领 8 次，可由环境变量覆盖。源：`backend/internal/agentrun/model.go`、`backend/internal/agentrun/repo.go`、`backend/internal/agentrun/engine.go`。
- Run 正文必须留在 workDir，DB 的 `output_ref` ≤4096 bytes，只存 path/chars/evidence ids/note。源：`backend/internal/agentrun/repo.go`。
- Skill 可见性 `private/unlisted/public`，审核 `draft/pending/approved/rejected/flagged`，生命状态 `active/disabled_by_admin/deleted`。发布 public 会进 pending，只有 public+approved+active 可被他人看到/安装；admin takedown 是全局 kill-switch。源：`backend/internal/skillmarket/model.go`、`backend/internal/skillmarket/service.go`。
- 用户 Skill 是不可信内容；后端规范化 `SKILL.md`，不执行 bundle 脚本。免费持有上限 10、付费 50、每 Skill 20 版本、每会话最多启用 5。举报要求公开可见、不能自举报、每用户每 Skill 只计一次，绝不自动下架，必须人工处理。源：`backend/internal/skillmarket/model.go`、`backend/internal/skillmarket/service.go`。

### 5.12 SEO/情报/工具工作流

- 期刊摄取 run 为 `running ⇄ paused → done | failed | cancelled`，running/paused 都占唯一 active 锁；游标和页进度逐页落 MySQL，可断点续跑。源：`backend/internal/seoingest/model.go`、`backend/internal/seoingest/service.go`。
- 情报 webhook 必须配置开启和 HMAC secret；Redis 24 小时 delivery lock + MySQL `news_deliveries` 双层去重。公开端只读取 `status=published`。源：`backend/internal/news/handler.go`、`backend/internal/news/repository.go`。
- 工具导入任务为 `pending → running → succeeded | partial | failed`。工具 `status=published` 只代表产品可见，`seo_indexable` 是独立编辑审核位，批量导入不能自动获得索引资格。源：`backend/internal/featuretool/service.go`、`backend/internal/featuretool/model.go`。

## 6. 数据实体地图

### 6.1 当前业务读取/写入的实体

| 领域 | 表 | Go 真源 | 主要迁移 |
|---|---|---|---|
| 用户/认证 | `users`、`user_auth_providers`、`email_verification_codes`、`user_daily_active` | `backend/internal/user/model.go`、`repository.go`、`metrics.go` | `0001_baseline.sql`、`0036_users_last_active_at.sql`、`0060_users_register_source.sql`、`0069_user_daily_active.sql` |
| 站点配置 | `system_configs`、`email_configs`、`sms_configs`、`github_oauth_config`、`google_oauth_config`、`apple_oauth_config`、`orcid_oauth_config`、`microsoft_oauth_config`、`discourse_sso_config`、`wechat_configs`、`wechat_miniprogram_config`、`wechat_official_config`、`code_snippets` | `backend/internal/common/model/`、`backend/internal/config/`、`backend/internal/wechat/`、`backend/internal/wechatofficial/` | `0001_baseline.sql`、`0056_wechat_miniprogram_config.sql`、`0120_code_snippets_defer_until_idle.sql` |
| 计费/支付 | `billing_config`、`user_wallets`、`credit_reset_passes`、`credit_transactions`、`vip_redemption_codes`、`vip_code_redemptions`、`orders`、`order_refunds`、`user_quota_windows`、`alipay_configs`、`wechat_pay_configs` | `backend/internal/vip/`、`backend/internal/payment/` | `0008_vip.sql`、`0015_billing.sql`、`0016_billing_orders.sql`、`0079`–`0116` 相关迁移 |
| 邀请 | `invite_codes`、`invite_registrations`、`invite_campaign_config`、`invite_milestones`、`invite_reward_grants`、`invite_reward_reversals` | `backend/internal/invite/model.go` | `0099_invite.sql`、`0100_invite_reward.sql`、`0117_invite_campaign.sql`、`0118_invite_reward_audit.sql` |
| Agent | `agent_config`、`agent_models`、`agent_model_bindings`、`agent_providers`、`agent_sessions`、`agent_session_archive`、`agent_turns`、`agent_turn_events`、`agent_billing_ledger`、`agent_saga_steps`、`agent_artifacts`、`agent_attachments`、`agent_runs`、`user_memory_blocks` | `backend/internal/agentconfig/`、`modelcatalog/`、`agentbridge/`、`agentartifact/`、`agentattachstore/`、`agentrun/`、`usermemory/` | `0014`、`0024`–`0026`、`0034`–`0035`、`0046`–`0052`、`0063`、`0066`–`0089`、`0101`–`0104`、`0111`–`0114`、`0119` |
| 论文分析 | `paper_analysis`、`analysis_dimensions` | `backend/internal/ai/model.go` | `0001_baseline.sql` 及 archive 维度演进 |
| 文献集/分享 | `user_library_folders`、`user_library_papers`、`library_shares`、`library_share_papers`、`library_share_access` | `backend/internal/library/model.go`、`share_model.go` | baseline 汇总 + `0013`、`0032`、`0038`、`0055` |
| 暂存区 | `user_staging_areas`、`user_staging_area_papers` | `backend/internal/stagingarea/model.go` | `0001_baseline.sql` |
| 审稿 | `peer_review_submissions`、`peer_review_assets`、`peer_review_reports`、`peer_review_step_cache` | `backend/internal/peerreview/model.go` | baseline 汇总 + `0017_peer_review_one_draft_per_user_mode.sql` |
| Prism | `prism_projects`、`prism_files`、`prism_file_versions`、`prism_compiles`、`prism_edits`、`prism_struct_versions`、`prism_revision_items` | `backend/internal/prism/model.go`、`struct_model.go`、`revision.go` | `0009_prism_fields.sql`、`0011_prism_edits.sql`、`0053`–`0054`、`0058`–`0059`、`0072` |
| 内容/运营 | `announcements`、`feedbacks`、`feedback_attachments`、`messages`、`user_messages`、`promo_config`、`support_center_config`、`mail_inbox` | 对应 `backend/internal/{announcement,feedback,message,promo,supportcenter}/` | `0001_baseline.sql`、`0027`–`0028`、`0037`、`0039` |
| 工具/Skills/Prompt | `feature_tools`、`feature_tool_import_jobs`、`feature_tool_webhooks`、`feature_tool_webhook_deliveries`、`user_skills`、`skill_versions`、`user_enabled_skills`、`skill_reports`、`feature_prompts`、`feature_prompt_history` | `backend/internal/featuretool/model.go`、`skillmarket/model.go`、`promptregistry/model.go` | `0010`–`0011`、`0044`、`0061`–`0062`、`0073`、`0121` |
| 情报/热度/统计 | `news_items`、`news_deliveries`、`news_webhook_config`、`hot_search_keywords`、`hot_papers`、`hot_content_config`、`usage_events`、`llm_token_usage`、`email_logs` | `backend/internal/{news,hotcontent,usagestat,llmusage,emaillog}/` | `0003`、`0006`–`0007`、`0022`–`0023`、`0040`–`0043`、`0065` |
| SEO | `seo_papers`、`seo_authors`、`seo_journals`、`seo_journal_sync_runs` | `backend/internal/seo/`、`backend/internal/seoingest/model.go` | baseline 汇总 + `0045`、`0057`、`0122`–`0126` |
| 第三方 | `third_party_accounts` | `backend/internal/thirdparty/model.go` | `0001_baseline.sql` |

### 6.2 迁移执行模型

- 当前目录有 128 个现行 SQL 文件，编号从 `0000` 到 `0126`；因为 `0011_feature_tools_fulltext.sql` 与 `0011_prism_edits.sql` 同号，文件数比编号跨度多 1。脚本按完整文件名字典序执行，所以当前先执行 `0011_feature_tools_fulltext.sql`、再执行 `0011_prism_edits.sql`。源：`docker/mysql/migrations/`、`scripts/run-migrations.sh`。
- schema-sync 是一次性 MySQL 8 容器，每次启动等待数据库、创建/授权 Umami 库、按文件名全量重放所有现行迁移，任何失败立即退出。开发和生产 compose 都把 migration/script 只读挂入。源：`docker-compose.yml`、`docker-compose.prod.yml`、`scripts/run-migrations.sh`。
- 迁移依赖 `0000_utils.sql` 的幂等列/索引/外键工具和分区延展过程；结尾会清理部分工具过程。当前应用代码无 `AutoMigrate`，所以漏进迁移的字段/索引不会由 backend 自愈。源：`docker/mysql/migrations/0000_utils.sql`、`scripts/run-migrations.sh`。
- 静态扫描现行迁移可见 118 个 `CREATE TABLE IF NOT EXISTS` 名称，但这不是最终库表数：例如 `usage_quotas` 随后在 `0018_drop_usage_quotas.sql` 显式删除，运行库还可能有历史表。最终事实必须查目标数据库 `information_schema`。
- `archive/` 不由 schema-sync 执行，只保存历史演进与废弃说明；新文档不得把 archive SQL 当成当前部署动作。源：`scripts/run-migrations.sh`、`docker/mysql/migrations/archive/`。

## 7. 已下线、封存或容易误判的遗留

| 项目 | 当前事实 | 证据 |
|---|---|---|
| 旧签到 | 无模块、无路由、现行 baseline 无签到记录/统计表；仅有孤立 `feature_configs.user_checkin` seed 和 archive DDL | `docker/mysql/migrations/0001_baseline.sql`、`docker/mysql/migrations/archive/DEPRECATED_TABLES.md` |
| 优惠券 | `coupon_templates`、`user_coupons`、`coupon_usage_logs`、`coupon_batches` 仍由 baseline 建，但 Go 无消费方；`orders.coupon_id` 也未参与计价 | `0001_baseline.sql`、`backend/internal/vip/order.go` |
| 旧订阅 | `subscription_plans`、`user_subscriptions` stranded；现行会员真源是 `users.vip_* + orders + billing_config` | `0001_baseline.sql`、`backend/internal/vip/` |
| 旧支付流水 | `payment_transactions` stranded；现行支付/营收读 `orders`，回调直接履约 | `backend/cmd/server/routes_admin.go`、`backend/internal/vip/order.go` |
| 旧邀请 | `user_invitations`、`invitation_relationships` 仅由 0117 首次迁移导入，运行时不读 | `backend/internal/invite/model.go`、`0117_invite_campaign.sql` |
| 临时经费 | `credit_temp_lots` 表封存；0090 后不参与余额，0092 已折算 reset passes | `backend/internal/vip/wallet.go`、`0092_reset_passes_migrate.sql` |
| 旧 usage | `usage_logs`、`usage_log_config` 保留历史，无运行读写；v2 真源为 `usage_events`。`usage_quotas` 已显式 drop | `backend/internal/usagestat/model.go`、`backend/internal/common/cleanup/cleanup.go`、`0018_drop_usage_quotas.sql` |
| 管理员审计 | `admin_audit_logs` 表保留，写入链和路由已删除；高风险动作目前主要靠 slog/业务表留痕 | `docker/mysql/migrations/archive/DEPRECATED_TABLES.md` |
| 消息模板 | `message_templates` 保留，模板 CRUD/渲染已删除；站内信 `messages/user_messages` 仍活跃 | `docker/mysql/migrations/archive/DEPRECATED_TABLES.md`、`backend/internal/message/` |
| 审稿 skill 旧表 | `peer_review_skills` 保留，prompt 已迁至 `feature_prompts`；历史 `reviewer_skill_id` 按新 prompt id 解释 | `backend/internal/peerreview/spec.go`、`docker/mysql/migrations/archive/DEPRECATED_TABLES.md` |
| Prism 旧聊天 | `prism_chat_messages` 保留但不读；对话历史真源为 agent journal | `backend/internal/prism/history.go`、`backend/internal/prism/model.go` |
| 旧 feature 配置 | `feature_configs` 没有当前 Go 消费方，不能用其中 enabled 判断功能是否上线 | `0001_baseline.sql`、`backend/internal/` 模块/路由清单 |
| 公开公告 | `announcements` 后台 CRUD 活跃，但公开读取 handler/route 已删除或从未接上；维护白名单仍列 `/announcements/active` | `backend/internal/announcement/handler.go`、`backend/internal/common/middleware/maintenance.go` |

特别注意：`docker/mysql/migrations/archive/DEPRECATED_TABLES.md` 把 `orders` 和支付回调也写成废弃，这是旧状态。现行 `vip.OrderService` 已注入支付宝/微信 handler，订单、支付和退款都是活跃业务；Wiki 不应照抄该文档。

## 8. Coverage gaps 与待确认项

以下不是本报告擅自定义的新规则，而是静态审计无法闭合或源码自身不一致的地方：

1. **生产动态值未知。** 价格、额度倍率、充值汇率、活动奖励、支付渠道、维护模式、OAuth/邮件/短信开关均可从后台改；本文列的是代码 fallback/seed 和校验边界。发布 Wiki 的“当前价格/活动”前应从生产 `/api/v1/admin/billing/config`、`/api/v1/admin/invites/campaign` 或数据库确认。
2. **公告公开面缺失。** 维护 middleware 白名单和模块注释都提到公开公告，但当前路由只有后台 CRUD，没有 `/api/v1/announcements/active`。Wiki 不应宣称用户能收到后台公告，除非补路由或确认前端从别处取数。
3. **签到展示可能是假入口。** baseline 的 `feature_configs` 仍把 `user_checkin` 标为 enabled，但无任何后端能力。应核查前端是否还显示入口，并在 Wiki 明确“未上线/已下线”。
4. **优惠/促销概念需要拆开。** Promo 只有二维码引流；Coupon 完全未接业务；Invite 才有可审计奖励。Wiki 不应把三者合写成一个“优惠活动系统”。
5. **支付注释/抽象仍有旧语义。** `payment.OrderServiceInterface` 注释称订单模块未实现，`vip/order.go` 文件头称订阅赠临时经费，维护模式注释称系统无退款链路；实际代码相反。后续维护应优先清这些注释，减少二次误判。
6. **支付宝缺少用户主动查单自愈。** 微信有 `/payment/wechat/status/:orderNo`，支付宝只有异步回调。回调重试窗口外的漏单需要怎样人工对账，仓库没有对外流程文档。
7. **退款不是网关退款。** `payment.Provider` 抽象仍声明 `Refund`，但现行 admin 退款明确不调用它。Wiki 必须写清“先商户后台退，再系统登记”，并补运营 SOP、商户退款单号要求和对账责任人。
8. **订阅退款权益无法精确分段撤回。** 当前只有用户最终等级/到期日，没有每张订单贡献的 entitlement schedule；部分退款是否撤销会员由管理员决定。这是业务口径空白，不应由 Wiki 作者自行推断。
9. **额度并发超用是已知边界。** 闸门只在 turn 起点，单轮与并发 in-flight turn 可超出。若 Wiki 承诺“达到 100% 立即停止且绝不超额”会与实现不符。
10. **Prism 兼容 API 与实际可编辑面不一致。** file CRUD 路由仍存在，但 `Project.ReadOnly()` 恒 true；旧 legacy 与新 struct 的可操作矩阵需要一次端到端接口测试后再写用户教程。
11. **Agent 条件路由依赖装配。** `/claw/runs` 和通用附件端点有 nil guard；某环境是否真实出现取决于 bootstrap/config。Wiki 功能清单应以目标部署的启动日志和 route smoke test 再确认。
12. **迁移最终形态未在真实库验证。** 128 个 SQL 每次全量重放，且存在重复 `0011` 前缀、历史一次性 mark、显式 drop 例外。应补一项干净库建库 + 存量库重放 + `information_schema` 快照测试，避免静态 `CREATE TABLE` 清单被误当最终 schema。
13. **后台审计能力不完整。** 退款有独立业务审计表，邀请也有 grant/reversal 审计；但角色、配置、代码片段等高风险改动没有统一 `admin_audit_logs` 写入。Wiki 可描述当前权限，不应声称所有后台写操作均有数据库审计。
14. **未覆盖实时外部状态。** MiniCod 字段/配额、WeChat/Alipay 商户能力、Umami、MinIO 生命周期、Redis AOF 和 scholar-agent 实际模型/并发配置未做在线探测；这些需各自的运行审计。

## 9. Wiki 编写建议：稳定事实与动态事实分离

- 可以直接写入长期文档的稳定事实：角色权限、接口认证方式、订单/退款状态机、会员不可降级、额度按真实成本统一计量、邀请关系快照、签到/优惠券当前未接后端。
- 应标注“以后台实时配置为准”的动态事实：套餐价格、倍率、充值汇率、活动开关/奖励、支付渠道可用性、推广文案、支持联系方式、模型目录。
- 面向运营的操作说明必须区分：退款是“网关先退 + 系统登记”；Promo 是“二维码引流”；邀请奖励是“系统内自动入账”；兑换码是“人工生成的会员/经费凭证”。
- 每次后端新增/删除 route、迁移或计费规则时，优先更新本文件相应证据索引，再由 Wiki 页面引用，不要复制一套失去源路径的数字和规则。
