/**
 * Scholay学术 V1.0 - 站内信管理页面
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Send, Mail, Gift, CreditCard, Inbox } from 'lucide-react';
import { adminAPI } from '../services/api';
import './MessageManagement.css';

const MessageManagement = () => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ category: '', status: '', keyword: '' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: '', content: '', category: 'system', send_type: 'all',
    target_plans: [], target_user_ids: '', link_url: '', link_text: '', send_now: true
  });

  const pageSize = 20;

  // 加载消息列表
  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getMessages({ page, pageSize, ...filters });
      if (res.data.code === 0) {
        setMessages(res.data.data.list || []);
        setTotal(res.data.data.total || 0);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, filters]);

  // 加载统计
  const loadStats = useCallback(async () => {
    try {
      const res = await adminAPI.getMessageStats();
      if (res.data.code === 0) setStats(res.data.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="message-management">
      <h1>站内信管理</h1>
      {/* 统计卡片 */}
      {stats && (
        <div className="message-stats">
          <div className="stat-card"><div className="stat-label">消息总数</div><div className="stat-value">{stats.total_messages}</div></div>
          <div className="stat-card"><div className="stat-label">总接收人数</div><div className="stat-value">{stats.total_recipients}</div></div>
          <div className="stat-card"><div className="stat-label">已读人数</div><div className="stat-value">{stats.total_read}</div></div>
          <div className="stat-card"><div className="stat-label">整体已读率</div><div className="stat-value">{stats.overall_read_rate?.toFixed(1)}%</div></div>
        </div>
      )}
      {/* 工具栏 */}
      <div className="message-toolbar">
        <div className="toolbar-filters">
          <select value={filters.category} onChange={e => { setFilters(f => ({...f, category: e.target.value})); setPage(1); }}>
            <option value="">全部分类</option>
            <option value="system">系统通知</option>
            <option value="promotion">营销推广</option>
            <option value="transaction">交易通知</option>
          </select>
          <select value={filters.status} onChange={e => { setFilters(f => ({...f, status: e.target.value})); setPage(1); }}>
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="sent">已发送</option>
          </select>
        </div>
        <button className="btn-create" onClick={() => setShowCreateModal(true)}><Plus size={18} />发送消息</button>
      </div>
      {/* 消息列表 */}
      <div className="message-list">
        {loading ? (
          <div className="loading-state"><div className="loading-spinner"></div></div>
        ) : messages.length === 0 ? (
          <div className="empty-state"><Inbox size={48} /><p>暂无消息</p></div>
        ) : (
          <table className="message-table">
            <thead><tr><th>消息内容</th><th>分类</th><th>发送类型</th><th>接收/已读</th><th>状态</th><th>发送时间</th><th>操作</th></tr></thead>
            <tbody>
              {messages.map(m => (
                <tr key={m.id}>
                  <td className="message-title-cell"><div className="message-title">{m.title}</div><div className="message-preview">{m.content?.substring(0, 50)}</div></td>
                  <td><span className={`category-badge ${m.category}`}>{m.category === 'system' ? '系统' : m.category === 'promotion' ? '推广' : '交易'}</span></td>
                  <td><span className="send-type-badge">{m.send_type === 'all' ? '全站' : m.send_type === 'by_plan' ? '按等级' : '指定用户'}</span></td>
                  <td>{m.recipient_count} / {m.read_count}</td>
                  <td><span className={`status-badge ${m.status}`}>{m.status === 'draft' ? '草稿' : m.status === 'sent' ? '已发送' : '已取消'}</span></td>
                  <td>{m.send_at ? new Date(m.send_at).toLocaleString('zh-CN') : '-'}</td>
                  <td><div className="action-buttons">{m.status === 'draft' && <button className="btn-action primary" onClick={() => handleSend(m.id)}><Send size={14} /></button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {/* 分页 */}
        {total > pageSize && (
          <div className="message-pagination">
            <div className="pagination-info">共 {total} 条</div>
            <div className="pagination-buttons">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
              <button disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          </div>
        )}
      </div>
      {/* 创建消息弹窗 - 下一段添加 */}
      {showCreateModal && <CreateModal />}
    </div>
  );

  // 发送消息
  async function handleSend(id) {
    if (!window.confirm('确定发送此消息？')) return;
    try {
      await adminAPI.sendMessage(id);
      loadMessages();
      loadStats();
    } catch (e) { alert('发送失败'); }
  }

  // 创建弹窗组件
  function CreateModal() {
    return (
      <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h2>发送站内信</h2><button className="modal-close" onClick={() => setShowCreateModal(false)}><X size={20} /></button></div>
          <div className="modal-body">
            <div className="form-group"><label>标题</label><input value={formData.title} onChange={e => setFormData(f => ({...f, title: e.target.value}))} placeholder="消息标题" /></div>
            <div className="form-group"><label>内容</label><textarea value={formData.content} onChange={e => setFormData(f => ({...f, content: e.target.value}))} placeholder="支持Markdown格式，如 **加粗**" /></div>
            <div className="form-row">
              <div className="form-group"><label>分类</label><select value={formData.category} onChange={e => setFormData(f => ({...f, category: e.target.value}))}><option value="system">系统通知</option><option value="promotion">营销推广</option><option value="transaction">交易通知</option></select></div>
              <div className="form-group"><label>发送目标</label><select value={formData.send_type} onChange={e => setFormData(f => ({...f, send_type: e.target.value}))}><option value="all">全站广播</option><option value="by_plan">按会员等级</option><option value="batch">指定用户</option></select></div>
            </div>
            {formData.send_type === 'by_plan' && (
              <div className="form-group"><label>选择会员等级</label><div className="plan-checkboxes">
                {['free','pro','max'].map(p => <label key={p} className="plan-checkbox"><input type="checkbox" checked={formData.target_plans.includes(p)} onChange={e => setFormData(f => ({...f, target_plans: e.target.checked ? [...f.target_plans, p] : f.target_plans.filter(x => x !== p)}))} />{p.toUpperCase()}</label>)}
              </div></div>
            )}
            {formData.send_type === 'batch' && (
              <div className="form-group"><label>用户ID列表</label><textarea value={formData.target_user_ids} onChange={e => setFormData(f => ({...f, target_user_ids: e.target.value}))} placeholder="每行一个用户ID" style={{minHeight: '80px'}} /></div>
            )}
            <div className="form-row">
              <div className="form-group"><label>跳转链接（可选）</label><input value={formData.link_url} onChange={e => setFormData(f => ({...f, link_url: e.target.value}))} placeholder="https://" /></div>
              <div className="form-group"><label>链接文字</label><input value={formData.link_text} onChange={e => setFormData(f => ({...f, link_text: e.target.value}))} placeholder="查看详情" /></div>
            </div>
            <div className="form-group"><label className="checkbox-group"><input type="checkbox" checked={formData.send_now} onChange={e => setFormData(f => ({...f, send_now: e.target.checked}))} />立即发送</label></div>
          </div>
          <div className="modal-footer"><button className="btn-cancel" onClick={() => setShowCreateModal(false)}>取消</button><button className="btn-submit" disabled={creating || !formData.title || !formData.content} onClick={handleCreate}>{creating ? '发送中...' : '确认发送'}</button></div>
        </div>
      </div>
    );
  }

  // 创建消息
  async function handleCreate() {
    try {
      setCreating(true);
      const data = { ...formData };
      if (data.send_type === 'batch' && data.target_user_ids) {
        data.target_user_ids = data.target_user_ids.split('\n').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      } else { delete data.target_user_ids; }
      if (data.send_type !== 'by_plan') delete data.target_plans;
      await adminAPI.createMessage(data);
      setShowCreateModal(false);
      setFormData({ title: '', content: '', category: 'system', send_type: 'all', target_plans: [], target_user_ids: '', link_url: '', link_text: '', send_now: true });
      loadMessages();
      loadStats();
    } catch (e) { alert('创建失败: ' + (e.response?.data?.message || e.message)); }
    finally { setCreating(false); }
  }
};

export default MessageManagement;


