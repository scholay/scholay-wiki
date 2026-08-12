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
          const normalizedId = id.replace(/\\/g, '/');
          // Rollup 的 CommonJS runtime 是虚拟模块(\0commonjsHelpers.js),不含 node_modules。
          // 若交给自动分块,它可能被收进任意一个巨型 CJS 消费者;Mammoth 因此曾反向
          // import figure-spec/ELK 所在块。固定成独立小 runtime,让两条重依赖链彻底解耦。
          if (
            normalizedId.includes('commonjsHelpers.js') ||
            normalizedId.includes('commonjs-dynamic-modules')
          ) return 'commonjs-runtime';
          if (!normalizedId.includes('node_modules')) return;
          if (normalizedId.includes('/node_modules/elkjs/')) return 'elk';
          if (normalizedId.includes('/node_modules/mammoth/')) return 'mammoth';
          if (
            normalizedId.includes('/node_modules/react-dom/') ||
            normalizedId.includes('/node_modules/react/') ||
            normalizedId.includes('/node_modules/react-router') ||
            normalizedId.includes('/node_modules/scheduler/')
          ) return 'vendor';
          if (normalizedId.includes('/node_modules/framer-motion/')) return 'motion';
          if (
            normalizedId.includes('/node_modules/@tanstack/react-query/') ||
            normalizedId.includes('/node_modules/axios/') ||
            normalizedId.includes('/node_modules/zustand/')
          ) return 'query';
          if (normalizedId.includes('/node_modules/katex/')) return 'katex';
          // lowlight 不强制入 hljs:它与 ReactMarkdown 共用 AST 工具。Rollup 默认
          // 会把手工块的依赖一并收入,连 lowlight 也命名会让基础 Markdown 反向依赖 hljs。
          if (normalizedId.includes('/node_modules/highlight.js/')) return 'hljs';
          return undefined;
        },
      },
    },
    // 1500:elk(1.44MB)/mathlive(816KB)是刻意的独立 lazy 巨块(上面 manualChunks 手工命名),
    // 700 时它们每次构建都恒超线 —— 永远黄灯只会训练大家忽略构建警告。
    // 真正的体积闸在 bundle-budgets.json 的 largestJsChunkGzipBytes(npm run ci:bundle)。
    chunkSizeWarningLimit: 1500,
  },
}));
