import { create } from 'zustand';
import type { ArtifactTabPayload } from '@/stores/search-right-panel.store';

type DeckFormat = 'pptx' | 'pptx-native' | 'pdf';

/**
 * Claw/boltslides 把「导出演示稿」回调挂到这里,SearchRightPanel 的产物 tab 读取。
 * 避免 search → claw 为了拿 props 再包一层。
 */
interface ArtifactExportBridgeState {
  onExportDeck?: (artifact: ArtifactTabPayload, format: DeckFormat) => void;
  exportingFormat: DeckFormat | null;
  bind: (opts: {
    onExportDeck?: (artifact: ArtifactTabPayload, format: DeckFormat) => void;
    exportingFormat?: DeckFormat | null;
  }) => void;
  unbind: () => void;
}

export const useArtifactExportBridge = create<ArtifactExportBridgeState>((set) => ({
  onExportDeck: undefined,
  exportingFormat: null,
  bind: ({ onExportDeck, exportingFormat = null }) =>
    set({ onExportDeck, exportingFormat }),
  unbind: () => set({ onExportDeck: undefined, exportingFormat: null }),
}));
