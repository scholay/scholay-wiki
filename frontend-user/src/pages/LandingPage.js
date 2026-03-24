/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * LandingPage — Marketing landing page with animated feature demos
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Languages, BarChart3, BookOpen,
  MessageSquare, FileCheck2, Check, ChevronDown, ArrowRight,
  Sparkles, Shield, Zap, GraduationCap, FlaskConical, Building2,
  UserPlus, Target, Upload, TrendingUp, Star
} from 'lucide-react';
import SEO from '../components/SEO';
import './styles/LandingPage.css';

/* ─── animation variants ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.25, 0.1, 0.25, 1] } },
};
const stagger = { visible: { transition: { staggerChildren: 0.09 } } };
const staggerSlow = { visible: { transition: { staggerChildren: 0.14 } } };

/* ─── data constants ─── */
const STATS = [
  { value: '200M+', label: '学术论文覆盖' },
  { value: '19', label: '学科领域' },
  { value: '7', label: 'AI 工具模块' },
  { value: '24/7', label: '全天候在线' },
];

const TRUST_USERS = [
  { initial: '陈', bg: 'linear-gradient(135deg, #667eea, #764ba2)' },
  { initial: '王', bg: 'linear-gradient(135deg, #f093fb, #f5576c)' },
  { initial: 'Z', bg: 'linear-gradient(135deg, #4facfe, #00f2fe)' },
  { initial: '李', bg: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
  { initial: '赵', bg: 'linear-gradient(135deg, #fa709a, #fee140)' },
];

const REVIEW_DATA_SETS = [
  {
    lang: 'en',
    badge: 'PEER REVIEW REPORT',
    round: '1st Review',
    manuscriptId: '#NMI-2025-0847-R1',
    journal: 'Nature Machine Intelligence',
    date: '2025-03-15',
    title: 'Multi-Modal Transformer for Cross-Lingual Academic Document Understanding and Generation',
    scores: [
      { label: 'Originality', score: 8, max: 10 },
      { label: 'Methodology', score: 7, max: 10 },
      { label: 'Significance', score: 8, max: 10 },
      { label: 'Presentation', score: 9, max: 10 },
      { label: 'References', score: 8, max: 10 },
    ],
    majorLabel: 'MAJOR ISSUES',
    majorIssues: [
      { ref: 'Section 4.2', text: 'The comparison with SOTA baselines is incomplete. Add BLEU/ROUGE metrics.' },
      { ref: 'Table 3', text: 'Statistical significance tests are missing for the key results.' },
    ],
    minorLabel: 'MINOR ISSUES',
    minorIssues: [
      { ref: 'Abstract L3', text: '"novel" is overused — use a more specific characterization.' },
      { ref: 'Fig. 5', text: 'Caption needs clarification; add legend for color coding.' },
    ],
    decision: 'Minor Revision',
    confidence: 'High',
    confidentialLabel: 'CONFIDENTIAL TO EDITOR',
    confidentialText: 'Solid work. Recommend acceptance after authors address baseline comparison.',
    journals: [
      { name: 'Nature Machine Intelligence', abbr: 'NMI', impact: '25.8', match: 94, color: '#6366f1' },
      { name: 'IEEE Trans. PAMI', abbr: 'TPAMI', impact: '23.6', match: 87, color: '#10b981' },
      { name: 'ACL Anthology', abbr: 'ACL', impact: '18.2', match: 79, color: '#f59e0b' },
    ],
  },
  {
    lang: 'zh',
    badge: '同行评审报告',
    round: '第 1 轮评审',
    manuscriptId: '#JCST-2025-1203',
    journal: '计算机学报',
    date: '2025-03-20',
    title: '基于多模态预训练模型的学术文献跨语言理解与生成研究',
    scores: [
      { label: '原创性', score: 9, max: 10 },
      { label: '技术可靠性', score: 7, max: 10 },
      { label: '重要性', score: 8, max: 10 },
      { label: '表述清晰度', score: 8, max: 10 },
      { label: '文献充分度', score: 7, max: 10 },
    ],
    majorLabel: '重大问题',
    majorIssues: [
      { ref: '第 4.2 节', text: '缺少与 SOTA 基线方法的定量对比，请补充 BLEU/ROUGE 指标。' },
      { ref: '表 3', text: '关键实验结果缺少统计显著性检验（如配对 t 检验）。' },
    ],
    minorLabel: '次要问题',
    minorIssues: [
      { ref: '摘要第 3 行', text: '"创新性" 表述过于泛化，建议更具体地描述核心贡献。' },
      { ref: '图 5', text: '图注需要说明所展示的模型变体，并添加颜色编码图例。' },
    ],
    decision: '修改后录用',
    confidence: '高',
    confidentialLabel: '给编辑的机密意见',
    confidentialText: '研究工作扎实，贡献明确。建议作者补充基线对比后录用。',
    journals: [
      { name: '计算机学报', abbr: 'CJC', impact: '5.2', match: 96, color: '#ef4444' },
      { name: '软件学报', abbr: 'JOS', impact: '4.8', match: 88, color: '#6366f1' },
      { name: '自动化学报', abbr: 'AAJ', impact: '4.1', match: 81, color: '#10b981' },
    ],
  },
];

const STEPS = [
  { icon: <UserPlus size={24} />, title: '注册账号', desc: '30 秒快速注册，支持邮箱、GitHub、微信等多种方式。' },
  { icon: <Sparkles size={24} />, title: '选择 AI 工具', desc: '根据需求选择文献检索、智能审稿、论文写作等 7 大工具。' },
  { icon: <Zap size={24} />, title: '获取智能结果', desc: 'AI 实时处理，秒级响应，获取专业级学术分析与建议。' },
];

const USERS = [
  { icon: <GraduationCap size={24} />, title: '高校学生', desc: '课题选题 · 论文写作 · 文献综述 · 投稿预审', color: '#10a37f' },
  { icon: <FlaskConical size={24} />, title: '科研人员', desc: '追踪前沿 · 发现高引论文 · 拓展研究思路', color: '#6366f1' },
  { icon: <BookOpen size={24} />, title: '学者教授', desc: '学术脉络 · 引用分析 · 审稿标准把控', color: '#f59e0b' },
  { icon: <Building2 size={24} />, title: '企业研发', desc: '技术调研 · 竞品分析 · 专利文献检索', color: '#ec4899' },
];

const TESTIMONIALS = [
  { text: '"智能审稿帮我在投稿前发现了方法论的重大漏洞，避免了一次 Reject。这个功能值回十倍会员费。"', name: '陈博士', title: '清华大学 · 计算机科学博士生' },
  { text: '"从文献检索到论文写作，再到投稿前的智能审稿，Scholay 覆盖了我整个科研流程。效率提升至少 3 倍。"', name: '王研究员', title: '中科院 · 生物信息学方向' },
  { text: '"LaTeX 写作加上 AI 辅助，英文论文的写作效率大幅提升。对于非英语母语的研究者来说，这是刚需工具。"', name: '张老师', title: '浙江大学 · 材料科学副教授' },
  { text: '"多维度表格分析功能让我的文献综述工作从 2 周缩短到 3 天，数据提取准确率非常高。"', name: '李同学', title: '北京大学 · 经济学硕士生' },
];

const FAQ_DATA = [
  { q: '什么是 Scholay？', a: 'Scholay 是一个 AI 驱动的一站式学术研究平台，提供智能文献检索、论文写作、智能审稿、文献翻译、多维度分析、期刊查询和智能助手共 7 大 AI 工具，覆盖科研全流程。' },
  { q: '智能审稿/模拟投稿是什么？', a: '智能审稿功能模拟顶级期刊的审稿流程，上传论文 PDF 后，AI 会从创新性、方法论、写作质量、文献充分度、实验设计等多个维度进行评估，生成详细的审稿报告和逐段修改建议，帮助您在正式投稿前完善论文。' },
  { q: '平台的数据来自哪里？', a: '学术数据来源于互联网公开数据，覆盖计算机科学、生物医学、物理学、化学等 19 个学科领域的 2 亿+篇学术论文，数据持续更新。' },
  { q: 'Scholay 是免费的吗？', a: '提供免费基础功能，包括学术检索、论文详情查看等。智能审稿、AI 论文写作等高级功能需要订阅会员，提供多种灵活套餐。' },
  { q: '支持哪些文件格式？', a: '智能审稿支持 PDF 上传；论文写作支持 LaTeX 格式导入导出；文献翻译支持 PDF、Word 等常见学术文档格式。' },
  { q: '我的论文数据安全吗？', a: '平台采用企业级加密传输和存储方案，所有上传的论文仅用于当次分析，不会被存储或用于训练。我们严格遵守用户隐私保护条款。' },
];

const REVIEW_COMMENTS_STAR = [
  { type: 'warning', text: 'Section 4.2: 需补充与 SOTA 方法的定量对比分析。' },
  { type: 'suggestion', text: 'Abstract: 建议更具体地描述核心贡献，避免泛化表述。' },
  { type: 'info', text: '文献综述较全面，建议补充 2024–2025 年最新进展。' },
  { type: 'positive', text: '方法论推导严谨，数学证明完整，实验设计合理。' },
];

/* ═══════════════════════════════════════════
   ANIMATED MOCK DEMO COMPONENTS
   ═══════════════════════════════════════════ */

/* ─── Search Demo ─── */
function SearchDemo() {
  return (
    <div className="demo-search">
      <div className="demo-search-bar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <span className="demo-typing-text">深度学习 医学影像诊断</span>
        <span className="demo-cursor" />
      </div>
      <div className="demo-search-results">
        {[
          { title: 'Deep Learning in Medical Image Diagnosis: A Survey', cite: '2,847', year: '2024', oa: true },
          { title: 'Transformer-based Models for Radiology Report Generation', cite: '1,523', year: '2024', oa: false },
          { title: 'Self-supervised Learning for Medical Image Analysis', cite: '986', year: '2023', oa: true },
        ].map((p, i) => (
          <div key={i} className="demo-result" style={{ animationDelay: `${0.8 + i * 0.4}s` }}>
            <div className="demo-result-title">{p.title}</div>
            <div className="demo-result-meta">
              <span className="demo-cite-count">📄 {p.cite}</span>
              <span className="demo-year">{p.year}</span>
              {p.oa && <span className="demo-oa-badge">Open Access</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Writer Demo (LaTeX editor) ─── */
function WriterDemo() {
  return (
    <div className="demo-writer">
      <div className="demo-writer-tabs">
        <span className="demo-tab active">main.tex</span>
        <span className="demo-tab">refs.bib</span>
      </div>
      <div className="demo-writer-body">
        <div className="demo-writer-code">
          <div className="demo-code-line"><span className="hl-cmd">\\documentclass</span>{'{article}'}</div>
          <div className="demo-code-line"><span className="hl-cmd">\\title</span>{'{Multi-Modal Transformer}'}</div>
          <div className="demo-code-line"><span className="hl-cmd">\\begin</span>{'{abstract}'}</div>
          <div className="demo-code-line demo-code-typing">We propose a novel architecture<span className="demo-cursor" /></div>
          <div className="demo-code-line"><span className="hl-cmd">\\end</span>{'{abstract}'}</div>
        </div>
        <div className="demo-writer-preview">
          <div className="demo-preview-h">Multi-Modal Transformer</div>
          <div className="demo-preview-label">Abstract</div>
          <div className="demo-preview-p">We propose a novel architecture that leverages cross-attention...</div>
        </div>
      </div>
      <div className="demo-ai-tooltip">
        <Sparkles size={12} />
        <span>AI: 建议将 "novel" 改为 "state-of-the-art" 以增强表述</span>
      </div>
    </div>
  );
}

/* ─── Translation Demo ─── */
function TranslateDemo() {
  return (
    <div className="demo-translate">
      <div className="demo-translate-panel demo-translate-src">
        <div className="demo-lang-tag">中文 (源文)</div>
        <div className="demo-translate-content">
          <span className="demo-hl demo-hl-1">深度学习</span>技术在
          <span className="demo-hl demo-hl-2">计算机视觉</span>领域取得了
          <span className="demo-hl demo-hl-3">突破性进展</span>，
          尤其是在<span className="demo-hl demo-hl-4">医学影像</span>分析方面。
        </div>
      </div>
      <div className="demo-translate-arrow">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </div>
      <div className="demo-translate-panel demo-translate-tgt">
        <div className="demo-lang-tag">English (译文)</div>
        <div className="demo-translate-content">
          <span className="demo-hl demo-hl-1">Deep learning</span> technology has achieved
          <span className="demo-hl demo-hl-3">breakthrough progress</span> in the field of
          <span className="demo-hl demo-hl-2">computer vision</span>,
          especially in <span className="demo-hl demo-hl-4">medical imaging</span> analysis.
        </div>
      </div>
    </div>
  );
}

/* ─── Table Analysis Demo ─── */
function TableDemo() {
  const rows = [
    { author: 'Zhang et al.', year: '2024', cite: 92, method: 'Transformer', acc: '96.3%' },
    { author: 'Li et al.', year: '2024', cite: 78, method: 'ResNet-152', acc: '94.1%' },
    { author: 'Wang et al.', year: '2023', cite: 65, method: 'GAN + CNN', acc: '93.7%' },
    { author: 'Chen et al.', year: '2023', cite: 51, method: 'BERT-Med', acc: '91.2%' },
  ];
  return (
    <div className="demo-table">
      <div className="demo-table-header">
        <span>作者</span><span>年份</span><span>引用</span><span>方法</span><span>准确率</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="demo-table-row" style={{ animationDelay: `${0.3 + i * 0.2}s` }}>
          <span className="demo-table-author">{r.author}</span>
          <span>{r.year}</span>
          <span className="demo-table-cite">
            <div className="demo-bar-track"><div className="demo-bar-fill" style={{ width: `${r.cite}%`, animationDelay: `${0.5 + i * 0.2}s` }} /></div>
          </span>
          <span className="demo-table-method">{r.method}</span>
          <span className="demo-table-acc">{r.acc}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Journal Match Demo ─── */
function JournalDemo() {
  const journals = [
    { name: 'Nature Machine Intelligence', abbr: 'NMI', impact: '28.4', match: 94, time: '45天', color: '#6366f1' },
    { name: 'IEEE Trans. PAMI', abbr: 'TPAMI', impact: '23.6', match: 87, time: '90天', color: '#10a37f' },
    { name: 'Medical Image Analysis', abbr: 'MedIA', impact: '13.8', match: 81, time: '60天', color: '#f59e0b' },
  ];
  return (
    <div className="demo-journal">
      {journals.map((j, i) => (
        <div key={i} className="demo-journal-card" style={{ animationDelay: `${0.3 + i * 0.25}s` }}>
          <div className="demo-journal-top">
            <div className="demo-journal-avatar" style={{ background: `${j.color}22`, color: j.color }}>{j.abbr[0]}</div>
            <div className="demo-journal-info">
              <div className="demo-journal-name">{j.name}</div>
              <div className="demo-journal-stats">IF: {j.impact} · 审稿周期: {j.time}</div>
            </div>
          </div>
          <div className="demo-match-row">
            <span className="demo-match-label">匹配度</span>
            <div className="demo-match-track"><div className="demo-match-fill" style={{ width: `${j.match}%`, background: j.color, animationDelay: `${0.6 + i * 0.25}s` }} /></div>
            <span className="demo-match-val" style={{ color: j.color }}>{j.match}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Chat Demo ─── */
function ChatDemo() {
  return (
    <div className="demo-chat">
      <div className="demo-chat-msg demo-msg-user" style={{ animationDelay: '0.3s' }}>
        <div className="demo-msg-avatar demo-avatar-user">You</div>
        <div className="demo-msg-bubble">如何设计双盲随机对照实验？请给出具体步骤。</div>
      </div>
      <div className="demo-chat-msg demo-msg-ai" style={{ animationDelay: '1.2s' }}>
        <div className="demo-msg-avatar demo-avatar-ai">AI</div>
        <div className="demo-msg-bubble">
          <p>双盲随机对照实验(Double-blind RCT)的设计步骤：</p>
          <p><strong>1. 确定研究假设</strong> — 明确自变量与因变量</p>
          <p><strong>2. 随机分组</strong> — 使用随机数表或计算机分配</p>
          <p><strong>3. 双盲处理</strong> — 受试者和研究者均不知分组</p>
        </div>
      </div>
      <div className="demo-chat-typing" style={{ animationDelay: '2.2s' }}>
        <div className="demo-msg-avatar demo-avatar-ai">AI</div>
        <div className="demo-typing-dots"><span /><span /><span /></div>
      </div>
    </div>
  );
}

/* ─── Mock Review Report (streaming animation + dual language + journal recs) ─── */
const STREAM_PHASES = { HEADER: 0, SCORES: 1, MAJOR: 2, MINOR: 3, DECISION: 4, CONFIDENTIAL: 5, JOURNALS: 6 };
const PHASE_DELAYS = [0, 600, 1800, 3000, 4000, 4600, 5200];
const CYCLE_MS = 13000;

function MockReviewReport() {
  const [dataIdx, setDataIdx] = useState(0);
  const [phase, setPhase] = useState(-1);
  const timers = useRef([]);

  const startStream = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase(-1);
    PHASE_DELAYS.forEach((delay, i) => {
      timers.current.push(setTimeout(() => setPhase(i), delay));
    });
  }, []);

  useEffect(() => {
    startStream();
    const cycle = setInterval(() => {
      setDataIdx(prev => (prev + 1) % REVIEW_DATA_SETS.length);
    }, CYCLE_MS);
    return () => { timers.current.forEach(clearTimeout); clearInterval(cycle); };
  }, [startStream]);

  useEffect(() => { startStream(); }, [dataIdx, startStream]);

  const d = REVIEW_DATA_SETS[dataIdx];
  const show = (p) => phase >= p;

  return (
    <div className="mr-hero-wrapper">
      {/* Main report — fixed height */}
      <motion.div className="mock-report" key={dataIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
        <div className="mock-report-scroll">
          {/* Header */}
          <div className={`mr-header mr-fade ${show(STREAM_PHASES.HEADER) ? 'mr-on' : ''}`}>
            <div className="mr-header-top">
              <span className="mr-badge">{d.badge}</span>
              <span className="mr-round">{d.round}</span>
            </div>
            <div className="mr-manuscript-id">Manuscript {d.manuscriptId}</div>
            <div className="mr-meta-row">
              <span>Journal: <strong>{d.journal}</strong></span>
              <span>Date: {d.date}</span>
            </div>
            <div className="mr-paper-title">{d.title}</div>
          </div>

          {/* Scores */}
          <div className={`mr-section mr-fade ${show(STREAM_PHASES.SCORES) ? 'mr-on' : ''}`}>
            <div className="mr-section-label">EVALUATION SCORES</div>
            <div className="mr-scores">
              {d.scores.map((s, i) => (
                <div key={i} className="mr-score-row">
                  <span className="mr-score-dim">{s.label}</span>
                  <div className="mr-score-bar-track">
                    <div className="mr-score-bar-fill" style={{ width: show(STREAM_PHASES.SCORES) ? `${(s.score / s.max) * 100}%` : '0%', transitionDelay: `${i * 0.1}s` }} />
                  </div>
                  <span className="mr-score-val">{s.score}/{s.max}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Major issues */}
          <div className={`mr-section mr-fade ${show(STREAM_PHASES.MAJOR) ? 'mr-on' : ''}`}>
            <div className="mr-section-label mr-label-major">{d.majorLabel} ({d.majorIssues.length})</div>
            <ol className="mr-issues">
              {d.majorIssues.map((issue, i) => (
                <li key={i}>
                  <span className="mr-issue-ref">{issue.ref}</span>
                  <span className="mr-issue-text">{issue.text}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Minor issues */}
          <div className={`mr-section mr-fade ${show(STREAM_PHASES.MINOR) ? 'mr-on' : ''}`}>
            <div className="mr-section-label mr-label-minor">{d.minorLabel} ({d.minorIssues.length})</div>
            <ol className="mr-issues mr-issues-minor">
              {d.minorIssues.map((issue, i) => (
                <li key={i}>
                  <span className="mr-issue-ref">{issue.ref}</span>
                  <span className="mr-issue-text">{issue.text}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Decision */}
          <div className={`mr-decision mr-fade ${show(STREAM_PHASES.DECISION) ? 'mr-on' : ''}`}>
            <div className="mr-decision-row">
              <span className="mr-decision-dot" />
              <span className="mr-decision-text">{d.decision}</span>
            </div>
            <span className="mr-confidence">Confidence: <strong>{d.confidence}</strong></span>
          </div>

          {/* Confidential */}
          <div className={`mr-confidential mr-fade ${show(STREAM_PHASES.CONFIDENTIAL) ? 'mr-on' : ''}`}>
            <span className="mr-confidential-label">{d.confidentialLabel}</span>
            <span className="mr-confidential-text">{d.confidentialText}</span>
          </div>
        </div>

        {/* Language indicator */}
        <div className="mr-lang-switch">
          {REVIEW_DATA_SETS.map((_, i) => (
            <span key={i} className={`mr-lang-dot ${i === dataIdx ? 'active' : ''}`} />
          ))}
        </div>
        <div className="mock-report-glow" />
      </motion.div>

      {/* Floating Journal Recommendations — outside report, to the right */}
      <div className={`mr-float-journals ${show(STREAM_PHASES.JOURNALS) ? 'mr-float-on' : ''}`} key={`j-${dataIdx}`}>
        <div className="mr-float-journals-inner">
          <div className="mr-journals-header">
            <Star size={12} />
            <span>{d.lang === 'zh' ? '推荐目标期刊' : 'RECOMMENDED JOURNALS'}</span>
          </div>
          <div className="mr-journals-list">
            {d.journals.map((j, i) => (
              <div key={i} className="mr-journal-card" style={{ transitionDelay: `${0.1 + i * 0.12}s` }}>
                <div className="mr-journal-left">
                  <div className="mr-journal-badge" style={{ background: `${j.color}18`, color: j.color, borderColor: `${j.color}40` }}>{j.abbr}</div>
                  <div className="mr-journal-info">
                    <span className="mr-journal-name">{j.name}</span>
                    <span className="mr-journal-if">IF {j.impact}</span>
                  </div>
                </div>
                <div className="mr-journal-match">
                  <div className="mr-journal-match-bar">
                    <div className="mr-journal-match-fill" style={{ width: show(STREAM_PHASES.JOURNALS) ? `${j.match}%` : '0%', background: j.color, transitionDelay: `${0.3 + i * 0.12}s` }} />
                  </div>
                  <span className="mr-journal-match-val" style={{ color: j.color }}>{j.match}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   MAIN LANDING PAGE
   ═══════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate();
  const [expandedFaq, setExpandedFaq] = useState(null);
  const toolsRef = useRef(null);

  const scrollToTools = () => toolsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="landing-page">
      <SEO
        title="Scholay - AI 驱动的一站式学术研究平台 | 智能文献检索 · 论文写作 · 智能审稿"
        description="Scholay 提供 7 大 AI 工具覆盖科研全流程：智能文献检索、论文写作、智能审稿/模拟投稿、文献翻译、多维度分析、期刊查询、智能助手。覆盖 2 亿+学术论文，19 个学科领域。"
        keywords="学术搜索,AI审稿,模拟投稿,论文写作,文献检索,智能审稿,LaTeX编辑器,学术AI工具,期刊查询,文献翻译"
        canonical="/"
      />

      {/* ─── Background ─── */}
      <div className="landing-bg">
        <div className="landing-bg-grid" />
        <div className="landing-bg-glow landing-bg-glow-1" />
        <div className="landing-bg-glow landing-bg-glow-2" />
        <div className="landing-bg-glow landing-bg-glow-3" />
      </div>

      {/* ─── Navigation ─── */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <svg width="24" height="28" viewBox="0 0 771 900" fill="none"><path d="M729.812 648.5H42.1885L386 53L729.812 648.5Z" stroke="white" strokeWidth="53"/><path d="M729.812 251.5H42.1885L386 847L729.812 251.5Z" stroke="white" strokeWidth="53"/></svg>
            <span>Scholay</span>
          </div>
          <div className="landing-nav-links">
            <button onClick={scrollToTools}>产品功能</button>
            <button onClick={() => navigate('/about')}>关于</button>
          </div>
          <div className="landing-nav-actions">
            <button className="landing-nav-login" onClick={() => navigate('/search')}>登录</button>
            <button className="landing-nav-cta" onClick={() => navigate('/search')}>免费开始 <ArrowRight size={16} /></button>
          </div>
        </div>
      </nav>

      <main className="landing-main">
        {/* ═══ Hero — 以智能审稿为核心的首屏 ═══ */}
        <motion.section className="landing-hero landing-hero-split" initial="hidden" animate="visible" variants={stagger}>
          <div className="landing-hero-left">
            <motion.div className="landing-hero-pill" variants={fadeUp}><FileCheck2 size={14} /> AI-POWERED PEER REVIEW · 核心功能</motion.div>
            <motion.h1 className="landing-hero-title" variants={fadeUp}>
              投稿前<br /><span className="landing-hero-gradient">最后一道保险</span>
            </motion.h1>
            <motion.p className="landing-hero-sub" variants={fadeUp}>
              上传论文 PDF，即刻获得审稿人视角的深度反馈——创新性、方法论、写作质量五维度评分 + 逐段修改建议 + 期刊推荐，帮你在正式投稿前发现问题。
            </motion.p>
            <motion.div className="landing-hero-highlights" variants={fadeUp}>
              {[
                { icon: <Upload size={16} />, text: '上传即审，秒级出报告' },
                { icon: <BarChart3 size={16} />, text: '5 维度评分 + 详细评分报告' },
                { icon: <Target size={16} />, text: '逐段精准修改建议' },
                { icon: <Shield size={16} />, text: '可指定目标期刊标准评审' },
              ].map((h, i) => (
                <div key={i} className="hero-highlight-item">
                  <span className="hero-highlight-icon">{h.icon}</span>
                  <span>{h.text}</span>
                </div>
              ))}
            </motion.div>
            <motion.div className="landing-hero-actions" variants={fadeUp}>
              <button className="landing-btn-primary landing-btn-lg" onClick={() => navigate('/peer-review')}>立即体验智能审稿 <ArrowRight size={18} /></button>
              <button className="landing-btn-secondary" onClick={scrollToTools}>了解全部 7 大功能</button>
            </motion.div>
            <motion.div className="landing-hero-trust" variants={fadeUp}>
              <div className="landing-trust-avatars">
                {TRUST_USERS.map((u, i) => <div key={i} className="landing-trust-avatar" style={{ background: u.bg }}>{u.initial}</div>)}
              </div>
              <span>已有 <strong>10,000+</strong> 研究者正在使用</span>
            </motion.div>
          </div>
          <motion.div className="landing-hero-right" variants={fadeUp}>
            <MockReviewReport />
          </motion.div>
        </motion.section>

        {/* ═══ Stats ═══ */}
        <motion.section className="landing-stats" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
          {STATS.map((s, i) => (
            <motion.div key={i} className="landing-stat" variants={fadeUp}><span className="landing-stat-value">{s.value}</span><span className="landing-stat-label">{s.label}</span></motion.div>
          ))}
        </motion.section>

        {/* ═══ Star Feature Expanded Details ═══ */}
        <section className="landing-star-section">
          <div className="landing-star-bg"><div className="landing-star-glow" /></div>
          <motion.div className="landing-star-header" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
            <motion.span className="landing-star-pill" variants={fadeUp}><TrendingUp size={14} /> 深入了解 · 智能审稿</motion.span>
            <motion.h2 className="landing-star-title" variants={fadeUp}>一次审稿，胜过无数次自检</motion.h2>
            <motion.p className="landing-star-subtitle" variants={fadeUp}>模拟顶级期刊的完整审稿流程，在正式投稿前精准定位每一个可改进的细节</motion.p>
          </motion.div>
          <div className="landing-star-content">
            <motion.div className="landing-star-left" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={staggerSlow}>
              {[
                { icon: <Upload size={20} />, t: '一键上传，即刻审稿', d: '支持 PDF 直接上传，AI 快速生成完整审稿报告 + 期刊推荐，无需漫长等待。' },
                { icon: <BarChart3 size={20} />, t: '五维度深度评分', d: '从创新性、方法论、写作质量、文献充分度、实验设计五个维度精准评估。' },
                { icon: <Target size={20} />, t: '逐段修改建议', d: '精确到段落级别的专业修改意见，指出每个问题的具体位置和改进方向。' },
                { icon: <Shield size={20} />, t: '期刊标准匹配', d: '可指定目标期刊，AI 按该期刊的审稿偏好和录用标准进行针对性评审。' },
              ].map((f, i) => (
                <motion.div key={i} className="landing-star-feature" variants={fadeUp}>
                  <div className="landing-star-feat-icon">{f.icon}</div>
                  <div><h4>{f.t}</h4><p>{f.d}</p></div>
                </motion.div>
              ))}
              <motion.div className="landing-star-cta" variants={fadeUp}>
                <button className="landing-btn-star" onClick={() => navigate('/peer-review')}>立即体验智能审稿 <ArrowRight size={18} /></button>
                <span className="landing-star-note">免费试用 · 无需绑定支付方式</span>
              </motion.div>
            </motion.div>
            <motion.div className="landing-star-right" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp}>
              <div className="star-detail-demo">
                <div className="star-detail-card">
                  <div className="star-detail-card-header"><FileCheck2 size={16} /> 审稿意见示例</div>
                  {REVIEW_COMMENTS_STAR.map((c, i) => (
                    <div key={i} className={`mock-comment mock-comment-${c.type}`} style={{ animationDelay: `${i * 0.2}s` }}><span className="mock-comment-dot" /><span>{c.text}</span></div>
                  ))}
                </div>
                <div className="star-detail-verdict">
                  <div className="mock-verdict-badge"><Shield size={14} /><span>评审结论</span></div>
                  <div className="mock-verdict-text">修改后接收 (Minor Revision)</div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═══ Feature Showcases (Primary 3) ═══ */}
        <section className="landing-showcases" ref={toolsRef}>
          <motion.div className="landing-section-header" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
            <span className="landing-section-eyebrow">全部功能</span>
            <h2 className="landing-section-title">7 大 AI 工具，覆盖科研全流程</h2>
            <p className="landing-section-desc">每一个工具都由最先进的大语言模型驱动，为您的学术研究提供全方位智能支持。</p>
          </motion.div>

          {/* Showcase 1: 智能文献检索 */}
          <motion.div className="landing-showcase" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
            <motion.div className="showcase-text" variants={fadeUp}>
              <span className="showcase-eyebrow" style={{ color: '#10a37f' }}>SMART SEARCH</span>
              <h3>智能文献检索</h3>
              <p>覆盖 2 亿+学术论文，支持直接检索和 AI 语义检索双模式。用自然语言描述你的研究问题，AI 理解意图后自动匹配最相关的文献。</p>
              <ul className="showcase-features">
                <li><Check size={16} style={{ color: '#10a37f' }} />关键词 + AI 语义双模式检索</li>
                <li><Check size={16} style={{ color: '#10a37f' }} />19 个学科领域全覆盖</li>
                <li><Check size={16} style={{ color: '#10a37f' }} />多维度高级筛选与排序</li>
              </ul>
              <button className="showcase-cta" style={{ color: '#10a37f' }} onClick={() => navigate('/search')}>开始搜索 <ArrowRight size={16} /></button>
            </motion.div>
            <motion.div className="showcase-visual" variants={fadeUp}><SearchDemo /></motion.div>
          </motion.div>

          {/* Showcase 2: 智能论文写作 */}
          <motion.div className="landing-showcase showcase-reversed" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
            <motion.div className="showcase-text" variants={fadeUp}>
              <span className="showcase-eyebrow" style={{ color: '#f59e0b' }}>AI WRITER</span>
              <h3>智能论文写作</h3>
              <p>ScholayPrism LaTeX 编辑器，内置 GPT 驱动的学术写作助手。从大纲生成到语法润色，从公式排版到参考文献管理，全程 AI 辅助。</p>
              <ul className="showcase-features">
                <li><Check size={16} style={{ color: '#f59e0b' }} />LaTeX 实时编辑与预览</li>
                <li><Check size={16} style={{ color: '#f59e0b' }} />AI 自动补全与语法润色</li>
                <li><Check size={16} style={{ color: '#f59e0b' }} />一键导出 PDF / Word</li>
              </ul>
              <button className="showcase-cta" style={{ color: '#f59e0b' }} onClick={() => navigate('/latex-writer')}>开始写作 <ArrowRight size={16} /></button>
            </motion.div>
            <motion.div className="showcase-visual" variants={fadeUp}><WriterDemo /></motion.div>
          </motion.div>

          {/* Showcase 3: 多维度表格分析 */}
          <motion.div className="landing-showcase" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={stagger}>
            <motion.div className="showcase-text" variants={fadeUp}>
              <span className="showcase-eyebrow" style={{ color: '#14b8a6' }}>DATA ANALYSIS</span>
              <h3>多维度表格分析</h3>
              <p>自动从多篇论文中提取核心数据，生成结构化对比表格。方法对比、实验结果整理、文献综述数据——一键搞定。</p>
              <ul className="showcase-features">
                <li><Check size={16} style={{ color: '#14b8a6' }} />自动提取论文核心数据</li>
                <li><Check size={16} style={{ color: '#14b8a6' }} />多论文交叉对比分析</li>
                <li><Check size={16} style={{ color: '#14b8a6' }} />导出为 Excel / LaTeX 表格</li>
              </ul>
              <button className="showcase-cta" style={{ color: '#14b8a6' }} onClick={() => navigate('/search-results')}>开始分析 <ArrowRight size={16} /></button>
            </motion.div>
            <motion.div className="showcase-visual" variants={fadeUp}><TableDemo /></motion.div>
          </motion.div>
        </section>

        {/* ═══ Secondary Tools Grid (with mini demos) ═══ */}
        <section className="landing-more-section">
          <motion.div className="landing-more-grid" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
            {/* 文献翻译 */}
            <motion.div className="landing-more-card" variants={fadeUp} onClick={() => navigate('/chat')}>
              <div className="more-card-demo"><TranslateDemo /></div>
              <div className="more-card-body">
                <div className="more-card-icon" style={{ background: 'rgba(236,72,153,0.12)', color: '#ec4899' }}><Languages size={20} /></div>
                <h3>文献翻译</h3>
                <p>学术级精准翻译，保留专业术语和公式格式，支持中英双向即时翻译。</p>
              </div>
            </motion.div>
            {/* 期刊查询 */}
            <motion.div className="landing-more-card" variants={fadeUp} onClick={() => navigate('/assistant')}>
              <div className="more-card-demo"><JournalDemo /></div>
              <div className="more-card-body">
                <div className="more-card-icon" style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316' }}><BookOpen size={20} /></div>
                <h3>期刊查询</h3>
                <p>智能匹配目标期刊，影响因子、审稿周期、录用率等关键指标一目了然。</p>
              </div>
            </motion.div>
            {/* 智能助手 */}
            <motion.div className="landing-more-card" variants={fadeUp} onClick={() => navigate('/chat')}>
              <div className="more-card-demo"><ChatDemo /></div>
              <div className="more-card-body">
                <div className="more-card-icon" style={{ background: 'rgba(6,182,212,0.12)', color: '#06b6d4' }}><MessageSquare size={20} /></div>
                <h3>智能助手</h3>
                <p>全能学术 AI 问答，研究方法、写作润色、数据解读，随问随答。</p>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* ═══ Steps ═══ */}
        <section className="landing-steps-section">
          <motion.div className="landing-section-header" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
            <span className="landing-section-eyebrow">使用流程</span>
            <h2 className="landing-section-title">三步开启 AI 科研之旅</h2>
          </motion.div>
          <motion.div className="landing-steps-grid" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
            {STEPS.map((step, i) => (
              <motion.div key={i} className="landing-step-card" variants={fadeUp}>
                <div className="landing-step-num">{i + 1}</div>
                {i < STEPS.length - 1 && <div className="landing-step-connector" />}
                <div className="landing-step-icon">{step.icon}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ═══ Users ═══ */}
        <section className="landing-users-section">
          <motion.div className="landing-section-header" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
            <span className="landing-section-eyebrow">适用人群</span>
            <h2 className="landing-section-title">为每一位学术研究者打造</h2>
          </motion.div>
          <motion.div className="landing-users-grid" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
            {USERS.map((u, i) => (
              <motion.div key={i} className="landing-user-card" variants={fadeUp}>
                <div className="landing-user-icon" style={{ color: u.color, background: `${u.color}18` }}>{u.icon}</div>
                <h3>{u.title}</h3><p>{u.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ═══ Testimonials ═══ */}
        <section className="landing-testimonials-section">
          <motion.div className="landing-section-header" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
            <span className="landing-section-eyebrow">用户评价</span>
            <h2 className="landing-section-title">来自研究者的真实反馈</h2>
          </motion.div>
          <motion.div className="landing-testimonials-grid" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
            {TESTIMONIALS.map((t, i) => (
              <motion.div key={i} className="landing-testimonial-card" variants={fadeUp}>
                <p className="landing-testimonial-text">{t.text}</p>
                <div className="landing-testimonial-author">
                  <div className="landing-testimonial-avatar">{t.name[0]}</div>
                  <div><span className="landing-testimonial-name">{t.name}</span><span className="landing-testimonial-title">{t.title}</span></div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ═══ FAQ ═══ */}
        <section className="landing-faq-section">
          <motion.div className="landing-section-header" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
            <span className="landing-section-eyebrow">常见问题</span>
            <h2 className="landing-section-title">有疑问？这里有答案</h2>
          </motion.div>
          <motion.div className="landing-faq-list" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
            {FAQ_DATA.map((faq, i) => (
              <motion.div key={i} className={`landing-faq-item ${expandedFaq === i ? 'expanded' : ''}`} variants={fadeUp}>
                <button className="landing-faq-question" onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}>
                  <span>{faq.q}</span><ChevronDown size={20} className="landing-faq-chevron" />
                </button>
                <div className="landing-faq-answer"><p>{faq.a}</p></div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* ═══ Final CTA ═══ */}
        <motion.section className="landing-final-cta" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={fadeUp}>
          <div className="landing-cta-glow" />
          <h2>开启你的 AI 科研之旅</h2>
          <p>免费注册即可使用基础功能，立即体验 AI 如何改变你的研究方式。</p>
          <div className="landing-cta-buttons">
            <button className="landing-btn-primary landing-btn-lg" onClick={() => navigate('/search')}>免费开始使用 <ArrowRight size={18} /></button>
            <button className="landing-btn-secondary" onClick={() => navigate('/peer-review')}>体验智能审稿</button>
          </div>
        </motion.section>
      </main>

      {/* ─── Footer ─── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-grid">
            <div className="landing-footer-brand">
              <div className="landing-footer-logo"><svg width="20" height="24" viewBox="0 0 771 900" fill="none"><path d="M729.812 648.5H42.1885L386 53L729.812 648.5Z" stroke="white" strokeWidth="53"/><path d="M729.812 251.5H42.1885L386 847L729.812 251.5Z" stroke="white" strokeWidth="53"/></svg><span>Scholay</span></div>
              <p>AI 驱动的一站式学术研究平台</p>
            </div>
            <div className="landing-footer-col"><h4>产品</h4><button onClick={() => navigate('/search')}>智能文献检索</button><button onClick={() => navigate('/peer-review')}>智能审稿</button><button onClick={() => navigate('/latex-writer')}>智能论文写作</button><button onClick={() => navigate('/chat')}>智能助手</button></div>
            <div className="landing-footer-col"><h4>资源</h4><button onClick={() => navigate('/blog')}>博客文章</button><button onClick={() => navigate('/resources')}>资源中心</button><button onClick={() => navigate('/help')}>帮助中心</button><button onClick={() => navigate('/about')}>关于我们</button></div>
            <div className="landing-footer-col"><h4>法律</h4><button onClick={() => navigate('/privacy')}>隐私政策</button><button onClick={() => navigate('/terms')}>服务条款</button><button onClick={() => navigate('/contact')}>联系我们</button><button onClick={() => navigate('/disclaimer')}>免责声明</button></div>
          </div>
          <div className="landing-footer-bottom"><p>&copy; {new Date().getFullYear()} Scholay · 成都恩特罐罐文化科技有限公司 · 让学术研究更高效</p></div>
        </div>
      </footer>
    </div>
  );
}
