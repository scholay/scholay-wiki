/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * LaTeX 默认模板常量
 */

export const DEFAULT_LATEX_TEMPLATE = `\\documentclass[12pt,a4paper]{article}

% 基础宏包
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[hidelinks]{hyperref}
\\usepackage[margin=1in]{geometry}
\\usepackage{setspace}

% 设置行距
\\onehalfspacing

\\title{My Paper Title}
\\author{Author Name\\\\
\\small Institution Name\\\\
\\small \\texttt{email@example.com}}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
Your abstract goes here. This should be a concise summary of your research, including the background, methods, results, and conclusions. Typically 150-300 words.
\\end{abstract}

\\textbf{Keywords:} keyword1, keyword2, keyword3

\\section{Introduction}
Start writing your introduction here. Introduce the background, motivation, and objectives of your research.

\\section{Related Work}
Review relevant literature and previous studies in this area.

\\section{Methods}
Describe your methodology in detail. Include any mathematical formulations if necessary:

\\begin{equation}
E = mc^2
\\end{equation}

\\section{Results}
Present your experimental or theoretical results. You can use tables like this:

\\begin{table}[h]
\\centering
\\caption{Sample Results}
\\begin{tabular}{lcc}
\\toprule
Method & Accuracy & Time (s) \\\\
\\midrule
Method A & 0.85 & 1.2 \\\\
Method B & 0.92 & 2.5 \\\\
\\bottomrule
\\end{tabular}
\\end{table}

\\section{Discussion}
Discuss the implications of your results and compare with previous work.

\\section{Conclusion}
Summarize your findings and suggest future research directions.

\\section*{Acknowledgments}
Thank those who contributed to this work.

\\begin{thebibliography}{9}
\\bibitem{ref1}
Author A, Author B.
\\textit{Title of the Paper}.
Journal Name, Vol. X, No. Y, pp. 1-10, 2024.
\\end{thebibliography}

\\end{document}
`;

// eslint-disable-next-line no-unused-vars
export const CHINESE_LATEX_TEMPLATE = `\\documentclass{article}
\\usepackage{xeCJK}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{geometry}

% 设置中文字体（使用 Noto 字体，在线编译器支持）
\\setCJKmainfont{Noto Serif CJK SC}
\\setCJKsansfont{Noto Sans CJK SC}
\\setCJKmonofont{Noto Sans Mono CJK SC}

% 页面设置
\\geometry{a4paper, margin=2.5cm}

\\title{论文标题}
\\author{作者姓名}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
在此处填写摘要内容。
\\end{abstract}

\\section{引言}
在此处开始撰写引言部分。

\\section{方法}
描述您的研究方法。

\\section{结果}
展示您的研究结果。

\\section{结论}
总结您的研究发现。

\\end{document}
`;
