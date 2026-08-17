import { useState } from 'react';
import { FileClock, FilePenLine } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { LoadingState } from '@/shared/components/LoadingState';
import { PaperCover } from '@/shared/components/PaperCover';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { RESULT_ROW_ACTION_CLASS } from '@/shared/components/result-row';
import { cn } from '@/shared/lib/utils';
import {
  recBadgeClasses,
  recShortLabel,
} from '@/shared/lib/peer-review/recommendation';
import {
  useManuscripts,
  type Manuscript,
  type ManuscriptCollection,
  type ManuscriptStage,
} from '@/shared/api/manuscripts';
import { ManuscriptContentPane } from './ManuscriptContentPane';
import { ManuscriptDetailDialog } from './ManuscriptDetailDialog';

/**
 * 稿件集主区列表 —— 接稿件共享资源层的真数据(写 ↔ 审 ↔ 改循环的入口之一)。
 *
 * 点封面 / 标题 / 主区域:右侧展开正文阅读区。
 * 「状态与历史」是行内功能项,打开版本与审稿轮时间线。
 */
export function ManuscriptCollectionView({
  collection,
  loading,
}: {
  collection: ManuscriptCollection | null;
  loading?: boolean;
}) {
  const manuscriptsQ = useManuscripts(collection?.id);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (loading) return <LoadingState />;
  if (!collection) {
    return (
      <EmptyState
        icon={FilePenLine}
        title="选择一个稿件集"
        description="写作稿与审稿上传稿"
      />
    );
  }

  const items = manuscriptsQ.data ?? [];

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <RouteSEO
          title={`我的资源 · ${collection.name} — Scholay`}
          description={collection.description ?? '写作稿与审稿上传稿'}
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
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          {manuscriptsQ.isLoading ? (
            <LoadingState />
          ) : items.length === 0 ? (
            <EmptyState
              icon={FilePenLine}
              title="这里还是空的"
              description={
                collection.kind === 'review'
                  ? '在智能审稿上传稿件后会自动登记到这里'
                  : '在智能写作新建项目后会自动登记到这里'
              }
            />
          ) : (
            <ul className="divide-y divide-border-soft">
              {items.map((item) => (
                <ManuscriptRow
                  key={item.id}
                  manuscript={item}
                  selected={selectedId === item.id}
                  onSelect={() =>
                    setSelectedId((cur) => (cur === item.id ? null : item.id))
                  }
                  onOpenHistory={() => {
                    setHistoryId(item.id);
                    setHistoryOpen(true);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {selectedId ? (
        <>
          <div className="w-px shrink-0 bg-border" />
          <ManuscriptContentPane
            manuscriptId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        </>
      ) : null}

      <ManuscriptDetailDialog
        manuscriptId={historyId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}

function ManuscriptRow({
  manuscript,
  selected,
  onSelect,
  onOpenHistory,
}: {
  manuscript: Manuscript;
  selected: boolean;
  onSelect: () => void;
  onOpenHistory: () => void;
}) {
  return (
    <li>
      <div
        className={cn(
          'flex w-full items-start gap-3 px-10 py-3.5 transition-colors',
          selected ? 'bg-brand-red/5' : 'hover:bg-surface-1',
        )}
      >
        <button
          type="button"
          onClick={onSelect}
          className="mt-0.5 shrink-0 focus-visible:outline-none"
          aria-label={`查看《${manuscript.title}》正文`}
        >
          <PaperCover title={manuscript.title} />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onSelect}
            className="w-full text-left focus-visible:outline-none"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className={cn(
                  'truncate text-14 font-medium',
                  selected ? 'text-brand-red' : 'text-foreground',
                )}
              >
                {manuscript.title}
              </h3>
              <ManuscriptStageBadge
                stage={manuscript.stage}
                decision={manuscript.latestDecision}
              />
            </div>
            <p className="mt-1 truncate text-12 text-muted-foreground">
              {manuscript.origin === 'prism'
                ? '来自智能写作 · 可写可审可循环'
                : '审稿上传稿 · 只有审稿记录'}
            </p>
            <p className="mt-1 text-12 text-faint">
              {[
                manuscript.versionCount > 0
                  ? `${manuscript.versionCount} 个版本`
                  : '尚无版本',
                manuscript.roundCount > 0
                  ? `${manuscript.roundCount} 轮审稿`
                  : '尚未送审',
                formatRelative(manuscript.updatedAt),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </button>
          <button
            type="button"
            onClick={onOpenHistory}
            className={cn(RESULT_ROW_ACTION_CLASS, 'mt-2')}
          >
            <FileClock className="size-3 shrink-0" strokeWidth={2.5} />
            状态与历史
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * 稿件 stage 徽章:写作中 / 审稿中 / 已决议(按决议结果上色,
 * 决议配色复用 peer-review 的 recommendation 唯一真源)。
 */
export function ManuscriptStageBadge({
  stage,
  decision,
  className,
}: {
  stage: ManuscriptStage;
  decision?: string;
  className?: string;
}) {
  const cls =
    stage === 'writing'
      ? 'bg-surface-2 text-subtle'
      : stage === 'in_review'
        ? 'bg-warning-soft text-brand-amber'
        : recBadgeClasses(decision);
  const label =
    stage === 'writing'
      ? '写作中'
      : stage === 'in_review'
        ? '审稿中'
        : decision
          ? `已决议 · ${recShortLabel(decision)}`
          : '已决议';
  return (
    <span
      className={cn(
        'shrink-0 rounded-pill px-1.5 py-px text-12 font-medium',
        cls,
        className,
      )}
    >
      {label}
    </span>
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
