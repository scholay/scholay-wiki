// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { FeatureGuideCards } from './FeatureGuideCards';

afterEach(cleanup);

describe('FeatureGuideCards', () => {
  it('提供 Wiki、EnterScholar 与 Scholay 三类明确去向', () => {
    render(
      <MemoryRouter>
        <FeatureGuideCards
          topic="智能写作"
          wikiHref="/wiki/prism"
          scholayPath="/prism"
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('link')).toHaveLength(3);
    const wiki = screen.getByRole('link', {
      name: /在 Wiki 中了解智能写作/,
    });
    expect(wiki.getAttribute('href')).toBe('/wiki/prism');
    expect(wiki.getAttribute('target')).toBeNull();

    const community = screen.getByRole('link', {
      name: /看看大家怎么用？/,
    });
    expect(community.getAttribute('href')).toBe('https://enterscholar.com');
    expect(community.getAttribute('target')).toBe('_blank');
    expect(community.getAttribute('rel')?.split(' ').sort()).toEqual([
      'noopener',
      'noreferrer',
    ]);

    const scholay = screen.getByRole('link', {
      name: /前往 Scholay 对应页面/,
    });
    expect(scholay.getAttribute('href')).toBe(
      'https://www.scholay.com/prism',
    );
    expect(scholay.getAttribute('target')).toBe('_blank');
    expect(scholay.getAttribute('rel')?.split(' ').sort()).toEqual([
      'noopener',
      'noreferrer',
    ]);
  });

  it('允许把社区卡指向对应的 EnterScholar 讨论页', () => {
    render(
      <MemoryRouter>
        <FeatureGuideCards
          topic="智能审稿"
          wikiHref="/wiki/peer-review"
          communityHref="https://enterscholar.com/tag/peer-review"
          scholayPath="/peer-review"
        />
      </MemoryRouter>,
    );

    expect(
      screen
        .getByRole('link', { name: /看看大家怎么用？/ })
        .getAttribute('href'),
    ).toBe('https://enterscholar.com/tag/peer-review');
  });
});
