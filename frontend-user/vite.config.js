import { defineConfig, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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

export default defineConfig({
  plugins: [react(), jsxInJsPlugin()],
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
          ui: ['framer-motion', 'lucide-react', 'recharts'],
          editor: [
            'codemirror',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/state',
            '@codemirror/view',
          ],
          pdf: ['pdfjs-dist', 'react-pdf'],
          export: ['docx', 'jspdf', 'html2canvas', 'pptxgenjs', 'file-saver'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  envPrefix: ['VITE_', 'REACT_APP_'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    'process.env.REACT_APP_API_URL': JSON.stringify(process.env.REACT_APP_API_URL || ''),
    'process.env.REACT_APP_ENABLE_LOGS': JSON.stringify(process.env.REACT_APP_ENABLE_LOGS || ''),
  },
});
