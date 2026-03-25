/**
 * 维度分析管理 Hook
 * 处理AI分析维度的选择、分析结果等
 * 
 * 改为批量模式：通过 analysisQueue 批量请求，每次最多5篇
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { analysisDimensionApi as analysisDimensionAPI, publicScholarApi as publicScholarAPI } from 'features/search/api/scholarApi';
import logger from '../../../utils/logger';
import { trackMatrixAnalysis, trackMatrixAddDimension } from '../../../utils/usageTracker';
import analysisQueue from '../../../utils/analysisQueue';

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

  const analysisAbortedRef = useRef(false);
  // eslint-disable-next-line no-unused-vars
  const analysisSessionRef = useRef(0);

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

  // ============ 批量分析队列相关 ============

  // 初始化队列回调（只在组件挂载时设置一次）
  useEffect(() => {
    // 批量完成回调：记录埋点
    analysisQueue.setOnBatchComplete((results) => {
      results
        .filter(r => r.success)
        .forEach(r => trackMatrixAnalysis(r.paperId));
    });

    // 组件卸载时清理队列
    return () => {
      analysisQueue.clear();
    };
  }, []);

  // 将论文加入分析队列（供IntersectionObserver调用）
  const enqueuePaperAnalysis = useCallback((paper) => {
    if (!isAuthenticated) {
      return;
    }
    if (analysisAbortedRef.current) {
      return;
    }

    const abstractText = paper.abstract || paper.tldr?.text;
    if (!abstractText) {
      return;
    }

    // 设置分析中状态
    setAnalyzingPapers(prev => ({
      ...prev,
      [paper.paperId]: true
    }));

    // 加入队列
    analysisQueue.enqueue(
      {
        paperId: paper.paperId,
        title: paper.title,
        abstract: abstractText
      },
      // 成功回调
      (result) => {
        setAnalyzingPapers(prev => ({
          ...prev,
          [paper.paperId]: false
        }));

        if (result.success) {
          setAnalysisResults(prev => ({
            ...prev,
            [paper.paperId]: result.data
          }));
        } else {
          setAnalysisResults(prev => ({
            ...prev,
            [paper.paperId]: { _error: true, _message: result.error || '分析失败' }
          }));
        }
      },
      // 失败回调
      (error) => {
        setAnalyzingPapers(prev => ({
          ...prev,
          [paper.paperId]: false
        }));

        logger.error('Failed to analyze paper:', paper.paperId, error);

        setAnalysisResults(prev => ({
          ...prev,
          [paper.paperId]: { _error: true, _message: error?.message || '分析失败' }
        }));
      }
    );
  }, [isAuthenticated]);

  // 检查论文是否已有分析结果（用于判断是否需要入队）
  const hasAnalysisResult = useCallback((paperId) => {
    return analysisResults[paperId] || analysisQueue.hasResult(paperId);
  }, [analysisResults]);

  // 检查论文是否正在分析中
  const isAnalyzing = useCallback((paperId) => {
    return analyzingPapers[paperId] || analysisQueue.isInQueue(paperId);
  }, [analyzingPapers]);

  // 清空分析队列和结果（页面切换时调用）
  const clearAnalysisQueue = useCallback(() => {
    analysisQueue.clear();
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

    // Refs
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
    
    // 批量分析相关
    enqueuePaperAnalysis,  // 将论文加入分析队列
    hasAnalysisResult,     // 检查是否已有结果
    isAnalyzing,           // 检查是否正在分析
    clearAnalysisQueue,    // 清空队列
    
    // 删除确认相关
    deleteConfirmDimension,
    isDeleting,
    confirmDeleteDimension,
    cancelDeleteDimension,
  };
};

export default useDimensionAnalysis;
