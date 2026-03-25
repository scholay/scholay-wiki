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
  Form, Input, InputNumber, Tabs, Typography, List, Badge
} from 'antd';
import { EditOutlined, TableOutlined } from '@ant-design/icons';
import { adminAPI } from '../../services/adminApi';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const DefaultBusinessData = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState('dimensions');
  const [dimensions, setDimensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDimension, setEditingDimension] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (activeTab === 'dimensions') {
      loadDimensions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadDimensions = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getAnalysisDimensions();
      if (response.data.code === 0 && response.data.data) {
        setDimensions(response.data.data.dimensions || []);
      }
    } catch (error) {
      console.error('Failed to load dimensions:', error);
      message.error('加载分析维度失败');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (dimension) => {
    setEditingDimension(dimension);
    form.setFieldsValue({
      dimensionKey: dimension.dimensionKey,
      name: dimension.name,
      description: dimension.description,
      sortOrder: dimension.sortOrder,
      isActive: dimension.isActive
    });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const { dimensionKey, ...submitData } = values;
      const response = await adminAPI.updateAnalysisDimension(editingDimension.id, submitData);
      if (response.data.code === 0) {
        message.success('分析维度更新成功');
        setShowModal(false);
        loadDimensions();
      } else {
        message.error('更新失败: ' + response.data.message);
      }
    } catch (error) {
      if (error.errorFields) return;
      console.error('Failed to update dimension:', error);
      message.error('更新失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setSubmitting(false);
    }
  };

  const tabItems = [
    {
      key: 'dimensions',
      label: (
        <Space>
          <TableOutlined />
          分析维度
        </Space>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Typography.Title level={5} style={{ marginBottom: 4 }}>论文分析维度</Typography.Title>
            <Text type="secondary">配置表格视图中AI分析论文摘要的维度，包括维度名称和分析指示</Text>
          </div>

          <Spin spinning={loading}>
            {!loading && dimensions.length === 0 ? (
              <Empty description="暂无分析维度" />
            ) : (
              <List
                dataSource={dimensions}
                renderItem={(dimension) => (
                  <Card
                    size="small"
                    style={{ marginBottom: 12, opacity: dimension.isActive ? 1 : 0.6 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Space align="start">
                        <Badge count={dimension.sortOrder} style={{ backgroundColor: '#1677ff' }} />
                        <div>
                          <Space style={{ marginBottom: 4 }}>
                            <Text strong>{dimension.name}</Text>
                            <Text code style={{ fontSize: 12 }}>{dimension.dimensionKey}</Text>
                            <Tag color={dimension.isActive ? 'success' : 'default'}>
                              {dimension.isActive ? '启用' : '停用'}
                            </Tag>
                          </Space>
                          <div>
                            <Text type="secondary" style={{ fontSize: 12 }}>分析指示：</Text>
                            <Paragraph
                              type="secondary"
                              style={{ fontSize: 13, marginBottom: 4 }}
                              ellipsis={{ rows: 2, expandable: true, symbol: '展开' }}
                            >
                              {dimension.description}
                            </Paragraph>
                          </div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            更新时间: {new Date(dimension.updatedAt).toLocaleString('zh-CN')}
                          </Text>
                        </div>
                      </Space>
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(dimension)}
                      />
                    </div>
                  </Card>
                )}
              />
            )}
          </Spin>
        </div>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={4} style={{ marginBottom: 4 }}>默认业务数据</Typography.Title>
        <Text type="secondary">管理系统默认的业务配置数据</Text>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <Modal
        title="编辑分析维度"
        open={showModal}
        onCancel={() => setShowModal(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText="保存修改"
        cancelText="取消"
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Typography.Title level={5}>基本信息</Typography.Title>

          <Form.Item name="dimensionKey" label="维度标识">
            <Input disabled />
          </Form.Item>

          <Form.Item
            name="name"
            label="维度名称"
            rules={[{ required: true, message: '请输入维度名称' }]}
            extra="显示在表格列头的名称"
          >
            <Input placeholder="例如：研究类型" />
          </Form.Item>

          <Space size="large" style={{ width: '100%' }}>
            <Form.Item name="sortOrder" label="排序顺序">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>

            <Form.Item name="isActive" label="启用状态" valuePropName="checked" extra="停用的维度不会在表格中显示">
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          </Space>

          <Typography.Title level={5} style={{ marginTop: 8 }}>分析指示</Typography.Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            AI分析论文摘要时使用的提示词，描述如何提取和分析该维度的信息
          </Text>

          <Form.Item
            name="description"
            rules={[{ required: true, message: '请输入分析指示' }]}
          >
            <TextArea rows={8} placeholder="输入分析指示内容..." showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DefaultBusinessData;
