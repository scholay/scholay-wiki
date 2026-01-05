/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Sparkles, Shield, Globe, Mail } from 'lucide-react';
import Logo from '../components/Logo';
import './styles/AboutPage.css';

const AboutPage = () => {
  const navigate = useNavigate();

  return (
    <div className="about-page">
      <div className="about-container">
        <div className="about-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={20} />
            <span>返回</span>
          </button>
        </div>

        <div className="about-hero">
          <div className="about-logo">
            <Logo size={64} />
          </div>
          <h1>Scholay</h1>
          <p className="about-tagline">AI驱动的学术搜索平台</p>
        </div>

        <div className="about-section">
          <h2>关于我们</h2>
          <div className="about-content">
            <p>
              Scholay 是一个创新的学术研究助手，致力于帮助研究人员、学生和学者更高效地发现、理解和分析学术文献。
            </p>
            <p>
              我们相信，获取知识不应该有障碍。通过结合先进的人工智能技术和海量的学术数据库，
              Scholay 为用户提供了一个强大而直观的学术搜索体验。
            </p>
          </div>
        </div>

        <div className="about-section">
          <h2>核心功能</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <BookOpen size={28} />
              </div>
              <h3>海量文献</h3>
              <p>接入 Semantic Scholar 数据库，覆盖超过 2 亿篇学术论文，涵盖各个学科领域</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <Sparkles size={28} />
              </div>
              <h3>AI 智能分析</h3>
              <p>利用先进的 AI 技术，快速理解和总结学术内容，提供深度分析和见解</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <Globe size={28} />
              </div>
              <h3>跨领域搜索</h3>
              <p>支持多学科、多语言的学术文献检索，打破学科壁垒，促进跨领域研究</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <Shield size={28} />
              </div>
              <h3>隐私保护</h3>
              <p>严格保护用户数据安全和研究隐私，让您安心进行学术探索</p>
            </div>
          </div>
        </div>

        <div className="about-section">
          <h2>联系我们</h2>
          <div className="contact-info">
            <div className="contact-item">
              <Mail size={20} />
              <a href="mailto:support@scholay.com">support@scholay.com</a>
            </div>
          </div>
        </div>

        <div className="about-footer">
          <p className="copyright">
            © {new Date().getFullYear()} Scholay. All rights reserved.
          </p>
          <div className="footer-links">
            <a href="/terms" target="_blank">服务条款</a>
            <span>|</span>
            <a href="/privacy" target="_blank">隐私政策</a>
            <span>|</span>
            <button onClick={() => navigate('/feedback')}>意见反馈</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;




















