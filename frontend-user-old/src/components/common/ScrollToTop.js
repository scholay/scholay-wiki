/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * ============================================================================
 *
 * ScrollToTop - 路由切换时重置 window/body 滚动位置。
 *
 * 仅负责 window 滚动（/features、/features/* 等渲染在 MainLayout 外的页面）。
 * MainLayout 内部的 `.main-layout-scroll` 由 MainLayout 自身的 effect 负责
 * 复位 —— 因为 App.js 的外层 <Suspense fallback={null}> 会在 lazy 路由加载
 * 时短暂卸载整棵子树，若在这里查询 DOM 可能取不到容器。
 *
 * 若目标 URL 带 #hash，保留浏览器默认的锚点跳转行为。
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
