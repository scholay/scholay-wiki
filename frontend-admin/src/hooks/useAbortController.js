/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * useAbortController Hook
 * 用于管理 API 请求的取消，防止组件卸载后的内存泄漏
 */

import { useRef, useEffect, useCallback } from 'react';

/**
 * Hook for managing AbortController for API requests
 * Automatically aborts pending requests when component unmounts
 * 
 * @returns {Object} { getSignal, abort, isAborted }
 */
export const useAbortController = () => {
  const abortControllerRef = useRef(null);

  // Create a new AbortController and return its signal
  const getSignal = useCallback(() => {
    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new controller
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current.signal;
  }, []);

  // Manually abort the current request
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Check if the current request was aborted
  const isAborted = useCallback(() => {
    return abortControllerRef.current?.signal?.aborted ?? false;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { getSignal, abort, isAborted };
};

/**
 * Hook for managing multiple AbortControllers
 * Useful when you have multiple independent API requests
 * 
 * @returns {Object} { getSignal, abort, abortAll }
 */
export const useMultipleAbortControllers = () => {
  const controllersRef = useRef(new Map());

  // Create a new AbortController for a specific key
  const getSignal = useCallback((key) => {
    // Abort existing controller for this key
    const existing = controllersRef.current.get(key);
    if (existing) {
      existing.abort();
    }
    
    // Create new controller
    const controller = new AbortController();
    controllersRef.current.set(key, controller);
    return controller.signal;
  }, []);

  // Abort a specific request by key
  const abort = useCallback((key) => {
    const controller = controllersRef.current.get(key);
    if (controller) {
      controller.abort();
      controllersRef.current.delete(key);
    }
  }, []);

  // Abort all pending requests
  const abortAll = useCallback(() => {
    controllersRef.current.forEach(controller => controller.abort());
    controllersRef.current.clear();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      controllersRef.current.forEach(controller => controller.abort());
      controllersRef.current.clear();
    };
  }, []);

  return { getSignal, abort, abortAll };
};

export default useAbortController;
