/**
 * 基础信息状态徽章 + 操作菜单 —— .pen `of4Xd` chip + `LhDOn` 7.1 菜单变体。
 *
 * hover: 弹 6 字段 checklist (.pen `q7c1x7` 6.1)
 * click: 弹操作菜单。菜单恒有两项:
 *   1) 在线关联 / 取消关联 —— **按"是否已关联上游"(link_state)切换, 与基础信息完整度无关**:
 *        - free  (无上游)→ 在线关联   (onRelink, 搜三源关联上游)
 *        - linked(有上游)→ 取消关联   (onUnlink, 清上游元数据只留 og_*)
 *          · 但该行 og_* 全空时置灰:取消后整行为空、页面无法展示。
 *   2) 手动编辑 / 手动填写 —— onEdit (改 og_* 字段; 缺失时文案作"手动填写")
 */

import { FileText, Link2, Pencil, Unlink } from 'lucide-react';
import { getBasicInfoStatus } from '../../../lib/paper-status';
import { hasLocalOverride } from '../../../lib/pick-field';
import type { UserLibraryPaper } from '@/shared/api/types';
import {
  ChipChecklistRow,
  ChipHoverPanel,
  StatusChip,
  type ChipMenuItem,
} from './StatusChip';

interface BasicInfoChipProps {
  paper: UserLibraryPaper;
  /** 打开 EditPaperDialog (手动编辑 / 手动填写 og_* 字段) */
  onEdit: () => void;
  /** 打开 RelinkDialog (在线关联到上游论文) —— free 行用 */
  onRelink: () => void;
  /** 取消关联 (清上游元数据, 退回 free) —— linked 行用 */
  onUnlink: () => void;
}

export function BasicInfoChip({ paper, onEdit, onRelink, onUnlink }: BasicInfoChipProps) {
  const { status, items, headline } = getBasicInfoStatus(paper);

  const isLinked = paper.link_state === 'linked';
  // 有本地保留信息(og_* 任一非空)才允许取消关联 —— 否则取消后整行为空。
  const hasOg = hasLocalOverride(paper);

  // 关联项:按 link_state 决定 在线关联 / 取消关联(不再跟随基础信息完整度)。
  const linkItem: ChipMenuItem = isLinked
    ? {
        icon: Unlink,
        label: '取消关联',
        onClick: onUnlink,
        disabled: !hasOg,
        hint: hasOg ? undefined : '无本地信息',
      }
    : { icon: Link2, label: '在线关联', onClick: onRelink };

  const editItem: ChipMenuItem = {
    icon: Pencil,
    label: status === 'missing' ? '手动填写' : '手动编辑',
    onClick: onEdit,
  };

  const menuItems: ChipMenuItem[] = [linkItem, editItem];

  return (
    <StatusChip
      status={status}
      label="基础信息"
      icon={FileText}
      hoverContent={
        <ChipHoverPanel headline={headline}>
          {items.map((item) => (
            <ChipChecklistRow
              key={item.label}
              state={item.state}
              label={item.label}
              preview={item.preview}
            />
          ))}
        </ChipHoverPanel>
      }
      menuItems={menuItems}
    />
  );
}
