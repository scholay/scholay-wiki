import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ArrowRight, FileText, Loader2, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { FavoritePaperButton } from '@/shared/components/FavoritePaperButton';
import { SourceBadge } from '@/shared/components/SourceBadge';
import { cn } from '@/shared/lib/utils';
import { useQuickPaperSearch } from '../api/quick-search';
import type { Paper, PaperSource, UpstreamSource } from '@/shared/api/types';
import type { LibraryFolderFilter } from '../api/papers';

/**
 * 文献集 · 快捷在线搜索加入 —— **anchored popover** 形态,出现在触发按钮下方。
 *
 *   触发按钮(由 caller 作 children 传入)
 *      ↓ click
 *   ┌─ popover (anchored, w-[520]) ─────────────────────┐
 *   │  🔍 [ 输入论文标题关键词 … ]                  [X] │ searchBar
 *   ├───────────────────────────────────────────────────┤
 *   │  📄 Title [D] authors · year         [bookmark]  │
 *   │  📄 Title [G] authors · year         [bookmark]  │
 *   │  ... 其他源到达后静默追加 ...                       │
 *   ├───────────────────────────────────────────────────┤
 *   │  收藏到「<当前文件夹>」                              │ footer
 *   └───────────────────────────────────────────────────┘
 *
 * 单一统一列表(不再按源分段):
 *   - 空查询 → 一句空白提示
 *   - 搜索中(还没任何源返回)→ 一个 loading
 *   - 任一源出结果 → 立即铺出来;其他源后到 → 静默追加在尾部(arrival order)
 *   - 每行带 source badge(D/G/M),用户仍能识别来源
 */

interface QuickAddDialogProps {
  /** 触发按钮 —— 必须是支持 ref forward 的元素,Radix PopoverTrigger asChild 用 */
  children: ReactNode;
  /**
   * 当前定位的文件夹 —— LibraryFolderView 的 filter:
   *   - number  → 该文件夹 ID
   *   - 'root'  → 默认文件夹(后端 fallback)
   */
  currentFilter: LibraryFolderFilter;
  currentFolderName: string;
  /** 弹层相对触发按钮的对齐方式 —— 默认 start(左对齐),用法广 */
  align?: 'start' | 'center' | 'end';
}

export function QuickAddDialog({
  children,
  currentFilter,
  currentFolderName,
  align = 'start',
}: QuickAddDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [favoritedKeys, setFavoritedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setQuery('');
      setFavoritedKeys(new Set());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const sourceResults = useQuickPaperSearch(query);
  const orderedPapers = useArrivalOrderedPapers(sourceResults, query);

  const totalCount = orderedPapers.length;
  const allDone = sourceResults.every((r) => !r.isLoading);
  const hasQuery = query.trim().length > 0;
  const initialLoading = hasQuery && !allDone && totalCount === 0;

  const navigate = useNavigate();
  const folderId = typeof currentFilter === 'number' ? currentFilter : undefined;

  const handleJumpToSearch = () => {
    const q = query.trim();
    setOpen(false);
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  const handleFavoriteSuccess = (paper: Paper) => {
    const key = `${paper.source ?? 'stc'}:${paper.paperId}`;
    setFavoritedKeys((s) => {
      const next = new Set(s);
      next.add(key);
      return next;
    });
    toast.success(`已加入「${currentFolderName}」`);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          side="bottom"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-50 w-[520px] max-w-[calc(100vw-32px)]',
            'flex flex-col max-h-[min(70vh,640px)] overflow-hidden',
            'rounded-lg border border-border bg-background shadow-[0_8px_24px_rgba(15,23,42,0.12)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          {/* searchBar */}
          <div className="flex items-center gap-2.5 h-[44px] px-3 border-b border-border-soft shrink-0">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入论文标题关键词 …"
              maxLength={128}
              className="flex-1 min-w-0 h-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-faint placeholder:font-normal"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="清空"
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>

          {/* body —— 单列表;空 / 加载 / 有数据 都不再按源分段 */}
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
                  const isFavorited = favoritedKeys.has(key);
                  return (
                    <PaperRow
                      key={key}
                      paper={p}
                      isFavorited={isFavorited}
                      folderId={folderId}
                      onFavoriteSuccess={handleFavoriteSuccess}
                    />
                  );
                })}
                {!allDone && (
                  <li className="flex items-center justify-center gap-2 px-3 py-3 text-2xs text-faint">
                    <Loader2 className="size-3 animate-spin" />
                    其他源继续加载中…
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* footer —— 文件夹归属提示 */}
          <div className="flex items-center justify-end h-9 px-3 bg-surface-1 border-t border-border-soft shrink-0">
            <span className="text-2xs text-muted-foreground truncate max-w-[60%]">
              收藏到{' '}
              <span className="font-semibold text-foreground">
                「{currentFolderName}」
              </span>
            </span>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ============================================================================
// 子组件
// ============================================================================

interface PaperRowProps {
  paper: Paper;
  isFavorited: boolean;
  folderId: number | undefined;
  onFavoriteSuccess: (paper: Paper) => void;
}

function PaperRow({
  paper,
  isFavorited,
  folderId,
  onFavoriteSuccess,
}: PaperRowProps) {
  const authorsLine = useMemo(() => {
    const names = (paper.authors ?? []).map((a) => a.name).filter(Boolean);
    if (names.length === 0) return paper.venue ?? '';
    const head = names.slice(0, 3).join(', ');
    return names.length > 3 ? `${head} et al.` : head;
  }, [paper.authors, paper.venue]);

  const year = paper.year;
  const source = (paper.source ?? 'stc') as PaperSource;

  return (
    <li className="group flex items-center gap-2.5 px-3 py-2 hover:bg-surface-1 transition-colors">
      {/* icon 容器 —— .pen `eVKGf` 24x24 bg白 border #E5E5E4 */}
      <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-background border border-border shrink-0">
        <FileText className="size-3.5 text-subtle" strokeWidth={2} />
      </div>

      {/* 中间:标题 + meta(行内 source badge) */}
      <div className="flex-1 min-w-0">
        <div
          className="truncate text-sm font-semibold text-foreground"
          title={paper.title ?? '无标题'}
        >
          {paper.title ?? '无标题'}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 truncate">
          {source !== 'local' && (
            <SourceBadge source={source} variant="letter" size="sm" />
          )}
          {authorsLine && <span className="truncate">{authorsLine}</span>}
          {year && (
            <>
              <span className="text-faint">·</span>
              <span className="shrink-0 tabular-nums">{year}</span>
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

      {/* 收藏按钮 —— icon 变体,size=lg(.pen `Yp0DR` 32x32 槽位匹配) */}
      <FavoritePaperButton
        paper={paper}
        isFavorited={isFavorited}
        folderId={folderId}
        variant="icon"
        size="lg"
        showToast={false}
        onSuccess={() => onFavoriteSuccess(paper)}
      />
    </li>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-16 px-6 text-center text-xs text-faint">
      {text}
    </div>
  );
}

function CenterLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-xs text-faint">
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
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
      <div className="text-sm text-muted-foreground">
        没有命中{' '}
        <span className="font-semibold text-foreground">「{query}」</span>
      </div>
      <div className="text-xs text-faint">
        试试用论文完整标题中的几个关键词,或换个表达
      </div>
      {/* 兜底 CTA —— 把当前关键词带去主搜索页,等价于"从首页重新搜一次",
          能用到主搜索的全部筛选器 / 多模式工作区,命中率比纯标题搜更广。 */}
      <button
        type="button"
        onClick={onJumpToSearch}
        className="inline-flex items-center gap-1.5 mt-1 h-8 px-3 rounded-sm bg-foreground text-background text-xs font-semibold hover:bg-foreground/85 transition-colors"
      >
        去主搜索页继续搜索
        <ArrowRight className="size-3.5" strokeWidth={2.25} />
      </button>
    </div>
  );
}

// ============================================================================
// arrival-order 拼接 —— 哪个源先返回先展示,后到的静默追加在尾部
// 与 features/browser/components/QuickOpenPaperDialog 的同名 hook 心智一致;
// 两处都是 anchored popover 短期生命周期组件,各自一份小 hook 不必抽 shared。
// ============================================================================

function useArrivalOrderedPapers(
  sourceResults: ReturnType<typeof useQuickPaperSearch>,
  query: string
): Paper[] {
  const [arrivalOrder, setArrivalOrder] = useState<UpstreamSource[]>([]);

  useEffect(() => {
    setArrivalOrder([]);
  }, [query]);

  useEffect(() => {
    for (const r of sourceResults) {
      if (!r.isLoading) {
        setArrivalOrder((prev) =>
          prev.includes(r.source) ? prev : [...prev, r.source]
        );
      }
    }
  }, [sourceResults]);

  return useMemo(() => {
    const out: Paper[] = [];
    for (const src of arrivalOrder) {
      const r = sourceResults.find((x) => x.source === src);
      if (r) out.push(...r.papers);
    }
    return out;
  }, [arrivalOrder, sourceResults]);
}
