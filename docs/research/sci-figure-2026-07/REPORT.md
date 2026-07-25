# 科研绘图功能技术调研（复核 + 落地）

> 主题：**利用 agent 为 Scholar 增加「科研绘图」功能**。
> 本报告分两部分：① 对既有领域综述逐条**事实复核**；② 在此基础上给出**面向本平台的落地技术调研**（架构 / 分期 / 风险 / 合规）。
> 日期：2026-07-20。方法：多 agent 并行核查 + 联网取证 + 代码勘察，末尾对抗式审稿收敛。

---

## 关于本轮核查的可信度声明（务必先读）

核查取证分两批，可信度不同，报告全程据此措辞：

- **直接联网核实（高可信）**：Data Formulator 版本、LIDA、MatPlotAgent(2402.11453) / PlotGen(2502.00988) 的存在性与组件、2026「可编辑科研图」四篇编号（PaperBanana 2601.23265 / AutoFigure-Edit 2603.06674 / LiveFigure 2605.23527 / Crafter 2605.30611，并以对照 ID `2601.99999` 正确返回 404 证明取证工具不编造）、AutomaTikZ / DeTikZify / StarVector、BioRender AI / FigureLabs / SciFig.ai / FigJam AI、**ScImage(2412.02368)**、**ChemCrow(s42256-024-00832-8)**、**RDKit MolDraw2DSVG**、以及 **Elsevier / Nature 出版政策**。
- **原综述引用、本轮未独立核实（仅作设计信号，不当既证事实）**：MatPlotAgent/PlotGen 的具体分数与 venue、MM-ReCoder、PlotGen-Bench、Losing the Plot、Critic-V、Huang et al.、Does It Run、VSR、ChartLlama 等。凡此一律标注「未核实」，作为**工程审慎原则**采纳，不引其绝对数字。
- **代码勘察**：`agent/Dockerfile` 由本轮直接读取（容器运行时结论为**实测事实**，非推测）；其余后端 seam 由代码勘察 agent 通读相关文件得出，file:line 引用来自该勘察。

---

## 一、执行摘要

1. **领域已跨过「能不能生成」，进入「生成得对不对、能不能编辑」阶段。** 以 render→VLM 批评→修复 为核心的自校正闭环谱系（MatPlotAgent → PlotGen）在 2024–2025 确立；2026 上半年集中出现一批**「可编辑科研图」系统**（PaperBanana / AutoFigure-Edit / LiveFigure / Crafter），核心命题从「画得像」转向「可编辑、可控风格、内容忠实」。

2. **原综述整体方向可靠，仅一处硬事实被推翻、若干处需收敛。** 唯一 **refuted**：Data Formulator「0.7 是 alpha」——实为 0.7 是稳定版（2026-05-28），alpha 仅指独立的 0.8 预览（0.8.0a2）。**降级**：BioRender「出版授权 licensing」只能部分证实。**其余经直接核实的条目全部成立**，且原综述最关键的三块——图像直出不可靠（ScImage / PaperBanana 实证）、化学图应交专业工具（ChemCrow / RDKit）、出版合规（Elsevier / Nature）——**均已获直接证据确认**（详见 §二）。

3. **对 Scholar 的核心建议：走「代码执行 + 双层校验 + 场景图中间表示」路线，而非图像生成模型直出。** `agentbridge` + `scholar_agent` 容器 + claw 产物交付 + prism Tiptap 可编辑 struct 四块地基齐备，一个绘图 feature 的「桥接挂载」成本约 250 行机械胶水。**但真正的前置工程在容器侧执行能力**：本轮读 `agent/Dockerfile` 已**确认** `scholar_agent` 镜像装了 `python3` 但**没有 matplotlib / numpy / pandas / plotly，也没有 texlive/LaTeX**——绘图运行时必须在**构建期**烧进镜像（运行期是断网 bwrap 沙箱，无法 pip/apt）。这不再是「待验证假设」，而是**已确认的 P0 前置任务**。

4. **图像生成直出默认不启用，且这是被实证 + 合规双重逼出的正确解。** ScImage 与 PaperBanana 实证均表明图像模型在组合关系与数值忠实上显著退化；Elsevier 明确「通用图像 AI 工具不得用于图形摘要」，Nature 明确「不接受生成式 AI 图像、但允许数据驱动的可视化」。本平台的代码执行 + 矢量源码路线，恰好落在两大出版社**允许**的一侧。

---

## 二、原综述核查与勘误

> 本节严格区分「直接核实」与「未核实」。凡标「未核实」者，其作为工程结论承重时在后文显式标注「设计原则 / 待验证」。

### 2.1 直接联网核实（含证据）

| 条目 | 原综述声称 | 核查结论 | 更正 / 限定 |
|---|---|---|---|
| **Data Formulator 版本** | 「最新版 0.7 是 alpha」 | **refuted** | 0.7 是**稳定版**（2026-05-28）；alpha 仅指独立的 0.8 预览（0.8.0a2，`pip install --pre`）。 |
| LIDA | 微软，四模块 grammar-agnostic 可视化/信息图，ACL 2023 demo | **confirmed** | Summarizer / Goal Explorer / VisGenerator / Infographer；VisGenerator 生成/精修/执行可视化代码。 |
| Data Formulator 能力 | NL + 数据变换 + 迭代分析 + 代码检视 + ~30 图型 | **confirmed** | 微软开源；可从截图/文本/网页抽数据；生成图可编辑（代码检视）。 |
| MatPlotAgent | arXiv 2402.11453，matplotlib + 自调试科研可视化 agent | **confirmed（存在性/标题/组件）** | 组件=查询理解 → 代码生成+迭代自调试 → 视觉反馈纠错；含 MatPlotBench。**具体分数与 venue 本轮未核实，不引用。** |
| PlotGen | arXiv 2502.00988，多智能体 + 多模态反馈 | **confirmed（含量级更正）** | 标题「PlotGen: Multi-Agent LLM-based Scientific Data Visualization via Multimodal Feedback」；含**三个反馈 agent（数值/文本/视觉）**。**原综述「去掉视觉反馈掉 10-15%」的具体量级本轮未核实，不引用。** |
| PaperBanana | 5-agent 流水线（检索/规划/风格/绘制/批评） | **confirmed** | arXiv **2601.23265**（非原综述写的 2601.04390 系列，编号需以此为准）；五 agent 1:1 对应。2026 编号真实。 |
| PaperBanana 结论 | 图像模型统计图更漂亮但数值幻觉+元素重复更多、忠实度更低 | **confirmed** | 结论在论文/项目页原文（numerical hallucination / element repetition）。**这是「图像直出不可靠」最硬的一句实证。** |
| AutoFigure-Edit | arXiv 2603.06674，可编辑科研图 | **confirmed** | 2026-03，cs.CV，原生 SVG 编辑。2026 编号真实。 |
| LiveFigure | arXiv 2605.23527，脚本生成可编辑 PPT 对象 | **confirmed** | 2026-05，cs.CE；蓝图规划 → 可执行脚本经 PowerPoint 接口产全矢量可编辑对象；GitHub 标 ICML 2026。真实。 |
| Crafter | arXiv 2605.30611，CraftEditor 位图转可编辑 SVG | **confirmed** | 2026-05，cs.CV，多 agent harness + CraftBench。真实。 |
| AutomaTikZ | text→TikZ，ICLR 2024，OpenReview v3K5TVP8kZ | **confirmed** | arXiv 2310.00367；DaTikZ 数据集。 |
| DeTikZify | 草图/图→TikZ，NeurIPS 2024 | **confirmed** | proceedings hash 精确匹配；arXiv 2405.15306；NeurIPS 2024 spotlight。 |
| StarVector | text/image→SVG 代码，CVPR 2025 | **confirmed** | arXiv 2312.11556（ServiceNow Research）。 |
| **ScImage** | arXiv 2412.02368，评测简单空间/数量/属性尚可、组合关系全退化 | **confirmed** | 标题「ScImage: How Good Are Multimodal LLMs at Scientific Text-to-Image Generation?」；评 GPT-4o/Llama/AutomaTikZ/DALL·E/StableDiffusion，代码 vs 直出两模式；结论：单维尚可，**组合/关系型 prompt 所有模型显著退化**。原综述表述准确。 |
| **ChemCrow** | Nature MI，LLM+专业工具 > 内部知识 | **confirmed** | 「Augmenting large language models with chemistry tools」，Nature Machine Intelligence，2024-05-08；GPT-4 + **18 个专家工具**，在有机合成/药物/材料任务上增强 LLM 表现。原综述结论成立。 |
| **RDKit** | rdMolDraw2D 确定性输出可编辑 SVG 分子结构 | **confirmed** | `MolDraw2DSVG.GetDrawingText()` 返回 SVG 字符串；支持元数据嵌入/原子标记。确定性、零幻觉。 |
| BioRender AI（生成/图层） | 文字/摘要/SOP/草图/参考图 → 首稿；输出拆背景图 + 可编辑文本图层 | **confirmed** | 生成入口与「背景图 + 可编辑文本图层」拆分均证实。 |
| BioRender AI 授权 | 图标库 + 模板 + **licensing** | **partly** | 图标/模板证实；**AI 生成图的出版授权未证实**——BioRender AI 页反而自警「多数主流期刊限制/禁止全 AI 生成的科研图」、NIH 禁止基金申请使用。**不可表述为「拿到干净的出版授权」。** |
| FigureLabs | 「首个科研插图 AI Agent」 | **confirmed** | figurelabs.ai；Sketch-to-Figure / Text-to-Figure / Figure Refiner / 位图矢量化。 |
| SciFig.ai | 6 输入模式，导出可编辑 PPTX/分层 SVG/8K PNG | **confirmed** | 生成后全可编辑；声称 300 DPI 期刊合规。 |
| FigJam AI | 通用流程图/时间线，**无科学知识库** | **confirmed** | 通用提示式图表工具，页面无科学知识库表述。 |
| **Elsevier 政策** | 允许 AI 辅助流程图/概念图/可复现数据可视化（须披露+核验）；禁生成/修改显微镜/病理/blot/扫描；通用图像工具不得用于图形摘要 | **confirmed** | 逐条命中（见 §七）。**图形摘要须用「专用科学插图工具（如 BioRender）」**。原综述表述准确。 |
| **Nature Portfolio 政策** | 不接受生成式 AI 制作的插画/视觉内容 | **confirmed（有一处需谨慎表述）** | Springer Nature 期刊**不允许**发表生成式 AI 图像；但**区分**「AI 辅助数据可视化（一般允许，须披露）」与「AI 生成概念插图（不允许）」。**注：原综述「少数研究 AI 本身的文章除外」这一 2023 旧例外，本轮搜索未能确认其现行原文措辞，不作为现行事实断言。** |

### 2.2 原综述引用、本轮未核实（作设计信号，不作既证事实）

MM-ReCoder、PlotGen-Bench、Losing the Plot、Critic-V、Huang et al.、Does It Run、VSR、ChartLlama——这些编号/结论**不在本轮直接核查范围**。原综述若干「具体分数」（如 GSM8K 7.6%/8.8%、run-error 15%→4.5%、色盲合规 7.2–33.3%、8 基准中 5 个超 GPT-4V 等）**来源未核实，一律不引用为事实**；仅保留其背后的定性工程原则（见 §五校验器）。**ChartLlama 归类需更正**：它属「图表理解/生成」MLLM，不是 render-critic-fix 闭环，自校正谱系应锚定已核实的 MatPlotAgent → PlotGen。

---

## 三、领域 SOTA 现状（按 6 条技术路线）

**路线 1 · LLM 驱动的数据可视化代码生成（数据图→代码）。** 最成熟、对本平台最直接可用。产品侧 LIDA（四模块 grammar-agnostic）、Data Formulator（NL + 数据变换 + 迭代 + 代码检视 + 30+ 图型，0.7 稳定版）；研究侧 MatPlotAgent（查询理解→代码生成→迭代自调试→视觉反馈）。**要点：产物是可执行代码而非位图**，天然可编辑、可复现、数值忠实——**且正好落在 Elsevier/Nature「数据驱动可视化」允许的一侧**。

**路线 2 · 多智能体图形生成 + 2026「可编辑科研图」系统。** PaperBanana（2601.23265，五 agent 参考驱动）实证：**图像模型更好看，但数值幻觉与元素重复更多、内容忠实更低**。AutoFigure-Edit（原生 SVG 编辑）、LiveFigure（脚本→PowerPoint 全矢量可编辑）、Crafter（位图→可编辑 SVG）。**共同信号：2026 的价值主张已从「生成」转向「可编辑 + 内容忠实」。**

**路线 3 · 可编辑矢量图（TikZ/SVG）代码生成。** AutomaTikZ（text→TikZ）、DeTikZify（草图/图→TikZ）、StarVector（text/image→SVG 代码）。产出**可直接进 LaTeX / 可编辑的矢量源码**，与本平台 prism（LaTeX 写作）天然契合——流程图、方法图、示意图适合走 SVG/TikZ 而非代码执行绘图。

**路线 4 · 直接生成科研图片（视觉强、可靠性弱，但 2026 有实质进步）。** ScImage 实证：单维（空间/数量/属性）尚可，组合关系全退化。**更新**：2026 的前沿图像模型（Google **Nano Banana 2 / Gemini 3 Pro Image「Nano Banana Pro」**）在文本渲染、信息图、由笔记转图表/数据可视化上明显强于综述隐含的「文生图=中低成熟」框架；但**仍无独立的数值准确性 / 出版图基准**证明其对定量图可靠，且 Elsevier/Nature 均禁用通用图像工具于科研图。**结论不变：图像直出仅作灵感/风格副路径，不作定量交付。**

**路线 5 · AI 科研图产品（竞品参照）。** BioRender AI（拆背景图 + 可编辑文本图层，但对全 AI 图有出版 caveat）、FigureLabs、SciFig.ai（导出可编辑 PPTX/SVG/8K PNG）、FigJam AI（无科学知识库）。**竞品共识：输出必须可编辑，领域知识/图标库是差异化壁垒。**

**路线 6 · render→VLM 批评→修复 自校正闭环（本平台方法论依据）。** 已核实锚点 = MatPlotAgent → PlotGen（三反馈 agent）。以下失败模式的**具体文献依据本轮未核实**，采纳为**工程审慎原则**：①VLM 读退化/低分辨率图易幻觉且过度自信 → critic 不可独任裁判；②无 sound verifier 的内在自校正可能「越改越差」；③能跑 ≠ 忠实（run-error 降低不等于消除数值幻觉/色盲缺陷）；④编辑型任务即使代码能跑也可能退化。**三条稳健工程铁律**：(a) **确定性执行器在前**（sound verifier），VLM critic 只管残余语义/美学；(b) 批评前渲成干净高 DPI、强制结构化 grounded 批评、允许 critic 说「看不清/不确定」；(c) 限迭代 ~3 轮 + 保留 last-good + 仅当可度量指标改善才接受编辑。

**路线补 · 专门领域（分子/化学）。** ChemCrow 与 RDKit 均已核实：分子结构走 **RDKit（SMILES→SVG，确定性、零幻觉）**，不交给 LLM 画——「用工具消除幻觉」原则在化学图上的自然延伸。

---

## 四、Scholar 落地可行性（基于代码勘察）

本平台独特优势：**绘图 feature 的桥接管线可复用近 100%**，工作量集中在「容器侧执行运行时 + 产物交付缺口 + 可编辑中间表示 + 图像子路径计费」。

### 4.0 容器运行时（实测事实，来自 `agent/Dockerfile`）

`scholar_agent` 镜像**已装**：`bun`（主运行时）、`bubblewrap`（生产 bwrap 沙箱）、`poppler-utils`、`pandoc`、`python3` + `python3-docx` + `python3-openpyxl`、`chromium` + `fonts-noto-cjk`（mermaid 服务端渲染）、`nodejs`/`npm`（仅给 boltslides「制作PPT」用，预置 `/opt/bolt-slides` 脚手架 + 预装 node_modules）。此外 `agent/src/render/math.ts` 用 `@resvg/resvg-wasm` 做 SVG→PNG（纯 WASM，无需 Chrome）。

**未装（绘图硬缺口）**：`matplotlib` / `numpy` / `pandas` / `plotly` / `scipy`、`texlive`/LaTeX、`python3-pptx`（Debian 包库缺，pptx 走 pandoc）。

**两条硬约束**（决定 P0 形态）：
1. **运行期是断网 bwrap 沙箱 + cwd jail**——agent **无法在运行时 pip/apt install**；绘图依赖必须**构建期烧进镜像**（apt `python3-matplotlib python3-numpy python3-pandas` 或 `pip install` 一层，均可，image 已 ~1.1GB+，增量可接受）。**先例**：boltslides 正是「构建期预置整套 node 工具链 + 运行期零安装」，直接可仿。
2. **本容器无 LaTeX**——prism 的 TikZ/LaTeX 编译在**独立的 `prism_tex`（network_none）沙箱**里。故 TikZ→PDF/SVG 应**复用 prism_tex，而非在 `scholar_agent` 里另起 texlive**。

### 4.1 能力矩阵

| 能力维度 | 可复用（已有） | 需新建 / 需决策 |
|---|---|---|
| **feature 桥接** | `agentbridge` 全套：用户↔session 映射、WS 升级、ws-ticket 鉴权、心跳、首条消息系统提示注入、自动/人审权限、配额+用量钩子。声明一个 `FeatureSpec` + `Bridge.For(spec)` 即得（`backend/internal/agentbridge/spec.go`） | `internal/scidraw/{spec.go,handler.go}`（照抄 `smartsearch`），`internal/prompts/sci_draw.go` 系统提示 |
| **会话表** | `agent_sessions` 共享表，按 `feature_key` 寻址；迁移 0070 起支持多会话 | **需先定归属模型**：若选 **user-level（owner NULL）+ 多会话**，会撞迁移 0034 anchor 生成列唯一索引（锁死单会话 + 被幂等去重 DELETE 清行），须新迁移镜像 0070；若选**单会话**或 **entity-owned（仿 prism/peerreview）**则**无需**该迁移（见 §七 风险 6） |
| **代码执行运行时** | claw 已用 `AllowBash:true` 打开 shell（`backend/internal/claw/spec.go`）；`AllowBash` 是驱动 agent `--disallowed-tools` 与后端权限黑名单的单一真源 | **前置硬需求（见 §4.0）**：matplotlib/numpy/pandas 必须构建期烧进镜像并在断网沙箱实测；`AllowBash:true`（或精选工具集）+ `SessionOptions.AddDirs` 指向绘图 skill 目录 |
| **沙箱/网络隔离** | agent 容器 bwrap（断网 + cwd jail）；后端权限门管不住 shell，靠容器沙箱兜底 | 生产必须确认 bwrap 生效；`AllowBash` 无路径限制 |
| **产物交付（OUT）** | claw artifact-harvest：agent 写 `./out/` → on-list 收割到 MinIO（`agent_artifacts` 带 `owner_kind/owner_id/feature_key` 通用列，`backend/internal/claw/artifact_harvest.go`）→ `GET /claw/artifact/:id` 按真实 MIME 交付（attachment+nosniff）。SVG/PNG/PDF 全通，PPTX 下载态 | 复用即可：挂 3 条下载路由 + harvest 钩子，或直接走 claw 的 `out/` 约定 |
| **矢量→位图** | `agent/src/render/math.ts` 的 `@resvg/resvg-wasm`（SVG→PNG）；`mermaid.ts` Chromium 渲染 | **缺 session-bound 原语**：现有 resvg 只经 `/render/math` 返 base64，**不落 `out/`、不被收割、不回灌视觉** |
| **视觉自校验通道** | 上传图经 `agent/src/server/attachments.ts` 内联为 Anthropic image block（仅 jpeg/png/gif/webp）；`stripImageBlocks` 兜无视觉模型 | **关键缺口**：视觉通道只读**传入**附件，**无机制把 agent 自己生成的 `out/` 图回灌进模型视觉**；SVG 上传即被拒。要做「render→看→改」必须新建：SVG→PNG 光栅化 + 把该 PNG 作为视觉块回注上下文 |
| **前端渲染** | 读侧：markdown 栈（mermaid 12 型 / 内联 SVG+DOMPurify / KaTeX / `ZoomableSvg` 平移缩放）；交付侧：`ClawArtifactPreview` 按类型分派（img/svg/pdf/xlsx/docx/html）；编辑侧：prism Tiptap v3 + MathLive「双击渲染对象→可视编辑器→源码 round-trip」（`frontend-user/src/features/prism/components/MathEditorDialog.tsx`） | **零矢量绘图库**：无 excalidraw/tldraw/konva/fabric，`src` 内零 `<canvas>`。任何直接操纵编辑面均为净新增。**v1 采用「双击元素→属性对话框」轻编辑（仿 MathEditorDialog），不做拖拽式直接操纵** |
| **计费/配额** | 三层全自动：PreUserMessage 前置门（`vip.CheckDailyQuotaOverdraft`）、WS 管线内 `recordAgentTokens`→`llmusage.Record` 唯一扣费点、BudgetProvider 在途预算。7 天锚定窗口 free/pro/max（`backend/internal/vip/quota.go`） | **纯代码执行走正常文本 token，计费三层自动生效，无需补丁。** 仅当**实际启用图像生成模型子路径**时才需图像/零 token 计费补丁（见 §七 风险 2）——**非 P0 blocker** |
| **模型目录** | `agent_models` 行带 `billing_weight` + 单价 + `vision` + `min_tier`；feature 默认模型经 `chat_default.<key>` 绑定 | 加 `PurposeChatDefaultSciDraw` 到常量集 + `AllPurposes` + handler feature 列表 + 种子绑定迁移（仿 0063），否则无 per-feature 模型选择（静默回落全局默认） |

---

## 五、推荐架构

**5.1 feature 声明（后端约 250 行机械代码，不含容器运行时前置）。** 按 `smartsearch` 模板落 `internal/scidraw/{spec.go,handler.go}` + `internal/prompts/sci_draw.go`。`FeatureSpec` 关键取值：`Key="sci_draw"`；`InjectPromptOnFirstMsg=true`；`PermissionMode=PermissionAuto`；`PreUserMessage`/`BudgetProvider`/`OnMessageComplete` 经 `agentbridge.StandardHooks` 接 `vip`；`AllowBash=true`；`SessionOptions.AddDirs` 指向绘图 skill 目录，`DisallowedTools` 经 `SessionDisallowedTools(base, allowBash)` 防前后端黑名单漂移。bootstrap 5 处触点 + routes_user 4 HTTP + 1 WS。别忘 `VIPCheckerWired()` fail-fast 断言（漏接配额则启动即崩，防白嫖）。**这 250 行是「桥接挂载」成本，不含 §4.0 的容器运行时预置与断网沙箱验证——后者独立且不可省。**

**5.2 渲染器分派（核心设计——按图类型选路线，而非一把梭图像生成）。**
- **数据图（散点/折线/柱/箱线/误差棒/热图）→ 代码执行（matplotlib/plotly）**。产物 `.py` + PNG/SVG/PDF 落 `out/`。数值忠实、可复现、可版本化。**前提：§4.0 容器运行时已就绪。**
- **流程图/方法示意图 → SVG / TikZ 源码**。SVG 直接 `Write` 进 `out/`（前端 DOMPurify 内联预览就绪）；进 prism LaTeX 则出 TikZ，**编译复用 prism `prism_tex`（network_none）沙箱**。轻量场景复用 mermaid（12 型已就绪）。
- **分子/化学结构 → RDKit 确定性工具**（SMILES→SVG），零幻觉。
- **图像生成模型直出**：默认**不启用**。仅作「灵感草图/风格参考」副路径，产物明确标注「非最终交付」。**若启用，须同时上图像/零 token 计费补丁（§七 风险 2）。**

**5.3 可编辑中间表示 = 场景图 JSON（仿 prism struct）。** 不做重前端 canvas 直接操纵。借鉴 prism 成功范式：**真源是结构化 JSON（场景图：节点/边/文本/样式/布局），渲染层可逆**。agent 产出/修改场景图 JSON，前端渲染成 SVG 并提供「**双击元素→属性对话框→改文本/颜色/位置→写回 JSON**」的**轻编辑**——正是 `MathEditorDialog`（KaTeX 渲染 + MathLive 编辑 + `updateAttributes` round-trip）已验证的形状。prism 现有 `Figure` 原子节点（当前只渲染占位框）是最直接扩展点。**v1 零新前端依赖，避开净新增 excalidraw/tldraw。**

**5.4 校验器（双层，照搬路线 6 铁律）。** 第一层**确定性执行器在前**：代码在 bwrap 沙箱跑（TikZ 走 prism_tex），捕获 traceback，repair agent 修到能跑。第二层**才**调 VLM critic：批评前渲成干净高 DPI PNG；强制结构化 grounded 批评（元素→期望 vs 观测→不确定标志）；限迭代 ~3 + 保留 last-good + 仅当可度量指标改善才接受；critic 能说「看不清/不确定」。评测不能只看「能跑」，须加语义忠实 + 无障碍（色盲安全）检查。

**5.5 交付。** 产物写 `./out/`（可配 `out/manifest.json` 给 title/description），自动收割到 MinIO（`feature_key="sci_draw"`），经 `GET /claw/artifact/:id`（或自挂同构路由）交付。SVG/PNG/PDF 内联，PPTX 下载。`ExportDocument` 工具已能经 pandoc 出 pptx/pdf/docx，可复用。**须新建一件**：session-bound 的 SVG→PNG 光栅化原语（把 `out/` 里 SVG 渲成 PNG，供交付**且供视觉自校验回灌**）——把 `render/math.ts` 的 resvg 从「返 base64」改成「落文件进 `out/` + 可回注视觉块」。

---

## 六、分期路线图 P0→P3

**P0 · 数据图 MVP（代码执行 + 单层校验）**
- **前置任务（硬阻断）：** ①在 `scholar_agent` 镜像**构建期**预置 Python + matplotlib + numpy + pandas（仿 boltslides 的「构建期烧入」先例），在**断网 bwrap 沙箱内实测**能渲 PNG/SVG/PDF；②确认生产 MinIO 已开启（绘图交付实质依赖它，见风险 7）；③**定会话归属模型**（user-level 多会话 / 单会话 / entity-owned），据此决定是否需要镜像 0070 的迁移。
- 范围：自然语言/上传数据 → matplotlib/plotly 代码 → 渲染 PNG/SVG/PDF 落 `out/` → 交付。仅执行器修复，暂不上 VLM critic。
- 复用：agentbridge 全套、claw 交付、`ClawArtifactPreview` 分派、计费三层（**纯代码执行走正常文本 token，自动生效**）、`AllowBash` 沙箱。
- 新建：`scidraw` spec/handler/prompt、绘图 skill 目录、modelcatalog 绑定迁移（+ 视归属模型可能的多会话迁移）。
- 验收（**本地语料，不借外部 benchmark 绝对数字**）：本地评测集 N≥30（覆盖散点/折线/柱/箱线/误差棒/热图 + 3–5 条脏数据/缺失值）；指标：①**执行成功率**（渲染无 traceback）首版门槛建议 ≥90%（run-error ≤10%），后续收紧；②配额正确扣减且 `llm_token_usage` 账本可见（逐条抽验）；③前端预览无误（svg/png/pdf 内联、pptx 下载）。

**P1 · 视觉自校验闭环（render→VLM→fix）**
- 范围：加第二层 VLM critic；新建 SVG→PNG 光栅化 + 生成图回灌视觉块。
- 复用：`@resvg/resvg-wasm`、attachments 视觉通道机制。
- 新建：session-bound 光栅化原语、`out/` 图→视觉块注入、结构化批评提示、迭代上限（~3）+ last-good + 指标闸门。
- 验收：先定义**语义忠实评分口径**（轴标签/图例/数据点数量 vs 输入规格的逐项一致率，规则或人工，0–1）与**无障碍检查**（CVD 色盲模拟、最小字号/对比度）；判定：P1 相对 P0 在同一语料上忠实率**统计可测提升**（定义 N/指标/阈值），且**无「越改越差」回归**（迭代后不低于 last-good）。

**P2 · 流程/方法图 + 可编辑场景图**
- 范围：SVG/TikZ 路线；场景图 JSON 中间表示 + 前端**属性对话框轻编辑**（非拖拽式）。
- 复用：prism Tiptap 原子节点 + MathEditorDialog round-trip、`Figure` 扩展点、DOMPurify SVG、`ZoomableSvg`；**TikZ 编译复用 prism_tex（network_none）沙箱**。
- 新建：场景图 schema、SVG 渲染层、双击属性编辑对话框、写回 JSON。
- 验收：生成流程图 → 双击改文本/颜色/位置 → round-trip 无损 → 重渲一致；TikZ 图经 prism_tex 编译通过。

**P3 · 专门领域 + prism 深整合 + 图像子路径 + 实时交付（按需）**
- 范围：RDKit 分子图；绘图产物一键插入 prism LaTeX（TikZ，复用其编译沙箱）；可选启用图像生成模型副路径（须同时上**图像/零 token 计费补丁**）；out-of-band `artifact` WS 帧（执行器每轮 diff `./out/` → 实时卡片，消除 on-list 轮询隐身窗口，`docs/research/artifact-delivery-2026-07/DESIGN.md` 已有设计）。
- 验收：分子结构零幻觉；绘图直插 prism 编译通过；（若启用图像子路径）每次图像渲染均正确计费且账本可见；新图实时出卡。

---

## 七、风险与出版合规

1. **出版合规（已核实，可作产品文案依据，但须准确）。**
   - **Elsevier（已核实原文）**：**允许** AI 辅助创建流程图/决策树/时间线/概念示意/实验工作流图；数据可视化**仅当**输出「直接源自底层数据」且经「可复现的分析/计算/统计方法」时允许。**禁止** AI 创建或修改代表原始观测/实验数据的图（显微镜/组织学/western blot/放射扫描/患者影像）；亮度/对比度/色彩调整只能用「established image processing software」。**通用图像 AI 工具不得用于图形摘要**，应改用「专用科学插图工具（如 BioRender）」；封面图需事先获编辑与出版方许可。**披露**：单列声明 + **每张图 caption 内注明工具/版本/用法**。
   - **Nature Portfolio（已核实）**：**不允许**发表生成式 AI 图像；但**区分** AI 辅助数据可视化（一般允许，须披露）与 AI 生成概念插图（不允许）；非生成式 ML 增强/合并图须在 caption 披露以供个案审查。**注**：原综述「研究 AI 本身的文章除外」这一旧例外，本轮未确认现行措辞，**产品文案不要据此宣传**。
   - **对产品的含义**：本平台的**代码执行 + 场景图 + 矢量源码**路线，恰好落在两大出版社**允许**的一侧（数据驱动、可复现、人类可核可改）；而图像直出落在**被禁**的一侧。**定位应为「可编辑、人类可核」的科研图助手，而非「一键投稿终稿」**；UI 须显式提示合规责任、鼓励导出可编辑源码、内置披露文案模板。BioRender「licensing/可直接投稿」的说法**不成立，不要照搬**。

2. **图像模型的计费盲区（仅在启用图像子路径时必修，归 P3/专项，非 P0）。** 全套配额/账本按文本 token 线性；`llmusage.Record` 丢弃零 token 用量，`billing_weight` 乘 raw token 且封顶 100×——按张收费的图像渲染会**近乎免费且账本不可见**（真实收入泄漏面）。但**该盲区只在实际调用图像生成模型时才咬**；P0 纯 matplotlib/plotly 走正常文本 token，不受影响。修法二选一（与图像子路径同时上线）：执行器对每次图像渲染上报**合成 token**，或新建与 `AddUsage` 平行的按次/按张扣费路径。

3. **代码执行的爆量与隔离。** 「修失败的图」迭代会烧大量 token（参照 peerreview「改一文件→缓存 miss→全量重跑」与 claw 编译死循环旧案）；cache token 主导成本且计入 TotalTokens。防线只有 BudgetProvider 自节流 + 透支带。多租户隔离**后端权限门管不住 shell**，完全依赖 bwrap 沙箱——生产必须验证其生效（断网 + cwd jail）。背景/元调用（自动起名、planner）应走 `SkipQuota` 逃生口（仿 memory），记账本但不扣用户窗口。

4. **视觉批评者本身不可靠（设计原则，文献依据未核实）。** VLM 读退化图可能幻觉且过度自信，故 critic 绝不能独任裁判；必须执行器在前、干净高 DPI 后批评、优选独立 critic。支撑它的具体文献本轮未核实，不引具体分数。

5. **能跑 ≠ 对（设计原则，文献依据未核实）。** 执行成功仅必要非充分：压低 run-error 不等于消除数值幻觉与无障碍缺陷。评测须加语义忠实 + 无障碍维度（口径见 P1 验收）。

6. **多会话唯一索引陷阱（有条件触发）。** **仅当** `sci_draw` 采用 **user-level（owner NULL）+ 多会话**时，迁移 0034 anchor 唯一索引才会锁死单会话并被 schema-sync 幂等去重 DELETE 清行——届时须新迁移镜像 0070（`smart-search-multisession` 记忆里的原样坑）。选单会话或 entity-owned 则不需要。**先定会话归属模型再决定**。

7. **MinIO 依赖。** storage 关闭时的 live 回退只服务文本+光栅图、拒 SVG/PDF/PPTX——绘图 feature 实质**依赖生产 MinIO 开启**，须在 P0 前置任务中确认。

---

## 八、结论与取舍建议

- **做，且现在做的边际成本可控——但「250 行胶水」≠「数周上线」。** 桥接、交付、计费、前端渲染四块地基齐备，「桥接挂载」只约 250 行机械胶水；但**容器侧绘图运行时预置 + 断网沙箱验证是独立且不可省的 P0 前置工程**（已由 `agent/Dockerfile` 确认为真实缺口，非假设）。真正的价值工作集中在**执行运行时 + 自校验回灌 + 场景图可编辑表示**三件，均已定位到文件/行。
- **路线取舍明确：代码执行 / 矢量源码优先，图像生成直出靠后。** 这被 2026 已核实实证（ScImage、PaperBanana：图像直出忠实更低）与出版合规（Elsevier/Nature 均禁通用图像工具、允许数据驱动可视化）**双重逼出**。本平台恰好在这条路线上有 prism struct 可编辑范式 + prism_tex LaTeX 编译沙箱的独家优势。
- **最省力的 P0 = 数据图 + 代码执行 + 单层执行器校验**，完成容器运行时前置后即可上线，且立刻按正常文本 token 计费；P1 补视觉闭环、P2 补可编辑场景图，把差异化壁垒（领域知识 + 可编辑 + 内容忠实）逐层筑起。
- **一次性修补按路径归位，不一刀切钉 P0：** 多会话迁移**仅在选定 user-level 多会话时**于 P0 内解决；图像/零 token 计费补丁**仅在启用图像子路径时**（P3）解决。P0 本身只需常规文本 token 计费。
- **合规叙事必须诚实且只引已核实来源：** 定位「可编辑、人类可核」的科研图助手；对外援引出版政策时，用已核实的 Elsevier / Nature / BioRender 自警 / NIH 措辞，**不宣传「一键投稿终稿」**。这既是核查后的事实边界，也正好是本平台技术路线的天然卖点。

---

### 附：主要信源

- Elsevier 生成式 AI 期刊政策：https://www.elsevier.com/about/policies-and-standards/generative-ai-policies-for-journals
- Nature Portfolio AI 编辑政策：https://www.nature.com/nature-portfolio/editorial-policies/ai
- ScImage：https://arxiv.org/abs/2412.02368 · ChemCrow：https://www.nature.com/articles/s42256-024-00832-8 · RDKit MolDraw2DSVG：https://www.rdkit.org/docs/source/rdkit.Chem.Draw.rdMolDraw2D.html
- PaperBanana：https://github.com/dwzhu-pku/PaperBanana （arXiv 2601.23265）· AutomaTikZ 2310.00367 · DeTikZify 2405.15306 · StarVector 2312.11556 · MatPlotAgent 2402.11453 · PlotGen 2502.00988
- 前沿图像模型：Google DeepMind Gemini Image「Nano Banana」https://deepmind.google/models/gemini-image/
- 代码勘察真源：`agent/Dockerfile`（容器运行时）、`backend/internal/{agentbridge,claw,prism,vip}`、`frontend-user/src/features/prism`
