import type { LoaderFunctionArgs, RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';
import { queryClient } from '@/shared/lib/query-client';
import {
  fetchPaperDetail,
  paperDetailQueryKey,
  PAPER_DETAIL_STALE_TIME,
} from '@/shared/api/paper-detail';
import {
  fetchAuthorDetail,
  authorDetailQueryKey,
  AUTHOR_DETAIL_STALE_TIME,
} from '@/shared/api/authors';
import { fetchJournalFull, journalDetailQueryKey } from '@/shared/api/journals';
import { STALE_COLD } from '@/shared/lib/query-config';
import { isAppMounted } from '@/shared/lib/app-boot';
import type { UpstreamSource } from '@/shared/api/types';

/**
 * 浏览器(论文 / 期刊 / 学者 / PDF 详情承载路由)。
 *
 * **URL 设计**:用不带 `/browser` 前缀的 canonical 路径,作为 runtime + SEO 共用:
 *   /paper/:source/:paperId        论文详情
 *   /author/:source/:authorId      学者详情
 *   /journal/:id                   期刊详情 (legacy, 后端会 301 到带 slug 的形式)
 *   /journal/:id/:slug             期刊详情 SEO canonical (slug 仅做 SEO 关键词增益)
 *   /pdf/:libPaperId               用户上传 PDF 预览
 *
 * 为啥不带 `/browser` 前缀:
 *   - "browser" 对 Google 没语义价值,稀释 URL 关键词权重
 *   - 想让 sitemap emit 同样的 URL,实现 SEO 与 runtime 单一表面
 *   - 老路由 `/browser/p/:source/:paperId` 由 Nginx / Backend 301 兼容
 *
 * 三类详情共用同一个 BrowserPage shell(tabs 条 + 详情 pane);
 * 入口:tabs 非空时 TopNav 的 Globe 按钮 / 详情 deep link 都行。
 *
 * ⚠️ 五条路由必须【共用同一个 element 实例】(下面的常量):lazyRoute 每次调用
 * 产生独立的 React 身份,若各写各的,paper↔journal↔pdf 页签互切会整页
 * unmount/remount(BrowserTabsBar 等壳件重挂 + 闪一帧骨架);共用同一 element
 * → 同 key 同类型 → React 跨兄弟路由保留实例,只有详情 pane 按 pathname 重放
 * (BrowserPage 内部本来的行为)。2026-08-12 对抗审查确认项。
 */
const browserPage = lazyRoute(() => import('./pages/BrowserPage'), 'BrowserPage');

// 详情数据预取(2026-08-12 审计):只服务**冷进入**(SEO 直达/新标签/刷新)——
// 那是「lazy chunk → mount → fetch」三段串行,loader 里 fire-and-forget 地 prefetchQuery
// 让数据请求与 chunk 下载并行,不 await(loader 不阻塞渲染;prefetch 尊重 staleTime)。
// 站内导航一律跳过(isAppMounted):列表侧经 store 传实体、详情 hook disabled,
// prefetch 的请求没有消费方(对抗审查确认「同 key 去重」在该路径不成立)。
// 失败静默:组件侧的 useQuery 自会带着错误态重试/展示,loader 不重复处理。
function prefetchPaperLoader({ params }: LoaderFunctionArgs) {
  if (isAppMounted()) return null;
  const { source, paperId } = params;
  // source='local' 是用户上传的本地自由文件,不存在于上游 /public/papers,预取必 404。
  if (source && source !== 'local' && paperId) {
    void queryClient.prefetchQuery({
      queryKey: paperDetailQueryKey(source as UpstreamSource, paperId),
      queryFn: () => fetchPaperDetail(source as UpstreamSource, paperId),
      staleTime: PAPER_DETAIL_STALE_TIME,
    });
  }
  return null;
}

function prefetchJournalLoader({ params }: LoaderFunctionArgs) {
  if (isAppMounted()) return null;
  const id = Number(params.id);
  if (Number.isFinite(id) && id > 0) {
    void queryClient.prefetchQuery({
      queryKey: journalDetailQueryKey(id),
      queryFn: () => fetchJournalFull(id),
      staleTime: STALE_COLD,
    });
  }
  return null;
}

function prefetchAuthorLoader({ params }: LoaderFunctionArgs) {
  if (isAppMounted()) return null;
  const { authorId } = params;
  if (authorId) {
    void queryClient.prefetchQuery({
      queryKey: authorDetailQueryKey(authorId),
      queryFn: () => fetchAuthorDetail(authorId),
      staleTime: AUTHOR_DETAIL_STALE_TIME,
    });
  }
  return null;
}

export const browserRoutes: RouteObject[] = [
  {
    path: 'paper/:source/:paperId',
    element: browserPage,
    loader: prefetchPaperLoader,
  },
  {
    path: 'journal/:id',
    element: browserPage,
    loader: prefetchJournalLoader,
  },
  {
    // SEO canonical 形态 /journal/{id}/{slug}, slug 仅做 URL 关键词增益,
    // 组件读 id 渲染, 完全不用 slug —— slug 不匹配也由后端 SSR 层 301 校正。
    path: 'journal/:id/:slug',
    element: browserPage,
    loader: prefetchJournalLoader,
  },
  {
    path: 'author/:source/:authorId',
    element: browserPage,
    loader: prefetchAuthorLoader,
  },
  {
    // PDF 单独成 tab —— libPaperId = 文件夹 row.id(用户上传 PDF 绑在 row 上,
    // 与上游 source/paperId 解耦)。父级 BrowserPage 看到 /pdf/* 时
    // 渲染 PdfBrowserPane 替代 paper detail pane。
    path: 'pdf/:libPaperId',
    element: browserPage,
  },
];
