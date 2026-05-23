/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ----------------------------------------------------------------------------
 * FeaturesOverview — 全站功能总览宣传页（路由：/features）
 *
 * 风格对齐 /pricing 与 /features/peer-review：dark premium + 单色强调 + 卡片模块化。
 * 结构：
 *   Hero → Metrics → Feature Rows (5) → Value Props → Scenarios → FAQ → CTA
 * ============================================================================
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Sparkles, CheckCircle2, ChevronDown, Lock,
  Search, BrainCircuit, MessageSquare, FileCheck2, Code2,
  Database, Globe, Zap, ShieldCheck, GraduationCap,
  Users, Microscope, FileText,
} from 'lucide-react';
import { FeatureNav, FeatureCTA, SEO } from './features/FeaturePageComponents';
import './styles/FeaturesOverview.css';

const ACCENT = '#3b82f6';

/* ─────────────────────────────────────────────
   Data
───────────────────────────────────────────── */

const METRICS = [
  { label: '学术论文', value: '2 亿+', hint: '覆盖全球主流学术数据库' },
  { label: '学科领域', value: '19', hint: '横跨自然 / 工程 / 医学 / 社科 / 人文' },
  { label: '支持语言', value: '80+', hint: '跨语言检索与 AI 分析' },
  { label: '核心 AI 能力', value: '5', hint: '搜索 · 分析 · 聊天 · 审稿 · 写作' },
];

type FeatureItem = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  accent: string;
  icon: React.ReactNode;
  appPath: string;
  detailPath?: string;
  mockup: 'search' | 'analysis' | 'chat' | 'review' | 'latex';
};

const FEATURES: FeatureItem[] = [
  {
    id: 'fo-search',
    eyebrow: '智能文献检索',
    title: '2 亿+ 论文，一句话直达你要的那一篇',
    body: '整合全球多个主流学术数据库，覆盖 19 个学科、80+ 种语言。支持传统关键词检索，也支持用一整段自然语言描述你的研究问题 —— AI 会理解你的意图、自动扩展查询、按语义精准匹配。',
    bullets: [
      '直接检索：关键词 / 标题 / 作者快速定位',
      'AI 智能检索：自然语言描述研究意图',
      '按引用量、年份、学科、开放获取筛选',
      '实时同步，新论文几小时内即可检索',
    ],
    accent: '#06b6d4',
    icon: <Search size={18} />,
    appPath: '/',
    detailPath: '/features/search',
    mockup: 'search',
  },
  {
    id: 'fo-analysis',
    eyebrow: 'AI 论文分析',
    title: '3 分钟读懂一篇论文的核心价值',
    body: '上传论文或直接在检索结果中一键分析，AI 会生成结构化的论文解读 —— 核心贡献、方法创新、关键发现、研究局限、可延伸方向一目了然。流式输出，边生成边看。',
    bullets: [
      '自动识别研究领域与学术脉络',
      '抽取核心贡献 · 方法 · 创新点',
      '标注研究局限与可延伸方向',
      '流式输出，30 秒内完成一篇',
    ],
    accent: '#f59e0b',
    icon: <BrainCircuit size={18} />,
    appPath: '/',
    mockup: 'analysis',
  },
  {
    id: 'fo-chat',
    eyebrow: 'AI 学术聊天',
    title: '像和同领域专家讨论一样，和 AI 聊研究',
    body: '在对话里解释概念、对比方法、讨论实验设计、梳理论文脉络、打磨论文表达。支持多模型切换、上下文连续对话、对话历史永久保存 —— 每一次讨论都在为你的研究添砖加瓦。',
    bullets: [
      '多种 AI 模型自由切换',
      '上下文连续对话，记得之前讨论的内容',
      '直接粘贴论文片段让 AI 解读',
      '对话历史自动保存，随时回顾',
    ],
    accent: '#10b981',
    icon: <MessageSquare size={18} />,
    appPath: '/chat',
    mockup: 'chat',
  },
  {
    id: 'fo-review',
    eyebrow: 'AI 智能审稿',
    title: '投稿前，先让三位 AI 审稿人帮你挑刺',
    body: '上传 PDF 或粘贴全文，三位专长各异的 AI 审稿人并行评审，从学术规范、方法论、综合价值五个维度给出结构化审稿意见 —— 每一条问题都可定位到原文位置。',
    bullets: [
      '三位 AI 审稿人并行评审',
      '五维度结构化评分报告',
      '问题按严重程度分级呈现',
      '基于文献对标评估新颖性',
    ],
    accent: '#8b5cf6',
    icon: <FileCheck2 size={18} />,
    appPath: '/peer-review-v2',
    detailPath: '/features/peer-review',
    mockup: 'review',
  },
  {
    id: 'fo-latex',
    eyebrow: 'ScholayPrism LaTeX',
    title: '在线 LaTeX 编辑器 · 原生 AI 辅助写作',
    body: '打开浏览器就能写论文。实时编译预览、IEEE/ACM/Springer 期刊模板一键开用、AI 补全与润色直接内嵌在编辑器里 —— 从初稿到投稿版本，全流程不用离开 Scholay。',
    bullets: [
      '在线编辑 + 实时编译预览',
      '多种学术期刊模板一键开用',
      'AI 智能补全 · 语法检查 · 参考文献格式化',
      '支持导出 PDF，可直接用于投稿',
    ],
    accent: '#2563eb',
    icon: <Code2 size={18} />,
    appPath: '/latex-writer',
    detailPath: '/features/latex-writer',
    mockup: 'latex',
  },
];

const VALUE_PROPS = [
  {
    icon: <Database size={20} />,
    title: '一站式科研工作台',
    desc: '从找论文、读论文、聊论文、审论文到写论文 —— 完整的学术工作流都在一个平台里完成，不用在多个工具间反复切换。',
  },
  {
    icon: <Globe size={20} />,
    title: '全球主流数据源接入',
    desc: '整合多个主流学术数据库与索引，2 亿+ 论文、19 个学科、80+ 种语言。中文、英文、日文、德文、法文等主流语种都可检索。',
  },
  {
    icon: <Zap size={20} />,
    title: 'AI 深度融合每个环节',
    desc: '不只是搜索结果加了 AI —— 从理解你的研究意图，到生成结构化分析，到给出可回溯的审稿意见，AI 是贯穿全流程的基础能力。',
  },
  {
    icon: <ShieldCheck size={20} />,
    title: '数据安全 · 所有权归你',
    desc: '你上传的论文、对话内容、个人笔记永远属于你，不会被用于训练任何 AI 模型，可以随时一键删除。',
  },
];

const SCENARIOS = [
  {
    icon: <GraduationCap size={22} />,
    who: '学生 / 研究新人',
    bullets: [
      '开题前用 AI 检索快速摸清领域全貌',
      'AI 分析帮你快速读懂领域内的核心论文',
      '论文写作用 LaTeX 编辑器 + AI 润色',
    ],
  },
  {
    icon: <Microscope size={22} />,
    who: '一线研究者',
    bullets: [
      '每周追踪领域最新进展，AI 帮你过滤噪音',
      '投稿前用 AI 审稿挑刺，降低被拒风险',
      '跨学科检索打破术语壁垒、发现新方向',
    ],
  },
  {
    icon: <Users size={22} />,
    who: '课题组 / 团队',
    bullets: [
      '实验室文献库共享（即将推出）',
      '协作审稿工作流，多人意见汇总',
      'API 接入（规划中），接入自有研究管线',
    ],
  },
];

const FAQ_ITEMS = [
  {
    q: 'Scholay 能解决我哪些具体问题？',
    a: '简单说：如果你在做学术研究，Scholay 能帮你更快找到相关文献（AI 智能检索）、更快读懂论文（AI 分析）、和 AI 讨论研究问题（学术聊天）、投稿前自查论文质量（AI 审稿）、以及在线写 LaTeX 论文（ScholayPrism）。从找文献到写论文，完整的科研工作流都可以在 Scholay 上完成。',
  },
  {
    q: '现在使用需要付费吗？',
    a: '当前阶段全部功能完全免费，无订阅、无隐藏收费、注册即用。未来推出付费方案时会提前 30 天通过邮件与站内消息通知，并始终保留一个功能完整的免费版本。',
  },
  {
    q: '文献数据覆盖有多全？',
    a: '我们整合了全球多个主流学术数据库，覆盖超过 2 亿篇学术论文，横跨 19 个学科领域（自然科学、工程、医学、社科、人文等），支持 80+ 种语言。数据每日同步，新发表的论文通常在几小时内就能被检索到。',
  },
  {
    q: 'AI 分析和审稿结果准确吗？',
    a: 'AI 输出基于先进的大语言模型，对论文核心内容的把握准确率较高，但任何 AI 生成的内容都建议作为辅助参考，而非最终的学术判断。对于用于正式研究或发表的内容，务必结合原文进行人工验证。',
  },
  {
    q: '我的论文和对话内容会被用作 AI 训练吗？',
    a: '不会。你上传的论文、与 AI 的对话内容、个人笔记都只属于你，不会被用于训练任何 AI 模型，也不会分享给任何第三方。你可以随时在账户设置中一键删除全部数据。',
  },
  {
    q: '支持哪些登录方式？',
    a: '支持邮箱注册、GitHub OAuth、Google OAuth、微信扫码登录。无论哪种方式，注册后都可以立即使用全部功能。',
  },
];

/* ─────────────────────────────────────────────
   Primitives
───────────────────────────────────────────── */

function WindowChrome({
  url,
  children,
  className = '',
}: {
  url?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`fo-window ${className}`}>
      <div className="fo-window-bar">
        <div className="fo-window-dots">
          <span />
          <span />
          <span />
        </div>
        {url && (
          <div className="fo-window-url">
            <Lock size={10} />
            <span>{url}</span>
          </div>
        )}
        <div className="fo-window-spacer" />
      </div>
      <div className="fo-window-body">{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Hero mockup — stacked cards hinting at all features
───────────────────────────────────────────── */
function HeroStackMockup() {
  return (
    <div className="fo-hero-stack">
      <div className="fo-stack-card fo-stack-card-3" aria-hidden>
        <WindowChrome url="scholay.ai/peer-review">
          <div className="fo-stack-mini">
            <div className="fo-stack-mini-eyebrow" style={{ color: '#8b5cf6' }}>PEER REVIEW</div>
            <div className="fo-stack-mini-title">审稿意见 · 5 维度</div>
            <div className="fo-stack-mini-bars">
              {[82, 74, 88, 71, 79].map((v, i) => (
                <div key={i} className="fo-stack-mini-bar">
                  <div className="fo-stack-mini-bar-fill" style={{ width: `${v}%`, background: '#8b5cf6' }} />
                </div>
              ))}
            </div>
          </div>
        </WindowChrome>
      </div>
      <div className="fo-stack-card fo-stack-card-2" aria-hidden>
        <WindowChrome url="scholay.ai/analysis">
          <div className="fo-stack-mini">
            <div className="fo-stack-mini-eyebrow" style={{ color: '#f59e0b' }}>AI ANALYSIS</div>
            <div className="fo-stack-mini-title">核心贡献 · 研究局限</div>
            <div className="fo-stack-mini-lines">
              <div className="fo-stack-mini-line" style={{ width: '92%' }} />
              <div className="fo-stack-mini-line" style={{ width: '78%' }} />
              <div className="fo-stack-mini-line" style={{ width: '88%' }} />
              <div className="fo-stack-mini-line" style={{ width: '64%' }} />
            </div>
          </div>
        </WindowChrome>
      </div>
      <div className="fo-stack-card fo-stack-card-1">
        <WindowChrome url="scholay.ai/search">
          <div className="fo-stack-hero">
            <div className="fo-stack-hero-bar">
              <Search size={13} />
              <span>有哪些方法可以提升小样本学习的泛化能力？</span>
              <span className="fo-stack-hero-kbd">↵</span>
            </div>
            <div className="fo-stack-hero-list">
              {[
                { t: 'Prototypical Networks for Few-Shot Learning', v: 'NeurIPS 2017', c: '12.8k' },
                { t: 'Meta-Learning with Latent Embedding Optimization', v: 'ICLR 2019', c: '2.4k' },
                { t: 'A Simple Framework for Contrastive Learning of Visual Representations', v: 'ICML 2020', c: '24.1k' },
              ].map((r, i) => (
                <div key={i} className="fo-stack-hero-row">
                  <div className="fo-stack-hero-t">{r.t}</div>
                  <div className="fo-stack-hero-m">
                    <span>{r.v}</span>
                    <span className="fo-stack-hero-c">{r.c} cites</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </WindowChrome>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Feature row mockups (compact versions)
───────────────────────────────────────────── */
function SearchMockup({ accent }: { accent: string }) {
  return (
    <WindowChrome url="scholay.ai/search" className="fo-row-window">
      <div className="fo-search-mock">
        <div className="fo-search-bar">
          <Search size={13} />
          <span>vision transformer medical image segmentation</span>
          <span className="fo-search-kbd">↵</span>
        </div>
        <div className="fo-search-filter">
          <span className="fo-search-chip" style={{ borderColor: `${accent}55`, color: accent }}>AI 智能检索</span>
          <span className="fo-search-chip">2021 - 2026</span>
          <span className="fo-search-chip">按引用量</span>
        </div>
        <div className="fo-search-results">
          {[
            { t: 'TransUNet: Transformers Make Strong Encoders', v: 'arXiv 2021', c: '4,210' },
            { t: 'Swin Transformer: Hierarchical Vision Transformer', v: 'ICCV 2021', c: '18,340' },
            { t: 'Attention Is All You Need', v: 'NeurIPS 2017', c: '134,020' },
          ].map((r, i) => (
            <div key={i} className="fo-search-item">
              <div className="fo-search-t">{r.t}</div>
              <div className="fo-search-m">
                <span>{r.v}</span>
                <span className="fo-search-cites">{r.c} cites</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </WindowChrome>
  );
}

function AnalysisMockup({ accent }: { accent: string }) {
  return (
    <WindowChrome url="scholay.ai/analysis" className="fo-row-window">
      <div className="fo-ana-mock">
        <div className="fo-ana-head">
          <FileText size={13} style={{ color: accent }} />
          <span>正在分析 · Attention Is All You Need</span>
        </div>
        <div className="fo-ana-stream">
          <div className="fo-ana-line">
            <span className="fo-ana-bullet" style={{ background: accent }} />
            <span>研究领域：<b>自然语言处理 · 深度学习</b></span>
          </div>
          <div className="fo-ana-line">
            <span className="fo-ana-bullet" style={{ background: accent }} />
            <span>核心贡献：首次提出完全基于注意力机制的 Transformer 架构</span>
          </div>
          <div className="fo-ana-line">
            <span className="fo-ana-bullet" style={{ background: accent }} />
            <span>关键方法：<b>self-attention</b>, <b>multi-head</b>, <b>position encoding</b></span>
          </div>
          <div className="fo-ana-line fo-ana-line-typing">
            <span className="fo-ana-bullet fo-ana-bullet-active" style={{ background: accent }} />
            <span>研究局限：训练成本高 · 对长序列建模仍有挑战<span className="fo-ana-caret" /></span>
          </div>
        </div>
      </div>
    </WindowChrome>
  );
}

function ChatMockup({ accent }: { accent: string }) {
  return (
    <WindowChrome url="scholay.ai/chat" className="fo-row-window">
      <div className="fo-chat-mock">
        <div className="fo-chat-row fo-chat-row-user">
          <div className="fo-chat-bubble fo-chat-bubble-user">
            对比 Contrastive Learning 和 Masked Autoencoder 的自监督范式
          </div>
        </div>
        <div className="fo-chat-row fo-chat-row-ai">
          <div className="fo-chat-avatar" style={{ background: `${accent}20`, color: accent }}>
            <Sparkles size={12} />
          </div>
          <div className="fo-chat-bubble">
            <div className="fo-chat-line"><b>Contrastive</b> 强调样本对比（正 / 负对），学习实例级判别特征；</div>
            <div className="fo-chat-line"><b>MAE</b> 通过重建被遮罩的 patch 学习上下文，更适合密集预测任务。</div>
            <div className="fo-chat-line fo-chat-line-dim">两者可以结合使用 —— 比如 iBOT、data2vec 等工作...</div>
          </div>
        </div>
        <div className="fo-chat-input">
          <span>继续追问...</span>
          <span className="fo-chat-kbd">↵</span>
        </div>
      </div>
    </WindowChrome>
  );
}

function ReviewMockup({ accent }: { accent: string }) {
  return (
    <WindowChrome url="scholay.ai/peer-review" className="fo-row-window">
      <div className="fo-rev-mock">
        <div className="fo-rev-scores">
          {[
            { k: '原创性', v: 82 },
            { k: '方法论', v: 75 },
            { k: '清晰度', v: 88 },
            { k: '重要性', v: 71 },
            { k: '严谨性', v: 79 },
          ].map((s) => (
            <div key={s.k} className="fo-rev-score">
              <div className="fo-rev-score-top">
                <span>{s.k}</span>
                <strong>{s.v}</strong>
              </div>
              <div className="fo-rev-score-bar">
                <div className="fo-rev-score-fill" style={{ width: `${s.v}%`, background: accent }} />
              </div>
            </div>
          ))}
        </div>
        <div className="fo-rev-decision">
          <span className="fo-rev-pill" style={{ background: `${accent}22`, color: accent, borderColor: `${accent}44` }}>
            Minor Revision
          </span>
          <span className="fo-rev-tip">3 位审稿人 · 1 位主编 · 共识 78%</span>
        </div>
      </div>
    </WindowChrome>
  );
}

function LatexMockup({ accent }: { accent: string }) {
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
    <WindowChrome url="scholay.ai/latex" className="fo-row-window">
      <div className="fo-tex-mock">
        <div className="fo-tex-editor">
          <div className="fo-tex-gutter">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
          <pre className="fo-tex-code">
            {tokens.map((tk, i) => (
              <span key={i} className={tk.c ? `fo-tex-${tk.c}` : ''} style={tk.c === 'kw' ? { color: accent } : undefined}>
                {tk.t}
              </span>
            ))}
          </pre>
        </div>
        <div className="fo-tex-preview">
          <div className="fo-tex-pv-title">Scholay</div>
          <div className="fo-tex-pv-eq">E = mc²</div>
          <div className="fo-tex-pv-hint">实时预览 · 0 延迟</div>
        </div>
      </div>
    </WindowChrome>
  );
}

function renderMockup(kind: FeatureItem['mockup'], accent: string) {
  switch (kind) {
    case 'search': return <SearchMockup accent={accent} />;
    case 'analysis': return <AnalysisMockup accent={accent} />;
    case 'chat': return <ChatMockup accent={accent} />;
    case 'review': return <ReviewMockup accent={accent} />;
    case 'latex': return <LatexMockup accent={accent} />;
  }
}

/* ─────────────────────────────────────────────
   Feature Row
───────────────────────────────────────────── */
function FeatureRow({
  item,
  reversed,
  index,
  onTry,
}: {
  item: FeatureItem;
  reversed?: boolean;
  index: number;
  onTry: (path: string) => void;
}) {
  const navigate = useNavigate();
  return (
    <section id={item.id} className={`fo-feat-row ${reversed ? 'fo-feat-reversed' : ''}`}>
      <div className="fo-feat-inner">
        <motion.div
          className="fo-feat-copy"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
        >
          <div className="fo-feat-step" style={{ color: item.accent }}>
            <span className="fo-feat-step-num">{String(index + 1).padStart(2, '0')}</span>
            <span className="fo-feat-step-line" style={{ background: `${item.accent}55` }} />
          </div>
          <span
            className="fo-feat-eyebrow"
            style={{ color: item.accent, background: `${item.accent}14`, borderColor: `${item.accent}30` }}
          >
            {item.icon}
            {item.eyebrow}
          </span>
          <h2 className="fo-feat-title">{item.title}</h2>
          <p className="fo-feat-body">{item.body}</p>
          <ul className="fo-feat-bullets">
            {item.bullets.map((b, i) => (
              <li key={i}>
                <CheckCircle2 size={14} style={{ color: item.accent }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <div className="fo-feat-ctas">
            <button
              className="fo-btn fo-btn-primary"
              style={{ background: item.accent }}
              onClick={() => onTry(item.appPath)}
            >
              立即试用
              <ArrowRight size={14} />
            </button>
            {item.detailPath && (
              <button
                className="fo-btn fo-btn-ghost"
                onClick={() => navigate(item.detailPath!)}
              >
                查看详细介绍
              </button>
            )}
          </div>
        </motion.div>
        <motion.div
          className="fo-feat-visual"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.55, delay: 0.1 }}
        >
          {renderMockup(item.mockup, item.accent)}
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   FAQ
───────────────────────────────────────────── */
function OverviewFAQ({ items }: { items: typeof FAQ_ITEMS }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="fo-faq-list">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <motion.div
            key={i}
            className={`fo-faq-item ${isOpen ? 'open' : ''}`}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: i * 0.04 }}
          >
            <button
              className="fo-faq-trigger"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
            >
              <span className="fo-faq-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="fo-faq-q">{item.q}</span>
              <span className="fo-faq-chev"><ChevronDown size={18} /></span>
            </button>
            <div className="fo-faq-panel" role="region">
              <div className="fo-faq-panel-inner">
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
   Page
───────────────────────────────────────────── */
const FeaturesOverview: React.FC = () => {
  const navigate = useNavigate();

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Scholay',
    description: 'AI 驱动的学术研究平台 · 整合文献检索、论文分析、学术聊天、智能审稿、LaTeX 写作五大核心能力',
    brand: { '@type': 'Brand', name: 'Scholay' },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.8',
      reviewCount: '2000',
    },
  };

  return (
    <div className="fo-page feat-page">
      <SEO
        title="Scholay 全站功能总览 | 一站式 AI 学术研究平台"
        description="Scholay 整合学术文献检索、AI 论文分析、AI 学术聊天、AI 智能审稿、ScholayPrism LaTeX 编辑器五大核心能力。2 亿+ 论文、19 个学科、80+ 种语言，从找论文到写论文，一个平台全部搞定。"
        keywords="Scholay 功能,学术搜索,AI 论文分析,AI 审稿,LaTeX 编辑器,学术聊天,一站式科研平台,AI 学术工具"
        canonical="/features"
        structuredData={structuredData}
      />

      <FeatureNav ctaText="立即开始使用" ctaTo="/" accentColor={ACCENT} />

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="fo-hero">
        <div className="fo-hero-bg" aria-hidden>
          <div className="fo-hero-beam fo-hero-beam-1" />
          <div className="fo-hero-beam fo-hero-beam-2" />
          <div className="fo-hero-grid" />
        </div>

        <div className="fo-hero-inner">
          <motion.div
            className="fo-hero-copy"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="fo-hero-eyebrow">
              <Sparkles size={12} />
              一站式 AI 学术研究平台
            </span>
            <h1 className="fo-hero-h1">
              从找论文到写论文，<br />
              <span className="fo-hero-grad">一个平台全部搞定</span>
            </h1>
            <p className="fo-hero-lead">
              Scholay 将 <b>学术检索 · AI 分析 · 学术聊天 · AI 审稿 · LaTeX 写作</b> 五大能力融进同一个工作台。
              2 亿+ 学术记录 · 19 个学科 · 80+ 种语言 —— 完整科研工作流，一站搞定。
            </p>
            <div className="fo-hero-ctas">
              <button className="fo-btn fo-btn-primary fo-btn-lg" onClick={() => navigate('/')}>
                立即免费使用
                <ArrowRight size={15} />
              </button>
              <a className="fo-btn fo-btn-ghost fo-btn-lg" href="#fo-search">
                查看所有功能
              </a>
            </div>
            <div className="fo-hero-trust">
              <span className="fo-hero-trust-dot" />
              当前全部功能 · 限时免费 · 注册即用
            </div>
          </motion.div>

          <motion.div
            className="fo-hero-visual"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroStackMockup />
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ METRICS ═══════════════ */}
      <section className="fo-metrics">
        <div className="fo-metrics-inner">
          {METRICS.map((m, i) => (
            <motion.div
              key={i}
              className="fo-metric"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <div className="fo-metric-value">{m.value}</div>
              <div className="fo-metric-label">{m.label}</div>
              <div className="fo-metric-hint">{m.hint}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══════════════ FEATURE ROWS ═══════════════ */}
      <div className="fo-feat-rows">
        {FEATURES.map((f, i) => (
          <FeatureRow
            key={f.id}
            item={f}
            index={i}
            reversed={i % 2 === 1}
            onTry={(path) => navigate(path)}
          />
        ))}
      </div>

      {/* ═══════════════ VALUE PROPS ═══════════════ */}
      <section className="fo-section fo-values">
        <div className="fo-section-inner">
          <div className="fo-section-head">
            <span className="fo-section-eyebrow">为什么选择 Scholay</span>
            <h2>不只是工具集合，是一个整合的科研工作台</h2>
            <p>我们做的不是把五个独立工具摆在一起，而是让它们在背后真正连起来 —— 检索到的论文可以直接 AI 分析，分析结果可以带入聊天继续讨论，最终写作也可以引用你收藏的论文。</p>
          </div>
          <div className="fo-values-grid">
            {VALUE_PROPS.map((v, i) => (
              <motion.div
                key={i}
                className="fo-value-card"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <div className="fo-value-icon">{v.icon}</div>
                <div className="fo-value-title">{v.title}</div>
                <div className="fo-value-desc">{v.desc}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ SCENARIOS ═══════════════ */}
      <section className="fo-section fo-scenarios">
        <div className="fo-section-inner">
          <div className="fo-section-head">
            <span className="fo-section-eyebrow">不同阶段 · 不同需求</span>
            <h2>无论你处在研究的哪一步，都能找到合适的用法</h2>
            <p>从入门的研究新人，到独立的一线研究者，到课题组和实验室 —— Scholay 都能适配你的节奏。</p>
          </div>
          <div className="fo-scenarios-grid">
            {SCENARIOS.map((s, i) => (
              <motion.div
                key={i}
                className="fo-scenario-card"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <div className="fo-scenario-icon">{s.icon}</div>
                <div className="fo-scenario-who">{s.who}</div>
                <ul className="fo-scenario-bullets">
                  {s.bullets.map((b, j) => (
                    <li key={j}>
                      <CheckCircle2 size={13} style={{ color: ACCENT }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FAQ ═══════════════ */}
      <section className="fo-section fo-faq-section">
        <div className="fo-section-inner">
          <div className="fo-section-head">
            <span className="fo-section-eyebrow">常见问题</span>
            <h2>在开始使用前，你可能想知道的</h2>
          </div>
          <OverviewFAQ items={FAQ_ITEMS} />
        </div>
      </section>

      {/* ═══════════════ CTA ═══════════════ */}
      <FeatureCTA
        title="从今天开始，让 AI 成为你的学术助理"
        desc="全部功能限时免费 · 注册即用 · 无需绑卡 · 随时可删数据"
        ctaText="立即开始使用"
        ctaTo="/"
        accentColor={ACCENT}
      />
    </div>
  );
};

export default FeaturesOverview;
