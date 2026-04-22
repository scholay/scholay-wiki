/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ----------------------------------------------------------------------------
 * Pricing — Stripe/Vercel style redesign, mirroring /features/peer-review
 *
 * 当前产品处于开放测试阶段：所有功能限时免费，未来会推出付费方案。
 * 页面结构：
 *   Hero → Metrics → Feature Rows → Why Free → Roadmap → Future Plans →
 *   Commitments → FAQ → CTA
 * ============================================================================
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Sparkles, CheckCircle2, ChevronDown, Lock,
  Search, BrainCircuit, Code2,
  Gift, Heart, Rocket, Users, TrendingUp, ShieldCheck,
  Clock, Crown, Zap, BookOpen, Database, FileText,
} from 'lucide-react';
import { FeatureNav, FeatureCTA, FeatureJumpNav, SEO } from './features/FeaturePageComponents';
import './styles/Pricing.css';

const ACCENT = '#10b981';

const JUMP_SECTIONS = [
  { id: 'pc-features', label: '当前功能' },
  { id: 'pc-why-free', label: '为什么免费' },
  { id: 'pc-roadmap', label: '未来规划' },
  { id: 'pc-plans', label: '付费路线' },
  { id: 'pc-faq', label: '常见问题' },
];

const FAQ_ITEMS = [
  {
    q: '现在使用真的完全免费吗？',
    a: '是的，注册即可使用全部功能，包括学术搜索、AI 论文分析、AI 智能审稿、AI 学术聊天以及 LaTeX 在线编辑器。不需要订阅、不需要绑定银行卡，也不存在任何隐藏收费项。',
  },
  {
    q: '未来什么时候开始收费？',
    a: '暂未确定具体时间。我们会在功能打磨成熟、服务体验稳定后再考虑推出付费方案。任何价格相关的变更都会提前至少 30 天通过站内消息与邮件通知，绝不会出现未告知就收费的情况。',
  },
  {
    q: '收费之后，免费功能会不会被突然关闭？',
    a: '不会。我们承诺未来永远保留一个可用、够用的免费版本，核心的学术搜索、AI 分析与基础审稿能力会始终对所有用户开放。付费方案只会在此之上提供更高的使用额度与进阶能力。',
  },
  {
    q: '未来的付费方案大概是什么样？',
    a: '我们倾向「免费基础 + 进阶订阅」模式：基础功能永久免费；高强度使用者、团队与机构可以通过订阅获得更大的 AI 调用额度、更强的模型能力、团队协作与 API 接入等进阶能力。具体方案与价格会在正式推出前公布。',
  },
  {
    q: '我的论文和对话数据归谁所有？',
    a: '永远归您所有。您上传的论文、与 AI 的对话内容、个人笔记都只属于您，我们绝不会将这些数据用于训练任何 AI 模型。您也可以随时在账户设置中一键删除全部数据。',
  },
  {
    q: '为什么选择在这个阶段免费开放？',
    a: '我们希望学术工具是降低门槛而不是制造门槛。当前阶段免费开放，是为了让每一位学生、研究者、科研工作者都能平等地使用到成熟的 AI 学术工具，不被价格和订阅门槛隔离在外。',
  },
  {
    q: '可以邀请团队成员或同学一起使用吗？',
    a: '当然欢迎。每位用户独立注册即可使用全部功能，当前没有任何人数限制。完整的团队协作与共享工作区能力正在规划中，会在后续版本与付费方案中同步推出。',
  },
  {
    q: '怎样获取产品最新进展？',
    a: '注册账号即可第一时间获取更新通知。新功能上线、路线图更新与重要变更，都会通过站内消息与邮件送达。您也可以随时在产品内向我们提交反馈与建议。',
  },
];

/* ─────────────────────────────────────────────
   Primitives
───────────────────────────────────────────── */

function WindowChrome({ url, children, className = '' }: { url?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`pc-window ${className}`}>
      <div className="pc-window-bar">
        <div className="pc-window-dots">
          <span />
          <span />
          <span />
        </div>
        {url && (
          <div className="pc-window-url">
            <Lock size={10} />
            <span>{url}</span>
          </div>
        )}
        <div className="pc-window-spacer" />
      </div>
      <div className="pc-window-body">{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Hero mockup — a billing-style card showing ¥0
───────────────────────────────────────────── */
function HeroPricingMockup() {
  return (
    <div className="pc-hero-mockup">
      <WindowChrome url="scholay.ai/pricing">
        <div className="pc-hm-wrap">
          <div className="pc-hm-head">
            <div>
              <div className="pc-hm-eyebrow">SCHOLAY · 完整套件</div>
              <div className="pc-hm-title">全功能 · 限时免费</div>
            </div>
            <span className="pc-hm-badge">FREE</span>
          </div>

          <div className="pc-hm-price">
            <span className="pc-hm-currency">¥</span>
            <span className="pc-hm-amount">0</span>
            <span className="pc-hm-period">/ 用户</span>
          </div>

          <div className="pc-hm-features">
            {[
              '海量学术文献检索',
              'AI 论文分析 · 审稿 · 聊天',
              'LaTeX 在线编辑器',
              '无订阅门槛 · 注册即用',
            ].map((f, i) => (
              <div key={i} className="pc-hm-feat">
                <CheckCircle2 size={14} className="pc-hm-feat-icon" />
                <span>{f}</span>
              </div>
            ))}
          </div>

          <div className="pc-hm-foot">
            <div className="pc-hm-foot-l">
              <span className="pc-hm-dot" />
              <span>服务稳定运行中</span>
            </div>
            <div className="pc-hm-foot-r">v1.0</div>
          </div>
        </div>
      </WindowChrome>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Feature row mockups
───────────────────────────────────────────── */
function SearchMockup() {
  return (
    <WindowChrome url="scholay.ai/search" className="pc-row-window">
      <div className="pc-search-mock">
        <div className="pc-search-bar">
          <Search size={13} />
          <span>attention is all you need</span>
          <span className="pc-search-kbd">↵</span>
        </div>
        <div className="pc-search-results">
          {[
            { t: 'Attention Is All You Need', a: 'Vaswani et al.', v: 'NeurIPS 2017', c: '108,420' },
            { t: 'BERT: Pre-training of Deep Bidirectional Transformers', a: 'Devlin et al.', v: 'NAACL 2019', c: '85,120' },
            { t: 'Language Models are Few-Shot Learners (GPT-3)', a: 'Brown et al.', v: 'NeurIPS 2020', c: '32,440' },
          ].map((r, i) => (
            <div key={i} className="pc-search-item">
              <div className="pc-search-t">{r.t}</div>
              <div className="pc-search-m">
                <span>{r.a}</span>
                <span>·</span>
                <span>{r.v}</span>
                <span className="pc-search-cites">{r.c} cites</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </WindowChrome>
  );
}

function AnalysisMockup() {
  return (
    <WindowChrome url="scholay.ai/analysis" className="pc-row-window">
      <div className="pc-ana-mock">
        <div className="pc-ana-head">
          <FileText size={13} />
          <span>正在分析 · A Vision Transformer Approach...</span>
        </div>
        <div className="pc-ana-stream">
          <div className="pc-ana-line">
            <span className="pc-ana-bullet" />
            <span>识别研究领域：<b>计算机视觉 · 医学图像</b></span>
          </div>
          <div className="pc-ana-line">
            <span className="pc-ana-bullet" />
            <span>提炼核心贡献：提出一种新的视觉 Transformer 结构...</span>
          </div>
          <div className="pc-ana-line">
            <span className="pc-ana-bullet" />
            <span>关键方法：<b>patch embedding</b>, <b>multi-head attention</b>, <b>skip connection</b></span>
          </div>
          <div className="pc-ana-line pc-ana-line-typing">
            <span className="pc-ana-bullet pc-ana-bullet-active" />
            <span>实验设置：4 个公开数据集，5 个基线模型<span className="pc-ana-caret" /></span>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

function ReviewMockup() {
  return (
    <WindowChrome url="scholay.ai/peer-review" className="pc-row-window">
      <div className="pc-rev-mock">
        <div className="pc-rev-scores">
          {[
            { k: '原创性', v: 82 },
            { k: '方法论', v: 75 },
            { k: '清晰度', v: 88 },
            { k: '重要性', v: 71 },
          ].map((s) => (
            <div key={s.k} className="pc-rev-score">
              <div className="pc-rev-score-top">
                <span>{s.k}</span>
                <strong>{s.v}</strong>
              </div>
              <div className="pc-rev-score-bar">
                <div className="pc-rev-score-fill" style={{ width: `${s.v}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="pc-rev-decision">
          <span className="pc-rev-pill pc-rev-pill-minor">Minor Revision</span>
          <span className="pc-rev-tip">3 位审稿人 · 1 位主编 · 共识 78%</span>
        </div>
      </div>
    </WindowChrome>
  );
}

function LatexMockup() {
  const tokens: Array<{ t: string; c?: string }> = [
    { t: '\\documentclass', c: 'kw' }, { t: '{article}' }, { t: '\n' },
    { t: '\\usepackage', c: 'kw' }, { t: '{amsmath}' }, { t: '\n' },
    { t: '\\begin', c: 'kw' }, { t: '{document}' }, { t: '\n' },
    { t: '\\title', c: 'kw' }, { t: '{Scholay}' }, { t: '\n' },
    { t: '\\maketitle', c: 'kw' }, { t: '\n\n' },
    { t: 'E = mc^2', c: 'math' }, { t: '\n' },
    { t: '\\end', c: 'kw' }, { t: '{document}' },
  ];
  return (
    <WindowChrome url="scholay.ai/latex" className="pc-row-window">
      <div className="pc-tex-mock">
        <div className="pc-tex-editor">
          <div className="pc-tex-gutter">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <pre className="pc-tex-code">
            {tokens.map((tk, i) => (
              <span key={i} className={tk.c ? `pc-tex-${tk.c}` : ''}>{tk.t}</span>
            ))}
          </pre>
        </div>
        <div className="pc-tex-preview">
          <div className="pc-tex-pv-title">Scholay</div>
          <div className="pc-tex-pv-eq">E = mc²</div>
          <div className="pc-tex-pv-hint">实时预览 · 0 延迟</div>
        </div>
      </div>
    </WindowChrome>
  );
}

/* ─────────────────────────────────────────────
   Feature Row
───────────────────────────────────────────── */
type FeatureRowProps = {
  id?: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  mockup: React.ReactNode;
  reversed?: boolean;
  accent?: string;
};

function FeatureRow({ id, eyebrow, title, body, bullets, mockup, reversed, accent = ACCENT }: FeatureRowProps) {
  return (
    <section id={id} className={`pc-feat-row ${reversed ? 'pc-feat-reversed' : ''}`}>
      <div className="pc-feat-inner">
        <motion.div
          className="pc-feat-copy"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
        >
          <span
            className="pc-feat-eyebrow"
            style={{ color: accent, background: `${accent}14`, borderColor: `${accent}30` }}
          >
            {eyebrow}
          </span>
          <h2 className="pc-feat-title">{title}</h2>
          <p className="pc-feat-body">{body}</p>
          <ul className="pc-feat-bullets">
            {bullets.map((b, i) => (
              <li key={i}>
                <CheckCircle2 size={14} style={{ color: accent }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </motion.div>
        <motion.div
          className="pc-feat-visual"
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
   FAQ (accordion, adapted from peer-review)
───────────────────────────────────────────── */
function PricingFAQ({ items }: { items: typeof FAQ_ITEMS }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="pc-faq-list">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <motion.div
            key={i}
            className={`pc-faq-item ${isOpen ? 'open' : ''}`}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: i * 0.04 }}
          >
            <button
              className="pc-faq-trigger"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
            >
              <span className="pc-faq-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="pc-faq-q">{item.q}</span>
              <span className="pc-faq-chev"><ChevronDown size={18} /></span>
            </button>
            <div className="pc-faq-panel" role="region">
              <div className="pc-faq-panel-inner">
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
   Why Free — three reasons panel
───────────────────────────────────────────── */
const WHY_FREE_REASONS = [
  {
    icon: <Rocket size={22} />,
    title: '让工具先好用起来',
    desc: '我们希望每一位用户打开 Scholay 的第一感受是「这个很好用」，而不是「先付钱再说」。把产品体验打磨到位，才是我们当前唯一的目标。',
  },
  {
    icon: <Heart size={22} />,
    title: '重视每一条反馈',
    desc: '您的每一次使用都在帮我们把功能打磨得更好。降低门槛、让更多研究者真实地用起来，我们才能持续优化、让工具越来越贴近科研场景。',
  },
  {
    icon: <Users size={22} />,
    title: '让学术工具更平等',
    desc: '学生、独立研究者、科研新人也应该用上一流的 AI 学术工具。我们相信，好的工具不应该被价格和订阅门槛挡在学术世界之外。',
  },
];

/* ─────────────────────────────────────────────
   Roadmap — upcoming features
───────────────────────────────────────────── */
const ROADMAP_ITEMS = [
  {
    when: '近期',
    icon: <BrainCircuit size={18} />,
    title: '更强大的 AI 模型',
    desc: '持续接入更先进的大语言模型，并支持按任务切换 —— 轻量查询更快速，复杂分析更深入。',
    tag: '研发中',
  },
  {
    when: '近期',
    icon: <Users size={18} />,
    title: '团队协作与共享',
    desc: '多人共享文献库、协作对话、团队审稿工作流 —— 让课题组、实验室、研究团队的科研协作更顺畅。',
    tag: '计划中',
  },
  {
    when: '中期',
    icon: <Database size={18} />,
    title: '个人知识库',
    desc: '沉淀您读过的论文、做过的笔记、整理的想法，让 AI 基于您的研究积累回答问题、辅助写作。',
    tag: '设计中',
  },
  {
    when: '后续',
    icon: <Code2 size={18} />,
    title: 'API 开放接入',
    desc: '开放学术搜索、AI 分析、审稿等核心能力的 API，让您把 Scholay 的能力嵌入到自己的研究工作流中。',
    tag: '规划中',
  },
];

/* ─────────────────────────────────────────────
   Future Plans — teased tiers (no prices yet)
───────────────────────────────────────────── */
const FUTURE_PLANS = [
  {
    key: 'free',
    name: 'Free',
    tagline: '永远免费',
    price: '¥0',
    period: '/月',
    perks: [
      '基础学术搜索',
      '日常 AI 分析 · 聊天',
      'LaTeX 在线编辑器',
      '合理使用额度',
    ],
    badge: '永久保留',
    highlight: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    tagline: '高强度用户',
    price: '定价未定',
    period: '敬请期待',
    perks: [
      '更大的 AI 调用额度',
      '优先使用顶级模型',
      '更高级的审稿能力',
      '更大的文件 / 知识库容量',
    ],
    badge: '设计中',
    highlight: true,
  },
  {
    key: 'team',
    name: 'Team',
    tagline: '课题组 · 团队',
    price: '定价未定',
    period: '敬请期待',
    perks: [
      '团队工作区 · 共享文献库',
      '成员权限与协作管理',
      'API 接入与定制集成',
      '专属客服与 SLA',
    ],
    badge: '规划中',
    highlight: false,
  },
];

/* ─────────────────────────────────────────────
   Commitments
───────────────────────────────────────────── */
const COMMITMENTS = [
  {
    icon: <Crown size={16} />,
    title: '永久保留免费版本',
    desc: '未来即使推出付费方案，我们也会始终保留一个可用、够用的免费版本，让每一位用户都能继续使用核心功能。',
  },
  {
    icon: <ShieldCheck size={16} />,
    title: '数据所有权归您',
    desc: '您上传的论文、对话内容、个人笔记永远属于您。我们绝不用于训练任何 AI 模型，您可以随时一键删除全部数据。',
  },
  {
    icon: <Clock size={16} />,
    title: '变更提前 30 天通知',
    desc: '任何价格或功能调整都会提前至少 30 天通过站内消息与邮件送达，给您充足的时间了解变化、做出选择。',
  },
  {
    icon: <Zap size={16} />,
    title: '订阅透明 · 随时可退',
    desc: '未来的付费方案一定是清晰的订阅模式 —— 没有隐藏条款、没有自动续费陷阱，订阅后可以随时取消。',
  },
];

/* ─────────────────────────────────────────────
   Main page
───────────────────────────────────────────── */
const Pricing: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="feat-page pc-page">
      <SEO
        title="定价方案 - Scholay | 全功能限时免费"
        description="Scholay 学术搜索、AI 论文分析、AI 智能审稿、AI 学术聊天、LaTeX 在线编辑器全部限时免费开放。了解我们未来的付费方案与用户承诺。"
        keywords="Scholay定价,学术搜索免费,AI论文工具,免费学术工具,Scholay订阅,学术工具价格"
        canonical="/pricing"
      />

      <FeatureNav ctaText="立即使用" ctaTo="/" accentColor={ACCENT} />

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="pc-hero">
        <div className="pc-hero-bg" aria-hidden>
          <div className="pc-hero-beam pc-hero-beam-1" />
          <div className="pc-hero-beam pc-hero-beam-2" />
          <div className="pc-hero-grid" />
        </div>

        <div className="pc-hero-inner">
          <motion.div
            className="pc-hero-copy"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="pc-hero-eyebrow">
              <Sparkles size={12} />
              全功能免费 · 注册即用
            </span>
            <h1 className="pc-hero-h1">
              所有功能 <br />
              <span className="pc-hero-grad">限时免费</span> 开放
            </h1>
            <p className="pc-hero-lead">
              学术搜索、AI 论文分析、AI 智能审稿、AI 学术聊天、LaTeX 在线编辑器 ——
              Scholay 的全部核心能力现在都对所有用户免费开放。无订阅门槛、无需绑卡、注册即用。
            </p>
            <div className="pc-hero-ctas">
              <button className="pc-btn pc-btn-primary" onClick={() => navigate('/')}>
                立即免费使用
                <ArrowRight size={15} />
              </button>
              <a className="pc-btn pc-btn-ghost" href="#pc-plans">
                了解未来方案
                <ChevronDown size={14} />
              </a>
            </div>

            <div className="pc-hero-chips">
              <span className="pc-hero-chip">
                <Gift size={11} />
                无订阅门槛
              </span>
              <span className="pc-hero-chip">
                <CheckCircle2 size={11} />
                全功能开放
              </span>
              <span className="pc-hero-chip">
                <ShieldCheck size={11} />
                数据归您所有
              </span>
            </div>

            <div className="pc-hero-meta">
              <span className="pc-live-inline">
                <span className="pc-live-dot" />
                服务稳定运行
              </span>
              <span className="pc-hero-sep" />
              <span>随时可用 · 7×24 小时</span>
            </div>
          </motion.div>

          <motion.div
            className="pc-hero-visual"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroPricingMockup />
          </motion.div>
        </div>
      </section>

      <main className="feat-main pc-main">

        {/* ═══════════════ METRICS BAR ═══════════════ */}
        <section className="pc-metrics">
          <div className="pc-metrics-inner">
            {[
              { num: '¥ 0', unit: '', label: '注册与使用费用' },
              { num: '100', unit: '%', label: '核心功能免费开放' },
              { num: '0', unit: '', label: '订阅门槛 · 无需绑卡' },
              { num: '24', unit: '/7', label: '全天候稳定运行' },
            ].map((m, i) => (
              <motion.div
                key={i}
                className="pc-metric"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <div className="pc-metric-num">
                  {m.num}
                  {m.unit && <span className="pc-metric-unit">{m.unit}</span>}
                </div>
                <div className="pc-metric-label">{m.label}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══════════════ FEATURE ROWS ═══════════════ */}
        <section id="pc-features" className="pc-section pc-section-head-wrap">
          <div className="pc-section-inner">
            <div className="pc-section-head">
              <span className="pc-section-eyebrow">免费开放的功能</span>
              <h2>从检索到写作 · 覆盖学术研究全流程</h2>
              <p>从文献发现到论文打磨，Scholay 的每一项能力现在都对所有用户免费开放，帮您更从容地完成每一步研究。</p>
            </div>
          </div>
        </section>

        <FeatureRow
          eyebrow="学术搜索"
          title="海量学术文献 · 语义级检索"
          body="整合全球多个主流学术数据库，覆盖 2 亿+ 篇学术文献。支持关键词匹配与自然语言语义检索，帮您快速定位相关论文、作者与研究脉络。"
          bullets={[
            '2 亿+ 篇学术文献 · 覆盖 19 个学科',
            '语义级检索 · 理解您的研究意图',
            '引用网络 · 一键追踪研究源流',
            '多维度过滤：年份 · 领域 · 期刊 · 作者',
          ]}
          mockup={<SearchMockup />}
        />

        <FeatureRow
          eyebrow="AI 智能分析"
          title="把一篇论文读懂 · 只需几秒"
          body="基于大语言模型对论文进行结构化解读 —— 自动提炼核心贡献、关键方法、实验设置、优势与局限。从摘要到结论一次讲透。"
          bullets={[
            '核心贡献 · 关键方法 · 一键提炼',
            '实验与结论的结构化总结',
            '潜在局限与值得追问的点',
            '支持长文、复杂公式与图表描述',
          ]}
          mockup={<AnalysisMockup />}
          reversed
          accent="#06b6d4"
        />

        <FeatureRow
          eyebrow="AI 智能审稿"
          title="投稿前 · 先让 AI 审稿人把关"
          body="三位 AI 审稿人从不同视角独立评审，再由主编合成最终意见。五维度打分 · 问题分级 · 修改建议 —— 一份期刊级审稿报告。"
          bullets={[
            '三位审稿人 + 一位主编的多 Agent 系统',
            '原创性 · 方法论 · 清晰度 · 重要性 · 可复现性',
            '问题按严重 / 一般 / 轻微分级，附修改建议',
            'Word / PDF 一键导出报告',
          ]}
          mockup={<ReviewMockup />}
          accent="#8b5cf6"
        />

        <FeatureRow
          eyebrow="LaTeX 编辑器"
          title="在线 LaTeX · 实时预览 · 0 配置"
          body="不用再折腾本地环境。打开浏览器就能写 LaTeX，编辑区与预览区并排，公式、图表、参考文献即写即见。支持模板导入与格式化。"
          bullets={[
            '实时预览 · 零延迟反馈',
            '常用模板内置 · 开箱即用',
            '公式、图表、参考文献全支持',
            'PDF 导出 · 与 AI 写作功能打通',
          ]}
          mockup={<LatexMockup />}
          reversed
          accent="#f59e0b"
        />

        {/* ═══════════════ WHY FREE ═══════════════ */}
        <section id="pc-why-free" className="pc-section">
          <div className="pc-section-inner">
            <div className="pc-section-head">
              <span className="pc-section-eyebrow">我们的初衷</span>
              <h2>为什么 Scholay 选择免费开放</h2>
              <p>好的学术工具应该让每一位研究者都能平等地用上。这是我们选择免费开放的初衷。</p>
            </div>

            <div className="pc-reasons">
              {WHY_FREE_REASONS.map((r, i) => (
                <motion.div
                  key={i}
                  className="pc-reason"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                >
                  <div className="pc-reason-icon">{r.icon}</div>
                  <h3>{r.title}</h3>
                  <p>{r.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ ROADMAP ═══════════════ */}
        <section id="pc-roadmap" className="pc-section pc-section-dark">
          <div className="pc-section-inner">
            <div className="pc-section-head">
              <span className="pc-section-eyebrow">
                <TrendingUp size={11} />
                产品路线图
              </span>
              <h2>接下来即将上线的功能</h2>
              <p>我们在持续打磨产品。以下是已经在研发路径上的重点能力，会陆续与您见面。</p>
            </div>

            <div className="pc-roadmap">
              {ROADMAP_ITEMS.map((item, i) => (
                <motion.div
                  key={i}
                  className="pc-roadmap-card"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.5, delay: i * 0.06 }}
                >
                  <div className="pc-roadmap-head">
                    <span className="pc-roadmap-when">{item.when}</span>
                    <span className="pc-roadmap-tag">{item.tag}</span>
                  </div>
                  <div className="pc-roadmap-icon">{item.icon}</div>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ FUTURE PLANS ═══════════════ */}
        <section id="pc-plans" className="pc-section">
          <div className="pc-section-inner">
            <div className="pc-section-head">
              <span className="pc-section-eyebrow">未来付费方案</span>
              <h2>我们正在设计的订阅路线</h2>
              <p>
                以下是未来可能的方案分层，具体功能与价格仍在设计中。
                提前展示是为了让您了解我们的规划，方便您评估长期使用。
              </p>
            </div>

            <div className="pc-plans">
              {FUTURE_PLANS.map((p) => (
                <motion.div
                  key={p.key}
                  className={`pc-plan ${p.highlight ? 'pc-plan-highlight' : ''}`}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.5 }}
                >
                  {p.highlight && <span className="pc-plan-ribbon">热门关注</span>}
                  <div className="pc-plan-head">
                    <span className="pc-plan-name">{p.name}</span>
                    <span className="pc-plan-tagline">{p.tagline}</span>
                  </div>
                  <div className="pc-plan-price">
                    <span className="pc-plan-amount">{p.price}</span>
                    <span className="pc-plan-period">{p.period}</span>
                  </div>
                  <ul className="pc-plan-perks">
                    {p.perks.map((perk, i) => (
                      <li key={i}>
                        <CheckCircle2 size={13} />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pc-plan-badge">{p.badge}</div>
                </motion.div>
              ))}
            </div>

            <p className="pc-plans-disclaimer">
              <BookOpen size={13} />
              <span>
                以上方案仅供参考，最终定价与功能组合会在正式推出前公布。
                在付费方案上线前，所有功能继续对所有用户免费开放。
              </span>
            </p>
          </div>
        </section>

        {/* ═══════════════ COMMITMENTS ═══════════════ */}
        <section className="pc-section pc-section-commit">
          <div className="pc-section-inner">
            <div className="pc-section-head">
              <span className="pc-section-eyebrow">我们的承诺</span>
              <h2>给每一位用户的四条承诺</h2>
              <p>清晰、具体、可执行 —— 这是我们对所有 Scholay 用户的承诺，写在这里，也写在产品里。</p>
            </div>

            <div className="pc-commitments">
              {COMMITMENTS.map((c, i) => (
                <motion.div
                  key={i}
                  className="pc-commit"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.45, delay: i * 0.06 }}
                >
                  <div className="pc-commit-icon">{c.icon}</div>
                  <div className="pc-commit-text">
                    <h3>{c.title}</h3>
                    <p>{c.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ FAQ ═══════════════ */}
        <section id="pc-faq" className="pc-section pc-faq-section">
          <div className="pc-section-inner">
            <div className="pc-section-head">
              <span className="pc-section-eyebrow">常见问题</span>
              <h2>您可能关心的问题</h2>
              <p>关于免费使用、未来方案与数据权益 —— 这些是用户最常问到的问题，在这里一次讲清楚。</p>
            </div>
            <PricingFAQ items={FAQ_ITEMS} />
          </div>
        </section>

        <FeatureCTA
          title="现在就开始 · 全功能免费使用"
          desc="无需付费、无需订阅，注册即可使用 Scholay 的全部学术能力。让 AI 成为您的研究助手，从现在开始。"
          ctaText="立即免费使用"
          ctaTo="/"
          accentColor={ACCENT}
        />

      </main>
      <FeatureJumpNav sections={JUMP_SECTIONS} accentColor={ACCENT} />
    </div>
  );
};

export default Pricing;
