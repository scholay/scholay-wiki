/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * useLocalStorage - 本地存储 Hook
 * 提供类似 useState 的 API，但数据持久化到 localStorage
 */

import { useState, useCallback, useEffect } from 'react';

/**
 * 本地存储 Hook
 * @param {string} key - localStorage 键名
 * @param {*} initialValue - 初始值
 * @param {Object} options - 配置选项
 * @param {Function} options.serialize - 序列化函数，默认 JSON.stringify
 * @param {Function} options.deserialize - 反序列化函数，默认 JSON.parse
 */
const useLocalStorage = (key, initialValue, options = {}) => {
  const {
    serialize = JSON.stringify,
    deserialize = JSON.parse,
  } = options;

  // 获取初始值
  const getStoredValue = useCallback(() => {
    try {
      const item = localStorage.getItem(key);
      if (item !== null) {
        return deserialize(item);
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
    }
    return typeof initialValue === 'function' ? initialValue() : initialValue;
  }, [key, initialValue, deserialize]);

  const [storedValue, setStoredValue] = useState(getStoredValue);

  // 设置值
  const setValue = useCallback((value) => {
    try {
      const valueToStore = typeof value === 'function' ? value(storedValue) : value;
      setStoredValue(valueToStore);
      localStorage.setItem(key, serialize(valueToStore));
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, serialize, storedValue]);

  // 删除值
  const removeValue = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setStoredValue(typeof initialValue === 'function' ? initialValue() : initialValue);
    } catch (error) {
      console.warn(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue]);

  // 监听其他标签页的 storage 事件
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(deserialize(e.newValue));
        } catch (error) {
          console.warn(`Error deserializing storage event for key "${key}":`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, deserialize]);

  return [storedValue, setValue, removeValue];
};

export default useLocalStorage;

