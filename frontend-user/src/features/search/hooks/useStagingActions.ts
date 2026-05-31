import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useApiToast } from '@/shared/hooks';
import { useAuthStore } from '@/stores/auth.store';
import {
  MAX_AREAS,
  MAX_PAPERS_PER_AREA,
  useStagingAreas,
} from '@/stores/staging-areas.store';
import { useStagingUi } from '@/stores/staging-ui.store';
import {
  stagingAreasKey,
  useAddRemotePaper,
  useClearRemotePapers,
  useCreateRemoteArea,
  useDeleteRemoteArea,
  useRemoveRemotePaper,
  useRenameRemoteArea,
  type RemoteStagingArea,
} from '../api/staging-areas';
import type { Paper, UpstreamSource } from '@/shared/api/types';
import type { FacadeArea } from './useStagingView';

/**
 * 暂存区**动作集合** —— 给真正要写状态的组件用(MatrixColumn 的 hover ×、
 * StagingTabs 的 + / rename / close、PaperResultCard 的 + 暂存)。
 *
 * 拆解自旧 useStagingFacade:
 *   - 不订阅 view 数据 —— 只在 mutation 回调里访问 react-query 缓存或局部 store
 *   - 因此 view 变化不会让纯展示组件因 actions 引用而重渲
 *   - 调用方按需取所需 action,典型用法 `const { stagePaper } = useStagingActions()`
 *
 * 行为与旧 facade 完全一致:匿名态走 zustand,登录态走 backend(via TanStack Query)。
 */

const remoteIdToKey = (id: number) => `r-${id}`;

function normalizeRemoteId(key: string): number | null {
  if (!key.startsWith('r-')) return null;
  const n = Number(key.slice(2));
  return Number.isFinite(n) ? n : null;
}

export interface BulkStageResult {
  /** 实际新加入的篇数 */
  added: number;
  /** 因已存在跳过 */
  skipped: number;
  /** 因暂存区已满(上限 MAX_PAPERS_PER_AREA=100)跳过 */
  capped: number;
}

export interface StagingActions {
  setActive: (id: string) => void;
  createArea: (name?: string) => void;
  deleteArea: (id: string) => void;
  renameArea: (id: string, name: string) => void;
  stagePaper: (paper: Paper) => void;
  /**
   * 批量暂存(一键导入)—— 一次性把多篇论文加入 active 暂存区。
   * 不弹 per-item toast,调用方根据 BulkStageResult 弹一条汇总。
   * - 没有 active 区 → 自动创建一个
   * - 重复 / 超出 100 上限 → 计入 skipped / capped,不报错
   */
  bulkStagePapers: (papers: Paper[]) => Promise<BulkStageResult>;
  removePaper: (areaId: string, paperId: string) => void;
  /** 清空 area 内全部 papers,保留 area —— 走后端 batch endpoint,1 个请求搞定 */
  clearArea: (areaId: string) => void;
}

export function useStagingActions(): StagingActions {
  const token = useAuthStore((s) => s.token);
  const isAuthed = !!token;
  const apiToast = useApiToast();

  // === 匿名态 store actions(只取函数引用,不订阅数据 —— 不会因数据变化重渲) ===
  const localCreate = useStagingAreas((s) => s.createArea);
  const localDelete = useStagingAreas((s) => s.deleteArea);
  const localRename = useStagingAreas((s) => s.renameArea);
  const localSetActive = useStagingAreas((s) => s.setActive);
  const localStagePaper = useStagingAreas((s) => s.stagePaper);
  const localRemovePaper = useStagingAreas((s) => s.removePaper);
  const localClearArea = useStagingAreas((s) => s.clearArea);

  // === 登录态 mutations(只在调用方使用时实例化) ===
  const setActiveRemote = useStagingUi((s) => s.setActiveRemote);
  const createMut = useCreateRemoteArea();
  const deleteMut = useDeleteRemoteArea();
  const renameMut = useRenameRemoteArea();
  const addPaperMut = useAddRemotePaper();
  const removePaperMut = useRemoveRemotePaper();
  const clearPapersMut = useClearRemotePapers();

  // 关键:登录态下不**订阅** remote areas(订阅 = 数据变化重渲 = 列表项级联重渲)。
  // 改用 queryClient 在 callback 里**按需读缓存**。
  const qc = useQueryClient();
  const readRemoteAreas = useCallback(
    (): RemoteStagingArea[] =>
      qc.getQueryData<RemoteStagingArea[]>(stagingAreasKey) ?? [],
    [qc]
  );

  /**
   * 切换 active 暂存区。同时执行"切走时清理空区"规则:
   * 如果旧 active 区里 papers 为空,切去新 tab 时把旧的删掉
   * (避免一堆空 tab 残留,符合 5 区固定上限的语义)。
   */
  const setActive = useCallback(
    (id: string) => {
      if (isAuthed) {
        const activeRemoteId = useStagingUi.getState().activeRemoteId;
        const newRemoteId = normalizeRemoteId(id);
        if (newRemoteId != null && activeRemoteId !== newRemoteId) {
          // 检查旧 area 是否空,空则后台删
          if (activeRemoteId != null) {
            const oldArea = readRemoteAreas().find(
              (a) => a.id === activeRemoteId
            );
            if (oldArea && (oldArea.papers ?? []).length === 0) {
              deleteMut.mutate(activeRemoteId, {
                onError: (err) =>
                  toast.error(`清理空暂存区失败:${(err as Error).message}`),
              });
            }
          }
          setActiveRemote(newRemoteId);
        }
      } else {
        // 匿名:直接读 store 当前 active,检查空区
        const { areas, activeId, deleteArea } = useStagingAreas.getState();
        if (activeId && activeId !== id) {
          const oldArea = areas.find((a) => a.id === activeId);
          if (oldArea && oldArea.papers.length === 0) {
            deleteArea(activeId);
          }
        }
        localSetActive(id);
      }
    },
    [isAuthed, readRemoteAreas, deleteMut, setActiveRemote, localSetActive]
  );

  const createArea = useCallback(
    (name?: string) => {
      if (isAuthed) {
        if (readRemoteAreas().length >= MAX_AREAS) {
          toast.error(`最多 ${MAX_AREAS} 个暂存区`);
          return;
        }
        createMut.mutate(name, {
          onSuccess: (area) => setActiveRemote(area.id),
          onError: apiToast.onError('创建失败'),
        });
      } else {
        localCreate(name);
      }
    },
    [isAuthed, readRemoteAreas, createMut, setActiveRemote, localCreate, apiToast]
  );

  const deleteArea = useCallback(
    (id: string) => {
      if (isAuthed) {
        const remoteId = normalizeRemoteId(id);
        if (remoteId == null) return;
        deleteMut.mutate(remoteId, {
          onError: (err) => toast.error(`删除失败:${(err as Error).message}`),
        });
        // 主动清掉 active —— facade 会自动 fallback 到第一个
        const currentActive = useStagingUi.getState().activeRemoteId;
        if (currentActive === remoteId) setActiveRemote(null);
      } else {
        localDelete(id);
      }
    },
    [isAuthed, deleteMut, setActiveRemote, localDelete]
  );

  const renameArea = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      if (isAuthed) {
        const remoteId = normalizeRemoteId(id);
        if (remoteId == null) return;
        renameMut.mutate(
          { id: remoteId, name: trimmed },
          {
            onError: (err) =>
              toast.error(`重命名失败:${(err as Error).message}`),
          }
        );
      } else {
        localRename(id, trimmed);
      }
    },
    [isAuthed, renameMut, localRename]
  );

  /**
   * 登录态:确保有一个 active 区(若没有则创建一个)—— 返回该区,供 stagePaper 用。
   * 不依赖 remoteAreas 闭包 —— 直接读 react-query 缓存的最新值,避免 stale closure。
   */
  const ensureAuthedArea = useCallback((): Promise<FacadeArea | null> => {
    const areas = readRemoteAreas();
    const activeRemoteId = useStagingUi.getState().activeRemoteId;
    const existing =
      areas.find((a) => a.id === activeRemoteId) ?? areas[0] ?? null;

    if (existing) {
      if (existing.id !== activeRemoteId) setActiveRemote(existing.id);
      return Promise.resolve({
        id: remoteIdToKey(existing.id),
        name: existing.name,
        papers: (existing.papers ?? []).map((p) => ({
          paperId: p.source_paper_id,
          title: p.title,
          abstract: p.abstract,
          year: p.year,
          venue: p.venue,
          citationCount: p.citation_count,
          isOpenAccess: p.is_open_access,
          authors: p.authors,
          source: p.source,
        })),
        remoteId: existing.id,
      });
    }

    return new Promise((resolve) => {
      createMut.mutate(undefined, {
        onSuccess: (area) => {
          setActiveRemote(area.id);
          resolve({
            id: remoteIdToKey(area.id),
            name: area.name,
            papers: [],
            remoteId: area.id,
          });
        },
        onError: (err) => {
          toast.error(`创建失败:${(err as Error).message}`);
          resolve(null);
        },
      });
    });
  }, [readRemoteAreas, createMut, setActiveRemote]);

  const stagePaper = useCallback(
    (paper: Paper) => {
      if (isAuthed) {
        ensureAuthedArea().then((area) => {
          if (!area || area.remoteId == null) return;
          if (area.papers.some((p) => p.paperId === paper.paperId)) {
            toast.info('这篇论文已在该暂存区');
            return;
          }
          if (area.papers.length >= MAX_PAPERS_PER_AREA) {
            toast.error(`暂存区已满(上限 ${MAX_PAPERS_PER_AREA} 篇)`);
            return;
          }
          addPaperMut.mutate(
            { areaId: area.remoteId, paper },
            {
              onError: (err) =>
                toast.error(`添加失败:${(err as Error).message}`),
            }
          );
        });
      } else {
        localStagePaper(paper);
      }
    },
    [isAuthed, ensureAuthedArea, addPaperMut, localStagePaper]
  );

  const bulkStagePapers = useCallback(
    async (papers: Paper[]): Promise<BulkStageResult> => {
      // 1) 输入侧去重(同一 paperId 多次传入只算一次)
      const seen = new Set<string>();
      const candidates: Paper[] = [];
      for (const p of papers) {
        if (!p.paperId || seen.has(p.paperId)) continue;
        seen.add(p.paperId);
        candidates.push(p);
      }
      if (candidates.length === 0) {
        return { added: 0, skipped: 0, capped: 0 };
      }

      if (isAuthed) {
        // 2a) 已登录:ensureAuthedArea 准备好 active 区
        const area = await ensureAuthedArea();
        if (!area || area.remoteId == null) {
          return { added: 0, skipped: 0, capped: 0 };
        }
        const existing = new Set(area.papers.map((p) => p.paperId));
        const remaining = Math.max(
          0,
          MAX_PAPERS_PER_AREA - area.papers.length
        );
        const toAdd: Paper[] = [];
        let skipped = 0;
        let capped = 0;
        for (const p of candidates) {
          if (existing.has(p.paperId)) {
            skipped += 1;
            continue;
          }
          if (toAdd.length >= remaining) {
            capped += 1;
            continue;
          }
          existing.add(p.paperId);
          toAdd.push(p);
        }

        // **并行** fire mutations —— 顺序 await 会因共享同一 useMutation 实例
        // 出现"只完成前 N 条"的现象(react-query 的内部 state 被后续 mutate 覆盖,
        // 部分 callback 的 resolve 没拿到机会跑)。并行 Promise.all 让每个 mutate
        // 完整 settle 走自己的 callback,N 条都跑完。后端 AddPaper 单点无 rate-limit,
        // 并发安全 + 幂等(同 source_paper_id 重复 → 直接返已有记录)。
        const settles = await Promise.all(
          toAdd.map(
            (p) =>
              new Promise<boolean>((resolve) => {
                addPaperMut.mutate(
                  { areaId: area.remoteId!, paper: p },
                  {
                    onSuccess: () => resolve(true),
                    onError: () => resolve(false),
                  }
                );
              })
          )
        );
        const added = settles.filter(Boolean).length;
        skipped += settles.length - added;
        return { added, skipped, capped };
      }

      // 2b) 匿名:确保有 active 区(没有就创建一个)+ 走 store.bulkAddPapers 单次 setState
      const state = useStagingAreas.getState();
      let activeId = state.activeId;
      if (!activeId || !state.areas.some((a) => a.id === activeId)) {
        activeId = state.createArea();
      }
      if (!activeId) {
        return { added: 0, skipped: 0, capped: 0 };
      }
      return useStagingAreas.getState().bulkAddPapers(activeId, candidates);
    },
    [isAuthed, ensureAuthedArea, addPaperMut]
  );

  const removePaper = useCallback(
    (areaId: string, paperId: string) => {
      if (isAuthed) {
        const remoteId = normalizeRemoteId(areaId);
        if (remoteId == null) return;
        const area = readRemoteAreas().find((a) => a.id === remoteId);
        const target = area?.papers?.find(
          (p) => p.source_paper_id === paperId
        );
        if (!target) return;
        removePaperMut.mutate(
          {
            areaId: remoteId,
            source: (target.source ?? 'stc') as UpstreamSource,
            paperId,
          },
          {
            onError: (err) => toast.error(`移除失败:${(err as Error).message}`),
          }
        );
      } else {
        localRemovePaper(areaId, paperId);
      }
    },
    [isAuthed, readRemoteAreas, removePaperMut, localRemovePaper]
  );

  /**
   * 清空一个 area 内全部 papers(保留 area 本身)
   * - 登录:走后端 batch endpoint(1 个 DELETE 请求 + 1 次缓存失效)
   * - 匿名:直接 store.clearArea
   */
  const clearArea = useCallback(
    (areaId: string) => {
      if (isAuthed) {
        const remoteId = normalizeRemoteId(areaId);
        if (remoteId == null) return;
        clearPapersMut.mutate(remoteId, {
          onError: (err) =>
            toast.error(`清空失败:${(err as Error).message}`),
        });
      } else {
        localClearArea(areaId);
      }
    },
    [isAuthed, clearPapersMut, localClearArea]
  );

  return {
    setActive,
    createArea,
    deleteArea,
    renameArea,
    stagePaper,
    bulkStagePapers,
    removePaper,
    clearArea,
  };
}
