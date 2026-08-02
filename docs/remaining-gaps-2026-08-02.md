# 部署前遗留项清单 — 2026-08-02

面向决策的合并清单。覆盖两批未部署改造(证据账本 Phase 0 / 科研内核 Phase 1)以及
07-31 线上审计留下的未闭合项。

**每条结论都打开了文件核对**,证据为 `file:line`。凡是只有文档说法、代码里查不到实据的,
一律降级进末尾的「未确认」,不写成 finding。

一句话总览:**代码本身质量不差,坏在「开关、接线、和发布纪律」上。**
Phase 0 的证据地基是真做实了;真正会咬人的是 Run 引擎默认开着却三个闸全没接、
预检索因一个漏传参数 100% 失效、以及仓库里 253 处改动一份都没进 main。

---

## 分档说明

| 档 | 判据 |
|---|---|
| 🔴 部署前必须处理 | 错过不可逆 / 会造成线上事故 / 数据永久丢失 |
| 🟡 部署后尽快 | 有实际用户影响,但不阻塞发布 |
| ⚪ 可排期 | 能力债 / 优化项 |

---

# 🔴 部署前必须处理(6 条)

## R1. 发布断层:24 个 commit 未进 main,另有 229 个文件未提交,两个新包完全未跟踪

**是什么**
`git rev-list --count main..HEAD` = **24**;`git status --porcelain | wc -l` = **229**。
本次两批改造的核心产物是 **untracked**(`??`):

```
?? agent/src/evidence/
?? backend/internal/agentrun/
?? docker/mysql/migrations/0101_agent_runs_fields.sql
?? docker/mysql/migrations/0102_agent_runs_indexes.sql
```

分支 `design/figma-token-layer`,最早未合并 commit `aa55c94df`(Figma 换真源),最新 `f53ccac73`。

> 材料里出现过 246 / 229 两个数字,实测为 **229**;24 commit 与 229 文件是**相加**关系,
> 后者体量远大于前者(整个设计系统换代 + 证据账本 + 科研内核都只在这一台机器的工作区里)。

**不修的后果**
① 磁盘损坏或误 `git checkout .` = 数周工作量归零,而且 `git stash` **不会带上 untracked 目录**,
连临时保护都做不到;
② 按 CLAUDE.md 的 `docker-compose up -d --build` 部署时构建 context 取的是工作区,
等于把 229 个未审阅改动一次性推上生产;
③ 出事无法二分定位——设计系统换代、证据账本、Run 引擎三批会同时上线。

**改哪里** 先 commit + push;分批合 main(设计系统 / Phase 0 / Phase 1 三个 PR)。

**成本** 小时级(分批整理),本身无技术难度。

---

## R2. 生产零备份,而且没有任何自动安装路径 —— 这次偏偏要跑新迁移 + 全站 down/up

**是什么**
备份三件套齐全:`scripts/backup-all.sh`(mysql|agent|minio,KEEP 默认 7)、
`scripts/backup-cron.sh`、`scripts/install-backup-cron.sh:26`(写 `0 ${HOUR} * * *` 带
`# SCHOLAY_BACKUP` 标记)、`scripts/RESTORE.md:54-56`。

**但 `scripts/deploy.sh` 里 grep `cron|backup|git` 全部零命中**(实测),
`docker-compose.yml` 里 grep `backup|mysqldump|cron` 同样零命中(无 sidecar)。
也就是说:**除非有人手工跑过一次 `install-backup-cron.sh`,生产就是零备份**,
且这是机制性的,不是「忘了」。
`docs/prod-audit-2026-07-31.md:49-50` 记「crontab 从未安装、`/home/scholar/backups` 不存在」。

**不修的后果**
`scripts/deploy.sh:98` 的部署形态是 `docker compose down` 再 up = 全站停机 + 迁移重放。
盘损或迁移出意外 = 账户 / 订单 / 计费 / 稿件 / agent workDir 一次性全丢,零副本可回退。
本仓库有过迁移重放事故前科(0.0.66 的 0014 重建唯一索引撞上 0074 数据)。

**改哪里** 三条命令,必须在 `down` **之前**:
手跑一次 `backup-all.sh` 验证 → `install-backup-cron.sh` → 配 `BACKUP_OFFSITE_DEST`。

**成本** 小时级。这是全清单里性价比最高的一条。

---

## R3. Run 引擎默认开着,是一条零配额、算错账、无人看守的免费烧钱入口

**这是本次最危险的一条,四个缺陷互相叠加。**

**① 路由已挂载、默认开启、对所有登录用户可达**
`backend/cmd/server/routes_user.go:323-327` 四条路由挂在 `userProtected` 下:

```go
if h.agentRun != nil {
    userProtected.POST("/claw/runs", h.agentRun.CreateRun)
    userProtected.GET("/claw/runs", h.agentRun.ListRuns)
    userProtected.GET("/claw/runs/:id", h.agentRun.GetRun)
    userProtected.POST("/claw/runs/:id/cancel", h.agentRun.CancelRun)
}
```

`bootstrap.go:717` 无条件构造 handler ⇒ 那个 nil 守卫**恒真**;
`engine.go:57-59` `engineEnabled()` 只认 `AGENTRUN_ENABLED=off`,**默认开**。

**② 全链路零配额检查**
`grep -rn "vip\.|CheckDailyQuota|llmusage" backend/internal/agentrun/`(排除测试)= **零命中**。
`handler.go:60-97` CreateRun 前无任何配额判定;
`adapter.go:100` 走的 `ServerSideChatStreaming` 路径不经 `PreUserMessage` / `BeginTurn`。
对照 peerreview 是**手放**的(`peerreview/service.go:1116` CheckDailyQuota)。

**③ token 记成 `feature=peer_review` + `user_id=NULL`**
`ws_serverside.go:209-212`:

```go
call := llmusage.CallFromCtx(ctx)
feature := call.Feature
if feature == "" {
    feature = llmusage.FeaturePeerReview
}
```

而 engine 的 ctx 来自 `bootstrap.go` 的 `context.Background()`,包内无任何 `llmusage.WithCall`
⇒ `UserID` 恒 nil、feature 恒落审稿兜底。`llmusage/service.go:117` 的 observer 门是
`u.UserID != nil && costMicro > 0` ⇒ nil 用户**不扣额度**。

**④ 单步 attempt 上限 8(方案硬性要求 2),且 maxRounds 不下发**
`engine.go:41-46` `defaultMaxRetry()` 默认 **8**;
`adapter.go:99` `_ = maxRounds`(注释自述是刻意降级),每步退回执行器默认 24 轮。
claw 的 `deep_research` 是 5 步(`claw/spec.go:196-224`)。

**不修的后果**(具体化)
任何已登录用户(含 free 档)`curl` 一次 `POST /api/v1/user/claw/runs`,就能起一个
5 步 × 每步最多 8 次 attempt × 每步 24 轮 = **最坏近千个工具轮**的后台任务,
每条 turn 最长跑到 TurnTimeout 15 分钟。全过程:
- 日额度一分不扣、经费一分不扣(白嫖);
- 产生的钱记进 `llm_token_usage` 时 `user_id=NULL`,**写进去就永久追不回是谁花的**;
- 后台算力看板把这笔钱算成「审稿」成本,污染 peerreview 口径与后续所有定价复算;
- 长期占用全局 2 个 turn 槽中的 1 个,直接影响正常付费用户;
- 界面上完全看不见(见 §Run 引擎的用户可见性),异常只能靠 `docker logs | grep agentrun` 发现。

这正是 `billing-full-audit` 里「新增付费 feature 忘接线 = 收入泄漏」的形状,
而起服断言 `VIPCheckerWired` 管不到 server-side 路径。

**改哪里(两条路,建议先走 A)**
- **A(推荐,分钟级)**:`engine.go:58` 默认值改成 opt-in(`AGENTRUN_ENABLED=on` 才开),
  或把四条路由摘出 `userProtected`。一个动作压掉本条全部风险,Phase 1 的代码照样进仓。
- **B(小时级)**:CreateRun 前 + 每步认领前调 `vip.CheckDailyQuota`;
  用 `llmusage.WithCall` 把 userID/feature 塞进 ctx;`defaultMaxRetry()` 默认改 2。

**成本** A = 分钟;B = 小时。

---

## R4. 预检索 100% 失败:`search_papers` 的必填参数 `source` 漏传 —— 根因已定位到行

**是什么**
`agent/src/evidence/prefetch.ts:159`:

```ts
const call = (a.callTool ?? callMcpTool)(PREFETCH_TOOL, { query: q.query, limit });
```

只传 `query` / `limit`。而 minicod MCP 的 `search_papers` 把 `source` 声明为**必填** enum
(`agent/src/mcp/mcpTools.test.ts:27-30`,`enum: ["semantic","openalex","pubmed"]`)。

本地 scholar_agent 容器实测日志(镜像已含新代码):

```
evidence_prefetch status=failed reason=upstream_error ms=28
upstream="MCP error -32602: Input validation error: ... \"path\":[\"source\"], \"message\":\"Required\""
```

47ms / 28ms 的极短耗时正是参数校验被上游秒拒的特征,不是熔断也不是网络。

**不修的后果**
① Phase 0 / P1 的**主收益归零**:每个取证会话的第一个取证轮都走 failed 分支早退,
账本仍为空,「模型开口前账本已非空」这条整改的核心机制在生产上一次都不生效;
② **更糟的是把北极星指标带向反向结论**:必补项 C 靠 prefetch 返回的 `dois/paperIds` 发
`evidence_appended` 帧(`prefetch.ts:210-217` + `turnLoop.ts:270-276`),
failed 分支返回 `{status:"failed", note:""}` 不带 dois ⇒ 那一帧**永远不发**。
部署后采到的接地率会系统性低于真实值,数据会显示「这两批改造把接地率做差了」。

**改哪里** `prefetch.ts:159` 补 `source`。需要一个产品决定:固定用哪个源,还是 fan-out 三源。

**成本** 分钟级(改代码)+ 一次拍板。

---

## R5. P0 指标 V1–V8 无任何采集脚本 / SQL / 看板 —— 部署那一刻基线永久失去

**是什么**
必补项 A/B/C 的**代码确已接线**:
- A = `backend/internal/agentbridge/hub.go:2092` `case "research_state", "evidence_appended"` + `eventlog.go:48-62`
- B = `agent/src/turn/turnLoop.ts:995` 终帧收口 + `:407-417`
- C = `prefetch.ts:210-217` + `turnLoop.ts:270-276`

但**采集侧一片空白**:`scripts/` 下 30 个脚本无一涉及指标(只有 monitor-memory.sh 等);
全仓 grep `citation_audit` / `CoverageReport` **零命中**(已排除 node_modules)。

**不修的后果**
`docs/p0-metrics-collectability-2026-08.md:43` 明确 V3 的基线是
「claw 零工具轮 DOI 接地率 43%」——**这个数只能在旧代码还在生产跑的时候算出来**。
部署之后再也无法回答「这两批改造到底有没有用」,只能凭感觉。
与 R4 叠加更糟:即使事后补 SQL,prefetch 恒失败会把部署后值压低,得出反向结论。

**改哪里** 部署前跑一轮基线 SQL(读 `agent_turn_events`),把 V2/V3 的部署前数存档。

**成本** 小时级(写几条 SQL + 存一份 CSV)。**唯一一条过了这村没这店的。**

---

## R6. 急停阀在 compose 里没有透传口,迁移靠服务器 git pull 而 deploy.sh 不拉 —— 上线和回滚两头都不成立

**① 所有热开关写进 .env 完全不生效**
`grep -n "AGENTRUN|EVIDENCE_|env_file" docker-compose.yml docker-compose.prod.yml` = **零命中**(实测)。
`docker-compose.prod.yml:206-296` backend 的 `environment` 是**显式白名单**,整份文件无 `env_file:`。
方案 `docs/research-kernel-architecture-2026-08.md:354` 写的
「`AGENTRUN_ENABLED=off` 一行 env 回滚」在生产上**不可执行**:运维加了这行、`up -d`,
容器里根本看不到这个变量,引擎照跑。`EXECUTOR_EVIDENCE_PREFETCH` 同理。

更糟的是绕路会打死自己:唯一手段是在服务器上直接编辑 git 跟踪的 `docker-compose.prod.yml`,
而 `docker/mysql/migrations` 正是靠这个 checkout bind-mount 进 schema-sync
(`docker-compose.prod.yml:190`)——把工作区改脏后,下次 `git pull` 拉新迁移就会冲突,
形成「关掉了功能但下次升不了级」的死结。

**② 文档承诺的两个阀在代码里根本不存在**
方案 `:341` 写「`EVIDENCE_RESERVED_WRITE=off` / `EVIDENCE_PASSAGES=off`」——
这两个串在 agent/src 与 backend 全仓**零命中**。
实际存在的只有 `EVIDENCE_ABSTRACT_STORE_CAP` / `INGEST_MAX_PAPERS` /
`MATERIALIZE_MAX_FILES` / `PREFETCH_LIMIT` / `PREFETCH_TIMEOUT_MS` / `PASSAGE_ROWS_MAX`
与 `EXECUTOR_EVIDENCE_PREFETCH`。
证据保留区出问题时,**唯一回滚手段是把 agent 镜像回滚到旧 tag = 全站停机**,不是「关一个开关」。

**③ 新迁移到不了位**
`scripts/deploy.sh` 里 grep `git` = 零命中,只 `docker pull` 镜像。
按老习惯 `deploy.sh vX` = 镜像换了但 migrations 目录还是旧的 ⇒ 库里没有 `agent_runs` ⇒
调度器每 5 秒打一条 `count active runs failed`(`engine.go:176-179`),`POST /claw/runs` 直接 500。

**不修的后果** 出事没有分钟级止血手段,只有全站停机回滚;或者上线即刷错误日志。

**改哪里** 两份 compose 各加 4–6 行 `${VAR:-}` 透传;`.env.example` 记一段;
部署流程显式加一步服务器 `git pull` + 确认 schema_sync 日志跑到 0102。

**成本** 小时级。

---

# 🟡 部署后尽快(有用户影响,不阻塞发布)

## Y1. 引用契约已对所有会话注入,但没有展开器 —— 上线第一天用户就会看到字面量 `[[E7]]`

`agent/src/evidence/render.ts:133` 把 `CITATION_CONTRACT`(`:334`)注入**每一个账本非空会话**的
digest,内容是「正文里引用账本条目写成 `[[E7]]` 这样的句柄」。
而 `agent/src/evidence/deliver.ts:28` 的 `resolveTextForDelivery` 仍是**零生产调用点**
(实测唯一调用方是同文件 `:53` 的 `resolveFileForDelivery`,即只覆盖文件交付);
`turnLoop.ts:917-931` 的 SubmitAnswer 正文直接 `content_delta` 切片下发,不过任何闸;
`citation_audit` 全仓**零命中**。

**后果** smart_search 的唯一产物形态就是对话正文。模型照契约写句柄 → 用户直接看到 `[[E7]]`
(`fold.ts:165` 明写 evidence_appended「P0 刻意不消费,是 P1 的 resolve 输入」,那个 P1 没做);
模型不写句柄 → 交付面零校验,编造的题录原样出街。等于把「用句柄」教给了模型,
却只在文件交付这条最小路径上兑现。

**改哪里** SubmitAnswer 正文过 `resolveTextForDelivery`;或退一步,
账本为空/无展开器时不注入 CITATION_CONTRACT。 **成本** 小时~天。

---

## Y2. MiniMax 三个模型仍在模型选择器里可选

本地 dev DB 实测(`agent_models`):

| id | model_id | enabled | user_selectable | provider_id |
|---|---|---|---|---|
| 263 | MiniMax-M2.7 | 1 | 1 | 8 |
| 264 | MiniMax-M2.7-highspeed | 1 | 1 | 8 |
| 265 | MiniMax-M3 | 1 | 1 | 8 |

⚠️ **不确定性**:「上游 402 余额不足」**未在本仓库/本地取证**
(本地 backend 与 agent 日志 grep `402|insufficient|余额` 零命中),生产库状态也未确认。
若 402 属实,用户能在选择器里选到三个必然报错的模型,失败发生在上游、前端只显示通用错误,
用户会归因为「Scholay 坏了」。
**改哪里** 一条 `UPDATE ... SET user_selectable=0`。**成本** 分钟。

---

## Y3. `claim_audit.corrective_fired` 恒 false ⇒ 三个 feature 的「已核验」信任标签在部署当天静默消失

`agent/src/turn/turnLoop.ts:396` `corrective_fired: false` 硬编码(注释写明「核验已降级为纯观测」)。
下游三份镜像全部 `if (msg.claim_audit?.corrective_fired) current.claimAudited = true`:
`features/claw/.../fold.ts:187`、`features/prism/.../fold.ts:130`、
`features/search/components/smart-search/types.ts:187`;渲染点 `MessageTurn.tsx:347-349`。

**后果** 线上 HEAD 的 HonestyGuard 会真触发并打标,这批改动把它降级后标签恒不出现。
用户侧表现为「平台的核验功能悄悄没了」,而我们这边**零红灯**。
本仓库铁律「fold 有四份 / 单边修复等于没修」的又一次复发。 **成本** 小时。

---

## Y4. 迭代深化不存在:一次检索之后,全会话所有后续轮次降级判 chat

`agent/src/policy/researchTurn.ts:82` `if (a.ledgerTotal > 0) return { phase: "chat", rule: "ledger_grounded" }`;
`prefetch.ts:123-125` `shouldPrefetch = phase==="evidence" && ledgerTotal===0`;账本是 append-only。

**后果** 用户第 2 句起换话题问「那 XX 方向呢」,SubmitAnswer/DeclareInsufficient 交付闸整个消失、
引擎预检索不再触发、取证契约不再下发 —— 模型可以完全凭记忆答且无任何机械约束。
而这恰恰是最像「深入研究」的那几轮。等于把闸只装在会话第一轮。 **成本** 天。

---

## Y5. `ingestPapers` 全仓零生产调用方 ⇒ 文献集引用 / 用户上传的文献从不进证据账本

`agent/src/evidence/ledger.ts:334` `export async function ingestPapers(...)`,
实测非测试调用方为 0(`:402` 调的是同名前缀的内部函数 `ingestPapersUnlocked`,origin 硬编码 `"retrieval"`)。
而文献集物化是活的生产路径(`backend/internal/claw/handler.go:356`)。

**后果** ① origin 分布永远只有 retrieval 一档,答不出「这是你文献库里的还是我检索的」;
② 出口闸把用户自己的真实文献判成无出处,方向上把接地率压低;
③ `ledger.ts:331` 自述的「堵死用户回声洗白」也一并没生效。
下游症状:`resolveEidForPath`(`ledger.ts:505-512`)只认 `evidence/E<n>.md`,
`references/paper-<id>.md` 建不起来 ⇒ markRead 对文献集来源全部空转,「已读全文」那一档不可达。
**修 ingestPapers 之前不要单独动 resolveEidForPath**(注释说明了为什么刻意不做 basename 猜测)。
**成本** 天。

---

## Y6. 取消 Run 不打断正在跑的那一步

`backend/internal/agentrun/handler.go:150` 的 CancelRun 只做 `SetRunStatus`(实测);
`engine.go:274` 的 `exec.RunStep(ctx,…)` 用的是 tick 传下来的 ctx,Run 维度没有 cancel func。
后续步确实不会再认领(`engine.go:203` 只过滤 planning/running)。

**后果** 用户点取消后界面立刻变已取消,但那一步的 24 轮会继续跑到自然结束(重检索步可达十几分钟),
期间继续烧 token、继续占 turn 槽。用户会看到「取消了还在扣」。 **成本** 小时。

---

## Y7. `research_state` chip 只在 claw 一处 fold 落地

`features/claw/components/chat/fold.ts:151` 有 `case 'research_state'`;
`features/search` / `features/prism` / `features/admin` 三处 grep **零命中**。
后端侧帧是 feature 无关的(`hub.go:2092` 白名单已收)。

**后果** 「本轮真检索了几次 / 账本几条」这枚 chip,在**最需要它**的 smart_search
(唯一产物是对话正文、恒走取证轮)上不显示;admin 会话监控也看不到,人工复盘只能读 transcript。
帧在流里、后端已入账、前端静默丢弃。 **成本** 小时(三处 fold + admin 镜像)。

---

## Y8. 预检索给 minicod 上游凭空加一整份调用量,且没有可用的关闭口

`turnLoop.ts:254` 每个取证轮 `await runPrefetch(...)`,对**所有**走 turnLoop 的剖面生效
(claw / smart_search / prism),不是只对 Run。`prefetch.ts:79` limit 默认 5、`:83` 超时默认 8000ms。

**后果** 上线当天 minicod 调用量按「取证轮数」多出一整份,429 / 熔断风险与账单同步上升
(seoenrich 热循环刚踩过 minicod 限流);首次取证轮的首 token 延迟最坏 +8s,用户体感「变慢了」。
受 R6 限制,临时关掉只能改 compose 重建容器。
> 注:R4 修好之前这条其实不发生(预检索恒失败,28ms 就返回)——**两条要一起安排**。

**成本** 小时(compose 透传 + 观察一天上游量)。

---

## Y9. 「三条造好没接线」原样未修

- **prism 的 Bash 是 DOA**:`backend/internal/prism/spec.go:200-222` 的 FeatureSpec 字面量里
  **没有 `AllowBash` 字段**(零值 false),而 `prismSessionOptions()`(`:81-104`)已按 allowBash=true 构造 ⇒
  执行器给了 Bash,`agentbridge/spec.go:263` 的 specDeny 仍把 Bash 三件套塞进 denyTools。
  用户会看到模型调 Bash 然后收到「该操作未获授权」,写作 feature 的统计/转档能力等于没有。
- **`engineSupported` 零读者**:`agent/src/tools/statsEngines.ts:44`,实测除自身与 `index.ts` 的
  fire-and-forget 调用外零 import。启动时真跑了 python 依赖探测、付了启动时间,结果只进日志;
  模型仍可能选一个容器里没装的统计引擎。
- **sci_draw / boltslides 无 MCP 白名单**:`scidraw/spec.go:146` 与 `boltslides/spec.go:142`
  只设 DisallowedTools,全文无 `AllowedMcpTools` ⇒ 76 个 minicod 工具全量灌进每轮
  (约 15–25K token/轮、破前缀缓存),且让 `hasRetrieval` 恒真 ⇒
  「做个 XX 进展的 PPT」被判成取证轮,模型可以用 SubmitAnswer 交一段散文 break 掉整轮,一个 deck 都不建。

**成本** 各小时级。

---

## Y10. `agent_runs` / `agent_saga_steps` 无任何清理策略,`request` 是 TEXT 原文

`0101` 建表无回收机制,`0102` 只有三条普通索引;`common/cleanup/` 下只有 cleanup.go 与
library_cleanup.go;`bridge.go:368` 的 StartJournalReaper 只回收僵尸 turn,不做保留期删除。
每个 Run 永久留 1 行(含用户完整诉求正文)+ 5 行 step,只增不减。
和已经无界的 `agent_turns/turn_events` 同一形状,而当前**零备份**。 **成本** 小时。

---

## Y11. backend 有界 FIFO 未做(方案 §6.2 三件必做只做了两件)

已做:`docker-compose.yml:365` / `prod.yml:347` 的 `init: true`;
`minicodClient.ts:109-141` MAX_INFLIGHT 信号量(排队在 try 之外,不计入熔断)。
未做:agentbridge 里 grep queue/FIFO/semaphore 无命中,`ws.go:859` 仍是 busy→overloaded 即刻回错。

**后果** 方案把 FIFO 认定为 7/29 付费用户流失事故的直接对症。满槽时用户照样手动重发,
而 Run 本身会占槽,这件事只会更频繁。 **成本** 小时~天。

---

## Y12. landings.ts 的 PRISMA / 双人独立筛选 / PICO 抽取是虚构产品承诺

`frontend-user/src/features/landing/data/landings.ts:557-565`「系统性综述作者」卡片,
三条 bullets:「PRISMA 流程图自动生成」「AI 抽取:人群·干预·结局」「双人独立筛选 + 冲突解决」。
全仓无对应实现(`citation_audit`/`CoverageReport` 零代码已证;PRISMA 流程图生成、
双人筛选工作流均无任何前后端痕迹)。

**后果** 三条今天没有一条做得到。「双人独立筛选」是系统性综述的方法学硬要求,
承诺它等于对目标人群做了一次可验证的虚假陈述——这类用户恰恰会逐条对照 PRISMA checklist 验收,
而且是最容易在学术社群被公开讨论的那种失望。
> 澄清:`claw/spec.go:202` 的 scope 步确实要求写 PICO,但那是给模型的 prompt 文本,不是产品功能。

**成本** 分钟(改文案)。

---

# ⚪ 可排期(能力债 / 优化项)

| # | 项 | 关键证据 | 影响 |
|---|---|---|---|
| W1 | **`step_incomplete` 跨包契约物理断裂** | `ws_serverside.go:347-358` 的 `serverEvent` 结构**没有 `Code` 字段**(实测);`:317` 只带 message;`engine.go:384` 靠 `strings.Contains(err.Error(), "step_incomplete")` 判定 | 即使 Phase 2 把 maxRounds 透传下去,分页仍不会生效。且**两侧机械测试同时假绿**:agent 侧只断言源码字符串,backend 侧用手造的串喂判据——真实路径永远产不出那个串 |
| W2 | **`StepDef.MaxRounds` 是死旋钮** | 生产方链条完整(`claw/spec.go:203-223` → `agentbridge/spec.go:293` → `adapter.go:27` → `engine.go:274`),消费方在 `adapter.go:99` `_ = maxRounds` 断掉;agent 侧 `TurnInput.maxRounds`(`types.ts:22`)全仓无赋值处 | 每步退回 24 轮。`template_mirror_test.go:62-63` 的失败信息**逐字描述了当前实况**却恒绿——「加了旋钮忘接线」的教科书样本。接收端(`turnLoop.ts:430`)已写好,缺的只是 backend→agent 一段线,工作量比听起来小 |
| W3 | **`ExitCriteria` 有结构无读者,`coverage.go` 不存在** | `template.go:41-57` 定义,全包 grep 除定义与注释外零引用;`ls backend/internal/agentrun/` 实测无 coverage.go;`agentbridge/spec.go` 的 RunStepJSON 也没有 exit_criteria 字段 | Step 完成判据仍是「执行器没返错就算完成」(`engine.go:291` 无条件 CompleteStep)。`RequireArtifact` 缺席尤其致命:`prompt.go:49` 要模型把成果写进 `run/steps/<key>.md`,引擎从不检查文件是否存在——模型回一句话就判 done,下一步读到空气。`template.go:47` 的注释指向一个不存在的文件 |
| W4 | **`turn_id` 恒 NULL,`OutputRef.Path/EvidenceIDs` 恒空** | `engine.go:291-294` 第三参传 nil、只填 Chars/Note;BeginTurn 唯一调用点在 `hub.go:1863`(WS pipe 路),server-side 全程不 BeginTurn | 方案 `:83` 宣称「四层唯一交点是 `agent_saga_steps.turn_id` ⇒ 计费/回放/admin 自动对齐,不需要新账」——那个交点是空的。Run 每一步在 admin 会话监控 / journal 回放里都不存在 |
| W5 | **peerreview 影子归位未做** | `grep RunTemplates` 全仓仅 5 处,唯一生产声明是 `claw/spec.go:196`;peerreview/spec.go 零命中;grep「shadow/影子」零命中 | 方案选 peerreview 当第一用户的理由是「已在生产验证、可对拍、零风险」,现在第一用户变成 claw 的用户可直达路由,顺序反了。Run 引擎在生产零真实负载,崩溃续跑/租约回收/让路闸全部未经真实流量验证 |
| W6 | **Run 上下文单调累积,且 prompt 对模型说了一件不成立的事** | `prompt.go:26-27` 写死「你看不到前面几步的对话内容」;实际 `handler.go:69` 用 `GetOrCreateSession` 复用用户当前 claw 会话,`engine.go:274` 每步都往同一 sessionID 发 | 模型被告知看不到但其实看得到 ⇒ 更倾向重复劳动;每步 input token 单调增长,长任务必然撞 compact 滚动摘要(而 compact 正是这批改动认定的「证据消失的地方」);用户闲聊也混进 Run 每一步 |
| W7 | **方案 §3.3 的四条机械测试一条没写,而这批代码就产生了两个死旋钮** | agentrun 测试只有 engine_test / repo_mysql_test / template_mirror_test;死旋钮实证见 W2、W3,另 `StepDef.MaxRetry` 被 mirror 测试断言「不许丢」却从未被引擎读取(`engine.go:225` 传的是全局 `defaultMaxRetry()`) | 某剖面认真写 `max_retry=2` 想止损,引擎照跑 8 次;写 `min_passages=3`,引擎压根不看。且测试营造了「有人用」的假象 |
| W8 | **Phase 0 的两道闸,自己的回归防线不在自动执行面内** | `scripts/check-evidence-mirror.sh:60-63` 的 `TESTS_REL` 实测仍只有 2 个文件;`.githooks/pre-push:45` 只调这一个脚本;`find agent/src -name "*.test.ts" \| wc -l` = **29** | 新增的 reserved / passages / stepPaging / researchState / deliveryGate 守卫**一个都不跑**。下次有人把 confine.ts 从 canonical 改回词法判定,除了 `bwrap.ts:174-208` 那条只 log.error 不阻断的自检外没有任何东西会红。按本仓库口径:27 条从不运行的规则 = 27 条不存在的规则 |
| W9 | **passages 抽取的字段形态从未对真实响应验证过** | `parse.ts:245-263` 要求同一对象上同时有正文键与论文体征;唯一测试数据是 `passages.test.ts:31-52` 手写的扁平结构;仓内无任何 search_snippets 真实响应留档 | 若上游是嵌套形态,抽出 0 段、`op:"fulltext"` 永不写、digest 的「可引原句」提示永不出现——**安静地**表现成「这次检索没返回段落」,无日志无红灯。旁证乐观(前端 `minicod-results.ts:277` 用同一组扁平键),但那是推断不是取证 |
| W10 | **chunk 级接地无法自举** | `has_fulltext` 唯一翻真路径是从 tool_result 抽 passages(`ledger.ts:414-427`),而 `parse.ts:223` 的 PASSAGE_TEXT_KEYS 只匹配 search_snippets 的正文字段;引擎预检索固定用 `search_papers`(`prefetch.ts:46`) | 不是死锁——skill 文档里有教 search_snippets 的破口,但 skill 是条件加载的。平台自动打的那一枪结构上不可能产生 passages,「模型开口前就看见有原句可引」这一格永远空着。Phase 0 花在 passages.jsonl 上的工程量对多数会话不产生收益 |
| W11 | **三个次级出口零消费方** | `passages.ts:102 passageEids` / `:108 countPassages` 只被自己的测试引用;`research_state` payload(`turnLoop.ts:971-988`)**没有任何段落计数** | 「检索到 N 条、其中 M 条有可引原文」这个 Phase 0 最想曝光的一格,在带外 chip 与 journal SQL 里都看不到。接地率前后对比只能进容器读文件 |
| W12 | **`run/` 不在保留区,产物是模型自己写的** | `confine.ts:66-70` 的 inReserved 只判 evidence;`evidence/paths.ts` 无 RUN_DIR;`bwrap.ts:122` 只 ro-bind evidence。方案 §5.1① 明写 `RESERVED_WRITE_SUBTREES = {"evidence","run"}` | 模型可以改写、覆盖任何一步的历史产物,重试时把前一步结论改掉,引擎既不校验也不留痕。「引擎独占只读」这半句在实现中被静默放弃、文档未同步 |
| W13 | **`DeclareInsufficient` 记的「还缺什么」是纯死数据** | 写:`registry.ts:1266-1273` append `op:"insufficient"`;读:`ledger.ts:165-196` 只 fold `read_mark` 与 `fulltext`,其余无 id/key 的行一律 continue;全仓零读取点 | 模型诚实声明「这块没证据、我试过 X 没用」后,下一轮和下次会话都读不到——同样的空洞被反复重试或无声忽略 |
| W14 | **evidence/run 产物的磁盘增长从未实测** | prod 才有 `./data/agent-sessions:/home/bun/sessions`(`prod.yml:389`),dev compose **没有这一行**;回收只有 `sessions.ts:388` 的 30 天 workdir TTL | dev 容器一重建 workdir 就没了,所以「连续跑 30 天占多少盘、ledger.jsonl 每次 ingest 全量重读会不会拖慢检索」上线前零数据。盘满不是弹窗报错,是 agent 写 workDir 失败 → Bash/导出/账本一起挂,30 天内 GC 不来救 |
| W15 | **minicod MCP inflight 排队无上限也无超时** | `minicodClient.ts:120-140`,MAX_INFLIGHT 默认 4,waiters 无界数组,acquireSlot 无超时 | 上游变慢时超出 4 个的调用无限期排队,只靠上层 turn 超时兜底;熔断器因排队不进 try 块**完全不会翻转** = 没有任何自动止血 |
| W16 | **Run 崩溃后最坏 ~17 分钟才恢复** | `engine.go:33-38` 租约默认 15min(有 `AGENTRUN_STEP_LEASE_SEC`);`:124-141` reconciler ticker **硬编码 2min 无 env**;`:258-268` 每 7.5min 续租 | 租约长是刻意的(误判成死会跑两遍 = 烧两份钱),影响比听起来小。真实痛点是体感:容器重启后 Run 静止十几分钟,而前端连「正在恢复」都显示不出来,看起来像卡死。生产可先调短 env |
| W17 | **Phase 3 装配层收口一项未动,且缺口在扩大** | `hooks.go` 全文 179 行只有 `:161 StandardHooks`,无 `StandardQuota`;`MountSessionRoutes` 除定义外全仓仅 `smartsearch/handler.go:66` 一处引用;`routes_user.go` 仍 449 行手抄 | 如期未做本身正常,要点是这次又新增了 4 条手抄路由(`:324-327`),缺口在扩大而不是收敛 |
| W18 | **三处小的「多报了一格没人接」** | ① `eventlog.go:50-52` 注释说「执行器一帧 evidence_appended 都不发」,而 `turnLoop.ts:272-282` 现在有生产方了——注释与代码反向;② `0102:19` 的 `idx_session` 是死索引,repo.go 无任何 where agent_session_id 的查询;③ `http.ts:218-222` 的 `GET /api/admission` 返回 mcp 快照,`engine.go:434-443` 的 body 结构体不声明该字段直接丢弃 | 各自危害小,但都会误导下一个人:照注释判断「流里只有一种帧」、以为「按会话查 Run 已通」、以为「MCP 压强可观测」 |
| W19 | **两处对方案的偏离已带理由但未回写文档** | `repo.go:255-256` 用 `saga_id LIKE 'run:%'` 而非铁律1 的 `<feature>:<runID>`(有正当理由:reconciler 要区分 Run 与 peerreview 的 saga,`:251` 有注释);`TurnInput` 未加 `stepBrief`(全仓零命中) | 下一个人照铁律1 改回去,reconciler 要么回收不到自己的步、要么去动 peerreview 的状态机——`repo.go` 注释里已写明这两种后果,但方案文档没更新 |
| W20 | **agent 镜像新增统计层依赖阿里云 PyPI** | Dockerfile 新增 python3-scipy/statsmodels/sklearn + pip lifelines==0.30.3,注释自称 +130MB | 运行期无影响,但 build 变慢变大;若构建机走 clash fake-ip 会拉包超时导致构建失败(本仓库 apt 镜像踩过同一坑)。**不要在上线窗口里第一次跑这一层** |

---

# Run 引擎的用户可见性 —— 最容易被忽略的一项

**它跑通了,但对普通用户 100% 不存在。这值得单独说,因为它同时是「白做了」和「危险」两件事。**

## 现状:三层全断

| 层 | 状态 | 证据 |
|---|---|---|
| 后端 API | ✅ 4 条路由已挂、已鉴权、默认开 | `routes_user.go:323-327`;`bootstrap.go:715-717` 无条件构造 |
| 模板 | ✅ claw 声明了 5 步 deep_research | `claw/spec.go:196-224` |
| **带外进度帧** | ❌ **`run_state` 全仓只有文档提到它** | grep `run_state`(*.go/*.ts/*.tsx/*.sql)只有 3 处命中,全在 `docs/research-kernel-architecture-2026-08.md:117/118/368/452`。backend、agent、frontend 三侧零命中 |
| **前端 UI** | ❌ **一个字节都没有** | `grep -rn "claw/runs\|run_state\|RunProgress" frontend-user/src miniprogram` = **零命中**(实测);方案要求的 `shared/components/chat/RunProgressCard.tsx` 不存在 |
| **产物可见性** | ❌ 正文只落 agent 容器的 `run/steps/*.md` | `ws_serverside.go:258-313` 只处理 13 种帧,**没有 artifact、不写 journal**,自开 WS 绕过 hub;`bridge.go:918` 历史读优先 journal ⇒ journal 里没有的轮次前端永远看不到 |

## 后果(三条,一条比一条难察觉)

**① 发布的用户可见价值 = 0。**
用户没有任何入口创建 Run,没有进度显示,没有取消按钮。唯一触达方式是手写 curl。
Phase 2 承诺的「busy 从故障源变成进度条」不存在。

**② 它不是惰性的,是一条没人看守的暗门。**
路由已鉴权挂载 + 默认开启 + 零配额(见 R3)= 只要有人(或脚本)照着 curl 一发就落进那个洞,
而因为界面上看不见,发现异常只能靠 `docker logs | grep agentrun`。
「没有 UI」在这里不是安全措施,是**盲区**。

**③ 反向污染用户的正常对话 —— 这条最隐蔽。**
`handler.go:69` 用 `GetOrCreateSession` ⇒ Run **复用用户当前的 claw 会话,不新开**。
于是 5 段【平台编排 · 深度研究任务】提示词与全部输出都进了**同一个 agent 会话的 messages**。
用户下一句闲聊会带着他从没见过的几万 token 上下文;而 backend 侧 journal 无记录、
admin 会话监控也看不到 —— 出问题时**无从复盘**。
表现形式会是:「AI 突然自己在那儿跑了几十轮」或「它在回答一些我没问过的东西」。

## 补齐的代价(为什么不建议在这次窗口里做)

方案 `:452` 已明确 `run_state` 是**第 3 个带外声明帧型**,加它必须**同时**改:
三份 fold.ts(claw/prism/search)+ admin 镜像 + backend `classifyJournalEv` +
照抄 `journalOrdering.test.ts` 的顺序断言(**终帧必须排在 run_state 之后**,
否则 hub 的 `tid!=0` 守卫会静默吞掉终帧)。
这不是「补一个 emit」,是一次跨四处的同步改动 ——
本仓库「fold 有四份、单边修复等于没修」的老伤正长在这条路上。

## 建议

**这次部署把 Run 引擎默认关掉**(`AGENTRUN_ENABLED` 改成 opt-in),
代码照常进仓。Run 的完整上线作为独立一批,那时一次性做齐:
配额闸 + `llmusage.WithCall` + maxRounds 透传 + `run_state` 帧四处同步 + RunProgressCard +
先在 peerreview 影子跑一段。
现在这个状态上线,是**承担全部风险、收获零价值**。

---

# 我一度以为是问题、核实后不是

保留在这里,免得下次再查一遍。

### ✅ 内网收紧 —— 已经做了

`docker-compose.yml:619-629` 定义三张网:`scholar-network`(数据面)、
`scholar-agent-net`(`internal: true`,无 NAT)、`egress-net`(agent → 公网 NAT)。
`:452-453` backend 同时接后两张;`:388-393` 的 agent 服务块注释明确
「agent 只在 scholar-agent-net + egress-net,**不**接 scholar-network → 碰不到 mysql/redis/minio」,
且 `:393-395` agent 不再向 host 映射端口。`:455` 记录原 egress-proxy(tinyproxy)容器已删除。
bash 工具侧另有 bwrap 兜底:`bwrap.ts:72 --unshare-all`(含 net)、`:133` net:none 分支。
**以「agent 容器能否触达内网数据面」这个口径,措施已在 compose 层落地,不应再挂在缺口清单上。**
(若「内网收紧」原指别的东西——如历史审计记的 featuretool webhook SSRF——那是另一条独立项,见未确认。)

### ✅ 迁移重放事故风险 —— 这次不成立

`0101` 是纯新增表(`CREATE TABLE IF NOT EXISTS`),`0102` 全是幂等
`CALL add_index_if_not_exists`,且**刻意不建任何 UNIQUE**(文件头注释)。
关键是:`git status` 里 `docker/` 下只有这两个 untracked 文件 ⇒ **没有修改任何老迁移文件**。
0.0.66 那类「老迁移重建唯一索引撞上后来的数据」的事故形态在这次不适用。
(但迁移**到不到得了位**是另一回事,见 R6③。)

### ✅ Phase 0 的证据保留区 —— 两道闸都真做实了

`confine.ts:88-96` 用 **canonical 路径**判定(挡住了 `ln -s evidence x` 的词法绕过);
`bwrap.ts:122` 用 `--ro-bind`(非 `-try`)+ mkdirSync fail-closed 遮蔽 jail 内写面;
还配了真 jail 启动自检(`bwrap.ts:174-208`)。
chunk 级 passages 落地了完整一条链:`parse.ts:245` 抽段 → `ledger.ts:413-427` 落 passages.jsonl
并写 `op:"fulltext"` → `render.ts:121-129` 在 digest 里告知模型 → `registry.ts:1104` 的
EvidenceGet fields=passages。markRead 也已接到 `registry.ts:31/33` 的 Read/ReadDocument。
**这是这批里质量最高的部分。**(唯一遗憾见 W8:它自己的回归防线不在自动执行面内。)

### ✅ maxRounds 的执行器接收端 —— 已经写好了

`agent/src/turn/types.ts:22 maxRounds?`、`turnLoop.ts:430 round >= (input.maxRounds ?? MAX_TOOL_ROUNDS)`、
`:437` 发 `step_incomplete`。**断的只有 backend→agent 传输那一段**
(`ws_serverside.go:78-84` 签名无该形参,`agent/src/server/ws.ts` 全文无 max_rounds)。
Phase 2 的剩余工作量比「未做」听起来小得多。

### ✅ Run 崩溃恢复不是「静默失效」

撞轮上限的步仍会重排队、仍能续跑(`engine.go:285` 通用失败分支)。
问题只是日志里记成 `step failed, requeued` 而不是 `step paged out`,
运维分不清「正常分页」和「真的挂了」——而这恰是 Run 上线第一周最需要分辨的两件事。
功能性上不是断的。

---

# 未确认(两边都没证据,不写成 finding)

1. **MiniMax 上游是否真的 402 余额不足** —— 本地 backend 与 agent 日志 grep
   `402 / insufficient / 余额` 均零命中;生产状态无法从仓库确认。
   本地 dev DB 的三行 `enabled=1, user_selectable=1` 是实测的(见 Y2),但**生产库未查**。
2. **服务器上 backup cron 是否已被人手工装过** —— 仓库里查不到。
   `install-backup-cron.sh` 存在但 `deploy.sh` 不调它;prod-audit 记「从未安装」但那是 07-31 的状态。
   **部署前请直接上机 `crontab -l | grep SCHOLAY_BACKUP` 确认一次。**
3. **生产的 agent_models 表是否与本地 dev 一致** —— 未查。
4. **「内网收紧」若原指 backend 侧的出口 SSRF**(历史审计记过 featuretool webhook SSRF)——
   那是一条独立项,需要先定义清楚再核,本次未核。
5. **search_snippets 真实响应的字段形态是嵌套还是扁平** —— 见 W9,仓内无留档,
   前端 `minicod-results.ts` 的用法是旁证不是取证。

---

*本文档由逐文件核对生成,不基于文档描述下结论。若与 `docs/research-kernel-architecture-2026-08.md`
的阶段表冲突,以本文的 file:line 为准 —— 本仓库文档多次与代码不符。*
