/**
 * ============================================================================
 * Scholay学术 V2
 * AiTranslationFeaturePage — AI 学术翻译功能页
 * ============================================================================
 */

import React from 'react';
import {
  Languages,
  BookOpen,
  Zap,
  Shield,
  Library,
  LayoutTemplate,
  ArrowLeftRight,
  Sigma,
  Layers,
  Brain,
  Sparkles,
  FileType2,
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

const ACCENT = '#ec4899';

const SEO_KEYWORDS = '学术论文翻译, AI翻译工具, 学术翻译';

const HIGHLIGHT_TERM_STYLE = {
  background: 'rgba(236, 72, 153, 0.38)',
  padding: '0 5px',
  borderRadius: 4,
  borderBottom: '2px solid rgba(236, 72, 153, 0.85)',
};

const GLASS_PANEL = {
  width: '100%',
  maxWidth: 520,
  borderRadius: 20,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  boxShadow: '0 24px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
  overflow: 'hidden',
};

function TranslationDemoPanel() {
  return (
    <div style={GLASS_PANEL}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          fontSize: 12,
          color: 'rgba(240,244,248,0.65)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={14} style={{ color: ACCENT }} />
          学术翻译预览
        </span>
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>ZH → EN</span>
      </div>
      <div style={{ display: 'flex', minHeight: 220 }}>
        <div
          style={{
            flex: 1,
            padding: '16px 14px',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            fontSize: 13,
            lineHeight: 1.75,
            color: 'rgba(240,244,248,0.88)',
          }}
        >
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(240,244,248,0.45)', marginBottom: 10 }}>
            原文（中文）
          </div>
          本文提出一种基于
          <span style={HIGHLIGHT_TERM_STYLE}>注意力机制</span>
          的
          <span style={HIGHLIGHT_TERM_STYLE}>卷积神经网络</span>
          架构，用于提升小样本场景下的图像分类精度。实验在公开数据集上验证了方法的有效性。
        </div>
        <div
          style={{
            flex: 1,
            padding: '16px 14px',
            fontSize: 13,
            lineHeight: 1.75,
            color: 'rgba(240,244,248,0.88)',
          }}
        >
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(240,244,248,0.45)', marginBottom: 10 }}>
            译文（英文）
          </div>
          This paper proposes a
          <span style={HIGHLIGHT_TERM_STYLE}>convolutional neural network</span>
          architecture based on an
          <span style={HIGHLIGHT_TERM_STYLE}>attention mechanism</span>
          to improve image classification accuracy in few-shot settings. Experiments on public datasets validate the effectiveness of the method.
        </div>
      </div>
      <div
        style={{
          padding: '10px 16px',
          fontSize: 11,
          color: 'rgba(236, 72, 153, 0.95)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(236, 72, 153, 0.06)',
        }}
      >
        术语对已对齐高亮 · 格式与结构保留
      </div>
    </div>
  );
}

function ShowcaseGlossaryVisual() {
  const card = {
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(12px)',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {[
        { zh: '正则化', en: 'regularization' },
        { zh: '泛化能力', en: 'generalization' },
        { zh: '过拟合', en: 'overfitting' },
      ].map((row) => (
        <div key={row.zh} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ color: 'rgba(240,244,248,0.9)', fontWeight: 600 }}>{row.zh}</span>
          <ArrowLeftRight size={16} style={{ color: ACCENT, flexShrink: 0 }} />
          <span style={{ color: 'rgba(236, 72, 153, 0.95)', fontWeight: 500 }}>{row.en}</span>
        </div>
      ))}
    </div>
  );
}

function ShowcaseFormatVisual() {
  return (
    <div style={{ ...GLASS_PANEL, maxWidth: '100%' }}>
      <div style={{ padding: 16, fontSize: 12, color: 'rgba(240,244,248,0.75)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <FileType2 size={16} style={{ color: ACCENT }} />
          <span>导出预览 · 结构与样式保留</span>
        </div>
        <div style={{ borderLeft: `3px solid ${ACCENT}`, paddingLeft: 12, marginBottom: 10 }}>
          <strong style={{ color: '#fff' }}>1. Introduction</strong>
          <p style={{ margin: '8px 0 0', lineHeight: 1.6, color: 'rgba(240,244,248,0.55)' }}>
            标题层级、编号、图表题注与参考文献格式在译文中保持一致……
          </p>
        </div>
        <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, padding: 10, borderRadius: 8, background: 'rgba(0,0,0,0.25)', color: 'rgba(236, 72, 153, 0.9)' }}>
          E = mc² → 公式与符号位置对齐保留
        </div>
      </div>
    </div>
  );
}

const STATS = [
  { value: '50+', label: '学科领域模板' },
  { value: '术语级', label: '对齐与锁定' },
  { value: '原样', label: '版式结构保留' },
  { value: '双向', label: '中英等多语种' },
];

const FEATURE_ITEMS = [
  {
    icon: <Library size={24} />,
    title: '术语库',
    desc: '内置多学科术语对照与自定义词表，翻译时自动锁定关键概念，避免同一概念多种译法。',
  },
  {
    icon: <LayoutTemplate size={24} />,
    title: '格式保留',
    desc: '标题层级、列表、图表说明与脚注结构在译文中尽量保持与原稿一致，便于直接排版。',
  },
  {
    icon: <ArrowLeftRight size={24} />,
    title: '双向翻译',
    desc: '支持中文与英文等多语种互译，适合摘要、全文、审稿意见与回复信等多类稿件。',
  },
  {
    icon: <Sigma size={24} />,
    title: '公式识别',
    desc: '识别并保留数学公式与符号含义，减少手工回填 LaTeX 或公式编辑器的工作量。',
  },
  {
    icon: <Layers size={24} />,
    title: '批量翻译',
    desc: '按章节或文件批量处理长文档，统一术语风格，适合学位论文与专著片段。',
  },
  {
    icon: <Brain size={24} />,
    title: '上下文理解',
    desc: '结合前后文与学科语境消歧，避免断章取义式直译，输出更符合期刊用语习惯。',
  },
];

const STEPS = [
  {
    icon: <BookOpen size={22} />,
    title: '粘贴或上传原文',
    desc: '将摘要、章节或整段正文粘贴到智能助手，或按提示上传需翻译的文本内容。',
  },
  {
    icon: <Languages size={22} />,
    title: '选择语言与领域',
    desc: '指定源语言与目标语言，可选学科领域以启用更匹配的术语与表达风格。',
  },
  {
    icon: <Zap size={22} />,
    title: '生成译文并对照术语',
    desc: '一键生成译文，查看高亮术语对；按需微调后复制或导出，用于投稿与协作。',
  },
];

const FAQ_ITEMS = [
  {
    q: 'Scholay 的学术翻译适合哪些场景？',
    a: '适合期刊摘要、论文段落、审稿意见、基金本子与会议摘要等需要术语准确、表达正式的中英互译场景。也可用于课程作业与读书报告的专业表述优化。',
  },
  {
    q: '翻译会替换我文档里的格式吗？',
    a: '系统会尽量保留标题层级、列表与段落结构；复杂版式建议在 Word 或 LaTeX 中粘贴后做最终微调。图表内文字可分段翻译后回填。',
  },
  {
    q: '如何保证专业术语一致？',
    a: '可通过术语库与自定义词表锁定关键译名；同一对话内模型会参考前文保持译法统一。重要名词建议在定稿前人工核对一次。',
  },
  {
    q: '我的论文内容是否会被泄露？',
    a: '请查阅当前版本的隐私政策了解数据处理范围。建议勿在对话中粘贴尚未公开的核心创新细节或涉密内容，敏感稿件可先做脱敏再使用。',
  },
  {
    q: '支持哪些语言？',
    a: '以中文与英文互译为主，也可尝试其他常见语种的具体需求；实际效果因语种与领域而异，正式提交前建议母语者或合作者审阅。',
  },
  {
    q: '免费用户可以使用吗？',
    a: '智能助手内的翻译与对话能力受订阅与每日配额限制，具体以账户内用量与套餐说明为准。升级可获得更高额度与更稳定的服务优先级。',
  },
];

export default function AiTranslationFeaturePage() {
  return (
    <DarkPageContainer accentColor={ACCENT} glowColors={[ACCENT, '#a855f7', '#f472b6']}>
      <SEO
        title="AI学术翻译 - Scholay | 专业级学术论文智能翻译"
        description="Scholay AI 学术翻译：术语库对齐、格式保留、双向多语种与上下文理解，助力学术论文翻译与润色。"
        keywords={SEO_KEYWORDS}
        canonical="/features/ai-translation"
      />
      <DarkNav ctaText="开始翻译" ctaTo="/chat" accentColor={ACCENT} />
      <div className="fv2-main" style={{ paddingTop: 96, paddingBottom: 48 }}>
        <DarkHero
          pill="AI 学术翻译"
          pillIcon={<Languages size={14} />}
          title="学术级精准翻译"
          gradientText="AI 保留专业术语"
          subtitle="面向论文与科研写作的中英互译：术语锁定、版式友好、长文可读。在智能助手中即可完成从段落到章节的专业翻译流程。"
          highlights={[
            { icon: <Languages size={18} />, text: '多语种互译' },
            { icon: <BookOpen size={18} />, text: '学科术语对齐' },
            { icon: <Zap size={18} />, text: '快速生成对照' },
            { icon: <Shield size={18} />, text: '隐私与合规提示' },
          ]}
          ctaText="开始翻译"
          ctaTo="/chat"
          accentColor={ACCENT}
          demoComponent={<TranslationDemoPanel />}
        />

        <DarkStats stats={STATS} accentColor={ACCENT} />

        <DarkSectionHeader
          eyebrow="能力矩阵"
          title="为学术论文打造的翻译能力"
          desc="从术语一致性到长文可读性，覆盖常见投稿与协作场景。"
          accentColor={ACCENT}
        />
        <DarkFeatureGrid items={FEATURE_ITEMS} accentColor={ACCENT} />

        <DarkSectionHeader
          eyebrow="深度场景"
          title="典型工作流，一目了然"
          desc="术语管理与版式友好两大痛点，用产品化能力拆开呈现。"
          accentColor={ACCENT}
        />
        <DarkShowcase
          eyebrow="术语一致"
          title="词表驱动，减少「一词多译」"
          desc="关键概念在全文保持统一译名，高亮对照便于核对。支持按学科切换默认术语偏好，降低返工成本。"
          features={['自定义术语对与锁定', '高亮术语对便于审稿', '长文内上下文消歧']}
          ctaText="去智能助手体验"
          ctaTo="/chat"
          visual={<ShowcaseGlossaryVisual />}
          accentColor={ACCENT}
        />
        <DarkShowcase
          eyebrow="版式友好"
          title="结构保留，接好下游排版"
          desc="标题与列表层次在译文中尽量对齐原稿，公式与符号语义单独处理，方便回到 Word 或 LaTeX 继续排版。"
          features={['层级与列表结构对齐', '公式语义识别说明', '便于复制粘贴到稿件']}
          ctaText="立即尝试"
          ctaTo="/chat"
          visual={<ShowcaseFormatVisual />}
          reversed
          accentColor={ACCENT}
        />

        <DarkSectionHeader
          eyebrow="使用步骤"
          title="三步完成学术向翻译"
          desc="在 Scholay 智能助手中即可完成，无需安装单独客户端。"
          accentColor={ACCENT}
        />
        <DarkSteps steps={STEPS} accentColor={ACCENT} />

        <DarkSectionHeader
          eyebrow="常见问题"
          title="关于 AI 学术翻译"
          desc="使用前阅读有助于设置正确预期与合规边界。"
          accentColor={ACCENT}
        />
        <DarkFAQ items={FAQ_ITEMS} />

        <DarkCTA
          title="准备好翻译下一段论文了吗？"
          desc="打开智能助手，粘贴原文或按提示上传，指定语言与领域后即可获得术语友好的学术译文。"
          ctaText="开始翻译"
          ctaTo="/chat"
          accentColor={ACCENT}
        />
        <DarkFooter />
      </div>
    </DarkPageContainer>
  );
}
