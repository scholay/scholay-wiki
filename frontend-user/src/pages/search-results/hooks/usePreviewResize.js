/**
 * 预览面板调整大小 Hook
 * 处理预览面板的宽度调整逻辑
 */
import { useState, useCallback, useEffect } from 'react';

const PREVIEW_MIN_WIDTH = 320;
const PREVIEW_MAX_WIDTH = 800;

/**
 * 预览面板调整大小 Hook
 */
export const usePreviewResize = () => {
  // 宽度限制函数
  const clampPreviewWidth = useCallback((value, viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920) => {
    const calculatedMax = Math.min(PREVIEW_MAX_WIDTH, Math.floor(viewportWidth * 0.65));
    const safeMax = Math.max(PREVIEW_MIN_WIDTH, calculatedMax);
    const safeMin = Math.min(PREVIEW_MIN_WIDTH, safeMax);
    const target = Number.isFinite(value) ? value : 480;
    return Math.min(Math.max(target, safeMin), safeMax);
  }, []);

  // 默认预览面板宽度为内容区域的1/3
  const getDefaultPreviewWidth = useCallback(() => {
    if (typeof window !== 'undefined') {
      const sidebarWidth = 280;
      const contentWidth = window.innerWidth - sidebarWidth;
      return clampPreviewWidth(Math.floor(contentWidth / 3));
    }
    return clampPreviewWidth(480);
  }, [clampPreviewWidth]);

  const [previewWidth, setPreviewWidth] = useState(getDefaultPreviewWidth);
  const [isResizingPreview, setIsResizingPreview] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(() =>
    (typeof window !== 'undefined' ? window.innerWidth <= 1024 : false)
  );

  // 处理窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
      setPreviewWidth(prev => clampPreviewWidth(prev, viewportWidth));
      setIsCompactLayout(viewportWidth <= 1024);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPreviewWidth]);

  // 开始调整大小
  const startPreviewResize = useCallback((startClientX) => {
    setIsResizingPreview(true);
    const startWidth = previewWidth;

    const updateWidth = (clientX) => {
      if (typeof clientX !== 'number' || Number.isNaN(clientX)) {
        return;
      }
      const diff = startClientX - clientX;
      const rawWidth = startWidth + diff;
      const clampedWidth = clampPreviewWidth(rawWidth);
      setPreviewWidth(clampedWidth);
    };

    const handleMouseMove = (event) => {
      updateWidth(event.clientX);
    };

    const handleTouchMove = (event) => {
      if (event.touches.length !== 1) {
        return;
      }
      event.preventDefault();
      updateWidth(event.touches[0].clientX);
    };

    const touchMoveOptions = { passive: false };

    const finishResize = () => {
      setIsResizingPreview(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', finishResize);
      document.removeEventListener('touchmove', handleTouchMove, touchMoveOptions);
      document.removeEventListener('touchend', finishResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', finishResize);
    document.addEventListener('touchmove', handleTouchMove, touchMoveOptions);
    document.addEventListener('touchend', finishResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [previewWidth, clampPreviewWidth]);

  // 鼠标按下事件处理
  const handlePreviewResizeMouseDown = useCallback((event) => {
    event.preventDefault();
    startPreviewResize(event.clientX);
  }, [startPreviewResize]);

  // 触摸开始事件处理
  const handlePreviewResizeTouchStart = useCallback((event) => {
    if (event.touches.length !== 1) {
      return;
    }
    event.preventDefault();
    startPreviewResize(event.touches[0].clientX);
  }, [startPreviewResize]);

  // 重置预览宽度
  const resetPreviewWidth = useCallback(() => {
    setPreviewWidth(getDefaultPreviewWidth());
  }, [getDefaultPreviewWidth]);

  return {
    previewWidth,
    setPreviewWidth,
    isResizingPreview,
    isCompactLayout,
    clampPreviewWidth,
    getDefaultPreviewWidth,
    handlePreviewResizeMouseDown,
    handlePreviewResizeTouchStart,
    resetPreviewWidth,
    PREVIEW_MIN_WIDTH,
    PREVIEW_MAX_WIDTH,
  };
};

export default usePreviewResize;
