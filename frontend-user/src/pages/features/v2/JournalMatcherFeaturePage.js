import React from 'react';
import {
  BookOpen,
  Target,
  BarChart3,
  Clock,
  TrendingUp,
  Shield,
  Sparkles,
  Upload,
  Search,
  ListChecks,
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
} from './FeaturePageComponentsV2';

const ACCENT = '#f97316';

const SEO_KEYWORDS = '期刊推荐, SCI期刊匹配, 期刊查询';

const STATS = [
  { value: '40K+', label: '收录期刊' },
  { value: 'AI', label: '智能匹配' },
  { value: '多维度', label: '综合评估' },
  { value: '实时', label: '数据更新' },
];

const FEATURE_ITEMS = [
  {
    icon: <Target size={22} />,
    title: '精准匹配',
    desc: '基于论文摘要、关键词与学科领域，AI 综合评估与期刊收稿范围的匹配度，推荐最合适的投稿目标。',
  },
  {
    icon: <TrendingUp size={22} />,
    title: '影响因子分析',
    desc: '展示期刊影响因子、CiteScore、H-index 等核心指标及历年趋势，辅助判断期刊学术影响力。',
  },
  {
    icon: <Clock size={22} />,
    title: '审稿周期预估',
    desc: '根据历史数据估算从投稿到首次决定的平均周期，帮助合理规划投稿时间线。',
  },
  {
    icon: <Shield size={22} />,
    title: '期刊资质验证',
    desc: '标注 SCI/SSCI/EI 收录情况、分区信息与是否为预警期刊，降低投稿风险。',
  },
  {
    icon: <BarChart3 size={22} />,
    title: '录用率参考',
    desc: '提供期刊录用率、拒稿率等参考数据，帮助评估投稿难度与竞争程度。',
  },
  {
    icon: <BookOpen size={22} />,
    title: '收稿范围解读',
    desc: '自动解析期刊 Aims & Scope，与你的论文主题进行语义比对，直观展示吻合程度。',
  },
];

const STEPS = [
  {
    icon: <Upload size={22} />,
    title: '输入论文信息',
    desc: '粘贴摘要、上传论文或输入关键词与学科方向，系统自动分析研究主题。',
  },
  {
    icon: <Search size={22} />,
    title: 'AI 匹配分析',
    desc: '基于论文内容与期刊收稿范围、影响因子、审稿周期等维度综合评分，生成推荐排名。',
  },
  {
    icon: <ListChecks size={22} />,
    title: '对比选择期刊',
    desc: '浏览推荐列表，对比各期刊核心指标，确定投稿目标后可直接跳转期刊官网。',
  },
];

const FAQ_ITEMS = [
  {
    q: '期刊推荐基于什么原理？',
    a: 'AI 对你的论文摘要进行语义分析，与期刊收稿范围（Aims & Scope）进行向量匹配，结合影响因子、学科分类与历史录用情况综合排序。',
  },
  {
    q: '收录了多少期刊？',
    a: '目前覆盖 40,000+ 期刊，涵盖 SCI、SSCI、EI 等主要索引收录的学术期刊，并持续更新。',
  },
  {
    q: '推荐结果是否可靠？',
    a: '推荐基于公开的期刊元数据与 AI 语义分析，作为投稿决策的辅助参考。建议结合导师意见与期刊官网信息综合判断。',
  },
  {
    q: '能否查看期刊的审稿周期？',
    a: '支持展示各期刊的平均审稿周期估算、录用率等参考数据，帮助你合理安排投稿时间。',
  },
  {
    q: '是否会标注预警期刊？',
    a: '系统会标注已知的预警期刊与掠夺性期刊，并提示潜在风险，帮助规避问题期刊。',
  },
  {
    q: '期刊匹配功能是否免费？',
    a: '使用额度取决于您的订阅方案，具体权益请在站内「订阅」页面查看。',
  },
];

function JournalMatcherHeroDemo() {
  const glass = {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
  };

  const journals = [
    { name: 'Nature Machine Intelligence', match: 94, impact: 25.9, review: '~45天', tier: 'Q1' },
    { name: 'IEEE Trans. on PAMI', match: 89, impact: 23.6, review: '~60天', tier: 'Q1' },
    { name: 'Artificial Intelligence', match: 82, impact: 14.4, review: '~50天', tier: 'Q1' },
  ];

  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <div style={{ ...glass, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Target size={16} color={ACCENT} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>匹配结果 · Top 3 期刊</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>
          基于: "Transformer在计算机视觉中的应用"
        </div>
        {journals.map((journal, index) => (
          <div
            key={index}
            style={{
              ...glass,
              padding: '14px 16px',
              marginBottom: index < journals.length - 1 ? 10 : 0,
              borderLeft: `3px solid ${ACCENT}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ fontWeight: 600, color: '#fff', fontSize: 14, lineHeight: 1.35, flex: 1 }}>
                {journal.name}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: ACCENT,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: `${ACCENT}1a`,
                  border: `1px solid ${ACCENT}33`,
                  flexShrink: 0,
                  marginLeft: 8,
                }}
              >
                {journal.match}% 匹配
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${journal.match}%`, borderRadius: 2, background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT}99)` }} />
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              <span>IF {journal.impact}</span>
              <span>{journal.tier}</span>
              <span>审稿 {journal.review}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function JournalMatcherFeaturePage() {
  return (
    <DarkPageContainer accentColor={ACCENT}>
      <SEO
        title="AI期刊推荐匹配 - Scholay | 智能匹配最佳投稿目标期刊"
        description="Scholay AI 期刊推荐工具，基于论文内容智能匹配最适合的投稿目标期刊，展示影响因子、审稿周期与录用率，助力高效选刊。"
        keywords={SEO_KEYWORDS}
        canonical="/features/journal-matcher"
      />
      <DarkNav ctaText="查询期刊" ctaTo="/assistant" accentColor={ACCENT} />
      <DarkHero
        pill="期刊匹配"
        pillIcon={<Sparkles size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />}
        title="找到最佳投稿"
        gradientText="目标期刊"
        subtitle="输入论文摘要或关键词，AI 综合分析收稿范围、影响因子、审稿周期与录用率，为你推荐匹配度最高的学术期刊，缩短选刊决策时间。"
        highlights={[
          { icon: <Target size={18} />, text: '精准匹配' },
          { icon: <TrendingUp size={18} />, text: '影响因子' },
          { icon: <Clock size={18} />, text: '审稿周期' },
          { icon: <Shield size={18} />, text: '资质验证' },
        ]}
        ctaText="查询期刊"
        ctaTo="/assistant"
        secondaryText="了解更多功能"
        secondaryTo="/"
        accentColor={ACCENT}
        demoComponent={<JournalMatcherHeroDemo />}
      />
      <DarkStats accentColor={ACCENT} stats={STATS} />
      <div className="fv2-section-wrap" style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px' }}>
        <DarkSectionHeader
          eyebrow="能力矩阵"
          title="全方位期刊评估与推荐"
          desc="从匹配度到审稿周期，多维指标帮你做出更明智的投稿决策。"
          accentColor={ACCENT}
        />
        <DarkFeatureGrid accentColor={ACCENT} items={FEATURE_ITEMS} />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 32px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="核心场景"
          title="两大典型选刊场景"
          desc="无论是首次投稿还是转投，都能快速找到合适的目标期刊。"
          accentColor={ACCENT}
        />
        <DarkShowcase
          eyebrow="场景一"
          title="新稿选刊推荐"
          desc="完成论文初稿后，粘贴摘要即可获得按匹配度排序的期刊列表，同时展示各刊影响因子与收稿偏好，减少盲投。"
          features={['摘要语义匹配', '多维指标对比', '一键跳转期刊官网']}
          ctaText="获取推荐"
          ctaTo="/assistant"
          accentColor={ACCENT}
          visual={
            <div
              style={{
                padding: 28,
                borderRadius: 20,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(12px)',
                minHeight: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Target size={64} color={ACCENT} style={{ opacity: 0.85 }} />
            </div>
          }
        />
        <DarkShowcase
          reversed
          eyebrow="场景二"
          title="拒稿后转投分析"
          desc="被拒稿后，系统可结合审稿意见重新评估方向，推荐与修改后论文更匹配的备选期刊，加速重新投稿。"
          features={['审稿意见参考', '备选期刊排序', '投稿难度评估']}
          ctaText="分析备选期刊"
          ctaTo="/assistant"
          accentColor={ACCENT}
          visual={
            <div
              style={{
                padding: 28,
                borderRadius: 20,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(12px)',
                minHeight: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BookOpen size={64} color={ACCENT} style={{ opacity: 0.85 }} />
            </div>
          }
        />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="使用流程"
          title="三步锁定目标期刊"
          desc="从输入到决策，路径短、信息全。"
          accentColor={ACCENT}
        />
        <DarkSteps accentColor={ACCENT} steps={STEPS} />
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 56px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="常见问题"
          title="关于 AI 期刊匹配"
          accentColor={ACCENT}
        />
        <DarkFAQ items={FAQ_ITEMS} />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px', position: 'relative', zIndex: 1 }}>
        <DarkCTA
          title="让 AI 帮你找到最合适的投稿期刊"
          desc="智能匹配、多维评估与资质验证，选刊不再盲目。"
          ctaText="查询期刊"
          ctaTo="/assistant"
          secondaryText="返回首页"
          secondaryTo="/"
          accentColor={ACCENT}
        />
      </div>
      <DarkFooter />
    </DarkPageContainer>
  );
}
