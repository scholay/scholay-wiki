/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * SearchToAITransition - 学术检索到智能分析的过渡动画组件
 * 
 * 动画效果：
 * 1. 搜索框展开变形为 AI 对话面板
 * 2. 搜索词文字突出显示，作为第一个问题
 * 3. 背景模糊遮罩
 */

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './SearchToAITransition.css';

/**
 * SearchToAITransition 组件
 * @param {Object} props
 * @param {boolean} props.isActive - 是否激活过渡动画
 * @param {string} props.searchQuery - 搜索词
 * @param {Object} props.sourceRect - 源元素（搜索框）的位置信息
 * @param {Function} props.onComplete - 动画完成回调
 */
const SearchToAITransition = ({ 
  isActive, 
  searchQuery, 
  sourceRect,
  onComplete 
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef(null);
  const hasCalledComplete = useRef(false);

  // 当 isActive 变为 true 时，开始动画
  useEffect(() => {
    if (isActive && sourceRect) {
      hasCalledComplete.current = false;
      
      // 下一帧开始展开动画
      requestAnimationFrame(() => {
        setIsExpanded(true);
      });
      
      // 动画完成后触发回调
      const timer = setTimeout(() => {
        if (!hasCalledComplete.current) {
          hasCalledComplete.current = true;
          onComplete?.();
        }
      }, 500); // 等动画完成
      
      return () => clearTimeout(timer);
    } else {
      setIsExpanded(false);
    }
  }, [isActive, sourceRect, onComplete]);

  // 不显示时返回 null
  if (!isActive || !sourceRect) {
    return null;
  }

  // 计算目标位置 - 精确匹配 ai-chat-panel 的位置和尺寸
  // ai-chat-panel: width: 420px, 右侧固定，有左边框
  const targetWidth = 420;
  const targetHeight = window.innerHeight - 60; // 减去顶部导航高度
  const targetX = window.innerWidth - targetWidth; // 右侧贴边
  const targetY = 60; // 顶部导航高度

  return (
    <AnimatePresence mode="wait">
      <React.Fragment key="transition-overlay">
        {/* 背景遮罩 */}
        <motion.div
          className="transition-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: isExpanded ? 0.6 : 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        />

        {/* 变形容器 */}
        <motion.div
          ref={containerRef}
          className="transition-morph-container"
          initial={{
            x: sourceRect.left,
            y: sourceRect.top,
            width: sourceRect.width,
            height: sourceRect.height,
            borderRadius: 24,
            opacity: 1,
          }}
          animate={{
            x: isExpanded ? targetX : sourceRect.left,
            y: isExpanded ? targetY : sourceRect.top,
            width: isExpanded ? targetWidth : sourceRect.width,
            height: isExpanded ? targetHeight : sourceRect.height,
            borderRadius: isExpanded ? 0 : 24,
            opacity: 1,
          }}
          exit={{
            opacity: 0,
          }}
          transition={{
            type: "spring",
            stiffness: 120,
            damping: 20,
            mass: 1,
          }}
        >
          {/* 内容区域 - 模拟真实的 ai-chat-panel 结构 */}
          <div className="transition-content">
            {/* 顶部标题栏 - 模拟 ai-chat-header */}
            <motion.div 
              className="transition-header"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: isExpanded ? 1 : 0, y: isExpanded ? 0 : -10 }}
              transition={{ delay: isExpanded ? 0.15 : 0, duration: 0.25 }}
            >
              <span className="transition-title">AI 对话</span>
              <span className="transition-badge">正在分析...</span>
            </motion.div>

            {/* 搜索词显示 - 模拟 qa-current-question */}
            <motion.div 
              className="transition-query-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: isExpanded ? 1 : 0, scale: isExpanded ? 1 : 0.95 }}
              transition={{ delay: isExpanded ? 0.1 : 0, duration: 0.25 }}
            >
              <div className="transition-query-label">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35"/>
                </svg>
                来自学术检索
              </div>
              <div className="transition-query-text">{searchQuery}</div>
            </motion.div>

            {/* 加载动画 */}
            <motion.div 
              className="transition-loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: isExpanded ? 1 : 0 }}
              transition={{ delay: isExpanded ? 0.2 : 0, duration: 0.25 }}
            >
              <div className="transition-loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="transition-loading-text">正在检索相关论文并生成分析...</span>
            </motion.div>
          </div>
        </motion.div>
      </React.Fragment>
    </AnimatePresence>
  );
};

export default SearchToAITransition;
