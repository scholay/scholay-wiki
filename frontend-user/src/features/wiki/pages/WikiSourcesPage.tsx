import { FileCode2 } from "lucide-react";
import { Link } from "react-router-dom";
import { RouteSEO } from "@/shared/components/RouteSEO";
import { visibleArticles } from "../content";
import { useCanSeeWikiAdmin } from "../hooks/useWikiAccess";

interface SourceEntry {
  path: string;
  articleSlugs: string[];
}

export function WikiSourcesPage() {
  const canSeeAdmin = useCanSeeWikiAdmin();
  const articles = visibleArticles(canSeeAdmin);
  const sources = buildSources(articles);

  return (
    <>
      <RouteSEO
        title="代码来源索引 | Scholay Wiki"
        description="按仓库路径追溯 Scholay Wiki 词条所依据的页面、后端模块、配置、迁移与测试。"
        keywords="Scholay Wiki 来源,Scholay 源码索引,Scholay 架构"
      />
      <section className="border-b border-border bg-surface-card">
        <div className="mx-auto max-w-page px-6 py-10 md:py-14">
          <p className="text-12 font-medium text-brand-red">SOURCE INDEX</p>
          <h1 className="mt-2 font-display text-32 font-bold leading-display-tight text-foreground">
            代码来源索引
          </h1>
          <p className="mt-3 max-w-reading text-14 leading-paragraph text-muted-foreground">
            每个路径都来自当前代码基线，并反向连接到使用它作为事实依据的词条。目录路径表示该模块整体经过审计。
          </p>
          <p className="mt-4 text-12 text-faint">
            共 {sources.length} 个唯一来源路径
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-page px-6 py-10 md:py-14">
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {sources.map((source) => (
            <li
              key={source.path}
              className="rounded-16 border border-border bg-surface-card p-4"
            >
              <div className="flex items-start gap-3">
                <FileCode2 className="mt-1 size-icon-inline shrink-0 text-brand-red" />
                <div className="min-w-0">
                  <p className="break-words font-mono text-12 leading-paragraph text-foreground">
                    {source.path}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {source.articleSlugs.map((slug) => {
                      const article = articles.find(
                        (item) => item.slug === slug,
                      );
                      if (!article) return null;
                      return (
                        <Link
                          key={slug}
                          to={`/wiki/${slug}`}
                          className="inline-flex h-control-sm items-center rounded-pill border border-border bg-surface-card px-3 text-12 text-muted-foreground hover:text-foreground"
                        >
                          {article.title}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function buildSources(
  articles: ReturnType<typeof visibleArticles>,
): SourceEntry[] {
  const index = new Map<string, string[]>();
  for (const article of articles) {
    for (const path of article.sourcePaths) {
      const slugs = index.get(path) ?? [];
      slugs.push(article.slug);
      index.set(path, slugs);
    }
  }

  return [...index.entries()]
    .map(([path, articleSlugs]) => ({ path, articleSlugs }))
    .sort((a, b) => a.path.localeCompare(b.path, "en"));
}
