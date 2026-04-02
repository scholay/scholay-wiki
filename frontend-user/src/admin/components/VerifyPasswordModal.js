/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState } from 'react';
import { adminAPI } from '../services/api';
import { showToast } from './Toast';
import './VerifyPasswordModal.css';

/**
 * 二次验证密码模态框
 * 用于查看敏感信息前验证管理员身份
 */
const VerifyPasswordModal = ({ isOpen, onClose, onVerified }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!password.trim()) {
      showToast('请输入密码', 'error');
      return;
    }

    setLoading(true);

    try {
      // 验证密码（使用修改密码接口，传入相同的旧密码和新密码作为验证）
      const response = await adminAPI.verifyPassword(password);

      if (response.data.code === 0) {
        showToast('验证成功', 'success');
        setPassword('');
        onVerified();
        onClose();
      } else {
        showToast(response.data.message || '密码错误', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.message || '验证失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="verify-password-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-icon-warning">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1v6m0 6v6m0 0h.01M12 21a9 9 0 110-18 9 9 0 010 18z"/>
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v4m0 4h.01"/>
            </svg>
          </div>
          <h3>安全验证</h3>
          <p>查看敏感信息需要验证您的管理员密码</p>
          <button onClick={handleClose} className="modal-close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="verify-password">管理员密码</label>
            <input
              type="password"
              id="verify-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入管理员密码"
              autoFocus
              required
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={handleClose}
              className="btn btn-secondary"
              disabled={loading}
            >
              取消
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  <span className="ml-1">验证中...</span>
                </>
              ) : (
                '验证并查看'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VerifyPasswordModal;
