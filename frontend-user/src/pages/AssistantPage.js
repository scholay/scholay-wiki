/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSidebar } from '../contexts/SidebarContext';
import './styles/AssistantPage.css';

function AssistantPage() {
  const navigate = useNavigate();
  const { resetSidebarConfig } = useSidebar();

  // 进入页面时清空侧边栏历史记录
  useEffect(() => {
    resetSidebarConfig();
  }, [resetSidebarConfig]);

  const tools = [
    {
      id: 'chat',
      title: '智能助手',
      description: '有问题，交给智能助手',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
      path: '/chat',
      color: '#10A37F',
      gradient: 'linear-gradient(135deg, #10A37F 0%, #0D8A6A 100%)',
    },
    {
      id: 'peer-review',
      title: '智能审稿',
      description: '智能预审，明智之举！',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M9 15l2 2 4-4"/>
        </svg>
      ),
      path: '/peer-review',
      color: '#6366f1',
      gradient: 'linear-gradient(135deg, #6366f1 0%, #4F46E5 100%)',
    },
  ];

  return (
    <div className="ast-page">
      {/* 页面标题区域 */}
      <header className="ast-header">
        <div className="ast-header-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1 className="ast-title">精品 AI 工具</h1>
        <p className="ast-subtitle">智能工具助力您的学术研究</p>
      </header>

      {/* 工具卡片 */}
      <div className="ast-tools">
        {tools.map((tool) => (
          <article
            key={tool.id}
            className="ast-card"
            onClick={() => navigate(tool.path)}
            style={{ '--card-color': tool.color, '--card-gradient': tool.gradient }}
          >
            <div className="ast-card-badge">
              <span>推荐</span>
            </div>
            <div className="ast-card-icon">
              {tool.icon}
            </div>
            <h2 className="ast-card-title">{tool.title}</h2>
            <p className="ast-card-desc">{tool.description}</p>
            <div className="ast-card-action">
              <span>立即使用</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default AssistantPage;
