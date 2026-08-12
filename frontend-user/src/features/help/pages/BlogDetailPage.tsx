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
 * 博客详情页 —— /blog/:slug
 *
 * 正文走后端内容 API(单一真源 internal/content);爬虫由后端 SSR 注入全文 + JSON-LD。
 *   - 加右侧 TOC(自动从 ArticleRenderer 渲染的 h2/h3 提取)
 *   - 作者卡 / 标签 / 相关文章卡片统一新设计语言
 */
export function BlogDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { data: article, isLoading, isError } = useArticle('blog', slug);
  const { data: list } = useArticleList('blog');
  const contentRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return (
      <HelpLayout
        breadcrumbs={[{ label: '学术资源', to: '/resources' }, { label: '产品博客', to: '/blog' }]}
        title="加载中…"
      >
        <div className="py-16 text-center text-12 text-muted-foreground">正在加载文章…</div>
      </HelpLayout>
    );
  }
  if (isError || !article) {
    return <Navigate to="/blog" replace />;
  }

  const author = article.author;
  const related = relatedArticles(list, article, 4);

  return (
    <HelpLayout
      breadcrumbs={[
        { label: '学术资源', to: '/resources' },
        { label: '产品博客', to: '/blog' },
        { label: article.category },
      ]}
      eyebrow={article.category}
      title={article.title}
      lead={article.excerpt}
      metaChips={
        <>
          {author && (
            <MetaChip>
              {author.name} · {author.role}
            </MetaChip>
          )}
          <MetaChip>
            <Clock className="size-3 mr-1 inline" />
            {article.readTime}
          </MetaChip>
          <MetaChip>{article.date}</MetaChip>
          {article.updatedDate && article.updatedDate !== article.date && (
            <MetaChip>更新 {article.updatedDate}</MetaChip>
          )}
        </>
      }
      toc={<TableOfContents contentRef={contentRef} />}
    >
      <RouteSEO
        title={`${article.title} | Scholay 博客`}
        description={article.excerpt}
        keywords={[article.category, ...article.tags, 'Scholay 博客', '学术文章'].join(',')}
        canonical={`/blog/${article.slug}`}
      />
      <div ref={contentRef}>
        <ArticleRenderer sections={article.sections} />
      </div>

      {/* 标签 */}
      {article.tags.length > 0 && (
        <div className="mt-10 flex items-center gap-1.5 flex-wrap">
          <span className="text-12 text-faint">标签:</span>
          {article.tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center h-5 px-2 rounded-4 bg-surface-1 text-12 text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* 作者卡 —— 升级:加 brand-green soft 头像背景 + 更宽 padding */}
      {author && (
        <section className="mt-10 p-6 rounded-16 bg-surface-1 border border-border-soft">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-pill bg-brand-green text-on-brand text-14 font-medium shrink-0">
              {author.name.slice(0, 1)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className="text-14 font-medium text-foreground">
                  {author.name}
                </p>
                <span className="text-12 text-muted-foreground">
                  · {author.role}
                </span>
              </div>
              <p className="mt-1.5 text-12 text-muted-foreground leading-paragraph">
                {author.bio}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 文章读完 → 引导回产品 */}
      <div className="mt-12">
        <FeatureJumpCTA shortcuts={shortcutsForCategory(article.category)} />
      </div>

      {related.length > 0 && (
        <section className="mt-12 pt-8 border-t border-border-soft">
          <h2 className="text-14 font-medium text-foreground mb-4">相关文章</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                to={`/blog/${r.slug}`}
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
