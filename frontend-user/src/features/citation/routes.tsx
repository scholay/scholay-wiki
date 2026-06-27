import type { RouteObject } from 'react-router-dom';

/**
 * 引用生成器 —— 独立工具页(挂 AppShell)。
 * 响应式单页,无 /m 孪生 → 手机直接留在原地渲染(device 闸 null)。
 */
export const citationRoutes: RouteObject[] = [
  {
    path: 'citation-generator',
    lazy: () =>
      import('./pages/CitationGeneratorPage').then((m) => ({
        Component: m.CitationGeneratorPage,
      })),
  },
];
