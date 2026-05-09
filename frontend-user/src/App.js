/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { queryClient } from './services/queryClient';
import { AuthBootstrap } from './utils/AuthContext';
import { ToastRenderer } from './components/common/ToastContainer';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import MainLayout from './components/MainLayout';
import ErrorBoundary, { PageErrorBoundary } from './components/common/ErrorBoundary';
import NetworkStatusBar from './components/common/NetworkStatusBar';
import NotificationToast from './components/common/NotificationToast';
import CodeSnippetInjector from './components/common/CodeSnippetInjector';
import VersionUpdateBar from './components/common/VersionUpdateBar';
import ScrollToTop from './components/common/ScrollToTop';
import { useVersionCheck } from './hooks';
import logger from './utils/logger';

/**
 * 带重试的懒加载函数
 * 当 chunk 加载失败时（通常是因为版本更新后旧文件已删除），自动刷新页面
 */
const lazyWithRetry = (componentImport, componentName = 'Component') => {
  return lazy(async () => {
    // 检查是否已经尝试过刷新（防止无限刷新循环）
    const hasRefreshed = sessionStorage.getItem(`chunk_refresh_${componentName}`);
    
    try {
      const component = await componentImport();
      // 加载成功，清除刷新标记
      sessionStorage.removeItem(`chunk_refresh_${componentName}`);
      return component;
    } catch (error) {
      logger.error(`[LazyLoad] Failed to load ${componentName}:`, error);
      
      // 检查是否为 ChunkLoadError（webpack 动态导入失败）
      if (error.name === 'ChunkLoadError' || 
          error.message?.includes('Loading chunk') ||
          error.message?.includes('Loading CSS chunk')) {
        
        if (!hasRefreshed) {
          // 标记已尝试刷新，防止循环
          sessionStorage.setItem(`chunk_refresh_${componentName}`, 'true');
          logger.log(`[LazyLoad] Chunk load failed for ${componentName}, refreshing page...`);
          // 延迟刷新，让用户看到错误提示
          setTimeout(() => {
            window.location.reload();
          }, 100);
        } else {
          logger.error(`[LazyLoad] Chunk load failed after refresh for ${componentName}`);
        }
      }
      
      throw error;
    }
  });
};

// 首页也懒加载 — 减少初始 bundle，首次加载更快
const Home = lazyWithRetry(() => import('./pages/Home'), 'Home');

// 其他页面使用懒加载 - 大幅减少初始bundle大小
// 使用 lazyWithRetry 包装，处理 chunk 加载失败的情况
const SearchResultsPage = lazyWithRetry(() => import('./pages/search-results/SearchResultsPage'), 'SearchResultsPage');
// /paper/:slug landing — resolves slug to paperId then navigates to search-results detail
const PaperLandingPage = lazyWithRetry(() => import('./pages/PaperLandingPage'), 'PaperLandingPage');
// /author/:slug landing — resolves slug to authorId then navigates to search-results author view
const AuthorLandingPage = lazyWithRetry(() => import('./pages/AuthorLandingPage'), 'AuthorLandingPage');
const ChatPage = lazyWithRetry(() => import('./pages/ChatPage'), 'ChatPage');
const PeerReviewPage = lazyWithRetry(() => import('./pages/PeerReviewPage'), 'PeerReviewPage');
const AssistantPage = lazyWithRetry(() => import('./pages/AssistantPage'), 'AssistantPage');
const Pricing = lazyWithRetry(() => import('./pages/Pricing'), 'Pricing');
const Settings = lazyWithRetry(() => import('./pages/Settings'), 'Settings');
const WeChatCallback = lazyWithRetry(() => import('./pages/WeChatCallback'), 'WeChatCallback');
const GithubCallback = lazyWithRetry(() => import('./pages/GithubCallback'), 'GithubCallback');
const AppleCallback = lazyWithRetry(() => import('./pages/AppleCallback'), 'AppleCallback');
const OrcidCallback = lazyWithRetry(() => import('./pages/OAuthCallback').then(m => ({ default: m.OrcidCallback })), 'OrcidCallback');
const MicrosoftCallback = lazyWithRetry(() => import('./pages/OAuthCallback').then(m => ({ default: m.MicrosoftCallback })), 'MicrosoftCallback');
const DiscourseCallback = lazyWithRetry(() => import('./pages/DiscourseCallback'), 'DiscourseCallback');
const AlipayReturn = lazyWithRetry(() => import('./pages/AlipayReturn'), 'AlipayReturn');
const FeedbackPage = lazyWithRetry(() => import('./pages/FeedbackPage'), 'FeedbackPage');
const AboutPage = lazyWithRetry(() => import('./pages/AboutPage'), 'AboutPage');
const PrivacyPage = lazyWithRetry(() => import('./pages/PrivacyPage'), 'PrivacyPage');
const TermsPage = lazyWithRetry(() => import('./pages/TermsPage'), 'TermsPage');
const ContactPage = lazyWithRetry(() => import('./pages/ContactPage'), 'ContactPage');
const DisclaimerPage = lazyWithRetry(() => import('./pages/DisclaimerPage'), 'DisclaimerPage');
const AuthModal = lazyWithRetry(() => import('./components/auth/AuthModal'), 'AuthModal');
const LaTeXWriterPage = lazyWithRetry(() => import('./pages/latex-writer'), 'LaTeXWriterPage');
const NotFoundPage = lazyWithRetry(() => import('./pages/NotFoundPage'), 'NotFoundPage');
const DocsLayout = lazyWithRetry(() => import('./components/DocsLayout'), 'DocsLayout');
const ResourceCenterPage = lazyWithRetry(() => import('./pages/ResourceCenterPage'), 'ResourceCenterPage');
const ResourceArticlePage = lazyWithRetry(() => import('./pages/ResourceArticlePage'), 'ResourceArticlePage');
const HelpCenterPage = lazyWithRetry(() => import('./pages/HelpCenterPage'), 'HelpCenterPage');
const BlogListPage = lazyWithRetry(() => import('./pages/blog/BlogListPage'), 'BlogListPage');
const BlogArticlePage = lazyWithRetry(() => import('./pages/blog/BlogArticlePage'), 'BlogArticlePage');
const SearchFeaturePage = lazyWithRetry(() => import('./pages/features/SearchFeaturePage'), 'SearchFeaturePage');
const PeerReviewFeaturePage = lazyWithRetry(() => import('./pages/features/PeerReviewFeaturePage'), 'PeerReviewFeaturePage');
const LaTeXFeaturePage = lazyWithRetry(() => import('./pages/features/LaTeXFeaturePage'), 'LaTeXFeaturePage');
const FeaturesOverview = lazyWithRetry(() => import('./pages/FeaturesOverview'), 'FeaturesOverview');
const AdminRoot = lazyWithRetry(() => import('./admin/AdminRoot'), 'AdminRoot');
// v2 layout — shadcn/ui + 新 IA (5 一级菜单 + 配置中心)
const AdminDashboardLayoutV2 = lazyWithRetry(() => import('./admin/components/v2/DashboardLayoutV2'), 'AdminDashboardLayoutV2');

// v2 已迁移的页面
const AdminUserManagementV2 = lazyWithRetry(() => import('./admin/pages/v2/UserManagementV2'), 'AdminUserManagementV2');
const AdminUserTagManagementV2 = lazyWithRetry(() => import('./admin/pages/v2/UserTagManagementV2'), 'AdminUserTagManagementV2');
const AdminThirdPartyAccountsV2 = lazyWithRetry(() => import('./admin/pages/v2/ThirdPartyAccountsV2'), 'AdminThirdPartyAccountsV2');
const AdminHotContentV2 = lazyWithRetry(() => import('./admin/pages/v2/HotContentV2'), 'AdminHotContentV2');
const AdminFeedbackManagementV2 = lazyWithRetry(() => import('./admin/pages/v2/FeedbackManagementV2'), 'AdminFeedbackManagementV2');
const AdminUsageLogsV2 = lazyWithRetry(() => import('./admin/pages/v2/UsageLogsV2'), 'AdminUsageLogsV2');
const AdminAuditLogsV2 = lazyWithRetry(() => import('./admin/pages/v2/AuditLogsV2'), 'AdminAuditLogsV2');
const AdminAnnouncementsV2 = lazyWithRetry(() => import('./admin/pages/v2/AnnouncementManagementV2'), 'AdminAnnouncementsV2');
const AdminPromptTemplatesV2 = lazyWithRetry(() => import('./admin/pages/v2/PromptTemplatesV2'), 'AdminPromptTemplatesV2');
const AdminCodeSnippetsV2 = lazyWithRetry(() => import('./admin/pages/v2/CodeSnippetsV2'), 'AdminCodeSnippetsV2');
const AdminMessageManagementV2 = lazyWithRetry(() => import('./admin/pages/v2/MessageManagementV2'), 'AdminMessageManagementV2');
const AdminMessageTemplatesV2 = lazyWithRetry(() => import('./admin/pages/v2/MessageTemplatesV2'), 'AdminMessageTemplatesV2');
const AdminDashboardHomeV2 = lazyWithRetry(() => import('./admin/pages/v2/DashboardHomeV2'), 'AdminDashboardHomeV2');
const AdminLatexAgentConfigV2 = lazyWithRetry(() => import('./admin/pages/v2/LatexAgentConfigV2'), 'AdminLatexAgentConfigV2');
const AdminDefaultBusinessDataV2 = lazyWithRetry(() => import('./admin/pages/v2/DefaultBusinessDataV2'), 'AdminDefaultBusinessDataV2');
const AdminPaymentConfigV2 = lazyWithRetry(() => import('./admin/pages/v2/config/PaymentConfigV2'), 'AdminPaymentConfigV2');
const AdminOAuthConfigV2 = lazyWithRetry(() => import('./admin/pages/v2/config/OAuthConfigV2'), 'AdminOAuthConfigV2');
const AdminMessagingConfigV2 = lazyWithRetry(() => import('./admin/pages/v2/config/MessagingConfigV2'), 'AdminMessagingConfigV2');
const AdminPlatformConfigV2 = lazyWithRetry(() => import('./admin/pages/v2/config/PlatformConfigV2'), 'AdminPlatformConfigV2');

// 老页面已全部 v2 化并删除,这里不再 import
// 如需回滚个别页面,请从 git 历史恢复对应 .tsx + .css + lazy import

function App() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // 版本检测 - 检测到新版本时提示用户刷新
  const { hasUpdate, confirmUpdate, ignoreUpdate } = useVersionCheck({
    checkInterval: 5 * 60 * 1000, // 每 5 分钟检查一次
    enabled: process.env.NODE_ENV === 'production' // 只在生产环境启用
  });
  
  useEffect(() => {
    // 监听 API 拦截器的登录态过期事件
    const handleAuthRequired = () => {
      setShowAuthModal(true);
    };

    window.addEventListener('auth:required', handleAuthRequired);
    return () => {
      window.removeEventListener('auth:required', handleAuthRequired);
    };
  }, []);

  return (
    <ErrorBoundary showDetails={process.env.NODE_ENV === 'development'}>
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <Router>
            <ScrollToTop />
            <Suspense fallback={null}>
              <Routes>
                <Route
                  path="/admin"
                  element={
                    <AdminRoute>
                      <PageErrorBoundary>
                        <AdminRoot />
                      </PageErrorBoundary>
                    </AdminRoute>
                  }
                >
                  <Route element={<AdminDashboardLayoutV2 />}>
                    <Route index element={<AdminDashboardHomeV2 />} />
                    {/* 用户与权限 */}
                    <Route path="users" element={<AdminUserManagementV2 />} />
                    <Route path="user-tags" element={<AdminUserTagManagementV2 />} />

                    {/* 内容运营 */}
                    <Route path="hot-content" element={<AdminHotContentV2 />} />
                    <Route path="feedbacks" element={<AdminFeedbackManagementV2 />} />
                    <Route path="messages" element={<AdminMessageManagementV2 />} />
                    <Route path="message-templates" element={<AdminMessageTemplatesV2 />} />
                    <Route path="code-snippets" element={<AdminCodeSnippetsV2 />} />
                    <Route path="announcements" element={<AdminAnnouncementsV2 />} />

                    {/* AI 配置 */}
                    <Route path="prompt-templates" element={<AdminPromptTemplatesV2 />} />
                    <Route path="latex-agent" element={<AdminLatexAgentConfigV2 />} />
                    <Route path="business-data" element={<AdminDefaultBusinessDataV2 />} />

                    {/* 数据分析 */}
                    <Route path="usage-logs" element={<AdminUsageLogsV2 />} />
                    <Route path="audit-logs" element={<AdminAuditLogsV2 />} />

                    {/* 配置中心 — 全部 v2 化 */}
                    <Route path="config/third-party" element={<AdminThirdPartyAccountsV2 />} />
                    <Route path="config/payment" element={<AdminPaymentConfigV2 />} />
                    <Route path="config/oauth" element={<AdminOAuthConfigV2 />} />
                    <Route path="config/messaging" element={<AdminMessagingConfigV2 />} />
                    <Route path="config/platform" element={<AdminPlatformConfigV2 />} />

                    {/* 旧路径兼容 */}
                    <Route path="third-party-accounts" element={<Navigate to="/admin/config/third-party" replace />} />
                    <Route path="latex-agent-config" element={<Navigate to="/admin/latex-agent" replace />} />
                    <Route path="default-business-data" element={<Navigate to="/admin/business-data" replace />} />
                    <Route path="settings" element={<Navigate to="/admin/config/platform" replace />} />
                    <Route path="alipay-config" element={<Navigate to="/admin/config/payment" replace />} />
                    <Route path="wechat-config" element={<Navigate to="/admin/config/payment" replace />} />
                  </Route>
                </Route>

                <Route path="/dashboard/*" element={<Navigate to="/admin" replace />} />

                <Route element={<MainLayout />}>
                  <Route path="/" element={<Home />} />
                  <Route path="/search-results" element={<PageErrorBoundary><SearchResultsPage /></PageErrorBoundary>} />
                  <Route path="/advanced-search" element={<Navigate to="/search-results?mode=ai" replace />} />
                  <Route path="/assistant" element={<PageErrorBoundary><AssistantPage /></PageErrorBoundary>} />
                  <Route path="/chat" element={<PageErrorBoundary><ChatPage /></PageErrorBoundary>} />
                  <Route path="/peer-review" element={<PageErrorBoundary><PeerReviewPage /></PageErrorBoundary>} />
                  <Route path="/latex-writer" element={<PageErrorBoundary><LaTeXWriterPage /></PageErrorBoundary>} />
                  <Route path="/settings" element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  } />
                  {/* SEO 着陆页：/paper/:slug → 解析 slug → 跳转到搜索结果详情 */}
                  <Route path="/paper/:slug" element={<PageErrorBoundary><PaperLandingPage /></PageErrorBoundary>} />
                  {/* SEO 着陆页：/author/:slug → 解析 slug → 跳转到搜索结果作者视图 */}
                  <Route path="/author/:slug" element={<PageErrorBoundary><AuthorLandingPage /></PageErrorBoundary>} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/disclaimer" element={<DisclaimerPage />} />
                  {/* /resources 列表页：全宽单栏，不走 DocsLayout */}
                  <Route path="/resources" element={<ResourceCenterPage />} />
                  {/* 文档/Wiki 布局：资源详情、博客、帮助中心 */}
                  <Route element={<DocsLayout />}>
                    <Route path="/resources/:slug" element={<ResourceArticlePage />} />
                    <Route path="/help" element={<HelpCenterPage />} />
                    <Route path="/blog" element={<BlogListPage />} />
                    <Route path="/blog/:slug" element={<BlogArticlePage />} />
                  </Route>
                  <Route path="/alipay-return" element={<AlipayReturn />} />
                </Route>

                {/* 营销/品牌页（自带 feat-nav，不走 MainLayout 的全局 TopNavBar） */}
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/features" element={<FeaturesOverview />} />
                <Route path="/features/search" element={<SearchFeaturePage />} />
                <Route path="/features/peer-review" element={<PeerReviewFeaturePage />} />
                <Route path="/features/latex-writer" element={<LaTeXFeaturePage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/feedback" element={<FeedbackPage />} />

                <Route path="/search" element={<Navigate to="/" replace />} />
                <Route path="/wechat/callback" element={<WeChatCallback />} />
                <Route path="/github/callback" element={<GithubCallback />} />
                <Route path="/apple/callback" element={<AppleCallback />} />
                <Route path="/orcid/callback" element={<OrcidCallback />} />
                <Route path="/microsoft/callback" element={<MicrosoftCallback />} />
                <Route path="/discourse/callback" element={<DiscourseCallback />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>

              {showAuthModal && (
                <AuthModal
                  isOpen={showAuthModal}
                  onClose={() => setShowAuthModal(false)}
                  onLoginSuccess={() => setShowAuthModal(false)}
                />
              )}

              <NetworkStatusBar />
              <NotificationToast />
              <CodeSnippetInjector />

              {hasUpdate && (
                <VersionUpdateBar
                  onRefresh={confirmUpdate}
                  onDismiss={ignoreUpdate}
                />
              )}

              <AuthBootstrap />
              <ToastRenderer />
            </Suspense>
          </Router>
        </HelmetProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
