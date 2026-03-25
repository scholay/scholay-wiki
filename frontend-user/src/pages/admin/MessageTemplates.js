/**
 * Scholay学术 V1.0 - 消息模板管理页面
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  App, Modal, Table, Button, Space, Tag, Empty,
  Form, Input, Select, Switch, Row, Col, Typography
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { adminAPI } from '../../services/adminApi';

const { TextArea } = Input;
const { Text } = Typography;

const CATEGORY_MAP = {
  system: { label: '系统', color: 'blue' },
  promotion: { label: '推广', color: 'orange' },
  transaction: { label: '交易', color: 'green' },
};

const MessageTemplates = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ category: '', isActive: '' });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const pageSize = 20;

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, pageSize };
      if (filters.category) params.category = filters.category;
      if (filters.isActive !== '') params.isActive = filters.isActive === 'true';
      const res = await adminAPI.getMessageTemplates(params);
      if (res.data.code === 0) {
        setTemplates(res.data.data.list || []);
        setTotal(res.data.data.total || 0);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const openModal = (template = null) => {
    if (template) {
      setEditing(template);
      form.setFieldsValue({
        code: template.code || '',
        name: template.name || '',
        title: template.title || '',
        content: template.content || '',
        category: template.category || 'system',
        variables: template.variables || '',
        is_active: template.is_active !== false,
      });
    } else {
      setEditing(null);
      form.resetFields();
      form.setFieldsValue({ category: 'system', is_active: true });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      if (editing) {
        await adminAPI.updateMessageTemplate(editing.id, values);
      } else {
        await adminAPI.createMessageTemplate(values);
      }
      setShowModal(false);
      loadTemplates();
    } catch (e) {
      if (e.errorFields) return;
      message.error('保存失败: ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认',
      content: '确定删除此模板？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await adminAPI.deleteMessageTemplate(id);
          loadTemplates();
        } catch (e) {
          message.error('删除失败');
        }
      },
    });
  };

  const columns = [
    {
      title: '模板代码',
      dataIndex: 'code',
      key: 'code',
      render: (code) => <Text code>{code}</Text>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
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
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (active) => (
        <Tag color={active ? 'success' : 'default'}>
          {active ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (t) => t ? new Date(t).toLocaleString('zh-CN') : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openModal(record)} />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 24 }}>消息模板管理</Typography.Title>

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
            value={filters.isActive}
            onChange={(v) => { setFilters(f => ({ ...f, isActive: v })); setPage(1); }}
            style={{ width: 120 }}
            options={[
              { value: '', label: '全部状态' },
              { value: 'true', label: '已启用' },
              { value: 'false', label: '已禁用' },
            ]}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>新建模板</Button>
      </div>

      <Table
        columns={columns}
        dataSource={templates}
        rowKey="id"
        loading={loading}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无模板" /> }}
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
        title={editing ? '编辑模板' : '新建模板'}
        open={showModal}
        onCancel={() => setShowModal(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}
          initialValues={{ category: 'system', is_active: true }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="code"
                label="模板代码"
                rules={[{ required: true, message: '请输入模板代码' }]}
              >
                <Input placeholder="如: welcome_new_user" disabled={!!editing} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="name"
                label="模板名称"
                rules={[{ required: true, message: '请输入模板名称' }]}
              >
                <Input placeholder="如: 新用户欢迎消息" />
              </Form.Item>
            </Col>
          </Row>

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
              <Form.Item name="is_active" label="状态" valuePropName="checked">
                <Switch checkedChildren="启用" unCheckedChildren="禁用" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="title"
            label="消息标题"
            rules={[{ required: true, message: '请输入消息标题' }]}
          >
            <Input placeholder="消息标题，支持变量如 {{username}}" />
          </Form.Item>

          <Form.Item
            name="content"
            label="消息内容"
            rules={[{ required: true, message: '请输入消息内容' }]}
          >
            <TextArea rows={4} placeholder="消息内容，支持Markdown格式和变量" />
          </Form.Item>

          <Form.Item name="variables" label="变量说明">
            <TextArea rows={2} placeholder="变量说明，如: username - 用户名, amount - 金额" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MessageTemplates;
