import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Paper, UpstreamSource } from '@/shared/api/types';
import { useFavoriteCheck } from '@/shared/api/user-library-mutations';
import { useJournalEnrichments } from '@/shared/api/journal-enrichment';
import { enrichPmdAbstracts } from '@/shared/api/paper-enrich';
import { trackPaperImpressions } from '@/shared/api/hot-content';
import { PaperResultCard } from '@/shared/components/PaperResultCard';
import { useStagingActions } from '../../hooks/useStagingActions';
import { useStagingView } from '../../hooks/useStagingView';
import { parsePapersFromToolResult } from './types';

/**
 * 智能搜索一次 mcp__minicod__search_papers 工具返回的论文列表。
 *
 * 视觉契约 (跟传统搜索 SearcherColumn 对齐):
 *   - 整组论文包在一个有边框的卡片里, 跟会话背景明显区分 (用户反馈"卡片跟背景太像");
 *   - 顶部 mini-header: 论文数指示 + 一键暂存 + 折叠/展开按钮;
 *   - <= 3 张卡片平铺, > 3 张内滚 cap 在 ~580px (避免单次工具结果撑过长会话);
 *   - 卡片本身复用 <PaperResultCard>, 暂存/收藏/翻译/折叠跟传统搜索同链路。
 *
 * 数据流 (与上一版一致):
 *   content (tool_result.content, 来自 WS 或 history transcript)
 *     ─ useMemo parsePapersFromToolResult ─▶ Paper[] (snake_case → camelCase, 补 paperId 前缀)
 *     ─ useEnrichedPapers ─▶ Paper[] (PMD 异步补 abstract via /public/papers/batch)
 *     ─ 按 source 分桶 useFavoriteCheck × 3 ─▶ favoritedIds (跨源合并)
 *     ─ 按 venue useJournalEnrichments ─▶ journalEnrichments (JCR / IF / CCF)
 *     ─ 卡片 props ─▶ <PaperResultCard>
 *
 * 两层折叠:
 *   - 组级 (本组件): groupCollapsed —— 把整组论文收成一个 header, 减少长会话噪声;
 *   - 卡级 (PaperResultCard): effectivelyCollapsed —— **暂存即自动折叠**(与传统搜索 SearchPage
 *     同公式 (staged ∪ 手动) \ 展开覆盖), 暂存的论文收成 StagedRow 绿行。
 *   两者独立,各自维护 state, 互不干扰。
 */

const VISIBLE_CARD_COUNT = 3;
// DefaultCard 三张展开 ~580-600px, cap 在 580 给底部留 ~8px 余量。
const MAX_HEIGHT_PX = 580;

// 已上报曝光的 tool result —— 模块级, 单次页面会话内按 toolUseId 去重,
// 避免用户回看历史会话时同一组结果被重复计曝光。整页刷新即清空。
const reportedImpressionGroups = new Set<string>();

export function PaperListScroller({
  content,
  toolUseId,
}: {
  content: unknown;
  toolUseId: string;
}) {
  const papers = useMemo(() => parsePapersFromToolResult(content), [content]);

  const enriched = useEnrichedPapers(papers);

  // 热门内容「曝光量」上报 —— 智能搜索的论文走 agent 容器, 后端搜索接口看不到,
  // 必须前端在这里补点。按 toolUseId 去重: 同一组结果(含 PMD 补 abstract 触发的
  // re-render)只报一次, 历史回看也不重复 (见 reportedImpressionGroups)。
  useEffect(() => {
    if (!toolUseId || papers.length === 0) return;
    if (reportedImpressionGroups.has(toolUseId)) return;
    reportedImpressionGroups.add(toolUseId);
    trackPaperImpressions(papers);
  }, [toolUseId, papers]);

  // staging: 全局 stagedIds + actions
  const { areas, stagedIds } = useStagingView();
  const { stagePaper, removePaper, bulkStagePapers } = useStagingActions();

  // 跨所有暂存区一次性 unstage —— 与 SearchPage.unstageAcrossAreas 同模式。
  const unstageAcrossAreas = useCallback(
    (paperId: string) => {
      if (!stagedIds.has(paperId)) return;
      for (const a of areas) {
        if (a.papers.some((p) => p.paperId === paperId)) {
          removePaper(a.id, paperId);
        }
      }
    },
    [areas, stagedIds, removePaper]
  );

  // 按 source 分桶批量查 favorited 状态 —— 与 useStagedFavorites 同模式。
  const groupedIds = useMemo(() => {
    const m: Record<UpstreamSource, string[]> = { stc: [], olx: [], pmd: [] };
    for (const p of enriched) {
      const s = (p.source ?? 'stc') as UpstreamSource;
      if (s === 'stc' || s === 'olx' || s === 'pmd') {
        m[s].push(p.paperId);
      }
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

  // journal enrichments (JCR / IF / CCF / 中科院)
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

  // 卡级折叠态 —— 与传统搜索 SearchPage 同公式:**暂存即自动折叠**。
  //   effectivelyCollapsed = (stagedIds ∪ manuallyCollapsedIds) \ expandedOverrides
  //   - 暂存的论文自动收成 StagedRow(绿行),与列表搜索一致;
  //   - 用户可对已暂存卡点"展开"(进 expandedOverrides 覆盖 auto-fold)。
  const [manuallyCollapsedIds, setManuallyCollapsedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedOverrides, setExpandedOverrides] = useState<Set<string>>(
    () => new Set()
  );
  const effectivelyCollapsed = useMemo(() => {
    const s = new Set<string>(manuallyCollapsedIds);
    stagedIds.forEach((id) => s.add(id));
    expandedOverrides.forEach((id) => s.delete(id));
    return s;
  }, [manuallyCollapsedIds, stagedIds, expandedOverrides]);

  const onCollapse = useCallback((id: string) => {
    setExpandedOverrides((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    setManuallyCollapsedIds((s) => {
      if (s.has(id)) return s;
      const next = new Set(s);
      next.add(id);
      return next;
    });
  }, []);
  const onRestore = useCallback((id: string) => {
    setManuallyCollapsedIds((s) => {
      if (!s.has(id)) return s;
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    setExpandedOverrides((s) => {
      if (s.has(id)) return s;
      const next = new Set(s);
      next.add(id);
      return next;
    });
  }, []);

  // 暂存即自动折叠(由 stagedIds 派生);顺手清掉该 paper 的 expandedOverrides,
  // 避免"刚暂存还展开着"的诡异态。
  const handleStage = useCallback(
    (paper: Paper) => {
      stagePaper(paper, 'smart');
      setExpandedOverrides((s) => {
        if (!s.has(paper.paperId)) return s;
        const next = new Set(s);
        next.delete(paper.paperId);
        return next;
      });
    },
    [stagePaper]
  );

  // 组级折叠: 默认展开 (流式结果到达时直接看到), 用户可一键收成 header。
  const [groupCollapsed, setGroupCollapsed] = useState(false);
  const toggleGroupCollapse = useCallback(() => {
    setGroupCollapsed((v) => !v);
  }, []);

  // 一键暂存: 只对未暂存的论文有意义, 已暂存的 bulkStagePapers 内部会自动跳过。
  // 按钮文字 / 禁用态由 unstagedCount 派生, 给用户清晰预期。
  const unstagedCount = useMemo(
    () => enriched.filter((p) => !stagedIds.has(p.paperId)).length,
    [enriched, stagedIds]
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const handleBulkStage = useCallback(async () => {
    if (bulkBusy || unstagedCount === 0) return;
    setBulkBusy(true);
    try {
      const { added, skipped, capped } = await bulkStagePapers(enriched, 'smart');
      const parts: string[] = [];
      if (added > 0) parts.push(`已暂存 ${added} 篇`);
      if (skipped > 0) parts.push(`${skipped} 篇已在暂存区`);
      if (capped > 0) parts.push(`${capped} 篇因暂存区已满未加入`);
      if (parts.length === 0) {
        toast.info('当前组论文已全部在暂存区');
      } else {
        const total = added + skipped + capped;
        const isWarn = added === 0 && total > 0;
        if (isWarn) toast.info(parts.join(', '));
        else toast.success(parts.join(', '));
      }
    } catch (err) {
      toast.error(`批量暂存失败:${(err as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  }, [bulkBusy, unstagedCount, bulkStagePapers, enriched]);

  if (enriched.length === 0) return null;

  const overflow = enriched.length > VISIBLE_CARD_COUNT;
  const allStaged = unstagedCount === 0;

  return (
    // 外框: surface-1 + border-border, 比 surface-2/30 跟会话背景区分明显。
    // overflow-hidden 是为了让内部 overflow-y-auto 不顶破圆角。
    <div className="rounded-md border border-border bg-surface-1 overflow-hidden">
      <header className="flex items-center justify-between gap-2 h-9 px-2.5 border-b border-border-soft bg-surface-2/40">
        <button
          type="button"
          onClick={toggleGroupCollapse}
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
          {stagedIds.size > 0 && unstagedCount < enriched.length && (
            <span className="text-faint">
              · {enriched.length - unstagedCount} 已暂存
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={handleBulkStage}
          disabled={bulkBusy || allStaged}
          title={
            allStaged
              ? '本组论文已全部在暂存区'
              : `把本组 ${unstagedCount} 篇未暂存论文加入暂存区`
          }
          className="inline-flex shrink-0 items-center gap-1 h-6 px-2 rounded-sm text-2xs font-medium text-brand-green hover:bg-brand-green/10 disabled:text-faint disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
        >
          {bulkBusy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <BookmarkPlus className="size-3" strokeWidth={2.2} />
          )}
          {allStaged
            ? '已全部暂存'
            : bulkBusy
              ? '暂存中…'
              : `一键暂存 ${unstagedCount} 篇`}
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
              isStaged={stagedIds.has(p.paperId)}
              isFolded={effectivelyCollapsed.has(p.paperId)}
              isFavorited={favoritedIds.has(p.paperId)}
              journalEnrichment={
                p.venue
                  ? (journalEnrichments[p.venue.trim()] ?? null)
                  : null
              }
              onStage={handleStage}
              onUnstage={unstageAcrossAreas}
              onCollapse={onCollapse}
              onRestore={onRestore}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * PMD 缺 abstract 补全: useEffect 检测后异步调 `/public/papers/batch`, merge 回去。
 *
 * dep stabilization: papers 数组每次父组件 re-render 都是新引用,
 * 用 paperId join 做 stable key 避免无限重 enrich。
 */
function useEnrichedPapers(papers: Paper[]): Paper[] {
  const [enriched, setEnriched] = useState<Paper[]>(papers);

  const paperKey = papers
    .map((p) => `${p.source ?? 'stc'}:${p.paperId}`)
    .join('|');

  useEffect(() => {
    setEnriched(papers);
    const pmdMissing = papers.some(
      (p) =>
        p.source === 'pmd' &&
        !(p.abstract && p.abstract.trim().length > 0)
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
    // paperKey 是 papers 内容的稳定签名, 引用变但内容没变时不触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperKey]);

  return enriched;
}
