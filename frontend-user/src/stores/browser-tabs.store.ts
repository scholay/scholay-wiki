import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Author, Journal, Paper } from '@/shared/api/types';

/**
 * 浏览器页签 store —— 浏览器 tabs 的心智模型。
 *
 * 支持四种 tab kind:**paper** + **journal** + **author** + **pdf**。
 * 数据来自调用方已持有的对象(react-query 缓存),开 tab 不发网络;
 * 详情 pane 只在数据缺字段时按需 fallback fetch。
 *
 * **持久化到 localStorage** —— 浏览器 tab 也是这种语义(刷新不丢、关浏览器才丢)。
 * 30 个 tab 上限保护,~150KB 占用可控。
 *
 * URL = 事实源(2026-05 改成 SEO 友好的 canonical,去掉 `/browser` 前缀):
 *   /paper/:source/:paperId      → paper tab(三源数据隔离)
 *   /journal/:id                 → journal tab(期刊池跨源已统一,不带 source)
 *   /author/:source/:authorId    → author tab(三源数据隔离)
 *   /pdf/:libPaperId             → pdf tab(用户上传的 PDF,以文件夹 row.id 为 key)
 * store 只是数据载体,BrowserTabsBar 由 react-router useMatch 决定 active。
 * 旧线上 `/paper/:legacySlug` 等 deep link 由后端 301 兼容,不在前端处理。
 */

/** 上限保护 —— 防止用户疯狂点开几百个 tab 撑爆内存 */
export const MAX_TABS = 30;

// ============================================================================
// 类型(discriminated union)
// ============================================================================

export interface PaperTab {
  kind: 'paper';
  /** `p:${source}:${paperId}` */
  id: string;
  paper: Paper;
  returnTo: string;
  openedAt: number;
}

export interface JournalTab {
  kind: 'journal';
  /** `j:${id}` */
  id: string;
  journal: Journal;
  returnTo: string;
  openedAt: number;
}

export interface AuthorTab {
  kind: 'author';
  /** `a:${source}:${authorId}` —— 三源数据严格隔离;同一作者跨源会变成两个 tab */
  id: string;
  author: Author;
  returnTo: string;
  openedAt: number;
}

/**
 * PDF tab —— 文件夹 row 的用户上传 PDF 单独成 tab,在浏览器视图内用 PdfViewer 渲染。
 * 与 paper tab 是平级 —— 用户可以同时打开"论文详情"和"PDF 预览"两个 tab,
 * 互不耦合;关掉一边不影响另一边。
 *
 * id 用 libPaperId(user_library_papers.id),因为 PDF 是绑在收藏 row 上的,
 * 不依赖上游 source/paperId(自由文件没有上游 paperId)。
 */
export interface PdfTab {
  kind: 'pdf';
  /** `pdf:${libPaperId}` */
  id: string;
  libPaperId: number;
  /** 文件夹行的标题快照 —— tab 名条显示,不依赖上游元数据 */
  title: string;
  returnTo: string;
  openedAt: number;
}

export type BrowserTab = PaperTab | JournalTab | AuthorTab | PdfTab;

export const paperTabKey = (source: string, paperId: string) =>
  `p:${source}:${paperId}`;

export const journalTabKey = (id: number) => `j:${id}`;

export const authorTabKey = (source: string, authorId: string) =>
  `a:${source}:${authorId}`;

export const pdfTabKey = (libPaperId: number) => `pdf:${libPaperId}`;

/** Tab → URL —— 统一这里,避免分散字符串拼接 */
export function browserTabUrl(tab: BrowserTab): string {
  if (tab.kind === 'paper') {
    const source = tab.paper.source ?? 'stc';
    return `/paper/${source}/${encodeURIComponent(tab.paper.paperId)}`;
  }
  if (tab.kind === 'journal') {
    return `/journal/${tab.journal.id}`;
  }
  if (tab.kind === 'pdf') {
    return `/pdf/${tab.libPaperId}`;
  }
  const aSource = tab.author.source ?? 'stc';
  return `/author/${aSource}/${encodeURIComponent(tab.author.authorId)}`;
}

// ============================================================================
// Store
// ============================================================================

interface BrowserTabsState {
  tabs: BrowserTab[];
  activeTabId: string | null;

  /** 开 paper tab —— 已有则智能合并(rich 不被 stub 覆盖) */
  openPaperTab: (paper: Paper, returnTo: string) => string;
  /** 开 journal tab —— 已有则更新数据 + returnTo */
  openJournalTab: (journal: Journal, returnTo: string) => string;
  /** 开 author tab —— 已有则更新数据 + returnTo */
  openAuthorTab: (author: Author, returnTo: string) => string;
  /** 开 pdf tab —— 文件夹 row 的用户上传 PDF,以 libPaperId 为唯一 key */
  openPdfTab: (libPaperId: number, title: string, returnTo: string) => string;
  /** 关掉某个 tab。如果是 active,自动切右邻居 / 左邻居 / null */
  closeTab: (id: string) => void;
  /** 关掉全部 */
  closeAll: () => void;
  /** 切换激活 tab(null = 无激活) */
  setActive: (id: string | null) => void;
  /** 仅用于路由同步:URL 变了告诉 store 谁是 active */
  syncActiveFromUrl: (id: string | null) => void;
  /**
   * 仅更新某条 tab 的 returnTo —— 从顶栏 Globe 按钮进入浏览器时调用,
   * 让"返回"按钮回到用户**当前**位置,而不是当初创建该 tab 时记下的旧来源页。
   */
  refreshReturnTo: (id: string, returnTo: string) => void;
}

/** 写新 tab 前清出位置(超 MAX_TABS 时挤掉最早的非 active) */
function evictIfFull(tabs: BrowserTab[], activeId: string | null): BrowserTab[] {
  if (tabs.length < MAX_TABS) return tabs;
  const oldest = [...tabs]
    .filter((t) => t.id !== activeId)
    .sort((a, b) => a.openedAt - b.openedAt)[0];
  if (!oldest) return tabs;
  return tabs.filter((t) => t.id !== oldest.id);
}

/**
 * 通用 upsert 工具 —— 三种 open*Tab 共享同款 "已存在则智能合并 / 否则 evictIfFull
 * 后追加" 模式,抽出来避免三处 if-else 重复。
 *
 * - id:tab key(来自 paperTabKey / journalTabKey / authorTabKey)
 * - build:构造新 tab(走入"不存在"分支时调用)
 * - merge:incoming 与 existing 同 kind 时,产出新 tab(实现 stub-rich 合并语义)
 */
function upsertTab(
  current: { tabs: BrowserTab[]; activeTabId: string | null },
  id: string,
  build: () => BrowserTab,
  merge: (existing: BrowserTab) => BrowserTab
): { tabs: BrowserTab[]; activeTabId: string } {
  const exists = current.tabs.find((t) => t.id === id);
  if (exists) {
    return {
      tabs: current.tabs.map((t) => (t.id === id ? merge(t) : t)),
      activeTabId: id,
    };
  }
  const cleaned = evictIfFull(current.tabs, current.activeTabId);
  return { tabs: [...cleaned, build()], activeTabId: id };
}

export const useBrowserTabs = create<BrowserTabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      openPaperTab: (paper, returnTo) => {
        const id = paperTabKey(paper.source ?? 'stc', paper.paperId);
        set(
          upsertTab(
            get(),
            id,
            // 新建:整 paper 直接放进去
            () => ({
              kind: 'paper',
              id,
              paper,
              returnTo,
              openedAt: Date.now(),
            }),
            // 智能合并:incoming rich(有 abstract)且 existing 是 stub 才覆盖,
            // 避免 stub 降级 rich;否则保留 existing
            (existing) => {
              if (existing.kind !== 'paper') return existing;
              const incomingRicher = !!paper.abstract && !existing.paper.abstract;
              return {
                ...existing,
                paper: incomingRicher ? paper : existing.paper,
                returnTo,
                openedAt: Date.now(),
              };
            }
          )
        );
        return id;
      },

      openJournalTab: (journal, returnTo) => {
        const id = journalTabKey(journal.id);
        set(
          upsertTab(
            get(),
            id,
            () => ({
              kind: 'journal',
              id,
              journal,
              returnTo,
              openedAt: Date.now(),
            }),
            // journal 数据完全替换 —— stats 等会随上游更新,以最新为准
            (existing) =>
              existing.kind !== 'journal'
                ? existing
                : { ...existing, journal, returnTo, openedAt: Date.now() }
          )
        );
        return id;
      },

      openPdfTab: (libPaperId, title, returnTo) => {
        const id = pdfTabKey(libPaperId);
        set(
          upsertTab(
            get(),
            id,
            () => ({
              kind: 'pdf',
              id,
              libPaperId,
              title,
              returnTo,
              openedAt: Date.now(),
            }),
            // 标题以最新为准(用户可能改了 og_title 等)
            (existing) =>
              existing.kind !== 'pdf'
                ? existing
                : { ...existing, title, returnTo, openedAt: Date.now() }
          )
        );
        return id;
      },

      openAuthorTab: (author, returnTo) => {
        const id = authorTabKey(author.source ?? 'stc', author.authorId);
        set(
          upsertTab(
            get(),
            id,
            () => ({
              kind: 'author',
              id,
              author,
              returnTo,
              openedAt: Date.now(),
            }),
            // 合并:incoming 富数据(有 paperCount/hIndex)才覆盖,避免 stub 降级
            (existing) => {
              if (existing.kind !== 'author') return existing;
              const incomingRicher =
                (author.paperCount ?? 0) > 0 || (author.hIndex ?? 0) > 0;
              return {
                ...existing,
                author: incomingRicher ? author : existing.author,
                returnTo,
                openedAt: Date.now(),
              };
            }
          )
        );
        return id;
      },

      closeTab: (id) => {
        const { tabs, activeTabId } = get();
        const idx = tabs.findIndex((t) => t.id === id);
        if (idx < 0) return;

        const nextTabs = tabs.filter((t) => t.id !== id);
        let nextActive = activeTabId;
        if (activeTabId === id) {
          nextActive = nextTabs[idx]?.id ?? nextTabs[idx - 1]?.id ?? null;
        }
        set({ tabs: nextTabs, activeTabId: nextActive });
      },

      closeAll: () => set({ tabs: [], activeTabId: null }),

      setActive: (id) => set({ activeTabId: id }),

      syncActiveFromUrl: (id) => {
        if (get().activeTabId !== id) set({ activeTabId: id });
      },

      refreshReturnTo: (id, returnTo) => {
        const tabs = get().tabs;
        const idx = tabs.findIndex((t) => t.id === id);
        if (idx < 0) return;
        if (tabs[idx].returnTo === returnTo) return; // no-op
        const next = tabs.slice();
        // 替换该 tab 的 returnTo,其余字段一律保留(包括 paper/journal/...
        // 数据快照和 openedAt;后者用于 evict 顺序,**不刷新**)
        next[idx] = { ...tabs[idx], returnTo } as BrowserTab;
        set({ tabs: next });
      },
    }),
    {
      // 新 key —— 与旧 library-tabs 隔离(此版本尚未上线,不用迁移)
      name: 'scholay.browser-tabs-v1',
      partialize: (s) => ({ tabs: s.tabs, activeTabId: s.activeTabId }),
    }
  )
);
