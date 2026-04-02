/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * SearchFeaturePage — AI Academic Search promotional landing page
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Search, Brain, Filter, BookOpen, Users, GitBranch, Database, Globe, Check } from 'lucide-react';
import {
  FeatureNav, FeatureHero, FeatureStats, FeatureSectionHeader,
  FeatureGrid, FeatureSteps, FeatureCTA, FeatureFAQ, FeatureTags, FeatureJumpNav, SEO,
} from './FeaturePageComponents';

const JUMP_SECTIONS = [
  { id: 'search-modes', label: '检索模式' },
  { id: 'search-features', label: '核心功能' },
  { id: 'search-steps', label: '使用流程' },
  { id: 'search-disciplines', label: '覆盖领域' },
  { id: 'search-faq', label: '常见问题' },
];
import './SearchFeaturePage.css';

const ACCENT = '#10a37f';

const STATS = [
  { value: '2亿+', label: '学术论文' },
  { value: '19', label: '学科领域' },
  { value: '< 10s', label: '响应速度' },
  { value: '99.9%', label: '服务可用率' },
];

const FEATURES = [
  { icon: <Database size={24} />, title: '海量学术数据库', desc: '接入 Semantic Scholar 覆盖超过 2 亿篇学术论文，涵盖从计算机科学到人文社科的 19 个学科领域，确保你不会遗漏任何重要文献。' },
  { icon: <Brain size={24} />, title: 'AI 语义理解', desc: '基于大语言模型的智能检索引擎，理解你的研究意图而非简单匹配关键词，用自然语言描述研究问题即可获得精准结果。' },
  { icon: <Filter size={24} />, title: '多维度高级筛选', desc: '按发表年份、被引次数、研究领域、开放获取状态等多个维度精细过滤，快速缩小搜索范围，找到最相关的高质量文献。' },
  { icon: <BookOpen size={24} />, title: '开放获取筛选', desc: '一键筛选开放获取论文，免费获取全文 PDF。支持多种 OA 类型识别，帮助你在不破费的情况下阅读最新研究成果。' },
  { icon: <Users size={24} />, title: '作者画像分析', desc: '查看作者的完整学术档案：发表论文列表、引用统计、合作网络和研究方向变迁，帮助你了解领域内的关键研究者。' },
  { icon: <GitBranch size={24} />, title: '引用网络探索', desc: '追溯论文的引用链条和被引关系，发现相关研究的上下游脉络。从一篇核心论文出发，系统性地掌握整个研究主题。' },
];

const STEPS = [
  { title: '输入研究问题', desc: '在搜索框中输入关键词、论文标题或用自然语言描述你的研究问题。支持中英文混合输入。' },
  { title: 'AI 分析与匹配', desc: 'AI 理解你的查询意图，在 2 亿篇论文中进行语义匹配和相关性排序，综合考虑引用影响力和时效性。' },
  { title: '获取精准结果', desc: '浏览排序后的论文列表，使用多维筛选进一步精炼。点击查看论文详情、PDF 全文、引用关系和 AI 智能分析。' },
];

const DISCIPLINES = [
  '计算机科学', '生物医学', '物理学', '化学', '数学', '工程学',
  '经济学', '心理学', '社会学', '政治学', '商业', '环境科学',
  '地理学', '历史学', '哲学', '艺术', '材料科学', '地质学', '语言学',
];

const FAQ = [
  { q: 'Scholay 的论文数据来源是什么？', a: '我们整合了 Semantic Scholar 的学术图谱数据，覆盖超过 2 亿篇学术论文和预印本，数据每日更新，确保你能搜索到最新发表的研究成果。' },
  { q: '直接检索和智能检索有什么区别？', a: '直接检索使用关键词精确匹配，适合已知目标论文的快速查找。智能检索由 AI 驱动，理解自然语言描述的研究问题，自动扩展和优化查询，适合探索性研究。' },
  { q: '搜索是否需要注册或付费？', a: '基础搜索功能完全免费，无需注册即可使用。智能检索和 AI 深度分析功能需要注册账号，免费版提供每日有限次数的 AI 分析配额。' },
  { q: '可以导出搜索结果吗？', a: '可以。搜索结果支持导出为多种引用格式（APA、MLA、Chicago、IEEE 等），方便直接粘贴到论文的参考文献部分。' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

export default function SearchFeaturePage() {
  return (
    <div className="feat-page feat-search-page">
      <SEO
        title="AI 学术搜索 - Scholay | 2亿+论文智能检索"
        description="Scholay AI 学术搜索引擎，覆盖超过 2 亿篇学术论文，支持直接检索和 AI 智能语义检索两种模式，涵盖 19 个学科领域，帮助研究者高效发现和分析学术文献。"
        keywords="AI学术搜索,论文检索,智能文献搜索,Semantic Scholar,学术数据库,文献综述,学术论文搜索引擎"
        canonical="/features/search"
      />

      <FeatureNav ctaText="开始搜索" ctaTo="/" accentColor={ACCENT} />

      <main className="feat-main">
        <FeatureHero
          pill="AI-POWERED ACADEMIC SEARCH"
          title="在 2 亿篇论文中，精准找到你需要的那一篇"
          subtitle="Scholay 将大语言模型与 Semantic Scholar 学术图谱深度融合，提供直接检索和 AI 智能检索两种模式，让文献发现变得前所未有的高效。"
          ctaText="立即搜索"
          ctaTo="/"
          secondaryText="查看定价"
          secondaryTo="/pricing"
          accentColor={ACCENT}
        />

        <FeatureStats stats={STATS} accentColor={ACCENT} />

        {/* Dual Mode Showcase */}
        <section id="search-modes" className="feat-section">
          <FeatureSectionHeader
            eyebrow="两种检索模式"
            title="精确关键词 + AI 语义理解，双管齐下"
            desc="无论你是有明确的搜索目标，还是需要探索性的文献发现，Scholay 都能满足。"
            accentColor={ACCENT}
          />
          <motion.div className="feat-search-modes" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
            <motion.div className="feat-mode-card mode-direct" variants={fadeUp}>
              <span className="feat-mode-badge">直接检索</span>
              <h3>关键词精确匹配</h3>
              <p>输入论文标题、作者姓名或研究关键词，在海量数据库中精准定位目标文献。</p>
              <ul className="feat-mode-features">
                <li><Check size={16} style={{ color: '#6ef2c6' }} />关键词、标题、作者多字段搜索</li>
                <li><Check size={16} style={{ color: '#6ef2c6' }} />按年份、引用量、领域多维筛选</li>
                <li><Check size={16} style={{ color: '#6ef2c6' }} />结果按相关性和影响力排序</li>
                <li><Check size={16} style={{ color: '#6ef2c6' }} />支持中英文混合查询</li>
              </ul>
            </motion.div>
            <motion.div className="feat-mode-card mode-ai" variants={fadeUp}>
              <span className="feat-mode-badge">AI 智能检索</span>
              <h3>自然语言语义搜索</h3>
              <p>用自然语言描述你的研究问题，AI 理解意图后自动检索最相关的学术文献。</p>
              <ul className="feat-mode-features">
                <li><Check size={16} style={{ color: '#a5b4fc' }} />自然语言描述研究问题</li>
                <li><Check size={16} style={{ color: '#a5b4fc' }} />AI 自动拆解查询意图</li>
                <li><Check size={16} style={{ color: '#a5b4fc' }} />语义匹配而非关键词匹配</li>
                <li><Check size={16} style={{ color: '#a5b4fc' }} />智能推荐相关研究方向</li>
              </ul>
            </motion.div>
          </motion.div>
        </section>

        {/* Feature Grid */}
        <section id="search-features" className="feat-section">
          <FeatureSectionHeader
            eyebrow="核心功能"
            title="为学术研究打造的专业搜索体验"
            center
            accentColor={ACCENT}
          />
          <FeatureGrid items={FEATURES} accentColor={ACCENT} />
        </section>

        {/* How It Works */}
        <section id="search-steps" className="feat-section">
          <FeatureSectionHeader
            eyebrow="使用流程"
            title="三步开始你的文献检索"
            center
            accentColor={ACCENT}
          />
          <FeatureSteps steps={STEPS} accentColor={ACCENT} />
        </section>

        {/* Disciplines */}
        <section id="search-disciplines" className="feat-section">
          <FeatureSectionHeader
            eyebrow="覆盖领域"
            title="横跨 19 个学科的全面覆盖"
            desc="从自然科学到人文社科，Scholay 确保每个研究方向都能找到相关文献。"
            center
            accentColor={ACCENT}
          />
          <FeatureTags tags={DISCIPLINES} />
        </section>

        {/* FAQ */}
        <section id="search-faq" className="feat-section">
          <FeatureSectionHeader eyebrow="常见问题" title="关于学术搜索的更多解答" center accentColor={ACCENT} />
          <FeatureFAQ items={FAQ} />
        </section>

        {/* Final CTA */}
        <FeatureCTA
          title="开始你的学术探索之旅"
          desc="免费注册即可使用基础搜索功能，立即在 2 亿篇论文中发现你需要的文献。"
          ctaText="立即搜索"
          ctaTo="/"
          accentColor={ACCENT}
        />
      </main>
      <FeatureJumpNav sections={JUMP_SECTIONS} accentColor={ACCENT} />
    </div>
  );
}
