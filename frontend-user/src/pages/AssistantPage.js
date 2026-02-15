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
import SEO from '../components/SEO';
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
      <SEO
        title="精品AI工具 - Scholay | 智能助手、智能审稿、LaTeX编辑器"
        description="Scholay 精品AI工具集，包括AI智能助手对话、智能审稿论文评审、ScholayPrism LaTeX编辑器，助力高效学术研究。"
        keywords="AI学术助手,智能审稿,LaTeX编辑器,AI论文分析,学术工具,ScholayPrism"
        canonical="/assistant"
      />
      {/* 页面标题区域 */}
      <header className="ast-header">
        <h1 className="ast-title">精品AI工具</h1>
      </header>

      {/* 简介文字 - 增加页面内容密度 */}
      <p className="ast-intro-text" style={{ maxWidth: '680px', margin: '0 auto 32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.9375rem', lineHeight: 1.7, padding: '0 16px' }}>
        Scholay 将先进的人工智能技术与学术研究深度融合，打造了一套专业的 AI 学术工具集。从智能对话到论文评审，从 LaTeX 排版到文献分析，为研究人员提供全方位的科研辅助支持。
      </p>

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

      {/* 详细功能说明 - 为搜索引擎提供丰富的文本内容 */}
      <section style={{ maxWidth: '680px', margin: '40px auto 0', padding: '0 16px' }}>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--border-primary)', padding: '28px 24px' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '1.125rem', fontWeight: 700, marginTop: 0, marginBottom: 16 }}>AI 学术工具如何帮助你的研究？</h3>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9375rem', lineHeight: 1.85 }}>
            <p style={{ marginBottom: 14 }}>
              <strong style={{ color: 'var(--text-primary)' }}>智能助手</strong>支持多种大语言模型（包括高级和进阶模型），可以帮助你解答学术问题、讨论研究方向、分析论文观点、生成文献综述框架、改善英文学术写作表达。对话内容支持上下文连续交流，AI 会记住你的研究背景和之前的讨论。
            </p>
            <p style={{ marginBottom: 14 }}>
              <strong style={{ color: 'var(--text-primary)' }}>智能审稿</strong>模拟同行评审流程，从论文结构、方法论严谨性、论证逻辑、写作质量等多个维度对论文进行全面评估。审稿报告按问题严重性分级，并提供具体的修改建议和改进方向，特别适合在正式投稿前进行自我审查。
            </p>
            <p style={{ marginBottom: 0 }}>
              <strong style={{ color: 'var(--text-primary)' }}>ScholayPrism</strong> 是专为学术写作打造的在线 LaTeX 编辑器，支持实时编译预览和 AI 辅助写作。内置 IEEE、ACM、Springer 等主流期刊和会议的 LaTeX 模板，无需安装任何本地软件即可开始论文写作。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AssistantPage;
