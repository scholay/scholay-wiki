/**
 * ============================================================================
 * FeaturePromo — 通用功能推广组件
 *
 * 可嵌入博客文章、资源页面、帮助中心等任意位置，
 * 以卡片式快速跳转引导用户体验平台核心功能。
 *
 * 用法:
 *   <FeaturePromo />                       — 展示全部功能
 *   <FeaturePromo highlight="peer-review" /> — 高亮审稿功能
 *   <FeaturePromo exclude={['search']} />   — 排除搜索
 *   <FeaturePromo compact />                — 紧凑模式(无标题)
 * ============================================================================
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileCheck, Code2, MessageSquare, ArrowRight, Sparkles } from 'lucide-react';
import './styles/FeaturePromo.css';

/* ── 功能元数据 ───────────────────────────────────── */
const FEATURES = [
  {
    key: 'search',
    icon: Search,
    name: '智能文献检索',
    desc: '2 亿+论文，AI 语义搜索精准匹配研究意图',
    appPath: '/',
    featurePath: '/features/search',
    accent: '#10a37f',
    tags: ['学术搜索', '文献检索', '语义搜索', 'AI搜索', '论文检索'],
  },
  {
    key: 'peer-review',
    icon: FileCheck,
    name: 'AI 智能审稿',
    desc: '三位 AI 审稿人并行评审，五维度结构化报告',
    appPath: '/peer-review',
    featurePath: '/features/peer-review',
    accent: '#8b5cf6',
    tags: ['审稿', '同行评审', 'peer review', '论文评审', '投稿'],
  },
  {
    key: 'latex-writer',
    icon: Code2,
    name: 'ScholayPrism LaTeX',
    desc: '在线编辑、实时编译、AI 辅助学术写作',
    appPath: '/latex-writer',
    featurePath: '/features/latex-writer',
    accent: '#E74C3C',
    tags: ['LaTeX', '论文写作', '学术写作', '排版', '模板'],
  },
  {
    key: 'chat',
    icon: MessageSquare,
    name: 'AI 学术助手',
    desc: '论文解读、研究问答、写作辅导一站式对话',
    appPath: '/chat',
    featurePath: null, // 暂无独立功能介绍页
    accent: '#3b82f6',
    tags: ['AI助手', '学术问答', '论文分析', 'AI对话', '智能助手'],
  },
];

/**
 * 根据文章内容自动匹配相关功能
 * @param {string} category  文章分类
 * @param {string[]} tags    文章标签
 * @returns {string|null}    最匹配的功能 key
 */
export function matchFeatureByArticle(category, tags = []) {
  const text = [category, ...tags].join(' ').toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const f of FEATURES) {
    let score = 0;
    for (const t of f.tags) {
      if (text.includes(t.toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = f.key;
    }
  }
  return best;
}

/* ── 单张功能卡片 ─────────────────────────────────── */
function FeatureCard({ feature, highlighted, navigate }) {
  const Icon = feature.icon;
  const cls = ['fp-card'];
  if (highlighted) cls.push('fp-card--highlight');

  return (
    <div
      className={cls.join(' ')}
      style={{ '--fp-accent': feature.accent }}
      onClick={() => navigate(feature.appPath)}
      role="link"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') navigate(feature.appPath); }}
    >
      <div className="fp-card-icon">
        <Icon size={20} />
      </div>
      <div className="fp-card-body">
        <h4 className="fp-card-title">{feature.name}</h4>
        <p className="fp-card-desc">{feature.desc}</p>
      </div>
      <div className="fp-card-actions">
        <button
          className="fp-card-btn fp-card-btn--primary"
          onClick={e => { e.stopPropagation(); navigate(feature.appPath); }}
        >
          立即使用 <ArrowRight size={14} />
        </button>
        {feature.featurePath && (
          <button
            className="fp-card-btn fp-card-btn--ghost"
            onClick={e => { e.stopPropagation(); navigate(feature.featurePath); }}
          >
            了解更多
          </button>
        )}
      </div>
      {highlighted && <span className="fp-card-badge">推荐</span>}
    </div>
  );
}

/* ── 主组件 ─────────────────────────────────────── */
export default function FeaturePromo({
  highlight = null,    // 高亮某个功能 key，如 'peer-review'
  exclude = [],        // 排除的功能 key 数组
  compact = false,     // 紧凑模式：隐藏标题/描述
  title,               // 自定义标题
  description,         // 自定义描述
  className = '',      // 额外 class
}) {
  const navigate = useNavigate();

  const visibleFeatures = FEATURES.filter(f => !exclude.includes(f.key));

  // 如果高亮的功能排在最前面
  if (highlight) {
    visibleFeatures.sort((a, b) => {
      if (a.key === highlight) return -1;
      if (b.key === highlight) return 1;
      return 0;
    });
  }

  return (
    <section className={`fp-section ${compact ? 'fp-section--compact' : ''} ${className}`}>
      {!compact && (
        <div className="fp-header">
          <div className="fp-header-badge">
            <Sparkles size={13} />
            探索 Scholay 全部功能
          </div>
          <h3 className="fp-header-title">
            {title || '用 AI 工具加速你的科研工作流'}
          </h3>
          {(description !== false) && (
            <p className="fp-header-desc">
              {description || '从文献检索到论文写作，从 AI 审稿到智能问答 —— 一站式学术生产力平台'}
            </p>
          )}
        </div>
      )}

      <div className={`fp-grid fp-grid--${visibleFeatures.length}`}>
        {visibleFeatures.map(f => (
          <FeatureCard
            key={f.key}
            feature={f}
            highlighted={f.key === highlight}
            navigate={navigate}
          />
        ))}
      </div>
    </section>
  );
}
