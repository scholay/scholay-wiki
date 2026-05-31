/**
 * PDF 状态徽章 + 操作菜单 —— .pen `of4Xd` chip + `LhDOn` 7.3 菜单变体。
 * (附件 / 评级已剔除, 只关心主 PDF)
 *
 * hover: 弹 PDF 信息 (.pen `q7c1x7` 6.3)
 * click: 弹操作菜单, 按 status 切换:
 *   - complete (已上传): 查看 PDF / 更换 PDF / 社区求助(敬请期待 disabled)
 *   - missing  (未上传): 本地上传 / 在线查找(敬请期待 disabled) / 社区求助(敬请期待 disabled)
 *
 * 菜单项点击 → 对应 callback:
 *   - 查看 PDF  → onViewPdf  (useOpenPdfInBrowser)
 *   - 更换 PDF  → onUploadPdf (PdfUploadDialog)
 *   - 本地上传  → onUploadPdf (同上, 文案不同)
 *   - 在线查找  → 暂未支持
 *   - 社区求助  → 暂未支持
 */

import { Eye, File as FileIcon, Search, Upload, Users } from 'lucide-react';
import { getPdfStatus } from '../../../lib/paper-status';
import type { UserLibraryPaper } from '@/shared/api/types';
import {
  ChipChecklistRow,
  ChipHoverPanel,
  StatusChip,
  type ChipMenuItem,
} from './StatusChip';

interface PdfChipProps {
  paper: UserLibraryPaper;
  /** 在 PDF 浏览器 tab 打开当前 PDF (useOpenPdfInBrowser) */
  onViewPdf: () => void;
  /** 上传 / 更换 PDF (PdfUploadDialog) */
  onUploadPdf: () => void;
}

export function PdfChip({ paper, onViewPdf, onUploadPdf }: PdfChipProps) {
  const { status, fileItem, headline } = getPdfStatus(paper);

  const menuItems: ChipMenuItem[] = (() => {
    if (status === 'complete') {
      return [
        { icon: Eye, label: '查看 PDF', onClick: onViewPdf },
        { icon: Upload, label: '更换 PDF', onClick: onUploadPdf },
        { icon: Users, label: '社区求助', hint: '敬请期待', disabled: true },
      ];
    }
    // missing
    return [
      { icon: Upload, label: '本地上传', onClick: onUploadPdf },
      { icon: Search, label: '在线查找', hint: '敬请期待', disabled: true },
      { icon: Users, label: '社区求助', hint: '敬请期待', disabled: true },
    ];
  })();

  return (
    <StatusChip
      status={status}
      label="PDF"
      icon={FileIcon}
      hoverContent={
        <ChipHoverPanel headline={headline}>
          <ChipChecklistRow
            state={fileItem.state}
            label={fileItem.label}
            preview={fileItem.preview}
          />
        </ChipHoverPanel>
      }
      menuItems={menuItems}
    />
  );
}
