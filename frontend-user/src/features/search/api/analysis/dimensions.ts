import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_FRESH } from '@/shared/lib/query-config';
import { useAuthStore } from '@/stores/auth.store';
import type {
  AnalysisDimension,
  DimensionSettingItem,
} from '@/shared/api/types';
// TODO: 30s 没对应 STALE_* preset, 保留硬编码 (settings dialog 实时性需要)。

/**
 * 分析维度的 CRUD + 可见性 + 设置面板列表。
 *
 * 三段式 queryKey:
 *   ['analysis', 'dimensions']             — 实际生效列表(过滤 IsActive=false)
 *   ['analysis', 'dimensions', 'settings'] — 设置面板专用(含隐藏 / 停用)
 *
 * 任何 mutation 都失效上述两个 + 矩阵分析缓存(dim 名/提示词变 → 后端
 * dimensionHash 变 → 缓存命中变化,要重拉)。
 */

interface DimensionsResponse {
  dimensions: AnalysisDimension[];
  total: number;
  isCustom?: boolean;
  maxDimensions?: number;
  customCount?: number;
}

interface DimensionSettingsResponse {
  dimensions: DimensionSettingItem[];
  total: number;
  maxDimensions: number;
}

const dimensionsKey = ['analysis', 'dimensions'] as const;
const settingsKey = ['analysis', 'dimensions', 'settings'] as const;
const paperAnalysisKey = ['analysis', 'paper'] as const;

/**
 * 失效 dimensions(含 settings 子键) + **清空** 所有 per-paper 矩阵缓存。
 *
 * 用 `removeQueries` 而不是 `invalidateQueries`:维度增 / 删 / 编辑提示词都会
 * 改 dimensionHash,旧缓存数据从语义上完全失效。removeQueries 直接把数据丢掉,
 * 下次 useQueries 渲染时各行立刻进入 loading 态,通过 [[paperBatcher]] 合并成
 * 批量 HTTP。
 *
 * 注意:**可见性切换走 [[useToggleDimensionVisibility]] 的乐观更新分支**,
 * 不应该调本函数 —— 隐藏只影响 UI 渲染,不影响 dimensionHash,矩阵无需重拉。
 */
function invalidateDimensions(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: dimensionsKey });
  qc.removeQueries({ queryKey: paperAnalysisKey });
}

// ============================================================================
// Queries
// ============================================================================

export function useAnalysisDimensions() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: dimensionsKey,
    enabled: !!token,
    staleTime: STALE_FRESH,
    queryFn: async (): Promise<AnalysisDimension[]> => {
      try {
        const { data } = await http.get<{ data: DimensionsResponse }>(
          '/analysis/dimensions'
        );
        return (data.data?.dimensions ?? []).filter(
          (d) => d.isActive !== false
        );
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

export function useDimensionSettings() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: settingsKey,
    enabled: !!token,
    staleTime: 30_000,
    queryFn: async (): Promise<DimensionSettingsResponse> => {
      try {
        const { data } = await http.get<{ data: DimensionSettingsResponse }>(
          '/analysis/dimensions/settings'
        );
        return data.data ?? { dimensions: [], total: 0, maxDimensions: 15 };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * 切换维度可见性 —— **纯乐观更新,不发任何 refetch、不动 matrix 缓存**。
 *
 * 原理:visibility 只影响 UI 是否渲染该列;后端 dimensionHash 由 (key + description)
 * 计算,与 is_hidden 无关,所以 per-paper 分析结果完全可复用。
 *
 * 同步两个缓存:
 *   - `settingsKey`:翻转目标 dim 的 isHidden,让 dialog 立刻显示新状态
 *   - `dimensionsKey`(矩阵的"活跃维度列表"):
 *       hide  → 从 array 移除该 dim → 矩阵列消失
 *       show  → 把 dim 按 sortOrder 插回 array → 矩阵列出现
 *
 * 失败回滚两份快照。成功后**不调 invalidate**,避免无谓的 refetch。
 */
export function useToggleDimensionVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { dimensionKey: string; visible: boolean }) => {
      try {
        const { data } = await http.patch<{ data: DimensionSettingItem }>(
          '/analysis/dimensions/visibility',
          { dimensionKey: vars.dimensionKey, visible: vars.visible }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: settingsKey });
      await qc.cancelQueries({ queryKey: dimensionsKey });

      const prevSettings =
        qc.getQueryData<DimensionSettingsResponse>(settingsKey);
      const prevDimensions =
        qc.getQueryData<AnalysisDimension[]>(dimensionsKey);

      // 1) settings 缓存:翻 isHidden
      if (prevSettings) {
        qc.setQueryData<DimensionSettingsResponse>(settingsKey, {
          ...prevSettings,
          dimensions: prevSettings.dimensions.map((d) =>
            d.dimensionKey === vars.dimensionKey
              ? { ...d, isHidden: !vars.visible }
              : d
          ),
        });
      }

      // 2) 矩阵的活跃维度列表:增 / 删
      if (prevDimensions) {
        if (vars.visible) {
          // 显示:settings 里取完整 dim 数据,按 sortOrder 排序插回
          const dim = prevSettings?.dimensions.find(
            (d) => d.dimensionKey === vars.dimensionKey
          );
          if (dim && !prevDimensions.some((d) => d.dimensionKey === vars.dimensionKey)) {
            const next = [...prevDimensions, dim].sort(
              (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
            );
            qc.setQueryData<AnalysisDimension[]>(dimensionsKey, next);
          }
        } else {
          // 隐藏:从矩阵列表移除
          qc.setQueryData<AnalysisDimension[]>(
            dimensionsKey,
            prevDimensions.filter((d) => d.dimensionKey !== vars.dimensionKey)
          );
        }
      }

      return { prevSettings, prevDimensions };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevSettings) qc.setQueryData(settingsKey, ctx.prevSettings);
      if (ctx?.prevDimensions)
        qc.setQueryData(dimensionsKey, ctx.prevDimensions);
    },
    // 注意:不在 onSettled / onSuccess 里 invalidateQueries 或 removeQueries。
    // 可见性切换完全前端可推导,后端状态成功写入即可,不需要 echo 回 UI。
  });
}

/**
 * 批量重排维度顺序 —— **纯乐观更新,不发任何 refetch、不动 matrix 缓存**。
 *
 * 原理:排序只影响列的展示顺序;dimensionHash 由 (key + description) 计算,
 * 与 sort_order 无关,所以 per-paper 分析完全可复用,矩阵单元格也不需要重新
 * 渲染(只是列的相对位置变了)。
 *
 * 同步两个缓存:
 *   - `settingsKey`:按新顺序重排 + 改写 sortOrder = idx + 1(dialog 立即生效)
 *   - `dimensionsKey`:同样按 orderedKeys 顺序重排活跃维度列表(矩阵列头立即生效)
 *
 * 失败回滚两份快照。成功后**不调 invalidate**。
 *
 * 入参 orderedKeys 是用户当前在设置面板里可见的全部维度,按新顺序排列的 key 列表。
 * 系统维度无 override 时后端会克隆出 override 行记录新 sort_order(只动 user_id>0)。
 */
export function useReorderDimensions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedKeys: string[]) => {
      try {
        await http.patch('/analysis/dimensions/reorder', { orderedKeys });
      } catch (err) {
        throw toApiError(err);
      }
    },
    onMutate: async (orderedKeys) => {
      await qc.cancelQueries({ queryKey: settingsKey });
      await qc.cancelQueries({ queryKey: dimensionsKey });

      const prevSettings =
        qc.getQueryData<DimensionSettingsResponse>(settingsKey);
      const prevDimensions =
        qc.getQueryData<AnalysisDimension[]>(dimensionsKey);

      // 1) settings 缓存:按新顺序重排 + sortOrder = idx + 1
      if (prevSettings) {
        const byKey = new Map(
          prevSettings.dimensions.map((d) => [d.dimensionKey, d])
        );
        const next: DimensionSettingItem[] = [];
        orderedKeys.forEach((k, idx) => {
          const dim = byKey.get(k);
          if (dim) next.push({ ...dim, sortOrder: idx + 1 });
        });
        // 不在 orderedKeys 里的维度(理论上不该有)放到末尾兜底
        for (const d of prevSettings.dimensions) {
          if (!orderedKeys.includes(d.dimensionKey)) next.push(d);
        }
        qc.setQueryData<DimensionSettingsResponse>(settingsKey, {
          ...prevSettings,
          dimensions: next,
        });
      }

      // 2) 矩阵活跃维度列表:仅含 visible 子集,但用同一个 orderedKeys 重新排
      if (prevDimensions) {
        const byKey = new Map(
          prevDimensions.map((d) => [d.dimensionKey, d])
        );
        const next: AnalysisDimension[] = [];
        orderedKeys.forEach((k, idx) => {
          const dim = byKey.get(k);
          if (dim) next.push({ ...dim, sortOrder: idx + 1 });
        });
        qc.setQueryData<AnalysisDimension[]>(dimensionsKey, next);
      }

      return { prevSettings, prevDimensions };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prevSettings) qc.setQueryData(settingsKey, ctx.prevSettings);
      if (ctx?.prevDimensions)
        qc.setQueryData(dimensionsKey, ctx.prevDimensions);
    },
    // 注意:不在 onSettled / onSuccess 里 invalidate 任何东西。
    // 排序结果已经反映在两个缓存里,后端写成功就行,不需要重拉数据。
  });
}

export function useUpsertDimension() {
  // 后端 POST /dimensions = 创建或更新 override(按 dimensionKey 找已有)
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      dimensionKey: string;
      name: string;
      description: string;
      sortOrder?: number;
    }) => {
      try {
        const { data } = await http.post<{ data: DimensionSettingItem }>(
          '/analysis/dimensions',
          {
            dimensionKey: vars.dimensionKey,
            name: vars.name,
            description: vars.description,
            sortOrder: vars.sortOrder ?? 0,
          }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidateDimensions(qc),
  });
}

export function useUpdateUserDimension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id: number;
      name: string;
      description: string;
      sortOrder?: number;
    }) => {
      try {
        const { data } = await http.put<{ data: DimensionSettingItem }>(
          `/analysis/dimensions/${vars.id}`,
          {
            name: vars.name,
            description: vars.description,
            sortOrder: vars.sortOrder ?? 0,
          }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidateDimensions(qc),
  });
}

export function useDeleteUserDimension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      try {
        await http.delete(`/analysis/dimensions/${id}`);
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidateDimensions(qc),
  });
}

/** 重置某系统维度(删除该 dimension_key 的 user override —— 名字/描述/可见性回到系统默认) */
export function useResetDimension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dimensionKey: string) => {
      try {
        await http.delete(
          `/analysis/dimensions/reset/${encodeURIComponent(dimensionKey)}`
        );
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: () => invalidateDimensions(qc),
  });
}
