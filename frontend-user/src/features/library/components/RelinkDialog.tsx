import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  BookmarkCheck,
  FileText,
  Link2Off,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/shared/ui/dialog';
import { HighlightedText } from '@/shared/components/HighlightedText';
import { ConfirmPopover } from '@/shared/components/ConfirmPopover';
import { cn } from '@/shared/lib/utils';
import {
  useRelinkPaper,
  useRelinkSearch,
  useUnlinkPaper,
} from '../api/relink';
import type { SearchHit } from '../api/upload-resolve';
import type { ConfirmLink } from '../api/upload-resolve';

/**
 * 后期关联弹窗 —— 用 row.og_title (或 row.title) 自动搜三源,用户挑一条 → relink。
 *
 *   ┌─ rounded-lg shadow ──────────────────────────────────┐
 *   │  🔁 关联论文 · "<当前 og_title>"            [×]      │ header
 *   │  [ 编辑搜索词输入框                       ] [↻]      │ 自定义搜索
 *   ├──────────────────────────────────────────────────────┤
 *   │  论文 · STC | OpenAlex | PubMed  (已收藏排在前)        │
 *   │   📄 Title  authors · year   [已收藏 chip]            │
 *   │   ...                                                 │
 *   ├──────────────────────────────────────────────────────┤
 *   │  [Esc 关闭]                                           │ footer
 *   └──────────────────────────────────────────────────────┘
 *
 * 命中后:点行 → 合并(若用户已经收藏过同上游)或原地改 source。
 */

interface RelinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paperId: number;
  /** 默认搜索词 —— 弹窗打开时预填,可由用户编辑 */
  defaultTitle: string;
  /**
   * 当前是否已经关联到上游(origin='upload' + link_state='linked')。
   * 传 true 时 footer 左侧出现"移除关联"按钮,点击 → ConfirmPopover → 调用 unlink。
   */
  isLinked?: boolean;
}

export function RelinkDialog({
  open,
  onOpenChange,
  paperId,
  defaultTitle,
  isLinked = false,
}: RelinkDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [activeTitle, setActiveTitle] = useState(defaultTitle);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 弹窗打开时复位 + focus 输入框
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setActiveTitle(defaultTitle);
      setError(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, defaultTitle]);

  // 搜索:activeTitle 变化时触发(用户点搜索按钮 / 按 Enter)
  const searchQ = useRelinkSearch(
    open ? paperId : null,
    // 只有用户改了才传 override;否则 backend 用 og_title 兜底
    activeTitle !== defaultTitle ? activeTitle : undefined
  );

  const relinkMut = useRelinkPaper();
  const unlinkMut = useUnlinkPaper();

  const handleUnlink = async () => {
    if (unlinkMut.isPending) return;
    try {
      await unlinkMut.mutateAsync(paperId);
      toast.success('已取消关联,论文恢复为本地文件');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消关联失败');
    }
  };

  const handleSearch = () => {
    setActiveTitle(title.trim());
    setError(null);
  };

  const handlePick = (hit: SearchHit) => {
    if (relinkMut.isPending) return;
    setError(null);
    const link: ConfirmLink = {
      source: hit.source,
      source_paper_id: hit.source_paper_id,
      title: hit.title,
      abstract: hit.abstract,
      year: hit.year,
      venue: hit.venue,
      doi: hit.doi,
      citation_count: hit.citation_count,
      pdf_url: hit.pdf_url,
      authors: hit.authors,
      raw: hit.raw,
    };
    relinkMut.mutate(
      { paperId, link },
      {
        onSuccess: (r) => {
          toast.success(
            r.merged
              ? `已合并到已有收藏「${hit.title || '无标题'}」`
              : '关联成功'
          );
          onOpenChange(false);
        },
        onError: (err: unknown) => {
          setError(err instanceof Error ? err.message : '关联失败');
        },
      }
    );
  };

  const hits = searchQ.data?.hits ?? [];
  const usedTitle = searchQ.data?.used_title ?? defaultTitle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-foreground/30 backdrop-blur-[2px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[720px] max-w-[calc(100vw-32px)]',
            '-translate-x-1/2 -translate-y-1/2',
            'flex flex-col max-h-[80vh] overflow-hidden',
            'rounded-lg border border-border bg-background',
            'shadow-[0_8px_24px_rgba(15,23,42,0.12)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          {/* header */}
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 shrink-0">
            <div className="min-w-0">
              <DialogPrimitive.Title className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                <RefreshCw className="size-4 text-brand-amber" />
                关联到上游论文
              </DialogPrimitive.Title>
              <p className="mt-1 text-xs text-muted-foreground">
                自动从多个上游论文源搜索 ·
                <span className="ml-1">
                  选中后:已收藏的会自动合并,未收藏的原地切换 source
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="关闭"
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-faint hover:bg-surface-2 hover:text-foreground shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 搜索词编辑框 */}
          <div className="px-5 pb-3 shrink-0">
            <div
              className={cn(
                'flex items-center gap-2 h-10 px-3 rounded-sm bg-surface-1 border border-border-strong',
                'focus-within:border-foreground focus-within:ring-2 focus-within:ring-ring/20 transition-colors'
              )}
            >
              <Search className="size-3.5 text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
                placeholder="搜索词(默认用 AI 识别的标题)…"
                maxLength={256}
                className="flex-1 min-w-0 h-full bg-transparent text-sm outline-none placeholder:text-faint"
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={searchQ.isFetching || title.trim() === ''}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-sm bg-foreground text-background text-xs font-semibold hover:bg-foreground/85 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {searchQ.isFetching ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Search className="size-3" />
                )}
                搜索
              </button>
            </div>
          </div>

          {/* body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-3">
            {searchQ.isLoading ? (
              <LoadingHint />
            ) : searchQ.isError ? (
              <ErrorHint message={(searchQ.error as Error)?.message ?? '搜索失败'} />
            ) : hits.length === 0 ? (
              <NoResultsHint query={usedTitle} />
            ) : (
              <ul className="divide-y divide-border-soft border border-border-soft rounded-sm">
                {hits.map((h) => (
                  <HitRow
                    key={`${h.source}:${h.source_paper_id}`}
                    hit={h}
                    query={usedTitle}
                    disabled={relinkMut.isPending}
                    onPick={() => handlePick(h)}
                  />
                ))}
              </ul>
            )}

            {error && (
              <div className="mt-3 px-3 py-2 rounded-sm bg-danger-soft text-xs text-brand-red">
                {error}
              </div>
            )}
          </div>

          {/* footer */}
          <div className="flex items-center justify-between gap-2 px-5 py-3 bg-surface-1 border-t border-border-soft shrink-0">
            {/* 左:已关联的话给"移除关联"二次确认按钮;否则展示搜索词回显 */}
            {isLinked ? (
              <ConfirmPopover
                title="取消当前关联?"
                description="论文将退回到「本地文件」状态,PDF 与 AI 识别结果都保留。"
                confirmText="取消关联"
                cancelText="保留"
                danger
                side="top"
                align="start"
                onConfirm={handleUnlink}
              >
                <button
                  type="button"
                  disabled={unlinkMut.isPending}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-sm border border-brand-red/30 bg-danger-soft text-xs font-semibold text-brand-red hover:bg-brand-red/15 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {unlinkMut.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Link2Off className="size-3" />
                  )}
                  移除关联
                </button>
              </ConfirmPopover>
            ) : (
              <div className="text-2xs text-muted-foreground truncate min-w-0">
                当前搜索词:
                <span className="ml-1 font-semibold text-foreground">
                  {usedTitle || '(无)'}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center h-8 px-3 rounded-sm bg-background border border-border text-sm font-semibold text-subtle hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              关闭
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

// ============================================================================
// 子组件
// ============================================================================

function HitRow({
  hit,
  query,
  disabled,
  onPick,
}: {
  hit: SearchHit;
  /** 用于在 title / DOI 上高亮命中关键词 */
  query: string;
  disabled: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-1 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-background border border-border shrink-0">
          <FileText className="size-3 text-subtle" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-2xs font-bold uppercase tracking-wide text-faint">
              {hit.source}
            </span>
            {hit.already_saved && (
              <span className="inline-flex items-center gap-1 px-1.5 py-px rounded-pill bg-brand-green/12 text-2xs font-bold text-brand-green">
                <BookmarkCheck className="size-2.5" strokeWidth={2.5} />
                已收藏
              </span>
            )}
          </div>
          <div
            className="text-sm font-medium text-foreground line-clamp-2"
            title={hit.title}
          >
            <HighlightedText text={hit.title || '无标题'} query={query} />
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-2xs text-muted-foreground truncate">
            {hit.year && <span className="tabular-nums">{hit.year}</span>}
            {hit.venue && <span className="truncate">{hit.venue}</span>}
            {typeof hit.citation_count === 'number' && hit.citation_count > 0 && (
              <span className="shrink-0 tabular-nums">
                {hit.citation_count} 引用
              </span>
            )}
          </div>
          {hit.doi && (
            <div className="mt-0.5 text-2xs text-faint truncate" title={hit.doi}>
              <span className="font-bold tracking-wider mr-1">DOI</span>
              <HighlightedText text={hit.doi} query={query} />
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

function LoadingHint() {
  return (
    <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm">搜索中 …</span>
    </div>
  );
}

function ErrorHint({ message }: { message: string }) {
  return (
    <div className="px-4 py-3 rounded-sm bg-danger-soft text-xs text-brand-red">
      {message}
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
      <div className="text-xs text-faint">
        改一下搜索词试试,或换个表达
      </div>
    </div>
  );
}

export default RelinkDialog;
