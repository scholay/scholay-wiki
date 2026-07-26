import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, RotateCcw, X } from 'lucide-react';
import { Switch } from '@/shared/ui/switch';
import { useApiToast } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import {
  useToggleDimensionVisibility,
  type DimensionSettingItem,
} from '../../api/analysis';

/**
 * 维度设置面板单行 —— .pen `F2dBw`(可见)/ `ZDwCS`(隐藏)。
 *
 * 现在多两个能力:
 *   - **左侧 GripVertical 拖拽手柄**(@dnd-kit/sortable),按住拖动重排
 *   - **右侧 Switch**(替代旧的绿勾)切换可见性,语义更明显
 *
 * 拖拽 + 隐藏的语义对三类维度(系统默认 / 用户自定义 / 用户 override 系统):
 *   - 自定义维度:直接更新自己的 user_id>0 行
 *   - override:更新已有 override 行
 *   - 系统无 override:克隆系统行创建 user_id>0 override(永不动 user_id=-1)
 */
interface Props {
  dim: DimensionSettingItem;
  /** 父级控制的编辑标记 —— 这里只用来 hide 按钮(行内容由父决定渲染 EditInlineForm or this) */
  isEditing: boolean;
  onStartEdit: (mode: 'name' | 'prompt') => void;
  onRequestDelete: () => void;
}

function DimensionRowImpl({
  dim,
  isEditing,
  onStartEdit,
  onRequestDelete,
}: Props) {
  const toggleMut = useToggleDimensionVisibility();
  const apiToast = useApiToast();
  const isHidden = !!dim.isHidden;

  // dnd-kit:本组件就是 sortable item;父级 SortableContext 提供 id 数组
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dim.dimensionKey });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isEditing) return null; // 父组件渲染 EditInlineForm 替代本行

  const onToggle = (checked: boolean) => {
    // Switch: checked=true 表示"可见" → 后端 visible=true
    toggleMut.mutate(
      { dimensionKey: dim.dimensionKey, visible: checked },
      { onError: apiToast.onError() }
    );
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 h-[58px] px-2 border-b border-border-soft transition-colors',
        isHidden ? 'bg-surface-1' : 'bg-background hover:bg-surface-1/60',
        isDragging &&'opacity-50 z-raised shadow-raised'
      )}
    >
      {/* 拖拽手柄 —— 鼠标只在此处变 grab,避免和行内其他按钮交互冲突 */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="拖动重排"
        className={cn(
          'inline-flex h-7 w-5 items-center justify-center shrink-0 text-faint transition-colors',
          'cursor-grab active:cursor-grabbing hover:text-foreground touch-none'
        )}
        title="按住拖动以重新排序"
      >
        <GripVertical className="size-3.5" strokeWidth={2} />
      </button>

      {/* 可见性 Switch */}
      <Switch
        checked={!isHidden}
        onCheckedChange={onToggle}
        disabled={toggleMut.isPending}
        aria-label={isHidden ? '已隐藏,点击恢复显示' : '可见,点击隐藏'}
        className="shrink-0"
      />

      {/* 名字 + 描述 */}
      <div className="flex-1 min-w-0 pl-1">
        <div
          className={cn(
            'text-base font-bold truncate',
            isHidden ? 'text-faint' : 'text-foreground'
          )}
        >
          {dim.name}
        </div>
        <div
          className={cn(
            'text-2xs truncate mt-px',
            isHidden ? 'text-faint/70' : 'text-faint'
          )}
        >
          {isHidden
            ? '已隐藏 · 打开右侧开关恢复显示'
            : dim.description || '—'}
        </div>
      </div>

      {/* 编辑按钮 */}
      <button
        type="button"
        onClick={() => onStartEdit('prompt')}
        disabled={isHidden}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-sm shrink-0 transition-colors',
          isHidden
            ? 'bg-surface-2 text-faint cursor-not-allowed'
            : 'bg-surface-2 text-muted-foreground hover:bg-surface-1 hover:text-foreground'
        )}
        title="编辑名称与 AI 提示词"
        aria-label="编辑"
      >
        <Pencil className="size-3" />
      </button>

      {/* 删除 / 重置 —— 系统维度走「重置 override」,自定义维度走「删除」 */}
      <button
        type="button"
        onClick={onRequestDelete}
        disabled={isHidden}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-sm shrink-0 transition-colors',
          isHidden
            ? 'bg-surface-2 text-faint cursor-not-allowed'
            : dim.isSystem && !dim.isCustomized
              ? 'bg-surface-2 text-muted-foreground hover:bg-surface-1 hover:text-foreground'
              : 'bg-danger-soft text-brand-red hover:bg-danger-soft/70'
        )}
        title={
          dim.isSystem
            ? dim.isCustomized
              ? '重置为系统默认'
              : '系统默认维度,不可删除'
            : '删除自定义维度'
        }
        aria-label={dim.isSystem ? '重置' : '删除'}
      >
        {dim.isSystem ? (
          <RotateCcw className="size-3" />
        ) : (
          <X className="size-3" />
        )}
      </button>
    </div>
  );
}

export const DimensionRow = memo(DimensionRowImpl);
