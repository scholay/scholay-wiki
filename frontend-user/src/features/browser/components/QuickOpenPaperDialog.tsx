import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ArrowRight, FileText, Loader2, Search, X } from 'lucide-react';
import { useOpenPaperInBrowser } from '@/shared/hooks';
import { SourceBadge } from '@/shared/components/SourceBadge';
import { cn } from '@/shared/lib/utils';
// 跨 feature import —— quick-search 当前仍住在 library/api(纯上游论文聚合搜索,
// 不依赖任何 library 用户数据);未来可考虑提到 shared/api,但此次仅做路由搬迁
import { useArrivalOrderedPapers, useQuickPaperSearch } from '@/shared/api/quick-search';
import type { Paper, PaperSource } from '@/shared/api/types';

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
  /** 选中论文后的回调;缺省走浏览器内新开 tab */
  onPickPaper?: (paper: Paper) => void;
}

export function QuickOpenPaperDialog({
  children,
  align = 'end',
  onPickPaper,
}: QuickOpenPaperDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const openPaperInBrowser = useOpenPaperInBrowser();
  const openPaper = onPickPaper ?? openPaperInBrowser;

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
            'z-modal w-[520px] max-w-[calc(100vw-32px)]',
            // dvh 而非 vh:iOS Safari 地址栏收起/展开会改 vh,弹层底部会被盖住
            'flex flex-col max-h-[min(70dvh,640px)] overflow-hidden',
            'rounded-12 border border-border bg-surface-card shadow-overlay',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          {/* searchBar —— 高度走 h-control-xl(= 44px,Figma §4.5 搜索框 312×44),
              原先是等值的 arbitrary `h-[44px]` */}
          <div className="flex items-center gap-2.5 h-control-xl px-3 border-b border-border-soft focus-within:border-border-control transition-colors shrink-0">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            {/* outline-none 合法:焦点可供性由外层搜索条的 focus-within:border-border-control 提供 */}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入论文标题关键词 …"
              maxLength={128}
              className="flex-1 min-w-0 h-full bg-transparent text-12 font-medium text-foreground outline-none placeholder:text-faint placeholder:font-normal"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="清空"
                className="inline-flex h-5 w-5 items-center justify-center rounded-4 text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
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
                  <li className="flex items-center justify-center gap-2 px-3 py-3 text-12 text-faint">
                    <Loader2 className="size-3 animate-spin" />
                    其他源继续加载中…
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* footer */}
          <div className="flex items-center justify-end h-9 px-3 bg-surface-1 border-t border-border-soft shrink-0">
            <span className="text-12 text-muted-foreground">
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
    <div className="flex items-center justify-center py-16 px-6 text-center text-12 text-faint">
      {text}
    </div>
  );
}

function CenterLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-12 text-faint">
      <Loader2 className="size-4 animate-spin" />
      搜索中…
    </div>
  );
}

function NoResultsHint({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
      <div className="text-12 text-muted-foreground">
        没有命中{' '}
        <span className="font-medium text-foreground">「{query}」</span>
      </div>
      <div className="text-12 text-faint">试试换个关键词或缩短词组</div>
    </div>
  );
}

// useArrivalOrderedPapers 已提升到 @/shared/api/quick-search(与文件夹在线搜索共用)。

export default QuickOpenPaperDialog;
