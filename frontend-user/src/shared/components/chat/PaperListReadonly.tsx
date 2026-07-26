import { useMemo } from 'react';
import { FileText } from 'lucide-react';
import { parsePapersFromToolResult } from '@/shared/lib/minicod-papers';
import { displaySourceLabel } from '@/shared/lib/data-source-brand';

/**
 * minicod 工具结果的**只读**论文卡列表 —— admin 会话监控用。
 * 视觉对齐用户端 PaperListScroller 的卡片骨架(标题/作者/venue·年份/引用数/来源品牌),
 * 但不带 收藏/暂存/摘要增补 等用户态交互(那些依赖登录用户 API,管理端只读不适用)。
 * ≤3 张平铺,>3 张内滚,与用户端滚动策略一致。
 */
export function PaperListReadonly({ content }: { content: unknown }) {
  const papers = useMemo(() => parsePapersFromToolResult(content), [content]);
  if (papers.length === 0) return null;

  return (
    <div className="rounded-16 border border-border bg-surface-1/60">
      <div className="flex items-center gap-1.5 border-b border-border-soft px-3 py-1.5 text-12 text-faint">
        <FileText className="size-3" />
        检索到 {papers.length} 篇论文
      </div>
      <div className={papers.length > 3 ? 'max-h-[420px] overflow-y-auto' : undefined}>
        {papers.map((p) => (
          <div key={p.paperId} className="border-b border-border-soft px-3 py-2 last:border-0">
            <p className="text-14 font-medium text-foreground line-clamp-2">{p.title}</p>
            <p className="mt-0.5 text-12 text-faint truncate">
              {[
                p.authors
                  ?.slice(0, 3)
                  .map((a) => a.name)
                  .join(', ') + ((p.authors?.length ?? 0) > 3 ? ' 等' : ''),
                displaySourceLabel(p.venue) || displaySourceLabel(p.source),
                p.year,
                typeof p.citationCount === 'number' ? `被引 ${p.citationCount}` : undefined,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
