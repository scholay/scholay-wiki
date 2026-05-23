import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { pdfTabKey, useBrowserTabs } from '@/stores/browser-tabs.store';

/**
 * 打开文献集 row 的用户上传 PDF —— 复用 browser-tabs 心智:开一个 pdf tab + navigate。
 *
 *   const openPdf = useOpenPdfInBrowser();
 *   <button onClick={() => openPdf({ libPaperId: row.id, title: row.title })}>
 *     查看 PDF
 *   </button>
 *
 * 与 useOpenPaperInBrowser 同款 returnTo 策略:
 *   - 已经在 detail pane 内(跨 tab 跳)→ 保留原 tab 的 returnTo
 *   - 外部触发 → 当前 URL 作为 returnTo,返回时回到原页
 *
 * 不预拉 PDF 数据 —— PdfBrowserPane 自己根据 libPaperId 把 backend URL 喂给
 * PdfViewer,内部 pdfjs 处理 fetch + 分页 + 渐进加载。
 */
export function useOpenPdfInBrowser() {
  const navigate = useNavigate();
  const location = useLocation();
  const openPdfTab = useBrowserTabs((s) => s.openPdfTab);

  return useCallback(
    ({ libPaperId, title }: { libPaperId: number; title: string }) => {
      const id = pdfTabKey(libPaperId);
      const inDetailPane = /^\/(paper|author|journal|pdf)\//.test(
        location.pathname
      );
      const returnTo = inDetailPane
        ? (useBrowserTabs.getState().tabs.find((t) => t.id === id)?.returnTo ??
          '/')
        : `${location.pathname}${location.search}`;

      openPdfTab(libPaperId, title || '无标题', returnTo);
      navigate(`/pdf/${libPaperId}`);
    },
    [navigate, location.pathname, location.search, openPdfTab]
  );
}
