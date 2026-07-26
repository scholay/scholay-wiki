import { BadgeCheck, ExternalLink } from 'lucide-react';
import type { Author, UpstreamSource } from '@/shared/api/types';
import { sourceFullLabel } from '@/shared/lib/source';
import { pickAvatarColor } from './pick-avatar-color';

/**
 * 学者详情 Hero —— 圆形 avatar + 元信息 + 4 stats(发表 / 被引 / H-Index / 篇均被引)+
 * 右侧 actions(个人主页 / 原始档案;"关注学者"待后端关注体系上线后再加)。
 */
export function AuthorHero({ author }: { author: Author }) {
  const initial = (author.name?.trim()?.[0] ?? '?').toUpperCase();
  const color = pickAvatarColor(author.authorId);
  const aff = author.affiliations?.[0];

  return (
    <section className="rounded-lg bg-surface-1 border border-border-soft p-4 sm:p-7 flex flex-col sm:flex-row sm:items-stretch gap-4 sm:gap-7">
      {/* 圆形 avatar —— .pen `VcqDs` 140×140 圆;移动端缩到 88 */}
      <div
        className="shrink-0 w-[88px] h-[88px] sm:w-[140px] sm:h-[140px] rounded-pill flex items-center justify-center"
        style={{ backgroundColor: color }}
      >
        <span className="font-display font-bold text-[40px] sm:text-[64px] text-white leading-none">
          {initial}
        </span>
      </div>

      {/* 中间信息列 */}
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center gap-2 text-2xs font-bold uppercase">
          <span className="text-brand-green">学者档案</span>
          <span className="text-border-strong">·</span>
          {/* 展示对外品牌名,绝不把内部 source code(stc/olx/pmd)或上游真名露给用户
              —— 见 shared/lib/source.ts 的口径声明。 */}
          <span className="text-faint">
            {sourceFullLabel((author.source as UpstreamSource | undefined) ?? 'stc')}
          </span>
        </div>

        <h1 className="font-display font-bold text-2xl sm:text-[36px] leading-display-tight text-foreground">
          {author.name}
        </h1>

        {aff && (
          <div className="flex items-center gap-2 text-base text-subtle">
            <span>{aff}</span>
            {author.affiliations && author.affiliations.length > 1 && (
              <span className="text-faint">
                · 等 {author.affiliations.length} 个机构
              </span>
            )}
          </div>
        )}

        {/* 已验证 ORCID —— 权威身份链接(SSR 也写进 ProfilePage 的 sameAs) */}
        {author.orcid && (
          <a
            href={`https://orcid.org/${author.orcid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-fit items-center gap-1.5 h-6 px-2 rounded-pill bg-brand-green/10 text-brand-green text-2xs font-bold hover:bg-brand-green/15 transition-colors"
            title="在 ORCID 查看该学者已验证档案"
          >
            <BadgeCheck className="size-3.5" strokeWidth={2.4} />
            ORCID {author.orcid}
          </a>
        )}

        {/* 4 个核心指标 —— .pen `jZJya` */}
        <div className="pt-2 flex items-end gap-8 flex-wrap">
          <Stat value={author.paperCount} label="发表论文" />
          <Stat value={author.citationCount} label="被引次数" />
          <Stat value={author.hIndex} label="H-Index" />
          <Stat
            value={
              author.paperCount && author.citationCount
                ? Math.round(author.citationCount / author.paperCount)
                : undefined
            }
            label="篇均被引"
          />
        </div>
      </div>

      {/* 右侧 actions —— 关注学者已暂时下线(等后端关注接口) */}
      <div className="shrink-0 flex flex-row flex-wrap sm:flex-col items-start sm:items-end gap-2">
        {author.homepage && (
          <a
            href={author.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 px-4 items-center gap-2 rounded-md border border-border text-xs font-bold text-subtle hover:border-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="size-3.5" strokeWidth={2.5} />
            个人主页
          </a>
        )}
        {author.url && (
          <a
            href={author.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 px-4 items-center gap-2 rounded-md border border-border text-xs font-bold text-subtle hover:border-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="size-3.5" strokeWidth={2.5} />
            原始档案
          </a>
        )}
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
}: {
  value: number | undefined;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <div className="font-display font-bold text-2xl leading-none text-foreground tabular-nums">
        {value != null ? value.toLocaleString() : '—'}
      </div>
      <div className="text-2xs font-bold uppercase text-faint">
        {label}
      </div>
    </div>
  );
}
