import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Card, Space, Alert, Typography, App } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { adminAPI } from 'features/admin/api/adminApi';

const { Text } = Typography;

const GitHubOAuthSettings = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const domain = Form.useWatch('githubRedirectUri', form);

  const loadConfig = useCallback(async () => {
    try {
      const response = await adminAPI.getGithubConfig();
      if (response.data.code === 0 && response.data.data) {
        form.setFieldsValue({
          githubClientId: response.data.data.client_id ?? '',
          githubClientSecret: response.data.data.client_secret ?? '',
          githubRedirectUri: response.data.data.redirect_uri ?? '',
        });
      }
    } catch (err) {
      console.error('Failed to load GitHub config:', err);
    }
  }, [form]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSubmit = async (values) => {
    setSaving(true);
    try {
      const cleanDomain = values.githubRedirectUri.replace(/\/$/, '');
      const response = await adminAPI.updateGithubConfig({
        client_id: values.githubClientId,
        client_secret: values.githubClientSecret,
        redirect_uri: cleanDomain,
        enabled: true,
      });
      if (response.data.code === 0) {
        message.success('GitHub 配置已成功保存');
      } else {
        message.error(response.data.message || '保存失败');
      }
    } catch (err) {
      message.error(err.response?.data?.message || '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const callbackUrl = domain
    ? `${domain.replace(/\/$/, '')}/github/callback`
    : '请先填写网站域名';

  const handleCopyCallback = () => {
    if (domain) {
      navigator.clipboard.writeText(callbackUrl);
      message.success('回调地址已复制到剪贴板');
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="GitHub 登录配置">
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          配置 GitHub App 或 OAuth App 以支持用户通过 GitHub 账号登录
        </p>

        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="githubClientId"
            label="Client ID"
            rules={[{ required: true, message: '请输入 Client ID' }]}
            extra="从 GitHub App 或 OAuth App 设置中获取"
          >
            <Input placeholder="Iv1.1234567890abcdef" />
          </Form.Item>

          <Form.Item
            name="githubClientSecret"
            label="Client Secret"
            rules={[{ required: true, message: '请输入 Client Secret' }]}
            extra="从 GitHub App 或 OAuth App 设置中获取（请妥善保管，不要泄露）"
          >
            <Input.Password placeholder="输入 Client Secret" />
          </Form.Item>

          <Form.Item
            name="githubRedirectUri"
            label="网站域名"
            rules={[
              { required: true, message: '请输入网站域名' },
              { type: 'url', message: '请输入有效的URL' },
            ]}
            extra="填写您的网站域名（包含 http:// 或 https://，不要以 / 结尾）"
          >
            <Input placeholder="https://scholar.example.com" />
          </Form.Item>

          <Form.Item label="完整回调地址（自动生成）">
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={callbackUrl}
                readOnly
                style={{ backgroundColor: 'var(--surface-muted)' }}
              />
              <Button icon={<CopyOutlined />} onClick={handleCopyCallback} disabled={!domain}>
                复制
              </Button>
            </Space.Compact>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              根据您的域名自动生成，复制此地址到 GitHub App 或 OAuth App 的 Callback URL 配置中
            </Text>
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存配置
            </Button>
          </div>
        </Form>
      </Card>

      <Alert
        type="info"
        showIcon
        message="如何创建 GitHub App（推荐方式）"
        description={
          <div>
            <ol style={{ paddingLeft: 20, marginTop: 8 }}>
              <li>访问 GitHub Settings → Developer settings → GitHub Apps</li>
              <li>点击 &quot;New GitHub App&quot; 创建新应用</li>
              <li>填写基本信息（App name, Homepage URL, Description）</li>
              <li><strong>Callback URL</strong>：填写上面配置的回调地址</li>
              <li>
                <strong>权限设置</strong>：在 &quot;Account permissions&quot; 中选择：
                <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                  <li>Email addresses: Read-only（必需，用于获取用户邮箱）</li>
                </ul>
              </li>
              <li>取消勾选 &quot;Webhook&quot; 相关选项（不需要接收 webhook）</li>
              <li><strong>Where can this GitHub App be installed?</strong> 选择 &quot;Any account&quot;</li>
              <li>
                创建后，进入 App 设置页面：
                <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                  <li>复制 <strong>Client ID</strong></li>
                  <li>点击 &quot;Generate a new client secret&quot; 生成并复制 <strong>Client Secret</strong></li>
                </ul>
              </li>
              <li>将获取的信息填入上方表单并保存</li>
            </ol>
            <Alert
              type="warning"
              style={{ marginTop: 12 }}
              message={
                <div>
                  <ul style={{ paddingLeft: 20, margin: 0 }}>
                    <li>GitHub App 是 GitHub 官方推荐的方式，比传统 OAuth App 更安全、权限控制更细</li>
                    <li>如果已有 OAuth App，也可以继续使用（向下兼容）</li>
                    <li>Client Secret 只显示一次，请妥善保存</li>
                  </ul>
                </div>
              }
            />
          </div>
        }
      />
    </Space>
  );
};

export default GitHubOAuthSettings;
