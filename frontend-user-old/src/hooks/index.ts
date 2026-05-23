/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * 自定义 Hooks 统一导出
 */

export { default as useNetworkStatus } from './useNetworkStatus';
export { useDebounce, useDebouncedCallback } from './useDebounce';
export { default as useSearch } from './useSearch';
export { default as useAuthForm } from './useAuthForm';
export { default as useTranslation, containsChinese, isPrimarilyChinese } from './useTranslation';
export { default as useVersionCheck } from './useVersionCheck';
export { default as usePdfAvailability } from './usePdfAvailability';
export { default as useMessageStream } from './useMessageStream';

// React Query hooks (data fetching layer)
export * from './queries';
