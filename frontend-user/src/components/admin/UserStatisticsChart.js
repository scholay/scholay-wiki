/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Spin, Empty, Button, Modal, Form, DatePicker, Select, Space, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { adminAPI } from '../../services/adminApi';
import dayjs from 'dayjs';

const UserStatisticsChart = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilter, setShowFilter] = useState(false);

  const [startTime, setStartTime] = useState(() => dayjs().subtract(29, 'day').startOf('day'));
  const [endTime, setEndTime] = useState(() => dayjs().endOf('day'));
  const [granularity, setGranularity] = useState('day');

  const formatDateTimeAPI = (d) => d.format('YYYY-MM-DD HH:mm:ss');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        start_time: formatDateTimeAPI(startTime),
        end_time: formatDateTimeAPI(endTime),
        granularity,
      };
      const response = await adminAPI.getUserStatisticsChart(params);
      if (response.data.code === 0) {
        setData(response.data.data.statistics || []);
      }
    } catch (error) {
      console.error('Failed to fetch user statistics:', error);
    } finally {
      setLoading(false);
    }
  }, [startTime, endTime, granularity]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = () => {
    fetchData();
    setShowFilter(false);
  };

  const setQuickRange = (type) => {
    const now = dayjs();
    let start = now;
    let gran = 'day';

    switch (type) {
      case 'today':
        start = now.startOf('day');
        gran = 'hour';
        break;
      case 'yesterday':
        start = now.subtract(1, 'day').startOf('day');
        gran = 'hour';
        break;
      case 'week':
        start = now.subtract(6, 'day').startOf('day');
        gran = 'day';
        break;
      case 'month':
        start = now.subtract(29, 'day').startOf('day');
        gran = 'day';
        break;
      case 'quarter':
        start = now.subtract(3, 'month').startOf('day');
        gran = 'week';
        break;
      case 'year':
        start = now.subtract(1, 'year').startOf('day');
        gran = 'month';
        break;
      default:
        break;
    }

    setStartTime(start);
    setEndTime(type === 'yesterday' ? now.subtract(1, 'day').endOf('day') : now);
    setGranularity(gran);
  };

  const granularityOptions = [
    { value: 'hour', label: '小时' },
    { value: 'day', label: '天' },
    { value: 'week', label: '周' },
    { value: 'month', label: '月' },
  ];

  const quickRangeOptions = [
    { value: 'today', label: '今日' },
    { value: 'yesterday', label: '昨日' },
    { value: 'week', label: '近7天' },
    { value: 'month', label: '近30天' },
    { value: 'quarter', label: '近3月' },
    { value: 'year', label: '近1年' },
  ];

  const toolbar = (
    <Space wrap>
      <Button icon={<SearchOutlined />} size="small" onClick={() => setShowFilter(true)}>
        搜索条件
      </Button>
      <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
        {startTime.format('YYYY-MM-DD HH:mm')} ~ {endTime.format('YYYY-MM-DD HH:mm')}
        <Tag color="blue" style={{ marginLeft: 8 }}>
          {granularityOptions.find(g => g.value === granularity)?.label}
        </Tag>
      </span>
    </Space>
  );

  const chartContent = loading ? (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
      <Spin tip="加载中..." />
    </div>
  ) : !data || data.length === 0 ? (
    <Empty description="暂无数据" style={{ minHeight: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
  ) : (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
        <XAxis
          dataKey="label"
          stroke="#999"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#e0e0e0' }}
          interval="preserveStartEnd"
          angle={data.length > 15 ? -45 : 0}
          textAnchor={data.length > 15 ? 'end' : 'middle'}
          height={data.length > 15 ? 60 : 30}
        />
        <YAxis
          stroke="#999"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={35}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#fff' }}
          labelStyle={{ color: '#9ca3af' }}
          formatter={(value) => [value, '新注册用户']}
          labelFormatter={(label, payload) => (payload?.[0]?.payload?.time || label)}
        />
        <Legend wrapperStyle={{ fontSize: 13, paddingTop: 10 }} iconType="line" />
        <Line
          type="monotone"
          dataKey="new_users"
          stroke="#667eea"
          strokeWidth={2}
          name="新注册用户"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  return (
    <>
      <Card size="small" title={toolbar} styles={{ body: { padding: '16px 16px 8px' } }}>
        {chartContent}
      </Card>

      <Modal
        title="搜索条件"
        open={showFilter}
        onOk={handleSearch}
        onCancel={() => setShowFilter(false)}
        okText="确定"
        cancelText="取消"
        width={420}
        destroyOnClose
      >
        <Form layout="vertical">
          <Form.Item label="快捷选择">
            <Space wrap>
              {quickRangeOptions.map(opt => (
                <Button key={opt.value} size="small" onClick={() => setQuickRange(opt.value)}>
                  {opt.label}
                </Button>
              ))}
            </Space>
          </Form.Item>
          <Form.Item label="起始时间">
            <DatePicker
              showTime
              value={startTime}
              onChange={v => v && setStartTime(v)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="结束时间">
            <DatePicker
              showTime
              value={endTime}
              onChange={v => v && setEndTime(v)}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="时间粒度">
            <Select value={granularity} onChange={setGranularity} options={granularityOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default UserStatisticsChart;
