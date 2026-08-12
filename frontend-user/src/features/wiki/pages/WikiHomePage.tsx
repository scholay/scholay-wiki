import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { RouteSEO } from "@/shared/components/RouteSEO";
import { WIKI_ARTICLES, WIKI_CATEGORIES } from "../content";
import { WikiArticleCard } from "../components/WikiArticleCard";
import { WikiSearchForm } from "../components/WikiSearchForm";

export function WikiHomePage() {
  const sourceCount = new Set(
    WIKI_ARTICLES.flatMap((article) => article.sourcePaths),
  ).size;
  const featured = WIKI_ARTICLES.filter((article) =>
    [
      "scholay",
      "academic-search",
      "claw",
      "peer-review",
      "prism",
      "literature-library",
    ].includes(article.slug),
  );

  return (
    <>
      <RouteSEO
        title="Scholay Wiki | 产品、功能与规则全书"
        description="从当前代码核对的 Scholay 产品百科，收录页面、功能、AI 工作流、会员活动规则与平台架构。"
        keywords="Scholay Wiki,Scholay 功能,Scholay 使用指南,会员规则,AI 科研工具"
      />

      <section className="border-b border-border-hairline">
        <div className="mx-auto max-w-page px-6 py-10 md:px-8 md:py-12 xl:px-10">
          <p className="text-12 font-medium text-brand-red">SCHOLAY WIKI</p>
          <h1 className="mt-3 max-w-reading font-display text-32 font-medium leading-display-tight text-foreground">
            把 Scholay 的每一项能力讲清楚
          </h1>
          <p className="mt-4 max-w-reading text-14 leading-paragraph text-muted-foreground">
            这里记录页面、功能、对象、活动规则和系统边界。每个结论都回到当前代码来源，历史资料与现行行为分开标注。
          </p>
          <div className="mt-6">
            <WikiSearchForm prominent />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-12 text-faint">
            <span>{WIKI_ARTICLES.length} 篇已核对词条</span>
            <span aria-hidden>·</span>
            <span>{sourceCount} 个代码来源</span>
            <span aria-hidden>·</span>
            <span>基线版本 0.0.80</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-page px-6 py-10 md:px-8 md:py-12 xl:px-10">
        <section aria-labelledby="wiki-categories">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-12 font-medium text-brand-red">知识分类</p>
              <h2
                id="wiki-categories"
                className="mt-2 font-serif text-24 font-medium text-foreground"
              >
                从你正在做的事开始
              </h2>
            </div>
            <Link
              to="/wiki/all"
              className="inline-flex items-center gap-1 text-12 font-medium text-brand-red"
            >
              浏览全部词条 <ArrowRight className="size-3" />
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {WIKI_CATEGORIES.map((category) => {
              const count = WIKI_ARTICLES.filter(
                (article) => article.category === category.slug,
              ).length;
              return (
                <Link
                  key={category.slug}
                  to={`/wiki/category/${category.slug}`}
                  className="group rounded-8 border border-border bg-surface-card p-4 transition-colors hover:border-border-strong"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-serif text-18 font-medium text-foreground">
                      {category.title}
                    </h3>
                    <span className="shrink-0 text-12 text-faint">
                      {count} 篇
                    </span>
                  </div>
                  <p className="mt-2 max-w-reading text-12 leading-paragraph text-muted-foreground">
                    {category.description}
                  </p>
                  <ArrowRight className="mt-4 size-3 text-brand-red transition-transform group-hover:translate-x-1" />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-12" aria-labelledby="wiki-featured">
          <p className="text-12 font-medium text-brand-red">核心词条</p>
          <h2
            id="wiki-featured"
            className="mt-2 font-serif text-24 font-medium text-foreground"
          >
            先理解主要工作流
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {featured.map((article) => (
              <WikiArticleCard key={article.slug} article={article} />
            ))}
          </div>
        </section>

        <section className="mt-12 border-l-2 border-brand-green pl-6">
          <p className="text-12 font-medium text-brand-green">内容原则</p>
          <h2 className="mt-2 font-serif text-20 font-medium text-foreground">
            代码事实优先于旧说明
          </h2>
          <p className="mt-3 max-w-reading text-12 leading-paragraph text-muted-foreground">
            Wiki 会同时记录现行、实验、兼容、历史和计划状态。旧
            README、研究报告或设计计划与运行代码冲突时，以当前注册路由、业务实现、迁移和测试为准。
          </p>
        </section>
      </div>
    </>
  );
}
