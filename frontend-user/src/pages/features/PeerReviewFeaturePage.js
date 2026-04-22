/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * PeerReviewFeaturePage — Stripe/Vercel style redesign
 * Product-forward hero · alternating feature rows · window-chrome mockups
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, CheckCircle2, Sparkles, ChevronDown, ChevronRight,
  FileText, Shield, Users, Download, Cpu, Terminal,
  BookOpen, Lock, BrainCircuit, EyeOff, FileCheck, ShieldCheck,
  Search, Quote, FileDown, GitCompareArrows, AlertTriangle,
  AlertCircle, Info, X,
} from 'lucide-react';
import { FeatureNav, FeatureCTA, FeatureJumpNav, SEO } from './FeaturePageComponents';
import { DEMO_SCORES } from './peerReviewDemoData';
import './PeerReviewFeaturePage.css';

const ACCENT = '#8b5cf6';

const JUMP_SECTIONS = [
  { id: 'pr-engine', label: '审稿引擎' },
  { id: 'pr-literature', label: '文献对标' },
  { id: 'pr-report', label: '结构化报告' },
  { id: 'pr-security', label: '数据安全' },
  { id: 'pr-faq', label: '常见问题' },
];

const JOURNALS = [
  'Nature', 'Science', 'Cell', 'NEJM', 'The Lancet',
  'IEEE', 'ACM', 'NeurIPS', 'ICML', 'CVPR',
  'AAAI', 'ICLR', 'ECCV', 'KDD', 'WWW',
];

const FAQ_ITEMS = [
  {
    q: 'AI 审稿能替代正式的同行评审吗？',
    a: '不能，也没打算替代。我们的定位是"投稿前的自我检查工具" —— 在你把论文递给期刊之前，先帮你发现问题、提醒盲点、给出修改建议，让你以更好的状态进入正式同行评审。最终的学术判断仍然由期刊和人类评审做出。',
  },
  {
    q: '为什么是三位审稿人，而不是一位？',
    a: '三位审稿人各有分工：一位专注原创性与创新点，一位深挖方法论与实验严谨性，一位评估写作清晰度与影响力。三位使用不同的底层 AI 模型独立运行，避免单一模型的偏见，再由主编合成统一意见。这比"让一个 AI 多问几次"可靠得多，也更接近真正的期刊审稿团队。',
  },
  {
    q: '为什么要先做文献检索？',
    a: '审稿的第一关是"这个工作到底新不新"。如果审稿人不看领域文献就打分，那结论就是凭感觉。我们会先帮你的论文做一轮学术检索，找出领域内最相似的已发表工作，这样关于"新颖性"的每一条结论，背后都有可核查的文献依据。',
  },
  {
    q: '审稿报告里到底有什么？',
    a: '一份完整报告包括：五维度雷达评分（原创性/方法论/清晰度/重要性/可复现性）、按 严重 / 一般 / 轻微 分级的问题清单、每条问题附带的具体修改建议、三位审稿人的独立意见，以及主编给出的最终结论：接收 / 小修 / 大修 / 拒稿。',
  },
  {
    q: '支持哪些学科的论文？',
    a: '支持所有学科，包括自然科学、工程、医学、社会科学、人文艺术等。AI 会根据论文内容自动调整审稿侧重点，并从对应领域的学术数据库中检索参考文献。',
  },
  {
    q: '同一篇论文可以审几次？',
    a: '不限次数。修改后可以反复提交，每次都会生成一份新的独立报告 —— 非常适合在投稿前迭代打磨，跟踪每一轮修改到底有没有提升。',
  },
  {
    q: '我的论文数据安全吗？会被拿去训练 AI 吗？',
    a: '绝对不会。你的论文只用于当次审稿分析，全程 TLS 加密传输，不会进入任何 AI 模型的训练集。你可以随时删除上传的论文和审稿记录，也可以开启"隐私模式"让系统自动销毁。这是我们的技术红线，也写进了合同。',
  },
  {
    q: '什么是"隐私审稿模式"？什么情况下该用？',
    a: '隐私模式是为未发表稿件设计的额外保险：开启后，审稿完成并下载报告 24 小时内，你的论文原文、缓存、备份会从我们的服务器上全部自动删除，也不会出现在任何历史记录中 —— 我们自己也无法恢复。如果你担心论文被抢发，就开它。',
  },
];

/* ─────────────────────────────────────────────
   Helpers & primitives
───────────────────────────────────────────── */

function LiveCounter() {
  const [count, setCount] = useState(2847);
  useEffect(() => {
    const id = setInterval(() => {
      if (Math.random() > 0.7) setCount(c => c + Math.floor(Math.random() * 3) + 1);
    }, 3500);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="pr-live-inline">
      <span className="pr-live-dot" />
      <span>已审稿 <strong>{count.toLocaleString()}</strong> 篇</span>
    </span>
  );
}

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

/** Vercel-style browser window chrome */
function WindowChrome({ url, tabs, activeTab = 0, children, className = '', compact = false }) {
  return (
    <div className={`pr-window ${compact ? 'pr-window-compact' : ''} ${className}`}>
      <div className="pr-window-bar">
        <div className="pr-window-dots">
          <span />
          <span />
          <span />
        </div>
        {url && (
          <div className="pr-window-url">
            <Lock size={10} />
            <span>{url}</span>
          </div>
        )}
        <div className="pr-window-spacer" />
      </div>
      {tabs && (
        <div className="pr-window-tabs">
          {tabs.map((t, i) => (
            <div key={i} className={`pr-window-tab ${i === activeTab ? 'active' : ''}`}>
              {t.icon}
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="pr-window-body">{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup: Hero — Full Peer Review Report
───────────────────────────────────────────── */
function HeroReportMockup() {
  const dims = ['原创性', '方法论', '清晰度', '重要性', '可复现性'];
  const vals = [DEMO_SCORES.originality, DEMO_SCORES.methodology, DEMO_SCORES.clarity, DEMO_SCORES.significance, DEMO_SCORES.reproducibility];
  const cx = 60, cy = 60, r = 42, n = 5;
  const pt = (i, ratio) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * ratio * Math.cos(a), cy + r * ratio * Math.sin(a)];
  };
  const dataPath = vals.map((v, i) => pt(i, v / 100).join(',')).join(' ');

  return (
    <div className="pr-hero-mockup">
      <WindowChrome
        url="scholay.ai/peer-review/SCH-2025-0347"
        tabs={[
          { icon: <FileText size={12} />, label: '审稿报告' },
          { icon: <Users size={12} />, label: '审稿人视角' },
          { icon: <BookOpen size={12} />, label: '文献对标' },
        ]}
      >
        <div className="pr-hm-wrap">
          {/* Left — report summary */}
          <div className="pr-hm-main">
            <div className="pr-hm-head">
              <div>
                <div className="pr-hm-eyebrow">PEER REVIEW REPORT</div>
                <div className="pr-hm-title">A Vision Transformer Approach to Medical Image Segmentation</div>
              </div>
              <span className="pr-hm-badge pr-hm-badge-amber">Minor Revision</span>
            </div>

            <div className="pr-hm-stats">
              <div className="pr-hm-stat">
                <span className="pr-hm-stat-lbl">共识度</span>
                <span className="pr-hm-stat-val pr-hm-stat-green">78%</span>
              </div>
              <div className="pr-hm-stat">
                <span className="pr-hm-stat-lbl">用时</span>
                <span className="pr-hm-stat-val">2m 43s</span>
              </div>
              <div className="pr-hm-stat">
                <span className="pr-hm-stat-lbl">问题数</span>
                <span className="pr-hm-stat-val">
                  <span className="pr-hm-dot pr-hm-dot-red" />2
                  <span className="pr-hm-dot pr-hm-dot-amber" />4
                  <span className="pr-hm-dot pr-hm-dot-blue" />7
                </span>
              </div>
            </div>

            <div className="pr-hm-scores">
              <svg viewBox="0 0 120 120" width="120" height="120" className="pr-hm-radar">
                {[0.25, 0.5, 0.75, 1].map((lv, li) => (
                  <polygon
                    key={li}
                    points={dims.map((_, i) => pt(i, lv).join(',')).join(' ')}
                    fill="none"
                    stroke={`rgba(139,92,246,${0.08 + li * 0.05})`}
                    strokeWidth="0.6"
                  />
                ))}
                {dims.map((_, i) => {
                  const [x2, y2] = pt(i, 1);
                  return <line key={i} x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(139,92,246,0.12)" strokeWidth="0.4" />;
                })}
                <polygon points={dataPath} fill="rgba(139,92,246,0.22)" stroke="#8b5cf6" strokeWidth="1.4" />
                {vals.map((v, i) => {
                  const [x, y] = pt(i, v / 100);
                  return <circle key={i} cx={x} cy={y} r="2.2" fill="#8b5cf6" />;
                })}
              </svg>
              <div className="pr-hm-bars">
                {dims.map((d, i) => {
                  const colors = ['#8b5cf6', '#6366f1', '#ec4899', '#f59e0b', '#10b981'];
                  return (
                    <div key={d} className="pr-hm-bar-row">
                      <span className="pr-hm-bar-lbl">{d}</span>
                      <div className="pr-hm-bar-track">
                        <motion.div
                          className="pr-hm-bar-fill"
                          style={{ background: colors[i] }}
                          initial={{ width: 0 }}
                          animate={{ width: `${vals[i]}%` }}
                          transition={{ duration: 1.1, delay: 0.5 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                      <span className="pr-hm-bar-num" style={{ color: colors[i] }}>{vals[i]}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pr-hm-issues">
              <div className="pr-hm-issue">
                <AlertCircle size={12} style={{ color: '#ef4444' }} />
                <span className="pr-hm-sev pr-hm-sev-red">Critical</span>
                <span className="pr-hm-issue-txt">与 SOTA 方法的对比实验不完整</span>
              </div>
              <div className="pr-hm-issue">
                <AlertTriangle size={12} style={{ color: '#f59e0b' }} />
                <span className="pr-hm-sev pr-hm-sev-amber">Major</span>
                <span className="pr-hm-issue-txt">跨中心方差未做统计显著性检验</span>
              </div>
              <div className="pr-hm-issue">
                <Info size={12} style={{ color: '#3b82f6' }} />
                <span className="pr-hm-sev pr-hm-sev-blue">Minor</span>
                <span className="pr-hm-issue-txt">注意力图评估方法需进一步澄清</span>
              </div>
            </div>
          </div>

          {/* Right — reviewer rail */}
          <div className="pr-hm-rail">
            <div className="pr-hm-rail-head">Reviewers</div>
            {[
              { s: 'α', c: '#10b981', role: '原创性', rec: 'Minor Rev.' },
              { s: 'β', c: '#8b5cf6', role: '方法论', rec: 'Major Rev.' },
              { s: 'γ', c: '#f59e0b', role: '影响力', rec: 'Minor Rev.' },
              { s: 'Σ', c: '#3b82f6', role: 'Meta', rec: 'Minor Rev.', meta: true },
            ].map(rv => (
              <div key={rv.s} className={`pr-hm-rv ${rv.meta ? 'pr-hm-rv-meta' : ''}`}>
                <div className="pr-hm-rv-av" style={{ background: rv.c }}>{rv.s}</div>
                <div className="pr-hm-rv-txt">
                  <span className="pr-hm-rv-role">{rv.role}</span>
                  <span className="pr-hm-rv-rec" style={{ color: rv.c }}>{rv.rec}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </WindowChrome>

      {/* Floating chips */}
      <motion.div
        className="pr-hero-chip pr-hero-chip-tl"
        initial={{ opacity: 0, y: 10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.0, duration: 0.4 }}
      >
        <CheckCircle2 size={12} />
        审稿完成 · 2m 43s
      </motion.div>
      <motion.div
        className="pr-hero-chip pr-hero-chip-br"
        initial={{ opacity: 0, y: 10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.2, duration: 0.4 }}
      >
        <Lock size={12} />
        隐私模式已启用
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup: Literature Search
───────────────────────────────────────────── */
function LiteratureSearchMockup() {
  const hits = [
    { title: 'Attention Is All You Need', year: 2017, venue: 'NeurIPS', cites: '134k', sim: 92 },
    { title: 'TransUNet: Transformers Make Strong Encoders for Medical Image...', year: 2021, venue: 'arXiv', cites: '4.2k', sim: 88 },
    { title: 'Swin Transformer: Hierarchical Vision Transformer using Shifted...', year: 2021, venue: 'ICCV', cites: '18k', sim: 81 },
    { title: 'ViT: An Image is Worth 16x16 Words', year: 2020, venue: 'ICLR', cites: '42k', sim: 77 },
  ];
  return (
    <div className="pr-mk-lit">
      <WindowChrome compact url="peer-review · literature preprocessing">
        <div className="pr-lit-search">
          <Search size={14} />
          <span>vision transformer medical image segmentation</span>
          <span className="pr-lit-count">248 hits · 学术图谱</span>
        </div>
        <div className="pr-lit-list">
          {hits.map((h, i) => (
            <motion.div
              key={i}
              className="pr-lit-row"
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
            >
              <div className="pr-lit-sim">
                <div className="pr-lit-sim-ring">
                  <svg width="28" height="28" viewBox="0 0 28 28">
                    <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="2.5" />
                    <circle
                      cx="14" cy="14" r="11" fill="none"
                      stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"
                      strokeDasharray={`${(h.sim / 100) * 69.1} 69.1`}
                      transform="rotate(-90 14 14)"
                    />
                  </svg>
                  <span className="pr-lit-sim-num">{h.sim}</span>
                </div>
              </div>
              <div className="pr-lit-meta">
                <div className="pr-lit-title">{h.title}</div>
                <div className="pr-lit-sub">
                  <span>{h.venue}</span>
                  <span className="pr-lit-dot">·</span>
                  <span>{h.year}</span>
                  <span className="pr-lit-dot">·</span>
                  <Quote size={10} />
                  <span>{h.cites}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        <motion.div
          className="pr-lit-insight"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-30px' }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <GitCompareArrows size={13} />
          <span>识别出 <strong>3 个研究空白</strong>，供审稿人进行原创性评估对标</span>
        </motion.div>
      </WindowChrome>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup: Structured Report
───────────────────────────────────────────── */
function StructuredReportMockup() {
  const dims = ['原创性', '方法论', '清晰度', '重要性', '可复现性'];
  const vals = [DEMO_SCORES.originality, DEMO_SCORES.methodology, DEMO_SCORES.clarity, DEMO_SCORES.significance, DEMO_SCORES.reproducibility];
  const colors = ['#8b5cf6', '#6366f1', '#ec4899', '#f59e0b', '#10b981'];

  return (
    <div className="pr-mk-report">
      <WindowChrome compact url="report · sch-2025-0347.docx">
        <div className="pr-rpt-head">
          <div>
            <div className="pr-rpt-eyebrow">STRUCTURED REPORT</div>
            <div className="pr-rpt-title">最终评审报告</div>
          </div>
          <div className="pr-rpt-actions">
            <span className="pr-rpt-action"><FileDown size={11} /> DOCX</span>
            <span className="pr-rpt-action"><FileDown size={11} /> PDF</span>
          </div>
        </div>
        <div className="pr-rpt-dims">
          {dims.map((d, i) => (
            <div key={d} className="pr-rpt-dim" style={{ '--dim-c': colors[i] }}>
              <div className="pr-rpt-dim-num">{vals[i]}</div>
              <div className="pr-rpt-dim-lbl">{d}</div>
              <div className="pr-rpt-dim-bar">
                <motion.div
                  className="pr-rpt-dim-fill"
                  style={{ background: colors[i] }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${vals[i]}%` }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{ duration: 1, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="pr-rpt-issues">
          <div className="pr-rpt-issue-head">
            <span>问题清单</span>
            <div className="pr-rpt-issue-legend">
              <span><span className="pr-hm-dot pr-hm-dot-red" /> Critical</span>
              <span><span className="pr-hm-dot pr-hm-dot-amber" /> Major</span>
              <span><span className="pr-hm-dot pr-hm-dot-blue" /> Minor</span>
            </div>
          </div>
          {[
            { sev: 'red', label: 'Critical', text: '与 SOTA 方法对比实验不完整，建议补充 DINOv2、CLIP 对照' },
            { sev: 'amber', label: 'Major', text: '跨中心方差未做统计显著性检验（建议 ANOVA）' },
            { sev: 'blue', label: 'Minor', text: '注意力图评估方法需明确' },
          ].map((iss, i) => (
            <motion.div
              key={i}
              className="pr-rpt-issue"
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.3, delay: 0.3 + i * 0.08 }}
            >
              <span className={`pr-hm-sev pr-hm-sev-${iss.sev}`}>{iss.label}</span>
              <span className="pr-rpt-issue-txt">{iss.text}</span>
            </motion.div>
          ))}
        </div>
      </WindowChrome>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Feature Row (Stripe/Vercel pattern)
───────────────────────────────────────────── */
function FeatureRow({ id, eyebrow, title, body, bullets, mockup, reversed, accent }) {
  return (
    <section id={id} className={`pr-feat-row ${reversed ? 'pr-feat-reversed' : ''}`}>
      <div className="pr-feat-inner">
        <motion.div
          className="pr-feat-copy"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
        >
          <span className="pr-feat-eyebrow" style={{ color: accent, background: `${accent}14`, borderColor: `${accent}30` }}>
            {eyebrow}
          </span>
          <h2 className="pr-feat-title">{title}</h2>
          <p className="pr-feat-body">{body}</p>
          <ul className="pr-feat-bullets">
            {bullets.map((b, i) => (
              <li key={i}>
                <CheckCircle2 size={14} style={{ color: accent }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </motion.div>
        <motion.div
          className="pr-feat-visual"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55, delay: 0.1 }}
        >
          {mockup}
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   Engine Section — Agent Team · Skills · Tool Use
───────────────────────────────────────────── */
const AGENT_TEAM = [
  {
    s: 'α', c: '#10b981',
    handle: 'Originality Reviewer',
    titleCn: '原创性审查专家',
    specialty: ['文献对标', '新颖性判定', '创新点识别'],
    philosophy: '任何"首次"都要有证据 —— 我搜遍领域文献再给判断',
    spots: ['与已有工作的实质差异', '潜在先验工作遗漏', '创新点声明力度'],
    model: 'reviewer-alpha-v3',
  },
  {
    s: 'β', c: '#8b5cf6',
    handle: 'Methodology Reviewer',
    titleCn: '方法论审查专家',
    specialty: ['统计验证', '实验设计', '可复现性'],
    philosophy: '方法必须经得起复核 —— 公式、实验、代码我都会亲自走一遍',
    spots: ['统计检验的合理性', '消融实验的完整性', '超参与代码可复现性'],
    model: 'reviewer-beta-v3',
  },
  {
    s: 'γ', c: '#f59e0b',
    handle: 'Impact Reviewer',
    titleCn: '清晰度与影响力评估专家',
    specialty: ['写作清晰度', '图表表达', '实际影响'],
    philosophy: '好论文要让同行读得懂 —— 我站在读者一侧挑刺',
    spots: ['章节组织与叙述节奏', '图表信息密度', '结果的实际意义'],
    model: 'reviewer-gamma-v3',
  },
];

const META_AGENT = {
  handle: 'Meta-Reviewer',
  titleCn: '主编 · 最终决议人',
  philosophy: '读完三份独立审稿 · 处理分歧 · 给你一份可以直接照做的最终决议',
  responsibilities: ['处理审稿人分歧', '合成共识意见', '给出接收 / 修改 / 拒稿'],
};

const SKILL_CATEGORIES = [
  { name: '文献与创新性', color: '#06b6d4', count: 8, sample: ['语义级查重', '相似工作检索', '研究空白识别'] },
  { name: '方法论与实验', color: '#8b5cf6', count: 12, sample: ['公式推导验证', '实验设计评估', '消融实验完整性'] },
  { name: '统计与可复现性', color: '#10b981', count: 9, sample: ['显著性检验', '效应量计算', '多重比较校正'] },
  { name: '清晰度与表达', color: '#ec4899', count: 7, sample: ['章节逻辑', '术语一致性', '贡献点凝练'] },
  { name: '图表与公式', color: '#f59e0b', count: 6, sample: ['轴标签规范性', '公式符号一致性', '图注充分性'] },
  { name: '伦理与合规', color: '#ef4444', count: 4, sample: ['数据伦理', 'AI 使用声明', '潜在偏见'] },
];

const TOOL_ACTIONS = [
  { icon: <Terminal size={18} />, color: '#8b5cf6', title: '跑一遍你的代码', desc: '把论文中的统计代码和算法实际运行一次，核查数字是否对得上、结论能否复现' },
  { icon: <FileText size={18} />, color: '#ec4899', title: '读懂图表和公式', desc: '解析图中的坐标、数值、公式符号，确保审稿意见忠实于论文里真实展示的内容' },
  { icon: <BookOpen size={18} />, color: '#06b6d4', title: '翻开你引用的文献', desc: '主动抓取关键引文的全文，核查你引用的准确性与上下文是否贴合' },
  { icon: <GitCompareArrows size={18} />, color: '#10b981', title: '对齐领域最新进展', desc: '自动检索领域内最新的代表性工作，为你的方法提供一张"同类对比"全景图' },
];

const TERMINAL_LOG = [
  { ag: 'β', c: '#8b5cf6', action: 'running stats_verify(Table 3) ...', result: 'p = 0.031 · paper claims p = 0.05 · flagging Major' },
  { ag: 'α', c: '#10b981', action: 'fetch_paper("Smith2024") · retrieve_abstract ...', result: '5 related works retrieved · building novelty assessment' },
  { ag: 'γ', c: '#f59e0b', action: 'chart_reader: parse Figure 3 ...', result: '24 data points extracted · axis units ambiguous' },
  { ag: 'Σ', c: '#3b82f6', action: 'consolidate(α, β, γ) · arbitrate · decide ...', result: 'consensus = 78% · decision = Minor Revision' },
];

function EngineSection() {
  return (
    <section id="pr-engine" className="pr-section pr-engine-section">
      <div className="pr-section-inner">
        <div className="pr-section-head">
          <span className="pr-section-eyebrow pr-engine-eyebrow">
            <Cpu size={11} />
            审稿引擎 · 它是怎么做到的
          </span>
          <h2>
            不是一个 AI · 是一支 <span className="pr-engine-accent">专业分工的审稿团队</span>
          </h2>
          <p>
            很多"AI 审稿"其实就是让 ChatGPT 读一遍文章写点评。Scholay 不一样：
            多位 AI 审稿人分工协作、每位按需调用专业能力、在需要时会真正动手验证 ——
            一整套完整的 AI 审稿系统。
          </p>
        </div>

        {/* ── Part 01 · Agent Team ── */}
        <div className="pr-engine-part">
          <div className="pr-engine-part-head">
            <span className="pr-engine-part-num">01</span>
            <div className="pr-engine-part-title">
              <h3>Agent Team · 四位独立思考的 AI 审稿人</h3>
              <p>
                不是同一个 AI 换着问三次 —— 每位审稿人专注不同视角，使用不同底层模型、装载不同专业能力，
                各自独立阅读、独立打分；再由主编汇总意见、处理分歧、给出最终决议。
                就像真正的期刊审稿团队 —— 避免单一视角带来的偏差。
              </p>
            </div>
          </div>

          <div className="pr-agent-team-grid">
            {AGENT_TEAM.map((a, i) => (
              <motion.div
                key={a.s}
                className="pr-agent-card"
                style={{ '--ag-c': a.c }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <div className="pr-agent-card-glow" aria-hidden />
                <div className="pr-agent-card-head">
                  <div className="pr-agent-card-av">
                    <span>{a.s}</span>
                    <div className="pr-agent-card-av-ring" aria-hidden />
                  </div>
                  <div className="pr-agent-card-id">
                    <div className="pr-agent-card-handle">{a.handle}</div>
                    <div className="pr-agent-card-title">{a.titleCn}</div>
                  </div>
                </div>

                <div className="pr-agent-card-specs">
                  {a.specialty.map(s => (
                    <span key={s} className="pr-agent-card-spec">{s}</span>
                  ))}
                </div>

                <blockquote className="pr-agent-card-philosophy">
                  {a.philosophy}
                </blockquote>

                <div className="pr-agent-card-spots-lbl">常抓的问题</div>
                <ul className="pr-agent-card-spots">
                  {a.spots.map(sp => (
                    <li key={sp}>
                      <span className="pr-agent-card-dot" />
                      <span>{sp}</span>
                    </li>
                  ))}
                </ul>

                <div className="pr-agent-card-model">
                  <span className="pr-agent-card-model-lbl">agent</span>
                  <code>{a.model}</code>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Meta-Reviewer — full-width consensus card */}
          <motion.div
            className="pr-meta-agent-card"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: 0.25 }}
          >
            <div className="pr-meta-agent-left">
              <div className="pr-meta-agent-av">Σ</div>
              <div>
                <div className="pr-meta-agent-handle">{META_AGENT.handle}</div>
                <div className="pr-meta-agent-title">{META_AGENT.titleCn}</div>
              </div>
            </div>
            <div className="pr-meta-agent-middle">
              <blockquote>{META_AGENT.philosophy}</blockquote>
              <div className="pr-meta-agent-resp">
                {META_AGENT.responsibilities.map(r => (
                  <span key={r} className="pr-meta-agent-resp-chip">{r}</span>
                ))}
              </div>
            </div>
            <div className="pr-meta-agent-flow">
              <span className="pr-meta-flow-in" style={{ color: '#10b981' }}>α</span>
              <span className="pr-meta-flow-in" style={{ color: '#8b5cf6' }}>β</span>
              <span className="pr-meta-flow-in" style={{ color: '#f59e0b' }}>γ</span>
              <ChevronRight size={16} />
              <span className="pr-meta-flow-out">Consensus</span>
            </div>
          </motion.div>
        </div>

        {/* ── Part 02 · Skills System ── */}
        <div className="pr-engine-part">
          <div className="pr-engine-part-head">
            <span className="pr-engine-part-num">02</span>
            <div className="pr-engine-part-title">
              <h3>Skills · 可组合的专业审稿能力</h3>
              <p>
                审稿人不只是凭"通用常识"评审 —— 会根据你论文的学科与类型，调用专项的审稿能力。
                目前已积累六大领域共 50+ 项专业技能，每月持续扩充，按需组合调用。
              </p>
            </div>
          </div>

          <div className="pr-skills-panel">
            <motion.div
              className="pr-skills-stat"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4 }}
            >
              <div className="pr-skills-stat-num">
                50<span className="pr-skills-stat-plus">+</span>
              </div>
              <div className="pr-skills-stat-lbl">项专业审稿技能</div>
              <div className="pr-skills-stat-divider" />
              <div className="pr-skills-stat-meta">
                <div><strong>6</strong><span>大审稿领域</span></div>
                <div><strong>月度</strong><span>更新节奏</span></div>
                <div><strong>按需</strong><span>动态组合</span></div>
              </div>
              <div className="pr-skills-stat-badge">
                <Sparkles size={11} />
                本月新增 3 项技能
              </div>
            </motion.div>

            <div className="pr-skills-categories">
              {SKILL_CATEGORIES.map((cat, i) => (
                <motion.div
                  key={cat.name}
                  className="pr-skill-cat-card"
                  style={{ '--cat-c': cat.color }}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.35, delay: i * 0.06 }}
                >
                  <div className="pr-skill-cat-head">
                    <span className="pr-skill-cat-name">{cat.name}</span>
                    <span className="pr-skill-cat-count">{cat.count} 项技能</span>
                  </div>
                  <div className="pr-skill-cat-items">
                    {cat.sample.map(s => (
                      <span key={s} className="pr-skill-cat-item">{s}</span>
                    ))}
                    {cat.count > cat.sample.length && (
                      <span className="pr-skill-cat-more">还有 {cat.count - cat.sample.length} 项</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Part 03 · Tool Use ── */}
        <div className="pr-engine-part">
          <div className="pr-engine-part-head">
            <span className="pr-engine-part-num">03</span>
            <div className="pr-engine-part-title">
              <h3>Tool Use · 不只是评论，会亲自动手验证</h3>
              <p>
                别家 AI 只会给你写评语 —— Scholay 的审稿人会真的动手：
                把论文里的代码跑起来、把图表里的数据读出来、把你引用的文献翻开看。
                每一条审稿意见背后，都有可追溯的执行证据。
              </p>
            </div>
          </div>

          <div className="pr-tools-panel">
            <div className="pr-tools-terminal">
              <WindowChrome compact url="scholay · agent-runtime · live">
                <div className="pr-tools-log">
                  {TERMINAL_LOG.map((line, i) => (
                    <motion.div
                      key={i}
                      className="pr-tools-log-row"
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: '-30px' }}
                      transition={{ duration: 0.3, delay: i * 0.15 }}
                    >
                      <span className="pr-tools-log-ag" style={{ color: line.c, borderColor: line.c }}>{line.ag}</span>
                      <div className="pr-tools-log-body">
                        <div className="pr-tools-log-action">
                          <span className="pr-tools-log-prompt">❯</span>
                          {line.action}
                        </div>
                        <div className="pr-tools-log-result">
                          <span className="pr-tools-log-arrow">→</span>
                          {line.result}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  <div className="pr-tools-log-cursor">
                    <span className="pr-tools-log-ag" style={{ color: '#3b82f6', borderColor: '#3b82f6' }}>Σ</span>
                    <span className="pr-tools-log-prompt">❯</span>
                    <span className="pr-tools-log-blink">_</span>
                  </div>
                </div>
              </WindowChrome>
            </div>

            <div className="pr-tools-actions">
              {TOOL_ACTIONS.map((t, i) => (
                <motion.div
                  key={t.title}
                  className="pr-tool-action-card"
                  style={{ '--tl-c': t.color }}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.35, delay: i * 0.07 }}
                >
                  <div className="pr-tool-action-icon">{t.icon}</div>
                  <div className="pr-tool-action-title">{t.title}</div>
                  <div className="pr-tool-action-desc">{t.desc}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <motion.div
          className="pr-engine-tagline"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
        >
          <Sparkles size={14} />
          <span>这就是我们理解的 <strong>下一代学术审稿</strong></span>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   Security section — editorial, Stripe/Vercel style
───────────────────────────────────────────── */

const SECURITY_PILLARS = [
  {
    icon: <Lock size={18} />,
    title: '全程加密传输',
    desc: '从你的浏览器到我们的服务器全链路加密，任何中间节点都拿不到明文。',
    tag: 'TLS 1.3 · HSTS',
    c: '#8b5cf6',
  },
  {
    icon: <BrainCircuit size={18} />,
    title: '绝不用于训练',
    desc: '你的论文永远不会进入任何 AI 模型的训练 —— 这是我们的技术红线，也写进了合同。',
    tag: '零留存 · 不做训练',
    c: '#10b981',
  },
  {
    icon: <EyeOff size={18} />,
    title: '阅后即焚',
    desc: '开启隐私模式后，下载报告就触发自动销毁，24 小时内彻底删除、不留备份。',
    tag: '24h 自动销毁',
    c: '#f59e0b',
  },
  {
    icon: <FileCheck size={18} />,
    title: '独立存储 · 可审计',
    desc: '每位用户的稿件独立加密存放，每次访问全程留痕，定期接受第三方安全审计。',
    tag: 'GDPR · 个人信息保护法',
    c: '#3b82f6',
  },
];

const NEVER_ITEMS = [
  '将你的论文用于任何 AI 模型训练或微调',
  '在未授权情况下与第三方共享你的稿件',
  '让你的未发表内容出现在公开检索结果中',
  '在审稿完成后长期存储你的原文数据',
];

const LIFECYCLE_STEPS = [
  { t: 't = 0s', label: '加密上传', desc: '论文在你的浏览器就开始加密，传输过程中我们自己都看不到明文', icon: <Lock size={14} /> },
  { t: 't = 30s', label: 'AI 审稿', desc: '在独立隔离环境中完成分析，全程不写入普通存储、不进入任何模型训练', icon: <Sparkles size={14} /> },
  { t: 't ≈ 3min', label: '生成报告', desc: '报告签名后交付给你，只有你能看、只有你能下载', icon: <Download size={14} /> },
  { t: 't ≤ 24h', label: '彻底销毁', desc: '原文、缓存、备份全部清除 —— 我们自己也无法恢复', icon: <Shield size={14} /> },
];

function SecurityMockup() {
  return (
    <div className="pr-sec-mockup">
      <WindowChrome url="vault.scholay.com" compact>
        <div className="pr-sec-vault">
          <div className="pr-sec-vault-top">
            <div className="pr-sec-vault-badge">
              <span className="pr-sec-vault-badge-dot" />
              <span>ENCRYPTED · LIVE</span>
            </div>
            <span className="pr-sec-vault-mono">sess_a7f3e91b</span>
          </div>

          <div className="pr-sec-vault-core">
            <div className="pr-sec-vault-lock-ring">
              <div className="pr-sec-vault-lock-pulse" />
              <div className="pr-sec-vault-lock-ico"><Lock size={22} /></div>
            </div>
            <div className="pr-sec-vault-file">
              <FileText size={14} />
              <span>manuscript_draft_v7.pdf</span>
              <span className="pr-sec-vault-file-size">· 2.4 MB</span>
            </div>
            <div className="pr-sec-vault-hash">
              sha256: 9f3a…b71e · signed · attested
            </div>
          </div>

          <div className="pr-sec-vault-lines">
            {[
              { k: 'channel', v: 'TLS 1.3 · AES-256-GCM', ok: true },
              { k: 'at rest', v: 'per-user envelope key', ok: true },
              { k: 'training', v: 'excluded · policy enforced', ok: true },
              { k: 'retention', v: '24h TTL · shred on expire', ok: true },
            ].map((r) => (
              <div key={r.k} className="pr-sec-vault-line">
                <span className="pr-sec-vault-line-key">{r.k}</span>
                <span className="pr-sec-vault-line-val">{r.v}</span>
                <span className="pr-sec-vault-line-ok"><CheckCircle2 size={12} /></span>
              </div>
            ))}
          </div>
        </div>
      </WindowChrome>
    </div>
  );
}

function SecuritySection() {
  return (
    <section id="pr-security" className="pr-section pr-security-v2">
      <div className="pr-section-inner">
        {/* ── Hero row ───────────────────────────────── */}
        <div className="pr-sec-hero">
          <motion.div
            className="pr-sec-hero-copy"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5 }}
          >
            <span className="pr-section-eyebrow">数据安全</span>
            <h2 className="pr-sec-hero-title">
              你的论文<span className="pr-sec-accent">只属于你</span>
              <br />
              从上传那一刻起，直到彻底销毁
            </h2>
            <p className="pr-sec-hero-lead">
              未发表的手稿一旦泄露，就有被抢先投稿、被用于训练商业模型、甚至出现在公开检索中的风险。
              我们太清楚这份担忧 —— 从第一行代码起，就把它放在最高优先级。
            </p>
            <div className="pr-sec-hero-stats">
              <div className="pr-sec-hero-stat">
                <Lock size={14} />
                <span>全程端到端加密</span>
              </div>
              <div className="pr-sec-hero-stat">
                <BrainCircuit size={14} />
                <span>绝不用于 AI 训练</span>
              </div>
              <div className="pr-sec-hero-stat">
                <EyeOff size={14} />
                <span>24 小时自动销毁</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="pr-sec-hero-visual"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <SecurityMockup />
          </motion.div>
        </div>

        {/* ── Compliance strip ──────────────────────── */}
        <motion.div
          className="pr-sec-compliance"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <span className="pr-sec-compliance-label">合规 & 标准</span>
          <div className="pr-sec-compliance-items">
            {['GDPR', '《个人信息保护法》', 'TLS 1.3', 'AES-256-GCM', '零留存'].map((c) => (
              <span key={c} className="pr-sec-compliance-chip">{c}</span>
            ))}
          </div>
        </motion.div>

        {/* ── Four-pillar bento ─────────────────────── */}
        <div className="pr-sec-pillars">
          {SECURITY_PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              className="pr-sec-pillar"
              style={{ '--sec-c': p.c }}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <div className="pr-sec-pillar-accent" />
              <div className="pr-sec-pillar-icon">{p.icon}</div>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
              <div className="pr-sec-pillar-tag">{p.tag}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Never panel ───────────────────────────── */}
        <motion.div
          className="pr-sec-never"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
        >
          <div className="pr-sec-never-head">
            <span className="pr-sec-never-mark">NEVER</span>
            <h3>四条"绝不"承诺 —— 一条都不越界</h3>
            <p>说"会做什么"很容易，说"绝不做什么"才是真难。下面这四条，写进合同、写进架构，也写进我们的运维规则。</p>
          </div>
          <div className="pr-sec-never-grid">
            {NEVER_ITEMS.map((text, i) => (
              <motion.div
                key={i}
                className="pr-sec-never-row"
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: 0.15 + i * 0.08 }}
              >
                <span className="pr-sec-never-x"><X size={12} strokeWidth={3} /></span>
                <span className="pr-sec-never-text">绝不{text}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* ── Lifecycle timeline ────────────────────── */}
        <motion.div
          className="pr-sec-lifecycle"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
        >
          <div className="pr-sec-lifecycle-head">
            <span className="pr-section-eyebrow">数据生命周期</span>
            <h3>从上传到销毁 · 你的论文在这里走过的每一步</h3>
          </div>
          <div className="pr-sec-lifecycle-rail">
            {LIFECYCLE_STEPS.map((s, i) => (
              <motion.div
                key={s.label}
                className="pr-sec-lifecycle-step"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: 0.15 + i * 0.1 }}
              >
                <div className="pr-sec-lifecycle-step-top">
                  <span className="pr-sec-lifecycle-time">{s.t}</span>
                  <div className="pr-sec-lifecycle-ico">{s.icon}</div>
                </div>
                <div className="pr-sec-lifecycle-label">{s.label}</div>
                <div className="pr-sec-lifecycle-desc">{s.desc}</div>
                {i < LIFECYCLE_STEPS.length - 1 && <div className="pr-sec-lifecycle-connector" />}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   Premium FAQ accordion — light-theme aware
───────────────────────────────────────────── */
function PremiumFAQ({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="pr-faq-list">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <motion.div
            key={i}
            className={`pr-faq-item ${isOpen ? 'open' : ''}`}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: i * 0.04 }}
          >
            <button
              className="pr-faq-trigger"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
            >
              <span className="pr-faq-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="pr-faq-q">{item.q}</span>
              <span className="pr-faq-chev"><ChevronDown size={18} /></span>
            </button>
            <div className="pr-faq-panel" role="region">
              <div className="pr-faq-panel-inner">
                <p>{item.a}</p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main page
───────────────────────────────────────────── */
export default function PeerReviewFeaturePage() {
  const navigate = useNavigate();

  return (
    <div className="feat-page feat-review-page pr-v2">
      <SEO
        title="AI 智能审稿 - Scholay | 多维度论文评审与修改建议"
        description="Scholay AI 智能审稿模拟同行评审流程，从原创性、方法论、清晰度、重要性和可复现性五大维度，由三位 AI 审稿人多角度评审论文，生成结构化审稿报告。"
        keywords="AI审稿,智能审稿,论文评审,同行评审,论文修改,学术审稿,论文质量检查,投稿前审查"
        canonical="/features/peer-review"
      />

      <FeatureNav ctaText="开始审稿" ctaTo="/peer-review" accentColor={ACCENT} />

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="pr-hero">
        <div className="pr-hero-bg" aria-hidden>
          <div className="pr-hero-beam pr-hero-beam-1" />
          <div className="pr-hero-beam pr-hero-beam-2" />
          <div className="pr-hero-grid" />
        </div>

        <div className="pr-hero-inner">
          <motion.div
            className="pr-hero-copy"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="pr-hero-eyebrow">
              <Sparkles size={12} />
              AI PEER REVIEW
            </span>
            <h1 className="pr-hero-h1">
              投稿前，<br />
              先让 <span className="pr-hero-grad">AI 审稿人</span> 把关
            </h1>
            <p className="pr-hero-lead">
              三位 AI 审稿人分别从不同视角独立评审，再由主编合成最终意见。
              原创性、方法论、清晰度、重要性、可复现性逐一打分 —— 3 分钟交付一份期刊级的结构化审稿报告。
            </p>
            <div className="pr-hero-ctas">
              <button className="pr-btn pr-btn-primary" onClick={() => navigate('/peer-review')}>
                立即免费审稿
                <ArrowRight size={15} />
              </button>
              <a className="pr-btn pr-btn-ghost" href="#pr-security">
                查看数据安全
                <ChevronDown size={14} />
              </a>
            </div>

            <div className="pr-hero-security">
              <div className="pr-hero-security-head">
                <ShieldCheck size={14} />
                <span>你的未发表论文 · 绝对安全</span>
              </div>
              <div className="pr-hero-security-chips">
                <span className="pr-hero-sec-chip">
                  <Lock size={11} />
                  全程加密传输
                </span>
                <span className="pr-hero-sec-chip">
                  <BrainCircuit size={11} />
                  不用于 AI 训练
                </span>
                <span className="pr-hero-sec-chip">
                  <EyeOff size={11} />
                  24 小时自动销毁
                </span>
              </div>
            </div>

            <div className="pr-hero-meta">
              <LiveCounter />
              <span className="pr-hero-sep" />
              <span>首次免费 · 无需注册</span>
            </div>
          </motion.div>

          <motion.div
            className="pr-hero-visual"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroReportMockup />
          </motion.div>
        </div>

        <div className="pr-hero-trust">
          <p className="pr-hero-trust-label">适用于投稿至以下期刊与会议</p>
          <JournalTicker />
        </div>
      </section>

      <main className="feat-main pr-main">

        {/* ═══════════════ METRICS BAR ═══════════════ */}
        <section className="pr-metrics">
          <div className="pr-metrics-inner">
            {[
              { num: '< 3', unit: '分钟', label: '从上传到拿到完整报告' },
              { num: '3+1', unit: '', label: '三位审稿人 + 一位主编' },
              { num: '5', unit: '', label: '评分维度，结构化输出' },
              { num: '50', unit: '页', label: '单篇最大支持' },
            ].map((m, i) => (
              <motion.div
                key={i}
                className="pr-metric"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <div className="pr-metric-num">
                  {m.num}
                  {m.unit && <span className="pr-metric-unit">{m.unit}</span>}
                </div>
                <div className="pr-metric-label">{m.label}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══════════════ ENGINE · Multi-Agent 系统 ═══════════════ */}
        <EngineSection />

        {/* ═══════════════ FEATURE ROW — LITERATURE ═══════════════ */}
        <FeatureRow
          id="pr-literature"
          eyebrow="文献对标"
          title={'每一个"新颖性"判断，都有具体文献支撑'}
          body={'审稿开始前，系统会先帮你的论文做一轮学术检索，找出领域内最相似的已发表工作、识别常见的研究空白。这样审稿人的评价就不再凭感觉 —— 每一条关于"新不新"、"创不创新"的结论，背后都有可核查的文献依据。'}
          bullets={[
            '整合全球主流学术数据库，实时检索 2 亿+ 学术记录',
            '自动找出领域内与你最相似的已发表工作',
            '总结研究空白，让审稿人据此评估新颖性',
            '每条结论都可回溯到具体引文',
          ]}
          mockup={<LiteratureSearchMockup />}
          reversed
          accent="#06b6d4"
        />

        {/* ═══════════════ FEATURE ROW — REPORT ═══════════════ */}
        <FeatureRow
          id="pr-report"
          eyebrow="审稿报告"
          title="从雷达图到分级问题清单，一份报告把话讲透"
          body={'五大维度逐一打分，问题按 严重 / 一般 / 轻微 三级分类，每条问题都附上具体修改建议 —— 不是泛泛而谈"值得改进"，而是直接告诉你"第 X 节该怎么改"。一键导出 Word / PDF。'}
          bullets={[
            '五维度打分 · 雷达图一眼看清强弱项',
            '问题按 严重 / 一般 / 轻微 分级列清单',
            '每条问题都附带可以直接照做的修改建议',
            'Word / PDF 一键导出，直接交给导师或合作者',
          ]}
          mockup={<StructuredReportMockup />}
          accent="#10b981"
        />

        <SecuritySection />

        {/* ═══════════════ FAQ ═══════════════ */}
        <section id="pr-faq" className="pr-section pr-faq-section">
          <div className="pr-section-inner">
            <div className="pr-section-head">
              <span className="pr-section-eyebrow">常见问题</span>
              <h2>你可能想知道的</h2>
              <p>关于 AI 审稿、工作流程、数据安全的常见疑问 —— 一次说清。</p>
            </div>
            <PremiumFAQ items={FAQ_ITEMS} />
          </div>
        </section>

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
