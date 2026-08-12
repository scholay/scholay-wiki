import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { WIKI_KIND_LABEL } from "../content";
import type { WikiArticle } from "../types";
import { WikiStatusBadge } from "./WikiStatusBadge";

export function WikiArticleCard({ article }: { article: WikiArticle }) {
  return (
    <Link
      to={`/wiki/${article.slug}`}
      className="group flex h-full flex-col rounded-8 border border-border bg-surface-card p-4 transition-colors hover:border-border-strong"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-12 text-faint">
          <span>{WIKI_KIND_LABEL[article.kind]}</span>
          <span aria-hidden>·</span>
          <span>{article.sourcePaths.length} 个来源</span>
        </div>
        <WikiStatusBadge status={article.status} />
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <h2 className="font-serif text-18 font-medium text-foreground">
          {article.title}
        </h2>
        <ArrowRight className="mt-1 size-3 shrink-0 text-brand-red transition-transform group-hover:translate-x-1" />
      </div>
      <p className="mt-2 flex-1 text-12 leading-paragraph text-muted-foreground">
        {article.summary}
      </p>
    </Link>
  );
}
