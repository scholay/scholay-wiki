/**
 * HomeMenuPanel —— 抽屉内首页"全功能"导航
 * 参考 scholay.pen [Sidebar] 首页 · 全功能（n0GFZR）
 *
 * 4 个 section：工作流 / AI 工具 / 最近活动 / 其他
 * 全部图标使用 lucide-react 矢量。
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Library,
  LayoutGrid,
  ClipboardList,
  Gem,
  PawPrint,
  Settings,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';
import { useDrawerV2 } from '../../../../stores/drawerV2.store';

const WORKFLOW = [
  { icon: Search,        title: '文献搜索', sub: '自然语言 + 矩阵分析',  path: '/search-results' },
  { icon: Library,       title: '文献集',   sub: '收藏夹 · 标签',         path: '/library' },
  { icon: LayoutGrid,    title: '工具大全', sub: '328 个学术工具',        path: '/features' },
  { icon: ClipboardList, title: '智能审稿', sub: 'AI 多维度评审',         path: '/peer-review-v2' },
];

const AI_TOOLS = [
  { icon: Gem,      title: 'Prism', sub: 'AI 写作 · LaTeX 编辑器', path: '/latex-writer', serif: true },
  { icon: PawPrint, title: 'Claw',  sub: 'AI 助手 · 学术对话',     path: '/chat',          serif: true },
];

const HomeMenuPanel = () => {
  const navigate = useNavigate();
  const { close } = useDrawerV2();

  const go = (path) => () => {
    navigate(path);
    close();
  };

  const renderCard = (item) => {
    const Icon = item.icon;
    return (
      <button type="button" key={item.title} className="dp-card-row" onClick={go(item.path)}>
        <span className="dp-card-icon"><Icon size={15} strokeWidth={2} /></span>
        <span className="dp-card-col">
          <span
            className="dp-card-title"
            style={item.serif ? { fontFamily: 'Playfair Display, Georgia, serif' } : undefined}
          >
            {item.title}
          </span>
          <span className="dp-card-sub">{item.sub}</span>
        </span>
        <span className="dp-row-chev"><ChevronRight size={14} strokeWidth={2} /></span>
      </button>
    );
  };

  return (
    <div className="dp-panel dp-panel--home">
      <div className="dp-section-head"><span>工作流</span></div>
      {WORKFLOW.map(renderCard)}

      <div className="dp-section-head">
        <span>AI 工具</span>
        <span className="dp-badge dp-badge--beta">BETA</span>
      </div>
      {AI_TOOLS.map(renderCard)}

      <div className="dp-section-head"><span>最近活动</span></div>
      <div className="dp-empty" style={{ padding: '8px 16px 16px' }}>
        <p className="dp-empty-desc" style={{ fontSize: 11 }}>
          这里将展示你最近的搜索、收藏与编辑活动。
        </p>
      </div>

      <div className="dp-section-head"><span>其他</span></div>
      <button type="button" className="dp-row" onClick={go('/settings')}>
        <span className="dp-row-icon"><Settings size={14} strokeWidth={2} /></span>
        <span className="dp-row-label" style={{ fontWeight: 400 }}>设置</span>
      </button>
      <button type="button" className="dp-row" onClick={go('/help')}>
        <span className="dp-row-icon"><HelpCircle size={14} strokeWidth={2} /></span>
        <span className="dp-row-label" style={{ fontWeight: 400 }}>帮助与反馈</span>
      </button>
    </div>
  );
};

export default HomeMenuPanel;
