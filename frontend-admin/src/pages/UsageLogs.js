/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import './UsageLogs.css';

// 时间范围选项
const DATE_RANGE_OPTIONS = [
  { value: 1, label: '今天' },
  { value: 7, label: '近7天' },
  { value: 15, label: '近15天' },
  { value: 30, label: '近30天' },
  { value: 90, label: '近3个月' },
  { value: 'custom', label: '自定义' },
];

// 保留天数选项
const RETENTION_OPTIONS = [
  { value: 30, label: '30天' },
  { value: 60, label: '60天' },
  { value: 90, label: '90天' },
  { value: 180, label: '180天（半年）' },
  { value: 365, label: '365天（一年）' },
  { value: 730, label: '730天（两年）' },
];

const UsageLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  
  // 全局时间范围控制（默认7天）
  const [dateRange, setDateRange] = useState(7);
  
  // 自定义日期范围
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);
  
  // 配置状态
  const [config, setConfig] = useState(null);
  const [retentionDays, setRetentionDays] = useState(180);
  const [configLoading, setConfigLoading] = useState(false);
  const [showRetentionEdit, setShowRetentionEdit] = useState(false);
  const [oldLogsCount, setOldLogsCount] = useState(0);
  
  // 清空数据确认框状态
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearLoading, setClearLoading] = useState(false);
  
  // 筛选条件（列级筛选）
  const [filters, setFilters] = useState({
    feature_code: '',
    action: '',
    entry_point: '',
    ip_address: '',
    keyword: '',
    device_type: '',
    browser: '',
  });
  
  // 筛选选项
  const [filterOptions, setFilterOptions] = useState({
    features: [],
    actions: [],
    entry_points: [],
    device_types: [],
    browsers: [],
  });
  
  // 是否有任何筛选条件
  const hasActiveFilters = Object.values(filters).some(v => v !== '');
  
  // 统计摘要
  const [summary, setSummary] = useState(null);
  const [showSummary, setShowSummary] = useState(true);

  // 获取配置
  const fetchConfig = useCallback(async () => {
    try {
      const response = await api.get('/admin/usage-logs/config');
      if (response.data.code === 0) {
        setConfig(response.data.data.config);
        setRetentionDays(response.data.data.config?.retention_days || 180);
        setOldLogsCount(response.data.data.old_logs_count || 0);
      }
    } catch (error) {
      console.error('获取配置失败:', error);
    }
  }, []);

  // 更新配置
  const handleUpdateConfig = async () => {
    setConfigLoading(true);
    try {
      const response = await api.put('/admin/usage-logs/config', {
        retention_days: retentionDays
      });
      if (response.data.code === 0) {
        setConfig(response.data.data);
        setShowRetentionEdit(false);
        // 刷新配置以获取最新的过期日志数量
        fetchConfig();
      }
    } catch (error) {
      console.error('更新配置失败:', error);
      alert('更新配置失败');
    } finally {
      setConfigLoading(false);
    }
  };

  // 清空全部数据
  const handleClearAllLogs = async () => {
    setClearLoading(true);
    try {
      const response = await api.delete('/admin/usage-logs/all');
      if (response.data.code === 0) {
        alert(`已成功清空 ${response.data.data.deleted_count.toLocaleString()} 条记录`);
        setShowClearConfirm(false);
        // 刷新数据
        fetchLogs();
        fetchSummary();
        fetchConfig();
      } else {
        alert(response.data.message || '清空数据失败');
      }
    } catch (error) {
      console.error('清空数据失败:', error);
      alert('清空数据失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setClearLoading(false);
    }
  };

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
    fetchConfig();
  }, [fetchConfig]);

  // 获取统计摘要
  const fetchSummary = useCallback(async () => {
    try {
      let params = {};
      if (dateRange === 'custom' && customStartDate && customEndDate) {
        params = { start_date: customStartDate, end_date: customEndDate };
      } else if (dateRange !== 'custom') {
        params = { days: dateRange };
      }
      
      // 如果有功能筛选，添加到参数中（用于趋势图筛选）
      if (filters.feature_code) {
        params.feature_code = filters.feature_code;
      }
      
      const response = await api.get('/admin/usage-logs/summary', { params });
      if (response.data.code === 0) {
        setSummary(response.data.data);
      }
    } catch (error) {
      console.error('获取统计摘要失败:', error);
    }
  }, [dateRange, customStartDate, customEndDate, filters.feature_code]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // 获取日志列表
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let params = {
        page,
        page_size: pageSize,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== '')
        ),
      };
      
      // 根据时间范围类型添加不同的参数
      if (dateRange === 'custom' && customStartDate && customEndDate) {
        params.start_date = customStartDate;
        params.end_date = customEndDate;
      } else if (dateRange !== 'custom') {
        params.days = dateRange;
      }
      
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
  }, [page, pageSize, filters, dateRange, customStartDate, customEndDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 处理时间范围变化
  const handleDateRangeChange = (value) => {
    if (value === 'custom') {
      setShowCustomDatePicker(true);
      // 如果还没有设置自定义日期，设置默认值（最近7天）
      if (!customStartDate || !customEndDate) {
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 7);
        setCustomEndDate(today.toISOString().split('T')[0]);
        setCustomStartDate(sevenDaysAgo.toISOString().split('T')[0]);
      }
    } else {
      setShowCustomDatePicker(false);
    }
    setDateRange(value);
    setPage(1);
  };
  
  // 应用自定义日期范围
  const handleApplyCustomDate = () => {
    if (customStartDate && customEndDate) {
      // 验证日期范围
      if (new Date(customStartDate) > new Date(customEndDate)) {
        alert('开始日期不能大于结束日期');
        return;
      }
      // 触发重新获取数据
      fetchLogs();
      fetchSummary();
    }
  };
  
  // 获取当前时间范围的显示文本
  const getDateRangeLabel = () => {
    if (dateRange === 'custom' && customStartDate && customEndDate) {
      return `${customStartDate} 至 ${customEndDate}`;
    }
    return DATE_RANGE_OPTIONS.find(o => o.value === dateRange)?.label || '';
  };

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
      keyword: '',
      device_type: '',
      browser: '',
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

  // 刷新所有数据
  const handleRefresh = useCallback(() => {
    fetchLogs();
    fetchSummary();
    fetchConfig();
  }, [fetchLogs, fetchSummary, fetchConfig]);

  // 获取功能名称颜色（16个功能追踪点）
  const getFeatureColor = (featureCode) => {
    const colors = {
      // 用户类 - 青色系
      user_checkin: '#06b6d4',
      // 检索类 - 蓝色系
      direct_search: '#3b82f6',
      smart_search: '#6366f1',
      search_suggestion: '#818cf8',
      // 翻译类 - 紫色系
      abstract_translate: '#a855f7',
      // 分析类 - 粉色系
      matrix_analysis: '#ec4899',
      matrix_add_dimension: '#f472b6',
      // 工具类 - 橙色系
      pdf_preview: '#f97316',
      // 对话类 - 绿色系
      smart_analysis_chat: '#10b981',
      ai_assistant_chat: '#22c55e',
      ai_peer_review: '#84cc16',
      // 落地页类 - 黄色系
      landing_page_view: '#eab308',
      landing_page_search: '#facc15',
      landing_page_similar: '#fbbf24',
      // 详情页类 - 红色系
      detail_page_view: '#ef4444',
      detail_page_similar: '#f87171',
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

      {/* 全局控制栏 */}
      <div className="ul-global-controls">
        <div className="ul-control-section">
          <div className="ul-control-label">时间范围</div>
          <div className="ul-date-range-wrapper">
            <div className="ul-date-range-buttons">
              {DATE_RANGE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  className={`ul-date-range-btn ${dateRange === option.value ? 'active' : ''}`}
                  onClick={() => handleDateRangeChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {showCustomDatePicker && (
              <div className="ul-custom-date-picker">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  max={customEndDate || new Date().toISOString().split('T')[0]}
                />
                <span className="ul-date-separator">至</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  min={customStartDate}
                  max={new Date().toISOString().split('T')[0]}
                />
                <button 
                  className="ul-apply-date-btn"
                  onClick={handleApplyCustomDate}
                  disabled={!customStartDate || !customEndDate}
                >
                  应用
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="ul-control-divider" />
        
        <div className="ul-control-section">
          <div className="ul-control-label">数据保留</div>
          {showRetentionEdit ? (
            <div className="ul-retention-edit">
              <select
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                disabled={configLoading}
              >
                {RETENTION_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button 
                className="ul-retention-save"
                onClick={handleUpdateConfig}
                disabled={configLoading}
              >
                {configLoading ? '保存中...' : '保存'}
              </button>
              <button 
                className="ul-retention-cancel"
                onClick={() => {
                  setShowRetentionEdit(false);
                  setRetentionDays(config?.retention_days || 180);
                }}
                disabled={configLoading}
              >
                取消
              </button>
            </div>
          ) : (
            <div className="ul-retention-display">
              <span className="ul-retention-value">
                保留 {config?.retention_days || 180} 天
              </span>
              {oldLogsCount > 0 && (
                <span className="ul-retention-hint">
                  (有 {oldLogsCount.toLocaleString()} 条过期数据待清理)
                </span>
              )}
              <button 
                className="ul-retention-edit-btn"
                onClick={() => setShowRetentionEdit(true)}
              >
                修改
              </button>
            </div>
          )}
        </div>
        
        <div className="ul-control-divider" />
        
        <div className="ul-control-section">
          <div className="ul-control-label">数据管理</div>
          <button 
            className="ul-clear-all-btn"
            onClick={() => setShowClearConfirm(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            清空全部数据
          </button>
        </div>
        
        <div className="ul-control-divider" />
        
        <div className="ul-control-section">
          <button 
            className="ul-refresh-btn"
            onClick={handleRefresh}
            disabled={loading}
          >
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
              className={loading ? 'ul-spin' : ''}
            >
              <path d="M23 4v6h-6"></path>
              <path d="M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            {loading ? '刷新中...' : '刷新数据'}
          </button>
        </div>
      </div>

      {/* 统计摘要 */}
      {showSummary && summary && (
        <div className="ul-summary">
          <div className="ul-summary-header">
            <h3>统计概览 <span className="ul-summary-range">({getDateRangeLabel()})</span></h3>
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
          
          {/* 图表区域 - 左右布局 */}
          <div className="ul-charts-container">
            {/* 左侧：使用趋势折线图 */}
            {summary.trend_data && summary.trend_data.length > 0 && (
              <div className="ul-chart-section ul-trend-chart">
                <h4>
                  使用趋势
                  {summary.trend_granularity === 'hour' && <span className="ul-trend-granularity">（按小时）</span>}
                  {filters.feature_code && (
                    <span className="ul-trend-filter-tag">
                      {summary.feature_counts?.find(f => f.feature_code === filters.feature_code)?.feature_name || filters.feature_code}
                    </span>
                  )}
                </h4>
                <div className="ul-chart-wrapper">
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart 
                      data={summary.trend_data} 
                      margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="label" 
                        tick={{ fontSize: 11, fill: '#666' }}
                        axisLine={{ stroke: '#e5e5e5' }}
                        tickLine={{ stroke: '#e5e5e5' }}
                        interval={summary.trend_data.length > 15 ? Math.floor(summary.trend_data.length / 10) : 0}
                      />
                      <YAxis 
                        tick={{ fontSize: 11, fill: '#666' }}
                        axisLine={{ stroke: '#e5e5e5' }}
                        tickLine={{ stroke: '#e5e5e5' }}
                        tickFormatter={(value) => value.toLocaleString()}
                        allowDecimals={false}
                      />
                      <Tooltip 
                        formatter={(value) => [value.toLocaleString(), '使用次数']}
                        labelFormatter={(label, payload) => {
                          if (payload && payload.length > 0) {
                            const data = payload[0].payload;
                            if (summary.trend_granularity === 'hour') {
                              return `今天 ${data.label}`;
                            } else {
                              // 日期格式：从 value 获取完整日期
                              const date = new Date(data.value);
                              return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
                            }
                          }
                          return label;
                        }}
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e5e5',
                          borderRadius: '8px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          fontSize: '13px'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="count" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={summary.trend_data.length <= 15 ? { fill: '#3b82f6', strokeWidth: 0, r: 3 } : false}
                        activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            
            {/* 右侧：功能使用分布 */}
            {summary.feature_counts && summary.feature_counts.length > 0 && (
              <div className="ul-chart-section ul-feature-stats">
                <h4>
                  功能使用分布 
                  <span className="ul-feature-stats-count">（共 {summary.feature_counts.length} 项）</span>
                  {filters.feature_code && (
                    <button 
                      className="ul-feature-clear-btn"
                      onClick={() => handleFilterChange('feature_code', '')}
                    >
                      清除筛选
                    </button>
                  )}
                </h4>
                <div className="ul-feature-bars">
                  {summary.feature_counts.map((item, index) => (
                    <div 
                      key={index} 
                      className={`ul-feature-bar-item ul-feature-clickable ${filters.feature_code === item.feature_code ? 'ul-feature-selected' : ''}`}
                      onClick={() => handleFilterChange('feature_code', filters.feature_code === item.feature_code ? '' : item.feature_code)}
                      title={`点击${filters.feature_code === item.feature_code ? '取消' : ''}筛选: ${item.feature_name}`}
                    >
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

      {/* 日志列表 */}
      <div className="ul-table-container">
        {/* 筛选状态提示 */}
        {hasActiveFilters && (
          <div className="ul-filter-status">
            <span>已应用筛选条件</span>
            <button className="ul-clear-filter-btn" onClick={handleResetFilters}>
              清除筛选
            </button>
          </div>
        )}
        <table className="ul-table">
          <thead>
            {/* 表头筛选行 */}
            <tr className="ul-filter-row">
              <th>时间</th>
              <th>
                <select
                  className="ul-column-filter"
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
              </th>
              <th>入口</th>
              <th>IP地址</th>
              <th>
                <select
                  className="ul-column-filter"
                  value={filters.device_type}
                  onChange={(e) => handleFilterChange('device_type', e.target.value)}
                >
                  <option value="">全部设备</option>
                  {filterOptions.device_types?.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </th>
              <th>来源页面</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="ul-loading">加载中...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="6" className="ul-empty">暂无数据</td>
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
                  <td className="ul-entry">{log.entry_point || '-'}</td>
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

      {/* 清空数据确认对话框 */}
      {showClearConfirm && (
        <div className="ul-modal-overlay">
          <div className="ul-modal">
            <div className="ul-modal-header">
              <h3>确认清空全部数据</h3>
            </div>
            <div className="ul-modal-body">
              <div className="ul-modal-warning">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <p className="ul-modal-message">
                此操作将<strong>永久删除</strong>所有使用统计记录，共计 <strong>{total.toLocaleString()}</strong> 条数据。
              </p>
              <p className="ul-modal-hint">
                删除后数据无法恢复，请确认是否继续？
              </p>
            </div>
            <div className="ul-modal-footer">
              <button 
                className="ul-modal-cancel"
                onClick={() => setShowClearConfirm(false)}
                disabled={clearLoading}
              >
                取消
              </button>
              <button 
                className="ul-modal-confirm"
                onClick={handleClearAllLogs}
                disabled={clearLoading}
              >
                {clearLoading ? '清空中...' : '确认清空'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsageLogs;
