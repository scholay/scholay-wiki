import React from 'react';
import {
  MessageCircle,
  Brain,
  FileText,
  Languages,
  Lightbulb,
  History,
  Sparkles,
  PenLine,
  Send,
  BookOpenCheck,
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

const ACCENT = '#06b6d4';

const SEO_KEYWORDS = 'AI学术助手, 论文分析AI, 学术AI问答';

const STATS = [
  { value: '多模型', label: '驱动' },
  { value: '上下文', label: '连续对话' },
  { value: '全学科', label: '覆盖' },
  { value: '7×24', label: '在线' },
];

const FEATURE_ITEMS = [
  {
    icon: <MessageCircle size={22} />,
    title: '智能问答',
    desc: '用自然语言提问学术问题，AI 基于海量文献知识给出专业回答，支持追问与深入讨论。',
  },
  {
    icon: <FileText size={22} />,
    title: '论文分析',
    desc: '上传论文 PDF，AI 自动提取核心观点、方法论、实验结果与不足，快速掌握论文精髓。',
  },
  {
    icon: <PenLine size={22} />,
    title: '写作辅助',
    desc: '从摘要撰写到段落润色，AI 帮你优化学术表达、改善逻辑结构，提升论文质量。',
  },
  {
    icon: <Languages size={22} />,
    title: '学术翻译',
    desc: '专业学术术语翻译，保留原文语义精确度，支持中英互译与多语言学术文本处理。',
  },
  {
    icon: <Lightbulb size={22} />,
    title: '研究灵感',
    desc: '基于你的研究方向与现有文献，AI 提供创新角度、研究空白提示与潜在合作方向建议。',
  },
  {
    icon: <History size={22} />,
    title: '对话历史',
    desc: '完整保存所有对话记录，随时回顾之前的分析结果与讨论内容，知识持续积累。',
  },
];

const STEPS = [
  {
    icon: <PenLine size={22} />,
    title: '输入问题或上传论文',
    desc: '直接输入学术问题，或上传论文 PDF 让 AI 先行阅读分析。',
  },
  {
    icon: <Brain size={22} />,
    title: 'AI 分析与回答',
    desc: 'AI 理解你的问题上下文，结合学术知识库生成专业、有据可循的回答。',
  },
  {
    icon: <MessageCircle size={22} />,
    title: '持续对话深入探讨',
    desc: '在同一对话中追问、补充条件或切换话题，AI 保持上下文连贯。',
  },
];

const FAQ_ITEMS = [
  {
    q: 'AI 助手能回答哪些学术问题？',
    a: '覆盖自然科学、工程、医学、社会科学等多个学科领域的学术问题，包括概念解释、方法对比、文献推荐、实验设计等。',
  },
  {
    q: '上传论文后 AI 能做什么？',
    a: 'AI 会自动阅读全文并提取核心信息，包括研究目标、方法论、关键发现、局限性等，并支持你针对论文内容进行追问。',
  },
  {
    q: 'AI 的回答是否可靠？',
    a: 'AI 基于大规模学术文献训练，回答具有较高参考价值。建议将 AI 回答作为研究辅助，重要结论请结合原始文献验证。',
  },
  {
    q: '支持多轮对话吗？',
    a: '支持完整的多轮上下文对话，AI 会记住当前会话中的所有讨论内容，确保追问和补充都基于正确的语境。',
  },
  {
    q: '对话记录会保存吗？',
    a: '所有对话自动保存至你的账户，可随时回顾历史对话、继续之前的讨论或导出对话内容。',
  },
  {
    q: 'AI 助手是否有使用限制？',
    a: '使用额度取决于您的订阅方案，具体每日/每月可用次数请在站内「订阅」页面查看当前权益。',
  },
];

function AiAssistantHeroDemo() {
  const glass = {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
  };

  const userBubble = {
    background: `${ACCENT}1a`,
    border: `1px solid ${ACCENT}33`,
    borderRadius: '16px 16px 4px 16px',
    padding: '10px 14px',
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 1.5,
    maxWidth: '85%',
    alignSelf: 'flex-end',
  };

  const aiBubble = {
    ...glass,
    borderRadius: '16px 16px 16px 4px',
    padding: '10px 14px',
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 1.5,
    maxWidth: '90%',
    alignSelf: 'flex-start',
  };

  return (
    <div style={{ width: '100%', maxWidth: 420, margin: '0 auto' }}>
      <div style={{ ...glass, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Brain size={16} color={ACCENT} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Scholay AI 助手</span>
          <span
            style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 999,
              background: `${ACCENT}1a`,
              color: ACCENT,
              border: `1px solid ${ACCENT}33`,
              marginLeft: 'auto',
            }}
          >
            在线
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={userBubble}>
            Transformer 和 RNN 在序列建模上的主要区别是什么？各自适合什么场景？
          </div>
          <div style={aiBubble}>
            <div style={{ fontWeight: 600, color: '#fff', marginBottom: 6 }}>核心区别</div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: ACCENT, fontWeight: 600 }}>Transformer</span> 基于自注意力机制实现全局并行计算，擅长捕捉长距离依赖，适用于机器翻译、文本生成等任务。
            </div>
            <div>
              <span style={{ color: ACCENT, fontWeight: 600 }}>RNN</span> 按时间步顺序处理，天然适合流式/在线序列处理，在低资源场景或短序列任务中仍有优势。
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span style={{ flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>继续追问...</span>
          <Send size={16} color={ACCENT} style={{ opacity: 0.7 }} />
        </div>
      </div>
    </div>
  );
}

export default function AiAssistantFeaturePage() {
  return (
    <DarkPageContainer accentColor={ACCENT}>
      <SEO
        title="AI学术助手 - Scholay | 全能学术AI问答与论文分析"
        description="Scholay AI 学术助手，支持智能问答、论文深度分析、写作辅助与学术翻译，基于多模型驱动，7×24 小时在线，助力高效学术研究。"
        keywords={SEO_KEYWORDS}
        canonical="/features/ai-assistant"
      />
      <DarkNav ctaText="开始对话" ctaTo="/chat" accentColor={ACCENT} />
      <DarkHero
        pill="AI 助手"
        pillIcon={<Sparkles size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />}
        title="全能学术"
        gradientText="AI 智能助手"
        subtitle="从论文分析到写作润色，从学术问答到研究灵感，AI 助手覆盖科研全流程。多模型驱动、上下文连续对话，7×24 小时在线的学术伙伴。"
        highlights={[
          { icon: <MessageCircle size={18} />, text: '智能问答' },
          { icon: <FileText size={18} />, text: '论文分析' },
          { icon: <PenLine size={18} />, text: '写作辅助' },
          { icon: <Languages size={18} />, text: '学术翻译' },
        ]}
        ctaText="开始对话"
        ctaTo="/chat"
        secondaryText="了解更多功能"
        secondaryTo="/"
        accentColor={ACCENT}
        demoComponent={<AiAssistantHeroDemo />}
      />
      <DarkStats accentColor={ACCENT} stats={STATS} />
      <div className="fv2-section-wrap" style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px' }}>
        <DarkSectionHeader
          eyebrow="能力矩阵"
          title="覆盖科研全流程的 AI 能力"
          desc="从文献阅读、知识问答到写作润色，一个助手解决多环节需求。"
          accentColor={ACCENT}
        />
        <DarkFeatureGrid accentColor={ACCENT} items={FEATURE_ITEMS} />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 32px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="核心场景"
          title="你的全天候学术伙伴"
          desc="无论是深夜赶论文还是灵感枯竭时，AI 助手随时待命。"
          accentColor={ACCENT}
        />
        <DarkShowcase
          eyebrow="场景一"
          title="论文深度分析"
          desc="上传论文 PDF 后，AI 自动提取研究问题、方法论、核心发现与不足之处，并生成结构化摘要。你可以针对任何细节继续追问。"
          features={['全文自动阅读', '结构化信息提取', '基于论文内容追问']}
          ctaText="分析一篇论文"
          ctaTo="/chat"
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
              <BookOpenCheck size={64} color={ACCENT} style={{ opacity: 0.85 }} />
            </div>
          }
        />
        <DarkShowcase
          reversed
          eyebrow="场景二"
          title="学术写作助手"
          desc="粘贴段落或描述写作需求，AI 帮你优化学术表达、调整逻辑结构、润色语言风格，支持中英文学术写作。"
          features={['学术表达优化', '逻辑结构调整', '中英文润色']}
          ctaText="试用写作辅助"
          ctaTo="/chat"
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
              <PenLine size={64} color={ACCENT} style={{ opacity: 0.85 }} />
            </div>
          }
        />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="使用流程"
          title="三步开启 AI 学术对话"
          desc="输入即开始，全程自然语言交互。"
          accentColor={ACCENT}
        />
        <DarkSteps accentColor={ACCENT} steps={STEPS} />
      </div>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px 56px', position: 'relative', zIndex: 1 }}>
        <DarkSectionHeader
          eyebrow="常见问题"
          title="关于 AI 学术助手"
          accentColor={ACCENT}
        />
        <DarkFAQ items={FAQ_ITEMS} />
      </div>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 24px 48px', position: 'relative', zIndex: 1 }}>
        <DarkCTA
          title="开启你的 AI 学术助手"
          desc="智能问答、论文分析与写作辅助，一站式解决科研难题。"
          ctaText="开始对话"
          ctaTo="/chat"
          secondaryText="返回首页"
          secondaryTo="/"
          accentColor={ACCENT}
        />
      </div>
      <DarkFooter />
    </DarkPageContainer>
  );
}
