/**
 * 文献集统一导入弹窗的 4 个 tab —— 4 个入口按钮都打开同一个 Dialog,
 * 只是定位在不同 tab。
 *
 *   - 'search':   在线搜索加入(嵌入式搜索 + 一键收藏)
 *   - 'pdf':      本地上传 PDF(智能识别 → 三源关联 / AI 自由文件)
 *   - 'zotero':   从 Zotero 导入(暂占位)
 *   - 'endnote':  从 Endnote 导入(暂占位)
 */
export type ImportTab = 'search' | 'pdf' | 'zotero' | 'endnote';

export const IMPORT_TABS: Array<{ id: ImportTab; label: string; comingSoon?: boolean }> = [
  { id: 'search', label: '在线搜索加入' },
  { id: 'pdf', label: '本地上传' },
  { id: 'zotero', label: 'Zotero 导入', comingSoon: true },
  { id: 'endnote', label: 'Endnote 导入', comingSoon: true },
];
