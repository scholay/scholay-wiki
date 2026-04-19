/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, type FormEvent } from 'react';
import SensitiveField from '../../components/SensitiveField';
import { adminAPI } from '../../services/api';
import { showToast } from '../../components/Toast';
import { useSettingsContext } from './SettingsContext';

interface AlipayConfig {
  id: number;
  app_id: string;
  private_key: string;
  alipay_public_key: string;
  notify_url: string;
  return_url?: string;
  is_sandbox: boolean;
  is_active: boolean;
}

interface AlipayForm {
  app_id: string;
  private_key: string;
  alipay_public_key: string;
  notify_url: string;
  return_url: string;
  is_sandbox: boolean;
  is_active: boolean;
}

const AlipayTab = React.memo(() => {
  const { isVerified, verifyEpoch, onRequestVerify } = useSettingsContext();

  const [loading, setLoading] = useState<boolean>(false);
  const [alipayConfigs, setAlipayConfigs] = useState<AlipayConfig[]>([]);
  const [showAlipayModal, setShowAlipayModal] = useState<boolean>(false);
  const [editingAlipay, setEditingAlipay] = useState<AlipayConfig | null>(null);
  const [alipayForm, setAlipayForm] = useState<AlipayForm>({
    app_id: '',
    private_key: '',
    alipay_public_key: '',
    notify_url: '',
    return_url: '',
    is_sandbox: false,
    is_active: false,
  });

  const loadAlipayConfigs = useCallback(async (showSensitive: boolean) => {
    setLoading(true);
    try {
      const response = await adminAPI.getAlipayConfigs(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        setAlipayConfigs(response.data.data || []);
      }
    } catch (err) {
      showToast('加载支付宝配置失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlipayConfigs(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  const handleCreateAlipay = () => {
    setEditingAlipay(null);
    setAlipayForm({
      app_id: '',
      private_key: '',
      alipay_public_key: '',
      notify_url: `${window.location.origin}/api/v1/payment/alipay/notify`,
      return_url: `${window.location.origin}/orders`,
      is_sandbox: false,
      is_active: false,
    });
    setShowAlipayModal(true);
  };

  const handleEditAlipay = (config: AlipayConfig) => {
    setEditingAlipay(config);
    setAlipayForm({
      app_id: config.app_id,
      private_key: config.private_key === '********' ? '' : config.private_key,
      alipay_public_key: config.alipay_public_key === '********' ? '' : config.alipay_public_key,
      notify_url: config.notify_url,
      return_url: config.return_url || '',
      is_sandbox: config.is_sandbox,
      is_active: config.is_active,
    });
    setShowAlipayModal(true);
  };

  const handleSubmitAlipay = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      let response;
      if (editingAlipay) {
        const updateData: Partial<AlipayForm> = { ...alipayForm };
        if (!updateData.private_key) delete updateData.private_key;
        if (!updateData.alipay_public_key) delete updateData.alipay_public_key;
        response = await adminAPI.updateAlipayConfig(editingAlipay.id, updateData);
      } else {
        response = await adminAPI.createAlipayConfig(alipayForm);
      }
      if (response.data.code === 0) {
        showToast(editingAlipay ? '更新成功' : '创建成功', 'success');
        setShowAlipayModal(false);
        loadAlipayConfigs(isVerified);
      } else {
        showToast(response.data.message || '操作失败', 'error');
      }
    } catch (err: any) { // [any#1] axios error shape
      showToast(err?.response?.data?.message || '操作失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAlipay = async (id: number) => {
    if (!window.confirm('确认删除此配置？')) return;
    try {
      const response = await adminAPI.deleteAlipayConfig(id);
      if (response.data.code === 0) {
        showToast('删除成功', 'success');
        loadAlipayConfigs(isVerified);
      } else {
        showToast(response.data.message || '删除失败', 'error');
      }
    } catch (err) {
      showToast('删除失败', 'error');
    }
  };

  const handleActivateAlipay = async (id: number) => {
    try {
      const response = await adminAPI.activateAlipayConfig(id);
      if (response.data.code === 0) {
        showToast('激活成功', 'success');
        loadAlipayConfigs(isVerified);
      } else {
        showToast(response.data.message || '激活失败', 'error');
      }
    } catch (err) {
      showToast('激活失败', 'error');
    }
  };

  return (
    <div className="settings-section fade-in">
      <div className="section-header">
        <h2>支付宝配置</h2>
        <p>管理支付宝支付配置</p>
        <button className="btn btn-primary" onClick={handleCreateAlipay}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className="icon-inline">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/>
          </svg>
          添加配置
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <span className="spinner"></span>
          <span>加载中...</span>
        </div>
      ) : alipayConfigs.length === 0 ? (
        <div className="no-config-state">
          <svg width="64" height="64" viewBox="0 0 20 20" fill="currentColor" className="empty-icon">
            <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
            <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/>
          </svg>
          <p>暂无支付宝配置</p>
        </div>
      ) : (
        <div className="config-cards">
          {alipayConfigs.map((config) => (
            <div key={config.id} className={`config-card ${config.is_active ? 'active' : ''}`}>
              <div className="card-header">
                <h3>支付宝配置 #{config.id}</h3>
                {config.is_active && <span className="badge badge-success">已激活</span>}
                {config.is_sandbox && <span className="badge badge-warning">沙箱环境</span>}
              </div>
              <div className="card-body">
                <div className="config-row"><label>应用 ID:</label><span>{config.app_id}</span></div>
                <div className="config-row">
                  <label>应用私钥:</label>
                  <SensitiveField value={config.private_key} isVerified={isVerified} onRequestVerify={onRequestVerify} />
                </div>
                <div className="config-row">
                  <label>支付宝公钥:</label>
                  <SensitiveField value={config.alipay_public_key} isVerified={isVerified} onRequestVerify={onRequestVerify} />
                </div>
                <div className="config-row"><label>回调地址:</label><span>{config.notify_url}</span></div>
                {config.return_url && (
                  <div className="config-row"><label>返回地址:</label><span>{config.return_url}</span></div>
                )}
              </div>
              <div className="card-actions">
                {!config.is_active && (
                  <button className="btn btn-success btn-sm" onClick={() => handleActivateAlipay(config.id)}>激活</button>
                )}
                <button className="btn btn-outline btn-sm" onClick={() => handleEditAlipay(config)}>编辑</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteAlipay(config.id)}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAlipayModal && (
        <div className="modal-overlay" onClick={() => setShowAlipayModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingAlipay ? '编辑支付宝配置' : '添加支付宝配置'}</h3>
              <button className="modal-close" onClick={() => setShowAlipayModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmitAlipay}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="app_id">应用 ID *</label>
                  <input type="text" id="app_id" className="input" value={alipayForm.app_id}
                    onChange={(e) => setAlipayForm({ ...alipayForm, app_id: e.target.value })}
                    placeholder="输入支付宝应用 ID" required />
                </div>
                <div className="form-group">
                  <label htmlFor="private_key">应用私钥 {editingAlipay && '(留空不修改)'}</label>
                  <textarea id="private_key" className="input" rows={4} value={alipayForm.private_key}
                    onChange={(e) => setAlipayForm({ ...alipayForm, private_key: e.target.value })}
                    placeholder="输入应用私钥" required={!editingAlipay} />
                </div>
                <div className="form-group">
                  <label htmlFor="alipay_public_key">支付宝公钥 {editingAlipay && '(留空不修改)'}</label>
                  <textarea id="alipay_public_key" className="input" rows={4} value={alipayForm.alipay_public_key}
                    onChange={(e) => setAlipayForm({ ...alipayForm, alipay_public_key: e.target.value })}
                    placeholder="输入支付宝公钥" required={!editingAlipay} />
                </div>
                <div className="form-group">
                  <label htmlFor="notify_url">回调地址 *</label>
                  <input type="text" id="notify_url" className="input" value={alipayForm.notify_url}
                    onChange={(e) => setAlipayForm({ ...alipayForm, notify_url: e.target.value })}
                    placeholder="支付回调地址" required />
                </div>
                <div className="form-group">
                  <label htmlFor="return_url">返回地址</label>
                  <input type="text" id="return_url" className="input" value={alipayForm.return_url}
                    onChange={(e) => setAlipayForm({ ...alipayForm, return_url: e.target.value })}
                    placeholder="支付完成后的返回地址" />
                </div>
                <div className="form-group">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={alipayForm.is_sandbox}
                      onChange={(e) => setAlipayForm({ ...alipayForm, is_sandbox: e.target.checked })} />
                    <span>沙箱环境</span>
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowAlipayModal(false)}>取消</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
});

AlipayTab.displayName = 'AlipayTab';

export default AlipayTab;
