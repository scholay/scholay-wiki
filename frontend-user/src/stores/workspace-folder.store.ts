import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 工作区左栏 tab:暂存区 | 文献集文件夹 id */
export type WorkspaceFolderTab = 'staging' | number;

interface WorkspaceFolderUiState {
  activeTab: WorkspaceFolderTab;
  setActiveTab: (tab: WorkspaceFolderTab) => void;
  /**
   * 手风琴:最多一个展开的文件夹;null = 全部收起。
   * 切换 activeTab / 暂存论文时会同步展开对应文件夹。
   */
  openFolderKey: WorkspaceFolderTab | null;
  /** 展开指定文件夹(互斥);传同一 key 且已展开则收起 */
  toggleFolder: (key: WorkspaceFolderTab) => void;
  /** 强制展开(不切换收起),用于暂存飞入前打开暂存区 */
  expandFolder: (key: WorkspaceFolderTab) => void;
  selectedPaperId: string | null;
  setSelectedPaperId: (id: string | null) => void;
  /** PDF Chat / 文献图谱下勾选的文献;矩阵态不展示勾选 */
  checkedPaperIds: string[];
  checkedTouched: boolean;
  togglePaperChecked: (id: string) => void;
  setCheckedPaperIds: (ids: string[]) => void;
  /** 同步暂存列表:去掉已移除的,新加入的默认勾选 */
  syncCheckedPapers: (ids: string[]) => void;
  folderIcons: Record<string, string>;
  setFolderIcon: (key: string, iconId: string) => void;
  folderColors: Record<string, string>;
  setFolderColor: (key: string, colorId: string) => void;
  /** Manual matrix order for library folders (`folder:<id>`). Staging uses area papers. */
  paperOrderByKey: Record<string, string[]>;
  setPaperOrder: (key: string, ids: string[]) => void;
  /**
   * Viewing a library folder while new papers landed in 当前对话.
   * Not persisted — only for the in-page “返回当前会话” tip.
   */
  hasUnseenStaging: boolean;
  markUnseenStaging: () => void;
}

export const useWorkspaceFolderUi = create<WorkspaceFolderUiState>()(
  persist(
    (set, get) => ({
      activeTab: 'staging',
      openFolderKey: 'staging',
      hasUnseenStaging: false,
      markUnseenStaging: () => set({ hasUnseenStaging: true }),
      setActiveTab: (tab) =>
        set({
          activeTab: tab,
          openFolderKey: tab,
          hasUnseenStaging: tab === 'staging' ? false : get().hasUnseenStaging,
        }),
      toggleFolder: (key) => {
        const cur = get().openFolderKey;
        if (cur === key) {
          set({ openFolderKey: null });
          return;
        }
        set({
          openFolderKey: key,
          activeTab: key,
          hasUnseenStaging: key === 'staging' ? false : get().hasUnseenStaging,
        });
      },
      expandFolder: (key) =>
        set({
          openFolderKey: key,
          activeTab: key,
          hasUnseenStaging: key === 'staging' ? false : get().hasUnseenStaging,
        }),
      selectedPaperId: null,
      setSelectedPaperId: (id) => set({ selectedPaperId: id }),
      checkedPaperIds: [],
      checkedTouched: false,
      togglePaperChecked: (id) =>
        set((s) => ({
          checkedTouched: true,
          checkedPaperIds: s.checkedPaperIds.includes(id)
            ? s.checkedPaperIds.filter((x) => x !== id)
            : [...s.checkedPaperIds, id],
        })),
      setCheckedPaperIds: (ids) =>
        set({ checkedTouched: true, checkedPaperIds: ids }),
      syncCheckedPapers: (ids) =>
        set((s) => {
          if (!s.checkedTouched) {
            if (
              ids.length === s.checkedPaperIds.length &&
              ids.every((id, i) => id === s.checkedPaperIds[i])
            ) {
              return s;
            }
            return { checkedPaperIds: ids };
          }
          const incoming = new Set(ids);
          const kept = s.checkedPaperIds.filter((id) => incoming.has(id));
          const keptSet = new Set(kept);
          const added = ids.filter((id) => !keptSet.has(id));
          const next = [...kept, ...added];
          if (
            next.length === s.checkedPaperIds.length &&
            next.every((id, i) => id === s.checkedPaperIds[i])
          ) {
            return s;
          }
          return { checkedPaperIds: next };
        }),
      folderIcons: {},
      setFolderIcon: (key, iconId) =>
        set((s) => ({
          folderIcons: { ...s.folderIcons, [key]: iconId },
        })),
      folderColors: {},
      setFolderColor: (key, colorId) =>
        set((s) => ({
          folderColors: { ...s.folderColors, [key]: colorId },
        })),
      paperOrderByKey: {},
      setPaperOrder: (key, ids) =>
        set((s) => ({
          paperOrderByKey: { ...s.paperOrderByKey, [key]: ids },
        })),
    }),
    {
      name: 'scholay.workspace-folder-ui',
      // openFolderKey 不持久化:每次进页默认展开当前 activeTab
      partialize: (s) => ({
        activeTab: s.activeTab,
        selectedPaperId: s.selectedPaperId,
        folderIcons: s.folderIcons,
        folderColors: s.folderColors,
        paperOrderByKey: s.paperOrderByKey,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<WorkspaceFolderUiState>;
        const activeTab = p.activeTab ?? current.activeTab;
        return {
          ...current,
          ...p,
          activeTab,
          openFolderKey: activeTab,
        };
      },
    },
  ),
);

export const STAGING_FOLDER_LABEL = '当前对话';

export function folderPaperOrderKey(folderId: number): string {
  return `folder:${folderId}`;
}

export function applyPaperOrder<T extends { paperId: string }>(
  papers: T[],
  order?: string[],
): T[] {
  if (!order?.length) return papers;
  const byId = new Map(papers.map((p) => [p.paperId, p]));
  const next: T[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const paper = byId.get(id);
    if (!paper || seen.has(id)) continue;
    next.push(paper);
    seen.add(id);
  }
  for (const paper of papers) {
    if (!seen.has(paper.paperId)) next.push(paper);
  }
  return next;
}
