import { Database, Download, Globe, User } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type PlazaPreviewVariant = 'catalog' | 'datasets' | 'news' | 'skills' | 'prompts';

/**
 * First-level scholay广场 hub preview — one miniature per plaza segment.
 */
export function HubPlazaPreview({ variant }: { variant: PlazaPreviewVariant }) {
  switch (variant) {
    case 'datasets':
      return <DatasetsPreview />;
    case 'prompts':
      return <PromptsPreview />;
    case 'news':
      return <NewsPreview />;
    case 'skills':
      return <SkillsPreview />;
    default:
      return <CatalogPreview />;
  }
}

function CatalogPreview() {
  const tools = [
    { letter: 'Z', tone: 'bg-cat-2', name: 'Zotero', cat: '文献管理', price: '免费', priceTone: 'text-brand-green' },
    { letter: 'O', tone: 'bg-cat-7', name: 'Overleaf', cat: '在线 LaTeX', price: '免费增值', priceTone: 'text-brand-green' },
  ];
  return (
    <div className="space-y-2">
      {tools.map((t) => (
        <div
          key={t.name}
          className="flex items-center gap-3 rounded-12 border border-border bg-background px-3 py-2.5"
        >
          <span
            className={cn(
              'inline-flex size-10 shrink-0 items-center justify-center rounded-8 font-serif text-16 font-bold text-on-brand',
              t.tone,
            )}
          >
            {t.letter}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-14 text-foreground">{t.name}</p>
            <p className="truncate text-12 text-faint">{t.cat}</p>
          </div>
          <span className={cn('shrink-0 text-12', t.priceTone)}>{t.price}</span>
          <Globe className="size-3.5 shrink-0 text-faint" />
        </div>
      ))}
    </div>
  );
}

function DatasetsPreview() {
  return (
    <div className="rounded-12 border border-border bg-background p-3.5">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-foreground">
          <Database className="size-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-14 text-foreground">ImageNet</p>
          <p className="truncate text-12 text-faint">计算机视觉</p>
        </div>
        <span className="shrink-0 text-12 text-faint">研究使用</span>
      </div>
      <p className="mt-2.5 line-clamp-2 text-12 leading-relaxed text-muted-foreground">
        大规模图像分类基准,覆盖 2 万余类、逾千万标注图片。
      </p>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="rounded-4 bg-surface-2 px-1.5 py-0.5 text-12 text-subtle">图像</span>
        <span className="rounded-4 bg-surface-2 px-1.5 py-0.5 text-12 text-subtle">分类</span>
        <span className="ml-auto font-mono text-12 text-faint">14M · 21k 类</span>
      </div>
    </div>
  );
}

function NewsPreview() {
  const items = [
    { section: '顶刊速递', time: '2 小时前', title: 'Nature 发表长序列建模综述,覆盖 Mamba 与线性注意力' },
    { section: '政策', time: '昨天', title: '基金委调整青年科学基金项目集中申请时间' },
    { section: '快讯', time: '昨天', title: 'OpenAlex 更新 2026 年开放引文快照' },
  ];
  return (
    <div className="overflow-hidden rounded-12 border border-border bg-background">
      {items.map((item, i) => (
        <div
          key={item.title}
          className={cn('px-3 py-2.5', i > 0 && 'border-t border-border-soft')}
        >
          <div className="flex items-center gap-2">
            <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-12 text-subtle">
              {item.section}
            </span>
            <span className="ml-auto text-12 text-faint">{item.time}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-12 text-foreground">{item.title}</p>
        </div>
      ))}
    </div>
  );
}

function SkillsPreview() {
  return (
    <div className="rounded-12 border border-border bg-background p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-14 text-foreground">文献综述速写</p>
        <span className="shrink-0 rounded-pill bg-brand-green/10 px-1.5 py-0.5 text-12 text-brand-green">
          已安装
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-12 text-muted-foreground">
        把一叠 PDF 压成结构化综述提纲,并标出待核对的引用。
      </p>
      <div className="mt-3 flex items-center gap-3 text-12 text-faint">
        <span className="inline-flex items-center gap-1">
          <User className="size-3" />
          林启明
        </span>
        <span className="inline-flex items-center gap-1">
          <Download className="size-3" />
          1.2k
        </span>
        <span className="ml-auto font-mono text-faint">/review · /cite</span>
      </div>
    </div>
  );
}

function PromptsPreview() {
  return (
    <div className="rounded-12 border border-border bg-background p-3.5">
      <p className="text-14 text-foreground">审稿意见对照改写</p>
      <p className="mt-1.5 line-clamp-3 font-mono text-12 leading-relaxed text-muted-foreground">
        把下面这条审稿意见改写成可执行的修改清单,并标出需要补实验的地方…
      </p>
      <div className="mt-3 flex items-center gap-2 text-12 text-faint">
        <span className="rounded-4 bg-surface-2 px-1.5 py-0.5 text-subtle">写作</span>
        <span className="rounded-4 bg-surface-2 px-1.5 py-0.5 text-subtle">审稿</span>
        <span className="ml-auto">248 次使用</span>
      </div>
    </div>
  );
}
