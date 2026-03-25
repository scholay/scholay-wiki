/**
 * 搜索结果列表视图组件
 * 包含论文列表和维度分析面板
 */
import React from 'react';
import { Pagination } from 'antd';
import { usePaperTranslation } from '../../hooks';
import PaperRow from './components/PaperRow';
import { DimensionFloatPanel } from './components/DimensionPanel';
import DeleteConfirmModal from './components/DeleteConfirmModal';

const SearchResultsListView = ({ searchState, dimensionAnalysis, startIndex, totalPages, pdfAvailability }) => {
  const {
    papers,
    total,
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
    isAuthenticated,
    setShowAuthModal,
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
    enqueuePaperAnalysis,
    deleteConfirmDimension,
    isDeleting,
    confirmDeleteDimension,
    cancelDeleteDimension,
  } = dimensionAnalysis;

  const translation = usePaperTranslation();

  return (
    <>
      <div className={`unified-results-table ${selectedDimensions.length > 0 ? 'has-analysis' : ''}`}>
        <div className="unified-table-header">
          <div className="unified-header-info">
            <span className="hint-text">
              共找到 <strong>{total.toLocaleString()}</strong> 个结果
            </span>
          </div>

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
                translation={translation}
                isAuthenticated={isAuthenticated}
                setShowAuthModal={setShowAuthModal}
                enqueuePaperAnalysis={enqueuePaperAnalysis}
                shouldAnalyze={selectedDimensions.length > 0}
                pdfAvailability={pdfAvailability}
              />
            );
          })}
        </div>
      </div>

      {total > 0 && (
        <div className="antd-pagination-wrapper">
          <Pagination
            current={currentPage}
            total={total}
            pageSize={papersPerPage}
            onChange={handlePageChange}
            onShowSizeChange={(_, size) => handlePageSizeChange(size)}
            showSizeChanger
            pageSizeOptions={['20', '50']}
            showTotal={(t) => `共 ${t.toLocaleString()} 篇`}
            size="small"
          />
        </div>
      )}

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
      
      {deleteConfirmDimension && (
        <DeleteConfirmModal
          dimension={deleteConfirmDimension}
          isDeleting={isDeleting}
          onConfirm={confirmDeleteDimension}
          onCancel={cancelDeleteDimension}
        />
      )}
    </>
  );
};

export default SearchResultsListView;
