// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RouteSEO } from './RouteSEO';

const MANAGED_SELECTOR = [
  'title',
  'meta[name="description"]',
  'meta[name="keywords"]',
  'meta[name="robots"]',
  'link[rel="canonical"]',
].join(',');

beforeEach(() => {
  document.head.querySelectorAll(MANAGED_SELECTOR).forEach((node) => node.remove());
  document.head.insertAdjacentHTML(
    'beforeend',
    `<title data-seo-fallback="server">Server title</title>
     <meta data-seo-fallback="server" name="description" content="Server description">
     <meta data-seo-fallback="server" name="keywords" content="server">
     <link data-seo-fallback="server" rel="canonical" href="https://www.scholay.com/server">
     <meta data-seo-fallback="server" name="robots" content="index,follow">`,
  );
});

afterEach(() => {
  cleanup();
  document.head.querySelectorAll(MANAGED_SELECTOR).forEach((node) => node.remove());
});

describe('RouteSEO head hand-off', () => {
  it('keeps one rendered title, description, canonical and robots tag under createRoot', () => {
    const view = render(
      <StrictMode>
        <MemoryRouter initialEntries={['/search?q=duplicate']}>
          <RouteSEO
            title="Search title"
            description="Search description"
            keywords="papers,research"
            canonical="/search"
            noindex
          />
        </MemoryRouter>
      </StrictMode>,
    );

    expect(document.head.querySelectorAll('title')).toHaveLength(1);
    expect(document.title).toBe('Search title');
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="keywords"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://www.scholay.com/search',
    );
    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, follow',
    );
    expect(document.head.querySelectorAll('[data-seo-fallback]')).toHaveLength(0);

    view.unmount();

    expect(document.head.querySelectorAll('[data-seo-fallback="server"]')).toHaveLength(5);
    expect(document.head.querySelectorAll('[data-route-seo="true"]')).toHaveLength(0);
  });
});
