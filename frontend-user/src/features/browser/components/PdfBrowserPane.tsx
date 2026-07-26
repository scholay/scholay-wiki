import { useMemo } from 'react';
import { useMatch } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { PdfViewer, type PdfSource } from '@/shared/components/PdfViewer';
import { useAuthStore } from '@/stores/auth.store';
import { pdfTabKey, useBrowserTabs } from '@/stores/browser-tabs.store';

/**
 * 浏览器 · PDF 预览页 —— /browser/pdf/:libPaperId
 *
 * 用户在文献集任意行点"查看 PDF"会:
 *   1) useOpenPdfInBrowser 把 (libPaperId, title) 灌进 browser-tabs store
 *   2) navigate('/browser/pdf/:libPaperId')
 *   3) 本 pane 从 URL 拿 id → 找 store 里同 key 的 tab 读 title(纯展示用)
 *   4) 把 backend 的鉴权 stream URL 包装成 PdfSource 给 PdfViewer 渲染
 *
 * 没用 react-query —— PDF 不走 JSON,直接给 pdfjs 拿 URL+headers 自己 fetch,
 * 多页 / 缓存 / progressive 都由 pdfjs 内部处理。
 *
 * 错误兜底:libPaperId 不合法 / store 里没有匹配的 pdf tab(直链进来 / 刷新后
 * store 失效)→ 不阻断渲染,PdfViewer 自己会处理 401 / 404 报错。
 */
export function PdfBrowserPane() {
  const match = useMatch('/pdf/:libPaperId');
  const rawId = match?.params.libPaperId ?? '';
  const libPaperId = Number(rawId);
  const valid = Number.isFinite(libPaperId) && libPaperId > 0;

  const token = useAuthStore((s) => s.token);

  // 找 tab 拿 title(BrowserTabsBar 已经在用 store 的标题渲染 pill,这里
  // 只是 pane 内的元信息条想用)
  const tab = useBrowserTabs((s) =>
    valid ? s.tabs.find((t) => t.id === pdfTabKey(libPaperId)) : undefined
  );
  const title = tab?.kind === 'pdf' ? tab.title : '';

  const pdfSource = useMemo<PdfSource | null>(() => {
    if (!valid) return null;
    return {
      url: `/api/v1/user/library/papers/${libPaperId}/pdf`,
      httpHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
      withCredentials: false,
    };
  }, [libPaperId, valid, token]);

  if (!valid || !pdfSource) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={AlertCircle}
          title="无效的 PDF 链接"
          description="该地址不存在对应的 PDF,可能链接已失效。"
        />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          icon={AlertCircle}
          title="需要登录才能查看 PDF"
          description="文献集中的 PDF 仅本人可见,请先登录后再访问。"
        />
      </div>
    );
  }

  return (
    <article className="h-full flex flex-col bg-background min-h-0">
      {/* 标题条 —— 只是元信息,操作交给 PdfViewer 内部工具栏(缩放/翻页/模式) */}
      {title && (
        <header className="shrink-0 px-6 py-2.5 border-b border-border-soft bg-background">
          <h1
            className="text-12 font-medium text-foreground line-clamp-1"
            title={title}
          >
            {title}
          </h1>
        </header>
      )}
      <PdfViewer file={pdfSource} className="flex-1 min-h-0" />
    </article>
  );
}

export default PdfBrowserPane;
