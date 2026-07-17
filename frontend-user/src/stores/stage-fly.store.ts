import { create } from 'zustand';

/**
 * 「暂存飞入」动画的跨栏协调器 —— 点暂存时,一枚芯片从左侧论文卡**飞入**右侧矩阵分析的落点行。
 *
 * 为什么用 store 协调:源(左侧搜索器列的卡)与落点(右侧工作区 MatrixColumn)是 SearchPage 下
 * 两个不同子树 + 不同滚动容器,靠一个极小 store 把「源 rect」和「落点 getter」对接起来,portal
 * 覆盖层(StageFlyLayer)负责真正的位移动画。逻辑同 [[favorite-burst.store]] 的 portal 飞行套路。
 *
 * 时序:点暂存 → stagePaper 立刻抓源卡 rect 调 requestFly → StageFlyLayer 下一帧调 getTarget()
 *   (MatrixColumn 把矩阵滚到底 + 返回最后一行论文列的落点 rect)→ 芯片从源飞到落点 → 结束清空。
 */
export interface RectLike {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface StageFly {
  id: number;
  from: RectLike;
  title: string;
}

interface StageFlyState {
  fly: StageFly | null;
  /** MatrixColumn 注册:滚动到底 + 返回落点 rect(最后一行论文列);矩阵未挂载时该 getter 为 null。 */
  getTarget: (() => RectLike | null) | null;
  setGetTarget: (fn: (() => RectLike | null) | null) => void;
  /** 暂存时触发。from=源卡 rect(null=没抓到,不飞);无落点 getter(如首次暂存矩阵还没挂)也不飞。 */
  requestFly: (from: RectLike | null, title: string) => void;
  endFly: (id: number) => void;
}

let nextId = 0;

export const useStageFly = create<StageFlyState>((set, get) => ({
  fly: null,
  getTarget: null,
  setGetTarget: (fn) => set({ getTarget: fn }),
  requestFly: (from, title) => {
    // 没抓到源卡(理论上点了就有)/ 矩阵还没挂载(首次暂存 WelcomeBoard→Matrix 过渡)→ 不飞,
    // 避免飞向不存在的落点。首次那一篇直接出现在矩阵里,后续暂存才有飞入。
    if (!from || !get().getTarget) return;
    nextId += 1;
    set({ fly: { id: nextId, from, title } });
  },
  endFly: (id) => set((s) => (s.fly?.id === id ? { fly: null } : s)),
}));
