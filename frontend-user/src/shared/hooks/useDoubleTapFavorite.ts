import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { useFavoritePaper } from '@/shared/api/user-library-mutations';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { usePendingAction } from '@/stores/pending-action.store';
import { haptic } from '@/shared/lib/haptics';
import type { Paper } from '@/shared/api/types';

/**
 * 双击收藏(Instagram 式)—— 给 feed 卡用:双击卡片空白处即收藏(已收藏则只弹 ❤️,不取消)。
 * 复用 useFavoritePaper + 登录门闩,不改动 FavoritePaperButton。
 * 返回 onTap(挂在卡片 onClick)+ showHeart(驱动 ❤️ 弹出动画)。
 *
 * 与 embla 纵向滑动不冲突:onClick 只在「点按」时触发,滑动手势不会派发 click。
 */
export function useDoubleTapFavorite(paper: Paper, isFavorited: boolean) {
  const favMut = useFavoritePaper();
  const [showHeart, setShowHeart] = useState(false);
  const lastTap = useRef(0);
  const timer = useRef<number | null>(null);

  // 卸载时清掉未触发的隐藏定时器,避免在已卸载组件上 setState
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const onTap = (e: MouseEvent<HTMLElement>) => {
    // 点在操作按钮 / 链接上不算双击收藏(让它们各自处理)
    if ((e.target as HTMLElement).closest('button, a')) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      setShowHeart(true);
      haptic([8, 24, 8]);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setShowHeart(false), 650);
      if (isFavorited) return; // 已收藏:只弹心,不重复收藏 / 不取消
      if (!useAuthStore.getState().token) {
        usePendingAction.getState().set({ type: 'favorite', paper });
        useAuthDialog.getState().openDialog('login');
        return;
      }
      favMut.mutate({ paper, silentSuccess: true });
    } else {
      lastTap.current = now;
    }
  };

  return { onTap, showHeart };
}
