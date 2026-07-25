import { useMemo, type ReactNode } from 'react';
import { ExternalLink, Users } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  parseAuthorsFromToolResult,
  type MinicodAuthor,
} from '@/shared/lib/minicod-results';

/**
 * minicod 作者工具结果(search_authors / get_author)的卡片列表 —— 替代非论文结果的「回退 JSON」。
 * smart-search / claw / admin 会话监控共用(纯只读展示)。作者本被 normalizePaper 判为非论文而走安全网,
 * 渲染器在 dispatcher 里先于论文卡识别作者并渲此卡。
 *
 * 数据:content ─ parseAuthorsFromToolResult ─▶ MinicodAuthor[](防御式取值,取不到不显示该项)。
 * 品牌铁律:不展示原始 source enum;ORCID 有则给 https://orcid.org/<id> 链接。
 */

// stat chip —— 与期刊卡 / 论文卡 tag 同款尺寸。
function Stat({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center px-1.5 h-[18px] rounded-sm bg-surface-2 text-2xs font-bold text-subtle">
      {children}
    </span>
  );
}

/** ORCID 可能是裸 iD(0000-...)或完整 URL,统一成 https://orcid.org/<id>。 */
function orcidHref(orcid: string): string {
  const v = orcid.trim();
  if (v.startsWith('http')) return v;
  return `https://orcid.org/${v.replace(/^orcid\.org\//i, '')}`;
}

function AuthorCard({ author: a }: { author: MinicodAuthor }) {
  const affiliations = a.affiliations?.slice(0, 2).join(' · ');
  const hasStats =
    typeof a.hIndex === 'number' ||
    typeof a.paperCount === 'number' ||
    typeof a.citationCount === 'number';

  return (
    <div className="border-b border-border-soft px-3.5 py-3 last:border-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {a.name}
        </p>
        {a.orcid && (
          <a
            href={orcidHref(a.orcid)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 h-[18px]',
              'bg-brand-green/10 text-2xs font-bold text-brand-green hover:bg-brand-green/15 transition-colors',
            )}
            title="查看已验证 ORCID 主页"
          >
            <ExternalLink className="size-2.5" strokeWidth={2.5} />
            ORCID
          </a>
        )}
      </div>
      {affiliations && (
        <p className="mt-0.5 truncate text-2xs text-faint">{affiliations}</p>
      )}
      {hasStats && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {typeof a.hIndex === 'number' && <Stat>h-index {a.hIndex}</Stat>}
          {typeof a.paperCount === 'number' && <Stat>论文 {a.paperCount}</Stat>}
          {typeof a.citationCount === 'number' && <Stat>被引 {a.citationCount}</Stat>}
        </div>
      )}
    </div>
  );
}

export function MinicodAuthorCards({ content }: { content: unknown }) {
  const authors = useMemo(() => parseAuthorsFromToolResult(content), [content]);
  if (authors.length === 0) return null;

  const overflow = authors.length > 4;
  return (
    <div className="rounded-md border border-border bg-surface-1 overflow-hidden">
      <header className="flex items-center gap-1.5 h-9 px-2.5 border-b border-border-soft bg-surface-2/40 text-2xs text-muted-foreground">
        <Users className="size-3" strokeWidth={2} />
        <span className="font-semibold text-foreground">{authors.length} 位学者</span>
      </header>
      <div
        className={overflow ? 'overflow-y-auto' : ''}
        style={overflow ? { maxHeight: 420 } : undefined}
      >
        {authors.map((a, i) => (
          <AuthorCard key={`${a.name}-${i}`} author={a} />
        ))}
      </div>
    </div>
  );
}
