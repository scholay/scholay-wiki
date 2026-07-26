import { useParams } from 'react-router-dom';
import { Clock, ExternalLink, Flame, RefreshCcw, ShieldCheck, TrendingUp } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { ResourceError } from '@/shared/components/ResourceError';
import { Footer } from '@/shared/components/Footer';
import { MarkdownRenderer } from '@/shared/components/chat/MarkdownRenderer';
import { NewsListItem } from '@/shared/components/news/NewsListItem';
import {
  formatHeat,
  isNewsSurging,
  newsRelativeTime,
  newsReportLabel,
  newsSectionTone,
  useNewsDetail,
} from '@/shared/api/news';

/**
 * 情报详情页 —— /news/:slug(挂 AppShell,同 URL 响应式,保 SEO/GEO)。
 * 正文走后端 body_md(单一真源在 internal/news);爬虫由后端 SSR 注入全文 + NewsArticle JSON-LD。
 */
export function NewsDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { data, isLoading, isError, error, refetch } = useNewsDetail(slug);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="h-7 w-3/4 animate-pulse rounded-4 bg-surface-2" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded-4 bg-surface-1" />
          ))}
        </div>
      </div>
    );
  }
  if (isError || !data?.item) {
    return (
      <ResourceError
        error={error}
        resourceName="情报"
        backTo="/news"
        onRetry={() => void refetch()}
      />
    );
  }

  const item = data.item;
  const tone = newsSectionTone(item.section);
  const surging = isNewsSurging(item.heat_trend);

  return (
    <>
      <RouteSEO
        title={`${item.title} | Scholay 学术情报`}
        description={item.summary}
        keywords={[item.section_label, '学术情报', '学术新闻', 'Scholay'].filter(Boolean).join(',')}
        canonical={`/news/${item.slug}`}
      />
      <article className="mx-auto max-w-3xl px-6 py-10">
        {/* eyebrow:版块 + 头条 */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`inline-flex items-center gap-1 font-semibold ${tone.text}`}>
            <span className={`size-1.5 rounded-pill ${tone.dot}`} />
            {item.section_label || '情报'}
          </span>
          <span className="rounded-sm bg-surface-1 px-1.5 py-0.5 text-faint">
            {newsReportLabel(item.report_type)}
          </span>
          {item.is_featured && (
            <span className="rounded-sm bg-brand-red px-1.5 py-0.5 font-semibold text-on-brand">
              头条
            </span>
          )}
        </div>

        {/* 标题 + 导语 */}
        <h1 className="mt-3 text-2xl font-bold text-foreground">{item.title}</h1>
        {item.summary && (
          <p className="mt-3 text-base leading-paragraph text-muted-foreground">{item.summary}</p>
        )}

        {/* meta chips */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border-soft pb-4 text-xs text-faint">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" />
            发布 {newsRelativeTime(item.published_at)}
          </span>
          {item.updated_at && item.updated_at !== item.published_at && (
            <span className="inline-flex items-center gap-1">
              <RefreshCcw className="size-3.5" />
              更新 {newsRelativeTime(item.updated_at)}
            </span>
          )}
          {item.heat_external > 0 && (
            <span className="inline-flex items-center gap-1">
              <Flame className="size-3.5" />
              热度 {formatHeat(item.heat_external)}
              {surging && <TrendingUp className="size-3 text-brand-red" />}
            </span>
          )}
          {item.original_date && <span>事件原始日期 {item.original_date}</span>}
        </div>

        {/* 封面图 */}
        {item.cover_image && (
          <img
            src={item.cover_image}
            alt=""
            className="mt-6 w-full rounded-lg object-cover"
          />
        )}

        {/* 正文(markdown 单一真源) */}
        <div className="mt-6">
          <MarkdownRenderer text={item.body_md || item.summary} className="text-base" />
        </div>

        {/* 信息来源(GEO 强信号,可见) */}
        {item.sources?.length > 0 && (
          <section className="mt-10 rounded-lg border border-border-soft bg-surface-1 p-5">
            <h2 className="text-sm font-bold text-foreground">信息来源</h2>
            <ul className="mt-2 space-y-1.5">
              {item.sources.map((s, i) => (
                <li key={`${s.url}-${i}`}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand-green underline underline-offset-2 hover:opacity-80"
                  >
                    {s.label || s.url}
                    <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 可信度说明 */}
        {item.credibility_note && (
          <aside className="mt-4 flex gap-2.5 rounded-lg border border-border-soft bg-surface-card p-4">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-green" />
            <div>
              <p className="text-xs font-bold text-foreground">可信度说明</p>
              <p className="mt-1 text-xs leading-paragraph text-muted-foreground">
                {item.credibility_note}
              </p>
            </div>
          </aside>
        )}

        {/* 相关情报 */}
        {data.related?.length > 0 && (
          <section className="mt-12 border-t border-border-soft pt-8">
            <h2 className="mb-4 text-base font-bold text-foreground">相关情报</h2>
            <div className="space-y-3">
              {data.related.map((r) => (
                <NewsListItem key={r.slug} item={r} />
              ))}
            </div>
          </section>
        )}
      </article>
      <Footer />
    </>
  );
}
