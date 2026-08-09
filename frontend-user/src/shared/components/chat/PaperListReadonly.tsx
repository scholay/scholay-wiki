import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { PaperResultCard } from '@/shared/components/PaperResultCard';
import { parsePapersFromToolResult } from '@/shared/lib/minicod-papers';

const VISIBLE_CARD_COUNT = 3;
const MAX_HEIGHT_PX = 580;
const noop = () => {};

/**
 * minicod 论文结果的只读列表。外框、组折叠、滚动高度和每张论文卡
 * 都直接复用用户端视觉；唯一差异是隐藏暂存、收藏和 AI 翻译等写操作。
 */
export function PaperListReadonly({
  content,
  variant = 'claw',
}: {
  content: unknown;
  variant?: 'search' | 'claw';
}) {
  const papers = useMemo(() => parsePapersFromToolResult(content), [content]);
  const [groupCollapsed, setGroupCollapsed] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(),
  );

  const onCollapse = useCallback((id: string) => {
    setCollapsedIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);
  const onRestore = useCallback((id: string) => {
    setCollapsedIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  if (papers.length === 0) return null;

  const overflow = papers.length > VISIBLE_CARD_COUNT;
  const radius = variant === 'search' ? 'rounded-12' : 'rounded-16';

  return (
    <div
      className={`${radius} overflow-hidden border border-border bg-surface-1`}
    >
      <header className="flex h-9 items-center justify-between gap-2 border-b border-border-soft bg-surface-2/40 px-2.5">
        <button
          type="button"
          onClick={() => setGroupCollapsed((value) => !value)}
          className="flex items-center gap-1.5 text-12 text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={!groupCollapsed}
        >
          {groupCollapsed ? (
            <ChevronRight className="size-3" strokeWidth={2.2} />
          ) : (
            <ChevronDown className="size-3" strokeWidth={2.2} />
          )}
          <FileText className="size-3" strokeWidth={2} />
          <span className="font-medium text-foreground">
            {papers.length} 篇论文
          </span>
        </button>
      </header>

      {!groupCollapsed && (
        <div
          className={overflow ? 'overflow-y-auto' : undefined}
          style={overflow ? { maxHeight: MAX_HEIGHT_PX } : undefined}
        >
          {papers.map((paper, index) => (
            <PaperResultCard
              key={paper.paperId || `readonly-paper-${index}`}
              paper={paper}
              isStaged={false}
              isFolded={collapsedIds.has(paper.paperId)}
              isFavorited={false}
              onStage={noop}
              onUnstage={noop}
              onCollapse={onCollapse}
              onRestore={onRestore}
              hideStage
              readOnly
            />
          ))}
        </div>
      )}
    </div>
  );
}
