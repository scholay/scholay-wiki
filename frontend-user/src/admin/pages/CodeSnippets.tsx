/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * CodeSnippets - 代码片段管理（SEO/广告/统计等）
 * 用于管理注入到用户端前端的代码片段
 */

import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import { adminAPI } from '../services/api';
import './CodeSnippets.css';

interface CodeSnippet {
  id: number;
  name: string;
  code_key: string;
  category: string;
  position: string;
  code_content: string;
  description?: string;
  is_enabled: boolean;
  priority: number;
  pages?: string[] | null;
}

interface CodeSnippetForm {
  name: string;
  code_key: string;
  category: string;
  position: string;
  code_content: string;
  description: string;
  is_enabled: boolean;
  priority: number;
  pages: string[];
}

// 分类选项
const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'seo', label: 'SEO' },
  { value: 'analytics', label: '统计分析' },
  { value: 'ad', label: '广告' },
  { value: 'social', label: '社交' },
  { value: 'other', label: '其他' },
];

// 位置选项
const POSITIONS = [
  { value: 'head', label: 'Head (头部)', desc: '适合 meta 标签、CSS、统计代码' },
  { value: 'body_start', label: 'Body 开始', desc: '适合需要早期加载的脚本' },
  { value: 'body_end', label: 'Body 结束', desc: '适合延迟加载的脚本、广告代码' },
];

const CodeSnippets: React.FC = () => {
  const [snippets, setSnippets] = useState<CodeSnippet[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingSnippet, setEditingSnippet] = useState<CodeSnippet | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [formData, setFormData] = useState<CodeSnippetForm>({
    name: '',
    code_key: '',
    category: 'seo',
    position: 'head',
    code_content: '',
    description: '',
    is_enabled: true,
    priority: 100,
    pages: [],
  });
  const [pagesInput, setPagesInput] = useState<string>('');

  const loadSnippets = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getCodeSnippets(selectedCategory === 'all' ? '' : selectedCategory);
      if (response.data.code === 0 && response.data.data) {
        setSnippets(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to load code snippets:', error);
      alert('加载代码片段失败');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadSnippets();
  }, [loadSnippets]);

  const handleCreate = () => {
    setEditingSnippet(null);
    setFormData({
      name: '',
      code_key: '',
      category: 'seo',
      position: 'head',
      code_content: '',
      description: '',
      is_enabled: true,
      priority: 100,
      pages: [],
    });
    setPagesInput('');
    setShowModal(true);
  };

  const handleEdit = (snippet: CodeSnippet) => {
    setEditingSnippet(snippet);
    setFormData({
      name: snippet.name,
      code_key: snippet.code_key,
      category: snippet.category,
      position: snippet.position,
      code_content: snippet.code_content,
      description: snippet.description || '',
      is_enabled: snippet.is_enabled,
      priority: snippet.priority,
      pages: snippet.pages || [],
    });
    setPagesInput((snippet.pages || []).join('\n'));
    setShowModal(true);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // 处理页面路径
    const pages = pagesInput
      .split('\n')
      .map(p => p.trim())
      .filter(p => p);

    const submitData: Omit<CodeSnippetForm, 'pages'> & { pages: string[] | null } = {
      ...formData,
      pages: pages.length > 0 ? pages : null,
    };

    try {
      if (editingSnippet) {
        const response = await adminAPI.updateCodeSnippet(editingSnippet.id, submitData);
        if (response.data.code === 0) {
          alert('代码片段更新成功');
          setShowModal(false);
          loadSnippets();
        } else {
          alert('更新失败: ' + response.data.message);
        }
      } else {
        const response = await adminAPI.createCodeSnippet(submitData);
        if (response.data.code === 0) {
          alert('代码片段创建成功');
          setShowModal(false);
          loadSnippets();
        } else {
          alert('创建失败: ' + response.data.message);
        }
      }
    } catch (error: any) { // [any#1] axios error
      console.error('Failed to save snippet:', error);
      alert('保存失败: ' + (error?.response?.data?.message || error?.message));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定要删除这个代码片段吗？')) {
      return;
    }

    try {
      const response = await adminAPI.deleteCodeSnippet(id);
      if (response.data.code === 0) {
        alert('删除成功');
        loadSnippets();
      } else {
        alert('删除失败: ' + response.data.message);
      }
    } catch (error: any) { // [any#2] axios error
      console.error('Failed to delete snippet:', error);
      alert('删除失败: ' + (error?.response?.data?.message || error?.message));
    }
  };

  const handleToggleEnabled = async (snippet: CodeSnippet) => {
    try {
      const response = await adminAPI.updateCodeSnippet(snippet.id, {
        is_enabled: !snippet.is_enabled,
      });
      if (response.data.code === 0) {
        loadSnippets();
      } else {
        alert('更新失败: ' + response.data.message);
      }
    } catch (error: any) { // [any#3] axios error
      console.error('Failed to toggle enabled:', error);
      alert('更新失败: ' + (error?.response?.data?.message || error?.message));
    }
  };

  const getCategoryLabel = (category: string) => {
    const item = CATEGORIES.find(c => c.value === category);
    return item ? item.label : category;
  };

  const getPositionLabel = (position: string) => {
    const item = POSITIONS.find(p => p.value === position);
    return item ? item.label : position;
  };

  const getCategoryClass = (category: string) => {
    const classes: Record<string, string> = {
      seo: 'badge-seo',
      analytics: 'badge-analytics',
      ad: 'badge-ad',
      social: 'badge-social',
      other: 'badge-other',
    };
    return classes[category] || 'badge-other';
  };

  return (
    <div className="code-snippets-page">
      <div className="page-header">
        <div className="header-left">
          <h1>代码片段管理</h1>
          <p className="header-desc">管理注入到用户端前端的 SEO、统计、广告等代码</p>
        </div>
        <button className="btn-primary" onClick={handleCreate}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M8 2a.5.5 0 01.5.5v5h5a.5.5 0 010 1h-5v5a.5.5 0 01-1 0v-5h-5a.5.5 0 010-1h5v-5A.5.5 0 018 2z"/>
          </svg>
          新建代码片段
        </button>
      </div>

      {/* 分类筛选 */}
      <div className="filter-bar">
        <div className="filter-tabs">
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              className={`filter-tab ${selectedCategory === cat.value ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat.value)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
      <div className="snippets-list">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>加载中...</p>
          </div>
        ) : snippets.length === 0 ? (
          <div className="empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <p>暂无代码片段</p>
            <button className="btn-primary" onClick={handleCreate}>创建第一个代码片段</button>
          </div>
        ) : (
          <div className="snippets-table">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>标识键</th>
                  <th>分类</th>
                  <th>位置</th>
                  <th>优先级</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {snippets.map(snippet => (
                  <tr key={snippet.id} className={!snippet.is_enabled ? 'disabled' : ''}>
                    <td>
                      <div className="snippet-name">
                        <span className="name">{snippet.name}</span>
                        {snippet.description && (
                          <span className="desc">{snippet.description}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <code className="code-key">{snippet.code_key}</code>
                    </td>
                    <td>
                      <span className={`badge ${getCategoryClass(snippet.category)}`}>
                        {getCategoryLabel(snippet.category)}
                      </span>
                    </td>
                    <td>
                      <span className="position-label">{getPositionLabel(snippet.position)}</span>
                    </td>
                    <td>
                      <span className="priority">{snippet.priority}</span>
                    </td>
                    <td>
                      <button
                        className={`toggle-btn ${snippet.is_enabled ? 'enabled' : 'disabled'}`}
                        onClick={() => handleToggleEnabled(snippet)}
                        title={snippet.is_enabled ? '点击禁用' : '点击启用'}
                      >
                        {snippet.is_enabled ? '已启用' : '已禁用'}
                      </button>
                    </td>
                    <td>
                      <div className="actions">
                        <button className="btn-icon" onClick={() => handleEdit(snippet)} title="编辑">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button className="btn-icon btn-danger" onClick={() => handleDelete(snippet.id)} title="删除">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 编辑/创建弹窗 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingSnippet ? '编辑代码片段' : '新建代码片段'}</h2>
              <button className="btn-close" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label>名称 <span className="required">*</span></label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="如：Google Analytics、百度统计"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>标识键 <span className="required">*</span></label>
                    <input
                      type="text"
                      value={formData.code_key}
                      onChange={e => setFormData({ ...formData, code_key: e.target.value })}
                      placeholder="如：google_analytics"
                      required
                      disabled={!!editingSnippet}
                    />
                    <span className="form-hint">唯一标识，创建后不可修改</span>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>分类 <span className="required">*</span></label>
                    <select
                      value={formData.category}
                      onChange={e => setFormData({ ...formData, category: e.target.value })}
                      required
                    >
                      {CATEGORIES.filter(c => c.value !== 'all').map(cat => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>注入位置 <span className="required">*</span></label>
                    <select
                      value={formData.position}
                      onChange={e => setFormData({ ...formData, position: e.target.value })}
                      required
                    >
                      {POSITIONS.map(pos => (
                        <option key={pos.value} value={pos.value}>{pos.label}</option>
                      ))}
                    </select>
                    <span className="form-hint">
                      {POSITIONS.find(p => p.value === formData.position)?.desc}
                    </span>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>优先级</label>
                    <input
                      type="number"
                      value={formData.priority}
                      onChange={e => setFormData({ ...formData, priority: parseInt(e.target.value) || 100 })}
                      min="0"
                      max="9999"
                    />
                    <span className="form-hint">数字越小越先加载，默认100</span>
                  </div>
                  <div className="form-group">
                    <label>状态</label>
                    <div className="toggle-switch">
                      <input
                        type="checkbox"
                        id="is_enabled"
                        checked={formData.is_enabled}
                        onChange={e => setFormData({ ...formData, is_enabled: e.target.checked })}
                      />
                      <label htmlFor="is_enabled" className="toggle-label">
                        <span className="toggle-inner"></span>
                        <span className="toggle-switch-handle"></span>
                      </label>
                      <span className="toggle-text">{formData.is_enabled ? '已启用' : '已禁用'}</span>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label>说明</label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="简要说明这段代码的用途"
                  />
                </div>

                <div className="form-group">
                  <label>代码内容 <span className="required">*</span></label>
                  <textarea
                    className="code-editor"
                    value={formData.code_content}
                    onChange={e => setFormData({ ...formData, code_content: e.target.value })}
                    placeholder="在此粘贴 HTML/JavaScript/CSS 代码..."
                    rows={12}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>生效页面（可选）</label>
                  <textarea
                    value={pagesInput}
                    onChange={e => setPagesInput(e.target.value)}
                    placeholder="每行一个页面路径，如：&#10;/&#10;/search&#10;/paper/*&#10;&#10;留空表示全部页面生效"
                    rows={4}
                  />
                  <span className="form-hint">支持通配符 *，留空表示全部页面生效</span>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn-primary">
                  {editingSnippet ? '保存修改' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeSnippets;
