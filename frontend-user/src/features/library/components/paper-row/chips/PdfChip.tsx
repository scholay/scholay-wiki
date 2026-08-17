/**
 * PDF 状态徽章 + 操作菜单 —— .pen `of4Xd` chip + `LhDOn` 7.3 菜单变体。
 * (附件 / 评级已剔除, 只关心主 PDF)
 *
 * hover: 弹 PDF 信息 (.pen `q7c1x7` 6.3)
 * click: 弹操作菜单, 按 status 切换:
 *   - complete (已上传): 查看 PDF / 更换 PDF / 社区求助(敬请期待 disabled)
 *   - missing  (未上传): 本地上传 / 打开在线全文(有 OA 直链时可点)/ 社区求助(敬请期待 disabled)
 */

import { ExternalLink, Eye, File as FileIcon, Search, Upload, Users } from 'lucide-react';
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
  onViewPdf: () => void;
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
    const onlineUrl = paper.pdf_url?.trim();
    return [
      { icon: Upload, label: '本地上传', onClick: onUploadPdf },
      onlineUrl
        ? {
            icon: ExternalLink,
            label: '打开在线全文',
            onClick: () => window.open(onlineUrl, '_blank', 'noopener,noreferrer'),
          }
        : { icon: Search, label: '在线查找', hint: '敬请期待', disabled: true },
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
