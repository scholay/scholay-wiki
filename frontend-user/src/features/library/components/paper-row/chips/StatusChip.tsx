/**
 * StatusChip —— 文件夹内论文卡片的状态徽章原子组件。对应 .pen `of4Xd` chip + `LhDOn` 操作菜单 +
 * `q7c1x7` hover 检查清单。
 *
 *   complete:  绿色描边 + 绿色文本 + chevron
 *   partial :  黄色描边 + 黄色文本 + "·异常" 后缀 + chevron
 *   missing :  灰色描边 + 灰色文本 + "·缺失" 后缀 + chevron
 *
 * 三种交互(同一 chip):
 *   1) hover 整体 chip → 弹检查清单 (hoverContent, q7c1x7)
 *   2) click 整体 chip → 弹操作菜单 (menuItems, LhDOn)
 *   3) 菜单项 click → 调对应 onClick (打开 EditPaperDialog / RelinkDialog / PdfUploadDialog)
 *
 * Hover + Click 用 Radix 双 Root 嵌套同 trigger; menu open 时 suppress hover card 避免叠层。
 *
 * 注: 设计稿原稿在 label 后有 "| ✓" 视觉装饰, 用户反馈"不应该有这个对号", 已删。
 */

import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/shared/ui/hover-card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { cn } from '@/shared/lib/utils';
import {
  STATUS_CHIP_SHELL,
  STATUS_CHIP_TONE,
} from '@/shared/components/status-chip-styles';
import type { ChipStatus } from '../../../lib/paper-status';

export interface ChipMenuItem {
  /** 菜单项左侧 icon */
  icon?: LucideIcon;
  /** 主标签 */
  label: string;
  /** 右侧附加说明 (例如 "敬请期待" 灰文) */
  hint?: string;
  /** 原生 title tooltip —— hint 放不下的长说明(如 disabled 原因)用这里 */
  title?: string;
  /** 点击行为; 未传 + disabled=true 时是"即将开放"占位项 */
  onClick?: () => void;
  /** 灰态(不可点) */
  disabled?: boolean;
}

interface StatusChipProps {
  status: ChipStatus;
  /** 主标签, 例如 "基础信息" / "PDF" */
  label: string;
  /** 主 icon, 出现在 label 左侧 */
  icon?: LucideIcon;
  /** hover popover 内容 (检查清单) */
  hoverContent: React.ReactNode;
  /** click 弹的操作菜单条目 */
  menuItems: ChipMenuItem[];
}

/** label 上根据 status 追加后缀: "基础信息" → "基础信息·异常" / "·缺失" */
function labelWithSuffix(label: string, status: ChipStatus): string {
  if (status === 'partial') return `${label}·待补全`;
  if (status === 'missing') return `${label}·缺失`;
  return label;
}

const TONE_CLASSES = STATUS_CHIP_TONE;

export function StatusChip({
  status,
  label,
  icon: Icon,
  hoverContent,
  menuItems,
}: StatusChipProps) {
  // 控制操作菜单 Popover —— 不开 = 允许 hover card; 开 = suppress hover card 防叠层
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <HoverCard
        // menu 开时强制关 hover card; menu 没开时让 HoverCard 自己管 (undefined)
        open={menuOpen ? false : undefined}
        openDelay={180}
        closeDelay={120}
      >
        <HoverCardTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              // 按设计 .pen `of4Xd` 的 chip:
              //   h-7 (28px), px-2.5 圆角 sm, 内部 gap-1.5; 1px 边框
              //   字号 12, 描边/文字色按 tone 切
              className={cn(STATUS_CHIP_SHELL, TONE_CLASSES[status])}
            >
              {Icon && <Icon className="size-3" strokeWidth={2} />}
              <span className="text-12 font-medium whitespace-nowrap">
                {labelWithSuffix(label, status)}
              </span>
              {/* chevron 表示"可看明细 / 可点出菜单" */}
              <ChevronDown
                className={cn(
                  'size-3 opacity-60 transition-transform',
                  menuOpen && 'rotate-180'
                )}
                strokeWidth={2}
              />
            </button>
          </PopoverTrigger>
        </HoverCardTrigger>

        {/* HoverCard: 检查清单 (hover-only)。
            w-[300px] / 下面的 w-[220px]:弹层宽 token 只有 200/280/360 三档,两者都不等值;
            300 是 --rail-w-md 的值但那是「右侧信息栏」语义,套在 hover 卡上是误用。
            留待弹层宽统一收口时定档,不在本次等值收口范围内。 */}
        <HoverCardContent align="start" sideOffset={6} className="w-[300px] p-0">
          {hoverContent}
        </HoverCardContent>
      </HoverCard>

      {/* Popover: 操作菜单 (click-only) */}
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[220px] p-1"
      >
        <ChipMenuList items={menuItems} onItemClick={() => setMenuOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

// ─── 操作菜单列表 ────────────────────────────────────────────────────────────

interface ChipMenuListProps {
  items: ChipMenuItem[];
  onItemClick?: () => void;
}

export function ChipMenuList({ items, onItemClick }: ChipMenuListProps) {
  return (
    <div className="flex flex-col">
      {items.map((item, i) => {
        const Icon = item.icon;
        const isDisabled = item.disabled || !item.onClick;
        return (
          <button
            key={i}
            type="button"
            disabled={isDisabled}
            title={item.title}
            onClick={() => {
              if (isDisabled) return;
              item.onClick?.();
              onItemClick?.();
            }}
            className={cn(
              'flex items-center gap-2 h-8 px-2 rounded-8 text-12 text-subtle transition-colors text-left',
              isDisabled
                ? 'opacity-50 cursor-not-allowed text-faint'
                : 'hover:bg-surface-1 hover:text-foreground'
            )}
          >
            {Icon && <Icon className="size-3.5 shrink-0" strokeWidth={2} />}
            <span className="flex-1 truncate">{item.label}</span>
            {item.hint && (
              <span className="text-12 text-faint shrink-0">{item.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── HoverCard 内容的统一壳 —— 子 chip 复用 ─────────────────────────────────

interface ChipHoverPanelProps {
  /** 顶部说明文案, 例如 "已检查 · 全部字段已补全" */
  headline: string;
  /** 主体 (字段 checklist) */
  children: React.ReactNode;
}

export function ChipHoverPanel({ headline, children }: ChipHoverPanelProps) {
  return (
    <div className="flex flex-col">
      <div className="px-4 pt-3 pb-2 border-b border-border-soft">
        <div className="text-12 text-muted-foreground">{headline}</div>
      </div>
      <div className="px-4 py-3 space-y-2">{children}</div>
    </div>
  );
}

// ─── 单个 checklist 行 —— 6 字段共用 ────────────────────────────────────────

interface ChipChecklistRowProps {
  state: 'present' | 'partial' | 'absent';
  label: string;
  preview?: string;
}

export function ChipChecklistRow({ state, label, preview }: ChipChecklistRowProps) {
  return (
    <div className="grid grid-cols-[16px_56px_1fr] items-center gap-2 text-12">
      <div className="flex items-center justify-center">
        {state === 'present' && <Check className="size-3 text-brand-green" strokeWidth={2.5} />}
        {state === 'partial' && (
          <span className="text-brand-amber text-12" aria-hidden>
            ⚠
          </span>
        )}
        {state === 'absent' && (
          <span className="text-faint text-12" aria-hidden>
            ×
          </span>
        )}
      </div>
      <span
        className={cn(
          'font-medium',
          state === 'absent' ? 'text-faint' : 'text-foreground'
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'truncate',
          state === 'absent' ? 'text-faint italic' : 'text-muted-foreground'
        )}
        title={preview}
      >
        {state === 'absent' ? '暂无' : preview ?? '—'}
      </span>
    </div>
  );
}
