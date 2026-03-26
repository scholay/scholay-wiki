import React from 'react';
import {
  Search,
  Brain,
  Filter,
  Globe,
  SlidersHorizontal,
  Network,
  Unlock,
  Download,
  Sparkles,
  Keyboard,
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

const ACCENT = '#10a37f';

const SEO_KEYWORDS = 'ai搜论文, AI论文检索, 学术文献检索, ai论文检索网站, 检索论文的平台';

function AiSearchHeroDemo() {
  const glass = {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
  };

  const cardBase = {
    ...glass,
    padding: '12px 14px',
    marginBottom: 10,
  };

  const results = [
    { title: 'Attention Is All You Need', citations: '12.8万', year: '2017' },
    { title: 'BERT: Pre-training of Deep Bidirectional Transformers', citations: '9.2万', year: '2019' },
    { title: 'Learning Transferable Visual Models From Natural Language', citations: '3.1万', year: '2021' },
  ];

  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <div style={{ ...glass, padding: 16, marginBottom: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(16,163,127,0.12)',
            border: '1px solid rgba(16,163,127,0.28)',
          }}
        >
          <Search size={18} color={ACCENT} style={{ flexShrink: 0 }} />
          <span style={{ color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 1.4 }}>
            transformer 注意力机制 综述 近五年
          </span>
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>双模式</span>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              background: `${ACCENT}22`,
              color: ACCENT,
              border: `1px solid ${ACCENT}44`,
            }}
          >
            关键词
          </span>
          <span
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.65)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            AI 语义
          </span>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8, paddingLeft: 4 }}>
        检索结果 · 3 条
      </div>
      {results.map((paper, index) => (
        <div key={index} style={cardBase}>
          <div style={{ fontWeight: 600, color: '#fff', fontSize: 14, lineHeight: 1.35, marginBottom: 8 }}>
            {paper.title}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            <span>被引 {paper.citations}</span>
            <span>{paper.year}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AiSearchFeaturePage() {
  return (
    <DarkPageContainer accentColor={ACCENT}>
      <SEO
        title="AI学术文献检索 - Scholay | 2亿+论文智能搜索引擎"
        description="Scholay 提供关键词与 AI 语义双模式学术检索，覆盖 2 亿+ 论文，支持多维度筛选、引用网络与开放获取标识，助力高效文献发现。"
        keywords={SEO_KEYWORDS}
        canonical="/features/ai-academic-search"
      />
      <DarkNav ctaText="开始智能搜索" ctaTo="/search" accentColor={ACCENT} />
      <DarkHero
        pill="AI 学术检索"
        pillIcon={<Sparkles size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />}
        title="2亿+学术论文"
        gradientText="智能精准检索"
        subtitle="关键词检索与 AI 语义理解双模式并行：既可按题名、作者、机构精准匹配，也能用自然语言描述研究问题，让系统理解意图并返回最相关文献。"
        highlights={[
          { icon: <Search size={18} />, text: '双模式检索' },
          { icon: <Brain size={18} />, text: '语义理解' },
          { icon: <Filter size={18} />, text: '多维筛选' },
          { icon: <Globe size={18} />, text: '全球文献' },
        ]}
        ctaText="开始智能搜索"
        ctaTo="/search"
        secondaryText="了解更多功能"
        secondaryTo="/"
        accentColor={ACCENT}
        demoComponent={<AiSearchHeroDemo />}
      />
      <DarkStats
        accentColor={ACCENT}
        stats={[
          { value: '200M+', label: '论文' },
          { value: '19', label: '个学科' },
          { value: '双模式', label: '检索' },
          { value: '实时', label: '更新' },
        ]}
      />
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="能力矩阵"
          title="为科研流程打造的检索能力"
          desc="从查全、查准到后续分析，一套工具覆盖文献发现的关键环节。"
          accentColor={ACCENT}
        />
        <DarkFeatureGrid
          accentColor={ACCENT}
          items={[
            {
              icon: <Search size={22} />,
              title: '关键词检索',
              desc: '支持题名、摘要、作者、机构、期刊等多字段组合，快速定位已知文献或主题入口。',
            },
            {
              icon: <Brain size={22} />,
              title: 'AI 语义检索',
              desc: '用自然语言描述研究问题或假设，模型理解意图后在海量论文中匹配语义相近成果。',
            },
            {
              icon: <SlidersHorizontal size={22} />,
              title: '多维度筛选',
              desc: '按年份、学科、引用量、开放获取、期刊分区等条件收窄结果，减少无效翻阅。',
            },
            {
              icon: <Network size={22} />,
              title: '引用网络分析',
              desc: '查看引用与被引关系，把握领域经典工作与最新进展的传播路径。',
            },
            {
              icon: <Unlock size={22} />,
              title: '开放获取标识',
              desc: '清晰标注 OA 状态与获取方式，优先发现可免费阅读的全文资源。',
            },
            {
              icon: <Download size={22} />,
              title: '批量导出',
              desc: '将检索结果批量导出为常用格式，便于导入文献管理或协作分享。',
            },
          ]}
        />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 32px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="检索模式"
          title="两种入口，同一套权威数据"
          desc="无论习惯传统检索还是对话式表达，都能在统一索引上获得一致、可复现的结果。"
          accentColor={ACCENT}
        />
        <DarkShowcase
          eyebrow="模式一"
          title="关键词与字段检索"
          desc="适合已有明确线索的场景：已知论文片段、作者拼写、期刊名称或会议缩写时，用结构化条件快速锁定文献集合。"
          features={['多字段布尔组合', '短语与精确匹配', '与筛选器联动缩小范围']}
          ctaText="试用关键词检索"
          ctaTo="/search"
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
              <Keyboard size={64} color={ACCENT} style={{ opacity: 0.85 }} />
            </div>
          }
        />
        <DarkShowcase
          reversed
          eyebrow="模式二"
          title="AI 语义与意图检索"
          desc="适合探索性研究：用一段话描述你想解决的问题、方法偏好或应用场景，系统从语义层面推荐相关论文，减少「不知道该搜什么词」的摩擦。"
          features={['自然语言查询', '意图理解与扩展', '结果按相关度排序']}
          ctaText="体验 AI 检索"
          ctaTo="/search"
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
              <Brain size={64} color={ACCENT} style={{ opacity: 0.85 }} />
            </div>
          }
        />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="使用流程"
          title="三步拿到精准文献列表"
          desc="从输入到结果，路径短、反馈快。"
          accentColor={ACCENT}
        />
        <DarkSteps
          accentColor={ACCENT}
          steps={[
            {
              icon: <Search size={22} />,
              title: '输入查询',
              desc: '输入关键词、字段条件，或用自然语言描述你的研究问题。',
            },
            {
              icon: <Brain size={22} />,
              title: 'AI 理解意图',
              desc: '系统在双模式下解析查询语义与约束，匹配索引中的论文向量与元数据。',
            },
            {
              icon: <Globe size={22} />,
              title: '获取精准结果',
              desc: '按相关度与筛选条件返回列表，可进一步查看引用、OA 标识并导出。',
            },
          ]}
        />
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 56px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="常见问题"
          title="关于 AI 学术检索"
          accentColor={ACCENT}
        />
        <DarkFAQ
          items={[
            {
              q: '关键词检索和 AI 语义检索有什么区别？',
              a: '关键词检索依赖你提供的词项与字段匹配，适合目标明确；AI 语义检索则理解整句描述的研究意图，适合探索阶段或难以用单一关键词概括的问题。',
            },
            {
              q: '数据覆盖范围有多大？',
              a: '索引覆盖超过 2 亿篇学术文献，并持续同步更新，跨多个学科领域。',
            },
            {
              q: 'Scholay 的检索结果来源可靠吗？',
              a: '结果来自权威学术图谱与开放元数据，并展示引用量、年份、期刊等信息，便于你自行判断相关性。',
            },
            {
              q: '能否筛选开放获取全文？',
              a: '支持通过开放获取等维度筛选，并在结果中展示 OA 标识，方便优先获取可免费阅读的资源。',
            },
            {
              q: '支持哪些导出方式？',
              a: '可将检索结果批量导出为常用文献管理格式（具体格式以产品内说明为准），便于与 Zotero、EndNote 等工具衔接。',
            },
            {
              q: '使用 AI 检索是否需要单独付费？',
              a: '检索能力随账号订阅或免费额度策略提供，请在站内「订阅」或「帮助中心」查看当前配额与权益说明。',
            },
          ]}
        />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px', position: 'relative', zIndex: 1 }}>
        <DarkCTA
          title="立即体验 2 亿+ 论文智能检索"
          desc="双模式检索、多维筛选与引用网络，一站完成文献发现。"
          ctaText="开始智能搜索"
          ctaTo="/search"
          secondaryText="返回首页"
          secondaryTo="/"
          accentColor={ACCENT}
        />
      </div>
      <DarkFooter />
    </DarkPageContainer>
  );
}
