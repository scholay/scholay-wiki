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

interface SystemConfigState {
  requireEmailVerification: boolean;
  enableTurnstile: boolean;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  turnstileHasSecret?: boolean;
}

const SystemTab = React.memo(() => {
  const { isVerified, verifyEpoch, onRequestVerify } = useSettingsContext();

  const [loading, setLoading] = useState<boolean>(false);
  const [systemConfig, setSystemConfig] = useState<SystemConfigState>({
    requireEmailVerification: true,
    enableTurnstile: false,
    turnstileSiteKey: '',
    turnstileSecretKey: '',
  });

  const loadSystemConfig = useCallback(async (showSensitive: boolean) => {
    try {
      const response = await adminAPI.getSystemConfig(showSensitive);
      if (response.data.code === 0 && response.data.data) {
        const d = response.data.data;
        setSystemConfig(prev => ({
          ...prev,
          requireEmailVerification: d.require_email_verification ?? true,
          enableTurnstile: d.enable_turnstile ?? false,
          turnstileSiteKey: d.turnstile_site_key ?? '',
          ...(showSensitive
            ? { turnstileSecretKey: d.turnstile_secret_key ?? '' }
            : { turnstileSecretKey: '' }),
          turnstileHasSecret: !!(d.turnstile_secret_key && d.turnstile_secret_key !== ''),
        }));
      }
    } catch (err) {
      console.error('Failed to load system config:', err);
    }
  }, []);

  useEffect(() => {
    loadSystemConfig(isVerified);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifyEpoch]);

  const handleSystemConfigSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const updateData: Record<string, unknown> = {
        require_email_verification: systemConfig.requireEmailVerification,
        enable_turnstile: systemConfig.enableTurnstile,
        turnstile_site_key: systemConfig.turnstileSiteKey,
      };
      if (systemConfig.turnstileSecretKey) {
        updateData.turnstile_secret_key = systemConfig.turnstileSecretKey;
      }
      const response = await adminAPI.updateSystemConfig(updateData);
      if (response.data.code === 0) {
        showToast('系统配置已成功保存', 'success');
        loadSystemConfig(isVerified);
      } else {
        showToast(response.data.message || '保存失败', 'error');
      }
    } catch (err: any) { // [any#1] axios error shape
      showToast(err?.response?.data?.message || '保存失败，请稍后重试', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-section fade-in">
      <div className="section-header">
        <h2>系统配置</h2>
        <p>配置系统级别的功能设置</p>
      </div>

      <form onSubmit={handleSystemConfigSubmit} className="settings-form">
        <div className="form-group">
          <label className="toggle-label">
            <span className="toggle-label-text">
              <span className="toggle-title">邮箱验证码验证</span>
              <small className="form-hint">启用后，用户登录和注册时需要输入邮箱验证码</small>
            </span>
            <label className="switch">
              <input type="checkbox" checked={systemConfig.requireEmailVerification}
                onChange={(e) => setSystemConfig({ ...systemConfig, requireEmailVerification: e.target.checked })} />
              <span className="slider"></span>
            </label>
          </label>
        </div>

        <div className="divider"></div>

        <div className="form-group">
          <label className="toggle-label">
            <span className="toggle-label-text">
              <span className="toggle-title">Cloudflare Turnstile 人机验证</span>
              <small className="form-hint">启用后，用户登录和注册时需要通过 Turnstile 人机验证</small>
            </span>
            <label className="switch">
              <input type="checkbox" checked={systemConfig.enableTurnstile}
                onChange={(e) => setSystemConfig({ ...systemConfig, enableTurnstile: e.target.checked })} />
              <span className="slider"></span>
            </label>
          </label>
        </div>

        {systemConfig.enableTurnstile && (
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="turnstileSiteKey">Turnstile Site Key (公钥)</label>
              <input type="text" id="turnstileSiteKey" className="input"
                value={systemConfig.turnstileSiteKey}
                onChange={(e) => setSystemConfig({ ...systemConfig, turnstileSiteKey: e.target.value })}
                placeholder="1x00000000000000000000AA (测试密钥)" />
              <small className="form-hint">从 Cloudflare Turnstile 控制台获取</small>
            </div>
            <div className="form-group">
              <label htmlFor="turnstileSecretKey">Turnstile Secret Key (私钥)</label>
              {systemConfig.turnstileHasSecret && (
                <SensitiveField
                  value={isVerified ? systemConfig.turnstileSecretKey : '********'}
                  isVerified={isVerified} onRequestVerify={onRequestVerify} />
              )}
              <input type="password" id="turnstileSecretKey" className="input"
                value={systemConfig.turnstileSecretKey}
                onChange={(e) => setSystemConfig({ ...systemConfig, turnstileSecretKey: e.target.value })}
                placeholder={systemConfig.turnstileHasSecret ? '留空则不修改现有密钥' : '1x0000000000000000000000000000000AA (测试密钥)'} />
              <small className="form-hint">从 Cloudflare Turnstile 控制台获取</small>
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (<><span className="spinner"></span><span className="text-gap-left">保存中...</span></>) : '保存配置'}
          </button>
        </div>
      </form>
    </div>
  );
});

SystemTab.displayName = 'SystemTab';

export default SystemTab;
