import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  paperTabKey,
  useBrowserTabs,
} from '@/stores/browser-tabs.store';
import { exposePaperDetail } from '@/shared/api/seo';
import type { Paper } from '@/shared/api/types';

/**
 * 任何位置(首页 / 搜索结果 / 文献集列表)都用这个 hook 打开论文详情。
 *
 *   const openPaper = useOpenPaperInBrowser();
 *   <button onClick={() => openPaper(paper)}>...</button>
 *
 * 流程:
 *   1) 把 paper 灌进 useBrowserTabs(已存在则智能合并 + 刷新 returnTo)
 *   2) 把当前 location(pathname+search)记下做 returnTo
 *      —— 若已经在 /browser/* 里(tab 内部跳 tab),保留原 returnTo
 *   3) navigate 到 `/browser/p/:source/:paperId`
 *
 * 不重新拉论文数据 —— 调用方已有 Paper 对象(来自 react-query 缓存);
 * 详情页需要额外字段(abstract / citations)时由 PaperDetailPane 自己懒加载。
 */
export function useOpenPaperInBrowser() {
  const navigate = useNavigate();
  const location = useLocation();
  const openPaperTab = useBrowserTabs((s) => s.openPaperTab);

  return useCallback(
    (paper: Paper) => {
      const source = paper.source ?? 'stc';
      const id = paperTabKey(source, paper.paperId);
      // 区分两种"在 browser 内"的情况:
      //   - **detail pane** (`/browser/(p|j|a)/...`):是从 tab 内跨 tab 跳转,
      //     保留原 tab 的 returnTo(用户最初是从哪儿打开的)
      //   - **其他页面**:本次行为正是"从外部进详情",必须把当前 URL 作为 returnTo,
      //     这样点"返回"能回到原页面,不会丢上下文
      const inDetailPane = /^\/(paper|author|journal|pdf)\//.test(
        location.pathname
      );
      const returnTo = inDetailPane
        ? (useBrowserTabs.getState().tabs.find((t) => t.id === id)?.returnTo ??
          '/')
        : `${location.pathname}${location.search}`;

      openPaperTab(paper, returnTo);
      // SEO 兜底: 点击即记 tier=1 paper seed, 直链 / 爬虫都会被后端 GetPaper 钩子
      // 二次兜底; 这里是事件级补点 (search 卡 / library 卡 / 推荐流都覆盖)。
      exposePaperDetail(paper);
      navigate(`/paper/${source}/${encodeURIComponent(paper.paperId)}`);
    },
    [navigate, location.pathname, location.search, openPaperTab]
  );
}
