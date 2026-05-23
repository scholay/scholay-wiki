import { toast } from 'sonner';
import { create } from 'zustand';

/**
 * 收藏 "+1" 动画事件流 —— 全局 burst 队列 + 可见性兜底。
 *
 * 任何位置成功收藏一篇论文(走 [[useFavoritePaper.onSuccess]])就调一次 pushBurst:
 *   - 当前**至少一个**可见的 [[FavoriteBurst]] sink(`sinkCount > 0`)→ 推进 bursts
 *     队列,sink 渲染从"我的文献集"段头浮起的 "+1" 标签
 *   - **没有可见 sink** —— 比如详情页(无 sidebar)/ sidebar 收起(anchor 不可见)→
 *     自动 fallback 到 `toast.success('已加入文献集')`,用户始终有反馈
 *
 * 可见性约定:[[FavoriteBurst]] 组件在 mount + `useSidebar.expanded === true` 时
 * 调 addSink 注册;反之 removeSink。注销后 sinkCount 归零 → 触发 toast fallback。
 *
 * 不持久化 —— 纯 ephemeral UI feedback,刷新即清。
 */
interface FavoriteBurstState {
  bursts: number[]; // 每个 burst 一个递增 ID(motion key 用)
  /** 当前可见的 FavoriteBurst sink 数量(addSink/removeSink 维护) */
  sinkCount: number;
  /**
   * 触发一次收藏成功反馈。
   * - 有可见 sink → push 进队列,sink 渲染浮起动画
   * - 无可见 sink → 自动 toast.success('已加入文献集')
   */
  pushBurst: () => void;
  removeBurst: (id: number) => void;
  /** FavoriteBurst 组件在 anchor 真正可见时调一次(挂载 + sidebar 展开) */
  addSink: () => void;
  removeSink: () => void;
}

let nextId = 0;

export const useFavoriteBurst = create<FavoriteBurstState>((set, get) => ({
  bursts: [],
  sinkCount: 0,
  pushBurst: () => {
    if (get().sinkCount > 0) {
      nextId += 1;
      const id = nextId;
      set((s) => ({ bursts: [...s.bursts, id] }));
    } else {
      // 无 sink → toast fallback,避免静默成功
      toast.success('已加入文献集');
    }
  },
  removeBurst: (id) =>
    set((s) => ({ bursts: s.bursts.filter((x) => x !== id) })),
  addSink: () => set((s) => ({ sinkCount: s.sinkCount + 1 })),
  removeSink: () => set((s) => ({ sinkCount: Math.max(0, s.sinkCount - 1) })),
}));
