import { ArrowRight } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/shared/ui/hover-card";
import { WIKI_ARTICLE_BY_SLUG, canViewWikiArticle } from "../content";
import { useCanSeeWikiAdmin } from "../hooks/useWikiAccess";
import { useWikiTheme } from "../hooks/useWikiTheme";

const RESERVED_SLUGS = new Set(["all", "sources", "coverage", "category"]);

export function WikiArticlePreviewLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const { theme } = useWikiTheme();
  const canSeeAdmin = useCanSeeWikiAdmin();
  const [open, setOpen] = useState(false);
  const goRef = useRef<HTMLAnchorElement>(null);
  const slug = wikiArticleSlug(href);
  const article = slug ? WIKI_ARTICLE_BY_SLUG.get(slug) : undefined;

  if (!slug || !canViewWikiArticle(article, canSeeAdmin)) {
    return (
      <Link to={href} className="text-brand-red underline underline-offset-4">
        {children}
      </Link>
    );
  }

  const openCard = (focusGo = false) => {
    setOpen(true);
    if (!focusGo) return;
    requestAnimationFrame(() => goRef.current?.focus());
  };

  return (
    <HoverCard
      open={open}
      onOpenChange={setOpen}
      openDelay={120}
      closeDelay={180}
    >
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="inline cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-brand-red underline underline-offset-4"
          onClick={() => openCard()}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openCard(true);
          }}
        >
          {children}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        side="bottom"
        className="wiki-theme-portal w-72 bg-surface-card p-4 shadow-overlay"
        data-wiki-theme={theme}
      >
        <p className="font-serif text-16 font-medium text-foreground">
          {article.title}
        </p>
        <p className="mt-2 line-clamp-3 text-12 leading-paragraph text-subtle">
          {article.summary}
        </p>
        <Link
          ref={goRef}
          to={href}
          className="group/go mt-3 inline-flex items-center gap-1 text-12 font-medium text-brand-red"
        >
          前往
          <ArrowRight className="size-3 transition-transform group-hover/go:translate-x-1" />
        </Link>
      </HoverCardContent>
    </HoverCard>
  );
}

function wikiArticleSlug(href: string): string | undefined {
  const match = /^\/wiki\/([a-z0-9-]+)(?:[?#].*)?$/i.exec(href);
  const slug = match?.[1];
  if (!slug || RESERVED_SLUGS.has(slug)) return undefined;
  return slug;
}
