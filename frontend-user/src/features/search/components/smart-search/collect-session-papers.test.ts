import { describe, expect, it } from 'vitest';
import type { Turn } from '@/shared/types/chat';
import {
  collectSessionPapers,
  groupCiteEntries,
} from './collect-session-papers';

function paperTurn(
  toolUseId: string,
  query: string,
  papers: Array<{ id: string; title: string }>,
): Turn {
  return {
    id: `turn-${toolUseId}`,
    userText: query,
    complete: true,
    blocks: [
      {
        kind: 'tool',
        id: `tool-${toolUseId}`,
        toolName: 'mcp__minicod__search_papers',
        toolUseId,
        input: { query },
        result: {
          items: papers.map((p) => ({
            id: p.id,
            source: 'stc',
            title: p.title,
            year: 2017,
          })),
        },
      },
    ],
  };
}

describe('collectSessionPapers', () => {
  it('numbers unique papers in first-seen order and skips later duplicates', () => {
    const entries = collectSessionPapers([
      paperTurn('a', '111', [
        { id: 'p1', title: 'Attention Is All You Need' },
        { id: 'p2', title: 'BERT' },
      ]),
      paperTurn('b', 'transformer', [
        { id: 'p1', title: 'Attention Is All You Need' },
        { id: 'p3', title: 'GPT' },
      ]),
    ]);

    expect(entries.map((e) => [e.index, e.paper.paperId, e.query])).toEqual([
      [1, 'p1', '111'],
      [2, 'p2', '111'],
      [3, 'p3', 'transformer'],
    ]);
  });

  it('puts the newest search group first', () => {
    const entries = collectSessionPapers([
      paperTurn('a', '111', [{ id: 'p1', title: 'A' }]),
      paperTurn('b', 'later', [{ id: 'p2', title: 'B' }]),
    ]);
    const groups = groupCiteEntries(entries);
    expect(groups.map((g) => g.query)).toEqual(['later', '111']);
  });
});
