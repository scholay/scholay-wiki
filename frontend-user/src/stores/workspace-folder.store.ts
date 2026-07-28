import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 工作区左栏 tab:暂存区 | 文献集文件夹 id */
export type WorkspaceFolderTab = 'staging' | number;

interface WorkspaceFolderUiState {
  activeTab: WorkspaceFolderTab;
  setActiveTab: (tab: WorkspaceFolderTab) => void;
  /** 工作区当前选中文献,供 PDF Chat 等右栏功能预览 */
  selectedPaperId: string | null;
  setSelectedPaperId: (id: string | null) => void;
}

export const useWorkspaceFolderUi = create<WorkspaceFolderUiState>()(
  persist(
    (set) => ({
      activeTab: 'staging',
      setActiveTab: (tab) => set({ activeTab: tab }),
      selectedPaperId: null,
      setSelectedPaperId: (id) => set({ selectedPaperId: id }),
    }),
    { name: 'scholay.workspace-folder-ui' },
  ),
);

export const STAGING_FOLDER_LABEL = '暂存';
