import type { WikiEmbedRef } from "../types";
import { WIKI_EMBED_REGISTRY } from "./registry";
import { WikiEmbedFrame } from "./WikiEmbedFrame";

export function WikiEmbedList({ embeds }: { embeds: WikiEmbedRef[] }) {
  if (embeds.length === 0) return null;

  return (
    <div className="space-y-4">
      {embeds.map((embed) => {
        const definition = WIKI_EMBED_REGISTRY[embed.id];
        if (!definition) return null;
        const { Component } = definition;
        return (
          <WikiEmbedFrame
            key={embed.id}
            caption={embed.caption ?? definition.defaultCaption}
          >
            <Component />
          </WikiEmbedFrame>
        );
      })}
    </div>
  );
}
