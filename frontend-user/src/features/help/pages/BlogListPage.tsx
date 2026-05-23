import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { HelpLayout } from '../components/HelpLayout';
import { FeatureJumpCTA } from '../components/FeatureJumpCTA';
import {
  BLOG_CATEGORIES,
  blogArticles,
  getBlogAuthor,
  type BlogArticle,
} from '../data/blog-articles';
import { cn } from '@/shared/lib/utils';

/**
 * 博客列表 —— 重设计版。
 *
 * 视觉:
 *   - 第 1 篇撑成大特征卡(占两列宽,有 hero 感)
 *   - 其余文章 2 列网格,卡片样式与 HelpCenter / Contact 对齐
 *   - 分类 chip 行不变(选中态黑底白字),但加 sticky-top 让滚动时仍可见
 *   - 空态加 icon + 文案
 */
export function BlogListPage() {
  const [cat, setCat] = useState<string>('all');
  const filtered = useMemo(() => {
    if (cat === 'all') return blogArticles;
    return blogArticles.filter((a) => a.category === cat);
  }, [cat]);

  const [hero, ...rest] = filtered;
  // hero 仅在 "all" 视图下展示;切到具体分类时全部走普通卡,避免"最新"与
  // 分类筛选语义打架
  const showHero = cat === 'all' && hero;

  return (
    <HelpLayout
      breadcrumbs={[{ label: '帮助中心', to: '/help' }, { label: '博客' }]}
      eyebrow="SCHOLAY BLOG"
      title="产品博客"
      lead="Scholay 团队关于学术搜索、AI 与科研工具的观察、教程与思考。"
      contentMaxWidth="max-w-5xl"
    >
      <RouteSEO
        title="产品博客 - Scholay | 学术搜索、AI 与科研工具的观察与思考"
        description="Scholay 团队博客 —— 学术搜索效率方法、AI 在科研中的应用、文献综述工作流、引用网络分析、LaTeX 写作技巧等原创长文。"
        keywords="Scholay 博客,学术搜索博客,AI 科研,文献综述教程,引用网络分析,LaTeX 写作,Semantic Scholar 教程,OpenAlex,学术工具评测"
      />
      {/* 分类 chip 行 —— sticky 在 hero 下方,滚动时仍可见 */}
      <div className="sticky top-12 z-10 -mx-6 px-6 py-3 mb-6 bg-background/95 backdrop-blur border-b border-border-soft">
        <div className="flex items-center gap-1.5 flex-wrap">
          {BLOG_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className={cn(
                'inline-flex items-center h-7 px-3 rounded-pill text-xs font-bold transition-colors',
                cat === c.id
                  ? 'bg-foreground text-background'
                  : 'bg-surface-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground'
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero 特征卡(仅 all 视图) */}
      {showHero && <HeroCard article={hero} />}

      {/* 网格 */}
      <div
        className={cn(
          'grid grid-cols-1 md:grid-cols-2 gap-3',
          showHero && 'mt-3'
        )}
      >
        {(showHero ? rest : filtered).map((a) => (
          <ArticleCard key={a.slug} article={a} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <p className="text-sm">这个分类下还没有文章</p>
          <button
            type="button"
            onClick={() => setCat('all')}
            className="text-xs text-brand-red hover:underline underline-offset-2"
          >
            返回全部
          </button>
        </div>
      )}

      {/* 浏览完文章 → 引导回产品 */}
      <div className="mt-14">
        <FeatureJumpCTA />
      </div>
    </HelpLayout>
  );
}

// ============================================================================
// 子组件
// ============================================================================

function HeroCard({ article }: { article: BlogArticle }) {
  const author = getBlogAuthor(article.author);
  return (
    <Link
      to={`/blog/${article.slug}`}
      className="group flex flex-col gap-3 p-6 md:p-8 rounded-lg bg-surface-1 border border-border-soft hover:border-border-strong transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center h-5 px-2 rounded-pill bg-brand-red text-background text-2xs font-bold uppercase tracking-wide">
          最新
        </span>
        <span className="inline-flex items-center h-5 px-2 rounded-sm bg-background border border-border-soft text-2xs font-bold text-muted-foreground">
          {article.category}
        </span>
      </div>
      <p className="text-xl md:text-2xl font-bold text-foreground leading-snug tracking-tight">
        {article.title}
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 max-w-3xl">
        {article.excerpt}
      </p>
      <div className="flex items-center gap-3 text-2xs text-faint">
        {author && <span>{author.name}</span>}
        {author && <span>·</span>}
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" />
          {article.readTime}
        </span>
        <span>·</span>
        <span>{article.date}</span>
      </div>
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-red group-hover:gap-2 transition-all">
        阅读全文
        <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}

function ArticleCard({ article }: { article: BlogArticle }) {
  const author = getBlogAuthor(article.author);
  return (
    <Link
      to={`/blog/${article.slug}`}
      className="group flex flex-col gap-2 p-5 rounded-md bg-background border border-border-soft hover:border-foreground/40 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
    >
      <span className="inline-flex items-center w-fit h-5 px-2 rounded-sm bg-surface-1 text-2xs font-bold text-muted-foreground">
        {article.category}
      </span>
      <p className="text-md font-bold text-foreground leading-snug line-clamp-2">
        {article.title}
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
        {article.excerpt}
      </p>
      <div className="mt-auto pt-2 flex items-center gap-3 text-2xs text-faint">
        {author && <span>{author.name}</span>}
        {author && <span>·</span>}
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" />
          {article.readTime}
        </span>
        <span>·</span>
        <span>{article.date}</span>
      </div>
    </Link>
  );
}
