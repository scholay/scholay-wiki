/**
 * Scholay学术 V1.0 - 消息模板管理页面
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Edit2, Trash2, FileText } from 'lucide-react';
import { adminAPI } from '../services/api';
import './MessageTemplates.css';

const MessageTemplates = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ category: '', isActive: '' });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    code: '', name: '', title: '', content: '', category: 'system',
    variables: '', is_active: true
  });

  const pageSize = 20;

  // 加载模板列表
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, pageSize };
      if (filters.category) params.category = filters.category;
      if (filters.isActive !== '') params.isActive = filters.isActive === 'true';
      const res = await adminAPI.getMessageTemplates(params);
      if (res.data.code === 0) {
        setTemplates(res.data.data.list || []);
        setTotal(res.data.data.total || 0);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // 打开创建/编辑弹窗
  const openModal = (template = null) => {
    if (template) {
      setEditing(template);
      setFormData({
        code: template.code || '',
        name: template.name || '',
        title: template.title || '',
        content: template.content || '',
        category: template.category || 'system',
        variables: template.variables || '',
        is_active: template.is_active !== false
      });
    } else {
      setEditing(null);
      setFormData({ code: '', name: '', title: '', content: '', category: 'system', variables: '', is_active: true });
    }
    setShowModal(true);
  };

  // 保存模板
  const handleSave = async () => {
    if (!formData.code || !formData.name || !formData.title || !formData.content) {
      alert('请填写必填字段');
      return;
    }
    try {
      setSaving(true);
      if (editing) {
        await adminAPI.updateMessageTemplate(editing.id, formData);
      } else {
        await adminAPI.createMessageTemplate(formData);
      }
      setShowModal(false);
      loadTemplates();
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.message || e.message));
    } finally {
      setSaving(false);
    }
  };

  // 删除模板
  const handleDelete = async (id) => {
    if (!window.confirm('确定删除此模板？')) return;
    try {
      await adminAPI.deleteMessageTemplate(id);
      loadTemplates();
    } catch (e) {
      alert('删除失败');
    }
  };

  return (
    <div className="template-management">
      <h1>消息模板管理</h1>
      
      {/* 工具栏 */}
      <div className="template-toolbar">
        <div className="toolbar-filters">
          <select value={filters.category} onChange={e => { setFilters(f => ({...f, category: e.target.value})); setPage(1); }}>
            <option value="">全部分类</option>
            <option value="system">系统通知</option>
            <option value="promotion">营销推广</option>
            <option value="transaction">交易通知</option>
          </select>
          <select value={filters.isActive} onChange={e => { setFilters(f => ({...f, isActive: e.target.value})); setPage(1); }}>
            <option value="">全部状态</option>
            <option value="true">已启用</option>
            <option value="false">已禁用</option>
          </select>
        </div>
        <button className="btn-create" onClick={() => openModal()}><Plus size={18} />新建模板</button>
      </div>

      {/* 模板列表 */}
      <div className="template-list">
        {loading ? (
          <div className="loading-state"><div className="loading-spinner"></div></div>
        ) : templates.length === 0 ? (
          <div className="empty-state"><FileText size={48} /><p>暂无模板</p></div>
        ) : (
          <table className="template-table">
            <thead><tr><th>模板代码</th><th>名称</th><th>分类</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id}>
                  <td><code className="template-code">{t.code}</code></td>
                  <td>{t.name}</td>
                  <td><span className={`category-badge ${t.category}`}>{t.category === 'system' ? '系统' : t.category === 'promotion' ? '推广' : '交易'}</span></td>
                  <td><span className={`status-badge ${t.is_active ? 'active' : 'inactive'}`}>{t.is_active ? '启用' : '禁用'}</span></td>
                  <td>{t.created_at ? new Date(t.created_at).toLocaleString('zh-CN') : '-'}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="btn-action" onClick={() => openModal(t)}><Edit2 size={14} /></button>
                      <button className="btn-action danger" onClick={() => handleDelete(t.id)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        
        {/* 分页 */}
        {total > pageSize && (
          <div className="template-pagination">
            <div className="pagination-info">共 {total} 条</div>
            <div className="pagination-buttons">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
              <button disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          </div>
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? '编辑模板' : '新建模板'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group"><label>模板代码 *</label><input value={formData.code} onChange={e => setFormData(f => ({...f, code: e.target.value}))} placeholder="如: welcome_new_user" disabled={!!editing} /></div>
                <div className="form-group"><label>模板名称 *</label><input value={formData.name} onChange={e => setFormData(f => ({...f, name: e.target.value}))} placeholder="如: 新用户欢迎消息" /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>分类</label><select value={formData.category} onChange={e => setFormData(f => ({...f, category: e.target.value}))}><option value="system">系统通知</option><option value="promotion">营销推广</option><option value="transaction">交易通知</option></select></div>
                <div className="form-group"><label>状态</label><select value={formData.is_active ? 'true' : 'false'} onChange={e => setFormData(f => ({...f, is_active: e.target.value === 'true'}))}><option value="true">启用</option><option value="false">禁用</option></select></div>
              </div>
              <div className="form-group"><label>消息标题 *</label><input value={formData.title} onChange={e => setFormData(f => ({...f, title: e.target.value}))} placeholder="消息标题，支持变量如 {{username}}" /></div>
              <div className="form-group"><label>消息内容 *</label><textarea value={formData.content} onChange={e => setFormData(f => ({...f, content: e.target.value}))} placeholder="消息内容，支持Markdown格式和变量" /></div>
              <div className="form-group"><label>变量说明</label><textarea value={formData.variables} onChange={e => setFormData(f => ({...f, variables: e.target.value}))} placeholder="变量说明，如: username - 用户名, amount - 金额" className="textarea-sm" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn-submit" disabled={saving} onClick={handleSave}>{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageTemplates;



