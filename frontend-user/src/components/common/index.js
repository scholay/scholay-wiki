/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * 通用组件统一导出
 */

// 加载组件
export { 
  default as Loading,
  Spinner,
  LoadingText,
  LoadingOverlay,
  ButtonLoading,
  SkeletonLine,
  SkeletonCircle,
} from '../Loading';

// 空状态组件
export {
  default as EmptyState,
  NoResults,
  NoData,
  ErrorState,
} from '../EmptyState';

// 错误边界
export { default as ErrorBoundary } from '../ErrorBoundary';

// 网络状态
export { default as NetworkStatusBar } from '../NetworkStatusBar';

// 分页
export { default as Pagination } from '../Pagination';

// 筛选侧边栏
export { default as FilterSidebar } from '../FilterSidebar';

// 懒加载图片
export { default as LazyImage } from '../LazyImage';

// 骨架屏组件
export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonImage,
  SkeletonButton,
  SkeletonCard,
  SkeletonListItem,
  SkeletonPaperItem,
  SkeletonPaperList,
} from '../Skeleton';

// 论文相关组件
export { default as PaperSummarySection } from '../PaperSummarySection';
export { default as PaperMetaInfo } from '../PaperMetaInfo';
export { default as PaperAuthorsRow } from '../PaperAuthorsRow';
export { default as PaperVenueDate } from '../PaperVenueDate';
export { default as AnalysisCellText } from '../AnalysisCellText';
export { default as PaperListWithPagination } from '../PaperListWithPagination';
export { default as PaperDetailTabs } from '../PaperDetailTabs';

// 搜索相关组件
export { default as SearchForm } from '../SearchForm';
export { default as DimensionSelector } from '../DimensionSelector';

// AI 对话相关组件
export { default as QASection } from '../QASection';
export { default as ChatInputArea } from '../ChatInputArea';
