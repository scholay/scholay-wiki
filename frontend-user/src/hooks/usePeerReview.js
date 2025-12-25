/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * usePeerReview - 智能审稿功能 Hook
 * 管理审稿任务的创建、查询、删除等操作
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { peerReviewAPI } from '../services/api';
import logger from '../utils/logger';

// 任务状态映射
const STATUS_MAP = {
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
  failed: '失败'
};

/**
 * 智能审稿功能 Hook
 * @param {Object} options - 配置选项
 * @param {number} options.pageSize - 每页任务数量
 * @param {number} options.pollingInterval - 轮询间隔（毫秒）
 * @returns {Object} 审稿状态和方法
 */
export function usePeerReview({ pageSize = 10, pollingInterval = 5000 } = {}) {
  // 任务列表状态
  const [tasks, setTasks] = useState([]);
  const [totalTasks, setTotalTasks] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // 当前任务详情
  const [taskDetail, setTaskDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // 提交状态
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  
  // 轮询相关
  const pollingRef = useRef(null);
  const pollingTaskIdRef = useRef(null);
  
  /**
   * 获取任务列表
   */
  const fetchTasks = useCallback(async (page = 1, keyword = '') => {
    setLoading(true);
    try {
      const response = await peerReviewAPI.getTasks({
        page,
        page_size: pageSize,
        keyword
      });
      
      if (response.data.code === 0 && response.data.data) {
        setTasks(response.data.data.tasks || []);
        setTotalTasks(response.data.data.total || 0);
        setCurrentPage(page);
      }
    } catch (error) {
      logger.error('[usePeerReview] Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [pageSize]);
  
  /**
   * 获取任务详情
   */
  const fetchTaskDetail = useCallback(async (taskId) => {
    if (!taskId) return null;
    
    setDetailLoading(true);
    try {
      const response = await peerReviewAPI.getTask(taskId);
      
      if (response.data.code === 0 && response.data.data) {
        setTaskDetail(response.data.data);
        return response.data.data;
      }
      return null;
    } catch (error) {
      logger.error('[usePeerReview] Failed to fetch task detail:', error);
      return null;
    } finally {
      setDetailLoading(false);
    }
  }, []);
  
  /**
   * 创建审稿任务
   */
  const createTask = useCallback(async ({
    manuscriptText,
    targetVenue,
    modelLevel,
    fileName,
    useFileInput,
    attachments
  }) => {
    setSubmitting(true);
    setSubmitError(null);
    
    try {
      const formData = new FormData();
      
      if (useFileInput && fileName) {
        // 使用文件上传
        formData.append('use_file_input', 'true');
        formData.append('file_name', fileName);
      } else {
        // 使用文本输入
        formData.append('manuscript_text', manuscriptText);
      }
      
      if (targetVenue) {
        formData.append('target_venue', targetVenue);
      }
      formData.append('model_level', modelLevel || 'mid');
      
      // 添加附件
      if (attachments && attachments.length > 0) {
        attachments.forEach((attachment, index) => {
          if (attachment.file) {
            formData.append(`attachment_${index}`, attachment.file);
          }
        });
      }
      
      const response = await peerReviewAPI.createTask(formData);
      
      if (response.data.code === 0 && response.data.data) {
        // 刷新任务列表
        await fetchTasks(1);
        return response.data.data;
      } else {
        setSubmitError(response.data.message || '创建任务失败');
        return null;
      }
    } catch (error) {
      logger.error('[usePeerReview] Failed to create task:', error);
      setSubmitError(error.message || '创建任务失败');
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [fetchTasks]);
  
  /**
   * 删除任务
   */
  const deleteTask = useCallback(async (taskId) => {
    try {
      const response = await peerReviewAPI.deleteTask(taskId);
      
      if (response.data.code === 0) {
        // 从列表中移除
        setTasks(prev => prev.filter(t => t.id !== taskId));
        setTotalTasks(prev => Math.max(0, prev - 1));
        
        // 如果删除的是当前查看的任务，清空详情
        if (taskDetail?.id === taskId) {
          setTaskDetail(null);
        }
        
        return true;
      }
      return false;
    } catch (error) {
      logger.error('[usePeerReview] Failed to delete task:', error);
      return false;
    }
  }, [taskDetail]);
  
  /**
   * 开始轮询任务状态
   */
  const startPolling = useCallback((taskId) => {
    // 停止之前的轮询
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    
    pollingTaskIdRef.current = taskId;
    
    const poll = async () => {
      if (pollingTaskIdRef.current !== taskId) return;
      
      const task = await fetchTaskDetail(taskId);
      
      // 如果任务完成或失败，停止轮询
      if (task && (task.status === 'completed' || task.status === 'failed')) {
        stopPolling();
      }
    };
    
    pollingRef.current = setInterval(poll, pollingInterval);
    
    // 立即执行一次
    poll();
  }, [fetchTaskDetail, pollingInterval]);
  
  /**
   * 停止轮询
   */
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    pollingTaskIdRef.current = null;
  }, []);
  
  /**
   * 清理
   */
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);
  
  return {
    // 状态
    tasks,
    totalTasks,
    currentPage,
    loading,
    taskDetail,
    detailLoading,
    submitting,
    submitError,
    
    // 计算属性
    totalPages: Math.ceil(totalTasks / pageSize),
    isPolling: !!pollingRef.current,
    
    // 方法
    fetchTasks,
    fetchTaskDetail,
    createTask,
    deleteTask,
    startPolling,
    stopPolling,
    setCurrentPage,
    setTaskDetail,
    
    // 常量
    STATUS_MAP
  };
}

export default usePeerReview;

