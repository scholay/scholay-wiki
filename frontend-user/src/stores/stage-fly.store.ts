import { create } from 'zustand';

/**
 * 「暂存飞入」动画协调器 —— 芯片从论文卡飞入左侧工作区「暂存」文件夹
 * (矩阵视图挂载时也可回落到矩阵行)。
 *
 * 时序:勾选暂存 → 展开暂存文件夹 → 抓源卡 rect 调 requestFly →
 * StageFlyLayer 下一帧取 workspaceTarget ?? matrixTarget → 飞入。
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

type TargetGetter = () => RectLike | null;

interface StageFlyState {
  fly: StageFly | null;
  workspaceTarget: TargetGetter | null;
  matrixTarget: TargetGetter | null;
  setWorkspaceTarget: (fn: TargetGetter | null) => void;
  setMatrixTarget: (fn: TargetGetter | null) => void;
  /** @deprecated 兼容旧调用,等价 setMatrixTarget */
  setGetTarget: (fn: TargetGetter | null) => void;
  getTarget: TargetGetter | null;
  /** 仅需源 rect;落点在动画帧再取(便于先展开文件夹)。 */
  requestFly: (from: RectLike | null, title: string) => void;
  endFly: (id: number) => void;
}

let nextId = 0;

export const useStageFly = create<StageFlyState>((set, get) => ({
  fly: null,
  workspaceTarget: null,
  matrixTarget: null,
  getTarget: null,
  setWorkspaceTarget: (fn) => set({ workspaceTarget: fn }),
  setMatrixTarget: (fn) =>
    set({ matrixTarget: fn, getTarget: fn ?? get().workspaceTarget }),
  setGetTarget: (fn) =>
    set({ matrixTarget: fn, getTarget: get().workspaceTarget ?? fn }),
  requestFly: (from, title) => {
    if (!from) return;
    nextId += 1;
    set({ fly: { id: nextId, from, title } });
  },
  endFly: (id) => set((s) => (s.fly?.id === id ? { fly: null } : s)),
}));

/** StageFlyLayer 用:优先侧栏暂存落点,否则矩阵 */
export function resolveStageFlyTarget(): RectLike | null {
  const s = useStageFly.getState();
  return s.workspaceTarget?.() ?? s.matrixTarget?.() ?? null;
}
