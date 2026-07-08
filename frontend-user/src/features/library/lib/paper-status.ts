/**
 * 文献集行的状态判定 —— 对应 .pen `q7c1x7` Hover 检查清单变体。
 *
 * 每条 paper 在卡上有两个"状态徽章":基础信息 / PDF。每个徽章 3 态 (灰 / 黄 / 绿):
 *   - complete: 全部字段满足 → 绿
 *   - partial : 部分字段缺   → 黄 ·"异常" 后缀, 鼓励用户补
 *   - missing : 全部空 / 失败 → 灰 ·"缺失" 后缀, 灰色不可点感
 *
 * 字段值统一过 pickField (og 优先 → 元数据 → 空), 与卡片其它位置的展示规则一致。
 */

import type { UserLibraryPaper } from '@/shared/api/types';
import { pickAuthors, pickNumber, pickString } from '@/shared/lib/pick-field';

// ─── 通用 ────────────────────────────────────────────────────────────────────

export type ChipStatus = 'complete' | 'partial' | 'missing';

/** 单个字段的检查项 (hover 清单一行) */
export interface FieldCheckItem {
  /** 字段标签 —— 设计稿固定 6 项: 标题/作者/年份/DOI/期刊/摘要 */
  label: string;
  /** present = ✓ / partial = ⚠ / absent = × */
  state: 'present' | 'partial' | 'absent';
  /** 已有时显示的值预览(标题/作者名等), 缺失时为 undefined */
  preview?: string;
}

// ─── 基础信息状态 ────────────────────────────────────────────────────────────

export interface BasicInfoStatus {
  status: ChipStatus;
  /** 6 字段 checklist, 按 .pen 顺序: 标题/作者/年份/DOI/期刊/摘要 */
  items: FieldCheckItem[];
  /** 弹层 header 文案 */
  headline: string;
  /** 弹层底部颜色注解 */
  footerNote: string;
}

const ABSTRACT_PARTIAL_THRESHOLD = 50; // 摘要 < 50 字视作"部分缺失"

export function getBasicInfoStatus(paper: UserLibraryPaper): BasicInfoStatus {
  const title = pickString(paper.og_title, paper.title);
  const authors = pickAuthors(paper.og_authors, paper.authors);
  const year = pickNumber(paper.og_year, paper.year);
  const doi = pickString(paper.og_doi, paper.doi);
  const venue = pickString(paper.og_venue, paper.venue);
  const abstract = pickString(paper.og_abstract, paper.abstract);

  // 作者预览: 第一个作者名, 多个则附 "等 N 人"
  const authorsPreview = authors.length === 0
    ? undefined
    : authors.length === 1
      ? authors[0].name
      : `${authors[0].name} 等 ${authors.length} 人`;

  // 摘要预览: 字数; < 阈值视作 partial
  const abstractState: FieldCheckItem['state'] =
    abstract.length === 0
      ? 'absent'
      : abstract.length < ABSTRACT_PARTIAL_THRESHOLD
        ? 'partial'
        : 'present';

  const items: FieldCheckItem[] = [
    {
      label: '标题',
      state: title ? 'present' : 'absent',
      preview: title || undefined,
    },
    {
      label: '作者',
      state: authors.length > 0 ? 'present' : 'absent',
      preview: authorsPreview,
    },
    {
      label: '年份',
      state: year ? 'present' : 'absent',
      preview: year ? String(year) : undefined,
    },
    {
      label: 'DOI',
      state: doi ? 'present' : 'absent',
      preview: doi || undefined,
    },
    {
      label: '期刊',
      state: venue ? 'present' : 'absent',
      preview: venue || undefined,
    },
    {
      label: '摘要',
      state: abstractState,
      preview:
        abstract.length > 0
          ? `已补充 · ${abstract.length} 字`
          : undefined,
    },
  ];

  const presentCount = items.filter((i) => i.state === 'present').length;
  const absentCount = items.filter((i) => i.state === 'absent').length;
  const partialCount = items.filter((i) => i.state === 'partial').length;

  let status: ChipStatus;
  let headline: string;
  let footerNote: string;
  if (absentCount === items.length) {
    status = 'missing';
    headline = '还没有任何信息 · 可以手动补全';
    footerNote = '灰 · 缺失';
  } else if (absentCount === 0 && partialCount === 0) {
    status = 'complete';
    headline = '信息完整';
    footerNote = '绿 · 完整';
  } else {
    status = 'partial';
    headline = `部分信息缺失 · 建议补全 (${presentCount}/${items.length})`;
    footerNote = '黄 · 异常';
  }

  return { status, items, headline, footerNote };
}

// ─── PDF 状态 (附件已剔除, 只关心用户上传的主 PDF) ──────────────────────────────

export interface PdfStatus {
  status: ChipStatus;
  /** hover 弹层主行 */
  fileItem: FieldCheckItem;
  headline: string;
  footerNote: string;
}

export function getPdfStatus(paper: UserLibraryPaper): PdfStatus {
  const uploaded = Boolean(paper.pdf_uploaded_at);
  if (uploaded) {
    const sizeMB = paper.pdf_size ? (paper.pdf_size / 1024 / 1024).toFixed(1) : null;
    const preview = [
      paper.pdf_original_filename || '已上传.pdf',
      sizeMB ? `${sizeMB} MB` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return {
      status: 'complete',
      fileItem: { label: 'PDF', state: 'present', preview },
      headline: 'PDF 已上传',
      footerNote: '绿 · 完整',
    };
  }
  return {
    status: 'missing',
    fileItem: { label: 'PDF', state: 'absent', preview: '未上传' },
    headline: '还没有上传 PDF',
    footerNote: '灰 · 缺失',
  };
}
