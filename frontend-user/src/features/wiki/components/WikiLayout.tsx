import { Menu, Moon, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Footer } from "@/shared/components/Footer";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { ScrollArea } from "@/shared/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import {
  WIKI_ARTICLE_BY_SLUG,
  articleNavTrail,
  visibleNavCategories,
} from "../content";
import { useCanSeeWikiAdmin } from "../hooks/useWikiAccess";
import { useWikiTheme } from "../hooks/useWikiTheme";
import type { WikiNavCategory } from "../types";
import { WikiDocsNav } from "./WikiDocsNav";
import { WikiSearchForm } from "./WikiSearchForm";

export function WikiLayout() {
  const { pathname } = useLocation();
  const { theme, isDark, toggleTheme } = useWikiTheme();
  const canSeeAdmin = useCanSeeWikiAdmin();
  const categories = visibleNavCategories(canSeeAdmin);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const article = articleFromPath(pathname);
  const activeCategory =
    (article ? articleNavTrail(article.slug)?.category.slug : undefined) ??
    categoryFromPath(pathname, categories);

  useEffect(() => setMobileNavOpen(false), [pathname]);

  return (
    <div
      className="wiki-doc-surface flex min-h-dvh flex-col bg-background"
      data-wiki-theme={theme}
    >
      <a
        href="#wiki-main"
        className="sr-only z-tooltip rounded-8 border border-border bg-surface-card px-3 py-2 text-12 text-foreground shadow-overlay focus-visible:fixed focus-visible:left-3 focus-visible:top-3 focus-visible:not-sr-only"
      >
        跳到正文
      </a>

      <header className="sticky top-0 z-nav flex h-14 items-center border-b border-border bg-surface-card px-4 lg:px-6">
        <Link
          to="/wiki"
          aria-label="Scholay Wiki 开始"
          className="flex shrink-0 items-center gap-2"
        >
          <BrandLogo size="sm" variant={isDark ? "mark" : "full"} />
          <span className="text-12 font-medium text-brand-red">WIKI</span>
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <WikiSearchForm compact className="hidden w-rail-md xl:flex" />
          <Link
            to="/wiki/all"
            aria-label="搜索 Wiki"
            className="inline-flex size-9 items-center justify-center rounded-8 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground xl:hidden"
          >
            <Search className="size-icon-inline" aria-hidden />
          </Link>

          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={isDark}
            aria-label={isDark ? "切换到日间模式" : "切换到夜间模式"}
            title={isDark ? "切换到日间模式" : "切换到夜间模式"}
            className="inline-flex size-9 items-center justify-center rounded-8 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            {isDark ? (
              <Sun className="size-icon-inline" aria-hidden />
            ) : (
              <Moon className="size-icon-inline" aria-hidden />
            )}
          </button>

          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex h-control-md items-center gap-2 rounded-8 px-2 text-12 font-medium text-foreground transition-colors hover:bg-foreground/5 lg:hidden"
                aria-label="打开 Wiki 导航"
              >
                <Menu className="size-icon-inline" aria-hidden />
                导航
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="wiki-theme-portal max-w-panel-lg gap-0"
              data-wiki-theme={theme}
            >
              <SheetHeader>
                <SheetTitle>Scholay Wiki</SheetTitle>
                <SheetDescription className="sr-only">
                  搜索词条，浏览 Wiki 分类、当前分类词条与本页目录。
                </SheetDescription>
                <WikiSearchForm compact className="mt-3" />
              </SheetHeader>
              <ScrollArea className="min-h-0 flex-1">
                <div className="px-3 py-6">
                  <WikiDocsNav
                    activeArticle={article}
                    activeCategory={activeCategory}
                    mobile
                    onNavigate={() => setMobileNavOpen(false)}
                  />
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-start">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-panel-md shrink-0 border-r border-border-hairline bg-surface-card lg:block">
          <ScrollArea className="h-full">
            <div className="px-3 py-6">
              <WikiDocsNav
                activeArticle={article}
                activeCategory={activeCategory}
              />
            </div>
          </ScrollArea>
        </aside>

        <div className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 flex-1 flex-col">
          <main id="wiki-main" className="min-w-0 flex-1">
            <Outlet />
          </main>
          <Footer
            className="bg-surface-card"
            portalClassName="wiki-theme-portal"
            portalTheme={theme}
          />
        </div>
      </div>
    </div>
  );
}

function articleFromPath(pathname: string) {
  const match = pathname.match(/^\/wiki\/([a-z0-9-]+)$/);
  if (!match || ["all", "sources", "coverage"].includes(match[1]))
    return undefined;
  return WIKI_ARTICLE_BY_SLUG.get(match[1]);
}

function categoryFromPath(
  pathname: string,
  categories: ReturnType<typeof visibleNavCategories>,
): WikiNavCategory | undefined {
  const match = pathname.match(/^\/wiki\/category\/([a-z0-9-]+)$/);
  if (!match) return undefined;
  return categories.find((category) => category.slug === match[1])?.slug;
}
