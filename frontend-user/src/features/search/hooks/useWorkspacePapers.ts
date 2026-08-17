import { useMemo } from 'react';
import { libraryRowToPaper } from '@/shared/api/user-library-papers';
import { useAuthStore } from '@/stores/auth.store';
import {
  STAGING_FOLDER_LABEL,
  applyPaperOrder,
  folderPaperOrderKey,
  useWorkspaceFolderUi,
} from '@/stores/workspace-folder.store';
import { useLibraryPapers } from '@/features/library/api/papers';
import { useLibraryFoldersSummary } from '../api/library';
import { useStagingView } from './useStagingView';
import type { Paper } from '@/shared/api/types';

export interface WorkspacePapersView {
  activeTab: 'staging' | number;
  tabLabel: string;
  papers: Paper[];
  isLoading: boolean;
  isStaging: boolean;
}

/** 工作区左栏当前 tab 对应的论文列表 —— 暂存区 or 文献集文件夹 */
export function useWorkspacePapers(): WorkspacePapersView {
  const activeTab = useWorkspaceFolderUi((s) => s.activeTab);
  const paperOrderByKey = useWorkspaceFolderUi((s) => s.paperOrderByKey);
  const token = useAuthStore((s) => s.token);
  const { activeArea } = useStagingView();
  const foldersQ = useLibraryFoldersSummary();

  const folderId = typeof activeTab === 'number' ? activeTab : null;
  const folderPapersQ = useLibraryPapers(folderId ?? 'root', {
    pageSize: 200,
    enabled: folderId != null,
  });

  const folderName = useMemo(() => {
    if (folderId == null) return STAGING_FOLDER_LABEL;
    return (
      foldersQ.data?.folders.find((f) => f.id === folderId)?.name ??
      '文件夹'
    );
  }, [folderId, foldersQ.data?.folders]);

  if (activeTab === 'staging') {
    return {
      activeTab,
      tabLabel: STAGING_FOLDER_LABEL,
      papers: activeArea?.papers ?? [],
      isLoading: false,
      isStaging: true,
    };
  }

  const items = folderPapersQ.data?.items ?? [];
  const papers = token ? items.map(libraryRowToPaper) : [];
  const folderOrder =
    folderId != null ? paperOrderByKey[folderPaperOrderKey(folderId)] : undefined;
  return {
    activeTab,
    tabLabel: folderName,
    papers: applyPaperOrder(papers, folderOrder),
    isLoading: !!token && folderPapersQ.isLoading,
    isStaging: false,
  };
}
