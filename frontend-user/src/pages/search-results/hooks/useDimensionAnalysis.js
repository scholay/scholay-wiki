/**
 * 维度分析管理 Hook
 * 处理AI分析维度的选择、分析结果等
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { analysisDimensionAPI, publicScholarAPI } from '../../../services/api';
import wsClient from '../../../services/websocket';
import logger from '../../../utils/logger';
import { trackMatrixAnalysis, trackMatrixAddDimension } from '../../../utils/usageTracker';

/**
 * 维度分析管理 Hook
 */
export const useDimensionAnalysis = ({ isAuthenticated, setShowAuthModal }) => {
  // 分析维度相关状态
  const [dimensions, setDimensions] = useState([]);
  const [selectedDimensions, setSelectedDimensions] = useState([]);
  const [showDimensionDropdown, setShowDimensionDropdown] = useState(false);
  const [analysisResults, setAnalysisResults] = useState({});
  const [analyzingPapers, setAnalyzingPapers] = useState({});
  const [floatPanelExpanded, setFloatPanelExpanded] = useState(false);
  const [floatPanelView, setFloatPanelView] = useState('list');
  const [viewingDimension, setViewingDimension] = useState(null);
  const [editingDimension, setEditingDimension] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [isSavingDimension, setIsSavingDimension] = useState(false);
  
  // 删除确认弹窗状态
  const [deleteConfirmDimension, setDeleteConfirmDimension] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 扣费相关状态
  const [totalDeducted, setTotalDeducted] = useState(0);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceError, setBalanceError] = useState(null);
  const analysisAbortedRef = useRef(false);
  const analysisSessionRef = useRef(0);
  const accumulatedDeductRef = useRef(0);

  const dimensionDropdownRef = useRef(null);

  // 获取维度 key
  const getDimensionKey = useCallback((dim) => dim.dimensionKey || dim.key, []);

  // 加载分析维度
  const loadDimensions = useCallback(async () => {
    try {
      let response;
      if (isAuthenticated) {
        response = await analysisDimensionAPI.getDimensions();
      } else {
        response = await publicScholarAPI.getSystemDimensions();
      }

      if (response.data.code === 0 && response.data.data) {
        const dims = response.data.data.dimensions || [];
        setDimensions(dims);
      }
    } catch (err) {
      logger.error('Failed to load dimensions:', err);
    }
  }, [isAuthenticated]);

  // 点击外部关闭维度下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dimensionDropdownRef.current && !dimensionDropdownRef.current.contains(event.target)) {
        setShowDimensionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 切换维度选择（多选）
  const handleDimensionToggle = useCallback((dimension) => {
    if (!isAuthenticated) {
      setShowAuthModal?.(true);
      return;
    }

    const dimKey = getDimensionKey(dimension);
    setSelectedDimensions(prev => {
      const isSelected = prev.some(d => getDimensionKey(d) === dimKey);
      if (isSelected) {
        return prev.filter(d => getDimensionKey(d) !== dimKey);
      } else {
        return [...prev, dimension];
      }
    });
  }, [getDimensionKey, isAuthenticated, setShowAuthModal]);

  // 全选/取消全选维度
  const handleSelectAllDimensions = useCallback(() => {
    if (!isAuthenticated) {
      setShowAuthModal?.(true);
      return;
    }

    if (selectedDimensions.length === dimensions.length) {
      setSelectedDimensions([]);
    } else {
      setSelectedDimensions([...dimensions]);
    }
  }, [dimensions, selectedDimensions.length, isAuthenticated, setShowAuthModal]);

  // 清除所有选中的维度
  const handleClearDimensions = useCallback(() => {
    setSelectedDimensions([]);
  }, []);

  // 打开编辑视图（新增或编辑）
  const handleOpenEditView = useCallback((dimension = null) => {
    setEditingDimension(dimension);
    setEditForm({
      name: dimension?.name || '',
      description: dimension?.description || ''
    });
    setFloatPanelView('edit');
  }, []);

  // 关闭编辑视图
  const handleCloseEditView = useCallback(() => {
    setFloatPanelView('list');
    setEditingDimension(null);
    setEditForm({ name: '', description: '' });
  }, []);

  // 生成 dimensionKey
  const generateDimensionKey = useCallback((name) => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `custom_${timestamp}_${random}`;
  }, []);

  // 刷新维度列表
  const refreshDimensions = useCallback(async () => {
    try {
      const response = isAuthenticated
        ? await analysisDimensionAPI.getDimensions()
        : await publicScholarAPI.getSystemDimensions();

      if (response.data.code === 0) {
        setDimensions(response.data.data.dimensions || []);
      }
    } catch (error) {
      console.error('刷新维度列表失败:', error);
    }
  }, [isAuthenticated]);

  // 保存维度（新增或修改）
  const handleSaveDimension = useCallback(async () => {
    if (!editForm.name.trim() || !editForm.description.trim()) {
      return;
    }

    setIsSavingDimension(true);
    try {
      let dimensionKey;
      if (editingDimension) {
        dimensionKey = getDimensionKey(editingDimension);
      } else {
        dimensionKey = generateDimensionKey(editForm.name);
      }

      const response = await analysisDimensionAPI.createDimension(
        dimensionKey,
        editForm.name.trim(),
        editForm.description.trim()
      );

      if (response.data.code === 0) {
        // 记录新增维度使用统计（仅新增时，编辑不记录）
        if (!editingDimension) {
          trackMatrixAddDimension(editForm.name.trim());
        }
        await refreshDimensions();
        handleCloseEditView();
      } else {
        console.error('保存维度失败:', response.data.message);
        alert(response.data.message || '保存失败');
      }
    } catch (error) {
      console.error('保存维度失败:', error);
      alert('保存失败，请稍后重试');
    } finally {
      setIsSavingDimension(false);
    }
  }, [editForm, editingDimension, getDimensionKey, generateDimensionKey, refreshDimensions, handleCloseEditView]);

  // 打开删除确认弹窗
  const handleDeleteDimension = useCallback((dimension) => {
    if (!dimension || dimension.userId <= 0) {
      return;
    }
    setDeleteConfirmDimension(dimension);
  }, []);

  // 确认删除维度
  const confirmDeleteDimension = useCallback(async () => {
    if (!deleteConfirmDimension) return;
    
    setIsDeleting(true);
    try {
      const response = await analysisDimensionAPI.deleteDimension(deleteConfirmDimension.id);
      if (response.data.code === 0) {
        setSelectedDimensions(prev =>
          prev.filter(d => getDimensionKey(d) !== getDimensionKey(deleteConfirmDimension))
        );
        await refreshDimensions();
        // 删除成功后返回列表视图
        setFloatPanelView('list');
        setViewingDimension(null);
        setDeleteConfirmDimension(null);
      } else {
        console.error('删除维度失败:', response.data.message);
      }
    } catch (error) {
      console.error('删除维度失败:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteConfirmDimension, getDimensionKey, refreshDimensions]);

  // 取消删除
  const cancelDeleteDimension = useCallback(() => {
    setDeleteConfirmDimension(null);
  }, []);

  // 为论文分析所有维度
  const analyzePaper = useCallback(async (paper) => {
    if (!isAuthenticated) return { success: false, aborted: false, deducted: 0 };

    if (analysisAbortedRef.current) return { success: false, aborted: true, deducted: 0 };

    const abstractText = paper.abstract || paper.tldr?.text;
    if (!abstractText) return { success: false, aborted: false, deducted: 0 };

    setAnalyzingPapers(prev => ({
      ...prev,
      [paper.paperId]: true
    }));

    try {
      const response = await analysisDimensionAPI.analyzePaper(paper.paperId, paper.title, abstractText);

      if (response.data.code === 0 && response.data.data) {
        const responseData = response.data.data;
        const dimensionData = responseData.data || responseData;
        const deductedAmount = responseData.deducted_amount || 0;

        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: dimensionData
        }));
        
        // 记录智能矩阵分析使用统计
        trackMatrixAnalysis(paper.paperId);

        return { success: true, aborted: false, deducted: deductedAmount };
      } else {
        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: { _error: true, _message: response.data.message || '分析失败' }
        }));
        return { success: false, aborted: false, deducted: 0 };
      }
    } catch (error) {
      logger.error('Failed to analyze paper:', paper.paperId, error);

      if (error.response?.data?.code === 4020) {
        analysisAbortedRef.current = true;
        setBalanceError({
          ...error.response.data.data,
          alreadyDeducted: accumulatedDeductRef.current
        });
        setShowBalanceModal(true);
        return { success: false, aborted: true, deducted: 0 };
      }

      setAnalysisResults(prev => ({
        ...prev,
        [paper.paperId]: { _error: true, _message: error.response?.data?.message || '分析失败' }
      }));
      return { success: false, aborted: false, deducted: 0 };
    } finally {
      setAnalyzingPapers(prev => ({
        ...prev,
        [paper.paperId]: false
      }));
    }
  }, [isAuthenticated]);

  // 并发控制分析
  const analyzeWithConcurrency = useCallback(async (papersToAnalyze) => {
    const CONCURRENCY_LIMIT = 5;

    const currentSession = ++analysisSessionRef.current;

    analysisAbortedRef.current = false;
    accumulatedDeductRef.current = 0;
    setTotalDeducted(0);

    let aborted = false;
    let totalDeductedInSession = 0;

    for (let i = 0; i < papersToAnalyze.length; i += CONCURRENCY_LIMIT) {
      if (analysisSessionRef.current !== currentSession) {
        return;
      }

      if (analysisAbortedRef.current) {
        aborted = true;
        break;
      }

      const batch = papersToAnalyze.slice(i, i + CONCURRENCY_LIMIT);
      const results = await Promise.all(batch.map(paper => analyzePaper(paper)));

      for (const result of results) {
        if (result.deducted > 0) {
          totalDeductedInSession += result.deducted;
          accumulatedDeductRef.current = totalDeductedInSession;
        }
      }

      if (results.some(r => r.aborted)) {
        aborted = true;
        break;
      }
    }

    if (analysisSessionRef.current !== currentSession) {
      return;
    }

    if (!aborted && totalDeductedInSession > 0) {
      wsClient.emit('toast', {
        title: '扣费提醒',
        content: `本次分析共消耗 ${totalDeductedInSession} 经费`,
        category: 'transaction',
        created_at: new Date().toISOString()
      });
    }

    accumulatedDeductRef.current = 0;
    setTotalDeducted(0);
  }, [analyzePaper]);

  // 关闭余额不足弹窗
  const handleCloseBalanceModal = useCallback(() => {
    setShowBalanceModal(false);
    setBalanceError(null);
    analysisAbortedRef.current = false;
  }, []);

  return {
    // 维度状态
    dimensions,
    setDimensions,
    selectedDimensions,
    setSelectedDimensions,
    showDimensionDropdown,
    setShowDimensionDropdown,
    floatPanelExpanded,
    setFloatPanelExpanded,
    floatPanelView,
    setFloatPanelView,
    viewingDimension,
    setViewingDimension,
    editingDimension,
    setEditingDimension,
    editForm,
    setEditForm,
    isSavingDimension,

    // 分析结果
    analysisResults,
    setAnalysisResults,
    analyzingPapers,
    setAnalyzingPapers,

    // 扣费相关
    totalDeducted,
    showBalanceModal,
    balanceError,
    analysisAbortedRef,

    // Refs
    dimensionDropdownRef,

    // 操作函数
    getDimensionKey,
    loadDimensions,
    handleDimensionToggle,
    handleSelectAllDimensions,
    handleClearDimensions,
    handleOpenEditView,
    handleCloseEditView,
    handleSaveDimension,
    handleDeleteDimension,
    analyzePaper,
    analyzeWithConcurrency,
    handleCloseBalanceModal,
    
    // 删除确认相关
    deleteConfirmDimension,
    isDeleting,
    confirmDeleteDimension,
    cancelDeleteDimension,
  };
};

export default useDimensionAnalysis;
