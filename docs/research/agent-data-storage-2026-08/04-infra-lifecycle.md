# 04 · 存储基础设施与生命周期(横切）

> 调查日期:2026-08-07。方法:仓库只读通读 + 生产主机 154.201.87.103 只读取证
> (`du` / `ls` / `docker logs` / `docker exec ... mysql -e "SELECT"`,**未做任何写入或重启**)。
> 生产部署根目录 = `/home/scholar`(与仓库同构,`docker-compose.prod.yml`)。
> 每条结论后面带 `file:line` 或实测输出;**推断而未验证的一律显式标注**。

---

## 〇、一句话结论(给赶时间的人)

1. **备份不存在。** `scripts/backup-all.sh` / `backup-cron.sh` / `install-backup-cron.sh` 三件套写得很完整,
   但生产上**从来没装过**:`crontab -l` 里只有 `security_monitor.sh` 一行,`/home/scholar/backups/` 目录**不存在**。
   MySQL、MinIO、会话工作区目前**零备份、零异地**。这是本次调查唯一的 blocker。
2. **删数据的机制基本都在,且实测在跑**(11 个 backend 日任务 + executor 的 30 天 workdir GC + MinIO tmp/ ILM)。
3. **不删数据的地方是明确的产品决策**(journal 永久保留),但它现在是磁盘增长的**头号来源**且**在加速**:
   `agent_turn_events` 8 月前 7 天已写入 272,970 行 / 120.6MB,是 7 月全月速率的 4.6 倍。
4. **删用户时,所有 agent 相关数据一件都不删**(会话映射 / journal / 产物行 / MinIO 对象 / 会话工作区),
   `DeleteUser` 的注释自己承认了这一点(repository.go:486-488)。
5. 🔴 **主协调者手上的一条事实需要更正**:「生产实测 agent_artifacts 1035 行 / 226 会话,97.7% 属 stat_lab」
   —— **生产库不是这个数**。生产实测是 **580 行 / 162 会话,claw 550 / sci_draw 28 / boltslides 2,stat_lab 为 0 行**;
   生产 `.env` 的 `AGENT_EXECUTOR_FEATURES` 里**根本没有 `stat_lab`**。那个 1035/97.7% 的数据来自本地 dev 库。

---

## 一、总表:数据种类 → 物理位置 → 上限 → TTL/GC → 备份

宿主根 = `/home/scholar`。生产磁盘:`/dev/vda1 49G,已用 34G,可用 16G(69%)`(实测 `df -h`)。
`./data` 合计 **9.4G**(实测 `du -sh data`)。

| # | 数据种类 | 容器 / 卷 / 宿主路径 | 实测占用 | 大小上限 | TTL / GC | 备份 |
|---|---|---|---|---|---|---|
| 1 | **MySQL 全库**(含 journal / 映射 / 产物元数据) | `scholar_mysql` ← `./data/mysql:/var/lib/mysql`(compose:42) | **4.9G**(其中 scholar 库 1.5G、umami 153M) | 无 | 见 §2 逐表 | ❌ 无 |
| 1b | ├ MySQL **binlog** | `./data/mysql/binlog.0*`,15 个文件 | **2.6G** | 无(按时间轮转) | `binlog_expire_logs_seconds=2592000`(30 天,实测 `SHOW VARIABLES`) | ❌ 无(且**没有全量备份可配,PITR 无意义**) |
| 1c | ├ innodb redo | `./data/mysql/#innodb_redo` | 513M | MySQL 自管 | 循环覆写 | — |
| 1d | └ **弃用的旧 datadir** | `./data/_data`(内含 `binlog.000001…`、`mysql.ibd`、`#innodb_redo` 101M) | **209M** | — | ❌ 无人清 | — |
| 2 | **会话工作区**(cwd + uploads/ + references/ + analysis/ + out/) | `scholar_agent` ← `./data/agent-sessions:/home/bun/sessions`(compose:453 / prod:400) | **2.4G**,883 个目录 | 单文件 64MB / 会话 1GB / 会话 2000 文件 —— **仅对 backend 推送路径生效**,见 §4 | ✅ **30 天** `EXECUTOR_WORKDIR_TTL_DAYS`(sessions.ts:455),6h 扫一次(:456) | ❌ 无 |
| 3 | **legacy fork jsonl** | `./data/agent:/fork-data:ro`(compose:326) | **244M**(`agent/projects` 240M) | 无 | ❌ 无 GC(只读挂载,历史归档源) | ❌ 无 |
| 4 | **MinIO 全部桶** | `scholar_minio` ← `./data/minio:/data`(compose:81) | **1.8G** | 无 | 见下 7 桶 | ❌ 无 |
| 4a | ├ `scholar-paper-pdfs` | | 1.1G / 315 对象 | 无 | `tmp/` 前缀 24h ILM(storage.go:106)+ **每日 05:00 孤儿 reaper**(library_cleanup.go:42) | ❌ |
| 4b | ├ `scholar-feature-tools` | | 537M | 无 | ❌ 无(永久资源,storage.go:141 注释明说) | ❌ |
| 4c | ├ `scholar-agent-artifacts` | | **75M / 580 对象** | 单产物 ≤20MB(agent RAW_CAP,workspace.ts:11);backend 回取上限 12MB(claw/artifact.go:48) | ⚠️ **只在会话 reset/delete 时删**(claw/artifact_harvest.go:179 等 4 份镜像);**桶不挂 lifecycle**(storage.go:147-151 只 ensureBucket) | ❌ |
| 4d | ├ `scholar-prism` | | 40M / 289 对象 | 无 | ✅ 编译产物 GC:保留 48h + 每项目最新一条永久(prism/service.go:521, 553) | ❌ |
| 4e | ├ `scholar-peer-review-assets` | | 3.9M / 7 对象(**全部在 `tmp/` 下**) | 无 | `tmp/` 24h ILM(storage.go:135) | ❌ |
| 4f | ├ `scholar-feedback-attachments` | | 456K(也全在 `tmp/`) | 无 | `tmp/` 24h ILM(storage.go:117) | ❌ |
| 4g | └ `scholar-skill-bundles` | | 4.0K(空) | 无 | ❌ 无(storage.go:152 注释:永久资源) | ❌ |
| 5 | **Redis 主池** | `scholar_redis` ← `./data/redis:/data` | 54M(AOF 49M + rdb 5.3M) | `maxmemory 512mb` + `allkeys-lru`(compose:120-121) | LRU 逐出 | ❌ |
| 6 | **Redis correctness 池** | `scholar_redis_persist` ← `./data/redis-persist:/data` | 12M | `maxmemory 128mb` + `noeviction`(compose:161-162) | 不逐出,写满即 OOM 报错 | ❌ |
| 7 | **Prism 编译共享卷** | `./data/prism-work`(backend + `scholar_prism_tex` 双挂) | **4.0K(空)** | 无 | ✅ 每次编译完 `os.RemoveAll(jobDir)`(prism/texclient.go:89) | — |
| 8 | **前端灰度分包** | `./data/frontend-assets`(**仅 prod 挂**,prod:511;dev 刻意不挂,compose:548-556) | 40M | 无 | ❌ 无 GC(按构建频率线性堆积) | — |
| 9 | **容器 stdout 日志** | `/var/lib/docker/containers/<id>/*-json.log` | scholar_nginx 42M / backend 26M / agent 4.2M | ✅ `max-size 10m × max-file 7` = 每容器 ≤70M(compose:3-7,prod:18-21) | 自动轮转 | — |
| 10 | **docker 镜像 / 构建缓存** | `/var/lib/docker` | 镜像 13.16G(**10.16G 可回收**)、build cache 2.37G、悬空 volume 647M | 无 | ❌ 无自动 prune | — |

> 说明:表里 3、8、10 三行不是 agent 数据,但它们和 agent 数据抢同一块 49G 盘,故一并列出。

---

## 二、MySQL 侧:哪些表在长、谁在管

生产 top 表(实测 `information_schema.tables`,单位 MB):

```
agent_turn_events      526,848 行   data 347.0  idx 59.2  total 406.2   ← 第一
feature_tools           32,836 行              total 278.0
usage_logs              59,988 行              total  94.8   ← stranded,无代码读写也无清理
hot_papers              60,433 行              total  72.4
prism_struct_versions    3,913 行              total  53.9
seo_papers              22,703 行              total  52.0
prism_file_versions      2,349 行              total  51.9
agent_session_archive      111 行              total  31.5
llm_token_usage         16,350 行              total  11.5
agent_turns              2,065 行              total   6.6
usage_events             9,465 行              total   6.1
agent_billing_ledger     2,280 行              total   0.6
```

### 2.1 `agent_turn_events` —— 明确的「永久保留」+ 分区维护

- 建表:`PARTITION BY RANGE(to_days(created_at))`,月分区 `p_init / p2607 … p2711 / p_future`(实测 `SHOW CREATE TABLE`)。
- 维护任务只**延展**未来分区、**永不 DROP**:`cleanup.go:229-235`,调 `ensure_month_range_partitions('agent_turn_events', 15)`,
  启动跑一次 + 每天 05:40(cleanup.go:216-221)。函数头注释写死:「会话历史【永久保留、绝不删除】(产品要求)」(cleanup.go:226-228)。
- **增长实测**(生产 `GROUP BY DATE_FORMAT(created_at,'%Y-%m')`):

  | 月 | 行数 | 分区占用 |
  |---|---|---|
  | 2026-06(6/30 起) | 3,203 | (p_init 3.5MB) |
  | 2026-07 | 262,057 | p2607 = 222.6MB |
  | 2026-08(前 7 天) | **272,970** | p2608 = 120.6MB |

  → 7 月约 8.5k 行/天;8 月约 **39k 行/天**,速率翻了 **4.6 倍**,且 8 月才过了 7 天就已超过 7 月全月行数。
  按 8 月的 17MB/天线性外推 ≈ **6.3GB/年**(未验证:增长是否会继续加速;单行体积在 0.41–0.95 MB/千行之间波动,取值敏感)。

### 2.2 有 GC 的表

| 表 | 保留期 | 实现 |
|---|---|---|
| `usage_events` | 365 天 | cleanup.go:305-315,每日 04:15 |
| `llm_token_usage` | 365 天 | cleanup.go:320-330,每日 04:20 |
| `hot_papers` / `hot_search_keywords` | hotcontent 自带 retention + maxRecords | cleanup.go:490-508,每日 04:30(实测今天删了 719 篇) |
| `credit_temp_lots`(过期批次归零) | 按批次到期 | cleanup.go:333-345,每日 04:25 |
| 超时 pending 订单 | 24h | cleanup.go:348-360,每日 04:45 |
| `library_share_papers` / `library_share_access` | 撤销/过期后 30 天 | library_cleanup.go:153-193,每日 05:15 |
| 额度窗口副本 | 400 天 | cleanup.go:424-436,每日 05:25 |
| `prism_compiles` + 其 MinIO pdf/log | 48h(每项目最新一条永久) | prism/service.go:518-590,启动一次 + 每 24h |

### 2.3 **没有** GC 的表(增长无界)

- `agent_turn_events` / `agent_turns` / `agent_session_archive` —— **有意为之**(见 2.1)。
- `agent_artifacts` —— 只在会话 reset/delete 时删行(§3.2)。
- `prism_file_versions`(51.9MB / 2,349 行)与 `prism_struct_versions`(53.9MB / 3,913 行)——
  两条**追加式不可变版本链**,`struct_model.go:160` 注释明说「镜像 prism_file_versions 不可变审计纪律」。
  全仓 grep `prism_file_versions|prism_struct_versions` 只命中 model/repository/注释,**零 DELETE、零 retention 常量**。
  当前 323 个 prism 项目就吃掉 105MB,单项目均摊 ~330KB;按项目数线性增长,**无上界**。
- `usage_logs`(94.8MB)—— stranded 表,cleanup.go:510-512 明确写了「作为 stranded 历史数据保留(无代码读写,故也不再需要定期清理)」。94.8MB 死重。
- `feature_tools`(278MB)—— 功能广场数据,非 agent 范畴,未查其清理逻辑。**未查实**。

---

## 三、cleanup.go 全部定时任务清单

`CleanupService.Start()`(cleanup.go:123-224)+ `startLibraryCleanupTasks()`(library_cleanup.go:39-48)。
**所有条件挂载的任务在生产都实际启用了** —— 实测 `docker logs scholar_backend --since 30h | grep "Next cleanup"`,
11 个 task 名全部出现(见 §3.3)。

| # | task 名 | 频率 | 删什么 | 代码 |
|---|---|---|---|---|
| 1 | `hot_content` | 每日 04:30 | 过期热门关键词 + 热门论文 | cleanup.go:126-128, 490 |
| 2 | `old_usage_events` | 每日 04:15 | `usage_events` > 365 天(1000/批 + 100ms 间隔) | cleanup.go:129-131, 305 |
| 3 | `old_llm_token_usage` | 每日 04:20 | `llm_token_usage` > 365 天 | cleanup.go:132-134, 320 |
| 4 | `expired_credits` | 每日 04:25 | 过期临时经费批次归零 + 写 expire 流水(**不删行**) | cleanup.go:138-142, 333 |
| 5 | `stale_pending_orders` | 每日 04:45 | pending > 24h 的订单置作废(**不删行**) | cleanup.go:146-150, 348 |
| 6 | `pending_quota_refill` | **每 2 分钟** | 不删数据;补偿 Redis 抖动导致未兑现的「升级满血」删锚 | cleanup.go:154-158, 363 |
| 7 | `expired_membership_window` | **每 5 分钟**(回看 30min) | 作废会员到期后仍留的高档额度窗口锚 | cleanup.go:164-168, 378 |
| 8 | `quota_window_drift` | **每 15 分钟**(抽样 200) | **只读只告警**,DB→Redis 方向对账 | cleanup.go:181-185, 393 |
| 9 | `quota_window_orphans` | **每 15 分钟**(抽样 200) | **只读只告警**,Redis→DB 反向对账 | cleanup.go:188-192, 411 |
| 10 | `quota_windows` | 每日 05:25 | 额度窗口副本行 > 400 天 | cleanup.go:194-198, 424 |
| 11 | `agent_session_owner_reconcile` | 启动一次 + 每日 04:35 | **纯加法**:给 prism/peerreview 补写缺失的 `agent_sessions` 归属行 | cleanup.go:201-208, 240 |
| 12 | `orphan_pdf_objects` | 每日 05:00 | MinIO `papers/` 前缀里 DB 已无引用、且 LastModified > 48h 的对象;单轮最多扫 5 万、包 10min ctx;**DB 反查失败该批绝不删** | library_cleanup.go:41-43, 57-144 |
| 13 | `stale_shares` | 每日 05:15 | 撤销/过期 > 30 天分享的两张子表(主行保留) | library_cleanup.go:45-47, 153 |
| 14 | `agent_event_partitions` | 启动一次 + 每日 05:40 | **零删除**,只向后延展 15 个月分区 | cleanup.go:216-221, 229 |

**关键观察:14 个任务里,没有任何一个碰 agent 侧的四张核心表**(`agent_sessions` / `agent_turns` /
`agent_turn_events` / `agent_artifacts`)。#11 只加不减,#14 只建分区。

### 3.3 生产实测(2026-08-07 04:00–05:40 那一轮全部执行)

```
04:15 old_usage_events        → next 2026-08-08 04:15
04:20 old_llm_token_usage     → next …
04:25 expired_credits         → next …
04:30 Cleaned hot content  keywordsDeleted=28  papersDeleted=719
04:35 agent_session_owner_reconcile → next …
04:45 stale_pending_orders    → next …
05:00 orphan_pdf_objects      → next …
05:15 stale_shares            → next …
05:25 quota_windows           → next …
05:40 agent_event_partitions  → next …
```

`storage: MinIO 就绪` 一条 INFO、**零条 `设置 tmp 生命周期规则失败` warn**(实测 grep)——
说明 4 个桶的 `tmp/ 24h` ILM 规则确实在启动时设成功了。
(⚠️ **未能从生产直接读到 ILM 规则本体**:`mc ilm rule list` 在容器里回 `Access Denied`
——healthcheck 用的 `local` alias 没配管理凭据,而配 alias 属于写操作,按只读约束没做。
所以「ILM 已设置」是**由「无 warn 日志」反推的**,不是直接观测。)

一个可疑迹象:`scholar-peer-review-assets/tmp/180` 的 mtime 是 `Aug 6 02:07`,距取证时刻约 30h,
超过 storage.go:190 注释宣称的「~25h 内被清理」。样本只有 6 个目录、时间跨度都在 Aug 6–7,
**不足以判定 ILM 失效**,但值得挂个观察点。另注:该桶**只有 `tmp/` 一个顶层前缀,没有 `submitted/`**
(`ls` 实测),而 storage.go:133-134 的注释说 submit 时会把对象从 `tmp/<draftId>/` 搬到 `submitted/<id>/`
—— 这两者对不上,**本次未深查**(peer_review_submissions 有 111 行)。

---

## 四、会话工作区(executor 侧)的 GC 与配额

### 4.1 GC:实测在工作

- 实现 `agent/src/server/sessions.ts:476-540`,由 `startSessionSweeper()`(:574-580)每 5 分钟触发,
  内部 6h 节流(`WORKDIR_GC_EVERY_MS`,:456)。TTL 默认 30 天(:455);
  生产 `.env` **未设** `EXECUTOR_WORKDIR_TTL_DAYS`(实测 grep),故走默认 30 天。
- 三道保护:有活跃 WS 不动(:502)、内存 meta 新鲜不动(:504)、rm 前 TOCTOU 复查(:520-522);
  非会话命名的目录(运维杂物)绝不动(:501)。
- **生产实测**(`docker logs scholar_agent | grep "workdir GC"`,容器已运行 2 天):

  ```
  08-05 18:40 removed=1  ttlDays=30
  08-06 00:40 removed=6
  08-06 12:40 removed=3
  08-06 18:40 removed=1
  08-07 00:40 removed=5
  08-07 12:40 removed=3
  ```

  且 `ls -lat data/agent-sessions | tail` 显示**最老的会话目录是 Jul 8**,今天 Aug 7 —— 正好 30 天,GC 边界吻合。

### 4.2 一致性:DB 行与磁盘目录的漂移(实测)

```
磁盘会话目录(去掉 .active/.skills/.template):  883
agent_sessions 行:                              1009
├ 磁盘有目录但 DB 无行(孤儿 workdir):           43   合计仅 3.0MB
└ DB 有行但磁盘无目录(已被 30 天 GC):          169
```

- 43 个孤儿目录都很小(平均 70KB),不构成容量风险;但它们**没有任何回收者**
  —— GC 只看 mtime 不看 DB,`.active` 标记也在被 touch 的话会一直续命。**未查实**它们的来源
  (推测是 reset 换 session id 后旧目录留下 / 建了会话但 DB 写失败)。
- 169 行「DB 有行、工作区已灭」是设计内的:对话真源在 journal,重连时 `seed_history` 回灌。
  **但这些会话里的 uploads/ 引用文献 / analysis bundle 已永久消失**(与主协调者记录的
  「stat_lab 203/209 会话 bundle 已灭」是同一个机制,只是 dev 那次是没挂载卷,这里是正常 TTL 到期)。

### 4.3 🔴 配额只挡住了「后端推」这条路,挡不住模型自己写

`assertSessionQuota`(workspace.ts:70-95)的三道帽:

```ts
PUSH_FILE_MAX_BYTES     = 64MB   (workspace.ts:22)
SESSION_DISK_MAX_BYTES  = 1024MB (workspace.ts:23)
SESSION_FILE_MAX_COUNT  = 2000   (workspace.ts:24)
```

调用点全仓只有两处,**都在 workspace.ts 内**(:224 `PutWorkspaceFile` 字节版、:250 multipart 版):

```
$ grep -rn "assertSessionQuota" agent/src/
agent/src/server/workspace.ts:70   (定义)
agent/src/server/workspace.ts:224
agent/src/server/workspace.ts:250
agent/src/tools/registry.ts:1234   ← 只是一句注释
agent/src/evidence/ledger.ts:15    ← 只是一句注释
```

也就是说:**`Write` 工具(registry.ts:197-209,直接 `writeFile`)、`Edit`(:294)、以及 Bash 里的任何
重定向 / 下载 / 解压,都不经过配额校验**。1GB 的会话帽只对 backend 经 `agentattach` 推进去的
上传件与引用文献生效(agentattach/relocate.go:17-18 的注释准确描述了它自己那条路)。

生产实测的最大两个会话各 **413MB**,内容是会话根目录下的 `ref-150.pdf … ref-202.pdf` 共 200+ 篇
(带一个 `document.md`,形态是 peerreview / prism 的引用文献物化)。这条恰好是走 `agentattach` 的路径、
且 413MB < 1GB 帽,所以没被拦 —— 但它说明**单会话吃掉 0.4GB 是现实量级**,
而模型侧那条无帽的路径一旦被触发(比如 Bash 里 `wget` 一个大数据集、或 stat_lab 生成大量中间产物),
唯一的兜底就是 30 天 TTL 和整机磁盘满。

Top 会话占用(实测):413M / 413M / 130M / 80M / 71M / 66M / 65M / 56M / 52M / 49M …

---

## 五、备份现状 —— 说实话:**没有**

### 5.1 仓库里有什么

- `scripts/backup-all.sh` —— 三件套冷备(mysqldump `--single-transaction` → `mysql.sql.gz`;
  `tar ./data/agent` → `agent-claude.tar.gz`;`tar ./data/agent-sessions` → `agent-sessions.tar.gz`;
  `tar ./data/minio` → `minio.tar.gz`),写 `backups/<时间戳>/` + MANIFEST,`KEEP` 份滚动(默认 7)。
- `scripts/backup-cron.sh` —— flock 串行化 + 固定 PATH + `backups/backup.log` + 可选 `BACKUP_OFFSITE_DEST` rsync 异机。
- `scripts/install-backup-cron.sh` —— 幂等写 host crontab,带 `# SCHOLAY_BACKUP` 标记。
- `scripts/RESTORE.md` —— 恢复手册(刻意不做一键脚本)。

脚本本身质量不错,`backup-all.sh:5-9` 甚至准确点出了「mysqldump 备不到 agent 容器盘 / MinIO 二进制」的盲区。

### 5.2 生产上的实际状态(实测)

```
$ crontab -l
*/10 * * * * /bin/bash /root/security_monitor.sh >/dev/null 2>&1      ← 只有这一行

$ ls -la /home/scholar/backups
(目录不存在,ls 无输出)

$ ls /etc/cron.d/
.placeholder  e2scrub_all  sysstat                                     ← 无 scholay

$ systemctl list-timers --all
(14 个全是系统自带:apt-daily / man-db / logrotate / fstrim …,无 scholay)

$ ls -la /var/spool/cron/crontabs/
root (241 bytes, Mar 28)                                               ← 只有上面那一行
```

**结论:`install-backup-cron.sh` 从未在生产执行过。没有任何自动备份在跑,`backups/` 目录都没被创建过。
也就没有异机副本。**

`/root/` 下确实有一些手工残留(`dump_claw.sql` / `dump_aux.sql` / `security_backup_20260220_092855` /
`w0-backup/`),但那是一次性人工动作的产物,不是备份体系,**未查实**其内容与新鲜度。

### 5.3 由此派生的一个荒诞点

MySQL `log_bin=ON`、`binlog_expire_logs_seconds=2592000`(30 天),binlog 实测吃掉 **2.6GB**
—— 比 scholar 库本体(1.5GB)还大。binlog 的用途是「基于全量备份做 PITR」;
**在零全量备份的前提下,这 2.6GB 是纯开销、没有任何恢复价值**。
(不建议直接关 binlog:它同时是未来上从库 / 上真备份的前提。正确顺序是**先装备份,再让 binlog 有意义**。)

---

## 六、磁盘无界增长的风险点(按严重度)

| 风险 | 当前量 | 增速 / 上界 | 依据 |
|---|---|---|---|
| **R1 `agent_turn_events` 永久保留且增速在翻倍** | 406MB / 527k 行 | 8 月实测 39k 行/天 ≈ 17MB/天 → **~6GB/年**,且 7→8 月速率 ×4.6 | `SELECT … GROUP BY month` 实测;cleanup.go:226-228 明确永不删 |
| **R2 会话工作区无有效写入帽** | 2.4G / 883 目录;单会话最大 413MB | 30 天 TTL 是唯一上界;模型写路径零配额 | workspace.ts:70/224/250 三点 grep;registry.ts:209 直写 |
| **R3 MinIO agent-artifacts 永不过期** | 75MB / 580 对象 | ~1.3MB/天(6/16→8/7 线性);只有用户主动 reset/delete 才回收 | storage.go:147-151(无 ILM)、claw/artifact_harvest.go:179 |
| **R4 prism 版本链无 GC** | 105MB / 6,262 行 | 随项目数线性,323 项目均摊 330KB/项目 | grep 零 DELETE;struct_model.go:160 |
| **R5 binlog 30 天 + 无备份** | 2.6G | 稳态(有上界),但纯浪费 | `SHOW VARIABLES` 实测 |
| **R6 docker 镜像/缓存从不 prune** | 镜像 13.16G(**可回收 10.16G**)+ build cache 2.37G + 悬空 volume 647M | 每次 `deploy.sh` 构建后单调增长 | `docker system df` 实测 |
| **R7 弃用 datadir `data/_data`** | 209M | 静止死重 | `ls data/_data` 实测(含 `mysql.ibd` / `binlog.000001`) |
| **R8 legacy fork jsonl `data/agent`** | 244M | 静止死重(`AGENT_ARCHIVE_FROM_JSONL` 已迁完,只读挂着) | compose:326-328、`du` 实测 |
| **R9 `frontend-assets` 灰度分包只增不减** | 40M(prod) | 按构建频率线性;dev 实测一天 6 次构建 → 848MB | compose:548-556 注释、prod:511 |
| **R10 stranded `usage_logs`** | 94.8M | 静止死重(cleanup.go:510-512 声明不再清理) | 实测表大小 |

**合计一眼可回收的死重:R6(10.16G)+ R7(209M)+ R8(244M)+ R10(95M)≈ 10.7G**,
而当前可用空间只有 16G。也就是说**光是 `docker system prune` 就能把可用空间从 16G 抬到 26G**。

未查实:`feature_tools` 278MB / `hot_papers` 72MB / `seo_*` 85MB 的清理策略(非 agent 范畴,本次未追)。

---

## 七、删用户(注销)时到底删了什么、漏了什么

真源:`backend/internal/user/repository.go:489-559`(`DeleteUser`),调用链
`handler_admin.go:150 DeleteUser` / `:188 BatchDeleteUsers` → `service_profile.go:128` → repository。

⚠️ **先说一条重要前提:grep `DeleteAccount|self-delete|注销账号|deactivate` 在 `internal/user/` 与
`routes_user.go` 里零命中 —— 也就是说,当前只有 admin 能删用户,用户自助注销入口不存在。**
(合规意义上,「删除权」目前靠人工走 admin 后台。)

### 7.1 删了什么

**A. 事务内显式 DELETE**(repository.go:492-523):
`credit_transactions` / `credit_temp_lots` / `credit_reset_passes` / `user_wallets` / `vip_code_redemptions`
/ `library_share_papers`(JOIN) / `library_share_access`(JOIN) / `library_shares` /
`user_library_papers` / `user_library_folders`。

**B. FK ON DELETE CASCADE 带走**(注释 repository.go:472-473,未逐条核 DDL,**以注释为准未查实**):
`user_auth_providers` / `orders`→`payment_transactions` / `user_coupons` / `user_messages` /
`user_invitations` / `usage_logs`。

**C. 事务提交后异步 best-effort**(repository.go:538-556):
MinIO `scholar-paper-pdfs` 里 `papers/<uid>/` 前缀的对象。失败只 warn,由 §3 的 #12 孤儿 reaper 兜底。

### 7.2 漏了什么 —— agent 相关的**全部**

代码自己的注释已经承认(repository.go:486-488):

```go
// ⚠️ 仍未清理(留作后续决策):peer_review_* / prism_* / user_staging_* 及其对象键、
//	agent_sessions 映射与 agent 容器内 jsonl。
```

按本次调查补全这份清单,并标注每一项的后果:

| 漏掉的 | 后果 | 佐证 |
|---|---|---|
| `agent_sessions`(1009 行) | 会话映射滞留,`owner_id` 指向已不存在的用户 | 无 FK(0014 建表,未见 FK) |
| `agent_turns`(2,065 行)+ `agent_turn_events`(**527k 行 / 406MB**) | **全部对话正文永久留存**,含用户输入的原始材料。这是最重的一条:journal 明确「永久保留」,删号不触发任何清理 | cleanup.go:226-228 |
| `agent_session_archive`(111 行 / 31.5MB) | 老会话折叠归档同样滞留 | 实测表大小 |
| `agent_artifacts`(580 行)+ **MinIO `scholar-agent-artifacts` 对象** | 交付物(报告 / 图表 / deck)在对象存储里永久可取;`storage_key` 是路径派生 `<feature>/<ownerID>/<sessionID>/<relPath>`,**含已删用户的 uid** | 0025_agent_artifacts.sql:19-42 **无任何 FK**;实测 580 行 / 580 对象 1:1 |
| **会话工作区** `./data/agent-sessions/<sid>/` | 该用户上传的原始文件、引用 PDF 全文、分析中间产物继续躺在盘上,**最长 30 天**后才被 TTL GC 掉(不是因为删号) | sessions.ts:455 |
| `prism_*` 全族(projects 4.4M / file_versions 51.9M / struct_versions 53.9M / compiles / edits) | 论文全文与全部历史版本滞留 | repository.go:486 自认 |
| `peer_review_*` / `pr2_*`(submissions 111 行 / reports 18.5M)+ MinIO `scholar-peer-review-assets` | 投稿原稿与审稿意见滞留 | repository.go:486 自认 |
| `user_staging_area_papers`(1,261 行) | 检索工作区滞留 | repository.go:486 自认 |
| `user_memory_blocks`(per-user 长期记忆) | 用户画像/偏好滞留 | **未查实**是否有 FK,grep 未做 |
| `llm_token_usage` / `usage_events` / `agent_billing_ledger` | 用量账本滞留(365 天后才被通用 GC 清) | cleanup.go:305/320 |

**实测反证一条(好消息)**:`agent_artifacts LEFT JOIN agent_sessions` 的孤儿行 = **0**。
说明目前还没有过「会话被删但产物行留下」的情况 —— 但这只能说明 `cleanupArtifacts`(4 份镜像:
claw/statlab/scidraw/boltslides 的 `artifact*.go`)在 reset/delete 路径上是对的,
**和删用户无关**(删用户根本不走那条路)。

### 7.3 一句话

> **删用户 = 删账、删钱、删文献集、删自己上传的 PDF;不删任何 AI 产生或 AI 经手的东西。**
> 对话正文(406MB / 527k 行)、交付物(75MB MinIO)、Prism 论文全文与版本链、审稿原稿,
> 全部原样留存且**没有任何 TTL**。如果要对外声称支持「删除权」,这是硬缺口。

---

## 八、附:与主协调者已核实事实的对照(补充 / 更正)

| 协调者结论 | 本次核验 |
|---|---|
| 帧只进 journal,不落库不落 MinIO;耐久化走 `harvestSession` | ✅ 一致(claw/artifact_harvest.go:66-92) |
| `storage_key` 路径派生、同名覆盖 ⇒ 无版本 | ✅ 一致(0025 sql:30 + upsert-only 注释 :59-64) |
| MinIO 桶不挂 lifecycle | ✅ 一致(storage.go:147-151 只 `ensureBucket`,与 paper-pdfs/feedback/peerreview 的 `ensureTmpLifecycle` 对比明显) |
| 会话工作区 30 天 GC | ✅ 一致,且**生产实测在跑**(最老目录 Jul 8;GC 日志 6 条) |
| `OnTurnArtifacts` 轮末钩子今天刚加 | ✅ 代码在(agentbridge/artifact_dispatch.go:harvestQueueCap=2048 / workers=4 / timeout=2min);⚠️ **生产跑的是 2 天前的镜像(`Up 2 days`,agent 启动日志 08-05 00:35),这个钩子还没上线** |
| 生产 agent_artifacts 1035 行 / 226 会话 / 97.7% stat_lab | ❌ **不符**。生产实测 **580 行 / 162 会话;claw 550 · sci_draw 28 · boltslides 2 · stat_lab 0**。生产 `.env` 的 `AGENT_EXECUTOR_FEATURES=smart_search,claw,prism,peerreview,boltslides,sci_draw` —— **不含 stat_lab**。那组数字应来自本地 dev 库 |
| 附件落 `uploads/`、有 `AttachmentRelocator` | ✅ 存在;补充:**附件不落 MinIO、无 DB 表**;配额是 executor 侧 64MB/1GB/2000 三帽(workspace.ts:22-24),清理靠会话 30 天 TTL(与产物不同,**没有**独立的耐久层) |
| 生产 agent_sessions feature 分布 | 补充实测:prism 342 · claw 305 · smart_search 207 · peerreview 139 · sci_draw 14 · boltslides 2,合计 1009 |

---

## 九、建议的动作顺序(不含实施,仅排序)

1. **P0 · 装备份。** 在生产跑一次 `./scripts/install-backup-cron.sh`,并**必须**同时设 `BACKUP_OFFSITE_DEST`
   —— 当前 `backups/` 会落在同一块 `/dev/vda1` 上,单盘故障主备一起没。装完按 `scripts/RESTORE.md` **真演练一次恢复**。
   注意容量:一次全量 ≈ mysqldump(压缩后未知)+ agent 244M + agent-sessions 2.4G + minio 1.8G,
   `KEEP=14` 的默认值在 16G 可用空间下**会撑爆磁盘**,必须先做第 2 步或调小 KEEP。
2. **P0 · `docker system prune`** 回收 ~10.7G(镜像 10.16G + build cache 2.37G),把可用空间抬到 26G 再谈备份。
3. **P1 · 给模型写路径接上配额。** `Write`/`Edit`/`Bash` 目前完全不过 `assertSessionQuota`。
4. **P1 · 决定 `agent_turn_events` 的真实上界。**「永久保留」是产品决策,但在 49G 盘上按 6GB/年(且在加速)
   跑下去,迟早要么改冷热分层要么改保留期 —— 现在决定比磁盘满那天决定便宜。
5. **P2 · 删用户补 agent 侧级联**(§7.2 那张表),或至少显式记录「不删」是有意的产品决策。
6. **P2 · 清死重**:`data/_data`(209M)、`data/agent`(244M,确认归档已迁完后)、`usage_logs`(95M)。

---

## 十、明确「没查实 / 不确定」的清单

- MinIO ILM 规则**本体**未直接读到(`mc` 无凭据,配 alias 属写操作已放弃)。「ILM 已设置」是由「启动无 warn 日志」反推的。
- `scholar-peer-review-assets` 只有 `tmp/` 没有 `submitted/`,与 storage.go:133-134 的注释描述不符,**未深查**。
- `tmp/180` 目录 30h 未被 ILM 清,样本量太小,**未判定**是否 ILM 失效。
- 43 个孤儿会话目录的**来源**未查(只测了数量与大小)。
- FK ON DELETE CASCADE 的实际清单以 `repository.go:472-473` 的注释为准,**未逐条核对 DDL**。
- `user_memory_blocks` 在删用户时是否被 FK 带走,**未查**。
- `feature_tools`(278M)/ `hot_papers`(72M)/ `seo_*`(85M)的清理策略,**未查**(非 agent 范畴)。
- 各表的实际压缩后备份体积**未测**(没有跑过备份)。
- `/root/` 下的手工 dump 残留内容与新鲜度**未查**。
