import type { LucideIcon } from 'lucide-react';
import { Share2 } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { JournalCover } from '@/shared/components/JournalCover';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { ShareSheet } from '@/shared/components/share/ShareSheet';
import { useShareSheetStore } from '@/shared/components/share/use-share-sheet';
import { rowChipClass, type RowChipTone } from '@/shared/components/result-row';
import { useOpenJournalDetail } from '@/shared/hooks/useOpenInSearchPanel';
import { cn } from '@/shared/lib/utils';
import type { Journal } from '@/shared/api/types';
import {
  ITEM_KIND_ICON,
  ITEM_KIND_LABEL,
  RESOURCE_SECTIONS,
  collectionShareFolderId,
  itemsForCollection,
  journalForResourceItem,
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
  const openShare = useShareSheetStore((s) => s.openShare);
  const shareTarget = useShareSheetStore((s) => s.target);
  const closeShare = useShareSheetStore((s) => s.closeShare);

  if (!collection) {
    return (
      <EmptyState
        icon={sectionMeta?.icon}
        title={`选择一个${sectionMeta?.label ?? '集合'}`}
        description={sectionMeta?.hint}
      />
    );
  }

  const handleShare = () => {
    openShare({
      kind: 'collection',
      folderId: collectionShareFolderId(collection.id),
      folderName: collection.name,
      paperCount: items.length,
      samplePapers: items.slice(0, 5).map((item) => {
        const journal = journalForResourceItem(item);
        return {
          title: item.title,
          venue: journal?.publisher ?? item.meta,
        };
      }),
    });
  };

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
        <span className="inline-flex items-center rounded-4 bg-surface-2 px-1.5 py-px text-12 font-semibold tabular-nums text-muted-foreground">
          {items.length.toLocaleString()} 项
        </span>
        {collection.description && (
          <span className="ml-2 truncate text-12 text-faint">
            {collection.description}
          </span>
        )}
        {items.length > 0 ? (
          <button
            type="button"
            onClick={handleShare}
            className="ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-8 px-2 text-14 font-medium text-subtle transition-colors hover:bg-surface-1 hover:text-foreground"
          >
            <Share2 className="size-3.5" />
            分享
          </button>
        ) : null}
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

      <ShareSheet
        target={shareTarget}
        open={!!shareTarget}
        onOpenChange={(v) => !v && closeShare()}
      />
    </div>
  );
}

function ResourceItemRow({ item }: { item: ResourceItem }) {
  const journal = journalForResourceItem(item);
  if (journal) {
    return (
      <li>
        <JournalResourceRow journal={journal} updatedAt={item.updatedAt} />
      </li>
    );
  }

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
        <KindCover icon={Icon} label={ITEM_KIND_LABEL[item.kind]} seed={item.id} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-14 font-medium text-foreground">
              {item.title}
            </h3>
            <span className="shrink-0 rounded-pill bg-surface-2 px-1.5 py-px text-12 font-medium text-subtle">
              {ITEM_KIND_LABEL[item.kind]}
            </span>
          </div>
          {item.subtitle && (
            <p className="mt-1 truncate text-12 text-muted-foreground">
              {item.subtitle}
            </p>
          )}
          <p className="mt-1 text-12 text-faint">
            {[item.meta, formatRelative(item.updatedAt)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </button>
    </li>
  );
}

function JournalResourceRow({
  journal,
  updatedAt,
}: {
  journal: Journal;
  updatedAt: string;
}) {
  const openJournal = useOpenJournalDetail();
  const chips = journalChips(journal);

  return (
    <button
      type="button"
      onClick={() => openJournal(journal)}
      className={cn(
        'flex w-full items-start gap-3 px-10 py-3.5 text-left transition-colors',
        'hover:bg-surface-1 focus-visible:outline-none focus-visible:bg-surface-1',
      )}
    >
      <JournalCover
        id={journal.id}
        name={journal.canonical_name}
        size="sm"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-14 font-medium text-foreground">
          {journal.canonical_name}
        </h3>
        <p className="mt-1 truncate text-12 text-muted-foreground">
          {[journal.publisher, journal.country].filter(Boolean).join(' · ') ||
            '出版社未知'}
        </p>
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {chips.map((c) => (
              <span key={c.key} title={c.title} className={rowChipClass(c.tone)}>
                {c.label}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-12 text-faint">{formatRelative(updatedAt)}</p>
      </div>
    </button>
  );
}

const KIND_COVER_TONES = [
  'bg-cat-1',
  'bg-cat-2',
  'bg-cat-3',
  'bg-cat-4',
  'bg-cat-5',
  'bg-cat-6',
  'bg-cat-7',
  'bg-cat-8',
] as const;

function KindCover({
  icon: Icon,
  label,
  seed,
}: {
  icon: LucideIcon;
  label: string;
  seed: string;
}) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const tone = KIND_COVER_TONES[Math.abs(h) % KIND_COVER_TONES.length];

  return (
    <span
      className={cn(
        'mt-0.5 flex h-28 w-20 shrink-0 flex-col justify-between rounded-8 p-2.5 text-on-brand',
        tone,
      )}
    >
      <Icon className="size-4" strokeWidth={1.9} />
      <span className="text-12 leading-tight">{label}</span>
    </span>
  );
}

function journalChips(j: Journal): Array<{
  key: string;
  label: string;
  tone: RowChipTone;
  title?: string;
}> {
  const chips: Array<{
    key: string;
    label: string;
    tone: RowChipTone;
    title?: string;
  }> = [];
  if (j.jcr_impact_factor != null) {
    chips.push({
      key: 'if',
      label: `IF ${j.jcr_impact_factor.toFixed(1)}`,
      tone: 'neutral',
      title: 'JCR 影响因子',
    });
  }
  if (j.jcr_quartile) {
    chips.push({
      key: 'jcr',
      label: `JCR ${j.jcr_quartile}`,
      tone: quartileTone(j.jcr_quartile),
    });
  }
  if (j.fqb_quartile) {
    chips.push({
      key: 'cas',
      label: `中科院 ${j.fqb_quartile} 区`,
      tone: quartileTone(j.fqb_quartile),
    });
  }
  if (j.xr_quartile) {
    chips.push({
      key: 'xr',
      label: `新锐 ${j.xr_quartile} 区`,
      tone: quartileTone(j.xr_quartile),
      title: '中科院新锐分区',
    });
  }
  if (j.ccf_rank) {
    const r = j.ccf_rank.toUpperCase();
    chips.push({
      key: 'ccf',
      label: `CCF ${r}`,
      tone: r === 'A' ? 'green' : r === 'B' ? 'amber' : 'neutral',
    });
  }
  if (j.is_oa) {
    chips.push({ key: 'oa', label: 'OA', tone: 'green', title: '开放获取' });
  }
  if (j.has_submission) {
    chips.push({
      key: 'sub',
      label: '投稿资源',
      tone: 'neutral',
      title: '提供投稿须知 / LaTeX 模板',
    });
  }
  return chips;
}

function quartileTone(quartile: string): RowChipTone {
  const n = quartile.replace(/^Q/i, '').trim();
  if (n === '1') return 'green';
  if (n === '2') return 'amber';
  return 'neutral';
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
