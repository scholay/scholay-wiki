import type { ReactNode } from 'react';
import { FileText, GraduationCap, Mail, Mic2, Paperclip } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type ReviewPreviewVariant = 'journal' | 'thesis' | 'conference' | 'other';

/**
 * First-level 智能审稿 hub preview — one miniature per manuscript type.
 */
export function HubReviewPreview({ variant }: { variant: ReviewPreviewVariant }) {
  switch (variant) {
    case 'thesis':
      return <ThesisPreview />;
    case 'conference':
      return <ConferencePreview />;
    case 'other':
      return <OtherPreview />;
    default:
      return <JournalPreview />;
  }
}

function Shell({
  label,
  extra,
  children,
}: {
  label: string;
  extra?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-12 border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="text-12 text-muted-foreground">{label}</span>
        {extra ? <span className="ml-auto text-12 text-faint">{extra}</span> : null}
      </div>
      {children}
    </div>
  );
}

function JournalPreview() {
  const checks = [
    { name: '查重', value: '6.2%', ok: true },
    { name: 'AIGC', value: '4.1%', ok: true },
    { name: '排版', value: '96%', ok: true },
    { name: '匹配', value: '88%', ok: true },
  ];
  return (
    <Shell label="编辑部初审" extra="送审 A / B / C">
      <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
        {checks.map((c) => (
          <div key={c.name} className="bg-background px-2 py-2.5">
            <p className="text-12 text-faint">{c.name}</p>
            <p className="mt-1 font-display text-16 font-bold tabular-nums text-foreground">
              {c.value}
            </p>
            <p className="mt-0.5 text-12 text-brand-green">通过</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2.5">
        {['A', 'B', 'C'].map((id) => (
          <span
            key={id}
            className="inline-flex size-7 items-center justify-center rounded-8 bg-surface-2 font-serif text-12 font-bold text-foreground"
          >
            {id}
          </span>
        ))}
        <span className="ml-auto text-12 text-muted-foreground">Nature Methods · Q1</span>
      </div>
    </Shell>
  );
}

function ThesisPreview() {
  return (
    <Shell label="盲审预演" extra="硕 / 博">
      <div className="flex gap-3 px-3 py-3">
        <div className="flex h-32 w-24 shrink-0 flex-col justify-between rounded-8 bg-cat-7 p-2.5 text-on-brand">
          <p className="text-12 text-on-brand/85">硕士学位论文</p>
          <p className="font-serif text-12 font-bold leading-snug">
            长序列建模中的稀疏注意力
          </p>
          <p className="text-12 text-on-brand/85">某某大学</p>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5 py-0.5">
          {[
            { who: '评阅 1', note: '创新性充分' },
            { who: '评阅 2', note: '方法需补实验' },
            { who: '评阅 3', note: '等待中' },
          ].map((row, i) => (
            <li
              key={row.who}
              className={cn(
                'flex h-8 items-center justify-between rounded-8 px-2.5 text-12',
                i === 2 ? 'bg-surface-1 text-faint' : 'bg-surface-2 text-foreground',
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap className="size-3.5 text-faint" />
                {row.who}
              </span>
              <span className="text-muted-foreground">{row.note}</span>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

function ConferencePreview() {
  return (
    <Shell label="会议投稿" extra="CCF A">
      <div className="px-3 py-3">
        <div className="rounded-8 border border-border bg-surface-1 px-3 py-2.5">
          <p className="font-serif text-16 font-bold text-foreground">NeurIPS 2026</p>
          <p className="mt-1 text-12 text-muted-foreground">
            Vancouver · Oral / Poster
          </p>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { k: '页数', v: '9 + 附录' },
            { k: '截稿', v: '05.15' },
            { k: '双盲', v: '已脱敏' },
          ].map((cell) => (
            <div key={cell.k} className="rounded-8 bg-background px-2 py-2">
              <p className="text-12 text-faint">{cell.k}</p>
              <p className="mt-0.5 truncate text-12 text-foreground">{cell.v}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 inline-flex items-center gap-1.5 text-12 text-muted-foreground">
          <Mic2 className="size-3.5 text-faint" />
          会议口吻 · 强调贡献与可复现
        </p>
      </div>
    </Shell>
  );
}

function OtherPreview() {
  const files = [
    { icon: FileText, name: 'manuscript.pdf', tag: '主稿' },
    { icon: Mail, name: 'cover-letter.docx', tag: '投稿信' },
    { icon: Paperclip, name: 'supplement.zip', tag: '附件' },
  ];
  return (
    <Shell label="其他稿件" extra="预印本 / 报告">
      <ul className="space-y-1 px-2 py-2">
        {files.map((f) => (
          <li
            key={f.name}
            className="flex h-8 items-center gap-2 rounded-8 px-2 text-12 text-foreground"
          >
            <f.icon className="size-3.5 text-faint" />
            <span className="min-w-0 truncate font-mono">{f.name}</span>
            <span className="ml-auto rounded-4 bg-surface-2 px-1.5 text-12 text-muted-foreground">
              {f.tag}
            </span>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
