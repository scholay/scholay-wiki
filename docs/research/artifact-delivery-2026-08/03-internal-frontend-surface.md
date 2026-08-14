# 03 · 前端取证：用户在屏幕上到底能看到什么，什么时候看不到

> 调研范围：`frontend-user/` 内 claw / boltslides / sci_draw / stat_lab 四个 feature 的产物交付 UI。
> 取证方式：逐文件通读 + 关键行为用 node 复现（`stripContainerPaths` 行为矩阵）。
> 为了解释「为什么前端看不到」，本报告在少数几处越界读了 agent / backend 的对应代码，均标注出处。
> 每条结论都带 `file:line`。**日期：2026-08-07。工作树含未提交改动，本报告以工作树为准。**

---

## 〇、一句话结论

**产物交付在前端有两个半入口、一条数据链，而这条链的三个环节各自都有「用户看不到」的时刻：**

1. **时间上**：agent 的 `artifact` 帧是在 **turn 的 `finally` 里、`message_complete` 之前** 才发的
   （`agent/src/turn/turnLoop.ts:952-956`）。claw 和 stat_lab **不轮询**产物列表
   （`ConversationWorkspace.tsx:171-185`）。⇒ 一轮写 5 个文件、跑 4 分钟的会话，用户在这 4 分钟里
   **一个产物都看不到**，只能看到折叠面板里的「写入文件 xxx.docx」chip。
2. **空间上**：右侧「扩展区」在 **≤1024px 一律不存在**（连开关按钮都不渲染，
   `ConversationWorkspace.tsx:143,223,344`），移动端 `/m/claw` **根本没有产物列表**
   （`MobileClawPage.tsx` 全文只有一个 `previewArtifact` Sheet，无面板）。
   ⇒ 窄窗口 / 手机用户只剩「轮内卡片」这一个入口，而轮内卡片依赖 `turn.artifacts` 帧。
3. **语义上**：`stripContainerPaths` **只清洗 `./out/xxx` 和绝对容器路径**
   （`shared/lib/strip-container-paths.ts:14-16`），**`out/报告.docx`、`out 目录下`、`` `out/analysis.py` ``
   全部原样透出**（已用 node 实测，见 §5）。而系统提示词里「禁止说 `./out/`」这条铁律
   （`backend/internal/prompts/claw.go:119-126`）本身在上下文里把 `./out/` 这个 token 重复了 20 多次
   —— 模型学会了不写带 `./` 的那一种，写出来的恰好是清洗器唯一漏掉的那一种。

**用户「改一下这个文件」的抓手：零。** 全仓没有任何一处把产物回链进 composer——
`ChatComposer` 只认「上传附件」和「引用文献」两类 chip，产物不是其中任何一类。

---

## 一、产物在 UI 上有几个入口

| # | 入口 | 组件 | 触发条件 | 覆盖端 |
|---|---|---|---|---|
| 1 | **轮内文件卡**（主力） | `TurnArtifacts.tsx` | `turn.artifacts` 非空（`MessageTurn.tsx:73`）且 `sessionId` 非空（`:350`） | 桌面 + 移动 |
| 2 | **右侧扩展区（列表态）** | `ClawArtifactPanel.tsx:84-112` | `showRightPanel` = `!figuresInline && !isNarrow && (rightOpenPref ?? hasArtifacts)`（`ConversationWorkspace.tsx:223-226`） | **仅桌面 >1024px** |
| 2b | **右侧扩展区（预览态）** | `ClawArtifactPanel.tsx:57-82` → `ClawArtifactPreview` | 上条 + `previewArtifact !== null` | 仅桌面 >1024px |
| 3 | **窄屏 Sheet 预览** | `ConversationWorkspace.tsx:519-539` / `MobileClawPage.tsx:327-342` | `previewArtifact !== null && isNarrow` | ≤1024 + 移动 |
| 4 | **对话内联出图** | `TurnFigures.tsx` | `cfg.figuresInline`（**只有 sci_draw**，`ClawPage.tsx:109`） | 桌面 + 移动 |
| 5 | 下载链接 | `TurnArtifacts.tsx:146-155` / `ClawArtifactPreview.tsx:122-133` | 卡片/预览头常驻 | 全端 |

**侧栏没有任何产物入口。** `rg "artifact|产物|成果|文件" src/features/claw/components/sidebar/*.tsx` 零命中。
会话列表项上没有产物计数、没有回形针、没有「这个会话有 3 个交付物」的任何提示。

**全站没有跨会话的产物聚合页。** `useAgentArtifacts` 的 queryKey 是 `[feature,'artifacts',sessionId]`
（`api/artifacts.ts:65`），产物生命周期 = 会话生命周期（文件头注释 `:6`）。用户想找上周生成的那份综述，
唯一路径是「翻会话列表 → 猜哪个会话 → 进去 → 开扩展区」。

### 1.1 两条数据链，join key 是 `path`

```
agent turnLoop finally
  └─ emitArtifacts()  → WS frame {type:'artifact', name, path:'out/x.docx', kind, mime, size}
        ├─ 实时：fold.ts:142-150 → turn.artifacts
        └─ 回放：backend EvArtifact → history entry type='artifact'
                 → agent-history.ts:324-342 → turn.artifacts

GET /user/<feature>/session/artifacts
  └─ backend harvestSession(on-list) → MinIO + agent_artifacts 行
        └─ useAgentArtifacts → ClawArtifact[]（带 id / title / description）

MessageTurn.mergeTurnArtifacts(turn, dtos)   ← MessageTurn.tsx:72-86
  按 path 左连接：turn.artifacts 是权威集合，DTO 提供 id/标题
```

🔴 **关键不对称**：轮内卡片的**存在性**由帧决定，**可用性**（预览/二进制下载）由 DTO 决定。
`mergeTurnArtifacts` 第一行就是 `if (!turn.artifacts || turn.artifacts.length === 0) return [];`
（`MessageTurn.tsx:73`）—— **没有帧就没有卡，哪怕 DTO 列表里躺着 10 个文件。**
右侧扩展区则相反：它直接把 `sessionArtifacts`（DTO 全集）喂给 `TurnArtifacts`
（`ClawArtifactPanel.tsx:93`），完全不看帧。

⇒ **两个入口在不同时刻显示不同的集合，且没有任何 UI 解释这件事。**

---

## 二、预览支持哪些格式，不支持的怎么降级

分类器：`preview/artifact-format.ts:80-115`（纯函数，按 `kind` → MIME → 扩展名，顺序敏感）。

| 格式 | category | 渲染器 | 需字节 | 备注 |
|---|---|---|---|---|
| **pptx** | ❌ `unpreviewable` | 无 | — | `artifact-format.ts` 里 **完全没有 pptx 分支**（`:89-114` 逐条核对）。落到 `:114 return 'unpreviewable'` → `TurnArtifacts.tsx:99` 判定 `canPreview=false` → **连「预览」按钮都不渲染**，只有下载 |
| **docx** | `docx`（`:108`） | `DocxPreview.tsx` → mammoth + DOMPurify | ✅ | mammoth 动态 import（`DocxPreview.tsx:19`） |
| **pdf** | `pdf`（`:94`） | lazy `PdfViewer`（`ClawArtifactPreview.tsx:24-26,172-177`） | ❌ URL 直读 | `withCredentials:true`，走 `n` cookie |
| **svg** | `svg`（`:92`，**刻意排在 image 之前**） | `SafeSvg`（DOMPurify）内联 | ✅ | `ClawArtifactPreview.tsx:232-240`，含「塌成 0 尺寸」的修复注释 |
| **png/jpg/webp/gif/bmp/avif** | `image`（`:93`） | `<img>` | ❌ URL 直读 | `:165-171` |
| **csv/tsv/xlsx/xls** | `spreadsheet`（`:96-106`） | lazy `SpreadsheetPreview` → SheetJS | ✅ | 截断 500 行 × 60 列（`SpreadsheetPreview.tsx:6-7`），超出提示「已截断」 |
| html | `html`（`:111`） | 沙箱 iframe `srcDoc`，可切源码 | ✅ | `ClawArtifactPreview.tsx:276-301`，`sandbox="allow-scripts allow-popups"` 无 `allow-same-origin` |
| md | `markdown` | `MarkdownRenderer` | ✅ | |
| json / 30+ 种源码 | `json` / `code` | 包成 fenced code 走 MarkdownRenderer + highlight | ✅ | `CODE_LANG` 表 `:26-67` |
| `*.fig.json` | `figure`（`:91`，**必须排在 json 之前**） | lazy `FigureView` → composeFigure | ✅ | sci_draw A 车道 |
| zip / 目录 | `archive`（`:89`） | 无 | — | `:179-181`「压缩包 / 文件夹不支持预览，请下载查看。」 |
| 其它二进制 | `unpreviewable` | 无 | — | `:182-184`「该文件类型暂不支持预览，请下载查看。」 |

**降级路径统一是 `Unavailable`**（`ClawArtifactPreview.tsx:337-353`）：一个 `FileQuestion` 图标 +
一句话 + 一个「下载」按钮。**降级文案不区分「这个格式我们做不了」和「这个文件坏了」** ——
第三个分支 `bytesQ.isError` 的文案是「预览加载失败，请重试或下载查看。」（`:190-192`），
但**没有重试按钮**，「请重试」是一句无法执行的指令。

### 2.1 三个具体缺陷

**(a) pptx 是唯一「我们自己生成、自己却看不了」的格式。**
制作PPT 的导出按钮里两个 pptx 选项（`ClawArtifactPreview.tsx:98-119`）导出的文件，
下一轮如果被写回 `./out/`，在自家 UI 里就是一个不可预览的黑盒。
（注：boltslides 的主交付是 html，pptx 是导出动作的产物、走浏览器下载不回落产物列表——
但 claw / stat_lab 的 agent 完全可以直接 Write 一个 pptx 进 `./out/`，`agent/src/turn/artifacts.ts`
的 `DELIVERABLE_EXTS` 明确收 `.pptx`。）

**(b) docx 预览会把三线表画成全网格表。**
`DocxPreview.tsx:53` 的 className 里有 `[&_td]:border [&_td]:border-border`
—— **无条件给每个单元格加边框**。而 stat_lab 的旗舰交付物就是**三线表**（只有顶线、表头线、底线）。
用户在预览里看到的表格样式与下载后 Word 里打开的样式**不一致**，且是往「更不专业」的方向不一致。

**(c) `TurnArtifacts` 的图片缩略图扩展名表与分类器不同步。**
`TurnArtifacts.tsx:21` 的 `IMAGE_EXTS` 没有 `.avif`，`artifact-format.ts:23` 的 `IMAGE_EXT` 有。
⇒ avif 产物在卡片上显示通用文件图标，点开预览却是图片。低危，但说明这两张表已经开始漂移。

---

## 三、哪些时刻用户看不到产物（按严重度排序）

### 3.1 🔴 整轮执行期间：claw / stat_lab 完全看不到（最严重）

**证据链：**
- agent 侧：`agent/src/turn/turnLoop.ts:952-956` —— 产物帧在 `finally` 里、`message_complete` 之前发。
  `emitArtifacts` 的实现是「snapshot 基线 → 轮末 diff」（`agent/src/turn/artifacts.ts:339-345`），
  **结构上就不可能在轮中途发**。
- 前端侧：`ConversationWorkspace.tsx:171-185`
  ```ts
  const revealWhileBusy = inlineFigures || autoOpenLatest;   // :173
  useEffect(() => { if (!revealWhileBusy || !busy) return; ... setInterval(2500) }, ...)  // :179-185
  ```
  `revealWhileBusy` 只在 sci_draw（`figuresInline`）和 boltslides（`autoOpenLatestArtifact`）为真。
  **`CLAW_CFG`（`ClawPage.tsx:57-68`）和 `STAT_LAB_CFG`（`:117-141`）两项都没配** ⇒ 不轮询。

**后果**：一轮里 agent 跑 Bash 8 分钟、Write 三个文件，用户在这 8 分钟里能看到的只有
`ProcessFold` 里的工具 chip「写入文件 报告.docx」（`tool-semantics.ts:80` 的 label + `:64-66` 的 basename 参数）。
**这正是用户反馈的「进行文件输出在用户端看不到」的字面对应。**

唯一的中途反馈是 `ToolCallBlock.tsx:194-200` 的**构建期流式尾窗**：Write 的入参明文逐 token 到达时，
chip 下方显示最后 4 行 + 「已写入 N 字」。但它 ① 只对 Write 类工具成立、② 只在实时流成立、
③ 藏在 `ProcessFold` 里、④ `tool_use_complete` 一到就消失。

### 3.2 🔴 ≤1024px：右侧扩展区**整体不存在**

```ts
const isNarrow = useMediaQuery('(max-width: 1024px)');            // :143
const rightPanelAvailable = !inlineFigures && !isNarrow;          // :223
{rightPanelAvailable && (<Button ...>扩展区</Button>)}             // :344-365
```
不是「收起」，是**连顶栏那颗开关按钮都不渲染**。1024px 覆盖 iPad 横屏、13" 笔记本分屏、
任何把浏览器拖窄一半的桌面用户。这些人只剩轮内卡片。

### 3.3 🔴 移动端 `/m/claw`：无产物列表，且只支持 claw

- `MobileClawPage.tsx` 全文没有 `ClawArtifactPanel`，只有一个由 `previewArtifact` 驱动的 Sheet（`:327-342`）。
  `previewArtifact` 的**唯一设置点**是 `MessageTurn` 的 `onPreview={setPreviewArtifact}`（`:267`）。
  ⇒ **移动端没有帧就彻底无路可走**，连列表都没有。
- `routes.tsx:19-35` + `MobileClawPage.tsx:44` 注释「claw-only：移动端不承载 boltslides/sci_draw」。
  stat_lab 同样没有移动端路由。⇒ 用户在桌面用数据分析生成了三线表，**手机上打不开那个会话**：
  `/m/claw/:sid` 会用 claw 的 history 端点去取一个 stat_lab 的 session → `OwnsSession` 是 feature 作用域的
  → `utils.Error(c, 4404, …)` → `httpStatusFromCode` 把 4404 映射成 **HTTP 404**
  （`backend/internal/common/utils/response.go:77-79`）→ `MobileClawPage.tsx:124-126` 命中 `status===404`
  → `onNotFound` → 静默跳回新对话。用户体验上就是「点了链接，回到了空白页」。

### 3.4 🟠 sci_draw：非图片产物被**静默丢弃**

```tsx
{sessionId && turnFiles.length > 0 && (figuresInline
  ? <TurnFigures figures={turnFiles.filter(isFigureArtifact)} .../>   // MessageTurn.tsx:352
  : <TurnArtifacts .../>)}
```
`isFigureArtifact`（`MessageTurn.tsx:46-50`）只放行 `figure|svg|image`。
而 sci_draw 的 skill 明确要求把脚本一起留下：
`agent-skills/sci-draw-skills/charts/SKILL.md`「产物在 `./out`：`.svg`（主交付）+ 可选 `.png` + 可选 `.py`（脚本，便于复现）」。
那个 `.py` **在 UI 上不存在**：`filter` 丢掉它，而 `rightPanelAvailable = !inlineFigures`（`:223`）
让右侧面板永久不可用 ⇒ **没有任何一个入口能到达它**。同理 `.csv` 中间数据、`analysis.md`。

另：`TurnFigures.tsx:69-82` 的位图分支（`.png`）**没有下载按钮** ——
只有 SVG/fig.json 走 `FigureSvgDisplay` 才有 SVG/PNG 两颗下载键（`FigureSvgDisplay.tsx:54-64`）。

### 3.5 🟠 轮末的「无 id 窗口」：二进制产物有一颗**必然 404 的下载按钮**

时序：
1. `artifact` 帧到 → `fold.ts:142-150` 填 `turn.artifacts` → 卡片**立刻渲染**。
2. 此时 DTO 还没到 ⇒ `mergeTurnArtifacts` 走 `dto ?? {path,name,kind,mime,size}` 分支（`MessageTurn.tsx:82`），
   **合成卡无 `id`**。
3. `TurnArtifacts.tsx:101-103`：无 id → `downloadUrl = agentArtifactUrl(...)`，即
   `GET /user/claw/session/artifact?path=out/x.docx&download=1`。
4. 该端点是「实时回读回退」，`backend/internal/claw/artifact.go:372-393` 的 switch
   **只处理 `image` 和 `text`**，二进制落 `default: utils.Error(c, 4404, "暂不支持下载该类型文件")`。

⇒ **在 `message_complete` 触发 invalidate（`makeAgentConversationHook.ts:363-367`）到 harvest 完成之间，
点 docx/xlsx/pptx/pdf/zip 卡片的下载 = 404。** harvest 是 on-list 全量收割（读所有 out 文件 + 传 MinIO，
`backend/internal/claw/artifact_harvest.go:34-62`），大文件多文件时这个窗口是**秒级**，不是毫秒级。
storage 未启用时这个窗口是**永久**的。

（后端在 live 回退**列表**里已经用 `liveServableFile`/`liveBinaryExts`（`artifact.go:158-168`）
跳过二进制免死按钮 —— 但那个防护**只保护列表路径，保护不了帧合成的卡片**，因为卡片压根不经过列表。）

### 3.6 🟡 用户手动收起扩展区后，新产物不再自动露出

`rightOpen = rightOpenPref ?? hasArtifacts`（`:225`）是三态。用户点过一次「收起」→ `rightOpenPref=false`
（`collapseRight`，`:207`）→ 此后**本次挂载内**再产出多少文件面板都不会自己开。
重置只发生在两个真实会话之间切换（`:160-166`），而切换本身会 remount（`ClawPage.tsx:397` 的 key）。
这是刻意设计（`:144-154` 有大段注释），但配合 3.1 的「轮中不刷新」，结果是
**用户收起面板后，一轮结束时唯一的产物信号就是轮内那张卡** —— 如果他此刻已经滚到别处，就完全错过。

### 3.7 🟡 会话重入/刷新：卡片能恢复，但依赖后端 journal

`agent-history.ts:324-342` 会把 `type:'artifact'` 的合成 entry 绑回 `turn.artifacts`，
所以刷新后轮内卡片**能**恢复。但这条链依赖 backend 的 `EvArtifact` 折叠
（`backend/internal/agentbridge/eventlog_store.go`）——**在这套 journal 上线之前产生的会话，
历史里没有 artifact entry ⇒ 刷新后所有轮内卡片永久消失**，只剩右侧扩展区（桌面 >1024）能兜。
移动端 + 窄屏在这些老会话上 = 产物完全不可达。

### 3.8 🟡 「同一个文件在多轮各出一张卡」，且都指向最新版本

`diffOut` 按 size+mtime 判变更（`agent/src/turn/artifacts.ts:186-187`），
所以第 2 轮 Edit 同一个 `out/report.docx` 会**再发一次帧** → 第 2 轮又出一张同名卡。
两张卡的 `path` 相同 ⇒ 关联到**同一个 DTO / 同一个 id** ⇒ **第 1 轮那张卡现在下载下来是第 2 轮的内容**。
卡片上没有版本、没有时间、没有大小（`TurnArtifacts.tsx:124-133` 只渲染 title/name + description）。
用户往上翻找「刚才那版」，拿到的是新版，且界面不会告诉他。

### 3.9 🟡 产物删除后仍然可见

harvest 是 **upsert-only，绝不按 live 工作区删行**（`artifact_harvest.go:29-33` 的大段注释，
理由是执行器工作区是临时的）。agent 中途删掉 `./out/x.md` → 扩展区里那条**永远留着且可下载**。
这是有意的取舍，但前端**零标注**：用户无法区分「这是当前成果」和「这是被作废的旧成果」。

---

## 四、用户想「改一下这个文件」时，UI 上有没有抓手

**没有。一个都没有。**

逐条核对：

| 可能的抓手 | 实际情况 |
|---|---|
| 卡片上的「继续修改 / 重新生成」按钮 | `TurnArtifacts.tsx` 只有三种按钮：`打包下载`(`:83-92`)、`预览`(`:134-145`)、`下载`(`:146-155`)。无其它 |
| 预览面板里的编辑/批注 | `ClawArtifactPreview.tsx` header 只有导出 deck(仅 html)、下载、关闭（`:85-144`）。正文全部只读渲染 |
| 把产物作为引用塞进下一条消息 | `ChatComposer` 的 chip 只有两类：上传附件、引用文献（`ChatComposer.tsx:123` 注释）。**产物不属于任何一类**，也没有从产物侧发起的入口 |
| `prefill` 预填提示词 | `ChatComposerHandle.prefill`（`ChatComposer.tsx:100,142`）唯一调用点是 hero 的示例卡（`ConversationWorkspace.tsx:488`、`MobileClawPage.tsx:241`）。**产物侧从不调用它** |
| 失败轮重试 | `onRetryTurn` 只对**末轮**、且 `errorMessage` 存在时生效（`MessageTurn.tsx:366-374` + `makeAgentConversationHook.ts:798-809`）。它重发的是**用户原文**，与产物无关 |
| 文件名可复制 | 卡片标题是 `<div>` 带 `title` 属性（`TurnArtifacts.tsx:125-127`），可以选中复制。这是目前唯一的「抓手」，而且是意外的 |

⇒ 用户唯一的操作是：**自己看着卡片把文件名打进输入框，然后祈祷模型能对上。**
而这里有个二次陷阱：卡片上显示的可能是 manifest 里的**中文 title**（`TurnArtifacts.tsx:107`
`const primary = artifact.title || artifact.name`），用户复制的那串字**不是文件名**。
模型收到「把《锂电池固态电解质综述》改一下」之后，得自己 Glob 去猜是哪个文件。

**这解释了「进行编辑文件也容易出现错误，修改不到」的前端侧成因**：
用户指代的对象和 agent 能定位的对象之间，前端没有提供任何桥梁。

补充：Edit 失败时的可见性也很弱。
- 失败的工具块 chip 是 amber「未成功」（`ToolCallBlock.tsx:181-186`），**默认收起**（`:94` 注释明写「失败的工具也默认收起」）。
- 它本身还关在 `ProcessFold` 里，而 `ProcessFold` 完成后**默认收起**（`ProcessFold.tsx:32` `expanded = override ?? streaming`）。
- 收起态唯一的失败信号是标题栏那句「N 次未成功」（`MessageTurn.tsx:272-278`）。
- ⇒ 「Edit 失败 → 文件没改 → 但上一轮的卡片还在 → 模型正文说『已更新』」这一组合，
  在界面上**完全看不出破绽**。而 `diffOut` 因为文件没变**不会发新帧**，所以本轮连一张新卡都没有 ——
  **「本轮没出卡」这个真信号，被「上一轮的卡还在屏幕上」淹没了。**

---

## 五、正文里「保存到 out/xxx.docx」前端有没有改写

有，但**几乎覆盖不到用户抱怨的那种写法**。

### 5.1 前端清洗器 = `shared/lib/strip-container-paths.ts`

（注：agent 侧的 `leakGuard`（`agent/src/turn/leakGuard.ts`，经 `turnLoop.ts:19` 引入）**不是**路径清洗器——
它管的是 DSML 协议标记泄漏，对齐表在 `backend/internal/agentbridge/eventlog_validate.go:206-213`。
路径泄漏的前端对应物只有 `stripContainerPaths` 这一个。）

两条正则（`strip-container-paths.ts:14-16`）：
```ts
const REL_OUT = /`?\.\/out\/([^\s`)）]+)`?/g;                              // 必须带 ./ 前缀
const ABS_CONTAINER = /`?\/(?:home|workspace|app|root|srv|mnt|data)\/[^\s`)）]+`?/g;
```
文件头注释自己写明「**刻意极度保守** … 不碰裸 `out/`（可能是 checkout/ layout/ 的一部分）」。

### 5.2 实测行为矩阵（node 复现原实现）

| 输入 | 输出 | |
|---|---|---|
| `已保存到 ./out/综述.md` | `已保存到 综述.md` | ✅ 清洗 |
| `产物位于 /home/bun/sessions/abc/out/a.csv` | `产物位于 a.csv` | ✅ 清洗 |
| **`文件已输出到 out/报告.docx`** | **原样** | ❌ |
| **`结果保存在 out 目录下`** | **原样** | ❌ |
| **`` 我把它写到了 `out/analysis.py` ``** | **原样** | ❌ |
| **`请查看 out/ 目录中的三线表`** | **原样** | ❌ |
| **`已在 ./out 目录生成 3 个文件`** | **原样** | ❌（`./out` 后面不跟文件名就不匹配） |
| **`见 out/tables/table1.docx`** | **原样** | ❌ |

用户原话是「agent 说文件输出到 **out 目录下**」—— **这正是矩阵里第 4 行，清洗器完全不管。**

### 5.3 根因是提示词与清洗器盯着同一个字符串

`backend/internal/prompts/claw.go:119-126`：
> **【铁律 · 绝不暴露内部路径】** … 你**不需要、也绝不可以**在正文里：
> · 提及任何文件系统路径 / 目录名（**不写 "./out/"**、不写 "已保存到 xxx.svg"、不写绝对路径、
>   不写 "根目录 / 工作目录 / 当前目录"）；
> … 错误说法（禁止）: "文件已保存到 **./out/report.md**"

同一份提示词在 `:114-138` 这 25 行里为了教它**往哪写**，把 `./out` 这个 token 重复了 **14 次**
（实测：`grep -o '\./out' backend/internal/prompts/claw.go | wc -l` = 14，且全文 14 次**全部落在这 25 行内**
—— "写进 ./out/"、"./out/ 根下"、"./out/综述.md"、"./out/manifest.json"、"./out/ 之外"…）。

⇒ 三件事同时成立：
1. 模型被**高强度 priming** 了 `./out/` 这个 token（它是写入指令的一部分，无法删）；
2. 负向规则点名禁止的是**带 `./` 的那一种**；
3. 前端清洗器能清的**也只有带 `./` 的那一种**。

**⇒ 幸存者偏差的必然产物就是 `out/xxx` 和「out 目录」。** 这不是模型不听话，是防线的两道闸
用了同一把尺子，而模型在梯度上最省力的规避方式恰好是那把尺子量不到的地方。
（本仓已有同型教训：`docs/claw-ascii-diagram-relapse-2026-07`「否定式规则没用，须正面模板」。）

### 5.4 清洗器的覆盖面也有洞

`rg stripContainerPaths src` 只有 5 个消费点：
| 位置 | 清洗对象 |
|---|---|
| `MessageTurn.tsx:291` | ProcessFold 内的中间叙述文本 ✅ |
| `MessageTurn.tsx:321` | 最终答案文本 ✅ |
| `ToolCallBlock.tsx:230` | 构建期流式尾窗 ✅ |
| `tool-semantics.ts:76` | Bash 的 command 首行摘要 ✅ |
| `PrismMessageTurn.tsx` | prism（另一 feature） |

**没被清洗的展示面：**
- **`ThinkingFold`**（`MessageTurn.tsx:229-231`）—— `text={turn.thinkingText}` **裸传**。
  思维链里出现绝对路径的概率**远高于**正文（它就是模型在自言自语「I'll write to /home/bun/…」），
  而这个折叠在流式期是**默认展开**的（`ThinkingFold.tsx:37` `expanded = override ?? isActive`）。
- **`ToolPayloadFold`**（`ToolCallBlock.tsx:274-308`）—— 展开工具详情看到的 input JSON，
  只过 `maskToolSource`（数据源别名，`mask-tool-source.ts:43-58`），**不过路径清洗**。
  ⇒ 点开「写入文件」chip，`{"file_path": "/home/bun/sessions/xxx/out/report.docx", ...}` 完整可见。
- `QuestionPrompt` / `TurnErrorNotice` 的文本（未逐字核，但同样不在消费点列表里）。

---

## 六、四个 feature 的产物 UI 差异 —— 谁最好、为什么

| 维度 | claw 智能助手 | boltslides 制作PPT | sci_draw 科研绘图 | stat_lab 数据分析 |
|---|---|---|---|---|
| 生成中可见 | ❌ 不轮询 | ✅ 2.5s 轮询 | ✅ 2.5s 轮询 | ❌ 不轮询 |
| 产出后自动露出 | 面板自动开（首次）| ✅ **自动打开预览**（`:191-205`）| ✅ 图直接长在对话里 | 面板自动开（首次）|
| 零点击可见成果 | ❌ 需点预览 | 🟡 自动开了预览 | ✅ **完全零点击** | ❌ 需点预览 |
| 生成中占位 | ❌ 无 | ❌ 无 | ✅「图像生成中…」(`TurnFigures.tsx:64-66`) | ❌ 无 |
| 后续动作 | 只有下载 | ✅ **3 个导出格式**(`ClawArtifactPreview.tsx:85-121`) | ✅ SVG/PNG 双下载 | 只有下载 |
| 非主产物 | 全部可达 | 全部可达 | 🔴 **静默丢弃** | 全部可达 |
| 移动端 | 🟡 有页面无列表 | ❌ 无路由 | ❌ 无路由 | ❌ 无路由 |
| 预览保真 | — | ✅ html 就是原生形态 | ✅ 矢量内联 | 🟠 三线表被画成网格表 |

### 结论：**sci_draw 的体验最好，boltslides 次之，claw / stat_lab 最差。**

**sci_draw 好在哪 —— 它取消了「文件」这个中间概念。**
`TurnFigures` 把成果**直接渲染成对话里的一张图**（`MessageTurn.tsx:352`），
没有卡片、没有面板、没有下载才能看的动作、没有路径可泄漏。
用户看到的和他要的是同一个东西。连「还没好」都有专门的占位态。
它的代价是把非图产物整个丢掉（§3.4）——**这恰恰印证了它的成功逻辑：
它不是"产物 UI 做得好"，而是"它把产物变成了内容"。**

**boltslides 次之**：它仍然是「文件」，但通过 `autoOpenLatestArtifact`（`ClawPage.tsx:86`）
把「点开」这一步替用户做了，且 html 在 iframe 里就是它的最终形态（不是某种降级预览），
还提供了 3 个真实需要的导出格式。

**claw / stat_lab 最差，且 stat_lab 更差**：
两者都是「轮末才有帧 + 不轮询 + 卡片要点两次才能看到内容」。
stat_lab 额外雪上加霜的是 —— **它的核心交付物 docx 三线表，在自家预览器里被画成了全网格表**（§2.1b），
用户看到的预览比真实文件难看，反而可能不敢交付。而它的用户是最不可能有耐心研究「扩展区在哪」的一群人。

---

## 七、给新架构的取证结论（不含方案，只列约束）

1. **「轮末 diff」这个产物发现机制，决定了轮中不可能有产物可见性。** 任何不动这一层的 UI 改造，
   最多只能把 §3.1 从「完全看不到」优化成「2.5 秒延迟」（复制 boltslides 的轮询），
   而轮询的代价是每 2.5s 触发一次后端全量 harvest（`artifact_harvest.go:34`，读所有 out 文件 + MinIO 上传）。
2. **产物的「存在性」和「可用性」来自两条独立数据链，join key 是 `path` 字符串。**
   任何一条断了就是一种残废态（无卡 / 死下载按钮 / 卡在但点了没反应）。
   这三种残废态目前**都在线上可复现**。
3. **`turn.artifacts` 是唯一的「哪一轮产出了什么」的信息**，而它只存在于帧和 journal 里。
   一旦要做「文件的版本历史 / 这个文件被哪几轮改过」，现有前端数据模型**没有任何字段**可用
   （`shared/types/chat.ts:148` 的 `TurnArtifact` 只有 name/path/kind/mime/size）。
4. **右侧扩展区是「会话级文件柜」，轮内卡片是「轮级交付」，两者共用同一个 `TurnArtifacts` 组件**
   （`ClawArtifactPanel.tsx:93`），因此扩展区里那块标题写着「生成的文件」而不是文件柜该有的样子，
   也没有排序/搜索/分组/时间/大小。它按 `created_at` 升序（`ConversationWorkspace.tsx:194` 注释），
   **最新的在最下面**。
5. **路径泄漏必须在 agent 出口而不是前端展示层解决。** 前端有 5 个消费点、2 条正则、
   至少 3 个未覆盖的展示面（thinking / 工具 JSON / 错误文案），
   而 agent 出口只有一处。继续在前端加正则是在错误的层加防线 ——
   何况「out 目录」这种自然语言表述，正则原则上就不该去猜。
6. **移动端不是「桌面的窄版」，是「另一个残缺的产品」**：无面板、无 stat_lab/sci_draw/boltslides 路由。
   任何号称「全端可用」的交付方案都要先回答移动端怎么办。

---

## 附：本报告引用的文件清单（均已通读）

```
frontend-user/src/features/claw/
  api/artifacts.ts, types.ts, session.ts(部分), socket.ts(部分)
  components/chat/TurnArtifacts.tsx, TurnFigures.tsx, MessageTurn.tsx, fold.ts,
                  ConversationWorkspace.tsx, ChatComposer.tsx(部分)
  components/preview/ClawArtifactPanel.tsx, ClawArtifactPreview.tsx,
                     artifact-format.ts, DocxPreview.tsx, SpreadsheetPreview.tsx
  components/figure/TurnFigures 依赖 FigureSvgDisplay.tsx(部分)
  components/sidebar/*（grep 确认零产物入口）
  components/ClawPreview.tsx（**静态设计 mock，与真实产物链路无关**）
  hooks/makeAgentConversationHook.ts, useClawConversation.ts
  pages/ClawPage.tsx, pages/mobile/MobileClawPage.tsx, routes.tsx
frontend-user/src/shared/
  components/chat/ToolCallBlock.tsx, ProcessFold.tsx, tool-semantics.ts, ThinkingFold.tsx(部分)
  lib/strip-container-paths.ts, agent-history.ts, chat-turn-layout.ts(部分), mask-tool-source.ts(部分)
  types/chat.ts(部分)
越界取证：
  agent/src/turn/artifacts.ts, turnLoop.ts(grep)
  backend/internal/claw/artifact.go, artifact_harvest.go
  backend/internal/prompts/claw.go
  backend/internal/agentbridge/eventlog_validate.go(grep), eventlog.go(grep)
  agent-skills/sci-draw-skills/charts/SKILL.md(grep)
```
