import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

// Custom plugin: treat .js files in src/ as JSX so existing CRA code works as-is
function jsxInJsPlugin() {
  return {
    name: 'jsx-in-js',
    async transform(code, id) {
      if (!/\/src\/.*\.js$/.test(id)) return;
      return transformWithEsbuild(code, id, { loader: 'jsx' });
    },
  };
}

// 生产构建时剥离 index.html 里的 HTML 注释（含版权声明），避免泄露给终端用户。
// 保留 IE 条件注释 <!--[if ...]> 以防万一。
function stripHtmlCommentsPlugin() {
  return {
    name: 'strip-html-comments',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    jsxInJsPlugin(),
    stripHtmlCommentsPlugin(),
    visualizer({
      filename: 'build/bundle-stats.html',
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ],
  resolve: {
    alias: {
      src: path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'build',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['framer-motion', 'lucide-react'],
          query: ['@tanstack/react-query', 'axios', 'zustand'],
          markdown: ['react-markdown', 'rehype-highlight', 'remark-gfm'],
          charts: ['recharts'],
          editor: [
            'codemirror',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/state',
            '@codemirror/view',
          ],
          pdf: ['pdfjs-dist', 'react-pdf'],
          utils: ['date-fns', 'lodash-es', 'dompurify'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  envPrefix: ['VITE_', 'REACT_APP_'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.REACT_APP_API_URL': JSON.stringify(process.env.REACT_APP_API_URL || ''),
    'process.env.REACT_APP_ENABLE_LOGS': JSON.stringify(process.env.REACT_APP_ENABLE_LOGS || ''),
    // 站点配置 —— 所有 SEO 用到的域名/邮箱/第三方服务地址,默认值在 src/config/site.ts。
    // 部署到不同环境(staging/production/私有部署)只需在 docker-compose / .env 设置对应变量。
    'process.env.REACT_APP_SITE_URL': JSON.stringify(process.env.REACT_APP_SITE_URL || ''),
    'process.env.REACT_APP_SITE_NAME': JSON.stringify(process.env.REACT_APP_SITE_NAME || ''),
    'process.env.REACT_APP_SUPPORT_EMAIL': JSON.stringify(process.env.REACT_APP_SUPPORT_EMAIL || ''),
    'process.env.REACT_APP_PDF_PREVIEW_ENDPOINT': JSON.stringify(process.env.REACT_APP_PDF_PREVIEW_ENDPOINT || ''),
  },
});
