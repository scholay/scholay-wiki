import React, { useState, useEffect, useCallback } from 'react';
import { publicScholarAPI, analysisDimensionAPI } from '../services/api';
import { useAuth } from '../utils/AuthContext';
import './TableColumnPanel.css';

// 生成随机维度标识
const generateDimensionKey = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'custom_';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const TableColumnPanel = ({ onDimensionsChange }) => {
  const { isAuthenticated } = useAuth();
  const [dimensions, setDimensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedColumn, setExpandedColumn] = useState(null);
  const [isCustom, setIsCustom] = useState(false);
  const [showHint, setShowHint] = useState(true); // 控制绿色提示的显示/隐藏
  
  // 编辑相关状态
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false); // 是否正在添加新维度
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  // 加载分析维度
  const loadDimensions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let response;
      if (isAuthenticated) {
        // 已登录用户：获取用户自定义维度或系统默认
        response = await analysisDimensionAPI.getDimensions();
      } else {
        // 未登录用户：获取系统默认维度
        response = await publicScholarAPI.getSystemDimensions();
      }

      if (response.data.code === 0 && response.data.data) {
        const dims = response.data.data.dimensions || [];
        setDimensions(dims);
        setIsCustom(response.data.data.isCustom || false);
        // 通知父组件维度已更新
        if (onDimensionsChange) {
          onDimensionsChange(dims);
        }
      }
    } catch (err) {
      console.error('Failed to load dimensions:', err);
      setError('加载分析维度失败');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, onDimensionsChange]);

  useEffect(() => {
    loadDimensions();
  }, [loadDimensions]);

  const handleColumnClick = (key) => {
    setExpandedColumn(key);
    setIsEditing(false);
    // 初始化编辑表单
    const column = dimensions.find(c => c.dimensionKey === key);
    if (column) {
      setEditForm({ name: column.name, description: column.description });
    }
  };

  const handleBack = () => {
    setExpandedColumn(null);
    setIsEditing(false);
  };

  // 切换提示显示状态
  const toggleHint = () => {
    setShowHint(!showHint);
  };

  // 开始编辑
  const handleStartEdit = () => {
    if (!isAuthenticated) {
      alert('请先登录后再编辑维度');
      return;
    }
    setIsEditing(true);
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setIsEditing(false);
    // 恢复原始值
    const column = dimensions.find(c => c.dimensionKey === expandedColumn);
    if (column) {
      setEditForm({ name: column.name, description: column.description });
    }
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!isAuthenticated) {
      alert('请先登录');
      return;
    }

    const column = dimensions.find(c => c.dimensionKey === expandedColumn);
    if (!column) return;

    setSaving(true);
    try {
      // 如果当前不是自定义维度，需要先复制系统维度
      if (!isCustom) {
        await analysisDimensionAPI.copyFromSystem();
      }

      // 更新维度
      const response = await analysisDimensionAPI.updateDimension(
        column.id,
        editForm.name,
        editForm.description,
        column.sortOrder
      );

      if (response.data.code === 0) {
        // 重新加载维度列表
        await loadDimensions();
        setIsEditing(false);
        // 更新当前展开的维度
        const updatedColumn = dimensions.find(c => c.dimensionKey === expandedColumn);
        if (updatedColumn) {
          setEditForm({ name: updatedColumn.name, description: updatedColumn.description });
        }
      } else {
        alert('保存失败: ' + (response.data.message || '未知错误'));
      }
    } catch (err) {
      console.error('Failed to save dimension:', err);
      alert('保存失败: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  // 添加自定义维度 - 进入添加模式
  const handleAddDimension = () => {
    if (!isAuthenticated) {
      alert('请先登录后再添加自定义维度');
      return;
    }
    setIsAdding(true);
    setIsEditing(true);
    setExpandedColumn('__new__'); // 特殊标记表示新建
    setEditForm({ name: '', description: '' });
  };

  // 保存新维度
  const handleSaveNewDimension = async () => {
    if (!isAuthenticated) {
      alert('请先登录');
      return;
    }

    if (!editForm.name.trim() || !editForm.description.trim()) {
      alert('请填写完整的维度信息');
      return;
    }

    setSaving(true);
    try {
      // 如果当前不是自定义维度，需要先复制系统维度
      if (!isCustom) {
        await analysisDimensionAPI.copyFromSystem();
      }

      // 生成随机维度标识
      const dimensionKey = generateDimensionKey();
      
      // 计算排序顺序（放在最后）
      const maxSortOrder = dimensions.length > 0 
        ? Math.max(...dimensions.map(d => d.sortOrder || 0)) 
        : 0;

      // 创建新维度
      const response = await analysisDimensionAPI.createDimension(
        dimensionKey,
        editForm.name,
        editForm.description,
        maxSortOrder + 1
      );

      if (response.data.code === 0) {
        // 重新加载维度列表
        await loadDimensions();
        // 退出添加模式
        setIsAdding(false);
        setIsEditing(false);
        setExpandedColumn(null);
      } else {
        alert('创建失败: ' + (response.data.message || '未知错误'));
      }
    } catch (err) {
      console.error('Failed to create dimension:', err);
      alert('创建失败: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  // 取消添加
  const handleCancelAdd = () => {
    setIsAdding(false);
    setIsEditing(false);
    setExpandedColumn(null);
    setEditForm({ name: '', description: '' });
  };

  // 加载中状态
  if (loading) {
    return (
      <div className="tcp-container">
        <div className="tcp-loading">
          <div className="tcp-loading-spinner"></div>
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="tcp-container">
        <div className="tcp-error">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  // 新建维度视图
  if (isAdding && expandedColumn === '__new__') {
    return (
      <div className="tcp-container">
        <div className="tcp-detail-header">
          <button className="tcp-back-btn" onClick={handleCancelAdd}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            返回
          </button>
          <span className="tcp-detail-title">新建维度</span>
        </div>
        
        <div className="tcp-detail-content">
          <div className="tcp-detail-section">
            <h4 className="tcp-detail-label">名称 <span className="tcp-required">*</span></h4>
            <input
              type="text"
              className="tcp-input"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="例如：研究方法"
              autoFocus
            />
          </div>
          <div className="tcp-detail-section">
            <h4 className="tcp-detail-label">分析指示 <span className="tcp-required">*</span></h4>
            <textarea
              className="tcp-textarea"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              placeholder="描述AI应该如何分析这个维度，例如：提取论文中使用的研究方法，包括定量研究、定性研究、混合方法等"
              rows={8}
            />
            <p className="tcp-input-hint">描述AI分析论文摘要时应该关注的内容和提取方式</p>
          </div>
          
          {/* 操作按钮 */}
          <div className="tcp-edit-actions">
            <button 
              className="tcp-btn tcp-btn-secondary" 
              onClick={handleCancelAdd}
              disabled={saving}
            >
              取消
            </button>
            <button 
              className="tcp-btn tcp-btn-primary" 
              onClick={handleSaveNewDimension}
              disabled={saving || !editForm.name.trim() || !editForm.description.trim()}
            >
              {saving ? (
                <>
                  <div className="tcp-btn-spinner"></div>
                  <span>创建中...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  <span>创建维度</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 展开的列详情视图
  if (expandedColumn && expandedColumn !== '__new__') {
    const column = dimensions.find(c => c.dimensionKey === expandedColumn);
    if (!column) {
      setExpandedColumn(null);
      return null;
    }

    return (
      <div className="tcp-container">
        <div className="tcp-detail-header">
          <button className="tcp-back-btn" onClick={handleBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            返回
          </button>
          <span className="tcp-detail-title">列详情</span>
          {!isEditing && (
            <button className="tcp-edit-btn" onClick={handleStartEdit} title="编辑">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
        </div>
        
        <div className="tcp-detail-content">
          {isEditing ? (
            // 编辑模式
            <>
              <div className="tcp-detail-section">
                <h4 className="tcp-detail-label">名称 <span className="tcp-required">*</span></h4>
                <input
                  type="text"
                  className="tcp-input"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="输入维度名称"
                />
              </div>
              <div className="tcp-detail-section">
                <h4 className="tcp-detail-label">分析指示 <span className="tcp-required">*</span></h4>
                <textarea
                  className="tcp-textarea"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  placeholder="输入分析指示，描述AI应该如何分析这个维度"
                  rows={8}
                />
                <p className="tcp-input-hint">描述AI分析论文摘要时应该关注的内容和提取方式</p>
              </div>
              
              {/* 编辑操作按钮 */}
              <div className="tcp-edit-actions">
                <button 
                  className="tcp-btn tcp-btn-secondary" 
                  onClick={handleCancelEdit}
                  disabled={saving}
                >
                  取消
                </button>
                <button 
                  className="tcp-btn tcp-btn-primary" 
                  onClick={handleSaveEdit}
                  disabled={saving || !editForm.name.trim() || !editForm.description.trim()}
                >
                  {saving ? (
                    <>
                      <div className="tcp-btn-spinner"></div>
                      <span>保存中...</span>
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                      </svg>
                      <span>保存</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            // 查看模式
            <>
              <div className="tcp-detail-section">
                <h4 className="tcp-detail-label">名称</h4>
                <p className="tcp-detail-value">{column.name}</p>
              </div>
              <div className="tcp-detail-section">
                <h4 className="tcp-detail-label">分析指示</h4>
                <p className="tcp-detail-value tcp-detail-description">{column.description}</p>
              </div>
              {column.userId && (
                <div className="tcp-detail-section">
                  <span className="tcp-custom-badge-large">自定义维度</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // 列列表视图
  return (
    <div className="tcp-container">
      <div className="tcp-header">
        <h3 className="tcp-title">列</h3>
        <button 
          className={`tcp-info-btn ${!showHint ? 'tcp-info-btn-active' : ''}`} 
          title={showHint ? "隐藏提示" : "显示提示"}
          onClick={toggleHint}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4M12 8h.01"/>
          </svg>
        </button>
      </div>

      {/* 添加提取列提示 - 可隐藏 */}
      {showHint && (
        <div className="tcp-add-hint">
          <div className="tcp-add-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div className="tcp-add-text">
            <h4>添加提取列</h4>
            <p>使用建议的提取列或添加您自己的提取列。评估提取结果并根据需要完善列定义。</p>
            <button className="tcp-hide-btn" onClick={toggleHint}>隐藏</button>
          </div>
        </div>
      )}

      {/* 列列表头部 */}
      <div className="tcp-list-header">
        <span>列</span>
        {isCustom && <span className="tcp-custom-badge">自定义</span>}
      </div>

      {/* 列列表 */}
      <div className="tcp-list">
        {dimensions.map((column) => (
          <div 
            key={column.dimensionKey} 
            className="tcp-list-item"
            onClick={() => handleColumnClick(column.dimensionKey)}
          >
            <div className="tcp-item-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </div>
            <span className="tcp-item-name">{column.name}</span>
            <svg className="tcp-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        ))}
      </div>

      {/* 添加自定义维度按钮 */}
      <div className="tcp-add-dimension">
        <button className="tcp-add-dimension-btn" onClick={handleAddDimension}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span>添加自定义维度</span>
        </button>
      </div>
    </div>
  );
};

export default TableColumnPanel;
