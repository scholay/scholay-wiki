import { FileText, FolderTree, Play } from 'lucide-react';
import { Button } from '@/shared/ui/button';

/**
 * Prism AI 写作样式预览 —— 对照 .pen `dyvGL` (V2 LaTeX Writer body):
 * 文件树(左 200) + 暗色编辑器(中,带行号) + 预览(右 500)
 */
export function PrismPreview() {
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <header className="h-14 px-6 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <FileText className="size-4 text-brand-red" strokeWidth={2.5} />
          <span className="text-16 font-medium text-foreground">main.tex</span>
          <span className="ml-3 text-12 text-faint">Prism · AI 写作</span>
        </div>
        <Button
          type="button"
          tabIndex={-1}
          size="sm"
          className="px-3"
        >
          <Play className="size-3" />
          编译
        </Button>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* 文件树 */}
        <aside className="w-[200px] shrink-0 border-r border-border bg-surface-card py-3">
          <div className="px-4 pb-1 text-12 font-medium text-faint uppercase">
            文件
          </div>
          {[
            { label: 'main.tex', active: true },
            { label: 'introduction.tex' },
            { label: 'method.tex' },
            { label: 'experiments.tex' },
            { label: 'references.bib' },
          ].map((f) => (
            <div
              key={f.label}
              className={
                f.active
                  ? 'flex items-center gap-1.5 px-4 h-7 bg-warning-soft border-l-[3px] border-brand-amber text-12 font-medium text-foreground'
                  : 'flex items-center gap-1.5 px-4 h-7 text-12 text-subtle'
              }
            >
              <FileText className="size-3 text-faint" />
              {f.label}
            </div>
          ))}
          <div className="border-t border-border-soft mt-3 pt-3">
            <div className="px-4 pb-1 text-12 font-medium text-faint uppercase">
              目录
            </div>
            {[
              { label: '1 Introduction', done: true },
              { label: '2 Related Work', done: true },
              { label: '3 Method', editing: true },
              { label: '4 Experiments' },
              { label: '5 Discussion' },
            ].map((s) => (
              <div
                key={s.label}
                className={
                  s.editing
                    ? 'flex items-center gap-1.5 px-4 h-7 border-l-[3px] border-brand-red text-12 font-medium text-foreground'
                    : 'flex items-center gap-1.5 px-4 h-7 text-12 text-subtle'
                }
              >
                <FolderTree className="size-3 text-faint" />
                {s.label}
                {s.done && (
                  <span className="ml-auto text-12 text-brand-green font-medium">
                    ✓
                  </span>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* 暗色编辑器 —— 强制深色面板(LaTeX 编辑器约定),不跟随 .dark token,
            所以这里保留硬编码 hex,加 .pen 注释做标记 */}
        {/* .pen `prism-editor` 暗色编辑面板:bg=#111 / gutter=#0a0a0a / text=#e6e6e6 / gutter text=#555 */}
        <div className="flex-1 min-w-0 bg-[#111] text-[#e6e6e6] font-mono text-12 leading-paragraph overflow-hidden">
          <div className="flex h-full">
            <div className="w-10 shrink-0 bg-[#0a0a0a] py-4 text-right pr-2 text-[#555]">
              {Array.from({ length: 18 }, (_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <pre className="flex-1 min-w-0 px-3 py-4 whitespace-pre overflow-hidden">
{`\\section{Method}
\\label{sec:method}

We propose a hybrid architecture that combines
the linear-time inference of state-space models
with the in-context learning ability of attention.

\\subsection{Block Design}
Each block consists of:
\\begin{itemize}
  \\item A Mamba-style SSM branch for long-range
  \\item A windowed attention branch for local
  \\item A gating function that blends the two
\\end{itemize}

The blended output is then normalized via...`}
            </pre>
          </div>
        </div>

        {/* 预览 */}
        {/* 预览右栏背景用 Prism 专属米色 token(globals.css 已定义) */}
        <aside className="w-[420px] shrink-0 border-l border-border bg-prism-badge-bg overflow-hidden">
          <div className="h-10 px-4 flex items-center border-b border-border bg-surface-1 text-12 text-muted-foreground">
            预览 · 第 4 页 / 共 12 页
          </div>
          <div className="p-6 space-y-3 text-[11px] leading-paragraph text-foreground bg-surface-card m-4 rounded-16">
            <h3 className="text-14 font-medium">3 Method</h3>
            <p className="text-subtle">
              We propose a hybrid architecture that combines the linear-time
              inference of state-space models with the in-context learning
              ability of attention.
            </p>
            <h4 className="text-12 font-medium">3.1 Block Design</h4>
            <p className="text-subtle">
              Each block consists of a Mamba-style SSM branch for long-range
              dependencies, a windowed attention branch for local detail, and
              a gating function that blends the two streams.
            </p>
            <p className="text-subtle">
              The blended output is then normalized via RMSNorm, fed through a
              two-layer GLU MLP, and added back with a residual connection.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
