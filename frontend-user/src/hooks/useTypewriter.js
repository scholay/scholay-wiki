/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 优化的打字机效果Hook
 * 使用单个定时器和requestAnimationFrame优化性能
 */
export const useTypewriter = (phrases, options = {}) => {
  const {
    typingSpeed = 100,
    deletingSpeed = 50,
    pauseAfterComplete = 2000,
    pauseAfterDelete = 500,
    enabled = true,
  } = options;

  const [displayedText, setDisplayedText] = useState('');
  const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCursor, setShowCursor] = useState(true);

  const timeoutRef = useRef(null);
  const cursorIntervalRef = useRef(null);

  // 清理所有定时器
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (cursorIntervalRef.current) {
      clearInterval(cursorIntervalRef.current);
      cursorIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !phrases || phrases.length === 0) {
      return;
    }

    const currentPhrase = phrases[currentPhraseIndex];

    // 光标闪烁 - 使用单一interval
    if (!cursorIntervalRef.current) {
      cursorIntervalRef.current = setInterval(() => {
        setShowCursor(prev => !prev);
      }, 530);
    }

    // 打字机逻辑
    if (!isDeleting && displayedText === currentPhrase) {
      // 完成打字,暂停后开始删除
      timeoutRef.current = setTimeout(() => {
        setIsDeleting(true);
      }, pauseAfterComplete);
      return;
    }

    if (isDeleting && displayedText === '') {
      // 删除完成,切换到下一个短语
      setIsDeleting(false);
      setCurrentPhraseIndex((prev) => (prev + 1) % phrases.length);
      timeoutRef.current = setTimeout(() => {
        // 小延迟后开始下一个短语
      }, pauseAfterDelete);
      return;
    }

    // 打字或删除字符
    const speed = isDeleting ? deletingSpeed : typingSpeed + Math.random() * 20;
    timeoutRef.current = setTimeout(() => {
      setDisplayedText(prev => {
        if (isDeleting) {
          return currentPhrase.substring(0, prev.length - 1);
        } else {
          return currentPhrase.substring(0, prev.length + 1);
        }
      });
    }, speed);

    return cleanup;
  }, [displayedText, isDeleting, currentPhraseIndex, phrases, enabled, typingSpeed, deletingSpeed, pauseAfterComplete, pauseAfterDelete, cleanup]);

  // 组件卸载时清理
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { displayedText, showCursor };
};
