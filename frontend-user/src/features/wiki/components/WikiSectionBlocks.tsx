import { Fragment, type ReactNode } from "react";
import type {
  WikiArticleLinkCard as WikiArticleLinkCardData,
  WikiEmbedRef,
  WikiSectionBlock,
  WikiSectionTable,
} from "../types";
import { WikiArticleLinkCard } from "./WikiArticleLinkCard";
import { WikiNextSteps } from "./WikiNextSteps";
import { WikiPathCardList } from "./WikiPathCardList";
import { WikiPromptTabs } from "./WikiPromptTabs";
import { WikiTipCallout } from "./WikiTipCallout";

interface WikiSectionBlockRenderers {
  markdown: (text: string) => ReactNode;
  table: (table: WikiSectionTable) => ReactNode;
  embeds: (embeds: WikiEmbedRef[], layout?: "stack" | "row") => ReactNode;
}

export function WikiSectionBlocks({
  blocks,
  renderers,
  markdown,
  table,
  embeds,
}: {
  blocks: WikiSectionBlock[];
  renderers: WikiSectionBlockRenderers;
  markdown: string;
  table?: WikiSectionTable;
  embeds?: WikiEmbedRef[];
}) {
  return blocks.map((block, index) => {
    const key = blockKey(block, index);
    switch (block.type) {
      case "markdown": {
        const text = block.markdown ?? markdown;
        return text.trim() ? (
          <Fragment key={key}>{renderers.markdown(text)}</Fragment>
        ) : null;
      }
      case "table":
        return table ? (
          <Fragment key={key}>{renderers.table(table)}</Fragment>
        ) : null;
      case "embeds": {
        const items = block.ids?.length
          ? block.ids.flatMap((id) => {
              const match = embeds?.find((embed) => embed.id === id);
              return match ? [match] : [];
            })
          : (embeds ?? []);
        return items.length ? (
          <Fragment key={key}>{renderers.embeds(items, block.layout)}</Fragment>
        ) : null;
      }
      case "prompt-tabs":
        return <WikiPromptTabs key={key} group={block.group} />;
      case "article-link":
        return <WikiArticleLinkCard key={key} card={block.card} />;
      case "tip":
        return <WikiTipCallout key={key} tip={block.tip} />;
      case "next-steps":
        return <WikiNextSteps key={key} group={block.group} />;
      case "path-cards":
        return (
          <WikiPathCardList
            key={key}
            className="mt-6"
            items={block.items.map((item) => ({
              to: `/wiki/${item.articleSlug}${item.sectionId ? `#${item.sectionId}` : ""}`,
              title: item.title,
              description: item.description,
              icon: item.icon,
            }))}
          />
        );
    }
  });
}

function blockKey(block: WikiSectionBlock, index: number): string {
  switch (block.type) {
    case "markdown":
    case "table":
    case "embeds":
      return `${block.type}-${index}`;
    case "prompt-tabs":
      return `prompt-${block.group.id}`;
    case "article-link":
      return `link-${targetKey(block.card)}`;
    case "tip":
      return `tip-${index}-${block.tip.text}`;
    case "next-steps":
      return `next-${index}`;
    case "path-cards":
      return `path-cards-${index}`;
  }
}

function targetKey(
  target: Pick<WikiArticleLinkCardData, "articleSlug" | "sectionId">,
): string {
  return `${target.articleSlug}-${target.sectionId ?? "root"}`;
}
