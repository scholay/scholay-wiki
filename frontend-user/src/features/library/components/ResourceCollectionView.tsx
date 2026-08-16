import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { cn } from '@/shared/lib/utils';
import {
  ITEM_KIND_ICON,
  ITEM_KIND_LABEL,
  RESOURCE_SECTIONS,
  itemsForCollection,
  type ResourceCollection,
  type ResourceItem,
  type ResourceSectionId,
} from '../resource-model';

interface ResourceCollectionViewProps {
  section: Exclude<ResourceSectionId, 'papers'>;
  collection: ResourceCollection | null;
}

/**
 * 期刊集 / 稿件集 / 文件夹 的主区列表（mock）。
 */
export function ResourceCollectionView({
  section,
  collection,
}: ResourceCollectionViewProps) {
  const sectionMeta = RESOURCE_SECTIONS.find((s) => s.id === section);
  const items = collection
    ? itemsForCollection(section, collection.id)
    : [];

  if (!collection) {
    return (
      <EmptyState
        icon={sectionMeta?.icon}
        title={`选择一个${sectionMeta?.label ?? '集合'}`}
        description={sectionMeta?.hint}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <RouteSEO
        title={`我的资源 · ${collection.name} — Scholay`}
        description={collection.description ?? sectionMeta?.hint ?? ''}
        noindex
      />
      <header className="flex h-15 shrink-0 items-center gap-2 border-b border-border bg-background px-10">
        <span className="text-14 font-medium text-foreground">
          {collection.name}
        </span>
        <span className="inline-flex items-center rounded-sm bg-surface-2 px-1.5 py-px text-xs font-semibold tabular-nums text-muted-foreground">
          {items.length.toLocaleString()} 项
        </span>
        {collection.description && (
          <span className="ml-2 truncate text-2xs text-faint">
            {collection.description}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {items.length === 0 ? (
          <EmptyState
            icon={sectionMeta?.icon}
            title="这里还是空的"
            description={`把${sectionMeta?.hint ?? '内容'}加进来吧`}
          />
        ) : (
          <ul className="divide-y divide-border-soft">
            {items.map((item) => (
              <ResourceItemRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ResourceItemRow({ item }: { item: ResourceItem }) {
  const Icon: LucideIcon = ITEM_KIND_ICON[item.kind];
  return (
    <li>
      <button
        type="button"
        className={cn(
          'flex w-full items-start gap-3 px-10 py-3.5 text-left transition-colors',
          'hover:bg-surface-1 focus-visible:outline-none focus-visible:bg-surface-1',
        )}
      >
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-1 text-muted-foreground ring-1 ring-border">
          <Icon className="size-4" strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {item.title}
            </h3>
            <span className="shrink-0 rounded-pill bg-surface-2 px-1.5 py-px text-[10px] font-bold text-subtle">
              {ITEM_KIND_LABEL[item.kind]}
            </span>
          </div>
          {item.subtitle && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {item.subtitle}
            </p>
          )}
          <p className="mt-1 text-2xs text-faint">
            {[item.meta, formatRelative(item.updatedAt)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </button>
    </li>
  );
}

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const days = Math.max(0, Math.round((Date.now() - t) / 86_400_000));
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  return new Date(t).toLocaleDateString('zh-CN');
}
