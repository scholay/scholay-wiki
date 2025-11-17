import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './CouponsBase.css';

const CouponManagement = () => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    type: 'percentage',
    discount_value: 0,
    min_purchase_amount: 0,
    distribution_type: 'manual',
    valid_days: 30,
    max_usage_per_user: 1,
    new_user_only: false,
    first_purchase_only: false,
    is_invite_coupon: false
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/coupon-templates');
      setTemplates(response.data.data.templates || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    try {
      await api.post('/admin/coupon-templates', formData);
      setShowCreateModal(false);
      resetForm();
      fetchTemplates();
    } catch (error) {
      console.error('Failed to create template:', error);
      alert('创建失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleUpdateTemplate = async () => {
    try {
      await api.put(`/admin/coupon-templates/${selectedTemplate.id}`, formData);
      setShowEditModal(false);
      resetForm();
      fetchTemplates();
    } catch (error) {
      console.error('Failed to update template:', error);
      alert('更新失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm('确定要删除这个模板吗？')) return;

    try {
      await api.delete(`/admin/coupon-templates/${id}`);
      fetchTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
      alert('删除失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleActivateTemplate = async (id) => {
    try {
      await api.post(`/admin/coupon-templates/${id}/activate`);
      fetchTemplates();
    } catch (error) {
      console.error('Failed to activate template:', error);
    }
  };

  const handlePauseTemplate = async (id) => {
    try {
      await api.post(`/admin/coupon-templates/${id}/pause`);
      fetchTemplates();
    } catch (error) {
      console.error('Failed to pause template:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      type: 'percentage',
      discount_value: 0,
      min_purchase_amount: 0,
      distribution_type: 'manual',
      valid_days: 30,
      max_usage_per_user: 1,
      new_user_only: false,
      first_purchase_only: false,
      is_invite_coupon: false
    });
    setSelectedTemplate(null);
  };

  const openEditModal = (template) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      description: template.description,
      min_purchase_amount: template.min_purchase_amount,
      valid_days: template.valid_days,
      max_usage_per_user: template.max_usage_per_user,
      new_user_only: template.new_user_only,
      first_purchase_only: template.first_purchase_only,
      status: template.status
    });
    setShowEditModal(true);
  };

  const getDiscountDisplay = (type, value) => {
    switch (type) {
      case 'percentage':
        return `${value}%`;
      case 'fixed':
      case 'price_off':
        return `¥${value}`;
      default:
        return value;
    }
  };

  const getTypeDisplay = (type) => {
    switch (type) {
      case 'percentage':
        return '百分比';
      case 'fixed':
        return '固定金额';
      case 'price_off':
        return '减免金额';
      default:
        return type;
    }
  };

  const getDistributionDisplay = (type) => {
    switch (type) {
      case 'manual':
        return '手动发放';
      case 'auto_register':
        return '注册自动';
      case 'auto_invite':
        return '邀请自动';
      case 'batch':
        return '批量发放';
      case 'targeted':
        return '定向发放';
      default:
        return type;
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'active':
        return 'badge-success';
      case 'paused':
        return 'badge-warning';
      case 'expired':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="coupon-management">
      <div className="page-header">
        <h2>折扣券管理</h2>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          创建新模板
        </button>
      </div>

      <div className="templates-table">
        <table>
          <thead>
            <tr>
              <th>编码</th>
              <th>名称</th>
              <th>类型</th>
              <th>折扣</th>
              <th>最低消费</th>
              <th>发放方式</th>
              <th>有效天数</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(template => (
              <tr key={template.id}>
                <td className="code">{template.code}</td>
                <td>
                  <div className="template-name">{template.name}</div>
                  <div className="template-desc">{template.description}</div>
                </td>
                <td>{getTypeDisplay(template.type)}</td>
                <td className="discount">
                  {getDiscountDisplay(template.type, template.discount_value)}
                </td>
                <td>¥{template.min_purchase_amount}</td>
                <td>{getDistributionDisplay(template.distribution_type)}</td>
                <td>{template.valid_days}天</td>
                <td>
                  <span className={`badge ${getStatusBadgeClass(template.status)}`}>
                    {template.status}
                  </span>
                </td>
                <td className="actions">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => openEditModal(template)}
                  >
                    编辑
                  </button>
                  {template.status === 'active' ? (
                    <button
                      className="btn btn-sm btn-warning"
                      onClick={() => handlePauseTemplate(template.id)}
                    >
                      暂停
                    </button>
                  ) : (
                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => handleActivateTemplate(template.id)}
                    >
                      激活
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDeleteTemplate(template.id)}
                  >
                    删除
                  </button>
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
              <h3>创建折扣券模板</h3>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="折扣券名称"
                />
                <small style={{color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px', marginTop: '4px', display: 'block'}}>
                  折扣券编码将根据发放方式自动生成
                </small>
              </div>
              <div className="form-group">
                <label>描述</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="折扣券描述"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>折扣类型 *</label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="percentage">百分比</option>
                    <option value="fixed">固定金额</option>
                    <option value="price_off">减免金额</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>折扣值 *</label>
                  <input
                    type="number"
                    value={formData.discount_value}
                    onChange={e => setFormData({...formData, discount_value: parseFloat(e.target.value)})}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>最低消费金额</label>
                  <input
                    type="number"
                    value={formData.min_purchase_amount}
                    onChange={e => setFormData({...formData, min_purchase_amount: parseFloat(e.target.value)})}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>发放方式</label>
                  <select
                    value={formData.distribution_type}
                    onChange={e => {
                      const newDistributionType = e.target.value;
                      setFormData({
                        ...formData,
                        distribution_type: newDistributionType,
                        is_invite_coupon: newDistributionType === 'auto_invite'
                      });
                    }}
                  >
                    <option value="manual">手动发放</option>
                    <option value="auto_register">注册自动</option>
                    <option value="auto_invite">邀请自动</option>
                    <option value="batch">批量发放</option>
                    <option value="targeted">定向发放</option>
                  </select>
                </div>
              </div>
              {formData.distribution_type === 'auto_invite' && (
                <div className="form-group">
                  <div className="checkbox-group" style={{
                    padding: '12px 16px',
                    background: 'rgba(16, 163, 127, 0.1)',
                    border: '1px solid rgba(16, 163, 127, 0.3)',
                    borderRadius: '8px'
                  }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={formData.is_invite_coupon}
                        onChange={e => setFormData({...formData, is_invite_coupon: e.target.checked})}
                      />
                      邀请专用折扣券（邀请自动发放时必须勾选）
                    </label>
                  </div>
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>有效天数</label>
                  <input
                    type="number"
                    value={formData.valid_days}
                    onChange={e => setFormData({...formData, valid_days: parseInt(e.target.value)})}
                    min="1"
                  />
                </div>
                <div className="form-group">
                  <label>每用户最大使用次数</label>
                  <input
                    type="number"
                    value={formData.max_usage_per_user}
                    onChange={e => setFormData({...formData, max_usage_per_user: parseInt(e.target.value)})}
                    min="1"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.new_user_only}
                      onChange={e => setFormData({...formData, new_user_only: e.target.checked})}
                    />
                    仅限新用户
                  </label>
                </div>
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.first_purchase_only}
                      onChange={e => setFormData({...formData, first_purchase_only: e.target.checked})}
                    />
                    仅限首次购买
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleCreateTemplate}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑折扣券模板</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>描述</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>最低消费金额</label>
                  <input
                    type="number"
                    value={formData.min_purchase_amount}
                    onChange={e => setFormData({...formData, min_purchase_amount: parseFloat(e.target.value)})}
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="form-group">
                  <label>有效天数</label>
                  <input
                    type="number"
                    value={formData.valid_days}
                    onChange={e => setFormData({...formData, valid_days: parseInt(e.target.value)})}
                    min="1"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>每用户最大使用次数</label>
                <input
                  type="number"
                  value={formData.max_usage_per_user}
                  onChange={e => setFormData({...formData, max_usage_per_user: parseInt(e.target.value)})}
                  min="1"
                />
              </div>
              <div className="form-row">
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.new_user_only}
                      onChange={e => setFormData({...formData, new_user_only: e.target.checked})}
                    />
                    仅限新用户
                  </label>
                </div>
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={formData.first_purchase_only}
                      onChange={e => setFormData({...formData, first_purchase_only: e.target.checked})}
                    />
                    仅限首次购买
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleUpdateTemplate}>
                更新
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CouponManagement;