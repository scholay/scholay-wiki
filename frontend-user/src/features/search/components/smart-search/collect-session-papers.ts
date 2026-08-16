import { extractToolQuery } from '@/shared/components/chat/MinicodToolMeta';
import {
  MINICOD_TOOL_PREFIX,
  parsePapersFromToolResult,
} from '@/shared/lib/minicod-papers';
import type { Paper } from '@/shared/api/types';
import type { Turn } from '@/shared/types/chat';

/** One unique paper from this session, numbered in first-seen order. */
export interface CiteEntry {
  index: number;
  paper: Paper;
  query?: string;
  toolUseId: string;
}

export interface CiteGroup {
  toolUseId: string;
  query?: string;
  entries: CiteEntry[];
}

/**
 * Walk every tool_result in the session and collect unique papers.
 * First occurrence wins (same paperId from a later search is skipped).
 * Cite numbers stay stable as later searches append.
 */
export function collectSessionPapers(turns: Turn[]): CiteEntry[] {
  const seen = new Set<string>();
  const out: CiteEntry[] = [];

  for (const turn of turns) {
    for (const block of turn.blocks) {
      if (block.kind !== 'tool' || block.result === undefined) continue;
      if (!block.toolName.startsWith(MINICOD_TOOL_PREFIX)) continue;
      const papers = parsePapersFromToolResult(block.result);
      if (papers.length === 0) continue;
      const query = extractToolQuery(block.input);
      for (const paper of papers) {
        if (seen.has(paper.paperId)) continue;
        seen.add(paper.paperId);
        out.push({
          index: out.length + 1,
          paper,
          query,
          toolUseId: block.toolUseId,
        });
      }
    }
  }

  return out;
}

/** Group by the search that produced them. Newest group first. */
export function groupCiteEntries(entries: CiteEntry[]): CiteGroup[] {
  const order: string[] = [];
  const map = new Map<string, CiteGroup>();
  for (const entry of entries) {
    let group = map.get(entry.toolUseId);
    if (!group) {
      group = { toolUseId: entry.toolUseId, query: entry.query, entries: [] };
      map.set(entry.toolUseId, group);
      order.push(entry.toolUseId);
    }
    group.entries.push(entry);
  }
  return order.reverse().map((id) => map.get(id)!);
}

export function formatCiteAuthors(paper: Paper, max = 2): string {
  const names = (paper.authors ?? [])
    .map((a) => a.name?.trim())
    .filter((n): n is string => !!n);
  if (names.length === 0) return '';
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} et al.`;
}
