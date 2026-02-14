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
import { ArrowLeft, BookOpen, Sparkles, Shield, Globe, Mail, Users, Target, Lightbulb, Award } from 'lucide-react';
import Logo from '../components/Logo';
import SEO from '../components/SEO';
import './styles/AboutPage.css';

const AboutPage = () => {
  const navigate = useNavigate();

  return (
    <div className="about-page">
      <SEO
        title="关于我们 - Scholay | AI驱动的学术搜索平台"
        description="了解 Scholay 的使命、团队和发展历程。Scholay 由成都恩特罐罐文化科技有限公司运营，致力于通过AI技术提升学术研究效率。"
        keywords="关于Scholay,学术搜索平台,AI学术工具,成都恩特罐罐文化科技,学术研究助手"
        canonical="/about"
      />
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
            <p>
              Scholay 由成都恩特罐罐文化科技有限公司运营，公司成立于中国四川省成都市，专注于将前沿AI技术应用于学术研究领域，为全球学术社区提供高质量的智能化工具和服务。
            </p>
          </div>
        </div>

        <div className="about-section">
          <h2>我们的使命</h2>
          <div className="about-content">
            <div className="features-grid">
              <div className="feature-card">
                <div className="feature-icon">
                  <Target size={28} />
                </div>
                <h3>消除知识壁垒</h3>
                <p>让每一位研究者都能快速、准确地获取所需的学术资源，不受语言、学科和地域限制</p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">
                  <Lightbulb size={28} />
                </div>
                <h3>技术驱动创新</h3>
                <p>运用最新的大语言模型和自然语言处理技术，将AI深度融入学术研究全流程</p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">
                  <Users size={28} />
                </div>
                <h3>服务学术社区</h3>
                <p>致力于构建一个开放、高效、智能的学术生态系统，服务全球数百万研究人员</p>
              </div>

              <div className="feature-card">
                <div className="feature-icon">
                  <Award size={28} />
                </div>
                <h3>追求卓越品质</h3>
                <p>不断优化搜索算法和AI模型，确保为用户提供准确、可靠、前沿的学术信息服务</p>
              </div>
            </div>
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
              <p>接入 Semantic Scholar 数据库，覆盖超过 2 亿篇学术论文，涵盖计算机科学、生物医学、物理学、化学等各个学科领域</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <Sparkles size={28} />
              </div>
              <h3>AI 智能分析</h3>
              <p>利用先进的大语言模型技术，快速理解和总结学术内容，提供深度分析、文献综述和研究建议</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <Globe size={28} />
              </div>
              <h3>跨领域搜索</h3>
              <p>支持多学科、多语言的学术文献检索，打破学科壁垒，促进跨领域研究与学术合作</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <Shield size={28} />
              </div>
              <h3>隐私保护</h3>
              <p>采用 SSL 加密传输和数据加密存储，严格保护用户数据安全和研究隐私</p>
            </div>
          </div>
        </div>

        <div className="about-section">
          <h2>发展历程</h2>
          <div className="about-content">
            <p>
              Scholay 项目始于对学术信息获取效率低下这一痛点的思考。我们的团队成员在科研工作中深刻体会到，传统的文献检索方式耗时费力，AI技术的快速发展为解决这一问题提供了全新的可能。
            </p>
            <p>
              经过持续的技术研发和产品迭代，Scholay 从最初的文献搜索工具，逐步发展为集智能检索、AI分析、智能审稿、LaTeX编辑于一体的综合学术研究平台。我们始终保持对新技术的敏锐嗅觉，不断将最新的AI能力整合到产品中，为用户创造更大的价值。
            </p>
          </div>
        </div>

        <div className="about-section">
          <h2>联系我们</h2>
          <div className="about-content">
            <p>无论是技术支持、功能建议还是商务合作，我们都期待听到您的声音。</p>
          </div>
          <div className="contact-info">
            <div className="contact-item">
              <Mail size={20} />
              <a href="mailto:support@scholay.com">support@scholay.com</a>
            </div>
          </div>
          <div className="about-content" style={{ marginTop: '12px' }}>
            <p style={{ color: '#9e9e9e', fontSize: '0.9rem' }}>
              公司名称：成都恩特罐罐文化科技有限公司<br />
              地址：中国四川省成都市高新区<br />
              工作时间：周一至周五 9:00-18:00
            </p>
          </div>
        </div>

        <div className="about-footer">
          <p className="copyright">
            © {new Date().getFullYear()} Scholay. All rights reserved.
          </p>
          <div className="footer-links">
            <button onClick={() => navigate('/terms')}>服务条款</button>
            <span>|</span>
            <button onClick={() => navigate('/privacy')}>隐私政策</button>
            <span>|</span>
            <button onClick={() => navigate('/disclaimer')}>免责声明</button>
            <span>|</span>
            <button onClick={() => navigate('/contact')}>联系我们</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;




















