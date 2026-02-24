/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * PeerReviewFeaturePage — AI Peer Review promotional landing page
 */

import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Shield, Lightbulb, PenTool, BarChart3, Languages, Upload, Check } from 'lucide-react';
import {
  FeatureNav, FeatureHero, FeatureStats, FeatureSectionHeader,
  FeatureGrid, FeatureSteps, FeatureShowcase, FeatureCTA, FeatureFAQ, SEO,
} from './FeaturePageComponents';
import './PeerReviewFeaturePage.css';

const ACCENT = '#6366f1';

const STATS = [
  { value: '5 维度', label: '全面评审' },
  { value: '3 视角', label: '多审稿人' },
  { value: '< 3 min', label: '生成报告' },
  { value: 'PDF/Word/PPT', label: '多格式导出' },
];

const DIMENSIONS = [
  { icon: <Shield size={24} />, title: '学术规范审查', desc: '检查论文格式、引用规范、参考文献格式是否符合目标期刊的学术标准，识别格式不一致和引用遗漏。' },
  { icon: <BarChart3 size={24} />, title: '逻辑结构评估', desc: '评估论文整体结构的完整性、论证逻辑的严密性以及段落间的衔接自然度，确保论点有力。' },
  { icon: <Languages size={24} />, title: '语言表达质量', desc: '检查学术用语的准确性、语法错误、表达清晰度和行文流畅度，特别针对非母语写作者的常见问题。' },
  { icon: <PenTool size={24} />, title: '研究方法评价', desc: '评估研究设计的科学性、实验方法的合理性、数据分析的恰当性，识别方法论上的潜在弱点。' },
  { icon: <Lightbulb size={24} />, title: '创新性与贡献', desc: '分析研究的原创性、理论或实践贡献，与现有文献的差异化定位，评估学术影响力潜力。' },
  { icon: <FileText size={24} />, title: '结构化审稿报告', desc: '生成按问题严重性分级的审稿报告，包含具体修改建议、改进方向和评分雷达图，可直接指导论文修改。' },
];

const STEPS = [
  { title: '上传论文', desc: '支持 PDF、Word、TXT 文件上传，也可以直接粘贴论文文本。最大支持 50 页的完整论文。' },
  { title: 'AI 多角度审稿', desc: '三位 AI 审稿人从不同专业视角同时审查论文，涵盖学术规范、逻辑结构、语言质量、方法论和创新性五大维度。' },
  { title: '获取结构化报告', desc: '查看详细的审稿报告，包含评分雷达图、分级问题清单和具体修改建议。支持导出为 Word、PDF 或 PPT 格式。' },
];

const REPORT_FEATURES = [
  '按严重性分级的问题清单（Critical / Major / Minor）',
  '每个问题附带具体修改建议和改进方向',
  '五维度评分雷达图直观展示论文综合水平',
  '可导出为 Word、PDF、PPT 三种格式',
  '支持中英文论文审稿',
];

const FAQ = [
  { q: 'AI 审稿能替代正式同行评审吗？', a: '不能。AI 审稿是投稿前的自我审查工具，帮助你提前发现和修正问题，提高论文质量和投稿通过率。最终的学术判断仍需依赖人类专家的同行评审。' },
  { q: '支持哪些学科的论文？', a: '支持所有学科领域的学术论文审稿，包括自然科学、工程技术、社会科学、人文艺术等。AI 会根据论文内容自动调整审稿侧重点。' },
  { q: '论文数据安全如何保障？', a: '上传的论文仅用于当次审稿分析，不会被存储或用于其他目的。所有数据传输采用 SSL 加密，严格遵守隐私保护政策。' },
  { q: '审稿报告包含哪些内容？', a: '报告包含五维度评分、分级问题清单（Critical/Major/Minor）、具体修改建议、总体评价和改进方向。每位 AI 审稿人会从不同角度提供独立意见。' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

function RadarMockup() {
  const bars = [
    { label: '学术规范', value: 85 },
    { label: '逻辑结构', value: 72 },
    { label: '语言质量', value: 90 },
    { label: '研究方法', value: 68 },
    { label: '创新性', value: 78 },
  ];
  return (
    <div className="feat-radar-mockup">
      {bars.map(b => (
        <div key={b.label} className="feat-radar-bar">
          <span className="feat-radar-label">{b.label}</span>
          <div className="feat-radar-track">
            <div className="feat-radar-fill" style={{ width: `${b.value}%` }} />
          </div>
          <span className="feat-radar-value">{b.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function PeerReviewFeaturePage() {
  return (
    <div className="feat-page feat-review-page">
      <SEO
        title="AI 智能审稿 - Scholay | 多维度论文评审与修改建议"
        description="Scholay AI 智能审稿模拟同行评审流程，从学术规范、逻辑结构、语言质量、方法论和创新性五大维度，由三位 AI 审稿人多角度评审论文，生成结构化审稿报告。"
        keywords="AI审稿,智能审稿,论文评审,同行评审,论文修改,学术审稿,论文质量检查,投稿前审查"
        canonical="/features/peer-review"
      />

      <FeatureNav ctaText="开始审稿" ctaTo="/peer-review" accentColor={ACCENT} />

      <main className="feat-main">
        <FeatureHero
          pill="AI-POWERED PEER REVIEW"
          title="投稿前，先让 AI 审稿人帮你把关"
          subtitle="三位 AI 审稿人从不同专业视角同时审查你的论文，覆盖学术规范、逻辑结构、语言质量、方法论和创新性五大维度，帮你在正式投稿前发现并修正问题。"
          ctaText="立即审稿"
          ctaTo="/peer-review"
          secondaryText="查看示例报告"
          secondaryTo="/peer-review"
          accentColor={ACCENT}
        />

        <FeatureStats stats={STATS} accentColor={ACCENT} />

        {/* Multi-Reviewer Showcase */}
        <section className="feat-section">
          <FeatureSectionHeader
            eyebrow="多审稿人系统"
            title="三位 AI 审稿人，三种专业视角"
            desc="每位审稿人从不同角度审查你的论文，确保评审的全面性和多样性，模拟真实的同行评审过程。"
            accentColor={ACCENT}
          />
          <motion.div className="feat-reviewers" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
            <motion.div className="feat-reviewer-card feat-reviewer-alpha" variants={fadeUp}>
              <div className="feat-reviewer-avatar">α</div>
              <h3>Reviewer Alpha</h3>
              <div className="feat-reviewer-role">学术规范专家</div>
              <p>专注于论文的学术规范性和格式标准，检查引用完整性、参考文献格式一致性、术语使用准确性和行文规范。</p>
            </motion.div>
            <motion.div className="feat-reviewer-card feat-reviewer-beta" variants={fadeUp}>
              <div className="feat-reviewer-avatar">β</div>
              <h3>Reviewer Beta</h3>
              <div className="feat-reviewer-role">方法论审查员</div>
              <p>深入评估研究设计和方法论，分析实验方案的科学性、数据分析方法的恰当性、结论与证据的一致性。</p>
            </motion.div>
            <motion.div className="feat-reviewer-card feat-reviewer-gamma" variants={fadeUp}>
              <div className="feat-reviewer-avatar">γ</div>
              <h3>Reviewer Gamma</h3>
              <div className="feat-reviewer-role">综合评价专家</div>
              <p>从宏观角度评价论文的创新性、学术贡献和影响力潜力，评估逻辑结构和论证力度。</p>
            </motion.div>
          </motion.div>
        </section>

        {/* Dimensions Grid */}
        <section className="feat-section">
          <FeatureSectionHeader
            eyebrow="审稿维度"
            title="五大维度的全面评审"
            center
            accentColor={ACCENT}
          />
          <FeatureGrid items={DIMENSIONS} accentColor={ACCENT} />
        </section>

        {/* Report Showcase */}
        <section className="feat-section">
          <FeatureShowcase
            title="结构化审稿报告"
            desc="审稿报告按问题严重性分级，每个问题都附有具体的修改建议，帮助你有针对性地改进论文。"
            items={REPORT_FEATURES}
            visual={<RadarMockup />}
            accentColor={ACCENT}
          />
        </section>

        {/* Supported Formats */}
        <section className="feat-section">
          <FeatureSectionHeader eyebrow="支持格式" title="灵活的输入与输出" center accentColor={ACCENT} />
          <motion.div className="feat-formats" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
            {[
              { ext: 'PDF', label: '上传', desc: '完整保留格式', color: '#ef4444' },
              { ext: 'DOCX', label: '上传', desc: 'Word 文档', color: '#3b82f6' },
              { ext: 'TXT', label: '粘贴', desc: '纯文本内容', color: '#10b981' },
              { ext: 'PPT', label: '导出', desc: '报告演示', color: '#f59e0b' },
            ].map((f, i) => (
              <motion.div key={i} className="feat-format-item" variants={fadeUp}>
                <div className="feat-format-icon" style={{ background: `${f.color}20`, color: f.color }}>{f.ext}</div>
                <h4>{f.label}</h4>
                <p>{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* How It Works */}
        <section className="feat-section">
          <FeatureSectionHeader eyebrow="使用流程" title="三步获取专业审稿报告" center accentColor={ACCENT} />
          <FeatureSteps steps={STEPS} accentColor={ACCENT} />
        </section>

        {/* FAQ */}
        <section className="feat-section">
          <FeatureSectionHeader eyebrow="常见问题" title="关于智能审稿的更多解答" center accentColor={ACCENT} />
          <FeatureFAQ items={FAQ} />
        </section>

        {/* Final CTA */}
        <FeatureCTA
          title="在投稿前，提升你的论文质量"
          desc="上传论文即可获取 AI 审稿报告，发现潜在问题，提高投稿通过率。"
          ctaText="立即审稿"
          ctaTo="/peer-review"
          accentColor={ACCENT}
        />
      </main>
    </div>
  );
}
