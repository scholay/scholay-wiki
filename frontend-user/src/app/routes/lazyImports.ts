/**
 * 统一懒加载管理
 *
 * 集中管理所有页面的 lazy import。
 * lazyWithRetry：chunk 加载失败时自动刷新页面（sessionStorage 防无限循环）。
 */

import { lazy } from 'react';

const lazyWithRetry = (
  componentImport: () => Promise<any>,
  componentName: string = 'Component'
) => {
  return lazy(async () => {
    const storageKey = `chunk_refresh_${componentName}`;
    const hasRefreshed = sessionStorage.getItem(storageKey);

    try {
      const component = await componentImport();
      sessionStorage.removeItem(storageKey);
      return component;
    } catch (error: any) {
      if (
        error.name === 'ChunkLoadError' ||
        error.message?.includes('Loading chunk') ||
        error.message?.includes('Loading CSS chunk') ||
        error.message?.includes('Failed to fetch dynamically imported module') ||
        error.message?.includes('error loading dynamically imported module')
      ) {
        if (!hasRefreshed) {
          sessionStorage.setItem(storageKey, 'true');
          setTimeout(() => window.location.reload(), 100);
        }
      }
      throw error;
    }
  });
};

/* ----------------------------------------------------------------
 * 同步加载（最频繁访问的入口页）
 * ---------------------------------------------------------------- */

// 重新导出为同步方式在 AppRouter 中直接 import

/* ----------------------------------------------------------------
 * Feature: Search
 * ---------------------------------------------------------------- */

export const SearchResultsPage = lazyWithRetry(
  () => import('../../pages/SearchResultsPage'),
  'SearchResultsPage'
);

/* ----------------------------------------------------------------
 * Feature: AI Chat
 * ---------------------------------------------------------------- */

export const ChatPage = lazyWithRetry(
  () => import('../../pages/ChatPage'),
  'ChatPage'
);

/* ----------------------------------------------------------------
 * Feature: Peer Review
 * ---------------------------------------------------------------- */

export const PeerReviewPage = lazyWithRetry(
  () => import('../../pages/PeerReviewPage'),
  'PeerReviewPage'
);

/* ----------------------------------------------------------------
 * Feature: Settings
 * ---------------------------------------------------------------- */

export const Settings = lazyWithRetry(
  () => import('../../pages/Settings'),
  'Settings'
);

/* ----------------------------------------------------------------
 * Feature: Paper Detail
 * ---------------------------------------------------------------- */

export const PaperDetailPage = lazyWithRetry(
  () => import('../../pages/PaperDetailPage'),
  'PaperDetailPage'
);

/* ----------------------------------------------------------------
 * Feature: AI Assistant
 * ---------------------------------------------------------------- */

export const AssistantPage = lazyWithRetry(
  () => import('../../pages/AssistantPage'),
  'AssistantPage'
);

/* ----------------------------------------------------------------
 * Feature: LaTeX Writer
 * ---------------------------------------------------------------- */

export const LaTeXWriterPage = lazyWithRetry(
  () => import('../../pages/latex-writer'),
  'LaTeXWriterPage'
);

/* ----------------------------------------------------------------
 * Static Pages
 * ---------------------------------------------------------------- */

export const AboutPage = lazyWithRetry(
  () => import('../../pages/AboutPage'),
  'AboutPage'
);
export const ContactPage = lazyWithRetry(
  () => import('../../pages/ContactPage'),
  'ContactPage'
);
export const DisclaimerPage = lazyWithRetry(
  () => import('../../pages/DisclaimerPage'),
  'DisclaimerPage'
);
export const PrivacyPage = lazyWithRetry(
  () => import('../../pages/PrivacyPage'),
  'PrivacyPage'
);
export const TermsPage = lazyWithRetry(
  () => import('../../pages/TermsPage'),
  'TermsPage'
);
export const FeedbackPage = lazyWithRetry(
  () => import('../../pages/FeedbackPage'),
  'FeedbackPage'
);
export const NotFoundPage = lazyWithRetry(
  () => import('../../pages/NotFoundPage'),
  'NotFoundPage'
);
export const HelpCenterPage = lazyWithRetry(
  () => import('../../pages/HelpCenterPage'),
  'HelpCenterPage'
);
export const ResourceCenterPage = lazyWithRetry(
  () => import('../../pages/ResourceCenterPage'),
  'ResourceCenterPage'
);
export const ResourceArticlePage = lazyWithRetry(
  () => import('../../pages/ResourceArticlePage'),
  'ResourceArticlePage'
);

/* ----------------------------------------------------------------
 * Auth Callbacks
 * ---------------------------------------------------------------- */

export const WeChatCallback = lazyWithRetry(
  () => import('../../pages/WeChatCallback'),
  'WeChatCallback'
);
export const GithubCallback = lazyWithRetry(
  () => import('../../pages/GithubCallback'),
  'GithubCallback'
);

/* ----------------------------------------------------------------
 * Auth Modal
 * ---------------------------------------------------------------- */

export const AuthModal = lazyWithRetry(
  () => import('../../components/AuthModal'),
  'AuthModal'
);

/* ----------------------------------------------------------------
 * Feature Landing Pages
 * ---------------------------------------------------------------- */

export const SearchFeaturePage = lazyWithRetry(
  () => import('../../pages/features/SearchFeaturePage'),
  'SearchFeaturePage'
);
export const LaTeXFeaturePage = lazyWithRetry(
  () => import('../../pages/features/LaTeXFeaturePage'),
  'LaTeXFeaturePage'
);
export const PeerReviewFeaturePage = lazyWithRetry(
  () => import('../../pages/features/PeerReviewFeaturePage'),
  'PeerReviewFeaturePage'
);

/* ----------------------------------------------------------------
 * Feature Landing Pages V2 (dark theme)
 * ---------------------------------------------------------------- */

export const AiReviewFeaturePageV2 = lazyWithRetry(
  () => import('../../pages/features/v2/AiReviewFeaturePage'),
  'AiReviewFeaturePageV2'
);
export const AiSearchFeaturePageV2 = lazyWithRetry(
  () => import('../../pages/features/v2/AiSearchFeaturePage'),
  'AiSearchFeaturePageV2'
);
export const AiWritingFeaturePageV2 = lazyWithRetry(
  () => import('../../pages/features/v2/AiWritingFeaturePage'),
  'AiWritingFeaturePageV2'
);
export const AiTranslationFeaturePageV2 = lazyWithRetry(
  () => import('../../pages/features/v2/AiTranslationFeaturePage'),
  'AiTranslationFeaturePageV2'
);
export const DataExtractionFeaturePageV2 = lazyWithRetry(
  () => import('../../pages/features/v2/DataExtractionFeaturePage'),
  'DataExtractionFeaturePageV2'
);
export const JournalMatcherFeaturePageV2 = lazyWithRetry(
  () => import('../../pages/features/v2/JournalMatcherFeaturePage'),
  'JournalMatcherFeaturePageV2'
);
export const AiAssistantFeaturePageV2 = lazyWithRetry(
  () => import('../../pages/features/v2/AiAssistantFeaturePage'),
  'AiAssistantFeaturePageV2'
);

/* ----------------------------------------------------------------
 * V2 Review (Agent-based)
 * ---------------------------------------------------------------- */
export const ReviewPageV2 = lazyWithRetry(
  () => import('../../pages/ReviewPageV2'),
  'ReviewPageV2'
);

/* ----------------------------------------------------------------
 * Blog
 * ---------------------------------------------------------------- */

export const BlogListPage = lazyWithRetry(
  () => import('../../pages/blog/BlogListPage'),
  'BlogListPage'
);
export const BlogArticlePage = lazyWithRetry(
  () => import('../../pages/blog/BlogArticlePage'),
  'BlogArticlePage'
);

/* ----------------------------------------------------------------
 * Admin Pages
 * ---------------------------------------------------------------- */

export const AdminDashboardLayout = lazyWithRetry(
  () => import('../../components/admin/DashboardLayout'),
  'AdminDashboardLayout'
);
export const AdminDashboardHome = lazyWithRetry(
  () => import('../../pages/admin/DashboardHome'),
  'AdminDashboardHome'
);
export const AdminUserManagement = lazyWithRetry(
  () => import('../../pages/admin/UserManagement'),
  'AdminUserManagement'
);
export const AdminThirdPartyAccounts = lazyWithRetry(
  () => import('../../pages/admin/ThirdPartyAccounts'),
  'AdminThirdPartyAccounts'
);
export const AdminPromptTemplates = lazyWithRetry(
  () => import('../../pages/admin/PromptTemplates'),
  'AdminPromptTemplates'
);
export const AdminLatexAgentConfig = lazyWithRetry(
  () => import('../../pages/admin/LatexAgentConfig'),
  'AdminLatexAgentConfig'
);
export const AdminDefaultBusinessData = lazyWithRetry(
  () => import('../../pages/admin/DefaultBusinessData'),
  'AdminDefaultBusinessData'
);
export const AdminFeedbackManagement = lazyWithRetry(
  () => import('../../pages/admin/FeedbackManagement'),
  'AdminFeedbackManagement'
);
export const AdminHotContent = lazyWithRetry(
  () => import('../../pages/admin/HotContent'),
  'AdminHotContent'
);
export const AdminMessageManagement = lazyWithRetry(
  () => import('../../pages/admin/MessageManagement'),
  'AdminMessageManagement'
);
export const AdminMessageTemplates = lazyWithRetry(
  () => import('../../pages/admin/MessageTemplates'),
  'AdminMessageTemplates'
);
export const AdminCodeSnippets = lazyWithRetry(
  () => import('../../pages/admin/CodeSnippets'),
  'AdminCodeSnippets'
);
export const AdminSystemSettings = lazyWithRetry(
  () => import('../../pages/admin/SystemSettings'),
  'AdminSystemSettings'
);
