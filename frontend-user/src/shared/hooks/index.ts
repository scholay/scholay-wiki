export { useApiToast, type ApiToast } from './useApiToast';
export { useDebounce } from './useDebounce';
export { useSettled } from './useSettled';
export { useThrottledValue } from './useThrottledValue';
export { useHotkey } from './useHotkey';
export { useLocalStorage } from './useLocalStorage';
export { useMediaQuery } from './useMediaQuery';
export { useAfterPageLoad } from './useAfterPageLoad';
export {
  useOpenAuthorInBrowser,
  useOpenJournalInBrowser,
  useOpenPaperInBrowser,
  useOpenPdfInBrowser,
  // 纯路径 helpers + 修饰键守卫 —— <Link to> 的 href 与 SPA navigate 的单一真源
  paperPath,
  authorPath,
  journalPath,
  pdfPath,
  isModifiedClick,
  type OpenInBrowserFn,
} from './useOpenInBrowser';
export {
  useOpenPaperDetail,
  useOpenJournalDetail,
  useOpenAuthorDetail,
  useOpenPdfDetail,
  useOpenPdfChat,
  useIsPdfChatActive,
} from './useOpenInSearchPanel';
export { useReplayPendingAction } from './useReplayPendingAction';
export { useUrlState, usePatchUrlState } from './useUrlState';
export { useScrollRestoration } from './useScrollRestoration';
export { useHeightVar } from './useHeightVar';
export { useHorizontalSwipe } from './useHorizontalSwipe';
export { useDoubleTapFavorite } from './useDoubleTapFavorite';
export { usePullToRefresh } from './usePullToRefresh';
