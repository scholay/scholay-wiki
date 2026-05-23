import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { usePendingAction } from '@/stores/pending-action.store';
import { useFavoritePaper } from '@/shared/api/user-library-mutations';

/**
 * 全局挂载:在 token 由空 → 非空(用户刚登录成功)的瞬间,把 pending-action
 * 缓冲里的动作"补上"。
 *
 * 比如:用户在搜索结果点 "收藏" → 我们存了 {type:'favorite', paper}
 * + 弹出登录;登录成功后这里检测到 token 变化,立即调收藏 mutation,
 * 用户无需再点一次。
 *
 * 设计要点:
 *   - 通过 useRef 记录上一次 token,只在"空 → 非空"瞬间触发,避免
 *     刷新页面带 token 时误触
 *   - consume() 原子取出 + 清空,防止重复重放
 *   - 已挂在 AppShell,在所有受保护页面都生效
 */
export function useReplayPendingAction() {
  const token = useAuthStore((s) => s.token);
  const prevTokenRef = useRef<string | null>(token);
  const favoriteMut = useFavoritePaper();

  useEffect(() => {
    const prev = prevTokenRef.current;
    prevTokenRef.current = token;
    // 仅在"刚登录"瞬间触发 —— 排除刷新带 token / 登出 / 同账号续期
    if (!token || prev) return;

    const action = usePendingAction.getState().consume();
    if (!action) return;

    if (action.type === 'favorite') {
      // silentSuccess —— 跳过默认 burst/toast,这里给"自动重放"专属文案
      favoriteMut.mutate(
        { paper: action.paper, folderId: action.folderId, silentSuccess: true },
        {
          onSuccess: () => toast.success('已自动收藏这篇论文到文献集'),
          onError: (err: unknown) => {
            const msg = err instanceof Error ? err.message : '自动收藏失败,请到论文页重新点一次';
            toast.error(msg);
          },
        }
      );
    } else if (action.type === 'bulk-import-search') {
      // "一键导入"自动重放不可靠 —— 登录前后搜索状态(query / page / filter)
      // 可能变化,直接重放等于盲动。这里只做一次提示,引导用户回到搜索器
      // 重新点 CTA;现在的导入实现已支持批量 + 去重 + 100 上限。
      toast.success('登录成功,在工作区再点一次"从搜索器一键导入"即可');
    }
  }, [token, favoriteMut]);
}
