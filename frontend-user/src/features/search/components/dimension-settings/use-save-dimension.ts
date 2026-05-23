import { useCallback } from 'react';
import {
  useUpdateUserDimension,
  useUpsertDimension,
  type DimensionSettingItem,
} from '../../api/analysis';

/**
 * 编辑/添加维度的**统一保存动作**(W6 dedup):
 *
 *   - 系统维度首次自定义 → POST /dimensions(走 upsert,后端按 dimensionKey
 *     找已有 override,没有就建一条)
 *   - 已是用户自定义 → PUT /dimensions/:id
 *   - 全新自定义维度(无 dim) → upsert,前端生成临时 dimensionKey 占位
 *
 * 返回 `save(values)` + `busy` —— EditInlineForm / AddDimensionForm 共用。
 */

export interface SaveValues {
  name: string;
  description: string;
  sortOrder?: number;
}

export interface UseSaveDimensionResult {
  save: (values: SaveValues) => void;
  busy: boolean;
}

export interface UseSaveDimensionOptions {
  /** 编辑已有维度时传入;新增时不传 */
  dim?: DimensionSettingItem;
  /** 新增时:由调用方决定 dimensionKey(通常 `custom_<ts>`) */
  newDimensionKey?: string;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

export function useSaveDimension({
  dim,
  newDimensionKey,
  onSuccess,
  onError,
}: UseSaveDimensionOptions): UseSaveDimensionResult {
  const upsert = useUpsertDimension();
  const updateUser = useUpdateUserDimension();

  const save = useCallback(
    (values: SaveValues) => {
      const payload = {
        name: values.name.trim(),
        description: values.description.trim(),
        sortOrder: values.sortOrder ?? dim?.sortOrder ?? 0,
      };

      const handlers = {
        onSuccess: () => onSuccess?.(),
        onError: (err: unknown) => onError?.(err as Error),
      };

      // 新增:必须给 dimensionKey
      if (!dim) {
        if (!newDimensionKey) {
          onError?.(new Error('missing dimensionKey for new dimension'));
          return;
        }
        upsert.mutate(
          { ...payload, dimensionKey: newDimensionKey },
          handlers
        );
        return;
      }

      // 系统维度首次自定义 → POST(upsert)
      if (dim.isSystem && !dim.isCustomized) {
        upsert.mutate(
          { ...payload, dimensionKey: dim.dimensionKey },
          handlers
        );
        return;
      }

      // 已是 user override → PUT
      updateUser.mutate({ id: dim.id, ...payload }, handlers);
    },
    [dim, newDimensionKey, upsert, updateUser, onSuccess, onError]
  );

  return { save, busy: upsert.isPending || updateUser.isPending };
}
