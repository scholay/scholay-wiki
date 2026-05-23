import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useStagingAreas } from '@/stores/staging-areas.store';
import { useStagingUi } from '@/stores/staging-ui.store';
import {
  remotePaperToPaper,
  useRemoteStagingAreas,
  type RemoteStagingArea,
} from '../api/staging-areas';
import type { Paper } from '@/shared/api/types';

/**
 * 暂存区**只读视图** —— 给绝大多数组件用。
 *
 * 拆解自旧 useStagingFacade(282 行):
 *   - 只订阅数据,不引入任何 mutation 实例(不需要时不订阅是 react-query 的最佳实践)
 *   - 引用稳定:areas 用 useMemo 包,只在 remoteQuery.data 或 localAreas 真变化时换引用
 *   - 不依赖 actions hook,所以放心在列表项里调,React 不会因为父级 action 调用重渲
 *
 * 匿名:数据来自 useStagingAreas(localStorage,全套状态)
 * 登录:数据来自 useRemoteStagingAreas(TanStack Query)+ useStagingUi(active id)
 *
 * 返回的 area.id 永远是 string —— 远端格式 `r-<numId>`,本地是 UUID。
 */

export interface FacadeArea {
  id: string;
  name: string;
  papers: Paper[];
  remoteId?: number;
}

export interface StagingView {
  isAuthed: boolean;
  isRemoteLoading: boolean;
  areas: FacadeArea[];
  activeId: string | null;
  activeArea: FacadeArea | null;
  /** 跨所有区合并的已暂存 paperId 集合 —— SearcherColumn 高频使用 */
  stagedIds: Set<string>;
}

const remoteIdToKey = (id: number) => `r-${id}`;

function normalizeRemote(area: RemoteStagingArea): FacadeArea {
  return {
    id: remoteIdToKey(area.id),
    name: area.name,
    papers: (area.papers ?? []).map(remotePaperToPaper),
    remoteId: area.id,
  };
}

export function useStagingView(): StagingView {
  const token = useAuthStore((s) => s.token);
  const isAuthed = !!token;

  // 匿名态
  const localAreas = useStagingAreas((s) => s.areas);
  const localActiveId = useStagingAreas((s) => s.activeId);

  // 登录态
  const remoteQuery = useRemoteStagingAreas();
  const activeRemoteId = useStagingUi((s) => s.activeRemoteId);

  const remoteAreas = useMemo<FacadeArea[]>(
    () => (remoteQuery.data ?? []).map(normalizeRemote),
    [remoteQuery.data]
  );

  // 关键:把"是不是登录态决定数据源"这一步用 useMemo 锁住引用,
  // 否则下游 useMemo(stagedIds) / useCallback 全部失效
  const localFacadeAreas = useMemo<FacadeArea[]>(
    () =>
      localAreas.map((a) => ({
        id: a.id,
        name: a.name,
        papers: a.papers,
      })),
    [localAreas]
  );

  const areas = isAuthed ? remoteAreas : localFacadeAreas;

  // 远端 activeId 失效保护:若用户切换账号 / 删除后台数据,自动 fallback 第一区
  const effectiveRemoteKey = useMemo(() => {
    if (!isAuthed) return null;
    if (
      activeRemoteId != null &&
      remoteAreas.some((a) => a.remoteId === activeRemoteId)
    ) {
      return remoteIdToKey(activeRemoteId);
    }
    return remoteAreas[0]?.id ?? null;
  }, [isAuthed, activeRemoteId, remoteAreas]);

  const activeId = isAuthed ? effectiveRemoteKey : localActiveId;
  const activeArea = useMemo(
    () => areas.find((a) => a.id === activeId) ?? null,
    [areas, activeId]
  );

  const stagedIds = useMemo(() => {
    const s = new Set<string>();
    for (const a of areas) for (const p of a.papers) s.add(p.paperId);
    return s;
  }, [areas]);

  return {
    isAuthed,
    isRemoteLoading: isAuthed && remoteQuery.isLoading,
    areas,
    activeId,
    activeArea,
    stagedIds,
  };
}
