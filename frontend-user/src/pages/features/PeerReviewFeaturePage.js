/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * PeerReviewFeaturePage — AI Peer Review promotional landing page
 * Custom hero with floating report preview + interactive demo.
 */

import React, { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, BarChart3, Languages, PenTool, Lightbulb, FileText } from 'lucide-react';
import {
  FeatureNav, FeatureStats, FeatureSectionHeader,
  FeatureGrid, FeatureSteps, FeatureCTA, FeatureFAQ, SEO,
} from './FeaturePageComponents';
import { DEMO_SCORES } from './peerReviewDemoData';
import './PeerReviewFeaturePage.css';

const PeerReviewDemo = lazy(() => import('./PeerReviewDemo'));

const ACCENT = '#6366f1';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.25, 0.1, 0.25, 1] } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const STATS = [
  { value: '5 维度', label: '全面评审' },
  { value: '3 视角', label: '多审稿人' },
  { value: '< 3 min', label: '生成报告' },
  { value: 'PDF/Word/PPT', label: '多格式导出' },
];

const DIMENSIONS = [
  { icon: <Lightbulb size={24} />, title: '原创性 (Originality)', desc: '分析研究的原创性和创新点，与现有文献的差异化定位，评估学术价值和理论贡献。' },
  { icon: <PenTool size={24} />, title: '方法论 (Methodology)', desc: '评估研究设计的科学性、实验方案的合理性、数据分析方法的恰当性，识别方法论缺陷。' },
  { icon: <Languages size={24} />, title: '清晰度与呈现 (Clarity)', desc: '检查论文结构、行文逻辑、图表质量和学术用语准确性，确保表达清晰且符合目标期刊规范。' },
  { icon: <BarChart3 size={24} />, title: '重要性 (Significance)', desc: '评价研究发现的重要性和影响力潜力，分析对本领域和跨学科的理论或实践贡献。' },
  { icon: <Shield size={24} />, title: '可复现性 (Reproducibility)', desc: '审查数据可用性、代码开源情况、实验描述完整度，评估他人能否独立复现研究结果。' },
  { icon: <FileText size={24} />, title: '结构化审稿报告', desc: '生成按问题严重性分级（Critical/Major/Minor）的审稿报告，附具体修改建议和五维雷达图。' },
];

const STEPS = [
  { title: '上传论文', desc: '支持 PDF、Word、TXT 文件上传，也可以直接粘贴论文文本。最大支持 50 页的完整论文。' },
  { title: 'AI 多角度审稿', desc: '三位 AI 审稿人从不同专业视角同时审查论文，涵盖原创性、方法论、清晰度、重要性和可复现性五大维度。' },
  { title: '获取结构化报告', desc: '查看详细的审稿报告，包含评分雷达图、分级问题清单和具体修改建议。支持导出为 Word、PDF 或 PPT 格式。' },
];

const FAQ = [
  { q: 'AI 审稿能替代正式同行评审吗？', a: '不能。AI 审稿是投稿前的自我审查工具，帮助你提前发现和修正问题，提高论文质量和投稿通过率。最终的学术判断仍需依赖人类专家的同行评审。' },
  { q: '支持哪些学科的论文？', a: '支持所有学科领域的学术论文审稿，包括自然科学、工程技术、社会科学、人文艺术等。AI 会根据论文内容自动调整审稿侧重点。' },
  { q: '论文数据安全如何保障？', a: '上传的论文仅用于当次审稿分析，不会被存储或用于其他目的。所有数据传输采用 SSL 加密，严格遵守隐私保护政策。' },
  { q: '审稿报告包含哪些内容？', a: '报告包含五维度评分雷达图、分级问题清单（Critical/Major/Minor）、具体修改建议、总体评价和详细评审意见。每位 AI 审稿人会从不同角度提供独立意见。' },
];

// Mini floating report card shown in the hero
function HeroReportPreview() {
  const dims = [
    { label: 'Originality', val: DEMO_SCORES.originality },
    { label: 'Methodology', val: DEMO_SCORES.methodology },
    { label: 'Clarity', val: DEMO_SCORES.clarity },
    { label: 'Significance', val: DEMO_SCORES.significance },
    { label: 'Reproducibility', val: DEMO_SCORES.reproducibility },
  ];

  return (
    <motion.div
      className="hero-report-card"
      initial={{ opacity: 0, y: 40, rotateY: -8, rotateX: 4 }}
      animate={{ opacity: 1, y: 0, rotateY: -4, rotateX: 2 }}
      transition={{ duration: 0.8, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {/* Journal-style header bar */}
      <div className="hrc-header">
        <div className="hrc-header-left">
          <span className="hrc-journal-dot" />
          <span className="hrc-journal-name">Peer Review Report</span>
        </div>
        <span className="hrc-date">2025-03-28</span>
      </div>

      {/* Manuscript title */}
      <div className="hrc-manuscript">
        <span className="hrc-ms-label">Manuscript ID: SCH-2025-0347</span>
        <div className="hrc-ms-title">
          Deep Learning-Based Automated Detection of Pulmonary Nodules in Low-Dose CT Scans
        </div>
      </div>

      {/* Verdict */}
      <div className="hrc-verdict-row">
        <span className="hrc-verdict-label">Recommendation</span>
        <span className="hrc-verdict-badge">Minor Revision</span>
        <span className="hrc-consensus">Consensus 78%</span>
      </div>

      {/* Score bars */}
      <div className="hrc-scores">
        {dims.map((d) => (
          <div key={d.label} className="hrc-score-row">
            <span className="hrc-score-name">{d.label}</span>
            <div className="hrc-score-track">
              <motion.div
                className="hrc-score-fill"
                initial={{ width: 0 }}
                animate={{ width: `${d.val}%` }}
                transition={{ duration: 1.2, delay: 0.8, ease: 'easeOut' }}
              />
            </div>
            <span className="hrc-score-val">{d.val}</span>
          </div>
        ))}
      </div>

      {/* Issue preview */}
      <div className="hrc-issues">
        <div className="hrc-issue">
          <span className="hrc-issue-sev critical">Critical</span>
          <span className="hrc-issue-text">Incomplete comparison with SOTA methods</span>
        </div>
        <div className="hrc-issue">
          <span className="hrc-issue-sev major">Major</span>
          <span className="hrc-issue-text">Cross-center variance not statistically tested</span>
        </div>
        <div className="hrc-issue">
          <span className="hrc-issue-sev major">Major</span>
          <span className="hrc-issue-text">Preprocessing pipeline lacks detail</span>
        </div>
      </div>

      {/* Glow effect */}
      <div className="hrc-glow" />
    </motion.div>
  );
}

export default function PeerReviewFeaturePage() {
  const navigate = useNavigate();

  return (
    <div className="feat-page feat-review-page">
      <SEO
        title="AI 智能审稿 - Scholay | 多维度论文评审与修改建议"
        description="Scholay AI 智能审稿模拟同行评审流程，从原创性、方法论、清晰度、重要性和可复现性五大维度，由三位 AI 审稿人多角度评审论文，生成结构化审稿报告。"
        keywords="AI审稿,智能审稿,论文评审,同行评审,论文修改,学术审稿,论文质量检查,投稿前审查"
        canonical="/features/peer-review"
      />

      <FeatureNav ctaText="开始审稿" ctaTo="/peer-review" accentColor={ACCENT} />

      <main className="feat-main">
        {/* ===== Custom Hero with Report Preview ===== */}
        <section className="pr-hero">
          <div className="pr-hero-content">
            <motion.span
              className="feat-hero-pill"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              AI-POWERED PEER REVIEW
            </motion.span>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              投稿前，先让 AI<br />审稿人帮你把关
            </motion.h1>
            <motion.p
              className="pr-hero-sub"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              三位 AI 审稿人从不同专业视角同时审查你的论文，覆盖五大维度评审，生成期刊级结构化审稿报告。
            </motion.p>
            <motion.div
              className="pr-hero-actions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <button
                className="feat-btn-primary"
                style={{ background: `linear-gradient(120deg, ${ACCENT} 0%, #4f46e5 100%)`, boxShadow: `0 15px 40px ${ACCENT}44` }}
                onClick={() => navigate('/peer-review')}
              >
                立即审稿
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
              <a className="feat-btn-secondary" href="#demo">
                查看演示报告 ↓
              </a>
            </motion.div>
          </div>
          <div className="pr-hero-visual">
            <HeroReportPreview />
          </div>
        </section>

        <FeatureStats stats={STATS} accentColor={ACCENT} />

        {/* ===== Interactive Demo ===== */}
        <section className="feat-section" id="demo">
          <FeatureSectionHeader
            eyebrow="实时演示"
            title="体验完整的 AI 审稿报告"
            desc="滚动到此区域后自动演示审稿流程。完成后你可以交互查看完整报告、切换审稿人视角、并导出真实格式文件。"
            center
            accentColor={ACCENT}
          />
          <Suspense fallback={
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,0.3)' }}>
              加载演示组件...
            </div>
          }>
            <PeerReviewDemo />
          </Suspense>
        </section>

        {/* ===== Reviewers ===== */}
        <section className="feat-section">
          <FeatureSectionHeader
            eyebrow="多审稿人系统"
            title="三位 AI 审稿人，三种专业视角"
            desc="每位审稿人从不同角度审查你的论文，确保评审的全面性和多样性。"
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

        {/* ===== Dimensions Grid ===== */}
        <section className="feat-section">
          <FeatureSectionHeader eyebrow="审稿维度" title="五大维度的全面评审" center accentColor={ACCENT} />
          <FeatureGrid items={DIMENSIONS} accentColor={ACCENT} />
        </section>

        {/* ===== Formats ===== */}
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

        {/* ===== Steps ===== */}
        <section className="feat-section">
          <FeatureSectionHeader eyebrow="使用流程" title="三步获取专业审稿报告" center accentColor={ACCENT} />
          <FeatureSteps steps={STEPS} accentColor={ACCENT} />
        </section>

        {/* ===== FAQ ===== */}
        <section className="feat-section">
          <FeatureSectionHeader eyebrow="常见问题" title="关于智能审稿的更多解答" center accentColor={ACCENT} />
          <FeatureFAQ items={FAQ} />
        </section>

        {/* ===== CTA ===== */}
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
