import { Check, Copy, Menu, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Footer } from "@/shared/components/Footer";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { copyToClipboard } from "@/shared/lib/clipboard";
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
import { toast } from "sonner";
import { wikiMcpConfigText } from "../wiki-mcp";

export function WikiLayout() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const headerQuery = pathname.startsWith("/wiki/all")
    ? (params.get("q") ?? "")
    : "";
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

      <header className="sticky top-0 z-nav grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 overflow-visible border-b border-border bg-surface-card px-4 lg:px-6">
        <Link
          to="/wiki"
          aria-label="Scholay Wiki"
          className="flex shrink-0 items-center gap-2"
        >
          <BrandLogo size="sm" variant={isDark ? "mark" : "full"} />
          <span className="text-12 font-medium text-brand-red">WIKI</span>
        </Link>

        <div className="flex min-w-0 justify-center">
          <WikiSearchForm
            compact
            initialValue={headerQuery}
            className="w-full max-w-reading bg-background"
          />
        </div>

        <div className="flex shrink-0 items-center gap-2">
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

          <WikiMcpCopyButton />
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

function WikiMcpCopyButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(wikiMcpConfigText());
    if (!ok) {
      toast.error("MCP 配置复制失败，请稍后重试");
      return;
    }
    setCopied(true);
    toast.success("已复制 Scholay Wiki MCP 配置");
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-8 border border-border px-2 text-12 font-medium text-foreground transition-colors hover:border-border-strong hover:bg-foreground/5"
      aria-label="复制 Scholay Wiki MCP 配置"
      title="复制覆盖全部 Wiki 词条的远程 MCP 配置"
    >
      <span>{copied ? "已复制" : "MCP"}</span>
      {copied ? (
        <Check className="size-3.5 text-brand-green" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </button>
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
