import { useMemo, useState } from 'react';
import { Check, Link2, Loader2, RotateCcw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { useApiToast, useDebounce } from '@/shared/hooks';
import { ConfirmPopover } from '@/shared/components/ConfirmPopover';
import { useRelinkPaper, useRelinkSearch } from '../../api/relink';
import { hasLocalOverride } from '@/shared/lib/pick-field';
import { hitToConfirmLink, keyOfHit, sourceBrandLabel } from '../../lib/resolve-paper';
import {
  DialogFooterBar,
  DialogTabBar,
  footerGhostCn,
  footerPrimaryCn,
  type DialogTabDef,
} from '../shared/dialog-chrome';
import { RelinkResultArea } from './relink-result-area';
import type { PaperSource, UserLibraryPaper } from '@/shared/api/types';

/**
 * 统一管理弹窗 · 在线关联 tab —— 三源(Graph/Discovery/Medicine)检索 + 单选 + 落库。
 * 自动用 og_title / title 兜底查询;选 1 条 → 确认/替换关联 → relink(merged 时合并到已有行)。
 *
 * linked 行(已有关联)的特殊处理:
 *   - 顶部展示「当前关联」卡(在线论文标题/来源/DOI),让用户知道自己在替换什么
 *   - 「替换关联」是覆盖性操作 → ConfirmPopover 二次确认
 *   - 候选里命中当前关联的条目带「当前关联」标记,选它提交会被拦截(无意义替换)
 */

type SourceTab = 'discovery' | 'graph' | 'medicine';

// label 用数据源真实名称(W6 P1-8 真名化);id 是本组件内部 tab key,保留旧值不动路由/状态。
const TAB_DEFS: Array<{ id: SourceTab; label: string; source: PaperSource }> = [
  { id: 'graph', label: 'Graph', source: 'stc' },
  { id: 'discovery', label: 'Discovery', source: 'olx' },
  { id: 'medicine', label: 'Medicine', source: 'pmd' },
];

export function RelinkPanel({
  paper,
  onClose,
}: {
  paper: UserLibraryPaper;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SourceTab>('graph');
  const [queryOverride, setQueryOverride] = useState<string | undefined>(undefined);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // 输入框即时受控,但检索请求按 300ms 防抖,避免每个键击都发一次 POST
  const debouncedQuery = useDebounce(queryOverride, 300);
  const searchQ = useRelinkSearch(paper.id, debouncedQuery);
  const relinkMut = useRelinkPaper();
  const apiToast = useApiToast();

  const queryText = queryOverride ?? searchQ.data?.used_title ?? '';
  const allHits = searchQ.data?.hits ?? [];

  const tabSource = TAB_DEFS.find((t) => t.id === tab)?.source ?? null;
  const filteredHits = useMemo(
    () => (tabSource ? allHits.filter((h) => h.source === tabSource) : []),
    [allHits, tabSource]
  );

  const counts: Record<SourceTab, number> = useMemo(() => {
    const c: Record<SourceTab, number> = { discovery: 0, graph: 0, medicine: 0 };
    for (const h of allHits) {
      if (h.source === 'stc') c.graph++;
      else if (h.source === 'olx') c.discovery++;
      else if (h.source === 'pmd') c.medicine++;
    }
    return c;
  }, [allHits]);

  const sourceTabs: Array<DialogTabDef<SourceTab>> = TAB_DEFS.map((t) => ({
    id: t.id,
    label: t.label,
    count: counts[t.id],
  }));

  const isLinked = paper.link_state === 'linked';
  // 当前关联的唯一键 —— 候选标记 + 防"替换成同一篇"
  const currentKey = isLinked ? `${paper.source}:${paper.source_paper_id}` : null;

  const handleRelink = () => {
    const hit = filteredHits.find((h) => keyOfHit(h) === selectedKey);
    if (!hit) {
      toast.info('请先选择一条候选');
      return;
    }
    if (currentKey && keyOfHit(hit) === currentKey) {
      toast.info('该论文已是当前关联,无需替换');
      return;
    }
    relinkMut.mutate(
      { paperId: paper.id, link: hitToConfirmLink(hit) },
      {
        onSuccess: (r) => {
          toast.success(r.merged ? '你已收藏过这篇论文,已为你合并' : '已关联到在线论文');
          onClose();
        },
        onError: (err) => apiToast.show(err, '关联失败'),
      }
    );
  };

  const confirmDisabled =
    !selectedKey ||
    relinkMut.isPending ||
    !filteredHits.find((h) => keyOfHit(h) === selectedKey);

  const confirmButtonBody = (
    <>
      {relinkMut.isPending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Check className="size-3.5" strokeWidth={2.5} />
      )}
      {/* linked 行是"换一条在线论文"(替换关联),free 行是首次关联 */}
      {isLinked ? '替换关联' : '确认关联'}
    </>
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* 当前关联卡 —— linked 行先让用户看到"现在关联的是哪篇",再谈替换 */}
      {isLinked && (
        <div className="px-6 pt-4 shrink-0">
          <div className="flex items-start gap-3 rounded-md border border-border-soft bg-surface-1 px-4 py-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-background border border-border shrink-0 mt-0.5">
              <Link2 className="size-3.5 text-brand-amber" strokeWidth={2.25} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-2xs font-bold text-faint uppercase">
                  当前关联
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-surface-2 text-subtle text-2xs font-bold leading-none uppercase">
                  {sourceBrandLabel(paper.source)}
                </span>
              </div>
              <div
                className="mt-0.5 text-sm font-semibold text-foreground line-clamp-1"
                title={paper.title || undefined}
              >
                {paper.title || '(无标题)'}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-faint">
                {paper.venue && <span>{paper.venue}</span>}
                {paper.year ? (
                  <>
                    {paper.venue && <span>·</span>}
                    <span className="tabular-nums">{paper.year}</span>
                  </>
                ) : null}
                {paper.doi && (
                  <>
                    {(paper.venue || paper.year) && <span>·</span>}
                    <span className="font-mono">DOI {paper.doi}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 源 tab */}
      <DialogTabBar tabs={sourceTabs} value={tab} onChange={setTab} ariaLabel="在线论文库" size="sm" />

      {/* 搜索条 */}
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 h-10 px-3 rounded-md border border-border bg-background focus-within:border-brand-amber focus-within:ring-2 focus-within:ring-brand-amber/20 transition-colors">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryOverride(e.target.value)}
              placeholder="标题 · DOI · 关键词"
              className="flex-1 min-w-0 h-full bg-transparent text-sm text-foreground outline-none placeholder:text-faint"
            />
            {paper.doi && (
              <span className="text-2xs text-faint font-mono whitespace-nowrap shrink-0">
                DOI: {paper.doi}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setQueryOverride((q) => q ?? searchQ.data?.used_title ?? '');
              searchQ.refetch();
            }}
            disabled={searchQ.isFetching}
            className={cn(
              'inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-brand-amber text-brand-amber text-sm font-bold',
              'hover:bg-warning-soft disabled:opacity-60 transition-colors'
            )}
          >
            {searchQ.isFetching ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            重新检索
          </button>
        </div>
      </div>

      {/* 结果 list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
        <RelinkResultArea
          loading={searchQ.isLoading}
          error={searchQ.error as Error | null}
          tabLabel={TAB_DEFS.find((t) => t.id === tab)?.label ?? ''}
          hits={filteredHits}
          selectedKey={selectedKey}
          currentKey={currentKey}
          onSelect={setSelectedKey}
        />
      </div>

      {/* hint 按"是否有本地 og_* 覆盖"动态:展示规则是 og 优先,关联只换在线数据快照 */}
      <DialogFooterBar
        hint={
          hasLocalOverride(paper)
            ? '关联后,你编辑过的内容和已上传的 PDF 都会保留'
            : '关联后,文献卡会显示这篇在线论文的信息'
        }
      >
        <button type="button" onClick={onClose} className={footerGhostCn}>
          取消
        </button>
        {isLinked ? (
          // 替换关联是覆盖性操作(整体换掉在线数据快照)→ 二次确认
          <ConfirmPopover
            title="替换当前关联?"
            description={
              hasLocalOverride(paper)
                ? '文献卡将改为关联这篇新论文;你编辑过的内容和已上传的 PDF 都会保留。'
                : '文献卡将显示新论文的信息;已上传的 PDF 会保留。'
            }
            confirmText="替换关联"
            cancelText="再想想"
            side="top"
            align="end"
            onConfirm={handleRelink}
          >
            <button type="button" disabled={confirmDisabled} className={footerPrimaryCn('amber')}>
              {confirmButtonBody}
            </button>
          </ConfirmPopover>
        ) : (
          <button
            type="button"
            onClick={handleRelink}
            disabled={confirmDisabled}
            className={footerPrimaryCn('amber')}
          >
            {confirmButtonBody}
          </button>
        )}
      </DialogFooterBar>
    </div>
  );
}
