# 智能审稿 token 归日排查报告(用户 #552,2026-07-02)

> 状态:**排查已闭环,结论确认;三个修复项待做(见文末 TODO)**
> 排查方式:14 个 agent 的多路代码勘察 + 8 个候选机制对抗验证 + 生产 DB/日志实证

## 一、问题现象

管理后台观察到疑似数据 bug:

- 用户 #552(MentorDonald,Free tier)在「用户会话监控 → 智能审稿」里只有一条记录,
  时间显示 **2026-07-01 20:40**,状态 completed;四个监控 tab(智能搜索/助手/写作/审稿)
  今天(07-02)均无任何可见活动。
- 但用户详情「按天」统计显示 **07-02 有 16.6M token / 23 次调用**(输入 1.6M / 输出仅
  18.9k / 缓存读 15.0M);「今日 AI 额度」16,561,274 / 300,000,超 Free 日额度 **55 倍**。
- 07-01 也有 26.7M / 48 次;近 30 天按模型:deepseek-v4-flash 56 次 26.8M、
  deepseek-v4-pro 64 次 18.4M。

疑问:用户"似乎只在昨天用过审稿",为什么今天也有大量 token?

## 二、最终结论(非 bug)

**今天的 16.6M 完全真实且归属正确——审稿就是今天跑的。**

真实时间线(生产 GIN 日志 + DB 实证,GIN 日志时间为 UTC,+8 = 北京):

| 时刻(北京) | 事件 | 证据 |
|---|---|---|
| 07-01 20:40:14 | 用户**创建草稿** #58(journal 模式) | `peer_review_submissions.created_at` |
| 07-01 20:45:54 | 向导 meta 抽取:会话 `6beb8a8d`,**23 次调用 / 9.87M**(flash,一次性 flush) | `llm_token_usage` |
| 07-01 20:48:49 | 向导第二大轮(信件/换稿后 meta 重跑):会话 `552cead5`,**25 次 / 16.8M**(flash;25 = 撞单轮 MAX_TOOL_ROUNDS=24 上限) | `llm_token_usage` |
| 07-01 晚 | 用户走到 step 4,**没点提交就离开**,#58 一直是 `status='draft'` | 次日 latest-draft 返回 200 |
| 07-02 09:29:13 | 用户回到 `/peer-review/journal?id=58&step=4`,`GET latest-draft` **200**(仍是草稿) | GIN 日志 |
| 07-02 09:29:19 | **`POST /58/submit` → 200**,`submitted_at=09:29:20`;当日用量≈0,CheckDailyQuota 放行 | GIN 日志 + DB |
| 07-02 09:31:40 | 方法论阶段完成:**临时会话** `eaec7e32`,11 次 / 7.6M(pro,一次性 flush;临时会话用完即删,故账本里对不上任何 submission) | `llm_token_usage` |
| 07-02 09:34:30–09:39:10 | 3 审稿人 + 主审:主会话 `552cead5`,11 次 / 8.9M(pro) | `llm_token_usage` |
| 07-02 09:39:10 | `MarkCompleted`,`completed_at=09:39:10`(与账本末行精确一致) | DB |
| 07-02 09:39:15 | 审稿完成后记忆抽取 1 次 23k(flash,`feature=memory`,SkipQuota 不扣额度) | `llm_token_usage` |

**"只在昨天用过"是错觉,根源 = 管理后台审稿列表「时间」列显示的是 `created_at`(草稿
创建时刻),不是 `submitted_at` / `completed_at`。**(`PeerReviewMonitor.tsx` 时间列渲染
createdAt。)

昨天 flash / 今天 pro 也不是有人改配置:`agent_config` 自 06-30 20:17 起未变
(main=deepseek-v4-pro / haiku=deepseek-v4-flash),这只是"向导用快模型、审稿用主模型"
的正常分工(`service.go` fastModel→meta/letter,mainModel→methodology/reviewers/chief)。

## 三、计费口径(核实为自洽,无跨日错记)

- 账本的「天」= 每次 LLM 调用完成、usage 帧落库那一刻:`llm_token_usage.CreatedAt`
  autoCreateTime([model.go:53](../../../backend/internal/llmusage/model.go)),
  DSN `loc=Asia/Shanghai`,按天分组用 `DATE_FORMAT(created_at,'%Y-%m-%d')` 纯本地时间
  ([repository_admin.go](../../../backend/internal/llmusage/repository_admin.go))。
- vip 日额度在同一刻按 `time.Now()` 当日 Redis key `quota:tokens:<uid>:<yyyymmdd>` INCRBY
  ([quota.go](../../../backend/internal/vip/quota.go))。
- 双通道交叉验证:Redis 今日桶 16,561,274 ≈ MySQL 今日合计 16.6M(差值 = SkipQuota 的
  memory 行 23k + 舍入),**两条独立的日期归属通道一致 ⇒ 不存在"昨天错记成今天"**。
- 归日语义 = 调用完成时刻,而非任务提交时刻(设计如此,quota.go R8 注释自认)。

## 四、排查中排除的假设(下次别再走弯路)

| 假设 | 结论 | 关键证据 |
|---|---|---|
| 后端重启触发 `ReconcileStaleOnBoot` 自动续审 | ❌ 排除 | backend `StartedAt=06-30 20:17`、Restarts=0、日志自启动完整保留且无 "peerreview boot reconcile/resuming stranded review" |
| 昨晚的 run 自然跨午夜跑到今天 | ❌ 排除 | 单次 run 受 30min BackgroundJob ctx(非抢占,轮次边界 dial 时咬合);且今天有**新的**临时方法论会话 = 从头重跑,不是续跑 |
| 水位丢失双计(`model='(reconciled)'` 补记历史) | ❌ 排除 | 按模型 30 天只有 flash/pro 两桶,无 reconciled 桶;今日 23 行均为真实 per-call 形态 |
| 记忆抽取/标题生成等带外调用构成主体 | ❌ 排除 | 单次仅 1-3k、零 cache,差 2-3 个数量级;且 memory 行 SkipQuota 不扣额度,而今日额度确实涨了 16.5M |
| 翻译/matrix 等项目侧调用 | ❌ 排除 | 有每请求前置配额闸(超 300k 后一律 429);输入上限与 652k/次的缓存读形态物理不符 |
| 用户在旧对话会话继续用后 Reset 抹痕 | ❌ 排除 | Reset 不删 `agent_sessions` 行,监控列表按 last_accessed_at 会浮顶 |
| 统计时区/分组 bug | ❌ 排除 | 见第三节双通道一致性 |

核实过的机制事实(代码级,已提交版本与部署版 ba8d2a942 均核对):

- `runReviewBackground` 全仓库仅两个调用点:`Submit`(要求 `status='draft'`)与
  `ReconcileStaleOnBoot`(仅 boot 时;candidates 只含 queued/reviewing,completed/failed
  绝不重跑)。
- sweeper 只复位 `computing_*` 向导草稿;PATCH / ResumeOrCreate / latest-draft 都只认
  draft;admin 端点只读;`chatWithRetry` 无退避睡眠。
- 账本行 `request_id` = **agent session id**(非 submission id);方法论跑在临时会话,
  用完即删 ⇒ 账本出现对不上任何 submission 的 session id 属正常。

## 五、诊断命令备忘(同类问题直接抄)

```bash
# 某用户某天的账本来源(request_id=agent session id)
docker exec scholar_mysql mysql -u scholar_user -pscholar_pass scholar -e \
"SELECT feature,model,request_id,COUNT(*) c,SUM(total_tokens) tt,SUM(cache_read_tokens) cr,\
MIN(created_at),MAX(created_at) FROM llm_token_usage \
WHERE user_id=<UID> AND created_at>='<YYYY-MM-DD>' GROUP BY feature,model,request_id ORDER BY tt DESC;"

# 审稿单三个时间字段(created=建草稿 / submitted=真正提交 / completed=跑完)
docker exec scholar_mysql mysql -u scholar_user -pscholar_pass scholar -e \
"SELECT id,status,created_at,submitted_at,completed_at,agent_session_id \
FROM peer_review_submissions WHERE user_id=<UID>\G"

# 用户实际操作轨迹(GIN 日志时间是 UTC!)
docker logs scholar_backend 2>&1 | grep -E "GIN.*peer-review" | grep "<YYYY/MM/DD>"

# 后端是否重启过 / 日志是否完整
docker inspect scholar_backend --format 'StartedAt={{.State.StartedAt}} Restarts={{.RestartCount}}'
docker logs --timestamps scholar_backend 2>&1 | head -2
```

## 六、TODO:下次要修的三件事(按优先级)

### 1. 向导步骤零配额 + 成本失控(最高优先级,成本漏洞)

- 现状:`AdvanceStep`(meta 抽取 `runMetaExtract` / 投稿信 `runLetterDraft`)**没有任何
  配额检查**;本例用户昨晚未提交就烧了 26.7M(比审稿本身 16.6M 还多)。
- 且 meta 抽取 prompt 明确要求"只读前 1-2 页"([service.go](../../../backend/internal/peerreview/service.go)
  runMetaExtract 附近),实际单轮 23/25 次调用、10-17M token——25 次正好撞
  `MAX_TOOL_ROUNDS=24` 上限(agent/src/turn/turnLoop.ts),agent 疑似在通读全文。
- 修法:
  a. `AdvanceStep` 入口加 `vip.CheckDailyQuota`(与 Submit 同款只读闸);
  b. 收紧 meta 抽取行为:prompt 强化 + 该 slot 单独限制轮数/给 fastModel 会话更小的
     工具预算;必要时 meta 改走一次性 completion(不开工具循环)。
- 注意:step_cache fingerprint 幂等已存在(同稿件重复点下一步不重烧),别破坏。

### 2. 单任务 token 熔断帽(结构性额度敞口)

- 现状:`Submit` 只在入口 `CheckDailyQuota` 一次(只读闸门),之后 methodology + 3
  reviewer + chief 全程零检查、无单任务上限;Free 300k 一单合法烧 16.6M(超 55 倍)。
  quota.go R8 注释自认该敞口。
- 修法:`accrueTurnUsage`/审稿轮之间检查"本任务累计 token > 硬帽(如 tier 日额度的 N 倍)"
  → 提前终止并 markFailed(友好文案);或在 `chatWithRetry` 每轮前查 vip 剩余。
- 涉及:`backend/internal/peerreview/service.go`(runReviewBackground 各轮之间)、
  `backend/internal/agentbridge/ws_serverside.go`(如做通用熔断)。

### 3. 监控列表时间列误导(本次误判根源,一行改动)

- 现状:`frontend-user/src/features/admin/components/PeerReviewMonitor.tsx` 时间列渲染
  `createdAt`(草稿创建),用户次日才提交时后台看起来"今天毫无动静"。
- 修法:时间列改 `submittedAt ?? createdAt`,或"创建/完成"双列;admin DTO 若缺字段则
  在 `backend/internal/peerreview/admin.go` 的 AdminPRListRow 补 submitted_at/completed_at。

### 附:独立隐患(本次未触发,建议单独排期)

- **水位丢失双计**:`agentbridge` 计费水位 `tokenWatermarks` 是进程内 sync.Map
  ([bridge.go](../../../backend/internal/agentbridge/bridge.go) ~65-197),hub 3 分钟空闲
  关闭(hub.go ~436)或 backend 重启即清;而 agent executor 的会话累计 `cumUsage`
  (agent/src/server/sessions.ts)不清零 ⇒ 用户隔天重进同一会话发首条消息时,可能把整段
  历史按差额行 `model='(reconciled)'` 重记一遍并全额扣当日额度(bridge.go 注释自认接受)。
  本次账本无 reconciled 桶证明未发生,但交互 feature"隔 3 分钟再聊"理论上每次都可能触发。
  修法方向:水位持久化(Redis)或 agent 侧 per-turn usage 代替 session_total 差分。
- **`ReconcileStaleOnBoot` 续审无配额/无年龄限制**:发版重启会把滞留 queued/reviewing 的
  单子从头重跑且不 re-check 配额(设计注释自认"浪费可接受")。与 TODO 2 一起加熔断帽即可
  覆盖。
