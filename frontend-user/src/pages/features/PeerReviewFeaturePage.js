/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * PeerReviewFeaturePage — Ground-up redesign
 * Design philosophy: outcome-focused copy, product-in-hero, premium dark theme,
 * bento grid features, layered trust architecture, spring-physics animations.
 */

import React, { lazy, Suspense, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, CheckCircle2, Sparkles, ChevronDown,
  FileText, Zap, Shield, BarChart3, Users, Download,
  BookOpen, Award, TrendingUp, Clock, ChevronRight,
  Lock, BrainCircuit, EyeOff, FileCheck, ShieldCheck,
} from 'lucide-react';
import { FeatureNav, FeatureFAQ, FeatureCTA, FeatureJumpNav, SEO } from './FeaturePageComponents';
import { DEMO_SCORES } from './peerReviewDemoData';
import './PeerReviewFeaturePage.css';

const JUMP_SECTIONS = [
  { id: 'pr-pipeline', label: '审稿引擎' },
  { id: 'pr-features', label: '核心能力' },
  { id: 'pr-demo', label: '体验演示' },
  { id: 'pr-security', label: '数据安全' },
  { id: 'pr-faq', label: '常见问题' },
];

const PeerReviewDemo = lazy(() => import('./PeerReviewDemo'));

/* ─────────────────────────────────────────────
   Constants / data
───────────────────────────────────────────── */
const ACCENT = '#8b5cf6';

// Pipeline stages for the process flow diagram
const PIPELINE_STAGES = [
  {
    id: 'upload',
    icon: <FileText size={22} />,
    color: '#6366f1',
    label: '上传稿件',
    detail: 'PDF · DOCX · TXT',
  },
  {
    id: 'parse',
    icon: <BookOpen size={22} />,
    color: '#8b5cf6',
    label: '稿件解析',
    detail: '元信息提取',
  },
  {
    id: 'search',
    icon: <TrendingUp size={22} />,
    color: '#06b6d4',
    label: '文献检索',
    detail: 'Semantic Scholar',
  },
  {
    id: 'review',
    icon: <Users size={22} />,
    color: '#10b981',
    label: '三路并行审稿',
    detail: 'α · β · γ 独立评审',
    wide: true,
  },
  {
    id: 'meta',
    icon: <Award size={22} />,
    color: '#f59e0b',
    label: 'Meta-Review',
    detail: '共识合成 · 分歧解决',
  },
  {
    id: 'report',
    icon: <BarChart3 size={22} />,
    color: '#ec4899',
    label: '结构化报告',
    detail: '五维评分 · 分级问题',
  },
];

const JOURNALS = [
  'Nature', 'Science', 'IEEE', 'ACM', 'NeurIPS',
  'ICML', 'CVPR', 'Cell', 'The Lancet', 'NEJM',
  'AAAI', 'ICLR', 'ECCV', 'KDD', 'WWW',
];

const BENTO = [
  {
    id: 'analysis',
    size: 'wide',
    icon: <BarChart3 size={20} />,
    label: '五维度评分',
    title: '像顶刊审稿人一样读你的论文',
    desc: '原创性、方法论、清晰度、重要性、可复现性五大维度逐一评分，问题严重性按 Critical / Major / Minor 三级分类，附具体修改建议。',
    accent: '#8b5cf6',
    preview: 'radar',
  },
  {
    id: 'speed',
    size: 'narrow',
    icon: <Zap size={20} />,
    label: '极速生成',
    title: '< 3 分钟',
    desc: '文献预处理 + 三路并行审稿 + Meta-Review 合成，完整流水线不超过 3 分钟交付报告。',
    accent: '#f59e0b',
    preview: 'progress',
  },
  {
    id: 'multi',
    size: 'narrow',
    icon: <Users size={20} />,
    label: '三路并行 + Meta-Review',
    title: '三位独立审稿人',
    desc: '原创性专家、方法论审查员、影响力评估专家使用不同 AI 模型独立评审，第四位 Meta-Reviewer 合成共识并解决分歧。',
    accent: '#10b981',
    preview: 'reviewers',
  },
  {
    id: 'export',
    size: 'narrow',
    icon: <Download size={20} />,
    label: '一键导出',
    title: 'Word · PDF',
    desc: '导出期刊级格式报告，直接可以分享给导师或共同作者。',
    accent: '#3b82f6',
    preview: 'export',
  },
  {
    id: 'formats',
    size: 'narrow',
    icon: <FileText size={20} />,
    label: '多格式上传',
    title: 'PDF · DOCX · TXT',
    desc: '上传文件或直接粘贴文本，支持最长 50 页完整论文。',
    accent: '#ec4899',
    preview: 'upload',
  },
  {
    id: 'reproducibility',
    size: 'wide',
    icon: <Shield size={20} />,
    label: '可复现性审查',
    title: '不只是文字，更看数据与代码',
    desc: '专门检查数据可用性声明、代码开源情况、实验细节描述完整度——这恰恰是大多数投稿被拒的隐藏原因。',
    accent: '#06b6d4',
    preview: 'reproduce',
  },
];

const FAQ_ITEMS = [
  { q: 'AI 审稿能替代正式同行评审吗？', a: '不能。AI 审稿是投稿前的自我审查工具，帮助你提前发现和修正问题，提高论文质量和投稿通过率。最终的学术判断仍需依赖人类专家的同行评审。' },
  { q: '为什么需要三位审稿人？', a: '每位 AI 审稿人聚焦不同专业视角：Reviewer α 专注原创性与理论贡献，Reviewer β 审查方法论与技术严谨性，Reviewer γ 评估清晰度与影响力。三位使用不同 AI 模型独立运行，避免单一模型的偏差，再由 Meta-Reviewer 合成共识报告。' },
  { q: '文献检索有什么作用？', a: '系统在审稿前先对你的论文进行学术检索，找到领域内最相似的已发表论文和典型研究空白。这让审稿人能做出有据可查的新颖性判断，而非凭空评估，大幅提升审稿的针对性和可信度。' },
  { q: '审稿报告包含哪些内容？', a: '报告包含五维度评分雷达图（原创性/方法论/清晰度/重要性/可复现性）、分级问题清单（Critical/Major/Minor）、具体修改建议、各审稿人独立意见以及 Meta-Reviewer 合成的最终结论（Accept/Minor Revision/Major Revision/Reject）。' },
  { q: '支持哪些学科的论文？', a: '支持所有学科领域的学术论文，包括自然科学、工程技术、社会科学、人文艺术等。AI 会根据论文内容自动调整审稿侧重点，并从相关领域数据库检索文献。' },
  { q: '论文数据安全如何保障？', a: '上传的论文仅用于当次审稿分析，不会被存储或用于训练其他模型。所有数据传输采用 SSL 加密，严格遵守隐私保护政策。' },
  { q: '一篇论文能审稿几次？', a: '修改后可以反复提交审稿，每次都会生成新的独立报告。非常适合在投稿前迭代改进，跟踪每一轮修改的提升效果。' },
  { q: '我的论文数据安全吗？', a: '完全安全。所有数据传输使用 TLS 加密，论文内容不会被用于 AI 模型训练。您可以随时删除已上传的论文和审稿记录。我们严格遵守数据保护法规。' },
  { q: '什么是隐私审稿模式？', a: '隐私审稿模式专为对数据安全有更高要求的用户设计。开启后，审稿报告生成完毕后，您的论文原文和审稿数据将在 24 小时内从服务器自动删除，且不会出现在历史记录中。适合审稿未发表的论文。' },
];

/* ─────────────────────────────────────────────
   Sub-components
───────────────────────────────────────────── */

/** Ambient mesh background */
function MeshBackground() {
  return (
    <div className="pr-mesh" aria-hidden>
      <div className="pr-mesh-orb pr-orb-1" />
      <div className="pr-mesh-orb pr-orb-2" />
      <div className="pr-mesh-orb pr-orb-3" />
      <svg className="pr-mesh-grid" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="pr-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#pr-grid)" />
      </svg>
    </div>
  );
}

/** Scanning shimmer line over paper mockup */
function ScanLine() {
  return <div className="pr-scanline" aria-hidden />;
}

/** Live counter badge */
function LiveCounter() {
  const [count, setCount] = useState(2847);
  useEffect(() => {
    const id = setInterval(() => {
      if (Math.random() > 0.7) setCount(c => c + Math.floor(Math.random() * 3) + 1);
    }, 3500);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="pr-live-badge">
      <span className="pr-live-dot" />
      <span>正在审稿 <strong>{count.toLocaleString()}</strong> 篇论文</span>
    </div>
  );
}

/** Journal scrolling ticker */
function JournalTicker() {
  const doubled = [...JOURNALS, ...JOURNALS];
  return (
    <div className="pr-ticker-wrap">
      <div className="pr-ticker-fade pr-ticker-fade-l" />
      <div className="pr-ticker-fade pr-ticker-fade-r" />
      <div className="pr-ticker">
        {doubled.map((j, i) => (
          <span key={i} className="pr-ticker-item">{j}</span>
        ))}
      </div>
    </div>
  );
}

/** Hero right panel — report thumbnail + CTA */
function HeroPreview({ onCTA }) {
  const BARS = [
    { key: 'Methodology',    val: DEMO_SCORES.methodology,    c: '#8b5cf6', delay: 0.7 },
    { key: 'Reproducibility',val: DEMO_SCORES.reproducibility, c: '#10b981', delay: 0.8 },
    { key: 'Significance',   val: DEMO_SCORES.significance,   c: '#f59e0b', delay: 0.9 },
    { key: 'Originality',    val: DEMO_SCORES.originality,    c: '#3b82f6', delay: 1.0 },
    { key: 'Clarity',        val: DEMO_SCORES.clarity,        c: '#ec4899', delay: 1.1 },
  ];

  const dims = ['Orig.', 'Meth.', 'Clarity', 'Sig.', 'Repro.'];
  const vals = [DEMO_SCORES.originality, DEMO_SCORES.methodology, DEMO_SCORES.clarity, DEMO_SCORES.significance, DEMO_SCORES.reproducibility];
  const cx = 52, cy = 52, r = 36, n = 5;
  const pt = (i, ratio) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * ratio * Math.cos(a), cy + r * ratio * Math.sin(a)];
  };
  const dataPath = vals.map((v, i) => pt(i, v / 100).join(',')).join(' ');

  return (
    <div className="pr-hero-preview">
      {/* Report card */}
      <div className="pr-preview-card">
        <ScanLine />

        {/* Header bar */}
        <div className="pr-pv-hdr">
          <div className="pr-pv-hdr-bar" />
          <div className="pr-pv-hdr-inner">
            <div>
              <div className="pr-pv-hdr-title">PEER REVIEW REPORT</div>
              <div className="pr-pv-hdr-sub">Scholay AI · SCH-2025-0347</div>
            </div>
            <span className="pr-pv-conf">Confidential</span>
          </div>
        </div>

        {/* Verdict row */}
        <div className="pr-pv-verdict">
          <div className="pr-pv-vd">
            <span className="pr-pv-vd-label">RECOMMENDATION</span>
            <span className="pr-pv-vd-val minor">Minor Revision</span>
          </div>
          <div className="pr-pv-vd">
            <span className="pr-pv-vd-label">CONSENSUS</span>
            <span className="pr-pv-vd-val green">78%</span>
          </div>
          <div className="pr-pv-vd">
            <span className="pr-pv-vd-label">TIME</span>
            <span className="pr-pv-vd-val">2m 43s</span>
          </div>
        </div>

        {/* Radar + bars */}
        <div className="pr-pv-scores">
          <svg viewBox="0 0 104 104" width="104" height="104" className="pr-pv-radar">
            {[0.25, 0.5, 0.75, 1].map((lv, li) => (
              <polygon key={li} points={dims.map((_, i) => pt(i, lv).join(',')).join(' ')}
                fill="none" stroke={`rgba(139,92,246,${0.1 + li * 0.07})`} strokeWidth="0.7" />
            ))}
            {dims.map((_, i) => {
              const [x2, y2] = pt(i, 1);
              return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(139,92,246,0.12)" strokeWidth="0.5" />;
            })}
            <polygon points={dataPath} fill="rgba(139,92,246,0.2)" stroke="#8b5cf6" strokeWidth="1.5" />
            {vals.map((v, i) => {
              const [x, y] = pt(i, v / 100);
              return <circle key={i} cx={x} cy={y} r="2.5" fill="#8b5cf6" />;
            })}
          </svg>
          <div className="pr-pv-bars">
            {BARS.map(b => (
              <div key={b.key} className="pr-pv-bar-row">
                <span className="pr-pv-bar-lbl">{b.key}</span>
                <div className="pr-pv-bar-track">
                  <div className="pr-pv-bar-fill" style={{ background: b.c, width: `${b.val}%` }} />
                </div>
                <span className="pr-pv-bar-num" style={{ color: b.c }}>{b.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Issues preview */}
        <div className="pr-pv-issues">
          {[
            { sev: 'Critical', c: '#ef4444', text: 'Incomplete comparison with SOTA methods' },
            { sev: 'Major',    c: '#f59e0b', text: 'Cross-center variance not statistically tested' },
            { sev: 'Minor',    c: '#3b82f6', text: 'Clarify attention map evaluation method' },
          ].map((iss, i) => (
            <div key={i} className="pr-pv-issue">
              <span className="pr-pv-sev" style={{ color: iss.c, background: `${iss.c}14`, borderColor: `${iss.c}30` }}>{iss.sev}</span>
              <span className="pr-pv-issue-txt">{iss.text}</span>
            </div>
          ))}
        </div>

        {/* Reviewers */}
        <div className="pr-pv-rvs">
          {[
            { s: 'α', c: '#10b981', rec: 'Minor Revision' },
            { s: 'β', c: '#8b5cf6', rec: 'Major Revision' },
            { s: 'γ', c: '#f59e0b', rec: 'Minor Revision' },
          ].map(rv => (
            <div key={rv.s} className="pr-pv-rv">
              <div className="pr-pv-rv-av" style={{ background: rv.c }}>{rv.s}</div>
              <div className="pr-pv-rv-rec" style={{ color: rv.c }}>{rv.rec}</div>
            </div>
          ))}
        </div>

        {/* Fade + embedded CTA */}
        <div className="pr-preview-fade">
          <button className="pr-preview-cta-btn" onClick={onCTA}>
            <Sparkles size={15} />
            立即免费体验 AI 审稿
            <ArrowRight size={15} />
          </button>
          <p className="pr-preview-cta-note">无需注册 · 首次免费 · {'<'} 3 分钟出报告</p>
        </div>
      </div>

      {/* Floating badges */}
      <div className="pr-float-badge pr-float-tl">
        <CheckCircle2 size={13} style={{ color: '#10b981' }} />
        AI 审稿完成
      </div>
      <div className="pr-float-badge pr-float-br">
        <BarChart3 size={13} style={{ color: '#8b5cf6' }} />
        5 维度 · 3+1 审稿人
      </div>
    </div>
  );
}


/** Bento card preview snippets */
function BentoPreview({ type, accent }) {
  if (type === 'radar') {
    const dims = ['Orig.', 'Meth.', 'Clarity', 'Sig.', 'Repro.'];
    const vals = [DEMO_SCORES.originality, DEMO_SCORES.methodology, DEMO_SCORES.clarity, DEMO_SCORES.significance, DEMO_SCORES.reproducibility];
    const cx = 64, cy = 64, r = 46;
    const n = 5;
    const pt = (i, ratio) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      return [cx + r * ratio * Math.cos(a), cy + r * ratio * Math.sin(a)];
    };
    const dataPath = vals.map((v, i) => pt(i, v / 100).join(',')).join(' ');
    return (
      <div className="bento-preview bento-radar">
        <svg viewBox="0 0 128 128" width="128" height="128">
          {[0.25, 0.5, 0.75, 1].map((lv, li) => (
            <polygon key={li} points={dims.map((_, i) => pt(i, lv).join(',')).join(' ')}
              fill="none" stroke={`rgba(139,92,246,${0.1 + li * 0.07})`} strokeWidth="0.8" />
          ))}
          {dims.map((_, i) => {
            const [x2, y2] = pt(i, 1);
            return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(139,92,246,0.15)" strokeWidth="0.6" />;
          })}
          <polygon points={dataPath} fill="rgba(139,92,246,0.18)" stroke="#8b5cf6" strokeWidth="1.5" />
          {vals.map((v, i) => {
            const [x, y] = pt(i, v / 100);
            return <circle key={i} cx={x} cy={y} r="3" fill="#8b5cf6" />;
          })}
        </svg>
        <div className="bento-radar-scores">
          {dims.map((d, i) => (
            <div key={d} className="bento-radar-row">
              <span>{d}</span>
              <div className="bento-radar-bar">
                <div style={{ width: `${vals[i]}%`, background: accent, height: '100%', borderRadius: 2 }} />
              </div>
              <span className="bento-radar-val">{vals[i]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'progress') {
    return (
      <div className="bento-preview bento-progress">
        {[
          { label: '文献检索', pct: 100, c: '#06b6d4' },
          { label: 'Reviewer α', pct: 100, c: '#10b981' },
          { label: 'Reviewer β', pct: 100, c: '#8b5cf6' },
          { label: 'Reviewer γ', pct: 100, c: '#f59e0b' },
          { label: 'Meta-Review', pct: 100, c: '#3b82f6' },
        ].map(rv => (
          <div key={rv.label} className="bento-prog-row">
            <span style={{ color: rv.c }}>{rv.label}</span>
            <div className="bento-prog-track">
              <div style={{ width: `${rv.pct}%`, background: rv.c, height: '100%', borderRadius: 2 }} />
            </div>
            <CheckCircle2 size={11} style={{ color: rv.c }} />
          </div>
        ))}
        <div className="bento-prog-time">
          <Clock size={12} style={{ color: 'rgba(255,255,255,0.35)' }} />
          <span>2 min 43 sec</span>
        </div>
      </div>
    );
  }

  if (type === 'reviewers') {
    return (
      <div className="bento-preview bento-rvs">
        {[
          { s: 'α', c: '#10b981', role: '原创性 & 理论贡献' },
          { s: 'β', c: '#8b5cf6', role: '方法论 & 技术严谨性' },
          { s: 'γ', c: '#f59e0b', role: '清晰度 & 影响力' },
          { s: 'Σ', c: '#3b82f6', role: 'Meta-Review 合成', meta: true },
        ].map(rv => (
          <div key={rv.s} className={`bento-rv-chip${rv.meta ? ' bento-rv-meta' : ''}`} style={{ borderColor: `${rv.c}30` }}>
            <div className="bento-rv-av" style={{ background: rv.c }}>{rv.s}</div>
            <span>{rv.role}</span>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'export') {
    return (
      <div className="bento-preview bento-export">
        {[
          { fmt: 'DOCX', c: '#3b82f6', icon: '📄' },
          { fmt: 'PDF',  c: '#ef4444', icon: '📕' },
        ].map(f => (
          <div key={f.fmt} className="bento-export-btn" style={{ borderColor: `${f.c}40`, background: `${f.c}0d` }}>
            <span>{f.icon}</span>
            <span style={{ color: f.c }}>{f.fmt}</span>
            <Download size={12} style={{ color: f.c, marginLeft: 'auto' }} />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'upload') {
    return (
      <div className="bento-preview bento-upload">
        {['PDF', 'DOCX', 'TXT'].map((f, i) => (
          <div key={f} className="bento-upload-pill" style={{ animationDelay: `${i * 0.15}s` }}>
            {f}
          </div>
        ))}
      </div>
    );
  }

  if (type === 'reproduce') {
    return (
      <div className="bento-preview bento-repro">
        {[
          { item: '数据可用性声明', ok: true },
          { item: '代码开源链接', ok: true },
          { item: '实验细节完整度', ok: false },
          { item: '预处理管线说明', ok: false },
        ].map(r => (
          <div key={r.item} className="bento-repro-row">
            <div className={`bento-repro-icon ${r.ok ? 'ok' : 'warn'}`}>
              {r.ok ? <CheckCircle2 size={12} /> : <span>!</span>}
            </div>
            <span style={{ color: r.ok ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.9)' }}>{r.item}</span>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

/** One bento card */
function BentoCard({ card, index }) {
  return (
    <motion.div
      className={`pr-bento-card pr-bento-${card.size} pr-bento-${card.id}`}
      style={{ '--card-accent': card.accent }}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.25 } }}
    >
      <div className="pr-bento-inner">
        <div className="pr-bento-header">
          <div className="pr-bento-icon" style={{ background: `${card.accent}18`, color: card.accent }}>
            {card.icon}
          </div>
          <span className="pr-bento-eyebrow" style={{ color: card.accent }}>{card.label}</span>
        </div>
        <h3 className="pr-bento-title">{card.title}</h3>
        <p className="pr-bento-desc">{card.desc}</p>
        <div className="pr-bento-preview-wrap">
          <BentoPreview type={card.preview} accent={card.accent} />
        </div>
      </div>
      <div className="pr-bento-glow" />
    </motion.div>
  );
}

/** Step item */
function StepItem({ num, title, desc, delay }) {
  return (
    <motion.div
      className="pr-step"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      <div className="pr-step-num">{num}</div>
      <div className="pr-step-connector" />
      <div className="pr-step-body">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
   Main page
───────────────────────────────────────────── */
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

      {/* Hero is full-bleed, outside feat-main */}
      <section className="pr-hero">
        <MeshBackground />

        <div className="pr-hero-container">

            {/* Top eyebrow */}
            <motion.div className="pr-eyebrow-row"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <span className="pr-eyebrow-pill">
                <Sparkles size={12} />
                AI-POWERED PEER REVIEW
              </span>
              <LiveCounter />
            </motion.div>

            {/* Two-column layout */}
            <div className="pr-hero-cols">

              {/* Left: copy */}
              <div className="pr-hero-copy">
                <motion.h1
                  initial={{ opacity: 0, y: 28 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                >
                  投稿前，先让<br />
                  <span className="pr-headline-gradient">AI 审稿人</span><br />
                  帮你把好关
                </motion.h1>

                <motion.p className="pr-hero-lead"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, delay: 0.2 }}
                >
                  系统先检索相关文献、评估领域空白，再由三位专注不同视角的 AI 审稿人
                  <strong>并行独立</strong>评审——最后由 Meta-Reviewer 合成共识报告，
                  覆盖<strong>原创性、方法论、清晰度、重要性、可复现性</strong>五大维度，
                  {'<'} 3 分钟交付期刊级结构化审稿报告。
                </motion.p>

                {/* Trust chips */}
                <motion.div className="pr-hero-chips"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.3 }}
                >
                  {[
                    'Critical / Major / Minor 分级',
                    '五维雷达图',
                    '具体修改建议',
                    'Word / PDF 导出',
                  ].map(t => (
                    <span key={t} className="pr-trust-chip">
                      <CheckCircle2 size={11} />
                      {t}
                    </span>
                  ))}
                </motion.div>

                {/* CTAs */}
                <motion.div className="pr-hero-ctas"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.38 }}
                >
                  <button className="pr-cta-primary" onClick={() => navigate('/peer-review')}>
                    立即免费审稿
                    <ArrowRight size={16} />
                  </button>
                  <a className="pr-cta-ghost" href="#pr-demo">
                    查看演示报告
                    <ChevronDown size={15} />
                  </a>
                </motion.div>

                {/* Journal ticker */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6, duration: 0.6 }}
                >
                  <p className="pr-ticker-label">适用于投稿至以下期刊与会议</p>
                  <JournalTicker />
                </motion.div>
              </div>

              {/* Right: report thumbnail + CTA */}
              <div className="pr-hero-visual">
                <HeroPreview onCTA={() => navigate('/peer-review')} />
              </div>
            </div>
          </div>

          <div className="pr-hero-bottom-fade" />
      </section>

      <main className="feat-main pr-main">

        {/* ══════════════════════════════════════════
            PIPELINE FLOW DIAGRAM
        ══════════════════════════════════════════ */}
        <section id="pr-pipeline" className="pr-pipeline-section">
          <div className="pr-section-inner">
            <motion.div className="pr-pipeline-header"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.45 }}
            >
              <span className="pr-section-eyebrow">审稿引擎</span>
              <h2 className="pr-pipeline-title">一篇论文，完整经历六个阶段</h2>
            </motion.div>

            <div className="pr-pipeline">
              {PIPELINE_STAGES.map((stage, i) => (
                <React.Fragment key={stage.id}>
                  <motion.div
                    className={`pr-pipe-node${stage.wide ? ' pr-pipe-wide' : ''}`}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-30px' }}
                    transition={{ duration: 0.4, delay: i * 0.07 }}
                  >
                    <div className="pr-pipe-icon" style={{ background: `${stage.color}18`, color: stage.color, borderColor: `${stage.color}30` }}>
                      {stage.icon}
                    </div>
                    <div className="pr-pipe-label">{stage.label}</div>
                    <div className="pr-pipe-detail">{stage.detail}</div>
                    {stage.wide && (
                      <div className="pr-pipe-reviewers">
                        {[
                          { s: 'α', c: '#10b981', t: '原创性' },
                          { s: 'β', c: '#8b5cf6', t: '方法论' },
                          { s: 'γ', c: '#f59e0b', t: '影响力' },
                        ].map(rv => (
                          <div key={rv.s} className="pr-pipe-rv" style={{ borderColor: `${rv.c}28` }}>
                            <div className="pr-pipe-rv-av" style={{ background: rv.c }}>{rv.s}</div>
                            <span style={{ color: rv.c }}>{rv.t}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <motion.div className="pr-pipe-arrow"
                      initial={{ opacity: 0, scaleX: 0 }}
                      whileInView={{ opacity: 1, scaleX: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: i * 0.07 + 0.25 }}
                    >
                      <ChevronRight size={18} />
                    </motion.div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Dimension pills */}
            <motion.div className="pr-dim-row"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              <span className="pr-dim-label">五大审稿维度</span>
              {[
                { name: '原创性', color: '#8b5cf6' },
                { name: '方法论', color: '#6366f1' },
                { name: '清晰度', color: '#ec4899' },
                { name: '重要性', color: '#f59e0b' },
                { name: '可复现性', color: '#10b981' },
              ].map(d => (
                <span key={d.name} className="pr-dim-pill" style={{ color: d.color, background: `${d.color}12`, borderColor: `${d.color}28` }}>
                  {d.name}
                </span>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            INTERACTIVE DEMO
        ══════════════════════════════════════════ */}
        <section id="pr-demo" className="pr-section pr-demo-section">
          <div className="pr-section-inner">
            <motion.div className="pr-section-header"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5 }}
            >
              <span className="pr-section-eyebrow">实时演示</span>
              <h2>体验完整的 AI 审稿报告</h2>
              <p>滚动进入后自动演示审稿流程。演示完成后可切换审稿人视角、展开详细评审意见，并导出真实格式文件。</p>
            </motion.div>
            <Suspense fallback={
              <div className="pr-demo-loader">
                <div className="pr-demo-spinner" />
                <span>加载演示中...</span>
              </div>
            }>
              <PeerReviewDemo />
            </Suspense>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            BENTO GRID — FEATURES
        ══════════════════════════════════════════ */}
        <section id="pr-features" className="pr-section">
          <div className="pr-section-inner">
            <motion.div className="pr-section-header"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5 }}
            >
              <span className="pr-section-eyebrow">核心功能</span>
              <h2>你想要的，全都在</h2>
            </motion.div>
            <div className="pr-bento-grid">
              {BENTO.map((card, i) => (
                <BentoCard key={card.id} card={card} index={i} />
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            HOW IT WORKS — PIPELINE
        ══════════════════════════════════════════ */}
        <section className="pr-section pr-steps-section">
          <div className="pr-section-inner">
            <motion.div className="pr-section-header"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5 }}
            >
              <span className="pr-section-eyebrow">审稿引擎</span>
              <h2>不是简单问 AI，是真正的审稿流程</h2>
              <p>每次审稿都完整执行一套多阶段学术流水线，和顶刊同行评审的流程一脉相承。</p>
            </motion.div>

            <div className="pr-steps">
              <StepItem
                num="01"
                title="稿件解析 · 提取结构化元信息"
                desc="自动识别标题、作者、摘要、研究领域与关键词，无需手动填写。支持 PDF、Word、TXT 及直接粘贴，最大支持 50 页完整论文。"
                delay={0}
              />
              <StepItem
                num="02"
                title="文献预处理 · 构建领域上下文"
                desc="基于论文关键词与摘要，系统向 Semantic Scholar 发起学术检索，AI 筛选相关文献，总结领域前沿状态，识别最相似已发表论文和常见研究空白——为审稿人提供可核查的对标参照。"
                delay={0.1}
              />
              <StepItem
                num="03"
                title="三路并行独立审稿"
                desc="Reviewer α（原创性 & 理论贡献）、Reviewer β（方法论 & 技术严谨性）、Reviewer γ（清晰度 & 影响力）使用不同 AI 模型同步运行，每人独立产出结构化 JSON 报告，互不干扰。"
                delay={0.2}
              />
              <StepItem
                num="04"
                title="Meta-Reviewer · 合成共识，解决分歧"
                desc="第四位 Meta-Reviewer 读取三份独立报告，合并一致意见、平衡分歧观点，输出最终 Accept / Minor Revision / Major Revision / Reject 结论及完整审稿报告。"
                delay={0.3}
              />
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            PRIVACY & DATA SECURITY
        ══════════════════════════════════════════ */}
        <section id="pr-security" className="pr-section pr-security-section">
          <div className="pr-section-inner">
            <motion.div className="pr-section-header"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5 }}
            >
              <span className="pr-section-eyebrow">安全保障</span>
              <h2>数据安全与隐私保护</h2>
              <p>你的论文是你最重要的学术资产。我们用最高标准守护它。</p>
            </motion.div>

            <div className="pr-security-grid">
              {[
                {
                  icon: <ShieldCheck size={24} />,
                  title: '端到端加密传输',
                  desc: '论文上传和审稿过程全程使用 TLS 加密，数据传输安全有保障',
                  color: '#8b5cf6',
                },
                {
                  icon: <BrainCircuit size={24} />,
                  title: '不用于模型训练',
                  desc: '您的论文内容不会被用于训练 AI 模型，我们绝不滥用您的学术成果',
                  color: '#10b981',
                },
                {
                  icon: <EyeOff size={24} />,
                  title: '隐私审稿模式',
                  desc: '开启隐私模式后，审稿报告在下载后 24 小时内自动删除，不留痕迹',
                  color: '#f59e0b',
                },
                {
                  icon: <FileCheck size={24} />,
                  title: '合规数据管理',
                  desc: '严格遵守数据保护法规，定期安全审计，企业级数据隔离',
                  color: '#3b82f6',
                },
              ].map((card, i) => (
                <motion.div
                  key={card.title}
                  className="pr-security-card"
                  style={{ '--sec-accent': card.color }}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="pr-security-icon" style={{ background: `${card.color}15`, color: card.color }}>
                    {card.icon}
                  </div>
                  <h3 className="pr-security-title">{card.title}</h3>
                  <p className="pr-security-desc">{card.desc}</p>
                </motion.div>
              ))}
            </div>

            {/* Privacy mode highlight */}
            <motion.div
              className="pr-privacy-highlight"
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.55, delay: 0.2 }}
            >
              <div className="pr-privacy-highlight-inner">
                <div className="pr-privacy-highlight-header">
                  <div className="pr-privacy-highlight-icon">
                    <Lock size={22} />
                  </div>
                  <div>
                    <h3 className="pr-privacy-highlight-title">隐私模式 —— 让你的未发表论文高枕无忧</h3>
                    <p className="pr-privacy-highlight-desc">
                      担心论文泄露？开启隐私模式，AI 审稿完成后立即下载报告。您的稿件数据将在 24 小时内从服务器彻底删除，历史记录中也不会保留任何痕迹。
                    </p>
                  </div>
                </div>

                <div className="pr-privacy-flow">
                  {[
                    { icon: <Lock size={16} />, label: '上传' },
                    { icon: <Sparkles size={16} />, label: 'AI审稿' },
                    { icon: <Download size={16} />, label: '下载报告' },
                    { icon: <Shield size={16} />, label: '自动删除' },
                  ].map((step, i) => (
                    <React.Fragment key={step.label}>
                      <motion.div
                        className="pr-privacy-flow-step"
                        initial={{ opacity: 0, scale: 0.85 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.35, delay: 0.3 + i * 0.1 }}
                      >
                        <div className="pr-privacy-flow-icon">{step.icon}</div>
                        <span className="pr-privacy-flow-label">{step.label}</span>
                      </motion.div>
                      {i < 3 && <div className="pr-privacy-flow-arrow"><ChevronRight size={14} /></div>}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div className="pr-privacy-highlight-glow" />
            </motion.div>
          </div>
        </section>

        {/* ══════════════════════════════════════════
            FAQ
        ══════════════════════════════════════════ */}
        <section id="pr-faq" className="pr-section">
          <div className="pr-section-inner">
            <motion.div className="pr-section-header"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5 }}
            >
              <span className="pr-section-eyebrow">常见问题</span>
              <h2>你可能想知道的</h2>
            </motion.div>
            <FeatureFAQ items={FAQ_ITEMS} />
          </div>
        </section>

        {/* ══════════════════════════════════════════
            CTA
        ══════════════════════════════════════════ */}
        <FeatureCTA
          title="投稿前，先让 AI 替你把关"
          desc="上传论文，3 分钟内获取期刊级审稿报告。发现潜在问题，提高投稿通过率。"
          ctaText="立即免费审稿"
          ctaTo="/peer-review"
          accentColor={ACCENT}
        />

      </main>
      <FeatureJumpNav sections={JUMP_SECTIONS} accentColor={ACCENT} />
    </div>
  );
}
