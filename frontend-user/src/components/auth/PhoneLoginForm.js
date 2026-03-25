/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * PhoneLoginForm - 手机号登录（密码 / 验证码切换）
 */

import React, { useRef, useState, useEffect } from 'react';
import { Form, Input, Button, Checkbox } from 'antd';
import TurnstileCaptcha from '../TurnstileCaptcha';
import { useToast } from '../ToastContainer';
import { userAPI } from '../../services/api';

const PhoneLoginForm = ({ phone, config, onLoginSuccess, onModeChange, onShowPolicy }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [useCodeLogin, setUseCodeLogin] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState(config.enableTurnstile ? '' : 'disabled');
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const captchaRef = useRef(null);
  const { showError } = useToast();

  useEffect(() => {
    if (countdown > 0) {
      const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [countdown]);

  const resetCaptcha = () => {
    setTurnstileToken(config.enableTurnstile ? '' : 'disabled');
    captchaRef.current?.reset();
  };

  const handleSendCode = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      const res = await userAPI.sendPhoneCode(phone, 'login');
      if (res.data.code === 0) {
        setCountdown(60);
      } else {
        showError(res.data.message || '发送验证码失败');
      }
    } catch {
      showError('网络错误,请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values) => {
    if (config.enableTurnstile && !turnstileToken) {
      showError('请完成人机验证');
      return;
    }
    if (!agreedToPolicy) {
      showError('请阅读并同意使用条款和隐私政策');
      return;
    }

    setLoading(true);
    try {
      const isCode = useCodeLogin;
      const res = isCode
        ? await userAPI.loginPhoneWithCode(phone, values.code, turnstileToken)
        : await userAPI.loginPhone(phone, values.password);
      if (res.data.code === 0) {
        onLoginSuccess(res.data.data.token, res.data.data.user);
      } else {
        showError(res.data.message || '登录失败');
        if (isCode) form.setFieldValue('code', '');
        resetCaptcha();
      }
    } catch {
      showError('网络错误,请稍后重试');
      if (useCodeLogin) form.setFieldValue('code', '');
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const toggleCodeLogin = () => {
    form.resetFields();
    setUseCodeLogin((v) => !v);
  };

  return (
    <div className="auth-content">
      <div className="auth-headline">
        <h1 className="auth-title">使用手机登录</h1>
        <p className="auth-subtitle">密码或验证码皆可。</p>
      </div>

      <div className="auth-email-display">
        <span>{phone}</span>
        <button type="button" className="auth-change-email" onClick={() => onModeChange('welcome')}>更换</button>
      </div>

      <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false}>
        {!useCodeLogin ? (
          <>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password placeholder="密码" size="large" autoFocus />
            </Form.Item>
            <div className="auth-forgot-password">
              <Button type="link" size="small" onClick={toggleCodeLogin}>使用验证码</Button>
              <Button type="link" size="small" onClick={() => onModeChange('forgot-password-phone')}>忘记密码？</Button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-code-group">
              <Form.Item name="code" noStyle rules={[{ required: true, message: '请输入验证码' }]}>
                <Input placeholder="验证码" maxLength={6} size="large" autoFocus />
              </Form.Item>
              <Button size="large" onClick={handleSendCode} disabled={countdown > 0 || loading} style={{ minWidth: 80 }}>
                {countdown > 0 ? `${countdown}秒` : '发送'}
              </Button>
            </div>
            <div className="auth-forgot-password">
              <Button type="link" size="small" onClick={toggleCodeLogin}>使用密码</Button>
            </div>
          </>
        )}

        <Form.Item>
          <TurnstileCaptcha
            ref={captchaRef}
            onSuccess={setTurnstileToken}
            onFail={() => setTurnstileToken('')}
            onExpire={() => setTurnstileToken('')}
          />
        </Form.Item>

        <Form.Item>
          <Checkbox checked={agreedToPolicy} onChange={(e) => setAgreedToPolicy(e.target.checked)}>
            我已阅读并同意
            <Button type="link" size="small" onClick={() => onShowPolicy('terms')}>使用条款</Button>
            和
            <Button type="link" size="small" onClick={() => onShowPolicy('privacy')}>隐私政策</Button>
          </Checkbox>
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            disabled={(config.enableTurnstile && !turnstileToken) || !agreedToPolicy}
            block
            size="large"
          >
            登录
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default PhoneLoginForm;
