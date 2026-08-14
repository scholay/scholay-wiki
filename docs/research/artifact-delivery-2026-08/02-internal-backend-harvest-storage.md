# 02 · Go backend 侧产物取证：收割 / 存储 / 寻址 / 下载 / 生命周期

> 2026-08-07。调研范围：**backend 侧**（`internal/claw` `internal/agentartifact` `internal/agentbridge`
> `internal/agent` `internal/storage` + migrations + routes）。
> 为了回答「两条链路何时不一致」，必要处读到了 `agent/src/turn/artifacts.ts`、`agent/src/server/workspace.ts`、
> `agent/src/server/sessions.ts` 与前端 `features/claw/api/artifacts.ts` / `ConversationWorkspace.tsx` /
> `MessageTurn.tsx` / `shared/lib/strip-container-paths.ts` —— 这些跨界引用都在正文里逐条标了 file:line。
>
> 每条结论都带 `file:line`。**没有实测运行环境**（未起容器、未查 MySQL/MinIO），
> 所有结论是静态取证 + 代码路径推演，涉及运行期数据的地方一律标注为推演并说明依据。

---

## 〇、一句话结论

产物交付在 backend 侧是**两条互不通信的链路**：

| | 链路 A：`artifact` 帧 | 链路 B：on-list harvest |
|---|---|---|
| 产生者 | executor `emitArtifacts`（`agent/src/turn/artifacts.ts:340`） | backend `harvestSession`（`backend/internal/claw/artifact_harvest.go:34`） |
| 触发时机 | 每轮 **正常结束前**（`turnLoop.ts:956`，被 `!terminalSent` 守着） | 用户端 **GET `/claw/session/artifacts`** 时同步执行 |
| 落地 | 只进 journal（`EvArtifact`，`agentbridge/eventlog.go:40`）+ 转发浏览器 | 进 MinIO + `agent_artifacts` 行 |
| 前端消费 | 对话流里的**就近产物卡**（`MessageTurn.tsx:74` `mergeTurnArtifacts`） | 右侧**产物面板**（`ConversationWorkspace.tsx:502`） |
| 真源 | 无（帧不落 `agent_artifacts`，backend 收到 artifact 帧**不触发任何收割**） | `./out/` 顶层目录列表 |

**它们唯一的交汇点在前端**：`mergeTurnArtifacts` 用 `path` 把帧和 DTO 对齐（`MessageTurn.tsx:74-86`）。
后端两侧零耦合 —— `hub.go` 里 `artifact` 只出现在 `classifyJournalEv` 的一个 case（`hub.go:2086`），
`grep -n "artifact" backend/internal/agentbridge/hub.go` 全文只有 3 行命中。
2026-07 的设计文档明确写过要有 `FeatureSpec.OnArtifact` 收割钩子
（`docs/research/artifact-delivery-2026-07/DESIGN.md:28,30`），**该钩子从未实现**
（`grep -rn "OnArtifact" backend/ agent/src` 零命中）。

用户的三个痛点在 backend 侧各有明确对应：

1. **「文件输出看不到」** → 帧链路在**异常终止轮整轮不发帧**（`turnLoop.ts:944-978`），
   而对话流的产物卡 100% 由帧驱动（`MessageTurn.tsx:75`：`if (!turn.artifacts || ...) return []`）。
   窄屏下产物面板还被整体关掉（`ConversationWorkspace.tsx:223`）→ 那种情况下**用户没有任何入口**。
2. **「编辑文件容易改不到」** → 模型写在会话根的交付物，第二次写会被
   `relocateStrays` **改名成 `X-2.docx`**（`agent/src/turn/artifacts.ts:270-273`），
   而 harvest 是 upsert-only 永不回收（`artifact_harvest.go:29-33`）→ 面板里新旧两份并存、旧的在前。
3. **「说输出到 out 目录」** → 出口清洗 `stripContainerPaths` 只认 `./out/xxx` 与 `/home/...`
   两种形态（`frontend-user/src/shared/lib/strip-container-paths.ts:14,16`），
   **裸 `out/` 与「out 目录下」这类中文表述完全不在正则覆盖内**（第 9-10 行的注释明说「刻意不碰裸 `out/`」）。

---

## 一、`agent_artifacts` 表：结构、唯一键、写入语义

### 1.1 建表

`docker/mysql/migrations/0025_agent_artifacts.sql:19-45`：

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | BIGINT UNSIGNED AI | PK，也是**对外唯一寻址句柄**（`GET /<feature>/artifact/:id`） |
| `owner_kind` / `owner_id` | varchar(32) / bigint | 归属，沿用 `agent_sessions`（0014） |
| `feature_key` | varchar(64) default `claw` | claw / boltslides / sci_draw / stat_lab |
| `session_id` | varchar(191) | agent 会话 id |
| `rel_path` | varchar(512) | **收割键的一半**，形如 `out/report.md` |
| `filename` | varchar(255) | basename，展示用 |
| `mime` | varchar(160) | 来自 agent `WorkspaceRawFile.MimeType` |
| `size_bytes` | bigint unsigned | 实际写入的字节数 |
| `content_sha256` | char(64) | **跳过 MinIO 重传**的判据 |
| `source_sig` | varchar(64)（0026 追加） | `"<size>:<mtimeMs>"`，**跳过字节重读**的判据 |
| `storage_key` | varchar(640) | MinIO key |
| `dedup_anchor` | char(64) **UNIQUE** | `sha256(session_id \0 rel_path)` |
| `title` / `description` | varchar(255/1024) | 来自 `out/manifest.json` |
| `kind` | varchar(16) | `file` / `dir`(zip) |
| `user_edited` | tinyint（0078 追加） | **已死列**，见 1.5 |

索引：`UNIQUE uk_dedup(dedup_anchor)` · `idx_owner(owner_kind,owner_id)` · `idx_session(session_id)`
（`0025:41-43`）。**没有 `feature_key` 索引，也没有指向 `users` / `agent_sessions` 的外键。**

### 1.2 dedup anchor

`backend/internal/agentartifact/model.go:49-52`：

```go
func DedupAnchorFor(sessionID, relPath string) string {
	sum := sha256.Sum256([]byte(sessionID + "\x00" + relPath))
	return hex.EncodeToString(sum[:])
}
```

即 **(会话, 相对路径) 唯一**。三层含义：

- 同一路径反复收割 = 更新同一行 → **id 稳定**，前端卡片 URL 不变；
- 不含 `feature_key`：跨 feature 不可能撞（sessionID 是 UUID），但也意味着
  「同一 session 换 feature」在模型上是不可表达的（实际不会发生）；
- **不含内容/时间维度 ⇒ 表结构上就不存在「版本」概念**，见第七节。

### 1.3 upsert 还是 append —— **upsert，且只更新非身份列**

`backend/internal/agentartifact/repository.go:26-34`：

```go
return r.db.Clauses(clause.OnConflict{
	Columns: []clause.Column{{Name: "dedup_anchor"}},
	DoUpdates: clause.AssignmentColumns([]string{
		"filename", "mime", "size_bytes", "content_sha256", "source_sig",
		"storage_key", "title", "description", "kind", "updated_at",
	}),
}).Create(a).Error
```

`owner_*` / `session_id` / `rel_path` / `created_at` **不在更新列表里**（注释在 25 行明说）。

### 1.4 会不会回收旧行 —— **不会。upsert-only 是明确的设计决策**

`backend/internal/claw/artifact_harvest.go:29-33` 的函数头注释写得很清楚：

> 收割是 **upsert-only**：只把 ./out 当前条目加/更新进 MinIO+DB，**绝不**按 live 工作区删已持久化的产物。
> 原因：executor 会话工作区是临时的…早先的「on-list 对账删除」会在重启后工作区为空时把已交付产物全清掉。

代码上的证据：`harvestSession` 里没有任何 delete 调用；
`Repository.DeleteStaleBySession`（`repository.go:90-107`）**是死代码** ——
`grep -rn "DeleteStaleBySession" backend/` 只命中实现（`repository.go:90`）与接口声明
（`agentartifact/delivery.go:43`），零调用点。

**唯一的回收边界 = 会话 reset / delete**：
- `claw/handler.go:68-76`（ResetSession，先读旧 sid 再清）
- `claw/handler.go:301`（DeleteSession）
- 四个 feature 各有一份镜像（`boltslides/handler.go:66,242` · `scidraw/handler.go:60,236` ·
  `statlab/handler.go:73,249`）。

**没有任何周期性 GC**：`grep -rn "agent_artifacts" backend/internal/common/cleanup/` 零命中；
MinIO 侧 `AgentArtifactsBucket` 在 `storage.Init` 里**只 ensureBucket、不挂 lifecycle**
（`storage/storage.go:147-151`，对比 PDF/feedback/peerreview 三个桶都调了 `ensureTmpLifecycle`）。

⇒ **只要用户不主动删会话，产物在 MinIO 里永久留存。**（第四节展开这个的代价。）

### 1.5 `user_edited` 已是死列

`0078_agent_artifacts_user_edited.sql` 是为 sci_draw 无限画布加的保护位；
画布已下线，`model.go:37-39` 的注释自陈「现无代码读写此列」，
`grep -rn "UserEdited" backend/` 只命中 model 定义本身。
scidraw/statlab 的 `harvestFile` 注释（`scidraw/artifact.go:308` · `statlab/artifact.go:311`）
也明说「不再有 user_edited 保护」。
**后果**：今天没有任何机制能保护「用户改过的产物」不被 agent 下一轮覆盖 —— 新架构如果要做
「用户可编辑产物」，这一位得重新激活或换设计。

---

## 二、`harvestSession` 何时触发 —— on-list 懒收割的完整后果

### 2.1 唯一触发点

`backend/internal/claw/artifact.go:201`，在 `GetSessionArtifacts` 里**同步**执行：

```go
if err := h.harvestSession(ctx, userID, sessionID); err != nil { ... }
rows, lerr := h.artifactRepo.ListBySession(sessionID)   // :209
```

即 **HTTP GET 请求内联做「列目录 + N 次字节回读 + N 次 MinIO PUT + N 次 DB upsert」**，
超时预算 `artifactListTimeout = 10 * time.Second`（`artifact.go:52`、`:191`）。

### 2.2 「用户不打开面板就不收割」——**在 claw 里不成立，但仍有真实盲区**

前端的 `useAgentArtifacts` 挂在会话 hook 上、不是挂在面板上：
`makeAgentConversationHook.ts` 在每轮 `message_complete` **或 `error`** 后
`invalidateQueries([feature,'artifacts'])`（`makeAgentConversationHook.ts:364-368`），
且 query 的 `enabled` 只要求 `token && sessionId`（`api/artifacts.ts:66`）。
⇒ **只要浏览器开着会话页，每轮结束都会触发一次收割**，与面板是否展开无关。

真实盲区是这几种：

| 盲区 | 机制 | 后果 |
|---|---|---|
| 用户关掉标签 / 切走后那轮才结束 | 无人发 GET → 不收割 | 产物只在 agent 磁盘上；下次进会话才补收（依赖 workdir 还在） |
| server-side 无人值守轮（peerreview 型）/ Run 引擎跑完 | 同上，且可能永远无人进那个会话 | 同上 |
| agent workdir 被 30 天 GC 清掉（`agent/src/server/sessions.ts:455,476-540`） | 那时才第一次 GET → `tree.State != "ok"` → `harvestSession` 直接 return nil（`artifact_harvest.go:39-42`） | **产物永久丢失**，且没有任何日志/告警 |
| 10s 预算内没收完 | `ReadWorkspaceFileRaw` 拿到 ctx deadline → `harvestFile` 静默 `return`（`artifact_harvest.go:79-81`） | 部分文件不入库、**零日志**、下次 GET 才有机会补 |

第 4 条值得单列：`harvestSession` 对每个变更文件走一次 agent HTTP round-trip
（自身还有 `roundTripTimeout = 10s`，`agent/client.go:36`）+ base64 解码 + MinIO PUT。
agent 侧 raw 读上限 `RAW_CAP = 20MB`（`agent/src/server/workspace.ts:11`），
而 **claw 的 `harvestSession` 没有任何大小预筛**（对比 `scidraw/artifact.go:295`、
`statlab/artifact.go:295` 都有 `e.Size > maxArtifactBytes → 跳过 + warn`）。
⇒ 一轮产出 3 个 15MB 的 docx，claw 会在一个 10s 的 GET 里尝试把 45MB 经 base64 拉进 Go 堆再推 MinIO。

### 2.3 N+1 与重复 IO

`harvestFile` 每个条目先 `GetByDedup`（`artifact_harvest.go:73`）→ 一次 DB 往返；
`harvestSession` 开头还无条件 `readArtifactManifest`（`:43` → `artifact.go:82`），
即使 99% 会话没有 manifest 也每次多一次 agent round-trip。
`harvestDir` 更重：**目录没有轻量签名，每轮重建 zip**（`artifact_harvest.go:85-86` 注释自陈），
即整棵目录 raw 读 + 打包，只靠 sha256 挡住 MinIO 重传。

### 2.4 boltslides / sci_draw 还有每 2.5s 轮询

`ConversationWorkspace.tsx:173-185`：`revealWhileBusy = inlineFigures || autoOpenLatest`，
生成期间每 2500ms invalidate 一次 artifacts。
配置在 `ClawPage.tsx:86`（boltslides `autoOpenLatestArtifact: true`）与 `:109`（sci_draw `figuresInline: true`）。
⇒ 那两个 feature 在**每轮生成过程中每 2.5 秒跑一次完整 harvest**。
（claw / stat_lab 无此配置，只在轮末刷一次。）

---

## 三、两条链路的不一致清单（这是新架构最该修的地方）

### 3.1 真源分别是谁

- **帧**的真源：executor 对 `./out/` 顶层 **+ 会话根可交付扩展名文件**做的 snapshot/diff
  （`agent/src/turn/artifacts.ts:98-125`，根扫描见 `:128-172`）。
- **列表**的真源：backend 对 **`./out/` 顶层**的一次 `ListWorkspaceFiles`
  （`artifact_harvest.go:35`）+ **`agent_artifacts` 表的历史累积**。

两者面不同、时刻不同、留存策略不同，因此下面每一条都是真实可发生的分叉。

### 3.2 逐条不一致

| # | 场景 | 帧 | 列表 | 用户看到 |
|---|---|---|---|---|
| 1 | 轮以 error 终止（round_cap / budget / upstream / empty_turn / 用户 stop） | ❌ 不发（`turnLoop.ts:955` 被 `!terminalSent` 守；`:960-977` 只跑交付闸不发帧） | ✅ 下次 GET 收割到 | 对话流**没有卡片**，面板里却有文件 |
| 2 | 一轮产出 > 20 个交付物 | ❌ 截断到 20（`artifacts.ts:46,345-348`） | ✅ 全部收割 | 对话流少卡，面板全有 |
| 3 | 交付闸隔离了文件 | ❌ 不发（`artifacts.ts:368-374`） | ✅/❌ 取决于闸是否物理移出 `out/`（`artifacts.ts:361-362` 说 enforce 档才移） | 非 enforce 档下：**没卡片但能下载**（闸失效） |
| 4 | 上一轮已交付、本轮未变的文件 | ❌ 不进 diff | ✅ 一直在列表里 | 正常（列表是累积视图） |
| 5 | agent 中途删掉 `out/` 里的文件 | ❌ | ✅ **旧行仍在、仍可下载**（upsert-only） | 面板里有一个「已经不存在」的文件 |
| 6 | 目录产物（`out/proj/`） | ✅ 发 `kind:"dir"`（`artifacts.ts:110-112,194`） | claw ✅ 打 zip（`artifact_harvest.go:53-55`）；**boltslides / sci_draw / stat_lab ❌ 直接 `continue`**（`boltslides/artifact.go:299` · `scidraw/artifact.go:288` · `statlab/artifact.go:289`） | 那三个 feature：卡片出现但**没有 id、也没有 `.zip` 路由**（路由表里只有 claw 有 `artifact.zip`，`routes_user.go:335`）→ 死卡片 |
| 7 | storage 未启用 | ✅ 照发 | 走 `listArtifactsLive`，**二进制被主动过滤掉**（`artifact.go:161-168,252`） | 卡片在，面板里没有该项，点下载 404 |
| 8 | harvest 部分失败（超时/agent 抖动） | ✅ | 部分缺失，**只在整体失败时打一条 warn**（`artifact.go:207`），单文件失败零日志（`artifact_harvest.go:79-81`） | 卡片有 id 缺失 → 前端回落 path 直读 → 二进制 404 |
| 9 | 会话 workdir 被 30 天 GC | ✅ 历史帧仍在 journal（回放能重建卡片） | `tree.State=missing` → 保留旧行 → **能下载** | 这一条**是好的**：MinIO 兜住了 |
| 10 | 用户从没打开过该会话页，workdir 先被 GC | ✅ 帧在 journal（历史回放有卡） | ❌ 从未收割 → 无行 | 卡片在、点了 404（`DownloadSessionArtifact` 读 live 文件 → missing） |

**第 1 条和第 10 条是「看不到 / 点不开」的主因。**
第 1 条尤其致命：`MessageTurn.tsx:75` 明写 `if (!turn.artifacts || turn.artifacts.length === 0) return []`
—— 对话流里的产物卡**完全不查 DTO 列表**，DTO 只用来给已有的帧补 id/标题。

### 3.3 backend 收到 artifact 帧做了什么 —— 只入 journal

`hub.go:2086-2088`：

```go
case "artifact":
	// 产物带外声明:入 journal → 重连/刷新回放时产物随轮重建(payload 即原帧,replay 原样重发)。
	return EvArtifact, true
```

回放侧 `eventlog_store.go:512-528` 把 `EvArtifact` 折成一条 `Type=="artifact"` 的 SessionMessage。
**没有任何 upsert / MinIO 动作**。ws.go 的转发方向过滤只拦 backend-only 帧
（`ws.go:711-714`，仅 `seed_history` / `extract_memory`），agent→浏览器方向 artifact 帧原样透传。

---

## 四、鉴权、URL、生命周期

### 4.1 三条对外 URL

| 路由 | 鉴权 | 返回 | 备注 |
|---|---|---|---|
| `GET /user/claw/session/artifacts?session_id=` | `UserAuthMiddleware` + `OwnsSession`（`artifact.go:181-189`） | DTO 列表 | 顺带触发 harvest |
| `GET /user/claw/artifact/:id` | `UserAuthMiddleware` + **行自带 `OwnerID` 比对**（`artifact.go:292-295`） | MinIO 字节，`attachment` + `nosniff` | 越权回 404 防枚举 |
| `GET /user/claw/session/artifact?path=out/x` | `OwnsSession` + `artifactRelPath`（`artifact.go:124-139`） | 实时回读，text/plain 或光栅图 | storage 未启用时的回退 |
| `GET /user/claw/session/artifact.zip?dir=out/x` | 同上 | 现打 zip | **只有 claw 有** |

路由注册：`backend/cmd/server/routes_user.go:332-335`（claw）、`:361-363`（boltslides）、
`:380-382`（sci_draw）、`:399-401`（stat_lab）。

**URL 是永久有效的**（不是 presigned、没有过期），凭 cookie/Bearer 鉴权，
只要行还在、用户还是那个人就一直能取。没有 presign、没有分享 token、没有匿名访问。

### 4.2 ⚠️ claw 的 `DownloadArtifactByID` 缺 `feature_key` 校验

`artifact.go:283-295` 只校验 `row.OwnerID`；而后加的三个镜像都补了：
`boltslides/artifact.go:207` · `scidraw/artifact.go:196` · `statlab/artifact.go:197`
（`if row.FeatureKey != FeatureKey { 404 }`）。
影响范围有限（只能取**自己**的产物），但语义上 `/claw/artifact/:id` 现在能取到自己 stat_lab 的三线表。
属于「镜像漂移」，新架构做统一层时应一次收口。

### 4.3 会话删除 / 重置 → 清 MinIO：**清了，但有三个逃逸口**

清理路径：`cleanupArtifacts`（`artifact_harvest.go:151-161`）
→ `DeleteBySession` 先查 `storage_key` 再删行（`repository.go:73-85`）
→ `storage.DeleteObjects`（`artifact_harvest.go:167-169`，失败只 slog.Error）。

逃逸口：

1. **`storage.IsEnabled()` 为 false 时整个函数直接 return**（`artifact_harvest.go:152`）。
   如果 MinIO 曾经启用过、后来配置被摘掉，那批对象永远没人删。
2. **删用户不删产物**。`user/repository.go:486-488` 的注释自陈：
   > ⚠️ 仍未清理（留作后续决策）：peer_review_* / prism_* / user_staging_* 及其对象键、
   > `agent_sessions` 映射与 agent 容器内 jsonl。
   `agent_artifacts` 连提都没提，且表上无 FK（`0025:41-43`）。
   ⇒ **注销用户后，他的全部交付物（含可能的敏感数据/PHI）留在 MinIO 与 MySQL 里，无人可删。**
3. **失败只记日志**。DB 行删了但 MinIO 删失败 → 对象成为无引用孤儿，**没有任何 reaper**
   （对比 library 的 PDF 有「孤儿对账 reaper」的说法，见 `user/repository.go:483-484`）。

### 4.4 30 天 workdir GC 与 MinIO 的关系 —— **两套完全独立的时钟**

- agent 侧：`EXECUTOR_WORKDIR_TTL_DAYS` 默认 30 天，6 小时扫一次
  （`agent/src/server/sessions.ts:455-456`，实现 `:476-540`）。删的是 workdir + `.skills` + `.active`。
- MinIO 侧：**无 TTL**（`storage.go:147-151` 只 ensureBucket）。

因此：

| 时刻 | agent 磁盘 | MinIO / DB |
|---|---|---|
| T+0 收割过 | 有 | 有 |
| T+31d（GC 后） | **没了** | 有 → 下载正常 |
| 从未收割 + T+31d | 没了 | **没有** → 永久丢失 |

也就是说 **MinIO 是唯一耐久层，但它的填充完全依赖「有人在 30 天内打开过那个会话」**。
这是整套设计里最脆的一根线。

补一条运维事实：dev 的 `./data/agent-sessions:/home/bun/sessions` 挂载曾丢失两个月、
2026-08-06 才补回（`docker-compose.yml:434-448` 的长注释）。在那期间 dev 每次
`up -d --build` 都等于把所有未收割产物一次性清空。

---

## 五、目录产物的 zip 打包路径

只有 claw 有，两个入口：

**A. 收割时（落 MinIO，kind=dir）** —— `artifact_harvest.go:87-106`
`collectDirForZip` → `zip.Writer` → `upsertArtifact(mime="application/zip", kind="dir")`，
key 额外加 `.zip` 后缀（`:115-117`）；文件名在下载时补 `.zip`（`artifact.go:311-313`）。

**B. 实时打包下载** —— `artifact.go:467-517`，路由 `GET /claw/session/artifact.zip`。

共用的收集器 `collectDirForZip`（`artifact.go:412-461`）限额：

```go
maxZipFiles        = 50               // artifact.go:398
maxZipDepth        = 4                // :399
maxZipPerFileBytes = 5 * 1024 * 1024  // :400
maxZipTotalBytes   = 30 * 1024 * 1024 // :401
artifactZipTimeout = 30 * time.Second // :397
```

**超限的文件被静默跳过**（`:443-451` 只 `skipped++`，而 `skipped` 在两个调用点都被丢弃：
`artifact.go:487` 用 `_`、`artifact_harvest.go:88` 用 `_`）
⇒ **用户会拿到一个悄悄少了文件的 zip，没有任何提示**。这是个真 bug。

另外 `collectDirForZip` 是**逐文件一次 agent HTTP round-trip**（`:442`），
50 个文件 = 50 次往返，在 30s（B 路径）或 10s（A 路径，继承 `artifactListTimeout`）里做完。
A 路径的 10s 预算对 50 文件目录基本不可能完成 ⇒ **目录产物在 harvest 阶段大概率半途而废**，
而 `harvestDir` 遇到 `err != nil` 直接 return（`artifact_harvest.go:89`），**连部分结果都不留**。

---

## 六、backend 返回空列表 / 404 而 agent 侧其实有文件 —— 逐条

### 6.1 列表返回空 `{"items":[],"total":0}`

| # | 条件 | 代码 |
|---|---|---|
| E1 | agent 返回 4xx 或 `ErrSessionNotFound`（会话 id 非法格式等） | `artifact.go:202-205` |
| E2 | storage 已启用但 `harvestSession` 首次跑在「workdir 已被 GC / 容器重建」之后 → `tree.State != "ok"` → return nil，而 DB 里从来没有行 | `artifact_harvest.go:39-42` + `artifact.go:209` |
| E3 | harvest 非 4xx 失败（agent 不可达/超时）且 DB 无历史行 → 打一条 warn 后返回 DB 的空结果 | `artifact.go:206-208` |
| E4 | storage 未启用 + 产物全是二进制（pdf/docx/xlsx/pptx/zip）→ `liveServableFile` 全过滤掉 | `artifact.go:161-168` + `:252` |
| E5 | 产物写在 `out/` 的**子目录里**且该 feature 不是 claw → 目录被 `continue` 跳过 | `boltslides/artifact.go:299` · `scidraw/artifact.go:288` · `statlab/artifact.go:289` |
| E6 | 产物写在会话根、扩展名不在 executor 的 `DELIVERABLE_EXTS` 内（`.png/.jpg/.txt/.json/.zip/.py/.tex` 等） → executor 的根扫描不收 → 不 relocate 进 `out/` → backend 永远看不到 | `agent/src/turn/artifacts.ts:24` |
| E7 | 产物写在会话根、但落在 `DEEP_SKIP_DIRS`（`src/ public/ dist/ tmp/ cache/ build/ vendor/ data 下的 venv…`）里 | `agent/src/turn/artifacts.ts:32-35` |
| E8 | 根扫描预算耗尽（>400 文件 或 >2000 目录）→ 快照按 readdir 顺序截断 | `agent/src/turn/artifacts.ts:39-42,163-171` |
| E9 | 产物名以 `.` 开头，或叫 `manifest.json` | `artifact.go:151-156`、`artifact_harvest.go:45,57` |
| E10 | 产物落在 `evidence/` / `analysis/` 引擎保留区 | `agent/src/turn/artifacts.ts:242-243`（不作为 stray 上抛）；backend 只看 `out/`，`statlab/artifact.go:39` 明说 analysis 刻意不在交付目录 |
| E11 | 10s 预算内 harvest 没跑完 → 后半段文件本次不入库（下次 GET 才补） | `artifact.go:191` + `artifact_harvest.go:79-81` |
| E12 | 单文件 > 20MB（agent RAW_CAP）→ `state=too_large` → `harvestFile` 静默 return | `agent/src/server/workspace.ts:11,157` + `artifact_harvest.go:79-81` |
| E13 | sci_draw / stat_lab：单文件 > 16MB → 收割前就被跳过（有 warn） | `scidraw/artifact.go:295` · `statlab/artifact.go:295` |
| E14 | 目录产物在 harvest 阶段 `collectDirForZip` 报错（超时/agent 4xx）→ `harvestDir` 直接 return，无行、无日志 | `artifact_harvest.go:89` |

### 6.2 下载 404

| # | 条件 | 代码 |
|---|---|---|
| D1 | `DownloadArtifactByID`：storage 未启用 → 「产物不可用」 | `artifact.go:274-277` |
| D2 | 行不在 / OwnerID 不匹配 | `artifact.go:285-295` |
| D3 | MinIO GetObject 失败（对象被手工删/桶改名/凭证变更）→ 「产物已失效」 | `artifact.go:299-302` |
| D4 | 实时回退：路径不是严格的 `out/<basename>`（**嵌套子目录 `out/a/b.md` 一律拒**） | `artifact.go:124-139`，测试 `artifact_test.go:34,103` |
| D5 | 实时回退：文件 > 12MB | `artifact.go:362-365`（`maxArtifactBytes` `:54`） |
| D6 | 实时回退：`previewType` 既非 text 也非 image（一切二进制） | `artifact.go:391-393` |
| D7 | 实时回退：图片是 SVG 或其它非白名单光栅格式 | `artifact.go:383-386` + `file.go:42-48` |
| D8 | zip：目录空 / 全部文件超限被跳过 | `artifact.go:496-499` |
| D9 | zip：`artifactRelPath` 拒（同 D4） | `artifact.go:470-474` |

### 6.3 结构性盲区（不在上面两张表里，但同样是「有文件却拿不到」）

- **窄屏 (`isNarrow`) 下产物面板整体不渲染**：`ConversationWorkspace.tsx:223`
  `rightPanelAvailable = !inlineFigures && !isNarrow`。窄屏只剩 Sheet 预览，
  而 Sheet 只能从对话流的产物卡点开 → **帧没发 = 移动端零入口**。
- **sci_draw 的 `figuresInline: true`**（`ClawPage.tsx:109`）永久关闭右侧面板
  （`ConversationWorkspace.tsx:223`），且 `MessageTurn.tsx:348-351` 只内联展示图、
  **非图产物直接不展示** ⇒ sci_draw 会话里如果 agent 顺手写了个 `.md` 说明，用户永远看不到。

---

## 七、文件版本 —— **不存在**

三层都没有版本概念：

1. **DB**：`dedup_anchor = sha256(session||relPath)` 是 UNIQUE（`0025:41`），
   一个 (会话,路径) 只能有一行；`Upsert` 原地改（`repository.go:26-34`）。
   `content_sha256` 只用来判「要不要重传」（`artifact_harvest.go:118`），**不参与主键**。
2. **MinIO**：key 是 `claw/<ownerID>/<sessionID>/out/<name>`（`artifact_harvest.go:173-175`），
   同名覆盖。`ensureBucket`（`storage.go:176-185`）**没有开 versioning**，
   `PutObject` 也没带任何版本参数。⇒ 第二次 PUT 物理覆盖第一次。
3. **前端**：`useAgentArtifactBytes` 的 queryKey 是 `[feature,'artifact-bytes', id]`
   （`api/artifacts.ts:127`），`staleTime: 5min` —— 内容变了 id 不变，
   **浏览器还会拿 5 分钟的旧字节**（除非 invalidate；artifacts 列表的 invalidate 不影响这个 key）。

**唯一「像版本」的东西是个 bug**：模型把交付物写在会话根而不是 `out/` 时，
executor 的 `relocateStrays` 会在 `out/` 里已有同名文件时**加数字后缀**：

```ts
for (let i = 2; (await occupied(name)) && i < 50; i++) name = `${stem}-${i}${ext}`;
```
（`agent/src/turn/artifacts.ts:270-273`，`taken` 用**当前快照的全部 out/ 键**播种，见 `:252-253`）

⇒ 用户说「把这份报告改一下」，模型 `Write("报告.docx")` 写到根 →
第一次 `out/报告.docx`、第二次 `out/报告-2.docx`、第三次 `out/报告-3.docx`。
harvest upsert-only 不回收（`artifact_harvest.go:29`），`ListBySession` 按 `created_at ASC` 排
（`repository.go:65-66`）⇒ **面板里第一个就是最旧的那份**。

**这就是「编辑文件容易出现错误、修改不到」的机制性解释**：
用户点开的是排在最前面的旧版本，而模型确实改了 —— 只是改出了一份新文件。

反之，如果模型规规矩矩 `Edit("out/报告.docx")`，则 relPath 不变 → 同一行 upsert → 同一个 MinIO key
→ 用户看到内容变了、id 不变。**行为完全取决于模型把文件写在哪里**，backend 无从纠正。

---

## 八、四个 feature 的镜像漂移清单

`grep -rn "artifact" backend/internal -l` 命中 4 份近乎复制的实现：
`claw/artifact.go`(518行) + `claw/artifact_harvest.go`(176行) ·
`boltslides/artifact.go`(381) · `scidraw/artifact.go`(372) · `statlab/artifact.go`(376)。

`agentartifact/delivery.go:14-25` 记录了当年**刻意不抽象**的决定（「为单一消费者过早抽象」），
但那是 claw 还是唯一消费者时写的 —— 现在有 4 个，漂移已经发生：

| 能力 | claw | boltslides | sci_draw | stat_lab |
|---|---|---|---|---|
| `feature_key` 越权校验 | ❌ 缺 | ✅ `:207` | ✅ `:196` | ✅ `:197` |
| 目录产物 → zip | ✅ | ❌ | ❌ | ❌ |
| `.zip` 下载路由 | ✅ `routes_user.go:335` | ❌ | ❌ | ❌ |
| `manifest.json` 标题 | ✅ `artifact.go:81-120` | 需复核 | ❌（无 meta 参数） | ❌ |
| 收割前大小预筛 | ❌ | 需复核 | ✅ `:295` | ✅ `:295` |
| 实时回退支持图片 | ✅ `artifact.go:372-387` | — | 只 text | 只 text |
| 下载超时豁免 | ✅（`timeout.go:57` 含 `/claw/artifact/`） | ❌ | ❌ | ❌ |

最后一行是**真 bug**：`middleware/timeout.go:48-63` 的 `isObjectServePath` 白名单里只有
`"/claw/artifact/"` 和 `"/claw/session/artifact"`，
`/boltslides/artifact/:id`、`/sci_draw/artifact/:id`、`/stat_lab/artifact/:id`
都落到 else 分支的 **15s GET 超时**（`timeout.go:89`）。
boltslides 的产物是单文件 HTML deck（可以到十几 MB）、stat_lab 是 docx ——
**弱网/大文件下会被 ctx 掐断，流成一个坏文件**。
这正是当年给 claw 补白名单的原因（`timeout.go:54-56` 的注释复述了那次事故），
镜像时没跟着复制。

---

## 九、给新架构的取证结论（不含方案，只列约束）

1. **收割必须脱离 HTTP GET**。今天 `GetSessionArtifacts` 里同步做 IO 是所有静默丢失的根。
   轮末事件（`message_complete` **和 error 终帧**）是天然的触发点，而且 hub 已经在那里
   （`hub.go:1540-1545` 附近处理终帧）。2026-07 设计的 `OnArtifact` 钩子就是这个思路，只是没落地。

2. **帧和列表必须共用一个真源**。现状是「帧 = 本轮 diff」「列表 = 目录 + 历史累积」两套。
   任何统一方案都要先决定：产物是**轮级事实**还是**会话级状态**。
   前端 `mergeTurnArtifacts`（`MessageTurn.tsx:74`）今天假设前者，面板假设后者。

3. **`out/` 单一真源是个已被证伪的假设**。executor 已经被迫加了根扫描 + relocate
   （`agent/src/turn/artifacts.ts:21-23,209-224` 的长注释就是这场败仗的记录），
   而 relocate 的改名副作用直接造成了「改不到」。
   新架构要么让 backend 认多路径（放弃 `artifactRelPath` 的 `out/<basename>` 硬约束），
   要么给模型一个**显式的交付动作**（工具调用）而不是「写对目录」这种隐式约定。

4. **需要一个真的 GC**。MinIO 无 TTL + upsert-only + 删用户不删产物 = 单调增长。
   至少要有：会话级 TTL（对齐 agent 的 30 天）、删用户级联、孤儿对账。

5. **版本是缺的，而且用户已经在用「-2 后缀」当版本用**。要么正式支持版本
   （`dedup_anchor` 加内容维度 / MinIO 开 versioning），要么明确「同名即覆盖」并让
   relocate 停止改名。**现状是两者最坏的组合**。

6. **移动端零入口**必须单独解。今天窄屏完全依赖帧，而帧在错误轮不发。

7. **路径卫生的出口清洗覆盖不到实际泄漏形态**。
   `strip-container-paths.ts:14,16` 只认 `./out/x` 和 `/home/...`；
   模型最常说的「输出到 out 目录下」「见 `out/report.md`」都不在覆盖内
   （第 9-10 行注释自陈刻意不碰裸 `out/`，理由是怕撞 `checkout/`）。
   要么换成「产物名白名单驱动的替换」（用当前会话的 artifact 名单去匹配，就没有歧义了），
   要么在 prompt 之外加一道**基于产物清单的重写**。

---

## 附：本次取证读过的文件

**backend**
- `internal/claw/artifact.go` · `artifact_harvest.go` · `artifact_test.go` · `file.go` · `handler.go` · `render.go` · `spec.go`
- `internal/agentartifact/model.go` · `repository.go` · `delivery.go`
- `internal/agentbridge/hub.go`(2020-2140) · `eventlog.go` · `eventlog_store.go`(495-560) · `ws.go`(300-500, 690-780)
- `internal/agent/client.go`(300-500) · `executor.go`(60-63)
- `internal/storage/storage.go`(1-270)
- `internal/statlab/artifact.go` · `internal/scidraw/artifact.go`(1-60, 270-340) · `internal/boltslides/artifact.go`(grep)
- `internal/common/middleware/timeout.go`(30-98)
- `internal/user/repository.go`(470-530)
- `internal/prompts/claw.go`(grep 113-138)
- `cmd/server/routes_user.go`(315-410) · `cmd/server/bootstrap.go`(grep 740-746)
- `internal/common/config/config.go`(232-238)

**migrations**
- `0025_agent_artifacts.sql` · `0026_agent_artifacts_sig.sql` · `0078_agent_artifacts_user_edited.sql`

**agent（跨界，为回答链路一致性）**
- `src/turn/artifacts.ts`(全文) · `src/turn/turnLoop.ts`(940-1010, grep) · `src/server/workspace.ts`(1-254) · `src/server/sessions.ts`(300-330, 446-540) · `src/server/http.ts`(330-400)

**frontend（跨界，为定位「看不到」的落点）**
- `features/claw/api/artifacts.ts` · `components/chat/ConversationWorkspace.tsx`(160-240, 490-520) ·
  `components/chat/MessageTurn.tsx`(55-120, 280-360) · `hooks/makeAgentConversationHook.ts`(355-375) ·
  `pages/ClawPage.tsx`(50-120) · `shared/lib/strip-container-paths.ts`

**其它**
- `docs/research/artifact-delivery-2026-07/DESIGN.md`
- `docker-compose.yml`(250-470) · `docker-compose.prod.yml`(grep MINIO)
