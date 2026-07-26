import { Link } from 'react-router-dom';
import { Globe, Cloud, Download } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { PRICE_TYPE_LABEL, type FeatureTool } from '@/types/feature-tool';
import { ToolLogo } from './ToolLogo';

/** 价格类型 → 文字色 token */
const PRICE_TONE: Record<string, string> = {
  free: 'text-brand-green',
  trial: 'text-brand-amber',
  paid: 'text-brand-red',
  edu: 'text-brand-green',
  freemium: 'text-brand-green',
  unknown: 'text-faint',
};

function AccessIcon({ type }: { type: FeatureTool['access_type'] }) {
  if (type === 'download') return <Download className="size-3.5" />;
  if (type === 'both') return <Cloud className="size-3.5" />;
  return <Globe className="size-3.5" />;
}

/** 工具卡片 —— 功能广场列表用。logo 缺省/加载失败时回落首字母方块。 */
export function ToolCard({ tool }: { tool: FeatureTool }) {
  return (
    <Link
      to={`/tools/${tool.slug || tool.id}`}
      className="group flex flex-col gap-2.5 rounded-md border border-border bg-background p-4 transition-colors hover:border-border-strong hover:bg-surface-1"
    >
      <div className="flex items-start gap-3">
        <ToolLogo tool={tool} className="size-10 rounded-md" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-foreground">{tool.name}</h3>
          {tool.category_label && (
            <p className="truncate text-2xs text-faint">{tool.category_label}</p>
          )}
        </div>
      </div>

      {tool.tagline && (
        <p className="line-clamp-2 text-xs leading-paragraph text-muted-foreground">{tool.tagline}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {(tool.tags ?? []).slice(0, 2).map((t) => (
            <span key={t} className="truncate rounded-sm bg-surface-2 px-1.5 py-0.5 text-2xs text-subtle">
              {t}
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn('text-2xs font-bold', PRICE_TONE[tool.price_type] ?? 'text-faint')}>
            {PRICE_TYPE_LABEL[tool.price_type] ?? tool.price_type}
          </span>
          <span className="flex items-center text-faint" title={tool.access_type}>
            <AccessIcon type={tool.access_type} />
          </span>
        </div>
      </div>
    </Link>
  );
}
