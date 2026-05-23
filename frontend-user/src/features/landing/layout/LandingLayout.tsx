import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LandingNav } from './LandingNav';
import { LandingFooter } from './LandingFooter';

/**
 * Landing 页统一壳 —— 顶部 LandingNav + 内容 slot + 底部 LandingFooter。
 *
 * 不复用 AppShell(那是产品内的左侧 sidebar 布局)。宣传页是「未登录用户先看」
 * 的入口,UI 上是常规 marketing 网站:全宽 + 顶部 nav + 多 section + 大 footer。
 *
 * 路由切换时自动把页面滚回顶部,避免从一个 Landing 跳到另一个 Landing 时
 * 落在上一个页面的滚动位置。
 */
export function LandingLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <LandingNav />
      <main className="flex-1">{children}</main>
      <LandingFooter />
    </div>
  );
}
