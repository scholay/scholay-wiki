/**
 * AppRouter — 完整路由树
 *
 * 从 App.js 迁移而来，包含所有路由定义 + 全局浮层组件。
 * 配合 AppProviders 使用，Router 已在 Provider 层。
 */

import React, { useState, useEffect, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import MainLayout from '../../components/MainLayout';
import NetworkStatusBar from '../../components/NetworkStatusBar';
import NotificationToast from '../../components/NotificationToast';
import CodeSnippetInjector from '../../components/CodeSnippetInjector';
import VersionUpdateBar from '../../components/VersionUpdateBar';
import { useVersionCheck } from '../../hooks';
import { ProtectedRoute, AdminRoute } from './guards';

import LandingPage from '../../pages/LandingPage';
import Home from '../../pages/Home';

import {
  SearchResultsPage,
  PaperDetailPage,
  ChatPage,
  PeerReviewPage,
  AssistantPage,
  Settings,
  LaTeXWriterPage,
  WeChatCallback,
  GithubCallback,
  FeedbackPage,
  AboutPage,
  PrivacyPage,
  TermsPage,
  ContactPage,
  DisclaimerPage,
  AuthModal,
  NotFoundPage,
  ResourceCenterPage,
  ResourceArticlePage,
  HelpCenterPage,
  BlogListPage,
  BlogArticlePage,
  SearchFeaturePage,
  PeerReviewFeaturePage,
  LaTeXFeaturePage,
  AiReviewFeaturePageV2,
  AiSearchFeaturePageV2,
  AiWritingFeaturePageV2,
  AiTranslationFeaturePageV2,
  DataExtractionFeaturePageV2,
  JournalMatcherFeaturePageV2,
  AiAssistantFeaturePageV2,
  ReviewPageV2,
  AdminDashboardLayout,
  AdminDashboardHome,
  AdminUserManagement,
  AdminThirdPartyAccounts,
  AdminPromptTemplates,
  AdminLatexAgentConfig,
  AdminDefaultBusinessData,
  AdminFeedbackManagement,
  AdminHotContent,
  AdminMessageManagement,
  AdminMessageTemplates,
  AdminCodeSnippets,
  AdminSystemSettings,
} from './lazyImports';

const LoadingFallback = (
  <div
    style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
    }}
  >
    <Spin size="large" />
  </div>
);

export const AppRouter: React.FC = () => {
  const [showAuthModal, setShowAuthModal] = useState(false);

  const { hasUpdate, confirmUpdate, ignoreUpdate } = useVersionCheck({
    checkInterval: 5 * 60 * 1000,
    enabled: import.meta.env.PROD,
  });

  useEffect(() => {
    const handle = () => setShowAuthModal(true);
    window.addEventListener('auth:required', handle);
    return () => window.removeEventListener('auth:required', handle);
  }, []);

  return (
    <Suspense fallback={LoadingFallback}>
      <Routes>
        {/* 营销落地页 */}
        <Route path="/" element={<LandingPage />} />

        {/* MainLayout 包裹的功能页 */}
        <Route element={<MainLayout />}>
          <Route path="/search" element={<Home />} />
          <Route path="/search-results" element={<SearchResultsPage />} />
          <Route
            path="/advanced-search"
            element={<Navigate to="/search-results?mode=ai" replace />}
          />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/peer-review" element={<PeerReviewPage />} />
          <Route path="/latex-writer" element={<LaTeXWriterPage />} />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          <Route path="/paper/:paperId" element={<PaperDetailPage />} />
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
        </Route>

        {/* 功能宣传页（独立布局） */}
        <Route path="/features/search" element={<SearchFeaturePage />} />
        <Route
          path="/features/peer-review"
          element={<PeerReviewFeaturePage />}
        />
        <Route
          path="/features/latex-writer"
          element={<LaTeXFeaturePage />}
        />

        {/* 功能宣传页 V2（深色主题，独立布局） */}
        <Route path="/features/ai-review" element={<AiReviewFeaturePageV2 />} />
        <Route path="/features/ai-search" element={<AiSearchFeaturePageV2 />} />
        <Route path="/features/ai-writing" element={<AiWritingFeaturePageV2 />} />
        <Route path="/features/ai-translation" element={<AiTranslationFeaturePageV2 />} />
        <Route path="/features/data-extraction" element={<DataExtractionFeaturePageV2 />} />
        <Route path="/features/journal-matcher" element={<JournalMatcherFeaturePageV2 />} />
        <Route path="/features/ai-assistant" element={<AiAssistantFeaturePageV2 />} />

        {/* V2 审稿功能页（独立布局） */}
        <Route path="/review" element={<ReviewPageV2 />} />

        {/* OAuth 回调 */}
        <Route path="/wechat/callback" element={<WeChatCallback />} />
        <Route path="/github/callback" element={<GithubCallback />} />

        {/* Admin 管理台 */}
        <Route path="/admin/login" element={<Navigate to="/" />} />
        <Route
          path="/admin/dashboard"
          element={
            <AdminRoute>
              <AdminDashboardLayout />
            </AdminRoute>
          }
        >
          <Route index element={<AdminDashboardHome />} />
          <Route path="users" element={<AdminUserManagement />} />
          <Route
            path="third-party-accounts"
            element={<AdminThirdPartyAccounts />}
          />
          <Route path="prompt-templates" element={<AdminPromptTemplates />} />
          <Route
            path="latex-agent-config"
            element={<AdminLatexAgentConfig />}
          />
          <Route
            path="default-business-data"
            element={<AdminDefaultBusinessData />}
          />
          <Route path="feedbacks" element={<AdminFeedbackManagement />} />
          <Route path="hot-content" element={<AdminHotContent />} />
          <Route path="messages" element={<AdminMessageManagement />} />
          <Route
            path="message-templates"
            element={<AdminMessageTemplates />}
          />
          <Route path="code-snippets" element={<AdminCodeSnippets />} />
          <Route path="settings" element={<AdminSystemSettings />} />
        </Route>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      {/* 全局浮层组件 */}
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
    </Suspense>
  );
};

export default AppRouter;
