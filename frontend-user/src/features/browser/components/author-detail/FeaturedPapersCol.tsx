import { Link } from 'react-router-dom';
import { AlertCircle, Bookmark, Inbox, Loader2 } from 'lucide-react';
import { isModifiedClick, paperPath, useOpenPaperInBrowser } from '@/shared/hooks';
import type { Paper } from '@/shared/api/types';

/**
 * 双列左侧 —— 代表作(top citation 5 篇)。空 / 错 / loading 三态各有兜底。
 */
export function FeaturedPapersCol({
  papers,
  total,
  loading,
  error,
}: {
  papers: Paper[];
  total: number;
  loading: boolean;
  error: Error | null;
}) {
  const openPaper = useOpenPaperInBrowser();

  return (
    <div className="space-y-3.5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-2.5">
          <h2 className="font-display font-bold text-20 leading-none text-foreground">
            代表作品
          </h2>
          {total > 0 && (
            <span className="text-12 text-faint pb-0.5">
              共 {total.toLocaleString()} 篇
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-16 bg-danger-soft text-brand-red text-12">
          <AlertCircle className="size-3.5" />
          作品列表暂时没能加载出来,请稍后重试
        </div>
      )}

      {loading && papers.length === 0 && (
        <div className="flex items-center justify-center py-10 text-faint">
          <Loader2 className="size-4 animate-spin" />
        </div>
      )}

      {!loading && !error && papers.length === 0 && (
        <div className="flex flex-col items-center justify-center px-4 py-10 rounded-16 bg-surface-1 border border-dashed border-border text-center">
          <Inbox className="size-6 text-faint mb-2" strokeWidth={1.5} />
          <p className="text-12 font-medium text-subtle">
            还没有这位学者的作品记录
          </p>
          <p className="mt-1 text-12 text-muted-foreground">
            数据源暂时没有提供该学者的论文列表
          </p>
        </div>
      )}

      {papers.length > 0 && (
        <ul className="space-y-3.5">
          {papers.map((p) => (
            <li key={p.paperId}>
              {/* 整行是真实 <Link href>(SEO 硬约束);onClick 只做副作用
                  (store 写 tab + 热点上报),导航由 <Link> 完成 */}
              <Link
                to={paperPath(p)}
                onClick={(e) => {
                  if (isModifiedClick(e)) return;
                  openPaper.prepare(p);
                }}
                className="group w-full text-left flex items-start gap-4 rounded-16 bg-surface-card border border-border p-5 hover:border-foreground transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <h3 className="text-14 font-medium text-foreground group-hover:text-brand-red transition-colors line-clamp-2">
                    {p.title || '无标题'}
                  </h3>
                  <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-12 text-faint">
                    {p.year && <span className="tabular-nums">{p.year}</span>}
                    {p.venue && (
                      <>
                        <span className="text-border-strong">·</span>
                        <span
                          className="truncate max-w-[280px]"
                          title={p.venue}
                        >
                          {p.venue}
                        </span>
                      </>
                    )}
                    {p.citationCount != null && (
                      <>
                        <span className="text-border-strong">·</span>
                        <span className="tabular-nums">
                          被引 {p.citationCount.toLocaleString()}
                        </span>
                      </>
                    )}
                    {p.isOpenAccess && (
                      <>
                        <span className="text-border-strong">·</span>
                        <span className="text-brand-green font-medium">OA</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-8 bg-surface-2 text-subtle shrink-0 group-hover:bg-foreground group-hover:text-on-dark transition-colors">
                  <Bookmark className="size-3.5" strokeWidth={2} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
