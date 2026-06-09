# 会员 / 收费体系重做 —— 完整设计方案(P1–P5)

> 设计稿:仓库根 `scholay-money.pen`(用 pencil MCP 读)。
> 状态:**方案待评审,未开工**。日期:2026-06-08。
> 配套记忆:`membership-billing-redesign`。

---

## 0. 背景与已锁定决策

需求:**订阅制 + 充值共存**,计费对象是 **AI token**。四个关键决策(已与用户确认):

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 额度计量 | **统一 token 池**:所有 AI 功能共用一条每日 token 预算。Free=Q,Pro=3Q,Max=5Q。 |
| 2 | 经费临时/永久 | **充值→永久;订阅赠送→临时;礼品码/任务→按发放方配置**。 |
| 3 | 订阅赠送节奏 | **每月一次性发、整月有效、到期清零**(失效日 = 会员到期日)。 |
| 4 | 重置规则 | **只看经费,不设次数**。"每月N次重置机会"营销话术作废。 |

次级默认(均为后台旋钮):
- 重置花费默认 **60 经费/次**;重置 = 把"今日已耗 token"清零、额度恢复满。
- 经费消耗顺序:**临时(最近到期优先)→ 永久**。
- 每日 **00:00 北京时间**重置(沿用现有 Redis 日 key,不做 UTC 转换)。
- token 预检 = "查当日已耗 < 上限才放行;跑完按真实 token 后置累加"(单次可能略超调,可接受)。
- ⚠️ **唯一缺的真实业务数**:Free 基准 `Q = 每天多少 token`。需用户给初值(后台可改)。

术语对照:**额度**=每日 token 预算(进度条);**经费**=二级货币(代码内用 `credit`);**临时经费**=带失效日;**永久经费**=不过期;**重置**=花经费把额度刷回 100%。

---

## 1. 现状基线(已逐一核过代码)

**LIVE**
- `internal/vip`:仅 `free`/`pro` 两档(**无 max**);额度是**每功能每日"次数"**(非 token),Redis `vip:quota:<feature>:<uid>:<YYYYMMDD>`,INCR-then-check,fail-open。5 功能:translate 10/200、smart_search 5/100、claw 10/200、peer_review 1/20、prism 10/300。
- `vip_redemption_codes`(迁移 0008):兑换码**只发 tier**;`users.vip_tier` / `users.vip_expires_at`;`EffectiveTier` 读时按 now 判定,单调不降级。
- **`llm_token_usage`**(迁移 0006/0007):逐 call 记 token(input/output/cache,7 功能 × project/agent)。**这是 token 计费的现成地基**。但无"按用户按天聚合"、无 token→成本、无钱包扣减。
- 支付:支付宝 + 微信 配置/下单/回调验签 LIVE,**但 `orderService = nil`(bootstrap_domains.go `initPaymentHandlers`)→ 回调验签后什么都不激活**;`AlipayHandler`/`WeChatPayHandler` 构造收 `OrderServiceInterface` 但传 nil。
- 前端:设置→我的会员(tier/到期/各功能今日剩余/兑换码)、admin VIP码、admin 支付配置;`PricingPage` 是"即将开放"占位;`http.ts` 有 `BizCode.AgentQuotaExceeded=6010`、`PaymentRequired=4020`,无升级 CTA。

**STRANDED(表在、零代码)**:`orders` / `payment_transactions`、`subscription_plans`(含 free/pro/max + features JSON)/ `user_subscriptions`、`coupon_*`、`user_invitations` / `invitation_relationships`、`usage_quotas`、`users.subscription_plan`(老死列)。

**完全没有**:钱包账本、临时/永久经费、重置机制、充值入账闭环、`max` 档、token 额度、任务中心/签到、礼品码→经费。

**关键集成点(实现时必须挂这里)**
- token 记账 3 咽喉(新额度计数从这里喂):`ai.Service.executeWithRetry → recordLLMUsage`;`agentbridge/ws.go pipe()` 的 `OnMessageComplete`;`agentbridge/ws_serverside.go recordServerSideUsage`。三者最终汇到 `llmusage.Service.Record`。
- 额度执法 5 点(把"按次"换成"token 闸门"):smart_search `spec.go` preUserMessageChain、claw `spec.go` preUserMessageChain、translate `ai/handler.go StreamTranslatePaper`、peer_review `peerreview/service.go Submit()`(校验后)、prism `spec.go`。
- 后台动态配置范式:`internal/agentconfig` 单行 typed 表(repository 显式 `Updates(map)` 防 gorm 跳零值 + 脱敏 sentinel + service 异步 push)。
- 下一个迁移号:**0015**。

---

## 2. 目标数据模型

> 命名沿用现网风格(snake_case、英文表名)。`credit` = 经费。迁移按 `_fields / _indexes / _defaults` 拆,全部幂等(`CREATE TABLE IF NOT EXISTS` / `add_column_if_not_exists` / `add_index_if_not_exists` / `INSERT IGNORE`)。**绝不 DROP**。

### 2.1 `billing_config`(单行配置表,仿 agent_config)
所有旋钮集中一行,admin 可改。

| 列 | 类型 | 默认 | 含义 |
|---|---|---|---|
| `id` | bigint PK | 1 | 单行 |
| `free_daily_tokens` | bigint | (待定 Q) | Free 每日 token 基准 |
| `pro_multiplier` | decimal(6,2) | 3.00 | Pro 倍率 |
| `max_multiplier` | decimal(6,2) | 5.00 | Max 倍率 |
| `pro_price_cents` | int | 5900 | Pro 月价(分) |
| `pro_original_cents` | int | 19900 | Pro 原价(划线) |
| `max_price_cents` | int | 26900 | Max 月价 |
| `max_original_cents` | int | 99900 | Max 原价 |
| `pro_grant_credits` | int | 600 | Pro 开通/续费一次性赠经费(临时,整月有效) |
| `max_grant_credits` | int | 3000 | Max 同上 |
| `recharge_rate` | decimal(10,4) | 1.0000 | 充值汇率:1 元 = N 经费 |
| `min_recharge_cents` | int | 1000 | 起充(分),¥10 |
| `reset_cost_credits` | int | 60 | 每次重置消耗经费 |
| `subscription_period_days` | int | 30 | 会员/赠送经费有效天数 |
| `enabled` | tinyint | 1 | 总开关 |
| `created_at`/`updated_at` | datetime | | |

> 倍率用 decimal 以便"无限/不限"也能表达(约定:`<=0` = 不限)。Free 价恒为 0,不入表。

### 2.2 `user_wallets`(每用户钱包,缓存余额 + 偏好)
| 列 | 类型 | 含义 |
|---|---|---|
| `user_id` | bigint PK | |
| `perm_balance` | int | 永久经费余额(充值来源;无失效) |
| `auto_reset_enabled` | tinyint | "自动消耗经费重置额度"开关,默认 0 |
| `created_at`/`updated_at` | datetime | |

> 永久经费无失效,单整数即可。**临时经费走批次表**(下),余额 = `SUM(未过期临时批次 amount_remaining) + perm_balance`,读时算或用 wallet 上的缓存列(P1 先算,量大再缓存)。

### 2.3 `credit_temp_lots`(临时经费批次,带失效)
| 列 | 类型 | 含义 |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | bigint | |
| `amount_initial` | int | 发放总额 |
| `amount_remaining` | int | 剩余 |
| `source` | varchar(20) | `subscription` / `gift` / `task` |
| `ref` | varchar(64) | 来源单据(订单号/兑换码/任务id) |
| `expires_at` | datetime | 失效时刻 |
| `created_at` | datetime | |

索引:`(user_id, expires_at)`、`(expires_at)`(过期清理用)。
消耗:`amount_remaining > 0 AND expires_at > now()`,按 `expires_at ASC` 逐批扣。

### 2.4 `credit_transactions`(经费流水账本,供"明细查看")
| 列 | 类型 | 含义 |
|---|---|---|
| `id` | bigint PK | |
| `user_id` | bigint | |
| `type` | varchar(24) | `grant_subscription` / `recharge` / `gift` / `task` / `reset_consume` / `expire` / `refund` / `admin_adjust` |
| `amount` | int | 带符号(+入账 / -消耗) |
| `temp_after` | int | 该笔后临时余额(快照) |
| `perm_after` | int | 该笔后永久余额 |
| `ref_type` | varchar(20) | `order` / `code` / `task` / `reset` / `admin` |
| `ref_id` | varchar(64) | |
| `note` | varchar(255) | |
| `created_at` | datetime | |

索引:`(user_id, created_at)`、`(type, created_at)`。

### 2.5 `orders`(复活现有 stranded 表,只用子集)
用现有列:`id, user_id, order_no, order_type('subscription'|'recharge'), plan_code, amount, final_amount, status('pending'|'paid'|'cancelled'|'refunded'), payment_method, payment_time, created_at`。新增(若缺):`credits_granted int`(充值到账经费 / 订阅赠送数,审计用)、`idempotency_key`(回调幂等)。

### 2.6 `vip_redemption_codes` 扩展(礼品码也能发经费)
`add_column`:`grant_kind varchar(12) default 'tier'`(`tier` / `credit`)、`grant_credits int default 0`、`credit_kind varchar(12) default 'temp'`(`temp` / `perm`)、`credit_validity_days int default 30`。原 tier 字段保留,`grant_kind='tier'` 时走老逻辑。

### 2.7 `users`
无需改表(`vip_tier` 是 varchar)。语义上 tier 取值扩为 `free` / `pro` / `max`。`EffectiveTier` 增加 max 分支。

### 2.8 额度计数(Redis,无表)
- key:`quota:tokens:<uid>:<YYYYMMDD>`,值 = 当日已消耗 token,TTL 25h。
- 上限:`free_daily_tokens × multiplier(tier)`(Free 倍率=1)。
- 重置:`DEL` 该 key → 当日重新满额。

---

## 3. 后端模块与服务

新增 `internal/billing`(或在 `internal/vip` 内扩展;建议**新模块 billing,vip 逐步并入**,保留 `vip` 包名兼容现有 import 一段时间)。Repository→Service→Handler。

```
internal/billing/
  config.go        # billing_config 读写 + 内存/Redis 缓存(高频读)
  wallet.go        # 钱包:Grant/Consume/Balance/Expire(事务 + FOR UPDATE)
  quota.go         # token 额度:Ceiling/Used/CheckAllowed/Reset/AddUsage
  order.go         # 订单 + 充值/订阅激活(P2/P3)
  giftcode.go      # 兑换码(tier|credit),并入现 vip 兑换
  model.go handler.go repository.go
  errors.go        # ErrQuotaExceeded / ErrInsufficientCredit / ...
```

### 3.1 ConfigService
- `Get()` 返回 `BillingConfig`(带缓存,写后失效)。
- admin `Update(partial)`:显式 `Updates(map)` 防跳零值;数值类配置无需脱敏(无 secret)。
- 提供派生:`DailyCeiling(tier) int64`、`Price(tier)`、`Grant(tier)`、`ResetCost()`、`RechargeRate()`。

### 3.2 WalletService(核心,强一致)
- `Balance(uid)` → `{temp, perm, total, lots[]}`(临时批次含失效日,供 UI"20 临时经费 6月6日失效")。
- `GrantTemp(uid, amount, source, ref, expiresAt)`:插 `credit_temp_lots` + 写流水。
- `GrantPerm(uid, amount, source, ref)`:`user_wallets.perm_balance += amount` + 流水。
- `Consume(uid, amount, refType, refId)`(**事务 + `SELECT ... FOR UPDATE`**):
  1. 锁 wallet 行;读未过期临时批次(`expires_at ASC`)。
  2. 余额(临时未过期 + 永久)< amount → 返回 `ErrInsufficientCredit`(不扣)。
  3. 先扣临时批次(逐批 `amount_remaining -=`),不足再扣 `perm_balance`。
  4. 写 `credit_transactions(type, -amount, 快照)`。
- `ExpireSweep()`:把 `expires_at <= now()` 且 `amount_remaining > 0` 的批次,逐条写 `expire` 流水并清零(后台 cleanup 周期跑;读余额时也按 now 过滤,**懒过期 + 周期清扫**双保险,参照 vip EffectiveTier 读时判定)。

### 3.3 QuotaService(token 额度)
- `Used(uid)` = Redis GET `quota:tokens:<uid>:<day>`。
- `Ceiling(uid)` = `config.DailyCeiling(EffectiveTier(uid))`。
- `CheckAllowed(uid)`(**预检,只读闸门,不扣**):`Used >= Ceiling` → `ErrQuotaExceeded`;否则放行。Redis 挂 → fail-open(放行)。
- `AddUsage(uid, tokens)`(**后置累加**):`INCRBY` 日 key + 设 TTL。挂在 token 记账咽喉(见 §4)。
- `Reset(uid)`(**花经费重置**,事务):
  1. `WalletService.Consume(uid, config.ResetCost(), 'reset', day)`;不足 → `ErrInsufficientCredit`。
  2. 成功后 `DEL quota:tokens:<uid>:<day>`(额度满血)。
  3. 流水里那条 `reset_consume` 即由 Consume 写入。
  4. 返回新余额 + 新额度。
- 自动重置:`CheckAllowed` 命中超限时,若 `wallet.auto_reset_enabled && 余额>=ResetCost`,内部直接 `Reset` 后放行;否则抛 `ErrQuotaExceeded`(带可重置/需充值/可升级标记)。

### 3.4 EffectiveTier(扩 max)
`vip_tier ∈ {pro,max}` 且(`vip_expires_at` 为空或 > now)→ 该档;否则 free。读时判定,无定时任务。

---

## 4. 额度引擎接线(P1 核心改造)

**(a) 预检闸门** —— 5 个执法点把 `vip.CheckAndConsume(feature)` 换成 `quota.CheckAllowed(uid)`:
- WS 类(smart_search / claw / prism):在 `preUserMessageChain` 调用;超限 → `agentbridge.NewQuotaError` → WS 帧 `code=quota_exceeded`(帧体带 `resettable / cost / balance / upgrade` 字段,前端弹"耗尽"弹窗)。
- HTTP 类(translate / peer_review):在 handler/service **校验通过后**调用(沿用"扣额度在校验之后"的教训,虽然现在预检不扣,但语义位置一致);超限 → `utils.Error(c, errcode.AgentQuotaExceeded=6010, friendly)` → HTTP 429。

**(b) 后置累加** —— 在 `llmusage.Service.Record`(三咽喉的汇合点)里,record 成功后对**登录用户**额外 `quota.AddUsage(uid, total_tokens)`。这样:
- 审计表 `llm_token_usage` 与 实时额度计数 **同源**,不会漂。
- project / agent / serverside 三路自动覆盖,无需各处改。
- 匿名(user_id=NULL,如 wechat_oa)不计额度。

**(c) 边界**
- 单次超调:预检放行后真实 token 可能让当日略超上限——可接受(同今日 INCR-then-check 风格,甚至更轻,因为不再预扣)。
- 跨天:TTL 25h + 日 key 自然滚动。
- 失败调用:不预扣,故无需 token 退款;真实失败按真实(0/部分)token 记。
- 重置后继续用:DEL 后重新累加,自然满血再扣。

**(d) 现有"按次"退场**:`vip/quota.go` 的 `dailyLimits` / `VIP_LIMIT_*` env / `vip:quota:*` key 全部废弃(代码删除或保留兜底一版);"我的会员"页的"各功能今日剩余"改为展示统一额度条。

---

## 5. 经费钱包细则(P1)

- 余额构成:**永久(perm_balance)+ 临时(未过期批次之和)**。UI 总览展示总额 + 临时部分的最近失效日(设计稿"80,其中 60 临时经费 6月6日失效")。
- 发放来源 → 类型:
  - 订阅开通/续费 → **临时**批次,`expires_at = 会员到期日`(整月有效到期清)。
  - 充值 → **永久**(perm_balance += )。
  - 礼品码 → 按码配置(temp/perm)。
  - 任务中心 → 临时(默认)。
- 消耗(只在重置时发生):临时(最近到期优先)→ 永久。
- 过期:懒过期(读时按 now 过滤) + `ExpireSweep` 周期清扫写 `expire` 流水。
- 并发:`Consume` 全程事务 + `FOR UPDATE` 锁 wallet 行,防双花/重置并发。

---

## 6. 充值闭环(P2)

把现在 `=nil` 的 orderService 接上:
1. **下单** `POST /user/billing/recharge`:入参金额(分,≥ `min_recharge_cents`)+ 支付方式 → 建 `orders(order_type='recharge', amount, credits_granted=amount/100*rate, status='pending')` → 复用现有支付宝/微信 create 拿支付参数/二维码。
2. **回调** `/payment/{alipay,wechat}/notify`:验签(现有)→ `orderService.ProcessRechargeCallback(orderNo, txnId, amount)`:
   - **幂等**:`orders.status` 已 paid 直接返回成功;用 `idempotency_key`/`transaction_no` 去重(补 `payment_transactions` 落库)。
   - 金额校验一致 → `status=paid, payment_time=now` → `WalletService.GrantPerm(uid, credits_granted, 'recharge', orderNo)` → 推站内信/toastr"经费购入成功"。
3. **前端**:账户资产→经费充值 tab(金额选择/自定义/支付方式/订单详情/协议),设计稿 `经费充值` 面板已画。

---

## 7. 订阅开通(P3)

- 套餐:Free/Pro/Max,价格/赠送来自 `billing_config`。下单 `POST /user/billing/subscribe`(plan_code, period)→ `orders(order_type='subscription', plan_code, amount)`。
- 回调成功 → `orderService.ProcessSubscriptionCallback`:
  - 设 tier + 到期:**单调不降级**(若当前是未过期更高/同档,从现到期日**顺延** period_days;否则从 now 起算)——复用现有 vip Redeem 的单调规则。
  - **赠临时经费**:`GrantTemp(uid, config.Grant(plan), 'subscription', orderNo, expiresAt=会员到期日)`。
  - max 档纳入 `EffectiveTier` / `DailyCeiling`。
- 到期:读时自动回 free(无定时任务);临时经费随到期日过期。
- 套餐页:`UUq6B` 设计稿三卡(Free/Pro/Max,"最受欢迎"标 Max 或 Pro)。**注意**:卡上"每月N次重置机会"文案按决策④作废,改为"经费可随时重置额度"。

---

## 8. 礼品码扩展(P4)

- admin 生成:`grant_kind=tier`(原逻辑)或 `grant_kind=credit`(发经费,选 temp/perm + 额度 + 有效天数)。
- 用户兑换 `POST /user/redeem-code`:tier 码走会员开通;credit 码 → `Wallet.GrantTemp/Perm` + 流水。
- 设计稿 `Lkzur`:兑换会员确认 / 兑换经费确认 / 失败(无效或已兑换)三态;`AndyM` 兑换码激活 tab 有"最近激活记录"。

---

## 9. 后台计费配置(P1)

- 单行 `billing_config`,admin 页一屏所有旋钮(基准Q、倍率、价格、赠送、汇率、起充、重置花费、有效期、总开关)。
- 范式抄 `agentconfig`:`GET/PUT /admin/billing/config`,repository 显式 `Updates(map)`。无 secret,免脱敏。
- 改价/改倍率即时生效(下次额度计算/下单读新值)。需审计可加 `billing_config_history`(仿 promptregistry,P5 可选)。
- admin 还需:钱包查询/手动调账(`admin_adjust` 流水)、订单列表、(扩展)礼品码发经费。

---

## 10. 前端(P2–P4,对齐设计稿)

| 页面 | 路由 | 设计稿 frame | 关键内容 |
|---|---|---|---|
| 套餐/订阅 | `/pricing`(替换占位) | `UUq6B` 学者订阅计划 | 三卡 Free/Pro/Max,立即订阅→下单→支付 |
| 账户资产 | `/settings/assets` | `AndyM`/`wT0fg`/`ZGt5S` | 5 tab:总览/经费充值/兑换码激活/明细查看/经费领取 |
| 总览 | (资产页 tab) | `ZGt5S` 长条 | 额度条(Free/Pro/MAX 行,未购显"升级解锁")+ 经费余额(临时失效提示)+ 近期流水 |
| 重置交互 | 全局弹窗/toastr | `P6ajQ` | 额度耗尽弹窗 / 二次确认 / 经费不足;自动重置开关;toastr 过半/将尽/已重置/充值成功 |
| 6010 拦截 | mutation/WS error | — | `quota_exceeded` → 弹"耗尽"弹窗(重置/升级/充值 CTA),替代裸 toast |

- 我的会员页(现有)并入资产页"总览",或保留并改为额度条口径。
- admin:计费配置页 + 礼品码页扩展(发经费)+ 订单/钱包查询。
- 交付前必过 `tsc -b` + `vite build`(docker 比本地严)。

---

## 11. API 清单(增量)

**User**
- `GET  /user/billing/overview` — tier/到期/额度(已耗/上限/百分比)/经费余额(临时+永久+最近失效)/自动重置开关
- `POST /user/billing/reset` — 花经费重置额度
- `PUT  /user/billing/auto-reset` — 开关
- `GET  /user/billing/transactions` — 经费流水(分页/筛选)
- `POST /user/billing/recharge` — 充值下单
- `POST /user/billing/subscribe` — 订阅下单
- `POST /user/redeem-code` — 兑换(tier|credit,扩展现有)

**Admin**
- `GET/PUT /admin/billing/config`
- `GET /admin/billing/orders`、`GET /admin/users/:id/wallet`、`POST /admin/users/:id/wallet/adjust`
- 现有 `/admin/vip-codes` 扩展 grant_kind=credit

**Payment(现有,接上 orderService)**
- `/payment/alipay/notify`、`/payment/wechat/notify` → ProcessRecharge/SubscriptionCallback

---

## 12. 迁移与上线

- 迁移 **0015**(按 `_fields/_indexes/_defaults` 拆):
  - `0015_billing_fields.sql`:`billing_config` / `user_wallets` / `credit_temp_lots` / `credit_transactions` 建表 + `vip_redemption_codes` 加列 + `orders` 补 `credits_granted`/`idempotency_key`(若缺)。
  - `0015_billing_indexes.sql`:各索引。
  - `0015_billing_defaults.sql`:`INSERT IGNORE billing_config(id=1, 默认值...)`。
- 存量数据:现有 `pro` 用户照常(EffectiveTier 兼容);老的"按次"Redis key 自然失效;`user_wallets` 懒创建(首次读 0/0)。
- stranded 表:`orders` 复活;`subscription_plans`/`user_subscriptions` **不复活**(继续用 `users.vip_tier` denormalized,延续 0008 决策);`coupon_*` 暂留 P5。
- 验证:后端 `docker compose build backend`(本机无 Go);前端 `tsc -b` + `vite build`;迁移 `docker-compose restart schema-sync backend` 看 `scholar_schema_sync` 日志。部署由用户操作。

---

## 13. 分期交付

| 期 | 范围 | 依赖 | 验收 |
|---|---|---|---|
| **P1** | billing_config + 钱包(lots/ledger)+ token 额度替换次数制 + 重置 + admin 配置页 + 资产页总览(只读额度/余额) | 迁移0015 | 额度按 token 计、超限拦截、花经费重置生效、后台可调旋钮 |
| **P2** | 充值闭环:接 orderService + 回调入账永久经费 + 幂等 + 充值前端 | P1 钱包 | 支付成功永久经费到账、流水可见、重复回调不重复入账 |
| **P3** | 订阅开通:支付开会员 + max 档 + 赠临时经费(整月到期清)+ 套餐页 | P1/P2 | 付费升档、到期回 free、赠送经费到期清零 |
| **P4** | 资产页 5 tab 全 + 重置弹窗/toastr/自动重置开关 + 礼品码发经费 + 6010 升级CTA | P1–P3 | 设计稿各状态可用 |
| **P5(后置)** | 任务中心/签到、优惠券、发票、配置审计史 | — | 按需 |

---

## 14. 风险 / 对抗点

- **钱包并发双花**:`Consume` 必须事务 + `FOR UPDATE`;重置与自动重置不可并发重复扣。
- **回调幂等**:支付回调会重试,必须用 order 状态 + transaction_no 去重(现状完全没有)。
- **扣经费在校验之后**:重置/兑换的扣减放在"确实要执行"之后(沿用 vip 教训)。
- **token 超调**:预检放行后单次可超上限一点点——明确接受,不做预扣(预扣需预估 token,不可行)。
- **fail-open**:Redis 挂 → 额度放行(可用性优先),与现状一致;钱包/订单是 DB 强一致,不 fail-open。
- **临时经费过期竞态**:懒过期(读时 now 过滤)+ 周期清扫;消耗时只认未过期批次。
- **时区**:一律 `time.Now()`、北京、不做 UTC 转换(日 key、到期日、失效日)。
- **友好文案**:6010/quota_exceeded/经费不足 走 friendly message(含升级/充值引导),不回显裸 err。
- **倍率"不限"语义**:约定 `multiplier<=0` = 不限额(给未来 Max 无限档留口)。
- **设计稿自相矛盾处**(已按决策定稿,实现以本文为准):重置花费 10 vs 60(取 60 旋钮)、赠送"每日过期"vs"整月"(取整月)、"N次重置"(作废)。

---

## 15. 待用户提供 / 确认
1. **Free 基准 Q**(每日 token 数)初值 —— 决定整套松紧。
2. 套餐"最受欢迎"标在 Pro 还是 Max(设计稿标在 ¥269 那张=Max)。
3. 是否要保留"我的会员"独立页,还是并入"账户资产·总览"。
4. P5(任务中心/签到、优惠券、发票)是否本轮完全不做。
