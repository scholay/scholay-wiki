# 科研绘图之——医学类别绘图 专项分析

> 面向 Scholar 科研绘图 feature。上一份总报告（[REPORT.md](REPORT.md)）已定架构（按图类型分派渲染器：数据图→代码执行、流程图→SVG/TikZ、分子→RDKit、可编辑中间表示=场景图 JSON 仿 prism struct、图像直出默认不启用；容器 `scholar_agent` 有 python3 但无 matplotlib/texlive 须构建期烧入、TikZ 复用 `prism_tex` 沙箱；交付走 claw out 目录→MinIO；出版合规红线=数据驱动可视化允许、生成式图像受限、原始医学影像禁止生成或修改）。本文只谈**医学类别**，且与上述架构保持一致，不推翻。
>
> 方法：8 个并行联网调研 agent（全部 web_access=yes）+ 对抗式审稿收敛。日期 2026-07-20。

---

## 一、为什么医学是最难的一类

一句话结论：**医学绘图之所以最难，不是因为「画得复杂」，而是因为它同时踩中了三条别的类别都没有的高压线——外部硬真值、专业约定护城河、以及独一档的下游责任。而且「医学绘图」根本不是一个东西，它内部的子类难度天差地别，必须先拆开再谈。**

三条高压线具体是：

**1. 有一个模型内部没有可靠表征的「外部硬真值」（真实解剖 / 真实数据）。** 流程图、数据图之所以相对好做，是因为它们有可执行、可核对的真值——图表能从数据生成、能对着数字校验，Mermaid/Graphviz/matplotlib 的语法 LLM 原生就会写，跑一遍就能验。医学插画没有这种真值回路：模型对真实解剖没有可靠内部模型，于是它**幻觉出多余/错位/虚构的结构**。这一点有量化证据（confidence: high）：在一项屈光眼科手术插画的对照研究里，四位角膜外科医生给人类插画打 14.33/15（95.6%），给 DALL-E 3 打 4.93/15（32.8%）；AI 画出了「视神经从晶状体发出」「虹膜/瞳孔漂浮在玻璃体腔里」「激光探头出现在前房内」，且无法把手术步骤排成正确顺序，结论是这些图「缺乏教育价值」「不适合患教或临床培训」。另一项研究把解剖错误正式归纳为五类固定失败模式：缺失部件、多余部件、构型错误（部件错位/融合）、朝向错误、比例错误——手是最差区域，多人场景错误率飙升（均值 3.96 vs 单人 0.82）。

**2. 一层厚重的专业约定 / 图示语法护城河。** 医学插画是一门持证职业（AMI 认证），从业者同时受生命科学 + 视觉传达双重训练；这门手艺的核心是**刻意的抽象**——决定为了清晰而省略什么（Vesalius 刻意省略脂肪组织；Netter 图谱是一套标准化视觉语法）。这种「精确性 vs 传达清晰度」的判断是领域约定，AI 无法凭空推断（此为综合判断，confidence: medium）。这也解释了为什么自由形态插画比图表更难：图表有可测真值和代码规范，插画没有。

**3. 独一档的下游责任 + 硬性合规红线。** 一张「看起来对、其实错」的医学图会造成诊断错误、患教伤害或科研造假。当 AI 伪造**代表数据的图**（组织学、western blot）时，连专家都管不住：816 人参与的研究里，专家病理学家区分真实 vs Stable-Diffusion 生成的小鼠肾组织，正确率只有 69.3%，外行 54.5%（近乎随机），作者明确结论「仅靠人工审查无法作为充分保障」（confidence: high）。这正是为什么 NEJM/Cell/Science/Springer Nature 在「声称是原始实验数据的图」这条线上划死。而这条线在真实世界已经被撞过：2024 年 2 月 Frontiers 那张 Midjourney 生成的大鼠解剖图（畸形生殖器、乱码标签 `iollotte sserotgomar cell`、JAK-STAT 通路画成鬼画符）通过了同行评审、爆火、3 天后被撤稿——这是全领域的标志性警示案例（confidence: high）。

**执行现实（关键，confidence: high）**：出版社「披露即可」的政策执行很弱——那张大鼠图是**通过了**评审才被撤的。对一个生成产品的直接含义是：**不能指望下游编辑抓错，必须在生成时就闸住**（禁掉被禁子类、按目标期刊门控生成通道、强制盖披露元数据）。

> **一条贯穿全文的自洽推论（务必先记住）**：既然「人工审查这道闸靠不住」是本报告的立论，那么任何**唯一护栏就是「专家事后签字」的车道，按本报告自身逻辑就是最脆弱的车道**——这直接点名下文的 (a) 生成车道。高置信证据（LASIK 研究、大鼠撤稿、五类解剖失败模式）表明生成模型**连患教级的解剖都画不对**。因此本终稿对 (a) 的护栏做了收紧：**凡含真实解剖结构的图（哪怕是患教用途）默认下推到 (b)，(a) 只保留纯示意 / 非解剖内容**（图标风格流程、生活方式/依从性示意等）。详见 §二子类 7 与 §6.1。

---

## 二、子类别拆解与逐类判定

核心洞察：医学绘图沿**单一决定性轴**分裂——这张图是在**断言一手证据（primary evidence）**，还是在**图解一个概念**？这条轴再叉乘出版社的生成式 AI 禁令，得到四条路由车道：

- **(a) 可安全生成**（低风险、非数据、**且非解剖**、非顶刊）
- **(b) 宜用授权图标库拼装 / 专业插画师**（断言解剖/机制准确性）
- **(c) 确定性工具领域**（绑定真实数字/坐标渲染）
- **(d) 出版社明令禁止**（一手证据，非可覆盖硬闸）

| 子类 | 难度 | 判定 | 理由与关键约束 | 证据强度 |
|---|---|---|---|---|
| **1. 解剖插画**（器官/系统/剖面） | 高 | **(b)** 授权图标库/专业插画；**(a)** 仅限非发表、明确示意、专家核验的概念图，且**绝不用于 Nature/Science** | 解剖正确性零容忍，生成模型幻觉结构与标签。非「断言数据」故非 (d) | 综合判断，medium（锚定大鼠撤稿 high） |
| **2. 机制通路 / 细胞信号 / MoA** | 中 | 主要 **(b)** 图标库（BioRender 就是为此而生）；部分 **(c)** 当源自策展通路数据（Reactome/WikiPathways 优先，**KEGG 商用需付费许可，勿默认可用**，经 SBGN） | 形式是节点-边+图标布局（易），但拓扑与标签必须科学精确（难）。生成有高标签/拓扑幻觉风险，顶刊禁 | medium |
| **3. 实验/临床流程 · CONSORT/PRISMA · 患者流** | 低-中，但**正确性关键** | **(c)** 确定性工具领域 | 计数必须与数据集精确对账；有官方模板。**生成通道在此尤其危险**——扩散模型会捏造参与者人数，流程图**绝不路由到生成车道** | high |
| **4. 临床 / 统计图**（生存曲线 KM / 森林图 / ROC / 漏斗图 / ECG·EEG·流式细胞波形） | 低（有成熟库），但**须绑真实效应量/CI/事件数** | **(c)** 确定性数据驱动 | 临床医学论文出现频率**最高**的一类图，全部从真实统计量确定性渲染（survminer/forestplot/pROC/matplotlib 等）。ROI 最高、最易落地，模型**只选数据列/参数不发明数字**。属母报告「数据图→代码执行」在医学的具体落点 | high |
| **5. 分子 / 蛋白结构** | 低-中（有工具），但需**真实坐标** | **(c)** 确定性工具领域 | 从 PDB/AlphaFold 坐标用 PyMOL/ChimeraX/Mol*/VMD 渲染；小分子经 RDKit/SMILES。用扩散模型「生成蛋白图」= 捏造无坐标支撑的结构，实质等同禁止 | high |
| **6. 病理 / 组织学 / 放射影像 · 凝胶/blot 原图** | N/A | **(d) 出版社明令禁止**（非可覆盖硬闸） | 这些**就是**一手证据，合成即造假（COPE/ORI misconduct）；对真图的修改也严格受限（须整图调整+披露+提交未处理原图）。**额外**：临床/DICOM 图含 PHI，须去标识——第二个绝不走生成管线的理由 | high |
| **7. 患教插画** | 低-中 | **含解剖结构 → (b)** 图标库/专业插画；**纯示意/非解剖 → (a)** 可安全生成（+非诊断免责声明+溯源元数据） | 风险最低子类——风格化、非科研证据、常非出版图。**但护栏按 §1 逻辑收紧**：凡呈现真实解剖的患教图，其唯一保障恰是本报告判定为薄弱的「专家事后签字」，故默认下推 (b)；(a) 只留图标风格流程、依从性/生活方式示意等不含解剖的内容。不得呈现为临床指导/诊断、须保持示意 | 综合判断，medium |
| **8. 手术 / 操作插画** | 极高 | **(b)** 授权/专业插画；**(a)** 仅限粗略非临床概念草图，绝不作教学/临床参考，顶刊禁 | 要求解剖 + 操作双重保真（器械-组织空间关系）；传统上是持证插画师（AMI）领域；出错真实危害高（操作误学）。除 (d) 外风险最高的插画子类 | 综合判断，medium |
| **9. 医疗器械 / 临床示意图** | 中 | **(c)** 确定性（CAD 导出，或 diagram-as-code：mermaid/Graphviz/SVG）或 **(b)** 图标库；**(a)** 仅概念块图 | 技术线稿/带标签块图。**额外护栏**：描绘特定商用器械涉 IP/商标+准确性，优先示意/通用而非拟真品牌渲染 | 综合判断，medium |

**贯穿性铁律三条（high）**：

- **(d) 地板线**：任何会合成或静默编辑**原始组织学/病理/放射/显微/凝胶blot**的请求——在入口就拒绝。这些是一手证据（造假风险）且常含 PHI。
- **图形摘要（graphical abstract）是横切格式，单独门控**：它是医学论文最高频的「整图」产出之一，且有专门规则——**Elsevier 明令禁止用通用生成式 AI 工具做图形摘要**（须用专门科学插画工具/库拼装）。故图形摘要统一路由 **(b) 库拼装**，**禁 (a) 通用生成**，不因其「看起来像示意图」而放行。
- **跨类门控**：Nature Portfolio 和 Science 广泛**禁止生成式 AI 产出的图像/图/视频**（唯一窄例外：AI 产物本身是研究对象）。所以「(a) 可安全生成」**是随目标期刊而变的**——若目标是 Nature/Science/Cell，**生成车道整体关闭**。任何医学图路由器都必须把「目标期刊/用途」当作输入，而不只看子类。

> 证据说明：两个 Nature 政策页在直接抓取时跳到登录墙，其内容经搜索结果片段（引用原文）+独立佐证（ASM、Frontiers、FigureLabs、Science Integrity Digest）恢复——即政策方向 high，但**非官方页逐字全文**。

---

## 三、关键建材与确定性路径

这是本报告对 Scholar 最有操作价值的部分：**有一条可靠的非幻觉初稿路径**，靠渲染权威的、人工策展的结构化数据，而不是生成像素。

### 3.1 授权图标库——能不能当商用拼装建材？

**能，但许可证必须做成「每资产一字段」，而不是「每来源一标记」**，因为下面几家内部混用多种许可证。以下 8 个来源里，**5 个真正安全**（CC0/CC-BY/公有领域，允许商用再分发），3 个**不是干净建材**。

> ⚠️ **法律风险前置声明（必读，此为本节最重要的一条）**：下表的「许可证」列**源自本次调研，其中数条是 source-level 的 medium-confidence 判断**（已在「证据强度」列标注），**不等于逐资产已核实**。特别是任何「免署名 / 公有领域 / 商用无限制」的结论，一旦某个具体资产实为 CC-BY 或带限制，就是精确的侵权出口。因此：**每资产的许可证字段必须由入库时逐资产法务复核落定，不得沿用本调研的来源级 confidence**；§6.2③ 的「自动署名面板」只有建立在**已复核**的分类之上才降低风险，否则是在错误分类之上做自动化，反而放大风险。**下列所有「免署名」建议一律收敛为「需法务确认后方可免署名」。**

| 来源 | 许可证 | 规模 | 判定 | 证据强度 |
|---|---|---|---|---|
| **Servier Medical Art (SMART)** | CC BY 4.0（旧 Wikimedia 镜像仍标 3.0） | ~3,000+ SVG | ✅ **安全**，署名即可商用 | high（官网逐字：「All SMART images are licensed under CC BY 4.0」） |
| **bioicons** | 每图各自：CC0 / CC-BY / CC-BY-SA / MIT | ~2,800+ SVG | ✅ **安全**（须逐图守约） | high。CC0 子集**需法务确认后**可作免署名建材 |
| **DBCLS Togo Picture Gallery** | CC BY 4.0 | ~1,000+（未官方公布，**总数 medium**） | ✅ **安全**，署名 | medium。署名串 `© 2016 DBCLS TogoTV / CC-BY-4.0`（署名串本身 medium，入库须复核） |
| **Reactome Icon Library** | CC BY 4.0（署名 CSHL/OICR/EBI） | 1,150+（2018 数据，现更多） | ✅ **安全**，署名 | high。**注意与 Reactome 通路数据（CC0）区分，见 §3.2** |
| **NIH BioArt Source** | 混合：多为公有领域(US-Gov)，部分 CC-BY | 2,000+ | ✅ **安全**（须逐资产读标记） | 来源 high，但**「公有领域子集免署名商用」这条对付费产品的适用性收敛为「需法务确认」**——政府源条款有边界，不得据来源级判断直接做 attribution-free 出口 |
| **Mind the Graph** | 免费层 CC BY-SA 4.0 + 强制水印+引用；所有权仅付费订阅 | 75k+（平台锁定） | ⚠️ **受限**，平台锁定 + SA 病毒式 | medium。资产锁在编辑器内，不可抽取 |
| **Motifolio** | 专有付费 PPT 工具包，禁再授权/转让 | — | ❌ **不可**嵌入 | medium。Motifolio Inc. 持 IP，无书面同意不得转让 |
| **Noun Project** | 每图 CC-BY（须署名）或付费 RF | — | ⚠️ **受限** | high。无批量开放许可；若要用，作为购买 team RF 的链接/API 源，别拷进自有库 |

**给 Scholar 的落地建材建议（confidence: high，除许可证判定须法务复核外）**：
1. **种子库**用五个开放源：Servier、Reactome Icon、Togo（均 CC BY 4.0）、bioicons 的 CC0/CC-BY/MIT、NIH BioArt 的公有领域+CC-BY。
2. **每资产存**：许可证 id、必需署名串、来源 DOI/URL、**以及一个「法务复核状态」标记**；渲染一个**自动生成的署名/致谢面板**，让每个用到的 CC-BY 资产都带引用——这是 CC-BY 的硬要求，非可选。**未过法务复核的资产不得进入生成/导出管线。**
3. **CC-BY-SA 资产从产出专有/衍生交付物的管线中排除**（或隔离）——share-alike 是病毒式的，会强制你把输出也开放许可。bioicons 的许可证过滤让这在入库时就能强制执行。
4. 用户面（署名 UI 会打扰）的地方，优先用**经法务确认可免署名的** CC0（bioicons）和公有领域（NIH BioArt）子集。

### 3.2 确定性数据源——绕开幻觉给可靠初稿

思路和 Scholar 现有的 minicod（文献真源）完全同构：**新建一个后端工具/服务，agent 只负责选一个标识符/部件+视角，后端渲染权威图**，模型永远不发明数字/坐标/结构。**注意这些数据源全部走后端 HTTP client 调用（与 agent 断内网隔离不冲突，正因为不在 agent 容器内发起）**。

**（A）通路/机制图（confidence: high）**
- **Reactome** ✅ 开放，首选：REST diagram exporter，`GET https://reactome.org/ContentService/exporter/diagram/{stId}.{svg|png|jpeg|gif}`（`quality=1-10`、`sel=` 高亮反应、`flg=` 标记实体）。布局是**预计算**存在源 JSON 里，非导出时生成，故可复现、非生成式——理想的非幻觉种子。原生 SBGN-ML 导出。
  - ⚠️ **落地形态澄清（勿写成「开放自托管」）**：现实是二选一——(a) **后端 HTTP client 调 reactome.org 公共 API**（镜像 minicod 模式，egress 从后端而非隔离 agent，可行，但**有可用性 / 限速依赖**，须做失败兜底与缓存）；(b) **按需真自托管 Reactome**（重型全栈部署，非小工程）。默认走 (a)，把它当外部依赖对待。
  - ⚠️ **许可证区分（needs 法务确认）**：Reactome **通路数据本体标 CC0**，而 **Reactome Icon Library 标 CC BY 4.0**——两者不同。diagram exporter 导出的通路图若归属主库 CC0，则**可能免署名**（比署名假设更宽松）；但导出 SVG 的确切许可归属须上线前确认，避免多做无谓署名或漏做该做的署名。
- **WikiPathways** ✅ 开放：GPML（带坐标 XML）+ 现成分物种 SVG 集 + 经 PathVisio 的 SBGN 导出；CC0/CC-BY。程序化经 rWikiPathways/pywikipathways/JSON API。
- **KEGG** ⚠️ **避免（除非购买许可）**：策展最好，但 KGML 与渲染 API **仅学术**，任何商用/非学术用途需**付费 KEGG 许可**——对付费产品是真实阻断。API 还限速 ~3 req/s。
- **SBGN-ML** 是连接标准：正式记法（PD/ER/AF 三子语言）+ 携带布局几何的 XML 交换格式，配 Newt/Cytoscape.js、libsbgn.js、cd2sbgnml、SBGN-ED 等**开源渲染器**，可跨库确定性重排/重绘。

**（B）3D 解剖（confidence: high）**
- **BodyParts3D**：FMA 本体命名的真实器官网格（OBJ/STL），权威源几何，非生成解剖。
- **Anatomography**：其渲染器支持**确定性 web API**——`http://lifesciencedb.jp/bp3d/API/{image|animation|focus|pick|map}?...`，参数 `PartID`/`PartColor`/`PartOpacity`/`CameraMode`(front/back/left/right/top/bottom/free)/`Zoom`(0-19.8)/`CameraX/Y/Z`。特定部件的特定视角可从 URL 复现，零生成。
- ⚠️ **许可证门（needs 法务确认）**：BodyParts3D/Anatomography 是 **CC-BY-SA 2.1 Japan**——须署名串 `BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan` **且 ShareAlike**（衍生图可能继承 SA 义务，对付费导出有病毒性，**上线前需法务审查**）。

**（C）分子/蛋白（confidence: high）**
- **2D 小分子**：**RDKit**（BSD）已确认——SMILES→SVG 经 `MolDraw2DSVG` + `Compute2DCoords`，规范、确定性。与总报告一致。
- **3D**：三个引擎都能 headless + 容器内脚本驱动（**容器化路径见 §6.4 P1，非平凡工程**）：
  - **Mol\*** ✅ **最佳架构契合**（MIT，web-native）：同一引擎既能 headless 渲染确定性图（`molrender` / `pdb-images`，后者是 PDBe/wwPDB 用来生成整个 PDB 归档图像的工具，headless Node+WebGL，PDB 归档规模验证），又能嵌进 React/Vite SPA（`molstar-react`/`PluginContext`）。直接读 PDB/AlphaFold mmCIF/BCIF。
  - **PyMOL**（BSD-like）：`pymol -cq` 光追 PNG，300-600 DPI 出版金标准；但重型桌面二进制、仅 PNG、不可 web 嵌入——当**批量图渲染器**用，非交互查看器。已有 MCP server（pymol-mcp/MOLAI/ChatMol）证明可 LLM 驱动。
  - **ChimeraX**：`--offscreen --nogui --script --exit`（OSMesa 软渲染），但 **offscreen 仅 Linux + 无 GPU**（慢），第三选择。
- AlphaFold DB 供 mmCIF/PDB（AlphaFold3 仅 mmCIF），RCSB/PDBe 供 mmCIF/BCIF，三引擎全读。

**（D）临床/统计图（confidence: high）**——对应 §二子类 4，最高 ROI 的 (c) 落点：
- 生存曲线（KM）、森林图（meta 分析）、ROC、漏斗图、以及 ECG/EEG/流式细胞等波形，全部从真实效应量/CI/事件数/信号序列**确定性渲染**，用成熟统计绘图库（R 的 survminer/forestplot/pROC/meta，或 Python matplotlib/lifelines/scikit-learn 出的曲线）。这条**天然复用 Scholar 已有的「数据图→代码执行」能力**，无需新上游，只需把「医学统计图模板」纳入代码执行车道。模型**只选数据列与参数，绝不发明数字**。

**结论**：Reactome + WikiPathways（通路/机制）+ BodyParts3D/Anatomography（解剖）+ RDKit/Mol\*（分子）+ 统计绘图库（临床/统计图），经 SBGN-ML 串联，给出一条**可信初稿管线，LLM 只选标识符/数据列，像素来自策展数据或真实数字**——完全契合项目「确定性、非幻觉」的既定气质，镜像现有的 minicod-as-源真理模式。

---

## 四、医学专项合规红线（逐字引用）

以下引用为已核实的官方页面逐字（confidence: high，除标注外）。**合规部分优先逐字，拿不准的不硬下定论。**

**Elsevier**（三分类框架，官网逐字，high）：
> 「AI tools must not be used to create or alter images that represent primary observed or experimental data that were not directly obtained in the research」，举例「microscopy, histology, western blots, radiology scans, or patient images」，且「includes adjustments to brightness, contrast, or color balance, which should only be done using established image processing software.」

允许的一档（逐字）：
> 「Authors may use AI tools to support the creation of certain types of explanatory images for publication, such as flow charts, decision trees, timelines, schematic conceptual illustrations, or experimental workflow diagrams」，须在「the caption of each image (including the specific tool, version, and how the tool was used)」披露。

图形摘要（逐字）：
> 「General-purpose generative AI image tools must not be used to create graphical abstracts.」

**ICMJE**（官方页逐字，high）：
> 「Authors should be able to assert that there is no plagiarism in their paper, including in text and images produced by the AI」；AI「should not be listed as authors because they cannot be responsible for the accuracy, integrity, and originality of the work」；「Nondisclosure of AI use may require corrective action and may be construed as misconduct in some circumstances.」

ICMJE 患者去标识（官方页逐字，high）——**与医学图直接相关**：
> 「Identifying information, including names, initials, or hospital numbers, should not be published in written descriptions, photographs, or pedigrees unless the information is essential for scientific purposes and the patient (or parent or guardian) gives written informed consent」；「masking the eye region in photographs of patients is inadequate protection of anonymity」；同意「should be written and archived.」

**Springer Nature / Nature**（官网逐字，high）：生成式 AI 图像通盖禁令，覆盖「video and animation... photography; illustration such as scientific diagrams, photo-illustrations and other collages, and editorial illustrations.」不受限的只有「tables, flow charts and other simple graphs that do not contain images」和「text-based and numerical display items.」窄例外（AI-about-AI 逐案；以及「AI tools developed with specific sets of underlying scientific data that can be attributed, checked and verified for accuracy」）须 caption 披露。适用 3,000+ 期刊含 Nature Medicine。

**以下为 medium（经二手汇总/搜索片段，官方页在直接抓取时 403 或未逐字复抓，标注「未充分逐字证实」）**：
- **NEJM**：AI 生成图像不允许；标准图像完整性条款——「no specific feature in an image has been enhanced, obscured, moved, removed, or introduced...」（该措辞是跨出版社标准条款；NEJM 主页 403，内容来自二手汇总，**未充分逐字证实**）。
- **The Lancet**：Lancet 家族禁 AI 生成图/插画，AI 仅限语言润色且须 Methods 披露（二手汇总，**未充分逐字证实**）；Lancet Global Health 社论更进一步呼吁停止健康科学中的 AI 图像。
- **JAMA Network**：AI 生成图像不允许（此点来自二手汇总，**未充分逐字证实**）；但患者图规则为官网逐字（high）：「Omitting data or making data less specific to deidentify patients is acceptable, but changing any such data is not acceptable.」
- **RSNA/Radiology**：AI 创建图像被劝阻、无完整模型披露则不允许；去标识为官网逐字（「No patient names, hospital ID numbers... should appear in images」），AI-创建-图像那句来自 RSNA AI 期刊作者须知搜索结果，**未逐字复抓主 Radiology 页**（medium）。

**贯穿性 (d) 地板线（high）**：原始研究影像是一手证据——期刊要求提交**未处理原始** gel/blot（发在补充材料）；亮度/对比/色彩调整须整图应用并披露；非相邻泳道拼接须用工具线/间隙标记否则不允许。合成或静默编辑此类图 = 造假（COPE/ORI misconduct）。适用显微、组织学、病理、放射、凝胶和 blot。

---

## 五、竞品与护城河（BioRender 等）

**BioRender 是生命科学图的事实标准**（2017 创立，~$900M 估值，盈利，4M+ 用户）。其护城河**不是软件**，而是：

1. **手工策展、PhD 同行评审的资产库**：50,000+ 科学准确图标 + 1,000+ 模板，30+ 领域，经 9 步「研究→草图→同行评审→PhD 验证」管线，每个图标要「数周」。真正的壁垒是**稀缺人才池**——北美仅 ~5 个 CAAHEP 认证医学插画研究生项目，<100 毕业生/年。这是竞品无法快速买到的（confidence: high）。
2. **引用/署名锁定**：每张发表图必须带「Created with BioRender.com」或唯一 figure-URL/DOI，500,000+ 期刊引用把用户变成营销者，成为共享「生物学视觉语言」（high）。
3. **网络效应 QA**：4M 用户报错，插画师修正。
4. **出版社信任**：Nature/Science/Cell/BMJ 接受，有 CC-BY 4.0 发表许可流程。
5. **分发护城河**：2025 年 10 月经 MCP 接入 Anthropic 的 Claude for Life Sciences，被定位为 OpenAI「准确科学视觉的可信来源」——**别的 AI 调它，而非与它竞争**（high）。

**其 AI 特性是刻意「库约束式」**，非自由生成：Generate Protocol/Timeline/Flowchart 输出**完全可编辑**的、由已审图标拼成的图；声明不拿用户内容训练模型（SOC 2）。

**BioRender 自己的告诫是战略资产**（官网逐字，high）：AI 输出是「strong starting points」需审查；「most major journals restrict or prohibit fully AI-generated scientific figures」；NIH 禁止在经费申请中用 AI 生成图；AI 不得捏造/篡改数据；须披露。

**弱点两个**：
- **库天花板**（competitor 视角，medium）：BioRender 被它已画过的东西界定，「if your mechanism isn't already an icon, you compose it from approximations or wait」——纯生成竞品（SciFig、Natomy、PaperBanana）攻击的正是这个新颖/小众机制盲点。
- **定价 + 惩罚性免费层**：~$35/mo 学术个人、$95/mo 工业；免费层带水印、限分辨率、禁发表/商用（medium）。

**其余生成式创业公司**（FigureLabs、SciFig.ai、Natomy、Medical Illustration AI、ConceptViz、MediVision）几乎全是**通用第三方图像模型的薄封装**（Google Nano Banana/Gemini image、OpenAI GPT Image）+ 可编辑矢量画布——**没有一家提供了定制医学训练模型、解剖验证数据集或准确性基准的证据**（confidence: high，此为「未见证据」的诚实陈述）。唯一找到的独立评测（Labcritics）把 FigureLabs 描述为「a custom wrapper around Gemini's NanoBanana」，缺预绘科学结构库，削弱其自称「世界首个全 AI 驱动」（BioRender、Mind the Graph 的 AI 更早）。**厂商声明须与独立证据分开**：上述能力大多是厂商自家网站营销，非独立核实。合规上，每个严肃医学工具都免责并推人工审查（ConceptViz:「not a substitute for a professional medical illustrator or a verified anatomical reference」；Medical Illustration AI:「final human review before use」；SciFig:「AI gets you 99% there. You handle the final 1%」）；无一声称 FDA/临床合规；Natomy 声称加密但**无明确 HIPAA 合规**（上传真实临床照存在未解决的 PHI 处理风险）。

> 值得注意：已有学术检测文献在涌现（SciFigDetect 基准 arxiv 2604.08211、「Can AI Draw Science?」arxiv 2606.28406 等）——但这些**仅来自搜索标题/摘要，未直接抓取，confidence: low，未充分证实**。信号是：评审方/出版社正在造工具来标记这些输出。

---

## 六、Scholar 落地建议与分期取舍

### 6.1 核心架构：医学图路由器（两输入、四车道、一硬地板）

与已定架构一致——「按图类型分派渲染器」自然延伸为一个**医学子路由器**，输入 =（1）子类分类 +（2）目标期刊/用途，分派到四车道：

- **(d) 硬闸（非可覆盖，入口拒绝）**：任何会合成或编辑原始组织学/病理/放射/显微/凝胶blot 的请求，在**入口**就拒绝，弹出说明「这些是一手证据，须提交未处理原图，且常含 PHI」。**这就是总报告「原始医学影像禁止生成或修改」红线的医学落地实现。**
- **(c) 确定性车道**：CONSORT/PRISMA/患者流 → mermaid/Graphviz 或官方 CONSORT-2025/PRISMA 生成器，绑定真实计数；**临床/统计图（KM/森林/ROC/漏斗/波形）→ 复用「数据图→代码执行」的统计绘图库，绑真实效应量/CI/事件数**；蛋白/结构 → Mol\*/PyMOL/ChimeraX 从 PDB/AlphaFold 坐标；小分子 → RDKit/SMILES；器械示意 → diagram-as-code。**永不让生成模型发明数字/坐标/结构。** 这条车道**复用 Scholar 已有的确定性执行能力**（数据图→代码执行、TikZ 复用 prism_tex 沙箱、分子→RDKit），是投入产出比最高的部分。
- **(b) 授权拼装车道**：解剖、MoA/信号/通路、手术插画、**含解剖结构的患教图**、以及**图形摘要** → 授权同行评审图标库（§3.1 的五个开放源）或专业插画师。这是任何断言解剖/机制准确性的默认。
- **(a) 生成车道（按本报告自身逻辑最脆弱的车道，默认关）**：**仅**保留给**纯示意 / 非解剖**的患教内容（图标风格流程、依从性/生活方式示意）和粗略非临床概念，且总是带非诊断免责声明 + 溯源/披露元数据。**凡含真实解剖结构一律不走 (a)，下推 (b)**——因为 (a) 唯一护栏「专家事后签字」正是 §1 判定不可靠的那道人工闸，而证据表明生成模型连患教级解剖都画不对。**与已定架构「图像直出默认不启用」一致**——(a) 是唯一可选开启的窄口，且默认仍应关。
- **期刊门控**：目标是 Nature Portfolio/Science/Cell 时，**整体关闭生成车道**，路由到 (b)/(c)。
- **在生成时强制，而非评审时**——Frontiers 撤稿证明下游抓错不可靠。

### 6.2 三件必答事的直接结论

**① 授权图标库是可行建材吗？——是，但许可证须逐资产法务复核兜底。** 用 §3.1 五个开放源（Servier/Reactome Icon/Togo/bioicons CC0-CC-BY-MIT/NIH BioArt 公有+CC-BY），许可证做成**每资产一字段 + 法务复核状态标记**，自动署名面板，CC-BY-SA 隔离出付费导出管线。**关键警示**：不得沿用本调研的来源级 confidence 直接落「免署名/商用」结论——尤其 NIH BioArt 公有领域免署名、Reactome 导出 SVG 归属 CC0——这些均**收敛为「需法务确认」**。这让 (b) 车道真正可落地，而不必自建 BioRender 那种 50k 图标库。

**② 确定性数据源能绕开幻觉吗？——能，且这是 Scholar 最该重投的地方。** Reactome+WikiPathways（通路）、BodyParts3D/Anatomography（解剖）、RDKit/Mol\*（分子）、统计绘图库（临床/统计图）都是「LLM 只选标识符/数据列、后端渲染权威图」的模式，与 minicod 同构。**避开 KEGG**（商用许可阻断），**BodyParts3D 的 CC-BY-SA 上线付费导出前需法务审查**，**Reactome 走后端公共 API（有可用性/限速依赖）而非「自托管」**。

**③ 红线如何硬闸？** (d) 在**入口分类阶段**拒绝，不进任何生成/编辑管线；且叠加 **PHI 去标识 linter**（剥 DICOM/EXIF 元数据 + 图上 PHI 文本 + 绝不依赖遮眼，ICMJE 称遮眼「inadequate」）。另配**图注披露自动生成器**（模型+版本+用法，喂进 caption 和 Methods）和**出版社政策矩阵**（导出时让用户选规则集：Elsevier 三分类 vs Nature/JAMA/NEJM/Lancet 通盖禁 vs RSNA 披露-或-禁）。

### 6.3 该自建、缩小范围自建、还是先不做？——**推荐：缩小范围自建，且明确不与 BioRender 正面硬碰。**

**理由**：

- **不该做全量自建 (a) 生成解剖/手术图**——这是最高风险区，会与 Nature/JAMA/NEJM/Lancet 的通盖禁令正面相撞，且 Frontiers 撤稿证明责任真实存在。与 BioRender 护城河（50k 策展库 + 稀缺持证人才 + 出版社信任 + 引用飞轮）正面较量**不明智**——Scholar 无法在语料/出版社关系上短期追平，纯生成也追不平信任/准确/接受度。
- **该做的缩小范围自建 = (c) 确定性车道 + (b) 开放图标库拼装**。这两条恰好落在 Scholar 已有能力上（代码执行、prism_tex 沙箱、agent 选标识符的 minicod 模式），风险低、可验证、非幻觉，且是 BioRender 的库天花板盲点（新颖/小众机制的确定性渲染）——这是竞品攻击 BioRender 用的同一个楔子。**其中临床/统计图（KM/森林/ROC）比 3D 蛋白更高频、更易落地，是这条车道 ROI 最高的一块。**
- **(a) 生成仅做安全子集**：**纯示意/非解剖**患教 + 粗概念，永远框定为「草稿」，默认不进 manuscript，带披露元数据；含解剖内容一律下推 (b)。
- **杠杆play**：与其重建语料，不如像 Anthropic/OpenAI 那样**把 BioRender（或类似已验证库）当工具消费**（它已出 MCP connector），Scholar 拥有外围的检索/写作/分析工作流。

### 6.4 分期建议

- **P0（先做，低风险高确定性）**：(d) 硬闸 + PHI/去标识 linter + 出版社政策矩阵 + 图注披露自动生成器。这是**合规地基**，任何图功能上线前必须有。
- **P1（确定性车道，ROI 最高）**：
  - **临床/统计图**（KM/森林/ROC/漏斗/波形）→ 复用现有「数据图→代码执行」+ 统计绘图库模板。**这是 P1 里 ROI 最高、最易落地项**（临床论文最高频图，无需新上游）。
  - 通路图（Reactome REST exporter，**后端 HTTP client 调公共 API，minicod 同构，须做可用性/限速兜底与缓存**；或按需自托管）+ 流程图（CONSORT/PRISMA，复用现有 mermaid/Graphviz/TikZ）。
  - 分子：2D 用已有 RDKit；**3D 加 Mol\*，但须明确容器化路径与构建期依赖**——如同母报告处理 matplotlib/texlive，这些 3D 引擎（Mol\* 需 Node+headless WebGL/GL 库；PyMOL/ChimeraX 需 OSMesa 软渲染、ChimeraX offscreen 仅 Linux）是**新的重型运行时依赖，须构建期烧入 `scholar_agent`（或独立渲染 sidecar）**，容器化非平凡，不可一笔带过。建议 P1 内先落 Mol\*（架构最契合），PyMOL 作为可选批量高保真渲染器排后。
  - 全部 agent 选标识符/数据列、后端渲染，非幻觉。
- **P2（授权图标库拼装）**：种子五个开放源，每资产许可证字段 + 法务复核状态 + 署名面板 + CC-BY-SA 隔离；含解剖患教图与图形摘要走此车道；解剖用 BodyParts3D/Anatomography 确定性视角 API（先过 SA 法务）。
- **P3（谨慎）**：(a) 纯示意/非解剖患教生成安全子集，或评估把 BioRender/Mind the Graph 作为外部 MCP 工具接入，而非自建生成。

---

## 七、结论

「医学绘图」是科研绘图里唯一必须被拆开对待的类别，因为它内部横跨从**出版社明令禁止（病理/影像/显微/凝胶原图）**到**最适合生成（纯示意患教）**的全谱系，而把它当一个东西处理必然要么过度保守、要么撞红线。三条高压线——外部硬真值、专业约定护城河、独一档下游责任——决定了 Scholar 的正确姿态不是「更强的生成」，而是**路由 + 确定性 + 硬闸**。

对 Scholar 的净建议：**缩小范围自建**——把工程投入压在 (c) 确定性数据源渲染（**临床/统计图（KM/森林/ROC）是最高 ROI 的落点**，加 Reactome/WikiPathways/BodyParts3D/RDKit/Mol\*，agent 只选标识符/数据列）和 (b) 开放许可图标库拼装（Servier/bioicons/Reactome/Togo/NIH BioArt，许可证做成每资产一字段**且逐资产法务复核**）这两条低风险、可验证、非幻觉、且恰好命中 BioRender 库天花板盲点的车道；把 (a) 生成收缩到**纯示意/非解剖**患教+粗概念的安全子集且默认不进 manuscript（含解剖内容下推 (b)，因为 (a) 唯一护栏正是本报告判定不可靠的那道人工闸）；把 (d) 原始医学影像做成入口即拒的非可覆盖硬闸，叠加 PHI 去标识与出版社政策/披露自动化；图形摘要作为横切格式统一走 (b)、禁通用生成。3D 引擎与 Reactome 均须交代清楚落地形态（3D 构建期烧入容器、Reactome 后端调公共 API 而非「自托管」）。**不与 BioRender 的策展库+出版社信任+引用飞轮正面硬碰**——那条护城河不是靠模型能追平的；若要覆盖它的强项，作为工具消费而非自建生成。合规上以已核实逐字政策（Elsevier「must not be used to create or alter images that represent primary observed or experimental data」、ICMJE「masking the eye region... is inadequate」、Springer Nature 图像通盖禁令）为硬约束，在**生成时**强制、而非指望评审抓错——因为 Frontiers 那张 3 天后被撤的大鼠图已经证明，下游那道人工审查线，靠不住。

---

### 附：主要信源（择要）

- 合规：Elsevier 生成式 AI 政策、ICMJE Recommendations（作者身份/患者去标识）、Springer Nature/Nature AI 图像政策、JAMA/RSNA 去标识条款。
- 图标库：Servier Medical Art（CC BY 4.0）、bioicons、DBCLS Togo、Reactome Icon Library、NIH BioArt。
- 确定性源：Reactome ContentService diagram exporter、WikiPathways（GPML/SBGN）、BodyParts3D/Anatomography（CC-BY-SA 2.1 JP）、RDKit、Mol\*（molrender/pdb-images）、PyMOL、ChimeraX、AlphaFold DB / RCSB / PDBe。
- 证据案例：Frontiers 大鼠图撤稿（2024-02）、DALL·E 3 LASIK 插画对照研究、Stable-Diffusion 组织学 816 人辨别研究、解剖五类失败模式研究。
- 竞品：BioRender（含其 AI 告诫与 MCP connector）、Mind the Graph、SciFig.ai、FigureLabs、Natomy 等。
- confidence: low / 未充分证实：SciFigDetect(2604.08211)、"Can AI Draw Science?"(2606.28406) 等检测文献仅凭搜索标题，未直接抓取。
