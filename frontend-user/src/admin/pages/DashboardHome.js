/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import './DashboardHome.css';

const DashboardHome = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStatistics();
    // 每30秒刷新一次统计数据
    const interval = setInterval(loadStatistics, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStatistics = async () => {
    try {
      setError(null);
      const response = await adminAPI.getDashboardStatistics();
      if (response.data.code === 0) {
        setStats(response.data.data);
      } else {
        setError(response.data.message || '加载统计数据失败');
      }
    } catch (err) {
      console.error('Failed to load dashboard statistics:', err);
      setError('加载统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return `¥${value.toFixed(2)}`;
  };

  const formatNumber = (value) => {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}万`;
    }
    return value.toString();
  };

  if (loading) {
    return (
      <div className="dashboard-home">
        <div className="loading-skeleton">
          <div className="skeleton-card" />
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-home">
        <div className="error-message">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <p>{error}</p>
          <button onClick={loadStatistics} className="btn btn-primary">重试</button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="dashboard-home">
      {/* 核心指标卡片 */}
      <div className="stats-grid">
        {/* 用户统计 */}
        <div className="stat-card highlight-card">
          <div className="stat-icon" style={{ backgroundColor: '#dbeafe' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#2563eb">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">总用户数</p>
            <h3 className="stat-value">{formatNumber(stats.total_users)}</h3>
            <div className="stat-details">
              <span className="stat-badge">今日 +{stats.new_users_today}</span>
              <span className="stat-badge">7天 +{stats.new_users_7d}</span>
              <span className="stat-badge">30天 +{stats.new_users_30d}</span>
            </div>
          </div>
        </div>

        {/* 在线用户 */}
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#d1fae5' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#10b981">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">在线用户</p>
            <h3 className="stat-value">{stats.online_users}</h3>
            <p className="stat-hint">30天活跃: {formatNumber(stats.active_users_30d)}</p>
          </div>
        </div>

        {/* 总收入 */}
        <div className="stat-card highlight-card">
          <div className="stat-icon" style={{ backgroundColor: '#fef3c7' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#f59e0b">
              <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z"/>
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">总收入</p>
            <h3 className="stat-value">{formatCurrency(stats.total_revenue)}</h3>
            <div className="stat-details">
              <span className="stat-badge">今日 {formatCurrency(stats.revenue_today)}</span>
              <span className="stat-badge">7天 {formatCurrency(stats.revenue_7d)}</span>
              <span className="stat-badge">30天 {formatCurrency(stats.revenue_30d)}</span>
            </div>
          </div>
        </div>

        {/* 订单统计 */}
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#e0e7ff' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#6366f1">
              <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">订单总数</p>
            <h3 className="stat-value">{formatNumber(stats.total_orders)}</h3>
            <div className="stat-details">
              <span className="stat-badge success">已支付 {stats.paid_orders}</span>
              <span className="stat-badge warning">待支付 {stats.pending_orders}</span>
            </div>
          </div>
        </div>

        {/* 付费用户 */}
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#fce7f3' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#ec4899">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">付费用户</p>
            <h3 className="stat-value">{formatNumber(stats.paid_users)}</h3>
            <p className="stat-hint">免费用户: {formatNumber(stats.free_users)}</p>
          </div>
        </div>

        {/* 对话统计 */}
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#ddd6fe' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#8b5cf6">
              <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">总对话数</p>
            <h3 className="stat-value">{formatNumber(stats.total_conversations)}</h3>
            <p className="stat-hint">今日: {stats.conversations_today} | 消息: {formatNumber(stats.total_messages)}</p>
          </div>
        </div>

        {/* 优惠券统计 */}
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#ffedd5' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#f97316">
              <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">优惠券</p>
            <h3 className="stat-value">{formatNumber(stats.total_coupons)}</h3>
            <div className="stat-details">
              <span className="stat-badge success">已用 {stats.used_coupons}</span>
              <span className="stat-badge">未用 {stats.unused_coupons}</span>
            </div>
          </div>
        </div>

        {/* 系统资源 */}
        <div className="stat-card">
          <div className="stat-icon" style={{ backgroundColor: '#d1fae5' }}>
            <svg width="24" height="24" viewBox="0 0 20 20" fill="#059669">
              <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3.293 1.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L7.586 10 5.293 7.707a1 1 0 010-1.414zM11 12a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="stat-info">
            <p className="stat-label">系统资源</p>
            <h3 className="stat-value">{stats.third_party_accounts + stats.prompt_templates}</h3>
            <p className="stat-hint">API密钥: {stats.third_party_accounts} | 模板: {stats.prompt_templates}</p>
          </div>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="charts-grid">
        {/* 用户增长趋势 */}
        <div className="chart-card">
          <h3>用户增长趋势</h3>
          <p className="chart-description">最近30天新增用户数</p>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={stats.user_growth_chart}>
              <defs>
                <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                labelFormatter={(value) => `日期: ${value}`}
                formatter={(value) => [`${value} 人`, '新增用户']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorUsers)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 订单趋势 */}
        <div className="chart-card">
          <h3>订单趋势</h3>
          <p className="chart-description">最近30天已支付订单数</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.order_trend_chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                labelFormatter={(value) => `日期: ${value}`}
                formatter={(value) => [`${value} 笔`, '订单数']}
              />
              <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 收入趋势 */}
        <div className="chart-card full-width">
          <h3>收入趋势</h3>
          <p className="chart-description">最近30天收入统计 (¥)</p>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.revenue_trend_chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return `${date.getMonth() + 1}/${date.getDate()}`;
                }}
              />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `¥${value}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                labelFormatter={(value) => `日期: ${value}`}
                formatter={(value) => [`¥${value.toFixed(2)}`, '收入']}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#f59e0b"
                strokeWidth={3}
                dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
