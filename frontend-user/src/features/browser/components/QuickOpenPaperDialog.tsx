import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ArrowRight, FileText, Loader2, Search, X } from 'lucide-react';
import { useOpenPaperInBrowser } from '@/shared/hooks';
import { SourceBadge } from '@/shared/components/SourceBadge';
import { cn } from '@/shared/lib/utils';
// 跨 feature import —— quick-search 当前仍住在 library/api(纯上游论文聚合搜索,
// 不依赖任何 library 用户数据);未来可考虑提到 shared/api,但此次仅做路由搬迁
import { useQuickPaperSearch } from '@/features/library/api/quick-search';
import type { Paper, PaperSource, UpstreamSource } from '@/shared/api/types';

/**
 * 新建详情页签 —— **anchored popover** 形态(从 tabs 条 "+" 按钮弹出)。
 *
 * 统一单列表布局:
 *   - 空查询 → 一句空白提示
 *   - 搜索中(还没任何源返回)→ 一个 loading
 *   - 任一源出结果 → 立即铺出来,后续源完成 → 静默追加在后面(arrival order)
 *   - 每行有 source badge(D/G/M)知道来源,但不再按源分段
 *
 * 包裹 trigger 作 children:
 *   <QuickOpenPaperDialog>
 *     <button>+</button>
 *   </QuickOpenPaperDialog>
 */

interface QuickOpenPaperDialogProps {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
}

export function QuickOpenPaperDialog({
  children,
  align = 'end',
}: QuickOpenPaperDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const openPaper = useOpenPaperInBrowser();

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const sourceResults = useQuickPaperSearch(query);
  const orderedPapers = useArrivalOrderedPapers(sourceResults, query);

  const totalCount = orderedPapers.length;
  const allDone = sourceResults.every((r) => !r.isLoading);
  const hasQuery = query.trim().length > 0;
  // 首条结果之前的全局 loading —— 只在还没任何 papers 时显示
  const initialLoading = hasQuery && !allDone && totalCount === 0;

  const handlePick = (paper: Paper) => {
    openPaper(paper);
    setOpen(false);
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

          {/* body —— 单列表,空 / 加载 / 有数据 三态都不再按源分段 */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {!hasQuery ? (
              <EmptyHint text="输入关键词后开始搜索" />
            ) : initialLoading ? (
              <CenterLoading />
            ) : totalCount === 0 ? (
              <NoResultsHint query={query} />
            ) : (
              <ul>
                {orderedPapers.map((p) => (
                  <PaperRow
                    key={`${p.source ?? 'stc'}:${p.paperId}`}
                    paper={p}
                    onPick={handlePick}
                  />
                ))}
                {/* 已有结果但还有源在加载 —— 列表尾部一个极简 inline 提示 */}
                {!allDone && (
                  <li className="flex items-center justify-center gap-2 px-3 py-3 text-2xs text-faint">
                    <Loader2 className="size-3 animate-spin" />
                    其他源继续加载中…
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* footer */}
          <div className="flex items-center justify-end h-9 px-3 bg-surface-1 border-t border-border-soft shrink-0">
            <span className="text-2xs text-muted-foreground">
              点击任一行打开详情
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

function PaperRow({
  paper,
  onPick,
}: {
  paper: Paper;
  onPick: (p: Paper) => void;
}) {
  const names = (paper.authors ?? []).map((a) => a.name).filter(Boolean);
  const authorsLine = names.slice(0, 3).join(', ');
  const overflow = names.length > 3 ? ' et al.' : '';
  const source = (paper.source ?? 'stc') as PaperSource;

  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(paper)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-1 transition-colors"
        title={`打开 "${paper.title}" 详情`}
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-background border border-border shrink-0">
          <FileText className="size-3.5 text-subtle" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="truncate text-sm font-semibold text-foreground"
            title={paper.title ?? '无标题'}
          >
            {paper.title ?? '无标题'}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 truncate">
            {/* source badge 行内放在 meta 行,知道来源但不抢标题视线 */}
            {source !== 'local' && (
              <SourceBadge source={source} variant="letter" size="sm" />
            )}
            {authorsLine && (
              <span className="truncate">
                {authorsLine}
                {overflow}
              </span>
            )}
            {paper.year && (
              <>
                <span className="text-faint">·</span>
                <span className="shrink-0 tabular-nums">{paper.year}</span>
              </>
            )}
            {typeof paper.citationCount === 'number' &&
              paper.citationCount > 0 && (
                <>
                  <span className="text-faint">·</span>
                  <span className="shrink-0 tabular-nums">
                    {paper.citationCount} 引用
                  </span>
                </>
              )}
          </div>
        </div>
        <ArrowRight
          className="size-4 text-faint shrink-0"
          strokeWidth={2}
          aria-hidden
        />
      </button>
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

function NoResultsHint({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
      <div className="text-sm text-muted-foreground">
        没有命中{' '}
        <span className="font-semibold text-foreground">「{query}」</span>
      </div>
      <div className="text-xs text-faint">试试换个关键词或缩短词组</div>
    </div>
  );
}

// ============================================================================
// arrival-order 拼接 —— 哪个源先返回先展示,后到的静默追加在后面
// query 一变 → 重置;源 loading→done 时按顺序追加进 arrivalOrder
// ============================================================================

function useArrivalOrderedPapers(
  sourceResults: ReturnType<typeof useQuickPaperSearch>,
  query: string
): Paper[] {
  const [arrivalOrder, setArrivalOrder] = useState<UpstreamSource[]>([]);

  // query 变化 → 重置 arrival 顺序(新一轮搜索)
  useEffect(() => {
    setArrivalOrder([]);
  }, [query]);

  // 任何源从 loading → done(无论有无结果)都按顺序追加进 arrivalOrder
  useEffect(() => {
    for (const r of sourceResults) {
      if (!r.isLoading) {
        setArrivalOrder((prev) =>
          prev.includes(r.source) ? prev : [...prev, r.source]
        );
      }
    }
  }, [sourceResults]);

  // 按 arrival 顺序拼 papers;还没到的源不显示
  return useMemo(() => {
    const out: Paper[] = [];
    for (const src of arrivalOrder) {
      const r = sourceResults.find((x) => x.source === src);
      if (r) out.push(...r.papers);
    }
    return out;
  }, [arrivalOrder, sourceResults]);
}

export default QuickOpenPaperDialog;
