/**
 * 基础信息状态徽章 + 操作菜单 —— .pen `of4Xd` chip + `LhDOn` 7.1 菜单变体。
 *
 * hover: 弹 6 字段 checklist (.pen `q7c1x7` 6.1)
 * click: 弹操作菜单。菜单恒有两项:
 *   1) 在线关联 / 取消关联 —— **按"是否已关联上游"(link_state)切换, 与基础信息完整度无关**:
 *        - free  (无上游)→ 在线关联   (onRelink, 搜三源关联上游)
 *        - linked(有上游)→ 取消关联   (onUnlink)。**空壳防护**(与后端守卫口径
 *          一致): 仅当 hasOwnSubstance(条目有任一 og_* 本地信息, 或已上传 PDF
 *          —— 看 pdf_uploaded_at/pdf_sha256, 不看在线列 pdf_url)才可点;
 *          否则置灰 —— 仅有在线数据的行取消关联后会变成不含任何信息的空数据。
 *          (旧版曾按 hasOg 置灰 → 一度改为恒可用, 现按"本地信息 或 已上传 PDF"
 *          的新口径加回。)
 *   2) 手动编辑 / 手动填写 —— onEdit (改 og_* 字段; 缺失时文案作"手动填写")
 */

import { FileText, Link2, Pencil, Unlink } from 'lucide-react';
import { getBasicInfoStatus } from '../../../lib/paper-status';
import { hasOwnSubstance } from '../../../lib/pick-field';
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

  // 关联项:按 link_state 决定 在线关联 / 取消关联(不再跟随基础信息完整度)。
  // 取消关联走空壳防护:条目"有自己的东西"(本地信息 / 已上传 PDF)才可取消,
  // 否则置灰 —— 取消后会变成不含任何信息的空数据(口径见 lib/pick-field 的
  // hasOwnSubstance,与后端守卫一致)。
  const canUnlink = hasOwnSubstance(paper);
  const linkItem: ChipMenuItem = isLinked
    ? canUnlink
      ? { icon: Unlink, label: '取消关联', onClick: onUnlink }
      : {
          icon: Unlink,
          label: '取消关联',
          disabled: true,
          hint: '先编辑信息或上传 PDF',
          title: '这条收藏目前只有在线论文的信息,取消关联后会变成空白收藏;先编辑信息或上传 PDF,就可以取消关联',
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
