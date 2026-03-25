import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Card, Switch, App } from 'antd';
import { adminAPI } from 'features/admin/api/adminApi';

const TurnstileSettings = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [fullConfig, setFullConfig] = useState(null);
  const enableTurnstile = Form.useWatch('enableTurnstile', form);

  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/config/system');
      const data = await response.json();
      if (data.code === 0 && data.data) {
        const config = {
          enableTurnstile: data.data.enable_turnstile ?? false,
          turnstileSiteKey: data.data.turnstile_site_key ?? '',
          turnstileSecretKey: data.data.turnstile_secret_key ?? '',
        };
        setFullConfig(data.data);
        form.setFieldsValue(config);
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
        require_email_verification: fullConfig?.require_email_verification ?? true,
        enable_turnstile: values.enableTurnstile,
        turnstile_site_key: values.turnstileSiteKey,
        turnstile_secret_key: values.turnstileSecretKey,
      });
      if (response.data.code === 0) {
        message.success('Turnstile 配置已成功保存');
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

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 16,
  };

  return (
    <Card title="Cloudflare Turnstile 人机验证">
      <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
        配置 Cloudflare Turnstile 人机验证以保护登录和注册
      </p>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="enableTurnstile"
          label="启用 Turnstile"
          valuePropName="checked"
          extra="启用后，用户登录和注册时需要通过 Turnstile 人机验证"
        >
          <Switch />
        </Form.Item>

        {enableTurnstile && (
          <div style={gridStyle}>
            <Form.Item
              name="turnstileSiteKey"
              label="Turnstile Site Key (公钥)"
              extra="从 Cloudflare Turnstile 控制台获取"
            >
              <Input placeholder="1x00000000000000000000AA (测试密钥)" />
            </Form.Item>
            <Form.Item
              name="turnstileSecretKey"
              label="Turnstile Secret Key (私钥)"
              extra="从 Cloudflare Turnstile 控制台获取"
            >
              <Input.Password placeholder="1x0000000000000000000000000000000AA (测试密钥)" />
            </Form.Item>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button type="primary" htmlType="submit" loading={saving}>
            保存配置
          </Button>
        </div>
      </Form>
    </Card>
  );
};

export default TurnstileSettings;
