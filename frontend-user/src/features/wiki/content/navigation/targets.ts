import type { WikiNavTarget } from "../../types";

export const primary = (
  articleSlug: string,
  sectionId?: string,
): WikiNavTarget => ({
  articleSlug,
  sectionId,
});

export const jump = (
  articleSlug: string,
  sectionId?: string,
): WikiNavTarget => ({
  articleSlug,
  sectionId,
  shortcut: true,
});
