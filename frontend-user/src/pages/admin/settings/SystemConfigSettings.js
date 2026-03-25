import React, { useState, useEffect, useCallback } from 'react';
import { Form, Button, Card, Switch, App } from 'antd';
import { adminAPI } from 'features/admin/api/adminApi';

const SystemConfigSettings = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [fullConfig, setFullConfig] = useState(null);

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/config/system');
      const data = await response.json();
      if (data.code === 0 && data.data) {
        setFullConfig(data.data);
        form.setFieldsValue({
          requireEmailVerification: data.data.require_email_verification ?? true,
        });
      }
    } catch (err) {
      console.error('Failed to load system config:', err);
    }
  }, [form]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSubmit = async (values) => {
    setSaving(true);
    try {
      const response = await adminAPI.updateSystemConfig({
        require_email_verification: values.requireEmailVerification,
        enable_turnstile: fullConfig?.enable_turnstile ?? false,
        turnstile_site_key: fullConfig?.turnstile_site_key ?? '',
        turnstile_secret_key: fullConfig?.turnstile_secret_key ?? '',
      });
      if (response.data.code === 0) {
        message.success('系统配置已成功保存');
        loadConfig();
      } else {
        message.error(response.data.message || '保存失败');
      }
    } catch (err) {
      message.error(err.response?.data?.message || '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="系统配置">
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
        配置系统级别的功能设置
      </p>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="requireEmailVerification"
          label="邮箱验证码验证"
          valuePropName="checked"
          extra="启用后，用户登录和注册时需要输入邮箱验证码"
        >
          <Switch />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存配置
          </Button>
        </div>
      </Form>
    </Card>
  );
};

export default SystemConfigSettings;
