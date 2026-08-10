import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  authorTabKey,
  journalTabKey,
  paperTabKey,
  pdfTabKey,
  useBrowserTabs,
} from '@/stores/browser-tabs.store';
import { trackPaperClick } from '@/shared/api/hot-content';
import type { Author, Journal, Paper } from '@/shared/api/types';

/**
 * 浏览器 tab 入口 hook 家族 —— 把"打开 X 详情"统一抽象成工厂。
 *
 * 在工厂诞生前,paper/author/journal/pdf 各有一份 25 行的 hook,逻辑 79% 相同
 * (returnTo 计算、tab 复用查询、navigate),只差实体类型 / 路径模板。
 * 工厂把这些写在配置里,4 个文件 → 1 个文件。
 *
 * 公共流程:
 *   1) detail pane 内部跨 tab → 保留原 tab 的 returnTo(用户最初打开点)
 *      其他来源 → 当前 URL 当 returnTo,这样"返回"能回到原页面不丢上下文
 *   2) 通过 store action 把 tab 灌进 browser-tabs(已存在则智能合并)
 *   3) navigate 到 entity 对应的 URL
 *
 * 不主动拉数据 —— 调用方已经持有 entity(react-query 缓存),详情页缺字段时
 * 由对应 *DetailPane 内部 fallback fetch。
 */

// 当前路径在 paper/author/journal/pdf detail pane 里
const DETAIL_PANE_RE = /^\/(paper|author|journal|pdf)\//;

interface OpenInBrowserConfig<E> {
  /**
   * 实际写 store —— 直接调 `useBrowserTabs.getState().openXxxTab(...)`,
   * 不用 selector 订阅:store actions 引用稳定,subscribe 没好处反而会让 PDF 这种
   * adapter 包装(每次 selector 都返回新函数引用)触发无谓 re-render。
   */
  invokeAction: (entity: E, returnTo: string) => void;
  /** 计算 tab id,用来在 detail pane 内查 tab 自带的 returnTo */
  getTabKey: (entity: E) => string;
  /** 计算 navigate 路径;返 null 表示防呆放弃(如 author 没 id 时) */
  getPath: (entity: E) => string | null;
  /** 热门内容「点击量」上报(可选);只有 paper 有 hot_papers 计数,其余实体不传 */
  trackHotClick?: (entity: E) => void;
}

function createOpenInBrowserHook<E>(cfg: OpenInBrowserConfig<E>) {
  return function useOpenInBrowser() {
    const navigate = useNavigate();
    const location = useLocation();

    return useCallback(
      (entity: E) => {
        const path = cfg.getPath(entity);
        if (!path) return;
        const id = cfg.getTabKey(entity);
        const inDetailPane = DETAIL_PANE_RE.test(location.pathname);
        const returnTo = inDetailPane
          ? (useBrowserTabs.getState().tabs.find((t) => t.id === id)?.returnTo ??
            '/')
          : `${location.pathname}${location.search}`;
        cfg.invokeAction(entity, returnTo);
        cfg.trackHotClick?.(entity);
        navigate(path);
      },
      [navigate, location.pathname, location.search]
    );
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 4 个特化导出 —— 名字、入参、行为完全等价于原来 4 个独立 hook 文件,
// 任何调用方无需变更 import(都通过 @/shared/hooks 的 barrel 引入)。
// ──────────────────────────────────────────────────────────────────────────────

/** 打开论文详情 tab。/paper/:source/:paperId */
export const useOpenPaperInBrowser = createOpenInBrowserHook<Paper>({
  invokeAction: (p, returnTo) =>
    useBrowserTabs.getState().openPaperTab(p, returnTo),
  getTabKey: (p) => paperTabKey(p.source ?? 'stc', p.paperId),
  getPath: (p) =>
    `/paper/${p.source ?? 'stc'}/${encodeURIComponent(p.paperId)}`,
  trackHotClick: trackPaperClick,
});

/** 打开学者详情 tab。/author/:source/:authorId。无 authorId 不开(防呆) */
export const useOpenAuthorInBrowser = createOpenInBrowserHook<Author>({
  invokeAction: (a, returnTo) =>
    useBrowserTabs.getState().openAuthorTab(a, returnTo),
  getTabKey: (a) => authorTabKey(a.source ?? 'stc', a.authorId),
  getPath: (a) =>
    a.authorId
      ? `/author/${a.source ?? 'stc'}/${encodeURIComponent(a.authorId)}`
      : null,
});

/** 打开期刊详情 tab。/journal/:id。期刊池跨源已统一,不带 source */
export const useOpenJournalInBrowser = createOpenInBrowserHook<Journal>({
  invokeAction: (j, returnTo) =>
    useBrowserTabs.getState().openJournalTab(j, returnTo),
  getTabKey: (j) => journalTabKey(j.id),
  getPath: (j) => `/journal/${j.id}`,
});

/**
 * 打开文件夹里某篇论文的用户上传 PDF。/pdf/:libPaperId。
 * entity 不是后端模型,是 {libPaperId, title} —— openPdfTab 也用三参签名
 * `(libPaperId, title, returnTo)`,需要在 invokeAction 里做 adapter。
 */
type PdfTabEntity = { libPaperId: number; title: string };
export const useOpenPdfInBrowser = createOpenInBrowserHook<PdfTabEntity>({
  invokeAction: (e, returnTo) =>
    useBrowserTabs
      .getState()
      .openPdfTab(e.libPaperId, e.title || '无标题', returnTo),
  getTabKey: (e) => pdfTabKey(e.libPaperId),
  getPath: (e) => `/pdf/${e.libPaperId}`,
});
