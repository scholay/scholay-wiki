import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

function WikiMediaCaption({ children }: { children: ReactNode }) {
  return (
    <figcaption className="wiki-media-caption mt-3 max-w-full px-2 text-center text-12 leading-paragraph text-muted-foreground">
      {children}
    </figcaption>
  );
}

export function WikiFigure({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "wiki-fig mx-auto mt-6 flex w-fit max-w-full scroll-mt-20 flex-col items-center",
        className,
      )}
    >
      {children}
      <WikiMediaCaption>{caption}</WikiMediaCaption>
    </figure>
  );
}

export function WikiTableFigure({
  caption,
  children,
  className,
}: {
  caption: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "wiki-tbl mx-auto mt-6 flex w-full max-w-full scroll-mt-20 flex-col items-center",
        className,
      )}
    >
      <div className="w-full max-w-full overflow-x-auto">{children}</div>
      <WikiMediaCaption>{caption}</WikiMediaCaption>
    </figure>
  );
}
