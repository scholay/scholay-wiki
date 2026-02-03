/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSidebar } from '../contexts/SidebarContext';
import { trackAIAssistantChat } from '../utils/usageTracker';
import './styles/AssistantPage.css';

function AssistantPage() {
  const navigate = useNavigate();
  const { resetSidebarConfig } = useSidebar();

  // 进入页面时清空侧边栏历史记录
  useEffect(() => {
    resetSidebarConfig();
  }, [resetSidebarConfig]);

  // 处理工具卡片点击
  const handleToolClick = useCallback((tool) => {
    // 记录智能助手对话使用统计
    trackAIAssistantChat(tool.title);
    navigate(tool.path);
  }, [navigate]);

  const tools = [
    {
      id: 'chat',
      title: '智能助手',
      description: '选择专属您的人工智能助手，开启今天的智能之旅',
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
      description: '大多数的稿件被拒或不达标，往往是缺乏一针见血的修改意见，只需几分钟，您的专属审稿人为您服务。',
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M12 18l-2.4-1.2L7 18v-4l2.6 1.3L12 14l2.4 1.3L17 14v4l-2.6-1.2L12 18z"/>
        </svg>
      ),
      path: '/peer-review',
      color: '#6366f1',
      gradient: 'linear-gradient(135deg, #6366f1 0%, #4F46E5 100%)',
    },
    {
      id: 'latex-writer',
      title: 'ScholayPrism',
      description: '全新推出原生支持 LaTeX 的免费工作空间，将 GPT‑5.2 无缝融入你的科研写作与协作流程。',
      icon: (
        <video
          className="ast-card-video"
          autoPlay
          loop
          muted
          playsInline
        >
          <source src="https://cdn.openai.com/ctf-cdn/260126_Prism_Logo_SL_v04.mp4" type="video/mp4" />
        </video>
      ),
      path: '/latex-writer',
      color: '#E74C3C',
      gradient: 'linear-gradient(135deg, #E74C3C 0%, #C0392B 100%)',
      isVideo: true,
    },
  ];

  return (
    <div className="ast-page">
      {/* 页面标题区域 */}
      <header className="ast-header">
        <h1 className="ast-title">精品AI工具</h1>
      </header>

      {/* 工具卡片 */}
      <div className="ast-tools">
        {tools.map((tool) => (
          <article
            key={tool.id}
            className="ast-card"
            onClick={() => handleToolClick(tool)}
            style={{ '--card-color': tool.color, '--card-gradient': tool.gradient }}
          >
            <div className="ast-card-header">
              <div className={`ast-card-icon ${tool.isVideo ? 'ast-card-icon-video' : ''}`}>
                {tool.icon}
              </div>
              <h2 className="ast-card-title">{tool.title}</h2>
            </div>
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
