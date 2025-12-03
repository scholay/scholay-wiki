/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from '../components/Toast';
import './SubscriptionPlans.css';

const SubscriptionPlans = () => {
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState([]);
  const [editingPlan, setEditingPlan] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    plan_name: '',
    price_monthly: 0,
    current_price_monthly: 0,
    price_yearly: 0,
    current_price_yearly: 0,
    yearly_discount_enabled: false,
    yearly_discount_percent: 0,
    features: {
      normal_search: { limit: -1, period: 'day', description: '无限制' },
      advanced_search_low: { limit: 5, period: 'day', description: '5/天' },
      advanced_search_mid: { limit: 3, period: 'day', description: '3/天' },
      advanced_search_high: { limit: 2, period: 'day', description: '2/天' },
      ai_chat_normal: { limit: -1, period: 'day', description: '无限制' },
      ai_chat_mid: { limit: 50, period: 'day', description: '50/天' },
      ai_chat_high: { limit: 10, period: 'day', description: '10/天' },
      advanced_search_data: { enabled: true, description: '可查看高级搜索历史数据' },
      ai_history_data: { enabled: true, description: '可查看AI对话历史数据' },
    },
  });

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getSubscriptionPlans();
      if (response.data.code === 0 && response.data.data) {
        setPlans(response.data.data);
      }
    } catch (err) {
      showToast('加载套餐列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (plan) => {
    setEditingPlan(plan);
    setFormData({
      plan_name: plan.plan_name,
      price_monthly: plan.price_monthly,
      current_price_monthly: plan.current_price_monthly || plan.price_monthly,
      price_yearly: plan.price_yearly,
      current_price_yearly: plan.current_price_yearly || plan.price_yearly,
      yearly_discount_enabled: plan.yearly_discount_enabled || false,
      yearly_discount_percent: plan.yearly_discount_percent || 0,
      features: plan.features,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!editingPlan) {
      showToast('只能编辑现有套餐', 'error');
      return;
    }

    // Calculate yearly price if discount is enabled
    let currentPriceYearly = parseFloat(formData.current_price_yearly);
    if (formData.yearly_discount_enabled) {
      const monthlyPrice = parseFloat(formData.current_price_monthly);
      const discountPercent = parseFloat(formData.yearly_discount_percent);
      currentPriceYearly = monthlyPrice * 12 * (1 - discountPercent / 100);
    }

    const data = {
      plan_name: formData.plan_name,
      price_monthly: parseFloat(formData.price_monthly),
      current_price_monthly: parseFloat(formData.current_price_monthly),
      price_yearly: parseFloat(formData.price_yearly),
      current_price_yearly: currentPriceYearly,
      yearly_discount_enabled: formData.yearly_discount_enabled,
      yearly_discount_percent: parseFloat(formData.yearly_discount_percent),
      features: formData.features,
    };

    try {
      const response = await adminAPI.updateSubscriptionPlan(editingPlan.id, data);
      if (response.data.code === 0) {
        showToast('更新成功', 'success');
        setShowModal(false);
        loadPlans();
      } else {
        showToast(response.data.message || '更新失败', 'error');
      }
    } catch (err) {
      showToast('更新失败', 'error');
    }
  };

  const updateFeature = (featureKey, field, value) => {
    setFormData({
      ...formData,
      features: {
        ...formData.features,
        [featureKey]: {
          ...formData.features[featureKey],
          [field]: value,
        },
      },
    });
  };

  const getFeatureLabel = (key) => {
    const labels = {
      normal_search: '普通搜索',
      advanced_search_low: '高级搜索 - 低级模型',
      advanced_search_mid: '高级搜索 - 中级模型',
      advanced_search_high: '高级搜索 - 高级模型',
      ai_chat_normal: 'AI对话 - 低级模型',
      ai_chat_mid: 'AI对话 - 中级模型',
      ai_chat_high: 'AI对话 - 高级模型',
      advanced_search_data: '高级搜索数据',
      ai_history_data: 'AI对话历史数据',
    };
    return labels[key] || key;
  };

  const getPlanBadge = (planCode) => {
    switch (planCode) {
      case 'free':
        return <span className="plan-badge badge-free">FREE</span>;
      case 'pro':
        return <span className="plan-badge badge-pro">PRO</span>;
      case 'max':
        return <span className="plan-badge badge-max">MAX</span>;
      default:
        return <span className="plan-badge">{planCode}</span>;
    }
  };

  return (
    <div className="subscription-plans">
      <div className="page-header">
        <h2>套餐管理</h2>
      </div>

      <div className="plans-grid">
        {loading ? (
          <div className="loading">加载中...</div>
        ) : plans.length === 0 ? (
          <div className="empty-state">暂无套餐</div>
        ) : (
          plans.map((plan) => (
            <div key={plan.id} className={`plan-card plan-${plan.plan_code}`}>
              <div className="plan-header">
                {getPlanBadge(plan.plan_code)}
                <h3>{plan.plan_name}</h3>
              </div>
              <div className="plan-pricing">
                <div className="price-item">
                  <span className="price-label">月付</span>
                  <div className="price-values">
                    {plan.price_monthly !== plan.current_price_monthly && (plan.price_monthly || 0) > 0 ? (
                      <>
                        <span className="price-original">¥{(plan.price_monthly || 0).toFixed(2)}</span>
                        <span className="price-current">¥{(plan.current_price_monthly || 0).toFixed(2)}</span>
                      </>
                    ) : (
                      <span className="price-value">¥{(plan.current_price_monthly || plan.price_monthly || 0).toFixed(2)}</span>
                    )}
                  </div>
                </div>
                <div className="price-item">
                  <span className="price-label">年付</span>
                  <div className="price-values">
                    {plan.price_yearly !== plan.current_price_yearly && (plan.price_yearly || 0) > 0 ? (
                      <>
                        <span className="price-original">¥{(plan.price_yearly || 0).toFixed(2)}</span>
                        <span className="price-current">¥{(plan.current_price_yearly || 0).toFixed(2)}</span>
                      </>
                    ) : (
                      <span className="price-value">¥{(plan.current_price_yearly || plan.price_yearly || 0).toFixed(2)}</span>
                    )}
                    {plan.yearly_discount_enabled && (plan.yearly_discount_percent || 0) > 0 && (
                      <span className="discount-badge">{(100 - (plan.yearly_discount_percent || 0)).toFixed(0)}折</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="plan-features">
                <h4>功能限制</h4>
                <ul>
                  <li>普通搜索: {plan.features.normal_search.description}</li>
                  <li>高级搜索 低级模型: {plan.features.advanced_search_low.description}</li>
                  <li>高级搜索 中级模型: {plan.features.advanced_search_mid.description}</li>
                  <li>高级搜索 高级模型: {plan.features.advanced_search_high.description}</li>
                  <li>AI对话 低级模型: {plan.features.ai_chat_normal.description}</li>
                  <li>AI对话 中级模型: {plan.features.ai_chat_mid.description}</li>
                  <li>AI对话 高级模型: {plan.features.ai_chat_high.description}</li>
                </ul>
              </div>
              <button className="btn btn-edit" onClick={() => handleEdit(plan)}>
                编辑套餐
              </button>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h3>编辑套餐: {editingPlan?.plan_name}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-sections">
                <div className="form-section">
                  <h4>基本信息</h4>
                  <div className="form-group">
                    <label>套餐名称</label>
                    <input
                      type="text"
                      value={formData.plan_name}
                      onChange={(e) => setFormData({ ...formData, plan_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="pricing-section">
                    <h5>月付定价</h5>
                    <div className="form-row">
                      <div className="form-group">
                        <label>月付原价 (¥)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.price_monthly}
                          onChange={(e) => setFormData({ ...formData, price_monthly: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>月付实时价格 (¥)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.current_price_monthly}
                          onChange={(e) => setFormData({ ...formData, current_price_monthly: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pricing-section">
                    <h5>年付定价</h5>
                    <div className="form-group checkbox-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={formData.yearly_discount_enabled}
                          onChange={(e) => setFormData({ ...formData, yearly_discount_enabled: e.target.checked })}
                        />
                        <span>使用月付价格折扣计算</span>
                      </label>
                      <small className="hint-text">
                        {formData.yearly_discount_enabled
                          ? `年付价格将自动计算为: 月付实时价格 × 12 × (1 - ${formData.yearly_discount_percent}%)`
                          : '取消勾选则使用直接定价'}
                      </small>
                    </div>

                    {formData.yearly_discount_enabled ? (
                      <div className="form-group">
                        <label>折扣百分比 (%)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={formData.yearly_discount_percent}
                          onChange={(e) => setFormData({ ...formData, yearly_discount_percent: e.target.value })}
                          required
                        />
                        <small className="hint-text">
                          计算后的年付价格: ¥{(formData.current_price_monthly * 12 * (1 - formData.yearly_discount_percent / 100)).toFixed(2)}
                        </small>
                      </div>
                    ) : (
                      <div className="form-row">
                        <div className="form-group">
                          <label>年付原价 (¥)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.price_yearly}
                            onChange={(e) => setFormData({ ...formData, price_yearly: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label>年付实时价格 (¥)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.current_price_yearly}
                            onChange={(e) => setFormData({ ...formData, current_price_yearly: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-section">
                  <h4>功能配额</h4>
                  <small className="section-hint">-1 表示无限制，其他数字表示每日限额</small>

                  {Object.keys(formData.features).map((featureKey) => {
                    const feature = formData.features[featureKey];

                    // Handle boolean features (enabled/disabled)
                    if (typeof feature.enabled === 'boolean') {
                      return (
                        <div key={featureKey} className="feature-item">
                          <label className="feature-label">{getFeatureLabel(featureKey)}</label>
                          <div className="feature-controls">
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={feature.enabled}
                                onChange={(e) => updateFeature(featureKey, 'enabled', e.target.checked)}
                              />
                              <span>启用</span>
                            </label>
                            <input
                              type="text"
                              className="description-input"
                              value={feature.description}
                              onChange={(e) => updateFeature(featureKey, 'description', e.target.value)}
                              placeholder="描述"
                            />
                          </div>
                        </div>
                      );
                    }

                    // Handle quota features (limit-based)
                    return (
                      <div key={featureKey} className="feature-item">
                        <label className="feature-label">{getFeatureLabel(featureKey)}</label>
                        <div className="feature-controls">
                          <input
                            type="number"
                            className="limit-input"
                            value={feature.limit}
                            onChange={(e) => updateFeature(featureKey, 'limit', parseInt(e.target.value))}
                            placeholder="限额"
                          />
                          <select
                            className="period-select"
                            value={feature.period}
                            onChange={(e) => updateFeature(featureKey, 'period', e.target.value)}
                          >
                            <option value="day">每天</option>
                            <option value="month">每月</option>
                            <option value="year">每年</option>
                          </select>
                          <input
                            type="text"
                            className="description-input"
                            value={feature.description}
                            onChange={(e) => updateFeature(featureKey, 'description', e.target.value)}
                            placeholder="描述"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionPlans;
