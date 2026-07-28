import { useCallback } from 'react';
import { useSearchRightPanelStore } from '@/stores/search-right-panel.store';
import {
  useOpenAuthorInBrowser,
  useOpenJournalInBrowser,
  useOpenPaperInBrowser,
} from './useOpenInBrowser';

function useEmbedOpen<T>(
  embedMode: boolean,
  openPanel: (entity: T) => void,
  openBrowser: (entity: T) => void,
) {
  return useCallback(
    (entity: T) => {
      if (embedMode) openPanel(entity);
      else openBrowser(entity);
    },
    [embedMode, openPanel, openBrowser],
  );
}

export function useOpenPaperDetail() {
  const embedMode = useSearchRightPanelStore((s) => s.embedMode);
  const openPanel = useSearchRightPanelStore((s) => s.openPaper);
  const openBrowser = useOpenPaperInBrowser();
  return useEmbedOpen(embedMode, openPanel, openBrowser);
}

export function useOpenJournalDetail() {
  const embedMode = useSearchRightPanelStore((s) => s.embedMode);
  const openPanel = useSearchRightPanelStore((s) => s.openJournal);
  const openBrowser = useOpenJournalInBrowser();
  return useEmbedOpen(embedMode, openPanel, openBrowser);
}

export function useOpenAuthorDetail() {
  const embedMode = useSearchRightPanelStore((s) => s.embedMode);
  const openPanel = useSearchRightPanelStore((s) => s.openAuthor);
  const openBrowser = useOpenAuthorInBrowser();
  return useEmbedOpen(embedMode, openPanel, openBrowser);
}

/** 搜索页右栏 —— 打开 PDF Chat 功能 tab(非 embed 模式无操作) */
export function useOpenPdfChat() {
  const embedMode = useSearchRightPanelStore((s) => s.embedMode);
  const setActiveFunction = useSearchRightPanelStore((s) => s.setActiveFunction);
  return useCallback(
    (opts?: { ensureStaged?: () => void }) => {
      if (!embedMode) return;
      opts?.ensureStaged?.();
      setActiveFunction('pdf-chat');
    },
    [embedMode, setActiveFunction],
  );
}

export function useIsPdfChatActive() {
  return useSearchRightPanelStore(
    (s) =>
      s.activePanel?.group === 'function' &&
      s.activePanel.kind === 'pdf-chat',
  );
}
