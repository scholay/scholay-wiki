---
name: prism-figures
description: 论文图表与数据可视化的 LaTeX 原生规范 —— TikZ / pgfplots 画图、booktabs 三线表、子图、浮动体与 caption、数据用 .dat 文本文件。Prism 里需要"画图/出图表/做表格"时遵循。
when_to_use: 用户要画图 / 折线图柱状图散点图函数图 / 流程图 / 图表 / 数据可视化 / 三线表 / 子图 / 浮动体排版,或要把数据做成图或表时
user-invocable: false
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Edit, Write, MultiEdit
---

# 论文图表(Prism)—— 一律用 LaTeX 原生方式,矢量、可编译、期刊级

⚠️ **不要调 shell、不要用 matplotlib/python 生成位图、不要自己编译**。图表全用 LaTeX 源码描述,系统编译时渲染。你的产物是源码,不是图片文件。保持最小 diff;新建文件用清晰相对路径(`figures/`、`data/`)。

## 导言区需要的包(没有就先在主文件导言区补,幂等、别重复加)
```latex
\usepackage{graphicx}
\usepackage{booktabs}      % 三线表
\usepackage{subcaption}    % 子图
\usepackage{pgfplots}      % 数据图(折线/柱状/散点/函数)
\pgfplotsset{compat=1.18}  % 必加,否则一堆兼容告警/行为漂移
% TikZ 流程图等:\usetikzlibrary{positioning, arrows.meta, shapes.geometric}
```

## 数据图:pgfplots(首选,矢量)
- **折线/散点**:`axis` + `\addplot`。数据少直接 `coordinates{...}`;数据多写进 `data/xxx.dat`(纯文本,空格/制表分隔,首行列名)再 `\addplot table[x=...,y=...]`。
- **柱状图**:`ybar`(或 `xbar`),配 `symbolic x coords` + `xtick=data`。
- 每图都要 `\caption{}` + 紧跟 `\label{fig:xxx}`(label 必须在 caption 之后),正文 `\ref{}`/`\cref{}` 引用,**绝不硬编号**。
- 含逗号的 `\legend`/`\addlegendentry` 条目里若有 `$...$`,整条用 `{...}` 包住,防数学模式被逗号提前闭合(见 prism-latex-format)。

折线示例(数据外置 data/loss.dat):
```latex
% data/loss.dat 内容(新建该文件):
% epoch loss
% 1 0.92
% 2 0.61
% 3 0.40
\begin{figure}[t]
  \centering
  \begin{tikzpicture}
    \begin{axis}[width=.8\linewidth, xlabel={Epoch}, ylabel={Loss}, grid=both, legend pos=north east]
      \addplot table[x=epoch, y=loss] {data/loss.dat};
      \addlegendentry{Ours}
    \end{axis}
  \end{tikzpicture}
  \caption{训练损失随 epoch 下降。}
  \label{fig:loss}
\end{figure}
```

柱状图(内联数据)示例:
```latex
\begin{tikzpicture}
  \begin{axis}[ybar, symbolic x coords={A,B,C}, xtick=data, ylabel={Accuracy (\%)}, nodes near coords]
    \addplot coordinates {(A,91.2) (B,88.5) (C,93.1)};
  \end{axis}
\end{tikzpicture}
```

## 三线表:booktabs(不要竖线、不要堆 \hline)
```latex
\begin{table}[t]
  \centering
  \caption{各方法对比。}
  \label{tab:main}
  \begin{tabular}{lcc}
    \toprule
    Method & Acc (\%) & F1 \\
    \midrule
    Baseline & 88.5 & 0.87 \\
    Ours     & \textbf{93.1} & \textbf{0.92} \\
    \bottomrule
  \end{tabular}
\end{table}
```
- 数字列对齐可用 `siunitx` 的 `S` 列(已装 texlive-science):`\begin{tabular}{l S S}` + 表头用 `{Acc}`。

## 子图:subcaption
```latex
\begin{figure}[t]\centering
  \begin{subfigure}{.48\linewidth}\centering
    <tikzpicture 或 \includegraphics> \caption{}\label{fig:a}
  \end{subfigure}\hfill
  \begin{subfigure}{.48\linewidth}\centering
    ... \caption{}\label{fig:b}
  \end{subfigure}
  \caption{总标题。}\label{fig:both}
\end{figure}
```

## 流程图 / 示意图:TikZ
用 `\node[draw, ...]` + `\draw[->]`,配 `positioning`(`below=of x`)排布;复杂图考虑新建 `figures/arch.tex` 再 `\input{figures/arch}` 保持主文件清爽。

## 已有位图
用户已上传的 `.png/.pdf/.jpg` 图,用 `\includegraphics[width=...]{figures/xxx}`(相对路径)。你不负责生成位图;需要新图就用上面的 TikZ/pgfplots 矢量方式。

## 收尾自查
图/表都有 caption+label、正文有 `\ref`、label 唯一、`\pgfplotsset{compat=1.18}` 已加、引用的 `data/*.dat` 文件确实已新建。改完不要自己编译(系统负责)。
