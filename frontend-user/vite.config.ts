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
        // 函数式 manualChunks(性能审计 fe-bundle):
        //  - vendor 用【路径】匹配全部 react-dom 内部模块 —— 旧数组式 `['react-dom']` 只锁包入口,
        //    react-dom/client 本体(~174KB)漏进 entry chunk,污染 vendor 缓存分层;路径匹配收全。
        //  - katex / highlight.js 各自独立 chunk,【不再】与 react-markdown 焊死成一个 607KB 巨块:
        //    只用 react-markdown 的页面(法律/新闻正文 via RichContent)不再连坐下载 katex(252KB)+
        //    highlight.js(166KB)。含公式/代码的 MarkdownRenderer 消费方仍各自静态引其 chunk(体量不变,
        //    但按 hash 稳定、可独立缓存);react-markdown 生态交给 Rollup 就近切分。
        //  - lucide-react / react-pdf / @xyflow / framer 不强制聚块(见旧注释同理):图标就近并进引用它的
        //    chunk;framer 仍单独成块避免掉进 entry。dead dep @tanstack/react-table 已从 package.json 移除,
        //    其 `table` 命名块一并删除;react-virtual 交给各自 lazy 路由就近切。
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-router') ||
            id.includes('/node_modules/scheduler/')
          ) return 'vendor';
          if (id.includes('/node_modules/framer-motion/')) return 'motion';
          if (
            id.includes('/node_modules/@tanstack/react-query/') ||
            id.includes('/node_modules/axios/') ||
            id.includes('/node_modules/zustand/')
          ) return 'query';
          if (id.includes('/node_modules/katex/')) return 'katex';
          if (id.includes('/node_modules/highlight.js/') || id.includes('/node_modules/lowlight/')) return 'hljs';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
}));
