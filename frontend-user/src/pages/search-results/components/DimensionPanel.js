import React, { memo, useEffect, useRef, useState, useCallback } from 'react';

// 维度浮动面板组件
const DimensionFloatPanel = memo(({
  dimensions,
  selectedDimensions,
  floatPanelExpanded,
  setFloatPanelExpanded,
  floatPanelView,
  setFloatPanelView,
  viewingDimension,
  setViewingDimension,
  editingDimension,
  editForm,
  setEditForm,
  isSavingDimension,
  getDimensionKey,
  handleDimensionToggle,
  handleOpenEditView,
  handleCloseEditView,
  handleSaveDimension,
  handleDeleteDimension,
}) => {
  return (
    <div
      className={`dimension-float-panel ${selectedDimensions.length > 0 && !floatPanelExpanded ? 'collapsed' : ''} ${floatPanelExpanded ? 'expanded' : ''}`}
      onMouseEnter={() => setFloatPanelExpanded(true)}
      onMouseLeave={() => {
        if (floatPanelView !== 'edit') setFloatPanelExpanded(false);
      }}
    >
      <div className="dimension-float-collapsed-tab">
        <span>智能矩阵分析</span>
      </div>

      <div className="dimension-float-content">
        {floatPanelView === 'list' && (
          <DimensionListView
            dimensions={dimensions}
            selectedDimensions={selectedDimensions}
            getDimensionKey={getDimensionKey}
            handleDimensionToggle={handleDimensionToggle}
            setViewingDimension={setViewingDimension}
            setFloatPanelView={setFloatPanelView}
            handleOpenEditView={handleOpenEditView}
            handleDeleteDimension={handleDeleteDimension}
          />
        )}

        {floatPanelView === 'detail' && (
          <DimensionDetailView
            viewingDimension={viewingDimension}
            setViewingDimension={setViewingDimension}
            setFloatPanelView={setFloatPanelView}
            handleOpenEditView={handleOpenEditView}
            handleDeleteDimension={handleDeleteDimension}
          />
        )}

        {floatPanelView === 'edit' && (
          <DimensionEditView
            editingDimension={editingDimension}
            editForm={editForm}
            setEditForm={setEditForm}
            isSavingDimension={isSavingDimension}
            handleCloseEditView={handleCloseEditView}
            handleSaveDimension={handleSaveDimension}
          />
        )}
      </div>
    </div>
  );
});

// 单个维度标签项组件
const DimensionTagItem = memo(({
  dim,
  isSelected,
  isCustom,
  onToggle,
  onViewDimension,
  onEditDimension,
  onDeleteDimension,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAbove, setShowAbove] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(event.target) && 
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleMenuClick = useCallback((e) => {
    e.stopPropagation();
    if (!menuOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const menuHeight = isCustom ? 120 : 80;
      const footer = buttonRef.current.closest('.dimension-float-content')?.querySelector('.dimension-float-footer');
      let bottomBoundary = window.innerHeight;
      if (footer) bottomBoundary = footer.getBoundingClientRect().top;
      const spaceBelow = bottomBoundary - rect.bottom;
      setShowAbove(spaceBelow < menuHeight + 10);
    }
    setMenuOpen(!menuOpen);
  }, [menuOpen, isCustom]);

  const handleAction = useCallback((action) => (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    action(dim);
  }, [dim]);

  return (
    <div className={`dimension-tag-row ${isCustom ? 'custom' : ''}`}>
      <button
        className={`dimension-tag-btn ${isSelected ? 'selected' : ''} ${isCustom ? 'custom' : ''}`}
        onClick={() => onToggle(dim)}
        title={isSelected ? `点击移除 ${dim.name}` : dim.description}
      >
        {isSelected && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
        <span className="dimension-tag-name">{dim.name}</span>
      </button>
      
      <button
        ref={buttonRef}
        className="dimension-more-btn"
        onClick={handleMenuClick}
        title="更多操作"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="2"/>
          <circle cx="12" cy="12" r="2"/>
          <circle cx="12" cy="19" r="2"/>
        </svg>
      </button>

      {menuOpen && (
        <div 
          ref={menuRef} 
          className={`dimension-action-menu ${showAbove ? 'show-above' : ''}`}
        >
          <button className="dimension-menu-item" onClick={handleAction(onViewDimension)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>详情</span>
          </button>
          <button className="dimension-menu-item" onClick={handleAction(onEditDimension)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            <span>{isCustom ? '编辑' : '自定义'}</span>
          </button>
          {isCustom && (
            <button className="dimension-menu-item delete" onClick={handleAction(onDeleteDimension)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              <span>删除</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
});

DimensionTagItem.displayName = 'DimensionTagItem';

// 维度列表视图
const DimensionListView = memo(({
  dimensions,
  selectedDimensions,
  getDimensionKey,
  handleDimensionToggle,
  setViewingDimension,
  setFloatPanelView,
  handleOpenEditView,
  handleDeleteDimension,
}) => {
  const handleViewDimension = useCallback((dim) => {
    setViewingDimension(dim);
    setFloatPanelView('detail');
  }, [setViewingDimension, setFloatPanelView]);

  return (
    <>
      <div className="dimension-float-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span>智能矩阵分析</span>
      </div>
      <p className="dimension-float-desc">
        点击维度标签，AI 将从不同角度分析论文
      </p>
      <div className="dimension-float-tags">
        {dimensions.map(dim => {
          const isSelected = selectedDimensions.some(s => getDimensionKey(s) === getDimensionKey(dim));
          const isCustom = dim.userId > 0;
          return (
            <DimensionTagItem
              key={getDimensionKey(dim)}
              dim={dim}
              isSelected={isSelected}
              isCustom={isCustom}
              onToggle={handleDimensionToggle}
              onViewDimension={handleViewDimension}
              onEditDimension={handleOpenEditView}
              onDeleteDimension={handleDeleteDimension}
            />
          );
        })}
      </div>
      <div className="dimension-float-footer">
        <div className="dimension-float-stats">
          已选 {selectedDimensions.length} / 共 {dimensions.length} 个
          {dimensions.filter(d => d.userId > 0).length > 0 && (
            <span className="custom-count">（自定义 {dimensions.filter(d => d.userId > 0).length} 个）</span>
          )}
        </div>
        <button className="dimension-add-btn" onClick={() => handleOpenEditView(null)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新增
        </button>
      </div>
    </>
  );
});

// 维度详情视图
const DimensionDetailView = memo(({
  viewingDimension,
  setViewingDimension,
  setFloatPanelView,
  handleOpenEditView,
  handleDeleteDimension,
}) => {
  return (
    <>
      <div className="dimension-detail-header">
        <button
          className="dimension-detail-back"
          onClick={() => {
            setFloatPanelView('list');
            setViewingDimension(null);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          返回
        </button>
        <div className="dimension-detail-title-wrapper">
          <span className="dimension-detail-title">{viewingDimension?.name}</span>
          {viewingDimension?.userId > 0 ? (
            <span className="custom-badge small">自定义</span>
          ) : (
            <span className="system-badge small">系统</span>
          )}
        </div>
      </div>
      <div className="dimension-detail-content">
        <div className="dimension-detail-section">
          <h4 className="dimension-detail-label">分析指令</h4>
          <p className="dimension-detail-prompt">{viewingDimension?.description}</p>
        </div>
      </div>
      <div className="dimension-detail-actions">
        <button className="dimension-action-btn edit" onClick={() => handleOpenEditView(viewingDimension)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          {viewingDimension?.userId > 0 ? '编辑' : '自定义'}
        </button>
        {viewingDimension?.userId > 0 && (
          <button className="dimension-action-btn delete" onClick={() => handleDeleteDimension(viewingDimension)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            删除
          </button>
        )}
      </div>
    </>
  );
});

// 维度编辑视图
const DimensionEditView = memo(({
  editingDimension,
  editForm,
  setEditForm,
  isSavingDimension,
  handleCloseEditView,
  handleSaveDimension,
}) => {
  return (
    <>
      <div className="dimension-detail-header">
        <button className="dimension-detail-back" onClick={handleCloseEditView}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          返回
        </button>
        <span className="dimension-detail-title">
          {editingDimension ? '编辑维度' : '新增维度'}
        </span>
      </div>
      <div className="dimension-edit-form">
        <div className="dimension-form-group">
          <label className="dimension-form-label">维度名称</label>
          <input
            type="text"
            className="dimension-form-input"
            placeholder="输入维度名称..."
            value={editForm.name}
            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
            maxLength={50}
          />
        </div>
        <div className="dimension-form-group">
          <label className="dimension-form-label">分析指令</label>
          <textarea
            className="dimension-form-textarea"
            placeholder="输入 AI 分析时使用的指令..."
            value={editForm.description}
            onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
            rows={5}
          />
        </div>
      </div>
      <div className="dimension-edit-actions">
        <button className="dimension-action-btn cancel" onClick={handleCloseEditView} disabled={isSavingDimension}>
          取消
        </button>
        <button
          className="dimension-action-btn save"
          onClick={handleSaveDimension}
          disabled={isSavingDimension || !editForm.name.trim() || !editForm.description.trim()}
        >
          {isSavingDimension ? '保存中...' : '保存'}
        </button>
      </div>
    </>
  );
});

export {
  DimensionFloatPanel,
  DimensionTagItem,
  DimensionListView,
  DimensionDetailView,
  DimensionEditView,
};

export default DimensionFloatPanel;
