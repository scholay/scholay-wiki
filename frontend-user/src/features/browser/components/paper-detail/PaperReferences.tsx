import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Inbox, Loader2 } from 'lucide-react';
import { CitationProse } from '@/shared/components/CitationProse';
import { generateCitation } from '@/shared/lib/citation';
import { useOpenPaperDetail } from '@/shared/hooks';
import type { Paper } from '@/shared/api/types';
// 跨 feature import —— browser ⇄ library 设计交叉,详见 PaperDetailPane 顶部注释
import {
  useFetchPaperReferences,
  type PaperReference,
} from '@/shared/api/paper-detail';

/**
 * References 段 —— 真实拉 `/public/papers/:paperId/references`,
 * 没数据 / 失败 / 加载中 三态分别给清晰兜底,不留疑似 bug 的空白。
 */
export function PaperReferences({ paper }: { paper: Paper }) {
  // referenceCount 已知为 0 → 完全不拉(避免无谓请求)
  const hasReferences = (paper.referenceCount ?? 1) > 0;
  const refsQ = useFetchPaperReferences(paper.paperId, hasReferences);

  const refs = refsQ.data ?? [];
  // 分批渲染上限 —— 引用可达数百条,一次性挂满会拖慢移动端。先渲染 STEP 条,「显示更多」逐批加。
  const STEP = 30;
  const [visible, setVisible] = useState(STEP);
  // 切换论文(paperId 变)时复位
  useEffect(() => setVisible(STEP), [paper.paperId]);
  const shownRefs = refs.slice(0, visible);

  const totalLabel = paper.referenceCount
    ? `共 ${paper.referenceCount.toLocaleString()} 篇`
    : refs.length
      ? `已加载 ${refs.length} 篇`
      : '';

  return (
    <section className="mt-16 space-y-4">
      <div className="space-y-1.5">
        <div className="text-2xs font-bold uppercase tracking-[0.18em] text-faint">
          REFERENCES
        </div>
        <h2 className="font-display font-bold text-2xl text-foreground">
          参考文献
          {totalLabel && (
            <span className="ml-2 text-base font-normal text-faint">
              · {totalLabel}
            </span>
          )}
        </h2>
      </div>
      <div className="h-px bg-border" />

      {!hasReferences && (
        <ReferencesEmpty reason="该论文未收录参考文献信息" />
      )}

      {hasReferences && refsQ.isLoading && (
        <div className="flex items-center justify-center py-10 text-faint">
          <Loader2 className="size-4 animate-spin" />
        </div>
      )}

      {hasReferences && refsQ.error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-danger-soft text-brand-red text-xs">
          <AlertCircle className="size-3.5" />
          参考文献暂时没能加载出来,请稍后再试
        </div>
      )}

      {/* 拉成功但空 —— 上游声称有 referenceCount 但 references API 没返条目,常见于
          老论文 / 元数据不全。给用户清楚的兜底文案,避免"是不是 bug" 的疑虑 */}
      {hasReferences &&
        !refsQ.isLoading &&
        !refsQ.error &&
        refs.length === 0 && (
          <ReferencesEmpty reason="数据源暂未提供这篇论文的参考文献详情" />
        )}

      {hasReferences && !refsQ.isLoading && refs.length > 0 && (
        <>
          <ol className="space-y-3.5">
            {shownRefs.map((r, idx) => (
              <ReferenceItem key={r.paperId ?? idx} index={idx + 1} ref={r} />
            ))}
          </ol>
          {refs.length > visible && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + STEP)}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-1 active:bg-surface-2"
            >
              <ChevronDown className="size-4" />
              显示更多({refs.length - visible} 篇)
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ReferencesEmpty({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 rounded-md bg-surface-1 border border-dashed border-border text-center">
      <Inbox className="size-6 text-faint mb-2" strokeWidth={1.5} />
      <p className="text-sm font-bold text-subtle">还没有参考文献</p>
      <p className="mt-1 text-xs text-muted-foreground">{reason}</p>
    </div>
  );
}

function ReferenceItem({
  index,
  ref: r,
}: {
  index: number;
  ref: PaperReference;
}) {
  // 走共享 citation generator 生成 APA-style prose,标题/期刊会自动 italic
  const cite = useMemo(() => generateCitation({ ...r }, 'apa'), [r]);

  const openPaper = useOpenPaperDetail();

  // 优先内嵌打开:有 paperId → 搜索页右栏 / 浏览器内新开 tab
  // 兜底外链:仅有 r.url → target=_blank 跳出去
  // 都没 → 纯文本
  const handleOpenInApp = () => {
    if (!r.paperId) return;
    openPaper({
      paperId: r.paperId,
      title: r.title,
      year: r.year,
      venue: r.venue,
      authors: r.authors,
      url: r.url,
      // 从 paperId 前缀推 source —— normalizeID 约定:olx: / pmd: / 无前缀=stc
      source: r.paperId.startsWith('olx:')
        ? 'olx'
        : r.paperId.startsWith('pmd:')
          ? 'pmd'
          : 'stc',
    });
  };

  return (
    <li className="flex gap-3.5 text-base leading-[1.7] text-subtle">
      <span className="shrink-0 w-8 font-bold text-faint tabular-nums">
        [{index}]
      </span>
      <span className="flex-1 min-w-0">
        {r.paperId ? (
          // 用 button 而不是 <a>:避免浏览器 ctrl+click 走外链导致语义混乱;
          // 用户期望"点引用 = 在站内看详情",和详情页其他论文跳转一致
          <button
            type="button"
            onClick={handleOpenInApp}
            className="text-left hover:text-foreground hover:underline transition-colors"
            title="在站内打开该论文详情"
          >
            <CitationProse text={cite} />
          </button>
        ) : r.url ? (
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground hover:underline"
          >
            <CitationProse text={cite} />
          </a>
        ) : (
          <CitationProse text={cite} />
        )}
      </span>
    </li>
  );
}
