/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, type ChangeEvent, type FormEvent } from 'react';
import { adminAPI } from '../../services/api';
import { configAPI } from '../../../services/payment.api';
import { showToast } from '../../components/Toast';

interface TermsState {
  content: string;
  version: string;
}

const TermsTab = React.memo(() => {
  const [loading, setLoading] = useState<boolean>(false);
  const [termsOfService, setTermsOfService] = useState<TermsState>({ content: '', version: '' });

  const loadTermsOfService = useCallback(async () => {
    try {
      const response = await configAPI.getTermsOfService();
      if (response.data.code === 0 && response.data.data) {
        setTermsOfService({
          content: response.data.data.content || '',
          version: response.data.data.version || '',
        });
      }
    } catch (err) {
      console.error('Failed to load terms of service:', err);
    }
  }, []);

  useEffect(() => {
    loadTermsOfService();
  }, [loadTermsOfService]);

  const handleTermsOfServiceChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTermsOfService(prev => ({ ...prev, [name]: value }));
  };

  const handleTermsOfServiceSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await adminAPI.updateTermsOfService(
        termsOfService.content,
        termsOfService.version
      );
      if (response.data.code === 0) {
        showToast('用户协议已成功更新', 'success');
      } else {
        showToast(response.data.message || '更新失败', 'error');
      }
    } catch (err: any) { // [any#1] axios error shape
      showToast(err?.response?.data?.message || '更新失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-section fade-in">
      <div className="section-header">
        <h2>用户协议配置</h2>
        <p>编辑用户注册和登录时显示的用户协议内容,支持Markdown格式</p>
      </div>

      <form onSubmit={handleTermsOfServiceSubmit} className="settings-form">
        <div className="form-group">
          <label htmlFor="terms-version">版本号</label>
          <input type="text" id="terms-version" name="version" className="input"
            value={termsOfService.version} onChange={handleTermsOfServiceChange}
            placeholder="1.0" required />
          <small className="form-hint">更新版本号以标识新版本的用户协议</small>
        </div>

        <div className="form-group">
          <label htmlFor="terms-content">用户协议内容</label>
          <textarea id="terms-content" name="content" className="textarea"
            value={termsOfService.content} onChange={handleTermsOfServiceChange}
            rows={15} placeholder="请输入用户协议的详细内容...支持Markdown格式" required />
          <small className="form-hint">支持Markdown格式,用户端会以美化的格式展示</small>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (<><span className="spinner"></span><span className="text-gap-left">更新中...</span></>) : '更新用户协议'}
          </button>
        </div>
      </form>
    </div>
  );
});

TermsTab.displayName = 'TermsTab';

export default TermsTab;
