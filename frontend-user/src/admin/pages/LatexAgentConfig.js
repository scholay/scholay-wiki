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
import { adminAPI } from '../services/api';
import './LatexAgentConfig.css';

const LatexAgentConfig = () => {
  const [config, setConfig] = useState(null);
  const [models, setModels] = useState([]);
  const [modelPresets, setModelPresets] = useState([]);
  const [apiFormats, setApiFormats] = useState([]);
  const [configOptions, setConfigOptions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState(null);

  // 模型表单数据
  const [modelForm, setModelForm] = useState({
    display_name: '',
    api_format: 'openai',
    model_name: '',
    api_endpoint: 'https://api.openai.com/v1',
    api_key: '',
    max_context_tokens: 128000,
    max_output_tokens: 16384,
    temperature: 0.7,
    description: '',
    sort_order: 0,
    is_default: false,
    is_enabled: true,
  });

  // 全局配置表单
  const [formData, setFormData] = useState({
    default_model_id: null,
    context_window_messages: 50,
    truncation_strategy: 'sliding_window',
    top_p: 0.9,
    frequency_penalty: 0.0,
    presence_penalty: 0.0,
    max_iterations: 10,
    auto_validate_latex: true,
    auto_fix_errors: true,
    enable_tool_calling: true,
    enabled_tool_categories: ['latex', 'search', 'bibtex', 'file', 'convert'],
    system_prompt_override: '',
    system_prompt_append: '',
    is_active: true,
  });

  // 加载配置
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
        setFormData({
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
      alert('加载配置失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 处理表单变化
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // 处理数字输入
  const handleNumberChange = (name, value) => {
    setFormData(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0,
    }));
  };

  // 处理工具分类选择
  const handleToolCategoryChange = (category) => {
    setFormData(prev => {
      const categories = [...prev.enabled_tool_categories];
      const index = categories.indexOf(category);
      if (index > -1) {
        categories.splice(index, 1);
      } else {
        categories.push(category);
      }
      return { ...prev, enabled_tool_categories: categories };
    });
  };

  // 应用模型预设
  const handleApplyPreset = async (preset) => {
    try {
      const response = await adminAPI.applyLatexAgentModelPreset(preset.provider, preset.name);
      if (response.data?.code === 0 && response.data?.data) {
        const presetData = response.data.data;
        setModelForm(prev => ({
          ...prev,
          display_name: presetData.display_name || '',
          api_format: presetData.api_format || 'openai',
          model_name: presetData.model_name || '',
          api_endpoint: presetData.default_endpoint || 'https://api.openai.com/v1',
          max_context_tokens: presetData.max_context_tokens || 128000,
          max_output_tokens: presetData.max_output_tokens || 16384,
          description: presetData.description || '',
        }));
        setShowModelForm(true);
        setEditingModel(null);
      } else {
        alert('应用失败: ' + response.data?.message);
      }
    } catch (error) {
      alert('应用失败: ' + (error.response?.data?.message || error.message));
    }
  };

  // 保存全局配置
  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const response = await adminAPI.updateLatexAgentConfig(formData);
      if (response.data?.code === 0) {
        alert('配置保存成功');
        loadData();
      } else {
        alert('保存失败: ' + response.data?.message);
      }
    } catch (error) {
      alert('保存失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  // 模型表单变化
  const handleModelFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setModelForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // API 格式变化时更新默认端点
  const handleApiFormatChange = (format) => {
    const formatInfo = apiFormats.find(f => f.value === format);
    setModelForm(prev => ({
      ...prev,
      api_format: format,
      api_endpoint: formatInfo?.default_endpoint || prev.api_endpoint,
    }));
  };

  // 创建/更新模型
  const handleSaveModel = async () => {
    if (!modelForm.display_name || !modelForm.model_name || !modelForm.api_key) {
      alert('请填写必填字段：显示名称、模型名、API 密钥');
      return;
    }

    setSaving(true);
    try {
      let response;
      if (editingModel) {
        response = await adminAPI.updateLatexAgentModel(editingModel.id, modelForm);
      } else {
        response = await adminAPI.createLatexAgentModel(modelForm);
      }

      if (response.data?.code === 0) {
        alert(editingModel ? '模型更新成功' : '模型创建成功');
        setShowModelForm(false);
        setEditingModel(null);
        resetModelForm();
        loadData();
      } else {
        alert('保存失败: ' + response.data?.message);
      }
    } catch (error) {
      alert('保存失败: ' + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  // 编辑模型
  const handleEditModel = (model) => {
    setModelForm({
      display_name: model.display_name,
      api_format: model.api_format,
      model_name: model.model_name,
      api_endpoint: model.api_endpoint,
      api_key: '', // 密钥不回显
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

  // 删除模型
  const handleDeleteModel = async (model) => {
    if (!window.confirm(`确定要删除模型 "${model.display_name}" 吗？`)) {
      return;
    }

    try {
      const response = await adminAPI.deleteLatexAgentModel(model.id);
      if (response.data?.code === 0) {
        alert('模型已删除');
        loadData();
      } else {
        alert('删除失败: ' + response.data?.message);
      }
    } catch (error) {
      alert('删除失败: ' + (error.response?.data?.message || error.message));
    }
  };

  // 设为默认模型
  const handleSetDefault = async (model) => {
    try {
      const response = await adminAPI.setDefaultLatexAgentModel(model.id);
      if (response.data?.code === 0) {
        alert('已设为默认模型');
        loadData();
      } else {
        alert('设置失败: ' + response.data?.message);
      }
    } catch (error) {
      alert('设置失败: ' + (error.response?.data?.message || error.message));
    }
  };

  // 重置模型表单
  const resetModelForm = () => {
    setModelForm({
      display_name: '',
      api_format: 'openai',
      model_name: '',
      api_endpoint: 'https://api.openai.com/v1',
      api_key: '',
      max_context_tokens: 128000,
      max_output_tokens: 16384,
      temperature: 0.7,
      description: '',
      sort_order: 0,
      is_default: false,
      is_enabled: true,
    });
  };

  if (loading) {
    return (
      <div className="latex-agent-config">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="latex-agent-config">
      <div className="page-header">
        <h1>LaTeX Agent 配置</h1>
        <p>配置 AI 论文写作助手的模型参数、上下文限制、工具启用等</p>
      </div>

      {/* 模型管理区 */}
      <div className="config-section">
        <div className="section-header">
          <h2>模型管理</h2>
          <button
            className="btn btn-primary"
            onClick={() => {
              resetModelForm();
              setEditingModel(null);
              setShowModelForm(true);
            }}
          >
            + 添加模型
          </button>
        </div>

        <div className="preset-buttons">
          <span className="label">快速添加预设：</span>
          {modelPresets.slice(0, 5).map(preset => (
            <button
              key={`${preset.provider}-${preset.name}`}
              className="preset-btn"
              onClick={() => handleApplyPreset(preset)}
              title={preset.description}
            >
              {preset.display_name}
            </button>
          ))}
        </div>

        {/* 模型列表 */}
        <div className="model-list">
          {models.length === 0 ? (
            <div className="no-models">
              暂无模型配置，请添加模型
            </div>
          ) : (
            models.map(model => (
              <div key={model.id} className={`model-card ${model.is_default ? 'default' : ''} ${!model.is_enabled ? 'disabled' : ''}`}>
                <div className="model-info">
                  <div className="model-name">
                    {model.display_name}
                    {model.is_default && <span className="badge default">默认</span>}
                    {!model.is_enabled && <span className="badge disabled">已禁用</span>}
                    {!model.has_api_key && <span className="badge warning">无密钥</span>}
                  </div>
                  <div className="model-details">
                    <span className="detail-item">格式: {model.api_format}</span>
                    <span className="detail-item">模型: {model.model_name}</span>
                    <span className="detail-item">上下文: {(model.max_context_tokens / 1000).toFixed(0)}K</span>
                  </div>
                  <div className="model-endpoint">{model.api_endpoint}</div>
                </div>
                <div className="model-actions">
                  {!model.is_default && model.is_enabled && (
                    <button className="btn btn-sm" onClick={() => handleSetDefault(model)}>
                      设为默认
                    </button>
                  )}
                  <button className="btn btn-sm" onClick={() => handleEditModel(model)}>
                    编辑
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteModel(model)}>
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 模型表单弹窗 */}
        {showModelForm && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h3>{editingModel ? '编辑模型' : '添加模型'}</h3>
              </div>
              <div className="modal-body">

              <div className="form-row">
                <div className="form-group">
                  <label>显示名称 *</label>
                  <input
                    type="text"
                    name="display_name"
                    value={modelForm.display_name}
                    onChange={handleModelFormChange}
                    placeholder="如：GPT-4o 高级版"
                  />
                </div>
                <div className="form-group">
                  <label>模型名称 *</label>
                  <input
                    type="text"
                    name="model_name"
                    value={modelForm.model_name}
                    onChange={handleModelFormChange}
                    placeholder="如：gpt-4o"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>API 格式</label>
                  <select
                    name="api_format"
                    value={modelForm.api_format}
                    onChange={(e) => handleApiFormatChange(e.target.value)}
                  >
                    {apiFormats.map(format => (
                      <option key={format.value} value={format.value}>
                        {format.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>API 端点 *</label>
                  <input
                    type="text"
                    name="api_endpoint"
                    value={modelForm.api_endpoint}
                    onChange={handleModelFormChange}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>API 密钥 *{editingModel && ' (留空则不更新)'}</label>
                <input
                  type="password"
                  name="api_key"
                  value={modelForm.api_key}
                  onChange={handleModelFormChange}
                  placeholder={editingModel ? '留空则保持原密钥' : 'sk-xxx...'}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>最大上下文 Token</label>
                  <input
                    type="number"
                    name="max_context_tokens"
                    value={modelForm.max_context_tokens}
                    onChange={handleModelFormChange}
                  />
                </div>
                <div className="form-group">
                  <label>最大输出 Token</label>
                  <input
                    type="number"
                    name="max_output_tokens"
                    value={modelForm.max_output_tokens}
                    onChange={handleModelFormChange}
                  />
                </div>
                <div className="form-group">
                  <label>Temperature</label>
                  <input
                    type="number"
                    name="temperature"
                    value={modelForm.temperature}
                    onChange={handleModelFormChange}
                    min="0"
                    max="2"
                    step="0.1"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>描述（可选）</label>
                <input
                  type="text"
                  name="description"
                  value={modelForm.description}
                  onChange={handleModelFormChange}
                  placeholder="模型描述..."
                />
              </div>

              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="is_enabled"
                    checked={modelForm.is_enabled}
                    onChange={handleModelFormChange}
                  />
                  <span>启用此模型</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="is_default"
                    checked={modelForm.is_default}
                    onChange={handleModelFormChange}
                  />
                  <span>设为默认模型</span>
                </label>
              </div>
              </div>

              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowModelForm(false);
                    setEditingModel(null);
                  }}
                >
                  取消
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveModel}
                  disabled={saving}
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 上下文配置区 */}
      <div className="config-section">
        <h2>上下文配置</h2>
        <p className="section-desc">配置模型的上下文窗口和历史消息处理策略</p>
        
        <div className="form-row">
          <div className="form-group">
            <label>历史消息保留数量</label>
            <input
              type="number"
              value={formData.context_window_messages}
              onChange={(e) => handleNumberChange('context_window_messages', e.target.value)}
              min="5"
              max="200"
            />
            <span className="hint">保留最近的 N 条对话消息作为上下文</span>
          </div>
          <div className="form-group">
            <label>截断策略</label>
            <select
              name="truncation_strategy"
              value={formData.truncation_strategy}
              onChange={handleChange}
            >
              {configOptions.truncation_strategies?.map(strategy => (
                <option key={strategy.value} value={strategy.value}>
                  {strategy.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 生成参数区 */}
      <div className="config-section">
        <h2>生成参数（全局默认）</h2>
        <p className="section-desc">这些参数会应用到所有模型（除非模型单独配置）</p>

        <div className="form-row">
          <div className="form-group slider-group">
            <label>Top P: {formData.top_p}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={formData.top_p}
              onChange={(e) => handleNumberChange('top_p', e.target.value)}
            />
          </div>
          <div className="form-group slider-group">
            <label>Frequency Penalty: {formData.frequency_penalty}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={formData.frequency_penalty}
              onChange={(e) => handleNumberChange('frequency_penalty', e.target.value)}
            />
          </div>
          <div className="form-group slider-group">
            <label>Presence Penalty: {formData.presence_penalty}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={formData.presence_penalty}
              onChange={(e) => handleNumberChange('presence_penalty', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Agent 行为配置区 */}
      <div className="config-section">
        <h2>Agent 行为配置</h2>

        <div className="form-row">
          <div className="form-group">
            <label>最大迭代次数</label>
            <input
              type="number"
              value={formData.max_iterations}
              onChange={(e) => handleNumberChange('max_iterations', e.target.value)}
              min="1"
              max="20"
            />
            <span className="hint">Agent 推理循环的最大次数</span>
          </div>
        </div>

        <div className="checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="auto_validate_latex"
              checked={formData.auto_validate_latex}
              onChange={handleChange}
            />
            <span>自动验证 LaTeX 语法</span>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="auto_fix_errors"
              checked={formData.auto_fix_errors}
              onChange={handleChange}
            />
            <span>自动修复语法错误</span>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="enable_tool_calling"
              checked={formData.enable_tool_calling}
              onChange={handleChange}
            />
            <span>启用工具调用（Function Calling）</span>
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="is_active"
              checked={formData.is_active}
              onChange={handleChange}
            />
            <span>启用 LaTeX Agent</span>
          </label>
        </div>

        <div className="form-group">
          <label>启用的工具分类</label>
          <div className="tool-categories">
            {configOptions.tool_categories?.map(cat => (
              <label key={cat.value} className="checkbox-label tool-category">
                <input
                  type="checkbox"
                  checked={formData.enabled_tool_categories.includes(cat.value)}
                  onChange={() => handleToolCategoryChange(cat.value)}
                />
                <span>{cat.label}</span>
                <small>{cat.description}</small>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* 系统提示词配置区 */}
      <div className="config-section">
        <h2>系统提示词配置</h2>
        <p className="section-desc">自定义 Agent 的行为指令（高级选项）</p>

        <div className="form-group">
          <label>覆盖系统提示词（留空使用默认）</label>
          <textarea
            name="system_prompt_override"
            value={formData.system_prompt_override}
            onChange={handleChange}
            rows={6}
            placeholder="输入完整的系统提示词来替换默认提示词..."
          />
        </div>

        <div className="form-group">
          <label>追加系统提示词</label>
          <textarea
            name="system_prompt_append"
            value={formData.system_prompt_append}
            onChange={handleChange}
            rows={4}
            placeholder="输入要追加到默认系统提示词后面的内容..."
          />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="action-buttons">
        <button
          className="btn btn-primary"
          onClick={handleSaveConfig}
          disabled={saving}
        >
          {saving ? '保存中...' : '保存全局配置'}
        </button>
      </div>

      {/* 配置信息 */}
      {config && (
        <div className="config-info">
          <small>
            上次更新: {new Date(config.updated_at).toLocaleString()}
            {config.updated_by && ` | 更新者 ID: ${config.updated_by}`}
          </small>
        </div>
      )}
    </div>
  );
};

export default LatexAgentConfig;
