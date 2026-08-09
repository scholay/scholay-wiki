// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { NewsCard } from '@/shared/api/news';
import { NewsListItem } from './NewsListItem';

const item: NewsCard = {
  slug: 'test-news',
  title: '延迟加载的新闻标题',
  summary: '只有详情可见后才渲染的摘要',
  section: 'other',
  section_label: '情报',
  report_type: 'hourly',
  sources: [],
  is_featured: false,
  score: 0,
  view_count: 0,
  heat_external: 0,
  heat_trend: 0,
  published_at: '2026-08-10T00:00:00Z',
};

class IdleIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', IdleIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NewsListItem deferred details', () => {
  it('keeps an accessible linked heading while deferred and reveals details immediately when deferDetails turns false', () => {
    const view = render(
      <MemoryRouter>
        <NewsListItem item={item} deferDetails />
      </MemoryRouter>,
    );

    const heading = screen.getByRole('heading', { name: item.title });
    expect(heading.tagName).toBe('H3');
    expect(heading.classList.contains('sr-only')).toBe(true);
    expect(screen.getByRole('link', { name: item.title }).getAttribute('href')).toBe(
      `/news/${item.slug}`,
    );
    expect(screen.queryByText(item.summary)).toBeNull();

    view.rerender(
      <MemoryRouter>
        <NewsListItem item={item} deferDetails={false} />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: item.title }).classList.contains('sr-only'),
    ).toBe(false);
    expect(screen.getByText(item.summary)).toBeTruthy();
  });
});
