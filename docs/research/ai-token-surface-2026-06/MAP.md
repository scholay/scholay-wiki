# AI / Token-Spending Surface Map(Scholar 计费权威参考)

> 生成于 2026-06-23,基于 7 路并行深读(后端 + agent 容器)+ 综合 + 完整性查漏 + 人工逐行复核。
> 目的:把后端 + agent 容器里**所有会烧 token / 触发 LLM 上游**的入口,梳理成单一权威清单,
> 回答「哪些花费进了账本(`llm_token_usage`)、哪些扣了每日额度(`vip.AddUsage`)、哪些是真·免费/盲区」。
> 所有断言带 `file:line` 出处。标注 ✅已复核 / ⚠️待核 的为本轮验证状态。

---

## 1. 总览:三条物理路径,一个账本 + 一个每日额度

```
                          ┌─────────────────────────────────────────────┐
                          │  llm_token_usage 账本 (internal/llmusage)     │
                          │  唯一写入点: Service.Record() service.go:65    │
                          └───────────────▲──────────────┬───────────────┘
                                          │ Record()      │ observer(uid,tokens) 同步先于 DB 写
                                          │               ▼
                                          │   ┌───────────────────────────────┐
                                          │   │ vip.AddUsage quota.go:134      │
                                          │   │ 唯一额度扣减点 Redis INCRBY     │
                                          │   │ quota:tokens:<uid>:<YYYYMMDD>  │
                                          │   └───────────────────────────────┘
 ┌────────────────────────┐               │            ▲ observer 仅 bootstrap.go:268 接线
 │ 路径A backend-direct    │               │            │ (UserID!=nil && total>0 才触发)
 │ internal/ai            │── recordLLMUsage service.go:262 ──┤
 │ executeWithRetry       │   source=project, AccountID 精确  │
 │ (matrix/translate/     │   thirdparty ai_model 账号池      │
 │  wechat_oa/prism自动名/ │                                  │
 │  usermemory抽取)        │                                  │
 └────────────────────────┘                                  │
 ┌────────────────────────┐                                  │
 │ 路径B agent-WS pipe     │── accrueTurnUsage ws.go:483 ──────┤
 │ smart_search/claw/prism │   recordAgentTokens, source=agent │
 │ message_complete 帧      │   按 session_total 水位算增量      │
 └────────────────────────┘                                  │
 ┌────────────────────────┐                                  │
 │ 路径C agent-serverside  │── accrueTurnUsage ws_serverside.go:236 ─┘
 │ peerreview             │   归属取 ctx (reviewCallCtxWith)
 └────────────────────────┘
                        │
                        ▼  上游 LLM 凭据有 **两套互不相关** 的存储:
      ┌───────────────────────────────┐   ┌───────────────────────────────┐
      │ third_party_accounts          │   │ agent_config (单行表)          │
      │   type='ai_model' 多行加权池   │   │ scholar_agent 容器自带 base_url │
      │   路径A 用                     │   │ +api_key+main/haiku/sonnet/opus │
      │                               │   │ 路径B/C 用 (容器直连上游,       │
      │                               │   │ 不经后端 egress 代理)           │
      └───────────────────────────────┘   └───────────────────────────────┘
   另有 stranded 死配置: latex_agent_config / latex_agent_models(无 live Go 代码)
```

**三句话:**
1. 账本只有一个写入函数 `llmusage.Service.Record()`,额度只有一个扣减函数 `vip.AddUsage()`,二者由 `bootstrap.go:268` observer 闭包硬连(每记一行同步喂一次 `AddUsage`)。✅已复核
2. 三条路径**对已登录用户**都进账本、都扣额度。agent WS 链路真正落库走 `accrueTurnUsage` 带内帧——**不是** `bootstrap.go:238-240` 注释暗示的「只 slog 不落库」(那处注释已漂移,见 R5)。✅已复核
3. 额度是「按 token、跨功能共享、每日」的单一预算(`quota:tokens:<uid>:<YYYYMMDD>`),不是按功能、不是按次数。等级越高每日上限越高。

---

## 2. 全量清单表

| 功能/入口 | 调用方式 | 模型档位 | 账号池 | 记账本 | 扣每日额度 | 入口配额闸 | 文件位置 |
|---|---|---|---|---|---|---|---|
| 矩阵分析 Matrix | backend-direct | low(硬编码) | thirdparty | ✅ | ✅ | ✅ 扇出前 | `ai/handler.go:88,129`→`service_analysis.go:145` |
| 论文翻译 SSE | backend-direct | low(硬编码) | thirdparty | ⚠️依赖 include_usage 尾块 | ✅ | ✅ | `ai/handler.go:489,533`→`service_translate.go:22` |
| **公众号自动回复** | backend-direct | config(low~high) | thirdparty | ✅(user_id=NULL) | ❌ **匿名不扣** | ❌ **无闸** | `wechatofficial/service.go:278` |
| Prism 自动命名 | backend-direct | low | thirdparty | ✅ | ✅ | ⚠️软闸(超额静默跳) | `prism/autoname.go:56` |
| **用户记忆抽取** usermemory | backend-direct | low | thirdparty | ⚠️记成 unknown,user_id=NULL | ❌ **不扣** | ❌(仅 90s 冷却) | `agentbridge/bridge.go:198`→`usermemory/service.go:115` |
| 智能搜索 smart_search | agent-ws | agent_config | agent_config | ✅ | ✅ | ✅ StandardHooks | `smartsearch/spec.go`→`ws.go:483` |
| 智能助手 claw(含 Bash) | agent-ws | agent_config | agent_config | ✅ | ✅ | ✅ StandardHooks | `claw/spec.go`→`ws.go:483` |
| 智能写作 prism(WS) | agent-ws | agent_config | agent_config | ✅ | ✅ | ✅ StandardHooks | `prism/spec.go`→`ws.go:483` |
| 智能审稿 peerreview 主审 | agent-serverside | agent_config(per-round) | agent_config | ✅ | ✅(1次/Submit) | ✅ Submit 内手放 | `peerreview/service.go:1204`→`ws_serverside.go:236` |
| 标题生成(交互 WS) | agent-ws 带外帧 | agent haiku | agent_config | ✅ 附加行(不进水位) | ❌(刻意不进水位) | ❌ | `ws.go:495` |
| **标题生成(peerreview)** | agent-serverside 带外帧 | agent haiku | agent_config | ❌ **丢帧** | ❌ | ❌ | `ws_serverside.go` 无 token_usage case |
| 子 agent / Task | agent-ws 内含 | sub-agent model | agent_config | ✅ 并入 session_total | ✅ | ✅(仅父 turn) | agent `claude.ts:2325` |
| 上下文压缩 / advisor | agent-ws 内含 | small-fast/haiku | agent_config | ✅ 并入 session_total | ✅ | ✅(仅父 turn) | agent `compact/*` |
| web_search / web_fetch / side_question / memdir_relevance / away_summary | agent-ws 内含 | 各自模型 | agent_config | ✅ 并入 session_total* | ✅* | ✅(仅父 turn) | agent `turnUsageCollector.ts` |
| **agent 定时任务 cron** | agent 容器内 | task 运行参数 | agent_config | ❌ **不记** | ❌ **不扣** | ❌ | agent `cronScheduler.ts:430,458` |
| Provider 连通性测试(admin) | agent-serverside | 被测模型 | 被测 provider | ❌(独立 fetch) | ❌ | ❌ | agent `providerService.ts:585` |
| Minicod 学术 MCP | agent-mcp | n/a(非 LLM) | Minicod key 池 | ❌(无 LLM token,正确) | ❌ | ❌ | agent `preinstalled-mcp.json` |
| 分析维度 CRUD | backend-direct | n/a(无 LLM) | 无 | ❌(正确) | ❌ | ❌ | `ai/handler.go:166-477` |

\* = 见 §4-R7:这些 agent 进程内子调用**只要进了 agent 的 `session_total` 累计就会被后端水位差额完整记账**(差额行兜底);是否进 session_total 取决于上游是否回 usage 字段(agent 侧不变量)。

> **agent-native 但「未接 Web」的 LLM 面**(后端 client 不代理这些路由,普通 Web 用户无法触达,但容器内进程会跑、且共享同一个 agent Bearer):cron 定时任务、adapters(钉钉/飞书/企微/Telegram)、coordinatorMode 多 worker、conversationService、awaySummary(TUI)、memdir。**当前 Web 产品里它们不构成用户可触发的计费入口,但属容器内可产生 token 的真实面,运维须知。**

---

## 3. 计费链路真相

### (a) token → 账本一行
- **路径A**:所有上游调用汇入 `executeWithRetry`(`service.go:177`),**只有成功分支**调 `recordLLMUsage`(`service.go:208-213`)。归属由入口 `llmusage.WithCall` 决定;ctx 无 Call → feature 退化 `'unknown'`+Warn(`service.go:69-71`),行仍写但归属丢。✅已复核
- **路径B**:`ws.go` 读 `message_complete` → `accrueTurnUsage`(`ws.go:483`),按 `session_total` 水位算**相邻帧增量**,产 per-call 明细行(+ 必要时 `(reconciled)` 差额行),推进水位,异步 `recordAgentTokens→Record`。带外 `token_usage` 帧额外记一行不进水位(`ws.go:495`)。✅已复核
- **路径C**:`ws_serverside.go:236` 同一套 `accrueTurnUsage`,归属取 ctx(`reviewCallCtxWith` 注入 feature=`peer_review`+提交者 UserID;`service.go:1204`),无 ctx 兜底 `FeaturePeerReview`。✅已复核

**`Record` 中央闸**(`service.go:65-95`,✅已复核)顺序:① nil 守卫;② 空 Feature→`unknown`+Warn;③ `TotalTokens==0` 回填 `=input+output+cache_read+cache_creation`(**agent 不吐 total,这是 agent 行 total 唯一来源;必须含 cache 项否则大缓存轮系统性漏报**);④ 仍 0→return;⑤ `observer!=nil && UserID!=nil && total>0`→**同步**扣额度(先于 DB);⑥ `safego.RecordLedger` 异步写 DB,失败只 Warn。**best-effort,非 ACID。**

### (b) token → 扣每日额度
- observer 唯一接线 `bootstrap.go:268`:`SetObserver(func(uid,tokens){ vipService.AddUsage(...) })`。✅已复核
- `AddUsage`(`quota.go:134`)唯一扣减:`userID==0 / tokens<=0 / !Enabled / Redis nil` 全跳过;否则 `INCRBY quota:tokens:<uid>:<today>`,首次设 25h TTL。**fail-open。**✅已复核
- `CheckDailyQuota`(`quota.go:111`)只读闸:`used(today) < DailyCeiling(EffectiveTier)` 放行;`userID==0 / !Enabled / ceiling<0 / Redis 挂` 一律放行。**无预扣、无自动重置(已下线)、无中途熔断。**✅已复核

### (c) 等级与每日上限
- 等级 free < pro < max,`EffectiveTier(userID)` 读 `users.vip_tier`+`vip_expires_at`(过期付费读取时即降 free,无定时任务)。
- 公式(`billing_model.go:73`):`Free=base`;`Pro=base×pro_multiplier`;`Max=base×pro_multiplier×max_multiplier`。
- 生效值(DB 单行 `billing_config`,admin 可改,30s 缓存):`free_daily_tokens=200000`、`pro_multiplier=5`(迁移 0021 把默认 3 顶到 5)、`max_multiplier=5` → **Free 20万/日、Pro 100万/日、Max 500万/日**;`reset_cost_credits=60`。
- 计数器在 **persist Redis 池**(`GetRedisPersist`);**未配独立实例则回落主 allkeys-lru 池**(✅已复核 `redis.go:89-94`,可被逐出,有 `StartEvictionMonitoring` 告警但不阻止)。

---

## 修复状态(2026-06-23,backend 已编译通过,待部署)

| 风险 | 状态 | 改动 |
|---|---|---|
| R1 公众号无上限免费 | ✅ 已修 | `wechatofficial/handler.go` 加单粉丝(30/日)+全局(8000/日)AI 回复成本帽(Redis,fail-open) |
| R2 记忆抽取记 unknown+不计费 | ✅ 已修 | 新增 `llmusage.FeatureMemory` + `Usage/Call.SkipQuota`;`bridge.go` 记忆抽取打 Feature=memory+UserID、SkipQuota=true(**记账本可见但不扣用户额度**) |
| R3 额度计数器可逐出+静默 fail-open | ⚠️ 部分 | `vip/quota.go` Redis 不可用时改打**限流 WARN**(每分钟一条);持久性本身是部署项,见 [DEPLOY-quota-redis.md](DEPLOY-quota-redis.md) |
| R4 peerreview 标题 token 丢帧 | ✅ 已修 | `ws_serverside.go` 补 `token_usage` case(镜像 ws.go) |
| R5 注释陷阱(internal_handler) | ✅ 已修 | 订正 `bootstrap.go`/`hooks.go` 注释 + 删 `docker-compose.yml` 死 env `BACKEND_BASE_URL` |
| R6 流式翻译断连/无 usage 漏记 | ✅ 已修 | `service_llm.go` 流式结束 usage==nil 时打 WARN(漏计可见化,不再静默) |
| R8 单次操作越额度(无单轮帽) | ✅ 观测版 | `vip/quota.go` AddUsage 在越线时记一笔(显著超支 WARN / 普通 DEBUG);**未上硬阻断**(带 UX 取舍,按数据再定) |
| R13 agent cron 不记账 | ⬜ 未动 | 当前非 Web 可触发,低优 |

> 决策记录:**R2 选择「记账本但不扣额度」**(SkipQuota)而非扣额度 —— 记忆抽取是系统后台开销、用户未主动发起,且每 90s 一次会显著吃掉 Free 用户(20万/日)的额度。这样成本在看板可见、可按用户核算,但不影响用户体验。若想改成「也扣额度」,把 `bridge.go` 那处 `SkipQuota: true` 去掉即可。

---

## 4. 缺口与风险(按收入/正确性严重度)

### 🔴 R1 — 公众号自动回复:凭签名即可触发无上限免费 LLM(收入+滥用)
`wechatofficial/service.go:278` 的 `WithCall(Feature=wechat_oa)` **不带 UserID** → 账本行 `user_id=NULL` → `Record` 守卫 `UserID!=nil` 致 observer 不触发 → **永不扣额度**;全路径**无 CheckDailyQuota**;模型档位 admin 可配到 high。任何过签名+MsgId 去重的请求方都能驱动 LLM 花费,**无每会话/每日 AI 回复速率帽**。是唯一对外、陌生方可触发、完全不扣额度的 LLM 入口。✅已复核

### 🔴 R2 — usermemory 记忆抽取:每轮对话后台烧 token,记成 'unknown' 且不扣任何人额度(成本盲区)
`agentbridge/bridge.go:198,208` 用 `context.Background()` 且无 `WithCall` → 落账本但 `feature='unknown'`(无 FeatureMemory 常量)、`UserID=nil` → 不扣发起用户额度。**每个用户、每轮 smart_search/claw/prism 对话**都触发(仅 90s Redis 冷却),既不计费又在看板不可见。对话越活跃,隐性免费成本越大。✅已复核

### 🟠 R3 — Redis 故障 / LRU 驱逐 = 全功能无限免费窗口
`AddUsage` 与 `CheckDailyQuota` 双双 fail-open(`quota.go:147,110`);计数器若与主 allkeys-lru 池共享可被**中途驱逐**=免费续杯。✅已复核(`redis.go:89` 确有回落 + 仅告警不阻止)。故障期所有 tier 实质无限免费;未配独立 noeviction 实例时为常态敞口。

### 🟠 R4 — peerreview 标题生成 token 系统性丢帧未计费
✅已复核:`ws_serverside.go` switch 只有 content_delta/content_start/status/thinking/permission_request/message_complete/pong/connected/error,**无 `token_usage` case**。agent 在 #1/#3 各发一次 Haiku(max 512)`token_usage` 帧被静默丢弃。单笔小、系统性漏。修法:补一个镜像 `ws.go:495` 的 case。

### 🟠 R5 — 误导注释指向已删文件,后人「修复」即双计(陷阱)
✅已复核:`bootstrap.go:238-240`、`hooks.go:52-57` 把 agent token 落库描述成「不存在的 `internal_handler.go` per-call 内网回调」;真相是该旁路**已删**(`routes_user.go:75` 确认 `InternalAgentAuthMiddleware` 无调用方;`docker-compose.yml:322-324` 仍留 `BACKEND_BASE_URL` 上报回调 env 也是同一漂移残留)。相信注释给 `OnMessageComplete` 加 ledger recorder → 对 live `accrueTurnUsage` 路径**双计账本+双扣额度**。

### 🟡 R6 — 流式翻译:上游不吐 include_usage / 客户端断连 → 整段已服务却 0 记录
`StreamChatCompletionWithLevel`(`service_llm.go:124-175`)依赖上游遵守 `include_usage` 且在 `[DONE]` 前送 usage;若忽略或客户端中途断连(`service_llm.go:162` 提前 return,在 usage 块前)→ `usage=nil` → `recordLLMUsage` 静默 no-op(`service.go:263`,**无 Warn**)。✅已复核。一段完整翻译可能不进账本不扣额度且无告警。

### 🟡 R7 — agent 整轮计费正确性 = 取决于 agent `session_total` 完整性(后端侧已水位正确)
✅已复核并**修正报告原结论**:`accrueTurnUsage`(`bridge.go:108`)按 `session_total` 水位**差额**记账,per-call 明细仅用于归因,和 < 差额时补 `(reconciled)` 行 → **后端记账总额恒等于 agent 累计水位**。故子 agent/压缩/web_search 只要进了 agent 的 session_total 就被完整记。残余风险纯在 agent 侧:若上游(某些非 Anthropic relay)不回 usage 字段,`session_total` 自身漏算子调用 → 整轮少记。`sessionTotal==nil`(老 agent)→ 该轮 0 记账(`bridge.go:109`)。当前 DeepSeek anthropic 端点遵守 usage,属未强制的隐含不变量。

### 🟡 R8 — 额度只在 turn 入口只读 gate,无预扣/无单轮帽 → 单次超支不可阻
`CheckDailyQuota` 只读历史,`AddUsage` 后置。卡在上限下方者总能再发一个把自己推到任意超上限的单次操作,只在**下一次**被拦。peerreview 一次 Submit 跑 4 轮只 gate 一次(`service.go:1462`),放大 4 倍。超支有界(一次最大 turn),单轮无界。✅已复核

### 🟡 R9 — best-effort 账本 vs 同步额度扣减,可分叉
observer(扣额度)**同步先于** DB 写;DB 写经有界池满载/超时可丢行(仅 Warn)。可能「额度已扣、账本无行」或 observer 失败时额度少计。**额度正确性依赖 Redis 持久性,而非账本**;二者非同源对账。✅已复核

### 🟢 R10 — 矩阵分析按成功上游往返多行记账(retry/batch),用户单次动作 ≠ 1 行
`AnalyzePaperAbstract` JSON 重试(≤3)与每批(4维/批)各一次成功上游各写一行(`service_analysis.go:145`)。成本口径准,但看板按动作统计会偏高。✅已复核

### 🟢 R11 — thirdparty 层对计费全盲;`usage_count` 权重疑僵死
thirdparty 池无任何用户级计费(正确,它只是凭据池),但任何走 `GetRandomAIModelConfigByLevel` 却忘在自己那层记账/gate 的路径会被静默服务,`RecordAPIUsage` 还照常 bump per-account 数把漏洞伪装成「有流量」。`total_requests`(含重试)**不可**与 `llm_token_usage` 对账、**不可**据此计费。

### 🟢 R12 — 两套独立上游凭据库,审计/封禁须双查
路径A 用 `third_party_accounts`;路径B/C 用 `agent_config`(单行,无轮换、无 per-account 统计,容器直连上游不经 egress)。零代码耦合:禁用 thirdparty 池**不停** agent 容器花费,反之亦然。agent 行 `AccountID=NULL` 无法对账到具体上游 key。另有 stranded 死表 `latex_agent_config/latex_agent_models`(无 live 代码),审计「所有 LLM 配置路径」时会撞见,勿误判为活的。

### 🟢 R13 — agent cron 定时任务:容器内自动跑、不记账不扣额度(当前未接 Web,属潜在面)
✅已复核:`cronScheduler.start()` 开机自启(`agent/src/server/index.ts:209`),自动触发的任务**刻意不建 session**(`cronScheduler.ts:458` 仅手动 Run Now 才建)→ 无 WS 管道 → token 永不进 `llm_token_usage`、永不扣额度。后端 `internal/agent/client.go` 不代理 `/api/scheduled-tasks`,普通 Web 用户无法创建,故**当前不是用户可触发的计费洞**;但凡持有 agent 共享 Bearer 者即可注入,且容器内已存在的任务会照跑。同类「present-but-not-web-wired」面还有 adapters/coordinatorMode/awaySummary/memdir。

### ℹ️ peerreview feature key 口径分叉(信息项)
`agent_sessions/feature_prompts` 用 `"peerreview"`,但账本 feature 是 `"peer_review"`(因 peerreview 绕 WS pipe 走 server-side ctx)。当前正确;若有人把 peerreview 接回标准 WS pipe,会静默开始记 `feature="peerreview"`(看板未映射)→ 审稿成本被劈两桶。

---

## 5. 建议(仅建议,未实施;按收入/正确性收益排序)

1. **R1 公众号加 anonymous 成本帽(最高优先)**:不强制 per-user 额度,但加全局/每 OpenID/每日 AI 回复速率上限(Redis 计数),模型档位上限默认收到 low。
2. **R2 修 usermemory 归属与计费**:`bridge.go:198` 触发抽取时用带 `WithCall{Feature: 新增 FeatureMemory, UserID: 发起用户}` 的 ctx,而非 `context.Background()`;新增 `llmusage.FeatureMemory` 常量 + 看板映射。
3. **R4 补 peerreview server-side `token_usage` case**:`ws_serverside.go` 加镜像 `ws.go:495` 的分支,归属取 ctx。改动小、收益确定。
4. **R5 订正/删除误导注释**:把 `bootstrap.go:238-240`、`hooks.go:52-57`、`docker-compose.yml:322-324` 里对 `internal_handler.go`/`BACKEND_BASE_URL` per-call 回调的描述改成「agent token 经 ws.go/ws_serverside.go 的 accrueTurnUsage 带内帧落库」,并警示「不要给 OnMessageComplete 加 ledger recorder,否则双计」。
5. **R6 流式漏计可观测化**:`recordLLMUsage` 在流式 `usage==nil` 时打 Warn(带 feature/account),把「上游没吐 usage / 断连」从静默变可见。
6. **R3 保障额度计数器持久性**:部署层确保独立 noeviction persist Redis 实例(而非回落 allkeys-lru),Redis 不可用进告警而非 DEBUG 静默。
7. **(可选)R8 重型单轮预算护栏**:peerreview(4 轮)与 agent 大扇出 turn 加 turn 内 max-token 上限或轮间二次 CheckDailyQuota。
8. **R9 账本 vs 额度对账作业**:按日 SUM `llm_token_usage.total_tokens` per user vs Redis 计数器残值做合理性校验,暴露丢行/少计。
9. **R12/R13 运维文档**:写明两套独立上游凭据库须双侧封禁/对账;agent 行 `AccountID=NULL` 不可对账(长期可让 agent 在 token_usage 帧回传 provider 标识);`latex_agent_config` 为死表;cron/adapters 等容器内面非 Web 触发但须知。

---

## 附:本轮验证状态

| 项 | 结论 |
|---|---|
| V1 accrueTurnUsage 计费源 | ✅ 水位差额(非纯 per-call),差额行兜底 → 后端记账恒等于 agent session_total → R7 重定级为「依赖 agent 侧完整性」 |
| V2 observer/AddUsage 接线 | ✅ 唯一一处 `bootstrap.go:268` |
| V3 GetRedisPersist 回落 | ✅ 无独立实例则回落主 allkeys-lru,可逐出,仅告警 |
| V4 ws_serverside token_usage | ✅ 确无该 case,peerreview 标题帧被丢 |
| V5 cron 自启不建 session | ✅ `index.ts:209` + `cronScheduler.ts:458` |
