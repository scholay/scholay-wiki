/**
 * AI维度分析面板组件
 * 悬浮面板，用于选择和管理分析维度
 */
import React, { memo } from 'react';

/**
 * 维度面板组件
 */
const AIDimensionPanel = memo(({
  dimensions,
  selectedDimensions,
  floatPanelExpanded,
  floatPanelView,
  editingDimension,
  viewingDimension,
  editForm,
  getDimensionKey,
  onPanelExpand,
  onPanelCollapse,
  onDimensionToggle,
  onViewDimension,
  onEditDimension,
  onSaveDimension,
  onDeleteDimension,
  onBackToList,
  onEditFormChange,
}) => {
  return (
    <div
      className={`dimension-float-panel ${selectedDimensions.length > 0 && !floatPanelExpanded ? 'collapsed' : ''} ${floatPanelExpanded ? 'expanded' : ''}`}
      onMouseEnter={onPanelExpand}
      onMouseLeave={onPanelCollapse}
    >
      {/* 收起状态的侧边标签 */}
      <div className="dimension-float-collapsed-tab">
        <span>智能矩阵分析</span>
      </div>

      {/* 展开状态的完整内容 */}
      <div className="dimension-float-content">
        {floatPanelView === 'list' && (
          <>
            {/* 列表视图 */}
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
                  <div key={getDimensionKey(dim)} className={`dimension-tag-row ${isCustom ? 'custom' : ''}`}>
                    <button
                      className={`dimension-tag-btn ${isSelected ? 'selected' : ''} ${isCustom ? 'custom' : ''}`}
                      onClick={() => onDimensionToggle(dim)}
                      title={isSelected ? `点击移除 ${dim.name}` : dim.description}
                    >
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                      <span className="dimension-tag-name">{dim.name}</span>
                    </button>
                    <div className="dimension-tag-actions">
                      <button
                        className="dimension-tag-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDimension(dim);
                        }}
                        title="查看维度详情"
                      >
                        详情
                      </button>
                      <button
                        className="dimension-tag-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditDimension(dim);
                        }}
                        title={isCustom ? "编辑维度" : "自定义此维度"}
                      >
                        修改
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* 底部统计和新增按钮 */}
            <div className="dimension-float-footer">
              <div className="dimension-float-stats">
                已选 {selectedDimensions.length} / 共 {dimensions.length} 个
                {dimensions.filter(d => d.userId > 0).length > 0 && (
                  <span className="custom-count">（自定义 {dimensions.filter(d => d.userId > 0).length} 个）</span>
                )}
              </div>
              <button
                className="dimension-add-btn"
                onClick={() => onEditDimension(null)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                新增
              </button>
            </div>
          </>
        )}

        {floatPanelView === 'detail' && viewingDimension && (
          <>
            {/* 详情视图 */}
            <div className="dimension-detail-header">
              <button
                className="dimension-detail-back"
                onClick={onBackToList}
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
                <div className="dimension-detail-label">分析提示词</div>
                <div className="dimension-detail-value">
                  {viewingDimension?.description || '使用默认分析逻辑'}
                </div>
              </div>
            </div>
            <div className="dimension-detail-actions">
              <button
                className="dimension-action-btn edit"
                onClick={() => onEditDimension(viewingDimension)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                {viewingDimension?.userId > 0 ? '编辑' : '自定义'}
              </button>
              {viewingDimension?.userId > 0 && (
                <button
                  className="dimension-action-btn delete"
                  onClick={() => onDeleteDimension(viewingDimension)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                  删除
                </button>
              )}
            </div>
          </>
        )}

        {(floatPanelView === 'create' || floatPanelView === 'edit') && (
          <>
            {/* 编辑/新增视图 */}
            <div className="dimension-detail-header">
              <button
                className="dimension-detail-back"
                onClick={onBackToList}
              >
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
                  onChange={(e) => onEditFormChange({ ...editForm, name: e.target.value })}
                  maxLength={50}
                />
              </div>
              <div className="dimension-form-group">
                <label className="dimension-form-label">分析指令</label>
                <textarea
                  className="dimension-form-textarea"
                  placeholder="输入 AI 分析时使用的指令..."
                  value={editForm.description}
                  onChange={(e) => onEditFormChange({ ...editForm, description: e.target.value })}
                  rows={5}
                />
              </div>
            </div>
            <div className="dimension-edit-actions">
              <button
                className="dimension-action-btn cancel"
                onClick={onBackToList}
              >
                取消
              </button>
              <button
                className="dimension-action-btn save"
                onClick={onSaveDimension}
                disabled={!editForm.name.trim() || !editForm.description.trim()}
              >
                保存
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

AIDimensionPanel.displayName = 'AIDimensionPanel';

export default AIDimensionPanel;
