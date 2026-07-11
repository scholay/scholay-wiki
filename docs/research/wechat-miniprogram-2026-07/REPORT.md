# Scholay 微信小程序端立项分析报告

> 面向 owner 的架构决策文档 · 只读分析,基于现有代码证据(file:line)
> 就绪度图例:✅ready(直接复用) / 🟡adapt(轻改) / 🟠rebuild(重建) / ⛔blocked(不适合小程序)
> 工作量:S / M / L / XL
> 生成时间:2026-07-09 · 方法:8 维度并行深挖(认证/API/实时/支付/功能/平台约束/技术栈/基建)+ 综合

---

## 一、结论摘要(TL;DR)

**能不能做:能,且技术地基意外地友好。** 后端是一套端无关的 REST + WebSocket(JWT Bearer 鉴权)服务,鉴权、限流、CORS、WS 升级四条链路对小程序天然兼容,几乎零改动即可被复用。真正的重活全在前端(UI 层 100% 重写)和三个必须新建的后端能力上。

**复用多少:**
- **后端**:纯 REST 业务域(搜索/期刊/作者/资讯/内容/暂存区/会员计费/站内信/记忆/个人资料)≈ **可直接复用,零或极小改动**。订单-充值-订阅-回调履约基建(`orders` 表 + `vip.OrderService.fulfill`)渠道无关,**100% 复用**。
- **前端**:UI 层(shadcn/Radix/Tailwind/DOM 组件)**全部重写**;非 UI 层(手写 TS 类型契约 66+59 处、38 个纯逻辑 lib、query-hook 模式、zustand slice)**可跨端搬**。

**最大风险(三个硬缺口 + 一个合规红线):**
1. ⛔ **无小程序原生登录**:全仓 grep `jscode2session/code2session/getPhoneNumber` 零命中(`bootstrap_domains.go:32` 里"小程序"只是误导性注释)。现有微信登录是网页扫码 OAuth,拿不到小程序 openid。**这是所有账户/收藏/会员/支付功能的共同前置阻塞项。**
2. ⛔ **无小程序 JSAPI 支付**:微信支付只实现 Native 扫码(`wechat_pay_service.go:190`),缺 JSAPI 下单 + `wx.requestPayment` 二次签名;**支付宝在小程序内被微信平台封禁,硬约束不可用**。
3. ⛔ **零内容安全接入**:全库 grep `msgSecCheck/mediaCheckAsync` 零命中。UGC + AI 生成文本**强制过检**才能过审、不封号——**这是上线最高优先级合规缺口**。
4. 🟡 验证码目前只打 docker logs、无真实短信通道(CLAUDE.md「Email Verification Codes」),若以手机号登录为主则上线前必接。

**推荐技术栈:Taro(React) 为主选。** 团队既有 React 19 + TS strict + zustand + TanStack Query 心智可直接迁移,非 UI 层复用面最大,一套代码同产 H5 + 小程序。**唯一例外**:若一期范围极窄(仅搜索+详情+收藏、无 WS/无编辑器),原生小程序也有竞争力(审核最友好、包体最小)。**不推荐 uni-app(Vue)**——与 React 栈心智全断裂。

**MVP 范围(对齐现有移动 web `/m/*` 的 4 tab,产品已做过一轮移动取舍):**
浏览(传统搜索 + 论文/期刊/作者详情 + 资讯)· 收藏文献集 · 功能广场 · 我的(资料/会员)。这批是纯 `wx.request` + JWT,后端零改动或极小改动。

**工作量分级:**
- P0 骨架 + 登录 + 搜索/详情:后端 **M**(仅小程序登录端点)+ 前端 **L**(UI 地基 + 网络层适配)
- P1 文献集 + 会员 + JSAPI 支付:后端 **M** + 前端 **L**
- P2 agent 类 WS 功能(智能搜索/助手):前端 **L~XL**(整套流式状态机 + markdown 渲染重写)
- P3 内容安全 + 审核上线:后端 **L**(内容安全服务是硬合规,不可省)
- **明确不做**:Prism(LaTeX IDE)⛔、PDF 全文预览 ⛔、审稿提交 ⛔(降级为"请用电脑端"引导)

---

## 二、现有系统盘点

**认证与身份体系 🟡(就绪度高,缺一块原语)**
一套完整、provider 无关的账号体系:邮箱密码/验证码、手机密码/验证码、六种 OAuth(github/google/orcid/apple/microsoft/discourse)+ 微信网页扫码登录。JWT 由 `utils.GenerateTokenWithRole` 签发,`type/role/user_id` 三字段驱动,**与登录方式完全解耦**(`jwt.go:41-91`),小程序登录成功后可直接复用同一套 middleware 与 Redis 吊销链路。`user_auth_providers` 已能存微信 openid/unionid,`merge_token` 冲突合并、`ensureNotLastLoginMethod` 解绑保护均 provider 无关。**唯一缺口**:小程序原生登录(`jscode2session` / `getPhoneNumber`)从零。就绪度:核心链路 ✅,小程序入口 🟠。

**REST API 全景 ✅(高复用)**
所有业务挂 `/api/v1`,受保护路由统一 `UserAuthMiddleware()` + 分级限流,鉴权 = Bearer JWT,端无关。纯 REST 域占比很高:搜索(公开 `OptionalUserAuth`)、期刊、资讯、内容中心、工具黄页、暂存区(最干净的 CRUD)、会员计费、站内信、记忆、个人资料。这批 `wx.request` 直连即可。就绪度:✅ready。

**实时/WebSocket 🟡(协议可复用,客户端重写)**
三个 agent 功能(智能搜索/助手/写作)+ 站内信跑原生 WS,鉴权走"REST 换 30s 一次性 `ws_token` → `?ws_token=` query 升级"两段式(`http_handler.go:196-213`)。**后端零改动即可复用**:WS 端只认 query 参数(`ws.go:362-393`),小程序 `wx.connectSocket` 可带 query;`CheckOrigin` 对无 Origin 直接放行(`ws.go:54-74`),小程序无 Origin 天然通过。重入续流、3 分钟 grace 保活、`agent_turn_events` journal 回放都现成。**重活在客户端**:`useAgentSocket` 依赖浏览器 WebSocket + `requestAnimationFrame` + `document.visibilityState`,全部要用 `SocketTask` + `setData` 节流重写。就绪度:后端 ✅,客户端 🟠。

**支付与会员计费 🟡(基建满分,缺 JSAPI 一路)**
订单-充值-订阅-回调履约设计良好、渠道解耦:`vip.OrderService`(`CreateRecharge`/`CreateSubscription`/`QuoteSubscription`)落 `orders` 表,`fulfill()` 事务内 `FOR UPDATE` 锁单 + `status=paid` 幂等 + 金额校验(`order.go:287-353`)。微信回调 `HandleNotify` 渠道无关,`WeChatPayNotifyDecrypted` 已含 `Payer.OpenID`,JSAPI 与 Native 回调格式一致,**回调侧零改动**。RSA-SHA256 v3 签名逻辑(`wechat_pay_service.go:280-320`)可复用于 JSAPI 下单 + 二次签名。**缺口**:JSAPI 下单 + `prepay_id` 解析 + `wx.requestPayment` 二次签名从零;`sendRequest` 写死只取 `code_url` 需泛化。就绪度:基建 ✅,小程序支付 🟠。

**功能盘点 🟡→⛔(分层清晰,渲染栈是天花板)**
后端 13 个用户可见功能域分层干净。真正门槛不在后端,而在前端渲染栈:PDF 预览(react-pdf/pdfjs)、LaTeX IDE(CodeMirror/Tiptap/MathLive)、Markdown+公式(react-markdown+rehype-katex)全依赖 DOM/Worker,**无法搬进小程序**。现有移动 web `/m/*` 已把审稿/写作/矩阵标为纯 PC 能力(给"建议电脑端使用"引导页,`MobileToolsHomePage.tsx:33-35`),是小程序 MVP 范围的最佳蓝本。就绪度:只读/账户类 ✅~🟡,重编辑器类 ⛔。

---

## 三、小程序端 vs Web 端的根本差异与硬约束

| 约束项 | Web 端现状 | 小程序硬约束 | 影响 |
|---|---|---|---|
| **请求域名** | 同源相对路径 `/api/v1`(nginx 反代,`http.ts:10`) | `request` 合法域名必须是绝对 HTTPS 域名,mp 后台登记 | 🟡 `BASE_URL` 改配置化绝对域名 |
| **socket 域名** | `wss` 按 `window.location.protocol` 判断 | `socket` 合法域名单独登记 `wss://`,不能 IP | ✅ 域名同为 `www.scholay.com`,加白名单即可 |
| **upload/download 域名** | 同域 multipart / 二进制直连 | 两类各自登记合法域名 | 🟡 改 `wx.uploadFile/downloadFile` |
| **域名修改额度** | 无限制 | 四类合计**每月约 50 次改动额度** | 上线前一次性配齐,避免反复改耗光 |
| **TLS** | compose 只暴露明文 `5411`,443 由外层边缘终结(`docker-compose.yml:518`) | 强制有效 HTTPS/WSS 证书 + ICP 备案(已通过) | ⛔ 上线前必须带外确认边缘证书就绪 + `X-Forwarded-Proto` 透传 |
| **内容安全** | 无任何过检 | UGC + AI 文本**强制** `msgSecCheck`、图片/PDF `mediaCheckAsync` | ⛔ 零接入 = 审核驳回 + 上线后违规可封号 |
| **包体积** | 无限制 | 主包 ≤2MB、整包 ≤20MB | 🟡 重库放分包按需加载 |
| **支付宝** | wap/page 跳转 URL 可用 | 微信平台**封禁**小程序内跳转支付宝(审核红线) | ⛔ 小程序只能微信 JSAPI |
| **SSE 流式** | `fetch + ReadableStream`(`sse-post.ts`) | `wx.request` 不支持标准 SSE | 🟡 翻译/识别流改 WS 或 `enableChunked` |
| **cookie** | `scholay_token` cookie 跨 tab 共享 | 无 cookie | ✅ 后端 `extractToken` 已优先 Bearer header,删 cookie 分支即可 |
| **localStorage** | token 真源 `localStorage.auth_token` | 无 localStorage/window storage 事件 | 🟡 换 `wx.setStorageSync`,跨 tab 同步语义删除 |
| **第三方 OAuth** | github/google/orcid 等 8 方重定向式 | webview 内难走重定向,基本不可用 | 🟠 settings 连接账号页裁剪,只留微信+手机 |
| **Turnstile** | `@marsidev/react-turnstile` 人机验证 | 小程序不可用 | 🟠 改小程序侧风控或后端限流兜底 |
| **审核红线** | — | 诱导分享、外链下载 APK/文件、跳外部支付、未备案域名 | 自查 claw artifact 外链下载改站内预览 |
| **资质** | — | news 资讯若含时政触发新闻信息前置资质 | 首提审弱化教育/学历/医疗表述 |

---

## 四、关键缺口清单(后端必须新增,按优先级)

### P0 — 小程序登录(阻塞一切) 🟠 M
所有账户/收藏/会员/支付/agent 功能的共同前置。
- 新增 `POST /api/v1/user/wechat/miniprogram/login`:调上游 `GET https://api.weixin.qq.com/sns/jscode2session?appid&secret&js_code&grant_type=authorization_code` 换 `openid/unionid/session_key`,**可复用 `wechat.wxUpstream()` 的 upstream client**(已配 base + 熔断 + 重试)。
- 拿到 unionid 后直接调 `service.LoginOrRegisterWithWeChat`(`service_oauth.go:401-523`)复用归一/建号/签 JWT/欢迎信全链路。
- **配置落点**:新建 `wechat_miniprogram_config` 表(照 `wechat_official_config` 独立配置表模式),admin 可改 appid/secret。**不要**硬塞进单 active 的 `wechat_configs`(它只有网页 `snsapi_login` 字段)。

### P1 — 小程序 JSAPI 支付 🟠 M(拆三个 S)
依赖 P0 拿到 openid。
1. `CreateJSAPIOrder`:仿 `CreateNativeOrder`,请求 `/v3/pay/transactions/jsapi`,body 加 `payer.openid`,解析 `prepay_id`。先把 `sendRequest` 从"只取 `code_url`"重构成"返回原始 body/泛化字段提取"。
2. 二次签名函数:对 `appId\n timeStamp\n nonceStr\n prepay_id` 串做 RSA-SHA256,复用 `generateSignature` 的私钥签名部分。
3. `POST /api/v1/user/payment/wechat/jsapi/create`:校验订单归属 + pending → 下单 → 二次签名 → 一次性返回 `wx.requestPayment` 五参(约 60-80 行)。
- **回调零改动**:走现有 `/payment/wechat/notify` + `fulfill`。
- **配置**:小程序 appid 需与商户号 mchid 在微信支付后台绑定;若与 Web appid 不同,`wechat_pay_configs` 需支持两套 appid。
- **遗留技术债**:v3 回调平台证书 RSA 验签仍是 TODO(现只做 AES-GCM 解密 + mchid/appid 断言),建议借小程序上线补齐(引 `wechatpay-go` validator,Native/JSAPI 共享)。

### P2 — 手机号授权(可选,视登录主入口) 🟠 L
- 优先走新版 `POST https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=<小程序全局token>` 提交前端 `phoneCode` 换手机号,**规避保管 `session_key`**。
- 需补一个小程序 global access_token 的 Redis 缓存器(类似公众号 token,~7000s)。
- 解出手机号后复用 `users.Phone` 唯一约束与现有手机绑定/登录路径(`LoginWithPhoneCode`)。

### P3 — 内容安全(合规阻塞,上线前必做) 🟠 L
- 后端新增内容安全服务,拿小程序 access_token 调 `wxa/msg_sec_check`(文本)与 `media_check_async`(图片/PDF)。
- 接到三个咽喉:AI 输出(smart_search/claw/prism/peerreview)、搜索结果标题摘要、用户输入。
- **AI 流式的工程难点**:边流边检成本高,建议"攒段再检 / 异步补检",先保证提审通过。

### 附带:验证码真实通道 🟡 S
若手机号登录为主,上线前把验证码从"打 docker logs"切换为真实短信服务。

---

## 五、技术栈选型

### 推荐:Taro(React) 为主选

**理由:**
1. **心智连续**:团队既有 React 19 + TS strict + zustand v5 + TanStack Query v5,Taro 生态全部支持,迁移成本最低。
2. **非 UI 层复用面最大**:类型契约(shared/api 66 + 各 feature 59)、38 个纯逻辑 lib、query-hook 模式、zustand slice 可直接搬。
3. **一套代码多端**:同产 H5 + 微信小程序,未来扩支付宝/抖音小程序低成本。

**唯一竞争对手 — 原生小程序**:仅当一期范围极窄(搜索+详情+收藏、无 WS/无编辑器)时才推荐——审核最友好、包体最小、无构建层不确定性;代价是传输层/状态层也要重写,React 心智无法复用。**范围越小,原生相对 Taro 劣势越小。**

**排除 — uni-app(Vue)**:与 React/TS 栈心智全断裂,团队要维护两套范式。

### 三层复用边界(决定排期)

| 层 | 内容 | 就绪度 | 工作量 |
|---|---|---|---|
| **① 直接搬** | 手写 TS 类型(66+59 处)· 38 个纯逻辑 lib(pick-field/source/citation/minicod-papers/account-validation/search-filters/relative-time/chart-format 等)· 引用生成器(GB/T 7714 纯格式化) | ✅ | S |
| **② 适配传输层** | `http.ts`(BizCode/toApiError 逻辑留,axios→`Taro.request`,BASE_URL→绝对域名,token→`wx.storage`)· `auth-token`+`auth.store`(zustand 核心留,cookie/storage 事件删)· query hook 底层 queryFn | 🟡 | M |
| **③ 全量重写** | 全部 UI(shared/ui 22 + shared/components 50+ + features 页面,shadcn/Radix/Tailwind 无小程序运行时)· 路由(react-router v7 loader → 页面栈守卫)· WS(`useAgentSocket` → `SocketTask`,ws-ticket 协议留)· markdown 渲染(react-markdown → towxml/mp-html) | 🟠 | XL |

> **选型的真正差异只在 ② 层**:Taro 能保住 React 写法与结构,原生则 ② 层也要重写。UI(③ 层)是最大工作量且三条路线都逃不掉。

### 明确不可移植(⛔,与选型无关)
PDF(pdfjs)· LaTeX 编辑(CodeMirror)· 智能写作(Tiptap/MathLive)· 图表(recharts)· 流程图(mermaid)· 复杂公式(KaTeX 全量)。这些只能 web-view 承载 H5、降级、或不做。

### 复用清单 vs 重写清单

| ✅ 复用(后端) | 🟠 重写(前端) |
|---|---|
| JWT 签发 + `UserAuthMiddleware` | 全部 UI 组件 |
| `user_auth_providers` 绑定/解绑/merge_token | 路由层 |
| `orders` + `vip.OrderService.fulfill` 履约 | WS 客户端状态机 |
| `HandleNotify` 回调验签 | markdown/公式渲染 |
| ws-ticket 两段式协议 | token 存储层 |
| IP 限流 / CORS / WS CheckOrigin | 流式节流(rAF→setData 批处理) |
| 纯 REST 业务域全体 | — |

---

## 六、独立项目文件夹结构建议

**布局:sibling 独立目录/仓库**(与 `backend`、`frontend-user` 平级,**不塞进 frontend-user**)。

### 方案 A:Taro(推荐,贴近现有栈)
```
miniprogram/
├── project.config.json          # 小程序项目配置
├── config/                       # Taro 构建配置(dev/prod BASE_URL 切换)
├── src/
│   ├── app.tsx / app.config.ts
│   ├── pages/                    # 页面栈(search/paper-detail/journal/library/me/vip …)
│   ├── components/               # Taro 组件(重写自 shared/ui + shared/components)
│   ├── services/
│   │   ├── request.ts            # 对标 http.ts:Taro.request + Bearer 注入 + BizCode + 401/2030/2031 重登
│   │   ├── types/                # ← 复制 frontend-user/src/shared/api/types.ts(文件头标注 Go struct 真源)
│   │   └── api/                  # 各 feature 接口封装(对标 shared/api)
│   ├── lib/                      # ← 直接搬 38 个纯逻辑 lib(feed-cache 等读存储的换 wx.storage)
│   ├── hooks/
│   │   └── useAgentSocket.ts     # 重写为 wx.connectSocket,ws-ticket 协议照搬
│   ├── store/                    # zustand slice(auth 换 wx.setStorageSync)
│   └── styles/                   # WXSS + rpx,重落一套 token 映射(Tailwind CSS 变量不可直接用)
└── package.json
```

### 方案 B:原生(仅当一期极窄)
```
miniprogram/
├── app.js / app.json / project.config.json
├── pages/ · components/
├── services/          # api 封装,对标 shared/api
├── utils/request.js   # 对标 http.ts 拦截器
└── store/             # 对标 auth-token.ts,用 wx.storage
```

### API 契约同步
- **首期**:把 `shared/api/types.ts` 等手写 interface **复制**进 `miniprogram/services/types`,文件头标注对应后端 Go struct 真源。
- **守漂移**:把小程序驱动 UI 的关键响应纳入现有 `tests/contract` 的 zod 校验,后端改字段时 CI fail(现有 contract 只覆盖 web 端,需扩)。
- **风险**:这会产生"第三份镜像"(Go struct + frontend-user + miniprogram),漂移风险上升。若要强一致,可抽 types-only 内部包被两端依赖(工程量偏大,非首期必需)。

### 域名策略(二选一)
- **开纯 API 子域 `api.scholay.com`**:`server_name` 已是 `_` 通配(`user.conf:16`),零 nginx 改动,只需 DNS + 边缘 TLS + 小程序白名单一条纯 API 域(更清爽)。
- 或直接复用 `www.scholay.com/api`。

---

## 七、分阶段路线图

### P0 — 骨架 + 登录 + 搜索/详情(最快上线的轻端)
**后端改动:**
- 🟠 M — `POST /api/v1/user/wechat/miniprogram/login`(jscode2session,复用 `wxUpstream` + `LoginOrRegisterWithWeChat`)
- 🟠 M — 新建 `wechat_miniprogram_config` 表 + admin 配置项
- 🟡 S —(若手机号登录)接真实短信通道

**前端页面**:登录页 · 传统搜索(公开 `/public/papers/search`)· 论文详情 · 期刊检索/详情 · 作者详情 · 资讯 feed/详情(towxml/mp-html 渲染 body_md)· 功能广场。

**验收**:wx.login 一键登录拿到 JWT → 所有受保护 REST 可调;搜索/详情/资讯纯 `wx.request` 直连跑通;域名白名单配齐、TLS 证书确认。

---

### P1 — 文献集 + 会员 + 小程序支付(变现闭环)
**后端改动:**
- 🟠 M — JSAPI 支付三件套(`CreateJSAPIOrder` + 二次签名 + `/jsapi/create` 端点)
- 🟡 — `sendRequest` 泛化;`wechat_pay_configs` 支持小程序 appid
- (建议)补 v3 回调平台证书验签

**前端页面**:文献集(CRUD/文件夹/移动)· 暂存区(最干净 REST)· 会员中心(`/membership`/`/billing/overview`/`/transactions`/`/orders`)· 充值/订阅下单 → `wx.requestPayment`。PDF 上传改 `wx.uploadFile`,SSE 识别降级为提交后轮询任务状态。**支付前端据 `payment_methods` 隐藏支付宝**。

**验收**:建单拿 order_no → JSAPI 下单 → 拉起收银台 → 回调 `fulfill` 幂等履约 → 会员开通;文献集 CRUD + PDF 上传轮询识别跑通。

---

### P2 — agent 类 WS 功能(智能搜索 → 智能助手)
**后端改动:零**(ws-ticket 协议 + CheckOrigin 无 Origin 放行 + 3 分钟 grace 续流全现成)。

**前端页面**(从 0 搭地基,一次投入多功能共用):
- 🟠 L — WS 客户端状态机(`SocketTask`:onMessage/onOpen/onClose/onError,ping/退避重连/看门狗移植,`crypto.randomUUID`→uuid 库)
- 🟠 M — 流式节流(无 rAF,`content_delta` 高频帧改"累积 + ~100-200ms `setData`"批处理,否则长会话卡死)
- 🟠 M — `onHide/onShow` 后台切换断/重连(服务端 grace 已兜"短暂切走再回来")
- markdown 渲染(towxml/mp-html,公式先降级纯文本/图片)

**顺序**:先智能搜索(只读、haiku 便宜档、无文件工具,最小可行)→ 再智能助手(补文件上传/artifact/论文卡片/引用,最重)。**单页只保持一条 agent WS**(小程序 socket 并发有限)。站内信 MVP 用官方订阅消息 + 轮询未读数替代常驻 WS。

**验收**:智能搜索流式对话不卡、切后台回来续流不断;智能助手文件/卡片/成果交付跑通。

---

### P3 — 内容安全 + 审核上线(合规阻塞)
**后端改动:**
- 🟠 L — 内容安全服务(`msg_sec_check` 文本 + `media_check_async` 图片/PDF),接 AI 输出/搜索结果/用户输入三咽喉,AI 流式攒段再检
- 小程序 global access_token Redis 缓存器(P2 手机号也需)

**上线前自查**:去诱导分享话术;文件下载改站内预览(claw artifact 不外链下载);首提审弱化教育/学历/医疗表述;news 若含时政先排查资质,含则单独申请或暂不上该 tab;确认所有四类域名已备案 + 有效证书。

**明确不做/降级**:Prism ⛔(给"请用电脑端"引导页,复用 `MobilePcOnlyPage` 思路)· PDF 全文 ⛔(web-view 打开 URL 或后端转图)· 审稿提交 ⛔(最多保留"查看工单状态"只读)· 落地页/SEO 页(小程序码 + 原生转发卡片替代)· `/s/:token` 分享(复用后端 `PublicGetShare`,换原生转发承载)。

---

## 八、需要 owner 拍板的决策点(去重 + 推荐默认值)

| # | 决策点 | 选项 | **推荐默认** |
|---|---|---|---|
| 1 | **技术栈** | Taro(React) / 原生 / uni-app | **Taro**(除非一期极窄则原生);排除 uni-app |
| 2 | **一期功能范围** | 轻只读(搜索/详情/收藏/资讯)/ 含 agent 对话 | **轻只读**,agent 放二期 |
| 3 | **小程序登录主入口** | 微信一键(jscode2session)/ 手机号验证码(需接短信) | **微信一键**(体验最好),手机号作补充绑定 |
| 4 | **unionid 归一方案** | A: 复用 `provider=wechat`,按 unionid 命中即登入、不插第二行 openid / B: `provider=wechat_mini` 独立存 openid + 新增跨 provider unionid 查询 | **方案 A**(规避 `uk_provider_union` 唯一键冲突,天然与网页扫码用户同一 users 行) |
| 5 | **手机号解码路径** | getuserphonenumber(phoneCode,需 global token,免 session_key)/ encryptedData(需存 session_key) | **getuserphonenumber**(规避 session_key 保管,现无任何 session_key 存储模型) |
| 6 | **小程序凭据配置落点** | 扩 `wechat_configs` 加 kind 列 / 新建独立表 | **新建 `wechat_miniprogram_config`**(照 `wechat_official_config` 模式) |
| 7 | **支付是否一期必备** | 一期做 JSAPI / 二期做(一期会员只读) | 若要变现闭环 **一期紧随登录**;纯拉新则可暂缓 |
| 8 | **小程序 appid 是否复用 Web appid** | 复用 / 全新(拆两套配置) | 需带外确认商户号 mchid 绑定情况,倾向**小程序独立 appid + 配置支持两套** |
| 9 | **是否补 v3 回调平台证书验签** | 借上线补 / 维持技术债 | **借上线补齐**(引 `wechatpay-go`,Native/JSAPI 共享) |
| 10 | **重型能力(PDF/审稿/写作)降级形态** | 统一"引导去网页" / web-view 内嵌 H5 | **引导去网页**(个人类目可能禁 web-view;web-view 拿不到原生登录/支付/分享);审稿保留"查看工单只读" |
| 11 | **站内信实时性** | 常驻 wss(占并发额度)/ 官方订阅消息 + 轮询未读数 | **订阅消息 + 轮询**(省一条连接,更符合小程序通知规范) |
| 12 | **markdown 渲染选型** | towxml(体积大功能全)/ mp-html(轻)/ 自研 | **mp-html**(轻量),公式先降级,不复刻 KaTeX 全量 |
| 13 | **域名** | 开 `api.scholay.com` 子域 / 复用 `www.scholay.com/api` | **开子域**(小程序白名单一条纯 API 域更清爽);零 nginx 改动 |
| 14 | **类型契约同步** | 复制 + tests/contract 守卫 / 抽 types-only 内部包 | **首期复制 + 扩 contract 校验**;强一致需求再抽包 |
| 15 | **仓库关系** | 完全独立 / monorepo 共享 shared 子集 | **独立仓库 sibling 目录**(首期简单),复制 types |
| 16 | **AI 流式内容安全策略** | 边流边检(体验好、工程复杂)/ 攒段/完成后补检 | **攒段补检**(先保提审通过,接受短暂未检窗口) |
| 17 | **news 资讯 tab 是否进小程序** | 进(需排查时政资质)/ 不进 | 首提审**弱化或暂不上**,规避新闻信息前置资质 |
| 18 | **第三方登录裁剪** | 保留全部 8 provider / 只留微信+手机 | **只留微信 + 手机号**(OAuth 重定向在小程序不可用) |

---

### 关键前置阻塞项(必须带外确认,非代码可解决)
1. **生产 TLS**:compose 只暴露明文 `5411`,443 由外部边缘承担 —— 上线前确认 `www/api.scholay.com` 已挂有效证书 + `X-Forwarded-Proto=https` 透传到 backend。
2. **unionid 打通前提**:网页开放平台应用与新小程序必须挂在**同一微信开放平台账号**下并完成绑定,否则 unionid 缺失、归一失效,只能按 openid 各自建号。**代码无法保证,是运营/资质前提。**
3. **商户号绑定**:小程序 appid 需与微信支付商户号 mchid 在支付后台完成绑定,JSAPI 才能下单。
