/**
 * Scholay V2 — AI 论文写作 / LaTeX 功能页
 */

import React from 'react';
import {
  PenLine,
  Sparkles,
  MonitorPlay,
  LayoutTemplate,
  FileCode2,
  BookOpenCheck,
  Sigma,
  Library,
  FileDown,
  Wand2,
  Layers,
  CheckCircle2,
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

const ACCENT = '#f59e0b';

const SEO_KEYWORDS =
  'AI论文写作,在线LaTeX编辑器,学术写作工具,latex在线编译器免费';

const glassPanel = {
  borderRadius: 20,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  boxShadow: '0 24px 80px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
  overflow: 'hidden',
};

function LatexEditorMockup() {
  const tabs = [
    { id: 'main', label: 'main.tex', active: true },
    { id: 'bib', label: 'refs.bib', active: false },
    { id: 'prev', label: 'PDF 预览', active: false },
  ];
  const codeLines = [
    '\\documentclass{article}',
    '\\usepackage{amsmath, graphicx}',
    '\\title{Transformer 注意力机制}',
    '\\author{Scholay · AI 辅助}',
    '\\begin{document}',
    '\\maketitle',
    '\\section{Introduction}',
    '现代 NLP 依赖 \\textbf{自注意力}…',
    '\\end{document}',
  ];
  return (
    <div style={{ ...glassPanel, maxWidth: 520, width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '10px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.25)',
        }}
      >
        <span style={{ display: 'flex', gap: 6, marginRight: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
        </span>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            style={{
              border: 'none',
              cursor: 'default',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: t.active ? '#0a0e12' : 'rgba(255,255,255,0.45)',
              background: t.active
                ? `linear-gradient(135deg, ${ACCENT}, #d97706)`
                : 'transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', minHeight: 280 }}>
        <div
          style={{
            padding: 14,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 11,
            lineHeight: 1.65,
            color: 'rgba(255,255,255,0.82)',
          }}
        >
          {codeLines.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: 'rgba(255,255,255,0.25)', width: 22, textAlign: 'right', flexShrink: 0 }}>
                {i + 1}
              </span>
              <span>
                {line}
                {i === codeLines.length - 2 && (
                  <span
                    style={{
                      display: 'inline-block',
                      width: 2,
                      height: 14,
                      marginLeft: 2,
                      verticalAlign: 'middle',
                      background: ACCENT,
                      animation: 'fv2CaretBlink 1s step-end infinite',
                    }}
                  />
                )}
              </span>
            </div>
          ))}
        </div>
        <div
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: 'linear-gradient(165deg, rgba(245,158,11,0.08) 0%, rgba(5,10,14,0.5) 100%)',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: `${ACCENT}cc`, letterSpacing: 0.5 }}>
            实时预览
          </div>
          <div
            style={{
              flex: 1,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.97)',
              color: '#1a1a1a',
              padding: 16,
              fontSize: 12,
              lineHeight: 1.6,
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#0f172a' }}>
              Transformer 注意力机制
            </div>
            <div style={{ height: 3, width: 48, background: ACCENT, borderRadius: 2, marginBottom: 12 }} />
            <p style={{ margin: 0, color: '#334155' }}>1 Introduction</p>
            <p style={{ margin: '8px 0 0', color: '#475569' }}>
              现代 NLP 依赖 <strong>自注意力</strong> 捕获长程依赖…
            </p>
          </div>
        </div>
      </div>
      <style>
        {`
          @keyframes fv2CaretBlink { 50% { opacity: 0; } }
        `}
      </style>
    </div>
  );
}

export default function AiWritingFeaturePage() {
  const heroHighlights = [
    { icon: <FileCode2 size={16} />, text: '浏览器内 LaTeX，免本地环境' },
    { icon: <Sparkles size={16} />, text: 'AI 续写、润色与结构建议' },
    { icon: <LayoutTemplate size={16} />, text: '期刊/学位论文模板即开即用' },
    { icon: <MonitorPlay size={16} />, text: '源码与 PDF 双栏实时同步' },
  ];

  const stats = [
    { value: '实时', label: '实时预览' },
    { value: '200+', label: '写作模板' },
    { value: 'AI', label: '智能自动补全' },
    { value: '一键', label: '多格式导出' },
  ];

  const featureItems = [
    {
      icon: <FileCode2 size={22} />,
      title: 'LaTeX 编辑器',
      desc: '语法高亮、多文件工程、错误提示，专注排版与内容本身。',
    },
    {
      icon: <Wand2 size={22} />,
      title: 'AI 写作助手',
      desc: '按章节生成草稿、改写学术表述，并保持术语与引用风格一致。',
    },
    {
      icon: <Library size={22} />,
      title: '模板库',
      desc: '覆盖常见会议、期刊与高校格式，一键套用版式与宏包。',
    },
    {
      icon: <Sigma size={22} />,
      title: '公式编辑',
      desc: '可视化与源码双模式，复杂公式可复制为 LaTeX 片段。',
    },
    {
      icon: <BookOpenCheck size={22} />,
      title: '参考文献管理',
      desc: 'BibTeX / biblatex 联动，导入 DOI 或粘贴 Bib 即插入引用。',
    },
    {
      icon: <FileDown size={22} />,
      title: '多格式导出',
      desc: 'PDF 为主，可配合工具链导出 Word 等，便于协作与投稿。',
    },
  ];

  const steps = [
    {
      icon: <Layers size={22} />,
      title: '选择模板或空白项目',
      desc: '从模板库挑选版式，或导入现有 .tex 工程继续撰写。',
    },
    {
      icon: <PenLine size={22} />,
      title: '撰写并调用 AI',
      desc: '在编辑器中写作，随时让 AI 扩写段落、优化摘要或检查逻辑。',
    },
    {
      icon: <CheckCircle2 size={22} />,
      title: '编译预览与导出',
      desc: '云端编译生成 PDF，确认版式后一键下载或分享给合作者。',
    },
  ];

  const faqItems = [
    {
      q: '在线 LaTeX 和本地 TeX 发行版有什么区别？',
      a: '在线环境免安装、跨设备同步；复杂自定义宏或离线场景可搭配本地工具。Scholay 侧重协作与 AI 辅助的一体化体验。',
    },
    {
      q: '是否支持中文论文与常见中文期刊模板？',
      a: '支持 ctex、xeCJK 等常见中文方案；模板库持续扩充，也可上传自有 cls 与样式文件（以产品实际能力为准）。',
    },
    {
      q: 'AI 会代替我完成整篇论文吗？',
      a: 'AI 用于起草、润色与格式建议，学术观点、实验数据与署名责任仍由作者承担，请遵守单位与期刊的 AI 使用规范。',
    },
    {
      q: '公式和表格编辑是否方便？',
      a: '可直接编写 LaTeX 环境，也可使用可视化辅助生成代码；预览区实时反馈，减少编译试错次数。',
    },
    {
      q: '参考文献格式出错怎么办？',
      a: '检查 .bib 字段是否完整、引用 key 是否匹配，并确认使用的 biblatex/bibtex 配置与模板要求一致；编辑器会标出常见语法问题。',
    },
    {
      q: '免费额度与编译次数有限制吗？',
      a: '具体配额以账户订阅为准；一般免费档可满足轻量试写，重度投稿用户可选择更高配额方案。',
    },
  ];

  const showcaseAiVisual = (
    <div style={{ ...glassPanel, padding: 20, minHeight: 260 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: `${ACCENT}dd`, marginBottom: 14 }}>AI 写作助手</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ alignSelf: 'flex-end', maxWidth: '88%', padding: '10px 14px', borderRadius: 14, background: `${ACCENT}22`, border: `1px solid ${ACCENT}44`, fontSize: 13 }}>
          请根据摘要扩写「相关工作」一小节，语气正式。
        </div>
        <div
          style={{
            alignSelf: 'flex-start',
            maxWidth: '92%',
            padding: '12px 14px',
            borderRadius: 14,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: 12,
            lineHeight: 1.65,
            color: 'rgba(255,255,255,0.78)',
          }}
        >
          已结合您文中的引用与术语，生成与摘要一致的综述段落；您可在左侧编辑器中插入为 <code style={{ color: ACCENT }}>\section{'{'}Related Work{'}'}</code> 下的内容。
        </div>
      </div>
    </div>
  );

  const showcaseLatexVisual = (
    <div style={{ ...glassPanel, padding: 0, minHeight: 260 }}>
      <div style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
        编译输出 · PDF
      </div>
      <div style={{ padding: 20, display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div
          style={{
            flex: 1,
            borderRadius: 10,
            background: 'rgba(0,0,0,0.35)',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 10,
            padding: 12,
            color: 'rgba(255,255,255,0.55)',
            lineHeight: 1.5,
          }}
        >
          {'[latexmk] compiling...\n[success] 2 pages\n[preview] synced'}
        </div>
        <div
          style={{
            flex: 1.2,
            borderRadius: 10,
            background: '#fff',
            minHeight: 160,
            padding: 14,
            fontSize: 11,
            color: '#1e293b',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6 }}>Abstract</div>
          <div style={{ height: 2, width: 36, background: ACCENT, marginBottom: 10 }} />
          <p style={{ margin: 0, lineHeight: 1.55 }}>We present …</p>
        </div>
      </div>
    </div>
  );

  return (
    <DarkPageContainer accentColor={ACCENT} glowColors={[ACCENT, '#ea580c', '#fbbf24']}>
      <SEO
        title="AI智能论文写作 - ScholayPrism | 在线LaTeX编辑器与AI写作助手"
        description="Scholay 在线 LaTeX 编辑器结合 AI 论文写作助手：实时预览、模板库、公式与参考文献管理，支持多格式导出，适合高校与科研人员高效完成学术写作。"
        keywords={SEO_KEYWORDS}
        canonical="/features/ai-writing"
      />
      <div className="fv2-main">
        <DarkNav ctaText="开始写作" ctaTo="/latex-writer" accentColor={ACCENT} />
        <DarkHero
          pill="ScholayPrism · 学术写作"
          pillIcon={<PenLine size={14} />}
          title="学术论文写作"
          gradientText="AI 全程辅助"
          subtitle="在浏览器中完成 LaTeX 排版与 AI 辅助撰稿：从大纲到 PDF，一条链路打通文献、公式与投稿版式。"
          highlights={heroHighlights}
          ctaText="开始写作"
          ctaTo="/latex-writer"
          accentColor={ACCENT}
          demoComponent={<LatexEditorMockup />}
        />

        <DarkSectionHeader
          eyebrow="核心数据"
          title="为严肃写作而设计"
          desc="实时编译预览、丰富模板与 AI 补全，减少环境配置与排版返工。"
          accentColor={ACCENT}
        />
        <DarkStats stats={stats} accentColor={ACCENT} />

        <DarkSectionHeader
          eyebrow="能力矩阵"
          title="六大模块，覆盖论文全流程"
          desc="从编辑器到导出，组件化能力可按需组合使用。"
          accentColor={ACCENT}
        />
        <DarkFeatureGrid items={featureItems} accentColor={ACCENT} />

        <DarkSectionHeader
          eyebrow="场景深入"
          title="AI 与 LaTeX 如何协同"
          desc="左侧写源码，右侧看版式；需要时召唤 AI，而不是切换多个工具。"
          accentColor={ACCENT}
        />
        <DarkShowcase
          eyebrow="智能撰稿"
          title="上下文感知的写作建议"
          desc="AI 读取当前章节与已有引用，生成符合学科习惯的段落与过渡句，您可逐句采纳或改写。"
          features={['摘要 ↔ 正文一致性检查', '术语与符号表建议', '中英文摘要润色']}
          ctaText="体验 AI 助手"
          ctaTo="/latex-writer"
          visual={showcaseAiVisual}
          accentColor={ACCENT}
        />
        <DarkShowcase
          eyebrow="所见即所得"
          title="云端编译与实时 PDF"
          desc="保存即触发增量编译，错误信息定位到行号；预览与源码锁定滚动，长文档也能保持专注。"
          features={['多文件工程与主控 tex', '编译日志可折叠查看', '适合双栏与附录版式']}
          ctaText="打开编辑器"
          ctaTo="/latex-writer"
          visual={showcaseLatexVisual}
          reversed
          accentColor={ACCENT}
        />

        <DarkSectionHeader
          eyebrow="三步上手"
          title="从空白文档到可投稿 PDF"
          desc="无需本地安装 TeX Live，注册后即可创建项目。"
          accentColor={ACCENT}
        />
        <DarkSteps steps={steps} accentColor={ACCENT} />

        <DarkSectionHeader
          eyebrow="FAQ"
          title="关于 LaTeX 与 AI 写作的常见疑问"
          desc="以下说明帮助您判断在线工具是否满足课题与期刊要求。"
          accentColor={ACCENT}
        />
        <DarkFAQ items={faqItems} />

        <DarkCTA
          title="开始你的下一篇论文"
          desc="使用 Scholay 在线 LaTeX 与 AI 写作助手，把精力留给研究本身。"
          ctaText="开始写作"
          ctaTo="/latex-writer"
          secondaryText="返回首页"
          secondaryTo="/"
          accentColor={ACCENT}
        />
        <DarkFooter />
      </div>
    </DarkPageContainer>
  );
}
