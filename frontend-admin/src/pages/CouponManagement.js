/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import api from '../services/api';
import './CouponsBase.css';

// 数字输入组件
const NumberInput = ({ value, onChange, min = 0, max, step = 1, unit, placeholder }) => {
  const [inputValue, setInputValue] = React.useState(value?.toString() || '');
  const [isFocused, setIsFocused] = React.useState(false);

  // 同步外部 value 变化
  React.useEffect(() => {
    if (!isFocused) {
      setInputValue(value?.toString() || '');
    }
  }, [value, isFocused]);

  const handleDecrease = () => {
    const currentValue = parseFloat(inputValue) || 0;
    const newValue = Math.max(min, currentValue - step);
    setInputValue(newValue.toString());
    onChange(newValue);
  };

  const handleIncrease = () => {
    const currentValue = parseFloat(inputValue) || 0;
    let newValue = currentValue + step;
    if (max !== undefined) {
      newValue = Math.min(max, newValue);
    }
    setInputValue(newValue.toString());
    onChange(newValue);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    // 允许空值和正在输入的状态
    setInputValue(val);
  };

  const handleFocus = (e) => {
    setIsFocused(true);
    // 如果当前值是0，选中全部以便覆盖输入
    if (value === 0 || inputValue === '0') {
      e.target.select();
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    // 失焦时验证并提交值
    let finalValue = parseFloat(inputValue);
    if (isNaN(finalValue) || inputValue === '') {
      finalValue = min;
    }
    if (max !== undefined) {
      finalValue = Math.min(max, finalValue);
    }
    finalValue = Math.max(min, finalValue);
    setInputValue(finalValue.toString());
    onChange(finalValue);
  };

  const displayValue = isFocused ? inputValue : (value?.toString() || '');

  return (
    <div className="number-input-wrapper">
      <button 
        type="button"
        className="number-btn decrease" 
        onClick={handleDecrease}
        disabled={value <= min}
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder || '输入数值'}
      />
      {unit && <span className="number-input-unit">{unit}</span>}
      <button 
        type="button"
        className="number-btn increase" 
        onClick={handleIncrease}
        disabled={max !== undefined && value >= max}
      >
        +
      </button>
    </div>
  );
};

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
    first_purchase_only: false,
    is_invite_coupon: false
  });

  // 折扣类型配置
  const discountTypes = [
    {
      value: 'percentage',
      label: '百分比折扣',
      icon: '%',
      description: '按订单金额的百分比减免',
      valueLabel: '折扣比例',
      valueUnit: '%',
      valuePlaceholder: '例如：10 表示打9折',
      valueHelp: '输入1-100的数字，如10表示减免10%（即打9折）',
      exampleCalc: (value, amount) => `订单 ¥${amount} × ${value}% = 优惠 ¥${(amount * value / 100).toFixed(2)}，实付 ¥${(amount - amount * value / 100).toFixed(2)}`
    },
    {
      value: 'fixed',
      label: '固定价格',
      icon: '¥',
      description: '用户只需支付固定金额，无论原价多少',
      valueLabel: '固定支付金额',
      valueUnit: '元',
      valuePlaceholder: '例如：99 表示只需支付99元',
      valueHelp: '用户使用此券后只需支付此固定金额',
      exampleCalc: (value, amount) => value >= amount 
        ? `订单 ¥${amount}，固定价 ¥${value} ≥ 原价，无优惠`
        : `订单 ¥${amount}，使用后只需支付 ¥${value}，优惠 ¥${(amount - value).toFixed(2)}`
    },
    {
      value: 'price_off',
      label: '立减金额',
      icon: '-¥',
      description: '直接减免固定金额',
      valueLabel: '减免金额',
      valueUnit: '元',
      valuePlaceholder: '例如：20 表示立减20元',
      valueHelp: '订单金额直接减去此数值',
      exampleCalc: (value, amount) => `订单 ¥${amount} - ¥${value} = 实付 ¥${Math.max(0, amount - value).toFixed(2)}`
    }
  ];

  // 发放方式配置
  const distributionTypes = [
    {
      value: 'manual',
      label: '手动发放',
      icon: 'M',
      description: '管理员手动选择用户发放'
    },
    {
      value: 'auto_register',
      label: '注册自动发放',
      icon: 'R',
      description: '新用户注册时自动获得'
    },
    {
      value: 'auto_invite',
      label: '邀请自动发放',
      icon: 'I',
      description: '成功邀请新用户后自动获得'
    }
  ];

  // 获取当前折扣类型配置
  const getCurrentDiscountType = () => {
    return discountTypes.find(t => t.value === formData.type) || discountTypes[0];
  };

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

  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  
  // 点击删除按钮，显示确认弹窗
  const handleDeleteClick = (id) => {
    setDeleteTargetId(id);
    setDeleteError('');
    setDeleteModalVisible(true);
  };

  // 确认删除
  const handleConfirmDelete = async () => {
    if (deleting || !deleteTargetId) return;
    
    setDeleting(true);
    setDeleteError('');
    
    try {
      await api.delete(`/admin/coupon-templates/${deleteTargetId}`);
      setDeleteModalVisible(false);
      setDeleteTargetId(null);
      fetchTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
      const errorMsg = error.response?.data?.message || error.message;
      setDeleteError(errorMsg);
    } finally {
      setDeleting(false);
    }
  };

  // 取消删除
  const handleCancelDelete = () => {
    setDeleteModalVisible(false);
    setDeleteTargetId(null);
    setDeleteError('');
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
        return '百分比折扣';
      case 'fixed':
        return '固定价格';
      case 'price_off':
        return '立减金额';
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
          创建折扣券
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(template.id);
                    }}
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
          <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>创建折扣券</h3>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* 基本信息 */}
              <div className="form-section">
                <div className="form-section-title">基本信息</div>
                <div className="form-group">
                  <label>折扣券名称 *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    placeholder="例如：新用户专享8折券"
                  />
                  <div className="form-hint">折扣券编码将根据发放方式自动生成</div>
                </div>
                <div className="form-group">
                  <label>描述</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder="简要描述折扣券的用途和优惠内容"
                  />
                </div>
              </div>

              {/* 折扣类型 */}
              <div className="form-section">
                <div className="form-section-title">折扣类型 *</div>
                <div className="radio-card-group">
                  {discountTypes.map(type => (
                    <div 
                      key={type.value}
                      className={`radio-card ${formData.type === type.value ? 'active' : ''}`}
                      onClick={() => setFormData({...formData, type: type.value})}
                    >
                      <div className="radio-card-icon">{type.icon}</div>
                      <div className="radio-card-content">
                        <div className="radio-card-label">{type.label}</div>
                        <div className="radio-card-desc">{type.description}</div>
                      </div>
                      <div className="radio-card-check">
                        {formData.type === type.value && <span>✓</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 折扣值 */}
              <div className="form-section">
                <div className="form-section-title">
                  {getCurrentDiscountType().valueLabel} *
                  <span className="form-section-hint">{getCurrentDiscountType().valueHelp}</span>
                </div>
                <NumberInput
                  value={formData.discount_value}
                  onChange={(val) => setFormData({...formData, discount_value: val})}
                  min={0}
                  max={formData.type === 'percentage' ? 100 : undefined}
                  step={formData.type === 'percentage' ? 5 : 10}
                  unit={getCurrentDiscountType().valueUnit}
                  placeholder={getCurrentDiscountType().valuePlaceholder}
                />
                {formData.discount_value > 0 && (
                  <div className="calc-preview">
                    <div className="calc-preview-title">计算示例</div>
                    <div className="calc-preview-content">
                      {getCurrentDiscountType().exampleCalc(formData.discount_value, 100)}
                    </div>
                  </div>
                )}
              </div>

              {/* 使用门槛 */}
              <div className="form-section">
                <div className="form-section-title">
                  使用门槛
                  <span className="form-section-hint">订单金额需达到此金额才能使用，设为0表示无门槛</span>
                </div>
                <NumberInput
                  value={formData.min_purchase_amount}
                  onChange={(val) => setFormData({...formData, min_purchase_amount: val})}
                  min={0}
                  step={10}
                  unit="元"
                />
                {formData.min_purchase_amount > 0 && (
                  <div className="form-hint" style={{marginTop: '8px'}}>
                    订单满 ¥{formData.min_purchase_amount} 可用
                  </div>
                )}
              </div>

              {/* 发放方式 */}
              <div className="form-section">
                <div className="form-section-title">发放方式 *</div>
                <div className="radio-card-group">
                  {distributionTypes.map(type => (
                    <div 
                      key={type.value}
                      className={`radio-card ${formData.distribution_type === type.value ? 'active' : ''}`}
                      onClick={() => setFormData({
                        ...formData, 
                        distribution_type: type.value,
                        is_invite_coupon: type.value === 'auto_invite'
                      })}
                    >
                      <div className="radio-card-icon">{type.icon}</div>
                      <div className="radio-card-content">
                        <div className="radio-card-label">{type.label}</div>
                        <div className="radio-card-desc">{type.description}</div>
                      </div>
                      <div className="radio-card-check">
                        {formData.distribution_type === type.value && <span>✓</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 其他设置 */}
              <div className="form-section">
                <div className="form-section-title">其他设置</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>有效天数</label>
                    <NumberInput
                      value={formData.valid_days}
                      onChange={(val) => setFormData({...formData, valid_days: val})}
                      min={1}
                      step={7}
                      unit="天"
                    />
                    <div className="form-hint">领取后的有效使用期限</div>
                  </div>
                  <div className="form-group">
                    <label>每用户可用次数</label>
                    <NumberInput
                      value={formData.max_usage_per_user}
                      onChange={(val) => setFormData({...formData, max_usage_per_user: val})}
                      min={1}
                      max={10}
                      step={1}
                      unit="次"
                    />
                    <div className="form-hint">每个用户最多可使用次数</div>
                  </div>
                </div>
                <div className="form-group">
                  <div className="checkbox-styled">
                    <input
                      type="checkbox"
                      id="first_purchase_only"
                      checked={formData.first_purchase_only}
                      onChange={e => setFormData({...formData, first_purchase_only: e.target.checked})}
                    />
                    <label htmlFor="first_purchase_only">
                      <span className="checkbox-box"></span>
                      <div className="checkbox-content">
                        <span className="checkbox-text">仅限首次购买</span>
                        <span className="checkbox-hint">勾选后，仅从未购买过的用户可使用此券</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleCreateTemplate}>
                创建折扣券
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
              <h3>编辑折扣券</h3>
              <button className="close-btn" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-section">
                <div className="form-section-title">基本信息</div>
                <div className="form-group">
                  <label>折扣券名称</label>
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
              </div>
              <div className="form-section">
                <div className="form-section-title">使用规则</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>使用门槛</label>
                    <NumberInput
                      value={formData.min_purchase_amount}
                      onChange={(val) => setFormData({...formData, min_purchase_amount: val})}
                      min={0}
                      step={10}
                      unit="元"
                    />
                  </div>
                  <div className="form-group">
                    <label>有效天数</label>
                    <NumberInput
                      value={formData.valid_days}
                      onChange={(val) => setFormData({...formData, valid_days: val})}
                      min={1}
                      step={7}
                      unit="天"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>每用户可用次数</label>
                  <div style={{maxWidth: '200px'}}>
                    <NumberInput
                      value={formData.max_usage_per_user}
                      onChange={(val) => setFormData({...formData, max_usage_per_user: val})}
                      min={1}
                      max={10}
                      step={1}
                      unit="次"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <div className="checkbox-styled">
                    <input
                      type="checkbox"
                      id="edit_first_purchase_only"
                      checked={formData.first_purchase_only}
                      onChange={e => setFormData({...formData, first_purchase_only: e.target.checked})}
                    />
                    <label htmlFor="edit_first_purchase_only">
                      <span className="checkbox-box"></span>
                      <div className="checkbox-content">
                        <span className="checkbox-text">仅限首次购买</span>
                        <span className="checkbox-hint">勾选后，仅从未购买过的用户可使用此券</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleUpdateTemplate}>
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteModalVisible && (
        <div className="modal-overlay" onClick={handleCancelDelete}>
          <div className="modal-content delete-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>确认删除</h3>
              <button className="modal-close" onClick={handleCancelDelete}>&times;</button>
            </div>
            <div className="modal-body">
              <p className="delete-warning">确定要删除这个折扣券吗？</p>
              <p className="delete-hint">注意：已发放给用户或有批次记录的折扣券无法删除。</p>
              {deleteError && (
                <div className="delete-error">
                  {deleteError}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={handleCancelDelete}>
                取消
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CouponManagement;