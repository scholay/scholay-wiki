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
  folderIcons: Record<string, string>;
  setFolderIcon: (key: string, iconId: string) => void;
  folderColors: Record<string, string>;
  setFolderColor: (key: string, colorId: string) => void;
}

export const useWorkspaceFolderUi = create<WorkspaceFolderUiState>()(
  persist(
    (set, get) => ({
      activeTab: 'staging',
      openFolderKey: 'staging',
      setActiveTab: (tab) =>
        set({ activeTab: tab, openFolderKey: tab }),
      toggleFolder: (key) => {
        const cur = get().openFolderKey;
        if (cur === key) {
          set({ openFolderKey: null });
          return;
        }
        set({ openFolderKey: key, activeTab: key });
      },
      expandFolder: (key) =>
        set({ openFolderKey: key, activeTab: key }),
      selectedPaperId: null,
      setSelectedPaperId: (id) => set({ selectedPaperId: id }),
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
    }),
    {
      name: 'scholay.workspace-folder-ui',
      // openFolderKey 不持久化:每次进页默认展开当前 activeTab
      partialize: (s) => ({
        activeTab: s.activeTab,
        selectedPaperId: s.selectedPaperId,
        folderIcons: s.folderIcons,
        folderColors: s.folderColors,
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

export const STAGING_FOLDER_LABEL = '暂存区';
