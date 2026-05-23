import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/**
 * 字段对齐 backend/internal/ai/model.go AnalysisDimension。
 * 后端 JSON tag 用 camelCase(dimensionKey/sortOrder/isActive 等),前端 interface 跟着。
 */
export interface AnalysisDimension {
  id: number;
  userId: number;
  dimensionKey: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 后端 `AdminGetSystemDimensions` 返回 `{ dimensions: [...], total: N }` (handler.go:627-637),
 * 不是 `{ items, total }` —— 这里 unwrap dimensions 字段。
 */
export function useDimensions() {
  return useQuery({
    queryKey: ['admin', 'dimensions', 'list'],
    queryFn: async () => {
      const r = await http.get<{ data: { dimensions: AnalysisDimension[]; total: number } }>(
        '/admin/analysis/dimensions',
      );
      return r.data.data.dimensions ?? [];
    },
  });
}

/**
 * 后端 `AdminUpdateSystemDimension` 仅接受 name/description/sortOrder/isActive 四个字段
 * (handler.go:640-668),其它字段 (dimensionKey / isHidden) 不可改:
 *   - dimensionKey 是 AI 调用契约 → 改了破坏存量缓存 hash
 *   - isHidden 是用户个人级 override → 不属于"系统配置"
 */
export interface UpdateDimensionPayload {
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export function useUpdateDimension() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; data: UpdateDimensionPayload }) =>
      http.put(`/admin/analysis/dimensions/${vars.id}`, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'dimensions'] }),
  });
}
