import type { WikiEmbedLayout, WikiEmbedRef } from "../types";
import { WIKI_EMBED_REGISTRY } from "./registry";
import { WikiEmbedFrame } from "./WikiEmbedFrame";

export function WikiEmbedList({
  embeds,
  layout = "stack",
}: {
  embeds: WikiEmbedRef[];
  layout?: WikiEmbedLayout;
}) {
  if (embeds.length === 0) return null;

  const frames = embeds.map((embed) => {
    const definition = WIKI_EMBED_REGISTRY[embed.id];
    if (!definition) return null;
    const { Component } = definition;
    return (
      <WikiEmbedFrame
        key={embed.id}
        caption={embed.caption ?? definition.defaultCaption}
        className={layout === "row" ? "mt-0 w-full" : undefined}
      >
        <Component />
      </WikiEmbedFrame>
    );
  });

  if (layout === "row") {
    return (
      <div className="mt-6 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:items-start">
        {frames}
      </div>
    );
  }

  return <>{frames}</>;
}
