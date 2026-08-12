import type { ComponentType } from "react";
import type { WikiEmbedId } from "../types";
import { WikiEmbedAcademicIntelDetail } from "./WikiEmbedAcademicIntelDetail";
import { WikiEmbedAcademicIntelList } from "./WikiEmbedAcademicIntelList";
import { WikiEmbedAccountAssets } from "./WikiEmbedAccountAssets";
import { WikiEmbedAccountConnections } from "./WikiEmbedAccountConnections";
import { WikiEmbedAccountSecurity } from "./WikiEmbedAccountSecurity";
import {
  WikiEmbedAdminModelBindings,
  WikiEmbedAdminModelCatalog,
  WikiEmbedAdminAnalysisDimensions,
  WikiEmbedAdminNewsWebhook,
  WikiEmbedAdminThirdPartyAccounts,
  WikiEmbedAdminWechatOfficial,
} from "./WikiEmbedAdminAiIntegrations";
import {
  WikiEmbedAdminAnalyticsSetup,
  WikiEmbedAdminBillingConfiguration,
  WikiEmbedAdminFeatureUsage,
  WikiEmbedAdminSiteAnalytics,
  WikiEmbedAdminTokenCost,
} from "./WikiEmbedAdminAnalytics";
import {
  WikiEmbedAdminAnnouncements,
  WikiEmbedAdminCampaignsPromo,
  WikiEmbedAdminHotContent,
  WikiEmbedAdminJournalSync,
  WikiEmbedAdminMessaging,
  WikiEmbedAdminSkillModeration,
  WikiEmbedAdminToolOperations,
} from "./WikiEmbedAdminContent";
import {
  WikiEmbedAdminDeliveryLogs,
  WikiEmbedAdminFeedback,
  WikiEmbedAdminInviteAnalytics,
  WikiEmbedAdminMailSupport,
  WikiEmbedAdminSessionMonitoring,
  WikiEmbedAdminSupportConfig,
} from "./WikiEmbedAdminOperations";
import {
  WikiEmbedAdminAccessControl,
  WikiEmbedAdminConsole,
  WikiEmbedAdminDashboard,
} from "./WikiEmbedAdminOverview";
import {
  WikiEmbedAdminCodeSnippets,
  WikiEmbedAdminOAuthConfig,
  WikiEmbedAdminPaymentMerchants,
  WikiEmbedAdminSystemConfig,
  WikiEmbedAdminWechatPay,
} from "./WikiEmbedAdminSystem";
import {
  WikiEmbedAdminEntitlementGrants,
  WikiEmbedAdminGiftCodes,
  WikiEmbedAdminOrders,
  WikiEmbedAdminUserDirectory,
  WikiEmbedAdminUserLifecycle,
} from "./WikiEmbedAdminUsers";
import {
  WikiEmbedAuthDialog,
  WikiEmbedForgotPasswordEmail,
} from "./WikiEmbedAuthDialog";
import { WikiEmbedAuthorProfile } from "./WikiEmbedAuthorProfile";
import { WikiEmbedCitationDialog } from "./WikiEmbedCitationDialog";
import { WikiEmbedCitationGenerator } from "./WikiEmbedCitationGenerator";
import { WikiEmbedCitationGraphPreview } from "./WikiEmbedCitationGraphPreview";
import { WikiEmbedBillingOrders } from "./WikiEmbedBillingOrders";
import { WikiEmbedClassicSearchDock } from "./WikiEmbedClassicSearchDock";
import { WikiEmbedClassicSearchFilters } from "./WikiEmbedClassicSearchFilters";
import { WikiEmbedClawContextComposer } from "./WikiEmbedClawContextComposer";
import { WikiEmbedClawEmptyState } from "./WikiEmbedClawEmptyState";
import { WikiEmbedClawHeroEntry } from "./WikiEmbedClawHeroEntry";
import { WikiEmbedClawRunStates } from "./WikiEmbedClawRunStates";
import { WikiEmbedClawSessionHistory } from "./WikiEmbedClawSessionHistory";
import { WikiEmbedClawWorkspace } from "./WikiEmbedClawWorkspace";
import { WikiEmbedCommunitySkill } from "./WikiEmbedCommunitySkill";
import { WikiEmbedComposerAttachments } from "./WikiEmbedComposerAttachments";
import { WikiEmbedContactSupport } from "./WikiEmbedContactSupport";
import { WikiEmbedFeaturePlaza } from "./WikiEmbedFeaturePlaza";
import { WikiEmbedFeedbackForm } from "./WikiEmbedFeedbackForm";
import { WikiEmbedFolderIconPicker } from "./WikiEmbedFolderIconPicker";
import { WikiEmbedHelpCenter } from "./WikiEmbedHelpCenter";
import { WikiEmbedHelpContentDetail } from "./WikiEmbedHelpContentDetail";
import {
  WikiEmbedInviteCodeField,
  WikiEmbedInviteCodePrompt,
} from "./WikiEmbedInviteRegistration";
import { WikiEmbedInviteShare } from "./WikiEmbedInviteShare";
import { WikiEmbedJournalDetail } from "./WikiEmbedJournalDetail";
import { WikiEmbedJournalDirectory } from "./WikiEmbedJournalDirectory";
import { WikiEmbedJournalSearch } from "./WikiEmbedJournalSearch";
import { WikiEmbedLibraryShareReceive } from "./WikiEmbedLibraryShareReceive";
import { WikiEmbedLiteratureLibrary } from "./WikiEmbedLiteratureLibrary";
import { WikiEmbedMatrixWorkspace } from "./WikiEmbedMatrixWorkspace";
import { WikiEmbedMembershipPlans } from "./WikiEmbedMembershipPlans";
import { WikiEmbedMobileAcademicIntel } from "./WikiEmbedMobileAcademicIntel";
import { WikiEmbedMobileAuthSurfaces } from "./WikiEmbedMobileAuthSurfaces";
import { WikiEmbedMobileClaw } from "./WikiEmbedMobileClaw";
import { WikiEmbedMobileFeed } from "./WikiEmbedMobileFeed";
import { WikiEmbedMobileJournalFeed } from "./WikiEmbedMobileJournalFeed";
import { WikiEmbedMobileLibraryFlow } from "./WikiEmbedMobileLibraryFlow";
import { WikiEmbedMobileMe } from "./WikiEmbedMobileMe";
import { WikiEmbedMobileSearch } from "./WikiEmbedMobileSearch";
import { WikiEmbedMobileMembershipPurchase } from "./WikiEmbedMobileMembershipPurchase";
import { WikiEmbedMobileTools } from "./WikiEmbedMobileTools";
import {
  WikiEmbedMobileAuthPage,
  WikiEmbedMobileConnectionSettings,
  WikiEmbedMobileLibraryFolder,
  WikiEmbedMobileProfileSettings,
  WikiEmbedMobileSecuritySettings,
} from "./WikiEmbedMobileTruthSurfaces";
import { WikiEmbedNotificationInbox } from "./WikiEmbedNotificationInbox";
import { WikiEmbedOAuthAccountMerge } from "./WikiEmbedOAuthAccountMerge";
import {
  WikiEmbedOAuthCallbackStates,
  WikiEmbedWechatCallbackState,
} from "./WikiEmbedOAuthCallbackStates";
import { WikiEmbedPaperDetail } from "./WikiEmbedPaperDetail";
import { WikiEmbedPaperFavoriteFlow } from "./WikiEmbedPaperFavoriteFlow";
import { WikiEmbedPdfChatWorkspace } from "./WikiEmbedPdfChatWorkspace";
import { WikiEmbedPdfReader } from "./WikiEmbedPdfReader";
import { WikiEmbedPdfResolve } from "./WikiEmbedPdfResolve";
import { WikiEmbedPeerReviewEntry } from "./WikiEmbedPeerReviewEntry";
import { WikiEmbedPeerReviewEditorialCheck } from "./WikiEmbedPeerReviewEditorialCheck";
import { WikiEmbedPeerReviewProgress } from "./WikiEmbedPeerReviewProgress";
import { WikiEmbedPeerReviewReport } from "./WikiEmbedPeerReviewReport";
import { WikiEmbedPeerReviewResultOverview } from "./WikiEmbedPeerReviewResultOverview";
import { WikiEmbedPeerReviewWizard } from "./WikiEmbedPeerReviewWizard";
import { WikiEmbedPrismCompileStates } from "./WikiEmbedPrismCompileStates";
import { WikiEmbedPrismHome } from "./WikiEmbedPrismHome";
import {
  WikiEmbedPrismLivePreview,
  WikiEmbedPrismMathEditorDialog,
  WikiEmbedPrismNumbersDialog,
  WikiEmbedPrismRevisionDialog,
  WikiEmbedPrismTranslateDialog,
  WikiEmbedPrismWritingProfileDialog,
} from "./WikiEmbedPrismMissingSurfaces";
import { WikiEmbedPrismWorkspace } from "./WikiEmbedPrismWorkspace";
import { WikiEmbedPrismWritingStart } from "./WikiEmbedPrismWritingStart";
import { WikiEmbedProfileSettings } from "./WikiEmbedProfileSettings";
import { WikiEmbedPromoModal } from "./WikiEmbedPromoModal";
import { WikiEmbedQuotaRecovery } from "./WikiEmbedQuotaRecovery";
import { WikiEmbedRedeemPreview } from "./WikiEmbedRedeemPreview";
import { WikiEmbedReviewAndStage } from "./WikiEmbedReviewAndStage";
import { WikiEmbedResourceCenter } from "./WikiEmbedResourceCenter";
import {
  WikiEmbedRhinoAssistantDock,
  WikiEmbedRhinoAssistantEntry,
  WikiEmbedRhinoAssistantFeedbackPanel,
  WikiEmbedRhinoAssistantHelpPanel,
  WikiEmbedRhinoAssistantNotificationsPanel,
} from "./WikiEmbedRhinoAssistant";
import { WikiEmbedSearchAutocomplete } from "./WikiEmbedSearchAutocomplete";
import { WikiEmbedShareSheet } from "./WikiEmbedShareSheet";
import { WikiEmbedSmartPaperGroup } from "./WikiEmbedSmartPaperGroup";
import { WikiEmbedSmartSearchDock } from "./WikiEmbedSmartSearchDock";
import { WikiEmbedSmartSearchSession } from "./WikiEmbedSmartSearchSession";
import { WikiEmbedStagingUnits } from "./WikiEmbedStagingUnits";
import { WikiEmbedSubscriptionCheckout } from "./WikiEmbedSubscriptionCheckout";
import { WikiEmbedWalletRecharge } from "./WikiEmbedWalletRecharge";
import {
  WikiEmbedWechatQrBinding,
  WikiEmbedWechatQrLogin,
} from "./WikiEmbedWechatQrLogin";
import {
  WikiEmbedAuthorCollaborationTrends,
  WikiEmbedBrowserTabsQuickOpen,
  WikiEmbedMatrixDimensionSettings,
  WikiEmbedPaperReferencesCitation,
  WikiEmbedSearchSuggestionsDropdown,
} from "./WikiEmbedBrowserSurfaces";
import {
  WikiEmbedClawArtifactOutput,
  WikiEmbedPeerReviewRecordsList,
  WikiEmbedPeerReviewSubmitSuccess,
} from "./WikiEmbedClawReviewSurfaces";
import {
  WikiEmbedLibraryBulkActions,
  WikiEmbedLibraryImportWorkbench,
  WikiEmbedLibraryMaintenanceWorkbench,
  WikiEmbedLibraryRelinkWorkbench,
  WikiEmbedShareReceiveVariants,
} from "./WikiEmbedLibrarySurfaces";
import {
  WikiEmbedPrismDocumentInsertDialogs,
  WikiEmbedPrismHistoryInlineEdit,
  WikiEmbedPrismWritingToolsDialogs,
} from "./WikiEmbedPrismSurfaces";
import {
  WikiEmbedCommunitySkillManagement,
  WikiEmbedCommunitySkillPublish,
  WikiEmbedFeatureToolDetail,
} from "./WikiEmbedToolsSkillsSurfaces";
import {
  WikiEmbedAuthRegisterRecovery,
  WikiEmbedBillingOverviewUsage,
  WikiEmbedHomeResearchEntry,
  WikiEmbedMarketingLandingTemplate,
  WikiEmbedUserAccountMenu,
} from "./WikiEmbedAuthBillingMarketingSurfaces";
import {
  WikiEmbedMobileFeedStates,
  WikiEmbedMobileSearchFilterSheet,
  WikiEmbedMobileSearchPaperResults,
} from "./WikiEmbedMobileSearchSurfaces";
import {
  WikiEmbedMobileClawActiveSession,
  WikiEmbedMobileClawArtifactPreview,
  WikiEmbedMobileClawSessionDrawer,
} from "./WikiEmbedMobileClawSurfaces";
import {
  WikiEmbedMobilePcOnlyGuide,
  WikiEmbedMobileToolDetail,
  WikiEmbedMobileToolsCatalog,
  WikiEmbedMobileToolsFilterSheet,
} from "./WikiEmbedMobileToolsSurfaces";
import {
  WikiEmbedMobileBillingLedger,
  WikiEmbedMobileMeLoggedOut,
  WikiEmbedMobileSubpageAuthGuard,
} from "./WikiEmbedMobileAccountSurfaces";
import {
  WikiEmbedMobileDetailHeader,
  WikiEmbedMpDiagramViewer,
  WikiEmbedQuotaStatusToasts,
} from "./WikiEmbedMobilePlatformSurfaces";
import {
  WikiEmbedAdminDashboardTodayPanel,
  WikiEmbedAdminDashboardTrendCards,
  WikiEmbedAdminGiftCodeActionDialog,
  WikiEmbedAdminGiftCodeGenerator,
  WikiEmbedAdminGiftCodeList,
  WikiEmbedAdminOrderRevenueChart,
  WikiEmbedAdminSidebarAlerts,
  WikiEmbedAdminUserBillingHistory,
  WikiEmbedAdminUserDetailDrawer,
  WikiEmbedAdminUserGrantPanel,
  WikiEmbedAdminUserMetrics,
  WikiEmbedAdminUserTokenUsage,
} from "./WikiEmbedAdminDetailUsers";
import {
  WikiEmbedAdminAnnouncementEditor,
  WikiEmbedAdminFeedbackDetailDialog,
  WikiEmbedAdminHotCleanupConfig,
  WikiEmbedAdminMailComposeDialog,
  WikiEmbedAdminMailboxWorkspace,
  WikiEmbedAdminMessageEditor,
  WikiEmbedAdminMessageSendConfirm,
  WikiEmbedAdminPromoConfigPreview,
  WikiEmbedAdminSkillReportQueue,
  WikiEmbedAdminSkillReviewError,
  WikiEmbedAdminSupportChannelConfig,
  WikiEmbedAdminToolEditor,
  WikiEmbedAdminToolImport,
  WikiEmbedAdminToolImportJobDetail,
  WikiEmbedAdminToolWebhookDeliveries,
  WikiEmbedAdminToolWebhookEditor,
  WikiEmbedAdminToolWebhookList,
} from "./WikiEmbedAdminDetailOperations";
import {
  WikiEmbedAdminChatSessionDetail,
  WikiEmbedAdminFilePreview,
  WikiEmbedAdminPeerReviewDetail,
  WikiEmbedAdminPeerReviewMonitor,
} from "./WikiEmbedAdminDetailMonitoring";
import {
  WikiEmbedAdminFeatureUsageTrend,
  WikiEmbedAdminSiteAnalyticsDimensions,
  WikiEmbedAdminSiteAnalyticsTrend,
  WikiEmbedAdminTokenUsageDimensions,
  WikiEmbedAdminTokenUsageFiltersChart,
  WikiEmbedAdminTokenUsageLogs,
} from "./WikiEmbedAdminDetailAnalytics";
import {
  WikiEmbedAdminAlipayEditor,
  WikiEmbedAdminCodeSnippetEditor,
  WikiEmbedAdminDimensionEditor,
  WikiEmbedAdminModelEditor,
  WikiEmbedAdminOAuthMiniProgram,
  WikiEmbedAdminPaymentActivationConfirm,
  WikiEmbedAdminProviderEditor,
  WikiEmbedAdminProviderSections,
  WikiEmbedAdminSystemChannelForms,
  WikiEmbedAdminThirdPartyEditor,
  WikiEmbedAdminWechatPayEditor,
} from "./WikiEmbedAdminDetailAiSystem";

interface WikiEmbedDefinition {
  id: WikiEmbedId;
  defaultCaption: string;
  Component: ComponentType;
}

function defineWikiEmbed(
  id: WikiEmbedId,
  defaultCaption: string,
  Component: ComponentType,
): WikiEmbedDefinition {
  return { id, defaultCaption, Component };
}

/**
 * Wiki 可嵌入组件白名单。
 * 新增演示：从 product-mock 选择代表状态 → 静态 WikiEmbed → 登记 → sections.embeds。
 * fixture 只解释界面与状态，不连接生产数据，也不执行生产动作。
 */
export const WIKI_EMBED_REGISTRY: Record<WikiEmbedId, WikiEmbedDefinition> = {
  "academic-intel-detail": {
    id: "academic-intel-detail",
    defaultCaption: "学术情报 · 详情",
    Component: WikiEmbedAcademicIntelDetail,
  },
  "academic-intel-list": {
    id: "academic-intel-list",
    defaultCaption: "学术情报 · 列表",
    Component: WikiEmbedAcademicIntelList,
  },
  "account-assets": {
    id: "account-assets",
    defaultCaption: "账户资产",
    Component: WikiEmbedAccountAssets,
  },
  "account-connections": {
    id: "account-connections",
    defaultCaption: "账户设置 · 已连接账号",
    Component: WikiEmbedAccountConnections,
  },
  "account-security": {
    id: "account-security",
    defaultCaption: "账户安全与双重换绑验证",
    Component: WikiEmbedAccountSecurity,
  },
  "wechat-qr-login": {
    id: "wechat-qr-login",
    defaultCaption: "微信扫码登录 · 等待扫码",
    Component: WikiEmbedWechatQrLogin,
  },
  "wechat-qr-binding": defineWikiEmbed(
    "wechat-qr-binding",
    "微信账号绑定 · 等待扫码",
    WikiEmbedWechatQrBinding,
  ),
  "oauth-callback-states": {
    id: "oauth-callback-states",
    defaultCaption: "OAuth 回调 · 正在完成登录",
    Component: WikiEmbedOAuthCallbackStates,
  },
  "wechat-callback-state": {
    id: "wechat-callback-state",
    defaultCaption: "微信扫码回调 · 正在完成处理",
    Component: WikiEmbedWechatCallbackState,
  },
  "oauth-account-merge": {
    id: "oauth-account-merge",
    defaultCaption: "邮箱冲突后的安全合并选择",
    Component: WikiEmbedOAuthAccountMerge,
  },
  "subscription-checkout": {
    id: "subscription-checkout",
    defaultCaption: "升级补差与最终报价",
    Component: WikiEmbedSubscriptionCheckout,
  },
  "wallet-recharge": {
    id: "wallet-recharge",
    defaultCaption: "经费充值与订单确认",
    Component: WikiEmbedWalletRecharge,
  },
  "billing-orders": {
    id: "billing-orders",
    defaultCaption: "订阅与充值订单明细",
    Component: WikiEmbedBillingOrders,
  },
  "mobile-membership-purchase": {
    id: "mobile-membership-purchase",
    defaultCaption: "移动端按当前周期筛选并动态报价",
    Component: WikiEmbedMobileMembershipPurchase,
  },
  "promo-modal": {
    id: "promo-modal",
    defaultCaption: "限时会员活动弹窗",
    Component: WikiEmbedPromoModal,
  },
  "help-center": {
    id: "help-center",
    defaultCaption: "帮助中心与学术问答首页",
    Component: WikiEmbedHelpCenter,
  },
  "help-content-detail": {
    id: "help-content-detail",
    defaultCaption: "内容详情、目录与继续阅读",
    Component: WikiEmbedHelpContentDetail,
  },
  "rhino-assistant-entry": {
    id: "rhino-assistant-entry",
    defaultCaption: "牛犀犀助手 · 悬浮角色的指针停留入口",
    Component: WikiEmbedRhinoAssistantEntry,
  },
  "rhino-assistant-dock": {
    id: "rhino-assistant-dock",
    defaultCaption: "牛犀犀助手 · 隐藏后的顶栏恢复入口",
    Component: WikiEmbedRhinoAssistantDock,
  },
  "rhino-assistant-help-panel": {
    id: "rhino-assistant-help-panel",
    defaultCaption: "牛犀犀助手 · 帮助面板的「拖点」标签",
    Component: WikiEmbedRhinoAssistantHelpPanel,
  },
  "rhino-assistant-support-panels": {
    id: "rhino-assistant-support-panels",
    defaultCaption: "牛犀犀助手 · 通知面板",
    Component: WikiEmbedRhinoAssistantNotificationsPanel,
  },
  "rhino-assistant-feedback-panel": {
    id: "rhino-assistant-feedback-panel",
    defaultCaption: "牛犀犀助手 · 精简反馈面板",
    Component: WikiEmbedRhinoAssistantFeedbackPanel,
  },
  "resource-center": {
    id: "resource-center",
    defaultCaption: "学术资源与产品博客中心",
    Component: WikiEmbedResourceCenter,
  },
  "feedback-form": {
    id: "feedback-form",
    defaultCaption: "产品反馈与附件入口",
    Component: WikiEmbedFeedbackForm,
  },
  "contact-support": {
    id: "contact-support",
    defaultCaption: "联系渠道与响应时效",
    Component: WikiEmbedContactSupport,
  },
  "auth-dialog": {
    id: "auth-dialog",
    defaultCaption: "登录弹窗",
    Component: WikiEmbedAuthDialog,
  },
  "auth-password-recovery-email": defineWikiEmbed(
    "auth-password-recovery-email",
    "账户 · 邮箱找回密码初始表单",
    WikiEmbedForgotPasswordEmail,
  ),
  "author-profile": {
    id: "author-profile",
    defaultCaption: "作者详情",
    Component: WikiEmbedAuthorProfile,
  },
  "citation-dialog": {
    id: "citation-dialog",
    defaultCaption: "引用弹窗",
    Component: WikiEmbedCitationDialog,
  },
  "citation-generator": {
    id: "citation-generator",
    defaultCaption: "引用生成器 · DOI 解析与格式结果",
    Component: WikiEmbedCitationGenerator,
  },
  "citation-graph-preview": {
    id: "citation-graph-preview",
    defaultCaption: "文献关系图谱 · 设计预览",
    Component: WikiEmbedCitationGraphPreview,
  },
  "classic-search-dock": {
    id: "classic-search-dock",
    defaultCaption: "传统搜索 · 底栏",
    Component: WikiEmbedClassicSearchDock,
  },
  "classic-search-filters": {
    id: "classic-search-filters",
    defaultCaption: "传统搜索 · 筛选器",
    Component: WikiEmbedClassicSearchFilters,
  },
  "claw-context-composer": {
    id: "claw-context-composer",
    defaultCaption: "Claw · 附件、引用与 Skill",
    Component: WikiEmbedClawContextComposer,
  },
  "claw-empty-state": {
    id: "claw-empty-state",
    defaultCaption: "Claw · 空态入口",
    Component: WikiEmbedClawEmptyState,
  },
  "claw-hero-smart-entry": {
    id: "claw-hero-smart-entry",
    defaultCaption: "智能搜索空态",
    Component: WikiEmbedClawHeroEntry,
  },
  "claw-run-states": {
    id: "claw-run-states",
    defaultCaption: "Claw · 长任务停滞提示",
    Component: WikiEmbedClawRunStates,
  },
  "claw-session-history": {
    id: "claw-session-history",
    defaultCaption: "Claw · 会话历史",
    Component: WikiEmbedClawSessionHistory,
  },
  "claw-workspace": {
    id: "claw-workspace",
    defaultCaption: "Claw · 会话工作区",
    Component: WikiEmbedClawWorkspace,
  },
  "community-skill": {
    id: "community-skill",
    defaultCaption: "社区 Skill",
    Component: WikiEmbedCommunitySkill,
  },
  "composer-attachments": {
    id: "composer-attachments",
    defaultCaption: "智能搜索 · 附件与引用",
    Component: WikiEmbedComposerAttachments,
  },
  "feature-plaza": {
    id: "feature-plaza",
    defaultCaption: "科研能力广场",
    Component: WikiEmbedFeaturePlaza,
  },
  "folder-icon-picker": {
    id: "folder-icon-picker",
    defaultCaption: "文件夹 · 图标与背景色",
    Component: WikiEmbedFolderIconPicker,
  },
  "invite-code-field": {
    id: "invite-code-field",
    defaultCaption: "注册中 · 邀请码可选填写与验证态",
    Component: WikiEmbedInviteCodeField,
  },
  "invite-code-prompt": {
    id: "invite-code-prompt",
    defaultCaption: "注册后 · 可跳过的补录提醒",
    Component: WikiEmbedInviteCodePrompt,
  },
  "invite-share": {
    id: "invite-share",
    defaultCaption: "活动开启且信息加载成功的邀请分享",
    Component: WikiEmbedInviteShare,
  },
  "journal-detail": {
    id: "journal-detail",
    defaultCaption: "期刊详情与投稿资源",
    Component: WikiEmbedJournalDetail,
  },
  "journal-directory": {
    id: "journal-directory",
    defaultCaption: "期刊榜单与目录",
    Component: WikiEmbedJournalDirectory,
  },
  "journal-search": {
    id: "journal-search",
    defaultCaption: "期刊搜索",
    Component: WikiEmbedJournalSearch,
  },
  "library-share-receive": {
    id: "library-share-receive",
    defaultCaption: "文献集分享接收",
    Component: WikiEmbedLibraryShareReceive,
  },
  "literature-library": {
    id: "literature-library",
    defaultCaption: "个人文献集",
    Component: WikiEmbedLiteratureLibrary,
  },
  "matrix-workspace": {
    id: "matrix-workspace",
    defaultCaption: "论文矩阵分析",
    Component: WikiEmbedMatrixWorkspace,
  },
  "membership-plans": {
    id: "membership-plans",
    defaultCaption: "会员套餐",
    Component: WikiEmbedMembershipPlans,
  },
  "mobile-academic-intel": {
    id: "mobile-academic-intel",
    defaultCaption: "移动端学术情报",
    Component: WikiEmbedMobileAcademicIntel,
  },
  "mobile-auth-surfaces": {
    id: "mobile-auth-surfaces",
    defaultCaption: "移动认证 · 从「我的」页打开的登录 Sheet",
    Component: WikiEmbedMobileAuthSurfaces,
  },
  "mobile-auth-page": defineWikiEmbed(
    "mobile-auth-page",
    "移动认证 · 独立登录页",
    WikiEmbedMobileAuthPage,
  ),
  "mobile-claw": {
    id: "mobile-claw",
    defaultCaption: "移动 Claw · 新对话工作区",
    Component: WikiEmbedMobileClaw,
  },
  "mobile-feed": {
    id: "mobile-feed",
    defaultCaption: "移动 Feed",
    Component: WikiEmbedMobileFeed,
  },
  "mobile-journal-feed": {
    id: "mobile-journal-feed",
    defaultCaption: "移动 Feed · 期刊卡与下一刊预览",
    Component: WikiEmbedMobileJournalFeed,
  },
  "mobile-library-flow": {
    id: "mobile-library-flow",
    defaultCaption: "移动文献集 · 文件夹列表到详情",
    Component: WikiEmbedMobileLibraryFlow,
  },
  "mobile-library-folder": defineWikiEmbed(
    "mobile-library-folder",
    "移动文献集 · 文件夹详情",
    WikiEmbedMobileLibraryFolder,
  ),
  "mobile-me": {
    id: "mobile-me",
    defaultCaption: "移动账户 · 我的",
    Component: WikiEmbedMobileMe,
  },
  "mobile-profile-settings": defineWikiEmbed(
    "mobile-profile-settings",
    "移动账户 · 个人资料",
    WikiEmbedMobileProfileSettings,
  ),
  "mobile-security-settings": defineWikiEmbed(
    "mobile-security-settings",
    "移动账户 · 安全设置",
    WikiEmbedMobileSecuritySettings,
  ),
  "mobile-connection-settings": defineWikiEmbed(
    "mobile-connection-settings",
    "移动账户 · 已连接账号",
    WikiEmbedMobileConnectionSettings,
  ),
  "mobile-search": {
    id: "mobile-search",
    defaultCaption: "移动端搜索",
    Component: WikiEmbedMobileSearch,
  },
  "mobile-tools": {
    id: "mobile-tools",
    defaultCaption: "移动功能首页",
    Component: WikiEmbedMobileTools,
  },
  "notification-inbox": {
    id: "notification-inbox",
    defaultCaption: "站内通知",
    Component: WikiEmbedNotificationInbox,
  },
  "paper-detail": {
    id: "paper-detail",
    defaultCaption: "论文详情",
    Component: WikiEmbedPaperDetail,
  },
  "paper-favorite-flow": {
    id: "paper-favorite-flow",
    defaultCaption: "收藏论文 · 选择目标文献集",
    Component: WikiEmbedPaperFavoriteFlow,
  },
  "pdf-chat-workspace": {
    id: "pdf-chat-workspace",
    defaultCaption: "PDF 对话",
    Component: WikiEmbedPdfChatWorkspace,
  },
  "pdf-reader": {
    id: "pdf-reader",
    defaultCaption: "PDF 阅读器",
    Component: WikiEmbedPdfReader,
  },
  "pdf-resolve": {
    id: "pdf-resolve",
    defaultCaption: "PDF 识别与关联",
    Component: WikiEmbedPdfResolve,
  },
  "peer-review-entry": {
    id: "peer-review-entry",
    defaultCaption: "智能审稿入口",
    Component: WikiEmbedPeerReviewEntry,
  },
  "peer-review-editorial-check": {
    id: "peer-review-editorial-check",
    defaultCaption: "智能审稿 · 编辑部初审演示层",
    Component: WikiEmbedPeerReviewEditorialCheck,
  },
  "peer-review-progress": {
    id: "peer-review-progress",
    defaultCaption: "智能审稿运行阶段",
    Component: WikiEmbedPeerReviewProgress,
  },
  "peer-review-report": {
    id: "peer-review-report",
    defaultCaption: "智能审稿评价报告",
    Component: WikiEmbedPeerReviewReport,
  },
  "peer-review-result-overview": {
    id: "peer-review-result-overview",
    defaultCaption: "智能审稿结果总览",
    Component: WikiEmbedPeerReviewResultOverview,
  },
  "peer-review-wizard": {
    id: "peer-review-wizard",
    defaultCaption: "智能审稿向导",
    Component: WikiEmbedPeerReviewWizard,
  },
  "prism-compile-states": {
    id: "prism-compile-states",
    defaultCaption: "Prism 编译失败 · 可恢复状态",
    Component: WikiEmbedPrismCompileStates,
  },
  "prism-home": {
    id: "prism-home",
    defaultCaption: "Prism 项目首页 · 未选中项目",
    Component: WikiEmbedPrismHome,
  },
  "prism-workspace": {
    id: "prism-workspace",
    defaultCaption: "Prism 写作工作区",
    Component: WikiEmbedPrismWorkspace,
  },
  "prism-writing-start": {
    id: "prism-writing-start",
    defaultCaption: "Prism 开始写作",
    Component: WikiEmbedPrismWritingStart,
  },
  "profile-settings": {
    id: "profile-settings",
    defaultCaption: "账户设置 · 桌面端个人资料",
    Component: WikiEmbedProfileSettings,
  },
  "quota-recovery": {
    id: "quota-recovery",
    defaultCaption: "额度耗尽与恢复",
    Component: WikiEmbedQuotaRecovery,
  },
  "redeem-preview": {
    id: "redeem-preview",
    defaultCaption: "每账号一次的兑换预览确认",
    Component: WikiEmbedRedeemPreview,
  },
  "review-and-stage": {
    id: "review-and-stage",
    defaultCaption: "传统搜索 · 核对并暂存",
    Component: WikiEmbedReviewAndStage,
  },
  "search-autocomplete": {
    id: "search-autocomplete",
    defaultCaption: "传统搜索",
    Component: WikiEmbedSearchAutocomplete,
  },
  "share-sheet": {
    id: "share-sheet",
    defaultCaption: "分享面板",
    Component: WikiEmbedShareSheet,
  },
  "smart-paper-group": {
    id: "smart-paper-group",
    defaultCaption: "智能搜索论文组",
    Component: WikiEmbedSmartPaperGroup,
  },
  "smart-search-dock": {
    id: "smart-search-dock",
    defaultCaption: "智能搜索 · 输入栏",
    Component: WikiEmbedSmartSearchDock,
  },
  "smart-search-session": {
    id: "smart-search-session",
    defaultCaption: "智能搜索 · 会话态",
    Component: WikiEmbedSmartSearchSession,
  },
  "staging-units": {
    id: "staging-units",
    defaultCaption: "暂存区",
    Component: WikiEmbedStagingUnits,
  },
  "admin-console": {
    id: "admin-console",
    defaultCaption: "后台 · 控制台外壳与导航",
    Component: WikiEmbedAdminConsole,
  },
  "admin-access-control": {
    id: "admin-access-control",
    defaultCaption: "后台 · 角色与权限矩阵",
    Component: WikiEmbedAdminAccessControl,
  },
  "admin-dashboard": {
    id: "admin-dashboard",
    defaultCaption: "后台 · 运营总览",
    Component: WikiEmbedAdminDashboard,
  },
  "admin-user-directory": {
    id: "admin-user-directory",
    defaultCaption: "后台 · 用户查询与聚合详情",
    Component: WikiEmbedAdminUserDirectory,
  },
  "admin-user-lifecycle": {
    id: "admin-user-lifecycle",
    defaultCaption: "后台 · 用户冻结、删除与角色变更",
    Component: WikiEmbedAdminUserLifecycle,
  },
  "admin-entitlement-grants": {
    id: "admin-entitlement-grants",
    defaultCaption: "后台 · 会员、Credit 与 Reset Pass 发放",
    Component: WikiEmbedAdminEntitlementGrants,
  },
  "admin-gift-codes": {
    id: "admin-gift-codes",
    defaultCaption: "后台 · 兑换码批次与明细",
    Component: WikiEmbedAdminGiftCodes,
  },
  "admin-orders": {
    id: "admin-orders",
    defaultCaption: "后台 · 订单状态与退款记录",
    Component: WikiEmbedAdminOrders,
  },
  "admin-announcements": {
    id: "admin-announcements",
    defaultCaption: "后台 · 公告管理",
    Component: WikiEmbedAdminAnnouncements,
  },
  "admin-hot-content": {
    id: "admin-hot-content",
    defaultCaption: "后台 · 热门内容运营",
    Component: WikiEmbedAdminHotContent,
  },
  "admin-journal-sync": {
    id: "admin-journal-sync",
    defaultCaption: "后台 · 期刊同步与发布",
    Component: WikiEmbedAdminJournalSync,
  },
  "admin-tool-operations": {
    id: "admin-tool-operations",
    defaultCaption: "后台 · 工具目录、导入与 Webhook",
    Component: WikiEmbedAdminToolOperations,
  },
  "admin-skill-moderation": {
    id: "admin-skill-moderation",
    defaultCaption: "后台 · 社区 Skill 审核",
    Component: WikiEmbedAdminSkillModeration,
  },
  "admin-messaging": {
    id: "admin-messaging",
    defaultCaption: "后台 · 站内消息管理",
    Component: WikiEmbedAdminMessaging,
  },
  "admin-campaigns-promo": {
    id: "admin-campaigns-promo",
    defaultCaption: "后台 · 邀请活动与推广弹窗",
    Component: WikiEmbedAdminCampaignsPromo,
  },
  "admin-feedback": {
    id: "admin-feedback",
    defaultCaption: "后台 · 反馈处理",
    Component: WikiEmbedAdminFeedback,
  },
  "admin-mail-support": {
    id: "admin-mail-support",
    defaultCaption: "后台 · 邮件中心",
    Component: WikiEmbedAdminMailSupport,
  },
  "admin-session-monitoring": {
    id: "admin-session-monitoring",
    defaultCaption: "后台 · AI 会话只读监控",
    Component: WikiEmbedAdminSessionMonitoring,
  },
  "admin-invite-analytics": {
    id: "admin-invite-analytics",
    defaultCaption: "后台 · 邀请关系与转化",
    Component: WikiEmbedAdminInviteAnalytics,
  },
  "admin-delivery-logs": {
    id: "admin-delivery-logs",
    defaultCaption: "后台 · 邮件与短信发送日志",
    Component: WikiEmbedAdminDeliveryLogs,
  },
  "admin-support-config": {
    id: "admin-support-config",
    defaultCaption: "后台 · 客服公开信息与通道配置",
    Component: WikiEmbedAdminSupportConfig,
  },
  "admin-site-analytics": {
    id: "admin-site-analytics",
    defaultCaption: "后台 · 网站与爬虫分析",
    Component: WikiEmbedAdminSiteAnalytics,
  },
  "admin-feature-usage": {
    id: "admin-feature-usage",
    defaultCaption: "后台 · 功能使用统计",
    Component: WikiEmbedAdminFeatureUsage,
  },
  "admin-token-cost": {
    id: "admin-token-cost",
    defaultCaption: "后台 · 算力用量统计",
    Component: WikiEmbedAdminTokenCost,
  },
  "admin-billing-configuration": {
    id: "admin-billing-configuration",
    defaultCaption: "后台 · 计费体系配置",
    Component: WikiEmbedAdminBillingConfiguration,
  },
  "admin-analytics-setup": {
    id: "admin-analytics-setup",
    defaultCaption: "后台 · 站点分析未配置状态",
    Component: WikiEmbedAdminAnalyticsSetup,
  },
  "admin-model-catalog": {
    id: "admin-model-catalog",
    defaultCaption: "后台 · AI Provider 与模型目录",
    Component: WikiEmbedAdminModelCatalog,
  },
  "admin-third-party-accounts": {
    id: "admin-third-party-accounts",
    defaultCaption: "后台 · 第三方账号池",
    Component: WikiEmbedAdminThirdPartyAccounts,
  },
  "admin-model-bindings": {
    id: "admin-model-bindings",
    defaultCaption: "后台 · 模型用途绑定",
    Component: WikiEmbedAdminModelBindings,
  },
  "admin-analysis-dimensions": {
    id: "admin-analysis-dimensions",
    defaultCaption: "后台 · 矩阵分析维度",
    Component: WikiEmbedAdminAnalysisDimensions,
  },
  "admin-wechat-official": {
    id: "admin-wechat-official",
    defaultCaption: "后台 · 微信公众号配置",
    Component: WikiEmbedAdminWechatOfficial,
  },
  "admin-news-webhook": {
    id: "admin-news-webhook",
    defaultCaption: "后台 · 研究新闻 Webhook",
    Component: WikiEmbedAdminNewsWebhook,
  },
  "admin-system-config": {
    id: "admin-system-config",
    defaultCaption: "后台 · 系统配置",
    Component: WikiEmbedAdminSystemConfig,
  },
  "admin-code-snippets": {
    id: "admin-code-snippets",
    defaultCaption: "后台 · 代码片段",
    Component: WikiEmbedAdminCodeSnippets,
  },
  "admin-oauth-config": {
    id: "admin-oauth-config",
    defaultCaption: "后台 · OAuth 与第三方登录配置",
    Component: WikiEmbedAdminOAuthConfig,
  },
  "admin-payment-merchants": {
    id: "admin-payment-merchants",
    defaultCaption: "后台 · 支付宝商户配置",
    Component: WikiEmbedAdminPaymentMerchants,
  },
  "admin-wechat-pay": {
    id: "admin-wechat-pay",
    defaultCaption: "后台 · 微信支付配置",
    Component: WikiEmbedAdminWechatPay,
  },
  "home-research-entry": defineWikiEmbed(
    "home-research-entry",
    "首页 · 研究入口与能力路径",
    WikiEmbedHomeResearchEntry,
  ),
  "search-suggestions-dropdown": defineWikiEmbed(
    "search-suggestions-dropdown",
    "搜索入口 · 论文、作者与期刊建议",
    WikiEmbedSearchSuggestionsDropdown,
  ),
  "browser-tabs-quick-open": defineWikiEmbed(
    "browser-tabs-quick-open",
    "浏览标签 · 快速打开论文",
    WikiEmbedBrowserTabsQuickOpen,
  ),
  "paper-references-citation": defineWikiEmbed(
    "paper-references-citation",
    "论文详情 · 参考文献与内联引用",
    WikiEmbedPaperReferencesCitation,
  ),
  "author-collaboration-trends": defineWikiEmbed(
    "author-collaboration-trends",
    "作者详情 · 合作者与年度趋势",
    WikiEmbedAuthorCollaborationTrends,
  ),
  "matrix-dimension-settings": defineWikiEmbed(
    "matrix-dimension-settings",
    "论文矩阵 · 分析维度设置",
    WikiEmbedMatrixDimensionSettings,
  ),
  "library-import-workbench": defineWikiEmbed(
    "library-import-workbench",
    "个人文献集 · 统一导入工作台",
    WikiEmbedLibraryImportWorkbench,
  ),
  "library-bulk-actions": defineWikiEmbed(
    "library-bulk-actions",
    "个人文献集 · 批量操作",
    WikiEmbedLibraryBulkActions,
  ),
  "library-maintenance-workbench": defineWikiEmbed(
    "library-maintenance-workbench",
    "个人文献集 · 元数据与 PDF 维护",
    WikiEmbedLibraryMaintenanceWorkbench,
  ),
  "library-relink-workbench": defineWikiEmbed(
    "library-relink-workbench",
    "PDF 管理 · 重新关联论文",
    WikiEmbedLibraryRelinkWorkbench,
  ),
  "share-receive-variants": defineWikiEmbed(
    "share-receive-variants",
    "分享接收 · 受保护合集的提取码",
    WikiEmbedShareReceiveVariants,
  ),
  "claw-artifact-output": defineWikiEmbed(
    "claw-artifact-output",
    "智能助手 · 交付物与预览",
    WikiEmbedClawArtifactOutput,
  ),
  "peer-review-records-list": defineWikiEmbed(
    "peer-review-records-list",
    "智能审稿 · 记录列表",
    WikiEmbedPeerReviewRecordsList,
  ),
  "peer-review-submit-success": defineWikiEmbed(
    "peer-review-submit-success",
    "智能审稿 · 产品内提交回执",
    WikiEmbedPeerReviewSubmitSuccess,
  ),
  "prism-writing-tools-dialogs": defineWikiEmbed(
    "prism-writing-tools-dialogs",
    "Prism · 质量检查窗口",
    WikiEmbedPrismWritingToolsDialogs,
  ),
  "prism-document-insert-dialogs": defineWikiEmbed(
    "prism-document-insert-dialogs",
    "Prism · 从个人文献集插入引用",
    WikiEmbedPrismDocumentInsertDialogs,
  ),
  "prism-history-inline-edit": defineWikiEmbed(
    "prism-history-inline-edit",
    "Prism · 版本历史",
    WikiEmbedPrismHistoryInlineEdit,
  ),
  "prism-live-preview": defineWikiEmbed(
    "prism-live-preview",
    "Prism · AI 写作实时预览",
    WikiEmbedPrismLivePreview,
  ),
  "prism-writing-profile-dialog": defineWikiEmbed(
    "prism-writing-profile-dialog",
    "Prism · 写作画像",
    WikiEmbedPrismWritingProfileDialog,
  ),
  "prism-revision-dialog": defineWikiEmbed(
    "prism-revision-dialog",
    "Prism · 修改意见逐条回应",
    WikiEmbedPrismRevisionDialog,
  ),
  "prism-translate-dialog": defineWikiEmbed(
    "prism-translate-dialog",
    "Prism · 整篇翻译",
    WikiEmbedPrismTranslateDialog,
  ),
  "prism-numbers-dialog": defineWikiEmbed(
    "prism-numbers-dialog",
    "Prism · 数字校验结果",
    WikiEmbedPrismNumbersDialog,
  ),
  "prism-math-editor-dialog": defineWikiEmbed(
    "prism-math-editor-dialog",
    "Prism · 插入公式",
    WikiEmbedPrismMathEditorDialog,
  ),
  "feature-tool-detail": defineWikiEmbed(
    "feature-tool-detail",
    "功能广场 · 工具详情",
    WikiEmbedFeatureToolDetail,
  ),
  "community-skill-publish": defineWikiEmbed(
    "community-skill-publish",
    "社区技能 · 上传与发布",
    WikiEmbedCommunitySkillPublish,
  ),
  "community-skill-management": defineWikiEmbed(
    "community-skill-management",
    "社区技能 · 管理与版本",
    WikiEmbedCommunitySkillManagement,
  ),
  "auth-register-recovery": defineWikiEmbed(
    "auth-register-recovery",
    "账户 · 邮箱注册表单",
    WikiEmbedAuthRegisterRecovery,
  ),
  "billing-overview-usage": defineWikiEmbed(
    "billing-overview-usage",
    "账户资产 · 近期流水与用量",
    WikiEmbedBillingOverviewUsage,
  ),
  "user-account-menu": defineWikiEmbed(
    "user-account-menu",
    "账户菜单 · 会员与设置入口",
    WikiEmbedUserAccountMenu,
  ),
  "marketing-landing-template": defineWikiEmbed(
    "marketing-landing-template",
    "功能落地页 · 内容模板与实装边界",
    WikiEmbedMarketingLandingTemplate,
  ),
  "mobile-search-paper-results": defineWikiEmbed(
    "mobile-search-paper-results",
    "移动搜索 · 论文结果",
    WikiEmbedMobileSearchPaperResults,
  ),
  "mobile-search-filter-sheet": defineWikiEmbed(
    "mobile-search-filter-sheet",
    "移动搜索 · 完整筛选面板",
    WikiEmbedMobileSearchFilterSheet,
  ),
  "mobile-feed-states": defineWikiEmbed(
    "mobile-feed-states",
    "移动 Feed · 加载失败与重试",
    WikiEmbedMobileFeedStates,
  ),
  "mobile-claw-session-drawer": defineWikiEmbed(
    "mobile-claw-session-drawer",
    "移动 Claw · 会话历史抽屉",
    WikiEmbedMobileClawSessionDrawer,
  ),
  "mobile-claw-artifact-preview": defineWikiEmbed(
    "mobile-claw-artifact-preview",
    "移动 Claw · 交付物整屏预览",
    WikiEmbedMobileClawArtifactPreview,
  ),
  "mobile-claw-active-session": defineWikiEmbed(
    "mobile-claw-active-session",
    "移动 Claw · 活跃会话",
    WikiEmbedMobileClawActiveSession,
  ),
  "mobile-tools-catalog": defineWikiEmbed(
    "mobile-tools-catalog",
    "移动功能广场 · 完整目录",
    WikiEmbedMobileToolsCatalog,
  ),
  "mobile-tools-filter-sheet": defineWikiEmbed(
    "mobile-tools-filter-sheet",
    "移动功能广场 · 筛选面板",
    WikiEmbedMobileToolsFilterSheet,
  ),
  "mobile-tool-detail": defineWikiEmbed(
    "mobile-tool-detail",
    "移动功能广场 · 工具详情",
    WikiEmbedMobileToolDetail,
  ),
  "mobile-pc-only-guide": defineWikiEmbed(
    "mobile-pc-only-guide",
    "移动端 · 电脑端功能引导",
    WikiEmbedMobilePcOnlyGuide,
  ),
  "mobile-me-logged-out": defineWikiEmbed(
    "mobile-me-logged-out",
    "移动端我的 · 未登录状态",
    WikiEmbedMobileMeLoggedOut,
  ),
  "mobile-billing-ledger": defineWikiEmbed(
    "mobile-billing-ledger",
    "移动端我的 · 经费与订单流水",
    WikiEmbedMobileBillingLedger,
  ),
  "mobile-subpage-auth-guard": defineWikiEmbed(
    "mobile-subpage-auth-guard",
    "移动端我的 · 子页面登录边界",
    WikiEmbedMobileSubpageAuthGuard,
  ),
  "mobile-detail-header": defineWikiEmbed(
    "mobile-detail-header",
    "移动详情页 · 返回与分享页眉",
    WikiEmbedMobileDetailHeader,
  ),
  "mp-diagram-viewer": defineWikiEmbed(
    "mp-diagram-viewer",
    "小程序 · 独立图表查看器",
    WikiEmbedMpDiagramViewer,
  ),
  "quota-status-toasts": defineWikiEmbed(
    "quota-status-toasts",
    "额度状态 · 跨端系统提示",
    WikiEmbedQuotaStatusToasts,
  ),
  "admin-sidebar-alerts": defineWikiEmbed(
    "admin-sidebar-alerts",
    "后台 · 侧栏提醒状态",
    WikiEmbedAdminSidebarAlerts,
  ),
  "admin-dashboard-today-panel": defineWikiEmbed(
    "admin-dashboard-today-panel",
    "后台 · 今日待办",
    WikiEmbedAdminDashboardTodayPanel,
  ),
  "admin-dashboard-trend-cards": defineWikiEmbed(
    "admin-dashboard-trend-cards",
    "后台 · 关键指标趋势",
    WikiEmbedAdminDashboardTrendCards,
  ),
  "admin-user-metrics": defineWikiEmbed(
    "admin-user-metrics",
    "后台 · 用户分析",
    WikiEmbedAdminUserMetrics,
  ),
  "admin-user-detail-drawer": defineWikiEmbed(
    "admin-user-detail-drawer",
    "后台 · 用户聚合详情抽屉",
    WikiEmbedAdminUserDetailDrawer,
  ),
  "admin-user-token-usage": defineWikiEmbed(
    "admin-user-token-usage",
    "后台 · 单用户使用概况",
    WikiEmbedAdminUserTokenUsage,
  ),
  "admin-user-billing-history": defineWikiEmbed(
    "admin-user-billing-history",
    "后台 · 账户与财务记录",
    WikiEmbedAdminUserBillingHistory,
  ),
  "admin-user-grant-panel": defineWikiEmbed(
    "admin-user-grant-panel",
    "后台 · 发放用户权益",
    WikiEmbedAdminUserGrantPanel,
  ),
  "admin-order-revenue-chart": defineWikiEmbed(
    "admin-order-revenue-chart",
    "后台 · 营收趋势",
    WikiEmbedAdminOrderRevenueChart,
  ),
  "admin-gift-code-generator": defineWikiEmbed(
    "admin-gift-code-generator",
    "后台 · 生成兑换码批次",
    WikiEmbedAdminGiftCodeGenerator,
  ),
  "admin-gift-code-list": defineWikiEmbed(
    "admin-gift-code-list",
    "后台 · 批次兑换码清单",
    WikiEmbedAdminGiftCodeList,
  ),
  "admin-gift-code-action-dialog": defineWikiEmbed(
    "admin-gift-code-action-dialog",
    "后台 · 单个兑换码操作",
    WikiEmbedAdminGiftCodeActionDialog,
  ),
  "admin-promo-config-preview": defineWikiEmbed(
    "admin-promo-config-preview",
    "后台 · 推广配置与预览",
    WikiEmbedAdminPromoConfigPreview,
  ),
  "admin-announcement-editor": defineWikiEmbed(
    "admin-announcement-editor",
    "后台 · 公告编辑器",
    WikiEmbedAdminAnnouncementEditor,
  ),
  "admin-hot-cleanup-config": defineWikiEmbed(
    "admin-hot-cleanup-config",
    "后台 · 热门内容清理策略",
    WikiEmbedAdminHotCleanupConfig,
  ),
  "admin-tool-editor": defineWikiEmbed(
    "admin-tool-editor",
    "后台 · 编辑功能工具",
    WikiEmbedAdminToolEditor,
  ),
  "admin-tool-import": defineWikiEmbed(
    "admin-tool-import",
    "后台 · 批量导入工具",
    WikiEmbedAdminToolImport,
  ),
  "admin-tool-import-job-detail": defineWikiEmbed(
    "admin-tool-import-job-detail",
    "后台 · 导入任务详情",
    WikiEmbedAdminToolImportJobDetail,
  ),
  "admin-tool-webhook-list": defineWikiEmbed(
    "admin-tool-webhook-list",
    "后台 · 工具 Webhook",
    WikiEmbedAdminToolWebhookList,
  ),
  "admin-tool-webhook-editor": defineWikiEmbed(
    "admin-tool-webhook-editor",
    "后台 · Webhook 编辑器",
    WikiEmbedAdminToolWebhookEditor,
  ),
  "admin-tool-webhook-deliveries": defineWikiEmbed(
    "admin-tool-webhook-deliveries",
    "后台 · Webhook 投递记录",
    WikiEmbedAdminToolWebhookDeliveries,
  ),
  "admin-skill-report-queue": defineWikiEmbed(
    "admin-skill-report-queue",
    "后台 · 待处理技能举报",
    WikiEmbedAdminSkillReportQueue,
  ),
  "admin-skill-review-error": defineWikiEmbed(
    "admin-skill-review-error",
    "后台 · 审核队列加载失败",
    WikiEmbedAdminSkillReviewError,
  ),
  "admin-feedback-detail-dialog": defineWikiEmbed(
    "admin-feedback-detail-dialog",
    "后台 · 反馈详情与回复",
    WikiEmbedAdminFeedbackDetailDialog,
  ),
  "admin-message-editor": defineWikiEmbed(
    "admin-message-editor",
    "后台 · 新建站内消息",
    WikiEmbedAdminMessageEditor,
  ),
  "admin-message-send-confirm": defineWikiEmbed(
    "admin-message-send-confirm",
    "后台 · 消息发送确认",
    WikiEmbedAdminMessageSendConfirm,
  ),
  "admin-mailbox-workspace": defineWikiEmbed(
    "admin-mailbox-workspace",
    "后台 · 客服邮箱工作台",
    WikiEmbedAdminMailboxWorkspace,
  ),
  "admin-mail-compose-dialog": defineWikiEmbed(
    "admin-mail-compose-dialog",
    "后台 · 主动发送客服邮件",
    WikiEmbedAdminMailComposeDialog,
  ),
  "admin-support-channel-config": defineWikiEmbed(
    "admin-support-channel-config",
    "后台 · 客服渠道配置",
    WikiEmbedAdminSupportChannelConfig,
  ),
  "admin-chat-session-detail": defineWikiEmbed(
    "admin-chat-session-detail",
    "后台 · AI 会话详情",
    WikiEmbedAdminChatSessionDetail,
  ),
  "admin-peer-review-monitor": defineWikiEmbed(
    "admin-peer-review-monitor",
    "后台 · 智能审稿监控",
    WikiEmbedAdminPeerReviewMonitor,
  ),
  "admin-peer-review-detail": defineWikiEmbed(
    "admin-peer-review-detail",
    "后台 · 评审记录详情",
    WikiEmbedAdminPeerReviewDetail,
  ),
  "admin-file-preview": defineWikiEmbed(
    "admin-file-preview",
    "后台 · 会话附件预览",
    WikiEmbedAdminFilePreview,
  ),
  "admin-site-analytics-trend": defineWikiEmbed(
    "admin-site-analytics-trend",
    "后台 · 站点访问趋势",
    WikiEmbedAdminSiteAnalyticsTrend,
  ),
  "admin-site-analytics-dimensions": defineWikiEmbed(
    "admin-site-analytics-dimensions",
    "后台 · 访问维度排行",
    WikiEmbedAdminSiteAnalyticsDimensions,
  ),
  "admin-feature-usage-trend": defineWikiEmbed(
    "admin-feature-usage-trend",
    "后台 · 功能使用趋势",
    WikiEmbedAdminFeatureUsageTrend,
  ),
  "admin-token-usage-filters-chart": defineWikiEmbed(
    "admin-token-usage-filters-chart",
    "后台 · 算力过滤与日趋势",
    WikiEmbedAdminTokenUsageFiltersChart,
  ),
  "admin-token-usage-dimensions": defineWikiEmbed(
    "admin-token-usage-dimensions",
    "后台 · 算力维度拆分",
    WikiEmbedAdminTokenUsageDimensions,
  ),
  "admin-token-usage-logs": defineWikiEmbed(
    "admin-token-usage-logs",
    "后台 · 算力调用日志",
    WikiEmbedAdminTokenUsageLogs,
  ),
  "admin-provider-sections": defineWikiEmbed(
    "admin-provider-sections",
    "后台 · 模型提供方分区",
    WikiEmbedAdminProviderSections,
  ),
  "admin-model-editor": defineWikiEmbed(
    "admin-model-editor",
    "后台 · 模型编辑器",
    WikiEmbedAdminModelEditor,
  ),
  "admin-provider-editor": defineWikiEmbed(
    "admin-provider-editor",
    "后台 · 模型端点编辑器",
    WikiEmbedAdminProviderEditor,
  ),
  "admin-third-party-editor": defineWikiEmbed(
    "admin-third-party-editor",
    "后台 · 三方账号编辑器",
    WikiEmbedAdminThirdPartyEditor,
  ),
  "admin-dimension-editor": defineWikiEmbed(
    "admin-dimension-editor",
    "后台 · 分析维度编辑器",
    WikiEmbedAdminDimensionEditor,
  ),
  "admin-system-channel-forms": defineWikiEmbed(
    "admin-system-channel-forms",
    "后台 · 系统通道配置",
    WikiEmbedAdminSystemChannelForms,
  ),
  "admin-code-snippet-editor": defineWikiEmbed(
    "admin-code-snippet-editor",
    "后台 · 代码片段编辑器",
    WikiEmbedAdminCodeSnippetEditor,
  ),
  "admin-oauth-miniprogram": defineWikiEmbed(
    "admin-oauth-miniprogram",
    "后台 · 微信小程序登录配置",
    WikiEmbedAdminOAuthMiniProgram,
  ),
  "admin-alipay-editor": defineWikiEmbed(
    "admin-alipay-editor",
    "后台 · 支付宝配置编辑器",
    WikiEmbedAdminAlipayEditor,
  ),
  "admin-wechatpay-editor": defineWikiEmbed(
    "admin-wechatpay-editor",
    "后台 · 微信支付配置编辑器",
    WikiEmbedAdminWechatPayEditor,
  ),
  "admin-payment-activation-confirm": defineWikiEmbed(
    "admin-payment-activation-confirm",
    "后台 · 支付配置激活确认",
    WikiEmbedAdminPaymentActivationConfirm,
  ),
};
