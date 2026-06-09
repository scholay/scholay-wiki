/**
 * 业务无关的可复用组件 — 比 ui 层更上一层,封装了具体业务模式。
 */
export { BrandLogo } from './BrandLogo';
export { EmptyState } from './EmptyState';
export { ErrorBoundary } from './ErrorBoundary';
export { Footer } from './Footer';
export { IconButton } from './IconButton';
export { ListSkeleton, LoadingState } from './LoadingState';
export { PageHeader } from './PageHeader';
export { TruncatedText, type TruncatedTextProps } from './TruncatedText';
export {
  MembershipPlanCard,
  PLAN_META,
  type MembershipPlanData,
  type MembershipPlanCardProps,
} from './membership-plan-card';
export {
  SubscribeDialog,
  subscribePayMethods,
  type SubscribePayOption,
  type SubscribeDialogProps,
  type SubQuote,
} from './subscribe-dialog';
export {
  ConfirmDialog,
  ConfirmDialogRoot,
  useConfirm,
  type ConfirmOptions,
} from './ConfirmDialog';
// CountBadge / StatusDot 已移到 features/admin/components/SidebarBadges
// (只 admin 用,不属于 shared 通用资产)
export { JournalCover } from './JournalCover';
export { FavoriteBurst } from './FavoriteBurst';
export { RouteSEO } from './RouteSEO';

export {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarHeaderCenter,
  SidebarHeaderIcon,
  SidebarSection,
  SidebarItem,
  SidebarUser,
  SidebarCollapseButton,
  SidebarLayout,
} from './sidebar';
