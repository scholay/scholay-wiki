---
name: prism-latex-format
description: LaTeX 排版与格式工程规范 —— 公式 / 图表 / 引用 / 交叉引用 / 中文支持 / 转义 / 避免编译错误。在 Prism 里写或改 LaTeX 时遵循,改编译报错时按此定位。
when_to_use: 编辑或生成 LaTeX 涉及公式、图、表、参考文献、交叉引用、中文内容、宏包/导言区,或修复编译报错(带 l.NNN 行号)时
user-invocable: false
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Edit, Write, MultiEdit
---

# LaTeX 排版与格式约束(Prism)

你在 Prism 里直接编辑用户项目 cwd 里的 `.tex`/`.bib`。涉及下列任一情形时,按本规范动手,**保持最小 diff**(Edit 定点替换,不重写整篇,不动 `\documentclass`/导言区除非指令明确要求)。

## 数学
- 行内 `$...$`;行间用 `\[...\]` 或 `equation`/`align`(需编号才用带星号外的环境)。
- 公式引用用 `\eqref{eq:x}`(带括号编号),不要硬写"式(3)"。
- ⚠️ **`$...$` 内含逗号的结构要警惕被外层环境吃掉**:典型坑是 pgfplots `\legend{A, B ($\mu=0.1,\ \sigma=0.2$)}` —— `$...$` 里的逗号被 `\legend` 当条目分隔符,数学模式提前闭合 → `! Extra }, or forgotten $`。修法:把含逗号的条目整体用 `{...}` 包住:`\legend{A, {B ($\mu=0.1,\ \sigma=0.2$)}}`。

## 图 / 表
- `figure`/`table` 里 **`\caption` 在前、`\label` 紧跟其后**(label 必须在 caption 之后才会拿到正确编号)。
- 正文引用一律 `\ref{}`/`\autoref{}`/`\cref{}`,**绝不硬编号**("如图 2 所示" → "如图~\ref{fig:x} 所示")。
- 三线表用 `booktabs`(`\toprule`/`\midrule`/`\bottomrule`),不用竖线和 `\hline` 堆叠。
- 图片 `\includegraphics` 用相对路径(项目内),不要绝对路径。

## 参考文献 / 引用
- 用 `\cite{key}` + `references.bib`(BibTeX)。**绝不编造引用 key**;新增 `\cite{k}` 前先 Read `references.bib` 确认有 `k`,没有就先补 bib 条目(信息不全宁可不加,不要瞎编 DOI/作者/年份)。
- 润色正文时**保留所有 `\cite{}` 的位置**,不要在改写中漏掉或挪走引用。

## 交叉引用
- 每个 `\label` 全局唯一;改动后自查:无 undefined `\ref`(引用了不存在的 label)、无 unreferenced `\label`(定义了没人引)、图表编号无跳号。

## 中文支持(替代旧的前端自动加包)
- 文档含中文 → 在导言区加 `\usepackage[UTF8]{ctex}`(整文最简做法);**编译引擎系统会自动检测中文/ctex 并切到 xelatex,你不用关心也不用尝试编译**。
- 已加载 `ctex`/`xeCJK`/`CJK` 则幂等,不要重复加。

## 转义与常见编译错误
- 正文里的特殊字符要转义:`\% \& \_ \# \{ \} \$`;`~` 用 `\textasciitilde`,`^` 用 `\textasciicircum`,`\` 用 `\textbackslash`。
- 修编译报错:log 里 `! <错误>` 后跟 `l.NNN <源码>` 给出**出错行号**——按行号**定点修出错相关处**,别大改无关内容;改完不要自己编译(系统负责)。
- 括号/环境配对:`\begin{x}`…`\end{x}` 必须配平;`{` `}` 配平。
