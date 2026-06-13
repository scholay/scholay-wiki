import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3001,
    host: true,
    proxy: {
      '/api': {
        // backend 容器不向宿主机暴露 8080(安全设计),API 统一入口是 nginx(HTTP_PORT, 默认 5411)
        target: 'http://localhost:5411',
        changeOrigin: true,
      },
    },
  },
  // 生产构建剥离 console / debugger —— 避免内部状态泄漏到 prod 控制台
  // (Vite 迁移时丢了 CRA 原本的这个行为)。dev (command==='serve') 保留。
  esbuild: command === 'build' ? { drop: ['console', 'debugger'] } : undefined,
  build: {
    outDir: 'build',
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // 不再把 lucide-react 强制聚成单 chunk: 那会把全站 ~143 个图标(含 admin/prism 等
          // 懒加载路由专用的)统统塞进首屏必下的 icons chunk(实测 ~80KB / 14.9KB gzip),而首屏
          // TopNav 实际只用 ~9 个。去掉后让 Rollup 把每个图标就近并进引用它的 chunk —— 常驻
          // TopNav 的图标落进 entry/shared, admin/prism 的随各自懒 chunk 走。(性能审计 fe-bundle)
          // framer-motion 单独成 chunk —— 否则它会掉进 entry 把首屏 chunk 撑大
          motion: ['framer-motion'],
          query: ['@tanstack/react-query', 'axios', 'zustand'],
          markdown: ['react-markdown', 'rehype-highlight', 'rehype-katex', 'remark-gfm', 'remark-math'],
          table: ['@tanstack/react-table', '@tanstack/react-virtual'],
          // 去掉 `flow`(@xyflow/react 零引用)和 `pdf`(强制命名 chunk 会把 app 级 clsx 混进去 →
          // react-pdf ~124KB 被静态拉进首屏)。react-pdf / @xyflow/react / framer-motion 交给各自
          // 的 lazy() 边界自动切分, 不进首屏。
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
}));
