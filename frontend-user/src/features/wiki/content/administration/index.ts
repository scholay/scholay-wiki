import type { WikiArticle } from "../../types";
import { AdminAccessControlArticle } from "./admin-access-control";
import { AdminAnalysisDimensionsArticle } from "./admin-analysis-dimensions";
import { AdminAnnouncementsArticle } from "./admin-announcements";
import { AdminBillingConfigurationArticle } from "./admin-billing-configuration";
import { AdminCampaignsPromoArticle } from "./admin-campaigns-promo";
import { AdminDashboardArticle } from "./admin-dashboard";
import { AdminFeatureUsageArticle } from "./admin-feature-usage";
import { AdminFeedbackOperationsArticle } from "./admin-feedback-operations";
import { AdminHotContentArticle } from "./admin-hot-content";
import { AdminInviteAnalyticsArticle } from "./admin-invite-analytics";
import { AdminJournalSyncArticle } from "./admin-journal-sync";
import { AdminMailSupportObservabilityArticle } from "./admin-mail-support-observability";
import { AdminMessagingArticle } from "./admin-messaging";
import { AdminModelBindingsArticle } from "./admin-model-bindings";
import { AdminModelProviderCatalogArticle } from "./admin-model-provider-catalog";
import { AdminNewsWebhookArticle } from "./admin-news-webhook";
import { AdminOauthConfigArticle } from "./admin-oauth-config";
import { AdminPaymentMerchantsArticle } from "./admin-payment-merchants";
import { AdminSessionMonitoringArticle } from "./admin-session-monitoring";
import { AdminSiteAnalyticsArticle } from "./admin-site-analytics";
import { AdminSkillModerationArticle } from "./admin-skill-moderation";
import { AdminSystemCodeSnippetsArticle } from "./admin-system-code-snippets";
import { AdminThirdPartyAccountPoolArticle } from "./admin-third-party-account-pool";
import { AdminTokenCostArticle } from "./admin-token-cost";
import { AdminToolOperationsArticle } from "./admin-tool-operations";
import { AdminUserDirectoryArticle } from "./admin-user-directory";
import { AdminUserEntitlementGrantsArticle } from "./admin-user-entitlement-grants";
import { AdminUserLifecycleArticle } from "./admin-user-lifecycle";
import { AdminWechatOfficialArticle } from "./admin-wechat-official";

export const administrationArticles: WikiArticle[] = [
  AdminAccessControlArticle,
  AdminDashboardArticle,
  AdminUserDirectoryArticle,
  AdminUserLifecycleArticle,
  AdminUserEntitlementGrantsArticle,
  AdminAnnouncementsArticle,
  AdminHotContentArticle,
  AdminJournalSyncArticle,
  AdminToolOperationsArticle,
  AdminSkillModerationArticle,
  AdminFeedbackOperationsArticle,
  AdminMessagingArticle,
  AdminMailSupportObservabilityArticle,
  AdminSessionMonitoringArticle,
  AdminSiteAnalyticsArticle,
  AdminFeatureUsageArticle,
  AdminTokenCostArticle,
  AdminInviteAnalyticsArticle,
  AdminCampaignsPromoArticle,
  AdminBillingConfigurationArticle,
  AdminModelProviderCatalogArticle,
  AdminThirdPartyAccountPoolArticle,
  AdminModelBindingsArticle,
  AdminAnalysisDimensionsArticle,
  AdminWechatOfficialArticle,
  AdminNewsWebhookArticle,
  AdminSystemCodeSnippetsArticle,
  AdminOauthConfigArticle,
  AdminPaymentMerchantsArticle,
];
