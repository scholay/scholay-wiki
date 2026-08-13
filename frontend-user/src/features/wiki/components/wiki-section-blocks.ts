import type {
  WikiEmbedRef,
  WikiSectionBlock,
  WikiSectionTable,
} from "../types";

export function wikiSectionBlocks({
  blocks,
  markdown,
  table,
  embeds,
}: {
  blocks?: WikiSectionBlock[];
  markdown: string;
  table?: WikiSectionTable;
  embeds?: WikiEmbedRef[];
}): WikiSectionBlock[] {
  if (blocks) return blocks;
  const hasMermaid = /```mermaid/.test(markdown);
  const contentBlocks = [
    ...(markdown.trim() ? ([{ type: "markdown" }] as const) : []),
    ...(table ? ([{ type: "table" }] as const) : []),
  ];

  const orderedContentBlocks = hasMermaid
    ? contentBlocks
    : [...contentBlocks].reverse();

  return [
    ...orderedContentBlocks,
    ...(embeds?.length ? ([{ type: "embeds" }] as const) : []),
  ];
}
