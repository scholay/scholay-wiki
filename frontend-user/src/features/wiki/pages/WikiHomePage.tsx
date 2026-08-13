import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { RouteSEO } from "@/shared/components/RouteSEO";
import { WIKI_START_PATHS, visibleArticles } from "../content";
import { WikiFeatureIcon } from "../components/WikiFeatureIcon";
import { WikiSearchForm } from "../components/WikiSearchForm";
import { useCanSeeWikiAdmin } from "../hooks/useWikiAccess";

export function WikiHomePage() {
  const canSeeAdmin = useCanSeeWikiAdmin();
  const articles = visibleArticles(canSeeAdmin);
  const sourceCount = new Set(
    articles.flatMap((article) => article.sourcePaths),
  ).size;

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
            <span>{articles.length} 篇已核对词条</span>
            <span aria-hidden>·</span>
            <span>{sourceCount} 个代码来源</span>
            <span aria-hidden>·</span>
            <span>按任务与产品栏目组织</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-page px-6 py-10 md:px-8 md:py-12 xl:px-10">
        <section aria-labelledby="wiki-start-paths">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-12 font-medium text-brand-red">常用入口</p>
              <h2
                id="wiki-start-paths"
                className="mt-2 font-serif text-24 font-medium text-foreground"
              >
                选择你要完成的事
              </h2>
              <p className="mt-2 max-w-reading text-14 leading-paragraph text-muted-foreground">
                这里保留最常用的六条起点；完整栏目和全部内容统一放在词条索引中。
              </p>
            </div>
            <Link
              to="/wiki/all"
              className="inline-flex items-center gap-1 text-12 font-medium text-brand-red"
            >
              打开词条索引 <ArrowRight className="size-3" />
            </Link>
          </div>

          <ul className="mt-7 grid grid-cols-1 gap-x-10 md:grid-cols-2">
            {WIKI_START_PATHS.map((path) => (
              <li
                key={path.categorySlug}
                className="border-b border-border-hairline"
              >
                <Link
                  to={`/wiki/category/${path.categorySlug}`}
                  className="group flex min-h-28 items-start gap-4 py-5 transition-colors focus-visible:bg-surface-1"
                >
                  <WikiFeatureIcon
                    slug={path.categorySlug}
                    className="mt-1 size-10 shrink-0 object-contain"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-12 text-faint">
                      {path.label}
                    </span>
                    <span className="mt-1 block font-serif text-18 font-medium text-foreground">
                      {path.title}
                    </span>
                    <span className="mt-2 block text-12 leading-paragraph text-muted-foreground">
                      {path.description}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 size-3 shrink-0 text-brand-red transition-transform group-hover:translate-x-1" />
                </Link>
              </li>
            ))}
          </ul>
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
