/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useCallback, useEffect, useState } from 'react';
import { TranslateTip, TranslatePopup } from './PDFTranslationPanel';
import { useTranslation, isPrimarilyChinese } from '../../hooks/useTranslation';
import { trackPDFSelectionTranslate } from '../../utils/usageTracker';

/**
 * PDF 划词翻译面板
 *
 * 内聚职责：
 *  - 监听容器内的鼠标选择事件
 *  - 过滤中文/空内容，只对英文内容展示翻译按钮
 *  - 管理翻译请求、加载、结果状态
 *  - 渲染翻译提示条 + 翻译结果弹窗
 *
 * Props:
 *  - containerRef: PDF 内容容器 ref（用于监听鼠标事件和定位弹窗）
 *  - active: 是否启用（例如 numPages 为空或处于非当前模式时置 false）
 *  - isFullscreen: 是否处于全屏模式（影响 tip 的样式与位置）
 *  - showTip: 是否显示翻译提示条（由外部根据 localStorage 偏好控制）
 *  - onDismissTip: 关闭提示条回调（外部负责写 localStorage 持久化）
 */
const TranslatePanel = React.memo(({
  containerRef,
  active = true,
  isFullscreen = false,
  showTip = false,
  onDismissTip,
}) => {
  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState(null);
  const [showTranslatePopup, setShowTranslatePopup] = useState(false);

  // 翻译 Hook
  const translation = useTranslation();

  // 当前翻译状态
  const currentTranslationKey = selectionPosition?.translationKey;
  const translationState = currentTranslationKey
    ? translation.getTranslationState(currentTranslationKey)
    : { status: 'idle', text: '', error: '' };

  // 处理文本选择（使用鼠标位置定位翻译按钮）
  const handleTextSelection = useCallback((mouseX, mouseY) => {
    const selection = window.getSelection();
    const text = selection?.toString()?.trim();

    if (text && text.length > 0 && text.length < 2000) {
      // 只对非中文内容展示翻译入口
      if (!isPrimarilyChinese(text)) {
        const container = containerRef?.current;
        const containerRect = container?.getBoundingClientRect() || { top: 0, left: 0 };

        // 获取容器的滚动位置
        const scrollTop = container?.scrollTop || 0;
        const scrollLeft = container?.scrollLeft || 0;

        // 使用鼠标位置定位翻译按钮（在鼠标下方偏移 8px）
        // 需要加上滚动偏移量，因为 absolute 定位是相对于容器内容区域
        setSelectedText(text);
        setSelectionPosition({
          top: mouseY - containerRect.top + scrollTop + 8,
          left: mouseX - containerRect.left + scrollLeft,
        });
        setShowTranslatePopup(true);
      } else {
        // 中文内容，清除弹窗
        setShowTranslatePopup(false);
        setSelectedText('');
      }
    } else {
      // 没有选中有效文本
      setShowTranslatePopup(false);
      setSelectedText('');
    }
  }, [containerRef]);

  // 执行翻译
  const handleTranslate = useCallback(() => {
    if (selectedText) {
      const key = `pdf_selection_${Date.now()}`;
      translation.translate(key, selectedText);
      // 存储当前翻译的 key
      setSelectionPosition(prev => prev ? { ...prev, translationKey: key } : null);
      // 记录划词翻译使用统计
      trackPDFSelectionTranslate(selectedText, isFullscreen);
    }
  }, [selectedText, translation, isFullscreen]);

  // 关闭翻译弹窗
  const handleCloseTranslatePopup = useCallback(() => {
    setShowTranslatePopup(false);
    setSelectedText('');
    setSelectionPosition(null);
  }, []);

  // 监听内容区域的鼠标事件
  useEffect(() => {
    if (!active) return undefined;
    const container = containerRef?.current;
    if (!container) return undefined;

    const handleMouseUp = (e) => {
      // 如果点击的是翻译弹窗内的元素，不处理
      if (e.target.closest('.pdf-translate-popup')) {
        return;
      }
      // 保存鼠标位置
      const mouseX = e.clientX;
      const mouseY = e.clientY;
      // 延迟处理，确保选择完成
      setTimeout(() => {
        handleTextSelection(mouseX, mouseY);
      }, 10);
    };

    const handleMouseDown = (e) => {
      // 如果点击的是翻译弹窗内的元素，不关闭
      if (e.target.closest('.pdf-translate-popup')) {
        return;
      }
      // 点击其他区域时关闭翻译弹窗（如果没有正在翻译）
      if (translationState.status !== 'translating') {
        setShowTranslatePopup(false);
      }
    };

    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mousedown', handleMouseDown);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mousedown', handleMouseDown);
    };
  }, [active, containerRef, handleTextSelection, translationState.status]);

  return (
    <>
      {showTip && (
        <TranslateTip onClose={onDismissTip} isFullscreen={isFullscreen} />
      )}
      {showTranslatePopup && selectionPosition && (
        <TranslatePopup
          selectionPosition={selectionPosition}
          translationState={translationState}
          selectedText={selectedText}
          onTranslate={handleTranslate}
          onClose={handleCloseTranslatePopup}
        />
      )}
    </>
  );
});

TranslatePanel.displayName = 'TranslatePanel';

export default TranslatePanel;
