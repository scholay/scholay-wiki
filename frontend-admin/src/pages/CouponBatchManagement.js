import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './CouponBatchManagement.css';

const CouponBatchManagement = () => {
  const [batches, setBatches] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [formData, setFormData] = useState({
    batch_code: '',
    template_id: '',
    name: '',
    description: '',
    target_type: 'all',
    target_users: '',
    total_quantity: 100
  });

  useEffect(() => {
    fetchBatches();
    fetchTemplates();
  }, []);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/coupon-batches');
      setBatches(response.data.data.batches || []);
    } catch (error) {
      console.error('Failed to fetch batches:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await api.get('/admin/coupon-templates?page_size=100');
      setTemplates(response.data.data.templates || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const handleCreateBatch = async () => {
    try {
      // Parse target users if it's a specific_users type
      const payload = { ...formData };
      if (formData.target_type === 'specific_users' && formData.target_users) {
        payload.target_users = formData.target_users
          .split(',')
          .map(id => parseInt(id.trim()))
          .filter(id => !isNaN(id));
      } else {
        delete payload.target_users;
      }

      // Convert template_id to number
      payload.template_id = parseInt(payload.template_id);
      payload.total_quantity = parseInt(payload.total_quantity);

      await api.post('/admin/coupon-batches', payload);
      setShowCreateModal(false);
      resetForm();
      fetchBatches();
      alert('批次创建成功！');
    } catch (error) {
      console.error('Failed to create batch:', error);
      alert('创建失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleExecuteBatch = async (batchId) => {
    if (!window.confirm('确定要执行此批次发放吗？此操作不可撤销！')) return;

    try {
      await api.post(`/admin/coupon-batches/${batchId}/execute`);
      fetchBatches();
      alert('批次执行成功！');
    } catch (error) {
      console.error('Failed to execute batch:', error);
      alert('执行失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleCancelBatch = async (batchId) => {
    if (!window.confirm('确定要取消此批次吗？')) return;

    try {
      await api.post(`/admin/coupon-batches/${batchId}/cancel`);
      fetchBatches();
      alert('批次已取消');
    } catch (error) {
      console.error('Failed to cancel batch:', error);
      alert('取消失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const viewBatchDetails = async (batchId) => {
    try {
      const response = await api.get(`/admin/coupon-batches/${batchId}`);
      setSelectedBatch(response.data.data);
      setShowDetailsModal(true);
    } catch (error) {
      console.error('Failed to fetch batch details:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      batch_code: '',
      template_id: '',
      name: '',
      description: '',
      target_type: 'all',
      target_users: '',
      total_quantity: 100
    });
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'draft':
        return 'badge-secondary';
      case 'processing':
        return 'badge-warning';
      case 'completed':
        return 'badge-success';
      case 'cancelled':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  const getTargetTypeDisplay = (type) => {
    switch (type) {
      case 'all':
        return '全部用户';
      case 'new_users':
        return '新用户';
      case 'paid_users':
        return '付费用户';
      case 'specific_users':
        return '指定用户';
      case 'user_group':
        return '用户组';
      default:
        return type;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('zh-CN');
  };

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="batch-management">
      <div className="page-header">
        <h2>批量发放管理</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          创建批次
        </button>
      </div>

      <div className="batches-table">
        <table>
          <thead>
            <tr>
              <th>批次编号</th>
              <th>批次名称</th>
              <th>折扣券模板</th>
              <th>目标类型</th>
              <th>计划发放</th>
              <th>已发放</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {batches.map(batch => (
              <tr key={batch.id}>
                <td className="code">{batch.batch_code}</td>
                <td>
                  <div className="batch-name">{batch.name}</div>
                  {batch.description && (
                    <div className="batch-desc">{batch.description}</div>
                  )}
                </td>
                <td>{batch.template?.name || '-'}</td>
                <td>{getTargetTypeDisplay(batch.target_type)}</td>
                <td>{batch.total_quantity}</td>
                <td>{batch.distributed_quantity || 0}</td>
                <td>
                  <span className={`badge ${getStatusBadgeClass(batch.status)}`}>
                    {batch.status}
                  </span>
                </td>
                <td>{formatDate(batch.created_at)}</td>
                <td className="actions">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => viewBatchDetails(batch.id)}
                  >
                    详情
                  </button>
                  {batch.status === 'draft' && (
                    <>
                      <button
                        className="btn btn-sm btn-success"
                        onClick={() => handleExecuteBatch(batch.id)}
                      >
                        执行
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleCancelBatch(batch.id)}
                      >
                        取消
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>创建批量发放批次</h3>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>批次编号 *</label>
                <input
                  type="text"
                  value={formData.batch_code}
                  onChange={e => setFormData({...formData, batch_code: e.target.value})}
                  placeholder="如: BATCH20250101"
                />
              </div>
              <div className="form-group">
                <label>折扣券模板 *</label>
                <select
                  value={formData.template_id}
                  onChange={e => setFormData({...formData, template_id: e.target.value})}
                >
                  <option value="">请选择模板</option>
                  {templates.filter(t => t.status === 'active').map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({template.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>批次名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="批次名称"
                />
              </div>
              <div className="form-group">
                <label>描述</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="批次描述"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>目标类型 *</label>
                  <select
                    value={formData.target_type}
                    onChange={e => setFormData({...formData, target_type: e.target.value})}
                  >
                    <option value="all">全部用户</option>
                    <option value="new_users">新用户</option>
                    <option value="paid_users">付费用户</option>
                    <option value="specific_users">指定用户</option>
                    <option value="user_group">用户组</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>发放数量 *</label>
                  <input
                    type="number"
                    value={formData.total_quantity}
                    onChange={e => setFormData({...formData, total_quantity: e.target.value})}
                    min="1"
                  />
                </div>
              </div>
              {formData.target_type === 'specific_users' && (
                <div className="form-group">
                  <label>用户ID列表</label>
                  <input
                    type="text"
                    value={formData.target_users}
                    onChange={e => setFormData({...formData, target_users: e.target.value})}
                    placeholder="用逗号分隔，如: 1, 2, 3"
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleCreateBatch}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetailsModal && selectedBatch && (
        <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>批次详情</h3>
              <button className="close-btn" onClick={() => setShowDetailsModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span className="detail-label">批次编号:</span>
                <span className="detail-value">{selectedBatch.batch_code}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">批次名称:</span>
                <span className="detail-value">{selectedBatch.name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">描述:</span>
                <span className="detail-value">{selectedBatch.description || '-'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">折扣券模板:</span>
                <span className="detail-value">{selectedBatch.template?.name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">目标类型:</span>
                <span className="detail-value">{getTargetTypeDisplay(selectedBatch.target_type)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">计划发放数量:</span>
                <span className="detail-value">{selectedBatch.total_quantity}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">已发放数量:</span>
                <span className="detail-value">{selectedBatch.distributed_quantity || 0}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">状态:</span>
                <span className={`badge ${getStatusBadgeClass(selectedBatch.status)}`}>
                  {selectedBatch.status}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">创建时间:</span>
                <span className="detail-value">{formatDate(selectedBatch.created_at)}</span>
              </div>
              {selectedBatch.started_at && (
                <div className="detail-row">
                  <span className="detail-label">开始时间:</span>
                  <span className="detail-value">{formatDate(selectedBatch.started_at)}</span>
                </div>
              )}
              {selectedBatch.completed_at && (
                <div className="detail-row">
                  <span className="detail-label">完成时间:</span>
                  <span className="detail-value">{formatDate(selectedBatch.completed_at)}</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDetailsModal(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CouponBatchManagement;
