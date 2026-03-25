/**
 * 维度分析状态管理 Hook
 * 从 useAISearch.js 拆分
 */
import { useState, useCallback, useRef } from 'react';
import { Modal } from 'antd';
import { analysisDimensionAPI } from '../../../services/api';
import { trackMatrixAddDimension } from '../../../utils/usageTracker';
import logger from '../../../utils/logger';

export const useDimensionState = (isAuthenticated) => {
  // 维度列表
  const [dimensions, setDimensions] = useState([]);
  const [selectedDimensions, setSelectedDimensions] = useState([]);

  // 分析结果
  const [analysisResults, setAnalysisResults] = useState({});
  const [analyzingPapers, setAnalyzingPapers] = useState({});
  // 悬浮面板状态
  const [floatPanelExpanded, setFloatPanelExpanded] = useState(false);
  const [floatPanelView, setFloatPanelView] = useState('list');
  const [editingDimension, setEditingDimension] = useState(null);
  const [viewingDimension, setViewingDimension] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });

  // Refs
  const analysisAbortedRef = useRef(false);
  const hasLoadedDimensionsRef = useRef(false);

  // 辅助函数
  const getDimensionKey = useCallback((dim) => {
    return dim.dimensionKey || dim.key || dim.name;
  }, []);

  // 加载维度列表
  const loadDimensions = useCallback(async () => {
    if (!isAuthenticated) {
      logger.warn('User not authenticated, skipping dimension load');
      return;
    }
    try {
      const response = await analysisDimensionAPI.getDimensions();
      if (response.data.code === 0 && response.data.data) {
        const dims = response.data.data.dimensions || [];
        setDimensions(dims);
      }
    } catch (err) {
      logger.error('Failed to load dimensions:', err);
    }
  }, [isAuthenticated]);

  // 刷新维度
  const refreshDimensions = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await analysisDimensionAPI.getDimensions();
      if (response.data.code === 0) {
        setDimensions(response.data.data.dimensions || []);
      }
    } catch (error) {
      console.error('刷新维度列表失败:', error);
    }
  }, [isAuthenticated]);

  // 切换维度选中状态
  const handleDimensionToggle = useCallback((dim) => {
    const dimKey = getDimensionKey(dim);
    setSelectedDimensions(prev => {
      const isSelected = prev.some(d => getDimensionKey(d) === dimKey);
      if (isSelected) {
        return prev.filter(d => getDimensionKey(d) !== dimKey);
      } else {
        return [...prev, dim];
      }
    });
  }, [getDimensionKey]);

  // 保存维度
  const handleSaveDimension = useCallback(async () => {
    if (!editForm.name.trim()) {
      alert('请输入维度名称');
      return;
    }

    const dimensionKey = editingDimension
      ? getDimensionKey(editingDimension)
      : editForm.name.trim().toLowerCase().replace(/\s+/g, '_');

    try {
      const response = await analysisDimensionAPI.createDimension(
        dimensionKey,
        editForm.name.trim(),
        editForm.description.trim()
      );

      if (response.data.code === 0) {
        // 记录智能矩阵新增维度使用统计（仅新增时追踪）
        if (!editingDimension) {
          trackMatrixAddDimension(editForm.name.trim());
        }
        
        await refreshDimensions();
        setFloatPanelView('list');
        setEditingDimension(null);
        setEditForm({ name: '', description: '' });
      } else {
        alert(response.data.message || '保存失败');
      }
    } catch (error) {
      console.error('保存维度失败:', error);
      alert('保存失败，请稍后重试');
    }
  }, [editForm, editingDimension, getDimensionKey, refreshDimensions]);

  // 删除维度
  const handleDeleteDimension = useCallback((dimension) => {
    if (!dimension || !dimension.id || dimension.userId <= 0) {
      alert('只能删除自定义维度');
      return;
    }

    Modal.confirm({
      title: '确认',
      content: `确定要删除维度「${dimension.name}」吗？`,
      okText: '确认',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const response = await analysisDimensionAPI.deleteDimension(dimension.id);
          if (response.data.code === 0) {
            setSelectedDimensions(prev => prev.filter(d => getDimensionKey(d) !== getDimensionKey(dimension)));
            await refreshDimensions();
            if (floatPanelView === 'edit' && editingDimension && getDimensionKey(editingDimension) === getDimensionKey(dimension)) {
              setFloatPanelView('list');
              setEditingDimension(null);
            }
          } else {
            alert(response.data.message || '删除失败');
          }
        } catch (error) {
          console.error('删除维度失败:', error);
          alert('删除失败，请稍后重试');
        }
      },
    });
  }, [getDimensionKey, refreshDimensions, floatPanelView, editingDimension]);

  // 打开编辑视图
  const handleOpenEditView = useCallback((dimension) => {
    if (dimension) {
      setEditingDimension(dimension);
      setEditForm({ name: dimension.name, description: dimension.description || '' });
    } else {
      setEditingDimension(null);
      setEditForm({ name: '', description: '' });
    }
    setFloatPanelView(dimension?.userId > 0 ? 'edit' : 'create');
    setViewingDimension(null);
  }, []);

  // 关闭编辑视图
  const handleCloseEditView = useCallback(() => {
    setFloatPanelView('list');
    setEditingDimension(null);
    setEditForm({ name: '', description: '' });
  }, []);

  return {
    // 状态
    dimensions,
    selectedDimensions,
    analysisResults,
    analyzingPapers,
    floatPanelExpanded,
    floatPanelView,
    editingDimension,
    viewingDimension,
    editForm,

    // Setter
    setDimensions,
    setSelectedDimensions,
    setAnalysisResults,
    setAnalyzingPapers,
    setFloatPanelExpanded,
    setFloatPanelView,
    setEditingDimension,
    setViewingDimension,
    setEditForm,

    // Refs
    analysisAbortedRef,
    hasLoadedDimensionsRef,

    // 方法
    getDimensionKey,
    loadDimensions,
    refreshDimensions,
    handleDimensionToggle,
    handleSaveDimension,
    handleDeleteDimension,
    handleOpenEditView,
    handleCloseEditView,
  };
};

export default useDimensionState;
