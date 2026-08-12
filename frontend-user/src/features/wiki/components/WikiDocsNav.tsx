import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import { WIKI_ARTICLES, WIKI_CATEGORIES } from "../content";
import type { WikiArticle, WikiCategory } from "../types";

interface WikiDocsNavProps {
  activeArticle?: WikiArticle;
  activeCategory?: WikiCategory;
  mobile?: boolean;
  onNavigate?: () => void;
}

export function WikiDocsNav({
  activeArticle,
  activeCategory,
  mobile = false,
  onNavigate,
}: WikiDocsNavProps) {
  const { pathname } = useLocation();
  const [expandedCategory, setExpandedCategory] = useState<WikiCategory | null>(
    activeCategory ?? "getting-started",
  );
  const idPrefix = mobile ? "wiki-mobile" : "wiki-desktop";

  useEffect(() => {
    if (activeCategory) setExpandedCategory(activeCategory);
  }, [activeCategory]);

  const linkSpacing = mobile ? "min-h-11 py-3" : "py-2";

  return (
    <nav
      aria-label={mobile ? "Wiki 移动导航" : "Wiki 文档导航"}
      className="text-12"
    >
      {activeArticle && mobile && (
        <section className="mb-6 border-b border-border-hairline pb-6">
          <p className="px-3 font-medium text-foreground">本页目录</p>
          <div className="mt-2 flex flex-col">
            {activeArticle.sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={onNavigate}
                className="flex min-h-11 items-center border-l-2 border-transparent px-3 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                {section.title}
              </a>
            ))}
            <a
              href="#sources"
              onClick={onNavigate}
              className="flex min-h-11 items-center border-l-2 border-transparent px-3 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              来源
            </a>
          </div>
        </section>
      )}

      <div className="mb-6">
        <div className="flex items-center justify-between px-3">
          <p className="font-medium text-foreground">全部产品</p>
          <span className="text-faint">{WIKI_ARTICLES.length}</span>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <Link
            to="/wiki"
            onClick={onNavigate}
            aria-current={pathname === "/wiki" ? "page" : undefined}
            className={indexLinkClass(pathname === "/wiki", linkSpacing)}
          >
            Wiki 总览
          </Link>
          <Link
            to="/wiki/all"
            onClick={onNavigate}
            aria-current={pathname === "/wiki/all" ? "page" : undefined}
            className={indexLinkClass(pathname === "/wiki/all", linkSpacing)}
          >
            全部词条
          </Link>
          <Link
            to="/wiki/sources"
            onClick={onNavigate}
            aria-current={pathname === "/wiki/sources" ? "page" : undefined}
            className={indexLinkClass(
              pathname === "/wiki/sources",
              linkSpacing,
            )}
          >
            来源索引
          </Link>
          <Link
            to="/wiki/coverage"
            onClick={onNavigate}
            aria-current={pathname === "/wiki/coverage" ? "page" : undefined}
            className={indexLinkClass(
              pathname === "/wiki/coverage",
              linkSpacing,
            )}
          >
            覆盖核验
          </Link>
        </div>
      </div>

      <div className="space-y-1">
        {WIKI_CATEGORIES.map((category) => {
          const articles = WIKI_ARTICLES.filter(
            (article) => article.category === category.slug,
          );
          const expanded = expandedCategory === category.slug;
          const currentGroup = activeCategory === category.slug;
          const regionId = `${idPrefix}-${category.slug}`;

          return (
            <section key={category.slug}>
              <div className="flex items-center gap-1">
                <Link
                  to={`/wiki/category/${category.slug}`}
                  onClick={onNavigate}
                  className={cn(
                    "min-w-0 flex-1 px-3 font-medium transition-colors hover:text-foreground",
                    linkSpacing,
                    currentGroup ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate">{category.title}</span>
                    <span className="shrink-0 font-normal text-faint">
                      {articles.length}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={regionId}
                  aria-label={`${expanded ? "收起" : "展开"}${category.title}`}
                  onClick={() =>
                    setExpandedCategory((current) =>
                      current === category.slug ? null : category.slug,
                    )
                  }
                  className={cn(
                    "inline-flex shrink-0 items-center justify-center rounded-8 text-faint transition-colors hover:bg-surface-2 hover:text-foreground",
                    mobile ? "size-11" : "size-8",
                  )}
                >
                  {expanded ? (
                    <ChevronDown className="size-3.5" aria-hidden />
                  ) : (
                    <ChevronRight className="size-3.5" aria-hidden />
                  )}
                </button>
              </div>

              {expanded && (
                <ul
                  id={regionId}
                  className="ml-3 border-l border-border-hairline py-1"
                >
                  {articles.map((article) => {
                    const active = activeArticle?.slug === article.slug;
                    return (
                      <li key={article.slug}>
                        <Link
                          to={`/wiki/${article.slug}`}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "-ml-px block border-l-2 px-4 transition-colors",
                            linkSpacing,
                            active
                              ? "border-brand-red bg-surface-2 font-medium text-brand-red"
                              : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground",
                          )}
                        >
                          {article.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-6 border-t border-border-hairline pt-4">
        <Link
          to="/"
          onClick={onNavigate}
          className={cn(
            "block px-3 text-muted-foreground transition-colors hover:text-foreground",
            linkSpacing,
          )}
        >
          返回 Scholay
        </Link>
      </div>
    </nav>
  );
}

function indexLinkClass(active: boolean, spacing: string): string {
  return cn(
    "border-l-2 px-3 transition-colors",
    spacing,
    active
      ? "border-brand-red bg-surface-2 font-medium text-brand-red"
      : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground",
  );
}
