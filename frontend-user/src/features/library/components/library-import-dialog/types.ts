import type { ParsedEvent, SearchHit } from '../../api/upload-resolve';

/**
 * 文献集统一工作台 · 「添加」语境的 4 个 tab —— 4 个入口按钮都打开同一个工作台,
 * 只是定位在不同 tab。
 *
 *   - 'search':   在线搜索加入(嵌入式搜索 + 一键收藏)
 *   - 'pdf':      本地上传 PDF(智能识别 → 三源关联 / 自由文件)
 *   - 'zotero':   从 Zotero 导入(暂占位)
 *   - 'endnote':  从 EndNote 导入(暂占位)
 */
export type ImportTab = 'search' | 'pdf' | 'zotero' | 'endnote';

export const IMPORT_TABS: Array<{ id: ImportTab; label: string; comingSoon?: boolean }> = [
  { id: 'search', label: '在线搜索加入' },
  { id: 'pdf', label: '本地上传' },
  { id: 'zotero', label: 'Zotero 导入', comingSoon: true },
  { id: 'endnote', label: 'EndNote 导入', comingSoon: true },
];

// ─── PDF 上传向导状态机(原 pdf-import-wizard/types.ts,目录已并入这里) ──────

// 注:SSE 的 parsed 事件直接把 phase 置 'searching'(指纹完成即开检索),
// 不存在独立的 'parsed' 档。
export type ParsingPhase = 'uploading' | 'searching' | 'done';

/**
 * 三态:upload(起点)→ parsing(SSE 解析+检索)→ decide(确认匹配)。
 * decide 选定后立即 confirm 入库,然后工作台原地切到该行的「管理」语境继续完善
 * (原独立的 fill 填写步已统一为管理语境的「元数据」面板)。
 */
export type WizardStep =
  | { kind: 'upload' }
  | { kind: 'parsing'; file: File; phase: ParsingPhase }
  | {
      kind: 'decide';
      file: File;
      parsed: ParsedEvent | null;
      searchHits: SearchHit[];
      jobId: string;
    };
