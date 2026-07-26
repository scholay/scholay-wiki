import { Sparkles, FileText, Save } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * Prism Landing Hero 右侧 mock —— 仿 .pen `GSIG8 heroRight`:
 *   editor 顶部条 (3 圆点 + tabs + 右侧 meta) → 双栏 (左 LaTeX 代码 / 右 PDF 预览占位)
 *
 * 代码用 fontFamily mono + 不同 token 颜色简单模拟语法高亮。
 */

const CODE_LINES = [
  { n: 1, text: '\\documentclass[12pt]{article}', cls: 'text-brand-amber' },
  { n: 2, text: '\\usepackage{amsmath, graphicx, natbib}', cls: 'text-subtle' },
  { n: 3, text: '\\title{Attention in LLMs:}', cls: 'text-foreground font-medium' },
  { n: 4, text: '\\author{Chen, W. \\and Li, M.}', cls: 'text-subtle' },
  { n: 5, text: '', cls: '' },
  { n: 6, text: '\\begin{abstract}', cls: 'text-brand-green' },
  { n: 7, text: 'We present a systematic study of', cls: 'text-foreground' },
  { n: 8, text: 'attention circuits in modern LLMs,', cls: 'text-foreground' },
  { n: 9, text: 'with novel mechanistic insights into', cls: 'text-foreground' },
  { n: 10, text: 'multi-head interactions \\cite{vaswani2017}.', cls: 'text-foreground' },
  { n: 11, text: '\\end{abstract}', cls: 'text-brand-green' },
];

export function PrismEditorMock() {
  return (
    <div className={cn(
      'flex flex-col rounded-12 overflow-hidden bg-surface-1 border border-border',
      'shadow-overlay'
    )}>
      {/* editor top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-surface-card border-b border-border-soft">
        <span className="size-2.5 rounded-pill bg-[#FF5F57]" />
        <span className="size-2.5 rounded-pill bg-[#FEBC2E]" />
        <span className="size-2.5 rounded-pill bg-[#28C840]" />
        <div className="flex items-center gap-1 ml-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-4 bg-surface-2 text-12 font-medium text-foreground">
            <FileText className="size-3" /> main.tex
          </span>
          <span className="text-12 text-faint px-1">bibliography.bib</span>
        </div>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1.5 text-12 text-muted-foreground">
          <Sparkles className="size-3 text-brand-amber" /> AI Assist
        </span>
        <span className="inline-flex items-center gap-1 text-12 text-muted-foreground">
          <Save className="size-3" /> Save
        </span>
      </div>

      {/* split pane —— 高度固定 320 给两栏空间 */}
      <div className="grid grid-cols-2 h-[320px]">
        {/* 左:LaTeX 代码 */}
        <div className="overflow-hidden bg-[#FAFAF7] border-r border-border-soft">
          <div className="font-mono text-12 leading-paragraph py-3">
            {CODE_LINES.map((l) => (
              <div key={l.n} className="flex items-start px-3">
                <span className="text-faint tabular-nums w-6 text-right pr-2 select-none">{l.n}</span>
                <span className={cn('whitespace-pre', l.cls)}>{l.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 右:PDF 预览占位 */}
        <div className="flex flex-col gap-3 p-7 bg-surface-card overflow-hidden">
          <div className="font-display italic font-medium text-14 text-foreground">
            Attention in LLMs:
          </div>
          <div className="font-display italic text-12 text-subtle">
            A Mechanistic Survey
          </div>
          <div className="text-12 text-muted-foreground">
            Chen, W.  ·  Li, M.
          </div>
          <div className="mt-2 text-12 text-foreground leading-paragraph">
            <span className="font-medium">Abstract.</span> We present a systematic study of attention circuits in modern LLMs, with novel mechanistic insights into multi-head interactions.
          </div>
          {/* fake citation chip */}
          <div className="inline-flex items-center self-start mt-1 px-1.5 py-0.5 rounded-4 bg-prism-badge-bg text-12 text-prism-badge-fg font-medium">
            [vaswani2017]
          </div>
        </div>
      </div>
    </div>
  );
}
