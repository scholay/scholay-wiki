import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  journalTabKey,
  useBrowserTabs,
} from '@/stores/browser-tabs.store';
import { exposeJournalDetail } from '@/shared/api/seo';
import type { Journal } from '@/shared/api/types';

/**
 * 任何位置(首页联想 / 期刊首页热门列表 / 期刊搜索结果)都用这个 hook 打开
 * 期刊详情。
 *
 *   const openJournal = useOpenJournalInBrowser();
 *   <button onClick={() => openJournal(journal)}>...</button>
 *
 * 与 useOpenPaperInBrowser 同款 returnTo / tab 复用模式,只是 URL = /journal/:id。
 */
export function useOpenJournalInBrowser() {
  const navigate = useNavigate();
  const location = useLocation();
  const openJournalTab = useBrowserTabs((s) => s.openJournalTab);

  return useCallback(
    (journal: Journal) => {
      const id = journalTabKey(journal.id);
      const inDetailPane = /^\/(paper|author|journal|pdf)\//.test(
        location.pathname
      );
      const returnTo = inDetailPane
        ? (useBrowserTabs.getState().tabs.find((t) => t.id === id)?.returnTo ??
          '/')
        : `${location.pathname}${location.search}`;

      openJournalTab(journal, returnTo);
      // SEO 兜底: 点击即记 tier=1, 即使后端 GetJournal 还没被触发 (crawler 不一定走 store)。
      // sendBeacon 异步, 不影响导航。
      exposeJournalDetail(journal);
      navigate(`/journal/${journal.id}`);
    },
    [navigate, location.pathname, location.search, openJournalTab]
  );
}
