import { Link } from 'react-router-dom';
import { ArrowRight, Clock, FolderOpen } from 'lucide-react';
import { RouteSEO } from '@/shared/components/RouteSEO';
import { HelpLayout } from '../components/HelpLayout';
import { FeatureJumpCTA } from '../components/FeatureJumpCTA';
import {
  resourceArticles,
  type ResourceArticle,
} from '../data/resource-articles';

/**
 * 学术资源中心 —— 重设计版。
 *
 * 与旧版差异:
 *   - 顶部加分类速览 chip 行(点击锚跳到对应 section)
 *   - 每个分类区头部加大,带 "N 篇" + 「查看更多」(预留)
 *   - 卡片样式与 Blog/HelpCenter 对齐:hover shadow + brand-red CTA
 */
export function ResourceListPage() {
  const byCategory = resourceArticles.reduce<Record<string, ResourceArticle[]>>(
    (acc, a) => {
      (acc[a.category] = acc[a.category] || []).push(a);
      return acc;
    },
    {}
  );
  const categories = Object.keys(byCategory);

  return (
    <HelpLayout
      breadcrumbs={[
        { label: '帮助中心', to: '/help' },
        { label: '学术资源' },
      ]}
      eyebrow="ACADEMIC RESOURCES"
      title="学术资源中心"
      lead="原创学术指南合集,覆盖文献检索、论文写作、研究方法、引用规范等核心场景。"
      contentMaxWidth="max-w-5xl"
    >
      <RouteSEO
        title="学术资源中心 - Scholay | 文献检索、论文写作与研究方法指南"
        description="Scholay 学术资源中心提供原创学术指南,涵盖文献检索技巧、论文写作方法、引用格式规范、研究方法论和 AI 学术工具使用教程,助力科研工作者提升效率。"
        keywords="学术资源,文献检索教程,论文写作技巧,引用格式指南,研究方法论,AI 学术工具,LaTeX 教程,文献综述写作,同行评审"
      />
      {/* 分类速览 chip —— 锚跳分类区头部 */}
      {categories.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-8">
          {categories.map((c) => (
            <a
              key={c}
              href={`#cat-${encodeURIComponent(c)}`}
              className="inline-flex items-center h-7 px-3 rounded-pill bg-surface-1 text-xs font-bold text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
            >
              {c}
              <span className="ml-1.5 text-2xs text-faint">
                {byCategory[c].length}
              </span>
            </a>
          ))}
        </div>
      )}

      <div className="space-y-12">
        {Object.entries(byCategory).map(([cat, items]) => (
          <section
            key={cat}
            id={`cat-${encodeURIComponent(cat)}`}
            className="scroll-mt-20"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-foreground inline-flex items-center gap-2">
                <FolderOpen
                  className="size-4 text-brand-red"
                  strokeWidth={2.2}
                />
                {cat}
              </h2>
              <span className="text-xs text-faint">{items.length} 篇</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map((a) => (
                <ArticleCard key={a.slug} article={a} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* 浏览完资源 → 引导回产品 */}
      <div className="mt-14">
        <FeatureJumpCTA />
      </div>
    </HelpLayout>
  );
}

function ArticleCard({ article }: { article: ResourceArticle }) {
  return (
    <Link
      to={`/resources/${article.slug}`}
      className="group flex flex-col gap-2 p-5 rounded-md bg-background border border-border-soft hover:border-foreground/40 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)]"
    >
      <p className="text-md font-bold text-foreground leading-snug line-clamp-2">
        {article.title}
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
        {article.excerpt}
      </p>
      <div className="mt-auto pt-2 flex items-center justify-between gap-3 text-2xs text-faint">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {article.readTime}
          </span>
          <span>·</span>
          <span>{article.date}</span>
        </div>
        <ArrowRight className="size-3 text-faint group-hover:text-brand-red transition-colors" />
      </div>
    </Link>
  );
}
