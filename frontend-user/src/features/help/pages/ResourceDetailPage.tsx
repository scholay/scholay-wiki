import { useRef } from 'react';
import { useParams, Navigate, Link } from 'react-router-dom';
import { ArrowRight, Clock } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { TableOfContents } from '@/shared/components/TableOfContents';
import { HelpLayout, MetaChip } from '../components/HelpLayout';
import { ArticleRenderer } from '../components/ArticleRenderer';
import { FeatureJumpCTA, shortcutsForCategory } from '../components/FeatureJumpCTA';
import { useArticle, useArticleList, relatedArticles } from '../api/content';

/**
 * 学术资源详情页 —— /resources/:slug
 * 正文走后端内容 API(单一真源);找不到 slug 时 redirect 到列表页。
 */
export function ResourceDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { data: article, isLoading, isError } = useArticle('resources', slug);
  const { data: list } = useArticleList('resources');
  const contentRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return (
      <HelpLayout
        breadcrumbs={[{ label: '学术资源', to: '/resources' }, { label: '学术指南' }]}
        title="加载中…"
      >
        <div className="py-16 text-center text-12 text-muted-foreground">正在加载文章…</div>
      </HelpLayout>
    );
  }
  if (isError || !article) {
    return <Navigate to="/resources" replace />;
  }

  const related = relatedArticles(list, article, 3);

  return (
    <HelpLayout
      breadcrumbs={[
        { label: '学术资源', to: '/resources' },
        { label: article.category },
      ]}
      eyebrow={article.category}
      title={article.title}
      lead={article.excerpt}
      metaChips={
        <>
          <MetaChip>
            <Clock className="size-3 mr-1 inline" />
            {article.readTime}
          </MetaChip>
          <MetaChip>{article.date}</MetaChip>
        </>
      }
      toc={<TableOfContents contentRef={contentRef} />}
    >
      <RouteSEO
        title={`${article.title} | Scholay 学术资源`}
        description={article.excerpt}
        keywords={[article.category, '学术资源', '科研指南', 'Scholay'].join(',')}
        canonical={`/resources/${article.slug}`}
      />
      <div ref={contentRef}>
        <ArticleRenderer sections={article.sections} />
      </div>

      {/* 文章读完 → 引导回产品 */}
      <div className="mt-12">
        <FeatureJumpCTA shortcuts={shortcutsForCategory(article.category)} />
      </div>

      {related.length > 0 && (
        <section className="mt-16 pt-8 border-t border-border-soft">
          <h2 className="text-14 font-medium text-foreground mb-4">相关文章</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                to={`/resources/${r.slug}`}
                className="group flex flex-col gap-1.5 p-4 rounded-16 bg-surface-card border border-border-soft hover:border-foreground/40 transition-colors"
              >
                <p className="text-12 text-faint">{r.category}</p>
                <p className="text-14 font-medium text-foreground line-clamp-2">
                  {r.title}
                </p>
                <p className="text-12 text-muted-foreground leading-paragraph line-clamp-2">
                  {r.excerpt}
                </p>
                <span className="mt-1 inline-flex items-center gap-1 text-12 font-medium text-brand-red">
                  阅读全文
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </HelpLayout>
  );
}
