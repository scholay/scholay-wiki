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
import type { WikiNextStepGroup } from "../types";

const ICONS = {
  "book-open": BookOpen,
  compass: Compass,
  search: Search,
  review: SearchCheck,
  resource: FileStack,
  sparkles: Sparkles,
} as const;

export function WikiNextSteps({ group }: { group: WikiNextStepGroup }) {
  return (
    <section className="mt-8 border-t border-border-hairline pt-8">
      <h3
        data-toc-ignore
        className="font-serif text-20 font-medium text-foreground"
      >
        {group.title ?? "下一步"}
      </h3>
      {group.description && (
        <p className="mt-2 text-14 leading-paragraph text-muted-foreground">
          {group.description}
        </p>
      )}
      <ul className="mt-4 divide-y divide-border-hairline">
        {group.items.map((item, index) => {
          const target = WIKI_ARTICLE_BY_SLUG.get(item.articleSlug);
          const title = item.title ?? target?.title;
          if (!title) return null;
          const Icon = ICONS[item.icon ?? (index === 0 ? "compass" : "search")];
          const href = `/wiki/${item.articleSlug}${item.sectionId ? `#${item.sectionId}` : ""}`;
          return (
            <li key={`${item.articleSlug}-${item.sectionId ?? "root"}`}>
              <Link
                to={href}
                className="group flex items-center gap-4 py-4 focus-visible:text-foreground"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-12 border border-border bg-surface-card text-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-14 font-medium text-foreground">
                    {title}
                  </span>
                  <span className="mt-1 block text-12 leading-paragraph text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground motion-reduce:transform-none"
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
