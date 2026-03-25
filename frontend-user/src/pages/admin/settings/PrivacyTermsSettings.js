import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Card, Tabs, App } from 'antd';
import { adminAPI } from '../../../services/adminApi';

const PrivacyTab = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const loadPrivacyPolicy = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/config/privacy-policy');
      const data = await response.json();
      if (data.code === 0 && data.data) {
        form.setFieldsValue({
          version: data.data.version || '',
          content: data.data.content || '',
        });
      }
    } catch (err) {
      console.error('Failed to load privacy policy:', err);
    }
  }, [form]);

  useEffect(() => {
    loadPrivacyPolicy();
  }, [loadPrivacyPolicy]);

  const handleSubmit = async (values) => {
    setSaving(true);
    try {
      const response = await adminAPI.updatePrivacyPolicy(values.content, values.version);
      if (response.data.code === 0) {
        message.success('隐私协议已成功更新');
      } else {
        message.error(response.data.message || '更新失败');
      }
    } catch (err) {
      message.error(err.response?.data?.message || '更新失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Form.Item
        name="version"
        label="版本号"
        rules={[{ required: true, message: '请输入版本号' }]}
        extra="更新版本号以标识新版本的隐私协议"
      >
        <Input placeholder="1.0" />
      </Form.Item>

      <Form.Item
        name="content"
        label="隐私协议内容"
        rules={[{ required: true, message: '请输入隐私协议内容' }]}
        extra="支持Markdown格式，用户端会以美化的格式展示"
      >
        <Input.TextArea
          rows={15}
          placeholder="请输入隐私协议的详细内容...支持Markdown格式"
        />
      </Form.Item>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" htmlType="submit" loading={saving}>
          更新隐私协议
        </Button>
      </div>
    </Form>
  );
};

const TermsTab = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const loadTermsOfService = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/config/terms-of-service');
      const data = await response.json();
      if (data.code === 0 && data.data) {
        form.setFieldsValue({
          version: data.data.version || '',
          content: data.data.content || '',
        });
      }
    } catch (err) {
      console.error('Failed to load terms of service:', err);
    }
  }, [form]);

  useEffect(() => {
    loadTermsOfService();
  }, [loadTermsOfService]);

  const handleSubmit = async (values) => {
    setSaving(true);
    try {
      const response = await adminAPI.updateTermsOfService(values.content, values.version);
      if (response.data.code === 0) {
        message.success('用户协议已成功更新');
      } else {
        message.error(response.data.message || '更新失败');
      }
    } catch (err) {
      message.error(err.response?.data?.message || '更新失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Form.Item
        name="version"
        label="版本号"
        rules={[{ required: true, message: '请输入版本号' }]}
        extra="更新版本号以标识新版本的用户协议"
      >
        <Input placeholder="1.0" />
      </Form.Item>

      <Form.Item
        name="content"
        label="用户协议内容"
        rules={[{ required: true, message: '请输入用户协议内容' }]}
        extra="支持Markdown格式，用户端会以美化的格式展示"
      >
        <Input.TextArea
          rows={15}
          placeholder="请输入用户协议的详细内容...支持Markdown格式"
        />
      </Form.Item>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" htmlType="submit" loading={saving}>
          更新用户协议
        </Button>
      </div>
    </Form>
  );
};

const PrivacyTermsSettings = ({ defaultSubTab }) => {
  const tabItems = [
    {
      key: 'privacy',
      label: '隐私协议',
      children: <PrivacyTab />,
    },
    {
      key: 'terms',
      label: '用户协议',
      children: <TermsTab />,
    },
  ];

  return (
    <Card title="协议管理">
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
        编辑用户注册和登录时显示的隐私协议和用户协议内容，支持Markdown格式
      </p>
      <Tabs defaultActiveKey={defaultSubTab || 'privacy'} items={tabItems} />
    </Card>
  );
};

export default PrivacyTermsSettings;
