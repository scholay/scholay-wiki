# agent 产出文件(交付物)的存储全景 — 2026-08-07 只读审计

> 面向已经熟悉本仓库的架构师。**只读分析**,未改任何代码、未碰线上。
> 每条结论都带 `file:line` 或实测输出;推断/未查实处一律显式标注。
> 环境:本机 docker-compose(`scholar_mysql` / `scholar_minio` / `scholar_agent` / `scholar_backend`),
> 该库中 `agent_artifacts` 有 1040 行、最新一行 `2026-08-07 15:15:27`,与协调者所说「生产实测 1035 行/226 会话」同源。

---

## 〇 · 一页速览(与协调者已确认事实的差集)

协调者已确认的部分(帧只进 journal、harvest 四份镜像、dedup_anchor、storage_key 路径派生、
reset/delete 清理、OnTurnArtifacts 轮末钩子)本文不重复推导,只补以下**新事实**:

| # | 新结论 | 证据 |
|---|---|---|
| 1 | MinIO 共 **7 个 bucket**,其中挂 lifecycle 的只有 3 个(`paper-pdfs` / `peer-review-assets` / `feedback-attachments`,都只是 `tmp/` 前缀 24h)。**`scholar-agent-artifacts` 没有任何 lifecycle** | 实测 bucket 元数据(§1.2) |
| 2 | `agent_artifacts` **无任何外键**,`DeleteUser` 也不清它 ⇒ **删号后产物行 + MinIO 对象永久滞留** | `0025_agent_artifacts.sql` 无 FK;`user/repository.go:470-546` |
| 3 | `user_edited` 是**死列**:sci_draw 画布 + `POST /sci_draw/figure/save` 已下线,全仓无读写点;库里仍有 **1 行 `user_edited=1`** 的历史残留 | `agentartifact/model.go:37-39`;路由表 `routes_user.go:374-390` 无 figure/save;实测 SQL |
| 4 | 四份镜像**大小上限不一致**,且 **claw 根本没有前置大小闸**(靠 executor 的 20MB `RAW_CAP` 静默兜底,零日志) | `claw/artifact_harvest.go:62-91` vs `statlab/artifact.go:343` / `scidraw:341` / `boltslides:351` |
| 5 | **319/1040 行(30.7%)的 mime 是 `application/octet-stream`** —— 全部是 docx/xlsx/pptx。根因:executor 的 `workspace.ts mimeOf` 只映射图片+文本,Office 类型根本不在表里 | `agent/src/server/workspace.ts:97-114`;实测 mime 分布 |
| 6 | **`title` 在生产是 0 行有值** —— manifest.json 这条元信息通道实际零产出 | 实测 `SELECT COUNT(*) WHERE title<>''` = 0 |
| 7 | **`kind='dir'` 生产 0 行**;而目录→zip 收割**只有 claw 实现**,另三份 `e.IsDirectory → continue` 静默丢弃 | 实测;`statlab/artifact.go:337` 等 |
| 8 | 顺手实锤的**另一条链路的真事故**:`peer_review_assets` 40 行全部还是 `tmp/` 前缀 key,而该桶挂着 tmp/ 24h ILM ⇒ 桶内实测 **0 字节**,DB 行全是死链 | 实测(§1.2 / §7) |

---

## 一 · MinIO:bucket 清单、key 规则、lifecycle

### 1.1 声明与创建

真源 `backend/internal/storage/storage.go:48-60`(Config)+ `:76-174`(Init 幂等建桶),
桶名来自 env,默认值在 `backend/internal/common/config/config.go:232-238`。

| bucket(默认名) | env | 内容 | key 规则 | 证据 |
|---|---|---|---|---|
| `scholar-paper-pdfs` | `MINIO_BUCKET_PAPER_PDFS` | 文献集 PDF | `papers/<userID>/<paperRowID>/<sha256>.pdf`;上传中转 `tmp/<uid>/<jobID>.pdf` | `library/handler_pdf.go:54`、`handler_upload_resolve.go:190` |
| `scholar-feedback-attachments` | `MINIO_BUCKET_FEEDBACK_ATTACHMENTS` | 反馈附件 | `tmp/<uploadKey>/<uuid><ext>`(**绑定后 key 不动,仍在 tmp/**) | `feedback/service.go:435-453` |
| `scholar-peer-review-assets` | `MINIO_BUCKET_PEER_REVIEW_ASSETS` | 审稿稿件 | `tmp/<submissionID>/<uuid><ext>` | `peerreview/service.go:960` |
| `scholar-prism` | `MINIO_BUCKET_PRISM` | Prism 编译产物 / 素材 | 编译:`prism/<projectID>/<compileID>/<cacheKey>.{pdf,log}`;素材:`prism/<projectID>/assets/<sha12><ext>` | `prism/service.go:453`、`prism/struct_service.go:112` |
| `scholar-feature-tools` | `MINIO_BUCKET_FEATURE_TOOLS` | 功能广场 logo | `logos/<slug>` | `featuretool/logo.go:32,96` |
| **`scholar-agent-artifacts`** | `MINIO_BUCKET_AGENT_ARTIFACTS` | **本文主角:agent 交付物字节** | `<feature>/<ownerID>/<sessionID>/<relPath>`,`kind=dir` 时再 `+".zip"` | `claw/artifact_harvest.go:201-203`、`statlab/artifact.go:427-429`、`scidraw:424-426`、`boltslides:432-434` |
| `scholar-skill-bundles` | `MINIO_BUCKET_SKILL_BUNDLES` | skill 市场 tarball | `skills/<userID>/<skillID>/v<n>/<sha256>.tar.gz` | `skillmarket/service.go:166` |

⚠️ 只有 `MINIO_BUCKET_PAPER_PDFS` 出现在 `.env.example:54` 和两份 compose 里;
其余六个桶名**从未在 env 里出现过**,全部吃 `config.go` 的默认值。改桶名要同时改代码默认与 env,
目前等于「代码里写死」。

### 1.2 lifecycle 实测(不是读代码,是读 MinIO 自己的 bucket 元数据)

```
$ for b in ...; do docker exec scholar_minio cat "/data/.minio.sys/buckets/$b/.metadata.bin/xl.meta" \
    | tr -c '[:print:]\n' '\n' | grep -o "<ID>[^<]*</ID>"; done

scholar-agent-artifacts     => NO_LIFECYCLE
scholar-paper-pdfs          => <ID>scholay-tmp-uploads-24h</ID>
scholar-peer-review-assets  => <ID>scholay-tmp-uploads-24h</ID>
scholar-feedback-attachments=> <ID>scholay-tmp-uploads-24h</ID>
scholar-prism               => NO_LIFECYCLE
scholar-feature-tools       => NO_LIFECYCLE
scholar-skill-bundles       => NO_LIFECYCLE
```

规则本体 `storage.go:193-208`:`Prefix: "tmp/"`,`Expiration.Days: 1`。挂载点在 `Init` 里逐桶显式调用
(`:106` / `:117` / `:135`),`agent-artifacts` 分支(`:147-151`)**只建桶不挂规则**,`skill-bundles`
(`:154-158`)与 `feature-tools`(`:142-146`)同理且代码注释写明了「永久资源,不挂 tmp lifecycle」——
agent-artifacts 那一处**没有任何解释性注释**,看不出是决策还是遗漏。

> 含义:agent 交付物的**唯一**回收路径是应用层的 `cleanupArtifacts`(会话 reset/delete)。
> 没有任何时间维度的兜底。见 §5。

---

## 二 · `agent_artifacts` 表:完整字段与索引

DDL 真源 `docker/mysql/migrations/0025_agent_artifacts.sql:19-46`;
两次增量 `0026_agent_artifacts_sig.sql`(`source_sig`)、`0078_agent_artifacts_user_edited.sql`(`user_edited`)。
GORM 模型 `backend/internal/agentartifact/model.go:20-42`。

实测 `SHOW CREATE TABLE`(与迁移一致,`AUTO_INCREMENT=1056`):

| 列 | 类型 | 语义 / 关键点 |
|---|---|---|
| `id` | BIGINT UNSIGNED PK AI | 前端下载走 `GET /<feature>/artifact/:id` |
| `owner_kind` | VARCHAR(32) NOT NULL DEFAULT 'user' | 四份镜像**全部硬编码写 `"user"`**;`owner_kind=project` 的 prism 不进本表 |
| `owner_id` | BIGINT UNSIGNED NOT NULL | = user_id。**无 FK 到 users** |
| `feature_key` | VARCHAR(64) DEFAULT 'claw' | claw / stat_lab / sci_draw / boltslides |
| `session_id` | VARCHAR(191) NOT NULL | agent session id。**无 FK 到 agent_sessions** |
| `rel_path` | VARCHAR(512) | 相对会话 cwd,恒为 `out/<basename>` |
| `filename` | VARCHAR(255) | basename,展示 + 下载文件名 |
| `mime` | VARCHAR(160) | 来自 executor 的 `raw.MimeType`,**不是后端嗅探**(见 §3.4) |
| `size_bytes` | BIGINT UNSIGNED | 字节数 |
| `content_sha256` | CHAR(64) | 内容去重:变了才 PUT MinIO |
| `source_sig` | VARCHAR(64) | `"<size>:<mtimeMs>"`,命中即跳过整块字节重读 |
| `storage_key` | VARCHAR(640) | MinIO key,**路径派生** |
| `dedup_anchor` | CHAR(64) UNIQUE | `sha256(sessionID + "\0" + relPath)`,`model.go:49-52` |
| `title` / `description` | VARCHAR(255) / (1024) | 来自 `out/manifest.json`。**生产 0 行有值** |
| `kind` | VARCHAR(16) DEFAULT 'file' | file / dir。**生产 0 行是 dir** |
| `user_edited` | TINYINT(1) DEFAULT 0 | **死列**,见 §6 |
| `created_at` / `updated_at` | DATETIME | GORM autoCreate/autoUpdate |

索引:`PRIMARY(id)` · `UNIQUE uk_dedup(dedup_anchor)` · `KEY idx_owner(owner_kind, owner_id)` ·
`KEY idx_session(session_id)`。

**索引缺口**:所有列表查询是 `ListBySession`(`repository.go:63-69`,`WHERE session_id=? ORDER BY created_at, id`)
→ 走 `idx_session` 没问题。但**没有 `feature_key` 上的索引**,也没有 `(owner_id, feature_key)` 复合索引 ——
目前无按 feature 的查询路径,所以不是现患;将来做「我的全部产物」页面时要补。

**Upsert 语义**(`repository.go:26-34`):冲突键 `dedup_anchor`,只更新
`filename/mime/size_bytes/content_sha256/source_sig/storage_key/title/description/kind/updated_at`;
`owner_*`/`session_id`/`rel_path`/`created_at` 是身份列不动。

---

## 三 · 四份镜像差异矩阵

四份文件:`internal/claw/artifact.go` + `internal/claw/artifact_harvest.go`(claw 是原件,拆两个文件)、
`internal/statlab/artifact.go`、`internal/scidraw/artifact.go`、`internal/boltslides/artifact.go`。

### 3.1 主矩阵

| 维度 | claw | stat_lab | sci_draw | boltslides |
|---|---|---|---|---|
| **收割前大小闸** | **无**(harvestSession `artifact_harvest.go:72-89` 直接进 harvestFile) | `e.Size > 16MB` 跳过 + `slog.Warn`(`:343-346`) | `16MB` 同上(`:341-344`) | `12MB` 同上(`:351-354`) |
| 实际生效上限 | executor `RAW_CAP = 20MB`(`workspace.ts:11`)→ `state=too_large` → `harvestFile` **静默 return**(`artifact_harvest.go:107-109`) | 16MB(有日志) | 16MB(有日志) | 12MB(有日志) |
| `maxArtifactBytes` 常量(实时回退用) | 12MB(`artifact.go:48`) | 16MB(`:46`) | 16MB(`:45`) | 12MB(`:47`) |
| **目录 → zip** | ✅ `harvestDir`(`artifact_harvest.go:115-134`)+ `collectDirForZip`(`artifact.go:381-430`)+ 路由 `/claw/session/artifact.zip`(`routes_user.go:335`) | ❌ `e.IsDirectory → continue`(`:337`) | ❌(`:336`) | ❌(`:346`) |
| zip 限额 | 50 文件 / 深度 4 / 单文件 5MB / 总 30MB(`artifact.go:365-371`) | — | — | — |
| **manifest.json 读取** | ✅ 原生 | ✅(2026-08-07 A9 补) | ✅(A9 补) | ✅(A9 补) |
| **manifest 排除出列表** | ✅ 原生 `shouldListArtifact`(`:106-111`) | ✅ A9 补(`:82-86`) | ✅ A9 补(`:81-85`) | ✅ A9 补(`:85-95`) |
| **额外排除规则** | 实时回退列表另跳二进制 `liveBinaryExts`(pdf/docx/xlsx/pptx/zip,`:116-123`),避免死按钮 | 无 | 无 | **排 `.pptx` / `.pdf`**(`:91-93`):导出是一次性流回,不留存 |
| **实时回退可服务类型** | text + **image**(仅光栅,`allowedRasterMIME` 白名单,`:341-362`) | 仅 text(`:269-272`) | 仅 text(`:268-271`) | 仅 text(`:279-282`,前端 srcDoc 预览) |
| 实时回退是否列目录条目 | ✅ 列出 `kind:"dir"` 卡(`:204`) | ❌ | ❌ | ❌ |
| **跨 feature 越权 404** | ✅(`:251-257`,**2026-08-07 才补**,原件反而最晚) | ✅(`:199-203`) | ✅(`:198-202`) | ✅ |
| **key 前缀来源** | 硬编码字符串 `"claw/"`(`artifact_harvest.go:202`) | `FeatureKey` 常量(`:428`) | `FeatureKey`(`:425`) | `FeatureKey`(`:433`) |
| `kind=dir` 时 key 追加 `.zip` | ✅(`artifact_harvest.go:143-145`) | — | — | — |
| **key 变化时删旧对象** | ✅(`artifact_harvest.go:152-155`,file↔dir 翻转防 orphan) | ❌ | ❌ | ❌ |
| 下载 ctx | `c.Request.Context()`(10min,`:259-268`) | 同(`:205-209`) | 同(`:204-208`) | 同 |
| 轮末钩子 `HarvestTurnArtifacts` | ✅ | ✅ | ✅ | ✅ |
| `cleanupArtifacts` 挂点 | reset `handler.go:75` / delete `handler.go:301` | `:73` / `:249` | `:60` / `:236` | `:66` / `:242` |
| 额外从 MinIO **回灌**工作区 | — | — | — | ✅ 导出 pptx 前把 deck 从 MinIO 写回 cwd(`handler.go:303-317`) |

### 3.2 收割算法(四份同构的部分)

1. `ListWorkspaceFiles(sessionID, "out")`;`tree==nil || state!="ok"` → **什么都不删,直接返回**
   —— 这是刻意的 upsert-only 语义,理由写在 `claw/artifact_harvest.go:55-61`(工作区临时、
   耐久真源在 MinIO+DB,早先的 on-list 对账删除会在容器重启后把已交付产物全清掉)。
2. 逐条:`source_sig` 命中且 `kind=file` 且 `storage_key!=""` → 跳过字节重读。
3. 否则 `ReadWorkspaceFileRaw` 拿原始字节 → sha256 → 与 `existing.ContentSHA256` 比 → 变了才 `PutObject`。
4. 无论字节是否变,元信息**每次都 Upsert**。

⚠️ **`DeleteStaleBySession` 是死代码**:`repository.go:90-107` 定义了、`delivery.go:43` 进了契约,
但全仓找不到调用点(收割改 upsert-only 之后没人再调)。也就是说 **`./out` 里删掉的文件,
产物列表里会永久多留一条仍可下载的旧卡**(该行为在 `artifact_harvest.go:60-61` 被显式接受)。

### 3.3 执行器侧(`agent/src/turn/artifacts.ts`)

- 帧面 = `out/` 顶层(文件 + 一级子目录聚合)∪ 会话根递归扫描的可交付扩展名文件
  (`.md/.docx/.xlsx/.pptx/.pdf/.csv/.html/.svg`,`:27`),有界:深度 6 / 400 文件 / 2000 目录(`:42-45`),
  预算耗尽有 `log.warn`(`:166-174`)。
- 排除:`ROOT_SKIP_DIRS`(含 `uploads` / `references`,`:30`)、任意层 `DEEP_SKIP_DIRS`(`:35-38`)、
  根目录工作文件白名单(`:41`)、保留区 `evidence/` + `analysis/`(`inReservedLexical`,`:245-246`)。
- **一轮最多 20 帧**(`ARTIFACT_MAX_FRAMES`,`:49`),截断先于 relocate(`:426-429`)。
- `relocateStrays`:越界交付物 **copyFile** 进 `out/`;身份映射表落
  `analysis/.relocate-map.json`(引擎保留区,模型写不进),同源覆盖、异源才排 `-N`(`:261-352`)。
- 交付闸 `runDeliveryGate` 在 relocate **之后**跑(`:444-455`),被隔离的文件物理搬进
  `analysis/quarantine/` ⇒ backend 的 `ListWorkspaceFiles(out/)` **收割不到**。

> 🔴 帧面与收割面**不是同一个集合**:帧受 20 张上限 + 交付闸过滤,收割是无条件重扫 `out/` 顶层。
> 所以「卡片没出现但文件已落库」和「卡片出现过但当时没落库」两种偏差都可能存在。
> 轮末钩子接线后,后者的窗口大幅收窄,但两条路径仍无一致性校验。

### 3.4 mime 的真实来源(实测发现的缺口)

`harvestFile` 写进 DB 的 `mime` 来自 `raw.MimeType`,而它出自 executor
`agent/src/server/workspace.ts:111-114` 的 `mimeOf()` —— 该函数只查 `IMG_MIME`(7 种图片)与
`TEXT_MIME`(18 种文本),**Office 类型完全不在表里**,一律回落 `application/octet-stream`。

实测分布(1040 行):

```
md   text/markdown            262
docx application/octet-stream 253   ← 
csv  text/csv                 235
py   text/x-python            209
xlsx application/octet-stream  64   ← 
svg  image/svg+xml              8
html text/html                  3
pptx application/octet-stream   2   ← 
R    application/octet-stream   2
json application/json           1
sps  application/octet-stream   1
```

同一个仓库里 `agent/src/turn/artifacts.ts:52-62` 的 `ARTIFACT_MIME` **有**完整 Office 映射 ——
但那张表只喂 `artifact` 帧,不参与收割读路径。两张 mime 表并存且不一致。

影响面(已核对,**不是 P0**):前端 `artifact-format.ts:79-107` 的 `artifactCategory`
**先看扩展名再看 mime**,docx/xlsx 分类不受影响;下载走 `attachment` + 文件名,浏览器按扩展名处理。
实际损失只是 `Content-Type` 不精确 + 将来任何按 mime 分流的逻辑会踩空。

---

## 四 · 磁盘占用现状(实测)

### 4.1 MinIO

```
$ docker exec scholar_minio du -sh /data/*
20M  /data/scholar-agent-artifacts
48M  /data/scholar-feature-tools
0    /data/scholar-feedback-attachments
18M  /data/scholar-paper-pdfs
0    /data/scholar-peer-review-assets      ← 见 §7
3.3M /data/scholar-prism
72K  /data/scholar-skill-bundles
```

agent-artifacts 内部:

```
6.1M /data/scholar-agent-artifacts/boltslides
132K /data/scholar-agent-artifacts/claw
208K /data/scholar-agent-artifacts/sci_draw
14M  /data/scholar-agent-artifacts/stat_lab
```

对象数 = **1040**(`ls -R | grep -c '^xl.meta$'`),**与 DB 行数 1040 完全相等 ⇒ 当前零孤儿对象**。
(注:MinIO 的 20M vs DB `SUM(size_bytes)=16.6MiB` 的差额是 xl.meta 元数据与块对齐开销,正常。)

DB 侧分布:

| feature | 行数 | 会话数 | 合计 | 最大单文件 |
|---|---|---|---|---|
| stat_lab | 1011 | 209 | 10.37 MB | 287 KB |
| claw | 14 | 8 | 0.08 MB | 23 KB |
| sci_draw | 10 | 7 | 0.18 MB | 35 KB |
| boltslides | 5 | 3 | 5.99 MB | 4.9 MB |
| **合计** | **1040** | ~226 | 16.6 MB | — |

时间跨度 `2026-06-28 10:57` → `2026-08-07 15:15`。约 **1.4 天/MB** 的增速,当前量级完全不构成压力;
但**没有任何自动回收**(§1.2 + §5),是单调增长曲线。

### 4.2 会话工作区

```
$ du -sh data/agent-sessions      → 20K,18 个目录(其中 17 个为 0B + .active 标记)
$ docker exec scholar_agent du -sh /home/bun/sessions  → 20K,同上
```

挂载点 `docker-compose.yml:453`(prod `docker-compose.prod.yml:400`)`./data/agent-sessions:/home/bun/sessions`,
GC `agent/src/server/sessions.ts:455` `WORKDIR_TTL_MS = EXECUTOR_WORKDIR_TTL_DAYS(默认30) * 1d`,
`=0` 关闭。

> 🔴 209 个 stat_lab 会话有产物行,但盘上只剩 18 个会话目录、其中 17 个是空的。
> 这与既有记忆「dev 缺 sessions 挂载致 203/209 会话 bundle 已灭」一致:
> **产物字节因为已落 MinIO 而活着,但重算/返修所需的 `analysis/` bundle 与源数据已经没了。**
> 也就是说交付物"看得见下得到",但它背后的可复现性在本环境里已经不存在。

配额闸(`agent/src/server/workspace.ts:22-24`,咽喉点 `assertSessionQuota:70-95`):
单文件 64MB、会话累计 1GB、会话文件数 2000,均可用 env 关(设 0)。
⚠️ 该闸只覆盖**入湖**路径(`putWorkspaceFile` / `pushSessionFile`),**模型自己在 Bash/Write
里生成的文件不经过它** —— 会话磁盘对模型产出实际上是无界的,只有 30 天 GC 兜底。

---

## 五 · 删除路径:谁清、谁不清

### 5.1 会话 reset / delete(✅ 会清)

四份镜像各自在 handler 里挂:

| feature | reset | delete |
|---|---|---|
| claw | `handler.go:75` | `handler.go:301` |
| stat_lab | `handler.go:73` | `handler.go:249` |
| sci_draw | `handler.go:60` | `handler.go:236` |
| boltslides | `handler.go:66` | `handler.go:242` |

`cleanupArtifacts` = `DeleteBySession`(先 SELECT storage_key 再 DELETE)+ `storage.DeleteObjects`。
删对象是 **best-effort**:失败只 `slog.Error`(`claw/artifact_harvest.go:191-198` 等),
**没有重试、没有对账 reaper** ⇒ DB 行没了、对象留下 = 永久孤儿且无人发现。

reset 路径有一处正确的细节:先**只读**取旧 sid(`GetSessionID`,不创建),reset 成功后再清,
避免无 mapping 时误建空会话(`claw/handler.go:63-76`)。

### 5.2 删用户(❌ **不清**,是最大的缺口)

`backend/internal/user/repository.go:470-546` 的 `DeleteUser`:
- 事务内显式清:计费 5 表 + 文献集/分享 6 表;
- 用户主行删除靠 FK CASCADE 带走 auth_providers / orders / messages 等;
- 事务后异步清 MinIO **仅 `papers/<uid>/` 前缀**(`:536-544`)。

注释 `:486-488` 自陈「仍未清理:peer_review_* / prism_* / user_staging_* 及其对象键、
agent_sessions 映射与 agent 容器内 jsonl」——**`agent_artifacts` 连在这句 TODO 里都没被提到**。

而 `0025_agent_artifacts.sql` 建表**无任何 FOREIGN KEY**(实测 `SHOW CREATE TABLE` 确认)。
两者叠加 ⇒ **删号后产物行与 MinIO 对象 100% 滞留,且没有任何 reaper**。

实测当前 `SELECT COUNT(*) FROM agent_artifacts a LEFT JOIN users u ON u.id=a.owner_id WHERE u.id IS NULL` = **0**
(即目前还没发生过带产物用户的删号),所以这是**尚未引爆**的合规缺口,不是现存脏数据。

### 5.3 会话 id 被换掉(⚠️ 静默孤儿风险)

`agentbridge/bridge.go:1605-1612` 的自愈路径(agent 端 404 → 新建会话 → `UpdateSessionID` 把
DB 行 repoint)**不调用任何产物清理**。旧 sid 的 `agent_artifacts` 行随即变成:
- `ListBySession(newSid)` 看不到 ⇒ 用户界面里消失;
- `DownloadArtifactByID` 仍可下载(只校验 `OwnerID` + `FeatureKey`,不校验会话存活);
- 后续 reset/delete 只按**当前** sid 清 ⇒ **永远不会被清**。

实测当前 `agent_artifacts LEFT JOIN agent_sessions` 孤儿 = **0**,说明尚未发生;
但既有记忆里 journal 侧已经出现过同型事故(prism 64 / claw 10 / smart_search 7 孤儿),
机制完全相同 —— 产物侧只是还没轮到。

### 5.4 删项目(prism)

prism 用 `owner_kind=project`,**不进 `agent_artifacts`**(它有独立的 `scholar-prism` 桶 +
`prism_compiles` 表 + `texclient` 编译管线,`agentartifact/delivery.go:9-13` 明确写了这一点)。
所以「删项目怎么清产物」不在本表范畴;`agent_artifacts` 里 `owner_kind` 实测只有 `user`。

### 5.5 工作区 GC 与 MinIO 的关系

executor 30 天 GC 只删盘上的会话目录,**不通知 backend、不动 DB/MinIO**。
方向是对的(MinIO 是耐久真源),代价是 §4.2 说的:交付物活着但可复现性死了。

---

## 六 · `user_edited` / sci_draw 画布编辑的持久化

**结论:该机制已经整体下线,`user_edited` 是死列。**

- 设计原貌 `0078_agent_artifacts_user_edited.sql:2-13`:sci_draw A 车道产物是 scene-graph
  `*.fig.json`,前端 React Flow 渲成无限画布,用户拖拽后 `POST /sci_draw/figure/save`
  把新 scene-graph 写回**该产物的 MinIO 对象 + 本行内容列**,并置 `user_edited=1`;
  `harvestFile` 见到 `user_edited=1` 就跳过,防止被下一轮 agent 产物冲掉。
- 现状:
  - 全仓 `grep user_edited|UserEdited` 只剩 **3 处注释 + 1 处 GORM 字段声明**
    (`agentartifact/model.go:37-39` 明说是遗留列、`scidraw/artifact.go:359-360` 与
    `statlab/artifact.go:361-363` 说明"故不再有 user_edited 保护");
  - `routes_user.go:374-390` 的 sci_draw 路由表里**没有 `figure/save`**,全仓无 `SaveFigure`;
  - `scidraw/artifact.go:356-368` 的 `harvestFile` **完全不读该列**,只按 `source_sig` 判跳过。
- 现在的 sci_draw 是「只读内联出图」:`.fig.json` 由**前端**解析渲染
  (`features/claw/components/chat/TurnFigures.tsx:105`、`figure/figure-spec.ts:36`、
  `preview/artifact-format.ts:90-91` 的 `figure` 分类),**不落任何编辑态**。

实测残留:`SELECT SUM(user_edited) FROM agent_artifacts GROUP BY feature_key` → sci_draw **1 行为 1**。
这一行现在没有任何特殊行为(没人读该列),但它是历史上真发生过一次画布保存的证据。

> 后果:**用户对图的任何调整都不再被持久化**。上一轮的图会被 agent 重画覆盖
> (`sig` 变即重读重传),这是**刻意的产品决策**(注释明写),不是 bug。

---

## 七 · 顺带查实的相邻事故(不在本次范围内,但同属"对象存储生命周期")

`peer_review_assets` 40 行,object_key **全部**是 `tmp/<submissionID>/<uuid>.pdf`(实测最近 5 行,
最新 `2026-08-03`);而 `scholar-peer-review-assets` 桶挂着 `tmp/` 24h 过期 ILM(§1.2 实测),
桶实际占用 **0 字节**。

`storage.go:132-134` 的注释说「submit 时 service 层把对象从 `tmp/<draftId>/` 移动到
`submitted/<id>/`」—— 但全仓 `grep "submitted/"` 在 `internal/peerreview/` **零命中**,
`internal/storage/` 也没有 `CopyObject`/`MoveObject`。

⇒ **审稿稿件在提交 24h 后一律被 ILM 清空,DB 行全部指向不存在的对象**。
这与 agent 产物无关,但正好是本次「哪些桶挂了 lifecycle」这个问题的反面教材:
**挂了 lifecycle 而 key 规则没跟上,比不挂更危险。**
(未验证:是否有别的迁移路径改写过 object_key —— 从实测的 40 行 key 看没有。)

---

## 八 · 风险清单(按严重度)

| # | 风险 | 严重度 | 依据 |
|---|---|---|---|
| R1 | 删用户不清 `agent_artifacts` 行与 MinIO 对象,且表无 FK、无 reaper ⇒ 已删账号的交付物字节永久留存 | **high**(合规:删除权) | `user/repository.go:470-546` + `0025` 无 FK;实测 0 现存脏数据 |
| R2 | `scholar-agent-artifacts` 无 lifecycle,唯一回收是会话 reset/delete;用户不删会话 = 永不回收 | **high** | `storage.go:147-151`;实测 bucket 元数据 NO_LIFECYCLE |
| R3 | 会话 id 自愈换绑不清产物 ⇒ 旧 sid 的行永久孤儿(列表看不见、清理够不着) | **high** | `agentbridge/bridge.go:1605-1612`;实测当前孤儿 0 |
| R4 | `DeleteObjects` 失败只 log,无重试无对账 ⇒ DB 行没了对象留下,无人发现 | medium | `claw/artifact_harvest.go:191-198` 等四处 |
| R5 | claw 收割**无前置大小闸**,>20MB 文件在 executor 侧 `too_large` 后被**静默丢弃**(零日志) | medium | `artifact_harvest.go:72-89,107-109` + `workspace.ts:11` |
| R6 | 30.7% 行的 mime 是 `application/octet-stream`(docx/xlsx/pptx);仓库内两张 mime 表不一致 | medium | `workspace.ts:97-114` vs `turn/artifacts.ts:52-62`;实测分布 |
| R7 | 只有 claw 实现目录→zip,另三份静默丢弃 `out/` 下的目录(用户无任何提示) | medium | `statlab:337` / `scidraw:336` / `boltslides:346` |
| R8 | `DeleteStaleBySession` 是死代码 ⇒ `out/` 里删掉的文件在产物列表永久残留 | low(已知取舍) | `repository.go:90-107` 无调用点;`artifact_harvest.go:60-61` |
| R9 | `title/description` 通道生产零产出(0/1040 有值),manifest 修复刚落地未验证 | low | 实测 |
| R10 | 会话磁盘配额只管入湖路径,模型自生成文件不过闸 | low | `workspace.ts:222-254` 只在 put/push 调 `assertSessionQuota` |
| R11 | (相邻)peer_review 稿件对象被 tmp/ ILM 24h 清空,40 行全死链 | **high**(该链路) | §7 实测 |

---

## 九 · 明确未查实 / 不确定

1. **线上(生产)环境未单独连接**。本文所有实测均在本机 docker-compose 上执行;
   协调者给的生产数字(1035 行/226 会话)与本机 1040 行/~226 会话高度吻合,推断同源,但**未独立验证**。
2. **MinIO 版本级 lifecycle 语义**:我读的是 `.minio.sys/buckets/<b>/.metadata.bin/xl.meta` 的
   内嵌 XML,不是 `mc ilm ls`(容器内无 mc/find/grep)。判定「有/无 lifecycle」可信;
   若存在 MinIO 全局 ILM 或对象锁等其它机制,本文未覆盖。
3. **`agent_artifacts` 是否曾被人工清理过**:AUTO_INCREMENT=1056 vs 1040 行,差 16 行。
   可能是 reset/delete 正常清理,也可能是别的;未追。
4. **上传附件链路**(`internal/agentattach` / `uploads/` / `AttachmentRelocator`)**本文未查**
   —— 属兄弟任务范围。只确认了 `artifacts.ts:30` 的 `ROOT_SKIP_DIRS` 把 `uploads`/`references`
   排除在产物扫描面外。
5. **前端产物面板的具体渲染/预览取字节路径**只抽查了 `api/artifacts.ts:95-137` 与
   `artifact-format.ts:79-107`,没有通读预览组件族。
6. **`kind='dir'` 从未在生产出现**:是模型从不建目录,还是 claw 用量本身就小(14 行/8 会话),
   无法区分;`harvestDir` 这条路径**在生产从未被验证过**。
7. **交付闸(`runDeliveryGate`)与 numcheck 的实际拦截率**未测(既有记忆里已有独立审计结论)。
