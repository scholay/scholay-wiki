import { useRef } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { TableOfContents } from '@/shared/components/TableOfContents';
import { HelpLayout, MetaChip } from '../components/HelpLayout';
import { ArticleRenderer } from '../components/ArticleRenderer';
import { FeatureJumpCTA, shortcutsForCategory } from '../components/FeatureJumpCTA';
import { useArticle, useArticleList, relatedArticles } from '../api/content';

/**
 * 学术问答详情页 —— /qa/:slug
 * 每个问题一篇完整长答案;正文走后端内容 API(单一真源),爬虫由后端 SSR 注入全文 + JSON-LD。
 */
export function QADetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { data: article, isLoading, isError } = useArticle('qa', slug);
  const { data: list } = useArticleList('qa');
  const contentRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return (
      <HelpLayout
        breadcrumbs={[{ label: '帮助中心', to: '/help' }]}
        title="加载中…"
      >
        <div className="py-16 text-center text-sm text-muted-foreground">正在加载…</div>
      </HelpLayout>
    );
  }
  if (isError || !article) {
    return <Navigate to="/help" replace />;
  }

  const related = relatedArticles(list, article, 3);

  return (
    <HelpLayout
      breadcrumbs={[
        { label: '帮助中心', to: '/help' },
        { label: article.category },
      ]}
      eyebrow={article.category}
      title={article.title}
      lead={article.excerpt}
      metaChips={
        <>
          {article.author && (
            <MetaChip>
              {article.author.name} · {article.author.role}
            </MetaChip>
          )}
          <MetaChip>{article.readTime}</MetaChip>
        </>
      }
      toc={<TableOfContents contentRef={contentRef} />}
    >
      <RouteSEO
        title={`${article.title} | Scholay 学术问答`}
        description={article.excerpt}
        keywords={[article.category, '学术问答', '科研问题', 'Scholay'].join(',')}
        canonical={`/qa/${article.slug}`}
      />
      <div ref={contentRef}>
        <ArticleRenderer sections={article.sections} />
      </div>

      <div className="mt-12">
        <FeatureJumpCTA shortcuts={shortcutsForCategory(article.category)} />
      </div>

      {related.length > 0 && (
        <section className="mt-16 pt-8 border-t border-border-soft">
          <h2 className="text-base font-bold text-foreground mb-4">相关问答</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                to={`/qa/${r.slug}`}
                className="group flex flex-col gap-1.5 p-4 rounded-md bg-background border border-border-soft hover:border-foreground/40 transition-all hover:"
              >
                <p className="text-2xs text-faint">{r.category}</p>
                <p className="text-sm font-bold text-foreground line-clamp-2">
                  {r.title}
                </p>
                <p className="text-xs text-muted-foreground leading-paragraph line-clamp-2">
                  {r.excerpt}
                </p>
                <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-red group-hover:gap-2 transition-all">
                  查看解答
                  <ArrowRight className="size-3" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </HelpLayout>
  );
}
