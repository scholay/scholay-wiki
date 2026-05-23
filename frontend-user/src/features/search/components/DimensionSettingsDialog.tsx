/**
 * 维度设置面板已拆到 ./dimension-settings/ 子目录:
 *   - DimensionSettingsDialog.tsx   主编排者
 *   - DimensionRow.tsx              单行(memo)
 *   - EditInlineForm.tsx            行内编辑(name / prompt 模式)
 *   - AddDimensionForm.tsx          新增表单
 *   - DeleteConfirmDialog.tsx       删除二次确认
 *   - use-save-dimension.ts         共享保存 hook(W6 dedup)
 *
 * 旧 import 路径继续可用。
 */
export { DimensionSettingsDialog } from './dimension-settings/DimensionSettingsDialog';
