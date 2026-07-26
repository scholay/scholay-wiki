import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FileText, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { SourceBadge } from '@/shared/components/SourceBadge';
import { cn } from '@/shared/lib/utils';
import { useArrivalOrderedPapers, useQuickPaperSearch } from '@/shared/api/quick-search';
import { useFavoriteCheck } from '@/shared/api/user-library-mutations';
import type {
  Paper,
  PaperSource,
  UpstreamSource,
  UserLibraryPaper,
} from '@/shared/api/types';
import type { LibraryFolderFilter } from '../../api/papers';
import { formatAuthorsDisplay } from '../../lib/resolve-paper';
import { DialogFooterBar, footerOutlineCn } from '../shared/dialog-chrome';

/**
 * 在线搜索加入 tab —— 嵌入式版本(原 QuickAddDialog 是 popover 形态)。
 *
 * 与 QuickAddDialog 共用同一份 search API(`useQuickPaperSearch`)+ 同样的
 * 多源 arrival-order 拼接逻辑;UI 上做了适配:撑满 tab body,无独立外壳。
 * QuickAddDialog 工具栏快捷弹层后续保留(快交互场景仍用 popover),本 tab
 * 走"严肃添加"场景。
 */

interface OnlineSearchTabProps {
  currentFilter: LibraryFolderFilter;
  currentFolderName: string;
  onDone: () => void;
  /** 收藏成功后点「完善信息」→ 工作台原地切到该行的管理语境 */
  onManagePaper: (row: UserLibraryPaper) => void;
}

export function OnlineSearchTab({
  currentFilter,
  currentFolderName,
  onDone,
  onManagePaper,
}: OnlineSearchTabProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [favoritedRows, setFavoritedRows] = useState<Map<string, UserLibraryPaper>>(
    new Map()
  );
  const navigate = useNavigate();

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const sourceResults = useQuickPaperSearch(query);
  const orderedPapers = useArrivalOrderedPapers(sourceResults, query);

  // 已收藏初始态:按结果实际源分桶,三源各一次 check(与智能搜索同款「用结果实际源」
  // 约定)。让库里已有的论文一进列表就显示已收藏,而非等本会话收藏后才亮。
  const idsBySource = useMemo(() => {
    const b: Record<UpstreamSource, string[]> = { stc: [], olx: [], pmd: [] };
    for (const p of orderedPapers) {
      const s = (p.source ?? 'stc') as UpstreamSource;
      if (s === 'stc' || s === 'olx' || s === 'pmd') b[s].push(p.paperId);
    }
    return b;
  }, [orderedPapers]);
  const stcSaved = useFavoriteCheck('stc', idsBySource.stc);
  const olxSaved = useFavoriteCheck('olx', idsBySource.olx);
  const pmdSaved = useFavoriteCheck('pmd', idsBySource.pmd);
  const serverSaved = (paper: Paper): boolean => {
    const s = paper.source ?? 'stc';
    const set = s === 'olx' ? olxSaved.data : s === 'pmd' ? pmdSaved.data : stcSaved.data;
    return set?.has(paper.paperId) ?? false;
  };

  const totalCount = orderedPapers.length;
  const allDone = sourceResults.every((r) => !r.isLoading);
  const hasQuery = query.trim().length > 0;
  const initialLoading = hasQuery && !allDone && totalCount === 0;

  // 工作台已是「加到当前文献集」语境(头/脚已声明目标):具体夹用其 id,根/全部视图用 null
  // (= 默认文件夹直接收藏)。**不能用 undefined** —— 那会让 FavoritePaperButton 在已打开的
  // 工作台弹窗之上再弹一个全局文件夹选择器(弹窗叠弹窗 + 行为回归)。
  const folderId = typeof currentFilter === 'number' ? currentFilter : null;

  const handleJumpToSearch = () => {
    const q = query.trim();
    onDone();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  const handleFavoriteSuccess = (paper: Paper, row: UserLibraryPaper) => {
    const key = `${paper.source ?? 'stc'}:${paper.paperId}`;
    setFavoritedRows((m) => {
      const next = new Map(m);
      next.set(key, row);
      return next;
    });
    toast.success(`已加入「${currentFolderName}」`);
  };

  // 收藏后又在本弹窗内取消 → 本地"已收藏"态同步回退(否则「完善信息」会指向已删的行)
  const handleUnfavorited = (paper: Paper) => {
    const key = `${paper.source ?? 'stc'}:${paper.paperId}`;
    setFavoritedRows((m) => {
      if (!m.has(key)) return m;
      const next = new Map(m);
      next.delete(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 搜索条 */}
      <div className="flex items-center gap-2.5 h-11 px-6 border-b border-border-soft">
        <Search className="size-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入论文标题关键词 …"
          maxLength={128}
          className="flex-1 min-w-0 h-full bg-transparent text-14 font-medium text-foreground outline-none placeholder:text-faint placeholder:font-normal"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="清空"
            className="inline-flex h-5 w-5 items-center justify-center rounded-4 text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* 列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!hasQuery ? (
          <EmptyHint text="输入关键词后开始搜索" />
        ) : initialLoading ? (
          <CenterLoading />
        ) : totalCount === 0 ? (
          <NoResultsHint query={query} onJumpToSearch={handleJumpToSearch} />
        ) : (
          <ul>
            {orderedPapers.map((p) => {
              const key = `${p.source ?? 'stc'}:${p.paperId}`;
              return (
                <PaperRow
                  key={key}
                  paper={p}
                  favoritedRow={favoritedRows.get(key)}
                  serverSaved={serverSaved(p)}
                  folderId={folderId}
                  onFavoriteSuccess={handleFavoriteSuccess}
                  onUnfavorited={handleUnfavorited}
                  onManagePaper={onManagePaper}
                />
              );
            })}
            {!allDone && (
              <li className="flex items-center justify-center gap-2 px-6 py-3 text-12 text-faint">
                <Loader2 className="size-3 animate-spin" />
                其他源继续加载中…
              </li>
            )}
          </ul>
        )}
      </div>

      {/* footer */}
      <DialogFooterBar
        hint={
          <>
            收藏到{' '}
            <span className="font-medium text-foreground">
              「{currentFolderName}」
            </span>
          </>
        }
      >
        <button type="button" onClick={onDone} className={footerOutlineCn}>
          完成
        </button>
      </DialogFooterBar>
    </div>
  );
}

// ============================================================================
// 子组件 —— 与 QuickAddDialog 相似,但 padding 适配嵌入式布局
// ============================================================================

function PaperRow({
  paper,
  favoritedRow,
  serverSaved,
  folderId,
  onFavoriteSuccess,
  onUnfavorited,
  onManagePaper,
}: {
  paper: Paper;
  /** 本会话收藏时为创建的文献集行(收藏成功回调带回),未在本会话收藏为 undefined */
  favoritedRow: UserLibraryPaper | undefined;
  /** 库里早已收藏(来自 useFavoriteCheck 初始态);此时不一定有 favoritedRow */
  serverSaved: boolean;
  folderId: number | null;
  onFavoriteSuccess: (paper: Paper, row: UserLibraryPaper) => void;
  onUnfavorited: (paper: Paper) => void;
  onManagePaper: (row: UserLibraryPaper) => void;
}) {
  // 无作者时回落 venue(与原本地逻辑一致)
  const authorsLine = formatAuthorsDisplay(paper.authors) || paper.venue || '';

  const source = (paper.source ?? 'stc') as PaperSource;

  return (
    <li className="group flex items-center gap-2.5 px-6 py-2.5 hover:bg-surface-1 transition-colors">
      <div className="flex h-6 w-6 items-center justify-center rounded-8 bg-surface-card border border-border shrink-0">
        <FileText className="size-3.5 text-subtle" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="truncate text-14 font-medium text-foreground"
          title={paper.title ?? '无标题'}
        >
          {paper.title ?? '无标题'}
        </div>
        <div className="flex items-center gap-2 text-12 text-muted-foreground mt-0.5 truncate">
          {source !== 'local' && (
            <SourceBadge source={source} variant="letter" size="sm" />
          )}
          {authorsLine && <span className="truncate">{authorsLine}</span>}
          {paper.year && (
            <>
              <span className="text-faint">·</span>
              <span className="shrink-0 tabular-nums">{paper.year}</span>
            </>
          )}
          {typeof paper.citationCount === 'number' && paper.citationCount > 0 && (
            <>
              <span className="text-faint">·</span>
              <span className="shrink-0 tabular-nums">
                {paper.citationCount} 引用
              </span>
            </>
          )}
        </div>
      </div>
      {favoritedRow && (
        <button
          type="button"
          onClick={() => onManagePaper(favoritedRow)}
          className="inline-flex items-center h-7 px-2 rounded-8 border border-brand-amber text-12 font-medium text-brand-amber hover:bg-warning-soft transition-colors shrink-0"
        >
          完善信息
        </button>
      )}
      <FavoritePaperButton
        paper={paper}
        isFavorited={favoritedRow != null || serverSaved}
        folderId={folderId}
        variant="icon"
        size="lg"
        showToast={false}
        // 本 tab 自己在 onFavoriteSuccess 里 toast「已加入文件夹」,收藏反馈走
        // 单通道:跳过 burst / 兜底 toast,避免双 toast
        silentSuccess
        onSuccess={(row: UserLibraryPaper) => onFavoriteSuccess(paper, row)}
        onUnfavorited={() => onUnfavorited(paper)}
      />
    </li>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-20 px-6 text-center text-12 text-faint">
      {text}
    </div>
  );
}

function CenterLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-12 text-faint">
      <Loader2 className="size-4 animate-spin" />
      搜索中…
    </div>
  );
}

function NoResultsHint({
  query,
  onJumpToSearch,
}: {
  query: string;
  onJumpToSearch: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <div className="text-14 text-muted-foreground">
        没有命中{' '}
        <span className="font-medium text-foreground">「{query}」</span>
      </div>
      <div className="text-12 text-faint">
        试试用论文完整标题中的几个关键词,或换个表达
      </div>
      <button
        type="button"
        onClick={onJumpToSearch}
        className={cn(
          'inline-flex items-center gap-1.5 mt-1 h-8 px-3 rounded-8',
          'bg-foreground text-background text-14 font-medium',
          'hover:bg-foreground/85 transition-colors'
        )}
      >
        去主搜索页继续搜索
        <ArrowRight className="size-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}

// useArrivalOrderedPapers 已提升到 @/shared/api/quick-search(与浏览器快速打开共用)。
