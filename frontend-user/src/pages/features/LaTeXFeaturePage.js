/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * LaTeXFeaturePage — ScholayPrism 编辑器 · 产品化落地页
 * 沿用审稿介绍页 (pr-v2) 的浅色 / 真实产品截图风格
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, CheckCircle2, ChevronDown, Sparkles, Lock, Cpu,
  FileText, Folder, FolderOpen, Play, Download, Wand2, Languages,
  Braces, BookOpen, Layout, Terminal, Clock, Zap,
} from 'lucide-react';
import { FeatureNav, FeatureCTA, FeatureJumpNav, SEO } from './FeaturePageComponents';
import './PeerReviewFeaturePage.css';
import './LaTeXFeaturePage.css';

const ACCENT = '#2563eb';

const JUMP_SECTIONS = [
  { id: 'lx-editor', label: '编辑器' },
  { id: 'lx-ai', label: 'AI 辅助' },
  { id: 'lx-templates', label: '模板库' },
  { id: 'lx-compile', label: '编译 & 导出' },
  { id: 'lx-workflow', label: '工作流' },
  { id: 'lx-faq', label: '常见问题' },
];

const JOURNALS = [
  'IEEE', 'ACM', 'Springer', 'Elsevier', 'Nature', 'Science',
  'NeurIPS', 'ICML', 'CVPR', 'ICLR', 'ECCV', 'AAAI',
  'The Lancet', 'NEJM', 'Cell',
];

const FAQ_ITEMS = [
  {
    q: 'ScholayPrism 真的免费吗？',
    a: '编辑器、实时编译预览、所有学术模板都完全免费. AI 写作功能 (润色、翻译、公式补全) 每天有免费额度, 需要更多可以升级订阅 —— 不会出现"先免费再付费墙"的套路.',
  },
  {
    q: '需要在本地装 TeX Live / MiKTeX 吗？',
    a: '完全不用. 编译在我们的服务器跑, 你只需要一个现代浏览器. Windows / macOS / Linux / iPad 打开就能写, 不占本地空间、不用管依赖版本.',
  },
  {
    q: '我已经有一份 LaTeX 项目, 可以导入吗？',
    a: '可以. 直接把整个项目压缩包或单个 .tex / .bib / .cls / .sty 文件拖进来, 目录结构会完整保留. 也支持从 Git 仓库一键同步.',
  },
  {
    q: '编译出来的 PDF 和本地一致吗？',
    a: '完全一致. 我们跑的是完整的 TeX Live 发行版, 支持 pdfLaTeX / XeLaTeX / LuaLaTeX / BibTeX / Biber —— 和本地 tlmgr 装出来的环境逐字节等价, 符合 arXiv 和主流期刊的投稿规范.',
  },
  {
    q: 'AI 润色会泄露论文内容吗？',
    a: '不会. 提交给 AI 的文本只用于当次调用, 不会进入任何模型的训练集, 不会落盘到日志. 对隐私要求更高的场景, 可以在设置里关闭所有 AI 功能.',
  },
  {
    q: '支持多人协作吗？',
    a: '支持实时多人编辑, 类似 Google Docs —— 同时写不会冲突. 可以通过分享链接给合作者"可编辑 / 可评论 / 只读"权限; 历史版本自动保留 30 天, 随时回滚.',
  },
  {
    q: '能看到每次编译的错误吗？',
    a: '能. 编译日志完整呈现, 警告和错误按文件、行号高亮定位; 点击错误可以直接跳到对应代码行. 常见错误还会给出建议的修复方案.',
  },
  {
    q: '导出内容包含什么？',
    a: '一份压缩包里会有: 编译好的最终 PDF、完整的 LaTeX 源码 (含所有 .tex / .bib / .cls / 图片资源)、以及一份 README 说明用到的依赖和编译命令 —— 可以直接上传 arXiv 或交给期刊排版团队.',
  },
];

/* ─────────────────────────────────────────────
   WindowChrome — 与审稿页一致的浏览器窗口容器
───────────────────────────────────────────── */
function WindowChrome({ url, tabs, activeTab = 0, children, className = '', compact = false }) {
  return (
    <div className={`pr-window ${compact ? 'pr-window-compact' : ''} ${className}`}>
      <div className="pr-window-bar">
        <div className="pr-window-dots">
          <span />
          <span />
          <span />
        </div>
        {url && (
          <div className="pr-window-url">
            <Lock size={10} />
            <span>{url}</span>
          </div>
        )}
        <div className="pr-window-spacer" />
      </div>
      {tabs && (
        <div className="pr-window-tabs">
          {tabs.map((t, i) => (
            <div key={i} className={`pr-window-tab ${i === activeTab ? 'active' : ''}`}>
              {t.icon}
              <span>{t.label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="pr-window-body">{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   JournalTicker
───────────────────────────────────────────── */
function JournalTicker() {
  const doubled = [...JOURNALS, ...JOURNALS];
  return (
    <div className="pr-ticker-wrap">
      <div className="pr-ticker-fade pr-ticker-fade-l" />
      <div className="pr-ticker-fade pr-ticker-fade-r" />
      <div className="pr-ticker">
        {doubled.map((j, i) => (
          <span key={i} className="pr-ticker-item">{j}</span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Reusable bits — 真实 IDE 片段
───────────────────────────────────────────── */
function CodeLine({ n, children, active = false, ai = false }) {
  return (
    <div className={`lx-codeline ${active ? 'lx-codeline-active' : ''} ${ai ? 'lx-codeline-ai' : ''}`}>
      <span className="lx-ln">{n}</span>
      <span className="lx-code-inner">{children}</span>
    </div>
  );
}

function FileTree({ items }) {
  return (
    <div className="lx-tree">
      <div className="lx-tree-head">EXPLORER</div>
      {items.map((it, i) => (
        <div
          key={i}
          className={`lx-tree-row ${it.active ? 'lx-tree-row-active' : ''}`}
          style={{ paddingLeft: 8 + (it.depth || 0) * 14 }}
        >
          {it.kind === 'folder'
            ? (it.open ? <FolderOpen size={12} /> : <Folder size={12} />)
            : <FileText size={12} />}
          <span>{it.name}</span>
          {it.badge && <span className="lx-tree-badge">{it.badge}</span>}
        </div>
      ))}
    </div>
  );
}

function PdfPage({ title, withFigure }) {
  return (
    <div className="lx-pdf-page">
      {title && <div className="lx-pdf-h1">{title}</div>}
      <div className="lx-pdf-authors">Young Peng<sup>*</sup>, Liu Wei, Zhang Hao</div>
      <div className="lx-pdf-abstract-lbl">ABSTRACT</div>
      <div className="lx-pdf-line" style={{ width: '96%' }} />
      <div className="lx-pdf-line" style={{ width: '92%' }} />
      <div className="lx-pdf-line" style={{ width: '88%' }} />
      <div className="lx-pdf-line" style={{ width: '72%' }} />
      <div className="lx-pdf-gap" />
      <div className="lx-pdf-h2">1. Introduction</div>
      <div className="lx-pdf-line" style={{ width: '94%' }} />
      <div className="lx-pdf-line" style={{ width: '90%' }} />
      <div className="lx-pdf-line" style={{ width: '78%' }} />
      {withFigure && (
        <div className="lx-pdf-fig">
          <div className="lx-pdf-fig-inner">
            <div className="lx-pdf-fig-bar" style={{ height: '40%' }} />
            <div className="lx-pdf-fig-bar" style={{ height: '70%' }} />
            <div className="lx-pdf-fig-bar" style={{ height: '55%' }} />
            <div className="lx-pdf-fig-bar" style={{ height: '85%' }} />
            <div className="lx-pdf-fig-bar" style={{ height: '62%' }} />
          </div>
          <div className="lx-pdf-fig-caption">Figure 1: Performance comparison across four benchmark datasets.</div>
        </div>
      )}
      <div className="lx-pdf-line" style={{ width: '85%' }} />
      <div className="lx-pdf-line" style={{ width: '60%' }} />
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup — Hero (三栏 IDE + 悬浮状态)
───────────────────────────────────────────── */
function HeroEditorMockup() {
  const files = [
    { kind: 'folder', name: 'thesis-draft', open: true, depth: 0 },
    { kind: 'file',   name: 'main.tex', active: true, depth: 1, badge: 'M' },
    { kind: 'file',   name: 'abstract.tex', depth: 1 },
    { kind: 'folder', name: 'chapters', open: true, depth: 1 },
    { kind: 'file',   name: 'intro.tex', depth: 2 },
    { kind: 'file',   name: 'method.tex', depth: 2 },
    { kind: 'file',   name: 'refs.bib', depth: 1 },
    { kind: 'folder', name: 'figures', depth: 1 },
  ];

  return (
    <div className="lx-hero-mockup">
      <WindowChrome
        url="prism.scholay.ai/thesis-draft/main.tex"
        tabs={[
          { icon: <FileText size={11} />, label: 'main.tex' },
          { icon: <FileText size={11} />, label: 'abstract.tex' },
          { icon: <FileText size={11} />, label: 'refs.bib' },
        ]}
      >
        <div className="lx-ide">
          {/* ── Files ───────────── */}
          <div className="lx-ide-files">
            <FileTree items={files} />
          </div>

          {/* ── Editor ──────────── */}
          <div className="lx-ide-editor">
            <div className="lx-editor-head">
              <span className="lx-editor-file">main.tex</span>
              <span className="lx-editor-sep">·</span>
              <span className="lx-editor-mode">pdfLaTeX</span>
              <span className="lx-editor-sep">·</span>
              <span className="lx-editor-branch">UTF-8</span>
            </div>
            <div className="lx-code">
              <CodeLine n={1}>
                <span className="tk-kw">\documentclass</span>[conference]{'{'}<span className="tk-str">IEEEtran</span>{'}'}
              </CodeLine>
              <CodeLine n={2}>
                <span className="tk-kw">\usepackage</span>{'{'}<span className="tk-str">amsmath,graphicx,cite</span>{'}'}
              </CodeLine>
              <CodeLine n={3}></CodeLine>
              <CodeLine n={4}>
                <span className="tk-kw">\begin</span>{'{'}<span className="tk-str">document</span>{'}'}
              </CodeLine>
              <CodeLine n={5}>
                {'  '}<span className="tk-cmd">\title</span>{'{'}<span className="tk-accent">Attention Mechanisms for Medical Image Segmentation</span>{'}'}
              </CodeLine>
              <CodeLine n={6}>
                {'  '}<span className="tk-cmd">\maketitle</span>
              </CodeLine>
              <CodeLine n={7}></CodeLine>
              <CodeLine n={8}>
                {'  '}<span className="tk-cmd">\begin</span>{'{'}<span className="tk-str">abstract</span>{'}'}
              </CodeLine>
              <CodeLine n={9} active>
                {'    '}We present a novel transformer-based<span className="lx-caret" />
              </CodeLine>
              <CodeLine n={10} ai>
                {'    '}<span className="lx-ai-suggest">architecture that achieves state-of-the-art performance</span>
              </CodeLine>
              <CodeLine n={11}>
                {'    '}on four benchmark datasets...
              </CodeLine>
              <CodeLine n={12}>
                {'  '}<span className="tk-cmd">\end</span>{'{'}<span className="tk-str">abstract</span>{'}'}
              </CodeLine>
            </div>
          </div>

          {/* ── PDF ─────────────── */}
          <div className="lx-ide-pdf">
            <div className="lx-pdf-head">
              <span>PDF</span>
              <span className="lx-pdf-page-num">1 / 8</span>
            </div>
            <PdfPage title="Attention Mechanisms for Medical Image Segmentation" />
          </div>
        </div>

        <div className="lx-ide-footer">
          <span className="lx-status-led lx-status-ok" />
          <span>编译成功</span>
          <span className="lx-ide-sep">·</span>
          <span>1.2s</span>
          <span className="lx-ide-sep">·</span>
          <span>8 pages</span>
          <span className="lx-ide-sep">·</span>
          <span>main.tex</span>
          <span className="lx-ide-footer-right">
            <Zap size={11} /> AI 已就绪
          </span>
        </div>
      </WindowChrome>

      {/* ── 悬浮状态贴片 ─── */}
      <motion.div
        className="pr-hero-chip pr-hero-chip-tl"
        initial={{ opacity: 0, y: 10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.9, duration: 0.4 }}
      >
        <CheckCircle2 size={12} />
        编译 1.2s · 8 pages
      </motion.div>
      <motion.div
        className="pr-hero-chip pr-hero-chip-br"
        initial={{ opacity: 0, y: 10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.1, duration: 0.4 }}
      >
        <Wand2 size={12} />
        AI 建议已就绪
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup — Editor Feature Row
───────────────────────────────────────────── */
function EditorFeatureMockup() {
  return (
    <div className="lx-mk-editor">
      <WindowChrome compact url="prism · sync-scroll">
        <div className="lx-ide lx-ide-compact">
          <div className="lx-ide-editor">
            <div className="lx-code">
              <CodeLine n={14}>
                {'  '}<span className="tk-cmd">\section</span>{'{'}<span className="tk-str">Related Work</span>{'}'}
              </CodeLine>
              <CodeLine n={15} active>
                {'  '}<span className="lx-sync-highlight">Recent advances in vision transformers</span>
              </CodeLine>
              <CodeLine n={16} active>
                {'  '}<span className="lx-sync-highlight">have demonstrated remarkable performance</span>
              </CodeLine>
              <CodeLine n={17} active>
                {'  '}<span className="lx-sync-highlight">on a variety of image tasks ~</span><span className="tk-cmd">\cite</span>{'{'}<span className="tk-str">vaswani2017</span>{'}'}
              </CodeLine>
              <CodeLine n={18}>
                {'  '}However, medical images present unique
              </CodeLine>
              <CodeLine n={19}>
                {'  '}challenges due to...
              </CodeLine>
            </div>
          </div>
          <div className="lx-ide-pdf">
            <PdfPage />
            <div className="lx-sync-marker" />
          </div>
        </div>
      </WindowChrome>
      <div className="lx-sync-label">
        <Layout size={11} />
        双向同步滚动 · 代码跳转到 PDF 对应行
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup — AI Panel
───────────────────────────────────────────── */
function AIPanelMockup() {
  return (
    <div className="lx-mk-ai">
      <WindowChrome compact url="prism · AI assist">
        <div className="lx-ai-split">
          {/* Left: code with selection */}
          <div className="lx-ai-code">
            <div className="lx-ai-code-head">
              <span className="lx-ai-file">abstract.tex</span>
              <span className="lx-ai-badge-sel">
                <span className="lx-ai-badge-dot" />
                已选中 3 行
              </span>
            </div>
            <CodeLine n={12}>
              <span className="tk-cmd">\begin</span>{'{'}<span className="tk-str">abstract</span>{'}'}
            </CodeLine>
            <div className="lx-ai-selection">
              <CodeLine n={13}>
                {'  '}We proposed a new method that is pretty
              </CodeLine>
              <CodeLine n={14}>
                {'  '}good on a few datasets. The results
              </CodeLine>
              <CodeLine n={15}>
                {'  '}show it works well.
              </CodeLine>
            </div>
            <CodeLine n={16}>
              <span className="tk-cmd">\end</span>{'{'}<span className="tk-str">abstract</span>{'}'}
            </CodeLine>
          </div>

          {/* Right: AI panel */}
          <div className="lx-ai-panel">
            <div className="lx-ai-panel-head">
              <Wand2 size={13} />
              <span>AI 润色</span>
              <span className="lx-ai-model">gpt-4o · 期刊语气</span>
            </div>

            <div className="lx-ai-prompt">
              <Sparkles size={12} />
              <span>让摘要更贴近期刊审稿人的预期</span>
            </div>

            <div className="lx-ai-diff">
              <div className="lx-ai-diff-row lx-ai-del">
                <span className="lx-ai-diff-gut">−</span>
                <span>We proposed a new method that is pretty good on a few datasets.</span>
              </div>
              <div className="lx-ai-diff-row lx-ai-add">
                <span className="lx-ai-diff-gut">+</span>
                <span>We introduce a novel attention mechanism achieving state-of-the-art performance on four benchmark datasets.</span>
              </div>
            </div>

            <div className="lx-ai-actions">
              <button className="lx-ai-btn lx-ai-btn-accept">
                <CheckCircle2 size={12} /> 采纳
              </button>
              <button className="lx-ai-btn">再试一次</button>
              <span className="lx-ai-shortcut"><kbd>⌘</kbd><kbd>↵</kbd></span>
            </div>

            <div className="lx-ai-caps">
              <span className="lx-ai-cap"><Wand2 size={10} /> 润色</span>
              <span className="lx-ai-cap"><Languages size={10} /> 翻译</span>
              <span className="lx-ai-cap"><Braces size={10} /> 公式补全</span>
              <span className="lx-ai-cap"><BookOpen size={10} /> 引用核查</span>
            </div>
          </div>
        </div>
      </WindowChrome>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup — Templates Gallery
───────────────────────────────────────────── */
const TEMPLATES = [
  { name: 'IEEE', tag: 'Transactions · Conference', color: '#2563eb', letter: 'I', badge: '最常用' },
  { name: 'ACM',  tag: 'sig / acmart', color: '#10b981', letter: 'A' },
  { name: 'Springer LNCS', tag: 'svproc / llncs', color: '#8b5cf6', letter: 'S' },
  { name: 'Elsevier', tag: 'elsarticle', color: '#f59e0b', letter: 'E' },
  { name: 'Nature', tag: 'nature · brief comm.', color: '#ec4899', letter: 'N' },
  { name: '学位论文', tag: '中 / 英 · 硕士 / 博士', color: '#06b6d4', letter: '学' },
];

function TemplatesMockup() {
  return (
    <div className="lx-mk-templates">
      <WindowChrome compact url="prism · templates gallery">
        <div className="lx-tpl-search">
          <input className="lx-tpl-input" value="transformer" readOnly />
          <span className="lx-tpl-count">100+ 模板 · 12 匹配</span>
        </div>
        <div className="lx-tpl-grid">
          {TEMPLATES.map((t, i) => (
            <motion.div
              key={t.name}
              className="lx-tpl-card"
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-30px' }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <div className="lx-tpl-glyph" style={{ color: t.color, background: `${t.color}10`, borderColor: `${t.color}33` }}>
                {t.letter}
              </div>
              <div className="lx-tpl-body">
                <div className="lx-tpl-name">
                  {t.name}
                  {t.badge && <span className="lx-tpl-badge">{t.badge}</span>}
                </div>
                <div className="lx-tpl-tag">{t.tag}</div>
              </div>
              <div className="lx-tpl-use">
                使用 <ArrowRight size={11} />
              </div>
            </motion.div>
          ))}
        </div>
      </WindowChrome>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Mockup — Compile & Export
───────────────────────────────────────────── */
function CompileMockup() {
  const logs = [
    { k: 'info', t: 'pdflatex main.tex · pass 1' },
    { k: 'info', t: 'Package: amsmath, graphicx, cite loaded' },
    { k: 'warn', t: 'Overfull \\hbox (2.1pt too wide) in paragraph at line 42' },
    { k: 'info', t: 'bibtex main · 24 entries resolved' },
    { k: 'info', t: 'pdflatex main.tex · pass 2 · resolving cross-refs' },
    { k: 'ok',   t: 'Output written on main.pdf (8 pages, 482 KB)' },
  ];
  return (
    <div className="lx-mk-compile">
      <WindowChrome compact url="prism · compile output">
        <div className="lx-compile-split">
          <div className="lx-compile-log">
            <div className="lx-compile-log-head">
              <Terminal size={12} />
              <span>compile log</span>
              <span className="lx-compile-time"><Clock size={10} /> 1.18s</span>
            </div>
            {logs.map((l, i) => (
              <motion.div
                key={i}
                className={`lx-log-line lx-log-${l.k}`}
                initial={{ opacity: 0, x: -4 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.2, delay: i * 0.06 }}
              >
                <span className="lx-log-gut">
                  {l.k === 'ok'   ? '✓' : l.k === 'warn' ? '!' : '›'}
                </span>
                <span>{l.t}</span>
              </motion.div>
            ))}
          </div>
          <div className="lx-compile-out">
            <div className="lx-compile-out-head">
              <span>PDF output</span>
              <button className="lx-compile-download">
                <Download size={11} /> 导出
              </button>
            </div>
            <div className="lx-compile-pages">
              {[0, 1, 2].map(i => (
                <div key={i} className="lx-compile-page">
                  <div className="lx-compile-page-num">{i + 1}</div>
                  <PdfPage withFigure={i === 1} />
                </div>
              ))}
              <div className="lx-compile-pages-more">+ 5 页</div>
            </div>
          </div>
        </div>
      </WindowChrome>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FeatureRow
───────────────────────────────────────────── */
function FeatureRow({ id, eyebrow, title, body, bullets, mockup, reversed, accent }) {
  return (
    <section id={id} className={`pr-feat-row ${reversed ? 'pr-feat-reversed' : ''}`}>
      <div className="pr-feat-inner">
        <motion.div
          className="pr-feat-copy"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
        >
          <span
            className="pr-feat-eyebrow"
            style={{ color: accent, background: `${accent}14`, borderColor: `${accent}30` }}
          >
            {eyebrow}
          </span>
          <h2 className="pr-feat-title">{title}</h2>
          <p className="pr-feat-body">{body}</p>
          <ul className="pr-feat-bullets">
            {bullets.map((b, i) => (
              <li key={i}>
                <CheckCircle2 size={14} style={{ color: accent }} />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </motion.div>
        <motion.div
          className="pr-feat-visual"
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
   Workflow — 4 步
───────────────────────────────────────────── */
const STEPS = [
  { n: '01', title: '从模板开始', desc: '选一个期刊 / 会议 / 学位论文模板 —— 字体、页边距、引用样式都已配好. 也可以拖入已有 .tex 项目, 目录结构完整保留.' },
  { n: '02', title: '边写边看 PDF', desc: '左边写 LaTeX, 右边实时渲染. 每次保存都在 1 秒内反映到页面, 再也不用手动按"编译"按钮.' },
  { n: '03', title: 'AI 随时在旁边', desc: '选段落让 AI 润色 / 翻译 / 找引用, 打公式让 AI 补全 LaTeX 符号. 每条建议都是 diff, 接不接受你说了算.' },
  { n: '04', title: '一键导出投稿包', desc: '最终 PDF + 完整源码 + README 打成压缩包, 直接上传 arXiv 或发给期刊排版团队, 格式与本地 TeX Live 完全一致.' },
];

function Workflow() {
  return (
    <section id="lx-workflow" className="pr-section">
      <div className="pr-section-inner">
        <div className="pr-section-head">
          <span className="pr-section-eyebrow">
            <Cpu size={11} /> WORKFLOW
          </span>
          <h2>从想法到投稿包 · <span className="lx-accent-grad">四步走完</span></h2>
          <p>没有环境要搭, 没有工具链要学 —— 打开浏览器就开始.</p>
        </div>
        <div className="lx-workflow-grid">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              className="lx-workflow-card"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <div className="lx-workflow-num">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
              {i < STEPS.length - 1 && <div className="lx-workflow-arrow">→</div>}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   FAQ accordion
───────────────────────────────────────────── */
function PremiumFAQ({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="pr-faq-list">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <motion.div
            key={i}
            className={`pr-faq-item ${isOpen ? 'open' : ''}`}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: i * 0.04 }}
          >
            <button
              className="pr-faq-trigger"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
            >
              <span className="pr-faq-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="pr-faq-q">{item.q}</span>
              <span className="pr-faq-chev"><ChevronDown size={18} /></span>
            </button>
            <div className="pr-faq-panel" role="region">
              <div className="pr-faq-panel-inner">
                <p>{item.a}</p>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════════ */
export default function LaTeXFeaturePage() {
  const navigate = useNavigate();

  return (
    <div className="feat-page feat-review-page pr-v2 feat-latex-page">
      <SEO
        title="ScholayPrism - 在线 LaTeX 编辑器 | AI 辅助学术写作"
        description="ScholayPrism 是一款完全浏览器内运行的 LaTeX 编辑器: 实时编译预览、AI 润色与翻译、主流期刊模板即开即用, 不需要在本地安装 TeX Live."
        keywords="LaTeX编辑器,在线LaTeX,ScholayPrism,学术写作,论文编辑器,AI写作助手,LaTeX模板,IEEE模板,ACM模板"
        canonical="/features/latex-writer"
      />

      <FeatureNav ctaText="打开编辑器" ctaTo="/latex-writer" accentColor={ACCENT} />

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="pr-hero">
        <div className="pr-hero-bg" aria-hidden>
          <div className="pr-hero-beam pr-hero-beam-1" />
          <div className="pr-hero-beam pr-hero-beam-2" />
          <div className="pr-hero-grid" />
        </div>

        <div className="pr-hero-inner">
          <motion.div
            className="pr-hero-copy"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="pr-hero-eyebrow">
              <Sparkles size={12} />
              ONLINE LATEX EDITOR
            </span>
            <h1 className="pr-hero-h1">
              浏览器打开就能写<br />
              <span className="pr-hero-grad">专业期刊排版</span>
            </h1>
            <p className="pr-hero-lead">
              ScholayPrism 把完整的 LaTeX 环境搬进浏览器 ——
              实时编译预览、AI 润色与翻译、主流期刊模板即开即用.
              不用装 TeX Live, 不用管依赖, 不用等编译环境.
            </p>
            <div className="pr-hero-ctas">
              <button className="pr-btn pr-btn-primary" onClick={() => navigate('/latex-writer')}>
                打开编辑器
                <ArrowRight size={15} />
              </button>
              <a className="pr-btn pr-btn-ghost" href="#lx-templates">
                浏览模板库
                <ChevronDown size={14} />
              </a>
            </div>

            <div className="pr-hero-security">
              <div className="pr-hero-security-head">
                <Zap size={14} />
                <span>浏览器即用 · 零本地安装</span>
              </div>
              <div className="pr-hero-security-chips">
                <span className="pr-hero-sec-chip">
                  <Play size={11} />
                  实时编译
                </span>
                <span className="pr-hero-sec-chip">
                  <Wand2 size={11} />
                  AI 润色翻译
                </span>
                <span className="pr-hero-sec-chip">
                  <Layout size={11} />
                  期刊模板 100+
                </span>
              </div>
            </div>

            <div className="pr-hero-meta">
              <span className="pr-live-inline">
                <span className="pr-live-dot" />
                <span>支持 <strong>pdfLaTeX · XeLaTeX · LuaLaTeX</strong></span>
              </span>
              <span className="pr-hero-sep" />
              <span>首篇免费 · 无需注册</span>
            </div>
          </motion.div>

          <motion.div
            className="pr-hero-visual"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroEditorMockup />
          </motion.div>
        </div>

        <div className="pr-hero-trust">
          <p className="pr-hero-trust-label">适用于投稿至以下期刊与会议</p>
          <JournalTicker />
        </div>
      </section>

      <main className="feat-main pr-main">
        {/* ═══════════════ METRICS BAR ═══════════════ */}
        <section className="pr-metrics">
          <div className="pr-metrics-inner">
            {[
              { num: '100+', unit: '', label: '期刊 · 会议 · 学位论文模板' },
              { num: '< 2', unit: '秒', label: '首次编译预览到屏幕' },
              { num: '6', unit: '', label: '种 AI 写作能力就绪' },
              { num: '0', unit: '', label: '本地安装 · 浏览器即用' },
            ].map((m, i) => (
              <motion.div
                key={i}
                className="pr-metric"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
              >
                <div className="pr-metric-num">
                  {m.num}
                  {m.unit && <span className="pr-metric-unit">{m.unit}</span>}
                </div>
                <div className="pr-metric-label">{m.label}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ═══════════════ EDITOR ═══════════════ */}
        <FeatureRow
          id="lx-editor"
          eyebrow="EDITOR · 所见即所写"
          title={'写代码的左边, 就是 PDF 的右边'}
          body={'左侧写 LaTeX, 右侧实时渲染 PDF —— 每次保存都在一秒内反映到页面. 不再有"等编译 30 秒然后看到报错"的挫败感, 写错了立刻知道, 排版跑了立刻看到.'}
          bullets={[
            '语法高亮 · 智能补全 · 错误实时定位',
            '代码 ↔ PDF 双向同步滚动',
            '多文件项目 · 主文档自动识别',
            '历史版本 30 天保留, 随时回滚',
          ]}
          mockup={<EditorFeatureMockup />}
          accent="#2563eb"
        />

        {/* ═══════════════ AI ═══════════════ */}
        <FeatureRow
          id="lx-ai"
          reversed
          eyebrow="AI · 光标旁的研究助手"
          title={'AI 是副驾驶, 不是代笔'}
          body="选中段落让 AI 润色, 写不出公式让 AI 补全, 一键把中文翻成期刊级英文. 所有建议都以 diff 的形式呈现 —— 接不接受, 你说了算."
          bullets={[
            '选段润色 · 符合目标期刊的语气',
            '公式补全 · 从自然语言到 LaTeX 符号',
            '学术翻译 · 专业术语全文一致',
            '引用核查 · 自动检查 \\cite 的有效性',
          ]}
          mockup={<AIPanelMockup />}
          accent="#8b5cf6"
        />

        {/* ═══════════════ TEMPLATES ═══════════════ */}
        <FeatureRow
          id="lx-templates"
          eyebrow="TEMPLATES · 开箱即用"
          title={'期刊要的格式, 我们已经准备好'}
          body={'IEEE、ACM、Springer、Elsevier、Nature、主流学位论文 —— 字体、字号、页眉页脚、参考文献样式全部配好. 打开模板, 直接填内容.'}
          bullets={[
            '100+ 主流期刊 · 会议 · 学位论文模板',
            '中英学位论文 (硕士 / 博士) 即开即用',
            '海报 · Beamer 幻灯片 · CV · 简报模板',
            '社区持续补充新模板, 一键更新',
          ]}
          mockup={<TemplatesMockup />}
          accent="#10b981"
        />

        {/* ═══════════════ COMPILE ═══════════════ */}
        <FeatureRow
          id="lx-compile"
          reversed
          eyebrow="COMPILE · 从源码到 PDF"
          title={'编译和导出, 都是一键的事'}
          body={'完整 TeX Live 发行版在云端跑 —— pdfLaTeX / XeLaTeX / LuaLaTeX / BibTeX / Biber 随你选. 编译日志按行号高亮错误, 点错误直接跳代码. 导出是一个压缩包, 里面有 PDF + 源码 + README, 直接投稿.'}
          bullets={[
            '完整 TeX Live · 与本地逐字节一致',
            '编译日志按行号高亮, 点击跳转',
            '导出压缩包含 PDF + 源码 + README',
            '符合 arXiv / 主流期刊投稿规范',
          ]}
          mockup={<CompileMockup />}
          accent="#f59e0b"
        />

        <Workflow />

        {/* ═══════════════ FAQ ═══════════════ */}
        <section id="lx-faq" className="pr-section pr-faq-section">
          <div className="pr-section-inner">
            <div className="pr-section-head">
              <span className="pr-section-eyebrow">常见问题</span>
              <h2>你可能想先问的</h2>
              <p>关于编辑器、AI 辅助、模板、编译和导出 —— 一次说清.</p>
            </div>
            <PremiumFAQ items={FAQ_ITEMS} />
          </div>
        </section>

        <FeatureCTA
          title="打开浏览器, 就开始你的下一篇论文"
          desc="免费注册, 不装任何软件, 不占本地空间 —— 实时编译预览 + AI 辅助, 现在就试."
          ctaText="打开编辑器"
          ctaTo="/latex-writer"
          accentColor={ACCENT}
        />
      </main>

      <FeatureJumpNav sections={JUMP_SECTIONS} accentColor={ACCENT} />
    </div>
  );
}
