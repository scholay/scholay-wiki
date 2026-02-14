/**
 * 空状态组件
 * 显示搜索无结果时的提示
 */
import React from 'react';
import { setSearchMode as saveSearchMode } from '../../utils/searchStorage';

const EmptyState = ({ searchState }) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
      </div>
      <h3 className="empty-state-title">未找到相关论文</h3>
      <p className="empty-state-description">
        请尝试使用其他关键词或调整筛选条件
      </p>

      <div className="empty-state-actions">
        <button
          className="empty-state-button primary"
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
        </button>
      </div>

      {/* 搜索引导内容 - 帮助用户和爬虫了解平台功能 */}
      <div className="empty-state-guide" style={{ marginTop: '40px', textAlign: 'left', maxWidth: '600px', margin: '40px auto 0' }}>
        <h4 style={{ color: '#bdbdbd', fontSize: '1rem', marginBottom: '16px', textAlign: 'center' }}>Scholay 学术搜索使用指南</h4>
        <div style={{ color: '#9e9e9e', fontSize: '0.9rem', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '12px' }}>
            <strong style={{ color: '#e0e0e0' }}>直接检索</strong> - 输入论文标题、作者名称、关键词或 DOI，快速从超过 2 亿篇学术论文中找到您需要的文献。
          </p>
          <p style={{ marginBottom: '12px' }}>
            <strong style={{ color: '#e0e0e0' }}>智能分析</strong> - 使用 AI 驱动的智能分析模式，获取深度文献综述、研究趋势分析和相关论文推荐。
          </p>
          <p style={{ marginBottom: '0' }}>
            <strong style={{ color: '#e0e0e0' }}>热门研究领域</strong> - 深度学习、量子计算、CRISPR 基因编辑、气候变化、大语言模型、新能源技术等前沿领域均有丰富收录。
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmptyState;
