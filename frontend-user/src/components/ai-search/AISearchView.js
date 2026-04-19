/**
 * AI智能搜索视图组件 (重构版)
 * 主协调组件，整合所有子组件和 Hooks
 */
import React, { Suspense, lazy, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
// 子组件
import AIPaperList from './AIPaperList';
import AIHistoryDropdown from './AIHistoryDropdown';
import CiteModal from '../search/CiteModal';
import AIDimensionPanel from './AIDimensionPanel';
import AIConversationContent from './AIConversationContent';
import AISearchInput from './AISearchInput';
import PaperPreview from '../search/PaperPreview';
import { usePdfAvailability } from '../../hooks/usePdfAvailability';

// Hooks
import { useAISearch } from './hooks/useAISearch';
import { useAIPaperAnalysis } from './hooks/useAIPaperAnalysis';
import { useAIStreamSearch } from './hooks/useAIStreamSearch';
import { useAIConversation } from './hooks/useAIConversation';
import { useAIScrollManager } from './hooks/useAIScrollManager';
import { useAICitationHighlight } from './hooks/useAICitationHighlight';

// 样式
import '../QACard.css';
import '../../pages/styles/search-results/papers.css';
import '../../pages/styles/advanced-search/index.css';

// 懒加载组件
const AuthModal = lazy(() => import('../auth/AuthModal'));

/**
 * AI智能搜索视图组件
 */
const AISearchView = () => {
  const navigate = useNavigate();

  // 核心状态管理
  const aiSearch = useAISearch();

  // 论文推屏状态
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [showPaperDrawer, setShowPaperDrawer] = useState(false);

  // PDF 可用性管理
  const pdfAvailability = usePdfAvailability();

  // 处理论文点击 - 打开推屏
  const handlePaperClick = useCallback((paper) => {
    setSelectedPaper(paper);
    setShowPaperDrawer(true);
    // 同时取消高亮
    aiSearch.setHighlightedPaperIndex(null);
  }, [aiSearch]);

  // 关闭论文推屏
  const handleClosePaperDrawer = useCallback(() => {
    setShowPaperDrawer(false);
    setSelectedPaper(null);
  }, []);

  // 处理获取PDF按钮点击
  const handleGetPdf = useCallback((paper) => {
    const doi = paper.externalIds?.DOI;
    if (doi) {
      // 标记需要打开 PDF tab
      pdfAvailability.markPdfRequest(paper.paperId, doi);
    }
    // 打开论文推屏
    handlePaperClick(paper);
  }, [pdfAvailability, handlePaperClick]);

  // 论文分析
  useAIPaperAnalysis({
    papers: aiSearch.papers,
    selectedDimensions: aiSearch.selectedDimensions,
    analysisResults: aiSearch.analysisResults,
    analyzingPapers: aiSearch.analyzingPapers,
    totalDeducted: aiSearch.totalDeducted,
    analysisAbortedRef: aiSearch.analysisAbortedRef,
    isAuthenticated: aiSearch.isAuthenticated,
    setAnalysisResults: aiSearch.setAnalysisResults,
    setAnalyzingPapers: aiSearch.setAnalyzingPapers,
    setTotalDeducted: aiSearch.setTotalDeducted,
  });

  // 流式搜索
  const streamSearch = useAIStreamSearch({
    currentConversationId: aiSearch.currentConversationId,
    modelLevel: aiSearch.modelLevel,
    isAuthenticated: aiSearch.isAuthenticated,
    eventSourceRef: aiSearch.eventSourceRef,
    streamingContentRef: aiSearch.streamingContentRef,
    textareaRef: aiSearch.textareaRef,
    setCurrentConversationId: aiSearch.setCurrentConversationId,
    setMessages: aiSearch.setMessages,
    setLoading: aiSearch.setLoading,
    setIsStreaming: aiSearch.setIsStreaming,
    setStreamingContent: aiSearch.setStreamingContent,
    setShowAIThinking: aiSearch.setShowAIThinking,
    setPapers: aiSearch.setPapers,
    setPapersTotal: aiSearch.setPapersTotal,
    setPaperSets: aiSearch.setPaperSets,
    setSearchQuery: aiSearch.setSearchQuery,
    setConversations: aiSearch.setConversations,
    setShowAuthModal: aiSearch.setShowAuthModal,
    setIsLoadingSuggestedQuestions: aiSearch.setIsLoadingSuggestedQuestions,
    loadConversations: aiSearch.loadConversations,
    extractSuggestedQuestions: aiSearch.extractSuggestedQuestions,
    // 分页相关
    setAllPaperIds: aiSearch.setAllPaperIds,
    setLoadedPaperCount: aiSearch.setLoadedPaperCount,
    // 思考步骤相关
    addThinkingStep: aiSearch.addThinkingStep,
    clearThinkingSteps: aiSearch.clearThinkingSteps,
  });

  // 滚动管理
  const scrollManager = useAIScrollManager({
    messages: aiSearch.messages,
    isStreaming: aiSearch.isStreaming,
    streamingContent: aiSearch.streamingContent,
    autoScroll: aiSearch.autoScroll,
    disableSnapTemporarily: aiSearch.disableSnapTemporarily,
    isLoadingSuggestedQuestions: aiSearch.isLoadingSuggestedQuestions,
    paperSets: aiSearch.paperSets,
    expandedQAIndex: aiSearch.expandedQAIndex,
    activeTab: aiSearch.activeTab,
    manualTabSwitch: aiSearch.manualTabSwitch,
    messagePagination: aiSearch.messagePagination,
    qaSnapContainerRef: aiSearch.qaSnapContainerRef,
    lastScrollTimeRef: aiSearch.lastScrollTimeRef,
    prevIsLoadingSuggestedRef: aiSearch.prevIsLoadingSuggestedRef,
    prevMessageCountRef: aiSearch.prevMessageCountRef,
    setAutoScroll: aiSearch.setAutoScroll,
    setDisableSnapTemporarily: aiSearch.setDisableSnapTemporarily,
    setExpandedQAIndex: aiSearch.setExpandedQAIndex,
    setActiveTab: aiSearch.setActiveTab,
    setManualTabSwitch: aiSearch.setManualTabSwitch,
    setPapers: aiSearch.setPapers,
    setPapersTotal: aiSearch.setPapersTotal,
    setPaperSets: aiSearch.setPaperSets,
    setPaperSwitchingLoading: aiSearch.setPaperSwitchingLoading,
    setAllPaperIds: aiSearch.setAllPaperIds,
    setLoadedPaperCount: aiSearch.setLoadedPaperCount,
    loadMoreMessages: () => {},
  });

  // 对话管理
  const conversationManager = useAIConversation({
    messages: aiSearch.messages,
    conversations: aiSearch.conversations,
    currentConversationId: aiSearch.currentConversationId,
    isAuthenticated: aiSearch.isAuthenticated,
    authLoading: aiSearch.authLoading,
    loading: aiSearch.loading,
    qaSnapContainerRef: aiSearch.qaSnapContainerRef,
    prevScrollHeightRef: aiSearch.prevScrollHeightRef,
    isLoadingHistoryRef: aiSearch.isLoadingHistoryRef,
    hasLoadedConversationsRef: aiSearch.hasLoadedConversationsRef,
    hasInitializedFromURLRef: aiSearch.hasInitializedFromURLRef,
    setCurrentConversationId: aiSearch.setCurrentConversationId,
    setMessages: aiSearch.setMessages,
    setMessagePagination: aiSearch.setMessagePagination,
    setLoading: aiSearch.setLoading,
    setModelLevel: aiSearch.setModelLevel,
    setStreamingContent: aiSearch.setStreamingContent,
    setPapers: aiSearch.setPapers,
    setPapersTotal: aiSearch.setPapersTotal,
    setPaperSets: aiSearch.setPaperSets,
    setSearchQuery: aiSearch.setSearchQuery,
    setSearchParams: aiSearch.setSearchParams,
    organizeMessagesByParentId: aiSearch.organizeMessagesByParentId,
    extractSuggestedQuestions: aiSearch.extractSuggestedQuestions,
    loadConversations: aiSearch.loadConversations,
    handleInitialSearch: streamSearch.handleInitialSearch,
    scrollToBottom: scrollManager.scrollToBottom,
    // 分页相关
    setAllPaperIds: aiSearch.setAllPaperIds,
    setLoadedPaperCount: aiSearch.setLoadedPaperCount,
  });

  // 引文高亮
  const citationHighlight = useAICitationHighlight({
    messages: aiSearch.messages,
    paperSets: aiSearch.paperSets,
    activeTab: aiSearch.activeTab,
    highlightedPaperIndex: aiSearch.highlightedPaperIndex,
    setHighlightedPaperIndex: aiSearch.setHighlightedPaperIndex,
    setActiveTab: aiSearch.setActiveTab,
    setManualTabSwitch: aiSearch.setManualTabSwitch,
    setScrollToPaperIndex: aiSearch.setScrollToPaperIndex,
  });

  // 加载维度列表
  useEffect(() => {
    if (aiSearch.isAuthenticated && !aiSearch.hasLoadedDimensionsRef.current) {
      aiSearch.hasLoadedDimensionsRef.current = true;
      aiSearch.loadDimensions();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiSearch.isAuthenticated, aiSearch.hasLoadedDimensionsRef, aiSearch.loadDimensions]);

  // 处理维度面板操作
  const handleViewDimension = (dim) => {
    aiSearch.setViewingDimension(dim);
    aiSearch.setFloatPanelView('detail');
  };

  const handleBackToList = () => {
    aiSearch.setFloatPanelView('list');
    aiSearch.setViewingDimension(null);
    aiSearch.setEditingDimension(null);
  };

  return (
    <div className="as-results-layout search-results-page ai-search-view-embedded">
      {/* 顶部导航栏 + 主内容区 */}
      <div className="results-layout">
        {/* 顶部导航栏 */}
        <div className="results-search-header ai-results-header">
          {/* 左侧 Logo */}
          <div className="results-logo" onClick={() => navigate('/')}>
            <img src="/brand-text.svg" alt="Scholay" className="results-brand-text" />
          </div>

          {/* 标题区域 */}
          <div className="ai-header-title-area">
            {aiSearch.currentConversationTitle ? (
              <h1 className="ai-conversation-title">{aiSearch.currentConversationTitle}</h1>
            ) : (
              <h1 className="ai-conversation-title ai-title-default">智能分析</h1>
            )}
          </div>
        </div>

        {/* 主内容区 - 两栏布局 */}
        <div className="results-main ai-results-main">
          {/* 左侧：论文列表容器 */}
          <div
            className={`papers-container ${aiSearch.selectedDimensions.length > 0 ? 'has-analysis has-collapsed-panel' : ''}`}
            ref={aiSearch.papersContainerRef}
          >
            <AIPaperList
              papers={aiSearch.papers}
              loading={aiSearch.loading}
              paperSwitchingLoading={aiSearch.paperSwitchingLoading}
              total={aiSearch.papersTotal}
              highlightedPaperIndex={aiSearch.highlightedPaperIndex}
              scrollToPaperIndex={aiSearch.scrollToPaperIndex}
              onScrollComplete={() => aiSearch.setScrollToPaperIndex(null)}
              onPaperClick={handlePaperClick}
              onCite={(paper) => aiSearch.setCitePaper(paper)}
              selectedDimensions={aiSearch.selectedDimensions}
              analysisResults={aiSearch.analysisResults}
              analyzingPapers={aiSearch.analyzingPapers}
              getDimensionKey={aiSearch.getDimensionKey}
              onDimensionRemove={aiSearch.handleDimensionToggle}
              isAuthenticated={aiSearch.isAuthenticated}
              onRequireAuth={() => aiSearch.setShowAuthModal(true)}
              pdfAvailability={pdfAvailability}
              onGetPdf={handleGetPdf}
              // 分页相关
              hasMorePapers={aiSearch.hasMorePapers}
              loadingMorePapers={aiSearch.loadingMorePapers}
              onLoadMore={aiSearch.loadMorePapers}
              loadedPaperCount={aiSearch.loadedPaperCount}
            />

            {/* 维度面板 */}
            {aiSearch.papers.length > 0 && (
              <AIDimensionPanel
                dimensions={aiSearch.dimensions}
                selectedDimensions={aiSearch.selectedDimensions}
                floatPanelExpanded={aiSearch.floatPanelExpanded}
                floatPanelView={aiSearch.floatPanelView}
                editingDimension={aiSearch.editingDimension}
                viewingDimension={aiSearch.viewingDimension}
                editForm={aiSearch.editForm}
                getDimensionKey={aiSearch.getDimensionKey}
                onPanelExpand={() => aiSearch.setFloatPanelExpanded(true)}
                onPanelCollapse={() => {
                  // 在编辑/新增模式下不自动折叠面板
                  if (aiSearch.floatPanelView !== 'create' && aiSearch.floatPanelView !== 'edit') {
                    aiSearch.setFloatPanelExpanded(false);
                  }
                }}
                onDimensionToggle={aiSearch.handleDimensionToggle}
                onViewDimension={handleViewDimension}
                onEditDimension={aiSearch.handleOpenEditView}
                onSaveDimension={aiSearch.handleSaveDimension}
                onDeleteDimension={aiSearch.handleDeleteDimension}
                onBackToList={handleBackToList}
                onEditFormChange={aiSearch.setEditForm}
              />
            )}
          </div>

          {/* 右侧：AI聊天区域 */}
          <div className="ai-chat-panel">
            {/* 对话面板顶部操作栏 */}
            <div className="ai-chat-header ai-chat-header-compact">
              {/* 新建对话按钮 */}
              <button
                className="ai-header-icon-btn"
                onClick={aiSearch.handleNewConversation}
                title="新建对话"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* 历史记录按钮 */}
              <AIHistoryDropdown
                conversations={aiSearch.conversations}
                currentConversationId={aiSearch.currentConversationId}
                onSelectConversation={conversationManager.handleSelectConversation}
                onDeleteConversation={aiSearch.handleDeleteConversation}
                onNewConversation={aiSearch.handleNewConversation}
                loading={aiSearch.conversationsLoading}
                iconOnly={true}
              />
            </div>

            {/* 问答滚动容器 */}
            <AIConversationContent
              ref={aiSearch.qaSnapContainerRef}
              qaList={aiSearch.qaList}
              loading={aiSearch.loading}
              isStreaming={aiSearch.isStreaming}
              streamingContent={aiSearch.streamingContent}
              showAIThinking={aiSearch.showAIThinking}
              thinkingSteps={aiSearch.thinkingSteps}
              currentConversationId={aiSearch.currentConversationId}
              expandedQAIndex={aiSearch.expandedQAIndex}
              messagePagination={aiSearch.messagePagination}
              isLoadingSuggestedQuestions={aiSearch.isLoadingSuggestedQuestions}
              fromAcademicSearch={aiSearch.fromAcademicSearch}
              disableSnapTemporarily={aiSearch.disableSnapTemporarily}
              onScroll={scrollManager.handleQAContainerScroll}
              onLoadMore={() => conversationManager.loadMoreMessages(aiSearch.messagePagination)}
              onCitationHover={citationHighlight.handleCitationHover}
              onCitationLeave={citationHighlight.handleCitationLeave}
              onCitationClick={citationHighlight.handleCitationClick}
              onFollowUpClick={streamSearch.handleFollowUpQuestionClick}
            />

            {/* 底部输入框（含推荐问题芯片） */}
            <AISearchInput
              ref={aiSearch.textareaRef}
              searchQuery={aiSearch.searchQuery}
              loading={aiSearch.loading}
              isComposing={aiSearch.isComposing}
              isStreaming={aiSearch.isStreaming}
              onSearchChange={aiSearch.setSearchQuery}
              onCompositionStart={() => aiSearch.setIsComposing(true)}
              onCompositionEnd={() => aiSearch.setIsComposing(false)}
              onSubmit={streamSearch.handleSearch}
              suggestedQuestions={aiSearch.qaList.length > 0 ? aiSearch.qaList[aiSearch.qaList.length - 1]?.suggestedQuestions : []}
              onSuggestionClick={streamSearch.handleFollowUpQuestionClick}
            />
          </div>
        </div>
      </div>

      {/* 登录弹窗 */}
      {aiSearch.showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={aiSearch.showAuthModal}
            onClose={() => aiSearch.setShowAuthModal(false)}
            onSuccess={() => {
              aiSearch.setShowAuthModal(false);
              if (aiSearch.searchQuery.trim()) {
                streamSearch.handleSearch({ preventDefault: () => {} });
              }
            }}
          />
        </Suspense>
      )}

      {/* 引用弹窗 */}
      {aiSearch.citePaper && (
        <CiteModal
          paper={aiSearch.citePaper}
          onClose={() => aiSearch.setCitePaper(null)}
        />
      )}

      {/* 论文详情推屏 */}
      {showPaperDrawer && selectedPaper && (
        <div className="paper-drawer-overlay" onClick={handleClosePaperDrawer}>
          <div className="paper-drawer" onClick={(e) => e.stopPropagation()}>
            <PaperPreview
              paper={selectedPaper}
              onClose={handleClosePaperDrawer}
              isDrawerMode={true}
              pdfAvailability={pdfAvailability}
              entryPoint="smart_search"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AISearchView;
