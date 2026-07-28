import { create } from 'zustand';

/**
 * 全局「收藏到文件夹」选择器 —— 收藏按钮散落各处(搜索/矩阵/详情/feed/列表),
 * 用一个全局 store + 一份挂载的 picker(类比 share.store),任意收藏按钮点一下就 openCollect。
 * picker 只负责「选哪个文件夹」(含新建);真正的收藏 mutation + 成功反馈仍由 FavoritePaperButton
 * 在 onPick 回调里做(沿用其 burst/toast/onSuccess 单通道,避免重复)。
 */
export interface CollectRequest {
  /** 论文标题,picker 顶部副标题可展示「把《…》加入文件夹」(可选)。 */
  paperTitle?: string;
  /** 用户选定文件夹后回调;folderId=null 表示默认文件夹(后端 Add 省略 folder_id 即落默认)。 */
  onPick: (folderId: number | null) => void;
}

interface CollectPickerState {
  request: CollectRequest | null;
  openCollect: (request: CollectRequest) => void;
  closeCollect: () => void;
}

export const useCollectPicker = create<CollectPickerState>((set) => ({
  request: null,
  openCollect: (request) => set({ request }),
  closeCollect: () => set({ request: null }),
}));
