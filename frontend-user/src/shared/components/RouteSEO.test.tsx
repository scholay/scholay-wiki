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
  // 🔴 canonical 必须跟随当前 origin,绝不能是写死的域名。
  //
  // 这条曾经是反的(`const SITE_URL = 'https://www.scholay.com'`),而 RouteSEO 的
  // 工作方式让它格外危险:组件会先**移除**后端 SSR 注入的 canonical
  // (带 data-seo-fallback="server" 的那批,见下面的断言),再注入自己拼的那个。
  // 于是在任何非该域名的部署上,会跑 JS 的爬虫看到的每一页 canonical 都指向另一个
  // 站点 —— 本环境的内容被归因过去,正是 duplicate content 最坏的形态,而且页面
  // 肉眼看完全正常,只有爬虫看得见。
  //
  // 用 location.origin 是零配置的正解:天然跟随部署域名,不需要 env、不需要重新
  // 构建,也不会因为漏配而回落到别人的域名。

  it('canonical 跟随当前 origin,不含任何硬编码域名', () => {
    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <RouteSEO title="t" description="d" />
      </MemoryRouter>,
    );
    const href = document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');
    expect(href).toBe(`${window.location.origin}/pricing`);
    // 反向断言:换个 origin 部署时不该出现这个域名。写成 not.toContain 而不是比对
    // 具体值,是为了让「有人把某个域名写回代码里」这件事本身被拦住。
    expect(href).not.toContain('scholay.com');
  });

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
    // canonical 的 origin 必须是**当前访问的 origin**,而不是任何写死的域名。
    // 这条契约存在的原因见下面 describe 块的注释。
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${window.location.origin}/search`,
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
