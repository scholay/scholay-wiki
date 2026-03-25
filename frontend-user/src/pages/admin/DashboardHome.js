/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Skeleton, Button, Result, Typography } from 'antd';
import {
  TeamOutlined, UserOutlined, MessageOutlined,
  CloudServerOutlined, ReloadOutlined
} from '@ant-design/icons';
import { adminAPI } from '../../services/adminApi';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const { Text } = Typography;

const DashboardHome = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStatistics();
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

  const formatNumber = (value) => {
    if (value >= 10000) {
      return `${(value / 10000).toFixed(1)}万`;
    }
    return value?.toString() ?? '0';
  };

  if (loading) {
    return (
      <div>
        <Row gutter={[16, 16]}>
          {[1, 2, 3, 4].map((i) => (
            <Col xs={24} sm={12} lg={6} key={i}>
              <Card><Skeleton active paragraph={{ rows: 2 }} /></Card>
            </Col>
          ))}
        </Row>
        <Card style={{ marginTop: 16 }}><Skeleton active paragraph={{ rows: 8 }} /></Card>
      </div>
    );
  }

  if (error) {
    return (
      <Result
        status="error"
        title="加载失败"
        subTitle={error}
        extra={<Button type="primary" icon={<ReloadOutlined />} onClick={loadStatistics}>重试</Button>}
      />
    );
  }

  if (!stats) return null;

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总用户数"
              value={stats.total_users}
              formatter={(v) => formatNumber(v)}
              prefix={<TeamOutlined style={{ color: '#2563eb' }} />}
            />
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>今日 +{stats.new_users_today}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>7天 +{stats.new_users_7d}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>30天 +{stats.new_users_30d}</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="在线用户"
              value={stats.online_users}
              prefix={<UserOutlined style={{ color: '#10b981' }} />}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
              30天活跃: {formatNumber(stats.active_users_30d)}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总对话数"
              value={stats.total_conversations}
              formatter={(v) => formatNumber(v)}
              prefix={<MessageOutlined style={{ color: '#8b5cf6' }} />}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
              今日: {stats.conversations_today} | 消息: {formatNumber(stats.total_messages)}
            </Text>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="系统资源"
              value={stats.third_party_accounts + stats.prompt_templates}
              prefix={<CloudServerOutlined style={{ color: '#059669' }} />}
            />
            <Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
              API密钥: {stats.third_party_accounts} | 模板: {stats.prompt_templates}
            </Text>
          </Card>
        </Col>
      </Row>

      <Card style={{ marginTop: 16 }} title="用户增长趋势" extra={<Text type="secondary">最近30天新增用户数</Text>}>
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
      </Card>
    </div>
  );
};

export default DashboardHome;
