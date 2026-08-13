import { cn } from "@/shared/lib/utils";
import { wikiArticleIntroVisual } from "../visuals/catalog";
import { WikiFigure } from "./WikiMedia";

export function WikiLeadVisual({
  articleSlug,
  className,
}: {
  articleSlug: string;
  className?: string;
}) {
  const visual = wikiArticleIntroVisual(articleSlug);
  if (!visual) return null;

  return (
    <WikiFigure
      caption={visual.caption}
      className={cn("w-full max-w-[32rem]", className)}
    >
      <div className="wiki-light-content w-full overflow-hidden rounded-8 border border-border-hairline">
        <img
          src={visual.src}
          alt={visual.alt}
          width={1440}
          height={960}
          loading="lazy"
          decoding="async"
          className="h-auto w-full object-cover"
        />
      </div>
    </WikiFigure>
  );
}
