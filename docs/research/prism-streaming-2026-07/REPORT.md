# Scholay Prism 智能写作：对话体验 / 流式渲染 / 编译健壮性 / 文件交互 —— 综合设计报告

> 面向项目 owner。本报告综合 6 维代码调查 + 3 主题业界研究 + 3 条对抗验证结论。**产出为方案与分期，不是即时实现**。凡与初始猜测冲突处，一律以对抗验证结论为准（下文用「⚠️纠偏」标注）。

---

## 1. 执行摘要

| 诉求 | 现状定性 | 方向 |
|---|---|---|
| **① 对话展示不友好** | 真问题，且是纯前端可改的。根因是 Prism 单轮渲染器 `PrismMessageTurn` 用了 `ProcessFold` 折叠框 + `card` 白卡片气泡 + 「答案埋进折叠、完成才外提」，与 claw 现代风（`plain` 全宽 + 无折叠 + 琥珀失败）拉开明显差距。 | 对齐 claw：气泡换 `plain`、答案不再埋进折叠、编译红条改琥珀、补写作动词、补出口清洗。**单文件为主，低风险高收益。** |
| **② 频繁编译失败红条** | 真问题，但承重假设被部分推翻。⚠️**「无 last-good 回退」是错的**——后端 `LatestSuccessCompile` 恒有兜底，失败时右侧仍显示上一版 PDF（仅「从未成功过的项目首编即败」才空白）。真正高频失败=缺宏包 `Undefined control sequence` + 裸数学/opaque 语法错；那条无信息量的裸 `Latexmk: Errors` 是 `entrypoint.sh` grep 缺锚点的窄 bug（bibtex/缺 .cls 类）。 | preamble 补安全宏包集（最高 ROI）+ grep 加锚点 + 错误友好化映射 + 编译前结构 lint + 红条改琥珀降级。 |
| **③ 等待→一次性出现 / 想要流式 + 像改代码的 diff** | 真问题。⚠️**「生成期没有内容流」是错的**——`Write.content` 正文以 `input_json_delta` 逐 token 到达 agent，被 `turnLoop.ts:221` 主动丢弃，只在块末一次性发 `tool_use_complete`。是「有流但没转发」，不是「无流」。 | 主接缝在 **agent 侧转发已存在的增量**（后端纯管道零改动、已预埋 `toolInput` 感知），前端 fold 接通喂只读预览；DB 真源零风险。多轮 diff 走「稳定 Block ID + per-hunk 接受/拒绝」，复用现有 struct-diff 全套基建。 |
| **④ 担心有 claw 那种文件交互隐患** | 部分有。⚠️主交付（PDF/docx 走 UI 按钮 + 后端 DB 真源）**天然无** claw 的「生成了拿不到」病，「网页 IDE」是真界面非幻觉。但残留 3 处：`ExportDocument` 工具对 prism 可达且是**死角**、缺渲染层出口清洗、提示词让 agent 念用户看不到的内部文件名。 | 把 `ExportDocument` 加入 denylist（零架构改动堵死角）+ 移植 claw 的 strip 出口清洗 + 提示词内容化表述。 |

---

## 2. 现状诊断（经验证事实）

### ① 对话展示（`PrismMessageTurn.tsx`）—— 真问题，纯前端

**已验证事实：**
- 单轮结构（`PrismMessageTurn.tsx:34-83`）：UserBubble → 无内容时 StreamingIndicator（:54）→ 一个 **ProcessFold**（:56-74）把 thinking + 所有中间块（工具 + 中间叙述）包成可收起容器 → 完成后把「末尾文本块」拎到折叠外成独立气泡（:76）。
- `finalText` 只有 `turn.complete && 末块是 text` 才非空（:28）。**流式中 finalText 恒 null**，连正在生成的答案都在 ProcessFold 内部；ProcessFold 流式期 `expanded=true`（`ProcessFold.tsx:20`），完成自动收起成「处理过程 · N 步」一行。→ 观感：答案先呈现为灰底日志框内小气泡，turn 完成瞬间折叠收起、末尾文本「弹出」到框外——**制造位移跳动 + 放大「一次性出现」感**。
- 两处 AssistantBubble（`:66`、`:76`）都不传 variant → 回落默认 `'card'`（`Bubbles.tsx:72`，白底+border+shadow）。claw `MessageTurn.tsx:143` 明确 `variant="plain"`（无框全宽 markdown）。
- ThinkingFold 嵌在 ProcessFold 内层（`:57-58`），形成双层折叠；claw 里 ThinkingFold 是顶层（`MessageTurn.tsx:119`）。
- StreamingIndicator `toolVerb`（`:63-78`）只映射 Read/Bash/WebFetch/Skill/minicod，**无 Write/Edit/MultiEdit** → Prism 最高频写文件工具回落成泛化「调用工具中」。
- Prism 命中额度只静默标 paused（`usePrismChat.ts:500-510`）→ 中性「已暂停」，无原因、无重发入口；claw 有 blocked 琥珀重发卡（`MessageTurn.tsx:184-208`）。
- Prism 直接渲染 `b.text`（`:66`），无 `stripContainerPaths`；claw 有（`MessageTurn.tsx:141`）。

**已 OK / 非问题：** 工具失败已是琥珀「未成功」非红（`ToolCallBlock.tsx:28-30`，2026-07-15 重设计）；`TurnErrorNotice` 已明确用琥珀非红（`:6-9`）。即**全站已确立「AI 侧/可恢复失败用 amber」的约定**——这是 ② 编译红条的直接反例参照。

### ② 编译失败（诉求②）—— 真问题，但承重假设被纠偏

**⚠️纠偏（对抗验证结论 2）：**
- **「无 last-good 回退」REFUTED**：`service.go:483 OpenLatestPDF → repository.go:539 LatestSuccessCompile`（`WHERE status=success ORDER BY id DESC`）恒返回最近成功 PDF，GC 永久保留每项目最新一条。前端 `PrismWorkspaceV2:91-97` pdfKey 仅 success 自增，失败保留已加载 PDF。→ **重编译失败时右侧是「上一版 PDF + 红条覆盖」，不是空白**；真空白仅「项目从未成功编译过、首编即败」这一窄边缘。
- **「Latexmk: Errors 主要由 AI LaTeX 模式触发」不精确**：多数 AI 模式错误（缺包 Undefined、裸数学 Extra }/Missing $）会产生 `! ` 行 → 被 `extractCompileError`（`compile_error.go`）抠成「第 N 行附近：…」的相对可定位 summary。**裸 `Latexmk: Errors` 只在 log 无任何 `! ` 行时出现**——`entrypoint.sh:76` 的 `grep -m1 -E '^! |^!|Error|Undefined|Emergency stop|Fatal'` 里 `Error` **无锚点**，命中 latexmk 自己的总结行。真实触发面是 **bibtex 阶段失败**（.bib 语法错，bibtex 报 `I was expecting a ','…`，无 `! `、无大写 Error）、缺 .cls、fatal 无 `! ` 行等窄类别。（注：模板用 `\bibliographystyle+\bibliography` = **bibtex 非 biber**，原调查「biber/bibtex」应收敛为 bibtex。）

**已验证的真实高频失败根因：**
1. **窄宏包集（high, CONFIRMED）**：四个 `manifest.json` 只声明 amsmath/amssymb/graphicx/hyperref(+cite/lineno)；`projector.go:242-269` 只额外注入 fontspec/xeCJK/xurl。booktabs(`\toprule`)/siunitx(`\SI`)/amsthm/algorithm/tikz+pgfplots/mathtools/subcaption/multirow/xcolor 等**全部未 `\usepackage`** → AI 一写即 `Undefined control sequence`。**这些包在沙箱 texlive-latex-extra/science/pictures 里已装，只是没加载**（测试夹具 beidou.tex 本身就用 pgfplots）。
2. **裸 LaTeX 零校验（high）**：`BlockOpaque.RawLatex`（`projector.go:646-648`）、`BlockDisplayMath.Latex`（:608）、`InlineMath.Latex`（:676）全部原样注入；`escapeLaTeX`（:855）只覆盖 heading/paragraph/caption/表格文本；`renderBib`（:839）把 .bib 原样 dump。无括号/`$` 平衡校验。
3. **`-halt-on-error`（high）**：`entrypoint.sh:54` 首个错误即停、绝不产部分 PDF。
4. **无编译前 lint**：`quality.go` 只查悬空 cite/交叉引用/前置（结构级），不校验 LaTeX 语法。
5. **每轮 apply 自动重编译**（`PrismWorkspaceV2.tsx:112-117` onApplied→triggerCompile）—— **频率放大器**：agent 每改一次即无条件重编译。

### ③ 流式 + 增量编辑（诉求③）—— 真问题，机制已精确定位

**⚠️纠偏（对抗验证结论 1）：主接缝在 agent 侧，「有流但没转发」。**
- **生产端根源**：`turnLoop.ts` 流式循环里 `text_delta` 立即发 `content_delta` 帧（:219）；但**工具入参 `input_json_delta`（Write 的 content 正文逐 token 就在其中）只 `assembler.push()` 累积、不发任何帧（:221）**，完整入参等 `content_block_stop` 才随 `tool_use_complete` 一次性发出（:225）。`turnLoop.ts:20-23` 注释佐证整档 Write 撞 max_tokens 是真实事故——**整档 Write 是常态**。
- **后端纯管道，已预埋**：hub `contentDeltaText`（`hub.go:1250-1266`）已显式识别 `content_delta` 上的 `toolInput` 字段（:1257），`coalesceReplay` 只合并「不带 toolInput」的 content_delta（:1262）→ **后端零改动即可透传新字段，且不污染带 toolInput 的帧**。
- **前端死接缝**：`ws-types.ts:31` 已声明 `content_delta{toolInput?:string}`，但 `fold.ts:58-60` 只读 `msg.text`、忽略 toolInput；shared 甚至已预留「构建中」态（`ToolCallBlock.tsx:20`、`agent-stream.ts:83`）。**协议半接、生产端从未接**。
- **右侧只做到工具粒度**：`PrismWorkspaceV2.tsx:340` 自述「Level 1：逐工具调用整份刷新，非逐字」；`chat.live.content` 只在 `tool_use_complete`（乐观预览 `applyToolEditPreview` `usePrismChat.ts:66-87,288-298`）与 `tool_result` refetch（:299-300）更新。

**多轮 diff 现状：**
- 基建齐全：`struct-diff.ts`（块对齐 diffArrays+Dice 相似度配「修改块」+ 词级 diff，math/figure 原子整块）、`struct-diff-decorations.ts`（绿加/红删 ProseMirror Decoration）、`tiptap-diff-marks.ts`（DiffMarks 扩展，纯被动装饰）、`LatexDiffEditor.tsx`（**完整逐 hunk 接受/拒绝** + 导航，但**仅 legacy V1 用**）。
- **缺口 = struct 轨的「假门」**：`ws_round.go:170-171,200-202` 与 `struct_service.go:201` 明写 **overrides 在 struct 轨被忽略、整轮全收/全弃**（per-hunk 仅 legacy 轨）。
- **根因 = Block.ID 不跨轮稳定**：`parseEditorMarkdown` 的 Block.ID 位置式重生成（`md_bridge.go:189` `b%d`），旧块 ID 不迁移（`restoreBlockMeta` 只回填 Width/Label，`:489-553`）。→ doc_struct 无稳定节点身份，任何绑 Block.ID 的 diff 跨轮失效。
- **apply 是整档**：`applyStructRound`（`struct_service.go:269-320`）读回**整份** document.md → parse → `d.Body` 整块替换（`md_bridge.go:475`）→ SaveStruct，返回值恒为 1。
- **V2 用 autoApply 绕过了确认门**：`PrismWorkspaceV2.tsx:109` autoApply:true，`commitAndIndicate` 轮末直接固化无门（`usePrismChat.ts:197-232`），diff 只作只读痕迹、用户一编辑即 dismiss。但**确认门机具（awaiting_apply/pendingFiles/mergedRef）在 `usePrismChat` 里其实存在**（:371-400），只是被绕过。

**已 OK / 非问题：** 真源安全——流式预览走只读 `ReadWorkspaceFile`（`ws_round.go:330-352`）/ cwd，**从不 SaveStruct**；DB struct 仅被轮末 apply 门后的 `applyStructRound` 改写。**流式预览与固化提交是两条独立通道，流式对真源零风险**（对抗验证结论 1 确认）。「应用门 D1 锁定架构」正是业界主流（Gemini suggested-edits / Canvas approve-before-apply 同构），无需改。

### ④ 文件交互（诉求④）—— 部分有，主交付天然无病

**⚠️纠偏（对抗验证结论 3）：`PARTLY`。**

**天然规避（REFUTED「和 claw 一样有交付病」）：**
- 主交付脱离 ./out/：PDF 走 `handler.go:318 GetPDF`（流式返回最近成功编译）、docx 走 `struct_handler.go:158 ExportDocx`（struct 真源→pandoc，`docx.go:113` 含 frontmatter/机构编号/citeproc/图片铺盘），都是**后端 HTTP + DB 真源、UI 按钮驱动**，与 agent 对话/artifact 帧完全解耦，写错目录不会丢。
- 「网页 IDE」对 prism 是**合法界面**（它本就是 IDE），不是 claw 幻觉出来的那个词。
- 禁 Bash + 提示词 `edit.go:157` 明令「除上述外不要新建文件/不执行 shell/不编译」→ 杂散 ./out/ 写入面小。
- 附件 `attach.go:11-15` 用户主动上传 + 前端 chip 可见，落 cwd 根 uuid 名，对 struct 轨无污染（回读只碰 document.md/references.bib/terminology.md）。

**残留隐患（CONFIRMED）：**
1. **`ExportDocument` 死角（medium-high，最实一条）**：`registry.ts:597` 该工具在全量 all 列表，`featurePolicy.ts:10-18` 只按 denylist+Bash 放行，而 prism denylist=`[NotebookEdit,Task,Agent]`+Bash（`spec.go:42`）**不含 ExportDocument** → prism agent 可调。它强制写 ./out/（`registry.ts:493-495`）、tool_result 念「delivered to the user's download area」（:514）。但 prism **无 OnArtifact 收割**（BuildSpec 未设）、**fold.ts 无 artifact case** → 产物既不落 MinIO 也不渲染 = **永久拿不到**，agent 却宣告「已交付下载区」（prism 无此 UI = claw 式虚构 UI 幻觉）；且该 docx 直接 pandoc 吃 document.md，**绕过 struct 真源**出劣质版。
2. **缺渲染层出口清洗（medium）**：`shared/lib/strip-container-paths.ts` 存在、claw MessageTurn 用、**prism fold 全线不用**。模型念路径无兜底。
3. **提示词念内部文件名（medium）**：`edit.go` 通篇以 document.md/references.bib 对 agent 讲话，`:163` 让 agent「说做了什么给用户看」未禁念文件名；而 struct 轨用户面是 Tiptap WYSIWYG，看不到这些文件 → agent 说「我更新了 document.md 的方法部分」= 轻度路径泄漏（与诉求①叠加）。
4. **artifact 帧半接死帧（low，无害清洁项）**：`turnLoop` 无条件 emit artifact，`hub.go:1305-1307` 无条件入 journal，但 prism 不收割不渲染 → 帧被生成/入库/回放却永不渲染。当前无害。

---

## 3. 业界参照（可借鉴模式 + Prism 适配性/代价）

### A. 流式文档生成 UX

| 模式 | 谁用 | 对 Prism 适配性 | 代价 |
|---|---|---|---|
| **结构化分块流（逐 DocBlock / partial-JSON）** | Notion AI、PydanticAI 生态 | **最贴 Prism**：真源就是 `{frontMatter, body:DocBlock[]}`，逐块流天然不破结构。但当前 agent 走 markdown 中介，改块级需重排链路 | 中 |
| **逐 token 文本流入侧栏** | Claude Artifacts、Canvas、Cursor | 是诉求③想要的形态；但纯 markdown 逐 token 需处理半截语法/公式闪烁，风险高于逐块 | 中（agent 协议改动） |
| **targeted-edit vs full-rewrite 就地高亮 diff** | ChatGPT Canvas | 直接对应诉求③后半；Prism 已有全套 struct-diff。缺的是「流式期就地感」（现 liveOverlay 整份闪） | 低-中 |
| **suggested-edits 待批准门** | Gemini Docs、Cursor、Canvas | Prism **已同构实现**（ChangesetCard + prepare/apply/reject 门）→ 印证现架构是主流，无需改 | 0 |
| **感知延迟三件套（骨架屏/打字机/动态状态文案）** | 通用；skeleton 比 spinner 感知快 ~30% | Prism WS 已有 `status.verb`，`fold.ts` 落 placeholder；缺口=右侧文档面空窗期无反馈 | 低（纯前端） |
| **streaming-aware 渲染护栏** | react-markdown / Vercel AI SDK | 若上逐 token/逐块流必须补：parse 去抖 50-100ms、**公式块完成才渲 KaTeX**（否则含 `$公式$` 学术正文疯狂闪）、stable key 防重排、三态 auto-scroll | 低-中 |
| **整份重写 + speculative decoding（Fast Apply）** | Cursor/Morph（~1000-10500 tok/s） | **不适配**：依赖自建推理栈，Prism 走 agent 上游模型拿不到 | — |

### B. 增量编辑的 diff 化（诉求③「像改代码」）

| 模式 | 对 Prism 适配性 |
|---|---|
| **Cursor/Copilot per-hunk 接受/拒绝 + 内联 diff** | legacy .tex 轨**已有**（`LatexDiffEditor.tsx` unifiedMergeView + ⌘Y/⌘U）；**struct 轨拿不到**（假门）。补齐=先给块稳定 ID |
| **Aider search/replace（约束 LLM 只产最小 patch，不依赖行号）** | **agent 侧已是这套最佳实践**（`edit.go` 命令「Edit 定点最小替换绝不整篇重写」，原生 Edit old/new_string 无行号）。**不要改 agent 协议**——切整档/带行号只会退步。窟窿在下游 apply 摊平了 patch 身份 |
| **流式 apply / fast-apply（边流边渲 diff）** | Prism 已有功能同构（`applyToolEditPreview` 乐观预览），但未打通到观感：只对活动文件生效 + 左侧工具块是不透明等待态 |
| **Notion/Docs 建议模式 redline（正文内接受/拒绝）** | struct 轨**渲染层已精确复刻**（`struct-diff-decorations.ts` 词级绿底/红删线就地叠加）。缺的只是「交互」——给已算好的 DiffBlock 配 ✓/✗ widget |
| **RFC6902 JSON Patch + 稳定键（EASE, EMNLP2025）** | **struct 轨补齐 per-hunk 的正解方向**：给 body 块稳定 ID（消灭位置重生）→ apply 从「整档重解析」改「块级操作集」，每 op 即一个可审阅 hunk，接受=套用、拒绝=丢弃、顺序无关 |
| **Canvas 选区约束局部性** | 正交手段：用户选中段/节再发指令，块 ID 白名单随 user_message 带给 agent，天然缩小 diff 面 |

### C. LaTeX 健壮编译（诉求②）

| 模式 | 对 Prism 适配性 |
|---|---|
| **Last-good PDF 回退 + 软错误横幅** | 后端地基已在（`LatestSuccessCompile`）；**前端已保留上一版 PDF**（纠偏）。缺的是把红条降级成琥珀软横幅 + 首编空白的降级 |
| **best-effort PDF（去 halt-on-error / `-f`）** | 现在反向选择（halt-on-error 零 PDF）。可做双通道：首遍 halt 拿干净首错喂 AI，无 last-good 时补跑 nonstopmode 兜底出 PDF。**必须保留 `timeout -k` 防递归卡死** |
| **首错定位 + AI 精修回路** | `extractCompileError` 已抠 `! `+行号+源码块（比多数产品强）；缺自动有界 retry loop + 红绿 diff 一键应用（可复用 struct-diff） |
| **编译前静态 lint（chktex/自建）** | **Prism 独特优势**：真源是 struct，环境/括号来自结构必然配平、`\ref/\cite` 键可对 label 集合校验、`\usepackage` 可对「命令→包」表校验——比通用 chktex 更准 |
| **Preamble hardening + 缺包自动注入** | preamble 完全受控（非 AI 自由写），自动缺包注入解 40-60%；需 **per-class 白名单**（article/IEEEtran/elsarticle/llncs 各有自带宏，沿用已有「弃 ctex 只用 xeCJK」的克制原则） |
| **CJK fallback 字体链** | `wrapCJKInMath` 已解决数学模式丢字；缺 `\setCJKfallbackfamilyfont`/ucharclasses 兜生僻字/Ext-B/emoji（exit 0 的隐性丢字，比红条更隐蔽） |
| **增量编译（Typst comemo）** | **Prism 受限不建议现在做**：沙箱无状态一次性 job（编完 RemoveAll 无持久 aux）+ CJK 强制 xelatex（mylatexformat 不支持）。内容哈希级整篇缓存（`FindCachedCompile`）已覆盖「无改动重复编译」。Typst「结构永不失败+尽力投影」模型是长期方向，但期刊仍要 .tex 故不能替代 |

---

## 4. 设计方案（核心）

### 4.1 诉求③ 流式 + 增量编辑

#### (A) 右侧「边生成边渲染」——三段接缝，DB 真源零风险

```
┌─────────── agent 容器（主接缝，唯一需实质改动处）───────────┐
│ turnLoop.ts:217-221  content_block_delta 分支                │
│   现: input_json_delta → assembler.push() 累积、不发帧        │
│   改: input_json_delta → assembler.push() + 发新增量帧        │
│        └ 经 assembleToolUse.ts 做「流式部分值提取」：          │
│          从累积的 b.json（JSON 转义片段）容错抽出              │
│          Write.content / Edit.new_string 的明文增量           │
│          （partial-JSON parser，不能裸推转义串）              │
│   帧填法: content_delta.toolInput（字段已声明）               │
└──────────────────────────────┬──────────────────────────────┘
                               │ 后端纯字节管道，零改动
                               │ hub.go:1257 已识别 toolInput
                               │ hub.go:1262 coalesceReplay 不污染带 toolInput 帧
                               ▼
┌─────────── 前端（消费，接通死接缝）───────────────────────┐
│ fold.ts:58-60  content_delta 分支                            │
│   现: 只读 msg.text，忽略 toolInput                          │
│   改: 按 toolUseId 累积活动 tool_use 块的 toolInput 增量      │
│ usePrismChat.ts  新增「据增量入参更新预览」流式变体          │
│   （现 applyToolEditPreview 只据完整入参，加一个逐字版）      │
│   → 灌进 chat.live.content 逐字增长                          │
│ PrismLivePreview.tsx  只读覆盖层，喂增长中的 partial doc      │
│   → 右侧逐 token「边写边长」                                 │
└──────────────────────────────────────────────────────────────┘
```

**关键设计约束（对抗验证结论 1 背书）：**
- **不动后端投影 / struct apply 链路**。流式只喂只读 `PrismLivePreview`，从不 `SaveStruct`。DB struct 仍只由轮末 `applyStructRound` 在 apply 门后改写。→ **流式对 DB 真源零风险**。
- **不新造协议**——`content_delta.toolInput` 字段、shared「构建中」态、后端 `toolInput` 感知都**已存在**，是接通一条铺了一半的管子。
- 护栏（Pattern C）：socket 层为 toolInput 加相邻合并（否则大 Write 期 `socket.messages` 按 token 膨胀 O(N²) 折叠成本，`agent-stream.ts:86-94`）；公式块完成才渲 KaTeX；parse 去抖 50-100ms。

**为什么优先「逐块 DocBlock 流」还是「逐 token 文本流」？** 见开放问题 Q1。工程上**先做逐 token 明文喂 markdown 覆盖层**（改动最小、`PrismLivePreview` 已是 markdown 渲染面），逐块 struct 流是后续增强。

#### (B) 多轮局部修改「像改代码的 diff」—— 稳定 ID + per-hunk

**edit 协议选型（我的推荐）：保留 agent 现有 search/replace（原生 Edit），全部改动放在 apply/merge/review 侧。**

理由：agent 侧已是 Aider/Cursor 同款最佳实践（无行号、上下文匹配、定点最小替换）。切成「整档 struct 输出」或「带行号 diff」都是退步（模型算行号错≥40%）。窟窿在 `applyStructRound` 把稀疏 patch 摊平。

**两步落地：**

1. **【地基】给 struct body 块稳定 ID 跨 markdown 往返存活**
   - `structToEditorMarkdown` 写入不可见锚（块尾 HTML 注释 `<!--b:b7-->`，WYSIWYG 里不可见）
   - `parseEditorMarkdown` 读回该锚**替代** `md_bridge.go:189` 的位置式 `nextID`
   - agent 新增块无锚→发新 ID；删块→ID 自然消失；**内容匹配兜底**——复用 `restoreBlockMeta`（`md_bridge.go:489-553`）已有的 figure.Asset / heading(level,text) / math latex 归一配对逻辑，把「回填 Width/Label」升级成「恢复 Block ID」
   - 这是 EASE「稳定键」思想在 Prism 的落点

2. **【交互】per-hunk 接受/拒绝**
   - `pendingStructRound` 已出 old/new struct（`ws_round.go:126-127`），`struct-diff.ts diffStructs` 已算块级 `DiffBlock[]`（same/ins/del/mod）
   - 给每条 DiffBlock 配 ✓/✗ 悬浮 widget（镜像 `LatexDiffEditor` 已有的逐 hunk 浮动导航到 Tiptap 面）
   - `ApplyRound` 的 overrides 从「per-file（struct 轨被忽略）」升级成「**per-block 接受集**」：接受块取 new、拒绝块保 old
   - **删掉 `ws_round.go:170-171` / `struct_service.go:201` 那个假门注释**
   - 对 struct 轮把 `PrismWorkspaceV2.tsx:109` 的 `autoApply` 由 true 改为可选（确认门机具 `usePrismChat.ts:371-400` 已存在，主要是接线）
   - **并发硬化**（顺带）：`base_version_id` 已在版本行记录基线（`struct_repository.go:62-65`），把 epoch 门从内存 fail-open（`ws_round.go:183-193`）升级为 DB 级乐观 CAS，堵多窗口盲覆盖

3. **【增量渲染】** `StructEditor` 外部改动路径（`:261-278`）现在是整档 `setContent`；改成据 struct-diff 块级结果生成 ProseMirror 事务级 `replaceRange` patch，只改变化块，避免整棵 PM 树重建（重算装饰/KaTeX 重挂/滚动跳）。

4. **【变更导航】** `DiffMarks` 插件已持有全部 Decoration 的 from/to；暴露有序改动位置列表，加「上一处/下一处」按钮 + `view.dispatch(scrollIntoView)`（参考 `LatexEditor.tsx:97`）；给 `PrismStructSidebar.tsx:47-63` 的大纲 item 挂 onClick 滚到对应 heading。

5. **【累计会话 diff】** 用已有版本链（`SaveStructVersion` 每轮追加 + Restore）做「会话起点版本 vs 当前」的累计改动 diff 开关，复用同一套 diffStructs，让用户像看 PR 一样审阅多轮净改动。

### 4.2 诉求② 编译健壮性

**（务实路线：不换引擎，吃满 struct 真源红利 + UX 降级）**

**降低失败率：**
- **[最高 ROI] preamble 补安全宏包集**：`projector.go:242-269` 是唯一注入点，补 booktabs/siunitx/amsthm/mathtools/bm/algorithm2e(或 algpseudocode)/subcaption/multirow/array/xcolor/enumitem/tikz+pgfplots。**沙箱镜像已装无需改**（`prism_tex/Dockerfile` 已含 latex-extra/science/pictures）。需 per-class 白名单避免与期刊类自带宏冲突。
- **命令→包自动注入表**：body 命中某命令自动补对应 `\usepackage`（解 40-60% missing-dependency）。
- **编译前结构 lint**：`quality.go computeQualityReceipt` 加轻量 LaTeX 启发式——扫 DisplayMath/InlineMath/Opaque 块的 `$`/`{}` 平衡、`\left/\right` 配对、opaque 里是否 `\usepackage`（document 后非法）。发往沙箱前警告/让 AI 自修，省一次编译额度。
- **转义审计**：复核文本节点对 `_ # % & $ ~ ^ \` 是否全转义，尤其用户从 Word/网页粘贴的原文。
- **CJK fallback 字体链**：补 `\setCJKfallbackfamilyfont`/ucharclasses，堵 Fandol 缺生僻字的隐性丢字。
- **best-effort PDF 兜底通道**：无 last-good 时补跑 nonstopmode（去 halt / `-f`）产带瑕疵可预览 PDF；保留 `timeout -k`。

**失败时友好降级：**
- **红条改琥珀（复用 claw 思路）**：`PrismWorkspaceV2.tsx:587-603`(header) + `:421-439`(PDF面) 从 `brand-red` 换 `brand-amber`/`bg-warning-soft`，复用 `TurnErrorNotice.tsx:14-18` 既有约定。编译失败恰是「可恢复、有『让 AI 修复』回路」的状态，理应琥珀。
- **cryptic 日志折叠**：把 `error_summary`/`log_excerpt` 原始 LaTeX 日志折进「详情」，红条只显友好摘要。
- **grep 加锚点（修裸 `Latexmk: Errors`）**：`entrypoint.sh:76` 优先 `^! ` 引擎行 → 再 bibtex `I was expecting`/`Package biblatex Error` → 最后才 latexmk 总结行兜底。
- **错误友好化映射表**：`compile_error.go` 加「TeX 错误→可执行中文原因」（`Undefined control sequence \toprule`→「缺 booktabs 宏包，建议加载」；`Missing $/Extra }`→「数学环境括号/美元符不配」；bibtex 失败→bib 专属提示）。
- **行号问题**：`extractCompileError` 行号指向用户看不到的投影 main.tex（前端 fixCompile 要专门叮嘱 AI 忽略行号）；建立「投影行号→源块」映射，回指到具体块（「第 X 段公式导致编译失败」）。
- **首编即败降级**：右侧渲染 struct 的「预排版/所见即所得」视图（StructEditor 本就是真源）作无 PDF 时降级，而非空占位。
- **自动重编译节流**：`onApplied→triggerCompile` 加防抖/仅 idle 稳定后编译，降红条闪现（与流式③联动）。

**交叉红利**：把编译失败也建模成一次结构化 diff round——「last-good → 修复后版本」的差异走 4.1 同一套 struct-diff 流式渲染，②与③共用基建。

### 4.3 诉求① 对话展示（`PrismMessageTurn.tsx` 为主，单文件）

**要补的具体项（对齐 claw）：**
1. **气泡换 plain**：`:66`、`:76` 两处 AssistantBubble 加 `variant="plain"`（一处 prop）。
2. **答案不再埋进折叠**：重构 ProcessFold 用法——流式期把「正在生成的最终答案文本」保持在折叠**外**作为主角，仅把 thinking/工具/纯中间叙述收进折叠，消除完成时的位移跳动。数据充足（fold.ts 已产富 block），纯前端决策。
3. **ThinkingFold 提到顶层**（对齐 claw `MessageTurn.tsx:119`），消除双层折叠。
4. **编译红条改琥珀**（同 4.2，与 shared TurnErrorNotice 一致）。
5. **补写作动词**：`StreamingIndicator.tsx:63-78` toolVerb 加 Write/Edit/MultiEdit→「正在撰写/修改文档…」分支（共享映射表，对 claw/smart-search 无副作用）。
6. **额度可操作恢复**：`usePrismChat.ts:500-510` 把 paused 升级为携带 reason 的 blocked 态，复用 claw 同款琥珀重发卡（`MessageTurn.tsx:184-208`）。
7. **出口清洗**：`:66` 包一层 `stripContainerPaths(b.text)`（同时覆盖④路径泄漏面）。

> ⚠️注意：`ProcessFold` 也被 admin 会话监控镜像消费（`PrismMessageTurn.tsx:86-87` 注释），改行为需同步验证后台。

### 4.4 诉求④ 文件交互（按对抗验证结论，确实要补的）

1. **[最实] 堵 ExportDocument 死角（零架构改动）**：`spec.go` 的 `prismDisallowedTools` 追加 `"ExportDocument"`（**ReadDocument 保留**——让 agent 能读用户上传的 PDF/docx）；`edit.go` 系统提示补一条「导出 Word/PDF 是用户点工具栏按钮的事，你不自己导出、不新建交付文件」。
2. **移植出口清洗**：把 `shared/lib/strip-container-paths.ts` 复用到 prism fold / shared/chat 渲染（与①第 7 项同一改动）。
3. **提示词内容化表述**：`edit.go:163` 的「简短说明」约定 + prism-edit-discipline skill 补「对用户用内容化表述（如『论文的方法部分/参考文献』），不念 document.md/references.bib 等内部文件名」。
4. **（可选清洁）artifact 帧闸**：`TurnInput` 加 `deliverArtifacts`（仅 claw 置真），让 prism 彻底零帧，与 artifact-delivery DESIGN §1 原设计对齐。
5. **隐形改动可审阅**：`applyStructRound` 每轮静默回收 references.bib（agent 加的引用）+ terminology.md，但 `pendingStructRound` 只 diff document.md → agent 新增的参考文献/术语被应用却不进审阅（claw「看不到」病的 prism 版）。在「合并更改」卡上加「新增 N 条参考文献」chip。

> **主交付路径本身健壮，不要动**：PDF/docx 从 DB struct 真源经 projector/pandoc/latexmk 出、UI 按钮驱动——这是 prism 相对 claw 的结构优势，任何流式/增量改造都不应把交付重新耦合回 ./out//artifact 帧。

---

## 5. 分期建议

### P0（低成本、高感知收益、单文件为主、低风险）

| 项 | 诉求 | 影响面 | 复用度 | 风险 |
|---|---|---|---|---|
| **① 对话展示对齐 claw**（plain 气泡 + 答案不埋折叠 + ThinkingFold 提顶 + 写作动词 + 出口清洗） | ① | `PrismMessageTurn`/`StreamingIndicator` 单文件为主 | 复用 shared/claw 全套 | 低（需验后台镜像） |
| **② 编译红条改琥珀 + cryptic 日志折叠 + grep 加锚点** | ①② | 前端 banner 单点 + `entrypoint.sh` 3 行 | 复用 TurnErrorNotice 约定 | 低 |
| **② preamble 补安全宏包集** | ② | `projector.go` 单文件 | 沙箱镜像已装 | 低（需 per-class 白名单验证） |
| **④ ExportDocument 加 denylist + 提示词** | ④ | `spec.go`+`edit.go` | 零架构改动 | 极低 |

### P1（中成本、核心诉求、复用现有基建、中风险）

| 项 | 诉求 | 影响面 | 复用度 | 风险 |
|---|---|---|---|---|
| **③ 右侧逐 token 流式**（agent 转发 input_json_delta + fold 消费 + LivePreview 逐字） | ③① | agent turnLoop/assembleToolUse + 前端 fold/usePrismChat（后端零改） | 协议字段/后端感知已预埋 | 中（partial-JSON 提取容错 + 公式闪烁护栏） |
| **② 编译前结构 lint + 命令→包自动注入 + 错误友好化映射** | ② | `quality.go`/`projector.go`/`compile_error.go` | 吃 struct 真源红利 | 中 |
| **② best-effort PDF 兜底 + 首编降级到 struct 预排版** | ② | `entrypoint.sh`/前端 pdfKey 门控 | last-good 地基已在 | 中（保留 timeout -k） |
| **① 额度 blocked 重发卡** | ① | `usePrismChat`/`PrismMessageTurn` | claw blocked 轨样板 | 低 |

### P2（高成本、结构性、需拍板、较高风险）

| 项 | 诉求 | 影响面 | 复用度 | 风险 |
|---|---|---|---|---|
| **③ struct 块稳定 ID + per-hunk 接受/拒绝**（地基 + 交互 + 增量渲染 patch + 导航） | ③ | `md_bridge`/`struct_service`/`ws_round`/`StructEditor` + 前端 diff 交互 | struct-diff 全套已就位，接最后一公里 | 较高（Block ID 跨轮语义、删除「假门」、autoApply 改可选） |
| **③ epoch 门升级为 base_version_id CAS** | ③ | `ws_round`/`struct_repository` | base 已具备位置 | 中（并发正确性） |
| **③ 累计会话 diff / Canvas 选区约束** | ③ | 版本链 + 前端 | 版本链已在 | 中 |
| **② Typst 可选预览引擎调研** | ② | 大 | — | 高（期刊生态兼容，仅记录不硬啃） |

### 我推荐先做：**P0 全部 + P1 的「③ 右侧逐 token 流式」**

理由：
1. **P0 是「一天见效」的体验拉升**——①对话对齐、②红条改琥珀+grep 修、④堵死角，全是单文件/几行改动、复用现有约定、几乎零架构风险，直接消灭用户当下最刺眼的焦虑感（红墙 + 旧气泡）。
2. **「③ 右侧逐 token 流式」是四诉求里 ROI 最高的一根硬骨头**：对抗验证已证明**数据链路物理上已通**（input_json_delta 到达 agent、后端 hub 已感知 toolInput、前端字段已声明），这不是从零造协议，而是**接通一条铺了一半的死管子**；后端零改动、DB 真源零风险；一旦接通，用户抱怨的「工具调用→一直等待→最后一次性出现」这个**病灶连根拔除**，且同时改善①的「等待反馈感」。相比 P2 的 per-hunk（需动 Block ID 跨轮语义、风险高），逐 token 流式是「先让用户看到 AI 在实时写」的最短路径。

> 先 P0 止血、再 P1 打通流式主动脉、最后 P2 做「像改代码的 per-hunk diff」这个需要地基改造的深水区。

---

## 6. 待 owner 拍板的开放问题

1. **【③ edit 协议选型】流式喂什么粒度？**
   - **方案 A（推荐先做）**：逐 token 明文喂 markdown 覆盖层（`PrismLivePreview`）。改动最小、`PrismLivePreview` 已是 markdown 面。缺点：含 `$公式$` 需公式块完成才渲（护栏）。
   - **方案 B（后续增强）**：逐 DocBlock struct 流。最贴真源、天然不破结构，但需重排「agent 出 patch→md_bridge→struct」链路，agent 协议改动大。
   - **不推荐**：让 agent 直接吐整档 struct JSON 或带行号 diff（退步 agent 现有最佳实践）。
   - **需拍板**：先 A 后 B，还是直接投入 B？

2. **【③ per-hunk 稳定 ID 承载方式】** HTML 注释锚 `<!--b:ID-->` vs 推广现有 `{#label}` 机制？前者对 agent 透明但需保证 WYSIWYG 不可见 + 删块/新增块 ID 回收稳健（退化到内容匹配兜底）。这决定 P2 地基的实现路径。

3. **【③ autoApply 去留】** struct 轮从 `autoApply:true` 改为「per-hunk 确认门」是行为变更——是**全局切换**（所有 struct 轮都要用户逐块确认，更「像改代码」但更重），还是**可配置**（默认 autoApply、用户可开确认门）？影响用户心智模型。

4. **【② preamble 膨胀 vs 冲突】** 安全宏包集要多「厚」？全量注入解更多 undefined 但增包冲突面（尤其期刊类）。per-class 白名单的粒度（每个模板一份包集 vs 一份基础 + 期刊增量）需定。

5. **【② best-effort PDF 语义】** 是否接受「带瑕疵的部分 PDF」作为默认预览？可能误导用户以为编译成功。建议：仅在无 last-good 时启用 + 明确标注「部分渲染」。是否可接受？

6. **【② Typst 长期路线】** 是否值得投入调研 Typst 作可选预览引擎（增量 <200ms、结构永不失败），即便期刊提交仍走 LaTeX .tex？还是完全搁置、只在 LaTeX 侧做 UX 降级？

7. **【④ artifact 帧闸】** 是否顺手给 `TurnInput` 加 `deliverArtifacts`（仅 claw 置真），彻底清理 prism 的半接死帧？还是维持现状（无害）留待专门清理？

---

*本报告所有 file:line 引用来自 6 维代码调查（已亲验）；凡承重结论均经 3 条对抗验证复核，被证伪的猜测已在正文「⚠️纠偏」处推翻。*