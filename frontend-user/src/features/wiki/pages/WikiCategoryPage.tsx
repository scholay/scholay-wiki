import { ArrowLeft, ArrowRight, Lock } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { RouteSEO } from "@/shared/components/RouteSEO";
import {
  navArticlesInCategory,
  navCategoryBySlug,
  navHref,
  visibleNavNodes,
  visibleNavCategories,
} from "../content";
import type { WikiNavNode } from "../types";
import { WikiArticleCard } from "../components/WikiArticleCard";
import { useCanSeeWikiAdmin } from "../hooks/useWikiAccess";

export function WikiCategoryPage() {
  const { categorySlug } = useParams();
  const canSeeAdmin = useCanSeeWikiAdmin();
  const category = navCategoryBySlug(categorySlug);
  const visible = visibleNavCategories(canSeeAdmin).some(
    (item) => item.slug === categorySlug,
  );
  if (!category || !visible) return <Navigate to="/wiki" replace />;

  const articles = navArticlesInCategory(category.slug, canSeeAdmin);
  const categoryNodes = visibleNavNodes(category.children, canSeeAdmin);

  return (
    <>
      <RouteSEO
        title={`${category.title} | Scholay Wiki`}
        description={category.description}
        keywords={`${category.title},Scholay Wiki,Scholay 功能`}
      />
      <section className="border-b border-border bg-surface-card">
        <div className="mx-auto max-w-page px-6 py-10 md:py-14">
          <Link
            to="/wiki"
            className="inline-flex items-center gap-1 text-12 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> 返回 Wiki 总览
          </Link>
          <p className="mt-6 text-12 font-medium text-brand-red">
            WIKI DIRECTORY
          </p>
          <h1 className="mt-2 font-display text-32 font-bold leading-display-tight text-foreground">
            {category.title}
          </h1>
          <p className="mt-3 max-w-reading text-14 leading-paragraph text-muted-foreground">
            {category.description}
          </p>
          <p className="mt-4 text-12 text-faint">
            当前归入 {articles.length} 篇词条
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-page px-6 py-10 md:py-14">
        <section aria-labelledby="category-outline">
          <p className="text-12 font-medium text-brand-red">目录结构</p>
          <h2
            id="category-outline"
            className="mt-2 font-serif text-24 font-medium text-foreground"
          >
            按任务逐层展开
          </h2>
          <div className="mt-6 rounded-8 border border-border bg-surface-card px-4 py-2 md:px-6">
            <CategoryOutline nodes={categoryNodes} depth={0} />
          </div>
        </section>

        {articles.length > 0 && (
          <section className="mt-12" aria-labelledby="category-articles">
            <p className="text-12 font-medium text-brand-red">本栏词条</p>
            <h2
              id="category-articles"
              className="mt-2 font-serif text-24 font-medium text-foreground"
            >
              逐篇阅读
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <WikiArticleCard key={article.slug} article={article} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function CategoryOutline({
  nodes,
  depth,
}: {
  nodes: WikiNavNode[];
  depth: number;
}) {
  return (
    <ul className={depth > 0 ? "border-l border-border-hairline" : undefined}>
      {nodes.map((node) => {
        const href = navHref(node);
        return (
          <li key={node.id}>
            <div
              className="flex min-h-11 items-center gap-2 border-b border-border-hairline py-2 last:border-b-0"
              style={{ paddingLeft: depth * 16 }}
            >
              {href ? (
                <Link
                  to={href}
                  className="group flex min-w-0 flex-1 items-center justify-between gap-3 text-12 text-foreground hover:text-brand-red"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span>{node.title}</span>
                    {node.adminOnly && (
                      <Lock
                        className="size-3 shrink-0 text-brand-amber"
                        aria-label="仅管理员可见"
                      />
                    )}
                  </span>
                  <ArrowRight className="size-3 shrink-0 text-faint transition-transform group-hover:translate-x-1" />
                </Link>
              ) : (
                <span className="font-medium text-foreground">
                  {node.title}
                </span>
              )}
            </div>
            {node.children && (
              <CategoryOutline nodes={node.children} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
