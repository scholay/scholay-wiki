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
  App, Modal, Table, Card, Statistic, Tag, Button, Space, Form,
  Input, InputNumber, Select, Row, Col, Switch, Tooltip, Typography,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { adminAPI } from '../../services/adminApi';

const { Text } = Typography;

const ThirdPartyAccounts = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [stats, setStats] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [filterType, setFilterType] = useState('');
  const [filterActive, setFilterActive] = useState(false);
  const [form] = Form.useForm();

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getThirdPartyAccounts(filterType, filterActive);
      if (response.data.code === 0 && response.data.data) {
        setAccounts(response.data.data.accounts || []);
      }
    } catch (err) {
      message.error('加载账号列表失败');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterActive]);

  const loadStats = useCallback(async () => {
    try {
      const response = await adminAPI.getThirdPartyAccountStats();
      if (response.data.code === 0 && response.data.data) {
        setStats(response.data.data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadStats();
  }, [loadAccounts, loadStats]);

  const handleCreate = () => {
    setEditingAccount(null);
    form.resetFields();
    form.setFieldsValue({
      type: 'semantic_scholar',
      status: 1,
      priority: 0,
    });
    setShowModal(true);
  };

  const handleEdit = (account) => {
    setEditingAccount(account);
    form.setFieldsValue({
      name: account.name,
      type: account.type,
      status: account.status,
      priority: account.priority || 0,
      api_key: account.config?.api_key || '',
      base_url: account.config?.base_url || '',
      model_low: account.config?.model_low || '',
      model_mid: account.config?.model_mid || '',
      model_high: account.config?.model_high || '',
      peer_review_model_1: account.config?.peer_review_model_1 || '',
      peer_review_model_2: account.config?.peer_review_model_2 || '',
      peer_review_model_3: account.config?.peer_review_model_3 || '',
    });
    setShowModal(true);
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认',
      content: '确认删除此账号？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await adminAPI.deleteThirdPartyAccount(id);
          if (response.data.code === 0) {
            message.success('删除成功');
            loadAccounts();
            loadStats();
          } else {
            message.error(response.data.message || '删除失败');
          }
        } catch (err) {
          message.error('删除失败');
        }
      },
    });
  };

  const handleTest = async (id) => {
    try {
      const response = await adminAPI.testThirdPartyAccount(id);
      if (response.data.code === 0) {
        message.success('测试成功: ' + response.data.data.message);
      } else {
        message.error('测试失败: ' + response.data.message);
      }
    } catch (err) {
      message.error('测试失败');
    }
  };

  const handleRefreshCache = async () => {
    try {
      const response = await adminAPI.refreshThirdPartyAccountCache();
      if (response.data.code === 0) {
        message.success('缓存刷新成功');
      } else {
        message.error('刷新失败: ' + response.data.message);
      }
    } catch (err) {
      message.error('刷新失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const accountType = values.type;

      let config = {};
      if (accountType === 'semantic_scholar') {
        config = { api_key: values.api_key };
      } else if (accountType === 'ai_model') {
        config = { base_url: values.base_url, api_key: values.api_key };
        if (values.model_low) config.model_low = values.model_low;
        if (values.model_mid) config.model_mid = values.model_mid;
        if (values.model_high) config.model_high = values.model_high;
        if (values.peer_review_model_1) config.peer_review_model_1 = values.peer_review_model_1;
        if (values.peer_review_model_2) config.peer_review_model_2 = values.peer_review_model_2;
        if (values.peer_review_model_3) config.peer_review_model_3 = values.peer_review_model_3;
      }

      const data = {
        name: values.name,
        type: accountType,
        config,
        status: values.status,
        priority: values.priority,
      };

      let response;
      if (editingAccount) {
        response = await adminAPI.updateThirdPartyAccount(editingAccount.id, data);
      } else {
        response = await adminAPI.createThirdPartyAccount(data);
      }

      if (response.data.code === 0) {
        message.success(editingAccount ? '更新成功' : '创建成功');
        setShowModal(false);
        loadAccounts();
        loadStats();
      } else {
        message.error(response.data.message || '操作失败');
      }
    } catch (err) {
      if (err.errorFields) return;
      message.error('操作失败');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '从未使用';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  const formatRelativeTime = (dateString) => {
    if (!dateString) return '从未使用';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffSeconds < 30) return '刚刚';
    if (diffSeconds < 60) return `${diffSeconds}秒前`;
    if (diffMinutes < 60) return `${diffMinutes}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffWeeks < 4) return `${diffWeeks}周前`;
    if (diffMonths < 12) return `${diffMonths}个月前`;
    return date.toLocaleDateString('zh-CN');
  };

  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('zh-CN');
  };

  const getModelCodesLabel = (config) => {
    if (!config) return '-';
    const models = [];
    if (config.model_low) models.push(`Low: ${config.model_low}`);
    if (config.model_mid) models.push(`Mid: ${config.model_mid}`);
    if (config.model_high) models.push(`High: ${config.model_high}`);

    const prModels = [];
    if (config.peer_review_model_1) prModels.push(`α: ${config.peer_review_model_1}`);
    if (config.peer_review_model_2) prModels.push(`β: ${config.peer_review_model_2}`);
    if (config.peer_review_model_3) prModels.push(`γ: ${config.peer_review_model_3}`);

    let result = models.length > 0 ? models.join(' / ') : '';
    if (prModels.length > 0) {
      result += (result ? ' | 审稿: ' : '审稿: ') + prModels.join(', ');
    }
    return result || '-';
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60, sorter: (a, b) => a.id - b.id },
    { title: '名称', dataIndex: 'name', ellipsis: true },
    {
      title: '类型', dataIndex: 'type', width: 150,
      render: (type) => (
        <Tag color={type === 'ai_model' ? 'blue' : 'green'}>
          {type === 'ai_model' ? 'AI模型' : 'Semantic Scholar'}
        </Tag>
      ),
    },
    {
      title: '优先级', dataIndex: 'priority', width: 80, sorter: (a, b) => (a.priority || 0) - (b.priority || 0),
      render: (v) => <Tag>{v || 0}</Tag>,
    },
    {
      title: '模型编码', width: 240, ellipsis: true,
      render: (_, record) => record.type === 'ai_model'
        ? <Text style={{ fontSize: 12 }}>{getModelCodesLabel(record.config)}</Text>
        : '-',
    },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (status) => (
        <Tag color={status === 1 ? 'success' : 'default'}>{status === 1 ? '启用' : '停用'}</Tag>
      ),
    },
    {
      title: '使用次数', dataIndex: 'usage_count', width: 90,
      sorter: (a, b) => (a.usage_count || 0) - (b.usage_count || 0),
      render: (v) => v || 0,
    },
    {
      title: '最后使用', dataIndex: 'last_used_at', width: 150,
      render: (v) => formatDate(v),
    },
    {
      title: '创建时间', dataIndex: 'created_at', width: 150,
      render: (v) => formatDate(v),
    },
    {
      title: '操作', width: 180, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button size="small" onClick={() => handleTest(record.id)} icon={<ExperimentOutlined />}>
            测试
          </Button>
          <Button size="small" onClick={() => handleEdit(record)} icon={<EditOutlined />} />
          <Button size="small" danger onClick={() => handleDelete(record.id)} icon={<DeleteOutlined />} />
        </Space>
      ),
    },
  ];

  const formType = Form.useWatch('type', form);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>第三方账号配置</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleRefreshCache}>刷新缓存</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>添加账号</Button>
        </Space>
      </div>

      {stats && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small"><Statistic title="总账号数" value={stats.total || 0} /></Card>
            </Col>
            <Col span={8}>
              <Card size="small"><Statistic title="启用账号" value={stats.active_count || 0} /></Card>
            </Col>
            <Col span={8}>
              <Card size="small"><Statistic title="总请求次数" value={stats.total_usage || 0} formatter={(v) => formatNumber(v)} /></Card>
            </Col>
          </Row>

          {stats.type_stats && stats.type_stats.length > 0 && (
            <Row gutter={16} style={{ marginBottom: 16 }}>
              {stats.type_stats.map((typeStat) => (
                <Col span={12} key={typeStat.type}>
                  <Card
                    size="small"
                    title={<Space>{typeStat.type_name}<Tag>{typeStat.type}</Tag></Space>}
                  >
                    <Row gutter={16}>
                      <Col span={8}>
                        <Statistic title="启用/总数" value={`${typeStat.active_count} / ${typeStat.total_count}`} />
                      </Col>
                      <Col span={8}>
                        <Statistic title="总请求次数" value={formatNumber(typeStat.total_usage)} />
                      </Col>
                      <Col span={8}>
                        <Tooltip title={formatDate(typeStat.last_used_at)}>
                          <Statistic title="最后使用" value={formatRelativeTime(typeStat.last_used_at)} />
                        </Tooltip>
                      </Col>
                    </Row>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </>
      )}

      <Space style={{ marginBottom: 16 }}>
        <Select
          value={filterType}
          onChange={setFilterType}
          style={{ width: 180 }}
          options={[
            { value: '', label: '全部类型' },
            { value: 'semantic_scholar', label: 'Semantic Scholar' },
            { value: 'ai_model', label: 'AI模型' },
          ]}
        />
        <Switch
          checked={filterActive}
          onChange={setFilterActive}
          checkedChildren="仅启用"
          unCheckedChildren="全部"
        />
      </Space>

      <Table
        columns={columns}
        dataSource={accounts}
        rowKey="id"
        loading={loading}
        pagination={false}
        scroll={{ x: 1200 }}
        size="small"
      />

      <Modal
        title={editingAccount ? '编辑账号' : '添加账号'}
        open={showModal}
        onCancel={() => setShowModal(false)}
        onOk={handleSubmit}
        okText={editingAccount ? '保存' : '创建'}
        cancelText="取消"
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <Form.Item name="name" label="账号名称" rules={[{ required: true, message: '请输入账号名称' }]}>
            <Input placeholder="请输入账号名称" />
          </Form.Item>

          <Form.Item name="type" label="账号类型" rules={[{ required: true }]}>
            <Select disabled={!!editingAccount} options={[
              { value: 'semantic_scholar', label: 'Semantic Scholar' },
              { value: 'ai_model', label: 'AI模型' },
            ]} />
          </Form.Item>

          {formType === 'semantic_scholar' && (
            <Form.Item name="api_key" label="API Key" rules={[{ required: true, message: '请输入API Key' }]}>
              <Input placeholder="请输入Semantic Scholar API Key" />
            </Form.Item>
          )}

          {formType === 'ai_model' && (
            <>
              <Form.Item name="base_url" label="Base URL" rules={[{ required: true, message: '请输入Base URL' }]}>
                <Input placeholder="https://api.example.com" />
              </Form.Item>
              <Form.Item name="api_key" label="API Key" rules={[{ required: true, message: '请输入API Key' }]}>
                <Input placeholder="请输入API Key" />
              </Form.Item>

              <Card size="small" title="模型编码配置" style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                  为不同级别的任务配置对应的模型编码。至少配置一个模型编码。
                </Text>
                <Form.Item name="model_low" label="低级模型编码（Low）" extra="用于普通任务和基础对话">
                  <Input placeholder="例如: gpt-3.5-turbo, claude-3-haiku" />
                </Form.Item>
                <Form.Item name="model_mid" label="中级模型编码（Mid）" extra="用于复杂分析和深度对话">
                  <Input placeholder="例如: gpt-4, claude-3-sonnet" />
                </Form.Item>
                <Form.Item name="model_high" label="高级模型编码（High）" extra="用于最高质量的任务和专业分析">
                  <Input placeholder="例如: gpt-4-turbo, claude-3-opus" />
                </Form.Item>
              </Card>

              <Card size="small" title="智能审稿专用模型" style={{ marginBottom: 16 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
                  为智能审稿功能配置三个不同的模型。如果不配置，将回退使用上面的高/中/低级模型。
                </Text>
                <Form.Item name="peer_review_model_1" label="审稿人 Alpha 模型" extra="审稿人 Alpha（α）使用的模型">
                  <Input placeholder="例如: gpt-4-turbo, claude-3-opus" />
                </Form.Item>
                <Form.Item name="peer_review_model_2" label="审稿人 Beta 模型" extra="审稿人 Beta（β）使用的模型">
                  <Input placeholder="例如: gemini-1.5-pro, deepseek-chat" />
                </Form.Item>
                <Form.Item name="peer_review_model_3" label="审稿人 Gamma 模型" extra="审稿人 Gamma（γ）使用的模型">
                  <Input placeholder="例如: qwen-max, glm-4" />
                </Form.Item>
              </Card>
            </>
          )}

          <Form.Item name="priority" label="优先级" extra="数字越小优先级越高，相同优先级的账号会随机选择">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>

          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select options={[
              { value: 1, label: '启用' },
              { value: 0, label: '停用' },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ThirdPartyAccounts;
