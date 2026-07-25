# 「制作PPT (boltslides)」与「科研绘图 (sci_draw)」全方位审查报告

日期:2026-07-21 · 方法:97-agent 审查工作流(6 精读 → 14 维度批判 → 逐条对抗验证 → 综合)+ 人工独立复现关键项
覆盖:agent 能力层(prompt/skill/工具闸门)· 后端集成 · 前端 UX · 科研场景适配 · 运行时沙箱实测
结果:75 条发现,74 条对抗验证成立(1 条被推翻)。boltslides 38 条、sci_draw 40 条(含 `both`)。

---

## 0. 一句话结论

- **科研绘图 sci_draw 有一个生产级 P0:三条车道里有两条是死的。** B 车道(matplotlib 统计图)+ C 车道(rdkit 分子图)在真实 bwrap 沙箱内 `import numpy` 直接崩(`libblas.so.3` 悬空软链),线上真正能出图的只有 A 车道。**修复是一行**:`bwrap.ts` 加 `--ro-bind-try /etc/alternatives /etc/alternatives`。这个缺陷一直没被发现,因为所有验证都用裸 `docker exec` 跑,绕过了沙箱语义。
- **sci_draw 还背着一套从"可编辑画布"pivot 到"只读静态图"后没清理的死代码 + 三方冲突的格式契约**,system prompt 甚至在教一个会导致渲染失败的过时格式。
- **制作PPT boltslides 本质是打磨得不错的硅谷路演生成器,披着学术平台外衣**:零数学公式、图表是单序列玩具图、无引用/参考文献/图注版式、导出是不可编辑的整页截图。好消息是绝大多数科研化改造都能在构建期低成本烧入(只有导出侧封网,`npm ci` 联网),不破坏单文件契约。

---

## 1. 科研绘图 sci_draw

### 1.1 【P0】B/C 车道在生产沙箱内全部产不出图(已人工复现)

**现象**:裸 `docker exec scholar_agent python3 -c "import numpy"` 一切正常(numpy 2.2.4、matplotlib savefig、rdkit MolDraw2DSVG 都 OK);但 charts/molecules skill 实际是用 Bash 跑 python3,而 Bash 经 `wrapBash` 强制进 bwrap jail —— jail 内 `import numpy` 抛 `ImportError: libblas.so.3: cannot open shared object file`。numpy 崩 → matplotlib 和 rdkit(都依赖 numpy)全崩。

**根因**(人工复现坐实):
- `/usr/lib/aarch64-linux-gnu/libblas.so.3` 是软链,经 `/etc/alternatives/libblas.so.3-aarch64-linux-gnu` 中转,最终指向 `/usr/lib/.../blas/libblas.so.3`(update-alternatives 机制)。
- `agent/src/sandbox/bwrap.ts:82-87` 的 `buildBwrapArgv` 只 ro-bind 了 `/usr /bin /lib /lib64 /etc/ssl /etc/resolv.conf`,**没有 `/etc/alternatives`** → jail 内中转软链悬空 → 整条链断。
- `bwrap.ts:36` 的启动自探 `probeBwrap` 用 `--ro-bind / /`(整根)+ `/bin/true`,能过,但它不碰 python 渲染,结构上无法捕捉"某依赖没被 bind 进 jail"。
- Dockerfile:40-44 的作者注释**明确声称**装了 `libblas3/liblapack3` 来解决 numpy 依赖 —— 依赖装了,但沙箱 bind 集漏了中转目录,所以"装了却用不了"。

**人工复现证据**(本机 scholar_agent, aarch64):
```
# jail 内(生产 bind 集,无 /etc/alternatives):软链跟随失败
readlink libblas.so.3 → /etc/alternatives/libblas.so.3-aarch64-linux-gnu
ls -lL libblas.so.3   → No such file or directory   # 悬空
python3 -c "import numpy" → ImportError(崩)

# 补 --ro-bind-try /etc/alternatives 后:
ls -lL libblas.so.3   → -rw-r--r-- 395120 .../blas/libblas.so.3   # 解析成功
python3 -c "import numpy" → numpy OK 2.2.4   # 修复
```

**修复**(P0-1,一行):`bwrap.ts` ro-bind 段加 `--ro-bind-try /etc/alternatives /etc/alternatives`。所有 update-alternatives 管理的库(未来 pandoc/weasyprint/字体同理)一并受益。

**连带**:
- **P0-2**(修完 P0-1 立刻显形):matplotlib 认不出 skill 首选字体名 `Noto Sans CJK SC`。实测 `fontManager.ttflist` 里 CJK 只注册了 `Noto Sans CJK JP`(.ttc collection 只登默认 face),用 `SC` 名会 findfont 失败 → 中文标签渲染成豆腐块。改 `charts/SKILL.md:25` 首选字体为 `Noto Sans CJK JP`(含简体 Han 字形,实测正常出中文)。
- **P0-3**:缺"真实 jail 内出图"冒烟测试。加镜像构建后 smoke gate:用 `buildBwrapArgv` 造真实 jail 跑最小 matplotlib savefig + rdkit MolDraw2DSVG,断言产出非空,与 `VIPCheckerWired` 同级 fail-fast。**否则这类"装了依赖但 jail 没 bind"的坑还会重来。**

### 1.2 【P1】A 车道格式契约三方冲突 + 一整条死代码链

sci_draw 的 A 车道经历了一次**未完成的迁移**:从"React Flow 可编辑 scene-graph(`{nodes, box/ellipse, 坐标}`)"pivot 到"compartment 配方静态 SVG(`{compartments, entities, edges}`)",但迁移只做了一半,留下三处互相打架:

| 位置 | 教/认哪种格式 | 状态 |
|---|---|---|
| `figures/SKILL.md` | `{compartments, entities, edges}` 配方,无坐标 | ✅ 正确(与线上渲染器一致) |
| `sci_draw.go:38`(prompt 工作流 step2) | `{nodes: box/ellipse/label/icon + 布局坐标}` 旧场景图 | ❌ 过时,与 skill 直接矛盾 |
| 前端实际渲染 `ClawArtifactPreview.tsx:221-226` | `parseFigureSpec`(要 `entities`)→ `FigureView` 静态 SVG | ✅ 线上真相 |
| 后端 `figure.go SaveFigure` | 校验含 `nodes` 数组的 JSON | ❌ 与线上产物(`entities`)正相反,且不可达 |

- **活跃故障诱因**:agent 若照 prompt step2 写 `{nodes,坐标}`,`parseFigureSpec` 返回 null → 前端"配方数据解析失败"。目前全靠 `figures/SKILL.md`(--add-dir 注入)压过 prompt 才不翻车 —— 弱模型下脆弱。**修复(C-1)是一行**:把 `sci_draw.go:38` 的 step2 重写为配方措辞(列隔室→实体进隔室 iconKey 优先→连 edges,无坐标不写 SVG)。这是全仓最高 ROI 的单点修改。
- **死代码链**(C-2):编辑功能已撤(`FigureView.tsx` 是只读静态 SVG,不接 `onSave`),但 `onSaveFigure`→`saveFigureDoc`→`POST /sci_draw/figure/save`→`SaveFigure` handler + `user_edited` 防覆盖机制,加上 `FigureCanvas.tsx`(464 行)/`types.ts`/`layout.ts`/`parseFigureDoc` 全部成孤儿 —— 永不被调用。决断:承认已 pivot 到只读,**删掉整条链**。
- **虚假承诺**(C-3):TemplateCards/空态 hero 文案仍写"可编辑矢量图",实际只读。改"生成可下载的原创矢量图(SVG/PNG)"。
- **死胡同**(C-4):配方解析失败落"请下载查看"却传 `downloadUrl={null}`(无按钮)。传入产物 URL + "可下载原始配方或让 AI 重画"。
- **header"下载"给的是 .fig.json 配方**(C-5):研究者点下载拿到一坨 JSON 天书而非图。改下拉「下载 SVG/PNG/配方」,把 FigureView 的 SVG/PNG 导出提升为主入口。
- **图标幻觉**(C-6):`iconKey` 写了表外/幻觉 key → `compose.ts:47` 渲成裸标签(无框 + 58px 空隙),比纯 label 彩框回退还难看。getIcon 失败时回退 label 彩框分支;膜隔室无效 key 兜回 `membrane_receptor`。
- **越权取产物**(C-7,风险低):按 id 取产物端点不校验 FeatureKey,sci_draw 路由能取到本人 boltslides 产物。GetByID 后加 `row.FeatureKey==FeatureKey` 校验,越权回 404。

### 1.3 【P1】A 车道渲染器质量卡在 Tier-1 扁平示意层

`compose.ts` 能确定性产出"隔室色带 + 方框/图标 + 箭头"的结构图,金标线性通路尚可看,但离"论文可投稿"还差一整套排版规范:

- **A-1 边全是直线,不走 elk 路由**:`subLayout` 算好了 elk 走线却只取节点坐标、丢弃 `res.edges[].sections`,边一律 `M...L...` 直线。真实通路只要有分支/反馈/crosstalk,箭头就横穿实体框。改:读 sections 渲折线/圆角折线;跨隔室边纳入顶层 elk 或正交绕行。(M)
- **A-2 缺 legend/比例尺/图注编号**:三种箭头语义(activate 实线 / inhibit T 形 / transport 虚线)在图上无任何解释,连 Tier-1 排版规范都不完整。compose.ts 尾部渲染确定性 legend 区块。(M)
- **A-3 膜受体 gap=150 硬编码**:`composeFigure:118` 膜实体等距摆放,≥7 个溢出画布被裁切(≥6 破坏内边距)。间距改自适应或换行。(S)
- **A-4 核椭圆包矩形**:elk 矩形布局塞进椭圆背景,角落/极值实体落在椭圆轮廓外;标签无换行、190px 截断,长基因/蛋白名水平溢出。内容约束进椭圆内接矩形;label 多行换行。(M)

图标库规模:核心手绘 40 + bioicons 71 ≈ **111 个**。对覆盖分子生物/信号通路/免疫/神经的论文级配图偏薄(BioRender 数千级)。

**A 车道判断:继续打磨到 Tier-2,不推倒。** 它是当前唯一活着且合规的车道(浏览器渲染、确定性、零幻觉、可内联单文件),正是 Nature/Elsevier 放行、图像生成禁止的路线。质量缺口全是"排版规范未做完",不是路线错。天花板认清:hand-SVG 够不着 Tier-3 肌理写实,打磨终点是 Tier-2 抛光扁平,靠扩素材库装配(见 R2),而非让 compose.ts 卷质感。

### 1.4 【P1】B/C 车道 skill 缺口(修完 P0 才有意义)

- **B-1** 无金标示例脚本,KM/森林/ROC 全靠 skill 散文重构、每次现搓质量不稳。补 `charts/examples/{km_survival,forest_meta,roc}.py`。(M)
- **B-2** KM 要求用户预先算好生存概率、禁模型自算,但镜像无 lifelines/scipy → 患者级 (time,event) 原始数据画不出。SKILL 补授权:可用 numpy 从原始两列自算 KM 乘积极限 + Greenwood CI(与 ROC 自算对齐);log-rank p 因无 scipy 注明需用户提供。(S)
- **B-3** "不做统计推断"铁律过宽,又与"可用 numpy 算 ROC/AUC"自相矛盾,边界模糊。精确化:可做确定性图形计算(计数/比例/均值-SEM/KM 估计/ROC-AUC/归一化);不可做假设检验 p 值/显著性判定。(S)
- **B-4** 缺科研高频图型:火山图/富集气泡(GO·KEGG)/显著性星标/双 Y 轴(matplotlib 能做但只字未提);PCA/聚类热图/树状图需 scipy/sklearn 画不了。matplotlib 可做的补进 skill;需 scipy 的镜像补层或明确声明不支持。(M)
- **C1-1** 名称→SMILES 缺失(断网查不了),研究者被迫跳出平台。构建期烧入 **OPSIN**(离线确定性 IUPAC 名→SMILES,零幻觉,契合定位)+ 小型商品名/中文名字典。(M)
- **C1-2** `MolsToGridImage` 未带 `useSVG=True`,断网无 Pillow 会崩或产 PNG。(S)
- **C1-3** 蛋白/多肽/核酸/聚合物/晶体无边界护栏,易硬接产错图。skill + prompt 加明确边界:仅小分子 2D,大分子降级建议 PyMOL/Mol*。(S)

### 1.5 【P2】导出与体验

- E-1 三车道导出不统一:A 有 SVG+PNG,B/C(matplotlib/rdkit 直出的 svg)只能拿原始 SVG,无 PNG、无 view 内导出。导出能力提升到产物预览层统一。(M)
- E-2 缺投稿刚需:无 PDF/EPS 矢量,PNG 固定 2x 不可选 DPI。加 DPI 选项(150/300/600)+ 导出 PDF。(M)
- E-3 每产新图强制抢占右栏 + 渲染失败无"让 AI 重画"出口。(M)
- E-4 收割 upsert-only 无对账,迭代作图堆积旧图,`DeleteStaleBySession` 是死代码。接线做对账(保护 user_edited 行)。(M)
- E-5 收割落 MinIO 无大小上限,大文件整块进后端内存。用已有 `e.Size` 卡 `maxArtifactBytes`。(S)
- E-6 matplotlib 每会话重建字体缓存(扫大体积 Noto CJK),冷启动秒级延迟。注入 `MPLCONFIGDIR` 指向预建只读缓存。(S)
- E-7 A 车道前端无能力边界提示,首触用户以为能出写实图。模板卡标注"生成论文级示意/机制图,非写实插画";含"写实/肌理/photorealistic"关键词即时给能力边界卡。(S-M)

### 1.6 质量天花板 · 路线选择

- **R2(建议优先,M-L)** A 车道扩授权素材库达 Tier-2(bioicons/Servier/NIH BioArt CC0/CC-BY)。署名基建 `collectAttributions` 已就位(当前种子全 CC0 故署名栏空),增量主要是灌素材 + 装配 prompt。不硬碰 BioRender 护城河,把观感从扁平方框拉到 Servier 级抛光扁平。
- **R1(中期评估,L)** 新增 headless 3D 分子/蛋白车道(PyMOL/Mol*/py3Dmol)。唯一程序化触达 Tier-3 写实 + 吃合规红利(渲染真实 PDB ≠ AI 生成)。基建与 matplotlib/rdkit 同构。承重约束:PDB 拉取必须在断网沙箱外(文件推入方案 B),沙箱内只本地渲染。**依赖 P0-1 先修**。
- **R3(明确不做)** 图像生成(Nano Banana 等):质感强但解剖幻觉 + 不可编辑 + Nature 全禁,与"确定性零幻觉可投稿"定位冲突。

---

## 2. 制作PPT boltslides

### 2.1 现状定性

本质是**打磨得不错的硅谷路演 deck 生成器,披着学术平台外衣**:主力版式(BigNumber 戏剧节拍/Contrast before-after/Pricing/Team/Globe)、九套主题、prompt 弧线全是 pitch 语汇(`bolt_slides.go:13` 自称学术助手,但整份 prompt+skill grep 无一处公式/引用/图注/方法-结果-结论引导)。对科研用户,能不能用取决于内容里有没有公式和真实数据——纯概念轻量讲稿勉强能用,一旦涉及方法推导/实验数据/规范引用,核心工作流是断的。

**关键架构红利**:只有导出侧 chromium 封网(`deckpptx.ts:30` `--host-resolver-rules=MAP * ~NOTFOUND`),构建期 `npm ci` 是联网的,产物是 `vite-plugin-singlefile` 单文件。所以 KaTeX、CJK 字体、图表组件、引用组件全能烧进构建产物、以 data URI 内联,**不违反单文件自包含契约** —— 绝大多数科研化改造是低成本的。

### 2.2 科研核心缺口(P1)

- **零数学公式(最硬缺口)**:`package.json` 依赖只有 framer-motion + react,无 KaTeX/MathJax。任何含 LaTeX 的理工/统计/ML 汇报退化成纯文本或手搓 SVG 符号。修:加 KaTeX(构建期可装)+ `<Math>/<MathBlock>` 组件 + woff2 字体 data URI 内联。**性价比最高的一改。**(M)
- **图表是单序列玩具图**:`Charts.tsx` BarChart 无 Y 轴刻度、LineChart 只吃一维 `points:number[]`(x 轴均匀索引,画不了非均匀采样/剂量-反应曲线)、无误差棒/多序列/图例/散点。修:LineChart 改吃 `{x,y}[]`,补 ScatterChart/误差棒/多序列/图例/轴刻度;需论文级统计图时引导改用 sci_draw B 车道。(M-L)
- **无引用/参考文献/图注版式**:文献综述/开题/journal club 的基本盘(正文挂 [1]、末页排文献、图带"图1. …")完全没有。修:`<Cite>`(行内上标自增编号)+ `<References>`(numeric/author-year/GB-T7714)+ `<Figure>`(编号 + 长图注槽)。纯组件+CSS,零依赖。(S)
- **学术弧线 + 学术主题预设**:SKILL 增"学术演示弧线"(背景→方法→结果→结论)替代 pitch 弧线;tokens.css 增 1-2 套"白底衬线高密度"学术预设(现九套偏营销)。纯文案+token,零代码风险。(S)
- **中文字体自托管**:`base.css:1` 从 Google Fonts `@import` 外链拉 Inter/JetBrains(纯拉丁),导出封网 → 中文靠容器系统字体回退不可控,且"下载后离线可用"对字体是假承诺。改自托管 woff2 data URI 内联(容器已装 fonts-noto-cjk)。(M)

### 2.3 信任窟窿与虚假承诺(P0/P1,低成本先清)

- **触发词误触**(P2,S):`SKILL.md:184` 隐藏触发词 `build demo p` 是常见 pitch 请求的连续子串,英文"build demo pitch deck"整串命中 → 用户拿到脚手架自带假公司/占位数据 demo,且规则禁止 agent 解释。改成不可能自然出现的唯一 token + 精确整串匹配。
- **文档上传承诺断裂**(P1,S):`bolt_slides.go:16/22` 承诺"可附带文档",`spec.go:110` 留着 ReadDocument 注释,但 `ClawPage.tsx:70` `enableAttachments:false` 无上传 UI、skill allowed-tools 也不含 ReadDocument。"把我这篇论文做成PPT"这个最自然入口是断的。三处对齐:要么开上传通道,要么删措辞改"纯文本描述/粘贴关键内容"。
- **URL 无联网措辞不符**(P3,S):SKILL"给了 URL 就从该品牌取主题"但 agent 无联网 + WebFetch 被禁。改"只能凭已知信息取主题,不认识就问用户要配色/logo"。

### 2.4 导出健壮性(P1/P2)

- **整页截图版不可编辑**(P1):`deckpptx.ts` 用 headless chromium 逐张截图 → pptxgenjs 拼成图片版 pptx/pdf,文字不可选/不可编辑。科研用户投会/答辩前普遍要改数字、套院系母版、批注协作 —— 交的是死图。中期做可编辑导出(pptxgenjs `addText`/`addTable` 对结构化版式重建文本层,复杂组件回退截图),先在 toast 明标"图片版·不可编辑"。
- **导出超时三层不自洽**(P1):MAX_SLIDES=80 / agent client 5min / gin 中间件不对齐,逐张串行 chromium,30-40 页综述 deck 逼近上限会导不出且不可取消。三层对齐 + ctx/AbortSignal 透传 + 失败给"减页重试"提示。
- 单张截图偶发失败即整份作废(加 1-2 次重试);产物 >20MB 被 harvest 静默丢弃但 toast 报成功(加体积预检回可读错误)。(S)
- 导出分钟级同步阻塞只有 spinner,无页数进度,切会话/刷新即丢。逐张截图天然可回报"第 N/M 页";或改异步任务。(M)

### 2.5 前端体验(P2)

- 生成期零领域反馈、产物不自动打开 —— 同代码里 sci_draw 有的两项优化(`ConversationWorkspace` 的"新产物自动打开"+"busy 期轮询")被 `if(modelFeature!=='sci_draw')` 门控,没给 boltslides。解除门控。(S)
- 发现性:模板卡只在空态出现,进对话后无 PPT 入口、切换要两跳。顶栏/侧栏加常驻入口。(S)
- 16:9 deck 被塞进 34% 窄侧栏预览、无全屏/放大按钮。预览 header 加全屏/新标签打开。(S)
- 导出入口只藏在预览 header,成果卡片上无导出按钮。(S)
- `emptyArtifactsHint` 是死配置,右栏空态永远显示通用句。透传给 `ClawArtifactPanel` 或删字段。(S)

### 2.6 跨 feature 打通(P3→值得中期做)

科研 deck 最需要的 KM/森林/ROC/分子/机制图恰是 sci_draw 已能确定性出的 SVG(矢量可内联进单文件 PPT),但两个 feature 产物管线互不相通,用户只能手动导出/下载/再粘 base64。让 boltslides 引用同用户 sci_draw 会话的 SVG 产物。**依赖 P0 先让 B/C 车道复活。**

---

## 3. 落地节奏建议

**第 1 周(阻断 + 清债,几乎全是一行到半天的修改,ROI 极高)**
- sci_draw:P0-1(`--ro-bind-try /etc/alternatives` 复活两条车道)+ P0-2(字体名)+ P0-3(冒烟测试)+ C-1~C-7(prompt step2 一行、删死代码、文案、下载出口、图标回退、越权校验)。
- boltslides:触发词唯一化 + 文档上传承诺对齐 + URL 措辞对齐 + 导出体积/超时对齐。
- **`bwrap.ts` 那行 `--ro-bind-try /etc/alternatives` 是当前全仓最该马上提交的改动。**

**第 2-3 周(科研能力补齐)**
- boltslides 第一批科研化:LaTeX(KaTeX)+ 引用/参考文献/图注组件 + 学术弧线/主题(约 1 周,全构建期/文案,立刻让理工科与文献综述可用)。
- sci_draw:A-1/A-2(边路由 + legend,从"能看"到"可投稿")+ B/C skill 金标与边界 + 导出统一。

**第 4 周起(路线投入)**
- boltslides 第二批:图表扩展 + 中文字体自托管;可编辑导出立项。
- sci_draw:R2 素材库(优先)→ R1 3D 车道评估 → boltslides↔sci_draw 产物打通。

---

## 附:被推翻的发现(对抗验证不通过)

- "配方渲染的 .json 内容兜底依赖 storage 是否启用(onSaveFigure 布尔),storage 关闭时错名 .json 配方渲染不出图" —— 复核发现逻辑不成立,已剔除。

审查方法:14 个维度各出 3-8 条 findings,每条派独立 skeptic 亲自打开引用文件核对(默认怀疑,只有亲眼看到证据成立才判 CONFIRMED)。P0 沙箱崩溃与 A 车道格式债由本人在 scholar_agent 容器内独立复现坐实。
