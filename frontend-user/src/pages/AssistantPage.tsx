/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * AssistantPage — AI 工具导航页
 * 纯功能入口页面，不包含介绍性文字（介绍内容在各 /features/* 宣传页）
 */

import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackAIAssistantChat } from '../utils/usageTracker';
import SEO from '../components/SEO';
import './styles/AssistantPage.css';

function AssistantPage() {
  const navigate = useNavigate();

  const handleToolClick = useCallback((tool) => {
    trackAIAssistantChat(tool.title);
    navigate(tool.path);
  }, [navigate]);

  const tools = [
    {
      id: 'chat',
      title: '智能助手',
      desc: '多模型学术问答 · 上下文连续对话',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
      path: '/chat',
      featurePath: null,
      color: '#10A37F',
    },
    {
      id: 'peer-review',
      title: '智能审稿',
      desc: '三位 AI 审稿人 · 五维度结构化报告',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M12 18l-2.4-1.2L7 18v-4l2.6 1.3L12 14l2.4 1.3L17 14v4l-2.6-1.2L12 18z"/>
        </svg>
      ),
      path: '/peer-review',
      featurePath: '/features/peer-review',
      color: '#6366f1',
    },
    {
      id: 'latex-writer',
      title: 'ScholayPrism',
      desc: '在线 LaTeX 编辑器 · AI 辅助写作',
      icon: (
        <video className="ast-card-video" autoPlay loop muted playsInline>
          <source src="https://cdn.openai.com/ctf-cdn/260126_Prism_Logo_SL_v04.mp4" type="video/mp4" />
        </video>
      ),
      path: '/latex-writer',
      featurePath: '/features/latex-writer',
      color: '#E74C3C',
      isVideo: true,
    },
  ];

  return (
    <div className="ast-page">
      <SEO
        title="精品AI工具 - Scholay | 智能助手、智能审稿、LaTeX编辑器"
        description="Scholay 精品AI工具集，包括AI智能助手对话、智能审稿论文评审、ScholayPrism LaTeX编辑器，助力高效学术研究。"
        keywords="AI学术助手,智能审稿,LaTeX编辑器,AI论文分析,学术工具,ScholayPrism"
        canonical="/assistant"
      />

      <header className="ast-header">
        <h1 className="ast-title">AI 工具</h1>
        <p className="ast-subtitle">选择工具，开始你的科研工作</p>
      </header>

      <div className="ast-tools">
        {tools.map((tool) => (
          <article
            key={tool.id}
            className="ast-card"
            onClick={() => handleToolClick(tool)}
            style={{ '--card-color': tool.color }}
          >
            <div className={`ast-card-icon ${tool.isVideo ? 'ast-card-icon-video' : ''}`}>
              {tool.icon}
            </div>
            <div className="ast-card-body">
              <h2 className="ast-card-title">{tool.title}</h2>
              <p className="ast-card-desc">{tool.desc}</p>
            </div>
            <div className="ast-card-footer">
              <span className="ast-card-go">
                打开
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </span>
              {tool.featurePath && (
                <span
                  className="ast-card-more"
                  onClick={(e) => { e.stopPropagation(); navigate(tool.featurePath); }}
                >
                  了解更多
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default AssistantPage;
