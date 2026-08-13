import { Info } from "lucide-react";
import { Link } from "react-router-dom";
import type { WikiTip } from "../types";

export function WikiTipCallout({ tip }: { tip: WikiTip }) {
  return (
    <aside
      role="note"
      aria-label="提示"
      className="mt-6 flex items-start gap-3 rounded-12 border border-border bg-surface-card px-4 py-3 text-12 leading-paragraph text-subtle"
    >
      <Info className="mt-1 size-4 shrink-0 text-status-info" aria-hidden />
      <p>
        {tip.text}
        {tip.link && (
          <>
            {" "}
            <Link
              to={`/wiki/${tip.link.articleSlug}${tip.link.sectionId ? `#${tip.link.sectionId}` : ""}`}
              className="font-medium text-brand-red underline underline-offset-4"
            >
              {tip.link.label}
            </Link>
          </>
        )}
      </p>
    </aside>
  );
}
