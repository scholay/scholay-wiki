/**
 * 空状态组件
 * 显示搜索无结果时的提示
 */
import React from 'react';
import { Empty, Button } from 'antd';
import { setSearchMode as saveSearchMode } from '../../utils/searchStorage';

const EmptyState = ({ searchState }) => {
  return (
    <div className="empty-state">
      <Empty
        image={
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-tertiary)' }}>
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        }
        description={
          <>
            <h3 className="empty-state-title">未找到相关论文</h3>
            <p className="empty-state-description">
              请尝试使用其他关键词或调整筛选条件
            </p>
          </>
        }
      >
        <Button
          type="primary"
          className="empty-state-button"
          onClick={() => {
            if (!searchState.isAuthenticated) {
              searchState.setShowAuthModal(true);
              return;
            }
            saveSearchMode('ai');
            searchState.setSearchParams(prev => {
              const newParams = new URLSearchParams(prev);
              newParams.set('mode', 'ai');
              return newParams;
            });
          }}
        >
          使用智能分析
        </Button>
      </Empty>

      {/* 搜索引导内容 - 帮助用户和爬虫了解平台功能 */}
      <div className="empty-state-guide" style={{ marginTop: '40px', textAlign: 'left', maxWidth: '680px', margin: '40px auto 0' }}>
        <h4 style={{ color: '#bdbdbd', fontSize: '1.0625rem', marginBottom: '20px', textAlign: 'center' }}>Scholay 学术搜索使用指南</h4>
        <div style={{ color: '#9e9e9e', fontSize: '0.9375rem', lineHeight: '1.85' }}>
          <p style={{ marginBottom: '14px' }}>
            <strong style={{ color: '#e0e0e0' }}>直接检索</strong> — 输入论文标题、作者名称、关键词或 DOI，从超过 2 亿篇学术论文中快速定位目标文献。支持布尔运算符（AND、OR、NOT）和精确短语检索（使用引号），可按相关度、被引次数和发表时间排序。
          </p>
          <p style={{ marginBottom: '14px' }}>
            <strong style={{ color: '#e0e0e0' }}>智能分析</strong> — 用自然语言描述你的研究问题，AI 会理解研究意图并返回最相关的文献。适合探索性研究或不确定关键词时使用，AI 还会生成深度文献综述和研究趋势分析。
          </p>
          <p style={{ marginBottom: '14px' }}>
            <strong style={{ color: '#e0e0e0' }}>论文详情与分析</strong> — 点击论文进入详情页，可查看完整的摘要、引用信息、参考文献和相似论文。使用 AI 分析功能，获取论文的核心贡献、方法论概述和创新点分析。
          </p>
          <p style={{ marginBottom: '14px' }}>
            <strong style={{ color: '#e0e0e0' }}>筛选与排序</strong> — 使用年份范围、研究领域、论文类型和开放获取等筛选条件精确缩小搜索范围，快速找到最符合需求的高质量文献。
          </p>
          <p style={{ marginBottom: '0' }}>
            <strong style={{ color: '#e0e0e0' }}>热门研究领域</strong> — Scholay 覆盖计算机科学、生物医学、物理学、化学、数学、工程学、社会科学等广泛学科，包括深度学习、量子计算、CRISPR 基因编辑、气候变化、大语言模型和新能源技术等前沿方向。
          </p>
        </div>
      </div>

      {/* 检索技巧 - 为 Googlebot 提供更多文本内容 */}
      <div style={{ marginTop: '32px', textAlign: 'left', maxWidth: '680px', margin: '32px auto 0', padding: '20px 24px', background: 'rgba(99, 102, 241, 0.04)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.1)' }}>
        <h4 style={{ color: '#bdbdbd', fontSize: '0.9375rem', marginBottom: '12px' }}>高效检索小技巧</h4>
        <ul style={{ color: '#9e9e9e', fontSize: '0.875rem', lineHeight: '1.8', margin: 0, paddingLeft: '20px' }}>
          <li>使用引号搜索精确短语，如 "transformer attention mechanism"</li>
          <li>结合 AND/OR 构建检索式，如 (deep learning OR neural network) AND medical imaging</li>
          <li>按被引次数排序，快速发现高影响力论文</li>
          <li>切换到智能分析模式，让 AI 帮你发现相关研究方向</li>
          <li>访问<a href="/resources/how-to-search" style={{ color: '#6366f1', textDecoration: 'none' }}>《如何高效检索学术文献》</a>获取更多检索策略</li>
        </ul>
      </div>
    </div>
  );
};

export default EmptyState;
