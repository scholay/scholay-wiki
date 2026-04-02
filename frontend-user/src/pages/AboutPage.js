/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Sparkles, Shield, Globe, Mail, Users, Target, Lightbulb, Award } from 'lucide-react';
import Logo from '../components/Logo';
import SEO from '../components/SEO';
import { generateFAQSchema } from '../utils/seoHelpers';
import './styles/AboutPage.css';

const faqData = [
  {
    question: '什么是Scholay学术搜索平台？',
    answer: 'Scholay是一个AI驱动的学术搜索平台，提供智能文献检索、论文分析、引用图谱可视化等功能，帮助研究人员快速找到高质量学术资源。'
  },
  {
    question: 'Scholay支持哪些搜索模式？',
    answer: 'Scholay支持学术检索和智能分析两种模式。学术检索可以快速检索论文标题、作者和关键词；智能分析使用AI智能理解并解析您的研究需求，提供更精准的结果。'
  },
  {
    question: 'Scholay的数据来源是什么？',
    answer: 'Scholay的学术数据来自于互联网公开数据，覆盖计算机科学、生物医学等多个学科领域的学术论文。'
  },
  {
    question: 'Scholay是免费的吗？',
    answer: '是的，Scholay提供免费的基础功能，包括学术检索、论文详情查看等。高级功能如智能分析、智能审稿等可能需要订阅会员。'
  },
  {
    question: '如何使用智能助手功能？',
    answer: '登录后，点击首页的"智能助手"卡片即可进入。您可以向AI提问任何学术相关问题，它会基于学术文献为您提供专业解答。'
  }
];

const AboutPage = () => {
  const navigate = useNavigate();
  const [expandedFaq, setExpandedFaq] = useState(null);

  return (
    <div className="about-page">
      <SEO
        title="关于我们 - Scholay | AI驱动的学术搜索平台"
        description="了解 Scholay 的使命、团队和发展历程。Scholay 由成都恩特罐罐文化科技有限公司运营，致力于通过AI技术提升学术研究效率。"
        keywords="关于Scholay,学术搜索平台,AI学术工具,成都恩特罐罐文化科技,学术研究助手"
        canonical="/about"
        structuredData={generateFAQSchema(faqData)}
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
          <h2>核心团队</h2>
          <div className="about-content">
            <p>Scholay 的核心团队由来自学术搜索、自然语言处理和信息检索领域的专业人士组成，兼具技术深度和学术行业理解。</p>
          </div>
          <div className="about-team-grid">
            <div className="about-team-card">
              <div className="about-team-avatar">刘</div>
              <h4>刘晨</h4>
              <p className="about-team-role">技术总监</p>
              <p className="about-team-bio">前 Semantic Scholar 研究工程师，长期关注 AI 与学术搜索交叉领域，负责平台核心搜索和 AI 系统架构。</p>
            </div>
            <div className="about-team-card">
              <div className="about-team-avatar">张</div>
              <h4>张薇</h4>
              <p className="about-team-role">首席研究员</p>
              <p className="about-team-bio">信息科学博士，专注于学术信息检索和知识图谱研究，主持多项国家级科研项目，为产品提供学术顾问支持。</p>
            </div>
            <div className="about-team-card">
              <div className="about-team-avatar">王</div>
              <h4>王明</h4>
              <p className="about-team-role">产品经理</p>
              <p className="about-team-bio">计算机科学硕士，全栈开发者，热衷于用技术提升科研效率，负责 Scholay 产品设计和用户体验优化。</p>
            </div>
            <div className="about-team-card">
              <div className="about-team-avatar">陈</div>
              <h4>陈晓</h4>
              <p className="about-team-role">内容编辑</p>
              <p className="about-team-bio">学术出版行业从业 10 年，熟悉同行评审、期刊投稿和开放获取出版流程，负责学术内容质量把控。</p>
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

        {/* 平台数据 + 适用人群 */}
        <div className="about-section">
          <h2>平台数据</h2>
          <div className="about-stats-row">
            <div className="about-stat">
              <span className="about-stat-num">200M+</span>
              <span className="about-stat-label">学术论文覆盖</span>
            </div>
            <div className="about-stat-divider" />
            <div className="about-stat">
              <span className="about-stat-num">19</span>
              <span className="about-stat-label">学科领域</span>
            </div>
            <div className="about-stat-divider" />
            <div className="about-stat">
              <span className="about-stat-num">5</span>
              <span className="about-stat-label">AI 工具模块</span>
            </div>
          </div>
        </div>

        <div className="about-section">
          <h2>适用人群</h2>
          <div className="about-users-row">
            <div className="about-user-card">
              <span className="about-user-emoji">🎓</span>
              <div><strong>高校学生</strong><span>课题文献 · 论文写作 · 文献综述</span></div>
            </div>
            <div className="about-user-card">
              <span className="about-user-emoji">🔬</span>
              <div><strong>科研人员</strong><span>追踪前沿 · 发现高引论文 · 拓展思路</span></div>
            </div>
            <div className="about-user-card">
              <span className="about-user-emoji">📚</span>
              <div><strong>学者教授</strong><span>学术脉络 · 引用分析 · 学术决策</span></div>
            </div>
            <div className="about-user-card">
              <span className="about-user-emoji">💼</span>
              <div><strong>企业研发</strong><span>技术调研 · 行业动态 · 趋势分析</span></div>
            </div>
          </div>
        </div>

        {/* 用户评价 */}
        <div className="about-section">
          <h2>来自研究者的反馈</h2>
          <div className="about-testimonials-grid">
            <div className="about-testimonial-card">
              <p>"智能检索帮我在博士论文文献综述阶段节省了大量时间，AI 分析功能让我快速判断论文价值。"</p>
              <div className="about-testimonial-author">
                <strong>李同学</strong>
                <span>计算机科学博士生</span>
              </div>
            </div>
            <div className="about-testimonial-card">
              <p>"AI 搜索能理解我的研究意图，帮我发现了很多之前遗漏的跨学科相关论文。"</p>
              <div className="about-testimonial-author">
                <strong>王研究员</strong>
                <span>生物信息学方向</span>
              </div>
            </div>
            <div className="about-testimonial-card">
              <p>"AI 辅助写作功能对于英文非母语的研究者来说非常实用，效率提升显著。"</p>
              <div className="about-testimonial-author">
                <strong>张老师</strong>
                <span>材料科学副教授</span>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="about-section">
          <h2>常见问题</h2>
          <div className="about-faq-list">
            {faqData.map((faq, index) => (
              <div
                key={index}
                className={`about-faq-item ${expandedFaq === index ? 'expanded' : ''}`}
              >
                <button
                  className="about-faq-question"
                  onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                >
                  <span>{faq.question}</span>
                  <svg
                    className="about-faq-arrow"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
                <div className="about-faq-answer">
                  <p>{faq.answer}</p>
                </div>
              </div>
            ))}
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
          <div className="about-content about-company-info">
            <p>
              公司名称：成都恩特罐罐文化科技有限公司<br />
              地址：中国四川省成都市高新区<br />
              工作时间：周一至周五 9:00-18:00
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AboutPage;




















