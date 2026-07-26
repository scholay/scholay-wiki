import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { useApiToast } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import {
  useDimensionSettings,
  useReorderDimensions,
  type DimensionSettingItem,
} from '../../api/analysis';
import { AddDimensionForm } from './AddDimensionForm';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { DimensionRow } from './DimensionRow';
import { EditInlineForm } from './EditInlineForm';

/**
 * 维度设置面板编排者 —— 对应 .pen `Lsm7K / ng0vx / DO9WX / PE0Ah`。
 *
 *  上 ─ Header(标题 + 关闭)
 *  中 ─ Sub-header(计数 "共 N 个维度 · M 个可见")
 *  中 ─ Rows:DimensionRow 或编辑态 EditInlineForm 二选一
 *  中 ─ AddDimensionForm 展开 / + 添加新维度按钮
 *  叠加 ─ DeleteConfirmDialog(二次确认)
 *
 * **隐藏一个系统维度走 override 模式** —— 后端创建 user_id>0 副本并把
 * `is_hidden=true`,永不修改 user_id=-1 系统行。
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type EditMode = { key: string; mode: 'name' | 'prompt' } | null;

export function DimensionSettingsDialog({ open, onOpenChange }: Props) {
  const { data, isLoading, error } = useDimensionSettings();
  const dimensions = data?.dimensions ?? [];
  const maxDimensions = data?.maxDimensions ?? 15;
  const visibleCount = dimensions.filter(
    (d) => !d.isHidden && d.isActive !== false
  ).length;

  const [editing, setEditing] = useState<EditMode>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] =
    useState<DimensionSettingItem | null>(null);

  const reorderMut = useReorderDimensions();
  const apiToast = useApiToast();
  // 拖拽 5px 才触发,避免和点击 Switch / Edit / Delete 等行内按钮冲突
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = dimensions.findIndex(
        (d) => d.dimensionKey === active.id
      );
      const newIndex = dimensions.findIndex(
        (d) => d.dimensionKey === over.id
      );
      if (oldIndex < 0 || newIndex < 0) return;
      // 计算新顺序的 key 数组
      const next = [...dimensions];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      const orderedKeys = next.map((d) => d.dimensionKey);
      reorderMut.mutate(orderedKeys, {
        onError: apiToast.onError(),
      });
    },
    [dimensions, reorderMut, apiToast]
  );

  const sortableIds = useMemo(
    () => dimensions.map((d) => d.dimensionKey),
    [dimensions]
  );

  // 关闭 dialog 时清掉所有就地态
  useEffect(() => {
    if (!open) {
      setEditing(null);
      setAdding(false);
      setConfirmDelete(null);
    }
  }, [open]);

  // 自定义维度数(不算系统覆盖)—— 用于 "已达上限" 判断
  const customCount = useMemo(
    () => dimensions.filter((d) => !d.isSystem).length,
    [dimensions]
  );
  const atMax = customCount >= maxDimensions;

  // 稳定回调,row 是 memo 化的
  const startEdit = useCallback(
    (key: string, mode: 'name' | 'prompt') => setEditing({ key, mode }),
    []
  );
  const endEdit = useCallback(() => setEditing(null), []);
  const requestDelete = useCallback(
    (dim: DimensionSettingItem) => setConfirmDelete(dim),
    []
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="p-0 gap-0 max-w-[420px] w-[420px] max-h-[85vh] flex flex-col overflow-hidden">
          <header className="flex items-center h-13 px-[18px] border-b border-border-soft shrink-0">
            <DialogTitle className="text-md font-bold text-foreground">
              维度设置
            </DialogTitle>
          </header>

          <div className="flex items-center h-[34px] px-[18px] bg-surface-1 border-b border-border-soft text-xs text-faint shrink-0">
            {isLoading ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" />
                加载中…
              </span>
            ) : (
              `共 ${dimensions.length} 个维度 · ${visibleCount} 个可见`
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            {error && (
              <div className="px-[18px] py-4 text-xs text-brand-red">
                维度列表暂时没能加载出来,请稍后重试
              </div>
            )}
            {!isLoading && dimensions.length === 0 && !error && (
              <div className="px-[18px] py-8 text-center text-xs text-muted-foreground">
                还没有任何维度,点上方按钮新建一个
              </div>
            )}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortableIds}
                strategy={verticalListSortingStrategy}
              >
                {dimensions.map((dim) => {
                  const isEditing = editing?.key === dim.dimensionKey;
                  return (
                    <div key={dim.dimensionKey}>
                      {isEditing ? (
                        <EditInlineForm
                          dim={dim}
                          mode={editing!.mode}
                          onDone={endEdit}
                        />
                      ) : (
                        <DimensionRow
                          dim={dim}
                          isEditing={false}
                          onStartEdit={(m) => startEdit(dim.dimensionKey, m)}
                          onRequestDelete={() => requestDelete(dim)}
                        />
                      )}
                    </div>
                  );
                })}
              </SortableContext>
            </DndContext>

            {adding ? (
              <AddDimensionForm
                disabled={atMax}
                onCancel={() => setAdding(false)}
                onCreated={() => setAdding(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                disabled={atMax}
                className={cn(
                  'flex items-center gap-2 w-full h-13 px-[18px] bg-surface-1 text-sm font-bold transition-colors',
                  atMax
                    ? 'text-faint cursor-not-allowed'
                    : 'text-brand-red hover:bg-surface-2'
                )}
                title={
                  atMax ? `已达上限(${maxDimensions} 个)` : '添加新维度'
                }
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-pill bg-brand-red text-on-brand">
                  <Plus className="size-3.5" strokeWidth={3} />
                </span>
                {atMax ? `已达上限 ${maxDimensions} 个` : '添加新维度'}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        target={confirmDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </>
  );
}
