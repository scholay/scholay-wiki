/**
 * ============================================================================
 * Scholay学术 V2
 * AiReviewFeaturePage — AI 智能审稿功能页（深色主题）
 * ============================================================================
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  Upload,
  BarChart3,
  Target,
  Shield,
  FileCheck2,
  Languages,
  Lock,
  RefreshCw,
  Sparkles,
  Zap,
  BookOpen,
  CheckCircle,
} from 'lucide-react';
import {
  DarkPageContainer,
  DarkNav,
  DarkHero,
  DarkStats,
  DarkSectionHeader,
  DarkShowcase,
  DarkFeatureGrid,
  DarkSteps,
  DarkFAQ,
  DarkCTA,
  DarkFooter,
  SEO,
  fadeUp,
} from './FeaturePageComponentsV2';

const ACCENT = '#6366f1';

const SEO_TITLE = 'AI智能审稿工具 - Scholay | 论文投稿前的最后一道保险';
const SEO_DESCRIPTION =
  'Scholay ai审稿工具基于大模型模拟同行评审，上传 PDF 即可获得五维度评分、逐段修改建议与期刊匹配，助力投稿前自查。支持中英文，安全可靠，秒级生成 AI论文评审报告。';
const SEO_KEYWORDS =
  'ai审稿,ai审稿工具,AI论文评审,人工智能审稿,论文审稿ai,智能审稿,投稿预审,同行评审';

const HERO_HIGHLIGHTS = [
  { icon: <Upload size={16} />, text: 'PDF 上传，一键启动审稿' },
  { icon: <BarChart3 size={16} />, text: '五维度评分 + 可视化报告' },
  { icon: <Target size={16} />, text: '段落级精准修改建议' },
  { icon: <Shield size={16} />, text: '加密传输，隐私优先' },
];

const STATS = [
  { value: '5维度评分', label: '全覆盖' },
  { value: '200M+', label: '论文库' },
  { value: '秒级', label: '出报告' },
  { value: '10000+', label: '用户' },
];

const FEATURE_GRID_ITEMS = [
  {
    icon: <BarChart3 size={22} />,
    title: '多维度量化评分',
    desc: '从创新性、方法论、表述、文献与实验设计等维度打分，一目了然看清短板与优势。',
  },
  {
    icon: <FileCheck2 size={22} />,
    title: '章节级修改建议',
    desc: '定位到节、段甚至句子，给出可执行的改写与补充方向，而非空泛点评。',
  },
  {
    icon: <BookOpen size={22} />,
    title: '期刊匹配参考',
    desc: '结合主题与方法论，推荐契合度较高的投稿方向，节省选刊时间。',
  },
  {
    icon: <Languages size={22} />,
    title: '多语言审稿',
    desc: '中英文论文均可分析，术语与表述习惯自动适配，适合国际投稿场景。',
  },
  {
    icon: <Lock size={22} />,
    title: '隐私与数据安全',
    desc: '传输加密、最小化留存策略，稿件用于当次分析，降低外泄风险。',
  },
  {
    icon: <RefreshCw size={22} />,
    title: '支持多轮修订',
    desc: '修改后可反复提交，对比前后报告，直到达到目标期刊的自我要求。',
  },
];

const SHOWCASE_FIVE_DIM_FEATURES = [
  '原创性与贡献度独立打分',
  '方法论与实验设计分项评估',
  '图表、引用与写作清晰度纳入考量',
  '综合结论与置信度说明',
  '报告结构对齐常见同行评审模板',
];

const SHOWCASE_PARAGRAPH_FEATURES = [
  '摘要与结论的逻辑一致性检查',
  '方法章节常见疏漏提示',
  '图表标题与正文引用对齐建议',
  '参考文献完整性初筛',
  '可按 Major / Minor 分级浏览意见',
];

const STEPS = [
  {
    icon: <Upload size={24} />,
    title: '上传论文 PDF',
    desc: '拖拽或选择文件，系统自动解析结构与章节，无需手动排版。',
  },
  {
    icon: <Sparkles size={24} />,
    title: 'AI 生成审稿报告',
    desc: '大模型模拟审稿人视角，输出评分条、问题清单与总体决议建议。',
  },
  {
    icon: <CheckCircle size={24} />,
    title: '修改完善',
    desc: '按建议逐条修订，可再次上传对比新版报告，直至满意后投稿。',
  },
];

const FAQ_ITEMS = [
  {
    q: 'AI 审稿和正式同行评审有什么区别？',
    a: 'AI 审稿是投稿前的辅助工具，用于自查短板与表述问题；正式录用仍依赖期刊安排的人类审稿人。Scholay 的目标是降低「因可避免问题」导致的 desk reject 或大修轮次。',
  },
  {
    q: '「ai审稿工具」适合哪些学科？',
    a: '覆盖理工、医学、社科等常见论文结构。模型会按摘要、方法、结果、讨论等区块给出针对性反馈，跨学科稿件同样可用。',
  },
  {
    q: '上传的论文会被保存或用于训练吗？',
    a: '平台采用加密传输与严格访问控制，稿件主要用于当次生成报告；具体保留策略以隐私政策为准，不会将您的稿件用于公开模型训练。',
  },
  {
    q: '报告生成大概要多久？',
    a: '常规篇幅下通常为秒级到分钟级，视排队与文档页数略有波动；复杂长文会相应增加处理时间。',
  },
  {
    q: '可以指定目标期刊的审稿风格吗？',
    a: '可在流程中结合选刊或领域关键词，让评审侧重点更贴近特定期刊或会议的关注点（如方法严谨性、应用价值等）。',
  },
  {
    q: '非英语母语作者如何受益？',
    a: '除中文外，支持英文稿件的学术表述检查；可并行获得「逻辑与结构」和「语言可读性」两类建议，便于国际投稿前润色。',
  },
];

function StaticMockReviewCard() {
  const rows = [
    { label: '创新性', score: 8, max: 10 },
    { label: '方法论', score: 7, max: 10 },
    { label: '重要性', score: 8, max: 10 },
    { label: '表述', score: 9, max: 10 },
    { label: '文献', score: 7, max: 10 },
  ];
  const cardStyle = {
    borderRadius: 20,
    padding: '22px 24px',
    maxWidth: 420,
    margin: '0 auto',
    background: 'rgba(255,255,255,0.07)',
    backdropFilter: 'blur(22px)',
    WebkitBackdropFilter: 'blur(22px)',
    border: '1px solid rgba(255,255,255,0.14)',
    boxShadow: '0 28px 90px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
  };
  const badgeStyle = {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 10,
  };
  const titleStyle = {
    fontSize: 14,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.92)',
    margin: '0 0 18px',
    lineHeight: 1.45,
  };
  const trackStyle = {
    flex: 1,
    height: 6,
    borderRadius: 999,
    background: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  };
  const verdictBox = {
    marginTop: 20,
    padding: '14px 16px',
    borderRadius: 14,
    background: 'rgba(99,102,241,0.12)',
    border: '1px solid rgba(99,102,241,0.35)',
  };

  return (
    <div style={cardStyle}>
      <div style={badgeStyle}>AI PEER REVIEW · 模拟报告</div>
      <p style={titleStyle}>多模态 Transformer 用于跨语言学术文档理解与生成</p>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>EVALUATION SCORES</div>
      {rows.map((r) => (
        <div
          key={r.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 10,
            fontSize: 12,
            color: 'rgba(255,255,255,0.75)',
          }}
        >
          <span style={{ width: 52, flexShrink: 0 }}>{r.label}</span>
          <div style={trackStyle}>
            <div
              style={{
                width: `${(r.score / r.max) * 100}%`,
                height: '100%',
                borderRadius: 999,
                background: `linear-gradient(90deg, ${ACCENT}, #a5b4fc)`,
              }}
            />
          </div>
          <span style={{ width: 36, textAlign: 'right', flexShrink: 0, fontWeight: 700, color: '#fff' }}>
            {r.score}/{r.max}
          </span>
        </div>
      ))}
      <div style={verdictBox}>
        <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT, marginBottom: 6 }}>评审决议</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>小修后录用（Minor Revision）</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>置信度：高 · 建议补充基线对比实验</div>
      </div>
    </div>
  );
}

function ShowcaseFiveDimVisual() {
  const dims = [
    { label: '创新', v: 82 },
    { label: '方法', v: 71 },
    { label: '写作', v: 88 },
    { label: '文献', v: 76 },
    { label: '实验', v: 79 },
  ];
  return (
    <div
      style={{
        padding: 28,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-around',
        gap: 12,
        minHeight: 220,
        background: 'linear-gradient(180deg, rgba(99,102,241,0.08) 0%, transparent 55%)',
      }}
    >
      {dims.map((d) => (
        <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: '100%',
              maxWidth: 44,
              height: 120,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              overflow: 'hidden',
              padding: 4,
            }}
          >
            <div
              style={{
                height: `${d.v}%`,
                borderRadius: 8,
                background: `linear-gradient(180deg, ${ACCENT}, #4f46e5)`,
                width: '100%',
              }}
            />
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function ShowcaseParagraphVisual() {
  const lines = [
    { ref: '摘要', text: '核心贡献表述偏泛，建议用一句量化指标概括提升幅度。', tone: 'rgba(251,191,36,0.25)' },
    { ref: '§4.2', text: '与 SOTA 对比缺少同一数据集上的公平对照，请补充表格。', tone: 'rgba(248,113,113,0.2)' },
    { ref: '图 3', text: '坐标轴标签与正文符号不一致，建议统一记号。', tone: 'rgba(96,165,250,0.2)' },
  ];
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>段落级意见预览</div>
      {lines.map((L) => (
        <div
          key={L.ref}
          style={{
            marginBottom: 12,
            padding: '12px 14px',
            borderRadius: 12,
            background: L.tone,
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, marginRight: 8 }}>{L.ref}</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 1.55 }}>{L.text}</span>
        </div>
      ))}
    </div>
  );
}

export default function AiReviewFeaturePage() {
  return (
    <DarkPageContainer accentColor={ACCENT} glowColors={[ACCENT, '#818cf8', '#34d399']}>
      <SEO
        title={SEO_TITLE}
        description={SEO_DESCRIPTION}
        keywords={SEO_KEYWORDS}
        canonical="/features/v2/ai-review"
      />
      <DarkNav ctaText="立即体验智能审稿" ctaTo="/review" accentColor={ACCENT} />
      <motion.main
        className="fv2-main"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <DarkHero
          pill="AI PEER REVIEW"
          pillIcon={<Zap size={14} />}
          title="投稿前"
          gradientText="最后一道保险"
          subtitle="Scholay 人工智能审稿在正式投稿前模拟同行评审：五维度打分、段落级修改建议与选刊参考，让 AI论文评审成为你可重复使用的自查流程。"
          highlights={HERO_HIGHLIGHTS}
          ctaText="立即体验智能审稿"
          ctaTo="/review"
          accentColor={ACCENT}
          demoComponent={<StaticMockReviewCard />}
        />
        <DarkStats stats={STATS} accentColor={ACCENT} />
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
          <DarkSectionHeader eyebrow="CAPABILITIES" title="核心能力" desc="面向投稿全流程的 ai审稿 能力矩阵，从评分到改写建议一站完成。" accentColor={ACCENT} />
          <DarkFeatureGrid items={FEATURE_GRID_ITEMS} accentColor={ACCENT} />
        </motion.section>
        <div className="fv2-showcases">
          <DarkShowcase
            eyebrow="SCORING"
            title="五维度深度评分"
            desc="不仅是总分：每个维度独立解读，帮助你优先处理最影响接收概率的薄弱环节。"
            features={SHOWCASE_FIVE_DIM_FEATURES}
            ctaText="开始审稿"
            ctaTo="/review"
            visual={<ShowcaseFiveDimVisual />}
            accentColor={ACCENT}
          />
          <DarkShowcase
            eyebrow="SUGGESTIONS"
            title="逐段精准修改建议"
            desc="意见锚定到章节与图表，减少「知道有问题但不知道改哪里」的时间损耗。"
            features={SHOWCASE_PARAGRAPH_FEATURES}
            ctaText="上传 PDF 试用"
            ctaTo="/review"
            visual={<ShowcaseParagraphVisual />}
            reversed
            accentColor={ACCENT}
          />
        </div>
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
          <DarkSectionHeader eyebrow="WORKFLOW" title="三步完成智能审稿" desc="从上传到定稿，最短路径完成投稿前质检。" accentColor={ACCENT} />
          <DarkSteps steps={STEPS} accentColor={ACCENT} />
        </motion.section>
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
          <DarkSectionHeader eyebrow="FAQ" title="关于 AI 审稿的常见问题" desc="了解人工智能审稿的边界与适用场景。" accentColor={ACCENT} />
          <DarkFAQ items={FAQ_ITEMS} />
        </motion.section>
        <DarkCTA
          title="把每一篇稿件，都审在投稿之前"
          desc="使用 Scholay ai审稿工具，用数据化评分与可执行建议，提升论文审稿 AI 辅助下的定稿效率。"
          ctaText="立即体验 AI 审稿"
          ctaTo="/review"
          accentColor={ACCENT}
        />
        <DarkFooter />
      </motion.main>
    </DarkPageContainer>
  );
}
