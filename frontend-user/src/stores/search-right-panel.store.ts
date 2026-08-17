import { create } from 'zustand';
import type { Author, Journal, Paper } from '@/shared/api/types';

/** 基于工作区暂存文献的功能视图 —— 与「工作区数据」解耦,仅决定展示形态 */
export type WorkspaceFunctionKind = 'pdf-chat' | 'citation-graph' | 'matrix';

export type InfoTabKind = 'paper' | 'journal' | 'author' | 'artifact' | 'pdf';

/** 产物页签载荷(结构对齐 claw ClawArtifact + 预览端点前缀;store 不依赖 feature)。 */
export type ArtifactBasePathTab = '/user/claw' | '/user/boltslides' | '/user/sci_draw';

export type ArtifactTabPayload = {
  id?: number;
  path: string;
  name: string;
  kind?: 'file' | 'dir';
  mime?: string;
  size?: number;
  title?: string;
  description?: string;
  basePath: ArtifactBasePathTab;
};

/** 文献集上传 PDF 预览页签(与全页 /pdf/:id 同源)。 */
export type PdfTabPayload = {
  libPaperId: number;
  title: string;
};

export type InfoTab =
  | { id: string; kind: 'paper'; title: string; paper: Paper }
  | { id: string; kind: 'journal'; title: string; journal: Journal }
  | { id: string; kind: 'author'; title: string; author: Author }
  | { id: string; kind: 'artifact'; title: string; artifact: ArtifactTabPayload }
  | { id: string; kind: 'pdf'; title: string; pdf: PdfTabPayload };

/** 右栏当前视图(功能 / 详情页 / 空壳);null = 拓展区关闭 */
export type ActivePanel =
  | { group: 'function'; kind: WorkspaceFunctionKind }
  | { group: 'info'; tabId: string }
  /** 拓展区空壳:检索页取消功能选中、或助手页未打开详情时保持栏位 */
  | { group: 'shell' };

/** FeatureHub / TabStrip 入口形态 */
export type RightPanelVariant = 'search' | 'assistant';

export const WORKSPACE_FUNCTION_ORDER: WorkspaceFunctionKind[] = [
  'matrix',
  'citation-graph',
  'pdf-chat',
];

export const WORKSPACE_FUNCTION_LABEL: Record<WorkspaceFunctionKind, string> = {
  'pdf-chat': 'PDF Chat',
  'citation-graph': '文献图谱',
  matrix: '矩阵分析',
};

export function functionTabId(kind: WorkspaceFunctionKind): string {
  return `fn:${kind}`;
}

const MAX_INFO_TABS = 12;

function paperTabId(paper: Paper): string {
  return `paper:${paper.source ?? 'stc'}:${paper.paperId}`;
}

function journalTabId(journal: Journal): string {
  return `journal:${journal.id}`;
}

function authorTabId(author: Author): string {
  return `author:${author.source ?? 'stc'}:${author.authorId}`;
}

function artifactTabId(artifact: ArtifactTabPayload): string {
  if (artifact.id) return `artifact:${artifact.basePath}:${artifact.id}`;
  return `artifact:${artifact.basePath}:${artifact.path}`;
}

function pdfInfoTabId(libPaperId: number): string {
  return `pdf:${libPaperId}`;
}

function trimTitle(text: string, max = 28): string {
  const t = text.trim();
  if (t.length <= max) return t || '未命名';
  return `${t.slice(0, max - 1)}…`;
}

function focusInfoTab(tabs: InfoTab[], tabId: string): InfoTab[] {
  const idx = tabs.findIndex((t) => t.id === tabId);
  if (idx <= 0) return tabs;
  const next = [...tabs];
  const [tab] = next.splice(idx, 1);
  next.push(tab);
  return next;
}

function upsertInfoTab(tabs: InfoTab[], tab: InfoTab): InfoTab[] {
  const without = tabs.filter((t) => t.id !== tab.id);
  let next = [...without, tab];
  if (next.length > MAX_INFO_TABS) {
    next = next.slice(next.length - MAX_INFO_TABS);
  }
  return next;
}

interface SearchRightPanelState {
  embedMode: boolean;
  functionTabs: WorkspaceFunctionKind[];
  infoTabs: InfoTab[];
  /** 右栏视图;null 时展示功能入口卡片 */
  activePanel: ActivePanel | null;
  /** 整个右侧拓展栏是否展开(false = 完全收起,仅保留 SearcherColumn 侧重开入口) */
  panelOpen: boolean;
  /** 左侧文件区(文献卡列)是否展开,与拓展区互不联动 */
  fileAreaOpen: boolean;
  setEmbedMode: (enabled: boolean) => void;
  openPaper: (paper: Paper) => void;
  openJournal: (journal: Journal) => void;
  openAuthor: (author: Author) => void;
  /** 打开产物预览页签(与论文详情同级的浏览器式 tab)。 */
  openArtifact: (artifact: ArtifactTabPayload) => void;
  /** 打开文献集 PDF 预览页签。 */
  openPdf: (pdf: PdfTabPayload) => void;
  openFunctionTab: (kind: WorkspaceFunctionKind) => void;
  closeFunctionTab: (kind: WorkspaceFunctionKind) => void;
  toggleFunctionTab: (kind: WorkspaceFunctionKind) => void;
  setActiveFunction: (kind: WorkspaceFunctionKind) => void;
  setActiveInfoTab: (tabId: string) => void;
  closeInfoTab: (tabId: string) => void;
  /** 收起整个右侧拓展栏(保留 tabs / activePanel,重开时恢复) */
  closePanel: () => void;
  /** 展开右侧拓展栏 */
  openPanel: () => void;
  /** 回到 FeatureHub 空态(栏仍展开,只清当前功能/详情) */
  dismissToHub: () => void;
  /** 打开空拓展壳(助手页「扩展区」入口;无工作区功能 tab) */
  openShell: () => void;
  setFileAreaOpen: (open: boolean) => void;
  openFileArea: () => void;
  closeFileArea: () => void;
  reset: () => void;
  isActivePaper: (paperId: string) => boolean;
}

export const useSearchRightPanelStore = create<SearchRightPanelState>(
  (set, get) => ({
    embedMode: false,
    functionTabs: [],
    infoTabs: [],
    activePanel: null,
    panelOpen: false,
    fileAreaOpen: false,
    setEmbedMode: (enabled) =>
      set({
        embedMode: enabled,
        functionTabs: enabled ? get().functionTabs : [],
        infoTabs: enabled ? get().infoTabs : [],
        activePanel: enabled ? get().activePanel : null,
      }),
    openPaper: (paper) => {
      const id = paperTabId(paper);
      const tab: InfoTab = {
        id,
        kind: 'paper',
        title: trimTitle(paper.title ?? '无标题'),
        paper,
      };
      set((state) => ({
        panelOpen: true,
        infoTabs: focusInfoTab(upsertInfoTab(state.infoTabs, tab), id),
        activePanel: { group: 'info', tabId: id },
      }));
    },
    openJournal: (journal) => {
      const id = journalTabId(journal);
      const tab: InfoTab = {
        id,
        kind: 'journal',
        title: trimTitle(journal.canonical_name),
        journal,
      };
      set((state) => ({
        panelOpen: true,
        infoTabs: focusInfoTab(upsertInfoTab(state.infoTabs, tab), id),
        activePanel: { group: 'info', tabId: id },
      }));
    },
    openAuthor: (author) => {
      const id = authorTabId(author);
      const tab: InfoTab = {
        id,
        kind: 'author',
        title: trimTitle(author.name ?? '未知作者'),
        author,
      };
      set((state) => ({
        panelOpen: true,
        infoTabs: focusInfoTab(upsertInfoTab(state.infoTabs, tab), id),
        activePanel: { group: 'info', tabId: id },
      }));
    },
    openArtifact: (artifact) => {
      const id = artifactTabId(artifact);
      const tab: InfoTab = {
        id,
        kind: 'artifact',
        title: trimTitle(artifact.title || artifact.name || '未命名文件'),
        artifact,
      };
      set((state) => ({
        panelOpen: true,
        infoTabs: focusInfoTab(upsertInfoTab(state.infoTabs, tab), id),
        activePanel: { group: 'info', tabId: id },
      }));
    },
    openPdf: (pdf) => {
      const id = pdfInfoTabId(pdf.libPaperId);
      const tab: InfoTab = {
        id,
        kind: 'pdf',
        title: trimTitle(pdf.title || 'PDF'),
        pdf,
      };
      set((state) => ({
        panelOpen: true,
        infoTabs: focusInfoTab(upsertInfoTab(state.infoTabs, tab), id),
        activePanel: { group: 'info', tabId: id },
      }));
    },
    openFunctionTab: (kind) => {
      set({
        panelOpen: true,
        fileAreaOpen: true,
        functionTabs: [kind],
        activePanel: { group: 'function', kind },
      });
    },
    closeFunctionTab: (kind) => {
      set((state) => {
        const functionTabs = state.functionTabs.filter((t) => t !== kind);
        let activePanel = state.activePanel;
        if (
          activePanel?.group === 'function' &&
          activePanel.kind === kind
        ) {
          activePanel = functionTabs.length
            ? { group: 'function', kind: functionTabs.at(-1)! }
            : state.infoTabs.length
              ? {
                  group: 'info',
                  tabId: state.infoTabs.at(-1)!.id,
                }
              : { group: 'shell' };
        }
        return { functionTabs, activePanel };
      });
    },
    setActiveFunction: (kind) =>
      set({
        panelOpen: true,
        fileAreaOpen: true,
        functionTabs: [kind],
        activePanel: { group: 'function', kind },
      }),
    toggleFunctionTab: (kind) => {
      const { functionTabs, closeFunctionTab, openFunctionTab } = get();
      if (functionTabs.includes(kind)) closeFunctionTab(kind);
      else openFunctionTab(kind);
    },
    setActiveInfoTab: (tabId) => {
      set((state) => {
        if (!state.infoTabs.some((t) => t.id === tabId)) return state;
        return {
          panelOpen: true,
          activePanel: { group: 'info', tabId },
          infoTabs: focusInfoTab(state.infoTabs, tabId),
        };
      });
    },
    closeInfoTab: (tabId) => {
      set((state) => {
        const infoTabs = state.infoTabs.filter((t) => t.id !== tabId);
        let activePanel = state.activePanel;
        if (activePanel?.group === 'info' && activePanel.tabId === tabId) {
          activePanel = infoTabs.length
            ? { group: 'info', tabId: infoTabs.at(-1)!.id }
            : state.functionTabs.length
              ? {
                  group: 'function',
                  kind: state.functionTabs.at(-1)!,
                }
              : null;
        }
        return {
          infoTabs,
          activePanel,
          ...(activePanel?.group === 'function' ? { fileAreaOpen: true } : {}),
        };
      });
    },
    closePanel: () => set({ panelOpen: false }),
    openPanel: () => set({ panelOpen: true }),
    dismissToHub: () =>
      set({ panelOpen: true, activePanel: null, functionTabs: [] }),
    openShell: () =>
      set({
        panelOpen: true,
        activePanel: { group: 'shell' },
      }),
    setFileAreaOpen: (open) => {
      if (open) {
        set({ fileAreaOpen: true });
        return;
      }
      get().closeFileArea();
    },
    openFileArea: () => set({ fileAreaOpen: true }),
    closeFileArea: () =>
      set((s) =>
        s.activePanel?.group === 'function'
          ? { fileAreaOpen: false, activePanel: null, functionTabs: [] }
          : { fileAreaOpen: false },
      ),
    reset: () =>
      set({
        functionTabs: [],
        infoTabs: [],
        activePanel: null,
        panelOpen: false,
        fileAreaOpen: false,
      }),
    isActivePaper: (paperId) => {
      const { activePanel, infoTabs } = get();
      if (activePanel?.group !== 'info') return false;
      const active = infoTabs.find((t) => t.id === activePanel.tabId);
      return active?.kind === 'paper' && active.paper.paperId === paperId;
    },
  }),
);
