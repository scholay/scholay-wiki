# 可编辑 PPTX 导出 · 技术调研与设计报告

日期:2026-07-21 · 面向:boltslides「制作PPT」(bolt-slides-template + agent/src/render/deckpptx.ts)
方法:17-agent 调研工作流(8 技术簇市面/开源调研 + 2 架构盘点 + 6 条对抗验证 + 综合设计)+ 人工独立核实承重事实(OMML/MathML、pandoc pptx)
原始产出:`/private/tmp/.../tasks/wmmnpnvxb.output`(survey 139k+ 字全文)

---

## 0. 一句话结论

**走「语义组件映射生成」为主脊 + 少数花哨组件回退截图的混合方案(方案 D),用 pptxgenjs 直写原生 OOXML 对象;导出中间模型由 React 组件的 props 直接物化(不做 DOM 几何反推)。P0/P1 零镜像新增依赖,完全复用现有 chromium + pptxgenjs 管线。母版一键换肤、公式 OMML 可编辑列为 P2 增强。**

之所以我们能做别人(Gamma/Slidev/Marp 都只能截图或甩 LibreOffice)做不到的原生可编辑,是我们独有的两个结构性优势:

1. **组件集封闭** —— 就 App.tsx 装配的 ~31 个 React 组件,不是开放 DOM;
2. **props 本身就是导出中间模型** —— `<Table columns rows/>` / `<BarChart data/>` / `<Contrast left right/>`,视觉是 props 的纯函数。

这把「HTML→pptx」从"考古式像素逆向"降维成"给每个已知组件写一个 emit 函数"。

---

## 1. 根本张力:为什么"完美可编辑"不可达

可编辑 pptx 的本质是**保真度 vs 可编辑性的取舍**——pandoc 官方文档自己都点破了这点("pixel-perfect but not editable" vs "editable but less reproducible")。五个降级点无法被任何库消掉:

| 硬约束 | 本质 | 谁都解决不了的部分 |
|---|---|---|
| **语义降级** | 富组件(Globe/Dashboard)在 pptx 无原语等价物 | 命令式 canvas / 复合自绘只能落图片。**连 Gamma 都对复杂页拍平成整图** —— 是数据模型不兼容(web 流式↔pptx 固定画布定位对象),非能力问题 |
| **文本 autofit** | pptx 的 `normAutofit fontScale` 是 PowerPoint **渲染期**重算的快照值,pptxgenjs/python-pptx 都无排版度量引擎 | "HTML 里刚好放下"的文字塞进固定框会溢出。**头号保真坑** |
| **公式 OMML** | PowerPoint 原生方程用 OMML,**不吃 W3C MathML**(我们 KaTeX 出的是 MathML) | 要原生可编辑公式必须 MathML→OMML;否则退化图片 |
| **SVG** | 插入 pptx 默认是**图片对象**,不是原生形状树 | "转换为形状"是手动 + 仅 M365 且版本漂移;无成熟自动 SVG→DrawingML。手绘 SciCharts SVG 文字不可编辑 |
| **字体/CJK** | 不内嵌字体则接收端缺字 → 行距/换行全变 | 只能指定 Office 常见 CJK 字族并接受轻微替换,或子集化(加依赖) |

**定位**:目标不是"像素级全可编辑"(Gamma 都放弃的无底洞),而是 **"~15 个高频正文组件干净可编辑 + 套母版 + 少数花哨页回退图片"** 的混合,与业界实际工程选择一致。产品上要诚实承认"少数文本密集页/花哨页需微调或是图"。

---

## 2. 市面/开源方案对抗验证结论(6 条,全部网络核实)

| # | 结论 | 判定 |
|---|---|---|
| 1 | **Slidev** `export --format pptx` 是**每页截图**的图片版(官方原文 "all the slides will be exported as images, text will not be selectable")。所有 HTML-slide 框架的 pptx 导出都是图片版。 | CONFIRMED |
| 2 | **pandoc** pptx writer 产**原生可编辑**文本框/表格/图片,但受限于 **reference-doc 模板 + 7 个固定版式**(Title Slide/Title and Content/Section Header/Two Content/Comparison/Content with Caption/Blank),**表达不了任意自定义 React 版式**(连居中都没有,自建 layout 常导致文件损坏)。 | CONFIRMED |
| 3 | PowerPoint 方程用 **OMML**,不吃 MathML;要原生可编辑公式须 MathML→OMML(微软 MML2OMML.XSL,但有再分发许可风险 + 容器无 Office;开源替代 **mathml2omml** 纯 JS 可绕开)。 | CONFIRMED |
| 4 | SVG 插入 PowerPoint 默认是**图片**(可手动转形状,GUI 按钮随版本漂移);但 DrawingML 的 `a:custGeom`(cubicBezTo/arcTo)**格式层面能表达任意路径**——瓶颈是没有成熟的自动 SVG→DrawingML 库,不是格式不支持。 | PARTIAL(后半句修正) |
| 5 | pptxgenjs/python-pptx **都不预算 fontScale**——写了 `normAutofit` 标志但真正缩放靠 PowerPoint 打开时重算,不重排的查看器会溢出。缓解:**我们自己在 chromium 里度量**,把测好的字号写死 + `noAutofit`。 | PARTIAL(工程内核成立) |
| 6 | **LibreOffice headless 无 HTML→可编辑 pptx 路径** —— HTML 走 Writer 文本滤镜(根本不进 Impress 版式路径),得到一坨无版式文本 pptx。 | CONFIRMED |

**推论**:没有任何现成"转换器"能把我们的 HTML deck 变成可编辑 pptx;唯一可行的是**我们自己按组件语义生成**。

---

## 3. 候选方案对比(打分 1-5,越高越好;工作量/风险已归一为高=对我们越有利)

| 方案 | 可编辑性 | 保真度 | 覆盖率 | 工作量 | 风险 | 依赖增量 | 综合 |
|---|---|---|---|---|---|---|---|
| **A 语义组件映射(props→pptxgenjs)** | ★★★★★ | ★★★☆ | ★★★(白名单) | ★★★☆ | ★★★★ | **0** | **首选** |
| **B DOM 几何提取→pptxgenjs** | ★★(可选中改不动) | ★★★★★ | ★★★★ | ★★ | ★★ | 0 | 仅作回退定位 |
| **C 转换器(LibreOffice/Aspose/云)** | ★–★★★ | ★–★★★ | ★★ | 各异 | ★ | +400MB | 否决 |
| **D 混合(A 主 + B 定位 + 图片兜底)** | ★★★★★ | ★★★★ | ★★★★ | ★★★ | ★★★★ | 0 | **实际落地形态** |

- **B(DOM 几何反推)作主脊是负 ROI**:props 已是干净语义,反推等于把组件先渲成一堆 `<rect>/<path>` 再猜回来——图表碎成上百图元,Contrast 的左否右肯、Table 的 highlightCol、Comparison 的布尔语义全丢。且 Slide.tsx 明确"content REFLOWS, no fixed canvas" + framer 动画污染 getBoundingClientRect。**B 唯一价值 = 给必须截图的组件读一个 bounding box 定位。**
- **C 全灭**:LibreOffice 走 Writer 文本滤镜;Marp `--pptx-editable` 官方自认实验/低保真;Aspose HTML 导入是 text-only 还贵($1,399 起);云 API 隐私冲突 + 底层还是 LibreOffice。
- **python-pptx 不选**:半停滞(2024-08 后无新版)、跨语言依赖、吃不了 SVG、`.text=` 塌样式;唯二优势(母版复用 + XML 逃生舱)可用 Node 生态的 pptx-automizer/JSZip 平替。Anthropic 官方 pptx skill 也是选 pptxgenjs 并显式劝退 python-pptx。

---

## 4. 推荐方案与边界

**主路径**:props → 导出中间模型(JSON)→ pptxgenjs 原生对象。每个组件写一个 `emitPptx(model, theme)` + capability tag(`native-text | native-table | native-chart | image`);缺 emitter 的组件自动降级截图(安全网)。

**原生可编辑白名单(几乎零损失)**:Cover · Section · BigNumber · Quote · Agenda · StatGrid · Steps · Contrast · Team · Pricing · Chat · Marquee · References · Cite · Bento · Timeline · Table · Comparison · Charts.{Bar,Line,Donut} · SciCharts.{Scatter,LineXY}

**灰色(拍平后原生)**:TiltCard(丢 3D) · SpotlightCard/BrowserFrame/Figure(容器透传) · Tabs(拍平到 active) · Accordion(全展开) · ErrorBarChart(高要求则回退图片)

**必须图片回退**:Globe(Canvas2D 地球) · VisualDashboard(自绘复合仪表盘) · Math/MathBlock(MathML,P0 截图) · CodeWindow(语法高亮 gutter)

**引擎侧白捡**:`notes` → pptx 演讲者备注(零成本);`<Build>/<Reveal>` → 导出即全展开(现成 clicks:9999 + isStatic)。

---

## 5. 落地设计要点

**数据流(复用现有管线,只换中段"截图→读模型+摆 shape")**:BuildDeck 出单文件 HTML → POST export-pptx `{format:"pptx-native"}`(执行器进程内,confinePath 复用)→ `readDeckTotal` dump-dom 取页数 → 逐张 dump-dom `?export=1#n`(页面在 export 分支跑"导出采集器":等 `fonts.ready`+双 rAF → 遍历组件注册表 emit 结构化模型 → 序列化进 `<script id="__deck_export">`)→ 解析 JSON → pptxgenjs 按 role emit → 图片组件走 CDP `captureScreenshot{clip:box}` 局部截 → 后处理闸 → 落 out/ → MinIO 收割。**走组件注册表遍历,不遍历 DOM。**

**引擎**:pptxgenjs(同 bun/node 进程内直调,原生 addText 富 run/addTable/addChart 内嵌 xlsx/addShape gradient+shadow+roundRect/defineSlideMaster/addNotes 全覆盖白名单;能直接 addImage SVG)。**务必 pin `pptxgenjs@^4.0.1`**(table auto-paging repair、combo repair、defineSlideMaster config-reuse 都在 4.0.x 才修)。

**单位(集中一处)**:EMU = px×914400/96;sz = pt×100 = px×75(百分点,非 EMU!);rot = deg×60000;alpha = pct×1000。Slide = 16:9 `12192000×6858000` EMU。**混淆单位 = "字微小/形巨大/乱转"经典 bug。**

**公式 OMML**:P0 截 MathML 为 SVG/PNG → addImage(不可编辑但保真零风险);P2 用 `mathml2omml`(纯 JS,不出 Node)转 OMML → JSZip 把 txBody 换成 `mc:AlternateContent`(Choice 放 `m:oMath` + Fallback 放 PNG)。**坑**:KaTeX MathML 外包 `<semantics>/<annotation>`,须先剥 annotation 取 presentation 子树,逐式(分式/根号/矩阵/求和/希腊)集测。

**母版/主题**:P0 `defineSlideMaster` 从 tokens.css 派生(srgbClr 绝对色,不换肤);P2 预制 `.potx`(token→theme clrScheme accent1-6 + fontScheme 含 `ea` 东亚字段)+ **pptx-automizer**(Node-only)导入母版克隆版式,形状色引 `schemeClr` → PowerPoint 一键换主题变色(借 pandoc reference-doc 思想但不落 pandoc 实现)。

**autofit/字体(头号坑缓解)**:chromium 当度量引擎——采集器量 `getBoundingClientRect` + 实际字号,**把测好的字号写死 sz + bodyPr `noAutofit`**(所见即所得),再叠保守 `normAutofit` 兜底;文本框宽度留 5-8% 余量吸收 CJK 换行差。字体 emit Office 常见 CJK 字族(微软雅黑/苹方/思源黑),**用同一字族度量**;P0 不内嵌。

**保证 PowerPoint 打开不报"需要修复"**(导出前必挂后处理闸,JSZip 二次加工):删幻影 Content_Types Override(#1449:55 页写 55 条 master override 但只 1 个 master)、校验每个 rId 可解析、cNvPr id 唯一非零、relationship Type 用字面 `http://schemas...`(非 https)、prstGeom 只用合法枚举(`roundRect` 非 `roundedRectangle`)、图片路径小写(#860)。**铁律:绝不用"soffice 能打开"当验收**(#1449 全部错误 LibreOffice 能开、只 PowerPoint 报错)。

**镜像依赖增量**:P0/P1 = **0**(chromium+pptxgenjs 已在);P2 公式 = `mathml2omml`(npm 纯 JS);P2 母版 = `pptx-automizer`(npm Node-only)+ `.potx` 资产。**不引入** LibreOffice/python-pptx/pandoc/微软 XSL。**导出跑执行器进程内非 jail**(同 BuildDeck,访问 node_modules symlink),安全靠 confinePath + chromium 封外联。

---

## 6. 分期

**P0 — MVP(零镜像增量,证明"可编辑"价值)**:白名单组件加 `data-export-role`/`data-export-model` 注解 + `deck/exportModel.ts` 采集器;`deckpptx.ts` 加 `exportDeckToEditablePptx()`;端点加 `format:"pptx-native"`;`defineSlideMaster` 从 token 派生(不换肤);**不在白名单的组件整页回退截图**(复用现有链路);后处理闸 + chromium 度量字号写死。
- 验收:标题/要点/表格/图注/普通图表在 PowerPoint 文字可改、形状可挪、图表可 Edit Data;花哨页是整图;**Win+Mac PowerPoint 打开均不报修复**;python-pptx round-trip 通过。

**P1 — 单组件回退 + 稳健**:CDP `captureScreenshot{clip:box}` 单组件截图(标题可编辑 + Globe 局部图,而非整页退图);Bento 从栅格算几何、Tabs/Accordion 拍平原生化;ErrorBarChart 的 `c:errBars` JSZip 注入;采集器升级 CDP `Runtime.evaluate`;字体子集化(可选)。

**P2 — 母版换肤 + 公式可编辑**:pptx-automizer + `.potx` 一键换主题色;`mathml2omml` → `mc:AlternateContent` 原生可编辑公式(PNG fallback);视觉回归自审 → 超阈值页自动降级整图(现有 image-pptx 自然成为 native 版的 per-slide fallback,两条路线合并而非替换)。

---

## 7. 风险册 + 必踩坑(站在巨人肩膀上防坑)

| 风险/坑 | 等级 | 缓解 |
|---|---|---|
| 文本 autofit 溢出(头号) | 高 | chromium 度量 → 写死 sz + noAutofit + 宽度余量 |
| pptxgenjs options 就地 mutate,复用引用静默污染下一次调用 | 高 | codegen 每次 fresh new object,永不复用字面量引用 |
| 只在 LibreOffice 验 = 假绿灯(#1449) | 高 | 真 PowerPoint(Win+Mac)+ WPS + Keynote 四端验收 |
| 幻影 Content_Types / 断裂 rId / 重复 cNvPr id | 高 | §5 后处理闸 |
| 单位混淆(sz 百分点/rot 六万分度/w EMU) | 中 | 集中 units 折算层 |
| combo+secondary axis / table auto-paging repair | 中 | 避 combo;单表关 autoPage;pin ≥4.0.1 |
| 单序列 chartColors[] 误渲(#285) | 中 | 单序列给恰好一个色 |
| KaTeX MathML 带 semantics/annotation 塞 mathml2omml 失败 | 中 | 先剥 annotation 取 presentation 子树,逐式集测 |
| c:errBars numCache 点数与主 series 错位→静默丢棒 | 中 | ptCount/idx 严格对齐,误差值进内嵌 xlsx |
| CJK 接收端字体替换致换行漂 | 中 | Office 常见字族 + 同族度量 + 宽度余量;P2 子集嵌入 |

---

## 8. 验证策略(自动化确保"真可编辑")

三层闸,P0 起强制前两层:
1. **结构自检(Node 进程内,P0 必挂)**:JSZip 打开产物 → 校验 Content_Types Override 对应 part 存在、rId 可解析、cNvPr id 唯一非零、无 https relationship Type、prstGeom 枚举合法。不过 fail 不发货。
2. **python-pptx round-trip(轻,P0 CI)**:`Presentation("out.pptx")` 能开能 `.save()` = 包自洽;再断言关键可编辑性(标题是 text_frame 非 picture、表格是 graphic_frame.table、图表是 chart part 有内嵌 xlsx、白名单页不含整页大图)。仅 CI 用,不进运行时镜像。
3. **视觉回归(P2)**:chromium 再渲 pptx 与原 HTML 并排 diff,超阈值页自动降级整图。

**铁律**:"LibreOffice 能打开"永远不是验收标准;Open XML SDK 判 valid 也 ≠ PowerPoint 满意(只查 schema);唯一权威 = 真 PowerPoint Win+Mac + round-trip 断言。

---

## 附:关键复用清单(现成、零改)

`runChromium` 壳 · `readDeckTotal`(dump-dom + data-deck-total)· `?export=1#n` 导航契约(隐 chrome + 展开 Build + 关动画)· 3× 重试 · `confinePath` 双向路径闸 · 文件名消毒 · POST export-pptx 端点骨架(加 format 分支)· handler.go MinIO 回灌 · `httpClientLong` 长超时 · **pptxgenjs(已在 dep,原生能力被现管线闲置)** · 执行器进程内执行模型。**唯一要换的是中段:整页截图 → 读导出模型 + 摆原生 shape。**

相关文件:引擎 `agent/bolt-slides-template/src/deck/{Deck,Slide,Build,Reveal,DeckContext}.tsx`;组件 `agent/bolt-slides-template/src/components/*.tsx`;导出管线 `agent/src/render/deckpptx.ts` + `agent/src/server/http.ts`。
