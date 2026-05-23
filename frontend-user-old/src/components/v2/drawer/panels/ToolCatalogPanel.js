/**
 * ToolCatalogPanel —— 抽屉内"功能大全 · 导航"
 * 参考 scholay.pen [Sidebar] 功能大全 · 导航（i6tcp）
 */
import React, { useState, useMemo } from 'react';
import {
  LayoutGrid,
  Star,
  Flame,
  Heart,
  PenLine,
  Search,
  FolderTree,
  Upload,
  Code2,
  BarChart3,
  Users,
  GraduationCap,
  Briefcase,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

const TOP_LINKS = [
  { key: 'all', icon: LayoutGrid, label: '全部',     count: 328 },
  { key: 'rec', icon: Star,       label: '编辑精选', count: 24, color: '#D4A017' },
  { key: 'hot', icon: Flame,      label: '本周热门', count: null, badge: 'NEW', color: '#CC2222' },
  { key: 'fav', icon: Heart,      label: '我的收藏', count: 12, color: '#CC2222' },
];

const CATEGORIES = [
  {
    key: 'writing', icon: PenLine, label: 'AI 写作 & 润色', count: 68,
    children: [
      { key: 'ai',    label: 'AI 写作',     count: 22 },
      { key: 'proof', label: '语法 & 润色', count: 15 },
      { key: 'i18n',  label: '翻译',        count: 18 },
      { key: 'latex', label: 'LaTeX 工具',  count: 13 },
    ],
  },
  { key: 'search',  icon: Search,               label: '文献检索',    count: 42, children: [] },
  { key: 'library', icon: FolderTree,           label: '文献管理',    count: 28, children: [] },
  { key: 'submit',  icon: Upload,               label: '投稿 & 评审', count: 35, children: [] },
  { key: 'code',    icon: Code2,                label: '实验 & 代码', count: 54, children: [] },
  { key: 'data',    icon: BarChart3,            label: '数据 & 模型', count: 38, children: [] },
  { key: 'social',  icon: Users,                label: '学术社交',    count: 16, children: [] },
  { key: 'venue',   icon: GraduationCap,        label: '期刊 & 会议', count: 31, children: [] },
  { key: 'career',  icon: Briefcase,            label: '求职 & 资助', count: 16, children: [] },
];

const FILTER_GROUPS = [
  { key: 'price', label: '价格', options: [
    { key: 'free',  label: '免费' },
    { key: 'trial', label: '试用' },
    { key: 'paid',  label: '付费' },
    { key: 'edu',   label: '教育' },
  ] },
  { key: 'lang', label: '语言', options: [
    { key: 'zh',    label: '中文' },
    { key: 'en',    label: 'English' },
    { key: 'multi', label: '多语言' },
  ] },
  { key: 'src', label: '开源', options: [
    { key: 'oss',    label: '开源' },
    { key: 'closed', label: '闭源' },
  ] },
];

const ToolCatalogPanel = () => {
  const [topActive, setTopActive] = useState('all');
  const [expanded, setExpanded] = useState({ writing: true });
  const [filters, setFilters] = useState({ price: 'free' });
  const [query, setQuery] = useState('');

  const filteredCats = useMemo(() => {
    if (!query.trim()) return CATEGORIES;
    const q = query.trim().toLowerCase();
    return CATEGORIES.filter(
      (c) => c.label.toLowerCase().includes(q) ||
             c.children.some((s) => s.label.toLowerCase().includes(q)),
    );
  }, [query]);

  const toggleExpand = (key) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleChip = (group, key) =>
    setFilters((prev) => ({ ...prev, [group]: prev[group] === key ? null : key }));

  return (
    <div className="dp-panel dp-panel--tools">
      <div className="dp-section-head">
        <span>功能大全 · 黄页</span>
        <span className="dp-section-count">328 个工具</span>
      </div>

      <div className="dp-search">
        <Search size={12} strokeWidth={2} aria-hidden="true" />
        <input
          type="text"
          className="dp-search-input"
          placeholder="在 328 个工具中搜索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {TOP_LINKS.map((l) => {
        const Icon = l.icon;
        return (
          <button
            type="button"
            key={l.key}
            className={`dp-row ${topActive === l.key ? 'is-active' : ''}`}
            onClick={() => setTopActive(l.key)}
          >
            <span className="dp-row-icon" style={{ color: l.color || '#111' }}>
              <Icon size={14} strokeWidth={2} />
            </span>
            <span className="dp-row-label">{l.label}</span>
            {l.count != null && <span className="dp-row-count">{l.count}</span>}
            {l.badge && <span className="dp-badge dp-badge--new">{l.badge}</span>}
          </button>
        );
      })}

      <div className="dp-section-head">
        <span>按分类</span>
        <span className="dp-section-count">{filteredCats.length} 类</span>
      </div>

      {filteredCats.map((cat) => {
        const CatIcon = cat.icon;
        const isExpanded = !!expanded[cat.key];
        return (
          <React.Fragment key={cat.key}>
            <button
              type="button"
              className="dp-row"
              onClick={() => toggleExpand(cat.key)}
            >
              <span className="dp-row-icon" style={{ color: '#999' }}>
                {isExpanded
                  ? <ChevronDown size={12} strokeWidth={2} />
                  : <ChevronRight size={12} strokeWidth={2} />}
              </span>
              <span className="dp-row-icon" style={{ width: 'auto' }}>
                <CatIcon size={14} strokeWidth={2} />
              </span>
              <span className="dp-row-label" style={{ fontWeight: 700, color: '#111' }}>{cat.label}</span>
              <span className="dp-row-count">{cat.count}</span>
            </button>
            {isExpanded && cat.children.map((c) => (
              <button type="button" key={c.key} className="dp-subrow">
                <span className="dp-subrow-label">{c.label}</span>
                <span className="dp-subrow-count">{c.count}</span>
              </button>
            ))}
          </React.Fragment>
        );
      })}

      <div className="dp-section-head"><span>筛选</span></div>
      {FILTER_GROUPS.map((g) => (
        <div className="dp-chip-group" key={g.key}>
          <span className="dp-chip-group-label">{g.label}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {g.options.map((o) => (
              <button
                type="button"
                key={o.key}
                className={`dp-chip ${filters[g.key] === o.key ? 'is-on' : ''}`}
                onClick={() => toggleChip(g.key, o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ToolCatalogPanel;
