# 通用云端 Agent 的文件交付 UX —— 外部横向调研

> 调研日期：2026-08-07
> 范围：**通用云端 agent 产品**（与 claw 定位最接近的那一批）的产出物呈现与交付架构。
> 方法：一手官方文档 / 泄漏系统提示词 / 深度实测评测；每条结论带 URL。
> 姊妹文档：本目录其它编号文件（本文只负责「外部业界怎么做」这一片）。

---

## 〇、给赶时间的人：三句话

1. **路径可见性不是品味问题，是定位的函数。** 开发者产品（Devin / OpenHands / Bolt / Antigravity）全暴露真实路径，因为用户最终要在那台机器上继续干活，路径是共享词汇；消费级产品（Claude.ai 文件创建 / Gemini Deep Research / NotebookLM）零路径；通用 agent（Manus / Kimi / 扣子空间）走**双层**：过程面板里路径作为「它真的干了活」的证据出现，**交付面完全不出现路径**。claw 属于第三类，而现在把第二层也漏成了第一层。
2. **「内部工作文件 vs 交付物」业界有五种做法**，claw 现在只用了其中最脆的两种（专门目录 + 带外声明）。最值得抄的是 Manus 的**持久化分层**（交付物 = 沙箱回收后仍需活下来的东西）和 Antigravity/NotebookLM 的**类型化产物注册表**（产物不是文件，是有类型的对象）。
3. **「改不到」有硬数据支撑的解法**：SWE-agent 的 lint-gate（编辑前确定性校验，不过就拒绝并回结构化错误，去掉这一条解决率掉 3 个百分点）、Claude Artifacts 的 update/rewrite 二分（精确串替换 exactly-once）、Bolt/Lovable 的 snapshot+restore。而 claw 当前 `relocateStrays` 的**改名避让**逻辑（`artifacts.ts:273`）会在「同一份产物被反复编辑」时**每轮生成一张新卡、旧卡内容永远停在旧版本** —— 这一条足以单独解释用户报的「修改不到」。

---

## 一、路径可见性谱系：谁暴露、谁隐藏

### 1.1 全暴露阵营（开发者产品）

**Devin（Cognition）**
四面板 = shell + VS Code 式编辑器 + Chrome 浏览器 + planner。2025-02 产品更新原文提到编辑器改版后「**file tree on the left**」，且用户可以「Drag to make the chat as narrow or wide as you'd like」，还能「click on the magnifying glass icon to jump to the associated tool (editor, shell, browser, planner)」。
→ 交付面是 **PR / diff**，不是文件卡。路径是一等公民，因为用户下一步就是 `git pull`。
来源：<https://cognition.com/blog/devin-february-25-product-update>

**OpenHands（All-Hands）**
官方 Key Features 逐字定义每个 tab：
- Chat panel：「Displays the conversation between the user and OpenHands. OpenHands explains its actions in this panel.」
- **Changes tab：「Shows the file changes performed by OpenHands.」**
- VS Code tab：「Embedded VS Code for browsing and modifying files. **Can also be used to upload and download files.**」
- Terminal / App / Browser tab 各司其职（Browser 明确标注 non-interactive）。

注意这里的关键设计：**「过程」和「结果」被拆成了两个 tab** —— Terminal 是过程，Changes 是结果。用户不需要从 terminal 日志里捞出「它到底改了什么」。
来源：<https://docs.openhands.dev/usage/key-features>

架构侧：Workspace 抽象把执行环境统一成 Local/Remote 两种，文件操作有明确 API（`POST /file/upload` multipart、`GET /file/download` stream），默认工作目录 `/workspace`。
来源：<https://docs.openhands.dev/sdk/arch/workspace>

**Bolt.new / Lovable**
Bolt 界面 = file tree + editor + terminal + preview。Lovable/Bolt 都有版本回滚，v0 没有。
来源：<https://skywork.ai/blog/bolt-new-beginner-guide-build-deploy-web-apps/>、<https://www.inspoai.io/blog/lovable-vs-v0-vs-bolt-2026>、<https://support.bolt.new/building/using-bolt/rollback-backup>

**Google Antigravity**
代码侧路径全暴露（它就是个 IDE），但**另立了 Artifacts 概念**，见 §2.3。

### 1.2 双层阵营（通用 agent，与 claw 同类）

**Manus** —— 这是最完整的参考样本，它同时做了三件事：

*(a) 过程面板暴露路径。* 「Manus's Computer」侧栏实时显示 shell / 浏览器 / 编辑器操作，用户「observe what the agent is doing」并可「intervene at any point」。系统提示词里 `Home directory: /home/ubuntu`，shell 命令要求绝对路径 —— 这些在过程面板里对用户是可见的。
来源：<https://www.technologyreview.com/2025/03/11/1113133/manus-ai-review/>、<https://elifuzz.github.io/awesome-system-prompts/manus>

*(b) 有一个显式的文件浏览入口，但它不是主交付面。* 官方沙箱文档原文：
> 「You can view all artifact files in the Sandbox via the **'View all files in this task'** entry in the top-right corner.」

而且用户可以直接用自然语言操作沙箱：「Zip up all the code you've written so far and send it to me」。
来源：<https://manus.im/blog/manus-sandbox>

*(c) 主交付面是消息附件，规则写死在系统提示词里。* Message Rules 原文：
> 「message users with results and deliverables before entering idle state」
> 「**Provide all relevant files as attachments, as users may not have direct access to local filesystem.**」

`message_notify_user` / `message_ask_user` 都带一个 `attachments` 参数：「optional，绝对路径的单个文件或 URL，或多个绝对文件路径/URL 的列表」。
来源：<https://elifuzz.github.io/awesome-system-prompts/manus>、<https://gist.github.com/jlia0/db0a9695b3ca7609c9b1a08dcbf872c9>、<https://raw.githubusercontent.com/jujumilk3/leaked-system-prompts/main/manus_20250310.md>

**读法**：Manus 的架构师明确意识到「用户没有文件系统」这件事，并把它**写进了模型的世界观**（"users may not have direct access to local filesystem"），而不是靠前端事后补救。这是本调研里最重要的一条 prompt-level 设计。

**Kimi「OK Computer」（Moonshot）**
界面 = 「左侧为聊天框，右侧为虚拟电脑」，右侧「列出其进行的每一步操作，包括使用数据源、使用文件、使用 iPython、使用部署工具等等」；开始任务前「一般会撰写待办事项，对任务流程进行全面规划」（= 可见的 todo）。
来源：<https://finance.sina.com.cn/stock/t/2025-09-27/doc-infrxmap9785958.shtml>

交付物在**官方帮助中心**里被明确定义为三类：「完整的任务执行文件」「部署好的网页」「可下载的 Zip 包（位于 `/mnt/okcomputer/output/` 目录）」。网页类支持「全栈预览」+ 两种落地方式：「手动发布后部署到公网可访问地址」或「打包下载完整项目文件，自主部署」。
来源：<https://www.kimi.com/zh-cn/help/agent/agent-features-and-limits>

🔴 **注意这条**：Kimi 把内部输出目录 `/mnt/okcomputer/output/` **写进了面向用户的帮助文档**。也就是说，「有一个专用输出目录」这件事本身不是秘密 —— 秘密的是**不要让模型在对话正文里逐次复述它**。这两者的区别很关键，见 §4。

另一条一手限制（值得 claw 抄作业的产品决策）：
> 「Agent 在通用场景中通常**一次只能输出一个文件**（如文档或表格）」；要多格式（Word + PPT）得走 Agent Swarm。

—— Kimi 用「限制产出数量」来保证交付面清爽。claw 现在的上限是 `ARTIFACT_MAX_FRAMES = 20`（`agent/src/turn/artifacts.ts:47`），一轮能糊 20 张卡。

**扣子空间（Coze Space，字节）**
右侧 tab = 「实时跟随、浏览器（可视化展示）、**文件（虚拟环境文件结构）**、任务」。也就是说它选择了**直接把虚拟环境的文件结构给用户看**。
来源：<https://zhuanlan.zhihu.com/p/38753842617>（经搜索摘要转述，原页 403 无法直取 —— 该条标 medium 置信度）

同一批评测里最有价值的是**吐槽**：「想修改生成的网页细节？扣子空间目前支持得不好，基本得从头再来」+ 「第 4 次才成功，前 3 次都在网页生成阶段失败」。
来源：<https://www.woshipm.com/ai/6220588.html>
→ 中文用户对「产出物能不能就地改一版」的怨念是明确的，这与用户报的痛点 #2 同源。

**Genspark**
产出是「structured deliverables — a Sparkpage with citations, a slide deck you can export, a spreadsheet with actual data」，并且有 **AI Drive** 这个**跨会话持久盘**概念：文件进 AI Drive 后才解锁后续 Super Agent 能力（如 Image to Video），也可以「pick any research paper in your AI Drive and ask Genspark Super Agent for a summary」。
来源：<https://www.genspark.ai/blog/genspark-download-agent-and-ai-drive>（403，经搜索摘要）、<https://openai.com/index/genspark/>
→ AI Drive 是**产品概念的盘**，不是沙箱路径。用户心智里它是「我的网盘」，不是「agent 的 /home/ubuntu」。这是「暴露一个文件树」的正确姿势：**暴露的是用户拥有的那个树，不是执行环境的那个树。**

**天工超级智能体（Skywork，昆仑万维）**
5 个专业 agent（doc / ppt / excel / podcast / webpage）+ 1 个通用 agent；产出「可直接导出为 Word、PPTX、Excel、PDF、HTML、MP3 等格式」；强调溯源（正文链到原文段落、图片标注来源网页）。
来源：<https://ai-bot.cn/skywork/>、<https://skywork.ai/blog/skywork-super-agent/>
→ **按产物类型分 agent**，是「类型化产物」思路的另一种实现：产物类型在**路由层**就确定了，不需要事后从文件系统里猜。

**秘塔 AI 搜索**
交付极简：结果可导出 Word / PDF。没有文件系统概念。
来源：<https://www.aigc.cn/metaso-cn>
→ 中文用户对「深度报告类产物」的最低预期就是**能导出 Word**。这是 claw 科研用户的地板线。

### 1.3 零路径阵营（消费级）

**Claude.ai 文件创建**（2025-09 上线）
支持 .xlsx / .pptx / .docx / .pdf。交付方式：「You can download the files Claude creates or **save them directly to Google Drive**」，「Files remain available for download throughout your conversation」。上传下载均 30MB 上限。**帮助文档里完全没有路径概念**。
来源：<https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude>、<https://claude.com/blog/create-files>

**Gemini Deep Research**
根本没有文件系统。产物是 Canvas 里的报告，交付动作是右侧 Canvas 面板 →「Share & export」→「Export to Docs」，导出后是 Drive 里一份可编辑的 Docs。
来源：<https://support.google.com/gemini/answer/15719111>、<https://www.singularitymoments.com/gemini-deep-research-guide/>

**NotebookLM**
产物 = Studio 面板里的**类型化卡片**：Audio Overview / Video Overview / Mind Map / Slide Deck / Infographic / Data Table / Quiz / Flashcard / Report。导出：Notes 和 Reports 直接从 Studio 面板导出到 Google Docs；Audio 下载 WAV；Slide deck 导出 PPTX 或 PDF。
来源：<https://workspaceupdates.googleblog.com/2026/03/new-ways-to-customize-and-interact-with-your-content-in-NotebookLM.html>、<https://exploreaitogether.com/export-download-notebooklm-guide/>
→ **零文件、零路径、全类型**。用户心智里没有「文件」，只有「我这个 notebook 的产物们」。

### 1.4 谱系总表

| 产品 | 真实路径可见 | 主交付面 | 持久文件树 | 版本/回滚 | 定位 |
|---|---|---|---|---|---|
| Devin | ✅ 全（file tree + shell） | PR / diff | ✅ repo | ✅ git | 开发者 |
| OpenHands | ✅ 全（VS Code tab + Terminal） | **Changes tab** | ✅ /workspace | git | 开发者 |
| Bolt.new | ✅ 全 | preview + 部署 | ✅ | ✅ rollback | 半开发 |
| Lovable | 部分 | preview + 部署 | ✅ | ✅ 每次交互 snapshot + bookmark | 半开发 |
| Antigravity | ✅ 代码侧 | **Artifacts 侧栏** | ✅ repo | git | 开发者 |
| Kortix/Suna | ✅ 分支 | **change request（需批准）** | ✅ git repo | ✅ branch/commit | 开发者 |
| **Manus** | 过程面板见；交付面不见 | **消息 attachments** | ✅「View all files in this task」+ Cloud Computer 持久 FS | ❌（差异化保活代替） | **通用** |
| **Kimi OK Computer** | 过程面板见步骤；输出目录写在帮助文档 | 预览 / 在线发布 / zip | 有输出目录 | ❌ | **通用** |
| **扣子空间** | ✅「文件」tab = 虚拟环境结构 | 多格式交付 | ✅ | ❌（评测吐槽改不了） | **通用** |
| Genspark | ❌（AI Drive 是产品盘） | 结构化 deliverable + AI Drive | ✅ **跨会话** | ❌ | 通用 |
| Skywork | ❌ | 按类型导出（Word/PPTX/…） | ❌ | ❌ | 通用 |
| Claude.ai 文件 | ❌ | 聊天内下载 / 存 Drive | ❌ | ❌ | 消费级 |
| Gemini DR | ❌（无 FS） | Canvas → Export to Docs | ❌ | Canvas 编辑 | 消费级 |
| NotebookLM | ❌（无 FS） | **Studio 类型化卡片** | ❌ | ❌ | 消费级 |
| 秘塔 | ❌ | 导出 Word / PDF | ❌ | ❌ | 消费级 |

**规律**：路径可见性 ≈ 「用户是否会在那台机器上继续干活」。
中国科研人员不会 ssh 进 claw 的容器 —— `out/` 对他们的**可操作性为零**，因此每一次在正文里出现 `out/` 都是纯负价值：它既不能点，也不能 cd，只制造「东西在别处、我拿不到」的焦虑。

---

## 二、「内部工作文件 vs 交付物」：业界五种做法

### 2.1 做法 A —— 显式声明工具（Manus）

交付物 = 模型在 `message_notify_user(attachments=[...])` 里**点名**的那些。
- 优点：语义精确；模型知道自己此刻在「交付」，会连带写交付说明；工具调用天然是带外的，不污染正文。
- 缺点：模型漏点名 = 用户拿不到。Manus 用一条很硬的提示词补：「**Provide all relevant files as attachments**, as users may not have direct access to local filesystem」+「message users with results and deliverables **before entering idle state**」。
- 来源：<https://elifuzz.github.io/awesome-system-prompts/manus>

### 2.2 做法 B —— 专门输出目录（Kimi `/mnt/okcomputer/output/`；claw 的 `out/`）

约定目录 = 交付集，引擎扫目录即可，工具无关。
- 优点：零额外模型动作，覆盖 Write/Edit/Bash/Python 一切写文件的路径。
- 缺点两条，claw 都踩过：
  1. **模型越界写就丢**。claw 的注释记录了线上实况：「只认 `./out/` 让越界写入的交付物永远丢失（线上 26 条：`slides/index.html`、`work/xxx.md`、`home/bun/...` 假目录）」（`agent/src/turn/artifacts.ts:21-23`）。
  2. **目录名会泄漏进正文**。因为你必须在 skill / 提示词里告诉模型「写到 out/」，模型就会在解释里复述它。claw 的 sci-draw skill 原文：「**路径铁律**：写到相对路径 `out/<名字>.fig.json`，**绝不** `/out/...`」（`agent-skills/sci-draw-skills/figures/SKILL.md:101`）。这条铁律解决了「写对地方」，但同时保证了「模型满脑子都是 out/」。

### 2.3 做法 C —— 类型化产物注册表（NotebookLM / Antigravity / Claude Artifacts）

**产物不是文件，是有类型的对象。** 由专门工具产生，与工作文件天然正交。

Antigravity 的定义是本调研里最精确的一句：
> An Artifact is 「**a structured deliverable created by the agent to accomplish its task and communicate its progress and thinking to the human user**」

类型：Implementation Plans（rich markdown）、Code diffs、Architecture diagrams、Images、Browser recordings、Task Lists、Walkthroughs。
UI：桌面端「a visual sidebar and review pane specifically optimized for displaying, organizing, and managing rich Artifacts」；CLI 端「a fast, keyboard-driven review panel」。支持 inline text feedback 来指挥 agent。
理由（逐字，且几乎就是本次痛点的教科书表述）：
> 「you don't need to carefully monitor every individual tool call or step synchronously; instead, **you review high-level deliverables at key milestones**」

发布博客里还有一句直击要害的诊断：
> 现有做法两头不讨好 —— 把每个动作都展示出来会造成信息过载；而只展示最终代码改动则「**with no context on how the agent got there, and with no easy way to verify the work**」。

来源：<https://antigravity.google/docs/artifacts>、<https://antigravity.google/blog/introducing-google-antigravity>

NotebookLM 是同一思路的消费级版本：Studio 面板 = 类型化产物货架，一键生成 Audio/Video Overview、Mind Map、Slide Deck、Infographic、Data Table、Report，各类型有各自的导出通道。
来源：<https://workspaceupdates.googleblog.com/2026/03/new-ways-to-customize-and-interact-with-your-content-in-NotebookLM.html>

Claude Artifacts 是「单对象多版本」的版本：create / update / rewrite 三种操作 + 版本选择器，跨 React / Markdown / SVG / Mermaid / HTML 各类型统一。
来源：<https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them>、<https://medium.com/@rquintino/replace-is-all-you-need-...>

### 2.4 做法 D —— 持久化分层（Manus，最优雅的一种）

Manus 不问「这轮的交付物是哪些」，它问**「沙箱被回收后，哪些文件值得活下来」**。官方沙箱文档逐字：

> 沙箱内容分三类：「1. Attachments uploaded by you 2. Files and artifacts created and written by Manus during execution 3. Configurations needed by Manus to execute specific tasks」
> 闲置回收期：「Free users: 7 days; Manus Pro: 21 days」
> 回收后：「**Manus artifacts, uploaded attachments, and important files such as Slides/WebDev will be restored automatically; intermediate code and temporary files created during execution will not be restored.**」

来源：<https://manus.im/blog/manus-sandbox>

**这是一个不依赖模型自觉的二分**：交付物 = 需要长期保活的对象；工作文件 = 一次性的。而且它是**运维口径**的，可以被独立验证（备份策略、GC 策略），不会像提示词那样「写了但不生效」。

配套：Manus 另有 **Cloud Computer** 概念 ——「a dedicated, persistent virtual machine ... a persistent file system and always-on operation」「Files, installed tools, and running processes remain active between sessions」。即 **task sandbox（一次性）** 与 **cloud computer（长期）** 是两个不同的东西，用户心智上也是两个不同的东西。
来源：<https://help.manus.im/en/articles/15392111-what-is-the-cloud-computer>

### 2.5 做法 E —— 审阅门 / change request（Kortix / Suna）

> 「Every session gets its own cloud computer — a disposable, isolated Linux sandbox **on its own branch**. The agent can install, run and break anything; **only what it commits survives**.」
> 「Work reaches `main` only through a **change request you approve**, so the company self-improves one reviewed change at a time.」

来源：<https://raw.githubusercontent.com/kortix-ai/suna/main/README.md>

→ 交付物 = 通过人工审批进入 main 的那一份。工作文件在一次性分支上，天然不需要区分。**这是最强的区分方式**（物理隔离 + 显式批准），但要求用户愿意做 review 动作 —— 对科研用户来说门槛可能偏高，除非包装成「确认交付」按钮。

### 2.6 claw 现状定位

claw 目前 = **B（out/ 目录约定） + 半个 A（带外 `artifact` 帧）**：
- `agent/src/turn/artifacts.ts:1-8` 的设计注释写得很清楚：turnLoop 开头 snapshot `./out/`，结尾 diff，增量作为 `artifact` 帧带外声明，工具无关。
- 已经补了「会话根目录可交付扩展名文件的增量」这一扩面（`artifacts.ts:21-27`），并用 `relocateStrays` 把越界文件复制回 `out/`。

**缺的是 C 和 D**：没有类型化产物对象（一切都是「文件」），没有持久化分层（`out/` 里什么都有，`intermediate` 和 `deliverable` 混住）。

---

## 三、「一个持久文件树 + 版本」vs「每轮 diff 出卡片」

### 3.1 选择「持久树 + 版本」的产品

| 产品 | 树是什么 | 版本机制 |
|---|---|---|
| Genspark | **AI Drive**（跨会话、用户拥有） | 无显式版本，但文件持久 |
| Manus | task sandbox 的「View all files in this task」+ Cloud Computer 的持久 FS | 无版本，用**差异化保活**代替 |
| 扣子空间 | 「文件」tab = 虚拟环境文件结构 | 无 |
| Bolt.new | 项目 file tree | rollback / backup |
| **Lovable** | 项目 file tree | **每次 AI 交互后自动 snapshot** |
| Kortix/Suna | git repo | branch + commit + change request |
| Claude Artifacts | 无树（单对象） | **版本选择器**，create/update/rewrite |

**Lovable Versioning 2.0** 的三条设计值得逐字记住：
> 「You can now **save/favorite stable versions** of your app to make it easier to know where to revert to when things go wrong.」
> 「The improved history now **groups edits by date**, (just like google docs)」
> 「Restores to an old edit now **create a new edit card**, making everything easier to track and manage in the chat history (**similar to git revert commits**).」

来源：<https://lovable.dev/blog/versioning-with-lovable-two-point-zero>
最后一条尤其关键：**回滚不是"抹掉历史"，而是"追加一条新记录"** —— 对话流是 append-only 的，回滚也必须是 append-only，否则聊天记录和文件状态会对不上。

### 3.2 选择「纯交付卡 / 下载」的产品

Claude.ai 文件创建、ChatGPT Agent（下载 + 可存到 connector）、Gemini Deep Research（Export to Docs）、NotebookLM（Studio 导出）、Skywork、秘塔。

共同点：**产物是一次性的，用户拿走之后在别处继续编辑**（Word / Docs / PPT）。

### 3.3 判据

分界线是一个问题：**「用户会不会要求把同一份产物改第 2、3、5 版？」**
- 会 → 必须有持久对象 + 版本（Bolt / Lovable / Claude Artifacts）。
- 不会 → 下载卡足够。

claw 的科研场景（一份综述改 5 稿、一张图调 3 版、一份统计报告返修）**明确属于前者**。扣子空间的用户吐槽（「想改细节？基本得从头再来」）就是「只有卡没有对象」的必然结果。

---

## 四、路径泄漏进正文：业界最惨的一次翻车（直接对应痛点 #3）

用户报的第三条痛点 —— agent 在对话里说「文件输出到 out 目录下」—— **不是 claw 独有的，是行业级踩过的坑，而且有官方 incident 记录。**

### 4.1 `sandbox:/mnt/data` 事件

OpenAI 的 Code Interpreter 设计是：模型在 markdown 正文里写 `sandbox:/mnt/data/xxx.csv`，**客户端负责把这个伪 URI 改写成真实下载链接**。
路径语义：`/mnt/data` 用于上传下载，`/home/sandbox` 是 home 与 cwd。
来源：<https://medium.com/@dave1010/exploring-chatgpt-code-interpreter-5d0872d67058>、<https://community.openai.com/t/error-report-download-link-not-working-for-generated-files-in-chatgpt-code-interpreter/1220959>

翻车在于：**改写一失效，用户就拿到一个点不开的链接。**
Microsoft 365 Copilot 的官方服务健康报告（Issue ID **CP1116386**）逐字：
> 「When Copilot generated a file, the link provided pointed users to '**sandbox:/mnt/data/FILE_NAME**' which wasn't an accessible environment.」

根因：一次代码更新导致「code interpreter 被禁用时仍然生成文件下载链接建议」。官方 2025-08-04 宣称修复，**2025-12 仍在大量复现**。用户侧的可怜 workaround 包括「让它打个 zip」「让它把内容直接贴在聊天里」「让它转成 base64 data URI 粘到地址栏」。
来源：<https://learn.microsoft.com/en-us/answers/questions/3145165/m365-copilot-created-file-placed-at-unreachable-ur>、<https://youraireport.com/fix-sandbox-mnt-data-error/>

另有 AutoGen 的同类 issue：FileSurfer agent 报告「已保存到某文件夹」（而且文件夹名是对的），用户就是拿不到。
来源：<https://github.com/microsoft/autogen/issues/5474>

### 4.2 教训

**「让模型在正文里写路径，前端事后翻译」是一条已被验证会长期烂掉的路线。** 它有三个结构性缺陷：
1. 翻译是**尽力而为**的正则/链接改写，模型换个写法就漏（相对路径、带空格、中文名、markdown 链接 vs 裸文本）。
2. 翻译失败时**没有红灯**，用户拿到的是一个死链接 —— 比「没有链接」体验更差（`artifacts.ts:214` 的注释里 claw 团队已经独立得出同一结论：「上抛别处的路径会给用户一张点了 404 的卡，比原来『没有卡』更糟」）。
3. 路径本身是**内部组织逻辑**，一旦进入正文就成了对用户的承诺，之后改目录结构会让历史会话集体失真。

**业界正解 = 正文零路径 + 产物走带外结构化通道。** Manus（attachments 参数）、Antigravity（Artifacts 侧栏）、NotebookLM（Studio 卡片）都是这个形态。claw 的带外 `artifact` 帧**方向是对的**，缺的是「禁止正文出现路径」这一半。

### 4.3 关键区分：文档里写 vs 对话里说

Kimi 把 `/mnt/okcomputer/output/` 写在**帮助中心**（<https://www.kimi.com/zh-cn/help/agent/agent-features-and-limits>），但用户在对话里看到的是预览 / 发布链接 / zip 下载。

→ **「有一个专用输出目录」不需要保密；需要禁止的是模型在每轮对话里复述它。** 这两件事经常被混为一谈。claw 现在是反过来的：文档里没说，对话里天天说。

---

## 五、编辑可靠性：为什么「改不到」（直接对应痛点 #2）

这一块有硬数据，是本调研里最能直接转成工程动作的部分。

### 5.1 SWE-agent 的 ACI：lint-gate 值 3 个百分点

SWE-agent 论文的核心论点是「LM agent 是一类新的终端用户，需要为它们专门设计界面」。四条 ACI 设计：
1. **编辑时 lint**：「We add a linter that runs when an edit command is issued, and **do not let the edit command go through if the code isn't syntactically correct**.」错误连同**出错前后的文件片段**一起回给模型，无效编辑被丢弃，要求重编辑。
   → 消融：**Without Linting, 15.0%（↓3.0）**。
2. **专用文件查看器**（而不是让它 `cat`）：「We found that this file viewer works best when **displaying just 100 lines in each turn**.」
3. **专用全目录搜索**，且「it was important for this tool to **succinctly list the matches** — we simply list each file that had at least one match」。
4. **空输出要有话说**：「Your command ran successfully and did not produce any output.」

来源：<https://swe-agent.com/latest/background/aci/>、<https://arxiv.org/abs/2405.15793>

**三条可直接迁移到 claw**：
- 编辑 `.md` / `.tex` / `.html` / `.json` 产物时同样可以做**确定性校验 + 拒绝 + 结构化回错**（JSON schema、markdown 结构、HTML 可解析性、LaTeX 编译）。claw 已有 `deliveryGate.ts` / `verifyClaims.ts`，形态对得上。
- 「静默成功」是最毒的失败模式：模型以为改了，用户看到旧的，双方都不知道哪里断了。
- 空输出/无变更必须显式回报（「你的 edit 没有匹配到任何内容」），否则模型会认为成功并继续往下走。

### 5.2 Aider：编辑格式本身就是失败源

- 「whole」格式最容易用但费 token；diff 格式省 token 但**模型经常用不对**。
- Aider 专门度量一个指标：「the **percent of coding tasks where the LLM complied with the edit format** specified in the system prompt」 —— 也就是说「格式合规率」被当成一等公民指标。
- 病理案例：GPT-3.5 用 diff 时会「把整个原文件放进 ORIGINAL 块、把整个新文件放进 UPDATED 块」，比直接用 whole 还差。
- 多轮任务里 whole 更稳；Gemini 2.5 Flash（diff）「frequently hits the maximum allowed reflections (three attempts) without successfully applying the code diff」。

来源：<https://aider.chat/docs/benchmarks.html>、<https://aider.chat/docs/leaderboards/edit.html>、<https://aider.chat/docs/more/edit-formats.html>、<https://arxiv.org/pdf/2510.13859>

### 5.3 Claude Artifacts：update 的 exactly-once 约束

观察到的机制：create / update / rewrite 三种操作；update 用**精确字符串匹配**，「each update requiring an exact match **exactly once** in the artifact」，空白与格式都算；大改动才走 rewrite。
观察到的失败模式：重复串场景下「Claude removed two identical strings when only the first was intended」。
来源：<https://medium.com/@rquintino/replace-is-all-you-need-...>（作者明确标注这是逆向观察、非官方文档 → 本条标 **medium** 置信度）

### 5.4 🔴 claw 特有的「改不到」机制（读代码得出，非外部资料）

外部调研做到一半，回头对照仓库代码时发现一条**能单独解释用户报的「修改不到」**的机制。

`agent/src/turn/relocateStrays()`（`agent/src/turn/artifacts.ts:225-280`）：越界写入的交付物会被**复制**进 `out/`；`out/` 里同名已被占用时，走**加数字后缀避让**：

```
agent/src/turn/artifacts.ts:270-273
    const ext = extname(d.name);
    const stem = ext ? d.name.slice(0, -ext.length) : d.name;
    let name = d.name;
    for (let i = 2; (await occupied(name)) && i < 50; i++) name = `${stem}-${i}${ext}`;
```

`occupied()` 的播种集是**当前 out/ 的全部条目，含跨轮历史交付物**（`artifacts.ts:253`，这是 2026-07 审查 [4]/[18] 刻意改的，为了防止跨轮覆盖）。

于是「用户要求改一版已交付的越界产物」这条最常见的路径会这样走：

| 轮次 | 模型动作 | 引擎行为 | 用户看到 |
|---|---|---|---|
| T1 | 写 `slides/index.html` | stray → 复制成 `out/index.html`，发卡 A | 卡 A（内容 v1） |
| T2 | 就地改 `slides/index.html` | stray → `occupied("index.html")` 命中历史条目 → 改名 → 复制成 `out/index-2.html`，发卡 B | 卡 A（**仍是 v1**）+ 卡 B（v2） |
| T3 | 再改 | → `out/index-3.html`，卡 C | A(v1) + B(v2) + C(v3) |

用户的体感精确对应他的原话：**「进行编辑文件也容易出现错误，修改不到」** —— 他点的是最早那张卡（或最显眼那张），内容永远停在第一版；同时卡片越攒越多。

注意 `ROOT_SKIP_FILES` 里虽然有 `index.html`，但那只排除**会话根目录**的同名文件；`artifacts.ts:37` 的注释明确写了「子目录同名文件（如 `slides/index.html`）仍是要上抛的越界交付物」。所以子目录场景不受该豁免保护。

**这条与外部调研的结论是同一件事的两面**：因为 claw 没有「持久产物对象」，只有「每轮 diff 出的文件快照」，所以**「同一个东西的第 2 版」在系统里根本没有身份**，只能被表示成「另一个文件」。Bolt/Lovable/Claude Artifacts 的版本机制解决的正是这个问题。

> ⚠️ 该条是**读代码推断的机制**，未在运行环境复现。建议先用一个「让 agent 连续改同一个越界产物 3 轮」的会话实测确认，再动手。

---

## 六、对 claw 的可迁移结论（不写方案，只写业界证据支持什么）

### 6.1 三条几乎无争议的（多家一致）

**(1) 正文零路径，产物只经带外结构化通道。**
Manus 把「用户没有文件系统」写进模型世界观；`sandbox:/mnt/data` 事件证明「正文写路径 + 前端翻译」会长期烂掉。claw 的带外 `artifact` 帧已经在了，缺的是**正文侧的硬约束**（提示词 + 输出过滤 + 指代词从路径换成产物名/序号）。

**(2) 过程面板和交付面板必须是两个东西。**
OpenHands 的 Terminal tab vs Changes tab、Manus 的「Manus's Computer」vs attachments、Antigravity 的 tool-call 流 vs Artifacts 侧栏 —— 无一例外。Antigravity 的诊断可以直接引用给产品：全展示 = 信息过载，只展示最终改动 = 「no easy way to verify the work」。
**过程面板里出现 `out/` 是可以的**（它是「它真的干了活」的证据），**交付面板里出现 `out/` 不行**。

**(3) 交付物需要一个「类型」，不能只是「文件」。**
NotebookLM（Audio/Video/MindMap/Slides/Report）、Antigravity（Plan/Diff/Diagram/Recording/Walkthrough）、Skywork（doc/ppt/excel/podcast/webpage 各一个 agent）、Genspark（Sparkpage/deck/sheet）。
对 claw 的科研场景，类型是现成的：**综述报告 / 统计三线表 / 科研插图 / PPT / LaTeX 稿 / 数据表**。有了类型才谈得上「用什么组件渲染」「用什么规则校验」「怎么导出」。

### 6.2 两条需要拍板的（业界分歧）

**(4) 要不要给用户一个可浏览的文件树？**
- 给：Manus（「View all files in this task」）、扣子空间（「文件」tab）、Genspark（AI Drive）、所有开发者产品。
- 不给：Claude.ai、NotebookLM、Gemini、Skywork、秘塔。
- **判据**：如果给，必须是**用户拥有的那个树**（Genspark AI Drive 模式），而不是执行环境的树（`/home/bun/...` 那个）。给一个映射后的、只含交付物的树是安全的；直接把 workDir 端出去会把痛点 #3 从「正文提一句」升级成「常驻 UI 元素」。

**(5) 交付要不要一个显式的「批准/确认」动作？**
Kortix 的 change request 是最强区分（只有批准的进 main），但对科研用户可能过重。折中形态：Manus 的「进 idle 前必须发一条带 attachments 的总结消息」—— 强制模型做一次「交付动作」，但不需要用户点确认。

### 6.3 两条针对痛点 #2 的硬招（有数据）

**(6) 编辑走 lint-gate + 结构化回错。** SWE-agent 的消融给出量级：3 个百分点。核心不是 lint 本身，是**「不许静默成功」**。

**(7) 同一份产物要有跨轮身份 + 版本。** Lovable 的 append-only 回滚模型（「Restores create a new edit card... similar to git revert commits」）与对话流天然兼容。有了身份，`relocateStrays` 的加后缀避让就不需要了 —— 第 2 版是同一个对象的新版本，不是新文件。

---

## 七、证据清单（本报告用到的一手 / 准一手来源）

**Manus**
- 官方沙箱说明（artifacts vs intermediate 的保活分层、「View all files in this task」、7/21 天回收）：<https://manus.im/blog/manus-sandbox>
- 官方 Cloud Computer（persistent FS）：<https://help.manus.im/en/articles/15392111-what-is-the-cloud-computer>
- 官方 tools 页（产物类型、下载）：<https://manus.im/tools>
- 泄漏系统提示词（File/Message/Deploy Rules、attachments、/home/ubuntu、todo.md）：<https://elifuzz.github.io/awesome-system-prompts/manus>、<https://raw.githubusercontent.com/jujumilk3/leaked-system-prompts/main/manus_20250310.md>、<https://gist.github.com/jlia0/db0a9695b3ca7609c9b1a08dcbf872c9>
- 深度实测（Manus's Computer 面板、可导出 Word/Excel、replay 可分享）：<https://www.technologyreview.com/2025/03/11/1113133/manus-ai-review/>

**Kimi OK Computer**
- 官方帮助中心（交付物三类、`/mnt/okcomputer/output/`、一次一个文件、全栈预览、发布/自主部署）：<https://www.kimi.com/zh-cn/help/agent/agent-features-and-limits>
- 官方 Medium（20+ 工具含 file system、部署分享链接）：<https://medium.com/@kimi_moonshot/meet-ok-computer-the-agent-mode-in-kimi-2fb0dbf05ce0>
- 一手实测（左聊天右虚拟电脑、todo 先行、逐步操作列表）：<https://finance.sina.com.cn/stock/t/2025-09-27/doc-infrxmap9785958.shtml>

**其它中文 agent**
- 扣子空间（右侧四 tab、「文件」= 虚拟环境文件结构；改不了细节的吐槽）：<https://www.woshipm.com/ai/6220588.html>、<https://zhuanlan.zhihu.com/p/38753842617>（搜索摘要，medium 置信）
- Skywork 天工（5 专业 agent + 1 通用、多格式导出、溯源）：<https://ai-bot.cn/skywork/>、<https://skywork.ai/blog/skywork-super-agent/>
- 秘塔（导出 Word/PDF）：<https://www.aigc.cn/metaso-cn>
- Genspark（结构化 deliverable、AI Drive 跨会话）：<https://www.genspark.ai/blog/genspark-download-agent-and-ai-drive>、<https://openai.com/index/genspark/>
- Flowith Agent Neo（canvas + 输出节点 Documents/Code、Knowledge Garden）：<https://doc.flowith.io/agent-mode-neo/about-agent-neo>、<https://flowith.io/blog/meet-agent-neo/>

**开发者产品**
- Devin（file tree、四工具跳转）：<https://cognition.com/blog/devin-february-25-product-update>
- OpenHands（各 tab 逐字定义、Changes tab）：<https://docs.openhands.dev/usage/key-features>；Workspace 抽象与文件 API：<https://docs.openhands.dev/sdk/arch/workspace>
- Antigravity（Artifact 定义、类型、侧栏/review pane、rationale）：<https://antigravity.google/docs/artifacts>、<https://antigravity.google/blog/introducing-google-antigravity>
- Kortix/Suna（cloud computer per session on a branch、change request）：<https://raw.githubusercontent.com/kortix-ai/suna/main/README.md>
- Bolt（file tree/editor/terminal/preview、rollback）：<https://support.bolt.new/building/using-bolt/rollback-backup>
- Lovable Versioning 2.0（bookmark、按日期分组、restore = 新 edit card）：<https://lovable.dev/blog/versioning-with-lovable-two-point-zero>

**消费级 / 报告类**
- Claude 文件创建（下载 / 存 Drive / 30MB / 会话内持续可下载）：<https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude>、<https://claude.com/blog/create-files>
- Claude Artifacts（版本选择器）：<https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them>；update/rewrite 逆向观察（medium 置信）：<https://medium.com/@rquintino/replace-is-all-you-need-the-surprisingly-simple-technique-behind-claudes-new-lightning-fast-b5ae18c3c113>
- Gemini Deep Research（Canvas → Share & export → Export to Docs）：<https://support.google.com/gemini/answer/15719111>
- NotebookLM Studio（类型化产物、Notes/Reports 直接导出 Docs、slides 导 PPTX）：<https://workspaceupdates.googleblog.com/2026/03/new-ways-to-customize-and-interact-with-your-content-in-NotebookLM.html>、<https://exploreaitogether.com/export-download-notebooklm-guide/>

**编辑可靠性**
- SWE-agent ACI（lint-gate、100 行窗口、简洁搜索结果、空输出提示）：<https://swe-agent.com/latest/background/aci/>；论文：<https://arxiv.org/abs/2405.15793>
- Aider 编辑格式基准（whole vs diff、格式合规率指标、GPT-3.5 病理用法）：<https://aider.chat/docs/benchmarks.html>、<https://aider.chat/docs/more/edit-formats.html>、<https://aider.chat/docs/leaderboards/edit.html>
- 多轮代码生成基准（whole 在多轮更稳、Gemini 2.5 Flash diff 打满 reflection）：<https://arxiv.org/pdf/2510.13859>

**路径泄漏翻车**
- M365 Copilot `sandbox:/mnt/data` 官方 incident CP1116386：<https://learn.microsoft.com/en-us/answers/questions/3145165/m365-copilot-created-file-placed-at-unreachable-ur>
- ChatGPT code interpreter 下载链接失效：<https://community.openai.com/t/error-report-download-link-not-working-for-generated-files-in-chatgpt-code-interpreter/1220959>
- `/mnt/data` vs `/home/sandbox` 语义：<https://medium.com/@dave1010/exploring-chatgpt-code-interpreter-5d0872d67058>
- AutoGen FileSurfer「说保存了但拿不到」：<https://github.com/microsoft/autogen/issues/5474>

**仓库侧（本报告引用的代码位置）**
- `agent/src/turn/artifacts.ts:1-8`（带外 artifact 帧设计）
- `agent/src/turn/artifacts.ts:21-27`（线上 26 条越界丢失记录 + 扩面）
- `agent/src/turn/artifacts.ts:37`（子目录 `slides/index.html` 仍算越界交付物）
- `agent/src/turn/artifacts.ts:47`（`ARTIFACT_MAX_FRAMES = 20`）
- `agent/src/turn/artifacts.ts:212-214`（out/ 单一真源；死链比没卡更糟）
- `agent/src/turn/artifacts.ts:253`（`taken` 由当前 out/ 全部条目播种，含跨轮历史）
- `agent/src/turn/artifacts.ts:270-273`（加数字后缀避让 —— 「改不到」的机制）
- `agent-skills/sci-draw-skills/figures/SKILL.md:101`（skill 里的 `out/` 路径铁律 = 模型复述 out/ 的来源）

---

## 附录：一句话记住每个产品

- **Manus**：过程给你看路径，交付只给你附件；沙箱回收时 artifact 活、temp 死。
- **Kimi OK Computer**：输出目录写在帮助文档里，不写在对话里；一次只给一个文件，逼自己交付面干净。
- **扣子空间**：把虚拟环境文件树直接端给用户 —— 换来的是「想改细节基本得从头再来」的评测吐槽。
- **Genspark**：文件树可以给，但必须是**用户的盘**（AI Drive），不是 agent 的盘。
- **Skywork**：产物类型在路由层就定了（5 个专业 agent），不需要事后从文件系统猜。
- **Devin / OpenHands**：过程 tab 和结果 tab 分开是底线。
- **Antigravity**：Artifact = 「structured deliverable ... to communicate its progress and thinking to the human user」；全展示是过载，只展示最终 diff 是无法验证。
- **Kortix/Suna**：一次性分支上随便造，只有 commit + 批准的活下来。
- **Lovable**：回滚是 append-only 的（新 edit card），因为对话流是 append-only 的。
- **NotebookLM / Gemini DR**：根本没有文件，只有类型化产物 + 一键导出。
- **`sandbox:/mnt/data`**：不要让模型在正文里写路径 —— 微软修了 4 个月没修好。
