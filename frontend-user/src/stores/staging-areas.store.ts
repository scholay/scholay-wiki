import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import type { Paper } from '@/shared/api/types';

/**
 * 多暂存区(staging area)状态 —— 全局 client state,持久化到 localStorage。
 *
 * 模型:
 *   - 最多 5 个暂存区(类似浏览器/编辑器的多 tab)
 *   - 每个暂存区最多 100 篇论文
 *   - 一个 activeId 指向当前操作的暂存区
 *   - "+ 暂存"语义:论文放入 active 区;若无区则自动创建第一个
 *
 * 持久化:
 *   - 默认走 localStorage(key: `scholay.staging-areas`),匿名用户也能用
 *   - 后续登录态切换时,由 useStagingSync 上层钩子触发 → 推到后端
 *     (后端端点 `POST /user/staging-areas/migrate` 待 follow-up)
 */

export const MAX_AREAS = 5;
export const MAX_PAPERS_PER_AREA = 100;

export interface StagingArea {
  id: string;
  name: string;
  papers: Paper[];
  createdAt: number;
  /** 后端 id —— 若已同步到后端则有值,纯本地态为 undefined */
  remoteId?: number;
}

interface StagingAreasState {
  areas: StagingArea[];
  activeId: string | null;

  createArea: (name?: string) => string | null;
  deleteArea: (id: string) => void;
  renameArea: (id: string, name: string) => void;
  setActive: (id: string) => void;

  addPaper: (areaId: string, paper: Paper) => boolean;
  removePaper: (areaId: string, paperId: string) => void;
  /** Rewrite paper order in an area. orderedIds must cover the current set. */
  reorderPapers: (areaId: string, orderedIds: string[]) => void;
  /** 清空 area 内所有 papers,保留 area 本身(用户主动"× 清空"按钮) */
  clearArea: (areaId: string) => void;

  /**
   * 批量加入 —— 一次 setState,**不弹 per-item toast**(由调用方汇总展示)。
   * 返回统计:added=新加入数,skipped=因已存在跳过,capped=因满 100 上限跳过。
   * 用于"从搜索器一键导入"等场景。
   */
  bulkAddPapers: (
    areaId: string,
    papers: Paper[]
  ) => { added: number; skipped: number; capped: number };

  /**
   * 智能暂存:
   *   - 无任何区 → 自动创建"暂存区 1" 并把 paper 放进去
   *   - 有 active 区 → 加到 active
   *   - active 区已满 / paper 已存在 → toast 提示
   * 返回操作后所在的 areaId(便于上层切换视图)。
   */
  stagePaper: (paper: Paper) => string | null;

  /** 清空所有(危险),包括 activeId */
  clearAll: () => void;
}

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `area_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * 固定五分区命名 —— UI 上 5 个 tab 始终是 A B C D E 五选,用户不可改名/不可超出。
 * 命名时挑现有 areas 里**第一个未占用**的字母。所以哪怕中间留空(理论上 UI 不允许)
 * 新建也会填到那个 letter,保持名字稳定。
 */
export const FIXED_AREA_NAMES = ['A', 'B', 'C', 'D', 'E'] as const;
export type FixedAreaName = (typeof FIXED_AREA_NAMES)[number];

const nextDefaultName = (areas: StagingArea[]): string => {
  const used = new Set(areas.map((a) => a.name));
  for (const n of FIXED_AREA_NAMES) {
    if (!used.has(n)) return n;
  }
  return FIXED_AREA_NAMES[FIXED_AREA_NAMES.length - 1];
};

export const useStagingAreas = create<StagingAreasState>()(
  persist(
    (set, get) => ({
      areas: [],
      activeId: null,

      createArea: (name) => {
        const { areas } = get();
        if (areas.length >= MAX_AREAS) {
          toast.error(`最多 ${MAX_AREAS} 个暂存区`);
          return null;
        }
        const id = newId();
        const area: StagingArea = {
          id,
          name: name?.trim() || nextDefaultName(areas),
          papers: [],
          createdAt: Date.now(),
        };
        set({ areas: [...areas, area], activeId: id });
        return id;
      },

      deleteArea: (id) => {
        const { areas, activeId } = get();
        const next = areas.filter((a) => a.id !== id);
        let nextActive = activeId;
        if (activeId === id) {
          nextActive = next.length > 0 ? next[next.length - 1].id : null;
        }
        set({ areas: next, activeId: nextActive });
      },

      renameArea: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set({
          areas: get().areas.map((a) =>
            a.id === id ? { ...a, name: trimmed } : a
          ),
        });
      },

      setActive: (id) => {
        if (get().areas.some((a) => a.id === id)) set({ activeId: id });
      },

      addPaper: (areaId, paper) => {
        const { areas } = get();
        const area = areas.find((a) => a.id === areaId);
        if (!area) return false;
        if (area.papers.some((p) => p.paperId === paper.paperId)) {
          toast.info('这篇论文已在该暂存区');
          return false;
        }
        if (area.papers.length >= MAX_PAPERS_PER_AREA) {
          toast.error(`暂存区已满(上限 ${MAX_PAPERS_PER_AREA} 篇)`);
          return false;
        }
        set({
          areas: areas.map((a) =>
            a.id === areaId ? { ...a, papers: [...a.papers, paper] } : a
          ),
        });
        return true;
      },

      removePaper: (areaId, paperId) => {
        set({
          areas: get().areas.map((a) =>
            a.id === areaId
              ? { ...a, papers: a.papers.filter((p) => p.paperId !== paperId) }
              : a
          ),
        });
      },

      reorderPapers: (areaId, orderedIds) => {
        set({
          areas: get().areas.map((a) => {
            if (a.id !== areaId) return a;
            const byId = new Map(a.papers.map((p) => [p.paperId, p]));
            const next: Paper[] = [];
            const seen = new Set<string>();
            for (const id of orderedIds) {
              const paper = byId.get(id);
              if (!paper || seen.has(id)) continue;
              next.push(paper);
              seen.add(id);
            }
            for (const paper of a.papers) {
              if (!seen.has(paper.paperId)) next.push(paper);
            }
            return { ...a, papers: next };
          }),
        });
      },

      bulkAddPapers: (areaId, papers) => {
        const { areas } = get();
        const area = areas.find((a) => a.id === areaId);
        if (!area) return { added: 0, skipped: 0, capped: 0 };
        const existing = new Set(area.papers.map((p) => p.paperId));
        const remaining = Math.max(0, MAX_PAPERS_PER_AREA - area.papers.length);
        const toAdd: Paper[] = [];
        let skipped = 0;
        let capped = 0;
        for (const p of papers) {
          if (!p.paperId || existing.has(p.paperId)) {
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
        if (toAdd.length === 0) return { added: 0, skipped, capped };
        set({
          areas: areas.map((a) =>
            a.id === areaId ? { ...a, papers: [...a.papers, ...toAdd] } : a
          ),
        });
        return { added: toAdd.length, skipped, capped };
      },

      clearArea: (areaId) => {
        set({
          areas: get().areas.map((a) =>
            a.id === areaId ? { ...a, papers: [] } : a
          ),
        });
      },

      stagePaper: (paper) => {
        const { areas, activeId, createArea, addPaper } = get();
        let targetId = activeId;
        if (!targetId || !areas.some((a) => a.id === targetId)) {
          // 无区 / activeId 失效 → 创建第一个区
          targetId = createArea();
          if (!targetId) return null;
        }
        addPaper(targetId, paper);
        return targetId;
      },

      clearAll: () => set({ areas: [], activeId: null }),
    }),
    {
      name: 'scholay.staging-areas',
      // 同时持久化 areas 和 activeId,刷新页面恢复
      partialize: (s) => ({ areas: s.areas, activeId: s.activeId }),
    }
  )
);

// =============================================================================
// 派生选择器(避免组件订阅整个 store 引发不必要的 re-render)
// =============================================================================

export const useActiveStagingArea = () =>
  useStagingAreas((s) => {
    if (!s.activeId) return null;
    return s.areas.find((a) => a.id === s.activeId) ?? null;
  });
