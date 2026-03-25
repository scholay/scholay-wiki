/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 *
 * RegisterForm - 邮箱 / 手机号注册（由 type 参数决定）
 */

import React, { useRef, useState, useEffect } from 'react';
import { Form, Input, Button, Checkbox } from 'antd';
import TurnstileCaptcha from '../TurnstileCaptcha';
import { useToast } from '../ToastContainer';
import { userAPI } from '../../services/api';

const RegisterForm = ({ type, identifier, config, onLoginSuccess, onModeChange, onShowPolicy }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState(config.enableTurnstile ? '' : 'disabled');
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const captchaRef = useRef(null);
  const { showError, showSuccess } = useToast();
  const isEmail = type === 'email';

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
      const res = isEmail
        ? await userAPI.sendVerificationCode(identifier, 'register')
        : await userAPI.sendPhoneCode(identifier, 'register');
      if (res.data.code === 0) {
        setCountdown(60);
        if (isEmail) showSuccess('验证码已发送');
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
      const res = isEmail
        ? await userAPI.register(identifier, values.password, values.code)
        : await userAPI.registerPhone(identifier, values.password, values.code);
      if (res.data.code === 0) {
        onLoginSuccess(res.data.data.token, res.data.data.user);
      } else {
        showError(res.data.message || '注册失败');
        form.setFieldValue('code', '');
        resetCaptcha();
      }
    } catch {
      showError('网络错误,请稍后重试');
      form.setFieldValue('code', '');
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const needCode = isEmail ? config.requireEmailVerification : true;

  return (
    <div className="auth-content">
      <div className="auth-headline">
        <h1 className="auth-title">注册 Scholay</h1>
        <p className="auth-subtitle">{isEmail ? '1 分钟完成，立即上手。' : '输入手机号 快速上手。'}</p>
      </div>

      <div className="auth-email-display">
        <span>{identifier}</span>
        <button type="button" className="auth-change-email" onClick={() => onModeChange('welcome')}>更换</button>
      </div>

      <Form form={form} onFinish={handleSubmit} layout="vertical" requiredMark={false}>
        <Form.Item name="password" rules={[
          { required: true, message: '请输入密码' },
          { min: 8, message: '密码长度至少8位' },
        ]}>
          <Input.Password placeholder="密码（至少8位）" size="large" autoFocus />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          dependencies={['password']}
          rules={[
            { required: true, message: '请确认密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password placeholder="确认密码" size="large" />
        </Form.Item>

        {needCode && (
          <div className="auth-code-group">
            <Form.Item name="code" noStyle rules={[{ required: true, message: '请输入验证码' }]}>
              <Input placeholder="验证码" maxLength={6} size="large" />
            </Form.Item>
            <Button size="large" onClick={handleSendCode} disabled={countdown > 0 || loading} style={{ minWidth: 80 }}>
              {countdown > 0 ? `${countdown}秒` : '发送'}
            </Button>
          </div>
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
            注册
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default RegisterForm;
