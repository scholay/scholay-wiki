import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Deck build for the Scholay "制作PPT" feature.
// Emits ONE fully self-contained index.html (all JS/CSS inlined, no external
// refs) into dist-single/. The executor's BuildDeck tool then copies that
// single file into the session's ./out/ so it flows through the existing
// claw-style artifact pipeline (srcDoc preview + download).
//
// ⚠️ 关键:产物要能在**沙箱 srcDoc iframe(无 allow-same-origin,opaque 源)**里渲染
// (右侧成果面板的预览就是这种沙箱)。两个坑叠加,都要治:
//   ① 浏览器**不执行 opaque 源里的 `<script type="module">`** → 独立打开正常、面板内白屏。
//      故输出 IIFE(经典脚本)+ 去掉 type="module"/crossorigin。
//   ② vite 把内联脚本放进 `<head>`。module 脚本自带 defer(DOM 解析完才跑),经典脚本却**立即执行**,
//      此时 body 里的 `#root` 还没解析 → createRoot 找不到挂载点 → 白屏。故把脚本体包进
//      DOMContentLoaded 守卫,等 DOM 就绪再跑(与 module 的 defer 语义对齐)。
function classicScriptForSandbox(): Plugin {
  return {
    name: 'classic-script-for-sandbox',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' && file.fileName.endsWith('.html') && typeof file.source === 'string') {
          let html = file.source
            .replace(/<script\s+type="module"\s+crossorigin>/g, '<script>')
            .replace(/<script\s+type="module">/g, '<script>')
            .replace(/\s+crossorigin(?==|>|\s)/g, '');
          // 内联经典脚本(无 src)包进 DOMContentLoaded 守卫。bundle 里的字符串字面量已被
          // rollup 转义(不含裸 </script>),故非贪婪匹配安全。
          html = html.replace(
            /<script>([\s\S]*?)<\/script>/g,
            (_m, body: string) =>
              `<script>(function(){function __run(){${body}\n}` +
              `if(document.readyState!=="loading")__run();` +
              `else document.addEventListener("DOMContentLoaded",__run);})();</script>`,
          );
          file.source = html;
        }
      }
    },
  };
}

export default defineConfig({
  base: './',
  // At runtime node_modules is a symlink to a read-only /opt image dir, so
  // keep any cache writes inside the writable session cwd.
  cacheDir: '.vite-cache',
  // viteSingleFile 先内联,classicScriptForSandbox(enforce:post)再把内联脚本改成经典脚本 + DOMContentLoaded 守卫。
  plugins: [react(), viteSingleFile(), classicScriptForSandbox()],
  build: {
    outDir: 'dist-single',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000,
    // 经典 IIFE 单包:无 import/export → 去掉 type="module" 后仍可作经典脚本在沙箱里执行。
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
