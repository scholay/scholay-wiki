/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import './HotContent.css';

// 时间范围选项
const DATE_RANGE_OPTIONS = [
  { value: 7, label: '近7天' },
  { value: 15, label: '近15天' },
  { value: 30, label: '近30天' },
  { value: 60, label: '近60天' },
  { value: 90, label: '近3个月' },
  { value: 180, label: '近6个月' },
];

const HotContent = () => {
  // Tab切换
  const [activeTab, setActiveTab] = useState('keywords'); // 'keywords' | 'papers'
  
  // 时间范围
  const [days, setDays] = useState(30);
  
  // 关键词数据
  const [keywords, setKeywords] = useState([]);
  const [keywordsTotal, setKeywordsTotal] = useState(0);
  const [keywordsPage, setKeywordsPage] = useState(1);
  const [keywordsLoading, setKeywordsLoading] = useState(false);
  
  // 论文数据
  const [papers, setPapers] = useState([]);
  const [papersTotal, setPapersTotal] = useState(0);
  const [papersPage, setPapersPage] = useState(1);
  const [papersLoading, setPapersLoading] = useState(false);
  
  // 统计信息
  const [stats, setStats] = useState(null);
  
  // 清理状态
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
  
  const pageSize = 20;

  // 获取统计信息
  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get('/admin/hot-content/stats');
      if (response.data.code === 0) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('获取统计信息失败:', error);
    }
  }, []);

  // 获取热门关键词
  const fetchKeywords = useCallback(async () => {
    setKeywordsLoading(true);
    try {
      const response = await api.get('/admin/hot-content/keywords', {
        params: {
          days,
          page: keywordsPage,
          page_size: pageSize,
        },
      });
      if (response.data.code === 0) {
        setKeywords(response.data.data.items || []);
        setKeywordsTotal(response.data.data.total || 0);
      }
    } catch (error) {
      console.error('获取热门关键词失败:', error);
    } finally {
      setKeywordsLoading(false);
    }
  }, [days, keywordsPage]);

  // 获取热门论文
  const fetchPapers = useCallback(async () => {
    setPapersLoading(true);
    try {
      const response = await api.get('/admin/hot-content/papers', {
        params: {
          days,
          page: papersPage,
          page_size: pageSize,
        },
      });
      if (response.data.code === 0) {
        setPapers(response.data.data.items || []);
        setPapersTotal(response.data.data.total || 0);
      }
    } catch (error) {
      console.error('获取热门论文失败:', error);
    } finally {
      setPapersLoading(false);
    }
  }, [days, papersPage]);

  // 手动清理
  const handleCleanup = async () => {
    setCleanupLoading(true);
    try {
      const response = await api.post('/admin/hot-content/cleanup');
      if (response.data.code === 0) {
        const data = response.data.data;
        alert(`清理完成！\n删除关键词: ${data.keywords_deleted} 条\n删除论文: ${data.papers_deleted} 条`);
        // 刷新数据
        fetchStats();
        if (activeTab === 'keywords') {
          fetchKeywords();
        } else {
          fetchPapers();
        }
      }
    } catch (error) {
      console.error('清理失败:', error);
      alert('清理失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setCleanupLoading(false);
      setShowCleanupConfirm(false);
    }
  };

  // 初始化加载
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // 根据Tab加载数据
  useEffect(() => {
    if (activeTab === 'keywords') {
      fetchKeywords();
    } else {
      fetchPapers();
    }
  }, [activeTab, fetchKeywords, fetchPapers]);

  // 时间范围变化时重置页码
  useEffect(() => {
    setKeywordsPage(1);
    setPapersPage(1);
  }, [days]);

  // 格式化时间
  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    const date = new Date(timeStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 截断文本
  const truncateText = (text, maxLength = 100) => {
    if (!text) return '-';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  // 渲染分页
  const renderPagination = (total, currentPage, setPage) => {
    const totalPages = Math.ceil(total / pageSize);
    if (totalPages <= 1) return null;

    return (
      <div className="hc-pagination">
        <button
          className="hc-page-btn"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={currentPage === 1}
        >
          上一页
        </button>
        <span className="hc-page-info">
          第 {currentPage} / {totalPages} 页 (共 {total} 条)
        </span>
        <button
          className="hc-page-btn"
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
        >
          下一页
        </button>
      </div>
    );
  };

  return (
    <div className="hc-container">
      {/* 页面标题 */}
      <div className="hc-header">
        <h1 className="hc-title">热门内容统计</h1>
        <p className="hc-subtitle">
          统计热门搜索词和热门论文，数据保留最近6个月，最多10万条记录
        </p>
      </div>

      {/* 统计概览 */}
      {stats && (
        <div className="hc-stats-cards">
          <div className="hc-stat-card">
            <div className="hc-stat-value">{stats.keywords_count?.toLocaleString() || 0}</div>
            <div className="hc-stat-label">搜索关键词总数</div>
          </div>
          <div className="hc-stat-card">
            <div className="hc-stat-value">{stats.papers_count?.toLocaleString() || 0}</div>
            <div className="hc-stat-label">论文记录总数</div>
          </div>
          <div className="hc-stat-card">
            <div className="hc-stat-value">{stats.retention_days || 180}天</div>
            <div className="hc-stat-label">数据保留期限</div>
          </div>
          <div className="hc-stat-card">
            <div className="hc-stat-value">{(stats.max_records || 100000).toLocaleString()}</div>
            <div className="hc-stat-label">最大记录数</div>
          </div>
        </div>
      )}

      {/* 工具栏 */}
      <div className="hc-toolbar">
        <div className="hc-toolbar-left">
          {/* Tab切换 */}
          <div className="hc-tabs">
            <button
              className={`hc-tab ${activeTab === 'keywords' ? 'active' : ''}`}
              onClick={() => setActiveTab('keywords')}
            >
              热门搜索词
            </button>
            <button
              className={`hc-tab ${activeTab === 'papers' ? 'active' : ''}`}
              onClick={() => setActiveTab('papers')}
            >
              热门论文
            </button>
          </div>
          
          {/* 时间范围选择 */}
          <select
            className="hc-select"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {DATE_RANGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        
        <div className="hc-toolbar-right">
          <button
            className="hc-cleanup-btn"
            onClick={() => setShowCleanupConfirm(true)}
            disabled={cleanupLoading}
          >
            {cleanupLoading ? '清理中...' : '手动清理'}
          </button>
        </div>
      </div>

      {/* 热门搜索词表格 */}
      {activeTab === 'keywords' && (
        <div className="hc-table-container">
          {keywordsLoading ? (
            <div className="hc-loading">加载中...</div>
          ) : keywords.length === 0 ? (
            <div className="hc-empty">暂无数据</div>
          ) : (
            <>
              <table className="hc-table">
                <thead>
                  <tr>
                    <th className="col-rank">排名</th>
                    <th>搜索关键词</th>
                    <th className="col-count">搜索次数</th>
                    <th className="col-time-sm">首次搜索</th>
                    <th className="col-time-sm">最近搜索</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((item, index) => (
                    <tr key={item.id}>
                      <td className="hc-rank">
                        <span className={`hc-rank-badge ${index < 3 ? `top-${index + 1}` : ''}`}>
                          {(keywordsPage - 1) * pageSize + index + 1}
                        </span>
                      </td>
                      <td className="hc-keyword">{item.keyword}</td>
                      <td className="hc-count">{item.search_count?.toLocaleString()}</td>
                      <td className="hc-time">{formatTime(item.first_searched_at)}</td>
                      <td className="hc-time">{formatTime(item.last_searched_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {renderPagination(keywordsTotal, keywordsPage, setKeywordsPage)}
            </>
          )}
        </div>
      )}

      {/* 热门论文表格 */}
      {activeTab === 'papers' && (
        <div className="hc-table-container">
          {papersLoading ? (
            <div className="hc-loading">加载中...</div>
          ) : papers.length === 0 ? (
            <div className="hc-empty">暂无数据</div>
          ) : (
            <>
              <table className="hc-table">
                <thead>
                  <tr>
                    <th className="col-rank">排名</th>
                    <th>论文标题</th>
                    <th className="col-doi">DOI</th>
                    <th className="col-year">年份</th>
                    <th className="col-views">查看次数</th>
                    <th className="col-time">最近查看</th>
                  </tr>
                </thead>
                <tbody>
                  {papers.map((item, index) => (
                    <tr key={item.id}>
                      <td className="hc-rank">
                        <span className={`hc-rank-badge ${index < 3 ? `top-${index + 1}` : ''}`}>
                          {(papersPage - 1) * pageSize + index + 1}
                        </span>
                      </td>
                      <td className="hc-paper-title">
                        <div className="hc-paper-title-text" title={item.title}>
                          {truncateText(item.title, 80)}
                        </div>
                        {item.paper_id && (
                          <div className="hc-paper-id">ID: {item.paper_id}</div>
                        )}
                      </td>
                      <td className="hc-doi">
                        {item.doi ? (
                          <a
                            href={`https://doi.org/${item.doi}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hc-doi-link"
                          >
                            {truncateText(item.doi, 20)}
                          </a>
                        ) : '-'}
                      </td>
                      <td className="hc-year">{item.year || '-'}</td>
                      <td className="hc-count">{item.view_count?.toLocaleString()}</td>
                      <td className="hc-time">{formatTime(item.last_viewed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {renderPagination(papersTotal, papersPage, setPapersPage)}
            </>
          )}
        </div>
      )}

      {/* 清理确认弹窗 */}
      {showCleanupConfirm && (
        <div className="hc-modal-overlay" onClick={() => setShowCleanupConfirm(false)}>
          <div className="hc-modal" onClick={e => e.stopPropagation()}>
            <h3 className="hc-modal-title">确认清理</h3>
            <p className="hc-modal-text">
              此操作将清理超过6个月的数据，以及超出10万条限制的旧数据。确定要继续吗？
            </p>
            <div className="hc-modal-actions">
              <button
                className="hc-modal-btn cancel"
                onClick={() => setShowCleanupConfirm(false)}
              >
                取消
              </button>
              <button
                className="hc-modal-btn confirm"
                onClick={handleCleanup}
                disabled={cleanupLoading}
              >
                {cleanupLoading ? '清理中...' : '确认清理'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HotContent;
