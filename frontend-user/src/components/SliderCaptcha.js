import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import './SliderCaptcha.css';

const SliderCaptcha = forwardRef(({ onSuccess, onFail }, ref) => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState(0);
  const [verified, setVerified] = useState(false);
  const [failed, setFailed] = useState(false);

  const sliderRef = useRef(null);
  const containerRef = useRef(null);
  const startXRef = useRef(0);
  const currentPositionRef = useRef(0);
  const isDraggingRef = useRef(false);

  const handleStart = useCallback((clientX) => {
    if (verified || failed) return;
    isDraggingRef.current = true;
    setIsDragging(true);
    startXRef.current = clientX - currentPositionRef.current;
  }, [verified, failed]);

  const handleMove = useCallback((clientX) => {
    if (!isDraggingRef.current) return;

    const container = containerRef.current;
    if (!container) return;

    const maxMove = container.offsetWidth - 60;
    let newPosition = clientX - startXRef.current;
    newPosition = Math.max(0, Math.min(newPosition, maxMove));

    currentPositionRef.current = newPosition;
    setPosition(newPosition);
  }, []);

  const handleEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);

    const container = containerRef.current;
    if (!container) return;

    const maxMove = container.offsetWidth - 60;
    const currentPercent = (currentPositionRef.current / maxMove) * 100;

    // 验证是否滑动到最右边 (95%以上)
    if (currentPercent >= 95) {
      setVerified(true);
      // 自动吸附到最右边
      setPosition(maxMove);
      currentPositionRef.current = maxMove;
      if (onSuccess) {
        setTimeout(() => onSuccess(), 300);
      }
    } else {
      setFailed(true);
      if (onFail) {
        onFail();
      }
      setTimeout(() => {
        setPosition(0);
        currentPositionRef.current = 0;
        setFailed(false);
      }, 1000);
    }
  }, [onSuccess, onFail]);

  // 鼠标事件
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    handleStart(e.clientX);
  }, [handleStart]);

  // 触摸事件
  const handleTouchStart = useCallback((e) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      handleStart(e.touches[0].clientX);
    }
  }, [handleStart]);

  useEffect(() => {
    const onMouseMove = (e) => handleMove(e.clientX);
    const onTouchMove = (e) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX);
      }
    };
    const onEnd = () => handleEnd();

    if (isDragging) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onEnd);

      return () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onEnd);
      };
    }
  }, [isDragging, handleMove, handleEnd]);

  const reset = useCallback(() => {
    setPosition(0);
    currentPositionRef.current = 0;
    setVerified(false);
    setFailed(false);
    setIsDragging(false);
    isDraggingRef.current = false;
  }, []);

  // Expose reset method to parent component via ref
  useImperativeHandle(ref, () => ({
    reset
  }), [reset]);

  // 计算进度百分比用于显示
  const getProgressPercent = () => {
    const container = containerRef.current;
    if (!container) return 0;
    const maxMove = container.offsetWidth - 60;
    return Math.round((position / maxMove) * 100);
  };

  return (
    <div className="slider-captcha-container">
      {/* 滑块轨道 */}
      <div
        ref={containerRef}
        className={`slider-captcha-track ${verified ? 'verified' : ''} ${failed ? 'failed' : ''}`}
      >
        <div className="slider-captcha-bg-text">
          {verified ? '✓ 验证成功' : failed ? '✗ 请重试' : '向右滑动滑块完成验证'}
        </div>

        <div
          className="slider-captcha-progress"
          style={{ width: `${position}px` }}
        />

        <div
          ref={sliderRef}
          className={`slider-captcha-button ${isDragging ? 'dragging' : ''}`}
          style={{ left: `${position}px` }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <div className="slider-icon">
            {verified ? '✓' : failed ? '✗' : '››'}
          </div>
        </div>
      </div>

      <div className="captcha-hint">
        {isDragging ? `已滑动 ${getProgressPercent()}%` : '按住滑块，向右拖动至最右端'}
      </div>
    </div>
  );
});

export default SliderCaptcha;
