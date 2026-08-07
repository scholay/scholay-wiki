// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { RouteObject } from 'react-router-dom';

/**
 * 防回归:两条方向相反的路由归属,都被踩过 / 差点踩到,而且都**不会报错**,只会悄悄变坏。
 *
 *  1. `/wechat/callback` 必须在顶层裸渲染。它是 wxLogin `self_redirect` 的落点,加载在
 *     登录弹窗里那个 220×240 的 iframe 内 —— 一旦挂回 AppShell,整套 TopNav / 首页 chrome
 *     就被渲进登录弹窗(用户报的「扫完码弹窗里闪过首页」)。2026-07 诊断过一次,修复没落地。
 *
 *  2. 其余 OAuth 回调必须**留在** AppShell 下。它们是整页跳转、回来是全新文档,
 *     `useStagingSync` / `useReplayPendingAction` 靠「AppShell 在场时见到 token 空→非空」触发;
 *     跟着挪出去 = AppShell 变成登录后才挂载,本地暂存区同步被静默跳过。
 */

// 只把 createBrowserRouter 换成「原样回传路由表」——真 router 在 import 时就会 initialize(),
// 在 jsdom 里造 Request 会撞 undici 的 AbortSignal 检查(整个测试文件被判失败)。
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  createBrowserRouter: (routes: RouteObject[]) => ({ routes }),
}));

const { router } = await import('./router');
const top = router.routes as RouteObject[];
const shellChildren = top.find((r) => r.path === '/')?.children ?? [];

describe('auth callback 路由归属', () => {
  it('/wechat/callback 挂在顶层(不经 AppShell)', () => {
    expect(top.some((r) => r.path === '/wechat/callback')).toBe(true);
    expect(shellChildren.some((r) => r.path === 'wechat/callback')).toBe(false);
  });

  it('其余 OAuth 回调仍在 AppShell 下(别顺手一起挪走)', () => {
    for (const p of ['github/callback', 'google/callback']) {
      expect(shellChildren.some((r) => r.path === p)).toBe(true);
    }
  });
});
