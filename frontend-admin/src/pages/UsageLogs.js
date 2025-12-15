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
import './UsageLogs.css';

const UsageLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  
  // 筛选条件
  const [filters, setFilters] = useState({
    feature_code: '',
    action: '',
    entry_point: '',
    ip_address: '',
    start_date: '',
    end_date: '',
    keyword: '',
  });
  
  // 筛选选项
  const [filterOptions, setFilterOptions] = useState({
    features: [],
    actions: [],
    entry_points: [],
  });
  
  // 统计摘要
  const [summary, setSummary] = useState(null);
  const [showSummary, setShowSummary] = useState(true);

  // 获取筛选选项
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const response = await api.get('/admin/usage-logs/filter-options');
        if (response.data.code === 0) {
          setFilterOptions(response.data.data);
        }
      } catch (error) {
        console.error('获取筛选选项失败:', error);
      }
    };
    fetchFilterOptions();
  }, []);

  // 获取统计摘要
  const fetchSummary = useCallback(async () => {
    try {
      const response = await api.get('/admin/usage-logs/summary', {
        params: { days: 7 }
      });
      if (response.data.code === 0) {
        setSummary(response.data.data);
      }
    } catch (error) {
      console.error('获取统计摘要失败:', error);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // 获取日志列表
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        page_size: pageSize,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== '')
        ),
      };
      const response = await api.get('/admin/usage-logs', { params });
      if (response.data.code === 0) {
        setLogs(response.data.data.logs || []);
        setTotal(response.data.data.total || 0);
      }
    } catch (error) {
      console.error('获取日志失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 处理筛选条件变化
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  // 重置筛选条件
  const handleResetFilters = () => {
    setFilters({
      feature_code: '',
      action: '',
      entry_point: '',
      ip_address: '',
      start_date: '',
      end_date: '',
      keyword: '',
    });
    setPage(1);
  };

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
      second: '2-digit',
    });
  };

  // 获取功能名称颜色
  const getFeatureColor = (featureCode) => {
    const colors = {
      academic_search: '#3b82f6',
      paper_detail: '#6366f1',
      similar_papers: '#8b5cf6',
      smart_analysis: '#ec4899',
      paper_dimension: '#f43f5e',
      ai_chat: '#14b8a6',
      ai_peer_review: '#f59e0b',
      ai_assistant: '#84cc16',
      user_login: '#22c55e',
      user_register: '#10b981',
      user_checkin: '#06b6d4',
    };
    return colors[featureCode] || '#6b7280';
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="ul-container">
      <div className="ul-header">
        <h1>功能使用统计</h1>
        <p>查看和分析用户的功能使用情况</p>
      </div>

      {/* 统计摘要 */}
      {showSummary && summary && (
        <div className="ul-summary">
          <div className="ul-summary-header">
            <h3>统计概览</h3>
            <button 
              className="ul-summary-toggle"
              onClick={() => setShowSummary(false)}
            >
              收起
            </button>
          </div>
          <div className="ul-summary-cards">
            <div className="ul-summary-card">
              <div className="ul-summary-value">{summary.total_count?.toLocaleString()}</div>
              <div className="ul-summary-label">总记录数</div>
            </div>
            <div className="ul-summary-card">
              <div className="ul-summary-value">{summary.today_count?.toLocaleString()}</div>
              <div className="ul-summary-label">今日记录</div>
            </div>
            <div className="ul-summary-card">
              <div className="ul-summary-value">{summary.unique_users?.toLocaleString()}</div>
              <div className="ul-summary-label">独立用户</div>
            </div>
            <div className="ul-summary-card">
              <div className="ul-summary-value">{summary.unique_sessions?.toLocaleString()}</div>
              <div className="ul-summary-label">独立会话</div>
            </div>
          </div>
          
          {/* 功能使用分布 */}
          {summary.feature_counts && summary.feature_counts.length > 0 && (
            <div className="ul-feature-stats">
              <h4>功能使用分布</h4>
              <div className="ul-feature-bars">
                {summary.feature_counts.slice(0, 8).map((item, index) => (
                  <div key={index} className="ul-feature-bar-item">
                    <div className="ul-feature-bar-label">
                      <span 
                        className="ul-feature-dot"
                        style={{ backgroundColor: getFeatureColor(item.feature_code) }}
                      />
                      <span>{item.feature_name}</span>
                    </div>
                    <div className="ul-feature-bar-wrapper">
                      <div 
                        className="ul-feature-bar"
                        style={{ 
                          width: `${(item.count / summary.feature_counts[0].count) * 100}%`,
                          backgroundColor: getFeatureColor(item.feature_code)
                        }}
                      />
                    </div>
                    <span className="ul-feature-count">{item.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {!showSummary && (
        <button 
          className="ul-summary-expand"
          onClick={() => setShowSummary(true)}
        >
          展开统计概览
        </button>
      )}

      {/* 筛选区域 */}
      <div className="ul-filters">
        <div className="ul-filters-row">
          <div className="ul-filter-group">
            <label>功能</label>
            <select
              value={filters.feature_code}
              onChange={(e) => handleFilterChange('feature_code', e.target.value)}
            >
              <option value="">全部功能</option>
              {filterOptions.features?.map(f => (
                <option key={f.feature_code} value={f.feature_code}>
                  {f.feature_name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="ul-filter-group">
            <label>操作类型</label>
            <select
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
            >
              <option value="">全部操作</option>
              {filterOptions.actions?.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          
          <div className="ul-filter-group">
            <label>入口位置</label>
            <select
              value={filters.entry_point}
              onChange={(e) => handleFilterChange('entry_point', e.target.value)}
            >
              <option value="">全部入口</option>
              {filterOptions.entry_points?.map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          
          <div className="ul-filter-group">
            <label>IP地址</label>
            <input
              type="text"
              placeholder="搜索IP"
              value={filters.ip_address}
              onChange={(e) => handleFilterChange('ip_address', e.target.value)}
            />
          </div>
        </div>
        
        <div className="ul-filters-row">
          <div className="ul-filter-group">
            <label>开始日期</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
            />
          </div>
          
          <div className="ul-filter-group">
            <label>结束日期</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
            />
          </div>
          
          <div className="ul-filter-group ul-filter-keyword">
            <label>关键词</label>
            <input
              type="text"
              placeholder="搜索功能名称、路径、用户名..."
              value={filters.keyword}
              onChange={(e) => handleFilterChange('keyword', e.target.value)}
            />
          </div>
          
          <button className="ul-reset-btn" onClick={handleResetFilters}>
            重置筛选
          </button>
        </div>
      </div>

      {/* 日志列表 */}
      <div className="ul-table-container">
        <table className="ul-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>功能</th>
              <th>操作</th>
              <th>入口</th>
              <th>用户</th>
              <th>IP地址</th>
              <th>设备</th>
              <th>来源页面</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="ul-loading">加载中...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="8" className="ul-empty">暂无数据</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td className="ul-time">{formatTime(log.created_at)}</td>
                  <td>
                    <span 
                      className="ul-feature-tag"
                      style={{ 
                        backgroundColor: `${getFeatureColor(log.feature_code)}20`,
                        color: getFeatureColor(log.feature_code),
                        borderColor: getFeatureColor(log.feature_code)
                      }}
                    >
                      {log.feature_name}
                    </span>
                  </td>
                  <td>{log.action}</td>
                  <td className="ul-entry">{log.entry_point || '-'}</td>
                  <td className="ul-user">
                    {log.username || log.email || (log.user_id ? `用户#${log.user_id}` : '匿名')}
                  </td>
                  <td className="ul-ip">{log.ip_address || '-'}</td>
                  <td className="ul-device">
                    <span className="ul-device-type">{log.device_type}</span>
                    {log.browser && <span className="ul-browser">{log.browser}</span>}
                  </td>
                  <td className="ul-referer" title={log.referer_path}>
                    {log.referer_path ? (log.referer_path.length > 30 ? log.referer_path.substring(0, 30) + '...' : log.referer_path) : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {total > 0 && (
        <div className="ul-pagination">
          <span className="ul-pagination-info">
            共 {total.toLocaleString()} 条记录，第 {page} / {totalPages} 页
          </span>
          <div className="ul-pagination-buttons">
            <button 
              disabled={page <= 1}
              onClick={() => setPage(1)}
            >
              首页
            </button>
            <button 
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              上一页
            </button>
            <button 
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              下一页
            </button>
            <button 
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              末页
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsageLogs;
