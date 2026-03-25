/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  App, Table, Card, Statistic, Button, Select, Row, Col, Tabs,
  Tag, Typography, Popconfirm, Tooltip,
} from 'antd';
import { ClearOutlined, LinkOutlined } from '@ant-design/icons';
import api from '../../services/adminApi';

const { Text } = Typography;

const DATE_RANGE_OPTIONS = [
  { value: 7, label: '近7天' },
  { value: 15, label: '近15天' },
  { value: 30, label: '近30天' },
  { value: 60, label: '近60天' },
  { value: 90, label: '近3个月' },
  { value: 180, label: '近6个月' },
];

const HotContent = () => {
  const { message } = App.useApp();
  const [activeTab, setActiveTab] = useState('keywords');
  const [days, setDays] = useState(30);

  const [keywords, setKeywords] = useState([]);
  const [keywordsTotal, setKeywordsTotal] = useState(0);
  const [keywordsPage, setKeywordsPage] = useState(1);
  const [keywordsLoading, setKeywordsLoading] = useState(false);

  const [papers, setPapers] = useState([]);
  const [papersTotal, setPapersTotal] = useState(0);
  const [papersPage, setPapersPage] = useState(1);
  const [papersLoading, setPapersLoading] = useState(false);

  const [stats, setStats] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  const pageSize = 20;

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

  const fetchKeywords = useCallback(async () => {
    setKeywordsLoading(true);
    try {
      const response = await api.get('/admin/hot-content/keywords', {
        params: { days, page: keywordsPage, page_size: pageSize },
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

  const fetchPapers = useCallback(async () => {
    setPapersLoading(true);
    try {
      const response = await api.get('/admin/hot-content/papers', {
        params: { days, page: papersPage, page_size: pageSize },
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

  const handleCleanup = async () => {
    setCleanupLoading(true);
    try {
      const response = await api.post('/admin/hot-content/cleanup');
      if (response.data.code === 0) {
        const data = response.data.data;
        message.success(`清理完成！删除关键词: ${data.keywords_deleted} 条，删除论文: ${data.papers_deleted} 条`);
        fetchStats();
        if (activeTab === 'keywords') fetchKeywords();
        else fetchPapers();
      }
    } catch (error) {
      console.error('清理失败:', error);
      message.error('清理失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setCleanupLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (activeTab === 'keywords') fetchKeywords();
    else fetchPapers();
  }, [activeTab, fetchKeywords, fetchPapers]);

  useEffect(() => {
    setKeywordsPage(1);
    setPapersPage(1);
  }, [days]);

  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    return new Date(timeStr).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

  const getRankTag = (index, page) => {
    const rank = (page - 1) * pageSize + index + 1;
    if (rank <= 3) {
      const colors = ['#f5222d', '#fa8c16', '#faad14'];
      return <Tag color={colors[rank - 1]} style={{ fontWeight: 'bold', minWidth: 32, textAlign: 'center' }}>{rank}</Tag>;
    }
    return <Tag style={{ minWidth: 32, textAlign: 'center' }}>{rank}</Tag>;
  };

  const keywordColumns = [
    {
      title: '排名', width: 70, align: 'center',
      render: (_, __, index) => getRankTag(index, keywordsPage),
    },
    { title: '搜索关键词', dataIndex: 'keyword', ellipsis: true },
    {
      title: '搜索次数', dataIndex: 'search_count', width: 120, align: 'right',
      sorter: (a, b) => a.search_count - b.search_count,
      render: (v) => v?.toLocaleString(),
    },
    { title: '首次搜索', dataIndex: 'first_searched_at', width: 180, render: (v) => formatTime(v) },
    { title: '最近搜索', dataIndex: 'last_searched_at', width: 180, render: (v) => formatTime(v) },
  ];

  const paperColumns = [
    {
      title: '排名', width: 70, align: 'center',
      render: (_, __, index) => getRankTag(index, papersPage),
    },
    {
      title: '论文标题', dataIndex: 'title', ellipsis: true,
      render: (title, record) => (
        <div>
          <Tooltip title={title}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || '-'}</div>
          </Tooltip>
          {record.paper_id && <Text type="secondary" style={{ fontSize: 11 }}>ID: {record.paper_id}</Text>}
        </div>
      ),
    },
    {
      title: 'DOI', dataIndex: 'doi', width: 150,
      render: (doi) => doi ? (
        <a href={`https://doi.org/${doi}`} target="_blank" rel="noopener noreferrer">
          <Tooltip title={doi}><Text style={{ fontSize: 12 }}>{doi.length > 20 ? doi.substring(0, 20) + '...' : doi}</Text> <LinkOutlined /></Tooltip>
        </a>
      ) : '-',
    },
    { title: '年份', dataIndex: 'year', width: 80, render: (v) => v || '-' },
    {
      title: '查看次数', dataIndex: 'view_count', width: 100, align: 'right',
      sorter: (a, b) => a.view_count - b.view_count,
      render: (v) => v?.toLocaleString(),
    },
    { title: '最近查看', dataIndex: 'last_viewed_at', width: 160, render: (v) => formatTime(v) },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>热门内容统计</h1>
        <Text type="secondary">统计热门搜索词和热门论文，数据保留最近6个月，最多10万条记录</Text>
      </div>

      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small"><Statistic title="搜索关键词总数" value={stats.keywords_count || 0} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="论文记录总数" value={stats.papers_count || 0} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="数据保留期限" value={stats.retention_days || 180} suffix="天" /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="最大记录数" value={stats.max_records || 100000} /></Card>
          </Col>
        </Row>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Select
          value={days}
          onChange={setDays}
          style={{ width: 140 }}
          options={DATE_RANGE_OPTIONS}
        />
        <Popconfirm
          title="确认清理"
          description="此操作将清理超过6个月的数据，以及超出10万条限制的旧数据。确定要继续吗？"
          onConfirm={handleCleanup}
          okText="确认清理"
          cancelText="取消"
        >
          <Button icon={<ClearOutlined />} loading={cleanupLoading} danger>
            手动清理
          </Button>
        </Popconfirm>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'keywords',
            label: '热门搜索词',
            children: (
              <Table
                columns={keywordColumns}
                dataSource={keywords}
                rowKey="id"
                loading={keywordsLoading}
                size="small"
                pagination={{
                  current: keywordsPage,
                  pageSize,
                  total: keywordsTotal,
                  showSizeChanger: false,
                  showTotal: (total) => `共 ${total} 条`,
                  onChange: (page) => setKeywordsPage(page),
                }}
              />
            ),
          },
          {
            key: 'papers',
            label: '热门论文',
            children: (
              <Table
                columns={paperColumns}
                dataSource={papers}
                rowKey="id"
                loading={papersLoading}
                size="small"
                scroll={{ x: 900 }}
                pagination={{
                  current: papersPage,
                  pageSize,
                  total: papersTotal,
                  showSizeChanger: false,
                  showTotal: (total) => `共 ${total} 条`,
                  onChange: (page) => setPapersPage(page),
                }}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

export default HotContent;
