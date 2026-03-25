import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, InputNumber, Button, Card, Spin, Descriptions, Tag, Space, App } from 'antd';
import { EditOutlined, PlusOutlined, CheckCircleOutlined, SendOutlined } from '@ant-design/icons';
import { adminAPI } from '../../../services/adminApi';
import SensitiveField from '../../../components/admin/SensitiveField';

const EmailSettings = ({ isVerified, onRequestVerify }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [savedConfig, setSavedConfig] = useState(null);
  const [realPassword, setRealPassword] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const response = await adminAPI.getEmailConfig();
      if (response.data.code === 0 && response.data.data) {
        setSavedConfig(response.data.data);
      } else {
        setSavedConfig(null);
      }
    } catch (err) {
      console.error('Failed to load email config:', err);
      setSavedConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (isVerified && savedConfig && !realPassword) {
      adminAPI.getEmailConfig(true).then(res => {
        if (res.data.code === 0 && res.data.data) {
          setRealPassword(res.data.data.smtp_password);
        }
      }).catch(err => console.error('Failed to load real password:', err));
    }
    if (!isVerified) {
      setRealPassword(null);
    }
  }, [isVerified, savedConfig, realPassword]);

  const handleStartEditing = () => {
    if (savedConfig) {
      form.setFieldsValue({
        smtpHost: savedConfig.smtp_host || '',
        smtpPort: savedConfig.smtp_port || undefined,
        smtpUser: savedConfig.smtp_user || '',
        smtpPassword: '',
        fromEmail: savedConfig.from_email || '',
        fromName: savedConfig.from_name || '',
      });
    }
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    form.resetFields();
  };

  const handleSubmit = async (values) => {
    setSaving(true);
    try {
      const response = await adminAPI.updateEmailConfig(values);
      if (response.data.code === 0) {
        message.success('邮箱配置已成功保存');
        setIsEditing(false);
        form.resetFields();
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

  const handleTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      message.error('请输入有效的邮箱地址');
      return;
    }
    if (!savedConfig) {
      message.error('请先保存邮箱配置后再进行测试');
      return;
    }
    setTesting(true);
    try {
      const response = await adminAPI.testEmailConfig({ testEmail });
      if (response.data.code === 0) {
        message.success('测试邮件已发送成功，请检查收件箱');
        setTestEmail('');
      } else {
        message.error(response.data.message || '发送测试邮件失败');
      }
    } catch (err) {
      message.error(err.response?.data?.message || '发送测试邮件失败，请检查配置');
    } finally {
      setTesting(false);
    }
  };

  if (loadingConfig) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin tip="加载配置中..." />
      </div>
    );
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 16,
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="邮箱服务器配置"
        extra={
          !isEditing && savedConfig ? (
            <Button icon={<EditOutlined />} onClick={handleStartEditing}>编辑配置</Button>
          ) : null
        }
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          配置SMTP服务器用于发送验证邮件
        </p>

        {!isEditing && savedConfig ? (
          <>
            <Tag icon={<CheckCircleOutlined />} color="success" style={{ marginBottom: 16 }}>
              已保存的配置
            </Tag>
            <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
              <Descriptions.Item label="SMTP服务器地址">{savedConfig.smtp_host}</Descriptions.Item>
              <Descriptions.Item label="SMTP端口">{savedConfig.smtp_port}</Descriptions.Item>
              <Descriptions.Item label="SMTP用户名">{savedConfig.smtp_user}</Descriptions.Item>
              <Descriptions.Item label="SMTP密码">
                <SensitiveField
                  value={realPassword || savedConfig.smtp_password}
                  isVerified={isVerified}
                  onRequestVerify={onRequestVerify}
                />
              </Descriptions.Item>
              <Descriptions.Item label="发件人邮箱">{savedConfig.from_email}</Descriptions.Item>
              <Descriptions.Item label="发件人名称">{savedConfig.from_name}</Descriptions.Item>
            </Descriptions>
          </>
        ) : !isEditing && !savedConfig ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: 'var(--text-tertiary)', marginBottom: 16 }}>尚未配置邮箱服务器</p>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsEditing(true)}>
              开始配置
            </Button>
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <div style={gridStyle}>
              <Form.Item name="smtpHost" label="SMTP服务器地址" rules={[{ required: true, message: '请输入SMTP服务器地址' }]}>
                <Input placeholder="smtp.example.com" />
              </Form.Item>
              <Form.Item
                name="smtpPort"
                label="SMTP端口"
                rules={[{ required: true, message: '请输入SMTP端口' }]}
                extra="587端口使用STARTTLS，465端口使用SSL"
              >
                <InputNumber style={{ width: '100%' }} placeholder="587 或 465" />
              </Form.Item>
            </div>

            <div style={gridStyle}>
              <Form.Item name="smtpUser" label="SMTP用户名" rules={[{ required: true, message: '请输入SMTP用户名' }]}>
                <Input placeholder="user@example.com" />
              </Form.Item>
              <Form.Item
                name="smtpPassword"
                label="SMTP密码"
                rules={savedConfig ? [] : [{ required: true, message: '请输入SMTP密码' }]}
                extra={savedConfig ? '留空则不修改密码' : undefined}
              >
                <Input.Password placeholder={savedConfig ? '留空则不修改密码' : '输入SMTP密码'} />
              </Form.Item>
            </div>

            <div style={gridStyle}>
              <Form.Item
                name="fromEmail"
                label="发件人邮箱"
                rules={[
                  { required: true, message: '请输入发件人邮箱' },
                  { type: 'email', message: '请输入有效的邮箱地址' },
                ]}
              >
                <Input placeholder="noreply@example.com" />
              </Form.Item>
              <Form.Item name="fromName" label="发件人名称" rules={[{ required: true, message: '请输入发件人名称' }]}>
                <Input placeholder="Scholar" />
              </Form.Item>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              {savedConfig && (
                <Button onClick={handleCancelEditing} disabled={saving}>取消</Button>
              )}
              <Button type="primary" htmlType="submit" loading={saving}>
                保存配置
              </Button>
            </div>
          </Form>
        )}
      </Card>

      <Card title="测试邮件发送">
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>验证邮箱配置是否正确</p>
        {!savedConfig && !isEditing ? (
          <p style={{ color: 'var(--text-tertiary)' }}>请先配置邮箱服务器后再测试</p>
        ) : (
          <Space.Compact style={{ maxWidth: 500 }}>
            <Input
              type="email"
              placeholder="输入接收测试邮件的邮箱地址"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              disabled={testing}
              onPressEnter={handleTestEmail}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleTestEmail}
              loading={testing}
              disabled={!testEmail}
            >
              发送测试邮件
            </Button>
          </Space.Compact>
        )}
      </Card>
    </Space>
  );
};

export default EmailSettings;
