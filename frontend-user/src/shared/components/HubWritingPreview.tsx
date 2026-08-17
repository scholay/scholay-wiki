import { ChevronDown, ChevronRight, FileCode2, ListTree } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

const LATEX_LINES = [
  { cmd: true, text: '\\documentclass{article}' },
  { cmd: true, text: '\\usepackage{amsmath}' },
  { cmd: true, text: '\\title{On Long-Context Models}' },
  { cmd: true, text: '\\begin{document}' },
  { cmd: true, text: '\\section{Introduction}' },
  { cmd: false, text: 'Attention is $O(n^2)$.' },
] as const;

const OUTLINE = [
  { level: 1, title: '摘要', open: false },
  { level: 1, title: '引言', open: true },
  { level: 2, title: '研究背景', open: false },
  { level: 2, title: '问题提出', open: false },
  { level: 1, title: '方法', open: false },
  { level: 1, title: '结果与讨论', open: false },
] as const;

/**
 * First-level writing hub preview.
 * `latex` = source + compiled page (高级写作);
 * `outline` = paper TOC tree (快速写作 / 目录层级).
 */
export function HubWritingPreview({ variant }: { variant: 'latex' | 'outline' }) {
  if (variant === 'outline') return <OutlinePreview />;
  return <LatexPreview />;
}

function LatexPreview() {
  return (
    <div className="overflow-hidden rounded-12 border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <FileCode2 className="size-3.5 text-faint" />
        <span className="font-mono text-12 text-muted-foreground">main.tex</span>
        <span className="ml-auto text-12 text-faint">PDF</span>
      </div>
      <div className="grid h-40 grid-cols-2">
        <ol className="overflow-hidden border-r border-border bg-surface-1 px-3 py-2.5 font-mono text-12 leading-5">
          {LATEX_LINES.map((line, i) => (
            <li key={line.text} className="flex gap-2.5">
              <span className="w-3 shrink-0 text-right text-faint">{i + 1}</span>
              <span className={line.cmd ? 'text-brand-red' : 'text-foreground'}>
                {line.text}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex flex-col bg-background px-4 py-3">
          <p className="font-serif text-14 font-bold leading-snug text-foreground">
            On Long-Context Models
          </p>
          <p className="mt-3 font-serif text-12 font-bold text-foreground">1 Introduction</p>
          <p className="mt-1 text-12 leading-relaxed text-muted-foreground">
            Attention is O(n²).
          </p>
        </div>
      </div>
    </div>
  );
}

function OutlinePreview() {
  return (
    <div className="overflow-hidden rounded-12 border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <ListTree className="size-3.5 text-faint" />
        <span className="text-12 text-muted-foreground">目录</span>
      </div>
      <ul className="space-y-0.5 px-2 py-2">
        {OUTLINE.map((item) => {
          const Icon = item.open ? ChevronDown : ChevronRight;
          return (
            <li
              key={`${item.level}-${item.title}`}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-8 px-2 text-12',
                item.level === 1 ? 'pl-2' : 'pl-7',
                item.open && 'bg-surface-2 text-foreground',
                !item.open && item.level === 1 && 'text-foreground',
                item.level > 1 && 'text-muted-foreground',
              )}
            >
              {item.level === 1 ? (
                <Icon className="size-3.5 shrink-0 text-faint" />
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              <span>{item.title}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
