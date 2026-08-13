import {
  ArrowRight,
  BookOpen,
  Compass,
  FileStack,
  Search,
  SearchCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { WIKI_ARTICLE_BY_SLUG } from "../content";
import type { WikiArticleLinkCard as WikiArticleLinkCardData } from "../types";

const ICONS = {
  "book-open": BookOpen,
  compass: Compass,
  search: Search,
  review: SearchCheck,
  resource: FileStack,
  sparkles: Sparkles,
} as const;

export function WikiArticleLinkCard({
  card,
}: {
  card: WikiArticleLinkCardData;
}) {
  const target = WIKI_ARTICLE_BY_SLUG.get(card.articleSlug);
  const title = card.title ?? target?.title;
  const description = card.description ?? target?.summary;
  if (!title || !description) return null;
  const Icon = ICONS[card.icon ?? "book-open"];

  const href = `/wiki/${card.articleSlug}${card.sectionId ? `#${card.sectionId}` : ""}`;

  return (
    <Link
      to={href}
      className="group mt-6 flex items-center gap-4 rounded-12 border border-border bg-surface-card p-4 transition-colors hover:border-border-strong hover:bg-surface-1 focus-visible:border-border-strong"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-12 border border-border bg-surface-1 text-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-14 font-medium text-foreground">
          {title}
        </span>
        <span className="mt-1 block text-12 leading-paragraph text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground motion-reduce:transform-none"
        aria-hidden
      />
    </Link>
  );
}
