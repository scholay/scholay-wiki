/**
 * 业务无关的可复用组件 — 比 ui 层更上一层,封装了具体业务模式。
 */
export { BrandLogo } from './BrandLogo';
export { EmptyState } from './EmptyState';
export { ErrorBoundary } from './ErrorBoundary';
export { Footer } from './Footer';
export { IconButton } from './IconButton';
export { lazyRoute, RouteFallback } from './LazyRoute';
export { ListSkeleton, LoadingState } from './LoadingState';
export { RhinoRunLoader } from './RhinoRunLoader';
export { PageHeader } from './PageHeader';
export { ResourceError } from './ResourceError';
export { TruncatedText, type TruncatedTextProps } from './TruncatedText';
export {
  MembershipPlanCard,
  BillingCycleToggle,
  PLAN_META,
  planYearlyEnabled,
  planYearlySavings,
  maxYearlySavingsPct,
  monthlyEquivalentCents,
  resolveDefaultCycle,
  yuanText,
  type MembershipPlanData,
  type MembershipPlanCardProps,
  type BillingCycle,
} from './membership-plan-card';
export {
  SubscribeDialog,
  subscribePayMethods,
  type SubscribePayOption,
  type SubscribeDialogProps,
  type SubQuote,
} from './subscribe-dialog';
export { WechatPayDialog, type WechatPayDialogProps } from './wechat-pay-dialog';
export { PayMethodLogo, type PayMethod } from './PayMethodLogo';
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
export { ToastHost } from './ToastHost';

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

export { MembershipActionDialog, type MembershipActionDialogProps } from './membership-action-dialog';
