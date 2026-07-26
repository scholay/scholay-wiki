import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Clock, FolderOpen } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { HelpLayout } from '../components/HelpLayout';
import { FeatureJumpCTA } from '../components/FeatureJumpCTA';
import {
  BLOG_CATEGORIES,
  useArticleList,
  type ArticleCard as ArticleCardData,
} from '../api/content';
import { cn } from '@/shared/lib/utils';

/**
 * 学术资源中心 —— 合并「产品博客 + 学术资源」为一个 tab 化中心页。
 *
 * - /resources 进入默认「学术资源」tab,/blog 进入「产品博客」tab(两 URL 都保留,SEO 不丢)
 * - 博客 tab:分类 chip 筛选 + 最新 hero + 2 列网格(单一内容流)
 * - 资源 tab:按 category 分组 section(指南合集,数据驱动无固定分类)
 * - 详情页仍是各自独立的 /blog/:slug、/resources/:slug(canonical 不动)
 */
type Tab = 'blog' | 'resources';

export function ResourceCenterPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab: Tab = location.pathname.startsWith('/blog') ? 'blog' : 'resources';

  return (
    <HelpLayout
      eyebrow="ACADEMIC RESOURCES"
      title="学术资源中心"
      lead="Scholay 的博客与学术指南合集——产品观察、AI 与科研思考,以及文献检索、论文写作、研究方法、引用规范等原创长文。"
      contentMaxWidth="max-w-5xl"
    >
      <RouteSEO
        title={
          tab === 'blog'
            ? '产品博客 - Scholay 学术资源中心 | 学术搜索、AI 与科研工具的观察'
            : '学术资源中心 - Scholay | 文献检索、论文写作与研究方法指南'
        }
        description={
          tab === 'blog'
            ? 'Scholay 团队博客 —— 学术搜索效率方法、AI 在科研中的应用、文献综述工作流、引用网络分析、LaTeX 写作等原创长文。'
            : 'Scholay 学术资源中心提供原创学术指南,涵盖文献检索技巧、论文写作方法、引用格式规范、研究方法论和 AI 学术工具使用教程,助力科研工作者提升效率。'
        }
        keywords="Scholay 博客,学术资源,文献检索教程,论文写作技巧,引用格式指南,研究方法论,AI 学术工具,LaTeX 教程,文献综述写作,同行评审"
        canonical={tab === 'blog' ? '/blog' : '/resources'}
      />

      {/* Tab 切换 —— 学术资源 / 产品博客(切 tab 即切 URL,两条 URL 都保留) */}
      <div className="flex items-center gap-1 mb-8 border-b border-border">
        <TabButton active={tab === 'resources'} onClick={() => navigate('/resources')}>
          学术资源
        </TabButton>
        <TabButton active={tab === 'blog'} onClick={() => navigate('/blog')}>
          产品博客
        </TabButton>
      </div>

      {tab === 'blog' ? <BlogTab /> : <ResourcesTab />}

      <div className="mt-14">
        <FeatureJumpCTA />
      </div>
    </HelpLayout>
  );
}

// ============================================================================
// Tab 内容
// ============================================================================

/** 博客 tab —— 分类 chip 筛选 + 最新 hero + 2 列网格 */
function BlogTab() {
  const [cat, setCat] = useState<string>('all');
  const { data, isLoading } = useArticleList('blog');
  const filtered = useMemo(() => {
    const all = data ?? [];
    return cat === 'all' ? all : all.filter((a) => a.category === cat);
  }, [data, cat]);
  const [hero, ...rest] = filtered;
  const showHero = cat === 'all' && hero;

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap mb-6">
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

      {showHero && <HeroCard article={hero} />}

      <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-3', showHero && 'mt-3')}>
        {(showHero ? rest : filtered).map((a) => (
          <ContentCard key={a.slug} article={a} to={`/blog/${a.slug}`} showCategory showAuthor />
        ))}
      </div>

      {isLoading && <Loading text="正在加载文章…" />}
      {!isLoading && filtered.length === 0 && (
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
    </>
  );
}

/** 资源 tab —— 按 category 分组 section */
function ResourcesTab() {
  const { data, isLoading } = useArticleList('resources');
  const byCategory = (data ?? []).reduce<Record<string, ArticleCardData[]>>((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});
  const categories = Object.keys(byCategory);

  return (
    <>
      {categories.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-8">
          {categories.map((c) => (
            <a
              key={c}
              href={`#cat-${encodeURIComponent(c)}`}
              className="inline-flex items-center h-7 px-3 rounded-pill bg-surface-1 text-xs font-bold text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              {c}
              <span className="ml-1.5 text-2xs text-faint">{byCategory[c].length}</span>
            </a>
          ))}
        </div>
      )}

      {isLoading && <Loading text="正在加载资源…" />}

      <div className="space-y-12">
        {Object.entries(byCategory).map(([cat, items]) => (
          <section key={cat} id={`cat-${encodeURIComponent(cat)}`} className="scroll-mt-20">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground inline-flex items-center gap-2">
                <FolderOpen className="size-4 text-brand-red" strokeWidth={2.2} />
                {cat}
              </h2>
              <span className="text-xs text-faint">{items.length} 篇</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map((a) => (
                <ContentCard key={a.slug} article={a} to={`/resources/${a.slug}`} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

// ============================================================================
// 子组件
// ============================================================================

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative h-10 px-4 text-sm font-bold transition-colors -mb-px',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
      {active && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-brand-red" />}
    </button>
  );
}

function HeroCard({ article }: { article: ArticleCardData }) {
  const author = article.author;
  return (
    <Link
      to={`/blog/${article.slug}`}
      className="group flex flex-col gap-3 p-6 md:p-8 rounded-lg bg-surface-1 border border-border-soft hover:border-border-strong transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center h-5 px-2 rounded-pill bg-brand-red text-background text-2xs font-bold uppercase">
          最新
        </span>
        <span className="inline-flex items-center h-5 px-2 rounded-sm bg-surface-card border border-border-soft text-2xs font-bold text-muted-foreground">
          {article.category}
        </span>
      </div>
      <p className="text-xl md:text-2xl font-bold text-foreground">
        {article.title}
      </p>
      <p className="text-sm text-muted-foreground leading-paragraph line-clamp-3 max-w-3xl">
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

function ContentCard({
  article,
  to,
  showCategory,
  showAuthor,
}: {
  article: ArticleCardData;
  to: string;
  showCategory?: boolean;
  showAuthor?: boolean;
}) {
  const author = showAuthor ? article.author : null;
  return (
    <Link
      to={to}
      className="group flex flex-col gap-2 p-5 rounded-md bg-surface-card border border-border-soft hover:border-foreground/40 transition-all hover:"
    >
      {showCategory && (
        <span className="inline-flex items-center w-fit h-5 px-2 rounded-sm bg-surface-1 text-2xs font-bold text-muted-foreground">
          {article.category}
        </span>
      )}
      <p className="text-md font-bold text-foreground line-clamp-2">{article.title}</p>
      <p className="text-xs text-muted-foreground leading-paragraph line-clamp-3">{article.excerpt}</p>
      <div className="mt-auto pt-2 flex items-center justify-between gap-3 text-2xs text-faint">
        <div className="flex items-center gap-3">
          {author && <span>{author.name}</span>}
          {author && <span>·</span>}
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {article.readTime}
          </span>
        </div>
        <ArrowRight className="size-3 text-faint group-hover:text-brand-red transition-colors" />
      </div>
    </Link>
  );
}

function Loading({ text }: { text: string }) {
  return <div className="py-16 text-center text-sm text-muted-foreground">{text}</div>;
}
