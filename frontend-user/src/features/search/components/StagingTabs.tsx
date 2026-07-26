import { memo } from 'react';
import { Plus } from 'lucide-react';
import { FIXED_AREA_NAMES, MAX_AREAS } from '@/stores/staging-areas.store';
import { cn } from '@/shared/lib/utils';
import { useStagingActions } from '../hooks/useStagingActions';
import { useStagingView, type FacadeArea } from '../hooks/useStagingView';

/**
 * 暂存区 tab 条 —— 对齐 .pen `huxey`,产品语义:
 *   - 5 个固定分区,名字按位置依次是 A B C D E,**用户不可改名 / 不可删除**
 *   - 没有 X 关闭按钮(只能"清空"内部 papers,不能删 area 本身)
 *   - "清空之后切换到其他分区,空的分区自动消失" —— 这逻辑在
 *     useStagingActions.setActive 里实现:切换时若旧 active 区空 → 后台 delete
 *   - 右侧 "+" 按钮:areas < 5 才显示;areas == 5 直接隐藏(不再 disabled 也不显示 N/5)
 *   - tabs 横向滚动,垂直方向 hidden(防止激活下划线 -bottom-px 误触发 y scrollbar)
 */
export function StagingTabs() {
  const { areas, activeId } = useStagingView();
  const { setActive, createArea } = useStagingActions();

  const atMax = areas.length >= MAX_AREAS;

  return (
    <div
      className="flex items-center justify-between gap-2 h-9 px-3 bg-surface-card border-b border-border shrink-0"
      role="tablist"
      aria-label="暂存区"
    >
      <div className="flex items-center gap-1 h-full min-w-0 overflow-x-auto overflow-y-hidden">
        {areas.map((area, idx) => (
          <TabItem
            key={area.id}
            area={area}
            displayName={FIXED_AREA_NAMES[idx] ?? area.name}
            active={area.id === activeId}
            onActivate={setActive}
          />
        ))}
      </div>

      {/* 达 5 上限时整个 + 按钮消失(不再 disabled 占位也不显示 N/5) */}
      {!atMax && (
        <button
          type="button"
          aria-label="新建暂存区"
          title="新建暂存区"
          onClick={() => createArea()}
          className="inline-flex h-6 w-6 items-center justify-center rounded-8 border border-border-strong text-subtle hover:bg-surface-1 hover:text-foreground transition-colors shrink-0"
        >
          <Plus className="size-3" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

// ============================================================================
// 单个 tab —— 简化:固定字母名 + 数量 badge + 红下划线;无 X 无编辑
// ============================================================================

interface TabItemProps {
  area: FacadeArea;
  displayName: string;
  active: boolean;
  onActivate: (id: string) => void;
}

const TabItem = memo(function TabItem({
  area,
  displayName,
  active,
  onActivate,
}: TabItemProps) {
  return (
    <div
      role="tab"
      aria-selected={active}
      onClick={() => onActivate(area.id)}
      className={cn(
        'group relative inline-flex items-center gap-1.5 h-full px-2.5 shrink-0 cursor-pointer transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-subtle'
      )}
    >
      <span
        className={cn(
          'text-12 tabular-nums',
          active ? 'font-medium' : 'font-normal'
        )}
      >
        {displayName}
      </span>

      {/* 数字 badge —— pill 圆角,激活态红底白字 */}
      <span
        className={cn(
          'inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-pill text-12 font-medium shrink-0 tabular-nums',
          active
            ? 'bg-brand-red text-on-brand'
            : 'bg-surface-2 text-muted-foreground'
        )}
      >
        {area.papers.length}
      </span>

      {/* 激活下划线 —— .pen huxey 中的红色 bottom border 2px */}
      {active && (
        <span
          aria-hidden
          className="absolute left-2 right-2 -bottom-px h-[2px] bg-brand-red rounded-pill"
        />
      )}
    </div>
  );
});
