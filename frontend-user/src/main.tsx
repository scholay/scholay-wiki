// 2026-07 线上审计:URL.parse polyfill(Safari<18 无此静态方法,pdfjs TextLayer 白屏)。
// 必须排在所有业务 import 之前求值。
import '@/shared/lib/polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/app/App';
import { initClientErrorReporter } from '@/shared/lib/client-error-reporter';
import { tryReloadForStaleChunk } from '@/shared/lib/stale-chunk';
import '@/styles/globals.css';

// 必须在 React 树挂载前调用 —— 否则 window.onerror / unhandledrejection 监听器
// 来不及挂上,模块加载阶段的异常就会丢失到 console 里,docker logs 收不到。
initClientErrorReporter();

/**
 * 发版后 stale-chunk 自愈 —— 老 HTML 引用的旧 hash chunk 在新部署里已经 404。
 *
 * 监听 Vite 在 chunk 预加载失败时派发的 `vite:preloadError` 事件,
 * 调用共享的 tryReloadForStaleChunk()(30 秒冷却时间戳)拉一次新 HTML。
 * 兜底路径在 RouteErrorBoundary 内,两边共用同一个冷却 key,防互相打架。
 */
window.addEventListener('vite:preloadError', (event) => {
  if (tryReloadForStaleChunk()) {
    event.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
