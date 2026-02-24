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
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { OrderModalProvider } from './contexts/OrderModalContext';
import { RechargeModalProvider } from './contexts/RechargeModalContext';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './components/MainLayout';
import CheckinFloat from './components/CheckinFloat';
import ErrorBoundary from './components/ErrorBoundary';
import NetworkStatusBar from './components/NetworkStatusBar';
import WelcomeCheckinModal from './components/WelcomeCheckinModal';
import NotificationToast from './components/NotificationToast';
import OrderModal from './components/OrderModal';
import RechargeModal from './components/RechargeModal';
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
const SearchResultsPage = lazyWithRetry(() => import('./pages/SearchResultsPage'), 'SearchResultsPage');
const PaperDetailPage = lazyWithRetry(() => import('./pages/PaperDetailPage'), 'PaperDetailPage');
const ChatPage = lazyWithRetry(() => import('./pages/ChatPage'), 'ChatPage');
const PeerReviewPage = lazyWithRetry(() => import('./pages/PeerReviewPage'), 'PeerReviewPage');
const AssistantPage = lazyWithRetry(() => import('./pages/AssistantPage'), 'AssistantPage');
const Pricing = lazyWithRetry(() => import('./pages/Pricing'), 'Pricing');
const Settings = lazyWithRetry(() => import('./pages/Settings'), 'Settings');
const FundCenter = lazyWithRetry(() => import('./pages/FundCenter'), 'FundCenter');
const WeChatCallback = lazyWithRetry(() => import('./pages/WeChatCallback'), 'WeChatCallback');
const GithubCallback = lazyWithRetry(() => import('./pages/GithubCallback'), 'GithubCallback');
const OrderConfirmation = lazyWithRetry(() => import('./pages/OrderConfirmation'), 'OrderConfirmation');
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
  
  // OAuth注册后的欢迎弹窗状态（合并弹窗）
  const [showWelcomeCheckinModal, setShowWelcomeCheckinModal] = useState(false);
  const [welcomeGiftAmount, setWelcomeGiftAmount] = useState(0);
  const [checkinResultForModal, setCheckinResultForModal] = useState(null);
  const [checkinHistoryForModal, setCheckinHistoryForModal] = useState([]);
  const [checkinDetailsForModal, setCheckinDetailsForModal] = useState([]);
  const [futureRewardsForModal, setFutureRewardsForModal] = useState([]);

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

  // 检查并显示待处理的欢迎+签到合并弹窗
  const checkPendingWelcomeCheckinModal = () => {
    const pendingWelcomeData = localStorage.getItem('pending_welcome_modal');
    const pendingCheckinData = localStorage.getItem('pending_checkin_result');
    
    console.log('[App] checkPendingWelcomeCheckinModal:', { pendingWelcomeData, pendingCheckinData });
    
    let hasWelcome = false;
    let hasCheckin = false;
    
    // 解析欢迎数据
    if (pendingWelcomeData) {
      try {
        const { giftAmount, timestamp } = JSON.parse(pendingWelcomeData);
        // 只在5分钟内有效
        if (Date.now() - timestamp < 5 * 60 * 1000 && giftAmount > 0) {
          console.log('[App] Welcome gift amount:', giftAmount);
          setWelcomeGiftAmount(giftAmount);
          hasWelcome = true;
        }
      } catch (e) {
        console.error('[App] Failed to parse welcome modal data:', e);
      }
      localStorage.removeItem('pending_welcome_modal');
    }
    
    // 解析签到数据
    if (pendingCheckinData) {
      try {
        const checkinData = JSON.parse(pendingCheckinData);
        // 只在1分钟内有效
        if (Date.now() - checkinData.timestamp < 60 * 1000) {
          console.log('[App] Checkin result:', checkinData);
          setCheckinResultForModal(checkinData);
          setCheckinHistoryForModal(checkinData.checkinHistory || []);
          setCheckinDetailsForModal(checkinData.checkinDetails || []);
          setFutureRewardsForModal(checkinData.futureRewards || []);
          hasCheckin = true;
        }
      } catch (e) {
        console.error('[App] Failed to parse checkin result data:', e);
      }
      localStorage.removeItem('pending_checkin_result');
    }
    
    // 如果有任一数据，显示合并弹窗
    if (hasWelcome || hasCheckin) {
      console.log('[App] Showing welcome checkin modal');
      setShowWelcomeCheckinModal(true);
    }
  };

  // 检查是否有待显示的欢迎弹窗（OAuth注册后 或 页面刷新后）
  useEffect(() => {
    // 延迟执行，确保页面已经加载完成
    const timer = setTimeout(checkPendingWelcomeCheckinModal, 500);
    return () => clearTimeout(timer);
  }, []);

  // 监听自定义事件，用于普通注册后
  // 注册成功后不立即显示弹窗，等待签到完成后由 show:welcome_checkin_modal 事件触发
  useEffect(() => {
    const handleShowWelcomeModal = () => {
      // 注册成功后，不立即显示弹窗
      // 等待 CheckinFloat 完成签到后触发 show:welcome_checkin_modal 事件
      console.log('[App] show:welcome_modal received, waiting for checkin to complete...');
    };

    window.addEventListener('show:welcome_modal', handleShowWelcomeModal);
    return () => {
      window.removeEventListener('show:welcome_modal', handleShowWelcomeModal);
    };
  }, []);

  // 监听合并弹窗事件（签到完成后触发，此时欢迎数据和签到数据都已准备好）
  useEffect(() => {
    const handleShowWelcomeCheckinModal = () => {
      console.log('[App] show:welcome_checkin_modal received, showing combined modal');
      checkPendingWelcomeCheckinModal();
    };

    window.addEventListener('show:welcome_checkin_modal', handleShowWelcomeCheckinModal);
    return () => {
      window.removeEventListener('show:welcome_checkin_modal', handleShowWelcomeCheckinModal);
    };
  }, []);

  return (
    <ErrorBoundary showDetails={process.env.NODE_ENV === 'development'}>
    <HelmetProvider>
      <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <SidebarProvider>
              <OrderModalProvider>
              <RechargeModalProvider>
              <Router>
                <Suspense fallback={null}>
                  <Routes>
                    {/* 所有页面都使用 MainLayout 包裹，显示通用顶部栏 */}
                    <Route element={<MainLayout />}>
                      {/* 公开路由 - 无需登录即可访问 */}
                      <Route path="/" element={<Home />} />
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

                      {/* 定价页面 */}
                      <Route path="/pricing" element={<Pricing />} />
                      
                      {/* 设置页面 - 需要登录 */}
                      <Route path="/settings" element={
                        <ProtectedRoute>
                          <Settings />
                        </ProtectedRoute>
                      } />
                      
                      {/* 基金中心 */}
                      <Route path="/fund-center" element={<FundCenter />} />
                      
                      {/* 论文详情 */}
                      <Route path="/paper/:paperId" element={<PaperDetailPage />} />
                      
                      {/* 订单确认 - 需要登录 */}
                      <Route path="/order-confirmation" element={
                        <ProtectedRoute>
                          <OrderConfirmation />
                        </ProtectedRoute>
                      } />

                      {/* 反馈和关于我们页面 - 公开访问 */}
                      <Route path="/feedback" element={<FeedbackPage />} />
                      <Route path="/about" element={<AboutPage />} />
                      
                      {/* 隐私政策和服务条款页面 - 公开访问 (Google AdSense 必需) */}
                      <Route path="/privacy" element={<PrivacyPage />} />
                      <Route path="/terms" element={<TermsPage />} />
                      <Route path="/contact" element={<ContactPage />} />
                      <Route path="/disclaimer" element={<DisclaimerPage />} />
                      
                      {/* 功能宣传页面 - 独立设计的工具介绍落地页 */}
                      <Route path="/features/search" element={<SearchFeaturePage />} />
                      <Route path="/features/peer-review" element={<PeerReviewFeaturePage />} />
                      <Route path="/features/latex-writer" element={<LaTeXFeaturePage />} />

                      {/* 学术资源中心和帮助中心 - 公开访问 (Google AdSense 原创内容页面) */}
                      <Route path="/resources" element={<ResourceCenterPage />} />
                      <Route path="/resources/:slug" element={<ResourceArticlePage />} />
                      <Route path="/help" element={<HelpCenterPage />} />
                      
                      {/* 支付宝回调页面 */}
                      <Route path="/alipay-return" element={<AlipayReturn />} />
                    </Route>

                    {/* 不使用 MainLayout 的路由（OAuth回调等） */}
                    <Route path="/search" element={<Navigate to="/" replace />} />
                    
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

                  {/* 签到悬浮球 - 登录状态下且今日未签到时显示 */}
                  <CheckinFloat />
                  
                  {/* 网络状态提示栏 */}
                  <NetworkStatusBar />
                  
                  {/* 站内信实时通知 */}
                  <NotificationToast />
                  
                  {/* OAuth注册后的欢迎+签到合并弹窗 */}
                  <WelcomeCheckinModal
                    isOpen={showWelcomeCheckinModal}
                    onClose={() => {
                      setShowWelcomeCheckinModal(false);
                      setCheckinResultForModal(null);
                      setWelcomeGiftAmount(0);
                    }}
                    welcomeGiftAmount={welcomeGiftAmount}
                    checkinResult={checkinResultForModal}
                    checkinHistory={checkinHistoryForModal}
                    checkinDetails={checkinDetailsForModal}
                    futureRewards={futureRewardsForModal}
                  />
                  
                  {/* 全局订单弹窗 */}
                  <OrderModal />
                  
                  {/* 全局充值弹窗 */}
                  <RechargeModal />

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
              </RechargeModalProvider>
              </OrderModalProvider>
            </SidebarProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
    </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
