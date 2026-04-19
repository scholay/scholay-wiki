/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { adminAPI } from '../services/api';
import './PromptTemplates.css';

const PromptTemplates = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    key: '',
    template: '',
    description: '',
    is_active: true
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getPromptTemplates();
      if (response.data.code === 0 && response.data.data) {
        setTemplates(response.data.data.templates || []);
      }
    } catch (error) {
      console.error('Failed to load prompt templates:', error);
      alert('加载提示词模板失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      key: '',
      template: '',
      description: '',
      is_active: true
    });
    setShowModal(true);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      key: template.key,
      template: template.template,
      description: template.description || '',
      is_active: Boolean(template.is_active) // Convert 0/1 to false/true
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingTemplate) {
        // Update existing template
        const response = await adminAPI.updatePromptTemplate(editingTemplate.id, formData);
        if (response.data.code === 0) {
          alert('提示词模板更新成功');
          setShowModal(false);
          loadTemplates();
        } else {
          alert('更新失败: ' + response.data.message);
        }
      } else {
        // Create new template
        const response = await adminAPI.createPromptTemplate(formData);
        if (response.data.code === 0) {
          alert('提示词模板创建成功');
          setShowModal(false);
          loadTemplates();
        } else {
          alert('创建失败: ' + response.data.message);
        }
      }
    } catch (error) {
      console.error('Failed to save template:', error);
      alert('保存失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('确定要删除这个提示词模板吗？')) {
      return;
    }

    try {
      const response = await adminAPI.deletePromptTemplate(id);
      if (response.data.code === 0) {
        alert('删除成功');
        loadTemplates();
      } else {
        alert('删除失败: ' + response.data.message);
      }
    } catch (error) {
      console.error('Failed to delete template:', error);
      alert('删除失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleToggleActive = async (template) => {
    try {
      const response = await adminAPI.updatePromptTemplate(template.id, {
        name: template.name,
        template: template.template,
        description: template.description,
        is_active: !template.is_active
      });
      if (response.data.code === 0) {
        loadTemplates();
      } else {
        alert('更新失败: ' + response.data.message);
      }
    } catch (error) {
      console.error('Failed to toggle active:', error);
      alert('更新失败: ' + (error.response?.data?.message || error.message));
    }
  };

  return (
    <div className="prompt-templates-page">
      <div className="page-header">
        <h1>提示词模板管理</h1>
        <button className="btn-primary" onClick={handleCreate}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z"/>
          </svg>
          新建模板
        </button>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>加载中...</p>
        </div>
      ) : (
        <div className="templates-grid">
          {templates.map((template) => (
            <div key={template.id} className={`template-card ${!template.is_active ? 'inactive' : ''}`}>
              <div className="template-header">
                <div className="template-title">
                  <h3>{template.name}</h3>
                  <span className={`badge ${template.is_active ? 'badge-success' : 'badge-secondary'}`}>
                    {template.is_active ? '启用' : '停用'}
                  </span>
                </div>
                <div className="template-actions">
                  <button
                    className="btn-icon"
                    onClick={() => handleToggleActive(template)}
                    title={template.is_active ? '停用' : '启用'}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                      <path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/>
                    </svg>
                  </button>
                  <button className="btn-icon" onClick={() => handleEdit(template)}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/>
                    </svg>
                  </button>
                  <button className="btn-icon btn-danger" onClick={() => handleDelete(template.id)}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                      <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                    </svg>
                  </button>
                </div>
              </div>

              <div className="template-meta">
                <span className="meta-item">
                  <strong>Key:</strong> {template.key}
                </span>
              </div>

              {template.description && (
                <p className="template-description">{template.description}</p>
              )}

              <div className="template-preview">
                <strong>模板内容预览：</strong>
                <pre>{template.template.substring(0, 200)}...</pre>
              </div>

              <div className="template-footer">
                <small>创建时间: {new Date(template.created_at).toLocaleString('zh-CN')}</small>
                <small>更新时间: {new Date(template.updated_at).toLocaleString('zh-CN')}</small>
              </div>
            </div>
          ))}
        </div>
      )}

{showModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-xlarge">
            <div className="modal-header">
              <h2>{editingTemplate ? '编辑提示词模板' : '新建提示词模板'}</h2>
              <button className="btn-close" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-body">
              {/* 基本信息区域 */}
              <div className="form-section">
                <div className="section-header">
                  <h3>基本信息</h3>
                  <p>设置模板的基本属性和标识</p>
                </div>

                <div className="form-row">
                  <div className="form-group form-group-flex">
                    <label>模板名称 <span className="required">*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      placeholder="例如：论文分析总结提示词"
                    />
                  </div>

                  <div className="form-group form-group-flex">
                    <label>模板Key <span className="required">*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.key}
                      onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                      required
                      disabled={!!editingTemplate}
                      placeholder="例如：paper_analysis"
                    />
                    {editingTemplate && (
                      <small className="form-help">创建后不可修改</small>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>模板描述</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="简短描述这个模板的用途，例如：用于分析搜索到的学术论文并生成结构化综述"
                  />
                </div>

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    />
                    <span>启用此模板</span>
                  </label>
                  <small className="form-help">停用的模板不会在系统中生效</small>
                </div>
              </div>

              {/* 模板内容区域 */}
              <div className="form-section">
                <div className="section-header">
                  <h3>模板内容 <span className="required">*</span></h3>
                  <p>编写提示词模板，使用变量占位符实现动态内容</p>
                </div>

                {/* 变量快速插入工具 */}
                <div className="variable-toolbar">
                  <span className="toolbar-label">常用变量：</span>
                  <button
                    type="button"
                    className="btn-variable"
                    onClick={() => {
                      const textarea = document.querySelector('.template-textarea');
                      const cursorPos = textarea.selectionStart;
                      const textBefore = formData.template.substring(0, cursorPos);
                      const textAfter = formData.template.substring(cursorPos);
                      setFormData({ ...formData, template: textBefore + '{{query}}' + textAfter });
                    }}
                  >
                    <code>{'{{query}}'}</code>
                    <span>搜索关键词</span>
                  </button>
                  <button
                    type="button"
                    className="btn-variable"
                    onClick={() => {
                      const textarea = document.querySelector('.template-textarea');
                      const cursorPos = textarea.selectionStart;
                      const textBefore = formData.template.substring(0, cursorPos);
                      const textAfter = formData.template.substring(cursorPos);
                      setFormData({ ...formData, template: textBefore + '{{papers}}' + textAfter });
                    }}
                  >
                    <code>{'{{papers}}'}</code>
                    <span>论文列表</span>
                  </button>
                </div>

                <div className="form-group">
                  <textarea
                    className="form-control template-textarea"
                    value={formData.template}
                    onChange={(e) => setFormData({ ...formData, template: e.target.value })}
                    required
                    rows="18"
                    placeholder="输入提示词模板内容...&#10;&#10;例如：&#10;你是一位专业的学术研究助手。用户搜索了关键词：「{{query}}」&#10;&#10;## 论文列表&#10;{{papers}}&#10;&#10;请对这些论文进行深入分析..."
                  />
                  <div className="template-stats">
                    <span>字符数: {formData.template.length}</span>
                    <span>行数: {formData.template.split('\n').length}</span>
                    <span>变量: {(formData.template.match(/\{\{.*?\}\}/g) || []).length}</span>
                  </div>
                </div>

                {/* 预览区域 */}
                {formData.template && (
                  <div className="template-preview-box">
                    <div className="preview-header">
                      <strong>模板预览</strong>
                      <span className="preview-hint">变量会以高亮显示</span>
                    </div>
                    <div className="preview-content">
                      {formData.template.split(/(\{\{.*?\}\})/).map((part, index) => {
                        if (part.match(/\{\{.*?\}\}/)) {
                          return <span key={index} className="variable-highlight">{part}</span>;
                        }
                        return part;
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn-primary">
                  <Check size={16} className="icon-mr" />
                  {editingTemplate ? '保存修改' : '创建模板'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptTemplates;
