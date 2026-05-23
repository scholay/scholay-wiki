import { ArrowUpRight, Loader2, Users } from 'lucide-react';
import { useOpenAuthorInBrowser } from '@/shared/hooks';
import type { PaperAuthor, UpstreamSource } from '@/shared/api/types';
import { cn } from '@/shared/lib/utils';
import { pickAvatarColor } from './pick-avatar-color';

/**
 * 双列右侧 —— Top 8 合作学者(按合作次数);列表行可点跳合作者详情。
 *
 * PaperAuthor 没 source 字段(论文里的作者只带 id+name+aff),沿用当前学者的源
 * 作 fallback;跨源合作者(罕见)等之后从 author detail 解析。
 */
export function CollaboratorsCol({
  collaborators,
  loading,
  currentSource,
}: {
  collaborators: Array<{ author: PaperAuthor; count: number }>;
  loading: boolean;
  /** 本学者的 source */
  currentSource: UpstreamSource;
}) {
  const openAuthorInBrowser = useOpenAuthorInBrowser();
  const openAuthor = (a: PaperAuthor) => {
    if (!a.authorId) return;
    openAuthorInBrowser({
      authorId: a.authorId,
      name: a.name ?? '',
      affiliations: a.affiliations,
      source: currentSource,
    });
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-end gap-2.5">
          <h2 className="font-display font-bold text-xl leading-none text-foreground">
            合作学者
          </h2>
          {collaborators.length > 0 && (
            <span className="text-xs text-faint pb-0.5">
              Top {collaborators.length}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-background border border-border overflow-hidden">
        {loading && collaborators.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-faint">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : collaborators.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            <Users
              className="size-5 mx-auto mb-2 text-faint"
              strokeWidth={1.5}
            />
            还没有识别到合作者
          </div>
        ) : (
          <ul>
            {collaborators.map((c, idx) => (
              <li
                key={c.author.authorId ?? idx}
                className={cn(
                  'flex items-center gap-3 px-4 py-3.5',
                  idx !== collaborators.length - 1 &&
                    'border-b border-border-soft'
                )}
              >
                <span
                  className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-2xs font-bold text-white"
                  style={{
                    backgroundColor: pickAvatarColor(
                      c.author.authorId ?? c.author.name ?? ''
                    ),
                  }}
                >
                  {(c.author.name?.[0] ?? '?').toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-foreground truncate">
                    {c.author.name || '未知作者'}
                  </div>
                  {c.author.affiliations?.[0] && (
                    <div className="text-2xs text-faint truncate">
                      {c.author.affiliations[0]}
                    </div>
                  )}
                </div>
                <span className="text-2xs text-faint shrink-0 tabular-nums">
                  合作 {c.count} 次
                </span>
                {c.author.authorId && (
                  <button
                    type="button"
                    onClick={() => openAuthor(c.author)}
                    className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-sm text-faint hover:bg-surface-1 hover:text-foreground transition-colors"
                    aria-label="打开学者详情"
                  >
                    <ArrowUpRight className="size-3.5" strokeWidth={2} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
