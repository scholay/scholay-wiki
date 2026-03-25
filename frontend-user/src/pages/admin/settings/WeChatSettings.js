import React, { useState, useEffect, useCallback } from 'react';
import {
  Form, Input, Button, Card, Spin, Descriptions, Tag, Select,
  Switch, Space, Modal, Segmented, Alert, Typography, App,
} from 'antd';
import {
  EditOutlined, PlusOutlined, DeleteOutlined,
  ThunderboltOutlined, CopyOutlined,
} from '@ant-design/icons';
import { adminAPI } from '../../../services/adminApi';
import SensitiveField from '../../../components/admin/SensitiveField';

const { Text } = Typography;

// ==================== WeChat OAuth Sub-component ====================

const WeChatOAuth = ({ isVerified, onRequestVerify }) => {
  const { message } = App.useApp();
  const [modalForm] = Form.useForm();
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getWeChatConfigs(isVerified);
      if (response.data.code === 0 && response.data.data) {
        setConfigs(response.data.data || []);
      }
    } catch (err) {
      message.error('加载微信配置失败');
    } finally {
      setLoading(false);
    }
  }, [message, isVerified]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleCreate = () => {
    setEditingConfig(null);
    modalForm.resetFields();
    modalForm.setFieldsValue({
      app_id: '',
      app_secret: '',
      redirect_uri: `${window.location.origin}/wechat/callback`,
      scope: 'snsapi_login',
    });
    setModalOpen(true);
  };

  const handleEdit = (config) => {
    setEditingConfig(config);
    modalForm.setFieldsValue({
      app_id: config.app_id,
      app_secret: '',
      redirect_uri: config.redirect_uri,
      scope: config.scope,
    });
    setModalOpen(true);
  };

  const handleModalSubmit = async () => {
    try {
      const values = await modalForm.validateFields();
      setSubmitting(true);
      let response;
      if (editingConfig) {
        const updateData = { ...values };
        if (!updateData.app_secret) delete updateData.app_secret;
        response = await adminAPI.updateWeChatConfig(editingConfig.id, updateData);
      } else {
        response = await adminAPI.createWeChatConfig(values);
      }
      if (response.data.code === 0) {
        message.success(editingConfig ? '更新成功' : '创建成功');
        setModalOpen(false);
        loadConfigs();
      } else {
        message.error(response.data.message || '操作失败');
      }
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: '确认',
      content: '确认删除此配置？',
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await adminAPI.deleteWeChatConfig(id);
          if (response.data.code === 0) {
            message.success('删除成功');
            loadConfigs();
          } else {
            message.error(response.data.message || '删除失败');
          }
        } catch (err) {
          message.error('删除失败');
        }
      },
    });
  };

  const handleActivate = async (id) => {
    try {
      const response = await adminAPI.activateWeChatConfig(id);
      if (response.data.code === 0) {
        message.success('激活成功');
        loadConfigs();
      } else {
        message.error(response.data.message || '激活失败');
      }
    } catch (err) {
      message.error('激活失败');
    }
  };

  return (
    <>
      <Card
        title="微信扫码登录配置"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            添加配置
          </Button>
        }
      >
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>管理微信扫码登录配置</p>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin tip="加载中..." />
          </div>
        ) : configs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
            <p>暂无微信扫码登录配置</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {configs.map((config) => (
              <Card
                key={config.id}
                size="small"
                title={`微信配置 #${config.id}`}
                extra={config.is_active && <Tag color="success">已激活</Tag>}
                style={config.is_active ? { borderColor: 'rgba(16,185,129,0.45)' } : undefined}
                actions={[
                  !config.is_active && (
                    <Button
                      key="activate"
                      type="link"
                      size="small"
                      icon={<ThunderboltOutlined />}
                      onClick={() => handleActivate(config.id)}
                    >
                      激活
                    </Button>
                  ),
                  <Button
                    key="edit"
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(config)}
                  >
                    编辑
                  </Button>,
                  <Button
                    key="delete"
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDelete(config.id)}
                  >
                    删除
                  </Button>,
                ].filter(Boolean)}
              >
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="应用 ID">{config.app_id}</Descriptions.Item>
                  <Descriptions.Item label="应用密钥">
                    <SensitiveField
                      value={config.app_secret}
                      isVerified={isVerified}
                      onRequestVerify={onRequestVerify}
                    />
                  </Descriptions.Item>
                  <Descriptions.Item label="回调地址">{config.redirect_uri}</Descriptions.Item>
                  <Descriptions.Item label="授权范围">{config.scope}</Descriptions.Item>
                </Descriptions>
              </Card>
            ))}
          </div>
        )}
      </Card>

      <Modal
        title={editingConfig ? '编辑微信配置' : '添加微信配置'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleModalSubmit}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={modalForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="app_id"
            label="应用 ID"
            rules={[{ required: true, message: '请输入应用 ID' }]}
          >
            <Input placeholder="输入微信应用 ID" />
          </Form.Item>
          <Form.Item
            name="app_secret"
            label={`应用密钥${editingConfig ? '（留空不修改）' : ''}`}
            rules={editingConfig ? [] : [{ required: true, message: '请输入应用密钥' }]}
          >
            <Input.Password placeholder="输入应用密钥" />
          </Form.Item>
          <Form.Item
            name="redirect_uri"
            label="回调地址"
            rules={[{ required: true, message: '请输入回调地址' }]}
          >
            <Input placeholder="授权回调地址" />
          </Form.Item>
          <Form.Item name="scope" label="授权范围">
            <Select
              options={[
                { value: 'snsapi_login', label: '网页授权(snsapi_login)' },
                { value: 'snsapi_base', label: '静默授权(snsapi_base)' },
                { value: 'snsapi_userinfo', label: '用户信息(snsapi_userinfo)' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// ==================== WeChat Official Account Sub-component ====================

const WeChatOfficial = ({ isVerified, onRequestVerify }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [savedConfig, setSavedConfig] = useState(null);
  const [realConfig, setRealConfig] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const autoReplyEnabled = Form.useWatch('auto_reply_enabled', form);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      const response = await adminAPI.getWeChatOfficialConfig();
      if (response.data.code === 0 && response.data.data) {
        setSavedConfig(response.data.data);
        setIsEditing(false);
      } else {
        setSavedConfig(null);
      }
    } catch (err) {
      console.error('Failed to load WeChat official config:', err);
      setSavedConfig(null);
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (isVerified && savedConfig && !realConfig) {
      adminAPI.getWeChatOfficialConfig(true).then(res => {
        if (res.data.code === 0 && res.data.data) {
          setRealConfig(res.data.data);
        }
      }).catch(err => console.error('Failed to load real wechat official config:', err));
    }
    if (!isVerified) {
      setRealConfig(null);
    }
  }, [isVerified, savedConfig, realConfig]);

  const handleStartEditing = () => {
    if (savedConfig) {
      form.setFieldsValue({
        app_id: savedConfig.app_id || '',
        app_secret: '',
        token: '',
        encoding_aes_key: '',
        encryption_mode: savedConfig.encryption_mode || 'plaintext',
        auto_reply_enabled: savedConfig.auto_reply_enabled || false,
        ai_model_level: savedConfig.ai_model_level || 'low',
        system_prompt: savedConfig.system_prompt || '',
      });
    }
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    form.resetFields();
  };

  const generateRandom = (length) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleGenerateToken = () => {
    form.setFieldsValue({ token: generateRandom(32) });
    message.success('Token已生成');
  };

  const handleGenerateEncodingAESKey = () => {
    form.setFieldsValue({ encoding_aes_key: generateRandom(43) });
    message.success('EncodingAESKey已生成');
  };

  const handleSubmit = async (values) => {
    setSaving(true);
    try {
      const response = await adminAPI.updateWeChatOfficialConfig(values);
      if (response.data.code === 0) {
        message.success('微信公众号配置已成功保存');
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

  const webhookUrl = `${window.location.origin}/api/v1/wechat-official/webhook`;

  const encryptionModeLabels = {
    plaintext: '明文模式',
    compatible: '兼容模式',
    secure: '安全模式（加密）',
  };

  const aiModelLabels = {
    low: 'Low - 低成本模型',
    medium: 'Medium - 中等模型',
    high: 'High - 高级模型',
  };

  if (loadingConfig) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin tip="加载中..." />
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title="微信公众号自动回复配置">
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
          配置微信公众号服务器信息和AI自动回复功能
        </p>

        {/* Webhook URL */}
        <Card size="small" style={{ marginBottom: 24, background: 'var(--surface-muted)' }}>
          <Text strong>服务器地址(URL)</Text>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <Input
              value={webhookUrl}
              readOnly
              style={{ fontFamily: 'monospace', flex: 1, background: 'var(--surface-base)' }}
            />
            <Button
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                message.success('已复制到剪贴板');
              }}
            >
              复制
            </Button>
          </div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
            此URL需要配置在微信公众号后台
          </Text>
        </Card>

        {!savedConfig && !isEditing ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ color: 'var(--text-tertiary)', marginBottom: 16 }}>尚未配置微信公众号</p>
            <Button type="primary" onClick={handleStartEditing}>开始配置</Button>
          </div>
        ) : !isEditing ? (
          <>
            <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
              <Descriptions.Item label="AppID">{savedConfig.app_id || '-'}</Descriptions.Item>
              <Descriptions.Item label="AppSecret">
                <SensitiveField
                  value={realConfig?.app_secret || savedConfig.app_secret}
                  isVerified={isVerified}
                  onRequestVerify={onRequestVerify}
                />
              </Descriptions.Item>
              <Descriptions.Item label="Token">
                <SensitiveField
                  value={realConfig?.token || savedConfig.token}
                  isVerified={isVerified}
                  onRequestVerify={onRequestVerify}
                />
              </Descriptions.Item>
              <Descriptions.Item label="EncodingAESKey">
                <SensitiveField
                  value={realConfig?.encoding_aes_key || savedConfig.encoding_aes_key}
                  isVerified={isVerified}
                  onRequestVerify={onRequestVerify}
                />
              </Descriptions.Item>
              <Descriptions.Item label="消息加密方式">
                {encryptionModeLabels[savedConfig.encryption_mode] || savedConfig.encryption_mode}
              </Descriptions.Item>
              <Descriptions.Item label="AI自动回复">
                {savedConfig.auto_reply_enabled ? (
                  <Tag color="success">已启用</Tag>
                ) : (
                  <Tag>未启用</Tag>
                )}
              </Descriptions.Item>
              {savedConfig.auto_reply_enabled && (
                <>
                  <Descriptions.Item label="AI模型等级">
                    {aiModelLabels[savedConfig.ai_model_level] || savedConfig.ai_model_level}
                  </Descriptions.Item>
                  <Descriptions.Item label="系统提示词" span={2}>
                    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {savedConfig.system_prompt || '使用默认提示词'}
                    </span>
                  </Descriptions.Item>
                </>
              )}
            </Descriptions>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Button type="primary" icon={<EditOutlined />} onClick={handleStartEditing}>
                修改配置
              </Button>
            </div>
          </>
        ) : (
          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item name="app_id" label="AppID" extra="从微信公众号后台获取">
              <Input placeholder="wx1234567890abcdef" />
            </Form.Item>

            <Form.Item
              name="app_secret"
              label="AppSecret"
              extra={savedConfig ? '留空表示不修改当前配置' : '从微信公众号后台获取，请妥善保管'}
            >
              <Input.Password placeholder={savedConfig ? '留空表示不修改' : '请输入AppSecret'} />
            </Form.Item>

            <Form.Item
              label="Token"
              extra={savedConfig ? '留空表示不修改当前配置' : '消息加密密钥，由开发者任意填写'}
            >
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="token" noStyle>
                  <Input
                    placeholder={savedConfig ? '留空表示不修改' : '必须为英文或数字，长度为3-32字符'}
                  />
                </Form.Item>
                <Button onClick={handleGenerateToken}>随机生成</Button>
              </Space.Compact>
            </Form.Item>

            <Form.Item
              label="EncodingAESKey"
              extra={savedConfig ? '留空表示不修改当前配置' : '消息体加解密密钥，由43位字符组成'}
            >
              <Space.Compact style={{ width: '100%' }}>
                <Form.Item name="encoding_aes_key" noStyle>
                  <Input
                    placeholder={savedConfig ? '留空表示不修改' : '消息加密密钥由43位字符组成'}
                  />
                </Form.Item>
                <Button onClick={handleGenerateEncodingAESKey}>随机生成</Button>
              </Space.Compact>
            </Form.Item>

            <Form.Item name="encryption_mode" label="消息加密方式">
              <Select
                options={[
                  { value: 'plaintext', label: '明文模式' },
                  { value: 'compatible', label: '兼容模式' },
                  { value: 'secure', label: '安全模式（加密）' },
                ]}
              />
            </Form.Item>

            <Card size="small" title="AI自动回复配置" style={{ marginBottom: 24 }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: 16, fontSize: 13 }}>
                配置AI模型自动回复用户消息
              </p>

              <Form.Item
                name="auto_reply_enabled"
                label="启用AI自动回复"
                valuePropName="checked"
                extra="开启后，用户发送文本消息时将自动调用AI生成回复"
              >
                <Switch />
              </Form.Item>

              {autoReplyEnabled && (
                <>
                  <Form.Item
                    name="ai_model_level"
                    label="AI模型等级"
                    extra={'选择用于自动回复的AI模型等级，需要在「第三方账号管理」中配置对应的AI模型'}
                  >
                    <Select
                      options={[
                        { value: 'low', label: 'Low - 低成本模型（适合简单对话）' },
                        { value: 'medium', label: 'Medium - 中等模型（平衡性能和成本）' },
                        { value: 'high', label: 'High - 高级模型（最佳回复质量）' },
                      ]}
                    />
                  </Form.Item>

                  <Form.Item
                    name="system_prompt"
                    label="系统提示词"
                    extra="配置AI回复用户消息时使用的系统提示词，留空将使用默认提示词"
                  >
                    <Input.TextArea
                      rows={4}
                      placeholder="你是一个友好的助手，请简洁准确地回答用户的问题。回复不要超过200字。"
                    />
                  </Form.Item>
                </>
              )}
            </Card>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={handleCancelEditing}>取消</Button>
              <Button type="primary" htmlType="submit" loading={saving}>
                保存配置
              </Button>
            </div>
          </Form>
        )}
      </Card>

      <Alert
        type="warning"
        showIcon
        message="配置步骤"
        description={
          <ol style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>登录微信公众平台，进入"开发" - "基本配置"</li>
            <li>填写上方的"服务器地址(URL)"</li>
            <li>填写Token和EncodingAESKey（可使用"随机生成"按钮）</li>
            <li>选择消息加密方式</li>
            <li>点击"保存配置"按钮保存设置</li>
            <li>在微信公众平台点击"提交"进行服务器验证</li>
            <li>启用"AI自动回复"功能，选择合适的AI模型等级</li>
          </ol>
        }
      />
    </Space>
  );
};

// ==================== Main WeChatSettings Component ====================

const WeChatSettings = ({ isVerified, onRequestVerify }) => {
  const [subTab, setSubTab] = useState('oauth');

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Segmented
        value={subTab}
        onChange={setSubTab}
        options={[
          { value: 'oauth', label: '扫码登录' },
          { value: 'official', label: '公众号' },
        ]}
      />

      {subTab === 'oauth' && (
        <WeChatOAuth isVerified={isVerified} onRequestVerify={onRequestVerify} />
      )}
      {subTab === 'official' && (
        <WeChatOfficial isVerified={isVerified} onRequestVerify={onRequestVerify} />
      )}
    </Space>
  );
};

export default WeChatSettings;
