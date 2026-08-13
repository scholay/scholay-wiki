import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { WikiInterestRecommendation } from "../content";

export function WikiInterestRecommendations({
  recommendations,
}: {
  recommendations: WikiInterestRecommendation[];
}) {
  if (!recommendations.length) return null;

  return (
    <section className="border-t border-border-hairline py-8">
      <h2
        data-toc-ignore
        className="font-serif text-24 font-medium text-foreground"
      >
        继续阅读
      </h2>
      <ul className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
        {recommendations.map((item, index) => (
          <li key={`${item.article.slug}-${item.sectionId ?? "root"}`}>
            <Link
              to={`/wiki/${item.article.slug}${item.sectionId ? `#${item.sectionId}` : ""}`}
              className="group flex items-start gap-4"
            >
              <span className="mt-0.5 w-6 shrink-0 font-serif text-12 text-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 border-l-2 border-brand-green pl-4">
                <span className="flex items-start justify-between gap-3">
                  <span className="font-serif text-18 font-medium text-foreground">
                    {item.article.title}
                  </span>
                  <ArrowRight
                    className="mt-1 size-4 shrink-0 text-brand-red transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
                    aria-hidden
                  />
                </span>
                <span className="mt-2 block text-12 leading-paragraph text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
