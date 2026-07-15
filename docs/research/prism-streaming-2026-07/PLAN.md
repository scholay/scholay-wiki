# Scholay Prism 智能写作改造 · 实施计划

> 承接 [REPORT.md](REPORT.md)(四诉求诊断 + 对抗验证)。本文档 = owner 拍板后的**可执行实施计划**,给 owner 过目、点头后再写代码。
> 所有 file:line 来自已亲验的 6 维代码调查。

## owner 决策快照(2026-07-16)

| 维度 | 决策 |
|---|---|
| ① 对话展示 | 对齐 claw 现代风 |
| ② preamble | **厚安全宏包集**(一次性全注入)|
| ② 编译失败 | **agent 自修复回路**(owner 提议:让 agent 最后过一遍编译、不过就改)|
| ③ 流式粒度 | **逐 token markdown**(喂只读 PrismLivePreview)|
| ③ 多轮 diff | **先只上实时高亮**,per-hunk 接受/拒绝缓到 P2 |
| 起点 | 先给本计划,过目后再动手 |

---

## ★ 核心新设计:编译自修复回路(②主方案,owner 提议)

owner 的原话:「让 agent 在最后直接使用整个内容过一遍编译,然后没通过就更改」。这正是业界"自修复回路"(Cursor 跑 build→看报错→修),也是 REPORT §3C 点名缺的那块。下面是落地设计。

### 为什么可行(已核实)
- 后端 `TexClient.Compile`([texclient.go:72](../../backend/internal/prism/texclient.go#L72))**同步**返回 `CompileResult`(含错误日志),95s poll。
- `compile_error.go extractCompileError` 已把 TeX 日志抠成「第 N 行附近 + 源码片段」的可读 summary。
- **dry-run 投影可行**:`parseEditorMarkdown`(cwd document.md → struct)+ `projector`(struct → .tex)都是纯函数,可在内存跑一遍 → 编译,**不落 DB**、不碰 apply 门。
- agent 已能经 **MCP 回调后端**(minicod 先例,`mcp__minicod__*`),加一个 `mcp__prism__compile_check` 有成熟通道。

### 推荐架构 = Variant A「agent 回合内自检」(truest to「像改代码」)

```
一轮写作:
  /round/prepare 铺源 → agent Read/Edit/Write 改 cwd document.md
    → 【新】agent 收尾前必调 compile_check 工具(系统提示强制)
        └ 后端 handler:读 cwd document.md(+references.bib)
          → parseEditorMarkdown → projector(内存 dry-run,不 SaveStruct)
          → TexClient.Compile → 回 friendly error summary 或「编译通过 ✅」
    → 若有错:agent 读友好报错 → Edit cwd 定点修 → 再调 compile_check
        (有界:系统提示 max ~3 次;后端硬顶防失控 = 每轮 compile_check 调用上限)
    → 编译通过(或 3 次仍不过则如实说明)→ message_complete
  → 用户看 diff → /round/apply(应用的内容已能编译 → 用户几乎不再见红条)
```

- **对用户**:看到 agent 像 Cursor 一样「校验编译中… 发现 2 处错误… 修正…」的工具调用流,而非事后红墙。
- **成本控制**:每次 compile_check = 一次编译(秒级)+ 一次 agent 修复轮(token)。厚 preamble + 编译前 lint(见 P1-2b)先挡掉大部分,自修复只兜漏网的;有界 ≤3 次 + 后端硬顶。
- **真源零风险**:compile_check 是 dry-run,只读 cwd、内存投影,从不 SaveStruct;真源仍只由 apply 门后改写。

### 兜底(自修复耗尽后)
即便自修复 3 次仍不过(罕见),用户侧仍有 REPORT 已证实的 `LatestSuccessCompile` last-good PDF + 琥珀软提示(P0-2),不会空白/红墙。

### 备选 = Variant B「后端编排修复」(工作量更小,UX 稍逊)
不加 agent 工具:message_complete 后后端 dry-run 编译,失败则经既有 agent WS 通道注入一条合成 user_message(「编译失败:<friendly error>,请修正」),有界重试。复用现有轮机具、无新 MCP 工具,但「谁决定去编译」从 agent 变后端、少了「agent 主动自检」的 Cursor 感。**建议先 A;若 MCP 工具搭建成本超预期,回落 B。**

> 🔬 **落地前唯一的 spike**:确认 `mcp__prism__compile_check` 这条「agent → 后端 dry-run 投影+编译 → 回报错」通道能干净打通(dry-run 投影正确性 + MCP 工具注册)。这是 P1-2 的第一步。

---

## P0 —— 止血(单文件为主 · 低风险 · 一天见效)

### P0-1 对话展示对齐 claw（诉求①)
**文件**:`frontend-user/src/features/prism/components/chat/PrismMessageTurn.tsx`(主)、`StreamingIndicator`(shared)、`usePrismChat.ts`
**改动**:
1. 两处 `AssistantBubble`(:66/:76)加 `variant="plain"`(去白卡框,全宽 markdown)。
2. 重构 ProcessFold 用法:**流式期把"正在生成的最终答案"保持在折叠外作主角**,只把 thinking/工具/纯中间叙述收进折叠 → 消除 turn 完成时的位移跳动。
3. ThinkingFold 提到顶层(对齐 claw `MessageTurn.tsx:119`),消除双层折叠。
4. `StreamingIndicator` toolVerb 加 `Write/Edit/MultiEdit → "正在撰写/修改文档…"`(共享映射表,对 claw/smart-search 无副作用)。
5. `b.text`(:66)包 `stripContainerPaths(...)` 出口清洗(同时覆盖④路径泄漏)。
**验证**:tsc + vite build;人眼对比 claw 对话观感;**回归后台会话监控**(`PrismMessageTurn.tsx:86-87` 注释:ProcessFold 被 admin 镜像消费)。
**风险**:低(纯前端;唯一注意点=后台镜像)。

### P0-2 编译红条改琥珀 + grep 加锚点（诉求②①)
**文件**:`PrismWorkspaceV2.tsx`(banner :587-603/:421-439)、`docker/…/prism_tex/entrypoint.sh`(:76)、`compile_error.go`
**改动**:
1. 红条 `brand-red` → `brand-amber`/`bg-warning-soft`(复用 `TurnErrorNotice` 既有约定);cryptic 原始日志折进「详情」,只显友好摘要。
2. `entrypoint.sh:76` grep 加锚点修裸 `Latexmk: Errors`:优先 `^! ` 引擎行 → 再 bibtex `I was expecting`/`Package … Error` → 最后才 latexmk 总结行兜底。
3. `compile_error.go` 加「TeX 错误 → 中文可执行原因」映射表(`Undefined control sequence \toprule`→「缺 booktabs,建议加载」;`Missing $`/`Extra }`→「数学括号/美元符不配」;bibtex 失败专属提示)。
**验证**:构造缺包/裸数学/bib 错样例,看红条是否变琥珀 + 报错是否可读。
**风险**:低。

### P0-3 厚安全宏包集（诉求②,owner 选"厚")
**文件**:`backend/internal/prism/projector.go`(注入点 :242-269)
**改动**:preamble 一次性补装常用包:`booktabs siunitx amsthm mathtools bm algorithm2e(或 algpseudocode) subcaption multirow array xcolor enumitem tikz pgfplots`。沙箱镜像已装(latex-extra/science/pictures),无需改镜像。
**关键防冲突**:per-class 白名单——期刊类(IEEEtran/elsarticle/llncs)自带部分宏,要按 `manifest.json` 的模板类做「基础厚集 + 期刊增量」而非无脑全灌(否则 option clash)。沿用已有"弃 ctex 只用 xeCJK"的克制原则。
**验证**:对四个模板类各编一遍夹具(含 beidou.tex 的 pgfplots),确认无 option clash;跑 `md_bridge_roundtrip_test` + `compile_error_test`。
**风险**:低-中(冲突面,靠 per-class 白名单挡)。

### P0-4 ExportDocument 堵死角 + 提示词内容化（诉求④)
**文件**:`backend/internal/prism/spec.go`(`prismDisallowedTools` :42)、prism 系统提示(`edit.go` :157/:163)
**改动**:
1. `prismDisallowedTools` 追加 `"ExportDocument"`(**ReadDocument 保留**——agent 要能读用户传的 PDF/docx)。堵掉「agent 调 ExportDocument 写 ./out/、宣称已交付下载区、但 prism 不收割不渲染 → 永久拿不到」死角。
2. 提示词补:导出 Word/PDF 是用户点工具栏按钮的事,agent 不自己导出/不新建交付文件;对用户用**内容化表述**(「论文的方法部分/参考文献」),不念 document.md/references.bib 等内部文件名。
3. (随 P0-1)出口清洗覆盖路径泄漏。
**验证**:确认 prism agent 不再能调 ExportDocument;提示词跑一轮看是否还念文件名。
**风险**:极低(零架构改动)。

---

## P1 —— 拔病灶

### P1-1 逐 token 流式渲染（诉求③,owner 选逐 token markdown)
**接缝**(REPORT §4.1 已画,后端零改):
1. **agent 侧(唯一实质改动)**:`agent/src/turn/turnLoop.ts:221` 的 `input_json_delta` 分支——现在只 `assembler.push()` 累积;改成**同时发增量帧**。经 `assembleToolUse.ts` 的 partial-JSON 容错提取,从累积的转义片段里抽出 `Write.content`/`Edit.new_string` 的明文增量,填进 `content_delta.toolInput`(字段已声明)。
2. **后端**:零改动(`hub.go:1257` 已识别 toolInput,:1262 coalesceReplay 不污染带 toolInput 帧)。
3. **前端消费**:`fold.ts:58-60` 接通 toolInput(现只读 msg.text);`usePrismChat.ts` 加「据增量入参逐字更新预览」变体(现 `applyToolEditPreview` 只据完整入参);灌进 `chat.live.content` → `PrismLivePreview` 逐字长出。
**护栏**(必做):socket 层为 toolInput 加相邻合并(防大 Write 期 `socket.messages` O(N²) 折叠);**公式块完成才渲 KaTeX**(否则含 `$…$` 学术正文疯狂闪);parse 去抖 50-100ms;stable key 防重排。
**验证**:发一轮整档 Write,右侧应逐字长出而非事后一次性;长文档不卡;公式不闪。
**风险**:中(partial-JSON 提取容错 + 公式闪烁护栏是关键难点)。

### P1-2 编译自修复回路 + 编译前 lint（诉求②,owner 提议的主方案)
**2a 自修复回路**(见上「★核心新设计」Variant A):
- 新增后端 dry-run 编译端点:读 cwd document.md+references.bib → 内存 parseEditorMarkdown+projector(不 SaveStruct)→ TexClient.Compile → 回 friendly summary。
- 新增 `mcp__prism__compile_check` 工具接该端点(先跑通 spike)。
- prism 系统提示补:收尾前必自检编译、不过则定点修、有界 ≤3 次。
- 后端硬顶:每轮 compile_check 调用上限(防失控烧 token/编译)。
**2b 编译前结构 lint**(省编译额度 + 喂 agent 自修):`quality.go computeQualityReceipt` 加轻量 LaTeX 启发式——扫 DisplayMath/InlineMath/Opaque 块的 `$`/`{}`/`\left \right` 平衡、opaque 里非法 `\usepackage`、文本节点 `_#%&$~^\` 转义审计。Prism 独有优势:真源是 struct,环境/括号来自结构必配平、`\ref/\cite` 键可对 label 集合校验、`\usepackage` 可对「命令→包」表校验——比通用 chktex 更准。
**2c 命令→包自动注入**(与 P0-3 厚集互补):body 命中某命令自动补对应 `\usepackage`,解 40-60% missing-dependency 的长尾。
**验证**:构造缺包/裸数学/bib 错的轮次,观察 agent 是否自检→自修→编译通过,用户不见红条;有界耗尽时回落 last-good+琥珀。
**风险**:中(dry-run 投影正确性 + MCP 工具 + 有界成本控制)。

### P1-3 实时 diff 高亮强化（诉求③,owner 选"先只实时高亮")
**改动**:AI 改动在右侧 `StructEditor` 就地绿加/红删高亮(基建已在:`struct-diff-decorations.ts` 词级装饰 + `tiptap-diff-marks.ts`),把现在「整档闪」升级成「只变化块打 diff 标记」;`StructEditor` 外部改动路径(:261-278)从整档 `setContent` 改成据 struct-diff 块级结果的 PM 事务级 `replaceRange`(只改变化块,免整棵树重建/KaTeX 重挂/滚动跳)。加「上一处/下一处改动」导航(`DiffMarks` 已持有 from/to)。
**注意**:**per-hunk 接受/拒绝不在 P1**(owner 决定缓到 P2)——P1 的 diff 是**只读痕迹**,轮末仍走现有 autoApply。
**风险**:中(增量渲染 patch 的正确性)。

---

## P2 —— 深水区(需地基改造 · 后续单独拍板)

### P2-1 struct 块稳定 ID + per-hunk 接受/拒绝（诉求③完全体)
- **地基**:给 struct body 块**跨 markdown 往返稳定的 ID**(`structToEditorMarkdown` 写不可见 HTML 注释锚 `<!--b:ID-->`;`parseEditorMarkdown` 读锚替代 `md_bridge.go:189` 位置式 `nextID`;删块/新增块 ID 回收 + 内容匹配兜底,复用 `restoreBlockMeta` 归一配对)。消灭「Block.ID 位置重生 → 跨轮 diff 失效」根因。
- **交互**:给每条 `DiffBlock` 配 ✓/✗ widget(镜像 `LatexDiffEditor` 逐 hunk 逻辑到 Tiptap 面);`ApplyRound` overrides 从 per-file(struct 轨被忽略)升级成 **per-block 接受集**;删 `ws_round.go:170-171`/`struct_service.go:201` 那个"假门";struct 轮 `autoApply` 由 true 改可选(确认门机具 `usePrismChat.ts:371-400` 已存在)。
- **并发硬化**:epoch 门(`ws_round.go:183-193` 内存 fail-open)升级为 `base_version_id` DB 级乐观 CAS。
- **累计会话 diff**:用现有版本链做「会话起点 vs 当前」的 PR 式净改动审阅。
**风险**:较高(Block.ID 跨轮语义是关键;需专门拍板 autoApply 心智变更)。

---

## 建议执行顺序

1. **P0 全部**(①③④ 止血,一天见效,消灭红墙 + 旧气泡的当下焦虑)。
2. **P1-2 spike**(先验证 dry-run 投影 + compile_check MCP 通道能干净打通——这是 owner 最看重的自修复回路的地基)。
3. **P1-1 逐 token 流式**(拔"等待→一次性出现"病灶)。
4. **P1-2 完整自修复回路 + lint**。
5. **P1-3 实时 diff 高亮**。
6. P2 单独拍板后再启。

## 仍待确认(实施中若遇到)
- P1-2 自修复:Variant A(agent 自检,推荐)vs B(后端编排,省工)——先按 A 做 spike,不通再回落 B。
- P0-3 厚集的 per-class 白名单粒度(每模板一份 vs 基础+期刊增量)——实施时定。
- compile_check 有界次数(默认 3)与后端硬顶值。
