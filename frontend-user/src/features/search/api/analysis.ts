/**
 * Analysis API barrel —— 拆成 analysis/dimensions.ts + analysis/matrix.ts。
 * 旧 import 路径 `from '../api/analysis'` 继续可用。
 *
 * 类型从 shared/api/types 单一源 re-export(参见 §3 第 6 条)。
 */

export type {
  AnalysisDimension,
  DimensionSettingItem,
} from '@/shared/api/types';

export {
  useAnalysisDimensions,
  useDimensionSettings,
  useToggleDimensionVisibility,
  useReorderDimensions,
  useUpsertDimension,
  useUpdateUserDimension,
  useDeleteUserDimension,
  useResetDimension,
} from './analysis/dimensions';

export { useMatrixAnalysis, type PaperAnalysisItem } from './analysis/matrix';
