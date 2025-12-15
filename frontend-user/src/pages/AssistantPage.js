/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useEffect, useState, lazy, Suspense } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { useSidebar } from '../contexts/SidebarContext';
import ThemeToggle from '../components/ThemeToggle';
import { trackAIAssistant, EntryPoint } from '../utils/usageTracker';
import './styles/AssistantPage.css';

const AuthModal = lazy(() => import('../components/AuthModal'));

function AssistantPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { resetSidebarConfig, isMobile, openMobileSidebar } = useSidebar();
  const outletContext = useOutletContext();
  const sidebarCollapsed = outletContext?.sidebarCollapsed ?? true;
  
  // 登录弹窗状态
  const [showAuthModal, setShowAuthModal] = useState(false);

  // 进入页面时清空侧边栏历史记录
  useEffect(() => {
    resetSidebarConfig();
  }, [resetSidebarConfig]);

  const tools = [
    {
      id: 'chat',
      title: 'AI 对话',
      description: '与 AI 进行学术对话，解答研究问题',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
      path: '/chat',
      color: '#10A37F',
    },
    {
      id: 'peer-review',
      title: 'AI 审稿',
      description: '上传论文，获取专业审稿意见',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M12 18l-2.4-1.2L7 18v-4l2.6 1.3L12 14l2.4 1.3L17 14v4l-2.6-1.2L12 18z"/>
        </svg>
      ),
      path: '/peer-review',
      color: '#6366f1',
    },
    // 将来可以在这里添加更多工具
    // {
    //   id: 'translation',
    //   title: '学术翻译',
    //   description: '专业学术论文翻译',
    //   icon: (...),
    //   path: '/translation',
    //   color: '#f59e0b',
    // },
  ];

  return (
    <div className={`ast-page-wrapper ${sidebarCollapsed ? 'ast-sidebar-collapsed' : 'ast-sidebar-expanded'}`}>
      <div className="ast-main-container">
        <div className="ast-content">
          <div className="ast-layout">
            {/* 顶部导航 */}
            <nav className="ast-navbar">
              {isMobile && (
                <button className="ast-mobile-menu-btn" onClick={openMobileSidebar}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="4" y1="8" x2="20" y2="8" />
                    <line x1="4" y1="16" x2="14" y2="16" />
                  </svg>
                </button>
              )}
              <div className="ast-navbar-left">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
                <span className="ast-navbar-title">文献助手</span>
              </div>
              
              {/* 未登录状态下显示登录按钮 */}
              {!isAuthenticated && !isMobile && (
                <div className="ast-navbar-right">
                  <button
                    onClick={() => navigate('/pricing')}
                    className="ast-btn-pricing"
                  >
                    价格方案
                  </button>
                  <ThemeToggle />
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="ast-btn-login-register"
                  >
                    登录 / 注册
                  </button>
                </div>
              )}
            </nav>

            {/* 主内容区 */}
            <div className="ast-main">
              {/* 页面标题 */}
              <div className="ast-header">
                <h1 className="ast-title">智能 AI 工具</h1>
                <p className="ast-subtitle">助力您的学术研究</p>
              </div>

              {/* 工具卡片网格 */}
              <div className="ast-tools-grid">
                {tools.map((tool) => (
                  <div
                    key={tool.id}
                    className="ast-tool-card"
                    onClick={() => navigate(tool.path)}
                  >
                    <div 
                      className="ast-tool-icon" 
                      style={{ 
                        background: `linear-gradient(135deg, ${tool.color}20 0%, ${tool.color}10 100%)`,
                        color: tool.color 
                      }}
                    >
                      {tool.icon}
                    </div>
                    <h3 className="ast-tool-title">{tool.title}</h3>
                    <p className="ast-tool-desc">{tool.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 登录弹窗 */}
      {showAuthModal && (
        <Suspense fallback={<div>Loading...</div>}>
          <AuthModal 
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onLoginSuccess={() => setShowAuthModal(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default AssistantPage;
