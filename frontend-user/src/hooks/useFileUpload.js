/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * useFileUpload - 文件上传 Hook
 */

import { useState, useCallback, useRef } from 'react';

/**
 * 文件上传 Hook
 * @param {Object} options - 配置选项
 * @param {string[]} options.accept - 允许的文件类型
 * @param {number} options.maxSize - 最大文件大小（字节）
 * @param {number} options.maxFiles - 最大文件数量
 * @param {Function} options.onUpload - 上传函数
 * @param {Function} options.onError - 错误回调
 */
const useFileUpload = (options = {}) => {
  const {
    accept = ['*/*'],
    maxSize = 10 * 1024 * 1024, // 默认 10MB
    maxFiles = 10,
    onUpload,
    onError,
  } = options;

  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  
  const inputRef = useRef(null);
  const dragCounterRef = useRef(0);

  // 验证文件
  const validateFile = useCallback((file) => {
    // 检查文件大小
    if (file.size > maxSize) {
      return { valid: false, error: `文件大小超过限制 (${Math.round(maxSize / 1024 / 1024)}MB)` };
    }

    // 检查文件类型
    if (accept[0] !== '*/*') {
      const fileType = file.type || '';
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      const isAccepted = accept.some(type => {
        if (type.startsWith('.')) {
          return fileExt === type.toLowerCase();
        }
        if (type.endsWith('/*')) {
          return fileType.startsWith(type.replace('/*', '/'));
        }
        return fileType === type;
      });
      
      if (!isAccepted) {
        return { valid: false, error: '不支持的文件类型' };
      }
    }

    return { valid: true };
  }, [accept, maxSize]);

  // 处理文件选择
  const handleFiles = useCallback(async (fileList) => {
    const newFiles = Array.from(fileList);
    
    // 检查文件数量
    if (files.length + newFiles.length > maxFiles) {
      onError?.(`最多只能上传 ${maxFiles} 个文件`);
      return;
    }

    // 验证文件
    const validFiles = [];
    for (const file of newFiles) {
      const result = validateFile(file);
      if (result.valid) {
        validFiles.push(file);
      } else {
        onError?.(result.error);
      }
    }

    if (validFiles.length === 0) return;

    // 添加到文件列表
    const filesWithId = validFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending', // pending, uploading, success, error
      progress: 0,
      error: null,
    }));

    setFiles(prev => [...prev, ...filesWithId]);

    // 如果有上传函数，自动上传
    if (onUpload) {
      setUploading(true);
      for (const fileItem of filesWithId) {
        try {
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, status: 'uploading' } : f
          ));
          
          await onUpload(fileItem.file, (percent) => {
            setProgress(prev => ({ ...prev, [fileItem.id]: percent }));
            setFiles(prev => prev.map(f => 
              f.id === fileItem.id ? { ...f, progress: percent } : f
            ));
          });
          
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, status: 'success', progress: 100 } : f
          ));
        } catch (error) {
          setFiles(prev => prev.map(f => 
            f.id === fileItem.id ? { ...f, status: 'error', error: error.message } : f
          ));
        }
      }
      setUploading(false);
    }
  }, [files.length, maxFiles, validateFile, onUpload, onError]);

  // 点击选择文件
  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  // 文件输入变化
  const handleInputChange = useCallback((e) => {
    if (e.target.files) {
      handleFiles(e.target.files);
      e.target.value = ''; // 重置以允许选择相同文件
    }
  }, [handleFiles]);

  // 拖拽事件
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  // 删除文件
  const removeFile = useCallback((fileId) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
    setProgress(prev => {
      const newProgress = { ...prev };
      delete newProgress[fileId];
      return newProgress;
    });
  }, []);

  // 清空所有文件
  const clearFiles = useCallback(() => {
    setFiles([]);
    setProgress({});
  }, []);

  // 重试上传
  const retryUpload = useCallback(async (fileId) => {
    const fileItem = files.find(f => f.id === fileId);
    if (!fileItem || !onUpload) return;

    setFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, status: 'uploading', error: null } : f
    ));

    try {
      await onUpload(fileItem.file, (percent) => {
        setProgress(prev => ({ ...prev, [fileId]: percent }));
        setFiles(prev => prev.map(f => 
          f.id === fileId ? { ...f, progress: percent } : f
        ));
      });
      
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, status: 'success', progress: 100 } : f
      ));
    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, status: 'error', error: error.message } : f
      ));
    }
  }, [files, onUpload]);

  return {
    // 状态
    files,
    uploading,
    progress,
    isDragging,
    inputRef,
    
    // 方法
    openFilePicker,
    handleInputChange,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    removeFile,
    clearFiles,
    retryUpload,
    
    // 辅助
    acceptString: accept.join(','),
  };
};

export default useFileUpload;

