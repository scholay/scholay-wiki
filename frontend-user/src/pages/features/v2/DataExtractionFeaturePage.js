import React from 'react';
import {
  Table2,
  FileSpreadsheet,
  BarChart3,
  GitCompareArrows,
  ScanSearch,
  FileOutput,
  Upload,
  Sparkles,
  Eye,
  Settings2,
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

const ACCENT = '#14b8a6';

const SEO_KEYWORDS = '论文数据提取, 学术数据表格, 文献综述数据整理';

const STATS = [
  { value: '50+', label: '可提取字段' },
  { value: '秒级', label: '解析速度' },
  { value: '多论文', label: '对比分析' },
  { value: '3种', label: '导出格式' },
];

const FEATURE_ITEMS = [
  {
    icon: <ScanSearch size={22} />,
    title: '自动提取',
    desc: '自动识别论文中的表格、数据与实验结果，无需手动整理，极大节省文献综述时间。',
  },
  {
    icon: <GitCompareArrows size={22} />,
    title: '多论文对比',
    desc: '将多篇论文的关键数据并排对比，快速发现方法差异、性能基线与研究趋势。',
  },
  {
    icon: <Table2 size={22} />,
    title: '结构化输出',
    desc: '提取结果以统一表格呈现，字段规范、列名清晰，可直接用于综述撰写或元分析。',
  },
  {
    icon: <BarChart3 size={22} />,
    title: '可视化图表',
    desc: '一键将提取数据生成柱状图、折线图等可视化图表，让数据趋势一目了然。',
  },
  {
    icon: <FileOutput size={22} />,
    title: '导出 Excel/LaTeX',
    desc: '支持将结构化数据导出为 Excel、CSV 或 LaTeX 表格代码，无缝衔接后续写作流程。',
  },
  {
    icon: <Eye size={22} />,
    title: '智能识别',
    desc: 'AI 自动识别论文版式、表格结构与数据类型，兼容各类学术排版格式与PDF布局。',
  },
];

const STEPS = [
  {
    icon: <Upload size={22} />,
    title: '上传论文或输入链接',
    desc: '支持 PDF 上传、DOI 输入或从检索结果一键导入目标论文。',
  },
  {
    icon: <ScanSearch size={22} />,
    title: 'AI 自动解析提取',
    desc: '系统自动识别表格与关键数据，提取为结构化字段，支持多篇并行处理。',
  },
  {
    icon: <FileSpreadsheet size={22} />,
    title: '对比分析与导出',
    desc: '查看提取结果、生成对比表格或图表，导出为 Excel、CSV 或 LaTeX 格式。',
  },
];

const FAQ_ITEMS = [
  {
    q: '支持哪些类型的论文数据提取？',
    a: '支持实验结果表格、性能指标、方法参数、基线对比等多种结构化数据，覆盖主流学科论文排版格式。',
  },
  {
    q: '能否同时对比多篇论文的数据？',
    a: '支持多篇论文并行提取与横向对比，系统自动对齐同类字段，方便快速发现差异与趋势。',
  },
  {
    q: '提取结果的准确性如何保障？',
    a: 'AI 模型结合版式分析与语义理解，对复杂表格与嵌套数据有较高识别率，并支持用户手动修正。',
  },
  {
    q: '导出支持哪些格式？',
    a: '支持 Excel (.xlsx)、CSV 和 LaTeX 表格代码三种格式，满足数据分析与论文撰写的不同需求。',
  },
  {
    q: '对 PDF 排版有要求吗？',
    a: '兼容单栏、双栏及多种学术排版格式，对扫描版 PDF 也有一定识别能力，推荐使用原生数字 PDF 以获得最佳效果。',
  },
  {
    q: '数据提取功能是否有使用额度限制？',
    a: '使用额度取决于您的订阅方案，具体配额请在站内「订阅」页面查看当前权益说明。',
  },
];

function DataExtractionHeroDemo() {
  const glass = {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
  };

  const headerCell = {
    padding: '8px 12px',
    fontSize: 11,
    fontWeight: 700,
    color: ACCENT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottom: `1px solid ${ACCENT}33`,
    whiteSpace: 'nowrap',
  };

  const dataCell = {
    padding: '8px 12px',
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    whiteSpace: 'nowrap',
  };

  const rows = [
    { method: 'Transformer-XL', acc: '95.2%', f1: '93.8', params: '257M' },
    { method: 'BERT-Large', acc: '94.1%', f1: '92.5', params: '340M' },
    { method: 'GPT-2', acc: '91.7%', f1: '90.3', params: '1.5B' },
    { method: 'RoBERTa', acc: '96.4%', f1: '95.1', params: '355M' },
  ];

  return (
    <div style={{ width: '100%', maxWidth: 440, margin: '0 auto' }}>
      <div style={{ ...glass, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Table2 size={16} color={ACCENT} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>提取结果 · 4 篇论文对比</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headerCell}>方法</th>
                <th style={headerCell}>准确率</th>
                <th style={headerCell}>F1</th>
                <th style={headerCell}>参数量</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td style={{ ...dataCell, fontWeight: 600, color: '#fff' }}>{row.method}</td>
                  <td style={dataCell}>{row.acc}</td>
                  <td style={dataCell}>{row.f1}</td>
                  <td style={dataCell}>{row.params}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 16px', display: 'flex', gap: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {['Excel', 'CSV', 'LaTeX'].map((fmt) => (
            <span
              key={fmt}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 999,
                background: `${ACCENT}18`,
                color: ACCENT,
                border: `1px solid ${ACCENT}33`,
              }}
            >
              {fmt}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DataExtractionFeaturePage() {
  return (
    <DarkPageContainer accentColor={ACCENT}>
      <SEO
        title="AI数据表格提取 - Scholay | 从论文中自动提取结构化数据"
        description="Scholay AI 数据提取工具，自动从学术论文中提取表格与实验数据，支持多论文对比分析，一键导出 Excel、CSV 或 LaTeX 格式。"
        keywords={SEO_KEYWORDS}
        canonical="/features/data-extraction"
      />
      <DarkNav ctaText="开始分析" ctaTo="/search-results" accentColor={ACCENT} />
      <DarkHero
        pill="数据提取"
        pillIcon={<Sparkles size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />}
        title="多维度数据分析"
        gradientText="自动提取与对比"
        subtitle="AI 自动识别论文中的表格与实验数据，支持多篇论文横向对比，结构化输出至 Excel、CSV 或 LaTeX，极大加速文献综述与元分析工作流。"
        highlights={[
          { icon: <Table2 size={18} />, text: '表格提取' },
          { icon: <GitCompareArrows size={18} />, text: '多篇对比' },
          { icon: <BarChart3 size={18} />, text: '可视化图表' },
          { icon: <FileOutput size={18} />, text: '多格式导出' },
        ]}
        ctaText="开始分析"
        ctaTo="/search-results"
        secondaryText="了解更多功能"
        secondaryTo="/"
        accentColor={ACCENT}
        demoComponent={<DataExtractionHeroDemo />}
      />
      <DarkStats accentColor={ACCENT} stats={STATS} />
      <div className="fv2-section-wrap" style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px' }}>
        <DarkSectionHeader
          eyebrow="能力矩阵"
          title="全链路数据提取与分析能力"
          desc="从识别、提取到对比、导出，覆盖学术数据整理的每个关键环节。"
          accentColor={ACCENT}
        />
        <DarkFeatureGrid accentColor={ACCENT} items={FEATURE_ITEMS} />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 32px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="核心场景"
          title="从论文到结构化数据"
          desc="无论是单篇精读还是多篇综述，都能快速获得规范、可复用的数据表格。"
          accentColor={ACCENT}
        />
        <DarkShowcase
          eyebrow="场景一"
          title="单篇论文数据提取"
          desc="上传 PDF 后，AI 自动识别全文表格、图注与关键数值，生成结构化数据表，支持手动校正与字段编辑。"
          features={['表格自动识别', '字段类型推断', '手动校正支持']}
          ctaText="试用数据提取"
          ctaTo="/search-results"
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
              <FileSpreadsheet size={64} color={ACCENT} style={{ opacity: 0.85 }} />
            </div>
          }
        />
        <DarkShowcase
          reversed
          eyebrow="场景二"
          title="多论文横向对比"
          desc="导入多篇论文后，系统自动对齐同类指标字段，生成统一对比表与可视化图表，快速发现方法差异与性能趋势。"
          features={['字段自动对齐', '差异高亮标注', '图表一键生成']}
          ctaText="尝试多篇对比"
          ctaTo="/search-results"
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
              <Settings2 size={64} color={ACCENT} style={{ opacity: 0.85 }} />
            </div>
          }
        />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="使用流程"
          title="三步完成数据提取与导出"
          desc="从上传到导出，全程 AI 辅助，省去繁琐手动整理。"
          accentColor={ACCENT}
        />
        <DarkSteps accentColor={ACCENT} steps={STEPS} />
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 56px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="常见问题"
          title="关于 AI 数据提取"
          accentColor={ACCENT}
        />
        <DarkFAQ items={FAQ_ITEMS} />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px', position: 'relative', zIndex: 1 }}>
        <DarkCTA
          title="告别手动录入，AI 自动提取论文数据"
          desc="结构化表格、多篇对比与一键导出，让文献综述效率翻倍。"
          ctaText="开始分析"
          ctaTo="/search-results"
          secondaryText="返回首页"
          secondaryTo="/"
          accentColor={ACCENT}
        />
      </div>
      <DarkFooter />
    </DarkPageContainer>
  );
}
