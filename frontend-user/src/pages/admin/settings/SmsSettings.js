import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Card, Spin, Descriptions, Tag, Space, App } from 'antd';
import { EditOutlined, PlusOutlined, CheckCircleOutlined, SendOutlined } from '@ant-design/icons';
import { adminAPI } from 'features/admin/api/adminApi';
import SensitiveField from '../../../components/admin/SensitiveField';

const SmsSettings = ({ isVerified, onRequestVerify }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [savedConfig, setSavedConfig] = useState(null);
  const [realSecret, setRealSecret] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testing, setTesting] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const response = await adminAPI.getSMSConfig();
      if (response.data.code === 0 && response.data.data) {
        setSavedConfig(response.data.data);
        setIsEditing(false);
      } else {
        setSavedConfig(null);
      }
    } catch (err) {
      console.error('Failed to load SMS config:', err);
      setSavedConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (isVerified && savedConfig && !realSecret) {
      adminAPI.getSMSConfig(true).then(res => {
        if (res.data.code === 0 && res.data.data) {
          setRealSecret(res.data.data.access_secret);
        }
      }).catch(err => console.error('Failed to load real secret:', err));
    }
    if (!isVerified) {
      setRealSecret(null);
    }
  }, [isVerified, savedConfig, realSecret]);

  const handleStartEditing = () => {
    if (savedConfig) {
      form.setFieldsValue({
        accessKeyId: savedConfig.access_key_id || '',
        accessSecret: '',
        signName: savedConfig.sign_name || '',
        templateCode: savedConfig.template_code || '',
        templateContent: savedConfig.template_content || '',
        endpoint: savedConfig.endpoint || 'dypnsapi.aliyuncs.com',
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
      const configToSend = {
        access_key_id: values.accessKeyId,
        access_secret: values.accessSecret,
        sign_name: values.signName,
        template_code: values.templateCode,
        template_content: values.templateContent,
        endpoint: values.endpoint,
        is_active: true,
      };
      const response = await adminAPI.updateSMSConfig(configToSend);
      if (response.data.code === 0) {
        message.success('短信配置已成功保存');
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

  const handleTestSMS = async () => {
    if (!testPhone || !/^1[3-9]\d{9}$/.test(testPhone)) {
      message.error('请输入有效的手机号码');
      return;
    }
    setTesting(true);
    try {
      let testConfig;
      if (isEditing) {
        const values = form.getFieldsValue();
        if (!values.accessKeyId || !values.accessSecret || !values.signName || !values.templateCode || !values.templateContent) {
          message.error('请先完整填写短信配置');
          setTesting(false);
          return;
        }
        testConfig = {
          access_key_id: values.accessKeyId,
          access_secret: values.accessSecret,
          sign_name: values.signName,
          template_code: values.templateCode,
          template_content: values.templateContent,
          endpoint: values.endpoint,
          phone_number: testPhone,
          use_saved_config: false,
        };
      } else {
        if (!savedConfig) {
          message.error('未找到已保存的短信配置');
          setTesting(false);
          return;
        }
        testConfig = {
          phone_number: testPhone,
          use_saved_config: true,
        };
      }
      const response = await adminAPI.testSMSConfig(testConfig);
      if (response.data.code === 0) {
        message.success('测试短信已发送成功，请检查手机');
        setTestPhone('');
      } else {
        message.error(response.data.message || '发送测试短信失败');
      }
    } catch (err) {
      message.error(err.response?.data?.message || '发送测试短信失败，请检查配置');
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
        title="短信服务配置"
        extra={
          !isEditing && savedConfig ? (
            <Button icon={<EditOutlined />} onClick={handleStartEditing}>编辑配置</Button>
          ) : null
        }
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          配置阿里云短信服务用于发送验证码
        </p>

        {!isEditing && savedConfig ? (
          <>
            <Tag icon={<CheckCircleOutlined />} color="success" style={{ marginBottom: 16 }}>
              已保存的配置
            </Tag>
            <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
              <Descriptions.Item label="Access Key ID">{savedConfig.access_key_id}</Descriptions.Item>
              <Descriptions.Item label="Access Secret">
                <SensitiveField
                  value={realSecret || savedConfig.access_secret}
                  isVerified={isVerified}
                  onRequestVerify={onRequestVerify}
                />
              </Descriptions.Item>
              <Descriptions.Item label="签名名称">{savedConfig.sign_name}</Descriptions.Item>
              <Descriptions.Item label="模板代码">{savedConfig.template_code}</Descriptions.Item>
              <Descriptions.Item label="模板内容" span={2}>
                <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {savedConfig.template_content}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="接入点">{savedConfig.endpoint}</Descriptions.Item>
            </Descriptions>
          </>
        ) : !isEditing && !savedConfig ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: 'var(--text-tertiary)', marginBottom: 16 }}>尚未配置短信服务</p>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsEditing(true)}>
              开始配置
            </Button>
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ endpoint: 'dypnsapi.aliyuncs.com' }}>
            <div style={gridStyle}>
              <Form.Item
                name="accessKeyId"
                label="Access Key ID"
                rules={[{ required: true, message: '请输入 Access Key ID' }]}
                extra="阿里云账号的 Access Key ID"
              >
                <Input placeholder="请输入 Access Key ID" />
              </Form.Item>
              <Form.Item
                name="accessSecret"
                label="Access Secret"
                rules={savedConfig ? [] : [{ required: true, message: '请输入 Access Secret' }]}
                extra={savedConfig ? '留空则不修改密钥' : '阿里云账号的 Access Secret'}
              >
                <Input.Password placeholder={savedConfig ? '留空则不修改密钥' : '请输入 Access Secret'} />
              </Form.Item>
            </div>

            <div style={gridStyle}>
              <Form.Item
                name="signName"
                label="签名名称"
                rules={[{ required: true, message: '请输入签名名称' }]}
                extra="在阿里云短信服务中创建的签名名称"
              >
                <Input placeholder="请输入短信签名" />
              </Form.Item>
              <Form.Item
                name="templateCode"
                label="模板代码"
                rules={[{ required: true, message: '请输入模板代码' }]}
                extra="在阿里云短信服务中创建的模板代码"
              >
                <Input placeholder="请输入模板代码" />
              </Form.Item>
            </div>

            <Form.Item
              name="templateContent"
              label="模板内容"
              rules={[{ required: true, message: '请输入模板内容' }]}
              // eslint-disable-next-line no-template-curly-in-string
              extra="模板内容需要与阿里云模板一致，使用 ${变量名} 表示变量"
            >
              <Input.TextArea
                rows={3}
                // eslint-disable-next-line no-template-curly-in-string
                placeholder="请输入模板内容，例如：您的验证码是${code},有效期为5分钟,请勿泄露给他人。"
              />
            </Form.Item>

            <Form.Item
              name="endpoint"
              label="接入点"
              extra="阿里云号码认证服务接入点，默认为 dypnsapi.aliyuncs.com"
            >
              <Input placeholder="dypnsapi.aliyuncs.com" />
            </Form.Item>

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

      {(savedConfig || isEditing) && (
        <Card title="测试短信发送">
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
            发送测试短信验证配置是否正确。测试验证码为 123456，有效期10分钟。
          </p>
          <Space.Compact style={{ maxWidth: 500 }}>
            <Input
              placeholder="请输入手机号码（如：13800138000）"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              disabled={testing}
              onPressEnter={handleTestSMS}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleTestSMS}
              loading={testing}
              disabled={!testPhone}
            >
              发送测试短信
            </Button>
          </Space.Compact>
        </Card>
      )}
    </Space>
  );
};

export default SmsSettings;
