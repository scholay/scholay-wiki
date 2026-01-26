/**
 * AI搜索核心状态管理 Hook
 * 使用组合模式将状态分组为多个子 Hook
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../utils/AuthContext';

// 子 Hooks
import { useConversationState } from './useConversationState';
import { useSearchState } from './useSearchState';
import { usePaperState } from './usePaperState';
import { useDimensionState } from './useDimensionState';
import { useUIState } from './useUIState';
import { useModalState } from './useModalState';

// 论文详情字段（后端期望数组格式）
const PAPER_FIELDS = ['paperId', 'title', 'authors', 'year', 'abstract', 'citationCount', 'venue', 'publicationDate', 'tldr', 'openAccessPdf', 'externalIds', 'isOpenAccess', 'fieldsOfStudy'];

/**
 * AI搜索核心 Hook
 * 管理对话、消息、论文、维度分析等状态
 */
export const useAISearch = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  // 搜索状态（包含 eventSourceRef）
  const searchState = useSearchState();

  // 对话状态
  const conversationState = useConversationState(searchState.eventSourceRef);

  // 论文状态
  const paperState = usePaperState();

  // 维度分析状态
  const dimensionState = useDimensionState(isAuthenticated);

  // UI 状态
  const uiState = useUIState();

  // 弹窗状态
  const modalState = useModalState();

  // 扩展新建对话方法以清空论文
  const handleNewConversation = () => {
    const result = conversationState.handleNewConversation();
    if (result?.shouldClearPapers) {
      paperState.clearPapers();
      searchState.setSearchQuery('');
      searchState.setStreamingContent('');
      searchState.setIsStreaming(false);
    }
  };

  // 清理 EventSource
  useEffect(() => {
    return () => {
      if (searchState.eventSourceRef.current) {
        searchState.eventSourceRef.current.close();
      }
    };
  }, [searchState.eventSourceRef]);

  return {
    // ========== 对话相关 ==========
    conversations: conversationState.conversations,
    conversationsLoading: conversationState.conversationsLoading,
    currentConversationId: conversationState.currentConversationId,
    messages: conversationState.messages,
    messagePagination: conversationState.messagePagination,
    qaList: conversationState.qaList,
    currentConversationTitle: conversationState.currentConversationTitle,
    searchParams: conversationState.searchParams,

    setConversations: conversationState.setConversations,
    setCurrentConversationId: conversationState.setCurrentConversationId,
    setMessages: conversationState.setMessages,
    setMessagePagination: conversationState.setMessagePagination,
    setSearchParams: conversationState.setSearchParams,

    organizeMessagesByParentId: conversationState.organizeMessagesByParentId,
    extractSuggestedQuestions: conversationState.extractSuggestedQuestions,
    loadConversations: conversationState.loadConversations,
    handleNewConversation,
    handleDeleteConversation: conversationState.handleDeleteConversation,

    // ========== 搜索相关 ==========
    searchQuery: searchState.searchQuery,
    loading: searchState.loading,
    isStreaming: searchState.isStreaming,
    streamingContent: searchState.streamingContent,
    showAIThinking: searchState.showAIThinking,
    modelLevel: searchState.modelLevel,

    setSearchQuery: searchState.setSearchQuery,
    setLoading: searchState.setLoading,
    setIsStreaming: searchState.setIsStreaming,
    setStreamingContent: searchState.setStreamingContent,
    setShowAIThinking: searchState.setShowAIThinking,
    setModelLevel: searchState.setModelLevel,

    eventSourceRef: searchState.eventSourceRef,
    streamingContentRef: searchState.streamingContentRef,
    textareaRef: searchState.textareaRef,

    // ========== 论文相关 ==========
    papers: paperState.papers,
    papersTotal: paperState.papersTotal,
    paperSets: paperState.paperSets,
    activeTab: paperState.activeTab,
    highlightedPaperIndex: paperState.highlightedPaperIndex,
    scrollToPaperIndex: paperState.scrollToPaperIndex,
    
    // 分页相关
    allPaperIds: paperState.allPaperIds,
    loadedPaperCount: paperState.loadedPaperCount,
    loadingMorePapers: paperState.loadingMorePapers,
    hasMorePapers: paperState.hasMorePapers,

    setPapers: paperState.setPapers,
    setPapersTotal: paperState.setPapersTotal,
    setPaperSets: paperState.setPaperSets,
    setActiveTab: paperState.setActiveTab,
    setHighlightedPaperIndex: paperState.setHighlightedPaperIndex,
    setScrollToPaperIndex: paperState.setScrollToPaperIndex,
    setAllPaperIds: paperState.setAllPaperIds,
    setLoadedPaperCount: paperState.setLoadedPaperCount,

    papersContainerRef: paperState.papersContainerRef,
    clearPapers: paperState.clearPapers,
    loadMorePapers: paperState.loadMorePapers,

    // ========== 维度分析相关 ==========
    dimensions: dimensionState.dimensions,
    selectedDimensions: dimensionState.selectedDimensions,
    analysisResults: dimensionState.analysisResults,
    analyzingPapers: dimensionState.analyzingPapers,
    totalDeducted: dimensionState.totalDeducted,
    floatPanelExpanded: dimensionState.floatPanelExpanded,
    floatPanelView: dimensionState.floatPanelView,
    editingDimension: dimensionState.editingDimension,
    viewingDimension: dimensionState.viewingDimension,
    editForm: dimensionState.editForm,

    setDimensions: dimensionState.setDimensions,
    setSelectedDimensions: dimensionState.setSelectedDimensions,
    setAnalysisResults: dimensionState.setAnalysisResults,
    setAnalyzingPapers: dimensionState.setAnalyzingPapers,
    setTotalDeducted: dimensionState.setTotalDeducted,
    setFloatPanelExpanded: dimensionState.setFloatPanelExpanded,
    setFloatPanelView: dimensionState.setFloatPanelView,
    setEditingDimension: dimensionState.setEditingDimension,
    setViewingDimension: dimensionState.setViewingDimension,
    setEditForm: dimensionState.setEditForm,

    analysisAbortedRef: dimensionState.analysisAbortedRef,
    hasLoadedDimensionsRef: dimensionState.hasLoadedDimensionsRef,

    getDimensionKey: dimensionState.getDimensionKey,
    loadDimensions: dimensionState.loadDimensions,
    refreshDimensions: dimensionState.refreshDimensions,
    handleDimensionToggle: dimensionState.handleDimensionToggle,
    handleSaveDimension: dimensionState.handleSaveDimension,
    handleDeleteDimension: dimensionState.handleDeleteDimension,
    handleOpenEditView: dimensionState.handleOpenEditView,
    handleCloseEditView: dimensionState.handleCloseEditView,

    // ========== UI 状态 ==========
    expandedQAIndex: uiState.expandedQAIndex,
    manualTabSwitch: uiState.manualTabSwitch,
    autoScroll: uiState.autoScroll,
    disableSnapTemporarily: uiState.disableSnapTemporarily,
    isLoadingSuggestedQuestions: uiState.isLoadingSuggestedQuestions,
    isComposing: uiState.isComposing,
    quota: uiState.quota,
    usage: uiState.usage,
    fromAcademicSearch: uiState.fromAcademicSearch,

    setExpandedQAIndex: uiState.setExpandedQAIndex,
    setManualTabSwitch: uiState.setManualTabSwitch,
    setAutoScroll: uiState.setAutoScroll,
    setDisableSnapTemporarily: uiState.setDisableSnapTemporarily,
    setIsLoadingSuggestedQuestions: uiState.setIsLoadingSuggestedQuestions,
    setIsComposing: uiState.setIsComposing,
    setQuota: uiState.setQuota,
    setUsage: uiState.setUsage,

    qaSnapContainerRef: uiState.qaSnapContainerRef,
    lastScrollTimeRef: uiState.lastScrollTimeRef,
    prevScrollHeightRef: uiState.prevScrollHeightRef,
    isLoadingHistoryRef: uiState.isLoadingHistoryRef,
    prevIsLoadingSuggestedRef: uiState.prevIsLoadingSuggestedRef,
    hasLoadedConversationsRef: uiState.hasLoadedConversationsRef,
    hasInitializedFromURLRef: uiState.hasInitializedFromURLRef,
    prevMessageCountRef: uiState.prevMessageCountRef,

    // ========== 弹窗状态 ==========
    showAuthModal: modalState.showAuthModal,
    showBalanceModal: modalState.showBalanceModal,
    balanceError: modalState.balanceError,
    balanceErrorFeature: modalState.balanceErrorFeature,
    citePaper: modalState.citePaper,

    setShowAuthModal: modalState.setShowAuthModal,
    setShowBalanceModal: modalState.setShowBalanceModal,
    setBalanceError: modalState.setBalanceError,
    setBalanceErrorFeature: modalState.setBalanceErrorFeature,
    setCitePaper: modalState.setCitePaper,

    // ========== 认证相关 ==========
    isAuthenticated,
    authLoading,
    user,
    navigate,

    // ========== 常量 ==========
    PAPER_FIELDS,
  };
};

export default useAISearch;
