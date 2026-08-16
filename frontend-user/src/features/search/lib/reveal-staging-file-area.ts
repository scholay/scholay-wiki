import { useSearchRightPanelStore } from '@/stores/search-right-panel.store';
import { useWorkspaceFolderUi } from '@/stores/workspace-folder.store';

/**
 * Open the file column when main-content papers arrive.
 * Already on 当前对话 → stay there. Viewing another folder → keep that
 * folder and flag the “返回当前会话” tip instead of stealing the list.
 */
export function revealStagingFileArea() {
  useSearchRightPanelStore.getState().openFileArea();
  const ui = useWorkspaceFolderUi.getState();
  if (ui.activeTab === 'staging') {
    ui.expandFolder('staging');
    return;
  }
  ui.markUnseenStaging();
}
