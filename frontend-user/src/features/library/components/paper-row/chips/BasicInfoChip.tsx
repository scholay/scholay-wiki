/**
 * 基础信息状态徽章 + 操作菜单 —— .pen `of4Xd` chip + `LhDOn` 7.1 菜单变体。
 *
 * hover: 弹 6 字段 checklist (.pen `q7c1x7` 6.1)
 * click: 弹操作菜单, 菜单项按 status 切换:
 *   - complete: 手动编辑
 *   - partial : 在线关联 / 手动编辑
 *   - missing : 在线关联 / 手动填写
 *
 * 菜单项点击 → 调对应 callback, 打开既有弹窗:
 *   - 手动编辑 / 手动填写 → onEdit (EditPaperDialog —— 修改 og_* 字段)
 *   - 在线关联             → onRelink (RelinkDialog —— 搜索三源关联到上游)
 */

import { FileText, Link2, Pencil } from 'lucide-react';
import { getBasicInfoStatus } from '../../../lib/paper-status';
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
  /** 打开 RelinkDialog (在线关联到上游论文) */
  onRelink: () => void;
}

export function BasicInfoChip({ paper, onEdit, onRelink }: BasicInfoChipProps) {
  const { status, items, headline, footerNote } = getBasicInfoStatus(paper);

  // 按 status 决定菜单项 —— 见 .pen `LhDOn` 7.1
  const menuItems: ChipMenuItem[] = (() => {
    if (status === 'complete') {
      return [{ icon: Pencil, label: '手动编辑', onClick: onEdit }];
    }
    if (status === 'partial') {
      return [
        { icon: Link2, label: '在线关联', onClick: onRelink },
        { icon: Pencil, label: '手动编辑', onClick: onEdit },
      ];
    }
    // missing
    return [
      { icon: Link2, label: '在线关联', onClick: onRelink },
      { icon: Pencil, label: '手动填写', onClick: onEdit },
    ];
  })();

  return (
    <StatusChip
      status={status}
      label="基础信息"
      icon={FileText}
      hoverContent={
        <ChipHoverPanel headline={headline} footerNote={footerNote} status={status}>
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
