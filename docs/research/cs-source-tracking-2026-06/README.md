# 客服来源追踪调研(微信客服 / 企业微信 / 飞书)

> 调研日期:2026-06-14
> 范围:为「1 对 1 客服(非群)+ 要知道客户从哪个页面/渠道来」的诉求,评估三条客服承接渠道(微信客服 / 企业微信 / 飞书)各自能否原生回传「客户来源」,并给出本平台的落地建议。
> 方法:五路并行调研 + 对四条关键论断做对抗式核查(以证伪为目标逐条核对官方文档)。
> 可信度标注:本文每个机制都标了 **[高]/[中]/[低]** 可信度;未能从官方文档核实的,统一用 **[未核实]** 显式标出,不编造接口名或字段。

---

## 一句话结论

| 渠道 | 能否做到「来源追踪」 | 结论可信度 | 一句话 |
|---|---|---|---|
| **微信客服(WeCom kf)** | ✅ **能**(原生支持) | 高 | 为每个来源生成带 `scene` 的客服链接/二维码,用户进入会话时 `enter_session` 事件把 `scene`/`scene_param` 回传后端,即可识别来源。这是三家里唯一原生闭环的方案。 |
| **企业微信(渠道活码 / state)** | ⚠️ **有条件**(部分可靠) | 中 | `add_contact_way` 的 `state` 在「加好友」场景能回传,但**二维码弹窗等场景回传不保证可靠**;它是「加企业成员为外部联系人」的链路,不是 1 对 1 客服会话。要追踪须配本地对账。**注意:这与「微信客服」是两套不同能力,别混。** |
| **飞书(服务台 / 机器人)** | ❌ **不能**(对公网陌生访客) | 高 | 飞书服务台建会话强制要求已存在的飞书账户(`open_id`),机器人不能主动触达匿名网页访客,链接无 scene 原生透传。来源只能由后端在建单时自己写入 `customized_info`。**适合飞书生态内已有账户的用户,接公网访客必须另建桥接。** |

**对本平台的推荐**:
- **首选用微信客服(WeCom kf)做正式的「带来源的 1 对 1 客服」**,因为它是唯一能在「公网陌生访客 → 1 对 1 客服会话 → 后端识别来源」整条链路上原生闭环的方案。
- **过渡期/无资质期**:沿用现有静态二维码,但**先把「点击客服入口」这一步用现有 usagestat 采集体系记下来源**(零新增后端表,见 P0),解决「来源盲区」的一半问题(知道谁、从哪个页面点了客服,虽然无法和最终客服会话精确对账)。
- **飞书继续作为「内部通知 / 群机器人」**(现状已接,见 `internal/supportcenter/feishu.go`),**不要把它当公网客服承接渠道**。

---

## 背景与诉求

- **诉求**:做 **1 对 1 客服**(客户单独和客服聊,**不是拉群**),并且客服侧要**知道这个客户是从哪里来的**(哪个页面、哪个渠道、是不是某个营销活动)。
- **现状(来源盲区)**:本平台「联系我们」页(`frontend-user/src/features/help/pages/ContactPage.tsx`)展示的是后台配置的**静态二维码**(`wecom_qr` / `feishu_qr`,见 `backend/internal/supportcenter/model.go:23-24`)。这两张二维码:
  - 对**所有访客完全相同**——无论从首页、搜索页、付费页还是某条广告点进来,扫到的是同一张码;
  - 客服扫到一个新客户时,**无法区分来源**,这正是要解决的痛点。
- 因此核心问题是:**把「对所有人相同的静态码」换成「按来源参数化的入口」,并让来源信息能回传到客服侧**。这个换法在三家里能不能原生做到,就是本调研的全部。

---

## 微信客服(WeCom):scene 带参链接 → 回调回传来源 的完整机制

> 结论可信度:**高**(对抗式核查判定 `confirmed`,三个关键机制全部有官方原文支持)。
> 注意术语:这里说的「微信客服」指**企业微信的「微信客服」能力**(`cgi-bin/kf/*` 系列端点),不是「公众号客服」也不是企业微信的「外部联系人/渠道活码」(那是下一节)。

### 整体闭环

```
[每个来源一个 scene]
   add_contact_way(open_kfid, scene)  ──►  返回 https://work.weixin.qq.com/kf/kfXXX?enc_scene=ENCxxx
                                              (可再拼 &scene_param=<URL编码,原始≤128字节>)
   开发者把该链接生成二维码图片 / 直接做成可点链接
                         │
   用户首次经此链接进入客服会话
                         ▼
   后端收到回调:event_type = enter_session
   字段含:open_kfid, external_userid, scene, scene_param, welcome_code(条件)
                         │
   后端用 scene / scene_param 映射回「来源」(页面/渠道/活动)
   兜底:customer/batchget(need_enter_session_context=1)48h 内可查回 scene/scene_param
```

### 三个关键机制(均 [高])

| 机制 | 接口 / 事件 | 说明 | 限制 |
|---|---|---|---|
| **带 scene 的客服链接** | `POST /cgi-bin/kf/add_contact_way` | 必填 `open_kfid` + 可选 `scene`(自定义渠道标识);返回含 `enc_scene` 的链接。一个 `open_kfid` 可生成**多个**不同 scene 的链接,即「每来源一码」。 | `scene` ≤ **32 字节**,字符集仅 `[0-9a-zA-Z_-]`。 |
| **enter_session 回传来源** | 回调事件 `event_type=enter_session` | 用户**通过客服链接进入会话**时触发,字段含 `open_kfid`、`external_userid`、`scene`、`scene_param`、`welcome_code`(条件)。**这是直接回传来源标识的机制。** | 仅在「通过链接进入」时触发;从客服会话历史列表点击已有会话**不触发**。 |
| **兜底查来源** | `POST /cgi-bin/kf/customer/batchget`(`need_enter_session_context=1`) | 返回 `enter_session_context` 含 `scene`/`scene_param`,可在 **48 小时内**兜底查回最后一次进入会话的来源。 | 一次最多查 100 个 `external_userid`;需已有客户 ID。 |

### 「每来源一码 + 短码映射」的推荐做法

- **scene 与 scene_param 是两个不同字段,务必分开理解**(这是对抗式核查纠正的一个常见误解):
  - `scene`:**持久写进链接**、上限 **32 字节**、字符集受限。适合放**渠道/页面的固定短码**(如 `home`、`pay`、`ad_zhihu_0614`)。
  - `scene_param`:**拼在链接上**、原始(URL 编码前)长度上限 **128 字节**、可任意 URL 编码、`enter_session` 原样回传。适合放**动态的来源 payload**。
- **128 字节通常足以直接编码** userID(雪花/UUID 量级)+ 页面标识 + 渠道码,**并非「必须建短码映射表」**。短码映射是「payload 偏大、想缩短链接、或想后续改写映射」时的**推荐工程做法**,而非微信容量硬性强制的必需项。
- **推荐落地形态**:
  1. 为**有限的几类固定渠道**各 `add_contact_way` 一次,写死 `scene`(如 `home`/`search`/`pay`/`feedback`);
  2. 对**需要带 userID/活动 ID 的动态来源**,在展示二维码前由后端生成一个**短码 ID**、把完整来源上下文落库(可复用本平台已有的 usagestat `extra` JSON,见后文),再把短码塞进 `scene_param`;
  3. `enter_session` 回调到达后,用 `scene` + `scene_param` 反查来源,关联到 `external_userid`。

### 必须注意的坑(均 [高],来自官方文档/核查)

- **返回链接不可修改、不可把参数复制到别的链接用**——否则「进入会话事件」参数校验不通过,**导致无法回调**(官方明确警告)。
- **`enter_session` 只在「通过客服链接进入」时触发一次**:用户再次点同一链接、或从历史会话列表进入,**不会再次回传** scene。所以来源识别是「按进入事件」而非「每次互动都保证有」。
- **企业级 `contact_way` 上限 50 万**(「联系我」+「加入群聊」共用),需留意用量;临时会话模式另有每日 10 万限制且仅支持单人。

### 未核实子项(不影响核心论断)

- **[未核实]** JS-SDK 的「聊天工具栏接口」是否有唤起客服的方法、是否支持在参数里直接传 `scene`(官方文档未证实,目前只能确认靠**链接注入** scene 可行)。
- **[未核实]** 小程序 `navigateToKfChat` / `openCustomerServiceChat` 是否支持在函数参数里直接传 `scene`,还是必须拼到链接里传递。
- **[未核实]** `scene_param` 回传时是否自动 URL decode,还是需业务方手动 decode。
- **[未核实]** 临时会话模式(`is_temp=true`)是否支持 `scene`。

> 官方文档:
> - 获取客服账号链接 `add_contact_way` — https://developer.work.weixin.qq.com/document/path/94665(另见 path/94692)
> - 接收消息和事件(`enter_session` 定义)— https://developer.work.weixin.qq.com/document/path/94670
> - 获取客户基础信息 `customer/batchget` — https://developer.work.weixin.qq.com/document/path/96429(另见 path/95149 / path/95159)

---

## 企业微信(渠道活码 / state)对比与适用边界

> 结论可信度:**中**(对抗式核查整体判 `partial`;部分机制 high、关键的 state 可靠性 medium)。

**这是与上节「微信客服」不同的另一套能力**:走「外部联系人 / 客户联系」(`cgi-bin/externalcontact/*`),本质是**把客户加为某个企业成员的外部联系人**,而不是进入一个「微信客服会话」。两者经常被混为一谈,**选型时务必区分**。

| 机制 | 接口 / 事件 | 能力 | 限制 / 风险 |
|---|---|---|---|
| **渠道活码 + state** | `POST /cgi-bin/externalcontact/add_contact_way`;回调 `add_external_contact` 返回 `state` | 每个渠道一个 `state`,用户加好友后回调带回 `state` | **[中]** state 回传**不保证可靠**:「联系我」弹窗等场景**不返回 state**;某些添加场景无 state。**不能以 state 作为唯一追踪依据。** state 长度/格式限制 **[未核实]**。 |
| **add_way 字段** | `GET /cgi-bin/externalcontact/get` 返回 `add_way` | 表示「添加方式」(扫码/名片/群聊/内部分享…) | **[高]** 是**系统预定义枚举**,反映「加好友手段」,**不是自定义营销来源**。 |
| **会话存档** | `POST /cgi-bin/chatdata/sync_msg` 等 | 合规存储会话记录(支持 `service_customer` 场景) | **[高]** 仅近 **5 天**、每次 ≤1000 条、4000 次/分钟;**与来源追踪无直接关联**,纯存档用途。 |

**适用边界**:
- 企业微信「在线客服(service_customer)」更像「企业员工经客服工作台 1 对 1 接待」;「微信客服」是独立客服平台、支持多渠道接入;「客户群」是群聊。三者来源追踪机制不同,**[未核实]** 在线客服与微信客服在 API 层的精确差异。
- **结论**:若目标是「公网访客 → 1 对 1 客服会话 + 可靠回传来源」,**企业微信渠道活码不是首选**(state 不可靠 + 是加好友而非客服会话)。**优先用上节的「微信客服 + scene」**。渠道活码更适合「加企业成员微信、做私域沉淀」的场景,且必须配本地对账。

> 官方文档:开发者中心 https://developer.work.weixin.qq.com/ ;「联系我」管理 path/92228 / path/95724;客户回调 path/101456;会话存档 path/91774 / path/99670。社区关于 state 回传不可靠的讨论见 developers.weixin.qq.com 社区帖。

---

## 飞书:能做到什么、对公网陌生访客的边界、替代桥接方案

> 结论可信度:**高**(对抗式核查判 `confirmed`:对「公网陌生访客」飞书客服无法像微信客服那样原生承接 + 回传来源)。

### 硬边界(为什么对公网访客不行)

1. **服务台定位是「企业内部」**:飞书服务台(Help Desk)overview 明确面向**企业员工**,无面向公网匿名访客的入口。
2. **建会话强制要飞书账户**:核心 API `POST /helpdesk/v1/tickets/start_service` 把 `open_id`(**已存在的飞书用户**)列为必填,且用户须在 helpdesk 可见范围内(否则报错 154402)。**没有任何匿名/非飞书账户路径**——直接堵死「公网陌生访客直接承接」。
3. **机器人不能主动触达匿名访客**:即便走外部用户单聊,外部用户也必须是**已认证的飞书/Lark 外部联系人**,需企业/个人实名认证开启对外共享,且**机器人不能主动发起单聊**,必须由外部用户先主动建立会话。匿名网页访客无法被 bot 触达。
4. **无 scene 原生透传**:飞书 bot 链接/二维码中的 `?source=xxx` 等**不会被 Helpdesk API 接收**,需自建二级跳转。

### 飞书能做到的(有条件 [中/高])

- **`customized_info` 记来源**:`start_service` 提供 `customized_info`(≤ **1024 字符**,单个文本字段、非结构化)。但它是**后端(持 `helpdesk_token`)在建单时主动写入**,**不是从访客 URL 自动捕获**。要带来源,必须后端自己编码注入。**[高]**
- **替代桥接方案**(均 [高/中]):
  - **二级跳转**:bot 卡片/链接 → 回跳自建表单/widget,前端记录来源后再发后台(飞书静态 bot 卡片仅支持 URL 跳转,**不支持 postback 回调**)。
  - **Bitable 多维表格 + Webhook**:把客服记录表化,insert record 时注入 source/channel——但 Bitable 是数据库/表单工具,**不是专业客服系统**,无消息会话 UI。
  - **群机器人 webhook + 后端来源字段**:即本平台**现状已接**的能力(`internal/supportcenter/feishu.go` 的 `sendFeishuText`/`notifyFeishu`),在推送文本里带上 `[来源:首页推荐]`。这是「群收件 + 通知」,**不是 1 对 1 客服**。

### 未核实项

- **[未核实]** `customized_info` 的精确编码/转义规则,是否支持 JSON 还是仅纯文本。
- **[未核实]** 飞书是否有官方的「1 对 1 客服 + 来源追踪」面向 SaaS/公网场景的最佳实践文档。
- **[未核实]** 多个飞书 bot 之间能否用同一 external user 的 `open_id` 做跨 bot 用户关联。
- **[未核实]** Bitable Webhook automation 是否支持自定义 HTTP header/body 回报本平台后端。

> 官方文档:服务台 overview / 接入指南 / `start_service` / `update` — open.feishu.cn helpdesk-v1;机器人外部群/外部用户 — open.feishu.cn develop-robots;Bitable record 创建 — open.feishu.cn bitable-v1。

---

## 行业通用做法对比表

| 做法 | 怎么追踪来源 | 1 对 1 客服 | 公网陌生访客 | 资质/成本 | 与本平台契合度 |
|---|---|---|---|---|---|
| **微信客服 + scene/scene_param** | 原生:每来源一码 → `enter_session` 回传 | ✅ 是 | ✅ 微信内一键进会话 | 需企业微信主体 + 配置「微信客服」 | **高**(原生闭环,首选) |
| **企业微信渠道活码 + state** | 部分:state 回传不保证;add_way 仅枚举 | ⚠️ 加好友为主 | ⚠️ 加企业成员微信 | 需企业微信主体 | 中(私域沉淀场景) |
| **飞书服务台 + customized_info** | 后端建单时手写,无 URL 透传 | ✅(仅飞书账户) | ❌ 必须有飞书账户 | 需飞书企业认证 | 低(仅内部/生态内) |
| **飞书群机器人 webhook**(现状) | 后端在推送文本里带来源 | ❌ 群收件 | N/A(单向通知) | 极低(已接) | 中(通知用) |
| **网页内嵌在线客服 widget**(如自建/第三方 SaaS) | widget JS 直接读 URL/userID/UTM,随会话上报 | ✅ 是 | ✅ 无需任何账户 | 第三方按坐席收费 / 自建有成本 | 中(若不想绑微信生态) |
| **会话前置上下文(customized_info / 二维码编码 sessionId)** | 进会话前先落库来源,会话带 ID 反查 | 视承接渠道 | 视承接渠道 | 低(本平台已具备采集地基) | 高(可叠加在上面任一渠道) |

> 通用结论:**「会话前置上下文」是跨渠道通用的兜底套路**——无论最终用哪条承接渠道,都可以在「用户点击客服入口」的瞬间由前端采集来源、后端落库,生成一个会话标识塞进入口(scene_param / customized_info / 短码),会话到达后反查。本平台已有 usagestat 采集地基,这条路成本最低。

---

## 针对本平台的推荐落地方案(分阶段)

> 设计原则:**优先复用现有设施**(usagestat 采集体系 + supportcenter 配置),**不重复造轮子**,**资质就绪后再上微信客服正式闭环**。
> 现有客服入口相关代码(注入点):
> - 前端联系页:`frontend-user/src/features/help/pages/ContactPage.tsx:96-104`(`useSupportContact()` 取二维码并渲染)
> - 前端取数 hook:`frontend-user/src/features/help/api/contact.ts:15-21`(`GET /config/support-contact`)
> - 前端联系组件:`frontend-user/src/features/help/components/ContactChannels.tsx:16-22`
> - 后端公开端点:`backend/internal/supportcenter/handler.go:27`(`GetPublicContact`),路由注册 `backend/cmd/server/routes.go:119`
> - 后端配置模型:`backend/internal/supportcenter/model.go:23-24`(`WecomQR` / `FeishuQR`,均为 data URL)
> - 后端配置 CRUD:`backend/internal/supportcenter/handler.go:39-68`,admin 路由 `backend/cmd/server/routes_admin.go:89-90`
> - 现有飞书通知:`backend/internal/supportcenter/feishu.go:38-95`(`sendFeishuText` / `notifyFeishu`)
> - 可复用的来源采集端点:`backend/cmd/server/routes_scholar.go:102-106`(`POST /api/v1/public/usage-events/track`,`OptionalUserAuth`,带 `extra` JSON;白名单见 `usagestat.Handler.Track`)

### P0 —— 零后端新表,先消灭一半盲区(立即可做)

- **目标**:在不接任何新渠道、不申请新资质的前提下,先把「谁、从哪个页面、什么时候、什么设备点了客服入口」记下来。
- **做法**:
  1. 在 `ContactPage.tsx`(及 `ContactChannels.tsx`)的「客服入口卡片/扫码区」挂一次 `view_qr`、点击/展开时挂 `scan_qr` 上报,走现有 `POST /api/v1/public/usage-events/track`(`OptionalUserAuth` 自动带 userID;匿名走 anon_id)。
  2. payload 用现成 `extra` JSON 带:`{page, referrer, device, channel}`;`source` 字段填 `contact_center`。
  3. **后端需扩白名单**:`usagestat.Handler.Track` 当前仅放行 staging/favorite 两个动作(见研究记录),需新增 `contact_center` feature / `view_qr`+`scan_qr` 动作进白名单(`backend/internal/usagestat/handler.go` 一带)。
- **得到什么**:能在后台按时间/用户看到「客服入口的来源分布」。**局限**:仍无法和「最终客服会话」精确对账(因为静态码无法回传)——这一半要靠 P1。
- **可信度**:[高](本平台已有此采集体系与 `extra` 字段)。

### P1 —— 上微信客服(WeCom kf),拿到正式的「带来源 1 对 1 客服」闭环

- **前提**:具备企业微信主体并开通「微信客服」。
- **做法**:
  1. 后端新增「微信客服来源映射」能力:封装 `add_contact_way`(为固定渠道写死 `scene`;动态来源生成短码塞 `scene_param`),并接收 `enter_session` 回调把 `scene/scene_param ↔ external_userid ↔ 来源上下文` 落库。来源上下文可直接复用 P0 落库的 usagestat `extra`(用短码关联)。
  2. 把 `support_center_config` 的 `WecomQR` 从「静态 data URL」升级为「按来源**动态生成**的微信客服链接 → 前端按当前登录态/路由实时生成二维码」。
  3. 前端 `ContactPage` 在展示微信客服码前,先请求后端拿到带 `scene_param`(短码)的链接,再本地用二维码库渲染(本平台前端已用 `qrcode.react`,见 library-share 记录)。
- **得到什么**:客服在企业微信侧接到新客户时,后端能精确反查「这个 external_userid 是从哪个页面/活动/userID 来的」。**这是三家里唯一的原生闭环**。
- **可信度**:[高](机制经对抗式核查 confirmed;仅 JS-SDK/小程序直传 scene 子项 [未核实],不影响链接注入主路径)。

### P2 —— 增强与统一

- **统一来源面板**:把 P0 的入口采集 + P1 的 `enter_session` 来源,在 admin 后台合并成「客服来源」视图(可挂在现有 supportcenter admin 区,路由组 `backend/cmd/server/routes_admin.go:89-98`)。
- **飞书保持通知角色**:继续用 `notifyFeishu` 在群里推「新客服会话 + 来源」摘要(`feishu.go`),但**不把飞书当公网客服承接**。
- **可选 widget 兜底**:若未来要脱离微信生态服务海外/非微信用户,再评估「网页内嵌在线客服 widget」(widget JS 天然能读 URL/userID/UTM 随会话上报),作为微信客服之外的第二承接渠道。
- **可信度**:[中](P2 属规划,具体取决于 P1 上线后的数据与资质情况)。

---

## 风险与待定决策

| # | 项 | 说明 | 待定方 |
|---|---|---|---|
| 1 | **资质要求** | 微信客服需企业微信主体并开通「微信客服」;飞书外部用户共享需企业认证。本平台是否已有企业微信主体?**[未核实]** | 用户/运营 |
| 2 | **隐私合规** | userID/页面/referrer 进入第三方(微信/飞书)链路属个人信息传递,需在隐私政策声明;**userID 不应明文硬编进二维码**,应走短码 + 服务端反查。 | 用户/法务 |
| 3 | **scene 容量** | `scene` 仅 32 字节、`scene_param` 仅 128 字节;富来源信息超长时必须短码映射。固定渠道用 scene、动态来源用 scene_param + 短码是稳妥分工。 | 已明确 |
| 4 | **enter_session 触发条件** | 仅「通过链接首次进入」触发,历史会话点击不触发——来源识别按「进入事件」粒度,需接受这一粒度。 | 已明确 |
| 5 | **飞书可行性** | 对公网陌生访客飞书客服**不可行**(强制飞书账户);若坚持飞书,只能走「二级跳转 / Bitable / 群机器人通知」桥接,体验劣于微信客服。建议飞书只做内部通知。 | 用户 |
| 6 | **企业微信 vs 微信客服选型** | 两套不同能力:渠道活码(加好友、state 不可靠)vs 微信客服(进会话、scene 可靠)。**推荐微信客服**;若运营更看重「加客户微信做私域」,才考虑渠道活码 + 本地对账。 | 用户 |
| 7 | **usagestat 白名单扩展** | P0 需把 `contact_center` 动作加进 `usagestat.Handler.Track` 白名单,否则上报被拒。 | 实现时确认 |
| 8 | **静态码迁动态码的兼容** | `support_center_config.WecomQR` 现为 data URL,P1 改为动态生成会改变 admin 配置语义(从「上传图片」变「配置客服账号/scene 规则」),需同步改 admin 配置页。 | 实现时确认 |

---

## 信息可信度与未核实项汇总

### 高可信度(官方文档原文支持 + 对抗式核查 confirmed)
- 微信客服 `add_contact_way` 支持 `scene`(≤32B)/`scene_param`(≤128B),`enter_session` 事件回传 scene 用于识别来源,`customer/batchget` 48h 兜底查回。
- 微信客服返回链接不可修改/挪用、否则回调校验失败;`enter_session` 仅「经链接首次进入」触发。
- 飞书服务台 `start_service` 强制 `open_id`(已存在飞书账户),对公网陌生访客无法原生承接;`customized_info`(≤1024 字符)只能后端主动写入,无 URL scene 透传。
- 飞书机器人不能主动触达匿名访客,外部用户须已认证且主动发起。
- 企业微信 `add_way` 是固定枚举;会话存档仅近 5 天、与来源追踪无直接关联。
- 本平台现状:静态二维码对所有访客相同 = 来源盲区;已有 usagestat `extra` JSON 采集地基。

### 中可信度(机制方向成立但有不确定/不可靠成分)
- 企业微信渠道活码 `state` 回传——「加好友」场景可回传,但**二维码弹窗等场景不保证回传**;不能作唯一依据。
- 飞书「二级跳转 / Bitable / 群机器人」桥接方案可行,但工程复杂度/体验是劣化取舍。

### [未核实] 项(官方文档未能证实,**勿当确定**)
- 微信客服 JS-SDK 聊天工具栏是否有唤起客服方法、是否支持参数直传 `scene`。
- 微信客服小程序 `navigateToKfChat` / `openCustomerServiceChat` 是否支持参数直传 `scene`。
- `scene_param` 回传是否自动 URL decode。
- 临时会话模式(`is_temp=true`)是否支持 `scene`。
- 企业微信 `state` 的精确长度/字符集限制;在线客服(service_customer)与微信客服在 API 层的精确差异;会话存档是否含 state/add_way。
- 飞书 `customized_info` 精确编码/转义规则(JSON vs 纯文本);飞书 URL scheme query 参数是否能自动映射到 API;Bitable Webhook 是否支持自定义 HTTP header/body;多 bot 间 external user open_id 跨 bot 关联。
- 本平台是否已有企业微信主体 / 现有 `wecom_qr` 是手工图还是动态生成(从代码看是 admin 上传的 data URL,即**手工静态图**)。

---

*本文为调研汇总,不含代码改动。落地实现以 P0→P1→P2 分阶段推进,涉及的注入点已在「推荐落地方案」中标注 file:line。*
