/**
 * 搜索结果列表视图组件
 * 包含论文列表和维度分析面板
 */
import React, { memo } from 'react';
import Pagination from '../../components/Pagination';
import AnalysisCellText from '../../components/AnalysisCellText';

const SearchResultsListView = ({ searchState, dimensionAnalysis, startIndex, totalPages }) => {
  const {
    papers,
    total,
    queryInfo,
    filters,
    selectedPaper,
    setSelectedPaper,
    setCitePaper,
    expandedTldr,
    expandedAbstract,
    showAbstractMode,
    setShowAbstractMode,
    toggleTldrExpand,
    toggleAbstractExpand,
    currentPage,
    papersPerPage,
    handlePageChange,
    handlePageSizeChange,
    handlePaperClick,
    performSearch,
  } = searchState;

  const {
    dimensions,
    selectedDimensions,
    analysisResults,
    analyzingPapers,
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
  } = dimensionAnalysis;

  return (
    <>
      {/* 统一表格结构 */}
      <div className={`unified-results-table ${selectedDimensions.length > 0 ? 'has-analysis' : ''}`}>
        {/* 表格表头行 */}
        <div className="unified-table-header">
          {/* 第一列：搜索结果提示 */}
          <div className="unified-header-info">
            {queryInfo.translationEnabled && queryInfo.translatedQuery &&
             queryInfo.searchStrategy !== 'original' &&
             queryInfo.originalQuery !== queryInfo.translatedQuery ? (
              <>
                {(queryInfo.searchStrategy === 'combined' || !queryInfo.searchStrategy) && (
                  <>
                    <span className="hint-text">
                      共找到 <strong>{total.toLocaleString()}</strong> 个 "
                      <span className="hint-query-original" title={queryInfo.originalQuery}>
                        {queryInfo.originalQuery}
                      </span>
                      {' '}
                      <span className="hint-query-translated" title={queryInfo.translatedQuery}>
                        {queryInfo.translatedQuery}
                      </span>
                      " 的结果
                    </span>
                    <button
                      className="hint-action-btn"
                      onClick={() => performSearch(queryInfo.originalQuery, filters, 1, false, false)}
                      title={`仅按 "${queryInfo.originalQuery}" 查找`}
                    >
                      仅按 "<span className="hint-btn-query" title={queryInfo.originalQuery}>{queryInfo.originalQuery}</span>" 查找
                    </button>
                  </>
                )}
                {queryInfo.searchStrategy === 'translated' && (
                  <>
                    <span className="hint-text">
                      共找到 <strong>{total.toLocaleString()}</strong> 个 "
                      <span className="hint-query-translated" title={queryInfo.translatedQuery}>
                        {queryInfo.translatedQuery}
                      </span>
                      " 的结果
                    </span>
                    <span className="hint-fallback-notice">
                      原始词 "<span className="hint-query-highlight">{queryInfo.originalQuery}</span>" 无结果，已使用翻译词搜索
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="hint-text">
                共找到 <strong>{total.toLocaleString()}</strong> 个结果
              </span>
            )}
          </div>

          {/* 分析维度列头 */}
          {selectedDimensions.length > 0 && (
            <div className="unified-header-dims">
              {selectedDimensions.map(dim => (
                <div key={getDimensionKey(dim)} className="unified-header-dim">
                  <span className="dim-header-name">{dim.name}</span>
                  <button
                    className="dim-header-remove-btn"
                    onClick={() => handleDimensionToggle(dim)}
                    title={`移除 ${dim.name} 维度`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 表格内容区域 */}
        <div className="unified-table-body">
          {papers.map((paper, index) => {
            const paperResults = analysisResults[paper.paperId];
            const isAnalyzing = analyzingPapers[paper.paperId];
            const hasError = paperResults?._error;

            return (
              <PaperRow
                key={paper.paperId}
                paper={paper}
                index={index}
                startIndex={startIndex}
                selectedPaper={selectedPaper}
                setSelectedPaper={setSelectedPaper}
                setCitePaper={setCitePaper}
                expandedTldr={expandedTldr}
                expandedAbstract={expandedAbstract}
                showAbstractMode={showAbstractMode}
                setShowAbstractMode={setShowAbstractMode}
                toggleTldrExpand={toggleTldrExpand}
                toggleAbstractExpand={toggleAbstractExpand}
                handlePaperClick={handlePaperClick}
                selectedDimensions={selectedDimensions}
                getDimensionKey={getDimensionKey}
                paperResults={paperResults}
                isAnalyzing={isAnalyzing}
                hasError={hasError}
              />
            );
          })}
        </div>
      </div>

      {/* 分页器 */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={papersPerPage}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      {/* 右侧悬浮面板 - AI 分析维度入口 */}
      {papers.length > 0 && (
        <DimensionFloatPanel
          dimensions={dimensions}
          selectedDimensions={selectedDimensions}
          floatPanelExpanded={floatPanelExpanded}
          setFloatPanelExpanded={setFloatPanelExpanded}
          floatPanelView={floatPanelView}
          setFloatPanelView={setFloatPanelView}
          viewingDimension={viewingDimension}
          setViewingDimension={setViewingDimension}
          editingDimension={editingDimension}
          editForm={editForm}
          setEditForm={setEditForm}
          isSavingDimension={isSavingDimension}
          getDimensionKey={getDimensionKey}
          handleDimensionToggle={handleDimensionToggle}
          handleOpenEditView={handleOpenEditView}
          handleCloseEditView={handleCloseEditView}
          handleSaveDimension={handleSaveDimension}
          handleDeleteDimension={handleDeleteDimension}
        />
      )}
    </>
  );
};

// 论文行组件 - 使用 memo 优化，避免不必要的重渲染
const PaperRow = memo(({
  paper,
  index,
  startIndex,
  selectedPaper,
  setSelectedPaper,
  setCitePaper,
  expandedTldr,
  expandedAbstract,
  showAbstractMode,
  setShowAbstractMode,
  toggleTldrExpand,
  toggleAbstractExpand,
  handlePaperClick,
  selectedDimensions,
  getDimensionKey,
  paperResults,
  isAnalyzing,
  hasError,
}) => {
  const hasTldr = paper.tldr?.text;
  const hasAbstract = paper.abstract;
  const currentMode = showAbstractMode[paper.paperId] || (hasTldr ? 'tldr' : 'abstract');
  const showTldr = currentMode === 'tldr' && hasTldr;
  const showAbstract = currentMode === 'abstract' && hasAbstract;
  const content = showTldr ? paper.tldr.text : (showAbstract ? paper.abstract : '');
  const isExpanded = showTldr ? expandedTldr[paper.paperId] : expandedAbstract[paper.paperId];

  return (
    <div
      className={`unified-table-row ${selectedPaper?.paperId === paper.paperId ? 'selected' : ''}`}
      data-paper-index={index}
    >
      {/* 论文信息列 */}
      <div className="unified-cell-paper">
        <div className="search-result-paper-number">{startIndex + index}</div>
        <div className="search-result-paper-content">
          <h3
            className="search-result-paper-title"
            onClick={() => handlePaperClick(paper)}
          >
            {paper.title}
          </h3>

          {/* 作者列表 */}
          {paper.authors && paper.authors.length > 0 && (
            <div className="search-result-paper-authors-row">
              <div className="search-result-paper-author-tags">
                {paper.authors.slice(0, 4).map((author, idx) => (
                  <span key={idx} className="author-tag">{author.name}</span>
                ))}
                {paper.authors.length > 4 && (
                  <span className="author-tag author-more">+{paper.authors.length - 4} authors</span>
                )}
              </div>
              {paper.fieldsOfStudy && paper.fieldsOfStudy.length > 0 && (
                <span className="search-result-paper-fields">
                  {paper.fieldsOfStudy.slice(0, 2).join(', ')}
                </span>
              )}
            </div>
          )}

          {/* 期刊/会议 + 日期 */}
          {(paper.venue || paper.publicationDate || paper.year) && (
            <p className="search-result-paper-venue-date">
              {paper.venue && (
                <span className="search-result-venue-name">{paper.venue}</span>
              )}
              {paper.venue && (paper.publicationDate || paper.year) && ' · '}
              {(paper.publicationDate || paper.year) && (
                <span className="pub-date pub-year">
                  {paper.publicationDate
                    ? new Date(paper.publicationDate).getFullYear()
                    : paper.year}
                </span>
              )}
            </p>
          )}

          {/* TLDR / 摘要 */}
          {(hasTldr || hasAbstract) && (
            <div className="paper-summary-section">
              <div className="paper-summary-header">
                <span className={`summary-label ${showTldr ? 'tldr' : 'abstract'}`}>
                  {showTldr ? 'TLDR' : 'Abstract'}
                </span>
                {hasTldr && hasAbstract && (
                  <button
                    className="summary-toggle-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAbstractMode(prev => ({
                        ...prev,
                        [paper.paperId]: currentMode === 'tldr' ? 'abstract' : 'tldr'
                      }));
                    }}
                  >
                    {showTldr ? '显示摘要' : '显示TLDR'}
                  </button>
                )}
              </div>
              <span className="summary-text">
                {isExpanded || content.length <= 120
                  ? content
                  : content.substring(0, 100) + '...'}
              </span>
              {content.length > 120 && (
                <button
                  className="expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showTldr) {
                      toggleTldrExpand(paper.paperId);
                    } else {
                      toggleAbstractExpand(paper.paperId);
                    }
                  }}
                >
                  {isExpanded ? '收起' : '展开'}
                </button>
              )}
            </div>
          )}

          {/* 底部元信息和操作 */}
          <div className="search-result-paper-meta">
            {paper.citationCount !== undefined && (
              <>
                <span className="citation-count">
                  <span className="citation-number">{paper.citationCount}</span>
                  <span className="citation-label">被引</span>
                </span>
                <span className="meta-divider"></span>
              </>
            )}

            {paper.externalIds?.DOI && (
              <a
                href={`https://doi.org/${paper.externalIds.DOI}`}
                target="_blank"
                rel="noopener noreferrer"
                className="search-result-paper-doi-link"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                </svg>
                DOI
              </a>
            )}

            {paper.openAccessPdf && paper.openAccessPdf.url && (
              <a
                href={paper.openAccessPdf.url}
                target="_blank"
                rel="noopener noreferrer"
                className="meta-item pdf-link"
                onClick={(e) => e.stopPropagation()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
                PDF
              </a>
            )}

            <button
              className="search-result-paper-cite-btn"
              onClick={(e) => {
                e.stopPropagation();
                setCitePaper(paper);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 21V10M16 21V10"/>
              </svg>
              Cite
            </button>
          </div>
        </div>
      </div>

      {/* 分析结果列 */}
      {selectedDimensions.length > 0 && (
        <div className="unified-cell-analysis">
          {selectedDimensions.map(dim => {
            const dimKey = getDimensionKey(dim);
            const result = paperResults?.[dimKey];
            const resultText = typeof result === 'string' ? result : (result ? JSON.stringify(result) : '');

            return (
              <div key={dimKey} className="unified-analysis-cell">
                {isAnalyzing ? (
                  <div className="analysis-cell-loading">
                    <div className="analysis-cell-spinner"></div>
                  </div>
                ) : (!paper.abstract && !paper.tldr?.text) ? (
                  <span className="analysis-cell-na">无摘要</span>
                ) : hasError ? (
                  <span className="analysis-cell-error" title={paperResults._message}>分析失败</span>
                ) : result ? (
                  <AnalysisCellText text={resultText} />
                ) : paperResults ? (
                  <span className="analysis-cell-na">-</span>
                ) : (
                  <span className="analysis-cell-pending">等待分析...</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

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
      onMouseLeave={() => setFloatPanelExpanded(false)}
    >
      {/* 收起状态的侧边标签 */}
      <div className="dimension-float-collapsed-tab">
        <span>智能矩阵分析</span>
      </div>

      {/* 展开状态的完整内容 */}
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

// 维度列表视图
const DimensionListView = memo(({
  dimensions,
  selectedDimensions,
  getDimensionKey,
  handleDimensionToggle,
  setViewingDimension,
  setFloatPanelView,
  handleOpenEditView,
}) => {
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
            <div key={getDimensionKey(dim)} className={`dimension-tag-row ${isCustom ? 'custom' : ''}`}>
              <button
                className={`dimension-tag-btn ${isSelected ? 'selected' : ''} ${isCustom ? 'custom' : ''}`}
                onClick={() => handleDimensionToggle(dim)}
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
                    setViewingDimension(dim);
                    setFloatPanelView('detail');
                  }}
                  title="查看维度详情"
                >
                  详情
                </button>
                <button
                  className="dimension-tag-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenEditView(dim);
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
      <div className="dimension-float-footer">
        <div className="dimension-float-stats">
          已选 {selectedDimensions.length} / 共 {dimensions.length} 个
          {dimensions.filter(d => d.userId > 0).length > 0 && (
            <span className="custom-count">（自定义 {dimensions.filter(d => d.userId > 0).length} 个）</span>
          )}
        </div>
        <button
          className="dimension-add-btn"
          onClick={() => handleOpenEditView(null)}
        >
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
        <button
          className="dimension-action-btn edit"
          onClick={() => handleOpenEditView(viewingDimension)}
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
            onClick={() => handleDeleteDimension(viewingDimension)}
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
        <button
          className="dimension-detail-back"
          onClick={handleCloseEditView}
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
        <button
          className="dimension-action-btn cancel"
          onClick={handleCloseEditView}
          disabled={isSavingDimension}
        >
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

export default SearchResultsListView;
