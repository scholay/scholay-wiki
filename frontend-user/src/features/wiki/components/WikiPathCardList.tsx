import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import type { WikiFeatureIconSlug } from "../visuals/catalog";
import { WikiFeatureIcon } from "./WikiFeatureIcon";

export interface WikiPathCardItem {
  to: string;
  title: string;
  description: string;
  icon: WikiFeatureIconSlug;
}

export function WikiPathCardList({
  items,
  className,
}: {
  items: WikiPathCardItem[];
  className?: string;
}) {
  return (
    <ul className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", className)}>
      {items.map((item) => (
        <li key={item.to}>
          <Link
            to={item.to}
            className="group flex min-h-28 items-start gap-4 rounded-12 border border-border p-4 shadow-raised transition-colors hover:border-border-strong hover:bg-foreground/5 focus-visible:border-border-strong focus-visible:bg-foreground/5"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-8 bg-foreground/5">
              <WikiFeatureIcon
                slug={item.icon}
                className="size-8 object-contain"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-18 font-medium text-foreground">
                {item.title}
              </span>
              <span className="mt-2 block text-12 leading-paragraph text-subtle">
                {item.description}
              </span>
            </span>
            <ArrowRight className="mt-1 size-3 shrink-0 text-brand-red transition-transform group-hover:translate-x-1" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
