// @vitest-environment jsdom
// SEO 硬约束回归(2026-08-10 审计:水合后 DOM 内链为 0):
// 实体跳转必须是真实 <a href>,且 href 与 shared/hooks 的路径 helpers 一致。
// 断言口径对齐 src/shared/components/news/NewsListItem.test.tsx。
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Paper } from '@/shared/api/types';
import { DefaultCard } from './DefaultCard';

const paper: Paper = {
  paperId: 'p1',
  title: 'Attention Is All You Need',
  source: 'stc',
  venue: 'NeurIPS',
  year: 2017,
  authors: [{ authorId: 'a1', name: 'Ashish Vaswani' }],
};

afterEach(() => cleanup());

describe('DefaultCard hydrated anchors', () => {
  it('标题 / 期刊 / 作者都渲染成真实 <a href>,指向实体 canonical 路径', () => {
    render(
      <MemoryRouter>
        <DefaultCard
          paper={paper}
          isStaged={false}
          isFavorited={false}
          journalEnrichment={{ id: 42, canonical_name: 'NeurIPS' }}
          onToggleStage={() => {}}
          onFold={() => {}}
          hideStage
          readOnly
        />
      </MemoryRouter>
    );

    expect(
      screen
        .getByRole('link', { name: 'Attention Is All You Need' })
        .getAttribute('href')
    ).toBe('/paper/stc/p1');
    expect(
      screen.getByRole('link', { name: 'NeurIPS' }).getAttribute('href')
    ).toBe('/journal/42');
    expect(
      screen.getByRole('link', { name: 'Ashish Vaswani' }).getAttribute('href')
    ).toBe('/author/stc/a1');
  });
});
