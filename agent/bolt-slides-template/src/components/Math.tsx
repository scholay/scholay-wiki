import katex from 'katex';
import { exportAttrs } from '../deck/exportAnnotate';

/* 数学公式 —— 用 KaTeX 把 LaTeX 渲染成 **MathML**(浏览器原生渲染,零字体/CSS 依赖 → 完全自包含,
   契合单文件 deck + 导出封网)。理工/统计/ML 科研汇报的方法页、定理、损失函数都用它,别再用纯文本硬凑。
   <Math tex="e^{i\\pi}+1=0" />            行内公式
   <MathBlock tex="\\hat\\beta=(X^\\top X)^{-1}X^\\top y" />   独立居中公式(display 模式) */

function render(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      output: 'mathml', // 纯 MathML:无需 katex.css / 字体,单文件自包含
      throwOnError: false, // 语法错不炸整个 deck,原样标红显示
      displayMode,
      strict: false,
    });
  } catch {
    return tex; // 兜底:退化为原始文本
  }
}

export function Math({ tex }: { tex: string }) {
  // 导出:行内公式用 role=container —— **不**触发整页图片回退,其渲染符号随所在段落文本一起被采集
  // 成可编辑文本(P1 够用);块级 MathBlock 才走 image/OMML。
  return (
    <span
      className="math-inline"
      {...exportAttrs('container', { kind: 'math', tex, display: false })}
      dangerouslySetInnerHTML={{ __html: render(tex, false) }}
    />
  );
}

export function MathBlock({ tex }: { tex: string }) {
  return (
    <div
      className="math-block"
      {...exportAttrs('image', { kind: 'math', tex, display: true })}
      dangerouslySetInnerHTML={{ __html: render(tex, true) }}
    />
  );
}

export default Math;
