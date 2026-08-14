# 输入框附件耐久化实施方案(MinIO 为真源 + cwd 为工作副本)

> 2026-08-07 · 依据 [01-uploads.md](01-uploads.md) 与 [MAP.md](MAP.md) 的取证,不重新调查。
> 目标(用户原话):**文件类型的数据一律进 MinIO,业务/会话数据一律进 DB**。
> 本方案只动**输入框附件(agentattach)**这一条链路 —— 它是全系统唯一还不满足该目标的一类数据。

---

## 〇 · 开工前必须先认的三件事

**1. 只有一个缺口,别扩面。**
产出文件(`agent_artifacts` + MinIO)与会话历史(`agent_turns` / `agent_turn_events`)**已经满足目标**,
本方案**一行都不碰**。缺口只有输入框附件:字节只落 executor 会话 cwd
(`/home/bun/sessions/<sid>/<uuid>-<原名>`,宿主 `./data/agent-sessions`),
**零 DB 行、零 MinIO 对象**,30 天 workdir GC 一到永久消失,而它在 journal 里折成的
`@"绝对路径"` 文本却是永久的 ⇒ 幽灵 chip。

**2. 禁区(用户明确交代,踩了就是误伤)。**

| 禁区 | 为什么 |
|---|---|
| `backend/internal/library/**` · `frontend-user/src/features/claw/../library/**` | 用户刚改过文献集 PDF 上传,7 个文件未提交。library 的 PDF **本来就走 MinIO**,不在范围内。本方案只**照抄它的风格**(`objectKeyForPaper` / `storage.ServeObject` / 孤儿 reaper),不改它一个字符 |
| `agent_artifacts` / `agent/src/turn/artifacts.ts` / 四份 `artifact.go` | 已符合目标 |
| 线上数据 / 改既有行的迁移 | 迁移只允许 `CREATE TABLE IF NOT EXISTS` + `CALL add_*_if_not_exists`,禁 `DROP` |

**3. 这套方案不解决备份缺失。**
MinIO 与 MySQL 与会话工作区**在同一块无备份的盘上**(MAP §四 B-1:生产 `crontab -l` 只有
`security_monitor.sh`,`backups/` 目录都不存在)。本方案把附件从「1 份磁盘副本」变成
「2 份同盘副本」,**抗 GC / 抗删会话 / 抗换 sid,不抗磁盘故障**。
装备份仍然是优先级更高的独立事项,别因为这套上线了就以为附件安全了。

---

## 一 · 目标状态一句话

```
MinIO 对象(耐久真源,永久)  ──┐
                              ├── 同一份字节
会话 cwd 文件(工作副本,可丢) ─┘        ↑ 丢了能从 MinIO 自愈重建
MySQL agent_attachments 行(身份 + 元数据 + 归属 + 生命周期)
```

三条不变式:

1. **cwd 里必须仍有一份真实文件** —— agent 的 `Read`/`Bash`/vision 内嵌读的是磁盘,MinIO 替代不了。
2. **落盘名 `<uuid>-<原名>` 不可改** —— 前端历史剥离器 `agent-history.ts:407 STORED_UUID_PREFIX` 依赖它。
   本方案反过来**把这个 UUID 升格为附件的持久身份**:journal 里那条 `@"…/<uuid>-a.pdf"` 是永久的,
   于是**存量 journal 不用改一个字节,就能反查到新表里的行**。这是整个设计的支点。
3. **agent 容器零改动**(Phase 0-3 全部 backend + frontend)。自愈用现成的 `PutWorkspaceFile`,
   删除用现成的 `DeleteWorkspaceFile`(全仓零调用方的死代码,终于有了调用方),
   探测用现成的 `ListWorkspaceFiles`。

---

## ① 新表 schema 与迁移文件

迁移编号接在现有最大号 `0111_agent_sessions_statlab_multi.sql` 之后:

- `docker/mysql/migrations/0112_agent_attachments_fields.sql`(建表,只含字段 + 主键)
- `docker/mysql/migrations/0113_agent_attachments_indexes.sql`(索引 + 外键)

### 0112 · 建表

```sql
-- ============================================================================
-- 0112 · agent_attachments —— 输入框上传附件的耐久元数据(字节存 MinIO)
--
-- 背景:此前上传附件字节**只在 executor 会话 cwd**,无 DB 行、无 MinIO 对象,
-- 30 天 workdir GC 即永久消失;而 journal 里折进 user_message 的 @"绝对路径"
-- 文本永不过期 ⇒ 老会话里 chip 还在、点开必 404(幽灵 chip)。
--
-- 本表 + MinIO(bucket=scholar-agent-attachments)让附件与「AI 产出」同级耐久:
--   MinIO = 耐久真源 · 会话 cwd = 可重建的工作副本 · 本表 = 身份/归属/生命周期。
--
-- 身份键是 attachment_uuid —— 即落盘名 <uuid>-<原名> 里那个 UUID。它已经写在
-- 存量 journal 的 @"path" 里且永不过期,故按它反查可以让**存量历史零迁移地自愈**。
-- ============================================================================

CREATE TABLE IF NOT EXISTS `agent_attachments` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `attachment_uuid` CHAR(36)        NOT NULL                   COMMENT '落盘名 <uuid>-<原名> 的 uuid;历史 @"path" 唯一可反查的身份',
  `user_id`         BIGINT UNSIGNED NOT NULL                   COMMENT '上传者(始终是已鉴权的自然人,与 agent_sessions 的 owner_kind 口径刻意不同,见下)',
  `feature_key`     VARCHAR(64)     NOT NULL DEFAULT ''        COMMENT 'claw / smart_search / stat_lab / prism …',
  `session_id`      VARCHAR(191)    NOT NULL                   COMMENT '该副本所属 agent 会话',
  `stored_name`     VARCHAR(320)    NOT NULL                   COMMENT '<uuid>-<原名>(落盘名,不含目录)',
  `rel_path`        VARCHAR(512)    NOT NULL                   COMMENT '相对会话 cwd:<stored_name> 或 uploads/<stored_name>',
  `filename`        VARCHAR(255)    NOT NULL                   COMMENT '展示原名(AttachmentDTO.Name)',
  `att_type`        VARCHAR(16)     NOT NULL DEFAULT 'file'    COMMENT 'image | file,与 AttachmentDTO.Type 同口径',
  `mime`            VARCHAR(160)    NOT NULL DEFAULT ''        COMMENT '归一后的 MIME(AttachmentDTO.MimeType)',
  `size_bytes`      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `content_sha256`  CHAR(64)        NOT NULL DEFAULT ''        COMMENT '内容 sha256:MinIO key 的内容寻址部分 + 自愈完整性校验',
  `storage_key`     VARCHAR(640)    NOT NULL DEFAULT ''        COMMENT 'MinIO 对象 key = att/<user_id>/<sha256>',
  `origin_id`       BIGINT UNSIGNED NOT NULL DEFAULT 0         COMMENT '跨会话物化副本指向源行 id;0 = 原生上传',
  `materialized_at` DATETIME        NULL                       COMMENT 'cwd 副本最近一次被确认存在;NULL = 当前 cwd 无副本(GC/未落盘)',
  `deleted_at`      DATETIME        NULL                       COMMENT '软删(用户主动删除)。取回端点据此回"已删除"语义而非裸 404',
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='agent 输入框附件元数据(字节存 MinIO,cwd 副本可重建)';
```

**几个刻意的选择(评审会问的都在这)**

- **为什么用 `user_id` 而不是 `agent_artifacts` 的 `owner_kind`/`owner_id`?**
  产物的归属继承会话(prism 是 `owner_kind=project`),而附件**永远是某个已鉴权自然人上传的** ——
  四个上传端点全挂在 `userProtected` / `prismG` 下,handler 里 `c.GetUint("user_id")` 恒有值。
  单一 `user_id` 换来两件东西:① 可以挂 `ON DELETE CASCADE` 外键(见 ⑧);② 配额与「我的文件」都是
  per-user 的一次索引扫描。代价:prism 的 project 维度要靠 `session_id` 反查 —— 附件场景不需要按项目聚合。
- **为什么一个附件在 N 个会话里是 N 行,而不是一行 + 关联表?**
  删会话 / 会话配额 / cwd 物化状态(`materialized_at`)全是**per-session** 的属性;
  关联表会把这三件事都变成 join。N 行的冗余只有元数据(几百字节),字节靠内容寻址天然只有 1 份(见 ②)。
- **`deleted_at` 软删是必需的,不是洁癖。** 今天用户看到的是「无解释的裂图」;
  有了这一列,取回端点才能区分**从未存在 / 已被用户删除 / 会话已删**三种情况,给出语义化提示。

### 0113 · 索引与外键

```sql
-- uk_session_uuid:一个附件在一个会话里只能有一行(原生上传 + 跨会话物化共用这条唯一键,
--   物化的幂等性从"列目录比同名同大小"升级成 DB 层的 INSERT ... ON DUPLICATE KEY)。
CALL add_index_if_not_exists('agent_attachments', 'uk_agent_att_session_uuid',
  '`session_id`, `attachment_uuid`', TRUE);

-- idx_uuid:取回端点的唯一入口(前端从 @"path" 的 basename 里剥出 uuid 来查)。
CALL add_index_if_not_exists('agent_attachments', 'idx_agent_att_uuid', '`attachment_uuid`', FALSE);

-- idx_user_sha:① 上传去重(同一用户传过同样的字节 → 复用对象,跳过 PUT)
--               ② 删除时的引用计数(还有没有别的行指着这个对象)。
CALL add_index_if_not_exists('agent_attachments', 'idx_agent_att_user_sha',
  '`user_id`, `content_sha256`', FALSE);

-- idx_user_created:「我的文件」列表 + per-user 配额求和。
CALL add_index_if_not_exists('agent_attachments', 'idx_agent_att_user_created',
  '`user_id`, `created_at`', FALSE);

-- idx_session:删会话 / 重置会话时按会话清行。
CALL add_index_if_not_exists('agent_attachments', 'idx_agent_att_session', '`session_id`', FALSE);

-- ── 外键 ON DELETE CASCADE(与 0104 user_quota_windows 同款范式)───────────────
-- 用户是硬删的(user/repository.go tx.Delete(&User{})),没有外键就会留下孤儿行,
-- 且孤儿行会让「删用户没清 agent 数据」这个既有合规缺口再多一张表。
-- ⚠️ 加约束前先清孤儿:本迁移每次启动都重放,一次 ADD CONSTRAINT 失败 = 每次启动都失败。
DELETE a FROM agent_attachments a
  LEFT JOIN users u ON u.id = a.user_id
  WHERE u.id IS NULL;

CALL add_foreign_key_if_not_exists('agent_attachments', 'fk_agent_att_user',
  'FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE');
```

> 索引长度核算:`uk_agent_att_session_uuid` = `varchar(191) utf8mb4`(764B)+ `char(36)`(144B)= 908B,
> 远低于 DYNAMIC 行格式的 3072B 上限。

### Go 侧(新包 `backend/internal/agentattachstore/`)

抄 `internal/agentartifact/` 的三件套形状:`model.go`(GORM 结构 + `TableName()`)、
`repository.go`(Repository→Service→Handler 的最底层)、`delivery.go`(接口 seam,可选)。
**不放进 `agentattach` 包**:那个包目前零 DB 依赖(不 import gorm),混进去会让它的单测被迫起库;
`agentattach` 通过一个窄接口依赖 store(与 `AttachmentRelocator` 同款鸭子类型)。

Repository 方法(全部按 user_id 收窄,越权一律当不存在):

```go
UpsertOnUpload(a *Attachment) error                              // ON CONFLICT uk_session_uuid 更新元数据列
GetByUUID(uuid string, userID uint64) (*Attachment, error)       // 取回端点:多行取 id 最小的一行(字节相同)
GetByID(id uint64, userID uint64) (*Attachment, error)
ListBySession(sessionID string, userID uint64) ([]Attachment, error)
SumBytesByUser(userID uint64) (int64, error)                     // 配额:DISTINCT content_sha256 求和
CountRefs(userID uint64, sha string, excludeID uint64) (int64, error) // 删对象前的引用计数
SoftDelete(id uint64, userID uint64) error
DeleteBySession(sessionID string) ([]Attachment, error)          // 返回行供调用方算 refcount 再删对象
MarkMaterialized(id uint64, at *time.Time) error
```

---

## ② MinIO bucket 与 key 规则

| 项 | 值 |
|---|---|
| bucket | `scholar-agent-attachments` |
| 配置项 | `config.go` 加 `BucketAgentAttachments`,env `MINIO_BUCKET_AGENT_ATTACHMENTS`,默认同名 |
| 建桶 | `storage.Init` 里 `ensureBucket`,**不挂 lifecycle** |
| key | **`att/<user_id>/<content_sha256>`** |

### 为什么是内容寻址(sha256),而不是路径派生

路径派生(照抄产物的 `<feature>/<owner>/<session>/<relpath>`)在这条链路上有三个具体的坏处:

1. **跨会话复用会把磁盘上的 N+1 份冗余原样搬进 MinIO。** 今天 `EnsureLocal` 是复制不是移动
   (01 §六),一个附件被 N 个会话引用就是 N+1 份字节。内容寻址下这 N+1 行**指向同一个对象**,
   MinIO 只存 1 份。
2. **同名覆盖无版本。** `agent_artifacts` 就是路径派生,后果是「同名再交付覆盖同一 key」(MAP §1.1 C1)。
   附件带 UUID 前缀本不会同名,但 key 里嵌 sessionID 意味着 relocate 必须重新 PUT 一次。
3. **自愈时的完整性校验白得。** 从 MinIO 拉回 cwd 时重算 sha256 对比 key 本身即可,不需要额外字段。

### 为什么按 user 分片而不是全局内容寻址

全局 `att/<sha256>` 能跨用户去重,但会引入两个不能接受的东西:
① **存在性预言机** —— A 用户传一份文件,若发现「秒传」就能推断出别的用户传过同一份文件
(在含 PHI 的 stat_lab 场景是真问题);② **删除权互锁** —— A 删号要清 A 的字节,但对象被 B 引用着,
删不掉;不删又不符合「删除权」。按 user 分片让删用户能像 library 那样一条
`ListObjectKeys(bucket, "att/<uid>/")` 全清(⑧),代价只是同一份文件被两个用户各存一份。

### 内容寻址的代价:删对象要引用计数

删一行时不能直接删对象。规则:

```
删 row → 同一事务后 CountRefs(user_id, sha, exclude=本行) == 0 → 才 DeleteObject
```

再叠一个**孤儿对账 reaper** 兜底(照抄 `cleanup/library_cleanup.go` 的 `reapOrphanPDFObjects`:
按前缀 `ListObjectInfos` → 用 `LastModified` 留 24h 安全线 → DB 反查 → 删无主对象)。
理由与那边一致:「先删行再删对象」的中间崩溃会造成无人可发现的永久孤儿,而 `agent_artifacts`
恰恰因为没有这个 reaper 已被列为 medium 风险(MAP §四)。

### 为什么不挂 lifecycle

附件是**用户的原始数据**,是本方案要保护的东西本身。回收只由三条显式路径触发:
用户主动删除、删会话、删用户(⑧)。桶级 ILM 会把这三条之外的语义偷偷加进来。
⚠️ 这条要在 `storage.go` 的 `ensureBucket` 调用处**写明注释** —— `scholar-agent-artifacts`
当年就是因为没写注释,今天没人分得清那是决策还是遗漏(MAP §1.3)。

---

## ③ 上传时序:先 MinIO,再 DB,最后 cwd

改的是 `agentattach/upload.go` 的 `pushToSession`(`parseAndValidateUpload` 与全部类型白名单**不动**)。

```
① parseAndValidateUpload            (不变:类型白名单 / 30MB / 5MB;body 已在内存)
② 解析并鉴权目标会话                 (不变:OwnsSession 或 resolveEmpty)
③ sha256(body)  +  attUUID = uuid.NewString()
   storedName = attUUID + "-" + filepath.Base(原名)      ← 口径不变,UUID 现在同时是 DB 身份键
④ per-user 附件配额校验(见 ⑦)      → 超额:直接 4xx,不写任何东西
⑤ 去重:GetByUserSHA(user, sha) 命中且对象仍在 → 复用 storage_key,跳过 PUT
   未命中 → storage.PutObject(bucket, "att/<uid>/<sha>", body, size, {ContentType: mime,
                              UserMeta: {user-id, feature, orig-name}})
⑥ UpsertOnUpload(row)  materialized_at = NULL
⑦ PushSessionFile(sessionID, storedName, body)   ← 唯一一次写 cwd,executor 三道帽照常生效
   成功 → MarkMaterialized(row.id, now) → 返回 DTO(新增 id / uuid 字段)
   413 quota_exceeded → 见下方「失败怎么办」
```

### 为什么是这个顺序(而不是 cwd 优先)

两种顺序最终都是双写,区别只在**失败时留下什么**。

- **cwd 优先**:cwd 写成功、MinIO 挂了 → 得到一个「有字节没耐久性」的附件。
  这正是今天的状态,而且**用户看不出区别** —— 静默降级成旧行为,是最坏的失败模式。
- **MinIO 优先**(采纳):字节先落耐久层。cwd 写失败时**字节仍然是安全的**,
  用户拿到可执行错误(「当前会话的文件空间已满」),去新的文件管理页删几个文件再重试 ——
  **重试会命中 ⑤ 的 sha 去重,不重新上传一遍 30MB**,只补一次 cwd 推送。
  这个「便宜的重试」是顺序选择带来的直接产品收益。

代价:被 cwd 配额拒掉的上传会在 MinIO 留一个对象 + 一行 `materialized_at IS NULL` 的行。
这**不是垃圾** —— 它是一份用户确实上传成功的文件,在文件管理页可见、可删、可复用。
per-user 配额(④,在 PUT 之前)负责挡住恶意刷量。

### 幂等怎么保证

| 场景 | 保证 |
|---|---|
| 同一次上传被浏览器重试 | 新 UUID → 新行;但 sha 相同 ⇒ **不重复 PUT 对象**。多出一行元数据(几百字节),可接受。若要严格幂等,前端可带 `client_upload_id`,后端加一列唯一键 —— **建议不做**,收益不抵一列索引 |
| 同一附件跨会话物化多次 | `uk_session_uuid` 唯一键,`INSERT ... ON DUPLICATE KEY UPDATE` |
| 同一附件在一条消息里被引用多次 | 沿用 `relocateState.done` 批内去重(不动) |
| 自愈重复触发 | `PutWorkspaceFile` 覆盖写,executor 的 `assertSessionQuota(targetAbs)` 会扣减同名文件现有占用,不会自锁 |

### MinIO 不可用怎么办(必须显式分叉,别含糊)

- `storage.IsEnabled() == false`(未配 `MINIO_ENDPOINT`,dev 常态)→ **降级放行**:
  跳过 ⑤⑥,只推 cwd,行为完全等同今天,打一条 `slog.Warn`。理由:本机开发不该被迫起 MinIO。
- **已启用但 PutObject 失败** → **fail-closed**,4xx 报「上传失败,请重试」。
  理由:这是暂时性故障,用户重试代价低;静默降级会造成「以为存了其实没存」——
  这类断层正是本仓库反复吃亏的模式(参见 friendly-error-messages 与 Turnstile fail-closed 的先例)。

---

## ④ cwd 副本的自愈重建

**触发点只有一个真正重要:发消息之前。** 其余全是锦上添花。

### 主触发点 · `Relocator.EnsureLocal` 扩展成 `EnsureLocal + EnsureMaterialized`

位置不变(`hub.go:1838-1861`,配额校验之后 / `foldUserAttachments` 之前 —— 那段注释解释了
为什么这个顺序是硬要求,不要动)。逻辑变成:

```
对每条 attachments[].path:
  classifyAttachmentPath 判本地/外来(不变)
  剥 basename 的 UUID → 查 agent_attachments(user_id 收窄)
    查不到行(存量附件 / 非附件路径)→ 走今天的老逻辑,一字不改
    查到行:
      本地(attachLocal)  → 一次 ListWorkspaceFiles(本会话目录,批内缓存) 确认文件在
                            在   → 什么都不做(零额外开销)
                            不在 → GetObject(storage_key) → PutWorkspaceFile → MarkMaterialized
      外来(attachForeign) → 直接 GetObject(源行 storage_key) → PutWorkspaceFile(uploads/<stored_name>)
                            → 在目标会话 Upsert 一行(origin_id = 源行 id)
```

- **常态开销**:每条**带附件的**用户消息多一次目录清单 HTTP(批内按目录缓存);
  不带附件的消息(绝大多数)零开销。今天 `attachLocal` 是零 HTTP 调用,这是唯一的性能回退,
  换来的是「30 天后老会话还能继续对话」。
- **完整性**:拉回后重算 sha256 与 key 比对,不一致 → 拒绝并报错(不静默写一个坏文件)。
- **失败语义不变**:仍然「要么全成、要么明确报错」,`AttachmentError.UserMessage()` 那套照旧。

### 次要触发点

- **取回端点(⑤)不需要 cwd** —— 直接从 MinIO 读。所以历史回放的图**永远不裂**,与 GC 无关。
- 会话文件面板列举时按需重建(可后补,Phase 3)。

### 明确**不做**的触发点

**不在 workdir GC 之后主动重建**。那等于把 30 天 GC 变成永不生效,`./data/agent-sessions`
(prod 已 2.4G / 883 目录)会无上界增长。自愈必须是**惰性的**:用户真的回来发消息才重建。

---

## ⑤ 取回端点:一条路由,四个 feature,含非图片

### 新路由(挂 `userProtected`,`routes_user.go`)

```
GET /api/v1/user/attachment/:uuid          # 主入口:uuid = 落盘名的 UUID 前缀
GET /api/v1/user/attachment/by-id/:id      # 可选,文件管理页用
DELETE /api/v1/user/attachment/:uuid       # 见 ⑦
```

**为什么按 uuid 而不是按行 id 做主入口**:历史回放里前端**只有 `@"path"` 这一个信息源**
(`agent-history.ts` 剥出 basename),里面天然带 uuid、没有行 id。按 uuid 取意味着
**存量 journal 零改造**,而且四个 feature 用同一条 URL。

### handler 行为(抄 `claw/artifact.go:DownloadArtifactByID` 的铁律)

```go
row := GetByUUID(uuid, currentUserID)     // 越权/不存在一律 404 防枚举
switch {
case row == nil:            404 "文件不存在或不属于你"    // 存量附件 → 前端回落老路由(⑨)
case row.DeletedAt != nil:  410 "该文件已被删除"          // ← 今天做不到的语义
}
c.Header("X-Content-Type-Options", "nosniff")
if row.AttType == "image" && allowedRasterMIME[row.Mime] {
    // 光栅图白名单内联(沿用 image.go 的白名单;SVG 已在上传口拒收,这里再拒一次)
} else {
    c.Header("Content-Disposition", `attachment; filename*=UTF-8''`+url.PathEscape(row.Filename))
}
c.Header("Cache-Control", "private, max-age=31536000, immutable")  // uuid 一一对应字节 ⇒ 真 immutable
storage.ServeObject(c.Writer, c.Request, bucket, row.StorageKey, row.Mime)
```

四条收益一次到手:

1. **stat_lab 裂图消失** —— 不再需要 `/user/stat_lab/session/file` 那条从未注册的路由(01 §4.3)。
2. **跨会话复用的图不再 404** —— 不再有 basename 与 `uploads/` 落点的口径错位(01 §4.2 / H-8)。
3. **PDF/docx/csv 用户终于取得回来** —— 不再硬性要求 `previewType=="image"`(01 §4.4)。
   `Content-Disposition: attachment` 不影响 pdf.js 预览(XHR 忽略该头),这与产物端点结论一致。
4. **Range + 304 白得** —— `storage.ServeObject` 自带。

⚠️ `immutable` 的代价:用户「永久删除」之后,已缓存过该图的浏览器在一年内仍会显示它
(`CLAUDE.md` 静态资产那条铁律的同一机制)。这里可接受 —— 缓存只在**该用户自己**的浏览器里,
且 URL 按 uuid 一一对应字节、永不复用。若产品要求删除立刻全端生效,把它降到
`private, max-age=3600`(与今天两份取图代理同值),代价是每小时回源一次。

### 三个必须一起做的配套(漏一个就出线上事故)

- 🔴 **`middleware/timeout.go` 的 `isObjectServePath` 要加 `/attachment/`**。
  现在只有 `/feedback/attachment/`。不加 → 大 PDF 在 15s 处被 ctx 掐成坏文件,
  与 2026-08-07 产物那次是同一个坑(该函数的注释里就写着「补齐当下的四个 feature 只是把坑推给第五个」)。
  写成 `/attachment/` 这种**形状匹配**,顺带覆盖 feedback 那条。
- **cookie 鉴权**:`<img>` 发不了 Bearer。`UserAuthMiddleware` 已支持 `scholay_token` cookie,
  沿用即可(与两份取图代理同款)。
- **前端 `makeAgentConversationHook.ts` 的 `sessionFileUrl`** 改成从 absPath 剥 UUID 拼新 URL;
  `smart-search.ts` / `prism.ts` 同理。剥不出 UUID(存量非标路径)→ 回落老 URL。

---

## ⑥ 跨会话 relocate:还需要,但换了源和判据

**还需要。** cwd 里必须有真文件,`EnsureLocal` 是唯一把文件放进当前会话 cwd 的地方。
但它的**实现全部改写**,并与 ④ 的自愈合并成同一份代码(这是本方案最大的一处收敛):

| 维度 | 今天 | 改造后 |
|---|---|---|
| 字节来源 | `ReadWorkspaceFileRaw(源会话 cwd)` | `storage.GetObject(源行 storage_key)` |
| 源会话被 GC / 删除 | ❌ 「所在的历史对话已被清理,请重新上传」 | ✅ 照常物化,用户无感 |
| 归属校验 | `OwnsSession(userID, srcSession)`(依赖源会话行还在) | `row.user_id == userID`(更强,且不依赖会话存活) |
| 大小上限 | 20MB(受 executor `RAW_CAP` 限制,20~30MB 的附件跨对话复用不了) | 可提到 30MB(与上传上限齐平),不再有中间死区 |
| 幂等 | 「列目录 + 同名同大小」 | `uk_session_uuid` 唯一键 |
| 落点 | 硬编码 `uploads/`(引发 claw/smart_search 取图 404) | 仍是 `uploads/`,但**取图已不走 cwd 路径** ⇒ 落点不再有副作用 |

`relocateDir = "uploads"` 的**收窄理由继续成立**(源相对路径来自用户可控输入,原样映射
等于给出「往本会话任意相对路径写文件」的原语,能覆盖 prism 的 `document.md`),**不要改**。

---

## ⑦ 配额口径怎么改

今天的问题(01 §3.2 / MAP H-5):`assertSessionQuota` 算的是**整个会话 cwd**
(模型产物、pip 装的东西全计入 1GB),而超额文案叫用户「删除部分历史文件」——
**用户根本没有删除入口**。这条指引在产品上不可执行。

### 三层新口径

| 层 | 值 | 谁执行 | 语义 |
|---|---|---|---|
| **per-user 附件耐久额度**(新) | 建议默认 2GB,tier-aware 可后补 | backend,在 PutObject **之前** | 「你在平台上一共存了多少原始数据」。按 `DISTINCT content_sha256` 求和,跨会话复用不重复计费 |
| 单文件 | 30MB / 图片 5MB(不变) | backend | 不变 |
| 会话 cwd 磁盘 | 1GB / 2000 文件(不变) | executor `assertSessionQuota` | **改成「工作区磁盘保护」而非「用户存储额度」**。它保护的是宿主盘,不该被用户理解成配额 |

### 会话 cwd 撞帽时的新处理(这是耐久化解锁的能力)

```
PushSessionFile 返回 413
  → 本会话内按 materialized_at 最旧,挑几个已耐久的附件 cwd 副本
    DeleteWorkspaceFile 驱逐 + MarkMaterialized(nil)      ← 字节仍在 MinIO,随时能自愈回来
  → 重试一次 PushSessionFile
  → 仍失败:报可执行文案 + 指向文件管理页
```

也就是 **cwd 变成了 MinIO 的 LRU 缓存**。这条是可选的(Phase 2),但它是把
「配额满 = 死路」变成「配额满 = 自动腾挪」的唯一办法。

### 顺带补上删除入口(H-5 的另一半)

- `DELETE /user/attachment/:uuid?scope=session` → 只删 cwd 副本(`DeleteWorkspaceFile` +
  `MarkMaterialized(nil)`)。字节仍可取回,chip 仍能点开。**这是腾配额的默认动作。**
- `DELETE /user/attachment/:uuid?scope=permanent` → 软删行(`deleted_at`)+ refcount 归零则删对象
  + 删 cwd 副本。此后取回端点回 410「该文件已被删除」。
- 前端 `useComposerAttachments.removeItem` 今天**只改 UI 不发请求**(01 §5.2)——
  发送前移除应调 `scope=permanent`,否则用户以为撤销了、文件却已进了自己的存储额度。

---

## ⑧ 删会话 / 删用户的级联

| 触发 | agent_attachments 行 | MinIO 对象 | cwd 文件 |
|---|---|---|---|
| **删会话 / 重置会话** | 删该 session_id 的行(与产物 `cleanupArtifacts` 同语义、同调用点) | 逐行 refcount 归零才删 | 随目录 `rm -rf`(不变) |
| **30 天 workdir GC** | **不动** | **不动** | 消失 → 下次发消息时 ④ 自愈重建 |
| **删用户** | 外键 `ON DELETE CASCADE` 自动带走 | `DeleteUser` 事务提交后异步清 `att/<uid>/` 前缀(**照抄 `papers/<uid>/` 那段**,best-effort + reaper 兜底) | 会话工作区仍最长留 30 天(既有缺口,本方案不解决) |
| **用户主动永久删除** | 软删 | refcount 归零才删 | 删 |

**删会话为什么连带删附件(而不是留成「我的文件」)**:会话是用户心智里的删除边界。
留下来会造成「我删了对话,数据却还在平台」的错觉,是合规上的坏形状。
跨会话被引用的那份靠 refcount 保护 —— B 会话的行还在,对象就不会被删。

**`DeleteUser` 的注释要同步更新**:`repository.go:486-488` 那句「仍未清理:…agent_sessions 映射」
在本方案落地后要改成「agent_attachments 已由外键带走,MinIO att/ 前缀已异步清;
仍未清理 agent_turn_events / agent_artifacts / prism_* / peer_review_*」——
**注释与实际不符**本身就是 MAP §四 B-3 记录过的问题类型,别再制造一处。

---

## ⑨ 存量兼容:只前向,不迁移

**建议不做存量回填。** 理由三条,都可验证:

1. **归属不可靠**。executor 磁盘上只有 `<uuid>-<原名>`,没有「谁传的、什么 mime、是不是附件」;
   只能靠 UUID 前缀猜「这像个上传件」,再从 `agent_sessions` 反查 owner ——
   而孤儿会话(换 sid 制造的,MAP H-2 实测 dev 已有 14 个)反查不到。猜错 = 把 A 的文件挂到 B 名下。
2. **窗口自然消失**。存量附件最多再活 30 天(workdir GC),回填的收益期上界就是 30 天。
3. **成本不对称**。prod 会话工作区 2.4G / 883 目录,其中附件占比未查实,
   而回填要把它们全读一遍 + 全 PUT 一遍,在一块只剩 16G 可用的盘上。

### 前向兼容怎么做到不留裂缝

- 取回端点查不到行 → **前端回落到现有 per-feature `session/file` 路由**(claw / smart_search / prism
  三条**保留不删**)。存量老会话的图与今天完全一样(该能看的还能看)。
- `EnsureLocal` 查不到行 → 走今天的 `ReadWorkspaceFileRaw` 老路径,一字不改。
- **stat_lab 的存量图仍然裂**(它今天就没有路由)。新上传的立刻好。这是接受的。
- 若日后确实要回填,做成**一次性 opt-in 脚本**(不是迁移),脚本头部写清它的猜测规则、
  只处理 `agent_sessions` 能反查到 owner 的会话、且 dry-run 先出清单。

---

## ⑩ 分期

### Phase 0 — 必须一起上(拆开等于没修)

| # | 改动 | 文件 |
|---|---|---|
| 0.1 | 建表迁移 | `docker/mysql/migrations/0112_*.sql` · `0113_*.sql` |
| 0.2 | bucket 配置 + 建桶(附解释性注释) | `internal/common/config/config.go` · `internal/storage/storage.go` · `.env.example` |
| 0.3 | 新包:model / repository | `internal/agentattachstore/` |
| 0.4 | 上传双写(③)+ DTO 加 `id`/`uuid` | `internal/agentattach/upload.go` |
| 0.5 | 统一取回端点(⑤) | `internal/agentattach/serve.go`(新) · `cmd/server/routes_user.go` |
| 0.6 | timeout 白名单加 `/attachment/` | `internal/common/middleware/timeout.go` |
| 0.7 | 前端改拼 URL + 回落 | `makeAgentConversationHook.ts` · `smart-search.ts` · `prism.ts` |
| 0.8 | 装配 | `cmd/server/bootstrap.go`(四处 `NewUploader` 注入 store) |

上完 Phase 0:附件耐久 ✅ · stat_lab 裂图 ✅ · 跨会话取图 404 ✅ · 非图片可取回 ✅。
**但**老会话被 GC 后模型仍读不到文件(那是 Phase 1)。

### Phase 1 — 紧随(建议同一次部署,最多晚一拍)

- 1.1 `EnsureLocal` 自愈 + relocate 改 MinIO 源(④⑥)—— 不做的话,GC 之后
  用户能看见图但 AI 打不开,是新的「半边修复」。
- 1.2 删会话 / 重置会话的级联(⑧ 前两行),挂在四份 `cleanupArtifacts` 的同一个调用点。

### Phase 2 — 可后补

- 2.1 单文件删除入口(两种 scope)+ 前端 `removeItem` 接线
- 2.2 per-user 附件配额 + 配额满时的 cwd 驱逐重试(⑦)
- 2.3 「我的文件」列表页(按 `idx_user_created`)

### Phase 3 — 运维与合规

- 3.1 孤儿对象 reaper(照抄 `library_cleanup.go`)
- 3.2 `DeleteUser` 的 `att/<uid>/` 前缀清理 + 注释订正
- 3.3 admin 会话监控里附件可见/可下载

### Phase 4 — 可选,牵连面更大

- 4.1 **落点统一到 `uploads/`**(claw / smart_search / stat_lab 三处加 `.WithSubdir("uploads")`)。
  收益:顺手堵住 MAP H-6(上传落 cwd 根 + 扩展名命中 `DELIVERABLE_EXTS` ⇒ 模型就地改写后
  会被 `relocateStrays` 洗成永久交付物)。代码面是 **backend-only** —— executor 的
  `pushSessionFile` 已白名单支持一层子目录,取回也已按 uuid 与路径解耦。
  🔴 **但提示词面不是 backend-only,这条要连着改**(实测 grep,不是推测):
  - `agent-skills/stat-lab-skills/workbench/SKILL.md:18` 明写「**上传的文件就在当前目录下,
    直接用文件名读,不要 `cd`**」;`:308` 也按「工作目录」向用户解释数据存哪;
  - `agent-skills/sci-draw-skills/charts/SKILL.md:31` 写「用户上传到 cwd 的 CSV/xlsx」;
  - `backend/internal/prompts/claw.go:98` 写「backend 已经把原始文件放进你的**当前工作目录**」;
  - `smart_search.go:23` 同款措辞。

  这四处不同步改,模型会按文件名去 cwd 根找、找不到就自己 `ls` 摸索(退化成 2026-07-14
  附件断链那次的形态)。且改 prompt 后必须 `docker-compose restart scholar_agent` 才生效
  (既有记忆:ASCII 框图复发那次的教训)。所以 4.1 的真实工作量是「3 行 backend + 4 处文案 +
  一次 agent 重启」,不是一行。
- 4.2 ~~把 `uploads/` 加进 `RESERVED_DIRS` 让模型不能改写用户原始数据~~ ——
  🔴 **查实做不到**:`pushSessionFile` / `putWorkspaceFile` 自己就走
  `confinePath(..., forWrite=true)`,而该函数对保留区一律拒写 ⇒ 加进清单会把**上传本身**堵死。
  要做必须先给 HTTP 写入路径开一条显式旁路,属独立改造,本方案不含。

---

## 这套方案解决不了什么(明确写出来)

1. **不解决备份缺失。** MinIO 与 MySQL 同盘、零备份、零异地。附件从「1 份磁盘」变成「2 份同盘」,
   抗 GC 不抗盘。装备份(`scripts/backup-all.sh` 三件套已写好从未执行)是独立且更高优先级的事。
2. **不减少磁盘占用,反而增加。** cwd 副本照旧存在,MinIO 是**额外**一份。
   上线前必须先 `docker system prune`(prod 可回收约 10.7G,当前只剩 16G 可用)。
3. **不解决模型自己写文件无配额(MAP H-5)。** `assertSessionQuota` 全仓只有两个调用点,
   模型的 `Write` / `Edit` / Bash 重定向全不过闸。本方案只让 backend 侧的入湖路径更可控。
4. **不完全解决 H-6(上传被洗成产物)。** Phase 4.1 能挡住「落 cwd 根 → 被 diffOut 判变更」这条,
   但模型只要 `cp data.csv out/` 就仍然能把用户原始数据变成平台侧持久交付物。
   真正的堵法要在产物收割侧按 UUID 前缀排除,不在本方案范围。
5. **不解决存量。** 已有会话里的裸文件仍在 30 天内消失,stat_lab 存量图仍裂(⑨)。
6. **幽灵 chip 只解决了主因,没根除。** 用户主动永久删除、或删会话之后,journal 里的
   `@"path"` 仍然永久存在 ⇒ chip 还在。区别是现在能回 410 + 语义化提示,而不是无解释的裂图。
7. **不解决 `agent_turn_events` 的增长 / 分区裁剪恒为 0 / `BeginTurn` 失败整轮丢事件**(MAP §四 B-2、H-4、H-9)。
8. **不解决 `agent_artifacts` 侧的既有问题**:桶无 lifecycle、`DeleteStaleBySession` 是死代码、
   删对象 best-effort 无对账。本方案的 reaper 只覆盖新桶(可复用同一段代码日后推广,但不在本次改)。
9. **不改变「模型读文件必须靠 cwd」这一事实** ⇒ cwd 副本永远删不干净,
   30 天 GC 与自愈重建之间的抖动(用户回访老会话 → 触发重建 → 目录 mtime 刷新 → GC 又推迟 30 天)
   是新引入的行为,**需要观察**:极端情况下高频回访的老会话会长期不被 GC。
   缓解:自愈只重建**本轮实际引用到的**附件,不整目录还原。

---

## 验证

本机无 Go,按仓库惯例走 docker:

```bash
docker run --rm -v /Users/youngp/mypro/fuck_副本/scholar/backend:/src -w /src \
  -v scholar_gomodcache:/go/pkg/mod -e GOFLAGS=-mod=mod golang:1.21-alpine \
  sh -c 'go build ./... && go test ./...'
```

前端:`cd frontend-user && npm run typecheck && npm run build`(prebuild 会跑设计系统护栏)。
迁移:`docker-compose restart schema-sync backend && docker logs scholar_schema_sync`
—— 重放两次确认幂等(0113 的 `DELETE` 孤儿 + `add_foreign_key_if_not_exists` 都必须可重复执行)。

端到端最小验收(四条,缺一条就是没做完):

1. stat_lab 传一张 png → 自己的气泡里**看得见**(今天必裂)。
2. claw 传一个 PDF → 刷新页面 → 点 chip **下得下来**(今天永久取不回)。
3. A 对话传图 → B 对话发送 → 模型读得到 **且** 用户气泡里看得见(今天只有前一半)。
4. 手动 `rm -rf ./data/agent-sessions/<sid>` 模拟 GC → 回到该会话发消息 →
   模型仍读得到该附件(自愈),历史里的图仍显示(走 MinIO)。
