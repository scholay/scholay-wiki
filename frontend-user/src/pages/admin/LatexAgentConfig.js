/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * LaTeX Agent 配置页面
 * 管理 AI 论文写作助手的模型配置、上下文参数、工具启用等
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  App, Modal, Card, Button, Space, Form, Input, InputNumber, Select,
  Slider, Row, Col, Tag, Empty, Spin, Checkbox, Typography,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, StarOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { adminAPI } from '../../services/adminApi';

const { Text, Paragraph } = Typography;

const LatexAgentConfig = () => {
  const { message } = App.useApp();
  const [config, setConfig] = useState(null);
  const [models, setModels] = useState([]);
  const [modelPresets, setModelPresets] = useState([]);
  const [apiFormats, setApiFormats] = useState([]);
  const [configOptions, setConfigOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState(null);

  const [modelForm] = Form.useForm();
  const [configForm] = Form.useForm();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRes, modelsRes, presetsRes, formatsRes, optionsRes] = await Promise.all([
        adminAPI.getLatexAgentConfig(),
        adminAPI.getLatexAgentModels(),
        adminAPI.getLatexAgentModelPresets(),
        adminAPI.getLatexAgentApiFormats(),
        adminAPI.getLatexAgentConfigOptions(),
      ]);

      if (configRes.data?.code === 0 && configRes.data?.data) {
        const data = configRes.data.data;
        setConfig(data);
        configForm.setFieldsValue({
          default_model_id: data.default_model_id || null,
          context_window_messages: data.context_window_messages || 50,
          truncation_strategy: data.truncation_strategy || 'sliding_window',
          top_p: data.top_p || 0.9,
          frequency_penalty: data.frequency_penalty || 0.0,
          presence_penalty: data.presence_penalty || 0.0,
          max_iterations: data.max_iterations || 10,
          auto_validate_latex: data.auto_validate_latex !== false,
          auto_fix_errors: data.auto_fix_errors !== false,
          enable_tool_calling: data.enable_tool_calling !== false,
          enabled_tool_categories: data.enabled_tool_categories || ['latex', 'search', 'bibtex'],
          system_prompt_override: data.system_prompt_override || '',
          system_prompt_append: data.system_prompt_append || '',
          is_active: data.is_active !== false,
        });
      }

      if (modelsRes.data?.code === 0 && modelsRes.data?.data?.models) {
        setModels(modelsRes.data.data.models);
      }
      if (presetsRes.data?.code === 0 && presetsRes.data?.data?.presets) {
        setModelPresets(presetsRes.data.data.presets);
      }
      if (formatsRes.data?.code === 0 && formatsRes.data?.data?.formats) {
        setApiFormats(formatsRes.data.data.formats);
      }
      if (optionsRes.data?.code === 0 && optionsRes.data?.data) {
        setConfigOptions(optionsRes.data.data);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      message.error('加载配置失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  }, [configForm, message]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApplyPreset = async (preset) => {
    try {
      const response = await adminAPI.applyLatexAgentModelPreset(preset.provider, preset.name);
      if (response.data?.code === 0 && response.data?.data) {
        const presetData = response.data.data;
        modelForm.setFieldsValue({
          display_name: presetData.display_name || '',
          api_format: presetData.api_format || 'openai',
          model_name: presetData.model_name || '',
          api_endpoint: presetData.default_endpoint || 'https://api.openai.com/v1',
          max_context_tokens: presetData.max_context_tokens || 128000,
          max_output_tokens: presetData.max_output_tokens || 16384,
          description: presetData.description || '',
          api_key: '',
          temperature: 0.7,
          sort_order: 0,
          is_default: false,
          is_enabled: true,
        });
        setEditingModel(null);
        setShowModelForm(true);
      } else {
        message.error('应用失败: ' + response.data?.message);
      }
    } catch (error) {
      message.error('应用失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const values = await configForm.validateFields();
      const response = await adminAPI.updateLatexAgentConfig(values);
      if (response.data?.code === 0) {
        message.success('配置保存成功');
        loadData();
      } else {
        message.error('保存失败: ' + response.data?.message);
      }
    } catch (error) {
      if (error.errorFields) { setSaving(false); return; }
      message.error('保存失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleApiFormatChange = (format) => {
    const formatInfo = apiFormats.find(f => f.value === format);
    if (formatInfo?.default_endpoint) {
      modelForm.setFieldsValue({ api_endpoint: formatInfo.default_endpoint });
    }
  };

  const handleSaveModel = async () => {
    try {
      const values = await modelForm.validateFields();
      setSaving(true);
      let response;
      if (editingModel) {
        response = await adminAPI.updateLatexAgentModel(editingModel.id, values);
      } else {
        response = await adminAPI.createLatexAgentModel(values);
      }

      if (response.data?.code === 0) {
        message.success(editingModel ? '模型更新成功' : '模型创建成功');
        setShowModelForm(false);
        setEditingModel(null);
        modelForm.resetFields();
        loadData();
      } else {
        message.error('保存失败: ' + response.data?.message);
      }
    } catch (error) {
      if (error.errorFields) return;
      message.error('保存失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleEditModel = (model) => {
    modelForm.setFieldsValue({
      display_name: model.display_name,
      api_format: model.api_format,
      model_name: model.model_name,
      api_endpoint: model.api_endpoint,
      api_key: '',
      max_context_tokens: model.max_context_tokens,
      max_output_tokens: model.max_output_tokens,
      temperature: model.temperature,
      description: model.description || '',
      sort_order: model.sort_order,
      is_default: model.is_default,
      is_enabled: model.is_enabled,
    });
    setEditingModel(model);
    setShowModelForm(true);
  };

  const handleDeleteModel = (model) => {
    Modal.confirm({
      title: '确认',
      content: `确定要删除模型 "${model.display_name}" 吗？`,
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await adminAPI.deleteLatexAgentModel(model.id);
          if (response.data?.code === 0) {
            message.success('模型已删除');
            loadData();
          } else {
            message.error('删除失败: ' + response.data?.message);
          }
        } catch (error) {
          message.error('删除失败: ' + (error.response?.data?.message || error.message));
        }
      },
    });
  };

  const handleSetDefault = async (model) => {
    try {
      const response = await adminAPI.setDefaultLatexAgentModel(model.id);
      if (response.data?.code === 0) {
        message.success('已设为默认模型');
        loadData();
      } else {
        message.error('设置失败: ' + response.data?.message);
      }
    } catch (error) {
      message.error('设置失败: ' + (error.response?.data?.message || error.message));
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>LaTeX Agent 配置</h1>
        <Text type="secondary">配置 AI 论文写作助手的模型参数、上下文限制、工具启用等</Text>
      </div>

      {/* 模型管理 */}
      <Card
        title="模型管理"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            modelForm.resetFields();
            modelForm.setFieldsValue({
              api_format: 'openai',
              api_endpoint: 'https://api.openai.com/v1',
              max_context_tokens: 128000,
              max_output_tokens: 16384,
              temperature: 0.7,
              sort_order: 0,
              is_default: false,
              is_enabled: true,
            });
            setEditingModel(null);
            setShowModelForm(true);
          }}>
            添加模型
          </Button>
        }
        style={{ marginBottom: 16 }}
      >
        <Space wrap style={{ marginBottom: 16 }}>
          <Text type="secondary">快速添加预设：</Text>
          {modelPresets.slice(0, 5).map(preset => (
            <Button
              key={`${preset.provider}-${preset.name}`}
              size="small"
              onClick={() => handleApplyPreset(preset)}
              title={preset.description}
            >
              {preset.display_name}
            </Button>
          ))}
        </Space>

        {models.length === 0 ? (
          <Empty description="暂无模型配置，请添加模型" />
        ) : (
          <Row gutter={[16, 16]}>
            {models.map(model => (
              <Col span={24} key={model.id}>
                <Card
                  size="small"
                  style={{
                    borderLeft: model.is_default ? '3px solid #1677ff' : undefined,
                    opacity: model.is_enabled ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <Space>
                        <Text strong>{model.display_name}</Text>
                        {model.is_default && <Tag color="blue">默认</Tag>}
                        {!model.is_enabled && <Tag>已禁用</Tag>}
                        {!model.has_api_key && <Tag color="warning">无密钥</Tag>}
                      </Space>
                      <div style={{ marginTop: 4 }}>
                        <Space size="large">
                          <Text type="secondary" style={{ fontSize: 12 }}>格式: {model.api_format}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>模型: {model.model_name}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>上下文: {(model.max_context_tokens / 1000).toFixed(0)}K</Text>
                        </Space>
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{model.api_endpoint}</Text>
                    </div>
                    <Space>
                      {!model.is_default && model.is_enabled && (
                        <Button size="small" icon={<StarOutlined />} onClick={() => handleSetDefault(model)}>设为默认</Button>
                      )}
                      <Button size="small" icon={<EditOutlined />} onClick={() => handleEditModel(model)}>编辑</Button>
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteModel(model)}>删除</Button>
                    </Space>
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Form form={configForm} layout="vertical">
        {/* 上下文配置 */}
        <Card title="上下文配置" style={{ marginBottom: 16 }}>
          <Paragraph type="secondary">配置模型的上下文窗口和历史消息处理策略</Paragraph>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="context_window_messages" label="历史消息保留数量" extra="保留最近的 N 条对话消息作为上下文">
                <InputNumber min={5} max={200} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="truncation_strategy" label="截断策略">
                <Select options={configOptions.truncation_strategies?.map(s => ({ value: s.value, label: s.label })) || []} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* 生成参数 */}
        <Card title="生成参数（全局默认）" style={{ marginBottom: 16 }}>
          <Paragraph type="secondary">这些参数会应用到所有模型（除非模型单独配置）</Paragraph>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="top_p" label="Top P">
                <Slider min={0} max={1} step={0.05} marks={{ 0: '0', 0.5: '0.5', 1: '1' }} tooltip={{ formatter: v => v }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="frequency_penalty" label="Frequency Penalty">
                <Slider min={0} max={2} step={0.1} marks={{ 0: '0', 1: '1', 2: '2' }} tooltip={{ formatter: v => v }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="presence_penalty" label="Presence Penalty">
                <Slider min={0} max={2} step={0.1} marks={{ 0: '0', 1: '1', 2: '2' }} tooltip={{ formatter: v => v }} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* Agent 行为配置 */}
        <Card title="Agent 行为配置" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="max_iterations" label="最大迭代次数" extra="Agent 推理循环的最大次数">
                <InputNumber min={1} max={20} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Space direction="vertical" style={{ width: '100%' }}>
            <Form.Item name="auto_validate_latex" valuePropName="checked" noStyle>
              <Checkbox>自动验证 LaTeX 语法</Checkbox>
            </Form.Item>
            <Form.Item name="auto_fix_errors" valuePropName="checked" noStyle>
              <Checkbox>自动修复语法错误</Checkbox>
            </Form.Item>
            <Form.Item name="enable_tool_calling" valuePropName="checked" noStyle>
              <Checkbox>启用工具调用（Function Calling）</Checkbox>
            </Form.Item>
            <Form.Item name="is_active" valuePropName="checked" noStyle>
              <Checkbox>启用 LaTeX Agent</Checkbox>
            </Form.Item>
          </Space>

          <Form.Item name="enabled_tool_categories" label="启用的工具分类" style={{ marginTop: 16 }}>
            <Checkbox.Group>
              <Row gutter={[16, 8]}>
                {configOptions.tool_categories?.map(cat => (
                  <Col span={8} key={cat.value}>
                    <Checkbox value={cat.value}>
                      {cat.label}
                      <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{cat.description}</Text>
                    </Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>
        </Card>

        {/* 系统提示词 */}
        <Card title="系统提示词配置" style={{ marginBottom: 16 }}>
          <Paragraph type="secondary">自定义 Agent 的行为指令（高级选项）</Paragraph>
          <Form.Item name="system_prompt_override" label="覆盖系统提示词（留空使用默认）">
            <Input.TextArea rows={6} placeholder="输入完整的系统提示词来替换默认提示词..." />
          </Form.Item>
          <Form.Item name="system_prompt_append" label="追加系统提示词">
            <Input.TextArea rows={4} placeholder="输入要追加到默认系统提示词后面的内容..." />
          </Form.Item>
        </Card>
      </Form>

      <div style={{ textAlign: 'right', marginBottom: 16 }}>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveConfig} loading={saving} size="large">
          保存全局配置
        </Button>
      </div>

      {config && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          上次更新: {new Date(config.updated_at).toLocaleString()}
          {config.updated_by && ` | 更新者 ID: ${config.updated_by}`}
        </Text>
      )}

      {/* 模型表单弹窗 */}
      <Modal
        title={editingModel ? '编辑模型' : '添加模型'}
        open={showModelForm}
        onCancel={() => { setShowModelForm(false); setEditingModel(null); }}
        onOk={handleSaveModel}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        width={700}
        destroyOnClose
      >
        <Form form={modelForm} layout="vertical" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 8 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="display_name" label="显示名称" rules={[{ required: true, message: '请输入显示名称' }]}>
                <Input placeholder="如：GPT-4o 高级版" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="model_name" label="模型名称" rules={[{ required: true, message: '请输入模型名称' }]}>
                <Input placeholder="如：gpt-4o" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="api_format" label="API 格式">
                <Select
                  onChange={handleApiFormatChange}
                  options={apiFormats.map(f => ({ value: f.value, label: f.label }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="api_endpoint" label="API 端点" rules={[{ required: true, message: '请输入API端点' }]}>
                <Input placeholder="https://api.openai.com/v1" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="api_key"
            label={`API 密钥${editingModel ? '（留空则不更新）' : ''}`}
            rules={editingModel ? [] : [{ required: true, message: '请输入API密钥' }]}
          >
            <Input.Password placeholder={editingModel ? '留空则保持原密钥' : 'sk-xxx...'} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="max_context_tokens" label="最大上下文 Token">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="max_output_tokens" label="最大输出 Token">
                <InputNumber style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="temperature" label="Temperature">
                <Slider min={0} max={2} step={0.1} tooltip={{ formatter: v => v }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="描述（可选）">
            <Input placeholder="模型描述..." />
          </Form.Item>

          <Space>
            <Form.Item name="is_enabled" valuePropName="checked" noStyle>
              <Checkbox>启用此模型</Checkbox>
            </Form.Item>
            <Form.Item name="is_default" valuePropName="checked" noStyle>
              <Checkbox>设为默认模型</Checkbox>
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default LatexAgentConfig;
