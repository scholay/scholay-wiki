import { FileCode2, FileText, Folder, Image, Presentation } from 'lucide-react';
import { JournalCover } from '@/shared/components/JournalCover';
import { HUB_JOURNAL_SAMPLE } from '@/shared/components/JournalResultCard';
import { cn } from '@/shared/lib/utils';

export type LibraryPreviewVariant = 'paper' | 'journal' | 'latex' | 'folder';

/**
 * First-level 我的资源 hub preview.
 * paper = bibliographic card; journal = cover + metrics;
 * latex = project tree; folder = folder-shaped asset bin.
 */
export function HubLibraryPreview({ variant }: { variant: LibraryPreviewVariant }) {
  switch (variant) {
    case 'journal':
      return <JournalBibPreview />;
    case 'latex':
      return <LatexProjectPreview />;
    case 'folder':
      return <FolderPreview />;
    default:
      return <PaperBibPreview />;
  }
}

function PaperBibPreview() {
  return (
    <article className="rounded-12 border border-border bg-background px-3.5 py-3.5">
      <h3 className="text-14 leading-snug text-foreground">
        Attention Is All You Need
      </h3>
      <p className="mt-1 truncate text-12 text-muted-foreground">
        NeurIPS · Vaswani, Shazeer +6 · 2017
      </p>
      <p className="mt-2 line-clamp-2 text-12 leading-relaxed text-faint">
        We propose a new simple network architecture, the Transformer, based
        solely on attention mechanisms, dispensing with recurrence and
        convolutions entirely.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Chip tone="high">JCR Q1</Chip>
        <Chip tone="neutral">被引 128.4k</Chip>
        <Chip tone="field">机器学习</Chip>
      </div>
    </article>
  );
}

function JournalBibPreview() {
  const j = HUB_JOURNAL_SAMPLE;
  return (
    <div className="flex h-36 items-stretch gap-3 rounded-12 border border-border bg-background p-3">
      <JournalCover id={j.id} name={j.canonical_name} size="card" />
      <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
        <div>
          <h3 className="truncate font-display text-16 font-bold text-foreground">
            {j.canonical_name}
          </h3>
          <p className="mt-1 truncate text-12 text-faint">
            {j.publisher} · {j.country}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="neutral">IF {j.jcr_impact_factor?.toFixed(1)}</Chip>
          <Chip tone="high">JCR {j.jcr_quartile}</Chip>
          <Chip tone="high">中科院 {j.fqb_quartile} 区</Chip>
        </div>
      </div>
    </div>
  );
}

function LatexProjectPreview() {
  const rows = [
    { indent: 0, icon: Folder, name: 'long-context-attn', faint: false },
    { indent: 1, icon: FileCode2, name: 'main.tex', faint: false },
    { indent: 1, icon: Folder, name: 'sections/', faint: false },
    { indent: 2, icon: FileCode2, name: 'intro.tex', faint: true },
    { indent: 2, icon: FileCode2, name: 'method.tex', faint: true },
    { indent: 1, icon: FileText, name: 'refs.bib', faint: false },
  ] as const;
  return (
    <div className="overflow-hidden rounded-12 border border-border bg-background">
      <div className="border-b border-border px-3 py-1.5 text-12 text-muted-foreground">
        LaTeX 工程
      </div>
      <ul className="space-y-0.5 px-2 py-2">
        {rows.map((row) => (
          <li
            key={`${row.indent}-${row.name}`}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-8 text-12',
              row.indent === 0 && 'bg-surface-2 px-2 text-foreground',
              row.indent === 1 && 'pl-6 text-foreground',
              row.indent === 2 && 'pl-10 text-muted-foreground',
              row.faint && 'text-muted-foreground',
            )}
          >
            <row.icon className="size-3.5 shrink-0 text-faint" />
            <span className="font-mono">{row.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FolderPreview() {
  const files = [
    { icon: Image, name: 'figure-ablation.png' },
    { icon: Presentation, name: 'lab-meeting.pptx' },
    { icon: FileText, name: 'notes.md' },
  ];
  return (
    <div className="relative pt-3">
      <div
        aria-hidden
        className="absolute left-3 top-0 h-3 w-16 rounded-t-8 border border-b-0 border-border bg-surface-2"
      />
      <div className="overflow-hidden rounded-12 rounded-tl-4 border border-border bg-surface-2">
        <div className="px-3 py-1.5 text-12 text-muted-foreground">过程产物</div>
        <ul className="space-y-0.5 bg-background px-2 py-2">
          {files.map((f) => (
            <li
              key={f.name}
              className="flex h-7 items-center gap-1.5 rounded-8 px-2 text-12 text-foreground"
            >
              <f.icon className="size-3.5 text-faint" />
              <span className="truncate font-mono">{f.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: 'high' | 'neutral' | 'field';
  children: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-pill px-2 text-12',
        tone === 'high' && 'border border-brand-green/70 text-brand-green',
        tone === 'neutral' && 'border border-border text-subtle',
        tone === 'field' && 'text-faint',
      )}
    >
      {children}
    </span>
  );
}
