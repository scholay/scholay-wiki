# Agent 数据存储调研 · 01 上传附件与图片

> 调研日期 2026-08-07 · 只读分析,未改任何代码、未动线上。
> 所有结论都带 `file:line` 或实测输出;**没查实的地方一律显式标注**,不推测。
> 读者假设:已熟悉 agentbridge / executor / journal / artifacts 这几条链路。

---

## TL;DR(一句话结论)

用户从输入框上传的文件**只有一份字节副本,落在 executor 容器的会话 cwd 里**
(宿主 bind-mount `./data/agent-sessions/<sessionId>/`),**不进 MinIO、不进 MySQL、没有任何 DB 行**。
它的生命周期完全等同于会话工作区:会话删/重置 → 立即随目录删;30 天不活跃 → 被 workdir GC 整目录删。
用户**没有**任何删除单个附件的入口,也**没有**把非图片附件取回来的入口。
图片能回显,是因为有一条 per-feature 的「取图代理」端点把 agent 的 base64 dataUrl 解码后回写给 `<img>`;
这条链路目前对 **stat_lab / sci_draw / boltslides 三个 feature 根本没有后端路由**(前端会拼出 404 的 URL),
且对**跨会话物化过来的附件**在 claw / smart_search 上必然失败(路径 basename 口径与落点目录不一致)。

---

## 一、字节最终落在哪

### 1.1 完整链路(七跳)

```
浏览器 <input type=file> / 拖拽 / 粘贴
  → useComposerAttachments.addFiles            前端预校验(类型/大小/条数)
  → POST /api/v1/user/<feature>/upload         multipart, field name = "file"
  → middleware.UploadLimitMiddleware(50MB)     路由级 MaxBytesReader
  → agentattach.Uploader.HandleUpload          类型白名单 + 30MB/5MB 限额 + 会话归属
  → agent.Client.PushSessionFile               再包一层 multipart,流式推给 executor
  → POST http://scholar_agent/api/sessions/:id/files
  → workspace.pushSessionFile                  落盘 = 唯一一次写字节
```

**唯一落盘点**:`agent/src/server/workspace.ts:243-254`

```ts
export async function pushSessionFile(workDir: string, file: File): Promise<{path,name,size}> {
  const m = rawName.match(/^([A-Za-z0-9_-]{1,32})\/([^/]+)$/);   // 至多一层安全子目录
  const sub = m ? m[1] : "";
  const name = basename(m ? m[2] : rawName);
  const abs = await confinePath(workDir, sub ? `${sub}/${name}` : name, true);
  await assertSessionQuota(workDir, file.size, abs);
  await writeFile(abs, buf);
  return { path: abs, name, size: buf.length };   // ← 返回**容器内绝对路径**
}
```

宿主侧位置:`docker-compose.yml:385` `SESSIONS_ROOT: /home/bun/sessions`,
`docker-compose.yml:453` `- ./data/agent-sessions:/home/bun/sessions`
(prod 同款:`docker-compose.prod.yml:367` / `:400`)。

### 1.2 落点目录:两种,按 feature 分叉

| feature | 装配点 | 落点 | 依据 |
|---|---|---|---|
| claw | `backend/internal/claw/handler.go:47` `NewUploader(feature, nil)` | **会话 cwd 根**  | 无 `WithSubdir` |
| smart_search | `backend/internal/smartsearch/handler.go:54` | **会话 cwd 根** | 同上 |
| stat_lab | `backend/internal/statlab/handler.go:49` | **会话 cwd 根** | 同上 |
| prism | `backend/cmd/server/bootstrap.go:703` `NewUploader(prismFeature, nil).WithSubdir("uploads")` | `uploads/` | LaTeX 工作区不能被附件污染(`prism/attach.go:11-15`) |
| boltslides / sci_draw | — | **无上传端点** | 路由表里没有;前端 `enableAttachments:false`(`ClawPage.tsx:87` / `:110`) |

⚠️ **跨会话物化的落点与原生上传不一致**:`agentattach/relocate.go:72` 把 `relocateDir` **硬编码为 `"uploads"`**,
对所有 feature 生效。也就是说 claw 里「本会话上传的 a.png」在 cwd 根,而「从别的对话拖过来的 a.png」
在 `uploads/a.png` —— 同一个 feature 里两种落点。这是第 4 节那个取图 404 的根因。

### 1.3 落盘文件名

`backend/internal/agentattach/upload.go:249`

```go
storedName := uuid.NewString() + "-" + filepath.Base(fh.Filename)
if u.subdir != "" { storedName = u.subdir + "/" + storedName }
```

UUID 前缀有两个刚性用途,改名会同时打断两条链:
1. 前端历史回放剥离器只认带 UUID 前缀的 `@"path"` 为附件标记
   (`frontend-user/src/shared/lib/agent-history.ts:407` `STORED_UUID_PREFIX`,`:472` 处 `break`);
2. 防同名互相覆盖(`upload.go:247-248` 注释)。

展示名走 `AttachmentDTO.Name = fh.Filename`(原名),错误文案里剥前缀用
`agentattach/relocate.go:426-433` 的 `displayAttachmentName`。

### 1.4 MinIO:**完全没有**

- `grep -rn "storage\.\|minio" backend/internal/agentattach/` → **零命中**(实测)。
- 存储层声明的 8 个 bucket(`backend/internal/storage/storage.go:52-58`)里没有任何一个是给聊天附件的;
  `BucketFeedbackAttachments` 是工单附件,`BucketAgentArtifacts` 是**产物**(out/ 收割),两者都不是这条链路。
- 结论:**上传附件在 MinIO 里零副本**。会话目录被删 = 字节永久消失,无备份、无归档。

### 1.5 字节在内存里的一次完整驻留(顺带记一笔)

`upload.go:390-397 readMultipart` 用 `io.ReadAll` 把整个文件读进 `[]byte`,再
`bytes.NewReader(body)` 流给 agent(`upload.go:254`)。也就是说 backend 侧
**每次上传峰值占用 = 文件大小**(最大 30MB),不是纯流式。注释(`upload.go:246`)明确说这是有意的
(只省掉 client 端的 multipart 缓冲)。并发上传多时这是可预期的内存放大,**未查实**是否有并发限流。

---

## 二、有没有 DB 表记录

**没有。** 三重证据:

1. 代码侧:`agentattach` 整个包不 import 任何 repo / gorm(`upload.go:39-57` 的 import 块只有 gin/uuid/agent/agentbridge)。
2. 迁移侧:`grep -rn "attachment\|uploads" docker/mysql/migrations/*.sql` 只命中
   `feedback_attachments`(工单)与 `news_items.body_md` 注释里的 `/uploads` 路径串。
3. 实测线上表:
   ```
   $ docker exec scholar_mysql mysql ... -e "SHOW TABLES LIKE '%attach%'; SHOW TABLES LIKE '%upload%'"
   feedback_attachments
   ```
   —— 没有 agent 附件表。

**附件的唯一「记录」是会话 transcript 里的一段文本**:`agentbridge/ws.go:608-653 foldUserAttachments`
把 `attachments[].path` 折成 content 首部的 `@"绝对路径" ` 前缀。这段文本随 user_message 进
journal(`agent_turns.role_user_text` / `EvUserMessage` 事件),所以:

- 附件的**存在性**是耐久的(journal 里永远有那条 `@"/home/bun/sessions/<sid>/<uuid>-a.pdf"`);
- 附件的**字节**不是耐久的(工作区一删就没)。

两者的 TTL 不一致(journal 无 TTL vs workdir 30 天),这是第 5 节「幽灵 chip」的结构性来源。

顺带:`foldUserAttachments` 有服务端条数帽 `maxWsAttachments = 10`(`ws.go:622`),超出**静默截断**;
且只采纳 `strings.HasPrefix(p, "/")` 的绝对路径(`ws.go:630`)。

---

## 三、配额与大小上限(三层帽,口径互相错位)

### 3.1 逐层清单

| 层 | 位置 | 值 | 触发形态 |
|---|---|---|---|
| 前端预校验 | `useComposerAttachments.ts:18-21` | 图片 5MB / 文件 30MB / 单条消息 10 个 | toast,不发请求 |
| 全局 body limit | `middleware/bodylimit.go:43-46` | multipart 请求统一 50MB | `MaxBytesReader` |
| 路由级 | `routes_user.go:209/296/338/411` `UploadLimitMiddleware(UploadMaxBodySize)` | 50MB(`bodylimit.go:24`) | 同上 |
| backend 业务 | `agentattach/upload.go:60-61` | `MaxFileBytes=30MB` / `MaxImageBytes=5MB` | 4xx + 中文文案 |
| **executor 单文件** | `workspace.ts:22` `EXECUTOR_PUSH_FILE_MAX_BYTES` | **64MB** | 413 `quota_exceeded` |
| **executor 会话磁盘** | `workspace.ts:23` `EXECUTOR_SESSION_DISK_MAX_BYTES` | **1024MB** | 413 |
| **executor 会话文件数** | `workspace.ts:24` `EXECUTOR_SESSION_FILE_MAX_COUNT` | **2000** | 413 |
| WS 折叠条数 | `agentbridge/ws.go:622` | 10 | 静默截断 |
| 跨会话物化 | `relocate.go:78/80` | 单个 20MB / 单轮 10 个 | 明确拒绝并给文案 |

三个 executor 帽在 `docker-compose.yml` / `docker-compose.prod.yml` / `.env.example` 里
**都没有设置**(实测 grep 零命中)→ 生产跑的就是上面的默认值。

### 3.2 `assertSessionQuota` 的真实口径(`workspace.ts:70-95`)

```ts
export async function assertSessionQuota(workDir, incomingBytes, targetAbs?) {
  if (PUSH_FILE_MAX_BYTES > 0 && incomingBytes > PUSH_FILE_MAX_BYTES) throw ...   // 单文件
  if (SESSION_DISK_MAX_BYTES <= 0 && SESSION_FILE_MAX_COUNT <= 0) return;
  const usage = await dirUsage(workDir);                                          // 全量递归 stat
  if (targetAbs) { /* 目标已存在则扣减自身,避免同名覆盖被自己卡死 */ }
  if (usage.bytes + incomingBytes > SESSION_DISK_MAX_BYTES) throw ...             // 会话总字节
  if (usage.files >= SESSION_FILE_MAX_COUNT) throw ...                            // 会话总文件数
}
```

三条要点:

1. **口径是「整个会话 cwd」,不是「uploads 目录」** —— 模型生成的产物、references/、
   out/、pip 装出来的东西全都计入同一个 1GB。也就是说一个跑了很多轮的 stat_lab 会话,
   用户后来传不上文件的真实原因可能是模型自己把配额吃光了,而给用户的文案是
   「当前会话的文件空间已满, 请删除部分历史文件、新开会话后再上传」(`upload.go:258`)——
   **而用户根本没有任何删除会话内文件的入口**(见第 5 节)。这条指引在产品上是走不通的。
2. `dirUsage`(`workspace.ts:33-63`)是**每次写入都全量递归 stat 一遍**。会话文件数上限 2000,
   最坏情况每次上传要 stat 2000 次。注释说「毫秒级」,在 overlayfs / bind-mount 上**未实测**。
3. `envNum` 防 NaN(`workspace.ts:20` 注释):env 误配非数字时曾会静默全关三道帽。

### 3.3 口径错位(可利用面)

- backend 业务帽 30MB **小于** executor 单文件帽 64MB。走 backend 的路径永远撞不到 64MB。
  但 **`PushSessionFile` 还有另外三个调用方**(`prism/workspace.go`、`boltslides/handler.go:312`、
  `agentattach/reference.go:213/254`,以及 peerreview 推稿),它们不过 `parseAndValidateUpload`,
  只受 64MB 约束 —— 这解释了 64MB 这个数(`workspace.ts:18` 注释:「> 全链路最大合法推送(50MB 审稿稿件)」)。
- 前端 5MB 图片帽与 executor 读图帽 `IMG_CAP = 5MB`(`workspace.ts:12`)是 `>` 比较,恰好 5MB 通过;
  与 agent 侧 vision 内嵌帽 `MAX_IMAGE_BYTES = 6MB`(`attachments.ts:15`)留了 1MB 余量。这一族是自洽的。
- 跨会话物化帽 20MB(`relocate.go:78`)**小于**上传帽 30MB。20~30MB 的附件传得上去、但跨对话复用不了,
  代码已明确按大小提前拒绝并给可执行文案(`relocate.go:263-267`)。

---

## 四、图片预览 / 回显怎么取

### 4.1 两条完全不同的图片通道(容易混)

**通道 A — 给模型看的**(`agent/src/server/attachments.ts:40-71 buildUserContentWithImages`):
executor 收到 `user_message.attachments[]` 后,对 `type==="image"` 的项
`confinePath(workDir, raw.path)` → `readFile` → base64 直接内嵌成 Anthropic image block。
限制:媒体类型白名单 jpeg/png/gif/webp(`attachments.ts:18`)、单图 ≤6MB(`:15`)、
失败静默跳过(`:62-66`)。随请求外发的历史图片数还有 `limitLiveImages`(`:79`)裁剪、
模型不支持视觉时 `stripImageBlocks`(`:119`)换占位文本。
**这条通道不产生任何可供浏览器访问的 URL。**

**通道 B — 给用户看的**(取图代理):

```
<img src="/api/v1/user/<feature>/session/file?session_id=..&path=..">
  → UserAuthMiddleware(cookie scholay_token,见 middleware/auth.go:27/:55)
  → OwnsSession 归属校验
  → agent GET /api/sessions/:id/workspace/file?path=..
  → workspace.readWorkspaceFile 返回 dataUrl(base64)
  → 后端 base64 解码 → 原始字节 + Content-Type 回写
```

两份等价实现:
- `backend/internal/claw/file.go:54 GetSessionFile`(claw 专用,`artifact.go` 复用了它的 helper 故未合并);
- `backend/internal/agentattach/image.go:49 ServeSessionImage`(泛化版,smart_search / prism 用)。

安全三连(两份一致):
1. cookie 鉴权(`<img>` 发不了 Bearer);
2. `OwnsSession` 防越权读别人会话的图;
3. **只回写光栅图白名单** `png/jpeg/webp/gif/bmp`(`file.go:42-48` / `image.go:37-43`),
   刻意排除 `image/svg+xml` —— SVG 内联在同源下 = 存储型 XSS,能读 `localStorage.auth_token` / cookie。
   非白名单一律 404。另加 `X-Content-Type-Options: nosniff` + `Cache-Control: private, max-age=3600`。
   再叠一层:`agentattach/upload.go:185-187` 在**上传口**就拒收 SVG。

### 4.2 路径口径:三种前端拼法,两处不一致

| 前端 | 拼法 | 后端接受 |
|---|---|---|
| claw 家族 `makeAgentConversationHook.ts:101-104` | **basename**(`absPath.split('/').pop()`) | `claw/file.go:63` `filepath.Base` —— 只认根目录 |
| smart_search `smart-search.ts:409-414` | **basename** | `image.go:52` `path.Clean`,**允许子目录** |
| prism `prism.ts:793-802` | **`sessions/<sid>/` 之后的完整相对路径** | `image.go:52`,允许子目录 ✅ |

→ **claw / smart_search 拿不到 `uploads/` 下的图**。而跨会话物化的附件恰恰全部落在
`uploads/`(`relocate.go:72`)。所以:**「在 A 对话上传的图,切到 B 对话再发」这条路径,
图片在气泡里必然是裂图(404)**,虽然模型能正常看到它(通道 A 用的是被 relocate 改写后的绝对路径)。
prism 是唯一不受影响的(它原生就落 uploads/,前端也按相对路径拼)。

### 4.3 三个 feature 的取图端点**根本不存在**

前端 `makeAgentConversationHook.ts:103` 无差别地为四个 feature 拼
`/user/${cfg.feature}/session/file`,`cfg.feature` 取值 `'claw'|'boltslides'|'sci_draw'|'stat_lab'`
(`:69`)。但后端路由表里 `session/file` **只注册了三条**(实测 grep `routes_user.go`):

```
routes_user.go:211  prismG.GET("/projects/:id/session/file", ...)
routes_user.go:298  userProtected.GET("/smart-search/session/file", ...)
routes_user.go:324  userProtected.GET("/claw/session/file", ...)
```

→ `/user/stat_lab/session/file`、`/user/sci_draw/session/file`、`/user/boltslides/session/file`
**全部 404**。对 sci_draw / boltslides 影响为零(`enableAttachments:false`,压根不会有用户图);
对 **stat_lab 是真缺口**:`ClawPage.tsx:134 enableAttachments: true`,而
`ATTACHMENT_ACCEPT`(`useComposerAttachments.ts:38`)包含 png/jpg/jpeg/webp/gif,
用户完全可以往数据分析里传截图(SPSS 输出截图正是该卡片的典型用法,见 `useComposerAttachments.ts:72-81`
那段专门为 SPSS 用户写的引导文案)。传上去模型能看见,**但用户自己的气泡里永远是裂图**。

### 4.4 非图片附件:用户取不回来

两份实现都硬性要求 `wf.PreviewType == "image"`(`file.go:94` / `image.go:71`),否则 404。
所以用户上传的 PDF / docx / csv **没有任何回取入口** —— 传上去之后,用户端只剩一个 chip
和一个文件名,再也拿不到那份字节。(`agent_artifacts` 那条下载链路只服务 `out/`,见第 7 节。)

---

## 五、清理与 TTL

### 5.1 三条删除路径,全部是「整目录」粒度

| 触发 | 代码 | 效果 |
|---|---|---|
| 删除会话 | `bridge.go:1528` → agent `DELETE /api/sessions/:id` → `sessions.ts:388` `rm(workDir, {recursive:true})` | 附件随目录消失 |
| 重置会话 | `bridge.go:891` 建新 session 后删旧 session | 同上,**旧会话的附件全没** |
| 30 天 GC | `sessions.ts:455` `WORKDIR_TTL_MS`(`EXECUTOR_WORKDIR_TTL_DAYS` 默认 30)→ `sweepStaleWorkdirs` `:524` | 同上 |

GC 的活跃信号是 `<workDir>.active` 侧车文件 mtime(user_message/WS 活动时 touch,1h 节流,
`sessions.ts:465-473`)∨ 目录自身 mtime,取较新者;有活跃 WS 的会话绝不动(`:504`/`:519` 双检)。
GC 全盘扫描 6h 一次(`:456`)。`sessions.ts:450-454` 的注释已经把后果写明了:

> 丢的是旧会话的上传文件 / 产物文件(与 dev 环境容器重建后的现状一致,前端对缺文件已有 404 兜底)。

### 5.2 用户能删单个附件吗:**不能**

- 前端 `removeItem`(`useComposerAttachments.ts:260-266`)**只从 UI 列表里移除并 revoke object URL**,
  **不发任何删除请求** —— 文件已经在会话 cwd 里了,永久留在那儿直到整个会话被删。
- executor 有 `DELETE /api/sessions/:id/workspace/file`(`http.ts:376`)、
  backend 有 `agent.Client.DeleteWorkspaceFile`(`client.go:519`),但实测
  `grep -rn "DeleteWorkspaceFile" backend --include="*.go"` **只有接口声明和实现两处,零业务调用方**
  (注释说是给 prism 铺源用的,实际 prism 也没调)。**这是一条造好没接线的能力。**
- 结论:配额满了之后,`upload.go:258` 那句「请删除部分历史文件」在产品上无法执行,
  用户唯一的出路是最后半句「新开会话」。

### 5.3 幽灵 chip(结构性)

journal 里的 `@"path"` 无 TTL,workdir 30 天 TTL。30 天后回看老会话:
- 文本气泡里 chip 还在(`agent-history.ts:472` 按 UUID 前缀还原);
- 点图 → 取图代理 → agent `readWorkspaceFile` 走 `getOrCreateEphemeral`
  (`http.ts:344`)会**顺手把会话目录重建成空目录**,然后 `stat` 失败 → `state:"missing"` → 后端 404。
  也就是说旧会话被「看一眼」就会在磁盘上复活一个空目录(不占空间,但会重置 `.active` 逻辑?
  ——**未查实**:`getOrCreateEphemeral` 是否 touch marker,以及空目录会不会在下一轮 GC 被判活跃)。

---

## 六、跨会话 relocate:复制,且会产生多份

`agentattach/relocate.go`。语义逐条核对:

- **入口**:`agentbridge/hub.go:1838-1861`,位置严格卡在
  「PreUserMessage 配额校验之后」+「foldUserAttachments 之前」(`hub.go:1830-1836` 注释说明了为什么这个顺序是硬要求)。
- **判定**:`classifyAttachmentPath`(`relocate.go:380`)与权限层 `pathWithin` 同构 ——
  相对路径 / 本会话 cwd 子树 / `/work` 沙箱别名 → `attachLocal`(零 HTTP 调用,常态零开销);
  `<sessionsRoot>/<别的sid>/<rel>` → `attachForeign`;其余 → `attachAlien`(直接拒绝本轮)。
- **是复制不是移动**:`relocate.go:280` `ReadWorkspaceFileRaw(srcSession, srcRel)` →
  `:299` `PutWorkspaceFile(sessionID, "uploads/"+name, raw.Bytes)`。**源文件原封不动**。
- **会产生多份**:一个附件被 N 个会话引用 = 磁盘上 N+1 份字节(源 1 份 + 每个目标会话各 1 份),
  且每一份都**各自计入各自会话的 1GB 配额**。
- **幂等**:三层去重 ——
  批内 `st.done`(`:221`)、本会话已有「同名 + 同大小」即复用(`:270`,名字带上传期 UUID 前缀故同名即同一份)、
  目录清单缓存 `st.dirs`(`:318`)。所以重复引用不会重复拷贝,但**每个新会话第一次仍要付一次全量拷贝**。
- **安全**:`:227-242` 强制 `OwnsSession(userID, srcSession)`,否则这就是一条跨租户读取原语;
  拒绝时落 `slog.Warn` 并给用户「该附件不属于当前账号」。
- **落点收窄**:固定 `uploads/` 单层 + basename,**不保留源相对路径**(`:66-72` 注释:
  否则等于给了「往本会话任意相对路径写文件」的原语,可覆盖 prism 的 `document.md` / `references.bib`)。
- **失败语义**:全批「要么全成、要么明确报错」;失败时 hub 不 beginTurn、不计额度、不转发,
  回一帧 `{type:"error", code:"attachment_unavailable", retryable:false}`(`hub.go:1846-1859`)。
- **配额**:走 `PutWorkspaceFile` → executor `assertSessionQuota` 照常生效,413 → `ErrSessionQuotaExceeded`
  → 用户文案(`relocate.go:300-303`)。
- 装配:`bootstrap.go:281-284` 对 prism/claw/smart_search/boltslides/sci_draw/stat_lab **六个 feature 全装**。

**一句话**:relocate 是「按需复制 + 每会话幂等」,代价是磁盘冗余和各会话配额各扣一次;
它把权限问题彻底解决了,但把「同一个文件在系统里到底有几份」变成了 O(引用它的会话数)。

---

## 七、与 out/ 的关系:用户上传会被当成产物交付吗?

### 7.1 排除规则(设计意图)

`agent/src/turn/artifacts.ts:30`

```ts
const ROOT_SKIP_DIRS = new Set([OUT_DIR, "uploads", "references", "node_modules", "dist", "dist-single", "src", "public"]);
const DEEP_SKIP_DIRS = new Set([...ROOT_SKIP_DIRS.filter(d => d !== OUT_DIR), "__pycache__", "venv", ...]);  // :34-38
```

`uploads/` 在**任意层**都被整棵跳过(`:145`)。所以:
- **prism 的附件**(落 `uploads/`)+ **所有跨会话物化过来的附件**(落 `uploads/`)→ **永不进产物面**。✅

### 7.2 但 claw / smart_search / stat_lab 的原生上传落在 cwd **根**

根扫描面(`scanRootDeliverables` `:131`)收的是**任意层**(深度 ≤6)的可交付扩展名文件:

```ts
const DELIVERABLE_EXTS = new Set([".md",".docx",".xlsx",".pptx",".pdf",".csv",".html",".svg"]);  // :27
```

用户上传的 `.csv / .xlsx / .pdf / .docx / .md` **落在根目录、且扩展名全部命中**。
它们没被当成产物,靠的**不是排除规则,而是时序**:

- baseline 在 turn 开头拍(`turnLoop.ts:180 outBaseline = await snapshotOut(input.workDir)`);
- 上传发生在**两轮之间**(前端 `composerDisabled` 含 `busy`,`makeAgentConversationHook.ts:901-905`,
  忙时 `addFiles` 直接 return,`useComposerAttachments.ts:203`);
- 于是文件在 baseline 里已存在,`diffOut`(`artifacts.ts:186-191`)按 `size + mtimeMs` 判等 → 不进 decls。

**两个会击穿这个时序的场景**(都不是理论):

1. **模型就地改写上传文件**。stat_lab 的典型动作就是清洗数据;只要模型往
   `data.csv` 原地写(而不是写 `out/data_clean.csv`),size/mtime 一变 →
   `diffOut` 判为变更 → `relocateStrays`(`:228`)**copyFile 进 `out/`** →
   轮末 `artifact` 帧 → backend `harvestSession` → **MinIO + `agent_artifacts` 行**。
   用户原始数据就这样被「洗」成了平台侧的持久交付物。
2. **绕过前端直接打 upload 端点**。`POST /user/<feature>/upload` 后端**没有任何「本轮进行中则拒绝」的守卫**
   (`upload.go:131 HandleUpload` 只校验类型/大小/归属)。轮次进行中上传 → 文件不在 baseline →
   轮末 diff 判为新增 → 同上进 out/ + MinIO。

线上实测口径(本机 scholar_mysql,**注意这是开发库不是生产库**):

```
SELECT COUNT(*) FROM agent_artifacts;                       → 1040
SELECT COUNT(*) FROM agent_artifacts WHERE rel_path NOT LIKE 'out/%';  → 0
SELECT DISTINCT feature_key FROM agent_artifacts;           → claw, boltslides, sci_draw, stat_lab
```

`rel_path` 100% 在 `out/` 下,与 `relocateStrays` 的「越界物一律复制进 out/ 再上抛」一致
(`artifacts.ts:228-236` 注释:backend 产物链路是 out/ 单一真源)。
**未查实**:这 1040 行里有没有哪一条其实源自用户上传的文件被就地改写。
要判定得比对 `agent_artifacts.rel_path` 的 basename 是否带上传期 UUID 前缀 —— 顺手扫了一眼
Top-10 全是模型自己起的名(`spt04_long.csv` / `AD02_clean.csv` 等),**没有 UUID 前缀**,
说明就地改写这条路目前**没有实际发生**(或者至少不是主流)。但机制上没有任何东西挡着它。

### 7.3 一个方向的不对称

`uploads/` 被排除是**只读方向**的保护(不把上传当产物)。
反过来,**产物有 MinIO 备份而附件没有**:同一个会话被 GC 掉之后,
`out/` 里的东西还能从 `agent_artifacts` + MinIO 取回(`/claw/artifact/:id`),
用户自己传的原始数据则彻底消失。对「数据分析」这类卡片,用户直觉上会认为
「我传上去的数据平台留着」—— 实际不留。

---

## 八、附:类型白名单(收 = 能读)

`agentattach/upload.go:205-233` 与 `useComposerAttachments.ts:55-114` 是**两份手工镜像**,
注释双向标注了「两侧同步改」。当前口径:

- **图片**:仅 vision 白名单 jpeg/png/gif/webp(`upload.go:278-288`),
  BMP 单独拒(`:191`)、SVG 单独拒(`:185`,安全)、tiff/heic/avif 走
  `isUnsupportedImageMime` 给专属文案(`:224-227`)。
- **文档**:PDF / docx / xlsx / pptx / odt / rtf(`isOffice` `:343`),
  agent 侧靠 `ReadDocument`(pandoc)读。
- **旧版 Office** doc/xls/ppt/ods/odp 在入口拒,**只按扩展名判**(`:201`,
  注释说明了为什么 mime 不可作为单独拒收依据:Windows 装 WPS 后 .csv 会被报成 `application/vnd.ms-excel`)。
- **纯文本系**:`isPlainText` `:322` 的扩展名白名单 + `text/*` 前缀。
- **SPSS/Stata/SAS 专有格式**(.sav/.dta/...):**只有前端拒**(`useComposerAttachments.ts:42/72-81`),
  后端 `upload.go` 里**没有对应分支** —— 它们会落进 `default` 分支被拒(`:231`),
  但文案是通用的「可上传图片、PDF、Office 文档」,对 SPSS 用户没有出路。
  前端那段专门的引导文案是 2026-08-06 加的,**后端没跟**。绕过前端(或前端逻辑漏掉)时文案会退化。

---

## 九、明确没查实 / 不确定的清单

1. **生产库口径**。本文所有 SQL 与 `docker exec` 都跑在本机 `scholar_mysql` / `scholar_agent`
   (本机 sessions 目录只有 9 个会话 / 20K,显然不是生产)。`agent_artifacts` 那 1040 行来自本机库,
   与主协调者给出的「生产 1035 行 / 226 会话」是两组数,**不要混用**。
2. **并发上传是否有限流**。`readMultipart` 全量进内存(30MB/次),未找到针对 `/upload` 的
   per-user 速率限制;未查实全局 `RateLimitMiddleware` 是否覆盖这些路由。
3. **`dirUsage` 在生产 overlayfs / bind-mount 上的实际耗时**(2000 文件量级)。未实测。
4. **`getOrCreateEphemeral` 在取图路径上重建空会话目录的副作用**:是否 touch `.active`、
   是否影响下一轮 GC 判定。未读全 `createSession` 的 marker 逻辑。
5. **是否有历史上传文件被就地改写后进了 `agent_artifacts`**。只抽查了 Top-10 rel_path,
   没有做全量 UUID 前缀匹配。
6. **peerreview 的稿件上传**不在本文范围(它走 `peerreview` 自己的 MinIO 链路 + `pr2_*` 表,
   与 agentattach 无关);`prism` 的 `POST /projects/:id/assets`(图片→figure 块)也是另一条路径,
   本文未展开。
7. **nginx 层对 `/api/v1/user/*/session/file` 的缓存/大小限制**未核对
   (后端已打 `private, max-age=3600`,但边缘层是否 `proxy_hide_header` 覆写未查)。
