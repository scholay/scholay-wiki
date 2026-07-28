import React from "react";
import ReactDOM from "react-dom/client";
import { initClientErrorReporter } from "@/shared/lib/client-error-reporter";
import { tryReloadForStaleChunk } from "@/shared/lib/stale-chunk";
import { MOCK_MODE } from "@/mocks/config";
import "@/styles/globals.css";

async function bootstrap() {
  // App 必须动态 import：Mock 身份要先写入 localStorage，router/adminGuard 才能读到正确初态。
  if (MOCK_MODE) {
    const { startMockBackend } = await import("@/mocks/browser");
    await startMockBackend();
  }

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
  window.addEventListener("vite:preloadError", (event) => {
    if (tryReloadForStaleChunk()) {
      event.preventDefault();
    }
  });

  const { App } = await import("@/app/App");
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap().catch((error: unknown) => {
  const root = document.getElementById("root");
  if (root) {
    root.textContent = `${MOCK_MODE ? "Mock 后端" : "应用"}启动失败：${
      error instanceof Error ? error.message : "未知错误"
    }`;
  }
  throw error;
});
