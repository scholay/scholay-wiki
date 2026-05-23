import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * UI-only state for staging areas when **authed**(数据本体在 TanStack Query 缓存里):
 *   - 哪个远端区是当前激活的 tab
 *   - 不存任何论文/区元数据 —— 那些走 useRemoteStagingAreas
 *
 * 匿名态的 activeId 仍在 staging-areas.store(本地全套状态)管理,不在这里。
 */
interface StagingUiState {
  activeRemoteId: number | null;
  setActiveRemote: (id: number | null) => void;
}

export const useStagingUi = create<StagingUiState>()(
  persist(
    (set) => ({
      activeRemoteId: null,
      setActiveRemote: (id) => set({ activeRemoteId: id }),
    }),
    { name: 'scholay.staging-ui' }
  )
);
