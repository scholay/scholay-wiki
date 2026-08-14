import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

const typescriptFiles = ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'];

/**
 * 最小可执行 flat config。
 *
 * 仓库此前虽有 ESLint 9 依赖和 lint script，但没有 eslint.config.*，命令
 * 会在扫描源码前立即失败。这里只启用 TypeScript 基础规则、React Hooks
 * 正确性与 Vite Fast Refresh 边界；不在性能整改中引入全仓风格重写。
 */
export default tseslint.config(
  {
    ignores: ['build/**', 'dist/**', 'node_modules/**', 'public/**', 'coverage/**'],
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: typescriptFiles,
  })),
  {
    files: ['src/**/*.{ts,tsx}'],
    ...reactHooks.configs['recommended-latest'],
  },
  {
    files: ['src/**/*.tsx'],
    ...reactRefresh.configs.vite,
    rules: {
      ...reactRefresh.configs.vite.rules,
      // 库中大量 shadcn 组件同文件导出 variants/helper；Vite 支持常量导出。
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
