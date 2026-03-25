/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * CodeSnippets - 代码片段管理（SEO/广告/统计等）
 * 用于管理注入到用户端前端的代码片段
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  App, Modal, Table, Button, Space, Form, Input, Select, Switch,
  InputNumber, Tag, Empty, Segmented, Typography,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { adminAPI } from 'features/admin/api/adminApi';

const { TextArea } = Input;
const { Text } = Typography;

const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'seo', label: 'SEO' },
  { value: 'analytics', label: '统计分析' },
  { value: 'ad', label: '广告' },
  { value: 'social', label: '社交' },
  { value: 'other', label: '其他' },
];

const POSITIONS = [
  { value: 'head', label: 'Head (头部)', desc: '适合 meta 标签、CSS、统计代码' },
  { value: 'body_start', label: 'Body 开始', desc: '适合需要早期加载的脚本' },
  { value: 'body_end', label: 'Body 结束', desc: '适合延迟加载的脚本、广告代码' },
];

const CATEGORY_COLORS = {
  seo: 'blue',
  analytics: 'purple',
  ad: 'orange',
  social: 'cyan',
  other: 'default',
};

const CodeSnippets = () => {
  const { message } = App.useApp();
  const [snippets, setSnippets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [pagesInput, setPagesInput] = useState('');
  const [form] = Form.useForm();

  const loadSnippets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getCodeSnippets(selectedCategory === 'all' ? '' : selectedCategory);
      if (response.data.code === 0 && response.data.data) {
        setSnippets(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to load code snippets:', error);
      message.error('加载代码片段失败');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, message]);

  useEffect(() => {
    loadSnippets();
  }, [loadSnippets]);

  const handleCreate = () => {
    setEditingSnippet(null);
    form.resetFields();
    form.setFieldsValue({
      category: 'seo',
      position: 'head',
      is_enabled: true,
      priority: 100,
    });
    setPagesInput('');
    setShowModal(true);
  };

  const handleEdit = (snippet) => {
    setEditingSnippet(snippet);
    form.setFieldsValue({
      name: snippet.name,
      code_key: snippet.code_key,
      category: snippet.category,
      position: snippet.position,
      code_content: snippet.code_content,
      description: snippet.description || '',
      is_enabled: snippet.is_enabled,
      priority: snippet.priority,
    });
    setPagesInput((snippet.pages || []).join('\n'));
    setShowModal(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const pages = pagesInput
        .split('\n')
        .map(p => p.trim())
        .filter(p => p);

      const submitData = {
        ...values,
        pages: pages.length > 0 ? pages : null,
      };

      if (editingSnippet) {
        const response = await adminAPI.updateCodeSnippet(editingSnippet.id, submitData);
        if (response.data.code === 0) {
          message.success('代码片段更新成功');
          setShowModal(false);
          loadSnippets();
        } else {
          message.error('更新失败: ' + response.data.message);
        }
      } else {
        const response = await adminAPI.createCodeSnippet(submitData);
        if (response.data.code === 0) {
          message.success('代码片段创建成功');
          setShowModal(false);
          loadSnippets();
        } else {
          message.error('创建失败: ' + response.data.message);
        }
      }
    } catch (error) {
      if (error.errorFields) return;
      console.error('Failed to save snippet:', error);
      message.error('保存失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认',
      content: '确定要删除这个代码片段吗？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await adminAPI.deleteCodeSnippet(id);
          if (response.data.code === 0) {
            message.success('删除成功');
            loadSnippets();
          } else {
            message.error('删除失败: ' + response.data.message);
          }
        } catch (error) {
          console.error('Failed to delete snippet:', error);
          message.error('删除失败: ' + (error.response?.data?.message || error.message));
        }
      },
    });
  };

  const handleToggleEnabled = async (snippet) => {
    try {
      const response = await adminAPI.updateCodeSnippet(snippet.id, {
        is_enabled: !snippet.is_enabled,
      });
      if (response.data.code === 0) {
        loadSnippets();
      } else {
        message.error('更新失败: ' + response.data.message);
      }
    } catch (error) {
      console.error('Failed to toggle enabled:', error);
      message.error('更新失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const getCategoryLabel = (category) => {
    const item = CATEGORIES.find(c => c.value === category);
    return item ? item.label : category;
  };

  const getPositionLabel = (position) => {
    const item = POSITIONS.find(p => p.value === position);
    return item ? item.label : position;
  };

  const formPosition = Form.useWatch('position', form);

  const columns = [
    {
      title: '名称', dataIndex: 'name', ellipsis: true,
      render: (name, record) => (
        <div>
          <div>{name}</div>
          {record.description && <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>}
        </div>
      ),
    },
    {
      title: '标识键', dataIndex: 'code_key', width: 160,
      render: (v) => <Tag>{v}</Tag>,
    },
    {
      title: '分类', dataIndex: 'category', width: 100,
      render: (v) => <Tag color={CATEGORY_COLORS[v] || 'default'}>{getCategoryLabel(v)}</Tag>,
    },
    {
      title: '位置', dataIndex: 'position', width: 120,
      render: (v) => getPositionLabel(v),
    },
    {
      title: '优先级', dataIndex: 'priority', width: 80,
      sorter: (a, b) => a.priority - b.priority,
    },
    {
      title: '状态', dataIndex: 'is_enabled', width: 90,
      render: (v, record) => (
        <Switch
          checked={v}
          onChange={() => handleToggleEnabled(record)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
          size="small"
        />
      ),
    },
    {
      title: '操作', width: 100, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>代码片段管理</h1>
          <Text type="secondary">管理注入到用户端前端的 SEO、统计、广告等代码</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建代码片段
        </Button>
      </div>

      <Segmented
        options={CATEGORIES.map(c => ({ value: c.value, label: c.label }))}
        value={selectedCategory}
        onChange={setSelectedCategory}
        style={{ marginBottom: 16 }}
      />

      <Table
        columns={columns}
        dataSource={snippets}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 800 }}
        pagination={false}
        locale={{ emptyText: <Empty description="暂无代码片段"><Button type="primary" onClick={handleCreate}>创建第一个代码片段</Button></Empty> }}
        rowClassName={(record) => record.is_enabled ? '' : 'ant-table-row-disabled'}
      />

      <Modal
        title={editingSnippet ? '编辑代码片段' : '新建代码片段'}
        open={showModal}
        onCancel={() => setShowModal(false)}
        onOk={handleSubmit}
        okText={editingSnippet ? '保存修改' : '创建'}
        cancelText="取消"
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：Google Analytics、百度统计" />
          </Form.Item>

          <Form.Item
            name="code_key"
            label="标识键"
            rules={[{ required: true, message: '请输入标识键' }]}
            extra="唯一标识，创建后不可修改"
          >
            <Input placeholder="如：google_analytics" disabled={!!editingSnippet} />
          </Form.Item>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="category" label="分类" rules={[{ required: true }]} style={{ flex: 1 }}>
              <Select options={CATEGORIES.filter(c => c.value !== 'all').map(c => ({ value: c.value, label: c.label }))} />
            </Form.Item>

            <Form.Item
              name="position"
              label="注入位置"
              rules={[{ required: true }]}
              extra={POSITIONS.find(p => p.value === formPosition)?.desc}
              style={{ flex: 1 }}
            >
              <Select options={POSITIONS.map(p => ({ value: p.value, label: p.label }))} />
            </Form.Item>
          </Space>

          <Space style={{ width: '100%' }} size="large">
            <Form.Item name="priority" label="优先级" extra="数字越小越先加载，默认100">
              <InputNumber min={0} max={9999} style={{ width: 160 }} />
            </Form.Item>

            <Form.Item name="is_enabled" label="状态" valuePropName="checked">
              <Switch checkedChildren="启用" unCheckedChildren="禁用" />
            </Form.Item>
          </Space>

          <Form.Item name="description" label="说明">
            <Input placeholder="简要说明这段代码的用途" />
          </Form.Item>

          <Form.Item name="code_content" label="代码内容" rules={[{ required: true, message: '请输入代码内容' }]}>
            <TextArea
              rows={12}
              placeholder="在此粘贴 HTML/JavaScript/CSS 代码..."
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
          </Form.Item>

          <Form.Item label="生效页面（可选）" extra="支持通配符 *，留空表示全部页面生效">
            <TextArea
              value={pagesInput}
              onChange={(e) => setPagesInput(e.target.value)}
              placeholder={'每行一个页面路径，如：\n/\n/search\n/paper/*\n\n留空表示全部页面生效'}
              rows={4}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CodeSnippets;
