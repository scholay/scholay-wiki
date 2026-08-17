import { useEffect, useMemo, type ReactNode } from 'react';
import { ChevronDown, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { libraryRowToPaper } from '@/shared/api/user-library-papers';
import { formatRailCount } from '@/shared/components/sidebar/format-rail-count';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shared/ui/hover-card';
import { useIsAuthenticated } from '@/stores/auth.store';
import {
  STAGING_FOLDER_LABEL,
  useWorkspaceFolderUi,
  type WorkspaceFolderTab,
} from '@/stores/workspace-folder.store';
import { useLibraryPapers } from '@/features/library/api/papers';
import { useLibraryFoldersSummary } from '../../api/library';
import { useStagingActions } from '../../hooks/useStagingActions';
import { useStagingView } from '../../hooks/useStagingView';
import {
  FolderIconPicker,
  useFolderAppearance,
} from '@/shared/components/folder-appearance';
import { WorkspacePaperUnit } from './WorkspacePaperUnit';
import type { Paper } from '@/shared/api/types';

type FolderKey = 'staging' | number;

/**
 * 工作区文件夹树 —— 手风琴(同时最多展开一个)。
 */
export function WorkspaceFolderTree() {
  const authenticated = useIsAuthenticated();
  const rail = false;
  const activeTab = useWorkspaceFolderUi((s) => s.activeTab);
  const openFolderKey = useWorkspaceFolderUi((s) => s.openFolderKey);
  const setActiveTab = useWorkspaceFolderUi((s) => s.setActiveTab);
  const toggleFolder = useWorkspaceFolderUi((s) => s.toggleFolder);
  const selectedPaperId = useWorkspaceFolderUi((s) => s.selectedPaperId);
  const setSelectedPaperId = useWorkspaceFolderUi((s) => s.setSelectedPaperId);
  const { activeArea } = useStagingView();
  const { removePaper } = useStagingActions();
  const foldersQ = useLibraryFoldersSummary();
  const folders = foldersQ.data?.folders ?? [];
  const stagingPapers = activeArea?.papers ?? [];

  useEffect(() => {
    if (typeof activeTab !== 'number') return;
    if (foldersQ.isLoading) return;
    if (folders.length === 0) return;
    if (!folders.some((f) => f.id === activeTab)) {
      setActiveTab('staging');
    }
  }, [activeTab, folders, foldersQ.isLoading, setActiveTab]);

  const handleRemoveStaging = (paperId: string) => {
    if (!activeArea) return;
    removePaper(activeArea.id, paperId);
  };

  return (
    <nav
      className={cn('flex flex-col pb-2', rail && 'gap-0.5 px-0.5 pt-1')}
      aria-label="工作区文件夹"
    >
      <FolderAccordion
        folderKey="staging"
        label={STAGING_FOLDER_LABEL}
        count={stagingPapers.length}
        icon="staging"
        open={openFolderKey === 'staging'}
        active={activeTab === 'staging'}
        rail={rail}
        onToggle={() => toggleFolder('staging')}
        papers={stagingPapers}
        selectedPaperId={selectedPaperId}
        onSelectPaper={setSelectedPaperId}
        onRemovePaper={handleRemoveStaging}
      />

      {authenticated && foldersQ.isLoading && folders.length === 0 && !rail && (
        <div className="px-4 py-2 text-2xs text-faint">加载中…</div>
      )}

      {authenticated &&
        folders.map((folder) => (
          <LibraryFolderAccordion
            key={folder.id}
            folderId={folder.id}
            label={folder.name}
            count={folder.paper_count}
            open={openFolderKey === folder.id}
            active={activeTab === folder.id}
            rail={rail}
            onToggle={() => toggleFolder(folder.id)}
            selectedPaperId={selectedPaperId}
            onSelectPaper={setSelectedPaperId}
          />
        ))}

      {authenticated &&
        !foldersQ.isLoading &&
        folders.length === 0 &&
        !rail && (
          <div className="px-4 py-2 text-2xs text-faint">还没有文献集文件夹</div>
        )}
    </nav>
  );
}

function LibraryFolderAccordion({
  folderId,
  label,
  count,
  open,
  active,
  rail,
  onToggle,
  selectedPaperId,
  onSelectPaper,
}: {
  folderId: number;
  label: string;
  count: number;
  open: boolean;
  active: boolean;
  rail: boolean;
  onToggle: () => void;
  selectedPaperId: string | null;
  onSelectPaper: (id: string | null) => void;
}) {
  const papersQ = useLibraryPapers(folderId, {
    pageSize: 200,
    enabled: open,
  });
  const papers = useMemo(
    () => (papersQ.data?.items ?? []).map(libraryRowToPaper),
    [papersQ.data?.items],
  );

  return (
    <FolderAccordion
      folderKey={folderId}
      label={label}
      count={count}
      icon="folder"
      open={open}
      active={active}
      rail={rail}
      onToggle={onToggle}
      papers={papers}
      loading={open && papersQ.isLoading}
      selectedPaperId={selectedPaperId}
      onSelectPaper={onSelectPaper}
    />
  );
}

function FolderAccordion({
  folderKey,
  label,
  count,
  icon,
  open,
  active,
  rail,
  onToggle,
  papers,
  loading,
  selectedPaperId,
  onSelectPaper,
  onRemovePaper,
}: {
  folderKey: FolderKey;
  label: string;
  count: number;
  icon: 'staging' | 'folder';
  open: boolean;
  active: boolean;
  rail: boolean;
  onToggle: () => void;
  papers: Paper[];
  loading?: boolean;
  selectedPaperId: string | null;
  onSelectPaper: (id: string | null) => void;
  onRemovePaper?: (paperId: string) => void;
}) {
  const { Icon, color, hasColor, iconShellClass, pickerProps } =
    useFolderAppearance(folderKey, icon);
  const iconShellActiveClass = cn(
    iconShellClass,
    !hasColor && active && 'text-foreground',
  );

  // 仅展开时可改图标/背景色；收起时仍展示已选样式
  const iconButton = open ? (
    <FolderIconPicker {...pickerProps}>
      <button
        type="button"
        title="更换图标与背景色"
        aria-label={`${label} · 更换图标与背景色`}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          iconShellActiveClass,
          'cursor-pointer transition-colors',
          !hasColor && 'hover:bg-surface-2 hover:text-foreground',
        )}
      >
        <Icon className="size-3.5" strokeWidth={2} />
      </button>
    </FolderIconPicker>
  ) : (
    <span className={iconShellActiveClass} aria-hidden>
      <Icon className="size-3.5" strokeWidth={2} />
    </span>
  );

  const isStagingFolder = folderKey === 'staging';
  const folderHover = (trigger: ReactNode) => (
    <FolderHoverCard
      label={label}
      count={count}
      kind={icon}
      open={open}
      papers={papers}
      Icon={Icon}
      iconClassName={cn(
        hasColor ? cn(color.bgClass, color.fgClass) : 'bg-surface-2 text-muted-foreground',
      )}
    >
      {trigger}
    </FolderHoverCard>
  );

  if (rail) {
    const railRowClass = cn(
      'group/folder flex h-8 w-full items-center justify-center gap-1 rounded-sm px-1 transition-colors',
      active ? 'bg-danger-soft' : 'hover:bg-surface-1',
    );
    const railIconClass = cn(
      'inline-flex size-5 shrink-0 items-center justify-center rounded-sm [&_svg]:size-3.5',
      hasColor
        ? cn(color.bgClass, color.fgClass)
        : active
          ? 'text-foreground'
          : 'text-muted-foreground',
    );
    const railRightClass = cn(
      'inline-flex w-[2ch] shrink-0 items-center justify-center text-2xs font-semibold tabular-nums leading-none',
      active ? 'text-brand-red' : 'text-faint group-hover/folder:text-muted-foreground',
    );

    return (
      <div
        className="flex flex-col"
        data-staging-folder={isStagingFolder ? '' : undefined}
      >
        {/* 窄轨强制单行：[左图标][右数字/折叠标]；hover 出文件夹信息 */}
        {open
          ? folderHover(
              <div
                className={railRowClass}
                data-stage-fly-target={isStagingFolder ? '' : undefined}
              >
                <FolderIconPicker {...pickerProps}>
                  <button
                    type="button"
                    title="更换图标与背景色"
                    aria-label={`${label} · 更换图标与背景色`}
                    onClick={(e) => e.stopPropagation()}
                    className={railIconClass}
                  >
                    <Icon strokeWidth={2} />
                  </button>
                </FolderIconPicker>
                <button
                  type="button"
                  onClick={onToggle}
                  title={`收起 ${label}`}
                  aria-label={`收起 ${label}`}
                  aria-expanded
                  className={railRightClass}
                >
                  <ChevronDown className="size-3" strokeWidth={2.2} />
                </button>
              </div>,
            )
          : folderHover(
              <button
                type="button"
                onClick={onToggle}
                title={`${label} · ${count}`}
                aria-label={`${label}, ${count}`}
                aria-expanded={false}
                className={railRowClass}
                data-stage-fly-target={isStagingFolder ? '' : undefined}
              >
                <span className={railIconClass} aria-hidden>
                  <Icon strokeWidth={2} />
                </span>
                <span className={railRightClass}>{formatRailCount(count)}</span>
              </button>,
            )}
        {open && (
          <div className="flex flex-col gap-0.5 pb-1">
            {loading && (
              <Loader2 className="mx-auto my-1 size-3 animate-spin text-faint" />
            )}
            {!loading &&
              papers.map((p) => (
                <WorkspacePaperUnit
                  key={`${p.source ?? 'x'}:${p.paperId}`}
                  paper={p}
                  rail
                  selected={selectedPaperId === p.paperId}
                  onSelect={() => onSelectPaper(p.paperId)}
                  onRemove={onRemovePaper}
                />
              ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col"
      data-staging-folder={isStagingFolder ? '' : undefined}
    >
      {folderHover(
        <div
          className={cn(
            'group/folder flex h-8 w-full items-center gap-1.5 px-3 transition-colors',
            active ? 'bg-danger-soft' : 'hover:bg-surface-1',
          )}
          data-stage-fly-target={isStagingFolder ? '' : undefined}
        >
          {iconButton}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-base',
                active ? 'font-bold text-foreground' : 'text-subtle',
              )}
            >
              {label}
            </span>
            <span className="shrink-0 text-2xs tabular-nums text-faint">
              {count.toLocaleString()}
            </span>
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 text-faint transition-transform',
                !open && '-rotate-90',
              )}
            />
          </button>
        </div>,
      )}

      {open && (
        <div className="flex flex-col pb-1 pt-0.5">
          {loading && (
            <div className="flex justify-center py-3">
              <Loader2 className="size-4 animate-spin text-faint" />
            </div>
          )}
          {!loading && papers.length === 0 && (
            <p className="px-4 py-2 text-2xs text-faint">
              {icon === 'staging'
                ? '暂存区还是空的'
                : '此文件夹还没有论文'}
            </p>
          )}
          {!loading &&
            papers.map((p) => (
              <WorkspacePaperUnit
                key={`${p.source ?? 'x'}:${p.paperId}`}
                paper={p}
                rail={false}
                selected={selectedPaperId === p.paperId}
                onSelect={() => onSelectPaper(p.paperId)}
                onRemove={onRemovePaper}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function FolderHoverCard({
  label,
  count,
  kind,
  open,
  papers,
  Icon,
  iconClassName,
  children,
}: {
  label: string;
  count: number;
  kind: 'staging' | 'folder';
  open: boolean;
  papers: Paper[];
  Icon: LucideIcon;
  iconClassName: string;
  children: ReactNode;
}) {
  const preview = papers.slice(0, 3);
  const more = Math.max(0, count - preview.length);

  return (
    <HoverCard openDelay={140} closeDelay={80}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-[260px] p-3"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <span
              className={cn(
                'inline-flex size-7 shrink-0 items-center justify-center rounded-sm [&_svg]:size-3.5',
                iconClassName,
              )}
            >
              <Icon strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">
                {label}
              </div>
              <div className="mt-0.5 text-2xs text-faint">
                {kind === 'staging' ? '暂存区' : '文献集文件夹'}
                {' · '}
                {open ? '已展开' : '已收起'}
              </div>
            </div>
            <span className="shrink-0 text-2xs font-semibold tabular-nums text-subtle">
              {count.toLocaleString()} 篇
            </span>
          </div>

          {preview.length > 0 ? (
            <ul className="flex flex-col gap-1 border-t border-border-soft pt-2">
              {preview.map((p) => (
                <li
                  key={`${p.source ?? 'x'}:${p.paperId}`}
                  className="truncate text-2xs leading-snug text-subtle"
                  title={p.title || '无标题'}
                >
                  {p.title || '无标题'}
                </li>
              ))}
              {more > 0 && (
                <li className="text-2xs text-faint">还有 {more} 篇…</li>
              )}
            </ul>
          ) : (
            <p className="border-t border-border-soft pt-2 text-2xs text-faint">
              {count > 0
                ? `展开可查看 ${count.toLocaleString()} 篇文献`
                : kind === 'staging'
                  ? '暂存区还是空的'
                  : '还没有论文'}
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export type { WorkspaceFolderTab };
