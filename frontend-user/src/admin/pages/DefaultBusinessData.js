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
import './DefaultBusinessData.css';

const DefaultBusinessData = () => {
  const [activeTab, setActiveTab] = useState('dimensions');
  const [dimensions, setDimensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDimension, setEditingDimension] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sortOrder: 0,
    isActive: true
  });

  useEffect(() => {
    if (activeTab === 'dimensions') {
      loadDimensions();
    }
  }, [activeTab]);

  const loadDimensions = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getAnalysisDimensions();
      if (response.data.code === 0 && response.data.data) {
        setDimensions(response.data.data.dimensions || []);
      }
    } catch (error) {
      console.error('Failed to load dimensions:', error);
      alert('加载分析维度失败');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (dimension) => {
    setEditingDimension(dimension);
    setFormData({
      name: dimension.name,
      description: dimension.description,
      sortOrder: dimension.sortOrder,
      isActive: dimension.isActive
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await adminAPI.updateAnalysisDimension(editingDimension.id, formData);
      if (response.data.code === 0) {
        alert('分析维度更新成功');
        setShowModal(false);
        loadDimensions();
      } else {
        alert('更新失败: ' + response.data.message);
      }
    } catch (error) {
      console.error('Failed to update dimension:', error);
      alert('更新失败: ' + (error.response?.data?.message || error.message));
    }
  };

  const tabs = [
    { key: 'dimensions', label: '分析维度', icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="9" y1="21" x2="9" y2="9"/>
      </svg>
    )},
    // 可以在这里添加更多的默认业务数据 tab
  ];

  return (
    <div className="default-business-data-page">
      <div className="page-header">
        <h1>默认业务数据</h1>
        <p className="page-description">管理系统默认的业务配置数据</p>
      </div>

      {/* Tab 导航 */}
      <div className="tabs-container">
        <div className="tabs-nav">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="tab-content">
        {activeTab === 'dimensions' && (
          <div className="dimensions-section">
            <div className="section-header">
              <div className="section-title">
                <h2>论文分析维度</h2>
                <p>配置表格视图中AI分析论文摘要的维度，包括维度名称和分析指示</p>
              </div>
            </div>

            {loading ? (
              <div className="loading-container">
                <div className="spinner"></div>
                <p>加载中...</p>
              </div>
            ) : (
              <div className="dimensions-list">
                {dimensions.map((dimension) => (
                  <div 
                    key={dimension.id} 
                    className={`dimension-card ${!dimension.isActive ? 'inactive' : ''}`}
                  >
                    <div className="dimension-header">
                      <div className="dimension-info">
                        <div className="dimension-order">{dimension.sortOrder}</div>
                        <div className="dimension-title">
                          <h3>{dimension.name}</h3>
                          <span className="dimension-key">{dimension.dimensionKey}</span>
                        </div>
                        <span className={`badge ${dimension.isActive ? 'badge-success' : 'badge-secondary'}`}>
                          {dimension.isActive ? '启用' : '停用'}
                        </span>
                      </div>
                      <div className="dimension-actions">
                        <button 
                          className="btn-icon" 
                          onClick={() => handleEdit(dimension)}
                          title="编辑"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325z"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="dimension-description">
                      <strong>分析指示：</strong>
                      <p>{dimension.description}</p>
                    </div>
                    <div className="dimension-footer">
                      <small>更新时间: {new Date(dimension.updatedAt).toLocaleString('zh-CN')}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 编辑弹窗 */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-large">
            <div className="modal-header">
              <h2>编辑分析维度</h2>
              <button className="btn-close" onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-section">
                <div className="section-header">
                  <h3>基本信息</h3>
                </div>

                <div className="form-group">
                  <label>维度标识 <span className="readonly-hint">(不可修改)</span></label>
                  <input
                    type="text"
                    className="form-control"
                    value={editingDimension?.dimensionKey || ''}
                    disabled
                  />
                </div>

                <div className="form-group">
                  <label>维度名称 <span className="required">*</span></label>
                  <input
                    type="text"
                    className="form-control"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="例如：研究类型"
                  />
                  <small className="form-help">显示在表格列头的名称</small>
                </div>

                <div className="form-row">
                  <div className="form-group form-group-small">
                    <label>排序顺序</label>
                    <input
                      type="number"
                      className="form-control"
                      value={formData.sortOrder}
                      onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                      min="0"
                    />
                  </div>

                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      />
                      <span>启用此维度</span>
                    </label>
                    <small className="form-help">停用的维度不会在表格中显示</small>
                  </div>
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <h3>分析指示 <span className="required">*</span></h3>
                  <p>AI分析论文摘要时使用的提示词，描述如何提取和分析该维度的信息</p>
                </div>

                <div className="form-group">
                  <textarea
                    className="form-control description-textarea"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    required
                    rows="8"
                    placeholder="输入分析指示内容..."
                  />
                  <div className="textarea-stats">
                    <span>字符数: {formData.description.length}</span>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn-primary">
                  <Check size={16} className="icon-mr" />
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

export default DefaultBusinessData;

