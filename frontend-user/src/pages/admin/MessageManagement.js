/**
 * Scholay学术 V1.0 - 站内信管理页面
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  App, Modal, Table, Card, Button, Space, Tag, Empty,
  Form, Input, Select, Checkbox, Row, Col, Statistic, Typography
} from 'antd';
import {
  PlusOutlined, SendOutlined,
  MailOutlined, TeamOutlined, EyeOutlined, PercentageOutlined
} from '@ant-design/icons';
import { adminAPI } from '../../services/adminApi';

const { TextArea } = Input;
const { Text } = Typography;

const CATEGORY_MAP = {
  system: { label: '系统', color: 'blue' },
  promotion: { label: '推广', color: 'orange' },
  transaction: { label: '交易', color: 'green' },
};

const SEND_TYPE_MAP = {
  all: '全站',
  by_plan: '按等级',
  batch: '指定用户',
};

const STATUS_MAP = {
  draft: { label: '草稿', color: 'default' },
  sent: { label: '已发送', color: 'success' },
  cancelled: { label: '已取消', color: 'error' },
};

const MessageManagement = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [messages_, setMessages_] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ category: '', status: '' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const pageSize = 20;

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getMessages({ page, pageSize, ...filters });
      if (res.data.code === 0) {
        setMessages_(res.data.data.list || []);
        setTotal(res.data.data.total || 0);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, filters]);

  const loadStats = useCallback(async () => {
    try {
      const res = await adminAPI.getMessageStats();
      if (res.data.code === 0) setStats(res.data.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const handleSend = (id) => {
    Modal.confirm({
      title: '确认',
      content: '确定发送此消息？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await adminAPI.sendMessage(id);
          loadMessages();
          loadStats();
        } catch (e) { message.error('发送失败'); }
      },
    });
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      const data = { ...values };
      if (data.send_type === 'batch' && data.target_user_ids) {
        data.target_user_ids = data.target_user_ids.split('\n').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      } else { delete data.target_user_ids; }
      if (data.send_type !== 'by_plan') delete data.target_plans;
      await adminAPI.createMessage(data);
      setShowCreateModal(false);
      form.resetFields();
      loadMessages();
      loadStats();
    } catch (e) {
      if (e.errorFields) return;
      message.error('创建失败: ' + (e.response?.data?.message || e.message));
    } finally { setCreating(false); }
  };

  const openCreateModal = () => {
    form.resetFields();
    form.setFieldsValue({
      category: 'system',
      send_type: 'all',
      target_plans: [],
      send_now: true,
    });
    setShowCreateModal(true);
  };

  const columns = [
    {
      title: '消息内容',
      dataIndex: 'title',
      key: 'title',
      render: (title, record) => (
        <div>
          <Text strong>{title}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{record.content?.substring(0, 50)}</Text>
        </div>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      key: 'category',
      width: 80,
      render: (cat) => {
        const cfg = CATEGORY_MAP[cat] || { label: cat, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '发送类型',
      dataIndex: 'send_type',
      key: 'send_type',
      width: 90,
      render: (t) => <Tag>{SEND_TYPE_MAP[t] || t}</Tag>,
    },
    {
      title: '接收/已读',
      key: 'readInfo',
      width: 100,
      render: (_, r) => `${r.recipient_count} / ${r.read_count}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s) => {
        const cfg = STATUS_MAP[s] || { label: s, color: 'default' };
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      },
    },
    {
      title: '发送时间',
      dataIndex: 'send_at',
      key: 'send_at',
      width: 170,
      render: (t) => t ? new Date(t).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        record.status === 'draft' ? (
          <Button type="link" size="small" icon={<SendOutlined />} onClick={() => handleSend(record.id)}>
            发送
          </Button>
        ) : null
      ),
    },
  ];

  const sendType = Form.useWatch('send_type', form);

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 24 }}>站内信管理</Typography.Title>

      {stats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col xs={12} sm={6}>
            <Card size="small"><Statistic title="消息总数" value={stats.total_messages} prefix={<MailOutlined />} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small"><Statistic title="总接收人数" value={stats.total_recipients} prefix={<TeamOutlined />} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small"><Statistic title="已读人数" value={stats.total_read} prefix={<EyeOutlined />} /></Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small"><Statistic title="整体已读率" value={stats.overall_read_rate?.toFixed(1)} suffix="%" prefix={<PercentageOutlined />} /></Card>
          </Col>
        </Row>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Select
            value={filters.category}
            onChange={(v) => { setFilters(f => ({ ...f, category: v })); setPage(1); }}
            style={{ width: 120 }}
            options={[
              { value: '', label: '全部分类' },
              { value: 'system', label: '系统通知' },
              { value: 'promotion', label: '营销推广' },
              { value: 'transaction', label: '交易通知' },
            ]}
          />
          <Select
            value={filters.status}
            onChange={(v) => { setFilters(f => ({ ...f, status: v })); setPage(1); }}
            style={{ width: 120 }}
            options={[
              { value: '', label: '全部状态' },
              { value: 'draft', label: '草稿' },
              { value: 'sent', label: '已发送' },
            ]}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>发送消息</Button>
      </div>

      <Table
        columns={columns}
        dataSource={messages_}
        rowKey="id"
        loading={loading}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无消息" /> }}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 条`,
          showSizeChanger: false,
        }}
      />

      <Modal
        title="发送站内信"
        open={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="确认发送"
        cancelText="取消"
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}
          initialValues={{ category: 'system', send_type: 'all', target_plans: [], send_now: true }}
        >
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="消息标题" />
          </Form.Item>

          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
            <TextArea rows={4} placeholder="支持Markdown格式，如 **加粗**" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="category" label="分类">
                <Select options={[
                  { value: 'system', label: '系统通知' },
                  { value: 'promotion', label: '营销推广' },
                  { value: 'transaction', label: '交易通知' },
                ]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="send_type" label="发送目标">
                <Select options={[
                  { value: 'all', label: '全站广播' },
                  { value: 'by_plan', label: '按会员等级' },
                  { value: 'batch', label: '指定用户' },
                ]} />
              </Form.Item>
            </Col>
          </Row>

          {sendType === 'by_plan' && (
            <Form.Item name="target_plans" label="选择会员等级">
              <Checkbox.Group options={[
                { label: 'FREE', value: 'free' },
                { label: 'PRO', value: 'pro' },
                { label: 'MAX', value: 'max' },
              ]} />
            </Form.Item>
          )}

          {sendType === 'batch' && (
            <Form.Item name="target_user_ids" label="用户ID列表">
              <TextArea rows={3} placeholder="每行一个用户ID" />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="link_url" label="跳转链接（可选）">
                <Input placeholder="https://" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="link_text" label="链接文字">
                <Input placeholder="查看详情" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="send_now" valuePropName="checked">
            <Checkbox>立即发送</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MessageManagement;
