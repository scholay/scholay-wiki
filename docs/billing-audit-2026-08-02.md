# 收费系统全面审计 —— 2026-08-02

范围：会员体系（vip）· 经费充值与钱包 · 7 天窗口额度与重置 · 按量付费 · agent/非 agent 用量采集与统计 · 支付回调与订单 · 计价目录 · 相关迁移（0064–0102）。

方法：12 路并行深读取证 → 3 路补跑 → 18 组对抗性复核（复核员被要求**默认判假、先找反证**）。
81 条初判发现中：20 CONFIRMED / 23 PARTIALLY_CONFIRMED（多数下调 severity）/ 1 REFUTED；补跑另出 27 条。

**方法边界（必须先读）**
- 纯静态代码审计，**没有**接线上数据库、没有跑压测、没有观测线上日志。凡结论依赖运行时状态的，文中都显式标注。
- 支付网关侧行为（例如「订单在我们库里置 expired 后，支付宝是否仍收这笔钱」）在仓库之外，无法自证；文中相关条目已注明。
- 本文只覆盖**经济属性**问题（钱算错 / 漏记 / 并发不一致 / 可白嫖 / 被多扣），不含风格与一般安全面。

---

## 修复状态（2026-08-02 当天，未提交未部署）

| 条目 | 状态 | 落点 |
|---|---|---|
| P0-1 Redis 异常 = 全站免费 | ✅ 已修 | `vip/quota.go` loadWindow 三分支 + `degraded` 位；`.env` / `.env.prod` / 两份 compose 启用 `REDIS_PERSIST_HOST` + `depends_on` |
| P0-2 升级单复活买整年 | ✅ 已修 | `vip/order.go` 定价基准失效硬闸 + `voidPendingUpgradeOrders` 挂在三条延期路径上 |
| P0-3 `round_cap` 免单可诱导 | ✅ 已修 | `agentbridge/ws.go` 计费白名单 + 测试改判 |
| P0-4 未计价模型免费 | ✅ 已修 | `modelcatalog/service.go` 保存期准入 + `ValidateUserModel` 运行时兜底 |
| P0-5 丢终帧永久漏记 | ✅ 已修 | agent `sessions.ts` cumUsage 落盘（jail 外）+ 淘汰后水化 |
| P0-6 OpenAI 格式漏记 | ✅ 已修 | `openai/adapter.ts` 补 `message_start`/`message_delta` + 不吐 usage 回落估算 |
| P0-7 server-side 失败轮多扣 | ✅ 已修 | `ws_serverside.go` 解析 error `code` + 归责分叉 |
| P0-8 到期日写路径缺行锁 | ✅ 已修 | `vip/service.go` `grantMembershipInTx` 唯一串行化落点，兑换码/admin 直授共用 |
| P1-2 到期/撤销不换锚 | ✅ 已修 | `vip/quota.go` `RealignExpiredMembershipWindows` + cleanup 5min 任务 + `RevokeUser` |
| P1-3 审稿烧钱上界与额度解耦 | ✅ 已修 | 新增 `vip.RemainingWindowMicro`（不套地板）+ `peerreview.ensureReviewBudget` 起跑闸（Submit / Retry 共用） |
| P1-4 下单金额客户端自报 | ✅ 已修 | 微信删掉 `Amount` 入参、支付宝改覆盖为 `FinalAmount`；元→分统一 `math.Round`；履约复核换整数分（只堵少付，多付放行） |
| P1-5 账本可丢而扣费不可丢 | ✅ 已修 | `safego.Pool.SubmitWait`（有界等待 2s）+ 丢行改 **Error** 留痕，便于人工追补 |
| P1-6 0095 迁移哨兵可被 admin 复现 | ✅ 已修 | 补 `_schema_migration_marks` 一次性门控，余额与配置两条 UPDATE 都挂 `@first_run` |
| P1-7 兑换码白送整窗满血 | ✅ 已修 | 满血需同时满足「档位真抬升」+「授予天数 ≥ 一个计费周期」 |
| P1-8 审稿三条起跑口 check-then-act | ✅ 已修 | `repo.ClaimStatus` / `ClaimComputeState` 条件更新 + 失败回滚；cache 命中分支归还计算权 |
| P1-9 公众号成本帽只数次数 | ✅ 已修 | 入参 2000 字截断 + 签名 5min 时效 + 同签名一次性（Redis SETNX） |
| P1-10 升级补差 31 天倒挂 | ✅ 已修 | 年价基准加「满月价差」地板；新增 1..400 天全量单调性回归测试 |
| P1-11 邀请奖励日上限并发超发 | ✅ 已修 | `MarkRewardedWithinDailyCap`：邀请人 users 行锁内「查数 + 抢标记」一个事务；删掉锁外的 `CountRewardedToday` |
| P1-13 重启重复计费 | ✅ 已修 | 水位落库加 per-session 序号「最新者胜」+ `FlushAllTokenWatermarks` 接进 SIGTERM 序列 |
| P1-14 维护模式 503 支付回调 | ✅ 已修 | 白名单加 `/api/v1/payment/`、公众号 webhook、`/api/v1/webhook/` |
| P1-15 统计三套并行口径 | ✅ 已修 | 抽 `utils.WindowCutoff(days)` 唯一实现，改掉仪表盘 KPI、`ParseDateWindow`、usage 折线补点、邀请 7 日 |
| P1-1 单轮硬顶零执行点 | 🟡 仅纠偏 | 服务端硬闸**未实现**（轮内没有成本数据源，要先扩帧协议）。已把 `quota.go` 那段描述未实现设计的注释改成实况，并写明真要做需要付什么成本 |
| P1-12 并发轮无额度预留 | 🟡 仅纠偏 | 未加 per-user 在途轮计数（当前上界由 agent 容器 `MAX_CONCURRENT_TURNS=2` 兜着）。已纠正「欠出 ≈ 一轮成本」这条不成立的注释，并写明调大该常量前必须先补预留 |

验证：`go build ./...` + `go vet ./...` + `go test ./...` 全绿；agent `tsc --noEmit` + `bun test`（267 pass / 0 fail）全绿；
`docker compose build backend agent` 两个镜像均构建成功；两份 compose `config -q` 通过。

🔴 **部署前必读**：启用 `REDIS_PERSIST_HOST` 是一次**存储切换**，新实例从零开始，一次性副作用 ——
① 所有在飞的周期额度窗口消失，活跃用户各白得一个新窗口；② JWT 吊销标记清空，已登出但未过期的 token 会复活到自然过期；
③ SEO 主动推送队列清空（只影响推送时机）。**选低峰窗口部署。**

---

## 〇、一句话结论

内核（窗口换锚、越线分段扣费、订单履约幂等、经费扣减行锁、金额取整）**做得相当扎实，多处有精确的单测钉住**。
真正的风险不在这些被反复打磨过的地方，而在三类接缝：

1. **失败与降级路径的口径**——Redis 一异常、模型没配价、失败轮归责、终帧丢失，这四条都通向「静默免费」；
2. **订单冻结值 vs 履约时重算**——升级单把「买到的东西」交给支付时刻重算，但没有回头校验它还值不值这个价；
3. **同步扣钱 / 异步记账的分叉**——钱是同步扣的，账本是可丢的，两者之间没有对账闭环。

---

## 一、P0 —— 现网可触发、直接资损

### P0-1 Redis 一异常 = 全站 AI 免费无限（CONFIRMED · critical）

`backend/internal/vip/quota.go:245-262`

```go
a, err := rdb.Get(ctx, anchorKey(userID)).Int64()
if err != nil || a <= 0 || time.Now().Unix() >= a+windowSec {
    return quotaWindow{} // 从未用 / 已到期 → 满血(读路径不写 anchor)
}
```

**连接错误 / 超时 / OOM / LRU 逐出，全部与「key 不存在」合并成同一分支**，返回空窗口 → `windowUsed()==0` → `CheckDailyQuota`（:296）`w.windowUsed() < ceiling` 恒真 → 12 个执法点全部放行，所有档位所有用户。

三点让它比看上去更严重：

- **号称的「有界 fail-open」是死代码。** `quotaFallback`（:189）只在 `rdb == nil` 时被读（:250），而 `GetRedisPersist()`（`cache/redis.go:89-94`）运行期不可能返回 nil —— `rdb` 在 `InitRedis` 里 Ping 之前就已赋值，Ping 失败时 `main.go:49` 直接 `log.Fatalf` 终止进程。**进程只要活着，`rdb` 必非 nil**。写路径（:498/505/517）往兜底计数器里加的数，读路径永远读不到。这套兜底从未生效过一次。
- **不需要故障也会中招。** `.env` / `.env.prod` 里 `REDIS_PERSIST_HOST` 是注释掉的 → correctness 键回落主 Redis（`docker-compose.prod.yml:120-121`：`maxmemory 512mb` + `allkeys-lru`）。内存压力下逐出 `quota:anchor:<uid>` 就等于给该用户白送一个整窗。`StartEvictionMonitoring` 只打一条 Warn，**没有任何阻断**。
- **读路径完全静默**，一条日志都不打；写路径的 `warnQuotaDegraded` 是全局（非 per-user）每分钟一条限流。故障 30 分钟总共 30 条 Warn，且没有告警通道消费 docker logs。

同一根因还让**按量付费停扣**：`addUsage` 在 `rdb == nil`（:496）或 Eval 失败（:502）时直接 return，`chargePayAsYouGo` 根本不执行 —— 开了 autopay 的用户在故障期一分钱不扣。

上游也拦不住：JWT 吊销校验对 Redis 故障是 fail-open（`utils/jwt_revoke.go:18`），请求照样打到闸门；MySQL 侧没有任何备用额度闸。

**修**
1. `loadWindow` 把 `err != nil` 与「key 缺失」拆开：读失败必须**明确降级到兜底计数器**（真正接上 `quotaFallback`），而不是判满血。
2. 把 `rdb == nil` 这个不可达条件换成「命令失败」判定，让兜底真的有读侧。
3. 生产启用 `REDIS_PERSIST_HOST`（noeviction 池已在 compose 里定义好，只差 `.env` 一行）。
4. 逐出/降级要有真告警，不只是 Warn。

---

### P0-2 过期升级单复活 → ¥597 拿到牌价 ¥2690 的 Max 年费（CONFIRMED · critical）

`backend/internal/vip/order.go:357-364` + `:436-463`

```go
if ord.Status != "pending" && ord.Status != "expired" {   // expired 也可履约
    return fmt.Errorf("order status not payable: %s", ord.Status)
}
if math.Abs(amount-ord.FinalAmount) > 0.01 { ... }        // 唯一的校验:只比金额
...
base := now
if uv.VIPExpiresAt != nil && uv.VIPExpiresAt.After(base) { base = *uv.VIPExpiresAt }
if ord.SubAction == "upgrade" {
    newExp = base                                          // ← 根因在这一行
```

升级单的价格在**下单时**按「当时的剩余天数」算定并冻结，但到期日在**支付时**按「当时的会员状态」重算，且 447-463 那两个 case 只覆盖「到期日变小 / 会员已过期」，**对「到期日被合法续期变大」零覆盖**。

利用（全部是正常业务接口，可操作窗口约 2 小时，无需竞态）：

| 时刻 | 动作 | 结果 |
|---|---|---|
| t=0 | Pro 月付、余期 1 天时建升级单 U | `remainingDays=1` → `basisCycle=monthly` → `round((26900-5900)×1/30)` = **¥7.00**，`NewExpiresAt` 冻结为 +1d |
| t≈1h59m | U 仍 pending 时调 `/payment/alipay/create` 拿住收银台 | `alipay_handler.go:83` 的 `Status != "pending"` 只在**建收银台**时校验 |
| t=2h01m | 调 `/billing/subscribe` 建 Pro 年付续期单 R | `order.go:111-116` 的 stale 清理把 U 打成 expired，`pendingSubs` 随即为 0 —— **单活跃订阅单护栏被它自己上面那段清理拆掉** |
| — | 付 R（¥590） | 会员 = Pro，到期 +1 年 |
| — | 在网关 120m 窗口内付掉 U（¥7） | 回调链 `processSuccessfulPayment`（`alipay_handler.go:174-195`）**只判 paid 幂等短路，不判 expired** → 透到 `fulfill` → `base` = +1 年 → `newExp = base`，`newTier = max` |

实付 ¥597 → **Max 整年**。单次净损失 ≈ ¥2093。

复核时逐个排除了五处可能的反证（收银台状态闸在错误的一端 / `fulfill` 无档位与余期重校验 / 单活跃单护栏被自己拆掉 / 447-463 两个 case 都不覆盖这一侧 / 469-472 的防回退只会把 `newExp` 往上抬），全部不成立。

**免等待变体**：`applyMembershipGrant`（`service.go:141-152`）被兑换码 `Redeem`（`repository.go:374`）与 admin 直授（`service.go:343`）复用，同样把 `vip_expires_at` 往后推，且**都不受单活跃订阅单护栏约束**。即「挂一张 ¥7 升级单 pending → 兑换/被授一张长期会员 → 120m 内付掉那 ¥7」是同一个洞的即时版本。**复活只是最容易自助触发的那把钥匙，根因是 449 行。**

> 仓库外的一环：expired 之后支付宝是否还收这笔钱，在网关侧无法自证。但 `order.go:353-356` 的注释本身就是为「用户在网关侧仍可支付、钱确实扣了」而写的 —— 设计者认为这条路径存在。

**修**：升级履约时用**下单时冻结的口径**兜住 —— `newExp = min(base, ord.NewExpiresAt)`（或按 `ord.NewExpiresAt - ord.CreatedAt` 的时长从 `base` 起算，与 455-462 那个 case 同源）。更彻底的做法是履约时重跑一次 `computeSubscription`，若当前应付价 > 订单冻结价则拒单要求重新下单。

---

### P0-3 `round_cap` / `step_incomplete` 免单 = 用户可诱导的无限免费通道（critical）

`backend/internal/agentbridge/ws.go:779-789`

```go
var turnFailureChargedByUserTask = map[string]bool{
    "budget": true, "content_blocked": true, "quota_exceeded": true,
}
```

这是一张**计费白名单**：只有这三个 code 计入用户额度，其余一律走 `recordAgentTokensPlatformFault`（`hooks.go:109-111`）置 `SkipQuota=true` → 被 `llmusage/service.go:117` 的 `&& !u.SkipQuota` 拦下 → `vip.AddUsage` 一次都不调用。

问题在于名单里漏掉了两个**由用户任务内容决定、可确定性诱导**的 code：

- `round_cap` —— 轮内工具步数撞 `MAX_TOOL_ROUNDS=24`（`agent/src/turn/turnLoop.ts:36`、`:430-444`）
- `step_incomplete` —— Run 分页（`turnLoop.ts:434`）

发一条「把这 30 篇文献逐篇检索并逐篇总结，每次只查一篇」这类必然打满 24 轮的任务，该轮 24 次 LLM call（每次 prompt 都带全量历史）的全部消耗**一分不扣**，水位仍照常前推（下一轮不会补扣）。复制粘贴无限重发即可。

`ws.go:777` 的注释说明「刻意用计费白名单而非免单白名单」是有意设计，但没有任何补偿控制：无频次上限、无「同一用户 N 次 round_cap 后转收费」。

**修**：把「平台责任」再切一刀 —— 传输/容量/配置类（upstream / busy / overloaded / config / internal / model_protocol_error）保持免单；**由用户任务驱动的自限类**（round_cap / step_incomplete）改为照常计费 —— 它们与已在白名单里的 `budget` 同源（都是"任务过大撞我们设的上限"），口径本就该一致。若产品上坚持免单，至少加 per-user 滑窗计数器。

---

### P0-4 未计价模型 = 完全免费且静默（CONFIRMED · high）

链路：`modelcatalog/service.go:413` 四类单价全 0 → `cost=0` → `llmusage/service.go:117` 的 `costMicro > 0` 不成立 → observer 不触发 → 窗口 used 不涨 → `CheckDailyQuota` 恒放行、`payAsYouGoOverflow` 恒为 0，经费一分不扣。

**这不是"admin 点错"，是"什么都不点"的默认路径**：

- `validateModel`（`service.go:538-540`）明确放行 0，注释自陈「0 = 免费/未计价」—— 一个值同时兼表两种语义，这是根因；
- `ValidateUserModel`（:442-451）只看 Enabled/UserSelectable/MinTier，**不看价格**；
- 前端 `ModelFormDialog.tsx` 的 `emptyForm`：四个 price 默认 0（:428-431）+ `user_selectable: true`（:445）+ `enabled: true`（:447）→ **新建即上线且免费**；
- `UpsertPlaceholderModel`（`repository.go:91-103`）不写任何 `price_*`、且 `DoNothing` 永不覆盖 —— 自动登记只让它在 admin 可见，**不改变 cost 恒 0**。

**这个坑本仓库真实发生过**：0063 迁移（:58-64）把 `agent_config` 四槽位 model 以 `enabled=1, user_selectable=1` 灌进目录、一个价格字段都不填；0083 的文件头自陈「此前从未配置，`price_*` 全为 0」。平台自己的主力模型曾长期处于「已启用 + 用户可选 + cost 恒 0」。

**同族变体（medium）**：executor 的带外调用（标题 / 记忆抽取 / 上下文压缩）用 `resolveTier("haiku")` 取槽位值，绑定缺失时退到 `terminalFallback = agent_config.main_model` —— 一个 admin 自由填写、**不要求存在于 modelcatalog** 的字符串。填成 `deepseek-v4-pro-0715` 而目录里是 `deepseek-v4-pro`，这批 token 就整类免费。若同一回退命中 `system.main`，**整个平台所有对话都免费**，只有一条每分钟限流的 WARN。

检测面比初判说的强（`TokenUsageStatsPage.tsx:122-137` 有琥珀告示条给出次数/占比/成因），但**只是事后看板**：没有告警、没有 `slog.Error`、更没有阻断 —— 钱已经花完、额度已经漏过了。

**修**：`enabled && user_selectable` 的模型必须四类单价至少一项 > 0，否则保存直接 400；把「0 = 免费」拆成显式的 `is_free` 布尔；`PriceUsage` 目录 miss 时打 `slog.Error` 并接告警；`terminalFallback` 的值必须在目录里存在，否则拒绝生效。

---

### P0-5 丢终帧 + executor 30 分钟内存淘汰 = 永久漏记（high）

终帧丢失（上游断连 / hub grace 到点 shutdown / backend 重启）时 backend **不入账**（`hub.go:1314-1320` 只 `endTurn` + 广播 `upstream_lost`）。唯一补救是「下一轮 session_total 差额补回」，但：

- 会话累计 `cumUsage` 只活在 executor 内存，`IDLE_TTL`（默认 30min）或 LRU 帽一到即被淘汰（`agent/src/server/sessions.ts:341-347`）；
- 淘汰后 `cumUsage` 从 0 重来 → backend 看到累计回退 → `bridge.go:247` 判定为「CLI 重启」把水位归零 → 那批已烧的 token **永远追不回**。

稳定复现：发一个跑 5 分钟的重任务 → 10 秒后关标签页 → 隔天回来继续。

**修**：终帧丢失时用 `upstream_lost` 前的最后一次已知 `session_total` 差额立即入账（而不是等下一轮）；水位回退判定加一条「回退幅度 > 阈值且距上次活动 > IDLE_TTL」的旁证，别把淘汰当重启。

---

### P0-6 OpenAI 格式 provider 的 usage 抢救是空操作 / 上游不吐 usage 整轮零计费（high ×2）

- `agent/src/openai/adapter.ts:367-412` 的流生成器**只 yield `content_block_*`，从不 yield `message_start` / `message_delta`** → `turnLoop` 的 `partialUsage` 恒为 null → `:605-612`（用户 stop）与 `:665-678`（瞬态重放）两处抢救全是 no-op。而 `:526-529` 的注释明说这条防线是为了防「大 prompt『发出即 stop』整轮 input 漏记（前置日额度闸只读不预扣，故可被反复利用绕过配额）」—— 对 openai 格式端点**该防线不存在**。
- `adapter.ts:429` 在上游未按 `stream_options.include_usage` 回传 usage 时，用 `normOAUsage(null)` 造四项全 0 继续往下走，**只 log.warn**。这份 0 穿过 `calls → sumUsage → session_total`，backend `bridge.go:251` delta≤0 直接 return、`llmusage/service.go:102` `TotalTokens==0` 也兜掉 → **整轮在账本上根本不存在**，事后无法对账追补。相当一部分国产中转不实现该参数，这不是边缘情况。

**修**：适配器内部维护 `partialUsage` 并在 `chunk.usage` 到达时 yield `message_delta`；上游不吐 usage 时不要造 0 —— 用 tokenizer 估算或直接把该轮标记为「计价失败」走告警，绝不能静默当 0。

---

### P0-7 server-side 路失败轮一律向用户扣额度（high · 方向相反的错）

`ws_serverside.go:313-317` 的 `recordTurn` 写死走 `recordAgentTokens`（必扣），**既不解析 error 帧的 code，也不走 hub 那套 `turnFailureChargedToUser` 归责**。

同一个 `code="upstream"`：在 claw 里平台自担一分不扣，在审稿里**全额扣用户**，而用户一份报告都没拿到（`markFailedAndLog` 把 submission 置 failed）。点重试还要再过一次 `CheckDailyQuota`，而额度已被这次失败吃掉。

> 附注：这正是 `vip.AddUsageCostOnly` 想解决的问题。该函数在生产代码里**零调用点**（全仓只有定义 + 一处集成测试），其上方声明的接线契约「`llmusage.Usage` 加 `NoQuota` 位 → Record 分流到本入口」在实现里根本不存在（`Usage` 只有 `SkipQuota`，没有 `NoQuota`）。交互路是靠 `SkipQuota` 另一套机制实现的；**server-side 路两套都没有**。

**修**：`ws_serverside.go` 复用 `turnFailureChargedToUser` 分叉；同时删掉 `AddUsageCostOnly` 与那段失效注释，或真把它接上（二选一，别让死代码继续冒充已修）。

---

### P0-8 会员到期日的三条写路径读-改-写不串行化（high）

只有订阅履约（`activateSubscriptionInTx`）对 users 行加了 `FOR UPDATE`。兑换码授予（`repository.go:370-382`）与 admin 直授（`service.go:336`，甚至不在事务里）都是「无锁读 uv → 内存算新到期 → 整值覆盖写」。

- **场景 A（用户侧）**：两张不同的 30 天会员码几乎同时提交。两个事务各锁**不同的 code 行**，对 users 行是非锁定快照读 → 都读到 `E` → 都写 `E+30d` → 用户少拿 30 天，而两条兑换流水都已落库、两张码 `used_count` 都 +1（不可回兑）。
- **场景 B（真金白银）**：Pro 月费回调正在 `fulfill`（持 users 行 FOR UPDATE 写 `E+1 月`），同一秒用户兑码。Redeem 的快照读拿到旧 `E`，UPDATE 排队后覆盖成 `E+30d` → **那笔 ¥59 的续费月份被吃掉：订单 paid、钱收了、权益没给。**
- **场景 C**：两个运营同时补天数，只生效一次。

**修**：把 users 行的 `FOR UPDATE` 提到 `applyMembershipGrant` 这一层，让三条授予路径共用同一把锁；到期日推进改成 SQL 侧表达式（`GREATEST(vip_expires_at, NOW()) + INTERVAL ...`）而非内存算完整值覆盖。

---

## 二、P1 —— 应尽快修，但不是自助可薅

| # | 问题 | 位置 | 要点 |
|---|---|---|---|
| P1-1 | **单轮成本硬顶零执行点** | `quota.go:338-371` | `TurnCostCap` 全仓**只有 `RemainingBudget` 一个调用者**；产物只经 `hub.go:694 → ws.go:1045 stampBudget` 盖进 user_message 帧，是**给模型看的建议值**。`quota.go:343` 注释里写的「hub 轮内实时累计成本，越过 cap 即发 stop_generation」在 agentbridge 里查无实现。默认部署下真正裸露的是 round-0 那一次调用（预算与 `MAX_TURN_TOKENS` 都是**轮间**判定）。真正的现值是**流程风险**：下一个照注释办事的人会发现轮内根本没有 usage 数据源，必须先扩帧协议 —— 注释把这个成本完全隐藏了。 |
| P1-2 | **到期/降级不换锚，窗口 used 跨档继承** | `quota.go:290-299`、`:528-539`、`service.go:355` | 全仓 `ResetBaselineOnUpgrade` 的 3 个调用点全是**升级方向**；cleanup 里**没有任何任务读 `vip_expires_at`**；`RevokeUser` 也不换锚。后果：Pro 期用掉 400 万微元的用户到期回落 free（ceiling 30 万）后，`prevWin >= ceiling` → `payAsYouGoOverflow` 返回**整笔** → 开了 autopay 的每次调用 100% 从经费实扣，而 `ConsumeForQuota` 无余额校验、**可扣成负**；没开的则被锁死到 anchor+7d。触发门槛极低：窗口内用超 ¥0.3 真实成本即可。 |
| P1-3 | **peerreview 单次提交烧钱上界与剩余额度解耦** | `peerreview/spec.go:48-56`、`service.go:1620-1626` | `CheckDailyQuota` 是纯布尔闸（剩 1 微元也放行）；`BudgetProvider = nil` → 不盖预算章、后端也无轮内硬停；唯一护栏 `PEERREVIEW_REVIEW_TOKEN_CAP`（30M raw token）**不含 chief、不含 meta/letter**。单场真实成本可达窗口上限的几十倍，没开 autopay 的用户平台全吃，痕迹只有一条 `slog.Warn`。 |
| P1-4 | **微信下单金额由客户端自报** | `wechat_pay_handler.go:124-165` | `req.Amount` 原样送进 `CreateNativeOrder`，`orderRecord.FinalAmount` 全程没读一次。获利方向被 `fulfill` 的金额复核堵死，**真实损害是资金完整性**：钱进商户号、订单永远 pending、系统内无退款链路、微信重推 24h 全失败。前提：admin 已配好并激活商户号（`wechat_pay_configs` 无种子数据），且该端点前端零调用（纯服务端可达面）。支付宝那道同类闸（`alipay_handler.go:88`）被 `IsRelease` 包着，且比对 `Amount` 而非履约侧真正校验的 `FinalAmount`（今天两者恒等所以未暴雷）。 |
| P1-5 | **账本可丢而扣费不可丢** | `llmusage/service.go:117-121`、`safego/record.go:54-59` | observer（扣额度 + 扣经费）是**同步直调**，账本 INSERT 投进 drop-on-full 的 `ledgerPool`（512 队列 / 2 worker），满即丢、只打一条 Warn，**全仓无人读 `rejected` 计数、无重试、无 spool**。更微妙的是失败模式相反：`ConsumeForQuota` 的事务**无 ctx deadline**（MySQL 卡顿时"慢但成"），`Submit` 是 `select/default`（"快且丢"）。丢的是 per-call 明细与 admin 成本看板/月度热力图；payg 的「钱的痕迹」有 `recordPaygDaily` 兜底（不经该池）。 |
| P1-6 | **0095 迁移用 admin 可改的配置值当哨兵** | `0095_credit_rate_rebase.sql:30-46` | 全仓只有 5 条迁移带 mark 门控，0095 不在其中，而它是**唯一一条 UPDATE `user_wallets` 的迁移**。admin 把 `recharge_rate=60` + `credit_to_points=5` 存回去（承重校验只比乘积 `60×5 = 100×3 = 300`，**必然放行**），下一次 `docker-compose restart` 重放即把全站 `perm_balance_micro` **×5/3 并把配置改回 100/3** —— 一个可撤销的配置误操作变成**不可撤销、无流水、不可对账、可重复叠加**的全站余额变更。文件头注释自己承认了这个风险并声明接受，但那段权衡没把「无流水 + 护栏只校验乘积因而天生失明」算进去。 |
| P1-7 | **兑换码白送整窗满血** | `service.go:175-178` → `quota.go:741-783` | 只判「是不是 tier 码」就无条件 `ResetBaselineOnUpgrade`（= `DEL anchorKey`）。三道本该有的判定一道都没有：不判等级是否真的抬升（Max 用户兑一张最便宜的 Pro 码也能触发按 max 档算的满血）、不判窗口是否真的耗尽（用了 1% 也照删）、不消耗任何稀缺资源。对照同文件的正规 `resetInternal`：先判「有没有必要」再必须扣 1 次不可再生的 `CreditResetPass`。超发倍数 ≈ `WindowDays / grant_days` —— 一张「Pro 1 天」码的成本不是 ¥0.86 而是一整个 ¥6 窗口。 |
| P1-8 | **peerreview 三条起跑口 check-then-act** | `service.go:1603 / 1094 / 1652` | `Submit` / `AdvanceStep` / `RetryReview` 全是「读状态 → 内存判定 → 无条件 UPDATE → 起 goroutine」，底层 `PatchSubmission` 不带状态条件也拿不到 `RowsAffected`。并发两个请求会在**同一条 agent session** 上并行跑两整场审稿，互相丢消息污染上下文，`UpsertReport` 的 `OnConflict UpdateAll` 又让同一 `(submission_id, role)` 静默互相覆盖。放大有上界（agent 进程 `MAX_CONCURRENT_TURNS=2`）。同文件 `CreateDraft`（:44-61）与 `DeleteManuscriptIfMatch`（:259-263）已有现成的条件更新样板。 |
| P1-9 | **公众号回复的成本帽只数次数不看 token** | `wechatofficial/handler.go:55-95` | 全站唯一 `user_id=NULL` 的付费 LLM 入口，平台全额承担。两道帽都是「调用次数」维度（单粉丝 30/日、全局 8000/日），对单条消息 token 量零约束；`VerifySignature` 只算 `token+timestamp+nonce` 的 sha1、**不覆盖 body、不校验 timestamp 时效**，OpenID 又直接取自请求体 → 一组泄露的三元组（会原样出现在 nginx access log 的 query string 里）能让单粉丝帽形同虚设。一天 8000 次 × 每次 ~20 万字 ≈ 8 亿 input token，全部落成 `user_id=NULL` 的账本行，不触发任何配额告警。 |
| P1-10 | **升级补差在余期 31 天处非单调跳变** | `order.go:196-205` | `remainingDays > 30` 是硬阈值，跨过这一天日率从月价 700 分/天直接掉到年价 575 分/天。剩 30 天补 ¥210.00，剩 31 天补 **¥178.36** —— 多一天 Max 反而少付 ¥31.64。约 7/12 的月份落在便宜档，且「先花 ¥59 续一个月再升级」能把日率整体拉低。现有测试覆盖 20 天与 100/393 天，**31 天这个断点没有任何用例**。 |
| P1-11 | **邀请奖励日上限 check-then-act** | `invite/service.go:261-288` | 先查日累计再发放，无条件更新、无唯一键兜底，并发可超发。**今天默认不可触发**：`invite_reward_credits` 出厂 0，`service.go:248` 直接 return。开启活动后单 IP 单机脚本即可复现（authLimit burst=30 远高于所需并发）。另：奖励在注册瞬间发放，批量注册成本近零。 |
| P1-12 | **并发轮无额度预留** | `quota.go:282-300`、`:351-371` | 闸门与预算都是纯只读、无 hold；配额门在忙态门**之前**执行（`hub.go:1783` vs `:1849`），而忙态锁按 `(feature, sessionID)` 寻址、不是按 user → K 条不同 session 的并发帧各自独立过闸，每轮拿到的硬顶都是「窗口余量 + **整个**钱包容量」。实际放大被 agent 容器的进程级准入压到 ×2（`agent/src/server/admission.ts:13`，全容器所有租户共 2 槽），且 `MAX_TURN_TOKENS=5M` 封顶，故不是无界 —— 但「欠出上界 ≈ 一轮成本」这个写在注释里的不变量确实不成立。 |
| P1-13 | **进程退出不 flush 水位 → 重启后重复计费** | `bridge.go:198-217`、`:288-298` | `flushTokenWatermark` 只在 `hub.shutdown` 里调用，而 SIGTERM 路径从不遍历/关闭 hub（`http.Server.Shutdown` 不碰已 hijack 的 WS）。真正落库的只有异步 best-effort `SetUsageWatermark`，失败仅 `slog.Debug`，UPDATE 无单调守卫。发版时恰好在途的那一轮，重启后会被当成新增量**再记一遍**（落成一行 `(reconciled)`）→ 用户被重复扣额度。 |
| P1-14 | **维护模式把支付回调一起 503** | `routes.go:125-127`、`maintenance.go:110-116` | 两个支付回调、公众号 webhook、Minicod webhook 全在 `/api/v1` 组内，白名单只有 5 条且都不包含它们；回调不带 Bearer 拿不到 admin 豁免。**但严重性比初判低两档**：后台**根本没有维护模式开关**（四层 model/DTO/service/repo 均无 `maintenance_mode` 字段，`InvalidateMaintenanceCache` 零调用者），只能靠有 MySQL 权限的人手工改库；且网关重试窗口内 503 是正确行为，真正丢钱要维护持续 >24h。系统内确无补偿链路：`payment.Register` 全仓只出现在注释里，`QueryStatus` 零实现，无主动查单。 |
| P1-15 | **统计口径三套并行** | `dashboard_service.go:129-130`、`utils/datewindow.go:30`、`admin_orders.go:51/144` | 正确口径（零点对齐 + `-(days-1)`）已在 5 处落地并留了两条「别再踩」的注释，漏网两处各犯一条：① 仪表盘 KPI 用 `todayStart-30d` → 覆盖 31 个自然日，比**同一屏**的折线多整一天；② `ParseDateWindow` 既多一天又不对齐 → 最旧一根柱在当天内随刷新时间单调缩水。③ 订单页 KPI 按 `payment_time`、明细表按 `created_at`（后端注释里是有意设计，缺的是 UI 没告诉 admin）。**无资损，纯对账噪声**，但会让人对不上账后怀疑计费本身。 |

---

## 三、被证伪 / 大幅降级的（避免误导）

- **REFUTED** — 「catalog 缺失时把微元当 token 盖章，预算放大一个数量级」：`stampTurnBudget` 有 `resolveChatDefault()` 回落，且方向判断也不对。
- **驳回 high → low** — 「平台故障轮照样扣额度、还从经费实扣」：交互路（claw / smart_search / prism / boltslides / sci_draw）已由 `turnFailureChargedToUser` + `SkipQuota` 实现，**该资损链路今天不可能发生**。`AddUsageCostOnly` 确实是死代码，但唯一实际后果是平台自担轮的成本不进 `quota:day` → **admin 两个页面对同一用户同一天给出不同数字**（用户端全部经 `StripQuotaAmounts` 抹掉绝对值，看不到）。真正的问题在 server-side 路（见 P0-7）。
- **high → low** — 「`EffectiveTier` DB 读失败降级 free → 多扣经费」：同一次 DB 故障会同时掐死 `chargePayAsYouGo` 的**第一行** `Balance`（也是一次 MySQL 读）→ 一分钱不扣；且「连接池打满」在 Go `database/sql` 里是**阻塞等待不是报错**（`database.go:71-73` 无 per-query 超时）。缺陷形态（扣钱路径复用了一个 fail-open-to-cheapest-tier 的读）真实存在值得修，窗口比初判窄一个数量级。
- **量级更正** — 并发 payg 透支「净亏 ¥90」算不出来（admission 2 槽 + `MAX_TURN_TOKENS` 封顶）；0095 重放后购买力是 **5/3 ≈ 1.667 倍**不是 2.78 倍（初判漏了同一次重放里把 `credit_to_points` 改回 3 那一步）。
- **已过时的旧结论** — 「测试支付无硬闸」不再成立：`billing_handler.go:26-30` 在 `GIN_MODE=release` 下**无视** `PAYMENT_TEST_ENABLED`，`main.go:91-97` 启动时还会打一条可见的 Warn。

---

## 四、验证为正确的关键不变量（可信部分）

这些是复核后确认扎实的地方，改动时别破坏：

**并发与原子性**
- `anchorRollLua`（`quota.go:76-84`）是真正的原子换锚：GET + 条件 SET 在同一 Lua 里，Redis 单线程串行 → 两个并发消耗同时发现过期不会双开窗。
- used key 名里含 anchor（`quota:tokens:<uid>:<anchor>`）→ **换锚 = 换 key = 天然归零**，不存在「先清零后推进、中间崩溃」的两步窗口。
- `payAsYouGoOverflow` 的 `prevWin`/`curWin` 直接由 `IncrBy` 的**原子返回值**推导 → 多个并发 `AddUsage` 得到互不重叠的 `[prev, cur)` 区间，既不重复收费也不漏收（`billing_test.go:665-691` 覆盖 6 个边界）。
- `ConsumeResetPass`：事务 + 双层 `FOR UPDATE`（钱包行 + 批次行）+ `WHERE count_remaining > 0` 条件更新 + `RowsAffected == 0` 判定 —— 扣不成负数、不会重扣已扣光的批次。
- `fulfill`：`FOR UPDATE` 锁单 → paid 幂等短路 → 金额校验 → `WHERE id=? AND status IN (...)` 条件更新 + 查 `RowsAffected` → 履约，**全在一个事务里**。
- `orders.order_no` 有 UNIQUE；`uk_credit_tx_daily(user_id, type, day_bucket)` 作为 payg 日聚合的幂等键，`day_bucket` 为 NULL 的历史行不受影响（MySQL 唯一索引视 NULL 互不相等）。

**金额与取整**
- `MicroCreditForCost` 整数**向上取整**（`(cost*1000 + p-1)/p`）—— 1 微元的调用也一定扣得到，无系统性少扣。
- `RechargeCreditsFor` 已改整数定点 round-half-up，消除了旧浮点截断「约 6.6% 的金额少到账 1 分经费」的问题。
- `AddPeriod` 用 carbon 的 `NoOverflow` 变体（1/31+1月 = 2/28、2028-02-29+1年 = 2029-02-28），`TestAddPeriodDiffersFromNaiveAddDate` 钉住不能退化回 stdlib `AddDate`。
- `prorationDays` 固定 30/365，与自然月长度解耦（否则同一笔升级的金额随月份跳变）。
- 时区口径全链一致：窗口判定 `time.Now().Unix()`、日统计 key `now.Format("20060102")`、`AddPeriod` 保持 `base.Location()`，无 UTC 转换 —— 符合仓库铁律。

**配置与迁移**
- 承重旋钮校验拦住「全档静默不限额」：`Enabled` 时 `FreeWindowTokens` / `WindowDays` / `CreditToPoints` 必须 > 0，且强制「按量付费单价严格贵于所有套餐档」。
- `run-migrations.sh` 每个文件一次 `mysql ... < file` → **单会话**，`SET @first_run := ROW_COUNT()` 这类会话变量语义成立（若改成逐语句执行会静默失效）。
- 0092 / 0093 / 0096 / 0097 的 mark 门控 + 指纹匹配正确，重放为 no-op。
- 用户端不下发额度绝对值这条不变量的两个出口都闭合（`Overview.StripQuotaAmounts` + `ResetResult.StripAmounts`），不限档统一保留 `ceiling=-1`。
- 充值单（`order_type=recharge`）**不触发** `ResetBaselineOnUpgrade` —— 堵住了「充 ¥10 换一个完整窗口」这类比套餐还便宜的路径。
- Redis 不可用时手动重置**直接拒绝且不扣次数**（`ErrQuotaServiceDown`），不会出现「扣了资源没满血」的循环扣费；失败序是安全序（先换锚成功才扣次数，最坏是白送一次并 `slog.Error` 留痕）。

---

## 五、建议的修复顺序

**第一批（一天内，止血）**
1. `.env` 启用 `REDIS_PERSIST_HOST`（compose 里 noeviction 池已就绪，只差一行）—— 单独这一行就把 P0-1 从「LRU 逐出即免费」收窄到「只有 Redis 真故障才免费」。
2. `loadWindow` 拆开 `err != nil` 与 key 缺失，真正接上兜底计数器（P0-1 本体）。
3. `order.go:449` 加 `min(base, ord.NewExpiresAt)` 兜底（P0-2）。
4. `turnFailureChargedByUserTask` 加入 `round_cap` / `step_incomplete`（P0-3）。
5. 模型目录：`enabled && user_selectable` 时四类单价不得全 0，保存即 400；`terminalFallback` 必须在目录内（P0-4）。

**第二批（一周内）**
6. `ws_serverside.go` 复用归责分叉（P0-7）；同时决定 `AddUsageCostOnly` 是接上还是删掉。
7. users 行锁提到 `applyMembershipGrant` 层，到期日改 SQL 侧表达式（P0-8）。
8. 终帧丢失即时入账 + 水位回退判定加旁证（P0-5）。
9. adapter.ts 补 `message_start` / `message_delta`；上游不吐 usage 不再造 0（P0-6）。
10. 到期/降级换锚（P1-2）—— 一个 cleanup 定时任务即可。

**第三批（有余力时）**
11. 微信下单删掉客户端 `Amount`，支付宝去掉 `IsRelease` 条件并改用 `FinalAmount`；金额换分统一 `int64(math.Round(x*100))`，`fulfill` 的浮点容差换成整数分相等（P1-4）。
12. 0095 补 mark 门控（P1-6）；把「用配置值当迁移哨兵」这个模式全仓清一遍（0064 / 0083 / 0085 同族）。
13. 抽一个全站唯一的 `utils.WindowCutoff(days)` 替换三套并行口径（P1-15）。
14. `TurnCostCap` 要么真接上服务端硬闸，要么把 `quota.go:302-345` 那段注释改成「建议值，执行在 agent 侧」—— **现在这样最危险，下一个人会照注释办事**（P1-1）。
15. 补对账闭环：`credit_transactions` 之和 + 订单之和 应能反推当前钱包余额。当前 `ConsumeForQuota` 有日聚合流水、0095 迁移无流水、重置次数刻意不入流水 —— 账在设计上就不闭合，这是所有「对不上账」类问题的公共上游。
