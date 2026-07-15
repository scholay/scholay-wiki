# 智能助手 claw 成果交付:现状问题分析 · 业界做法 · 推荐架构

> 面向 owner。围绕两个真问题:①agent 回复正文里念容器内文件路径(「./out/技术路线图.svg」「已同步到根目录」「你的网页 IDE 左侧文件面板」);②用户根本看不到生成的文档。
> 日期 2026-07-15 · 仓库根 `/Users/youngp/mypro/fuck_副本/scholar`
> 代码断点均在真实源码逐行核对;业界做法均带 2025-2026 一手来源;拿不准处标「待核实」。

---

## 执行摘要

两个痛点是**两类不同的病**,不能只靠一招:

- 痛点②「看不到文档」= **交付发现链路多处断裂**。唯一交付契约是「文件必须写进会话 cwd 的 `./out/` 顶层」,但 agent 常写到 cwd 根(截图「同步到根目录」)→ 后端只列 `./out/`(`artifactDir="out"`)→ 永久不可见。此外移动端轮卡片只认 `Write/Edit/MultiEdit`,漏掉 `ExportDocument`(docx)与 Bash 产物;桌面则把可见性全押在一个可折叠的右侧面板上。
- 痛点①「正文念路径」= **路径卫生缺失**。提示词只「引导」写 `./out/`、说「可下载」,但**从不禁止**在正文里念文件系统路径、目录名、「IDE 文件面板」等内部概念;而「网页 IDE 左侧文件面板」根本是 prism(LaTeX IDE)的概念,claw 没有该界面,是模型幻觉。

业界(Claude Artifacts / ChatGPT Code Interpreter / Gemini Canvas / Manus / Genspark)的共识只有一条:**生成物是第一类可视对象(inline 卡片 + 可预览面板 + 下载按钮),文件路径由 UI 抽象掉,不靠正文散文承载**。产物走一条**与正文分离、机器可读的带外声明通道**;路径卫生靠**双保险 = 提示词禁令 + 渲染层出口清洗**。

推荐落地见第三章的 P0/P1/P2。**P0 三件事最止血且低成本**:(a) claw.go 加铁律——正文禁念路径/目录/IDE 面板,只说「已生成《标题》,见下方卡片」,并把「必须写 ./out」升成硬约束;(b) 后端从**工具执行信号**(而非只扫 `./out/`)建产物清单,把 cwd 根/其它目录的新建成品也归一收进交付集;(c) 移动端与桌面都给一个「就在这条回答下面」的轮内交付卡,且把 `ExportDocument`/Bash 产物一并绑上。

---

## 一、现状问题分析:把两个痛点拆成技术断点

### 1.0 交付链路全景(判定基准)

完整链路(产出 → 可见),已逐行核对:

```
agent 写 ./out/               后端 GetSessionArtifacts               前端渲染
prompts/claw.go:67-88 引导  →  artifact.go:174                    →  useClawArtifacts 轮询
ExportDocument 强制 out/       ├ storage 启用 → harvestSession        (artifacts.ts:43)
(registry.ts:493)              │   收割 ./out 顶层 → MinIO+DB       →  桌面: 右侧 ClawArtifactPanel
                               └ storage 未启用 → listArtifactsLive     (ClawPage.tsx:322-338)
                                   实时回读 ./out                     →  轮内: TurnArtifacts 卡片
                                                                        (MessageTurn.tsx:187)
```

**唯一交付契约 = `./out/` 顶层**,且是硬约束:
- `backend/internal/claw/artifact.go:44` `const artifactDir = "out"`;收割(`artifact_harvest.go:35`)与实时回退(`artifact.go:232`)都只 `ListWorkspaceFiles(sessionID, "out")`,只枚举 `./out` 顶层(仅在 out 内递归子目录)。
- 下载 `artifactRelPath`(`artifact.go:124-139`)白名单**只放行 `out/<basename>`**,非 out/ 一律拒绝。
- `ExportDocument`(`agent/src/tools/registry.ts:493`)`outRel = out/<base>.<fmt>` 经 confinePath 强制落 out/。

**结论:任何写到 cwd 根或 `./out/` 之外的文件,既不收割、不列出、也不能下载 = 永久不可见。** 这是后面所有「看不到」断点的判定基准。

---

### 1.1 痛点②「看不到文档」的技术断点

#### 断点①(头号根因,直接对应截图「同步到根目录」)
agent 把文件写到 **cwd 根而非 `./out/`** → 永久不可见。
- 后端无论 harvest 还是 live 都只列 `./out` 顶层(`artifact_harvest.go:35` / `artifact.go:232`),cwd 根/其它目录的文件不收割、不列出。
- 下载硬限 `out/<basename>`(`artifact.go:124-139`)。
- 提示词只在 `claw.go:88` 弱化地说一句「`./out/` 之外的工作目录文件一律视为草稿, 不会交付」,但没有「写别处 = 没交付」的强警告,也无后端兜底把根目录成品捞回来。截图显示 agent 仍把根目录文件当「已交付」宣告,证明该引导事实上不足。
- **修法:提示词把「必须写 ./out、写别处等于没交付」升成铁律 + 后端从工具写入信号兜底归一(见 P0)。**

#### 断点②(桌面把可见性押在单一右侧面板)
桌面端轮内卡片被**刻意关闭**:
- `ClawPage.tsx:244` `artifacts={isNarrow ? sessionArtifacts : undefined}` → 桌面(宽>1024)恒传 `undefined`。
- `MessageTurn.tsx:101-104` artifacts 为空 → `extractTurnArtifacts` 返回 `[]` → `:187` 卡片不渲染。
- 桌面完全依赖右侧 `ClawArtifactPanel`。
- **校准(须向 owner 讲清):右侧面板默认是展开的**(`ClawPage.tsx:77` `rightCollapsed=false`,`:78` 换会话 `setRightCollapsed(false)` 重置);收起后还留一个「重新展开」贴边 tab(`:85`)。所以这是**「面板被收起/未被注意时」的单点失效风险**,不是「桌面默认就看不到」。但确实**没有「就在这条回答正下方」的就近入口**。

#### 断点③(轮卡片绑定漏 ExportDocument/Bash,移动端交付黑洞)
- `MessageTurn.tsx:31` `WRITE_TOOLS = {Write, Edit, MultiEdit}`;`extractTurnArtifacts`(`:44-61`)只认这三个工具的 `input.file_path`,还要求名字命中 `./out` 实时列表。
- `ExportDocument`(入参 `source_path/output_name/target_format`,无 `file_path`)与 Bash(入参 `command`)**都不匹配** → 即便产物已落 `./out/` 进了 `sessionArtifacts`,也不会被认领成轮卡。
- 移动端(`isNarrow`)右侧面板根本不渲染(`showRightPanel = !isNarrow && ...`),唯一交付面就是轮卡片 → **docx(我们主推的正式交付格式)和一切 Bash 产物在手机上完全不可见**。桌面因右侧面板展示未过滤的全量 `sessionArtifacts`(`ClawPage.tsx:330`)反而不受这条影响。
- **修法:后端把该轮所有新增交付物(不限工具来源)投影成轮卡数据;或移动端也给一个「本会话全部产物」入口(见 P0/P1)。**

#### 断点④(storage 未启用时二进制被直接丢)
- 实时回退列表用 `liveBinaryExts` 跳过 `.pdf/.docx/.doc/.xlsx/.xls/.pptx/.ppt/.zip`(`artifact.go:161-168,252`);`DownloadSessionArtifact` 只回写 text/image,二进制走 default → 404(`artifact.go:372-393`)。
- 即 **MinIO 未启用(`storage.IsEnabled()=false`)时,`ExportDocument` 产的 docx / Bash 产的 xlsx 既不列出也下不了**。
- **待核实:生产环境是否已启用 storage(MinIO)。** 若可能关闭,这是隐性断点,最重要的正式文档格式全线失联。

#### 断点⑤(SVG/预览的路径依赖)
- 经 MinIO(`id>0`)的 SVG 可 attachment 下载,前端 `artifact-format.ts` 走 DOMPurify 内联预览;但实时回退 `DownloadSessionArtifact` 用 `allowedRasterMIME` 白名单**拒绝 svg**(`artifact.go:383-385`)。
- 预览按钮还必须 `artifact.id` 存在(`TurnArtifacts.tsx:92` `canPreview=!!artifact.id`),实时回退无 id → 一律无预览只下载。
- 与截图吻合:agent 念「./out/技术路线图.svg」,但 storage 未启用时该 svg 预览+下载双失效。

#### 断点⑥(harvest 时机造成短暂不可见窗口,非致命)
- 收割是 upsert-only、on-list 触发(前端每轮 `message_complete` invalidate `['claw','artifacts']`,`artifacts.ts:6`)。
- 若某轮 WS 未发 `message_complete`,或前端 `staleTime` 30s 内不刷新(`artifacts.ts:50`),新产物有**短暂不可见窗口**(刷新才有)。
- 收割设计本身稳健(耐久真源在 MinIO+DB,重启工作区空也保留,reset/delete 才清)。

---

### 1.2 痛点①「正文念容器路径」的技术断点

#### 根因 A(提示词只引导、从不禁止念路径)
- `prompts/claw.go` 引导写 `./out/` 并「一句话说明已生成 xxx 可下载」(`:76-77`),`:61` 只说「通过网页聊天界面…不是本地终端」——力度不足以压住通用 Claude Code agent 的终端叙事习惯。
- **通篇没有一条禁止在正文里念文件系统路径 / `./out/xxx` / 「同步到根目录」/「文件面板」这类内部概念的规则。**

#### 根因 B(「网页 IDE 左侧文件面板」是跨产品幻觉)
- 已核实:`prompts/claw.go` **从未提及**任何「文件面板 / IDE / 左侧目录」(`grep` 无命中)。
- claw 前端根本没有文件树/IDE 面板,只有右侧「成果文件」`ClawArtifactPanel`(`:70` 标题「成果文件」)。「左侧文件面板」是 **prism(LaTeX IDE)** 的概念,模型凭训练先验或跨产品幻觉了出来 → 让用户去找一个不存在的界面。

#### 根因 C(念路径是顽固失败模式 —— 类比证据,须校准作用域)
- 业界记录:GPT 系列即便被告知用 `/tmp/xxx` 也会顽固改写成 `/mnt/data/{随机}`,社区共识该 bias「very robust」,纯 prompt engineering 收效有限(来源见第二章 C 节)。
- **校准(对我们成立性):** 我们的 claw 是 **Claude**(cc-haha,Anthropic),那个 `/mnt/data` 改写 bias 是 **OpenAI 模型微调特异的**,不会字面发生在 Claude 上——对我们是「类比证据」。而且我们截图里的泄漏(`./out/`、「IDE 面板」)恰恰是**我们自己的 claw.go 提示词引入的概念**,模型部分只是在复述我们告诉它的词。**含义:对我们而言纯提示词其实比 GPT 案例更有希望**(可以干脆不向模型暴露「./out/」「IDE 面板」等内部词,改用中性表述),但「模型仍会漏、不能假设自律 → 需渲染层兜底」的定性判断依然成立。

---

### 1.3 被低估的现成杠杆:manifest.json 友好标题

- 机制已**完整实现且前端已消费**:后端 `readArtifactManifest/parseArtifactManifest` 把 `file→{title,description}` 解析出来(`artifact.go:81-120`),harvest 与 live 两路都注入(`artifact_harvest.go:43,50`;`artifact.go:243,256-259`);前端卡片优先展示 `title`、副行 `description`(`TurnArtifacts.tsx:101-102,119-126`)。
- 但提示词只在 `claw.go:85` 写「(可选, 推荐)」,模型极少写 → 卡片长期退回裸文件名。
- **这是把「文件名不友好/看不懂」变友好的现成通道,零新代码。** 建议把 manifest(或每个成品配 title)从「推荐」升级为「交付即写」的默认动作。注意:它只解决**标题体验**,不解决「写到根目录/正文念路径」,须与提示词铁律并用。

---

## 二、业界成熟做法(2025-2026 一手来源)

### A. UI 交付模式:生成物 = 第一类可视对象

- **统一铁律(跨 Claude / ChatGPT / Gemini / Manus / Genspark):** 生成物被渲染成第一类可视对象(inline 卡片 / 可预览面板 / 下载按钮),**文件路径被 UI 抽象掉**,用户只看到「一个可点、可预览、可下载的东西」。
  - Claude Artifacts:聊天右侧专用窗口 + 版本选择器(左下)+ 下载 docx/pdf,正文不含文件系统路径。来源:support.claude.com/articles/9487310。
  - ChatGPT Code Interpreter:生成文件作为对话流内可点下载链接 + inline 可交互图表。来源:help.openai.com/articles/8437071。
  - Gemini Canvas(2025-03 上线):split-pane 侧面板对象,导出 DOCX/PDF/MD。来源:support.google.com/gemini/answer/16047321。
- **关键校准(决策承重,勿绝对化):** 「文件路径被 UI 完全抽象、模型永不提路径」这句是 **Claude 路线**;ChatGPT 走的是**另一条同样被采用的路线**——模型正文里**确实会吐** `sandbox:/mnt/data/file.csv`,但 Web UI 识别 `sandbox:` 协议前缀、把路径 token **升级渲染成下载链接**;拦截不生效时(桌面 App/API/三方客户端)用户就看到裸路径(大量 bug 报告佐证)。**真正的跨产品铁律 = 「生成物是第一类对象,任何路径式引用都被 UI 约定拦截升级成卡片/链接,绝不留成死的纯文本」。** 后者其实更贴近我们现有的 `./out/` 架构。
- **轻量/一次性文件(csv/xlsx/docx/pdf/图片):** 主流做法是在对话流内就地出现一张可点下载卡片/链接,**紧跟生成它的那条消息**,而不是塞进一个要用户主动去翻的独立文件区。直接支持 claw 的「轮内 inline 卡」方向。
  - Claude 文件创建(.xlsx/.pptx/.docx/.pdf):「will generate the files and provide download links in the conversation」(support.claude.com/articles/12111783;claude.com/blog/create-files;全量放开 2026-02-11)。
- **富/可迭代内容(长文档、代码、SVG、HTML、图表):** 主流归宿是聊天右侧专用 canvas/artifact 面板,面板内自带 Preview↔Code 切换 + 版本选择器 + 下载/导出,对话流本身保持纯对话(Claude Artifacts / ChatGPT Canvas / Gemini Canvas 三家共识)。
- **反向信号(须让 owner 知悉,勿据此锁死方案):** OpenAI 2026-06 从 GPT-5.5 Instant/Thinking **下线了 Canvas 侧栏**,改为对话流内的 inline **「writing blocks / code blocks」**(可就地编辑,Canvas 仅遗留模型保留)。来源:OpenAI help center + 多篇 2026-06 报道。**含义:「inline 就地块」被验证甚至更被偏好** → 为 claw「轮内 inline 卡为主、侧栏为辅」的取舍背书。**侧栏 vs inline 只是形态之争,可两者并用**:轮内即时卡(主交付路径)+ 侧栏「本会话全部产物」聚合(对标 Manus 文件抽屉 / Genspark AI Drive)。
- **分层预览是标配**(但 claw 已做全,勿重复造轮子):Markdown 内联 / 代码 Preview↔Code 双视图 / SVG·HTML 直接渲染 / 表格 sheet 视图 / docx·xlsx 生成。
  - **纠偏:** claw 的 `ClawArtifactPreview.tsx` + `artifact-format.ts` **已实现完整分层矩阵**:image、svg(DOMPurify)、pdf(pdfjs)、html(沙箱 iframe 双视图)、markdown、**spreadsheet=xlsx/xls/csv(SheetJS 内联表格)**、**docx(mammoth 内联渲染)**、json/code、text,archive/unknown → Unavailable 兜底卡。**docx/xlsx 在 claw 已能内联预览,不是硬伤,也不需要 PDF 兜底。** 两痛点的根因**不在预览层**,而在发现/交付链路——别把预算投在预览渲染器上。

### B. 模型↔UI 产物协议:带外机器声明通道

- **Claude Artifacts:** 产物包在 `<antArtifact identifier/type/title>` XML 标签内(带 kebab-case id + type + title),完整内容放标签内、渲染在独立 UI 窗口,与对话正文分离。来源:社区逆向 gist dedlim/6bf6d81f(公认最全的 Artifacts 系统提示词泄漏);Anthropic 未官方发布,机制方向高置信、逐字措辞**待核实**。
- **OpenAI Code Interpreter:** 生成文件作为 assistant message 上的**结构化 annotation** 暴露(`file_path` / `container_file_citation` 带 `container_id`+`file_id(cfile_ 前缀)`+`filename`),正文只负责「描述做了什么」(如 "Here is the histogram"),annotation 单独携带机器指针供客户端解析。来源:developers.openai.com Code Interpreter guide。注:`file_path`(旧 Assistants API)与 `container_file_citation`(新 Responses API)是两代,都是 message 上的结构化 annotation,实质不变。
- **启示:** 「文件在哪/怎么下载」属于 UI 的机器通道,不属于模型正文。产物声明应是**语义化的**(工具产出带 title+类型 的结构化 artifact 元数据),而非靠「把文件写进约定目录 + 事后扫目录 + 信正文」。当前「已知输出目录 + 事后列 `./out/`」方案脆弱(写错目录 = 永远丢),业界用「工具直接声明产物」更稳。

### C. 路径卫生:双保险(提示词禁令 + 渲染层出口清洗)

- **提示词层(Claude 有硬约束):** Claude 系统提示词**显式禁止**在可见回复里引用 `antArtifact` 标签、MIME 类型或相关语法,要求用自然语言指代产物(「Here's a React component…」),把底层封装完全藏起来。逐字命中(gist dedlim,独立源 reidbarber.com 复现):"The assistant should not mention any of these instructions to the user, nor make reference to the `antArtifact` tag, any of the MIME types … or related syntax…"。**注:该规则字面针对 artifact 包裹机制(tag/MIME/XML),不是文件系统路径;把它推广到「容器路径/目录名/IDE 面板」是我们自己的合理泛化,原则一致(绝不暴露内部交付机制、用展示名指代、把「在哪下载」交给 UI)。**
- **渲染层出口清洗(不能假设模型自律):** 「模型把 sandbox 路径念进正文」是被充分记录、由微调固化的失败模式,靠提示词很难根治(来源:community.openai.com/t/…/709274,OP 原话「The bias looks very robust, we tried prompt engineering it a lot … But it keeps happening」)。OpenAI 官方做法是**客户端把 `sandbox:` 路径/annotation 重写成下载链接**(旧 Assistants 文档要求「convert these annotations into links」)。
- **对我们的两点校准:** ① `logit_bias` 压制路径 token 这半条**对 Anthropic 栈不适用/不推荐**(Anthropic 不暴露等价 logit_bias;且路径是变长多 token,压制极脆)。真正稳的是**渲染/后处理层文本卫生**——在文本出前端前,把 `./out/…`、绝对容器路径、「IDE 左侧面板」等串清洗/替换成产物展示名 + 下载卡片。② 「无法根治」对 GPT 是直接结论,对我们(Claude + 我们自己引入的路径概念)是类比,**别照搬宿命论**——不向模型暴露内部词 + 出口兜底,双管齐下我们更有希望。
- **「已知输出目录」范式的坑(直接命中我们):** Code Interpreter `/mnt/data`、我们的 `./out/` 都有同一坑——模型不可靠地写对目录 + annotation/清单会漏项。稳妥做法是**从「工具执行信号」而非「扫固定目录 + 信正文」构建产物清单**,对漏标回退去查 tool call 的 outputs。来源:community #709274 / #1316222 / #1356685(路径幻觉/文件投递失败)、#1351340(后续文件漏 annotation)。注:「回退查 code_interpreter_call outputs」是社区解法,非明确官方,实质正确、「官方」二字略过。

### 可借鉴清单(提炼)

1. 生成物 = 第一类可视对象,正文不承载路径;路径引用要么禁、要么被 UI 拦截升级成卡片/链接。
2. 产物走**带外机器声明通道**(工具输出即产物声明,带 title+类型),覆盖**全部写文件来源**,而非只认 `Write/Edit/MultiEdit`。
3. 轻量文件 → **轮内就地下载卡**(紧贴该轮);富/可迭代内容 → 侧栏工作区(Preview/Code/版本/下载)。两者并用,inline 为主。
4. 产物发现从**工具执行信号**建清单,不只扫一个固定目录、不信正文。
5. 路径卫生 = **提示词禁令 + 渲染层出口清洗**双保险。
6. 每个交付物都要有**下载**动作;不可内联渲染的类型给「图标+文件名+大小+下载」,不留空(claw 已有 Unavailable 卡)。
7. 编辑型交付物**版本化**(保留历史不覆盖)——中期能力,优先级低于「先看得见」。

---

## 三、推荐架构 + 分期

### 一句话结论

**痛点①(念路径)= 提示词铁律禁念内部概念 + 渲染层出口清洗;痛点②(看不到)= 把「交付发现」从「扫固定目录 + 信模型写对」改成「从工具写入信号建产物清单(覆盖全部写文件来源、归一 cwd 根/漏标)」,并给每一轮一张紧贴该轮、桌面/移动都在的下载卡。** 先做 P0 三件止血,再做 P1 把交付面做「实、显、全」,P2 补版本化/分享等增强。

### P0 — 止血(高优先、低成本、直接对应截图)

- **P0-1 提示词路径卫生(改 `backend/internal/prompts/claw.go`):** 加铁律段——
  - 对用户只说「已生成《标题》,可在下方/右侧下载」;**禁止**正文出现 `./out`、cwd、根目录、绝对路径、「文件面板 / IDE / 左侧目录」等任何内部概念(claw 无 IDE 面板,显式澄清交付 UI = 下载卡片)。
  - 「**必须写进 `./out/`;写到别处等于没交付**」升成强警告(替换现在埋没的 `:88` 弱表述)。
  - 把 manifest.json 从「可选·推荐」升成「**交付即写**」的默认动作(现成机制,零新代码即改善卡片标题)。
- **P0-2 后端交付发现兜底(改 `backend/internal/claw/artifact.go` + `artifact_harvest.go`):** 不再只扫 `./out/`——从**工具写入信号**(我们自有执行器 cc-haha,Write/Edit/MultiEdit/Bash/ExportDocument 的真实写入路径都可拿到)构建产物清单,把 cwd 根/其它目录新建的成品归一收进交付集。
  - **注意(校准):** 「固定不可改的输出根」对我们意义有限(我们已有固定 `./out`,病在模型语义上选择写别处);而「无脑收整个 cwd」会很吵(`references/`、`uploads/`、中间文件)。**推荐 = 以工具写入信号为准的白名单式归一**,而非扫全盘。**待核实:** agent 的 tool-result 是否稳定回传每次 Write/Bash 的真实绝对路径(需查 `agent/src/tools/registry.ts` 各工具 result 结构;若未透出需先补)。
- **P0-3 轮卡片补全 + 双端可见(改 `frontend-user/src/features/claw/`):**
  - `extractTurnArtifacts`(`MessageTurn.tsx`)不再只认 `WRITE_TOOLS.file_path`——把 `ExportDocument`(按 tool-result 的 `out/` 路径认领)与 Bash 产物纳入同一「本轮新增交付物」集合。
  - 桌面也给轮内交付卡(`ClawPage.tsx:244` 别再对桌面传 `undefined`),或至少移动端给一个「本会话全部产物」入口(移动端现无任何兜底列表)。

### P1 — 把交付面做「实、显、全」

- **P1-1 侧栏更醒目:** 有产物时 `ClawArtifactPanel` 更显眼(当前 `defaultSize=34` 注释自承「偏小」);对齐业界「内容工作区」而非「文件浏览器」。侧栏作为「本会话全部产物」聚合视图(对标 AI Drive),与轮内即时卡并存。
- **P1-2 storage 未启用时的二进制通路:** 确认生产是否已启用 MinIO(**待核实**);若可能关闭,补实时回退路径对 docx/xlsx/svg 的列出+下载(现被 `liveBinaryExts` / `allowedRasterMIME` 拒掉,`artifact.go:161-168,383-385`)。或明确要求生产启用 storage。
- **P1-3 产物即工具声明(架构收敛):** 中期把「事后扫目录」演进为「工具直接返回结构化 artifact 声明(path+title+type+mime)」,后端据此建卡,彻底摆脱目录约定与 prose 依赖(对齐 Claude/OpenAI 带外通道)。

### P2 — 增强

- **P2-1 版本化:** 编辑型交付物(Edit/MultiEdit 已在 WRITE_TOOLS)保留历史版本而非原地覆盖 + 面板内版本选择器。
- **P2-2 分享/导出:** 已有 MinIO 中转(见记忆 `claw-artifact-minio-delivery`),分享链接是自然延伸;可选 docx/xlsx 转 PDF 预览兜底(claw 已能内联预览 docx/xlsx,优先级低)。

### 待核实清单

1. **生产是否启用 MinIO(`storage.IsEnabled()`)** —— 决定断点④/⑤是否为线上真实故障。
2. **agent 工具 result 是否稳定透出真实写入绝对路径**(Write/Edit/MultiEdit/Bash/ExportDocument)—— 决定 P0-2/P0-3「从工具信号建清单」能否直接落地。
3. **Claude Artifacts 系统提示词逐字措辞** —— 社区逆向,机制高置信、字面待核实(不影响我们泛化出的原则)。
4. **OpenAI 「回退查 code_interpreter_call outputs」是否官方推荐** —— 社区解法,实质正确、官方性存疑。
