# 贴合真实论文的高质量生物/细胞插画:全路线深调研与 Scholar 落地拍板

> 结论先行:sci_draw 车道 A(agent 手写 SVG)出不了"肌理级"插画**不是"再努力一下"的问题,是结构性天花板**。想把质量往上抬,现实里只有三条真路——**开放素材库拼装**(能到"扁平但专业"的 BioRender-lite 层)、**受约束的 AI 生成/混合管线**(能到有质感的草稿,但踩合规+幻觉两堵墙)、**headless 3D 渲染**(分子/蛋白场景能到真·论文级,但重)。四类图不该用同一条路。**但要先说清一件反直觉的事:车道 A 的"扁平示意层"虽然是质量的地板,却同时是唯一"两大出版商都放行"的可投稿层——不含内嵌图像的流程图/实验工作流示意。** 下面把每条路的质量/成本/合规/落地摆平,再给矩阵和分期。
>
> 方法:7 路并行联网调研(全 web_access=yes)+ 对抗式审稿收敛(审稿抓出"断网沙箱结构拉取"关键漏洞,终稿已修)。日期 2026-07-21。是 [REPORT.md](REPORT.md) / [MEDICAL.md](MEDICAL.md) / [PLAN.md](PLAN.md) 的生物插画专章。

---

## 一、质量鸿沟的本质:手写 SVG 为什么到不了"肌理级"

论文里那种有明暗、有质感、半写实的细胞/机制/通路插画,和我们手写 SVG 出的"方框箭头",**中间隔的不是熟练度,是三个不同的视觉层级(tier)**:

1. **扁平示意层(flat schematic)**——matplotlib、hand-SVG、单色 icon。就是现在车道 A 的上限。**别把它只当"地板":不含内嵌图像的流程图/决策树/实验工作流示意,是本调研里唯一在 Nature 和 Elsevier 都合法的插画类输出(见第五节),也就是唯一零合规风险、现在就能直接交付投稿的一层。** 它在"质量"轴垫底,却在"可投稿"轴封顶。
2. **抛光扁平/半卡通矢量层(polished-flat)**——BioRender、Servier 的观感:干净、一致、有限调色板、轻渐变。**这一层矢量+素材拼装够得着。**
3. **肌理级 3D 写实层(textured realism)**——Nature/Cell 封面、机制大图:脂双层有真实纹理、细胞器有投影和景深、受体有材质光泽。**这一层手写矢量够不着。**

**为什么手写 SVG 结构性地够不着第 3 层**,有技术和人两个原因(均 confidence=high):

- **技术**:肌理/写实观感依赖三样东西——**栅格纹理、渐变网格(gradient mesh)、真正的全局光照(光线追踪投影、次表面散射、景深)**。这些是扁平矢量图元根本不表达的东西。即便在 Illustrator 里,画沿曲面重复的脂双层要用 pattern brush,而"pattern brush 不能包含渐变、渐变网格、特效"——你只能在"可重复结构"和"有阴影的立体感"里二选一。ray-traced 阴影/DOF 这些,3D 是"免费"给的,矢量得逐对象手抠还给不全。
- **人**:顶层图要求"结构生物学准确性 + 美术功底"的融合。职业医学插画师通常是 AMI 认证、北美仅 ~4–5 个认可硕士项目出身,受过 3D 建模/动画/生化训练。封面图是委托给这种专家的,自由职业单图 **$150–$1,500+**(加急+期刊要求全版权转让更贵)。

**这些"漂亮图"真实是怎么做出来的**(confidence=high):

- **Nature 封面**:职业 3D 管线。流程被明确记录——插画师草图 → 创意总监批准 → 建带细节的 3D 模型 → 上色/纹理/打光 → 追求"扫描电镜(SEM)观感"。某 Nature 微生物组封面建了 35+ 细胞类型,三分之二细菌程序化摆放、其余手摆,动画总监负责构图,用色相/饱和度给物种编码 + 景深聚焦。
- **分子机制动画/静帧**(Cell/Science):电影级 3D。Janet Iwasa 用 **Maya + After Effects**,PDB 坐标经插件导入摆 CPK 球,用 Maya Paint Effects 做磷脂双层(Drew Berry 首创的技法)——这是 VFX 管线,不是画图工具。
- **拥挤细胞景观(David Goodsell 的经典观感)**:也是**混合双介质**——单个蛋白是从 PDB 结构直接 cell-shaded 计算渲染,拥挤的细胞内部是**手绘水彩**(统一 1,000,000× 放大)。"水彩介质产生的手绘肌理正是把他的作品和矢量图区分开的东西。"

**一句话本质**:第 3 层的观感 = 栅格纹理 + 渐变网格 + 物理光照 + 人的美术判断。这四样里,hand-SVG 一样都给不了。所以"LLM 吐 SVG 就能出论文级生物图"是**过度承诺**,用户会立刻看穿差距。**能程序化够着的天花板是第 2 层(抛光扁平/BioRender-lite),第 3 层要么上 3D 要么请人。**

---

## 二、技术路线全貌(逐条摆清)

### 路线①:开放专业素材库拼装(Servier / bioicons / NIH BioArt / Reactome / Togo)

**核心回答用户的问题:开放素材到底是不是"肌理级"?——不是,它们压倒性地偏扁平/示意/半卡通/单色线条。**

| 库 | 数量 | 许可 | 格式(可分层?) | 风格 |
|---|---|---|---|---|
| **NIH BioArt (NIAID)** | 2,000+ | **公共领域**(部分 CC-BY) | EPS/AI/PNG/**SVG** ✅ | 职业医学插画师绘制,**最专业的开放选项**,但仍是干净扁平/半扁平,非重纹理 |
| **Servier SMART** | 3,000+ | CC BY 4.0 | 官方仅 PPTX/PNG(**无 SVG**,SVG 要去 Wikimedia 找衍生) | "干净半卡通矢量,有限蓝灰调色板"——扁平 |
| **Reactome Icon Lib** | 1,150+ | CC BY 4.0 | SVG/EMF/PNG ✅ | 单一 house style,通路示意,扁平 |
| **bioicons** | ~2,800 | CC0/CC-BY-SA/MIT | SVG ✅ | 简化单色,众包风格不一致 |
| **DBCLS Togo** | 未公布 | CC BY 4.0 | PNG/AI/SVG ✅ | 众包风格不统一;**据调研者主观判断(confidence=medium,原始素材页未明确标注 style),少数含柔和上色/半写实**,可能是最接近"更丰富"的开放库——但此归类未经证实,不宜当卖点 |
| **SciDraw / Noun Project** | — | CC-BY / freemium | SVG ✅ | 线稿/象形符号,最不"插画" |

- **能达到的质量**:第 2 层的"扁平专业",**够不到肌理级**。想要 BioRender 那种带渐变/半 3D 的一致观感,开放库里**没有**——那是 BioRender(50,000+ 职业插画师同风格图标,~$420/年学术)和 Mind the Graph(75,000+,$3–15/月,SVG 导出、付费免署名)的付费护城河。
- **覆盖哪几类图**:细胞/机制/通路示意 ✅、解剖示意 ✅(Servier/BioArt 偏解剖生理)、分子/蛋白**符号级**(真结构要 3D)、封面/图形摘要的**元素**可拼但拼不出封面级。
- **成本**:开放库=$0 素材成本;工程成本=建检索+布局。
- **合规**:多数是 **CC-BY**(需图注/方法署名),自动拼装时逐素材署名很痛;**只有 NIH BioArt(公共领域)和 bioicons 的 CC0/MIT 子集免署名**——这对自动组图很关键。**注意 Servier/BioArt/Togo 里的 CC BY-SA 版权左(copyleft)素材,衍生图可能要 ShareAlike,和期刊独占版权转让冲突**——优先用公共领域/CC-BY(非 SA)源。
- **Scholar 落地契合度**:**高**。可复用 library/staging 模块;检索+LLM 布局这套正好是 agentbridge/Prism 的"结构化中间产物"形态。**建议单一 house style 作骨架(NIH BioArt / Reactome),避免混众包源导致风格割裂。**

### 路线②:通用图像生成模型(Nano Banana Pro / GPT Image / Seedream / Imagen / Firefly)

**质感最强,但三堵墙。**

- **能达到的质量(强)**:到 2026 年中,前沿模型基本解决了"图内文字可读"和"有质感的封面级渲染"。**Nano Banana Pro(Gemini 3 Pro Image,2025-11 发布)是当前质感+图内文字最强**,1K/2K/4K、对话式改光/机位/景深、14 张参考一致性,~$0.24/4K 图,SynthID 水印。Seedream/Imagen 观感接近,Firefly 卖点是训练数据商用干净。
- **墙 1——解剖幻觉(confidence=high)**:**几乎没有同行评审证据表明这些模型把生物画对,且有的证据都是系统性翻车**。2025 Clinical Anatomy 研究测 Bing/DeepAI/Freepik/Gemini,只有 Gemini 把胸骨/肋骨数画对,骨性细节普遍差;模型会数错离散元素(染色体、跨膜螺旋)、把经典通路方向画反(STAT 先入核后二聚)、细胞器尺寸错位(线粒体比核大)。2024 Frontiers"巨型生殖器大鼠 + 乱码标签 iollotte sserotgomar cell"3 天被撤稿是标志性事故。**加纹理只会让错的结构显得更权威。**
- **墙 2——可编辑性(confidence=high)**:**全是栅格,没有矢量**;"只改这一个箭头/细胞器"不可靠——GPT Image 的 mask 是语义引导常整图重绘,Seedream 元素级编辑略好但硬编辑退化,Nano Banana 对话改也会漂移。
- **墙 3——合规**:见第五节逐字来源。**Nature/Springer 对生成式图像一刀切禁;Elsevier 禁通用生成式做图形摘要、禁做代表数据的图。**
- **BioRender AI 为什么不同(受约束生成,confidence=high)**:它**不合成像素,而是从 50,000+ 插画师审核过的图标里"检索+装配"**——LLM 规划结构 → 跑库检索 → 拼装原生对象。所以输出是**有界误差、完全可编辑、许可安全**。它另有个"BioRender Style"图生图重风格化,但那条是扁平不可编辑。**这正是产品架构上的分水岭:约束装配 ≠ 像素合成。**
- **Scholar 落地契合度**:**中**。后端可像 minicod 一样从后端调 Nano Banana/GPT Image API(无需 GPU)。但**必须门控**:输出只能标"演示/社交/草稿,非投稿用"。作为"概念/封面情绪图"和快速草稿有价值,作为投稿图是雷。

### 路线③:headless 3D 渲染(PyMOL / ChimeraX / Mol*·PDBImages / Blender+Molecular Nodes / VMD / cellPACK)

**范围界定:这条路线专指分子/蛋白/(介观)细胞场景——即"对象是有真实结构数据的分子",这也是它唯一能程序化够到第 3 层写实的前提。写实解剖器官不在本路线的工具覆盖内(见矩阵②行的单独处理)。**

分三档(confidence 多为 high):

- **确定性 + 无 GPU + 可脚本 + 今天就能出版级**:
  - **PyMOL**(`pymol -cq` + `ray`)——**CPU 软件光追,无需 GPU**,`.pml` 脚本 LLM 极易写,可复现。**最低摩擦的默认路。**
  - **Mol* / PDBImages**(Node.js + headless-gl,容器内无浏览器无 GPU)——**RCSB/PDBe 就是用它批量渲染每个结构**,支持 AlphaFold pLDDT 上色,回吐可复现的 `.molj` 状态文件。观感偏扁平 WebGL,但"全量批处理"最强。
  - **ChimeraX**(`--nogui --offscreen`,内置 OSMesa 软件渲染)——默认观感最好,`.cxc` 极易脚本;但**官方警告内置 OSMesa"很老",软件渲染慢且可能有瑕疵**,要好质量得挂 GPU + EGL/Xvfb。
  - VMD(text-mode + Tachyon CPU)、Illustrate(Goodsell 的 Fortran CLI,经典描边 Molecule-of-the-Month 观感,CPU 确定性)。
- **写实天花板最高**:**Blender + Molecular Nodes**——Python 全脚本,`bpy` 现在是 pip 模块可 headless(等价 `blender -b`),`mn.Molecule.fetch('4ozs')` / `fetch('Q8W3K0', database='alphafold')` 直接拉结构,Cycles 路径追踪出**真·纹理/材质/AO/景深的电影级**图。代价:**GPU(CUDA/OptiX)才实用,CPU Cycles 慢;采样噪声导致非确定(要钉 seed + 降噪)。**保留给"高级档"。
- **场景生成器(非渲染器)**:cellPACK/Mesoscope 从 JSON recipe 确定性生成介观(10–100nm)细胞坐标 → 再喂 Blender/Illustrate 渲染,做全细胞景观。
- 淘汰:BioBlender(废弃)、Nanome(VR 优先,非 headless)。

**⚠️ 承重落地细节:结构数据怎么进断网沙箱(否则整条路的可行性判断是错的)。** PyMOL `fetch`、Mol*/PDBImages、`mn.Molecule.fetch()` **全都是从 RCSB/AlphaFold 联网下载**结构文件的——在 `network_none` 沙箱里这一步必然失败。可行的正确形状是**两段拆开**:
1. **拉结构(唯一碰网络的动作,必须在沙箱外)**:后端(像 minicod 一样在沙箱外)按 PDB ID / UniProt 拉 `.pdb`/`.cif` 文件;
2. **注入 + 确定性渲染(沙箱内)**:把结构文件推进沙箱 cwd(正是 [agent-file-handling planB] 的"推原始文件"模式)→ 沙箱内 PyMOL/Mol* **只做本地渲染,不 fetch**(`.pml`/`.molj` 里用本地文件路径,不用 `fetch` 命令)。

把"拉结构"和"渲染"合并成一句(如"沙箱里直接渲染真实 PDB")是错的——拉结构必须挪到沙箱外。

**合规优势**:**从真实结构数据经可视化软件渲染的分子/解剖图,不算"生成式 AI 图像",Nature/Elsevier 的禁令抓不到它**(confidence=medium 的边界推断,但方向明确)。这是 3D 路线最大的隐性红利。

**Scholar 落地契合度**:**中(分子)到低(全细胞)**。PyMOL/Mol* 可放进现有断网 bwrap 沙箱当 CPU 容器(和 RDKit 车道 C 同构),后端拉结构→推文件→LLM 吐 `.pml`/`.molj` recipe→沙箱渲染→MinIO 交付,完全契合 agentbridge + planB 文件模式。Blender+MN 要 GPU worker,是新基建,工程量大。

### 路线④:混合管线(2025–2026 最活跃的研究方向)

所有 2026 benchmark(SciDraw-Bench、FEPBench)都指向同一洞见:**原始文生图在"图内文字/标签保真"和"实体关系正确"上崩溃,所以赢家架构都避免把文字烧进像素——用"结构化中间产物 → 渲染/装配",让标签保持真·文本对象。** 五个真实子模式:

- **(A) 素材检索 + AI 布局 / 受约束装配**——**BioRender AI 的真实做法**(见上),学术版 DiagramRAG(知识图谱拓扑增强检索)、BioCanvas(NIH BioArt+bioicons 检索 + AI 生透明素材 + 画布装配,导出 SVG/PNG/PDF)。**最低风险、最准、最快 MVP。**
- **(B) AI 质感 + 矢量标签叠加**——这个"栅格底做美观 + 矢量文字叠上去"的混合,**恰恰是文字保真失败所论证该走的架构,却没有任何已发表的生物机制图系统实现它**——**真空 = 差异化机会,但高风险未验证**。BioRender Style 不是这个(它整图烧成栅格)。
- **(C) 栅格→可编辑 SVG 矢量化**——两支:优化/可微光栅化(DiffVG→LIVE,保拓扑分层)、学习/扩散(LayerTracer DiT、DeepIcon)。**关键洞见:最新图管线不用传统描边矢量化,而是"检测+LLM 写代码"**——AutoFigure(ICLR 2026)5 阶段:VLM 出栅格草稿 → SAM 分割检测图标/文字/连线 → LLM 用 mask+bbox 约束写占位 SVG → 装配换成透明抠出的图标 → SVG 编辑器精修。Crafter+CraftEditor 同理。
- **(D) 原生文生矢量**(Recraft V3/V4 SVG、NeuralSVG)——真实可编辑但**只到图标/logo 复杂度**,标签密集的机制图还不行。
- **(E) 多智能体场景图/代码 → 渲染**——SciFig(规划→布局→组件→精修,出可编辑 XML,~10 分钟/图)、Draw-with-Thought(→mxGraph XML)、AutoFigure。**共同点:编排 > 模型蛮力,输出可编辑结构。**

**Scholar 落地契合度**:**高**。(E)/(A) 的形状**几乎 1:1 映射到 Scholar 现有基建**——agentbridge/scholar_agent 多智能体 harness、Prism 的 struct-JSON"结构化真源"、peerreview 多技能编排。"SciFig/AutoFigure"就是"Prism 式 feature":agent 规划场景图 → 吐可编辑 SVG/JSON → 用户 WYSIWYG 编辑(Prism 已用 Tiptap 对 LaTeX 做过,SVG 是同构对应)。**参考实现:AutoFigure 已开源(github.com/ResearAI/AutoFigure-Edit),最接近可 fork 研究。** 注意:图管线 token 重(SciFig ~10 分钟/图),要走 agentbridge StandardHooks/vip 配额,和 smart_search/claw/prism 一样。

---

## 三、图类型 × 推荐路线矩阵

> **范围声明**:本矩阵覆盖"插画/示意/渲染类"图。**数据/统计图(matplotlib 式 plot、柱线散点、热图等)不在本调研范围**——它们归现有能力/车道 B,合规上属"data-derived charts",AI 辅助+逐图披露即可放行,与本文的"生物插画"是两个问题域。矩阵不是全图类穷举。

| 图类型 | 首选路线 | 为什么 | 合规注意 |
|---|---|---|---|
| **⓪流程/实验工作流示意**(不含内嵌图像的 flowchart / decision tree / timeline / workflow) | **路线①/④装配,或车道 A 直接手写 SVG** —— 现在就能交付 | 结构简单、纯矢量、标签即文本;这是**唯一在 Nature 和 Elsevier 都合法**的插画类输出,零合规风险 | **两大出版商都放行**(Nature 禁令逐字排除"flow charts and other simple graphs that do not contain images";Elsevier 明确允许 flowchart/decision tree/timeline/workflow diagram)。唯一约束:**不能内嵌图像**,内嵌即落回受限类 |
| **①细胞/机制/通路插画** | **路线④(A)受约束装配**:NIH BioArt+Reactome+bioicons 检索 + LLM 布局,标签保持矢量文本 → 抬到抛光扁平层 | 开放库覆盖足、可编辑、标签不糊;这是能程序化够到的最高性价比层 | Nature/Springer **禁**任何生成式插画;Elsevier **允许**作"示意概念插画"但须逐图注披露工具+版本;图形摘要必须用专用工具。**装配路(非像素合成)风险最低** |
| **②解剖/组织/器官图** | **示意图**走路线④装配(BioArt 偏解剖),现在可交付;**写实器官**=**长期档**:或走 Blender 从开放 3D 模型渲染(BodyParts3D / Z-Anatomy),或**短期用导流**(链接/嵌入 Complete Anatomy·BioDigital 截图,自动带署名/水印)——**二者都不在短期自建渲染范围**(见下方说明) | 文生图**解剖幻觉严重**(数错肋骨/牙/椎骨、主动脉分支错),写实只让错更权威 → 必须从真模型渲染或从授权图库取 | **硬红线:绝不生成组织学/病理/显微/血影/放射的写实"组织图"——普适禁止(读作伪造原始数据)且不可靠。** BodyParts3D/Z-Anatomy 是 copyleft(CC BY-SA),衍生图 ShareAlike 可能撞期刊版权转让;商业库须自动带署名/水印 |
| **③分子/蛋白结构场景** | **路线③ headless 3D**:默认 PyMOL(`-cq`+ray,无 GPU)或 Mol*/PDBImages(批量+AlphaFold);**后端拉结构→推入断网沙箱→沙箱内本地渲染**;高级档 Blender+MN(GPU 写实) | 有真实 PDB/AlphaFold 结构 → 3D 渲染即准又美,且**不算生成式 AI 图像**,合规红利最大 | 从真实结构数据渲染 **不被** Nature/Elsevier 生成式禁令抓到;但**生成式"艺术化"分子渲染**会被当数据图或插画禁掉 |
| **④封面/图形摘要** | **图形摘要**=路线④装配(Elsevier 明确要"专用插画工具");**封面情绪图**=路线②图像生成(Nano Banana Pro)**但仅作演示/投稿前概念** | 图形摘要要可编辑+准+许可安全 → 装配;封面要质感 → 生成模型质感最强 | **Nature/Springer:生成式封面/图形摘要全禁,封面仅限签约图库。Elsevier:通用生成式禁做图形摘要;封面 AI"个别可,须编辑+出版方事先许可"。** 导出流必须弹"非投稿即用"警告 + 自动生成披露文案 |

**②行"写实器官"的口径澄清(消除自相矛盾)**:写实解剖不是路线③(那是分子工具,不含解剖)能覆盖的。BodyParts3D / Z-Anatomy 是 **Blender/OBJ 静态网格,程序化渲染仍需 Blender 引擎**——而 Blender 被本文划为"GPU 重、暂缓/长期"。所以**自建写实解剖渲染 = 与 Blender GPU 同属长期档,短期不做**。短期若要露出写实器官,只能走**导流**:链接/嵌入商业图库(Complete Anatomy 5 图/年学生、20 图专业;BioDigital 2 图/月+强制水印)或开放 3D 模型的官方截图,**这是"链接/截图"不是"程序化渲染"**,须自动插入必需署名/水印。二者不要混为一谈。

---

## 四、Scholar 落地可行性(可复用 vs 需新建)

现状约束(据 sci_draw 现有 A/B/C 车道 + 平台架构):**断网 bwrap 沙箱可用、无 GPU、图像模型未接、无素材库、后端可像 minicod 从后端调外部 API、后端可像 planB 那样把文件推进沙箱 cwd、MinIO artifact 交付、agentbridge token 配额链路已成熟**。

| 路线 | 能否进现有 A/B/C 车道 | 工程量 | 判断 |
|---|---|---|---|
| **⓪流程/工作流示意** | **车道 A 现状即可**(手写 SVG),或并入车道 D 装配 | 极低:基本是现有能力 | **立即可交付、零合规风险**——是唯一两大刊都放行的可投稿插画层,应显式露出为"投稿安全"档,而非埋没在"扁平地板"里 |
| **①开放素材库装配** | **新建车道 D**(与 A/B/C 并列):素材检索 + LLM 布局 → SVG。复用 library/staging + Prism struct-JSON + MinIO | 中:需建素材库(下载 NIH BioArt 公共领域 + Reactome/bioicons CC0 子集入库并做检索索引)+ 布局 agent + WYSIWYG SVG 编辑器 | **能做且最值得。** 最高性价比把①③④的示意/图形摘要抬到抛光扁平层。优先公共领域源免署名 |
| **②图像生成模型** | 可作**车道 A 的"质感草稿"子模式**或独立按钮 | 低:后端加一个 Nano Banana Pro/GPT Image 客户端(像 minicod 调外部 API,无 GPU),走 agentbridge 配额 | **能做但须严格门控**——只标"演示/概念/草稿,非投稿"。做封面情绪图、社交图、给用户看方向有价值;**绝不默认宣称论文级** |
| **③headless 3D(PyMOL/Mol*)** | **扩车道 C**(C 已是 RDKit 分子式,同属"从结构确定性渲染"):**后端拉 PDB/AlphaFold 结构 → 推进现有断网沙箱 CPU 容器(planB 文件模式)→ 沙箱内 PyMOL/Mol* 本地渲染**(LLM 吐 `.pml`/`.molj` 用本地路径不用 fetch)→ MinIO | 中:容器化 PyMOL/Mol*(CPU、确定性、无 GPU)+ 后端结构拉取器(碰网络那段在沙箱外)。和 C 车道同构,契合度高 | **能做且值得**——是唯一程序化够到论文级写实的路(限分子/蛋白),且合规红利大。**从 PyMOL 起步。承重前提:结构拉取必须在沙箱外,别指望沙箱内 fetch** |
| **③ Blender+MN 写实/全细胞 + 写实解剖** | 新建 GPU worker,现有沙箱无 GPU 撑不住 | 高:要 GPU 基建 + Python bpy 管线 + 非确定性(seed/降噪) | **暂缓**——质量最高但基建重、非确定、维护贵。**写实解剖器官渲染(Blender 渲 BodyParts3D/Z-Anatomy)也落在这一档**,短期不自建。等①③打好底再评估 |
| **④混合(AI 质感+矢量标注)** | 车道 D 的进阶形态 | 高:AutoFigure 式检测(SAM)+ LLM 写 SVG,未验证 | **值得试点但高风险**——生物机制图的"AI 质感+矢量标签"是公开真空,做成即差异化;先 fork AutoFigure 研究,不押 MVP |

**诚实区分**:
- **能做且划算(且立即可投稿)**:车道 A/D 出**⓪流程/实验工作流示意**——零合规风险、两大刊都放行,应作为第一个稳交付点显式露出。
- **能做且划算**:车道 D(开放素材装配)+ 车道 C 扩 PyMOL/Mol*。这两条把①②③④的**可交付层**(抛光扁平示意 + 真结构分子渲染)稳稳抬一档,且合规安全、无需 GPU、契合现有架构(分子路的结构拉取走沙箱外 planB)。
- **能做但要门控**:接 Nano Banana Pro 做质感草稿/封面概念——价值在"快"和"给方向",不在"投稿即用"。
- **不划算/暂缓**:Blender GPU 写实、全细胞 cellPACK 景观、**写实解剖器官渲染**——基建重、非确定、维护成本高,回报面窄(只有少数封面/写实图用户需要),不如把预算投在 D 车道和 PyMOL。写实解剖短期只做**导流**(授权图库截图 + 自动署名/水印),不做自建渲染。
- **绝不做**:文生图的组织学/病理/显微/放射写实"组织图"——普适禁止 + 不可靠,应做成**明确拒绝 + 解释**,而非 feature。

---

## 五、合规红线(已核实逐字来源)

**这堵墙优先级高于一切"能力"——能画出来 ≠ 能投稿。** 两大出版商默认立场相反,必须按刊按图类型判定。

**Nature / Springer Nature —— 一刀切禁(confidence=high)**:
- 逐字:**"Springer Nature journals are unable to permit its use [generative AI] for publication."**
- 范围明确覆盖插画:**"illustration such as scientific diagrams, photo-illustrations and other collages, and editorial illustrations such as drawings, cartoons or other 2D or 3D visual representations."**
- **仅排除**(这句是⓪行"流程示意全刊安全"的一半依据):**"text-based and numerical display items, such as: tables, flow charts and other simple graphs that do not contain images."**
- 三个窄例外:签约图库图 / 专门讲 AI 的文章(逐案)/ **"generative AI tools developed with specific sets of underlying scientific data that can be attributed, checked and verified for accuracy"**;且 **"All exceptions must be labelled clearly as generated by AI within the image field."**

**Elsevier —— 概念插画有条件放行,数据图与图形摘要硬禁(confidence=high)**:
- 数据禁令逐字:**"AI tools must not be used to create or alter images that represent primary observed or experimental data"**,点名 **"microscopy, histology, western blots, radiology scans, or patient images."**
- 概念放行逐字(⓪行"流程示意全刊安全"的另一半依据):允许 **"flow charts, decision trees, timelines, schematic conceptual illustrations, or experimental workflow diagrams."**
- 图形摘要逐字:**"General-purpose generative AI image tools must not be used to create graphical abstracts."** + **"Authors are encouraged to use dedicated scientific illustration tools when preparing graphical abstracts."**
- 封面逐字:**"The use of AI tools in the creation of journal cover art may in some cases be permitted. Authors must obtain prior permission from the journal editor and publisher..."**
- 披露(强制、逐图粒度)逐字:**"disclosed in the caption of each image (including the specific tool, version, and how the tool was used) and in the general AI disclosure statement in the article."**

**T&F / ICMJE**(confidence=high):T&F 禁生成式 AI 改实验摄影图(显微/免疫染色/电泳/免疫印迹);ICMJE 要求方法学披露 AI 用于图像生成 + 人工独立核验。

**关键交集(唯一普适可投稿的插画层)**:把 Nature 的"排除 flow charts…without images"和 Elsevier 的"allow flowcharts/workflow diagrams"叠加,**不含内嵌图像的流程图/实验工作流示意是两大刊都合法的唯一插画类**——这正是车道 A/D 现在就能做的,应在产品里显式标"投稿安全",不要因为它"扁平"就贬低。

**边界推断(confidence=medium,诚实标注)**:
- "从真实结构数据经可视化软件(PyMOL/ChimeraX/AlphaFold viewer)渲染的分子/解剖图**不算生成式 AI 图像**,不被禁令抓到"——是推断,非某句逐字点名 PyMOL,故 medium。
- "文生图的写实(非示意)生物渲染是两大商跨图类型最清晰的禁例;Elsevier 的放行绑在**示意**框架而非写实纹理上"——边界推断,medium。
- "示意解剖插画 Elsevier 允许、Springer 全禁"——两份已核实政策直接对比得出,**同一张 AI 示意器官图在一家合规、在另一家违规,必须按目标刊查**。

**未核实/低置信**:BioRender 导出为栅格(JPEG/PNG/PDF-bitmap,无真矢量)——二手源,medium;各厂"publication-ready/fully editable"自述(PaperBanana FigureBench、FigureLabs)均**厂商自报未经独立验证**,勿据此承诺。

---

## 六、推荐与分期

**短期(0–1 季度)——把质量稳稳抬一档 + 先立一个零风险可投稿交付点:**

1. **先露出⓪流程/实验工作流示意作为"投稿安全"档**(车道 A 手写 SVG / 车道 D 装配均可)。这是唯一两大刊都放行、现在就能直接投稿的插画类,工程量极低,应作为第一个稳交付面显式标注"全刊安全",别埋在"扁平地板"叙事里。
2. **新建车道 D:开放素材库装配**(骨架 = NIH BioArt 公共领域 + Reactome CC-BY,补 bioicons CC0 子集)。LLM 规划场景图 → 库检索 → 拼装成**可编辑 SVG**(标签保持真文本对象)。复用 library/staging + Prism struct-JSON + MinIO。**把①细胞/机制/通路、②解剖示意、④图形摘要从"方框箭头"抬到"抛光扁平专业"层。** 自动逐素材署名(优先公共领域源规避)。
3. **扩车道 C:接 PyMOL(`-cq`+ray,CPU 无 GPU,断网沙箱)**——**后端(沙箱外)按 PDB ID/UniProt 拉结构文件 → planB 推进沙箱 cwd → 沙箱内 PyMOL 用本地路径渲染(不 fetch)**。**③分子/蛋白直接到论文级写实,且合规红利最大(不算生成式)。** Mol*/PDBImages 作批量+AlphaFold pLDDT 补充。
4. **接 Nano Banana Pro 作"质感草稿/封面概念"子模式**(后端调 API,无 GPU),**硬门控**标"演示/非投稿",导出流自动弹合规警告 + 生成 Elsevier 式披露文案(工具+版本+用法)。

**合规工程(贯穿短期,必做)**:导出流内置**按刊 × 按图类型合规矩阵**(第三节那张),Springer 目标除⓪流程示意外一律"不可直接投稿"警告,Elsevier 只放行示意类并自动生成图注/方法披露;**硬阻断**组织学/病理/显微/放射的写实生成(明确拒绝+解释)。

**中期(1–2 季度)——逼近论文级:**

5. **车道 D 进阶到混合(A→B/C 式)**:引入 AutoFigure/CraftEditor 的"检测(SAM)+ LLM 写 SVG"矢量化,试点"**AI 质感栅格底 + 矢量标签叠加**"——生物机制图的公开真空,做成即差异化。先 fork github.com/ResearAI/AutoFigure-Edit 研究,不押关键路径。
6. **写实解剖走导流(非自建渲染)**:集成/链接 BodyParts3D + Z-Anatomy(CC BY-SA)或 Complete Anatomy/BioDigital 截图,**自动插入必需署名/水印**,规避 ShareAlike × 版权转让冲突时给用户提示。**自建写实解剖渲染(Blender 渲网格)归长期档,不在此期。**

**长期(视回报再评估)——写实天花板:**

7. **Blender + Molecular Nodes 的 GPU worker**(路径追踪写实分子 + cellPACK 全细胞景观 + **写实解剖器官渲染**)。**基建重、非确定、维护贵,回报面窄**——只有少数封面/大图/写实解剖用户需要。**明确定位为"暂缓/按需",不优先。** 真正的封面级仍建议"生成概念图 + 引导用户找职业插画师($150–1500)"的混合交付,而非硬追全自动。

**一句话拍板**:短期先把**⓪流程/工作流示意**立成零风险可投稿交付点,再靠**车道 D(开放素材装配)+ 车道 C 扩 PyMOL(结构拉取走沙箱外)**把其余几类图的可交付层稳稳抬一档且合规无 GPU;质感草稿接 Nano Banana Pro 但门控住;**不与 BioRender 的策展素材库和 Nature 封面级 3D 硬碰**——那是护城河,自建不划算。全程把合规红线设计进导出流,而非事后补。
