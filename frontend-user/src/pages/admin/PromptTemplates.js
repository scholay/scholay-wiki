/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  App, Modal, Card, Button, Space, Tag, Switch, Spin, Empty,
  Form, Input, Row, Col, Typography, List, Tooltip
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined
} from '@ant-design/icons';
import { adminAPI } from '../../services/adminApi';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const PromptTemplates = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getPromptTemplates();
      if (response.data.code === 0 && response.data.data) {
        setTemplates(response.data.data.templates || []);
      }
    } catch (error) {
      console.error('Failed to load prompt templates:', error);
      message.error('加载提示词模板失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    form.setFieldsValue({
      name: '',
      key: '',
      template: '',
      description: '',
      is_active: true
    });
    setShowModal(true);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    form.setFieldsValue({
      name: template.name,
      key: template.key,
      template: template.template,
      description: template.description || '',
      is_active: Boolean(template.is_active)
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingTemplate) {
        const response = await adminAPI.updatePromptTemplate(editingTemplate.id, values);
        if (response.data.code === 0) {
          message.success('提示词模板更新成功');
          setShowModal(false);
          loadTemplates();
        } else {
          message.error('更新失败: ' + response.data.message);
        }
      } else {
        const response = await adminAPI.createPromptTemplate(values);
        if (response.data.code === 0) {
          message.success('提示词模板创建成功');
          setShowModal(false);
          loadTemplates();
        } else {
          message.error('创建失败: ' + response.data.message);
        }
      }
    } catch (error) {
      if (error.errorFields) return;
      console.error('Failed to save template:', error);
      message.error('保存失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认',
      content: '确定要删除这个提示词模板吗？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await adminAPI.deletePromptTemplate(id);
          if (response.data.code === 0) {
            message.success('删除成功');
            loadTemplates();
          } else {
            message.error('删除失败: ' + response.data.message);
          }
        } catch (error) {
          console.error('Failed to delete template:', error);
          message.error('删除失败: ' + (error.response?.data?.message || error.message));
        }
      },
    });
  };

  const handleToggleActive = async (template) => {
    try {
      const response = await adminAPI.updatePromptTemplate(template.id, {
        name: template.name,
        template: template.template,
        description: template.description,
        is_active: !template.is_active
      });
      if (response.data.code === 0) {
        loadTemplates();
      } else {
        message.error('更新失败: ' + response.data.message);
      }
    } catch (error) {
      console.error('Failed to toggle active:', error);
      message.error('更新失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const insertVariable = (variable) => {
    const current = form.getFieldValue('template') || '';
    form.setFieldsValue({ template: current + variable });
  };

  const templateValue = Form.useWatch('template', form) || '';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>提示词模板管理</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          新建模板
        </Button>
      </div>

      <Spin spinning={loading}>
        {!loading && templates.length === 0 ? (
          <Empty description="暂无模板" />
        ) : (
          <List
            grid={{ gutter: 16, xs: 1, sm: 1, md: 2, lg: 2, xl: 2, xxl: 3 }}
            dataSource={templates}
            renderItem={(template) => (
              <List.Item>
                <Card
                  style={{ opacity: template.is_active ? 1 : 0.65 }}
                  title={
                    <Space>
                      <span>{template.name}</span>
                      <Tag color={template.is_active ? 'success' : 'default'}>
                        {template.is_active ? '启用' : '停用'}
                      </Tag>
                    </Space>
                  }
                  extra={
                    <Space size="small">
                      <Tooltip title={template.is_active ? '停用' : '启用'}>
                        <Switch
                          size="small"
                          checked={template.is_active}
                          onChange={() => handleToggleActive(template)}
                        />
                      </Tooltip>
                      <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(template)} />
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(template.id)} />
                    </Space>
                  }
                >
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary">Key: </Text>
                    <Text code>{template.key}</Text>
                  </div>

                  {template.description && (
                    <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ marginBottom: 8 }}>
                      {template.description}
                    </Paragraph>
                  )}

                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>模板内容预览：</Text>
                    <Paragraph
                      style={{ fontSize: 12, background: '#f5f5f5', padding: 8, borderRadius: 4, marginTop: 4, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
                      ellipsis={{ rows: 4 }}
                    >
                      {template.template}
                    </Paragraph>
                  </div>

                  <Space style={{ fontSize: 12 }} split={<span style={{ color: '#d9d9d9' }}>|</span>}>
                    <Text type="secondary">创建: {new Date(template.created_at).toLocaleString('zh-CN')}</Text>
                    <Text type="secondary">更新: {new Date(template.updated_at).toLocaleString('zh-CN')}</Text>
                  </Space>
                </Card>
              </List.Item>
            )}
          />
        )}
      </Spin>

      <Modal
        title={editingTemplate ? '编辑提示词模板' : '新建提示词模板'}
        open={showModal}
        onCancel={() => setShowModal(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={editingTemplate ? '保存修改' : '创建模板'}
        cancelText="取消"
        width={800}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Typography.Title level={5}>基本信息</Typography.Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            设置模板的基本属性和标识
          </Text>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="模板名称"
                rules={[{ required: true, message: '请输入模板名称' }]}
              >
                <Input placeholder="例如：论文分析总结提示词" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="key"
                label="模板Key"
                rules={[{ required: true, message: '请输入模板Key' }]}
                extra={editingTemplate ? '创建后不可修改' : undefined}
              >
                <Input placeholder="例如：paper_analysis" disabled={!!editingTemplate} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="模板描述">
            <Input placeholder="简短描述这个模板的用途，例如：用于分析搜索到的学术论文并生成结构化综述" />
          </Form.Item>

          <Form.Item name="is_active" label="启用状态" valuePropName="checked" extra="停用的模板不会在系统中生效">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>

          <Typography.Title level={5} style={{ marginTop: 8 }}>模板内容</Typography.Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            编写提示词模板，使用变量占位符实现动态内容
          </Text>

          <Space style={{ marginBottom: 12 }}>
            <Text type="secondary">常用变量：</Text>
            <Button size="small" onClick={() => insertVariable('{{query}}')}>
              <code>{'{{query}}'}</code> 搜索关键词
            </Button>
            <Button size="small" onClick={() => insertVariable('{{papers}}')}>
              <code>{'{{papers}}'}</code> 论文列表
            </Button>
          </Space>

          <Form.Item
            name="template"
            rules={[{ required: true, message: '请输入模板内容' }]}
          >
            <TextArea
              rows={14}
              placeholder={'输入提示词模板内容...\n\n例如：\n你是一位专业的学术研究助手。用户搜索了关键词：「{{query}}」\n\n## 论文列表\n{{papers}}\n\n请对这些论文进行深入分析...'}
            />
          </Form.Item>

          <Space>
            <Text type="secondary">字符数: {templateValue.length}</Text>
            <Text type="secondary">行数: {templateValue.split('\n').length}</Text>
            <Text type="secondary">变量: {(templateValue.match(/\{\{.*?\}\}/g) || []).length}</Text>
          </Space>

          {templateValue && (
            <Card
              size="small"
              title="模板预览"
              extra={<Text type="secondary" style={{ fontSize: 12 }}>变量会以高亮显示</Text>}
              style={{ marginTop: 12 }}
            >
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>
                {templateValue.split(/(\{\{.*?\}\})/).map((part, index) => {
                  if (part.match(/\{\{.*?\}\}/)) {
                    return <Tag key={index} color="blue">{part}</Tag>;
                  }
                  return part;
                })}
              </div>
            </Card>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default PromptTemplates;
