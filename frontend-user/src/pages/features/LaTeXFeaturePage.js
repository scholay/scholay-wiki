/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * LaTeXFeaturePage — ScholayPrism LaTeX Editor promotional landing page
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  Eye, Wand2, Code2, FolderOpen, Cloud, Sparkles,
  FileText, PenTool, Languages, Zap,
} from 'lucide-react';
import {
  FeatureNav, FeatureHero, FeatureStats, FeatureSectionHeader,
  FeatureGrid, FeatureSteps, FeatureCTA, FeatureFAQ, SEO,
} from './FeaturePageComponents';
import './LaTeXFeaturePage.css';

const ACCENT = '#E74C3C';

const STATS = [
  { value: '实时', label: '编译预览' },
  { value: 'AI 辅助', label: '智能写作' },
  { value: '10+', label: '学术模板' },
  { value: '免费', label: '云端使用' },
];

const FEATURES = [
  { icon: <Eye size={24} />, title: '实时编译预览', desc: '编辑 LaTeX 代码的同时，右侧即时显示编译后的 PDF 效果。所见即所得，无需手动编译和刷新。' },
  { icon: <Wand2 size={24} />, title: 'AI 辅助写作', desc: '内置大语言模型助手，支持内容生成、段落润色、公式补全、语法纠正和中英翻译，加速论文写作。' },
  { icon: <Code2 size={24} />, title: '语法高亮与补全', desc: '专业的 LaTeX 语法着色和智能补全，快速识别命令、环境和参数，减少语法错误。' },
  { icon: <FolderOpen size={24} />, title: '多文件项目管理', desc: '支持创建多文件 LaTeX 项目，主文件加子文件的结构化组织方式，适合大型学位论文和多章节文档。' },
  { icon: <Cloud size={24} />, title: '云端存储同步', desc: '论文项目自动保存到云端，多设备同步，随时随地继续写作。不用担心意外丢失数据。' },
  { icon: <Sparkles size={24} />, title: '丰富的模板库', desc: '内置 IEEE、ACM、Springer、Elsevier 等主流期刊和会议的官方 LaTeX 模板，一键创建即可开始写作。' },
];

const STEPS = [
  { title: '选择模板或创建项目', desc: '从模板库选择目标期刊/会议的 LaTeX 模板，或创建空白项目。支持导入已有的 .tex 文件。' },
  { title: '编写与 AI 辅助', desc: '在专业编辑器中撰写论文，利用 AI 助手生成内容、优化表达、补全公式。实时预览 PDF 输出效果。' },
  { title: '导出与投稿', desc: '完成后导出编译好的 PDF 和 LaTeX 源文件包，直接用于期刊投稿或学位论文提交。' },
];

const TEMPLATES = [
  { name: 'IEEE', desc: 'IEEE 期刊/会议论文', color: '#3b82f6' },
  { name: 'ACM', desc: 'ACM 会议论文模板', color: '#10b981' },
  { name: 'Springer', desc: 'Springer LNCS', color: '#6366f1' },
  { name: 'Elsevier', desc: 'Elsevier 期刊模板', color: '#f59e0b' },
  { name: '学位论文', desc: '通用硕博论文模板', color: '#ef4444' },
];

const AI_CAPS = [
  { icon: <PenTool size={20} />, title: '内容生成', desc: '根据提纲或主题自动生成论文段落、摘要框架和文献综述骨架。' },
  { icon: <Languages size={20} />, title: '学术润色', desc: '优化英文学术表达，替换口语化用词，调整句式结构使行文更专业。' },
  { icon: <Zap size={20} />, title: '公式补全', desc: '根据上下文自动补全数学公式和 LaTeX 命令，支持复杂方程。' },
  { icon: <FileText size={20} />, title: '语法修正', desc: '检测并修正 LaTeX 语法错误、缺失的括号、未闭合的环境和拼写问题。' },
];

const FAQ = [
  { q: 'ScholayPrism 是免费的吗？', a: '是的，ScholayPrism 基础功能完全免费，包括编辑器、实时预览和基本模板。AI 辅助写作功能的使用次数取决于你的订阅方案，免费用户也有每日基础配额。' },
  { q: '需要安装任何软件吗？', a: '不需要。ScholayPrism 完全基于浏览器运行，无需安装 TeX Live、MiKTeX 或任何本地 LaTeX 发行版。打开浏览器即可开始写作。' },
  { q: '可以导入现有的 LaTeX 项目吗？', a: '可以。支持上传 .tex、.bib、.cls、.sty 等所有 LaTeX 相关文件，也可以直接粘贴 LaTeX 源代码。多文件项目保持原有目录结构。' },
  { q: '编译后的 PDF 质量如何？', a: '编译输出的 PDF 与本地 TeX Live 编译的效果完全一致，符合各期刊和会议的投稿要求。支持 pdfLaTeX、XeLaTeX 等多种编译引擎。' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

function EditorMockup() {
  return (
    <div className="feat-editor-mockup">
      <div className="feat-mock-panel">
        <div className="feat-mock-panel-title">Files</div>
        <div className="feat-mock-filetree">
          <div className="feat-mock-file active">
            <FileText size={14} />main.tex
          </div>
          <div className="feat-mock-file">
            <FileText size={14} />abstract.tex
          </div>
          <div className="feat-mock-file">
            <FileText size={14} />refs.bib
          </div>
          <div className="feat-mock-file">
            <FolderOpen size={14} />figures/
          </div>
        </div>
      </div>
      <div className="feat-mock-panel">
        <div className="feat-mock-panel-title">Editor</div>
        <div className="feat-mock-code">
          <span className="kw">\documentclass</span>{'{'}article{'}'}<br/>
          <span className="kw">\usepackage</span>{'{'}amsmath{'}'}<br/>
          <span className="cmt">% AI: 自动补全中...</span><br/>
          <span className="kw">\begin</span>{'{'}document{'}'}<br/>
          <span className="kw">\title</span>{'{'}<span className="str">My Paper</span>{'}'}<br/>
          <span className="cmd">\maketitle</span><br/>
          <span className="kw">\section</span>{'{'}<span className="str">Introduction</span>{'}'}<br/>
          ...
        </div>
      </div>
      <div className="feat-mock-panel">
        <div className="feat-mock-panel-title">PDF Preview</div>
        <div className="feat-mock-pdf">
          <div className="feat-mock-pdf-line" style={{ width: '60%' }} />
          <div className="feat-mock-pdf-line" style={{ width: '80%' }} />
          <div className="feat-mock-pdf-line" style={{ width: '90%' }} />
          <div className="feat-mock-pdf-line" style={{ width: '70%' }} />
          <div className="feat-mock-pdf-line" style={{ width: '85%' }} />
          <div className="feat-mock-pdf-line" style={{ width: '45%' }} />
          <div className="feat-mock-pdf-line" style={{ width: '90%' }} />
          <div className="feat-mock-pdf-line" style={{ width: '75%' }} />
        </div>
      </div>
    </div>
  );
}

export default function LaTeXFeaturePage() {
  return (
    <div className="feat-page feat-latex-page">
      <SEO
        title="ScholayPrism - 在线 LaTeX 编辑器 | AI 辅助学术写作"
        description="ScholayPrism 是 Scholay 推出的免费在线 LaTeX 编辑器，支持实时编译预览、AI 辅助写作、多种学术期刊模板，无需安装任何本地软件即可开始论文写作。"
        keywords="LaTeX编辑器,在线LaTeX,ScholayPrism,学术写作,论文编辑器,AI写作助手,LaTeX模板,IEEE模板,ACM模板"
        canonical="/features/latex-writer"
      />

      <FeatureNav ctaText="开始写作" ctaTo="/latex-writer" accentColor={ACCENT} />

      <main className="feat-main">
        <FeatureHero
          pill="ONLINE LaTeX EDITOR"
          title="ScholayPrism"
          subtitle="专为学术写作打造的在线 LaTeX 编辑器——实时编译预览、AI 辅助写作、内置主流期刊模板，打开浏览器即可开始论文创作，无需安装任何本地软件。"
          ctaText="免费开始写作"
          ctaTo="/latex-writer"
          secondaryText="查看模板库"
          secondaryTo="/latex-writer"
          accentColor={ACCENT}
        />

        <FeatureStats stats={STATS} accentColor={ACCENT} />

        {/* Editor Mockup */}
        <section className="feat-section">
          <FeatureSectionHeader
            eyebrow="编辑器预览"
            title="三栏布局，高效写作体验"
            desc="文件树 + 代码编辑器 + PDF 实时预览，一屏掌握完整的论文写作流程。"
            center
            accentColor={ACCENT}
          />
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={fadeUp}>
            <EditorMockup />
          </motion.div>
        </section>

        {/* Features */}
        <section className="feat-section">
          <FeatureSectionHeader eyebrow="核心功能" title="为学术论文写作量身定制" center accentColor={ACCENT} />
          <FeatureGrid items={FEATURES} accentColor={ACCENT} />
        </section>

        {/* AI Capabilities */}
        <section className="feat-section">
          <FeatureSectionHeader
            eyebrow="AI 写作助手"
            title="AI 深度融入你的写作流程"
            desc="内置大语言模型，在编辑器中随时召唤 AI 助手——无需切换窗口，写作与 AI 辅助无缝衔接。"
            accentColor={ACCENT}
          />
          <motion.div className="feat-ai-capabilities" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
            {AI_CAPS.map((cap, i) => (
              <motion.div key={i} className="feat-ai-cap" variants={fadeUp}>
                <div className="feat-ai-cap-icon" style={{ background: `linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT}cc 100%)` }}>
                  {cap.icon}
                </div>
                <div>
                  <h4>{cap.title}</h4>
                  <p>{cap.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* Templates */}
        <section className="feat-section">
          <FeatureSectionHeader eyebrow="模板库" title="主流期刊与会议模板" center accentColor={ACCENT} />
          <motion.div className="feat-templates" initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }} variants={stagger}>
            {TEMPLATES.map((t, i) => (
              <motion.div key={i} className="feat-template-card" variants={fadeUp}>
                <div className="feat-template-icon" style={{ background: `${t.color}22`, color: t.color }}>
                  {t.name.charAt(0)}
                </div>
                <h4>{t.name}</h4>
                <p>{t.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* How It Works */}
        <section className="feat-section">
          <FeatureSectionHeader eyebrow="使用流程" title="三步开始你的论文写作" center accentColor={ACCENT} />
          <FeatureSteps steps={STEPS} accentColor={ACCENT} />
        </section>

        {/* FAQ */}
        <section className="feat-section">
          <FeatureSectionHeader eyebrow="常见问题" title="关于 ScholayPrism 的更多解答" center accentColor={ACCENT} />
          <FeatureFAQ items={FAQ} />
        </section>

        {/* Final CTA */}
        <FeatureCTA
          title="开始用 AI 辅助写作你的下一篇论文"
          desc="免费使用 ScholayPrism，打开浏览器即可体验专业的在线 LaTeX 编辑器。"
          ctaText="免费开始写作"
          ctaTo="/latex-writer"
          accentColor={ACCENT}
        />
      </main>
    </div>
  );
}
