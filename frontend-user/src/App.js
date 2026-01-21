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

// 首页立即加载(最常访问)
import Home from './pages/Home';

// 其他页面使用懒加载 - 大幅减少初始bundle大小
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const PaperDetailPage = lazy(() => import('./pages/PaperDetailPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const PeerReviewPage = lazy(() => import('./pages/PeerReviewPage'));
const AssistantPage = lazy(() => import('./pages/AssistantPage'));
const Pricing = lazy(() => import('./pages/Pricing'));
const Settings = lazy(() => import('./pages/Settings'));
const FundCenter = lazy(() => import('./pages/FundCenter'));
const WeChatCallback = lazy(() => import('./pages/WeChatCallback'));
const GithubCallback = lazy(() => import('./pages/GithubCallback'));
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation'));
const AlipayReturn = lazy(() => import('./pages/AlipayReturn'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const TermsPage = lazy(() => import('./pages/TermsPage'));
const AuthModal = lazy(() => import('./components/AuthModal'));

function App() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  
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
                      
                      {/* 支付宝回调页面 */}
                      <Route path="/alipay-return" element={<AlipayReturn />} />
                    </Route>

                    {/* 不使用 MainLayout 的路由（OAuth回调等） */}
                    <Route path="/search" element={<Navigate to="/" replace />} />
                    
                    {/* WeChat callback - PUBLIC route (must be accessible without login for OAuth flow) */}
                    <Route path="/wechat/callback" element={<WeChatCallback />} />

                    {/* GitHub callback - PUBLIC route (must be accessible without login for OAuth flow) */}
                    <Route path="/github/callback" element={<GithubCallback />} />

                    {/* 404 redirect to home */}
                    <Route path="*" element={<Navigate to="/" replace />} />
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
