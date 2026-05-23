/**
 * ============================================================================
 * DocsLayout — Wiki/文档风格侧边栏布局
 *
 * 用于资源中心、博客、帮助中心等内容页面。
 * 左侧固定导航目录，右侧内容区域（通过 Outlet 渲染子页面）。
 * ============================================================================
 */

import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  BookOpen, Search, Code, Sparkles, HelpCircle,
  ChevronDown, ChevronRight, PenTool, Shield, Brain, Newspaper,
  Menu, X, Zap,
} from 'lucide-react';
import FeaturePromo from './FeaturePromo';
import './styles/DocsLayout.css';

/* ── 导航数据 ─────────────────────────────────── */
const NAV_SECTIONS = [
  {
    id: 'resources',
    label: '学术资源',
    icon: BookOpen,
    basePath: '/resources',
    groups: [
      {
        label: '研究方法',
        icon: Search,
        items: [
          { slug: 'how-to-search', title: '高效检索学术文献' },
          { slug: 'research-methodology', title: '研究方法论入门' },
          { slug: 'academic-conference-guide', title: '学术会议完全指南' },
          { slug: 'research-data-management', title: '科研数据管理' },
        ],
      },
      {
        label: '论文写作',
        icon: PenTool,
        items: [
          { slug: 'literature-review-guide', title: '文献综述撰写攻略' },
          { slug: 'paper-writing-tips', title: '学术论文写作技巧' },
          { slug: 'academic-english-writing', title: '学术英语写作' },
        ],
      },
      {
        label: '学术规范',
        icon: Shield,
        items: [
          { slug: 'citation-guide', title: '学术引用格式指南' },
          { slug: 'peer-review-guide', title: '同行评审完全指南' },
          { slug: 'open-access-guide', title: '开放获取发表指南' },
          { slug: 'systematic-review-meta-analysis', title: '系统综述与Meta分析' },
        ],
      },
      {
        label: '工具教程',
        icon: Code,
        items: [
          { slug: 'latex-tutorial', title: 'LaTeX 入门教程' },
          { slug: 'ai-in-research', title: 'AI 在学术研究中的应用' },
        ],
      },
    ],
  },
  {
    id: 'blog',
    label: '博客',
    icon: Newspaper,
    basePath: '/blog',
    groups: [
      {
        label: '学术搜索',
        icon: Search,
        items: [
          { slug: 'ai-literature-search-efficiency', title: 'AI 提升文献检索效率' },
          { slug: 'academic-search-tools-comparison-2026', title: '2026 搜索工具对比' },
          { slug: 'semantic-scholar-vs-google-scholar', title: 'AI 学术搜索 vs Google Scholar' },
          { slug: 'cross-disciplinary-search-strategies', title: '跨学科检索策略' },
          { slug: 'common-search-mistakes-solutions', title: '常见搜索错误与解决' },
        ],
      },
      {
        label: 'AI 与学术',
        icon: Brain,
        items: [
          { slug: 'ai-academic-writing-ethics', title: 'AI 学术写作伦理' },
          { slug: 'ai-tools-research-workflow-2026', title: 'AI 工具重塑科研工作流' },
        ],
      },
      {
        label: '行业观察',
        icon: Sparkles,
        items: [
          { slug: 'peer-review-process-explained', title: '同行评审流程揭秘' },
          { slug: 'conference-vs-journal-papers', title: '会议论文 vs 期刊论文' },
          { slug: 'citation-trend-discovery', title: '学术引用趋势' },
          { slug: 'scholay-platform-complete-guide', title: 'Scholay 平台完全指南' },
        ],
      },
    ],
  },
  {
    id: 'help',
    label: '帮助中心',
    icon: HelpCircle,
    basePath: '/help',
    groups: [],
    isLink: true, // 直接跳转，不展开子项
  },
];

/* ── 导航分组组件 ─────────────────────────────── */
function NavGroup({ group, basePath, currentPath, onNavigate }) {
  const hasActive = group.items.some(item => currentPath === `${basePath}/${item.slug}`);
  const [open, setOpen] = useState(hasActive);
  const Icon = group.icon;

  return (
    <div className="docs-nav-group">
      <button
        className={`docs-nav-group-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <Icon size={14} />
        <span>{group.label}</span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && (
        <div className="docs-nav-items">
          {group.items.map(item => {
            const path = `${basePath}/${item.slug}`;
            const active = currentPath === path;
            return (
              <button
                key={item.slug}
                className={`docs-nav-item ${active ? 'active' : ''}`}
                onClick={() => onNavigate(path)}
              >
                {item.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── 主布局 ───────────────────────────────────── */
export default function DocsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentPath = location.pathname;

  // 找到当前激活的顶级 section
  const activeSection = NAV_SECTIONS.find(s =>
    currentPath === s.basePath || currentPath.startsWith(s.basePath + '/')
  );

  const handleNavigate = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const sidebar = (
    <nav className="docs-sidebar-nav">
      {NAV_SECTIONS.map(section => {
        const SectionIcon = section.icon;
        const isActive = activeSection?.id === section.id;

        if (section.isLink) {
          return (
            <div key={section.id} className="docs-nav-section">
              <button
                className={`docs-nav-section-btn ${currentPath === section.basePath ? 'active' : ''}`}
                onClick={() => handleNavigate(section.basePath)}
              >
                <SectionIcon size={15} />
                <span>{section.label}</span>
              </button>
            </div>
          );
        }

        return (
          <div key={section.id} className={`docs-nav-section ${isActive ? 'expanded' : ''}`}>
            <button
              className={`docs-nav-section-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleNavigate(section.basePath)}
            >
              <SectionIcon size={15} />
              <span>{section.label}</span>
            </button>
            {isActive && section.groups.map((group, i) => (
              <NavGroup
                key={i}
                group={group}
                basePath={section.basePath}
                currentPath={currentPath}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="docs-layout">
      {/* Mobile toggle */}
      <button
        className="docs-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle navigation"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        <span>文档导航</span>
      </button>

      {/* Sidebar */}
      <aside className={`docs-sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="docs-sidebar-header">
          <span className="docs-sidebar-header-eyebrow">
            <BookOpen size={11} />
            文档中心
          </span>
          <span className="docs-sidebar-header-title">Scholay 知识库</span>
        </div>
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="docs-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Content */}
      <main className="docs-content">
        <Outlet />
      </main>

      {/* Right sidebar — 功能推广 */}
      <aside className="docs-aside">
        <div className="docs-aside-label">
          <Zap size={11} />
          快捷功能
        </div>
        <FeaturePromo compact exclude={['search']} />
      </aside>
    </div>
  );
}
