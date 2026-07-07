# Pandoc 与智能写作(Scholay Prism)的契合度评估

> 研究问题(owner):pandoc 可以做 md↔latex 转换 — 跟智能写作是否互补,或有更好用的方案?
>
> 方法:4 个视角的调研(LaTeX 读取器 / docx 读取器 / AST 映射 / 替代 vs 互补)+ 针对容器内实际 pandoc 3.1.9 的动手验证(含 2 份本机真实中文学术 Word 稿件端到端实验)。所有 "本地实验" 均在 `scholar_backend` 容器(pandoc 3.1.9)与 `scholar_prism_tex`(XeTeX/TeX Live 2022)中复现过。

---

## ① 一句话结论

**互补,不是替代:pandoc 应成为智能写作缺失的「导入前端」(.tex / .docx → DocStruct,一次性、有损但绝不静默丢内容),并继续担任 docx 导出引擎(docx.go 已在用);它绝不能替代 projector.go(期刊符合性靠确定性投影)也绝不能替代 md_bridge.go(agent 编辑环的可逆性契约 pandoc 满足不了)。** 集成面选 `pandoc -t json`(AST),不走 markdown 复用 parseEditorMarkdown(实测 5 处硬性破坏)。没有更好的替代方案:LaTeXML 重(Perl、arXiv 也只有 ~74% 全转)且收益边际;自研 LaTeX parser 违背"任意 LaTeX 忠实转换不可能"的既有铁律。

---

## ② pandoc 与现架构逐层对照

| 层 | 现状 | pandoc 能否替代 | Verdict | 理由 |
|---|---|---|---|---|
| **struct→LaTeX 投影**(projector.go) | 确定性 Go 投影,按期刊模板(article/IEEEtran/elsarticle/llncs)assemble,xeCJK preamble | 否 | **保留,不动** | 期刊符合性是投影层的承重墙:pandoc 的 latex writer 完全不懂 IEEEtran/elsarticle 的作者绑定模型(\IEEEauthorblockN 等),输出无法投期刊。确定性 = 可测试、可回归。 |
| **agent 编辑桥**(md_bridge.go) | 手写受限 GFM,structToEditorMarkdown ↔ parseEditorMarkdown 构造性可逆 | 否 | **保留,不动** | 可逆性是硬约束(round-trip 不得损坏)。pandoc round-trip 每一遍都会归一化/重排/重编号(实测非幂等),无法满足该契约。 |
| **docx 导出**(docx.go) | struct→clean md(+YAML/$math$/[@cite])→pandoc→docx + citeproc | 已在用 | **保留** | 已验证工作良好,是"pandoc 在容器内 exec"模式的既有先例,导入方向可直接复用该模式。 |
| **导入缺口**(.tex / .docx → struct) | **无**。legacy raw-LaTeX 克隆 = 整个正文塞进一个 opaque 块;不支持 .tex/.docx 上传 | **是 —— pandoc 填这个空** | **新建,pandoc 承担** | pandoc reader 覆盖的块词汇与 DocStruct 精确重合(heading/para/list/table/figure/math/cite);`+raw_tex` 的 RawBlock 与 DocStruct 的 opaque 逃生舱是天然一对;导出方向的确定性投影本来就不可逆,导入必须另找引擎 —— 这正是 pandoc 的位置。 |
| **前端 Tiptap 编辑层** | struct↔tiptap 可逆转换(lib/struct-tiptap.ts) | 否 | **不涉及** | 导入产物就是 struct,前端零改动即可渲染/编辑。 |
| **其他导出**(HTML/EPUB/RTF) | 无 | 能(一个 flag) | **暂不做** | 实测同一条 docx 管线换 `-t html/epub/rtf` 全通(citeproc 保留),但产品价值低:Tiptap 已原生渲染、PDF 归 prism_tex、协作归 docx。若日后做论文分享页/SEO 再启用,记得 HTML/EPUB 加 `--mathml`(否则复杂公式以原始 TeX 文本落地)。 |

核心格局:**导出方向 = 确定性 Go 代码(不可协商);导入方向 = pandoc AST + Go 映射器 + opaque 兜底(新建)。** 两个方向刻意不对称、不共享代码。

---

## ③ pandoc LaTeX 读取器:真实能力边界(基于容器内 3.1.9 实测)

### 能力(全部本地验证,置信度高)

- **块级词汇与 DocStruct 精确重合**:\section/\subsection→Header(带 \label id);itemize/enumerate→列表;tabular+table→Table AST(booktabs 处理,含 caption 和 #tab: id);figure+\includegraphics+\caption→Figure(含 width 属性);$...$/equation/align/cases→Math(align→aligned,\label 保留在 latex 串内);verbatim/lstlisting→CodeBlock;footnote/\url/\href/CJK 文本全部干净解析。
- **引用覆盖极佳**:\cite、natbib \citep/\citet(含前后缀 `\citep[see][p.~5]{k}` 和多 key)、biblatex \parencite/\textcite 全部产出带 citationId/Mode/prefix/suffix 的类型化 Cite 节点,原始命令另存为 RawInline 兜底;\bibliography{refs} 落进 meta.bibliography → 可自动在上传 zip 里定位 .bib。与 DocStruct 的 cite(key) + bibliography map 一一对应。
- **宏展开(latex_macros 默认开)**:preamble 里的 \newcommand/\renewcommand/\def 在正文、数学、标题、摘要里全部展开(实测 \norm{x}→\lVert x\rVert、\ourmethod{}→ProbeNet)。**导入后的数学 latex 已无用户宏**,消除了"导入后宏未定义"的整类问题。\usepackage 提供的命令不展开(正确地留成 RawInline→opaque,保守且对)。
- **简单 \def 链也正常展开**(实测 \def\a{\b}\def\b{world} → "world")。

### 两种读取模式,损耗方向相反(关键决策点)

| | 默认模式(`-f latex`) | **`-f latex+raw_tex`(必选)** |
|---|---|---|
| 未知命令 | **连同花括号参数一起静默删除,stderr 0 字节**(实测 \unknowncmd{argument text} 整体蒸发)——最大静默丢数据通道 | 保留为 RawInline,字节级原样 |
| 未知环境 | 变 Div(内容仍解析) | 保留为 RawBlock,字节级原样 → **直接映射 opaque** |
| tikzpicture | **静默删除**(只剩空 figure + caption,无警告) | 原样 RawBlock(即使嵌在 figure 里,caption 照常解析) |
| algorithm/algorithmic | 结构性破坏(\STATE/\FOR 关键字丢失,FOR 循环条件整体消失) | 原样 RawBlock |
| \input/\include | 自动内联;文件缺失只 WARNING + exit 0(内容静默缺席) | **不再展开**(留原样)→ 必须 Go 侧先递归内联 |
| \ref/\eqref | 变 Link(带 reference-type 属性,节号已解析) | 变 RawInline(原始 \ref{} 保留) |

**结论:`+raw_tex` 是强制项** —— 静默丢内容违反产品"绝不损坏"承诺;RawBlock→opaque 恰好是 DocStruct 的逃生舱语义。代价(\input 不展开、\ref 变 raw)全部可在 Go 侧兜住。

### 硬失败模式(必须兜底)

- **无错误恢复**:任何解析不了的构造让**整篇转换**以 exit 64 中止(实测 3.1.9 嵌套 tabular 即触发)。导入管线必须 wrap:exit≠0 → 回落到今天的整体单 opaque 克隆,**导入永不硬失败**。
- **catcode 技巧类病态 preamble 会静默错解成垃圾而非升级到 raw**(实测)→ 导入向导必须展示预览,且上传原文件永久附在项目上作为恢复源。

### 3.1.9 的静默丢失陷阱清单(双栏期刊高频踩)

- **figure\*/table\***:figure\* 变 Div,caption+label 静默丢(3.6.1 修复,#10472);**table\* 到 3.10 仍未注册**进 table 环境列表 —— caption 静默丢,永远需要 Go 侧预处理(如 table\*→table 文本替换)或路由 opaque。
- **\Cref(大写)静默删除**(\cref 正常;3.1.12 修复)。
- \multirow 部分支持且有 bug(#6596/#6603/#6681);\multicolumn 在 AST 里是真 ColSpan(json 保留,markdown 拍扁)。
- wrapfigure → RawBlock(opaque,符合预期);**subfigure 例外:3.1.9 原生解析成嵌套 Figure 节点而非 RawBlock** —— 导入映射器必须显式处理嵌套 Figure(拆成多个 figure 块或合并 caption),否则撞上计划外 AST 形状。
- 前置区:\title/abstract 进 meta(已宏展开)且正常;**IEEEtran \IEEEauthorblockN 作者名静默丢空、elsarticle 的 \corref/\ead/affiliation 全丢** → 作者/机构必须 Go 侧类特定预抽取 + 导入向导确认表单(与现有设计一致:authors 本来就不走 agent md)。
- preamble 只读宏和元数据:\graphicspath、documentclass 选项、geometry 全丢弃 → 图片路径解析需 Go 侧自做(投影层本来就自持 preamble,无碍)。

### 版本结论

容器内 3.1.9(2023-11)已落后约 2.5 年。**建议升级到 ≥3.10**:3.4 修嵌套 tabular(消掉我们最可能的 exit 64)、3.6.1 修 figure\*、3.1.12 修 \Cref、3.8 数学环境大修、3.10 表格 \label 直接落 Table 属性。升级低风险:静态二进制,JSON AST api 版本整个 3.x 都停在 pandoc-types 1.23.x。防御:导入器校验 `pandoc-api-version[0:2]==[1,23]`,不符则回落整体 opaque。

---

## ④ docx 读取器能力(重点:OMML 数学)——含两份真实中文稿件实测

用本机两份真实稿件(心理学 Word 硕士论文 6.2MB、WPS 金融短文)端到端验证:

### OMML 数学 = 本功能的最大惊喜(真实可用)

- **Word 原生公式(插入→公式,Word 2007+ 的 m:oMath)→ LaTeX 转换质量高**:真实论文 3/3 公式完美(含堆叠分式 `\frac{RT}{1-PE}=\frac{RT}{PC}`、中文下标 `Z_{击中}`);合成回环确认分式/根式/矩阵/上下标/\mathbb/\sum/\int 带限全存活。已知降级:cases/aligned→matrix(渲染等价,语义丢);texmath 有零星空格 bug(#10198)。
- **MathType/OLE 公式永远不转 LaTeX**(源码级确认:w:object 分支只出 Drawing 图片)。MathType 在国内长期是事实标准(WPS 样本连 MTDisplayEquation 样式都带)→ **导入器必须预扫 `m:oMath` vs `w:object` 计数并向用户明示**"X 个公式将以图片导入"。
- **CJK-in-math 陷阱(已在 prism_tex 实测)**:pandoc 输出 `Z_{击中}` 原样 Unicode 进数学模式;xelatex **exit 0 且出 PDF,但 CJK 字形静默丢失**(log 里只有 "Missing character",PDF 里下标空白)—— 比"编译失败"更糟,用户拿到"成功"的残缺 PDF。**必须做后处理**:数学串内 CJK 连续段包 `\text{...}`(依赖 amsmath;4 个模板 manifest 均含 amsmath,安全)。若后处理延期,编译 log grep "Missing character" 是唯一检测信号。

### 标题识别(机制级结论)

- 机制:**只认段落样式 w:name 匹配字面 "heading N"**(含 basedOn 链;styleId 仅兜底;**w:outlineLvl 完全被忽略**)。
- 好消息:中文 Word 和 WPS 的内建标题样式在 styles.xml 里都存**英文名** "heading 1..9"(与 UI 语言无关)→ 用模板样式的稿件转换率高(论文 73/77=94.8%,丢的 4 个恰是自定义样式"二级标题0",可经 `-f docx+styles` 的 custom-style 属性映射回收)。
- **坏消息(验证阶段证伪了乐观估计)**:WPS 短文只回收 11/31=35% —— 65% 的标题是**直接段落格式 w:outlineLvl**(16 个无样式 + 4 个 List Paragraph+outl),pandoc 不可见、+styles 也救不了、且不加粗(编号正则若只扫粗体段也漏)。**修正后的方案**:(1) 恢复 pass 用 `^\d+(\.\d+)*[ 　]` 编号正则扫**所有**扁平段落;(2) 要高保真就 Go 侧直接读 document.xml 的 w:outlineLvl(便宜的 XML pass),不依赖 pandoc。

### 其他

- **表格**:合并单元格是中文学术表的常态(一篇论文 206 个 vMerge + 32 个 gridSpan/20 张表);AST 保留 colspan/rowspan,但 DocStruct 是 [][]string → 拍扁(span 位补空串保持矩形)或合并重的整表路由 opaque。
- **图片**:--extract-media 干净(尺寸/标题保留),但真实稿件含 EMF/TIFF(18 张里 4 张 =22%)→ 需转换步骤(imagemagick/libreoffice→PNG)再入 MinIO 资产。
- **引用**:`-f docx+citations` 对 Zotero/Mendeley/EndNote 域代码解析极佳(→[@key] + 完整 BibTeX,与 DocStruct bibliography 一一对应)——但**两份真实稿件域代码均为 0**:国内主流是纯文本 GB/T 参考文献段落 → 需要后处理(agent/LLM 或 GB/T 7714 解析器)把文献段转 BibTeX + 正文 "[1]" 映射 cite key。预检信号:`grep -c ADDIN document.xml`。
- **修订**:--track-changes accept/reject/all 全部如文档工作;检测到 w:ins/w:del 时应在向导里让用户选,默认 accept。
- **3.1.9 已知丢失**:文本框基本蒸发(论文里 24 框流程图只活 1 条;3.9.0.1 才修)、图表/SmartArt→占位符、页眉页脚不读、**TOC 域变垃圾链接段落(必须按 "toc N" 样式 + #_Toc 锚点剥除)**。→ 又一条升级 ≥3.10 的理由(还带来 Better BibTeX 可读 cite key、表列宽等修复)。
- **元数据**:docx reader 只认 Title/Author **段落样式**,忽略 docProps/core.xml → Go 侧 ~40 行直接读 core.xml(dc:title/dc:creator/cp:keywords)+ 正文启发式(首个 H1/短独立段→标题候选;"Abstract/摘要" 与首标题之间→摘要),进向导确认而非静默应用。

**现实预期**:pandoc 交付的是**干净、语义类型化的骨架**给后处理,不是成品 DocStruct。用模板样式的稿件标题 90-100%、正文/行内格式 ~100%、Word 原生公式 ~100% 可用 LaTeX;裸格式稿件靠编号正则 + outlineLvl 直读兜。

---

## ⑤ 推荐落地路线(按 ROI 排序)

### 先拍板:Go 集成面 = `pandoc -t json`(AST),明确否决 markdown→parseEditorMarkdown

**选择:subprocess `pandoc -f latex+raw_tex -t json` / `pandoc -f docx+citations+styles --extract-media -t json`,Go 手写 AST 解码器(tagged union {"t","c"},json.RawMessage + 约 15 块 / 15 行内 tag 的 switch),锁 pandoc-api-version [1,23]。**

理由(每条都实测过):
1. **markdown 路线不安全,5 处硬破坏**:pandoc 写斜体用 `*x*` 而 parseInlines 只认 `_x_`(星号泄漏成文字);pandoc 出空格对齐表非 GFM 管道表(表格降级成乱段落);figure 输出成原始 HTML `<figure>`(方言不认);display math 输出 `$$\label{...}` 开行带内容(我们要求裸 `$$` 行,公式被吞进段落);raw latex 变反引号 `{=latex}` span(变成字面反引号文本)。md_bridge 的受限方言是**为自己的 writer 设计的序列化格式**,不是通用 md parser —— 喂别家方言会静默坏。
2. **JSON 严格占优**:保留 ColSpan/RowSpan、Figure 属性/id、Div class、Citation mode/prefix/suffix、宽度、显式 RawBlock/RawInline 标签 —— markdown 全拍扁。
3. 版本面稳定:pandoc-types 1.23.x 贯穿整个 3.x;不符就回落整体 opaque,永不错误解析。

### R0 — 升级 pandoc 3.1.9 → ≥3.10(半天,先做)

apk/静态二进制替换 + 现有 docx 导出回归。消掉嵌套 tabular exit 64、figure\*、\Cref、docx 文本框/TOC 等一整片 3.1.9 陷阱。低风险(JSON API 不变)。

### R1 — .tex 导入(直接消灭 legacy 单 opaque 克隆痛点)

管线:**(1)** Go 递归内联 \input/\include(+raw_tex 下 pandoc 自己不展开);**(2)** `pandoc -f latex+raw_tex -t json`;**(3)** Go walker:Header→heading(层级 clamp 1-4,行内拍扁成 Text)、Para→paragraph(独子 DisplayMath 提升为 displayMath 块并把 \label 提到 Block.Label、独子 Image 提升 figure)、列表→list(嵌套子列表提升为兄弟块)、Table→拍扁 rows(span 位补空串)或整表 opaque、Figure→figure(zip 内二进制走既有 UploadAsset 路径;**显式处理 subfigure 的嵌套 Figure**)、Cite→cite(key)(多 key 拆相邻 cite)、RawBlock latex→**忽略清单**(\maketitle/\centering/\vspace 等噪声)后进 opaque;**(4)** **万能兜底**:任何未映射节点包成最小 pandoc JSON 文档再 `pandoc -f json -t latex` 反渲染 → opaque(同一个二进制、确定性、零手写 LaTeX 序列化器,保证**只降级不丢失**);**(5)** meta 需要默认模式第二遍(便宜)拿 title/abstract/bibliography;作者/机构走向导确认表单;**(6)** .bib 用 Go 括号平衡扫描按 key 切**原始 BibTeX** 入库(`-f bibtex -t csljson` 只当校验器 —— 实测它会篡改数据:标题被改大小写、页码 `1--10`→`1-10`);thebibliography 环境 v1 留 opaque 且**置空 Bibliography 防双打印**;**(7)** pandoc exit≠0 → 回落今天的整体 opaque 克隆,导入永不失败;**(8)** 向导必须展示预览 + 原始 .tex 永久附项目。

效果:标准结构(80%)变类型化块可 WYSIWYG,怪异 20% 变**粒度化** opaque 让 agent 逐块蚕食 —— 严格优于现状的"一整块 opaque"。旧结论"任意 LaTeX→结构体 2-54% 成功率"说的是全保真自动转换;**逐块降级 + opaque 兜底恰好绕开该铁律**。

### R2 — .docx 导入(国内用户主流格式,后处理更重)

`pandoc -f docx+citations+styles --extract-media --track-changes=accept -t json` + 后处理五件套:**(a)** TOC/封面剥除("toc N" 样式、#_Toc 锚点);**(b)** 标题恢复三层:heading N 样式(pandoc 原生)→ custom-style 含"标题"映射 → Go 直读 w:outlineLvl + `^\d+(\.\d+)*` 编号正则扫全部扁平段;**(c)** EMF/TIFF→PNG 转换再入资产;**(d)** 纯文本参考文献段 → agent/LLM 转 BibTeX + 正文 [1] 映射(这是 agent 的活,不是导入器的);**(e)** 预扫 m:oMath vs w:object,MathType 数量明示用户。docProps/core.xml 元数据 Go 直读。

### R3 — 小型配套改造(与 R1/R2 并行,均为既有代码小改)

- **CJK-in-math 后处理**:导入(以及投影前)对数学串内 CJK 连续段包 `\text{...}`(否则 xelatex 静默丢字形出"成功"残缺 PDF);过渡期编译 log grep "Missing character" 报警。
- **projector 表格扩展**:tableToLatex 目前无视 Caption/Label(死字段)→ 补 \caption/\label 发射(小改,导入表标题才有归宿)。
- **相邻 cite 合并**:renderInlines 把相邻 cite 聚成 \cite{a,b}(修多 key 拆分的排版小退化)。
- **table\* 预处理**:导入前文本层 table\*→table(3.10 仍不认)。

### DocStruct 模型缺口的 v1 政策(不扩模型,先降级)

\ref/\eqref → 包成行内 math `\ref{sec:x}`(数学模式合法、重编译保活;v2 再加 InlineRef 类型);footnote → 括号内联正文;超链接 → 文字+(URL);underline/strikeout/smallcaps → 拍扁纯文本;行内 RawInline 不可忽略时 → **整段升级 opaque**(丢 WYSIWYG 保保真,绝不静默删)。

---

## ⑥ 风险与不做清单

### 风险(导入 UI 需诚实披露的有损清单)

1. 标题内格式/公式拍扁成纯文本(pandoc 保留了,是 DocStruct 没地方放 —— 日后扩模型可从 AST 无损回收)。
2. 交叉引用冻结或降级(v1 math 包裹 \ref 保活但 Tiptap math 原子里露 raw)。
3. 表格对齐/列宽/合并结构/标题(R3 前)丢失;合并重的表进 opaque。
4. 依赖外部 .sty 宏的文档会大面积升级 opaque(正确但观感一般 —— 文案定调"AI 可继续拆解这些区域")。
5. pandoc 不是 TeX:catcode 类病态输入会**静默错解**而非升级 → 预览 diff + 原文件附项目是不可省略的保险。
6. .docx 侧:MathType 全变图片;文本框/图表/SmartArt 丢或占位;修订默认 accept 会吸收合作者改动(检测后让用户选)。
7. 版本漂移:镜像重建若带新 pandoc,先校验 api-version 再放行,否则回落整体 opaque。

### 明确不做

- **不用 pandoc 替换 projector.go**(期刊符合性)或 **md_bridge.go**(可逆性契约)—— 两条都是产品承重墙。
- **不走 markdown 文本面接导入**(5 处实测破坏,见 ⑤)。
- **不上 LaTeXML**:重 Perl 依赖,arXiv 官方管线也只 ~74% 全转、tikz 同样无解;DocStruct 已有 opaque 逃生舱 + prism_tex 真编译,pandoc(+raw_tex→opaque) 就是正确的性价比点。
- **不自研 LaTeX parser**(违背既有调研铁律)。
- **HTML/EPUB/RTF 导出暂不做**(一个 flag 的事,分享页/SEO 立项时再开;届时 HTML/EPUB 记得 --mathml,RTF 数学天生有损)。
- **v1 不给 DocStruct 加 footnote/hyperlink/inline-ref/inline-opaque 类型** —— 先按降级政策走,等真实导入语料证明需要再扩。
- **不把 thebibliography 环境自动转 BibTeX**(\bibitem 散文→BibTeX 是 agent/LLM 的活,不进导入器)。

---

### 附:证据索引

- LaTeX 读取器全量实验:scratchpad pandoc-lab/paper{,2..6}.tex(IEEEtran/elsarticle 合成稿),`docker exec scholar_backend pandoc ...` 可复现(各 finding 附 testable 命令)。
- docx 真实样本:~/Desktop/AI 审稿人测例/ 两份稿件(Word 论文 + WPS 短文),XML ground truth vs pandoc 输出逐项对账。
- CJK-in-math 编译实验:scholar_prism_tex 内 xelatex 三例对照(raw / \text 包裹 / 纯文本)。
- 代码锚点:backend/internal/prism/{projector.go, md_bridge.go, docx.go, struct_model.go, struct_service.go}。
- 上游:pandoc changelog(3.1.12/3.4/3.6.1/3.8/3.9.0.1/3.10)、jgm/pandoc#4746/#10472/#6596/#10198、arXiv HTML 管线(LaTeXML 统计)。
