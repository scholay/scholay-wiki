/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Users, UserCheck, DollarSign, ShoppingCart, MessageSquare, Tag, Server } from 'lucide-react';
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

interface ChartPoint {
  date: string;
  value: number;
}

interface DashboardStats {
  total_users: number;
  new_users_today: number;
  new_users_7d: number;
  new_users_30d: number;
  online_users: number;
  active_users_30d: number;
  total_revenue: number | string;
  revenue_today: number | string;
  revenue_7d: number | string;
  revenue_30d: number | string;
  total_orders: number;
  paid_orders: number;
  pending_orders: number;
  paid_users: number;
  free_users: number;
  total_conversations: number;
  conversations_today: number;
  total_messages: number;
  total_coupons: number;
  used_coupons: number;
  unused_coupons: number;
  third_party_accounts: number;
  prompt_templates: number;
  user_growth_chart?: ChartPoint[];
  order_trend_chart?: ChartPoint[];
  revenue_trend_chart?: ChartPoint[];
}

const DashboardHome: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  const formatCurrency = (value: number | string) => {
    const num = Number(value) || 0;
    return `¥${num.toFixed(2)}`;
  };

  const formatNumber = (value: number | string) => {
    const num = Number(value) || 0;
    if (num >= 10000) {
      return `${(num / 10000).toFixed(1)}万`;
    }
    return num.toString();
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
          <div className="stat-icon">
            <Users size={24} />
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
          <div className="stat-icon stat-icon-success">
            <UserCheck size={24} />
          </div>
          <div className="stat-info">
            <p className="stat-label">在线用户</p>
            <h3 className="stat-value">{stats.online_users}</h3>
            <p className="stat-hint">30天活跃: {formatNumber(stats.active_users_30d)}</p>
          </div>
        </div>

        {/* 总收入 */}
        <div className="stat-card highlight-card">
          <div className="stat-icon stat-icon-warning">
            <DollarSign size={24} />
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
          <div className="stat-icon stat-icon-info">
            <ShoppingCart size={24} />
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
          <div className="stat-icon stat-icon-pink">
            <Users size={24} />
          </div>
          <div className="stat-info">
            <p className="stat-label">付费用户</p>
            <h3 className="stat-value">{formatNumber(stats.paid_users)}</h3>
            <p className="stat-hint">免费用户: {formatNumber(stats.free_users)}</p>
          </div>
        </div>

        {/* 对话统计 */}
        <div className="stat-card">
          <div className="stat-icon stat-icon-purple">
            <MessageSquare size={24} />
          </div>
          <div className="stat-info">
            <p className="stat-label">总对话数</p>
            <h3 className="stat-value">{formatNumber(stats.total_conversations)}</h3>
            <p className="stat-hint">今日: {stats.conversations_today} | 消息: {formatNumber(stats.total_messages)}</p>
          </div>
        </div>

        {/* 优惠券统计 */}
        <div className="stat-card">
          <div className="stat-icon stat-icon-orange">
            <Tag size={24} />
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
          <div className="stat-icon stat-icon-success">
            <Server size={24} />
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
            <AreaChart data={stats.user_growth_chart || []}>
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
            <BarChart data={stats.order_trend_chart || []}>
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
            <LineChart data={stats.revenue_trend_chart || []}>
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
                formatter={(value) => [`¥${(Number(value) || 0).toFixed(2)}`, '收入']}
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
