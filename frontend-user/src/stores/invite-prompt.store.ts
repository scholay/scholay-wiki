import { create } from 'zustand';

const DONE_KEY = 'scholay.auth.invite_prompt_done';

function readDoneIds(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DONE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((n): n is number => typeof n === 'number')
      : [];
  } catch {
    return [];
  }
}

function markDone(userId: number) {
  if (typeof window === 'undefined') return;
  const ids = new Set(readDoneIds());
  ids.add(userId);
  localStorage.setItem(DONE_KEY, JSON.stringify([...ids]));
}

interface InvitePromptState {
  open: boolean;
  userId: number | null;
  /**
   * 新用户且注册时未带邀请码 → 弹一次提醒。
   * 已对应用户弹过(提交/跳过)则不再开。
   */
  openForNewUser: (userId: number) => void;
  close: () => void;
  /** 提交成功或点「暂不填写」：记已提醒并关窗 */
  dismiss: () => void;
}

let openTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 新用户首次登录「补填邀请码」弹窗状态。
 * 与 AuthDialog 分离,避免扫码注册关登录窗时把提醒一起卸掉。
 */
export const useInvitePromptStore = create<InvitePromptState>((set, get) => ({
  open: false,
  userId: null,
  openForNewUser: (userId) => {
    if (!userId || readDoneIds().includes(userId)) return;
    if (openTimer) clearTimeout(openTimer);
    // 等 AuthDialog / 扫码面板关完再开,避免双 Dialog 抢焦点
    openTimer = setTimeout(() => {
      if (readDoneIds().includes(userId)) return;
      set({ open: true, userId });
    }, 380);
  },
  close: () => {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
    set({ open: false });
  },
  dismiss: () => {
    const id = get().userId;
    if (id != null) markDone(id);
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
    set({ open: false, userId: null });
  },
}));
