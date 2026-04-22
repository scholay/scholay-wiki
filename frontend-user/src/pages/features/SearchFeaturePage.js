/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * SearchFeaturePage — Stripe/Vercel-style promotional landing
 * Dark hero · window-chrome mockups · alternating feature rows · premium FAQ
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Sparkles, ChevronDown, ChevronRight, CheckCircle2, Lock,
  Search, Database, Brain, Filter, Users, GitBranch,
  Globe, Quote, Zap, Target, Layers, Cpu,
} from 'lucide-react';
import { FeatureNav, FeatureCTA, FeatureJumpNav, SEO } from './FeaturePageComponents';
import './SearchFeaturePage.css';

const ACCENT = '#06b6d4';

const JUMP_SECTIONS = [
  { id: 'srch-engine', label: '检索引擎' },
  { id: 'srch-modes', label: '两种模式' },
  { id: 'srch-coverage', label: '文献覆盖' },
  { id: 'srch-filters', label: '高级筛选' },
  { id: 'srch-citation', label: '引用网络' },
  { id: 'srch-faq', label: '常见问题' },
];

const SOURCES = [
  '学术图谱', 'arXiv', 'PubMed', 'IEEE Xplore', 'ACM DL',
  'Springer', 'Elsevier', 'Nature', 'Science', 'Cell',
  'NeurIPS', 'ICML', 'ACL', 'CVPR', 'OpenReview',
];

const FAQ_ITEMS = [
  {
    q: '直接检索和 AI 智能检索到底有什么区别？',
    a: '直接检索像传统数据库检索：输入关键词、论文标题或作者名，系统做精确匹配。适合已经知道目标论文、要快速定位某篇具体文章时用。AI 智能检索则是"告诉它你在研究什么"—— 支持一整段自然语言描述，AI 会理解你的意图、自动扩展查询、做语义级匹配，适合还在探索阶段、想发现相关领域文献的时候。',
  },
  {
    q: '你们的论文数据从哪里来？有多少？',
    a: '我们整合了全球多个主流学术数据库，实时接入，覆盖 2 亿+ 学术记录（含 arXiv 预印本、期刊论文、会议论文、Book Chapter 等），同时补充 PubMed、IEEE、ACM 等索引。数据每日同步，新发表的论文通常在几小时内就能检索到。',
  },
  {
    q: '搜索需要付费吗？免费版有什么限制？',
    a: '学术检索功能完全免费 —— 无论是直接检索还是 AI 智能检索，都对所有用户开放。免费版每天有一定的 AI 检索额度，日常研究够用。如果你是重度用户（日均几十次 AI 检索），可以考虑 PRO 方案解锁无限额度。',
  },
  {
    q: 'AI 是怎么理解我的自然语言查询的？',
    a: '我们不是把你的查询丢给一个大模型然后让它返回结果。实际流程是：① 意图解析 —— AI 先理解你在问"方法 / 领域 / 应用"三者中的哪种关系；② 查询扩展 —— 自动补充同义词、相关术语和跨语言翻译；③ 语义检索 —— 在向量索引上做相似度匹配；④ 重排序 —— 综合相关性、引用影响力、时效性给出最终结果。整个过程通常在 10 秒内完成。',
  },
  {
    q: '可以筛选只看开放获取的论文吗？',
    a: '可以。高级筛选里有"开放获取"开关，开启后只返回可直接下载 PDF 的论文，支持识别 Gold OA、Green OA、Hybrid 等不同开放类型。搭配年份、被引次数、学科等筛选使用，能快速锁定"高质量 + 可立刻阅读"的文献。',
  },
  {
    q: '搜索结果可以导出吗？支持哪些引用格式？',
    a: '支持。每篇论文和搜索结果列表都可以导出为 BibTeX、APA、MLA、Chicago、IEEE、GB/T 7714 等主流格式，直接粘贴到你的 LaTeX 或 Word 论文参考文献部分即可使用。也可以批量选择后导出合集。',
  },
  {
    q: '支持中文论文吗？支持跨语言检索吗？',
    a: '支持。中文学术数据库目前覆盖 CNKI 部分开放数据和中文预印本平台。跨语言检索是 AI 模式的原生能力 —— 你用中文描述研究问题，可以同时返回中英文相关文献，反之亦然。',
  },
  {
    q: '搜索历史会保存吗？我的隐私怎么保护？',
    a: '登录用户的搜索历史会保存在你的账号下，方便回看和继续。所有查询全程 TLS 加密传输，搜索内容不会被用于任何 AI 模型训练，也不会分享给第三方。你可以随时在设置里清空搜索历史，或开启"隐私检索"模式（不记录任何搜索行为）。',
  },
];

/* ─────────────────────────────────────────────
   Helpers & primitives
───────────────────────────────────────────── */

function LiveCounter() {
  const [count, setCount] = useState(18432);
  useEffect(() => {
    const id = setInterval(() => {
      if (Math.random() > 0.4) setCount(c => c + Math.floor(Math.random() * 5) + 1);
    }, 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="srch-live-inline">
      <span className="srch-live-dot" />
      <span>今日已检索 <strong>{count.toLocaleString()}</strong> 次</span>
    </span>
  );
}

function SourceTicker() {
  const doubled = [...SOURCES, ...SOURCES];
  return (
    <div className="srch-ticker-wrap">
      <div className="srch-ticker-fade srch-ticker-fade-l" />
      <div className="srch-ticker-fade srch-ticker-fade-r" />
      <div className="srch-ticker">
        {doubled.map((j, i) => (
          <span key={i} className="srch-ticker-item">{j}</span>
        ))}
      </div>
    </div>
  );
}

function WindowChrome({ url, tabs, activeTab = 0, children, className = '', compact = false }) {
  return (
    <div className={`srch-window ${compact ? 'srch-window-compact' : ''} ${className}`}>
      <div className="srch-window-bar">
        <div className="srch-window-dots">
          <span />
          <span />
          <span />
        </div>
        {url && (
          <div className="srch-window-url">
            <Lock size={10} />
            <span>{url}</span>
          </div>
        )}
        <div className="srch-window-spacer" />
      </div>
      {tabs && (
        <div className="srch-window-tabs">
          {tabs.map((t, i) => (
            <div key={i} className={`srch-window-tab ${i === activeTab ? 'active' : ''}`}>
              {t.icon}
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="srch-window-body">{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Hero Mockup — AI Search Results
───────────────────────────────────────────── */
function HeroSearchMockup() {
  const results = [
    { title: 'Attention Is All You Need', venue: 'NeurIPS', year: 2017, cites: '134k', rel: 96 },
    { title: 'An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale', venue: 'ICLR', year: 2021, cites: '42k', rel: 91 },
    { title: 'TransUNet: Transformers Make Strong Encoders for Medical Image Segmentation', venue: 'arXiv', year: 2021, cites: '4.2k', rel: 87 },
    { title: 'Swin Transformer: Hierarchical Vision Transformer using Shifted Windows', venue: 'ICCV', year: 2021, cites: '18k', rel: 83 },
  ];

  return (
    <div className="srch-hero-mockup">
      <WindowChrome
        url="scholay.ai/search"
        tabs={[
          { icon: <Sparkles size={12} />, label: 'AI 智能检索' },
          { icon: <Search size={12} />, label: '直接检索' },
          { icon: <Users size={12} />, label: '作者' },
        ]}
      >
        <div className="srch-hm-query">
          <Search size={14} />
          <span className="srch-hm-query-text">vision transformer for medical image segmentation</span>
          <span className="srch-hm-query-chip">自然语言</span>
        </div>

        <motion.div
          className="srch-hm-ai-pane"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          <div className="srch-hm-ai-head">
            <Brain size={12} />
            <span>AI 已识别研究方向</span>
            <span className="srch-hm-ai-badge">248 hits · 0.8s</span>
          </div>
          <div className="srch-hm-ai-tags">
            <span className="srch-hm-ai-tag">方法 · Vision Transformer</span>
            <span className="srch-hm-ai-tag">领域 · Medical Imaging</span>
            <span className="srch-hm-ai-tag">任务 · Segmentation</span>
          </div>
        </motion.div>

        <div className="srch-hm-results">
          {results.map((r, i) => (
            <motion.div
              key={i}
              className="srch-hm-row"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.55 + i * 0.08 }}
            >
              <div className="srch-hm-sim">
                <svg width="32" height="32" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(6,182,212,0.15)" strokeWidth="2.5" />
                  <circle
                    cx="16" cy="16" r="13" fill="none"
                    stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={`${(r.rel / 100) * 81.68} 81.68`}
                    transform="rotate(-90 16 16)"
                  />
                </svg>
                <span className="srch-hm-sim-num">{r.rel}</span>
              </div>
              <div className="srch-hm-meta">
                <div className="srch-hm-title">{r.title}</div>
                <div className="srch-hm-sub">
                  <span className="srch-hm-venue">{r.venue}</span>
                  <span className="srch-hm-dot">·</span>
                  <span>{r.year}</span>
                  <span className="srch-hm-dot">·</span>
                  <Quote size={10} />
                  <span>{r.cites}</span>
                  {r.rel >= 90 && <span className="srch-hm-top">TOP MATCH</span>}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </WindowChrome>

      <motion.div
        className="srch-hero-chip srch-hero-chip-tl"
        initial={{ opacity: 0, y: 10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.0, duration: 0.4 }}
      >
        <Zap size={12} />
        语义匹配 · 0.8s
      </motion.div>
      <motion.div
        className="srch-hero-chip srch-hero-chip-br"
        initial={{ opacity: 0, y: 10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.2, duration: 0.4 }}
      >
        <Database size={12} />
        2 亿+ 文献在线
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup: Dual Mode showcase
───────────────────────────────────────────── */
function DualModeMockup() {
  return (
    <div className="srch-mk-dual">
      <WindowChrome compact url="scholay · query-pipeline">
        <div className="srch-dm-head">
          <span className="srch-dm-head-eyebrow">QUERY PIPELINE</span>
          <span>两种模式，同一条路</span>
        </div>
        <div className="srch-dm-rows">
          <div className="srch-dm-row">
            <span className="srch-dm-tag srch-dm-tag-direct">直接</span>
            <code className="srch-dm-code">
              title:"vision transformer" AND field:"medical"
            </code>
            <ChevronRight size={14} />
            <span className="srch-dm-out">精确匹配</span>
          </div>
          <div className="srch-dm-row">
            <span className="srch-dm-tag srch-dm-tag-ai">AI</span>
            <code className="srch-dm-code">
              帮我找医学影像分割里用 ViT 的新方法
            </code>
            <ChevronRight size={14} />
            <span className="srch-dm-out">语义理解</span>
          </div>
        </div>
        <div className="srch-dm-unified">
          <div className="srch-dm-unified-line" />
          <span className="srch-dm-unified-lbl">
            <Target size={12} />
            统一结果排序 · 相关性 × 引用影响力 × 时效性
          </span>
        </div>
      </WindowChrome>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup: Database Scale
───────────────────────────────────────────── */
function CoverageMockup() {
  const fields = [
    { name: '计算机科学', pct: 100, n: '48M' },
    { name: '生物医学', pct: 88, n: '42M' },
    { name: '物理学', pct: 72, n: '35M' },
    { name: '化学', pct: 65, n: '31M' },
    { name: '工程学', pct: 60, n: '29M' },
    { name: '数学', pct: 52, n: '25M' },
    { name: '经济与商学', pct: 44, n: '21M' },
    { name: '社会科学', pct: 38, n: '18M' },
  ];
  return (
    <div className="srch-mk-cov">
      <WindowChrome compact url="coverage · academic graph corpus">
        <div className="srch-cov-head">
          <div>
            <span className="srch-cov-head-eyebrow">LIVE CORPUS</span>
            <div className="srch-cov-head-title">覆盖 2 亿+ 学术记录</div>
          </div>
          <span className="srch-cov-head-badge">
            <span className="srch-cov-head-dot" />
            实时同步
          </span>
        </div>
        <div className="srch-cov-bars">
          {fields.map((f, i) => (
            <motion.div
              key={f.name}
              className="srch-cov-bar"
              initial={{ opacity: 0, y: 4 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <span className="srch-cov-bar-lbl">{f.name}</span>
              <div className="srch-cov-bar-track">
                <motion.div
                  className="srch-cov-bar-fill"
                  initial={{ width: 0 }}
                  whileInView={{ width: `${f.pct}%` }}
                  viewport={{ once: true, margin: '-30px' }}
                  transition={{ duration: 0.9, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span className="srch-cov-bar-num">{f.n}</span>
            </motion.div>
          ))}
        </div>
        <div className="srch-cov-foot">
          <span><Globe size={11} /> 19 学科</span>
          <span className="srch-cov-sep" />
          <span>80+ 语言</span>
          <span className="srch-cov-sep" />
          <span>每日同步</span>
        </div>
      </WindowChrome>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup: Advanced Filter Panel
───────────────────────────────────────────── */
function FilterMockup() {
  return (
    <div className="srch-mk-flt">
      <WindowChrome compact url="filter · advanced">
        <div className="srch-flt-head">
          <Filter size={13} />
          <span>高级筛选</span>
          <span className="srch-flt-head-count">248 → 34 篇</span>
        </div>
        <div className="srch-flt-group">
          <div className="srch-flt-group-lbl">发表年份</div>
          <div className="srch-flt-range">
            <span>2020</span>
            <div className="srch-flt-range-bar">
              <motion.div
                className="srch-flt-range-fill"
                initial={{ width: 0 }}
                whileInView={{ width: '72%' }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
              <motion.div
                className="srch-flt-range-dot"
                initial={{ left: 0 }}
                whileInView={{ left: '72%' }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <span>2025</span>
          </div>
        </div>
        <div className="srch-flt-group">
          <div className="srch-flt-group-lbl">最低被引</div>
          <div className="srch-flt-chips">
            {['≥10', '≥50', '≥100', '≥500', '≥1000'].map((c, i) => (
              <span key={c} className={`srch-flt-chip ${i === 2 ? 'active' : ''}`}>{c}</span>
            ))}
          </div>
        </div>
        <div className="srch-flt-group">
          <div className="srch-flt-group-lbl">学科领域</div>
          <div className="srch-flt-chips">
            {['计算机科学', '生物医学', '工程学', '+16'].map((c, i) => (
              <span key={c} className={`srch-flt-chip ${i < 2 ? 'active' : ''}`}>{c}</span>
            ))}
          </div>
        </div>
        <div className="srch-flt-group srch-flt-toggle-row">
          <div>
            <div className="srch-flt-group-lbl">仅开放获取</div>
            <div className="srch-flt-sub">只显示可下载 PDF 的论文</div>
          </div>
          <div className="srch-flt-toggle srch-flt-toggle-on"><span /></div>
        </div>
      </WindowChrome>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup: Citation Graph
───────────────────────────────────────────── */
function CitationMockup() {
  const nodes = [
    { cx: 50, cy: 50, r: 12, label: 'Focus', primary: true },
    { cx: 20, cy: 25, r: 7, label: 'ViT' },
    { cx: 82, cy: 20, r: 8, label: 'Attention' },
    { cx: 15, cy: 72, r: 6, label: 'U-Net' },
    { cx: 85, cy: 78, r: 7, label: 'Swin' },
    { cx: 50, cy: 12, r: 5, label: 'DeiT' },
    { cx: 50, cy: 88, r: 5, label: 'DETR' },
  ];
  const centerX = 50, centerY = 50;
  return (
    <div className="srch-mk-cit">
      <WindowChrome compact url="citation · network · live">
        <div className="srch-cit-head">
          <GitBranch size={13} />
          <span>引用网络</span>
          <span className="srch-cit-head-sub">以 Attention Is All You Need 为中心</span>
        </div>
        <div className="srch-cit-graph">
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
            <defs>
              <radialGradient id="srchCitGrad" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </radialGradient>
              <filter id="srchCitGlow">
                <feGaussianBlur stdDeviation="0.8" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx={centerX} cy={centerY} r="42" fill="url(#srchCitGrad)" />
            {nodes.slice(1).map((n, i) => (
              <motion.line
                key={`line-${i}`}
                x1={centerX}
                y1={centerY}
                x2={n.cx}
                y2={n.cy}
                stroke="rgba(6,182,212,0.35)"
                strokeWidth="0.3"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.06 }}
              />
            ))}
            {nodes.map((n, i) => (
              <motion.g
                key={`node-${i}`}
                initial={{ opacity: 0, scale: 0 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.35, delay: n.primary ? 0 : 0.35 + i * 0.05 }}
              >
                <circle
                  cx={n.cx}
                  cy={n.cy}
                  r={n.r}
                  fill={n.primary ? '#06b6d4' : 'rgba(6,182,212,0.15)'}
                  stroke={n.primary ? '#67e8f9' : '#06b6d4'}
                  strokeWidth={n.primary ? '0.8' : '0.4'}
                  filter={n.primary ? 'url(#srchCitGlow)' : ''}
                />
                <text
                  x={n.cx}
                  y={n.cy + n.r + 3.5}
                  fontSize="2.6"
                  textAnchor="middle"
                  fill={n.primary ? '#22d3ee' : 'rgba(244,244,245,0.7)'}
                  fontWeight={n.primary ? '700' : '500'}
                >
                  {n.label}
                </text>
              </motion.g>
            ))}
          </svg>
        </div>
        <div className="srch-cit-legend">
          <span><span className="srch-cit-dot srch-cit-dot-in" />引用关系</span>
          <span><span className="srch-cit-dot srch-cit-dot-out" />被引用关系</span>
          <span className="srch-cit-count">6 层 · 2.3k 节点</span>
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
    <section id={id} className={`srch-feat-row ${reversed ? 'srch-feat-reversed' : ''}`}>
      <div className="srch-feat-inner">
        <motion.div
          className="srch-feat-copy"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
        >
          <span className="srch-feat-eyebrow" style={{ color: accent, background: `${accent}14`, borderColor: `${accent}30` }}>
            {eyebrow}
          </span>
          <h2 className="srch-feat-title">{title}</h2>
          <p className="srch-feat-body">{body}</p>
          <ul className="srch-feat-bullets">
            {bullets.map((b, i) => (
              <li key={i}>
                <CheckCircle2 size={14} style={{ color: accent }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </motion.div>
        <motion.div
          className="srch-feat-visual"
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
   Engine Section — Query Pipeline
───────────────────────────────────────────── */
const QUERY_STAGES = [
  {
    s: '01', c: '#06b6d4',
    titleCn: '意图解析',
    handle: 'Intent Parser',
    desc: '先读懂你在问什么：找方法？找领域综述？找对比实验？AI 把模糊的自然语言查询还原成结构化的研究问题。',
    spots: ['研究方向识别', '查询类型分类', '实体抽取'],
    model: 'parser-v4',
  },
  {
    s: '02', c: '#8b5cf6',
    titleCn: '查询扩展',
    handle: 'Query Expander',
    desc: '自动补充同义词、近义术语、跨语言翻译、领域黑话，把"一个问题"扩展成"一组精准匹配条件"。',
    spots: ['同义词扩展', '跨语言匹配', '领域术语补全'],
    model: 'expander-v4',
  },
  {
    s: '03', c: '#10b981',
    titleCn: '语义检索',
    handle: 'Vector Retriever',
    desc: '在百万级学术向量索引上做相似度匹配，不只是看关键词出现，而是看"这篇论文在研究同一个问题吗"。',
    spots: ['向量相似度', '段落级匹配', '多字段融合'],
    model: 'retriever-v4',
  },
];

const META_RANKER = {
  handle: 'Relevance Ranker',
  titleCn: '相关性排序器 · 最终决策者',
  philosophy: '合并三路结果 · 综合考虑相关性、引用影响力、时效性 · 给你一份直接可用的论文列表',
  responsibilities: ['相关性打分', '引用权重叠加', '时效性衰减', 'Top-K 选择'],
};

const CAPABILITIES = [
  { name: '文献识别', color: '#06b6d4', count: 6, sample: ['标题匹配', 'DOI 定位', 'arXiv ID 识别'] },
  { name: '查询理解', color: '#8b5cf6', count: 8, sample: ['意图分类', '实体抽取', '关系识别'] },
  { name: '语义索引', color: '#10b981', count: 7, sample: ['向量相似度', '段落检索', '混合排序'] },
  { name: '引用图谱', color: '#ec4899', count: 5, sample: ['引用关系', '被引追溯', '合作网络'] },
  { name: '作者画像', color: '#f59e0b', count: 4, sample: ['h-index 计算', '研究方向', '合作者网络'] },
  { name: '筛选排序', color: '#3b82f6', count: 6, sample: ['多维筛选', '时效衰减', '影响力加权'] },
];

const TERMINAL_LOG = [
  { ag: '01', c: '#06b6d4', action: 'parse_intent("找医学影像里用 ViT 的新方法") ...', result: 'type=method-domain · entities=[ViT, medical imaging, segmentation]' },
  { ag: '02', c: '#8b5cf6', action: 'expand_query → synonyms + translations ...', result: '12 terms expanded · 3 language variants · 4 domain aliases' },
  { ag: '03', c: '#10b981', action: 'vector_search(corpus=academic_graph, top=500) ...', result: '487 candidates retrieved · 0.64s · building rank' },
  { ag: 'Σ', c: '#3b82f6', action: 'rerank(relevance × citations × recency) · top=20 ...', result: 'final top-20 · 96%/91%/87%/83%/... · 0.8s total' },
];

function EngineSection() {
  return (
    <section id="srch-engine" className="srch-section srch-engine-section">
      <div className="srch-section-inner">
        <div className="srch-section-head">
          <span className="srch-section-eyebrow srch-engine-eyebrow">
            <Cpu size={11} />
            检索引擎 · 它是怎么做到的
          </span>
          <h2>
            不是关键词匹配 · 是 <span className="srch-engine-accent">理解你的研究问题</span>
          </h2>
          <p>
            很多"AI 搜索"其实只是把查询丢给大模型让它列几个论文名。Scholay 不一样：
            多级 Agent 流水线协同工作，先读懂问题、再扩展查询、再语义检索、最后综合排序 ——
            一整套真正可工程化的学术检索系统。
          </p>
        </div>

        {/* ── Part 01 · Agent Pipeline ── */}
        <div className="srch-engine-part">
          <div className="srch-engine-part-head">
            <span className="srch-engine-part-num">01</span>
            <div className="srch-engine-part-title">
              <h3>Agent Pipeline · 三级流水线 + 一个最终排序器</h3>
              <p>
                不是把问题一股脑交给一个大模型 —— 每个阶段专注一个任务，使用不同的专业模型、装载不同的专业能力，
                独立运行后由排序器合成结果。就像真正的检索引擎 —— 每一步都可追溯、可单独优化。
              </p>
            </div>
          </div>

          <div className="srch-stage-grid">
            {QUERY_STAGES.map((a, i) => (
              <motion.div
                key={a.s}
                className="srch-stage-card"
                style={{ '--stg-c': a.c }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <div className="srch-stage-card-glow" aria-hidden />
                <div className="srch-stage-card-head">
                  <div className="srch-stage-card-num">
                    <span>{a.s}</span>
                    <div className="srch-stage-card-num-ring" aria-hidden />
                  </div>
                  <div className="srch-stage-card-id">
                    <div className="srch-stage-card-handle">{a.handle}</div>
                    <div className="srch-stage-card-title">{a.titleCn}</div>
                  </div>
                </div>

                <p className="srch-stage-card-desc">{a.desc}</p>

                <div className="srch-stage-card-spots-lbl">核心能力</div>
                <ul className="srch-stage-card-spots">
                  {a.spots.map(sp => (
                    <li key={sp}>
                      <span className="srch-stage-card-dot" />
                      <span>{sp}</span>
                    </li>
                  ))}
                </ul>

                <div className="srch-stage-card-model">
                  <span className="srch-stage-card-model-lbl">stage</span>
                  <code>{a.model}</code>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            className="srch-meta-agent-card"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.45, delay: 0.25 }}
          >
            <div className="srch-meta-agent-left">
              <div className="srch-meta-agent-av">Σ</div>
              <div>
                <div className="srch-meta-agent-handle">{META_RANKER.handle}</div>
                <div className="srch-meta-agent-title">{META_RANKER.titleCn}</div>
              </div>
            </div>
            <div className="srch-meta-agent-middle">
              <blockquote>{META_RANKER.philosophy}</blockquote>
              <div className="srch-meta-agent-resp">
                {META_RANKER.responsibilities.map(r => (
                  <span key={r} className="srch-meta-agent-resp-chip">{r}</span>
                ))}
              </div>
            </div>
            <div className="srch-meta-agent-flow">
              <span className="srch-meta-flow-in" style={{ color: '#06b6d4' }}>01</span>
              <span className="srch-meta-flow-in" style={{ color: '#8b5cf6' }}>02</span>
              <span className="srch-meta-flow-in" style={{ color: '#10b981' }}>03</span>
              <ChevronRight size={16} />
              <span className="srch-meta-flow-out">Top-K Results</span>
            </div>
          </motion.div>
        </div>

        {/* ── Part 02 · Capabilities ── */}
        <div className="srch-engine-part">
          <div className="srch-engine-part-head">
            <span className="srch-engine-part-num">02</span>
            <div className="srch-engine-part-title">
              <h3>Skills · 可组合的专业检索能力</h3>
              <p>
                检索引擎不只是凭"通用匹配"返回结果 —— 会根据你的查询类型动态组合不同的专业能力。
                目前已积累六大领域共 35+ 项检索技能，按需调用、可单独优化、每月持续扩充。
              </p>
            </div>
          </div>

          <div className="srch-skills-panel">
            <motion.div
              className="srch-skills-stat"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4 }}
            >
              <div className="srch-skills-stat-num">
                35<span className="srch-skills-stat-plus">+</span>
              </div>
              <div className="srch-skills-stat-lbl">项专业检索技能</div>
              <div className="srch-skills-stat-divider" />
              <div className="srch-skills-stat-meta">
                <div><strong>6</strong><span>大能力领域</span></div>
                <div><strong>月度</strong><span>更新节奏</span></div>
                <div><strong>按需</strong><span>动态组合</span></div>
              </div>
              <div className="srch-skills-stat-badge">
                <Sparkles size={11} />
                本月新增 2 项技能
              </div>
            </motion.div>

            <div className="srch-skills-categories">
              {CAPABILITIES.map((cat, i) => (
                <motion.div
                  key={cat.name}
                  className="srch-skill-cat-card"
                  style={{ '--cat-c': cat.color }}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.35, delay: i * 0.06 }}
                >
                  <div className="srch-skill-cat-head">
                    <span className="srch-skill-cat-name">{cat.name}</span>
                    <span className="srch-skill-cat-count">{cat.count} 项</span>
                  </div>
                  <div className="srch-skill-cat-items">
                    {cat.sample.map(s => (
                      <span key={s} className="srch-skill-cat-item">{s}</span>
                    ))}
                    {cat.count > cat.sample.length && (
                      <span className="srch-skill-cat-more">还有 {cat.count - cat.sample.length} 项</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Part 03 · Live Pipeline ── */}
        <div className="srch-engine-part">
          <div className="srch-engine-part-head">
            <span className="srch-engine-part-num">03</span>
            <div className="srch-engine-part-title">
              <h3>Live Pipeline · 一次查询背后发生了什么</h3>
              <p>
                别家的"AI 搜索"是一个黑盒 —— 你输入问题、它返回结果，出了差错谁也说不清。
                Scholay 每次检索都会把完整的执行轨迹留痕：哪个阶段耗时多少、检索了多少候选、为什么这篇排在前面。
                透明、可追溯、可调优。
              </p>
            </div>
          </div>

          <div className="srch-tools-terminal">
            <WindowChrome compact url="scholay · search-runtime · live">
              <div className="srch-tools-log">
                {TERMINAL_LOG.map((line, i) => (
                  <motion.div
                    key={i}
                    className="srch-tools-log-row"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-30px' }}
                    transition={{ duration: 0.3, delay: i * 0.15 }}
                  >
                    <span className="srch-tools-log-ag" style={{ color: line.c, borderColor: line.c }}>{line.ag}</span>
                    <div className="srch-tools-log-body">
                      <div className="srch-tools-log-action">
                        <span className="srch-tools-log-prompt">❯</span>
                        {line.action}
                      </div>
                      <div className="srch-tools-log-result">
                        <span className="srch-tools-log-arrow">→</span>
                        {line.result}
                      </div>
                    </div>
                  </motion.div>
                ))}
                <div className="srch-tools-log-cursor">
                  <span className="srch-tools-log-ag" style={{ color: '#3b82f6', borderColor: '#3b82f6' }}>Σ</span>
                  <span className="srch-tools-log-prompt">❯</span>
                  <span className="srch-tools-log-blink">_</span>
                </div>
              </div>
            </WindowChrome>
          </div>
        </div>

        <motion.div
          className="srch-engine-tagline"
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5 }}
        >
          <Sparkles size={14} />
          <span>这就是我们理解的 <strong>下一代学术检索</strong></span>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   Premium FAQ
───────────────────────────────────────────── */
function PremiumFAQ({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="srch-faq-list">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <motion.div
            key={i}
            className={`srch-faq-item ${isOpen ? 'open' : ''}`}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: i * 0.04 }}
          >
            <button
              className="srch-faq-trigger"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
            >
              <span className="srch-faq-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="srch-faq-q">{item.q}</span>
              <span className="srch-faq-chev"><ChevronDown size={18} /></span>
            </button>
            <div className="srch-faq-panel" role="region">
              <div className="srch-faq-panel-inner">
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
export default function SearchFeaturePage() {
  const navigate = useNavigate();

  return (
    <div className="feat-page feat-search-page srch-v2">
      <SEO
        title="AI 学术搜索 - Scholay | 2亿+ 论文智能检索引擎"
        description="Scholay 将大语言模型与全球主流学术图谱深度融合，支持直接检索与 AI 智能语义检索双模式，覆盖 19 个学科、2 亿+ 学术记录，让文献发现前所未有的高效。"
        keywords="AI学术搜索,论文检索,智能文献搜索,语义检索,学术数据库,文献综述,引用网络"
        canonical="/features/search"
      />

      <FeatureNav ctaText="开始搜索" ctaTo="/" accentColor={ACCENT} />

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="srch-hero">
        <div className="srch-hero-bg" aria-hidden>
          <div className="srch-hero-beam srch-hero-beam-1" />
          <div className="srch-hero-beam srch-hero-beam-2" />
          <div className="srch-hero-grid" />
        </div>

        <div className="srch-hero-inner">
          <motion.div
            className="srch-hero-copy"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="srch-hero-eyebrow">
              <Sparkles size={12} />
              AI ACADEMIC SEARCH
            </span>
            <h1 className="srch-hero-h1">
              在 2 亿篇论文中，<br />
              精准找到 <span className="srch-hero-grad">你要的那一篇</span>
            </h1>
            <p className="srch-hero-lead">
              大语言模型 × 全球主流学术图谱。支持关键词直接检索与自然语言 AI 检索双模式，
              覆盖 19 个学科、80+ 种语言 —— 从"知道一个模糊想法"到"找到那篇关键论文"，通常不到 10 秒。
            </p>
            <div className="srch-hero-ctas">
              <button className="srch-btn srch-btn-primary" onClick={() => navigate('/')}>
                立即开始搜索
                <ArrowRight size={15} />
              </button>
              <a className="srch-btn srch-btn-ghost" href="#srch-engine">
                了解工作原理
                <ChevronDown size={14} />
              </a>
            </div>

            <div className="srch-hero-trust-strip">
              <div className="srch-hero-trust-head">
                <CheckCircle2 size={14} />
                <span>研究者都在用的学术搜索引擎</span>
              </div>
              <div className="srch-hero-trust-chips">
                <span className="srch-hero-sec-chip">
                  <Database size={11} />
                  2 亿+ 论文
                </span>
                <span className="srch-hero-sec-chip">
                  <Layers size={11} />
                  19 个学科
                </span>
                <span className="srch-hero-sec-chip">
                  <Globe size={11} />
                  跨语言检索
                </span>
              </div>
            </div>

            <div className="srch-hero-meta">
              <LiveCounter />
              <span className="srch-hero-sep" />
              <span>基础搜索免费 · 无需注册</span>
            </div>
          </motion.div>

          <motion.div
            className="srch-hero-visual"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroSearchMockup />
          </motion.div>
        </div>

        <div className="srch-hero-trust">
          <p className="srch-hero-trust-label">数据实时接入以下学术索引与数据库</p>
          <SourceTicker />
        </div>
      </section>

      <main className="feat-main srch-main">

        {/* ═══════════════ METRICS BAR ═══════════════ */}
        <section className="srch-metrics">
          <div className="srch-metrics-inner">
            {[
              { num: '2亿', unit: '+', label: '学术论文实时索引' },
              { num: '< 10', unit: '秒', label: '从提问到拿到结果' },
              { num: '19', unit: '', label: '学科领域全覆盖' },
              { num: '99.9', unit: '%', label: '服务可用率' },
            ].map((m, i) => (
              <motion.div
                key={i}
                className="srch-metric"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <div className="srch-metric-num">
                  {m.num}
                  {m.unit && <span className="srch-metric-unit">{m.unit}</span>}
                </div>
                <div className="srch-metric-label">{m.label}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══════════════ ENGINE · Multi-Stage 系统 ═══════════════ */}
        <EngineSection />

        {/* ═══════════════ FEATURE ROW — DUAL MODE ═══════════════ */}
        <FeatureRow
          id="srch-modes"
          eyebrow="两种检索模式"
          title="精确关键词 + AI 语义理解 · 双管齐下"
          body="无论你是已经锁定目标论文想快速找到，还是只有一个模糊想法需要发散探索，Scholay 都能胜任。两种模式共享同一套结果排序，让你可以自由切换、自由组合。"
          bullets={[
            '直接检索：关键词 / 标题 / 作者 / DOI 精确匹配',
            'AI 智能检索：用自然语言描述研究问题',
            '双模式共享统一的相关性排序',
            '每次查询都可追溯、可调整、可复现',
          ]}
          mockup={<DualModeMockup />}
          accent="#06b6d4"
        />

        {/* ═══════════════ FEATURE ROW — COVERAGE ═══════════════ */}
        <FeatureRow
          id="srch-coverage"
          eyebrow="文献覆盖"
          title="从计算机科学到人文社科 · 每个学科都不遗漏"
          body="整合全球多个主流学术图谱，实时接入 2 亿+ 学术记录，同时补充 arXiv、PubMed、IEEE、ACM 等主流索引。数据每日同步 —— 新发表的论文通常几小时内就能检索到。"
          bullets={[
            '覆盖 19 大学科领域，横跨自然 / 工程 / 医学 / 社科 / 人文',
            '接入 arXiv / PubMed / IEEE / ACM 等主流索引',
            '实时同步，新论文几小时内可检索',
            '80+ 种语言，中英日德法俄等全面支持',
          ]}
          mockup={<CoverageMockup />}
          reversed
          accent="#8b5cf6"
        />

        {/* ═══════════════ FEATURE ROW — FILTERS ═══════════════ */}
        <FeatureRow
          id="srch-filters"
          eyebrow="高级筛选"
          title={'多维度筛选 · 从"大海捞针"到"一眼锁定"'}
          body="248 条结果太多？用筛选把它收敛到 34 条。按年份、引用量、学科领域、开放获取状态精细过滤，组合条件可以随时保存、随时复用。让每一次检索都能落地到真正要读的那几篇。"
          bullets={[
            '发表年份区间滑块，支持开放上下限',
            '被引次数阈值：≥10 / ≥50 / ≥100 / ≥500 / ≥1000',
            '学科领域多选，19 个领域可任意组合',
            '一键筛选开放获取论文，免费获取 PDF 全文',
          ]}
          mockup={<FilterMockup />}
          accent="#10b981"
        />

        {/* ═══════════════ FEATURE ROW — CITATION NETWORK ═══════════════ */}
        <FeatureRow
          id="srch-citation"
          eyebrow="引用网络"
          title="从一篇论文，看清整个研究脉络"
          body="一篇核心论文背后，是整个研究主题的上下游。我们帮你把引用关系、被引用关系、相关合作者串成一张网 —— 你可以顺着引用链追溯源头，也可以顺着被引关系看它影响了哪些后续工作。"
          bullets={[
            '可视化引用关系网络，清晰呈现论文上下游',
            '一键查看参考文献与被引用论文',
            '识别领域内的高引种子文献',
            '跟踪合作者网络与研究方向迁移',
          ]}
          mockup={<CitationMockup />}
          reversed
          accent="#ec4899"
        />

        {/* ═══════════════ FAQ ═══════════════ */}
        <section id="srch-faq" className="srch-section srch-faq-section">
          <div className="srch-section-inner">
            <div className="srch-section-head">
              <span className="srch-section-eyebrow">常见问题</span>
              <h2>你可能想知道的</h2>
              <p>关于 AI 学术检索、数据来源、筛选与导出的常见疑问 —— 一次说清。</p>
            </div>
            <PremiumFAQ items={FAQ_ITEMS} />
          </div>
        </section>

        <FeatureCTA
          title="开始你的学术探索之旅"
          desc="免费、无需注册即可使用基础搜索。立即在 2 亿篇论文中，找到你要的那一篇。"
          ctaText="立即搜索"
          ctaTo="/"
          accentColor={ACCENT}
        />

      </main>
      <FeatureJumpNav sections={JUMP_SECTIONS} accentColor={ACCENT} />
    </div>
  );
}
