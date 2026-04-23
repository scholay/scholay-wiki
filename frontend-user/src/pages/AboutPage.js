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
import {
  BookOpen, Sparkles, Shield, Globe, Mail,
  Users, Target, Lightbulb, Award, ChevronDown, MapPin, Clock,
} from 'lucide-react';
import SEO from '../components/common/SEO';
import { generateFAQSchema } from '../utils/seoHelpers';
import { FeatureNav } from './features/FeaturePageComponents';
import './features/features-common.css';

const ACCENT = '#8b5cf6';

const faqData = [
  { question: '什么是 Scholay 学术搜索平台？', answer: 'Scholay 是一个 AI 驱动的学术搜索平台，提供智能文献检索、论文分析、引用图谱可视化等功能，帮助研究人员快速找到高质量学术资源。' },
  { question: 'Scholay 支持哪些搜索模式？', answer: 'Scholay 支持学术检索和智能分析两种模式。学术检索可以快速检索论文标题、作者和关键词；智能分析使用 AI 理解并解析您的研究需求，提供更精准的结果。' },
  { question: 'Scholay 的数据来源是什么？', answer: 'Scholay 的学术数据来自互联网公开数据，覆盖计算机科学、生物医学等多个学科领域的学术论文。' },
  { question: 'Scholay 是免费的吗？', answer: '是的，Scholay 提供免费的基础功能，包括学术检索、论文详情查看等。高级功能如智能分析、智能审稿等可能需要订阅会员。' },
  { question: '如何使用智能助手功能？', answer: '登录后，点击首页的"智能助手"卡片即可进入。您可以向 AI 提问任何学术相关问题，它会基于学术文献为您提供专业解答。' },
];

const missionCards = [
  { icon: Target, title: '消除知识壁垒', text: '让每一位研究者都能快速、准确地获取所需的学术资源，不受语言、学科和地域限制。' },
  { icon: Lightbulb, title: '技术驱动创新', text: '运用最新的大语言模型和自然语言处理技术，将 AI 深度融入学术研究全流程。' },
  { icon: Users, title: '服务学术社区', text: '致力于构建一个开放、高效、智能的学术生态系统，服务全球数百万研究人员。' },
  { icon: Award, title: '追求卓越品质', text: '不断优化搜索算法和 AI 模型，确保为用户提供准确、可靠、前沿的学术信息服务。' },
];

const featureCards = [
  { icon: BookOpen, title: '海量文献', text: '覆盖超过 2 亿篇学术论文，涵盖计算机科学、生物医学、物理学、化学等各学科领域。' },
  { icon: Sparkles, title: 'AI 智能分析', text: '利用先进的大语言模型技术，快速理解和总结学术内容，提供深度分析和研究建议。' },
  { icon: Globe, title: '跨领域搜索', text: '支持多学科、多语言的学术文献检索，打破学科壁垒，促进跨领域研究与学术合作。' },
  { icon: Shield, title: '隐私保护', text: '采用 SSL 加密传输和数据加密存储，严格保护用户数据安全和研究隐私。' },
];

const teamCards = [
  { initial: '刘', name: '刘晨', role: '技术总监', bio: '资深学术搜索研究工程师，长期关注 AI 与学术搜索交叉领域，负责平台核心搜索和 AI 架构。' },
  { initial: '张', name: '张薇', role: '首席研究员', bio: '信息科学博士，专注学术信息检索与知识图谱研究，主持多项国家级科研项目，为产品提供学术顾问支持。' },
  { initial: '王', name: '王明', role: '产品经理', bio: '计算机科学硕士，全栈开发者，热衷用技术提升科研效率，负责 Scholay 产品设计和用户体验优化。' },
  { initial: '陈', name: '陈晓', role: '内容编辑', bio: '学术出版行业从业 10 年，熟悉同行评审、期刊投稿与开放获取流程，负责学术内容质量把控。' },
];

const userCards = [
  { emoji: '🎓', title: '高校学生', desc: '课题文献 · 论文写作 · 文献综述' },
  { emoji: '🔬', title: '科研人员', desc: '追踪前沿 · 发现高引论文 · 拓展思路' },
  { emoji: '📚', title: '学者教授', desc: '学术脉络 · 引用分析 · 学术决策' },
  { emoji: '💼', title: '企业研发', desc: '技术调研 · 行业动态 · 趋势分析' },
];

const testimonials = [
  { quote: '智能检索帮我在博士论文文献综述阶段节省了大量时间，AI 分析功能让我快速判断论文价值。', name: '李同学', role: '计算机科学博士生' },
  { quote: 'AI 搜索能理解我的研究意图，帮我发现了很多之前遗漏的跨学科相关论文。', name: '王研究员', role: '生物信息学方向' },
  { quote: 'AI 辅助写作功能对于英文非母语的研究者来说非常实用，效率提升显著。', name: '张老师', role: '材料科学副教授' },
];

const AboutPage = () => {
  const navigate = useNavigate();
  const [expandedFaq, setExpandedFaq] = useState(null);

  return (
    <div className="feat-page">
      <SEO
        title="关于我们 - Scholay | AI驱动的学术搜索平台"
        description="了解 Scholay 的使命、团队和发展历程。Scholay 致力于通过 AI 技术提升学术研究效率。"
        keywords="关于Scholay,学术搜索平台,AI学术工具,学术研究助手"
        canonical="/about"
        structuredData={generateFAQSchema(faqData)}
      />

      <FeatureNav ctaText="开始使用" ctaTo="/" accentColor={ACCENT} />

      {/* Hero */}
      <section className="feat-hero">
        <span className="feat-hero-pill">
          <Sparkles size={12} />
          <span>About Scholay</span>
        </span>
        <h1>
          让学术研究 <span style={{ background: 'linear-gradient(120deg, #8b5cf6, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>更简单、更智能</span>
        </h1>
        <p className="feat-hero-sub">
          Scholay 是一个 AI 驱动的学术研究助手，整合海量文献数据与前沿语言模型，
          帮助研究者、学生与学者高效地发现、理解与利用学术资源。
        </p>
      </section>

      <div className="feat-main">
        {/* 使命 */}
        <section className="feat-section">
          <div className="feat-section-header-center">
            <span className="feat-section-eyebrow" style={{ color: ACCENT }}>OUR MISSION</span>
            <h2 className="feat-section-title">让每一次检索，都接近真相</h2>
            <p className="feat-section-desc">以技术与同理心并重，服务学术研究的每一个环节。</p>
          </div>
          <div className="feat-grid feat-grid-4">
            {missionCards.map(({ icon: Icon, title, text }) => (
              <div key={title} className="feat-card">
                <div className="feat-card-icon" style={{ background: 'rgba(139, 92, 246, 0.14)', color: ACCENT }}>
                  <Icon size={22} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 核心功能 */}
        <section className="feat-section">
          <div className="feat-section-header-center">
            <span className="feat-section-eyebrow" style={{ color: ACCENT }}>FEATURES</span>
            <h2 className="feat-section-title">覆盖研究全流程的能力</h2>
            <p className="feat-section-desc">从文献发现到深度解读，再到协作与写作，Scholay 提供一体化的工具链。</p>
          </div>
          <div className="feat-grid feat-grid-4">
            {featureCards.map(({ icon: Icon, title, text }) => (
              <div key={title} className="feat-card">
                <div className="feat-card-icon" style={{ background: 'rgba(6, 182, 212, 0.14)', color: '#06b6d4' }}>
                  <Icon size={22} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 平台数据 */}
        <section className="feat-section">
          <div className="feat-section-header-center">
            <span className="feat-section-eyebrow" style={{ color: ACCENT }}>PLATFORM</span>
            <h2 className="feat-section-title">平台数据</h2>
          </div>
          <div className="feat-stats">
            <div className="feat-stat">
              <span className="feat-stat-num">200M+</span>
              <span className="feat-stat-label">学术论文覆盖</span>
            </div>
            <div className="feat-stat">
              <span className="feat-stat-num">19</span>
              <span className="feat-stat-label">学科领域</span>
            </div>
            <div className="feat-stat">
              <span className="feat-stat-num">5</span>
              <span className="feat-stat-label">AI 工具模块</span>
            </div>
          </div>
        </section>

        {/* 核心团队 */}
        <section className="feat-section">
          <div className="feat-section-header-center">
            <span className="feat-section-eyebrow" style={{ color: ACCENT }}>TEAM</span>
            <h2 className="feat-section-title">核心团队</h2>
            <p className="feat-section-desc">兼具技术深度与学术行业理解的跨学科团队。</p>
          </div>
          <div className="feat-grid feat-grid-4">
            {teamCards.map(({ initial, name, role, bio }) => (
              <div key={name} className="feat-team-card">
                <div className="feat-team-avatar">{initial}</div>
                <h4 className="feat-team-name">{name}</h4>
                <p className="feat-team-role">{role}</p>
                <p className="feat-team-bio">{bio}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 适用人群 */}
        <section className="feat-section">
          <div className="feat-section-header-center">
            <span className="feat-section-eyebrow" style={{ color: ACCENT }}>FOR WHOM</span>
            <h2 className="feat-section-title">适用人群</h2>
            <p className="feat-section-desc">不同角色的研究者，都能在 Scholay 找到适合的工作方式。</p>
          </div>
          <div className="feat-grid feat-grid-4">
            {userCards.map(({ emoji, title, desc }) => (
              <div key={title} className="feat-user-card">
                <span className="feat-user-emoji">{emoji}</span>
                <div>
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 用户评价 */}
        <section className="feat-section">
          <div className="feat-section-header-center">
            <span className="feat-section-eyebrow" style={{ color: ACCENT }}>VOICES</span>
            <h2 className="feat-section-title">来自研究者的反馈</h2>
          </div>
          <div className="feat-grid feat-grid-3">
            {testimonials.map(({ quote, name, role }) => (
              <div key={name} className="feat-quote-card">
                <p>{quote}</p>
                <div className="feat-quote-meta">
                  <strong>{name}</strong>
                  <span>{role}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="feat-section">
          <div className="feat-section-header-center">
            <span className="feat-section-eyebrow" style={{ color: ACCENT }}>FAQ</span>
            <h2 className="feat-section-title">常见问题</h2>
          </div>
          <div className="feat-faq" style={{ maxWidth: 760, margin: '0 auto' }}>
            {faqData.map((faq, index) => {
              const open = expandedFaq === index;
              return (
                <div key={index} className={`feat-faq-item ${open ? 'open' : ''}`}>
                  <button
                    className="feat-faq-trigger"
                    onClick={() => setExpandedFaq(open ? null : index)}
                    aria-expanded={open}
                  >
                    <span className="feat-faq-num">{String(index + 1).padStart(2, '0')}</span>
                    <span className="feat-faq-q">{faq.question}</span>
                    <ChevronDown className="feat-faq-chev" size={18} />
                  </button>
                  <div className="feat-faq-panel">
                    <div className="feat-faq-panel-inner">
                      <p>{faq.answer}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 联系我们 */}
        <section className="feat-section">
          <div className="feat-section-header-center">
            <span className="feat-section-eyebrow" style={{ color: ACCENT }}>CONTACT</span>
            <h2 className="feat-section-title">联系我们</h2>
            <p className="feat-section-desc">无论是技术支持、功能建议还是商务合作，我们都期待听到您的声音。</p>
          </div>
          <div className="feat-grid feat-grid-3">
            <div className="feat-contact-card">
              <div className="feat-card-icon"><Mail size={18} /></div>
              <h3>邮箱</h3>
              <a href="mailto:support@scholay.com">support@scholay.com</a>
              <span className="feat-contact-sub">工作日 24 小时内回复</span>
            </div>
            <div className="feat-contact-card">
              <div className="feat-card-icon"><MapPin size={18} /></div>
              <h3>地址</h3>
              <p>成都市高新区</p>
              <span className="feat-contact-sub">Scholay 团队</span>
            </div>
            <div className="feat-contact-card">
              <div className="feat-card-icon"><Clock size={18} /></div>
              <h3>工作时间</h3>
              <p>周一至周五 9:00 – 18:00</p>
              <span className="feat-contact-sub">节假日响应可能延后</span>
            </div>
          </div>
        </section>
      </div>

      <div className="feat-page-end">
        <p>© {new Date().getFullYear()} Scholay</p>
        <div className="feat-page-end-links">
          <button onClick={() => navigate('/privacy')}>隐私政策</button>
          <button onClick={() => navigate('/terms')}>服务条款</button>
          <button onClick={() => navigate('/disclaimer')}>免责声明</button>
          <button onClick={() => navigate('/contact')}>联系我们</button>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
