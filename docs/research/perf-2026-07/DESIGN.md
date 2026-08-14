# Scholar 性能优化方案设计(2026-07)
> ## ⚠️ SUPERSEDED — 本文档中关于 `40-sync-site.sh` 的方案(finding 1 / finding 2)已于 2026-07-27 作废
>
> 当时的处方是「cp 之后 touch 刷新 mtime,把保留窗口从构建时间纠正为部署时间」。
> 那确实修掉了当时的白屏 P0,但**判据本身选错了维度**,后续暴露出两个新问题:
>   1. 体积 = 保留天数 × **构建频率**。同一份配置在开发机(6 次/天)是 848MB,
>      在生产(0.4 次/天)是 25MB,差 30 倍,不可预期也不可控。
>   2. mtime 根本不表达"第几代",所以才需要那段 695 次 fork 的 touch 循环去伪造它 ——
>      整个补丁的存在只是为了给一个错判据打补丁,而它本身也有失手路径。
>
> **现行实现改用「保留最近 N 代 manifest 的可达性」判据**:
> 体积 = N × 单次构建,与频率解耦;不看时间,不需要 touch。
> 旋钮从 `ASSET_RETAIN_DAYS` 换成 `ASSET_KEEP_GENERATIONS`(默认 5)。
> 回归用例见 `scripts/test-sync-site.sh`(41 条,在 nginx:alpine 里跑)。
>
> **别照本文档正文把 touch 或 ASSET_RETAIN_DAYS 加回来。** 正文保留仅作决策留痕。


> 本文基于 [性能审计报告](REPORT.md)(86 条发现,52 条经对抗验证)产出**实施级优化方案**。
> 方法:8 个设计簇由资深设计员**亲读当前真实代码**逐条确认问题仍在、定位到函数,再设计「最小可行改动 vs 理想重构」两档方案(含改动清单、代码骨架、备选、风险对照仓库铁律、验证方式、依赖顺序);最后由跨切面评审员检查冲突/依赖/更大统一改法/踩雷风险。
> 共 **76 个实施方案 + 20 个跨发现统一改法**。

> ⚠️ 本文是**设计**,尚未改动任何代码。落地前请先读「零期协调动作」与「踩雷清单」。

---

## 一、全局落地路线图

### 分期总览

分四期。

第 0 期(协调动作, 开工前, 半天): 集中发迁移号(0071 agent 索引/分区合并、0072 prism error_kind、0073 feature_tools 索引); 拍板 agent 容器内存目标(1.5G vs 3-4G, 看宿主余量), 它决定后续并发阈值; 拍板 workspace GC 语义(删整会话 vs 只删大文件 vs 会话数硬帽)与保留期。

第 1 期(P0 止血, 当天~1 天, 全是 S 且互不依赖): frontend-deploy finding1 的 touch 单行修复(拆定时炸弹, 最高优先); bridge-hotpath B(batcher 锁外落库, 平台级流式冻结最大敞口)+ #21(writeAgent WriteDeadline)+ #5(关 journal validator, 纯 env); agent-container 发现1(Bash readCapped)+发现8(math 串行队列)+发现12(deleteSession 兜底); backend-mw-infra #6/#8(nginx WS 正则补 claw)+#9(限流键改 $remote_addr)。

第 2 期(P0 容量闸 + 时间敏感, 1-3 天): agent-container 发现7(容器内并发信号量, 阈值按第 0 期内存定)+ backend-mw-infra #7 内存扩容(同一决策两处落地); agent-container 发现11(workspace GC, 依赖发现12); bridge D(agent_turn_events 分区滚动 + #10/#14 索引, 须在 2026-10 前补分区); prism-compile 主重构(runCompile 信号量+缓存前置+error_kind); backend-mw-infra 三层超时对齐(#2/#3)+#1 BodyLimit。

第 3 期(P1 用户可感知渲染/延迟): frontend-render-data 第一批(发现1 thinking 合并 + 发现8/10 轮询终态 + 发现9 下载长超时 + 发现13 PDF ETag[与 prism #3a 合并]+发现7 防抖)与发现2 同批上线(越聊越卡需 1+2 叠加根治); bridge-hotpath A(replayBuf 增量)→#4; miniprogram 第一批(#2/#3/#4)后 #1; frontend-bundle 按其自定五批(先死代码→vite.config→渲染器→lazy)。

第 4 期(P2 清理, 可并行/择机): 各簇 P2 小手术(附件双拷、SSE 直通、HTTP 池、死代码、EffectiveTier 缓存 E、可观测性 #12/#13/#15、fork-data 归档对账 #13); 观测项(慢日志/SLOWLOG)建议在第 2 期前先落, 反哺并发/索引定档。

### 速赢清单(投入 <1h,收益明显)

投入<1h 且收益明显、零/低依赖的速赢:
- frontend-deploy finding1: 40-sync-site.sh cp 后对本次构建清单 touch 刷新 mtime(单行, 删掉即回滚)——拆全站 404 定时炸弹, 优先级压倒一切。
- bridge-hotpath #5: .env 关 AGENT_JOURNAL_VALIDATE(纯配置)——立减 60s 周期全量比对负载 + 消除必产的假阳性 ERROR 噪声。
- backend-mw-infra #6/#8: nginx/conf.d/user.conf:48 WS location 正则加入 claw(一词)——claw WS 不再落 60s 通用超时被掐, 一次 nginx reload 生效。
- backend-mw-infra #9: nginx.conf:60 限流键改 $remote_addr——堵住 X-Real-IP/XFF 伪造绕过限流(先确认线上无可信 CDN/LB, 直连拓扑下安全)。
- agent-container 发现1: bashTool.run 复用现成 readCapped 有界化 stdout/stderr——堵单条命令 OOM 整个多租户容器, 复用已有代码。
- agent-container 发现8: math 渲染套 mermaid 同款串行队列——消除『一次公式卡所有用户流式』, 照抄现成模式。
- agent-container 发现12: deleteSession 重启后走 backend DeleteSession 契约兜底删 workspace——堵孤儿目录, 且是 workspace GC 的前置。
- frontend-render-data 发现1: appendStreamMessage 合并 thinking 帧(对齐已有两类帧的合并)——直接降会话内 O(N²)。
- frontend-render-data 发现8/10: refetchInterval 加终态谓词——failed/终态不再永久轮询, 两处共用同一范式。
- frontend-bundle #8/#9/#10: 删死代码(peer-review-record 整目录 88KB 等)+ 卸 react-table/react-select 死依赖——纯删除一次 build 验证, 给后续腾干净基线。

---

## 二、零期协调动作(任何 DB/nginx/compose PR 开工前必做)

多个设计簇会改到同一批共享资源,若并行落地会文本冲突或覆盖。开工前先做这些协调:

### 2.1 跨簇冲突与协调

**冲突点**:stability-agent-container(0071_agent_sessions_gc_index)、stability-bridge-hotpath(D: agent_turn_events 分区 + #10 admin 索引)、prism-compile(0071_prism_compile_error_kind_fields)、backend-mw-infra(0071_feature_tools_list_indexes)

- 问题:四个簇都要新建迁移文件, 各自默认下一个编号是 0071。实测当前最大编号是 0070, 迁移系统是单文件编号递增按序重放, 四个 0071 会直接撞名/覆盖, 且谁先合并谁占号。
- 协调:由一个人集中发号: 0071=bridge D 的 agent_turn_events 分区滚动(且把 backend-mw-infra #10 的 admin 索引和 agent-container 的 last_accessed_at 单列索引都并进这一个『agent 表索引/分区』文件, 因为都动 agent_sessions/agent_turn_events)、0072=prism error_kind、0073=feature_tools 列表索引。合并 agent 侧三处索引/分区到一个迁移能省两个编号且减少 schema-sync 往返。落地前所有 PR rebase 时以实际已占编号为准, 不硬编码 0071。

**冲突点**:stability-agent-container(发现11 新增 cleanIdleAgentSessions)、stability-bridge-hotpath(D 新增 cleanAgentEventPartitions)

- 问题:两簇都往 cleanup.go 的 CleanupService.Start() 里 append 新的 safego.Go(runDaily(...)) 任务, 改同一函数; 且现有任务全挤在 04:15~04:45 一个窗口, 新任务若也排 04 点会加剧启动后同一时刻的批量删除尖峰(与 MySQL/MinIO 共享宿主分区, 正是 agent-container 担心的磁盘打挂窗口)。
- 协调:两个任务合并进同一次 cleanup.go 改动(一个 PR 或明确先后), 分配互不重叠的时段(如 agent 会话 GC 05:10、event 分区滚动 05:40), 避开现有 04 点簇。runDaily 用 time.Now() 本地(docker 钉死北京)排程, 不要引入 UTC。

**冲突点**:stability-agent-container(发现7: agent/src/server/ws.ts + 新增 admission.ts 进程级信号量)、backend-mw-infra(#7: backend/internal/agentbridge 并发准入闸 + docker-compose.prod.yml:376 内存扩容)

- 问题:两个簇各自设计『agent 并发准入闸』, 但在不同层: 一个在 agent 容器内(最贴近资源, 能看真实内存/turn), 一个在 backend agentbridge(看不到容器内实时内存)。同时上会双重限流——backend 先拒一批、agent 内再拒一批, 用户拿到两种不同的 quota/busy 语义, 且阈值难对齐。
- 协调:准入闸只保留一处, 放 agent 容器内(agent-container 发现7 的 admission.ts), 它能读真实内存/turn 数。backend-mw-infra #7 只做 docker-compose.prod.yml 的内存/CPU/pids 扩容(1.5G→3-4G, 视宿主余量), 不再单独实现 backend 层准入闸; backend 只需把 agent 返回的 busy/容量拒绝透传成前端可感知的排队提示。

**冲突点**:stability-bridge-hotpath(D: agent_turn_events 按 created_at RANGE 分区 + DROP PARTITION 保留期)、backend-mw-infra(#14: eventlog_store.go ReadRecentTurns 按 turn_id 过滤无分区裁剪 + filesort)

- 问题:同一张 agent_turn_events: D 要按 created_at 加月度分区并滚动 DROP; #14 指出读查询按 turn_id 过滤/排序, 按 created_at 分区永远裁剪不到(每次查全分区)。两个方案对同表的物理组织假设互相拉扯——单加 created_at 分区并不能加速 turn_id 查询, 单改 ORDER BY 也不解决无界膨胀。
- 协调:合并成一次『agent_turn_events 物理设计』: 保留 created_at 分区做 TTL 滚动删(解决无界), 同时给 (session_id, turn_id) 或 turn_id 建复合/二级索引解决 #14 的 filesort; 明确读查询用 turn_id 索引、清理走分区裁剪, 两者不冲突而是互补。由 bridge D 的迁移一并落这两个索引/分区。

**冲突点**:frontend-render-data(发现13: backend storage.go:ServeObject 加 ETag/304)、prism-compile(#3a: backend prism handler.go:GetPDF 加 ETag/304)

- 问题:两处独立给 PDF 回传加缓存头/ETag, 手法(ETag+304 vs immutable+max-age)在两个簇的待拍板里给了不同倾向, 若各写各的会出现两套不一致的 PDF 缓存语义。
- 协调:抽一个共用的 conditional-GET 助手(基于 MinIO ObjectInfo 已有的 ETag), storage.ServeObject 与 prism GetPDF 都调它, 统一走 ETag+304(保守稳妥, 避免 immutable 靠 ?v= 换 URL 的额外约定)。prism 的 OpenLatestPDF 已能回传 ObjectInfo.ETag, 直接复用。

**冲突点**:frontend-bundle(SharedRefactor 1: vite.config.ts manualChunks 函数式重写)、frontend-bundle(#8/#9/#10 死代码死依赖清扫)、frontend-render-data(多处组件 memo/lazy 改动)

- 问题:vite.config manualChunks 重写与死代码清扫都动构建产物; 若先重写分块再删依赖, table chunk 会引用已删包报错。且 frontend-render-data 的组件级改动与 bundle 的 lazy 边界都改同批 feature 文件(prism/claw), 同时改易冲突。
- 协调:严格按 bundle 簇自定的批次: 先删死代码死依赖(拿到干净基线)→再重写 manualChunks→再上 lazy 边界。frontend-render-data 的组件 memo 改动排在 bundle 的 lazy 边界之后或错开文件, 避免同一 prism/claw 文件并行改。

### 2.2 跨簇强依赖(A 必须先于 B)

1) 迁移编号集中发号必须最先做(在任何 DB 相关 PR 开工前), 否则四个 0071 互撞。2) agent 容器内存扩容决策(backend-mw-infra #7, docker-compose.prod.yml:376)是 agent-container 发现7 并发阈值(MAX_CONCURRENT_TURNS)标定的前置——先定内存 1.5G 还是 3-4G, 才能定安全并发数, 顺序不能反。3) agent-container 发现12(deleteSession 重启兜底)必须先于发现11(workspace GC), 否则 GC 删了 workspace 但重启后删除路径仍静默失效留孤儿(簇内已声明, 全局也成立)。4) prism-compile error_kind 迁移(0072)必须先于前端 auto-fix 按 error_kind 分支的改动。5) bridge-hotpath 统一改法 A(replayBuf 增量结构)必须先于 #4(迟到补帧折叠, 依赖 A 的折叠原语)。6) bridge D 若给 0000_utils.sql 新增 add_partition_if_not_exists 存储过程, 该 utils 改动要与分区迁移同批落地(utils 每次重放前置执行, 分区迁移依赖它)。7) 可观测性(backend-mw-infra #12/#15 慢日志/SLOWLOG 基线)先落地能反哺 #7 并发阈值与 #11/#14 索引验证——观测先于扩容定档。

---

## 三、跨簇更大统一改法(避免各簇各自打补丁)

最大的跨簇统一点是『agent 容器容量治理』被三个簇各自打补丁: agent-container(容器内内存/磁盘/CPU 无界)、bridge-hotpath(agent_turn_events 表无界 + #7 seed 重发)、backend-mw-infra(#7 内存上限 + 远期准入闸)。它们其实是同一个目标——让 1.5G 单容器多租户活下去——却分散在三处设计, 已经产生了两个重复的准入闸和一张表的两套物理假设(见 conflicts)。建议合成一条『agent capacity』主线由一人统筹: 单一准入闸(容器内)+ 单一内存扩容决策 + 单一会话/事件生命周期(cleanup.go 里 agent 会话 GC + event 分区滚动同批, workspace GC + deleteSession 兜底同批), 阈值参数互相引用而非各写各的。

第二个统一点是『三端流式 O(N²)』: agent-container 发现5(Write 流式全量重扫)、bridge-hotpath #1/#12(replayBuf coalesce 每帧 re-marshal)、frontend-render-data 发现1(thinking 帧不合并)+发现2(fold 每帧重建)、miniprogram #1(每 flush 整轮重 parse)、frontend-bundle #1(MarkdownRenderer 重库同步)。这是同一个反模式(流式过程对累计全文重处理)在 agent/backend/web/小程序四层的复发, 但跨 Go/TS/微信三种运行时, 无法一次代码改掉。可行的统一是立一条『流式增量纪律』检查单(帧只解析一次向下传、累计缓冲用增量结构/偏移续扫、渲染 diff 下沉到段级、重库懒加载), 让四层各自的修复对齐同一原则、code-review 用同一把尺子, 避免只堵两类帧漏第三类(render-data 发现1 正是这么漏的)。

第三个较小的统一是 cleanup.go 的 daily-task 与 PDF conditional-GET 助手(见 conflicts), 都是『多簇各写一份、其实该抽一份共用』。

---

## 四、踩雷清单(对照仓库五大已知事故)

1) 【backend 重启重复扣费/重触发 AI】prism-compile #3b RequeueStaleCompiles 在启动时重排 queued 行——这是重启雷区的翻版: 若重排会重新触发编译且编译失败又被前端 auto-fix 回喂成 AI 轮, 重启可放大成 AI 风暴/重复扣费。必须做成幂等: 只对确非终态的行重排、重排不产生新配额扣减、且带在途去重。agent-container 发现12(deleteSession 重启兜底)、cleanup.go 新 GC 任务是同一类重启敏感面, 删除类幂等(删两次无害)风险较低但排程要用本地时区。

2) 【前端 CPU 风暴复发】frontend-render-data 发现2(fold memo + useAgentSocket 返回值每 render 变)、发现3(Prism useDeferredValue+memo)、bridge-hotpath E(EffectiveTier 缓存要稳定引用)——凡是给流式/编辑器加 memo 的地方, 若把每帧 new 的数组/对象(data??[])放进 useEffect/useMemo 依赖, 会直接复发已出过的打满事故。铁律: 依赖里只放稳定引用, 数组用 useMemo 固定。useAgentSocket 返回值/回调必须 useCallback/useMemo 稳定化, 否则 memo 全穿透。

3) 【bind-mount 镜像层缓存】frontend-deploy 整簇改 40-sync-site.sh + assets 回收, frontend-bundle 改 vite.config/index.html——前端 assets 是 bind-mount + 镜像层缓存, 改动可能需 --no-cache/force-recreate 才生效, 否则会验证到旧产物误判『没改对』。frontend-deploy 的 touch 修复本身也依赖部署时 mtime, 部署脚本改完必须实际重建容器验证而非只看代码。

4) 【时区跟随宿主】cleanup.go 新增的 agent 会话 GC / event 分区滚动用 runDaily(hour, minute) 排程, agent-container workspace TTL 用 last_accessed_at 比较——都必须用 time.Now() 本地(docker 钉死北京), 不能引入 UTC, 否则 0 点/保留期边界会漂 8 小时, 重演 0 点未重置事故。bridge D 的月度分区边界也要按北京。

5) 【迁移非幂等】四个新迁移(agent 索引/分区、prism error_kind、feature_tools 索引)必须全部走 add_column_if_not_exists/add_index_if_not_exists, 中文注释 utf8mb4, 绝不 DROP TABLE。bridge D 的 DROP PARTITION 不可回滚, 保留期要取保守值(建议 ≥90 天)且分区滚动存储过程本身要幂等(add_partition_if_not_exists)。

6) 【配额链路】bridge-hotpath E 的 EffectiveTier 缓存(30s TTL)对『到期回落是懒判定』的场景, 缓存窗口内可能延迟拦截; 且所有 tier 写入口(兑换码/admin 直授/订阅开通/到期回落)必须能主动 invalidate。走 internal/vip 既有链路, 不要另造 NewRedisDailyCap(从不存在)。

---

## 五、各簇详细方案


---

### 簇:Agent 容器 OOM 与磁盘/内存无界增长 `stability-agent-container`

**整体判断**:核心矛盾:一个 1.5G / 2CPU 的 Bun 单进程多租户容器(scholar_agent)同时承载 claw/smart-search/prism/peerreview 四个 AI feature 的全部并发,却几乎没有任何「资源天花板」——内存(会话 Map 只增不减 + Bash/子进程无界缓冲 + base64 图常驻)、CPU(math 渲染 + O(N²) 流式扫描直接跑主事件循环、无并发闸)、磁盘(会话 workspace 零 GC)三条线全部无界。审计实测单会话峰值 ~765MiB,2 个重会话即打爆内存;prod 的 SESSIONS_ROOT 是 `./data/agent-sessions` bind-mount,与 MySQL/MinIO 共享宿主分区,磁盘线性增长会连带打挂数据库。

总体策略分三条主线,可独立分期落地:
1) 「有界化」所有无界读取/缓冲:Bash 输出(复用现成 readCapped)、子进程、流式扫描——最小改动、最高收益,先上。
2) 「会话生命周期」统一治理:内存 Map 淘汰 + workspace 磁盘 GC + 删除路径兜底,这四个发现(2/6/11/12)本质是同一套 lifecycle 缺失,一次设计到位。
3) 「全局准入 + 主循环卸载」:进程级并发信号量 + 把 CPU 密集段(math/mermaid)串行化/队列化,给 1.5G 容器兜住尖峰。

铁律对照:不碰 gin.Gzip;新迁移走 0071 幂等单文件 utf8mb4;agent jsonl 仍黑盒(GC 只删 workspace 目录 + 走 backend 既有 DeleteSession 契约,不读 jsonl);workspace 产物耐久真源已在 MinIO+DB,回收安全(compose 注释自证)。

#### 统一改法(一次解决多个发现)

**◆ A. 会话生命周期统一治理(内存淘汰 + 磁盘 GC + 删除兜底)**
- 一次解决:发现 2、6(内存 Map 无淘汰,重复条目)、11(workspace 磁盘零回收)、12(重启后删除静默失效 → 孤儿目录)
- 设计:发现 2 与 6 是同一处代码(sessions.ts:96 `const sessions = new Map`)的重复报告,合并处理。设计四层:

(1) 内存层淘汰 —— 给 SessionMeta 加 `lastActiveAt:number`(每次 onMessage / handleUserMessage 触碰即刷新)与一个进程内 `activeWs:Map<sid,count>`(onOpen++/onClose--)。在 sessions.ts 起一个 `setInterval` 定期(如每 5min)扫 sessions,驱逐「lastActiveAt 超过 IDLE_TTL(默认 30min)且 activeWs 无订阅者」的 meta —— 真源在 backend journal,重连 seed_history 自愈,驱逐纯内存无损。再加 `MAX_SESSIONS` 硬帽(如 200),超帽按 lastActiveAt 升序 LRU 挤出最久未用。驱逐只 `sessions.delete(sid)`,**绝不删 workDir**(磁盘回收归 GC 层)。

(2) base64 图瘦身 —— 在 meta.messages 落 history 时(handleUserMessage push 之后),把 image 块换成占位文本 `[图片附件 @path]`,原图留 cwd 文件按需重读(attachments.buildUserContentWithImages 本就从 cwd 读);wire 侧发送仍走 limitLiveImages 现读现发。这样常驻内存的 history 不再压 6MB/张 base64。

(3) 磁盘 GC(backend 驱动,权威侧) —— 在 internal/common/cleanup 加 `cleanIdleAgentSessions`:按 `agent_sessions.last_accessed_at < now-90d` 选行,逐个调 `FeatureBridge.DeleteSessionByID`(既删 DB 行又经 agent DeleteSession 删 workspace,契约现成),batch + 间隔(仿 batchDeleteByCreatedAt)。经 CleanupService.runDaily 每天 05:30 跑一次。

(4) 删除兜底(修 12) —— sessions.ts deleteSession 在 Map 未命中时不再直接 return false,而是回退按约定路径 `rm(safeSessionDir(SESSIONS_ROOT, sid))` + `rm(...+'.skills')` 再 return true;http.ts DELETE 据此不再回 404。sid 已过 validSessionId+safeSessionDir 双重防穿越,安全。另在 agent 启动时跑一次 orphan sweep(列 SESSIONS_ROOT 一级目录,对不上 backend 活跃集的冷目录延迟清)可选。

**◆ B. 全局资源准入 + 主循环卸载(并发信号量 + CPU 密集段队列化)**
- 一次解决:发现 7(无全局并发准入,2 重会话打爆容器)、8(math 同步渲染阻塞所有用户流式)
- 设计:两件配套:

(1) 进程级并发信号量 —— 新增 src/server/admission.ts:一个 `Semaphore(MAX_CONCURRENT_TURNS)`(默认按 1.5G/765MiB 峰值算 ≈2,env 可调)。handleUserMessage 进 runTurn 前 `await acquire()`,finally `release()`;拿不到即刻回 `error{code:busy,retryable:true,message:'服务繁忙,请稍候重试'}`(前端已有 busy 语义)。标题生成 / 记忆抽取 / math / mermaid 走**独立低优先级信号量**或复用队列,不与主 turn 争配额。

(2) math 渲染队列化 —— 完全照抄 mermaid.ts:33 的 `let queue = Promise.resolve()` 串行化模式套到 renderMath(math.ts:54),把 `mjDoc.convert` + `resvg.render()` 这段同步 CPU 关进串行队列;顺带每 N 次或定期重建 mjDoc(liteAdaptor 文档状态可能累积)。理想档:把 CPU 段丢 Worker 线程,但串行队列已消除「一次公式卡住所有人」的主症状,先上串行。

#### 逐条实施方案

##### [🔴 P0 · S(<1h)] 发现 1:Bash 工具 stdout/stderr 无界缓冲进内存,单条命令可 OOM 整个多租户容器(agent/src/tools/registry.ts:296)

- **代码确认**:确认仍在。registry.ts:296-300 bashTool.run 用 `new Response(proc.stdout).text()` / `new Response(proc.stderr).text()` 一次性拉全部输出进 JS 堆,301 行 clearTimeout 后 302 行才 `.slice(0,60_000)`。同文件 315-345 行的 readCapped(8MB 硬帽 + 到帽 kill)已经为完全相同风险的 runConverter 写好并投产,bashTool 却没用它——纯粹是历史遗漏。timeoutMs 默认 120s、最长 300s(288 行),期间输出多少缓冲多少,零字节上限。
- **改动点**:agent/src/tools/registry.ts:bashTool.run(约 296-303 行)
- **做法**:最小可行改动(推荐):直接复用同文件已有的 readCapped。把
```
const [out, errOut, code] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);
```
改成
```
const BASH_STDOUT_MAX = Number(process.env.EXECUTOR_BASH_STDOUT_MAX || 4*1024*1024);
const BASH_STDERR_MAX = 64*1024;
const outP = readCapped(proc.stdout, BASH_STDOUT_MAX).then(r=>{ if(r.truncated){try{proc.kill()}catch{}} return r; });
const errP = readCapped(proc.stderr, BASH_STDERR_MAX);
const [out, errOut, code] = await Promise.all([outP, errP, proc.exited]);
```
到帽即 kill 子进程(让 proc.exited 解析),truncated 时在 body 末尾加 `\n[输出已截断]` 提示。302 行的 `.slice(0,60_000)` 最终截断保持不变(它是给模型的可读上限,与内存帽正交)。readCapped 已导出在同文件,零新依赖。
- **备选**:备选:给 spawn 设 maxBuffer——Bun.spawn 无该选项,不可行。备选:降 timeout——治标不治本,慢速大输出照样爆。用 readCapped 是唯一与既有代码对齐的正解。
- **风险**:极低。readCapped 已在 runConverter 生产验证。唯一行为变化:病态大输出的命令现在会被 kill 且标记截断——正是想要的。正常命令(输出 < 4MB)逐字节不变。注意 stderr 帽设小(64KB)避免正常报错被过度截断。
- **验证**:构造 `bun run` 一条 `yes | head -c 500M` 或 `cat 大文件` 的 Bash 调用,改前观察容器 RSS 飙升 / OOM,改后 RSS 平稳 + tool_result 带截断标记。docker stats scholar_agent 看内存曲线。单测:mock 一个吐 >4MB 的 ReadableStream 验证 truncated=true 且 body 有上限。
- **依赖**:无(可独立最先落地)

##### [🔴 P0 · L(1-3天)] 发现 11:会话 workspace 磁盘零回收,claw/smart-search 多会话永久保留 + 无每用户会话数上限,磁盘线性增长直至打满与 MySQL/MinIO 共享的宿主分区(agent/src/server/sessions.ts:107)

- **代码确认**:确认仍在。sessions.ts:103-108 每会话 `mkdir(workDir)`,此后附件/references/Bash 产物全落里面。全 agent/src grep cleanup/ttl/evict 只命中内存 context-budget,无磁盘 GC。prod compose 确认 `./data/agent-sessions:/home/bun/sessions` 是宿主 bind-mount(与 data/mysql、data/minio 同分区),永久累积。backend 侧 agent_sessions 表有 last_accessed_at 且 CleanupService 已有 runDaily 框架 + DeleteSessionByID 契约,GC 落点现成。
- **改动点**:backend/internal/common/cleanup/cleanup.go(新增 cleanIdleAgentSessions + Start 挂 runDaily);backend/internal/agentbridge/bridge.go(可能加一个按 last_accessed_at 批量列 idle 会话的 repo 方法);backend/cmd/server/bootstrap.go(注入 feature 列表给 cleanup);docker/mysql/migrations/0071_agent_sessions_gc_index.sql(可选,加 last_accessed_at 单列索引)
- **做法**:见 sharedRefactor A 第(3)层。最小可行:cleanup 加 `cleanIdleAgentSessions`——SELECT agent_session_id,user_id FROM agent_sessions WHERE last_accessed_at < now-90d LIMIT 500,逐行调对应 feature 的 DeleteSessionByID(既删 DB 行又删 agent workspace),batch+100ms 间隔;runDaily 05:30。TTL(90d)走 env `AGENT_SESSION_TTL_DAYS`。理想重构:再加(a)每用户每 feature 会话数硬帽(超帽删最旧,建会话时或 GC 时执行)防单用户刷爆;(b)部署侧 `du data/agent-sessions` 水位告警脚本(仿 scripts/monitor-memory.sh)。GC 查询 `WHERE last_accessed_at<?` 用不上现有 `idx_user_feature_accessed`(前导列 user_id),表若大建议 0071 加 `idx_last_accessed(last_accessed_at)` 单列索引;表小则全扫可接受。
- **备选**:备选:在 agent 侧自建 GC(定时扫 SESSIONS_ROOT mtime 删冷目录)——但 agent 不知道 DB 归属,可能删掉「久未访问但用户仍想要」的会话且与 DB 行脱节,产生反向孤儿(DB 有行、目录没了)。backend 驱动 + 走 last_accessed_at 权威口径 + 复用 DeleteSessionByID 才能 DB 与磁盘同删一致,是唯一自洽方案。
- **风险**:中。90d idle 删除会同时抹掉该会话的对话历史(用户列表里消失)——这是产品取舍,需人拍板 TTL 值(见 openQuestions)。规避:TTL 保守设 90-180d;删前 slog 记 sid+user 便于追溯;GC 只删过期,绝不动近期会话。DeleteSessionByID 对 agent 已重启丢失的 session 会收 404——发现 12 的兜底修好后即幂等,否则 GC 会因 404 中断,故**依赖发现 12 先落地**。绝不 DROP,纯行级 DELETE。
- **验证**:手动把某测试会话 last_accessed_at 改到 100 天前,跑一次 GC(可临时把 runDaily 触发时间设近),验证 DB 行删除 + `data/agent-sessions/<sid>` 目录消失 + 日志有计数。对账:GC 前后 `du -sh data/agent-sessions` 应下降。压测:批量造 1000 过期会话验证 batch 不阻塞在线写入。
- **依赖**:依赖发现 12(删除兜底)先落地,否则 GC 撞 agent 404 会失败/留孤儿

##### [🔴 P0 · S(<1h)] 发现 12:executor 重启后删除路径静默失效,deleteSession 只认内存 Map,重启前的会话删除时 agent 返 404、backend 容忍后删 DB 行,workspace 成永久孤儿(agent/src/server/sessions.ts:141)

- **代码确认**:确认仍在。sessions.ts:138-141 `const m = sessions.get(sid); if(!m) return false;` 内存未命中直接返 false,不尝试删磁盘目录。http.ts:197-201 据此回 404。executor restart:unless-stopped 保留可写层(prod 更是 bind-mount 永久),重启后内存 Map 清空但目录还在 → 删除时必然 Map miss → 404 → workspace 永久孤儿,且是发现 11 GC 的直接绊脚石。
- **改动点**:agent/src/server/sessions.ts:deleteSession(138-150 行)
- **做法**:最小可行改动:Map 未命中时回退按约定路径删除。
```
export async function deleteSession(sid: string): Promise<boolean> {
  const m = sessions.get(sid);
  if (m) sessions.delete(sid);
  const workDir = m?.workDir || safeSessionDir(SESSIONS_ROOT, sid); // sid 已过 validSessionId
  try {
    await rm(workDir, { recursive: true, force: true });
    await rm(skillsDirFor(workDir), { recursive: true, force: true });
  } catch { /* best-effort */ }
  return true; // 幂等:目录不存在也算删成功
}
```
注意:http.ts DELETE 里 sessMatch 已做 validSessionId 校验(194 行),safeSessionDir 再断言子目录,双重防穿越,拼路径安全。返 true 让 backend 不再收 404、GC 幂等推进。
- **备选**:备选:让 backend 对 404 也认为删成功(已经容忍了)——但那样磁盘孤儿永远清不掉,只是掩盖。必须让 agent 真删磁盘。
- **风险**:极低。行为变化:删一个从没在本进程建过的 session 现在会尝试删对应目录并返 success 而非 404——正是想要的幂等语义。force:true 保证目录不存在不抛。唯一要确保 safeSessionDir 对畸形 sid 抛错(已有 validSessionId 前置)。
- **验证**:重启 agent 容器后,对一个重启前建的会话调 DELETE,改前观察 agent 返 404 + 目录残留,改后返 200 + `data/agent-sessions/<sid>` 消失。单测:deleteSession 一个从未 createSession 的合法 sid,验证不抛且目录被 rm。
- **依赖**:无。应在发现 11 之前落地(11 依赖它)

##### [🔴 P0 · M(半天)] 发现 7:无全局并发/准入控制,同时 N 个用户各跑流式+子进程,内存/CPU 无上限,约 2 个重会话打爆 1.5G 容器(agent/src/server/ws.ts:199)

- **代码确认**:确认仍在。并发控制只有 ws.ts:199 每会话 `inFlight` 忙锁,跨会话零全局闸。index.ts 未设 websocket backpressure,turnLoop 每轮持完整 messages[](近上限 ~128k token)+ 最多 3 张 live base64 图(MAX_LIVE_IMAGES=3)+ SSE 解析缓冲。prod deploy.resources.limits.memory=1.5G,注释自述单会话峰值 ~765MiB → 2 并发即触顶,无准入闸时第 3 个并发直接 OOM 杀全容器。
- **改动点**:agent/src/server/ws.ts:handleUserMessage(199 行附近入口);新增 agent/src/server/admission.ts(信号量);agent/src/turn/title.ts、ws.ts extract_memory 分支(纳入低优先队列)
- **做法**:见 sharedRefactor B 第(1)项。最小可行:新建轻量 Semaphore(计数 + 等待队列),`MAX_CONCURRENT_TURNS` env 默认 2。handleUserMessage 在 `ws.data.inFlight=true` 之后、runTurn 之前 `const rel = await sema.tryAcquire()`;tryAcquire 立即失败(不排队,避免 WS 堆积)则回 `error{code:busy,retryable:true}` 并复位 inFlight;成功则 finally release。标题生成/记忆抽取用独立小信号量(如并发 1-2)或直接在主 turn 之外低优先跑。理想重构:信号量按「内存预算」加权(大 history 会话占 2 个配额),并给前端发 `queued` 状态提示排队位置——但先上硬计数闸止血。
- **备选**:备选:靠 backend 侧限并发——但 backend 不知道 agent 的内存实时水位,且四个 feature 各自的 hub 难协调全局;闸放在 agent 进程内(唯一知道自己内存的地方)最准。备选:提高 memory limit——治标,用户涨了照样爆,且宿主内存有限。
- **风险**:中。设太小 → 正常多用户被误拒(体验退化);设太大 → 兜不住 OOM。需按 prod 实测峰值标定(765MiB/会话 → 1.5G 容器安全并发≈1-2,给 headroom 设 2)。retryable:true 让前端自动重试,避免直接报错脸。注意:必须在 inFlight 复位路径里 release,否则信号量泄漏会把容器逐渐锁死(参考 turnLoop 的 terminalSent 守卫思路,release 放 finally)。
- **验证**:并发发起 3+ 个重会话 user_message,改前 docker stats 看内存冲破 1.5G / 容器被 OOM kill(exit 137),改后第 3 个立即收 busy、内存稳定在 ~1.5G 内。日志观测信号量 acquire/release 配对无泄漏。
- **依赖**:无(可独立);与发现 8 同属 sharedRefactor B,建议一起做

##### [🟠 P1 · S(<1h)] 发现 8:/render/math 同步 CPU 渲染无队列,阻塞单线程事件循环,一次公式渲染卡住所有用户的流式输出(agent/src/render/math.ts:59)

- **代码确认**:确认仍在。math.ts:59 `mjDoc.convert`(MathJax TeX→SVG 纯 JS CPU)与 :82 `resvg.render().asPng()`(resvg-wasm 同步栅格化)都同步跑主事件循环,renderMath 无任何队列/并发闸。对照同目录 mermaid.ts:33 明确用 `let queue` 串行化并注释『并发渲染在小容器里会 OOM』——math 路径漏了这层。该端点由 backend 代理(http.ts:66),小程序 Claw 公式渲染高频命中。
- **改动点**:agent/src/render/math.ts:renderMath(54-84 行,套队列)
- **做法**:最小可行改动:照抄 mermaid.ts 的串行队列模式包住 renderMath 的 CPU 段。
```
let mathQueue: Promise<unknown> = Promise.resolve();
export function renderMath(tex: string, display: boolean): Promise<MathPng> {
  const run = mathQueue.then(() => doRenderMath(tex, display));
  mathQueue = run.catch(() => {});
  return run;
}
// 原函数体改名 doRenderMath
```
ensureWasm 的懒加载保持在 doRenderMath 内(首次串行加载)。理想重构:把 convert+render 丢 Worker 线程(`new Worker`)真正离开主循环,但串行队列已消除「一次卡所有人」主症状,Worker 是后续增量。
- **备选**:备选:直接上 Worker 线程——收益更大但改动大(wasm 在 worker 里要重新 init、消息序列化),不如先串行止血再迭代。
- **风险**:极低。串行化会让并发公式请求排队(单个略慢),但换来主循环不被独占——对多租户是净胜。后端有 30d Redis 缓存,每公式一生只渲一次,队列深度实际很浅。注意队列失败不断链(`.catch(()=>{})`,与 mermaid 一致)。
- **验证**:并发 POST 10 个 /render/math,同时另开一个会话跑流式对话,改前观察流式 token 在公式渲染期间卡顿/停顿,改后流式平滑。日志/计时确认 math 渲染串行执行。
- **依赖**:无(可独立);与发现 7 同属 sharedRefactor B

##### [🟠 P1 · M(半天)] 发现 2 & 6(重复,同一处):内存会话 Map 永不淘汰,每个连过的会话连同完整 transcript(含 base64 图)常驻内存只增不减(agent/src/server/sessions.ts:96)

- **代码确认**:确认仍在,且发现 2 与 6 是同一行代码(sessions.ts:96 `const sessions = new Map`)的两次报告,合并。SessionMeta.messages(75 行)持整段 history + compactCache.messages(83 行)第二份拷贝。写入路径:getOrCreateEphemeral(ws.ts:134/206)/createSession(103)插入,handleUserMessage 每条 push(ws.ts:266/335)。唯一收缩路径 deleteSession(138)仅用户显式删/重置时触发。切走/闲置/开新会话都不释放。图片经 buildUserContentWithImages base64 内嵌进 history(attachments.ts:58)。
- **改动点**:agent/src/server/sessions.ts(SessionMeta 加 lastActiveAt + sweep interval + MAX_SESSIONS);agent/src/server/ws.ts(onOpen/onClose 维护 activeWs 计数、handleUserMessage 刷新 lastActiveAt + 落 history 时换图占位)
- **做法**:见 sharedRefactor A 第(1)(2)层。最小可行:①SessionMeta 加 `lastActiveAt`,onMessage 入口刷新;②sessions.ts setInterval(5min)驱逐『lastActiveAt>30min 且无活跃 WS』的纯内存 meta(真源在 backend journal,seed_history 重连自愈);③MAX_SESSIONS(默认 200)LRU 硬帽。理想重构:落 history 时把 image 块换文本占位、原图留 cwd 按需重读(去掉常驻 base64,单会话内存从 ~MB 级压到 KB 级)。activeWs 计数是驱逐安全的关键——正在对话/有连接的会话绝不驱逐。
- **备选**:备选:只设 MAX_SESSIONS 不设 TTL——够挡无界但热点大会话仍占满;TTL+LRU 组合更稳。备选:整个 messages 都不常驻、每轮从 backend 拉——违反 executor 按轮无状态但 WS 内续接的设计,改动过大。
- **风险**:中。驱逐活会话会导致重连时丢内存 history——靠 activeWs 计数 + IDLE_TTL 双条件规避,只驱逐真正无人的冷会话,且 backend seed_history 会重灌。compactCache 一并随 meta 驱逐(下次重算,可接受)。图占位若实现要确保 wire 侧 limitLiveImages 仍能从 cwd 现读现发当前轮图片(现读逻辑已在 attachments,占位只动 history 存储不动发送)。
- **验证**:开 N 个会话各发一条消息后全部断开 WS,等过 IDLE_TTL,观察 agent 进程 RSS 回落(docker stats)+ 日志有驱逐计数;重连被驱逐的会话验证 seed_history 正常回灌、对话可续。内存对比:发一张 5MB 图后,改前 heap 常驻 +6.7MB,改后仅占位文本。
- **依赖**:无(内存层可独立);图占位那层与磁盘 GC(11)互补但不互相依赖

##### [🟠 P1 · M(半天)] 发现 3:近上限稳态下每条消息同步付一次摘要 LLM 调用,阻塞主回复首 token 数秒且 memoize 几乎必 miss(agent/src/server/ws.ts:279)

- **代码确认**:确认仍在。ws.ts:276-283 在 runTurn 前同步 `await reduceForWindow`。触发信号 estCtx=max(lastCtx, estimateTokens)(275 行),一旦进 75% 触发区且 prune 不够就走 compact.ts:151-164 的 haiku 摘要(最多 2 次尝试 +300/600ms 退避,输入 48K 字符还可能递归分段多次调用 167-203)。memoize key=`${cut}:${estimateTokens(旧段)}`(compact.ts:256)——每来一条新消息,cut 与旧段 token 都变 → key 变 → 必 miss → 每条消息重摘全部旧段,阻塞在主路径首 token 前。
- **改动点**:agent/src/turn/compact.ts:reduceForWindow(memoize key 策略、增量滚动摘要);agent/src/server/ws.ts:handleUserMessage(可选:改异步预压缩)
- **做法**:三选一,按投入递增:
① 最小(推荐先上):把已生成的摘要对复用为新压缩的输入前缀(增量滚动摘要)——reduceForWindow 检测 messages[0..1] 已是摘要对(isSummaryPrefix 现成),则只摘『上次摘要之后新增的、超出 keepTurns 的回合』,把旧摘要正文作为前缀拼进新摘要输入,而非每次对全部旧段重摘。memoize key 改为『摘要对内容 hash + 新增回合数』,命中率大幅提升。
② 中(治本):把摘要压缩改为 turn 结束后异步预做(runTurn 的 finally 里 fire-and-forget reduceForWindow,结果存 meta.compactCache),下一条消息主路径直接命中缓存、只做无 LLM 的 prune/硬裁。首 token 不再等摘要。
③ 触发信号改用『上一轮单次 LLM call 的最大 input_tokens』而非 lastCtx 的 input+output 跨轮求和,消除高估导致的过早/过频触发。
建议 ①+③ 一起上(都在 compact.ts/ws.ts 内,低风险),②作为理想重构。
- **备选**:备选:直接关掉 compact 只留 prune+硬裁——省 LLM 但学术长会话丢早期目标/约束(compact 存在的理由)。不可取。
- **风险**:中。①要保证增量摘要不丢更早摘要里的关键产物(extractArtifacts 已保留 ID/DOI/路径,增量时旧摘要正文整体带入即可)。②异步预压缩要处理『预压缩还没跑完下一条就来了』的竞态——用 meta 上一个 pending Promise 守卫。③改触发口径要重测不同上下文窗模型(64k/200k)的触发点,避免小窗模型压不住撞上游墙(现有 reactiveReduces 兜底仍在)。
- **验证**:造一个逼近 75% 的长会话,连发多条消息,改前测每条首 token 延迟(数秒 spike,日志 `context compacted` 每条都出),改后首 token 延迟平滑 + `compact:cached` 命中率上升。观测 token_usage{kind:context_compact} 帧频率下降。
- **依赖**:无(纯 agent 内)

##### [🟡 P2 · M(半天)] 发现 4:工具批次『全或无』并行,混入一个写类工具即整批串行;且每工具都付一次 WS permission 往返(agent/src/turn/runTools.ts:28)

- **代码确认**:确认仍在。runTools.ts:28 `allParallel = toolUses.every(...)`,只要批里有一个非 parallelSafe(Write/Edit/Bash/ExportDocument)就整批 33-40 行逐个 await,本可并行的 MCP 检索/Read 一起退化。runOne(44-57)对每个工具都发 permission_request 阻塞等 response。**但关键更正**:该 permission 往返不是纯开销——backend/internal/agentbridge/ws.go:231 decidePermission 是方案 B 文件隔离的命门(对 cwd 外文件操作默认拒),是安全网关,不可移除。往返走 agent↔backend 同 docker 内网(亚毫秒),成本远低于审计初判。
- **改动点**:agent/src/turn/runTools.ts:runTools(28-41 行,分组并行)
- **做法**:只做审计建议的『分组并行』,**不动 permission 往返**(它是安全网关)。把批次按 parallelSafe 分段:连续的 parallelSafe(MCP/Read/Glob 等只读)前缀/段用 Promise.all 并发,非 safe 的(写/Bash)按序单个插入,保持写操作互斥与顺序。tool_result 仍按原 tool_use 顺序回填(SDK 约束)。
```
// 伪:遍历 toolUses,累积连续 safe 段并发跑,遇 non-safe 先 flush 前段再串行跑该个
```
permission 往返保留每工具一次(安全不可省);若想优化往返,可在 agent 侧对『确定落在 cwd 内的只读工具』本地预判放行——但这会把安全裁决从 backend 权威搬到 agent,风险高,不建议。
- **备选**:移除 permission 往返(审计提及)——否决,那是文件隔离命门。只做并行分组。
- **风险**:低-中。要严格保证:non-safe 工具之间及其与相邻 safe 段的相对顺序不乱(写序敏感);tool_result 数组顺序必须与 tool_use 一一对应(SDK 会因错位把模型训离 parallel call)。abort 短路逻辑(24/35 行)要在分组后每段前仍重查。因是 low/unverified 且收益主要是延迟优化(非稳定性),排 P2。
- **验证**:造一个模型单轮同时发 3 个 MCP 检索 + 1 个 Write 的批次,改前测总耗时≈4 个串行和,改后≈max(3 并发检索, Write)+ Write。验证 tool_result 顺序与 tool_use 对齐、写文件内容正确、stop 中途能短路。
- **依赖**:无

##### [🟡 P2 · S(<1h)] 发现 5:Write 流式预览在字段序不利时对累计 JSON 每 delta 全量重扫(O(N²)),挤占单线程事件循环(agent/src/turn/turnLoop.ts:245)

- **代码确认**:确认仍在但已部分缓解。turnLoop.ts:245 `extractStreamingFieldValue(meta.json, 'file_path')` 在 path 未命中前,每个 input_json_delta 都对累计 JSON 从头 indexOf 全量扫(streamText.ts:80-86 每次 fresh indexOf)。缓解点:243-249 行一旦解出 path 即 `toolPaths.set` 缓存、之后不再扫(`if(!path)` 守卫);且 streamText.ts:15 MAX_STREAM_JSON=512KB 上限截断。残留:path 出现晚于 content(字段序 content 在前)时,整个 content 流式期(可达数百 KB)每 delta 都全量 indexOf 扫一遍找不存在的 file_path,O(N²)。FieldStreamer 主抽取本身已是 O(N)(注释自证修过一次)。
- **改动点**:agent/src/turn/streamText.ts:extractStreamingFieldValue(加偏移续扫)或 turnLoop.ts:243-250(命中策略)
- **做法**:最小可行(推荐):turnLoop 里给 file_path 探测加『放弃』条件——首个 content inc 已产出(说明 content 字段已开始、若 file_path 还没出现则大概率在 content 之后或本就没有),即停止 file_path 探测,改在 tool_use_complete(255-259 行已有该帧)时从完整 input 补发一帧带 path 的修正。这样热路径(content 流式期)零 file_path 全扫。
备选实现:extractStreamingFieldValue 改为带 lastScanned 偏移的增量 indexOf(下次从 max(0,lastScanned-markerLen) 续扫),但要维护 per-index 的扫描游标 Map,复杂度更高。前者(放弃探测+完成时补发)更简洁。
- **备选**:增量偏移续扫(见上,更复杂);或强约束模型总把 file_path 放前(不可靠,模型不可控)。
- **风险**:低。改动只影响流式预览的 toolPath 字段时机——前端本就要校验『写的是不是活动文件』,补发帧在 tool_use_complete 到达,早于该 Write 真正执行,前端预览校验不受影响。要确认前端能接受 toolPath 先 undefined 后补齐(现协议 toolPath 本就可选,251 行 `path` 可为 undefined)。
- **验证**:造一个 Write 工具入参 JSON 字段序为 content 在前、file_path 在后的流式,改前用 CPU profiler 看 content 流式期 extractStreamingFieldValue 占用飙升,改后归零。前端验证预览仍能定位到正确文件。
- **依赖**:无

##### [🟡 P2 · S(<1h)] 发现 9:每轮 runTurn 在事件循环上做同步 fs 读(loadAddDirContext),per-session skill 目录使缓存每会话首轮必 miss(agent/src/turn/turnLoop.ts:102)

- **代码确认**:确认仍在但已部分缓解。turnLoop.ts:102 每轮 `loadAddDirContext(input.addDirs)`。loader.ts 已加有界 LRU(135-136 ADDDIR_CACHE_CAP=256,命中 O(1) 且注释明确点出 per-session cacheKey 泄漏风险已用 LRU 兜)。残留:cacheKey=`addDirs.join('|')`(141 行)含 per-session `<sid>.skills` → 每会话唯一 → 首轮必 miss;miss 分支 171-183 是一串同步 readFileSync/readdirSync(safeRead+listSkillDirs+buildSkillMenu),在主事件循环上阻塞。有 per-session skill 的 claw 会话每个首轮都吃这串同步 IO。
- **改动点**:agent/src/skills/loader.ts:loadAddDirContext + safeRead + listSkillDirs + buildSkillMenu(改 fs/promises);agent/src/turn/turnLoop.ts:102(改 await)
- **做法**:两档:
① 最小:把静态一方目录(/claw-add、/prism-add 等 :ro 挂载,内容永不变)与 per-session `.skills` 目录**分离缓存**——一方目录部分按其自身 join 做 key(跨会话复用、常驻命中),per-session 部分单独按 sid 缓存。这样一方目录那串重 IO 只在容器生命期首次读,per-session 只读它自己那一小份,首轮 miss 的 IO 量骤降。
② 理想:把 loader 的 readFileSync/readdirSync 全改 fs/promises 异步,loadAddDirContext 返 Promise,turnLoop.ts:102 改 `await loadAddDirContext(...)`——彻底不阻塞事件循环。因 loadAddDirContext 是纯读拼字符串,异步化直接。
建议 ①+② 一起(分离缓存降 IO 量、异步化解阻塞)。
- **备选**:只加大 LRU cap——治标不解首轮同步阻塞。必须异步化 + 分离缓存。
- **风险**:低。异步化要改调用链(loadAddDirContext→runTurn:102),但该调用只此一处,turnLoop 本就是 async。分离缓存要保证一方目录内容确不变(:ro 挂载 + 容器重启清缓存,注释已确认)。per-session 目录物化后不变、sid 不复用,缓存有效性不变。
- **验证**:开一个带 per-session skill 的 claw 会话,首轮用 profiler 看 loadAddDirContext 同步 IO 阻塞时长,改后(异步)主循环不阻塞、(分离缓存)IO 字节数下降。多轮验证缓存命中、skill 菜单内容一致。
- **依赖**:无

##### [🟡 P2 · M(半天)] 发现 10:agent→hub WS 发送忽略背压返回值,慢消费/hub 停顿时靠 Bun 默认 backpressure 上限兜底(丢帧)(agent/src/server/ws.ts:64)

- **代码确认**:确认仍在。ws.ts:64 safeSend 直接 `ws.send(JSON.stringify)` 忽略返回值(Bun ServerWebSocket.send 返回 <0 表进入背压)。turnLoop 出 token 每个 content_delta 都经 sink.frame→safeSend 同步发(turnLoop.ts:225→ws.ts:240)。index.ts:57-61 websocket 配置未设 backpressureLimit/maxPayloadLength,用 Bun 默认背压 → 慢消费时超限可能静默丢帧。
- **改动点**:agent/src/server/ws.ts:safeSend(64 行,检查返回值 + 背压节流);agent/src/index.ts:57(显式设 backpressureLimit)
- **做法**:两件:①safeSend 检查 ws.send 返回值,<0(背压)时记日志(限流打点,别每帧刷屏);理想档:进背压时给 turnLoop 一个『暂停/聚合』信号——但 turnLoop 出 token 是同步循环,真正暂停需要把 sink.frame 改成可 await 的背压感知(改动较大),先做『聚合发送』(相邻 content_delta 攒一小批一次 send)降帧率。②index.ts websocket 显式设 `backpressureLimit`(如 16MB)+ `maxPayloadLength`,超限记日志而非静默。
最小可行:先只做①的返回值检查+日志 + ②的显式 limit,让丢帧可观测;聚合/暂停作为后续。
- **备选**:完全同步阻塞式回压(send 满就 await drain)——Bun WS 无原生 drain await,需自建,复杂且可能拖慢正常流。先做可观测 + 聚合。
- **风险**:低-中。背压主要在『hub/前端慢消费 + agent 猛出 token』时触发,实际前端消费快、hub 转发快,触发概率低——故排 P2。聚合发送要注意别破坏前端『相邻 toolInput 合并』的现有逻辑(turnLoop.ts:232 注释前端已合并)。真正的暂停回压改动大、收益不确定,不建议先做。
- **验证**:人为让 hub/前端慢消费(断点/sleep),agent 猛出长文本,改前观察前端丢字/乱序且无日志,改后背压日志出现 + 显式 limit 生效。正常场景验证无回归。
- **依赖**:无

##### [🟡 P2 · S(<1h)] 发现 13:退役 cc-haha fork 的 134MB 历史数据归档迁移完成后永久滞留磁盘,dev/prod compose 仍常挂 /fork-data 且每次 boot 重扫(docker-compose.yml:317)

- **代码确认**:确认仍在。docker-compose.yml:317 与 docker-compose.prod.yml:289 都仍 `./data/agent:/fork-data:ro`,配合 AGENT_ARCHIVE_FROM_JSONL 默认 /fork-data(compose:285)。bootstrap.go:236 `agentBridge.ArchiveFromJsonl(actx, jsonlRoot)` 每次 boot 重扫(幂等 no-op 但仍是 IO + 挂载面)。fork 已退役(compose 注释『P6 fork 已退役』)。
- **改动点**:docker-compose.yml:284-285,317;docker-compose.prod.yml:288-289;.env(AGENT_ARCHIVE_FROM_JSONL 默认值)。**先做对账验证**再动
- **做法**:运维/清理类,先对账后移除:①对账 —— 查 `SELECT COUNT(DISTINCT agent_session_id) FROM agent_session_archive` vs `data/agent/projects` 里 jsonl 会话数,确认归档完整;②确认后从两份 compose 移除 `/fork-data:ro` 挂载 + AGENT_ARCHIVE_FROM_JSONL 默认值(或设空),让 boot 不再重扫;③把 `./data/agent` 冷备(tar 到别处)后从生产机删除,或至少运维文档标记该目录可回收。因涉及 bind-mount 变更 + 历史数据删除,属部署侧操作,分开于代码改动、需人确认对账结果。
- **备选**:保留挂载但设 AGENT_ARCHIVE_FROM_JSONL='' 关重扫——省一半(不重扫但目录仍占盘)。彻底解决需删目录。
- **风险**:低但不可逆(删历史数据)。规避:删前必对账 + 冷备。移除挂载不影响运行(归档早已 no-op)。注意 bind-mount 移除后若 AGENT_ARCHIVE_FROM_JSONL 仍指向不存在路径要确保 ArchiveFromJsonl 优雅跳过(读不到目录即 no-op,应已如此,需确认 bootstrap.go:236 附近的容错)。
- **验证**:移除挂载后重启 backend,`docker logs scholar_backend` 确认无 ArchiveFromJsonl 报错、无归档尝试;业务(历史会话回放走 agent_session_archive)正常。删目录前 `du -sh data/agent`(~134MB)记录,删后确认磁盘释放。
- **依赖**:依赖对账确认归档完整(agent_session_archive 行数 vs jsonl 会话数)

#### 本簇落地顺序
建议落地顺序(P0 止血优先,注意 11 依赖 12):

第一波(P0 止血,当天可完成 1+8,S 工作量):
1. 发现 1(Bash readCapped)—— S,零依赖,单条命令 OOM 是最尖锐的稳定性洞,复用现成代码,先上。
2. 发现 8(math 串行队列)—— S,零依赖,照抄 mermaid 模式,消除『一次公式卡所有人』。
3. 发现 12(deleteSession 兜底)—— S,零依赖,且是 11 的前置。

第二波(P0 容量闸):
4. 发现 7(全局并发信号量,sharedRefactor B)—— M,与 8 同属 B 可合并 PR;这是防 2 重会话打爆的正面闸。
5. 发现 11(workspace 磁盘 GC,sharedRefactor A 第 3 层)—— L,依赖 12 已落地;prod 磁盘线性增长打挂共享分区的风险要在第二波内解决。

第三波(P1 内存与延迟):
6. 发现 2/6(内存 Map 淘汰 + 图占位,sharedRefactor A 第 1/2 层)—— M。
7. 发现 3(增量摘要 + 触发口径)—— M。

第四波(P2 清理,可并行/择机):
8. 发现 4/5/9/10 —— 各自独立小改;13 走运维对账流程单独排。

分组打包建议:B(7+8)一个 PR;A 的磁盘侧(11+12)一个 PR、内存侧(2/6)一个 PR;1、3、5(发现编号)、9、10、13 各自独立。

#### 待人拍板
1. 【workspace GC 的 TTL 与语义,需产品拍板】发现 11 的 90 天 idle 删除会连带删掉用户的对话历史(会话从列表消失)——claw/smart-search 多会话『按设计永久保留』与『磁盘不能无限涨』直接冲突。取舍选项:(a)TTL 删整个会话(DB+workspace,最省盘但删历史);(b)只删 workspace 目录里的大文件(附件/Bash 产物,产物真源在 MinIO+DB)保留 DB 行与 journal 历史——但 agent 现无『删 workspace 保 jsonl』的端点,需新增;(c)每用户会话数硬帽(如每 feature 100 个)+ 超帽删最旧。建议 (b) 或 (c) 更温和,但 (a) 最简单。TTL 具体天数(90/180)也需定。

2. 【发现 7 并发上限标定】MAX_CONCURRENT_TURNS 设几?prod 注释单会话峰值 ~765MiB、容器 1.5G，安全并发≈1-2。设 1 太保守(单用户独占)、设 2 逼近顶。是否要按会话 history 大小加权(大会话占 2 配额)?需要 prod 实测峰值数据支撑;也关系到是否要把容器 memory limit 提到 2-3G 换更高并发。

3. 【发现 3 是否上异步预压缩(方案②)】异步预压缩收益大但引入『预压缩未完成下一条又来』的竞态,需要 meta 上加 pending Promise 守卫。先上增量摘要(①+③)是否够?若稳态长会话占比高,可能需要②。取决于线上长会话分布数据。

4. 【发现 13 归档对账】移除 /fork-data 挂载 + 删 data/agent(134MB)前，必须有人跑对账 SQL 确认 agent_session_archive 已完整覆盖 jsonl 会话数——这个确认动作需运维执行，本设计无法代为验证生产数据完整性。

5. 【发现 4 permission 往返】审计初判把『每工具一次 permission 往返』当开销，但亲读 backend/agentbridge/ws.go 确认它是文件隔离的安全命门(cwd 外操作默认拒),不可移除。已在方案里只保留『并行分组』部分、剔除『消除往返』——确认这个纠偏与安全预期一致(不应为省往返而把安全裁决下放 agent)。


---

### 簇:前端部署脚本 assets 误删致全站 404 `stability-frontend-deploy`

**整体判断**:核心矛盾:frontend-user 启动脚本 40-sync-site.sh 的 stale-chunk 回收把「保留窗口」错误地锚在镜像构建时间上(cp -a 保留源 mtime = npm run build 时刻),而不是部署时刻。一旦镜像龄超过 RETAIN_DAYS(默认 7 天),任意一次容器重启(prod 用 ACR 固定 tag,镜像可以躺很久)都会让 `find -mtime +7 -delete` 把本次仍在服役的全部 hash chunk 判定为超龄整代删除 → 宿主 bind-mount ./data/frontend-assets 被清空 → 全站 JS/CSS 404 白屏。这是定时炸弹,P0。总体策略:①最小可行——cp 之后对「本次构建清单」显式 touch 刷新 mtime,把保留基准从构建时间纠正为部署时间(time-based grace,语义最贴合「老标签页还能拉旧 chunk」的初衷),彻底修掉 bug;②在此之上加一个与 grace 语义正交的体积上限兜底,解决 finding 2 的「窗口纯时间无体积上限」;③把回收失败从 `2>/dev/null || true` 静默改为可见但非致命(绝不能让回收失败反而拖垮 nginx 启动)。finding 3(gzip_static + 缓存小瑕疵)与本脚本无耦合,是独立 P2 清理。铁律校验:本簇不碰前端 effect/依赖数组,无 CPU 风暴风险;不涉及 DB 迁移;nginx 已开 gzip,3A 用 gzip_static 服务预压产物不构成双压(已编码响应 gzip filter 自动跳过)。

#### 统一改法(一次解决多个发现)

**◆ 40-sync-site.sh 回收逻辑一次改到位(修 finding 1 + 兜住 finding 2)**
- 一次解决:finding 1(mtime 语义 bug,P0)+ finding 2(窗口无体积上限,P2)
- 设计:把回收块从『锚构建时间的裸 find -mtime』改成三段式,全部 busybox(nginx:alpine)可跑,已在 scratchpad 用 /bin/sh 验证过:

(1) 部署时间锚定:cp -a 之后,对『本次构建产物清单』(源 = /opt/dist/assets,即本镜像 npm run build 的输出)逐个 touch 刷新 mtime 到 now。这样『本次仍在服役的 chunk』mtime=部署时刻永远年轻;只有『连续 RETAIN_DAYS 天没在任何一次部署里再出现』的真正孤儿 chunk 才会超龄。这一步单独就把 finding 1 彻底修死。命令:
  ( cd "$SRC/assets" && find . -type f -print0 ) | ( cd "$DST/assets" && xargs -0 touch )

(2) 时间窗回收(保留原 grace 语义,time-based 对『老标签页开着 N 小时仍要拉到它那版 chunk』是最正确的语义,优于按部署代数):
  find "$DST/assets" -type f -mtime "+$RETAIN_DAYS" -delete

(3) 体积上限兜底(finding 2:高频部署下即便都在 7 天内也可能堆高水位),回收后若目录仍超阈值,按 mtime 从老到新裁到阈值内。因为第(1)步已把本次构建文件刷成最新,ls -1tr(oldest-first)天然把它们排在最后,size cap 只会吃掉旧 grace 孤儿,绝不会误删当前构建引用的 chunk:
  CAP_MB="${ASSET_MAX_MB:-800}"
  while [ "$(du -sm "$DST/assets" | cut -f1)" -gt "$CAP_MB" ]; do
    victim=$(ls -1tr "$DST/assets" | head -1)
    [ -n "$victim" ] && rm -f "$DST/assets/$victim" || break
  done

(4) 可见性(finding 1 审计建议):去掉 `2>/dev/null`,但保留非致命——回收失败要在 docker logs 看得见,又绝不能因 set -e 而中断 nginx 启动。用 `find ... -delete || echo '[40-sync-site] WARN: reclaim failed' >&2` 而不是 `|| true` 吞掉。ASSET_RETAIN_DAYS/ASSET_MAX_MB 显式写进两份 compose 的 environment 便于分环境调。

#### 逐条实施方案

##### [🔴 P0 · S(<1h)] finding 1 [high/confirmed] assets 回收以 mtime 为基准而 mtime=镜像构建时间:重启超过 7 天龄的镜像会把现役 chunk 整代删光,全站 JS/CSS 404 —— frontend-user/docker-entrypoint.d/40-sync-site.sh:24

- **代码确认**:确认问题仍在,与审计描述完全一致。脚本第 22 行 `cp -a "$SRC"/. "$DST"/` 保留源文件 mtime;源在 Dockerfile:31 `COPY --from=builder /app/build /opt/dist`,mtime = 镜像内 npm run build 时刻(镜像层固化,重启不变)。第 24 行 `find "$DST/assets" -type f -mtime "+$RETAIN_DAYS" -delete 2>/dev/null || true`。RETAIN_DAYS 默认 7(:18)。prod(docker-compose.prod.yml:432)用 ACR 固定 tag 镜像,重建/重启不重新 build,镜像可轻松超 7 天龄;bind-mount ./data/frontend-assets(dev :481 / prod :442)是唯一持久层,被清空即全站 404。`set -e`(:14)在场:一旦把 `|| true` 简单删掉,find 失败会中断脚本 → nginx 不启动,故可见性改造必须保持非致命。
- **改动点**:frontend-user/docker-entrypoint.d/40-sync-site.sh(第 20-26 行回收块);可选:docker-compose.yml frontend-user.environment 显式声明 ASSET_RETAIN_DAYS
- **做法**:最小可行改动(强烈推荐先落这个,S,<1h):在 `cp -a` 之后、`find -mtime -delete` 之前插入一行 touch,把本次构建清单的 mtime 刷成部署时刻——见 sharedRefactors 第(1)步。就这一行即可把保留基准从『构建时间』纠正为『部署时间』,bug 根除。已在 scratchpad 用 /bin/sh 验证:构造 old-AAAA(仅旧部署有,mtime=2025)、shared-BBBB(新旧都有)、new-CCCC(仅新构建),touch 后 `find -mtime +7` 只命中 old-AAAA,shared/new 均被保护。
理想重构(M,可紧随其后):在最小改动基础上叠加 sharedRefactors 的体积上限(第3步)+ 可见性(第4步),一次把 finding 2 也兜住。
注:touch 用 `find -print0 | xargs -0 touch` 而非 `touch $(...)`,防文件名空格/超长 argv;busybox find/xargs 均支持 -print0/-0(现脚本已在用 -delete,同源工具链)。
- **代码骨架**:
```
set -e
SRC=/opt/dist
DST=/usr/share/nginx/html
RETAIN_DAYS="${ASSET_RETAIN_DAYS:-7}"
mkdir -p "$DST/assets"
cp -a "$SRC"/. "$DST"/
# 关键新增:把本次构建产物 mtime 刷到部署时刻,保留基准 = 部署时间(非构建时间)
( cd "$SRC/assets" && find . -type f -print0 ) | ( cd "$DST/assets" && xargs -0 touch )
# 回收连续 RETAIN_DAYS 天未再出现的孤儿 chunk;失败可见但不致命(不用 || true 吞)
find "$DST/assets" -type f -mtime "+$RETAIN_DAYS" -delete \
  || echo "[40-sync-site] WARN: mtime reclaim failed" >&2
echo "[40-sync-site] web root synced; /assets retained ${RETAIN_DAYS}d (deploy-time anchored)"
```
- **备选**:备选A『按代保留 manifest』(审计建议、finding 2 也提):每次部署把 SRC/assets 清单写进 $DST/assets/.deploy-manifests/<epoch>.manifest,回收时保留最近 N 份 manifest 的并集,删并集外文件。已在 scratchpad 验证正确(须注意 manifest 必须源自 SRC/assets 而非合并后的 DST/assets,否则会把旧孤儿也纳入 live set——我第一次测试正是踩了这个,修正后 KEEP=2 正确删除 gen1/gen2/orphan)。不选为主方案的原因:generational 是『按部署次数』保留,高频发版(比如一天 10 次)会在几分钟内淘汰某 chunk,反而打破『老标签页开着 20 分钟还能拉旧 chunk』的核心诉求;time-based(touch)对『开着的老 tab』语义更准。manifest 的唯一优势是天然有界,而这点我用『体积上限兜底』(sharedRefactors 第3步)以正交、不牺牲 grace 语义的方式解决。
备选B『部署清单显式 touch + 保留纯时间』就是本方案,采纳。
- **风险**:极低。touch 只改 mtime 不改内容/不删文件;xargs -0 touch 在 assets 为空(理论不可能,构建必有产物)时会 touch 无参报错——可加 `xargs -0 -r`(busybox xargs 支持 -r 则更稳,不支持则因产物必非空而无碍)。不破坏现有 stale-chunk grace 行为,只是把基准从错误的构建时间挪到正确的部署时间。铁律核对:不碰 DB、不碰前端、无双压;`set -e` 语义已通过『失败 echo 而非中断』保留 nginx 启动韧性。
- **验证**:1) 逻辑层已在 scratchpad 用 /bin/sh 复现验证通过(见 approach)。2) 镜像层:构造一个『老镜像』场景——`docker exec scholar_frontend_user sh -c 'find /usr/share/nginx/html/assets -type f | head; stat -c "%n %y" /usr/share/nginx/html/assets/*.js | head'` 观察修复后本次构建文件 mtime≈容器启动时刻而非镜像 build 时刻。3) 端到端:在预发把某镜像人为改到系统时间+8 天后重启容器,确认 ./data/frontend-assets 不被清空、首页 JS/CSS 200 而非 404。4) `docker logs scholar_frontend_user | grep 40-sync-site` 看到 synced 行且无 WARN。
- **依赖**:无(本簇地基,其余方案不阻塞它)

##### [🟡 P2 · S(<1h)] finding 2 [low] 7 天滚动窗口纯时间、无体积上限,高频部署下单目录高水位(实测 470MB/21,780 文件)—— frontend-user/docker-entrypoint.d/40-sync-site.sh:18

- **代码确认**:确认:脚本只有 `-mtime +$RETAIN_DAYS` 一个回收维度(:24),无任何体积/文件数上限。两份 compose 均未设置 ASSET_RETAIN_DAYS(grep 无命中,取默认 7)。bind-mount ./data/frontend-assets 单目录,理论上 7 天内的高频发版会线性堆积(每次 build 全量 hash 重算,分包全换名)。审计判定『刻意有界』成立但界只在时间维度。
- **改动点**:frontend-user/docker-entrypoint.d/40-sync-site.sh(体积上限兜底块);docker-compose.yml + docker-compose.prod.yml frontend-user.environment(ASSET_MAX_MB / ASSET_RETAIN_DAYS 显式化)
- **做法**:随 finding 1 的理想重构一起落:在 mtime 回收之后追加体积上限兜底(sharedRefactors 第3步)。回收后若 du -sm 超 CAP_MB(默认 800,略高于实测 470 留余量),按 ls -1tr(oldest-first)逐个删到阈值内。因 finding 1 已把本次构建文件刷成最新 mtime,它们在 oldest-first 序里排最后,兜底只吃旧 grace 孤儿,不会误伤现役 chunk。把 ASSET_RETAIN_DAYS/ASSET_MAX_MB 写进两份 compose 的 environment,便于分环境(高频发版环境可调小天数/调大体积)。
- **代码骨架**:
```
CAP_MB="${ASSET_MAX_MB:-800}"
while [ "$(du -sm "$DST/assets" | cut -f1)" -gt "$CAP_MB" ]; do
  victim=$(ls -1tr "$DST/assets" | head -1)
  [ -n "$victim" ] || break
  rm -f "$DST/assets/$victim" \
    || { echo "[40-sync-site] WARN: size-cap reclaim failed" >&2; break; }
done
```
- **备选**:备选:采纳 finding 1 的 manifest generational 方案则时间+体积同时有界,无需单独 size cap。但如上,generational 牺牲 open-tab grace 语义,故仍推荐 time-based + 独立 size cap 组合。
- **风险**:低。du 在循环里每轮跑一次(deploy 时低频,可接受);ls -1tr 需 busybox ls 支持 -t -r(标准 busybox 均支持,部署前 `docker exec ... ls -1tr /usr/share/nginx/html/assets | head` 验一下)。victim 为 .deploy-manifests 目录名时 rm -f 目录会失败但不阻断(若采纳 manifest 方案需在 ls 结果里排除该 dir)。当前非 manifest 方案下 assets 下只有文件,无此顾虑。
- **验证**:scratchpad 造一个超阈值目录跑循环,确认删到阈值即停且现役(最新 mtime)文件不被删;线上 `docker exec scholar_frontend_user du -sm /usr/share/nginx/html/assets` 观察长期水位稳定在 CAP_MB 内。
- **依赖**:依赖 finding 1 的 touch 修复先落地(size cap 的『不误删现役』正确性建立在本次构建文件已被 touch 成最新 mtime 之上)

##### [🟡 P2 · M(半天)] finding 3 [low] 静态资产外层 nginx 每请求现压(proxy_cache HIT 也重压),内层无 gzip_static;非 hash 文件(og-image.png/favicon.svg)被打 1 年 immutable;pdfjs .bcmap 走 no-cache —— frontend-user/nginx.conf:24 + nginx/conf.d/user.conf:285

- **代码确认**:三个子问题逐一确认:
(3A) frontend-user/nginx.conf 全文无 gzip/gzip_static(:1-40)。外层 nginx/nginx.conf:130-138 `gzip on; gzip_comp_level 6`,gzip filter 在 proxy_cache 之后执行→user.conf:285 static_cache 存的是未压缩体,每次 HIT 重跑 level-6 gzip(最大 chunk 如 PrismPage/pdf.worker 近 900KB)。
(3B) og-image.png、favicon.svg 在 web root(public/ 拷入),被 user.conf:285 `.(...|png|...|svg|...)` 命中→proxy_hide_header Cache-Control 后强制 `immutable` 1y(:298-299);inner nginx.conf:24 同样 1y immutable。二者非 hash 文件名,原地覆盖→老客户端一年内看不到更新。外层 add_header 覆盖 upstream,故修复主战场在 user.conf。
(3C) cmaps 由 internals.tsx:47 `cMapUrl: BASE_URL+'pdfjs-cmaps/'` 消费,public/pdfjs-cmaps/ 171 个 .bcmap。`.bcmap` 不在任何 static 正则→外层落到 SPA location(user.conf:362 段)`no-cache`,内层落 nginx.conf:36 location / `no-cache`。每次翻页都可能条件请求,浪费。
- **改动点**:3A: frontend-user/vite.config.ts(加 vite-plugin-compression)+ frontend-user/package.json(devDep)+ frontend-user/nginx.conf(gzip_static on)+ nginx/conf.d/user.conf:285 静态 location(Accept-Encoding 归一)。3B: nginx/conf.d/user.conf(为 og-image.png/favicon.svg 加 exact-match 短 TTL location)。3C: frontend-user/nginx.conf + nginx/conf.d/user.conf(把 .bcmap 纳入可缓存扩展名)
- **做法**:分三个独立小改,可各自单独上,互不依赖,均与 finding 1/2 无耦合:
【3A gzip_static,M】构建期用 vite-plugin-compression 产出 .js.gz/.css.gz(可选 .br);inner frontend-user/nginx.conf 的 js/css/mjs/svg location 加 `gzip_static on;`。关键 gotcha:外层 proxy_cache_key 是 `$uri$is_args$args`(user.conf:292),不含 Accept-Encoding/Vary 维度——若 inner 按客户端 AE 条件性返回 gzip/identity,缓存会被首个变体污染。解法:在 user.conf:285 静态 location 加 `proxy_set_header Accept-Encoding "gzip";`,强制 upstream 恒收 AE:gzip→inner 恒发 .gz→缓存单一 gzipped 变体→所有客户端拿 gzip(gzip 是浏览器普适能力)。外层 gzip filter 见已编码响应自动跳过,不构成双压(遵守铁律)。这样 HIT 不再重压,首字节更快、外层 CPU 降。
【3B 非 hash 文件短 TTL,S】在 user.conf 加两条 exact-match(优先级高于正则):`location = /og-image.png` 与 `location = /favicon.svg`,proxy_hide_header Cache-Control 后 `add_header Cache-Control "public, max-age=86400"`。inner nginx.conf 同步或不动(外层 add_header 已覆盖)。仅这几个已知根级非 hash 文件,清单小、可控。
【3C .bcmap 可缓存,S】cmap 文件名固定不带 hash 但内容随 pdfjs-dist 版本才变。把 `bcmap` 加进 inner nginx.conf:24 与 outer user.conf:285 的扩展名组;但不给 immutable 1y(升级 pdfjs 会同名换内容→immutable 会顽固 stale),给 `max-age=2592000`(30d)折中。
- **代码骨架**:
```
// vite.config.ts
import viteCompression from 'vite-plugin-compression';
plugins: [ /* ... */ viteCompression({ algorithm:'gzip', ext:'.gz', threshold:1024 }) ]

# frontend-user/nginx.conf  (js/css location)
location ~* \.(...|css|js)$ { gzip_static on; add_header Cache-Control "...immutable" always; try_files $uri =404; }

# nginx/conf.d/user.conf  静态 location 内新增
proxy_set_header Accept-Encoding "gzip";

# nginx/conf.d/user.conf  非 hash 文件
location = /og-image.png { proxy_pass http://frontend_upstream; proxy_hide_header Cache-Control; add_header Cache-Control "public, max-age=86400" always; include /etc/nginx/conf.d/security-headers.inc; }
```
- **备选**:3A 备选:只降 gzip_comp_level 或对 js/css 关外层 gzip——都治标,HIT 仍重压或牺牲压缩率,不如 gzip_static 根治。3A 另一备选:把 Accept-Encoding 加进 proxy_cache_key——AE 字符串杂乱会碎片化缓存、命中率暴跌,不如强制归一。3C 备选:给 .bcmap 上 1y immutable(审计建议),但 cmap 文件名无版本号,pdfjs 升级后同名异容→immutable 顽固 stale,故选 30d。
- **风险**:3A 最大风险是缓存变体污染,已用 `proxy_set_header Accept-Encoding "gzip"` 归一化消除;须验证外层不会对 Content-Encoding:gzip 响应二次 gzip(nginx gzip 模块对已编码响应默认跳过,遵守本仓库『绝不双压』铁律)。vite-plugin-compression 属构建期工具(周下载量高、活跃),仅 devDependency 不进运行时 bundle,符合 frontend-user/CLAUDE.md §2 第三方门槛。3B/3C 是纯 nginx location 增量,风险极低;唯注意本仓库铁律:nginx location 一旦自带 add_header 就不再继承 http 级安全头,新加 location 须 `include security-headers.inc`(user.conf 现有 location 都这么做)。部署注意:inner nginx.conf 变更打进镜像;assets/index.html 是 bind-mount+镜像层缓存,配置类改动可能需 --no-cache / force-recreate 才生效。
- **验证**:3A: `curl -sI -H 'Accept-Encoding: gzip' http://localhost:5411/assets/<chunk>.js` 见 `Content-Encoding: gzip` 且 `X-Cache-Status: HIT` 时响应仍带 gzip;对比改前后外层 nginx CPU(docker stats)在压测下降。3B: `curl -sI http://localhost:5411/og-image.png` 见 max-age=86400。3C: 打开带中文 PDF 预览,`curl -sI http://localhost:5411/pdfjs-cmaps/Adobe-GB1-UCS2.bcmap` 见 max-age=2592000 而非 no-cache。
- **依赖**:无(与 finding 1/2 完全独立,可任意先后)

#### 本簇落地顺序
1) 先落 finding 1 的最小 touch 修复(P0,<1h,单行):这是拆定时炸弹,优先级压倒一切,独立可上、可回滚(删掉那一行即回到旧行为)。2) 紧随把 finding 1 升级为理想重构,叠加 finding 2 的体积上限兜底 + 回收失败可见性(同一文件、同一次改动,顺带把 ASSET_RETAIN_DAYS/ASSET_MAX_MB 写进两份 compose)。这两步共用 sharedRefactors,建议一个 PR 内分两个 commit(commit1=touch 修复保证可单独回滚,commit2=size cap + 可见性)。3) finding 3 三个子项(P2 清理)与前两者零耦合,可另开 PR 从容做;其中 3A(gzip_static)动到构建链+双层 nginx,单独验证充分再上,3B/3C 是纯 location 增量随时可搭车。理由:P0 必须最快、最小、最可回滚地止血;体积兜底是同文件顺手加固;性能清理不阻塞稳定性修复。

#### 待人拍板
1) 回收语义二选一,需要人拍板:方案A『time-based(touch)+ 体积上限兜底』(本报告主推,open-tab grace 语义最准,但保留窗口按天不按部署次数)vs 方案B『generational manifest 按最近 N 份构建清单保留』(审计原建议,时间+体积天然有界,但高频发版会在几分钟内淘汰仍被老 tab 引用的 chunk)。两者都已在 scratchpad 验证可行;我推荐 A,因为本功能的初衷正是『老标签页开着一段时间仍能拉到它那版 chunk』,这是时间维度的诉求。2) ASSET_MAX_MB 兜底阈值定多少:实测当前 470MB,建议 800MB 留余量;若宿主磁盘紧张可调低,但要保证 > 单次构建全量产物大小 × 2(至少覆盖新旧两代)否则会频繁误删 grace 层。3) finding 3C 的 .bcmap 给 30d 还是 1y immutable:取决于 pdfjs-dist 升级频率与是否接受升级后靠 30d 自然过期;我建议 30d 稳妥。4) finding 3A 是否值得为『HIT 重压』这点 CPU 引入构建期压缩插件+双层 nginx 改动——若当前外层 CPU 压力不大,3A 可延后,3B/3C 先上(收益明确、改动小)。


---

### 簇:agentbridge 桥接热路径(全局锁/流式O(N²)/事件表无界) `stability-bridge-hotpath`

**整体判断**:本簇的核心矛盾是:agentbridge 把「持久化/网络 IO」压进了几把粗粒度锁的临界区,又缺表生命周期管理。三类系统性问题反复出现在 21 条发现里:①一把进程级 deltaBatcher.mu 在通道满时锁内同步写 MySQL(#3/#8/#19,平台级串行冻结);②一把 Bridge 级 hubsMu 在临界区内做 WS dial+多次 DB 读+重试 sleep(#13/#18,全站新会话建连串行);③流式 replayBuf 每帧 O(已累积长度) re-marshal(#1/#12,长回复二次方 CPU + 持 h.mu)。另有 agent_turn_events 作为「历史唯一真源」却零 TTL/分区只到 2026-09(#2/#9,时间敏感,10 月前处理成本最低)、一个已随 fork 退役失效的 journal 校验器仍每 60s 全量比对且必产假阳性(#5,纯配置即可关)。其余是可感知但局部的清理项(附件双拷 #14、SSE 双序列化 #16、HTTP 池定容 #15、EffectiveTier 重复查 #6/#11、活跃度节流 #17、无 WriteDeadline #21、admin 缺索引 #10)。总体策略:先做 4 个统一改法(B 批量落库/锁外、C per-key singleflight、A 流式增量结构、D 表生命周期),它们一次性覆盖 9 条发现;剩余 8 条是彼此独立的小手术,可并行。#20 经核实为有意设计,不改。整簇改动均可分期、可回滚(多数受 env flag / 新增迁移保护),无一触碰铁律。

#### 统一改法(一次解决多个发现)

**◆ B · deltaBatcher 落库脱离全局锁 + 批量 INSERT**
- 一次解决:#3 / #8 / #19(三条是同一处 enqueue 通道满时持 b.mu 同步 createWithRetry 的重复描述)
- 设计:改 eventlog_batcher.go。① enqueue 拆成两段:锁内只做「取号 + 构行 + 尝试非阻塞入 writeCh」,通道满不再在锁内 createWithRetry;而是把该行挂到一个 b.overflow []*TurnEventRow(受 b.mu 保护)或直接返回给调用方,由 append/flushDeltaLocked 等调用点在 b.mu.Unlock() 之后统一 createWithRetry(与既有终态事件 case 完全同款手法——终态路径已经是『锁外收集 dRow/tRow/evRow 再同步写』的正确范式,把普通路径对齐它即可)。具体做法:让 buildDeltaRowLocked/buildThinkRowLocked 返回行,flushDeltaLocked/flushThinkLocked 改为返回 *TurnEventRow(不再自行 enqueue),由 append 顶层在解锁后决定入队或(通道满)同步落库。② writeLoop 改批量:for range writeCh 时先取一行,再 for+select default 尽量凑到 ≤64 行或 4ms 微批,CreateInBatches 一次多行 INSERT,提升排空速率、从根上降低通道打满概率。③ 通道满且批量仍写不动时,对 content_delta 这类可由终态兜底的行允许丢弃 + failCnt 计数(journal 已有 failCnt/slog.Error 可观测通道),只对终态(message_complete/error)保证同步持久——终态本就走锁外同步路径,不受影响。最小可行档:只做 ①(把通道满的 createWithRetry 移出 b.mu),即消除『MySQL 抖动持全局锁冻结全平台流式』这一 P0 敞口,约 30 行。理想档:①+②+③。

**◆ C · hub 创建 per-key singleflight(锁外 dial/seed/DB)**
- 一次解决:#13 / #18(同一处 getOrCreateHub 全局 hubsMu 包住 newHub 的 dial+DB+sleep)
- 设计:改 hub.go getOrCreateHub + newHub 拆段。把 b.hubs(sync.Map)的值类型从 *sessionHub 改为一个带 ready chan 的 hubSlot{hub *sessionHub; err error; ready chan struct{}}。getOrCreateHub 逻辑:LoadOrStore 一个 pending slot(此处用 sync.Map 的 LoadOrStore 天然是 per-key 原子,可完全去掉全局 hubsMu);若本 goroutine 是创建者(loaded==false),在锁外调 newHub(dial + seedHistoryFromJournal + sendInitialModel 都在这里,不持任何全局锁),done 后填 slot.hub/err 并 close(ready);其余等待者 <-ready 后读结果。创建失败(dial 不通)从 sync.Map 删除该 slot,让后续请求重试。这样同一 (feature,session) 的并发首连仍只 dial 一条上游(保住 jsonl 单写者不变式),不同 session 建连完全并行。配套:agentDialer.Dial 换 DialContext 挂一个带超时的 ctx(现在 Dial 不可取消)。最小可行档:仅去掉全局 hubsMu、换 sync.Map LoadOrStore + ready chan(不动 dialer),即解决串行化。理想档:再把 Dial→DialContext。

**◆ A · 流式帧解析一次 + replayBuf 增量结构**
- 一次解决:#1 / #12(同一处 coalesceReplay O(内容²)),并为 #4 提供折叠原语
- 设计:改 hub.go。① 用 h.pendingDeltaText strings.Builder + h.pendingNonDelta [][]byte 取代 replayBuf [][]byte + coalesceReplay:broadcastAgent 在 inFlight 时,若帧是纯文本 content_delta 则只 WriteString(可复用已解析出的 txt,不再对旧帧 re-marshal);其余帧 append 到 pendingNonDelta。addSubscriber 补帧时(且仅在需要补帧时)一次性把 pendingDeltaText 物化成一帧 content_delta + 交错回放 pendingNonDelta。注意保序:content_delta 与 tool_use/tool_result 的交错顺序对渲染有意义,故 pendingNonDelta 需记录『插入点』——最简做法是遇到非 delta 帧时先把当前 Builder 冻结成一帧压入一个统一的 replay []frame、再压该非 delta 帧、再开新 Builder(即『段式』合并:同段连续 delta 只累加,跨段边界才物化)。这仍是 O(内容块) 物化次数,消除每帧 re-marshal。② upstreamLoop 顶部对每帧 frameType(data) 解析一次,把 type(必要时连 text)沿路传给 case 分支 / classifyJournalEv / batcher,消掉 frameType+contentDeltaText+extractDeltaText 对同帧的 2-3 次重复整帧 Unmarshal。最小可行档:只做 ①(replayBuf 增量),因为二次方是主症。理想档:①+②。

**◆ D · agent_turn_events 表生命周期(分区滚动 + 保留 + 级联删)**
- 一次解决:#2 / #9(同一张表零 TTL、分区只到 2026-09)
- 设计:两条腿。① 迁移侧:新增 docker/mysql/migrations/00NN_agent_events_partitions_indexes.sql,用幂等存储过程思路补建 2026-10 起若干月分区(REORGANIZE PARTITION p_future INTO (p2610,...,p_future)),并顺带把 #10 的 idx_feature_accessed 索引一起加(同文件)。因分区 DDL 不像加列有现成幂等过程,需写成『先查 information_schema.partitions 是否存在该分区名,不存在才 REORGANIZE』的存储过程(参照 0000_utils.sql 的 add_column_if_not_exists 写法新增 add_partition_if_not_exists)。绝不 DROP TABLE。② 后台任务侧:在 cleanup.go 加两个 runDaily 任务——(a)每月预建下月分区(REORGANIZE p_future);(b)按保留期 DROP PARTITION 整月(DROP PARTITION 是唯一对分区表『秒删一个月』且不产生 undo 的手法,比 batchDeleteByCreatedAt 高效得多;保留期建议 ≥90 天,可配)。删分区需先确认该分区最大 created_at < cutoff。会话删除级联(#2 建议③)可作为 P2 追加:删会话时 DELETE agent_turns/agent_turn_events WHERE agent_session_id=?(有 idx_sid_id 支撑)。③ 把 batcher.writeFailures() 与三张 agent_* 表的行数/分区数纳入现有 slog 容量观测。最小可行档:先做迁移补分区(避免 10 月后全落 p_future 这一即时风险)+ 每月预建任务。理想档:再加保留期 DROP PARTITION + 会话级联删。

**◆ E · EffectiveTier / 窗口读单次化**
- 一次解决:#6 / #11(同一条 user_message 链上 EffectiveTier + loadWindow 被 3-4 次重复调用)
- 设计:两选一。手法1(改动最小、最稳):给 vip.Service.EffectiveTier 加进程内短 TTL 缓存(照抄 modelcatalog.Service 的 snapshot:sync.Map[uint]{tier,exp,readAt},30s TTL;授予/到期/升级路径已知的写点主动 invalidate)。因 EffectiveTier 是纯 users 主键点查、tier 变更本就有明确写入口,30s �当量误差可接受。这一处即同时消掉 #11 的 3-4 次 users 查询与 #6 里配额闸/预算盖章各自的一次。手法2(彻底但侵入大):在 handleUserMessage 入口读一次 tier + 一次 loadWindow,经 hookCtx 或新参数把结果透传给 revalidateModelBeforeMessage / PreUserMessage / BudgetProvider 三处复用——需改 FeatureSpec 钩子签名,风险高。推荐手法1。

#### 逐条实施方案

##### [🔴 P0 · M(半天)] #3/#8/#19 deltaBatcher 通道满时持全局 b.mu 同步落库(含 3 次重试+退避),MySQL 抖动串行冻结全平台所有会话的流式转发。位置 eventlog_batcher.go:176 enqueue

- **代码确认**:确认仍在。enqueue(eventlog_batcher.go:176-186)通道满/closed 时回落 createWithRetry(85-100,3 次+20/40ms 退避);其全部调用点均持 b.mu:flushDeltaLocked(163-167)/flushThinkLocked(169-173)由 append 在持锁段调用(232-244、257-269),普通非流式分支 292-297 也在 b.mu 内。deltaBatcher 是 eventlogStore 单例(eventlog_store.go:33 newDeltaBatcher),经 TurnCoordinator.Append→batcher.append 承接所有 feature/所有会话事件。终态事件(280-289)已是正确范式:锁外收集 dRow/tRow/evRow 再同步写。
- **改动点**:eventlog_batcher.go: enqueue / flushDeltaLocked / flushThinkLocked / append / writeLoop
- **做法**:见 sharedRefactors[B]。最小可行:把通道满的 createWithRetry 移出 b.mu(append 顶层解锁后再写,复刻终态路径);理想:再加 writeLoop 批量 CreateInBatches + content_delta 可丢弃降级。
- **备选**:可只丢弃+计数不做锁外同步——但会牺牲 journal 完整性(它是历史唯一真源),故仍保留终态同步 + 普通行锁外重试,不纯丢。
- **风险**:ev_seq 取号必须仍在 b.mu 内完成(UNIQUE(turn_id,ev_seq) 硬约束,注释 eventlog_batcher.go:28-30 已强调),只把『落库动作』移出锁,取号/构行留锁内——顺序不能反。批量 INSERT 要保证同一 turn 的行仍按 ev_seq 递增落库(CreateInBatches 保持切片顺序即可)。丢弃 content_delta 降级只在通道持续满时启用,且终态兜底不能丢。
- **验证**:构建:docker compose build backend。压测:并发多会话长流式下人为拖慢 MySQL(如 sysbench 占用或临时加 sleep),观察 docker logs 中流式广播是否仍顺畅、writeFailures 计数;正常路径核对 agent_turn_events 行 ev_seq 无空洞/无重复。回归:单会话历史回放内容完整。
- **依赖**:无

##### [🟠 P1 · M(半天)] #13/#18 全局 hubsMu 持锁执行 WS dial(HandshakeTimeout 10s,不可取消)+ 多次 DB 读 + 重试 sleep,串行化全站所有新会话 WS 建连。位置 hub.go:146 getOrCreateHub

- **代码确认**:确认仍在。getOrCreateHub(hub.go:141-157)b.hubsMu.Lock()/defer Unlock() 包住 f.newHub;newHub(184-239)锁内做 agentDialer.Dial(197,ws.go:79 HandshakeTimeout 10s)、resolveAlreadyInjected(DB 读 + 3s transcript 探测)、seedHistoryFromJournal(ReadRecentTurns 3 SQL + GetSessionMessages HTTP + 重试 sleep)、sendInitialModel(FindByAgentSessionID + 最多 3×200ms sleep)。hubsMu 是 Bridge 唯一一把(bridge.go:49),跨所有 feature/用户共享。
- **改动点**:hub.go: getOrCreateHub / newHub;bridge.go: hubs 字段(已是 sync.Map)
- **做法**:见 sharedRefactors[C]。用 sync.Map.LoadOrStore 存带 ready chan 的 hubSlot,去掉全局 hubsMu;创建者锁外跑 newHub 全部 IO,等待者 <-ready。Dial→DialContext。
- **备选**:用 golang.org/x/sync/singleflight.Group 按 hubKey 分组——语义等价且更少手写并发代码,但引入依赖;sync.Map+ready chan 无新依赖,倾向后者。
- **风险**:必须保证同 key 只有一个创建者真正 dial(否则回到 jsonl 双写)——LoadOrStore 的 loaded 返回值即唯一裁决点,严格用它。创建失败要从 map 删 slot(否则该 session 永久卡在失败 slot);removeHub 的 CompareAndDelete 需适配新值类型。等待者要处理 slot.err(dial 失败时所有等待者都拿到 err)。
- **验证**:构建 backend。手动:并发对不同 session 发起首连(多 tab 或脚本),观察建连不再互相阻塞(可临时在 newHub dial 前加日志时间戳对比);对同一 session 并发首连仍只创建一条上游(日志 'agentbridge hub: created' 每 session 一次)。回归:单连正常、grace 重建正常。
- **依赖**:无

##### [🟠 P1 · M(半天)] #1/#12 流式 replayBuf coalesceReplay 每 content_delta 帧 O(已累积块长) re-marshal(持 h.mu),长回复二次方;且每帧 frameType/contentDeltaText/extractDeltaText 重复 2-3 次整帧解析。位置 hub.go:1244

- **代码确认**:确认仍在。broadcastAgent(hub.go:699-712)inFlight 时在 h.mu 内调 coalesceReplay(1244-1258);coalesceReplay 对每个新 delta 帧:contentDeltaText 解析新帧(1245)+ contentDeltaText 解析 buf 末帧(1250)+ json.Marshal 拼 last+txt 整段(1251)。upstreamLoop 另在 797 frameType(data)、classifyJournalEv 再 frameType、batcher append 再 extractDeltaText,同帧多次浅解析。
- **改动点**:hub.go: sessionHub 字段(replayBuf→pendingDeltaText+段结构)、broadcastAgent / addSubscriber / beginTurn / endTurn / coalesceReplay(删)、upstreamLoop(解析一次下传)
- **做法**:见 sharedRefactors[A]。段式增量:连续 delta 只 WriteString,跨非 delta 边界才物化成一帧。addSubscriber 补帧时一次性物化。upstreamLoop 顶部解析 type 一次沿路传。
- **备选**:发现审计建议②:生产上 journal 续流已可用(readFromJournal 为真),inFlight 时可直接跳过 replayBuf 维护、补帧走 ReadInFlightEvents。这更彻底(replayBuf 完全退役)但依赖 journal 读路径在所有补帧场景可靠,风险略高;建议作为 A 落地后的 P2 后续,先做增量结构保内存路径兜底。
- **风险**:补帧保序是关键:content_delta 与 tool_use/tool_result 交错顺序影响前端渲染,段式物化必须在遇到非 delta 帧时先冻结当前 delta 段。beginTurn 清空/endTurn 清空要同时清 Builder 与段列表。迟到补帧路径(addSubscriber 897-905 内存 fallback 分支)要改读新结构。h.mu 语义不变(仍保护这些字段)。
- **验证**:构建 backend。手动:发起一条很长的流式回复(数千 token),中途开第二个 tab 加入(触发补帧),核对补帧内容与 A tab 完全一致、无重复/无乱序;用 pprof 或粗测 CPU 观察长回复期间 broadcast 路径 CPU 不再随长度二次增长。
- **依赖**:无

##### [🟠 P1 · L(1-3天)] #2/#9 agent_turn_events 零 TTL/清理/级联,月度 RANGE 分区只到 2026-09(之后全落 p_future),作为历史唯一真源无界膨胀;200ms flush 使行数≈流式时长/200ms。位置 0046 迁移:52 / cleanup.go

- **代码确认**:确认仍在。0046_agent_turn_journal_fields.sql:52-58 分区止于 p2609 + p_future MAXVALUE。cleanup.go Start(80-122)只挂 hot_content/usage_events/llm_token_usage/credits/orders/reconcile/library,无任何 agent_turn_events/agent_turns/agent_billing_ledger 清理。batchFlushInterval=200ms(eventlog_batcher.go:34)确使持续流式每 200ms flush 一行。
- **改动点**:新迁移 docker/mysql/migrations/00NN_*.sql(补分区 + add_partition_if_not_exists 存储过程);0000_utils.sql(新增分区存储过程);cleanup.go: Start + 新 cleanAgentEventPartitions 任务
- **做法**:见 sharedRefactors[D]。迁移补 2026-10 起分区(幂等 REORGANIZE p_future);cleanup 加每月预建 + 保留期 DROP PARTITION;可选会话级联删。可与 #10 索引合并同一迁移文件。
- **备选**:审计建议②:message_complete 后把同 turn 多行 content_delta 压成 1 行——可减行放大,但读侧 FoldToMessages 已能兼容多行,分区滚动是更根治的容量方案,压缩合并可作 P2 补充。把 200ms flush 改为『块结束/4KB 才落行』会减行,但增崩溃截断窗口,与既有 M5 flushTurnSync 语义有张力,不建议动。
- **风险**:分区 DDL 非加列,须自建幂等守卫(查 information_schema.partitions 存在才跳过),避免重放报错——这是本仓库迁移铁律(幂等)。DROP PARTITION 不可回滚,保留期要足够保守(≥90 天)且删前校验分区内最大 created_at < cutoff。REORGANIZE p_future 会短暂锁表:选低峰(cleanup 已用 04:xx 窗口)。绝不 DROP TABLE。schema-sync 容器 bind-mount 迁移目录,新增文件需重启 schema-sync 生效。
- **验证**:docker-compose restart schema-sync backend;docker logs scholar_schema_sync 确认迁移成功;SHOW CREATE TABLE agent_turn_events 看到 2026-10+ 分区;人工触发 cleanAgentEventPartitions(或调早时间)验证 DROP/REORGANIZE 正确。幂等:重复重启 schema-sync 不报错。
- **依赖**:无

##### [🟠 P1 · S(<1h)] #5 journal 校验器(AGENT_JOURNAL_VALIDATE=on)已随 fork 退役失效:每 60s 扫描 + 每会话 3 次 DB 读 + 全量 transcript HTTP,对 >20 轮会话必产假阳性 ERROR。位置 eventlog_validate.go:91

- **代码确认**:确认仍在且确在运行。.env:78 AGENT_JOURNAL_VALIDATE=on + .env:76 AGENT_TURN_JOURNAL=shadow → bootstrap.go:167-171 启动 validator.Run。且 .env:73 AGENT_EXECUTOR_FEATURES=smart_search,claw,prism,peerreview + docker-compose.yml:280-281 AGENT_EXECUTOR_BASE_URL 与 AGENT_BASE_URL 同为 scholar_agent:3456 → 校验器的 client.GetSessionMessages(eventlog_validate.go:97)打到的正是它 seed 的同一个无状态 executor;executor H5 滑窗只保留截断视图,journal 存全 20 轮 → assistant_text/tool_sequence 必不等 → journal_validate_mismatch ERROR 假阳性(compareSession 101-117)。每 60s scanOnce 拉 200 turn + 每会话 ReadRecentTurns(20)(Count+Pluck+Find)+ GetSessionMessages HTTP。
- **改动点**:.env(关闭 AGENT_JOURNAL_VALIDATE)+ docker-compose.yml/.prod.yml 若透传该 env 也一并;可选 eventlog_validate.go(改造为自洽校验)
- **做法**:最小可行:.env 把 AGENT_JOURNAL_VALIDATE 从 on 改 off(或删行),bootstrap 不再启动 validator——纯配置,零代码。理想:若仍想要在线安全网,把 compareSession 改为『只校验 journal 内 ev_seq 连续性 + 每 turn 终态(message_complete/error)完整性』,不再对比 executor 内存视图(删 client 依赖),量级降到纯 DB。
- **备选**:保留但把频率从 60s 降到 30min + 只在 executor 返回非空且轮数≤窗口时比对——治标,仍有假阳性根因(滑窗截断),不如直接关或改自洽校验。
- **风险**:关闭后失去『journal vs 真源』在线比对——但 fork 已退役、journal 已是唯一真源,该比对的基线本身已不存在,失去的是噪声。改代码档需确保不误删 JournalValidateMismatchCount 的其它引用(集成测试可能读)。这是运维配置变更,按铁律我只设计不改文件。
- **验证**:改 env 后 docker-compose restart backend;docker logs scholar_backend 不再出现 'journal==daemon validator enabled' 与周期性 journal_validate_mismatch;确认无其它代码路径强依赖该 goroutine。
- **依赖**:无

##### [🟠 P1 · M(半天)] #4 迟到续流补帧在 writeLoop 启动前用非阻塞 trySend 塞 256 容量队列,长在途轮(journal 事件 >256 行)静默丢弃补帧尾部——恰好丢最新内容。位置 hub.go:592

- **代码确认**:确认仍在。addSubscriber(hub.go:561-621)在 h.mu 内用 trySend(1235-1240,满即丢)把 userEcho + jEvs 全部事件(594-596)或 replayBuf(602-604)塞进 sub.out(cap subOutBuffer=256,hub.go:48);消费者 sub.writeLoop 在解锁后 619 才启动 → 补帧阶段零消费。journal 在途行数 ≈ 流式时长/200ms,长轮 >256。
- **改动点**:hub.go: addSubscriber(补帧折叠 / 或拆两段先 drain 再注册 live)
- **做法**:最小可行:补帧不逐帧塞队列——在锁外(第一段已在锁外读 jTurn/jEvs)先把 jEvs 用 sharedRefactors[A] 的同款段式折叠成少量帧(content_delta 合并),再入队,使补帧总帧数远小于 256。理想:把『注册 sub + 补帧』与『启动 writeLoop + 注册 live 广播』拆两段——先启动 writeLoop 让它开始 drain,再在持锁下补帧 + 注册进 subs(需仔细处理补帧与首个 live 帧的边界不重不漏,当前注释 hub.go:20-21 的不变式)。至少:trySend 丢弃时记 slog + 给前端发一个 resync 提示帧,让前端重拉历史。
- **备选**:仅把 subOutBuffer 调大——治标不治本(仍有上界),不采纳。
- **风险**:拆两段会动『补帧与 live 不重不漏』的核心不变式(hub.go:19-21),风险最高,需红队;段式折叠(依赖 A)风险低但补帧仍可能在极端超长轮超 256——故折叠 + resync 兜底组合最稳。resync 帧前端需已支持(检查 shared/hooks useAgentSocket resync_* 是否已有处理)。
- **验证**:构建 backend。手动:制造一条超长在途轮(>256 journal 行,可临时调小 subOutBuffer 复现),中途新 tab 加入,核对补帧不再丢尾部(内容完整到最新);若走 resync 兜底,确认前端收到后重拉历史补齐。
- **依赖**:A(共享折叠原语);可独立先上 resync 兜底

##### [🟠 P1 · S(<1h)] #21 hub→agent 上游写无 WriteDeadline,agent 容器 TCP 假死时该会话所有写方(user_message/pingLoop/permission/模型帧)阻塞并持 agentWriteMu,依赖 60s 读超时间接解救。位置 hub.go:741

- **代码确认**:确认仍在。writeAgent(hub.go:741-745)WriteMessage 前无 SetWriteDeadline(全文件仅前端方向 frontWriteDeadline,hub.go:991/writeLoop)。agentWriteMu 串行化该 hub 全部上游写。agentReadDeadline=60s(ws.go:91)是唯一间接解救。
- **改动点**:hub.go: writeAgent(写前加 SetWriteDeadline);ws.go(新增 agentWriteDeadline 常量)
- **做法**:writeAgent 内 WriteMessage 前加 h.agentConn.SetWriteDeadline(time.Now().Add(agentWriteDeadline))(建议 10s,与内网延迟量级匹配)。写超时即返回 error,由既有调用方错误路径(handleUserMessage 的 h.endTurn()、pingLoop 的 return→shutdown)走收尾,把最坏 60s 无响应缩到 10s 并让用户尽早拿到可重试错误。
- **备选**:无更优;这是标准 WS 写超时加固。
- **风险**:极低。10s 对内网正常写绰绰有余(帧至多几十 KB),不会误伤慢但活的连接。gorilla WriteMessage 设了 deadline 后超时连接即不可用——但本就该 shutdown 重建。注意 SetWriteDeadline 对同一 conn 是全局的,agentWriteMu 已串行化写,不会相互干扰 deadline。
- **验证**:构建 backend。手动:docker pause scholar_agent 模拟 TCP 假死,发一条 user_message,确认 ~10s 内返回可重试错误 + hub 走 shutdown(日志 'agentbridge hub: closed'),而非卡到 60s。
- **依赖**:无

##### [🟡 P2 · L(1-3天)] #7 hub 每次重建(3min grace 后回访即触发)全量重组 seed_history:ReadRecentTurns(30) 含 tool_result 大对象 + 记忆 + skills 内联正文一次性重发 executor,与前端同时拉的历史形成双份全量读。位置 hub.go:462

- **代码确认**:确认仍在。seedHistoryFromJournal(hub.go:462-555)执行 ReadRecentTurns(30)(eventlog_store.go:155-176,Count+Pluck+Find 载 30 轮全部事件含 tool_result 原文)→ FoldToMessages → buildCreateOptions(Picker + MemoryBlocks + SessionSkillsProvider 内联全文)→ applySessionProfile → payload 可能数百 KB,newHub 建连即发。
- **改动点**:hub.go: seedHistoryFromJournal;agent executor 握手协议(需 executor 回 hasState 标志);eventlog_store.go: FoldToMessages(截断超大 tool_result)
- **做法**:三档改进(可分步):① executor connected 握手帧带回 hasState(该会话仍在 executor 内存)→ hasState 时 seed 只补 opts(记忆/skills/协议)不重发 messages;② seed 的 messages 剔除/截断超大 tool_result payload(模型续聊几乎不需完整工具原文,executor H5 滑窗最终也裁)——在 FoldToMessages 或 seed 组装处对 tool_result content 设上限(如 >8KB 截断+省略标记);③ MemoryBlocks/skills 与前端 GetSessionMessages 共享短 TTL 缓存。最小可行:先做②(纯 backend 截断,不动协议,立减 payload)。
- **备选**:完全不 seed messages、只靠 executor 内存——不行,grace 后 executor 可能已 GC 该会话,续聊会丢上下文。
- **风险**:①需改 agent 容器握手协议(跨 backend/agent 边界,agent 是黑盒需协同,风险最高);②截断 tool_result 要确认续聊质量不降(工具原文对模型后续引用的必要性——多为检索结果/文件,滑窗本就会裁,风险可控但需回归);③缓存 TTL 内记忆更新延迟(与既有『重连即时生效记忆』设计 hub.go:491-492 有张力,TTL 要短)。
- **验证**:构建 backend。手动:活跃会话触发 grace 重建(等 3min 或调短 hubGracePeriod),抓 seed_history 帧大小对比改前后;续聊多轮核对上下文不丢、模型仍能引用早前工具结论。
- **依赖**:无(②可独立);①依赖 agent 容器协同

##### [🟡 P2 · M(半天)] #6/#11 每条 user_message 的钩子链重复 EffectiveTier(users 主键查)+ loadWindow(2×Redis):revalidateModelBeforeMessage / CheckDailyQuotaOverdraft / RemainingBudget 各查一次,单条消息 ~5×MySQL + ~5×Redis。位置 vip/service.go:91 / hub.go:1106

- **代码确认**:确认仍在。EffectiveTier(vip/service.go:91-98)每次 GetUserVIP 无缓存。handleUserMessage 链:revalidateModelBeforeMessage(hub.go:1083→ValidateUserModel 内含 tier 解析)、PreUserMessage→CheckDailyQuotaOverdraft(quota.go:310-328 调 EffectiveTier+loadWindow)、BudgetProvider→RemainingBudget(quota.go:290-305 再 EffectiveTier+loadWindow)。同一条消息 EffectiveTier 被独立调 3-4 次、loadWindow 2 次。
- **改动点**:vip/service.go: EffectiveTier(加缓存)或 hub.go handleUserMessage + quota.go(透传)
- **做法**:见 sharedRefactors[E]。推荐手法1:EffectiveTier 加 30s 进程内 TTL 缓存(照 modelcatalog snapshot),授予/升级/到期写点 invalidate。同时消掉 #11 的多次 users 查询与 #6 的 tier 重复。loadWindow 两次可作 P2 后续(RemainingBudget 与 CheckDailyQuotaOverdraft 合并为一次 RemainingBudget 判定:soft<=-overdraft 即拒)。
- **备选**:手法2(入口读一次经 hookCtx 透传)彻底但需改 FeatureSpec 钩子签名,侵入 4 个 feature spec,风险高,不优先。
- **风险**:缓存 tier 陈旧窗口(≤30s):会员刚到期/刚升级的边界可能延迟一轮生效——但 revalidateModelBeforeMessage 本就是懒回收语义,30s 可接受;关键是升级路径主动 invalidate(避免用户付费后 30s 内仍被旧上限拦)。缓存要 per-user 且并发安全(sync.Map)。
- **验证**:构建 backend。手动:开 MySQL general log 或加计数,发一条 user_message,确认 users 表点查从 3-4 次降到 1 次;升级会员后即时(invalidate 生效)拿到新 tier。
- **依赖**:无

##### [🟡 P2 · S(<1h)] #14 附件上传 30MB 全量读进内存两份:ParseMultipartForm(30MB) + io.ReadAll 再拷一份(峰值 ~2×文件),下游 PushSessionFile 本已支持流式。位置 agentattach/upload.go:202

- **代码确认**:确认仍在。parseAndValidateUpload(upload.go:159-207)c.Request.ParseMultipartForm(MaxFileBytes=30MB)(160)使 ≤30MB part 驻留 RAM 不落盘;readMultipart(322-329)对同一 fh 再 io.ReadAll 完整复制;pushToSession(210-234)把 body 包 bytes.NewReader 传 PushSessionFile(221)。PushSessionFile(client.go:221)签名收 io.Reader,已流式。
- **改动点**:agentattach/upload.go: parseAndValidateUpload(降 maxMemory + 删 io.ReadAll)、pushToSession / HandleUpload / UploadToSession(改传 reader)、readMultipart(删)
- **做法**:① ParseMultipartForm 的 maxMemory 从 MaxFileBytes(30MB)降到 4~8MB(超出 net/http 自动 spill 到临时文件并自管清理);② 删 readMultipart 的 io.ReadAll,把 fh.Open() 的 reader 直接传 PushSessionFile(校验只用 fh.Size + mime/ext,不需字节在手)。parseAndValidateUpload 返回 fh 而非 body,pushToSession 内 f,_:=fh.Open(); defer f.Close(); PushSessionFile(...,f)。
- **备选**:保留 io.ReadAll 但只降 maxMemory——仍有一份 ReadAll 拷贝,收益减半,不如两步都做。
- **风险**:reader 是一次性流:若 PushSessionFile 内部需重试或 seek 会失败——需确认 client.go:221 的实现不重读 body(它把 reader 直接写进 multipart 请求 body,单次消费,OK)。校验顺序不变(类型/大小先行、不建会话)。spill 到临时文件依赖容器 /tmp 可写(bwrap 沙箱是 backend 容器非 agent,正常可写)。
- **验证**:构建 backend。手动:上传 25MB PDF,观察 backend 容器内存峰值不再 ~2×文件;附件正常推达 agent 会话、前端 attachments[].path 可用、大模型能读。
- **依赖**:无

##### [🟡 P2 · S(<1h)] #15 agent HTTP 共享 Transport 按低频管理接口定容(MaxConnsPerHost=10 / MaxIdleConns=10),却承载全部会话/文件/历史流量;且 http.Client 全局 Timeout=10s 与每调用 ctx 叠加、更小者胜。位置 agent/httpclient.go:25

- **代码确认**:确认仍在。sharedTransport(httpclient.go:25-36)MaxIdleConns:10/MaxIdleConnsPerHost:5/MaxConnsPerHost:10,注释明写是给低频 /api/providers。NewClient(client.go:48-53)把 GetHTTPClient(roundTripTimeout=10s,client.go:35)用于所有操作,含 GetSessionMessages(client.go:735,响应上限 maxAgentResponseBytes=48MB,client.go:1070)、PushSessionFile。全局 Client.Timeout=10s 会截断大文件/大历史传输。
- **改动点**:agent/httpclient.go(独立会话池 Transport);agent/client.go: NewClient(会话操作用新池 + 去全局 Timeout)
- **做法**:为会话/文件/历史类操作用独立 Transport(MaxConnsPerHost 64~128,MaxIdleConnsPerHost 32),providers 推送保留小池;去掉 http.Client 全局 Timeout=10s,统一每调用 context.WithTimeout(现在两处叠加且 client 更小,让 ctx 生效)。可在 Client 内持两个 httpClient(providers 用小池、sessions 用大池),或 NewClient 直接用大池 + 各方法自带 ctx 超时。
- **备选**:只增大现有池不拆两个——简单,但 providers 低频池与会话高频池混用失去隔离初衷;拆两个更清晰。
- **风险**:去掉全局 Timeout 后,任何漏挂 ctx 超时的调用会永久阻塞——需核对 client.go 所有方法(GetSessionMessages/PushSessionFile/PushConfig 等)都有 context.WithTimeout(已见 client.go:159 roundTripTimeout ctx、pushOverallTimeout);PushSessionFile/GetSessionMessages 若目前只靠 client.Timeout 兜底,须补 per-call ctx 超时(如 pushFileTimeout=30s 已在 upload 侧挂,GetSessionMessages 需确认有 ctx)。连接池增大增加 agent 容器并发压力,需与 agent 侧承载力匹配。
- **验证**:构建 backend。压测:并发多会话历史拉取 + 大文件推送,观察不再因连接池 10 上限排队;上传接近 30MB 文件不再被 10s Client.Timeout 截断。
- **依赖**:无

##### [🟡 P2 · S(<1h)] #16 AI SSE 转发每 chunk 反序列化后又 json.Marshal 重序列化,原始 data 字符串可直通。位置 ai/service_llm.go:148

- **代码确认**:确认仍在。streamResponse(service_llm.go:116-167)对每个 SSE chunk json.Unmarshal 成 ChatCompletionChunk(137,取 usage/判空 delta 需要),但转发时又 json.Marshal(chunk)(149)重序列化再写(154)。data(131)本就是上游原始 JSON,前端只消费 delta.content,直接 Fprintf(writer,'data: %s',data) 语义等价省一次 O(chunk) 序列化。
- **改动点**:ai/service_llm.go: streamResponse(转发处写原始 data)
- **做法**:转发处直接写原始 data 字符串:Unmarshal 仍保留(用于判 chunk.Usage != nil 抓 usage 和 len(chunk.Choices)>0 && Delta.Content!='' 判空),但把 fmt.Fprintf(writer,'data: %s\n\n',string(chunkJSON)) 改为写 data(原始串)。
- **备选**:scanner.Bytes() 切片判空免再拷——可叠加做,但 data:=strings.TrimPrefix 已产字符串,收益小,主改是免 Marshal。
- **风险**:极低。唯一差异:若上游 chunk 含前端需要但 ChatCompletionChunk 结构未映射的字段,重序列化会丢它们——直通反而更保真。判空逻辑不变(仍靠解析后的 chunk)。注意 data 可能含多余空白但 SSE 无碍。
- **验证**:构建 backend。手动:走一次 AI SSE 流式(该链路是 internal/ai 非 agentbridge——确认调用方仍在用),前端渲染正常、usage 记账正常。
- **依赖**:无

##### [🟡 P2 · S(<1h)] #17 每个已认证 HTTP 请求 spawn goroutine + 2×Redis SETNX 做活跃度节流;高频轮询/列表页每秒每用户产生 goroutine+Redis 往返(DB 写已节流,Redis+goroutine 未节流)。位置 user/service.go:187

- **代码确认**:确认仍在。RecordActivity(service.go:187-230)每次 safego.Go 起 goroutine,内做 2×SETNX(user:lastactive:<id> 5min + user:dau:<id>:<date> 26h)。DB 写被节流,但 goroutine 生成 + Redis 往返本身每请求都发生。由 AuthMiddleware 每认证请求调(memory 载 auth.go activityHook)。
- **改动点**:user/service.go: RecordActivity(入口加进程内快路径)
- **做法**:入口加 sync.Map 存 per-user{lastActiveAt, dauDate}:5min 内且今日已记 → 直接 return(不起 goroutine、不打 Redis)。仅当进程内快路径未命中才走现有 goroutine+Redis 兜底(Redis 保留作跨重启/多实例兜底)。
- **备选**:把节流完全移到进程内不打 Redis——多实例下会各记各的,破坏 dau 台账去重,不采纳;Redis 保留作跨实例真源。
- **风险**:进程内缓存跨重启清零(重启后首请求会多走一次 Redis,可接受);多实例各自缓存(Redis SETNX 仍是跨实例真源,快路径只是省往返,不破坏正确性)。sync.Map 无界增长——但 key 是 userID,活跃用户有限;若担心可配 map 定期清理或用 LRU。时间比较用 time.Now()(铁律,不转 UTC)。
- **验证**:构建 backend。手动:同一用户高频轮询(如每秒),观察 backend goroutine 数与 Redis MONITOR 中 SETNX 频次显著下降(降到 ~5min 一次);last_active_at 与 user_daily_active 台账仍每日/每 5min 正确落。
- **依赖**:无

##### [🟡 P2 · S(<1h)] #10 admin 会话监控列表按 feature_key 过滤 + last_accessed_at 排序无可用索引,COUNT+SELECT 双次全表扫 agent_sessions。位置 admin_monitor.go:42

- **代码确认**:确认仍在。AdminListSessions(admin_monitor.go:42-69)WHERE s.feature_key=? [AND user_id/keyword] ORDER BY s.last_accessed_at DESC,先 Count 再取页。agent_sessions 现有索引(据审计:PRIMARY/uk_agent_session_id/idx_user_feature_accessed(user_id,feature_key,last_accessed_at)/uk_owner/uk_user_feature_single)无以 feature_key 打头的——按 feature 单条件过滤+排序走不到 idx_user_feature_accessed(前导列是 user_id)。
- **改动点**:新迁移 docker/mysql/migrations/00NN_*.sql(可与 #2/#9 的 D 迁移合并同文件)
- **做法**:加迁移 CALL add_index_if_not_exists('agent_sessions','idx_feature_accessed','`feature_key`,`last_accessed_at`',FALSE),让过滤+排序都走复合索引;keyword 模糊搜索保持现状(admin 低频可接受)。
- **备选**:无;这是标准补索引。
- **风险**:极低。加索引幂等(add_index_if_not_exists 已有)。agent_sessions 写频不高(仅建会话/Touch),多一个二级索引写放大可忽略。与 D 合并同一迁移文件减少文件数。
- **验证**:docker-compose restart schema-sync backend;EXPLAIN 该查询确认走 idx_feature_accessed(type=ref,不再 ALL);admin 会话监控列表加载正常。
- **依赖**:可与 D(#2/#9)合并迁移

##### [🟡 P2 · S(<1h)] #20 配额 check-then-act(只读闸门+后置扣减)多会话并发下敞口按会话数放大——经核实有界且属有意设计,非 bug。位置 vip/quota.go:267

- **代码确认**:确认非 bug。CheckDailyQuota(quota.go:267-285)纯只读(loadWindow 后比较不预扣),消耗由 AddUsage(quota.go:333)后置累加。并发防线齐备:单会话 hub inFlight busy 锁(hub.go:750-761 beginTurn)、每条 user_message 有界透支预算 stampBudget(hub.go:1192-1208)、AddUsage Lua CAS 原子换锚 + IncrBy(quota.go:350-363)。敞口=多会话各自起跑一轮的透支,有界。
- **改动点**:(维持现状,无需改)
- **做法**:维持现设计。若将来要收敛多会话放大,可在 PreUserMessage 层加 per-user『并发在途轮数』小上限(Redis INCR/DECR,如 ≤3),或 RemainingBudget 盖章时按在途轮数折减 hard。优先级低,当前不做。
- **备选**:不动即最优。
- **风险**:若强行加并发在途上限,可能误伤合法多 tab 用户;非必要不引入。
- **验证**:无需改动;如实现在途上限,验证多会话并发下总透支收敛到 min(≤N 轮)且合法多 tab 不被误拒。
- **依赖**:无

#### 本簇落地顺序
建议顺序(按稳定性风险 + 依赖):第一批(P0/P1 稳定性,彼此独立可并行)——B(batcher 锁外落库,#3/#8/#19,平台级冻结,最高优先)、#21(writeAgent WriteDeadline,S 工作量,立减最坏 60s 卡死)、#5(关 validator,纯配置 S,立减 60s 周期负载 + 假阳性噪声)、D(#2/#9 表分区滚动迁移,时间敏感须在 2026-10 前落地补分区,同文件带上 #10 索引)。第二批(P1 性能,B 落地后)——C(hubsMu singleflight,#13/#18)、A(replayBuf 增量结构,#1/#12),A 先落地再做 #4(迟到补帧折叠依赖 A 的折叠原语)。第三批(P2 清理,可并行)——E(EffectiveTier 缓存,#6/#11)、#14(附件双拷)、#15(HTTP 池)、#16(SSE 直通)、#17(活跃度节流)、#7(seed 瘦身,先做纯 backend 的 tool_result 截断档)。#20 不动。理由:B 是全平台流式冻结的最大 P0 敞口,先拆;#21/#5/D 都是 S 工作量高性价比且互不依赖,顺手一起上;A 是 #4 的前置;E/#14~#17 是独立小手术,随时插空做。

#### 待人拍板
1. agent_turn_events 保留期定多久?建议 ≥90 天(覆盖用户续聊老会话的合理窗口),但这是产品取舍(历史可回溯期 vs 磁盘)——需人拍板;DROP PARTITION 不可回滚,定保守值。2. #5 validator 是直接关闭(纯 env,最省)还是改造成『journal 内部自洽校验』(留一个轻量在线安全网,需改代码)?倾向直接关,但若运维仍想要 journal 完整性哨兵则做改造档。3. #7 的 seed 瘦身档①(executor 握手带 hasState 跳过重发 messages)需改 agent 容器协议(跨黑盒边界),要不要投入?还是只做纯 backend 的 tool_result 截断档②?建议先只做②。4. #15 去掉 agent Client 全局 Timeout 前,需人确认 client.go 所有会话类方法都已挂 per-call ctx 超时(我只读到部分),漏挂会永久阻塞——落地前要逐方法核一遍。5. E 的 EffectiveTier 缓存 TTL(建议 30s)与升级即时生效的取舍:升级路径必须主动 invalidate,需确认所有 tier 写入口(兑换码/admin 直授/订阅开通/到期回落)都能触发失效——到期回落是无定时任务的懒判定,缓存 30s 内可能延迟拦截,是否可接受需拍板。


---

### 簇:前端首屏 bundle 体积与代码分割 `frontend-bundle`

**整体判断**:本簇是纯前端构建产物优化,核心矛盾是「静态 import 把重依赖焊死在关键路径」——每个发现都是同一个病根的不同发作点:(A) 巨型第三方库(katex 252KB / highlight.js 166KB / codemirror / tiptap / pdfjs)被顶层 static import 拉进同步依赖图,失去按需切分的机会;(B) manualChunks 手工分组既写错(react-dom/client 漏匹配)又过时(table 组含已删依赖);(C) 一堆死代码/死依赖长期挂账。三条主线策略:① 用「内容门控/懒边界」把重库改成 dynamic import(对齐仓库已验证的 MermaidDiagram / CollectFolderPickerGate 模式);② 重写 vite.config 的 manualChunks 为函数式 + minChunkSize,一次修好 vendor 缓存分层、chunk 碎片、markdown/table 分组;③ 一次性清扫死代码死依赖。全部是低风险、可分期、可回滚的改动,无后端/DB/迁移介入。真正需要仔细验证的只有 #1(流式渲染回退不抽搐)和 #4/#7(Prism 编译/PDF/diff 全流程不回归)。

#### 统一改法(一次解决多个发现)

**◆ vite.config.ts manualChunks + output 分块策略重写**
- 一次解决:#3(react-dom/client 漏分块)、#6(365 chunk 碎片/lucide 微块)、#1 的分块侧(markdown 巨块)、#9 的分块侧(table chunk 引用已删依赖)
- 设计:把 build.rollupOptions.output.manualChunks 从『对象数组』改成『函数式 (id)=>...』一次性修好四处:① vendor 用 id.includes('node_modules/react-dom')||'/react/'||'/scheduler/'||'/react-router' 归组——按真实解析路径匹配,react-dom/client.js 与 react/jsx-runtime 都进 vendor,不再漏进 entry(#3);② 删掉 table 条目(react-table 将被卸,react-virtual 交给消费方就近落 lazy 路由块,#9);③ markdown 条目改为只锁 react-markdown+remark-gfm+remark-math(小、共享),不再把 rehype-katex/rehype-highlight 硬拉同块——让 #1 的 dynamic import 产生真实 async 边界后 katex/hljs 各自独立成 async chunk;④ 保留 motion/query 分组。同时在 output 加 experimentalMinChunkSize: 10000(10KB)把 lucide 单图标微块与 <10KB 共享碎片按引用聚簇(#6),在『图标不进首屏』与『请求数可控』间取中(注:此值只影响 Rollup 合并小 chunk,不会把懒路由专属大件拉进首屏)。改完必须用 vite build 后 ls -la build/assets 复核:entry 不再含 react-dom-client、vendor≈react+react-dom+router 全量、chunk 总数明显下降、单路由闭包不回胖。

**◆ keep-mounted lazy 边界复用模式**
- 一次解决:#2(AuthDialog)、#4/#7(Prism 双编辑器)——复用同一套 React.lazy + Suspense + 首次触发挂载后常驻的原语
- 设计:仓库已有成熟样板 app/providers.tsx 的 CollectFolderPickerGate:const X = lazy(()=>import(...).then(m=>({default:m.X}))) + 一个 Gate 组件用 everRequested ref 记住『曾经打开过』,首次触发条件成立才 <Suspense><X/></Suspense>,之后保持挂载。铁律:绝不在 Radix Dialog 仍 open 时 unmount 子树(否则 body pointer-events:none 泄漏→全站点击失灵,见 BodyPointerLockGuard)——所以是『首次触发才 lazy 加载』而非『关闭即卸载』。#2 的触发条件是 auth-dialog store 的 open;Prism 的触发条件是 schema_version 判定/PDF 面板首现。这套模式无退场动画代价可接受。

#### 逐条实施方案

##### [🟠 P1 · M(半天)] #1 MarkdownRenderer 静态焊死 katex+highlight.js(607KB/183KB gz)拖慢搜索/claw/prism/新闻/法律等一大片路由首访 · frontend-user/src/shared/components/chat/MarkdownRenderer.tsx:5-11

- **代码确认**:问题仍在且与审计一致。MarkdownRenderer.tsx:5-6 顶层 static import rehype-highlight/rehype-katex,:10-11 顶层 import 'highlight.js/styles/github.css' 与 'katex/dist/katex.min.css',:226 rehypePlugins 数组固定引用两插件。消费面广:Bubbles.tsx:3 静态引它(claw/smart-search/prism 聊天走 Bubbles),另有 news/skills/peer-review record/admin 共 13 处。vite.config.ts:42 的 markdown manualChunk 把两 rehype 插件强制同块,叠加成 all-or-nothing 巨块。对照 MermaidDiagram.tsx 已有的『dynamic import + useSettled 稳定后渲染』样板,同款手法可直接迁移。
- **改动点**:frontend-user/src/shared/components/chat/MarkdownRenderer.tsx(改渲染器);frontend-user/vite.config.ts(markdown 分组,见 SharedRefactor 1)
- **做法**:内容门控 + 按需 dynamic import,不动 13 个消费方。最小可行改动:① 删掉顶层 4 行 static import(两 rehype 插件 + 两 CSS);② 加模块级单例 loader(对齐 loadMermaid):loadKatex()=Promise.all([import('rehype-katex'), import('katex/dist/katex.min.css')]).then(([m])=>m.default);loadHl()=Promise.all([import('rehype-highlight'), import('highlight.js/styles/github.css')]).then(([m])=>m.default);③ 组件内根据 text 内容门控:const needMath=/\$\$?[^\s$]/.test(text)(粗判有行内/块级公式)、const needCode=text.includes('```');useEffect 里 needMath&&!katexPlugin→loadKatex().then(setKatexPlugin),needCode&&!hlPlugin→loadHl().then(setHlPlugin);④ const rehypePlugins=useMemo(()=>{const a=[];if(hlPlugin)a.push([hlPlugin,{ignoreMissing:true}]);if(katexPlugin)a.push(katexPlugin);return a;},[hlPlugin,katexPlugin]) 传给 ReactMarkdown。首帧无高亮/公式,插件到位后 setState 二次渲染升级(与 Mermaid 的 settle 心智一致,流式本就在变不突兀)。理想重构:若想连 react-markdown 本体也移出路由块,可把整个 MarkdownRenderer 用 lazy 包一层由 Bubbles 动态引——但收益边际(react-markdown ~40KB gz),不建议先做。配合 SharedRefactor 1 把 markdown manualChunk 收窄,katex/hljs 才能真正独立成 async chunk。
- **代码骨架**:
```
let katexP; const loadKatex=()=>katexP??=Promise.all([import('rehype-katex'),import('katex/dist/katex.min.css')]).then(([m])=>m.default);
// 组件内
const needMath=/\$\$?[^\s$]/.test(text), needCode=text.includes('```');
const [katexPlugin,setKatexPlugin]=useState(null),[hlPlugin,setHlPlugin]=useState(null);
useEffect(()=>{ if(needMath&&!katexPlugin)loadKatex().then(setKatexPlugin); if(needCode&&!hlPlugin)loadHl().then(setHlPlugin); },[needMath,needCode,katexPlugin,hlPlugin]);
const rehypePlugins=useMemo(()=>{const a=[];if(hlPlugin)a.push([hlPlugin,{ignoreMissing:true}]);if(katexPlugin)a.push(katexPlugin);return a;},[hlPlugin,katexPlugin]);
```
- **备选**:备选 A:整器 React.lazy——收益小于内容门控且改 13 个消费方,不选。备选 B:只拆 manualChunk 不改渲染器——katex/hljs 仍是同步依赖,首访照样下,治标不治本,不选。
- **风险**:① 门控 useEffect 依赖必须是原始布尔值 needMath/needCode + state,绝不能把每帧 new 的数组塞进 deps(仓库 CPU 风暴铁律);② katex CSS 改 dynamic import 后仍是 async CSS chunk,postbuild 的 strip-katex-legacy-fonts.mjs 作用于产物字体文件不受影响,但需跑一次构建确认脚本仍命中;③ needMath 正则会对含 $ 的普通文本(价格)误加载 katex,属无害多下载,概率低可接受;④ 首帧→升级的二次渲染在非流式静态内容(news/法律)会有一次高亮/公式的轻微跳变,可接受(Mermaid 已是此心智)。
- **验证**:npm run build 后 ls -la build/assets 确认出现独立 katex-*.js/*.css 与 highlight-*.js async chunk、原 markdown 巨块显著变小;dev 手动路径:开一条不含公式/代码的 claw 回答→Network 确认不拉 katex/hljs;再开一条含 $E=mc^2$ 与 ```python 代码块→确认按需拉取且公式/高亮正确、流式过程不闪烁抽搐;news 详情页含公式正文同样验证。
- **依赖**:分块侧依赖 SharedRefactor 1(收窄 markdown manualChunk);渲染器改动本身可独立先落地。

##### [🟠 P1 · M(半天)] #2 入口 chunk 747KB/226KB gz 是全站门票:AuthDialog 全家桶(zod+react-hook-form+turnstile+微信扫码 ~105KB)常驻 eager · frontend-user/src/app/App.tsx:7,78

- **代码确认**:仍在。App.tsx:7 static import AuthDialog、:78 <AuthDialog/> 无条件挂在 ShellRoot(eager,因 router.tsx:2 AppShell 也 eager,整棵 App 树 eager)。AuthDialog.tsx 静态引 LoginForm/RegisterForm/ForgotPasswordForm/OAuthRow/WeChatQRPanel,其中 LoginForm/RegisterForm/ForgotPasswordForm 各引 zod(auth 目录 3 处 from 'zod' 确认)+ react-hook-form + turnstile + qrcode。MobileAuthSheet 走 lazy MobileShell(router.tsx:97),已不在 entry——故只需处理 PC 的 AuthDialog。resizable 泄漏另核:barrel src/shared/ui/index.ts:57-62 re-export resizable,但全仓无一处从 barrel import Resizable(消费方都走 '@/shared/ui/resizable' 子路径,已 grep 证实为空),可安全摘除。
- **改动点**:frontend-user/src/app/App.tsx(AuthDialog 改 lazy gate);frontend-user/src/shared/ui/index.ts(删 resizable re-export)
- **做法**:最小可行改动,照搬 SharedRefactor 2『keep-mounted lazy 边界』:① App.tsx 顶部 const AuthDialog=lazy(()=>import('@/features/auth').then(m=>({default:m.AuthDialog})));② 写 AuthDialogGate:读 useAuthDialog(s=>s.open),用 everOpened ref 记住首次打开,首次 open 后才 <Suspense fallback={null}><AuthDialog/></Suspense> 并保持挂载(AuthDialog 内部本就靠 store.open 控制 Radix Dialog 开合,常驻挂载无副作用);③ 用 <AuthDialogGate/> 替换 App.tsx:78 的 <AuthDialog/>。resizable barrel:删 index.ts:57-62 的 ResizableHandle/ResizablePanel/ResizablePanelGroup re-export(消费方已全走子路径,零改动波及),断掉『任何 barrel 消费方→react-resizable-panels』的潜在滞留链。
- **代码骨架**:
```
const AuthDialog=lazy(()=>import('@/features/auth').then(m=>({default:m.AuthDialog})));
function AuthDialogGate(){const open=useAuthDialog(s=>s.open);const [ever,setEver]=useState(false);useEffect(()=>{if(open)setEver(true);},[open]);if(!ever)return null;return <Suspense fallback={null}><AuthDialog/></Suspense>;}
```
- **备选**:给 package.json 打 sideEffects:false 让 Rollup 更激进 tree-shake barrel——影响全局 tree-shaking 行为、风险面大,本簇不需要,只精准摘 resizable re-export 即可。
- **风险**:① 铁律:绝不在 store 仍 open 时 unmount AuthDialog——用 everOpened 常驻挂载规避,与 CollectFolderPickerGate 完全同构;② AuthBootstrap.tsx:59 会在启动时 openDialog('login')(需登录场景),Gate 监听 open 首次即挂载,行为不变;③ 首次弹登录框会多一次 chunk 往返(Suspense fallback=null,弹窗本身出现即含往返,用户无感);④ 摘 barrel re-export 前用 grep 再确认零 barrel 消费(已确认)。
- **验证**:npm run build 后确认 entry chunk 体积下降(目标 -100KB 量级)、出现独立 auth-*.js chunk;dev 手动:冷进首页不触发登录→Network 无 auth chunk;点登录→弹窗正常、zod 校验/turnstile/微信扫码 tab 均工作;连续开关登录框数次后全站点击不失灵(pointer-events 未泄漏);Prism 工作区 resizable 拖拽仍正常。
- **依赖**:无。

##### [🟠 P1 · S(<1h)] #3 manualChunks vendor 只锁 react-dom 包入口,174KB react-dom/client 漏进 entry,vendor 缓存分层失效每次发版重下 · frontend-user/vite.config.ts:34

- **代码确认**:仍在。vite.config.ts:34 vendor:['react','react-dom','react-router-dom'] 数组形式只匹配这三个 specifier 的包入口模块;main.tsx:2 实际 import 'react-dom/client'→解析到 react-dom/client.js→react-dom-client.production.js(174KB),不匹配 'react-dom' 模块 id,被默认策略并进 entry。全仓仅 main.tsx 一处引 react-dom/client。
- **改动点**:frontend-user/vite.config.ts:33-47(并入 SharedRefactor 1 的函数式 manualChunks)
- **做法**:随 SharedRefactor 1 一起把 manualChunks 改函数式:id.includes('node_modules/react-dom/')||'/react/'||'/scheduler/'||'/react-router')→'vendor'。react-dom-client 与 react/jsx-runtime、scheduler 都会正确归入 vendor。若不想全量重写、只想最小补丁:vendor 数组补 'react-dom/client'、'react/jsx-runtime' 两个 specifier 也能修——但函数式更稳且顺带解决 #6,推荐合并做。
- **备选**:最小补丁=数组补 specifier;推荐=函数式(与 #6 一次到位)。
- **风险**:函数式 manualChunks 若匹配过宽会把不该进 vendor 的拉进来——用精确的 node_modules 路径片段(带前后斜杠)避免误伤(如 'react-router' 不要误配到别的含 react 的包);改后必须 sourcemap/产物核对 vendor 内容。
- **验证**:npm run build 后 ls build/assets:entry chunk 不再含 react-dom-client(体积掉约 174KB→转入 vendor),vendor≈react+react-dom+router+scheduler 全量;改一行业务代码重新构建,确认 vendor 文件 hash 不变(缓存分层生效)。
- **依赖**:属于 SharedRefactor 1 的一部分,建议与 #6 同批。

##### [🟠 P1 · L(1-3天)] #4+#7 /prism 首访 3MB+ JS:PrismPage 静态引 V1(codemirror)+V2(tiptap)双编辑器栈,PdfViewer(pdfjs 412KB)又被静态拖进,三大重件一次下完 · frontend-user/src/features/prism/pages/PrismPage.tsx:6-7 · components/PrismWorkspace.tsx:6

- **代码确认**:两发现同源同治,合并。PrismPage.tsx:6-7 同时 static import PrismWorkspace(V1)与 PrismWorkspaceV2,:50-54 按 schema_version 二选一渲染——但两栈都进了 PrismPage chunk。PrismWorkspace.tsx:6 static import PdfViewer(pdfjs)、:13-14 引 LatexEditor/LatexDiffEditor(LatexEditor.tsx:2-7 引 @codemirror/state+view+commands+language+legacy-modes+@lezer;LatexDiffEditor.tsx:6 引 @codemirror/merge)。V2 侧 tiptap/prosemirror 经 StructEditorToolbar/tiptap-extensions/tiptap-diff-marks(已确认)。PdfViewer 虽只在 pdfKey>0 才渲染,但 static import 使其代码恒在 chunk 内。
- **改动点**:frontend-user/src/features/prism/pages/PrismPage.tsx;frontend-user/src/features/prism/components/PrismWorkspace.tsx;frontend-user/src/features/prism/components/PrismWorkspaceV2.tsx
- **做法**:三层懒边界,复用 SharedRefactor 2 模式:① PrismPage 顶层把 PrismWorkspace/PrismWorkspaceV2/PrismPreview 改 React.lazy,schema_version 判定后只 <Suspense> 拉对应一栈——一次消除『两代编辑器全下』(#7),V1 的 codemirror 与 V2 的 tiptap 从此互斥加载;② PrismWorkspace.tsx:6 与 PrismWorkspaceV2.tsx:5 的 PdfViewer 改 lazy,首次编译成功(pdfKey>0)才挂载 Suspense——pdfjs TextLayer 412KB 推迟到用户真正需要看 PDF(#4);③ LatexDiffEditor(@codemirror/merge)可再拆一层 lazy(仅 diff 审阅态用),但收益次于前两刀,列为可选。理想重构:若 legacy(V1)项目已可全量迁移到 struct,直接删 PrismWorkspace/LatexEditor/LatexDiffEditor 整条 V1 栈 + 卸 @codemirror/merge 等仅 V1 依赖,一劳永逸——需产品确认存量 legacy 项目是否清零,不清零则先做懒加载。
- **代码骨架**:
```
// PrismPage.tsx
const PrismWorkspace=lazy(()=>import('../components/PrismWorkspace').then(m=>({default:m.PrismWorkspace})));
const PrismWorkspaceV2=lazy(()=>import('../components/PrismWorkspaceV2').then(m=>({default:m.PrismWorkspaceV2})));
return proj.schema_version==='struct' ? <Suspense fallback={<LoadingState className="h-full"/>}><PrismWorkspaceV2 .../></Suspense> : <Suspense .../><PrismWorkspace .../></Suspense>;
// PrismWorkspace.tsx
const PdfViewer=lazy(()=>import('@/shared/components/PdfViewer').then(m=>({default:m.PdfViewer})));
// 渲染处 pdfKey>0 ? <Suspense fallback={<Loader/>}><PdfViewer .../></Suspense> : ...
```
- **备选**:把 codemirror/tiptap 各自手工 manualChunk——只是把大块挪个位置仍在 PrismPage 依赖图里被同步拉,不解决『两栈都下』,不选。
- **风险**:① Prism 工作区是 480 行复杂组件,含 WS/编译轮次/diff/自动保存等大量状态——lazy 边界只包整个 Workspace 组件(状态全在其内),不打散内部状态,安全;② PdfViewer 改 lazy 需保留 key={pdfKey} 语义与现有 Suspense fallback 一致,别在 diff/编译中态误卸;③ V1/V2 切换本就整组件替换,lazy 化不改变卸载语义;④ 若走『删 V1』的理想档,必须先确认存量 read_only legacy 项目为 0,否则老项目打不开——保守起见先只做懒加载。
- **验证**:npm run build 后确认 PrismPage 首屏 chunk 从 ~904/925KB 降到 ~300KB 内,codemirror 与 tiptap 各自独立 async chunk、pdfjs 独立 chunk;dev 手动全流程:开 struct 新项目→只拉 tiptap 不拉 codemirror;开 legacy 项目→只拉 codemirror;首次点『编译』成功后才拉 pdfjs 并正确出 PDF;AI 改动→流式 diff→逐块取舍→应用→重编译全链路无回归;下载 PDF 正常。
- **依赖**:无硬依赖;markdown 瘦身(#1)会连带减小 PrismChatPanel 引入的 MarkdownRenderer 体积。

##### [🟡 P2 · S(<1h)] #5 index.html 每次整页加载发 3 个配置请求,其中 2 个(config/system、config/code-snippets)无缓存策略,抢首屏带宽随 PV 线性打后端 · frontend-user/index.html:90,157

- **代码确认**:仍在。index.html:65 umami-config 有 {cache:'force-cache'};:90 fetch('/api/v1/config/system')(拿 GA id)、:157 fetch('/api/v1/config/code-snippets') 两处均无 cache 选项、依赖后端响应头。
- **改动点**:frontend-user/index.html:90,157(前端侧);或 backend/internal/config/handler.go / handler_ssr.go(后端侧下发 Cache-Control)
- **做法**:两选一,推荐前端侧最小改:给 :90 与 :157 两个 fetch 加第二参 {cache:'force-cache'}(与 :65 umami 对齐)——浏览器优先用磁盘缓存,配置变更靠发版新 HTML 或短 TTL 兜底。若要求配置能秒级刷新,则改后端给这两个接口下发 Cache-Control: max-age=300(config handler 里加响应头)——但 code-snippets 已有 SSR 注入去重逻辑,force-cache 更省事。理想重构:三配置合并成单个 /api/v1/public/bootstrap 一次拉齐,减少首屏 3→1 往返,但改动面涉及后端聚合 + 前端三段脚本重排,收益有限,不建议先做。
- **备选**:后端 Cache-Control(可控 TTL,但改后端);合并 bootstrap 接口(理想但过度)。
- **风险**:force-cache 会让 GA id / 代码片段变更需等浏览器缓存过期或发版才生效——这两项本就低频变更(GA 配一次、片段是运营偶发),可接受;若运营要求即时生效则走后端 max-age=300 档。
- **验证**:改后 Network 面板复看:二次整页加载时 config/system 与 code-snippets 命中 disk cache(from cache),首屏这两条不再阻塞回源;GA 与代码片段注入功能不受影响。
- **依赖**:无。

##### [🟡 P2 · S(<1h)] #6 构建产出 365 个 JS chunk,单路由静态闭包 40-61 个请求(lucide 一图标一 chunk),高 RTT 移动网络请求扇出放大尾延迟 · frontend-user/vite.config.ts:35

- **代码确认**:仍在。vite.config.ts:35-38 注释记录刻意移除 lucide icons manualChunk(方向正确,避免 80KB 图标块进首屏),副作用是每图标就近成独立微 chunk。当前 output 无 experimentalMinChunkSize 兜底。
- **改动点**:frontend-user/vite.config.ts:31-51(并入 SharedRefactor 1)
- **做法**:随 SharedRefactor 1 在 build.rollupOptions.output 加 experimentalMinChunkSize: 10000(10KB)。Rollup 会把小于阈值的相邻微 chunk(lucide 单图标 0.3-1KB、组件级共享碎片)向引用它们的 chunk 合并,在『图标不进首屏』(仍不做全局 icons 块)与『请求数可控』间取中间值。不碰已有的懒路由大件切分。
- **备选**:函数式 manualChunks 手动把 <2KB 图标按路由聚簇——比 minChunkSize 更精细但更易写错、维护成本高,minChunkSize 一行更稳。
- **风险**:minChunkSize 设太大会把懒路由专属小模块并回首屏共享块致首屏回胖——用 10KB 保守值并在构建后核对 ClawPage/SearchPage/MatrixColumn 静态闭包 chunk 数下降且首屏体积未涨;该选项名带 experimental,Vite6/Rollup 稳定支持,行为仅影响合并不影响正确性。
- **验证**:npm run build:chunk 总数从 365 显著下降;用 vite 产物核对 ClawPage(原 56)、SearchPage(原 54)、MatrixColumn(原 61)首访闭包 chunk 数下降;首屏 entry/vendor 体积不增。
- **依赖**:属 SharedRefactor 1;与 #3 同批改 vite.config。

##### [🟡 P2 · S(<1h)] #8 src/shared/components/peer-review-record/ 整目录(6 文件 88KB)死代码,与 features/peer-review/components/record/ 近全量复制且已分叉 · frontend-user/src/shared/components/peer-review-record/ReviewerDetailPanel.tsx

- **代码确认**:确认为死链。shared/components/peer-review-record/* 的唯一 importer 是 admin/components/PeerReviewRecordView.tsx(:3-6);而 PeerReviewRecordView 除与 PeerReviewRecordParts 互引外,全仓无任何外部(非注释)引用(grep 证实只有 PeerReviewRecordParts.tsx 注释里提到它)。即 PeerReviewRecordView + PeerReviewRecordParts + pr-record-adapter + shared/components/peer-review-record/ 整条链为孤儿。真源保留在 features/peer-review/components/record/。
- **改动点**:删除:frontend-user/src/shared/components/peer-review-record/(6 文件)、src/features/admin/components/PeerReviewRecordView.tsx、PeerReviewRecordParts.tsx、src/features/admin/lib/pr-record-adapter.ts
- **做法**:随 SharedRefactor 2 一并删除上述整条链。删前跑一次全仓 grep 确认 admin 会话监控(PeerReviewMonitor.tsx 等)确实不经 PeerReviewRecordView 渲染 record 面板(审计前提)——PeerReviewMonitor 独立引 MarkdownRenderer 走自己的路径。若未来监控镜像要回来,应从 features/peer-review 真源引用而非再复制。
- **备选**:无(纯删除)。
- **风险**:唯一风险是误删仍在用的组件——已 grep 双向确认无非注释引用;删后 tsc -b + vite build 若有残引会立刻编译失败兜底。
- **验证**:删除后 npm run build 通过(无 unresolved import);后台会话监控页打开一条审稿记录仍能正常看 transcript/reviewer 面板(走 features/peer-review 真源)。
- **依赖**:无。

##### [🟡 P2 · S(<1h)] #9 两个零 import 死依赖 @tanstack/react-table(776KB)与 @radix-ui/react-select(492KB),前者残留在 vite manualChunks;@dnd-kit 两包被生产代码引用却挂 devDependencies · frontend-user/package.json:43,36

- **代码确认**:全部确认。全仓 grep:react-table 0 命中、react-select 0 命中;@dnd-kit 被 DimensionRow.tsx / DimensionSettingsDialog.tsx(生产路径)引用但 package.json:92-93 列在 devDependencies。vite.config.ts:43 table:['@tanstack/react-table','@tanstack/react-virtual'],其中 react-virtual 仍被 4 处(mobile/pdf)使用。
- **改动点**:frontend-user/package.json(卸 2 包、移 2 包);frontend-user/vite.config.ts:43(删 table 条目,见 SharedRefactor 1);frontend-user/CLAUDE.md(第三方表格行注记)
- **做法**:随 SharedRefactor 1+2:① npm uninstall @tanstack/react-table @radix-ui/react-select;② 删 vite.config.ts:43 的 table manualChunk 条目(react-virtual 交消费方就近落各自 lazy 路由块,无需专块);③ 把 @dnd-kit/core、@dnd-kit/sortable 从 devDependencies 移到 dependencies(生产运行时依赖,放 dev 在纯净安装/某些构建环境会漏装);④ 更新 frontend-user/CLAUDE.md 第三方表格里的 react-table 行,避免下个人照文档又 import 回来。
- **备选**:table 条目改名 'virtual':['@tanstack/react-virtual']——但 react-virtual 消费方都是 lazy 路由,专块无收益,直接删更干净。
- **风险**:@dnd-kit 移到 dependencies 后 lockfile 变化——需重新 npm install 并提交 lock;卸包后必须 tsc -b + vite build 确认无残引(已确认 0 引用);CLAUDE.md 文档同步别漏(仓库反复强调文档漂移会让人把依赖 import 回来)。
- **验证**:npm run build 通过;grep 确认 build/assets 无 react-table/react-select 代码;DimensionSettings 拖拽排序功能正常(@dnd-kit 移位后仍工作);rm -rf node_modules && npm install 后构建仍绿(证明 dnd-kit 不再依赖 devDeps)。
- **依赖**:vite.config 改动并入 SharedRefactor 1。

##### [🟡 P2 · S(<1h)] #10 零散死代码 9 文件约 48KB(AdminCommandPalette/JournalExploreOverview/PrismSidebar/ClawPreview 等)+ 两处微重复(双份分享 store、双份数据源品牌映射)· frontend-user/src/features/admin/components/AdminCommandPalette.tsx

- **代码确认**:抽样确认:AdminCommandPalette.tsx 仅 AdminShell.tsx:21 注释提及(『已下线』)、JournalExploreOverview.tsx/ClawPreview.tsx/PrismSidebar.tsx 均 0 importer;dataSourceBrand.ts 唯一引用是 mask-tool-source.ts:9 的注释(真源=mask-tool-source.ts);use-share-sheet.ts 位于 src/shared/components/share/,被 LibraryPage.tsx 引用(PC 端另一份分享 store,与全局 stores/share.store.ts 重复)。
- **改动点**:删除 9 个死文件(AdminCommandPalette.tsx、JournalExploreOverview.tsx、PrismSidebar.tsx、ClawPreview.tsx 及审计所列其余,含 app/layouts/_placeholder);frontend-user/src/features/search/components/smart-search/dataSourceBrand.ts(删);frontend-user/src/shared/components/share/use-share-sheet.ts(删)+ src/features/library/pages/LibraryPage.tsx(改用 stores/share.store.ts)
- **做法**:随 SharedRefactor 2:① 逐个复核 9 文件确为 0 非注释引用后删除(_placeholder 若是脚手架约定目录则删内容留目录);② dataSourceBrand.ts 直接删(真源 mask-tool-source.ts 已覆盖);③ 分享 store 二合一:LibraryPage.tsx 改用全局 stores/share.store.ts 的 openShare/closeShare,删 use-share-sheet.ts——注意迁移时对齐两 store 的 API 形状(target/close 语义),LibraryPage 分享交互逐路径验证。
- **备选**:保留死文件加 // @deprecated——徒增噪音,不选;仓库已有『死代码定期清扫』先例。
- **风险**:删文件风险=误删,靠删后 tsc -b + vite build 编译失败兜底;分享 store 合并是唯一有行为改动处——LibraryPage 的分享面板(链接/提取码/过期/转存)需手动过一遍确认切到全局 store 后功能等价,别引入 Radix 弹窗『open 时卸载』反模式。
- **验证**:npm run build 通过;dev 手动:后台无 ⌘K 面板残留报错;LibraryPage 点分享→面板正常弹出、生成链接/提取码/转存全流程工作;智能搜索数据源品牌 mask 显示正常(走 mask-tool-source 真源)。
- **依赖**:建议在 #8/#9 之后统一一批删,减少多次 build 验证。

#### 本簇落地顺序
建议按『先无风险清扫、再配置重写、后行为改动』落地,把构建验证次数压到最少:第 1 批(P2 清扫,SharedRefactor 2):#8+#9+#10 死代码/死依赖一次性删干净并卸包移包——纯删除,一次 build 验证,给后续腾出干净基线。第 2 批(P1 配置,SharedRefactor 1):#3+#6 + #9 的 table 条目 + #1/#9 的 markdown 分组一起把 vite.config manualChunks 改函数式 + minChunkSize,一次构建核对 vendor/chunk 数/entry。第 3 批(P1 渲染器):#1 MarkdownRenderer 内容门控(依赖第 2 批的 markdown 分组才能让 katex/hljs 真正独立成块)。第 4 批(P1 懒边界):#2 AuthDialog lazy + barrel resizable、#4/#7 Prism 三层懒边界——都用 SharedRefactor 2 同款模式,可并行改但需各自跑手动路径回归。第 5 批(P2 收尾):#5 index.html 配置缓存,一行改。其中 #4/#7(Prism,effort L)是最重、回归面最大的一项,放最后单独验证。

#### 待人拍板
1. #4/#7 是否走『删 V1 codemirror 栈』的理想档——取决于存量 read_only legacy Prism 项目是否已清零(清零则删 V1 + 卸 @codemirror/merge 一劳永逸,否则只能懒加载保兼容),需产品/数据确认。2. #5 配置缓存选『前端 force-cache』还是『后端 max-age=300』——取决于运营是否要求 GA id / 代码片段变更即时生效(要即时则走后端短 TTL,否则前端 force-cache 更省);默认建议前端 force-cache。3. #6 的 experimentalMinChunkSize 阈值(建议 10KB)属经验值,需构建后实测首屏闭包不回胖再定稿,可能在 8-12KB 间微调。


---

### 簇:前端运行时渲染与数据获取层 `frontend-render-data`

**整体判断**:本簇是「前端运行时渲染 + 数据获取层」15 条,核心矛盾集中在三类反复出现的模式:①流式/编辑器场景的 O(N²) 重渲(thinking 帧不合并、fold 每帧全量重建、Prism 键击驱动整工作台重渲);②react-query 轮询/失效的边界没管好(failed 投稿永轮询、import 任务不判终态、批量暂存 N 次失效风暴、引用选择器无防抖、blob 下载套用 30s API 超时);③浏览器详情/PDF 页取数不收敛(PDF 切页签整份重下、无摘要论文 fallback 永不收敛、冷进入 references 串行、library-browse 独立 queryKey)。这些都不是孤立 bug 而是同一批「模式复用点」漏了收尾:appendStreamMessage 只堵了两类帧漏第三类、refetchInterval 判停逻辑各写各的、http 实例只有一个全局超时。建议策略:优先落地几处「一处改全局生效」的收口(thinking 合并、轮询终态谓词、下载长超时出口、后端 PDF ETag),再做渲染层增量化与 memo,最后清理 P2。所有改动均低风险、可分期、可回滚,且大量对齐仓库已有先例(useDebounce/keepPreviousData/useSubmission 的 refetchInterval/MermaidDiagram 懒加载)。

#### 统一改法(一次解决多个发现)

**◆ 流式重渲降阶(thinking 合并 + fold 增量 + socket 引用稳定)**
- 一次解决:发现 1(thinking 帧不合并)+ 发现 2(fold 每帧全量重建 + useAgentSocket 返回值每 render 变)
- 设计:三处同属「一次会话挂载内 messages/turns 只增不减 → 每 rAF flush 付 O(N)」的同一病根,合并成一个渲染硬化改造分三层落地(可独立发布):(1)appendStreamMessage(shared/lib/agent-stream.ts)增第三个合并分支:相邻两帧均为 type==='thinking' 且带 string text 时合并为一帧——与 fold.ts:130-134 的 `thinkingText +=` 完全等价,一处修 claw/smart-search/prism/admin 监控四处同时受益;(2)把渲染重头 PaperListScroller / ClawPaperList 用 React.memo 包起来(props 只有 content=block.result 与 toolUseId,二者在 messages 数组内引用稳定,memo 直接命中),流式期间即便 live Turn 每帧换新引用,论文组子树也不再每帧重跑 ~15 个 hooks;(3)useAgentSocket 把 send/close/clearMessages/takeOver 用 useCallback 固化(内部只读 wsRef.current,空依赖即可),消费方(useClawConversation 的 handleNewConversation/handleActivateSession、依赖 [socket] 的 effect)改为依赖稳定的 send 而非整个 socket 对象;理想档再做 fold 增量化:按 message_complete 边界缓存已完成轮的 Turn 前缀,只重建最后一条未完成轮。三层各自独立、越往后收益越大但侵入也越大。

**◆ react-query 轮询终态判停统一**
- 一次解决:发现 8(审稿 failed 永轮询)+ 发现 10(admin import 任务不判终态)
- 设计:两者同为「refetchInterval 只看业务进度不看终态,任务停了还每 N 秒打后端」。统一改法:把判停收进 hook 的 refetchInterval 回调,读 q.state.data 的状态字段返回 false。发现 10 直接对齐同仓 useSubmission(submissions.ts:68-76)与 useCompile 的既有范式:`refetchInterval:(q)=>{const s=q.state.data?.status; return s==='pending'||s==='running'?1500:false}`,调用方 poll 参数可删。发现 8 因 reports hook 手里没有 submission.status,给 useSubmissionReports 增一个 `terminal?:boolean` 入参(由 RecordDetailPage 传 `sub?.status==='failed'` 等终态),refetchInterval 改 `items.length<4 && !terminal ? 5000 : false`,「凑齐 4 份即停」的既有条件保留。

**◆ 大文件下载长超时统一出口**
- 一次解决:发现 9(blob/arraybuffer 下载被全局 30s timeout 掐断)
- 设计:根因是 shared/lib/http.ts 只有一个 timeout:30_000 的实例,承载了「API 语义超时」与「大文件传输」两种语义。统一改法:在 http.ts 导出一个下载专用助手 `httpDownload(url, config?)`(内部 http.get 覆写 timeout:0 + responseType 由调用方给),或直接导出一个长超时实例 httpBlob(timeout:0)。把全部 responseType:'blob'/'arraybuffer' 站点收敛到它:peer-review submissions.ts:371、prism PrismWorkspace.tsx:219 / PrismWorkspaceV2.tsx:398 / prism.ts:522(docx)、claw artifacts.ts:113、admin AdminFileViewer.tsx:21/81、shared journals.ts:102、admin usage-logs.ts:114 / token-usage.ts:167。上传侧已有先例(library/api/pdf.ts:70 手写 timeout:60_000),这次把下载侧补齐并收口成单一出口,避免下次再有人漏。

**◆ 浏览器详情页取数收敛(fetchedAt 标记 + 冷进入并行预取)**
- 一次解决:发现 14(无摘要论文 fallback 永不收敛)+ 发现 15(冷进入 references 串行)
- 设计:两条都在 PaperDetailPane.tsx + browser-tabs.store.ts 这两个文件里,属同一处取数逻辑收尾。发现 14:把「是否已拉过」与「字段是否有值」解耦——PaperTab 增 `detailLoaded?:boolean`,openPaperTab 从 fallback.data 灌入时置 true(给 openPaperTab 加可选参数或新增 markDetailLoaded(id)),needsFetch 由 `!tab || !tab.paper.abstract` 改为 `!tab || !tab.detailLoaded`;browser-tabs 的 incomingRicher 合并条件同步改为「本次来自 detail 接口(detailLoaded)即覆盖」,author tab 的 `paperCount/hIndex>0` 零指标不收敛问题同法处理。发现 15:冷进入(coldEntryRef)时在 PaperDetailPane 顶层用 URL 的 paperId 直接挂一个 useFetchPaperReferences(paperId, coldEntry) 预取——与 PaperReferences 内部同 queryKey ['paper','references',paperId] 自动去重,让 references 与详情请求同时出发而非串行等一个 RTT;暖路径(tab 快照命中)维持 referenceCount 守门不变。

#### 逐条实施方案

##### [🟠 P1 · S(<1h)] 发现 1:流式 thinking 帧从不合并 → 会话内 O(N²)(shared/lib/agent-stream.ts:90 appendStreamMessage)

- **代码确认**:已亲读。appendStreamMessage 只对 content_delta+text(91-96)与 content_delta+toolInput(100-114)做相邻合并,thinking 帧走 115 行 `return [...prev, evt]` 独立入列。确认 thinking 帧确实流经此函数:useAgentSocket.ts onmessage 里 thinking 不属于控制帧/runtime_config/error/system_notification/message_complete 任一分支,落到 344 行 pendingEvents.push(evt)→scheduleFlush→flushPending 的 batch.reduce(appendStreamMessage)。fold.ts:130-134 thinking 分支是 `current.thinkingText=(current.thinkingText??'')+msg.text`,与合并语义完全等价。问题仍在。
- **改动点**:frontend-user/src/shared/lib/agent-stream.ts:appendStreamMessage
- **做法**:最小可行=理想:在两个已有合并分支之后、`return [...prev, evt]` 之前增第三个分支,镜像 text 分支写法。三个 feature + admin 监控共用此函数,一处生效。
- **代码骨架**:
```
if (evt.type === 'thinking' && typeof evt.text === 'string') {
  const last = prev[prev.length - 1];
  if (last && last.type === 'thinking' && typeof last.text === 'string') {
    return [...prev.slice(0, -1), { ...last, text: last.text + evt.text } as T];
  }
}
```
- **备选**:在 fold 侧做压缩——否定:messages 数组本身仍 O(token),每帧 O(N) 拷贝逃不掉,必须在累积函数处堵。
- **风险**:极低。合并与 fold 的 thinkingText 累加等价,fold 不区分一条还是多条。唯一要注意:thinking 帧与 content_delta/toolInput 帧不会互相误并(type 判定已隔离)。truncateToLastComplete 只认 message_complete/error 作边界,thinking 被合并不影响续流截断。
- **验证**:开一个思考型模型(claw/smart-search/prism)发长问题,DevTools Performance 录制流式期间:确认 socket.messages 长度不再随 thinking token 线性膨胀(合并后退回 O(思考块数));思考折叠 ThinkingFold 展示的正文与合并前逐字一致;移动端/低端机流式打字掉帧缓解。
- **依赖**:无

##### [🟠 P1 · M(半天)] 发现 2:fold 每帧重建全部 live Turn + useAgentSocket 返回值/回调每 render 变 → live 轮穿透 memo、论文列表组件每帧重跑十余 hooks(features/claw/components/chat/fold.ts:44)

- **代码确认**:已亲读。fold.ts:44 `pendingTurns.map((p)=>({...}))` 每次调用新建全部 Turn;smart-search types.ts:55 同构。MessageTurn.tsx:84-87 memo 注释宣称「历史轮引用稳定→memo 跳过」只对 replayHistoryAsTurns 成立,对 live 轮失效。ClawPaperList.tsx:35 与 PaperListScroller.tsx:53 均无 memo,内部各跑 useStagingView/useStagingActions/3×useFavoriteCheck/useJournalEnrichments/useAutoAnimate。useAgentSocket.ts:473-501 每 render 返回新对象字面量、send/close 每次新建;useClawConversation 依赖 [socket] 的回调随之每帧新引用。问题仍在。
- **改动点**:frontend-user/src/features/search/components/smart-search/PaperListScroller.tsx、frontend-user/src/features/claw/components/chat/ClawPaperList.tsx、frontend-user/src/shared/hooks/useAgentSocket.ts、frontend-user/src/features/claw/hooks/useClawConversation.ts、frontend-user/src/features/claw/components/chat/fold.ts
- **做法**:见 sharedRefactor『流式重渲降阶』第 2、3、(4)层。最小可行:只做 memo 包裹(PaperListScroller/ClawPaperList 用 memo,props content/toolUseId 引用稳定即命中)——单独就能把流式期间最贵的论文组重渲挡掉,改动 2 行、零风险。中档:useAgentSocket 的 send/close/clearMessages/takeOver 用 useCallback 固化(内部只读 ref,空依赖),消费方依赖 [socket.send] 而非 [socket]。理想:fold 按 message_complete 边界缓存已完成轮前缀,只重建末条未完成轮。同时修正 MessageTurn.tsx:84-87 的失实注释。
- **备选**:给 messages 做窗口化只 fold 最近 N 轮——已有历史窗口(limitTurns)但 live 轮无窗口;窗口化会丢失早期轮实时态,不如 memo+增量安全。
- **风险**:memo 包裹安全:两组件 props 仅 content+toolUseId,内部状态经 store 订阅照常更新,memo 不影响正确性。useAgentSocket 固化 send 需保证 send 内读的是 wsRef.current 最新值(已是 ref,OK);若把整个返回对象 useMemo,deps 必含 messages/state,流式期每帧仍变——所以关键是让消费方只依赖稳定 send 而非整对象,否则等于没改。fold 增量化风险最高:必须保证「已 complete 轮的折叠结果」在后续帧不再被追加事件污染(tool_result 迟到、artifact 迟到都发生在 message_complete 之前,故以 complete 边界切前缀是安全的),需回归历史回放/续流 truncate。
- **验证**:长会话(几十轮含论文卡)流式期间 React DevTools Profiler 录一帧:确认已 complete 的历史 live 轮不再高亮重渲、论文组子树 commit 次数骤降;ClawSidebar 会话列表行不再每帧重渲。功能回归:新建会话/切会话/停止/重发、多端 user_echo、断线续流均正常。
- **依赖**:无(与发现 1 独立,但两者叠加才根治『越聊越卡』,建议同批)

##### [🟠 P1 · M(半天)] 发现 3:Prism 每次键击 3 次全文级字符串操作 + 重渲整工作台(含 PdfViewer/聊天/文件侧栏)(features/prism/components/LatexEditor.tsx:167)

- **代码确认**:已亲读。LatexEditor.tsx:167 updateListener docChanged→`u.state.doc.toString()`(O(文档长度))→onChange=setBuffer;PrismWorkspace.tsx:160 buffer state、367 onChange=setBuffer,每键击整工作台函数组件重跑;294 `useMemo(()=>parseOutline(buffer),[buffer])` 每键击 body.split('\n')+逐行正则(70-80);188-195 value 同步 effect 再 toString+O(n) 比较。PrismChatPanel(无 memo)、PdfViewer(forwardRef 无 memo)、PrismFileSidebar(sidebar/PrismFileSidebar.tsx,收每键击新建的 outline)全随键击重渲。仅 useDebounce(buffer,800)(183)只作用于保存。问题仍在。
- **改动点**:frontend-user/src/features/prism/components/PrismWorkspace.tsx(buffer/outline/子组件)、frontend-user/src/features/prism/components/LatexEditor.tsx、frontend-user/src/features/prism/components/PrismChatPanel.tsx、frontend-user/src/shared/components/PdfViewer.tsx、frontend-user/src/features/prism/components/sidebar/PrismFileSidebar.tsx
- **做法**:最小可行(S,先落):①outline 解析改 `const dq = useDeferredValue(buffer); const outline = useMemo(()=>parseOutline(dq),[dq])`——大纲不需键级实时,把逐行正则移出键击关键路径;②PdfViewer 用 memo 包一层(forwardRef+memo)、PrismChatPanel 用 memo——二者 props 不含 buffer/outline,memo 后不再随键击重渲;PrismFileSidebar memo + outline 走 deferred 引用。理想重构(L):把 buffer 收进编辑器容器组件做非受控(onChange 只更新 ref 不 setState),PrismWorkspace 只在保存/发起 AI 轮时经 editorRef 拉正文;去掉 188-195 的 value 同步 effect(切文件/rebase 时才显式 setDoc)。这样键击不再驱动整工作台 VDOM 重算。
- **备选**:给 onChange 加节流——治标,仍每次 toString 且工作台重渲;不如非受控彻底。
- **风险**:useDeferredValue 使大纲滞后一帧(可接受,大纲非实时)。非受控重构风险高:切文件、服务端 rebase、AI apply patch 后必须显式把新文本推回编辑器(原 value effect 承担此职责),漏推会导致编辑器与真源脱节;需回归『切文件保留未存改动』『AI 编辑落盘后编辑器同步』『版本回滚』。memo PdfViewer 要确认 file/trailingActions 引用稳定(pdfSource 已 useMemo,OK)。
- **验证**:大 .tex(200-500KB)连续打字,Performance 录制:确认单键 commit 不再触达 PdfViewer/PrismChatPanel/PrismFileSidebar 子树,outline 重算移出键击帧;输入延迟(低端机)明显下降。回归:切文件、AI 编辑、编译报错跳行、Cmd+K 内联编辑、保存防抖均正常。
- **依赖**:无

##### [🟠 P1 · M(半天)] 发现 6:批量暂存 N 篇 = N 个并行单篇 POST + 每次成功各触发一次列表失效重拉(features/search/hooks/useStagingActions.ts:345)

- **代码确认**:已亲读。useStagingActions.ts:345-358 Promise.all 并行 addPaperMut.mutate;staging-areas.ts:154-169 useAddRemotePaper 的 onSuccess 每次 invalidate(qc)→invalidateQueries(['staging-areas'])(默认 cancelRefetch),N 个 settle 反复 cancel+refetch GET /user/staging-areas。上限 MAX_PAPERS_PER_AREA=100。问题仍在。
- **改动点**:frontend-user/src/features/search/api/staging-areas.ts、frontend-user/src/features/search/hooks/useStagingActions.ts:bulkStagePapers、backend/internal/stagingarea/*(新增 batch 端点)
- **做法**:理想(推荐):后端加 POST /user/staging-areas/:id/papers/batch 一次提交多篇(body {papers:[AddPaperPayload...]},服务端单事务/单查询去重+封顶),前端 useBulkAddRemotePapers 单次 mutation + 单次 onSuccess invalidate。最小可行(纯前端,先上):新增一个『不含 onSuccess invalidate』的裸 add mutation(useAddRemotePaperRaw)供 bulk 路径用,bulkStagePapers 用它 Promise.all,全部 settle 后 qc.invalidateQueries(['staging-areas']) 一次;单篇 stagePaper 路径保留原 useAddRemotePaper(带即时失效)不变。注意:react-query 里 mutate 调用点的 onSuccess 与 hook 级 onSuccess 会同时触发,无法在调用点抑制 hook 级失效,故必须走独立裸 mutation 而非复用 addPaperMut。
- **风险**:后端 batch 端点需过与单篇一致的归属/上限/幂等校验,且要接同样的限流。前端裸 mutation 要确保失败分支仍统计 skipped、且最终 invalidate 一次不遗漏。飞入动画/trackStaging 计数不受影响。
- **验证**:登录态点『一键导入』10-50 篇:Network 面板确认 GET /user/staging-areas 只重拉 1 次(而非数十次);后端不再收到并发写突发;暂存结果、已满/重复计数、飞入动画正确。
- **依赖**:batch 端点档依赖后端先落地;纯前端裸 mutation 档无依赖可先行。

##### [🟠 P1 · S(<1h)] 发现 7:LibraryReferencePicker 论文搜索框无防抖,每字符一次后端请求(shared/components/chat/LibraryReferencePicker.tsx:174)

- **代码确认**:已亲读。:174 `onChange={(e)=>setQ(e.target.value)}`,:85 `useLibraryBrowsePapers(open?activeFolder:null,{q})`,library-browse.ts:48 q 直接进 queryKey `['shared','library-browse','papers',folderId,page,pageSize,q]`,无 debounce。同仓 PrismCitationDialog.tsx:26 用 useDebounce(q,300)、suggestions.ts:63 用 280ms。三 agent 输入框常驻复用此选择器。问题仍在。
- **改动点**:frontend-user/src/shared/components/chat/LibraryReferencePicker.tsx、(可选)frontend-user/src/shared/api/library-browse.ts
- **做法**:最小可行:LibraryReferencePicker 内 `const dq = useDebounce(q, 300)`,传给 useLibraryBrowsePapers 的是 dq(输入框 value 仍绑 q 保持即时反馈)。更彻底:把 debounce 下沉进 useLibraryBrowsePapers 内部,让所有调用方受益(但目前唯一调用方就是它,先就地即可)。library-browse 已用 keepPreviousData,防抖后中间前缀不再各占缓存。
- **风险**:极低。300ms 与 PrismCitationDialog 对齐。注意清空搜索时 dq 也应快速回落(useDebounce 对空串同样延迟,可接受)。
- **验证**:引用选择器输入 11 字检索词:Network 确认只发 1-2 次 GET /user/library 而非 11 次;结果不被中间前缀响应竞争。
- **依赖**:无

##### [🟠 P1 · S(<1h)] 发现 8:审稿报告查询对 failed/终态永不停轮询(features/peer-review/api/reports.ts:34)

- **代码确认**:已亲读。reports.ts:34-37 refetchInterval 只看 `items.length<4?5000:false`,不参考 submission.status。types.ts:18-23 SubmissionStatus 含 'failed' 终态,失败投稿永远凑不齐 4 份。RecordDetailPage.tsx:46 无条件挂载该查询,同页 45 行已有 useSubmission 拿到 sub.status。对照 submissions.ts:68-76 useSubmission 已按 computeState 正确判停。问题仍在。
- **改动点**:frontend-user/src/features/peer-review/api/reports.ts:useSubmissionReports、frontend-user/src/features/peer-review/pages/RecordDetailPage.tsx
- **做法**:见 sharedRefactor『轮询终态判停统一』。给 useSubmissionReports 增 `terminal?: boolean` 入参,refetchInterval 改 `items.length<4 && !terminal ? 5000 : false`。RecordDetailPage 传 `terminal={sub?.status === 'failed'}`(如还有其他终态一并纳入)。凑齐 4 份即停的既有条件保留。
- **代码骨架**:
```
export function useSubmissionReports(id?: number, terminal?: boolean) {
  return useQuery({ ...
    refetchInterval: (q) => {
      const items = q.state.data ?? [];
      if (terminal) return false;
      return items.length < 4 ? 5000 : false;
    },
  });
}
```
- **风险**:极低。terminal 判定要覆盖所有『不会再产出报告』的终态(至少 failed);正常完成路径靠 length>=4 停,不受影响。terminal 变化会触发 refetchInterval 重评估(react-query v5 支持)。
- **验证**:打开一条 failed 审稿记录停留:Network 确认 /reports 不再每 5s 轮询;正常进行中的记录仍每 5s 直到凑齐 4 份。
- **依赖**:无

##### [🟠 P1 · S(<1h)] 发现 9:大文件 blob 下载共用全局 30s timeout,慢网下载 zip/docx 被掐断(shared/lib/http.ts:14)

- **代码确认**:已亲读。http.ts:12-16 timeout:30_000,XHR timeout 覆盖整个响应体传输。上传侧 library/api/pdf.ts:70 已特判 timeout:60_000,下载侧全未覆写:确认 submissions.ts:371、PrismWorkspace.tsx:219、PrismWorkspaceV2.tsx:398、prism.ts:522、artifacts.ts:113、AdminFileViewer.tsx:21/81、journals.ts:102、usage-logs.ts:114、token-usage.ts:167 均 responseType blob/arraybuffer 且无 timeout 覆写。问题仍在。
- **改动点**:frontend-user/src/shared/lib/http.ts、上列全部下载站点
- **做法**:见 sharedRefactor『下载长超时统一出口』。最小可行:每个下载站点补 `{ responseType:'blob', timeout: 0 }`(或 120_000+)。彻底:http.ts 导出下载助手/长超时实例,所有下载改走它,消除下次再漏的隐患。
- **代码骨架**:
```
// http.ts
export function httpDownload<T = Blob>(url: string, config: AxiosRequestConfig = {}) {
  return http.get<T>(url, { responseType: 'blob', timeout: 0, ...config });
}
```
- **风险**:低。timeout:0 = 无超时,需保证这些端点由后端/nginx 侧有传输预算兜底(后端 object-serve 类已 10min,见 APITimeoutMiddleware),避免真挂起。仅用于确定是文件下载的请求,勿误套到普通 API。
- **验证**:限速到 ~5Mbps 下载 50MB 级审稿 zip / 大 PDF / docx:确认不再在 30s 处 ERR_CANCELED,能完整下完。
- **依赖**:无

##### [🟠 P1 · S(<1h)] 发现 13:PDF 页签切走再切回全量重下载(前端无跨挂载缓存 + 后端响应无 ETag/Last-Modified 且 Cache-Control 强制作废)(features/browser/components/PdfBrowserPane.tsx:39)

- **代码确认**:已亲读三层。BrowserPage.tsx:76-77 `<motion.div key={pathname}>` + 路由分支使 PdfBrowserPane 每次切走即卸载;PdfViewer.tsx 仅组件内 state,挂载即由 pdfjs 重新 fetch;后端 handler_pdf.go:270 `Cache-Control: private, max-age=0, must-revalidate` 但未下发任何验证器(无 ETag/Last-Modified)→ 每次『重校验』退化成整份 200。storage.go:379 ServeObject 非 Range 分支不发 ETag(仅 Range 分支 StatObject);StatObject 返回的 *minio.ObjectInfo 原生带 ETag/LastModified(storage.go:274-297 已可见 ETag)。问题仍在。
- **改动点**:backend/internal/storage/storage.go:ServeObject(推荐)或 backend/internal/library/handler_pdf.go:DownloadPDF、backend/internal/prism 的 GetPDF(同受益)
- **做法**:后端补验证器(最佳 ROI,一处修多处受益):ServeObject 非 Range 分支先 StatObject 拿 ETag/LastModified,设 `ETag`+`Last-Modified` 头;若请求带 If-None-Match 命中(或 If-Modified-Since 未变)→ 写 304 空体返回(鉴权已在 handler 层完成,304 不泄内容)。Cache-Control 保持 private+must-revalidate 即可——有了 ETag,重校验变成廉价 304 而非整份重下。因 prism GetPDF 也走 ServeObject,一并受益。前端备选(次选):把已加载 arraybuffer 按 libPaperId 用 react-query 缓存(拉长 gcTime)供切回复用——但 pdf.js 文档生命周期复杂,不如后端 ETag 干净。两者做其一即可。
- **代码骨架**:
```
// ServeObject 非 Range 分支,GetObject 前:
info, err := StatObject(ctx, bucket, key)
...
h.Set("ETag", info.ETag)
h.Set("Last-Modified", info.LastModified.UTC().Format(http.TimeFormat))
if match := r.Header.Get("If-None-Match"); match != "" && strings.Contains(match, info.ETag) {
  w.WriteHeader(http.StatusNotModified); return nil
}
```
- **风险**:低。只对非 Range 条件 GET 返 304,避免与 Range/If-Range 交互出错(pdf.js 大量用 Range;保守起见 Range 分支不引入 304)。ETag 用 MinIO 对象自带值(单 part 上传=MD5)。多一次 StatObject 往返可忽略(Range 分支本就已 Stat)。
- **验证**:打开一篇库内 PDF → 切到详情 tab → 切回 PDF tab:Network 确认顶层文档请求返回 304(或 Range 命中浏览器缓存)而非整份 200;首次打开仍正常渲染;prism 编译 PDF 预览同样受益。
- **依赖**:无(纯后端,可独立发布)

##### [🟡 P2 · S(<1h)] 发现 4:搜索页拖宽手柄每 pointermove 同步写 localStorage + 派发全局事件 + 二次 JSON.parse 回读(features/search/pages/SearchPage.tsx:242)

- **代码确认**:已亲读。SearchPage.tsx:242-249 onMove 每 pointermove 调 setSearcherWidth,来自 useLocalStorage(230);useLocalStorage.ts:28-31 set 同步 setItem+JSON.stringify+dispatchEvent('local-storage'),43-44/11-19 自监听该事件回调 setValue(read()) 再 getItem+JSON.parse。即拖动每帧 setItem+派发+getItem+parse+双 setState。问题仍在。
- **改动点**:frontend-user/src/features/search/pages/SearchPage.tsx:startDrag
- **做法**:最小可行:拖动期间用一个普通 useState `dragWidth`(不落 localStorage),布局宽度用 `dragWidth ?? searcherWidth`;onMove 只 setDragWidth;onUp 时一次性 `setSearcherWidth(final)` 落盘 + setDragWidth(null)。彻底档:给 useLocalStorage 的 set 增『同实例自 set 时跳过自派发事件回读』短路(自己刚 setValue 过,无需再监听自己的事件回读)——但这会改公共 hook,影响面大,不如就地隔离。
- **风险**:极低。仅去掉拖动中途的 storage IO,最终值仍持久化。注意 dragWidth 与 searcherWidth 的优先级别写反导致松手回跳。
- **验证**:满页搜索结果 + 矩阵已挂载时拖分栏,Performance 录制确认拖动帧无 localStorage setItem/getItem,掉帧消失;松手后刷新页面宽度已持久化。
- **依赖**:无

##### [🟡 P2 · M(半天)] 发现 5:PdfViewer 连续/双页模式一次性 mount 全部页面,无虚拟化(shared/components/PdfViewer.tsx:48)

- **代码确认**:已亲读。PdfViewer.tsx:48-49 组件头注释自认『continuous/two-up 一次性 mount 所有 Page,百页再上 react-virtual』。多页模式由 PdfViewerContent 按 numPages 全量渲染(每页 canvas+text+annotation layer)+每页 IntersectionObserver。全站通用预览(文献库/OA 全文/prism 产物)。问题仍在。
- **改动点**:frontend-user/src/shared/components/PdfViewer.tsx、frontend-user/src/shared/components/pdf-viewer/PdfViewerContent.tsx、frontend-user/src/shared/components/pdf-viewer/hooks/use-multi-page-scroll.ts
- **做法**:最小兜底(S,先上):numPages 超阈值(如 60)时禁用 continuous/two-up 模式(toolbar 置灰 + 提示『大文档请用单页』),或超阈值自动回落 single——零虚拟化成本挡住 tab 崩溃。理想(M/L):PdfViewerContent 多页模式接 @tanstack/react-virtual(项目既定方案,已 4 处先例),按页高估算 + overscan 只渲染视口附近页;当前页同步、scrollToPage、模式切换定位需适配虚拟窗口。
- **备选**:仅提高兜底阈值不虚拟化——最省;长报告/学位论文用户仍受限,按优先级 P2 可接受先兜底。
- **风险**:虚拟化改动大:页高不定(缩放/fit-width 变化)、IntersectionObserver 当前页同步与虚拟窗口的交互、scrollToPage 需换算成 virtualizer.scrollToIndex;回归三模式切换、翻页、缩放、移动端。兜底档几乎零风险但牺牲大文档的连续阅读体验。
- **验证**:打开 100+ 页 PDF 切连续模式:兜底档确认被拦/回落 single 不崩;虚拟化档确认 DOM 只保留视口附近页、内存平稳、滚动流畅、当前页号正确。
- **依赖**:无

##### [🟡 P2 · S(<1h)] 发现 10:admin 导入任务详情 1.5s 轮询不判终态(features/admin/api/feature-tools.ts:192)

- **代码确认**:已亲读。feature-tools.ts:188-198 useImportJob 的 refetchInterval=`poll?1500:false`,判停交调用方;但 FeatureToolImportPage.tsx:42 传 `jobId!=null`、FeatureToolJobsPage.tsx:62 传 `!!id`——都是『有没有 id』而非『是否在跑』(两处 43/63 行另算 running=status∈{pending,running} 只用于 UI 文案,不回传 hook)。ImportJob.status 类型含 succeeded/partial/failed 终态(:16)。问题仍在。
- **改动点**:frontend-user/src/features/admin/api/feature-tools.ts:useImportJob、frontend-user/src/features/admin/pages/FeatureToolImportPage.tsx、frontend-user/src/features/admin/pages/FeatureToolJobsPage.tsx
- **做法**:见 sharedRefactor『轮询终态判停统一』。把判停收进 hook:refetchInterval 改 `(q)=>{const s=q.state.data?.status; return s==='pending'||s==='running'?1500:false}`,poll 入参可删(或保留仅作 enabled 语义)。两个调用方去掉 poll 透传。
- **代码骨架**:
```
refetchInterval: (q) => {
  const s = q.state.data?.status;
  return s === 'pending' || s === 'running' ? 1500 : false;
},
```
- **风险**:极低。与 useSubmission 同范式。若删 poll 参数需同步改两个调用点签名。
- **验证**:打开一个已完成/失败的导入任务详情或弹窗:Network 确认停止 1.5s 轮询;进行中的任务仍轮询到终态。
- **依赖**:无

##### [🟡 P2 · M(半天)] 发现 11:admin 会话监控 transcript 全量拉取无分页(features/admin/api/session-monitor.ts:64)

- **代码确认**:已亲读并核后端。session-monitor.ts:59-70 useAdminTranscript 直接 GET /admin/agent-sessions/:id/messages 不传 limit。后端 admin_monitor.go:110 AdminGetSessionMessages:journal 路径已硬编码 ReadRecentTurns(...,500) 有上限(119),但 fork/executor 兜底路径 GetSessionMessages(...,0)(131)无界,且不接受前端 limit。对照用户端 claw/api/session.ts:85-118 已按 limitTurns 窗口化。问题成立但已被 500 缓解(风险有限)。
- **改动点**:frontend-user/src/features/admin/api/session-monitor.ts、backend/internal/agentbridge/admin_monitor.go:AdminGetSessionMessages
- **做法**:最小可行:后端 AdminGetSessionMessages 读 `limit` query(默认如 200),journal 路径把 500 换成该值、fork 兜底 GetSessionMessages(...,limit) 传入而非 0;前端 useAdminTranscript 增 limitTurns 参数默认拉最近 N 轮。理想:对齐用户端『加载更早』增量拉(sliceRecentTurns 后端已具备)。
- **风险**:低。后端 sliceRecentTurns/ReadRecentTurns 已支持 limit,改动是把常量换成参数。要保证监控『看到的=用户看到的』语义(用户端也是窗口化,天然一致)。默认值别太小以免管理员漏看关键轮。
- **验证**:造一个超长会话(数百轮)在管理端监控打开:确认默认只拉最近 N 轮、响应体与渲染耗时下降;『加载更早』能取到更早轮。
- **依赖**:无(与用户端 claw 窗口化同型,可参考)

##### [🟡 P2 · S(<1h)] 发现 12:引用选择器与文献集对同一端点维护两套 queryKey,互不共享缓存且写失效覆盖不到(shared/api/library-browse.ts:22)

- **代码确认**:已亲读。library-browse.ts:22 folders 键 `['shared','library-browse','folders']`、:48 papers 键 `['shared','library-browse','papers',...]`,与 features/library 的 `['library',...]` 两套。library-invalidation.ts:17-21 invalidateLibrary 谓词 `q.queryKey[0]==='library' && q.queryKey[1]!=='quick-search'`,命不中 'shared' 前缀 → 收藏/取消后引用选择器里的『已收藏/列表』不被失效。问题仍在。
- **改动点**:frontend-user/src/shared/api/library-browse.ts(改 queryKey)
- **做法**:把 browse 键并入 'library' 命名空间:folders→`['library','browse','folders']`、papers→`['library','browse','papers',...]`。queryKey 只是字符串数组,shared 层用 'library' 前缀不违反分层(不 import features)。这样 invalidateLibrary 谓词(queryKey[0]==='library' 且 [1]!=='quick-search','browse'≠'quick-search')天然覆盖,库写操作后选择器随之刷新。备选:在 invalidateLibrary 谓词里追加 'shared'/'library-browse' 前缀命中(反向,不如统一命名空间干净)。
- **风险**:低。注意:改键不会与 features/library 现有 folders/papers 查询『共享同一缓存条目』(键 shape 不同,仍是独立 entry)——真正共享缓存需两侧用完全相同 queryKey,那会牵扯 shared 复用 features 的键形状,超出本次范围;本改动只解决『失效覆盖』这一半(选择器打开时收藏状态实时),已是主要收益。全站搜确认无其他地方按旧 `['shared','library-browse']` 前缀做过 invalidate/getQueryData(若有需同改)。
- **验证**:引用选择器打开时,在文献集别处收藏/取消一篇:确认选择器列表/勾选态随之刷新(此前不刷新);不触发在线 quick-search 三源重拉。
- **依赖**:无

##### [🟡 P2 · S(<1h)] 发现 14:无摘要论文/零指标学者详情 fallback 拉取永不收敛(features/browser/components/PaperDetailPane.tsx:68)

- **代码确认**:已亲读。PaperDetailPane.tsx:68 `needsFetch = !isLocal && (!tab || !tab.paper.abstract)`——上游本无摘要的论文 fetch 回来 abstract 仍空;browser-tabs.store.ts:195 `incomingRicher = !!paper.abstract && !existing.paper.abstract` 使空摘要永不覆盖 stub、tab 永不带 abstract → 每次重访重打 /public/papers/:id。author 合并(:271-273)`paperCount>0||hIndex>0` 同理零指标不收敛。问题仍在。
- **改动点**:frontend-user/src/stores/browser-tabs.store.ts(PaperTab/AuthorTab 加标记 + 合并条件)、frontend-user/src/features/browser/components/PaperDetailPane.tsx:needsFetch
- **做法**:见 sharedRefactor『详情页取数收敛』。PaperTab 增 `detailLoaded?: boolean`;openPaperTab 增可选参数或新增 markDetailLoaded(id),PaperDetailPane 的 fallback.data effect(:85-89)灌入时置 detailLoaded=true;needsFetch 改 `!isLocal && (!tab || !tab.detailLoaded)`。browser-tabs 合并:来自 detail(detailLoaded)即覆盖 existing.paper(接口返回权威,空也算已拉)。author tab 同法加 detailLoaded 并把合并条件改为『本次来自 detail 接口即覆盖』。
- **风险**:低。要区分『来自列表 stub 的 openPaperTab』(不置 detailLoaded)与『来自 detail 接口的 openPaperTab』(置 true)——靠调用点传参。react-query 自身 staleTime(STALE_COOL)在缓存未 gc 时已能挡重复请求,本改动解决的是缓存 gc 后重访仍打接口;别把 detailLoaded 持久化成永不刷新(仍受 react-query staleTime 控制正常刷新)。
- **验证**:打开一篇上游无摘要的老论文详情 → 切走 → 切回/刷新后重访:Network 确认 /public/papers/:id 不再每次重打(tab.detailLoaded 已置);零指标学者页同验。
- **依赖**:无(与发现 15 同文件,建议同批改)

##### [🟡 P2 · S(<1h)] 发现 15:冷进入(SEO 直达)论文详情 references 串行在元数据之后,白等一个 RTT(features/browser/components/PaperDetailPane.tsx:204)

- **代码确认**:已亲读。PaperReferences 只在拿到 paper 后挂载(PaperDetailPane.tsx:116 `if(!paper)` 守门,:204 `{!isLocal && <PaperReferences paper={paper}/>}`);其内 PaperReferences.tsx:19-20 useFetchPaperReferences 只需 paperId,而 paperId 在 URL t0 即有(paper-detail.ts:80 queryKey `['paper','references',paperId]`)。冷进入(无 tab 快照)先等 /public/papers/:id 再发 references。暖路径(tab 命中)无此问题。问题仍在。
- **改动点**:frontend-user/src/features/browser/components/PaperDetailPane.tsx(顶层冷进入预取)
- **做法**:见 sharedRefactor『详情页取数收敛』。冷进入(已有 coldEntryRef=!tab&&!isLocal&&!!source&&!!paperId)时在 PaperDetailPane 顶层挂一个 useFetchPaperReferences(paperId, coldEntry) 预取,与详情请求同时出发;因与 PaperReferences 内部同 queryKey 自动去重,PaperReferences 挂载时直接命中缓存。暖路径维持 PaperReferences 内 referenceCount 守门不变(不预取)。
- **风险**:低。冷进入时不知 referenceCount,预取可能对 0 引用论文白发一次 /references——但冷进入是低频 SEO 落地,且省一个 RTT 的收益对未登录高流量路径更值;可加 coldEntry 门限只在冷路径预取,暖路径零变化。
- **验证**:清 localStorage(无 tab 快照)直达 /paper/stc/:id:Network 确认 /public/papers/:id 与 /public/papers/:id/references 并行发出(而非串行),references 区块出现更快;站内点开(暖路径)行为不变。
- **依赖**:无

#### 本簇落地顺序
建议按『一处改全局生效的高 ROI 收口 → 渲染层增量化 → P2 清理』推进。第一批(P1、S、低风险,可当天全落):发现 1(thinking 合并)、发现 8 + 10(轮询终态判停,共用同一范式一起改)、发现 9(下载长超时出口)、发现 13(后端 PDF ETag,纯后端独立发布)、发现 7(引用选择器防抖)。第二批(P1、M,渲染层):发现 2(先做 memo 兜底的 S 档,再 socket 引用稳定/ fold 增量)、发现 6(先前端裸 mutation 单次失效,后端 batch 端点随后)、发现 3(先 useDeferredValue+memo,非受控重构可延后)——建议发现 1 与 2 同批上线,二者叠加才根治『越聊越卡』。第三批(P2 清理):发现 4(拖宽)、发现 12(library-browse 命名空间)、发现 14 + 15(同文件 PaperDetailPane 一起改)、发现 11(admin transcript 分页)、发现 5(PdfViewer 先上 S 兜底阈值,虚拟化按需)。发现 14/15 同文件建议合并一个 PR;发现 8/10 判停范式相同合并一个 PR;发现 9 各下载站点一个 PR 收口。

#### 待人拍板
1)发现 6:后端批量端点 POST /papers/:id/papers/batch 是否本轮就做(理想),还是先只上纯前端裸 mutation 单次失效(最小可行)?涉及后端排期与是否愿意新增端点。2)发现 3:Prism 是否接受为消除键击重渲做『非受控编辑器』重构(L,风险中,需回归切文件/AI apply/rebase),还是本轮只做 useDeferredValue+memo 的 S 档止血?3)发现 13:确定走后端 ETag(推荐,prism 一并受益)还是前端 arraybuffer 缓存二选一——建议后端,但需确认 must-revalidate + 304 与 pdf.js Range 行为在你们目标浏览器矩阵下无回归(可先灰度)。4)发现 5:PdfViewer 大文档是先上『超阈值禁用连续模式』兜底即可,还是必须本轮虚拟化(涉及是否有真实百页 PDF 用户投诉)?5)发现 11:admin transcript 默认窗口 N 取多少轮(既要省流又别让管理员漏看关键上下文),需产品/运营拍板。


---

### 簇:Prism LaTeX 编译链路 backend 侧 `prism-compile`

**整体判断**:本簇 5 条发现集中在 backend/internal/prism 的编译编排热路径,核心矛盾是「runCompile 每次全量物化 + 无并发闸」:每个 StartCompile 无条件建 queued 行 + 裸 goroutine,后台立刻抢沙箱槽(sandbox MAXPAR=3),排队者等满 95s pollTimeout → 伪「编译服务异常」→ 被前端 auto-fix 回喂放大成 AI 轮风暴;且缓存命中路径也先白下载全部资产、资产取失败静默跳过污染缓存键、PDF 禁缓存整份重拉、struct 保存无条件投影追加版本。这 5 条里有 3 条(#1/#2/#5)本质是 runCompile 编排的同一处,应当一次重构:①沙箱信号量(容量对齐 MAXPAR)+ 队列等待与编译预算分离;②缓存判断提到资产字节下载之前、assetHash 纯 DB 算;③资产取失败=编译失败并区分 infra/latex 错误类型,让前端只对真 LaTeX 错误 auto-fix。#3(PDF 缓存头 + 启动重排 queued)与 #4(写放大短路 + 版本修剪)相对独立,可跟随主重构分期落地。整体偏 P1(用户可感知的伪故障 + token 浪费),无 P0 崩溃级。

#### 统一改法(一次解决多个发现)

**◆ runCompile 编排重构:沙箱信号量 + 缓存前置 + 资产失败即失败 + 错误分类**
- 一次解决:#1(②③)、#2、#5,并为 #3(b) 的错误分类提供 error_kind 信号
- 设计:在 service.go 引入包级带缓冲信号量 sem := make(chan struct{}, prismMaxParallel)(prismMaxParallel 从 env PRISM_MAX_PARALLEL 读,默认 3,文档标注须与沙箱 COMPILE_MAX_PARALLEL 同步)。把 gatherAssets 拆成两半:(a) assetDigest(projectID)——纯 DB 遍历 KindAsset 文件,用 sorted(RelPath+':'+ContentSHA256) 算 assetHash,零 MinIO 调用;(b) fetchAssetBytes(ctx, refs)——只在缓存 miss 时对每个资产 GetObject+ReadAll,取失败直接 return err(不再 continue 跳过)。runCompile 重排为:gatherCurrent→定引擎→assetDigest(纯DB)→cacheKey=sha(hash|engine|assetHash)→FindCachedCompile 命中则直接复用返回(全程零 MinIO 读,解决 #2 缓存命中白下载)→miss 才 fetchAssetBytes,失败则 failCompileKind(compileID,'infra','素材读取失败,请稍后重试',err)(解决 #5)。沙箱调用外包一层信号量:先用带独立超时的 queueCtx(如 120s)acquire——acquire 成功后再 context.WithTimeout(100s) 起编译预算(把「排队等待」与「编译执行」两个时钟彻底分开,解决 #1②「pollTimeout 从入队计时」);acquire 超时/被 cancel 则 failCompileKind(compileID,'timeout','编译排队超时,请稍后重试',err)。failCompile 增开 error_kind 维度('latex'|'infra'|'timeout'),经迁移给 prism_compiles 加 error_kind VARCHAR(默认'')列——真 LaTeX 错误(res.Status==error 的正常分支)写 'latex',内部/超时错误写 'infra'/'timeout'(解决 #1③)。信号量 acquire 期间 Compile 行保持 queued 状态,拿到槽后才置 running(前端 queued/running 都显示编译中,UX 无回退)。

**◆ 投影/版本 sha 短路**
- 一次解决:#4(a)
- 设计:在 UpsertFileBody(struct_repository.go:94)get-or-create 到 File 后,增 f.ContentSHA256 == sha256Hex(body) 判断,相等直接 return nil,跳过 AppendCurrentVersion。File 表已冗余 ContentSHA256 列,零额外查询;新建文件分支 ContentSHA256 为空必不匹配,首版本照常写。这样 materializeStruct 每次投影时,投影产物未变的文件(800ms 防抖里绝大多数停顿只改单块,references.bib 几乎从不变)不再追加空版本,与 SaveStructVersion 既有 sha 去重对齐,消掉 struct 已去重但投影仍写放大的架空。

#### 逐条实施方案

##### [🟠 P1 · M(半天)] #1 StartCompile 无并发闸/在途去重:多用户排队产生伪「编译服务异常」+ 被 auto-fix 放大成 AI 轮风暴(service.go:285-298)

- **代码确认**:确认仍在。StartCompile(service.go:289-296)无条件 CreateCompile(queued) + safego.Go('prism-compile',...);runCompile 内无信号量、无 per-project 在途去重;缓存只在 :320 查一次,在途结果不共享。沙箱 MAXPAR=3(prism_tex/entrypoint.sh:25),latexmk 超时 60s,backend pollTimeout 95s(texclient.go:36),ctx 100s(service.go:313)。安全边界:100s ctx 目前在 gatherAssets 之前就起,排队等待吃掉编译预算,正是排队者伪超时的根因。
- **改动点**:service.go: StartCompile / runCompile / failCompile(改为 failCompileKind);texclient.go 不动;新迁移 docker/mysql/migrations/00NN_prism_compile_error_kind_fields.sql;前端 PrismWorkspaceV2.tsx triggerCompile + auto-fix effect
- **做法**:最小可行改动:仅加信号量(见 sharedRefactor『runCompile 编排重构』的信号量部分)+ 队列/编译时钟分离 + error_kind 分类。信号量容量=env PRISM_MAX_PARALLEL(默认 3,对齐沙箱)。acquire 前保持 queued,acquire 后置 running 并起 100s 编译 ctx;acquire 用独立 queueCtx(120s)兜底,超时写 error_kind='timeout'。前端 auto-fix effect(PrismWorkspaceV2.tsx:211-232)增判 c.error_kind==='latex'(或空且有 log_excerpt)才 arm 自动修复,'infra'/'timeout' 直接停留琥珀 banner 不回喂 AI(解决『放大成 AI 轮风暴』)。triggerCompile 增在途守卫 if(compiling) return(#1④)。理想重构:再叠 per-project 在途去重——包级 sync.Map[projectID]*inflight(存 compileID+done chan),StartCompile 若该项目已有在途编译,直接 re-fetch 既有 Compile 行返回、不建新行不起 goroutine,runCompile defer 清 inflight。收益是折叠 auto-fix 双触发/双击/多用户同项目;代价是内容分歧时第二请求拿到略旧 PDF(可接受:后续 autosave→compile 会再触发一次)。建议先落最小可行,在途去重按线上是否仍见风暴再决定。
- **代码骨架**:
```
var compileSem = make(chan struct{}, prismMaxParallel())
// runCompile: assetDigest → cacheKey → 命中返回
// miss:
queueCtx,qc := context.WithTimeout(context.Background(),120*time.Second)
select{ case compileSem<-struct{}{}: qc(); case <-queueCtx.Done(): qc(); s.failCompileKind(id,"timeout","编译排队超时,请稍后重试",queueCtx.Err()); return }
defer func(){ <-compileSem }()
ctx,cancel:=context.WithTimeout(context.Background(),100*time.Second); defer cancel()
assets,err:=s.fetchAssetBytes(ctx,refs); if err!=nil{ s.failCompileKind(id,"infra","素材读取失败,请稍后重试",err); return }
s.repo.UpdateCompile(id,map[string]any{"status":CompileRunning,...})
res,err:=s.tex.Compile(ctx,files,assets,mainFile,engine)
```
- **备选**:考虑过用 golang.org/x/sync/singleflight 做去重:但它按 key 共享『返回值』,而这里每请求已建独立 Compile 行、需各自更新状态,套用反而别扭;自建 inflight map 更贴合。考虑过纯前端节流不动 backend:挡不住多用户跨会话排队,且 backend 侧全量 goroutine 抢槽的根因不解,故否。
- **风险**:信号量容量若设小于沙箱 MAXPAR 会白白降低吞吐;设大于则退化回排队伪超时——务必对齐,文档写清。单实例假设(与 struct_service.go structWriteMu / agent hub 一致),多实例需换 Redis 令牌,当前部署单实例安全。error_kind 迁移须幂等 add_column_if_not_exists + 默认空串,老行读到空串→前端按现有『有 log_excerpt 即 latex』回落,不破坏既有行为。
- **验证**:docker compose build backend 编译过;本地并发压测:对同一/多个项目并发点 6+ 次编译,观察 docker logs scholar_backend 无『compile timed out』批量出现、排队者最终成功而非 error;人工在编译报错文档上确认 auto-fix 仍触发(error_kind=latex),而制造一次 MinIO 取图失败/排队超时确认 banner 停在手动介入不回喂 AI。
- **依赖**:无(error_kind 迁移需先于前端分类生效;同批上线)

##### [🟠 P1 · M(半天)] #2 每次编译全量物化:缓存命中路径也先白下载全部资产字节,assetHash 走 GetObject 而非 DB(service.go:256-282, 316-320)

- **代码确认**:确认仍在。gatherAssets(:263-279)对每个 KindAsset 逐个 storage.GetObject+io.ReadAll 整段读进内存,assetHash 只对成功取到的字节追加(实际哈希用的是 f.RelPath+':'+f.ContentSHA256,:278,资产字节本身并未参与哈希——所以字节下载对 cacheKey 计算是纯浪费);runCompile 在 :316 先 gatherAssets 再 :320 查缓存,命中也已白下载。
- **改动点**:service.go: 拆 gatherAssets → assetDigest(纯DB)+ fetchAssetBytes(MinIO);runCompile 重排缓存判断到字节下载之前
- **做法**:见 sharedRefactor『runCompile 编排重构』:assetDigest 纯 DB 出 assetHash+refs,cacheKey 先算先查缓存,命中直接返回(零 MinIO 读);miss 才 fetchAssetBytes。因 assetHash 本就只依赖 DB 的 RelPath+ContentSHA256,拆分后哈希语义完全不变、缓存键稳定,不会引入 miss。理想重构(可后置,不阻塞):在共享卷做按 ContentSHA256 的资产内容寻址缓存,fetchAssetBytes 命中则硬链接进任务目录,同图跨编译只拉一次 + GetObject 流式直接拷到任务目录文件避免整段驻内存(gatherAssets 现在 io.ReadAll 到 map,大图内存尖峰)。
- **代码骨架**:
```
func (s *Service) assetDigest(pid uint)([]assetRef,string,error){ files:=ListFiles; for KindAsset{ refs=append(...); shas=append(RelPath+":"+ContentSHA256)} sort; return refs, sha256Hex(join)}
```
- **备选**:考虑过保留 gatherAssets 单函数、只把缓存判断提前但仍传字节:做不到,因为缓存判断需要 assetHash,而现实现 assetHash 只能在遍历资产时产出——拆成纯 DB 的 assetDigest 才能在下载前拿到 hash。
- **风险**:低。cacheKey 计算输入不变→线上已有缓存行仍命中。fetchAssetBytes 失败语义变更(#5 一并处理)会让原本『缺图仍出 PDF』的极少数场景变成 error——这是期望修正,见 #5。
- **验证**:对含图项目连编两次:第二次 docker logs 确认无 asset GetObject 调用(可临时加 debug 或看 MinIO 访问)、compile 秒回 success;改一处文本再编,确认仍走沙箱且图正常。
- **依赖**:与 #1/#5 同属 runCompile 重构,一次改完

##### [🟠 P1 · M(半天)] #3 PDF 回传全量代理且禁缓存 + backend 重启后 queued 行永久滞留致 tab 无限轮询(handler.go:319-342, 前端 prism.ts:174-178 / PrismWorkspaceV2.tsx:381)

- **代码确认**:确认仍在。GetPDF(handler.go:334-341)io.Copy 全量代理 + Header『Cache-Control: no-store』(:336),无 ETag/Accept-Ranges/304。前端每次成功 pdfKey+1→prismPdfSource ?v= 整份重拉(PrismWorkspaceV2.tsx:113-123),下载按钮(:379-393)再 http blob 完整拉第二遍。useCompile(prism.ts:174-178)queued/running 每 1s 轮询、终态停,但无最大时长兜底——backend 重启后 goroutine 已死、queued 行不会再更新→前端永久 1s 轮询。Compile 模型仅 CreatedAt 无 updated_at(model.go:131-145),启动无任何 requeue。
- **改动点**:handler.go: GetPDF(加 ETag/304,可选 Accept-Ranges);service.go: OpenLatestPDF 回传 ObjectInfo 已有 ETag;新增 repo.RequeueStaleCompiles + service 启动调用(挂 StartBackgroundGC 或 bootstrap.go:563 附近);前端 prism.ts useCompile refetchInterval 加 age 兜底
- **做法**:分三小块,可独立落。(a)缓存头【S】:GetPDF 改为按内容寻址返回——PdfObjectKey 含 cacheKey,天然内容寻址。设 ETag=info.ETag(或 pdf_object_key),读 If-None-Match 命中回 304;Cache-Control 从 no-store 改 'private, max-age=31536000, immutable'(前端 ?v= 每次成功换 URL 已保证换版本换 URL,immutable 安全)。这样 pdf.js 重渲/下载按钮命中浏览器缓存,不再整份重拉两遍。(b)启动 requeue【S】:新增 repo.RequeueStaleCompiles(cutoff)——UPDATE prism_compiles SET status='error',error_summary='服务重启,请重试',error_kind='infra' WHERE status IN('queued','running') AND created_at < cutoff(cutoff=now-5min > 100s 最大编译时长,安全;用 created_at,模型无 updated_at)。在 StartBackgroundGC 首次 gc 前调用一次(单实例,启动时任何 queued/running 都是死 goroutine 遗留)。(c)前端轮询兜底【S】:useCompile refetchInterval 回调里,若 queued/running 且 Date.now()-new Date(data.created_at).getTime() > 5*60_000 则 return false 停轮并让 UI 显示超时。理想重构(可后置)【L】:GetPDF 支持 Range/Accept-Ranges,让 pdf.js 分段加载大 PDF——需按 Range 头走 MinIO GetObject 的 range 选项 + 206 响应,工作量大,先不做。
- **代码骨架**:
```
// GetPDF
if info!=nil && info.ETag!="" { if c.GetHeader("If-None-Match")==info.ETag { c.Status(304); return }; c.Header("ETag",info.ETag) }
c.Header("Cache-Control","private, max-age=31536000, immutable")
// prism.ts refetchInterval
const age=Date.now()-new Date(q.state.data?.created_at??0).getTime();
if((s==='queued'||s==='running') && age<5*60_000) return 1000; return false;
```
- **备选**:(a)考虑过继续 no-store 只减前端一次拉取:治标不治本,重渲/下载仍整拉。改 immutable+ETag 是业界 PDF 分发常规。(b)考虑过前端超时后主动 POST 取消:后端无取消端点、goroutine 已死无对象可取消,启动 requeue 是唯一根治死行的手段。
- **风险**:(a)immutable 需确保 URL 真随内容变——前端 ?v=pdfKey 是客户端计数器,每次成功都 +1,同一 URL 不会承载两份不同内容,安全;若担心可用 ETag+max-age 保守方案(每次带 If-None-Match 校验)。(b)requeue 用 created_at 而非 updated_at:queued 行 created_at=StartCompile 时刻,5min 阈值不会误伤正常在编(最长 100s),安全。前端资产 bind-mount 缓存:改 prism.ts 需 force-recreate/无缓存重建 frontend-user 才生效(部署注意)。
- **验证**:(a)编译成功后 DevTools Network 看 /pdf 首次 200、重开面板/点下载命中 304 或 disk cache、Response 头 Cache-Control 生效。(b)构造:置一条 status=queued created_at=1h 前的行 → 重启 backend → 查该行变 error;前端打开对应 tab 确认不再无限 1s 轮询(Network 停在超时)。
- **依赖**:(b)error_kind 列复用 #1 的迁移;三小块彼此独立可分别上线

##### [🟠 P1 · S(<1h)] #5 gatherAssets 对 MinIO 抖动 best-effort 跳过:瞬时取图失败静默改缓存键并把缺图 PDF 当成功缓存(service.go:267-271)

- **代码确认**:确认仍在。gatherAssets 取单资产失败只 slog.Warn 后 continue(:269-270),ReadAll 失败也 continue(:274);该资产既不进任务目录也不进 shas(:277-278 只对成功者追加)→ cacheKey 变化(本该命中变假 miss)+ latexmk 缺图仍可能出 PDF → 缺图 PDF 以『缺资产键』缓存 1h,runCompile 全程无感知,用户只见图没了。
- **改动点**:service.go: 随 sharedRefactor 拆出的 fetchAssetBytes 改为失败即 return err
- **做法**:见 sharedRefactor『runCompile 编排重构』:fetchAssetBytes 对任一资产 GetObject/ReadAll 失败直接 return err(不再 continue),runCompile 据此 failCompileKind(compileID,'infra','素材读取失败,请稍后重试',err),不写缓存(失败行无 expires_at)。这样瞬时抖动表现为一次可重试的 infra 错误,而非静默缺图污染缓存。因 assetHash 仍由 assetDigest 纯 DB 算(全部资产参与,与是否取到字节无关),缓存键不再随取图成败漂移(顺带修掉『假 miss 多付一次编译』)。
- **代码骨架**:
```
func (s *Service) fetchAssetBytes(ctx,refs)(map[string][]byte,error){ for _,r:=range refs{ rc,_,err:=GetObject(...); if err!=nil{return nil,fmt.Errorf("asset %s: %w",r.RelPath,err)}; data,err:=io.ReadAll(rc);rc.Close(); if err!=nil{return nil,err}; out[r.RelPath]=data }; return out,nil }
```
- **备选**:审计给的退路是『坚持 best-effort 就把缺失资产列表折进 assetHash 固定位并拒绝写缓存』:比直接 failCompile 复杂且仍交付缺图 PDF(用户困惑),不如 fail-fast 让用户重试;MinIO 抖动本就应重试而非降级出残稿。故选 fail。
- **风险**:低偏中:MinIO 若某资产键长期损坏/丢失,会让该项目编译持续 error 而非降级出无图 PDF——但这是正确暴露问题(数据真的缺了),error_kind='infra' + 文案引导重试,且不进 auto-fix 回路不烧 token。可选加固:error_summary 里带缺失文件名便于排查。
- **验证**:注入一次 MinIO 取图失败(临时改 key 或断 MinIO)→ 确认 compile 结果 status=error/error_kind=infra、无 expires_at 未写缓存、前端不触发 AI 修复;恢复后重编成功命中正常缓存。
- **依赖**:与 #1/#2 同属 runCompile 重构,一次改完

##### [🟡 P2 · M(半天)] #4 保存→投影链写放大:materializeStruct 无条件投影追加版本架空 SaveStructVersion 的 sha 去重;prism_file_versions 无修剪(struct_service.go:193/218-229, struct_repository.go:94-107)

- **代码确认**:确认仍在。saveStructLocked(:181-197)SaveStructVersion 有 sha 去重(struct_repository.go:46 内容一致不追加),但紧接 materializeStruct(:193)对 ProjectStruct(d) 每个产物无条件 UpsertFileBody→AppendCurrentVersion(struct_repository.go:105),后者无 sha 短路。V2 编辑器 800ms 防抖每停顿一次 onChange→SaveStruct,即使 struct 层去重成功,投影层仍给 main.tex(+references.bib)各追加一版。prism_file_versions 无任何后台修剪(只有 struct 历史读限 200 条)。
- **改动点**:struct_repository.go: UpsertFileBody 加 sha 短路;新增 repo.PruneFileVersions + 挂到 service.go StartBackgroundGC 的既有 24h ticker
- **做法**:最小可行改动【S】:见 sharedRefactor『投影/版本 sha 短路』——UpsertFileBody 在取到 File 后判 f.ContentSHA256==sha256Hex(body) 相等即 return nil。这一处消掉绝大部分写放大(投影产物未变的文件不再追加)。理想重构【M】:给 prism_file_versions 加后台修剪 repo.PruneFileVersions(每 file 保留最近 N 版 + 每天首版,删更早的 superseded 版本),挂在 StartBackgroundGC 已有的 24h gc ticker 里一起跑(复用 batch/limit 防一次扫太多的既有模式,service.go:426 gcCompiles 是样板)。修剪只删 status=superseded 且非 current、非每日首版的行,current 恒保留。
- **代码骨架**:
```
// UpsertFileBody
if err==nil && f.ContentSHA256==sha256Hex(body){ return nil } // 投影产物未变,跳过追加
// 新建分支 ContentSHA256 空必不匹配,首版照写
```
- **备选**:考虑过给 AppendCurrentVersion 内部加 sha 短路统一所有调用方:但 SaveFile(用户手动保存)语义上可能希望留痕、且 AppendCurrentVersion 也被 BatchAppend/ApplyRoundTx 复用,改动面大风险高;只在 UpsertFileBody(投影专用入口)加短路,精准且零副作用。考虑过缩短前端防抖(800ms→更长):治标,且损伤自动保存体验,否。
- **风险**:低。sha 相等即字节完全一致,current 已指向正确版本,跳过追加不改变可编译内容。修剪须保 current + 每日首版,避免用户历史面板/服务端恢复兜底(struct_repository 注释提到快照作恢复)被删空——删除条件严格限 superseded 且保留策略明确。
- **验证**:短路:V2 编辑器连续打字触发多次 autosave,查 prism_file_versions 对 main.tex 的版本号增长应与『投影产物实际变化次数』一致而非每次 autosave 都 +1;references.bib 在不改引用的编辑中版本号不再增长。修剪:构造某 file 上百版本 → 跑一次 gc → 确认只留最近 N + 每日首 + current。
- **依赖**:无(独立于 runCompile 重构)

#### 本簇落地顺序
建议顺序:①先落迁移 00NN_prism_compile_error_kind_fields.sql(幂等加 error_kind 列),它是 #1③/#3(b)/#5 错误分类的共同前置。②主重构 runCompile(sharedRefactor 一次性解决 #1②③ + #2 + #5):信号量 + 缓存前置 + assetDigest/fetchAssetBytes 拆分 + failCompileKind——这是本簇价值最高、最集中的一改,backend 单点。③配套前端:PrismWorkspaceV2.tsx auto-fix effect 按 error_kind 分支(#1③)+ triggerCompile 在途守卫(#1④)+ prism.ts useCompile 轮询 age 兜底(#3c)。④GetPDF 缓存头 ETag/immutable(#3a)+ 启动 RequeueStaleCompiles(#3b),彼此独立可并行。⑤最后清理类:UpsertFileBody sha 短路(#4a,S,低风险可随时插入)+ prism_file_versions 修剪(#4b,挂现有 gc ticker)。#4/#3 不依赖主重构,若想先出快赢可把 #4a 与 #3a 提前单独上线。

#### 待人拍板
1. 信号量容量:backend PRISM_MAX_PARALLEL 是否就取沙箱 COMPILE_MAX_PARALLEL 同值(默认 3)?若生产沙箱调过 MAXPAR 需同步 backend env——需确认运维口径(建议 backend 略等于或等于沙箱值,不超过)。2. #1 是否要上『per-project 在途去重』(理想重构)还是仅信号量(最小可行)?去重能进一步压掉 auto-fix 双触发,但引入『第二请求可能拿到略旧 PDF』的取舍,建议先只上信号量、观察线上是否仍见风暴再定。3. #3a 缓存策略选『immutable+max-age』(激进,靠 ?v= 换 URL)还是『ETag+304』(保守,每次校验)?前者省一次往返、后者更稳,需拍板。4. #4b 版本修剪的保留策略(最近 N 版 + 每日首版)N 取值、以及是否确认 prism_file_versions 历史无前端/恢复功能强依赖被删段(struct_repository 注释称服务端恢复兜底,需确认只依赖 current + struct 版本链而非 file 版本链)。


---

### 簇:后端中间件、Nginx、活库体检 `backend-mw-infra`

**整体判断**:本簇是后端中间件 + Nginx + 活库体检的稳定性/性能/清理混合。核心矛盾有三条主线:①「三层超时」(nginx 900s / ctx 15min / http.Server WriteTimeout 10min)三处数值各写各的、互不引用,导致长流在最弱一环(WriteTimeout 10min)被掐 + 路径分类既过宽(/analysis 全组拿 15min)又有漏(claw artifact.zip 落 15s、claw WS 落 nginx 60s);②「死代码/配置假象」一批(is_vip 分支、maintenance admin 分支、streamingPatterns 死模式),配置项看着生效实则空转;③「可观测性缺口 + 单点资源」一批(MySQL 慢日志关、Redis stall 无基线、umami 假 unhealthy、agent 单容器 1.5G 扛全部租户 OOM 即全挂)。总体策略:先做 4 个低风险高收益的「一处改到位」——nginx WS 正则补 claw(一词修 #6#8)、nginx 限流键改 $remote_addr(#9)、超时三层对齐(#2#3)、feature_tools 列表索引(#11);再清死代码(#4#5);最后补可观测性与资源上限(#7#12#13#14#15)。绝大多数是 S,唯 #3/#11/#7(理想档)是 M/L。

#### 统一改法(一次解决多个发现)

**◆ nginx WS 长超时 location 正则纳入 claw**
- 一次解决:#6 + #8(审计中是同一 bug 的两条重复记录)
- 设计:user.conf:48 的 `location ~ ^/api/v1/user/(smart-search|prism)/ws/` 改为 `^/api/v1/user/(smart-search|prism|claw)/ws/`,让 claw WS 与另两个 feature 同档拿 86400s 读写超时,不再落通用 /api/ 的 60s。一处一词。为杜绝下次新增 feature WS 再漏,备选改成 `^/api/v1/user/[a-z-]+/ws/` 通配(后端 ws_token 鉴权兜底,通配不放大攻击面)。部署需注意 nginx conf 是 bind-mount,改后 `docker exec scholar_nginx nginx -t && nginx -s reload`。

**◆ 三层超时数值对齐 + 路径分类重构**
- 一次解决:#2 + #3
- 设计:把 nginx(900s)/ APITimeoutMiddleware ctx(SSE 15min / object 10min)/ http.Server WriteTimeout 三处数值集中在一处注释互相引用,并同步修:①main.go:148 WriteTimeout 10min→改 16min(略大于最长 ctx 15min,仍留 backstop)或设 0(纯靠 per-request ctx + nginx 兜底);②timeout.go 的 streamingPatterns 精确化(只留真正长跑的 /analysis/papers/batch,删死模式 /continue /advanced-search /chat/stream /translate/stream);③isObjectServePath 补 /claw/session/artifact 与 .../artifact.zip;④Accept 头判定叠加路径白名单避免任意端点自授 15min;⑤PATCH/DELETE 并入 30s 写档。#2 是 #3 的一个子项(WriteTimeout),放一起改一次性收口。

#### 逐条实施方案

##### [🟠 P1 · M(半天)] #11 feature_tools 公开列表每请求全表扫 + filesort + 返回全量重模型(repository.go:129 List / handler.go:64 PublicList)

- **代码确认**:确认:repository.go:129 默认分支 `q.Order("sort_weight DESC, "+sortBy+" "+order)`,现有索引仅 idx_status(0010)/idx_status_cat/ft_name/ft_content(0011),无 (status,sort_weight,created_at) 复合索引 → filesort 成立;List 返回 []Tool 全模型,handler.go:72 直接 marshal items,重列全下发成立;公开入口 routes_scholar.go:146 GET /tools → PublicList。
- **改动点**:docker/mysql/migrations/0071_feature_tools_list_indexes.sql(新建);backend/internal/featuretool/repository.go:List / applyFilter;可选 backend/internal/featuretool/handler.go:PublicList + service.go:List
- **做法**:最小可行:①新迁移 0071 加复合索引 `add_index_if_not_exists('feature_tools','idx_status_sort_created','`status`, `sort_weight` DESC, `created_at` DESC', FALSE)`(MySQL8 支持降序索引),让默认排序路径(无搜索词分支 repository.go:129 `ORDER BY sort_weight DESC, created_at DESC LIMIT 24`)直接走索引序免 filesort;②ANALYZE TABLE 刷统计(可在迁移末尾 `ANALYZE TABLE feature_tools;`,幂等无害)。理想重构:③List 拆一个 ListItem 轻投影 —— 新增 repository.ListCards 用 `.Select(卡片列)` 只取 id/slug/name/name_en/logo/tagline/category/category_label/tags/price_type/access_type/is_open_source/view_count/favorite_count/sort_weight/status,排除 description_md/faq/use_cases/pricing/spec/reviews/alternatives/tutorials 等重 JSON 列(公开列表卡片用不到),payload 与反序列化成本都降一个量级,PublicList/AdminList 改调它;④public 无过滤路径的 total 用 30-60s Redis 微缓存(key=tools:count:published)。注意排序索引只覆盖默认 sort_weight+created_at 路径;用户传 sort_by=view_count 仍 filesort(可接受,非默认)。
- **代码骨架**:
```
-- 0071_feature_tools_list_indexes.sql
CALL add_index_if_not_exists('feature_tools','idx_status_sort_created','`status`, `sort_weight` DESC, `created_at` DESC', FALSE);
ANALYZE TABLE `feature_tools`;
```
- **备选**:给每个 sort_by 都建索引 —— 否决:sort_by 是低频筛选,多建索引拖慢写入且收益低。把列表结果整体 Redis 缓存 —— 否决:带 8 个筛选维度 + 分页,key 组合爆炸命中率低,且 admin 改工具后需失效逻辑复杂。
- **风险**:复合索引降序列在 MySQL8 有效但需确认线上是 8.0(docker-compose 是 mysql:8.0,OK)。投影 DTO 若前端列表卡片实际读了被排除的字段会白屏 —— 落地前须核对 frontend-user 工具列表卡片组件真实消费字段(见 openQuestions)。迁移铁律:单文件编号递增(0071)+ 幂等 add_index_if_not_exists + 不 DROP,已遵守。
- **验证**:迁移后 `EXPLAIN SELECT ... WHERE status='published' ORDER BY sort_weight DESC, created_at DESC LIMIT 24` 应显示 key=idx_status_sort_created 且 Extra 无 `Using filesort`;`docker-compose restart schema-sync backend` 看 scholar_schema_sync 日志确认迁移执行;curl /api/v1/tools 对比响应体大小(投影后应显著变小)与 p95 延迟。
- **依赖**:无

##### [🟠 P1 · M(半天)] #2 + #3(见 sharedRefactor「三层超时数值对齐 + 路径分类重构」):WriteTimeout 10min 掐断长流;/analysis 全组误拿 15min;claw artifact.zip 落 15s;Accept 头可自授;PATCH/DELETE 落读档

- **代码确认**:全部确认:main.go:148 `WriteTimeout: 10*time.Minute`;timeout.go:26-32 streamingPatterns 含 /continue 等死模式;:69 `Accept==... || isStreamingPath`;:51 子串列表有 /claw/artifact/ 但无 /claw/session/artifact,而路由 routes_user.go:304-305 是 /claw/session/artifact(.zip),子串不匹配 → 落 GET 15s 成立;:75 只判 POST||PUT。/analysis Contains 命中 routes_scholar.go:37-48 全组 9 个 CRUD + :79 public + admin 组。
- **改动点**:backend/cmd/server/main.go:148(WriteTimeout);backend/internal/common/middleware/timeout.go:isStreamingPath / isObjectServePath / APITimeoutMiddleware
- **做法**:最小可行(#2):main.go:148 WriteTimeout 10min→16min,并在此处 + nginx user.conf:85 + timeout.go:70 各加一行互引注释(nginx 900s ⊇ ctx 15min ⊂ WriteTimeout 16min)。路径分类(#3):①isStreamingPath 的 streamingPatterns 从 `{/chat/stream,/advanced-search,/continue,/analysis,/translate/stream}` 收缩为仅 `{/analysis/papers/batch}`(其余要么无路由要么已被 HasSuffix `/stream` 覆盖 —— 实测 /translate/paper/stream 由 HasSuffix 命中,/continue//advanced-search//chat/stream 无任何路由);②APITimeoutMiddleware:69 的 `Accept==text/event-stream || isStreamingPath` 改为 Accept 头需与路径白名单同时成立(`isStreamingPath(path) &&/|| ...`,防任意端点报 Accept 自授 15min —— 具体:仅当 isStreamingPath(path) 为真时才认 15min,Accept 头仅作辅助不单独授权);③isObjectServePath:51 的子串列表补 `/claw/session/artifact`(能同时覆盖 artifact 与 artifact.zip);④timeout.go:75 的 POST/PUT 写档扩到 `POST||PUT||PATCH||DELETE`。理想重构:把三层数值抽成一处常量/注释块,后续任一处改必须同步。
- **备选**:WriteTimeout 设 0(纯靠 ctx+nginx)—— 可选但去掉了 server 层 backstop,保守起见选 16min。object serve handler 改用 context.WithoutCancel + 自管超时替代路径匹配 —— 更干净但改动面大,列为后续。
- **风险**:streamingPatterns 收窄后若还有别的真·长跑非 /stream 端点会被误降到 15s —— 已 grep 确认当前只有 /analysis/papers/batch 与各 /stream;新增长跑端点须记得进白名单(注释提醒)。Accept 判定收紧后,前端若靠裸 Accept:text/event-stream 命中长超时的端点会被降级 —— 已确认 SSE 端点路径都以 /stream 结尾会被 HasSuffix 兜住,无回归。WriteTimeout 调大对慢客户端 goroutine 累积影响极小(ctx 15min 仍是硬顶)。
- **验证**:改后重放:①大 zip 下载(claw artifact.zip)在弱网 >15s 不被截断(下载完整);②POST /analysis/dimensions 这类快 CRUD 不再持有 15min ctx(可在 handler 打点或压测确认 goroutine 数);③长 SSE(审稿 stream)跑到 >10min 不再在 10min 处断(需构造长流或看 nginx error log 无 upstream timed out);④backend 编译验证 `docker compose build backend`(本机无 Go)。
- **依赖**:无

##### [🟠 P1 · S(<1h)] #6 + #8(见 sharedRefactor「nginx WS 正则纳入 claw」):claw WS 落通用 /api 60s 超时,长工具执行/心跳延迟被 nginx 掐断,且 pingLoop 出错静默退出

- **代码确认**:确认:user.conf:48 正则无 claw;routes_user.go:362 `/user/claw/ws/:sessionId`;通用 /api location:159-161 proxy_read_timeout 60s。
- **改动点**:nginx/conf.d/user.conf:48(WS location 正则);可选 backend/internal/agentbridge/hub.go:pingLoop
- **做法**:最小可行:user.conf:48 正则加 `claw`(见 sharedRefactor)。附带(可选、独立):hub.go 的 pingLoop 写失败时不静默 return,改为触发 hub 收口/重连或至少 slog.Warn 计数,避免保活链断了无人知。
- **备选**:通配 `[a-z-]+/ws/` 一劳永逸(见 sharedRefactor 备选)。
- **风险**:极低,纯 nginx 正则扩一词 + reload。通配版需确认没有别的 /api/v1/user/xxx/ws/ 路径不想要长超时(目前只有三 feature,全都要长超时)。
- **验证**:`nginx -t` 通过;claw 会话跑一个 >60s 的工具调用(如大 PDF 解析)WS 不断;`docker exec scholar_nginx nginx -T | grep claw` 确认正则含 claw。
- **依赖**:无

##### [🟠 P1 · S(<1h)] #9 nginx 限流键 $final_client_ip 信任客户端可伪造的 X-Real-IP / XFF 首段,10r/s 与 5r/s 过载保护可被完全绕过(nginx.conf:60)

- **代码确认**:确认:nginx.conf:60-61 zone 键 $final_client_ip;:26-35 map 取 XFF 首段 / 优先 $http_x_real_ip;docker-compose.yml 直接 `${HTTP_PORT:-5411}:80` 对外,nginx 即最外层。
- **改动点**:nginx/nginx.conf:60-61(limit_req_zone 键);nginx.conf:26-35(map 链,可保留供日志用)
- **做法**:最小可行(边缘直连,当前部署即是 5411:80 直接对外):limit_req_zone 的键从 $final_client_ip 改为 $remote_addr(TCP 对端真实 IP,客户端伪造不了)。$final_client_ip 的 map(取 XFF 首段/信任 X-Real-IP)可保留仅用于 access log / 传给 backend,但绝不做限流键。理想(生产前置可信 CDN/LB 时):启用 realip 模块 `set_real_ip_from <可信网段>; real_ip_header X-Forwarded-For; real_ip_recursive on;`,让 $remote_addr 被正确还原成真实客户端 IP,限流键仍用 $remote_addr。
- **备选**:继续用 XFF 但只取「可信代理追加的倒数第 N 段」—— 否决:边缘直连时前面没有可信代理,XFF 全是客户端可写,无可信段。
- **风险**:若生产实际前面有一层反代/CDN(非当前 compose 直连),改 $remote_addr 会把所有流量归到那层代理的 IP → 全局共享一个令牌桶误伤。故须先确认部署拓扑:当前 docker-compose 是直连,安全;若线上有 CDN 需走 realip 方案(见 openQuestions)。backend 侧 gin 已 SetTrustedProxies 到 nginx 私网(main.go:96),ClientIP 正确,这层是纵深第二道,改 nginx 不影响 backend 限流。
- **验证**:改后用不同伪造 `-H 'X-Real-IP: 1.2.3.x'` / `-H 'X-Forwarded-For: 9.9.9.x'` 循环打 /api/,应在真实同源 IP 下被 429(而非每次换假 IP 绕过);`nginx -t` + reload。
- **依赖**:无(但落地前需拍板部署拓扑)

##### [🟠 P1 · S(<1h)] #1 全局 BodyLimit 对 multipart 无条件放行,任意 JSON 端点谎报 multipart 即绕过 10MB,news webhook 验签前整读进内存(bodylimit.go:40)

- **代码确认**:确认:bodylimit.go:40-43 `if strings.HasPrefix(Content-Type,"multipart/form-data"){c.Next();return}` 完全跳过,只看请求头不看路由;UploadMaxBodySize=50<<20 常量已在同文件。
- **改动点**:backend/internal/common/middleware/bodylimit.go:BodyLimitMiddleware;可选 backend/internal/news webhook handler(验签前 LimitReader)
- **做法**:最小可行:BodyLimitMiddleware 对 multipart 不再完全跳过,而是包一层 50MB 硬顶 `c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, UploadMaxBodySize)`(50MB 与路由级 UploadLimit 的 50MB 相等,不会再出现内层更小架空全平台上传的老问题,同时挡住「任意端点伪造 multipart 推 50MB+ 无上限」)。理想(webhook 加固,独立):news webhook handler 在验签前用 `io.ReadAll(io.LimitReader(body, N))` 且先校验 Content-Length / 签名头存在性再读 body,避免未验签就吃满内存。
- **备选**:multipart 也强制 10MB —— 否决:会重新架空各上传路由的 50MB,回到历史 bug。按路由白名单决定是否豁免 —— 更精确但需维护上传路由清单,收益不抵复杂度,50MB 全局硬顶已够。
- **风险**:极低:合法上传本就 ≤50MB(UploadMaxBodySize),硬顶不影响;非上传端点伪造 multipart 现在被 50MB 挡(仍比无上限强)。注意 MaxBytesReader 在 handler 读 body 时才报错,recovery middleware 兜底,行为与现有 UploadLimit 一致。
- **验证**:构造 `-H 'Content-Type: multipart/form-data' --data-binary @60MB.bin` 打任意 JSON 端点应被 413/拒;正常 ≤50MB 上传(claw/feedback/library)不受影响;`docker compose build backend` 编译验证。
- **依赖**:无

##### [🟠 P1 · L(1-3天)] #7 生产 agent 容器 1.5G/2CPU 承载全部 4 个 AI feature 多租户负载,约 2 个重会话即 OOM 打挂整个容器(docker-compose.prod.yml:376)

- **代码确认**:确认:prod:376-378 memory 1.5G/cpus 2.0/pids 512 + 注释自承「单会话峰值 ~765MiB」;dev(docker-compose.yml:449-451)已是 1536M/2.0/384。四 feature(smart_search/claw/prism/peerreview)共用 scholar_agent 单容器成立。
- **改动点**:docker-compose.prod.yml:376-378(agent memory/cpus/pids);理想:backend/internal/agentbridge(并发准入闸)
- **做法**:最小可行:按目标并发上调 prod agent memory(如 3-4G,覆盖「单会话峰值 765MiB × 预期并发重会话数」+ headroom),cpus 按宿主核数放宽(如 3-4);pids 512 视 fork 情况保持或略升。dev compose(1536M/2CPU/384pids)已有上限,保持对齐即可。理想重构:backend 侧在 agentbridge 加 per-user + 全局并发会话准入闸 —— 超过阈值排队(返回「排队中」而非放进容器硬挤),把 OOM 前移成可控的排队/限流,而不是让 cgroup OOM kill 杀掉整个容器连累所有租户。可挂在 FeatureBridge 的 user_message 入口(与配额钩子 PreUserMessage 同一层)。
- **备选**:把 4 个 feature 拆多容器隔离 —— 隔离最彻底但运维/镜像成本高,且 agent 是单容器多租户设计(cc-haha),拆分是大工程,列为远期。只靠内存扩容不加准入闸 —— 治标,并发再高仍会 OOM,故理想档必须有闸。
- **风险**:扩内存受宿主总内存约束(需确认生产宿主余量,见 openQuestions)。准入闸设计要避免误伤(阈值太低正常用户排队)、要与现有 vip 配额链路协同不重复计。OOM kill 杀整容器是当前最大可用性风险,值得投入。铁律:agent 容器数据黑盒,准入闸只在 backend 侧计数(不读 jsonl)。
- **验证**:最小:改 compose limit 后 `docker stats scholar_agent` 观察峰值余量;理想:构造 N 个并发重会话验证第 N+1 个被排队而非全容器 OOM;看 `docker inspect` OOMKilled 计数归零。
- **依赖**:准入闸理想档可依赖 agentbridge 现有 hook 层

##### [🟡 P2 · S(<1h)] #4 TieredRateLimit 的 is_vip 分支是死代码(全库无人写 is_vip),VIP 限流倍率配置无效(ratelimit.go:167,272)

- **代码确认**:确认:grep 全库 is_vip 仅 ratelimit.go:167/272 两处读 + 注释,auth.go:127-131/196-200 只 Set user_id/username/user_type/user_role/token,无 is_vip 写点 → VIP 分支永不进,死代码成立。tieredRL 实例化在 routes.go:110。
- **改动点**:backend/internal/common/middleware/auth.go(可选:写 is_vip 的轻中间件);或 backend/internal/common/middleware/ratelimit.go + routes.go(删 VIP 分支与配置项)
- **做法**:两选一,建议先做「删假象」再按需补:①最小(删假象):删掉 TieredRateLimitMiddleware/TieredRedisRateLimitMiddleware 的 is_vip 分支与 TieredRateLimitOptions.VIPMultiplier + cfg.RateLimit.VIPMultiplier,消除「配了就生效」的错觉。②理想(真做 VIP 放大):在 UserAuthMiddleware 之后挂一个轻中间件,从 vip.EffectiveTier 读档并 `c.Set("is_vip", tier>free)`,带进程内短 TTL 缓存(避免每请求查库)。因 tieredRL 在各认证子组内挂(routes_scholar.go:38 等),该 hook 需在 tieredRL 之前执行。
- **备选**:无。
- **风险**:删配置项需同步 .env / config 加载(cfg.RateLimit.VIPMultiplier 引用点),漏删会编译失败(反而安全)。真做 VIP 版要防每请求查库拖慢热路径 —— 必须进程内缓存。此项非稳定性关键,别为它引入新的 DB 热调用。
- **验证**:grep 确认 is_vip 无残留读点(删法)或有唯一写点(做法);压测同一 VIP 用户确认限额确实放大(做法);`docker compose build backend`。
- **依赖**:若选「做」,依赖 internal/vip.EffectiveTier(已存在)

##### [🟡 P2 · S(<1h)] #5 MaintenanceModeMiddleware 挂在认证中间件之前,「已登录管理员放行」分支读不到 user_role,是死代码(maintenance.go:83;routes.go:120 顶层挂载)

- **代码确认**:确认:routes.go:120 `api.Use(MaintenanceModeMiddleware())` 在 /api/v1 组顶层,UserAuth/AdminAuth 在各子组才挂(routes_user.go/routes_admin.go),gin 顺序执行 → maintenance 运行时 ctx 无 user_role,:83 分支死。白名单 :104-110 含 /api/v1/admin/ 与 /api/v1/user/profile。
- **改动点**:backend/internal/common/middleware/maintenance.go:MaintenanceModeMiddleware
- **做法**:最小可行:在 maintenance「已登录管理员放行」分支处,当且仅当维护开启时,自行调 extractToken + ParseToken 轻量解出 role 判定(复用 auth.go 已有的 extractToken/ParseToken),而非依赖 c.Get("user_role")。因为只在维护模式开启(极低频)时才走这段解析,日常路径零开销。备选:把维护拦截从 /api/v1 顶层下沉到各认证子组的 auth 之后 + 公开路由白名单 —— 改动面大且要维护白名单,不如就地解 token。
- **备选**:依赖现有 /api/v1/admin/ 前缀白名单让 admin 进后台 —— 部分够用(admin 操作后台不受影响),但 admin 若访问非 admin 前缀的用户路由(如自己浏览用户端功能)仍被 503。就地解 token 才彻底。
- **风险**:极低,仅维护模式开启时多一次 token 解析。注意 ParseToken 失败/无 token 时按普通用户拒(维持现状)。
- **验证**:开维护模式,用 admin token 访问一个非 /api/v1/admin/ 且非白名单的用户端点,应放行而非 503;普通用户仍 503。
- **依赖**:无

##### [🟡 P2 · S(<1h)] #14 agent_turn_events 按 created_at 分区但读查询按 turn_id 过滤,永无分区裁剪,30 轮历史读带 filesort(eventlog_store.go:170-171)

- **代码确认**:确认:0046 建表 uk_turn_ev_seq=(turn_id,ev_seq,created_at)、PK=(id,created_at)、RANGE 分区 by created_at;eventlog_store.go:171 `WHERE turn_id IN ? ORDER BY id ASC`(id 非 uk 前缀 → filesort),:149 已是 ev_seq ASC。两查询 WHERE 均无 created_at → 探全部 5 分区成立。
- **改动点**:backend/internal/agentbridge/eventlog_store.go:ReadRecentTurns(:171)、ReadInFlightEvents(:149)
- **做法**:最小可行:ReadRecentTurns 的 `WHERE turn_id IN ? ORDER BY id ASC` 改为 `ORDER BY turn_id, ev_seq`(命中 uk_turn_ev_seq 前缀索引序,免 filesort;应用侧 toEvents 后按轮序拼接不变,因 turn_id 单调≈时间序、ev_seq 是轮内回放序)。ReadInFlightEvents:149 已是 `WHERE turn_id=? ORDER BY ev_seq ASC`(uk 前缀,本就免 filesort,无需改)。给 ReadRecentTurns 单次事件总行数设上限防超长会话一次性拉爆。理想:若保留分区,读查询带上 turn 的 created_at 范围(BeginTurn 已知)让裁剪生效;或评估该表是否真需要分区(月度清理也可用带索引的批量 DELETE)。
- **代码骨架**:
```
// ReadRecentTurns
.Where("turn_id IN ?", turnIDs).Order("turn_id, ev_seq").Find(&rows)
```
- **备选**:给 turn_id 单独建二级索引 —— 否决:uk_turn_ev_seq 前缀已覆盖 turn_id 查询,多建冗余。
- **风险**:ORDER BY 改动须保证折叠顺序不变:FoldToMessages 依赖事件按「轮序→轮内序」到达。turn_id ASC 把最近 limitTurns 个 turn 重新升序排列(chronological),ev_seq ASC 保轮内序,与原 id ASC 的全局插入序在正常情况等价(同一 session 事件插入序≈turn_id,ev_seq 序)。跨会话并发写不影响(WHERE 已限定单 session 的 turnIDs)。该功能受 AGENT_JOURNAL_READ 开关控制,低风险(见 openQuestions 确认是否已启用)。
- **验证**:`EXPLAIN` 改后查询 Extra 无 Using filesort;若带 created_at 范围则 partitions 列裁剪到实际月份;开 journal read 回放一个 30 轮会话确认消息顺序正确。
- **依赖**:无

##### [🟡 P2 · S(<1h)] #10 upstream keepalive 池对多数高频 location 无效:未清 Connection 头,nginx 默认向上游发 Connection: close(user.conf 多处 location)

- **代码确认**:确认:nginx.conf:77-89 三 upstream 配了 keepalive 池 + 注释要求 location 设 `Connection ""`;但 user.conf 中 /health(:165)、/uploads/(:250)、sitemap(:266)、静态(:285)、@ssr_backend(:329)、=/(:344)等只设 proxy_http_version 未清 Connection → keepalive 对这些 location 失效成立。/api/(:148)与 /(:366)设的是 $connection_upgrade(WS 用),普通请求经 map 变空串 OK。
- **改动点**:nginx/conf.d/user.conf:各非 WS location(/health、/uploads/、sitemap、静态资源、SSR @ssr_backend、= / 、/img-remote 等)
- **做法**:最小可行:给所有「非 WS、走 upstream keepalive」的 location 补 `proxy_set_header Connection "";`(空串,让 nginx 复用 keepalive TCP,不发 Connection: close)。WS 相关 location(用 $connection_upgrade 的)不动。理想:把 `proxy_http_version 1.1; proxy_set_header Host ...; proxy_set_header Connection "";` 三行抽成 include 片段(如 conf.d/upstream-keepalive.inc),各 location include,避免下次新增 location 再漏。
- **备选**:无。
- **风险**:低。注意别给带 Upgrade 的 WS location 加 `Connection ""`(会破 WS 升级)—— 只改非 WS location。改后须 `nginx -t`。收益是减少 backend TCP 新建,QPS 高时才明显。
- **验证**:`nginx -t`;高频打 /uploads/ 或静态资源,`ss -tan | grep :8080` 观察到 nginx→backend 连接数稳定(复用)而非每请求新建;或看 backend accept 速率下降。
- **依赖**:无

##### [🟡 P2 · S(<1h)] #13 umami 容器假 unhealthy(healthcheck 探 /login 必败)+ 内存逼近 512MB(docker-compose.prod.yml:485 / docker-compose.yml:528)

- **代码确认**:确认:prod:485 与 dev:528 healthcheck 均 `wget .../login`;dev:527 注释称 v3 /login 永远 200 —— 与审计实测 FailingStreak=4092 矛盾,存在版本/注释漂移,须实探定夺(见 openQuestions)。
- **改动点**:docker-compose.prod.yml:485(healthcheck);docker-compose.yml:528(healthcheck);两处 umami deploy.resources
- **做法**:最小可行:先核对线上 umami 镜像版本(mysql-latest)真实可用的心跳端点 —— 审计实测 `/api/heartbeat` 返回 {"ok":true},但 dev compose 注释又称「v3 没有 /api/heartbeat,/login 永远 200」。二者矛盾,须先在容器内实探(`docker exec scholar_umami wget -qO- http://localhost:3000/api/heartbeat` 与 /login 的实际状态码)确定真相,再把 healthcheck 改成实际返回 2xx 的端点。若 /api/heartbeat 可用则改探它;若该版本确实 /login 才对则修 dev 注释与 prod 的分歧。内存:观察趋势,必要时 limit 提到 768MB 或加定期重启。
- **备选**:直接删 umami healthcheck —— 否决:失去 readiness 信号,nginx depends_on 起不到作用。
- **风险**:低,但因 dev 注释与线上审计结论打架,不能盲改 —— 必须先实探(这属只读操作,但本任务不重启/不改容器,故留作落地时第一步)。改错端点会让本正常的服务被标 unhealthy 触发 nginx 不路由。
- **验证**:改后 `docker inspect --format '{{.State.Health.Status}}' scholar_umami` 应 healthy 且 FailingStreak 归零;`docker stats scholar_umami` 看内存。
- **依赖**:无(但落地第一步是实探端点真相)

##### [🟡 P2 · S(<1h)] #15 MySQL 慢查询完全不可观测:slow log 显式关闭但 36h 已 10 条 >2s 慢查询,应用账号无 performance_schema 权限(docker-compose.yml:48 / prod:54)

- **代码确认**:确认:dev:48 与 prod:54 command 均 `--slow-query-log=0` + 注释(刻意关,防无 rotation 盘爆)。performance_schema TABLE 方案与该注释意图(避免 host 盘文件)兼容。
- **改动点**:docker/mysql/conf.d/*.cnf 或 docker-compose command;运维手册/部署脚本
- **做法**:最小可行(不改文件行为、零盘增长风险):固化一条 root digest 巡检查询到运维手册 —— `SELECT DIGEST_TEXT, COUNT_STAR, SUM_TIMER_WAIT/1e12 AS total_s, MAX_TIMER_WAIT/1e12 AS max_s FROM performance_schema.events_statements_summary_by_digest ORDER BY SUM_TIMER_WAIT DESC LIMIT 20;`(root 有权,performance_schema 默认开),部署脚本定期快照该表。理想:把 slow log 改 TABLE 模式 `--log_output=TABLE --slow_query_log=1`(写 mysql.slow_log 系统表,自动轮转、无 host 盘文件无限增长问题),long_query_time 维持 2s;可在 docker-compose command 或 conf.d 追加。
- **备选**:开文件 slow log —— 否决:正是当初关它的原因(/var/lib/mysql/slow.log 挂 host、无 rotation、无限增长)。TABLE 模式规避该问题。
- **风险**:TABLE 模式对每条慢查询写系统表有极小开销(仅 >2s 的),可忽略;mysql.slow_log 会缓慢增长需配轮转策略(TRUNCATE 定期)。给应用账号开 performance_schema 权限则扩大账号权限面,不建议 —— 用 root 巡检即可。改 command 需 restart mysql(部署窗口)。
- **验证**:TABLE 模式:`SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;` 能看到慢语句;或 digest 查询能定位到那 10 条慢查询的语句模板。
- **依赖**:理想档若定位到具体慢语句,可能反哺 #11/#14 的索引优化

##### [🟡 P2 · S(<1h)] #12 Redis 偶发命令级 stall(O(1) 命令 20~156ms)打在鉴权/限流热路径(ratelimit.go:276 EVALSHA / jwt_revoke.go:37 MGET)

- **代码确认**:确认:ratelimit.go:242 redisRateCheck 用 `c.Request.Context()`(无独立短超时);:276 key rl:uid:*;jwt_revoke.go:37 revokeTokenKeyPrefix,:110 MGET,:42 已有 200ms revokeReadTimeout + :112 fail-open。限流侧缺等价短超时兜底成立。
- **改动点**:运维:两个 Redis 容器 SLOWLOG 巡检 + CPU 配额;backend/internal/common/utils/jwt_revoke.go(已有 200ms 超时);backend/internal/common/middleware/ratelimit.go(确认超时)
- **做法**:最小可行(观测 + 确认已有兜底):①给 scholar_redis / scholar_redis_persist 建 SLOWLOG 巡检基线(每日 `SLOWLOG GET` 导出、条目数环比告警),确认 stall 是否随时间恶化;②确认两 Redis 容器 CPU 配额不被邻居抢占(compose deploy.resources 看是否有 cpus 限制 / 是否与高负载容器同核)。③代码侧:jwt_revoke.go:91 已有 revokeReadTimeout=200ms + fail-open,确认限流的 redisRateCheck 也有等价超时兜底(当前用 c.Request.Context() 无独立短超时 —— 建议给限流 Redis 调用也加 ≤100ms 超时,尖刺期快速 fail-open/降级到 in-memory,不拖住请求)。理想:合并 revoke MGET 与限流 INCR 到同一 pipeline/Lua 省一次 RTT(与 #4 的 RecordActivity 进程内节流一起做,减少热路径 Redis 往返)。
- **备选**:给 Redis 换更大实例 —— 数据仅 20 keys/2MB,不是容量问题,是 CPU 抢占/尖刺,扩容无用。
- **风险**:给限流 Redis 调用加短超时后,尖刺期会更多走 fail-open(放行)或 in-memory 降级 —— 限流精度略降但保住延迟,取舍合理(限流是过载保护非强一致)。纯观测部分零风险。
- **验证**:SLOWLOG 基线建立后观察尖刺频次;注入 Redis 延迟(如 CPU 打满邻居)验证鉴权/限流请求在 ≤100ms 内 fail-open 而非被拖到 156ms。
- **依赖**:与 #4(RecordActivity/pipeline 合并)可一并做

#### 本簇落地顺序
建议顺序(低风险高收益先行,可分期):第一批(纯改一处、可独立回滚,当天可上):#6+#8 nginx WS 正则补 claw(一词)、#9 nginx 限流键改 $remote_addr、#10 nginx keepalive Connection 头 —— 三者同属 nginx conf,一次 reload 生效,先做且互不干扰。第二批(超时收口,需 backend 重建):sharedRefactor「三层超时对齐」= #2 + #3 一起改一次编译一次,#1 BodyLimit 同属 middleware 同批 build。第三批(DB 索引,需 schema-sync):#11 feature_tools 索引(0071)最高性能收益先做;#14 agent_turn_events ORDER BY 改动同批(纯代码,可并入第二批 backend 重建,DB 无迁移)。第四批(死代码清理,低优先):#4 is_vip、#5 maintenance,择机跟随任一 backend 重建。第五批(可观测性 + 资源,需实探/部署窗口):先 #13 umami 实探定端点、#15 MySQL performance_schema 巡检、#12 Redis SLOWLOG 基线(三者是运维观测,建议同一次运维动作),最后 #7 agent 内存扩容(prod compose,需宿主余量确认)+ 远期准入闸。理由:观测(#12#15)先落地能反哺 #7 的并发阈值定档与 #11#14 的索引验证。

#### 待人拍板
1. #9 部署拓扑:生产 nginx 前面是否有可信 CDN/LB?若有,限流键不能简单改 $remote_addr(会归并到代理 IP),须走 realip 模块方案。当前 docker-compose 是 5411:80 直连(直接改 $remote_addr 安全),但需确认线上真实拓扑。2. #11 投影 DTO:工具列表卡片(frontend-user 工具列表组件)实际消费哪些字段?决定能否安全排除 description_md/faq/use_cases/pricing/spec/reviews 等重列 —— 排错会白屏。最小档(只加索引不投影)无此风险,可先上。3. #7 agent 扩内存:生产宿主总内存余量多少?决定能否从 1.5G 提到 3-4G;并发准入闸的阈值(per-user / 全局)需按目标并发拍板。4. #13 umami:线上 umami 镜像(mysql-latest)真实可用的心跳端点是 /api/heartbeat 还是 /login?dev 注释与审计实测矛盾,落地第一步须容器内实探定夺。5. #14 journal read 是否已启用(AGENT_JOURNAL_READ)?未启用则该项纯预防性,可降到最低优先。6. #2 WriteTimeout 取 16min(留 backstop)还是 0(纯靠 ctx+nginx)?倾向 16min,请拍板。7. #4 is_vip:是「删假象」还是「真做 VIP 限流放大」?取决于产品是否要给付费用户更高限额。


---

### 簇:微信小程序端性能 `miniprogram`

**整体判断**:本簇 4 条发现是小程序端(miniprogram/)的渲染/网络性能问题,核心矛盾是同一类反模式的两种变体:「流式过程中每帧对累计全文重处理 + 整包过 setData 桥」(#1 claw、#4 翻译)与「无界数据/资源累积」(#2 历史无分页、#3 mermaid PNG 无清理)。全部已亲读代码确认问题仍在、定位精确。总体策略:①#1 把 diff 粒度从 turn 级下沉到 seg 级(bridge O(N)→O(增量),复用已有的 sameVM 深比较逻辑),这是本簇最高价值改动;②#2 对齐 Web 已在用的 ?limit 分页(后端与响应类型都已就绪,几乎零风险);③#3 用「启动即清空 mmd-*.png」根治无界累积(比 LRU 更简单,且当前文件对跨启动复用毫无价值——diagram-cache 是内存态、重启即清);④#4 加一个与 AgentSocket.FLUSH_MS 同款的合帧节流。#1/#2/#3 都落在 pages/claw/claw.ts,建议一并改;#4 独立在 translate.ts。全部可分期、可回滚、低风险优先。

#### 统一改法(一次解决多个发现)

**◆ 合帧节流小工具 lib/stream-throttle.ts(可选)**
- 一次解决:#4(直接采用);#1 的 socket 侧与未来任何 SSE 消费方可复用
- 设计:抽一个极小的 makeFlusher(fn, ms) → { schedule(), flushNow(), cancel() }:内部 setTimeout 合帧,schedule 只在无 pending timer 时起表,flushNow 立即触发并清表,cancel 清理防泄漏。这正是 AgentSocket 里 scheduleFlush/flushNow/clearFlush(agent-socket.ts:255-263)的通用化。#4 立刻用它把 translate 的 onProgress 从 ~30/s 降到 ~7/s;AgentSocket 后续可选择改用(非必需)。注意:这是小工具,不是大重构,别为它阻塞主改动——#4 也完全可以内联 10 行 setTimeout 节流,不引入新文件。

**◆ seg/block 比较函数外提(claw.ts 内部)**
- 一次解决:#1(是其实现前提)
- 设计:当前 sameVM(claw.ts:116-157)把「块相等」「seg 相等」判断内联成一个返回 bool 的大函数。#1 的 seg 级 patch 需要「定位到第几个 seg 变了」,故把里面的 per-block 比较提成 blockEq(a,b)、per-seg 比较提成 segEq(a,b) 两个纯函数,sameVM 改为调用它们(行为不变),diffTurnInto 复用同一对函数产出路径。纯内部重构,不改对外行为。

#### 逐条实施方案

##### [🟠 P1 · M(半天)] #1 claw 流式渲染 O(N²):每次 flush 整轮重 parse + 整轮 VM 整包过 setData 桥(miniprogram/pages/claw/claw.ts:531 rebuild)

- **代码确认**:确认仍在。rebuild(claw.ts:531-559)在 socket 每次 flush(agent-socket.ts:30 FLUSH_MS=120,~8/s)被调用。流式 live 轮的 turnSig 含 't'+b.text.length(claw.ts:110),文本每帧增长→sig 必失配→decorateOne 走到 decorateTurns→mdToSegments(b.text)(agent-chat.ts:422)对该块**累计全文**从头重扫。产出新 VM 后,rebuild 的 diff 只到 turn 级:vms[i]!==old[i]→patch['turns['+i+']']=vms[i](claw.ts:545),把整条 live 轮(其全部段落 segs 的 HTML)每帧重发过桥。单条长回复累计到 N 字→每帧 O(N)→全程 O(N²)。注:流式期公式/图表 base64 尚未进 live 轮(renderMathForTurns/renderDiagramsForTurns 只扫 complete 轮,claw.ts:632/564),故主成本是「已成形段落 HTML 每帧重发」而非 base64。
- **改动点**:pages/claw/claw.ts:rebuild()(改 turn 级 patch 为 seg 级);新增 diffTurnInto();sameVM 拆出 blockEq/segEq(见 sharedRefactor);理想档另动 lib/markdown.ts:mdToSegments + lib/agent-chat.ts:decorateTurns
- **做法**:最小可行改动(M,推荐先做):在 rebuild 的 else 分支里,把 `patch['turns['+i+']']=vms[i]` 换成 `this.diffTurnInto(patch, 'turns['+i+']', old[i], vms[i])`。diffTurnInto 逻辑:①先做结构护栏——若 old 缺失、blocks.length 不等、或轮级标量字段(complete/error/thinking/thinkText/thinkOpen/placeholder/blockedOutput/turnArtifacts.length)有变→`patch[base]=n` 整轮 set 后返回(换会话/折叠/完成态切换等一次性事件走这条,安全);②否则逐 block:blockEq 相等则跳过;若两侧都是 text 且 n.segs.length>=o.segs.length→从头找第一个 !segEq 的下标 k,对 k..末尾逐个 `patch[base+'.blocks['+j+'].segs['+x+']']=n.segs[x]`(markdown 追加式增长,分歧点通常是「最后一个成形段 + 新尾段」,每帧只 1~2 个 seg 过桥);③其余情况(seg 变短、tool/toolgroup 变)→ `patch[base+'.blocks['+j+']']=n.blocks[j]`。关键前提:一条流式回复的所有段落 segs 都挂在**同一个** text block 上,故必须下沉到 seg 级、block 级粒度不够。理想档(L,可后续):给 mdToSegments 加「按最后一个空行(段落边界)切分,前缀 segs 引用复用、只重 parse 尾段」的 per-block 解析记忆(mdToSegments 本就逐行扫描,易改造),让 decorateOne 产出的 segs 前缀引用相等→diffTurnInto 天然只 patch 尾段,同时把 CPU 从 O(N²) 降到 O(增量)。先上最小档(已解决主成本 bridge),CPU 对 <5KB 回复亚毫秒,可接受。
- **代码骨架**:
```
// rebuild() else 分支:
for (let i=0;i<vms.length;i++) if (vms[i]!==old[i]) this.diffTurnInto(patch, 'turns['+i+']', old[i], vms[i])

diffTurnInto(patch, base, o, n) {
  if (!o || o.blocks.length!==n.blocks.length || o.complete!==n.complete || o.error!==n.error ||
      o.thinking!==n.thinking || o.thinkText!==n.thinkText || o.thinkOpen!==n.thinkOpen ||
      o.placeholder!==n.placeholder || o.blockedOutput!==n.blockedOutput ||
      (o.turnArtifacts?.length||0)!==(n.turnArtifacts?.length||0)) { patch[base]=n; return }
  for (let j=0;j<n.blocks.length;j++){
    const ob=o.blocks[j], nb=n.blocks[j]
    if (blockEq(ob,nb)) continue
    if (ob.kind==='text' && nb.kind==='text' && nb.segs && ob.segs && nb.segs.length>=ob.segs.length){
      let k=0; for(;k<ob.segs.length;k++) if(!segEq(ob.segs[k],nb.segs[k])) break
      for(let x=k;x<nb.segs.length;x++) patch[base+'.blocks['+j+'].segs['+x+']']=nb.segs[x]
    } else patch[base+'.blocks['+j+']']=nb
  }
}
```
- **备选**:备选A:只对 mdToSegments 做记忆化不改 bridge——省 CPU 但 bridge 仍每帧整轮,主成本没解,不选。备选B:socket 拉大 FLUSH_MS(降帧率)——牺牲流式顺滑度换省桥,治标且伤体感,不选。备选C:把公式 PNG 也落临时文件(审计选项③)——只影响 complete 轮的 base64,而 seg 级 diff 后 complete 轮不再每帧重发、base64 仅在成轮那一刻过桥一次,收益边际,列为可选不做。
- **风险**:主要风险=微信 setData 对「超出当前长度的数组下标路径」是否支持扩展写(segs 追加新段时 `segs[k]` k=旧长度)。微信官方支持 this.setData 用 'arr[2]' 形式写(含扩展),但需真机验证。若不支持,退化为 seg 变长时走整 block set(仍比整轮省)。铁律照顾:不碰 effect 依赖(小程序无 hooks);不改后端;WXML 结构(turns[i].blocks[j].segs[k])已就绪无需改模板。折叠/换会话/历史回放都走整轮 set 分支,行为不变。
- **验证**:微信开发者工具 + 真机:发一条产出 2-3 屏、含标题/列表/表格的长回复,肉眼看流式全程是否还随长度渐进掉帧;可临时在 diffTurnInto 里 console 出 patch 的 key 数与近似字节量,确认每帧从「整轮」降为「1~2 个 seg」。回归:换会话、点折叠、历史滚动、完成后公式/mermaid 回填均正常;停止/额度弹窗路径不受影响。
- **依赖**:无。但与 #3 同文件,建议同一 PR 一起改减少 churn

##### [🟠 P1 · S(<1h)] #2 claw 历史无分页无窗口化:小程序整包拉全量 transcript 一次 setData(miniprogram/services/claw.ts:28 getClawHistory)

- **代码确认**:确认仍在。getClawHistory(services/claw.ts:28-33)只发 ?session_id=,不带 limit。后端 ParseLimitTurns(backend/internal/agentbridge/http_handler.go:41-56)明确支持「最近 N 轮」且缺省返回全部、上限 500。响应类型 HistoryResponse 已声明 hasMore/totalTurns(services/claw.ts:20-25)但当前无人消费。Web 端 useClawHistory(frontend-user/src/features/claw/api/session.ts:79-90)已在用 limitTurns 并注明动机(避免上万轮一次性 JSON.parse+折叠+渲染)。小程序 openSession(claw.ts:493)直接 replayHistoryAsTurns(全量)→rebuild 一次 setData 全部轮。
- **改动点**:services/claw.ts:getClawHistory(加 limitTurns 参数);pages/claw/claw.ts:openSession(传 limit + 存 hasMore)、新增 loadEarlierHistory();claw.wxml(列表顶部加「加载更早」条,hasMore 时显示)
- **做法**:最小可行改动:①getClawHistory(sessionId, limitTurns?) 在 limitTurns>0 时拼 `&limit=`;②openSession 改调 getClawHistory(sid, 30),把 hist.hasMore 存进 data(控制「加载更早」显示)。首屏 setData 天然有界到 30 轮。③新增 loadEarlierHistory():当前 limit 翻倍(30→60→120…)或 +30,重拉→replayHistoryAsTurns 替换 S.historyTurns→rebuild(true)(不跳底,保住阅读位)。因 replayHistoryAsTurns 每次从返回窗口整体重放,「加载更早」只是换更大 limit 重取即可,无需增量拼接。加载更早时清 S.vmCache + S.openFolds(见风险),让新窗口干净重 decorate 一次(一次性开销)。理想档(可后续,仅当会话普遍超长再做):wxml 侧加 feed 页同款 winLo/winHi 的 turn 级 wx:if 渲染窗口。
- **代码骨架**:
```
// services/claw.ts
export function getClawHistory(sessionId, limitTurns) {
  const q = '?session_id='+encodeURIComponent(sessionId) + (limitTurns&&limitTurns>0 ? '&limit='+limitTurns : '')
  return request({ url: '/user/claw/session/messages'+q, method:'GET' })
}
// claw.ts openSession
S.histLimit = 30
const hist = await getClawHistory(sid, S.histLimit)
this.setData({ hasMoreHistory: !!hist.hasMore })
// loadEarlierHistory
S.histLimit *= 2
const hist = await getClawHistory(S.sessionId, S.histLimit)
S.vmCache = new Map(); S.openFolds = {}
S.historyTurns = replayHistoryAsTurns(hist.messages)
this.setData({ hasMoreHistory: !!hist.hasMore })
this.rebuild(true)
```
- **备选**:备选:真增量前插(只拉更早那一段拼到 historyTurns 头部)——省重放但要处理 turn id 重编号与 tool_use_id 跨窗口配对,复杂度不值;直接重拉大窗口最简且对齐 Web keepPreviousData 思路。
- **风险**:replayHistoryAsTurns 的 turn id 是从返回窗口第一条用户轮起从 1 编号(agent-chat.ts:273 'h-'+count)。换更大 limit 会在最前面补入更早的轮→所有 id 平移,openFolds/vmCache 键失配。故加载更早时**主动清** S.vmCache 与 S.openFolds(接受折叠记忆重置——这是用户主动操作、整体重渲本就预期),一次性全量 re-decorate。别忘 rebuild(true) 防跳底。后端 limit 上限 500,超长会话仍有界。
- **验证**:把 limit 临时设 3 便于测:开一个 >3 轮的会话→只渲染最近 3 轮 + 顶部出现「加载更早」→点击拉更多。Network 面板确认请求带 ?limit=。回归:短会话(轮数<limit)hasMore=false 不显示按钮、行为同旧。
- **依赖**:无

##### [🟠 P1 · S(<1h)] #3 mermaid PNG 落 USER_DATA_PATH 永不清理 + writeFile 失败与语法错误未区分(miniprogram/pages/claw/claw.ts:597 saveDiagramFile)

- **代码确认**:确认仍在。saveDiagramFile(claw.ts:594-607)把每张 mermaid PNG 写到 USER_DATA_PATH/mmd-<hash>-<len>.png(持久目录,微信不自动回收)。全仓 grep 确认无任何 unlink/readdir/清理(唯一 USER_DATA_PATH 引用就是这处写入 + 1221 的 readFile 读产物,不相关)。内容寻址只做去重不做淘汰→无界累积,顶到 200MB 后 writeFile 静默失败。且 pumpDiagramQueue(claw.ts:583-591)的 `.catch(()=>setDiagram(code,null))` 把 renderMermaid 失败(语法/服务)与 saveDiagramFile 失败(磁盘满)混为一谈,后者也被判 null。补充:diagram-cache 是模块级内存 Map(diagram-cache.ts:10),重启即清,且读取只查内存缓存、从不校验文件是否存在→**这些持久文件对跨启动复用毫无价值**,纯粹是泄漏。
- **改动点**:pages/claw/claw.ts:init()(加一次性清空);saveDiagramFile / pumpDiagramQueue(区分磁盘失败)
- **做法**:最小可行改动(根治,推荐):既然持久文件对跨启动复用零价值,在 init() 里做一次性「启动即清空」——readdir(USER_DATA_PATH)→过滤 mmd-*.png→逐个 unlink(fire-and-forget,失败忽略)。把累积寿命从「永久」压到「单次运行」,零 LRU 逻辑、零阈值维护。用一个模块级 S.diagSwept 守卫保证一 app 生命周期只跑一次。附带修 writeFile 失败判定:把 saveDiagramFile 的失败与 renderMermaid 的失败拆开——renderMermaid reject→setDiagram(code,null)(语法/服务问题,回退源码卡,合理);saveDiagramFile reject→不要沿用 render 失败语义,而是就地 kick 一次清空(腾空间)并回退源码卡(内存 null 本次运行有效、重启即清,不是真永久)。理想档(不推荐、低 ROI):真正的按大小 LRU + 读取前校验文件存在以实现跨启动复用——但那要多改一条 file-exists 分支,收益极小。
- **代码骨架**:
```
// init() 开头
if (!S.diagSwept) { S.diagSwept = true; sweepDiagramFiles() }

function sweepDiagramFiles() {
  const fs = wx.getFileSystemManager()
  fs.readdir({ dirPath: wx.env.USER_DATA_PATH, success: (r) => {
    for (const name of r.files) if (name.indexOf('mmd-')===0 && name.slice(-4)==='.png')
      fs.unlink({ filePath: wx.env.USER_DATA_PATH + '/' + name, fail(){} })
  }, fail(){} })
}

// pumpDiagramQueue 里拆失败语义
renderMermaid(code)
  .then(res => this.saveDiagramFile(code, res.png)
     .then(path => setDiagram(code, { path, width:res.width, height:res.height }))
     .catch(() => { sweepDiagramFiles(); setDiagram(code, null) })) // 磁盘失败:腾空间+本次回退
  .catch(() => setDiagram(code, null)) // 渲染失败:语法/服务,回退源码卡
  .then(() => { S.diagInFlight.delete(code); S.diagRunning=false; this.scheduleMathRebuild(); this.pumpDiagramQueue() })
```
- **备选**:备选=保留跨启动文件 + 按 size LRU(启动 readdir+stat 求和,超阈值按 lastModifiedTime 删旧)。因当前读取链路根本不查文件、内存缓存重启即清,跨启动文件无人使用,LRU 是为一个不存在的复用场景做维护,不选。启动清空更简单且等价有效。
- **风险**:极低。readdir/unlink 全异步 best-effort,失败静默,不阻塞渲染。不误删:mmd- 前缀 + .png 后缀双重过滤,产物下载走的是 wx.downloadFile 的 tempFilePath(不在 USER_DATA_PATH 根),不受影响。不改后端/DB。
- **验证**:临时在 sweep 里 log 删除计数:渲染几张 mermaid→杀进程重启→init 时应打印上次遗留文件被清。磁盘满分支难自然触发,可临时把 saveDiagramFile 改成 reject 验证走「回退源码卡而非无限 loading」。
- **依赖**:无。与 #1 同文件(claw.ts),同 PR 一起改

##### [🟡 P2 · S(<1h)] #4 论文详情 AI 翻译流式预览零节流:每个 token 对累计全文跑正则 + 整串 setData(miniprogram/services/api/translate.ts:146)

- **代码确认**:确认仍在。translatePaper 的 handleFrame(translate.ts:122-151)每收到一个 delta 就 `content+=delta; onProgress(stripTags(content))`(145-146)。stripTags(translate.ts:51-53)对**累计全文**跑两个全局正则。消费侧 paper.ts:94-95 回调直接 `this.setData({ translatePreview: preview })` 把完整累计串过桥。LLM token 流 ~20-40/s,全程无节流→低配机翻译期间明显卡顿。
- **改动点**:services/api/translate.ts:translatePaper 内 handleFrame 的 onProgress 派发处 + finish/fail 清理;(可选)lib/stream-throttle.ts
- **做法**:最小可行改动:加一个 ~140ms 合帧节流(与 agent-socket FLUSH_MS 同款)。仍逐 token `content+=delta`,但把 onProgress(stripTags(content)) 从「每 token」改为「合帧一次」——用 dirty 标记 + 单 setTimeout,窗口到点才 stripTags + 派发。stripTags 顺带只在真正派发时执行(从 ~30/s 降到 ~7/s)。在 finish() 与 fail() 里 clearTimeout 防定时器泄漏。预览在 translated 落定后即被 showTranslated 取代,故无需强制补尾帧(补也无害)。约 10 行。可选:采用 sharedRefactor 的 makeFlusher 复用,但内联同样简洁,不强制。
- **代码骨架**:
```
let previewTimer = null, dirty = false
const PREVIEW_MS = 140
const emitPreview = () => { previewTimer=null; if(!dirty) return; dirty=false; onProgress(stripTags(content)) }
const schedulePreview = () => { dirty=true; if(previewTimer===null) previewTimer=setTimeout(emitPreview, PREVIEW_MS) }
const clearPreview = () => { if(previewTimer!==null){ clearTimeout(previewTimer); previewTimer=null } }
// handleFrame: content += delta; schedulePreview()
// finish()/fail() 开头: clearPreview()
```
- **备选**:备选:节流放在 paper.ts 回调侧(setData 节流)——但 stripTags(全文正则)仍每 token 跑,CPU 没省;放在 translate.ts 派发处能同时省正则与过桥,更优。
- **风险**:极低。唯一注意点=请求 error/中断时定时器泄漏,已在 finish/fail 清理覆盖。预览节流不影响最终 parseResult(用完整 content 解析,与预览无关)。
- **验证**:开发者工具开 CPU throttle 或真机低配:翻译一篇论文,观察「翻译中…」预览更新变为 ~7/s 平滑刷新、不再逐字抖动;最终译文正确、预览不卡空。
- **依赖**:无。独立于 claw 三项

#### 本簇落地顺序
建议两批落地。第一批(低风险 S,可同一 PR):#2 历史分页(services/claw.ts + claw.ts,后端已就绪)、#3 mermaid PNG 启动清空(claw.ts)、#4 翻译节流(translate.ts)——三者互不依赖、改动小、无需真机验证 setData 边界。第二批:#1 seg 级 diff(claw.ts + sameVM 拆分),因依赖微信 setData 数组路径扩展语义,需真机验证,单独一个 PR 便于回滚。#1/#2/#3 都在 pages/claw/claw.ts,若一并改需注意 rebuild()(#1)与 openSession()/init()(#2/#3)是不同函数,冲突面小。理由:先用零风险改动拿下 3 条并验证工具链(tsc + 微信构建),再攻需设备验证的 #1。

#### 待人拍板
1) #1 依赖「微信 setData 用超出当前长度的数组下标路径(segs[k], k=旧长度)扩展写入」是否在目标机型稳定支持——需真机实测拍板;若不支持,退化为 seg 变长时走整 block set(仍优于整轮),需确认可接受。2) #2「加载更早」的 limit 步进策略(翻倍 vs 固定 +30)与是否接受加载更早时重置折叠记忆(openFolds 清空)——建议接受,但若产品在意折叠态保留需另设计稳定 turn id。3) #3 是否彻底放弃 mermaid PNG 跨启动复用(选启动清空)而非做 LRU——本方案判定当前复用价值为零故选清空,若未来要做「文件存在即免渲」的跨启动复用则需回到 LRU 档,请确认方向。
