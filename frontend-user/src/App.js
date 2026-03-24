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
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './utils/AuthContext';
import { ToastProvider } from './components/ToastContainer';
import { SidebarProvider } from './contexts/SidebarContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';
import ErrorBoundary from './components/ErrorBoundary';
import NetworkStatusBar from './components/NetworkStatusBar';
import NotificationToast from './components/NotificationToast';
import CodeSnippetInjector from './components/CodeSnippetInjector';
import VersionUpdateBar from './components/VersionUpdateBar';
import { useVersionCheck } from './hooks';
import logger from './utils/logger';

// 落地页立即加载(最常访问的入口)
import LandingPage from './pages/LandingPage';
// 搜索页（原首页）立即加载
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
const SearchResultsPage = lazyWithRetry(() => import('./pages/SearchResultsPage'), 'SearchResultsPage');
const PaperDetailPage = lazyWithRetry(() => import('./pages/PaperDetailPage'), 'PaperDetailPage');
const ChatPage = lazyWithRetry(() => import('./pages/ChatPage'), 'ChatPage');
const PeerReviewPage = lazyWithRetry(() => import('./pages/PeerReviewPage'), 'PeerReviewPage');
const AssistantPage = lazyWithRetry(() => import('./pages/AssistantPage'), 'AssistantPage');
const Settings = lazyWithRetry(() => import('./pages/Settings'), 'Settings');
const WeChatCallback = lazyWithRetry(() => import('./pages/WeChatCallback'), 'WeChatCallback');
const GithubCallback = lazyWithRetry(() => import('./pages/GithubCallback'), 'GithubCallback');
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

function App() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  
  // 版本检测 - 检测到新版本时提示用户刷新
  const { hasUpdate, confirmUpdate, ignoreUpdate } = useVersionCheck({
    checkInterval: 5 * 60 * 1000, // 每 5 分钟检查一次
    enabled: process.env.NODE_ENV === 'production' // 只在生产环境启用
  });
  
  useEffect(() => {
    // Listen for auth:required event from API interceptor
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
    <HelmetProvider>
      <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
            <SidebarProvider>
              <Router>
                <Suspense fallback={<div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh',opacity:0.5}}>
                  <div style={{width:32,height:32,border:'3px solid currentColor',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>}>
                  <Routes>
                    {/* 营销落地页 - 独立布局，不使用 MainLayout */}
                    <Route path="/" element={<LandingPage />} />

                    {/* 所有功能页面都使用 MainLayout 包裹，显示通用顶部栏 */}
                    <Route element={<MainLayout />}>
                      {/* 搜索页（原首页搜索功能） */}
                      <Route path="/search" element={<Home />} />
                      <Route path="/search-results" element={<SearchResultsPage />} />
                      
                      {/* 兼容旧链接：智能分析页面重定向到搜索结果页（AI模式） */}
                      <Route path="/advanced-search" element={<Navigate to="/search-results?mode=ai" replace />} />
                      {/* 精品AI工具页面 - 允许未登录访问 */}
                      <Route path="/assistant" element={<AssistantPage />} />
                      {/* AI聊天页面 - 允许未登录访问 */}
                      <Route path="/chat" element={<ChatPage />} />
                      {/* 智能审稿页面 - 允许未登录访问 */}
                      <Route path="/peer-review" element={<PeerReviewPage />} />
                      {/* LaTeX论文编辑器页面 - 允许未登录访问 */}
                      <Route path="/latex-writer" element={<LaTeXWriterPage />} />

                      {/* 设置页面 - 需要登录 */}
                      <Route path="/settings" element={
                        <ProtectedRoute>
                          <Settings />
                        </ProtectedRoute>
                      } />
                      
                      {/* 论文详情 */}
                      <Route path="/paper/:paperId" element={<PaperDetailPage />} />
                      
                      {/* 反馈和关于我们页面 - 公开访问 */}
                      <Route path="/feedback" element={<FeedbackPage />} />
                      <Route path="/about" element={<AboutPage />} />
                      
                      {/* 隐私政策和服务条款页面 - 公开访问 (Google AdSense 必需) */}
                      <Route path="/privacy" element={<PrivacyPage />} />
                      <Route path="/terms" element={<TermsPage />} />
                      <Route path="/contact" element={<ContactPage />} />
                      <Route path="/disclaimer" element={<DisclaimerPage />} />
                      
                      {/* 学术资源中心和帮助中心 - 公开访问 (Google AdSense 原创内容页面) */}
                      <Route path="/resources" element={<ResourceCenterPage />} />
                      <Route path="/resources/:slug" element={<ResourceArticlePage />} />
                      <Route path="/help" element={<HelpCenterPage />} />
                      
                      {/* 博客 - 公开访问 (Google AdSense 原创内容) */}
                      <Route path="/blog" element={<BlogListPage />} />
                      <Route path="/blog/:slug" element={<BlogArticlePage />} />
                      
                    </Route>

                    {/* 功能宣传页面 - 独立落地页，不使用 MainLayout，有自己的导航和布局 */}
                    <Route path="/features/search" element={<SearchFeaturePage />} />
                    <Route path="/features/peer-review" element={<PeerReviewFeaturePage />} />
                    <Route path="/features/latex-writer" element={<LaTeXFeaturePage />} />

                    {/* 不使用 MainLayout 的路由（OAuth回调等） */}
                    
                    {/* WeChat callback - PUBLIC route (must be accessible without login for OAuth flow) */}
                    <Route path="/wechat/callback" element={<WeChatCallback />} />

                    {/* GitHub callback - PUBLIC route (must be accessible without login for OAuth flow) */}
                    <Route path="/github/callback" element={<GithubCallback />} />

                    {/* 404 页面 - 显示自定义 404 页面，利于 SEO 和 AdSense 审核 */}
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>

                  {/* Global auth modal for session expiry - 条件渲染避免不必要的组件加载 */}
                  {showAuthModal && (
                    <AuthModal
                      isOpen={showAuthModal}
                      onClose={() => setShowAuthModal(false)}
                      onLoginSuccess={() => setShowAuthModal(false)}
                    />
                  )}

                  
                  {/* 网络状态提示栏 */}
                  <NetworkStatusBar />
                  
                  {/* 站内信实时通知 */}
                  <NotificationToast />
                  
                  {/* SEO/广告/统计代码片段注入 */}
                  <CodeSnippetInjector />
                  
                  {/* 版本更新提示条 */}
                  {hasUpdate && (
                    <VersionUpdateBar 
                      onRefresh={confirmUpdate}
                      onDismiss={ignoreUpdate}
                    />
                  )}
                </Suspense>
              </Router>
            </SidebarProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
    </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
