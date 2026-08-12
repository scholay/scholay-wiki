import { Menu, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Footer } from "@/shared/components/Footer";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { cn } from "@/shared/lib/utils";
import { ScrollArea } from "@/shared/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { WIKI_ARTICLE_BY_SLUG, WIKI_CATEGORIES } from "../content";
import type { WikiCategory } from "../types";
import { WikiDocsNav } from "./WikiDocsNav";
import { WikiSearchForm } from "./WikiSearchForm";

export function WikiLayout() {
  const { pathname } = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const article = articleFromPath(pathname);
  const activeCategory = article?.category ?? categoryFromPath(pathname);

  useEffect(() => setMobileNavOpen(false), [pathname]);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href="#wiki-main"
        className="sr-only z-tooltip bg-foreground px-3 py-2 text-12 text-on-dark focus-visible:fixed focus-visible:left-3 focus-visible:top-3 focus-visible:not-sr-only"
      >
        跳到正文
      </a>

      <header className="sticky top-0 z-nav flex h-14 items-center border-b border-border bg-surface-card px-4 lg:px-6">
        <Link
          to="/wiki"
          aria-label="Scholay Wiki 首页"
          className="flex shrink-0 items-center gap-2"
        >
          <BrandLogo size="sm" />
          <span className="text-12 font-medium text-brand-red">WIKI</span>
        </Link>

        <nav
          aria-label="Wiki 领域"
          className="mx-auto hidden min-w-0 items-stretch overflow-x-auto xl:flex"
        >
          <NavLink
            end
            to="/wiki"
            className={({ isActive }) => domainClass(isActive)}
          >
            总览
          </NavLink>
          {WIKI_CATEGORIES.map((category) => (
            <Link
              key={category.slug}
              to={`/wiki/category/${category.slug}`}
              aria-current={
                activeCategory === category.slug ? "page" : undefined
              }
              className={domainClass(activeCategory === category.slug)}
            >
              {category.shortTitle}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-4">
          <WikiSearchForm compact className="hidden w-rail-md xl:flex" />
          <Link
            to="/wiki/all"
            aria-label="搜索 Wiki"
            className="inline-flex size-9 items-center justify-center rounded-8 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground xl:hidden"
          >
            <Search className="size-icon-inline" aria-hidden />
          </Link>

          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex h-control-md items-center gap-2 rounded-8 px-2 text-12 font-medium text-foreground transition-colors hover:bg-surface-2 lg:hidden"
                aria-label="打开 Wiki 导航"
              >
                <Menu className="size-icon-inline" aria-hidden />
                导航
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="max-w-panel-lg gap-0">
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
          <Footer />
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

function categoryFromPath(pathname: string): WikiCategory | undefined {
  const match = pathname.match(/^\/wiki\/category\/([a-z0-9-]+)$/);
  if (!match) return undefined;
  return WIKI_CATEGORIES.find((category) => category.slug === match[1])?.slug;
}

function domainClass(active: boolean): string {
  return cn(
    "relative inline-flex h-14 shrink-0 items-center border-b-2 px-3 text-12 font-medium transition-colors",
    active
      ? "border-brand-red text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
  );
}
