import { wikiArticleIntroVisual } from "../visuals/catalog";

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
    <figure
      className={`wiki-light-content overflow-hidden rounded-8 border border-border-hairline ${className ?? ""}`}
    >
      <img
        src={visual.src}
        alt={visual.alt}
        width={1440}
        height={960}
        loading="lazy"
        decoding="async"
        className="h-auto w-full object-cover"
      />
    </figure>
  );
}
