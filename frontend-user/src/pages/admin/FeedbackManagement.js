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
  App, Modal, Table, Card, Statistic, Tag, Button, Space, Input,
  Select, Row, Col, Drawer, Image, Descriptions, Typography, Popconfirm,
} from 'antd';
import {
  EyeOutlined, MessageOutlined, DeleteOutlined, SearchOutlined,
  DownloadOutlined, FileOutlined, SendOutlined,
} from '@ant-design/icons';
import { adminAPI } from 'features/admin/api/adminApi';

const { TextArea } = Input;
const { Text, Paragraph } = Typography;

const STATUS_MAP = {
  pending: { label: '待处理', color: 'warning' },
  processed: { label: '已处理', color: 'processing' },
  replied: { label: '已回复', color: 'success' },
  closed: { label: '已关闭', color: 'default' },
};

const getFullUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url;
};

const FeedbackManagement = () => {
  const { message } = App.useApp();
  const [feedbacks, setFeedbacks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', keyword: '' });
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [showReplyModal, setShowReplyModal] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getFeedbacks({
        page: pagination.page,
        pageSize: pagination.pageSize,
        ...filters,
      });
      if (response.data.code === 0) {
        setFeedbacks(response.data.data.list || []);
        setPagination(prev => ({ ...prev, total: response.data.data.total }));
      }
    } catch (error) {
      message.error('获取反馈列表失败');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.pageSize, filters]);

  const fetchStats = async () => {
    try {
      const response = await adminAPI.getFeedbackStats();
      if (response.data.code === 0) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleStatusChange = async (id, newStatus) => {
    try {
      const response = await adminAPI.updateFeedbackStatus(id, newStatus);
      if (response.data.code === 0) {
        message.success('状态更新成功');
        fetchFeedbacks();
        fetchStats();
        if (selectedFeedback?.id === id) {
          setSelectedFeedback(prev => ({ ...prev, status: newStatus }));
        }
      } else {
        message.error(response.data.message || '更新失败');
      }
    } catch (error) {
      message.error('更新失败');
    }
  };

  const handleReply = async () => {
    if (!replyContent.trim()) {
      message.error('请输入回复内容');
      return;
    }
    setReplying(true);
    try {
      const response = await adminAPI.replyFeedback(selectedFeedback.id, replyContent);
      if (response.data.code === 0) {
        message.success('回复成功，邮件已发送');
        setShowReplyModal(false);
        setReplyContent('');
        setSelectedFeedback(null);
        fetchFeedbacks();
        fetchStats();
      } else {
        message.error(response.data.message || '回复失败');
      }
    } catch (error) {
      message.error('回复失败');
    } finally {
      setReplying(false);
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认',
      content: '确定要删除这条反馈吗？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await adminAPI.deleteFeedback(id);
          if (response.data.code === 0) {
            message.success('删除成功');
            fetchFeedbacks();
            fetchStats();
            if (showDetailDrawer && selectedFeedback?.id === id) {
              setShowDetailDrawer(false);
            }
          } else {
            message.error(response.data.message || '删除失败');
          }
        } catch (error) {
          message.error('删除失败');
        }
      },
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const parseAttachments = (attachmentsStr) => {
    if (!attachmentsStr) return [];
    try { return JSON.parse(attachmentsStr); } catch { return []; }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '邮箱', dataIndex: 'email', width: 200, ellipsis: true },
    {
      title: '内容摘要', dataIndex: 'content', ellipsis: true,
      render: (v) => v?.substring(0, 50) + (v?.length > 50 ? '...' : ''),
    },
    {
      title: '用户', dataIndex: 'username', width: 100,
      render: (v) => v || '匿名',
    },
    { title: 'IP', dataIndex: 'ip', width: 120, render: (v) => v || '-' },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (status) => {
        const s = STATUS_MAP[status];
        return s ? <Tag color={s.color}>{s.label}</Tag> : status;
      },
    },
    {
      title: '提交时间', dataIndex: 'createdAt', width: 170,
      render: (v) => formatDate(v),
    },
    {
      title: '操作', width: 200, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedFeedback(record); setShowDetailDrawer(true); }}>
            查看
          </Button>
          {record.status !== 'replied' && record.status !== 'closed' && (
            <Button size="small" icon={<MessageOutlined />} onClick={() => { setSelectedFeedback(record); setReplyContent(''); setShowReplyModal(true); }}>
              回复
            </Button>
          )}
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>反馈管理</h1>
        <Text type="secondary">管理用户提交的意见反馈</Text>
      </div>

      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small"><Statistic title="总反馈" value={stats.total} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="待处理" value={stats.pending} valueStyle={{ color: '#faad14' }} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="已处理" value={stats.processed} valueStyle={{ color: '#1677ff' }} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="已回复" value={stats.replied} valueStyle={{ color: '#52c41a' }} /></Card>
          </Col>
        </Row>
      )}

      <Space style={{ marginBottom: 16 }}>
        <Select
          value={filters.status}
          onChange={(v) => { setFilters(prev => ({ ...prev, status: v })); setPagination(prev => ({ ...prev, page: 1 })); }}
          style={{ width: 140 }}
          options={[
            { value: '', label: '全部状态' },
            { value: 'pending', label: '待处理' },
            { value: 'processed', label: '已处理' },
            { value: 'replied', label: '已回复' },
            { value: 'closed', label: '已关闭' },
          ]}
        />
        <Input.Search
          placeholder="搜索邮箱或内容..."
          value={filters.keyword}
          onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
          onSearch={() => { setPagination(prev => ({ ...prev, page: 1 })); fetchFeedbacks(); }}
          enterButton={<SearchOutlined />}
          style={{ width: 280 }}
        />
      </Space>

      <Table
        columns={columns}
        dataSource={feedbacks}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 1100 }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (page) => setPagination(prev => ({ ...prev, page })),
        }}
      />

      {/* 详情抽屉 */}
      <Drawer
        title="反馈详情"
        open={showDetailDrawer}
        onClose={() => setShowDetailDrawer(false)}
        width={520}
        extra={
          selectedFeedback && (
            <Space>
              {selectedFeedback.status !== 'replied' && selectedFeedback.status !== 'closed' && (
                <Button type="primary" icon={<SendOutlined />} onClick={() => { setShowDetailDrawer(false); setReplyContent(''); setShowReplyModal(true); }}>
                  回复
                </Button>
              )}
              <Popconfirm title="确定删除？" onConfirm={() => { handleDelete(selectedFeedback.id); }} okText="确认" cancelText="取消">
                <Button danger icon={<DeleteOutlined />}>删除</Button>
              </Popconfirm>
            </Space>
          )
        }
      >
        {selectedFeedback && (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="反馈ID">#{selectedFeedback.id}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{selectedFeedback.email}</Descriptions.Item>
              <Descriptions.Item label="用户">{selectedFeedback.username || '匿名用户'}</Descriptions.Item>
              <Descriptions.Item label="IP地址">
                {selectedFeedback.ip || '-'}
                {selectedFeedback.ipLocation && <Text type="secondary"> ({selectedFeedback.ipLocation})</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="提交时间" span={2}>{formatDate(selectedFeedback.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="状态" span={2}>
                <Select
                  value={selectedFeedback.status}
                  onChange={(v) => handleStatusChange(selectedFeedback.id, v)}
                  size="small"
                  style={{ width: 120 }}
                  options={[
                    { value: 'pending', label: '待处理' },
                    { value: 'processed', label: '已处理' },
                    { value: 'replied', label: '已回复' },
                    { value: 'closed', label: '已关闭' },
                  ]}
                />
              </Descriptions.Item>
            </Descriptions>

            <Card size="small" title="反馈内容" style={{ marginBottom: 16 }}>
              <Paragraph>{selectedFeedback.content}</Paragraph>
            </Card>

            {parseAttachments(selectedFeedback.attachments).length > 0 && (
              <Card size="small" title={`附件 (${parseAttachments(selectedFeedback.attachments).length})`} style={{ marginBottom: 16 }}>
                {parseAttachments(selectedFeedback.attachments).filter(att => att.type === 'image').length > 0 && (
                  <Image.PreviewGroup>
                    <Space wrap>
                      {parseAttachments(selectedFeedback.attachments)
                        .filter(att => att.type === 'image')
                        .map((att, idx) => (
                          <Image key={idx} src={getFullUrl(att.url)} alt={att.name} width={100} height={100} style={{ objectFit: 'cover', borderRadius: 4 }} />
                        ))}
                    </Space>
                  </Image.PreviewGroup>
                )}
                {parseAttachments(selectedFeedback.attachments).filter(att => att.type === 'file').length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {parseAttachments(selectedFeedback.attachments)
                      .filter(att => att.type === 'file')
                      .map((att, idx) => (
                        <a key={idx} href={getFullUrl(att.url)} download={att.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                          <FileOutlined />
                          <span>{att.name}</span>
                          {att.size && <Text type="secondary" style={{ fontSize: 12 }}>{(att.size / 1024).toFixed(1)} KB</Text>}
                          <DownloadOutlined />
                        </a>
                      ))}
                  </div>
                )}
              </Card>
            )}

            {selectedFeedback.replyContent && (
              <Card size="small" title="回复记录" style={{ marginBottom: 16 }}>
                <Paragraph>{selectedFeedback.replyContent}</Paragraph>
                <Space>
                  <Text type="secondary">回复人: {selectedFeedback.repliedBy}</Text>
                  <Text type="secondary">回复时间: {formatDate(selectedFeedback.repliedAt)}</Text>
                </Space>
              </Card>
            )}
          </>
        )}
      </Drawer>

      {/* 回复弹窗 */}
      <Modal
        title="回复反馈"
        open={showReplyModal}
        onCancel={() => setShowReplyModal(false)}
        onOk={handleReply}
        confirmLoading={replying}
        okText="发送回复"
        cancelText="取消"
        okButtonProps={{ icon: <SendOutlined /> }}
      >
        {selectedFeedback && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="发送至">{selectedFeedback.email}</Descriptions.Item>
              <Descriptions.Item label="原反馈">{selectedFeedback.content?.substring(0, 100)}...</Descriptions.Item>
            </Descriptions>
            <TextArea
              placeholder="请输入回复内容..."
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              rows={6}
            />
          </>
        )}
      </Modal>
    </div>
  );
};

export default FeedbackManagement;
