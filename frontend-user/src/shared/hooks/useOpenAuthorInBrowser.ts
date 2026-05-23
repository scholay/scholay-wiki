import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  authorTabKey,
  useBrowserTabs,
} from '@/stores/browser-tabs.store';
import { exposeAuthorDetail } from '@/shared/api/seo';
import type { Author } from '@/shared/api/types';

/**
 * 任何位置(首页联想 / 论文卡内可点作者名 / 学者详情交叉跳)都用这个 hook 打开
 * 学者详情。
 *
 *   const openAuthor = useOpenAuthorInBrowser();
 *   <button onClick={() => openAuthor({ authorId, name })}>...</button>
 *
 * 入参允许 stub(只有 authorId + name);AuthorDetailPane 会按需 fallback fetch
 * 补足。与 useOpenPaperInBrowser / useOpenJournalInBrowser 同款 returnTo /
 * tab 复用模式,只是 URL = /author/:source/:authorId。
 */
export function useOpenAuthorInBrowser() {
  const navigate = useNavigate();
  const location = useLocation();
  const openAuthorTab = useBrowserTabs((s) => s.openAuthorTab);

  return useCallback(
    (author: Author) => {
      if (!author.authorId) return; // 防呆:没 id 没法路由
      const source = author.source ?? 'stc';
      const id = authorTabKey(source, author.authorId);
      const inDetailPane = /^\/(paper|author|journal|pdf)\//.test(
        location.pathname
      );
      const returnTo = inDetailPane
        ? (useBrowserTabs.getState().tabs.find((t) => t.id === id)?.returnTo ??
          '/')
        : `${location.pathname}${location.search}`;

      openAuthorTab(author, returnTo);
      // SEO 兜底: 点击即记 tier=1 author seed (后端 minicod.GetAuthor 也兜底)
      exposeAuthorDetail(author);
      navigate(`/author/${source}/${encodeURIComponent(author.authorId)}`);
    },
    [navigate, location.pathname, location.search, openAuthorTab]
  );
}
