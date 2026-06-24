import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import type { Paper, UpstreamSource } from '@/shared/api/types';
import { useFavoriteCheck } from '@/shared/api/user-library-mutations';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import { enrichPmdAbstracts } from '@/shared/api/paper-enrich';
import { trackPaperImpressions } from '@/shared/api/hot-content';
import { parsePapersFromToolResult } from '@/shared/lib/minicod-papers';
import { PaperResultCard } from '@/shared/components/PaperResultCard';

/**
 * 智能助手(claw)里一次 mcp__minicod__* 论文工具结果的卡片列表。
 *
 * 与智能搜索 PaperListScroller **视觉一致**(复用同一个 shared <PaperResultCard>),区别只有一处:
 *   - **无暂存**(claw 没有暂存区语境):卡片 `hideStage`,只保留 收藏 / 翻译 / 折叠;
 *   - 顶部 header 只有「N 篇论文」+ 组级折叠,没有「一键暂存」。
 *
 * 数据流与 PaperListScroller 同(都走 shared API):
 *   content ─ parsePapersFromToolResult ─▶ Paper[] ─ useEnrichedPapers(PMD 补 abstract)
 *     ─ 按 source 分桶 useFavoriteCheck ─▶ favoritedIds
 *     ─ 按 venue useJournalEnrichments ─▶ JCR/IF/CCF
 *     ─▶ <PaperResultCard hideStage>
 */

const VISIBLE_CARD_COUNT = 3;
// DefaultCard 三张展开 ~580-600px, cap 在 580(与 PaperListScroller 对齐)。
const MAX_HEIGHT_PX = 580;

// 暂存恒为 false,onStage/onUnstage 不会被触发(hideStage 已隐藏按钮),给个稳定 no-op 占位。
const noop = () => {};

// 已上报曝光的 tool result —— 模块级按 toolUseId 去重(同 PaperListScroller),整页刷新即清空。
const reportedImpressionGroups = new Set<string>();

export function ClawPaperList({
  content,
  toolUseId,
}: {
  content: unknown;
  toolUseId: string;
}) {
  const papers = useMemo(() => parsePapersFromToolResult(content), [content]);
  const enriched = useEnrichedPapers(papers);

  // 曝光上报:agent 容器查的论文后端搜索接口看不到,前端在此补点(按 toolUseId 去重,历史回看不重复)。
  useEffect(() => {
    if (!toolUseId || papers.length === 0) return;
    if (reportedImpressionGroups.has(toolUseId)) return;
    reportedImpressionGroups.add(toolUseId);
    trackPaperImpressions(papers);
  }, [toolUseId, papers]);

  // 收藏态:按 source 分桶批量查(与 PaperListScroller 同模式)。
  const groupedIds = useMemo(() => {
    const m: Record<UpstreamSource, string[]> = { stc: [], olx: [], pmd: [] };
    for (const p of enriched) {
      const s = (p.source ?? 'stc') as UpstreamSource;
      if (s === 'stc' || s === 'olx' || s === 'pmd') m[s].push(p.paperId);
    }
    return m;
  }, [enriched]);
  const favStcQ = useFavoriteCheck('stc', groupedIds.stc);
  const favOlxQ = useFavoriteCheck('olx', groupedIds.olx);
  const favPmdQ = useFavoriteCheck('pmd', groupedIds.pmd);
  const favoritedIds = useMemo(() => {
    const s = new Set<string>();
    favStcQ.data?.forEach((id) => s.add(id));
    favOlxQ.data?.forEach((id) => s.add(id));
    favPmdQ.data?.forEach((id) => s.add(id));
    return s;
  }, [favStcQ.data, favOlxQ.data, favPmdQ.data]);

  // 期刊增强(JCR / IF / CCF / 中科院)。
  const venues = useMemo(
    () =>
      Array.from(
        new Set(
          enriched.map((p) => p.venue?.trim()).filter((v): v is string => !!v)
        )
      ),
    [enriched]
  );
  const journalEnrichments = useJournalEnrichments(venues);

  // 仅手动折叠(无暂存 → 无"暂存即自动折叠")。
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const onCollapse = useCallback((id: string) => {
    setCollapsedIds((s) => {
      if (s.has(id)) return s;
      const next = new Set(s);
      next.add(id);
      return next;
    });
  }, []);
  const onRestore = useCallback((id: string) => {
    setCollapsedIds((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }, []);

  // 组级折叠:默认展开,可一键收成 header(减少长会话噪声)。
  const [groupCollapsed, setGroupCollapsed] = useState(false);

  if (enriched.length === 0) return null;
  const overflow = enriched.length > VISIBLE_CARD_COUNT;

  return (
    <div className="rounded-md border border-border bg-surface-1 overflow-hidden">
      <header className="flex items-center justify-between gap-2 h-9 px-2.5 border-b border-border-soft bg-surface-2/40">
        <button
          type="button"
          onClick={() => setGroupCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-2xs text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={!groupCollapsed}
        >
          {groupCollapsed ? (
            <ChevronRight className="size-3" strokeWidth={2.2} />
          ) : (
            <ChevronDown className="size-3" strokeWidth={2.2} />
          )}
          <FileText className="size-3" strokeWidth={2} />
          <span className="font-semibold text-foreground">
            {enriched.length} 篇论文
          </span>
        </button>
      </header>

      {!groupCollapsed && (
        <div
          className={overflow ? 'overflow-y-auto' : ''}
          style={overflow ? { maxHeight: MAX_HEIGHT_PX } : undefined}
        >
          {enriched.map((p, i) => (
            <PaperResultCard
              key={p.paperId || `${toolUseId}-${i}`}
              paper={p}
              isStaged={false}
              isFolded={collapsedIds.has(p.paperId)}
              isFavorited={favoritedIds.has(p.paperId)}
              journalEnrichment={
                p.venue ? (journalEnrichments[p.venue.trim()] ?? null) : null
              }
              onStage={noop}
              onUnstage={noop}
              onCollapse={onCollapse}
              onRestore={onRestore}
              hideStage
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * PMD 缺 abstract 补全(与 PaperListScroller 同):useEffect 检测后异步调
 * `/public/papers/batch` merge 回去。paperKey 是内容稳定签名,引用变内容没变时不触发。
 */
function useEnrichedPapers(papers: Paper[]): Paper[] {
  const [enriched, setEnriched] = useState<Paper[]>(papers);
  const paperKey = papers
    .map((p) => `${p.source ?? 'stc'}:${p.paperId}`)
    .join('|');

  useEffect(() => {
    setEnriched(papers);
    const pmdMissing = papers.some(
      (p) => p.source === 'pmd' && !(p.abstract && p.abstract.trim().length > 0)
    );
    if (!pmdMissing) return;
    let cancelled = false;
    void enrichPmdAbstracts(papers).then((result) => {
      if (cancelled) return;
      setEnriched((curr) => (curr === result ? curr : result));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperKey]);

  return enriched;
}
