/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * HelpCenterPage - 帮助中心页面
 * 包含平台使用教程、功能介绍和详细 FAQ
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, MessageSquare, FileCheck, Code, Shield, ChevronDown, ChevronUp, HelpCircle, BookOpen, Sparkles } from 'lucide-react';
import SEO from '../components/SEO';
import FeaturePromo from '../components/FeaturePromo';
import './styles/ResourcePage.css';
import './styles/HelpCenterPage.css';

const features = [
  {
    icon: Search,
    title: '学术文献检索',
    description: 'Scholay 整合了 Semantic Scholar 超过 2 亿篇学术论文的数据库，提供两种检索模式满足不同需求。',
    details: [
      '直接检索：输入关键词、论文标题或作者名，快速定位目标文献。支持布尔运算符（AND、OR、NOT）和精确短语检索（使用引号）。',
      '智能检索：用自然语言描述你的研究问题，AI 会理解你的意图并返回最相关的文献。适合探索性研究或不确定关键词时使用。',
      '搜索结果支持按相关度、被引次数、发表时间排序，并可按年份、领域、论文类型等条件筛选。',
    ],
  },
  {
    icon: Sparkles,
    title: 'AI 论文分析',
    description: '利用先进的大语言模型技术，为你提供论文的深度分析，帮助你快速把握论文核心内容。',
    details: [
      '在论文详情页点击"AI 分析"按钮，即可获取论文的结构化分析报告。',
      '分析内容包括：核心贡献总结、研究方法概述、主要发现、创新点、局限性分析和未来研究方向建议。',
      'AI 分析以流式方式呈现，边生成边显示，通常在 30 秒内完成完整分析。',
    ],
  },
  {
    icon: MessageSquare,
    title: 'AI 学术聊天',
    description: '与 AI 助手进行学术对话，获取研究灵感、解答学术疑问、辅助论文写作。',
    details: [
      '支持多种 AI 模型选择，可根据需求切换不同模型。',
      '对话支持上下文连续交流，AI 会记住你之前的问题和讨论内容。',
      '可以直接粘贴论文片段让 AI 解读，或请 AI 帮助改善论文表达。',
      '对话历史自动保存，随时可以回顾之前的交流内容。',
    ],
  },
  {
    icon: FileCheck,
    title: 'AI 智能审稿',
    description: '上传论文 PDF 或输入文本，获取 AI 生成的专业审稿意见和改进建议。',
    details: [
      '支持 PDF 上传和文本粘贴两种方式提交论文。',
      '审稿报告涵盖：论文结构评估、方法论分析、论证逻辑审查、写作质量评价和具体改进建议。',
      '审稿意见按重要性分级，帮助你优先处理关键问题。',
      '特别适合在正式投稿前进行自我审查，提高论文被接收的概率。',
    ],
  },
  {
    icon: Code,
    title: 'ScholayPrism LaTeX 编辑器',
    description: '原生支持 LaTeX 的在线学术写作工作空间，集成 AI 辅助写作功能。',
    details: [
      '在线编辑 LaTeX 文档，实时编译预览，无需安装任何本地软件。',
      '内置多种学术期刊和会议模板（IEEE、ACM、Springer 等），一键创建。',
      'AI 辅助写作：智能补全、语法检查、参考文献格式化。',
      '支持导出为 PDF 格式，可直接用于投稿。',
    ],
  },
];

const faqs = [
  {
    question: 'Scholay 是什么？它有什么特点？',
    answer: 'Scholay 是一个 AI 驱动的学术搜索平台，整合了 Semantic Scholar 超过 2 亿篇学术论文资源。它的核心特点包括：AI 智能文献检索（支持自然语言查询）、AI 论文深度分析、AI 学术聊天助手、AI 智能审稿、以及 ScholayPrism 在线 LaTeX 编辑器。Scholay 旨在帮助研究人员、学生和学者更高效地发现、理解和分析学术文献。'
  },
  {
    question: 'Scholay 支持哪些学科领域？',
    answer: 'Scholay 通过 Semantic Scholar 数据库覆盖了广泛的学科领域，包括但不限于：计算机科学、生物医学、物理学、化学、数学、工程学、环境科学、材料科学、心理学、经济学、社会学、教育学、语言学等。无论你从事哪个领域的研究，Scholay 都能帮你找到相关的学术文献。'
  },
  {
    question: 'Scholay 是免费的吗？',
    answer: 'Scholay 目前完全免费，你可以使用学术检索、AI 分析、AI 审稿、ScholayPrism 等所有功能，无需支付任何费用。'
  },
  {
    question: '如何注册和登录？',
    answer: '你可以通过以下方式注册和登录 Scholay：1) 邮箱注册——输入邮箱地址，接收验证码完成注册；2) GitHub 账号登录——一键使用 GitHub 账号授权登录，如果邮箱相同会自动关联已有账户；3) 微信登录——使用微信扫码授权登录。注册后即可享受免费版的所有功能。'
  },
  {
    question: '直接检索和智能检索有什么区别？',
    answer: '直接检索类似于传统的关键词搜索，你输入特定的关键词、论文标题或作者名，系统在数据库中精确匹配并返回结果。适合你已经知道要找什么的场景。智能检索则由 AI 驱动，你可以用自然语言描述研究问题（如"有哪些方法可以减少神经网络的过拟合？"），AI 会理解你的意图并返回最相关的文献，特别适合探索新领域或不确定关键词时使用。'
  },
  {
    question: 'AI 分析的结果准确吗？',
    answer: 'Scholay 的 AI 分析基于先进的大语言模型技术，能够较好地理解和总结学术论文的核心内容。但 AI 生成的分析仅供参考，可能存在不准确或不完整的情况。我们强烈建议将 AI 分析作为快速了解论文的起点，而非最终的学术判断。对于用于正式研究或发表的内容，务必结合原文进行人工验证。'
  },
  {
    question: '我的搜索记录和对话内容会被保存吗？',
    answer: '你的 AI 聊天对话历史会保存在你的账户中，方便后续回顾。搜索记录不会被长期保存。所有用户数据都受到严格的隐私保护，我们不会将你的个人搜索和对话内容用于广告投放或分享给第三方。详细的数据处理政策请参阅我们的隐私政策页面。'
  },
  {
    question: '遇到问题如何获取帮助？',
    answer: '如果你在使用过程中遇到任何问题，可以通过以下方式获取帮助：1) 查阅本帮助中心的使用指南和 FAQ；2) 访问学术资源中心获取详细的教程文章；3) 通过"意见反馈"页面提交问题描述；4) 发送邮件至 support@scholay.com 联系客服团队。我们的工作时间为周一至周五 9:00-18:00，通常在 24 小时内回复。'
  },
];

const HelpCenterPage = () => {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState(null);
  const [expandedFeature, setExpandedFeature] = useState(null);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return (
    <div className="resource-center-page">
      <SEO
        title="帮助中心 - Scholay | 使用指南与常见问题解答"
        description="Scholay 帮助中心提供详细的平台使用教程、功能介绍和常见问题解答，帮助你快速上手 AI 学术搜索、论文分析、智能审稿和 LaTeX 编辑等功能。"
        keywords="Scholay帮助,使用教程,常见问题,FAQ,学术搜索帮助,AI论文分析教程"
        canonical="/help"
        structuredData={structuredData}
      />

      <div className="resource-center-container">
        <div className="resource-center-header">
          <button className="back-btn" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
            <span>返回首页</span>
          </button>
        </div>

        <div className="resource-center-hero">
          <h1>帮助中心</h1>
          <p className="hero-description">
            了解 Scholay 的核心功能和使用方法，快速解决常见问题。如果需要更详细的学术指南，请访问我们的
            <button className="help-hero-link" onClick={() => navigate('/resources')}>
              学术资源中心
            </button>。
          </p>
        </div>

        {/* Features Guide */}
        <section className="help-section">
          <h2 className="help-section-title">
            <BookOpen size={22} />
            功能使用指南
          </h2>
          <div className="help-feature-list">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              const isExpanded = expandedFeature === index;
              return (
                <div
                  key={index}
                  className={`help-feature-card${isExpanded ? ' expanded' : ''}`}
                >
                  <button
                    className="help-feature-toggle"
                    onClick={() => setExpandedFeature(isExpanded ? null : index)}
                  >
                    <div className="help-feature-icon">
                      <Icon size={20} />
                    </div>
                    <div className="help-feature-info">
                      <div className="help-feature-title">{feature.title}</div>
                      <div className="help-feature-desc">{feature.description}</div>
                    </div>
                    {isExpanded
                      ? <ChevronUp size={20} className="help-chevron" />
                      : <ChevronDown size={20} className="help-chevron" />
                    }
                  </button>
                  {isExpanded && (
                    <div className="help-feature-details">
                      <ul>
                        {feature.details.map((detail, i) => (
                          <li key={i}>{detail}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* FAQ Section */}
        <section className="help-section">
          <h2 className="help-section-title">
            <HelpCircle size={22} />
            常见问题
          </h2>
          <div className="help-faq-list">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className={`help-faq-item${isOpen ? ' open' : ''}`}
                >
                  <button
                    className="help-faq-toggle"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                  >
                    <span className="help-faq-question">{faq.question}</span>
                    {isOpen
                      ? <ChevronUp size={18} className="help-chevron" />
                      : <ChevronDown size={18} className="help-chevron" />
                    }
                  </button>
                  {isOpen && (
                    <div className="help-faq-answer">
                      <p>{faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 功能推广 */}
        <FeaturePromo
          title="快速体验 Scholay 的核心功能"
          description="从这里开始，探索我们为科研工作者打造的全套 AI 工具"
        />

        {/* Footer */}
        <footer className="article-footer">
          <p className="copyright">&copy; {new Date().getFullYear()} Scholay. All rights reserved.</p>
          <nav className="footer-links">
            <button onClick={() => navigate('/resources')}>学术资源</button>
            <span>|</span>
            <button onClick={() => navigate('/about')}>关于我们</button>
            <span>|</span>
            <button onClick={() => navigate('/contact')}>联系我们</button>
            <span>|</span>
            <button onClick={() => navigate('/privacy')}>隐私政策</button>
            <span>|</span>
            <button onClick={() => navigate('/terms')}>服务条款</button>
          </nav>
        </footer>
      </div>
    </div>
  );
};

export default HelpCenterPage;
