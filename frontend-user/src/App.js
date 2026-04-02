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
import { ToastRenderer } from './components/ToastContainer';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import MainLayout from './components/MainLayout';
import ErrorBoundary, { PageErrorBoundary } from './components/ErrorBoundary';
import NetworkStatusBar from './components/NetworkStatusBar';
import NotificationToast from './components/NotificationToast';
import CodeSnippetInjector from './components/CodeSnippetInjector';
import VersionUpdateBar from './components/VersionUpdateBar';
import { useVersionCheck } from './hooks';
import logger from './utils/logger';

// 首页立即加载(最常访问)
import Home from './pages/Home';

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

// 其他页面使用懒加载 - 大幅减少初始bundle大小
// 使用 lazyWithRetry 包装，处理 chunk 加载失败的情况
const SearchResultsPage = lazyWithRetry(() => import('./pages/search-results/SearchResultsPage'), 'SearchResultsPage');
const PaperDetailPage = lazyWithRetry(() => import('./pages/PaperDetailPage'), 'PaperDetailPage');
const ChatPage = lazyWithRetry(() => import('./pages/ChatPage'), 'ChatPage');
const PeerReviewPage = lazyWithRetry(() => import('./pages/PeerReviewPage'), 'PeerReviewPage');
const AssistantPage = lazyWithRetry(() => import('./pages/AssistantPage'), 'AssistantPage');
const Pricing = lazyWithRetry(() => import('./pages/Pricing'), 'Pricing');
const Settings = lazyWithRetry(() => import('./pages/Settings'), 'Settings');
const WeChatCallback = lazyWithRetry(() => import('./pages/WeChatCallback'), 'WeChatCallback');
const GithubCallback = lazyWithRetry(() => import('./pages/GithubCallback'), 'GithubCallback');
const AlipayReturn = lazyWithRetry(() => import('./pages/AlipayReturn'), 'AlipayReturn');
const FeedbackPage = lazyWithRetry(() => import('./pages/FeedbackPage'), 'FeedbackPage');
const AboutPage = lazyWithRetry(() => import('./pages/AboutPage'), 'AboutPage');
const PrivacyPage = lazyWithRetry(() => import('./pages/PrivacyPage'), 'PrivacyPage');
const TermsPage = lazyWithRetry(() => import('./pages/TermsPage'), 'TermsPage');
const ContactPage = lazyWithRetry(() => import('./pages/ContactPage'), 'ContactPage');
const DisclaimerPage = lazyWithRetry(() => import('./pages/DisclaimerPage'), 'DisclaimerPage');
const AuthModal = lazyWithRetry(() => import('./components/AuthModal'), 'AuthModal');
const LaTeXWriterPage = lazyWithRetry(() => import('./pages/latex-writer'), 'LaTeXWriterPage');
const NotFoundPage = lazyWithRetry(() => import('./pages/NotFoundPage'), 'NotFoundPage');
const ResourceCenterPage = lazyWithRetry(() => import('./pages/ResourceCenterPage'), 'ResourceCenterPage');
const ResourceArticlePage = lazyWithRetry(() => import('./pages/ResourceArticlePage'), 'ResourceArticlePage');
const HelpCenterPage = lazyWithRetry(() => import('./pages/HelpCenterPage'), 'HelpCenterPage');
const BlogListPage = lazyWithRetry(() => import('./pages/blog/BlogListPage'), 'BlogListPage');
const BlogArticlePage = lazyWithRetry(() => import('./pages/blog/BlogArticlePage'), 'BlogArticlePage');
const SearchFeaturePage = lazyWithRetry(() => import('./pages/features/SearchFeaturePage'), 'SearchFeaturePage');
const PeerReviewFeaturePage = lazyWithRetry(() => import('./pages/features/PeerReviewFeaturePage'), 'PeerReviewFeaturePage');
const LaTeXFeaturePage = lazyWithRetry(() => import('./pages/features/LaTeXFeaturePage'), 'LaTeXFeaturePage');
const AdminRoot = lazyWithRetry(() => import('./admin/AdminRoot'), 'AdminRoot');
const AdminDashboardLayout = lazyWithRetry(() => import('./admin/components/DashboardLayout'), 'AdminDashboardLayout');
const AdminDashboardHome = lazyWithRetry(() => import('./admin/pages/DashboardHome'), 'AdminDashboardHome');
const AdminSystemSettings = lazyWithRetry(() => import('./admin/pages/SystemSettings'), 'AdminSystemSettings');
const AdminUserManagement = lazyWithRetry(() => import('./admin/pages/UserManagement'), 'AdminUserManagement');
const AdminThirdPartyAccounts = lazyWithRetry(() => import('./admin/pages/ThirdPartyAccounts'), 'AdminThirdPartyAccounts');
const AdminPromptTemplates = lazyWithRetry(() => import('./admin/pages/PromptTemplates'), 'AdminPromptTemplates');
const AdminLatexAgentConfig = lazyWithRetry(() => import('./admin/pages/LatexAgentConfig'), 'AdminLatexAgentConfig');
const AdminDefaultBusinessData = lazyWithRetry(() => import('./admin/pages/DefaultBusinessData'), 'AdminDefaultBusinessData');
const AdminFeedbackManagement = lazyWithRetry(() => import('./admin/pages/FeedbackManagement'), 'AdminFeedbackManagement');
const AdminUsageLogs = lazyWithRetry(() => import('./admin/pages/UsageLogs'), 'AdminUsageLogs');
const AdminHotContent = lazyWithRetry(() => import('./admin/pages/HotContent'), 'AdminHotContent');
const AdminMessageManagement = lazyWithRetry(() => import('./admin/pages/MessageManagement'), 'AdminMessageManagement');
const AdminMessageTemplates = lazyWithRetry(() => import('./admin/pages/MessageTemplates'), 'AdminMessageTemplates');
const AdminCodeSnippets = lazyWithRetry(() => import('./admin/pages/CodeSnippets'), 'AdminCodeSnippets');

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
                  <Route element={<AdminDashboardLayout />}>
                    <Route index element={<AdminDashboardHome />} />
                    <Route path="users" element={<AdminUserManagement />} />
                    <Route path="third-party-accounts" element={<AdminThirdPartyAccounts />} />
                    <Route path="prompt-templates" element={<AdminPromptTemplates />} />
                    <Route path="latex-agent-config" element={<AdminLatexAgentConfig />} />
                    <Route path="default-business-data" element={<AdminDefaultBusinessData />} />
                    <Route path="feedbacks" element={<AdminFeedbackManagement />} />
                    <Route path="usage-logs" element={<AdminUsageLogs />} />
                    <Route path="hot-content" element={<AdminHotContent />} />
                    <Route path="messages" element={<AdminMessageManagement />} />
                    <Route path="message-templates" element={<AdminMessageTemplates />} />
                    <Route path="code-snippets" element={<AdminCodeSnippets />} />
                    <Route path="settings" element={<AdminSystemSettings />} />
                    <Route path="alipay-config" element={<Navigate to="/admin/settings?tab=alipay" replace />} />
                    <Route path="wechat-config" element={<Navigate to="/admin/settings?tab=wechat" replace />} />
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
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/settings" element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  } />
                  <Route path="/paper/:paperId" element={<PageErrorBoundary><PaperDetailPage /></PageErrorBoundary>} />
                  <Route path="/feedback" element={<FeedbackPage />} />
                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/disclaimer" element={<DisclaimerPage />} />
                  <Route path="/resources" element={<ResourceCenterPage />} />
                  <Route path="/resources/:slug" element={<ResourceArticlePage />} />
                  <Route path="/help" element={<HelpCenterPage />} />
                  <Route path="/blog" element={<BlogListPage />} />
                  <Route path="/blog/:slug" element={<BlogArticlePage />} />
                  <Route path="/alipay-return" element={<AlipayReturn />} />
                </Route>

                <Route path="/features/search" element={<SearchFeaturePage />} />
                <Route path="/features/peer-review" element={<PeerReviewFeaturePage />} />
                <Route path="/features/latex-writer" element={<LaTeXFeaturePage />} />

                <Route path="/search" element={<Navigate to="/" replace />} />
                <Route path="/wechat/callback" element={<WeChatCallback />} />
                <Route path="/github/callback" element={<GithubCallback />} />
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
