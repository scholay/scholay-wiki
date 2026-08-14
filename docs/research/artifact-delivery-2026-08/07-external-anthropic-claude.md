# 外部调研 07 · Anthropic / Claude 系的「文件交付」形态

> 调研日期：2026-08-07 · 调研人：Claude Opus 5 子代理
> 定位：`docs/research/artifact-delivery-2026-08/` 专项的**外部参照系**分册。
> 只写「我真读过的」——每条结论带 URL 或 `file:line`。
> 仓库侧结论只做**对照**，不是本册主体；完整仓库审计见同目录其他分册。

---

## 〇 · 一句话总判断

**Anthropic 在 2024→2026 之间，把「产物」从「对话协议里的一种特殊消息」改造成
「文件系统里的一个文件 + 一次显式的交付动作 + 一个带 URL 的持久实体」。**
这三层是分开的、可分别演进的：

| 层 | Anthropic 的做法 | Scholar 当前 |
|---|---|---|
| **产生** | 普通文件写在容器 FS 上（`create_file` / `str_replace` / bash） | 同（Write/Edit/Bash/ExportDocument）✅ |
| **判定「这是给用户的」** | **模型显式调用 `present_files(filepaths[])`** | ❌ **靠 backend 扫 `./out/` 目录 diff 猜** |
| **呈现** | 客户端拿到 output path → 渲染卡片 / 右侧面板 / 版本历史 / 分享 URL | 会话级 artifacts 列表 + turn 内 artifact block |

Scholar 的三条痛点，**全部落在中间那一层**：

1. 「文件输出用户看不到」= 目录 diff 漏检（越界写、被 skip 目录、超 20 帧截断）；
2. 「编辑改不到」= Edit 工具契约比 Anthropic 弱三档（下面 §6 逐条对照）；
3. 「说文件在 out 目录下」= **因为交付是目录约定，`./out/` 就必须写进系统提示词，
   而写进去就一定会漏出来**——这是结构性的，不是提示词没写好。
   实测 `backend/internal/prompts/claw.go` 里 `out/` 字面量出现 **14 次、分布在 10 行**，
   然后在 `:119-126` 用一条否定式铁律要求模型别说它。

> 这跟记忆里 [claw ASCII框图复发] 那条铁律是同一个病：**否定式规则治不了被正例重复喂养的行为**。
> Anthropic 的解法不是"更凶地禁止"，而是**把路径从"交付语义的载体"降级成"实现细节"**——
> 交付语义由 `present_files` 这个动词承载，模型说"我调用了 present_files"是无害的，
> 说"文件在 /mnt/user-data/outputs"才有害，而后者在它的叙事里不再是必须提的。

---

## 一 · 证据等级说明

本册引用三类源，可靠性不同，正文里会标：

- **【官方】** platform.claude.com / code.claude.com / support.claude.com / claude.com/blog
  / modelcontextprotocol.io / github.com/anthropics/*。
- **【一手环境】** 本机 `~/.claude/` 的实际落盘、以及**本会话自身的工具 schema**
  （我就是 Claude Code，Edit/Write/Artifact 的描述在我的 system prompt 里，可直接引用）。
- **【泄露】** `github.com/asgeirtj/system_prompts_leaks`、`github.com/jujumilk3/leaked-system-prompts`
  等第三方仓库里的 claude.ai 系统提示词。**不是官方发布物**，但与官方文档高度自洽
  （下面会指出交叉验证点）。凡此类结论标 medium/low。

---

## 二 · Claude Artifacts：两代协议，一次范式迁移

### 2.1 第一代（2024–2025）：Artifact 是**协议实体**，不是文件

**【泄露】** `schroneko/systemprompts/claude_sonnet_35_..._2024-11-02.md`
（https://github.com/schroneko/systemprompts）第 1–130 行是完整 `<artifacts_info>`。
关键机制：

- Artifact 由一个名为 `artifacts` 的**工具**创建，参数：
  `command` ∈ {`create`, `update`, `rewrite`}、`id`、`type`、`title`、`language`、`content`。
  （该文件 L182-200 有 `update` 的真实调用样例。）
- **`type` 是 MIME，决定渲染器**：
  `application/vnd.ant.code`（不渲染，纯代码视图）、`text/markdown`、`text/html`（单文件渲染成网页）、
  `image/svg+xml`、`application/vnd.ant.react`、`application/vnd.ant.mermaid`。
  同一份 HTML 文本，标 `text/html` 会被渲染、标 `vnd.ant.code` 只显示源码——
  **渲染意图是显式声明的，不是从扩展名猜的**（L44-58）。
- `id` 是**稳定句柄**：后续修改复用同一个 id，UI 才知道这是"同一个 artifact 的新版本"
  而不是新建（L35："For updates, reuse the prior identifier."）。
- **update vs rewrite 的分工（L106-112，逐字）**：
  - "Use `update` when only a small fraction of the text needs to change.
     You can call `update` multiple times to update different parts of the artifact."
  - "Use `rewrite` when making a major change that would require changing a large fraction of the text."
  - "When using `update`, you must provide both `old_str` and `new_str`. Pay special attention to whitespace."
  - "`old_str` must be perfectly unique (i.e. appear EXACTLY once) in the artifact and must match
     exactly, including whitespace. **Try to keep it as short as possible while remaining unique.**"

  最后半句很关键：**要求"在保持唯一的前提下尽可能短"**——这是在同时优化
  「token 成本」和「匹配鲁棒性」两个相反方向，把权衡明确交给模型，而不是让它随手截一大段。

- **`create` 时必须给完整内容，禁止省略号占位**（L78）：
  "Include the complete and updated content of the artifact, without any truncation or minimization.
   Don't use shortcuts like `// rest of the code remains the same...`"。
  理由写得很直白："we want the artifact to be able to run on its own without requiring any
  post-processing/copy and pasting"——**产物的验收标准是"能独立运行/独立使用"**。

**为什么这一代不是"文件"？** 因为它没有路径、没有目录、没有文件系统语义。
它有的是 `id`（句柄）+ `type`（渲染契约）+ 版本序列。
用户在右侧面板看到的是"一个东西的演进史"，不是"一个磁盘上的字节流"。
**这正是"用户看不到 out 目录"问题在协议层面被绕开的方式：根本没有目录可说。**

### 2.2 第一代的著名失效模式：`old_str` 不匹配 → 静默 OK + 幻影版本

**【官方 issue】** https://github.com/anthropics/claude-code/issues/9434
（标题：`[BUG] Claude web not given an error message when it passes in an incorrect string for old_str`，
2025-10-12 提交，现已关闭）。报告人让 Sonnet 4.5 在 claude.ai 上做了受控实验，结论：

> "if it passes in an invalid value for old_str **a new artifact is created which is identical to the old one
> and Claude is given an OK response with no error message**."

模型自己的观察（issue 正文引用的对话）：
> "Interesting - I got back "OK" from the function call, same as when it succeeds.
> So from my perspective, I don't get an error message."

用户侧观察到的现象：
> "It made a v2 but it looks identical to v1"

报告人对下游后果的描述，**和 Scholar 用户的原话几乎一字不差**：
> "When this happens organically Claude becomes increasingly deranged insisting that it's making
> changes that it isn't and that the current artifact is different than what it actually is."

**这就是「进行编辑文件也容易出现错误，修改不到」的教科书成因**，而且它出现在
Anthropic 自己身上。三个可复用的教训：

1. **编辑失败必须是"红灯"，不能是"静默 OK"。** 一个恒 OK 的写路径 = 一条永远绿的规则
   （这条本仓库 CLAUDE.md 已经吃过亏并写成了铁律）。
2. **失败不能产生版本。** 幻影 v2 比"什么都没发生"更糟：它让用户和模型都相信改动落了地。
3. **失败信息必须让模型能自我纠正。** 报告人的诉求是
   "ideally with a reminder of the contents of the file"——即**失败回执里带回当前真实内容**。

### 2.3 第二代（2026）：Artifact = 写在 outputs 目录的一个文件

**【泄露 · medium】** `asgeirtj/system_prompts_leaks/Anthropic/claude-sonnet-4.6.md`
（本机副本 `/private/tmp/.../scratchpad/sonnet46.md`，174KB）L1133-1156 `<artifact_usage_criteria>`：

> "**An artifact is a file written with `create_file`. Placed in `/mnt/user-data/outputs` with one of
> the extensions below, it renders in the user interface.**"
> …
> "Any file type is fine, but these extensions render specially in the UI:
> Markdown (.md), HTML (.html), React (.jsx), Mermaid (.mermaid), SVG (.svg), PDF (.pdf)."

同一份文件 L1182：
> "Never include `<artifact>` or `<antartifact>` tags in responses to users."

**交叉验证**：`jujumilk3/leaked-system-prompts/anthropic-claude-sonnet-4.5_20260128.md` L907
已经是 `str_replace` 工具（`"The string to replace must appear exactly once in the file."`），
且全文**搜不到** `antArtifact` 的 create/update/rewrite 协议。说明这次迁移在 2026-01 前已完成。

范式迁移的净效果：

| 维度 | 第一代（协议实体） | 第二代（文件 + 显式呈现） |
|---|---|---|
| 产生 | `artifacts` 工具专用通道 | 普通 `create_file` / `str_replace` / bash，**与非交付文件同一套工具** |
| 渲染判定 | `type` MIME 显式声明 | **扩展名 + 所在目录**（`/mnt/user-data/outputs` + `.md/.html/.jsx/...`） |
| 修改 | `command=update` + `old_str` | 就是普通的 `str_replace` |
| 版本 | 工具调用序列即版本 | 客户端按 present 的快照记版本 |
| 与代码执行的关系 | **割裂**（artifact 内容 vs 沙箱文件是两个世界） | **统一**（artifact 就是沙箱文件的一个子集） |

第二代赢在"统一"：docx/pptx/xlsx 这类**必须靠代码生成的二进制产物**，
在第一代的协议里根本没法表达（`content` 是文本）；在第二代里它们和 `.md` 完全同构。
**Scholar 产 docx/pptx/xlsx，所以只能走第二代路线——这一点没有选择余地。**

### 2.4 Claude Code 的 Artifact：产物升格为**带 URL 的持久实体**

**【官方】** https://code.claude.com/docs/en/artifacts —— 这是本册**信息密度最高的一篇**，
因为它是唯一把"产物的完整生命周期"写成产品文档的。逐条摘：

- **发布即 URL**：
  "An artifact is a live, interactive web page that Claude Code publishes from your session
  to **a private URL on claude.ai**." 默认私有（"A new artifact is visible only to you"）。
- **同路径 = 同 URL（幂等重发布）**：
  "Claude edits the underlying file and **publishes again to the same URL**."
  跨会话更新则必须**显式传 URL**：
  "To update an artifact from a different session, give Claude the artifact's URL and ask it to revise.
  **Without the URL, a new session always creates a new artifact rather than updating an existing one.**"
- **每次发布 = 一个版本，且可选择分享哪个版本**：
  "Each publish becomes a version, and from the **Share** control in the page header you can choose
  which version viewers see."
  **【官方 · support】** https://support.claude.com/en/articles/9547008-publish-and-share-artifacts 侧
  另有 "always share the latest version" 默认开、可关掉钉死某一版的语义。
- **权限模型**：viewer / editor 两级；editor 通过"拿 URL 在自己会话里改"来发布新版本，
  与跨会话更新是同一条路径——**权限不是 UI 特例，是同一个原语的参数化**。
- **发布前要用户批准，重发布不再问**：
  "Before publishing a new artifact, Claude Code asks for permission; …
  **Republishing an artifact you have already approved does not prompt again.**"
- **硬约束（Page constraints 表格，逐条）**：
  - No external requests：严格 CSP，脚本/样式/字体/图片跨主机全禁，`fetch`/XHR/WebSocket 全禁；
  - No backend：静态页，不能存表单数据、不能自己鉴权；
  - Single page：相对链接不解析，多段内容用页内锚点；
  - Source file types：**只能 `.html` / `.htm` / `.md`**，md 渲染成带样式的 HTML；
  - Rendered size：**≤ 16 MiB**。
- **沙箱源**：viewer 从 `*.claudeusercontent.com` 这个**独立源**加载
  （"loads each artifact from a sandboxed `*.claudeusercontent.com` origin"）——
  产物页与主站同源隔离，这是 XSS/数据外泄的物理闸。
- **治理面**：组织级开关、公开分享单独开关、**保留期策略**
  （private 与 shared 可设不同保留期）、审计日志事件族 `claude_artifact_*`、
  Compliance API 三个端点（list / 取某版本内容 / delete）。
- **可用性硬门槛**：必须 claude.ai 账号登录；**API key / gateway token / 云厂商凭证的会话不能发布**；
  Bedrock / Vertex / Foundry 上不可用；CMEK / HIPAA / ZDR 组织不可用。

**【一手环境】** 我本会话的 `Artifact` 工具 schema 与上文完全吻合：
`action: publish|list`、`file_path`（同路径重发布 = 同 URL）、`url`（跨会话更新的唯一手段）、
`label`（版本名，≤60 字符）、`force`（409 冲突时才用，正常应 re-read + merge）、
`favicon`（**要求跨版本稳定**："users find their tab by its icon, and a changed favicon reads as a
different page"）、`description`（gallery 卡片副标题）、`contract`（运行时版本，omit=保持）。

> `force` 那条尤其值得抄：**并发写默认 409，而不是默认覆盖**。
> Scholar 的 `Write` 目前是无条件覆盖（`registry.ts:196-214`），多轮/多端场景下会静默丢改动。

---

## 三 · 三层文件系统语义 + `present_files`：直接对症「out 目录暴露」

这是本册对 Scholar 最有价值的一节。

### 3.1 三层目录，语义写死在提示词里

**【泄露 · medium，但被官方 managed-agents 文档间接印证】**
`sonnet46.md` L1090-1095 `<file_handling_rules>`，逐字：

> CRITICAL - FILE LOCATIONS:
> 1. **USER UPLOADS** (files the user mentions): every file in context is also on disk at
>    `/mnt/user-data/uploads`. `view /mnt/user-data/uploads` to list.
> 2. **CLAUDE'S WORK**: `/home/claude`. Create all new files here first.
>    **Users can't see this directory; use it as a scratchpad.**
> 3. **FINAL OUTPUTS**: `/mnt/user-data/outputs`. Copy completed files here;
>    **it's how the user sees Claude's work. ONLY final deliverables** (including code files).
>    For simple single-file tasks (<100 lines), write directly here.

L1107-1112 `<producing_outputs>` 补了策略：

> SHORT (<100 lines): create the whole file in one tool call, save directly to /mnt/user-data/outputs/.
> LONG (>100 lines): build iteratively: outline/structure, then section by section, review, refine,
> **copy final version to** /mnt/user-data/outputs/.
> REQUIRED: **actually CREATE FILES when requested, not just show content, or the user can't access it.**

**【官方】** https://platform.claude.com/docs/en/managed-agents/files 印证了同构的设计
（路径名不同，语义相同）：
- `mount_path: "/data.csv"` → agent 在 `/mnt/session/uploads/data.csv` 读到；
- 省略 `mount_path` → 落 `/mnt/session/uploads/<file_id>`；
- **"Files mounted in the sandbox are read-only copies."**（上传物只读，改要另写新路径）；
- 单会话最多 500 个挂载文件；
- 会话产物用 `GET /v1/files?scope_id=sesn_abc123` 按会话列出后下载。

**关键设计点：uploads 是只读的。** Scholar 目前 `uploads/` 在 `artifacts.ts:27` 的
`ROOT_SKIP_DIRS` 里被跳过扫描，但**没有物理只读**——模型可以覆盖用户上传的原件。

### 3.2 `present_files`：交付是**动词**，不是**目录副作用**

**【泄露 · medium】** `sonnet46.md` L2471-2515，工具描述逐字：

> The `present_files` tool **makes files visible to the user** for viewing and rendering in the client interface.
>
> When to use: Making any file available for the user to view, download, or interact with ·
> Presenting multiple related files at once · After creating a file that should be presented to the user.
>
> When NOT to use: When you only need to read file contents for your own processing ·
> **For temporary or intermediate files not meant for user viewing.**
>
> How it works:
> - Accepts an array of file paths from the container filesystem
> - **Returns output paths where files can be accessed by the client**
> - Output paths are returned in the same order as input file paths
> - Multiple files can be presented efficiently in a single call
> - **If a file is not in the output directory, it will be automatically copied into that directory**
> - **The first input path … should correspond to the file that is most relevant for the user to see first**
>
> schema: `{ "name": "present_files", "parameters": { "properties": { "filepaths": {
>   "items": {"type": "string"}, "minItems": 1 } }, "required": ["filepaths"] } }`

配套的行为规范在 L1116-1129 `<sharing_files>`：

> To share files, call present_files and **give a succinct summary**. **Share files, not folders.**
> **No long post-ambles after linking**; the user can open the document; they need direct access,
> not an explanation of the work.
> …
> **Putting outputs in the outputs directory and calling present_files is essential;
> without it, users can't see or access their files.**

这一节里有**六个**可直接抄的设计决策：

| # | 设计 | 为什么它治我们的病 |
|---|---|---|
| 1 | 交付是一次**显式工具调用**，不是目录 diff | 模型的"我交付了"和系统的"我收到了"变成同一个事件，不再有"扫描漏了"的可能 |
| 2 | 工具**返回 client output paths** | 模型下一句要提"文件在哪"时，脑子里最新鲜的是**客户端可访问的标识**，不是容器路径。这是治"说 out 目录"的**正向替代**，而不是负向禁止 |
| 3 | 「不在 outputs 里就自动拷进去」 | 越界写入被**兜住**而非丢失。Scholar 的 `relocateStrays` 已经在做同一件事（`artifacts.ts:8`），但触发条件是扫描命中，不是模型声明 |
| 4 | **"Share files, not folders"** | 明确把目录排除在交付语义外。Scholar 相反：目录 = 一个 zip（`claw.go:130-134`），这是个额外的心智负担 |
| 5 | **第一个路径 = 最该先看的** | 交付顺序即优先级，UI 不用猜哪张卡是主产物 |
| 6 | **"No long post-ambles"** | 明确压制"交付后长篇解释"。用户抱怨的"agent 说文件输出到 out 目录下"，本质就是一段 post-amble。**不让它写这段话，路径就没机会漏出来** |

### 3.3 对照 Scholar：为什么现在的做法必然漏路径

`backend/internal/prompts/claw.go:108-138` 是 claw 的交付段。实测：

- `./out/` 字面量出现 **14 次、分布在 10 行**（`grep -o 'out/' claw.go | wc -l` = 14）；
- `:114-115` 正面指令："就把它**写进 ./out/ 子目录**。凡是写进 ./out/ 的文件都会作为**可下载产物**呈现给用户。"
- `:119-126` 是一条**否定式铁律**：
  "【铁律 · 绝不暴露内部路径】…不写 `./out/`、不写 `已保存到 xxx.svg`、不写绝对路径…"
- `:126` 甚至把反例原样写出来："错误说法(禁止): `文件已保存到 ./out/report.md`"

**结构性矛盾**：模型要正确交付，就必须知道 `./out/`；知道了，且被喂了 10 次，
再加一条禁令和一个反例（反例本身也是一次曝光），最终泄漏概率不可能压到 0。

Anthropic 的提示词里 `/mnt/user-data/outputs` 也出现多次——**但它多了一个 `present_files`**。
模型的最后一个动作是"调用 present_files"，最后一句话的模板是"succinct summary, no post-amble"。
**叙事的落点从"文件在哪"变成了"我给你了"。**

> 补充：这不代表 Anthropic 完全没这问题。但差别在于，我们把
> "路径"放在了**交付语义的唯一位置**，它们把路径放在了**实现细节的位置**。

---

## 四 · Code Execution Tool + Files API：黑盒容器的产物出口标准形态

**【官方】** https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool
+ https://platform.claude.com/docs/en/build-with-claude/files

### 4.1 容器

| 项 | 值 | 出处 |
|---|---|---|
| Python | 3.11 | Runtime environment |
| OS / 架构 | Linux / x86_64 | 同上 |
| 内存 / 磁盘 / CPU | **5 GiB / 5 GiB / 1 CPU** | Resource limits |
| 网络 | **完全禁用**，无出站 | Networking and security |
| 容器过期 | **创建后 30 天** | "Containers expire 30 days after creation" |
| 闲置 | **约 5 分钟后 checkpoint**，30 天窗口内可用 id 恢复 | Container reuse |
| `expires_at` 字段 | **是一个更短的滚动值，不代表 30 天上限** | Container reuse（明确警告不要误读这个字段） |
| 复用 | 传回上次响应的 `container.id` | Container reuse |
| 每次请求 | **默认新容器**，除非显式传 container id | "Each request runs in a new container unless…" |
| 预装库 | pandas/numpy/scipy/sklearn/statsmodels · matplotlib/seaborn · **pyarrow, openpyxl, xlsxwriter, xlrd, pillow, python-pptx, python-docx, pypdf, pdfplumber, pypdfium2, pdf2image, pdfkit, tabula-py, reportlab, Img2pdf** · sympy/mpmath · tqdm 等 | Pre-installed libraries |
| CLI | unzip, unrar, 7zip, bc, rg, fd, sqlite | 同上 |
| 工作目录示例 | 文档全篇用 `/tmp/number.txt` 做容器复用示例 | Container reuse 代码块 |

**注意**：pptx/docx/xlsx/pdf 的生成库是**预装的**，且容器**无网**（不能 pip install）。
这跟 Scholar 的 agent 容器策略一致（[数据分析卡片调研] 已记录容器预装 statsmodels/sklearn/lifelines）。

### 4.2 两个子工具 —— 和 Scholar 的工具集几乎同构

给了 `code_execution` 一个工具，模型自动获得两个子工具：
- `bash_code_execution`：跑 shell；
- `text_editor_code_execution`：`view` / `create` / `str_replace`。

**结果块的字段设计值得逐条抄**（Response format 节）：

```jsonc
// bash 结果
{ "type": "bash_code_execution_result",
  "stdout": "...", "stderr": "...", "return_code": 0,
  "content": [ /* 每个新建文件一条，每条带 file_id */ ] }

// view 结果
{ "type": "text_editor_code_execution_view_result",
  "file_type": "text", "content": "...",
  "num_lines": 4, "start_line": 1, "total_lines": 4 }

// create 结果
{ "type": "text_editor_code_execution_create_result",
  "is_file_update": false }          // ← 这个文件之前存不存在

// str_replace 结果
{ "type": "text_editor_code_execution_str_replace_result",
  "old_start": 3, "old_lines": 1, "new_start": 3, "new_lines": 1,
  "lines": ["-  \"debug\": true", "+  \"debug\": false"] }   // ← 真 diff
```

三个可抄点：

1. **`content: []` 里逐个列出该命令创建的文件 + `file_id`** —— 即使是 bash 生成的二进制，
   出口也是结构化的，不需要下游去 diff 文件系统。
   **这是"工具自报产物"，介于 Scholar 的"目录扫描"和 Anthropic claude.ai 的"present_files"之间的中间形态。**
2. **`is_file_update`** —— create 的回执明确告诉模型"你是覆盖了还是新建"。
   Scholar 的 `Write` 回执只有 `"wrote " + path`（`registry.ts:210`），
   模型不知道自己是不是刚把上一版覆盖掉了。
3. **`str_replace` 回执带真 diff（`lines` 数组 + 行号区间）** ——
   模型能**验证**自己改对了地方，而不是靠"没报错就是成功"。
   Scholar 的 Edit 回执是 `"edited " + path`（`registry.ts:240`），信息量约等于零。

### 4.3 错误码

| 工具 | 错误码 | 含义 |
|---|---|---|
| 全部 | `unavailable` | 工具暂时不可用 |
| 全部 | `execution_time_exceeded` | 超过最大执行时间 |
| 全部 | `invalid_tool_input` | 参数非法 |
| 全部 | `too_many_requests` | 限流 |
| bash | `output_file_too_large` | 命令输出超上限 |
| text_editor | `file_not_found` | view/edit 目标不存在 |

**注意没有 "str_replace 未命中" 这个码**——文档里没写，说明这条路径的失败语义仍不够清晰
（与 §2.2 的 issue 呼应）。**Scholar 有机会在这里做得比 Anthropic 好**（见 §6.3）。

另有 `pause_turn` stop reason：长轮次被 API 主动暂停，调用方原样回传即可续跑。

### 4.4 Files API —— 产物出口的持久层

| 项 | 值 |
|---|---|
| Beta header | `files-api-2025-04-14` |
| 上传返回 | `{ id, type:"file", filename, mime_type, size_bytes, created_at, **downloadable** }` |
| **`downloadable`** | **上传的文件恒 `false`；只有 skills / code execution 产生的文件是 `true`** |
| 下载上传物 | **返回 400** |
| 单文件上限 | **500 MB** |
| 组织总量 | **500 GB** |
| 生命周期 | 上传后**不可修改/改名**；改内容 = 传新文件 + 删旧的；**持久直到显式 DELETE** |
| 文件名校验 | 1–255 字符，禁 `< > : " \| ? * \ /` 与 U+0000–U+001F |
| 计费 | 上传/下载/列表/元数据/删除**全免费**；只有内容进 messages 才按输入 token 计价 |
| 限流 | beta 期约 100 req/min |
| **作用域** | **workspace 级，不是 user/session 级** |

**最重要的一条安全警告（原文加了 Warning 框）**：

> "**Uploaded files are accessible to your entire workspace, not scoped to an end user, conversation,
> or session.** … **Never accept `file_id` values from end users or other untrusted sources**:
> a user-supplied file ID would let one user of your application read content that another user uploaded.
> Treat file IDs as **server-side references**, and keep the mapping between your users and their files
> in your application."

→ **Scholar 直接对应**：`backend/internal/claw/artifact.go:122` 的 `artifactRelPath`
只放行 `out/<basename>` 防穿越，这是对的；但如果引入全局 artifact id，
必须在 backend 做 user↔artifact 的归属映射，**绝不能信前端传来的 id**。
（`frontend-user/src/features/claw/api/artifacts.ts:20-22` 已有 `id` 字段走 `/artifact/:id`，
这条路径的归属校验是必须复核的点——本册不展开，留给仓库侧分册。）

**`downloadable` 布尔位是个漂亮的设计**：它把"这是用户给的原料"和"这是我们产出的成品"
用一个不可伪造的位区分开，且**默认拒绝下载上传物**（防成为任意文件中转）。

---

## 五 · Claude Skills（docx / pptx / xlsx / pdf）：文件怎么产、产到哪

### 5.1 接线方式

**【官方】** https://platform.claude.com/docs/en/build-with-claude/skills-guide：

```python
container={"skills": [{"type": "anthropic", "skill_id": "xlsx", "version": "latest"}]},
tools=[{"type": "code_execution_20250825", "name": "code_execution"}]
```

- 四个内置 skill id：`docx` / `pptx` / `xlsx` / `pdf`，版本是日期式（如 `20251013`）或 `latest`；
- **skill 必须配合 code execution tool**——skill 本身不产文件，它是**指导代码执行的知识**；
- 产物的 `file_id` 出现在 `bash_code_execution_tool_result` 里，用 Files API 下载。

**这一点非常关键，容易被误读**：Anthropic 的 "document skills" **不是一个文件生成服务**，
而是**一份写给模型看的、关于如何用 python-docx/openpyxl/pptxgenjs 正确产文件的操作手册**。
产文件的动作仍然是 bash + Python/Node。

### 5.2 SKILL.md 里真正值钱的东西：**验证闭环**，不是 API 用法

**【官方源码】** https://github.com/anthropics/skills/tree/main/skills/{docx,xlsx,pptx,pdf}
（本机副本在 scratchpad）。读完四份的结论：

**docx（91 行）** — https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md
- 任务分流表（L11-15）：**Create → docx-js（npm）；Edit → unzip → 改 `word/document.xml` → zip
  （"docx-js cannot open existing files"）；Read → `pandoc -t markdown`**。
  三条路完全不同的技术栈，靠任务类型分流。
- **验证闭环（L35-45）**："After writing a `.docx`, **render it and look at it**":
  `soffice --convert-to pdf` → `pdftoppm -jpeg` → **Read 那些 jpg**。
  即 **产完必须渲染成图并用视觉能力自查**。
- 编辑现有 docx 的两个隐坑：
  - `find unpacked -type l -delete`（**删符号链接，因为外来 docx 是不可信输入**）；
  - `merge_runs.py`：Word 把文本切成大量 `<w:r>` run，**"a phrase you can see in the document
    often doesn't exist as a contiguous string in the XML"**——所以先合并同格式相邻 run，
    否则 str_replace 类编辑根本匹配不上。
    **这条直接解释了「编辑 OOXML 时 old_string 匹配不到」的一大类成因。**
  - `validate.py out.docx --original doc.docx`：XSD 校验 + `--auto-repair`；
    做修订时加 `--author` 会**报告任何没被 `<w:ins>`/`<w:del>` 包住的改动**——
    "easy to do by accident and **invisible in the accepted view**"。

**xlsx（99 行）** — https://github.com/anthropics/skills/blob/main/skills/xlsx/SKILL.md
- **强制重算（L30-46）**：openpyxl 写公式**不带缓存值**，不重算的话所有公式格
  对 pandas / `data_only=True` / 预览器**都读回 `None`**。必须 `python scripts/recalc.py output.xlsx`。
- **回执设计极其讲究**：recalc 返回 JSON `status` (`success` | `errors_found`)、`total_formulas`、
  `total_errors`、`error_summary`（每类最多列 100 个格，另有 `locations_truncated`）。
  并明确警告："**`errors_found` exits 0**, so never treat a clean exit as a clean workbook"，
  以及 "trust `total_errors`, not the length of the list"。
  **——这是"假绿灯"防护的范本**，和本仓库 CLAUDE.md 里设计护栏的口径完全一致。
- **"A green recalc proves your formulas *evaluate*, not that they are *right*."**
  一个 off-by-one 的区间会产出干净无错但数字全错的文件。
  所以要求：先写 2–3 个公式验证取数正确，再铺开整张表。
- 硬约束清单：LibreOffice 实现的函数比 Excel 少，**禁用 XLOOKUP/XMATCH/SORT/FILTER/UNIQUE/SEQUENCE**
  （spill 数组函数在 openpyxl 写的文件里没有 spill 元数据，只有左上角格有值，
  **而 recalc 会报 `total_errors: 0`**——又一个假绿）；六个 post-2007 函数必须带 `_xlfn.` 前缀。

**pptx（238 行，最长）** — https://github.com/anthropics/skills/blob/main/skills/pptx/SKILL.md
- `scripts/thumbnail.py deck.pptx <prefix>`：出全片缩略图网格用于选版式。
  **明确警告 prefix 默认值 `thumbnails` 会让同目录两个 deck 互相静默覆盖**（L54）。
- **字体陷阱（L129-133）**：".pptx 里写的字体由用户的 PowerPoint 渲染，不是这个环境"，
  LibreOffice 会字体替换 → **QA 预览里的文字溢出/不溢出都不可信**。
  对策：非安全字体的容器留 ~10% 余量，且不信任那些元素的 QA 结果。
- 视觉 QA（L206-232）：转 PDF → `pdftoppm -jpeg -r 150` → **逐张看**，
  第一优先检查项是 **"Text overflow or text cut off"**，并建议**用子代理来看**
  （"After staring at the generating code you tend to see what you expect rather than what rendered"）。
- 内容自检：`markitdown output.pptx | grep -iE "\bx{3,}\b|lorem|ipsum|\bTODO|\[insert|..."`
  —— **用 grep 抓占位符残留**。

**pdf（314 行）** — 主要是 pypdf / reportlab / pdftotext / qpdf / pdftk 的配方 + `forms.md` 表单专章。

### 5.3 对 Scholar 的直接启示

1. **我们已经有 `agent-skills/` 作为唯一生效源**（记忆 [skill唯一源]），形态对得上。
   缺的是**验证闭环那一层**：Scholar 的 pptx/docx 导出目前没有"渲染成图再自查"的强制步骤。
2. **`recalc.py` 式的"结构化回执 + 明确的假绿警告"是可直接移植的模式**：
   任何"生成后必须验证"的工具，回执应当是
   `{status, total, errors, error_summary[], locations_truncated}`，
   而**不是** exit code。（Scholar 的 StatRun 已经吃过"数字锁只查键在不在"的亏——记忆 [stat_lab全栈审计0806]。）
3. **`merge_runs.py` 那条**：如果 Scholar 未来要支持"编辑用户上传的 docx"，
   run 碎片化问题会 100% 撞上，必须先做 run 合并。
4. **不要抄 skill 里的具体库选型**（docx-js vs python-docx），那是 Anthropic 容器的既定事实。

---

## 六 · Write / Edit / NotebookEdit 的工具语义 —— Edit 可靠性的三道闸

### 6.1 Claude Code 官方语义（这是本册对「改不到」问题最直接的答案）

**【官方】** https://code.claude.com/docs/en/tools-reference · `## Edit tool behavior` 逐字：

> The Edit tool performs exact string replacement. It takes an `old_string` and a `new_string` and
> replaces the first with the second. **It doesn't use regex or fuzzy matching.**
>
> **Three checks must pass for an edit to apply.**
>
> * **Read-before-edit**: Claude reads the file in the current conversation before editing it,
>   and **a read cut short with a `PARTIAL view` notice doesn't count**.
> * **Match**: `old_string` must appear in the file exactly as written.
>   **A single character of whitespace or indentation difference is enough to miss.**
> * **Uniqueness**: `old_string` must appear **exactly once**. When it appears more than once,
>   Claude either supplies a longer string with enough surrounding context to pin down one occurrence,
>   or sets `replace_all: true` to replace them all.

以及**陈旧读的处理**（这一段是精髓）：

> A file that changed on disk after Claude last read it **can still be edited when `old_string` matches
> the current content exactly and unambiguously** … **Matching against the file's current content keeps
> this safe**, and the result **notes that the file carries other changes so Claude re-reads it** before
> edits that depend on surrounding content. In any other case, such as a stale `old_string` or one that
> matches more than once without `replace_all`, **Claude reads the file again before editing**.

`## Write tool behavior`：

> The Write tool creates a new file or overwrites an existing one with the full content provided.
> **It doesn't append or merge.**
> If the target path already exists, **Claude must have read that file at least once in the current
> conversation before overwriting it. A Write to an unread existing file fails with an error.**
> This constraint doesn't apply to new files.
> For partial changes to an existing file, Claude uses Edit instead of Write.

`## NotebookEdit tool behavior`：

> NotebookEdit modifies a Jupyter notebook **one cell at a time, targeting cells by their `cell_id`**.
> **It doesn't perform string replacement** across the notebook the way Edit does on plain files.
> 三种模式：`replace`（默认，覆盖 cell source）· `insert`（在目标后插入，无 cell_id 则插到最前，
> 必须给 `cell_type`）· `delete`。

**NotebookEdit 是一条被低估的设计线索**：**对结构化文档，不要用字符串替换，要用稳定 id 定位。**
Scholar 的 Prism（LaTeX/Tiptap，struct JSON 真源）和 boltslides（slide XML）
都属于"有天然结构单元"的产物，用 `old_string` 编辑本质上是**在错误的抽象层上做手术**。

### 6.2 Scholar 的 Edit：三道闸一道都没有

`agent/src/tools/registry.ts:217-243`：

```ts
const editTool: BuiltinTool = {
  name: "Edit",
  description: "Replace the first occurrence of old_string with new_string in a file (exact match).",  // :219
  ...
  const idx = cur.indexOf(oldS);                                    // :235
  if (idx < 0) return fail("edit failed: old_string not found");    // :236
  const next = cur.slice(0, idx) + String(input.new_string) + cur.slice(idx + oldS.length);
  await writeFile(p, next, "utf8");
  return ok("edited " + String(input.file_path));                   // :240
```

逐条对照：

| 闸 | Claude Code | Scholar | 后果 |
|---|---|---|---|
| Read-before-edit | **强制**（新模型可在"读不需要授权"时豁免） | **无** | 模型凭想象中的内容构造 old_string，命中率低；改完也不知道改成了什么 |
| Match 精确 | 是 | 是（`indexOf`） | ✅ 一致 |
| **Uniqueness** | **必须恰好一次**，否则要求加上下文或 `replace_all` | **`indexOf` 取第一处，不检查重复** | 🔴 **同一个字符串出现多次时，静默改错地方**。这是"改不到/改错了"最隐蔽的一类 |
| `replace_all` | 有 | 无 | 批量改只能靠模型反复调用，且每次都命中第一处 → **死循环** |
| 陈旧读处理 | 匹配当前内容 + 回执提示"文件有其他改动" | 无概念 | 多工具并发写同一文件时无保护 |
| 失败回执 | 带具体原因 | `"edit failed: old_string not found"` | 模型无法自纠：不知道是空白差异、是被 Bash 改过了、还是路径错 |
| 成功回执 | 附 diff / 改动上下文 | `"edited <path>"` | 模型无法验证改对了地方 |

`Write` 侧：`registry.ts:196-214` 无条件 `writeFile`，**没有 read-before-overwrite**。
配合 `description`（`:198`）"To deliver a file to the user, write it under ./out/ ."
—— 这一行同时是**路径泄漏源之一**（工具描述也进上下文）。

### 6.3 建议的 Edit 契约（比 Anthropic 再进一步）

结合 §2.2 那个 issue 的教训，Scholar 可以做到**比 Claude web 当年更好**：

```
Edit(file_path, old_string, new_string, replace_all?=false)

前置：
  1. 本轮/本会话内 Read 过该文件（或 Bash cat/head/tail/sed -n 单文件读）。
     未读 → fail("must Read the file before editing")，回执附文件前 N 行。
  2. 命中计数 n = countOccurrences(cur, old_string)
     n == 0 → fail，回执必须包含：
        · 最接近的候选（按行做 normalized 比对，忽略行尾空白/全半角），列出 top-3 及其行号
        · 该文件当前的 mtime/size（让模型知道是不是被别的工具改过）
        · 一句明确的下一步："re-Read the file; the content differs from what you assumed"
     n > 1 且未设 replace_all → fail("old_string appears N times at lines a,b,c;
        supply more surrounding context or set replace_all: true")
     n > 1 且 replace_all → 全替换
  3. 成功回执必须带 diff：{ path, replacements: n, old_start, old_lines, new_start, new_lines,
        lines: ["-…","+…"] }（对齐 text_editor_code_execution_str_replace_result）
```

三条不可退让的原则（来自 §2.2 + xlsx skill 的"假绿"教训）：
1. **失败必须是失败**——绝不返回 ok；
2. **失败不得产生任何副作用**（不写文件、不发 artifact 帧、不记版本）；
3. **失败回执必须包含足以自纠的信息**（当前内容/近似候选/行号），而不是一句 not found。

---

## 七 · Claude Desktop / Claude in Chrome：落盘与用户可见性

这一节证据最薄，标 **low**。

**【官方】** https://claude.com/blog/create-files（原 anthropic.com/news/create-files，308 跳转）：
- 可创建 **.xlsx / .docx / .pptx / PDF**；
- 用户拿法：**"download your completed files or save directly to Google Drive"**；
- 2025-10-21 起对付费计划 GA；需在 Settings → Experimental 打开 "Upgraded file creation and analysis"；
- **安全警告原文**："This feature gives Claude internet access to create and analyze files,
  **which may put your data at risk. Monitor chats closely when using this feature.**"
  → 这是提示词注入 + 数据外泄的正面承认。**Scholar 的 agent 容器是断网的（jail 内 network_none），
  在这一点上比 Anthropic 的 claude.ai 文件创建更安全**，且这是可以对外说的差异化。

**【官方 · support】** https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them：
- Artifact 显示在"聊天右侧的专用窗口"；
- 用户可以：看源码、复制、**下载文件**、**在版本之间切换**；
- Markdown artifact 支持**用户直接在面板里就地编辑**，且"edit requests **won't change Claude's
  memory of the original content**"（用户的手改**不会**回灌进模型上下文——一个刻意的隔离决策）；
- **会话里的 artifact 不会自动进侧边栏**，必须显式点 Publish 才进 Artifacts 区。

**【一手 · low】** 本机 `~/.claude/` 下**没有** artifacts 目录，但有：
- `~/.claude/file-history/<session-uuid>/<path-hash>@v<N>` —— **每次写文件前的整份快照**，
  按会话分目录、按路径哈希 + 版本号命名（实测 `01769ce4-.../1ea654ad406a2c5e@v1`、`@v2`，
  一个会话目录下 39–531 个文件不等）。
  → **Claude Code 的"版本历史"是本地整份快照，不是 diff 链。**
  这对 Scholar 很有参考价值：整份快照实现简单、恢复无歧义，代价是空间——
  而我们的产物本来就有 12MB 上限（`backend/internal/claw/artifact.go:53-54`），空间可控。

第三方 Chrome 扩展生态（claude-artifacts-downloader 等）的存在本身是个信号：
**官方的"下载全部产物"体验不够好，用户在自己补**。Scholar 应当把"一键打包本次会话全部产物"
做成一等功能，而不是让用户逐张卡点。

---

## 八 · MCP：产物的标准化表达（`resource_link` / `audience` 注解）

**【官方】** https://modelcontextprotocol.io/specification/2025-06-18/server/resources
+ .../server/tools

### 8.1 Resource 的字段

```
uri          必填，唯一标识（RFC3986）
name         资源名
title        可选，给人看的显示名
description  可选
mimeType     可选
size         可选，字节数
```

内容二选一：
```jsonc
{ "uri": "file:///example.txt", "mimeType": "text/plain", "text": "…" }     // 文本
{ "uri": "file:///example.png", "mimeType": "image/png", "blob": "base64…" } // 二进制
```

**`text` vs `blob` 是互斥的两个键**，而不是一个 `content` + `encoding` 字段——
类型信息在**键名**上，解析方不可能忘记判断。

### 8.2 Annotations —— **`audience` 是 Scholar 最该抄的一个字段**

```jsonc
"annotations": {
  "audience": ["user", "assistant"],   // 谁该看这个
  "priority": 0.8,                     // 0.0–1.0，1 = 最重要
  "lastModified": "2025-01-12T15:00:58Z"
}
```

- `audience` 合法值只有 `"user"` 和 `"assistant"`；
- `priority`：1 = "most important (effectively required)"，0 = "least important (entirely optional)"；
- 客户端可据此**过滤**（只显示 `audience` 含 `user` 的）、**排序**、**决定是否进上下文**。

**这正是 Scholar 缺失的那个维度。** 现在我们的判定是
"文件在 `out/` 里 → 给用户；不在 → 草稿"，用**位置**编码了**受众**。
MCP 的做法是把受众做成**元数据**，位置只是位置。

一旦有了 `audience`：
- `evidence/` 下的中间产物可以标 `audience: ["assistant"]` → 不出卡片，但可被引用；
- 同一个文件在不同轮次可以改受众（先草稿后交付），不需要物理移动；
- **模型不需要知道任何目录名就能表达"这个给用户看"**。

### 8.3 工具结果里的三种产物表达

```jsonc
// A. 资源链接（只给引用，内容不进上下文）
{ "type": "resource_link", "uri": "file:///project/src/main.rs",
  "name": "main.rs", "description": "Primary application entry point",
  "mimeType": "text/x-rust",
  "annotations": { "audience": ["assistant"], "priority": 0.9 } }

// B. 内嵌资源（内容直接进上下文）
{ "type": "resource", "resource": {
    "uri": "file:///project/src/main.rs", "mimeType": "text/x-rust",
    "text": "fn main() {…}",
    "annotations": { "audience": ["user","assistant"], "priority": 0.7,
                     "lastModified": "2025-05-03T14:30:00Z" } } }

// C. 结构化内容（与 outputSchema 配对，客户端 SHOULD 校验）
"structuredContent": { "temperature": 22.5, … }
```

规范明确："Resource links returned by tools **are not guaranteed to appear in the results of a
`resources/list` request**." —— **链接是即时凭证，不承诺可枚举**。这跟 Files API 的
"file_id 是 server-side reference" 是同一个安全直觉。

**Scholar 的接线点**：`Write` / `ExportDocument` / `BuildDeck` / `StatReport` 这些工具的**返回值**
现在是一句人话（`"wrote out/x.md"`）。改成
`{ text: "...", resources: [{ uri, name, mimeType, size, audience, priority }] }`
之后，产物声明就从"扫描推断"变成"工具自报"，**且完全不需要模型在正文里提路径**。

---

## 九 · 综合建议：Scholar 的目标架构

按"改动成本 / 收益"排，**不是**一次性大爆炸。

### 9.1 P0 —— 交付语义从「目录」搬到「动词」

**新增 `Deliver` 工具**（名字刻意不叫 present_files，也刻意**不含任何路径语义**）：

```jsonc
{
  "name": "Deliver",
  "description": "Hand one or more finished files to the user. The user sees them as download/preview
    cards directly under your reply. Call this once, after the files are written and verified.
    List the most important file first. Do not describe file locations in your reply — just say what
    you produced.",
  "input_schema": {
    "type": "object",
    "properties": {
      "items": { "type": "array", "minItems": 1, "items": {
        "type": "object",
        "properties": {
          "file_path": { "type": "string" },
          "title":     { "type": "string", "description": "用户看到的卡片标题（中文）" },
          "description":{ "type": "string" }
        }, "required": ["file_path", "title"] } }
    }, "required": ["items"] }
}
```

行为（照抄 `present_files` 的四条 + 补两条）：
1. 路径不在交付区 → **自动拷进去**（复用现有 `relocateStrays`，`artifacts.ts:8`）；
2. **返回值只含客户端可用的标识**（artifact id / 稳定 token），**不回显容器路径**——
   这是切断"模型知道路径 → 说出路径"链条的关键一刀；
3. 返回顺序 = 输入顺序，第一个是主产物；
4. 只接受文件；目录必须先打包（对齐 "Share files, not folders"）；
5. **文件不存在 / 为空 / 超 12MB → fail**，且回执说明原因（现在是收割时才被拒，
   记忆 [claw真实验证0802] 里 "EvidenceGet 被旧 backend 拒的 DOA" 是同类问题）；
6. 幂等：同一路径同一内容重复 Deliver 不产生第二张卡。

**同时改提示词**：`backend/internal/prompts/claw.go:108-138` 那 30 行**整段重写**，
目标是**把 `./out/` 从提示词里彻底删掉**（14 次 → 0 次）。新版只说：

> 你产出的成品，**调用 `Deliver` 交给用户**——它会作为下载/预览卡片出现在你这条回复下方。
> 没调用 `Deliver` 的文件用户拿不到。交付后只用一两句话说明你做了什么，
> **不要解释文件在哪、不要描述你的工作目录**。

现有的 `./out/` 目录扫描**保留为兜底**（模型忘了调 Deliver 时仍能收割），
但**降级为"补漏"而非"主路径"**，且兜底产出的卡片可以带一个弱标记，便于统计模型的 Deliver 调用率。

> ⚠️ 兜底不能撤：记忆 [删默认端点Path2已回滚] 的教训是"agent 必需的兜底不要删"。
> 但兜底**必须可观测**，否则又是一条永远绿的规则。

### 9.2 P0 —— Edit 契约补三道闸

见 §6.3 的完整契约。最小可用版本：
- 加 uniqueness 检查 + `replace_all` 参数（`registry.ts:235` 那一行 `indexOf` 改成计数）；
- 失败回执带候选行号 + 文件当前 mtime/size；
- 成功回执带 diff。

Read-before-edit 可以晚一步（需要在 ctx 里记会话内读过的文件集），但**uniqueness 必须立刻做**——
它是唯一一条会**静默改错地方**的缺陷，其余的至少会报错。

`Write` 同步补：已存在且本会话未读 → fail（对齐官方 Write 语义），
并把 description 里的 `./out/` 删掉。

### 9.3 P1 —— 产物元数据从"位置编码"改成"字段编码"

引入 MCP 风格的 `audience` / `priority` / `title` / `description` / `mimeType` / `size`。
`out/manifest.json`（`claw.go:135-137`、`artifact.go:79-89`）已经是这个方向的雏形——
把它从"可选的旁路清单"升级成 `Deliver` 的入参，就自然消化掉了。

### 9.4 P1 —— 结构化产物用稳定 id 编辑，不用字符串替换

对齐 NotebookEdit。适用范围：Prism（Tiptap struct JSON）、boltslides（slide 列表）、
未来的三线表/图表配置。给这些产物一个 `SectionEdit(doc_id, node_id, mode, content)` 类工具，
比让模型在序列化文本上做 `old_string` 匹配可靠一个数量级。

### 9.5 P1 —— 产物版本历史（整份快照）

照抄 `~/.claude/file-history/<session>/<hash>@vN` 的形态：
每次 Deliver（或每次对已交付文件的写）存一份整份快照。
配合 §2.4 的 Claude Code Artifact 语义：**每次发布 = 一个版本，用户可选看哪一版**。
产物已有 12MB 上限，空间可控。

### 9.6 P2 —— 生成后验证闭环（抄 skills）

- pptx/docx：产出后 `soffice --convert-to pdf` → `pdftoppm` → 让模型**看图自查**，
  第一检查项是文字溢出/截断；
- xlsx：强制 recalc + 结构化回执（`status/total_formulas/total_errors/error_summary/locations_truncated`），
  并在工具描述里写死"`errors_found` 也 exit 0，别把干净退出当干净工作簿"；
- 所有：产出后 grep 占位符残留（`lorem|ipsum|TODO|[insert|xxx`）。

### 9.7 P2 —— 会话级"全部产物打包下载"

第三方 Chrome 扩展生态证明这是刚需。Scholar 已有 `DownloadArtifactZip`
（`backend/internal/claw/artifact.go:463-465`），但目前是"按目录打包"，
应扩成"按会话打包全部产物"。

---

## 十 · 明确**不建议**抄的

| 不抄 | 理由 |
|---|---|
| 第一代 `antml:artifact` 协议（create/update/rewrite + type MIME） | Anthropic 自己已经弃用。它表达不了二进制产物（docx/pptx/xlsx），而这正是 Scholar 的主力 |
| Files API 的 **workspace 级作用域** | 那是给 API 开发者的模型（"keep the mapping between your users and their files in your application"）。Scholar 是多租户 SaaS，**必须** session/user 级，不能有全局可寻址的 file_id |
| 「artifact 是 live web page，靠 MCP connector 取实时数据」 | Claude Code Artifact 的定位是"给同事看的活页面"。Scholar 的产物是**科研交付物**（要能下载、能进论文、能给导师），静态确定性比"活"更重要 |
| claude.ai 文件创建的**联网容器** | 官方自己挂了风险警告。Scholar 的 jail network_none 是优势，别退回去 |
| 「artifact 不自动进侧边栏，要点 Publish」 | 那是为了防噪音。Scholar 的产物本来就少而重，多一步点击只会让"看不到"更严重 |
| docx skill 的 **docx-js（npm）** 技术选型 | 那是 Anthropic 容器的既定事实。Scholar 应按自己容器已装的库选（记忆 [数据分析卡片调研] 实测已装 python-docx/openpyxl 路线） |

---

## 附录 A · 本册引用的一手源清单

**官方文档**
- Code execution tool — https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool
- Files API — https://platform.claude.com/docs/en/build-with-claude/files
- Skills guide — https://platform.claude.com/docs/en/build-with-claude/skills-guide
- Managed agents · Adding files — https://platform.claude.com/docs/en/managed-agents/files
- Claude Code · Artifacts — https://code.claude.com/docs/en/artifacts
- Claude Code · Tools reference — https://code.claude.com/docs/en/tools-reference
- What are artifacts — https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- Publish and share artifacts — https://support.claude.com/en/articles/9547008-publish-and-share-artifacts
- Create files 发布公告 — https://claude.com/blog/create-files
- MCP Resources — https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- MCP Tools — https://modelcontextprotocol.io/specification/2025-06-18/server/tools

**官方源码 / issue**
- anthropics/skills · docx — https://github.com/anthropics/skills/blob/main/skills/docx/SKILL.md
- anthropics/skills · xlsx — https://github.com/anthropics/skills/blob/main/skills/xlsx/SKILL.md
- anthropics/skills · pptx — https://github.com/anthropics/skills/blob/main/skills/pptx/SKILL.md
- anthropics/skills · pdf — https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md
- anthropics/skills · web-artifacts-builder — https://github.com/anthropics/skills/blob/main/skills/web-artifacts-builder/SKILL.md
- anthropics/claude-code#9434（old_str 静默 OK）— https://github.com/anthropics/claude-code/issues/9434

**泄露系统提示词（medium/low）**
- asgeirtj/system_prompts_leaks · claude-sonnet-4.6.md — https://raw.githubusercontent.com/asgeirtj/system_prompts_leaks/main/Anthropic/claude-sonnet-4.6.md
  （关键行：L1090-1095 三层目录 · L1107-1129 producing_outputs + sharing_files ·
   L1133-1156 artifact_usage_criteria · L1760-1790 create_file schema ·
   L2471-2515 present_files · L2825-2860 str_replace）
- jujumilk3/leaked-system-prompts · claude-sonnet-4.5_20260128.md（L907 str_replace，交叉验证）
- schroneko/systemprompts · claude_sonnet_35_..._2024-11-02.md（L1-130 第一代 artifacts_info）

**一手环境**
- `~/.claude/file-history/<session-uuid>/<path-hash>@v<N>` —— Claude Code 本地整份快照版本史
- 本会话自身的 `Edit` / `Write` / `Artifact` 工具 schema

**仓库对照点**
- `agent/src/tools/registry.ts:196-214`（Write，无 read-before-overwrite，description 含 `./out/`）
- `agent/src/tools/registry.ts:217-243`（Edit，first-occurrence + 无 uniqueness + 裸失败信息）
- `agent/src/turn/artifacts.ts:1-46`（目录 snapshot/diff 交付模型；`ARTIFACT_MAX_FRAMES = 20`）
- `agent/src/turn/turnLoop.ts:808-810, 952-958`（每轮 diff → artifact 帧）
- `backend/internal/prompts/claw.go:108-138`（`out/` × 10 + 否定式铁律）
- `backend/internal/claw/artifact.go:5-6, 53-54, 79-89, 122`（out/ 单一真源、12MB 上限、manifest、路径白名单）
- `frontend-user/src/features/claw/api/artifacts.ts:1-35`（会话级产物列表 + id/path 双路径）
