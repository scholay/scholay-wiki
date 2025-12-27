/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 * 
 * DeductConfirmPopover - 扣费确认气泡
 * 
 * 功能：
 * 1. 在按钮上方显示气泡确认提示
 * 2. 显示将要消耗的经费数量
 * 3. 支持确认和取消操作
 */

import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import ReactDOM from 'react-dom';
import GoldIcon from './GoldIcon';
import './styles/DeductConfirmPopover.css';

const DeductConfirmPopover = memo(({
  isOpen,
  onClose,
  onConfirm,
  amount = 0,
  balance = 0,
  anchorRef, // 锚点元素的 ref
  loading = false
}) => {
  const popoverRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // 计算气泡位置
  useEffect(() => {
    if (isOpen && anchorRef?.current && popoverRef.current) {
      const anchorRect = anchorRef.current.getBoundingClientRect();
      const popoverRect = popoverRef.current.getBoundingClientRect();
      
      // 气泡显示在按钮上方
      const top = anchorRect.top - popoverRect.height - 12;
      // 水平居中对齐
      const left = anchorRect.left + (anchorRect.width - popoverRect.width) / 2;
      
      setPosition({
        top: Math.max(10, top),
        left: Math.max(10, Math.min(left, window.innerWidth - popoverRect.width - 10))
      });
    }
  }, [isOpen, anchorRef]);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(e.target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose?.();
      }
    };

    // 延迟添加事件监听，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  // ESC 键关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleConfirm = useCallback(() => {
    if (loading) return;
    onConfirm?.();
  }, [onConfirm, loading]);

  if (!isOpen) return null;

  const isInsufficientBalance = balance < amount;

  return ReactDOM.createPortal(
    <div
      ref={popoverRef}
      className="deduct-popover"
      style={{ top: position.top, left: position.left }}
    >
      <div className="deduct-popover-arrow" />
      <div className="deduct-popover-content">
        <div className="deduct-popover-row">
          <span className="deduct-popover-label">本次消耗</span>
          <span className="deduct-popover-value">
            <GoldIcon size="sm" />
            <strong>{amount}</strong>
          </span>
        </div>
        
        {isInsufficientBalance && (
          <div className="deduct-popover-warning">
            余额不足（当前 {balance}）
          </div>
        )}

        <div className="deduct-popover-actions">
          <button
            className="deduct-popover-btn cancel"
            onClick={onClose}
            disabled={loading}
          >
            取消
          </button>
          <button
            className="deduct-popover-btn confirm"
            onClick={handleConfirm}
            disabled={loading || isInsufficientBalance}
          >
            {loading ? '处理中...' : '确认'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
});

DeductConfirmPopover.displayName = 'DeductConfirmPopover';

export default DeductConfirmPopover;

