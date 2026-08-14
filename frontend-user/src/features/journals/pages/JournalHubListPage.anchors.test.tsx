// @vitest-environment jsdom
// SEO 硬约束回归(§七第5条,口径对齐 shared/components/PaperResultCard/DefaultCard.anchors.test.tsx):
// 枢纽列表页水合后,期刊卡刊名必须是真实 <a href>(journalCanonicalPath 形态
// /journal/{id}/{slug}),分页必须是路径式真 <a href>(/journals/category/x/2)。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/shared/lib/http', () => ({
  http: { get: mocks.get, post: mocks.post },
  toApiError: (e: unknown) => e,
  isAuthError: () => false,
  BizCode: {},
}));

import { JournalHubCategoryPage } from './JournalHubListPage';

const card = {
  journal_id: 42,
  slug: 'nature-medicine',
  name: 'Nature Medicine',
  publisher: 'Nature Portfolio',
  jcr_impact_factor: 82.9,
  jcr_quartile: 'Q1',
  fqb_major_quartile: '1',
  fqb_top: true,
  xr_major_quartile: '1',
  is_oa: false,
  warning_level: '',
  h_index: 500,
  country: 'US',
};

beforeEach(() => {
  mocks.get.mockReset();
  mocks.get.mockImplementation((url: string) => {
    if (url === '/public/journal-hubs/overview') {
      return Promise.resolve({
        data: {
          data: {
            categories: [{ slug: 'yixue', name: '医学', count: 120 }],
            countries: [],
            warning_count: 0,
            oa_count: 0,
            latest: [],
          },
        },
      });
    }
    if (url === '/public/journal-hubs/list') {
      return Promise.resolve({
        data: {
          data: { items: [card], total: 120, page: 1, per_page: 50 },
        },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});

afterEach(() => cleanup());

function renderCategoryPage(initialPath: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/journals/category/:slug/:page?"
            element={<JournalHubCategoryPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('JournalHubListPage hydrated anchors', () => {
  it('期刊卡刊名是真实 <a href>,指向 /journal/{id}/{slug} canonical 路径', async () => {
    renderCategoryPage('/journals/category/yixue');

    const link = await screen.findByRole('link', { name: 'Nature Medicine' });
    expect(link.getAttribute('href')).toBe('/journal/42/nature-medicine');
  });

  it('分页是路径式真 <a href>(/journals/category/yixue/2),不是 query 或 button', async () => {
    renderCategoryPage('/journals/category/yixue');

    // total 120 / per_page 50 = 3 页;第 1 页只有「下一页」是链接
    const next = await screen.findByRole('link', { name: /下一页/ });
    expect(next.getAttribute('href')).toBe('/journals/category/yixue/2');
    // 第 1 页的「上一页」不是链接(禁用 span)
    expect(screen.queryByRole('link', { name: /上一页/ })).toBeNull();
  });

  it('第 2 页的上一页链接回到无页码段的 canonical 第 1 页路径', async () => {
    renderCategoryPage('/journals/category/yixue/2');

    const prev = await screen.findByRole('link', { name: /上一页/ });
    expect(prev.getAttribute('href')).toBe('/journals/category/yixue');
    const next = await screen.findByRole('link', { name: /下一页/ });
    expect(next.getAttribute('href')).toBe('/journals/category/yixue/3');
  });
});
