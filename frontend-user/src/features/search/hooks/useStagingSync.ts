import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { useStagingAreas } from '@/stores/staging-areas.store';
import { useStagingUi } from '@/stores/staging-ui.store';
import { useMigrateStagingAreas } from '../api/staging-areas';

/**
 * 登录态切换时把本地暂存区批量迁移到后端。
 *
 * 策略:
 *   - 仅在"token 由空 → 非空"瞬间触发(避免热重载 / 已登录刷新重跑)
 *   - 本地若无任何区直接退出
 *   - 调 POST /user/staging-areas/migrate,成功后清空本地 zustand
 *     (再切到匿名时不会拉来一堆遗留;真正想本地暂存重新建即可)
 *   - 失败保留本地,toast 提示,下次登录再试
 *
 * 后端在用户已有区的前提下追加,达 5 区上限的部分会被 skip(在 toast 里告知)。
 */
export function useStagingSync() {
  const token = useAuthStore((s) => s.token);
  const prevTokenRef = useRef<string | null>(token);
  const ranRef = useRef(false);

  const migrate = useMigrateStagingAreas();
  const setActiveRemote = useStagingUi((s) => s.setActiveRemote);

  useEffect(() => {
    const prev = prevTokenRef.current;
    prevTokenRef.current = token;
    if (!token || prev) return;
    if (ranRef.current) return;

    const { areas, clearAll } = useStagingAreas.getState();
    const local = areas.filter((a) => a.papers.length > 0);
    if (local.length === 0) return;

    ranRef.current = true;
    migrate.mutate(
      local.map((a) => ({ name: a.name, papers: a.papers })),
      {
        onSuccess: (resp) => {
          clearAll();
          if (resp.areas.length > 0) {
            setActiveRemote(resp.areas[0].id);
          }
          if (resp.skipped > 0) {
            toast.warning(
              `已同步 ${resp.merged} 个暂存区到云端,${resp.skipped} 个因超出上限被跳过`
            );
          } else {
            toast.success(`已同步 ${resp.merged} 个暂存区到云端`);
          }
        },
        onError: (err) => {
          ranRef.current = false; // 允许下次再试
          toast.error(`暂存区同步失败:${(err as Error).message}`);
        },
      }
    );
  }, [token, migrate, setActiveRemote]);
}
