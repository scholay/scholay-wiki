import type { LucideIcon } from 'lucide-react';
import {
  BookMarked,
  BookOpen,
  FilePenLine,
  Folder,
  Table2,
  ClipboardList,
  Grid3x3,
  FileCheck,
  Mail,
} from 'lucide-react';
import { mockJournals } from '@/mocks/fixtures';
import type { Journal } from '@/shared/api/types';

/**
 * 我的资源 · 四分结构（产品 mock 真源）。
 *
 * 1. 文献集 — 必须以论文为单元
 * 2. 期刊集 — 必须以期刊为单元
 * 3. 稿件集 — 非出版物：站内写作稿 / 审稿上传稿
 * 4. 文件夹 — 通用空间：任意过程产物与上传物
 */

export type ResourceSectionId =
  | 'papers'
  | 'journals'
  | 'manuscripts'
  | 'folders';

export type ResourceItemKind =
  | 'paper'
  | 'journal'
  | 'manuscript'
  | 'dataset'
  | 'questionnaire'
  | 'matrix'
  | 'review-result'
  | 'cover-letter'
  | 'other';

export interface ResourceCollection {
  id: string;
  section: ResourceSectionId;
  name: string;
  description?: string;
  /** 条目数（展示用） */
  itemCount: number;
  isDefault?: boolean;
}

export interface ResourceItem {
  id: string;
  collectionId: string;
  kind: ResourceItemKind;
  title: string;
  subtitle?: string;
  meta?: string;
  updatedAt: string;
  /** 期刊行封面 / 分区徽章用,对应 mock / 上游 journal.id */
  journalId?: number;
}

export const RESOURCE_SECTIONS: Array<{
  id: ResourceSectionId;
  label: string;
  hint: string;
  icon: LucideIcon;
}> = [
  {
    id: 'papers',
    label: '文献集',
    hint: '以论文为单元收藏',
    icon: BookMarked,
  },
  {
    id: 'journals',
    label: '期刊集',
    hint: '以期刊为单元收藏',
    icon: BookOpen,
  },
  {
    id: 'manuscripts',
    label: '稿件集',
    hint: '写作稿与审稿上传稿',
    icon: FilePenLine,
  },
  {
    id: 'folders',
    label: '资源集',
    hint: '通用过程产物与上传物',
    icon: Folder,
  },
];

const TS = '2026-07-28T10:00:00.000Z';

/** 期刊集 · 特殊文件夹 */
export const MOCK_JOURNAL_COLLECTIONS: ResourceCollection[] = [
  {
    id: 'j-target',
    section: 'journals',
    name: '投稿目标',
    description: '近期拟投期刊',
    itemCount: 3,
    isDefault: true,
  },
  {
    id: 'j-watch',
    section: 'journals',
    name: '长期关注',
    description: '领域顶刊与方法刊',
    itemCount: 2,
  },
];

/** 稿件集 · 特殊文件夹 */
export const MOCK_MANUSCRIPT_COLLECTIONS: ResourceCollection[] = [
  {
    id: 'm-writing',
    section: 'manuscripts',
    name: '写作中',
    description: '站内智能写作产生的稿件',
    itemCount: 2,
    isDefault: true,
  },
  {
    id: 'm-review',
    section: 'manuscripts',
    name: '审稿上传',
    description: '上传参与智能审稿的稿件',
    itemCount: 2,
  },
];

/** 通用文件夹 */
export const MOCK_ASSET_COLLECTIONS: ResourceCollection[] = [
  {
    id: 'a-workspace',
    section: 'folders',
    name: '课题工作区',
    description: '任意过程产物与上传物',
    itemCount: 5,
    isDefault: true,
  },
  {
    id: 'a-archive',
    section: 'folders',
    name: '归档材料',
    description: '已结项材料备份',
    itemCount: 1,
  },
];

function journalItem(
  id: string,
  collectionId: string,
  journal: Journal | undefined,
  fallbackTitle: string,
): ResourceItem {
  return {
    id,
    collectionId,
    kind: 'journal',
    journalId: journal?.id,
    title: journal?.canonical_name ?? fallbackTitle,
    subtitle: journal
      ? `IF ${journal.jcr_impact_factor ?? '—'} · ${journal.jcr_quartile ?? 'Q1'}`
      : undefined,
    meta: journal?.publisher,
    updatedAt: TS,
  };
}

export const MOCK_JOURNAL_ITEMS: ResourceItem[] = [
  journalItem('ji-1', 'j-target', mockJournals[0], 'Nature'),
  journalItem('ji-2', 'j-target', mockJournals[1], 'Science'),
  journalItem('ji-3', 'j-target', mockJournals[2], 'JMLR'),
  journalItem(
    'ji-4',
    'j-watch',
    mockJournals.find((j) => j.id === 106),
    'Nature Methods',
  ),
  journalItem(
    'ji-5',
    'j-watch',
    mockJournals.find((j) => j.id === 107),
    'IEEE TPAMI',
  ),
];

export function journalForResourceItem(item: ResourceItem): Journal | undefined {
  if (item.kind !== 'journal' || item.journalId == null) return undefined;
  return mockJournals.find((j) => j.id === item.journalId);
}

/** ShareTarget.collection 需要 number folderId;资源集 id 是字符串,压成稳定正整数。 */
export function collectionShareFolderId(collectionId: string): number {
  let h = 2166136261;
  for (let i = 0; i < collectionId.length; i += 1) {
    h ^= collectionId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1_000_000_000 || 1;
}

export const MOCK_MANUSCRIPT_ITEMS: ResourceItem[] = [
  {
    id: 'mi-1',
    collectionId: 'm-writing',
    kind: 'manuscript',
    title: 'Transformer 可解释性综述 · 初稿',
    subtitle: '来自智能写作 Prism',
    meta: '草稿 · 12 页',
    updatedAt: '2026-07-27T09:00:00.000Z',
  },
  {
    id: 'mi-2',
    collectionId: 'm-writing',
    kind: 'manuscript',
    title: '方法章节 · Attention 可视化实验',
    subtitle: '来自智能写作 Prism',
    meta: '草稿 · 4 页',
    updatedAt: '2026-07-26T14:20:00.000Z',
  },
  {
    id: 'mi-3',
    collectionId: 'm-review',
    kind: 'manuscript',
    title: '投稿前预审 · multimodal agents.pdf',
    subtitle: '上传参与智能审稿',
    meta: 'PDF · 2.1 MB',
    updatedAt: '2026-07-25T11:00:00.000Z',
  },
  {
    id: 'mi-4',
    collectionId: 'm-review',
    kind: 'manuscript',
    title: '修订稿 v3 · 补充误差条说明',
    subtitle: '上传参与智能审稿',
    meta: 'PDF · 1.8 MB',
    updatedAt: '2026-07-24T16:40:00.000Z',
  },
];

/** 通用文件夹样例：数据集 / 问卷 / 矩阵 / 审稿结果 / cover letter */
export const MOCK_ASSET_ITEMS: ResourceItem[] = [
  {
    id: 'ai-1',
    collectionId: 'a-workspace',
    kind: 'dataset',
    title: '可解释性基准数据集 · metrics.xlsx',
    subtitle: '数据集表格',
    meta: 'Excel · 48 行',
    updatedAt: '2026-07-28T08:00:00.000Z',
  },
  {
    id: 'ai-2',
    collectionId: 'a-workspace',
    kind: 'questionnaire',
    title: '专家访谈问卷 · 可解释性需求',
    subtitle: '问卷',
    meta: '12 题 · 进行中',
    updatedAt: '2026-07-27T18:00:00.000Z',
  },
  {
    id: 'ai-3',
    collectionId: 'a-workspace',
    kind: 'matrix',
    title: '方法对照矩阵 · 综述用',
    subtitle: '矩阵分析表格',
    meta: '8×6 格子',
    updatedAt: '2026-07-27T12:00:00.000Z',
  },
  {
    id: 'ai-4',
    collectionId: 'a-workspace',
    kind: 'review-result',
    title: '智能审稿报告 · multimodal agents',
    subtitle: '审稿结果',
    meta: '3 项待处理',
    updatedAt: '2026-07-25T11:30:00.000Z',
  },
  {
    id: 'ai-5',
    collectionId: 'a-workspace',
    kind: 'cover-letter',
    title: 'Cover Letter · Nature Methods',
    subtitle: '投稿附信',
    meta: 'DOCX · 1 页',
    updatedAt: '2026-07-24T09:00:00.000Z',
  },
  {
    id: 'ai-6',
    collectionId: 'a-archive',
    kind: 'other',
    title: '开题答辩 PPT · 备份',
    subtitle: '归档',
    meta: 'PPTX · 24 页',
    updatedAt: '2026-07-20T10:00:00.000Z',
  },
];

export const ITEM_KIND_ICON: Record<ResourceItemKind, LucideIcon> = {
  paper: BookMarked,
  journal: BookOpen,
  manuscript: FilePenLine,
  dataset: Table2,
  questionnaire: ClipboardList,
  matrix: Grid3x3,
  'review-result': FileCheck,
  'cover-letter': Mail,
  other: Folder,
};

export const ITEM_KIND_LABEL: Record<ResourceItemKind, string> = {
  paper: '论文',
  journal: '期刊',
  manuscript: '稿件',
  dataset: '数据集',
  questionnaire: '问卷',
  matrix: '矩阵分析',
  'review-result': '审稿结果',
  'cover-letter': 'Cover Letter',
  other: '其他',
};

export function collectionsForSection(
  section: ResourceSectionId,
): ResourceCollection[] {
  switch (section) {
    case 'journals':
      return MOCK_JOURNAL_COLLECTIONS;
    case 'manuscripts':
      return MOCK_MANUSCRIPT_COLLECTIONS;
    case 'folders':
      return MOCK_ASSET_COLLECTIONS;
    default:
      return [];
  }
}

export function itemsForCollection(
  section: ResourceSectionId,
  collectionId: string,
): ResourceItem[] {
  const pool =
    section === 'journals'
      ? MOCK_JOURNAL_ITEMS
      : section === 'manuscripts'
        ? MOCK_MANUSCRIPT_ITEMS
        : section === 'folders'
          ? MOCK_ASSET_ITEMS
          : [];
  return pool.filter((i) => i.collectionId === collectionId);
}

export function parseResourceSection(
  raw: string | null,
): ResourceSectionId {
  if (
    raw === 'journals' ||
    raw === 'manuscripts' ||
    raw === 'folders' ||
    raw === 'papers'
  ) {
    return raw;
  }
  return 'papers';
}
