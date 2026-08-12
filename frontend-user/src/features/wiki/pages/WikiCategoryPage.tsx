import { ArrowLeft } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { RouteSEO } from "@/shared/components/RouteSEO";
import { WIKI_CATEGORIES, articlesInCategory } from "../content";
import type { WikiCategory } from "../types";
import { WikiArticleCard } from "../components/WikiArticleCard";

export function WikiCategoryPage() {
  const { categorySlug } = useParams();
  const category = WIKI_CATEGORIES.find((item) => item.slug === categorySlug);
  if (!category) return <Navigate to="/wiki" replace />;

  const articles = articlesInCategory(category.slug as WikiCategory);

  return (
    <>
      <RouteSEO
        title={`${category.title} | Scholay Wiki`}
        description={category.description}
        keywords={`${category.title},Scholay Wiki,Scholay 功能`}
      />
      <section className="border-b border-border bg-surface-1">
        <div className="mx-auto max-w-page px-6 py-10 md:py-14">
          <Link
            to="/wiki"
            className="inline-flex items-center gap-1 text-12 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> 返回 Wiki 总览
          </Link>
          <p className="mt-6 text-12 font-medium text-brand-red">
            WIKI CATEGORY
          </p>
          <h1 className="mt-2 font-display text-32 font-bold leading-display-tight text-foreground">
            {category.title}
          </h1>
          <p className="mt-3 max-w-reading text-14 leading-paragraph text-muted-foreground">
            {category.description}
          </p>
          <p className="mt-4 text-12 text-faint">
            当前收录 {articles.length} 篇词条
          </p>
        </div>
      </section>
      <div className="mx-auto max-w-page px-6 py-10 md:py-14">
        {articles.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <WikiArticleCard key={article.slug} article={article} />
            ))}
          </div>
        ) : (
          <div className="rounded-16 border border-border bg-surface-card p-8 text-center">
            <p className="font-serif text-18 font-medium text-foreground">
              这一分类正在核对代码
            </p>
            <p className="mt-2 text-12 text-muted-foreground">
              词条会在来源和规则通过覆盖检查后进入索引。
            </p>
          </div>
        )}
      </div>
    </>
  );
}
