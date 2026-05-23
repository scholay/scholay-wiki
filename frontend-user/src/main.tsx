import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from '@/app/App';
import { initClientErrorReporter } from '@/shared/lib/client-error-reporter';
import '@/styles/globals.css';

// 必须在 React 树挂载前调用 —— 否则 window.onerror / unhandledrejection 监听器
// 来不及挂上,模块加载阶段的异常就会丢失到 console 里,docker logs 收不到。
initClientErrorReporter();

/**
 * 发版后 stale-chunk 自愈 —— 老 HTML 引用的旧 hash chunk 在新部署里已经 404。
 *
 * 表现:用户在打开 tab 期间我们部署了新版,他点任何 lazy 路由会触发动态 import,
 *   去拿一个不存在的 `index-XXXXXXXX.js` → fetch 404 → react-router lazy() 抛错
 *   → errorElement 渲染 NotFoundPage。用户疑惑"明明这个页面存在啊",一刷新就好了。
 *
 * 修法:监听 Vite 在 chunk 预加载失败时派发的 `vite:preloadError` 事件,
 *   强制 `location.reload()` 拉一次新 HTML(里面是新 hash),后续 import 即恢复。
 *
 * 防自旋:reload 之前用 sessionStorage 记一个守卫 key,同一会话只兜一次。
 *   万一新 HTML 也跪(服务器配置错误),不会陷入无限刷新。
 *   reload 成功后会进入 unload → 守卫 key 自然留下,这次刷新失败的话不会再重复。
 */
window.addEventListener('vite:preloadError', (event) => {
  if (sessionStorage.getItem('scholay.preloadErrorReloaded') === '1') {
    // 已经兜过一次还跪 —— 大概率不是版本错位,而是真有问题,放弃自愈让 NotFoundPage 兜底
    return;
  }
  event.preventDefault();
  sessionStorage.setItem('scholay.preloadErrorReloaded', '1');
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
